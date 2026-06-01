const DEFAULT_SERVER = "http://localhost:3000";
const statusEl = document.getElementById("status");
const inputEl = document.getElementById("server");
const openEl = document.getElementById("open");

function normalize(url) {
  return (url || DEFAULT_SERVER).replace(/\/$/, "");
}

async function refresh() {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  const server = normalize(serverUrl);
  inputEl.value = serverUrl || "";
  openEl.href = server;

  statusEl.textContent = "Checking server…";
  statusEl.className = "status";
  try {
    const r = await fetch(`${server}/api/health`);
    if (!r.ok) throw new Error();
    statusEl.textContent = "● Server connected";
    statusEl.className = "status ok";
  } catch {
    statusEl.textContent = "● Server not reachable";
    statusEl.className = "status bad";
  }
}

document.getElementById("save").addEventListener("click", async () => {
  const value = inputEl.value.trim();
  await chrome.storage.local.set({ serverUrl: value });
  refresh();
});

refresh();
