import {
  ensureSchema,
  sql,
  getPost,
  setPostTags,
} from "../_lib/db.js";

export default async function handler(req, res) {
  await ensureSchema();
  const id = Number(req.query.id);

  if (req.method === "GET") {
    const post = await getPost(id);
    return post
      ? res.status(200).json(post)
      : res.status(404).json({ error: "not found" });
  }

  if (req.method === "PATCH") {
    const post = await getPost(id);
    if (!post) return res.status(404).json({ error: "not found" });

    const { tags, suggested } = req.body || {};

    if (Array.isArray(tags)) {
      await setPostTags(id, tags);
      const status = tags.length > 0 ? "filed" : "review";
      await sql`UPDATE posts SET status = ${status} WHERE id = ${id}`;
    }
    if (Array.isArray(suggested)) {
      await sql`UPDATE posts SET suggested = ${JSON.stringify(
        suggested
      )}::jsonb WHERE id = ${id}`;
    }

    return res.status(200).json(await getPost(id));
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM posts WHERE id = ${id}`;
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, PATCH, DELETE");
  res.status(405).json({ error: "method not allowed" });
}
