/**
 * Application State Store（对应 Pinia app store）
 * 侧栏、Toast（由 sonner 承载，保留 showSuccess/showError 等同名 API）、
 * 公开设置加载（去重、强制刷新、注入初始化）、版本信息、后端模式。
 */
import { create } from 'zustand'
import { toast as sonner } from 'sonner'
import type { ToastType, PublicSettings } from '@/types'
import { t } from '@/i18n'
import { checkUpdates as checkUpdatesAPI, type VersionInfo, type ReleaseInfo } from '@/api/admin/system'
import { getPublicSettings as fetchPublicSettingsAPI } from '@/api/auth'
import { STORAGE_KEYS } from '@/constants/storage'
import { readStorage, writeStorage } from './storage'

interface AppState {
  sidebarCollapsed: boolean
  mobileOpen: boolean
  sidebarScrollTop: number
  loading: boolean
  loadingCount: number

  publicSettingsLoaded: boolean
  publicSettingsLoading: boolean
  siteName: string
  siteLogo: string
  siteVersion: string
  contactInfo: string
  apiBaseUrl: string
  docUrl: string
  cachedPublicSettings: PublicSettings | null

  versionLoaded: boolean
  versionLoading: boolean
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  buildType: string
  releaseInfo: ReleaseInfo | null

  backendModeEnabled: boolean
}

interface AppActions {
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleMobileSidebar: () => void
  setMobileOpen: (open: boolean) => void
  setSidebarScrollTop: (top: number) => void
  setLoading: (isLoading: boolean) => void
  showToast: (type: ToastType, message: string, duration?: number) => string
  showSuccess: (message: string, duration?: number) => string
  showError: (message: string, duration?: number) => string
  showInfo: (message: string, duration?: number) => string
  showWarning: (message: string, duration?: number) => string
  hideToast: (id: string) => void
  clearAllToasts: () => void
  withLoading: <T>(operation: () => Promise<T>) => Promise<T>
  withLoadingAndError: <T>(operation: () => Promise<T>, errorMessage?: string) => Promise<T | null>
  reset: () => void
  fetchVersion: (force?: boolean) => Promise<VersionInfo | null>
  clearVersionCache: () => void
  fetchPublicSettings: (force?: boolean) => Promise<PublicSettings | null>
  clearPublicSettingsCache: () => void
  initFromInjectedConfig: () => boolean
}

export type AppStore = AppState & AppActions

let publicSettingsRequest: Promise<PublicSettings | null> | null = null

function fallbackPublicSettings(s: AppState): PublicSettings {
  return {
    registration_enabled: false,
    email_verify_enabled: false,
    force_email_on_third_party_signup: false,
    registration_email_suffix_whitelist: [],
    promo_code_enabled: true,
    password_reset_enabled: false,
    invitation_code_enabled: false,
    turnstile_enabled: false,
    turnstile_site_key: '',
    aliyun_captcha_enabled: false,
    aliyun_captcha_scene_id: '',
    aliyun_captcha_prefix: '',
    aliyun_captcha_region: 'cn',
    site_name: s.siteName,
    site_logo: s.siteLogo,
    site_subtitle: '',
    api_base_url: s.apiBaseUrl,
    contact_info: s.contactInfo,
    doc_url: s.docUrl,
    home_content: '',
    compact_home_enabled: false,
    hide_ccs_import_button: false,
    payment_enabled: false,
    table_default_page_size: 20,
    table_page_size_options: [10, 20, 50, 100],
    custom_menu_items: [],
    custom_endpoints: [],
    linuxdo_oauth_enabled: false,
    wechat_oauth_enabled: false,
    wechat_oauth_open_enabled: false,
    wechat_oauth_mp_enabled: false,
    wechat_oauth_mobile_enabled: false,
    oidc_oauth_enabled: false,
    oidc_oauth_provider_name: 'OIDC',
    github_oauth_enabled: false,
    google_oauth_enabled: false,
    backend_mode_enabled: false,
    passkey_enabled: false,
    version: s.siteVersion,
    balance_low_notify_enabled: false,
    account_quota_notify_enabled: false,
    balance_low_notify_threshold: 0,
    channel_monitor_enabled: true,
    channel_monitor_default_interval_seconds: 60,
    available_channels_enabled: false,
    subscription_enabled: true,
    payment_balance_disabled: false,
    model_plaza_enabled: false,
    model_plaza_require_auth: false,
    plugin_management_enabled: false,
    risk_control_enabled: false,
    service_quota_enabled: false,
    affiliate_enabled: false,
    allow_user_view_error_requests: false,
    mcp_enabled: false
  } as PublicSettings
}

