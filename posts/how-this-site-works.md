## 为什么用 GitHub Pages

1. 免费，国内能访问，不用备案
2. 文章就是仓库里的 Markdown 文件，简单透明
3. 评论用 Giscus（基于 GitHub Discussions），也是免费的

### 这个网站的结构

```
alwayscrying-art/
├── index.html          首页
├── blog.html           博客列表
├── post.html           文章详情（读 ?id=）
├── posts/
│   ├── index.json      文章清单（标题/日期/标签）
│   └── *.md            每篇文章的正文
├── css/  js/  assets/
└── CNAME               绑定的域名 alwayscrying.art
```

### 发新文章的步骤

1. 在 `posts/` 里新建一个 `你的文件名.md`，写 Markdown 正文
2. 打开 `posts/index.json`，照着格式加一条（slug 要和文件名一致）
3. 提交（commit）→ GitHub Pages 会自动发布

就这么简单。
