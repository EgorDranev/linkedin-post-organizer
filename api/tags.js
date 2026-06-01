import { ensureSchema, allTags } from "./_lib/db.js";

export default async function handler(_req, res) {
  await ensureSchema();
  res.status(200).json(await allTags());
}
