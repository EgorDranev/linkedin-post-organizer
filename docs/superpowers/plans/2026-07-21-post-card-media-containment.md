# Post Card Media Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep captured post media compact in a 16:9 preview while showing the complete image without cropping.

**Architecture:** Preserve the existing post-card component and data flow. Replace only the natural-height media CSS contract with a fixed-ratio frame and a contained image, then protect the behavior with the existing CSS regression test.

**Tech Stack:** CSS, Vitest, Vite, React

---

### Task 1: Lock the contained-media contract with a failing test

**Files:**
- Modify: `test/post-card-layout.test.js:13-18`

- [ ] **Step 1: Replace the natural-height assertion with the approved containment contract**

```js
it("contains captured media in a 16:9 preview without cropping", () => {
  const mediaFrameRule = css.match(/\.card-media-frame\s*\{([^}]*)\}/s)?.[1] || "";
  const mediaImageRule = css.match(/\.card-media-frame img\s*\{([^}]*)\}/s)?.[1] || "";

  expect(mediaFrameRule).toContain("aspect-ratio: 16 / 9");
  expect(mediaFrameRule).toContain("overflow: hidden");
  expect(mediaFrameRule).toContain("display: grid");
  expect(mediaFrameRule).toContain("place-items: center");
  expect(mediaImageRule).toContain("position: absolute");
  expect(mediaImageRule).toContain("inset: 0");
  expect(mediaImageRule).toContain("width: 100%");
  expect(mediaImageRule).toContain("height: 100%");
  expect(mediaImageRule).toContain("object-fit: contain");
  expect(mediaImageRule).not.toContain("height: auto");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- test/post-card-layout.test.js`

Expected: FAIL because the frame does not contain `aspect-ratio: 16 / 9`, and the image still uses `height: auto`.

### Task 2: Implement the minimal media containment CSS

**Files:**
- Modify: `src/styles.css:892-903`

- [ ] **Step 1: Replace the natural-height media rules**

```css
.card-media-frame {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--surface-3);
}
/* Keep the complete captured image visible inside a compact preview. */
.card-media-frame img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}
```

- [ ] **Step 2: Run the focused test and verify it passes**

Run: `npm test -- test/post-card-layout.test.js`

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: all test files and tests pass.

- [ ] **Step 4: Build the production bundle**

Run: `npm run build`

Expected: Vite completes successfully and writes the production bundle to `dist/`.

### Task 3: Verify the visual result and publish it

**Files:**
- Verify: `src/styles.css`
- Verify: `test/post-card-layout.test.js`

- [ ] **Step 1: Render a desktop card with a tall portrait image**

Use a 1280px-wide browser viewport and a tall mock image. Confirm the media frame remains 16:9, the full image is visible, neutral side space appears, and the page has no horizontal overflow.

- [ ] **Step 2: Render the same card at mobile width**

Use a 390px-wide browser viewport. Confirm the frame scales fluidly, keeps the full image visible, and does not introduce horizontal overflow.

- [ ] **Step 3: Commit the implementation**

```bash
git add src/styles.css test/post-card-layout.test.js docs/superpowers/plans/2026-07-21-post-card-media-containment.md
git commit -m "fix: contain post media previews"
```

- [ ] **Step 4: Deploy the verified commit to Vercel production**

Run: `vercel --prod --yes`

Expected: Vercel reports the deployment ready and aliases it to `https://linkedin-saver.vercel.app`.

- [ ] **Step 5: Verify production health and stylesheet**

Confirm `https://linkedin-saver.vercel.app/api/health` returns HTTP 200 and the production stylesheet contains the 16:9 contained-media rules.
