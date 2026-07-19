-- ============================================================
-- AuroraNEL Shop — Supabase Database Schema
-- Run this in your Supabase SQL Editor
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
    hours INTEGER NOT NULL DEFAULT 876000,  -- 876000 = permanent (100 years)
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
-- 2. Card Keys Table
-- ============================================================
CREATE TABLE IF NOT EXISTS card_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    hours INTEGER NOT NULL DEFAULT 876000,
    used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    order_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_keys_code ON card_keys(code);
CREATE INDEX IF NOT EXISTS idx_card_keys_used ON card_keys(used) WHERE used = false;

-- ============================================================
-- 3. Orders Table
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    customer_email TEXT,
    customer_ip TEXT,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.01,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending/paid/shipped/refunded
    payment_method TEXT,  -- alipay/wechat/usdt
    payment_url TEXT,
    card_key TEXT,  -- The actual key (denormalized for quick access)
    paid_at TIMESTAMP WITH TIME ZONE,
    shipped_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- ============================================================
-- 4. Payment Logs Table
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    provider TEXT NOT NULL,  -- alipay/wechat/usdt/manual
    transaction_id TEXT,
    amount DECIMAL(10,2),
    status TEXT,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_order ON payment_logs(order_id);

-- ============================================================
-- 5. Pre-generate Card Keys (1000 keys)
-- ============================================================
INSERT INTO card_keys (code, hours)
SELECT
    substr(md5(random()::text), 1, 4) || '-' ||
    substr(md5(random()::text), 1, 4) || '-' ||
    substr(md5(random()::text), 1, 4) || '-' ||
    substr(md5(random()::text), 1, 4) AS code,
    876000 AS hours
FROM generate_series(1, 1000)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 6. Row Level Security (RLS)
-- ============================================================

-- Products: anyone can read, only service role can write
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products are viewable by everyone" ON products
    FOR SELECT USING (true);

-- Card Keys: no public access (only service role / edge functions)
ALTER TABLE card_keys ENABLE ROW LEVEL SECURITY;

-- Orders: users can read their own orders (by email)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own orders" ON orders
    FOR SELECT USING (
        customer_email = current_setting('request.jwt.claims', true)::json->>'email'
        OR customer_email IS NULL  -- allow public read for unauthenticated queries
    );
CREATE POLICY "Orders can be inserted publicly" ON orders
    FOR INSERT WITH CHECK (true);

-- Payment Logs: no public access
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. Auto-shipping Function (triggered on payment)
-- ============================================================
CREATE OR REPLACE FUNCTION auto_ship_order()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process newly paid orders that aren't shipped yet
    IF NEW.status = 'paid' AND NEW.card_key IS NULL THEN
        -- Find an unused card key
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

        -- Mark order as shipped
        NEW.status := 'shipped';
        NEW.shipped_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. Statistics View
-- ============================================================
CREATE OR REPLACE VIEW admin_stats AS
SELECT
    (SELECT COUNT(*) FROM orders) AS total_orders,
    (SELECT COUNT(*) FROM orders WHERE status = 'shipped') AS completed_orders,
    (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
    (SELECT SUM(amount) FROM orders WHERE status = 'shipped') AS total_revenue,
    (SELECT COUNT(*) FROM card_keys WHERE used = false) AS keys_remaining,
    (SELECT COUNT(*) FROM card_keys WHERE used = true) AS keys_used;

-- ============================================================
-- 9. Cleanup old pending orders (run daily via pg_cron or external scheduler)
-- ============================================================
-- DELETE FROM orders WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 day';
