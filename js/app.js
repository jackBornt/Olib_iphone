import { fetchBookById, fetchBooks } from "./api.js";
import {
  LINES,
  formatLatency,
  getLine,
  latencyTone,
  probeAllLines,
  resolveLineUrl,
} from "./lines.js";
import {
  clearRecent,
  clearShelf,
  getActiveLineId,
  getLatencies,
  getRecent,
  getSettings,
  getShelf,
  isOnShelf,
  pushRecent,
  saveLatencies,
  saveSettings,
  setActiveLineId,
  toggleShelf,
} from "./storage.js";

const els = {
  tabs: [...document.querySelectorAll(".tab")],
  views: {
    home: document.getElementById("view-home"),
    shelf: document.getElementById("view-shelf"),
    settings: document.getElementById("view-settings"),
  },
  form: document.getElementById("search-form"),
  input: document.getElementById("search-input"),
  recent: document.getElementById("recent-chips"),
  title: document.getElementById("results-title"),
  meta: document.getElementById("results-meta"),
  status: document.getElementById("status"),
  grid: document.getElementById("book-grid"),
  shelfGrid: document.getElementById("shelf-grid"),
  shelfEmpty: document.getElementById("shelf-empty"),
  prev: document.getElementById("prev-page"),
  next: document.getElementById("next-page"),
  dialog: document.getElementById("book-dialog"),
  detail: document.getElementById("book-detail"),
  lang: document.getElementById("setting-lang"),
  cover: document.getElementById("setting-cover"),
  pageSize: document.getElementById("setting-page-size"),
  clearRecent: document.getElementById("clear-recent"),
  clearShelf: document.getElementById("clear-shelf"),
  lineBtn: document.getElementById("line-btn"),
  lineLabel: document.getElementById("line-label"),
  lineLatency: document.getElementById("line-latency"),
  lineDot: document.getElementById("line-dot"),
  lineDialog: document.getElementById("line-dialog"),
  lineList: document.getElementById("line-list"),
  lineTest: document.getElementById("line-test"),
  lineClose: document.getElementById("line-close"),
  settingLineLabel: document.getElementById("setting-line-label"),
  settingLineMeta: document.getElementById("setting-line-meta"),
  openLinePicker: document.getElementById("open-line-picker"),
  lineSiteCard: document.getElementById("line-site-card"),
  lineSiteTitle: document.getElementById("line-site-title"),
  lineSiteUrl: document.getElementById("line-site-url"),
  lineSiteOpen: document.getElementById("line-site-open"),
  lineSiteRefresh: document.getElementById("line-site-refresh"),
};

const state = {
  query: "",
  page: 1,
  next: null,
  previous: null,
  books: [],
  loading: false,
  testing: false,
  latencies: getLatencies(),
  siteUrls: {},
};

function setStatus(text, isError = false) {
  els.status.textContent = text || "";
  els.status.classList.toggle("is-error", Boolean(isError));
}

