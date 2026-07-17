import { requireUser } from "../_lib/auth.js";
import { listExtensionTokens } from "../_lib/db.js";

// Lists the caller's active extension connections. Metadata only — token
// hashes never leave the database.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }

  const actor = await requireUser(req, res, { webOnly: true });
  if (!actor) return;

  return res.status(200).json(await listExtensionTokens(actor.userId));
}
