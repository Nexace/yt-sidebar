// Hidden background player. Loads the panel's last page at the handed-off time,
// plays it at the lowest quality, and relays reports to the service worker.
const frame = document.getElementById('frame');
frame.src = new URLSearchParams(location.search).get('src');

let live = null, sawPlaying = false, qualitySet = false;
const send = (cmd, extra) => frame.contentWindow?.postMessage({ ytSidebar: cmd, ...extra }, '*');

addEventListener('message', e => {
  if (e.source !== frame.contentWindow || !e.data?.ytSidebarState) return;
  live = e.data.ytSidebarState;
  if (!qualitySet) { qualitySet = true; send('quality', { quality: 'tiny' }); } // nobody sees the video
  if (live.playing) sawPlaying = true;
  else if (!sawPlaying) send('play'); // keep nudging until playback actually starts
  chrome.runtime.sendMessage({ type: 'bgState', state: live });
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'bgQuery') reply(live);
});
