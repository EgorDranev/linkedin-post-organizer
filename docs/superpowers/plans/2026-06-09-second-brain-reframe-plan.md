# Second Brain Reframe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe LinkedIn Saver around a plain-language "second brain" loop (Capture → Organize → Distill → Reuse) through copy relabels and one new `LoopCard` surface — no schema change, no new dependencies.

**Architecture:** Front-end only. The genuinely-pure logic (loop progress counts, the four loop steps, the dismissal flag) is extracted into a React-free ESM module `src/lib/loop.mjs` and unit-tested with Node's built-in `node:test` (zero new deps). The one new component `src/LoopCard.jsx` is presentational and consumes that module; it is verified by build + manual/visual check (the project has no DOM testing library and the spec forbids adding one). All other changes are copy/label edits in existing components plus two positioning docs. Note from grounding: there is **no per-post "file" button** — a post auto-flips `review → filed` server-side when it gets its first tag (`api/posts/[id].js:29`), so "Organize = tag it" and `PostCard.jsx` needs no change.

**Tech Stack:** Vite 5 + React 18 (no TypeScript), plain CSS design tokens in `src/styles.css`, Node `node:test` for unit tests. Spec: `docs/superpowers/specs/2026-06-09-second-brain-reframe-design.md`.

---

## File Structure

**Create:**
- `src/lib/loop.mjs` — pure loop helpers: `LOOP_STEPS`, `LOOPCARD_DISMISS_KEY`, `loopCounts(posts)`, `readDismissed(storage)`, `writeDismissed(storage, dismissed)`. React-free so it is unit-testable under Node.
- `src/LoopCard.jsx` — the single new surface: teaches the loop once + shows a calm progress line with an "Organize N →" nudge. Consumes `src/lib/loop.mjs`.
- `test/loop.test.mjs` — `node:test` unit tests for `src/lib/loop.mjs`.

**Modify:**
- `package.json` — add a `test` script (`node --test`).
- `src/App.jsx` — brand tagline, mount `LoopCard`, scroll-target ref on the organize section, section-title relabels, empty-state copy, export-button label.
- `src/CollectionSidebar.jsx` — create-form description placeholder copy.
- `src/styles.css` — `.brand-text` / `.brand-tagline` and the `.loopcard*` rules.
- `.agents/product-marketing-context.md` — supporting category line, sharpened "5 competitors" objection, voice note.
- `docs/jobs-to-be-done.md` — one positioning note.