export const useAppStore = create<AppStore>((set, get) => {
  function applySettings(config: PublicSettings): void {
    if (typeof window !== 'undefined') {
      window.__APP_CONFIG__ = { ...config }
    }
    set({
      cachedPublicSettings: config,
      siteName: config.site_name || 'Sub2API',
      siteLogo: config.site_logo || '',
      siteVersion: config.version || '',
      contactInfo: config.contact_info || '',
      apiBaseUrl: config.api_base_url || '',
      docUrl: config.doc_url || '',
      backendModeEnabled: config.backend_mode_enabled ?? false,
      publicSettingsLoaded: true
    })
  }

  return {
    sidebarCollapsed: readStorage(STORAGE_KEYS.sidebarCollapsed) === 'true',
    mobileOpen: false,
    sidebarScrollTop: 0,
    loading: false,
    loadingCount: 0,

    publicSettingsLoaded: false,
    publicSettingsLoading: false,
    siteName: 'Sub2API',
    siteLogo: '',
    siteVersion: '',
    contactInfo: '',
    apiBaseUrl: '',
    docUrl: '',
    cachedPublicSettings: null,

    versionLoaded: false,
    versionLoading: false,
    currentVersion: '',
    latestVersion: '',
    hasUpdate: false,
    buildType: 'source',
    releaseInfo: null,

    backendModeEnabled: false,

    toggleSidebar() {
      get().setSidebarCollapsed(!get().sidebarCollapsed)
    },
    setSidebarCollapsed(collapsed) {
      set({ sidebarCollapsed: collapsed })
      writeStorage(STORAGE_KEYS.sidebarCollapsed, collapsed ? 'true' : 'false')
    },
    toggleMobileSidebar() {
      set({ mobileOpen: !get().mobileOpen })
    },
    setMobileOpen(open) {
      set({ mobileOpen: open })
    },
    setSidebarScrollTop(top) {
      set({ sidebarScrollTop: top })
    },
    setLoading(isLoading) {
      const count = isLoading ? get().loadingCount + 1 : Math.max(0, get().loadingCount - 1)
      set({ loadingCount: count, loading: count > 0 })
    },

    showToast(type, message, duration) {
      const options = { duration: duration ?? Infinity }
      const id =
        type === 'success'
          ? sonner.success(message, options)
          : type === 'error'
            ? sonner.error(message, options)
            : type === 'warning'
              ? sonner.warning(message, options)
              : sonner.info(message, options)
      return String(id)
    },
    showSuccess(message, duration = 3000) {
      return get().showToast('success', message, duration)
    },
    showError(message, duration = 5000) {
      return get().showToast('error', message, duration)
    },
    showInfo(message, duration = 3000) {
      return get().showToast('info', message, duration)
    },
    showWarning(message, duration = 4000) {
      return get().showToast('warning', message, duration)
    },
    hideToast(id) {
      sonner.dismiss(id)
    },
    clearAllToasts() {
      sonner.dismiss()
    },

    async withLoading(operation) {
      get().setLoading(true)
      try {
        return await operation()
      } finally {
        get().setLoading(false)
      }
    },
    async withLoadingAndError(operation, errorMessage) {
      get().setLoading(true)
      try {
        return await operation()
      } catch (error) {
        get().showError(errorMessage || (error as { message?: string }).message || t('common.unknownError'))
        return null
      } finally {
        get().setLoading(false)
      }
    },

    reset() {
      set({ sidebarCollapsed: false, loading: false, loadingCount: 0 })
      sonner.dismiss()
    },

    async fetchVersion(force = false) {
      const s = get()
      if (s.versionLoaded && !force) {
        return {
          current_version: s.currentVersion,
          latest_version: s.latestVersion,
          has_update: s.hasUpdate,
          build_type: s.buildType,
          release_info: s.releaseInfo || undefined,
          cached: true
        }
      }
      if (s.versionLoading) return null
      set({ versionLoading: true })
      try {
        const data = await checkUpdatesAPI(force)
        set({
          currentVersion: data.current_version,
          latestVersion: data.latest_version,
          hasUpdate: data.has_update,
          buildType: data.build_type || 'source',
          releaseInfo: data.release_info || null,
          versionLoaded: true
        })
        return data
      } catch (error) {
        console.error('Failed to fetch version:', error)
        return null
      } finally {
        set({ versionLoading: false })
      }
    },
    clearVersionCache() {
      set({ versionLoaded: false, hasUpdate: false })
    },

    fetchPublicSettings(force = false) {
      // 进行中的请求优先，保证所有调用方观察到同一个结果
      if (publicSettingsRequest) return publicSettingsRequest

      // 后端注入的配置（消除闪烁）
      if (!get().publicSettingsLoaded && !force && typeof window !== 'undefined' && window.__APP_CONFIG__) {
        applySettings(window.__APP_CONFIG__)
        return Promise.resolve(window.__APP_CONFIG__)
      }

      if (get().publicSettingsLoaded && !force) {
        const cached = get().cachedPublicSettings
        return Promise.resolve(cached ? { ...cached } : fallbackPublicSettings(get()))
      }

      set({ publicSettingsLoading: true })
      let apiRequest: Promise<PublicSettings>
      try {
        apiRequest = fetchPublicSettingsAPI()
      } catch (error) {
        console.error('Failed to fetch public settings:', error)
        set({ publicSettingsLoading: false })
        return Promise.resolve(null)
      }

      const request: Promise<PublicSettings | null> = apiRequest
        .then((data) => {
          applySettings(data)
          return data
        })
        .catch((error) => {
          console.error('Failed to fetch public settings:', error)
          return null
        })
        .finally(() => {
          if (publicSettingsRequest === request) {
            publicSettingsRequest = null
            set({ publicSettingsLoading: false })
          }
        })
      publicSettingsRequest = request
      return request
    },
    clearPublicSettingsCache() {
      set({ publicSettingsLoaded: false, cachedPublicSettings: null, backendModeEnabled: false })
    },
    initFromInjectedConfig() {
      if (typeof window !== 'undefined' && window.__APP_CONFIG__) {
        applySettings(window.__APP_CONFIG__)
        return true
      }
      return false
    }
  }
})
