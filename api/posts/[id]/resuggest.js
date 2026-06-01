import { ensureSchema, sql, allTags, getPost } from "../../_lib/db.js";
import { suggestTags } from "../../_lib/tagger.js";
import { requireAuth } from "../../_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  await ensureSchema();
  const id = Number(req.query.id);

  const post = await getPost(id);
  if (!post) return res.status(404).json({ error: "not found" });

  const suggestions = JSON.stringify(suggestTags(post.text, await allTags()));
  await sql`UPDATE posts SET suggested = ${suggestions}::jsonb WHERE id = ${id}`;
  res.status(200).json(await getPost(id));
}
