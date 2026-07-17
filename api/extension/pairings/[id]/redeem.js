import crypto from "node:crypto";
import { hashSecret } from "../../../_lib/auth.js";
import { redeemPairing } from "../../../_lib/db.js";

// The extension exchanges its original verifier for the capture token exactly
// once. Only the token's hash is stored; the raw value never comes back again.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const verifier = req.body?.verifier;
  if (typeof verifier !== "string" || verifier.length < 32 || verifier.length > 256) {
    return res.status(400).json({ error: "verifier must be a string of 32-256 characters" });
  }

  const tokenId = crypto.randomUUID();
  const rawToken = `lis_ext_${crypto.randomBytes(32).toString("base64url")}`;
  const result = await redeemPairing(
    req.query.id,
    hashSecret(verifier),
    rawToken,
    hashSecret(rawToken),
    tokenId
  );

  if (result?.token) return res.status(200).json({ token: result.token, tokenId: result.tokenId });
  if (result?.status === "pending") return res.status(202).json({ status: "pending" });
  if (result?.status === "consumed") return res.status(409).json({ error: "pairing already redeemed" });
  if (result?.status === "expired") return res.status(410).json({ error: "pairing expired" });
  return res.status(404).json({ error: "pairing not found" });
}
