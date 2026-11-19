import * as React from 'react'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getLocale } from '@/i18n'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'

interface AliyunCaptchaVerifyResult {
  captchaResult: boolean
  bizResult?: boolean
}
interface AliyunCaptchaInitOptions {
  SceneId: string
  prefix: string
  mode: 'popup' | 'embed'
  element: string
  button: string
  captchaVerifyCallback: (
    captchaVerifyParam: string
  ) => AliyunCaptchaVerifyResult | Promise<AliyunCaptchaVerifyResult>
  onBizResultCallback: (bizResult: boolean) => void
  getInstance: (instance: unknown) => void
  slideStyle?: { width: number; height: number }
  language?: string
}
declare global {
  interface Window {
    initAliyunCaptcha?: (options: AliyunCaptchaInitOptions) => void
    AliyunCaptchaConfig?: { region: string; prefix: string }
  }
}

export interface AliyunCaptchaHandle {
  verify: () => Promise<string | null>
  reset: () => void
}

interface Props {
  sceneId: string
  prefix: string
  region?: 'cn' | 'sgp'
  onVerify: (param: string) => void
  onExpire?: () => void
  onError?: () => void
}

const SCRIPT_SRC = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js'
const POPUP_ID = 'aliyunCaptcha-window-popup'
const MASK_ID = 'aliyunCaptcha-mask'
const POPUP_OPEN_TIMEOUT_MS = 8000
const POPUP_WATCH_INTERVAL_MS = 300

type State = 'idle' | 'verifying' | 'verified'

/**
 * 阿里云验证码（popup 模式）。逻辑与 Vue 版一致：
 * captchaVerifyParam 为一次性参数；SDK 没有关闭回调，靠轮询弹窗可见性判断用户关闭 / 打开失败。
 */
export const AliyunCaptchaWidget = React.forwardRef<AliyunCaptchaHandle, Props>(function AliyunCaptchaWidget(
  { sceneId, prefix, region = 'cn', onVerify, onError },
  ref
) {
  useLocale()
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const buttonId = `aliyun-captcha-button-${uid}`
  const elementId = `aliyun-captcha-element-${uid}`
  const [state, setState] = React.useState<State>('idle')
  const stateRef = React.useRef<State>('idle')
  const cb = React.useRef({ onVerify, onError })
  cb.current = { onVerify, onError }

  const cachedParam = React.useRef<string | null>(null)
  const pending = React.useRef<((v: string | null) => void) | null>(null)
  const watchTimer = React.useRef<number | null>(null)
  const readyPromise = React.useRef<Promise<void> | null>(null)

  const setS = React.useCallback((s: State) => {
    stateRef.current = s
    setState(s)
  }, [])

  const settlePending = React.useCallback((value: string | null) => {
    const current = pending.current
    pending.current = null
    current?.(value)
  }, [])

  const stopWatch = React.useCallback(() => {
    if (watchTimer.current !== null) {
      window.clearInterval(watchTimer.current)
      watchTimer.current = null
    }
  }, [])

  const onParam = React.useCallback(
    (param: string) => {
      stopWatch()
      cachedParam.current = param
      setS('verified')
      cb.current.onVerify(param)
      settlePending(param)
    },
    [setS, settlePending, stopWatch]
  )

  const startWatch = React.useCallback(() => {
    stopWatch()
    const startedAt = Date.now()
    let seen = false
    watchTimer.current = window.setInterval(() => {
      if (stateRef.current === 'verified') {
        stopWatch()
        return
      }
      const popup = document.getElementById(POPUP_ID)
      if (popup && window.getComputedStyle(popup).display !== 'none') {
        seen = true
        return
      }
      if (seen || Date.now() - startedAt > POPUP_OPEN_TIMEOUT_MS) {
        stopWatch()
        setS('idle')
        settlePending(null)
        return
      }
      document.getElementById(buttonId)?.click()
    }, POPUP_WATCH_INTERVAL_MS)
  }, [buttonId, setS, settlePending, stopWatch])

  const ensureReady = React.useCallback((): Promise<void> => {
    if (!readyPromise.current) {
      const p = new Promise<void>((resolve, reject) => {
        window.AliyunCaptchaConfig = { region, prefix }
        if (window.initAliyunCaptcha) {
          resolve()
          return
        }
        const existing = document.querySelector<HTMLScriptElement>(
          'script[src*="aliyunCaptcha/AliyunCaptcha"]'
        )
        if (existing) {
          existing.addEventListener('load', () => resolve())
          existing.addEventListener('error', () => reject(new Error('Failed to load Aliyun captcha script')))
          return
        }
        const script = document.createElement('script')
        script.src = SCRIPT_SRC
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load Aliyun captcha script'))
        document.head.appendChild(script)
      }).then(() => {
        if (!window.initAliyunCaptcha) throw new Error('Aliyun captcha script not ready')
        window.initAliyunCaptcha({
          SceneId: sceneId,
          prefix,
          mode: 'popup',
          element: `#${elementId}`,
          button: `#${buttonId}`,
          // 不发业务请求，只把 captchaVerifyParam 交给页面，随业务请求的 turnstile_token 字段提交
          captchaVerifyCallback: (param: string) => {
            onParam(param)
            return { captchaResult: true }
          },
          onBizResultCallback: () => {},
          getInstance: () => {},
          slideStyle: { width: 360, height: 40 },
          language: getLocale().startsWith('zh') ? 'cn' : 'en'
        })
      })
      readyPromise.current = p
      p.catch(() => {
        readyPromise.current = null
      })
    }
    return readyPromise.current
  }, [buttonId, elementId, onParam, prefix, region, sceneId])

  React.useImperativeHandle(
    ref,
    () => ({
      verify: async () => {
        if (stateRef.current === 'verified' && cachedParam.current) return cachedParam.current
        settlePending(null)
        await ensureReady()
        return new Promise<string | null>((resolve) => {
          pending.current = resolve
          document.getElementById(buttonId)?.click()
        })
      },
      reset: () => {
        stopWatch()
        settlePending(null)
        cachedParam.current = null
        setS('idle')
      }
    }),
    [buttonId, ensureReady, setS, settlePending, stopWatch]
  )

  React.useEffect(() => {
    if (!sceneId || !prefix) return
    const button = document.getElementById(buttonId)
    const onClick = () => {
      if (stateRef.current === 'verified') return
      setS('verifying')
      if (watchTimer.current === null) startWatch()
    }
    button?.addEventListener('click', onClick)
    ensureReady().catch(() => cb.current.onError?.())
    return () => {
      button?.removeEventListener('click', onClick)
      stopWatch()
      settlePending(null)
      // SDK 不会自清理弹窗 DOM，残留会导致下次挂载时回调重复触发
      document.getElementById(MASK_ID)?.remove()
      document.getElementById(POPUP_ID)?.remove()
      readyPromise.current = null
    }
  }, [buttonId, ensureReady, prefix, sceneId, setS, settlePending, startWatch, stopWatch])

  if (!sceneId || !prefix) return null
  const text =
    state === 'verified'
      ? t('auth.captchaVerified')
      : state === 'verifying'
        ? t('auth.captchaVerifying')
        : t('auth.captchaClickToVerify')
  return (
    <div className="w-full">
      <button
        id={buttonId}
        type="button"
        disabled={state === 'verified'}
        className={cn(
          'flex min-h-11 w-full items-center justify-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-default',
          state === 'verified' && 'border-success/60 bg-success/10 text-success'
        )}
      >
        {state === 'verified' ? (
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        ) : (
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
        )}
        <span>{text}</span>
      </button>
      <div id={elementId} />
    </div>
  )
})
