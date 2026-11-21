/**
 * 系统设置的声明式字段表（标签 / 提示沿用 Vue 版的 admin.settings.* 语言包键；
 * 没有现成键的字段使用 adminUi.settings.f.<name>）。复杂编辑器（数组 / 对象 / 行表）在 SettingsPage 中以自定义块出现。
 */
export type SettingsTab =
  'general' | 'agreement' | 'features' | 'security' | 'users' | 'gateway' | 'payment' | 'email' | 'backup'
export const SETTINGS_TABS: SettingsTab[] = [
  'general',
  'agreement',
  'features',
  'security',
  'users',
  'gateway',
  'payment',
  'email',
  'backup'
]

export type FieldKind = 'bool' | 'text' | 'number' | 'secret' | 'textarea' | 'select' | 'url'
export interface FieldOption {
  value: string
  /** 语言包键 */
  label: string
}
export interface FieldSpec {
  name: string
  kind: FieldKind
  /** 语言包键（完整路径）；省略则使用 adminUi.settings.f.<name> */
  label?: string
  hint?: string
  placeholder?: string
  options?: FieldOption[]
  mono?: boolean
  /** 数字步长 */
  step?: string
  /** 密钥已配置标记字段名（<name>_configured） */
  configured?: string
  /** 仅当条件成立时显示：[字段名, 期望值] */
  showIf?: [string, unknown]
}
export interface CardSpec {
  id: string
  /** 标题键 */
  title?: string
  description?: string
  fields: FieldSpec[]
  /** 此卡片之后渲染的自定义块 */
  custom?: string[]
}

const S = 'admin.settings.'
const f = (
  name: string,
  kind: FieldKind,
  label?: string,
  hint?: string,
  extra: Partial<FieldSpec> = {}
): FieldSpec => ({
  name,
  kind,
  label: label ? (label.includes('.') && !label.startsWith('adminUi') ? S + label : label) : undefined,
  hint: hint ? S + hint : undefined,
  ...extra
})
const secret = (name: string, label: string, hint?: string): FieldSpec =>
  f(name, 'secret', label, hint, { configured: `${name}_configured`, mono: true })
const u = (name: string, kind: FieldKind, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  name,
  kind,
  ...extra
})

const oauth = (prefix: string, title: string): FieldSpec[] =>
  [
    u(`${prefix}_enabled`, 'bool'),
    u(`${prefix}_client_id`, 'text', { mono: true }),
    {
      ...u(`${prefix}_client_secret`, 'secret', { mono: true }),
      configured: `${prefix}_client_secret_configured`
    },
    u(`${prefix}_redirect_url`, 'url', { mono: true }),
    u(`${prefix}_frontend_redirect_url`, 'url', { mono: true })
  ].map((x) => (x.name.endsWith('_enabled') ? { ...x, label: `adminUi.settings.oauthEnable.${title}` } : x))

