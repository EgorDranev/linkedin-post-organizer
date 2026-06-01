import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../data/app.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS posts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    url             TEXT UNIQUE,
    author          TEXT,
    author_headline TEXT,
    text            TEXT NOT NULL,
    saved_at        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'review',   -- review | filed
    suggested       TEXT NOT NULL DEFAULT '[]'        -- JSON: [{tag, score, isExisting}]
  );

  CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
  );
`);

/** All tag names currently in the vocabulary, with usage counts. */
export function allTags() {
  return db
    .prepare(
      `SELECT t.name AS name, COUNT(pt.post_id) AS count
       FROM tags t LEFT JOIN post_tags pt ON pt.tag_id = t.id
       GROUP BY t.id ORDER BY count DESC, t.name ASC`
    )
    .all();
}

/** Get-or-create a tag row by name, returns its id. */
export function upsertTag(name) {
  const clean = name.trim().toLowerCase();
  db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(clean);
  return db.prepare(`SELECT id FROM tags WHERE name = ?`).get(clean).id;
}

/** Tag names attached to a post. */
export function tagsForPost(postId) {
  return db
    .prepare(
      `SELECT t.name FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
       WHERE pt.post_id = ? ORDER BY t.name`
    )
    .all(postId)
    .map((r) => r.name);
}

/** Replace a post's accepted tag set with the given names. */
export function setPostTags(postId, names) {
  db.prepare(`DELETE FROM post_tags WHERE post_id = ?`).run(postId);
  for (const name of names) {
    if (!name || !name.trim()) continue;
    const tagId = upsertTag(name);
    db.prepare(
      `INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)`
    ).run(postId, tagId);
  }
}
