// Connects to `npm run ext:watch` on localhost and reloads the extension + LinkedIn tabs.
// Only opens WebSocket after /health responds — no errors when the watcher is off.

const DEV_RELOAD_BASE = "http://127.0.0.1:35729";
const DEV_RELOAD_WS = "ws://127.0.0.1:35729";
const LINKEDIN_URLS = ["https://www.linkedin.com/*", "https://linkedin.com/*"];
const POLL_MS = 5000;

let socket;
let pollTimer;

async function watcherRunning() {
  try {
    const r = await fetch(`${DEV_RELOAD_BASE}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function onReloadSignal() {
  try {
    const tabs = await chrome.tabs.query({ url: LINKEDIN_URLS });
    await Promise.all(tabs.map((t) => chrome.tabs.reload(t.id).catch(() => {})));
  } catch {
    // no LinkedIn tabs open
  }
  chrome.runtime.reload();
}

function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(pollLoop, POLL_MS);
}

function openSocket() {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  socket = new WebSocket(DEV_RELOAD_WS);
  socket.onmessage = (event) => {
    if (event.data === "reload") onReloadSignal();
  };
  socket.onopen = () => clearTimeout(pollTimer);
  socket.onclose = () => {
    socket = null;
    schedulePoll();
  };
  socket.onerror = () => {
    socket?.close();
    socket = null;
    schedulePoll();
  };
}

async function pollLoop() {
  if (await watcherRunning()) {
    openSocket();
    return;
  }
  schedulePoll();
}

pollLoop();
