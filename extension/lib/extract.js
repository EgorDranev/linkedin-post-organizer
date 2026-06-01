// DOM scraping for LinkedIn feed posts. Selectors break when LinkedIn ships UI
// changes — update here first if capture returns empty fields.
(function () {
  const LIS = (globalThis.LIS = globalThis.LIS || {});

  const POST_SELECTOR =
    'div.feed-shared-update-v2[data-urn], div[data-urn^="urn:li:activity"]';

  const PLACEHOLDER = "[LinkedIn post — no text extracted]";

  function clean(el) {
    return el ? el.innerText.trim().replace(/\s+\n/g, "\n") : "";
  }

  LIS.findPosts = function findPosts() {
    return document.querySelectorAll(POST_SELECTOR);
  };

  LIS.findPostFrom = function findPostFrom(el) {
    if (!el?.closest) return null;
    return el.closest(
      "div.feed-shared-update-v2[data-urn], [data-urn^='urn:li:activity']"
    );
  };

  LIS.getPostUrn = function getPostUrn(postEl) {
    return postEl?.getAttribute("data-urn") || "";
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
