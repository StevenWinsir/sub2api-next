/**
 * 浏览器存储键（附录 B）——必须与 Vue 版 100% 一致，保证升级后用户不掉登录、不丢偏好。
 * 新增键统一使用 `sub2api:` 前缀，且不得与下列旧键冲突。
 */
export const STORAGE_KEYS = {
  // 鉴权
  authToken: 'auth_token',
  refreshToken: 'refresh_token',
  authUser: 'auth_user',
  tokenExpiresAt: 'token_expires_at',
  pendingAuthSession: 'pending_auth_session',
  authExpired: 'auth_expired', // sessionStorage
  registerData: 'register_data',
  emailOauthPendingProvider: 'email_oauth_pending_provider',
  oauthAffCode: 'oauth_aff_code',
  affiliateReferralCode: 'affiliate_referral_code',
  loginAgreementConsent: 'sub2api_login_agreement_consent',
  // 偏好
  theme: 'theme',
  locale: 'sub2api_locale',
  tablePageSize: 'table-page-size',
  tablePageSizeSource: 'table-page-size-source',
  // 表格与筛选
  accountHiddenColumns: 'account-hidden-columns',
  accountHiddenColumnsVersion: 'account-hidden-columns-version',
  accountFilterValues: 'account-filter-values',
  accountTableSort: 'account-table-sort',
  accountAutoRefresh: 'account-auto-refresh',
  apiKeyHiddenColumns: 'api-key-hidden-columns',
  apiKeyColumnSettingsVersion: 'api-key-column-settings-version',
  groupHiddenColumns: 'group-hidden-columns',
  groupColumnSettingsVersion: 'group-column-settings-version',
  userHiddenColumns: 'user-hidden-columns',
  userColumnSettingsVersion: 'user-column-settings-version',
  userFilterValues: 'user-filter-values',
  subscriptionHiddenColumns: 'subscription-hidden-columns',
  subscriptionUserColumnMode: 'subscription-user-column-mode',
  usageHiddenColumns: 'usage-hidden-columns',
  usageHiddenColumnsVersion: 'usage-hidden-columns-version',
  usageErrorHiddenColumns: 'usage-error-hidden-columns',
  userUsageHiddenColumns: 'user-usage-hidden-columns',
  userUsageErrorHiddenColumns: 'user-usage-error-hidden-columns',
  adminUsersUsageSort: 'admin-users-usage-sort',
  channelStatusAutoRefresh: 'channel-status-auto-refresh',
  // 缓存与流程
  opsMonitoringEnabledCached: 'ops_monitoring_enabled_cached',
  opsRealtimeMonitoringEnabledCached: 'ops_realtime_monitoring_enabled_cached',
  opsQueryModeDefaultCached: 'ops_query_mode_default_cached',
  paymentEnabledCached: 'payment_enabled_cached',
  paymentRecoveryCurrent: 'payment.recovery.current',
  ipGeoCache: 'sub2api:ip-geo-cache:v1',
  chunkReloadAttempted: 'chunk_reload_attempted', // sessionStorage
  groupDuplicatePrefix: 'sub2api:admin:group-duplicate:',
  channelMonitorDuplicatePrefix: 'sub2api:admin:channel-monitor-duplicate:',
  // 新增键（sub2api: 前缀）
  bootCorrection: 'sub2api:boot-correction', // sessionStorage：深链纠正防循环
  sidebarCollapsed: 'sub2api:sidebar-collapsed'
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

/** 附录 B 中的旧键（不含新增 sub2api: 键与前缀常量），供测试比对。 */
export const LEGACY_STORAGE_KEYS: readonly string[] = Object.entries(STORAGE_KEYS)
  .filter(([name]) => !['bootCorrection', 'sidebarCollapsed'].includes(name))
  .map(([, value]) => value)
