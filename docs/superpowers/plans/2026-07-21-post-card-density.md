# Post Card Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center saved-post cards in a compact 720px column and render media at its natural aspect ratio without changing the light theme or card behavior.

**Architecture:** This is a CSS-only presentation change. Add a small source-level regression test for the layout contract, then update the existing design tokens, section container, card spacing, media sizing, and mobile rules in `src/styles.css`.

**Tech Stack:** CSS, Vitest, Node.js built-in filesystem API

---

### Task 1: Add the post-card layout contract

**Files:**
- Create: `test/post-card-layout.test.js`
- Test: `test/post-card-layout.test.js`

- [ ] **Step 1: Write the failing layout-contract test**

```js
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

describe("post card layout", () => {
  it("uses the approved focused column and compact card spacing", () => {
    expect(css).toMatch(/--card-max:\s*720px/);
    expect(css).toMatch(/\.section\s*\{[^}]*max-width:\s*var\(--card-max\)/s);
    expect(css).toMatch(/\.card-content\s*\{[^}]*padding:\s*var\(--space-4\)/s);
  });

  it("lets captured media use its natural aspect ratio", () => {
    const mediaImageRule = css.match(/\.card-media-frame img\s*\{([^}]*)\}/s)?.[1] || "";
    expect(mediaImageRule).toContain("height: auto");
    expect(mediaImageRule).not.toContain("max-height: 480px");
    expect(mediaImageRule).not.toContain("aspect-ratio: auto 16 / 9");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- test/post-card-layout.test.js`

Expected: FAIL because `--card-max`, centered section width, compact padding, and natural image height are not yet present.

### Task 2: Implement the focused card layout

**Files:**
- Modify: `src/styles.css:1-90`
- Modify: `src/styles.css:406-428`
- Modify: `src/styles.css:520-1060`
- Modify: `src/styles.css:1451-1466`
- Test: `test/post-card-layout.test.js`

- [ ] **Step 1: Add the card-width token and center post sections**

Add `--card-max: 720px` beside the existing layout tokens. Update `.section` to use `width: 100%`, `max-width: var(--card-max)`, and automatic horizontal margins while retaining its current top spacing.

- [ ] **Step 2: Tighten the card without changing its structure**

Change `.card-content` to `padding: var(--space-4)`. Reduce the avatar to 36px, use 32px desktop action targets, reduce the action gaps and delete divider offset, and tighten the vertical margins for post text, media, stats, topics, and tags to the existing 8pt spacing scale.

- [ ] **Step 3: Remove portrait-media letterboxing**

Replace the card image constraints with:

```css
.card-media-frame img {
  width: 100%;
  height: auto;
  display: block;
}
```

This preserves the complete captured image and lets its intrinsic ratio determine height.

- [ ] **Step 4: Preserve usable mobile controls**

Inside the existing `@media (max-width: 560px)` block, keep the 16px page gutter and set `.card-btn` to 40px square. Keep the card at the full available width; existing `min-width: 0` rules continue to ellipsize long identity metadata.

- [ ] **Step 5: Run focused and full automated checks**

Run: `npm test -- test/post-card-layout.test.js`

Expected: PASS.

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: Vite production build succeeds.

### Task 3: Verify visual behavior

**Files:**
- Verify: `src/styles.css`

- [ ] **Step 1: Render representative desktop and mobile cards**

Use mocked post data containing portrait media, landscape media, gallery count, long text, long author metadata, accepted tags, and suggested tags. Render at approximately 1040px and 390px viewport widths.

- [ ] **Step 2: Check the approved visual contract**

Confirm that the card column is centered and capped at 720px, card padding is 16px, portrait media fills the available width without side letterboxing or cropping, actions remain visible, long identity text truncates, and mobile cards do not overflow.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check && git diff -- src/styles.css test/post-card-layout.test.js`

Expected: no whitespace errors and only the approved CSS/test scope is changed.
