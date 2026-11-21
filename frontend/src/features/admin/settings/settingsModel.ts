/**
 * 系统设置：表单模型（默认值 / 服务端 → 表单 / 校验 / 提交负载）。
 * 与 Vue 版 SettingsView 的 loadSettings / saveSettings 逐字段一致；纯函数，便于快照测试。
 */
import type {
  AccountSchedulingThresholdsMap,
  AuthSourceDefaultsState,
  DefaultPlatformQuotasMap,
  DefaultSubscriptionSetting,
  SystemSettings,
  UpdateSettingsRequest,
  WeChatConnectMode
} from '@/api/admin/settings'
import {
  appendAuthSourceDefaultsToUpdateRequest,
  buildAuthSourceDefaultsState,
  defaultWeChatConnectScopesForMode,
  deriveWeChatConnectStoredMode,
  normalizeAccountSchedulingThresholdsMap,
  normalizeDefaultSubscriptionSettings,
  normalizePlatformQuotasMap,
  resolveWeChatConnectModeCapabilities,
  sanitizeAccountSchedulingThresholdsMap,
  sanitizePlatformQuotasMap
} from '@/api/admin/settings'
import {
  normalizeRechargeBonusMode,
  normalizeRechargeBonusTiers,
  sanitizeRechargeBonusTiersForSubmit,
  type RechargeBonusMode,
  type RechargeBonusTierDraft
} from '@/utils/rechargeBonus'
import { normalizeRegistrationEmailSuffixDomains } from '@/utils/registrationEmailPolicy'
import {
  createDefaultClaudeOAuthSystemPromptBlocks,
  defaultClaudeOAuthSystemPromptBlocks,
  parseClaudeOAuthSystemPromptBlocks,
  serializeClaudeOAuthSystemPromptBlocksToJSON,
  type ClaudeOAuthSystemPromptBlock
} from './claudePromptBlocks'
import {
  defaultFingerprintSignalRows,
  parseFingerprintSignalsToRows,
  serializeFingerprintRowsToJSON,
  type FingerprintSignalRow
} from './codexFingerprintSignals'

export const TABLE_PAGE_SIZE_MIN = 5
export const TABLE_PAGE_SIZE_MAX = 1000
export const TABLE_PAGE_SIZE_DEFAULT = 20
export const MAX_FORWARDED_CLIENT_IP_HEADERS = 16
const FORWARDED_HEADER_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

export type LoginAgreementDocument = { id: string; title: string; content_md: string }
export interface NotifyEmailEntry {
  email: string
  disabled?: boolean
  verified?: boolean
}

export type SettingsForm = Omit<
  SystemSettings,
  | 'wechat_connect_open_enabled'
  | 'wechat_connect_mp_enabled'
  | 'wechat_connect_mobile_enabled'
  | 'openai_oauth_scheduling_rate_multiplier'
  | 'payment_recharge_bonus_tiers'
  | 'payment_recharge_bonus_mode'
  | 'payment_recharge_bonus_notice'
  | 'default_platform_quotas'
  | 'account_scheduling_thresholds'
> & {
  channel_monitor_hide_throughput: boolean
  channel_monitor_show_quota: boolean
  channel_monitor_hide_user_ranking: boolean
  smtp_password: string
  turnstile_secret_key: string
  tencent_captcha_app_secret_key: string
  tencent_captcha_cloud_secret_id: string
  tencent_captcha_cloud_secret_key: string
  aliyun_captcha_access_key_secret: string
  linuxdo_connect_client_secret: string
  dingtalk_connect_client_secret: string
  wechat_connect_app_secret: string
  wechat_connect_open_app_secret: string
  wechat_connect_mp_app_secret: string
  wechat_connect_mobile_app_secret: string
  wechat_connect_open_enabled: boolean
  wechat_connect_mp_enabled: boolean
  wechat_connect_mobile_enabled: boolean
  oidc_connect_client_secret: string
  github_oauth_client_secret: string
  google_oauth_client_secret: string
  force_email_on_third_party_signup: boolean
  openai_low_upstream_rate_priority_enabled: boolean
  openai_oauth_scheduling_rate_multiplier: number | '' | null
  openai_advanced_scheduler_enabled: boolean
  openai_advanced_scheduler_sticky_weighted_enabled: boolean
  openai_advanced_scheduler_subscription_priority_enabled: boolean
  openai_advanced_scheduler_lb_top_k: string
  openai_advanced_scheduler_weight_priority: string
  openai_advanced_scheduler_weight_load: string
  openai_advanced_scheduler_weight_queue: string
  openai_advanced_scheduler_weight_error_rate: string
  openai_advanced_scheduler_weight_ttft: string
  openai_advanced_scheduler_weight_reset: string
  openai_advanced_scheduler_weight_quota_headroom: string
  openai_advanced_scheduler_weight_upstream_cost: string
  openai_advanced_scheduler_weight_previous_response: string
  openai_advanced_scheduler_weight_session_sticky: string
  payment_recharge_bonus_tiers: RechargeBonusTierDraft[]
  payment_recharge_bonus_mode: RechargeBonusMode
  payment_recharge_bonus_notice: string
  default_platform_quotas: DefaultPlatformQuotasMap
  account_scheduling_thresholds: AccountSchedulingThresholdsMap
}

export interface CodexClientRow {
  originator: string
  uaContains: string
  skipEngineFingerprint: boolean
}

export interface OpenAIFastRule {
  service_tier: string
  action: string
  scope: string
  user_ids?: number[]
  error_message?: string
  model_whitelist?: string[]
  fallback_action?: string
  fallback_error_message?: string
}

/** 表单之外的编辑态（保存时合并进负载）。 */
export interface SettingsAux {
  emailSuffixTags: string[]
  tablePageSizeInput: string
  claudeBlocks: ClaudeOAuthSystemPromptBlock[]
  codexBlacklist: CodexClientRow[]
  codexWhitelist: CodexClientRow[]
  fingerprintRows: FingerprintSignalRow[]
  authSourceDefaults: AuthSourceDefaultsState
  openaiFastRules: OpenAIFastRule[]
  /** 仅当后端返回过该字段才回写，避免覆盖默认规则 */
  openaiFastLoaded: boolean
}

export interface SettingsDraft {
  form: SettingsForm
  aux: SettingsAux
}

export type LoginAgreementTitles = { terms: string; usage: string; regions: string; service: string }

export function defaultLoginAgreementDocuments(titles: LoginAgreementTitles): LoginAgreementDocument[] {
  return [
    { id: 'terms', title: titles.terms, content_md: '' },
    { id: 'usage-policy', title: titles.usage, content_md: '' },
    { id: 'supported-regions', title: titles.regions, content_md: '' },
    { id: 'service-specific-terms', title: titles.service, content_md: '' }
  ]
}

export function normalizeLoginAgreementDocumentId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
}

export function loginAgreementRoutePath(doc: LoginAgreementDocument, index: number): string {
  return `/legal/${normalizeLoginAgreementDocumentId(doc.id || doc.title) || `doc-${index + 1}`}`
}

export function normalizeLoginAgreementDocumentsForSave(
  docs: LoginAgreementDocument[]
): LoginAgreementDocument[] {
  return docs
    .map((doc, index) => ({
      id: normalizeLoginAgreementDocumentId(doc.id || doc.title) || `doc-${index + 1}`,
      title: doc.title.trim(),
      content_md: doc.content_md.trim()
    }))
    .filter((doc) => doc.title || doc.content_md)
}

