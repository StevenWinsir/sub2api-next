import { describe, expect, it } from 'vitest'
import type { SystemSettings } from '@/api/admin/settings'
import {
  buildSettingsPayload,
  defaultSettingsForm,
  draftFromSettings,
  findDuplicateLoginAgreementDocumentId,
  normalizeForwardedClientIpHeaders,
  normalizeLoginAgreementDocumentId,
  normalizeLoginAgreementDocumentsForSave,
  parseCodexEntriesToRows,
  parseTablePageSizeOptionsInput,
  prepareForSave,
  serializeCodexRowsToJSON,
  syncWeChatConnectMode,
  type LoginAgreementTitles
} from '../settingsModel'

const titles: LoginAgreementTitles = {
  terms: 'Terms',
  usage: 'Usage',
  regions: 'Regions',
  service: 'Service'
}

/** Vue 版 saveSettings 提交负载的全部键（由其源码提取，作为逐字段一致性的基线）。 */
const VUE_PAYLOAD_KEYS = [
  'account_quota_notify_emails',
  'account_quota_notify_enabled',
  'affiliate_admin_recharge_enabled',
  'affiliate_enabled',
  'affiliate_rebate_duration_days',
  'affiliate_rebate_freeze_hours',
  'affiliate_rebate_per_invitee_cap',
  'affiliate_rebate_rate',
  'aliyun_captcha_access_key_id',
  'aliyun_captcha_access_key_secret',
  'aliyun_captcha_enabled',
  'aliyun_captcha_prefix',
  'aliyun_captcha_region',
  'aliyun_captcha_scene_id',
  'allow_ungrouped_key_scheduling',
  'allow_user_view_error_requests',
  'antigravity_user_agent_version',
  'api_base_url',
  'api_key_acl_trust_forwarded_ip',
  'audit_log_retention_days',
  'available_channels_enabled',
  'backend_mode_enabled',
  'balance_low_notify_enabled',
  'balance_low_notify_recharge_url',
  'balance_low_notify_threshold',
  'channel_monitor_default_interval_seconds',
  'channel_monitor_enabled',
  'channel_monitor_hide_throughput',
  'channel_monitor_hide_user_ranking',
  'channel_monitor_mode',
  'channel_monitor_show_quota',
  'claude_code_client_version',
  'claude_code_version_auto_sync_enabled',
  'claude_oauth_system_prompt',
  'claude_oauth_system_prompt_blocks',
  'codex_cli_only_allow_app_server_clients',
  'codex_cli_only_blacklist',
  'codex_cli_only_engine_fingerprint_signals',
  'codex_cli_only_whitelist',
  'compact_home_enabled',
  'contact_info',
  'custom_endpoints',
  'custom_menu_items',
  'cyber_policy_user_allowlist',
  'cyber_session_block_enabled',
  'cyber_session_block_ttl_seconds',
  'default_balance',
  'default_concurrency',
  'default_subscriptions',
  'default_user_rpm_limit',
  'dingtalk_connect_bypass_registration',
  'dingtalk_connect_client_id',
  'dingtalk_connect_client_secret',
  'dingtalk_connect_corp_restriction_policy',
  'dingtalk_connect_enabled',
  'dingtalk_connect_internal_corp_id',
  'dingtalk_connect_redirect_url',
  'dingtalk_connect_sync_corp_email',
  'dingtalk_connect_sync_corp_email_attr_key',
  'dingtalk_connect_sync_corp_email_attr_name',
  'dingtalk_connect_sync_dept',
  'dingtalk_connect_sync_dept_attr_key',
  'dingtalk_connect_sync_dept_attr_name',
  'dingtalk_connect_sync_display_name',
  'dingtalk_connect_sync_display_name_attr_key',
  'dingtalk_connect_sync_display_name_attr_name',
  'doc_url',
  'email_verify_enabled',
  'enable_anthropic_cache_ttl_1h_injection',
  'enable_cch_signing',
  'enable_claude_oauth_system_prompt_injection',
  'enable_client_dateline_normalization',
  'enable_fingerprint_unification',
  'enable_identity_patch',
  'enable_metadata_passthrough',
  'enable_model_fallback',
  'fallback_model_anthropic',
  'fallback_model_antigravity',
  'fallback_model_gemini',
  'fallback_model_openai',
  'force_email_on_third_party_signup',
  'forwarded_client_ip_headers',
  'frontend_url',
  'github_oauth_client_id',
  'github_oauth_client_secret',
  'github_oauth_enabled',
  'github_oauth_frontend_redirect_url',
  'github_oauth_redirect_url',
  'google_oauth_client_id',
  'google_oauth_client_secret',
  'google_oauth_enabled',
  'google_oauth_frontend_redirect_url',
  'google_oauth_redirect_url',
  'grok_cross_client_model_map_enabled',
  'grok_default_base_url_mode',
  'grok_default_text_model',
  'hide_ccs_import_button',
  'home_content',
  'identity_patch_prompt',
  'invitation_code_enabled',
  'linuxdo_connect_client_id',
  'linuxdo_connect_client_secret',
  'linuxdo_connect_enabled',
  'linuxdo_connect_redirect_url',
  'login_agreement_documents',
  'login_agreement_enabled',
  'login_agreement_mode',
  'login_agreement_updated_at',
  'max_claude_code_version',
  'max_codex_version',
  'min_claude_code_version',
  'min_codex_version',
  'model_plaza_description',
  'model_plaza_enabled',
  'model_plaza_require_auth',
  'oidc_connect_allowed_signing_algs',
  'oidc_connect_authorize_url',
  'oidc_connect_client_id',
  'oidc_connect_client_secret',
  'oidc_connect_clock_skew_seconds',
  'oidc_connect_discovery_url',
  'oidc_connect_enabled',
  'oidc_connect_frontend_redirect_url',
  'oidc_connect_issuer_url',
  'oidc_connect_jwks_url',
  'oidc_connect_provider_name',
  'oidc_connect_redirect_url',
  'oidc_connect_require_email_verified',
  'oidc_connect_scopes',
  'oidc_connect_token_auth_method',
  'oidc_connect_token_url',
  'oidc_connect_use_pkce',
  'oidc_connect_userinfo_email_path',
  'oidc_connect_userinfo_id_path',
  'oidc_connect_userinfo_url',
  'oidc_connect_userinfo_username_path',
  'oidc_connect_validate_id_token',
  'openai_advanced_scheduler_enabled',
  'openai_advanced_scheduler_lb_top_k',
  'openai_advanced_scheduler_sticky_weighted_enabled',
  'openai_advanced_scheduler_subscription_priority_enabled',
  'openai_advanced_scheduler_weight_error_rate',
  'openai_advanced_scheduler_weight_load',
  'openai_advanced_scheduler_weight_previous_response',
  'openai_advanced_scheduler_weight_priority',
  'openai_advanced_scheduler_weight_queue',
  'openai_advanced_scheduler_weight_quota_headroom',
  'openai_advanced_scheduler_weight_reset',
  'openai_advanced_scheduler_weight_session_sticky',
  'openai_advanced_scheduler_weight_ttft',
  'openai_advanced_scheduler_weight_upstream_cost',
  'openai_codex_client_version',
  'openai_codex_user_agent',
  'openai_codex_version_auto_sync_enabled',
  'openai_low_upstream_rate_priority_enabled',
  'openai_oauth_scheduling_rate_multiplier',
  'openai_ttft_mode',
  'passkey_enabled',
  'password_reset_enabled',
  'payment_alipay_force_qrcode',
  'payment_alipay_mobile_precreate_deep_link',
  'payment_balance_disabled',
  'payment_balance_recharge_multiplier',
  'payment_cancel_rate_limit_enabled',
  'payment_cancel_rate_limit_max',
  'payment_cancel_rate_limit_unit',
  'payment_cancel_rate_limit_window',
  'payment_cancel_rate_limit_window_mode',
  'payment_daily_limit',
  'payment_enabled',
  'payment_enabled_types',
  'payment_help_image_url',
  'payment_help_text',
  'payment_load_balance_strategy',
  'payment_max_amount',
  'payment_max_pending_orders',
  'payment_min_amount',
  'payment_order_timeout_minutes',
  'payment_product_name_prefix',
  'payment_product_name_suffix',
  'payment_recharge_bonus_mode',
  'payment_recharge_bonus_notice',
  'payment_recharge_bonus_tiers',
  'payment_recharge_fee_rate',
  'payment_subscription_usd_to_cny_rate',
  'plugin_management_enabled',
  'promo_code_enabled',
  'registration_email_domain_quota_enabled',
  'registration_email_suffix_whitelist',
  'registration_enabled',
  'rewrite_message_cache_control',
  'risk_control_enabled',
  'session_binding_enabled',
  'site_logo',
  'site_name',
  'site_subtitle',
  'smtp_from_email',
  'smtp_from_name',
  'smtp_host',
  'smtp_password',
  'smtp_port',
  'smtp_use_tls',
  'smtp_username',
  'step_up_enabled',
  'subscription_enabled',
  'subscription_expiry_notify_enabled',
  'table_default_page_size',
  'table_page_size_options',
  'tencent_captcha_app_id',
  'tencent_captcha_app_secret_key',
  'tencent_captcha_cloud_secret_id',
  'tencent_captcha_cloud_secret_key',
  'tencent_captcha_enabled',
  'tencent_captcha_region',
  'totp_enabled',
  'turnstile_enabled',
  'turnstile_secret_key',
  'turnstile_site_key',
  'wechat_connect_app_id',
  'wechat_connect_app_secret',
  'wechat_connect_enabled',
  'wechat_connect_frontend_redirect_url',
  'wechat_connect_mobile_app_id',
  'wechat_connect_mobile_app_secret',
  'wechat_connect_mobile_enabled',
  'wechat_connect_mode',
  'wechat_connect_mp_app_id',
  'wechat_connect_mp_app_secret',
  'wechat_connect_mp_enabled',
  'wechat_connect_open_app_id',
  'wechat_connect_open_app_secret',
  'wechat_connect_open_enabled',
  'wechat_connect_redirect_url',
  'wechat_connect_scopes'
]

