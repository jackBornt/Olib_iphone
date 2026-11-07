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
    id: "archive",
    label: "线路 3",
    name: "Internet Archive",
    hint: "互联网档案馆",
    probeUrl:
      "https://archive.org/advancedsearch.php?q=mediatype:texts&fl[]=identifier&rows=1&page=1&output=json",
  },
    {
    id: "mylib",
    label: "线路 4",
    name: "my Archive",
    hint: "OMy_lib",
    probeUrl:
      "https://z-library.im/",
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
      mode: "cors",
    });
    const ms = Math.round(performance.now() - started);
    if (!res.ok) return { id: line.id, latencyMs: -1 };
    await res.text().catch(() => "");
    return { id: line.id, latencyMs: ms };
  } catch {
    return { id: line.id, latencyMs: -1 };
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
