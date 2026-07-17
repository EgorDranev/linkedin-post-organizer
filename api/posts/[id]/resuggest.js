import { ensureSchema, sql, allTags, getPost } from "../../_lib/db.js";
import { suggestTagsAI } from "../../_lib/ai.js";
import { requireUser } from "../../_lib/auth.js";

export default async function handler(req, res) {
  const actor = await requireUser(req, res);
  if (!actor) return;
  const { userId } = actor;

  await ensureSchema();
  const id = Number(req.query.id);

  const post = await getPost(userId, id);
  if (!post) return res.status(404).json({ error: "not found" });

  const suggestions = JSON.stringify(
    await suggestTagsAI(post.text, {
      existingTags: await allTags(userId),
      author: post.author,
    })
  );
  await sql`
    UPDATE posts SET suggested = ${suggestions}::jsonb
    WHERE user_id = ${userId} AND id = ${id}`;
  res.status(200).json(await getPost(userId, id));
}
