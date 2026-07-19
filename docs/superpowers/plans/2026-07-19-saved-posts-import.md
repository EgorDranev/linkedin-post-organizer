# Saved-Posts Backlog Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click, re-runnable import of the user's LinkedIn saved-posts backlog from `linkedin.com/my-items/saved-posts/` into their library, driven by a banner injected on that page.

**Architecture:** A new content-script IIFE (`extension/import-saved.js`) detects the saved-posts page via a coalesced MutationObserver (LinkedIn is a SPA), injects a banner, and runs an injectable-dependency import loop over the existing `LIS.findSavedPostItems()` / `LIS.extractSavedItem()` extractors, saving through the existing `LIS.capturePayload()` pipeline with `createOnly: true` (server-side dedupe already returns `duplicate: true` without overwriting). `lib/save.js` gains a `silent` option so bulk failures feed the banner instead of spamming toasts.

**Tech Stack:** Chrome MV3 content scripts (plain JS IIFEs on the `LIS` namespace), vitest + jsdom (existing suite pattern: reset `globalThis.LIS`, `vi.resetModules()`, import the file).

**Spec:** `docs/superpowers/specs/2026-07-19-saved-posts-import-design.md`

**Branch:** `feat/import-saved-posts` (already created; spec committed).

## File Structure

- Create: `extension/import-saved.js` — page detection, banner UI, import loop engine, wiring. All logic exposed on `LIS.*` so tests can drive it; browser-only boot is guarded by `globalThis.chrome?.runtime?.id` so importing the file in jsdom is inert.
- Create: `test/extension-import-saved.test.js` — unit tests for path detection, error classification, the loop engine, and banner rendering.
- Modify: `extension/lib/save.js` — `silent` option on `capturePayload`/`sendSaveMessage` (suppress error toast, still resolve `{ ok: false, error }`).
- Modify: `test/extension-save-silent.test.js` (new) — tests for the `silent` option.
- Modify: `extension/manifest.json` — register `import-saved.js`; bump version `0.2.0` → `0.3.0`.
- Modify: `extension/content.css` — `.lis-import-banner` styles.

---

### Task 1: `silent` option in the save pipeline

**Files:**
- Modify: `extension/lib/save.js`
- Test: `test/extension-save-silent.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `test/extension-save-silent.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadSaveModule({ response }) {
  globalThis.LIS = { contextAlive: () => true };
  globalThis.chrome = {
    runtime: {
      id: "test-extension",
      lastError: undefined,
      sendMessage: (_msg, cb) => cb(response),
    },
  };
  vi.resetModules();
  await import("../extension/lib/save.js");
  globalThis.LIS.showToast = vi.fn();
  return globalThis.LIS;
}

beforeEach(() => {
  delete globalThis.chrome;
});

