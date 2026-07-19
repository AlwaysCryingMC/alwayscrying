-- ============================================================
-- Supabase Edge Functions - 服务端方案（更安全）
-- 如果不想放宽RLS，用这个方案
-- ============================================================

-- 1. 创建 create-order 函数
-- 在 Supabase Dashboard → Edge Functions → New Function
-- 名字：create-order
-- 粘贴以下代码：

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, product_id } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        product_id: product_id || '00000000-0000-0000-0000-000000000001',
        customer_email: email,
        amount: 0.01,
        status: 'pending',
        payment_method: 'yipay'
      })
      .select()
      .single()

    if (error) throw error

    return new Response(JSON.stringify({
      success: true,
      orderId: order.id,
      amount: 0.01
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: corsHeaders
    })
  }
})

// ============================================================
// 2. 创建 check-order 函数
// 名字：check-order

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const orderId = url.searchParams.get('id')

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing order id' }), {
        status: 400, headers: corsHeaders
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabase
      .from('orders')
      .select('status, card_key, customer_email, amount')
      .eq('id', orderId)
      .single()

    if (error || !data) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404, headers: corsHeaders
      })
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: corsHeaders
    })
  }
})

// ============================================================
// 3. 创建 query-by-email 函数
// 名字：query-by-email

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const email = url.searchParams.get('email')

    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing email' }), {
        status: 400, headers: corsHeaders
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabase
      .from('orders')
      .select('id, status, card_key, created_at, amount')
      .eq('customer_email', email)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) throw error

    return new Response(JSON.stringify({ orders: data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: corsHeaders
    })
  }
})

// ============================================================
// 4. 创建 payment-callback 函数（易支付回调）
// 名字：payment-callback

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { orderId, transaction_id, amount, status } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 查找订单
    const { data: order } = await supabase
      .from('orders')
      .select('id, status, card_key')
      .eq('id', orderId)
      .single()

    if (!order || order.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Invalid order' }), { status: 400 })
    }

    // 领取一个未使用的卡密
    const { data: keyData } = await supabase.rpc('claim_card_key', { p_order_id: orderId })

    if (!keyData) {
      // 卡密用完了，标记订单异常
      await supabase
        .from('orders')
        .update({ status: 'error' })
        .eq('id', orderId)

      return new Response(JSON.stringify({ error: 'No card keys available' }), { status: 500 })
    }

    // 更新订单
    await supabase
      .from('orders')
      .update({
        status: 'shipped',
        card_key: keyData.code,
        paid_at: new Date().toISOString(),
        shipped_at: new Date().toISOString()
      })
      .eq('id', orderId)

    // 标记卡密已使用
    await supabase
      .from('card_keys')
      .update({
        used: true,
        used_at: new Date().toISOString(),
        order_id: orderId
      })
      .eq('id', keyData.id)

    // 记录支付日志
    await supabase
      .from('payment_logs')
      .insert({
        order_id: orderId,
        provider: 'yipay',
        transaction_id: transaction_id,
        amount: parseFloat(amount),
        status: status,
        raw_data: req.body
      })

    return new Response(JSON.stringify({ success: true, card_key: keyData.code }))
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
