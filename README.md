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
| `extension/` | "💾 Save" button on linkedin.com | Chrome MV3 |

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
   `http://localhost:3000` for local dev), and Save.
3. On linkedin.com, each post gets a **💾 Save** button.

> The content script reads LinkedIn's DOM, whose class names change often. If
> capture breaks, update the selectors in [`extension/content.js`](extension/content.js).

## How tag suggestion works

Pure local heuristics in [`api/_lib/tagger.js`](api/_lib/tagger.js), ranked:

1. **Hashtags** in the post (strongest).
2. **Existing tags** you've used before that also appear in the post (reuses your taxonomy).
3. **Frequent two-word phrases** (bigrams).
4. **Frequent keywords**, boosted when Capitalized in the source.

Swapping in an LLM later is a one-function change (`suggestTags`).

## Scope (v1)

Built: save a post → see suggested tags → accept / reject / add. Manual paste + extension capture.
Deferred (schema already supports them): browse/filter by tag, tag management, collections.
