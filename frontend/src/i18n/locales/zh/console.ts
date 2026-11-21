/**
 * 控制台语言包（admin.* 与 adminAccessKeys.*）。
 * 公共页 / 认证页 / 安装向导不加载它（首屏 JS 预算）；用户控制台与管理后台布局在渲染前按需加载。
 * 因此 features/auth、home、setup、key-usage、legal、model-plaza 等公共页代码不得引用这些键
 * （由 localeScopes.spec.ts 守护）。
 */
import adminAccessKeys from './adminAccessKeys'
import admin from './admin'
import adminUi from './adminUi'

export default {
  adminAccessKeys,
  admin,
  ...adminUi,
}