export function findDuplicateLoginAgreementDocumentId(docs: LoginAgreementDocument[]): string | null {
  const seen = new Set<string>()
  for (const doc of docs) {
    if (seen.has(doc.id)) return doc.id
    seen.add(doc.id)
  }
  return null
}

export const formatTablePageSizeOptions = (options: number[]): string => options.join(', ')

export function parseTablePageSizeOptionsInput(raw: string): number[] | null {
  const tokens = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (tokens.length === 0) return null
  const parsed = tokens.map(Number)
  if (parsed.some((v) => !Number.isInteger(v))) return null
  const deduped = Array.from(new Set(parsed)).sort((a, b) => a - b)
  if (deduped.some((v) => v < TABLE_PAGE_SIZE_MIN || v > TABLE_PAGE_SIZE_MAX)) return null
  return deduped
}

export function normalizeForwardedClientIpHeader(raw: string): string {
  const header = raw.trim()
  if (!FORWARDED_HEADER_TOKEN.test(header)) return ''
  return header
    .toLowerCase()
    .split('-')
    .map((p) => `${p.charAt(0).toUpperCase()}${p.slice(1)}`)
    .join('-')
}

export function normalizeForwardedClientIpHeaders(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const headers: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const header = normalizeForwardedClientIpHeader(raw)
    const key = header.toLowerCase()
    if (!header || seen.has(key) || headers.length >= MAX_FORWARDED_CLIENT_IP_HEADERS) continue
    seen.add(key)
    headers.push(header)
  }
  return headers
}

export function parseCodexEntriesToRows(raw: string): CodexClientRow[] {
  if (!raw || !raw.trim()) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map((e) => ({
      originator: typeof e?.originator === 'string' ? e.originator : '',
      uaContains: Array.isArray(e?.ua_contains)
        ? e.ua_contains.filter((x: unknown) => typeof x === 'string').join(', ')
        : '',
      skipEngineFingerprint: e?.skip_engine_fingerprint === true
    }))
  } catch {
    return []
  }
}

export function serializeCodexRowsToJSON(rows: CodexClientRow[]): string {
  const entries = rows
    .map((r) => {
      const entry: { originator: string; ua_contains: string[]; skip_engine_fingerprint?: boolean } = {
        originator: r.originator.trim(),
        ua_contains: r.uaContains
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      }
      if (r.skipEngineFingerprint) entry.skip_engine_fingerprint = true
      return entry
    })
    .filter((e) => e.originator !== '' || e.ua_contains.length > 0)
  return entries.length > 0 ? JSON.stringify(entries) : ''
}

/** 站点类型两个开关的派生：保存时同时写回，避免出现既无充值也无订阅的组合。 */
export type CaptchaProvider = 'turnstile' | 'tencent' | 'aliyun'
export function applyCaptchaSelection(form: SettingsForm, provider: CaptchaProvider | null): SettingsForm {
  return {
    ...form,
    turnstile_enabled: provider === 'turnstile',
    tencent_captcha_enabled: provider === 'tencent',
    aliyun_captcha_enabled: provider === 'aliyun'
  }
}
export function captchaProviderOf(form: SettingsForm): CaptchaProvider | null {
  if (form.tencent_captcha_enabled) return 'tencent'
  if (form.aliyun_captcha_enabled) return 'aliyun'
  if (form.turnstile_enabled) return 'turnstile'
  return null
}

export function syncWeChatConnectMode(form: SettingsForm, preferred?: WeChatConnectMode): SettingsForm {
  const f = { ...form }
  if (f.wechat_connect_mp_enabled && f.wechat_connect_mobile_enabled) {
    if (preferred === 'mobile') f.wechat_connect_mp_enabled = false
    else f.wechat_connect_mobile_enabled = false
  }
  const c = resolveWeChatConnectModeCapabilities(
    f.wechat_connect_open_enabled,
    f.wechat_connect_mp_enabled,
    f.wechat_connect_mobile_enabled,
    f.wechat_connect_mode
  )
  f.wechat_connect_open_enabled = c.openEnabled
  f.wechat_connect_mp_enabled = c.mpEnabled
  f.wechat_connect_mobile_enabled = c.mobileEnabled
  f.wechat_connect_mode = deriveWeChatConnectStoredMode(
    c.openEnabled,
    c.mpEnabled,
    c.mobileEnabled,
    f.wechat_connect_mode
  )
  f.wechat_connect_scopes = defaultWeChatConnectScopesForMode(f.wechat_connect_mode)
  return f
}

export function parseUserIdList(csv: string): number[] {
  return Array.from(
    new Set(
      csv
        .split(/[,\s]+/)
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0)
    )
  )
}

