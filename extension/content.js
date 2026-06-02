// Boots native-save hooks on the LinkedIn feed (infinite scroll included).
(function () {
  const LIS = globalThis.LIS;
  if (!LIS) return;

  const AUTO_CAPTURE_KEY = "autoCapture";

  function isEnabled(autoCapture) {
    return autoCapture !== false;
  }

  function hookIfEnabled(autoCapture) {
    if (!isEnabled(autoCapture)) return;
    LIS.hookAllPosts();
  }

  function boot() {
    LIS.safeStorageGet([AUTO_CAPTURE_KEY], ({ autoCapture }) => {
      hookIfEnabled(autoCapture);
    });
  }

  boot();

  function onStorageChanged(changes, area) {
    try {
      if (!LIS.contextAlive()) return shutdown();
      if (area !== "local" || !(AUTO_CAPTURE_KEY in changes)) return;
      if (isEnabled(changes[AUTO_CAPTURE_KEY].newValue)) LIS.hookAllPosts();
    } catch {
      shutdown();
    }
  }

  try {
    chrome.storage.onChanged.addListener(onStorageChanged);
  } catch {
    /* context already invalidated at load time — nothing to do */
  }

  const feedObserver = new MutationObserver(() => {
    if (!LIS.contextAlive()) return shutdown();
    LIS.safeStorageGet([AUTO_CAPTURE_KEY], ({ autoCapture }) => {
      hookIfEnabled(autoCapture);
    });
  });
  feedObserver.observe(document.body, { childList: true, subtree: true });

  function shutdown() {
    feedObserver.disconnect();
    try {
      chrome.storage.onChanged.removeListener(onStorageChanged);
    } catch {
      /* context already gone */
    }
  }

  LIS.onContextInvalidated(shutdown);
})();
