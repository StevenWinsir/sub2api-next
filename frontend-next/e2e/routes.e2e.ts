import { expect, test, type Page } from '@playwright/test'
import { collectCsp, expectClean, loginViaUi, watchPage } from './helpers'

/** 附录 A 的路由样例（动态段使用具体值）。value：登录管理员后的预期最终路径（缺省为自身）。 */
const ADMIN_EXPECT: Record<string, string> = {
  '/': '/home',
  '/login': '/admin/dashboard',
  '/register': '/admin/dashboard',
  '/setup': '/admin/dashboard',
  '/admin': '/admin/dashboard',
  '/admin/channels': '/admin/channels/pricing',
  '/admin/affiliates': '/admin/affiliates/invites'
}

const ROUTES = [
  '/',
  '/setup',
  '/home',
  '/login',
  '/register',
  '/email-verify',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/auth/oauth/callback',
  '/auth/linuxdo/callback',
  '/auth/wechat/callback',
  '/auth/dingtalk/callback',
  '/auth/dingtalk/email-completion',
  '/auth/oidc/callback',
  '/auth/wechat/payment/callback',
  '/key-usage',
  '/legal/privacy',
  '/model-plaza',
  '/oauth/mcp/authorize',
  '/dashboard',
  '/keys',
  '/batch-image',
  '/usage',
  '/redeem',
  '/affiliate',
  '/available-channels',
  '/monitor',
  '/settings/mcp',
  '/profile',
  '/subscriptions',
  '/purchase',
  '/orders',
  '/payment/qrcode',
  '/payment/result',
  '/payment/stripe',
  '/payment/airwallex',
  '/payment/stripe-popup',
  '/custom/abc',
  '/admin',
  '/admin/dashboard',
  '/admin/users',
  '/admin/groups',
  '/admin/accounts',
  '/admin/channels',
  '/admin/channels/pricing',
  '/admin/channels/monitor',
  '/admin/subscriptions',
  '/admin/proxies',
  '/admin/redeem',
  '/admin/promo-codes',
  '/admin/announcements',
  '/admin/usage',
  '/admin/affiliates',
  '/admin/affiliates/invites',
  '/admin/affiliates/rebates',
  '/admin/affiliates/transfers',
  '/admin/orders/dashboard',
  '/admin/orders',
  '/admin/orders/plans',
  '/admin/settings',
  '/admin/ops',
  '/admin/audit-logs',
  '/admin/risk-control',
  '/admin/prompt-audit',
  '/admin/plugins'
]

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
}

test.describe('deep links as a signed-in administrator (normal mode)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, 'admin@example.com', 'admin-pass')
    await page.waitForURL('**/admin/dashboard')
  })

  for (const route of ROUTES) {
    test(`direct visit + reload: ${route}`, async ({ page }) => {
      const watcher = await watchPage(page)
      const expected = ADMIN_EXPECT[route] ?? route
      // search + hash 必须完整保留（OAuth 回调的令牌在 fragment 里）；被重定向的路由保留 query/hash 的规则见门禁测试
      const suffix = '?page=2&q=a#frag'
      await page.goto(`${route}${suffix}`)
      await settle(page)

      const url = new URL(page.url())
      if (route === '/login' || route === '/register' || route === '/setup') {
        // 已登录 / 已安装：门禁按角色重定向
        expect(url.pathname).toBe(expected)
      } else {
        expect(url.pathname).toBe(expected)
        expect(url.search).toBe('?page=2&q=a')
        // OAuth 回调页读取 fragment 后会立即清除它（令牌不应留在地址栏）
        expect(url.hash).toBe(
          /^\/auth\/(oauth\/|linuxdo\/|wechat\/|dingtalk\/|oidc\/)?callback$/.test(route) ? '' : '#frag'
        )
        // R1 占位页或 R2 起的真实页面：外壳统一带 data-route-name
        await expect(page.locator('[data-route-name]').first()).toBeAttached()
      }

      await page.reload()
      await settle(page)
      expect(new URL(page.url()).pathname).toBe(expected)
      await expectClean(page, watcher)
    })
  }

  test('unknown path renders 404 in place without a reload loop', async ({ page }) => {
    const watcher = await watchPage(page)
    let loads = 0 // 刷新循环会反复触发 load；就地渲染 404 只会有首次加载
    page.on('load', () => loads++)
    await page.goto('/definitely/not/a/route?x=1#y')
    await settle(page)
    await expect(page.getByTestId('not-found')).toBeVisible()
    expect(page.url()).toContain('/definitely/not/a/route?x=1#y') // URL 不被改写
    await page.waitForTimeout(1500)
    expect(loads).toBe(1)
    await expectClean(page, watcher)
  })

  test('browser back / forward restore the right page', async ({ page }) => {
    await page.goto('/keys')
    await settle(page)
    await page.getByRole('link', { name: 'Usage' }).first().click()
    await page.waitForURL('**/usage')
    await expect(page.locator('[data-route-name]').first()).toHaveAttribute('data-route-name', 'Usage')
    await page.goBack()
    await page.waitForURL('**/keys')
    await expect(page.locator('[data-route-name]').first()).toHaveAttribute('data-route-name', 'Keys')
    await page.goForward()
    await page.waitForURL('**/usage')
    await expect(page.locator('[data-route-name]').first()).toHaveAttribute('data-route-name', 'Usage')
  })

  test('redirect-type routes keep query and hash', async ({ page }) => {
    await page.goto('/admin/channels?x=1#h')
    await page.waitForURL('**/admin/channels/pricing?x=1#h')
  })
})

test.describe('anonymous access (normal mode)', () => {
  test('protected routes go to /login with the original full path in redirect', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/admin/users?page=2#x')
    await page.waitForURL('**/login?**')
    const redirect = new URL(page.url()).searchParams.get('redirect')
    expect(redirect).toBe('/admin/users?page=2#x')
    await expectClean(page, watcher)
  })

  test('public routes render without login and OAuth fragment survives', async ({ page }) => {
    for (const route of ['/home', '/key-usage', '/legal/terms', '/model-plaza']) {
      await page.goto(`${route}?code=1#frag`)
      await settle(page)
      expect(new URL(page.url()).pathname).toBe(route)
      expect(new URL(page.url()).hash).toBe('#frag')
      await expect(page.locator('#main-content')).toBeVisible()
    }
  })

  test('/ goes to /home', async ({ page }) => {
    await page.goto('/?aff=abc')
    await page.waitForURL('**/home?aff=abc')
  })

  test('collects no CSP violations while navigating the whole public surface', async ({ page }) => {
    const watcher = await watchPage(page)
    for (const route of ['/home', '/login', '/register', '/forgot-password', '/nope']) {
      await page.goto(route)
      await settle(page)
      await collectCsp(page, watcher)
    }
    expect(watcher.csp).toEqual([])
    expect(watcher.errors).toEqual([])
  })
})
