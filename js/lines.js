/** Legal book sources as switchable "lines" (olib-style). */
export const LINES = [
  {
    id: "gutenberg",
    label: "线路 1",
    name: "Project Gutenberg",
    hint: "公有领域 · Gutendex",
    probeUrl: "https://gutendex.com/books/?page=1",
  },
  {
    id: "openlibrary",
    label: "线路 2",
    name: "Open Library",
    hint: "开放图书馆目录",
    probeUrl: "https://openlibrary.org/search.json?q=pride&limit=1",
  },
  {
    id: "library",
    label: "线路 3",
    name: "Library Redirect",
    hint: "自动跳转到最新可用网址",
    probeUrl: "https://library-redirect.sk/",
    siteUrl: "https://library-redirect.sk/",
    external: true,
  },
];

export function getLine(id) {
  return LINES.find((line) => line.id === id) || LINES[0];
}

export async function probeLine(line, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(line.probeUrl, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      // 外部跳转线路没有跨域响应头，只能用 no-cors 判断可达性
      mode: line.external ? "no-cors" : "cors",
    });
    const ms = Math.round(performance.now() - started);
    if (line.external) return { id: line.id, latencyMs: ms };
    if (!res.ok) return { id: line.id, latencyMs: -1 };
    await res.text().catch(() => "");
    return { id: line.id, latencyMs: ms };
  } catch {
    return { id: line.id, latencyMs: -1 };
  } finally {
    clearTimeout(timer);
  }
}

/** 解析跳转线路的入口地址，跟随重定向得到最新网址（解析失败时回退到入口地址）。 */
export async function resolveLineUrl(line, timeoutMs = 6000) {
  const entry = line?.siteUrl || line?.probeUrl;
  if (!entry) return null;
  if (!line.external) return entry;

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

export async function probeAllLines(onProgress) {
  const results = [];
  await Promise.all(
    LINES.map(async (line) => {
      const result = await probeLine(line);
      results.push(result);
      onProgress?.(result, results.slice());
    })
  );
  return results;
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
