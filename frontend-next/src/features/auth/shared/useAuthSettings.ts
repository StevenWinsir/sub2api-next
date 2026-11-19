import * as React from 'react'
import { getPublicSettings } from '@/api/auth'
import type { PublicSettings } from '@/types'

/**
 * 认证类页面读取公开设置：与 Vue 版一致，每个页面独立调用 getPublicSettings()；
 * 失败时 settings 为 null（调用方按“fail-closed / 关闭”处理），loaded 总会变为 true。
 */
export function useAuthSettings(): { settings: PublicSettings | null; loaded: boolean } {
  const [state, setState] = React.useState<{ settings: PublicSettings | null; loaded: boolean }>({
    settings: null,
    loaded: false
  })
  React.useEffect(() => {
    let cancelled = false
    getPublicSettings()
      .then((settings) => !cancelled && setState({ settings, loaded: true }))
      .catch((error) => {
        console.error('Failed to load public settings:', error)
        if (!cancelled) setState({ settings: null, loaded: true })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

export function getQueryParam(name: string): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get(name) ?? ''
}
