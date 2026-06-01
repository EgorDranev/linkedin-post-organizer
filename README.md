# LinkedIn Saver

A private, local **save-and-classify** tool for LinkedIn posts — like Raindrop.io,
but it **suggests tags** for each post using offline heuristics (no API key, no cloud).

Three parts, one machine:

| Part | What it does | Stack |
|------|--------------|-------|
| `server/` | Stores posts, suggests tags | Node + built-in `node:sqlite` + Express |
| `web/` | Review posts, accept/edit tags | Vite + React |
| `extension/` | "💾 Save" button on linkedin.com | Chrome MV3 |

Data lives in `server/data/app.db` (SQLite, git-ignored). Nothing leaves your machine.

## Run it

Two terminals:

```bash
# 1. backend (port 4000)
cd server && npm install && npm run dev

# 2. web app (port 5173, proxies /api -> 4000)
cd web && npm install && npm run dev
```

Open http://localhost:5173. Paste a post to try the **save → suggest → accept** loop
without the extension.

## Load the browser extension

1. Make sure the **server is running** (port 4000).
2. Chrome → `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the `extension/` folder.
4. Go to linkedin.com. Each post gets a **💾 Save** button. Click it — the post is
   sent to your local app with suggested tags. Review them at http://localhost:5173.

> The content script reads LinkedIn's DOM, whose class names change often. If the
> Save button stops capturing text, update the selectors in
> [`extension/content.js`](extension/content.js).

## How tag suggestion works

Pure local heuristics in [`server/src/tagger.js`](server/src/tagger.js), ranked:

1. **Hashtags** in the post (strongest).
2. **Existing tags** you've used before that also appear in the post (reuses your taxonomy).
3. **Frequent two-word phrases** (bigrams).
4. **Frequent keywords**, boosted when Capitalized in the source.

The more you tag, the better step 2 gets — suggestions converge on *your* vocabulary.
Swapping in an LLM later is a one-function change (`suggestTags`).

## Scope (v1)

Built: save a post → see suggested tags → accept / reject / add. Manual paste + extension capture.
Deferred (data model already supports them): browse/filter by tag, tag management, collections.