describe("capturePayload silent option", () => {
  it("shows an error toast on failure by default", async () => {
    const LIS = await loadSaveModule({ response: { ok: false, error: "server 500" } });
    const result = await LIS.capturePayload({ text: "post" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("server error");
    expect(LIS.showToast).toHaveBeenCalledWith("LinkedIn Saver: server error", "error");
  });

  it("suppresses the toast when silent is set, but still returns the error", async () => {
    const LIS = await loadSaveModule({ response: { ok: false, error: "server 500" } });
    const result = await LIS.capturePayload({ text: "post" }, { silent: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("server error");
    expect(LIS.showToast).not.toHaveBeenCalled();
  });

  it("passes createOnly through alongside silent", async () => {
    let sent = null;
    globalThis.LIS = { contextAlive: () => true };
    globalThis.chrome = {
      runtime: {
        id: "test-extension",
        lastError: undefined,
        sendMessage: (msg, cb) => {
          sent = msg;
          cb({ ok: true, post: { id: 1 } });
        },
      },
    };
    vi.resetModules();
    await import("../extension/lib/save.js");
    globalThis.LIS.showToast = vi.fn();
    const result = await globalThis.LIS.capturePayload(
      { text: "post" },
      { createOnly: true, silent: true }
    );
    expect(result.ok).toBe(true);
    expect(sent.payload.createOnly).toBe(true);
    expect(sent.payload.silent).toBeUndefined();
  });
});
```

Note: `loadSaveModule` sets `LIS.showToast` *after* importing `save.js`, deliberately overriding the real implementation the module defines.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/extension-save-silent.test.js`
Expected: FAIL — the silent test sees `showToast` called (option not implemented yet).

- [ ] **Step 3: Implement the `silent` option**

In `extension/lib/save.js`, change `sendSaveMessage` to accept options and guard the toast:

```js
  function sendSaveMessage(payload, options = {}) {
    return new Promise((resolve) => {
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
            if (!options.silent) {
              LIS.showToast(`LinkedIn Saver: ${err}`, "error");
            }
            resolve({ ok: false, error: err });
            return;
          }
          resolve(resp);
        });
      } catch {
        resolve({ ok: false, skipped: true });
      }
    });
  }
```

And in `LIS.capturePayload`, thread it through (the `silent` flag must not leak into the API payload):

```js
    // Keep urn in the payload: it is the server's dedupe key for posts that
    // have no extractable permalink (the in-memory 2.5s dedupe stays too).
    const body = { ...payload };
    if (options.createOnly) body.createOnly = true;
    return sendSaveMessage(body, { silent: options.silent === true });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/extension-save-silent.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/lib/save.js test/extension-save-silent.test.js
git commit -m "Add silent option to extension save pipeline"
```

---

### Task 2: Page detection and error classification helpers

**Files:**
- Create: `extension/import-saved.js`
- Test: `test/extension-import-saved.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `test/extension-import-saved.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(async () => {
  globalThis.LIS = {};
  // Re-execute the IIFE each test (Vite forbids variable dynamic-import paths,
  // so a cache-busting query string is not an option here).
  vi.resetModules();
  await import("../extension/import-saved.js");
});

describe("saved-posts page detection", () => {
  it("matches the saved-posts path with and without trailing slash", () => {
    expect(globalThis.LIS.isSavedPostsPath("/my-items/saved-posts/")).toBe(true);
    expect(globalThis.LIS.isSavedPostsPath("/my-items/saved-posts")).toBe(true);
  });

  it("rejects other LinkedIn paths", () => {
    expect(globalThis.LIS.isSavedPostsPath("/feed/")).toBe(false);
    expect(globalThis.LIS.isSavedPostsPath("/my-items/")).toBe(false);
    expect(globalThis.LIS.isSavedPostsPath("/my-items/saved-jobs/")).toBe(false);
    expect(globalThis.LIS.isSavedPostsPath("")).toBe(false);
    expect(globalThis.LIS.isSavedPostsPath(undefined)).toBe(false);
  });
});

describe("run-fatal error classification", () => {
  it("treats auth and unreachable errors as run-fatal", () => {
    expect(
      globalThis.LIS.isRunFatalError("reconnect the extension (click its toolbar icon)")
    ).toBe(true);
    expect(globalThis.LIS.isRunFatalError("server not reachable")).toBe(true);
  });

  it("treats per-post errors as card-local", () => {
    expect(globalThis.LIS.isRunFatalError("server error")).toBe(false);
    expect(globalThis.LIS.isRunFatalError("server rejected the save")).toBe(false);
    expect(globalThis.LIS.isRunFatalError("")).toBe(false);
    expect(globalThis.LIS.isRunFatalError(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/extension-import-saved.test.js`
Expected: FAIL — `Failed to load ../extension/import-saved.js` (file doesn't exist).

- [ ] **Step 3: Create `extension/import-saved.js` with the helpers**

Create `extension/import-saved.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/extension-import-saved.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/import-saved.js test/extension-import-saved.test.js
git commit -m "Add saved-posts page detection and import error classification"
```

---

### Task 3: The import loop engine

**Files:**
- Modify: `extension/import-saved.js`
- Test: `test/extension-import-saved.test.js`

The engine takes all effectful dependencies as parameters (`collect`, `extract`, `capture`, `loadMore`, `delay`, `shouldStop`, `onProgress`) so tests drive it synchronously; Task 5 wires the real browser implementations.

- [ ] **Step 1: Write the failing tests**

Append to `test/extension-import-saved.test.js`:

```js
function makeDeps(overrides = {}) {
  return {
    collect: () => [],
    extract: (item) => ({ url: item.url, text: "t" }),
    capture: vi.fn(async () => ({ ok: true, post: {} })),
    loadMore: vi.fn(async () => {}),
    delay: async () => {},
    shouldStop: () => false,
    onProgress: vi.fn(),
    ...overrides,
  };
}

describe("runSavedImport", () => {
  it("imports new cards, counts server duplicates, and ends after two empty rounds", async () => {
    const capture = vi.fn(async (payload) =>
      payload.url === "https://x/b"
        ? { ok: true, post: { duplicate: true } }
        : { ok: true, post: {} }
    );
    const deps = makeDeps({
      // Same two cards every round: round 1 processes both, rounds 2 and 3
      // find nothing new → terminate.
      collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
      capture,
    });
    const state = await globalThis.LIS.runSavedImport(deps);
    expect(state).toMatchObject({ imported: 1, duplicates: 1, failed: 0 });
    expect(capture).toHaveBeenCalledTimes(2);
    // loadMore runs after the processing round and after each empty round.
    expect(deps.loadMore).toHaveBeenCalledTimes(3);
  });

  it("stops the whole run on a fatal error without touching later cards", async () => {
    const capture = vi.fn(async () => ({
      ok: false,
      error: "reconnect the extension (click its toolbar icon)",
    }));
    const state = await globalThis.LIS.runSavedImport(
      makeDeps({
        collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
        capture,
      })
    );
    expect(capture).toHaveBeenCalledTimes(1);
    expect(state.fatalError).toMatch(/reconnect the extension/);
    expect(state.imported).toBe(0);
  });

  it("counts a card-local save failure and continues", async () => {
    const capture = vi.fn(async (payload) =>
      payload.url === "https://x/a"
        ? { ok: false, error: "server error" }
        : { ok: true, post: {} }
    );
    const state = await globalThis.LIS.runSavedImport(
      makeDeps({
        collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
        capture,
      })
    );
    expect(state).toMatchObject({ imported: 1, failed: 1, fatalError: "" });
  });

  it("counts a card that fails to extract and skips its capture", async () => {
    const capture = vi.fn(async () => ({ ok: true, post: {} }));
    const state = await globalThis.LIS.runSavedImport(
      makeDeps({
        collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
        extract: (item) => {
          if (item.url === "https://x/a") throw new Error("bad card");
          return { url: item.url, text: "t" };
        },
        capture,
      })
    );
    expect(capture).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ imported: 1, failed: 1 });
  });

  it("honors shouldStop between cards", async () => {
    let calls = 0;
    const state = await globalThis.LIS.runSavedImport(
      makeDeps({
        collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
        shouldStop: () => calls > 0,
        capture: vi.fn(async () => {
          calls += 1;
          return { ok: true, post: {} };
        }),
      })
    );
    expect(state.stopped).toBe(true);
    expect(state.imported).toBe(1);
  });

  it("reports progress after every card", async () => {
    const onProgress = vi.fn();
    await globalThis.LIS.runSavedImport(
      makeDeps({
        collect: () => [{ url: "https://x/a" }, { url: "https://x/b" }],
        onProgress,
      })
    );
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls[1][0]).toMatchObject({ imported: 2 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/extension-import-saved.test.js`
Expected: FAIL — `runSavedImport is not a function`.

- [ ] **Step 3: Implement the engine**

In `extension/import-saved.js`, after `isRunFatalError`, add:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/extension-import-saved.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add extension/import-saved.js test/extension-import-saved.test.js
git commit -m "Add saved-posts import loop engine"
```

---

### Task 4: Banner rendering

**Files:**
- Modify: `extension/import-saved.js`
- Modify: `extension/content.css`
- Test: `test/extension-import-saved.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/extension-import-saved.test.js`:

```js
describe("import banner", () => {
  it("renders the idle state with a working Start button", () => {
    const onStart = vi.fn();
    const el = globalThis.LIS.renderImportBanner({ mode: "idle", onStart });
    expect(el.textContent).toMatch(/Import these saved posts/);
    el.querySelector("button").click();
    expect(onStart).toHaveBeenCalled();
  });

  it("renders running counters and a Stop button", () => {
    const onStop = vi.fn();
    const el = globalThis.LIS.renderImportBanner({
      mode: "running",
      state: { imported: 3, duplicates: 2, failed: 1 },
      onStop,
    });
    expect(el.textContent).toMatch(/Imported 3 · Already saved 2 · Failed 1/);
    el.querySelector("button").click();
    expect(onStop).toHaveBeenCalled();
  });

  it("renders a done summary and a fatal-error summary", () => {
    const done = globalThis.LIS.renderImportBanner({
      mode: "done",
      state: { imported: 5, duplicates: 0, failed: 0, stopped: false, fatalError: "" },
    });
    expect(done.textContent).toMatch(/Import finished\. Imported 5/);
    expect(done.querySelector("button")).toBeNull();

    const failed = globalThis.LIS.renderImportBanner({
      mode: "done",
      state: {
        imported: 2,
        duplicates: 0,
        failed: 0,
        stopped: false,
        fatalError: "server not reachable",
      },
    });
    expect(failed.textContent).toMatch(/Import stopped: server not reachable/);
  });

  it("renders the disconnected state without a button and reuses one element", () => {
    const el = globalThis.LIS.renderImportBanner({ mode: "disconnected" });
    expect(el.textContent).toMatch(/connect the extension/i);
    expect(el.querySelector("button")).toBeNull();
    const again = globalThis.LIS.renderImportBanner({ mode: "disconnected" });
    expect(again).toBe(el);
    expect(document.querySelectorAll("#lis-import-banner")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/extension-import-saved.test.js`
Expected: FAIL — `renderImportBanner is not a function`.

- [ ] **Step 3: Implement banner rendering**

In `extension/import-saved.js`, after `runSavedImport`, add:

```js
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
```

- [ ] **Step 4: Add banner styles**

Append to `extension/content.css`:

```css
.lis-import-banner {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(92vw, 640px);
  padding: 10px 16px;
  border-radius: 8px;
  background: #1d2226;
  color: #fff;
  font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.lis-import-banner__btn {
  flex-shrink: 0;
  border: 0;
  border-radius: 6px;
  padding: 6px 14px;
  background: #0a66c2;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.lis-import-banner__btn:hover {
  background: #085ca8;
}

.lis-import-banner__btn--stop {
  background: #5f6163;
}

.lis-import-banner__btn--stop:hover {
  background: #4b4d4f;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/extension-import-saved.test.js`
Expected: PASS (14 tests).

- [ ] **Step 6: Commit**

```bash
git add extension/import-saved.js extension/content.css test/extension-import-saved.test.js
git commit -m "Add saved-posts import banner UI"
```

---

### Task 5: Page wiring — controller, SPA watcher, manifest registration

**Files:**
- Modify: `extension/import-saved.js`
- Modify: `extension/manifest.json`

This is browser-only glue over already-tested pieces (`content.js` uses the same coalesced-observer pattern). It is exercised by the manual verification in Task 6 rather than unit tests: the boot path is inert under jsdom (`globalThis.chrome` is undefined), so the existing tests keep passing.

- [ ] **Step 1: Implement default effects and the run controller**

In `extension/import-saved.js`, after `renderImportBanner`, add:

```js
  function defaultDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // LinkedIn paginates the saved list with a "Show more results" button on
  // some builds and plain infinite scroll on others — do both.
  function clickShowMore() {
    for (const btn of document.querySelectorAll("button")) {
      if (/show more results/i.test((btn.textContent || "").trim())) {
        btn.click();
        return;
      }
    }
  }

  async function defaultLoadMore() {
    const before = LIS.findSavedPostItems().length;
    window.scrollTo(0, document.body.scrollHeight);
    clickShowMore();
    const deadline = Date.now() + NEW_CARDS_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await defaultDelay(NEW_CARDS_POLL_MS);
      if (LIS.findSavedPostItems().length !== before) return;
    }
  }

  let activeRun = null; // { stopRequested } while an import is in flight

  function startImport() {
    if (activeRun) return;
    const run = { stopRequested: false };
    activeRun = run;

    const rerender = (state) =>
      LIS.renderImportBanner({
        mode: "running",
        state,
        onStop: () => {
          run.stopRequested = true;
        },
      });
    rerender({ imported: 0, duplicates: 0, failed: 0 });

    LIS.runSavedImport({
      collect: () => LIS.findSavedPostItems(),
      extract: (item) => LIS.extractSavedItem(item),
      capture: (payload) =>
        LIS.capturePayload(payload, { createOnly: true, silent: true }),
      loadMore: defaultLoadMore,
      delay: defaultDelay,
      shouldStop: () =>
        run.stopRequested || activeRun !== run || !LIS.contextAlive(),
      onProgress: rerender,
    }).then((state) => {
      if (activeRun !== run) return; // user navigated away; banner is gone
      activeRun = null;
      LIS.renderImportBanner({ mode: "done", state });
    });
  }

  function showEntryBanner() {
    const started = LIS.safeStorageGet(
      ["extensionToken"],
      ({ extensionToken }) => {
        // Re-check: the async storage read may land after navigation.
        if (!LIS.isSavedPostsPath(location.pathname)) return;
        if (extensionToken) {
          LIS.renderImportBanner({ mode: "idle", onStart: startImport });
        } else {
          LIS.renderImportBanner({ mode: "disconnected" });
        }
      }
    );
    if (!started) removeBanner();
  }

  function onLocationMaybeChanged() {
    if (LIS.isSavedPostsPath(location.pathname)) {
      // Never clobber a running or finished banner; only add the entry banner
      // when none exists yet.
      if (!document.getElementById(BANNER_ID) && !activeRun) showEntryBanner();
    } else {
      if (activeRun) {
        activeRun.stopRequested = true;
        activeRun = null;
      }
      removeBanner();
    }
  }
```

- [ ] **Step 2: Implement the guarded boot**

At the end of the IIFE in `extension/import-saved.js` (after `onLocationMaybeChanged`), add:

```js
  function boot() {
    // Only boot as a real content script; under tests there is no chrome API.
    if (!globalThis.chrome?.runtime?.id) return;

    // LinkedIn is a SPA: URL changes don't re-run content scripts, so watch
    // DOM mutations (coalesced, same pattern as content.js) plus history nav.
    let timer = 0;
    function schedule() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = 0;
        if (!LIS.contextAlive()) return shutdown();
        onLocationMaybeChanged();
      }, 250);
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", schedule);
    onLocationMaybeChanged();

    function shutdown() {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("popstate", schedule);
      if (activeRun) {
        activeRun.stopRequested = true;
        activeRun = null;
      }
      removeBanner();
    }

    LIS.onContextInvalidated(shutdown);
  }

  boot();
```

- [ ] **Step 3: Register the script and bump the version**

In `extension/manifest.json`:
- Change `"version": "0.2.0"` to `"version": "0.3.0"`.
- In `content_scripts[0].js`, insert `"import-saved.js"` between `"native-save.js"` and `"content.js"`:

```json
      "js": [
        "lib/chrome-safe.js",
        "lib/extract.js",
        "lib/save.js",
        "native-save.js",
        "import-saved.js",
        "content.js"
      ],
```

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (the import-saved tests stay green because `boot()` is inert without `globalThis.chrome`).

- [ ] **Step 5: Commit**

```bash
git add extension/import-saved.js extension/manifest.json
git commit -m "Wire saved-posts import banner into the saved-posts page"
```

---

### Task 6: Verification and PR

- [ ] **Step 1: Full suite + build**

Run: `npx vitest run && npm run build`
Expected: tests pass; Vite build succeeds (the extension is plain files, but the build catches accidental web-app breakage).

- [ ] **Step 2: Manual verification on LinkedIn**

Load the unpacked extension from `extension/` (chrome://extensions → reload), then verify against the real page:

1. Visit `linkedin.com/my-items/saved-posts/` → banner appears; other pages (feed, `/my-items/saved-jobs/`) → no banner.
2. With the extension unpaired → banner shows the connect hint, no Start button.
3. Paired → Start import: list auto-scrolls, counters tick, posts appear in the web app with suggested tags and `metadata.importedFromSavedPosts: true`.
4. Re-run after completion → everything lands in "Already saved".
5. Stop mid-run → run halts between posts, summary shows "Import stopped."
6. Disconnect the extension (Settings → revoke) mid-run → run stops with the reconnect message; no toast spam.
7. SPA-navigate away mid-run (click Home) → banner disappears, run cancels.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/import-saved-posts
gh pr create --title "Import LinkedIn saved-posts backlog from my-items page" --body "$(cat <<'EOF'
Adds a one-click, re-runnable import of the user's existing LinkedIn saved-posts
backlog, per docs/superpowers/specs/2026-07-19-saved-posts-import-design.md:

- Banner on linkedin.com/my-items/saved-posts/ (paired ⇒ Start import;
  unpaired ⇒ connect hint)
- Auto-scrolls the whole list; card-level extraction via the existing
  findSavedPostItems/extractSavedItem helpers
- Saves through the normal pipeline with createOnly ⇒ re-runs never duplicate
  or overwrite tags; counters show Imported / Already saved / Failed
- Auth/network failures stop the run with the standard reconnect message;
  single-card failures are counted and skipped; no toast spam (new silent
  save option)
- No new permissions; no API or web-app changes; extension 0.2.0 → 0.3.0

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** trigger banner (T4/T5), auto-scroll whole list (T3 loop + T5 `defaultLoadMore`), card fidelity via existing extractors (T5 wiring), createOnly dedupe (T5 capture), progress + Stop (T3/T4/T5), fatal-vs-local errors (T2/T3), toast suppression (T1), SPA navigation cancel (T5), manifest registration (T5), tests (T1–T4), manual pass (T6). Out-of-scope items from the spec have no tasks, as intended.
- **Type consistency:** engine state `{ imported, duplicates, failed, stopped, fatalError }` is used identically in `runSavedImport`, `renderImportBanner`, and the controller; `capturePayload` option names (`createOnly`, `silent`) match Task 1's implementation.
