import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

function localEnvCandidates() {
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  const seen = new Set();
  const files = [];

  for (const start of starts) {
    let dir = start;
    for (let depth = 0; depth < 6; depth += 1) {
      for (const name of [".env.local", ".env"]) {
        const file = join(dir, name);
        if (!seen.has(file)) {
          seen.add(file);
          files.push(file);
        }
      }

      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return files;
}

function loadLocalEnvIfNeeded() {
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL) {
    return;
  }

  for (const filename of localEnvCandidates()) {
    if (!existsSync(filename)) continue;

    for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;

      process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    }

    if (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL) {
      return;
    }
  }
}

loadLocalEnvIfNeeded();

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

if (!connectionString) {
  console.warn(
    "No DATABASE_URL / POSTGRES_URL set — API calls will fail until a Postgres database is connected."
  );
}

export const hasDatabase = Boolean(connectionString);
export const sql = hasDatabase
  ? neon(connectionString)
  : async () => {
      throw new Error("Database connection string is not configured");
    };

// --- lazy schema init (idempotent, runs once per cold start) ---------------

let schemaReady = null;

export function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS posts (
        id              BIGSERIAL PRIMARY KEY,
        user_id         TEXT NOT NULL,
        url             TEXT,
        author          TEXT,
        author_headline TEXT,
        text            TEXT NOT NULL,
        saved_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        status          TEXT NOT NULL DEFAULT 'review',
        suggested       JSONB NOT NULL DEFAULT '[]'::jsonb,
        metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
        media           JSONB NOT NULL DEFAULT '[]'::jsonb
      )`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`;
    await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb`;
    await sql`
      CREATE TABLE IF NOT EXISTS tags (
        id      BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        name    TEXT NOT NULL
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS post_tags (
        user_id TEXT NOT NULL,
        post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        tag_id  BIGINT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
        PRIMARY KEY (post_id, tag_id)
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS collections (
        id            BIGSERIAL PRIMARY KEY,
        user_id       TEXT NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS post_collections (
        user_id       TEXT NOT NULL,
        post_id       BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        collection_id BIGINT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        PRIMARY KEY (post_id, collection_id)
      )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS posts_user_url_unique ON posts (user_id, url) WHERE url IS NOT NULL`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_unique ON tags (user_id, name)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS collections_user_name_unique ON collections (user_id, name)`;
    await sql`
      CREATE TABLE IF NOT EXISTS extension_pairings (
        id UUID PRIMARY KEY,
        verifier_hash TEXT NOT NULL,
        user_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL,
        approved_at TIMESTAMPTZ,
        consumed_at TIMESTAMPTZ
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS extension_tokens (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL DEFAULT 'Chrome extension',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      )`;
  })();
  return schemaReady;
}

// --- owner-aware repository -------------------------------------------------

export function createRepository(db) {
  async function tagsForPost(userId, postId) {
    const rows = await db`
      SELECT t.name FROM post_tags pt
      JOIN tags t ON t.id = pt.tag_id AND t.user_id = ${userId}
      WHERE pt.user_id = ${userId} AND pt.post_id = ${postId}
      ORDER BY t.name`;
    return rows.map((row) => row.name);
  }

  async function getPost(userId, id) {
    const rows = await db`SELECT * FROM posts WHERE user_id = ${userId} AND id = ${id}`;
    return rows.length ? hydrate(userId, rows[0]) : null;
  }

  async function allTags(userId) {
    return db`
      SELECT t.name, COUNT(pt.post_id)::int AS count
      FROM tags t
      LEFT JOIN post_tags pt ON pt.tag_id = t.id AND pt.user_id = ${userId}
      WHERE t.user_id = ${userId}
      GROUP BY t.id ORDER BY count DESC, t.name ASC`;
  }

  async function upsertTag(userId, name) {
    const clean = name.trim().toLowerCase();
    const rows = await db`
      INSERT INTO tags (user_id, name) VALUES (${userId}, ${clean})
      ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id`;
    return rows[0].id;
  }

  async function setPostTags(userId, postId, names) {
    await db`DELETE FROM post_tags WHERE user_id = ${userId} AND post_id = ${postId}`;
    for (const name of names) {
      if (!name?.trim()) continue;
      const tagId = await upsertTag(userId, name);
      await db`
        INSERT INTO post_tags (user_id, post_id, tag_id)
        VALUES (${userId}, ${postId}, ${tagId}) ON CONFLICT DO NOTHING`;
    }
  }

  async function hydrate(userId, row) {
    return {
      id: Number(row.id), url: row.url, author: row.author,
      authorHeadline: row.author_headline, text: row.text,
      savedAt: row.saved_at, status: row.status,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? row.metadata
          : {},
      media: Array.isArray(row.media) ? row.media : [],
      tags: await tagsForPost(userId, row.id),
      suggested: Array.isArray(row.suggested) ? row.suggested : [],
    };
  }

  return { allTags, getPost, hydrate, setPostTags, tagsForPost, upsertTag };
}

const repository = createRepository(sql);
export const { allTags, getPost, hydrate, setPostTags, tagsForPost, upsertTag } = repository;
