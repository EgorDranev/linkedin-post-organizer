// Popup for the paired-account states.
//
// Consent gates Connect. Connect asks the background worker to start a
// pairing, opens the approval tab, then polls every two seconds for at most
// ten minutes. Disconnect only forgets the local token — server-side
// revocation lives in the app's Settings.

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const els = {
  disconnected: document.getElementById("disconnected"),
  connected: document.getElementById("connected"),
  reconnect: document.getElementById("reconnect"),
  consent: document.getElementById("consent"),
  connect: document.getElementById("connect"),
  connectStatus: document.getElementById("connectStatus"),
  reconnectBtn: document.getElementById("reconnectBtn"),
  reconnectStatus: document.getElementById("reconnectStatus"),
  autoCapture: document.getElementById("autoCapture"),
  open: document.getElementById("open"),
  disconnect: document.getElementById("disconnect"),
};

let pollTimer = null;

function showState(name) {
  for (const state of ["disconnected", "connected", "reconnect"]) {
    els[state].hidden = state !== name;
  }
}

function setStatus(text, bad) {
  for (const el of [els.connectStatus, els.reconnectStatus]) {
    el.textContent = text || "";
    el.classList.toggle("bad", Boolean(bad));
  }
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        resolve({ ok: false, error: chrome.runtime.lastError?.message || "no response" });
        return;
      }
      resolve(resp);
    });
  });
}

function friendlyPairingError(raw) {
  if (/expired/i.test(raw || "")) {
    return "That connection request expired. Try connecting again.";
  }
  if (/failed to fetch|network|no response/i.test(raw || "")) {
    return "Could not reach LinkedIn Saver. Check your connection and try again.";
  }
  return raw || "Something went wrong. Try connecting again.";
}

function setButtonsBusy(busy) {
  els.connect.disabled = busy || !els.consent.checked;
  els.reconnectBtn.disabled = busy;
}

function startPolling() {
  stopPolling();
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  setStatus("Waiting for you to approve the connection…");
  setButtonsBusy(true);

  pollTimer = setInterval(async () => {
    if (Date.now() > deadline) {
      stopPolling();
      setButtonsBusy(false);
      setStatus("That connection request expired. Try connecting again.", true);
      return;
    }
    const resp = await sendMessage({ type: "poll-pairing" });
    if (resp.ok && resp.state === "connected") {
      stopPolling();
      setButtonsBusy(false);
      setStatus("");
      showState("connected");
      return;
    }
    if (resp.ok && resp.state === "disconnected") {
      // No pairing in flight anymore (e.g. cleared elsewhere).
      stopPolling();
      setButtonsBusy(false);
      setStatus("");
      return;
    }
    if (!resp.ok) {
      stopPolling();
      setButtonsBusy(false);
      setStatus(friendlyPairingError(resp.error), true);
    }
    // resp.state === "waiting": keep polling.
  }, POLL_INTERVAL_MS);
}

async function connect() {
  setButtonsBusy(true);
  setStatus("Opening LinkedIn Saver to approve…");
  const resp = await sendMessage({ type: "start-pairing" });
  if (!resp.ok) {
    setButtonsBusy(false);
    setStatus(friendlyPairingError(resp.error), true);
    return;
  }
  startPolling();
}

els.consent.addEventListener("change", () => {
  els.connect.disabled = !els.consent.checked;
});

els.connect.addEventListener("click", connect);
els.reconnectBtn.addEventListener("click", connect);

els.disconnect.addEventListener("click", async () => {
  stopPolling();
  await chrome.storage.local.remove(["extensionToken", "pairingId", "pairingVerifier", "needsReconnect"]);
  els.consent.checked = false;
  els.connect.disabled = true;
  setStatus("");
  showState("disconnected");
});

els.autoCapture.addEventListener("change", () => {
  chrome.storage.local.set({ autoCapture: els.autoCapture.checked });
});

async function init() {
  els.open.href = LIS_CONFIG.appOrigin;

  const stored = await chrome.storage.local.get([
    "extensionToken",
    "autoCapture",
    "needsReconnect",
    "pairingId",
  ]);
  els.autoCapture.checked = stored.autoCapture !== false;

  if (globalThis.LIS.connectionState(stored) === "connected") {
    showState("connected");
    return;
  }

  showState(stored.needsReconnect ? "reconnect" : "disconnected");

  // A pairing started from an earlier popup visit may still be pending —
  // resume polling instead of forcing the user to start over.
  if (stored.pairingId) startPolling();
}

init();
