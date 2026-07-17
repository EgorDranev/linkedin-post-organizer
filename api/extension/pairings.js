import crypto from "node:crypto";
import { hashSecret } from "../_lib/auth.js";
import { createPairing } from "../_lib/db.js";

const PAIRING_TTL_MS = 10 * 60 * 1000;

// Starts a pairing. No login required: the extension calls this anonymously and
// only ever learns a token if a signed-in web user approves the same pairing id.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const verifier = req.body?.verifier;
  if (typeof verifier !== "string" || verifier.length < 32 || verifier.length > 256) {
    return res.status(400).json({ error: "verifier must be a string of 32-256 characters" });
  }

  const pairing = await createPairing(
    crypto.randomUUID(),
    hashSecret(verifier),
    new Date(Date.now() + PAIRING_TTL_MS).toISOString()
  );
  return res.status(201).json(pairing);
}
