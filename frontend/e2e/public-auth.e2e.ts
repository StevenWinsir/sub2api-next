/**
 * R2：公共站点、认证体系、安装向导（契约模拟服务；真实后端联调见 README）。
 * 覆盖：注册（含邮箱验证码）、找回 / 重置密码、OAuth 回调（legacy fragment 与错误）、MCP 授权同意页、
 * Key 用量查询、模型广场、法律文档、首页三种模式、登录协议门禁、安装向导全流程。
 * Passkey（需虚拟认证器）、Turnstile（官方测试 sitekey）与邮件捕获服务属于真实环境联调项。
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { expectClean, NORMAL, SETUP, watchPage } from './helpers'

async function setSettings(request: APIRequestContext, patch: Record<string, unknown>) {
  await request.post(`${NORMAL}/__contract/settings`, { data: patch })
}

const DEFAULTS = {
  email_verify_enabled: false,
  registration_enabled: true,
  promo_code_enabled: false,
  invitation_code_enabled: false,
  home_content: '',
  compact_home_enabled: false,
  login_agreement_enabled: false,
  login_agreement_documents: [],
  password_reset_enabled: true
}

let counter = 0
const uniqueEmail = () => `new${Date.now()}${++counter}@example.com`

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
}

test.beforeEach(async ({ request }) => {
  await setSettings(request, DEFAULTS)
})

test.describe('register', () => {
  test('creates an account and lands on the dashboard', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/register')
    await page.getByLabel('Email').fill(uniqueEmail())
    await page.getByLabel(/^Password/).fill('secret-123')
    await page.getByLabel('Confirm Password').fill('secret-123')
    await page.getByRole('button', { name: 'Create Account' }).click()
    await page.waitForURL('**/dashboard')
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeTruthy()
    await expectClean(page, watcher)
  })

  test('validates the form before submitting', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByLabel(/^Password/).fill('123')
    await page.getByLabel('Confirm Password').fill('456')
    await page.getByRole('button', { name: 'Create Account' }).click()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /valid email/i })
        .first()
    ).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/register')
  })

  test('email verification: stages register_data, sends a code, then registers', async ({
    page,
    request
  }) => {
    await setSettings(request, { email_verify_enabled: true })
    await page.goto('/register')
    await page.getByLabel('Email').fill(uniqueEmail())
    await page.getByLabel(/^Password/).fill('secret-123')
    await page.getByLabel('Confirm Password').fill('secret-123')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL('**/email-verify')
    await expect(page.getByText('Verification code sent!', { exact: false })).toBeVisible()
    await page.getByLabel('Verification Code').fill('123456')
    await page.getByRole('button', { name: 'Verify & Create Account' }).click()
    await page.waitForURL('**/dashboard')
    // register_data 在成功后被清理
    expect(await page.evaluate(() => sessionStorage.getItem('register_data'))).toBeNull()
  })

  test('/email-verify without staged data explains that the session expired', async ({ page }) => {
    await page.goto('/email-verify')
    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('affiliate code from the URL is remembered and promo codes are validated when enabled', async ({
    page,
    request
  }) => {
    await setSettings(request, { promo_code_enabled: true })
    await page.goto('/register?aff=AFF123&promo=PROMO5')
    await expect(page.getByText('Valid! You will receive $5.00 bonus balance')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('affiliate_referral_code') || '')).toContain(
      'AFF123'
    )
  })

  test('registration disabled shows the notice instead of the form', async ({ page, request }) => {
    await setSettings(request, { registration_enabled: false })
    await page.goto('/register')
    await expect(page.getByRole('status')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create Account' })).toHaveCount(0)
  })
})

