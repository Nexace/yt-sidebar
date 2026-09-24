// Runs in YouTube's own JS world (needed to reach the player API).
// Only active inside this extension's frames (side panel / background player).
(() => {
  if (window.top === window || !location.ancestorOrigins?.[0]?.startsWith('chrome-extension://')) return;

  const player = () => document.getElementById('movie_player');

  // What's actually playing. The page URL isn't enough: YouTube Music plays songs
  // from the home page / player bar without navigating to /watch.
  // frame.js dispatches this synchronously and reads the result from the DOM.
  addEventListener('ytsb-query', () => {
    const p = player();
    const d = p?.getVideoData?.();
    document.documentElement.dataset.ytsbMedia = d?.video_id
      ? JSON.stringify({ v: d.video_id, list: p.getPlaylistId?.() || '' })
      : '';
  });

  // Quality cap.
  let wanted = 'auto';
  function apply() {
    const p = player();
    if (!p?.setPlaybackQualityRange) return;
    if (wanted === 'auto') p.setPlaybackQualityRange('auto', 'auto');
    else p.setPlaybackQualityRange(wanted, wanted);
    p.setPlaybackQuality?.(wanted);
  }
  addEventListener('ytsb-quality', e => { wanted = e.detail || 'auto'; apply(); });
  // New videos reset quality; re-apply when one loads (only if a cap is set).
  document.addEventListener('loadedmetadata', () => wanted !== 'auto' && apply(), true);
})();
