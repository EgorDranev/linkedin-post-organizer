import { login } from "./_lib/auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  const { password } = req.body || {};
  const result = login(password);
  if (!result.ok) return res.status(401).json({ error: "wrong password" });
  if (result.cookie) res.setHeader("Set-Cookie", result.cookie);
  res.status(200).json({ ok: true, gate: result.gate ?? false });
}
