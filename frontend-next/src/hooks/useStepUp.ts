/**
 * Step-up (sudo) 2FA（对应 composables/useStepUp）。
 *
 * 包装敏感操作：后端返回 STEP_UP_REQUIRED 时弹出 TOTP 验证，换取短期授权后透明重放原操作。
 * 用户取消时抛出 StepUpCancelledError，调用方应静默处理（不弹错误 Toast）。
 *
 * 用法：
 *   const stepUp = useStepUp()
 *   await stepUp.run(() => adminAPI.accounts.exportData(...))
 *   <TotpStepUpDialog controller={stepUp} />
 */
import * as React from 'react'

const STEP_UP_REQUIRED = 'STEP_UP_REQUIRED'
const STEP_UP_TOTP_NOT_ENABLED = 'STEP_UP_TOTP_NOT_ENABLED'
const STEP_UP_ADMIN_API_KEY_FORBIDDEN = 'STEP_UP_ADMIN_API_KEY_FORBIDDEN'

export class StepUpCancelledError extends Error {
  readonly code = 'STEP_UP_CANCELLED'
  constructor() {
    super('step-up verification cancelled by user')
    this.name = 'StepUpCancelledError'
  }
}

export function isStepUpCancelled(err: unknown): boolean {
  return err instanceof StepUpCancelledError
}

interface ApiError {
  status?: number
  code?: string | number
  reason?: string
  message?: string
}

/** 兼容两种错误信封（code 或 reason）。 */
function markerOf(err: unknown): string {
  const e = (err ?? {}) as ApiError
  const candidates = [e.code, e.reason].map((v) => (typeof v === 'string' ? v : ''))
  return candidates.find((v) => v.startsWith('STEP_UP')) || ''
}

export function isStepUpRequired(err: unknown): boolean {
  return markerOf(err) === STEP_UP_REQUIRED
}

export function isStepUpBlocked(err: unknown): boolean {
  const m = markerOf(err)
  return m === STEP_UP_TOTP_NOT_ENABLED || m === STEP_UP_ADMIN_API_KEY_FORBIDDEN
}

export function stepUpBlockReason(err: unknown): string {
  return markerOf(err)
}

export interface StepUpController {
  visible: boolean
  blockedReason: string
  prompt: () => Promise<boolean>
  onVerified: () => void
  onCancel: () => void
  run: <T>(action: () => Promise<T>) => Promise<T>
}

export function useStepUp(): StepUpController {
  const [visible, setVisible] = React.useState(false)
  const [blockedReason, setBlockedReason] = React.useState('')
  const resolver = React.useRef<((ok: boolean) => void) | null>(null)
  const pendingPrompt = React.useRef<Promise<boolean> | null>(null)

  const prompt = React.useCallback((): Promise<boolean> => {
    if (pendingPrompt.current) return pendingPrompt.current
    setVisible(true)
    pendingPrompt.current = new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
    return pendingPrompt.current
  }, [])

  const settle = React.useCallback((ok: boolean) => {
    setVisible(false)
    resolver.current?.(ok)
    resolver.current = null
    pendingPrompt.current = null
  }, [])
  const onVerified = React.useCallback(() => settle(true), [settle])
  const onCancel = React.useCallback(() => settle(false), [settle])

  const run = React.useCallback(
    async <T>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action()
      } catch (err) {
        if (isStepUpBlocked(err)) {
          setBlockedReason(markerOf(err))
          throw err
        }
        if (!isStepUpRequired(err)) throw err
        const ok = await prompt()
        if (!ok) throw new StepUpCancelledError()
        // 现在会话持有 step-up 授权，重放一次
        return await action()
      }
    },
    [prompt]
  )

  return React.useMemo(
    () => ({ visible, blockedReason, prompt, onVerified, onCancel, run }),
    [visible, blockedReason, prompt, onVerified, onCancel, run]
  )
}
