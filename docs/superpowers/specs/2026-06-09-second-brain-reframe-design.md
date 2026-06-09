# Second Brain Reframe — Design

> **Status:** Approved design (brainstorming output). Next step: implementation plan.
> **Date:** 2026-06-09
> **Scope:** A *reframe-first* repositioning of LinkedIn Saver around Tiago Forte's
> "Building a Second Brain" (BASB) — narrative + vocabulary + one light UI surface.
> **Explicitly not** a re-architecture: no schema change, no PARA data model, no
> human progressive-summarization editor. Those are deferred options (see §8).

---

## 1. Goal

Direct LinkedIn Saver toward the BASB methodology **as a story and an organizing
vocabulary**, cheaply enough to validate the positioning *before* committing to any
structural machinery.

The thesis we are testing:

> **LinkedIn Saver is a Second Brain that captures for you — so you only organize and
> distill the survivors, at retrieval time, not at capture time.**

This is deliberately the thin, testable version of "go Second Brain." It puts the
second-brain story in front of users without building PARA structure or a distillation
editor whose demand is still unvalidated (the product is pre-launch and its core
retrieval-pain is a hypothesis — see `docs/jobs-to-be-done.md`).

## 2. Decisions locked during brainstorming

| Decision | Choice | Consequence |
|---|---|---|
| Depth | **Reframe-first** (story + light UI) | No schema change; positioning validated before machinery |
| Framing visibility | **Plain-language spirit** | Adopt the loop/structure in plain words; "second brain" is a *supporting* phrase, never the headline; no PARA/CODE jargon on the surface |
| UI budget | **Copy + one loop surface** | Re-label/re-sequence + new empty/onboarding copy + **one** new "Loop card" component; uses existing `status` field |
| Structuring approach | **A (four-verb loop), wrapped in B ("black hole → brain")** | The loop is the *mechanism*; the transformation is the *story* told around it |

## 3. Fit assessment (why this is coherent, not a bolt-on)

Where LinkedIn Saver is **already** a Second Brain — reframe is vocabulary only:

- **Offload** ("brain for ideas, system for storage"): the native-Save hook + store
  *is* the capture layer.
