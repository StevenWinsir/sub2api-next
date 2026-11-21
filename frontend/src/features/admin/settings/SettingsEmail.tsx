/** 系统设置·邮件：SMTP 连通性测试、测试邮件、邮件模板编辑器（含沙箱预览）。 */
import * as React from 'react'
import { adminAPI } from '@/api/admin'
import type { EmailTemplateOption } from '@/api/admin/settings'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NativeSelect } from '@/components/NativeSelect'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { copyText } from '@/hooks/useClipboard'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { extractApiErrorMessage } from '@/utils/apiError'
import type { SettingsForm } from './settingsModel'
import { LabeledField } from './settingsUi'

const S = (k: string, p?: Record<string, unknown>) => t(`admin.settings.${k}`, p)

export function SmtpTest({ form }: { form: SettingsForm }) {
  const [busy, setBusy] = React.useState(false)
  const run = async () => {
    setBusy(true)
    try {
      // 未输入新密码时传空串，由后端沿用已保存的密码
      const r = await adminAPI.settings.testSmtpConnection({
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_username: form.smtp_username,
        smtp_password: form.smtp_password,
        smtp_use_tls: form.smtp_use_tls
      })
      useAppStore.getState().showSuccess(r.message || S('smtpConnectionSuccess'))
    } catch (e) {
      useAppStore.getState().showError(extractApiErrorMessage(e, S('failedToTestSmtp')))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      className="justify-self-start"
      loading={busy}
      onClick={() => void run()}
    >
      {busy ? S('smtp.testing') : S('smtp.testConnection')}
    </Button>
  )
}

export function TestEmailBlock({ form }: { form: SettingsForm }) {
  const [to, setTo] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const run = async () => {
    if (!to) return useAppStore.getState().showError(S('testEmail.enterRecipientHint'))
    setBusy(true)
    try {
      const r = await adminAPI.settings.sendTestEmail({
        email: to,
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_username: form.smtp_username,
        smtp_password: form.smtp_password,
        smtp_from_email: form.smtp_from_email,
        smtp_from_name: form.smtp_from_name,
        smtp_use_tls: form.smtp_use_tls
      })
      useAppStore.getState().showSuccess(r.message || S('testEmailSent'))
    } catch (e) {
      useAppStore.getState().showError(extractApiErrorMessage(e, S('failedToSendTestEmail')))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <LabeledField label={S('testEmail.recipientEmail')} className="min-w-64 flex-1">
        <Input
          type="email"
          placeholder={S('testEmail.recipientEmailPlaceholder')}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </LabeledField>
      <Button type="button" loading={busy} onClick={() => void run()}>
        {busy ? S('testEmail.sending') : S('testEmail.sendTestEmail')}
      </Button>
    </div>
  )
}

const FALLBACK_PLACEHOLDERS = [
  '{{site_name}}',
  '{{recipient_name}}',
  '{{recipient_email}}',
  '{{verification_code}}',
  '{{expires_in_minutes}}',
  '{{reset_url}}',
  '{{subscription_group}}',
  '{{subscription_days}}',
  '{{expiry_time}}',
  '{{days_remaining}}',
  '{{current_balance}}',
  '{{threshold}}',
  '{{recharge_url}}',
  '{{recharge_amount}}',
  '{{order_id}}',
  '{{unsubscribe_url}}',
  '{{account_id}}',
  '{{account_name}}',
  '{{platform}}',
  '{{quota_dimension}}',
  '{{quota_used}}',
  '{{quota_limit}}',
  '{{quota_remaining}}',
  '{{quota_threshold}}',
  '{{triggered_at}}',
  '{{group_name}}',
  '{{moderation_category}}',
  '{{moderation_score}}',
  '{{violation_count}}',
  '{{ban_threshold}}',
  '{{rule_name}}',
  '{{severity}}',
  '{{alert_status}}',
  '{{metric_type}}',
  '{{operator}}',
  '{{metric_value}}',
  '{{threshold_value}}',
  '{{alert_description}}',
  '{{report_name}}',
  '{{report_type}}',
  '{{report_start_time}}',
  '{{report_end_time}}',
  '{{report_summary_display}}',
  '{{report_detail_display}}',
  '{{report_html}}'
]

const eventKey = (v: string) => v.replace(/[^a-z0-9]+/gi, '_')
const normalizeOption = (o: string | EmailTemplateOption): EmailTemplateOption =>
  typeof o === 'string' ? { value: o } : o

export function EmailTemplatesBlock() {
  const locale = useLocale()
  const [loadingList, setLoadingList] = React.useState(true)
  const [events, setEvents] = React.useState<EmailTemplateOption[]>([])
  const [locales, setLocales] = React.useState<string[]>([])
  const [event, setEvent] = React.useState('')
  const [tplLocale, setTplLocale] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [html, setHtml] = React.useState('')
  const [custom, setCustom] = React.useState(false)
  const [placeholders, setPlaceholders] = React.useState<string[]>([])
  const [loadingTpl, setLoadingTpl] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [previewing, setPreviewing] = React.useState(false)
  const [restoring, setRestoring] = React.useState(false)
  const [confirmRestore, setConfirmRestore] = React.useState(false)
  const [preview, setPreview] = React.useState<{ subject: string; html: string } | null>(null)

  const loadTemplate = React.useCallback(async (ev: string, lc: string) => {
    if (!ev || !lc) return
    setLoadingTpl(true)
    try {
      const d = await adminAPI.settings.getEmailTemplate(ev, lc)
      setSubject(d.subject)
      setHtml(d.html)
      setCustom(Boolean(d.is_custom))
      setPlaceholders(d.placeholders?.length ? d.placeholders : FALLBACK_PLACEHOLDERS)
      setPreview(null)
    } catch (e) {
      notifyError(e)
    } finally {
      setLoadingTpl(false)
    }
  }, [])

  React.useEffect(() => {
    let alive = true
    Promise.resolve()
      .then(() => adminAPI.settings.getEmailTemplates())
      .then((list) => {
        if (!alive) return
        const opts = (list.events ?? []).map(normalizeOption)
        setEvents(opts)
        setLocales(list.locales ?? [])
        const ev = opts[0]?.value ?? ''
        const lc = (list.locales ?? []).includes(locale) ? locale : ((list.locales ?? [])[0] ?? '')
        setEvent(ev)
        setTplLocale(lc)
        void loadTemplate(ev, lc)
      })
      .catch((e) => notifyError(e))
      .finally(() => alive && setLoadingList(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tx = (key: string): string => {
    const v = t(key)
    return v === key ? '' : v
  }
  const eventLabel = (o: EmailTemplateOption) =>
    o.label || tx(`adminUi.settings.templates.events.${eventKey(o.value)}`) || o.value
  const current = events.find((o) => o.value === event)
  const timing = current?.description || tx(`adminUi.settings.templates.timing.${eventKey(event)}`)

  const save = async () => {
    if (!subject.trim() || !html.trim()) return notifyError(new Error(S('emailTemplates.validationRequired')))
    setSaving(true)
    try {
      const d = await adminAPI.settings.updateEmailTemplate(event, tplLocale, { subject, html })
      setCustom(Boolean(d.is_custom ?? true))
      notifySuccess(S('emailTemplates.saveSuccess'))
    } catch (e) {
      notifyError(e)
    } finally {
      setSaving(false)
    }
  }
  const doPreview = async () => {
    setPreviewing(true)
    try {
      setPreview(await adminAPI.settings.previewEmailTemplate({ event, locale: tplLocale, subject, html }))
    } catch (e) {
      notifyError(e)
    } finally {
      setPreviewing(false)
    }
  }
  const restore = async () => {
    setConfirmRestore(false)
    setRestoring(true)
    try {
      const d = await adminAPI.settings.restoreOfficialEmailTemplate(event, tplLocale)
      setSubject(d.subject)
      setHtml(d.html)
      setCustom(false)
      setPreview(null)
      notifySuccess(S('emailTemplates.restoreSuccess'))
    } catch (e) {
      notifyError(e)
    } finally {
      setRestoring(false)
    }
  }

  if (loadingList) return <Skeleton className="h-32" />
  if (events.length === 0) return <p className="text-sm text-muted-foreground">{S('emailTemplates.empty')}</p>
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledField label={S('emailTemplates.event')} hint={timing}>
          <NativeSelect
            value={event}
            onChange={(e) => {
              setEvent(e.target.value)
              void loadTemplate(e.target.value, tplLocale)
            }}
          >
            {events.map((o) => (
              <option key={o.value} value={o.value}>
                {eventLabel(o)}
              </option>
            ))}
          </NativeSelect>
        </LabeledField>
        <LabeledField label={S('emailTemplates.locale')}>
          <NativeSelect
            value={tplLocale}
            onChange={(e) => {
              setTplLocale(e.target.value)
              void loadTemplate(event, e.target.value)
            }}
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {l === 'zh' ? S('emailTemplates.localeZh') : l === 'en' ? S('emailTemplates.localeEn') : l}
              </option>
            ))}
          </NativeSelect>
        </LabeledField>
      </div>
      {custom ? (
        <Badge variant="secondary" className="justify-self-start">
          {S('emailTemplates.customized')}
        </Badge>
      ) : null}
      {loadingTpl ? (
        <Skeleton className="h-48" />
      ) : (
        <>
          <LabeledField label={S('emailTemplates.subject')}>
            <Input
              placeholder={S('emailTemplates.subjectPlaceholder')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </LabeledField>
          <LabeledField label={S('emailTemplates.html')}>
            <Textarea
              rows={14}
              className="font-mono text-xs"
              placeholder={S('emailTemplates.htmlPlaceholder')}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
            />
          </LabeledField>
          <div className="grid gap-1">
            <b className="text-xs">{S('emailTemplates.placeholders')}</b>
            <p className="text-xs text-muted-foreground">{S('emailTemplates.placeholdersHelp')}</p>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {placeholders.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted"
                  onClick={async () => {
                    if (await copyText(p)) notifySuccess(S('emailTemplates.placeholderCopied'))
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" loading={saving} onClick={() => void save()}>
              {saving ? S('emailTemplates.saving') : S('emailTemplates.save')}
            </Button>
            <Button type="button" variant="outline" loading={previewing} onClick={() => void doPreview()}>
              {previewing ? S('emailTemplates.previewing') : S('emailTemplates.preview')}
            </Button>
            <Button type="button" variant="ghost" loading={restoring} onClick={() => setConfirmRestore(true)}>
              {restoring ? S('emailTemplates.restoring') : S('emailTemplates.restoreOfficial')}
            </Button>
          </div>
          <div className="grid gap-1">
            <b className="text-xs">{S('emailTemplates.livePreview')}</b>
            <p className="text-xs text-muted-foreground">{S('emailTemplates.previewSecurityHint')}</p>
            {preview ? (
              <>
                <p className="text-sm font-medium">{preview.subject}</p>
                {/* sandbox="" 禁用脚本 / 表单 / 同源：模板 HTML 只作静态预览 */}
                <iframe
                  title={S('emailTemplates.livePreview')}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  srcDoc={preview.html}
                  className="h-96 w-full rounded-md border bg-white"
                />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{S('emailTemplates.noPreview')}</p>
            )}
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        title={S('emailTemplates.restoreOfficial')}
        description={S('emailTemplates.restoreConfirm')}
        destructive
        onConfirm={() => void restore()}
      />
    </div>
  )
}
