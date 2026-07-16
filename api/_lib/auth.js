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
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
}

export async function authenticateRequest(req) {
  const token = bearer(req);
  if (!token) throw new HttpAuthError("unauthorized");

  if (token.startsWith("lis_ext_")) {
    const record = await findExtensionToken(hashSecret(token));
    if (!record) throw new HttpAuthError("extension token is invalid or revoked");
    return { userId: record.userId, kind: "extension", tokenId: record.id };
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      authorizedParties: [process.env.APP_ORIGIN].filter(Boolean),
    });
    if (!payload.sub) throw new Error("missing subject");
    return { userId: payload.sub, kind: "web" };
  } catch {
    throw new HttpAuthError("unauthorized");
  }
}

export async function requireUser(req, res, { webOnly = false } = {}) {
  try {
    const actor = await authenticateRequest(req);
    if (webOnly && actor.kind !== "web") throw new HttpAuthError("web session required", 403);
    return actor;
  } catch (error) {
    res.status(error.statusCode || 401).json({ error: error.message || "unauthorized" });
    return null;
  }
}
