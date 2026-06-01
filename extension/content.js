// Boots native-save hooks on the LinkedIn feed (infinite scroll included).
(function () {
  const LIS = globalThis.LIS;
  if (!LIS) return;

  const AUTO_CAPTURE_KEY = "autoCapture";

  function isEnabled(autoCapture) {
    return autoCapture !== false;
  }

  function boot() {
    chrome.storage.local.get([AUTO_CAPTURE_KEY], ({ autoCapture }) => {
      if (!isEnabled(autoCapture)) return;
      LIS.hookAllPosts();
    });
  }

  boot();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(AUTO_CAPTURE_KEY in changes)) return;
    if (isEnabled(changes[AUTO_CAPTURE_KEY].newValue)) LIS.hookAllPosts();
  });

  const feedObserver = new MutationObserver(() => {
    chrome.storage.local.get([AUTO_CAPTURE_KEY], ({ autoCapture }) => {
      if (!isEnabled(autoCapture)) return;
      LIS.hookAllPosts();
    });
  });
  feedObserver.observe(document.body, { childList: true, subtree: true });
})();
