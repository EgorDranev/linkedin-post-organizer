const DEFAULT_SERVER = "http://localhost:3000";
const statusEl = document.getElementById("status");
const serverEl = document.getElementById("server");
const passwordEl = document.getElementById("password");
const openEl = document.getElementById("open");

function normalize(url) {
  return (url || DEFAULT_SERVER).replace(/\/$/, "");
}

async function refresh() {
  const { serverUrl, appPassword } = await chrome.storage.local.get([
    "serverUrl",
    "appPassword",
  ]);
  const server = normalize(serverUrl);
  serverEl.value = serverUrl || "";
  passwordEl.value = appPassword || "";
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
  });
  refresh();
});

refresh();
