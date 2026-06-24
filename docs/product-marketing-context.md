# Product Marketing Context

*Last updated: 2026-06-08*

> **Provenance / confidence note.** This V1 was auto-drafted from the codebase (README,
> extension manifest, tagger, review UI), the existing `docs/jobs-to-be-done.md`, and the
> ICP locked earlier this session (commercial SaaS, founders/operators/BD as core user).
> The product is **pre-launch with no real customers**, so any section requiring real-world
> evidence — Customer Language, Proof Points, some Objections — is marked
> `[hypothesis — validate]` or `[needs founder input]`. Do not treat those as facts.

## Offering Overview
**Company/brand:** LinkedIn Saver
**One-liner:** We help LinkedIn-heavy founders and operators capture the posts worth keeping so they can actually re-find them later, instead of losing them in LinkedIn's unsearchable Saved list.
**What it does:** A Chrome extension auto-captures a LinkedIn post the moment you hit LinkedIn's native Save. The post is stored, auto-tagged with offline heuristics (author, hashtags, your reused vocabulary, key phrases — no LLM, no API key), and surfaced in a searchable, taggable review app. You can also import your existing LinkedIn Saved backlog and export everything back out.
**Why it exists:** LinkedIn's own Saved list is chronological, unsearchable, and untaggable — saving a post there is effectively losing it. The founding insight: the value isn't in *saving*, it's in *re-finding the right post weeks later when a use finally comes up*. `[founding story / personal trigger — needs founder input]`
**Category:** When someone searches for what we do, they'd type "save and organize LinkedIn posts" / "LinkedIn bookmark manager" / "LinkedIn saved posts organizer."
**Offering type:** (a) Product — SaaS (web app + Chrome extension)
**Stage:** (a) Pre-launch
**Business model & pricing:** Intended subscription / freemium SaaS. Pricing not yet set. Peer benchmark from market research: free–~$10/mo (Raindrop ~$3.50/mo, Matter ~$5/mo, Readwise Reader ~$10/mo; LibrarIn free). `[pricing — needs founder decision]`
**Delivery model:** Self-serve. Currently self-hosted (deploy-your-own Vercel + Neon). **Going commercial requires a hosted offering** — self-hosting is incompatible with the chosen ICP. `[hosted product — needs founder decision]`

## Target Audience
**Target customers:** Founders, solo operators, Heads of BD/Sales, RevOps, fractional execs, and consultants at companies of 1–50 people, primarily B2B SaaS / agencies / professional services. US first, then UK/EU.
**Who decides:** The user is the buyer (self-serve, prosumer; no procurement at this price point).
**How they find us:** `[hypothesis — validate]` Google search ("organize LinkedIn saved posts"), word-of-mouth, communities/forums, LinkedIn itself, Chrome Web Store.
**Where they spend time:** LinkedIn (primary), Reddit, X/Twitter, indie/founder communities, PKM ("second brain") circles.
**How they buy:** `[hypothesis — validate]` Feel the pain ("my LinkedIn saves are a black hole") → search or see it mentioned → install Chrome extension → save a few posts → hit the "re-find" payoff → convert. Likely a quick, low-consideration decision (minutes to days).
**Primary use case:** Most customers come to us because they need to re-find a specific saved LinkedIn post (a framework, a hiring tip, a pricing tactic) when a use for it finally arises.
**Jobs to be done:**
- Capture a post the instant it catches the eye, without breaking scroll flow.
- Re-find a specific saved post later, fast, by topic or author.
- Rescue the unusable backlog already trapped in LinkedIn's Saved list.

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---|---|---|---|
| Founder / operator (core) | Acting on tactics they read; not wasting scroll time | LinkedIn Saved is a black hole; can't re-find anything | A searchable, tagged library they can pull from on demand |
| BD / sales / RevOps | Re-finding prospecting angles, playbooks, talk tracks | Saves pile up with zero structure | Find "everything on X" in seconds |
| Privacy-minded technical user | Local/no-API processing, control of their data | Don't want an LLM tool reading their saves | Offline heuristic tagging, no API key, own your data |
| *(Excluded)* Full-time ghostwriter / content agency | Repurposing + scheduling posts | — | Better served by Supergrow/Reepl — explicitly out of ICP |