function serverSettings(over: Partial<SystemSettings> = {}): SystemSettings {
  return { ...(defaultSettingsForm(titles) as unknown as SystemSettings), ...over }
}

describe('settings payload parity with the Vue view', () => {
  it('emits exactly the Vue payload key set (plus the 3 map/policy fields added after)', () => {
    const draft = draftFromSettings(serverSettings(), titles)
    const prepared = prepareForSave(draft)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    const payload = buildSettingsPayload(prepared.draft, { origin: 'https://x.test' })
    const keys = new Set(Object.keys(payload))
    const expected = new Set([
      ...VUE_PAYLOAD_KEYS,
      'default_platform_quotas',
      'account_scheduling_thresholds'
    ])
    const missing = [...expected].filter((k) => !keys.has(k))
    expect(missing).toEqual([])
    const extra = [...keys].filter(
      (k) =>
        !expected.has(k) &&
        !k.startsWith('auth_source_defaults') &&
        !k.endsWith('_defaults') &&
        k !== 'openai_fast_policy_settings'
    )
    expect(extra.filter((k) => !/^(auth_source|default_)/.test(k))).toEqual([])
  })

  it('does not send blank secrets (kept as undefined so the backend preserves them)', () => {
    const draft = draftFromSettings(serverSettings(), titles)
    const prepared = prepareForSave(draft)
    if (!prepared.ok) throw new Error('unexpected')
    const p = buildSettingsPayload(prepared.draft, { origin: 'o' })
    for (const k of [
      'smtp_password',
      'turnstile_secret_key',
      'linuxdo_connect_client_secret',
      'oidc_connect_client_secret',
      'github_oauth_client_secret',
      'google_oauth_client_secret',
      'wechat_connect_open_app_secret'
    ] as const) {
      expect(p[k]).toBeUndefined()
    }
  })

  it('sends a typed secret only when entered', () => {
    const draft = draftFromSettings(serverSettings(), titles)
    draft.form.smtp_password = 'p@ss'
    const prepared = prepareForSave(draft)
    if (!prepared.ok) throw new Error('unexpected')
    expect(buildSettingsPayload(prepared.draft, { origin: 'o' }).smtp_password).toBe('p@ss')
  })

  it('omits openai_fast_policy_settings unless it was loaded from the server', () => {
    const noFast = prepareForSave(draftFromSettings(serverSettings(), titles))
    if (!noFast.ok) throw new Error('unexpected')
    expect('openai_fast_policy_settings' in buildSettingsPayload(noFast.draft, { origin: 'o' })).toBe(false)
    const withFast = draftFromSettings(
      serverSettings({
        openai_fast_policy_settings: {
          rules: [
            {
              service_tier: 'fast',
              action: 'block',
              scope: 'all',
              error_message: 'no',
              model_whitelist: [' gpt-5 ', ''],
              fallback_action: 'block',
              fallback_error_message: 'fb'
            }
          ]
        } as never
      }),
      titles
    )
    const prepared = prepareForSave(withFast)
    if (!prepared.ok) throw new Error('unexpected')
    const rules = buildSettingsPayload(prepared.draft, { origin: 'o' }).openai_fast_policy_settings
      ?.rules as unknown as Array<Record<string, unknown>>
    expect(rules[0]).toMatchObject({
      error_message: 'no',
      model_whitelist: ['gpt-5'],
      fallback_action: 'block',
      fallback_error_message: 'fb'
    })
  })

  it('defaults the balance-notify recharge url to the current origin', () => {
    const prepared = prepareForSave(
      draftFromSettings(serverSettings({ balance_low_notify_recharge_url: '' }), titles)
    )
    if (!prepared.ok) throw new Error('unexpected')
    expect(
      buildSettingsPayload(prepared.draft, { origin: 'https://site.test' }).balance_low_notify_recharge_url
    ).toBe('https://site.test')
  })

  it('suffix whitelist is submitted with @ / *. prefixes', () => {
    const draft = draftFromSettings(
      serverSettings({ registration_email_suffix_whitelist: ['@example.com', '*.edu'] }),
      titles
    )
    const prepared = prepareForSave(draft)
    if (!prepared.ok) throw new Error('unexpected')
    const list = buildSettingsPayload(prepared.draft, { origin: 'o' })
      .registration_email_suffix_whitelist as string[]
    expect(list.every((s) => s.startsWith('@') || s.startsWith('*.'))).toBe(true)
  })
})

