import { useState } from "react";
import { api } from "./api.js";

const PREVIEW_LEN = 320;

function hostFromUrl(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function mediaLabel(item) {
  if (item.title) return item.title;
  if (item.type === "image") return item.alt || "Image";
  if (item.type === "video") return "Video";
  return hostFromUrl(item.url) || "Media";
}

function metadataBits(post) {
  const meta = post.metadata || {};
  return [
    meta.publishedText,
    meta.authorProfileUrl ? hostFromUrl(meta.authorProfileUrl) : "",
    meta.socialCounts?.reactions ? `${meta.socialCounts.reactions} reactions` : "",
    meta.socialCounts?.comments ? `${meta.socialCounts.comments} comments` : "",
  ].filter(Boolean);
}

export function PostCard({ post, onUpdated, onDeleted, onTagClick, activeTags = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");

  const long = post.text.length > PREVIEW_LEN;
  const shown = expanded || !long ? post.text : post.text.slice(0, PREVIEW_LEN) + "…";
  const media = Array.isArray(post.media) ? post.media : [];
  const bits = metadataBits(post);

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

      {media.length > 0 && (
        <div className="media-strip">
          {media.slice(0, 4).map((item, index) => {
            const href = item.url || item.thumbnailUrl;
            const thumb = item.thumbnailUrl || (item.type === "image" ? item.url : "");
            const label = mediaLabel(item);
            return (
              <a
                key={`${href || label}-${index}`}
                className={`media-item media-item--${item.type || "unknown"}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                title={label}
              >
                {thumb && (
                  <img
                    src={thumb}
                    alt={item.alt || label}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span>{label}</span>
              </a>
            );
          })}
        </div>
      )}

      {bits.length > 0 && (
        <div className="capture-meta">
          {bits.map((bit) => (
            <span key={bit}>{bit}</span>
          ))}
        </div>
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
