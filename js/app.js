import { fetchBookById, fetchBooks } from "./api.js";
import {
  formatLatency,
  getBookLines,
  getLine,
  getLines,
  getMirrorLines,
  isSearchable,
  labelOf,
  latencyTone,
  pickPinnedLine,
  pinnedUrlOf,
  probeAllLines,
  resolveLineUrl,
  siteEntry,
} from "./lines.js";
import {
  addCustomLine,
  clearRecent,
  clearShelf,
  getActiveLineId,
  getCustomLines,
  getLatencies,
  getRecent,
  getSettings,
  getShelf,
  isOnShelf,
  pushRecent,
  removeCustomLine,
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
  lineOnlineCount: document.getElementById("line-online-count"),
  lineTest: document.getElementById("line-test"),
  lineClose: document.getElementById("line-close"),
  settingLineLabel: document.getElementById("setting-line-label"),
  settingLineMeta: document.getElementById("setting-line-meta"),
  openLinePicker: document.getElementById("open-line-picker"),
  lineSiteCard: document.getElementById("line-site-card"),
  lineSiteTitle: document.getElementById("line-site-title"),
  lineSiteUrl: document.getElementById("line-site-url"),
  lineSiteHint: document.getElementById("line-site-hint"),
  lineSiteOpen: document.getElementById("line-site-open"),
  lineSiteSearch: document.getElementById("line-site-search"),
  lineSiteLogin: document.getElementById("line-site-login"),
  lineSiteRefresh: document.getElementById("line-site-refresh"),
  pinnedBanner: document.getElementById("pinned-banner"),
  pinnedUrl: document.getElementById("pinned-url"),
  pinnedMeta: document.getElementById("pinned-meta"),
  pinnedOpen: document.getElementById("pinned-open"),
  pinnedDiscover: document.getElementById("pinned-discover"),
  settingPinnedLine: document.getElementById("setting-pinned-line"),
  settingPinnedUrl: document.getElementById("setting-pinned-url"),
  settingPinnedOpen: document.getElementById("setting-pinned-open"),
  settingPinnedRefresh: document.getElementById("setting-pinned-refresh"),
  customLineList: document.getElementById("custom-line-list"),
  customLineForm: document.getElementById("custom-line-form"),
  customName: document.getElementById("custom-name"),
  customSearch: document.getElementById("custom-search"),
  customPinned: document.getElementById("custom-pinned"),
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
  pinned: { lineId: null, url: null, ms: null, fallback: false, resolving: false },
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
  if (name === "settings") {
    refreshLineSummary();
    populatePinnedLineSelect();
    refreshSettingPinnedUrl();
    renderCustomLines();
  }
}

function refreshLineSummary() {
  const line = getLine(getActiveLineId());
  const ms = state.latencies[line.id];
  const tone = latencyTone(ms);
  if (els.lineLabel) els.lineLabel.textContent = labelOf(line);
  if (els.lineLatency) els.lineLatency.textContent = formatLatency(ms, state.testing);
  if (els.lineDot) els.lineDot.dataset.tone = tone;
  if (els.settingLineLabel) {
    els.settingLineLabel.textContent = `${labelOf(line)} · ${line.name}`;
  }
  if (els.settingLineMeta) {
    els.settingLineMeta.textContent = `${line.hint || ""} · ${formatLatency(ms, state.testing)}`;
  }
}

function lineRow(line, label, active, settings, canPin) {
  const ms = state.latencies[line.id];
  const tone = latencyTone(ms);
  const selected = line.id === active ? "is-selected" : "";
  const isPinned = canPin && line.id === settings.pinnedLineId;
  const badges = [
    isPinned ? '<span class="line-badge">置顶</span>' : "",
    line.custom ? '<span class="line-badge line-badge-custom">自定义</span>' : "",
  ].join("");
  const pinButton = canPin
    ? `<button
        type="button"
        class="line-pin-btn ${isPinned ? "is-on" : ""}"
        data-pin="${escapeAttr(line.id)}"
        title="${isPinned ? "当前置顶线路" : "设为置顶线路"}"
        aria-label="${isPinned ? "当前置顶线路" : "设为置顶线路"}"
      >${isPinned ? "★" : "☆"}</button>`
    : "";

  return `
    <div class="line-item ${selected}" data-line="${escapeAttr(line.id)}" role="button" tabindex="0">
      <span class="line-item-main">
        <span class="line-item-title">${escapeHtml(label)}${badges}</span>
        <span class="line-item-name">${escapeHtml(line.name)}</span>
        <span class="line-item-hint">${escapeHtml(line.hint || "")}</span>
      </span>
      <span class="line-item-status">
        <span class="dot" data-tone="${tone}"></span>
        <span>${escapeHtml(formatLatency(ms, state.testing))}</span>
        ${pinButton}
      </span>
    </div>
  `;
}

