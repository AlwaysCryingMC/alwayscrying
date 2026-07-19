-- ============================================================
-- 放宽 RLS 策略 - 允许前端直连
-- 在 Supabase SQL Editor 执行
-- ============================================================

-- Orders 表：允许所有操作（前端直连需要）
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Orders can be inserted publicly" ON orders;

CREATE POLICY "Public full access to orders" ON orders
FOR ALL
USING (true)
WITH CHECK (true);

-- Card Keys 表：允许读取（用于查询剩余卡密）
DROP POLICY IF EXISTS "Card keys policy" ON card_keys;
CREATE POLICY "Public read card_keys" ON card_keys
FOR SELECT
USING (true);

-- Products 表：允许读取
DROP POLICY IF EXISTS "Products are viewable by everyone" ON products;
CREATE POLICY "Public read products" ON products
FOR SELECT
USING (true);

-- Payment Logs 表：保持严格（不需要前端访问）
-- 不需要修改
