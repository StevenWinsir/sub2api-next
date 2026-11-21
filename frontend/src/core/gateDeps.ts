import { getSetupStatus } from '@/api/setup'
import { useAdminComplianceStore } from '@/stores/adminCompliance'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { GateDeps } from './gate'

/** 默认门禁依赖：直接读取 Zustand store（每次调用读取最新状态）。 */
export const defaultGateDeps: GateDeps = {
  auth: () => {
    const s = useAuthStore.getState()
    return {
      isAuthenticated: s.isAuthenticated,
      isAdmin: s.isAdmin,
      isSimpleMode: s.isSimpleMode,
      hasPendingAuthSession: s.hasPendingAuthSession
    }
  },
  app: () => {
    const s = useAppStore.getState()
    return {
      publicSettingsLoaded: s.publicSettingsLoaded,
      cachedPublicSettings: s.cachedPublicSettings,
      backendModeEnabled: s.backendModeEnabled
    }
  },
  fetchPublicSettings: () => useAppStore.getState().fetchPublicSettings(),
  getSetupStatus: () => getSetupStatus(),
  compliance: {
    isInitialized: () => useAdminComplianceStore.getState().initialized,
    fetchStatus: () => useAdminComplianceStore.getState().fetchStatus(),
    requireAcknowledgement: (metadata) => useAdminComplianceStore.getState().requireAcknowledgement(metadata)
  }
}
