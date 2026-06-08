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
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        Paste a post
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="add-text">Post text</label>
        <textarea
          id="add-text"
          autoFocus
          rows={5}
          placeholder="Paste the post text here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="add-row">
        <div className="field">
          <label htmlFor="add-author">Author</label>
          <input
            id="add-author"
            placeholder="Optional"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="add-url">LinkedIn URL</label>
          <input
            id="add-url"
            placeholder="Optional"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
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
