import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api.js";

const DOMAIN_RE = /\b(?:[a-z0-9-]+\.)+(?!(?:md)\b)[a-z]{2,}(?:\/\S*)?/gi;
const SECTION_START_RE =
  /(?:^|\s)(\d{1,2})\.\s+([A-Z][^?!.]{8,140}\?)(?=\s+[A-Z0-9]|$)/g;

// LinkedIn sometimes leads the actor block with presence text instead of the
// name ("Status is reachable"); the real "Name • <degree> <role>" follows on the
// next line. Never a real author, never real body.
const PRESENCE_RE = /^(?:status is\s+)?(?:reachable|online|offline|away)$/i;

// A bookmarked article saved from the "Saved" list rather than a feed post. The
// title trails the marker; the body is usually empty.
const SAVED_LINK_RE = /^saved link\s*[•·]\s*/i;

// Degree-of-connection token ("1st", "2nd", "3rd") that prefixes the role in a
// "Name • <degree> <role>" line — dropped so the headline reads as the role.
const DEGREE_RE = /^(?:1st|2nd|3rd|\d+(?:st|nd|rd|th))\b[\s•·,–-]*/i;

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
  const stated = post.author && post.author.trim();
  if (stated && !PRESENCE_RE.test(stated)) return stated;

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

// LinkedIn "fancy" headers (𝗛𝗨𝗦𝗧𝗟𝗘) are captured glyph-by-glyph and arrive as
// single letters separated by spaces ("H U S T L E B A D G E R"). Collapse any
// run of 4+ standalone single letters back into a word. The trailing \b plus
// backtracking stops the run at the last single-letter token, so it never eats
// the first letter of a following real word ("…U I L D Build" → "UILD Build").
function collapseSpacedCaps(text) {
  return text.replace(/\b[A-Za-z0-9](?: [A-Za-z0-9]){3,}\b/g, (run) =>
    run.replace(/ /g, "")
  );
}

// Re-flow a run-on capture (no author paragraph breaks) into legible sections.
// Heuristic only — applied as a fallback when the post text arrives as one blob.
function reflowRunOn(text) {
  let clean = text
    .replace(/\s+(?=\d{1,2}\.\s+[A-Z])/g, "\n\n")
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

function readableText(text) {
  const clean = collapseSpacedCaps(
    String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\bView image\b\s*/gi, "")
      .replace(/^[ \t]*View Sponsored Content[ \t]*$/gim, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );

  // The author's own paragraph breaks (blank lines) are the truest structure —
  // when the capture preserved them, render them verbatim like LinkedIn does
  // instead of re-flowing the text and risking mangled breaks.
  if (clean.includes("\n\n")) return clean;

  // Otherwise the capture is a single run-on block: fall back to heuristic
  // sectioning so long Q&A / numbered posts stay legible.
  return reflowRunOn(clean);
}

function classifyBlock(block, index) {
  const text = block.trim();
  if (/^\d{1,2}\.\s+.{4,160}\??$/.test(text)) return "question";
  if (/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?!(?:md)\b)[a-z]{2,}(?:\/\S*)?$/i.test(text)) {
    return "source";
  }
  if (index === 0 && text.length < 120 && !/[.!?]$/.test(text)) return "title";
  return "paragraph";
}

