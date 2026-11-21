import * as React from 'react'
import type { CaptchaChallengeHandle, CaptchaChallengeProps } from './CaptchaChallenge'

export type { ActionCaptchaResult, CaptchaChallengeHandle, CaptchaChallengeProps } from './CaptchaChallenge'

const Inner = React.lazy(() => import('./CaptchaChallenge').then((m) => ({ default: m.CaptchaChallenge })))

/**
 * 验证码组件按需加载：Turnstile / 腾讯 / 阿里云的加载与状态机约 20KB，
 * 只有公开设置里启用了验证码时才下载（首屏 JS 预算）。
 */
export const CaptchaChallenge = React.forwardRef<CaptchaChallengeHandle, CaptchaChallengeProps>(
  function CaptchaChallenge(props, ref) {
    return (
      <React.Suspense fallback={<div className="min-h-[65px] w-full" aria-hidden />}>
        <Inner {...props} ref={ref} />
      </React.Suspense>
    )
  }
)
