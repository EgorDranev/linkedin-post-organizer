# Saved-Posts Backlog Import — Design

**Date:** 2026-07-19
**Status:** Approved for implementation

## Problem

The extension captures a post only at the moment the user clicks LinkedIn's
native **Save**. Everything the user saved on LinkedIn *before* installing the
extension — the backlog visible at `linkedin.com/my-items/saved-posts/` — never
reaches their LinkedIn Saver library. Competing products (e.g. LinkedMash)
import that backlog on install; we don't.

## Goal

A one-click, re-runnable import of the user's entire LinkedIn saved-posts
backlog into their library, run from the saved-posts page itself, using only
what the page shows (card-level fidelity), with clear progress and errors.

## Decisions (user-confirmed)

- **Trigger:** a banner injected on `linkedin.com/my-items/saved-posts/`.
  No popup button, no auto-import.
- **Coverage:** the import auto-scrolls/pages through the entire list in one
  run, with throttling, a live progress display, and a Stop button.
- **Fidelity:** card content only — author, headline, truncated card text,
  thumbnail media, links, and the post permalink. No per-post page fetches.

## Approach

A new content-script module orchestrates the run entirely in the page,
composing three things that already exist:

1. `LIS.findSavedPostItems()` / `LIS.extractSavedItem()`
   (`extension/lib/extract.js`) — locate and extract saved-list cards; already
   tag payloads with `metadata.importedFromSavedPosts: true`.
2. `LIS.capturePayload(payload, { createOnly: true })`
   (`extension/lib/save.js`) — the existing save pipeline through the
   background service worker.
3. `POST /api/posts` with `createOnly: true` (`api/posts.js`) — inserts new
   posts, returns `{ duplicate: true, skipped: true }` for already-saved ones
   without overwriting them (tags and edits are preserved). This makes
   re-running the import always safe.

No new permissions, no background/service-worker changes, no API changes, no
web-app changes.

### Rejected alternatives

- **Background-orchestrated run** (survives navigation): unneeded complexity
  for a run the user watches on-page; hundreds of posts complete in minutes.
- **Voyager (internal API) interception**: full fidelity but fragile, higher
  ToS risk, and against the project's DOM-only, capture-on-consent posture.

## Components

### `extension/import-saved.js` (new)

IIFE in the `LIS` namespace, registered in `manifest.json` content scripts
after `native-save.js` and before `content.js`.

**Page detection.** LinkedIn is a SPA, so URL changes don't reload content
scripts. Watch `location.pathname` (piggybacking on a coalesced
MutationObserver, same pattern as `content.js`). When the path matches
`/my-items/saved-posts`, inject the banner; when the user navigates away,
remove the banner and cancel any in-flight run.

**Banner UI.** Injected element styled in `content.css` with `lis-` prefixed
classes. States:

- *Not connected:* explains the extension isn't paired and points to the
  toolbar icon. No Start button.
- *Idle:* "Import these saved posts into LinkedIn Saver" + **Start import**.
- *Running:* live counters — `Imported N · Already saved N · Failed N` — and a
  **Stop** button.
- *Done / stopped:* final summary, with a subdued error line if the run was
  stopped by a connection/auth failure.

Connected state is read the same way the popup does (extension storage token
presence via the background worker / `chrome.storage`).

**Import loop.** One run:

1. Collect cards with `findSavedPostItems()`; skip URLs already processed in
   this run (a `Set`).
2. For each new card: `extractSavedItem(item)` →
   `capturePayload(payload, { createOnly: true })`, awaited sequentially with
   a ~400 ms gap between posts (gentle on LinkedIn's DOM and on the API's
   per-post AI tag-suggestion step).
3. After the batch: scroll to the bottom; if a "Show more results" button is
   present, click it; wait up to ~3 s for new cards to appear.
4. Repeat. Terminate when **two consecutive rounds** yield no new cards.
5. Show the final summary. The banner stays until the user navigates away.

**Error handling** (matches the project's "clear errors, never silent
retries" stance):

- **Run-fatal:** auth failure (401 / needs-reconnect) or server unreachable —
  stop the entire run immediately and surface the existing friendly message
  ("reconnect the extension (click its toolbar icon)" / "server not
  reachable"). No automatic retry.
- **Card-local:** a single card that fails to extract or save increments the
  *Failed* counter, logs the post URL to the console, and the run continues.
- **Stop button / navigation away:** cancels between posts; no partial-post
  state exists because each post is a single atomic API call.
- **Toasts:** the per-save error toast in `lib/save.js` is suppressed during
  an import run (the banner is the sole progress/error surface); the
  underlying error string still feeds the banner and counters.

## Data notes

- `savedAt` is the import time; LinkedIn's cards don't expose the original
  save date. Accepted for v1.
- Card text is truncated by LinkedIn; the permalink is always saved, so the
  full post is one click away. Accepted per the fidelity decision.
- Imported posts flow through the normal AI tag-suggestion path, identical to
  live captures.

## Out of scope (v1)

- Popup entry point for the import.
- Per-post full-text enrichment (fetching each permalink).
- An "imported" badge in the web app (possible follow-up off
  `metadata.importedFromSavedPosts`).
- Importing other My-Items sections (articles, jobs).

## Testing

- **Unit (vitest, existing suite pattern):** DOM-fixture tests for saved-page
  detection; loop termination (two empty rounds); run-fatal vs card-local
  error classification; per-run URL dedupe.
- **Existing coverage relied on:** `posts-api.test.js` already covers
  `createOnly` dedupe semantics server-side.
- **Manual:** run against the real saved-posts page (small account and a
  large backlog), verify progress counts, Stop, re-run producing only
  "Already saved", and disconnect mid-run showing the reconnect error.
