/* 前端发布：用 GitHub REST API + Token，把文章写进仓库 */
import { qs, qsa, toast, formatDate, escapeHtml } from "./lib.js";

const yearEl = qs("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

const STORE = "ac_admin_cfg";
let CFG = null;

function loadCfg() { try { CFG = JSON.parse(localStorage.getItem(STORE) || "null"); } catch { CFG = null; } }
function saveCfg(c) { localStorage.setItem(STORE, JSON.stringify(c)); CFG = c; }

function showConfig() {
  qs("#configView").classList.remove("hidden");
  qs("#editorView").classList.add("hidden");
  qs("#commentsView").classList.add("hidden");
  qs("#mainTabs").classList.add("hidden");
}
function showEditor() {
  qs("#configView").classList.add("hidden");
  qs("#commentsView").classList.add("hidden");
  qs("#editorView").classList.remove("hidden");
  qs("#mainTabs").classList.remove("hidden");
  qs("#repoTag").textContent = `${CFG.owner}/${CFG.repo}`;
  switchTab("posts");
  resetForm();
  loadList();
}

function cfgMsg(m) { const el = qs("#cfgMsg"); el.textContent = m; el.classList.remove("hidden"); }
function resetForm() {
  const f = qs("#editForm"); if (f.reset) f.reset();
  qs("#date").value = new Date().toISOString().slice(0, 10);
  qs("#published").checked = true;
}

/* ===== 后台密码门禁 =====
   PASSWORD_HASH 是你密码的 SHA-256 十六进制哈希。
   用 make-password.html 生成后粘到这里（哈希可公开，明文密码不要写进代码）。
   留空 = 门禁未启用（任何人都能看到界面，仅靠 Token 保护）。*/
const PASSWORD_HASH = "66bd57655c2b03a67b933766884869472579e76fac144b3553a3f1a6c879bb03";
const UNLOCK_KEY = "ac_admin_unlock";

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function hashPw(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return toHex(buf);
}

const loginView = qs("#loginView");
const appView = qs("#appView");
let fails = 0;
let lockedUntil = 0;

function unlockApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  loadCfg();
  if (CFG && CFG.token) showEditor(); else showConfig();
}

function initGate() {
  const pwBtn = qs("#pwBtn");
  const hint = qs("#pwHint");
  if (!PASSWORD_HASH) {
    hint.innerHTML = "⚠️ 后台密码还没设置：请打开 <code>make-password.html</code> 生成哈希，粘到 <code>js/admin.js</code> 的 <code>PASSWORD_HASH</code>，再提交到 GitHub。";
    pwBtn.disabled = true;
    return;
  }
  // 同一标签页已解锁过 → 免重输（关标签页失效）
  if (sessionStorage.getItem(UNLOCK_KEY) === "1") { unlockApp(); return; }
  qs("#pwInput").focus();
}

qs("#pwBtn").addEventListener("click", async () => {
  if (Date.now() < lockedUntil) { toast(`等一会儿再试（${Math.ceil((lockedUntil - Date.now()) / 1000)}s）`); return; }
  const ok = (await hashPw(qs("#pwInput").value)) === PASSWORD_HASH;
  if (ok) { sessionStorage.setItem(UNLOCK_KEY, "1"); fails = 0; unlockApp(); toast("欢迎回来 ✨"); return; }
  fails++;
  if (fails >= 5) { lockedUntil = Date.now() + 30000; fails = 0; toast("错误次数过多，30 秒后再试"); }
  else toast("密码不对，再试试");
  qs("#pwInput").select();
});

qs("#pwInput").addEventListener("keydown", (e) => { if (e.key === "Enter") qs("#pwBtn").click(); });

/* ---------- 启动 ---------- */
initGate();

/* ---------- 保存配置 ---------- */
qs("#saveCfg").addEventListener("click", () => {
  const owner = qs("#owner").value.trim();
  const repo = qs("#repo").value.trim();
  const branch = qs("#branch").value.trim() || "main";
  const token = qs("#token").value.trim();
  if (!owner || !repo || !token) return cfgMsg("请填写用户名、仓库名和 Token");
  saveCfg({ owner, repo, branch, token });
  toast("配置已保存 ✅");
  showEditor();
});

qs("#clearBtn").addEventListener("click", () => {
  if (!confirm("清除本浏览器保存的配置和 Token？")) return;
  localStorage.removeItem(STORE); CFG = null; showConfig();
  toast("已清除配置");
});

qs("#resetBtn").addEventListener("click", resetForm);

