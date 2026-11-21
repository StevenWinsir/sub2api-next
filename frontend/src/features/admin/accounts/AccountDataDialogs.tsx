/** 账号数据导出（需 Step-up）与导入。 */
import * as React from 'react'
import { saveAs } from 'file-saver'
import { adminAPI } from '@/api/admin'
import { FormField } from '@/components/FormField'
import { Checkbox } from '@/components/ui/checkbox'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import type { StepUpController } from '@/hooks/useStepUp'
import { t } from '@/i18n'
import type { AdminDataImportResult, AdminDataPayload } from '@/types'

type ExportOptions = NonNullable<Parameters<typeof adminAPI.accounts.exportData>[0]>

export function AccountExportDialog({
  ids,
  filters,
  stepUp,
  onClose
}: {
  ids: number[]
  filters: NonNullable<ExportOptions['filters']>
  stepUp: StepUpController
  onClose: () => void
}) {
  const { busy, run } = useAdminAction()
  const [includeProxies, setIncludeProxies] = React.useState(true)
  const submit = async () => {
    const payload = await run(
      () =>
        adminAPI.accounts.exportData({
          ids: ids.length > 0 ? ids : undefined,
          filters: ids.length > 0 ? undefined : filters,
          includeProxies
        }),
      { fallback: t('admin.accounts.dataExportFailed'), stepUp }
    )
    if (!payload) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    saveAs(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      `sub2api-account-${stamp}.json`
    )
    notifySuccess(t('admin.accounts.dataExported'))
    onClose()
  }
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.accounts.dataExport')}
      description={t('admin.accounts.dataExportConfirmMessage')}
      onSubmit={submit}
      submitting={busy}
      submitText={t('admin.accounts.dataExportConfirm')}
    >
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={includeProxies} onCheckedChange={(v) => setIncludeProxies(v === true)} />
        {t('admin.accounts.dataExportIncludeProxies')}
      </label>
    </AdminFormDialog>
  )
}

export function AccountImportDialog({
  stepUp,
  onClose,
  onImported
}: {
  stepUp: StepUpController
  onClose: () => void
  onImported: () => void
}) {
  const { busy, run } = useAdminAction()
  const [file, setFile] = React.useState<File | null>(null)
  const [skipBind, setSkipBind] = React.useState(false)
  const [result, setResult] = React.useState<AdminDataImportResult | null>(null)

  const submit = async () => {
    if (!file) return notifyError(new Error(t('admin.accounts.dataImportSelectFile')))
    let data: AdminDataPayload
    try {
      data = JSON.parse(await file.text()) as AdminDataPayload
    } catch {
      return notifyError(new Error(t('admin.accounts.dataImportParseFailed')))
    }
    if (!Array.isArray(data.accounts))
      return notifyError(new Error(t('admin.accounts.dataImportInvalidFile', { name: file.name })))
    const res = await run(() => adminAPI.accounts.importData({ data, skip_default_group_bind: skipBind }), {
      fallback: t('admin.accounts.dataImportFailed'),
      stepUp
    })
    if (res) {
      setResult(res)
      onImported()
    }
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.accounts.dataImportTitle')}
      description={t('admin.accounts.dataImportHint')}
      onSubmit={result ? undefined : submit}
      submitting={busy}
      submitText={t('admin.accounts.dataImportButton')}
    >
      <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
        {t('admin.accounts.dataImportWarning')}
      </p>
      <FormField label={t('admin.accounts.dataImportFile')}>
        <input
          type="file"
          accept="application/json,.json"
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </FormField>
      {result ? (
        <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm" role="status">
          <p className="font-medium">{t('admin.accounts.dataImportResult')}</p>
          <p>
            {t('admin.accounts.dataImportResultSummary', {
              proxy_created: result.proxy_created,
              proxy_reused: result.proxy_reused,
              proxy_failed: result.proxy_failed,
              account_created: result.account_created,
              account_failed: result.account_failed
            })}
          </p>
          {(result.errors ?? []).slice(0, 10).map((e, i) => (
            <p key={i} className="text-xs text-destructive">
              {e.kind} {e.name || e.proxy_key || ''}: {e.message}
            </p>
          ))}
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={skipBind} onCheckedChange={(v) => setSkipBind(v === true)} />
          {t('adminUi.accounts.skipDefaultGroupBind')}
        </label>
      )}
    </AdminFormDialog>
  )
}
