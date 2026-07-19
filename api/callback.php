<?php
/**
 * AuroraNEL Shop - 易支付回调处理
 * 放在网站根目录 /api/callback.php
 */

// 易支付配置
define('YIPAY_PID', '5970');  // 商户ID
define('YIPAY_KEY', 'sqtrgNsHHtNLBBh267AtoFJQwOUok6b8');  // 商户密钥

// Supabase 配置
define('SUPABASE_URL', 'https://fgbkdeqjtmtqxodtqnqz.supabase.co');
define('SUPABASE_SERVICE_KEY', 'YOUR_SERVICE_ROLE_KEY');  // 需要换成 service_role key

// 获取回调参数
$out_trade_no = $_GET['out_trade_no'] ?? '';
$trade_no = $_GET['trade_no'] ?? '';
$trade_status = $_GET['trade_status'] ?? '';
$type = $_GET['type'] ?? '';
$money = $_GET['money'] ?? '0.01';
$sign = $_GET['sign'] ?? '';

// 验证签名
$signStr = $out_trade_no . '|' . $type . '|' . $trade_no . '|' . $money . '|' . YIPAY_PID;
$checkSign = md5($signStr . YIPAY_KEY);

if ($checkSign !== $sign) {
    http_response_code(400);
    exit('Sign verification failed');
}

// 只有支付成功才处理
if ($trade_status !== 'SUCCESS') {
    exit('fail');
}

// 调用 Supabase API 更新订单
$orderId = $out_trade_no;
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
    exit('fail');  // 订单不存在或已处理
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
    exit('fail');
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
    'provider' => 'yipay',
    'transaction_id' => $trade_no,
    'amount' => floatval($money),
    'status' => $trade_status,
    'raw_data' => $_GET
]));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "apikey: $supabaseKey",
    "Authorization: Bearer $supabaseKey",
    "Content-Type: application/json"
]);
curl_exec($ch);
curl_close($ch);

// 返回成功
exit('success');
?>
