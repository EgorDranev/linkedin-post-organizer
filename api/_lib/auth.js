import crypto from "node:crypto";

// Shared-password gate. Active only when APP_PASSWORD is set, so the app
// stays open locally / before the env var is configured (no lockout).
const PASSWORD = process.env.APP_PASSWORD || "";

export const COOKIE = "lis_auth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Derive an opaque cookie/header token from a password — we never store the
// raw password in the cookie.
function token(pw) {
  return crypto.createHash("sha256").update(`lis:${pw}`).digest("hex");
}

const EXPECTED = PASSWORD ? token(PASSWORD) : null;

export const gateEnabled = () => !!PASSWORD;

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function isAuthed(req) {
  if (!PASSWORD) return true; // gate disabled

  // Extension sends the password as a header.
  const headerPw = req.headers["x-app-password"];
  if (headerPw && safeEqual(token(String(headerPw)), EXPECTED)) return true;

  // Web app sends the session cookie.
  const cookie = parseCookies(req)[COOKIE];
  if (cookie && safeEqual(cookie, EXPECTED)) return true;

  return false;
}

// Returns true if the request may proceed; otherwise writes a 401 and returns false.
export function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}

// Verify a submitted password; on success returns a Set-Cookie value.
export function login(password) {
  if (!PASSWORD) return { ok: true, gate: false };
  if (!password || !safeEqual(token(String(password)), EXPECTED)) {
    return { ok: false };
  }
  const cookie = `${COOKIE}=${EXPECTED}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
  return { ok: true, gate: true, cookie };
}

export function logoutCookie() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