function renderLineList() {
  const mirrors = getMirrorLines();
  const books = getBookLines();
  const active = getActiveLineId();
  const settings = getSettings();

  const mirrorHtml = mirrors
    .map((line, index) => lineRow(line, `线路 ${index + 1}`, active, settings, true))
    .join("");
  const bookHtml = books
    .map((line, index) => lineRow(line, `书源 ${index + 1}`, active, settings, false))
    .join("");

  els.lineList.innerHTML = `
    <div class="line-group-title">镜像线路 · Olib（${mirrors.length} 条）</div>
    ${mirrorHtml}
    <div class="line-group-title">公有书源（${books.length} 条）</div>
    ${bookHtml}
  `;

  if (els.lineOnlineCount) {
    const total = mirrors.length + books.length;
    const online = [...mirrors, ...books].filter(
      (line) => (state.latencies[line.id] ?? -1) >= 0
    ).length;
    els.lineOnlineCount.textContent = state.testing
      ? `测速中 ${online}/${total}`
      : `在线 ${online}/${total}`;
  }
}

function openLinePicker() {
  renderLineList();
  refreshLineSummary();
  if (!els.lineDialog.open) els.lineDialog.showModal();
}

async function runSpeedTest() {
  if (state.testing) return;
  state.testing = true;
  refreshLineSummary();
  renderLineList();
  renderPinnedBanner();
  try {
    await probeAllLines((result) => {
      state.latencies = { ...state.latencies, [result.id]: result.latencyMs };
      saveLatencies(state.latencies);
      refreshLineSummary();
      renderLineList();
      renderPinnedBanner();
    });
  } finally {
    state.testing = false;
    refreshLineSummary();
    renderLineList();
  }
  await refreshPinnedUrl();
}

/* ------------------------------------------------------------------ */
/* 置顶网址（顶部公告 + 当前线路最新网址）                             */
/* ------------------------------------------------------------------ */

async function refreshPinnedUrl() {
  const settings = getSettings();
  const mirrors = getMirrorLines();
  const pinned = mirrors.find((line) => line.id === settings.pinnedLineId) || null;
  const target = pickPinnedLine({
    latencies: state.latencies,
    pinnedLineId: settings.pinnedLineId,
    lines: mirrors,
  });

  if (!target) {
    state.pinned = { lineId: null, url: null, ms: null, fallback: false, resolving: false };
    renderPinnedBanner();
    return null;
  }

  const fallback = Boolean(!pinned || target.id !== pinned.id);
  state.pinned = {
    lineId: target.id,
    url: state.pinned.lineId === target.id ? state.pinned.url : null,
    ms: state.latencies[target.id],
    fallback,
    resolving: true,
  };
  renderPinnedBanner();

  let url;
  if (target.kind !== "book") {
    url = (await resolveLineUrl(target)) || pinnedUrlOf(target);
  } else {
    url = pinnedUrlOf(target);
  }

  // 解析期间用户可能改了置顶线路
  if (getSettings().pinnedLineId !== settings.pinnedLineId) return url;

  state.pinned = {
    lineId: target.id,
    url,
    ms: state.latencies[target.id],
    fallback,
    resolving: false,
  };
  renderPinnedBanner();
  return url;
}

