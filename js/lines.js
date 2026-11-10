/** Olib 风格的多线路模型：镜像线路（可切换登录）+ 公有书源。 */
import { getCustomLines } from "./storage.js";

/**
 * Olib v1.4.0 的内置镜像线路表（顺序与 Olib `domainListProvider` 一致）。
 * 只看这一组时就是 Olib 的 “Line 1..N”。
 */
export const MIRROR_DOMAINS = [
  "bookroom.lifestyle",
  "bibliotheca.world",
  "bibliotheca.study",
  "bibliotheca.lifestyle",
  "luto.top",
  "bibliotheca.life",
  "anthology.lifestyle",
  "elaborate.monster",
  "s0u1.top",
  "26h2.tech",
  "orangerain.space",
  "zouwu.top",
  "xn--t8j0bxa8hymnb.jp",
  "553211.xyz",
  "loves.works",
  "z-library.im",
  "ireadhuang.sbs",
  "elaborate.quest",
  "elaborate.wtf",
  "9libmirror.tech",
  "shunfei.shop",
  "elaboratethinking.online",
  "bookorg.tech",
  "booook.me",
  "95427279.xyz",
  "zkoo.site",
  "adsblaze.com",
  "817523.xyz",
  "toffeeboba.com",
  "interflow.ch",
  "free2read.cc",
  "8964520.xyz",
  "umq.me",
  "110434.xyz",
  "frank9527.site",
  "freebooks.lol",
  "226272.xyz",
  "jdbooks.xyz",
  "arcfoxxxxxx.site",
  "86110101.xyz",
  "909190.xyz",
];

export const DEFAULT_MIRROR = MIRROR_DOMAINS[0];

/** 镜像线路：跳转 + 登录/注册 + 站内搜索。 */
export const MIRROR_LINES = MIRROR_DOMAINS.map((domain) => ({
  id: `mirror:${domain}`,
  kind: "mirror",
  domain,
  name: domain,
  hint: "Olib 镜像线路 · 可切换登录",
  siteUrl: `https://${domain}/`,
  pinnedUrl: `https://${domain}/`,
  searchUrl: `https://${domain}/s/{q}`,
  registrationPath: "/registration",
  external: true,
}));

/** 应用内可搜索的公有书源。 */
export const BOOK_LINES = [
  {
    id: "gutenberg",
    kind: "book",
    name: "Project Gutenberg",
    hint: "公有领域 · Gutendex",
    api: "gutenberg",
    probeUrl: "https://gutendex.com/books/?page=1",
    pinnedUrl: "https://www.gutenberg.org/",
    searchUrl: "https://www.gutenberg.org/ebooks/search/?query={q}",
  },
  {
    id: "openlibrary",
    kind: "book",
    name: "Open Library",
    hint: "开放图书馆目录",
    api: "openlibrary",
    probeUrl: "https://openlibrary.org/search.json?q=pride&limit=1",
    pinnedUrl: "https://openlibrary.org/",
    searchUrl: "https://openlibrary.org/search?q={q}",
  },
  {
    id: "archive",
    kind: "book",
    name: "Internet Archive",
    hint: "互联网档案馆",
    api: "archive",
    probeUrl:
      "https://archive.org/advancedsearch.php?q=mediatype:texts&fl[]=identifier&rows=1&page=1&output=json",
    pinnedUrl: "https://archive.org/",
    searchUrl: "https://archive.org/search?query={q}",
  },
];

/** 镜像线路（内置 + 自定义）。自定义线路按镜像处理。 */
export function getMirrorLines() {
  return [...MIRROR_LINES, ...getCustomLines()];
}

/** 公有书源。 */
export function getBookLines() {
  return BOOK_LINES;
}

/** 全量线路，供测速 / 查找使用。 */
export function getLines() {
  return [...getMirrorLines(), ...getBookLines()];
}

export function getLine(id) {
  return getLines().find((line) => line.id === id) || MIRROR_LINES[0];
}

/** 镜像线路的编号（1-based，含自定义线路）。 */
export function lineNumberOf(line, all = getMirrorLines()) {
  const idx = all.findIndex((item) => item.id === line?.id);
  return idx >= 0 ? idx + 1 : null;
}

/** 公有书源的编号（1-based）。 */
export function bookNumberOf(line) {
  const idx = BOOK_LINES.findIndex((item) => item.id === line?.id);
  return idx >= 0 ? idx + 1 : null;
}

