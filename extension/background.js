// Runs in the extension's own origin, so it can POST to the app's API
// without the page's CORS / mixed-content restrictions.
//
// Target server is configurable from the popup (stored in chrome.storage).
// Default points at local dev; set it to your Vercel URL once deployed.

importScripts("dev-reload.js");

const DEFAULT_SERVER = "http://localhost:3000";

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

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}
