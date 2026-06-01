import { ensureSchema, sql, allTags, hydrate, getPost } from "./_lib/db.js";
import { suggestTags } from "./_lib/tagger.js";
import { requireAuth } from "./_lib/auth.js";

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
          text = ${text}, suggested = ${suggestions}::jsonb
        WHERE id = ${id}`;
    } else {
      const rows = await sql`
        INSERT INTO posts (url, author, author_headline, text, status, suggested)
        VALUES (${url ?? null}, ${author ?? null}, ${authorHeadline ?? null},
                ${text}, 'review', ${suggestions}::jsonb)
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
