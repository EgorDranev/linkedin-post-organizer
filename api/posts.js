import { ensureSchema, sql, allTags, hydrate, getPost } from "./_lib/db.js";
import { suggestTags } from "./_lib/tagger.js";
import { requireAuth } from "./_lib/auth.js";

function cleanJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanMedia(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 12)
    .map((item) => ({
      type: typeof item.type === "string" ? item.type.slice(0, 32) : "unknown",
      url: typeof item.url === "string" ? item.url.slice(0, 2048) : "",
      thumbnailUrl:
        typeof item.thumbnailUrl === "string" ? item.thumbnailUrl.slice(0, 2048) : null,
      title: typeof item.title === "string" ? item.title.slice(0, 500) : null,
      description:
        typeof item.description === "string" ? item.description.slice(0, 1000) : null,
      provider: typeof item.provider === "string" ? item.provider.slice(0, 120) : null,
      alt: typeof item.alt === "string" ? item.alt.slice(0, 500) : null,
    }))
    .filter((item) => item.url || item.thumbnailUrl || item.title);
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  await ensureSchema();

  if (req.method === "GET") {
    const rows = await sql`SELECT * FROM posts ORDER BY saved_at DESC, id DESC`;
    const posts = await Promise.all(rows.map(hydrate));
    return res.status(200).json(posts);
  }

  if (req.method === "POST") {
    const { url, author, authorHeadline, text } = req.body || {};
    const metadata = cleanJsonObject(req.body?.metadata);
    const media = cleanMedia(req.body?.media);
    const hasMetadata = Object.keys(metadata).length > 0;
    const hasMedia = media.length > 0;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    const tags = await allTags();
    const suggestions = JSON.stringify(suggestTags(text, tags));

    const existing = url
      ? await sql`SELECT id FROM posts WHERE url = ${url}`
      : [];

    let id;
    if (existing.length) {
      id = existing[0].id;
      await sql`
        UPDATE posts SET author = ${author ?? null},
          author_headline = ${authorHeadline ?? null},
          text = ${text}, suggested = ${suggestions}::jsonb,
          metadata = CASE
            WHEN ${hasMetadata} THEN ${JSON.stringify(metadata)}::jsonb
            ELSE metadata
          END,
          media = CASE
            WHEN ${hasMedia} THEN ${JSON.stringify(media)}::jsonb
            ELSE media
          END
        WHERE id = ${id}`;
    } else {
      const rows = await sql`
        INSERT INTO posts (
          url, author, author_headline, text, status, suggested, metadata, media
        )
        VALUES (${url ?? null}, ${author ?? null}, ${authorHeadline ?? null},
                ${text}, 'review', ${suggestions}::jsonb,
                ${JSON.stringify(metadata)}::jsonb, ${JSON.stringify(media)}::jsonb)
        RETURNING id`;
      id = rows[0].id;
    }

    const post = await getPost(id);
    return res.status(existing.length ? 200 : 201).json({
      ...post,
      duplicate: existing.length > 0,
    });
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "method not allowed" });
}
