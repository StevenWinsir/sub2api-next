import { t } from '@/i18n'
import { useAppStore } from '@/stores/app'
import { isStepUpCancelled } from '@/hooks/useStepUp'
import { extractApiErrorMessage } from '@/utils/apiError'

export const notifySuccess = (message: string) => useAppStore.getState().showSuccess(message)

/** 错误 Toast；Step-up 取消静默。 */
export function notifyError(error: unknown, fallback?: string): void {
  if (isStepUpCancelled(error)) return
  useAppStore.getState().showError(extractApiErrorMessage(error, fallback ?? t('common.unknownError')))
}
