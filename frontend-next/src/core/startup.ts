/**
 * 应用启动序列（交接书 §5.2 第 3 步）。模块级单例 Promise，保证 StrictMode 双执行时只运行一次。
 *   a. 从 __APP_CONFIG__ 同步初始化 app store；
 *   b. 设置标题和 favicon；
 *   c. 初始化 i18n（加载当前语言包，设置 <html lang>）；
 *   d. 从 localStorage 恢复登录态（启动自动刷新计时器）。
 */
import { z } from 'zod'
import { initI18n } from '@/i18n'
import { hydrateAdminSettingsCache } from '@/stores/adminSettings'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { updateFavicon } from '@/utils/branding'

let startup: Promise<void> | null = null

export function runStartup(): Promise<void> {
  if (startup) return startup
  // 后端 CSP 禁止 unsafe-eval：关闭 zod 的 JIT（否则其 `Function('')` 探测会产生 CSP 违规报告）
  z.config({ jitless: true })
  startup = (async () => {
    hydrateAdminSettingsCache()
    const app = useAppStore.getState()
    app.initFromInjectedConfig()
    const { siteName, siteLogo } = useAppStore.getState()
    if (siteName && siteName !== 'Sub2API') document.title = `${siteName} - AI API Gateway`
    updateFavicon(siteLogo)
    await initI18n()
    useAuthStore.getState().checkAuth()
  })()
  return startup
}

/** 仅供测试重置。 */
export function __resetStartupForTests(): void {
  startup = null
}