function textBlocks(text) {
  const clean = readableText(text);
  // Author paragraphs (blank lines) when the capture preserved them; otherwise
  // every line break becomes its own block, so single-newline captures get the
  // same airy paragraph spacing instead of stacking into one cramped wall.
  const parts = clean.includes("\n\n") ? clean.split(/\n{2,}/) : clean.split(/\n+/);
  return parts
    .map((block) => block.trim())
    .filter(Boolean)
    .map((value, index) => ({ text: value, kind: classifyBlock(value, index) }));
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

// Split a captured "Name • <degree> <role>" line into its parts. Used to recover
// the real identity when presence text displaced the name in innerText.
function splitNameRole(line) {
  const parts = String(line || "").split(/\s+[•·]\s+/);
  if (parts.length < 2) return { author: "", headline: "" };
  return {
    author: parts[0].trim(),
    headline: parts.slice(1).join(" • ").replace(DEGREE_RE, "").trim(),
  };
}

// Viewer chrome and engagement counters LinkedIn folds into a post's innerText —
// never part of the body. Engagement totals already live in the reader's meta
// block, so the body shouldn't repeat them.
function isNoiseLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^…?\s*(?:see|show)\s+more$/i.test(t)) return true;
  if (/^activate to view larger image$/i.test(t)) return true;
  if (/^play$/i.test(t)) return true;
  if (t.length > 80 || !/\d/.test(t)) return false;
  // Counter line ("1,234 reactions · 56 comments · 7 reposts", "👍 1.2K"): once
  // counts (incl. K/M) and engagement nouns are stripped, only separators or
  // reaction glyphs remain.
  const residue = t
    .replace(/[\d.,]+\s*[km]?\b/gi, "")
    .replace(/\b(?:reactions?|likes?|comments?|reposts?|shares?)\b/gi, "")
    .replace(/[^\p{L}]/gu, "");
  if (residue) return false;
  // Require a counter signal — an engagement noun, a bullet, or a reaction glyph
  // — so a lone number such as a year ("2024") isn't mistaken for chrome.
  return (
    /(?:reactions?|likes?|comments?|reposts?|shares?|[•·])/i.test(t) ||
    /[^\p{L}\p{N}\s.,]/u.test(t)
  );
}

// Reader-mode parse: resolve LinkedIn's innerText quirks into a clean identity +
// body. Returns the recovered author/headline, the cleaned text blocks, and
// whether the entry is a bookmarked "Saved" article rather than a feed post.
function parseReaderPost(post) {
  const statedPresence = PRESENCE_RE.test((post.author || "").trim());
  let author = deriveAuthor(post);
  let headline = (post.authorHeadline || post.metadata?.companyInfo || "").trim();
  let isSavedArticle = false;
  let identityLifted = false;
  const bodyLines = [];

  for (const raw of String(post.text || "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      bodyLines.push("");
      continue;
    }

    // Presence/status text is never an author and never body.
    if (PRESENCE_RE.test(line)) continue;

    // "Saved link • Article title" — flag it; keep the title as the body lead.
    if (SAVED_LINK_RE.test(line)) {
      isSavedArticle = true;
      const title = line.replace(SAVED_LINK_RE, "").trim();
      if (title) bodyLines.push(title);
      continue;
    }

    // When presence text displaced the name, the first "Name • <degree> <role>"
    // line carries the real identity — lift it into the header, drop from body.
    if (statedPresence && !identityLifted) {
      const id = splitNameRole(line);
      if (id.author) {
        identityLifted = true;
        if (!author) author = id.author;
        if (id.headline && !headline) headline = id.headline;
        continue;
      }
    }

    if (isNoiseLine(line)) continue;
    bodyLines.push(line);
  }

  const bodyText = bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    author: author || "Unknown author",
    headline,
    isSavedArticle,
    blocks: textBlocks(bodyText),
  };
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

// Filled triangle reads as "play" at small sizes; the others share ICON_BASE.
const PlayIcon = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

const FileIcon = (props) => (
  <svg width="16" height="16" {...ICON_BASE} {...props}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
  </svg>
);

const ImagesIcon = (props) => (
  <svg width="16" height="16" {...ICON_BASE} {...props}>
    <rect x="3" y="3" width="14" height="14" rx="2" />
    <path d="M21 7v12a2 2 0 0 1-2 2H7" />
  </svg>
);

