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

// "linkedin.com/in/neha-malhotra-7b3a91" -> "Neha Malhotra"
function nameFromProfileUrl(url) {
  if (!url || typeof url !== "string") return "";
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match) return "";
  const words = decodeURIComponent(match[1])
    .split("-")
    .filter((part) => part && !/\d/.test(part)) // drop trailing hash/id segments
    .slice(0, 4);
  if (!words.length) return "";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Conservative author lift from a captured title/text, mirroring the
// extension's structured patterns ("…Questions and Answers Neha Malhotra").
const AUTHOR_TITLE_RE =
  /\b(?:Questions\s+and\s+Answers|Interview\s+Questions|Answers)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/;

function authorFromTitlePattern(value) {
  const text = String(value || "")
    .replace(/\bView image\b/gi, " ")
    .replace(DOMAIN_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.match(AUTHOR_TITLE_RE)?.[1] || "";
}

// The card may show posts saved before the extension inferred authors, so the
// stored author can be null. Recover it from data already on the post.
function deriveAuthor(post) {
  if (post.author && post.author.trim()) return post.author.trim();

  const fromProfile = nameFromProfileUrl(post.metadata?.authorProfileUrl);
  if (fromProfile) return fromProfile;

  const media = Array.isArray(post.media) ? post.media : [];
  const candidates = [
    ...media.flatMap((item) => [item.title, item.alt, item.description]),
    post.text,
  ];
  for (const candidate of candidates) {
    const found = authorFromTitlePattern(candidate);
    if (found) return found;
  }
  return "";
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

// Inline icon set (no icon-library dependency). Shared stroke/weight keeps the
// glyphs visually consistent — sized 16px in action buttons, 14px in stats.
const ICON_BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

const ExternalIcon = (props) => (
  <svg width="16" height="16" {...ICON_BASE} {...props}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

const ExpandIcon = (props) => (
  <svg width="16" height="16" {...ICON_BASE} {...props}>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="m21 3-7 7" />
    <path d="m3 21 7-7" />
  </svg>
);

const TrashIcon = (props) => (
  <svg width="16" height="16" {...ICON_BASE} {...props}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

const UserIcon = (props) => (
  <svg width="16" height="16" {...ICON_BASE} {...props}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const HeartIcon = (props) => (
  <svg width="16" height="16" {...ICON_BASE} {...props}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
  </svg>
);

const CommentIcon = (props) => (
  <svg width="16" height="16" {...ICON_BASE} {...props}>
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);

const RepostIcon = (props) => (
  <svg width="16" height="16" {...ICON_BASE} {...props}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);

const ClockIcon = (props) => (
  <svg width="16" height="16" {...ICON_BASE} {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

export function PostCard({ post, onUpdated, onDeleted, onTagClick, activeTags = [] }) {
  const [readerOpen, setReaderOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const displayText = useMemo(() => readableText(post.text), [post.text]);
  const displayBlocks = useMemo(() => textBlocks(displayText), [displayText]);
  const readerBlocks = useMemo(() => textBlocks(post.text), [post.text]);
  const media = Array.isArray(post.media) ? post.media : [];
  const links = metadataLinks(post);
  const readableMedia = media.filter((item) => item.thumbnailUrl || item.url);
  const primaryMedia = primaryPreviewMedia(media);
  const primaryThumb =
    primaryMedia?.thumbnailUrl ||
    (primaryMedia?.type === "image" ? primaryMedia?.url : "");
  const hasMedia = Boolean(primaryThumb);
  const author = deriveAuthor(post);
  const title = previewTitle(displayBlocks, media, post);
  const excerpt = previewExcerpt(displayBlocks, title) || displayText;
  const source = hostFromUrl(post.url) || hostFromUrl(links[0]?.url) || "LinkedIn";
  const monogram = (author || source || "L").trim().charAt(0).toUpperCase();
  const savedDate = new Date(post.savedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  // Engagement + provenance surfaced as compact stats (full detail lives in
  // the reader). Counts are only shown when present.
  const social = post.metadata?.socialCounts || {};
  const reactions = social.reactions;
  const comments = social.comments;
  const reposts = social.reposts;
  const publishedText = post.metadata?.publishedText || "";

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

  // Same three actions on every card; placement differs (overlaid on the media
  // hero vs inline in the header of a text-only card).
  const renderActions = (variant) => (
    <div className={`card-actions card-actions--${variant}`}>
      {post.url && (
        <a
          href={post.url}
          target="_blank"
          rel="noreferrer"
          className="card-btn"
          title="Open original"
          aria-label="Open original post"
        >
          <ExternalIcon />
        </a>
      )}
      <button
        className="card-btn"
        title="Read full capture"
        aria-label="Read full capture"
        onClick={() => setReaderOpen(true)}
      >
        <ExpandIcon />
      </button>
      <button
        className="card-btn card-btn--danger"
        title="Delete saved post"
        aria-label="Delete saved post"
        onClick={() => api.deletePost(post.id).then(() => onDeleted(post.id))}
      >
        <TrashIcon />
      </button>
    </div>
  );

  return (
    <article className={`card ${hasMedia ? "has-media" : "is-text"}`}>
      {hasMedia && (
        <div className="card-preview">
          <img
            src={primaryThumb}
            alt={primaryMedia?.alt || mediaLabel(primaryMedia)}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <div className="card-preview-fade" />
          {renderActions("overlay")}
        </div>
      )}

      <div className="card-content">
        <div className="card-head">
          {!hasMedia && (
            <span className="card-monogram" aria-hidden="true">
              {monogram}
            </span>
          )}
          <span className="card-source">
            <span className="card-source-name">{source}</span>
            <span className="meta-sep" aria-hidden="true">·</span>
            <span>{savedDate}</span>
          </span>
          {!hasMedia && renderActions("inline")}
        </div>

        <h3 className="card-title">{title}</h3>
        {excerpt && <p className="card-excerpt">{excerpt}</p>}

        <div className="card-stats">
          <span className="card-stat card-author" title={author || "Unknown author"}>
            <UserIcon width={14} height={14} />
            {author || "Unknown"}
          </span>
          {reactions ? (
            <span className="card-stat" title={`${reactions} reactions`}>
              <HeartIcon width={14} height={14} />
              {reactions}
            </span>
          ) : null}
          {comments ? (
            <span className="card-stat" title={`${comments} comments`}>
              <CommentIcon width={14} height={14} />
              {comments}
            </span>
          ) : null}
          {reposts ? (
            <span className="card-stat" title={`${reposts} reposts`}>
              <RepostIcon width={14} height={14} />
              {reposts}
            </span>
          ) : null}
          {publishedText ? (
            <span className="card-stat" title={`Published ${publishedText}`}>
              <ClockIcon width={14} height={14} />
              {publishedText}
            </span>
          ) : null}
        </div>

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
                <strong>{author || "Unknown author"}</strong>
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
                
                {/* Display expanded metadata */}
                <div className="reader-meta">
                  {post.metadata?.publishedDate && (
                    <div className="meta-item">
                      <strong>Published:</strong> {new Date(post.metadata.publishedDate).toLocaleString()}
                    </div>
                  )}
                  
                  {post.metadata?.companyInfo && (
                    <div className="meta-item">
                      <strong>Company:</strong> {post.metadata.companyInfo}
                    </div>
                  )}
                  
                  {post.metadata?.postType && (
                    <div className="meta-item">
                      <strong>Type:</strong> {post.metadata.postType}
                    </div>
                  )}
                  
                  {post.metadata?.hashtags && post.metadata.hashtags.length > 0 && (
                    <div className="meta-item">
                      <strong>Hashtags:</strong> {post.metadata.hashtags.join(', ')}
                    </div>
                  )}
                  
                  {post.metadata?.mentions && post.metadata.mentions.length > 0 && (
                    <div className="meta-item">
                      <strong>Mentions:</strong> {post.metadata.mentions.join(', ')}
                    </div>
                  )}
                  
                  {post.metadata?.socialCounts && (
                    <div className="meta-item">
                      <strong>Engagement:</strong>
                      {post.metadata.socialCounts.reactions && ` ${post.metadata.socialCounts.reactions} likes`}
                      {post.metadata.socialCounts.comments && ` ${post.metadata.socialCounts.comments} comments`}
                      {post.metadata.socialCounts.reposts && ` ${post.metadata.socialCounts.reposts} reposts`}
                    </div>
                  )}
                </div>
                
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
