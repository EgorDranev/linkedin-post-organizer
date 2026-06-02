// Sends scraped posts to the app via the background service worker.
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});

  const DEDUPE_MS = 2500;
  const recent = new Map(); // urn -> timestamp

  function recentlyCaptured(urn) {
    if (!urn) return false;
    const now = Date.now();
    for (const [key, at] of recent) {
      if (now - at > DEDUPE_MS) recent.delete(key);
    }
    if (recent.has(urn) && now - recent.get(urn) < DEDUPE_MS) return true;
    recent.set(urn, now);
    return false;
  }

  LIS.showToast = function showToast(message, variant) {
    const id = "lis-toast";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.setAttribute("role", "status");
      document.documentElement.appendChild(el);
    }
    el.className = `lis-toast lis-toast--${variant || "info"}`;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(el._lisTimer);
    el._lisTimer = setTimeout(() => {
      el.hidden = true;
    }, 3000);
  };

  function friendlyError(raw) {
    if (!raw) return "server not reachable";
    if (/server 401|403/i.test(raw)) return "wrong app password";
    if (/server 5\d\d/i.test(raw)) return "server error";
    if (/server 4\d\d/i.test(raw)) return "server rejected the save";
    if (/could not establish|failed to fetch|network/i.test(raw)) {
      return "server not reachable";
    }
    return raw;
  }

  LIS.capturePost = function capturePost(postEl) {
    if (!postEl) return Promise.resolve({ ok: false, skipped: true });
    if (LIS.contextAlive && !LIS.contextAlive()) {
      return Promise.resolve({ ok: false, skipped: true });
    }

    return new Promise((resolve) => {
      const done = LIS.safeStorageGet
        ? LIS.safeStorageGet(["autoCapture"], afterStorage)
        : false;
      if (!done) resolve({ ok: false, skipped: true });

      function afterStorage({ autoCapture }) {
        if (autoCapture === false) {
          resolve({ ok: false, skipped: true });
          return;
        }

        const payload = LIS.extract(postEl);
        const urn = payload.urn || LIS.getPostUrn(postEl);
        delete payload.urn;

        if (recentlyCaptured(urn)) {
          resolve({ ok: true, skipped: true, duplicate: true });
          return;
        }

        if (LIS.contextAlive && !LIS.contextAlive()) {
          resolve({ ok: false, skipped: true });
          return;
        }

        try {
          chrome.runtime.sendMessage({ type: "save-post", payload }, (resp) => {
            if (!LIS.contextAlive?.()) {
              resolve({ ok: false, skipped: true });
              return;
            }
            if (chrome.runtime.lastError || !resp?.ok) {
              const err = friendlyError(
                chrome.runtime.lastError?.message || resp?.error || ""
              );
              LIS.showToast(`LinkedIn Saver: ${err}`, "error");
              resolve({ ok: false, error: err });
              return;
            }
            resolve(resp);
          });
        } catch {
          resolve({ ok: false, skipped: true });
        }
      }
    });
  };
})();