function renderPinnedBanner() {
  const { lineId, url, ms, fallback, resolving } = state.pinned;
  if (!els.pinnedBanner) return;
  els.pinnedBanner.hidden = false;
  if (els.pinnedDiscover) els.pinnedDiscover.disabled = state.testing;

  if (!lineId) {
    els.pinnedUrl.textContent = state.testing
      ? "正在测速并发现可用线路…"
      : "尚未发现可用线路";
    els.pinnedUrl.title = "";
    els.pinnedOpen.dataset.url = "";
    els.pinnedOpen.disabled = true;
    els.pinnedMeta.textContent = state.testing
      ? "会自动选择最快在线线路"
      : "点「发现新网址」重新检测线路";
    refreshSettingPinnedUrl();
    return;
  }

  const line = getLine(lineId);
  els.pinnedUrl.textContent = resolving
    ? url || "正在解析最新网址…"
    : url || "未解析到网址";
  els.pinnedUrl.title = url || "";
  els.pinnedOpen.dataset.url = url || "";
  els.pinnedOpen.disabled = !url;

  const msText = formatLatency(ms, state.testing);
  const prefix = fallback ? "置顶线路不可用，已回退 · " : "置顶线路 · ";
  els.pinnedMeta.textContent = `${prefix}${labelOf(line)} · ${line.name} · ${msText}`;
  refreshSettingPinnedUrl();
}

function refreshSettingPinnedUrl() {
  if (!els.settingPinnedUrl) return;
  const url = state.pinned.url;
  els.settingPinnedUrl.textContent = url || "尚未解析";
  els.settingPinnedUrl.title = url || "";
  els.settingPinnedOpen.dataset.url = url || "";
  els.settingPinnedOpen.disabled = !url;
}

function populatePinnedLineSelect() {
  if (!els.settingPinnedLine) return;
  const lines = getMirrorLines();
  const settings = getSettings();
  els.settingPinnedLine.innerHTML = lines
    .map(
      (line, index) =>
        `<option value="${escapeAttr(line.id)}">线路 ${index + 1} · ${escapeHtml(line.name)}</option>`
    )
    .join("");
  const chosen = lines.some((line) => line.id === settings.pinnedLineId)
    ? settings.pinnedLineId
    : lines.find((line) => line.id === "mirror:bookroom.lifestyle")?.id ||
      lines[0]?.id ||
      "";
  els.settingPinnedLine.value = chosen;
}

async function discoverNewUrl() {
  if (state.testing) return;
  setStatus("正在发现新线路与最新置顶网址…");
  await runSpeedTest();
  const lines = getLines();
  const online = lines.filter((line) => (state.latencies[line.id] ?? -1) >= 0).length;
  setStatus(
    state.pinned.url
      ? `已检测 ${online}/${lines.length} 条在线线路，置顶网址已更新。`
      : `已检测 ${online}/${lines.length} 条在线线路，但暂未解析到置顶网址，可稍后重试。`
  );
}

/* ------------------------------------------------------------------ */
/* 当前线路的站点卡片（跳转线路解析 / 官网 / 站点搜索 / 登录注册）     */
/* ------------------------------------------------------------------ */

function buildSiteSearchUrl(line, query = "") {
  if (!line?.searchUrl) return null;
  if (!line.searchUrl.includes("{q}")) return line.searchUrl;
  return line.searchUrl.replaceAll("{q}", encodeURIComponent(query || ""));
}

