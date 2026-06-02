import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const DOMAIN_RE = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi;
const SECTION_START_RE =
  /(?:^|\s)(\d{1,2})\.\s+([A-Z][^?!.]{8,140}\?)(?=\s+[A-Z0-9]|$)/g;

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
  let clean = String(text || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\bView image\b\s*/gi, "")
    .trim();

  clean = clean
    .replace(/\s+(?=\d{1,2}\.\s+[A-Z])/g, "\n\n")
    .replace(DOMAIN_RE, (match) => `\n\n${match}\n\n`)
    .replace(SECTION_START_RE, (_match, number, title) => `\n\n${number}. ${title}\n\n`)
    .replace(/\s+(?=(?:I am |I have |I’m |I'm |My |This |An agreement |For your |Over the ))/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lineCount = clean.split("\n").filter(Boolean).length;
  if (lineCount > 3 || clean.length < 700) return clean;

  return clean
    .replace(/\s+(https?:\/\/\S+)/g, "\n\n$1")
    .replace(/\s+(?=(?:Table of Contents|WHEREAS|NOW, THEREFORE)\b)/g, "\n\n")
    .replace(/\s+(?=\d{1,2}\s+[A-Z][A-Za-z][^.\n]{8,80}(?:\s+\d{1,2}\b|$))/g, "\n\n");
}

function classifyBlock(block, index) {
  const text = block.trim();
  if (/^\d{1,2}\.\s+.{4,160}\??$/.test(text)) return "question";
  if (/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/i.test(text) && text.length < 80) {
    return "source";
  }
  if (index === 0 && text.length < 120 && !/[.!?]$/.test(text)) return "title";
  return "paragraph";
}

function textBlocks(text) {
  return readableText(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((text, index) => ({ text, kind: classifyBlock(text, index) }));
}

function previewTitle(blocks, media, post) {
  const firstContent = blocks.find((block) => block.kind !== "source")?.text;
  if (firstContent) return firstContent;
  const titledMedia = media.find((item) => item.title || item.alt);
  return titledMedia ? mediaLabel(titledMedia) : post.author || "Saved post";
}

function previewExcerpt(blocks, title) {
  return blocks
    .filter((block) => block.kind === "paragraph" || block.kind === "question")
    .map((block) => block.text)
    .filter((text) => text !== title)
    .join(" ")
    .slice(0, 190);
}

function primaryPreviewMedia(media) {
  return (
    media.find((item) => item.thumbnailUrl || item.url) ||
    media.find((item) => item.title || item.description) ||
    null
  );
}

export function PostCard({ post, onUpdated, onDeleted, onTagClick, activeTags = [] }) {
  const [readerOpen, setReaderOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const displayText = useMemo(() => readableText(post.text), [post.text]);
  const displayBlocks = useMemo(() => textBlocks(displayText), [displayText]);
  const readerBlocks = useMemo(() => textBlocks(post.text), [post.text]);
  const media = Array.isArray(post.media) ? post.media : [];
  const bits = metadataBits(post);
  const links = metadataLinks(post);
  const readableMedia = media.filter((item) => item.thumbnailUrl || item.url);
  const primaryMedia = primaryPreviewMedia(media);
  const primaryThumb =
    primaryMedia?.thumbnailUrl ||
    (primaryMedia?.type === "image" ? primaryMedia?.url : "");
  const title = previewTitle(displayBlocks, media, post);
  const excerpt = previewExcerpt(displayBlocks, title) || displayText;
  const source = hostFromUrl(post.url) || hostFromUrl(links[0]?.url) || "LinkedIn";
  const savedDate = new Date(post.savedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

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
      <div className="card-preview">
        {primaryThumb ? (
          <img
            src={primaryThumb}
            alt={primaryMedia?.alt || mediaLabel(primaryMedia)}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="card-preview-empty">{post.author?.slice(0, 1) || "L"}</div>
        )}

        <div className="card-preview-fade" />
        <div className="card-select" aria-hidden="true" />
        <div className="card-actions">
          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noreferrer"
              className="preview-btn"
              title="Open original"
            >
              ↗
            </a>
          )}
          <button
            className="preview-btn"
            title="Read full capture"
            onClick={() => setReaderOpen(true)}
          >
            ◉
          </button>
          <button
            className="preview-btn preview-btn--text"
            title="Read full capture"
            onClick={() => setReaderOpen(true)}
          >
            Edit
          </button>
          <button
            className="preview-btn"
            title="Delete"
            onClick={() => api.deletePost(post.id).then(() => onDeleted(post.id))}
          >
            ⌫
          </button>
        </div>
      </div>

      <div className="card-content">
        <h3 className="preview-title">{title}</h3>
        <p className="preview-excerpt">{excerpt}</p>

        <div className="preview-meta">
          <span className="preview-type" aria-hidden="true">▣</span>
          <span>{post.author || "Unknown"}</span>
          <span>•</span>
          <span>{source}</span>
          <span>•</span>
          <span>{savedDate}</span>
        </div>

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
                    <p
                      key={`${block.text.slice(0, 32)}-${index}`}
                      className={`text-block text-block--${block.kind}`}
                    >
                      {block.text}
                    </p>
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
