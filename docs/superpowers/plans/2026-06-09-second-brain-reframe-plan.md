# Second Brain Reframe — Implementation Plan

> **Design:** `docs/superpowers/specs/2026-06-09-second-brain-reframe-design.md`
> **Shape:** front-end copy + one new component (`LoopCard`) + two docs. No `api/`,
> no `extension/`, no DB/schema change, no new dependencies.
> **Strategy:** ship in increments that are each independently testable. Increment 1
> (copy-only) is shippable on its own and de-risks the rest.

---

## Increment 0 — Branch hygiene (decision, ~2 min)

The current branch `codex/richer-captured-metadata-media` already has unrelated
in-progress work staged (incl. `src/PostCard.jsx`, `api/_lib/db.js`,
`.agents/product-marketing-context.md`). Two of the files this plan edits
(`PostCard.jsx`, `product-marketing-context.md`) overlap with that staged work.

**Recommended:** do this reframe on a dedicated branch off `main`
(`feat/second-brain-reframe`) so the copy/positioning change ships independently of the
richer-metadata branch. If you'd rather stack it on the current branch, that's fine — just
be aware the two `PostCard.jsx` / marketing-doc edits will interleave.

*This is the one open decision before coding. Default to the dedicated branch unless you
say otherwise.*

---

## Increment 1 — Copy-only reframe (no new components)

Lowest-risk, shippable alone. Pure string + label changes; zero behavior change.

1. **Brand tagline** — `src/App.jsx` topbar brand block (~L206-213). Under the
   `<h1>LinkedIn Saver</h1>` wordmark, add a small muted tagline:
   *"Your second brain for LinkedIn."* (new `<span className="brand-tagline">`).
2. **Section headers** — `src/App.jsx` (~L292-328):
   - "To review" → **"To organize"** (keep the count badge).
   - "Filed" → **"Organized"**.
3. **Empty states** — `src/App.jsx`:
   - Empty library (~L275-283): *"Nothing captured yet. The moment a post is worth
     keeping, hit LinkedIn's Save — it lands here, out of your head."*
   - Empty search (~L285-290): *"Nothing matches. Your second brain only knows what
     you've captured."*
4. **Export CTA** — `src/App.jsx` `exportLabel` (~L202): `"Export CSV"` →
   *"Reuse → CSV"*, `"Export filtered CSV"` → *"Reuse filtered → CSV"*. Keep "CSV" so the
   function stays obvious; the button's `onClick` is unchanged.
5. **Per-post action verb** — `src/PostCard.jsx`: the control that moves a post
   `review → filed` reads **"Organize"** / *"File it"* (find the current accept/file
   label; rename text only, keep the handler).
6. **Collections placeholder** — `src/CollectionSidebar.jsx` (~L121): the create form's
   `placeholder="Description (optional)"` → **"Where will you use this?"** (the edit-form
   textarea ~L165 can stay as-is or match).

**Verify Increment 1:**
- `npm run build` passes.
- `vercel dev` (or the existing dev flow) → app loads; the two sections read "To
  organize" / "Organized"; tagline shows; export button still exports; filing a post
  still works. No console errors.
- Diff is strings/labels only — confirm no logic lines changed.

---

## Increment 2 — The `LoopCard` component (the one new surface)

2.1 **Create `src/LoopCard.jsx`.** Props:
   - `captured` (number) — `posts.length`
   - `toOrganize` (number) — count of `status === "review"` (App already computes
     `toReview`)
   - `organized` (number) — count of `status === "filed"` (App computes `filed`)
   - `onFocusToOrganize` (fn) — scrolls to / reveals the "To organize" section
   - Internal: `dismissed` state backed by `localStorage` key
     `lin-saver:loopcard-dismissed`.

   Two regions:
   - **Loop strip (onboarding):** four steps, icon + one line each —
     *Capture it the moment you see it · Organize the keepers · Distill the gold · Reuse
     it in your work.* (Reuse the inline-SVG icon style already used across the app; no
     icon dependency.)
   - **Status line (calm nudge):** *"{captured} captured · {toOrganize} to organize ·
     {organized} organized"* plus, when `toOrganize > 0`, a quiet text button
     *"Organize {toOrganize} →"* calling `onFocusToOrganize`. **No red badges.**

   When `dismissed`, render only the compact status line with a small "show loop" affordance.

