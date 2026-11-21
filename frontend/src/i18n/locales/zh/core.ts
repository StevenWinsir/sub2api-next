/**
 * 核心语言包（首屏加载）：公共页、认证页、安装向导与控制台共用。
 * 体量最大的 admin.* / adminAccessKeys.* 拆在 console.ts，仅控制台布局渲染前按需加载。
 */
import mcp from './mcp'
import landing from './landing'
import common from './common'
import dashboard from './dashboard'
import channelMonitorV2 from './channelMonitorV2'
import batchImage from './batchImage'
import misc from './misc'
import ui from './ui'

export default {
  mcp,
  ...landing,
  ...common,
  ...dashboard,
  ...channelMonitorV2,
  ...batchImage,
  ...misc,
  ...ui,
}
