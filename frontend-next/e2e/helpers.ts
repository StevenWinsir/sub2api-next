import { expect, type Page } from '@playwright/test'

export const NORMAL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.E2E_PORT || 4010}`
export const LEGACY = `http://127.0.0.1:${Number(process.env.E2E_PORT || 4010) + 1}`
export const SETUP = `http://127.0.0.1:${Number(process.env.E2E_PORT || 4010) + 2}`

export interface Watcher {
  errors: string[]
  csp: string[]
}

/** 监听控制台错误、未捕获异常与 CSP 违规（"零 CSP 违规、零错误"的验收依据）。 */
export async function watchPage(page: Page): Promise<Watcher> {
  const watcher: Watcher = { errors: [], csp: [] }
  await page.addInitScript(() => {
    ;(window as unknown as { __csp: string[] }).__csp = []
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // 契约模拟服务的假接口对未实现路径返回空数组，浏览器会对 4xx 打印资源加载错误；这里只关注脚本错误与 CSP
    if (/Failed to load resource/.test(text)) return
    watcher.errors.push(text)
  })
  page.on('pageerror', (err) => watcher.errors.push(`pageerror: ${err.message}`))
  return watcher
}

export async function collectCsp(page: Page, watcher: Watcher) {
  const fromPage = await page
    .evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
    .catch(() => [])
  watcher.csp.push(...fromPage)
}

export async function expectClean(page: Page, watcher: Watcher) {
  await collectCsp(page, watcher)
  expect(watcher.csp, 'CSP violations').toEqual([])
  expect(watcher.errors, 'console / page errors').toEqual([])
}

export async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel(/^Password/).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}
