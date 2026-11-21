/** 新前端（Next.js）管理后台新增文案，命名空间 `adminUi`；不改动与上游同步的 admin.* 语言包。 */
export default {
  adminUi: {
    accounts: {
      authCodeRequired: "请先生成授权链接并填写授权码",
      clearError: "清除错误",
      credentialsJson: "凭据 JSON",
      credentialsJsonHint: "粘贴该账号类型所需的凭据对象（JSON）。编辑时留空表示不修改凭据。",
      credentialsJsonInvalid: "凭据必须是合法的 JSON 对象",
      duplicate: "复制账号",
      loadFactorPlaceholder: "留空则使用并发数",
      nameRequired: "请输入账号名称",
      skipDefaultGroupBind: "导入时不自动绑定默认分组",
      type: {
        apikey: "API Key",
        bedrock: "AWS Bedrock",
        oauth: "OAuth",
        service_account: "服务账号",
        setupToken: "Setup Token",
        upstream: "上游转发"
      }
    },
    channels: {
      mappingInvalid: "模型映射必须是 { 平台: { 源模型: 目标模型 } } 形式的 JSON 对象"
    },
    groups: {
      claudeCodeOnly: "仅限 Claude Code 客户端",
      fallbackGroup: "回退分组",
      fallbackInvalid: "回退分组（无效请求）",
      tabBasic: "基础",
      tabBilling: "计费",
      tabModels: "模型白名单",
      tabRouting: "调度与过滤"
    },
    monitor: {
      history: "检测历史"
    },
    orders: {
      paymentType: "支付方式"
    },
    subscriptions: {
      started: "开始时间"
    },
    usage: {
      exportCsv: "导出 CSV",
      model: "模型",
      time: "时间",
      type: "类型",
      userId: "用户 ID"
    },
    settings: {
      retry: "重试",
      secretConfiguredPlaceholder: "已配置，留空则保持不变",
      secretConfiguredHint: "已保存过该值；留空表示保持不变。",
      agreement: {
        title: "登录条款",
        description: "要求用户在登录前确认法律文档；每份文档发布在 /legal/<id>。",
        modeModal: "弹窗确认",
        modeCheckbox: "表单内勾选",
        docTitle: "文档名称",
        docId: "路由 ID",
        docIdHint: "仅限小写字母、数字、“-” 与 “_”，且不可重复。",
        docContent: "内容（Markdown）",
        addDoc: "添加文档",
        defaultTerms: "服务条款",
        defaultUsage: "使用政策",
        defaultRegions: "支持的国家和地区",
        defaultService: "服务特定条款"
      },
      authSources: {
        github: "通过 GitHub 已验证邮箱首次注册或首次绑定时应用。",
        google: "通过 Google 已验证邮箱首次注册或首次绑定时应用。",
        dingtalk: "通过钉钉首次注册或首次绑定时应用。",
        grantOnSignup: "注册时发放"
      },
      claudePrompt: {
        hint: "向 Claude OAuth 请求按顺序注入下列系统提示词块。",
        enabled: "启用该块",
        preset: "预设",
        preset_billing: "计费头",
        preset_system: "Claude Code 系统提示词",
        preset_expansion: "Claude Code 扩展提示词",
        preset_custom: "自定义",
        cacheControl: "cache_control",
        text: "块内容",
        reset: "恢复默认"
      },
      codex: {
        originator: "originator",
        uaContains: "User-Agent 包含（逗号分隔）",
        skipFingerprint: "跳过引擎指纹",
        blacklist: "客户端黑名单",
        blacklistHint: "命中的客户端会被拒绝。",
        whitelist: "客户端白名单",
        whitelistHint: "命中的客户端始终放行。",
        fingerprint: "引擎指纹信号",
        fingerprintHint: "变体之间用 “ / ” 分隔；所有必选信号均命中时放行。",
        signalType: "信号类型",
        signalMatch: "匹配值",
        signalRequired: "必选",
        resetDefaults: "恢复默认"
      },
      cyberAllowlist: {
        label: "网络安全策略白名单用户",
        hint: "免于网络安全策略会话封锁的用户 ID。",
        placeholder: "输入用户 ID 后回车"
      },
      errors: {
        agreementNeedsDocument: "启用登录条款确认时，至少需要保留一份文档。",
        agreementTitleRequired: "登录条款文档名称不能为空。",
        agreementDuplicateRoute: "登录条款文档路由不能重复：/legal/{id}",
        wechatMpMobileConflict: "公众号和移动应用不能同时启用。"
      },
      grokBaseUrlMode: {
        cli: "CLI（cli.grok.com）",
        api: "API（api.x.ai）"
      },
      notify: {
        title: "余额、订阅到期与账号限额通知",
        unverified: "未验证"
      },
      oauthEnable: {
        github: "启用 GitHub 登录",
        google: "启用 Google 登录"
      },
      oauthTitle: {
        github: "GitHub 登录",
        google: "Google 登录"
      },
      oidcAuthMethod: {
        client_secret_post: "client_secret_post",
        client_secret_basic: "client_secret_basic",
        none: "none（公开客户端）"
      },
      templates: {
        title: "邮件模板",
        description: "按事件与语言自定义各类通知邮件的主题与 HTML。",
        events: {
          auth_verify_code: "邮箱验证码",
          auth_password_reset: "密码重置",
          notification_email_verify_code: "通知邮箱验证码",
          subscription_purchase_success: "订阅开通成功",
          subscription_expiry_reminder: "订阅到期提醒",
          balance_low: "余额不足提醒",
          balance_recharge_success: "余额充值成功",
          account_quota_alert: "账号限额告警",
          content_moderation_violation_notice: "内容审计违规提醒",
          content_moderation_account_disabled: "内容审计禁用账号",
          ops_alert: "运维告警",
          ops_scheduled_report: "运维定时报表"
        },
        timing: {
          auth_verify_code: "注册、绑定邮箱、OAuth 补全邮箱或 TOTP 邮箱校验时发送。",
          auth_password_reset: "用户请求密码重置链接时发送。",
          notification_email_verify_code: "用户添加并验证额外通知邮箱时发送。",
          subscription_purchase_success: "订阅订单完成支付并成功开通或续期后发送。",
          subscription_expiry_reminder: "后台任务在订阅仍有效且距离到期剩余 7 天、3 天、1 天时各发送一次。",
          balance_low: "用户余额低于提醒阈值时发送。",
          balance_recharge_success: "余额充值订单支付完成并入账后发送。",
          account_quota_alert: "上游账号用量达到限额告警阈值时发送给管理员通知邮箱。",
          content_moderation_violation_notice: "用户请求命中内容审计或风控规则、但尚未被禁用时发送。",
          content_moderation_account_disabled: "违规次数达到封禁阈值并自动禁用账号时发送。",
          ops_alert: "运维监控规则触发告警并满足邮件通知配置时发送。",
          ops_scheduled_report: "运维日报、周报、错误摘要或账号健康报表到达发送时间时发送。"
        }
      },
      wechat: {
        mobileMode: "移动应用",
        mobileModeHint: "微信移动应用登录（与公众号互斥）。"
      },
      payment: {
        moveUp: "上移",
        moveDown: "下移",
        enablementConflict: "「{name}」已提供 {method}，请先停用后再启用。",
        keepSecretHint: "留空表示保留已保存的密钥。"
      },
      f: {
        antigravity_user_agent_version: "Antigravity User-Agent 版本",
        openai_codex_user_agent: "Codex User-Agent 覆盖",
        openai_codex_client_version: "Codex 客户端版本",
        openai_codex_version_auto_sync_enabled: "自动同步 Codex 官方版本",
        claude_code_client_version: "Claude Code 客户端版本",
        claude_code_version_auto_sync_enabled: "自动同步 Claude Code 官方版本",
        enable_claude_oauth_system_prompt_injection: "注入 Claude OAuth 系统提示词",
        enable_anthropic_cache_ttl_1h_injection: "注入 Anthropic 1 小时缓存 TTL",
        rewrite_message_cache_control: "重写消息 cache_control",
        enable_client_dateline_normalization: "规范化客户端日期行",
        enable_model_fallback: "启用模型回退",
        fallback_model_anthropic: "Anthropic 回退模型",
        fallback_model_openai: "OpenAI 回退模型",
        fallback_model_gemini: "Gemini 回退模型",
        fallback_model_antigravity: "Antigravity 回退模型",
        enable_identity_patch: "启用身份补丁（Claude → Gemini）",
        identity_patch_prompt: "身份补丁提示词",
        login_agreement_enabled: "登录时要求确认条款",
        login_agreement_mode: "确认方式",
        login_agreement_updated_at: "条款版本日期",
        github_oauth_client_id: "GitHub Client ID",
        github_oauth_client_secret: "GitHub Client Secret",
        github_oauth_redirect_url: "GitHub 回调地址",
        github_oauth_frontend_redirect_url: "GitHub 前端跳转路径",
        google_oauth_client_id: "Google Client ID",
        google_oauth_client_secret: "Google Client Secret",
        google_oauth_redirect_url: "Google 回调地址",
        google_oauth_frontend_redirect_url: "Google 前端跳转路径",
        dingtalk_connect_internal_corp_id: "企业 CorpId",
        openai_advanced_scheduler_lb_top_k: "负载均衡 Top-K",
        openai_advanced_scheduler_weight_priority: "优先级权重",
        openai_advanced_scheduler_weight_load: "负载权重",
        openai_advanced_scheduler_weight_queue: "队列权重",
        openai_advanced_scheduler_weight_error_rate: "错误率权重",
        openai_advanced_scheduler_weight_ttft: "首字延迟权重",
        openai_advanced_scheduler_weight_reset: "额度重置权重",
        openai_advanced_scheduler_weight_quota_headroom: "额度余量权重",
        openai_advanced_scheduler_weight_upstream_cost: "上游成本权重",
        openai_advanced_scheduler_weight_previous_response: "上一次响应权重",
        openai_advanced_scheduler_weight_session_sticky: "会话粘性权重"
      }
    }
  }
}