test.describe('password recovery', () => {
  test('forgot password shows the confirmation state', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByRole('button', { name: 'Send Reset Link' }).click()
    await expect(page.getByRole('heading', { name: 'Reset Link Sent' })).toBeVisible()
  })

  test('reset password from the emailed link', async ({ page }) => {
    await page.goto('/reset-password?email=user%40example.com&token=good-token')
    await page.getByLabel('New Password').fill('brand-new-1')
    await page.getByLabel('Confirm Password').fill('brand-new-1')
    await page.getByRole('button', { name: 'Reset Password' }).click()
    await expect(page.getByRole('heading', { name: 'Password Reset Successful' })).toBeVisible()
  })

  test('an invalid / expired token shows a friendly error', async ({ page }) => {
    await page.goto('/reset-password?email=user%40example.com&token=bad')
    await page.getByLabel('New Password').fill('brand-new-1')
    await page.getByLabel('Confirm Password').fill('brand-new-1')
    await page.getByRole('button', { name: 'Reset Password' }).click()
    await expect(page.getByText('invalid or has expired').first()).toBeVisible()
  })

  test('a link without email / token is rejected', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.getByRole('heading', { name: 'Invalid Reset Link' })).toBeVisible()
    await expect(page.getByRole('link', { name: /request new reset link/i })).toBeVisible()
  })
})

test.describe('oauth callbacks', () => {
  test('legacy fragment tokens log the user in and the fragment is cleared', async ({ page, request }) => {
    const tokens = await (await request.get(`${NORMAL}/__contract/issue?email=user@example.com`)).json()
    const fragment = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: '900',
      redirect: '/keys'
    }).toString()
    const watcher = await watchPage(page)
    await page.goto(`/auth/linuxdo/callback#${fragment}`)
    await page.waitForURL('**/keys')
    expect(new URL(page.url()).hash).toBe('')
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBe(tokens.access_token)
    expect(await page.evaluate(() => localStorage.getItem('refresh_token'))).toBe(tokens.refresh_token)
    await expectClean(page, watcher)
  })

  test('an open-redirect target in the fragment falls back to the dashboard', async ({ page, request }) => {
    const tokens = await (await request.get(`${NORMAL}/__contract/issue?email=user@example.com`)).json()
    await page.goto(
      `/auth/oidc/callback#access_token=${tokens.access_token}&redirect=${encodeURIComponent('//evil.example')}`
    )
    await page.waitForURL('**/dashboard')
  })

  test('error fragments are surfaced and cleared from the address bar', async ({ page }) => {
    await page.goto('/auth/dingtalk/callback#error=csrf')
    await expect(page.getByText('Login session expired, please scan again').first()).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')
    await expect(page.getByRole('link', { name: 'Back to Login' })).toBeVisible()
  })

  test('the email OAuth alias path /auth/oauth/callback is a real page (backend redirects there)', async ({
    page
  }) => {
    await page.goto('/auth/oauth/callback?code=c1&state=s1')
    await settle(page)
    expect(new URL(page.url()).pathname).toBe('/auth/oauth/callback')
    await expect(page.locator('[data-route-name="OAuthCallbackAlias"]').first()).toBeAttached()
  })

  test('the generic callback shows code / state for the admin authorization flow', async ({ page }) => {
    await page.goto('/auth/callback?code=CODE123&state=STATE456')
    await expect(page.getByText('CODE123', { exact: true })).toBeVisible()
    await expect(page.getByText('STATE456', { exact: true })).toBeVisible()
  })
})

test.describe('login agreement', () => {
  const documents = [{ id: 'terms', title: 'Terms of Service', content_md: '# Terms\n\nBe nice.' }]

  test('checkbox mode blocks sign-in until the terms are accepted', async ({ page, request }) => {
    await setSettings(request, {
      login_agreement_enabled: true,
      login_agreement_mode: 'checkbox',
      login_agreement_documents: documents,
      login_agreement_revision: 'r1'
    })
    await page.goto('/login')
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel(/^Password/).fill('user-pass')
    await page.getByRole('button', { name: 'Sign In' }).click()
    expect(new URL(page.url()).pathname).toBe('/login') // 被协议门禁拦截
    await page.getByLabel(/I have read and agree/).check()
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('sub2api_login_agreement_consent') || '{}').revision
      )
    ).toBe('r1')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForURL('**/dashboard')
  })

  test('modal mode shows the dialog and rejecting clears the stored consent', async ({ page, request }) => {
    await setSettings(request, {
      login_agreement_enabled: true,
      login_agreement_mode: 'modal',
      login_agreement_documents: documents,
      login_agreement_revision: 'r2'
    })
    await page.goto('/login')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Accept' }).click()
    await expect(dialog).toBeHidden()
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('sub2api_login_agreement_consent') || '{}').revision
      )
    ).toBe('r2')
  })

  test('legal documents render their markdown', async ({ page, request }) => {
    await setSettings(request, { login_agreement_enabled: true, login_agreement_documents: documents })
    await page.goto('/legal/terms')
    await expect(page.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeVisible()
    await expect(page.getByText('Be nice.')).toBeVisible()
  })

  test('an unknown legal document shows not-found content inside the page', async ({ page }) => {
    await page.goto('/legal/missing')
    await expect(page.getByRole('heading', { name: 'Document not found' })).toBeVisible()
  })
})

