# Post Card Identity Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a consistent two-line post identity header with publication-date precedence and a saved-date fallback.

**Architecture:** Add one pure metadata formatter so date precedence and invalid-value handling are independently testable. Feed its result into the existing `PostCard` header, then tighten only the existing identity CSS so the metadata truncates before the fixed date and actions.

**Tech Stack:** React, CSS, Vitest, Testing Library, Vite

---

### Task 1: Define date precedence with failing unit tests

**Files:**
- Create: `test/post-card-metadata.test.js`
- Create: `src/postCardMetadata.js`

- [ ] **Step 1: Add focused tests for every date source**

```js
import { describe, expect, it } from "vitest";
import { postCardDate } from "../src/postCardMetadata.js";

describe("post card date metadata", () => {
  it("prefers the exact publication date over captured relative text", () => {
    expect(
      postCardDate({
        savedAt: "2026-07-21T10:00:00.000Z",
        metadata: {
          publishedDate: "2026-07-19T10:00:00.000Z",
          publishedText: "2d",
        },
      })
    ).toEqual({ text: "Jul 19 2026", title: "Published Jul 19 2026" });
  });

  it("uses captured publication text when the exact date is unavailable", () => {
    expect(
      postCardDate({
        savedAt: "2026-07-21T10:00:00.000Z",
        metadata: { publishedDate: "invalid", publishedText: "2d" },
      })
    ).toEqual({ text: "2d", title: "Published 2d" });
  });

  it("falls back to the saved date", () => {
    expect(
      postCardDate({ savedAt: "2026-07-21T10:00:00.000Z", metadata: {} })
    ).toEqual({ text: "Saved Jul 21 2026", title: "Saved Jul 21 2026" });
  });

  it("omits invalid empty metadata", () => {
    expect(
      postCardDate({ savedAt: "invalid", metadata: { publishedText: "  " } })
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- test/post-card-metadata.test.js`

Expected: FAIL because `src/postCardMetadata.js` does not exist.

- [ ] **Step 3: Add the pure formatter**

```js
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return DATE_FORMATTER.format(date).replace(",", "");
}

export function postCardDate(post) {
  const publishedDate = formatDate(post?.metadata?.publishedDate);
  if (publishedDate) {
    return { text: publishedDate, title: `Published ${publishedDate}` };
  }

  const publishedText = String(post?.metadata?.publishedText || "").trim();
  if (publishedText) {
    return { text: publishedText, title: `Published ${publishedText}` };
  }

  const savedDate = formatDate(post?.savedAt);
  if (savedDate) {
    const text = `Saved ${savedDate}`;
    return { text, title: text };
  }

  return null;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- test/post-card-metadata.test.js`

Expected: PASS with four passing tests.

### Task 2: Render the formatted date in the identity header

**Files:**
- Modify: `src/PostCard.jsx:1-3, 587-591, 703-720`
- Create: `test/post-card-identity.test.jsx`

- [ ] **Step 1: Add a failing rendering test for the saved-date fallback**

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PostCard } from "../src/PostCard.jsx";

vi.mock("../src/api.js", () => ({
  api: { updatePost: vi.fn() },
}));

const post = {
  id: 1,
  url: "https://www.linkedin.com/posts/example",
  author: "Sahil Bloom",
  authorHeadline: "NYT Bestselling Author | Entrepreneur",
  text: "The best mental health hack is physical.",
  savedAt: "2026-07-21T10:00:00.000Z",
  tags: [],
  suggested: [],
  metadata: {},
  media: [],
};

