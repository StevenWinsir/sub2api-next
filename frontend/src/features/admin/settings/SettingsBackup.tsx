/** 系统设置·备份：S3 配置 / 异步图片对象存储 / 定时备份与月度归档 / 备份记录（创建·下载·恢复·删除，含轮询）。 */
import * as React from 'react'
import { adminAPI } from '@/api'
import type {
  BackupDownloadPart,
  BackupMonthlyArchiveConfig,
  BackupRecord,
  BackupS3Config,
  BackupScheduleConfig,
  ImageStorageConfig
} from '@/api/admin/backup'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { notifyError, notifySuccess } from '@/features/admin/common/notify'
import { TotpStepUpDialog } from '@/features/auth/TotpStepUpDialog'
import { usePageVisible } from '@/hooks/usePageVisibility'
import { isStepUpBlocked, isStepUpCancelled, stepUpBlockReason, useStepUp } from '@/hooks/useStepUp'
import { t } from '@/i18n'
import { useAppStore } from '@/stores/app'
import { LabeledField, SwitchRow } from './settingsUi'

const B = (k: string, p?: Record<string, unknown>) => t(`admin.backup.${k}`, p)
const MAX_POLL = 900

export const formatSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 保留策略校验（与 Vue 版一致）。 */
export function scheduleValidationError(s: BackupScheduleConfig, a: BackupMonthlyArchiveConfig): string {
  const counts = [s.retain_days, s.retain_count]
  if (a.enabled) counts.push(a.retain_count)
  if (!counts.every((v) => Number.isSafeInteger(v) && v >= 0)) return B('archive.invalidRetention')
  if (a.enabled && !a.days.length && !a.include_month_end) return B('archive.selectDates')
  return ''
}

const statusTone = (s: string) =>
  s === 'completed' ? 'success' : s === 'running' ? 'info' : s === 'failed' ? 'error' : 'neutral'

