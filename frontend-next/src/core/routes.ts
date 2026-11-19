/**
 * 路由注册表 —— 路由元信息的单一事实来源（交接书 §5.3.2 / 附录 A）。
 *
 * 侧边栏、面包屑、命令面板、标题、门禁、深链纠正全部从这里读取。
 * 新增路由时必须：
 *  1. 在此登记；
 *  2. 在 pages/ 下建立对应文件（registry.spec.ts 校验两者一一对应）；
 *  3. 路径不得与 §3.4 的后端保留路径冲突（RESERVED_BACKEND_PREFIXES）。
 */
import type { RegisteredFeatureFlag } from '@/utils/featureFlags'

export type LayoutKind = 'public' | 'auth' | 'console-user' | 'console-admin' | 'blank'

export interface NavMeta {
  /** 菜单区块：user = 用户控制台；admin = 管理后台。 */
  section: 'user' | 'admin'
  /** 分组（i18n 键由 navigation.ts 的 GROUP_LABEL_KEYS 决定）。 */
  group: NavGroup
  labelKey: string
  /** lucide-react 图标名。 */
  icon: string
  order: number
  featureFlag?: RegisteredFeatureFlag | 'opsMonitoring' | 'adminPayment'
  hideInSimpleMode?: boolean
  /** 子菜单项所属的父级路径（仅用于管理后台的折叠分组）。 */
  parent?: string
}

export type NavGroup =
  | 'overview'
  | 'api'
  | 'resources'
  | 'billing'
  | 'growth'
  | 'account'
  | 'users'
  | 'channels'
  | 'commerce'
  | 'content'
  | 'security'
  | 'system'

export interface RouteDef {
  /** 路径模式，动态段用 `:name`。 */
  path: string
  /** 稳定的路由名（对应 Vue 版 route.name，用于标题特例等）。 */
  name: string
  layout: LayoutKind | null
  /** 默认 true（与 Vue 一致）。 */
  requiresAuth?: boolean
  requiresAdmin?: boolean
  requiresPayment?: boolean
  requiresRiskControl?: boolean
  requiresSubscription?: boolean
  /** 简易模式下禁止访问（以前缀匹配，与 Vue 守卫一致）。 */
  simpleRestricted?: boolean
  /** 后端模式下未登录也可访问。 */
  backendWhitelist?: boolean
  /** 重定向型路由。 */
  redirectTo?: string
  title?: string
  titleKey?: string
  descriptionKey?: string
  nav?: NavMeta
  /** 交付轮次，仅用于文档与占位页展示。 */
  round: 1 | 2 | 3 | 4 | 5
}

const pub = { requiresAuth: false } as const