describe("post card identity metadata", () => {
  it("renders headline and saved-date fallback without an empty separator", () => {
    const { container } = render(
      <PostCard
        post={post}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
        onTagClick={vi.fn()}
      />
    );

    expect(screen.getByText("NYT Bestselling Author | Entrepreneur")).toBeInTheDocument();
    expect(screen.getByText("Saved Jul 21 2026")).toBeInTheDocument();
    expect(container.querySelectorAll(".card-source .meta-sep")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the rendering test and verify it fails**

Run: `npm test -- test/post-card-identity.test.jsx`

Expected: FAIL because the current header omits the saved-date fallback.

- [ ] **Step 3: Import and render the formatted date metadata**

Import `postCardDate` from `./postCardMetadata.js`, compute `dateMeta` next to the other identity values, and replace the `publishedText` conditions with `dateMeta`:

```jsx
const dateMeta = postCardDate(post);

{(headline || externalSource || dateMeta) && (
  <span className="card-source">
    {headline && <span className="card-headline">{headline}</span>}
    {headline && externalSource && (
      <span className="meta-sep" aria-hidden="true">·</span>
    )}
    {externalSource && (
      <span className="card-source-name">{externalSource}</span>
    )}
    {(headline || externalSource) && dateMeta && (
      <span className="meta-sep" aria-hidden="true">·</span>
    )}
    {dateMeta && (
      <span className="card-source-time" title={dateMeta.title}>
        {dateMeta.text}
      </span>
    )}
  </span>
)}
```

- [ ] **Step 4: Run metadata and rendering tests**

Run: `npm test -- test/post-card-metadata.test.js test/post-card-identity.test.jsx`

Expected: PASS with all focused tests passing.

### Task 3: Match the compact reference layout and verify the application

**Files:**
- Modify: `src/styles.css:624-712`
- Modify: `test/post-card-layout.test.js`

- [ ] **Step 1: Add failing CSS contract assertions**

Add an identity-layout test that expects a 32px avatar, a flexible headline, and a fixed date:

```js
it("keeps identity metadata compact while preserving the date", () => {
  expect(css).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.card-id\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*32px minmax\(0, 1fr\) auto/s);
  expect(css).toMatch(/\.card-avatar\s*\{[^}]*width:\s*32px[^}]*height:\s*32px/s);
  expect(css).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.card-id-main\s*\{[^}]*display:\s*contents/s);
  expect(css).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.card-source\s*\{[^}]*grid-column:\s*2 \/ 4/s);
  expect(css).toMatch(/\.card-headline\s*\{[^}]*flex:\s*1 1 auto[^}]*min-width:\s*0/s);
  expect(css).toMatch(/\.card-source-time\s*\{[^}]*flex:\s*0 0 auto[^}]*white-space:\s*nowrap/s);
});
```

- [ ] **Step 2: Run the CSS contract test and verify it fails**

Run: `npm test -- test/post-card-layout.test.js`

Expected: FAIL because the header still uses a single flex row, the avatar is 36px, and the headline has no explicit flexible sizing.

- [ ] **Step 3: Apply the minimal identity CSS update**

```css
.card-avatar {
  width: 32px;
  height: 32px;
}

.card-headline {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 560px) {
  .card-id {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    column-gap: var(--space-2);
  }
  .card-id-main { display: contents; }
  .card-id-line { grid-column: 2; grid-row: 1; }
  .card-id > .card-actions { grid-column: 3; grid-row: 1; margin-left: 0; }
  .card-source { grid-column: 2 / 4; grid-row: 2; }
}
```

Keep the existing muted type, separators, `card-source-time` fixed sizing, action controls, and theme values unchanged.

- [ ] **Step 4: Run the complete verification suite**

Run: `npm test`

Expected: all test files and tests pass.

Run: `npm run build`

Expected: Vite completes successfully and writes the production bundle to `dist/`.

- [ ] **Step 5: Verify desktop and mobile geometry**

Render a card with a long headline at 1280px and 390px viewports. Confirm the author remains visible, the headline truncates, the date and action controls remain visible, the identity block stays two lines, and there is no horizontal overflow.

- [ ] **Step 6: Commit the verified implementation**

```bash
git add src/postCardMetadata.js src/PostCard.jsx src/styles.css test/post-card-metadata.test.js test/post-card-identity.test.jsx test/post-card-layout.test.js docs/superpowers/plans/2026-07-21-post-card-identity-metadata.md
git commit -m "fix: complete post identity metadata"
```
