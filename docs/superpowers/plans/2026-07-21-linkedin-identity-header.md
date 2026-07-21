# LinkedIn Identity Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture and display LinkedIn's compact three-line post identity header: author and connection degree, headline, author action, publication time, and public visibility.

**Architecture:** Extend the existing DOM extractor with actor-scoped optional metadata stored inside the existing JSON metadata object, so no database migration is needed. Validate display metadata in `postCardMetadata.js`, then render it as three independent rows in `PostCard.jsx` with focused responsive CSS.

**Tech Stack:** JavaScript, React 18, Vitest, Testing Library, jsdom, CSS, Vite

---

### Task 1: Capture actor identity metadata

**Files:**
- Modify: `test/extract.test.js`
- Modify: `extension/lib/extract.js`

- [ ] **Step 1: Write the failing complete-identity extraction test**

Add this case to `test/extract.test.js`:

```js
describe("actor identity metadata", () => {
  it("captures degree, author action, time, and public visibility from the actor", () => {
    const post = mount(`
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:7123456789012345678">
        <div class="update-components-actor">
          ${AVATAR("https://www.linkedin.com/in/harvey-knight", "https://media.licdn.com/harvey.jpg", "View Harvey Knight’s profile", 48)}
          <span class="update-components-actor__title"><span aria-hidden="true">Harvey Knight · 2nd</span></span>
          <span class="update-components-actor__description">Founder | Investor | Helping Family Offices & HNWIs Access Private Markets</span>
          <a class="update-components-actor__meta-link" href="https://harvey.example.com">Visit my website</a>
          <span class="update-components-actor__sub-description">6h · <span aria-label="Visible to anyone on or off LinkedIn">🌐</span></span>
        </div>
        <div class="update-components-text">Identity metadata should stay separate from the post body.</div>
      </div>
    `);

    const captured = LIS.extract(post);
    expect(captured.author).toBe("Harvey Knight");
    expect(captured.authorHeadline).toBe("Founder | Investor | Helping Family Offices & HNWIs Access Private Markets");
    expect(captured.metadata.connectionDegree).toBe("2nd");
    expect(captured.metadata.authorAction).toEqual({
      text: "Visit my website",
      url: "https://harvey.example.com/",
    });
    expect(captured.metadata.publishedText).toBe("6h");
    expect(captured.metadata.visibility).toBe("public");
  });

  it("does not promote a body link into the author action", () => {
    const post = mount(`
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:7123456789012345678">
        <div class="update-components-actor">
          <span class="update-components-actor__title">Jane Doe</span>
        </div>
        <div class="update-components-text">
          Read the full article at <a href="https://example.com/article">example.com</a>
        </div>
      </div>
    `);

    expect(LIS.extract(post).metadata.authorAction).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the focused extraction tests and verify failure**

Run: `npm test -- test/extract.test.js`

Expected: FAIL because the extractor does not yet expose `connectionDegree`, `authorAction`, normalized `publishedText`, or `visibility`.

- [ ] **Step 3: Add bounded actor metadata extractors**

Add actor-scope helpers near `extractAuthor()` in `extension/lib/extract.js`:

```js
  const ACTOR_SCOPE_SELECTOR = [
    ".update-components-actor",
    ".feed-shared-actor",
    "[data-test-id='main-feed-activity-card__actor']",
  ].join(", ");

  function actorScope(postEl) {
    return postEl?.matches?.(ACTOR_SCOPE_SELECTOR)
      ? postEl
      : postEl?.querySelector?.(ACTOR_SCOPE_SELECTOR);
  }

  function extractConnectionDegree(postEl) {
    const actor = actorScope(postEl);
    const text = cleanLinkedInText(clean(actor));
    return text.match(/(?:^|[•·\s])((?:1st|2nd|3rd))(?:\b|$)/i)?.[1]?.toLowerCase() || "";
  }

  function extractAuthorAction(postEl) {
    const actor = actorScope(postEl);
    for (const link of actor?.querySelectorAll?.("a[href]") || []) {
      const url = canonicalLinkedInUrl(absoluteUrl(attr(link, "href")));
      const label = cleanLinkedInText(attr(link, "aria-label") || clean(link));
      if (!url || !/^https?:/i.test(url) || !label || isChromeText(label)) continue;
      if (/linkedin\.com\/(?:in|company|feed\/update)\//i.test(url)) continue;
      return { text: label.slice(0, 160), url };
    }
    return null;
  }

  function extractPublishedText(postEl) {
    const raw = firstText(postEl, [
      "time",
      ".update-components-actor__sub-description",
      ".feed-shared-actor__sub-description",
      ".update-components-actor__sub-description span[aria-hidden='true']",
    ]);
    return raw
      .replace(/visible to anyone on or off linkedin|public/gi, "")
      .replace(/[🌐🌎🌍🌏]/gu, "")
      .replace(/^[\s•·]+|[\s•·]+$/g, "")
      .trim();
  }

  function extractVisibility(postEl) {
    const actor = actorScope(postEl);
    const labels = [...(actor?.querySelectorAll?.("[aria-label], [title]") || [])]
      .map((el) => `${attr(el, "aria-label")} ${attr(el, "title")}`)
      .join(" ");
    const text = `${labels} ${clean(actor)}`;
    return /visible to anyone on or off linkedin|\bpublic\b|[🌐🌎🌍🌏]/iu.test(text)
      ? "public"
      : "";
  }
```

Strip the degree token in `cleanAuthor()` after its existing replacements:

```js
      .replace(/\s*[•·]\s*(?:1st|2nd|3rd)\b.*$/i, "")
```

In `LIS.extract`, replace the current `publishedText` scan with `extractPublishedText(postEl) || null`, and add these compact metadata properties:

```js
      connectionDegree: extractConnectionDegree(postEl) || null,
      authorAction: extractAuthorAction(postEl),
      visibility: extractVisibility(postEl) || null,
```

- [ ] **Step 4: Run extraction tests and verify success**

Run: `npm test -- test/extract.test.js`

Expected: all extraction tests PASS.

### Task 2: Validate optional card identity metadata

**Files:**
- Modify: `test/post-card-metadata.test.js`
- Modify: `src/postCardMetadata.js`

- [ ] **Step 1: Write failing validation tests**

Add these assertions to `test/post-card-metadata.test.js`:

```js
import {
  postCardAuthorAction,
  postCardConnectionDegree,
  postCardDate,
  postCardIsPublic,
} from "../src/postCardMetadata.js";

it("accepts bounded identity metadata", () => {
  const post = {
    metadata: {
      connectionDegree: "2nd",
      authorAction: { text: "Visit my website", url: "https://example.com" },
      visibility: "public",
    },
  };
  expect(postCardConnectionDegree(post)).toBe("2nd");
  expect(postCardAuthorAction(post)).toEqual({
    text: "Visit my website",
    url: "https://example.com/",
  });
  expect(postCardIsPublic(post)).toBe(true);
});

it("rejects malformed identity metadata", () => {
  const post = {
    metadata: {
      connectionDegree: "friend",
      authorAction: { text: "Open", url: "javascript:alert(1)" },
      visibility: "connections",
    },
  };
  expect(postCardConnectionDegree(post)).toBe("");
  expect(postCardAuthorAction(post)).toBeNull();
  expect(postCardIsPublic(post)).toBe(false);
});
```

- [ ] **Step 2: Run the metadata test and verify failure**

Run: `npm test -- test/post-card-metadata.test.js`

Expected: FAIL because the validation helpers are not exported.

- [ ] **Step 3: Implement minimal validation helpers**

Add to `src/postCardMetadata.js`:

```js
export function postCardConnectionDegree(post) {
  const value = String(post?.metadata?.connectionDegree || "").trim().toLowerCase();
  return /^(?:1st|2nd|3rd)$/.test(value) ? value : "";
}

export function postCardAuthorAction(post) {
  const action = post?.metadata?.authorAction;
  const text = String(action?.text || "").trim();
  if (!text) return null;
  try {
    const url = new URL(String(action?.url || ""));
    if (!/^https?:$/.test(url.protocol)) return null;
    return { text, url: url.href };
  } catch {
    return null;
  }
}

export function postCardIsPublic(post) {
  return post?.metadata?.visibility === "public";
}
```

- [ ] **Step 4: Run the metadata test and verify success**

Run: `npm test -- test/post-card-metadata.test.js`

Expected: all metadata tests PASS.

### Task 3: Render the three-line identity header

**Files:**
- Modify: `test/post-card-identity.test.jsx`
- Modify: `test/post-card-layout.test.js`
- Modify: `src/PostCard.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write the failing full-header rendering test**

Add a complete metadata record to `test/post-card-identity.test.jsx` and assert:

```js
it("renders the complete LinkedIn identity hierarchy", () => {
  const completePost = {
    ...post,
    author: "Harvey Knight",
    authorHeadline: "Founder | Investor | Helping Family Offices & HNWIs Access Private Markets",
    metadata: {
      connectionDegree: "2nd",
      authorAction: { text: "Visit my website", url: "https://harvey.example.com" },
      publishedText: "6h",
      visibility: "public",
    },
  };
  render(
    <PostCard post={completePost} onUpdated={vi.fn()} onDeleted={vi.fn()} onTagClick={vi.fn()} />
  );
  expect(screen.getByText("Harvey Knight")).toBeInTheDocument();
  expect(screen.getByText("2nd")).toBeInTheDocument();
  expect(screen.getByText(completePost.authorHeadline)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Visit my website" })).toHaveAttribute(
    "href",
    "https://harvey.example.com/"
  );
  expect(screen.getByText("6h")).toBeInTheDocument();
  expect(screen.getByLabelText("Public post")).toBeInTheDocument();
});
```

Update `test/post-card-layout.test.js` to require a 40px avatar, a separate headline row, and three mobile grid rows.

- [ ] **Step 2: Run focused card tests and verify failure**

Run: `npm test -- test/post-card-identity.test.jsx test/post-card-layout.test.js`

Expected: FAIL because the new fields and row structure are not rendered or styled.

- [ ] **Step 3: Render validated metadata as independent rows**

Import all metadata helpers in `src/PostCard.jsx`, resolve them once inside `PostCard`, and add:

```jsx
const PublicIcon = (props) => (
  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);
```

Render the author row with a muted separator and `connectionDegree`, render `headline` inside `.card-headline-row`, and render the third `.card-source` row with the validated author-action link, existing external source, date, and:

```jsx
{isPublic && (
  <span className="card-visibility" aria-label="Public post" title="Public post">
    <PublicIcon />
  </span>
)}
```

Only render separators between segments that are present.

- [ ] **Step 4: Style the compact three-row hierarchy**

In `src/styles.css`:

```css
.card-avatar { width: 40px; height: 40px; }
.card-connection { flex: 0 0 auto; color: var(--muted); font-size: var(--fs-xs); }
.card-headline-row {
  min-width: 0;
  overflow: hidden;
  color: var(--ink-2);
  font-size: var(--fs-xs);
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-author-action { color: var(--accent); font-weight: 600; text-decoration: none; }
.card-author-action:hover { text-decoration: underline; }
.card-visibility { display: inline-flex; flex: 0 0 auto; }
.card-visibility svg { fill: none; stroke: currentColor; stroke-width: 1.8; }
```

Update the mobile card grid to `40px minmax(0, 1fr) auto` with three auto rows; put `.card-headline-row` on row 2 and `.card-source` on row 3, both spanning columns 2 through 4.

- [ ] **Step 5: Run focused card tests and verify success**

Run: `npm test -- test/post-card-identity.test.jsx test/post-card-layout.test.js test/post-card-metadata.test.js`

Expected: all focused card tests PASS.

### Task 4: Verify and commit the fix

**Files:**
- Verify: `extension/lib/extract.js`
- Verify: `src/postCardMetadata.js`
- Verify: `src/PostCard.jsx`
- Verify: `src/styles.css`
- Verify: `test/extract.test.js`
- Verify: `test/post-card-metadata.test.js`
- Verify: `test/post-card-identity.test.jsx`
- Verify: `test/post-card-layout.test.js`

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Build the production bundle**

Run: `npm run build`

Expected: Vite exits successfully and writes `dist/`.

- [ ] **Step 3: Visually inspect desktop and mobile fixtures**

Render a representative complete-identity post at desktop and 390px mobile widths. Confirm the name, degree, headline, author action, time, and public icon are visible; the headline truncates; actions do not overlap; and the card has no horizontal overflow.

- [ ] **Step 4: Commit the implementation**

```bash
git add extension/lib/extract.js src/postCardMetadata.js src/PostCard.jsx src/styles.css test/extract.test.js test/post-card-metadata.test.js test/post-card-identity.test.jsx test/post-card-layout.test.js
git commit -m "fix: render complete LinkedIn post identity"
```
