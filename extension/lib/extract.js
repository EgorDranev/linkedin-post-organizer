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

  function cleanText(value) {
    return String(value || "")
      .trim()
      .replace(/\s+\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n");
  }

  function cleanLinkedInText(value) {
    return cleanText(value)
      .replace(/\bsee more\b/gi, "")
      .replace(/\bshow more\b/gi, "")
      .trim();
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

  function uniqueTexts(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
      const text = cleanLinkedInText(value);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  }

  function absoluteUrl(value) {
    if (!value) return "";
    try {
      return new URL(value, location.href).href;
    } catch {
      return "";
    }
  }

  function canonicalLinkedInUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url, location.href);
      if (
        /(^|\.)linkedin\.com$/i.test(parsed.hostname) &&
        parsed.pathname === "/redir/redirect"
      ) {
        return parsed.searchParams.get("url") || parsed.href;
      }
      parsed.hash = "";
      return parsed.href;
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

  function isVisibleElement(el) {
    const r = el?.getBoundingClientRect?.();
    return !r || (r.width > 0 && r.height > 0);
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
    if (r && r.width >= 150 && r.height >= 90) return true;
    const label = [attr(img, "alt"), attr(img, "class"), attr(img.closest?.("a"), "class")]
      .join(" ")
      .toLowerCase();
    return !/(profile|avatar|emoji|logo|icon)/.test(label);
  }

  function isChromeText(text) {
    return /^(like|comment|repost|send|save|follow|connect|message|open|share|copy link|report|not interested|turn on notifications|view profile)$/i.test(
      text
    );
  }

  function extractPostText(postEl) {
    const selectors = [
      ".update-components-text",
      ".update-components-text .break-words",
      ".feed-shared-update-v2__description",
      ".feed-shared-update-v2__commentary",
      ".feed-shared-inline-show-more-text",
      ".update-components-update-v2__commentary",
      "[data-test-id='main-feed-activity-card__commentary']",
      "[data-test-id='post-content']",
      "[data-test-id='feed-shared-text']",
    ];

    const direct = uniqueTexts(selectors.map((selector) => clean(postEl?.querySelector(selector))));
    if (direct.length) return direct[0];

    const scoped = [];
    for (const el of postEl?.querySelectorAll?.(
      [
        "[data-test-id*='commentary']",
        "[data-test-id*='post-content']",
        ".break-words",
        "div[dir='auto']",
        "span[dir='auto']",
      ].join(", ")
    ) || []) {
      if (!isVisibleElement(el)) continue;
      if (el.closest(".update-components-actor, .feed-shared-actor")) continue;
      if (el.closest(".feed-shared-social-action-bar, .social-details-social-actions")) continue;
      if (el.closest("[role='menu'], .artdeco-dropdown__content")) continue;
      const text = clean(el);
      if (text.length < 12 || isChromeText(text)) continue;
      scoped.push(text);
    }

    const candidates = uniqueTexts(scoped).sort((a, b) => b.length - a.length);
    return candidates[0] || "";
  }

  function cleanAuthor(value) {
    const raw = value?.nodeType ? clean(value) : value;
    const text = cleanLinkedInText(raw)
      .replace(/\s+(?:View|Open)\s+.+?\s+profile.*$/i, "")
      .replace(/\b(?:View|Open)\s+(.+?)'?s?\s+profile\b/i, "$1")
      .replace(/\s+following\b/i, "")
      .trim();
    return text.split("\n").map((line) => line.trim()).filter(Boolean)[0] || "";
  }

  function extractAuthor(postEl) {
    const selectors = [
      ".update-components-actor__title",
      ".update-components-actor__name",
      ".update-components-actor__meta a span[dir]",
      ".feed-shared-actor__title",
      ".feed-shared-actor__name",
      "[data-test-id='main-feed-activity-card__actor-name']",
    ];
    for (const selector of selectors) {
      const author = cleanAuthor(postEl?.querySelector(selector));
      if (author) return author;
    }

    for (const link of postEl?.querySelectorAll?.(
      ".update-components-actor a[href*='/in/'], .update-components-actor a[href*='/company/'], .feed-shared-actor a[href*='/in/'], .feed-shared-actor a[href*='/company/']"
    ) || []) {
      const aria = attr(link, "aria-label");
      const author = cleanAuthor(aria || clean(link));
      if (author) return author;
    }

    return "";
  }

  function isUsefulLink(url, postUrl) {
    if (!url || url.startsWith("javascript:") || url.startsWith("mailto:")) return false;
    try {
      const parsed = new URL(url);
      if (postUrl && parsed.href === postUrl) return false;
      if (!/^https?:$/i.test(parsed.protocol)) return false;
      const path = parsed.pathname;
      if (/(\/mynetwork\/|\/notifications\/|\/jobs\/)/i.test(path)) {
        return false;
      }
      if (/(miniProfile|lipi|trackingId|trk=|commentUrn|reactionType)/i.test(url)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function extractLinks(postEl, postUrl) {
    const links = [];
    const seen = new Set();
    for (const a of postEl?.querySelectorAll?.("a[href]") || []) {
      if (!isVisibleElement(a)) continue;
      if (a.closest(".update-components-actor, .feed-shared-actor")) continue;
      if (a.closest(".feed-shared-social-action-bar, .social-details-social-actions")) continue;
      if (a.closest("[role='menu'], .artdeco-dropdown__content")) continue;
      const url = canonicalLinkedInUrl(absoluteUrl(attr(a, "href")));
      if (!isUsefulLink(url, postUrl)) continue;
      const label = cleanLinkedInText(attr(a, "aria-label") || clean(a));
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(
        compactObject({
          url,
          text: label && !isChromeText(label) ? label.slice(0, 160) : "",
        })
      );
      if (links.length >= 12) break;
    }
    return links;
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
      : null;

    const author = extractAuthor(postEl) || null;
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
      extractPostText(postEl) ||
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

    const postUrl = url || location.href;
    const metadata = compactObject({
      urn,
      authorProfileUrl,
      publishedText,
      links: extractLinks(postEl, postUrl),
      capturedAt: new Date().toISOString(),
      capturedFrom: location.href,
      socialCounts: extractSocialCounts(postEl),
    });
    const media = extractMedia(postEl);

    return { url, author, authorHeadline, text, urn, metadata, media };
  };
})();