function registrationUrl(line, baseUrl) {
  if (!line?.registrationPath) return null;
  const base = baseUrl || line.pinnedUrl || line.siteUrl;
  if (!base) return null;
  try {
    const url = new URL(base);
    url.pathname = line.registrationPath;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function openUrl(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function refreshLineSite(line = getLine(getSettings().lineId)) {
  if (!line) {
    els.lineSiteCard.hidden = true;
    return null;
  }

  const jump = line.kind !== "book";
  const entry = jump ? siteEntry(line) : pinnedUrlOf(line);
  if (!entry && !line.searchUrl) {
    els.lineSiteCard.hidden = true;
    return null;
  }

  els.lineSiteCard.hidden = false;
  els.lineSiteTitle.textContent = `${labelOf(line)} · ${line.name}`;

  let url = state.siteUrls[line.id];
  if (!url) {
    if (jump) {
      els.lineSiteUrl.textContent = "正在解析最新网址…";
      els.lineSiteOpen.dataset.url = entry || "";
      url = (await resolveLineUrl(line)) || entry;
    } else {
      url = entry;
    }
    state.siteUrls[line.id] = url;
  }

  // 解析是异步的，期间用户可能已切到别的线路
  if (getActiveLineId() !== line.id) return url;

  els.lineSiteUrl.textContent = url || "—";
  els.lineSiteUrl.title = url || "";
  els.lineSiteOpen.dataset.url = url || "";
  els.lineSiteOpen.disabled = !url;
  els.lineSiteOpen.textContent = jump ? "打开站点" : "打开官网";

  const searchUrl = buildSiteSearchUrl(line, state.query);
  els.lineSiteSearch.hidden = !searchUrl;
  els.lineSiteSearch.dataset.url = searchUrl || "";
  els.lineSiteSearch.disabled = !searchUrl;
  els.lineSiteSearch.textContent = state.query
    ? `在站点搜索「${state.query}」`
    : "在站点搜索";

  const loginUrl = registrationUrl(line, url);
  els.lineSiteLogin.hidden = !loginUrl;
  els.lineSiteLogin.dataset.url = loginUrl || "";

  els.lineSiteHint.textContent = jump
    ? "镜像线路：点「打开站点」后网站会自动跳转到最新地址；登录/注册走官网入口。"
    : "公有书源官方网址；应用内搜索使用当前书源数据。";
  return url;
}

async function selectLine(lineId) {
  const same = lineId === getActiveLineId();
  if (!same) {
    setActiveLineId(lineId);
    state.page = 1;
  }
  refreshLineSummary();
  renderLineList();
  if (els.lineDialog.open) els.lineDialog.close();
  switchView("home");
  await refreshPinnedUrl();
  await loadBooks({ query: state.query, page: 1 });
}

/* ------------------------------------------------------------------ */
/* 书籍列表 / 书架                                                     */
/* ------------------------------------------------------------------ */

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

  if (!isSearchable(line)) {
    state.books = [];
    state.next = null;
    state.previous = null;
    renderBooks(els.grid, []);
    updatePager();
    els.title.textContent = query ? `搜索「${query}」` : "热门推荐";
    els.meta.textContent = `${labelOf(line)} · ${line.name}`;
    const searchUrl = buildSiteSearchUrl(line, query);
    setStatus(
      searchUrl
        ? `「${line.name}」是镜像线路：点上方「在站点搜索」打开最新站点；应用内搜索请切换到公有书源。`
        : `「${line.name}」是镜像线路，请从上方打开站点。`
    );
    refreshLineSite(line);
    return;
  }

  state.loading = true;
  updatePager();
  setStatus(`正在从 ${line.name} 加载…`);
  refreshLineSite(line);

  try {
    const data = await fetchBooks({
      source: line.api,
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
      els.meta.textContent = `${labelOf(line)} · 约 ${Number(data.count).toLocaleString()} 本 · 第 ${page} 页`;
    } else {
      els.title.textContent = "热门推荐";
      els.meta.textContent = `${labelOf(line)} · ${line.name}`;
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
  if (!els.dialog.open) els.dialog.showModal();

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

/* ------------------------------------------------------------------ */
/* 设置                                                               */
/* ------------------------------------------------------------------ */

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

function bindPinnedSettings() {
  populatePinnedLineSelect();
  els.settingPinnedLine?.addEventListener("change", () => {
    saveSettings({ pinnedLineId: els.settingPinnedLine.value });
    renderLineList();
    refreshPinnedUrl();
  });
  els.settingPinnedOpen?.addEventListener("click", () => {
    openUrl(els.settingPinnedOpen.dataset.url);
  });
  els.settingPinnedRefresh?.addEventListener("click", async () => {
    await refreshPinnedUrl();
    setStatus(state.pinned.url ? "置顶网址已重新解析。" : "暂未解析到置顶网址，可稍后重试。");
  });
}

function renderCustomLines() {
  if (!els.customLineList) return;
  const lines = getCustomLines();
  if (!lines.length) {
    els.customLineList.innerHTML =
      '<p class="muted small">还没有自定义线路。填好下方表单即可添加。</p>';
    return;
  }
  els.customLineList.innerHTML = lines
    .map(
      (line) => `
        <div class="custom-line-item">
          <div class="custom-line-info">
            <strong>${escapeHtml(line.name)}</strong>
            <span class="muted small">${escapeHtml(line.searchUrl || line.siteUrl || "")}</span>
          </div>
          <button type="button" class="btn ghost danger" data-remove-line="${escapeAttr(line.id)}">删除</button>
        </div>
      `
    )
    .join("");
}

function bindCustomLines() {
  renderCustomLines();

  els.customLineForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = els.customName.value.trim();
    const searchUrl = els.customSearch.value.trim();
    const pinnedUrl = els.customPinned.value.trim();

    if (!name) {
      setStatus("请填写线路名称。", true);
      return;
    }
    if (!/^https?:\/\//i.test(searchUrl)) {
      setStatus("搜索网址需要以 http(s):// 开头。", true);
      return;
    }
    if (!searchUrl.includes("{q}")) {
      setStatus("搜索网址里请包含 {q} 作为关键词占位符。", true);
      return;
    }
    if (pinnedUrl && !/^https?:\/\//i.test(pinnedUrl)) {
      setStatus("置顶网址需要以 http(s):// 开头。", true);
      return;
    }

    addCustomLine({ name, searchUrl, pinnedUrl });
    els.customLineForm.reset();
    renderCustomLines();
    populatePinnedLineSelect();
    renderLineList();
    setStatus(`已添加自定义线路「${name}」，可在「切换线路」里选择。`);
  });

  els.customLineList?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-line]");
    if (!btn) return;
    if (!confirm("删除这条自定义线路？")) return;

    removeCustomLine(btn.dataset.removeLine);
    if (!getLines().some((line) => line.id === getActiveLineId())) {
      setActiveLineId("mirror:bookroom.lifestyle");
    }
    if (!getLines().some((line) => line.id === getSettings().pinnedLineId)) {
      saveSettings({ pinnedLineId: "mirror:bookroom.lifestyle" });
    }

    renderCustomLines();
    populatePinnedLineSelect();
    renderLineList();
    refreshLineSummary();
    refreshPinnedUrl();
    loadBooks({ query: state.query, page: 1 });
    setStatus("已删除该自定义线路。");
  });
}

function migrateSettings() {
  const settings = getSettings();
  const updates = {};
  if (!getLines().some((line) => line.id === settings.lineId)) {
    updates.lineId = "mirror:bookroom.lifestyle";
  }
  if (!getMirrorLines().some((line) => line.id === settings.pinnedLineId)) {
    updates.pinnedLineId = "mirror:bookroom.lifestyle";
  }
  if (Object.keys(updates).length) saveSettings(updates);
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

/* ------------------------------------------------------------------ */
/* 事件绑定                                                           */
/* ------------------------------------------------------------------ */

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

  const line = getLine(getSettings().lineId);
  if (!isSearchable(line)) {
    // 跳转线路：直接打开站点的搜索页（用户主动提交，不会被弹窗拦截）
    const url = buildSiteSearchUrl(line, q);
    if (url) openUrl(url);
    state.query = q;
    loadBooks({ query: q, page: 1 });
    return;
  }

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
  const pin = event.target.closest("[data-pin]");
  if (pin) {
    event.preventDefault();
    saveSettings({ pinnedLineId: pin.dataset.pin });
    populatePinnedLineSelect();
    renderLineList();
    refreshPinnedUrl();
    return;
  }
  const item = event.target.closest("[data-line]");
  if (!item) return;
  selectLine(item.dataset.line);
});

els.lineList?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.target.closest("[data-pin]")) return;
  const item = event.target.closest("[data-line]");
  if (!item) return;
  event.preventDefault();
  selectLine(item.dataset.line);
});

els.pinnedOpen?.addEventListener("click", () => openUrl(els.pinnedOpen.dataset.url));
els.pinnedDiscover?.addEventListener("click", discoverNewUrl);

els.lineSiteOpen?.addEventListener("click", () => {
  openUrl(els.lineSiteOpen.dataset.url);
});

els.lineSiteSearch?.addEventListener("click", () => {
  openUrl(els.lineSiteSearch.dataset.url);
});

els.lineSiteLogin?.addEventListener("click", () => {
  openUrl(els.lineSiteLogin.dataset.url);
});

els.lineSiteRefresh?.addEventListener("click", async () => {
  const line = getLine(getSettings().lineId);
  delete state.siteUrls[line.id];
  await refreshLineSite(line);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

migrateSettings();
bindSettings();
bindPinnedSettings();
bindCustomLines();
refreshLineSummary();
renderRecent();
loadBooks({ query: "", page: 1 });
runSpeedTest();
