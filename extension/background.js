// Runs in the extension's own origin, so it can POST to the app's API
// without the page's CORS / mixed-content restrictions.
//
// The server origin is fixed at package time (config.js). Auth is a paired
// capture token (lis_ext_…) minted through the short-lived pairing flow; the
// extension never stores a browser session or magic link.

importScripts("config.js", "lib/pairing-core.js");

async function startPairing() {
  const verifier = globalThis.LIS.createPairingVerifier();
  const response = await fetch(`${LIS_CONFIG.appOrigin}/api/extension/pairings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verifier }),
  });
  if (!response.ok) throw new Error("Could not start connection");
  const pairing = await response.json();
  await chrome.storage.local.set({ pairingId: pairing.id, pairingVerifier: verifier });
  await chrome.tabs.create({ url: `${LIS_CONFIG.appOrigin}/?pairing=${encodeURIComponent(pairing.id)}` });
  return pairing;
}

async function pollPairing() {
  const { pairingId, pairingVerifier } = await chrome.storage.local.get(["pairingId", "pairingVerifier"]);
  if (!pairingId || !pairingVerifier) return { state: "disconnected" };
  const response = await fetch(`${LIS_CONFIG.appOrigin}/api/extension/pairings/${pairingId}/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verifier: pairingVerifier }),
  });
  if (response.status === 202) return { state: "waiting" };
  if (!response.ok) throw new Error("Connection request expired");
  const { token } = await response.json();
  await chrome.storage.local.set({ extensionToken: token });
  await chrome.storage.local.remove(["pairingId", "pairingVerifier", "needsReconnect"]);
  return { state: "connected" };
}

async function savePost(payload) {
  const { extensionToken } = await chrome.storage.local.get(["extensionToken"]);
  if (!extensionToken) throw new Error("extension is not connected");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${extensionToken}`,
  };
  const response = await fetch(`${LIS_CONFIG.appOrigin}/api/posts`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (response.status === 401) {
    // The token was revoked or the account is gone. Drop it so the popup
    // shows reconnect guidance instead of silently failing forever.
    await chrome.storage.local.remove(["extensionToken"]);
    await chrome.storage.local.set({ needsReconnect: true });
    const err = new Error("server 401");
    err.reconnect = true;
    throw err;
  }
  if (!response.ok) throw new Error(`server ${response.status}`);
  return response.json();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "start-pairing") {
    startPairing()
      .then((pairing) => sendResponse({ ok: true, pairing }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || "Could not start connection" }));
    return true;
  }

  if (msg?.type === "poll-pairing") {
    pollPairing()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || "Connection request expired" }));
    return true;
  }

  if (msg?.type === "save-post") {
    savePost(msg.payload)
      .then((post) => {
        flashBadge(post.duplicate ? "•" : "✓", "#0a66c2");
        sendResponse({ ok: true, post });
      })
      .catch((err) => {
        flashBadge("!", "#c0392b");
        sendResponse({
          ok: false,
          error: err?.message || "save failed",
          reconnect: err?.reconnect === true,
        });
      });
    return true; // keep the message channel open for the async response
  }
});

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}
