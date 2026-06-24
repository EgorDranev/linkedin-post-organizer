// LinkedIn Saver — live post-type selector audit.
//
// HOW TO RUN:
//   1. Open linkedin.com/feed while LOGGED IN (search / a busy profile work too).
//   2. Scroll for ~20s so a variety of posts load (text, image, video, doc,
//      poll, repost, celebration, article…). Visiting a poll or document post
//      directly helps cover the rarer types.
//   3. Open DevTools (Cmd+Opt+I) → Console, paste this whole file, hit Enter.
//   4. Copy the JSON printed at the bottom and send it back.
//
// It mirrors the selectors in extension/lib/extract.js (extractPostType) and
// reports: the detected type distribution, a per-post table, and — the useful
// part — "drift candidates": component classes seen on posts we could only
// bucket as text/media/article/image. A renamed or brand-new component type
// shows up there, telling us exactly which selector to add.
(() => {
  const q = (el, sel) => !!(el.matches?.(sel) || el.querySelector?.(sel));

  const POST_SELECTOR = [
    "div.feed-shared-update-v2[data-urn]",
    "div.feed-shared-update-v2[data-id]",
    "div.feed-shared-update-v2",
    "div.update-components-activity",
    ".fie-impression-container",
    "[data-view-name='feed-full-update']",
    "[role='article']",
    "article",
  ].join(", ");

  const isReshare = (el) => {
    if (
      el.querySelector(".feed-shared-update-v2 .feed-shared-update-v2") ||
      el.querySelector(".update-components-update-v2 .update-components-update-v2")
    ) {
      return true;
    }
    const mini = el.querySelector(
      ".update-components-mini-update-v2, .feed-shared-mini-update-v2"
    );
    return !!(
      mini &&
      !mini.matches(
        ".update-components-mini-update-v2--occasion, .feed-shared-mini-update-v2--occasion"
      ) &&
      mini.querySelector(".update-components-actor, .feed-shared-actor")
    );
  };

  const isPostImage = (img) => {
    const r = img.getBoundingClientRect?.();
    const src = img.currentSrc || img.getAttribute("src") || "";
    if (src.startsWith("data:")) return false;
    if (r && (r.width < 80 || r.height < 60)) return false;
    if (r && r.width >= 150 && r.height >= 90) return true;
    const label = [img.getAttribute("alt"), img.className, img.closest("a")?.className]
      .join(" ")
      .toLowerCase();
    return !/(profile|avatar|emoji|logo|icon)/.test(label);
  };

  const hasContentImage = (el) => {
    if (q(el, ".feed-shared-image, .update-components-image")) return true;
    for (const img of el.querySelectorAll("img")) {
      if (
        img.closest(
          ".feed-shared-article, .update-components-article, .update-components-document, .document-s-container, .update-components-actor, .feed-shared-actor"
        )
      ) {
        continue;
      }
      if (isPostImage(img)) return true;
    }
    return false;
  };
  const hasArticleCard = (el) =>
    q(el, ".feed-shared-article, .update-components-article");

  // Same order as extractPostType — first match wins.
  const RULES = [
    ["reshare", isReshare],
    ["poll", (el) => q(el, ".feed-shared-poll, .update-components-poll, [data-test-id*='poll' i]")],
    ["celebration", (el) => q(el, ".feed-shared-celebration, .update-components-celebration, .feed-shared-occasion, .update-components-occasion, .update-components-mini-update-v2--occasion, .feed-shared-mini-update-v2--occasion")],
    ["event", (el) => q(el, ".feed-shared-event, .update-components-event, .feed-shared-update-v2__content--event")],
    ["newsletter", (el) => q(el, ".feed-shared-newsletter, .update-components-newsletter, .update-components-article--newsletter")],
    ["document", (el) => q(el, ".update-components-document, .feed-shared-document, .document-s-container, [data-test-id*='document' i]")],
    ["external_video", (el) => q(el, ".feed-shared-external-video, .update-components-external-video")],
    ["video", (el) => q(el, "video, .feed-shared-linkedin-video, .update-components-linkedin-video")],
    ["image_with_article", (el) => hasArticleCard(el) && hasContentImage(el)],
    ["article", (el) => hasArticleCard(el)],
    ["image", (el) => hasContentImage(el)],
  ];

  const classify = (el) => {
    for (const [type, test] of RULES) {
      try {
        if (test(el)) return type;
      } catch {
        /* ignore */
      }
    }
    return "text/media";
  };

  // Buckets where a missed/renamed type would hide.
  const GENERIC = new Set(["text/media", "article", "image", "image_with_article"]);

  const componentFamilies = (el) => {
    const out = new Set();
    for (const node of [el, ...el.querySelectorAll("[class]")]) {
      for (const c of node.classList || []) {
        if (!/^(feed-shared|update-components)-/.test(c)) continue;
        out.add(c.split("__")[0].split("--")[0]); // strip BEM element/modifier
      }
    }
    return out;
  };

  // Collect posts, skipping the inner (reshared) update so a repost counts once.
  const seen = new Set();
  const posts = [];
  for (const el of document.querySelectorAll(POST_SELECTOR)) {
    if (el.closest(".feed-shared-update-v2 .feed-shared-update-v2")) continue;
    const urn = el.getAttribute("data-urn") || el.getAttribute("data-id") || "";
    const key = urn || `idx:${posts.length}:${(el.innerText || "").slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    posts.push(el);
  }

  const dist = {};
  const rows = [];
  const driftTally = {};
  posts.forEach((el, i) => {
    const type = classify(el);
    dist[type] = (dist[type] || 0) + 1;
    rows.push({
      "#": i,
      type,
      urn: (el.getAttribute("data-urn") || "").slice(-14),
      preview: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70),
    });
    if (GENERIC.has(type)) {
      for (const fam of componentFamilies(el)) {
        driftTally[fam] = (driftTally[fam] || 0) + 1;
      }
    }
  });

  const drift = Object.entries(driftTally).sort((a, b) => b[1] - a[1]);

  console.log("%cLinkedIn Saver — post-type audit", "font-weight:bold;font-size:14px");
  console.log("posts scanned:", posts.length, "·", location.href);
  console.table(dist);
  console.table(rows);
  console.log("component families on generic-bucket posts (drift candidates):");
  console.table(drift.map(([cls, n]) => ({ class: cls, count: n })));

  const blob = {
    url: location.href,
    posts: posts.length,
    distribution: dist,
    driftCandidates: Object.fromEntries(drift),
    rows,
  };
  console.log("%c↓ Copy the JSON below and send it back ↓", "font-weight:bold;color:#0a66c2");
  console.log(JSON.stringify(blob, null, 2));
  return blob;
})();