export const ROUTES: readonly RouteDef[] = [
  // ───────── 公开 / 认证 ─────────
  { path: '/', name: 'Root', layout: null, redirectTo: '/home', round: 1, ...pub },
  {
    path: '/setup',
    name: 'Setup',
    layout: 'blank',
    title: 'Setup',
    backendWhitelist: true,
    round: 2,
    ...pub
  },
  { path: '/home', name: 'Home', layout: 'public', title: 'Home', round: 2, ...pub },
  {
    path: '/login',
    name: 'Login',
    layout: 'auth',
    title: 'Login',
    titleKey: 'home.login',
    backendWhitelist: true,
    round: 1,
    ...pub
  },
  {
    path: '/register',
    name: 'Register',
    layout: 'auth',
    title: 'Register',
    titleKey: 'auth.createAccount',
    round: 2,
    ...pub
  },
  { path: '/email-verify', name: 'EmailVerify', layout: 'auth', title: 'Verify Email', round: 2, ...pub },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    layout: 'auth',
    title: 'Forgot Password',
    titleKey: 'auth.forgotPasswordTitle',
    round: 2,
    ...pub
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    layout: 'auth',
    title: 'Reset Password',
    round: 2,
    ...pub
  },
  {
    path: '/auth/callback',
    name: 'OAuthCallback',
    layout: 'blank',
    title: 'OAuth Callback',
    titleKey: 'auth.oauthCallbackPageTitle',
    backendWhitelist: true,
    round: 2,
    ...pub
  },
  {
    // 后端的 GitHub / Google 登录回跳地址（Vue 版 route alias），与 /auth/callback 共用同一页面实现
    path: '/auth/oauth/callback',
    name: 'OAuthCallbackAlias',
    layout: 'blank',
    title: 'OAuth Callback',
    titleKey: 'auth.oauthCallbackPageTitle',
    backendWhitelist: true,
    round: 2,
    ...pub
  },
  {
    path: '/auth/linuxdo/callback',
    name: 'LinuxDoOAuthCallback',
    layout: 'blank',
    title: 'LinuxDo OAuth Callback',
    titleKey: 'auth.linuxdoCallbackPageTitle',
    backendWhitelist: true,
    round: 2,
    ...pub
  },
  {
    path: '/auth/wechat/callback',
    name: 'WeChatOAuthCallback',
    layout: 'blank',
    title: 'WeChat OAuth Callback',
    titleKey: 'auth.wechatCallbackPageTitle',
    backendWhitelist: true,
    round: 2,
    ...pub
  },
  {
    path: '/auth/wechat/payment/callback',
    name: 'WeChatPaymentOAuthCallback',
    layout: 'blank',
    title: 'WeChat Payment Callback',
    titleKey: 'auth.wechatPaymentCallbackPageTitle',
    backendWhitelist: true,
    round: 3,
    ...pub
  },
  {
    path: '/auth/dingtalk/callback',
    name: 'DingTalkOAuthCallback',
    layout: 'blank',
    title: 'DingTalk OAuth Callback',
    titleKey: 'auth.dingtalkCallbackPageTitle',
    backendWhitelist: true,
    round: 2,
    ...pub
  },
  {
    path: '/auth/dingtalk/email-completion',
    name: 'DingTalkEmailCompletion',
    layout: 'blank',
    title: 'DingTalk Email Completion',
    backendWhitelist: true,
    round: 2,
    ...pub
  },
  {
    path: '/auth/oidc/callback',
    name: 'OIDCOAuthCallback',
    layout: 'blank',
    title: 'OIDC OAuth Callback',
    titleKey: 'auth.oidcCallbackPageTitle',
    backendWhitelist: true,
    round: 2,
    ...pub
  },
  {
    path: '/key-usage',
    name: 'KeyUsage',
    layout: 'public',
    title: 'Key Usage',
    backendWhitelist: true,
    round: 2,
    ...pub
  },
  {
    path: '/legal/:documentId',
    name: 'LegalDocument',
    layout: 'public',
    title: 'Legal Document',
    backendWhitelist: true,
    round: 2,
    ...pub
  },
  {
    path: '/model-plaza',
    name: 'ModelPlaza',
    layout: 'public',
    title: 'Model Plaza',
    titleKey: 'modelPlaza.title',
    round: 2,
    ...pub
  },
  {
    path: '/oauth/mcp/authorize',
    name: 'MCPAuthorize',
    layout: 'auth',
    title: 'Authorize MCP Application',
    titleKey: 'mcp.consentTitle',
    round: 2
  },

  // ───────── 用户控制台 ─────────
  {
    path: '/dashboard',
    name: 'Dashboard',
    layout: 'console-user',
    title: 'Dashboard',
    titleKey: 'dashboard.title',
    descriptionKey: 'dashboard.welcomeMessage',
    round: 3,
    nav: { section: 'user', group: 'overview', labelKey: 'nav.dashboard', icon: 'LayoutDashboard', order: 10 }
  },
  {
    path: '/keys',
    name: 'Keys',
    layout: 'console-user',
    title: 'API Keys',
    titleKey: 'keys.title',
    descriptionKey: 'keys.description',
    round: 3,
    nav: { section: 'user', group: 'api', labelKey: 'nav.apiKeys', icon: 'KeyRound', order: 20 }
  },
  {
    path: '/batch-image',
    name: 'BatchImageGuide',
    layout: 'console-user',
    title: 'Batch Image Guide',
    titleKey: 'batchImageGuide.title',
    descriptionKey: 'batchImageGuide.description',
    round: 3,
    nav: {
      section: 'user',
      group: 'api',
      labelKey: 'nav.batchImage',
      icon: 'Images',
      order: 21,
      hideInSimpleMode: true
    }
  },
  {
    path: '/usage',
    name: 'Usage',
    layout: 'console-user',
    title: 'Usage Records',
    titleKey: 'usage.title',
    descriptionKey: 'usage.description',
    round: 3,
    nav: {
      section: 'user',
      group: 'api',
      labelKey: 'nav.usage',
      icon: 'BarChart3',
      order: 22,
      hideInSimpleMode: true
    }
  },
  {
    path: '/settings/mcp',
    name: 'MCPSettings',
    layout: 'console-user',
    title: 'MCP Connection',
    titleKey: 'mcp.title',
    descriptionKey: 'mcp.description',
    round: 3,
    nav: { section: 'user', group: 'api', labelKey: 'mcp.title', icon: 'Plug', order: 23, featureFlag: 'mcp' }
  },
  {
    path: '/available-channels',
    name: 'AvailableChannels',
    layout: 'console-user',
    title: 'Available Channels',
    titleKey: 'availableChannels.title',
    descriptionKey: 'availableChannels.description',
    round: 3,
    nav: {
      section: 'user',
      group: 'resources',
      labelKey: 'nav.availableChannels',
      icon: 'Network',
      order: 30,
      hideInSimpleMode: true,
      featureFlag: 'availableChannels'
    }
  },
  {
    path: '/monitor',
    name: 'ChannelStatus',
    layout: 'console-user',
    title: 'Channel Status',
    titleKey: 'nav.channelStatus',
    round: 3,
    nav: {
      section: 'user',
      group: 'resources',
      labelKey: 'nav.channelStatus',
      icon: 'Activity',
      order: 31,
      featureFlag: 'channelMonitor'
    }
  },
  {
    path: '/subscriptions',
    name: 'UserSubscriptions',
    layout: 'console-user',
    title: 'My Subscriptions',
    titleKey: 'userSubscriptions.title',
    descriptionKey: 'userSubscriptions.description',
    requiresSubscription: true,
    simpleRestricted: true,
    round: 3,
    nav: {
      section: 'user',
      group: 'billing',
      labelKey: 'nav.mySubscriptions',
      icon: 'CreditCard',
      order: 40,
      hideInSimpleMode: true,
      featureFlag: 'subscription'
    }
  },
  {
    path: '/purchase',
    name: 'PurchaseSubscription',
    layout: 'console-user',
    title: 'Purchase Subscription',
    titleKey: 'nav.buySubscription',
    descriptionKey: 'purchase.description',
    requiresPayment: true,
    round: 3,
    nav: {
      section: 'user',
      group: 'billing',
      labelKey: 'nav.buySubscription',
      icon: 'Wallet',
      order: 41,
      hideInSimpleMode: true,
      featureFlag: 'payment'
    }
  },
  {
    path: '/orders',
    name: 'OrderList',
    layout: 'console-user',
    title: 'My Orders',
    titleKey: 'nav.myOrders',
    requiresPayment: true,
    round: 3,
    nav: {
      section: 'user',
      group: 'billing',
      labelKey: 'nav.myOrders',
      icon: 'Receipt',
      order: 42,
      hideInSimpleMode: true,
      featureFlag: 'payment'
    }
  },
  {
    path: '/redeem',
    name: 'Redeem',
    layout: 'console-user',
    title: 'Redeem Code',
    titleKey: 'redeem.title',
    descriptionKey: 'redeem.description',
    simpleRestricted: true,
    round: 3,
    nav: {
      section: 'user',
      group: 'billing',
      labelKey: 'nav.redeem',
      icon: 'Gift',
      order: 43,
      hideInSimpleMode: true
    }
  },
  {
    path: '/affiliate',
    name: 'Affiliate',
    layout: 'console-user',
    title: 'Affiliate',
    titleKey: 'affiliate.title',
    descriptionKey: 'affiliate.description',
    round: 3,
    nav: {
      section: 'user',
      group: 'growth',
      labelKey: 'nav.affiliate',
      icon: 'Users',
      order: 50,
      hideInSimpleMode: true,
      featureFlag: 'affiliate'
    }
  },
  {
    path: '/profile',
    name: 'Profile',
    layout: 'console-user',
    title: 'Profile',
    titleKey: 'profile.title',
    descriptionKey: 'profile.description',
    round: 3,
    nav: { section: 'user', group: 'account', labelKey: 'nav.profile', icon: 'UserRound', order: 60 }
  },
  {
    path: '/custom/:id',
    name: 'CustomPage',
    layout: 'console-user',
    title: 'Custom Page',
    titleKey: 'customPage.title',
    round: 3
  },
  {
    path: '/payment/qrcode',
    name: 'PaymentQRCode',
    layout: 'blank',
    title: 'Payment',
    titleKey: 'payment.qr.scanToPay',
    requiresPayment: true,
    round: 3
  },
  {
    path: '/payment/result',
    name: 'PaymentResult',
    layout: 'blank',
    title: 'Payment Result',
    titleKey: 'payment.result.success',
    backendWhitelist: true,
    round: 3,
    ...pub
  },
  {
    path: '/payment/stripe',
    name: 'StripePayment',
    layout: 'blank',
    title: 'Stripe Payment',
    titleKey: 'payment.stripePay',
    round: 3,
    ...pub
  },
  {
    path: '/payment/airwallex',
    name: 'AirwallexPayment',
    layout: 'blank',
    title: 'Airwallex Payment',
    titleKey: 'payment.airwallexPay',
    backendWhitelist: true,
    round: 3,
    ...pub
  },
  { path: '/payment/stripe-popup', name: 'StripePopup', layout: 'blank', title: 'Payment', round: 3, ...pub },

  // ───────── 管理后台 ─────────
  {
    path: '/admin',
    name: 'AdminRoot',
    layout: null,
    redirectTo: '/admin/dashboard',
    requiresAdmin: true,
    round: 4
  },
  {
    path: '/admin/dashboard',
    name: 'AdminDashboard',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Admin Dashboard',
    titleKey: 'admin.dashboard.title',
    descriptionKey: 'admin.dashboard.description',
    round: 4,
    nav: {
      section: 'admin',
      group: 'overview',
      labelKey: 'nav.dashboard',
      icon: 'LayoutDashboard',
      order: 10
    }
  },
  {
    path: '/admin/ops',
    name: 'AdminOps',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Ops Monitoring',
    titleKey: 'admin.ops.title',
    descriptionKey: 'admin.ops.description',
    round: 5,
    nav: {
      section: 'admin',
      group: 'overview',
      labelKey: 'nav.ops',
      icon: 'Gauge',
      order: 11,
      featureFlag: 'opsMonitoring'
    }
  },
  {
    path: '/admin/users',
    name: 'AdminUsers',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'User Management',
    titleKey: 'admin.users.title',
    descriptionKey: 'admin.users.description',
    round: 4,
    nav: {
      section: 'admin',
      group: 'users',
      labelKey: 'nav.users',
      icon: 'Users',
      order: 20,
      hideInSimpleMode: true
    }
  },
  {
    path: '/admin/subscriptions',
    name: 'AdminSubscriptions',
    layout: 'console-admin',
    requiresAdmin: true,
    simpleRestricted: true,
    title: 'Subscription Management',
    titleKey: 'admin.subscriptions.title',
    descriptionKey: 'admin.subscriptions.description',
    round: 4,
    nav: {
      section: 'admin',
      group: 'users',
      labelKey: 'nav.subscriptions',
      icon: 'CreditCard',
      order: 21,
      hideInSimpleMode: true,
      featureFlag: 'subscription'
    }
  },
  {
    path: '/admin/groups',
    name: 'AdminGroups',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Group Management',
    titleKey: 'admin.groups.title',
    descriptionKey: 'admin.groups.description',
    round: 4,
    nav: { section: 'admin', group: 'channels', labelKey: 'nav.groups', icon: 'FolderTree', order: 30 }
  },
  {
    path: '/admin/accounts',
    name: 'AdminAccounts',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Account Management',
    titleKey: 'admin.accounts.title',
    descriptionKey: 'admin.accounts.description',
    round: 4,
    nav: { section: 'admin', group: 'channels', labelKey: 'nav.accounts', icon: 'Globe', order: 31 }
  },
  {
    path: '/admin/channels',
    name: 'AdminChannelsRoot',
    layout: null,
    requiresAdmin: true,
    redirectTo: '/admin/channels/pricing',
    round: 4
  },
  {
    path: '/admin/channels/pricing',
    name: 'AdminChannels',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Channel Management',
    titleKey: 'admin.channels.title',
    descriptionKey: 'admin.channels.description',
    round: 4,
    nav: {
      section: 'admin',
      group: 'channels',
      labelKey: 'nav.channelPricing',
      icon: 'Tags',
      order: 32,
      hideInSimpleMode: true,
      parent: '/admin/channels'
    }
  },
  {
    path: '/admin/channels/monitor',
    name: 'AdminChannelMonitor',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Channel Monitor',
    titleKey: 'admin.channelMonitor.title',
    descriptionKey: 'admin.channelMonitor.description',
    round: 4,
    nav: {
      section: 'admin',
      group: 'channels',
      labelKey: 'nav.channelMonitor',
      icon: 'Signal',
      order: 33,
      hideInSimpleMode: true,
      featureFlag: 'channelMonitor',
      parent: '/admin/channels'
    }
  },
  {
    path: '/admin/proxies',
    name: 'AdminProxies',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Proxy Management',
    titleKey: 'admin.proxies.title',
    descriptionKey: 'admin.proxies.description',
    round: 4,
    nav: { section: 'admin', group: 'channels', labelKey: 'nav.proxies', icon: 'Server', order: 34 }
  },
  {
    path: '/admin/orders/dashboard',
    name: 'AdminPaymentDashboard',
    layout: 'console-admin',
    requiresAdmin: true,
    requiresPayment: true,
    title: 'Payment Dashboard',
    titleKey: 'nav.paymentDashboard',
    round: 4,
    nav: {
      section: 'admin',
      group: 'commerce',
      labelKey: 'nav.paymentDashboard',
      icon: 'BarChart3',
      order: 40,
      hideInSimpleMode: true,
      featureFlag: 'adminPayment',
      parent: '/admin/orders'
    }
  },
  {
    path: '/admin/orders',
    name: 'AdminOrders',
    layout: 'console-admin',
    requiresAdmin: true,
    requiresPayment: true,
    title: 'Order Management',
    titleKey: 'nav.orderManagement',
    round: 4,
    nav: {
      section: 'admin',
      group: 'commerce',
      labelKey: 'nav.orderManagement',
      icon: 'Receipt',
      order: 41,
      hideInSimpleMode: true,
      featureFlag: 'adminPayment',
      parent: '/admin/orders'
    }
  },
  {
    path: '/admin/orders/plans',
    name: 'AdminPaymentPlans',
    layout: 'console-admin',
    requiresAdmin: true,
    requiresPayment: true,
    title: 'Subscription Plans',
    titleKey: 'nav.paymentPlans',
    round: 4,
    nav: {
      section: 'admin',
      group: 'commerce',
      labelKey: 'nav.paymentPlans',
      icon: 'Package',
      order: 42,
      hideInSimpleMode: true,
      featureFlag: 'adminPayment',
      parent: '/admin/orders'
    }
  },
  {
    path: '/admin/redeem',
    name: 'AdminRedeem',
    layout: 'console-admin',
    requiresAdmin: true,
    simpleRestricted: true,
    title: 'Redeem Code Management',
    titleKey: 'admin.redeem.title',
    descriptionKey: 'admin.redeem.description',
    round: 4,
    nav: {
      section: 'admin',
      group: 'commerce',
      labelKey: 'nav.redeemCodes',
      icon: 'Ticket',
      order: 43,
      hideInSimpleMode: true
    }
  },
  {
    path: '/admin/promo-codes',
    name: 'AdminPromoCodes',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Promo Code Management',
    titleKey: 'admin.promo.title',
    descriptionKey: 'admin.promo.description',
    round: 4,
    nav: {
      section: 'admin',
      group: 'commerce',
      labelKey: 'nav.promoCodes',
      icon: 'BadgePercent',
      order: 44,
      hideInSimpleMode: true
    }
  },
  {
    path: '/admin/affiliates',
    name: 'AdminAffiliatesRoot',
    layout: null,
    requiresAdmin: true,
    redirectTo: '/admin/affiliates/invites',
    round: 4
  },
  {
    path: '/admin/affiliates/invites',
    name: 'AdminAffiliateInvites',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Affiliate Invite Records',
    titleKey: 'nav.affiliateInviteRecords',
    descriptionKey: 'admin.affiliates.invitesDescription',
    round: 4,
    nav: {
      section: 'admin',
      group: 'commerce',
      labelKey: 'nav.affiliateInviteRecords',
      icon: 'Users',
      order: 45,
      hideInSimpleMode: true,
      featureFlag: 'affiliate',
      parent: '/admin/affiliates'
    }
  },
  {
    path: '/admin/affiliates/rebates',
    name: 'AdminAffiliateRebates',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Affiliate Rebate Records',
    titleKey: 'nav.affiliateRebateRecords',
    descriptionKey: 'admin.affiliates.rebatesDescription',
    round: 4,
    nav: {
      section: 'admin',
      group: 'commerce',
      labelKey: 'nav.affiliateRebateRecords',
      icon: 'Receipt',
      order: 46,
      hideInSimpleMode: true,
      featureFlag: 'affiliate',
      parent: '/admin/affiliates'
    }
  },
  {
    path: '/admin/affiliates/transfers',
    name: 'AdminAffiliateTransfers',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Affiliate Transfer Records',
    titleKey: 'nav.affiliateTransferRecords',
    descriptionKey: 'admin.affiliates.transfersDescription',
    round: 4,
    nav: {
      section: 'admin',
      group: 'commerce',
      labelKey: 'nav.affiliateTransferRecords',
      icon: 'CreditCard',
      order: 47,
      hideInSimpleMode: true,
      featureFlag: 'affiliate',
      parent: '/admin/affiliates'
    }
  },
  {
    path: '/admin/announcements',
    name: 'AdminAnnouncements',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Announcements',
    titleKey: 'admin.announcements.title',
    descriptionKey: 'admin.announcements.description',
    round: 4,
    nav: { section: 'admin', group: 'content', labelKey: 'nav.announcements', icon: 'Bell', order: 50 }
  },
  {
    path: '/admin/plugins',
    name: 'AdminPlugins',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Plugin Management',
    titleKey: 'admin.plugins.title',
    descriptionKey: 'admin.plugins.description',
    round: 5,
    nav: {
      section: 'admin',
      group: 'content',
      labelKey: 'nav.plugins',
      icon: 'Puzzle',
      order: 51,
      featureFlag: 'pluginManagement'
    }
  },
  {
    path: '/admin/usage',
    name: 'AdminUsage',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Usage Records',
    titleKey: 'admin.usage.title',
    descriptionKey: 'admin.usage.description',
    round: 4,
    nav: { section: 'admin', group: 'overview', labelKey: 'nav.usage', icon: 'BarChart3', order: 12 }
  },
  {
    path: '/admin/risk-control',
    name: 'AdminRiskControl',
    layout: 'console-admin',
    requiresAdmin: true,
    requiresRiskControl: true,
    title: 'Risk Control',
    titleKey: 'admin.riskControl.title',
    descriptionKey: 'admin.riskControl.description',
    round: 5,
    nav: {
      section: 'admin',
      group: 'security',
      labelKey: 'nav.contentModeration',
      icon: 'ShieldAlert',
      order: 60,
      featureFlag: 'riskControl',
      parent: '/admin/security-audit'
    }
  },
  {
    path: '/admin/prompt-audit',
    name: 'AdminPromptAudit',
    layout: 'console-admin',
    requiresAdmin: true,
    requiresRiskControl: true,
    title: 'Prompt Audit',
    titleKey: 'admin.promptAudit.title',
    descriptionKey: 'admin.promptAudit.description',
    round: 5,
    nav: {
      section: 'admin',
      group: 'security',
      labelKey: 'nav.promptAudit',
      icon: 'ScanSearch',
      order: 61,
      featureFlag: 'riskControl',
      parent: '/admin/security-audit'
    }
  },
  {
    path: '/admin/audit-logs',
    name: 'AdminAuditLogs',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'Audit Logs',
    titleKey: 'admin.audit.title',
    descriptionKey: 'admin.audit.description',
    round: 5,
    nav: {
      section: 'admin',
      group: 'security',
      labelKey: 'nav.auditLogs',
      icon: 'ScrollText',
      order: 62,
      hideInSimpleMode: true
    }
  },
  {
    path: '/admin/settings',
    name: 'AdminSettings',
    layout: 'console-admin',
    requiresAdmin: true,
    title: 'System Settings',
    titleKey: 'admin.settings.title',
    descriptionKey: 'admin.settings.description',
    round: 5,
    nav: { section: 'admin', group: 'system', labelKey: 'nav.settings', icon: 'Settings', order: 70 }
  }
]

