import * as React from 'react'
import { cn } from '@/lib/utils'
import { getLocale } from '@/i18n'
import {
  loadTencentCaptcha,
  normalizeTencentCaptchaRegion,
  type TencentCaptchaProof,
  type TencentCaptchaResult
} from '@/utils/tencentCaptcha'

export interface TencentCaptchaHandle {
  verify: () => Promise<TencentCaptchaProof | null>
  reset: () => void
}

interface Props {
  appId: string
  region?: string
}

// 腾讯国际站票据官方有效期为 5 分钟，提前 1 分钟放弃缓存，避免提交时刚好过期。
const CACHED_PROOF_MAX_AGE_MS = 4 * 60 * 1000

interface Instance {
  show(): void
  destroy(): void
}

/**
 * 腾讯天御验证码。国内站为弹窗；国际站需要一个承载 Robot checkbox 的容器（首屏预加载，
 * 用户确认后票据被缓存，提交时直接消费）。逻辑与 Vue 版 TencentCaptchaGate 逐条对应。
 */
export const TencentCaptchaGate = React.forwardRef<TencentCaptchaHandle, Props>(function TencentCaptchaGate(
  { appId, region = 'cn' },
  ref
) {
  const isInternational = normalizeTencentCaptchaRegion(region) === 'intl'
  const [containerVisible, setContainerVisible] = React.useState(isInternational)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const props = React.useRef({ appId, region })
  props.current = { appId, region }
  const state = React.useRef({
    instance: null as Instance | null,
    pending: null as Promise<TencentCaptchaProof | null> | null,
    cancelPending: null as (() => void) | null,
    cachedProof: null as TencentCaptchaProof | null,
    cachedProofCreatedAt: 0,
    mounted: false
  })

  const nextTick = () => new Promise<void>((r) => window.setTimeout(r, 0))

  const create = React.useCallback((revealInternational = true): Promise<TencentCaptchaProof | null> => {
    const s = state.current
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void, keepContainer = false) => {
        if (settled) return
        settled = true
        if (s.cancelPending === cancel) s.cancelPending = null
        if (!keepContainer) {
          s.instance?.destroy()
          s.instance = null
          setContainerVisible(false)
        }
        callback()
      }
      const cancel = () => finish(() => resolve(null))
      s.cancelPending = cancel
      const reg = normalizeTencentCaptchaRegion(props.current.region)
      if (reg === 'intl' && revealInternational) setContainerVisible(true)
      nextTick()
        .then(() => loadTencentCaptcha(reg))
        .then((TencentCaptcha) => {
          if (s.cancelPending !== cancel) return
          const userLanguage = getLocale().startsWith('zh') ? 'zh-cn' : 'en'
          const handleResult = (result: TencentCaptchaResult) => {
            if (result.ret === 2) {
              finish(() => resolve(null))
              return
            }
            const ticket = result.ticket?.trim() || ''
            const randstr = result.randstr?.trim() || ''
            if (!ticket || !randstr || ticket.startsWith('trerror_') || result.errorCode !== undefined) {
              finish(() => reject(new Error('Tencent Captcha verification failed')))
              return
            }
            // 国际站保留已勾选的控件，避免成功回调后页面跳动；流程结束时由 reset 清理
            finish(() => resolve({ ticket, randstr }), reg === 'intl')
          }
          if (reg === 'intl') {
            const container = containerRef.current
            if (!container) throw new Error('Tencent Captcha international container is unavailable')
            s.instance = new TencentCaptcha(container, props.current.appId, handleResult, {
              enableAutoCheck: false,
              userLanguage,
              type: 'popup'
            })
          } else {
            s.instance = new TencentCaptcha(props.current.appId, handleResult, { userLanguage })
          }
          s.instance.show()
        })
        .catch((error: unknown) => finish(() => reject(error)))
    })
  }, [])

  const preload = React.useCallback(() => {
    const s = state.current
    if (!isInternational || s.pending || s.cachedProof) return
    const verification = create(true)
    s.pending = verification
    void verification
      .then((proof) => {
        if (proof) {
          s.cachedProof = proof
          s.cachedProofCreatedAt = Date.now()
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (s.pending === verification) s.pending = null
      })
  }, [create, isInternational])

  const reset = React.useCallback(
    (reinitialize = true) => {
      const s = state.current
      s.instance?.destroy()
      s.instance = null
      s.cancelPending?.()
      s.cancelPending = null
      s.pending = null
      s.cachedProof = null
      s.cachedProofCreatedAt = 0
      setContainerVisible(isInternational)
      // 国际站票据一次性使用，失败后需立即创建新的 checkbox；卸载阶段不再预加载
      if (reinitialize && s.mounted && isInternational) {
        void nextTick().then(() => {
          if (state.current.mounted) preload()
        })
      }
    },
    [isInternational, preload]
  )

  const verify = React.useCallback((): Promise<TencentCaptchaProof | null> => {
    const s = state.current
    if (s.cachedProof) {
      if (Date.now() - s.cachedProofCreatedAt >= CACHED_PROOF_MAX_AGE_MS) {
        reset(false)
      } else {
        const proof = s.cachedProof
        s.cachedProof = null
        s.cachedProofCreatedAt = 0
        s.pending = null
        return Promise.resolve(proof)
      }
    }
    if (s.pending) {
      const verification = s.pending
      setContainerVisible(true)
      void nextTick().then(() => {
        if (s.pending === verification) s.instance?.show()
      })
      return verification.then((proof) => {
        if (s.cachedProof === proof) {
          s.cachedProof = null
          s.cachedProofCreatedAt = 0
        }
        return proof
      })
    }
    setContainerVisible(true)
    const verification = create(true)
    s.pending = verification
    const clear = () => {
      if (s.pending === verification) s.pending = null
    }
    void verification.then(clear, clear)
    return verification
  }, [create, reset])

  React.useImperativeHandle(ref, () => ({ verify, reset: () => reset(true) }), [verify, reset])

  React.useEffect(() => {
    const s = state.current
    s.mounted = true
    preload()
    return () => {
      s.mounted = false
      reset(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isInternational) return null
  return (
    <div
      ref={containerRef}
      data-testid="tencent-captcha-international-container"
      className={cn(
        containerVisible
          ? 'flex min-h-[60px] w-full justify-center'
          : 'pointer-events-none fixed left-1/2 top-0 flex h-[60px] w-[302px] -translate-x-1/2 scale-[0.01] opacity-0'
      )}
    />
  )
})
