const KEYS = {
  settings: "olib.settings",
  shelf: "olib.shelf",
  recent: "olib.recent",
  latencies: "olib.latencies",
};

const defaultSettings = {
  lang: "",
  showCover: true,
  pageSize: 24,
  lineId: "gutenberg",
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
