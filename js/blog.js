/* 博客列表页逻辑：加载全部文章、标签筛选 */
import {
  qs, qsa, observeReveals, escapeHtml,
  postCardTemplate, getPosts,
} from "./lib.js";

/* ---------- 移动端菜单 & 年份 ---------- */
const toggle = qs(".nav-toggle");
const links = qs("#navLinks");
toggle?.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
});
qsa(".nav-links a").forEach((a) =>
  a.addEventListener("click", () => links?.classList.remove("open"))
);
const yearEl = qs("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------- 状态 ---------- */
let ALL_POSTS = [];
let activeTag = "全部";

/* ---------- 渲染标签筛选 ---------- */
function renderTags() {
  const box = qs("#tagFilter");
  if (!box) return;
  const tagSet = ["全部"];
  ALL_POSTS.forEach((p) => (p.tags || []).forEach((t) => { if (!tagSet.includes(t)) tagSet.push(t); }));
  if (tagSet.length <= 1) { box.innerHTML = ""; return; }
  box.innerHTML = tagSet.map((t) => {
    const cls = t === activeTag ? "chip pink" : "chip";
    return `<button class="${cls}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
  }).join("");
  qsa("#tagFilter .chip").forEach((btn) =>
    btn.addEventListener("click", () => { activeTag = btn.dataset.tag; renderTags(); renderCards(); })
  );
}

/* ---------- 渲染卡片 ---------- */
function renderCards() {
  const grid = qs("#blogCards");
  if (!grid) return;
  const filtered = activeTag === "全部"
    ? ALL_POSTS
    : ALL_POSTS.filter((p) => (p.tags || []).includes(activeTag));
  if (!filtered.length) {
    grid.innerHTML = `<p class="empty" style="grid-column:1/-1"><span class="big">✦</span>这个标签下还没有文章。</p>`;
    return;
  }
  grid.innerHTML = filtered.map((p, i) => postCardTemplate(p, i === 0 && filtered.length > 2)).join("");
  observeReveals();
}

/* ---------- 启动 ---------- */
async function init() {
  const grid = qs("#blogCards");
  try {
    ALL_POSTS = await getPosts({ limit: 100 });
    if (!ALL_POSTS.length) {
      grid.innerHTML = `<p class="empty" style="grid-column:1/-1"><span class="big">✦</span>还没有文章。在仓库 <code>posts/</code> 文件夹里加一篇 Markdown 就会出现啦（见 README）。</p>`;
    } else {
      renderTags();
      renderCards();
    }
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="empty" style="grid-column:1/-1">文章加载失败，请确认 posts/index.json 存在且格式正确（见 README）。</p>`;
  }
}
init();
