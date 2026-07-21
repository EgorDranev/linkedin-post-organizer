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

  function postUrlFromUrn(urn) {
    return urn ? `https://www.linkedin.com/feed/update/${urn}/` : "";
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

  LIS.isReliablePostCandidate = function isReliablePostCandidate(el) {
    if (!el?.querySelector) return false;
    if (getIdentity(el)) return true;
    if (
      el.matches?.(
        "div.feed-shared-update-v2, div.update-components-activity, .fie-impression-container, [data-view-name='feed-full-update']"
      )
    ) {
      return true;
    }

    const actor = el.querySelector(".update-components-actor, .feed-shared-actor");
    const commentary = el.querySelector(
      ".update-components-text, .feed-shared-inline-show-more-text, [data-test-id*='commentary'], [data-test-id*='post-content']"
    );
    const control = el.querySelector(
      ".feed-shared-control-menu__trigger, button[aria-label*='control menu' i], button[aria-label*='more actions' i]"
    );
    return Boolean(
      (actor && (commentary || control)) || (commentary && control)
    );
  };

  function postScore(el) {
    if (!looksLikePost(el)) return 0;
    let score = 1;
    if (getIdentity(el)) score += 4;
    if (
      el.querySelector(
        ".update-components-text, .feed-shared-inline-show-more-text, [data-test-id*='commentary'], [data-test-id*='post-content']"
      )
    ) {
      score += 3;
    }
    if (el.querySelector(".update-components-actor, .feed-shared-actor")) score += 2;
    if (el.querySelector(".feed-shared-control-menu__trigger")) score += 1;
    return score;
  }

  function contentSignalScore(el) {
    if (!el?.querySelector) return 0;
    let score = 0;
    const text = clean(el);
    if (getIdentity(el)) score += 8;
    if (el.matches?.("div.feed-shared-update-v2, div.update-components-activity, .fie-impression-container")) {
      score += 10;
    }
    if (el.querySelector(".update-components-actor, .feed-shared-actor")) score += 8;
    if (
      el.querySelector(
        ".update-components-text, .feed-shared-inline-show-more-text, [data-test-id*='commentary'], [data-test-id*='post-content'], .attributed-text-segment-list__content"
      )
    ) {
      score += 8;
    }
    if (el.querySelector(".feed-shared-control-menu__trigger, button[aria-label*='control menu' i], button[aria-label*='more actions' i]")) {
      score += 4;
    }
    if (el.querySelector(".social-details-social-counts, .social-details-social-actions")) {
      score += 2;
    }
    if (text.length > 80) score += 1;
    if (text.length > 350) score += 1;
    if (text.length > 5000) score -= 6;
    return score;
  }

  // How many distinct feed posts a subtree spans. Extraction assumes exactly
  // one — a root spanning two stitches one post's text onto a neighbor's image
  // and author. Reshare-safe: a reshare nests the original's activity urn inside
  // the outer post (so only the outermost identities count) and the embedded
  // original carries no ⋯ control menu of its own, so the obfuscated fallback
  // (one menu per real feed post, aria-label survives class obfuscation) stays 1
  // for reshares. Returns 1 when no marker is present — never over-splits.
  function postSpanCount(el) {
    if (!el?.querySelectorAll) return 1;
    const ids = [
      ...el.querySelectorAll(
        "[data-urn*='urn:li:activity'], [data-id*='urn:li:activity']"
      ),
    ];
    const roots = ids.filter((a) => !ids.some((b) => b !== a && b.contains(a)));
    if (roots.length) return roots.length;
    const menus = el.querySelectorAll(
      "button[aria-label*='control menu' i], button[aria-label*='more actions' i], .feed-shared-control-menu__trigger"
    ).length;
    return menus || 1;
  }

  function normalizePostRoot(el) {
    if (!el?.parentElement) return el || null;
    let best = el;
    let bestScore = contentSignalScore(el);
    let node = el.parentElement;

    for (let depth = 0; depth < 14 && node; depth++) {
      if (node === document.body || node === document.documentElement) break;
      const r = node.getBoundingClientRect?.();
      if (r && r.width > innerWidth * 0.98 && r.height > innerHeight * 1.4) break;
      // Climbing into a wrapper that holds a second post would merge two posts
      // into one record — stop at the largest single-post subtree.
      if (postSpanCount(node) > 1) break;

      const score = contentSignalScore(node);
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }

      if (
        node.matches?.("div.feed-shared-update-v2, div.update-components-activity, .fie-impression-container") &&
        score >= 16
      ) {
        break;
      }
      node = node.parentElement;
    }

    return best || el;
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
    // A wrapper spanning two posts (the "main div" catch-all is happy to match
    // one) must never win: extraction over it stitches one post's text onto a
    // neighbor's image. Prefer the single-post subtree nested inside it.
    if (postSpanCount(el) > 1) return 0;

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

  function canonicalPostUrl(value) {
    const url = canonicalLinkedInUrl(absoluteUrl(value));
    if (!url) return "";
    const urn = normalizeUrn(url);
    if (urn) return postUrlFromUrn(urn);

    try {
      const parsed = new URL(url, location.href);
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

  // The comments block (list + composer) lives INSIDE the update container, so
  // every extractor that scans the post root must skip it: the composer shows
  // the viewer's own avatar/name, and commenter text/links/images are not post
  // content. Comment module classes stay semantic ("comments-…") even on
  // builds that obfuscate feed component classes.
  const COMMENT_SCOPE = [
    "[class*='comments-']",
    ".feed-shared-update-v2__comments-container",
    ".ql-editor",
    "[contenteditable='true']",
    "[role='textbox']",
    "form",
  ].join(", ");

  function inCommentScope(el) {
    return Boolean(el?.closest?.(COMMENT_SCOPE));
  }

  // Self-referencing chrome that renders the VIEWER's name/avatar near or
  // inside post containers: global nav, the "start a post" share box, the feed
  // identity rail, messaging bubbles. Never a source of post authorship.
  const VIEWER_CHROME = [
    "header",
    "nav",
    "[role='banner']",
    "[role='navigation']",
    ".global-nav",
    ".share-box-feed-entry",
    ".feed-identity-module",
    ".msg-overlay-list-bubble",
    ".msg-overlay-bubble-header",
  ].join(", ");

  function inViewerChrome(el) {
    return Boolean(el?.closest?.(VIEWER_CHROME));
  }

  // The collapsed "Add a comment…" composer renders the VIEWER's avatar next to
  // a short prompt, but on class-obfuscated builds it carries none of the
  // comment/composer class markers COMMENT_SCOPE/VIEWER_CHROME look for. Its
  // one tell survives obfuscation: the prompt copy sitting beside the avatar.
  // Detecting it here means a headerless post never credits the viewer's
  // composer avatar as the author, even when the viewer's identity is unknown.
  // Bounded to a short container so a real post body that merely mentions
  // "add a comment" can't blank its own author.
  function looksLikeCommentComposer(link) {
    const container = link?.closest?.("div, li, form, section");
    if (!container) return false;
    const text = clean(container);
    if (!text || text.length > 80) return false;
    return /\badd a comment\b|\bjoin the conversation\b|\bleave a comment\b|\bcomment to join\b|\badd a reply\b/i.test(
      text
    );
  }

  function profileSlug(href) {
    return (
      String(href || "")
        .match(/\/in\/([^/?#]+)/i)?.[1]
        ?.toLowerCase() || ""
    );
  }

  function normalizedName(value) {
    return cleanLinkedInText(value).toLowerCase();
  }

  // Comment-scope exclusion is structural and misses surfaces where LinkedIn
  // drops the markers — e.g. the collapsed "Add a comment…" prompt on the
  // image viewer has no form/comments-* wrapper on class-obfuscated builds,
  // and its avatar link then reads as "the post author is the viewer". So
  // also learn who the viewer IS (global nav photo / identity rail) and let
  // extraction refuse to credit them from any fallback path.
  //
  // The live nav frequently CAN'T identify the viewer on obfuscated or non-feed
  // surfaces — exactly where the viewer used to leak in as the author. So the
  // identity is cached across pages: the content script seeds it from storage at
  // boot (LIS.primeViewerIdentity) and persists every fresh read
  // (LIS.onViewerIdentityResolved), so a page that can't see the viewer still
  // recognizes them from a page that could.
  let viewerCache = { name: "", slug: "" };

  // Boot seed from storage: fill only empty fields so it can never clobber a
  // fresher read the live nav already made this session (e.g. after an account
  // switch). The live refresh in getViewerIdentity overwrites on real change.
  LIS.primeViewerIdentity = function primeViewerIdentity(identity) {
    if (identity?.name && !viewerCache.name) viewerCache.name = String(identity.name);
    if (identity?.slug && !viewerCache.slug) viewerCache.slug = String(identity.slug);
  };

  // Test seam: clear the cross-page cache so cases don't bleed between tests.
  LIS.resetViewerIdentity = function resetViewerIdentity() {
    viewerCache = { name: "", slug: "" };
  };

  function readLiveViewerIdentity() {
    // Slug is the exact, reliable signal — but the nav photo's alt is often
    // nameless on real builds, and a single link selector misses just as often.
    // LinkedIn exposes the viewer's profile link in several places depending on
    // build/page: the feed identity rail, the global-nav "Me" menu (and its
    // dropdown), the "view profile" control, or the anchor wrapping the nav
    // photo. Try them all — the moment one resolves, the viewer guards can fire
    // even when no name is available anywhere.
    let slug = "";
    for (const selector of [
      ".feed-identity-module a[href*='/in/']",
      ".global-nav__me a[href*='/in/']",
      ".global-nav__me-content a[href*='/in/']",
      ".global-nav__me-dropdown a[href*='/in/']",
      "a[data-control-name='nav.settings_view_profile']",
      "a[data-control-name='identity_welcome_message']",
    ]) {
      slug = profileSlug(attr(document.querySelector(selector), "href"));
      if (slug) break;
    }
    if (!slug) {
      const photoLink = document
        .querySelector("img.global-nav__me-photo, .global-nav__me img")
        ?.closest?.("a[href*='/in/']");
      slug = profileSlug(attr(photoLink, "href"));
    }

    // Name is a softer signal (exact-match only) and the last resort when the
    // build exposes no profile link at all.
    let name = "";
    for (const photo of [
      document.querySelector("img.global-nav__me-photo, .global-nav__me img"),
      document.querySelector(".feed-identity-module img"),
    ]) {
      name = normalizedName(nameFromAvatarAlt(attr(photo, "alt")));
      if (name) break;
    }

    return { name, slug };
  }

  function getViewerIdentity() {
    const live = readLiveViewerIdentity();
    let changed = false;
    if (live.name && live.name !== viewerCache.name) {
      viewerCache.name = live.name;
      changed = true;
    }
    if (live.slug && live.slug !== viewerCache.slug) {
      viewerCache.slug = live.slug;
      changed = true;
    }
    // Persist only real changes so a stable page doesn't spam storage.
    if (changed) {
      LIS.onViewerIdentityResolved?.({
        name: viewerCache.name,
        slug: viewerCache.slug,
      });
    }
    return {
      name: live.name || viewerCache.name,
      slug: live.slug || viewerCache.slug,
    };
  }

  function isViewerLink(link, img) {
    if (!link && !img) return false;
    const viewer = getViewerIdentity();
    if (viewer.slug && profileSlug(attr(link, "href")) === viewer.slug) {
      return true;
    }
    if (!viewer.name) return false;
    return [
      nameFromAvatarAlt(attr(img, "alt")),
      cleanAuthor(attr(link, "aria-label")),
      link ? cleanAuthor(link) : "",
    ].some((name) => name && normalizedName(name) === viewer.name);
  }

  function isVisibleElement(el) {
    const r = el?.getBoundingClientRect?.();
    return !r || (r.width > 0 && r.height > 0);
  }

  function imageUrl(img) {
    const srcset = attr(img, "srcset") || attr(img, "data-srcset");
    const candidates = srcset
      .split(",")
      .map((part) => {
        const [url, size = ""] = part.trim().split(/\s+/);
        const width = Number(size.match(/(\d+)w/)?.[1] || 0);
        const scale = Number(size.match(/(\d+(?:\.\d+)?)x/)?.[1] || 0) * 1000;
        return { url, score: width || scale || 0 };
      })
      .filter((item) => item.url)
      .sort((a, b) => b.score - a.score);

    return absoluteUrl(
      candidates[0]?.url ||
        attr(img, "data-delayed-url") ||
        attr(img, "data-src") ||
        img?.currentSrc ||
        attr(img, "src")
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

  // The author's avatar is deliberately excluded from post media (isPostImage
  // filters out profile/avatar images), so capture it separately here. Works on
  // both feed posts and saved-list cards via their respective actor blocks.
  // LinkedIn obfuscates its component class names on some builds (e.g.
  // "_0128cd8b"), so anything scoped to .update-components-actor silently breaks.
  // The author's header link stays semantic, though: the first /in/ or /company/
  // anchor that wraps an avatar img. Its img alt carries the name
  // ("View <Name>’s profile" / "View company: <Name>"). This is the resilient
  // anchor for author, avatar, and profile URL when class selectors miss.
  function actorLinkIn(scope) {
    const links =
      scope?.querySelectorAll?.("a[href*='/in/'], a[href*='/company/']") || [];
    // The post author's avatar leads the post header (≈48px). Social-proof
    // reactors ("X loves this") sit above it but render small (≈24px), so the
    // first sizable avatar in DOM order is the author. Commenter/composer
    // avatars are just as large but come later — and the composer would match
    // the VIEWER's own profile — so comment scopes are skipped outright, and
    // any link resolving to the viewer only survives as a flagged last resort
    // (their own post's header vs. unmarked composer chrome is undecidable).
    let best = { link: null, img: null, size: -1 };
    let viewerBest = { link: null, img: null, size: -1, isViewer: true };
    for (const link of links) {
      if (inCommentScope(link) || inViewerChrome(link) || looksLikeCommentComposer(link)) continue;
      const img = link.querySelector("img");
      if (!img) continue;
      const r = img.getBoundingClientRect?.();
      const size = r ? Math.min(r.width, r.height) : 0;
      // Inside the named actor block the link IS the post header — trust it
      // even when it resolves to the viewer (their own post).
      const inActorBlock = link.closest(
        ".update-components-actor, .feed-shared-actor"
      );
      if (!inActorBlock && isViewerLink(link, img)) {
        if (size > viewerBest.size) {
          viewerBest = { link, img, size, isViewer: true };
        }
        continue;
      }
      if (size >= 32) return { link, img, size };
      if (size > best.size) best = { link, img, size };
    }
    return best.link ? best : viewerBest;
  }

  function nameFromAvatarAlt(alt) {
    const t = cleanLinkedInText(alt || "")
      .replace(/^view\s+/i, "")
      .replace(/^company:\s*/i, "")
      .replace(/[’']s\s+profile\s*$/i, "")
      .replace(/\s+profile\s*$/i, "")
      .replace(/^photo of\s+/i, "")
      .trim();
    // Generic alts on recommendation/sidebar avatars carry no name.
    return /^(?:company|profile)$/i.test(t) ? "" : t;
  }

  function extractAvatar(scope) {
    // The actor-block selectors are trusted: on the viewer's own posts they
    // legitimately resolve to the viewer's photo. The generic classes below
    // them also style the viewer's avatar in composer prompts, so the viewer
    // is rejected there.
    const actorSelectors = [
      ".update-components-actor__avatar img",
      ".update-components-actor__avatar-image",
      ".feed-shared-actor__avatar img",
      ".feed-shared-actor__avatar-image",
    ];
    const genericSelectors = [
      ".presence-entity__image",
      ".entity-result__universal-image img",
      ".entity-result__image img",
      ".ivm-view-attr__img--centered",
      "img[class*='EntityPhoto']",
    ];
    for (const [selectors, trusted] of [
      [actorSelectors, true],
      [genericSelectors, false],
    ]) {
      for (const selector of selectors) {
        for (const img of scope?.querySelectorAll?.(selector) || []) {
          // Presence/entity image classes also appear on commenter avatars —
          // only the post header's avatar counts.
          if (inCommentScope(img) || inViewerChrome(img)) continue;
          if (!trusted && isViewerLink(img.closest("a"), img)) continue;
          const url = imageUrl(img);
          // Skip lazy-load ghosts (data: placeholders) — only real CDN photos.
          if (url && /^https?:/i.test(url)) return url;
        }
      }
    }
    // Class-obfuscated builds: the avatar lives inside the actor header link.
    const actor = actorLinkIn(scope);
    if (actor.isViewer) return "";
    const url = imageUrl(actor.img);
    return url && /^https?:/i.test(url) ? url : "";
  }

  function isChromeText(text) {
    return /^(like|comment|repost|send|save|follow|connect|message|open|share|copy link|report|not interested|turn on notifications|view profile)$/i.test(
      text
    );
  }

  function isAttachmentTextNode(el) {
    return Boolean(
      el?.closest?.(
        [
          ".feed-shared-article",
          ".update-components-article",
          ".feed-shared-external-video",
          ".update-components-external-video",
          ".update-components-document",
          ".document-s-container",
          ".document-s-container__content",
          ".feed-shared-image",
          ".update-components-image",
          ".update-components-linkedin-video",
          ".feed-shared-linkedin-video",
          "[data-test-id*='document']",
          "[data-test-id*='attachment']",
          "[data-test-id*='article']",
        ].join(", ")
      )
    );
  }

  function extractPostText(postEl) {
    const selectors = [
      ".update-components-text",
      ".update-components-text .break-words",
      ".update-components-text span[aria-hidden='true']",
      ".feed-shared-update-v2__description",
      ".feed-shared-update-v2__commentary",
      ".feed-shared-inline-show-more-text",
      ".feed-shared-inline-show-more-text span[aria-hidden='true']",
      ".feed-shared-text",
      ".feed-shared-text span[aria-hidden='true']",
      ".update-components-update-v2__commentary",
      "[data-test-id='main-feed-activity-card__commentary']",
      "[data-test-id='post-content']",
      "[data-test-id='feed-shared-text']",
    ];

    const direct = uniqueTexts(
      selectors
        .map((selector) => postEl?.querySelector(selector))
        .filter((el) => el && !isAttachmentTextNode(el) && !inCommentScope(el))
        .map(clean)
    );
    if (direct.length) return direct[0];

    // On class-obfuscated builds isAttachmentTextNode can't see the video
    // player, whose captions/transcript would out-length the commentary and
    // win the fallback below. The player's top-level section within the post
    // is structural, not class-based: the ancestor of <video> that is a direct
    // child of the post root. Text inside it is never commentary.
    const videoSection = (() => {
      let node = postEl?.querySelector?.("video");
      if (!node) return null;
      while (node.parentElement && node.parentElement !== postEl) {
        node = node.parentElement;
      }
      return node.parentElement === postEl ? node : null;
    })();

    const scoped = [];
    const scopedInVideoSection = [];
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
      if (isAttachmentTextNode(el)) continue;
      if (inCommentScope(el)) continue;
      if (el.closest(".update-components-actor, .feed-shared-actor")) continue;
      if (el.closest(".feed-shared-social-action-bar, .social-details-social-actions")) continue;
      if (el.closest("[role='menu'], .artdeco-dropdown__content")) continue;
      const text = clean(el);
      if (text.length < 12 || isChromeText(text)) continue;
      if (videoSection && videoSection.contains(el)) {
        scopedInVideoSection.push(text);
        continue;
      }
      scoped.push(text);
    }

    // A video-only post (no commentary outside the player section) still
    // deserves its caption text over nothing at all.
    const pool = scoped.length ? scoped : scopedInVideoSection;
    const candidates = uniqueTexts(pool).sort((a, b) => b.length - a.length);
    return candidates[0] || "";
  }

  const ACTOR_SCOPE_SELECTOR = [
    ".update-components-actor",
    ".feed-shared-actor",
    "[data-test-id='main-feed-activity-card__actor']",
  ].join(", ");

  function actorScope(postEl) {
    return postEl?.matches?.(ACTOR_SCOPE_SELECTOR)
      ? postEl
      : postEl?.querySelector?.(ACTOR_SCOPE_SELECTOR);
  }

  function extractConnectionDegree(postEl) {
    const actor = actorScope(postEl);
    const text = cleanLinkedInText(clean(actor));
    return (
      text.match(/(?:^|[•·\s])((?:1st|2nd|3rd))(?:\b|$)/i)?.[1]?.toLowerCase() ||
      ""
    );
  }

  function extractAuthorAction(postEl) {
    const actor = actorScope(postEl);
    for (const link of actor?.querySelectorAll?.("a[href]") || []) {
      const url = canonicalLinkedInUrl(absoluteUrl(attr(link, "href")));
      const label = cleanLinkedInText(attr(link, "aria-label") || clean(link));
      if (!url || !/^https?:/i.test(url) || !label || isChromeText(label)) continue;
      if (/linkedin\.com\/(?:in|company|feed\/update)\//i.test(url)) continue;
      return { text: label.slice(0, 160), url };
    }
    return null;
  }

  function extractPublishedText(postEl) {
    const raw = firstText(postEl, [
      "time",
      ".update-components-actor__sub-description",
      ".feed-shared-actor__sub-description",
      ".update-components-actor__sub-description span[aria-hidden='true']",
    ]);
    return raw
      .replace(/visible to anyone on or off linkedin|public/gi, "")
      .replace(/[🌐🌎🌍🌏]/gu, "")
      .replace(/^[\s•·]+|[\s•·]+$/g, "")
      .trim();
  }

  function extractVisibility(postEl) {
    const actor = actorScope(postEl);
    const labels = [...(actor?.querySelectorAll?.("[aria-label], [title]") || [])]
      .map((el) => `${attr(el, "aria-label")} ${attr(el, "title")}`)
      .join(" ");
    const text = `${labels} ${clean(actor)}`;
    return /visible to anyone on or off linkedin|\bpublic\b|[🌐🌎🌍🌏]/iu.test(text)
      ? "public"
      : "";
  }

  function cleanAuthor(value) {
    const raw = value?.nodeType ? clean(value) : value;
    const text = cleanLinkedInText(raw)
      .replace(/\s+(?:View|Open)\s+.+?\s+profile.*$/i, "")
      .replace(/\b(?:View|Open)\s+(.+?)'?s?\s+profile\b/i, "$1")
      .replace(/\s+following\b/i, "")
      .replace(/\s*[•·]\s*(?:1st|2nd|3rd)\b.*$/i, "")
      .trim();
    return text.split("\n").map((line) => line.trim()).filter(Boolean)[0] || "";
  }

  function extractAuthor(postEl) {
    const selectors = [
      ".update-components-actor__title",
      ".update-components-actor__title span[aria-hidden='true']",
      ".update-components-actor__name",
      ".update-components-actor__meta a span[dir]",
      ".feed-shared-actor__title",
      ".feed-shared-actor__title span[aria-hidden='true']",
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

    // Class-obfuscated builds: read the name off the post's first profile
    // link — avatar alt ("View <Name>’s profile"), aria-label, or the link's
    // own text (the header name is a link even when the avatar is rendered as
    // a background div with no <img> to anchor on). Small-avatar links are
    // social-proof reactor chips, not the author. The viewer is never
    // accepted here: a headerless build can't tell their own post's header
    // from an unmarked comment prompt, and crediting every save to the viewer
    // is worse than leaving the author blank.
    for (const link of postEl?.querySelectorAll?.(
      "a[href*='/in/'], a[href*='/company/']"
    ) || []) {
      if (inCommentScope(link) || inViewerChrome(link) || looksLikeCommentComposer(link)) continue;
      const img = link.querySelector("img");
      if (img) {
        const r = img.getBoundingClientRect?.();
        if (r && Math.min(r.width, r.height) < 32) continue;
      }
      if (isViewerLink(link, img)) continue;
      const author =
        nameFromAvatarAlt(attr(img, "alt")) ||
        cleanAuthor(attr(link, "aria-label")) ||
        cleanAuthor(link);
      if (author && !isChromeText(author)) return author;
    }

    return "";
  }

  function likelyAuthorFromText(value) {
    const text = cleanLinkedInText(value)
      .replace(/\bView image\b/gi, " ")
      .replace(/\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?/gi, " ")
      .replace(/\b(?:Interview Tips|Write article|Visit my website|Book an appointment)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const titleAuthor = text.match(
      /\b(?:Questions\s+and\s+Answers|Interview\s+Questions|Answers)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/
    )?.[1];
    if (titleAuthor) return titleAuthor;

    const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g) || [];
    const banned = new Set([
      "View Image",
      "Interview Questions",
      "Interview Tips",
      "Toughest Interview",
      "Linkedin Post",
    ]);

    for (const match of matches) {
      if (banned.has(match)) continue;
      if (/^(?:Co|Founder|Agreement|Template|Startup|Toughest|Interview|Questions|Answers)\b/.test(match)) {
        continue;
      }
      return match;
    }

    return "";
  }

  function fallbackAuthorFromCapture(text, media) {
    for (const item of media || []) {
      const author = likelyAuthorFromText(
        [item.title, item.alt, item.description].filter(Boolean).join(" ")
      );
      if (author) return author;
    }
    return likelyAuthorFromText(text);
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
      if (inCommentScope(a)) continue;
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

  function fallbackTextFromAttachments(media, links) {
    const lines = [];
    for (const item of media || []) {
      if (item.title) lines.push(item.title);
      if (item.description) lines.push(item.description);
      if (!item.title && item.alt && !/^(image|video)$/i.test(item.alt)) {
        lines.push(item.alt);
      }
    }
    for (const item of links || []) {
      if (item.text && !/^linkedin\.com$/i.test(item.text)) lines.push(item.text);
    }
    return uniqueTexts(lines).join("\n").trim();
  }

  // A count must start with a digit — "[\d,.]+" alone also matches a lone "."
  // or ",", which then rendered as a bogus stat on the card.
  const COUNT_SRC = "\\d[\\d,.]*\\s*[KkMm]?";

  function countIn(text) {
    return text.match(new RegExp(`(${COUNT_SRC})`))?.[1]?.trim() || "";
  }

  function extractSocialCounts(postEl) {
    const counts = {};
    const text = clean(postEl);

    // Extract likes/reactions using multiple methods
    const reactions = text.match(new RegExp(`(${COUNT_SRC})\\s+(?:reaction|like)`));
    if (reactions) counts.reactions = reactions[1].trim();

    // Look for like counts in elements
    const likeElements = postEl.querySelectorAll('.social-details-social-counts__item, .social-counts, .react-button__reactors-count, [data-test-id*="like-count"]');
    for (const element of likeElements) {
      const count = countIn(clean(element));
      if (count) {
        counts.reactions = count;
        break;
      }
    }

    // Extract comments
    const comments = text.match(new RegExp(`(${COUNT_SRC})\\s+comment`));
    if (comments) counts.comments = comments[1].trim();

    // Look for comment counts in elements
    const commentElements = postEl.querySelectorAll('.comments-button, .social-details-social-counts__comments, [data-test-id*="comment-count"]');
    for (const element of commentElements) {
      const count = countIn(clean(element));
      if (count) {
        counts.comments = count;
        break;
      }
    }

    // Extract reposts/shares
    const reposts = text.match(new RegExp(`(${COUNT_SRC})\\s+(?:repost|share)`));
    if (reposts) counts.reposts = reposts[1].trim();

    // Look for share counts in elements
    const shareElements = postEl.querySelectorAll('.social-details-social-counts__reshares, [data-test-id*="repost-count"]');
    for (const element of shareElements) {
      const count = countIn(clean(element));
      if (count) {
        counts.reposts = count;
        break;
      }
    }

    return counts;
  }

  function extractHashtagsAndMentions(text) {
    const hashtags = text.match(/#[a-zA-Z0-9_]+/g) || [];
    const mentions = text.match(/@[a-zA-Z0-9_]+/g) || [];
    return {
      hashtags: [...new Set(hashtags)].map(tag => tag.toLowerCase()), // Remove duplicates
      mentions: [...new Set(mentions)].map(mention => mention.toLowerCase()) // Remove duplicates
    };
  }

  function matchesAny(el, selectors) {
    const sel = selectors.join(", ");
    return Boolean(el?.matches?.(sel) || el?.querySelector?.(sel));
  }

  // True only for genuine reposts (quote or no-comment), not occasion cards.
  function isReshare(postEl) {
    if (!postEl?.querySelector) return false;

    // Quote repost: a second update container nested inside the outer one.
    if (
      postEl.querySelector(".feed-shared-update-v2 .feed-shared-update-v2") ||
      postEl.querySelector(".update-components-update-v2 .update-components-update-v2")
    ) {
      return true;
    }

    // Repost without comment: original wrapped in a mini-update that still
    // carries the original author's actor. Occasion/celebration cards reuse the
    // mini-update shell but are not reshares — exclude them.
    const mini = postEl.querySelector(
      ".update-components-mini-update-v2, .feed-shared-mini-update-v2"
    );
    if (
      mini &&
      !mini.matches(
        ".update-components-mini-update-v2--occasion, .feed-shared-mini-update-v2--occasion"
      ) &&
      mini.querySelector(".update-components-actor, .feed-shared-actor")
    ) {
      return true;
    }

    return false;
  }

  // A content image the post itself attached — not an article/document thumbnail
  // and not an avatar inside the actor block.
  function hasContentImage(postEl) {
    if (matchesAny(postEl, [".feed-shared-image", ".update-components-image"])) {
      return true;
    }
    for (const img of postEl?.querySelectorAll?.("img") || []) {
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
  }

  function hasArticleCard(postEl) {
    return matchesAny(postEl, [
      ".feed-shared-article",
      ".update-components-article",
    ]);
  }

  // Ordered most-specific → least-specific; first matching rule wins. Reshare is
  // checked first so a repost is classified by its structure, not its payload.
  const POST_TYPE_RULES = [
    ["reshare", isReshare],
    [
      "poll",
      (el) =>
        matchesAny(el, [
          ".feed-shared-poll",
          ".update-components-poll",
          "[data-test-id*='poll' i]",
        ]),
    ],
    [
      "celebration",
      (el) =>
        matchesAny(el, [
          ".feed-shared-celebration",
          ".update-components-celebration",
          ".feed-shared-occasion",
          ".update-components-occasion",
          ".update-components-mini-update-v2--occasion",
          ".feed-shared-mini-update-v2--occasion",
        ]),
    ],
    [
      "event",
      (el) =>
        matchesAny(el, [
          ".feed-shared-event",
          ".update-components-event",
          ".feed-shared-update-v2__content--event",
        ]),
    ],
    [
      "newsletter",
      (el) =>
        matchesAny(el, [
          ".feed-shared-newsletter",
          ".update-components-newsletter",
          ".update-components-article--newsletter",
        ]),
    ],
    [
      "document",
      (el) =>
        matchesAny(el, [
          ".update-components-document",
          ".feed-shared-document",
          ".document-s-container",
          "[data-test-id*='document' i]",
        ]),
    ],
    [
      "external_video",
      (el) =>
        matchesAny(el, [
          ".feed-shared-external-video",
          ".update-components-external-video",
          "iframe[src*='youtube.com']",
          "iframe[src*='youtu.be']",
          "iframe[src*='vimeo.com']",
        ]),
    ],
    [
      "video",
      (el) =>
        matchesAny(el, [
          "video",
          ".feed-shared-linkedin-video",
          ".update-components-linkedin-video",
        ]),
    ],
    ["image_with_article", (el) => hasArticleCard(el) && hasContentImage(el)],
    ["article", (el) => hasArticleCard(el)],
    ["image", (el) => hasContentImage(el)],
  ];

  function extractPostType(postEl) {
    if (!postEl) return "text";
    for (const [type, test] of POST_TYPE_RULES) {
      try {
        if (test(postEl)) return type;
      } catch {
        /* a single rule failing must not break classification */
      }
    }
    // No structural rule matched (obfuscated classes) — let the captured media
    // speak: a video item means a video post, images mean a photo post.
    const media = extractMedia(postEl);
    if (media.some((item) => item.type === "video")) return "video";
    if (media.some((item) => item.type === "image")) return "image";
    if (media.length > 0) return "media";
    return "text";
  }

  function extractPublishedDate(postEl) {
    // Try to find time element with datetime attribute
    const timeEl = postEl.querySelector('time');
    if (timeEl) {
      const dateTime = timeEl.getAttribute('datetime');
      if (dateTime) {
        return new Date(dateTime).toISOString();
      }
      
      // If no datetime attribute, try to parse the text content
      const timeText = clean(timeEl);
      if (timeText) {
        // Attempt to parse common LinkedIn time formats
        const date = parseLinkedInTime(timeText);
        if (date) {
          return date.toISOString();
        }
      }
    }
    
    // Look for published text in other common locations
    const pubSelectors = [
      '.update-components-actor__sub-description',
      '.feed-shared-actor__sub-description',
      '.update-components-actor__sub-description span[aria-hidden="true"]'
    ];
    
    for (const selector of pubSelectors) {
      const pubEl = postEl.querySelector(selector);
      if (pubEl) {
        const pubText = clean(pubEl);
        if (pubText) {
          const date = parseLinkedInTime(pubText);
          if (date) {
            return date.toISOString();
          }
        }
      }
    }
    
    return null;
  }

  function parseLinkedInTime(timeText) {
    // Handle relative times like "2mo ago", "3d ago", etc.
    const relativeTimeRegex = /(\d+)\s*(sec|min|h|d|w|mo|yr)\s*ago/;
    const relativeMatch = timeText.match(relativeTimeRegex);
    
    if (relativeMatch) {
      const [, amount, unit] = relativeMatch;
      const num = parseInt(amount, 10);
      const now = new Date();
      
      switch(unit) {
        case 'sec':
          now.setSeconds(now.getSeconds() - num);
          break;
        case 'min':
          now.setMinutes(now.getMinutes() - num);
          break;
        case 'h':
          now.setHours(now.getHours() - num);
          break;
        case 'd':
          now.setDate(now.getDate() - num);
          break;
        case 'w':
          now.setDate(now.getDate() - (num * 7));
          break;
        case 'mo':
          now.setMonth(now.getMonth() - num);
          break;
        case 'yr':
          now.setFullYear(now.getFullYear() - num);
          break;
      }
      
      return now;
    }
    
    // Handle absolute dates like "Jan 15, 2023"
    const absoluteTimeRegex = /[A-Za-z]{3}\s+\d{1,2},\s+\d{4}/;
    const absoluteMatch = timeText.match(absoluteTimeRegex);
    
    if (absoluteMatch) {
      return new Date(absoluteMatch[0]);
    }
    
    // Handle other formats as needed
    return null;
  }

  function extractCompanyInfo(postEl) {
    // Look for company/organization information in the author section
    const companySelectors = [
      '.update-components-actor__description',
      '.feed-shared-actor__description',
      '.entity-result__secondary-subtitle',
      '.update-components-actor__sub-description'
    ];
    
    for (const selector of companySelectors) {
      const companyEl = postEl.querySelector(selector);
      if (companyEl) {
        const text = clean(companyEl);
        // Skip if it's a date/time string (likely publication info instead of company)
        if (!/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text)) {
          // Extract company name if it follows typical patterns
          if (text && !/^\d+[a-z]*\s+(?:mo|d|yr)\s+ago$/i.test(text)) {
            return text;
          }
        }
      }
    }
    
    return null;
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

    // External embeds without a recognizable card class still leave a YouTube
    // URL in an iframe or anchor — enough to save a playable link plus a real
    // thumbnail (YouTube's thumbnail URLs are derivable from the video id).
    for (const embed of postEl?.querySelectorAll?.(
      "iframe[src], a[href*='youtube.com'], a[href*='youtu.be']"
    ) || []) {
      if (inCommentScope(embed)) continue;
      const url = canonicalLinkedInUrl(
        absoluteUrl(attr(embed, "src") || attr(embed, "href"))
      );
      const thumbnailUrl = youtubeThumbnail(url);
      if (!thumbnailUrl) continue;
      pushUniqueMedia(media, seen, {
        type: "video",
        url,
        thumbnailUrl,
        title: cleanLinkedInText(attr(embed, "title") || attr(embed, "aria-label")),
        provider: "YouTube",
      });
    }

    for (const video of postEl?.querySelectorAll?.("video") || []) {
      pushUniqueMedia(media, seen, {
        type: "video",
        url: absoluteUrl(attr(video, "src")),
        thumbnailUrl: videoPoster(video, postEl),
        title: cleanLinkedInText(attr(video, "aria-label")),
      });
    }

    for (const img of postEl?.querySelectorAll?.("img") || []) {
      if (inCommentScope(img)) continue;
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

  function youtubeThumbnail(url) {
    const id = String(url || "").match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i
    )?.[1];
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
  }

  function styleBackgroundUrl(el) {
    const m = attr(el, "style").match(/background-image:\s*url\(["']?(.+?)["']?\)/i);
    return m ? absoluteUrl(m[1]) : "";
  }

  // LinkedIn's player often omits the poster attribute; the frame image then
  // lives on a sibling (video.js poster div or a plain <img> overlay) inside
  // the player container.
  function videoPoster(video, postEl) {
    const direct = absoluteUrl(attr(video, "poster") || attr(video, "data-poster"));
    if (direct) return direct;

    let container = video;
    while (
      container.parentElement &&
      container.parentElement !== postEl &&
      !container.querySelector("img, .vjs-poster, [style*='background-image']")
    ) {
      container = container.parentElement;
    }

    const posterEl = container.querySelector(".vjs-poster, [style*='background-image']");
    const fromStyle = styleBackgroundUrl(posterEl);
    if (fromStyle) return fromStyle;

    for (const img of container.querySelectorAll("img")) {
      const url = imageUrl(img);
      if (url && /^https?:/i.test(url) && isPostImage(img)) return url;
    }
    return "";
  }

  function findPostUrlIn(el) {
    const direct = normalizeUrn(
      `${attr(el, "data-urn")} ${attr(el, "data-id")} ${attr(el, "href")}`
    );
    if (direct) return postUrlFromUrn(direct);

    for (const a of el?.querySelectorAll?.("a[href]") || []) {
      const url = canonicalPostUrl(attr(a, "href"));
      if (/\/feed\/update\/urn:li:activity:\d+\/?/i.test(url)) return url;
    }

    return "";
  }

  function savedItemCardFor(link) {
    const selectors = [
      "li",
      ".reusable-search__result-container",
      ".entity-result",
      ".artdeco-list__item",
      "[data-view-name]",
    ];
    for (const selector of selectors) {
      const card = link.closest?.(selector);
      if (card && findPostUrlIn(card)) return card;
    }
    return link.closest?.("div") || link;
  }

  function cleanSavedText(card) {
    const lines = clean(card)
      .split("\n")
      .map((line) => cleanLinkedInText(line))
      .filter(Boolean)
      .filter((line) => !isChromeText(line))
      .filter((line) => !/^(all|articles|saved posts|my items)$/i.test(line));

    const deduped = uniqueTexts(lines);
    const text = deduped.slice(1).join("\n").trim() || deduped.join("\n").trim();
    return text || "";
  }

  function extractSavedAuthor(card) {
    // Named title/actor classes are trusted (a saved card headed by the
    // viewer means it IS the viewer's post). The bare profile-link fallbacks
    // are not — they'd read the viewer off composer/chrome leftovers.
    for (const selector of [
      ".entity-result__title-text",
      ".entity-result__title",
      ".update-components-actor__title",
      ".feed-shared-actor__title",
    ]) {
      const author = cleanAuthor(card.querySelector(selector));
      if (author) return author;
    }
    for (const selector of [
      "a[href*='/in/'] span[aria-hidden='true']",
      "a[href*='/company/'] span[aria-hidden='true']",
      "a[href*='/in/']",
      "a[href*='/company/']",
    ]) {
      for (const el of card.querySelectorAll(selector)) {
        const link = el.closest("a");
        if (inCommentScope(el) || inViewerChrome(el)) continue;
        if (isViewerLink(link, link?.querySelector?.("img"))) continue;
        const author = cleanAuthor(el);
        if (author) return author;
      }
    }
    return "";
  }

  // First profile link that isn't comment/viewer chrome and isn't the viewer
  // themselves — a viewer URL here would later be re-derived into the viewer's
  // name by the UI when the author is missing.
  function firstAuthorHref(scope) {
    for (const a of scope?.querySelectorAll?.(
      "a[href*='/in/'], a[href*='/company/']"
    ) || []) {
      if (inCommentScope(a) || inViewerChrome(a) || looksLikeCommentComposer(a)) continue;
      const img = a.querySelector("img");
      if (img) {
        const r = img.getBoundingClientRect?.();
        // Small avatars are social-proof reactor chips, not the author.
        if (r && Math.min(r.width, r.height) < 32) continue;
      }
      if (isViewerLink(a, img)) continue;
      const url = absoluteUrl(attr(a, "href"));
      if (url) return url;
    }
    return "";
  }

  LIS.canonicalPostUrl = canonicalPostUrl;

  LIS.findPosts = function findPosts() {
    return document.querySelectorAll(POST_SELECTOR);
  };

  LIS.findPostFrom = function findPostFrom(el) {
    if (!el?.closest) return null;

    const direct = el.closest(
      "[data-urn*='urn:li:activity'], [data-id*='urn:li:activity']"
    );
    if (direct) return normalizePostRoot(direct.closest(POST_CONTAINER_SELECTOR) || direct);

    const container = el.closest(POST_CONTAINER_SELECTOR);
    if (container) return normalizePostRoot(container);

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
    return normalizePostRoot(best);
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

  LIS.findSavedPostItems = function findSavedPostItems() {
    const seen = new Set();
    const items = [];
    for (const link of document.querySelectorAll(
      "a[href*='/feed/update/urn:li:activity'], a[href*='urn:li:activity']"
    )) {
      const url = canonicalPostUrl(attr(link, "href"));
      if (!url || seen.has(url)) continue;
      const card = savedItemCardFor(link);
      if (!card) continue;
      seen.add(url);
      items.push({ url, card });
    }
    return items;
  };

  LIS.extractSavedItem = function extractSavedItem(item) {
    const card = item.card || item;
    const url = item.url || findPostUrlIn(card);
    const urn = normalizeUrn(url);
    const author = extractSavedAuthor(card) || null;
    const authorHeadline =
      firstText(card, [
        ".entity-result__primary-subtitle",
        ".entity-result__secondary-subtitle",
        ".update-components-actor__description",
        ".feed-shared-actor__description",
      ]) || null;
    const media = extractMedia(card);
    const links = extractLinks(card, url);
    const text =
      extractPostText(card) ||
      cleanSavedText(card) ||
      fallbackTextFromAttachments(media, links) ||
      PLACEHOLDER;
    const fallbackAuthor = fallbackAuthorFromCapture(text, media);
    const metadata = compactObject({
      urn,
      authorProfileUrl: firstAuthorHref(card) || null,
      authorImage: extractAvatar(card) || null,
      links,
      capturedAt: new Date().toISOString(),
      capturedFrom: location.href,
      importedFromSavedPosts: true,
    });

    return {
      url,
      author: author || fallbackAuthor || null,
      authorHeadline,
      text,
      metadata,
      media,
    };
  };

  LIS.extract = function extract(postEl) {
    postEl = normalizePostRoot(postEl);
    const urn = LIS.getPostUrn(postEl);
    const url = urn ? postUrlFromUrn(urn) : null;

    const author = extractAuthor(postEl) || null;
    const authorHeadline =
      firstText(postEl, [
        ".update-components-actor__description",
        ".feed-shared-actor__description",
      ]) || null;
    const actorLink = actorLinkIn(postEl);
    let authorProfileUrl =
      firstHref(postEl, [
        ".update-components-actor a[href*='/in/']",
        ".update-components-actor a[href*='/company/']",
        ".feed-shared-actor a[href*='/in/']",
        ".feed-shared-actor a[href*='/company/']",
      ]) ||
      // The viewer-flagged fallback link would resurface as the author in the
      // UI (names get derived from profile URLs) — drop it instead.
      (actorLink.isViewer
        ? ""
        : absoluteUrl(actorLink.link?.getAttribute("href"))) ||
      // Header link whose avatar isn't an <img> (background-div builds):
      // first sizable, non-viewer profile link in DOM order.
      firstAuthorHref(postEl) ||
      null;
    let authorImage = extractAvatar(postEl);

    // Name, profile URL, and avatar must describe the SAME person. These come
    // from independent scans that can diverge on headerless or multi-post
    // captures — e.g. the name resolves to nobody while a separate scan lands
    // on the viewer's composer avatar/link. When no author name survived, a
    // stray profile URL or avatar would be re-derived into the viewer's name by
    // the web app (deriveAuthor → nameFromProfileUrl), so blank them together.
    if (!author) {
      authorProfileUrl = null;
      authorImage = "";
    }
    const publishedText = extractPublishedText(postEl) || null;
    let text =
      extractPostText(postEl) ||
      firstText(postEl, [
        ".feed-shared-article__description",
        ".update-components-image__image",
        ".update-components-linkedin-video",
      ]) ||
      "";

    const postUrl = url || location.href;
    const media = extractMedia(postEl);
    const links = extractLinks(postEl, postUrl);

    if (!text) {
      text = fallbackTextFromAttachments(media, links);
    }

    if (!text) {
      const bits = [author, authorHeadline].filter(Boolean);
      text = bits.length ? `${PLACEHOLDER}\n${bits.join(" · ")}` : PLACEHOLDER;
    }

    // Extract new metadata fields
    const publishedDate = extractPublishedDate(postEl);
    const hashtagsAndMentions = extractHashtagsAndMentions(text);
    const postType = extractPostType(postEl);
    const companyInfo = extractCompanyInfo(postEl);
    const socialCounts = extractSocialCounts(postEl);

    const metadata = compactObject({
      urn,
      authorProfileUrl,
      authorImage,
      connectionDegree: extractConnectionDegree(postEl) || null,
      authorAction: extractAuthorAction(postEl),
      publishedText,
      publishedDate,
      visibility: extractVisibility(postEl) || null,
      links,
      capturedAt: new Date().toISOString(),
      capturedFrom: location.href,
      socialCounts,
      postType,
      companyInfo,
      hashtags: hashtagsAndMentions.hashtags,
      mentions: hashtagsAndMentions.mentions,
    });

    return { url, author, authorHeadline, text, urn, metadata, media };
  };
})();
