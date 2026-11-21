import { describe, expect, it } from 'vitest'
import { resolveCaptchaConfig, toActionProof, toRequestFields } from '../shared/useCaptchaProof'

describe('resolveCaptchaConfig', () => {
  it('is disabled without settings', () => {
    expect(resolveCaptchaConfig(null)).toMatchObject({ enabled: false, actionEnabled: false })
  })

  it('turnstile needs both the flag and a site key', () => {
    expect(resolveCaptchaConfig({ turnstile_enabled: true, turnstile_site_key: '' }).enabled).toBe(false)
    expect(resolveCaptchaConfig({ turnstile_enabled: true, turnstile_site_key: 'k' })).toMatchObject({
      enabled: true,
      actionEnabled: false
    })
  })

  it('tencent needs an app id; aliyun needs scene id and prefix; both are action-triggered', () => {
    expect(
      resolveCaptchaConfig({ tencent_captcha_enabled: true, tencent_captcha_app_id: '' }).actionEnabled
    ).toBe(false)
    const tencent = resolveCaptchaConfig({
      tencent_captcha_enabled: true,
      tencent_captcha_app_id: '1',
      tencent_captcha_region: 'intl'
    })
    expect(tencent).toMatchObject({ actionEnabled: true, enabled: true, tencentRegion: 'intl' })
    expect(
      resolveCaptchaConfig({ aliyun_captcha_enabled: true, aliyun_captcha_scene_id: 's' }).actionEnabled
    ).toBe(false)
    const aliyun = resolveCaptchaConfig({
      aliyun_captcha_enabled: true,
      aliyun_captcha_scene_id: 's',
      aliyun_captcha_prefix: 'p'
    })
    expect(aliyun).toMatchObject({ actionEnabled: true, aliyunRegion: 'cn' })
  })
})

describe('request field mapping', () => {
  const value = { token: 'tok', randstr: 'rnd' }

  it('turnstile sends turnstile_token only', () => {
    const cfg = resolveCaptchaConfig({ turnstile_enabled: true, turnstile_site_key: 'k' })
    expect(toRequestFields(cfg, value)).toEqual({
      turnstile_token: 'tok',
      tencent_captcha_ticket: undefined,
      tencent_captcha_randstr: undefined
    })
  })

  it('tencent sends ticket + randstr', () => {
    const cfg = resolveCaptchaConfig({ tencent_captcha_enabled: true, tencent_captcha_app_id: '1' })
    expect(toRequestFields(cfg, value)).toEqual({
      turnstile_token: undefined,
      tencent_captcha_ticket: 'tok',
      tencent_captcha_randstr: 'rnd'
    })
    expect(toActionProof(cfg, value)).toEqual({
      tencent_captcha_ticket: 'tok',
      tencent_captcha_randstr: 'rnd'
    })
  })

  it('aliyun reuses the turnstile_token field for captchaVerifyParam', () => {
    const cfg = resolveCaptchaConfig({
      aliyun_captcha_enabled: true,
      aliyun_captcha_scene_id: 's',
      aliyun_captcha_prefix: 'p'
    })
    expect(toRequestFields(cfg, { token: 'param', randstr: '' })).toMatchObject({
      turnstile_token: 'param',
      tencent_captcha_ticket: undefined
    })
    expect(toActionProof(cfg, { token: 'param', randstr: '' })).toEqual({ turnstile_token: 'param' })
  })
})
