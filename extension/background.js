// Runs in the extension's own origin, so it can POST to the app's API
// without the page's CORS / mixed-content restrictions.
//
// Target server is configurable from the popup (stored in chrome.storage).
// Default points at local dev; set it to your Vercel URL once deployed.

const DEFAULT_SERVER = "http://localhost:3000";

async function getServer() {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  return (serverUrl || DEFAULT_SERVER).replace(/\/$/, "");
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "save-post") return;

  getServer()
    .then((server) =>
      fetch(`${server}/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg.payload),
      })
    )
    .then(async (r) => {
      if (!r.ok) throw new Error(`server ${r.status}`);
      const post = await r.json();
      flashBadge(post.duplicate ? "•" : "✓", "#0a66c2");
      sendResponse({ ok: true, post });
    })
    .catch((err) => {
      flashBadge("!", "#c0392b");
      sendResponse({ ok: false, error: err.message });
    });

  return true; // keep the message channel open for the async response
});

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}
