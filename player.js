// Offscreen background player. Two modes:
//  - active:  plays while the side panel is closed; reports to the service worker.
//  - standby: holds a paused, muted copy of what the panel is playing, so hiding the
//             panel only needs a seek + play (no page load).
const params = new URLSearchParams(location.search);
const frame = document.getElementById('frame');
frame.src = params.get('src');
let mode = params.get('mode') || 'active';

let live = null, sawPlaying = false, qualitySet = false;
let panelPlaying = true, idleTimer = 0;
const send = (cmd, extra) => frame.contentWindow?.postMessage({ ytSidebar: cmd, ...extra }, '*');

// Nothing playing for a minute (paused in the background, or panel paused while
// we're on standby): ask the worker to close us and free the memory.
function armIdle(idle) {
  clearTimeout(idleTimer);
  if (idle) idleTimer = setTimeout(() => chrome.runtime.sendMessage({ type: 'bgIdle' }), 60000);
}

function reload(url, time) {
  live = null; qualitySet = false; sawPlaying = false;
  frame.src = withTime(url, time);
}

addEventListener('message', e => {
  if (e.source !== frame.contentWindow || !e.data?.ytSidebarState) return;
  live = e.data.ytSidebarState;
  if (!qualitySet) { qualitySet = true; send('quality', { quality: 'tiny' }); } // nobody sees the video
  if (mode === 'standby') { send('hold'); return; } // idempotent: stay paused + muted
  if (live.playing) sawPlaying = true;
  else if (!sawPlaying) send('play'); // keep nudging until playback actually starts
  armIdle(sawPlaying && !live.playing);
  chrome.runtime.sendMessage({ type: 'bgState', state: live });
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'bgQuery') return reply(live);
  if (msg.type !== 'bgCmd') return;
  switch (msg.cmd) {
    case 'activate': // panel hid: take over from `time`
      mode = 'active';
      armIdle(false);
      if (live?.vid && live.vid === vidOf(msg.url)) {
        sawPlaying = false;
        send('sync-finish', { time: msg.time }); // preloaded: seek + unmute + play
      } else {
        reload(msg.url, msg.time);
      }
      break;
    case 'standby': // panel took over again
      mode = 'standby';
      panelPlaying = true;
      armIdle(false);
      send('hold');
      break;
    case 'load': // panel moved to another song
      reload(msg.url, msg.time);
      break;
    case 'seek': // keep the buffer near the panel's position
      send('seek', { time: msg.time });
      break;
    case 'control': // global shortcut while playing in the background
      send(msg.action);
      break;
    case 'panel':
      panelPlaying = msg.playing;
      if (mode === 'standby') armIdle(!panelPlaying);
      break;
  }
});
