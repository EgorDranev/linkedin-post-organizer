import { createClerkClient } from "@clerk/backend";
import { requireUser } from "./_lib/auth.js";
import { deleteUserData, ensureSchema, hasDatabase } from "./_lib/db.js";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "method not allowed" });
  }
  const actor = await requireUser(req, res, { webOnly: true });
  if (!actor) return;

  if (!hasDatabase) {
    return res.status(503).json({ error: "database is not configured" });
  }
  await ensureSchema();

  // Data first, identity second. Every step is idempotent, so the honest
  // recovery from any partial failure is simply "delete again" — the error
  // messages below must never claim nothing happened when data is gone.
  try {
    await deleteUserData(actor.userId);
  } catch {
    return res.status(500).json({
      error: "We couldn't delete your library. Nothing was fully removed — it's safe to try again.",
    });
  }

  try {
    await clerk.users.deleteUser(actor.userId);
  } catch (err) {
    // Already deleted (e.g. a double-submit or a retry) counts as success.
    if (err?.status !== 404) {
      return res.status(502).json({
        error:
          "Your library data was deleted, but removing your sign-in identity failed. Click delete again to finish.",
      });
    }
  }
  return res.status(204).end();
}
