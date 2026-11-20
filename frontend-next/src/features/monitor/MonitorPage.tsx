import { MonitorV2Page } from '@/features/channel-monitor-v2/MonitorV2Page'
import { useAppStore } from '@/stores/app'
import { isChannelMonitorV1Mode } from '@/utils/featureFlags'
import { MonitorV1Page } from './MonitorV1Page'

/** /monitor：按 channel_monitor_mode 在 V1 / V2 之间切换（与 Vue 版 ChannelStatusView 一致）。 */
export function MonitorPage() {
  // 订阅公开设置，使模式切换时重新渲染
  useAppStore((s) => s.cachedPublicSettings)
  return isChannelMonitorV1Mode() ? <MonitorV1Page /> : <MonitorV2Page />
}
