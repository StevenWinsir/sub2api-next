/** Admin console strings added by the Next.js frontend, namespace `adminUi` (upstream-synced admin.* untouched). */
export default {
  adminUi: {
    accounts: {
      authCodeRequired: "Generate the authorization link and enter the code first",
      clearError: "Clear error",
      credentialsJson: "Credentials JSON",
      credentialsJsonHint: "Paste the credentials object (JSON) for this account type. Leave empty when editing to keep existing credentials.",
      credentialsJsonInvalid: "Credentials must be a valid JSON object",
      duplicate: "Duplicate account",
      loadFactorPlaceholder: "Defaults to concurrency when empty",
      nameRequired: "Account name is required",
      skipDefaultGroupBind: "Do not bind to the default group on import",
      type: {
        apikey: "API Key",
        bedrock: "AWS Bedrock",
        oauth: "OAuth",
        service_account: "Service account",
        setupToken: "Setup Token",
        upstream: "Upstream"
      }
    },
    channels: {
      mappingInvalid: "Model mapping must be a JSON object of { platform: { source: target } }"
    },
    groups: {
      claudeCodeOnly: "Claude Code clients only",
      fallbackGroup: "Fallback group",
      fallbackInvalid: "Fallback group (invalid request)",
      tabBasic: "Basic",
      tabBilling: "Billing",
      tabModels: "Model allowlist",
      tabRouting: "Routing & filters"
    },
    monitor: {
      history: "Check history"
    },
    orders: {
      paymentType: "Payment method"
    },
    subscriptions: {
      started: "Started"
    },
    usage: {
      exportCsv: "Export CSV",
      model: "Model",
      time: "Time",
      type: "Type",
      userId: "User ID"
    },
    settings: {
      retry: "Retry",
      secretConfiguredPlaceholder: "Configured — leave empty to keep",
      secretConfiguredHint: "A value is already stored. Leave this field empty to keep it.",
      agreement: {
        title: "Login agreement",
        description: "Require users to confirm legal documents before signing in. Each document is published at /legal/<id>.",
        modeModal: "Modal confirmation",
        modeCheckbox: "Checkbox on the form",
        docTitle: "Title",
        docId: "Route ID",
        docIdHint: "Lowercase letters, digits, \"-\" and \"_\". Must be unique.",
        docContent: "Content (Markdown)",
        addDoc: "Add document",
        defaultTerms: "Terms of Service",
        defaultUsage: "Usage Policy",
        defaultRegions: "Supported Countries and Regions",
        defaultService: "Service-Specific Terms"
      },
      authSources: {
        github: "Applied on first signup or first bind through a verified GitHub email.",
        google: "Applied on first signup or first bind through a verified Google email.",
        dingtalk: "Applied on first signup or first bind through DingTalk.",
        grantOnSignup: "Grant on signup"
      },
      claudePrompt: {
        hint: "Inject the system-prompt blocks below into Claude OAuth requests, in order.",
        enabled: "Block enabled",
        preset: "Preset",
        preset_billing: "Billing header",
        preset_system: "Claude Code system prompt",
        preset_expansion: "Claude Code expansion prompt",
        preset_custom: "Custom",
        cacheControl: "cache_control",
        text: "Block text",
        reset: "Reset to defaults"
      },
      codex: {
        originator: "originator",
        uaContains: "User-Agent contains (comma-separated)",
        skipFingerprint: "Skip engine fingerprint",
        blacklist: "Client blacklist",
        blacklistHint: "Matching clients are rejected.",
        whitelist: "Client whitelist",
        whitelistHint: "Matching clients are always allowed.",
        fingerprint: "Engine fingerprint signals",
        fingerprintHint: "Separate variants with \" / \". A request passes when every required signal matches.",
        signalType: "Signal type",
        signalMatch: "Match",
        signalRequired: "Required",
        resetDefaults: "Restore defaults"
      },
      cyberAllowlist: {
        label: "Cyber-policy allowlisted users",
        hint: "User IDs exempt from the cyber-policy session block.",
        placeholder: "Type a user ID and press Enter"
      },
      errors: {
        agreementNeedsDocument: "At least one document is required when the login agreement is enabled.",
        agreementTitleRequired: "Login agreement document title cannot be empty.",
        agreementDuplicateRoute: "Login agreement document routes cannot be duplicated: /legal/{id}",
        wechatMpMobileConflict: "Official Account and Mobile App cannot be enabled at the same time."
      },
      grokBaseUrlMode: {
        cli: "CLI (cli.grok.com)",
        api: "API (api.x.ai)"
      },
      notify: {
        title: "Balance, subscription and quota notifications",
        unverified: "Unverified"
      },
      oauthEnable: {
        github: "Enable GitHub sign-in",
        google: "Enable Google sign-in"
      },
      oauthTitle: {
        github: "GitHub sign-in",
        google: "Google sign-in"
      },
      oidcAuthMethod: {
        client_secret_post: "client_secret_post",
        client_secret_basic: "client_secret_basic",
        none: "none (public client)"
      },
      templates: {
        title: "Email templates",
        description: "Customize the subject and HTML of each notification email per event and language.",
        events: {
          auth_verify_code: "Email Verification Code",
          auth_password_reset: "Password Reset",
          notification_email_verify_code: "Notification Email Verification",
          subscription_purchase_success: "Subscription Activated",
          subscription_expiry_reminder: "Subscription Expiry Reminder",
          balance_low: "Low Balance Alert",
          balance_recharge_success: "Balance Recharge Success",
          account_quota_alert: "Account Quota Alert",
          content_moderation_violation_notice: "Risk Control Violation Notice",
          content_moderation_account_disabled: "Risk Control Account Disabled",
          ops_alert: "Ops Alert",
          ops_scheduled_report: "Ops Scheduled Report"
        },
        timing: {
          auth_verify_code: "Sent for registration, email binding, OAuth pending email completion, or TOTP email verification.",
          auth_password_reset: "Sent when a user requests a password reset link.",
          notification_email_verify_code: "Sent when a user adds and verifies an extra notification email address.",
          subscription_purchase_success: "Sent after a subscription order is paid and the subscription is activated or extended.",
          subscription_expiry_reminder: "Sent by the background job when an active subscription has 7, 3, or 1 day remaining.",
          balance_low: "Sent when a balance drops below the reminder threshold.",
          balance_recharge_success: "Sent after a balance recharge order is paid and credited.",
          account_quota_alert: "Sent to admin notification emails when an upstream account reaches its quota alert threshold.",
          content_moderation_violation_notice: "Sent when a request triggers moderation rules but the account is not disabled yet.",
          content_moderation_account_disabled: "Sent when violations reach the ban threshold and the account is disabled.",
          ops_alert: "Sent to ops recipients when an ops monitoring rule fires.",
          ops_scheduled_report: "Sent when a configured daily, weekly, digest or health report is due."
        }
      },
      wechat: {
        mobileMode: "Mobile app",
        mobileModeHint: "WeChat mobile app sign-in (mutually exclusive with Official Account)."
      },
      payment: {
        moveUp: "Move up",
        moveDown: "Move down",
        enablementConflict: "{name} already provides {method}. Disable it first.",
        keepSecretHint: "Leave empty to keep the stored secret."
      },
      f: {
        antigravity_user_agent_version: "Antigravity User-Agent version",
        openai_codex_user_agent: "Codex User-Agent override",
        openai_codex_client_version: "Codex client version",
        openai_codex_version_auto_sync_enabled: "Auto-sync the official Codex version",
        claude_code_client_version: "Claude Code client version",
        claude_code_version_auto_sync_enabled: "Auto-sync the official Claude Code version",
        enable_claude_oauth_system_prompt_injection: "Inject Claude OAuth system prompt",
        enable_anthropic_cache_ttl_1h_injection: "Inject 1h Anthropic cache TTL",
        rewrite_message_cache_control: "Rewrite message cache_control",
        enable_client_dateline_normalization: "Normalize client dateline",
        enable_model_fallback: "Enable model fallback",
        fallback_model_anthropic: "Anthropic fallback model",
        fallback_model_openai: "OpenAI fallback model",
        fallback_model_gemini: "Gemini fallback model",
        fallback_model_antigravity: "Antigravity fallback model",
        enable_identity_patch: "Enable identity patch (Claude → Gemini)",
        identity_patch_prompt: "Identity patch prompt",
        login_agreement_enabled: "Require agreement confirmation at login",
        login_agreement_mode: "Confirmation mode",
        login_agreement_updated_at: "Agreement version date",
        github_oauth_client_id: "GitHub client ID",
        github_oauth_client_secret: "GitHub client secret",
        github_oauth_redirect_url: "GitHub callback URL",
        github_oauth_frontend_redirect_url: "GitHub frontend redirect path",
        google_oauth_client_id: "Google client ID",
        google_oauth_client_secret: "Google client secret",
        google_oauth_redirect_url: "Google callback URL",
        google_oauth_frontend_redirect_url: "Google frontend redirect path",
        dingtalk_connect_internal_corp_id: "Internal corp ID",
        openai_advanced_scheduler_lb_top_k: "Load-balancer top-K",
        openai_advanced_scheduler_weight_priority: "Priority weight",
        openai_advanced_scheduler_weight_load: "Load weight",
        openai_advanced_scheduler_weight_queue: "Queue weight",
        openai_advanced_scheduler_weight_error_rate: "Error-rate weight",
        openai_advanced_scheduler_weight_ttft: "TTFT weight",
        openai_advanced_scheduler_weight_reset: "Quota-reset weight",
        openai_advanced_scheduler_weight_quota_headroom: "Quota-headroom weight",
        openai_advanced_scheduler_weight_upstream_cost: "Upstream-cost weight",
        openai_advanced_scheduler_weight_previous_response: "Previous-response weight",
        openai_advanced_scheduler_weight_session_sticky: "Session-sticky weight"
      }
    }
  }
}
