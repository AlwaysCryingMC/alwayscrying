/* =====================================================================
   共享工具库：Markdown 渲染、日期、配色、静态文章加载
   文章是仓库里的 Markdown 文件，列表在 posts/index.json。
   ===================================================================== */

/* ---------- DOM 小工具 ---------- */
export const qs  = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, ms = 2600) {
  let el = qs(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), ms);
}

/* ---------- 滚动入场动画 ---------- */
export function observeReveals() {
  const els = qsa(".reveal");
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  els.forEach((el) => io.observe(el));
}

/* ---------- 日期格式化（兼容 Date / 字符串 / 秒） ---------- */
export function formatDate(v) {
  if (!v && v !== 0) return "";
  let d;
  if (v && typeof v.toDate === "function") d = v.toDate();
  else if (v && typeof v.seconds === "number") d = new Date(v.seconds * 1000);
  else d = new Date(v);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

/* ---------- 封面渐变色板（按标题/slug 取色） ---------- */
const SWATCHES = [
  ["#ff5c8a", "#e63e6f"],
  ["#2ec4b6", "#1da093"],
  ["#7b5cff", "#5a3fe0"],
  ["#ffb347", "#ff8c42"],
  ["#5ac8fa", "#0a84ff"],
  ["#c084fc", "#9333ea"],
];
export function swatchFor(post = {}) {
  const seed = String(post.slug || post.id || post.title || "x");
  const idx = Math.abs(seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % SWATCHES.length;
  const [a, b] = SWATCHES[idx];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

/* ---------- 文章 emoji（按标签） ---------- */
const EMOJI = { 设计: "🎨", design: "🎨", 日记: "🌸", life: "🌸", 代码: "💻", code: "💻",
  技术: "⚙️", tech: "⚙️", 音乐: "🎵", 想法: "💭", 随笔: "✒️", 旅行: "✈️", 摄影: "📷",
  心情: "🌧️", 诗: "📜", 阅读: "📚", 美食: "🍜" };
export function postEmoji(post = {}) {
  const t = (post.tags || [])[0];
  return (t && (EMOJI[t.toLowerCase()] || EMOJI[t])) || "✦";
}

/* ---------- 安全的 Markdown → HTML ---------- */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
export function renderMarkdown(src = "") {
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let listType = null;
  let i = 0;
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (/^```/.test(trimmed)) {                       // 代码块
      closeList();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (trimmed === "") { closeList(); i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(trimmed);      // 标题
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) { closeList(); out.push("<hr>"); i++; continue; }
    if (/^>\s?/.test(trimmed)) {                       // 引用
      closeList();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { buf.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`); continue;
    }
    if (/^[-*+]\s+/.test(trimmed)) {                   // 无序列表
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push(`<li>${inline(trimmed.replace(/^[-*+]\s+/, ""))}</li>`); i++; continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {                   // 有序列表
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push(`<li>${inline(trimmed.replace(/^\d+\.\s+/, ""))}</li>`); i++; continue;
    }
    closeList();                                       // 段落
    const buf = [];
    while (i < lines.length && lines[i].trim() !== "" &&
      !/^(#{1,4}\s|>\s?|[-*+]\s|\d+\.\s|```|---\s*$|\*\*\*\s*$)/.test(lines[i].trim())) {
      buf.push(lines[i].trim()); i++;
    }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  closeList();
  return out.join("\n");
}

/* ---------- 静态文章加载 ---------- */
export async function getPosts({ limit = 100, publishedOnly = true } = {}) {
  const res = await fetch("posts/index.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("读取文章列表失败（posts/index.json）");
  let posts = await res.json();
  if (publishedOnly) posts = posts.filter((p) => p.published !== false);
  posts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return posts.slice(0, limit);
}

export async function getPost(slug) {
  if (!slug) return null;
  const all = await getPosts({ publishedOnly: false });
  const meta = all.find((p) => p.slug === slug);
  if (!meta) return null;
  const res = await fetch(`posts/${slug}.md`, { cache: "no-cache" });
  const content = res.ok ? await res.text() : "*（正文加载失败，请确认 posts/" + slug + ".md 存在）*";
  return { ...meta, content };
}

/* ---------- 文章卡片 HTML 模板 ---------- */
export function postCardTemplate(post, featured = false) {
  const id = post.slug || post.id;
  const href = `post.html?id=${encodeURIComponent(id)}`;
  const tag = (post.tags || [])[0] || "随笔";
  const date = formatDate(post.date || post.createdAt) || "—";
  return `
  <article class="card ${featured ? "featured" : ""} reveal">
    <a class="card-cover" href="${href}" aria-label="${escapeHtml(post.title)}">
      <span class="swatch" style="background:${swatchFor(post)}"></span>
      <span class="emoji">${postEmoji(post)}</span>
    </a>
    <div class="card-body">
      <div class="card-meta"><span class="tag">${escapeHtml(tag)}</span><span>·</span><span>${date}</span></div>
      <h3><a href="${href}">${escapeHtml(post.title)}</a></h3>
      <p>${escapeHtml(post.excerpt || "")}</p>
      <a class="more" href="${href}">继续阅读
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </a>
    </div>
  </article>`;
}
