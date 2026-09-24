const HOME = { music: 'https://music.youtube.com/', yt: 'https://www.youtube.com/' };
const SLEEP_AFTER_MS = 10 * 60 * 1000; // minimized + not playing for this long → unload
const $ = id => document.getElementById(id);
const frame = $('frame'), now = $('now'), sleepBox = $('sleep'), qualitySel = $('quality');

// { app, minimized, quality, pos: { music: {url, time}, yt: {url, time} } }
let state = { app: 'music', minimized: false, quality: 'auto', pos: {} };
let live = null;        // latest report from frame.js
let asleep = false;
let qualitySent = null; // quality last sent to the current frame document
let saveTimer = 0, sleepTimer = 0;
let resumePlay = false; // continue playing after a handoff from the background player
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
    port?.postMessage({ type: 'state', state: live && !asleep ? { app: state.app, ...live } : { playing: false } });
  } catch {}
}

// Position right now, extrapolated from the last report (frame only reports on
// events + every 30s while playing, so we don't need it to poll).
function currentPos() {
  return live ? posNow(live) : state.pos[state.app];
}

function saveNow() {
  clearTimeout(saveTimer);
  if (!asleep) {
    const p = currentPos();
    if (p) state.pos[state.app] = p;
  }
  chrome.storage.local.set({ state });
}
// Coalesce bursts (e.g. seeked + play) into one write.
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 1000); };

function effectiveQuality() {
  // Minimized means audio-only listening: drop to the lowest video quality.
  return state.minimized ? 'tiny' : state.quality;
}

function sendQuality(force) {
  const q = effectiveQuality();
  if (!live || (!force && q === qualitySent)) return;
  send('quality', { quality: q });
  qualitySent = q;
}

function load(app) {
  if (!asleep && live) state.pos[state.app] = currentPos();
  state.app = app;
  live = null;
  qualitySent = null;
  setAsleep(false);
  const p = state.pos[app];
  frame.src = p ? withTime(p.url, p.time) : HOME[app];
  document.querySelectorAll('#tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.app === app));
  now.textContent = '';
  saveNow();
}

function setAsleep(on) {
  asleep = on;
  sleepBox.hidden = !on;
  frame.hidden = on;
  if (on) now.textContent = '💤 Unloaded to save memory — ⏯ to resume';
}

function sleep() {
  if (asleep) return;
  saveNow();
  live = null;
  frame.src = 'about:blank'; // frees the whole YouTube page
  setAsleep(true);
  pushState();
}

function scheduleSleep() {
  clearTimeout(sleepTimer);
  if (!asleep && state.minimized && !live?.playing) sleepTimer = setTimeout(sleep, SLEEP_AFTER_MS);
}

function setMin(m) {
  state.minimized = m;
  document.body.classList.toggle('min', m);
  sendQuality();
  scheduleSleep();
}

const send = (cmd, extra) => frame.contentWindow?.postMessage({ ytSidebar: cmd, ...extra }, '*');

// Reports from frame.js inside the YouTube iframe.
addEventListener('message', e => {
  if (e.source !== frame.contentWindow || !e.data?.ytSidebarState) return;
  const first = !live;
  live = e.data.ytSidebarState;
  if (first) sendQuality(true); // fresh frame document starts at 'auto'
  if (live.playing) resumePlay = false;
  else if (resumePlay) send('play');
  now.textContent = (live.playing ? '▶ ' : '⏸ ') + (live.title || '');
  now.title = live.title || '';
  scheduleSleep();
  save();
  pushState();
});

addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => document.hidden && saveNow());

document.querySelectorAll('#tabs button').forEach(b =>
  b.addEventListener('click', () => b.dataset.app !== state.app && load(b.dataset.app)));
$('play').onclick = () => { resumePlay = false; asleep ? load(state.app) : send('toggle'); };
$('next').onclick = () => send('next');
$('prev').onclick = () => send('prev');
$('reload').onclick = () => load(state.app);
$('popout').onclick = () => {
  const p = asleep ? state.pos[state.app] : currentPos();
  const url = p ? withTime(p.url, p.time) : HOME[state.app];
  resumePlay = false;
  if (!asleep) send('pause'); // hand playback over to the tab, don't double up audio
  chrome.tabs.create({ url });
};
$('resume').onclick = () => load(state.app);
$('min').onclick = () => { setMin(!state.minimized); saveNow(); };
qualitySel.onchange = () => { state.quality = qualitySel.value; sendQuality(); saveNow(); };

// Take playback back from the background player (if the panel was closed while
// playing) before loading, so we resume from where it actually is now.
Promise.all([
  chrome.storage.local.get('state'),
  chrome.runtime.sendMessage({ type: 'handoff' }).catch(() => null)
]).then(([{ state: saved }, bg]) => {
  if (saved) state = { ...state, ...saved, pos: saved.pos || {} };
  if (bg?.url && bg.app) {
    state.app = bg.app;
    state.pos[bg.app] = { url: bg.url, time: bg.time };
    resumePlay = bg.playing;
  }
  qualitySel.value = state.quality;
  setMin(state.minimized);
  load(state.app);
  connect();
});
