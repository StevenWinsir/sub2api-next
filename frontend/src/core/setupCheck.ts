import { getSetupStatus } from '@/api/setup'

let pending: Promise<boolean> | null = null

/**
 * 查询是否需要安装（单飞缓存，整个会话只请求一次；失败按"已安装"处理，与 App.vue 一致）。
 * 门禁与启动副作用共用同一个结果，避免"门禁先跳登录页、安装检查后到"的竞态。
 */
export function checkNeedsSetup(): Promise<boolean> {
  pending ??= getSetupStatus()
    .then((status) => status.needs_setup === true)
    .catch(() => false)
  return pending
}

/** 仅供测试重置。 */
export function __resetSetupCheckForTests(): void {
  pending = null
}