export function defaultSettingsForm(titles: LoginAgreementTitles): SettingsForm {
  return {
    registration_enabled: true,
    email_verify_enabled: false,
    registration_email_suffix_whitelist: [],
    registration_email_domain_quota_enabled: false,
    promo_code_enabled: true,
    invitation_code_enabled: false,
    password_reset_enabled: false,
    totp_enabled: false,
    totp_encryption_key_configured: false,
    passkey_enabled: false,
    passkey_configured: false,
    passkey_rp_id: '',
    passkey_rp_origins: [],
    session_binding_enabled: false,
    step_up_enabled: false,
    audit_log_retention_days: 180,
    login_agreement_enabled: false,
    login_agreement_mode: 'modal',
    login_agreement_updated_at: '2026-03-31',
    login_agreement_documents: defaultLoginAgreementDocuments(titles),
    default_balance: 0,
    default_platform_quotas: normalizePlatformQuotasMap() as DefaultPlatformQuotasMap,
    account_scheduling_thresholds: normalizeAccountSchedulingThresholdsMap(),
    affiliate_rebate_rate: 20,
    affiliate_rebate_freeze_hours: 0,
    affiliate_rebate_duration_days: 0,
    affiliate_rebate_per_invitee_cap: 0,
    affiliate_admin_recharge_enabled: false,
    default_concurrency: 1,
    default_subscriptions: [],
    force_email_on_third_party_signup: false,
    default_user_rpm_limit: 0,
    site_name: 'Sub2API',
    site_logo: '',
    site_subtitle: 'Subscription to API Conversion Platform',
    api_base_url: '',
    contact_info: '',
    doc_url: '',
    home_content: '',
    compact_home_enabled: false,
    backend_mode_enabled: false,
    hide_ccs_import_button: false,
    payment_enabled: false,
    risk_control_enabled: false,
    cyber_policy_user_allowlist: '',
    cyber_session_block_enabled: false,
    cyber_session_block_ttl_seconds: 3600,
    payment_min_amount: 1,
    payment_max_amount: 10000,
    payment_daily_limit: 50000,
    payment_max_pending_orders: 3,
    payment_order_timeout_minutes: 30,
    payment_balance_disabled: false,
    payment_balance_recharge_multiplier: 1,
    payment_subscription_usd_to_cny_rate: 0,
    payment_recharge_fee_rate: 0,
    payment_recharge_bonus_tiers: [],
    payment_recharge_bonus_mode: 'bonus',
    payment_recharge_bonus_notice: '',
    payment_enabled_types: [],
    payment_help_image_url: '',
    payment_help_text: '',
    payment_product_name_prefix: '',
    payment_product_name_suffix: '',
    payment_load_balance_strategy: 'round-robin',
    payment_cancel_rate_limit_enabled: false,
    payment_cancel_rate_limit_max: 10,
    payment_cancel_rate_limit_window: 1,
    payment_cancel_rate_limit_unit: 'day',
    payment_cancel_rate_limit_window_mode: 'rolling',
    payment_alipay_force_qrcode: false,
    payment_alipay_mobile_precreate_deep_link: false,
    table_default_page_size: TABLE_PAGE_SIZE_DEFAULT,
    table_page_size_options: [10, 20, 50, 100],
    custom_menu_items: [] as Array<{
      id: string
      label: string
      icon_svg: string
      url: string
      visibility: 'user' | 'admin'
      sort_order: number
      hide_open_button?: boolean
    }>,
    custom_endpoints: [] as Array<{
      name: string
      endpoint: string
      description: string
    }>,
    frontend_url: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    smtp_password_configured: false,
    smtp_from_email: '',
    smtp_from_name: '',
    smtp_use_tls: true,
    // Cloudflare Turnstile
    turnstile_enabled: false,
    turnstile_site_key: '',
    turnstile_secret_key: '',
    turnstile_secret_key_configured: false,
    tencent_captcha_enabled: false,
    tencent_captcha_app_id: '',
    tencent_captcha_app_secret_key: '',
    tencent_captcha_app_secret_key_configured: false,
    tencent_captcha_cloud_secret_id: '',
    tencent_captcha_cloud_secret_id_configured: false,
    tencent_captcha_cloud_secret_key: '',
    tencent_captcha_cloud_secret_key_configured: false,
    tencent_captcha_region: 'cn',
    aliyun_captcha_enabled: false,
    aliyun_captcha_access_key_id: '',
    aliyun_captcha_access_key_secret: '',
    aliyun_captcha_access_key_secret_configured: false,
    aliyun_captcha_scene_id: '',
    aliyun_captcha_prefix: '',
    aliyun_captcha_region: 'cn',
    api_key_acl_trust_forwarded_ip: true,
    forwarded_client_ip_headers: [],
    // LinuxDo Connect OAuth 登录
    linuxdo_connect_enabled: false,
    linuxdo_connect_client_id: '',
    linuxdo_connect_client_secret: '',
    linuxdo_connect_client_secret_configured: false,
    linuxdo_connect_redirect_url: '',
    // DingTalk Connect OAuth 登录
    dingtalk_connect_enabled: false,
    dingtalk_connect_client_id: '',
    dingtalk_connect_client_secret: '',
    dingtalk_connect_client_secret_configured: false,
    dingtalk_connect_redirect_url: '',
    dingtalk_connect_corp_restriction_policy: 'none',
    dingtalk_connect_internal_corp_id: '',
    dingtalk_connect_bypass_registration: false,
    dingtalk_connect_sync_corp_email: false,
    dingtalk_connect_sync_display_name: false,
    dingtalk_connect_sync_dept: false,
    dingtalk_connect_sync_corp_email_attr_key: 'dingtalk_email',
    dingtalk_connect_sync_display_name_attr_key: 'dingtalk_name',
    dingtalk_connect_sync_dept_attr_key: 'dingtalk_department',
    dingtalk_connect_sync_corp_email_attr_name: 'DingTalk Corporate Email',
    dingtalk_connect_sync_display_name_attr_name: 'DingTalk Name',
    dingtalk_connect_sync_dept_attr_name: 'DingTalk Department',
    wechat_connect_enabled: false,
    wechat_connect_app_id: '',
    wechat_connect_app_secret: '',
    wechat_connect_app_secret_configured: false,
    wechat_connect_open_app_id: '',
    wechat_connect_open_app_secret: '',
    wechat_connect_open_app_secret_configured: false,
    wechat_connect_mp_app_id: '',
    wechat_connect_mp_app_secret: '',
    wechat_connect_mp_app_secret_configured: false,
    wechat_connect_mobile_app_id: '',
    wechat_connect_mobile_app_secret: '',
    wechat_connect_mobile_app_secret_configured: false,
    wechat_connect_open_enabled: false,
    wechat_connect_mp_enabled: false,
    wechat_connect_mobile_enabled: false,
    wechat_connect_mode: 'open',
    wechat_connect_scopes: 'snsapi_login',
    wechat_connect_redirect_url: '',
    wechat_connect_frontend_redirect_url: '/auth/wechat/callback',
    // Generic OIDC OAuth 登录
    oidc_connect_enabled: false,
    oidc_connect_provider_name: 'OIDC',
    oidc_connect_client_id: '',
    oidc_connect_client_secret: '',
    oidc_connect_client_secret_configured: false,
    oidc_connect_issuer_url: '',
    oidc_connect_discovery_url: '',
    oidc_connect_authorize_url: '',
    oidc_connect_token_url: '',
    oidc_connect_userinfo_url: '',
    oidc_connect_jwks_url: '',
    oidc_connect_scopes: 'openid email profile',
    oidc_connect_redirect_url: '',
    oidc_connect_frontend_redirect_url: '/auth/oidc/callback',
    oidc_connect_token_auth_method: 'client_secret_post',
    oidc_connect_use_pkce: false,
    oidc_connect_validate_id_token: false,
    oidc_connect_allowed_signing_algs: 'RS256,ES256,PS256',
    oidc_connect_clock_skew_seconds: 120,
    oidc_connect_require_email_verified: false,
    oidc_connect_userinfo_email_path: '',
    oidc_connect_userinfo_id_path: '',
    oidc_connect_userinfo_username_path: '',
    // GitHub / Google 邮箱快捷登录
    github_oauth_enabled: false,
    github_oauth_client_id: '',
    github_oauth_client_secret: '',
    github_oauth_client_secret_configured: false,
    github_oauth_redirect_url: '',
    github_oauth_frontend_redirect_url: '/auth/oauth/callback',
    google_oauth_enabled: false,
    google_oauth_client_id: '',
    google_oauth_client_secret: '',
    google_oauth_client_secret_configured: false,
    google_oauth_redirect_url: '',
    google_oauth_frontend_redirect_url: '/auth/oauth/callback',
    // Model fallback
    enable_model_fallback: false,
    fallback_model_anthropic: 'claude-3-5-sonnet-20241022',
    fallback_model_openai: 'gpt-4o',
    fallback_model_gemini: 'gemini-2.5-pro',
    fallback_model_antigravity: 'gemini-2.5-pro',
    grok_default_text_model: 'grok-4.5',
    grok_cross_client_model_map_enabled: false,
    grok_default_base_url_mode: 'cli',
    // Identity patch (Claude -> Gemini)
    enable_identity_patch: true,
    identity_patch_prompt: '',
    // Ops monitoring (vNext)
    ops_monitoring_enabled: true,
    ops_realtime_monitoring_enabled: true,
    ops_query_mode_default: 'auto',
    ops_metrics_interval_seconds: 60,
    // Claude Code version check
    min_claude_code_version: '',
    max_claude_code_version: '',
    // 分组隔离
    allow_ungrouped_key_scheduling: false,
    openai_low_upstream_rate_priority_enabled: false,
    openai_oauth_scheduling_rate_multiplier: 1,
    openai_advanced_scheduler_enabled: false,
    openai_advanced_scheduler_sticky_weighted_enabled: false,
    openai_advanced_scheduler_subscription_priority_enabled: false,
    openai_advanced_scheduler_lb_top_k: '',
    openai_advanced_scheduler_weight_priority: '',
    openai_advanced_scheduler_weight_load: '',
    openai_advanced_scheduler_weight_queue: '',
    openai_advanced_scheduler_weight_error_rate: '',
    openai_advanced_scheduler_weight_ttft: '',
    openai_advanced_scheduler_weight_reset: '',
    openai_advanced_scheduler_weight_quota_headroom: '',
    openai_advanced_scheduler_weight_upstream_cost: '',
    openai_advanced_scheduler_weight_previous_response: '',
    openai_advanced_scheduler_weight_session_sticky: '',
    // Gateway forwarding behavior
    openai_ttft_mode: 'semantic',
    enable_fingerprint_unification: true,
    enable_metadata_passthrough: false,
    enable_cch_signing: false,
    enable_claude_oauth_system_prompt_injection: true,
    claude_oauth_system_prompt: '',
    claude_oauth_system_prompt_blocks: defaultClaudeOAuthSystemPromptBlocks,
    enable_anthropic_cache_ttl_1h_injection: false,
    rewrite_message_cache_control: false,
    enable_client_dateline_normalization: true,
    antigravity_user_agent_version: '',
    openai_codex_user_agent: '',
    openai_codex_client_version: '',
    // 只读展示：自动同步任务写入的官方最新稳定版，不参与提交（提交载荷按字段显式构造）
    openai_codex_client_version_synced: '',
    openai_codex_version_auto_sync_enabled: true,
    claude_code_client_version: '',
    // 只读展示：自动同步任务写入的官方最新稳定版，不参与提交（提交载荷按字段显式构造）
    claude_code_client_version_synced: '',
    claude_code_version_auto_sync_enabled: true,
    // codex_cli_only 加固
    min_codex_version: '',
    max_codex_version: '',
    codex_cli_only_blacklist: '',
    codex_cli_only_whitelist: '',
    codex_cli_only_allow_app_server_clients: false,
    codex_cli_only_engine_fingerprint_signals: '',
    // 余额、订阅到期与账号限额通知
    balance_low_notify_enabled: false,
    balance_low_notify_threshold: 0,
    balance_low_notify_recharge_url: '',
    subscription_expiry_notify_enabled: true,
    account_quota_notify_enabled: false,
    account_quota_notify_emails: [] as NotifyEmailEntry[],
    // Channel Monitor feature switch
    channel_monitor_enabled: true,
    channel_monitor_mode: 'v1' as 'v1' | 'v2',
    channel_monitor_default_interval_seconds: 60,
    channel_monitor_hide_throughput: false,
    channel_monitor_show_quota: false,
    channel_monitor_hide_user_ranking: false,
    // Available Channels feature switch
    available_channels_enabled: false,
    // Subscription feature switch (user sidebar "My Subscriptions" entry)
    subscription_enabled: true,
    // Model Plaza feature switches + description
    model_plaza_enabled: false,
    model_plaza_require_auth: false,
    model_plaza_description: '',
    // Plugin management menu visibility; plugin runtime is unaffected.
    plugin_management_enabled: false,
    // Affiliate (邀请返利) feature switch
    affiliate_enabled: false,
    // Allow user view error requests
    allow_user_view_error_requests: false
  } as unknown as SettingsForm
}

