import * as React from 'react'
import type { ActionCaptchaRequestProof, PublicSettings } from '@/types'
import type { CaptchaChallengeHandle, CaptchaChallengeProps } from '@/components/captcha/LazyCaptchaChallenge'
import { t } from '@/i18n'

export interface CaptchaConfig {
  turnstileEnabled: boolean
  turnstileSiteKey: string
  tencentEnabled: boolean
  tencentAppId: string
  tencentRegion: string
  aliyunEnabled: boolean
  aliyunSceneId: string
  aliyunPrefix: string
  aliyunRegion: string
  /** 腾讯 / 阿里云：提交、OAuth 启动、passkey 时弹窗验证。 */
  actionEnabled: boolean
  /** 任意一种验证码已启用。 */
  enabled: boolean
}

export function resolveCaptchaConfig(s: Partial<PublicSettings> | null): CaptchaConfig {
  const turnstileEnabled = s?.turnstile_enabled === true
  const turnstileSiteKey = s?.turnstile_site_key || ''
  const tencentEnabled = s?.tencent_captcha_enabled === true
  const tencentAppId = s?.tencent_captcha_app_id || ''
  const aliyunEnabled = s?.aliyun_captcha_enabled === true
  const aliyunSceneId = s?.aliyun_captcha_scene_id || ''
  const aliyunPrefix = s?.aliyun_captcha_prefix || ''
  const aliyunReady = aliyunEnabled && !!aliyunSceneId && !!aliyunPrefix
  const actionEnabled = (tencentEnabled && !!tencentAppId) || aliyunReady
  return {
    turnstileEnabled,
    turnstileSiteKey,
    tencentEnabled,
    tencentAppId,
    tencentRegion: s?.tencent_captcha_region || 'cn',
    aliyunEnabled,
    aliyunSceneId,
    aliyunPrefix,
    aliyunRegion: s?.aliyun_captcha_region || 'cn',
    actionEnabled,
    enabled: (turnstileEnabled && !!turnstileSiteKey) || actionEnabled
  }
}

export interface CaptchaRequestFields {
  turnstile_token?: string
  tencent_captcha_ticket?: string
  tencent_captcha_randstr?: string
}

/** 一次验证产生的凭据：腾讯 token=ticket + randstr；阿里云 token=captchaVerifyParam、randstr 为空；Turnstile token。 */
export interface CaptchaValue {
  token: string
  randstr: string
}

/**
 * 把凭据映射为后端请求字段（纯函数，便于单测）：
 * 阿里云 captchaVerifyParam 复用 turnstile_token 字段；腾讯用 ticket + randstr。
 */
export function toRequestFields(config: CaptchaConfig, value: CaptchaValue): CaptchaRequestFields {
  return {
    turnstile_token: config.turnstileEnabled || config.aliyunEnabled ? value.token : undefined,
    tencent_captcha_ticket: config.tencentEnabled ? value.token : undefined,
    tencent_captcha_randstr: config.tencentEnabled ? value.randstr : undefined
  }
}

/** OAuth 启动 / passkey 等入口的请求凭据。 */
export function toActionProof(config: CaptchaConfig, value: CaptchaValue): ActionCaptchaRequestProof {
  return config.tencentEnabled
    ? { tencent_captcha_ticket: value.token, tencent_captcha_randstr: value.randstr }
    : { turnstile_token: value.token }
}

/**
 * 验证码凭据状态机（登录 / 注册 / 找回密码共用）。
 * 命令式句柄通过回调 ref（state）绑定；动作触发式验证的结果直接作为返回值交给调用方，
 * 避免依赖异步更新的 state。
 */
export function useCaptchaProof(config: CaptchaConfig) {
  const [handle, attach] = React.useState<CaptchaChallengeHandle | null>(null)
  const [value, setValue] = React.useState<CaptchaValue>({ token: '', randstr: '' })
  const [error, setError] = React.useState('')

  const onVerify = React.useCallback((token: string, randstr = '') => {
    setValue({ token, randstr })
    setError('')
  }, [])
  const onExpire = React.useCallback(() => {
    setValue({ token: '', randstr: '' })
    setError(t('auth.turnstileExpired'))
  }, [])
  const onFail = React.useCallback(() => {
    setValue({ token: '', randstr: '' })
    setError(t('auth.turnstileFailed'))
  }, [])
  const reset = React.useCallback(() => {
    handle?.reset()
    setValue({ token: '', randstr: '' })
    setError('')
  }, [handle])

  /**
   * 提交前取得凭据。腾讯 / 阿里云：弹窗验证（用户关闭返回 null）；
   * Turnstile / 未启用：返回当前凭据（Turnstile 由用户在页面上完成）。
   */
  const acquireActionProof = React.useCallback(async (): Promise<CaptchaValue | null> => {
    if (!config.actionEnabled) return value
    if (!handle) {
      // 验证码组件还在按需加载中：提示稍候重试，而不是静默无反应
      setError(t('auth.completeVerification'))
      return null
    }
    const proof = await handle.verifyAction()
    if (!proof) return null
    setValue(proof)
    setError('')
    return proof
  }, [config.actionEnabled, handle, value])

  /** OAuth 启动 / passkey：弹窗取得凭据；用户关闭返回 null。 */
  const verifyAction = React.useCallback(
    async (): Promise<CaptchaValue | null> => (await handle?.verifyAction()) ?? null,
    [handle]
  )

  const challengeProps: CaptchaChallengeProps = {
    turnstileEnabled: config.turnstileEnabled,
    turnstileSiteKey: config.turnstileSiteKey,
    tencentEnabled: config.tencentEnabled,
    tencentAppId: config.tencentAppId,
    tencentRegion: config.tencentRegion,
    aliyunEnabled: config.aliyunEnabled,
    aliyunSceneId: config.aliyunSceneId,
    aliyunPrefix: config.aliyunPrefix,
    aliyunRegion: config.aliyunRegion,
    onVerify,
    onExpire,
    onError: onFail
  }

  return {
    attach,
    token: value.token,
    randstr: value.randstr,
    value,
    error,
    setError,
    reset,
    acquireActionProof,
    verifyAction,
    challengeProps
  }
}