/* ---------- GitHub API ---------- */
const API = "https://api.github.com";
async function gh(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${CFG.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.message || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}
const b64enc = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64dec = (b) => new TextDecoder().decode(Uint8Array.from(atob(String(b).replace(/\s/g, "")), (c) => c.charCodeAt(0)));

async function getFile(path) { return gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${path}?ref=${CFG.branch}`, {}); }
async function putFile(path, content, message, sha) {
  const body = { message, content: b64enc(content), branch: CFG.branch };
  if (sha) body.sha = sha;
  return gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${path}`, { method: "PUT", body: JSON.stringify(body) });
}
async function deleteFile(path, sha, message) {
  return gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${path}`, {
    method: "DELETE", body: JSON.stringify({ message, sha, branch: CFG.branch }),
  });
}

/* ---------- slug ---------- */
function makeSlug() {
  const custom = qs("#slug").value.trim();
  if (custom) return custom.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase().replace(/-+/g, "-");
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* ---------- 发布 ---------- */
qs("#editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = qs("#title").value.trim();
  if (!title) return toast("请填写标题");
  const slug = makeSlug();
  const date = qs("#date").value || new Date().toISOString().slice(0, 10);
  const tags = qs("#tags").value.split(",").map((s) => s.trim()).filter(Boolean);
  const excerpt = qs("#excerpt").value.trim();
  const content = qs("#content").value || `# ${title}\n`;
  const published = qs("#published").checked;

  const btn = qs("#pubBtn"); btn.disabled = true; btn.textContent = "发布中…";
  qs("#pubHint").textContent = "正在写入 GitHub…";
  try {
    // 1. 写 .md（已存在则更新）
    let mdSha = null;
    try { const ex = await getFile(`posts/${slug}.md`); mdSha = ex.sha; } catch (_) {}
    await putFile(`posts/${slug}.md`, content, `发布文章: ${title}${mdSha ? "（更新）" : ""}`, mdSha);

    // 2. 更新 index.json
    const idx = await getFile("posts/index.json");
    const list = JSON.parse(b64dec(idx.content));
    const entry = { slug, title, date, tags, excerpt, published };
    const i = list.findIndex((p) => p.slug === slug);
    if (i >= 0) list[i] = entry; else list.push(entry);
    await putFile("posts/index.json", JSON.stringify(list, null, 2) + "\n", `更新文章列表: ${title}`, idx.sha);

    toast(mdSha ? "已更新 ✅ 约 1 分钟后生效" : "已发布 ✨ 约 1 分钟后生效");
    resetForm();
    qs("#slug").value = "";
    loadList();
  } catch (err) {
    toast("发布失败：" + (err.message || err));
  } finally {
    btn.disabled = false; btn.textContent = "发布文章";
    qs("#pubHint").textContent = "";
  }
});

