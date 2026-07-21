# Source-Aware Native Save Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a normal feed post selected through its overflow trigger to be captured even when LinkedIn obfuscates the structural markers used by the generic post validator.

**Architecture:** Keep the existing ranked context store and strict validator. Change only fresh-context resolution so a connected, unexpired `trigger` candidate is authoritative, while `direct`, `menu-owner`, `proximity`, and broad fallback candidates continue to require the current validation path.

**Tech Stack:** JavaScript, Chrome Extension Manifest V3, Vitest, jsdom

---

## File responsibilities

- `test/native-save-context.test.js`: DOM-level regression coverage for native LinkedIn Save context selection.
- `extension/native-save.js`: source ranking, context lifetime, Save-action resolution, and capture dispatch.

### Task 1: Trust fresh trigger-bound context

**Files:**
- Modify: `test/native-save-context.test.js`
- Modify: `extension/native-save.js`

- [ ] **Step 1: Add the failing normal-feed regression test**

Add this test inside `describe("native Save context", ...)` in `test/native-save-context.test.js`:

```js
  it("trusts fresh trigger context for an obfuscated normal feed post", async () => {
    const { LIS, capturePost } = await loadNativeSave();
    document.body.innerHTML = `
      <div id="post">
        <button id="trigger" aria-label="Open control menu" aria-expanded="true">More</button>
        <strong>Paula Hübner Wehmeyer</strong>
        <p>Building General Intuition; prev partner @ General Catalyst</p>
      </div>
      <div role="menu"><button id="save" role="menuitem">Save</button></div>`;

    const post = document.getElementById("post");
    const trigger = document.getElementById("trigger");
    const save = document.getElementById("save");
    LIS.findPostFrom.mockImplementation((el) => (post.contains(el) ? post : null));
    LIS.findPosts = () => [post];

    LIS.onNativeSaveClick({ target: trigger, clientX: 100, clientY: 20 });
    LIS.onNativeSaveClick({ target: save, clientX: 900, clientY: 20 });

    expect(LIS.isReliablePostCandidate(post)).toBe(false);
    expect(capturePost).toHaveBeenCalledTimes(1);
    expect(capturePost).toHaveBeenCalledWith(post);
  });
```

The fixture intentionally lacks `data-reliable="true"`, matching a feed root whose normal LinkedIn markers are obfuscated.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npm test -- test/native-save-context.test.js
```

Expected: the new test fails because `capturePost` is not called; the existing overlay and proximity tests still pass.

- [ ] **Step 3: Make fresh context source-aware**

Replace `freshRememberedPost` in `extension/native-save.js` with:

```js
  function freshRememberedPost() {
    if (!hasFreshContext()) return null;
    if (recentContext.source === "trigger") return recentContext.postEl;
    return isReliable(recentContext.postEl) ? recentContext.postEl : null;
  }
```

This trusts only the root remembered from the user's overflow-trigger click. It does not alter `isReliablePostCandidate`, point lookup, fallback scanning, the TTL, or source priority.

- [ ] **Step 4: Run the focused context and extractor tests**

Run:

```bash
npm test -- test/native-save-context.test.js test/extract.test.js
```

Expected: all tests in both files pass, including:

- the new obfuscated normal-feed case;
- trigger context winning over a nearby overlay;
- overlay-only context producing no capture;
- validated proximity fallback remaining available.

- [ ] **Step 5: Commit the implementation**

Run:

```bash
git add extension/native-save.js test/native-save-context.test.js
git commit -m "fix: trust trigger-bound native save context"
```

Expected: one commit containing only the resolver change and its regression test.

### Task 2: Verify, package, and release

**Files:**
- Verify: `extension/native-save.js`
- Verify: `test/native-save-context.test.js`
- Generate: `linkedin-saver-extension.zip` (ignored build artifact)

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: all test files and tests pass.

- [ ] **Step 2: Build the production web app**

Run:

```bash
npm run build
```

Expected: Vite completes successfully and writes the production bundle to `dist/`.

- [ ] **Step 3: Rebuild and inspect the extension package**

Run:

```bash
npm run extension:package
unzip -p linkedin-saver-extension.zip native-save.js | rg -n 'recentContext.source === "trigger"'
```

Expected: packaging succeeds and the search prints the source-aware trust branch from the packaged extension.

- [ ] **Step 4: Review repository state**

Run:

```bash
git diff --check
git status --short --branch
git log --oneline -3
```

Expected: no whitespace errors, no unintended tracked changes, and the implementation commit is at `HEAD`.

- [ ] **Step 5: Push the verified commits**

Run:

```bash
git push origin main
```

Expected: the approved design, implementation plan, and implementation commits are present on remote `main`.

- [ ] **Step 6: Deploy and verify production**

Run:

```bash
vercel --prod
curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" https://linkedin-saver.vercel.app
```

Expected: Vercel reports a READY production deployment and the public URL returns HTTP 200.

- [ ] **Step 7: Reload and retest the unpacked extension**

In Chrome, reload LinkedIn Saver on `chrome://extensions`, refresh the open LinkedIn feed tab, then use `...` → `Save` on a normal feed post.

Expected: LinkedIn Saver shows the capturing and captured toasts rather than `couldn't find the post`; the saved card contains the post's author and body, not viewer or overlay text.