function switchView(name) {
  for (const [key, view] of Object.entries(els.views)) {
    const active = key === name;
    view.hidden = !active;
    view.classList.toggle("is-active", active);
  }
  els.tabs.forEach((tab) => {
    const active = tab.dataset.view === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  if (name === "shelf") renderShelf();
  if (name === "settings") refreshLineSummary();
}

function refreshLineSummary() {
  const line = getLine(getActiveLineId());
  const ms = state.latencies[line.id];
  const tone = latencyTone(ms);
  if (els.lineLabel) els.lineLabel.textContent = line.label;
  if (els.lineLatency) els.lineLatency.textContent = formatLatency(ms, state.testing);
  if (els.lineDot) {
    els.lineDot.dataset.tone = tone;
  }
  if (els.settingLineLabel) {
    els.settingLineLabel.textContent = `${line.label} · ${line.name}`;
  }
  if (els.settingLineMeta) {
    els.settingLineMeta.textContent = `${line.hint} · ${formatLatency(ms, state.testing)}`;
  }
}

function renderLineList() {
  const active = getActiveLineId();
  els.lineList.innerHTML = LINES.map((line, index) => {
    const ms = state.latencies[line.id];
    const tone = latencyTone(ms);
    const selected = line.id === active ? "is-selected" : "";
    return `
      <button type="button" class="line-item ${selected}" data-line="${line.id}">
        <span class="line-item-main">
          <span class="line-item-title">线路 ${index + 1}</span>
          <span class="line-item-name">${escapeHtml(line.name)}</span>
          <span class="line-item-hint">${escapeHtml(line.hint)}</span>
        </span>
        <span class="line-item-status">
          <span class="dot" data-tone="${tone}"></span>
          <span>${escapeHtml(formatLatency(ms, state.testing))}</span>
        </span>
      </button>
    `;
  }).join("");
}

function openLinePicker() {
  renderLineList();
  refreshLineSummary();
  els.lineDialog.showModal();
}

async function runSpeedTest() {
  if (state.testing) return;
  state.testing = true;
  refreshLineSummary();
  renderLineList();
  try {
    await probeAllLines((result) => {
      state.latencies = { ...state.latencies, [result.id]: result.latencyMs };
      saveLatencies(state.latencies);
      refreshLineSummary();
      renderLineList();
    });
  } finally {
    state.testing = false;
    refreshLineSummary();
    renderLineList();
  }
}

async function refreshLineSite(line = getLine(getActiveLineId())) {
  if (!line.external) {
    els.lineSiteCard.hidden = true;
    return null;
  }

  const entry = line.siteUrl || line.probeUrl;
  els.lineSiteCard.hidden = false;
  els.lineSiteTitle.textContent = `${line.label} · ${line.name}`;

  const cached = state.siteUrls[line.id];
  if (cached) {
    els.lineSiteUrl.textContent = cached;
    els.lineSiteOpen.dataset.url = cached;
    return cached;
  }

  els.lineSiteUrl.textContent = "正在解析最新网址…";
  els.lineSiteOpen.dataset.url = entry;

  const url = (await resolveLineUrl(line)) || entry;
  state.siteUrls[line.id] = url;
  // 解析是异步的，期间用户可能已切到别的线路
  if (getActiveLineId() === line.id) {
    els.lineSiteUrl.textContent = url;
    els.lineSiteOpen.dataset.url = url;
  }
  return url;
}

async function selectLine(lineId) {
  const line = getLine(lineId);
  if (line.external) {
    setActiveLineId(line.id);
    refreshLineSummary();
    renderLineList();
    els.lineDialog.close();
    switchView("home");
    refreshLineSite(line);
    loadBooks({ query: state.query, page: 1 });
    return;
  }
  if (lineId === getActiveLineId()) {
    els.lineDialog.close();
    return;
  }
  setActiveLineId(lineId);
  refreshLineSummary();
  renderLineList();
  els.lineDialog.close();
  switchView("home");
  refreshLineSite(line);
  await loadBooks({ query: state.query, page: 1 });
}

function renderRecent() {
  const recent = getRecent();
  if (!recent.length) {
    els.recent.hidden = true;
    els.recent.innerHTML = "";
    return;
  }
  els.recent.hidden = false;
  els.recent.innerHTML = recent
    .map(
      (q) =>
        `<button type="button" class="chip" data-q="${escapeAttr(q)}">${escapeHtml(q)}</button>`
    )
    .join("");
}

function bookCard(book, index) {
  const settings = getSettings();
  const fav = isOnShelf(book.id);
  const cover =
    settings.showCover && book.cover
      ? `<img src="${escapeAttr(book.cover)}" alt="" loading="lazy" decoding="async" />`
      : `<div class="book-cover-fallback">${escapeHtml(book.title)}</div>`;

  return `
    <article class="book-card-wrap" style="position:relative;animation-delay:${Math.min(index, 12) * 30}ms">
      <button type="button" class="book-card" data-open="${escapeAttr(book.id)}">
        <div class="book-cover">${cover}</div>
        <div class="book-body">
          <h3 class="book-title">${escapeHtml(book.title)}</h3>
          <p class="book-author">${escapeHtml(book.authors)}</p>
        </div>
      </button>
      <button
        type="button"
        class="fav-btn ${fav ? "is-on" : ""}"
        data-fav="${escapeAttr(book.id)}"
        aria-label="${fav ? "移出书架" : "加入书架"}"
        title="${fav ? "移出书架" : "加入书架"}"
      >★</button>
    </article>
  `;
}

function renderBooks(target, books) {
  if (!books.length) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = books.map((book, i) => bookCard(book, i)).join("");
}

function renderShelf() {
  const shelf = getShelf();
  els.shelfEmpty.hidden = shelf.length > 0;
  renderBooks(els.shelfGrid, shelf);
}

function updatePager() {
  els.prev.hidden = !state.previous;
  els.next.hidden = !state.next;
  els.prev.disabled = state.loading;
  els.next.disabled = state.loading;
}

async function loadBooks({ query = state.query, page = 1 } = {}) {
  const settings = getSettings();
  const line = getLine(settings.lineId);
  state.query = query;
  state.page = page;

  if (line.external) {
    state.books = [];
    state.next = null;
    state.previous = null;
    renderBooks(els.grid, []);
    updatePager();
    els.title.textContent = query ? `搜索「${query}」` : "热门推荐";
    els.meta.textContent = `${line.label} · ${line.name}`;
    setStatus(`${line.label} 是跳转线路，上方显示的是最新站点地址，点「打开站点」即可前往；应用内搜索请切换其他线路。`);
    refreshLineSite(line);
    return;
  }

  state.loading = true;
  updatePager();
  setStatus(`正在从 ${line.name} 加载…`);

  try {
    const data = await fetchBooks({
      source: line.id,
      query,
      page,
      lang: settings.lang,
      pageSize: Number(settings.pageSize) || 24,
    });
    state.books = data.books;
    state.next = data.next;
    state.previous = data.previous;

    if (query) {
      els.title.textContent = `搜索「${query}」`;
      els.meta.textContent = `${line.label} · 约 ${Number(data.count).toLocaleString()} 本 · 第 ${page} 页`;
    } else {
      els.title.textContent = "热门推荐";
      els.meta.textContent = `${line.label} · ${line.name}`;
    }

    renderBooks(els.grid, state.books);
    setStatus(state.books.length ? "" : "没有找到匹配的书，换个关键词或切换线路试试。");
  } catch (err) {
    state.books = [];
    renderBooks(els.grid, []);
    setStatus(err.message || "加载失败，可切换线路后重试。", true);
  } finally {
    state.loading = false;
    updatePager();
  }
}

function findBook(id) {
  return (
    state.books.find((b) => b.id === id) ||
    getShelf().find((b) => b.id === id) ||
    null
  );
}

function renderDetail(book) {
  const settings = getSettings();
  const cover =
    settings.showCover && book.cover
      ? `<img src="${escapeAttr(book.cover)}" alt="" />`
      : "";

  const summary = book.summaries?.[0]
    ? `<p class="detail-summary">${escapeHtml(book.summaries[0])}</p>`
    : book.subjects?.length
      ? `<p class="detail-summary">${escapeHtml(book.subjects.join(" · "))}</p>`
      : `<p class="detail-summary">来自公开书源。请遵守当地版权法规，仅阅读已获授权或公有领域作品。</p>`;

  const links = (book.links || [])
    .map(
      (link) =>
        `<a href="${escapeAttr(link.href)}" target="_blank" rel="noopener noreferrer" class="${
          link.primary ? "" : "secondary"
        }">${escapeHtml(link.label)}</a>`
    )
    .join("");

  const onShelf = isOnShelf(book.id);

  els.detail.innerHTML = `
    <div class="detail-layout">
      <div class="detail-cover">${cover}</div>
      <div>
        <h2 class="detail-title">${escapeHtml(book.title)}</h2>
        <p class="detail-meta">${escapeHtml(book.authors)}${
          book.languages?.length ? ` · ${escapeHtml(book.languages.join(", "))}` : ""
        }</p>
        ${summary}
        <div class="link-row">
          ${links}
          <button type="button" class="btn ghost" data-dialog-fav="${escapeAttr(book.id)}">
            ${onShelf ? "移出书架" : "加入书架"}
          </button>
        </div>
      </div>
    </div>
  `;
}

async function openBook(id) {
  const cached = findBook(id);
  if (!cached) return;

  renderDetail(cached);
  els.dialog.showModal();

  if (String(id).startsWith("gutenberg:") && !cached.links?.length) {
    try {
      const full = await fetchBookById(id);
      const idx = state.books.findIndex((b) => b.id === full.id);
      if (idx >= 0) state.books[idx] = full;
      renderDetail(full);
    } catch {
      /* keep cached */
    }
  }
}

function bindSettings() {
  const settings = getSettings();
  els.lang.value = settings.lang || "";
  els.cover.checked = settings.showCover !== false;
  els.pageSize.value = String(settings.pageSize || 24);

  const persist = () => {
    saveSettings({
      lang: els.lang.value,
      showCover: els.cover.checked,
      pageSize: Number(els.pageSize.value) || 24,
    });
  };

  els.lang.addEventListener("change", () => {
    persist();
    loadBooks({ query: state.query, page: 1 });
  });
  els.cover.addEventListener("change", () => {
    persist();
    renderBooks(els.grid, state.books);
    renderShelf();
  });
  els.pageSize.addEventListener("change", () => {
    persist();
    loadBooks({ query: state.query, page: 1 });
  });
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(str = "") {
  return escapeHtml(str).replaceAll("'", "&#39;");
}

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const q = els.input.value.trim();
  if (!q) return;
  pushRecent(q);
  renderRecent();
  switchView("home");
  loadBooks({ query: q, page: 1 });
});

els.recent.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-q]");
  if (!chip) return;
  els.input.value = chip.dataset.q;
  pushRecent(chip.dataset.q);
  renderRecent();
  loadBooks({ query: chip.dataset.q, page: 1 });
});

