const HOME = { music: 'https://music.youtube.com/', yt: 'https://www.youtube.com/' };
const $ = id => document.getElementById(id);
const frame = $('frame'), qualitySel = $('quality');

// { app, quality, pinned, instant, pos: { music: {url, time}, yt: {url, time} } }
let state = { app: 'music', quality: 'auto', instant: true, pos: {} };
let live = null;        // latest report from frame.js
let qualitySent = null; // quality last sent to the current frame document
let saveTimer = 0;
let resumePlay = false; // keep nudging play until the frame starts (after a takeover)
let port = null;

// Keep a port open to the service worker and stream playback state over it. When
// this panel closes, the port drops and the worker continues playback offscreen.
function connect() {
  port = chrome.runtime.connect({ name: 'panel' });
  port.onDisconnect.addListener(() => setTimeout(connect, 100)); // worker restarted
  pushState();
}
function pushState() {
  try {
    const s = live ? { app: state.app, ...live } : { playing: false };
    port?.postMessage({ type: 'state', state: { ...s, instant: state.instant } });
  } catch {}
}

// Position right now, extrapolated from the last report (frame only reports on
// events + every 30s while playing, so we don't need it to poll).
function currentPos() {
  return live ? posNow(live) : state.pos[state.app];
}

function saveNow() {
  clearTimeout(saveTimer);
  const p = currentPos();
  if (p) state.pos[state.app] = p;
  chrome.storage.local.set({ state });
}
// Coalesce bursts (e.g. seeked + play) into one write.
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 1000); };

function sendQuality(force) {
  const q = state.quality;
  if (!live || (!force && q === qualitySent)) return;
  send('quality', { quality: q });
  qualitySent = q;
}

function load(app) {
  if (live) state.pos[state.app] = currentPos();
  state.app = app;
  live = null;
  qualitySent = null;
  const p = state.pos[app];
  frame.src = p ? withTime(p.url, p.time) : HOME[app];
  document.querySelectorAll('#tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.app === app));
  saveNow();
}

const send = (cmd, extra) => frame.contentWindow?.postMessage({ ytSidebar: cmd, ...extra }, '*');

// Seamless takeover from the background player: our frame loads the same song
// muted while the background keeps playing; once we're really playing (not an ad)
// we jump to the background's position, unmute, and release it. No silent gap.
let takeover = null;

function startTakeover(bg) {
  takeover = { vid: vidOf(bg.url), timer: setTimeout(finishTakeover, 20000) };
  resumePlay = true;
}

async function finishTakeover() {
  const t = takeover;
  if (!t) return;
  clearTimeout(t.timer);
  takeover = null;
  const bg = await chrome.runtime.sendMessage({ type: 'peek' }).catch(() => null);
  if (bg?.playing && live?.vid === t.vid && vidOf(bg.url) !== t.vid) {
    // The background moved on to the next song while we loaded: follow it.
    live = null;
    state.pos[state.app] = { url: bg.url, time: bg.time };
    startTakeover(bg);
    load(state.app);
    return;
  }
  const sameSong = bg?.playing && live?.vid && vidOf(bg.url) === live.vid;
  send('sync-finish', { time: sameSong ? bg.time + 0.15 : null });
  chrome.runtime.sendMessage({ type: 'release' }).catch(() => {});
}

// Reports from frame.js inside the YouTube iframe.
addEventListener('message', e => {
  if (e.source !== frame.contentWindow || !e.data?.ytSidebarState) return;
  const first = !live;
  live = e.data.ytSidebarState;
  if (first) sendQuality(true); // fresh frame document starts at 'auto'
  if (live.playing) resumePlay = false;
  else if (resumePlay) send('play');
  if (takeover) {
    send('sync-start'); // idempotent; keeps the frame muted until we take over
    if (live.playing && !live.ad) finishTakeover();
  }
  save();
  pushState();
});

// Auto-hide: close the panel when you click anywhere else in the browser. Playback
// continues in the background player. Not when focus moved into our own YouTube
// frame (document still has focus) or to another app (browser window unfocused).
let windowId;
chrome.windows.getCurrent().then(w => { windowId = w.id; });
const maybeHide = () => setTimeout(async () => {
  if (state.pinned || document.hasFocus() || windowId == null) return;
  const w = await chrome.windows.get(windowId).catch(() => null);
  if (w?.focused) chrome.sidePanel.close?.({ windowId }).catch(() => {});
}, 50);
addEventListener('blur', maybeHide);
// Focus inside the YouTube frame doesn't blur us when it leaves; frame.js tells us.
addEventListener('message', e => {
  if (e.source === frame.contentWindow && e.data?.ytSidebarBlur) maybeHide();
});

function setPinned(p) {
  state.pinned = p;
  $('pin').classList.toggle('active', p);
}

// Instant hide = the worker keeps a standby copy loaded while we play.
function setInstant(on) {
  state.instant = on;
  $('instant').classList.toggle('active', on);
  pushState();
}

addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => document.hidden && saveNow());

document.querySelectorAll('#tabs button').forEach(b =>
  b.addEventListener('click', () => b.dataset.app !== state.app && load(b.dataset.app)));
$('play').onclick = () => { resumePlay = false; send('toggle'); };
$('next').onclick = () => send('next');
$('prev').onclick = () => send('prev');
$('reload').onclick = () => load(state.app);
$('popout').onclick = () => {
  const p = currentPos();
  const url = p ? withTime(p.url, p.time) : HOME[state.app];
  resumePlay = false;
  send('pause'); // hand playback over to the tab, don't double up audio
  chrome.tabs.create({ url });
};
$('pin').onclick = () => { setPinned(!state.pinned); saveNow(); };
$('instant').onclick = () => { setInstant(!state.instant); saveNow(); };
qualitySel.onchange = () => { state.quality = qualitySel.value; sendQuality(); saveNow(); };

// If the background player is running (panel was closed while playing), load
// what it's playing and take over seamlessly; if it's paused, just stop it.
Promise.all([
  chrome.storage.local.get('state'),
  chrome.runtime.sendMessage({ type: 'peek' }).catch(() => null)
]).then(([{ state: saved }, bg]) => {
  if (saved) state = { ...state, ...saved, pos: saved.pos || {} };
  delete state.minimized; // removed setting
  if (bg?.url && bg.app) {
    state.app = bg.app;
    state.pos[bg.app] = { url: bg.url, time: bg.time };
    if (bg.playing) startTakeover(bg);
    else chrome.runtime.sendMessage({ type: 'release' }).catch(() => {});
  }
  qualitySel.value = state.quality;
  setPinned(!!state.pinned);
  setInstant(state.instant !== false);
  load(state.app);
  connect();
});
