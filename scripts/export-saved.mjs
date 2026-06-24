// LinkedIn Saver — build a shareable export from your saved posts.
//
// Produces two files (default ./export/):
//   • linkedin-saved-posts.html  — single-file interactive page
//        (search · theme filters · sort · expandable cards; excerpt + summary)
//   • linkedin-saved-posts.xlsx  — one row per post + a "By Theme" tab
//        (full post text lives here)
//
// Source of posts, in priority order:
//   1. --input <file.json>   array of post objects (e.g. `curl /api/posts > posts.json`)
//   2. --input <file.csv>    the app's own CSV export
//   3. DATABASE_URL / POSTGRES_URL in the env  → reads straight from Postgres
//
// Summaries and theme clustering use Claude when ANTHROPIC_API_KEY is set, and
// fall back to the offline, deterministic heuristics otherwise (see api/_lib/ai.js).
//
// Usage:
//   node scripts/export-saved.mjs --input posts.json
//   node scripts/export-saved.mjs --input linkedin-saver-2026-06-08.csv --out dist
//   vercel env pull && node scripts/export-saved.mjs        # straight from the DB

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { excerpt } from "../api/_lib/summarize.js";
import { summarizeManyAI, clusterThemesAI, hasAI } from "../api/_lib/ai.js";
import { writeXlsx } from "./lib/xlsx.mjs";
import { renderHtml } from "./lib/render-html.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// --- args -------------------------------------------------------------------

function parseArgs(argv) {
  const out = { out: "export", maxThemes: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" || a === "-i") out.input = argv[++i];
    else if (a === "--out" || a === "-o") out.out = argv[++i];
    else if (a === "--max-themes") out.maxThemes = Number(argv[++i]) || 10;
  }
  return out;
}

// --- loaders ----------------------------------------------------------------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function safeJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function fromCsv(text) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c !== ""));
  if (!rows.length) return [];
  const header = rows[0];
  const idx = (label) => header.indexOf(label);
  const col = { savedAt: idx("Saved at"), author: idx("Author"), role: idx("Author headline"), text: idx("Text"), metadata: idx("Metadata"), media: idx("Media"), tags: idx("Tags"), url: idx("URL") };
  return rows.slice(1).map((r) => ({
    url: col.url >= 0 ? r[col.url] : "",
    author: col.author >= 0 ? r[col.author] : "",
    authorHeadline: col.role >= 0 ? r[col.role] : "",
    text: col.text >= 0 ? r[col.text] : "",
    savedAt: col.savedAt >= 0 ? r[col.savedAt] : "",
    metadata: safeJson(col.metadata >= 0 ? r[col.metadata] : null, {}),
    media: safeJson(col.media >= 0 ? r[col.media] : null, []),
    tags: col.tags >= 0 && r[col.tags] ? r[col.tags].split(",").map((t) => t.trim()).filter(Boolean) : [],
  }));
}

function fromJson(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : Array.isArray(data?.posts) ? data.posts : [];
  return list.map((p) => ({
    url: p.url || "",
    author: p.author || "",
    authorHeadline: p.authorHeadline || p.author_headline || "",
    text: p.text || "",
    savedAt: p.savedAt || p.saved_at || "",
    metadata: p.metadata && typeof p.metadata === "object" ? p.metadata : {},
    media: Array.isArray(p.media) ? p.media : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
  }));
}

async function fromDatabase() {
  const { sql, ensureSchema } = await import("../api/_lib/db.js");
  await ensureSchema();
  const rows = await sql`SELECT * FROM posts ORDER BY saved_at DESC, id DESC`;
  const tagRows = await sql`
    SELECT pt.post_id AS post_id, t.name AS name
    FROM post_tags pt JOIN tags t ON t.id = pt.tag_id`;
  const tagsByPost = new Map();
  for (const { post_id, name } of tagRows) {
    if (!tagsByPost.has(post_id)) tagsByPost.set(post_id, []);
    tagsByPost.get(post_id).push(name);
  }
  return rows.map((r) => ({
    url: r.url || "",
    author: r.author || "",
    authorHeadline: r.author_headline || "",
    text: r.text || "",
    savedAt: r.saved_at,
    metadata: r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? r.metadata : {},
    media: Array.isArray(r.media) ? r.media : [],
    tags: tagsByPost.get(Number(r.id)) || tagsByPost.get(r.id) || [],
  }));
}

async function loadPosts(args) {
  if (args.input) {
    const path = resolve(process.cwd(), args.input);
    const text = readFileSync(path, "utf8");
    const posts = args.input.toLowerCase().endsWith(".csv") ? fromCsv(text) : fromJson(text);
    return { posts, source: `${args.input} (${posts.length})` };
  }
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL) {
    const posts = await fromDatabase();
    return { posts, source: `database (${posts.length})` };
  }
  throw new Error(
    "No input. Pass --input <posts.json|export.csv>, or set DATABASE_URL (e.g. `vercel env pull`) to read from Postgres."
  );
}

// --- shaping ----------------------------------------------------------------

function fmtDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function dateInfo(post) {
  const iso = post.metadata?.publishedDate;
  const publishedFmt = iso && !Number.isNaN(Date.parse(iso)) ? fmtDate(iso) : "";
  const ts = Date.parse(iso || "") || Date.parse(post.savedAt || "") || 0;
  const relative = post.metadata?.publishedText ? String(post.metadata.publishedText).trim() : "";
  const display = publishedFmt || relative || (post.savedAt ? `Saved ${fmtDate(post.savedAt)}` : "");
  return { ts, display, publishedCol: publishedFmt || relative };
}

