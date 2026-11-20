/**
 * /setup 安装向导：数据库 → Redis → 管理员 → 完成。只调用 `/setup/*` 接口（不经过 /api/v1）。
 * 安装完成后后端会重启：轮询 `/setup/status`，needs_setup 变为 false 后跳转登录页。
 */
import * as React from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Database,
  Loader2,
  Server,
  UserCog
} from 'lucide-react'
import { buildGatewayUrl } from '@/api/client'
import { install, testDatabase, testRedis, type InstallRequest } from '@/api/setup'
import { FormField } from '@/components/FormField'
import { SimpleLocaleSwitch, SimpleThemeToggle } from '@/components/layout/SimpleSwitches'
import { NativeSelect } from '@/components/NativeSelect'
import { PasswordInput } from '@/components/PasswordInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { canProceedFromStep, extractSetupError, MIN_ADMIN_PASSWORD_LENGTH } from './setupLogic'

const STEP_ICONS = [Database, Server, UserCog, CheckCircle2]
const MAX_POLL_ATTEMPTS = 60 // 约 60 秒

function currentPort(): number {
  const port = window.location.port
  if (port) return parseInt(port, 10)
  return window.location.protocol === 'https:' ? 443 : 80
}

function createInitialForm(): InstallRequest {
  return {
    database: {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: '',
      dbname: 'sub2api',
      sslmode: 'disable'
    },
    redis: { host: 'localhost', port: 6379, username: '', password: '', db: 0, enable_tls: false },
    admin: { email: '', password: '' },
    // 服务端口沿用浏览器当前端口
    server: { host: '0.0.0.0', port: currentPort(), mode: 'release' }
  }
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function SetupWizardPage() {
  useLocale()
  const [form, setForm] = React.useState<InstallRequest>(createInitialForm)
  const [step, setStep] = React.useState(0)
  const [confirm, setConfirm] = React.useState('')
  const [error, setError] = React.useState('')
  const [testingDb, setTestingDb] = React.useState(false)
  const [testingRedis, setTestingRedis] = React.useState(false)
  const [dbConnected, setDbConnected] = React.useState(false)
  const [redisConnected, setRedisConnected] = React.useState(false)
  const [installing, setInstalling] = React.useState(false)
  const [installSuccess, setInstallSuccess] = React.useState(false)
  const [serviceReady, setServiceReady] = React.useState(false)
  const unmounted = React.useRef(false)
  React.useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
    }
  }, [])

  const steps = [
    { id: 'database', title: t('setup.database.title') },
    { id: 'redis', title: t('setup.redis.title') },
    { id: 'admin', title: t('setup.admin.title') },
    { id: 'complete', title: t('setup.ready.title') }
  ]

  // 修改连接参数后，之前的“连接成功”不再有效，需重新测试
  const patchDb = (patch: Partial<InstallRequest['database']>) => {
    setForm((f) => ({ ...f, database: { ...f.database, ...patch } }))
    setDbConnected(false)
  }
  const patchRedis = (patch: Partial<InstallRequest['redis']>) => {
    setForm((f) => ({ ...f, redis: { ...f.redis, ...patch } }))
    setRedisConnected(false)
  }
  const patchAdmin = (patch: Partial<InstallRequest['admin']>) =>
    setForm((f) => ({ ...f, admin: { ...f.admin, ...patch } }))

  const runTest = async (kind: 'db' | 'redis') => {
    const setTesting = kind === 'db' ? setTestingDb : setTestingRedis
    const setConnected = kind === 'db' ? setDbConnected : setRedisConnected
    setTesting(true)
    setError('')
    setConnected(false)
    try {
      if (kind === 'db') await testDatabase(form.database)
      else await testRedis(form.redis)
      setConnected(true)
    } catch (e) {
      setError(extractSetupError(e, 'Connection failed'))
    } finally {
      setTesting(false)
    }
  }

  const canProceed = canProceedFromStep(step, {
    dbConnected,
    redisConnected,
    adminEmail: form.admin.email,
    adminPassword: form.admin.password,
    confirmPassword: confirm
  })

  const waitForServiceRestart = async () => {
    // 给服务一点重启时间
    await sleep(3000)
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (unmounted.current) return
      try {
        // setup/status 能告诉我们真实模式；重启期间可能 404 / 连接被拒绝
        const response = await fetch(buildGatewayUrl('/setup/status'), { method: 'GET', cache: 'no-store' })
        if (response.ok) {
          const body = await response.json()
          if (body.data && !body.data.needs_setup) {
            setServiceReady(true)
            window.setTimeout(() => {
              // 整页导航：服务已以正常模式重启，需要重新加载后端注入的配置
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = '/login'
            }, 1500)
            return
          }
        }
      } catch {
        /* 服务尚未就绪，继续轮询 */
      }
      await sleep(1000)
    }
    if (!unmounted.current) setError(t('setup.status.timeout'))
  }

  const performInstall = async () => {
    setInstalling(true)
    setError('')
    try {
      await install(form)
      setInstallSuccess(true)
      void waitForServiceRestart()
    } catch (e) {
      setError(extractSetupError(e, 'Installation failed'))
    } finally {
      setInstalling(false)
    }
  }

  const next = () => {
    if (canProceed) {
      setError('')
      setStep((s) => s + 1)
    }
  }

  const passwordMismatch = confirm.length > 0 && form.admin.password !== confirm

  return (
    <div className="space-y-6" data-testid="setup-wizard">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('setup.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('setup.description')}</p>
        </div>
        <div className="flex items-center gap-1">
          <SimpleLocaleSwitch />
          <SimpleThemeToggle />
        </div>
      </div>

      {/* 步骤条 */}
      <ol className="flex items-center" aria-label={t('setup.title')}>
        {steps.map((s, i) => {
          const done = i < step || (i === step && installSuccess)
          const Icon = STEP_ICONS[i]
          return (
            <li
              key={s.id}
              className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}
              aria-current={i === step ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full border text-sm',
                  done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : i === step
                      ? 'border-primary text-primary'
                      : 'text-muted-foreground'
                )}
                title={s.title}
              >
                {done ? <Check className="size-4" aria-hidden /> : <Icon className="size-4" aria-hidden />}
                <span className="sr-only">{s.title}</span>
              </span>
              {i < steps.length - 1 ? (
                <span className={cn('mx-2 h-px flex-1', i < step ? 'bg-primary' : 'bg-border')} />
              ) : null}
            </li>
          )
        })}
      </ol>

      <div className="space-y-5 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        {step === 0 ? (
          <section className="space-y-4" aria-labelledby="setup-db">
            <header>
              <h2 id="setup-db" className="text-lg font-semibold">
                {t('setup.database.title')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('setup.database.description')}</p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('setup.database.host')}>
                <Input
                  value={form.database.host}
                  placeholder="localhost"
                  onChange={(e) => patchDb({ host: e.target.value })}
                />
              </FormField>
              <FormField label={t('setup.database.port')}>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.database.port}
                  onChange={(e) => patchDb({ port: Number(e.target.value) })}
                />
              </FormField>
              <FormField label={t('setup.database.username')}>
                <Input
                  value={form.database.user}
                  autoComplete="off"
                  onChange={(e) => patchDb({ user: e.target.value })}
                />
              </FormField>
              <FormField label={t('setup.database.password')}>
                <PasswordInput
                  value={form.database.password}
                  autoComplete="new-password"
                  placeholder={t('setup.database.passwordPlaceholder')}
                  onChange={(e) => patchDb({ password: e.target.value })}
                />
              </FormField>
              <FormField label={t('setup.database.databaseName')}>
                <Input
                  value={form.database.dbname}
                  autoComplete="off"
                  onChange={(e) => patchDb({ dbname: e.target.value })}
                />
              </FormField>
              <FormField label={t('setup.database.sslMode')}>
                <NativeSelect
                  value={form.database.sslmode}
                  onChange={(e) => patchDb({ sslmode: e.target.value })}
                >
                  <option value="disable">{t('setup.database.ssl.disable')}</option>
                  <option value="require">{t('setup.database.ssl.require')}</option>
                  <option value="verify-ca">{t('setup.database.ssl.verifyCa')}</option>
                  <option value="verify-full">{t('setup.database.ssl.verifyFull')}</option>
                </NativeSelect>
              </FormField>
            </div>
            <TestButton testing={testingDb} connected={dbConnected} onClick={() => runTest('db')} />
          </section>
        ) : null}

        {step === 1 ? (
          <section className="space-y-4" aria-labelledby="setup-redis">
            <header>
              <h2 id="setup-redis" className="text-lg font-semibold">
                {t('setup.redis.title')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('setup.redis.description')}</p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('setup.redis.host')}>
                <Input
                  value={form.redis.host}
                  placeholder="localhost"
                  onChange={(e) => patchRedis({ host: e.target.value })}
                />
              </FormField>
              <FormField label={t('setup.redis.port')}>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.redis.port}
                  onChange={(e) => patchRedis({ port: Number(e.target.value) })}
                />
              </FormField>
              <FormField label={t('setup.redis.username')}>
                <Input
                  value={form.redis.username}
                  autoComplete="off"
                  placeholder={t('setup.redis.usernamePlaceholder')}
                  onChange={(e) => patchRedis({ username: e.target.value })}
                />
              </FormField>
              <FormField label={t('setup.redis.password')}>
                <PasswordInput
                  value={form.redis.password}
                  autoComplete="new-password"
                  placeholder={t('setup.redis.passwordPlaceholder')}
                  onChange={(e) => patchRedis({ password: e.target.value })}
                />
              </FormField>
              <FormField label={t('setup.redis.database')}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.redis.db}
                  onChange={(e) => patchRedis({ db: Number(e.target.value) })}
                />
              </FormField>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium" id="redis-tls-label">
                  {t('setup.redis.enableTls')}
                </p>
                <p className="text-xs text-muted-foreground">{t('setup.redis.enableTlsHint')}</p>
              </div>
              <Switch
                checked={form.redis.enable_tls}
                aria-labelledby="redis-tls-label"
                onCheckedChange={(v) => patchRedis({ enable_tls: v })}
              />
            </div>
            <TestButton testing={testingRedis} connected={redisConnected} onClick={() => runTest('redis')} />
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4" aria-labelledby="setup-admin">
            <header>
              <h2 id="setup-admin" className="text-lg font-semibold">
                {t('setup.admin.title')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('setup.admin.description')}</p>
            </header>
            <FormField label={t('setup.admin.email')}>
              <Input
                type="email"
                autoComplete="off"
                inputMode="email"
                placeholder="admin@example.com"
                value={form.admin.email}
                onChange={(e) => patchAdmin({ email: e.target.value })}
              />
            </FormField>
            <FormField label={t('setup.admin.password')} description={`≥ ${MIN_ADMIN_PASSWORD_LENGTH}`}>
              <PasswordInput
                autoComplete="new-password"
                placeholder={t('setup.admin.passwordPlaceholder')}
                value={form.admin.password}
                onChange={(e) => patchAdmin({ password: e.target.value })}
              />
            </FormField>
            <FormField
              label={t('setup.admin.confirmPassword')}
              error={passwordMismatch ? t('setup.admin.passwordMismatch') : undefined}
            >
              <PasswordInput
                autoComplete="new-password"
                placeholder={t('setup.admin.confirmPasswordPlaceholder')}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </FormField>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-4" aria-labelledby="setup-ready">
            <header>
              <h2 id="setup-ready" className="text-lg font-semibold">
                {t('setup.ready.title')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('setup.ready.description')}</p>
            </header>
            <dl className="divide-y rounded-lg border">
              <SummaryRow
                label={t('setup.ready.database')}
                value={`${form.database.user}@${form.database.host}:${form.database.port}/${form.database.dbname}`}
              />
              <SummaryRow label={t('setup.ready.redis')} value={`${form.redis.host}:${form.redis.port}`} />
              <SummaryRow label={t('setup.ready.adminEmail')} value={form.admin.email} />
            </dl>
          </section>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="break-words">{error}</p>
          </div>
        ) : null}

        {installSuccess ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 p-3 text-sm"
          >
            {serviceReady ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            ) : (
              <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-success" aria-hidden />
            )}
            <div>
              <p className="font-medium">{t('setup.status.completed')}</p>
              <p className="text-muted-foreground">
                {serviceReady ? t('setup.status.redirecting') : t('setup.status.restarting')}
              </p>
            </div>
          </div>
        ) : null}

        {!installSuccess ? (
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0 || installing}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className={cn(step === 0 && 'invisible')}
            >
              <ArrowLeft aria-hidden />
              {t('common.back')}
            </Button>
            {step < steps.length - 1 ? (
              <Button type="button" disabled={!canProceed} onClick={next}>
                {t('common.next')}
                <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button type="button" loading={installing} onClick={performInstall}>
                {installing ? t('setup.status.installing') : t('setup.status.completeInstallation')}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function TestButton({
  testing,
  connected,
  onClick
}: {
  testing: boolean
  connected: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={connected ? 'outline' : 'default'}
      className={cn('w-full', connected && 'border-success/50 text-success')}
      loading={testing}
      onClick={onClick}
    >
      {connected && !testing ? <CheckCircle2 aria-hidden /> : null}
      {testing
        ? t('setup.status.testing')
        : connected
          ? t('setup.status.success')
          : t('setup.status.testConnection')}
    </Button>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-sm">{value}</dd>
    </div>
  )
}
