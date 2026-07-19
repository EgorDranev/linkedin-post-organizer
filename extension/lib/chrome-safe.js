// Guards chrome.* calls after extension reload (avoids "Extension context invalidated").
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});
  const teardowns = new Set();

  LIS.contextAlive = function contextAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  };

  LIS.onContextInvalidated = function onContextInvalidated(fn) {
    teardowns.add(fn);
  };

  function runTeardowns() {
    for (const fn of teardowns) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    teardowns.clear();
  }

  LIS.safeStorageGet = function safeStorageGet(keys, cb) {
    if (!LIS.contextAlive()) {
      runTeardowns();
      return false;
    }
    try {
      chrome.storage.local.get(keys, (result) => {
        if (!LIS.contextAlive()) {
          runTeardowns();
          return;
        }
        if (chrome.runtime.lastError) return;
        cb(result);
      });
      return true;
    } catch {
      runTeardowns();
      return false;
    }
  };

  LIS.safeStorageSet = function safeStorageSet(obj) {
    if (!LIS.contextAlive()) {
      runTeardowns();
      return false;
    }
    try {
      chrome.storage.local.set(obj, () => {
        if (!LIS.contextAlive()) {
          runTeardowns();
          return;
        }
        // Read lastError to avoid unchecked-error warnings; nothing to retry.
        void chrome.runtime.lastError;
      });
      return true;
    } catch {
      runTeardowns();
      return false;
    }
  };
})();
