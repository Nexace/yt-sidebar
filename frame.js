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

  // URL of what's loaded in the player (song + playlist), falling back to the page
  // URL. page.js answers the query synchronously via a DOM attribute.
  function media() {
    window.dispatchEvent(new CustomEvent('ytsb-query'));
    const m = document.documentElement.dataset.ytsbMedia;
    if (!m) return { url: location.href, vid: new URL(location.href).searchParams.get('v') };
    const { v, list } = JSON.parse(m);
    const u = new URL('/watch', location.origin);
    u.searchParams.set('v', v);
    if (list) u.searchParams.set('list', list);
    return { url: u.toString(), vid: v };
  }

  // syncing: the panel is taking over from the background player — stay muted
  //          (including any ad) so the two never play audibly at the same time.
  // holding: this is the background standby copy — stay paused and muted.
  // Ads can't be skipped, so a standby copy lets a pre-roll run (muted) and only
  // pauses once the song itself is loaded. A seek asked for during an ad is applied
  // when the song starts, advanced by the time spent on the ad.
  let syncing = false, holding = false, pendingSeek = null;
  const adShowing = () => !!document.querySelector('.ad-showing');
  // page.js performs the seek via the player API (MAIN world).
  const apiSeek = time => window.dispatchEvent(new CustomEvent('ytsb-seek', { detail: time }));
  const seekTo = time => {
    if (time == null) return;
    if (adShowing()) pendingSeek = { time, at: Date.now() };
    else apiSeek(time);
  };
  const applyPendingSeek = () => {
    if (!pendingSeek || adShowing()) return;
    apiSeek(pendingSeek.time + (Date.now() - pendingSeek.at) / 1000);
    pendingSeek = null;
  };
  const holdMute = e => {
    const v = e.target;
    if (!(v instanceof HTMLMediaElement)) return;
    if (syncing || holding) v.muted = true;
    if (e.type === 'playing') applyPendingSeek(); // the song (not an ad) is really running
    if (e.type === 'play' && holding && !adShowing()) v.pause();
  };
  for (const t of ['play', 'playing', 'loadedmetadata']) document.addEventListener(t, holdMute, true);

  function report() {
    const v = video();
    const meta = navigator.mediaSession?.metadata;
    const title = meta?.title ? `${meta.title}${meta.artist ? ' — ' + meta.artist : ''}` : document.title;
    const { url, vid } = media();
    parent.postMessage({ ytSidebarState: {
      url,
      vid,
      ad: !!document.querySelector('.ad-showing'),
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
  for (const t of ['play', 'playing', 'pause', 'ended', 'seeked', 'loadedmetadata', 'ratechange']) {
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
    const { ytSidebar: cmd, quality, time } = e.data;
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
        // Player API lives in the page's JS world; page.js (MAIN world) applies it.
        window.dispatchEvent(new CustomEvent('ytsb-quality', { detail: quality }));
        return;
      case 'sync-start':
        syncing = true;
        if (v) v.muted = true;
        return;
      case 'hold':
        holding = true;
        if (v) { v.muted = true; applyPendingSeek(); if (!adShowing()) v.pause(); }
        return;
      case 'seek':
        seekTo(time);
        return;
      case 'sync-finish':
        syncing = false;
        holding = false;
        if (v) {
          seekTo(time);
          v.muted = false;
          v.play().catch(() => {});
        }
        break;
      case 'report':
        break;
    }
    setTimeout(report, 300);
  });

  report();
})();
