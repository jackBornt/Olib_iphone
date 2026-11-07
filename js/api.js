const GUTENDEX = "https://gutendex.com/books/";
const OPEN_LIBRARY = "https://openlibrary.org";
const ARCHIVE = "https://archive.org";

function authorsOf(book) {
  if (!book.authors?.length) return "佚名";
  return book.authors.map((a) => a.name || a).join(" · ");
}

function coverOfGutendex(book) {
  return book.formats?.["image/jpeg"] || null;
}

function pickGutendexFormats(book) {
  const formats = book.formats || {};
  const links = [];
  const html = formats["text/html"] || formats["text/html; charset=utf-8"];
  const epub = Object.entries(formats).find(([type]) => type.includes("epub"));
  const txt = formats["text/plain; charset=utf-8"] || formats["text/plain"];

  if (html) links.push({ label: "在线阅读 (HTML)", href: html, primary: true });
  if (epub) links.push({ label: "下载 EPUB", href: epub[1], primary: false });
  if (txt) links.push({ label: "纯文本", href: txt, primary: false });
  links.push({
    label: "Gutenberg 页面",
    href: `https://www.gutenberg.org/ebooks/${book.id}`,
    primary: false,
  });
  return links;
}

function normalizeGutendex(book) {
  return {
    id: `gutenberg:${book.id}`,
    sourceId: String(book.id),
    source: "gutenberg",
    title: book.title,
    authors: authorsOf(book),
    cover: coverOfGutendex(book),
    languages: book.languages || [],
    subjects: (book.subjects || []).slice(0, 6),
    summaries: book.summaries || [],
    links: pickGutendexFormats(book),
  };
}

function normalizeOpenLibrary(doc) {
  const workKey = doc.key || "";
  const olid = workKey.replace("/works/", "") || doc.edition_key?.[0] || doc.cover_edition_key;
  const coverId = doc.cover_i;
  const cover = coverId
    ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
    : null;
  const authors = doc.author_name?.join(" · ") || "佚名";
  const href = olid
    ? `${OPEN_LIBRARY}/works/${String(olid).replace(/^\/works\//, "")}`
    : `${OPEN_LIBRARY}${workKey}`;

  return {
    id: `openlibrary:${olid || workKey}`,
    sourceId: String(olid || workKey),
    source: "openlibrary",
    title: doc.title || "无标题",
    authors,
    cover,
    languages: (doc.language || []).slice(0, 4),
    subjects: (doc.subject || []).slice(0, 6),
    summaries: doc.first_sentence
      ? [Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : doc.first_sentence]
      : [],
    links: [
      { label: "Open Library 页面", href, primary: true },
      {
        label: "Internet Archive 搜索",
        href: `https://archive.org/search?query=${encodeURIComponent(doc.title || "")}`,
        primary: false,
      },
    ],
  };
}

function normalizeArchive(doc) {
  const id = doc.identifier;
  const title = Array.isArray(doc.title) ? doc.title[0] : doc.title || "无标题";
  const creator = Array.isArray(doc.creator) ? doc.creator.join(" · ") : doc.creator || "佚名";
  const cover = id ? `https://archive.org/services/img/${id}` : null;
  const desc = Array.isArray(doc.description) ? doc.description[0] : doc.description;

  return {
    id: `archive:${id}`,
    sourceId: String(id),
    source: "archive",
    title,
    authors: creator,
    cover,
    languages: [],
    subjects: (Array.isArray(doc.subject) ? doc.subject : doc.subject ? [doc.subject] : []).slice(0, 6),
    summaries: desc ? [String(desc).slice(0, 400)] : [],
    links: [
      { label: "在 Archive 阅读", href: `${ARCHIVE}/details/${id}`, primary: true },
      { label: "下载页", href: `${ARCHIVE}/download/${id}`, primary: false },
    ],
  };
}

async function fetchGutendex({ query = "", page = 1, lang = "", pageSize = 24 } = {}) {
  const url = new URL(GUTENDEX);
  url.searchParams.set("page", String(page));
  if (query.trim()) url.searchParams.set("search", query.trim());
  if (lang) url.searchParams.set("languages", lang);
  if (!query.trim()) url.searchParams.set("sort", "popular");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Gutenberg 请求失败（${res.status}）`);
  const data = await res.json();
  const books = (data.results || []).map(normalizeGutendex).slice(0, pageSize);
  return {
    count: data.count || books.length,
    next: data.next,
    previous: data.previous,
    books,
  };
}

async function fetchOpenLibrary({ query = "", page = 1, lang = "", pageSize = 24 } = {}) {
  const q = query.trim() || "subject:accessible_book";
  const url = new URL(`${OPEN_LIBRARY}/search.json`);
  url.searchParams.set("q", q);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(pageSize));
  if (lang) url.searchParams.set("language", lang);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open Library 请求失败（${res.status}）`);
  const data = await res.json();
  const docs = data.docs || [];
  const books = docs.map(normalizeOpenLibrary);
  const numFound = data.numFound || books.length;
  const hasMore = page * pageSize < numFound;
  return {
    count: numFound,
    next: hasMore ? true : null,
    previous: page > 1 ? true : null,
    books,
  };
}

async function fetchArchive({ query = "", page = 1, pageSize = 24 } = {}) {
  const q = query.trim()
    ? `(${query.trim()}) AND mediatype:texts`
    : "mediatype:texts AND collection:opensource";
  const url = new URL(`${ARCHIVE}/advancedsearch.php`);
  url.searchParams.set("q", q);
  url.searchParams.append("fl[]", "identifier");
  url.searchParams.append("fl[]", "title");
  url.searchParams.append("fl[]", "creator");
  url.searchParams.append("fl[]", "description");
  url.searchParams.append("fl[]", "subject");
  url.searchParams.set("rows", String(pageSize));
  url.searchParams.set("page", String(page));
  url.searchParams.set("output", "json");
  url.searchParams.set("sort[]", "downloads desc");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Internet Archive 请求失败（${res.status}）`);
  const data = await res.json();
  const response = data.response || {};
  const docs = response.docs || [];
  const books = docs.map(normalizeArchive);
  const numFound = response.numFound || books.length;
  const hasMore = page * pageSize < numFound;
  return {
    count: numFound,
    next: hasMore ? true : null,
    previous: page > 1 ? true : null,
    books,
  };
}

export async function fetchBooks({
  source = "gutenberg",
  query = "",
  page = 1,
  lang = "",
  pageSize = 24,
} = {}) {
  if (source === "openlibrary") {
    return fetchOpenLibrary({ query, page, lang, pageSize });
  }
  if (source === "archive") {
    return fetchArchive({ query, page, pageSize });
  }
  return fetchGutendex({ query, page, lang, pageSize });
}

export async function fetchBookById(id) {
  if (String(id).startsWith("gutenberg:")) {
    const num = String(id).split(":")[1];
    const res = await fetch(`${GUTENDEX}${num}`);
    if (!res.ok) throw new Error(`无法加载书籍详情（${res.status}）`);
    return normalizeGutendex(await res.json());
  }
  throw new Error("当前线路的详情已在列表中提供");
}
