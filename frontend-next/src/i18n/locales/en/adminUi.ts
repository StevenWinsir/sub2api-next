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
    }
  }
}
