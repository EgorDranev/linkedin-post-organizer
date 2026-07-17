import {
  ensureSchema,
  hasDatabase,
  sql,
  allTags,
  hydrate,
  getPost,
} from "./_lib/db.js";
import { suggestTagsAI } from "./_lib/ai.js";
import { requireUser } from "./_lib/auth.js";

const previewPosts = [
  {
    id: "preview-1",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:preview/",
    author: "Khizer Abbas",
    authorHeadline: "Growing newsletter with Paid Ads",
    text:
      "Claude Code can block its own bad actions before they run.\n\n" +
      "It's called Hooks, and almost no one is using them.\n\n" +
      "Here's the full Claude Code workflow most engineers are missing:\n" +
      "1. Getting Started\n" +
      "One curl command to install (Node 18+ required)\n" +
      "Run /init -> Claude scans your codebase and builds a memory file\n\n" +
      "2. CLAUDE.md\n" +
      "Loads every session automatically\n" +
      "Store your stack, architecture, and gotchas here\n" +
      "Skip this and your results stay inconsistent\n\n" +
      "3. Daily Workflow\n" +
      "Shift + Tab + Tab -> Plan Mode before code gets written\n" +
      "/compact to compress context, Esc Esc to rewind\n" +
      "New session per feature, commit frequently\n\n" +
      "4. Hooks\n" +
      "Run before or after tool use\n" +
      "Exit code 0 = allow, exit code 2 = block\n" +
      "Your guardrails that Claude won't override\n\n" +
      "5. 4-Layer Architecture\n" +
      "L1 CLAUDE.md -> L2 Skills -> L3 Hooks -> L4 Agents",
    savedAt: "2026-06-08T12:00:00.000Z",
    status: "review",
    tags: ["claude code", "workflow"],
    collections: [],
    suggested: [{ tag: "ai" }],
    metadata: {
      authorProfileUrl: "https://www.linkedin.com/in/khizer-abbas/",
      hashtags: ["ClaudeCode"],
      publishedText: "Jun 8 2026",
      socialCounts: { reactions: "42", comments: "7" },
    },
    media: [],
  },
];

function cleanJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanMedia(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 12)
    .map((item) => ({
      type: typeof item.type === "string" ? item.type.slice(0, 32) : "unknown",
      url: typeof item.url === "string" ? item.url.slice(0, 2048) : "",
      thumbnailUrl:
        typeof item.thumbnailUrl === "string" ? item.thumbnailUrl.slice(0, 2048) : null,
      title: typeof item.title === "string" ? item.title.slice(0, 500) : null,
      description:
        typeof item.description === "string" ? item.description.slice(0, 1000) : null,
      provider: typeof item.provider === "string" ? item.provider.slice(0, 120) : null,
      alt: typeof item.alt === "string" ? item.alt.slice(0, 500) : null,
    }))
    .filter((item) => item.url || item.thumbnailUrl || item.title);
}

function cleanPostUrl(value, metadata) {
  const url = typeof value === "string" && value.trim() ? value.trim() : null;
  if (!url) return null;

  const urn = typeof metadata.urn === "string" ? metadata.urn.trim() : "";
  const capturedFrom =
    typeof metadata.capturedFrom === "string" ? metadata.capturedFrom.trim() : "";

  if (
    capturedFrom &&
    !urn &&
    url === capturedFrom &&
    /^https:\/\/(?:www\.)?linkedin\.com\//i.test(url) &&
    !/\/feed\/update\/urn:li:activity:\d+\/?/i.test(url)
  ) {
    return null;
  }

  return url;
}

export default async function handler(req, res) {
  // The extension credential is capture-only per the spec: it may POST a
  // capture and nothing else. Reads and edits require the web session.
  const actor = await requireUser(req, res, { webOnly: req.method !== "POST" });
  if (!actor) return;
  const { userId } = actor;

  if (req.method === "GET") {
    if (!hasDatabase) return res.status(200).json(previewPosts);

    await ensureSchema();
    const rows = await sql`
      SELECT * FROM posts WHERE user_id = ${userId}
      ORDER BY saved_at DESC, id DESC`;
    const posts = await Promise.all(rows.map((row) => hydrate(userId, row)));
    return res.status(200).json(posts);
  }

  if (req.method === "POST") {
    if (!hasDatabase) {
      return res.status(503).json({ error: "Database connection string is not configured" });
    }

    await ensureSchema();
    const { url, author, authorHeadline, text } = req.body || {};
    const createOnly = req.body?.createOnly === true;
    const metadata = cleanJsonObject(req.body?.metadata);
    const media = cleanMedia(req.body?.media);
    const postUrl = cleanPostUrl(url, metadata);
    const urn =
      typeof req.body?.urn === "string" && req.body.urn.trim()
        ? req.body.urn.trim().slice(0, 256)
        : null;
    const hasMetadata = Object.keys(metadata).length > 0;
    const hasMedia = media.length > 0;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    const tags = await allTags(userId);
    const suggestions = JSON.stringify(
      await suggestTagsAI(text, { existingTags: tags, author })
    );

    // URL-less captures (some LinkedIn posts have no extractable permalink)
    // dedupe by the post's urn instead, so a repeated Save never duplicates.
    const existing = postUrl
      ? await sql`SELECT id FROM posts WHERE user_id = ${userId} AND url = ${postUrl}`
      : urn
        ? await sql`SELECT id FROM posts WHERE user_id = ${userId} AND urn = ${urn}`
        : [];

    let id;
    let duplicate = existing.length > 0;
    if (duplicate) {
      id = existing[0].id;
      if (createOnly) {
        const post = await getPost(userId, id);
        return res.status(200).json({ ...post, duplicate: true, skipped: true });
      }
      await sql`
        UPDATE posts SET author = ${author ?? null},
          author_headline = ${authorHeadline ?? null},
          text = ${text}, suggested = ${suggestions}::jsonb,
          metadata = CASE
            WHEN ${hasMetadata} THEN ${JSON.stringify(metadata)}::jsonb
            ELSE metadata
          END,
          media = CASE
            WHEN ${hasMedia} THEN ${JSON.stringify(media)}::jsonb
            ELSE media
          END
        WHERE user_id = ${userId} AND id = ${id}`;
    } else {
      // A concurrent capture of the same URL can still slip past the SELECT
      // above; the per-user unique index turns the loser into a duplicate
      // response instead of an unhandled constraint violation.
      const rows = await sql`
        INSERT INTO posts (
          user_id, url, urn, author, author_headline, text, status, suggested, metadata, media
        )
        VALUES (${userId}, ${postUrl}, ${urn}, ${author ?? null}, ${authorHeadline ?? null},
                ${text}, 'review', ${suggestions}::jsonb,
                ${JSON.stringify(metadata)}::jsonb, ${JSON.stringify(media)}::jsonb)
        ON CONFLICT (user_id, url) WHERE url IS NOT NULL DO NOTHING
        RETURNING id`;
      if (rows.length) {
        id = rows[0].id;
      } else {
        const winner = await sql`SELECT id FROM posts WHERE user_id = ${userId} AND url = ${postUrl}`;
        id = winner[0].id;
        duplicate = true;
      }
    }

    const post = await getPost(userId, id);
    return res.status(duplicate ? 200 : 201).json({
      ...post,
      duplicate,
    });
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "method not allowed" });
}