**Unchanged (called out so the implementer doesn't go looking):** `src/PostCard.jsx`, anything under `api/`, `extension/`, and the DB layer.

---

## Task 1: Pure loop module + test harness (TDD)

**Files:**
- Modify: `package.json` (scripts block)
- Test: `test/loop.test.mjs`
- Create: `src/lib/loop.mjs`

- [ ] **Step 1: Add the test script**

In `package.json`, add a `test` entry to the existing `scripts` object (which currently holds `dev`, `build`, `preview`, `ship`, `ext:watch`, `export`). The glob is shell-expanded, so it works on any Node ≥18 that supports `--test`:

```json
"test": "node --test test/*.test.mjs",
```

- [ ] **Step 2: Write the failing test**

Create `test/loop.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOOP_STEPS,
  LOOPCARD_DISMISS_KEY,
  loopCounts,
  readDismissed,
  writeDismissed,
} from "../src/lib/loop.mjs";

test("LOOP_STEPS lists the four loop verbs in order, each with copy", () => {
  assert.deepEqual(
    LOOP_STEPS.map((s) => s.key),
    ["capture", "organize", "distill", "reuse"]
  );
  for (const step of LOOP_STEPS) {
    assert.ok(step.label, "each step has a label");
    assert.ok(step.line, "each step has a one-line description");
  }
});

test("loopCounts splits posts into captured / toOrganize / organized", () => {
  const posts = [
    { status: "review" },
    { status: "filed" },
    { status: "filed" },
    { status: "review" },
  ];
  assert.deepEqual(loopCounts(posts), { captured: 4, toOrganize: 2, organized: 2 });
});

test("loopCounts treats any non-filed (or missing) status as toOrganize", () => {
  const posts = [{ status: "filed" }, { status: undefined }, {}];
  assert.deepEqual(loopCounts(posts), { captured: 3, toOrganize: 2, organized: 1 });
});

test("loopCounts is safe on empty / non-array input", () => {
  assert.deepEqual(loopCounts([]), { captured: 0, toOrganize: 0, organized: 0 });
  assert.deepEqual(loopCounts(undefined), { captured: 0, toOrganize: 0, organized: 0 });
});

test("dismissal round-trips through an injected storage", () => {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  assert.equal(readDismissed(storage), false);
  writeDismissed(storage, true);
  assert.equal(store.get(LOOPCARD_DISMISS_KEY), "1");
  assert.equal(readDismissed(storage), true);
  writeDismissed(storage, false);
  assert.equal(readDismissed(storage), false);
});

test("dismissal helpers never throw when storage is unavailable", () => {
  assert.equal(readDismissed(null), false);
  assert.doesNotThrow(() => writeDismissed(null, true));
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — the run errors with `Cannot find module '.../src/lib/loop.mjs'` (module not created yet).

- [ ] **Step 4: Write the minimal implementation**

Create `src/lib/loop.mjs`:

```js
// Pure loop-state helpers shared by App and LoopCard. No React, no DOM — so the
// counting + dismissal logic is unit-testable with node:test (zero deps).

// The four plain-language verbs of the capture→reuse loop, taught once in the
// LoopCard. `key` is a stable React key; `label`/`line` are user-facing copy.
export const LOOP_STEPS = [
  { key: "capture", label: "Capture", line: "Capture it the moment you see it" },
  { key: "organize", label: "Organize", line: "Organize the keepers" },
  { key: "distill", label: "Distill", line: "Distill the gold" },
  { key: "reuse", label: "Reuse", line: "Reuse it in your work" },
];

// localStorage key for the collapsed/dismissed state of the LoopCard.
export const LOOPCARD_DISMISS_KEY = "lin-saver:loopcard-dismissed";

// Derive the loop's progress from the FULL posts array (not the filtered view):
// everything captured, how many still need a tag, how many are filed. Identity
// holds: captured === toOrganize + organized.
export function loopCounts(posts) {
  const list = Array.isArray(posts) ? posts : [];
  let organized = 0;
  for (const post of list) {
    if (post && post.status === "filed") organized += 1;
  }
  return {
    captured: list.length,
    toOrganize: list.length - organized,
    organized,
  };
}

// Dismissal takes an injected storage object (window.localStorage in the app, a
// fake in tests) so the helpers stay pure and never throw in private mode / SSR.
export function readDismissed(storage) {
  try {
    return storage != null && storage.getItem(LOOPCARD_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDismissed(storage, dismissed) {
  try {
    if (storage == null) return;
    if (dismissed) storage.setItem(LOOPCARD_DISMISS_KEY, "1");
    else storage.removeItem(LOOPCARD_DISMISS_KEY);
  } catch {
    // storage unavailable — dismissal simply won't persist this session
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — `# tests 6`, `# pass 6`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/loop.mjs test/loop.test.mjs
git commit -m "feat: add pure loop module + node:test harness for second-brain reframe"
```

---

## Task 2: The `LoopCard` component + styles

**Files:**
- Create: `src/LoopCard.jsx`
- Modify: `src/styles.css` (append new rules at end of file)

No unit test: this is presentational and the logic it depends on is already covered by Task 1. Verification is build + visual.

- [ ] **Step 1: Create the component**

Create `src/LoopCard.jsx`:

```jsx
import { useState } from "react";
import { LOOP_STEPS, loopCounts, readDismissed, writeDismissed } from "./lib/loop.mjs";

// localStorage is read once at module load; guarded for non-browser contexts.
const storage = typeof window !== "undefined" ? window.localStorage : null;

// The single "second brain" surface: teaches the capture→reuse loop once, then
// shows calm progress. No alarm colors, no red badges — an invitation to work
// the pile, consistent with the app's quiet voice.
export function LoopCard({ posts, onFocusToOrganize }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(storage));
  const { captured, toOrganize, organized } = loopCounts(posts);

  const collapse = () => {
    writeDismissed(storage, true);
    setDismissed(true);
  };
  const expand = () => {
    writeDismissed(storage, false);
    setDismissed(false);
  };

  return (
    <section className="loopcard" aria-label="Your second brain loop">
      {!dismissed && (
        <ol className="loopcard-steps">
          {LOOP_STEPS.map((step, index) => (
            <li key={step.key} className="loopcard-step">
              <span className="loopcard-step-num" aria-hidden="true">{index + 1}</span>
              <span className="loopcard-step-text">
                <strong>{step.label}.</strong> {step.line}
              </span>
            </li>
          ))}
        </ol>
      )}

      {captured > 0 && (
        <div className="loopcard-status">
          <span className="loopcard-counts">
            <strong>{captured}</strong> captured
            <span className="loopcard-dot" aria-hidden="true">·</span>
            <strong>{toOrganize}</strong> to organize
            <span className="loopcard-dot" aria-hidden="true">·</span>
            <strong>{organized}</strong> organized
          </span>
          <span className="loopcard-actions">
            {toOrganize > 0 && (
              <button type="button" className="loopcard-cta" onClick={onFocusToOrganize}>
                Organize {toOrganize} →
              </button>
            )}
            {dismissed ? (
              <button type="button" className="loopcard-toggle" onClick={expand}>
                Show loop
              </button>
            ) : (
              <button type="button" className="loopcard-toggle" onClick={collapse}>
                Hide
              </button>
            )}
          </span>
        </div>
      )}

      {dismissed && captured === 0 && (
        <button type="button" className="loopcard-toggle" onClick={expand}>
          Show loop
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Append the styles**

Add to the end of `src/styles.css` (uses existing tokens only — `--accent-softer`, `--accent-border`, `--accent`, `--accent-ink`, `--accent-hover`, `--ink`, `--ink-2`, `--muted`, `--muted-2`, `--r-md`, `--r-full`, `--space-*`, `--fs-*`):

```css
/* =====================================================================
   Loop card — the one "second brain" surface. Teaches the capture→reuse
   loop, then shows calm progress. Flatter than .card (it's chrome, not
   content); accent-tinted, never danger-colored.
   ===================================================================== */
.loopcard {
  background: var(--accent-softer);
  border: 1px solid var(--accent-border);
  border-radius: var(--r-md);
  padding: var(--space-4);
  margin-bottom: var(--space-4);
}
.loopcard-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3);
}
.loopcard-step { display: flex; align-items: flex-start; gap: var(--space-2); min-width: 0; }
.loopcard-step-num {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
  background: var(--accent);
  color: var(--accent-ink);
  font-size: var(--fs-xs);
  font-weight: 700;
}
.loopcard-step-text { font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.4; }
.loopcard-step-text strong { color: var(--ink); font-weight: 600; }
.loopcard-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--accent-border);
}
.loopcard-counts { font-size: var(--fs-sm); color: var(--muted); font-variant-numeric: tabular-nums; }
.loopcard-counts strong { color: var(--ink); font-weight: 600; }
.loopcard-dot { margin: 0 var(--space-2); color: var(--muted-2); }
.loopcard-actions { display: flex; align-items: center; gap: var(--space-4); }
.loopcard-cta {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.loopcard-cta:hover { color: var(--accent-hover); text-decoration: underline; }
.loopcard-toggle {
  font-size: var(--fs-xs);
  color: var(--muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.loopcard-toggle:hover { color: var(--ink-2); }
@media (max-width: 720px) {
  .loopcard-steps { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 3: Verify it builds and renders**

Run: `npm run build`
Expected: PASS — Vite builds with no errors (the new import resolves).

Optional visual check (per the `visual-verify-ui` memory: plain vite + headless Chrome): mount `<LoopCard posts={[{status:"review"},{status:"filed"}]} onFocusToOrganize={()=>{}} />`, screenshot, and confirm four numbered steps, the "1 to organize · 1 organized" line, an accent (not red) palette, and the "Organize 1 →" link. Also screenshot `posts={[]}` (steps only, no status line).

- [ ] **Step 4: Commit**

```bash
git add src/LoopCard.jsx src/styles.css
git commit -m "feat: add LoopCard surface that teaches the capture→reuse loop"
```

---

## Task 3: Wire `LoopCard` + copy relabels into `App.jsx`

**Files:**
- Modify: `src/App.jsx`

All edits below are exact find/replace against the current file. After all of them, build once and commit once.

- [ ] **Step 1: Import `useRef` and `LoopCard`**

Change line 1 from:

```jsx
import { useCallback, useEffect, useMemo, useState } from "react";
```

to:

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

And after the existing line `import { CollectionSidebar } from "./CollectionSidebar.jsx";` add:

```jsx
import { LoopCard } from "./LoopCard.jsx";
```

- [ ] **Step 2: Add the scroll-target ref**

Immediately after the line `const [selectedCollection, setSelectedCollection] = useState(null);` add:

```jsx
  const toOrganizeRef = useRef(null);
```

- [ ] **Step 3: Relabel the export button**

Change:

```jsx
  const exportLabel = filtering ? "Export filtered CSV" : "Export CSV";
```

to:

```jsx
  const exportLabel = filtering ? "Reuse filtered → CSV" : "Reuse → CSV";
```

- [ ] **Step 4: Add the brand tagline**

Replace:

```jsx
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <BookmarkMark />
            </span>
            <h1>LinkedIn Saver</h1>
          </div>
```

with:

```jsx
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <BookmarkMark />
            </span>
            <div className="brand-text">
              <h1>LinkedIn Saver</h1>
              <span className="brand-tagline">Your second brain for LinkedIn</span>
            </div>
          </div>
```

- [ ] **Step 5: Mount `LoopCard` above the add form**

Replace:

```jsx
        <div className="content-col">
          <AddForm onSaved={onSaved} />
```

with:

```jsx
        <div className="content-col">
          <LoopCard
            posts={posts}
            onFocusToOrganize={() =>
              toOrganizeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          />
          <AddForm onSaved={onSaved} />
```

- [ ] **Step 6: Rewrite the empty-library copy**

Replace:

```jsx
              <p>
                No saved posts yet. Paste one above, or save a post on LinkedIn
                with the browser extension connected.
              </p>
```

with:

```jsx
              <p>
                Nothing captured yet. The moment a post is worth keeping, hit
                LinkedIn’s Save — it lands here, out of your head.
              </p>
```

- [ ] **Step 7: Rewrite the empty-search copy**

Replace:

```jsx
              <p>No posts match these filters.</p>
```

with:

```jsx
              <p>Nothing matches. Your second brain only knows what you’ve captured.</p>
```

- [ ] **Step 8: Relabel the "To review" section + attach the ref**

Replace:

```jsx
            <section className="section">
              <h2 className="section-title">
                To review <span className="badge">{toReview.length}</span>
              </h2>
```

with:

```jsx
            <section className="section" ref={toOrganizeRef}>
              <h2 className="section-title">
                To organize <span className="badge">{toReview.length}</span>
              </h2>
```

- [ ] **Step 9: Relabel the "Filed" section**

Replace:

```jsx
              <h2 className="section-title">Filed</h2>
```

with:

```jsx
              <h2 className="section-title">Organized</h2>
```

- [ ] **Step 10: Add the brand-tagline styles**

In `src/styles.css`, replace the `.brand` rule:

```css
.brand { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
```

with:

```css
.brand { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.brand-text { display: flex; flex-direction: column; min-width: 0; }
.brand-tagline {
  font-size: var(--fs-xs);
  color: var(--muted);
  font-weight: 500;
  white-space: nowrap;
  letter-spacing: -0.005em;
}
```

- [ ] **Step 11: Verify build + behavior**

Run: `npm run build`
Expected: PASS — no errors.

Then run `npm run dev` and open the printed URL. Confirm: the tagline shows under the wordmark; the LoopCard sits above the add form; the two sections read **"To organize"** and **"Organized"**; the export button reads **"Reuse → CSV"**; clicking **"Organize N →"** smooth-scrolls to the To-organize section. No console errors. (If you have no local data, the empty-library copy should show the new line.)

- [ ] **Step 12: Commit**

```bash
git add src/App.jsx src/styles.css
git commit -m "feat: wire LoopCard and relabel app copy to the second-brain loop"
```

---

## Task 4: Collections create-form copy

**Files:**
- Modify: `src/CollectionSidebar.jsx`

- [ ] **Step 1: Re-point the description placeholder toward use, not topic**

Replace:

```jsx
            <textarea
              placeholder="Description (optional)"
              value={newCollectionDesc}
              onChange={(e) => setNewCollectionDesc(e.target.value)}
            />
```

with:

```jsx
            <textarea
              placeholder="Where will you use this?"
              value={newCollectionDesc}
              onChange={(e) => setNewCollectionDesc(e.target.value)}
            />
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/CollectionSidebar.jsx
git commit -m "feat: nudge collection descriptions toward use over topic"
```

---

## Task 5: Positioning docs (the story half)

**Files:**
- Modify: `.agents/product-marketing-context.md`
- Modify: `docs/jobs-to-be-done.md`

These are prose edits — no build/test. Match the existing voice (plain, no "AI-powered", no PARA/CODE jargon; "second brain" only as support, never the headline).

- [ ] **Step 1: Add the supporting category line to the one-liner**

In `.agents/product-marketing-context.md`, find the `**One-liner:**` line under "Offering Overview" and add, on the line directly beneath it:

```markdown
**Supporting framing:** a second brain for LinkedIn — captures itself, then helps you reuse it (capture → organize → distill → reuse). "Second brain" stays a supporting phrase, never the headline.
```

- [ ] **Step 2: Sharpen the "5 competitors" objection**

In the same file, in the Objections table, replace the row:

```markdown
| "There are already 5 of these (PostDeck, Dewey...)" | `[needs sharper answer — current weak spot; founder input]` |
```

with:

```markdown
| "There are already 5 of these (PostDeck, Dewey...)" | Those are content tools for creators — schedule, repurpose, post. This is a thinking tool for operators: a second brain that captures itself and feeds your next decision. Different job, different user. |
```

- [ ] **Step 3: Add a voice note**

In the same file, find the `**Words to use:**` line (under "Customer Language") and confirm it already contains `second brain`. Then add this line directly beneath that `**Words to use:**` line:

```markdown
**On "second brain":** the second brain is *yours*, computed offline — this reinforces the no-AI / own-your-data stance, it doesn't contradict it. Keep PARA / CODE / "progressive summarization" jargon off every user-facing surface.
```

- [ ] **Step 4: Add the positioning note to JTBD**

In `docs/jobs-to-be-done.md`, find the line `**Product in one line:**` near the top of "Step 1 — Context" and add, directly beneath it:

```markdown
> **Positioning note (2026-06):** framed as a *second brain for LinkedIn* expressed as a
> capture → organize → distill → reuse loop. This is a reframe of the same product, not a
> change to the JTBD analysis below.
```

- [ ] **Step 5: Commit**

```bash
git add .agents/product-marketing-context.md docs/jobs-to-be-done.md
git commit -m "docs: position LinkedIn Saver as a second brain for LinkedIn"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full test + build**

Run: `npm test && npm run build`
Expected: tests pass (`# pass 6`), Vite build succeeds.

- [ ] **Step 2: Confirm the change surface is what the spec promised**

Run: `git diff --name-only main...HEAD`
Expected: only `package.json`, files under `src/` (`lib/loop.mjs`, `LoopCard.jsx`, `App.jsx`, `CollectionSidebar.jsx`, `styles.css`), `test/loop.test.mjs`, `.agents/product-marketing-context.md`, and `docs/` files. **No files under `api/`, `extension/`, or any DB layer.** No new entries in `package.json` `dependencies`/`devDependencies`.

- [ ] **Step 3: Voice check (manual)**

Grep the working tree for forbidden surface language and confirm none leaked into user-facing strings:

Run: `grep -rniE "AI-powered|progressive summarization|\bPARA\b|\bCODE method\b" src/`
Expected: no matches.

---

## Self-Review (author check against the spec)

**Spec coverage:**
- §4 four-verb loop → `LOOP_STEPS` (Task 1) + LoopCard steps (Task 2). ✓
- §5.1 status reframe, no schema change → section relabels (Task 3 Steps 8-9); counts derived in `loopCounts`, "distilled" intentionally not counted (no field) — matches spec. ✓
- §5.2 LoopCard (teach + calm nudge + local dismissal) → Task 2 + mount Task 3 Step 5. ✓
- §5.3 copy: brand tagline (T3 S4), empty states (T3 S6-7), section headers (T3 S8-9), export CTA (T3 S3), collections placeholder (Task 4); "Save" untouched; PostCard untouched per the corrected spec. ✓
- §6 story docs → Task 5. ✓
- §7 out-of-scope honored: no PARA model, no distill editor, no schema/status change, no new deps, "second brain" never the headline. ✓
- §10 file map → matches Tasks 1-5; PostCard row is "no change" and this plan makes none. ✓

**Placeholder scan:** none — every step has exact code/commands. The deferred PARA/distill options stay deferred (spec §8) and are deliberately not tasks here.

**Type/name consistency:** `loopCounts` returns `{captured, toOrganize, organized}` — same names consumed in `LoopCard` and asserted in tests. `LOOPCARD_DISMISS_KEY`, `readDismissed`, `writeDismissed`, `LOOP_STEPS` are spelled identically across `src/lib/loop.mjs`, `test/loop.test.mjs`, and `src/LoopCard.jsx`. `toOrganizeRef` defined (T3 S2) and used (T3 S5, S8). ✓

---

## Out of scope (reaffirmed)

No PARA data model · no distillation editor · no schema/status changes · no capture discipline · no headline promotion of "second brain" · no new export formats or LLM · no new npm dependencies. These are the deferred bets the spec's §9 validation gates before any are built.