els.grid.addEventListener("click", onCollectionClick);
els.shelfGrid.addEventListener("click", onCollectionClick);

function onCollectionClick(event) {
  const fav = event.target.closest("[data-fav]");
  if (fav) {
    event.preventDefault();
    const book = findBook(fav.dataset.fav);
    if (!book) return;
    toggleShelf(book);
    renderBooks(els.grid, state.books);
    renderShelf();
    return;
  }
  const open = event.target.closest("[data-open]");
  if (open) openBook(open.dataset.open);
}

els.detail.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-dialog-fav]");
  if (!btn) return;
  const book = findBook(btn.dataset.dialogFav);
  if (!book) return;
  toggleShelf(book);
  btn.textContent = isOnShelf(book.id) ? "移出书架" : "加入书架";
  renderBooks(els.grid, state.books);
  renderShelf();
});

els.prev.addEventListener("click", () => {
  if (state.page > 1) loadBooks({ page: state.page - 1 });
});

els.next.addEventListener("click", () => {
  if (state.next) loadBooks({ page: state.page + 1 });
});

els.clearRecent.addEventListener("click", () => {
  clearRecent();
  renderRecent();
});

els.clearShelf.addEventListener("click", () => {
  if (!confirm("确定清空本地书架？")) return;
  clearShelf();
  renderShelf();
  renderBooks(els.grid, state.books);
});

els.lineBtn?.addEventListener("click", openLinePicker);
els.openLinePicker?.addEventListener("click", openLinePicker);
els.lineClose?.addEventListener("click", () => els.lineDialog.close());
els.lineTest?.addEventListener("click", () => runSpeedTest());
els.lineList?.addEventListener("click", (event) => {
  const item = event.target.closest("[data-line]");
  if (!item) return;
  selectLine(item.dataset.line);
});

els.lineSiteOpen?.addEventListener("click", () => {
  const url = els.lineSiteOpen.dataset.url;
  if (url) window.open(url, "_blank", "noopener,noreferrer");
});

els.lineSiteRefresh?.addEventListener("click", () => {
  delete state.siteUrls[getActiveLineId()];
  refreshLineSite();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

bindSettings();
refreshLineSummary();
renderRecent();
loadBooks({ query: "", page: 1 });
runSpeedTest();
