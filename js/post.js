/* 文章详情页：读取 ?id=，渲染 Markdown 正文 + Giscus 评论 */
import {
  qs, qsa, escapeHtml, renderMarkdown, formatDate,
  swatchFor, postEmoji, getPost,
} from "./lib.js";

/* ===== Giscus 评论配置 =====
   去 https://giscus.app/ 配置一次，把 repoId / categoryId 填好，
   再把 enabled 改成 true，评论区就会出现。详见 README。
*/
const GISCUS = {
  enabled: false,
  repo: "AlwaysCryingMC/alwayscrying-art",
  repoId: "",            // 从 giscus.app 复制
  category: "Announcements",
  categoryId: "",        // 从 giscus.app 复制
};

/* ---------- 公共：菜单 & 年份 ---------- */
const toggle = qs(".nav-toggle");
const links = qs("#navLinks");
toggle?.addEventListener("click", () => {
  const o = links.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(o));
});
qsa(".nav-links a").forEach((a) =>
  a.addEventListener("click", () => links?.classList.remove("open"))
);
const yearEl = qs("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

let CURRENT_ID = null;

/* ---------- 找不到文章 ---------- */
function notFound() {
  qs("#post").innerHTML = `
    <a class="back-link" href="blog.html">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
      回到博客
    </a>
    <div class="empty">
      <div class="big">🫧</div>
      <h2 class="h2">这篇文章不见了</h2>
      <p>可能它还没发布，或者链接出错了。</p>
      <a class="btn btn-primary" href="blog.html" style="margin-top:1.5rem">看看其他文章</a>
    </div>`;
  document.title = "找不到文章 · AlwaysCrying";
}

/* ---------- 渲染文章 ---------- */
async function render() {
  const id = new URLSearchParams(location.search).get("id");
  const root = qs("#post");
  if (!id) { notFound(); return; }
  CURRENT_ID = id;
  try {
    const post = await getPost(id);
    if (!post) { notFound(); return; }

    document.title = `${post.title} · AlwaysCrying`;
    const date = formatDate(post.date || post.createdAt);
    const tags = (post.tags || []).map((t) => `<span class="chip pink">${escapeHtml(t)}</span>`).join("");

    root.innerHTML = `
      <a class="back-link" href="blog.html">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
        回到博客
      </a>
      <header class="article-head">
        <span class="eyebrow">${postEmoji(post)} ${escapeHtml((post.tags || [])[0] || "随笔")}</span>
        <h1 class="display" style="font-size:clamp(2.2rem,5vw,3.6rem);margin-top:.8rem">${escapeHtml(post.title)}</h1>
        <div class="meta"><span>${date}</span>${tags ? `<span class="chips" style="margin:0">${tags}</span>` : ""}</div>
      </header>
      <div class="article-cover"><span class="swatch" style="position:absolute;inset:0;background:${swatchFor(post)}"></span><span class="emoji" style="position:absolute;inset:0;display:grid;place-items:center;font-size:4rem">${postEmoji(post)}</span></div>
      <div class="prose" id="proseBody"></div>
      <hr style="border:0;height:1px;background:var(--line);margin:3rem 0" />
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center">
        <a class="btn btn-outline" href="blog.html">更多文章</a>
        <div class="socials">
          <a href="https://github.com/AlwaysCryingMC/" target="_blank" rel="noopener" aria-label="GitHub" title="GitHub"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5A11.5 11.5 0 0 0 .5 12 11.5 11.5 0 0 0 8.4 23c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 5 18 5.3 18 5.3c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z"/></svg></a>
          <a href="mailto:ytchatoyant@gmail.com" aria-label="Email" title="Email"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></a>
        </div>
      </div>

      <!-- 评论区（Giscus） -->
      <section class="comments" id="comments"></section>`;

    qs("#proseBody").innerHTML = renderMarkdown(post.content || "");
    mountGiscus();
  } catch (e) {
    console.error(e);
    notFound();
  }
}

/* ---------- 挂载 Giscus ---------- */
function mountGiscus() {
  const box = qs("#comments");
  if (!box) return;
  if (!GISCUS.enabled || !GISCUS.repoId || !GISCUS.categoryId) {
    box.innerHTML = `<h2 class="h3">评论</h2><p class="s">评论区还没启用 —— 作者配置好 Giscus 后这里就能留言（见 README）。</p>`;
    return;
  }
  box.innerHTML = `<h2 class="h3">评论</h2>`;
  const s = document.createElement("script");
  s.src = "https://giscus.app/client.js";
  s.crossOrigin = "anonymous";
  s.async = true;
  s.setAttribute("data-repo", GISCUS.repo);
  s.setAttribute("data-repo-id", GISCUS.repoId);
  s.setAttribute("data-category", GISCUS.category);
  s.setAttribute("data-category-id", GISCUS.categoryId);
  s.setAttribute("data-mapping", "specific");
  s.setAttribute("data-term", CURRENT_ID);
  s.setAttribute("data-strict", "0");
  s.setAttribute("data-reactions-enabled", "1");
  s.setAttribute("data-emit-metadata", "0");
  s.setAttribute("data-input-position", "top");
  s.setAttribute("data-theme", "light");
  s.setAttribute("data-lang", "zh-CN");
  s.setAttribute("data-loading", "lazy");
  box.appendChild(s);
}

render();
