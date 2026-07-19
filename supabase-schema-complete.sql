-- ============================================================
-- AuroraNEL Shop — 完整数据库初始化脚本
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. Products Table
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.01,
    hours INTEGER NOT NULL DEFAULT 876000,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default product
INSERT INTO products (id, name, description, price, hours, enabled)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'AuroraNEL 永久授权',
    '网易我的世界盒子 · 一次购买终身使用',
    0.01,
    876000,
    true
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Orders Table
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    customer_email TEXT,
    customer_ip TEXT,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.01,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT,
    payment_url TEXT,
    card_key TEXT,
    paid_at TIMESTAMP WITH TIME ZONE,
    shipped_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- ============================================================
-- 3. Payment Logs Table
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    provider TEXT NOT NULL,
    transaction_id TEXT,
    amount DECIMAL(10,2),
    status TEXT,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_order ON payment_logs(order_id);

-- ============================================================
-- 4. Row Level Security (RLS) - 放宽策略允许前端直连
-- ============================================================

-- Products: 允许所有人读取
DROP POLICY IF EXISTS "Public read products" ON products;
CREATE POLICY "Public read products" ON products
FOR SELECT USING (true);

-- Orders: 允许所有操作（前端直连需要）
DROP POLICY IF EXISTS "Public full access to orders" ON orders;
CREATE POLICY "Public full access to orders" ON orders
FOR ALL USING (true) WITH CHECK (true);

-- Card Keys: 允许读取
DROP POLICY IF EXISTS "Public read card_keys" ON card_keys;
CREATE POLICY "Public read card_keys" ON card_keys
FOR SELECT USING (true);

-- ============================================================
-- 5. 自动发货函数
-- ============================================================
CREATE OR REPLACE FUNCTION auto_ship_order()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paid' AND NEW.card_key IS NULL THEN
        -- 领取一个未使用的卡密
        UPDATE card_keys
        SET used = true, used_at = NOW(), order_id = NEW.id
        WHERE id = (
            SELECT id FROM card_keys
            WHERE used = false
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING code INTO NEW.card_key;

        NEW.status := 'shipped';
        NEW.shipped_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. 统计视图
-- ============================================================
CREATE OR REPLACE VIEW admin_stats AS
SELECT
    (SELECT COUNT(*) FROM orders) AS total_orders,
    (SELECT COUNT(*) FROM orders WHERE status = 'shipped') AS completed_orders,
    (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
    (SELECT SUM(amount) FROM orders WHERE status = 'shipped') AS total_revenue,
    (SELECT COUNT(*) FROM card_keys WHERE used = false) AS keys_remaining,
    (SELECT COUNT(*) FROM card_keys WHERE used = true) AS keys_used;
