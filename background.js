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
// A closed side panel is destroyed, so playback would stop. Each open panel holds a
// port to us and streams its playback state; when the port drops (panel closed)
// while playing, we continue in an offscreen document. When a panel opens again it
// `peek`s at the background position, loads the same song muted, and once it is
// actually playing it seeks to the background position and asks us to `release`
// the background player — so reopening has no silent gap.

// Serialize start/stop so a quick close→reopen can't leave both playing.
let chain = Promise.resolve();
const serial = fn => (chain = chain.then(fn, fn));

// The panel's latest state is kept in session storage too, so a close event that
// wakes a freshly restarted worker still knows what was playing.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'panel') return;
  port.onMessage.addListener(msg => {
    if (msg.type === 'state') chrome.storage.session.set({ panelState: msg.state });
  });
  port.onDisconnect.addListener(() => serial(() => panelClosed('port')));
});
// Official signal for the real side panel closing (Chromium 141+).
chrome.sidePanel.onClosed?.addListener(() => serial(() => panelClosed('onClosed')));

async function panelClosed(via) {
  const { panelState: s } = await chrome.storage.session.get('panelState');
  console.log('[yt-sidebar] panel closed via', via, '— playing:', !!s?.playing);
  if (!s?.playing) return;
  // Consume it so the second close signal (or a late one) doesn't start it again.
  await chrome.storage.session.set({ panelState: { ...s, playing: false } });
  await startBackground(s);
}

async function startBackground(s) {
  if (await chrome.offscreen.hasDocument()) return;
  console.log('[yt-sidebar] starting background player for', s.url);
  const p = posNow(s);
  // Where it started, for peeks that arrive before the player's first report.
  await chrome.storage.session.set({ bg: { app: s.app, url: p.url, time: p.time, rate: 1, playing: true, at: Date.now() } });
  await chrome.offscreen.createDocument({
    url: 'player.html?src=' + encodeURIComponent(withTime(p.url, p.time)),
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Keep YouTube audio playing after the side panel is closed.'
  });
}

// Current background position (without stopping it), or null if none is running.
async function peek() {
  if (!(await chrome.offscreen.hasDocument())) return null;
  const [r, { bg }] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'bgQuery' }).catch(() => null),
    chrome.storage.session.get('bg')
  ]);
  const src = r || bg;
  if (!src || !bg) return null;
  return { app: bg.app, ...posNow(src), playing: src.playing };
}

async function release() {
  if (!(await chrome.offscreen.hasDocument())) return;
  await chrome.offscreen.closeDocument();
  console.log('[yt-sidebar] background player released to panel');
}

// While playing in the background, keep the saved position current so it survives
// the offscreen document closing on its own (Chrome closes it ~30s after audio stops).
async function persistBg(r) {
  const [{ state }, { bg }] = await Promise.all([
    chrome.storage.local.get('state'), chrome.storage.session.get('bg')
  ]);
  if (!state || !bg) return;
  state.app = bg.app;
  state.pos = { ...state.pos, [bg.app]: posNow(r) };
  await chrome.storage.local.set({ state });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'peek') { serial(peek).then(reply); return true; }
  if (msg.type === 'release') { serial(release).then(() => reply()); return true; }
  if (msg.type === 'bgState') persistBg(msg.state);
});
