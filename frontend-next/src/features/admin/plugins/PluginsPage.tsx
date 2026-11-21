/** /admin/plugins：插件管理（上传 / 启停 / 灰度比例 / 测试 / 卸载 / iframe 配置界面桥接）。 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Ban,
  FlaskConical,
  Package,
  Play,
  RefreshCw,
  Settings,
  Trash2,
  Upload
} from 'lucide-react'
import { adminAPI } from '@/api/admin'
import type { PluginInstallation, PluginUISession } from '@/api/admin/plugins'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { TotpStepUpDialog } from '@/features/auth/TotpStepUpDialog'
import { isStepUpBlocked, isStepUpCancelled, stepUpBlockReason, useStepUp } from '@/hooks/useStepUp'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { PluginBridge } from './pluginBridge'

const ROLLOUT_CAPABILITY = 'openai.oauth.outbound_transport.v1'

export const currentRollout = (p: PluginInstallation): number =>
  p.bindings.find((b) => b.capability === ROLLOUT_CAPABILITY)?.rollout_percent || 100
export const hasEnabledBinding = (p: PluginInstallation): boolean => p.bindings.some((b) => b.enabled)

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message?: unknown }).message || t('common.unknownError'))
  }
  return t('common.unknownError')
}

const stateTone = (s: PluginInstallation['state']) =>
  s === 'enabled'
    ? 'success'
    : s === 'error' || s === 'incompatible'
      ? 'error'
      : s === 'starting'
        ? 'warning'
        : 'neutral'
const compatTone = (s: PluginInstallation['compatibility']['status']) =>
  s === 'compatible' ? 'success' : s === 'untested' ? 'warning' : 'error'

function ConfigDialog({
  plugin,
  stepUp,
  onClose
}: {
  plugin: PluginInstallation
  stepUp: ReturnType<typeof useStepUp>
  onClose: () => void
}) {
  const frameRef = React.useRef<HTMLIFrameElement | null>(null)
  const [session, setSession] = React.useState<PluginUISession | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [height, setHeight] = React.useState(640)
  const bridgeRef = React.useRef<PluginBridge | null>(null)
  const stepUpRef = React.useRef(stepUp)
  React.useEffect(() => {
    stepUpRef.current = stepUp
  })

  React.useEffect(() => {
    let alive = true
    adminAPI.plugins
      .createUISession(plugin.id)
      .then((s) => alive && setSession(s))
      .catch((e) => {
        if (!alive) return
        setLoading(false)
        setError(errorMessage(e))
      })
    return () => {
      alive = false
    }
  }, [plugin.id])

  React.useEffect(() => {
    if (!session) return
    const app = useAppStore.getState()
    const bridge = new PluginBridge({
      pluginId: plugin.id,
      bridgeToken: session.bridge_token,
      getFrameWindow: () => frameRef.current?.contentWindow ?? null,
      api: adminAPI.plugins,
      stepUp: (fn) => stepUpRef.current.run(fn),
      isStepUpBlocked,
      isStepUpCancelled,
      reportSensitiveError: (e) =>
        app.showError(
          stepUpBlockReason(e) === 'STEP_UP_ADMIN_API_KEY_FORBIDDEN'
            ? t('stepUp.adminApiKeyForbidden')
            : t('stepUp.notEnabled')
        ),
      errorMessage,
      notify: (level, text) =>
        level === 'error'
          ? app.showError(text)
          : level === 'success'
            ? app.showSuccess(text)
            : app.showInfo(text),
      texts: {
        bridgeRejected: t('admin.plugins.bridgeRejected'),
        cancel: t('common.cancel'),
        saved: t('common.saved'),
        failed: t('common.error')
      },
      onReady: () => setLoading(false),
      onResize: setHeight
    })
    bridgeRef.current = bridge
    const listener = (e: MessageEvent) => void bridge.handle(e)
    window.addEventListener('message', listener)
    return () => {
      window.removeEventListener('message', listener)
      bridge.dispose()
      bridgeRef.current = null
    }
  }, [session, plugin.id])

  const title = t('admin.plugins.configTitle', { name: plugin.name })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        <div className="relative min-h-[520px] overflow-hidden rounded-md bg-muted/40" style={{ height }}>
          {loading && !error ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
              {t('admin.plugins.loadingUI')}
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-8 text-center">
              <AlertTriangle className="size-8 text-warning" aria-hidden />
              <p className="mt-3 font-medium">{t('admin.plugins.uiUnavailable')}</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{error}</p>
            </div>
          ) : null}
          {session ? (
            <iframe
              ref={frameRef}
              src={session.url}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              title={title}
              className="h-full w-full border-0 bg-background"
              onLoad={() => {
                bridgeRef.current?.onFrameLoad()
                setLoading(false)
              }}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function PluginsPage() {
  useLocale()
  const stepUp = useStepUp()
  const app = useAppStore
  const listQ = useQuery({ queryKey: ['admin', 'plugins'], queryFn: () => adminAPI.plugins.list() })
  const plugins = React.useMemo(() => listQ.data ?? [], [listQ.data])
  const loading = listQ.isFetching
  const [uploading, setUploading] = React.useState(false)
  const [busyId, setBusyId] = React.useState<number | null>(null)
  const [rolloutOv, setRolloutOv] = React.useState<Record<number, number>>({})
  const rollout = React.useMemo(
    () => ({
      ...(Object.fromEntries(plugins.map((p) => [p.id, currentRollout(p)])) as Record<number, number>),
      ...rolloutOv
    }),
    [plugins, rolloutOv]
  )
  const setRollout = (fn: (r: Record<number, number>) => Record<number, number>) =>
    setRolloutOv((o) => fn({ ...rollout, ...o }))
  const [config, setConfig] = React.useState<PluginInstallation | null>(null)
  const [confirm, setConfirm] = React.useState<{
    kind: 'untested' | 'disable' | 'uninstall'
    plugin: PluginInstallation
  } | null>(null)
  const fileRef = React.useRef<HTMLInputElement | null>(null)

  const load = React.useCallback(async () => {
    setRolloutOv({})
    await listQ.refetch()
  }, [listQ])
  React.useEffect(() => {
    if (listQ.error) app.getState().showError(errorMessage(listQ.error))
  }, [listQ.error, app])

  const reportSensitive = (e: unknown) => {
    if (isStepUpCancelled(e)) return
    if (isStepUpBlocked(e)) {
      app
        .getState()
        .showError(
          stepUpBlockReason(e) === 'STEP_UP_ADMIN_API_KEY_FORBIDDEN'
            ? t('stepUp.adminApiKeyForbidden')
            : t('stepUp.notEnabled')
        )
      return
    }
    app.getState().showError(errorMessage(e))
  }

  const act = async (p: PluginInstallation, fn: () => Promise<unknown>, success?: string) => {
    setBusyId(p.id)
    try {
      await stepUp.run(fn)
      if (success) app.getState().showSuccess(success)
      await load()
    } catch (e) {
      reportSensitive(e)
    } finally {
      setBusyId(null)
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.name.toLowerCase().endsWith('.s2plugin')) {
      app.getState().showError(t('admin.plugins.fileRequired'))
      return
    }
    setUploading(true)
    try {
      await stepUp.run(() => adminAPI.plugins.upload(file))
      app.getState().showSuccess(t('admin.plugins.uploadSuccess'))
      await load()
    } catch (err) {
      reportSensitive(err)
    } finally {
      setUploading(false)
    }
  }

  const enable = (p: PluginInstallation, acceptUntested: boolean) =>
    act(
      p,
      () => adminAPI.plugins.enable(p.id, rollout[p.id] || 100, acceptUntested),
      t('admin.plugins.enableSuccess')
    )

  const test = async (p: PluginInstallation) => {
    setBusyId(p.id)
    try {
      const r = await stepUp.run(() => adminAPI.plugins.test(p.id))
      if (r.success) app.getState().showSuccess(r.message || t('admin.plugins.testSuccess'))
      else app.getState().showError(r.message || t('common.error'))
    } catch (e) {
      reportSensitive(e)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('admin.plugins.title')}
        description={t('admin.plugins.description')}
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".s2plugin"
              className="hidden"
              onChange={(e) => void onFile(e)}
            />
            <Button
              variant="outline"
              aria-label={t('common.refresh')}
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <Button loading={uploading} onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden />
              {uploading ? t('common.processing') : t('admin.plugins.upload')}
            </Button>
          </>
        }
      />
      <p className="mb-3 text-xs text-muted-foreground">{t('admin.plugins.uploadHint')}</p>
      <div className="mb-4 rounded-md border border-info/30 bg-info/10 px-4 py-3 text-sm">
        <p>{t('admin.plugins.runtimeNotice')}</p>
        <p className="mt-1">{t('admin.plugins.menuNotice')}</p>
      </div>

      {loading && plugins.length === 0 ? (
        <Skeleton className="h-48" />
      ) : plugins.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t('admin.plugins.empty')}
          description={t('admin.plugins.emptyHint')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {plugins.map((p) => {
            const enabled = hasEnabledBinding(p)
            const busy = busyId === p.id
            return (
              <Card key={p.id} className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold">{p.name}</h3>
                      <span className="font-mono text-xs text-muted-foreground">v{p.version}</span>
                      <StatusBadge status={stateTone(p.state)}>{t(`admin.plugins.${p.state}`)}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.plugin_key}
                      {p.author ? ` · ${p.author}` : ''}
                    </p>
                    {p.description ? (
                      <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
                    ) : null}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setConfig(p)}>
                    <Settings aria-hidden />
                    {t('admin.plugins.configure')}
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      {t('admin.plugins.compatibility')}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusBadge status={compatTone(p.compatibility.status)}>
                        {t(`admin.plugins.${p.compatibility.status}`)}
                      </StatusBadge>
                      <span className="text-xs text-muted-foreground">{p.compatibility.message}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">{t('admin.plugins.currentVersion')}</dt>
                      <dd className="font-mono">{p.compatibility.current_sub2api_version}</dd>
                      <dt className="text-muted-foreground">{t('admin.plugins.requiredVersion')}</dt>
                      <dd className="font-mono">{p.compatibility.required_sub2api_version}</dd>
                      <dt className="text-muted-foreground">{t('admin.plugins.recommendedVersion')}</dt>
                      <dd className="font-mono">{p.compatibility.recommended_sub2api_version || '-'}</dd>
                    </dl>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      {t('admin.plugins.runtime')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <StatusBadge status={p.runtime_healthy ? 'success' : 'neutral'}>
                        {p.runtime_healthy ? t('admin.plugins.healthy') : t('admin.plugins.unhealthy')}
                      </StatusBadge>
                      <Badge variant="secondary">
                        {t('admin.plugins.signature')}: {t(`admin.plugins.${p.signature_status}`)}
                      </Badge>
                    </div>
                    {p.last_error ? (
                      <p className="mt-3 text-xs break-words text-destructive">{p.last_error}</p>
                    ) : p.runtime_message ? (
                      <p className="mt-3 text-xs break-words text-muted-foreground">{p.runtime_message}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-2">
                    <label className="flex items-center justify-between gap-4 text-xs font-medium">
                      <span>{t('admin.plugins.rollout')}</span>
                      <span className="w-11 text-right font-mono">{rollout[p.id] ?? currentRollout(p)}%</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      step={1}
                      aria-label={t('admin.plugins.rollout')}
                      className="mt-2 w-full accent-primary"
                      value={rollout[p.id] ?? currentRollout(p)}
                      disabled={enabled}
                      onChange={(e) =>
                        setRollout((r) => ({
                          ...r,
                          [p.id]: Math.min(100, Math.max(1, Number(e.target.value)))
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void test(p)}>
                    <FlaskConical aria-hidden />
                    {t('admin.plugins.test')}
                  </Button>
                  {enabled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirm({ kind: 'disable', plugin: p })}
                    >
                      <Ban aria-hidden />
                      {t('admin.plugins.disable')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy || p.state === 'starting' || !p.compatibility.compatible}
                      onClick={() =>
                        p.compatibility.tested
                          ? void enable(p, false)
                          : setConfirm({ kind: 'untested', plugin: p })
                      }
                    >
                      <Play aria-hidden />
                      {t('admin.plugins.enable')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy || enabled}
                    onClick={() => setConfirm({ kind: 'uninstall', plugin: p })}
                  >
                    <Trash2 aria-hidden />
                    {t('admin.plugins.uninstall')}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {config ? <ConfigDialog plugin={config} stepUp={stepUp} onClose={() => setConfig(null)} /> : null}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.kind === 'untested'
            ? t('admin.plugins.enable')
            : confirm?.kind === 'disable'
              ? t('admin.plugins.disable')
              : t('admin.plugins.uninstall')
        }
        description={
          confirm?.kind === 'untested'
            ? t('admin.plugins.confirmUntested')
            : confirm?.kind === 'disable'
              ? t('admin.plugins.confirmDisable')
              : t('admin.plugins.confirmUninstall')
        }
        destructive={confirm?.kind !== 'untested'}
        onConfirm={() => {
          const c = confirm
          setConfirm(null)
          if (!c) return
          if (c.kind === 'untested') void enable(c.plugin, true)
          else if (c.kind === 'disable')
            void act(c.plugin, () => adminAPI.plugins.disable(c.plugin.id), t('admin.plugins.disableSuccess'))
          else
            void act(
              c.plugin,
              () => adminAPI.plugins.remove(c.plugin.id),
              t('admin.plugins.uninstallSuccess')
            )
        }}
      />
      <TotpStepUpDialog controller={stepUp} />
    </div>
  )
}
