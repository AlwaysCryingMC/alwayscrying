<?php
/**
 * AuroraNEL Shop - AFDian 支付回调处理
 * 放在网站根目录 /api/afadian-callback.php
 *
 * AFDian Webhook 配置：
 * 1. 登录 https://afdian.net/dashboard
 * 2. 开发者 -> Webhook
 * 3. 添加回调地址：https://store.alwayscrying.art/api/afadian-callback.php
 * 4. 复制 Token 并填入下面的 AFDIAN_TOKEN
 */

// AFDian 配置
define('AFDIAN_USER_ID', 'YOUR_AFDIAN_USER_ID');  // 你的爱发电用户ID（在个人主页URL里）
define('AFDIAN_TOKEN', 'YOUR_WEBHOOK_TOKEN');     // Webhook Token

// Supabase 配置
define('SUPABASE_URL', 'https://fgbkdeqjtmtqxodtqnqz.supabase.co');
define('SUPABASE_SERVICE_KEY', 'YOUR_SERVICE_ROLE_KEY');  // 需要换成 service_role key

// 获取原始POST数据
$rawInput = file_get_contents('php://input');
$json = json_decode($rawInput, true);

// 验证签名
$sign = $_SERVER['HTTP_X_AFDIAN_SIGNATURE'] ?? '';
$expectedSign = hash_hmac('sha256', $rawInput, AFDIAN_TOKEN);

if ($sign !== $expectedSign) {
    http_response_code(400);
    exit('Invalid signature');
}

// 检查事件类型
$event = $json['event'] ?? '';
if ($event !== 'create_order') {
    exit('ok');  // 忽略其他事件
}

// 获取订单信息
$data = $json['data'] ?? [];
$outTradeNo = $data['out_trade_no'] ?? '';
$amount = $data['amount'] ?? 0;
$status = $data['status'] ?? '';  // 1=待支付 2=已完成 3=失败
$email = $data['user']['email'] ?? '';

// 只有支付成功才处理
if ($status != 2) {
    exit('ok');
}

// 调用 Supabase API 更新订单
$orderId = $outTradeNo;
$supabaseUrl = SUPABASE_URL;
$supabaseKey = SUPABASE_SERVICE_KEY;

// 1. 先查询订单
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "$supabaseUrl/rest/v1/orders?id=eq.$orderId&select=id,status,card_key");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "apikey: $supabaseKey",
    "Authorization: Bearer $supabaseKey",
    "Content-Type: application/json"
]);
$response = curl_exec($ch);
curl_close($ch);

$orders = json_decode($response, true);
if (empty($orders) || $orders[0]['status'] !== 'pending') {
    exit('ok');  // 订单不存在或已处理
}

// 2. 领取一个未使用的卡密
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "$supabaseUrl/rest/v1/card_keys?used=eq.false&select=id,code&order=created_at.asc&limit=1");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "apikey: $supabaseKey",
    "Authorization: Bearer $supabaseKey",
    "Content-Type: application/json"
]);
$keysResponse = curl_exec($ch);
curl_close($ch);

$keys = json_decode($keysResponse, true);
if (empty($keys)) {
    // 没有可用卡密了
    exit('ok');
}

$cardKey = $keys[0]['code'];
$keyId = $keys[0]['id'];

// 3. 标记卡密已使用
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "$supabaseUrl/rest/v1/card_keys?id=eq.$keyId");
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'used' => true,
    'used_at' => date('c'),
    'order_id' => $orderId
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "apikey: $supabaseKey",
    "Authorization: Bearer $supabaseKey",
    "Content-Type: application/json",
    "Prefer: return=representation"
]);
curl_exec($ch);
curl_close($ch);

// 4. 更新订单为已发货
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "$supabaseUrl/rest/v1/orders?id=eq.$orderId");
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'status' => 'shipped',
    'card_key' => $cardKey,
    'paid_at' => date('c'),
    'shipped_at' => date('c')
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "apikey: $supabaseKey",
    "Authorization: Bearer $supabaseKey",
    "Content-Type: application/json",
    "Prefer: return=representation"
]);
curl_exec($ch);
curl_close($ch);

// 5. 记录支付日志
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "$supabaseUrl/rest/v1/payment_logs");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'order_id' => $orderId,
    'provider' => 'afdian',
    'transaction_id' => $data['id'] ?? '',
    'amount' => floatval($amount),
    'status' => 'completed',
    'raw_data' => $json
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "apikey: $supabaseKey",
    "Authorization: Bearer $supabaseKey",
    "Content-Type: application/json"
]);
curl_exec($ch);
curl_close($ch);

exit('ok');
?>