describe('prepareForSave validation (same order as the Vue view)', () => {
  const base = () => draftFromSettings(serverSettings(), titles)
  it('page size bounds / options format', () => {
    const d = base()
    d.form.table_default_page_size = 3
    expect(prepareForSave(d)).toMatchObject({ ok: false, error: { key: 'tableDefaultPageSizeRange' } })
    const e = base()
    e.aux.tablePageSizeInput = '10, x'
    expect(prepareForSave(e)).toMatchObject({ ok: false, error: { key: 'tablePageSizeOptionsFormat' } })
  })
  it('login agreement rules', () => {
    const d = base()
    d.form.login_agreement_enabled = true
    d.form.login_agreement_documents = [{ id: '', title: '', content_md: '' }]
    expect(prepareForSave(d)).toMatchObject({ ok: false, error: { key: 'agreementNeedsDocument' } })
    const e = base()
    e.form.login_agreement_documents = [{ id: 'a', title: '', content_md: 'body' }]
    expect(prepareForSave(e)).toMatchObject({ ok: false, error: { key: 'agreementTitleRequired' } })
    const f = base()
    f.form.login_agreement_documents = [
      { id: 'a', title: 'A', content_md: '' },
      { id: 'A', title: 'B', content_md: '' }
    ]
    expect(prepareForSave(f)).toMatchObject({
      ok: false,
      error: { key: 'agreementDuplicateRoute', params: { id: 'a' } }
    })
  })
  it('duplicate default subscription groups; WeChat mp+mobile conflict; invalid oauth rate', () => {
    const d = base()
    d.form.default_subscriptions = [
      { group_id: 1, validity_days: 30 },
      { group_id: 1, validity_days: 7 }
    ]
    expect(prepareForSave(d)).toMatchObject({ ok: false, error: { key: 'defaultSubscriptionsDuplicate' } })
    const e = base()
    e.form.wechat_connect_mp_enabled = true
    e.form.wechat_connect_mobile_enabled = true
    expect(prepareForSave(e)).toMatchObject({ ok: false, error: { key: 'wechatMpMobileConflict' } })
    const f = base()
    f.form.openai_oauth_scheduling_rate_multiplier = -1
    expect(prepareForSave(f)).toMatchObject({ ok: false, error: { key: 'oauthRateInvalid' } })
  })
  it('invalid optional URLs are cleared instead of failing', () => {
    const d = base()
    d.form.frontend_url = 'javascript:alert(1)'
    d.form.doc_url = 'https://ok.test/docs'
    const r = prepareForSave(d)
    expect(r.ok && r.draft.form.frontend_url).toBe('')
    expect(r.ok && r.draft.form.doc_url).toBe('https://ok.test/docs')
  })
})

