# Public Beta Multi-Agent Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to run this plan. This document is the *orchestration* layer; every engineering step (code, tests, commands) lives in `docs/superpowers/plans/2026-07-14-public-beta-implementation.md` ("the implementation plan"). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute Tasks 3–11 of the public beta implementation plan with subagents — serial backend backbone, two parallel worktree lanes (docs, extension prep), two-stage review per task, one PR per task, and explicit human gates for Clerk/production/Store steps.

**Architecture:** The main session is the orchestrator: it dispatches one fresh implementer subagent per task, runs a two-stage review (spec-fit check + `bug-finder` agent on the diff), keeps a stacked-PR chain so no task blocks on a human merge, and pauses at manual gates. Parallel lanes run in isolated git worktrees and merge into the backbone at fixed points.

**Tech Stack:** git worktrees + stacked branches, `gh` CLI for PRs, Vitest for gates, Agent tool (`general-purpose` implementers, `bug-finder` reviewers).

---

## References

- **Spec:** `docs/superpowers/specs/2026-07-14-public-beta-design.md` — scope, acceptance criteria.
- **Implementation plan:** `docs/superpowers/plans/2026-07-14-public-beta-implementation.md` — Tasks 1–11 with full code. Referenced below as **IP Task N**.

## Current state (verified 2026-07-15)

- Branch `codex/richer-captured-metadata-media` is 8 commits ahead of `main` and contains **IP Tasks 1–2 complete** (test harness; Clerk email-link frontend shell) plus the spec/plan docs.
- IP Tasks 3–11 are **unbuilt**: the API still uses the shared-password gate (`api/_lib/auth.js`), no table has a `user_id` column, no pairing/revocation/account endpoints exist, collections/import/AI-export surfaces are still present, and no PRIVACY/SECURITY/CONTRIBUTING/Store material exists.
- The two untracked `2026-06-09-second-brain-reframe-*` files are unrelated to this effort. **Never commit them** (leave untracked).

## Roles

| Role | Who | Responsibility |
|---|---|---|
| Orchestrator | Main session | Branching, dispatch, gates, PR creation, conflict resolution, checkbox updates in this file |
| Implementer | Fresh `general-purpose` subagent per task | Execute one IP task verbatim (TDD, commits) on its task branch |
| Reviewer stage 1 | Orchestrator | Spec-fit: every IP step checkbox satisfied, no scope creep, tests actually run |
| Reviewer stage 2 | `bug-finder` agent | Adversarial bug hunt on the task's full diff |
| Human | Egor | Merges PRs, Clerk dashboard, Vercel env vars, production migration approval, Store submission |

## Branch and PR mechanics

1. **Stacked chain.** Backbone task N+1 branches off backbone task N's branch (not `main`), so work never blocks on a merge. Branch names: `beta/03-api-auth`, `beta/04-db-ownership`, `beta/05-ownership-apis`, `beta/06-account-settings`, `beta/07-pairing-api`, `beta/08-extension-auth`, `beta/09-remove-deferred`, `beta/11-release-gate`. Lane branches: `beta/10-docs`, `beta/08a-extension-prep`.
2. **One PR per task**, opened by the orchestrator with `gh pr create` as soon as the task passes both review stages. Base = the predecessor's branch; retarget to `main` (`gh pr edit --base main`) as predecessors merge. PR bodies link the IP task section and end with the standard Claude Code attribution.
3. **Worktree lanes.** `beta/10-docs` and `beta/08a-extension-prep` run in `git worktree`-isolated checkouts off `main`, in parallel with the backbone.
4. **Gate command per task:** `npm test` must pass in the task's checkout before review stage 2. Tasks touching the extension additionally run the IP task's stated verification steps.
5. **No production credentials in agents.** Implementers use `.env.example` names only; anything requiring a real secret stops at a manual gate.

## Per-task loop (applies to every task below)

- [ ] Orchestrator creates the task branch from its stated base.
- [ ] Dispatch implementer subagent with this prompt skeleton:

```text
You are implementing exactly one task from a written plan, in the checkout at <path>, on branch <branch>.
Read docs/superpowers/plans/2026-07-14-public-beta-implementation.md, section "Task <N>: <title>",
and docs/superpowers/specs/2026-07-14-public-beta-design.md for context.
Execute every step of Task <N> in order, exactly as written: write the failing test first, run it,
implement, re-run, commit with the given message. Do not implement anything from other tasks.
Deviations: if a step conflicts with the current code (the plan predates some commits), adapt minimally
and report the deviation. Never commit .env files or the untracked 2026-06-09-* docs.
Finish by running `npm test` and reporting: steps completed, deviations, test summary, commit SHAs.
```

- [ ] Stage 1 review (orchestrator): diff vs IP task checklist; every acceptance-relevant behavior covered by a test; no unrelated files touched.
- [ ] Stage 2 review: dispatch `bug-finder` on the branch diff (`git diff <base>...<branch>`). Fix CONFIRMED findings via a follow-up subagent or inline; re-run `npm test`.
- [ ] Open the PR, tick the task's checkbox here, proceed to the next task without waiting for merge.

