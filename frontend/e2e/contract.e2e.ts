import { expect, test } from '@playwright/test'
import { expectClean, LEGACY, loginViaUi, NORMAL, SETUP, watchPage } from './helpers'

interface Recorded {
  method: string
  path: string
  query: Record<string, string>
  headers: Record<string, string>
}
const recorded = async (request: import('@playwright/test').APIRequestContext, base: string) =>
  (await (await request.get(`${base}/__contract/requests`)).json()) as Recorded[]

test.describe('index.html contract (normal mode, backend injection)', () => {
  test('injected title / config are visible on first paint and the HTML has no inline executable script', async ({
    request,
    page
  }) => {
    const html = await (await request.get(`${NORMAL}/admin/users`)).text() // SPA 回退 → 根 index.html
    expect(html).toContain('<title>Contract Site - AI API Gateway</title>')
    expect(html).toMatch(/<script nonce="[^"]+">window\.__APP_CONFIG__=/)
    expect(html).toContain('<link rel="icon"')
    // 除后端注入的 nonce 脚本外，没有任何内联可执行脚本
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(
      ([, attrs, body]) =>
        !/\bsrc=/.test(attrs) &&
        !/type="application\/json"/.test(attrs) &&
        body.trim() &&
        !/nonce=/.test(attrs)
    )
    expect(inline).toEqual([])

    const watcher = await watchPage(page)
    await page.goto('/home')
    await expect.poll(() => page.title()).toBe('Home - Contract Site')
    await expectClean(page, watcher)
  })

  test('CSP header forbids inline / eval scripts', async ({ request }) => {
    const res = await request.get(`${NORMAL}/home`)
    const csp = res.headers()['content-security-policy']
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'))!
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'unsafe-eval'")
    expect(res.headers()['x-frame-options']).toBe('DENY')
  })

  test('dark preference applies before first paint (theme-init.js)', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' })
    const page = await context.newPage()
    await page.goto(`${NORMAL}/home`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await context.close()
  })

  test('saved theme / locale / table page size survive (upgrade compatibility keys)', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' })
    await context.addInitScript(() => {
      localStorage.setItem('theme', 'dark')
      localStorage.setItem('sub2api_locale', 'zh')
      localStorage.setItem('table-page-size', '50')
    })
    const page = await context.newPage()
    await page.goto(`${NORMAL}/login`)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('table-page-size'))).toBe('50')
    await context.close()
  })
})

