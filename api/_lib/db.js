import { neon } from "@neondatabase/serverless";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

if (!connectionString) {
  console.warn(
    "No DATABASE_URL / POSTGRES_URL set — API calls will fail until a Postgres database is connected."
  );
}

export const sql = neon(connectionString);

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
    // jsonb is returned already parsed by the driver
    suggested: Array.isArray(row.suggested) ? row.suggested : [],
  };
}

export async function getPost(id) {
  const rows = await sql`SELECT * FROM posts WHERE id = ${id}`;
  return rows.length ? hydrate(rows[0]) : null;
}