## Execution graph

```
GATE M0 (merge base PR)
   │
   ├─ Lane D (worktree): T10 docs ──────────────────────────► PR
   ├─ Lane E (worktree): T8a extension prep ───► PR ┐
   │                                                │ merged into backbone before T8
   └─ Backbone: T3 ► T4 ► T5 ► T6 ► T7 ► T8 ► T8b ► T9 ─► GATE M1 ─► T11 ─► GATE M2/M3
```

---

## Phase 0 — Preflight (orchestrator, inline)

- [ ] **P1:** Open a PR for the current branch `codex/richer-captured-metadata-media` → `main` containing IP Tasks 1–2 + the spec/plan docs (do not add the untracked 2026-06-09 files). Title: `feat: public beta foundation (test harness + Clerk email-link shell)`.
- [ ] **P2 — GATE M0 (human):** Egor merges that PR. Backbone and lanes branch from the updated `main`.
- [ ] **P3:** In the IP document, mark Task 1 and Task 2 checkboxes complete (they are verified done) and commit that edit on `beta/03-api-auth` alongside Task 3 work or as a docs commit in the base PR.

## Backbone (serial; each task = one implementer + two-stage review + PR)

- [ ] **T3 — IP Task 3: Replace shared-password API auth with verified identities.** Branch `beta/03-api-auth` off `main` post-M0. Core: `api/_lib/auth.js` verifies Clerk bearer tokens via `@clerk/backend`; delete `api/login.js`, `api/logout.js`, `api/session.js`, `src/Login.jsx`; tests in `test/auth.test.js`. Clerk network calls are mocked in tests — no real key needed.
- [ ] **T4 — IP Task 4: Migrate the database to strict per-user ownership.** Branch `beta/04-db-ownership` off T3. Core: `user_id` columns + per-user unique indexes in `api/_lib/db.js`, owner-scoped repository functions, `scripts/migrate-multi-account.mjs` (idempotent, founder backfill, aborts without `FOUNDER_USER_ID`), tests in `test/db-ownership.test.js`. Script is *written and tested* here; it is *run in production* only at T11/GATE M2.
- [ ] **T5 — IP Task 5: Enforce ownership in every remaining content API.** Branch `beta/05-ownership-apis` off T4. Core: `api/posts.js`, `api/posts/[id].js`, `api/posts/[id]/resuggest.js`, `api/tags.js` all pass the verified `userId` into every query; cross-tenant tests (user A cannot touch user B's records) in `test/posts-api.test.js`.
- [ ] **T6 — IP Task 6: Add account settings and complete deletion.** Branch `beta/06-account-settings` off T5. Core: `api/account.js` (delete all owned rows + Clerk identity), `src/Settings.jsx`, wiring in `src/App.jsx`/`src/api.js`; tests in `test/account-api.test.js`.
- [ ] **T7 — IP Task 7: Implement secure extension pairing and revocation.** Branch `beta/07-pairing-api` off T6. Core: `api/extension/pairings*` + `api/extension/tokens*` endpoints, SHA-256-hashed verifiers/tokens, `lis_ext_` bearer support in `api/_lib/auth.js`, `src/ExtensionConnect.jsx`; lifecycle tests in `test/pairing-api.test.js` (create → approve → redeem-once → revoke → revoked-token-fails).
- [ ] **T8 — IP Task 8: Convert the Chrome extension to paired-account auth.** Branch `beta/08-extension-auth` off T7, **after merging `beta/08a-extension-prep` into it** (see Lane E; resolve `manifest.json`/`popup.html` overlaps in favor of T8's plan text). Core: `extension/background.js` token auth + pairing messages, `extension/popup.js` connect/connected/reconnect states, `extension/lib/pairing-core.js`, delete `extension/saved-import.js`; tests in `test/extension-pairing.test.js`.
- [ ] **T8b — Addendum: URL-less capture dedupe** (spec gap not covered by the IP; see below). Same branch as T8, separate commit, or a small `beta/08b-urn-dedupe` branch off T8.
- [ ] **T9 — IP Task 9: Remove deferred collection surfaces and polish first use.** Branch `beta/09-remove-deferred` off T8(b). Core: delete `src/CollectionSidebar.jsx`, `api/collections*`, `api/post-collection.js`, collection code in `App.jsx`/`PostCard.jsx`/`api.js`; add the empty-library install-extension CTA (`VITE_CHROME_STORE_URL`).

## Lane D — Docs (worktree, parallel with backbone)

- [ ] **T10 — IP Task 10: Public-repo, privacy, and Store-release material.** Branch `beta/10-docs` off `main` post-M0, in its own worktree. Creates `PRIVACY.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/chrome-web-store-checklist.md`; rewrites `README.md` (hosted beta first). Reviewer stage 2 for this lane checks the docs against the spec's disclosure requirements (captured content, retention, export/deletion, support contact, no ads/sale) instead of running `bug-finder`. Because README describes end-state behavior, stage 1 review re-verifies its claims against the merged backbone before the PR is retargeted to `main`.

## Lane E — Extension prep (worktree, parallel with T3–T6)

- [ ] **T8a — Carve-out of IP Task 8 with no dependency on T7's API:** branch `beta/08a-extension-prep` off `main` post-M0, own worktree.
  - Reduce `extension/manifest.json` permissions to `["storage"]`; host permissions to `https://linkedin-saver.vercel.app/*` + LinkedIn only (drop localhost, the livereload ws host, and the `*.vercel.app` wildcard).
  - Remove `importScripts("dev-reload.js")` from `extension/background.js` production path; drop `dev-reload.js` and `saved-import.js` from `content_scripts`.
  - Create `extension/config.js` (single fixed hosted origin, per IP locked decision).
  - Add the `extension:package` zip script from IP Task 10 Step 4 if defined there, else a minimal `scripts/extension-package.mjs` that zips `extension/` excluding dev files.
  - Static `popup.html` markup for the connect/connected/reconnect states (logic arrives in T8).
  - Verification: load the unpacked extension, confirm capture still works against a locally-running app with the current (pre-pairing) auth **or** document that capture is intentionally broken until T8 and gate the PR to merge only into `beta/08-extension-auth`, not `main`. **Default: merge into T8's branch, never directly to `main`.**

## T8b addendum — URL-less capture dedupe (new work, not in the IP)

**Why:** Spec acceptance says "A repeated capture does not create an unintended duplicate." Today `extension/lib/save.js:80` deletes `urn` from the payload and `api/posts.js` skips the duplicate lookup when the cleaned URL is null, so URL-less posts always INSERT. The IP's per-user unique index still keys on `url` only.

**Files:** Modify `extension/lib/save.js`, `api/posts.js`, `api/_lib/db.js`; test in `test/posts-api.test.js`.

- [ ] **Step 1: Failing test** — in `test/posts-api.test.js`:

```js
it("dedupes a repeated capture that has no url by urn", async () => {
  const body = { text: "Post with no permalink", urn: "urn:li:activity:999", url: null };
  const first = await callPostsHandler(asUser("user_a"), body);
  const second = await callPostsHandler(asUser("user_a"), body);
  expect(second.json.duplicate).toBe(true);
  expect(await countPosts("user_a")).toBe(1);
});
```

(Adapt helper names to those established in T5's `test/posts-api.test.js`.)

- [ ] **Step 2: Schema** — in `api/_lib/db.js` `ensureSchema()`: `ALTER TABLE posts ADD COLUMN IF NOT EXISTS urn TEXT;` plus `CREATE UNIQUE INDEX IF NOT EXISTS posts_user_urn_unique ON posts (user_id, urn) WHERE urn IS NOT NULL AND url IS NULL;`
- [ ] **Step 3: Handler** — in `api/posts.js` POST: when `postUrl` is null and `body.urn` present, look up `SELECT id FROM posts WHERE user_id = ${userId} AND urn = ${urn}` and treat a hit exactly like the URL-duplicate path. Persist `urn` on INSERT.
- [ ] **Step 4: Extension** — in `extension/lib/save.js`, stop deleting `urn` before send (keep the in-memory 2.5s dedupe).
- [ ] **Step 5:** `npm test` green; commit `fix: dedupe url-less captures by urn`.

## Manual gates (work pauses; orchestrator posts an exact checklist)

- [ ] **GATE M0** (before backbone): merge the Phase-0 base PR.
- [ ] **GATE M1** (after T9, before T11) — Egor:
  - Clerk dashboard: production instance set to **email verification links only**, **restricted/invite-only** mode; `APP_ORIGIN` authorized.
  - Vercel env vars set for production: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `APP_ORIGIN`, `FOUNDER_USER_ID` (real Clerk user id of the founder account), `DATABASE_URL`, optional `VITE_CHROME_STORE_URL`.
  - Merge (or approve merging) the accumulated task PRs into `main` in order.
- [ ] **T11 — IP Task 11: Production migration and end-to-end beta gate.** Branch `beta/11-release-gate` off `main` after M1. Orchestrator prepares everything; the two side-effectful steps are human-approved:
  - **GATE M2:** run `scripts/migrate-multi-account.mjs` against production Neon (Egor runs it, or explicitly approves the orchestrator running it once, after a `pg_dump`/Neon branch backup).
  - Execute the IP Task 11 end-to-end checklist mapped to the spec's acceptance criteria (magic link works; signed-out blocked; A/B isolation; pairing lifecycle; revoked token fails; capture creates one owned record; repeat capture no duplicate; search/tags/CSV scoped; account deletion invalidates extension; plain-language errors; clean production build + documented local setup).
  - **GATE M3:** package the extension (`extension:package`), Egor submits the unlisted Chrome Web Store item and distributes the URL.

## Completion definition

All backbone + lane PRs merged to `main`; every spec acceptance criterion demonstrated at T11 with evidence (test run or manual check noted in the PR); production migrated; Store package submitted. This file's checkboxes all ticked.
