# AuroraNEL 卡网后端规划

## 技术栈

| 组件 | 推荐 | 备选 |
|------|------|------|
| 运行时 | Node.js 20 LTS | Deno / Bun |
| 框架 | Express / Fastify | Hono / Koa |
| 数据库 | PostgreSQL (Supabase) | SQLite / MySQL |
| 缓存 | Redis (Upstash) | 内存缓存 |
| 部署 | Vercel / Railway | Cloudflare Workers |

## 数据库设计

```sql
-- 商品表
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.01,
    hours INTEGER NOT NULL DEFAULT 876000,  -- 永久
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 卡密表
CREATE TABLE card_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    hours INTEGER NOT NULL DEFAULT 876000,
    used BOOLEAN DEFAULT false,
    used_at TIMESTAMP,
    order_id UUID,  -- 关联订单
    created_at TIMESTAMP DEFAULT NOW()
);

-- 订单表
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id),
    customer_email TEXT,
    customer_ip TEXT,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.01,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending/paid/shipped/refunded
    payment_method TEXT,  -- alipay/wechat/usdt
    payment_url TEXT,
    card_key_id UUID REFERENCES card_keys(id),
    paid_at TIMESTAMP,
    shipped_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 支付回调日志
CREATE TABLE payment_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    provider TEXT NOT NULL,
    transaction_id TEXT,
    amount DECIMAL(10,2),
    status TEXT,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_email ON orders(customer_email);
CREATE INDEX idx_card_keys_code ON card_keys(code);
CREATE INDEX idx_card_keys_used ON card_keys(used);
```

## API 设计

### 1. 创建订单
```
POST /api/create-order
Body: { email?: string }
Response: { orderId: string, qrUrl: string, amount: 0.01 }
```

### 2. 查询订单
```
GET /api/order/:orderId
Response: { status: 'pending'|'paid'|'shipped', cardKey?: string }
```

### 3. 通过邮箱查询
```
GET /api/order?email=xxx@example.com
Response: { orders: [{ orderId, status, cardKey, createdAt }] }
```

### 4. 支付回调（支付宝/微信）
```
POST /api/payment/callback
Body: { orderId, transactionId, amount, status, ... }
```

### 5. 管理后台
```
GET  /api/admin/stats      -- 统计数据
GET  /api/admin/orders     -- 订单列表
POST /api/admin/keys/generate -- 批量生成卡密
```

## 核心逻辑

### 创建订单流程
```typescript
async function createOrder(email?: string) {
  // 1. 创建订单记录 (status=pending)
  const order = await db.orders.create({
    product_id: AURORA_PRODUCT_ID,
    customer_email: email,
    amount: 0.01,
    status: 'pending'
  });

  // 2. 调用支付API获取二维码
  const qrUrl = await paymentProvider.createQR(order.id, 0.01);

  // 3. 返回订单ID和二维码
  return { orderId: order.id, qrUrl, amount: 0.01 };
}
```

### 支付回调处理
```typescript
async function handlePaymentCallback(data) {
  // 1. 验证签名
  if (!verifySignature(data)) return;

  // 2. 查找订单
  const order = await db.orders.findById(data.orderId);
  if (!order || order.status !== 'pending') return;

  // 3. 领取一个未使用的卡密
  const key = await db.card_keys.findOne({
    where: { used: false },
    order: [['created_at', 'ASC']]
  });

  if (!key) {
    // 卡密库存不足，标记订单异常
    await order.update({ status: 'error' });
    return;
  }

  // 4. 更新订单和卡密
  await Promise.all([
    order.update({
      status: 'shipped',
      card_key_id: key.id,
      paid_at: new Date(),
      shipped_at: new Date()
    }),
    key.update({
      used: true,
      used_at: new Date(),
      order_id: order.id
    })
  ]);

  // 5. 发送邮件（可选）
  if (order.customer_email) {
    await sendEmail(order.customer_email, '卡密', key.code);
  }
}
```

## 支付对接

### 方案A：支付宝当面付（推荐）
```javascript
// 调用支付宝SDK
const result = await alipayClient.exec(
  'alipay.trade.precreate',
  { out_trade_no: orderId, total_amount: '0.01', subject: 'AuroraNEL' }
);
return result.qr_code;  // 返回二维码内容
```

### 方案B：易支付
```javascript
// 生成支付链接
const sign = md5(`${appId}${orderId}${amount}${notifyUrl}${key}`);
const payUrl = `https://pay.xxx.com/pay/${appId}?out_trade_no=${orderId}&total_fee=${amount}&notify_url=${notifyUrl}&sign=${sign}`;
```

### 方案C：USDT (NowPayments)
```javascript
const invoice = await nowpayments.createInvoice({
  price_amount: 0.01,
  price_currency: 'CNY',
  pay_currency: 'USDTTRC20',
  order_id: orderId
});
return invoice.invoice_url;
```

## 安全

1. **限流** — `express-rate-limit`: 每IP每分钟最多10次请求
2. **签名验证** — 支付回调必须验证签名
3. **卡密加密** — 数据库中存储 `bcrypt(code)`，发货时再解密
4. **IP记录** — 每个订单记录客户IP，防止刷单
5. **HTTPS** — 必须启用

## 部署

### 方案一：Supabase + Vercel Edge Functions
```bash
# 1. 创建Supabase项目
# 2. 运行SQL创建表
# 3. 部署Edge Functions
npx vercel deploy
```

### 方案二：Railway + PostgreSQL
```bash
# 1. Railway创建PostgreSQL
# 2. 部署Node.js应用
# 3. 配置环境变量
```

### 方案三：Cloudflare Workers
```javascript
// worker.js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/create-order') {
      return handleCreateOrder(request);
    }
    // ...
  }
}
```

## 文件结构

```
api/
├── package.json
├── src/
│   ├── index.js          # 入口
│   ├── routes/
│   │   ├── orders.js     # 订单API
│   │   ├── payment.js    # 支付回调
│   │   └── admin.js      # 管理后台
│   ├── services/
│   │   ├── database.js   # DB连接
│   │   ├── payment.js    # 支付服务
│   │   └── email.js      # 邮件服务
│   ├── middleware/
│   │   ├── rateLimit.js  # 限流
│   │   └── auth.js       # 认证
│   └── utils/
│       └── keyGenerator.js
└── .env.example
```

## 环境变量

```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=xxx

# 支付宝
ALIPAY_APP_ID=xxx
ALIPAY_PRIVATE_KEY=xxx
ALIPAY_PUBLIC_KEY=xxx

# 邮件
SMTP_HOST=smtp.gmail.com
SMTP_USER=xxx@gmail.com
SMTP_PASS=xxx

# 安全
JWT_SECRET=xxx
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=10
```

## 开发顺序

1. **先搭数据库** — Supabase创建表，插入测试数据
2. **写核心API** — `createOrder` + `queryOrder`
3. **接支付** — 先接一个最简单的（建议易支付）
4. **写发货逻辑** — 支付回调 → 自动发货
5. **管理后台** — 查看订单、生成卡密
6. **发邮件** — 可选，增强体验

需要老子把哪个部分展开写代码？
