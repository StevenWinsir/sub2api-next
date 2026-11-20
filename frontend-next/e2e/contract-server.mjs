/**
 * 契约模拟服务（"真相环境"的轻量替身）。
 *
 * 复刻 backend/internal/web/embed_on.go 与 security_headers.go 对前端产物的全部处理，
 * 用于在 CI / 本地快速验证深链、CSP、注入契约：
 *   - 对非 API 路径：dist 中有同名文件则直接返回，否则一律返回根 index.html；
 *   - normal 模式：在 `</head>` 前注入 `<script nonce>window.__APP_CONFIG__=…</script>`，
 *     替换第一个 <title>，按字节匹配 `<link rel="icon"` 并替换 favicon；
 *   - legacy / setup 模式：不注入、不替换 nonce，但 CSP 依然生效；
 *   - CSP 使用后端默认策略（无 unsafe-inline / unsafe-eval 的 script-src）。
 * 另提供最小的 /api/v1 与 /setup 假接口（种子用户：admin / user / totp）。
 *
 * 注意：这是对后端行为的模拟，最终验收仍以后端 `-tags embed` 构建后的真实二进制为准（R1 手工验收项）。
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distDir = process.env.DIST_DIR ? resolve(process.env.DIST_DIR) : join(root, 'out')
const port = Number(process.env.PORT || 4010)
const mode = process.env.MODE || 'normal' // normal | legacy | setup

// 与 backend/internal/config/config.go 的 DefaultCSPPolicy 保持一致
const DEFAULT_CSP =
  "default-src 'self'; worker-src 'self' blob:; script-src 'self' __CSP_NONCE__ https://challenges.cloudflare.com https://*.alicdn.com https://static.cloudflareinsights.com https://turing.captcha.qcloud.com https://turing.captcha.gtimg.com https://ca.turing.captcha.qcloud.com https://global.turing.captcha.gtimg.com https://www.tycaptcha.com https://cloudcache.tencentcs.com https://*.stripe.com https://static.airwallex.com https://checkout.airwallex.com https://static-demo.airwallex.com https://checkout-demo.airwallex.com; style-src 'self' 'unsafe-inline' https://*.captcha.gtimg.com https://fonts.googleapis.com https://*.alicdn.com https://static.airwallex.com https://checkout.airwallex.com https://static-demo.airwallex.com https://checkout-demo.airwallex.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://turing.captcha.qcloud.com https://www.tycaptcha.com https://rce.tencentrio.com https:; frame-src 'self' https://challenges.cloudflare.com https://turing.captcha.qcloud.com https://ca.turing.captcha.qcloud.com https://www.tycaptcha.com https://*.stripe.com https://checkout.airwallex.com https://checkout-demo.airwallex.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.txt': 'text/plain'
}

// 后端 shouldBypassEmbeddedFrontend 的等价实现
function bypassesFrontend(p) {
  return (
    p.startsWith('/api/') ||
    p.startsWith('/.well-known/oauth-') ||
    p.startsWith('/v1/') ||
    p.startsWith('/v1beta/') ||
    p.startsWith('/backend-api/') ||
    p.startsWith('/antigravity/') ||
    p.startsWith('/setup/') ||
    p === '/health' ||
    p === '/models' ||
    p.startsWith('/models/') ||
    p === '/responses' ||
    p.startsWith('/responses/') ||
    p === '/chat/completions' ||
    p === '/embeddings' ||
    p === '/messages/count_tokens' ||
    p === '/alpha/search' ||
    p === '/web_search' ||
    p === '/x_search' ||
    p === '/tts' ||
    p === '/stt' ||
    p === '/realtime' ||
    p === '/custom-voices' ||
    p.startsWith('/custom-voices/') ||
    p.startsWith('/contents/generations/tasks') ||
    p.startsWith('/v3/contents/generations/tasks') ||
    p.startsWith('/images/') ||
    p === '/videos' ||
    p.startsWith('/videos/')
  )
}

const PUBLIC_SETTINGS = {
  registration_enabled: true,
  email_verify_enabled: false,
  site_name: 'Contract Site',
  site_logo: '',
  site_subtitle: 'Contract',
  api_base_url: '',
  contact_info: '',
  doc_url: '',
  home_content: '',
  payment_enabled: true,
  subscription_enabled: true,
  risk_control_enabled: true,
  model_plaza_enabled: true,
  model_plaza_require_auth: false,
  backend_mode_enabled: false,
  table_default_page_size: 20,
  table_page_size_options: [10, 20, 50, 100],
  custom_menu_items: [],
  custom_endpoints: [],
  version: 'contract'
}
const state = { settings: { ...PUBLIC_SETTINGS }, tokenCounter: 0, requests: [] }

const USERS = {
  'admin@example.com': {
    password: 'admin-pass',
    user: { id: 1, email: 'admin@example.com', username: 'admin', role: 'admin', balance: 100 }
  },
  'user@example.com': {
    password: 'user-pass',
    user: { id: 2, email: 'user@example.com', username: 'user', role: 'user', balance: 10 }
  },
  'totp@example.com': {
    password: 'totp-pass',
    totp: '123456',
    user: { id: 3, email: 'totp@example.com', username: 'totp', role: 'user', balance: 1 }
  }
}
const tokens = new Map() // access token -> user
const refreshTokens = new Map()

function issue(user) {
  const n = ++state.tokenCounter
  const access = `at-${user.id}-${n}`
  const refresh = `rt-${user.id}-${n}`
  tokens.set(access, user)
  refreshTokens.set(refresh, user)
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in: 900,
    token_type: 'Bearer',
    user: { ...user, run_mode: 'standard' }
  }
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}
const ok = (res, data) => json(res, 200, { code: 0, message: 'success', data })
const fail = (res, status, code, message) => json(res, status, { code: status, message, reason: code })

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}')
  } catch {
    return {}
  }
}

// ───────── R3：用户控制台状态与处理器（密钥 / 兑换 / 支付订单）─────────
const consoleState = {
  keys: [
    {
      id: 1,
      user_id: 2,
      key: 'sk-seed-0000000000000000',
      name: 'seed-key',
      group_id: 1,
      status: 'active',
      ip_whitelist: [],
      ip_blacklist: [],
      last_used_at: null,
      last_used_ip: null,
      quota: 0,
      quota_used: 0,
      expires_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      current_concurrency: 0,
      rate_limit_5h: 0,
      rate_limit_1d: 0,
      rate_limit_7d: 0,
      usage_5h: 0,
      usage_1d: 0,
      usage_7d: 0,
      window_5h_start: null,
      window_1d_start: null,
      window_7d_start: null,
      reset_5h_at: null,
      reset_1d_at: null,
      reset_7d_at: null
    }
  ],
  nextKeyId: 2,
  redeemHistory: [],
  orders: [],
  nextOrderId: 1,
  redeemed: new Set()
}
const GROUPS = [
  {
    id: 1,
    name: 'Claude Pro',
    description: 'Claude group',
    platform: 'anthropic',
    rate_multiplier: 1,
    is_exclusive: false,
    status: 'active',
    subscription_type: 'standard',
    peak_rate_enabled: false,
    peak_start: '',
    peak_end: '',
    peak_rate_multiplier: 1,
    daily_limit_usd: null,
    weekly_limit_usd: null,
    monthly_limit_usd: null
  }
]
const CHECKOUT = {
  methods: {
    alipay: {
      display_name: '',
      daily_limit: 0,
      daily_used: 0,
      daily_remaining: 0,
      single_min: 1,
      single_max: 1000,
      fee_rate: 0,
      available: true,
      currency: 'CNY'
    }
  },
  global_min: 1,
  global_max: 1000,
  plans: [],
  balance_disabled: false,
  balance_recharge_multiplier: 1,
  subscription_usd_to_cny_rate: 0,
  recharge_fee_rate: 0,
  help_text: '',
  help_image_url: '',
  stripe_publishable_key: ''
}
const orderView = (o) => ({
  id: o.id,
  user_id: 2,
  amount: o.amount,
  pay_amount: o.amount,
  fee_rate: 0,
  payment_type: o.payment_type,
  out_trade_no: `OT-${o.id}`,
  status: o.polls >= 2 ? 'COMPLETED' : 'PENDING',
  order_type: 'balance',
  created_at: o.created_at,
  expires_at: o.expires_at,
  refund_amount: 0,
  currency: 'CNY'
})

/** 返回 true 表示已处理。仅覆盖 E2E 用到的路径，其余仍走通用空响应。 */
function handleUserConsole(req, res, url) {
  const path = url.pathname.replace('/api/v1', '')
  const method = req.method
  if (path === '/groups/available') return (ok(res, GROUPS), true)
  if (path === '/groups/rates') return (ok(res, {}), true)
  if (path === '/usage/dashboard/stats')
    return (
      ok(res, {
        total_api_keys: consoleState.keys.length,
        active_api_keys: consoleState.keys.filter((k) => k.status === 'active').length,
        total_requests: 5,
        total_input_tokens: 10,
        total_output_tokens: 20,
        total_cache_creation_tokens: 0,
        total_cache_read_tokens: 0,
        total_tokens: 30,
        total_cost: 0.5,
        total_actual_cost: 0.4,
        today_requests: 2,
        today_input_tokens: 4,
        today_output_tokens: 6,
        today_cache_creation_tokens: 0,
        today_cache_read_tokens: 0,
        today_tokens: 10,
        today_cost: 0.2,
        today_actual_cost: 0.1,
        average_duration_ms: 420,
        rpm: 1,
        tpm: 30,
        by_platform: []
      }),
      true
    )
  if (path === '/usage/dashboard/trend')
    return (ok(res, { trend: [], start_date: '', end_date: '', granularity: 'day' }), true)
  if (path === '/usage/dashboard/models') return (ok(res, { models: [] }), true)
  if (path === '/usage/dashboard/api-keys-usage') return (ok(res, { stats: {} }), true)
  if (path === '/user/platform-quotas') return (ok(res, { platform_quotas: [] }), true)
  if (path === '/usage' || path === '/usage/stats')
    return (
      ok(
        res,
        path === '/usage'
          ? { items: [], total: 0, page: 1, page_size: 20, pages: 0 }
          : {
              total_requests: 0,
              total_input_tokens: 0,
              total_output_tokens: 0,
              total_cache_tokens: 0,
              total_tokens: 0,
              total_cost: 0,
              total_actual_cost: 0,
              average_duration_ms: 0,
              endpoints: []
            }
      ),
      true
    )
  if (path === '/keys' && method === 'GET')
    return (
      ok(res, {
        items: consoleState.keys,
        total: consoleState.keys.length,
        page: 1,
        page_size: 20,
        pages: 1
      }),
      true
    )
  if (path === '/keys' && method === 'POST') {
    readBody(req).then((body) => {
      const key = {
        ...consoleState.keys[0],
        id: consoleState.nextKeyId++,
        key: `sk-${String(Math.random()).slice(2, 20).padEnd(18, '0')}`,
        name: body.name,
        group_id: body.group_id ?? null,
        group: GROUPS[0]
      }
      consoleState.keys.unshift(key)
      ok(res, key)
    })
    return true
  }
  const keyMatch = path.match(/^\/keys\/(\d+)$/)
  if (keyMatch && method === 'PUT') {
    readBody(req).then((body) => {
      const key = consoleState.keys.find((k) => k.id === Number(keyMatch[1]))
      if (!key) return fail(res, 404, 'NOT_FOUND', 'not found')
      Object.assign(key, body)
      ok(res, key)
    })
    return true
  }
  if (keyMatch && method === 'DELETE') {
    consoleState.keys = consoleState.keys.filter((k) => k.id !== Number(keyMatch[1]))
    return (ok(res, { message: 'deleted' }), true)
  }
  if (path === '/redeem' && method === 'POST') {
    readBody(req).then((body) => {
      if (body.code !== 'GOOD-CODE' || consoleState.redeemed.has(body.code))
        return json(res, 400, { code: 400, message: 'Invalid or used code', reason: 'REDEEM_CODE_INVALID' })
      consoleState.redeemed.add(body.code)
      consoleState.redeemHistory.unshift({
        id: consoleState.redeemHistory.length + 1,
        code: body.code,
        type: 'balance',
        value: 5,
        status: 'used',
        used_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
      ok(res, { message: 'ok', type: 'balance', value: 5, new_balance: 15 })
    })
    return true
  }
  if (path === '/redeem/history')
    return (
      ok(res, {
        items: consoleState.redeemHistory,
        total: consoleState.redeemHistory.length,
        page: 1,
        page_size: 20,
        pages: 1
      }),
      true
    )
  if (path === '/payment/checkout-info') return (ok(res, CHECKOUT), true)
  if (path === '/payment/config')
    return (
      ok(res, {
        payment_enabled: true,
        min_amount: 1,
        max_amount: 1000,
        enabled_payment_types: ['alipay'],
        stripe_publishable_key: ''
      }),
      true
    )
  if (path === '/payment/orders' && method === 'POST') {
    readBody(req).then((body) => {
      const id = consoleState.nextOrderId++
      const now = Date.now()
      const order = {
        id,
        amount: body.amount,
        payment_type: body.payment_type,
        polls: 0,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + 30 * 60000).toISOString()
      }
      consoleState.orders.unshift(order)
      ok(res, {
        order_id: id,
        amount: body.amount,
        pay_amount: body.amount,
        fee_rate: 0,
        pay_url: '',
        qr_code: `https://qr.example.com/pay/${id}`,
        expires_at: order.expires_at,
        result_type: 'order_created',
        payment_type: body.payment_type,
        out_trade_no: `OT-${id}`,
        payment_mode: 'qrcode',
        resume_token: `rt-order-${id}`,
        currency: 'CNY'
      })
    })
    return true
  }
  if (path === '/payment/orders/my') {
    const items = consoleState.orders.map(orderView)
    return (ok(res, { items, total: items.length, page: 1, page_size: 20, pages: 1 }), true)
  }
  if (path === '/payment/public/orders/resolve' && method === 'POST') {
    readBody(req).then((body) => {
      const id = Number(String(body.resume_token || '').replace('rt-order-', ''))
      const order = consoleState.orders.find((o) => o.id === id)
      if (!order) return fail(res, 404, 'NOT_FOUND', 'not found')
      const view = orderView(order)
      ok(res, {
        out_trade_no: view.out_trade_no,
        status: view.status,
        paid: view.status === 'COMPLETED',
        created_at: view.created_at,
        expires_at: view.expires_at
      })
    })
    return true
  }
  if (path === '/payment/orders/refund-eligible-providers')
    return (ok(res, { provider_instance_ids: [] }), true)
  const orderMatch = path.match(/^\/payment\/orders\/(\d+)$/)
  if (orderMatch && method === 'GET') {
    const order = consoleState.orders.find((o) => o.id === Number(orderMatch[1]))
    if (!order) return (fail(res, 404, 'NOT_FOUND', 'not found'), true)
    order.polls += 1
    return (ok(res, orderView(order)), true)
  }
  if (path === '/subscriptions' || path === '/subscriptions/active') return (ok(res, []), true)
  if (path === '/user/aff')
    return (
      ok(res, {
        user_id: 2,
        aff_code: 'AFF123',
        aff_count: 0,
        aff_quota: 0,
        aff_frozen_quota: 0,
        aff_history_quota: 0,
        effective_rebate_rate_percent: 10,
        invitees: []
      }),
      true
    )
  if (path === '/user/profile')
    return (
      ok(res, {
        ...tokens.get((req.headers.authorization || '').replace(/^Bearer /, '')),
        run_mode: 'standard'
      }),
      true
    )
  return false
}

async function handleApi(req, res, url) {
  const record = {
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: req.headers
  }
  state.requests.push(record)
  if (state.requests.length > 500) state.requests.shift()
  const auth = (req.headers.authorization || '').replace(/^Bearer /, '')

  if (url.pathname === '/health') return json(res, 200, { status: 'ok' })
  if (url.pathname === '/__contract/requests') return json(res, 200, state.requests)
  if (url.pathname === '/__contract/reset') {
    state.requests.length = 0
    return json(res, 200, {})
  }
  if (url.pathname === '/__contract/expire-access') {
    tokens.clear()
    return json(res, 200, {})
  }
  if (url.pathname === '/__contract/settings' && req.method === 'POST') {
    state.settings = { ...state.settings, ...(await readBody(req)) }
    return json(res, 200, state.settings)
  }
  if (url.pathname === '/setup/status') return ok(res, { needs_setup: mode === 'setup' && !state.installed })
  if (url.pathname === '/api/v1/settings/public') return ok(res, state.settings)

  if (url.pathname === '/api/v1/auth/login' && req.method === 'POST') {
    const body = await readBody(req)
    const entry = USERS[body.email]
    if (!entry || entry.password !== body.password)
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password')
    if (entry.totp)
      return ok(res, {
        requires_2fa: true,
        temp_token: `tmp-${entry.user.id}`,
        user_email_masked: 't***@example.com'
      })
    return ok(res, issue(entry.user))
  }
  if (url.pathname === '/api/v1/auth/login/2fa' && req.method === 'POST') {
    const body = await readBody(req)
    const entry = Object.values(USERS).find((u) => `tmp-${u.user.id}` === body.temp_token)
    if (!entry || entry.totp !== body.totp_code) return fail(res, 400, 'INVALID_TOTP', 'Invalid code')
    return ok(res, issue(entry.user))
  }
  if (url.pathname === '/api/v1/auth/refresh' && req.method === 'POST') {
    const body = await readBody(req)
    const user = refreshTokens.get(body.refresh_token)
    if (!user) return fail(res, 401, 'TOKEN_REVOKED', 'refresh token invalid')
    refreshTokens.delete(body.refresh_token)
    const next = issue(user)
    return ok(res, {
      access_token: next.access_token,
      refresh_token: next.refresh_token,
      expires_in: 900,
      token_type: 'Bearer'
    })
  }
  if (url.pathname === '/api/v1/auth/logout') return ok(res, {})
  if (url.pathname === '/api/v1/auth/me') {
    const user = tokens.get(auth)
    if (!user) return fail(res, 401, 'TOKEN_EXPIRED', 'token expired')
    return ok(res, { ...user, run_mode: 'standard' })
  }
  // ───────── R2：认证 / 安装向导 / 公共页的假接口 ─────────
  if (url.pathname === '/__contract/issue') {
    // 为测试构造 OAuth 回调 fragment：按邮箱签发一组有效令牌
    const entry = USERS[url.searchParams.get('email') || 'user@example.com']
    return json(res, 200, issue(entry.user))
  }
  if (url.pathname === '/api/v1/auth/oauth/pending/exchange')
    return json(res, 400, {
      code: 400,
      message: 'no pending oauth session',
      reason: 'PENDING_SESSION_MISSING'
    })
  if (url.pathname === '/api/v1/auth/validate-promo-code' && req.method === 'POST') {
    const body = await readBody(req)
    return body.code === 'PROMO5'
      ? ok(res, { valid: true, bonus_amount: 5 })
      : ok(res, { valid: false, error_code: 'PROMO_CODE_NOT_FOUND' })
  }
  if (url.pathname === '/api/v1/auth/validate-invitation-code' && req.method === 'POST') {
    const body = await readBody(req)
    return ok(
      res,
      body.code === 'INVITE1' ? { valid: true } : { valid: false, error_code: 'INVITATION_CODE_INVALID' }
    )
  }
  if (url.pathname === '/api/v1/auth/send-verify-code' && req.method === 'POST')
    return ok(res, { message: 'sent', countdown: 60 })
  if (url.pathname === '/api/v1/auth/register' && req.method === 'POST') {
    const body = await readBody(req)
    if (state.settings.email_verify_enabled && body.verify_code !== '123456')
      return json(res, 400, {
        code: 400,
        message: 'Invalid verification code',
        reason: 'INVALID_VERIFY_CODE'
      })
    if (USERS[body.email])
      return json(res, 409, { code: 409, message: 'Email already registered', reason: 'EMAIL_EXISTS' })
    const user = {
      id: 100 + state.tokenCounter,
      email: body.email,
      username: body.email.split('@')[0],
      role: 'user',
      balance: 0
    }
    USERS[body.email] = { password: body.password, user }
    return ok(res, issue(user))
  }
  if (url.pathname === '/api/v1/auth/forgot-password' && req.method === 'POST')
    return ok(res, { message: 'sent' })
  if (url.pathname === '/api/v1/auth/reset-password' && req.method === 'POST') {
    const body = await readBody(req)
    if (body.token !== 'good-token')
      return json(res, 400, { code: 400, message: 'bad token', reason: 'INVALID_RESET_TOKEN' })
    return ok(res, { message: 'reset' })
  }
  if (url.pathname === '/api/v1/model-plaza')
    return ok(res, {
      description: '**Prices** are per 1M tokens.',
      groups: [
        {
          id: 1,
          name: 'Claude Pro',
          description: 'Claude group',
          platform: 'anthropic',
          subscription_type: 'standard',
          rate_multiplier: 0.5,
          peak_rate_enabled: false,
          peak_start: '',
          peak_end: '',
          peak_rate_multiplier: 1,
          is_exclusive: false,
          image_rate_independent: false,
          image_rate_multiplier: 1,
          video_rate_independent: false,
          video_rate_multiplier: 1,
          long_context_pricing_enabled: true,
          models: [
            {
              name: 'claude-sonnet-x',
              platform: 'anthropic',
              pricing: { billing_mode: 'token', input_price: 0.000003, output_price: 0.000015 },
              official_pricing: {
                input_price: 0.000003,
                output_price: 0.000015,
                cache_write_price: null,
                cache_read_price: null
              }
            }
          ]
        },
        {
          id: 2,
          name: 'GPT Team',
          description: '',
          platform: 'openai',
          subscription_type: 'standard',
          rate_multiplier: 1,
          peak_rate_enabled: false,
          peak_start: '',
          peak_end: '',
          peak_rate_multiplier: 1,
          is_exclusive: false,
          image_rate_independent: false,
          image_rate_multiplier: 1,
          video_rate_independent: false,
          video_rate_multiplier: 1,
          long_context_pricing_enabled: true,
          models: [{ name: 'gpt-x', platform: 'openai', pricing: null, official_pricing: null }]
        }
      ]
    })
  if (url.pathname === '/api/v1/user/mcp/authorize') {
    if (req.method === 'GET')
      return ok(res, {
        client_id: url.searchParams.get('client_id'),
        client_name: 'Demo MCP Client',
        redirect_uri: url.searchParams.get('redirect_uri'),
        resource: url.searchParams.get('resource'),
        scope: 'mcp'
      })
    const body = await readBody(req)
    const target = new URL(body.authorization.redirect_uri)
    target.searchParams.set(body.approved ? 'code' : 'error', body.approved ? 'granted' : 'access_denied')
    return ok(res, { redirect_url: target.toString() })
  }
  if (url.pathname === '/v1/usage') {
    if (auth !== 'sk-valid') return json(res, 401, { error: { message: 'Invalid API key' } })
    return json(res, 200, {
      mode: 'quota_limited',
      isValid: true,
      status: 'active',
      quota: { limit: 10, used: 1, remaining: 9, unit: 'USD' },
      usage: {
        today: { requests: 1, actual_cost: 0.01 },
        total: { requests: 12, actual_cost: 0.12 },
        rpm: 0,
        tpm: 0
      },
      daily_usage: [
        {
          date: '2026-05-19',
          requests: 12,
          input_tokens: 100,
          output_tokens: 200,
          cache_read_tokens: 30,
          cache_write_tokens: 10,
          cost: 0.15,
          actual_cost: 0.12
        }
      ],
      model_stats: [
        {
          model: 'claude-sonnet-x',
          requests: 12,
          input_tokens: 100,
          output_tokens: 200,
          cache_creation_tokens: 10,
          cache_read_tokens: 30,
          total_tokens: 340,
          actual_cost: 0.12
        }
      ]
    })
  }
  if (url.pathname === '/setup/test-db' && req.method === 'POST') {
    const body = await readBody(req)
    return body.password === 'bad'
      ? json(res, 400, { code: 400, message: 'connection refused' })
      : ok(res, {})
  }
  if (url.pathname === '/setup/test-redis' && req.method === 'POST') return ok(res, {})
  if (url.pathname === '/setup/install' && req.method === 'POST') {
    state.installed = true
    return ok(res, { message: 'ok', restart: true })
  }
  // ───────── R3：用户控制台 / 支付链路的假接口 ─────────
  if (url.pathname.startsWith('/api/v1/') && handleUserConsole(req, res, url)) return
  if (url.pathname.startsWith('/api/v1/admin/compliance')) return ok(res, { required: false, version: 'v1' })
  if (url.pathname.startsWith('/api/v1/')) return ok(res, [])
  return json(res, 404, { code: 404, message: 'not found' })
}

function safeFile(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = join(distDir, clean)
  if (!file.startsWith(distDir)) return null
  return existsSync(file) && statSync(file).isFile() ? file : null
}

function serveIndex(req, res, nonce) {
  let html = readIndex()
  if (mode === 'normal') {
    const injected = `<script nonce="${nonce}">window.__APP_CONFIG__=${JSON.stringify(state.settings)};</script>`
    html = html.replace('</head>', `${injected}</head>`)
    const name = (state.settings.site_name || '').trim()
    if (name) html = html.replace(/<title>[^<]*<\/title>/, `<title>${name} - AI API Gateway</title>`)
    const logo = (state.settings.site_logo || '').trim()
    if (logo) {
      const start = html.indexOf('<link rel="icon"')
      if (start !== -1) {
        const end = html.indexOf('>', start) + 1
        html = html.slice(0, start) + `<link rel="icon" href="${logo}" />` + html.slice(end)
      }
    }
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(html)
}

// 每次请求都重新读取（本地反复构建时避免服务端缓存过期的 index.html）
const readIndex = () => readFileSync(join(distDir, 'index.html'), 'utf8')

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname
  const nonce = randomBytes(16).toString('base64')

  // 安全头（SecurityHeaders 中间件）：API 路径不下发 CSP
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  const isApi =
    pathname.startsWith('/api/') || pathname.startsWith('/images') || pathname.startsWith('/responses')
  if (!isApi)
    res.setHeader('Content-Security-Policy', DEFAULT_CSP.replace('__CSP_NONCE__', `'nonce-${nonce}'`))

  if (bypassesFrontend(pathname) || pathname.startsWith('/__contract/')) return handleApi(req, res, url)

  const clean = pathname.replace(/^\//, '')
  if (clean === '' || clean === 'index.html') return serveIndex(req, res, nonce)
  const file = safeFile(pathname)
  if (!file) return serveIndex(req, res, nonce) // SPA 回退：一律返回根 index.html

  // 与后端一致：Go FileServer 对目录会 301（产物里不应存在与路由同名的目录）
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

server.listen(port, () =>
  console.log(`[contract-server] ${mode} mode on http://127.0.0.1:${port} (dist: ${distDir})`)
)
