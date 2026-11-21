/** 新手引导的纯逻辑（存储键 / 交互步骤判定 / 自动启动条件）。 */
import type { DriveStep } from 'driver.js'

export const TOUR_STORAGE_VERSION = 'v4_interactive'

export const TIMING = {
  /** 交互式步骤完成后的等待时间（让用户看到操作结果）。 */
  INTERACTIVE_WAIT_MS: 800,
  ELEMENT_TIMEOUT_MS: 8000,
  AUTO_START_DELAY_MS: 1000
} as const

/** 只显示“关闭”按钮的步骤即交互式步骤（需要用户实际操作）。 */
export function isInteractiveStep(step: DriveStep | undefined): boolean {
  return step?.popover?.showButtons?.length === 1 && step.popover.showButtons[0] === 'close'
}

export function tourStorageKey(
  user: { id?: number; role?: string } | null,
  baseKey = 'onboarding_tour'
): string {
  return `${baseKey}_${user?.id ?? 'guest'}_${user?.role ?? 'user'}_${TOUR_STORAGE_VERSION}`
}

/** 仅标准模式下的管理员自动启动引导；简易模式一律禁用。 */
export function shouldAutoStartTour(opts: {
  isAdmin: boolean
  isSimpleMode: boolean
  seen: boolean
  autoStart: boolean
}): boolean {
  return opts.autoStart && opts.isAdmin && !opts.isSimpleMode && !opts.seen
}
