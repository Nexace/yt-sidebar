const HOME = { music: 'https://music.youtube.com/', yt: 'https://www.youtube.com/' };
const frame = document.getElementById('frame');
const now = document.getElementById('now');

// Per-app last position: { app, minimized, pos: { music: {url, time}, yt: {url, time} } }
let state = { app: 'music', minimized: false, pos: {} };
let live = null; // latest {url, time, title, playing} reported by the frame

const save = () => chrome.storage.local.set({ state });

function withTime(url, time) {
  if (!time || !/[?&]v=/.test(url)) return url;
  const u = new URL(url);
  u.searchParams.set('t', Math.floor(time) + 's');
  return u.toString();
}

function load(app) {
  if (live && state.app) state.pos[state.app] = { url: live.url, time: live.time };
  state.app = app;
  live = null;
  const p = state.pos[app];
  frame.src = p ? withTime(p.url, p.time) : HOME[app];
  document.querySelectorAll('#tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.app === app));
  save();
}

function setMin(m) {
  state.minimized = m;
  document.body.classList.toggle('min', m);
  save();
}

const send = cmd => frame.contentWindow?.postMessage({ ytSidebar: cmd }, '*');

// Reports from frame.js running inside the YouTube iframe.
addEventListener('message', e => {
  if (e.source !== frame.contentWindow || !e.data?.ytSidebarState) return;
  live = e.data.ytSidebarState;
  state.pos[state.app] = { url: live.url, time: live.time };
  now.textContent = (live.playing ? '▶ ' : '⏸ ') + (live.title || '');
  now.title = live.title || '';
});

setInterval(() => { if (live) save(); }, 5000);
addEventListener('pagehide', save);

document.querySelectorAll('#tabs button').forEach(b =>
  b.addEventListener('click', () => b.dataset.app !== state.app && load(b.dataset.app)));
document.getElementById('play').onclick = () => send('toggle');
document.getElementById('next').onclick = () => send('next');
document.getElementById('prev').onclick = () => send('prev');
document.getElementById('reload').onclick = () => load(state.app);
document.getElementById('min').onclick = () => setMin(!state.minimized);

chrome.storage.local.get('state').then(({ state: saved }) => {
  if (saved) state = { ...state, ...saved, pos: saved.pos || {} };
  setMin(state.minimized);
  load(state.app);
});