export function emptyAux(): SettingsAux {
  return {
    emailSuffixTags: [],
    tablePageSizeInput: formatTablePageSizeOptions([10, 20, 50, 100]),
    claudeBlocks: createDefaultClaudeOAuthSystemPromptBlocks(),
    codexBlacklist: [],
    codexWhitelist: [],
    fingerprintRows: defaultFingerprintSignalRows(),
    authSourceDefaults: buildAuthSourceDefaultsState({}),
    openaiFastRules: [],
    openaiFastLoaded: false
  }
}

/** 需要在加载/保存后清空的一次性密钥输入框。 */
const SECRET_INPUTS = [
  'smtp_password',
  'turnstile_secret_key',
  'tencent_captcha_app_secret_key',
  'tencent_captcha_cloud_secret_id',
  'tencent_captcha_cloud_secret_key',
  'aliyun_captcha_access_key_secret',
  'linuxdo_connect_client_secret',
  'dingtalk_connect_client_secret',
  'github_oauth_client_secret',
  'google_oauth_client_secret',
  'wechat_connect_app_secret',
  'wechat_connect_open_app_secret',
  'wechat_connect_mp_app_secret',
  'wechat_connect_mobile_app_secret',
  'oidc_connect_client_secret'
] as const

/** 服务端设置 → 草稿（loadSettings 的逐字段对应；`prev` 为当前草稿，用于保存后合并）。 */
export function draftFromSettings(
  settings: SystemSettings,
  titles: LoginAgreementTitles,
  prev?: SettingsDraft,
  opts: { initial?: boolean } = { initial: true }
): SettingsDraft {
  const base = prev?.form ?? defaultSettingsForm(titles)
  const form: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) }
  const incoming = { ...settings } as unknown as Record<string, unknown>
  if (opts.initial)
    incoming.payment_load_balance_strategy = settings.payment_load_balance_strategy || 'round-robin'
  for (const [key, value] of Object.entries(incoming)) {
    if (!opts.initial && key === 'openai_fast_policy_settings') continue
    // 后端返回 null 表示未配置，保留默认值
    if (value !== null && value !== undefined) form[key] = value
  }
  // 该可选覆盖项：null 显式表示“按账号倍率”
  if (settings.openai_oauth_scheduling_rate_multiplier === null)
    form.openai_oauth_scheduling_rate_multiplier = null
  const f = form as unknown as SettingsForm
  const aux: SettingsAux = { ...(prev?.aux ?? emptyAux()) }

  if (opts.initial) {
    if (!f.claude_oauth_system_prompt_blocks?.trim())
      f.claude_oauth_system_prompt_blocks = defaultClaudeOAuthSystemPromptBlocks
    aux.claudeBlocks = parseClaudeOAuthSystemPromptBlocks(
      f.claude_oauth_system_prompt_blocks,
      f.claude_oauth_system_prompt
    )
    f.claude_oauth_system_prompt_blocks = serializeClaudeOAuthSystemPromptBlocksToJSON(aux.claudeBlocks)
    aux.codexBlacklist = parseCodexEntriesToRows(f.codex_cli_only_blacklist)
    aux.codexWhitelist = parseCodexEntriesToRows(f.codex_cli_only_whitelist)
    aux.fingerprintRows = f.codex_cli_only_engine_fingerprint_signals
      ? parseFingerprintSignalsToRows(f.codex_cli_only_engine_fingerprint_signals)
      : defaultFingerprintSignalRows()
    f.login_agreement_mode = settings.login_agreement_mode === 'checkbox' ? 'checkbox' : 'modal'
    f.channel_monitor_mode = settings.channel_monitor_mode === 'v2' ? 'v2' : 'v1'
    f.login_agreement_updated_at = settings.login_agreement_updated_at || '2026-03-31'
    f.login_agreement_documents =
      Array.isArray(settings.login_agreement_documents) && settings.login_agreement_documents.length > 0
        ? settings.login_agreement_documents.map((d) => ({
            id: d.id || '',
            title: d.title || '',
            content_md: d.content_md || ''
          }))
        : defaultLoginAgreementDocuments(titles)
  }
  f.channel_monitor_hide_throughput = Boolean(settings.channel_monitor_hide_throughput)
  f.channel_monitor_show_quota = Boolean(settings.channel_monitor_show_quota)
  f.channel_monitor_hide_user_ranking = Boolean(settings.channel_monitor_hide_user_ranking)
  aux.authSourceDefaults = buildAuthSourceDefaultsState(settings)
  f.payment_recharge_bonus_tiers = normalizeRechargeBonusTiers(settings.payment_recharge_bonus_tiers)
  f.payment_recharge_bonus_mode = normalizeRechargeBonusMode(settings.payment_recharge_bonus_mode)
  f.payment_recharge_bonus_notice = settings.payment_recharge_bonus_notice || ''
  f.default_platform_quotas = normalizePlatformQuotasMap(settings.default_platform_quotas)
  f.account_scheduling_thresholds = normalizeAccountSchedulingThresholdsMap(
    settings.account_scheduling_thresholds
  )
  f.backend_mode_enabled = settings.backend_mode_enabled
  f.default_subscriptions = normalizeDefaultSubscriptionSettings(settings.default_subscriptions)
  aux.emailSuffixTags = normalizeRegistrationEmailSuffixDomains(settings.registration_email_suffix_whitelist)
  f.forwarded_client_ip_headers = normalizeForwardedClientIpHeaders(settings.forwarded_client_ip_headers)
  aux.tablePageSizeInput = formatTablePageSizeOptions(
    Array.isArray(settings.table_page_size_options) ? settings.table_page_size_options : [10, 20, 50, 100]
  )
  for (const k of SECRET_INPUTS) (f as unknown as Record<string, unknown>)[k] = ''
  const caps = resolveWeChatConnectModeCapabilities(
    settings.wechat_connect_open_enabled,
    settings.wechat_connect_mp_enabled,
    settings.wechat_connect_mobile_enabled,
    settings.wechat_connect_mode
  )
  f.wechat_connect_open_enabled = caps.openEnabled
  f.wechat_connect_mp_enabled = caps.mpEnabled
  f.wechat_connect_mobile_enabled = caps.mobileEnabled
  f.wechat_connect_mode = deriveWeChatConnectStoredMode(
    caps.openEnabled,
    caps.mpEnabled,
    caps.mobileEnabled,
    settings.wechat_connect_mode
  )
  if (opts.initial) {
    const legacyAppId = String(settings.wechat_connect_app_id || '').trim()
    const legacySecret = Boolean(settings.wechat_connect_app_secret_configured)
    if (!f.wechat_connect_open_app_id && caps.openEnabled) f.wechat_connect_open_app_id = legacyAppId
    if (!f.wechat_connect_mp_app_id && caps.mpEnabled) f.wechat_connect_mp_app_id = legacyAppId
    if (!f.wechat_connect_mobile_app_id && caps.mobileEnabled) f.wechat_connect_mobile_app_id = legacyAppId
    if (!f.wechat_connect_open_app_secret_configured && caps.openEnabled)
      f.wechat_connect_open_app_secret_configured = legacySecret
    if (!f.wechat_connect_mp_app_secret_configured && caps.mpEnabled)
      f.wechat_connect_mp_app_secret_configured = legacySecret
    if (!f.wechat_connect_mobile_app_secret_configured && caps.mobileEnabled)
      f.wechat_connect_mobile_app_secret_configured = legacySecret
  }
  f.wechat_connect_scopes = defaultWeChatConnectScopesForMode(f.wechat_connect_mode)
  const fast = settings.openai_fast_policy_settings
  if (fast && Array.isArray(fast.rules)) {
    aux.openaiFastRules = fast.rules.map((r) => ({
      ...r,
      user_ids: r.user_ids ? [...r.user_ids] : [],
      model_whitelist: r.model_whitelist ? [...r.model_whitelist] : []
    }))
    aux.openaiFastLoaded = true
  }
  return { form: f, aux }
}

