// Runs inside YouTube pages. Only activates when framed by this extension's panel,
// so normal YouTube tabs pay nothing beyond this first check.
(() => {
  const parentOrigin = 'chrome-extension://' + chrome.runtime.id;
  if (window.top === window || location.ancestorOrigins?.[0] !== parentOrigin) return;

  const video = () => document.querySelector('video');
  const click = sels => {
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) { el.click(); return true; }
    }
    return false;
  };

  function report() {
    const v = video();
    const meta = navigator.mediaSession?.metadata;
    const title = meta?.title ? `${meta.title}${meta.artist ? ' — ' + meta.artist : ''}` : document.title;
    parent.postMessage({ ytSidebarState: {
      url: location.href,
      time: v ? v.currentTime : 0,
      rate: v ? v.playbackRate : 1,
      playing: v ? !v.paused : false,
      title,
      at: Date.now()
    } }, parentOrigin);
  }

  // Event-driven: media events don't bubble, but capture on document sees them all,
  // including when YouTube swaps the <video> element. No polling while paused.
  let heartbeat = 0;
  const onMedia = e => {
    if (e.type === 'play') {
      clearInterval(heartbeat);
      heartbeat = setInterval(report, 30000); // panel extrapolates in between
    } else if (e.type === 'pause' || e.type === 'ended') {
      clearInterval(heartbeat);
    }
    // Metadata/title are set slightly after the media event fires.
    setTimeout(report, e.type === 'loadedmetadata' ? 800 : 0);
  };
  for (const t of ['play', 'pause', 'ended', 'seeked', 'loadedmetadata', 'ratechange']) {
    document.addEventListener(t, onMedia, true);
  }
  // Lets the panel auto-hide when focus leaves this frame for the web page.
  addEventListener('blur', () => parent.postMessage({ ytSidebarBlur: true }, parentOrigin));

  // YouTube is a SPA: catch page changes that don't start a new video.
  document.addEventListener('yt-navigate-finish', () => setTimeout(report, 300));
  addEventListener('popstate', () => setTimeout(report, 300));

  addEventListener('message', e => {
    if (e.origin !== parentOrigin || !e.data?.ytSidebar) return;
    const v = video();
    const { ytSidebar: cmd, quality } = e.data;
    switch (cmd) {
      case 'toggle':
        if (v) v.paused ? v.play() : v.pause();
        break;
      case 'play':
        v?.play().catch(() => {});
        break;
      case 'pause':
        v?.pause();
        break;
      case 'next':
        click(['.next-button', '.ytp-next-button']);
        break;
      case 'prev':
        if (v && v.currentTime > 3) v.currentTime = 0;
        else if (!click(['.previous-button', '.ytp-prev-button'])) history.back();
        break;
      case 'quality':
        // Player API lives in the page's JS world; quality.js (MAIN world) applies it.
        window.dispatchEvent(new CustomEvent('ytsb-quality', { detail: quality }));
        return;
      case 'report':
        break;
    }
    setTimeout(report, 300);
  });

  report();
})();