// postType (from extract.js) → how it reads on the card face. Types not listed
// (text, media) carry no badge — a plain text post needs no label.
const POST_TYPE_META = {
  video: { label: "Video", Icon: PlayIcon },
  external_video: { label: "Video", Icon: PlayIcon },
  document: { label: "Document", Icon: FileIcon },
  article: { label: "Article", Icon: ExternalIcon },
  image_with_article: { label: "Article", Icon: ExternalIcon },
  reshare: { label: "Repost", Icon: RepostIcon },
  poll: { label: "Poll" },
  event: { label: "Event" },
  newsletter: { label: "Newsletter" },
  celebration: { label: "Celebration" },
  image: { label: "Photo" },
};

// Small type pill. `overlay` sits on the media hero (light-on-dark); `inline`
// rides next to the author on text-only cards (neutral chip).
function TypeBadge({ meta, variant }) {
  if (!meta) return null;
  const { label, Icon } = meta;
  return (
    <span className={`type-badge type-badge--${variant}`}>
      {Icon ? <Icon width={12} height={12} /> : null}
      {label}
    </span>
  );
}

export function PostCard({ post, onUpdated, onDeleted, onTagClick, activeTags = [] }) {
  const [readerOpen, setReaderOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [avatarBroken, setAvatarBroken] = useState(false);

  const displayText = useMemo(() => readableText(post.text), [post.text]);
  const displayBlocks = useMemo(() => textBlocks(displayText), [displayText]);
  const reader = useMemo(() => parseReaderPost(post), [post]);
  const media = Array.isArray(post.media) ? post.media : [];
  const links = metadataLinks(post);
  const readableMedia = media.filter((item) => item.thumbnailUrl || item.url);
  const primaryMedia = primaryPreviewMedia(media);
  const primaryThumb =
    primaryMedia?.thumbnailUrl ||
    (primaryMedia?.type === "image" ? primaryMedia?.url : "");
  const author = deriveAuthor(post);
  const source = hostFromUrl(post.url) || hostFromUrl(links[0]?.url) || "LinkedIn";
  const monogram = (author || source || "L").trim().charAt(0).toUpperCase();
  // Author avatar captured from LinkedIn; falls back to the monogram when it's
  // missing (older saves) or the CDN URL has expired (onError).
  const authorImage = post.metadata?.authorImage || "";
  const showAvatar = Boolean(authorImage) && !avatarBroken;
  const savedDate = new Date(post.savedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  // Provenance: who/what. Headline credits the author's role/company; profile
  // link makes the identity tappable when we captured it.
  const headline = (post.authorHeadline || post.metadata?.companyInfo || "").trim();
  const profileUrl = post.metadata?.authorProfileUrl || "";

  // Type signalling. The badge labels the post; the hero affordance (play /
  // image-count) is the at-a-glance cue while scanning the grid.
  const postType = post.metadata?.postType || "";
  const typeMeta = POST_TYPE_META[postType] || null;
  const isVideo =
    postType === "video" ||
    postType === "external_video" ||
    primaryMedia?.type === "video";
  const imageCount = media.filter(
    (item) => item.type === "image" && (item.url || item.thumbnailUrl)
  ).length;

  // The post's own hashtags — recognition aid, distinct from the user's tags.
  // One tap adopts a topic as a tag. Drop any already accepted.
  const topicTags = (
    Array.isArray(post.metadata?.hashtags) ? post.metadata.hashtags : []
  )
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter((tag) => tag && !post.tags.includes(tag))
    .slice(0, 6);

  // Engagement surfaced as compact stats (full detail lives in the reader).
  // Counts are only shown when present.
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

  const removeTag = (tag) => persist(post.tags.filter((t) => t !== tag), post.suggested);

  const addCustom = (e) => {
    e.preventDefault();
    const tag = draft.trim().toLowerCase();
    if (!tag) return;
    setDraft("");
    acceptTag(tag);
  };

  const renderActions = () => (
    <div className="card-actions">
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
        onClick={() => onDeleted(post.id)}
      >
        <TrashIcon />
      </button>
    </div>
  );

  return (
    <article className="card linkedmash-card">
      <div className="card-content">
        <div className="card-id">
          <span
            className={`card-avatar${showAvatar ? " card-avatar--photo" : ""}`}
            aria-hidden="true"
          >
            {showAvatar ? (
              <img
                className="card-avatar-img"
                src={authorImage}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              monogram
            )}
          </span>
          <div className="card-id-main">
            <div className="card-id-line">
              {profileUrl ? (
                <a
                  className="card-author-name"
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={author || "Unknown author"}
                >
                  {author || "Unknown author"}
                </a>
              ) : (
                <span className="card-author-name" title={author || "Unknown author"}>
                  {author || "Unknown author"}
                </span>
              )}
            </div>
            <span className="card-source">
              {headline && <span className="card-headline">{headline}</span>}
              {headline && <span className="meta-sep" aria-hidden="true">·</span>}
              <span className="card-source-name">{source}</span>
            </span>
          </div>
          {renderActions()}
        </div>

        <div className="card-post-text">
          {displayBlocks.length > 0 ? (
            displayBlocks.map((block, index) => (
              <p
                key={`${block.text.slice(0, 32)}-${index}`}
                className={`card-text-block card-text-block--${block.kind}`}
              >
                {block.text}
              </p>
            ))
          ) : (
            <p className="card-text-empty">No text was captured for this post.</p>
          )}
        </div>

        {(typeMeta || primaryThumb) && (
          <div className="card-attachments">
            <TypeBadge meta={typeMeta} variant="inline" />
            {primaryThumb && (
              <button
                className="card-media-pill"
                type="button"
                onClick={() => setReaderOpen(true)}
                title="View captured media"
              >
                {isVideo ? <PlayIcon width={13} height={13} /> : <ImagesIcon width={13} height={13} />}
                {isVideo ? "Video" : imageCount > 1 ? `${imageCount} images` : mediaLabel(primaryMedia)}
              </button>
            )}
          </div>
        )}

        <div className="card-stats">
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
              Published {publishedText}
            </span>
          ) : null}
          <span className="card-stat card-stat--saved" title={`Saved ${savedDate}`}>
            Saved {savedDate}
          </span>
        </div>

        {topicTags.length > 0 && (
          <div className="card-topics">
            {topicTags.map((tag) => (
              <button
                key={tag}
                className="topic-chip"
                onClick={() => acceptTag(tag)}
                title="Add as a tag"
              >
                #{tag}
              </button>
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
              <button
                className="chip-x"
                onClick={() => removeTag(t)}
                title="Remove"
                aria-label={`Remove tag ${t}`}
              >
                ×
              </button>
            </span>
          ))}

          {pending.length > 0 && <span className="tags-hint">Suggested</span>}
          {pending.map((s) => (
            <span key={s.tag} className="chip suggested">
              <button
                className="chip-add"
                onClick={() => acceptTag(s.tag)}
                title="Add this tag"
                aria-label={`Add suggested tag ${s.tag}`}
              >
                + {s.tag}
              </button>
              <button
                className="chip-x"
                onClick={() => dismissSuggestion(s.tag)}
                title="Dismiss suggestion"
                aria-label={`Dismiss suggested tag ${s.tag}`}
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

      {readerOpen &&
        createPortal(
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
                <strong>{reader.author}</strong>
                {reader.headline && <span>{reader.headline}</span>}
                {reader.isSavedArticle && (
                  <span className="reader-flag">Saved article</span>
                )}
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
                  {reader.blocks.length > 0 ? (
                    reader.blocks.map((block, index) => (
                      <p
                        key={`${block.text.slice(0, 32)}-${index}`}
                        className={`text-block text-block--${block.kind}`}
                      >
                        {block.text}
                      </p>
                    ))
                  ) : (
                    <p className="reader-empty">
                      {reader.isSavedArticle
                        ? "Bookmarked article — no post text was captured."
                        : "No text was captured for this post."}
                    </p>
                  )}
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
        </div>,
          document.body
        )}
    </article>
  );
}
