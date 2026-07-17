import { requireUser } from "../../_lib/auth.js";
import { approvePairing } from "../../_lib/db.js";

// A signed-in web user approves the pairing, binding it to their account.
export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "method not allowed" });
  }

  const actor = await requireUser(req, res, { webOnly: true });
  if (!actor) return;

  const approved = await approvePairing(req.query.id, actor.userId);
  if (!approved) return res.status(404).json({ error: "pairing not found or expired" });
  return res.status(204).end();
}