/* ---------- 文章列表 / 编辑 / 删除 ---------- */
async function loadList() {
  const box = qs("#postList");
  try {
    const list = await fetch("posts/index.json", { cache: "no-cache" }).then((r) => r.json());
    list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (!list.length) { box.innerHTML = `<p class="s">还没有文章。</p>`; return; }
    box.innerHTML = list.map((p) => `
      <div class="post-list-item" data-slug="${escapeHtml(p.slug)}">
        <div style="min-width:0;cursor:pointer" data-load="${escapeHtml(p.slug)}">
          <div class="t">${escapeHtml(p.title || "(无标题)")}</div>
          <div class="s">${formatDate(p.date) || "—"} · ${p.published === false ? "草稿" : "已发布"} · ${escapeHtml(p.slug)}</div>
        </div>
        <button class="icon-btn danger" data-del="${escapeHtml(p.slug)}" title="删除" aria-label="删除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>`).join("");
    qsa("#postList [data-del]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); del(b.dataset.del); }));
    qsa("#postList [data-load]").forEach((el) => el.addEventListener("click", () => loadIntoEditor(el.dataset.load)));
  } catch (e) {
    box.innerHTML = `<p class="s">读取列表失败：${escapeHtml(String(e.message || e))}</p>`;
  }
}

async function loadIntoEditor(slug) {
  try {
    const idx = await fetch("posts/index.json", { cache: "no-cache" }).then((r) => r.json());
    const meta = idx.find((p) => p.slug === slug);
    if (!meta) return toast("找不到这篇文章");
    const md = await fetch(`posts/${slug}.md`, { cache: "no-cache" }).then((r) => r.text());
    qs("#title").value = meta.title || "";
    qs("#date").value = meta.date || "";
    qs("#slug").value = meta.slug || slug;
    qs("#tags").value = (meta.tags || []).join(", ");
    qs("#excerpt").value = meta.excerpt || "";
    qs("#content").value = md;
    qs("#published").checked = meta.published !== false;
    toast("已载入，改完点「发布文章」即更新");
    qs("#editForm").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { toast("载入失败：" + (e.message || e)); }
}

async function del(slug) {
  if (!confirm(`确定删除《${slug}》？会从仓库移除文件和列表项。`)) return;
  try {
    const md = await getFile(`posts/${slug}.md`);
    await deleteFile(`posts/${slug}.md`, md.sha, `删除文章: ${slug}`);
    const idx = await getFile("posts/index.json");
    const list = JSON.parse(b64dec(idx.content)).filter((p) => p.slug !== slug);
    await putFile("posts/index.json", JSON.stringify(list, null, 2) + "\n", `更新文章列表（删除 ${slug}）`, idx.sha);
    toast("已删除 🗑️");
    loadList();
  } catch (e) { toast("删除失败：" + (e.message || e)); }
}

/* ---------- 评论管理（Giscus = GitHub Discussions，用 GraphQL）---------- */
const TRASH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${CFG.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (!res.ok || data.errors) throw new Error(data.errors?.[0]?.message || `HTTP ${res.status}`);
  return data.data;
}

function switchTab(which) {
  const posts = which === "posts";
  qs("#editorView").classList.toggle("hidden", !posts);
  qs("#commentsView").classList.toggle("hidden", posts);
  qs("#tabPosts").className = "btn " + (posts ? "btn-primary" : "btn-outline") + " tab";
  qs("#tabComments").className = "btn " + (!posts ? "btn-primary" : "btn-outline") + " tab";
  if (!posts) loadComments();
}

qs("#tabPosts").addEventListener("click", () => switchTab("posts"));
qs("#tabComments").addEventListener("click", () => switchTab("comments"));

async function loadComments() {
  const box = qs("#commentsBox");
  box.innerHTML = `<p class="s">加载中…</p>`;
  try {
    const data = await gql(
      `query($owner:String!,$repo:String!){ repository(owner:$owner,name:$repo){ discussions(first:100){ nodes { id title comments(first:100){ totalCount nodes { id body author { login } createdAt } } } } } }`,
      { owner: CFG.owner, repo: CFG.repo }
    );
    let titleMap = {};
    try { (await fetch("posts/index.json", { cache: "no-cache" }).then((r) => r.json())).forEach((p) => (titleMap[p.slug] = p.title)); } catch {}
    const discs = ((data?.repository?.discussions?.nodes) || []).filter((d) => (d.comments.nodes || []).length);
    if (!discs.length) {
      box.innerHTML = `<div class="banner teal">还没有评论。访客在文章底部用 GitHub 账号留言后，会出现在这里（约 1 分钟同步）。</div>`;
      return;
    }
    box.innerHTML = discs.map((d) => {
      const slug = d.title;
      const title = titleMap[slug] || slug;
      const cs = d.comments.nodes;
      return `<div class="panel" style="margin-bottom:1rem">
        <div class="t" style="margin-bottom:.3rem">📝 ${escapeHtml(title)}</div>
        <div class="s" style="margin-bottom:.6rem">${cs.length} 条评论 · ${escapeHtml(slug)}</div>
        ${cs.map((c) => `
          <div class="post-list-item" style="align-items:flex-start">
            <div style="min-width:0">
              <div class="s"><b>${escapeHtml(c.author?.login || "匿名")}</b> · ${formatDate(c.createdAt) || ""}</div>
              <div class="s" style="margin-top:.3rem;white-space:pre-wrap;word-break:break-word">${escapeHtml((c.body || "").slice(0, 300))}${c.body && c.body.length > 300 ? "…" : ""}</div>
            </div>
            <button class="icon-btn danger" data-delcmt="${escapeHtml(c.id)}" title="删除评论" aria-label="删除评论">${TRASH_SVG}</button>
          </div>`).join("")}
      </div>`;
    }).join("");
    qsa("#commentsBox [data-delcmt]").forEach((b) => b.addEventListener("click", () => delComment(b.dataset.delcmt, b)));
  } catch (e) {
    box.innerHTML = `<div class="banner">读取评论失败：${escapeHtml(String(e.message || e))}<br><span class="s">常见原因：Token 没有 Discussions 读权限，或还没安装 Giscus 应用。</span></div>`;
  }
}

async function delComment(id, btn) {
  if (!confirm("确定删除这条评论？")) return;
  if (btn) btn.disabled = true;
  try {
    await gql(`mutation($id:ID!){ deleteDiscussionComment(input:{id:$id}){ clientMutationId } }`, { id });
    toast("评论已删除 🗑️");
    loadComments();
  } catch (e) {
    toast("删除失败：" + (e.message || e) + "（确认 Token 有 Discussions 写权限）");
    if (btn) btn.disabled = false;
  }
}
