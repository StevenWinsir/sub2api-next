import * as React from 'react'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useAdminSettingsStore } from '@/stores/adminSettings'
import type { NavContext } from './navigation'

/** 订阅 store，组装菜单构建上下文。 */
export function useNavContext(): NavContext {
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const isSimpleMode = useAuthStore((s) => s.isSimpleMode)
  const opsMonitoringEnabled = useAdminSettingsStore((s) => s.opsMonitoringEnabled)
  const adminPaymentEnabled = useAdminSettingsStore((s) => s.paymentEnabled)
  const adminCustomMenuItems = useAdminSettingsStore((s) => s.customMenuItems)

  return React.useMemo(
    () => ({
      isAdmin,
      isSimpleMode,
      settings,
      opsMonitoringEnabled,
      adminPaymentEnabled,
      customMenuItems: settings?.custom_menu_items ?? [],
      adminCustomMenuItems
    }),
    [isAdmin, isSimpleMode, settings, opsMonitoringEnabled, adminPaymentEnabled, adminCustomMenuItems]
  )
}
