/**
 * 登录态生命周期（对应 App.vue 的 watch 逻辑，交接书 §2.4）：
 *  - 登录后：管理员拉取合规状态；订阅功能开启时预加载订阅并开始轮询；
 *    公告：新登录延迟 3 秒强制拉取、刷新恢复登录时普通拉取、每次路由变化节流拉取、页面重新可见时拉取。
 *  - 退出后清空订阅、公告和合规状态，并移除 visibilitychange 监听。
 * 所有副作用幂等，兼容 StrictMode 下 effect 双次执行。
 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { useAdminComplianceStore } from '@/stores/adminCompliance'
import { useAnnouncementStore } from '@/stores/announcements'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useSubscriptionStore } from '@/stores/subscriptions'
import { FeatureFlags, resolveFeatureFlag } from '@/utils/featureFlags'

export function useSessionLifecycle(enabled: boolean): void {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const subscriptionEnabled = resolveFeatureFlag(settings, FeatureFlags.subscription)
  const previousAuth = React.useRef<boolean | undefined>(undefined)

  // 登录 / 退出
  React.useEffect(() => {
    if (!enabled) return
    const announcements = useAnnouncementStore.getState()
    let delayTimer: ReturnType<typeof setTimeout> | null = null
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && useAuthStore.getState().isAuthenticated) {
        void useAnnouncementStore.getState().fetchAnnouncements()
      }
    }

    if (isAuthenticated) {
      if (isAdmin) {
        useAdminComplianceStore
          .getState()
          .fetchStatus()
          .catch((error) => console.error('Failed to fetch admin compliance status:', error))
      }
      if (previousAuth.current === false) {
        // 新登录：延迟 3 秒后强制拉取
        delayTimer = setTimeout(() => void announcements.fetchAnnouncements(true), 3000)
      } else {
        // 刷新页面恢复登录
        void announcements.fetchAnnouncements()
      }
      document.addEventListener('visibilitychange', onVisibility)
    } else if (previousAuth.current === true) {
      useSubscriptionStore.getState().clear()
      announcements.reset()
      useAdminComplianceStore.getState().reset()
    }
    previousAuth.current = isAuthenticated

    return () => {
      if (delayTimer) clearTimeout(delayTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, isAuthenticated, isAdmin])

  // 订阅功能开关（opt-out）：关闭后不再预加载 / 轮询订阅接口；开关在登录后才到达时补启动，反向则清空
  React.useEffect(() => {
    if (!enabled || !isAuthenticated) return
    const store = useSubscriptionStore.getState()
    if (subscriptionEnabled) {
      store
        .fetchActiveSubscriptions()
        .catch((error) => console.error('Failed to preload subscriptions:', error))
      store.startPolling()
    } else {
      store.clear()
    }
    return () => useSubscriptionStore.getState().stopPolling()
  }, [enabled, isAuthenticated, subscriptionEnabled])

  // 路由变化时（节流由 store 完成）拉取公告
  React.useEffect(() => {
    if (!enabled) return
    const onRoute = () => {
      if (useAuthStore.getState().isAuthenticated) void useAnnouncementStore.getState().fetchAnnouncements()
    }
    router.events.on('routeChangeComplete', onRoute)
    return () => router.events.off('routeChangeComplete', onRoute)
  }, [enabled, router.events])
}
