import * as React from 'react'

interface TurnstileRenderOptions {
  sitekey: string
  callback: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact' | 'flexible'
}
interface TurnstileAPI {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileAPI
    onTurnstileLoad?: () => void
  }
}

export interface TurnstileHandle {
  reset: () => void
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    window.onTurnstileLoad = () => resolve()
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Failed to load Turnstile script'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

interface Props {
  siteKey: string
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact' | 'flexible'
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

/** Cloudflare Turnstile。脚本动态加载（域名在后端 CSP 白名单内），回调通过 ref 保持最新。 */
export const TurnstileWidget = React.forwardRef<TurnstileHandle, Props>(function TurnstileWidget(
  { siteKey, theme = 'auto', size = 'flexible', onVerify, onExpire, onError },
  ref
) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const widgetId = React.useRef<string | null>(null)
  const cb = React.useRef({ onVerify, onExpire, onError })
  cb.current = { onVerify, onExpire, onError }

  React.useImperativeHandle(ref, () => ({
    reset: () => {
      if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current)
    }
  }))

  React.useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    loadScript()
      .then(() => {
        const el = containerRef.current
        if (cancelled || !window.turnstile || !el) return
        el.innerHTML = ''
        widgetId.current = window.turnstile.render(el, {
          sitekey: siteKey,
          callback: (token) => cb.current.onVerify(token),
          'expired-callback': () => cb.current.onExpire?.(),
          'error-callback': () => cb.current.onError?.(),
          theme,
          size
        })
      })
      .catch(() => cb.current.onError?.())
    return () => {
      cancelled = true
      if (window.turnstile && widgetId.current) {
        try {
          window.turnstile.remove(widgetId.current)
        } catch {
          /* ignore */
        }
      }
      widgetId.current = null
    }
  }, [siteKey, theme, size])

  return <div ref={containerRef} className="min-h-[65px] w-full [&_iframe]:!w-full" />
})
