importScripts('shared.js');

// Clicking the toolbar icon (or Alt+Y) toggles the side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// YouTube forbids being framed. Strip the anti-framing headers, but only for
// frames our own extension pages load, so normal YouTube tabs are untouched.
// Rules are built at runtime because the extension ID differs per browser/install.
async function installRules() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          { header: 'x-frame-options', operation: 'remove' },
          { header: 'content-security-policy', operation: 'remove' },
          { header: 'content-security-policy-report-only', operation: 'remove' }
        ]
      },
      condition: {
        requestDomains: ['youtube.com'],
        resourceTypes: ['sub_frame'],
        initiatorDomains: [chrome.runtime.id]
      }
    }]
  });
}

// Session rules are cleared on browser restart, so re-add them on every startup.
chrome.runtime.onInstalled.addListener(installRules);
chrome.runtime.onStartup.addListener(installRules);
installRules();

// --- Background playback -------------------------------------------------------
// A closed side panel is destroyed, so playback would stop. Each open panel holds a
// port to us and streams its playback state; when the port drops (panel closed)
// while playing, we continue in an offscreen document. When a panel opens again,
// it asks for a handoff: we read the offscreen position, close it, and return it.

// Serialize start/stop so a quick close→reopen can't leave both playing.
let chain = Promise.resolve();
const serial = fn => (chain = chain.then(fn, fn));

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'panel') return;
  let last = null;
  port.onMessage.addListener(msg => { if (msg.type === 'state') last = msg.state; });
  port.onDisconnect.addListener(() => { if (last?.playing) serial(() => startBackground(last)); });
});

async function startBackground(s) {
  if (await chrome.offscreen.hasDocument()) return;
  const p = posNow(s);
  await chrome.storage.session.set({ bgApp: s.app });
  await chrome.offscreen.createDocument({
    url: 'player.html?src=' + encodeURIComponent(withTime(p.url, p.time)),
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Keep YouTube audio playing after the side panel is closed.'
  });
}

async function takeBack() {
  if (!(await chrome.offscreen.hasDocument())) return null;
  const r = await chrome.runtime.sendMessage({ type: 'bgQuery' }).catch(() => null);
  await chrome.offscreen.closeDocument();
  if (!r) return null;
  const { bgApp } = await chrome.storage.session.get('bgApp');
  return { app: bgApp, ...posNow(r), playing: r.playing };
}

// While playing in the background, keep the saved position current so it survives
// the offscreen document closing on its own (Chrome closes it ~30s after audio stops).
async function persistBg(r) {
  const [{ state }, { bgApp }] = await Promise.all([
    chrome.storage.local.get('state'), chrome.storage.session.get('bgApp')
  ]);
  if (!state || !bgApp) return;
  state.app = bgApp;
  state.pos = { ...state.pos, [bgApp]: posNow(r) };
  await chrome.storage.local.set({ state });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'handoff') { serial(takeBack).then(reply); return true; }
  if (msg.type === 'bgState') persistBg(msg.state);
});
