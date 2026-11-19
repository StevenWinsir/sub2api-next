/**
 * 全局事件桥：API 层通过 window 事件通知（admin-compliance-required / ops-monitoring-disabled），
 * 这里统一订阅并转换为 store 动作。返回取消订阅函数，幂等且兼容 StrictMode 双执行。
 */
import { useAdminComplianceStore } from '@/stores/adminCompliance'
import { useAdminSettingsStore } from '@/stores/adminSettings'

export const ADMIN_COMPLIANCE_EVENT = 'admin-compliance-required'
export const OPS_MONITORING_DISABLED_EVENT = 'ops-monitoring-disabled'

export function installGlobalEventBridge(): () => void {
  const onCompliance = (event: Event) => {
    const detail = (event as CustomEvent<Record<string, string> | undefined>).detail
    useAdminComplianceStore.getState().requireAcknowledgement(detail)
  }
  const onOpsDisabled = () => {
    useAdminSettingsStore.getState().setOpsMonitoringEnabledLocal(false)
  }
  window.addEventListener(ADMIN_COMPLIANCE_EVENT, onCompliance)
  window.addEventListener(OPS_MONITORING_DISABLED_EVENT, onOpsDisabled)
  return () => {
    window.removeEventListener(ADMIN_COMPLIANCE_EVENT, onCompliance)
    window.removeEventListener(OPS_MONITORING_DISABLED_EVENT, onOpsDisabled)
  }
}