/**
 * 后端会绕过前端、直接交给网关或 API 的路径（§3.4）。
 * 前端路由与 public/ 下的静态资源都不得占用。
 */
export const RESERVED_BACKEND_PREFIXES: readonly string[] = [
  '/api',
  '/v1',
  '/v1beta',
  '/backend-api',
  '/antigravity',
  '/setup/', // `/setup` 本身仍是前端页面
  '/health',
  '/models',
  '/responses',
  '/chat/completions',
  '/embeddings',
  '/messages/count_tokens',
  '/alpha/search',
  '/web_search',
  '/x_search',
  '/tts',
  '/stt',
  '/realtime',
  '/custom-voices',
  '/contents/generations/tasks',
  '/v3/contents/generations/tasks',
  '/images',
  '/videos',
  '/.well-known/oauth-'
]

/** public/ 下禁止出现的顶层目录名（构建校验使用）。 */
export const RESERVED_PUBLIC_DIRS: readonly string[] = [
  'api',
  'v1',
  'v1beta',
  'backend-api',
  'antigravity',
  'health',
  'models',
  'responses',
  'chat',
  'embeddings',
  'messages',
  'alpha',
  'web_search',
  'x_search',
  'tts',
  'stt',
  'realtime',
  'custom-voices',
  'contents',
  'v3',
  'images',
  'videos'
]

