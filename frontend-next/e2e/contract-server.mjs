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
  if (url.pathname.startsWith('/api/v1/') && handleAdminConsole(req, res, url)) return
  if (url.pathname.startsWith('/api/v1/admin/compliance')) return ok(res, { required: false, version: 'v1' })
  if (url.pathname.startsWith('/api/v1/')) return ok(res, [])
  return json(res, 404, { code: 404, message: 'not found' })
}

// ───────── R4：管理后台核心资源的假接口（用户 CRUD / Step-up / 423 合规 / 代理）─────────
const adminState = {
  settings: {
    site_name: 'Sub2API',
    site_subtitle: 'Gateway',
    table_default_page_size: 20,
    table_page_size_options: [10, 20, 50, 100],
    registration_enabled: true,
    subscription_enabled: true,
    ops_monitoring_enabled: true,
    ops_realtime_monitoring_enabled: true,
    ops_query_mode_default: 'auto',
    smtp_port: 587,
    default_balance: 0,
    default_concurrency: 1,
    payment_load_balance_strategy: 'round-robin'
  },
  lastSettingsPayload: null,
  promptAudit: {
    enabled: false,
    blocking_enabled: false,
    blocking_latest_turn_only: false,
    store_pass_events: false,
    effective_mode: 'off',
    strategy: 'priority',
    worker_count: 2,
    queue_capacity: 1000,
    scanners: ['pii'],
    all_groups: true,
    group_ids: [],
    endpoints: [],
    config_version: 1,
    updated_at: '',
    updated_by: 0,
    change_summary: ''
  },
  complianceRequired: false,
  stepUpGranted: false,
  nextUserId: 10,
  users: [
    {
      id: 2,
      email: 'user@example.com',
      username: 'user',
      role: 'user',
      balance: 10,
      concurrency: 5,
      rpm_limit: 0,
      status: 'active',
      allowed_groups: null,
      notes: '',
      balance_notify_enabled: false,
      balance_notify_threshold: null,
      balance_notify_extra_emails: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    },
    {
      id: 3,
      email: 'second@example.com',
      username: 'second',
      role: 'user',
      balance: 0,
      concurrency: 5,
      rpm_limit: 0,
      status: 'active',
      allowed_groups: null,
      notes: 'vip',
      balance_notify_enabled: false,
      balance_notify_threshold: null,
      balance_notify_extra_emails: [],
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z'
    }
  ],
  proxies: [
    {
      id: 1,
      name: 'seed-proxy',
      protocol: 'socks5',
      host: '10.0.0.1',
      port: 1080,
      username: null,
      status: 'active',
      account_count: 0,
      expires_at: null,
      fallback_mode: 'none'
    }
  ]
}
const page = (items, url) => ({
  items,
  total: items.length,
  page: Number(url.searchParams.get('page') || 1),
  page_size: Number(url.searchParams.get('page_size') || 20),
  pages: 1
})

