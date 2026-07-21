# Native Save Context Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent LinkedIn's portaled Save menu from replacing the intended post with a comment or image overlay before capture.

**Architecture:** Add a bounded post-candidate validator to the extractor and track native-save context with explicit source quality. Trigger-bound context outranks direct and proximity fallbacks during the existing 20-second TTL; dropdown clicks do not perform point-based replacement.

**Tech Stack:** JavaScript, Chrome Extension Manifest V3, Vitest, jsdom

---

### Task 1: Reproduce the portaled-menu capture failure

**Files:**
- Create: `test/native-save-context.test.js`

- [ ] **Step 1: Add a native-save test harness**

Create `test/native-save-context.test.js` with a fresh `LIS` namespace, safe storage stubs, DOM candidates, and a mocked `capturePost`:

```js
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadNativeSave() {
  const capturePost = vi.fn(async () => ({ ok: true }));
  const showToast = vi.fn();
  globalThis.LIS = {
    capturePost,
    showToast,
    safeStorageGet: (_keys, callback) => callback({}),
    safeStorageSet: vi.fn(),
    primeViewerIdentity: vi.fn(),
    findPosts: () => [],
    findBestPostCandidate: vi.fn(() => null),
    findPostFrom: vi.fn(() => null),
    findPostNearPoint: vi.fn(() => null),
    isReliablePostCandidate: (el) => el?.dataset?.reliable === "true",
  };
  vi.resetModules();
  await import("../extension/native-save.js");
  return { LIS: globalThis.LIS, capturePost, showToast };
}

afterEach(() => {
  document.body.innerHTML = "";
  delete globalThis.LIS;
});
```

- [ ] **Step 2: Add the failing Suprava regression**

Add a test with a reliable post, its overflow trigger, a portaled Save menu, and a competing overlay:

```js
it("keeps trigger-bound post context when the portaled Save menu sits over an overlay", async () => {
  const { LIS, capturePost } = await loadNativeSave();
  document.body.innerHTML = `
    <article id="post" data-reliable="true">
      <button id="trigger" aria-label="Open control menu" aria-expanded="true">More</button>
      <strong>Suprava Sabat</strong>
      <p>Connect CLAUDE to LinkedIn in one click. One MCP.</p>
    </article>
    <div id="overlay"><strong>Egor Dranev</strong><p>Image in comment shared by Suprava Sabat</p></div>
    <div role="menu"><button id="save" role="menuitem">Save</button></div>`;

  const post = document.getElementById("post");
  const overlay = document.getElementById("overlay");
  const trigger = document.getElementById("trigger");
  const save = document.getElementById("save");
  LIS.findPostFrom.mockImplementation((el) => (post.contains(el) ? post : null));
  LIS.findPostNearPoint.mockImplementation((x) => (x > 500 ? overlay : post));
  LIS.findPosts = () => [post];

  LIS.onNativeSaveClick({ target: trigger, clientX: 100, clientY: 20 });
  LIS.onNativeSaveClick({ target: save, clientX: 900, clientY: 20 });

  expect(capturePost).toHaveBeenCalledTimes(1);
  expect(capturePost).toHaveBeenCalledWith(post);
});
```

- [ ] **Step 3: Add invalid-overlay and proximity fallback tests**

Add these cases:

```js
it("refuses an overlay-only candidate", async () => {
  const { LIS, capturePost, showToast } = await loadNativeSave();
  document.body.innerHTML = `
    <div id="overlay"><strong>Egor Dranev</strong><p>Image in comment shared by Suprava Sabat</p></div>
    <div role="menu"><button id="save" role="menuitem">Save</button></div>`;
  const overlay = document.getElementById("overlay");
  const save = document.getElementById("save");
  LIS.findPostNearPoint.mockReturnValue(overlay);
  LIS.findBestPostCandidate.mockReturnValue(overlay);

  LIS.onNativeSaveClick({ target: save, clientX: 900, clientY: 20 });

  expect(capturePost).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith(
    "LinkedIn Saver: couldn't find the post — try ⋯ → Save again",
    "error"
  );
});

it("keeps proximity fallback when no stronger context exists", async () => {
  const { LIS, capturePost } = await loadNativeSave();
  document.body.innerHTML = `
    <article id="post" data-reliable="true"><p>A reliable nearby post body.</p></article>
    <button id="save" role="button">Save</button>`;
  const post = document.getElementById("post");
  const save = document.getElementById("save");
  LIS.findPostNearPoint.mockReturnValue(post);

  LIS.onNativeSaveClick({ target: save, clientX: 100, clientY: 20 });

  expect(capturePost).toHaveBeenCalledWith(post);
});
```

- [ ] **Step 4: Run the regression test and verify failure**

Run: `npm test -- test/native-save-context.test.js`

Expected: the Suprava case captures the overlay, and the overlay-only case calls `capturePost`.

### Task 2: Validate capture candidates

**Files:**
- Modify: `extension/lib/extract.js`
- Modify: `test/extract.test.js`

- [ ] **Step 1: Write failing candidate-validation tests**

Add tests that call `LIS.isReliablePostCandidate` for:

```js
const post = mount(`
  <article data-urn="urn:li:activity:7123456789012345678">
    <div class="update-components-actor"><strong>Suprava Sabat</strong></div>
    <div class="update-components-text">Connect CLAUDE to LinkedIn in one click. One MCP.</div>
  </article>`);
expect(LIS.isReliablePostCandidate(post)).toBe(true);

const overlay = mount(`
  <div class="image-viewer-overlay">
    <strong>Egor Dranev</strong>
    <span>Image in comment shared by Suprava Sabat</span>
  </div>`);
expect(LIS.isReliablePostCandidate(overlay)).toBe(false);
```

