import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const founderUserId = process.env.FOUNDER_USER_ID;
if (!connectionString) throw new Error("DATABASE_URL or POSTGRES_URL is required");

const sql = neon(connectionString);
await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id TEXT`;
await sql`ALTER TABLE tags ADD COLUMN IF NOT EXISTS user_id TEXT`;
await sql`ALTER TABLE post_tags ADD COLUMN IF NOT EXISTS user_id TEXT`;
await sql`ALTER TABLE collections ADD COLUMN IF NOT EXISTS user_id TEXT`;
await sql`ALTER TABLE post_collections ADD COLUMN IF NOT EXISTS user_id TEXT`;

// Guard on unowned rows in EVERY migrated table, not just posts: tags and
// collections outlive their posts in this schema, and a partial earlier run
// can leave later tables unowned while posts are already backfilled. The
// statements below run autocommit (no transaction), so entering the SET NOT
// NULL block with any stragglers would abort half-migrated.
const [{ count }] = await sql`
  SELECT (
    (SELECT COUNT(*) FROM posts WHERE user_id IS NULL) +
    (SELECT COUNT(*) FROM tags WHERE user_id IS NULL) +
    (SELECT COUNT(*) FROM collections WHERE user_id IS NULL) +
    (SELECT COUNT(*) FROM post_tags WHERE user_id IS NULL) +
    (SELECT COUNT(*) FROM post_collections WHERE user_id IS NULL)
  )::int AS count`;
if (count > 0 && !founderUserId) {
  throw new Error("FOUNDER_USER_ID is required while unowned rows exist");
}
if (founderUserId) {
  await sql`UPDATE posts SET user_id = ${founderUserId} WHERE user_id IS NULL`;
  await sql`UPDATE tags SET user_id = ${founderUserId} WHERE user_id IS NULL`;
  await sql`UPDATE collections SET user_id = ${founderUserId} WHERE user_id IS NULL`;
  await sql`UPDATE post_tags pt SET user_id = p.user_id FROM posts p WHERE pt.post_id = p.id AND pt.user_id IS NULL`;
  await sql`UPDATE post_collections pc SET user_id = p.user_id FROM posts p WHERE pc.post_id = p.id AND pc.user_id IS NULL`;
  // Join rows whose post no longer exists get the founder id directly, so
  // SET NOT NULL below cannot trip over orphans.
  await sql`UPDATE post_tags SET user_id = ${founderUserId} WHERE user_id IS NULL`;
  await sql`UPDATE post_collections SET user_id = ${founderUserId} WHERE user_id IS NULL`;
}

await sql`ALTER TABLE posts ALTER COLUMN user_id SET NOT NULL`;
await sql`ALTER TABLE tags ALTER COLUMN user_id SET NOT NULL`;
await sql`ALTER TABLE post_tags ALTER COLUMN user_id SET NOT NULL`;
await sql`ALTER TABLE collections ALTER COLUMN user_id SET NOT NULL`;
await sql`ALTER TABLE post_collections ALTER COLUMN user_id SET NOT NULL`;
await sql`ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_url_key`;
await sql`ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key`;
await sql`ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_name_key`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS posts_user_url_unique ON posts (user_id, url) WHERE url IS NOT NULL`;
await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS urn TEXT`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS posts_user_urn_unique ON posts (user_id, urn) WHERE urn IS NOT NULL AND url IS NULL`;
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

console.log("Multi-account migration complete");
