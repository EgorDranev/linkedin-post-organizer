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
        url             TEXT UNIQUE,
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
        id   BIGSERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS post_tags (
        post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        tag_id  BIGINT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
        PRIMARY KEY (post_id, tag_id)
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS collections (
        id            BIGSERIAL PRIMARY KEY,
        name          TEXT UNIQUE NOT NULL,
        description   TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS post_collections (
        post_id       BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        collection_id BIGINT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        PRIMARY KEY (post_id, collection_id)
      )`;
  })();
  return schemaReady;
}

// --- queries ---------------------------------------------------------------

export async function allTags() {
  return await sql`
    SELECT t.name AS name, COUNT(pt.post_id)::int AS count
    FROM tags t LEFT JOIN post_tags pt ON pt.tag_id = t.id
    GROUP BY t.id ORDER BY count DESC, t.name ASC`;
}

export async function upsertTag(name) {
  const clean = name.trim().toLowerCase();
  const rows = await sql`
    INSERT INTO tags (name) VALUES (${clean})
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`;
  return rows[0].id;
}

export async function tagsForPost(postId) {
  const rows = await sql`
    SELECT t.name FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
    WHERE pt.post_id = ${postId} ORDER BY t.name`;
  return rows.map((r) => r.name);
}

export async function setPostTags(postId, names) {
  await sql`DELETE FROM post_tags WHERE post_id = ${postId}`;
  for (const name of names) {
    if (!name || !name.trim()) continue;
    const tagId = await upsertTag(name);
    await sql`
      INSERT INTO post_tags (post_id, tag_id) VALUES (${postId}, ${tagId})
      ON CONFLICT DO NOTHING`;
  }
}

export async function hydrate(row) {
  return {
    id: Number(row.id),
    url: row.url,
    author: row.author,
    authorHeadline: row.author_headline,
    text: row.text,
    savedAt: row.saved_at,
    status: row.status,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : {},
    media: Array.isArray(row.media) ? row.media : [],
    tags: await tagsForPost(row.id),
    collections: await getCollectionsForPost(row.id),
    // jsonb is returned already parsed by the driver
    suggested: Array.isArray(row.suggested) ? row.suggested : [],
  };
}

export async function getPost(id) {
  const rows = await sql`SELECT * FROM posts WHERE id = ${id}`;
  return rows.length ? hydrate(rows[0]) : null;
}

// --- collection functions --------------------------------------------------

export async function getAllCollections() {
  return await sql`SELECT id, name, description, created_at FROM collections ORDER BY name`;
}

export async function getCollectionById(id) {
  const rows = await sql`SELECT id, name, description, created_at FROM collections WHERE id = ${id}`;
  return rows.length ? rows[0] : null;
}

export async function getCollectionByName(name) {
  const rows = await sql`SELECT id, name, description, created_at FROM collections WHERE name = ${name}`;
  return rows.length ? rows[0] : null;
}

export async function createCollection(name, description = null) {
  const existing = await getCollectionByName(name);
  if (existing) return existing;

  const rows = await sql`
    INSERT INTO collections (name, description)
    VALUES (${name}, ${description})
    RETURNING id, name, description, created_at`;
  return rows[0];
}

export async function updateCollection(id, name, description = null) {
  const rows = await sql`
    UPDATE collections
    SET name = ${name}, description = ${description}
    WHERE id = ${id}
    RETURNING id, name, description, created_at`;
  return rows[0];
}

export async function deleteCollection(id) {
  await sql`DELETE FROM post_collections WHERE collection_id = ${id}`;
  await sql`DELETE FROM collections WHERE id = ${id}`;
}

export async function getPostsInCollection(collectionId) {
  const rows = await sql`
    SELECT p.* FROM posts p
    JOIN post_collections pc ON p.id = pc.post_id
    WHERE pc.collection_id = ${collectionId}
    ORDER BY p.saved_at DESC, p.id DESC`;
  return Promise.all(rows.map(hydrate));
}

export async function addPostToCollection(postId, collectionId) {
  await sql`
    INSERT INTO post_collections (post_id, collection_id)
    VALUES (${postId}, ${collectionId})
    ON CONFLICT DO NOTHING`;
}

export async function removePostFromCollection(postId, collectionId) {
  await sql`
    DELETE FROM post_collections
    WHERE post_id = ${postId} AND collection_id = ${collectionId}`;
}

export async function getCollectionsForPost(postId) {
  const rows = await sql`
    SELECT c.id, c.name, c.description, c.created_at
    FROM collections c
    JOIN post_collections pc ON c.id = pc.collection_id
    WHERE pc.post_id = ${postId}
    ORDER BY c.name`;
  return rows;
}

export async function removePostFromAllCollections(postId) {
  await sql`DELETE FROM post_collections WHERE post_id = ${postId}`;
}
