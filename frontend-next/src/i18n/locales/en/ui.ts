/** 新前端（Next.js）新增的界面文案，独立命名空间 `ui`，不改动与上游同步的语言包文件。 */
export default {
  ui: {
    navGroup: {
      overview: 'Overview',
      api: 'API',
      resources: 'Resources',
      billing: 'Billing',
      growth: 'Growth',
      account: 'Account',
      users: 'Users & Subscriptions',
      channels: 'Channels & Accounts',
      commerce: 'Commerce',
      content: 'Content',
      security: 'Security & Compliance',
      system: 'System',
      custom: 'Custom'
    },
    shell: {
      skipToContent: 'Skip to content',
      search: 'Search',
      searchPlaceholder: 'Search pages and actions…',
      commandPalette: 'Command palette',
      noResults: 'No results found.',
      pages: 'Pages',
      actions: 'Quick actions',
      toggleTheme: 'Toggle theme',
      themeLight: 'Light',
      themeDark: 'Dark',
      themeSystem: 'System',
      language: 'Language',
      userMenu: 'User menu',
      userConsole: 'User console',
      adminConsole: 'Admin console',
      signOut: 'Sign out',
      collapseSidebar: 'Collapse sidebar',
      expandSidebar: 'Expand sidebar',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
      notifications: 'Announcements',
      copyApiBase: 'Copy API base URL',
      copied: 'Copied to clipboard',
      balance: 'Balance',
      home: 'Home',
      docs: 'Documentation',
      contact: 'Contact',
      legal: 'Legal'
    },
    boot: {
      loading: 'Loading…',
      errorTitle: 'The page could not be loaded',
      errorDescription:
        'The application kept redirecting while starting up. This usually happens right after an update with stale cached files.',
      clearCacheRetry: 'Clear cache and retry'
    },
    notFound: {
      title: 'Page not found',
      description: 'The page you are looking for does not exist or has been moved.',
      backHome: 'Back to home'
    },
    placeholder: {
      badge: 'Under construction',
      description: 'This page is registered in the route table and will be implemented in a later delivery round.',
      route: 'Route',
      layout: 'Layout',
      access: 'Access',
      round: 'Delivery round',
      params: 'Parameters',
      accessPublic: 'Public',
      accessUser: 'Signed-in users',
      accessAdmin: 'Administrators',
      flags: 'Gates',
      flagPayment: 'Payment enabled',
      flagRiskControl: 'Risk control enabled',
      flagSubscription: 'Subscription enabled',
      flagSimple: 'Hidden in simple mode',
      flagBackend: 'Allowed in backend mode',
      none: 'None'
    },
    login: {
      title: 'Welcome back',
      subtitle: 'Sign in to your account to continue',
      email: 'Email',
      password: 'Password',
      submit: 'Sign in',
      submitting: 'Signing in…',
      sessionExpired: 'Your session has expired. Please sign in again.',
      brandTagline: 'One gateway for every AI model.',
      brandPoint1: 'Unified API for the leading model providers',
      brandPoint2: 'Transparent usage, billing and quotas',
      brandPoint3: 'Built for reliability, security and scale',
      totpTitle: 'Two-factor verification',
      totpDescription: 'Enter the 6-digit code from your authenticator app.',
      totpCode: 'Verification code',
      totpSubmit: 'Verify',
      alreadySignedIn: 'You are already signed in.'
    },
    table: {
      noData: 'No data',
      rowsPerPage: 'Rows per page',
      pageOf: 'Page {page} of {total}',
      previous: 'Previous',
      next: 'Next',
      selected: '{count} selected',
      columns: 'Columns'
    },
    common: {
      copy: 'Copy',
      copied: 'Copied',
      confirm: 'Confirm',
      cancel: 'Cancel',
      clear: 'Clear',
      reset: 'Reset',
      close: 'Close',
      search: 'Search',
      required: 'This field is required',
      pickDateRange: 'Pick a date range',
      status: {
        success: 'Success',
        warning: 'Warning',
        error: 'Error',
        info: 'Info',
        neutral: 'Neutral'
      }
    }
  }
}