describe('helpers', () => {
  it('agreement document ids', () => {
    expect(normalizeLoginAgreementDocumentId('  My Doc__X! ')).toBe('my-doc-x')
    expect(
      normalizeLoginAgreementDocumentsForSave([
        { id: '', title: ' T ', content_md: ' c ' },
        { id: '', title: '', content_md: '' }
      ])
    ).toEqual([{ id: 't', title: 'T', content_md: 'c' }])
    expect(
      findDuplicateLoginAgreementDocumentId([
        { id: 'a', title: '', content_md: '' },
        { id: 'a', title: '', content_md: '' }
      ])
    ).toBe('a')
  })
  it('page size options parse', () => {
    expect(parseTablePageSizeOptionsInput('50, 10,20,10')).toEqual([10, 20, 50])
    expect(parseTablePageSizeOptionsInput('')).toBeNull()
    expect(parseTablePageSizeOptionsInput('4')).toBeNull()
    expect(parseTablePageSizeOptionsInput('1001')).toBeNull()
  })
  it('forwarded client ip headers are canonicalized and capped', () => {
    expect(normalizeForwardedClientIpHeaders(['x-real-ip', 'X-REAL-IP', 'bad header', 5])).toEqual([
      'X-Real-Ip'
    ])
    expect(normalizeForwardedClientIpHeaders(Array.from({ length: 30 }, (_, i) => `h${i}`))).toHaveLength(16)
  })
  it('codex rows round-trip and drop empty entries', () => {
    const rows = parseCodexEntriesToRows(
      '[{"originator":"cli","ua_contains":["a","b"],"skip_engine_fingerprint":true}]'
    )
    expect(rows).toEqual([{ originator: 'cli', uaContains: 'a, b', skipEngineFingerprint: true }])
    expect(serializeCodexRowsToJSON(rows)).toBe(
      '[{"originator":"cli","ua_contains":["a","b"],"skip_engine_fingerprint":true}]'
    )
    expect(serializeCodexRowsToJSON([{ originator: '', uaContains: '', skipEngineFingerprint: false }])).toBe(
      ''
    )
  })
  it('wechat mp / mobile mutual exclusion honours the preferred mode', () => {
    const f = {
      ...defaultSettingsForm(titles),
      wechat_connect_mp_enabled: true,
      wechat_connect_mobile_enabled: true
    }
    expect(syncWeChatConnectMode(f, 'mobile').wechat_connect_mp_enabled).toBe(false)
    expect(syncWeChatConnectMode(f).wechat_connect_mobile_enabled).toBe(false)
  })
})
