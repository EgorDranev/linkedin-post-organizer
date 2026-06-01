/**
 * Watches extension/ and tells the unpacked extension to reload via WebSocket.
 * Run: npm run ext:watch (keep it running while editing extension files).
 */
import { watch } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const PORT = 35729;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, "../extension");
const WATCH_EXT = /\.(js|css|json|html)$/i;

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/health/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("[ext-watch] extension connected");
  ws.on("close", () => clients.delete(ws));
});

function broadcast(message) {
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(message);
  }
}

let debounce;
function scheduleReload(label) {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    console.log(`[ext-watch] ${label} → reload`);
    broadcast("reload");
  }, 200);
}

watch(EXT_DIR, { recursive: true }, (_event, filename) => {
  if (!filename || !WATCH_EXT.test(filename)) return;
  scheduleReload(path.relative(EXT_DIR, filename));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[ext-watch] watching ${EXT_DIR}`);
  console.log(`[ext-watch] http://127.0.0.1:${PORT}/health`);
  console.log(`[ext-watch] reload unpacked extension once, then keep this running`);
});
