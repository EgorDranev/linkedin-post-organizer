// Popup shell for the paired-account states.
//
// This file only picks which static state to show and keeps the cheap,
// already-working bits (auto-capture toggle, library link) functional.
// Pairing logic — Connect / Reconnect / Disconnect wiring, consent-gated
// pairing start, and token polling — arrives with the paired-auth task.

const els = {
  disconnected: document.getElementById("disconnected"),
  connected: document.getElementById("connected"),
  reconnect: document.getElementById("reconnect"),
  consent: document.getElementById("consent"),
  connect: document.getElementById("connect"),
  autoCapture: document.getElementById("autoCapture"),
  open: document.getElementById("open"),
};

function showState(name) {
  for (const state of ["disconnected", "connected", "reconnect"]) {
    els[state].hidden = state !== name;
  }
}

// Visual affordance only: consent gates the Connect button. The click
// handler that starts pairing is added by the paired-auth task.
els.consent.addEventListener("change", () => {
  els.connect.disabled = !els.consent.checked;
});

els.autoCapture.addEventListener("change", () => {
  chrome.storage.local.set({ autoCapture: els.autoCapture.checked });
});

async function init() {
  els.open.href = LIS_CONFIG.appOrigin;

  const { extensionToken, autoCapture } = await chrome.storage.local.get([
    "extensionToken",
    "autoCapture",
  ]);
  els.autoCapture.checked = autoCapture !== false;

  // "reconnect" (had a token, lost it) is surfaced once pairing exists.
  showState(
    typeof extensionToken === "string" && extensionToken.startsWith("lis_ext_")
      ? "connected"
      : "disconnected",
  );
}

init();
