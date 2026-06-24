// AI-powered intelligence layer (Anthropic Claude).
//
// This module mirrors the deterministic, offline helpers in tagger.js,
// summarize.js and themes.js — but asks Claude to do the thinking. Every
// function degrades gracefully: with no ANTHROPIC_API_KEY, or on any API/parse
// error, it falls back to the original heuristic implementation, so the app
// keeps working exactly as before.
//
// Output shapes are intentionally identical to the heuristic functions, so the
// callers (API routes, export script, frontend) need no further changes.

import { suggestTags as heuristicSuggestTags } from "./tagger.js";
import { summarize as heuristicSummarize } from "./summarize.js";
import { clusterThemes as heuristicClusterThemes } from "./themes.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Default to a fast, inexpensive model; override with ANTHROPIC_MODEL.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** True when an Anthropic key is configured. */
export function hasAI() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function model() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/**
 * Single-shot Claude call. Returns the concatenated text of the response.
 * Throws on missing key, non-2xx, or network error — callers catch and fall back.
 */
async function callClaude({ system, user, maxTokens = 1024, temperature = 0, signal }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    signal,
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model(),
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  return (data.content || [])
    .filter((b) => b && b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// Models sometimes wrap JSON in ```json fences or add a prose preamble. Pull out
// the first balanced JSON value and parse it.
function parseJsonLoose(text) {
  if (!text) throw new Error("empty response");
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    // fall through to substring scan
  }
  const start = s.search(/[[{]/);
  if (start === -1) throw new Error("no JSON found in response");
  const open = s[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(s.slice(start, i + 1));
    }
  }
  throw new Error("unterminated JSON in response");
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

const MAX_SUGGESTIONS = 4;

const TAG_SYSTEM = `You tag saved LinkedIn posts for a personal knowledge base, like a librarian building a reusable taxonomy.

Return ONLY a JSON array (no prose, no code fences) of up to ${MAX_SUGGESTIONS} short tag objects:
[{"tag": "lowercase tag", "category": "author|topic|format|source|intent"}]

Rules:
- One "author: <full name>" tag when an author is given (category "author").
- Prefer reusing tags from the EXISTING VOCABULARY when they genuinely fit the post — this keeps the taxonomy consistent.
- topic tags: 1-3 words, lowercase, the substance of the post (e.g. "claude code", "fundraising", "remote work"). No hashes.
- format: one of post, article, video, carousel, link, event — only if clearly identifiable.
- source/intent are optional; include only when clearly useful (intent examples: "read later", "reference", "inspiration", "lead").
- No URLs, no domains, no generic filler ("great", "tips", "thread").
- Order by usefulness, most useful first. Fewer, sharper tags beat many weak ones.`;

function normalizeExistingTagNames(existingTags) {
  return new Set(
    (existingTags || [])
      .map((t) => (typeof t === "string" ? t : t && t.name))
      .filter(Boolean)
      .map((n) => n.toLowerCase())
  );
}

/**
 * AI tag suggestions. Same return shape as tagger.js#suggestTags:
 *   { tag:string, score:number, isExisting:boolean }[]
 * Falls back to the heuristic tagger on missing key / error.
 *
 * @param {string} text
 * @param {{existingTags?: ({name:string}[]|string[]), author?: string}|({name:string}[])} [opts]
 */
export async function suggestTagsAI(text, opts = {}) {
  const options = Array.isArray(opts) ? { existingTags: opts } : opts || {};
  const existingTags = options.existingTags || [];
  const author = options.author || "";

  if (!hasAI() || !text || !text.trim()) {
    return heuristicSuggestTags(text, options);
  }

  try {
    const existingNames = [...normalizeExistingTagNames(existingTags)];
    const vocab = existingNames.length
      ? existingNames.slice(0, 80).join(", ")
      : "(none yet)";
    const user =
      `EXISTING VOCABULARY: ${vocab}\n\n` +
      (author ? `AUTHOR: ${author}\n\n` : "") +
      `POST:\n"""\n${String(text).slice(0, 6000)}\n"""`;

    const raw = await callClaude({ system: TAG_SYSTEM, user, maxTokens: 400 });
    const parsed = parseJsonLoose(raw);
    if (!Array.isArray(parsed)) throw new Error("expected a JSON array of tags");

    const existingSet = normalizeExistingTagNames(existingTags);
    const seen = new Set();
    const out = [];
    parsed.forEach((item, i) => {
      const tag = (item && typeof item.tag === "string" ? item.tag : "").trim().toLowerCase();
      if (!tag || tag.length < 2) return;
      if (seen.has(tag)) return;
      seen.add(tag);
      out.push({
        tag,
        score: 100 - i, // preserve model ordering as a descending score
        isExisting: existingSet.has(tag),
        category: typeof item.category === "string" ? item.category : "topic",
      });
    });

    if (!out.length) return heuristicSuggestTags(text, options);
    return out.slice(0, MAX_SUGGESTIONS);
  } catch (err) {
    logFallback("suggestTags", err);
    return heuristicSuggestTags(text, options);
  }
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

const SUMMARY_SYSTEM = `You write one-line summaries of saved LinkedIn posts for a scannable index.
Capture the single most useful takeaway in plain language. No hashtags, no emoji, no "the author", no quotes around it. One sentence, under 150 characters. Return only the sentence.`;

/**
 * AI one-line summary. Returns a string; falls back to summarize.js on error.
 * @param {string} text
 * @param {{maxLen?: number}} [opts]
 */
export async function summarizeAI(text, { maxLen = 150 } = {}) {
  if (!hasAI() || !text || !text.trim()) return heuristicSummarize(text, { maxLen });
  try {
    const raw = await callClaude({
      system: SUMMARY_SYSTEM,
      user: `POST:\n"""\n${String(text).slice(0, 6000)}\n"""`,
      maxTokens: 120,
    });
    const line = raw.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").trim();
    if (!line) return heuristicSummarize(text, { maxLen });
    return line.length > maxLen + 1 ? line.slice(0, maxLen).replace(/\s+\S*$/, "") + "…" : line;
  } catch (err) {
    logFallback("summarize", err);
    return heuristicSummarize(text, { maxLen });
  }
}

const SUMMARY_BATCH_SYSTEM = `You write one-line summaries of saved LinkedIn posts for a scannable index.
You are given a JSON array of posts, each {"i": index, "text": "..."}.
Return ONLY a JSON array of {"i": index, "summary": "..."} — one per input post, same indexes.
Each summary: the single most useful takeaway, plain language, no hashtags/emoji/quotes, one sentence under 150 characters.`;

/**
 * Summarize many posts efficiently in batched API calls. Returns a string[]
 * aligned to the input order. Any item that can't be summarized by AI falls
 * back to the heuristic summarizer for that item.
 *
 * @param {string[]} texts
 * @param {{maxLen?: number, batchSize?: number}} [opts]
 */
export async function summarizeManyAI(texts, { maxLen = 150, batchSize = 20 } = {}) {
  const list = Array.isArray(texts) ? texts : [];
  const results = list.map((t) => heuristicSummarize(t, { maxLen }));
  if (!hasAI() || !list.length) return results;

  for (let start = 0; start < list.length; start += batchSize) {
    const slice = list.slice(start, start + batchSize);
    const payload = slice.map((t, j) => ({ i: j, text: String(t || "").slice(0, 3000) }));
    try {
      const raw = await callClaude({
        system: SUMMARY_BATCH_SYSTEM,
        user: JSON.stringify(payload),
        maxTokens: Math.min(2000, 120 * slice.length + 200),
      });
      const parsed = parseJsonLoose(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const j = Number(item && item.i);
          const summary = item && typeof item.summary === "string" ? item.summary.trim() : "";
          if (Number.isInteger(j) && j >= 0 && j < slice.length && summary) {
            const clean = summary.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ");
            results[start + j] =
              clean.length > maxLen + 1 ? clean.slice(0, maxLen).replace(/\s+\S*$/, "") + "…" : clean;
          }
        }
      }
    } catch (err) {
      logFallback("summarizeMany", err);
      // heuristic results already in place for this slice
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Theme clustering
// ---------------------------------------------------------------------------

const THEME_SYSTEM = `You organize a personal collection of saved LinkedIn posts into a small set of named themes.
You are given a JSON array of posts: {"i": index, "author": "...", "hashtags": ["..."], "excerpt": "..."}.

Return ONLY JSON:
{"themes": ["Theme Name", ...], "assignments": [{"i": index, "theme": "Theme Name"}, ...]}

Rules:
- Aim for 4-10 themes, each grouping genuinely related posts. Fewer is better when posts overlap.
- Theme names are short Title Case noun phrases (e.g. "AI Engineering", "Fundraising", "Career Advice"). Keep acronyms uppercase (AI, ML, UX, SaaS, B2B).
- Assign EVERY post to exactly one theme (the best fit). If a post fits nothing, assign it to "Other".
- Prefer the post's own hashtags as theme signals when present.`;

function slugFor(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";
}

function excerptForTheme(post) {
  const t = String((post && post.text) || "").replace(/\s+/g, " ").trim();
  return t.slice(0, 240);
}

function hashtagsForTheme(post) {
  const meta = post && post.metadata;
  const fromMeta = Array.isArray(meta && meta.hashtags) ? meta.hashtags.map((h) => String(h)) : [];
  const fromText = (String((post && post.text) || "").match(/#[\p{L}0-9_]+/gu) || []).map((h) =>
    h.replace(/^#/, "")
  );
  return [...new Set([...fromMeta, ...fromText].map((h) => h.toLowerCase()).filter(Boolean))].slice(0, 8);
}

/**
 * Cluster posts into named themes with AI. Same return shape as
 * themes.js#clusterThemes:
 *   { themes: {name, slug, count, term}[], themeByIndex: string[] }
 * Falls back to the heuristic clusterer on missing key / error / shape mismatch.
 *
 * @param {Array<{text:string, author?:string, metadata?:object}>} posts
 * @param {{maxThemes?:number, minThemeSize?:number}} [opts]
 */
export async function clusterThemesAI(posts, opts = {}) {
  const list = Array.isArray(posts) ? posts : [];
  const { maxThemes = 10 } = opts;
  if (!hasAI() || list.length === 0) return heuristicClusterThemes(list, opts);

  try {
    const payload = list.map((post, i) => ({
      i,
      author: String((post && post.author) || "").slice(0, 80),
      hashtags: hashtagsForTheme(post),
      excerpt: excerptForTheme(post),
    }));

    const raw = await callClaude({
      system: THEME_SYSTEM,
      user:
        `Group these ${payload.length} posts into at most ${maxThemes} themes.\n\n` +
        JSON.stringify(payload),
      maxTokens: Math.min(4000, 40 * list.length + 600),
      temperature: 0,
    });

    const parsed = parseJsonLoose(raw);
    const themeNames = Array.isArray(parsed.themes) ? parsed.themes.map((n) => String(n)) : [];
    const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];
    if (!themeNames.length || !assignments.length) throw new Error("incomplete theme response");

    // Build per-post assignment, defaulting unknowns to "Other".
    const validNames = new Set(themeNames);
    const themeByIndex = list.map(() => "Other");
    for (const a of assignments) {
      const i = Number(a && a.i);
      const name = a && typeof a.theme === "string" ? a.theme : "";
      if (Number.isInteger(i) && i >= 0 && i < list.length && name) {
        themeByIndex[i] = validNames.has(name) ? name : name; // trust model name even if not pre-listed
      }
    }

    // Counts, ordered like clusterThemes: by count desc, name asc, "Other" last.
    const countByName = new Map();
    for (const name of themeByIndex) countByName.set(name, (countByName.get(name) || 0) + 1);

    const OTHER = "Other";
    const themes = [...countByName.entries()]
      .filter(([name]) => name !== OTHER)
      .map(([name, count]) => ({ name, slug: slugFor(name), count, term: "" }))
      .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));

    if (countByName.get(OTHER)) {
      themes.push({ name: OTHER, slug: "other", count: countByName.get(OTHER), term: "" });
    }

    if (!themes.length) return heuristicClusterThemes(list, opts);
    return { themes, themeByIndex };
  } catch (err) {
    logFallback("clusterThemes", err);
    return heuristicClusterThemes(list, opts);
  }
}

// ---------------------------------------------------------------------------

function logFallback(where, err) {
  const msg = err && err.message ? err.message : String(err);
  // Quiet by default; set AI_DEBUG=1 to surface fallbacks while developing.
  if (process.env.AI_DEBUG) console.warn(`[ai:${where}] falling back to heuristic — ${msg}`);
}
