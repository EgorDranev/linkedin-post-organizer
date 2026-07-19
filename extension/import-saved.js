// Imports the user's saved-posts backlog from linkedin.com/my-items/saved-posts/.
// A banner on that page starts a run that auto-scrolls the list, extracts each
// card (lib/extract.js), and saves via the normal pipeline (lib/save.js) with
// createOnly so re-runs never duplicate or overwrite existing posts.
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});

  const POST_DELAY_MS = 400;
  const NEW_CARDS_TIMEOUT_MS = 3000;
  const NEW_CARDS_POLL_MS = 300;
  const BANNER_ID = "lis-import-banner";

  LIS.isSavedPostsPath = function isSavedPostsPath(pathname) {
    return /^\/my-items\/saved-posts\/?$/.test(pathname || "");
  };

  // Mirrors friendlyError() in lib/save.js: auth loss and an unreachable
  // server invalidate the whole run; anything else is a per-card failure.
  LIS.isRunFatalError = function isRunFatalError(message) {
    return /reconnect the extension|server not reachable/i.test(message || "");
  };
})();