export type ValidationError =
  | { key: 'tableDefaultPageSizeRange'; params: { min: number; max: number } }
  | { key: 'tablePageSizeOptionsFormat'; params: { min: number; max: number } }
  | { key: 'agreementNeedsDocument' }
  | { key: 'agreementTitleRequired' }
  | { key: 'agreementDuplicateRoute'; params: { id: string } }
  | { key: 'defaultSubscriptionsDuplicate'; params: { groupId: number; prefix?: string } }
  | { key: 'wechatMpMobileConflict' }
  | { key: 'oauthRateInvalid' }

const isValidHttpUrl = (url: string): boolean => {
  if (!url) return true
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function findDuplicateGroup(subs: DefaultSubscriptionSetting[]): DefaultSubscriptionSetting | undefined {
  const seen = new Set<number>()
  return subs.find((s) => {
    if (seen.has(s.group_id)) return true
    seen.add(s.group_id)
    return false
  })
}

/**
 * 保存前归一化 + 校验（顺序与 Vue 版一致）。返回归一化后的草稿，或第一个校验错误。
 * `authSourceTitles`：认证来源标题，用于重复订阅组的错误前缀。
 */
export function prepareForSave(
  draft: SettingsDraft,
  authSourceTitles: Record<string, string> = {}
): { ok: true; draft: SettingsDraft } | { ok: false; error: ValidationError } {
  const form: SettingsForm = { ...draft.form }
  const aux: SettingsAux = { ...draft.aux }
  const size = Math.floor(Number(form.table_default_page_size))
  if (!Number.isInteger(size) || size < TABLE_PAGE_SIZE_MIN || size > TABLE_PAGE_SIZE_MAX) {
    return {
      ok: false,
      error: {
        key: 'tableDefaultPageSizeRange',
        params: { min: TABLE_PAGE_SIZE_MIN, max: TABLE_PAGE_SIZE_MAX }
      }
    }
  }
  const options = parseTablePageSizeOptionsInput(aux.tablePageSizeInput)
  if (!options) {
    return {
      ok: false,
      error: {
        key: 'tablePageSizeOptionsFormat',
        params: { min: TABLE_PAGE_SIZE_MIN, max: TABLE_PAGE_SIZE_MAX }
      }
    }
  }
  form.table_default_page_size = size
  form.table_page_size_options = options

  const docs = normalizeLoginAgreementDocumentsForSave(form.login_agreement_documents)
  if (form.login_agreement_enabled && docs.length === 0)
    return { ok: false, error: { key: 'agreementNeedsDocument' } }
  if (docs.find((d) => !d.title)) return { ok: false, error: { key: 'agreementTitleRequired' } }
  const dup = findDuplicateLoginAgreementDocumentId(docs)
  if (dup) return { ok: false, error: { key: 'agreementDuplicateRoute', params: { id: dup } } }
  form.login_agreement_mode = form.login_agreement_mode === 'checkbox' ? 'checkbox' : 'modal'
  form.login_agreement_documents = docs
  form.forwarded_client_ip_headers = normalizeForwardedClientIpHeaders(form.forwarded_client_ip_headers)

  form.default_subscriptions = normalizeDefaultSubscriptionSettings(form.default_subscriptions)
  const dupSub = findDuplicateGroup(form.default_subscriptions)
  if (dupSub)
    return {
      ok: false,
      error: { key: 'defaultSubscriptionsDuplicate', params: { groupId: dupSub.group_id } }
    }
  const asd = { ...aux.authSourceDefaults } as AuthSourceDefaultsState
  for (const source of Object.keys(asd) as (keyof AuthSourceDefaultsState)[]) {
    asd[source] = {
      ...asd[source],
      subscriptions: normalizeDefaultSubscriptionSettings(asd[source].subscriptions)
    }
    const d = findDuplicateGroup(asd[source].subscriptions)
    if (d)
      return {
        ok: false,
        error: {
          key: 'defaultSubscriptionsDuplicate',
          params: { groupId: d.group_id, prefix: authSourceTitles[source] ?? String(source) }
        }
      }
  }
  aux.authSourceDefaults = asd

  if (form.wechat_connect_mp_enabled && form.wechat_connect_mobile_enabled)
    return { ok: false, error: { key: 'wechatMpMobileConflict' } }
  // 可选 URL：非法值自动清空，避免后端 400
  if (!isValidHttpUrl(form.frontend_url)) form.frontend_url = ''
  if (!isValidHttpUrl(form.doc_url)) form.doc_url = ''
  const synced = syncWeChatConnectMode(form)
  const rate = synced.openai_oauth_scheduling_rate_multiplier
  if (rate !== '' && rate !== null && (!Number.isFinite(rate) || rate < 0))
    return { ok: false, error: { key: 'oauthRateInvalid' } }
  synced.claude_oauth_system_prompt_blocks = serializeClaudeOAuthSystemPromptBlocksToJSON(aux.claudeBlocks)
  return { ok: true, draft: { form: synced, aux } }
}

/** 草稿（已通过 prepareForSave）→ PUT /admin/settings 负载。逐字段与 Vue 版 saveSettings 一致。 */
export function buildSettingsPayload(draft: SettingsDraft, ctx: { origin: string }): UpdateSettingsRequest {
  const { form, aux } = draft
  const wechatStoredMode = deriveWeChatConnectStoredMode(
    form.wechat_connect_open_enabled,
    form.wechat_connect_mp_enabled,
    form.wechat_connect_mobile_enabled,
    form.wechat_connect_mode
  )
  const claudeBlocksJSON = serializeClaudeOAuthSystemPromptBlocksToJSON(aux.claudeBlocks)
  const oauthRate = form.openai_oauth_scheduling_rate_multiplier
  const payload: UpdateSettingsRequest = {
    registration_enabled: form.registration_enabled,
    email_verify_enabled: form.email_verify_enabled,
    registration_email_suffix_whitelist: aux.emailSuffixTags.map((suffix) =>
      suffix.startsWith('*.') ? suffix : `@${suffix}`
    ),
    registration_email_domain_quota_enabled: form.registration_email_domain_quota_enabled,
    promo_code_enabled: form.promo_code_enabled,
    invitation_code_enabled: form.invitation_code_enabled,
    password_reset_enabled: form.password_reset_enabled,
    totp_enabled: form.totp_enabled,
    passkey_enabled: form.passkey_enabled,
    session_binding_enabled: form.session_binding_enabled,
    step_up_enabled: form.step_up_enabled,
    // 清空数字框时 v-model.number 会得到空串，后端 int 字段解析空串会 400 拒绝整次保存；
    // 空/非法值回退默认 180（与后端 parseAuditLogRetentionDays("") 语义一致，0 仍表示永久保留）。
    audit_log_retention_days: Number.isFinite(form.audit_log_retention_days)
      ? form.audit_log_retention_days
      : 180,
    login_agreement_enabled: form.login_agreement_enabled,
    login_agreement_mode: form.login_agreement_mode,
    login_agreement_updated_at: form.login_agreement_updated_at,
    login_agreement_documents: form.login_agreement_documents,
    default_balance: form.default_balance,
    affiliate_rebate_rate: Math.min(100, Math.max(0, Number(form.affiliate_rebate_rate) || 0)),
    affiliate_rebate_freeze_hours: Math.max(
      0,
      Math.min(720, Number(form.affiliate_rebate_freeze_hours) || 0)
    ),
    affiliate_rebate_duration_days: Math.max(
      0,
      Math.min(3650, Math.floor(Number(form.affiliate_rebate_duration_days) || 0))
    ),
    affiliate_rebate_per_invitee_cap: Math.max(0, Number(form.affiliate_rebate_per_invitee_cap) || 0),
    affiliate_admin_recharge_enabled: form.affiliate_admin_recharge_enabled,
    default_concurrency: form.default_concurrency,
    default_subscriptions: form.default_subscriptions,
    force_email_on_third_party_signup: form.force_email_on_third_party_signup,
    default_user_rpm_limit: form.default_user_rpm_limit,
    site_name: form.site_name,
    site_logo: form.site_logo,
    site_subtitle: form.site_subtitle,
    api_base_url: form.api_base_url,
    contact_info: form.contact_info,
    doc_url: form.doc_url,
    home_content: form.home_content,
    compact_home_enabled: form.compact_home_enabled,
    backend_mode_enabled: form.backend_mode_enabled,
    hide_ccs_import_button: form.hide_ccs_import_button,
    table_default_page_size: form.table_default_page_size,
    table_page_size_options: form.table_page_size_options,
    custom_menu_items: form.custom_menu_items,
    custom_endpoints: form.custom_endpoints,
    frontend_url: form.frontend_url,
    smtp_host: form.smtp_host,
    smtp_port: form.smtp_port,
    smtp_username: form.smtp_username,
    smtp_password: form.smtp_password || undefined,
    smtp_from_email: form.smtp_from_email,
    smtp_from_name: form.smtp_from_name,
    smtp_use_tls: form.smtp_use_tls,
    turnstile_enabled: form.turnstile_enabled,
    turnstile_site_key: form.turnstile_site_key,
    turnstile_secret_key: form.turnstile_secret_key || undefined,
    tencent_captcha_enabled: form.tencent_captcha_enabled,
    tencent_captcha_app_id: form.tencent_captcha_app_id,
    tencent_captcha_app_secret_key: form.tencent_captcha_app_secret_key || undefined,
    tencent_captcha_cloud_secret_id: form.tencent_captcha_cloud_secret_id || undefined,
    tencent_captcha_cloud_secret_key: form.tencent_captcha_cloud_secret_key || undefined,
    tencent_captcha_region: form.tencent_captcha_region,
    aliyun_captcha_enabled: form.aliyun_captcha_enabled,
    aliyun_captcha_access_key_id: form.aliyun_captcha_access_key_id,
    aliyun_captcha_access_key_secret: form.aliyun_captcha_access_key_secret || undefined,
    aliyun_captcha_scene_id: form.aliyun_captcha_scene_id,
    aliyun_captcha_prefix: form.aliyun_captcha_prefix,
    aliyun_captcha_region: form.aliyun_captcha_region,
    api_key_acl_trust_forwarded_ip: form.api_key_acl_trust_forwarded_ip,
    forwarded_client_ip_headers: form.forwarded_client_ip_headers,
    linuxdo_connect_enabled: form.linuxdo_connect_enabled,
    linuxdo_connect_client_id: form.linuxdo_connect_client_id,
    linuxdo_connect_client_secret: form.linuxdo_connect_client_secret || undefined,
    linuxdo_connect_redirect_url: form.linuxdo_connect_redirect_url,
    dingtalk_connect_enabled: form.dingtalk_connect_enabled,
    dingtalk_connect_client_id: form.dingtalk_connect_client_id,
    dingtalk_connect_client_secret: form.dingtalk_connect_client_secret || undefined,
    dingtalk_connect_redirect_url: form.dingtalk_connect_redirect_url,
    dingtalk_connect_corp_restriction_policy: form.dingtalk_connect_corp_restriction_policy,
    dingtalk_connect_internal_corp_id: form.dingtalk_connect_internal_corp_id,
    dingtalk_connect_bypass_registration: form.dingtalk_connect_bypass_registration,
    dingtalk_connect_sync_corp_email: form.dingtalk_connect_sync_corp_email,
    dingtalk_connect_sync_display_name: form.dingtalk_connect_sync_display_name,
    dingtalk_connect_sync_dept: form.dingtalk_connect_sync_dept,
    dingtalk_connect_sync_corp_email_attr_key: form.dingtalk_connect_sync_corp_email_attr_key,
    dingtalk_connect_sync_display_name_attr_key: form.dingtalk_connect_sync_display_name_attr_key,
    dingtalk_connect_sync_dept_attr_key: form.dingtalk_connect_sync_dept_attr_key,
    dingtalk_connect_sync_corp_email_attr_name: form.dingtalk_connect_sync_corp_email_attr_name,
    dingtalk_connect_sync_display_name_attr_name: form.dingtalk_connect_sync_display_name_attr_name,
    dingtalk_connect_sync_dept_attr_name: form.dingtalk_connect_sync_dept_attr_name,
    wechat_connect_enabled: form.wechat_connect_enabled,
    wechat_connect_app_id:
      form.wechat_connect_open_app_id ||
      form.wechat_connect_mp_app_id ||
      form.wechat_connect_mobile_app_id ||
      form.wechat_connect_app_id,
    wechat_connect_app_secret: form.wechat_connect_app_secret || undefined,
    wechat_connect_open_app_id: form.wechat_connect_open_app_id,
    wechat_connect_open_app_secret: form.wechat_connect_open_app_secret || undefined,
    wechat_connect_mp_app_id: form.wechat_connect_mp_app_id,
    wechat_connect_mp_app_secret: form.wechat_connect_mp_app_secret || undefined,
    wechat_connect_mobile_app_id: form.wechat_connect_mobile_app_id,
    wechat_connect_mobile_app_secret: form.wechat_connect_mobile_app_secret || undefined,
    wechat_connect_open_enabled: form.wechat_connect_open_enabled,
    wechat_connect_mp_enabled: form.wechat_connect_mp_enabled,
    wechat_connect_mobile_enabled: form.wechat_connect_mobile_enabled,
    wechat_connect_mode: wechatStoredMode,
    wechat_connect_scopes: defaultWeChatConnectScopesForMode(wechatStoredMode),
    wechat_connect_redirect_url: form.wechat_connect_redirect_url,
    wechat_connect_frontend_redirect_url: form.wechat_connect_frontend_redirect_url,
    oidc_connect_enabled: form.oidc_connect_enabled,
    oidc_connect_provider_name: form.oidc_connect_provider_name,
    oidc_connect_client_id: form.oidc_connect_client_id,
    oidc_connect_client_secret: form.oidc_connect_client_secret || undefined,
    oidc_connect_issuer_url: form.oidc_connect_issuer_url,
    oidc_connect_discovery_url: form.oidc_connect_discovery_url,
    oidc_connect_authorize_url: form.oidc_connect_authorize_url,
    oidc_connect_token_url: form.oidc_connect_token_url,
    oidc_connect_userinfo_url: form.oidc_connect_userinfo_url,
    oidc_connect_jwks_url: form.oidc_connect_jwks_url,
    oidc_connect_scopes: form.oidc_connect_scopes,
    oidc_connect_redirect_url: form.oidc_connect_redirect_url,
    oidc_connect_frontend_redirect_url: form.oidc_connect_frontend_redirect_url,
    oidc_connect_token_auth_method: form.oidc_connect_token_auth_method,
    oidc_connect_use_pkce: form.oidc_connect_use_pkce,
    oidc_connect_validate_id_token: form.oidc_connect_validate_id_token,
    oidc_connect_allowed_signing_algs: form.oidc_connect_allowed_signing_algs,
    oidc_connect_clock_skew_seconds: form.oidc_connect_clock_skew_seconds,
    oidc_connect_require_email_verified: form.oidc_connect_require_email_verified,
    oidc_connect_userinfo_email_path: form.oidc_connect_userinfo_email_path,
    oidc_connect_userinfo_id_path: form.oidc_connect_userinfo_id_path,
    oidc_connect_userinfo_username_path: form.oidc_connect_userinfo_username_path,
    github_oauth_enabled: form.github_oauth_enabled,
    github_oauth_client_id: form.github_oauth_client_id,
    github_oauth_client_secret: form.github_oauth_client_secret || undefined,
    github_oauth_redirect_url: form.github_oauth_redirect_url,
    github_oauth_frontend_redirect_url: form.github_oauth_frontend_redirect_url,
    google_oauth_enabled: form.google_oauth_enabled,
    google_oauth_client_id: form.google_oauth_client_id,
    google_oauth_client_secret: form.google_oauth_client_secret || undefined,
    google_oauth_redirect_url: form.google_oauth_redirect_url,
    google_oauth_frontend_redirect_url: form.google_oauth_frontend_redirect_url,
    enable_model_fallback: form.enable_model_fallback,
    fallback_model_anthropic: form.fallback_model_anthropic,
    fallback_model_openai: form.fallback_model_openai,
    fallback_model_gemini: form.fallback_model_gemini,
    fallback_model_antigravity: form.fallback_model_antigravity,
    grok_default_text_model: form.grok_default_text_model.trim() || 'grok-4.5',
    grok_cross_client_model_map_enabled: form.grok_cross_client_model_map_enabled,
    grok_default_base_url_mode: form.grok_default_base_url_mode,
    enable_identity_patch: form.enable_identity_patch,
    identity_patch_prompt: form.identity_patch_prompt,
    min_claude_code_version: form.min_claude_code_version,
    max_claude_code_version: form.max_claude_code_version,
    allow_ungrouped_key_scheduling: form.allow_ungrouped_key_scheduling,
    openai_ttft_mode: form.openai_ttft_mode === 'visible' ? 'visible' : 'semantic',
    enable_fingerprint_unification: form.enable_fingerprint_unification,
    enable_metadata_passthrough: form.enable_metadata_passthrough,
    enable_cch_signing: form.enable_cch_signing,
    enable_claude_oauth_system_prompt_injection: form.enable_claude_oauth_system_prompt_injection,
    claude_oauth_system_prompt: form.claude_oauth_system_prompt?.trim()
      ? form.claude_oauth_system_prompt
      : '',
    claude_oauth_system_prompt_blocks: claudeBlocksJSON,
    enable_anthropic_cache_ttl_1h_injection: form.enable_anthropic_cache_ttl_1h_injection,
    rewrite_message_cache_control: form.rewrite_message_cache_control,
    enable_client_dateline_normalization: form.enable_client_dateline_normalization,
    antigravity_user_agent_version: form.antigravity_user_agent_version?.trim() || '',
    openai_codex_user_agent: form.openai_codex_user_agent?.trim() || '',
    openai_codex_client_version: form.openai_codex_client_version?.trim() || '',
    openai_codex_version_auto_sync_enabled: form.openai_codex_version_auto_sync_enabled,
    claude_code_client_version: form.claude_code_client_version?.trim() || '',
    claude_code_version_auto_sync_enabled: form.claude_code_version_auto_sync_enabled,
    min_codex_version: form.min_codex_version?.trim() || '',
    max_codex_version: form.max_codex_version?.trim() || '',
    codex_cli_only_allow_app_server_clients: form.codex_cli_only_allow_app_server_clients,
    codex_cli_only_engine_fingerprint_signals: serializeFingerprintRowsToJSON(aux.fingerprintRows),
    codex_cli_only_blacklist: serializeCodexRowsToJSON(aux.codexBlacklist),
    codex_cli_only_whitelist: serializeCodexRowsToJSON(aux.codexWhitelist),
    // Payment configuration
    payment_enabled: form.payment_enabled,
    risk_control_enabled: form.risk_control_enabled,
    cyber_policy_user_allowlist: form.cyber_policy_user_allowlist,
    cyber_session_block_enabled: form.cyber_session_block_enabled,
    cyber_session_block_ttl_seconds: Number(form.cyber_session_block_ttl_seconds) || 3600,
    payment_min_amount: Number(form.payment_min_amount) || 0,
    payment_max_amount: Number(form.payment_max_amount) || 0,
    payment_daily_limit: Number(form.payment_daily_limit) || 0,
    payment_max_pending_orders: Number(form.payment_max_pending_orders) || 0,
    payment_order_timeout_minutes: Number(form.payment_order_timeout_minutes) || 0,
    payment_balance_disabled: form.payment_balance_disabled,
    payment_balance_recharge_multiplier: Number(form.payment_balance_recharge_multiplier) || 1,
    payment_subscription_usd_to_cny_rate: Number(form.payment_subscription_usd_to_cny_rate) || 0,
    payment_recharge_fee_rate: Number(form.payment_recharge_fee_rate) || 0,
    payment_recharge_bonus_tiers: sanitizeRechargeBonusTiersForSubmit(form.payment_recharge_bonus_tiers),
    payment_recharge_bonus_mode: form.payment_recharge_bonus_mode,
    payment_recharge_bonus_notice: form.payment_recharge_bonus_notice,
    payment_enabled_types: form.payment_enabled_types,
    payment_load_balance_strategy: form.payment_load_balance_strategy,
    payment_product_name_prefix: form.payment_product_name_prefix,
    payment_product_name_suffix: form.payment_product_name_suffix,
    payment_help_image_url: form.payment_help_image_url,
    payment_help_text: form.payment_help_text,
    payment_cancel_rate_limit_enabled: form.payment_cancel_rate_limit_enabled,
    payment_cancel_rate_limit_max: Number(form.payment_cancel_rate_limit_max) || 10,
    payment_cancel_rate_limit_window: Number(form.payment_cancel_rate_limit_window) || 1,
    payment_cancel_rate_limit_unit: form.payment_cancel_rate_limit_unit,
    payment_cancel_rate_limit_window_mode: form.payment_cancel_rate_limit_window_mode,
    payment_alipay_force_qrcode: form.payment_alipay_force_qrcode,
    payment_alipay_mobile_precreate_deep_link: form.payment_alipay_mobile_precreate_deep_link,
    openai_low_upstream_rate_priority_enabled: form.openai_low_upstream_rate_priority_enabled,
    openai_oauth_scheduling_rate_multiplier: oauthRate === '' ? null : oauthRate,
    openai_advanced_scheduler_enabled: form.openai_advanced_scheduler_enabled,
    openai_advanced_scheduler_sticky_weighted_enabled: form.openai_advanced_scheduler_sticky_weighted_enabled,
    openai_advanced_scheduler_subscription_priority_enabled:
      form.openai_advanced_scheduler_subscription_priority_enabled,
    openai_advanced_scheduler_lb_top_k: form.openai_advanced_scheduler_lb_top_k.trim(),
    openai_advanced_scheduler_weight_priority: form.openai_advanced_scheduler_weight_priority.trim(),
    openai_advanced_scheduler_weight_load: form.openai_advanced_scheduler_weight_load.trim(),
    openai_advanced_scheduler_weight_queue: form.openai_advanced_scheduler_weight_queue.trim(),
    openai_advanced_scheduler_weight_error_rate: form.openai_advanced_scheduler_weight_error_rate.trim(),
    openai_advanced_scheduler_weight_ttft: form.openai_advanced_scheduler_weight_ttft.trim(),
    openai_advanced_scheduler_weight_reset: form.openai_advanced_scheduler_weight_reset.trim(),
    openai_advanced_scheduler_weight_quota_headroom:
      form.openai_advanced_scheduler_weight_quota_headroom.trim(),
    openai_advanced_scheduler_weight_upstream_cost:
      form.openai_advanced_scheduler_weight_upstream_cost.trim(),
    openai_advanced_scheduler_weight_previous_response:
      form.openai_advanced_scheduler_weight_previous_response.trim(),
    openai_advanced_scheduler_weight_session_sticky:
      form.openai_advanced_scheduler_weight_session_sticky.trim(),
    // 余额、订阅到期与账号限额通知
    balance_low_notify_enabled: form.balance_low_notify_enabled,
    balance_low_notify_threshold: Number(form.balance_low_notify_threshold) || 0,
    balance_low_notify_recharge_url: form.balance_low_notify_recharge_url || ctx.origin,
    subscription_expiry_notify_enabled: form.subscription_expiry_notify_enabled,
    account_quota_notify_enabled: form.account_quota_notify_enabled,
    account_quota_notify_emails: (form.account_quota_notify_emails || []).filter(
      (e) => e.email.trim() !== ''
    ),
    // Channel Monitor feature switch
    channel_monitor_enabled: form.channel_monitor_enabled,
    channel_monitor_mode: form.channel_monitor_mode === 'v1' ? 'v1' : 'v2',
    channel_monitor_default_interval_seconds: Number(form.channel_monitor_default_interval_seconds) || 60,
    channel_monitor_hide_throughput: Boolean(form.channel_monitor_hide_throughput),
    channel_monitor_show_quota: Boolean(form.channel_monitor_show_quota),
    channel_monitor_hide_user_ranking: Boolean(form.channel_monitor_hide_user_ranking),
    // Available Channels feature switch
    available_channels_enabled: form.available_channels_enabled,
    // Subscription feature switch
    subscription_enabled: form.subscription_enabled,
    // Model Plaza feature switches + description
    model_plaza_enabled: form.model_plaza_enabled,
    model_plaza_require_auth: form.model_plaza_require_auth,
    model_plaza_description: form.model_plaza_description,
    plugin_management_enabled: form.plugin_management_enabled,
    // Affiliate (邀请返利) feature switch
    affiliate_enabled: form.affiliate_enabled,
    allow_user_view_error_requests: form.allow_user_view_error_requests
  }
  if (aux.openaiFastLoaded) {
    payload.openai_fast_policy_settings = {
      rules: aux.openaiFastRules.map((rule) => {
        const whitelist = (rule.model_whitelist || []).map((p) => p.trim()).filter((p) => p !== '')
        const hasWhitelist = whitelist.length > 0
        return {
          service_tier: rule.service_tier,
          action: rule.action,
          scope: rule.scope,
          user_ids: rule.user_ids && rule.user_ids.length > 0 ? [...rule.user_ids] : undefined,
          error_message: rule.action === 'block' ? rule.error_message : undefined,
          model_whitelist: hasWhitelist ? whitelist : undefined,
          fallback_action: hasWhitelist ? rule.fallback_action || 'pass' : undefined,
          fallback_error_message:
            hasWhitelist && rule.fallback_action === 'block' ? rule.fallback_error_message : undefined
        }
      })
    } as UpdateSettingsRequest['openai_fast_policy_settings']
  }
  payload.default_platform_quotas = sanitizePlatformQuotasMap(form.default_platform_quotas)
  payload.account_scheduling_thresholds = sanitizeAccountSchedulingThresholdsMap(
    form.account_scheduling_thresholds
  )
  appendAuthSourceDefaultsToUpdateRequest(payload, aux.authSourceDefaults)
  return payload
}
