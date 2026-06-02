import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const PREVIEW_LEN = 520;

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

function metadataLinks(post) {
  const links = post.metadata?.links;
  return Array.isArray(links)
    ? links.filter((item) => item?.url).slice(0, 4)
    : [];
}

function readableText(text) {
  const clean = String(text || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  const lineCount = clean.split("\n").filter(Boolean).length;
  if (lineCount > 3 || clean.length < 700) return clean;

  return clean
    .replace(/\s+(https?:\/\/\S+)/g, "\n\n$1")
    .replace(/\s+(?=(?:Table of Contents|WHEREAS|NOW, THEREFORE)\b)/g, "\n\n")
    .replace(/\s+(?=\d{1,2}\s+[A-Z][A-Za-z][^.\n]{8,80}(?:\s+\d{1,2}\b|$))/g, "\n\n");
}

function textBlocks(text) {
  return readableText(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function PostCard({ post, onUpdated, onDeleted, onTagClick, activeTags = [] }) {
  const [readerOpen, setReaderOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const displayText = useMemo(() => readableText(post.text), [post.text]);
  const long = displayText.length > PREVIEW_LEN;
  const shown = long ? displayText.slice(0, PREVIEW_LEN) + "..." : displayText;
  const previewBlocks = useMemo(() => textBlocks(shown).slice(0, 2), [shown]);
  const readerBlocks = useMemo(() => textBlocks(post.text), [post.text]);
  const media = Array.isArray(post.media) ? post.media : [];
  const bits = metadataBits(post);
  const links = metadataLinks(post);
  const readableMedia = media.filter((item) => item.thumbnailUrl || item.url);

  useEffect(() => {
    if (!readerOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setReaderOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [readerOpen]);

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

      <div className="body">
        {previewBlocks.map((block, index) => (
          <p key={`${block.slice(0, 24)}-${index}`}>{block}</p>
        ))}
      </div>
      {(long || readableMedia.length > 0) && (
        <button className="reader-trigger" onClick={() => setReaderOpen(true)}>
          {long ? "Read full capture" : "View media"}
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

      {links.length > 0 && (
        <div className="link-strip">
          {links.map((item, index) => {
            const label = item.text || hostFromUrl(item.url) || "Link";
            return (
              <a
                key={`${item.url}-${index}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                title={item.url}
              >
                {label}
              </a>
            );
          })}
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

      {readerOpen && (
        <div
          className="reader-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Captured post reader"
          onMouseDown={() => setReaderOpen(false)}
        >
          <div className="reader-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="reader-head">
              <div>
                <strong>{post.author || "Unknown author"}</strong>
                {post.authorHeadline && <span>{post.authorHeadline}</span>}
              </div>
              <button
                className="icon-btn reader-close"
                title="Close"
                onClick={() => setReaderOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="reader-grid">
              <section className="reader-panel">
                <h2>Captured text</h2>
                <div className="reader-text">
                  {readerBlocks.map((block, index) => (
                    <p key={`${block.slice(0, 32)}-${index}`}>{block}</p>
                  ))}
                </div>
              </section>

              {readableMedia.length > 0 && (
                <section className="reader-panel reader-panel--media">
                  <h2>Captured images</h2>
                  <div className="reader-media">
                    {readableMedia.map((item, index) => {
                      const href = item.url || item.thumbnailUrl;
                      const thumb =
                        item.thumbnailUrl || (item.type === "image" ? item.url : "");
                      const label = mediaLabel(item);
                      return (
                        <a
                          key={`${href || label}-${index}`}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          title={label}
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={item.alt || label}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span>{label}</span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
