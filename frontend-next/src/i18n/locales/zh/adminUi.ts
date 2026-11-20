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
    }
  }
}
