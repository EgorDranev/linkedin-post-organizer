// DOM scraping for LinkedIn feed posts. Selectors break when LinkedIn ships UI
// changes — update here first if capture returns empty fields.
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});

  const POST_CONTAINER_SELECTOR = [
    "div.feed-shared-update-v2[data-urn]",
    "div.feed-shared-update-v2[data-id]",
    "div.feed-shared-update-v2",
    "div.update-components-activity",
    ".fie-impression-container",
    "[data-view-name='feed-full-update']",
    "[data-view-name='profile-component-entity']",
    "[role='article']",
    "article",
  ].join(", ");

  const POST_SELECTOR = [
    POST_CONTAINER_SELECTOR,
    "[data-urn*='urn:li:activity']",
    "[data-id*='urn:li:activity']",
  ].join(", ");

  const PLACEHOLDER = "[LinkedIn post — no text extracted]";

  function clean(el) {
    const raw = el?.innerText || el?.textContent || "";
    return raw.trim().replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ");
  }

  function normalizeUrn(value) {
    const raw = value || "";
    const direct = raw.match(/urn:li:activity:\d+/i)?.[0];
    if (direct) return direct;

    const id = raw.match(/activity[:_-](\d+)/i)?.[1];
    return id ? `urn:li:activity:${id}` : "";
  }

  function getIdentity(el) {
    if (!el?.getAttribute) return "";
    return (
      normalizeUrn(el.getAttribute("data-urn")) ||
      normalizeUrn(el.getAttribute("data-id"))
    );
  }

  function looksLikePost(el) {
    if (!el?.querySelector) return false;
    return Boolean(
      getIdentity(el) ||
        el.classList?.contains("feed-shared-update-v2") ||
        el.classList?.contains("update-components-activity") ||
        el.classList?.contains("fie-impression-container") ||
        el.getAttribute?.("data-view-name") === "feed-full-update" ||
        (el.querySelector(".update-components-actor, .feed-shared-actor") &&
          el.querySelector(
            ".feed-shared-control-menu__trigger, .update-components-text, .feed-shared-inline-show-more-text, [data-test-id='main-feed-activity-card__commentary']"
          ))
    );
  }

  function postScore(el) {
    if (!looksLikePost(el)) return 0;
    let score = 1;
    if (getIdentity(el)) score += 4;
    if (el.querySelector(".update-components-text, .feed-shared-inline-show-more-text")) {
      score += 3;
    }
    if (el.querySelector(".update-components-actor, .feed-shared-actor")) score += 2;
    if (el.querySelector(".feed-shared-control-menu__trigger")) score += 1;
    return score;
  }

  function rectDistance(a, b) {
    const ax = (a.left + a.right) / 2;
    const ay = (a.top + a.bottom) / 2;
    const bx = (b.left + b.right) / 2;
    const by = (b.top + b.bottom) / 2;
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function isUsefulRect(r) {
    return r.width >= 260 && r.height >= 80 && r.top < innerHeight && r.bottom > 0;
  }

  function fallbackScore(el, nearRect) {
    const r = el.getBoundingClientRect();
    if (!isUsefulRect(r)) return 0;
    if (r.width > innerWidth * 0.98 && r.height > innerHeight * 0.9) return 0;
    if (el.closest("header, nav, footer, [role='banner'], [role='navigation']")) return 0;
    if (el.closest(".msg-overlay-bubble-header, .msg-overlay-list-bubble")) return 0;

    const text = clean(el);
    if (text.length < 30) return 0;

    let score = 1;
    if (getIdentity(el)) score += 10;
    if (el.matches(POST_CONTAINER_SELECTOR)) score += 8;
    if (el.querySelector("[data-urn*='urn:li:activity'], [data-id*='urn:li:activity']")) {
      score += 8;
    }
    if (el.querySelector(".update-components-text, .feed-shared-inline-show-more-text, [data-test-id='main-feed-activity-card__commentary']")) {
      score += 6;
    }
    if (el.querySelector(".update-components-actor, .feed-shared-actor")) score += 4;
    if (el.querySelector(".feed-shared-control-menu__trigger, button[aria-label*='more actions' i], button[aria-label*='control menu' i]")) {
      score += 3;
    }
    if (text.length > 80) score += 2;
    if (text.length > 4000) score -= 5;

    if (nearRect) {
      score -= Math.min(8, rectDistance(r, nearRect) / 80_000);
    }

    return score;
  }

  function fallbackCandidates() {
    return document.querySelectorAll(
      [
        POST_CONTAINER_SELECTOR,
        "[data-urn]",
        "[data-id]",
        "article",
        "[role='article']",
        "main div",
      ].join(", ")
    );
  }

  LIS.findBestPostCandidate = function findBestPostCandidate(nearEl) {
    const nearRect = nearEl?.getBoundingClientRect?.();
    let best = null;
    let bestScore = 0;

    for (const el of fallbackCandidates()) {
      const score = fallbackScore(el, nearRect);
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return bestScore >= 4 ? best : null;
  };

  function firstText(postEl, selectors) {
    for (const selector of selectors) {
      const text = clean(postEl?.querySelector(selector));
      if (text) return text;
    }
    return "";
  }

  function absoluteUrl(value) {
    if (!value) return "";
    try {
      return new URL(value, location.href).href;
    } catch {
      return "";
    }
  }

  function firstHref(postEl, selectors) {
    for (const selector of selectors) {
      const href = postEl?.querySelector(selector)?.getAttribute?.("href");
      const url = absoluteUrl(href);
      if (url) return url;
    }
    return "";
  }

  function compactObject(obj) {
    return Object.fromEntries(
      Object.entries(obj).filter(([, value]) => {
        if (value == null || value === "") return false;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === "object") return Object.keys(value).length > 0;
        return true;
      })
    );
  }

  function compactMedia(item) {
    return compactObject({
      type: item.type,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      title: item.title,
      description: item.description,
      provider: item.provider,
      alt: item.alt,
    });
  }

  function pushUniqueMedia(items, seen, item) {
    const media = compactMedia(item);
    const key = media.url || media.thumbnailUrl || media.title;
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push(media);
  }

  function attr(el, name) {
    return el?.getAttribute?.(name) || "";
  }

  function imageUrl(img) {
    return absoluteUrl(
      img?.currentSrc ||
        attr(img, "src") ||
        attr(img, "data-delayed-url") ||
        attr(img, "data-src")
    );
  }

  function isPostImage(img) {
    const url = imageUrl(img);
    if (!url || url.startsWith("data:")) return false;
    const r = img.getBoundingClientRect?.();
    if (r && (r.width < 80 || r.height < 60)) return false;
    const label = [attr(img, "alt"), attr(img, "class"), attr(img.closest?.("a"), "class")]
      .join(" ")
      .toLowerCase();
    return !/(profile|avatar|emoji|logo|icon)/.test(label);
  }

  function extractSocialCounts(postEl) {
    const counts = {};
    const text = clean(postEl);
    const reactions = text.match(/([\d,.]+[KkMm]?)\s+(?:reaction|like)/);
    const comments = text.match(/([\d,.]+[KkMm]?)\s+comment/);
    const reposts = text.match(/([\d,.]+[KkMm]?)\s+(?:repost|share)/);
    if (reactions) counts.reactions = reactions[1];
    if (comments) counts.comments = comments[1];
    if (reposts) counts.reposts = reposts[1];
    return counts;
  }

  function extractMedia(postEl) {
    const media = [];
    const seen = new Set();

    for (const card of postEl?.querySelectorAll?.(
      ".feed-shared-article, .update-components-article, .feed-shared-external-video, .update-components-external-video, .update-components-document"
    ) || []) {
      const link = card.querySelector("a[href]");
      const img = card.querySelector("img");
      pushUniqueMedia(media, seen, {
        type: card.matches(".feed-shared-external-video, .update-components-external-video")
          ? "video"
          : "article",
        url: absoluteUrl(attr(link, "href")),
        thumbnailUrl: imageUrl(img),
        title: firstText(card, [
          ".feed-shared-article__title",
          ".update-components-article__title",
          ".feed-shared-external-video__title",
          ".update-components-document__title",
          "h2",
          "h3",
        ]),
        description: firstText(card, [
          ".feed-shared-article__description",
          ".update-components-article__description",
          ".feed-shared-external-video__description",
        ]),
        provider: firstText(card, [
          ".feed-shared-article__subtitle",
          ".update-components-article__subtitle",
          ".feed-shared-external-video__subtitle",
        ]),
        alt: attr(img, "alt"),
      });
    }

    for (const video of postEl?.querySelectorAll?.("video") || []) {
      pushUniqueMedia(media, seen, {
        type: "video",
        url: absoluteUrl(attr(video, "src")),
        thumbnailUrl: absoluteUrl(attr(video, "poster")),
      });
    }

    for (const img of postEl?.querySelectorAll?.("img") || []) {
      if (!isPostImage(img)) continue;
      pushUniqueMedia(media, seen, {
        type: "image",
        url: imageUrl(img),
        thumbnailUrl: imageUrl(img),
        alt: attr(img, "alt"),
      });
      if (media.length >= 12) break;
    }

    return media.slice(0, 12);
  }

  LIS.findPosts = function findPosts() {
    return document.querySelectorAll(POST_SELECTOR);
  };

  LIS.findPostFrom = function findPostFrom(el) {
    if (!el?.closest) return null;

    const container = el.closest(POST_CONTAINER_SELECTOR);
    if (container) return container;

    const direct = el.closest(
      "[data-urn*='urn:li:activity'], [data-id*='urn:li:activity']"
    );
    if (direct) return direct.closest(POST_CONTAINER_SELECTOR) || direct;

    let best = null;
    let bestScore = 0;
    let node = el.parentElement;
    for (let depth = 0; depth < 40 && node; depth++) {
      if (node === document.body || node === document.documentElement) break;
      const score = postScore(node);
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
      node = node.parentElement;
    }
    return best;
  };

  LIS.findPostNearPoint = function findPostNearPoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    for (const el of document.elementsFromPoint(x, y)) {
      const post = LIS.findPostFrom(el);
      if (post) return post;
    }

    let nearest = null;
    let best = Infinity;
    for (const post of fallbackCandidates()) {
      const r = post.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const score = dx * dx + dy * dy;
      if (score < best) {
        best = score;
        nearest = post;
      }
    }
    if (nearest && best < 250_000) return nearest;

    return LIS.findBestPostCandidate({
      getBoundingClientRect: () => ({
        left: x,
        right: x,
        top: y,
        bottom: y,
      }),
    });
  };

  LIS.getPostUrn = function getPostUrn(postEl) {
    const direct = getIdentity(postEl);
    if (direct) return direct;

    const inner = postEl?.querySelector?.(
      "[data-urn*='urn:li:activity'], [data-id*='urn:li:activity'], [data-id*='activity:']"
    );
    return getIdentity(inner);
  };

  LIS.extract = function extract(postEl) {
    const urn = LIS.getPostUrn(postEl);
    const url = urn
      ? `https://www.linkedin.com/feed/update/${urn}/`
      : location.href;

    const author =
      firstText(postEl, [
        ".update-components-actor__title",
        ".update-components-actor__name",
        ".update-components-actor__meta a span[dir]",
        ".feed-shared-actor__title",
      ]) || null;
    const authorHeadline =
      firstText(postEl, [
        ".update-components-actor__description",
        ".feed-shared-actor__description",
      ]) || null;
    const authorProfileUrl =
      firstHref(postEl, [
        ".update-components-actor a[href*='/in/']",
        ".update-components-actor a[href*='/company/']",
        ".feed-shared-actor a[href*='/in/']",
        ".feed-shared-actor a[href*='/company/']",
      ]) || null;
    const publishedText =
      firstText(postEl, [
        ".update-components-actor__sub-description",
        ".feed-shared-actor__sub-description",
        ".update-components-actor__sub-description span[aria-hidden='true']",
        "time",
      ]) || null;
    let text =
      firstText(postEl, [
        ".update-components-text",
        ".update-components-text .break-words",
        ".feed-shared-update-v2__description",
        ".feed-shared-update-v2__commentary",
        ".feed-shared-inline-show-more-text",
        ".update-components-update-v2__commentary",
        "[data-test-id='main-feed-activity-card__commentary']",
      ]) ||
      firstText(postEl, [
        ".feed-shared-article__description",
        ".update-components-image__image",
        ".update-components-linkedin-video",
      ]) ||
      "";

    if (!text) {
      const bits = [author, authorHeadline].filter(Boolean);
      text = bits.length ? `${PLACEHOLDER}\n${bits.join(" · ")}` : PLACEHOLDER;
    }

    const metadata = compactObject({
      urn,
      authorProfileUrl,
      publishedText,
      capturedAt: new Date().toISOString(),
      capturedFrom: location.href,
      socialCounts: extractSocialCounts(postEl),
    });
    const media = extractMedia(postEl);

    return { url, author, authorHeadline, text, urn, metadata, media };
  };
})();
