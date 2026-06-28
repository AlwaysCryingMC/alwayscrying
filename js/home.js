/* 首页逻辑：移动端菜单、文章卡片渲染、统计数字 */
import {
  qs, qsa, observeReveals,
  postCardTemplate, getPosts,
} from "./lib.js";

/* ---------- 移动端菜单 ---------- */
const toggle = qs(".nav-toggle");
const links = qs("#navLinks");
toggle?.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
});
qsa(".nav-links a").forEach((a) =>
  a.addEventListener("click", () => links.classList.remove("open"))
);

/* ---------- 当前年份 ---------- */
const yearEl = qs("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------- 渲染最新文章 ---------- */
async function renderLatest() {
  const grid = qs("#latestCards");
  if (!grid) return;
  try {
    const posts = await getPosts({ limit: 3 });
    if (!posts.length) {
      grid.innerHTML = `<p class="empty" style="grid-column:1/-1"><span class="big">✦</span>还没有文章。在仓库 <code>posts/</code> 文件夹里加一篇 Markdown 就会出现啦（见 README）。</p>`;
    } else {
      grid.innerHTML = posts
        .map((p, i) => postCardTemplate(p, i === 0 && posts.length > 1))
        .join("");
    }
    qs("#statPosts").textContent = await countPosts();
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="empty" style="grid-column:1/-1">文章加载失败，请确认 posts/index.json 存在且格式正确（见 README）。</p>`;
  }
  observeReveals();
}

async function countPosts() {
  try {
    const all = await getPosts({ limit: 100 });
    return all.length;
  } catch { return "—"; }
}

/* ---------- 启动 ---------- */
renderLatest();
document.addEventListener("DOMContentLoaded", observeReveals);
