// Runs in YouTube's own JS world (needed to reach the player API).
// Only active inside the extension's panel frame.
(() => {
  if (window.top === window || !location.ancestorOrigins?.[0]?.startsWith('chrome-extension://')) return;

  let wanted = 'auto';

  function apply() {
    const p = document.getElementById('movie_player');
    if (!p?.setPlaybackQualityRange) return;
    if (wanted === 'auto') p.setPlaybackQualityRange('auto', 'auto');
    else p.setPlaybackQualityRange(wanted, wanted);
    p.setPlaybackQuality?.(wanted);
  }

  addEventListener('ytsb-quality', e => { wanted = e.detail || 'auto'; apply(); });
  // New videos reset quality; re-apply when one loads (only if a cap is set).
  document.addEventListener('loadedmetadata', () => wanted !== 'auto' && apply(), true);
})();
