import { create } from 'zustand'
// 管理端 API 体量很大（35 个模块）：只在管理员会话真正拉取设置时才动态加载，避免进入公共页的首屏包
import type { CustomMenuItem } from '@/types'
import { STORAGE_KEYS } from '@/constants/storage'
import { readCachedBool, readCachedString, writeCachedBool, writeStorage } from './storage'

interface AdminSettingsState {
  loaded: boolean
  loading: boolean
  opsMonitoringEnabled: boolean
  opsRealtimeMonitoringEnabled: boolean
  opsQueryModeDefault: string
  paymentEnabled: boolean
  customMenuItems: CustomMenuItem[]
}

interface AdminSettingsActions {
  fetch: (force?: boolean) => Promise<void>
  setOpsMonitoringEnabledLocal: (value: boolean) => void
  setOpsRealtimeMonitoringEnabledLocal: (value: boolean) => void
  setPaymentEnabledLocal: (value: boolean) => void
  setOpsQueryModeDefaultLocal: (value: string) => void
}

export type AdminSettingsStore = AdminSettingsState & AdminSettingsActions

/**
 * 注意：缓存值在客户端首次读取。为保证与构建期预渲染的水合一致，
 * 初始状态使用默认值，真实缓存由 hydrateAdminSettingsCache() 在客户端 effect 中应用。
 */
export const useAdminSettingsStore = create<AdminSettingsStore>((set, get) => ({
  loaded: false,
  loading: false,
  opsMonitoringEnabled: true,
  opsRealtimeMonitoringEnabled: true,
  opsQueryModeDefault: 'auto',
  paymentEnabled: false,
  customMenuItems: [],

  async fetch(force = false) {
    if (get().loaded && !force) return
    if (get().loading) return
    set({ loading: true })
    try {
      const { adminAPI } = await import('@/api/admin')
      const [settings, paymentConfigResp] = await Promise.all([
        adminAPI.settings.getSettings(),
        adminAPI.payment.getConfig()
      ])
      const opsMonitoringEnabled = settings.ops_monitoring_enabled ?? true
      writeCachedBool(STORAGE_KEYS.opsMonitoringEnabledCached, opsMonitoringEnabled)
      const opsRealtimeMonitoringEnabled = settings.ops_realtime_monitoring_enabled ?? true
      writeCachedBool(STORAGE_KEYS.opsRealtimeMonitoringEnabledCached, opsRealtimeMonitoringEnabled)
      const opsQueryModeDefault = settings.ops_query_mode_default || 'auto'
      writeStorage(STORAGE_KEYS.opsQueryModeDefaultCached, opsQueryModeDefault)
      const paymentEnabled = paymentConfigResp.data?.enabled ?? false
      writeCachedBool(STORAGE_KEYS.paymentEnabledCached, paymentEnabled)
      set({
        opsMonitoringEnabled,
        opsRealtimeMonitoringEnabled,
        opsQueryModeDefault,
        paymentEnabled,
        customMenuItems: Array.isArray(settings.custom_menu_items) ? settings.custom_menu_items : [],
        loaded: true
      })
    } catch (err) {
      console.error('[adminSettings] Failed to fetch settings:', err)
    } finally {
      set({ loading: false })
    }
  },

  setOpsMonitoringEnabledLocal(value) {
    writeCachedBool(STORAGE_KEYS.opsMonitoringEnabledCached, value)
    set({ opsMonitoringEnabled: value, loaded: true })
  },
  setOpsRealtimeMonitoringEnabledLocal(value) {
    writeCachedBool(STORAGE_KEYS.opsRealtimeMonitoringEnabledCached, value)
    set({ opsRealtimeMonitoringEnabled: value, loaded: true })
  },
  setPaymentEnabledLocal(value) {
    writeCachedBool(STORAGE_KEYS.paymentEnabledCached, value)
    set({ paymentEnabled: value, loaded: true })
  },
  setOpsQueryModeDefaultLocal(value) {
    const next = value || 'auto'
    writeStorage(STORAGE_KEYS.opsQueryModeDefaultCached, next)
    set({ opsQueryModeDefault: next, loaded: true })
  }
}))

/** 客户端启动时应用 localStorage 中的缓存值（对应 Pinia 版在 store 创建时同步读取）。 */
export function hydrateAdminSettingsCache(): void {
  useAdminSettingsStore.setState({
    opsMonitoringEnabled: readCachedBool(STORAGE_KEYS.opsMonitoringEnabledCached, true),
    opsRealtimeMonitoringEnabled: readCachedBool(STORAGE_KEYS.opsRealtimeMonitoringEnabledCached, true),
    opsQueryModeDefault: readCachedString(STORAGE_KEYS.opsQueryModeDefaultCached, 'auto'),
    paymentEnabled: readCachedBool(STORAGE_KEYS.paymentEnabledCached, false)
  })
}
