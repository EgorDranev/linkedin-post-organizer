// Injects a "Save" button into each LinkedIn post and ships the scraped
// content to the local app via the background service worker.
//
// NOTE: LinkedIn's DOM/class names change often. Selectors here are
// best-effort with fallbacks; if capture breaks, update the selectors below.

const BTN_FLAG = "data-lis-button";

function findPosts() {
  // Feed updates carry a data-urn like "urn:li:activity:123…".
  return document.querySelectorAll(
    'div.feed-shared-update-v2[data-urn], div[data-urn^="urn:li:activity"]'
  );
}

function extract(postEl) {
  const urn = postEl.getAttribute("data-urn") || "";
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
    ".update-components-text, .feed-shared-update-v2__description, .feed-shared-inline-show-more-text"
  );

  const clean = (el) => (el ? el.innerText.trim().replace(/\s+\n/g, "\n") : "");

  return {
    url,
    author: clean(authorEl) || null,
    authorHeadline: clean(headlineEl) || null,
    text: clean(textEl) || clean(postEl),
  };
}

function makeButton(postEl) {
  const btn = document.createElement("button");
  btn.className = "lis-save-btn";
  btn.textContent = "💾 Save";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = extract(postEl);
    if (!payload.text) {
      setState(btn, "empty");
      return;
    }
    setState(btn, "saving");
    chrome.runtime.sendMessage({ type: "save-post", payload }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) {
        setState(btn, "error");
      } else {
        setState(btn, resp.post.duplicate ? "dup" : "saved");
      }
    });
  });
  return btn;
}

function setState(btn, state) {
  const labels = {
    saving: "Saving…",
    saved: "✓ Saved",
    dup: "✓ Updated",
    error: "⚠ No server",
    empty: "⚠ Empty",
  };
  btn.textContent = labels[state] || "💾 Save";
  btn.dataset.state = state;
  if (state === "saved" || state === "dup") {
    setTimeout(() => {
      btn.textContent = "💾 Save";
      delete btn.dataset.state;
    }, 2500);
  }
}

function decorate() {
  for (const postEl of findPosts()) {
    if (postEl.hasAttribute(BTN_FLAG)) continue;
    postEl.setAttribute(BTN_FLAG, "1");
    const btn = makeButton(postEl);
    const bar = document.createElement("div");
    bar.className = "lis-bar";
    bar.appendChild(btn);
    postEl.prepend(bar);
  }
}

// Initial pass + observe the infinite feed for new posts.
decorate();
const observer = new MutationObserver(() => decorate());
observer.observe(document.body, { childList: true, subtree: true });