2.2 **Styles** — `src/styles.css`: a calm card matching existing card styling (soft
   border/radius, no heavy shadow, brand accent only on the nudge button). Four-step strip
   wraps gracefully at narrow widths.

2.3 **Mount** — `src/App.jsx` content-col, directly above `<AddForm>` (~L249). Pass the
   counts; implement `onFocusToOrganize` as a `scrollIntoView` on a ref attached to the
   "To organize" `<section>` (no new filter state, no behavior risk). Only render the card
   when `posts.length > 0` *or* always-on for the onboarding strip — pick: **show the
   onboarding strip even at zero posts** (it teaches the loop on an empty account), but
   hide the status line until there's at least one post.

**Verify Increment 2:**
- Isolated render via the `visual-verify-ui` memory recipe (plain vite + headless
  Chrome): mount `<LoopCard captured={142} toOrganize={27} organized={38} />`, screenshot,
  confirm calm styling, four steps legible, no alarm colors. Also screenshot the
  `captured={0}` onboarding-only state.
- In-app: dismiss the card → reload → stays dismissed (localStorage). "Organize N →"
  scrolls to the To-organize section.
- `npm run build` passes.

---

## Increment 3 — The story docs

3.1 **`.agents/product-marketing-context.md`** (coordinate with the staged in-progress
   edits — edit, don't clobber):
   - Add the **supporting category line** near the one-liner: *"a second brain for
     LinkedIn — captures itself, then helps you reuse it"* (operator one-liner stays the
     headline).
   - Replace the Objections-table cell currently flagged
     `[needs sharper answer — current weak spot; founder input]` for "There are already 5
     of these" with: *"Those are content tools for creators — schedule, repurpose, post.
     This is a thinking tool for operators: a second brain that captures itself and feeds
     your next decision. Different job, different user."*
   - Add a one-line **voice note**: second brain = yours, computed offline; reinforces the
     no-AI/own-your-data stance; keep PARA/CODE jargon off the surface.

3.2 **`docs/jobs-to-be-done.md`** — light alignment only: add a single framing note that
   the product is positioned as a "second brain for LinkedIn" expressed as a
   capture→organize→distill→reuse loop. **Do not** rewrite the JTBD analysis.

**Verify Increment 3:** prose read; consistent with the plain-language decision (no
headline promotion of "second brain", no jargon); objection cell no longer marked as a
gap.

---

## Increment 4 — Validation prep (non-code, optional but the point)

Per the spec's success criteria, prepare the qualitative read that decides whether to
invest in the deferred PARA / distill options:

- Recruit **2 ICP operators + 1 PKM-crowd person**.
- Show the reframed app (Increments 1-2) cold; ask them to describe what it does in their
  own words after seeing the Loop card once.
- Record: do they say something loop-shaped ("captures, then I organize/reuse")? Does
  *"second brain for LinkedIn"* make them lean in or glaze over?
- This is the gate for the §8 deferred options — not a code task, but the reason the
  reframe exists.

---

## Definition of done

- [ ] `npm run build` passes; no new dependencies; no console errors in dev.
- [ ] Sections read "To organize" / "Organized"; brand tagline present; empty states
      rewritten; export + filing behavior unchanged.
- [ ] `LoopCard` renders, teaches the loop, shows the calm count, dismissal persists, and
      "Organize N →" focuses the section.
- [ ] No changes under `api/`, `extension/`, or the DB layer (`git diff --name-only`
      confirms front-end + 2 docs only).
- [ ] Marketing doc: supporting line added, objection sharpened, voice note added; JTBD
      aligned with one note.
- [ ] Voice check: no "AI"/"AI-powered", no "PARA"/"CODE"/"Progressive Summarization" on
      any user-facing surface; "second brain" appears only as support, never the headline.
- [ ] Ship when ready: `npm run ship -- "Second Brain reframe: loop vocabulary + Loop card"`.

## Out of scope (reaffirmed from the design)

No PARA data model · no distillation editor · no schema/status changes · no capture
discipline · no headline promotion of "second brain" · no new export formats or LLM.
