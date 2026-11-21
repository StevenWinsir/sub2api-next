import * as React from 'react'
import { isStepUpCancelled, type StepUpController } from '@/hooks/useStepUp'
import { t } from '@/i18n'
import { useAppStore } from '@/stores/app'
import { extractApiErrorMessage } from '@/utils/apiError'

export interface RunOptions {
  /** 成功提示文案。 */
  success?: string
  /** 失败时的兜底文案。 */
  fallback?: string
  /** 需要 Step-up 的操作传入控制器，由其包裹重放。 */
  stepUp?: StepUpController
}

/**
 * 管理端异步动作包装：Toast 反馈、Step-up 取消静默、返回 undefined 表示失败。
 * `busy` 用于按钮加载态（防重复提交）。
 */
export function useAdminAction() {
  const [busy, setBusy] = React.useState(false)
  const run = React.useCallback(
    async <T>(fn: () => Promise<T>, opts: RunOptions = {}): Promise<T | undefined> => {
      setBusy(true)
      try {
        const result = await (opts.stepUp ? opts.stepUp.run(fn) : fn())
        if (opts.success) useAppStore.getState().showSuccess(opts.success)
        return result
      } catch (error) {
        if (!isStepUpCancelled(error)) {
          useAppStore
            .getState()
            .showError(extractApiErrorMessage(error, opts.fallback ?? t('common.unknownError')))
        }
        return undefined
      } finally {
        setBusy(false)
      }
    },
    []
  )
  return { busy, run }
}
