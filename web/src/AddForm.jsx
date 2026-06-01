import { useState } from "react";
import { api } from "./api.js";

export function AddForm({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const post = await api.savePost({
        text: text.trim(),
        author: author.trim() || null,
        url: url.trim() || null,
      });
      onSaved(post);
      setText("");
      setAuthor("");
      setUrl("");
      setOpen(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="add-toggle" onClick={() => setOpen(true)}>
        + Paste a post
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <textarea
        autoFocus
        rows={5}
        placeholder="Paste the post text here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="add-row">
        <input
          placeholder="Author (optional)"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
        />
        <input
          placeholder="LinkedIn URL (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      {err && <p className="error">{err}</p>}
      <div className="add-actions">
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy || !text.trim()}>
          {busy ? "Saving…" : "Save & suggest tags"}
        </button>
      </div>
    </form>
  );
}