- [ ] **Step 2: Run the focused extractor test and verify failure**

Run: `npm test -- test/extract.test.js`

Expected: FAIL because `LIS.isReliablePostCandidate` is not defined.

- [ ] **Step 3: Export a conservative candidate validator**

Add near the post-root helpers in `extension/lib/extract.js`:

```js
  LIS.isReliablePostCandidate = function isReliablePostCandidate(el) {
    if (!el?.querySelector) return false;
    if (getIdentity(el)) return true;
    if (
      el.matches?.(
        "div.feed-shared-update-v2, div.update-components-activity, .fie-impression-container, [data-view-name='feed-full-update']"
      )
    ) {
      return true;
    }

    const actor = el.querySelector(".update-components-actor, .feed-shared-actor");
    const commentary = el.querySelector(
      ".update-components-text, .feed-shared-inline-show-more-text, [data-test-id*='commentary'], [data-test-id*='post-content']"
    );
    const control = el.querySelector(
      ".feed-shared-control-menu__trigger, button[aria-label*='control menu' i], button[aria-label*='more actions' i]"
    );
    return Boolean((actor && (commentary || control)) || (commentary && control));
  };
```

- [ ] **Step 4: Run extractor tests and verify success**

Run: `npm test -- test/extract.test.js`

Expected: all extraction tests PASS.

### Task 3: Preserve higher-quality native-save context

**Files:**
- Modify: `extension/native-save.js`
- Test: `test/native-save-context.test.js`

- [ ] **Step 1: Replace unconditional recent context with ranked context**

Use explicit source priorities:

```js
  const CONTEXT_QUALITY = {
    proximity: 1,
    direct: 2,
    "menu-owner": 3,
    trigger: 4,
  };
  const recentContext = { postEl: null, at: 0, source: "proximity" };

  function hasFreshContext(now = Date.now()) {
    return Boolean(
      recentContext.postEl?.isConnected && now - recentContext.at < CONTEXT_TTL_MS
    );
  }

  function rememberPost(postEl, source = "direct") {
    if (!postEl?.isConnected) return false;
    const now = Date.now();
    if (
      hasFreshContext(now) &&
      CONTEXT_QUALITY[source] < CONTEXT_QUALITY[recentContext.source]
    ) {
      return false;
    }
    recentContext.postEl = postEl;
    recentContext.at = now;
    recentContext.source = source;
    return true;
  }

  function rememberPostContext(target, source = "direct") {
    return rememberPost(LIS.findPostFrom(target), source);
  }

  function rememberPostAtPoint(x, y) {
    return rememberPost(LIS.findPostNearPoint?.(x, y), "proximity");
  }
```

Pass `trigger`, `direct`, `menu-owner`, or `proximity` at every call site rather than relying on DOM timing.

- [ ] **Step 2: Stop dropdown clicks from performing point replacement**

Update `LIS.onNativeSaveClick`:

```js
  LIS.onNativeSaveClick = function onNativeSaveClick(event) {
    const action = getActionElement(event.target);
    const trigger = event.target?.closest?.(OVERFLOW_TRIGGER);
    if (trigger) {
      rememberPostContext(trigger, "trigger");
    } else if (!isInDropdown(action)) {
      rememberPostContext(event.target, "direct");
      rememberPostAtPoint(event.clientX, event.clientY);
    }
    handleSaveClick(event.target);
  };
```

Update hover and pointer handlers so proximity is always lower quality and overflow-trigger context is always `trigger` quality.

- [ ] **Step 3: Validate every resolved candidate before capture**

Add:

```js
  function reliable(candidate) {
    return Boolean(candidate && LIS.isReliablePostCandidate?.(candidate));
  }

  function freshRememberedPost() {
    return hasFreshContext() && reliable(recentContext.postEl)
      ? recentContext.postEl
      : null;
  }

  function resolvePostForSave(target) {
    const direct = LIS.findPostFrom(target);
    if (reliable(direct)) return direct;

    const menuOwner = resolvePostFromOpenMenu();
    if (reliable(menuOwner)) {
      rememberPost(menuOwner, "menu-owner");
      return menuOwner;
    }

    const remembered = freshRememberedPost();
    if (remembered) return remembered;

    const fallback = LIS.findBestPostCandidate?.(getActionElement(target));
    return reliable(fallback) ? fallback : null;
  }
```

Make `resolvePostForSave` return only reliable direct, menu-owner, fresh remembered, or fallback candidates. If none is reliable, retain the existing error toast and skip `LIS.capturePost`.

- [ ] **Step 4: Run native-save regression tests and verify success**

Run: `npm test -- test/native-save-context.test.js test/extract.test.js`

Expected: all native-save and extractor tests PASS.

### Task 4: Verify, package, and release

**Files:**
- Verify: `extension/lib/extract.js`
- Verify: `extension/native-save.js`
- Verify: `test/extract.test.js`
- Verify: `test/native-save-context.test.js`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Build the web app and extension package**

Run: `npm run build`

Expected: Vite production build succeeds.

Run: `npm run extension:package`

Expected: `linkedin-saver-extension.zip` contains the updated `lib/extract.js` and `native-save.js`.

- [ ] **Step 3: Commit the implementation**

```bash
git add extension/lib/extract.js extension/native-save.js test/extract.test.js test/native-save-context.test.js
git commit -m "fix: preserve native save post context"
```

- [ ] **Step 4: Push and deploy**

Run: `git push origin main`

Expected: `main` advances to the implementation commit.

Run: `vercel --prod`

Expected: the deployment is aliased to `https://linkedin-saver.vercel.app` and reports Ready.
