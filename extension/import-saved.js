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

  // Core import loop. All effects are injected so tests can drive it:
  //   collect()        -> [{ url, card }] currently in the DOM
  //   extract(item)    -> capture payload (may throw on a broken card)
  //   capture(payload) -> Promise<{ ok, post?, error? }>
  //   loadMore()       -> Promise<void>: scroll/click and wait for new cards
  //   delay(ms)        -> Promise<void>
  //   shouldStop()     -> boolean, checked between cards
  //   onProgress(s)    -> called after every processed card
  LIS.runSavedImport = async function runSavedImport(deps) {
    const { collect, extract, capture, loadMore, delay, shouldStop, onProgress } = deps;
    const state = { imported: 0, duplicates: 0, failed: 0, stopped: false, fatalError: "" };
    const seen = new Set();
    let emptyRounds = 0;

    while (emptyRounds < 2 && !state.stopped) {
      if (shouldStop?.()) {
        state.stopped = true;
        break;
      }

      const fresh = (collect() || []).filter(
        (item) => item?.url && !seen.has(item.url)
      );

      if (!fresh.length) {
        emptyRounds += 1;
      } else {
        emptyRounds = 0;
        for (const item of fresh) {
          if (shouldStop?.()) {
            state.stopped = true;
            break;
          }
          seen.add(item.url);

          let payload = null;
          try {
            payload = extract(item);
          } catch {
            payload = null;
          }
          if (!payload) {
            state.failed += 1;
            console.warn("LinkedIn Saver import: could not extract", item.url);
            onProgress?.({ ...state });
            continue;
          }

          const resp = await capture(payload);
          if (resp?.ok) {
            if (resp.post?.duplicate) state.duplicates += 1;
            else state.imported += 1;
          } else if (LIS.isRunFatalError(resp?.error)) {
            state.fatalError = resp.error;
            onProgress?.({ ...state });
            return state;
          } else {
            state.failed += 1;
            console.warn(
              "LinkedIn Saver import: save failed",
              item.url,
              resp?.error || ""
            );
          }
          onProgress?.({ ...state });
          await delay(POST_DELAY_MS);
        }
      }

      if (!state.stopped) await loadMore();
    }

    return state;
  };

  function counts(state) {
    return `Imported ${state.imported} · Already saved ${state.duplicates} · Failed ${state.failed}`;
  }

  function ensureBanner() {
    let el = document.getElementById(BANNER_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = BANNER_ID;
      el.className = "lis-import-banner";
      el.setAttribute("role", "status");
      document.documentElement.appendChild(el);
    }
    return el;
  }

  function removeBanner() {
    document.getElementById(BANNER_ID)?.remove();
  }

  // view: { mode: "disconnected" | "idle" | "running" | "done",
  //         state?, onStart?, onStop? }
  LIS.renderImportBanner = function renderImportBanner(view) {
    const el = ensureBanner();
    el.textContent = "";

    const text = document.createElement("span");
    text.className = "lis-import-banner__text";
    el.append(text);

    if (view.mode === "disconnected") {
      text.textContent =
        "LinkedIn Saver: connect the extension (click its toolbar icon) to import these saved posts.";
      return el;
    }

    if (view.mode === "idle") {
      text.textContent = "Import these saved posts into LinkedIn Saver.";
      const button = document.createElement("button");
      button.className = "lis-import-banner__btn";
      button.textContent = "Start import";
      button.addEventListener("click", view.onStart);
      el.append(button);
      return el;
    }

    if (view.mode === "running") {
      text.textContent = `Importing… ${counts(view.state)}`;
      const button = document.createElement("button");
      button.className = "lis-import-banner__btn lis-import-banner__btn--stop";
      button.textContent = "Stop";
      button.addEventListener("click", view.onStop);
      el.append(button);
      return el;
    }

    // done
    const prefix = view.state.fatalError
      ? `Import stopped: ${view.state.fatalError}. `
      : view.state.stopped
        ? "Import stopped. "
        : "Import finished. ";
    text.textContent = prefix + counts(view.state);
    return el;
  };
})();
