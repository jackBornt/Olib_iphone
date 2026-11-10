const KEYS = {
  settings: "olib.settings",
  shelf: "olib.shelf",
  recent: "olib.recent",
  latencies: "olib.latencies",
  customLines: "olib.customLines",
};

const defaultSettings = {
  lang: "",
  showCover: true,
  pageSize: 24,
  lineId: "gutenberg",
  // 「置顶网址」默认指向 Olib 的默认镜像线路；该线路不可用时回退到最快在线镜像。
  pinnedLineId: "mirror:bookroom.lifestyle",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getSettings() {
  return { ...defaultSettings, ...read(KEYS.settings, {}) };
}

export function saveSettings(partial) {
  const next = { ...getSettings(), ...partial };
  write(KEYS.settings, next);
  return next;
}

export function getActiveLineId() {
  return getSettings().lineId || "gutenberg";
}

export function setActiveLineId(lineId) {
  return saveSettings({ lineId });
}

export function getLatencies() {
  return read(KEYS.latencies, {});
}

export function saveLatencies(map) {
  write(KEYS.latencies, map || {});
  return map;
}

export function getShelf() {
  return read(KEYS.shelf, []);
}

export function isOnShelf(id) {
  return getShelf().some((book) => book.id === id);
}

export function toggleShelf(book) {
  const shelf = getShelf();
  const idx = shelf.findIndex((item) => item.id === book.id);
  if (idx >= 0) {
    shelf.splice(idx, 1);
  } else {
    shelf.unshift({
      id: book.id,
      source: book.source,
      title: book.title,
      authors: book.authors,
      cover: book.cover,
      languages: book.languages,
      links: book.links,
      savedAt: Date.now(),
    });
  }
  write(KEYS.shelf, shelf);
  return shelf;
}

export function clearShelf() {
  write(KEYS.shelf, []);
}

export function getRecent() {
  return read(KEYS.recent, []);
}

export function pushRecent(query) {
  const q = query.trim();
  if (!q) return getRecent();
  const next = [q, ...getRecent().filter((item) => item !== q)].slice(0, 8);
  write(KEYS.recent, next);
  return next;
}

export function clearRecent() {
  write(KEYS.recent, []);
}

/* ------------------------------------------------------------------ */
/* 自定义线路（多线路扩展，仅存本机）                                  */
/* ------------------------------------------------------------------ */

function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function getCustomLines() {
  const list = read(KEYS.customLines, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (line) =>
        line &&
        typeof line.id === "string" &&
        line.name &&
        (line.searchUrl || line.siteUrl),
    )
    .map((line) => ({
      ...line,
      kind: "mirror",
      custom: true,
      external: true,
      hint: line.hint || "自定义镜像线路 · 跳转搜索",
    }));
}

export function saveCustomLines(lines) {
  const next = Array.isArray(lines) ? lines : [];
  write(KEYS.customLines, next);
  return next;
}

export function addCustomLine({ name, searchUrl, pinnedUrl }) {
  const lines = getCustomLines();
  const trimmedSearch = String(searchUrl || "").trim();
  const base =
    normalizeUrl(pinnedUrl) ||
    normalizeUrl(trimmedSearch.split("{q}")[0]) ||
    "";
  const id = `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const line = {
    id,
    kind: "mirror",
    custom: true,
    external: true,
    name: String(name || "").trim().slice(0, 40) || "自定义线路",
    hint: "自定义镜像线路 · 跳转搜索",
    searchUrl: trimmedSearch,
    siteUrl: base,
    pinnedUrl: normalizeUrl(pinnedUrl) || base,
    registrationPath: "",
  };
  lines.push(line);
  saveCustomLines(lines);
  return line;
}

export function removeCustomLine(id) {
  const lines = getCustomLines().filter((line) => line.id !== id);
  saveCustomLines(lines);
  return lines;
}
