import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  db,
  allTags,
  tagsForPost,
  setPostTags,
} from "./db.js";
import { suggestTags } from "./tagger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors()); // reflect origin — allows the web app and the extension worker
app.use(express.json({ limit: "1mb" }));

// --- helpers ---------------------------------------------------------------

function hydrate(row) {
  return {
    id: row.id,
    url: row.url,
    author: row.author,
    authorHeadline: row.author_headline,
    text: row.text,
    savedAt: row.saved_at,
    status: row.status,
    tags: tagsForPost(row.id),
    suggested: JSON.parse(row.suggested || "[]"),
  };
}

function getPost(id) {
  const row = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id);
  return row ? hydrate(row) : null;
}

// --- routes ----------------------------------------------------------------

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/tags", (_req, res) => res.json(allTags()));

app.get("/api/posts", (_req, res) => {
  const rows = db
    .prepare(`SELECT * FROM posts ORDER BY datetime(saved_at) DESC, id DESC`)
    .all();
  res.json(rows.map(hydrate));
});

app.get("/api/posts/:id", (req, res) => {
  const post = getPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: "not found" });
  res.json(post);
});

// Save a post (from extension or manual form). Upserts by url when present.
app.post("/api/posts", (req, res) => {
  const { url, author, authorHeadline, text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }

  const suggestions = suggestTags(text, allTags());
  const suggestedJson = JSON.stringify(suggestions);
  const savedAt = new Date().toISOString();

  // If we already have this URL, refresh its content + suggestions instead of duplicating.
  const existing = url
    ? db.prepare(`SELECT id FROM posts WHERE url = ?`).get(url)
    : null;

  let id;
  if (existing) {
    id = existing.id;
    db.prepare(
      `UPDATE posts SET author=?, author_headline=?, text=?, suggested=? WHERE id=?`
    ).run(author ?? null, authorHeadline ?? null, text, suggestedJson, id);
  } else {
    const info = db
      .prepare(
        `INSERT INTO posts (url, author, author_headline, text, saved_at, status, suggested)
         VALUES (?, ?, ?, ?, ?, 'review', ?)`
      )
      .run(url ?? null, author ?? null, authorHeadline ?? null, text, savedAt, suggestedJson);
    id = info.lastInsertRowid;
  }

  res.status(existing ? 200 : 201).json({ ...getPost(id), duplicate: !!existing });
});

// Update accepted tags + remaining suggestions for a post.
// Body: { tags?: string[], suggested?: {tag,score,isExisting}[] }
app.patch("/api/posts/:id", (req, res) => {
  const id = Number(req.params.id);
  const post = getPost(id);
  if (!post) return res.status(404).json({ error: "not found" });

  const { tags, suggested } = req.body || {};

  if (Array.isArray(tags)) {
    setPostTags(id, tags);
    const status = tags.length > 0 ? "filed" : "review";
    db.prepare(`UPDATE posts SET status = ? WHERE id = ?`).run(status, id);
  }
  if (Array.isArray(suggested)) {
    db.prepare(`UPDATE posts SET suggested = ? WHERE id = ?`).run(
      JSON.stringify(suggested),
      id
    );
  }

  res.json(getPost(id));
});

// Recompute suggestions for a post from its current text + vocabulary.
app.post("/api/posts/:id/resuggest", (req, res) => {
  const id = Number(req.params.id);
  const post = getPost(id);
  if (!post) return res.status(404).json({ error: "not found" });
  const suggestions = suggestTags(post.text, allTags());
  db.prepare(`UPDATE posts SET suggested = ? WHERE id = ?`).run(
    JSON.stringify(suggestions),
    id
  );
  res.json(getPost(id));
});

app.delete("/api/posts/:id", (req, res) => {
  db.prepare(`DELETE FROM posts WHERE id = ?`).run(Number(req.params.id));
  res.status(204).end();
});

// --- serve built web app in production (optional single-origin mode) -------
const webDist = resolve(__dirname, "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(resolve(webDist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`linkedin-saver server on http://localhost:${PORT}`);
});
