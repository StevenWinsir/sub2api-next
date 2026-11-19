import { useAdminComplianceStore } from '@/stores/adminCompliance'
import { useAnnouncementStore } from '@/stores/announcements'
import { useSubscriptionStore } from '@/stores/subscriptions'

/** 退出登录后清空订阅、公告和合规状态，并停止订阅轮询（§2.4）。 */
export function resetSessionStores(): void {
  useSubscriptionStore.getState().clear()
  useAnnouncementStore.getState().reset()
  useAdminComplianceStore.getState().reset()
}