## Problems & Pain Points
**Core problem:** Before finding us, customers were stuck because every post they "saved" on LinkedIn became unfindable — no search, no tags, no folders, no export.
**Why alternatives fall short:**
- LinkedIn native Save — chronological, unsearchable, untaggable, no export.
- Notion / Obsidian / spreadsheets — require manual copy-paste; capture friction kills the habit.
- Generic read-it-later (Raindrop, Pocket) — not LinkedIn-native; lose author/post structure.
- Doing nothing — and losing it.
**What it costs them:** Missed opportunities (can't act on what they learned) and time (re-hunting posts). Biggest cost: **missed opportunities.** `[validate]`
**Emotional tension:** Frustration; FOMO ("I saw something great and now it's gone"); loss of control to the feed/algorithm.

## Competitive Landscape
**Direct:** PostDeck, Dewey, LibrarIn (free), Super Post Saver, Supergrow, Reepl — same job (organize LinkedIn saves). Most skew toward *content creators*, leaving the founder/operator "re-find a tactic" use less directly served.
**Secondary:** Raindrop.io, Readwise Reader, Pocket, Notion web clipper — solve bookmarking generally but aren't LinkedIn-native and lose post structure.
**Indirect:** LinkedIn's own Save, screenshots, "I'll just remember it" / doing nothing — free and zero-effort, but retrieval is broken.

## Differentiation
**Key differentiators:**
- LinkedIn-native zero-friction capture (piggybacks on the native Save button — no new habit).
- Offline heuristic tagging — no LLM, no API key, no third party reading your data.
- Backlog rescue + clean export (own your library, no lock-in).
**How we do it differently:** Capture happens where the saving already happens; tagging reuses *your* vocabulary so the taxonomy stays consistent.
**Why that's better:** The habit survives because capture costs nothing, and retrieval is dramatically better than LinkedIn's list — which is the whole job.
**Why customers choose us:** `[hypothesis — validate]` Customers pick us over alternatives because we make a post they saved on impulse actually retrievable later, without sending their data anywhere or making them change how they save.

## Objections
| Objection | Response |
|---|---|
| "Why not just use LinkedIn's Save?" | Because it has no search, tags, or export — saving there is losing it. `[validate]` |
| "Another tool to set up / install an extension?" | Capture rides the Save button you already press; setup is one extension install. `[validate]` |
| "Isn't this the same as Raindrop / Notion?" | Those aren't LinkedIn-native and lose author/post structure; capture is manual. `[validate]` |
| "There are already 5 of these (PostDeck, Dewey...)" | `[needs sharper answer — current weak spot; founder input]` |

**Anti-persona:** Full-time LinkedIn ghostwriters and content agencies (want repurposing/scheduling, not re-finding); mobile-only LinkedIn users (capture needs the desktop Chrome extension); 200+ employee orgs (tooling gets centralized).

## Switching Dynamics
**Push:** LinkedIn Saved is unusable; frustration + FOMO of losing good posts; cost of missed opportunities.
**Pull:** Zero-friction native capture, real search/tags, privacy (no LLM), export/no lock-in.
**Habit:** They already press LinkedIn Save reflexively — and tolerate the black hole because it's "free" and there. `[validate]`
**Anxiety:** "Is another tool worth it?"; trusting a new extension with LinkedIn activity; will tagging actually be accurate enough to trust? `[validate]`

## Customer Language
> `[hypothesis — validate via real customer interviews; no real quotes exist yet]`

**How they describe the problem:**
- "My LinkedIn saved posts are a black hole — I can never find anything again." `[invented; validate]`
**How they describe us:**
- `[no verbatim customer language yet — needs real users]`
**Words to use:** save, re-find, black hole, swipe file, second brain, tag, search, your data.
**Words to avoid:** "AI-powered" (contradicts the no-LLM differentiator), "enterprise," jargon.
**Glossary:**
| Term | Meaning |
|---|---|
| Native Save | LinkedIn's built-in bookmark button the extension hooks into |
| Backlog rescue | Importing posts already saved inside LinkedIn |
| Offline tagging | Heuristic tag suggestions computed without any LLM/API |

## Brand Voice
> `[needs founder input — drafted from product tone]`
**Personality:** Practical, unflashy, privacy-respecting — a sharp tool, not a hype machine.
**Voice attributes:**
| Attribute | We are | We are not |
|---|---|---|
| Practical | Plain, useful, concrete | Buzzwordy, salesy |
| Honest | Upfront about scope and limits | Overpromising |
| Privacy-first | "Your data stays yours" | Surveillance-y, "AI reads everything" |
**Tone direction:** Casual-leaning, accessible, measured, direct.
**Voice do's:** Explain the job plainly; lead with retrieval, not features.
**Voice don'ts:** Don't claim AI magic; don't oversell.
**Sample sentence:** "Save it the way you already do — then actually find it again."
**Tone shifts:** `[n/a until channels defined]`

## Proof Points
> `[pre-launch — minimal proof exists; do not fabricate]`
**Metrics:** None yet (pre-launch).
**Customers/Credentials:** None yet. Founder/builder credibility = `[needs founder input]`.
**Testimonials:** None yet.
**Value themes:**
| Theme | Proof |
|---|---|
| Re-finding works | `[needs a demo / pilot result]` |
| Privacy (no LLM) | Verifiable in code: offline tagger, no API key |
| No lock-in | Verifiable: export built in |

## Goals
> `[needs founder confirmation]`
**Business goal:** (b) Acquire first users + (d) build awareness (pre-launch).
**Conversion action:** Likely (a) install extension / create account, then activate on first re-find.
**Current metrics:** None tracked yet.
