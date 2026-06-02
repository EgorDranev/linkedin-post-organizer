const DEFAULT_SERVER = "http://localhost:3000";
const statusEl = document.getElementById("status");
const serverEl = document.getElementById("server");
const passwordEl = document.getElementById("password");
const autoCaptureEl = document.getElementById("autoCapture");
const openEl = document.getElementById("open");
const importSavedEl = document.getElementById("importSaved");

function normalize(url) {
  return (url || DEFAULT_SERVER).replace(/\/$/, "");
}

async function refresh() {
  const { serverUrl, appPassword, autoCapture } = await chrome.storage.local.get([
    "serverUrl",
    "appPassword",
    "autoCapture",
  ]);
  const server = normalize(serverUrl);
  serverEl.value = serverUrl || "";
  passwordEl.value = appPassword || "";
  autoCaptureEl.checked = autoCapture !== false;
  openEl.href = server;

  statusEl.textContent = "Checking server…";
  statusEl.className = "status";
  try {
    const headers = appPassword ? { "x-app-password": appPassword } : {};
    const r = await fetch(`${server}/api/session`, { headers });
    if (!r.ok) throw new Error();
    const { gate, authed } = await r.json();
    if (!gate) {
      statusEl.textContent = "● Connected (no password set)";
      statusEl.className = "status ok";
    } else if (authed) {
      statusEl.textContent = "● Connected & authorized";
      statusEl.className = "status ok";
    } else {
      statusEl.textContent = "● Connected, wrong password";
      statusEl.className = "status bad";
    }
  } catch {
    statusEl.textContent = "● Server not reachable";
    statusEl.className = "status bad";
  }
}

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    serverUrl: serverEl.value.trim(),
    appPassword: passwordEl.value,
    autoCapture: autoCaptureEl.checked,
  });
  refresh();
});

importSavedEl.addEventListener("click", async () => {
  importSavedEl.disabled = true;
  statusEl.textContent = "Starting saved-posts import…";
  statusEl.className = "status";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(?:www\.)?linkedin\.com\//i.test(tab.url || "")) {
    await chrome.tabs.create({ url: "https://www.linkedin.com/my-items/saved-posts/" });
    statusEl.textContent = "Open the new LinkedIn saved-posts tab, then click import.";
    statusEl.className = "status";
    importSavedEl.disabled = false;
    return;
  }

  try {
    chrome.tabs.sendMessage(tab.id, { type: "import-saved-posts" }, (resp) => {
      importSavedEl.disabled = false;
      if (chrome.runtime.lastError || !resp?.ok) {
        statusEl.textContent = "Could not start import on this tab.";
        statusEl.className = "status bad";
        return;
      }
      const { added = 0, skipped = 0, failed = 0 } = resp.stats || {};
      statusEl.textContent = `Import done: ${added} added, ${skipped} skipped${
        failed ? `, ${failed} failed` : ""
      }.`;
      statusEl.className = failed ? "status bad" : "status ok";
    });
  } catch {
    importSavedEl.disabled = false;
    statusEl.textContent = "Could not start import on this tab.";
    statusEl.className = "status bad";
  }
});

refresh();
