# Jobs-to-be-Done — LinkedIn Saver

> Applied via the `jobs-to-be-done` skill (deanpeters/product-manager-skills), which follows
> Christensen's JTBD + Osterwalder's Value Proposition Canvas (jobs / pains / gains).
>
> **Provenance caveat (skill Pitfall #4 — "don't fabricate JTBD without research"):**
> This analysis is **inferred from the product itself** — README, the offline tagger, the
> extension capture/import flows, and the review UI — *not* from customer interviews. Treat every
> line below as a **hypothesis to validate**, not a finding. See "Validation" at the end for the
> switch-interview questions that would confirm or kill each one. Run those with the `mom-test` skill.

---

## Step 1 — Context

**Product in one line:** a save-and-classify tool that captures LinkedIn posts the moment you press
LinkedIn's native Save, auto-suggests tags offline (author + hashtags + reused vocabulary + key
phrases), and makes the pile searchable, taggable, collectable, and exportable.

**Target customer segment (ICP, assumed):** a single power-user who is active on LinkedIn and treats
it as a learning/idea feed — founders, PMs, marketers, creators, recruiters, devs — who *already*
hits LinkedIn "Save" a lot but finds the resulting list useless for retrieval. Secondary trait:
technical enough to install a Chrome extension and self-host on Vercel + Neon (this likely narrows
the reachable ICP — flagged as a risk).

**Situation / trigger (when the job arises):**
- *In-the-moment:* "I'm scrolling and a post worth keeping goes by (a framework, a hiring tip, a
  tool, a thread) — I want it kept so I can actually use it later, without breaking my scroll."
- *Backlog:* "My LinkedIn Saved list has hundreds of items I can't search, sort, or trust."

**Current solutions / competing alternatives (the non-obvious "hires"):**
- LinkedIn's native **Save** — the incumbent. Chronological, unsearchable, untaggable, no export.
- Read-it-later / bookmarking — Raindrop.io (the stated comparable), Pocket, Instapaper.
- Notes apps — Notion / Obsidian / Apple Notes (paste the link or text by hand).
- Screenshots to the camera roll; browser bookmarks; a Google Doc / spreadsheet "swipe file."
- Doing nothing — and losing it.

---

## Jobs-to-be-Done

### 1. Customer Jobs

#### Functional Jobs
- Capture a LinkedIn post the instant it catches my eye, without leaving the feed or breaking flow.
- Recall a *specific* saved post later, when a use for it finally comes up (find it again, fast).
- Organize saves into topics/themes I can browse instead of one endless chronological list.
- Rescue the backlog of posts I already saved inside LinkedIn but can't use.
- Get content back out — reuse a saved post's text/link/author in my own writing, research, or a
  shared list (export).
- Classify each save correctly with near-zero typing.

#### Social Jobs
- Be seen as well-read and on top of my field — "I always have the right reference on hand."
- Be the person in a team/community who produces the useful resource on demand (curator reputation).
- Look intentional and organized, not like a hoarder of unsorted links.

#### Emotional Jobs
- Avoid the FOMO of "I saw something great and now it's gone."
- Feel *in control* of my own knowledge instead of at the mercy of the feed and the algorithm.
- Get the small closure/satisfaction of a tidy, searchable library — the save actually "lands."
- Avoid the guilt and overwhelm of a giant unread, unsorted Saved pile.

### 2. Pains

#### Challenges
- LinkedIn's Saved list is chronological only — no search, no tags, no folders.
- Posts vanish from the feed; miss the save in the moment and it's gone.
- Copying a post into Notion / a doc by hand breaks flow and drops the author/source metadata.
- LinkedIn offers no export — the content is trapped where it can't be reused.

#### Costliness
- Hand-tagging/organizing every save is tedious, so almost nobody does it — the pile stays useless.
- Re-finding one post means scrolling through hundreds of undifferentiated saves.
- Maintaining a *separate* notes system just for LinkedIn rarely pays off, so it gets abandoned.

