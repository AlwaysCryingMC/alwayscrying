# AuroraNEL 卡网部署指南（Supabase）

## 1. 配置 Supabase

### 步骤一：创建项目
1. 登录 [Supabase](https://supabase.com)
2. 创建新项目，记下 `Project URL` 和 `anon public key`

### 步骤二：运行 SQL
1. 打开 Supabase SQL Editor
2. 复制 `supabase-schema.sql` 的全部内容
3. 点击 Run 执行

执行后会创建：
- `products` 表（含默认商品 AuroraNEL永久授权）
- `card_keys` 表（预生成1000个卡密）
- `orders` 表
- `payment_logs` 表
- 自动发货函数
- 统计视图

### 步骤三：配置 RLS（可选）
如果需要完全公开访问（前端直连），可以禁用RLS：
```sql
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE card_keys DISABLE ROW LEVEL SECURITY;
```

**注意**：生产环境建议保留RLS并通过Edge Function访问。

---

## 2. 修改前端

打开 `shop.html`，找到第165行附近：

```javascript
// TODO: Replace with your Supabase credentials
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

替换为你的 Supabase 项目 URL 和 anon key。

---

## 3. 部署前端

### 方式A：GitHub Pages
1. `git add shop.html supabase-schema.sql`
2. `git commit -m "Add shop"`
3. `git push`
4. GitHub Settings → Pages → 选择 main 分支

### 方式B：Vercel / Netlify
直接拖拽整个 `alwayscrying` 文件夹到 Vercel/Netlify。

### 方式C：Cloudflare Pages
GitHub 仓库连接 → 自动部署。

---

## 4. 测试购买流程

1. 打开 `https://store.alwayscrying.art/shop.html`
2. 点击"立即购买"
3. 弹窗显示订单和二维码（目前是演示模式）
4. 点击"我已支付，获取卡密"
5. 由于没有接真实支付，订单会一直是 `pending` 状态

**要测试完整流程**，需要手动标记订单为已支付：

```sql
-- 在 Supabase Table Editor 中找到最新订单
-- 将其 status 改为 'paid'
UPDATE orders SET status = 'paid' WHERE id = '你的订单ID';

-- 自动发货函数会自动触发，订单会变成 'shipped' 并分配卡密
```

---

## 5. 接支付（可选）

### 方案A：手动模式（最简单）
1. 用户点击购买 → 生成订单（status=pending）
2. 显示你的支付宝/微信收款码（静态图片）
3. 用户扫码支付后点击"我已支付"
4. 你在后台手动标记订单为 paid → 系统自动发货

### 方案B：易支付（自动）
```javascript
// 在 generateOrder() 函数中，创建订单后调用易支付API
const yiPayRes = await fetch('https://yipay.cn/pay.php', {
  method: 'POST',
  body: new URLSearchParams({
    pid: 'YOUR_YIPAY_ID',
    type: 'alipay',
    out_trade_no: currentOrderId,
    notify_url: 'https://store.alwayscrying.art/api/callback',
    return_url: 'https://store.alwayscrying.art/shop.html',
    name: 'AuroraNEL 永久授权',
    money: '0.01'
  })
});
const yiPayData = await yiPayRes.json();
// 显示 yiPayData.qrpay 作为二维码
```

### 方案C：Supabase Edge Function + 支付宝
```javascript
// supabase/functions/create-payment/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import AlipaySDK from 'https://esm.sh/alipay-sdk@4.0.0';

serve(async (req) => {
  const { orderId, amount } = await req.json();

  const alipay = new AlipaySDK({
    appId: Deno.env.get('ALIPAY_APP_ID'),
    privateKey: Deno.env.get('ALIPAY_PRIVATE_KEY'),
    alipayPublicKey: Deno.env.get('ALIPAY_PUBLIC_KEY'),
  });

  const qrCode = await alipay.exec(
    'alipay.trade.precreate',
    { out_trade_no: orderId, total_amount: String(amount), subject: 'AuroraNEL' }
  );

  return new Response(JSON.stringify({ qrCode }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

---

## 6. 管理后台

### 查看订单
```sql
SELECT * FROM orders ORDER BY created_at DESC;
```

### 查看统计
```sql
SELECT * FROM admin_stats;
```

### 批量生成卡密
```sql
INSERT INTO card_keys (code, hours)
SELECT
    substr(md5(random()::text), 1, 4) || '-' ||
    substr(md5(random()::text), 1, 4) || '-' ||
    substr(md5(random()::text), 1, 4) || '-' ||
    substr(md5(random()::text), 1, 4),
    876000
FROM generate_series(1, 100);
```

### 手动发货
```sql
-- 找到pending订单
SELECT id, customer_email FROM orders WHERE status = 'pending';

-- 手动标记为paid（自动发货函数会处理剩余流程）
UPDATE orders SET status = 'paid' WHERE id = '订单ID';
```

---

## 7. 安全建议

1. **不要在前端暴露 service_role key** — 只用 anon key
2. **启用 RLS** — 限制用户只能访问自己的订单
3. **添加 rate limiting** — 用 Supabase 的 `pg_cron` 或 Cloudflare Workers
4. **监控异常** — 设置 Supabase Webhooks 监控大量 pending 订单

---

## 8. 常见问题

**Q: 卡密用完了怎么办？**
A: 运行上面的"批量生成卡密"SQL。

**Q: 订单一直 pending 怎么办？**
A: 检查自动发货函数是否正常，或者手动标记为 paid。

**Q: 能改价格吗？**
A: 修改 `products` 表中的 price 字段，前端会自动读取。

**Q: 能改卡密格式吗？**
A: 修改 `supabase-schema.sql` 中生成卡密的 SQL 逻辑。

---

## 文件清单

| 文件 | 用途 |
|------|------|
| `shop.html` | 前端页面（需修改 SUPABASE_URL 和 KEY） |
| `supabase-schema.sql` | 数据库初始化脚本 |
| `SHOP_BACKEND.md` | 后端规划文档（可忽略，已用Supabase） |
| `SHOP_SETUP.md` | 本文档 |

搞定。
