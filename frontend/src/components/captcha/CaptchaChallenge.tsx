import * as React from 'react'
import { AliyunCaptchaWidget, type AliyunCaptchaHandle } from './AliyunCaptchaWidget'
import { TencentCaptchaGate, type TencentCaptchaHandle } from './TencentCaptchaGate'
import { TurnstileWidget, type TurnstileHandle } from './TurnstileWidget'

/** 动作触发式验证（腾讯 / 阿里云弹窗）的结果：腾讯 token=ticket、randstr 非空；阿里云 token=captchaVerifyParam、randstr 恒为空。 */
export interface ActionCaptchaResult {
  token: string
  randstr: string
}

export interface CaptchaChallengeHandle {
  reset: () => void
  verifyAction: () => Promise<ActionCaptchaResult | null>
}

export interface CaptchaChallengeProps {
  turnstileEnabled: boolean
  turnstileSiteKey: string
  tencentEnabled: boolean
  tencentAppId: string
  tencentRegion?: string
  aliyunEnabled?: boolean
  aliyunSceneId?: string
  aliyunPrefix?: string
  aliyunRegion?: string
  onVerify: (tokenOrTicket: string, randstr: string) => void
  onExpire?: () => void
  onError?: () => void
}

/** 按公开设置三选一：Turnstile > 腾讯 > 阿里云（与 Vue 版优先级一致）。 */
export const CaptchaChallenge = React.forwardRef<CaptchaChallengeHandle, CaptchaChallengeProps>(
  function CaptchaChallenge(props, ref) {
    const turnstileRef = React.useRef<TurnstileHandle>(null)
    const tencentRef = React.useRef<TencentCaptchaHandle>(null)
    const aliyunRef = React.useRef<AliyunCaptchaHandle>(null)
    const p = React.useRef(props)
    p.current = props

    React.useImperativeHandle(ref, () => ({
      reset: () => {
        turnstileRef.current?.reset()
        tencentRef.current?.reset()
        aliyunRef.current?.reset()
      },
      verifyAction: async () => {
        const cur = p.current
        if (cur.tencentEnabled && cur.tencentAppId) {
          try {
            const proof = (await tencentRef.current?.verify()) ?? null
            return proof ? { token: proof.ticket, randstr: proof.randstr } : null
          } catch {
            cur.onError?.()
            return null
          }
        }
        if (cur.aliyunEnabled && cur.aliyunSceneId && cur.aliyunPrefix) {
          try {
            const param = (await aliyunRef.current?.verify()) ?? null
            return param ? { token: param, randstr: '' } : null
          } catch {
            cur.onError?.()
            return null
          }
        }
        return null
      }
    }))

    if (props.turnstileEnabled && props.turnstileSiteKey) {
      return (
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={props.turnstileSiteKey}
          onVerify={(token) => props.onVerify(token, '')}
          onExpire={props.onExpire}
          onError={props.onError}
        />
      )
    }
    if (props.tencentEnabled && props.tencentAppId) {
      return <TencentCaptchaGate ref={tencentRef} appId={props.tencentAppId} region={props.tencentRegion} />
    }
    if (props.aliyunEnabled && props.aliyunSceneId && props.aliyunPrefix) {
      return (
        <AliyunCaptchaWidget
          ref={aliyunRef}
          sceneId={props.aliyunSceneId}
          prefix={props.aliyunPrefix}
          region={props.aliyunRegion === 'sgp' ? 'sgp' : 'cn'}
          onVerify={(param) => props.onVerify(param, '')}
          onExpire={props.onExpire}
          onError={props.onError}
        />
      )
    }
    return null
  }
)