#### Common Mistakes
- Pressing LinkedIn's bookmark and assuming you'll find it later (you won't).
- Inconsistent, freeform tags across tools, so filters never actually work (tag sprawl).
- Letting the Saved list balloon into a backlog you eventually stop opening at all.
- Saving only the text and losing the author/attribution.

#### Unresolved Problems
- No tool classifies LinkedIn saves *for you* — Raindrop/Pocket don't auto-tag by author+topic, and
  LinkedIn doesn't tag at all.
- Generic read-it-later tools aren't LinkedIn-aware — they don't capture author, hashtags, and post
  structure straight from the in-feed Save action.
- No bridge to migrate the *existing* LinkedIn Saved backlog into something searchable.
- Ownership/portability: your curated knowledge stays locked inside LinkedIn.

### 3. Gains

#### Expectations
- Saving is one click on the LinkedIn Save button I already press — no new habit to build.
  *(Realized by the extension's native-Save hook, `extension/native-save.js`.)*
- Tags are suggested automatically and are good enough that I mostly just accept them.
  *(The offline tagger: author label + hashtags + key phrases, `api/_lib/tagger.js`.)*
- It reuses the tags I've used before, so my vocabulary stays consistent instead of sprawling.
  *(Existing-vocabulary matching in the tagger.)*

#### Savings
- Collapse "save → organize" from a multi-step chore into a single accept-the-suggestions tap.
- Find any saved post in seconds via tag/keyword filter instead of scrolling.
- Rescue the whole existing LinkedIn Saved backlog in one bulk import instead of redoing it
  post-by-post. *(`extension/saved-import.js`.)*

#### Adoption Factors
- Rides on the Save action users already perform — near-zero switching cost / behavior change.
- No LLM, no API key, no per-item cost — private and free to run. *(Explicit product stance.)*
- CSV export — data isn't locked in, which lowers the risk of committing. *(`src/exportCsv.js`.)*
- Self-hostable on the user's own Vercel + Neon — they own the data.

#### Life Improvement
- LinkedIn turns into a real personal knowledge base instead of a black hole.
- Lower mental load: trust that anything worth keeping is captured and findable, so you can keep
  scrolling guilt-free.
- Passive consumption becomes a reusable asset — a swipe file for your own posts, research, hiring.

---

## Step 5 — Prioritize & Validate

### Pains ranked by intensity
1. **"LinkedIn Saved is unsearchable / unsortable."** The core wound. Answered by tags + search +
   collections.
2. **"Organizing by hand is too costly, so nobody does it."** The reason *every* alternative fails —
   and the product's wedge. Answered by auto-tagging.
3. **"My existing backlog is trapped."** The activation pain. Answered by bulk import.

*Secondary (real, but not the daily acute pain): export, attribution preservation, ownership.*

### Must-have vs. nice-to-have gains
- **Must-have:** one-click capture on native Save · good-enough auto-tags · fast retrieval.
- **Nice-to-have (but sticky as the library grows):** collections (recent feature), CSV export,
  self-hosting.

### The single biggest lever
> If only one job were solved: **auto-classification of saves.** It's what converts a bookmark pile
> into a knowledge base, and it's the one thing the incumbents (LinkedIn, Raindrop, Pocket) don't do
> for LinkedIn content. The whole bet rides on the tagger being *"good enough to just accept."*

### Riskiest assumptions to validate (run via the `mom-test` skill — switch interviews)
1. **Does retrieval pain actually exist?** If users save-and-forget and never come back to look, the
   whole job evaporates. → *"Tell me about the last time you tried to find a LinkedIn post you'd
   saved. What did you do?"*
2. **Are auto-tags accurate enough to accept rather than rewrite?** → Instrument the
   **accept-vs-edit rate** on suggested tags. If users rewrite most of them, the wedge is dull.
3. **Is the setup cost (Chrome extension + self-host on Vercel/Neon) too high for non-developers?**
   → May narrow the ICP to technical users; test with a non-technical saver.
4. **Is LinkedIn-specificity an asset or a ceiling?** → Would users want the same for X/Twitter,
   newsletters, articles? Decides whether this is "LinkedIn Saver" or "a knowledge base that starts
   with LinkedIn."
