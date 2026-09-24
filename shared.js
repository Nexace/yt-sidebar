// Shared by the side panel and the service worker (importScripts).

// Add &t=Ns to a watch URL so it resumes at that time.
function withTime(url, time) {
  if (!time || !/[?&]v=/.test(url)) return url;
  const u = new URL(url);
  u.searchParams.set('t', Math.floor(time) + 's');
  return u.toString();
}

// Current position from a frame.js report, extrapolated to now (reports are sparse).
function posNow(r) {
  const drift = r.playing ? (Date.now() - r.at) / 1000 * (r.rate || 1) : 0;
  return { url: r.url, time: r.time + drift };
}

// Video ID from a watch URL (null if none).
function vidOf(url) {
  try { return new URL(url).searchParams.get('v'); } catch { return null; }
}