export function isReservedBackendPath(pathname: string): boolean {
  return RESERVED_BACKEND_PREFIXES.some((prefix) => {
    if (prefix.endsWith('/') || prefix.startsWith('/.well-known')) return pathname.startsWith(prefix)
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
  })
}

// ───────────────── 匹配 ─────────────────

export interface RouteMatch {
  route: RouteDef
  params: Record<string, string>
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '')
  return pathname || '/'
}

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const a = pattern.split('/')
  const b = pathname.split('/')
  if (a.length !== b.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) {
      if (!b[i]) return null
      try {
        params[a[i].slice(1)] = decodeURIComponent(b[i])
      } catch {
        params[a[i].slice(1)] = b[i]
      }
    } else if (a[i] !== b[i]) {
      return null
    }
  }
  return params
}

// 静态路径优先于动态路径
const SORTED_ROUTES = [...ROUTES].sort((x, y) => Number(x.path.includes(':')) - Number(y.path.includes(':')))

export function matchRoute(pathname: string): RouteMatch | null {
  const normalized = normalizePathname(pathname)
  for (const route of SORTED_ROUTES) {
    const params = matchPattern(route.path, normalized)
    if (params) return { route, params }
  }
  return null
}

export function getRouteByName(name: string): RouteDef | undefined {
  return ROUTES.find((route) => route.name === name)
}

/** 默认 true，与 Vue 的 `meta.requiresAuth !== false` 一致。 */
export function routeRequiresAuth(route: RouteDef): boolean {
  return route.requiresAuth !== false
}

/** Next 文件路由路径（`:id` → `[id]`）。 */
export function routeToPagesFile(route: RouteDef): string {
  const segments = route.path
    .split('/')
    .filter(Boolean)
    .map((seg) => (seg.startsWith(':') ? `[${seg.slice(1)}]` : seg))
  return segments.length ? `${segments.join('/')}.tsx` : 'index.tsx'
}
