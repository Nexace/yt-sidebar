importScripts('shared.js');

// Clicking the toolbar icon (or Alt+Y) toggles the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// YouTube forbids being framed. Strip the anti-framing headers, but only for
// frames our own extension pages load, so normal YouTube tabs are untouched.
// Rules are built at runtime because the extension ID differs per browser/install.
async function installRules() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          { header: 'x-frame-options', operation: 'remove' },
          { header: 'content-security-policy', operation: 'remove' },
          { header: 'content-security-policy-report-only', operation: 'remove' }
        ]
      },
      condition: {
        requestDomains: ['youtube.com'],
        resourceTypes: ['sub_frame'],
        initiatorDomains: [chrome.runtime.id]
      }
    }]
  });
}

// Session rules are cleared on browser restart, so re-add them on every startup.
chrome.runtime.onInstalled.addListener(installRules);
chrome.runtime.onStartup.addListener(installRules);
installRules();

// --- Background playback -------------------------------------------------------
// A closed side panel is destroyed, so its playback would stop. One offscreen
// document (player.html) fills the gap, in one of two modes (session key `bg`):
//  - standby: while the panel plays, a paused + muted copy of the same song, kept
//             near the panel's position. Hiding the panel just seeks + plays it.
//  - active:  playing while the panel is closed. When the panel reopens it `peek`s,
//             loads the song muted, takes over at the exact position, then
//             `release`s us back to standby.
// Either way there's no silent gap. Idle for a minute → the player is closed.

// Serialize everything so quick close/reopen sequences can't race.
let chain = Promise.resolve();
const serial = fn => (chain = chain.then(fn, fn));

const getBg = async () => (await chrome.storage.session.get('bg')).bg;
const setBg = bg => chrome.storage.session.set({ bg });
const bgCmd = (cmd, extra) => chrome.runtime.sendMessage({ type: 'bgCmd', cmd, ...extra }).catch(() => {});

async function createPlayer(mode, s) {
  const p = posNow(s);
  console.log(`[yt-sidebar] creating ${mode} player for`, p.url);
  await setBg({ mode, app: s.app, url: p.url, vid: vidOf(p.url) });
  await chrome.offscreen.createDocument({
    url: `player.html?mode=${mode}&src=` + encodeURIComponent(withTime(p.url, p.time)),
    // IFRAME_SCRIPTING too: AUDIO_PLAYBACK alone gets a silent (standby) player
    // closed after ~30s. We close it ourselves when idle.
    reasons: ['AUDIO_PLAYBACK', 'IFRAME_SCRIPTING'],
    justification: 'Play YouTube audio while the side panel is closed, and keep the current song preloaded so hiding the panel has no gap.'
  });
}

// The panel streams its state over a port; the port dropping means it closed.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'panel') return;
  port.onMessage.addListener(msg => { if (msg.type === 'state') serial(() => onPanelState(msg.state)); });
  port.onDisconnect.addListener(() => serial(() => panelClosed('port')));
});
// Official signal for the real side panel closing (Chromium 141+).
chrome.sidePanel.onClosed?.addListener(() => serial(() => panelClosed('onClosed')));

// Keep the standby copy in step with what the panel is playing.
async function onPanelState(s) {
  // Kept in session storage so a close event that wakes a restarted worker knows it.
  await chrome.storage.session.set({ panelState: s });
  const has = await chrome.offscreen.hasDocument();
  const bg = has ? await getBg() : null;
  if (bg?.mode === 'active') return; // panel is taking over; it will release us
  if (s.instant === false) { // user turned instant hide off: no standby copy
    if (has) { await chrome.offscreen.closeDocument(); console.log('[yt-sidebar] instant hide off — standby closed'); }
    return;
  }
  if (!s.playing || !s.vid) { if (has) bgCmd('panel', { playing: false }); return; }
  if (s.ad) return;
  if (!has) return createPlayer('standby', s);
  bgCmd('panel', { playing: true });
  const p = posNow(s);
  if (bg?.vid !== s.vid) {
    await setBg({ mode: 'standby', app: s.app, url: p.url, vid: s.vid });
    bgCmd('load', { url: p.url, time: p.time });
  } else {
    bgCmd('seek', { time: p.time });
  }
}

async function panelClosed(via) {
  const { panelState: s } = await chrome.storage.session.get('panelState');
  console.log('[yt-sidebar] panel closed via', via, '— playing:', !!s?.playing);
  if (!s?.playing) return;
  // Consume it so the second close signal (or a late one) doesn't act again.
  await chrome.storage.session.set({ panelState: { ...s, playing: false } });
  const p = posNow(s);
  if (!(await chrome.offscreen.hasDocument())) return createPlayer('active', s);
  const bg = await getBg();
  if (bg?.mode === 'active') return;
  console.log('[yt-sidebar] activating standby', bg?.vid === vidOf(p.url) ? '(preloaded)' : '(different song, reloading)');
  await setBg({ mode: 'active', app: s.app, url: p.url, vid: vidOf(p.url) });
  bgCmd('activate', { url: p.url, time: p.time });
}

// Current background position (without stopping it), or null if nothing is
// playing in the background (none, or just a standby copy).
async function peek() {
  if (!(await chrome.offscreen.hasDocument())) return null;
  const bg = await getBg();
  if (bg?.mode !== 'active') return null;
  const r = await chrome.runtime.sendMessage({ type: 'bgQuery' }).catch(() => null);
  const src = r || { url: bg.url, time: 0, playing: true, at: Date.now() };
  return { app: bg.app, ...posNow(src), playing: src.playing };
}

// Panel has taken over: go back to being its standby copy (or close, if the
// user turned instant hide off).
async function release() {
  if (!(await chrome.offscreen.hasDocument())) return;
  const bg = await getBg();
  if (bg?.mode !== 'active') return;
  const { panelState } = await chrome.storage.session.get('panelState');
  if (panelState?.instant === false) {
    await chrome.offscreen.closeDocument();
    console.log('[yt-sidebar] panel took over; background player closed');
    return;
  }
  await setBg({ ...bg, mode: 'standby' });
  bgCmd('standby');
  console.log('[yt-sidebar] panel took over; background player back on standby');
}

// Player says nothing has played for a minute: free its memory.
async function idle() {
  if (!(await chrome.offscreen.hasDocument())) return;
  const [bg, { panelState }] = await Promise.all([getBg(), chrome.storage.session.get('panelState')]);
  if (bg?.mode === 'standby' && panelState?.playing) return; // panel resumed meanwhile
  await chrome.offscreen.closeDocument();
  console.log('[yt-sidebar] idle — background player closed');
}

// While playing in the background, keep the saved position current so it survives
// the player being closed.
async function persistBg(r) {
  const [{ state }, bg] = await Promise.all([chrome.storage.local.get('state'), getBg()]);
  if (!state || bg?.mode !== 'active') return;
  state.app = bg.app;
  state.pos = { ...state.pos, [bg.app]: posNow(r) };
  await chrome.storage.local.set({ state });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'peek') { serial(peek).then(reply); return true; }
  if (msg.type === 'release') { serial(release).then(() => reply()); return true; }
  if (msg.type === 'bgIdle') serial(idle);
  if (msg.type === 'bgState') persistBg(msg.state);
});
