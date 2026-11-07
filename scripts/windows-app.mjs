import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 5173);
const url = `http://127.0.0.1:${port}`;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function safeJoin(base, reqPath) {
  const decoded = decodeURIComponent((reqPath || "/").split("?")[0]);
  const cleaned = decoded.replace(/^\/+/, "");
  const full = path.normalize(path.join(base, cleaned || "index.html"));
  if (!full.startsWith(base)) return null;
  return full;
}

async function sendFile(res, filePath) {
  const data = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  res.end(data);
}

const server = createServer(async (req, res) => {
  try {
    let filePath = safeJoin(root, req.url || "/");
    if (!filePath) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    let st;
    try {
      st = await stat(filePath);
    } catch {
      // SPA-ish fallback for bare "/"
      if ((req.url || "/") === "/" || (req.url || "").startsWith("/?")) {
        filePath = path.join(root, "index.html");
        st = await stat(filePath);
      } else {
        res.writeHead(404).end("Not found");
        return;
      }
    }

    if (st.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    await sendFile(res, filePath);
  } catch (err) {
    res.writeHead(500).end(String(err?.message || err));
  }
});

function findBrowser() {
  const candidates = [
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.PROGRAMFILES &&
      path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.PROGRAMFILES &&
      path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

server.listen(port, "127.0.0.1", () => {
  console.log(`Olib PWA 本地服务: ${url}`);
  const browser = findBrowser();
  if (browser) {
    spawn(browser, [`--app=${url}`], { detached: true, stdio: "ignore" }).unref();
    console.log("已打开 Windows 独立窗口（Edge/Chrome app 模式）");
  } else {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    console.log("已用默认浏览器打开");
  }
});

server.on("error", (err) => {
  console.error("启动失败:", err.message);
  process.exit(1);
});