function handleAdminConsole(req, res, url) {
  const path = url.pathname.replace('/api/v1', '')
  const method = req.method
  if (path === '/admin/compliance' && method === 'GET')
    return (
      ok(res, {
        required: adminState.complianceRequired,
        version: 'v1',
        document_path_zh: '',
        document_path_en: '',
        document_url_zh: '',
        document_url_en: '',
        ack_phrase_zh: '',
        ack_phrase_en:
          'I have read, understood, and agree to the Sub2API Deployment and Operation Compliance Commitment'
      }),
      true
    )
  if (path === '/admin/compliance/accept' && method === 'POST') {
    adminState.complianceRequired = false
    return (
      ok(res, {
        required: false,
        version: 'v1',
        document_path_zh: '',
        document_path_en: '',
        document_url_zh: '',
        document_url_en: '',
        ack_phrase_zh: '',
        ack_phrase_en: ''
      }),
      true
    )
  }
  if (path === '/user/totp/step-up' && method === 'POST') {
    readBody(req).then((body) => {
      if (body.code !== '123456') return fail(res, 400, 'TOTP_INVALID', 'invalid code')
      adminState.stepUpGranted = true
      ok(res, { granted: true })
    })
    return true
  }
  // 合规未确认时，所有管理接口返回 423（触发全局合规弹窗）
  if (path.startsWith('/admin/') && adminState.complianceRequired)
    return (
      json(res, 423, {
        code: 'ADMIN_COMPLIANCE_ACK_REQUIRED',
        message: 'compliance acknowledgement required',
        metadata: { version: 'v1' }
      }),
      true
    )
  if (path === '/admin/test/compliance-on') {
    adminState.complianceRequired = true
    return (ok(res, {}), true)
  }
  // ───────── R5：系统设置 / 审计日志 / 插件 / 版本 / 运维的假接口 ─────────
  if (path === '/admin/settings' && method === 'GET') return (ok(res, adminState.settings), true)
  if (path === '/admin/settings' && method === 'PUT') {
    readBody(req).then((body) => {
      adminState.lastSettingsPayload = body
      adminState.settings = { ...adminState.settings, ...body }
      ok(res, adminState.settings)
    })
    return true
  }
  if (path === '/admin/test/last-settings-payload')
    return (ok(res, adminState.lastSettingsPayload ?? null), true)
  if (path === '/admin/settings/web-search-emulation' && method === 'GET')
    return (ok(res, { enabled: false, providers: [] }), true)
  if (path === '/admin/settings/admin-api-key') return (ok(res, { exists: false, masked_key: '' }), true)
  if (path === '/admin/settings/admin-api-keys') return (ok(res, { items: [], permissions: [] }), true)
  if (path === '/admin/settings/email-templates')
    return (ok(res, { events: ['auth.verify_code'], locales: ['en', 'zh'], placeholders: [] }), true)
  if (path === '/admin/settings/registration-email-blacklist')
    return (ok(res, { emails: [], max: 100 }), true)
  if (path === '/admin/prompt-audit/config' && method === 'GET')
    return (ok(res, adminState.promptAudit), true)
  if (path === '/admin/prompt-audit/config' && method === 'PUT') {
    readBody(req).then((body) => {
      adminState.promptAudit = {
        ...adminState.promptAudit,
        ...body,
        config_version: adminState.promptAudit.config_version + 1,
        endpoints: (body.endpoints || []).map((e) => ({
          ...e,
          has_token: !!e.token,
          token_status: e.token ? 'configured' : 'missing'
        }))
      }
      ok(res, adminState.promptAudit)
    })
    return true
  }
  if (path === '/admin/prompt-audit/runtime')
    return (
      ok(res, {
        process_status: 'disabled',
        effective_mode: 'off',
        expected_config_version: 1,
        active_config_version: 1,
        worker_total: 2,
        worker_active: 0,
        queue_capacity: 1000,
        queue: { staging: 0, queued: 0, processing: 0, retry: 0, done: 0, failed: 0, active: 0 },
        processed_total: 0,
        failed_total: 0,
        enqueued_total: 0,
        dropped_total: 0,
        database_status: 'ok',
        redis_status: 'ok',
        endpoints: {},
        guard_metrics: {
          total: 0,
          allowed: 0,
          flagged: 0,
          blocked: 0,
          unavailable: 0,
          invalid: 0,
          timeouts: 0,
          failovers: 0,
          bulkhead_full: 0,
          record_failed: 0
        }
      }),
      true
    )
  if (path === '/admin/prompt-audit/events')
    return (ok(res, { items: [], total: 0, page: 1, page_size: 20, pages: 0 }), true)
  if (path === '/admin/risk-control/config')
    return (
      ok(res, {
        enabled: false,
        mode: 'pre_block',
        base_url: 'https://api.openai.com',
        model: 'omni-moderation-latest',
        proxy_id: null,
        api_key_configured: false,
        api_key_masked: '',
        api_key_count: 0,
        api_key_masks: [],
        api_key_statuses: [],
        timeout_ms: 3000,
        sample_rate: 100,
        all_groups: true,
        group_ids: [],
        record_non_hits: false,
        thresholds: {},
        worker_count: 4,
        queue_size: 32768,
        block_status: 403,
        block_message: '',
        email_on_hit: true,
        auto_ban_enabled: true,
        ban_threshold: 10,
        violation_window_hours: 720,
        retry_count: 2,
        hit_retention_days: 180,
        non_hit_retention_days: 3,
        pre_hash_check_enabled: false,
        blocked_keywords: [],
        keyword_blocking_mode: 'keyword_and_api',
        model_filter: { type: 'all', models: [] },
        cyber_policy_exclude_from_ban_count: false
      }),
      true
    )
  if (path === '/admin/risk-control/status')
    return (
      ok(res, {
        enabled: false,
        risk_control_enabled: true,
        mode: 'pre_block',
        worker_count: 4,
        max_workers: 8,
        active_workers: 0,
        idle_workers: 4,
        queue_size: 100,
        queue_length: 0,
        queue_usage_percent: 0,
        enqueued: 0,
        dropped: 0,
        processed: 0,
        errors: 0,
        pre_block_active: 0,
        pre_block_checked: 0,
        pre_block_allowed: 0,
        pre_block_blocked: 0,
        pre_block_errors: 0,
        pre_block_avg_latency_ms: 0,
        pre_block_api_key_active: 0,
        pre_block_api_key_available_count: 0,
        pre_block_api_key_total_calls: 0,
        pre_block_api_key_loads: [],
        api_key_statuses: [],
        flagged_hash_count: 0,
        last_cleanup_deleted_hit: 0,
        last_cleanup_deleted_non_hit: 0
      }),
      true
    )
  if (path === '/admin/risk-control/logs')
    return (ok(res, { items: [], total: 0, page: 1, page_size: 20, pages: 0 }), true)
  if (path === '/admin/audit-logs' && method === 'GET') {
    const items = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
      actor_email: 'admin@example.com',
      actor_role: 'admin',
      auth_method: 'jwt',
      credential_masked: '',
      action: `settings.update.${i}`,
      method: 'PUT',
      path: '/api/v1/admin/settings',
      request_id: `req-${i}`,
      client_ip: '127.0.0.1',
      user_agent: 'e2e',
      status_code: i === 2 ? 500 : 200,
      latency_ms: 12 + i
    }))
    return (ok(res, { items, total: items.length, page: 1, page_size: 20, pages: 1 }), true)
  }
  if (/^\/admin\/audit-logs\/\d+$/.test(path))
    return (
      ok(res, {
        id: 1,
        created_at: new Date().toISOString(),
        actor_email: 'admin@example.com',
        actor_role: 'admin',
        auth_method: 'jwt',
        credential_masked: '',
        action: 'settings.update.0',
        method: 'PUT',
        path: '/api/v1/admin/settings',
        request_id: 'req-0',
        client_ip: '127.0.0.1',
        user_agent: 'e2e',
        request_body: '{"site_name":"x"}',
        status_code: 200,
        latency_ms: 12
      }),
      true
    )
  if (path === '/admin/plugins' && method === 'GET')
    return (
      ok(res, [
        {
          id: 1,
          plugin_key: 'demo.transport',
          name: 'Demo Transport',
          version: '1.0.0',
          description: 'demo',
          author: 'qa',
          manifest: {},
          binary_sha256: 'x',
          signature_status: 'trusted',
          state: 'disabled',
          last_error: '',
          installed_at: '',
          updated_at: '',
          bindings: [],
          compatibility: {
            compatible: true,
            tested: true,
            status: 'compatible',
            message: 'ok',
            current_sub2api_version: '1.0.0',
            required_sub2api_version: '>=1.0.0',
            recommended_sub2api_version: '1.0.0',
            plugin_protocol: 1,
            transport_api: 1,
            ui_bridge: 1
          },
          runtime_healthy: false,
          runtime_message: ''
        }
      ]),
      true
    )
  if (path === '/admin/system/check-updates')
    return (
      ok(res, {
        current_version: '0.2.23',
        latest_version: '0.2.24',
        has_update: true,
        cached: false,
        build_type: 'release',
        release_info: { name: 'v0.2.24', body: 'notes', published_at: '', html_url: 'https://example.com/r' }
      }),
      true
    )
  if (path === '/admin/ops/advanced-settings')
    return (
      ok(res, {
        data_retention: {
          cleanup_enabled: false,
          cleanup_schedule: '',
          error_log_retention_days: 30,
          minute_metrics_retention_days: 7,
          hourly_metrics_retention_days: 30
        },
        aggregation: { aggregation_enabled: false },
        openai_account_quota_auto_pause: { default_threshold_5h: 0, default_threshold_7d: 0 },
        ignore_count_tokens_errors: false,
        ignore_context_canceled: false,
        ignore_no_available_accounts: false,
        ignore_invalid_api_key_errors: false,
        ignore_insufficient_balance_errors: false,
        display_openai_token_stats: false,
        display_alert_events: false,
        auto_refresh_enabled: false,
        auto_refresh_interval_seconds: 30
      }),
      true
    )
  if (path === '/admin/groups/all' || path === '/admin/groups/all-including-inactive')
    return (ok(res, []), true)
  if (path === '/admin/users' && method === 'GET') {
    const q = (url.searchParams.get('search') || '').toLowerCase()
    return (
      ok(
        res,
        page(
          adminState.users.filter(
            (u) => !q || u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
          ),
          url
        )
      ),
      true
    )
  }
  if (path === '/admin/users' && method === 'POST') {
    // 创建用户是敏感操作：本会话未通过 Step-up 时返回 STEP_UP_REQUIRED
    if (!adminState.stepUpGranted)
      return (json(res, 403, { code: 403, message: 'step-up required', reason: 'STEP_UP_REQUIRED' }), true)
    readBody(req).then((body) => {
      const user = {
        ...adminState.users[0],
        id: adminState.nextUserId++,
        email: body.email,
        username: body.username || '',
        role: body.role || 'user',
        balance: body.balance ?? 0,
        concurrency: body.concurrency ?? 5,
        notes: body.notes || ''
      }
      adminState.users.unshift(user)
      ok(res, user)
    })
    return true
  }
  const userMatch = path.match(/^\/admin\/users\/(\d+)$/)
  if (userMatch && method === 'DELETE') {
    if (!adminState.stepUpGranted)
      return (json(res, 403, { code: 403, message: 'step-up required', reason: 'STEP_UP_REQUIRED' }), true)
    adminState.users = adminState.users.filter((u) => u.id !== Number(userMatch[1]))
    return (ok(res, { message: 'deleted' }), true)
  }
  if (path === '/admin/proxies' && method === 'GET') return (ok(res, page(adminState.proxies, url)), true)
  if (path === '/admin/proxies/all') return (ok(res, adminState.proxies), true)
  if (path === '/admin/proxies/batch' && method === 'POST') {
    readBody(req).then((body) => {
      let created = 0
      for (const p of body.proxies || []) {
        adminState.proxies.push({
          id: adminState.proxies.length + 1,
          name: `${p.host}:${p.port}`,
          protocol: p.protocol,
          host: p.host,
          port: p.port,
          username: p.username || null,
          status: 'active',
          account_count: 0,
          expires_at: null,
          fallback_mode: 'none'
        })
        created++
      }
      ok(res, { created, skipped: 0 })
    })
    return true
  }
  const adminAnnouncement = path === '/admin/dashboard/snapshot-v2'
  if (adminAnnouncement)
    return (
      ok(res, {
        generated_at: '',
        start_date: '',
        end_date: '',
        granularity: 'day',
        stats: {
          total_users: adminState.users.length,
          today_new_users: 0,
          active_users: 1,
          total_api_keys: 1,
          active_api_keys: 1,
          total_accounts: 3,
          normal_accounts: 2,
          error_accounts: 1,
          ratelimit_accounts: 0,
          today_requests: 7,
          total_requests: 70,
          today_tokens: 1234,
          total_tokens: 12340,
          today_cost: 1,
          today_actual_cost: 1,
          today_account_cost: 1,
          total_actual_cost: 10,
          average_duration_ms: 321,
          rpm: 3,
          tpm: 400
        },
        trend: [],
        models: [],
        groups: []
      }),
      true
    )
  return false
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