export function BackupPanel() {
  const stepUp = useStepUp()
  const visible = usePageVisible()
  const app = useAppStore
  const [loaded, setLoaded] = React.useState(false)
  const [s3, setS3] = React.useState<BackupS3Config>({
    endpoint: '',
    region: 'auto',
    bucket: '',
    access_key_id: '',
    secret_access_key: '',
    prefix: 'backups/',
    force_path_style: false
  })
  const [s3Secret, setS3Secret] = React.useState(false)
  const [img, setImg] = React.useState<ImageStorageConfig>({
    enabled: false,
    reuse_backup_s3: true,
    bucket: '',
    prefix: 'images/',
    public_base_url: '',
    presign_expiry_hours: 24,
    max_download_bytes: 33554432,
    endpoint: '',
    region: 'auto',
    access_key_id: '',
    secret_access_key: '',
    force_path_style: false
  })
  const [imgSecret, setImgSecret] = React.useState(false)
  const [schedule, setSchedule] = React.useState<BackupScheduleConfig>({
    enabled: false,
    cron_expr: '0 2 * * *',
    retain_days: 14,
    retain_count: 10
  })
  const [archive, setArchive] = React.useState<BackupMonthlyArchiveConfig>({
    enabled: false,
    days: [1],
    include_month_end: false,
    retain_count: 0
  })
  const [savedArchive, setSavedArchive] = React.useState<BackupMonthlyArchiveConfig>(archive)
  const [backups, setBackups] = React.useState<BackupRecord[]>([])
  const [busy, setBusy] = React.useState<Record<string, boolean>>({})
  const [expireDays, setExpireDays] = React.useState(14)
  const [creating, setCreating] = React.useState(false)
  const [restoringId, setRestoringId] = React.useState('')
  const [parts, setParts] = React.useState<BackupDownloadPart[] | null>(null)
  const [confirm, setConfirm] = React.useState<{ kind: 'restore' | 'delete'; rec: BackupRecord } | null>(null)
  const [password, setPassword] = React.useState('')
  const setB = (k: string, v: boolean) => setBusy((b) => ({ ...b, [k]: v }))
  const pollRef = React.useRef<number | null>(null)
  const restoreRef = React.useRef<number | null>(null)

  const loadBackups = React.useCallback(async () => {
    try {
      setBackups((await adminAPI.backup.listBackups()).items || [])
    } catch (e) {
      notifyError(e, t('errors.networkError'))
    }
  }, [])

  const reportBlocked = (e: unknown): boolean => {
    if (!isStepUpBlocked(e)) return false
    app
      .getState()
      .showError(
        stepUpBlockReason(e) === 'STEP_UP_ADMIN_API_KEY_FORBIDDEN'
          ? t('stepUp.adminApiKeyForbidden')
          : t('stepUp.notEnabled')
      )
    return true
  }

  const stop = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current) window.clearInterval(ref.current)
    ref.current = null
  }
  const poll = React.useCallback(
    (id: string, mode: 'backup' | 'restore') => {
      const ref = mode === 'backup' ? pollRef : restoreRef
      if (ref.current) window.clearInterval(ref.current)
      let count = 0
      ref.current = window.setInterval(async () => {
        if (count++ >= MAX_POLL) {
          window.clearInterval(ref.current!)
          ref.current = null
          if (mode === 'backup') setCreating(false)
          else setRestoringId('')
          app
            .getState()
            .showWarning(B(mode === 'backup' ? 'operations.backupRunning' : 'operations.restoreRunning'))
          return
        }
        try {
          const rec = await adminAPI.backup.getBackup(id)
          setBackups((l) => l.map((r) => (r.id === rec.id ? rec : r)))
          const done =
            mode === 'backup'
              ? rec.status === 'completed' || rec.status === 'failed'
              : rec.restore_status === 'completed' || rec.restore_status === 'failed'
          if (!done) return
          window.clearInterval(ref.current!)
          ref.current = null
          if (mode === 'backup') {
            setCreating(false)
            if (rec.status === 'completed') notifySuccess(B('operations.backupCreated'))
            else app.getState().showError(rec.error_message || B('operations.backupFailed'))
          } else {
            setRestoringId('')
            if (rec.restore_status === 'completed') notifySuccess(B('actions.restoreSuccess'))
            else app.getState().showError(rec.restore_error || B('operations.restoreFailed'))
          }
          void loadBackups()
        } catch {
          /* 轮询失败不中断 */
        }
      }, 2000)
    },
    [app, loadBackups]
  )

  // 初始加载 + 恢复未完成操作的轮询
  React.useEffect(() => {
    let alive = true
    void (async () => {
      const [c, ic, sc, list] = await Promise.all([
        adminAPI.backup.getS3Config().catch((e) => (notifyError(e, t('errors.networkError')), null)),
        adminAPI.backup
          .getImageStorageConfig()
          .catch((e) => (notifyError(e, t('errors.networkError')), null)),
        adminAPI.backup.getSchedule().catch((e) => (notifyError(e, t('errors.networkError')), null)),
        adminAPI.backup.listBackups().catch((e) => (notifyError(e, t('errors.networkError')), null))
      ])
      if (!alive) return
      if (c) {
        setS3({
          endpoint: c.endpoint || '',
          region: c.region || 'auto',
          bucket: c.bucket || '',
          access_key_id: c.access_key_id || '',
          secret_access_key: '',
          prefix: c.prefix || 'backups/',
          force_path_style: c.force_path_style
        })
        setS3Secret(Boolean(c.access_key_id))
      }
      if (ic) {
        setImg({
          ...ic.config,
          prefix: ic.config.prefix || 'images/',
          region: ic.config.region || 'auto',
          secret_access_key: ''
        })
        setImgSecret(ic.secret_configured)
      }
      if (sc) {
        setSchedule({
          enabled: sc.enabled,
          cron_expr: sc.cron_expr || '0 2 * * *',
          retain_days: sc.retain_days ?? 14,
          retain_count: sc.retain_count ?? 10
        })
        const a = {
          enabled: sc.monthly_archive?.enabled ?? false,
          days: sc.monthly_archive?.days ?? [1],
          include_month_end: sc.monthly_archive?.include_month_end ?? false,
          retain_count: sc.monthly_archive?.retain_count ?? 0
        }
        setArchive(a)
        setSavedArchive({ ...a, days: [...a.days] })
      }
      const items = list?.items ?? []
      setBackups(items)
      setLoaded(true)
      const running = items.find((r) => r.status === 'running')
      if (running) {
        setCreating(true)
        poll(running.id, 'backup')
      }
      const rs = items.find((r) => r.restore_status === 'running')
      if (rs) {
        setRestoringId(rs.id)
        poll(rs.id, 'restore')
      }
    })()
    return () => {
      alive = false
      stop(pollRef)
      stop(restoreRef)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 标签页隐藏时暂停轮询，恢复时刷新并接续
  const wasHidden = React.useRef(false)
  React.useEffect(() => {
    if (!visible) {
      wasHidden.current = true
      stop(pollRef)
      stop(restoreRef)
      return
    }
    if (!wasHidden.current) return
    wasHidden.current = false
    void adminAPI.backup.listBackups().then((r) => {
      const items = r.items || []
      setBackups(items)
      const running = items.find((x) => x.status === 'running')
      if (running) {
        setCreating(true)
        poll(running.id, 'backup')
      }
      const rs = items.find((x) => x.restore_status === 'running')
      if (rs) {
        setRestoringId(rs.id)
        poll(rs.id, 'restore')
      }
    })
  }, [visible, poll])

  const guarded = async <T,>(key: string, fn: () => Promise<T>, onOk: (v: T) => void) => {
    setB(key, true)
    try {
      onOk(await stepUp.run(fn))
    } catch (e) {
      if (isStepUpCancelled(e) || reportBlocked(e)) return
      notifyError(e, t('errors.networkError'))
    } finally {
      setB(key, false)
    }
  }

  const saveS3 = () =>
    guarded(
      's3',
      () => adminAPI.backup.updateS3Config(s3),
      async () => {
        notifySuccess(B('s3.saved'))
        const c = await adminAPI.backup.getS3Config()
        setS3({
          ...s3,
          ...c,
          secret_access_key: '',
          region: c.region || 'auto',
          prefix: c.prefix || 'backups/'
        })
        setS3Secret(Boolean(c.access_key_id))
      }
    )
  const saveImg = () =>
    guarded(
      'img',
      () => adminAPI.backup.updateImageStorageConfig(img),
      async () => {
        notifySuccess(B('imageStorage.saved'))
        const r = await adminAPI.backup.getImageStorageConfig()
        setImg({
          ...r.config,
          prefix: r.config.prefix || 'images/',
          region: r.config.region || 'auto',
          secret_access_key: ''
        })
        setImgSecret(r.secret_configured)
      }
    )
  const test = async (key: 's3t' | 'imgt') => {
    setB(key, true)
    try {
      const r =
        key === 's3t'
          ? await adminAPI.backup.testS3Connection(s3)
          : await adminAPI.backup.testImageStorageConnection(img)
      if (r.ok) notifySuccess(r.message || B('s3.testSuccess'))
      else app.getState().showError(r.message || B('s3.testFailed'))
    } catch (e) {
      notifyError(e, t('errors.networkError'))
    } finally {
      setB(key, false)
    }
  }
  const validation = scheduleValidationError(schedule, archive)
  const saveSchedule = async () => {
    if (validation) return
    setB('sch', true)
    try {
      // 关闭归档时保留已保存的参数，仅把规则置为关闭
      const payload: BackupMonthlyArchiveConfig = archive.enabled
        ? { ...archive, days: [...archive.days] }
        : { ...savedArchive, days: [...savedArchive.days], enabled: false }
      await adminAPI.backup.updateSchedule({ ...schedule, monthly_archive: payload })
      setSavedArchive(payload)
      notifySuccess(B('schedule.saved'))
    } catch (e) {
      notifyError(e, t('errors.networkError'))
    } finally {
      setB('sch', false)
    }
  }
  const create = async () => {
    setCreating(true)
    try {
      const rec = await stepUp.run(() => adminAPI.backup.createBackup({ expire_days: expireDays }))
      setBackups((l) => [rec, ...l])
      poll(rec.id, 'backup')
    } catch (e) {
      setCreating(false)
      if (isStepUpCancelled(e) || reportBlocked(e)) return
      const status =
        (e as { status?: number; response?: { status?: number } })?.status ??
        (e as { response?: { status?: number } })?.response?.status
      if (status === 409) app.getState().showWarning(B('operations.alreadyInProgress'))
      else notifyError(e, t('errors.networkError'))
    }
  }
  const download = async (id: string) => {
    try {
      const r = await stepUp.run(() => adminAPI.backup.getDownloadURL(id))
      if (r.parts && r.parts.length > 0) return setParts(r.parts)
      if (!r.url) throw new Error(B('actions.downloadFailed'))
      // 预签名 URL 带 attachment disposition，同页 anchor 导航触发下载（step-up 弹窗 await 会耗尽瞬态用户激活，window.open 会被拦截）
      const a = document.createElement('a')
      a.href = r.url
      a.rel = 'noopener'
      a.click()
    } catch (e) {
      if (isStepUpCancelled(e) || reportBlocked(e)) return
      notifyError(e, t('errors.networkError'))
    }
  }
  const doRestore = async (rec: BackupRecord) => {
    if (!password) return
    const pw = password
    setConfirm(null)
    setPassword('')
    setRestoringId(rec.id)
    try {
      const r = await stepUp.run(() => adminAPI.backup.restoreBackup(rec.id, pw))
      setBackups((l) => l.map((x) => (x.id === r.id ? r : x)))
      poll(rec.id, 'restore')
    } catch (e) {
      setRestoringId('')
      if (isStepUpCancelled(e) || reportBlocked(e)) return
      const status = (e as { status?: number })?.status
      if (status === 409) app.getState().showWarning(B('operations.restoreRunning'))
      else notifyError(e, t('errors.networkError'))
    }
  }
  const doDelete = async (rec: BackupRecord) => {
    setConfirm(null)
    try {
      await adminAPI.backup.deleteBackup(rec.id, !!rec.monthly_archive)
      notifySuccess(B('actions.deleted'))
      void loadBackups()
    } catch (e) {
      notifyError(e, t('errors.networkError'))
    }
  }

  const toggleDay = (d: number) =>
    setArchive((a) => ({
      ...a,
      days: (a.days.includes(d) ? a.days.filter((x) => x !== d) : [...a.days, d]).sort((x, y) => x - y)
    }))
  const s3Fields = (
    v: BackupS3Config | ImageStorageConfig,
    set: (p: Partial<BackupS3Config & ImageStorageConfig>) => void,
    secretConfigured: boolean,
    includeBucket = true
  ) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <LabeledField label={B('s3.endpoint')}>
        <Input
          className="font-mono text-[13px]"
          value={v.endpoint}
          onChange={(e) => set({ endpoint: e.target.value })}
        />
      </LabeledField>
      <LabeledField label={B('s3.region')}>
        <Input value={v.region} onChange={(e) => set({ region: e.target.value })} />
      </LabeledField>
      {includeBucket ? (
        <LabeledField label={B('s3.bucket')}>
          <Input value={v.bucket} onChange={(e) => set({ bucket: e.target.value })} />
        </LabeledField>
      ) : null}
      <LabeledField label={B('s3.accessKeyId')}>
        <Input
          className="font-mono text-[13px]"
          autoComplete="off"
          value={v.access_key_id}
          onChange={(e) => set({ access_key_id: e.target.value })}
        />
      </LabeledField>
      <LabeledField
        label={B('s3.secretAccessKey')}
        hint={secretConfigured ? B('s3.secretConfigured') : undefined}
      >
        <Input
          type="password"
          autoComplete="new-password"
          className="font-mono text-[13px]"
          value={v.secret_access_key ?? ''}
          onChange={(e) => set({ secret_access_key: e.target.value })}
        />
      </LabeledField>
      <div className="self-end">
        <SwitchRow
          label={B('s3.forcePathStyle')}
          checked={v.force_path_style}
          onChange={(x) => set({ force_path_style: x })}
        />
      </div>
    </div>
  )
  const card = (title: string, desc: string | undefined, body: React.ReactNode) => (
    <Card className="overflow-hidden">
      <div className="border-b px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold">{title}</h2>
        {desc ? <p className="mt-1 text-sm text-muted-foreground">{desc}</p> : null}
      </div>
      <div className="grid gap-4 p-5 sm:p-6">{body}</div>
    </Card>
  )

  if (!loaded) return <Skeleton className="h-64" />
  return (
    <div className="grid gap-6">
      {card(
        B('s3.title'),
        B('s3.description'),
        <>
          {s3Fields(s3, (p) => setS3({ ...s3, ...p } as BackupS3Config), s3Secret)}
          <LabeledField label={B('s3.prefix')}>
            <Input
              className="max-w-sm font-mono text-[13px]"
              value={s3.prefix}
              onChange={(e) => setS3({ ...s3, prefix: e.target.value })}
            />
          </LabeledField>
          <div className="flex gap-2">
            <Button loading={busy.s3} onClick={() => void saveS3()}>
              {t('common.save')}
            </Button>
            <Button variant="outline" loading={busy.s3t} onClick={() => void test('s3t')}>
              {B('s3.testConnection')}
            </Button>
          </div>
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">{B('r2Guide.title')}</summary>
            <p className="mt-2 text-xs text-muted-foreground">{B('r2Guide.intro')}</p>
            <ol className="mt-2 grid list-decimal gap-2 pl-5 text-xs">
              {(['step1', 'step2', 'step3', 'step4'] as const).map((s) => (
                <li key={s}>
                  <b>{B(`r2Guide.${s}.title`)}</b>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">{B('r2Guide.freeTier')}</p>
          </details>
        </>
      )}

      {card(
        B('imageStorage.title'),
        B('imageStorage.description'),
        <>
          <SwitchRow
            label={B('imageStorage.enabled')}
            checked={img.enabled}
            onChange={(v) => setImg({ ...img, enabled: v })}
          />
          {img.enabled ? (
            <>
              <SwitchRow
                label={B('imageStorage.reuseBackupS3')}
                checked={img.reuse_backup_s3}
                onChange={(v) => setImg({ ...img, reuse_backup_s3: v })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <LabeledField
                  label={B('imageStorage.bucket')}
                  hint={img.reuse_backup_s3 ? B('imageStorage.bucketInherited') : undefined}
                >
                  <Input value={img.bucket} onChange={(e) => setImg({ ...img, bucket: e.target.value })} />
                </LabeledField>
                <LabeledField label={B('imageStorage.prefix')}>
                  <Input
                    className="font-mono text-[13px]"
                    value={img.prefix}
                    onChange={(e) => setImg({ ...img, prefix: e.target.value })}
                  />
                </LabeledField>
                <LabeledField label={B('imageStorage.publicBaseUrl')}>
                  <Input
                    type="url"
                    placeholder={B('imageStorage.publicBaseUrlPlaceholder')}
                    value={img.public_base_url}
                    onChange={(e) => setImg({ ...img, public_base_url: e.target.value })}
                  />
                </LabeledField>
                <LabeledField label={B('imageStorage.presignExpiryHours')}>
                  <Input
                    type="number"
                    min={1}
                    value={img.presign_expiry_hours}
                    onChange={(e) => setImg({ ...img, presign_expiry_hours: Number(e.target.value) })}
                  />
                </LabeledField>
              </div>
              {!img.reuse_backup_s3
                ? s3Fields(img, (p) => setImg({ ...img, ...p } as ImageStorageConfig), imgSecret, false)
                : null}
            </>
          ) : null}
          <div className="flex gap-2">
            <Button loading={busy.img} onClick={() => void saveImg()}>
              {t('common.save')}
            </Button>
            <Button variant="outline" loading={busy.imgt} onClick={() => void test('imgt')}>
              {B('s3.testConnection')}
            </Button>
          </div>
        </>
      )}

      {card(
        B('schedule.title'),
        B('schedule.description'),
        <>
          <SwitchRow
            label={B('schedule.enabled')}
            checked={schedule.enabled}
            onChange={(v) => setSchedule({ ...schedule, enabled: v })}
          />
          {schedule.enabled ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <LabeledField label={B('schedule.cronExpr')} hint={B('schedule.cronHint')}>
                <Input
                  className="font-mono text-[13px]"
                  value={schedule.cron_expr}
                  onChange={(e) => setSchedule({ ...schedule, cron_expr: e.target.value })}
                />
              </LabeledField>
              <LabeledField label={B('schedule.retainDays')} hint={B('schedule.retainDaysHint')}>
                <Input
                  type="number"
                  min={0}
                  value={schedule.retain_days}
                  onChange={(e) => setSchedule({ ...schedule, retain_days: e.target.valueAsNumber })}
                />
              </LabeledField>
              <LabeledField label={B('schedule.retainCount')} hint={B('schedule.retainCountHint')}>
                <Input
                  type="number"
                  min={0}
                  value={schedule.retain_count}
                  onChange={(e) => setSchedule({ ...schedule, retain_count: e.target.valueAsNumber })}
                />
              </LabeledField>
            </div>
          ) : null}
          <div className="grid gap-3 rounded-md border p-4">
            <SwitchRow
              label={B('archive.title')}
              hint={archive.enabled ? B('archive.independentHint') : B('archive.disabledHint')}
              checked={archive.enabled}
              onChange={(v) => setArchive({ ...archive, enabled: v })}
            />
            {archive.enabled ? (
              <>
                <div>
                  <b className="text-xs">{B('archive.dates')}</b>
                  <p className="text-xs text-muted-foreground">{B('archive.datesHint')}</p>
                  <div className="mt-2 grid grid-cols-7 gap-1 sm:grid-cols-10">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <label
                        key={d}
                        className="flex items-center justify-center gap-1 rounded border px-1 py-1 text-xs"
                      >
                        <Checkbox
                          checked={archive.days.includes(d)}
                          onCheckedChange={() => toggleDay(d)}
                          aria-label={B('archive.day', { day: d })}
                        />
                        {d}
                      </label>
                    ))}
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={archive.include_month_end}
                      onCheckedChange={(v) => setArchive({ ...archive, include_month_end: v === true })}
                    />
                    {B('archive.monthEnd')}
                  </label>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <LabeledField label={B('archive.count')} hint={B('archive.countHint')} className="w-48">
                    <Input
                      type="number"
                      min={1}
                      disabled={archive.retain_count === 0}
                      value={
                        archive.retain_count === 0
                          ? ''
                          : Number.isNaN(archive.retain_count)
                            ? ''
                            : archive.retain_count
                      }
                      onChange={(e) =>
                        setArchive({
                          ...archive,
                          retain_count: e.target.valueAsNumber === 0 ? Number.NaN : e.target.valueAsNumber
                        })
                      }
                    />
                  </LabeledField>
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <Checkbox
                      checked={archive.retain_count === 0}
                      onCheckedChange={(v) => setArchive({ ...archive, retain_count: v === true ? 0 : 12 })}
                    />
                    {B('archive.forever')}
                  </label>
                </div>
              </>
            ) : null}
          </div>
          <p className={`text-xs ${validation ? 'text-destructive' : 'text-muted-foreground'}`}>
            <b>{B('schedule.preview')}: </b>
            {validation ||
              (() => {
                const { retain_days: d, retain_count: c } = schedule
                const ord =
                  d > 0 && c > 0
                    ? B('schedule.previewBoth', { days: d, count: c })
                    : d > 0
                      ? B('schedule.previewDays', { days: d })
                      : c > 0
                        ? B('schedule.previewCount', { count: c })
                        : B('schedule.previewUnlimited')
                if (!archive.enabled) return ord
                const dates = [...archive.days]
                  .sort((a, b) => a - b)
                  .map((x) => B('archive.day', { day: x }))
                  .concat(archive.include_month_end ? [B('archive.monthEnd')] : [])
                  .join(', ')
                return `${ord} ${B('archive.preview', { dates, retention: archive.retain_count === 0 ? B('archive.forever') : B('archive.retainLatest', { count: archive.retain_count }) })}`
              })()}
          </p>
          <Button
            className="justify-self-start"
            disabled={Boolean(validation)}
            loading={busy.sch}
            onClick={() => void saveSchedule()}
          >
            {t('common.save')}
          </Button>
        </>
      )}

      {card(
        B('operations.title'),
        B('operations.description'),
        <>
          <div className="flex flex-wrap items-end gap-3">
            <LabeledField label={B('operations.expireDays')} className="w-40">
              <Input
                type="number"
                min={0}
                value={expireDays}
                onChange={(e) => setExpireDays(Number(e.target.value))}
              />
            </LabeledField>
            <Button loading={creating} onClick={() => void create()}>
              {creating ? B('operations.backing') : B('operations.createBackup')}
            </Button>
          </div>
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{B('empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    {(
                      [
                        'status',
                        'fileName',
                        'size',
                        'expiresAt',
                        'triggeredBy',
                        'startedAt',
                        'actions'
                      ] as const
                    ).map((c) => (
                      <th key={c} className="px-2 py-2 font-medium">
                        {B(`columns.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {backups.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="px-2 py-2">
                        <StatusBadge status={statusTone(r.status)}>{B(`status.${r.status}`)}</StatusBadge>
                        {r.status === 'running' && r.progress ? (
                          <div className="text-xs text-muted-foreground">{B(`progress.${r.progress}`)}</div>
                        ) : null}
                        {r.restore_status ? (
                          <div className="text-xs text-muted-foreground">
                            {B('actions.restore')}: {r.restore_status}
                          </div>
                        ) : null}
                        {r.error_message ? (
                          <div className="max-w-xs text-xs text-destructive">{r.error_message}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">
                        {r.file_name || '—'}
                        {r.monthly_archive ? (
                          <Badge variant="secondary" className="ml-1">
                            {B('archive.badge')}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {formatSize(r.size_bytes)}
                        {r.parts && r.parts.length > 1 ? ` · ${B('columns.parts')} ${r.parts.length}` : ''}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-xs">
                        {r.expires_at ? new Date(r.expires_at).toLocaleString() : B('neverExpire')}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {B(`trigger.${r.triggered_by === 'scheduled' ? 'scheduled' : 'manual'}`)}
                      </td>
                      <td className="px-2 py-2 text-xs whitespace-nowrap">
                        {r.started_at ? new Date(r.started_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.status === 'completed' ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => void download(r.id)}>
                                {B('actions.download')}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={Boolean(restoringId)}
                                loading={restoringId === r.id}
                                onClick={() => {
                                  setPassword('')
                                  setConfirm({ kind: 'restore', rec: r })
                                }}
                              >
                                {B('actions.restore')}
                              </Button>
                            </>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={r.status === 'running'}
                            onClick={() => setConfirm({ kind: 'delete', rec: r })}
                          >
                            {t('common.delete')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <AdminFormDialog
        open={parts !== null}
        onOpenChange={(o) => !o && setParts(null)}
        title={B('actions.downloadParts')}
        description={B('actions.downloadPartsHint')}
        size="md"
      >
        <ul className="grid gap-2">
          {(parts ?? []).map((p) => (
            <li key={p.index} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {B('actions.partLabel', { index: p.index })} · {formatSize(p.size_bytes)}
              </span>
              <a className="text-primary underline" href={p.url} rel="noopener">
                {B('actions.download')}
              </a>
            </li>
          ))}
        </ul>
      </AdminFormDialog>

      <AdminFormDialog
        open={confirm?.kind === 'restore'}
        onOpenChange={(o) => !o && (setConfirm(null), setPassword(''))}
        title={B('actions.restore')}
        description={B('actions.restoreConfirm')}
        size="md"
        destructive
        submitText={B('actions.restore')}
        submitDisabled={!password}
        onSubmit={() => {
          if (confirm) void doRestore(confirm.rec)
        }}
      >
        <LabeledField label={B('actions.restorePasswordPrompt')}>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </LabeledField>
      </AdminFormDialog>
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('common.delete')}
        description={confirm?.rec.monthly_archive ? B('archive.deleteConfirm') : B('actions.deleteConfirm')}
        destructive
        onConfirm={() => {
          if (confirm) void doDelete(confirm.rec)
        }}
      />
      <TotpStepUpDialog controller={stepUp} />
    </div>
  )
}
