import { expect, test } from '@playwright/test'
import { expectClean, loginViaUi, watchPage } from './helpers'

/**
 * R5：管理后台（二）与上线相关能力（契约模拟服务环境，后端默认 CSP 下运行）。
 * 覆盖：设置页读取 / 编辑 / 合并保存负载、审计日志、插件页（iframe 沙箱）、版本徽章、
 * Service Worker（仅缓存 /_next/static/、HTML 永不缓存、紧急注销）。
 */
test.describe('admin system pages (normal mode)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, 'admin@example.com', 'admin-pass')
    await page.waitForURL(/\/(dashboard|admin)/)
  })

  test('settings: edit a field, save, and the merged payload reaches the backend', async ({
    page,
    request,
    baseURL
  }) => {
    const watcher = await watchPage(page)
    await page.goto('/admin/settings')
    await expect(page.getByRole('tab', { name: /General/i })).toBeVisible()
    const name = page.getByLabel('Site Name')
    await name.fill('Acme Gateway')
    await page.getByRole('button', { name: /^Save/ }).click()
    await expect(page.getByText(/saved/i).first()).toBeVisible()
    const body = await (await request.get(`${baseURL}/api/v1/admin/test/last-settings-payload`)).json()
    const payload = body.data ?? body
    expect(payload.site_name).toBe('Acme Gateway')
    // 空白密钥不会被提交（后端据此保留已存值）
    expect(payload.smtp_password).toBeUndefined()
    expect(payload.table_page_size_options).toEqual([10, 20, 50, 100])
    await expectClean(page, watcher)
  })

  test('settings: tabs are keyboard navigable', async ({ page }) => {
    await page.goto('/admin/settings')
    const general = page.getByRole('tab', { name: /General/i })
    await general.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { selected: true })).not.toHaveText(/General/i)
    await page.keyboard.press('End')
    await expect(page.getByRole('tabpanel')).toBeVisible()
  })

  test('settings: invalid page size blocks the save with an inline error toast', async ({
    page,
    request,
    baseURL
  }) => {
    await page.goto('/admin/settings')
    await page.getByLabel('Default Rows Per Page').fill('3')
    await request.get(`${baseURL}/api/v1/admin/test/last-settings-payload`)
    await page.getByRole('button', { name: /^Save/ }).click()
    await expect(page.getByText(/must be between/i).first()).toBeVisible()
  })

  test('audit logs list renders and opens a detail dialog', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/admin/audit-logs')
    await expect(page.getByText('settings.update.0')).toBeVisible()
    await page
      .getByRole('button', { name: /Detail/i })
      .first()
      .click()
    await expect(page.getByRole('dialog')).toContainText('/api/v1/admin/settings')
    await expectClean(page, watcher)
  })

  test('risk control: overview renders and the settings dialog opens with all tabs', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/admin/risk-control')
    await page.getByRole('button', { name: /Moderation Settings/i }).click()
    const dialog = page.getByRole('dialog')
    for (const tab of [
      'Basic',
      'Scope',
      'Runtime',
      'Hit Notice',
      'Risk Thresholds',
      'Keyword Block',
      'Retention'
    ]) {
      await expect(dialog.getByRole('tab', { name: tab })).toBeVisible()
    }
    await expectClean(page, watcher)
  })

  test('prompt audit: switching to configuration shows the pool and policy, then saves', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/admin/prompt-audit')
    await page.getByRole('tab', { name: 'Configuration' }).click()
    await expect(page.getByText('Audit pool')).toBeVisible()
    await page.getByLabel('Enable prompt audit').click()
    await page.getByRole('button', { name: /^Save$/ }).click()
    await expect(page.getByText(/configuration saved/i).first()).toBeVisible()
    await expectClean(page, watcher)
  })

  test('ops: renders the monitoring header without CSP violations', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/admin/ops')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: /Manage Alert Rules/i })).toBeVisible()
    await expectClean(page, watcher)
  })

  test('plugins page lists installed plugins', async ({ page }) => {
    const watcher = await watchPage(page)
    await page.goto('/admin/plugins')
    await expect(page.getByText('Demo Transport')).toBeVisible()
    await expectClean(page, watcher)
  })

  test('version badge shows the current version and flags an available update', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page.getByRole('button', { name: /v0\.2\.23|New version|available/i }).first()).toBeVisible()
  })
})

test.describe('service worker', () => {
  test('caches /_next/static/ only, never HTML or API; ?sw=off unregisters and clears', async ({
    page,
    context
  }) => {
    // 先走一次登录页，让 SW 在 load 后注册
    await page.goto('/login')
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()))
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await page.waitForLoadState('networkidle')

    const cached = await page.evaluate(async () => {
      const keys = await caches.keys()
      const urls: string[] = []
      for (const k of keys) {
        const c = await caches.open(k)
        for (const r of await c.keys()) urls.push(new URL(r.url).pathname)
      }
      return { keys, urls }
    })
    expect(cached.keys.some((k) => k.startsWith('sub2api-static-'))).toBe(true)
    expect(cached.urls.length).toBeGreaterThan(0)
    // 只含 /_next/static/，没有 HTML 与 API
    expect(cached.urls.every((u) => u.startsWith('/_next/static/'))).toBe(true)

    // 紧急注销
    await page.goto('/login?sw=off')
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 0)
    const left = await page.evaluate(async () =>
      (await caches.keys()).filter((k) => k.startsWith('sub2api-static-'))
    )
    expect(left).toEqual([])
    await context.clearCookies()
  })
})
