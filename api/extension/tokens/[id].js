import { requireUser } from "../../_lib/auth.js";
import { revokeExtensionToken } from "../../_lib/db.js";

// Revokes one of the caller's extension tokens; capture with it fails from the
// next request onward.
export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "method not allowed" });
  }

  const actor = await requireUser(req, res, { webOnly: true });
  if (!actor) return;

  const revoked = await revokeExtensionToken(actor.userId, req.query.id);
  if (!revoked) return res.status(404).json({ error: "token not found" });
  return res.status(204).end();
}
