const DEFAULT_SERVER = "http://localhost:3000";
const STEP_COUNT = 4;

const els = {
  stepper: document.getElementById("stepper"),
  steps: document.querySelectorAll(".step"),
  server: document.getElementById("server"),
  password: document.getElementById("password"),
  autoCapture: document.getElementById("autoCapture"),
  open: document.getElementById("open"),
  openLinkedInSaved: document.getElementById("openLinkedInSaved"),
  importSaved: document.getElementById("importSaved"),
  status: document.getElementById("status"),
  verifyHint: document.getElementById("verifyHint"),
  doneStatus: document.getElementById("doneStatus"),
  reconfigure: document.getElementById("reconfigure"),
  nav: document.getElementById("nav"),
  back: document.getElementById("back"),
  next: document.getElementById("next"),
  retry: document.getElementById("retry"),
};

// Wizard state. Each step depends on the one before it: a password is only
// meaningful once a server URL exists, the verify step needs both, and the
// final actions are only reachable once verification is green.
let step = 0;
// null | "checking" | "nogate" | "ok" | "wrongpw" | "unreachable"
let verifyState = null;

function normalize(url) {
  return (url || DEFAULT_SERVER).replace(/\/$/, "");
}

function isValidUrl(value) {
  try {
    const u = new URL((value || "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isVerifyGreen() {
  return verifyState === "ok" || verifyState === "nogate";
}

function render() {
  els.steps.forEach((s) =>
    s.classList.toggle("active", Number(s.dataset.step) === step),
  );

  Array.from(els.stepper.children).forEach((dot, i) => {
    dot.classList.toggle("done", i < step);
    dot.classList.toggle("current", i === step);
  });

  // The final step carries its own actions, so the shared nav is hidden there.
  const onDone = step === STEP_COUNT - 1;
  els.nav.style.display = onDone ? "none" : "flex";
  els.back.style.display = step === 0 ? "none" : "";

  if (step === 2) {
    const green = isVerifyGreen();
    els.next.style.display = green ? "" : "none";
    els.retry.style.display = !green && verifyState !== "checking" ? "" : "none";
  } else {
    els.next.style.display = "";
    els.retry.style.display = "none";
  }

  els.next.disabled = step === 0 && !isValidUrl(els.server.value);
}

function goTo(n) {
  step = n;
  render();
  if (step === 2) runVerify();
  if (step === 3) hydrateDone();
}

async function runVerify() {
  verifyState = "checking";
  els.status.textContent = "Checking connection…";
  els.status.className = "status";
  els.verifyHint.textContent = "";
  render();

  const server = normalize(els.server.value);
  const password = els.password.value;
  try {
    const headers = password ? { "x-app-password": password } : {};
    const r = await fetch(`${server}/api/session`, { headers });
    if (!r.ok) throw new Error();
    const { gate, authed } = await r.json();
    if (!gate) {
      verifyState = "nogate";
      els.status.textContent = "● Connected — no password required";
      els.status.className = "status ok";
    } else if (authed) {
      verifyState = "ok";
      els.status.textContent = "● Connected & authorized";
      els.status.className = "status ok";
    } else {
      verifyState = "wrongpw";
      els.status.textContent = "● Wrong password";
      els.status.className = "status bad";
      els.verifyHint.textContent = "Go back and re-enter the app password.";
    }
  } catch {
    verifyState = "unreachable";
    els.status.textContent = "● Couldn't reach the server";
    els.status.className = "status bad";
    els.verifyHint.textContent = "Go back and check the server URL.";
  }
  render();
}

function hydrateDone() {
  els.open.href = normalize(els.server.value);
  els.doneStatus.textContent =
    verifyState === "nogate"
      ? "● Connected — no password required"
      : "● Connected & authorized";
  els.doneStatus.className = "status ok";
}

function sendImportMessage(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "import-saved-posts" }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) {
        resolve({ ok: false, error: chrome.runtime.lastError?.message || "" });
        return;
      }
      resolve(resp);
    });
  });
}

async function ensureImporterInjected(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      "lib/chrome-safe.js",
      "lib/extract.js",
      "lib/save.js",
      "native-save.js",
      "saved-import.js",
    ],
  });
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content.css"],
  });
}

// --- Wiring -----------------------------------------------------------------

els.server.addEventListener("input", render);

function tryAdvance() {
  if (els.next.disabled || els.next.style.display === "none") return;
  els.next.click();
}
els.server.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryAdvance();
});
els.password.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryAdvance();
});

els.next.addEventListener("click", async () => {
  if (step === 0) {
    await chrome.storage.local.set({ serverUrl: els.server.value.trim() });
    goTo(1);
  } else if (step === 1) {
    await chrome.storage.local.set({ appPassword: els.password.value });
    goTo(2);
  } else if (step === 2) {
    goTo(3);
  }
});

els.back.addEventListener("click", () => {
  // Skip straight back to the URL step when the server itself was unreachable.
  if (step === 2 && verifyState === "unreachable") goTo(0);
  else goTo(step - 1);
});

els.retry.addEventListener("click", () => runVerify());

els.reconfigure.addEventListener("click", (e) => {
  e.preventDefault();
  goTo(0);
});

els.autoCapture.addEventListener("change", () => {
  chrome.storage.local.set({ autoCapture: els.autoCapture.checked });
});

els.importSaved.addEventListener("click", async () => {
  els.importSaved.disabled = true;
  els.doneStatus.textContent = "Starting saved-posts import…";
  els.doneStatus.className = "status";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(?:www\.)?linkedin\.com\//i.test(tab.url || "")) {
    await chrome.tabs.create({ url: "https://www.linkedin.com/my-items/saved-posts/" });
    els.doneStatus.textContent = "Open the new LinkedIn saved-posts tab, then click import.";
    els.doneStatus.className = "status";
    els.importSaved.disabled = false;
    return;
  }

  try {
    let resp = await sendImportMessage(tab.id);
    if (!resp.ok) {
      await ensureImporterInjected(tab.id);
      resp = await sendImportMessage(tab.id);
    }

    els.importSaved.disabled = false;
    if (!resp.ok) {
      els.doneStatus.textContent = "Could not start import on this tab.";
      els.doneStatus.className = "status bad";
      return;
    }
    const { added = 0, updated = 0, skipped = 0, failed = 0 } = resp.stats || {};
    els.doneStatus.textContent = `Import done: ${added} added, ${updated} updated, ${skipped} skipped${
      failed ? `, ${failed} failed` : ""
    }.`;
    els.doneStatus.className = failed ? "status bad" : "status ok";
  } catch (err) {
    els.importSaved.disabled = false;
    els.doneStatus.textContent = err?.message || "Could not start import on this tab.";
    els.doneStatus.className = "status bad";
  }
});

// --- Init -------------------------------------------------------------------

async function init() {
  for (let i = 0; i < STEP_COUNT; i++) {
    const dot = document.createElement("div");
    dot.className = "dot";
    els.stepper.appendChild(dot);
  }

  const { serverUrl, appPassword, autoCapture } = await chrome.storage.local.get([
    "serverUrl",
    "appPassword",
    "autoCapture",
  ]);
  els.server.value = serverUrl || "";
  els.password.value = appPassword || "";
  els.autoCapture.checked = autoCapture !== false;

  if (!serverUrl) {
    goTo(0);
    return;
  }

  // Already configured: silently verify, then land on the actions step when
  // green so returning users skip the wizard, or on the verify step (showing
  // the error) when something needs fixing.
  step = 2;
  render();
  await runVerify();
  if (isVerifyGreen()) goTo(3);
}

init();
