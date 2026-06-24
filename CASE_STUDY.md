# Case study — LinkedIn Saver

**Role:** Solo product builder — discovery → delivery, end to end
**Stack:** Vite + React · Vercel serverless · Neon Postgres · Chrome MV3 · Claude (Anthropic)
**Status:** Pre-launch personal product (no user/revenue metrics yet — see the honesty note at the end)
**Live:** https://linkedin-saver.vercel.app · **Code:** this repository

---

## The problem

LinkedIn's own **Saved** list is a black hole. It's chronological, you can't search it,
you can't tag it, you can't export it. In practice, **saving a post is the same as losing
it** — by the time a use for it actually comes up (a hiring tip, a pricing tactic, a
framework), you can't find it again.

The real value was never in the *saving*. It's in **re-finding the right post weeks later**.

## The insight

Two things have to be true for that re-finding to work, and they're in tension:

1. Posts need structure (tags, summaries, themes) to be retrievable.
2. **Nobody manually tags their saves** — it's too much effort, so the list stays dead.

So the structure has to appear *for free*, at the moment of capture, without asking the
user to build a new habit. That framing drove every product decision below.

## What I built

A save-and-classify tool — think Raindrop.io, but purpose-built for LinkedIn and
AI-assisted.

- **Capture with zero new habit.** A Chrome MV3 extension rides on top of LinkedIn's
  *native* Save button. You save the way you already do; the post is captured, parsed,
  and sent to the app automatically — no extra click, no broken scroll.
- **Structure for free.** Each post is auto-tagged against a small, deliberate taxonomy
  (`author` · `topic` · `format` · `source` · `intent`), gets a one-line summary, and is
  clustered into ~6–10 named themes across the whole library.
- **Rescue the backlog.** A bulk importer pulls in the hundreds of items already trapped
  in LinkedIn's Saved list, so the tool is useful on day one rather than only going forward.
- **Get the data back out.** A one-command export produces a self-contained, offline,
  searchable HTML page **and** an XLSX workbook (one row per post + a By-Theme sheet) —
  no lock-in.
- **Collections & review UI.** A clean React app to accept/edit suggested tags, browse,
  and organize.

## The decision I'm most proud of: AI that degrades gracefully

The intelligence layer ([`api/_lib/ai.js`](api/_lib/ai.js)) asks **Claude** to suggest
tags, write summaries, and cluster themes — reusing the user's existing tag vocabulary so
the taxonomy stays consistent instead of sprawling.

But the AI is **strictly optional**. Every AI function mirrors a deterministic, offline
counterpart ([`tagger.js`](api/_lib/tagger.js) · [`summarize.js`](api/_lib/summarize.js) ·
[`themes.js`](api/_lib/themes.js)) and returns the **exact same shape**. With no
`ANTHROPIC_API_KEY`, or on *any* API or parse error, it falls back transparently to the
heuristics. The rest of the app never knows the difference.

Why this matters:

- **The app always works** — a missing key or a flaky API never produces a broken screen.
- **It's privacy-respecting by default** — the offline path does real work (hashtag and
  vocabulary-weighted, document-frequency theme clustering) with no LLM and no key.
- **AI is an upgrade, not a dependency** — exactly the posture I'd want in a production
  system where a third-party model sits on the critical path.

## Architecture

```
Chrome MV3 extension ──(native Save → POST /api/posts)──▶ Vercel serverless /api
        React web app ──(fetch)──────────────────────────▶  ├─ routes: posts · collections · tags · auth
                                                             ├─ _lib/ai.js ──(key set)──▶ Claude (Anthropic)
                                                             │        └─(no key / error)─▶ tagger · summarize · themes
                                                             └─ db.js ───────────────────▶ Neon Postgres
```

- **Serverless API** on Vercel (`/api/*`), thin route handlers over a small DB layer.
- **Schema is idempotent** (`CREATE TABLE IF NOT EXISTS` on first request) — no migration step.
- **One taxonomy, reused vocabulary** keeps tags consistent across the whole library.
- **Same response shape** from AI and heuristics is the seam that makes the fallback invisible.

## How I built it

Solo, **AI-first**, through daily use of **Claude Code** — and across the *whole* product
surface, not just the coding:

- **Discovery:** a structured Jobs-to-be-Done analysis and an ICP / product-marketing
  context doc (both in [`docs/`](docs/)), explicitly caveated as hypotheses to validate
  rather than findings.
- **Delivery:** specs, the React app, the serverless API, the Chrome extension, the
  export tooling, and deployment — shipped to production on Vercel.

The point of the project is partly the product and partly the **method**: how far one
person can take a real, full-stack, multi-surface product (web + serverless + browser
extension + AI) by driving an agentic toolchain end to end.

## Honesty note on results

This is a **pre-launch personal product with no real users yet**, so there are no
conversion, retention, or revenue numbers — and I won't invent them. What this case study
demonstrates is concrete and verifiable: **a complete, working, full-stack AI product
designed and shipped solo**, with deliberate engineering choices (graceful AI degradation,
no lock-in, zero-habit capture) you can read directly in the code in this repository.

Next steps if taken further: validate the JTBD hypotheses with switch interviews, add a
hosted multi-tenant mode, and instrument the capture → re-find loop to measure whether the
"re-find weeks later" payoff actually lands.
