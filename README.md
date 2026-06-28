# AlwaysCrying.art · 个人网站(GitHub Pages 静态博客)

一个**纯 HTML/CSS/JS** 的个人网站,博客文章是仓库里的 **Markdown 文件**,评论用 **Giscus**(基于 GitHub Discussions)。

- 🌐 托管在 **GitHub Pages**:免费、**国内能访问**、**不用备案**
- 📝 文章 = `posts/` 里的 `.md` 文件,在 GitHub 网页上写完提交就发布
- 💬 评论 = **Giscus**,访客用 GitHub 账号留言
- 🎨 粉/青/紫编辑感设计,系统字体(国内秒开,不依赖外网)

---

## 目录结构

```
alwayscrying/
├── index.html          # 首页
├── blog.html           # 博客列表(标签筛选)
├── post.html           # 文章详情(读 ?id= 渲染 Markdown + 评论)
├── 404.html
├── CNAME               # ← GitHub Pages 自定义域名(alwayscrying.art)
├── css/style.css
├── js/
│   ├── lib.js          # Markdown 渲染 / 日期 / 静态文章加载
│   ├── home.js blog.js post.js
├── posts/
│   ├── index.json      # ← 文章清单(标题/日期/标签/摘要)
│   └── *.md            # ← 每篇文章的正文
├── assets/             # 头像、favicon
└── README.md
```

---

## 🚀 上线四步走

### 第 1 步:本地预览(可选,先看看效果)

博客需要 `http://` 协议(不能直接双击 html)。在项目文件夹开终端:

```bash
python -m http.server 8000
# 然后浏览器打开 http://localhost:8000
```

能看到首页 + 3 篇示例文章就对了。

### 第 2 步:传到 GitHub

1. 去 <https://github.com/new> 新建仓库,名字随便(比如 `alwayscrying`),**Public**,不要勾 README(我们自己传)。
2. 把 `AlwaysCrying-art` 文件夹里**所有文件**(含 CNAME、css/js/posts/assets 子文件夹)传上去:
   - 最简单:仓库页面点 **「uploading an existing file」** → 把文件夹里的东西**全选拖进去** → 提交。
   - 或用 git:`git init && git add . && git commit -m "init" && git remote add origin <你的仓库地址> && git push -u origin main`

### 第 3 步:开启 GitHub Pages

仓库 **Settings → Pages**:
- **Source** 选 `Deploy from a branch`
- **Branch** 选 `main` / `(root)` → 保存

等 1-2 分钟,会得到一个 `https://alwayscryingmc.github.io/alwayscrying/` 的网址,打开就是你的网站!

### 第 4 步:绑定 alwayscrying.art

仓库里已经有 `CNAME` 文件(内容是 `alwayscrying.art`),GitHub 会自动认。再去**腾讯云 DNS(DNSPod)**加两条解析:

| 类型 | 主机记录 | 记录值 |
|------|----------|--------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `alwayscryingmc.github.io` |

