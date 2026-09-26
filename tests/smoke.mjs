// End-to-end smoke test in a real (headless) Chromium browser.
// Usage: node tests/smoke.mjs <browser executable> [extension dir]
// Loads the extension, opens the real side panel, plays YouTube Music and checks:
// shortcuts, background standby, gapless hide, seamless reopen, next track, and
// that switching tabs doesn't auto-hide the panel. Exit code 1 on any failure.
import { launch, wait } from './cdp.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exe = process.argv[2];
const ext = resolve(process.argv[3] || join(dirname(fileURLToPath(import.meta.url)), '..'));
const prof = mkdtempSync(join(tmpdir(), 'ytsb-'));
// YouTube Music refuses the "HeadlessChrome" user agent.
const os = platform() === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64';
const UA = `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36`;

const b = launch(exe, ['--headless=new', `--user-agent=${UA}`, '--enable-unsafe-extension-debugging',
  `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--mute-audio',
  // CI machines (e.g. GitHub's macOS runners) have no sound device; play into a null sink.
  '--disable-audio-output', 'https://example.com']);
const swLogs = [];
b.on(m => {
  if (m.method === 'Runtime.consoleAPICalled') swLogs.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
const targets = async () => (await b.send('Target.getTargets')).targetInfos;
const sess = new Map();
const attach = async id => {
  if (!sess.has(id)) sess.set(id, (await b.send('Target.attachToTarget', { targetId: id, flatten: true })).sessionId);
  return sess.get(id);
};
const ev = async (sid, e, gesture) =>
  (await b.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true, userGesture: !!gesture }, sid)).result.value;
const VID = `(()=>{const v=document.querySelector('video');const p=document.getElementById('movie_player');
  return {o:performance.timeOrigin, vid:p?.getVideoData?.().video_id, p:v?!v.paused:false, m:!!v?.muted,
  t:v?+v.currentTime.toFixed(1):0, ad:!!document.querySelector('.ad-showing')}})()`;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};
const until = async (fn, ms, step = 500) => {
  for (const end = Date.now() + ms; Date.now() < end; await wait(step)) { const r = await fn(); if (r) return r; }
  return null;
};

let base, sw;
async function openPanel() {
  // sidePanel.open needs a user gesture from an extension page (not the worker).
  const { targetId } = await b.send('Target.createTarget', { url: base + 'player.html' });
  await wait(800);
  const r = await ev(await attach(targetId),
    `chrome.windows.getCurrent().then(w => chrome.sidePanel.open({windowId: w.id})).then(() => 'ok', e => e.message)`, true);
  await b.send('Target.closeTarget', { targetId });
  return r;
}
const closePanel = () => ev(sw, `chrome.windows.getLastFocused().then(w => chrome.sidePanel.close({windowId: w.id}))`);
const panelTarget = async () => (await targets()).find(t => t.url.startsWith(base + 'sidepanel.html'));
const bgAlive = async () => (await targets()).some(t => t.type === 'background_page' && t.url.includes('player.html'));
async function frames() { // YouTube frames, oldest first
  const out = [];
  for (const t of (await targets()).filter(t => t.type === 'iframe' && t.url.includes('music.youtube.com'))) {
    const sid = await attach(t.targetId).catch(() => null);
    const v = sid && await ev(sid, VID).catch(() => null);
    if (v) out.push({ ...v, sid });
  }
  return out.sort((a, z) => a.o - z.o);
}

try {
  await wait(2000);
  console.log('browser:', (await b.send('Browser.getVersion')).product, '| platform:', platform());
  const { id } = await b.send('Extensions.loadUnpacked', { path: ext });
  await b.send('Target.setDiscoverTargets', { discover: true });
  await wait(1500);
  base = `chrome-extension://${id}/`;
  sw = await attach((await targets()).find(t => t.type === 'service_worker' && t.url.startsWith(base)).targetId);
  await b.send('Runtime.enable', {}, sw);

  // 1. Shortcuts registered (Ctrl becomes Command on macOS)
  const keys = await ev(sw, `chrome.commands.getAll().then(c => c.map(x => x.name + '=' + (x.shortcut || '-')))`);
  check('shortcuts registered', keys.every(k => !k.endsWith('=-')), keys.join(', '));

  // 2. Real side panel opens and loads YouTube Music
  check('side panel opens', (await openPanel()) === 'ok');
  const pf = await until(async () => (await targets()).find(t => t.type === 'iframe' && t.url.includes('music.youtube.com')), 20000);
  check('YouTube Music loads in the panel', !!pf, pf?.url);
  if (!pf) throw new Error('no YouTube frame');
  const fs = await attach(pf.targetId);
  const body = await until(() => ev(fs, `document.querySelector('ytmusic-play-button-renderer') ? 'ok' : ''`), 20000);
  if (!body) console.log('       page text:', JSON.stringify(await ev(fs, 'document.body.innerText.slice(0, 200)')));
  check('YouTube Music home rendered', !!body);
  if (!body) throw new Error('home not rendered');

  // 3. Play a song from the home page
  // userGesture: like a real click, so Chrome's autoplay policy allows playback.
  await ev(fs, `document.querySelector('ytmusic-play-button-renderer').click()`, true);
  const playing = await until(async () => { const v = await ev(fs, VID); return v.p && !v.ad && v.t > 2 && v; }, 120000, 1000);
  check('song plays in the panel', !!playing, playing && `video ${playing.vid} at ${playing.t}s`);
  if (!playing) {
    // Why not? (e.g. YouTube's "confirm you're not a bot" wall on cloud IPs)
    console.log('       player:', JSON.stringify(await ev(fs, `(()=>{const p=document.getElementById('movie_player');
      const err=document.querySelector('.ytp-error, yt-playability-error-supported-renderers, ytmusic-player .error, [class*="error"]');
      return {state:p?.getPlayerState?.(), video:${VID}, error:(err?.innerText||'').slice(0,200), url:location.href}})()`)));
    // Control: does YouTube play at all on this machine, in a normal tab without the extension?
    const url = await ev(fs, 'location.href');
    const { targetId } = await b.send('Target.createTarget', { url });
    const ts = await attach(targetId);
    await wait(8000);
    await ev(ts, `(document.querySelector('video')?.play().catch(() => {}), 1)`, true); // don't await play()
    const ctl = await until(async () => { const v = await ev(ts, VID); return v.p && v.t > 2 && v; }, 30000, 1000);
    const ctlInfo = await ev(ts, `(()=>({state: document.getElementById('movie_player')?.getPlayerState?.(),
      text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300)}))()`);
    check('control: same song in a normal tab (no extension)', !!ctl,
      ctl ? `plays at ${ctl.t}s → the problem is in the extension` : `also doesn't play → environment, not the extension. state ${ctlInfo.state}; page: ${ctlInfo.text}`);
    throw new Error('no playback');
  }

  // 4. Standby copy preloaded (paused, muted, past any ad)
  const standby = await until(async () => {
    const f = await frames();
    return (await bgAlive()) && f.length === 2 && !f[1].p && f[1].m && !f[1].ad && f[1];
  }, 90000, 1000);
  check('standby copy preloaded', !!standby);

  // 5. Hide: music continues from the standby copy with ~no gap
  await wait(2000);
  const hideAt = Date.now();
  const before = (await frames())[0];
  await closePanel();
  let gap = null, after = null;
  for (let i = 0; i < 200 && gap == null; i++) {
    const s = (await frames()).find(f => f.sid === standby?.sid);
    if (s?.p && !s.m) { gap = Date.now() - hideAt; after = s; } else await wait(50);
  }
  check('hide → background plays', gap != null && gap < 1500,
    gap != null ? `audible after ${gap} ms at ${after.t}s (panel was at ${before.t}s)` : 'never audible');
  check('hide → same position', after && Math.abs(after.t - before.t) < 3);

  // 6. Reopen: panel takes over without a silent gap or double audio
  await wait(5000);
  await openPanel();
  let silent = 0, both = 0, done = false;
  for (let i = 0; i < 150 && !done; i++) {
    const f = await frames();
    const bgV = f.find(x => x.sid === standby?.sid);
    const pV = f.filter(x => x.sid !== standby?.sid).pop();
    const audible = [bgV, pV].filter(x => x?.p && !x.m).length;
    if (audible === 0) silent++;
    if (audible === 2) both++;
    done = pV?.p && !pV.m && bgV && !bgV.p;
    if (!done) await wait(200);
  }
  check('reopen → panel takes over', done);
  check('reopen → no silence, no double audio', silent === 0 && both === 0, `${silent} silent / ${both} double samples`);

  // 7. Global "next track" shortcut reaches the open panel
  const pNow = (await frames()).pop();
  await ev(sw, `handleCommand('next-track')`);
  const next = await until(async () => { const f = (await frames()).pop(); return f.vid !== pNow.vid && f; }, 15000);
  check('next-track shortcut', !!next, next && `${pNow.vid} → ${next.vid}`);

  // 8. Switching tabs doesn't auto-hide the panel; clicking into the page does
  await b.send('Target.createTarget', { url: 'https://example.org', background: true });
  await wait(1500);
  const ps = await attach((await panelTarget()).targetId);
  await ev(ps, `state.pinned = false; document.hasFocus = () => false; dispatchEvent(new Event('blur')); 1`);
  await ev(sw, `chrome.tabs.query({currentWindow: true}).then(ts => chrome.tabs.update(ts.find(t => !t.active).id, {active: true})).then(() => 1)`);
  await wait(1500);
  check('tab switch keeps panel open', !!(await panelTarget()));
  await ev(ps, `dispatchEvent(new Event('blur')); 1`);
  await wait(1500);
  check('click away hides panel', !(await panelTarget()));
} catch (e) {
  check('test run', false, e.message);
}
console.log('\nservice worker log:\n  ' + swLogs.join('\n  '));
b.proc.kill();
await wait(1000);
try { rmSync(prof, { recursive: true, force: true }); } catch {}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
