import { createClerkClient } from "@clerk/backend";
import { requireUser } from "./_lib/auth.js";
import { deleteUserData } from "./_lib/db.js";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "method not allowed" });
  }
  const actor = await requireUser(req, res, { webOnly: true });
  if (!actor) return;
  await deleteUserData(actor.userId);
  await clerk.users.deleteUser(actor.userId);
  return res.status(204).end();
}