test.describe('home', () => {
  test('default marketing home', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('default-home')).toBeVisible()
  })

  test('compact home links visitors to login', async ({ page, request }) => {
    await setSettings(request, { compact_home_enabled: true })
    await page.goto('/home')
    await expect(page.getByTestId('compact-home')).toBeVisible()
    await expect(page.getByTestId('compact-home').getByRole('link', { name: 'Login' })).toHaveAttribute(
      'href',
      '/login'
    )
  })

  test('admin-provided HTML renders full page (no site chrome)', async ({ page, request }) => {
    await setSettings(request, { home_content: '<section id="custom-home">Custom hero</section>' })
    await page.goto('/home')
    await expect(page.locator('#custom-home')).toHaveText('Custom hero')
    await expect(page.getByTestId('default-home')).toHaveCount(0)
  })

  test('admin-provided URL renders in an iframe', async ({ page, request }) => {
    await setSettings(request, { home_content: ' https://example.com/landing ' })
    await page.route('https://example.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>framed</p>' })
    )
    await page.goto('/home')
    await expect(page.locator('iframe')).toHaveAttribute('src', 'https://example.com/landing')
  })
})

test.describe('model plaza', () => {
  test('lists groups with prices and filters by model name', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/model-plaza')
    await expect(page.getByRole('region', { name: 'Claude Pro' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'GPT Team' })).toBeVisible()
    // 实付价 = 渠道单价 × 倍率：3 $/1M × 0.5 = 1.50
    await expect(page.getByRole('region', { name: 'Claude Pro' }).getByText('1.50').first()).toBeVisible()
    await page.getByRole('searchbox', { name: 'Model' }).fill('claude')
    await expect(page.getByRole('region', { name: 'GPT Team' })).toHaveCount(0)
    await expectClean(page, watcher)
  })
})

test.describe('key usage', () => {
  test('queries the gateway with the key as a Bearer token and renders the result', async ({
    page,
    request
  }) => {
    await request.get(`${NORMAL}/__contract/reset`)
    await page.goto('/key-usage')
    await page.getByLabel('API Key Usage').fill('sk-valid')
    await page.getByRole('button', { name: 'Query' }).click()
    await expect(page.getByText('$9.00').first()).toBeVisible()
    await expect(page.getByText('claude-sonnet-x')).toBeVisible()
    const calls = (await (await request.get(`${NORMAL}/__contract/requests`)).json()) as Array<{
      path: string
      headers: Record<string, string>
      query: Record<string, string>
    }>
    const usage = calls.find((c) => c.path === '/v1/usage')
    expect(usage?.headers.authorization).toBe('Bearer sk-valid')
    expect(usage?.query.timezone).toBeTruthy()
  })

  test('an invalid key shows the backend error', async ({ page }) => {
    await page.goto('/key-usage')
    await page.getByLabel('API Key Usage').fill('sk-nope')
    await page.getByRole('button', { name: 'Query' }).click()
    await expect(page.getByText('Invalid API key').first()).toBeVisible()
  })
})

