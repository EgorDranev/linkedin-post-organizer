// Pure pairing helpers shared by the background worker and popup.
// No chrome.* APIs here so the logic stays unit-testable.
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});

  LIS.createPairingVerifier = function createPairingVerifier() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  LIS.connectionState = function connectionState(stored) {
    return stored?.extensionToken?.startsWith("lis_ext_") ? "connected" : "disconnected";
  };
})();
