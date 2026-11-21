import * as React from 'react'
import { useAppStore } from '@/stores/app'
import { t } from '@/i18n'

/** 复制到剪贴板（对应 composables/useClipboard）：优先 Clipboard API，降级 execCommand，并给出 Toast 反馈。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 降级 */
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

export function useClipboard(resetMs = 1800) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const copy = React.useCallback(
    async (text: string, options: { toast?: boolean } = {}) => {
      const ok = await copyText(text)
      if (ok) {
        setCopied(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), resetMs)
        if (options.toast !== false) useAppStore.getState().showSuccess(t('ui.shell.copied'))
      } else {
        useAppStore.getState().showError(t('common.unknownError'))
      }
      return ok
    },
    [resetMs]
  )
  return { copied, copy }
}
