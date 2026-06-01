import { logoutCookie } from "./_lib/auth.js";

export default function handler(_req, res) {
  res.setHeader("Set-Cookie", logoutCookie());
  res.status(200).json({ ok: true });
}