export const SETTINGS_SPEC: Record<Exclude<SettingsTab, 'backup'>, CardSpec[]> = {
  general: [
    {
      id: 'site',
      title: S + 'site.title',
      description: S + 'site.description',
      fields: [
        f('site_name', 'text', 'site.siteName', 'site.siteNameHint'),
        f('site_subtitle', 'text', 'site.siteSubtitle', 'site.siteSubtitleHint'),
        f('site_logo', 'text', 'site.siteLogo', 'site.logoHint', { mono: true }),
        f('api_base_url', 'url', 'site.apiBaseUrl', 'site.apiBaseUrlHint', { mono: true }),
        f('contact_info', 'text', 'site.contactInfo', 'site.contactInfoHint'),
        f('doc_url', 'url', 'site.docUrl', 'site.docUrlHint', { mono: true }),
        f('frontend_url', 'url', 'registration.frontendUrl', 'registration.frontendUrlHint', {
          mono: true,
          placeholder: S + 'registration.frontendUrlPlaceholder'
        }),
        f('home_content', 'textarea', 'site.homeContent', 'site.homeContentHint', { mono: true }),
        f('compact_home_enabled', 'bool', 'site.compactHome', 'site.compactHomeHint'),
        f('hide_ccs_import_button', 'bool', 'site.hideCcsImportButton', 'site.hideCcsImportButtonHint'),
        f('backend_mode_enabled', 'bool', 'site.backendMode', 'site.backendModeDescription'),
        f('table_default_page_size', 'number', 'site.tableDefaultPageSize', 'site.tableDefaultPageSizeHint')
      ],
      custom: ['tablePageSizeOptions']
    },
    {
      id: 'customMenu',
      title: S + 'customMenu.title',
      description: S + 'customMenu.description',
      fields: [],
      custom: ['customMenu']
    },
    {
      id: 'customEndpoints',
      title: S + 'site.customEndpoints.title',
      description: S + 'site.customEndpoints.description',
      fields: [],
      custom: ['customEndpoints']
    }
  ],
  agreement: [
    {
      id: 'agreement',
      title: 'adminUi.settings.agreement.title',
      description: 'adminUi.settings.agreement.description',
      fields: [
        u('login_agreement_enabled', 'bool'),
        u('login_agreement_mode', 'select', {
          options: [
            { value: 'modal', label: 'adminUi.settings.agreement.modeModal' },
            { value: 'checkbox', label: 'adminUi.settings.agreement.modeCheckbox' }
          ]
        }),
        u('login_agreement_updated_at', 'text', { mono: true })
      ],
      custom: ['agreementDocs']
    }
  ],
  features: [
    { id: 'billing', title: S + 'features.siteBillingMode.title', fields: [], custom: ['billingMode'] },
    {
      id: 'channelMonitor',
      title: S + 'features.channelMonitor.title',
      description: S + 'features.channelMonitor.description',
      fields: [
        f(
          'channel_monitor_enabled',
          'bool',
          'features.channelMonitor.enabled',
          'features.channelMonitor.enabledHint'
        ),
        f('channel_monitor_mode', 'select', 'features.channelMonitor.mode', undefined, {
          options: [
            { value: 'v1', label: S + 'features.channelMonitor.modeV1' },
            { value: 'v2', label: S + 'features.channelMonitor.modeV2' }
          ]
        }),
        f(
          'channel_monitor_default_interval_seconds',
          'number',
          'features.channelMonitor.defaultInterval',
          'features.channelMonitor.defaultIntervalHint'
        ),
        f(
          'channel_monitor_hide_throughput',
          'bool',
          'features.channelMonitor.hideThroughput',
          'features.channelMonitor.hideThroughputHint'
        ),
        f(
          'channel_monitor_hide_user_ranking',
          'bool',
          'features.channelMonitor.hideUserRanking',
          'features.channelMonitor.hideUserRankingHint'
        ),
        f(
          'channel_monitor_show_quota',
          'bool',
          'features.channelMonitor.showQuota',
          'features.channelMonitor.showQuotaHint'
        )
      ]
    },
    {
      id: 'availableChannels',
      title: S + 'features.availableChannels.title',
      fields: [
        f(
          'available_channels_enabled',
          'bool',
          'features.availableChannels.enabled',
          'features.availableChannels.enabledHint'
        )
      ]
    },
    {
      id: 'modelPlaza',
      title: S + 'features.modelPlaza.title',
      fields: [
        f('model_plaza_enabled', 'bool', 'features.modelPlaza.enabled', 'features.modelPlaza.enabledHint'),
        f(
          'model_plaza_require_auth',
          'bool',
          'features.modelPlaza.requireAuth',
          'features.modelPlaza.requireAuthHint'
        ),
        f(
          'model_plaza_description',
          'textarea',
          'features.modelPlaza.priceDescription',
          'features.modelPlaza.priceDescriptionHint'
        )
      ]
    },
    {
      id: 'plugins',
      title: S + 'features.pluginManagement.title',
      fields: [
        f(
          'plugin_management_enabled',
          'bool',
          'features.pluginManagement.enabled',
          'features.pluginManagement.enabledHint'
        )
      ]
    },
    {
      id: 'riskControl',
      title: S + 'features.riskControl.title',
      fields: [
        f('risk_control_enabled', 'bool', 'features.riskControl.enabled', 'features.riskControl.enabledHint'),
        f(
          'cyber_session_block_enabled',
          'bool',
          'features.riskControl.cyberSessionBlock',
          'features.riskControl.cyberSessionBlockHint'
        ),
        f('cyber_session_block_ttl_seconds', 'number', 'features.riskControl.cyberSessionBlockTTL')
      ],
      custom: ['cyberAllowlist']
    },
    {
      id: 'affiliate',
      title: S + 'features.affiliate.title',
      fields: [
        f('affiliate_enabled', 'bool', 'features.affiliate.enabled', 'features.affiliate.enabledHint'),
        f(
          'affiliate_admin_recharge_enabled',
          'bool',
          'features.affiliate.adminRechargeRebate',
          'features.affiliate.adminRechargeRebateHint'
        ),
        f(
          'affiliate_rebate_rate',
          'number',
          'features.affiliate.rebateRate',
          'features.affiliate.rebateRateHint',
          { step: '0.01' }
        ),
        f('affiliate_rebate_freeze_hours', 'number', 'features.affiliate.freezeHours'),
        f('affiliate_rebate_duration_days', 'number', 'features.affiliate.durationDays'),
        f('affiliate_rebate_per_invitee_cap', 'number', 'features.affiliate.perInviteeCap', undefined, {
          step: '0.01'
        })
      ]
    },
    {
      id: 'usageRecords',
      title: S + 'usageRecords.title',
      description: S + 'usageRecords.description',
      fields: [
        f('allow_user_view_error_requests', 'bool', 'user_error_view.label', 'user_error_view.description')
      ]
    }
  ],
  security: [
    {
      id: 'adminKeys',
      title: S + 'adminApiKey.title',
      description: S + 'adminApiKey.description',
      fields: [],
      custom: ['adminApiKey', 'adminAccessKeys']
    },
    {
      id: 'registration',
      title: S + 'registration.title',
      description: S + 'registration.description',
      fields: [
        f(
          'registration_enabled',
          'bool',
          'registration.enableRegistration',
          'registration.enableRegistrationHint'
        ),
        f(
          'email_verify_enabled',
          'bool',
          'registration.emailVerification',
          'registration.emailVerificationHint'
        ),
        f(
          'registration_email_domain_quota_enabled',
          'bool',
          'registration.emailDomainQuota',
          'registration.emailDomainQuotaHint'
        ),
        f('promo_code_enabled', 'bool', 'registration.promoCode', 'registration.promoCodeHint'),
        f(
          'invitation_code_enabled',
          'bool',
          'registration.invitationCode',
          'registration.invitationCodeHint'
        ),
        f('password_reset_enabled', 'bool', 'registration.passwordReset', 'registration.passwordResetHint'),
        f('totp_enabled', 'bool', 'registration.totp', 'registration.totpHint'),
        f('passkey_enabled', 'bool', 'security.passkey', 'security.passkeyHint'),
        f('step_up_enabled', 'bool', 'security.stepUp', 'security.stepUpHint'),
        f('session_binding_enabled', 'bool', 'security.sessionBinding', 'security.sessionBindingHint'),
        f('audit_log_retention_days', 'number', 'security.auditRetention', 'security.auditRetentionHint')
      ],
      custom: ['emailSuffixWhitelist', 'emailBlacklist']
    },
    {
      id: 'apiKeyAcl',
      title: S + 'apiKeyAcl.title',
      description: S + 'apiKeyAcl.description',
      fields: [
        f(
          'api_key_acl_trust_forwarded_ip',
          'bool',
          'apiKeyAcl.trustForwardedIp',
          'apiKeyAcl.trustForwardedIpHint'
        )
      ],
      custom: ['forwardedHeaders']
    },
    {
      id: 'panelRate',
      title: S + 'panelRateLimit.title',
      description: S + 'panelRateLimit.description',
      fields: [],
      custom: ['svc:panelRateLimit']
    },
    {
      id: 'captcha',
      title: S + 'captcha.title',
      description: S + 'captcha.description',
      fields: [],
      custom: ['captcha']
    },
    {
      id: 'linuxdo',
      title: S + 'linuxdo.title',
      description: S + 'linuxdo.description',
      fields: [
        f('linuxdo_connect_enabled', 'bool', 'linuxdo.enable', 'linuxdo.enableHint'),
        f('linuxdo_connect_client_id', 'text', 'linuxdo.clientId', 'linuxdo.clientIdHint', { mono: true }),
        { ...secret('linuxdo_connect_client_secret', 'linuxdo.clientSecret', 'linuxdo.clientSecretHint') },
        f('linuxdo_connect_redirect_url', 'url', 'linuxdo.redirectUrl', 'linuxdo.redirectUrlHint', {
          mono: true
        })
      ]
    },
    {
      id: 'github',
      title: 'adminUi.settings.oauthTitle.github',
      fields: oauth('github_oauth', 'github')
    },
    {
      id: 'google',
      title: 'adminUi.settings.oauthTitle.google',
      fields: oauth('google_oauth', 'google')
    },
    {
      id: 'wechat',
      title: S + 'wechatConnect.title',
      description: S + 'wechatConnect.description',
      fields: [],
      custom: ['wechat']
    },
    {
      id: 'dingtalk',
      title: S + 'dingtalk.title',
      description: S + 'dingtalk.description',
      fields: [
        f('dingtalk_connect_enabled', 'bool', 'dingtalk.enable', 'dingtalk.enableHint'),
        f('dingtalk_connect_client_id', 'text', 'dingtalk.clientId', 'dingtalk.clientIdHint', { mono: true }),
        secret('dingtalk_connect_client_secret', 'dingtalk.clientSecret', 'dingtalk.clientSecretHint'),
        f('dingtalk_connect_redirect_url', 'url', 'dingtalk.redirectUrl', 'dingtalk.redirectUrlHint', {
          mono: true
        }),
        f(
          'dingtalk_connect_corp_restriction_policy',
          'select',
          'dingtalk.corpPolicy.label',
          'dingtalk.corpPolicy.hint',
          {
            options: [
              { value: 'none', label: S + 'dingtalk.corpPolicy.none' },
              { value: 'internal_only', label: S + 'dingtalk.corpPolicy.internalOnly' }
            ]
          }
        ),
        u('dingtalk_connect_internal_corp_id', 'text', {
          mono: true,
          showIf: ['dingtalk_connect_corp_restriction_policy', 'internal_only']
        }),
        f(
          'dingtalk_connect_bypass_registration',
          'bool',
          'dingtalk.bypassRegistration',
          'dingtalk.bypassRegistrationHint'
        ),
        f(
          'dingtalk_connect_sync_display_name',
          'bool',
          'dingtalk.syncDisplayName',
          'dingtalk.syncDisplayNameHint'
        ),
        f(
          'dingtalk_connect_sync_display_name_attr_key',
          'text',
          'dingtalk.syncDisplayNameTarget',
          'dingtalk.syncDisplayNameTargetHint',
          { mono: true, showIf: ['dingtalk_connect_sync_display_name', true] }
        ),
        f('dingtalk_connect_sync_display_name_attr_name', 'text', 'dingtalk.syncAttrDisplayName', undefined, {
          showIf: ['dingtalk_connect_sync_display_name', true]
        }),
        f(
          'dingtalk_connect_sync_corp_email',
          'bool',
          'dingtalk.syncCorpEmail',
          'dingtalk.syncCorpEmailPermissionHint'
        ),
        f(
          'dingtalk_connect_sync_corp_email_attr_key',
          'text',
          'dingtalk.syncCorpEmailTarget',
          'dingtalk.syncCorpEmailTargetHint',
          { mono: true, showIf: ['dingtalk_connect_sync_corp_email', true] }
        ),
        f('dingtalk_connect_sync_corp_email_attr_name', 'text', 'dingtalk.syncAttrDisplayName', undefined, {
          showIf: ['dingtalk_connect_sync_corp_email', true]
        }),
        f('dingtalk_connect_sync_dept', 'bool', 'dingtalk.syncDept', 'dingtalk.syncDeptPermissionHint'),
        f(
          'dingtalk_connect_sync_dept_attr_key',
          'text',
          'dingtalk.syncDeptTarget',
          'dingtalk.syncDeptTargetHint',
          { mono: true, showIf: ['dingtalk_connect_sync_dept', true] }
        ),
        f('dingtalk_connect_sync_dept_attr_name', 'text', 'dingtalk.syncAttrDisplayName', undefined, {
          showIf: ['dingtalk_connect_sync_dept', true]
        })
      ]
    },
    {
      id: 'oidc',
      title: S + 'oidc.title',
      description: S + 'oidc.description',
      fields: [
        f('oidc_connect_enabled', 'bool', 'oidc.enable', 'oidc.enableHint'),
        f('oidc_connect_provider_name', 'text', 'oidc.providerName'),
        f('oidc_connect_client_id', 'text', 'oidc.clientId', undefined, { mono: true }),
        secret('oidc_connect_client_secret', 'oidc.clientSecret', 'oidc.clientSecretHint'),
        f('oidc_connect_issuer_url', 'url', 'oidc.issuerUrl', undefined, { mono: true }),
        f('oidc_connect_discovery_url', 'url', 'oidc.discoveryUrl', undefined, { mono: true }),
        f('oidc_connect_authorize_url', 'url', 'oidc.authorizeUrl', undefined, { mono: true }),
        f('oidc_connect_token_url', 'url', 'oidc.tokenUrl', undefined, { mono: true }),
        f('oidc_connect_userinfo_url', 'url', 'oidc.userinfoUrl', undefined, { mono: true }),
        f('oidc_connect_jwks_url', 'url', 'oidc.jwksUrl', undefined, { mono: true }),
        f('oidc_connect_scopes', 'text', 'oidc.scopes', 'oidc.scopesHint', { mono: true }),
        f('oidc_connect_redirect_url', 'url', 'oidc.redirectUrl', undefined, { mono: true }),
        f(
          'oidc_connect_frontend_redirect_url',
          'text',
          'oidc.frontendRedirectUrl',
          'oidc.frontendRedirectUrlHint',
          { mono: true }
        ),
        f('oidc_connect_token_auth_method', 'select', 'oidc.tokenAuthMethod', undefined, {
          options: ['client_secret_post', 'client_secret_basic', 'none'].map((v) => ({
            value: v,
            label: `adminUi.settings.oidcAuthMethod.${v}`
          }))
        }),
        f('oidc_connect_allowed_signing_algs', 'text', 'oidc.allowedSigningAlgs', undefined, { mono: true }),
        f('oidc_connect_clock_skew_seconds', 'number', 'oidc.clockSkewSeconds'),
        f('oidc_connect_use_pkce', 'bool', 'oidc.usePkce'),
        f('oidc_connect_validate_id_token', 'bool', 'oidc.validateIdToken'),
        f('oidc_connect_require_email_verified', 'bool', 'oidc.requireEmailVerified'),
        f('oidc_connect_userinfo_email_path', 'text', 'oidc.userinfoEmailPath', undefined, { mono: true }),
        f('oidc_connect_userinfo_id_path', 'text', 'oidc.userinfoIdPath', undefined, { mono: true }),
        f('oidc_connect_userinfo_username_path', 'text', 'oidc.userinfoUsernamePath', undefined, {
          mono: true
        })
      ]
    }
  ],
  users: [
    {
      id: 'defaults',
      title: S + 'defaults.title',
      description: S + 'defaults.description',
      fields: [
        f('default_balance', 'number', 'defaults.defaultBalance', 'defaults.defaultBalanceHint', {
          step: '0.01'
        }),
        f('default_concurrency', 'number', 'defaults.defaultConcurrency', 'defaults.defaultConcurrencyHint'),
        f(
          'default_user_rpm_limit',
          'number',
          'defaults.defaultUserRpmLimit',
          'defaults.defaultUserRpmLimitHint'
        )
      ],
      custom: ['defaultSubscriptions', 'platformQuotas', 'schedulingThresholds']
    },
    {
      id: 'authSourceDefaults',
      title: S + 'authSourceDefaults.title',
      description: S + 'authSourceDefaults.description',
      fields: [
        f(
          'force_email_on_third_party_signup',
          'bool',
          'authSourceDefaults.requireEmailLabel',
          'authSourceDefaults.requireEmailHint'
        )
      ],
      custom: ['authSourceDefaults']
    }
  ],
  gateway: [
    {
      id: 'overload',
      title: S + 'overloadCooldown.title',
      description: S + 'overloadCooldown.description',
      fields: [],
      custom: ['svc:overloadCooldown']
    },
    {
      id: 'rl429',
      title: S + 'rateLimit429Cooldown.title',
      description: S + 'rateLimit429Cooldown.description',
      fields: [],
      custom: ['svc:rateLimit429']
    },
    {
      id: 'streamTimeout',
      title: S + 'streamTimeout.title',
      description: S + 'streamTimeout.description',
      fields: [],
      custom: ['svc:streamTimeout']
    },
    {
      id: 'rectifier',
      title: S + 'rectifier.title',
      description: S + 'rectifier.description',
      fields: [],
      custom: ['svc:rectifier']
    },
    {
      id: 'beta',
      title: S + 'betaPolicy.title',
      description: S + 'betaPolicy.description',
      fields: [],
      custom: ['betaPolicy']
    },
    {
      id: 'fast',
      title: S + 'openaiFastPolicy.title',
      description: S + 'openaiFastPolicy.description',
      fields: [],
      custom: ['openaiFastPolicy']
    },
    {
      id: 'claudeCode',
      title: S + 'claudeCode.title',
      description: S + 'claudeCode.description',
      fields: [
        f('min_claude_code_version', 'text', 'claudeCode.minVersion', 'claudeCode.minVersionHint', {
          mono: true,
          placeholder: S + 'claudeCode.minVersionPlaceholder'
        }),
        f('max_claude_code_version', 'text', 'claudeCode.maxVersion', 'claudeCode.maxVersionHint', {
          mono: true,
          placeholder: S + 'claudeCode.maxVersionPlaceholder'
        })
      ]
    },
    {
      id: 'codex',
      title: S + 'gatewayForwarding.codexHardeningTitle',
      fields: [
        f('min_codex_version', 'text', 'gatewayForwarding.minCodexVersion', undefined, { mono: true }),
        f(
          'max_codex_version',
          'text',
          'gatewayForwarding.maxCodexVersion',
          'gatewayForwarding.codexVersionHint',
          { mono: true }
        ),
        f('codex_cli_only_allow_app_server_clients', 'bool', 'gatewayForwarding.codexAllowAppServer')
      ],
      custom: ['codexRows']
    },
    {
      id: 'billingProbe',
      title: S + 'upstreamBillingProbe.title',
      description: S + 'upstreamBillingProbe.description',
      fields: [],
      custom: ['svc:billingProbe']
    },
    {
      id: 'ollama',
      title: S + 'ollamaCloudUsage.title',
      description: S + 'ollamaCloudUsage.description',
      fields: [],
      custom: ['svc:ollamaUsage']
    },
    {
      id: 'opencode',
      title: S + 'opencodeGoUsage.title',
      description: S + 'opencodeGoUsage.description',
      fields: [],
      custom: ['svc:opencodeUsage']
    },
    {
      id: 'scheduling',
      title: S + 'scheduling.title',
      description: S + 'scheduling.description',
      fields: [
        f(
          'allow_ungrouped_key_scheduling',
          'bool',
          'scheduling.allowUngroupedKey',
          'scheduling.allowUngroupedKeyHint'
        ),
        f(
          'openai_low_upstream_rate_priority_enabled',
          'bool',
          'openaiExperimentalScheduler.lowRatePriorityTitle',
          'openaiExperimentalScheduler.lowRatePriorityDescription'
        ),
        f(
          'openai_oauth_scheduling_rate_multiplier',
          'number',
          'openaiExperimentalScheduler.oauthRateTitle',
          'openaiExperimentalScheduler.oauthRatePriorityDescription',
          { step: '0.01' }
        ),
        f(
          'openai_advanced_scheduler_enabled',
          'bool',
          'openaiExperimentalScheduler.title',
          'openaiExperimentalScheduler.description'
        ),
        f(
          'openai_advanced_scheduler_sticky_weighted_enabled',
          'bool',
          'openaiExperimentalScheduler.stickyWeightedTitle',
          'openaiExperimentalScheduler.stickyWeightedDescription'
        ),
        f(
          'openai_advanced_scheduler_subscription_priority_enabled',
          'bool',
          'openaiExperimentalScheduler.subscriptionPriorityTitle',
          'openaiExperimentalScheduler.subscriptionPriorityDescription'
        ),
        ...[
          'lb_top_k',
          'weight_priority',
          'weight_load',
          'weight_queue',
          'weight_error_rate',
          'weight_ttft',
          'weight_reset',
          'weight_quota_headroom',
          'weight_upstream_cost',
          'weight_previous_response',
          'weight_session_sticky'
        ].map((k) =>
          u(`openai_advanced_scheduler_${k}`, 'text', {
            mono: true,
            showIf: ['openai_advanced_scheduler_enabled', true]
          })
        )
      ]
    },
    {
      id: 'forwarding',
      title: S + 'gatewayForwarding.title',
      description: S + 'gatewayForwarding.description',
      fields: [
        f(
          'grok_default_text_model',
          'text',
          'gatewayForwarding.grokDefaultTextModel',
          'gatewayForwarding.grokDefaultTextModelHint',
          { mono: true }
        ),
        f(
          'grok_cross_client_model_map_enabled',
          'bool',
          'gatewayForwarding.grokCrossClientMap',
          'gatewayForwarding.grokCrossClientMapHint'
        ),
        f(
          'grok_default_base_url_mode',
          'select',
          'gatewayForwarding.grokDefaultBaseURLMode',
          'gatewayForwarding.grokDefaultBaseURLModeHint',
          {
            options: ['cli', 'api'].map((v) => ({ value: v, label: `adminUi.settings.grokBaseUrlMode.${v}` }))
          }
        ),
        f(
          'openai_ttft_mode',
          'select',
          'gatewayForwarding.openaiTTFTMode',
          'gatewayForwarding.openaiTTFTModeHint',
          {
            options: [
              { value: 'semantic', label: S + 'gatewayForwarding.openaiTTFTModeSemantic' },
              { value: 'visible', label: S + 'gatewayForwarding.openaiTTFTModeVisible' }
            ]
          }
        ),
        f(
          'enable_fingerprint_unification',
          'bool',
          'gatewayForwarding.fingerprintUnification',
          'gatewayForwarding.fingerprintUnificationHint'
        ),
        f(
          'enable_metadata_passthrough',
          'bool',
          'gatewayForwarding.metadataPassthrough',
          'gatewayForwarding.metadataPassthroughHint'
        ),
        f('enable_cch_signing', 'bool', 'gatewayForwarding.cchSigning', 'gatewayForwarding.cchSigningHint'),
        u('enable_claude_oauth_system_prompt_injection', 'bool'),
        u('enable_anthropic_cache_ttl_1h_injection', 'bool'),
        u('rewrite_message_cache_control', 'bool'),
        u('enable_client_dateline_normalization', 'bool'),
        u('antigravity_user_agent_version', 'text', { mono: true }),
        u('openai_codex_user_agent', 'text', { mono: true }),
        u('openai_codex_client_version', 'text', { mono: true }),
        u('openai_codex_version_auto_sync_enabled', 'bool'),
        u('claude_code_client_version', 'text', { mono: true }),
        u('claude_code_version_auto_sync_enabled', 'bool'),
        u('enable_model_fallback', 'bool'),
        u('fallback_model_anthropic', 'text', { mono: true, showIf: ['enable_model_fallback', true] }),
        u('fallback_model_openai', 'text', { mono: true, showIf: ['enable_model_fallback', true] }),
        u('fallback_model_gemini', 'text', { mono: true, showIf: ['enable_model_fallback', true] }),
        u('fallback_model_antigravity', 'text', { mono: true, showIf: ['enable_model_fallback', true] }),
        u('enable_identity_patch', 'bool'),
        u('identity_patch_prompt', 'textarea', { showIf: ['enable_identity_patch', true] })
      ],
      custom: ['claudePromptBlocks']
    },
    {
      id: 'webSearch',
      title: S + 'webSearchEmulation.title',
      description: S + 'webSearchEmulation.description',
      fields: [],
      custom: ['webSearch']
    }
  ],
  payment: [
    {
      id: 'payment',
      title: S + 'payment.title',
      description: S + 'payment.description',
      fields: [
        f('payment_enabled', 'bool', 'payment.enabled', 'payment.enabledHint'),
        f('payment_min_amount', 'number', 'payment.minAmount', undefined, { step: '0.01' }),
        f('payment_max_amount', 'number', 'payment.maxAmount', 'payment.noLimit', { step: '0.01' }),
        f('payment_daily_limit', 'number', 'payment.dailyLimit', 'payment.noLimit', { step: '0.01' }),
        f('payment_max_pending_orders', 'number', 'payment.maxPendingOrders', 'payment.orderTimeoutHint'),
        f('payment_order_timeout_minutes', 'number', 'payment.orderTimeout', 'payment.orderTimeoutHint'),
        f('payment_balance_recharge_multiplier', 'number', 'payment.balanceRechargeMultiplier', undefined, {
          step: '0.000001'
        }),
        f(
          'payment_subscription_usd_to_cny_rate',
          'number',
          'payment.subscriptionUsdToCnyRate',
          'payment.subscriptionUsdToCnyRateHint',
          { step: '0.0001' }
        ),
        f('payment_recharge_fee_rate', 'number', 'payment.rechargeFeeRate', undefined, { step: '0.01' }),
        f('payment_product_name_prefix', 'text', 'payment.productNamePrefix'),
        f('payment_product_name_suffix', 'text', 'payment.productNameSuffix'),
        f('payment_load_balance_strategy', 'select', 'payment.loadBalanceStrategy', undefined, {
          options: [
            { value: 'round-robin', label: S + 'payment.strategyRoundRobin' },
            { value: 'least-amount', label: S + 'payment.strategyLeastAmount' }
          ]
        }),
        f('payment_help_image_url', 'url', 'payment.helpImage', undefined, { mono: true }),
        f('payment_help_text', 'textarea', 'payment.helpText'),
        f('payment_alipay_force_qrcode', 'bool', 'payment.alipayForceQRCode'),
        f(
          'payment_alipay_mobile_precreate_deep_link',
          'bool',
          'payment.alipayMobilePrecreateDeepLink',
          'payment.alipayMobilePrecreateDeepLinkHint'
        ),
        f('payment_cancel_rate_limit_enabled', 'bool', 'payment.cancelRateLimit'),
        f('payment_cancel_rate_limit_max', 'number', 'payment.cancelRateLimitAllowMax', undefined, {
          showIf: ['payment_cancel_rate_limit_enabled', true]
        }),
        f('payment_cancel_rate_limit_window', 'number', 'payment.cancelRateLimitEvery', undefined, {
          showIf: ['payment_cancel_rate_limit_enabled', true]
        }),
        f('payment_cancel_rate_limit_unit', 'select', 'payment.cancelRateLimitUnit', undefined, {
          options: [
            { value: 'minute', label: S + 'payment.cancelRateLimitUnitMinute' },
            { value: 'hour', label: S + 'payment.cancelRateLimitUnitHour' },
            { value: 'day', label: S + 'payment.cancelRateLimitUnitDay' }
          ],
          showIf: ['payment_cancel_rate_limit_enabled', true]
        }),
        f('payment_cancel_rate_limit_window_mode', 'select', 'payment.cancelRateLimitWindowMode', undefined, {
          options: [
            { value: 'rolling', label: S + 'payment.cancelRateLimitWindowModeRolling' },
            { value: 'fixed', label: S + 'payment.cancelRateLimitWindowModeFixed' }
          ],
          showIf: ['payment_cancel_rate_limit_enabled', true]
        })
      ],
      custom: ['paymentTypes', 'rechargeBonus']
    },
    { id: 'providers', title: S + 'payment.manageProviders', fields: [], custom: ['paymentProviders'] }
  ],
  email: [
    {
      id: 'smtp',
      title: S + 'smtp.title',
      description: S + 'smtp.description',
      fields: [
        f('smtp_host', 'text', 'smtp.host', undefined, { mono: true }),
        f('smtp_port', 'number', 'smtp.port'),
        f('smtp_username', 'text', 'smtp.username'),
        {
          ...secret('smtp_password', 'smtp.password', 'smtp.passwordHint'),
          configured: 'smtp_password_configured'
        },
        f('smtp_from_email', 'text', 'smtp.fromEmail'),
        f('smtp_from_name', 'text', 'smtp.fromName'),
        f('smtp_use_tls', 'bool', 'smtp.useTls', 'smtp.useTlsHint')
      ],
      custom: ['smtpTest']
    },
    {
      id: 'testEmail',
      title: S + 'testEmail.title',
      description: S + 'testEmail.description',
      fields: [],
      custom: ['testEmail']
    },
    {
      id: 'templates',
      title: 'adminUi.settings.templates.title',
      description: 'adminUi.settings.templates.description',
      fields: [],
      custom: ['emailTemplates']
    },
    {
      id: 'notify',
      title: 'adminUi.settings.notify.title',
      fields: [
        f('balance_low_notify_enabled', 'bool', 'balanceNotify.enabled', 'balanceNotify.description'),
        f(
          'balance_low_notify_threshold',
          'number',
          'balanceNotify.threshold',
          'balanceNotify.thresholdHint',
          { step: '0.01' }
        ),
        f(
          'balance_low_notify_recharge_url',
          'url',
          'balanceNotify.rechargeUrl',
          'balanceNotify.rechargeUrlHint',
          { mono: true }
        ),
        f(
          'subscription_expiry_notify_enabled',
          'bool',
          'subscriptionExpiryNotify.enabled',
          'subscriptionExpiryNotify.enabledHint'
        ),
        f('account_quota_notify_enabled', 'bool', 'quotaNotify.enabled', 'quotaNotify.description')
      ],
      custom: ['quotaNotifyEmails']
    }
  ]
}

/** 校验：规格中引用的语言包键必须存在（见 settingsSpec.spec.ts）。 */
export function collectSpecKeys(): string[] {
  const keys = new Set<string>()
  for (const cards of Object.values(SETTINGS_SPEC)) {
    for (const c of cards) {
      if (c.title) keys.add(c.title)
      if (c.description) keys.add(c.description)
      for (const fl of c.fields) {
        keys.add(fl.label ?? `adminUi.settings.f.${fl.name}`)
        if (fl.hint) keys.add(fl.hint)
        else if (!fl.label) keys.add(`adminUi.settings.f.${fl.name}Hint`)
        if (fl.placeholder) keys.add(fl.placeholder)
        for (const o of fl.options ?? []) keys.add(o.label)
      }
    }
  }
  return [...keys]
}
