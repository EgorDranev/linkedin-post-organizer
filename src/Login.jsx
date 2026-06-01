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
        <h1>LinkedIn Saver</h1>
        <p className="muted">Enter the password to continue.</p>
        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <p className="error">{err}</p>}
        <button type="submit" className="primary" disabled={busy || !password}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
