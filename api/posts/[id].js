import {
  ensureSchema,
  sql,
  getPost,
  setPostTags,
} from "../_lib/db.js";
import { requireUser } from "../_lib/auth.js";

export default async function handler(req, res) {
  const actor = await requireUser(req, res, { webOnly: true });
  if (!actor) return;
  const { userId } = actor;

  await ensureSchema();
  const id = Number(req.query.id);

  if (req.method === "GET") {
    const post = await getPost(userId, id);
    return post
      ? res.status(200).json(post)
      : res.status(404).json({ error: "not found" });
  }

  const post = await getPost(userId, id);
  if (!post) return res.status(404).json({ error: "not found" });

  if (req.method === "PATCH") {
    const { tags, suggested, status } = req.body || {};
    // Only the two known statuses may be written; anything else falls back
    // to the tag-derived value.
    let nextStatus = status === "review" || status === "filed" ? status : null;
    if (Array.isArray(tags)) {
      await setPostTags(userId, id, tags);
      if (nextStatus == null) nextStatus = tags.length > 0 ? "filed" : "review";
    }
    await sql`
      UPDATE posts SET
        suggested = COALESCE(${suggested ? JSON.stringify(suggested) : null}::jsonb, suggested),
        status = COALESCE(${nextStatus}, status)
      WHERE user_id = ${userId} AND id = ${id}`;
    return res.status(200).json(await getPost(userId, id));
  }

  if (req.method === "DELETE") {
    await sql`DELETE FROM posts WHERE user_id = ${userId} AND id = ${id}`;
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, PATCH, DELETE");
  res.status(405).json({ error: "method not allowed" });
}
