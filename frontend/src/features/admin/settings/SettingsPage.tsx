/** /admin/settings：系统设置（9 个分区；一次读取、分区编辑、合并保存；Step-up 包裹；与 Vue 版提交负载逐字段一致）。 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import type { SystemSettings, WebSearchEmulationConfig } from '@/api/admin/settings'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { TotpStepUpDialog } from '@/features/auth/TotpStepUpDialog'
import { isStepUpBlocked, isStepUpCancelled, stepUpBlockReason, useStepUp } from '@/hooks/useStepUp'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { cn } from '@/lib/utils'
import { useAdminSettingsStore } from '@/stores/adminSettings'
import { useAppStore } from '@/stores/app'
import { extractApiErrorMessage } from '@/utils/apiError'
import {
  AgreementDocsEditor,
  AuthSourceDefaults,
  BillingModeBlock,
  CaptchaBlock,
  ClaudePromptBlocks,
  CodexRows,
  CustomEndpointsEditor,
  CustomMenuEditor,
  CyberAllowlist,
  DefaultSubscriptions,
  EmailSuffixWhitelist,
  ForwardedHeaders,
  PaymentTypes,
  PlatformQuotas,
  QuotaNotifyEmails,
  RechargeBonus,
  SchedulingThresholds,
  TablePageSizeOptions,
  WeChatBlock,
  authSourceTitles
} from './SettingsBlocks'
import { BackupPanel } from './SettingsBackup'
import { EmailTemplatesBlock, SmtpTest, TestEmailBlock } from './SettingsEmail'
import { PaymentProvidersBlock, disableProvidersByType } from './SettingsPayment'
import { AdminAccessKeysPanel, AdminApiKeyPanel, EmailBlacklistPanel } from './SettingsSecurityPanels'
import {
  BetaPolicyCard,
  BillingProbeCard,
  OllamaUsageCard,
  OpenAIFastPolicyBlock,
  OpenCodeUsageCard,
  OverloadCooldownCard,
  PanelRateLimitCard,
  RateLimit429Card,
  RectifierCard,
  StreamTimeoutCard,
  WebSearchBlock,
  prepareWebSearchPayload
} from './SettingsServices'
import {
  buildSettingsPayload,
  draftFromSettings,
  prepareForSave,
  type LoginAgreementTitles,
  type SettingsAux,
  type SettingsDraft,
  type SettingsForm,
  type ValidationError
} from './settingsModel'
import { SETTINGS_SPEC, SETTINGS_TABS, type CardSpec, type SettingsTab } from './settingsSpec'
import { FieldControl, SettingsCard, U, type BlockCtx } from './settingsUi'

const agreementTitles = (): LoginAgreementTitles => ({
  terms: U('agreement.defaultTerms'),
  usage: U('agreement.defaultUsage'),
  regions: U('agreement.defaultRegions'),
  service: U('agreement.defaultService')
})

function errorText(e: ValidationError): string {
  switch (e.key) {
    case 'tableDefaultPageSizeRange':
      return t('admin.settings.site.tableDefaultPageSizeRangeError', e.params)
    case 'tablePageSizeOptionsFormat':
      return t('admin.settings.site.tablePageSizeOptionsFormatError', e.params)
    case 'agreementNeedsDocument':
      return U('errors.agreementNeedsDocument')
    case 'agreementTitleRequired':
      return U('errors.agreementTitleRequired')
    case 'agreementDuplicateRoute':
      return U('errors.agreementDuplicateRoute', e.params)
    case 'defaultSubscriptionsDuplicate': {
      const msg = t('admin.settings.defaults.defaultSubscriptionsDuplicate', { groupId: e.params.groupId })
      return e.params.prefix ? `${e.params.prefix}: ${msg}` : msg
    }
    case 'wechatMpMobileConflict':
      return U('errors.wechatMpMobileConflict')
    case 'oauthRateInvalid':
      return t('admin.settings.openaiExperimentalScheduler.oauthRateInvalid')
  }
}

export function SettingsPage() {
  useLocale()
  const stepUp = useStepUp()
  const app = useAppStore
  const [draft, setDraft] = React.useState<SettingsDraft | null>(null)
  const [web, setWeb] = React.useState<WebSearchEmulationConfig>({ enabled: false, providers: [] })
  const [saving, setSaving] = React.useState(false)
  const [tab, setTab] = React.useState<SettingsTab>('general')
  const [paymentRev, setPaymentRev] = React.useState(0)

  const settingsQ = useQuery({
    queryKey: ['admin', 'settings', 'all'],
    queryFn: () => adminAPI.settings.getSettings(),
    staleTime: Infinity,
    refetchOnWindowFocus: false
  })
  const groupsQ = useQuery({
    queryKey: ['admin', 'settings', 'subscription-groups'],
    queryFn: () => adminAPI.groups.getAll(),
    staleTime: 60_000
  })
  const proxiesQ = useQuery({
    queryKey: ['admin', 'settings', 'proxies'],
    queryFn: () => adminAPI.proxies.list().catch(() => ({ items: [] })),
    staleTime: 60_000
  })
  const subscriptionGroups = React.useMemo(
    () => (groupsQ.data ?? []).filter((g) => g.subscription_type === 'subscription' && g.status === 'active'),
    [groupsQ.data]
  )

  // 服务端设置首次到达后建立草稿（渲染期派生，避免 effect 内同步 setState）
  const [seen, setSeen] = React.useState<SystemSettings | undefined>()
  if (settingsQ.data && settingsQ.data !== seen) {
    setSeen(settingsQ.data)
    setDraft(draftFromSettings(settingsQ.data, agreementTitles()))
  }
  React.useEffect(() => {
    if (settingsQ.error) {
      notifyError(settingsQ.error, t('admin.settings.failedToLoad'))
    }
  }, [settingsQ.error])
  const loadFailed = Boolean(settingsQ.error) && !draft

  // 联网搜索配置随主保存；404 表示尚未创建
  React.useEffect(() => {
    let alive = true
    adminAPI.settings
      .getWebSearchEmulationConfig()
      .then((r) => alive && r && setWeb({ enabled: r.enabled || false, providers: r.providers || [] }))
      .catch((e) => {
        const status = (e as { status?: number })?.status
        if (status !== 404 && status !== undefined) notifyError(e)
      })
    return () => {
      alive = false
    }
  }, [])

  const patchForm = React.useCallback(
    (p: Partial<SettingsForm>) => setDraft((d) => (d ? { ...d, form: { ...d.form, ...p } } : d)),
    []
  )
  const patchAux = React.useCallback(
    (p: Partial<SettingsAux>) => setDraft((d) => (d ? { ...d, aux: { ...d.aux, ...p } } : d)),
    []
  )

  const save = async () => {
    if (!draft || saving) return
    const prepared = prepareForSave(draft, authSourceTitles())
    if (!prepared.ok) {
      app.getState().showError(errorText(prepared.error))
      return
    }
    const ws = prepareWebSearchPayload(web)
    if (!ws.ok) {
      app.getState().showError(t('admin.settings.webSearchEmulation.quotaLimitMustBePositive'))
      return
    }
    setSaving(true)
    try {
      const payload = buildSettingsPayload(prepared.draft, { origin: window.location.origin })
      const updated = await stepUp.run(() => adminAPI.settings.updateSettings(payload))
      setDraft(
        (cur) =>
          draftFromSettings(
            updated,
            agreementTitles(),
            { form: prepared.draft.form, aux: prepared.draft.aux },
            { initial: false }
          ) ?? cur
      )
      // 联网搜索单独保存；失败时由其自行提示
      let wsOk = true
      try {
        await adminAPI.settings.updateWebSearchEmulationConfig(ws.config)
      } catch (e) {
        wsOk = false
        notifyError(e)
      }
      // 刷新缓存设置，使侧栏 / 顶栏即时更新
      await app.getState().fetchPublicSettings(true)
      await useAdminSettingsStore.getState().fetch(true)
      if (wsOk) notifySuccess(t('admin.settings.settingsSaved'))
    } catch (error) {
      if (isStepUpCancelled(error)) return
      if (isStepUpBlocked(error)) {
        app
          .getState()
          .showError(
            stepUpBlockReason(error) === 'STEP_UP_ADMIN_API_KEY_FORBIDDEN'
              ? t('stepUp.adminApiKeyForbidden')
              : t('stepUp.notEnabled')
          )
        return
      }
      app.getState().showError(extractApiErrorMessage(error, t('admin.settings.failedToSave')))
    } finally {
      setSaving(false)
    }
  }

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }
    let next = i
    if (e.key in map) next = (i + map[e.key] + SETTINGS_TABS.length) % SETTINGS_TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = SETTINGS_TABS.length - 1
    else return
    e.preventDefault()
    setTab(SETTINGS_TABS[next])
    requestAnimationFrame(() => document.getElementById(`settings-tab-${SETTINGS_TABS[next]}`)?.focus())
  }

  if (loadFailed) {
    return (
      <div>
        <PageHeader title={t('admin.settings.title')} description={t('admin.settings.description')} />
        <Button variant="outline" onClick={() => void settingsQ.refetch()}>
          {U('retry')}
        </Button>
      </div>
    )
  }
  if (!draft) {
    return (
      <div>
        <PageHeader title={t('admin.settings.title')} description={t('admin.settings.description')} />
        <div className="grid gap-4">
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  const ctx: BlockCtx = { draft, patchForm, patchAux, subscriptionGroups }
  const rec = draft.form as unknown as Record<string, unknown>

  const renderCustom = (id: string): React.ReactNode => {
    switch (id) {
      case 'tablePageSizeOptions':
        return <TablePageSizeOptions ctx={ctx} />
      case 'customMenu':
        return <CustomMenuEditor ctx={ctx} />
      case 'customEndpoints':
        return <CustomEndpointsEditor ctx={ctx} />
      case 'agreementDocs':
        return <AgreementDocsEditor ctx={ctx} />
      case 'billingMode':
        return <BillingModeBlock ctx={ctx} />
      case 'cyberAllowlist':
        return <CyberAllowlist ctx={ctx} />
      case 'adminApiKey':
        return <AdminApiKeyPanel />
      case 'adminAccessKeys':
        return <AdminAccessKeysPanel />
      case 'emailSuffixWhitelist':
        return <EmailSuffixWhitelist ctx={ctx} />
      case 'emailBlacklist':
        return <EmailBlacklistPanel />
      case 'forwardedHeaders':
        return <ForwardedHeaders ctx={ctx} />
      case 'captcha':
        return <CaptchaBlock ctx={ctx} />
      case 'wechat':
        return <WeChatBlock ctx={ctx} />
      case 'defaultSubscriptions':
        return <DefaultSubscriptions ctx={ctx} />
      case 'platformQuotas':
        return <PlatformQuotas ctx={ctx} />
      case 'schedulingThresholds':
        return <SchedulingThresholds ctx={ctx} />
      case 'authSourceDefaults':
        return <AuthSourceDefaults ctx={ctx} />
      case 'codexRows':
        return <CodexRows ctx={ctx} />
      case 'claudePromptBlocks':
        return <ClaudePromptBlocks ctx={ctx} />
      case 'openaiFastPolicy':
        return <OpenAIFastPolicyBlock aux={draft.aux} patchAux={patchAux} />
      case 'betaPolicy':
        return <BetaPolicyCard />
      case 'webSearch':
        return <WebSearchBlock config={web} onChange={setWeb} proxies={proxiesQ.data?.items ?? []} />
      case 'paymentTypes':
        return (
          <PaymentTypes
            ctx={ctx}
            onDisableProviders={(ty) =>
              void disableProvidersByType(ty).then(() => setPaymentRev((n) => n + 1))
            }
          />
        )
      case 'rechargeBonus':
        return <RechargeBonus ctx={ctx} />
      case 'paymentProviders':
        return (
          <PaymentProvidersBlock
            key={paymentRev}
            enabledKeys={draft.form.payment_enabled_types}
            onChanged={() => void save()}
          />
        )
      case 'smtpTest':
        return <SmtpTest form={draft.form} />
      case 'testEmail':
        return <TestEmailBlock form={draft.form} />
      case 'emailTemplates':
        return <EmailTemplatesBlock />
      case 'quotaNotifyEmails':
        return <QuotaNotifyEmails ctx={ctx} />
      case 'svc:overloadCooldown':
        return <OverloadCooldownCard />
      case 'svc:rateLimit429':
        return <RateLimit429Card />
      case 'svc:panelRateLimit':
        return <PanelRateLimitCard />
      case 'svc:streamTimeout':
        return <StreamTimeoutCard />
      case 'svc:rectifier':
        return <RectifierCard />
      case 'svc:billingProbe':
        return <BillingProbeCard />
      case 'svc:ollamaUsage':
        return <OllamaUsageCard />
      case 'svc:opencodeUsage':
        return <OpenCodeUsageCard />
      default:
        return null
    }
  }

  const renderCard = (card: CardSpec) => (
    <SettingsCard
      key={card.id}
      id={`settings-card-${card.id}`}
      title={card.title}
      description={card.description}
    >
      {card.fields.map((f) => {
        if (f.showIf && rec[f.showIf[0]] !== f.showIf[1]) return null
        return (
          <FieldControl
            key={f.name}
            spec={f}
            value={rec[f.name]}
            configured={f.configured ? Boolean(rec[f.configured]) : undefined}
            onChange={(v) => patchForm({ [f.name]: v } as Partial<SettingsForm>)}
          />
        )
      })}
      {(card.custom ?? []).map((id) => (
        <React.Fragment key={id}>{renderCustom(id)}</React.Fragment>
      ))}
    </SettingsCard>
  )

  return (
    <div>
      <PageHeader title={t('admin.settings.title')} description={t('admin.settings.description')} />
      <div
        role="tablist"
        aria-label={t('admin.settings.title')}
        className="mb-5 flex gap-1 overflow-x-auto border-b"
      >
        {SETTINGS_TABS.map((k, i) => (
          <button
            key={k}
            id={`settings-tab-${k}`}
            type="button"
            role="tab"
            aria-selected={tab === k}
            aria-controls={`settings-panel-${k}`}
            tabIndex={tab === k ? 0 : -1}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === k
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setTab(k)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t(`admin.settings.tabs.${k}`)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`settings-panel-${tab}`}
        aria-labelledby={`settings-tab-${tab}`}
        className={cn('grid gap-6', tab !== 'backup' && 'pb-24')}
      >
        {tab === 'backup' ? <BackupPanel /> : SETTINGS_SPEC[tab].map(renderCard)}
      </div>
      {tab !== 'backup' ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 py-3 shadow-lg backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-[1600px] items-center justify-end">
            <Button loading={saving} onClick={() => void save()}>
              <Save aria-hidden />
              {saving ? t('common.saving') : t('admin.settings.saveSettings')}
            </Button>
          </div>
        </div>
      ) : null}
      <TotpStepUpDialog controller={stepUp} />
    </div>
  )
}