test.describe('auth + request contract', () => {
  test('login stores legacy keys; requests carry Authorization / Accept-Language / timezone / admin header', async ({
    page,
    request
  }) => {
    await request.get(`${NORMAL}/__contract/reset`)
    const watcher = await watchPage(page)
    await loginViaUi(page, 'admin@example.com', 'admin-pass')
    await page.waitForURL('**/admin/dashboard')
    const keys = await page.evaluate(() => ({
      token: localStorage.getItem('auth_token'),
      refresh: localStorage.getItem('refresh_token'),
      user: localStorage.getItem('auth_user'),
      exp: localStorage.getItem('token_expires_at')
    }))
    expect(keys.token).toMatch(/^at-1-/)
    expect(keys.refresh).toMatch(/^rt-1-/)
    expect(JSON.parse(keys.user!).role).toBe('admin')
    expect(Number(keys.exp)).toBeGreaterThan(Date.now())

    await page.reload()
    await page.waitForLoadState('networkidle')
    const calls = await recorded(request, NORMAL)
    const me = calls.filter((c) => c.path === '/api/v1/auth/me').at(-1)!
    expect(me.headers.authorization).toMatch(/^Bearer at-1-/)
    expect(me.headers['accept-language']).toBe('en')
    expect(me.query.timezone).toBeTruthy() // 所有 GET 请求自动附带 timezone
    const compliance = calls.find((c) => c.path.startsWith('/api/v1/admin/compliance'))
    expect(compliance?.headers['x-admin-ui-request']).toBe('1')
    await expectClean(page, watcher)
  })

  test('TOTP login flow', async ({ page }) => {
    const watcher = await watchPage(page)
    await loginViaUi(page, 'totp@example.com', 'totp-pass')
    await page.getByLabel('Verification code').fill('123456')
    await page.getByRole('button', { name: 'Verify' }).click()
    await page.waitForURL('**/dashboard')
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toMatch(/^at-3-/)
    await expectClean(page, watcher)
  })

  test('login honours a safe redirect and ignores an open redirect', async ({ page }) => {
    await page.goto('/login?redirect=/keys')
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel(/^Password/).fill('user-pass')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/keys')

    await page.evaluate(() => localStorage.clear())
    await page.goto('/login?redirect=//evil.example.com')
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel(/^Password/).fill('user-pass')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')
    expect(new URL(page.url()).origin).toBe(new URL(NORMAL).origin)
  })

  test('silently refreshes an expired access token and replays the request', async ({ page, request }) => {
    await loginViaUi(page, 'user@example.com', 'user-pass')
    await page.waitForURL('**/dashboard')
    await request.get(`${NORMAL}/__contract/expire-access`) // 服务端让 access token 失效
    await request.get(`${NORMAL}/__contract/reset`)
    const before = await page.evaluate(() => localStorage.getItem('auth_token'))
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-route-name="Dashboard"]').first()).toBeAttached()
    const after = await page.evaluate(() => localStorage.getItem('auth_token'))
    expect(after).not.toBe(before) // 已刷新
    const calls = await recorded(request, NORMAL)
    expect(calls.filter((c) => c.path === '/api/v1/auth/refresh')).toHaveLength(1) // 单飞
  })

  test('an invalid refresh token sends the user to /login with the expired notice', async ({
    page,
    request
  }) => {
    await loginViaUi(page, 'user@example.com', 'user-pass')
    await page.waitForURL('**/dashboard')
    await request.get(`${NORMAL}/__contract/expire-access`)
    await page.evaluate(() => localStorage.setItem('refresh_token', 'rt-bogus'))
    await page.reload()
    await page.waitForURL('**/login**')
    await expect(page.getByText('Session expired. Please log in again.').first()).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull()
  })

  test('sign out clears the session', async ({ page }) => {
    await loginViaUi(page, 'user@example.com', 'user-pass')
    await page.waitForURL('**/dashboard')
    await page.getByRole('button', { name: 'User menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await page.waitForURL('**/login')
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull()
  })
})

test.describe('feature-flag gate (fail-open)', () => {
  test.afterEach(async ({ request }) => {
    await request.post(`${NORMAL}/__contract/settings`, { data: { payment_enabled: true } })
  })
  test('explicit payment_enabled=false blocks /purchase', async ({ page, request }) => {
    await request.post(`${NORMAL}/__contract/settings`, { data: { payment_enabled: false } })
    await loginViaUi(page, 'user@example.com', 'user-pass')
    await page.waitForURL('**/dashboard')
    await page.goto('/purchase')
    await page.waitForURL('**/dashboard')
  })
})

test.describe('legacy mode (no injection, CSP still enforced)', () => {
  test('boots and renders with zero CSP violations', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto(`${LEGACY}/admin/users?x=1`)
    await page.waitForURL('**/login?**')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    const html = await (await page.request.get(`${LEGACY}/home`)).text()
    expect(html).not.toContain('__APP_CONFIG__')
    await expectClean(page, watcher)
  })
})

test.describe('setup wizard mode (no injection, CSP forced on)', () => {
  for (const path of ['/', '/home', '/login', '/dashboard', '/admin/users', '/whatever']) {
    test(`any path enters /setup: ${path}`, async ({ page }) => {
      const watcher = await watchPage(page)
      await page.goto(`${SETUP}${path}`)
      await page.waitForURL('**/setup')
      await expect(page.getByTestId('setup-wizard')).toBeVisible()
      await expectClean(page, watcher)
    })
  }
})
