/**
 * 版本徽章（侧栏底部）：管理员看到带下拉的版本 / 更新检查 / 在线更新 / 回滚 / 重启；
 * 普通用户只看到静态版本号。更新检查来自 /admin/system/check-updates，重启后用 /health 探活。
 */
import * as React from 'react'
import { Check, Download, RefreshCw, RotateCcw, X } from 'lucide-react'
import {
  getRollbackVersions,
  performUpdate,
  restartService,
  rollback,
  type RollbackVersionInfo
} from '@/api/admin/system'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { copyText } from '@/hooks/useClipboard'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import {
  dockerRollbackCommand,
  formatPublishedAt,
  scriptRollbackCommand,
  waitForService
} from './versionHelpers'

const errText = (e: unknown, fallback: string): string => {
  const err = e as { response?: { data?: { message?: string } }; message?: string }
  return err?.response?.data?.message || err?.message || fallback
}

export function VersionBadge({ collapsed = false }: { collapsed?: boolean }) {
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const siteVersion = useAppStore((s) => s.siteVersion)
  const currentVersion = useAppStore((s) => s.currentVersion) || siteVersion
  const latestVersion = useAppStore((s) => s.latestVersion)
  const hasUpdate = useAppStore((s) => s.hasUpdate)
  const loading = useAppStore((s) => s.versionLoading)
  const releaseInfo = useAppStore((s) => s.releaseInfo)
  const buildType = useAppStore((s) => s.buildType)
  const isRelease = buildType === 'release'

  const [open, setOpen] = React.useState(false)
  const [updating, setUpdating] = React.useState(false)
  const [updateError, setUpdateError] = React.useState('')
  const [success, setSuccess] = React.useState<null | { kind: 'update' | 'rollback'; needRestart: boolean }>(
    null
  )
  const [restarting, setRestarting] = React.useState(false)
  const [countdown, setCountdown] = React.useState(0)
  const [rbOpen, setRbOpen] = React.useState(false)
  const [rbVersions, setRbVersions] = React.useState<RollbackVersionInfo[]>([])
  const [rbLoading, setRbLoading] = React.useState(false)
  const [rbError, setRbError] = React.useState('')
  const [rbSelected, setRbSelected] = React.useState('')
  const [rbBusy, setRbBusy] = React.useState(false)
  const [manualTab, setManualTab] = React.useState<'script' | 'docker'>('script')
  const [copied, setCopied] = React.useState(false)

  // 管理员挂载时用缓存拉取一次版本信息（强制刷新由下拉里的按钮触发）
  React.useEffect(() => {
    if (!isAdmin) return
    const id = window.setTimeout(() => void useAppStore.getState().fetchVersion(false), 0)
    return () => window.clearTimeout(id)
  }, [isAdmin])

  const refresh = async () => {
    setUpdateError('')
    setSuccess(null)
    setRbOpen(false)
    setRbVersions([])
    setRbSelected('')
    await useAppStore.getState().fetchVersion(true)
  }
  const doUpdate = async () => {
    if (updating) return
    setUpdating(true)
    setUpdateError('')
    try {
      const r = await performUpdate()
      setSuccess({ kind: 'update', needRestart: r.need_restart })
      useAppStore.getState().clearVersionCache()
    } catch (e) {
      setUpdateError(errText(e, t('version.updateFailed')))
    } finally {
      setUpdating(false)
    }
  }
  const toggleRollback = async () => {
    const next = !rbOpen
    setRbOpen(next)
    if (next && isRelease && rbVersions.length === 0 && !rbLoading) {
      setRbLoading(true)
      setRbError('')
      try {
        setRbVersions((await getRollbackVersions()).versions || [])
      } catch (e) {
        setRbError(errText(e, t('version.loadVersionsFailed')))
      } finally {
        setRbLoading(false)
      }
    }
  }
  const doRollback = async () => {
    if (rbBusy || !rbSelected) return
    setRbBusy(true)
    setRbError('')
    try {
      const r = await rollback(rbSelected)
      setSuccess({ kind: 'rollback', needRestart: r.need_restart })
      setRbOpen(false)
      useAppStore.getState().clearVersionCache()
    } catch (e) {
      setRbError(errText(e, t('version.rollbackFailed')))
    } finally {
      setRbBusy(false)
    }
  }
  const doRestart = async () => {
    if (restarting) return
    setRestarting(true)
    setCountdown(8)
    try {
      await restartService()
    } catch {
      /* 预期：重启期间连接会断开 */
    }
    let left = 8
    const timer = window.setInterval(() => {
      left -= 1
      setCountdown(left)
      if (left <= 0) {
        window.clearInterval(timer)
        void waitForService((url, init) => fetch(url, init)).then(() => window.location.reload())
      }
    }, 1000)
  }

  const manualCmd =
    manualTab === 'docker'
      ? dockerRollbackCommand(rbSelected, {
          edit: t('version.dockerEditCompose'),
          recreate: t('version.dockerRecreate')
        })
      : scriptRollbackCommand(rbSelected)

  if (!isAdmin) {
    return currentVersion ? (
      <span className="px-2 text-xs text-muted-foreground">v{currentVersion}</span>
    ) : null
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={hasUpdate ? t('version.updateAvailable') : t('version.upToDate')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
            hasUpdate
              ? 'bg-warning/15 text-warning hover:bg-warning/25'
              : 'bg-muted text-muted-foreground hover:bg-muted/70',
            collapsed && 'px-1.5'
          )}
        >
          {currentVersion ? (
            <span>v{currentVersion}</span>
          ) : (
            <span className="h-3 w-10 animate-pulse rounded bg-muted-foreground/20" />
          )}
          {hasUpdate ? <span aria-hidden className="size-1.5 rounded-full bg-warning" /> : null}
          {hasUpdate ? <span className="sr-only">{t('version.updateAvailable')}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-medium">{t('version.currentVersion')}</span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={t('version.refresh')}
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden />
          </Button>
        </div>
        <div className="grid gap-3 p-4 text-sm">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-2xl font-semibold">
              {currentVersion ? `v${currentVersion}` : '--'}
              {!hasUpdate && currentVersion ? <Check className="size-5 text-success" aria-hidden /> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {hasUpdate ? `${t('version.latestVersion')}: v${latestVersion}` : t('version.upToDate')}
            </p>
          </div>

          {updateError ? (
            <div role="alert" className="grid gap-2 rounded-md border border-destructive/40 p-3">
              <p className="flex items-center gap-1.5 font-medium text-destructive">
                <X className="size-4" aria-hidden />
                {t('version.updateFailed')}
              </p>
              <p className="text-xs break-words text-muted-foreground">{updateError}</p>
              <Button size="sm" variant="outline" onClick={() => void doUpdate()} disabled={updating}>
                {t('version.retry')}
              </Button>
            </div>
          ) : success?.needRestart ? (
            <div className="grid gap-2 rounded-md border border-success/40 p-3">
              <p className="font-medium">
                {success.kind === 'rollback' ? t('version.rollbackComplete') : t('version.updateComplete')}
              </p>
              <p className="text-xs text-muted-foreground">{t('version.restartRequired')}</p>
              <Button size="sm" loading={restarting} onClick={() => void doRestart()}>
                {restarting
                  ? `${t('version.restarting')}${countdown > 0 ? ` (${countdown}s)` : ''}`
                  : t('version.restartNow')}
              </Button>
            </div>
          ) : hasUpdate && !isRelease ? (
            <div className="grid gap-1 rounded-md border p-3">
              <p className="font-medium">{t('version.updateAvailable')}</p>
              <p className="text-xs text-muted-foreground">{t('version.sourceModeHint')}</p>
              {releaseInfo?.html_url && releaseInfo.html_url !== '#' ? (
                <a
                  className="text-xs text-primary underline"
                  href={releaseInfo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('version.viewRelease')}
                </a>
              ) : null}
            </div>
          ) : hasUpdate ? (
            <div className="grid gap-2 rounded-md border p-3">
              <p className="font-medium">
                {t('version.updateAvailable')} · v{latestVersion}
              </p>
              {releaseInfo?.body ? (
                <p className="line-clamp-3 text-xs text-muted-foreground">{releaseInfo.body}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t('version.noReleaseNotes')}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" loading={updating} onClick={() => void doUpdate()}>
                  <Download aria-hidden />
                  {updating ? t('version.updating') : t('version.updateNow')}
                </Button>
                {releaseInfo?.html_url && releaseInfo.html_url !== '#' ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href={releaseInfo.html_url} target="_blank" rel="noopener noreferrer">
                      {t('version.viewRelease')}
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 border-t pt-3">
            <Button size="sm" variant="ghost" className="justify-start" onClick={() => void toggleRollback()}>
              <RotateCcw aria-hidden />
              {t('version.rollback')}
            </Button>
            {rbOpen ? (
              !isRelease ? (
                <p className="text-xs text-muted-foreground">{t('version.rollbackSourceHint')}</p>
              ) : rbLoading ? (
                <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
              ) : (
                <div className="grid gap-2">
                  <p className="text-xs text-muted-foreground">{t('version.rollbackSelectVersion')}</p>
                  {rbError ? (
                    <p role="alert" className="text-xs text-destructive">
                      {rbError}
                    </p>
                  ) : null}
                  {rbVersions.length === 0 && !rbError ? (
                    <p className="text-xs text-muted-foreground">{t('version.noRollbackVersions')}</p>
                  ) : null}
                  <ul className="grid gap-1">
                    {rbVersions.map((v) => (
                      <li key={v.version}>
                        <button
                          type="button"
                          aria-pressed={rbSelected === v.version}
                          disabled={rbBusy}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs',
                            rbSelected === v.version && 'border-primary bg-primary/5'
                          )}
                          onClick={() => {
                            setRbError('')
                            setRbSelected((s) => (s === v.version ? '' : v.version))
                          }}
                        >
                          <span className="font-mono">v{v.version}</span>
                          <span className="text-muted-foreground">{formatPublishedAt(v.published_at)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {rbSelected ? (
                    <>
                      <p className="text-xs text-warning">{t('version.rollbackWarning')}</p>
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={rbBusy}
                        onClick={() => void doRollback()}
                      >
                        {rbBusy
                          ? t('version.rollingBack')
                          : t('version.rollbackConfirm', { version: `v${rbSelected}` })}
                      </Button>
                      <div className="grid gap-1">
                        <div className="flex items-center justify-between">
                          <div className="flex gap-1">
                            {(['script', 'docker'] as const).map((k) => (
                              <button
                                key={k}
                                type="button"
                                className={cn(
                                  'rounded px-1.5 py-0.5 text-xs',
                                  manualTab === k ? 'bg-muted font-medium' : 'text-muted-foreground'
                                )}
                                onClick={() => setManualTab(k)}
                              >
                                {t(k === 'script' ? 'version.deployScript' : 'version.deployDocker')}
                              </button>
                            ))}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={async () => {
                              if (await copyText(manualCmd)) {
                                setCopied(true)
                                window.setTimeout(() => setCopied(false), 1500)
                              }
                            }}
                          >
                            {copied ? t('version.copied') : t('version.copyCommand')}
                          </Button>
                        </div>
                        <pre className="max-h-28 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] whitespace-pre-wrap">
                          {manualCmd}
                        </pre>
                      </div>
                    </>
                  ) : null}
                </div>
              )
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
