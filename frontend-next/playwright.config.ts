import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 4010)
const MODES = ['normal', 'legacy', 'setup'] as const

/**
 * E2E 在"真相环境"（后端默认 CSP + SPA 回退 + index.html 注入）下运行。
 * 本配置默认对接 e2e/contract-server.mjs（后端行为的模拟）；
 * 设置 E2E_BASE_URL 可改为指向真实的后端二进制（`-tags embed` 构建）。
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.E2E_CHANNEL || undefined } }
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : MODES.map((mode, i) => ({
        command: `MODE=${mode} PORT=${PORT + i} node e2e/contract-server.mjs`,
        url: `http://127.0.0.1:${PORT + i}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
      }))
})