/** “线路 N / 书源 N / 自定义线路”的展示名。 */
export function labelOf(line, mirrors = getMirrorLines()) {
  if (line?.kind === "book") {
    const n = bookNumberOf(line);
    return n ? `书源 ${n}` : "书源";
  }
  const n = lineNumberOf(line, mirrors);
  return n ? `线路 ${n}` : line?.custom ? "自定义线路" : "线路";
}

/** 能在应用内搜索（有已知 API）的线路。镜像/自定义线路只能打开站点搜索页。 */
export function isSearchable(line) {
  return line?.kind === "book" && Boolean(line?.api);
}

/** 线路的入口地址（用于测速 / 打开站点）。 */
export function siteEntry(line) {
  if (line?.kind === "mirror" || line?.custom) {
    // 镜像线路优先打开它登记的官方/置顶地址。
    return line.pinnedUrl || line.siteUrl || line.probeUrl || null;
  }
  return line?.siteUrl || line?.pinnedUrl || line?.probeUrl || null;
}

/** 线路的“置顶/官方网址”。 */
export function pinnedUrlOf(line) {
  return line?.pinnedUrl || line?.siteUrl || null;
}

function probeTarget(line) {
  return line?.probeUrl || siteEntry(line);
}

/** 测速：书源用 CORS；镜像/自定义线路用 no-cors 只判断可达性。 */
export async function probeLine(line, timeoutMs = 6000) {
  const target = probeTarget(line);
  if (!target) return { id: line.id, latencyMs: -1 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  const opaque = Boolean(line.external || line.kind === "mirror" || line.custom);

  try {
    const res = await fetch(target, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      mode: opaque ? "no-cors" : "cors",
    });
    const ms = Math.round(performance.now() - started);
    if (opaque) return { id: line.id, latencyMs: ms };
    if (!res.ok) return { id: line.id, latencyMs: -1 };
    await res.text().catch(() => "");
    return { id: line.id, latencyMs: ms };
  } catch {
    return { id: line.id, latencyMs: -1 };
  } finally {
    clearTimeout(timer);
  }
}

/** 并发测速（最多 8 路，和 Olib 的测速池一致）。 */
export async function probeAllLines(onProgress, maxConcurrent = 8) {
  const lines = getLines();
  const results = [];
  const queue = [...lines];

  const workers = Array.from(
    { length: Math.min(maxConcurrent, lines.length) },
    async () => {
      while (queue.length) {
        const line = queue.shift();
        const result = await probeLine(line);
        results.push(result);
        onProgress?.(result, results.slice());
      }
    }
  );

  await Promise.all(workers);
  return results;
}

/**
 * 解析线路的最新可用网址：镜像/自定义线路会跟随重定向；受浏览器跨域限制无法
 * 读取最终地址时回退到入口地址（打开后浏览器仍会自动跟随重定向）。
 */
export async function resolveLineUrl(line, timeoutMs = 8000) {
  const entry = siteEntry(line);
  if (!entry) return null;
  if (line?.kind === "book") return entry;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(entry, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
      mode: "cors",
    });
    return res.url || entry;
  } catch {
    return entry;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 选择「置顶网址」所属线路：默认置顶线路 → 它离线时回退到延迟最低的在线镜像。
 * 只看镜像线路，不会把公有书源当作置顶网址。
 */
export function pickPinnedLine({
  latencies = {},
  pinnedLineId,
  lines = getMirrorLines(),
}) {
  // 0ms 也代表可达（本地/缓存响应），只有 -1 或未测速才算离线。
  const online = (id) => (latencies[id] ?? -1) >= 0;
  const preferred =
    lines.find((line) => line.id === pinnedLineId) ||
    lines.find((line) => line.id === `mirror:${DEFAULT_MIRROR}`) ||
    lines[0] ||
    null;
  if (!preferred) return null;
  if (online(preferred.id)) return preferred;

  const candidates = lines
    .filter((line) => online(line.id))
    .sort((a, b) => (latencies[a.id] ?? 99999) - (latencies[b.id] ?? 99999));
  return candidates[0] || preferred;
}

export function latencyTone(ms) {
  if (ms == null) return "muted";
  if (ms < 0) return "error";
  if (ms < 1000) return "ok";
  if (ms < 3000) return "warn";
  return "error";
}

export function formatLatency(ms, testing = false) {
  if (ms == null) return testing ? "测速中" : "未测速";
  if (ms < 0) return "不可用";
  return `${ms}ms`;
}
