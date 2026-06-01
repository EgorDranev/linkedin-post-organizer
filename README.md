# LinkedIn Saver

A **save-and-classify** tool for LinkedIn posts — like Raindrop.io, but it
**suggests tags** for each post using offline heuristics (no LLM, no API key).

Deployed on **Vercel**: a Vite + React frontend, serverless functions in `/api`,
and **Neon Postgres** for storage.

| Part | What it does | Stack |
|------|--------------|-------|
| `src/` | Review posts, accept/edit tags | Vite + React |
| `api/` | Store posts, suggest tags | Vercel serverless functions |
| `api/_lib/` | DB layer + heuristic tagger | `@neondatabase/serverless` |
| `extension/` | Auto-capture on LinkedIn native Save | Chrome MV3 |

## Deploy

```bash
npm install
vercel link            # link to / create the Vercel project
# Connect a Neon Postgres store in the Vercel dashboard
#   Storage → Create → Neon  (injects POSTGRES_URL automatically)
vercel --prod          # deploy
```

The schema is created automatically on first request (idempotent
`CREATE TABLE IF NOT EXISTS`), so there's no migration step.

## Local development

```bash
npm install
vercel env pull        # pull POSTGRES_URL / DATABASE_URL into .env
vercel dev             # frontend + /api functions on http://localhost:3000
```

Open http://localhost:3000 and paste a post to try the **save → suggest → accept**
loop. `vercel dev` runs the same serverless functions you deploy.

## Browser extension

1. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → `extension/`.
2. Click the extension icon, set **App server URL** to your Vercel URL (or
   `http://localhost:3000` for local dev), password if configured, and **Save settings**.
3. On linkedin.com, use LinkedIn’s built-in **Save** on any feed post — it is sent to your app automatically.

> The content script reads LinkedIn’s DOM, whose class names change often. If auto-capture stops working:
> 1. Open DevTools on a feed post and inspect the native **Save** button (`aria-label`, action bar classes).
> 2. Update selectors in [`extension/lib/extract.js`](extension/lib/extract.js) (post text/author) and [`extension/native-save.js`](extension/native-save.js) (save button detection).
> 3. Confirm the popup shows a connected server and the correct password (`/api/session`).

## How tag suggestion works

Pure local heuristics in [`api/_lib/tagger.js`](api/_lib/tagger.js), ranked:

1. **Hashtags** in the post (strongest).
2. **Existing tags** you've used before that also appear in the post (reuses your taxonomy).
3. **Frequent two-word phrases** (bigrams).
4. **Frequent keywords**, boosted when Capitalized in the source.

Swapping in an LLM later is a one-function change (`suggestTags`).

## Scope (v1)

Built: save a post → see suggested tags → accept / reject / add. Manual paste + extension auto-capture on LinkedIn Save.
Deferred (schema already supports them): browse/filter by tag, tag management, collections.
