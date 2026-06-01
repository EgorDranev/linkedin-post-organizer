import { useState } from "react";
import { api } from "./api.js";

const PREVIEW_LEN = 320;

export function PostCard({ post, onUpdated, onDeleted, onTagClick, activeTags = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");

  const long = post.text.length > PREVIEW_LEN;
  const shown = expanded || !long ? post.text : post.text.slice(0, PREVIEW_LEN) + "…";

  // suggested tags not already accepted
  const pending = post.suggested.filter((s) => !post.tags.includes(s.tag));

  const persist = (tags, suggested) =>
    api.updatePost(post.id, { tags, suggested }).then(onUpdated);

  const acceptTag = (tag) => {
    const tags = [...new Set([...post.tags, tag])];
    const suggested = post.suggested.filter((s) => s.tag !== tag);
    persist(tags, suggested);
  };

  const dismissSuggestion = (tag) => {
    const suggested = post.suggested.filter((s) => s.tag !== tag);
    persist(post.tags, suggested);
  };

  const removeTag = (tag) => persist(post.tags.filter((t) => t !== tag));

  const addCustom = (e) => {
    e.preventDefault();
    const tag = draft.trim().toLowerCase();
    if (!tag) return;
    setDraft("");
    acceptTag(tag);
  };

  return (
    <article className="card">
      <div className="card-head">
        <div className="meta">
          <strong>{post.author || "Unknown author"}</strong>
          <span className="muted dot">·</span>
          <span className="muted">{new Date(post.savedAt).toLocaleDateString()}</span>
        </div>
        <div className="card-tools">
          {post.url && (
            <a href={post.url} target="_blank" rel="noreferrer" className="link">
              open ↗
            </a>
          )}
          <button
            className="icon-btn"
            title="Delete"
            onClick={() => api.deletePost(post.id).then(() => onDeleted(post.id))}
          >
            ✕
          </button>
        </div>
      </div>

      <p className="body">{shown}</p>
      {long && (
        <button className="link more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "show less" : "show more"}
        </button>
      )}

      <div className="tags">
        {post.tags.map((t) => (
          <span
            key={t}
            className={`chip accepted${activeTags.includes(t) ? " filtering" : ""}`}
          >
            <button
              className="chip-label"
              onClick={() => onTagClick?.(t)}
              title="Filter by this tag"
            >
              {t}
            </button>
            <button className="chip-x" onClick={() => removeTag(t)} title="Remove">
              ×
            </button>
          </span>
        ))}

        {pending.map((s) => (
          <span key={s.tag} className="chip suggested" title="Suggested">
            <button className="chip-add" onClick={() => acceptTag(s.tag)}>
              + {s.tag}
            </button>
            <button
              className="chip-x"
              onClick={() => dismissSuggestion(s.tag)}
              title="Dismiss suggestion"
            >
              ×
            </button>
          </span>
        ))}

        <form className="chip-form" onSubmit={addCustom}>
          <input
            placeholder="add tag…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </form>
      </div>
    </article>
  );
}