function hashtagsOf(post) {
  const raw = Array.isArray(post.metadata?.hashtags) && post.metadata.hashtags.length
    ? post.metadata.hashtags
    : (String(post.text || "").match(/#[\p{L}0-9_]+/gu) || []);
  return [...new Set(raw.map((h) => String(h).replace(/^#/, "").toLowerCase()).filter(Boolean))];
}

function hasRealText(post) {
  const t = String(post.text || "").trim();
  return t && !/^\[LinkedIn post\b.*\]$/i.test(t);
}

// --- main -------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { posts, source } = await loadPosts(args);
  if (!posts.length) {
    console.error(`No posts found in ${source}.`);
    process.exit(1);
  }

  if (hasAI()) console.log("Using Claude for summaries + themes (ANTHROPIC_API_KEY set).");
  else console.log("No ANTHROPIC_API_KEY — using offline heuristics for summaries + themes.");

  const { themes, themeByIndex } = await clusterThemesAI(posts, { maxThemes: args.maxThemes });

  // Summarize in one batched pass (AI when available, heuristic fallback per item).
  const summaryInputs = posts.map((post) => (hasRealText(post) ? post.text : ""));
  const summaries = await summarizeManyAI(summaryInputs);

  const shaped = posts.map((post, i) => {
    const { ts, display, publishedCol } = dateInfo(post);
    return {
      theme: themeByIndex[i],
      author: post.author || "",
      role: post.authorHeadline || "",
      summary: hasRealText(post) ? summaries[i] : "",
      excerpt: hasRealText(post) ? excerpt(post.text) : "",
      fullText: post.text || "",
      url: post.url || "",
      date: display,
      published: publishedCol,
      ts,
      savedAt: post.savedAt ? fmtDate(post.savedAt) : "",
      type: post.metadata?.postType || "",
      reactions: post.metadata?.socialCounts?.reactions || "",
      comments: post.metadata?.socialCounts?.comments || "",
      hashtags: hashtagsOf(post),
      tags: post.tags || [],
    };
  });

  const generatedAt = fmtDate(new Date().toISOString());
  mkdirSync(resolve(process.cwd(), args.out), { recursive: true });
  const htmlPath = join(resolve(process.cwd(), args.out), "linkedin-saved-posts.html");
  const xlsxPath = join(resolve(process.cwd(), args.out), "linkedin-saved-posts.xlsx");

  // ---- HTML (excerpt + summary only) ----
  const html = renderHtml({
    generatedAt,
    total: shaped.length,
    themes: themes.map((t) => ({ name: t.name, slug: t.slug, count: t.count })),
    posts: shaped.map((p) => ({
      theme: p.theme, author: p.author, role: p.role, summary: p.summary,
      excerpt: p.excerpt, url: p.url, date: p.date, ts: p.ts, hashtags: p.hashtags,
    })),
  });
  writeFileSync(htmlPath, html);

  // ---- XLSX ----
  const postsHeader = ["Saved at", "Theme", "Author", "Role", "Published", "Type", "Reactions", "Comments", "Summary", "Full text", "Hashtags", "Tags", "Link"];
  const postsRows = [
    postsHeader,
    ...shaped
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .map((p) => [
        p.savedAt, p.theme, p.author, p.role, p.published, p.type, p.reactions, p.comments,
        p.summary, p.fullText, p.hashtags.map((h) => `#${h}`).join(" "), p.tags.join(", "), p.url,
      ]),
  ];

  const byThemeHeader = ["Theme", "Author", "Role", "Published", "Summary", "Link"];
  const byThemeRows = [byThemeHeader];
  for (const theme of themes) {
    const inTheme = shaped.filter((p) => p.theme === theme.name).sort((a, b) => b.ts - a.ts);
    for (const p of inTheme) {
      byThemeRows.push([p.theme, p.author, p.role, p.published, p.summary, p.url]);
    }
  }

  writeXlsx(xlsxPath, [
    {
      name: "Posts",
      rows: postsRows,
      freezeHeader: true,
      cols: [{ width: 13 }, { width: 20 }, { width: 22 }, { width: 26 }, { width: 13 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 46 }, { width: 70 }, { width: 24 }, { width: 22 }, { width: 40 }],
      wrapColumns: [3, 8, 9, 10],
    },
    {
      name: "By Theme",
      rows: byThemeRows,
      freezeHeader: true,
      cols: [{ width: 20 }, { width: 24 }, { width: 28 }, { width: 13 }, { width: 60 }, { width: 40 }],
      wrapColumns: [2, 4],
    },
  ]);

  // ---- report ----
  console.log(`\nLinkedIn Saver export — source: ${source}`);
  console.log(`Themes (${themes.length}):`);
  for (const t of themes) console.log(`  ${String(t.count).padStart(4)}  ${t.name}`);
  console.log(`\n  HTML  →  ${htmlPath}`);
  console.log(`  XLSX  →  ${xlsxPath}\n`);
}

main().catch((err) => {
  console.error(`\nexport failed: ${err.message}\n`);
  process.exit(1);
});
