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
