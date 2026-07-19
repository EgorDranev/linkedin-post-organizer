import crypto from "node:crypto";
import { verifyToken } from "@clerk/backend";
import { findExtensionToken } from "./db.js";

class HttpAuthError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function hashSecret(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function bearer(req) {
  // RFC 7235: the auth scheme is case-insensitive.
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  return raw.slice(0, 7).toLowerCase() === "bearer " ? raw.slice(7).trim() : "";
}

export async function authenticateRequest(req) {
  const token = bearer(req);
  if (!token) throw new HttpAuthError("unauthorized");

  if (token.startsWith("lis_ext_")) {
    const record = await findExtensionToken(hashSecret(token));
    if (!record) throw new HttpAuthError("extension token is invalid or revoked");
    return { userId: record.userId, kind: "extension", tokenId: record.id };
  }

  // Fail closed: without APP_ORIGIN the azp check would be silently skipped.
  if (!process.env.APP_ORIGIN) throw new Error("APP_ORIGIN is not configured");

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      authorizedParties: authorizedParties(),
    });
    if (!payload.sub) throw new Error("missing subject");
    return { userId: payload.sub, kind: "web" };
  } catch (error) {
    // The reason never reaches the client (bare 401 there), but without a log
    // an azp/secret misconfiguration is indistinguishable from a bad token.
    // Clerk's message names the offending azp; it contains no token material.
    console.warn("clerk token verification failed:", error?.message || error);
    throw new HttpAuthError("unauthorized");
  }
}

// The canonical origin plus the origins Vercel serves this same deployment
// from (deployment URL, branch alias, production domain). A session minted on
// any of them is first-party; anything else still fails the azp check.
function authorizedParties() {
  const parties = new Set([process.env.APP_ORIGIN]);
  for (const host of [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    if (host) parties.add(`https://${host}`);
  }
  return [...parties];
}

export async function requireUser(req, res, { webOnly = false } = {}) {
  try {
    const actor = await authenticateRequest(req);
    if (webOnly && actor.kind !== "web") throw new HttpAuthError("web session required", 403);
    return actor;
  } catch (error) {
    // Only deliberate auth failures surface their message; anything else
    // (e.g. a DB outage in the token lookup) must not leak internals or
    // masquerade as a revoked credential.
    const isAuthError = error instanceof HttpAuthError;
    res
      .status(isAuthError ? error.statusCode : 500)
      .json({ error: isAuthError ? error.message : "internal error" });
    return null;
  }
}
