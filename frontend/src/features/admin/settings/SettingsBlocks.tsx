/** 系统设置的自定义编辑块（与草稿绑定的数组 / 对象 / 行表编辑器）。 */
import * as React from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import {
  SCHEDULING_THRESHOLD_PLATFORMS,
  type AuthSourceType,
  type DefaultSubscriptionSetting
} from '@/api/admin/settings'
import { NativeSelect } from '@/components/NativeSelect'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { notifyError } from '@/features/admin/common/notify'
import { t } from '@/i18n'
import { useAppStore } from '@/stores/app'
import { sanitizeSvg } from '@/utils/sanitize'
import {
  MAX_RECHARGE_BONUS_PERCENT,
  MAX_RECHARGE_BONUS_TIERS,
  describeRechargeBonusIntervals,
  isDuplicateRechargeBonusMinAmount,
  isRechargeBonusMinAmountValid,
  isRechargeBonusPercentValidForMode,
  normalizeRechargeBonusMode,
  sanitizeRechargeBonusTiersForSubmit,
  type RechargeBonusMode
} from '@/utils/rechargeBonus'
import {
  isRegistrationEmailSuffixDomainValid,
  normalizeRegistrationEmailSuffixDomain,
  parseRegistrationEmailSuffixWhitelistInput
} from '@/utils/registrationEmailPolicy'
import { listPlatformIds } from '@/constants/platformCatalog'
import {
  SITE_BILLING_MODES,
  SITE_BILLING_MODE_I18N_KEYS,
  billingModeToSettings,
  resolveSiteBillingMode,
  type SiteBillingMode
} from '@/utils/siteBillingMode'
import {
  MAX_FORWARDED_CLIENT_IP_HEADERS,
  loginAgreementRoutePath,
  normalizeForwardedClientIpHeader,
  parseUserIdList,
  type CodexClientRow,
  type NotifyEmailEntry
} from './settingsModel'
import { defaultFingerprintSignalRows, type FingerprintSignalRow } from './codexFingerprintSignals'
import {
  createClaudeOAuthSystemPromptBlock,
  createDefaultClaudeOAuthSystemPromptBlocks,
  defaultClaudeCodeExpansionPrompt,
  defaultClaudeCodeSystemPrompt,
  type ClaudeOAuthSystemPromptBlock,
  type ClaudeOAuthSystemPromptPreset
} from './claudePromptBlocks'
import { AddButton, LabeledField, SwitchRow, TagInput, U, type BlockCtx } from './settingsUi'

const S = (k: string, p?: Record<string, unknown>) => t(`admin.settings.${k}`, p)
const num = (v: string): number => (v === '' ? 0 : Number(v))

function RemoveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      aria-label={label}
      onClick={onClick}
    >
      <Trash2 aria-hidden />
    </Button>
  )
}

/* -------------------------------- 站点 -------------------------------- */
export function TablePageSizeOptions({ ctx }: { ctx: BlockCtx }) {
  return (
    <LabeledField label={S('site.tablePageSizeOptions')} hint={S('site.tablePageSizeOptionsHint')}>
      <Input
        className="max-w-md font-mono text-[13px]"
        placeholder={S('site.tablePageSizeOptionsPlaceholder')}
        value={ctx.draft.aux.tablePageSizeInput}
        onChange={(e) => ctx.patchAux({ tablePageSizeInput: e.target.value })}
      />
    </LabeledField>
  )
}