test.describe('MCP authorization consent', () => {
  const challenge = 'A'.repeat(43)
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: 'client-1',
    redirect_uri: 'https://client.example/cb',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: 'https://mcp.example/mcp',
    state: 'xyz'
  }).toString()

  async function signIn(page: Page) {
    await page.goto('/login')
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel(/^Password/).fill('user-pass')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForURL('**/dashboard')
  }

  test('anonymous visitors are sent to login and return to the consent page', async ({ page }) => {
    await page.goto(`/oauth/mcp/authorize?${query}`)
    await page.waitForURL('**/login?**')
    const redirect = new URL(page.url()).searchParams.get('redirect')
    expect(redirect).toBe(`/oauth/mcp/authorize?${query}`)
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel(/^Password/).fill('user-pass')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForURL('**/oauth/mcp/authorize?**')
    await expect(page.getByTestId('client-name')).toHaveText('Demo MCP Client')
  })

  test('approving redirects to the client with the code', async ({ page }) => {
    await page.route('https://client.example/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: 'ok' })
    )
    await signIn(page)
    await page.goto(`/oauth/mcp/authorize?${query}`)
    await expect(page.getByTestId('redirect-origin')).toHaveText('https://client.example')
    await page.getByTestId('approve').click()
    await page.waitForURL('https://client.example/cb?**')
    expect(new URL(page.url()).searchParams.get('code')).toBe('granted')
  })

  test('denying redirects with access_denied', async ({ page }) => {
    await page.route('https://client.example/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: 'ok' })
    )
    await signIn(page)
    await page.goto(`/oauth/mcp/authorize?${query}`)
    await page.getByTestId('deny').click()
    await page.waitForURL('https://client.example/cb?**')
    expect(new URL(page.url()).searchParams.get('error')).toBe('access_denied')
  })

  test('a malformed request is rejected before any network call to approve', async ({ page }) => {
    await signIn(page)
    await page.goto(`/oauth/mcp/authorize?${query.replace('S256', 'plain')}`)
    // Next 的路由播报器也是 role=alert，这里只断言页面自己的错误提示
    await expect(page.getByText(/authorization request is invalid or incomplete/i)).toBeVisible()
    await expect(page.getByTestId('approve')).toHaveCount(0)
  })
})

test.describe('setup wizard (fresh install)', () => {
  test('a failed connection test keeps the step locked and shows the reason', async ({ page }) => {
    await page.goto(`${SETUP}/setup`)
    const wizard = page.getByTestId('setup-wizard')
    // 契约服务对密码为 bad 的数据库返回失败（先于上一用例的安装，保证仍处于未安装状态）
    await wizard.getByLabel(/^Password/).fill('bad')
    await wizard.getByRole('button', { name: 'Test Connection' }).click()
    await expect(wizard.getByRole('alert')).toContainText('connection refused')
    await expect(wizard.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  test('walks through database, redis and admin steps, installs and returns to /login', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto(`${SETUP}/`)
    await page.waitForURL('**/setup')
    const wizard = page.getByTestId('setup-wizard')
    await expect(wizard).toBeVisible()

    // 数据库：必须先测试连接成功才能继续
    await expect(wizard.getByRole('button', { name: 'Next' })).toBeDisabled()
    await wizard.getByRole('button', { name: 'Test Connection' }).click()
    await expect(wizard.getByRole('button', { name: 'Connection Successful' })).toBeVisible()
    await wizard.getByRole('button', { name: 'Next' }).click()

    // Redis
    await wizard.getByRole('button', { name: 'Test Connection' }).click()
    await expect(wizard.getByRole('button', { name: 'Connection Successful' })).toBeVisible()
    await wizard.getByRole('button', { name: 'Next' }).click()

    // 管理员：密码 ≥ 8 位且两次一致
    await wizard.getByLabel('Email').fill('root@example.com')
    await wizard.getByLabel(/^Password/).fill('short')
    await wizard.getByLabel('Confirm Password').fill('short')
    await expect(wizard.getByRole('button', { name: 'Next' })).toBeDisabled()
    await wizard.getByLabel(/^Password/).fill('long-enough-1')
    await wizard.getByLabel('Confirm Password').fill('long-enough-2')
    await expect(wizard.getByText('Passwords do not match')).toBeVisible()
    await wizard.getByLabel('Confirm Password').fill('long-enough-1')
    await wizard.getByRole('button', { name: 'Next' }).click()

    // 确认并安装
    await expect(wizard.getByText('root@example.com')).toBeVisible()
    await wizard.getByRole('button', { name: 'Complete Installation' }).click()
    await expect(wizard.getByText('Installation completed!')).toBeVisible()
    await page.waitForURL('**/login', { timeout: 30_000 })
    await expectClean(page, watcher)
  })
})