> 这 4 个 IP 是 GitHub Pages 官方的(可能更新,见 <https://www.githubstatus.com/> 或 GitHub Pages 文档)。
> 域名要在腾讯云 DNS 解析里操作;`.art` 域名不用备案(GitHub 在境外)。

回 GitHub 仓库 **Settings → Pages → Custom domain** 填 `alwayscrying.art` → 保存,等几分钟,勾上 **Enforce HTTPS**。之后访问 `https://alwayscrying.art` 就是你的网站 🎉

---

## 💬 配置评论(Giscus,一次性)

1. 仓库 **Settings → 勾选 Discussions**(开启讨论区)
2. 打开 <https://giscus.app/>,在「仓库」填 `AlwaysCryingMC/alwayscrying`(你的仓库),点安装 Giscus
3. 页面下面会让你选 mapping,选 **「特定术语」(specific term)**;再选一个 category(建议 `Announcements`)
4. 它会生成一段配置,里面有 **`data-repo-id`** 和 **`data-category-id`**(两串字符)
5. 打开 `js/post.js`,找到顶部的 `GISCUS` 配置,填进去:

   ```js
   const GISCUS = {
     enabled: true,                              // ← 改成 true
     repo: "AlwaysCryingMC/alwayscrying",
     repoId: "R_kgxxxxxx",                       // ← 从 giscus.app 复制
     category: "Announcements",
     categoryId: "DIC_kwxxxxxx",                 // ← 从 giscus.app 复制
   };
   ```

6. 提交改动。每篇文章底部就会出现评论区 ✨

> 想要**匿名评论**(不用 GitHub 账号)?告诉我,我帮你换成 Twikoo。

---

## ✍️ 发文章(两种方式)

### 方式一:在浏览器里发(推荐 ✨)

网站自带前端发布工具,填一次 Token,以后打开网页就能写 / 改 / 删文章:

1. 打开 `你的网址/admin.html`(如 `https://alwayscrying.art/admin.html`)
2. 生成一个 GitHub **Fine-grained Token**:
   - 打开 <https://github.com/settings/personal-access-tokens/new>
   - **Repository access** → Only select repositories → 选 `alwayscrying`
   - **Permissions → Repository permissions → Contents** → **Read and write**
   - 生成,复制那串 `github_pat_...`
3. 回 `admin.html` 填:用户名 `AlwaysCryingMC`、仓库名 `alwayscrying`、分支 `main`、粘贴 Token → 保存
4. 在编辑器里写标题 / 正文 → **发布文章** → 几秒提交到仓库,约 1 分钟后 GitHub Pages 上线

> 🔒 Token 只存在**你这台浏览器**的 localStorage,只发往 GitHub,不经过任何第三方。只给这一个仓库的 Contents 读写权限就很安全。**别截图 / 转发 Token。**
> 点左侧列表里的文章可载入编辑,🗑 图标删除。

### 方式二:手动改文件(GitHub 网页直接编辑)

1. 在 `posts/` 里新建一个 `xxx.md`,写 Markdown 正文。
2. 打开 `posts/index.json`,照着格式加一条(**slug 必须和文件名一致**,不含 `.md`):

   ```json
   {
     "slug": "my-new-post",
     "title": "我的新文章",
     "date": "2026-07-01",
     "tags": ["日记"],
     "excerpt": "一句话摘要，会显示在卡片上。",
     "published": true
   }
   ```
3. 提交(commit)。GitHub Pages 自动更新,几分钟内上线。

> `published: false` 的文章不会出现在列表里(草稿)。

---

## 🎨 自定义

- **换头像/照片:** 把照片命名为 `me.jpg` 放进 `assets/`,`index.html` 里把 `<img src="assets/avatar.svg" .../>` 改成 `<img src="assets/me.jpg" alt="AlwaysCrying" />`。
- **改文案:** 直接改 `index.html` 里的中文。
- **改配色:** `css/style.css` 最上面 `:root` 的变量(`--pink` / `--teal` / `--grape` / `--cream` / `--ink`)。

---

## ❓ 常见问题

**Q: 国内访问慢/打不开?**
A: GitHub Pages 国内一般能访问,偶尔慢。可以套一层 CDN(如 Cloudflare)加速,但会改变解析方式,新手建议先用默认。

**Q: 文章列表不显示 / 报错?**
A: 检查 `posts/index.json` 格式对不对(JSON 不能有多余逗号),以及 `.md` 文件名和 `slug` 是否一致。

**Q: 评论区不出现?**
A: `js/post.js` 里 `enabled` 要是 `true`,`repoId`/`categoryId` 要填对,仓库要开启 Discussions。

**Q: 改了代码怎么生效?**
A: 提交到 GitHub 就行,Pages 几分钟内自动重新部署。

---

## 联系方式(已写进网站)

- GitHub: <https://github.com/AlwaysCryingMC/>
- Email: ytchatoyant@gmail.com
- QQ: 3961076988