export function CustomMenuEditor({ ctx }: { ctx: BlockCtx }) {
  const items = ctx.draft.form.custom_menu_items
  const set = (next: typeof items) =>
    ctx.patchForm({ custom_menu_items: next.map((it, i) => ({ ...it, sort_order: i })) })
  const upd = (i: number, p: Partial<(typeof items)[number]>) =>
    set(items.map((it, j) => (j === i ? { ...it, ...p } : it)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    set(next)
  }
  const onSvg = async (i: number, file: File | undefined) => {
    if (!file) return
    if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml')
      return notifyError(new Error(S('site.logoTypeError')))
    if (file.size > 100 * 1024) return notifyError(new Error(S('site.logoSizeError')))
    upd(i, { icon_svg: sanitizeSvg(await file.text()) })
  }
  return (
    <div className="grid gap-4">
      {items.map((it, i) => (
        <div key={i} className="grid gap-3 rounded-md border p-4">
          <div className="flex items-center justify-between gap-2">
            <b className="text-sm">{S('customMenu.itemLabel', { n: i + 1 })}</b>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={S('customMenu.moveUp')}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={S('customMenu.moveDown')}
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <RemoveBtn
                label={S('customMenu.remove')}
                onClick={() => set(items.filter((_, j) => j !== i))}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label={S('customMenu.name')}>
              <Input
                placeholder={S('customMenu.namePlaceholder')}
                value={it.label}
                onChange={(e) => upd(i, { label: e.target.value })}
              />
            </LabeledField>
            <LabeledField label={S('customMenu.visibility')}>
              <NativeSelect
                value={it.visibility}
                onChange={(e) => upd(i, { visibility: e.target.value as 'user' | 'admin' })}
              >
                <option value="user">{S('customMenu.visibilityUser')}</option>
                <option value="admin">{S('customMenu.visibilityAdmin')}</option>
              </NativeSelect>
            </LabeledField>
            <LabeledField label={S('customMenu.url')} className="sm:col-span-2">
              <Input
                type="url"
                className="font-mono text-[13px]"
                placeholder={S('customMenu.urlPlaceholder')}
                value={it.url}
                onChange={(e) => upd(i, { url: e.target.value })}
              />
            </LabeledField>
          </div>
          <SwitchRow
            label={S('customMenu.hideOpenButton')}
            checked={Boolean(it.hide_open_button)}
            onChange={(v) => upd(i, { hide_open_button: v })}
          />
          <LabeledField label={S('customMenu.iconSvg')}>
            <Textarea
              rows={3}
              className="font-mono text-xs"
              placeholder={S('customMenu.iconSvgPlaceholder')}
              value={it.icon_svg}
              onChange={(e) => upd(i, { icon_svg: e.target.value })}
            />
          </LabeledField>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-8 cursor-pointer items-center rounded-md border bg-card px-3 text-[13px]">
              <input
                type="file"
                accept=".svg,image/svg+xml"
                className="sr-only"
                onChange={(e) => {
                  void onSvg(i, e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              {S('customMenu.uploadSvg')}
            </label>
            {it.icon_svg ? (
              <>
                <span className="text-xs text-muted-foreground">{S('customMenu.iconPreview')}</span>
                {/* 预览前一律经 DOMPurify（svg 白名单）净化，用户输入不会成为 XSS 载体 */}
                <span
                  className="inline-flex size-8 items-center justify-center rounded border [&_svg]:size-5"
                  dangerouslySetInnerHTML={{ __html: sanitizeSvg(it.icon_svg) }}
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => upd(i, { icon_svg: '' })}>
                  {S('customMenu.removeSvg')}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ))}
      <AddButton
        onClick={() =>
          ctx.patchForm({
            custom_menu_items: [
              ...items,
              { id: '', label: '', icon_svg: '', url: '', visibility: 'user', sort_order: items.length }
            ]
          })
        }
      >
        <Plus aria-hidden />
        {S('customMenu.add')}
      </AddButton>
    </div>
  )
}

export function CustomEndpointsEditor({ ctx }: { ctx: BlockCtx }) {
  const items = ctx.draft.form.custom_endpoints
  const upd = (i: number, p: Partial<(typeof items)[number]>) =>
    ctx.patchForm({ custom_endpoints: items.map((it, j) => (j === i ? { ...it, ...p } : it)) })
  return (
    <div className="grid gap-4">
      {items.map((it, i) => (
        <div key={i} className="grid gap-3 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <b className="text-sm">{S('site.customEndpoints.itemLabel', { n: i + 1 })}</b>
            <RemoveBtn
              label={t('common.remove')}
              onClick={() => ctx.patchForm({ custom_endpoints: items.filter((_, j) => j !== i) })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label={S('site.customEndpoints.name')}>
              <Input
                placeholder={S('site.customEndpoints.namePlaceholder')}
                value={it.name}
                onChange={(e) => upd(i, { name: e.target.value })}
              />
            </LabeledField>
            <LabeledField label={S('site.customEndpoints.endpointUrl')}>
              <Input
                type="url"
                className="font-mono text-[13px]"
                placeholder={S('site.customEndpoints.endpointUrlPlaceholder')}
                value={it.endpoint}
                onChange={(e) => upd(i, { endpoint: e.target.value })}
              />
            </LabeledField>
            <LabeledField label={S('site.customEndpoints.descriptionLabel')} className="sm:col-span-2">
              <Input
                placeholder={S('site.customEndpoints.descriptionPlaceholder')}
                value={it.description}
                onChange={(e) => upd(i, { description: e.target.value })}
              />
            </LabeledField>
          </div>
        </div>
      ))}
      <AddButton
        onClick={() =>
          ctx.patchForm({ custom_endpoints: [...items, { name: '', endpoint: '', description: '' }] })
        }
      >
        <Plus aria-hidden />
        {S('site.customEndpoints.add')}
      </AddButton>
    </div>
  )
}

/* -------------------------------- 登录条款 -------------------------------- */
export function AgreementDocsEditor({ ctx }: { ctx: BlockCtx }) {
  const docs = ctx.draft.form.login_agreement_documents
  const upd = (i: number, p: Partial<(typeof docs)[number]>) =>
    ctx.patchForm({ login_agreement_documents: docs.map((d, j) => (j === i ? { ...d, ...p } : d)) })
  return (
    <div className="grid gap-4">
      {docs.map((d, i) => (
        <div key={i} className="grid gap-3 rounded-md border p-4">
          <div className="flex items-center justify-between gap-2">
            <code className="truncate text-xs text-muted-foreground">{loginAgreementRoutePath(d, i)}</code>
            <RemoveBtn
              label={t('common.remove')}
              onClick={() => ctx.patchForm({ login_agreement_documents: docs.filter((_, j) => j !== i) })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledField label={U('agreement.docTitle')}>
              <Input value={d.title} onChange={(e) => upd(i, { title: e.target.value })} />
            </LabeledField>
            <LabeledField label={U('agreement.docId')} hint={U('agreement.docIdHint')}>
              <Input
                className="font-mono text-[13px]"
                value={d.id}
                onChange={(e) => upd(i, { id: e.target.value })}
              />
            </LabeledField>
          </div>
          <LabeledField label={U('agreement.docContent')}>
            <Textarea
              rows={8}
              className="font-mono text-[13px]"
              value={d.content_md}
              onChange={(e) => upd(i, { content_md: e.target.value })}
            />
          </LabeledField>
        </div>
      ))}
      <AddButton
        onClick={() =>
          ctx.patchForm({
            login_agreement_documents: [
              ...docs,
              { id: `custom-${Date.now().toString(36)}`, title: '', content_md: '' }
            ]
          })
        }
      >
        <Plus aria-hidden />
        {U('agreement.addDoc')}
      </AddButton>
    </div>
  )
}

/* -------------------------------- 功能 -------------------------------- */
export function BillingModeBlock({ ctx }: { ctx: BlockCtx }) {
  // 站点类型由 subscription_enabled 与 payment_balance_disabled 两个开关派生，保存时同时写回（避免出现既无充值也无订阅的组合）
  const mode = resolveSiteBillingMode(ctx.draft.form)
  const key = SITE_BILLING_MODE_I18N_KEYS[mode]
  return (
    <LabeledField
      label={S('features.siteBillingMode.label')}
      hint={t(`admin.settings.features.siteBillingMode.hints.${key}`)}
    >
      <NativeSelect
        value={mode}
        onChange={(e) => ctx.patchForm(billingModeToSettings(e.target.value as SiteBillingMode))}
      >
        {SITE_BILLING_MODES.map((m) => (
          <option key={m} value={m}>
            {t(`admin.settings.features.siteBillingMode.options.${SITE_BILLING_MODE_I18N_KEYS[m]}`)}
          </option>
        ))}
      </NativeSelect>
    </LabeledField>
  )
}

export function CyberAllowlist({ ctx }: { ctx: BlockCtx }) {
  const ids = parseUserIdList(ctx.draft.form.cyber_policy_user_allowlist)
  return (
    <LabeledField label={U('cyberAllowlist.label')} hint={U('cyberAllowlist.hint')}>
      <TagInput
        tags={ids.map(String)}
        removeLabel={t('common.remove')}
        placeholder={U('cyberAllowlist.placeholder')}
        mono
        onAdd={(raw) =>
          ctx.patchForm({ cyber_policy_user_allowlist: parseUserIdList(`${ids.join(',')},${raw}`).join(',') })
        }
        onRemove={(tag) =>
          ctx.patchForm({ cyber_policy_user_allowlist: ids.filter((x) => String(x) !== tag).join(',') })
        }
      />
    </LabeledField>
  )
}

/* -------------------------------- 安全 -------------------------------- */
export function EmailSuffixWhitelist({ ctx }: { ctx: BlockCtx }) {
  const tags = ctx.draft.aux.emailSuffixTags
  const add = (raw: string) => {
    const next = [...tags]
    for (const item of parseRegistrationEmailSuffixWhitelistInput(raw)) {
      const d = normalizeRegistrationEmailSuffixDomain(item)
      if (!d || !isRegistrationEmailSuffixDomainValid(d)) continue
      if (!next.includes(d)) next.push(d)
    }
    ctx.patchAux({ emailSuffixTags: next })
  }
  return (
    <LabeledField
      label={S('registration.emailSuffixWhitelist')}
      hint={`${S('registration.emailSuffixWhitelistHint')} ${S('registration.emailSuffixWhitelistInputHint')}`}
    >
      <TagInput
        tags={tags}
        mono
        removeLabel={t('common.remove')}
        placeholder={S('registration.emailSuffixWhitelistPlaceholder')}
        onAdd={add}
        onRemove={(tag) => ctx.patchAux({ emailSuffixTags: tags.filter((x) => x !== tag) })}
      />
    </LabeledField>
  )
}

export function ForwardedHeaders({ ctx }: { ctx: BlockCtx }) {
  const list = ctx.draft.form.forwarded_client_ip_headers
  const add = (raw: string) => {
    const next = [...list]
    for (const part of raw.split(/[\s,;]+/).filter(Boolean)) {
      const h = normalizeForwardedClientIpHeader(part)
      if (!h) {
        useAppStore.getState().showError(S('apiKeyAcl.forwardedClientIpHeaderInvalid'))
        continue
      }
      if (next.some((x) => x.toLowerCase() === h.toLowerCase())) continue
      if (next.length >= MAX_FORWARDED_CLIENT_IP_HEADERS) {
        useAppStore.getState().showError(S('apiKeyAcl.forwardedClientIpHeadersLimit'))
        break
      }
      next.push(h)
    }
    ctx.patchForm({ forwarded_client_ip_headers: next })
  }
  return (
    <LabeledField
      label={S('apiKeyAcl.forwardedClientIpHeaders')}
      hint={`${S('apiKeyAcl.forwardedClientIpHeadersHint')} ${S('apiKeyAcl.forwardedClientIpHeadersRiskHint')}`}
    >
      <TagInput
        tags={list}
        mono
        removeLabel={S('apiKeyAcl.removeForwardedClientIpHeader')}
        placeholder={S('apiKeyAcl.forwardedClientIpHeadersPlaceholder')}
        onAdd={add}
        onRemove={(tag) => ctx.patchForm({ forwarded_client_ip_headers: list.filter((x) => x !== tag) })}
      />
    </LabeledField>
  )
}

export function CaptchaBlock({ ctx }: { ctx: BlockCtx }) {
  const f = ctx.draft.form
  const provider = f.tencent_captcha_enabled ? 'tencent' : f.aliyun_captcha_enabled ? 'aliyun' : 'turnstile'
  const master = f.turnstile_enabled || f.tencent_captcha_enabled || f.aliyun_captcha_enabled
  // 落库仍是三个独立 enabled 键；同一时间至多启用一家
  const apply = (p: string | null) =>
    ctx.patchForm({
      turnstile_enabled: p === 'turnstile',
      tencent_captcha_enabled: p === 'tencent',
      aliyun_captcha_enabled: p === 'aliyun'
    })
  const [chosen, setChosen] = React.useState<string>(provider)
  const text = (
    name: keyof typeof f,
    label: string,
    hint?: string,
    secret?: boolean,
    configured?: boolean
  ) => (
    <LabeledField label={label} hint={hint}>
      <Input
        type={secret ? 'password' : 'text'}
        autoComplete={secret ? 'new-password' : undefined}
        className="font-mono text-[13px]"
        placeholder={configured ? U('secretConfiguredPlaceholder') : undefined}
        value={String(f[name] ?? '')}
        onChange={(e) => ctx.patchForm({ [name]: e.target.value } as never)}
      />
    </LabeledField>
  )
  const links =
    f.tencent_captcha_region === 'intl'
      ? {
          console: 'https://console.tencentcloud.com/captcha/graphical',
          keys: 'https://console.tencentcloud.com/cam/capi',
          docs: 'https://www.tencentcloud.com/document/product/1159/49680'
        }
      : {
          console: 'https://console.cloud.tencent.com/captcha',
          keys: 'https://console.cloud.tencent.com/cam/capi',
          docs: 'https://cloud.tencent.com/document/product/1110/36841'
        }
  return (
    <div className="grid gap-4">
      <SwitchRow
        label={S('captcha.enable')}
        hint={S('captcha.enableHint')}
        checked={master}
        onChange={(v) => apply(v ? chosen : null)}
      />
      {master ? (
        <>
          <LabeledField label={S('captcha.provider')}>
            <NativeSelect
              value={chosen}
              onChange={(e) => {
                setChosen(e.target.value)
                apply(e.target.value)
              }}
            >
              <option value="turnstile">{S('captcha.providerTurnstile')}</option>
              <option value="tencent">{S('captcha.providerTencent')}</option>
              <option value="aliyun">{S('captcha.providerAliyun')}</option>
            </NativeSelect>
          </LabeledField>
          {chosen === 'turnstile' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {text('turnstile_site_key', S('turnstile.siteKey'), S('turnstile.siteKeyHint'))}
              {text(
                'turnstile_secret_key',
                S('turnstile.secretKey'),
                S('turnstile.secretKeyHint'),
                true,
                f.turnstile_secret_key_configured
              )}
            </div>
          ) : null}
          {chosen === 'tencent' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField label={S('tencentCaptcha.region')} hint={S('tencentCaptcha.regionHint')}>
                <NativeSelect
                  value={f.tencent_captcha_region}
                  onChange={(e) => ctx.patchForm({ tencent_captcha_region: e.target.value })}
                >
                  <option value="cn">{S('tencentCaptcha.regionCn')}</option>
                  <option value="intl">{S('tencentCaptcha.regionIntl')}</option>
                </NativeSelect>
              </LabeledField>
              <div className="flex flex-wrap items-end gap-2 text-xs">
                <a
                  className="text-primary underline"
                  href={links.console}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {S('tencentCaptcha.openCaptchaConsole')}
                </a>
                <a
                  className="text-primary underline"
                  href={links.keys}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {S('tencentCaptcha.createCloudKeys')}
                </a>
                <a
                  className="text-primary underline"
                  href={links.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {S('tencentCaptcha.openWebDocs')}
                </a>
              </div>
              {text(
                'tencent_captcha_app_id',
                S('tencentCaptcha.appId'),
                S('tencentCaptcha.appCredentialsHint')
              )}
              {text(
                'tencent_captcha_app_secret_key',
                S('tencentCaptcha.appSecretKey'),
                undefined,
                true,
                f.tencent_captcha_app_secret_key_configured
              )}
              {text(
                'tencent_captcha_cloud_secret_id',
                S('tencentCaptcha.cloudSecretId'),
                S('tencentCaptcha.cloudCredentialsHint'),
                true,
                f.tencent_captcha_cloud_secret_id_configured
              )}
              {text(
                'tencent_captcha_cloud_secret_key',
                S('tencentCaptcha.cloudSecretKey'),
                S('tencentCaptcha.camPermissionHint'),
                true,
                f.tencent_captcha_cloud_secret_key_configured
              )}
            </div>
          ) : null}
          {chosen === 'aliyun' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledField label={S('aliyunCaptcha.region')} hint={S('aliyunCaptcha.regionHint')}>
                <NativeSelect
                  value={f.aliyun_captcha_region}
                  onChange={(e) => ctx.patchForm({ aliyun_captcha_region: e.target.value })}
                >
                  <option value="cn">{S('aliyunCaptcha.regionCn')}</option>
                  <option value="sgp">{S('aliyunCaptcha.regionSgp')}</option>
                </NativeSelect>
              </LabeledField>
              {text('aliyun_captcha_prefix', S('aliyunCaptcha.prefix'), S('aliyunCaptcha.prefixHint'))}
              {text('aliyun_captcha_scene_id', S('aliyunCaptcha.sceneId'), S('aliyunCaptcha.sceneIdHint'))}
              {text(
                'aliyun_captcha_access_key_id',
                S('aliyunCaptcha.accessKeyId'),
                S('aliyunCaptcha.accessKeyIdHint')
              )}
              {text(
                'aliyun_captcha_access_key_secret',
                S('aliyunCaptcha.accessKeySecret'),
                S('aliyunCaptcha.accessKeySecretHint'),
                true,
                f.aliyun_captcha_access_key_secret_configured
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export function WeChatBlock({ ctx }: { ctx: BlockCtx }) {
  const f = ctx.draft.form
  const modes = [
    {
      key: 'open',
      en: 'wechat_connect_open_enabled',
      id: 'wechat_connect_open_app_id',
      secret: 'wechat_connect_open_app_secret',
      label: S('wechatConnect.openModeLabel'),
      hint: S('wechatConnect.openModeHint')
    },
    {
      key: 'mp',
      en: 'wechat_connect_mp_enabled',
      id: 'wechat_connect_mp_app_id',
      secret: 'wechat_connect_mp_app_secret',
      label: S('wechatConnect.mpModeLabel'),
      hint: S('wechatConnect.mpModeHint')
    },
    {
      key: 'mobile',
      en: 'wechat_connect_mobile_enabled',
      id: 'wechat_connect_mobile_app_id',
      secret: 'wechat_connect_mobile_app_secret',
      label: U('wechat.mobileMode'),
      hint: U('wechat.mobileModeHint')
    }
  ] as const
  const toggle = (key: string, on: boolean) => {
    const p: Record<string, boolean> = { [`wechat_connect_${key}_enabled`]: on }
    // 公众号与移动应用互斥
    if (on && key === 'mp') p.wechat_connect_mobile_enabled = false
    if (on && key === 'mobile') p.wechat_connect_mp_enabled = false
    ctx.patchForm(p as never)
  }
  const rec = f as unknown as Record<string, unknown>
  return (
    <div className="grid gap-4">
      <SwitchRow
        label={S('wechatConnect.enabledLabel')}
        hint={S('wechatConnect.enabledHint')}
        checked={f.wechat_connect_enabled}
        onChange={(v) => ctx.patchForm({ wechat_connect_enabled: v })}
      />
      {f.wechat_connect_enabled ? (
        <>
          {modes.map((m) => (
            <div key={m.key} className="grid gap-3 rounded-md border p-4">
              <SwitchRow
                label={m.label}
                hint={m.hint}
                checked={Boolean(rec[m.en])}
                onChange={(v) => toggle(m.key, v)}
              />
              {rec[m.en] ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <LabeledField label={S('wechatConnect.appIdLabel')}>
                    <Input
                      className="font-mono text-[13px]"
                      placeholder={S('wechatConnect.appIdPlaceholder')}
                      value={String(rec[m.id] ?? '')}
                      onChange={(e) => ctx.patchForm({ [m.id]: e.target.value } as never)}
                    />
                  </LabeledField>
                  <LabeledField
                    label={S('wechatConnect.appSecretLabel')}
                    hint={
                      rec[`${m.secret}_configured`]
                        ? S('wechatConnect.appSecretConfiguredHint')
                        : S('wechatConnect.appSecretHint')
                    }
                  >
                    <Input
                      type="password"
                      autoComplete="new-password"
                      className="font-mono text-[13px]"
                      placeholder={
                        rec[`${m.secret}_configured`]
                          ? S('wechatConnect.appSecretConfiguredPlaceholder')
                          : S('wechatConnect.appSecretPlaceholder')
                      }
                      value={String(rec[m.secret] ?? '')}
                      onChange={(e) => ctx.patchForm({ [m.secret]: e.target.value } as never)}
                    />
                  </LabeledField>
                </div>
              ) : null}
            </div>
          ))}
          <LabeledField label={S('wechatConnect.redirectUrlLabel')}>
            <div className="flex gap-2">
              <Input
                type="url"
                className="font-mono text-[13px]"
                placeholder={S('wechatConnect.redirectUrlPlaceholder')}
                value={f.wechat_connect_redirect_url}
                onChange={(e) => ctx.patchForm({ wechat_connect_redirect_url: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  ctx.patchForm({
                    wechat_connect_redirect_url: `${window.location.origin}/api/v1/auth/oauth/wechat/callback`
                  })
                }
              >
                {S('wechatConnect.generateAndCopy')}
              </Button>
            </div>
          </LabeledField>
          <LabeledField
            label={S('wechatConnect.frontendRedirectUrlLabel')}
            hint={S('wechatConnect.frontendRedirectUrlHint')}
          >
            <Input
              className="font-mono text-[13px]"
              placeholder={S('wechatConnect.frontendRedirectUrlPlaceholder')}
              value={f.wechat_connect_frontend_redirect_url}
              onChange={(e) => ctx.patchForm({ wechat_connect_frontend_redirect_url: e.target.value })}
            />
          </LabeledField>
        </>
      ) : null}
    </div>
  )
}

/* -------------------------------- 用户默认值 -------------------------------- */
function SubscriptionList({
  value,
  onChange,
  groups
}: {
  value: DefaultSubscriptionSetting[]
  onChange: (v: DefaultSubscriptionSetting[]) => void
  groups: BlockCtx['subscriptionGroups']
}) {
  const add = () => {
    const used = new Set(value.map((v) => v.group_id))
    const next = groups.find((g) => !used.has(g.id))
    if (next) onChange([...value, { group_id: next.id, validity_days: 30 }])
  }
  return (
    <div className="grid gap-2">
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{S('defaults.defaultSubscriptionsEmpty')}</p>
      ) : null}
      {value.map((s, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <LabeledField label={S('defaults.subscriptionGroup')} className="min-w-48 flex-1">
            <NativeSelect
              value={s.group_id}
              onChange={(e) =>
                onChange(value.map((x, j) => (j === i ? { ...x, group_id: Number(e.target.value) } : x)))
              }
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
          </LabeledField>
          <LabeledField label={S('defaults.subscriptionValidityDays')} className="w-36">
            <Input
              type="number"
              min={1}
              value={s.validity_days}
              onChange={(e) =>
                onChange(value.map((x, j) => (j === i ? { ...x, validity_days: num(e.target.value) } : x)))
              }
            />
          </LabeledField>
          <RemoveBtn label={t('common.remove')} onClick={() => onChange(value.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton onClick={add}>
        <Plus aria-hidden />
        {S('defaults.addDefaultSubscription')}
      </AddButton>
    </div>
  )
}

export function DefaultSubscriptions({ ctx }: { ctx: BlockCtx }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{S('defaults.defaultSubscriptions')}</h3>
      <p className="text-xs text-muted-foreground">{S('defaults.defaultSubscriptionsHint')}</p>
      <SubscriptionList
        value={ctx.draft.form.default_subscriptions}
        onChange={(v) => ctx.patchForm({ default_subscriptions: v })}
        groups={ctx.subscriptionGroups}
      />
    </div>
  )
}

const WINDOWS = ['daily', 'weekly', 'monthly'] as const
export function PlatformQuotas({ ctx }: { ctx: BlockCtx }) {
  const map = ctx.draft.form.default_platform_quotas
  const rows = listPlatformIds().filter((p: string) => !!(map as Record<string, unknown>)[p])
  const set = (platform: string, win: (typeof WINDOWS)[number], raw: string) => {
    const cur = ((map as unknown as Record<string, Record<string, number | null>>)[platform] ?? {}) as Record<
      string,
      number | null
    >
    ctx.patchForm({
      default_platform_quotas: {
        ...map,
        [platform]: { ...cur, [win]: raw === '' ? null : Number(raw) }
      } as never
    })
  }
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{S('defaults.defaultPlatformQuotas')}</h3>
      <p className="text-xs text-muted-foreground">{S('defaults.defaultPlatformQuotasHint')}</p>
      <p className="text-xs text-muted-foreground">{S('defaults.platformQuotaNotice')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-medium">{S('platformQuota.platform')}</th>
              {WINDOWS.map((w) => (
                <th key={w} className="px-1 py-1 font-medium">
                  {S(`platformQuota.${w}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p} className="border-t">
                <td className="py-1.5 pr-3 font-medium">{p}</td>
                {WINDOWS.map((w) => (
                  <td key={w} className="px-1 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-8 w-28"
                      aria-label={`${p} ${w}`}
                      placeholder={S('platformQuota.placeholder')}
                      value={String(
                        (map as unknown as Record<string, Record<string, number | null | undefined>>)[p]?.[
                          w
                        ] ?? ''
                      )}
                      onChange={(e) => set(p, w, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function SchedulingThresholds({ ctx }: { ctx: BlockCtx }) {
  const map = ctx.draft.form.account_scheduling_thresholds
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{S('scheduling.accountSchedulingThresholdsTitle')}</h3>
      <p className="text-xs text-muted-foreground">
        {S('scheduling.accountSchedulingThresholdsDescription')}{' '}
        {S('scheduling.accountSchedulingThresholdsGlobalHint')}
      </p>
      <p className="text-xs text-muted-foreground">{S('scheduling.accountSchedulingThresholdsRangeHint')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {SCHEDULING_THRESHOLD_PLATFORMS.map((p) => (
          <LabeledField key={p} label={p}>
            <Input
              type="number"
              min={0}
              max={100}
              value={String(map[p] ?? 0)}
              onChange={(e) =>
                ctx.patchForm({ account_scheduling_thresholds: { ...map, [p]: num(e.target.value) } })
              }
            />
          </LabeledField>
        ))}
      </div>
    </div>
  )
}

const AUTH_SOURCES: { source: AuthSourceType; title: () => string; desc: () => string }[] = [
  {
    source: 'email',
    title: () => S('authSourceDefaults.sources.email.title'),
    desc: () => S('authSourceDefaults.sources.email.description')
  },
  {
    source: 'linuxdo',
    title: () => S('authSourceDefaults.sources.linuxdo.title'),
    desc: () => S('authSourceDefaults.sources.linuxdo.description')
  },
  {
    source: 'oidc',
    title: () => S('authSourceDefaults.sources.oidc.title'),
    desc: () => S('authSourceDefaults.sources.oidc.description')
  },
  {
    source: 'wechat',
    title: () => S('authSourceDefaults.sources.wechat.title'),
    desc: () => S('authSourceDefaults.sources.wechat.description')
  },
  { source: 'github', title: () => 'GitHub', desc: () => U('authSources.github') },
  { source: 'google', title: () => 'Google', desc: () => U('authSources.google') },
  { source: 'dingtalk', title: () => t('auth.dingtalkProviderName'), desc: () => U('authSources.dingtalk') }
]
export const authSourceTitles = (): Record<string, string> =>
  Object.fromEntries(AUTH_SOURCES.map((s) => [s.source, s.title()]))

export function AuthSourceDefaults({ ctx }: { ctx: BlockCtx }) {
  const state = ctx.draft.aux.authSourceDefaults
  const upd = (source: AuthSourceType, p: Record<string, unknown>) =>
    ctx.patchAux({ authSourceDefaults: { ...state, [source]: { ...state[source], ...p } } as never })
  return (
    <div className="grid gap-4">
      {AUTH_SOURCES.map(({ source, title, desc }) => {
        const v = state[source] as unknown as {
          balance: number
          concurrency: number
          subscriptions: DefaultSubscriptionSetting[]
          grant_on_signup: boolean
          grant_on_first_bind: boolean
        }
        return (
          <div key={source} className="grid gap-3 rounded-md border p-4">
            <div>
              <h3 className="text-sm font-semibold">{title()}</h3>
              <p className="text-xs text-muted-foreground">{desc()}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledField label={S('defaults.defaultBalance')}>
                <Input
                  type="number"
                  step="0.01"
                  value={String(v.balance ?? 0)}
                  onChange={(e) => upd(source, { balance: num(e.target.value) })}
                />
              </LabeledField>
              <LabeledField label={S('defaults.defaultConcurrency')}>
                <Input
                  type="number"
                  min={0}
                  value={String(v.concurrency ?? 0)}
                  onChange={(e) => upd(source, { concurrency: num(e.target.value) })}
                />
              </LabeledField>
            </div>
            <SwitchRow
              label={U('authSources.grantOnSignup')}
              checked={Boolean(v.grant_on_signup)}
              onChange={(x) => upd(source, { grant_on_signup: x })}
            />
            <SwitchRow
              label={S('authSourceDefaults.grantOnFirstBindLabel')}
              hint={S('authSourceDefaults.grantOnFirstBindHint')}
              checked={Boolean(v.grant_on_first_bind)}
              onChange={(x) => upd(source, { grant_on_first_bind: x })}
            />
            <div className="grid gap-1">
              <b className="text-xs">{S('authSourceDefaults.defaultSubscriptionsLabel')}</b>
              <SubscriptionList
                value={v.subscriptions ?? []}
                onChange={(x) => upd(source, { subscriptions: x })}
                groups={ctx.subscriptionGroups}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------- 网关 -------------------------------- */
function RowsTable({
  rows,
  onChange,
  labels
}: {
  rows: CodexClientRow[]
  onChange: (r: CodexClientRow[]) => void
  labels: { title: string; hint?: string }
}) {
  return (
    <div className="grid gap-2">
      <h4 className="text-sm font-medium">{labels.title}</h4>
      {labels.hint ? <p className="text-xs text-muted-foreground">{labels.hint}</p> : null}
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Input
            className="w-44 font-mono text-[13px]"
            aria-label={U('codex.originator')}
            placeholder={U('codex.originator')}
            value={r.originator}
            onChange={(e) =>
              onChange(rows.map((x, j) => (j === i ? { ...x, originator: e.target.value } : x)))
            }
          />
          <Input
            className="min-w-56 flex-1 font-mono text-[13px]"
            aria-label={U('codex.uaContains')}
            placeholder={U('codex.uaContains')}
            value={r.uaContains}
            onChange={(e) =>
              onChange(rows.map((x, j) => (j === i ? { ...x, uaContains: e.target.value } : x)))
            }
          />
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox
              checked={r.skipEngineFingerprint}
              onCheckedChange={(v) =>
                onChange(rows.map((x, j) => (j === i ? { ...x, skipEngineFingerprint: v === true } : x)))
              }
            />
            {U('codex.skipFingerprint')}
          </label>
          <RemoveBtn label={t('common.remove')} onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton
        onClick={() => onChange([...rows, { originator: '', uaContains: '', skipEngineFingerprint: false }])}
      >
        <Plus aria-hidden />
        {t('common.add')}
      </AddButton>
    </div>
  )
}

export function CodexRows({ ctx }: { ctx: BlockCtx }) {
  const { aux } = ctx.draft
  const sigs = aux.fingerprintRows
  const updSig = (i: number, p: Partial<FingerprintSignalRow>) =>
    ctx.patchAux({ fingerprintRows: sigs.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  return (
    <div className="grid gap-5">
      <RowsTable
        rows={aux.codexBlacklist}
        onChange={(r) => ctx.patchAux({ codexBlacklist: r })}
        labels={{ title: U('codex.blacklist'), hint: U('codex.blacklistHint') }}
      />
      <RowsTable
        rows={aux.codexWhitelist}
        onChange={(r) => ctx.patchAux({ codexWhitelist: r })}
        labels={{ title: U('codex.whitelist'), hint: U('codex.whitelistHint') }}
      />
      <div className="grid gap-2">
        <h4 className="text-sm font-medium">{U('codex.fingerprint')}</h4>
        <p className="text-xs text-muted-foreground">{U('codex.fingerprintHint')}</p>
        {sigs.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <NativeSelect
              className="w-40"
              value={r.type}
              aria-label={U('codex.signalType')}
              onChange={(e) => updSig(i, { type: e.target.value as FingerprintSignalRow['type'] })}
            >
              <option value="header_exact">header_exact</option>
              <option value="header_prefix">header_prefix</option>
              <option value="body_path">body_path</option>
            </NativeSelect>
            <Input
              className="min-w-56 flex-1 font-mono text-[13px]"
              aria-label={U('codex.signalMatch')}
              value={r.match}
              onChange={(e) => updSig(i, { match: e.target.value })}
            />
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox checked={r.required} onCheckedChange={(v) => updSig(i, { required: v === true })} />
              {U('codex.signalRequired')}
            </label>
            <RemoveBtn
              label={t('common.remove')}
              onClick={() => ctx.patchAux({ fingerprintRows: sigs.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        <div className="flex gap-2">
          <AddButton
            onClick={() =>
              ctx.patchAux({
                fingerprintRows: [...sigs, { type: 'header_exact', match: '', required: false }]
              })
            }
          >
            <Plus aria-hidden />
            {t('common.add')}
          </AddButton>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => ctx.patchAux({ fingerprintRows: defaultFingerprintSignalRows() })}
          >
            {U('codex.resetDefaults')}
          </Button>
        </div>
      </div>
    </div>
  )
}

const PRESETS: ClaudeOAuthSystemPromptPreset[] = ['billing', 'system', 'expansion', 'custom']
const presetText = (p: ClaudeOAuthSystemPromptPreset): string =>
  p === 'billing'
    ? '{billing_header}'
    : p === 'system'
      ? defaultClaudeCodeSystemPrompt
      : p === 'expansion'
        ? defaultClaudeCodeExpansionPrompt
        : ''

export function ClaudePromptBlocks({ ctx }: { ctx: BlockCtx }) {
  const blocks = ctx.draft.aux.claudeBlocks
  const set = (b: ClaudeOAuthSystemPromptBlock[]) => ctx.patchAux({ claudeBlocks: b })
  const upd = (i: number, p: Partial<ClaudeOAuthSystemPromptBlock>) =>
    set(blocks.map((b, j) => (j === i ? { ...b, ...p } : b)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    set(next)
  }
  return (
    <div className="grid gap-4 rounded-md border p-4">
      <SwitchRow
        label={t('adminUi.settings.f.enable_claude_oauth_system_prompt_injection')}
        hint={U('claudePrompt.hint')}
        checked={ctx.draft.form.enable_claude_oauth_system_prompt_injection}
        onChange={(v) => ctx.patchForm({ enable_claude_oauth_system_prompt_injection: v })}
      />
      {blocks.map((b, i) => (
        <div key={b.id} className="grid gap-2 rounded-md border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Switch
              checked={b.enabled}
              aria-label={U('claudePrompt.enabled')}
              onCheckedChange={(v) => upd(i, { enabled: v })}
            />
            <NativeSelect
              className="w-48"
              value={b.preset}
              aria-label={U('claudePrompt.preset')}
              onChange={(e) => {
                const p = e.target.value as ClaudeOAuthSystemPromptPreset
                upd(i, { preset: p, ...(p !== 'custom' ? { text: presetText(p) } : {}) })
              }}
            >
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {U(`claudePrompt.preset_${p}`)}
                </option>
              ))}
            </NativeSelect>
            <label className="flex items-center gap-1.5 text-xs">
              <Checkbox
                checked={b.cacheControlEnabled}
                onCheckedChange={(v) => upd(i, { cacheControlEnabled: v === true })}
              />
              {U('claudePrompt.cacheControl')}
            </label>
            {b.cacheControlEnabled ? (
              <NativeSelect
                className="w-24"
                value={b.cacheControlTTL}
                aria-label="TTL"
                onChange={(e) => upd(i, { cacheControlTTL: e.target.value })}
              >
                <option value="5m">5m</option>
                <option value="1h">1h</option>
              </NativeSelect>
            ) : null}
            <div className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={S('customMenu.moveUp')}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={S('customMenu.moveDown')}
                disabled={i === blocks.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <RemoveBtn label={t('common.remove')} onClick={() => set(blocks.filter((_, j) => j !== i))} />
            </div>
          </div>
          <Textarea
            rows={b.preset === 'expansion' ? 6 : 3}
            className="font-mono text-xs"
            aria-label={U('claudePrompt.text')}
            value={b.text}
            onChange={(e) => upd(i, { text: e.target.value, preset: 'custom' })}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <AddButton
          onClick={() => set([...blocks, createClaudeOAuthSystemPromptBlock({ preset: 'custom', text: '' })])}
        >
          <Plus aria-hidden />
          {t('common.add')}
        </AddButton>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => set(createDefaultClaudeOAuthSystemPromptBlocks())}
        >
          {U('claudePrompt.reset')}
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------- 支付 -------------------------------- */
const PAYMENT_TYPES = ['easypay', 'alipay', 'wxpay', 'stripe', 'airwallex']
export function PaymentTypes({
  ctx,
  onDisableProviders
}: {
  ctx: BlockCtx
  onDisableProviders: (type: string) => void
}) {
  const enabled = ctx.draft.form.payment_enabled_types
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{S('payment.enabledPaymentTypes')}</h3>
      <p className="text-xs text-muted-foreground">{S('payment.enabledPaymentTypesHint')}</p>
      <div className="flex flex-wrap gap-4">
        {PAYMENT_TYPES.map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={enabled.includes(p)}
              onCheckedChange={(v) => {
                if (v === true) ctx.patchForm({ payment_enabled_types: [...enabled, p] })
                else {
                  ctx.patchForm({ payment_enabled_types: enabled.filter((x) => x !== p) })
                  onDisableProviders(p)
                }
              }}
            />
            {t(`payment.methods.${p}`)}
          </label>
        ))}
      </div>
    </div>
  )
}

export function RechargeBonus({ ctx }: { ctx: BlockCtx }) {
  const f = ctx.draft.form
  const tiers = f.payment_recharge_bonus_tiers
  const mode: RechargeBonusMode = normalizeRechargeBonusMode(f.payment_recharge_bonus_mode)
  const parse = (raw: string): number | null => {
    if (raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const set = (next: typeof tiers) => ctx.patchForm({ payment_recharge_bonus_tiers: next })
  const intervals = describeRechargeBonusIntervals(sanitizeRechargeBonusTiersForSubmit(tiers))
  return (
    <div className="grid gap-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-semibold">{S('payment.rechargeBonus.label')}</h3>
        <p className="text-xs text-muted-foreground">{S('payment.rechargeBonus.hint')}</p>
      </div>
      <LabeledField
        label={S('payment.rechargeBonus.modeLabel')}
        hint={S(
          mode === 'bonus' ? 'payment.rechargeBonus.modeBonusHint' : 'payment.rechargeBonus.modeDiscountHint'
        )}
      >
        <NativeSelect
          value={mode}
          onChange={(e) =>
            ctx.patchForm({ payment_recharge_bonus_mode: e.target.value as RechargeBonusMode })
          }
        >
          <option value="bonus">{S('payment.rechargeBonus.modeBonus')}</option>
          <option value="discount">{S('payment.rechargeBonus.modeDiscount')}</option>
        </NativeSelect>
      </LabeledField>
      {tiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{S('payment.rechargeBonus.empty')}</p>
      ) : null}
      {tiers.map((tier, i) => {
        const minBad = tier.min_amount !== null && !isRechargeBonusMinAmountValid(tier.min_amount)
        const pctBad =
          tier.bonus_percent !== null && !isRechargeBonusPercentValidForMode(tier.bonus_percent, mode)
        const dup = isDuplicateRechargeBonusMinAmount(tiers, i)
        const incomplete = (tier.min_amount === null) !== (tier.bonus_percent === null)
        return (
          <div key={i} className="grid gap-1">
            <div className="flex flex-wrap items-end gap-2">
              <LabeledField label={S('payment.rechargeBonus.minAmountLabel')} className="w-40">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-invalid={minBad || dup}
                  value={tier.min_amount ?? ''}
                  onChange={(e) =>
                    set(tiers.map((x, j) => (j === i ? { ...x, min_amount: parse(e.target.value) } : x)))
                  }
                />
              </LabeledField>
              <LabeledField
                label={S(
                  mode === 'bonus'
                    ? 'payment.rechargeBonus.percentLabel'
                    : 'payment.rechargeBonus.percentLabelDiscount'
                )}
                className="w-40"
              >
                <Input
                  type="number"
                  min={0}
                  max={MAX_RECHARGE_BONUS_PERCENT}
                  step="0.01"
                  aria-invalid={pctBad}
                  value={tier.bonus_percent ?? ''}
                  onChange={(e) =>
                    set(tiers.map((x, j) => (j === i ? { ...x, bonus_percent: parse(e.target.value) } : x)))
                  }
                />
              </LabeledField>
              <RemoveBtn
                label={S('payment.rechargeBonus.removeTier')}
                onClick={() => set(tiers.filter((_, j) => j !== i))}
              />
            </div>
            {minBad ? (
              <p className="text-xs text-destructive">{S('payment.rechargeBonus.invalidMinAmount')}</p>
            ) : null}
            {pctBad ? (
              <p className="text-xs text-destructive">
                {S(
                  mode === 'discount'
                    ? 'payment.rechargeBonus.invalidDiscountPercent'
                    : 'payment.rechargeBonus.invalidPercent'
                )}
              </p>
            ) : null}
            {dup ? (
              <p className="text-xs text-destructive">{S('payment.rechargeBonus.duplicateMinAmount')}</p>
            ) : null}
            {incomplete ? (
              <p className="text-xs text-warning">{S('payment.rechargeBonus.incompleteRow')}</p>
            ) : null}
          </div>
        )
      })}
      <AddButton
        onClick={() =>
          tiers.length < MAX_RECHARGE_BONUS_TIERS &&
          set([...tiers, { min_amount: null, bonus_percent: null }])
        }
      >
        <Plus aria-hidden />
        {S('payment.rechargeBonus.addTier')}
      </AddButton>
      {intervals.length ? (
        <div className="text-xs text-muted-foreground">
          <b>{S('payment.rechargeBonus.previewTitle')}</b>
          <ul className="mt-1 list-disc pl-5">
            {intervals.map((iv, i) => (
              <li key={i}>
                {iv.to === null ? `≥ ${iv.from}` : `${iv.from} ~ ${iv.to}`}: {iv.percent ?? 0}%
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <LabeledField
        label={S('payment.rechargeBonus.noticeLabel')}
        hint={S('payment.rechargeBonus.noticeHint')}
      >
        <Textarea
          rows={3}
          placeholder={S('payment.rechargeBonus.noticePlaceholder')}
          value={f.payment_recharge_bonus_notice}
          onChange={(e) => ctx.patchForm({ payment_recharge_bonus_notice: e.target.value })}
        />
      </LabeledField>
    </div>
  )
}

/* -------------------------------- 邮件 -------------------------------- */
export function QuotaNotifyEmails({ ctx }: { ctx: BlockCtx }) {
  const list: NotifyEmailEntry[] = ctx.draft.form.account_quota_notify_emails ?? []
  const set = (next: NotifyEmailEntry[]) => ctx.patchForm({ account_quota_notify_emails: next } as never)
  if (!ctx.draft.form.account_quota_notify_enabled) return null
  return (
    <div className="grid gap-2">
      <h4 className="text-sm font-medium">{S('quotaNotify.emails')}</h4>
      <p className="text-xs text-muted-foreground">{S('quotaNotify.emailsHint')}</p>
      {list.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            type="email"
            className="max-w-sm"
            aria-label={S('quotaNotify.emailPlaceholder')}
            placeholder={S('quotaNotify.emailPlaceholder')}
            value={e.email}
            onChange={(ev) => set(list.map((x, j) => (j === i ? { ...x, email: ev.target.value } : x)))}
          />
          <Switch
            checked={!e.disabled}
            aria-label={t('common.enabled')}
            onCheckedChange={(v) => set(list.map((x, j) => (j === i ? { ...x, disabled: !v } : x)))}
          />
          {e.verified === false ? <Badge variant="secondary">{U('notify.unverified')}</Badge> : null}
          <RemoveBtn label={t('common.remove')} onClick={() => set(list.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton onClick={() => set([...list, { email: '' }])}>
        <Plus aria-hidden />
        {S('quotaNotify.addEmail')}
      </AddButton>
    </div>
  )
}

export { listPlatformIds, SCHEDULING_THRESHOLD_PLATFORMS }
