import { expect, test } from '@playwright/test'
import { expectClean, loginViaUi, watchPage } from './helpers'

/**
 * R3：用户控制台与商业化支付链路（契约模拟服务环境，后端默认 CSP 下运行）。
 * 真实支付渠道（Stripe 测试卡 / 3DS、Airwallex demo、扫码沙箱、微信 / 支付宝内置浏览器）见 handoff 第 3 轮的手工验收清单。
 */
test.describe('user console (normal mode)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, 'user@example.com', 'user-pass')
    await page.waitForURL('**/dashboard')
  })

  test('dashboard renders stats and quick actions without console errors', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('Quick Actions')).toBeVisible()
    await expect(page.getByRole('link', { name: /Redeem Code/ })).toBeVisible()
    await expectClean(page, watcher)
  })

  test('API key lifecycle: create → disable → enable → delete', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/keys')
    await expect(page.getByText('seed-key')).toBeVisible()

    await page.locator('[data-tour="keys-create-btn"]').click()
    await page.getByLabel(/^Name/).fill('e2e-key')
    await page.locator('[data-tour="key-form-group"]').click()
    await page.getByRole('option', { name: /Claude Pro/ }).click()
    await page.locator('[data-tour="key-form-submit"]').click()
    await expect(page.getByText('e2e-key')).toBeVisible()

    const row = page.getByRole('row', { name: /e2e-key/ })
    await row.getByRole('button', { name: 'Disable' }).click()
    await expect(row.getByText('Inactive')).toBeVisible()
    await row.getByRole('button', { name: 'Enable' }).click()
    await expect(row.getByText('Active')).toBeVisible()

    await row.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('e2e-key')).toHaveCount(0)
    await expectClean(page, watcher)
  })

  test('redeem: invalid code shows an error, valid code succeeds once and is recorded', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/redeem')
    await page.getByLabel('Redeem Code').fill('BAD')
    await page.getByRole('button', { name: /Redeem/ }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid or used code' })).toBeVisible()

    await page.getByLabel('Redeem Code').fill('GOOD-CODE')
    await page.getByRole('button', { name: /Redeem/ }).click()
    await expect(page.getByText('New Balance')).toBeVisible()
    await expect(page.getByText('+$5.00')).toBeVisible()
    await expectClean(page, watcher)
  })

  test('recharge via QR: create order → status polling → result page → orders list', async ({ page }) => {
    test.setTimeout(60_000)
    const watcher = await watchPage(page)
    await page.goto('/purchase')
    await page.getByRole('button', { name: '10', exact: true }).click()
    await page.getByRole('radio', { name: /Alipay/i }).click()
    await page.getByRole('button', { name: /Confirm Payment/ }).click()

    // 支付进行中：二维码 + 倒计时 + 取消按钮
    await expect(page.getByRole('timer')).toBeVisible()
    await expect(page.getByRole('button', { name: /Cancel Order/ })).toBeVisible()
    // 恢复快照已写入（沿用原键）
    const snapshot = await page.evaluate(() => window.localStorage.getItem('payment.recovery.current'))
    expect(snapshot).toContain('"orderId":1')

    // 契约服务在第 2 次轮询时把订单置为 COMPLETED（轮询间隔 3 秒）→ 自动进入结果页
    await page.waitForURL('**/payment/result?**', { timeout: 30_000 })
    await expect(page.getByRole('status').filter({ hasText: 'Payment Successful' })).toBeVisible()
    expect(await page.evaluate(() => window.localStorage.getItem('payment.recovery.current'))).toBeNull()

    await page.getByRole('button', { name: /View Orders/ }).click()
    await page.waitForURL('**/orders')
    await expect(page.getByText('OT-1')).toBeVisible()
    await expectClean(page, watcher)
  })

  test('closing the page mid-payment resumes the QR panel from the recovery snapshot', async ({ page }) => {
    await page.goto('/purchase')
    await page.getByRole('button', { name: '20', exact: true }).click()
    await page.getByRole('button', { name: /Confirm Payment/ }).click()
    await expect(page.getByRole('timer')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('timer')).toBeVisible()
    await expect(page.getByRole('button', { name: /Cancel Order/ })).toBeVisible()
  })

  test('payment landing pages fail closed without a recovery snapshot', async ({ page }) => {
    await page.goto('/payment/stripe?order_id=99')
    await expect(page.getByText('Missing order ID or client secret')).toBeVisible()
    await page.goto('/payment/airwallex?order_id=99')
    await expect(page.getByText('Missing Airwallex payment parameters')).toBeVisible()
  })

  test('wechat payment callback validates the redirect and carries the resume token', async ({ page }) => {
    await page.goto(
      '/auth/wechat/payment/callback?redirect=https://evil.example.com#wechat_resume_token=tok1'
    )
    await page.waitForURL('**/purchase?**')
    const url = new URL(page.url())
    expect(url.origin).toBe(new URL(page.url()).origin)
    expect(url.pathname).toBe('/purchase')
  })

  test('profile page loads all security cards', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/profile')
    await expect(page.getByTestId('profile-shell')).toBeVisible()
    await expect(page.getByText('Change Password').first()).toBeVisible()
    await expectClean(page, watcher)
  })
})
