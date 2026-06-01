import { ensureSchema, allTags } from "./_lib/db.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  await ensureSchema();
  res.status(200).json(await allTags());
}
