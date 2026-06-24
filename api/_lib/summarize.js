// Offline one-line summary of a post. No API calls — mirrors the no-LLM stance
// of tagger.js. Strategy: strip LinkedIn noise, then extract the most
// informative lead sentence(s) and trim to a single readable line.

const PLACEHOLDER_RE = /^\s*\[LinkedIn post\b.*?\]\s*$/gim;

function stripUrls(text) {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    // bare domains only — require an alphabetic TLD so "$3.5M", "40%", "2.0"
    // are not mistaken for a hostname.
    .replace(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?/gi, " ");
}

// LinkedIn renders hashtags as the literal word "hashtag" glued to "#Topic".
function dehashtagWord(text) {
  return text.replace(/\bhashtag\s*#/gi, "#");
}

// Shared, light cleanup used by both the summary and the card excerpt.
export function cleanBody(text, { keepHashtags = true } = {}) {
  let out = String(text || "")
    .replace(PLACEHOLDER_RE, " ")
    .replace(/ /g, " ");
  out = dehashtagWord(out);
  out = out
    .replace(/\bsee more\b/gi, "")
    .replace(/\bshow more\b/gi, "");
  if (!keepHashtags) out = out.replace(/#[\p{L}0-9_]+/gu, " ");
  return out
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function truncateAtWord(text, maxLen) {
  if (text.length <= maxLen) return { text, truncated: false };
  let cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) cut = cut.slice(0, lastSpace);
  return { text: cut.replace(/[\s,;:.\-–—]+$/, ""), truncated: true };
}

function tidy(text) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * One-line summary suitable for a card or a spreadsheet column.
 * @param {string} text  the post body
 * @param {{maxLen?: number}} [opts]
 * @returns {string}
 */
export function summarize(text, { maxLen = 150 } = {}) {
  const body = stripUrls(cleanBody(text, { keepHashtags: false }));
  if (!body) return "";

  const sentences = splitSentences(body);
  if (!sentences.length) return "";

  // Accumulate lead sentences until we have something substantial, so a short
  // hook ("Big news.") gets joined with the line that actually carries meaning.
  let lead = "";
  for (const sentence of sentences) {
    if (!lead) {
      lead = sentence;
    } else if (lead.length < 60 && lead.length + sentence.length + 1 <= maxLen + 60) {
      lead += " " + sentence;
    } else {
      break;
    }
    if (lead.length >= maxLen) break;
  }

  const moreToCome = sentences.length > 1;
  const { text: clipped, truncated } = truncateAtWord(tidy(lead), maxLen);
  let out = clipped;
  if (out && !/[.!?]$/.test(out) && (truncated || moreToCome)) out += "…";
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * Longer, lightly-cleaned excerpt for the HTML card. The full untruncated text
 * is kept only in the spreadsheet, per the export spec.
 * @param {string} text
 * @param {{maxLen?: number}} [opts]
 * @returns {string}
 */
export function excerpt(text, { maxLen = 420 } = {}) {
  const body = cleanBody(text, { keepHashtags: true });
  if (!body) return "";
  if (body.length <= maxLen) return body;
  const { text: clipped } = truncateAtWord(body, maxLen);
  return clipped + "…";
}
