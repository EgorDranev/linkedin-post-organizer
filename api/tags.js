import { ensureSchema, allTags } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";

export default async function handler(req, res) {
  const actor = await requireUser(req, res, { webOnly: true });
  if (!actor) return;
  const { userId } = actor;

  await ensureSchema();
  res.status(200).json(await allTags(userId));
}
