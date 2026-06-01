// DOM scraping for LinkedIn feed posts. Selectors break when LinkedIn ships UI
// changes — update here first if capture returns empty fields.
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});

  const POST_SELECTOR = [
    "div.feed-shared-update-v2[data-urn]",
    "div.feed-shared-update-v2",
    "[data-urn^='urn:li:activity']",
    "[data-urn*='urn:li:activity:']",
    "[data-id^='urn:li:activity']",
  ].join(", ");

  const PLACEHOLDER = "[LinkedIn post — no text extracted]";

  function clean(el) {
    return el ? el.innerText.trim().replace(/\s+\n/g, "\n") : "";
  }

  LIS.findPosts = function findPosts() {
    return document.querySelectorAll(
      "div.feed-shared-update-v2, [data-urn^='urn:li:activity']"
    );
  };

  LIS.findPostFrom = function findPostFrom(el) {
    if (!el?.closest) return null;

    const direct = el.closest(POST_SELECTOR);
    if (direct) return direct;

    let node = el.parentElement;
    for (let depth = 0; depth < 25 && node; depth++) {
      if (node.classList?.contains("feed-shared-update-v2")) return node;
      const urn = node.getAttribute?.("data-urn") || "";
      if (urn.includes("urn:li:activity")) return node;
      node = node.parentElement;
    }
    return null;
  };

  LIS.getPostUrn = function getPostUrn(postEl) {
    const direct = postEl?.getAttribute("data-urn") || "";
    if (direct.includes("activity")) return direct;
    const inner = postEl?.querySelector?.("[data-urn*='urn:li:activity']");
    return inner?.getAttribute("data-urn") || direct;
  };

  LIS.extract = function extract(postEl) {
    const urn = LIS.getPostUrn(postEl);
    const url = urn
      ? `https://www.linkedin.com/feed/update/${urn}/`
      : location.href;

    const authorEl = postEl.querySelector(
      ".update-components-actor__title, .update-components-actor__name, .update-components-actor__meta a span[dir]"
    );
    const headlineEl = postEl.querySelector(
      ".update-components-actor__description"
    );
    const textEl = postEl.querySelector(
      ".update-components-text, .feed-shared-update-v2__description, .feed-shared-inline-show-more-text, .update-components-update-v2__commentary"
    );

    const author = clean(authorEl) || null;
    const authorHeadline = clean(headlineEl) || null;
    let text =
      clean(textEl) ||
      clean(
        postEl.querySelector(
          ".feed-shared-article__description, .update-components-image__image, .update-components-linkedin-video"
        )
      ) ||
      "";

    if (!text) {
      const bits = [author, authorHeadline].filter(Boolean);
      text = bits.length ? `${PLACEHOLDER}\n${bits.join(" · ")}` : PLACEHOLDER;
    }

    return { url, author, authorHeadline, text, urn };
  };
})();
