// Runs in the extension's own origin, so it can POST to the app's API
// without the page's CORS / mixed-content restrictions.
//
// Target server is configurable from the popup (stored in chrome.storage).
// Default points at local dev; set it to your Vercel URL once deployed.

importScripts("dev-reload.js");

const DEFAULT_SERVER = "http://localhost:3000";
const SCRAPE_TIMEOUT_MS = 12000;

async function getConfig() {
  const { serverUrl, appPassword } = await chrome.storage.local.get([
    "serverUrl",
    "appPassword",
  ]);
  return {
    server: (serverUrl || DEFAULT_SERVER).replace(/\/$/, ""),
    password: appPassword || "",
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "scrape-post-url") {
    scrapePostUrl(msg.url)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((err) => {
        const message = err?.message || "scrape failed";
        sendResponse({ ok: false, error: message });
      });

    return true;
  }

  if (msg?.type === "existing-post-urls") {
    getConfig()
      .then(({ server, password }) => {
        const headers = {};
        if (password) headers["x-app-password"] = password;
        return fetch(`${server}/api/posts`, { headers });
      })
      .then(async (r) => {
        if (!r.ok) throw new Error(`server ${r.status}`);
        const posts = await r.json();
        const urls = [];
        for (const post of posts) {
          if (post.url) urls.push(post.url);
          if (post.metadata?.urn) {
            urls.push(`https://www.linkedin.com/feed/update/${post.metadata.urn}/`);
          }
        }
        sendResponse({
          ok: true,
          urls,
        });
      })
      .catch((err) => {
        const msg = err?.message || "lookup failed";
        sendResponse({ ok: false, error: msg });
      });

    return true;
  }

  if (msg?.type !== "save-post") return;

  getConfig()
    .then(({ server, password }) => {
      const headers = { "Content-Type": "application/json" };
      if (password) headers["x-app-password"] = password;
      return fetch(`${server}/api/posts`, {
        method: "POST",
        headers,
        body: JSON.stringify(msg.payload),
      });
    })
    .then(async (r) => {
      if (!r.ok) throw new Error(`server ${r.status}`);
      const post = await r.json();
      flashBadge(post.duplicate ? "•" : "✓", "#0a66c2");
      sendResponse({ ok: true, post });
    })
    .catch((err) => {
      flashBadge("!", "#c0392b");
      const msg = err?.message || "save failed";
      sendResponse({ ok: false, error: msg });
    });

  return true; // keep the message channel open for the async response
});

function chromeCall(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    let timer = null;

    function done() {
      if (timer) clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }

    function onUpdated(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") done();
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || tab?.status === "complete") done();
      else timer = setTimeout(done, SCRAPE_TIMEOUT_MS);
    });
  });
}

async function scrapePostUrl(url) {
  if (!/^https:\/\/(?:www\.)?linkedin\.com\/feed\/update\/urn:li:activity:\d+\/?/i.test(url || "")) {
    throw new Error("not a LinkedIn post URL");
  }

  const tab = await chromeCall(chrome.tabs.create, { url, active: false });
  const tabId = tab?.id;
  if (!tabId) throw new Error("could not open post");

  try {
    await waitForTabComplete(tabId);
    await chromeCall(chrome.scripting.executeScript, {
      target: { tabId },
      files: ["lib/chrome-safe.js", "lib/extract.js"],
    });

    const [result] = await chromeCall(chrome.scripting.executeScript, {
      target: { tabId },
      func: async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const wantedUrn = location.href.match(/urn:li:activity:\d+/i)?.[0] || "";
        const selectors = [
          ".update-components-text",
          ".feed-shared-inline-show-more-text",
          ".update-components-actor",
          ".feed-shared-actor",
          "[data-test-id*='commentary']",
          "[data-test-id*='post-content']",
        ].join(", ");

        for (let attempt = 0; attempt < 24; attempt += 1) {
          const hasContent = document.querySelector(selectors);
          if (hasContent || document.readyState === "complete") {
            const buttons = document.querySelectorAll("button, [role='button']");
            for (const button of buttons) {
              const text = (
                button.getAttribute("aria-label") ||
                button.textContent ||
                ""
              ).trim();
              if (/see more|show more/i.test(text)) button.click();
            }
          }

          const posts = [...(globalThis.LIS?.findPosts?.() || [])];
          const post =
            posts.find((el) => globalThis.LIS?.getPostUrn?.(el) === wantedUrn) ||
            globalThis.LIS?.findBestPostCandidate?.(document.body) ||
            posts[0];
          if (post) {
            const payload = globalThis.LIS.extract(post);
            const hasRealText =
              payload?.text && !/^\[LinkedIn post .+ no text extracted\]/i.test(payload.text);
            if (payload?.author || hasRealText) return payload;
          }

          window.scrollTo({ top: 0, behavior: "auto" });
          await sleep(500);
        }

        const post =
          globalThis.LIS?.findBestPostCandidate?.(document.body) ||
          globalThis.LIS?.findPosts?.()[0];
        return post ? globalThis.LIS.extract(post) : null;
      },
    });

    if (!result?.result) throw new Error("post content not found");
    return result.result;
  } finally {
    chrome.tabs.remove(tabId);
  }
}

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}
