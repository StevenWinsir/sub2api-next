import { expect, test } from '@playwright/test'
import { expectClean, loginViaUi, watchPage } from './helpers'

/**
 * R4：管理后台核心资源（契约模拟服务环境，后端默认 CSP 下运行）。
 * 覆盖：用户 CRUD + Step-up 重放 / 取消静默、423 合规弹窗、代理批量导入、概览渲染。
 * 账号测试 SSE、各平台 OAuth、1 万条数据性能、admin access key 受限权限等需真实后端，见 README 的手工验收清单。
 */
test.describe('admin console (normal mode)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, 'admin@example.com', 'admin-pass')
    await page.waitForURL(/\/(dashboard|admin)/)
  })

  test('dashboard renders KPIs without CSP violations or console errors', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/admin/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('1,234').or(page.getByText('1.2K'))).toBeVisible()
    await expectClean(page, watcher)
  })

  test('users: search filters the table', async ({ page }) => {
    await page.goto('/admin/users')
    await expect(page.getByText('second@example.com')).toBeVisible()
    await page.getByRole('searchbox').first().fill('vip-none')
    await expect(page.getByText('second@example.com')).toHaveCount(0)
  })

  test('users: create requires step-up, replays after TOTP, and cancel is silent', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/admin/users')
    await page.getByRole('button', { name: /Create User/i }).click()
    await page.getByLabel(/^Email/).fill('new@example.com')
    await page
      .getByLabel(/^Password/)
      .first()
      .fill('S3cret-pass!')

    // 第一次提交：后端要求 Step-up → 弹出 TOTP；取消时静默（不弹错误 Toast）
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Create$/ })
      .click()
    const totp = page.getByRole('dialog', { name: 'Two-Factor Verification Required' })
    await expect(totp).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(totp).toHaveCount(0)
    await expect(page.getByText('Failed to create user')).toHaveCount(0)

    // 第二次提交：输入正确验证码后自动重放原操作
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Create$/ })
      .click()
    await page.getByRole('textbox', { name: 'Two-Factor Verification Required' }).fill('123456')
    await expect(page.getByText('new@example.com')).toBeVisible()
    await expectClean(page, watcher)
  })

  test('423 compliance: any admin call raises the blocking dialog until acknowledged', async ({
    page,
    request,
    baseURL
  }) => {
    await request.get(`${baseURL}/api/v1/admin/test/compliance-on`)
    await page.goto('/admin/users')
    const dialog = page.getByRole('dialog', { name: /Compliance Acknowledgment/i })
    await expect(dialog).toBeVisible()
    // 不能通过 Esc / 点击外部绕过
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    const phrase =
      'I have read, understood, and agree to the Sub2API Deployment and Operation Compliance Commitment'
    await dialog.getByLabel(/Type the following confirmation phrase/i).fill(phrase)
    await dialog.getByRole('button', { name: /Acknowledge and Continue/i }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('proxies: batch import parses lines and shows counts', async ({ page }) => {
    await page.goto('/admin/proxies')
    await expect(page.getByText('seed-proxy')).toBeVisible()
    await page.getByRole('button', { name: /Batch Add|Quick Add/i }).click()
    await page
      .getByRole('textbox')
      .last()
      .fill('socks5://u:p@10.0.0.9:1080\nnot-a-proxy\nsocks5://u:p@10.0.0.9:1080')
    await expect(page.getByText(/1 valid|Valid 1/i)).toBeVisible()
    await expect(page.getByText(/1 invalid|Invalid 1/i)).toBeVisible()
    await expect(page.getByText(/1 duplicate|Duplicate 1/i)).toBeVisible()
  })
})