- **Just-in-time retrieval**: the core JTBD ("re-find the right post weeks later when a
  use finally comes up") *is* BASB's just-in-time principle.
- **Knowledge → Action / reuse**: export-to-swipe-file ("passive consumption becomes a
  reusable asset") *is* BASB's knowledge→action.

Where the reframe **adds** legibility (story, not new mechanics):

- **PARA / organize-by-action**: surfaced only as *language* ("file by where you'll use
  this"), not as structure. The data model stays tags + collections.
- **Progressive Summarization**: surfaced only as the existing machine one-liner
  presented as a "takeaway." No human distillation editor.

Where the reframe **consciously rejects** BASB:

- **BASB capture-discipline** ("save less — only for current projects"). The product's
  entire wedge is frictionless, reflexive, save-everything capture. We **invert** the
  loop: capture everything at the feed; organize and distill only the survivors, lazily,
  at retrieval time. This protects the wedge BASB-by-the-book would blunt.

## 4. The spine — the four-verb loop

Forte's CODE (Capture · Organize · Distill · Express) translated to plain words:

**Capture → Organize → Distill → Reuse**

Mapped onto surfaces that already exist:

| Loop verb | Plain meaning | Lives in today | What the reframe does |
|---|---|---|---|
| **Capture** | get it out of the feed, effortlessly | native-Save hook (`extension/native-save.js`), `src/AddForm.jsx` | Name it *Capture*. "Your brain has the idea; your second brain keeps it." |
| **Organize** | file the keepers by *use*, not topic | `status='review'` queue + tags + collections (`src/CollectionSidebar.jsx`) | The review queue becomes *"To organize."* Collections framed as *"where you'll use this,"* not "topics." |
| **Distill** | surface the one line that matters | machine one-liner (`api/_lib/summarize.js`); reader view (current branch) | Surface the existing one-liner as the post's *takeaway*. Reader optionally lets you confirm/replace it. |
| **Reuse** | pull it back into your own work | export HTML/xlsx (`src/exportCsv.js`, export script) | Frame export as *"put your brain to work"* — a brief/swipe-file for your next post, pitch, or hire. |

**Loop ordering principle (the divergence):** the loop is **not** linear-on-capture.
Capture is instant and cheap; Organize/Distill/Reuse happen lazily, only for the
survivors, only when a use appears. The UI must never imply "you must organize before
this counts."

## 5. UI changes

### 5.1 Status reframe — no schema change

Reuse the existing `posts.status` field to give the loop visible *progress*. No new
status values, no migration:

- `review` → labelled **"To organize"** (captured, not yet filed)
- accepted / kept → labelled **"Organized"** (filed, reusable)
- **"Distilled" is derived, not stored** — a post counts as distilled when it has a
  non-empty takeaway/summary. No new column.

Yields a quiet completion signal, e.g. *"142 captured · 38 organized · 12 distilled."*
This is BASB's knowledge→action "completion" feeling made visible — and it gently
motivates working the pile without nagging.

### 5.2 The one new component — the **Loop card**

A small, dismissible card on the library/home with two jobs:

1. **Teach the loop once (onboarding).** Four icons, one line each:
   *Capture it the moment you see it · Organize the keepers · Distill the gold · Reuse it
   in your work.*
2. **Show where you are (calm nudge).** A quiet count —
   *"6 captured posts ready to organize"* — with a button that filters the library to
   `status='review'`. **No red badges, no guilt.** It is an invitation, consistent with
   the product's calm, unflashy voice.

Dismissal persists locally (e.g. `localStorage`); the card collapses to the status line
once dismissed. This is the **only** net-new component in scope.

### 5.3 Copy changes (plain-language; "second brain" supports, never headline)

- **Header / hero** — operator pain headline stays primary; second-brain line supports:
  - Primary: *"Find the post you saved three weeks ago."*
  - Support: *"Your second brain for LinkedIn — capture, organize, reuse."*
- **Empty library:** *"Nothing captured yet. The moment a post is worth keeping, hit
  LinkedIn's Save — it lands here, out of your head."*
- **Empty search:** *"Nothing matches. Your second brain only knows what you've
  captured."*
- **Queue / `review` label:** *"To organize."* The accept/file action reads *"Organize"*
  / *"File it."*
- **Export CTA:** *"Reuse →"* / *"Build a brief"* instead of a bare "Export."
- **Collections create:** sub-label nudges *use* over *topic* — *"Where will you use
  this?"*
- **"Save" stays "Save"** in the extension — it is LinkedIn's verb and the zero-friction
  wedge. We do not rename the one action the user already knows.

Exact final strings are a copy pass during implementation; the above are the intent and
the anchors.

## 6. The story half — marketing + JTBD framing

Update `.agents/product-marketing-context.md` (and align `docs/jobs-to-be-done.md`):

- **Supporting category line** (headline stays the operator one-liner):
  *"a second brain for LinkedIn — captures itself, then helps you reuse it."*
- **Sharpen the weak objection** currently flagged `[needs sharper answer]` for "there
  are already 5 of these (PostDeck, Dewey…)":
  > *"Those are content tools for creators — schedule, repurpose, post. This is a
  > thinking tool for operators: a second brain that captures itself and feeds your next
  > decision. Different job, different user."*
- **Voice consistency:** the second brain is *yours*, computed offline — this
  *reinforces* the "no AI-magic / your data stays yours" stance rather than violating it.
  "Second brain" is already on the *Words to use* list; PARA/CODE jargon stays off the
  surface per the plain-language decision.

## 7. Out of scope (guardrails)

- ❌ No PARA data model (Projects / Areas / Resources / Archive structure).
- ❌ No human progressive-summarization editor beyond surfacing the existing one-liner.
- ❌ No schema change, no new `status` values, no DB migration.
- ❌ No capture-discipline / "save less" — consciously rejected.
- ❌ "Second brain" is never promoted to the headline.
- ❌ No new export formats or LLM summarization — the offline/no-LLM stance is unchanged.

## 8. Deferred options (what this reframe is designed to de-risk)

These are the *structural* bets the reframe validates demand for before they're built:

1. **PARA spine** — collections gain a `kind` (project / area / resource / archive),
   projects carry a goal + optional deadline + done state, sidebar groups by PARA.
2. **Distill → reuse loop** — reader-based progressive summarization (highlight → bold →
   takeaway) with a per-post distilled state, and an "assemble a collection's takeaways
   into one exportable brief" action.

Decision rule: invest in (1) and/or (2) **only if** the §9 validation shows the
second-brain framing makes ICP users lean in.

## 9. Success criteria

Pre-launch, validation is qualitative. The reframe is good if:

- a new user can **describe the product in loop terms** after seeing the Loop card once;
- it **sharpens the competitive objection** (operators' thinking-tool vs creators'
  content-tool);
- it **does not dilute** the operator headline or break the no-jargon / no-AI voice;
- there are **zero behavior or schema regressions**;
- in a read with **2 ICP operators + 1 PKM-crowd person**, *"second brain for LinkedIn"*
  makes them **lean in, not glaze over.** That single read decides whether to invest in
  the §8 deferred options.

## 10. Affected surfaces (implementation map)

| Area | File(s) | Change |
|---|---|---|
| Hero / header copy | `src/App.jsx` | Add supporting second-brain line; keep operator headline |
| Empty states | `src/App.jsx` | Rewrite empty-library and empty-search copy to the loop |
| Status labels | `src/PostCard.jsx`, `src/BrowseControls.jsx` | `review` → "To organize"; derived "Distilled" surfacing |
| Loop card | new component (e.g. `src/LoopCard.jsx`) + mount in `src/App.jsx` | Onboarding loop + calm status nudge; local dismissal |
| Collections copy | `src/CollectionSidebar.jsx` | "Where will you use this?" create sub-label |
| Export CTA | `src/App.jsx` / `src/exportCsv.js` call site | "Reuse →" / "Build a brief" label |
| Story | `.agents/product-marketing-context.md`, `docs/jobs-to-be-done.md` | Supporting category line; sharpened objection; voice note |

No files in `api/`, `extension/`, or the DB layer change. The reframe is entirely
front-end copy + one component + two docs.
