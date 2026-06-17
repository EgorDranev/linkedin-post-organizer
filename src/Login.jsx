import { useState } from "react";
import { api } from "./api.js";

export function Login({ onAuthed }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.login(password);
      if (!r.ok) {
        setErr("Wrong password");
        return;
      }
      onAuthed();
    } catch {
      setErr("Couldn’t reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="login-brand" aria-hidden="true">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <h1>LinkedIn Saver</h1>
        <p>Enter the password to continue.</p>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoFocus
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {err && <p className="error">{err}</p>}
        <button type="submit" className="primary" disabled={busy || !password}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
