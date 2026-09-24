// Runs inside YouTube pages. Only activates when framed by this extension's panel.
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
      playing: v ? !v.paused : false,
      title
    } }, parentOrigin);
  }
  setInterval(report, 2000);

  addEventListener('message', e => {
    if (e.origin !== parentOrigin || !e.data?.ytSidebar) return;
    const v = video();
    switch (e.data.ytSidebar) {
      case 'toggle':
        if (v) v.paused ? v.play() : v.pause();
        break;
      case 'next':
        click(['.next-button', '.ytp-next-button']);
        break;
      case 'prev':
        if (v && v.currentTime > 3) v.currentTime = 0;
        else click(['.previous-button', '.ytp-prev-button']) || history.back();
        break;
    }
    setTimeout(report, 300);
  });
})();
