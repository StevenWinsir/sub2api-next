/** 用户管理的各类对话框：创建 / 编辑、余额、允许分组、API 密钥、余额流水、平台配额。 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminAPI } from '@/api/admin'
import type { PlatformQuotaItem, PlatformQuotaWindow } from '@/api/admin/users'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PasswordInput } from '@/components/PasswordInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { money, numOrNull, numOrUndef, str } from '@/features/admin/common/fieldUtils'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import type { StepUpController } from '@/hooks/useStepUp'
import { t } from '@/i18n'
import { useAppStore } from '@/stores/app'
import type { AdminUser } from '@/types'
import { formatDateTime } from '@/utils/format'

type Op = () => void

interface DialogBase {
  onClose: Op
  onSaved: Op
  stepUp: StepUpController
}

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'
  const buf = new Uint32Array(16)
  crypto.getRandomValues(buf)
  return Array.from(buf, (n) => chars[n % chars.length]).join('')
}

/** 创建 / 编辑用户。 */
export function UserFormDialog({ user, onClose, onSaved, stepUp }: DialogBase & { user: AdminUser | null }) {
  const editing = !!user
  const { busy, run } = useAdminAction()
  const [email, setEmail] = React.useState(user?.email ?? '')
  const [username, setUsername] = React.useState(user?.username ?? '')
  const [password, setPassword] = React.useState('')
  const [notes, setNotes] = React.useState(user?.notes ?? '')
  const [role, setRole] = React.useState<'admin' | 'user'>(user?.role ?? 'user')
  const [status, setStatus] = React.useState<'active' | 'disabled'>(user?.status ?? 'active')
  const [balance, setBalance] = React.useState(str(user?.balance ?? 0))
  const [concurrency, setConcurrency] = React.useState(str(user?.concurrency ?? 5))
  const [rpm, setRpm] = React.useState(str(user?.rpm_limit ?? 0))
  const [error, setError] = React.useState('')

  const submit = async () => {
    if (!email.trim()) return setError(t('admin.users.emailRequired'))
    const conc = numOrUndef(concurrency)
    if (conc !== undefined && conc < 0) return setError(t('admin.users.concurrencyNonNegative'))
    setError('')
    const ok = user
      ? await run(
          () =>
            adminAPI.users.update(user.id, {
              email: email.trim(),
              username: username.trim(),
              notes,
              role,
              status,
              concurrency: conc,
              rpm_limit: numOrUndef(rpm),
              ...(password ? { password } : {})
            }),
          { success: t('admin.users.userUpdated'), fallback: t('admin.users.failedToUpdate'), stepUp }
        )
      : await run(
          () =>
            adminAPI.users.create({
              email: email.trim(),
              password,
              username: username.trim() || undefined,
              notes: notes || undefined,
              role,
              balance: numOrUndef(balance),
              concurrency: conc,
              rpm_limit: numOrUndef(rpm)
            }),
          { success: t('admin.users.userCreated'), fallback: t('admin.users.failedToCreate'), stepUp }
        )
    if (ok) onSaved()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={editing ? t('admin.users.editUser') : t('admin.users.createUser')}
      onSubmit={submit}
      submitting={busy}
      submitText={editing ? t('common.update') : t('common.create')}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('admin.users.form.emailLabel')} required error={error}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </FormField>
        <FormField label={t('admin.users.form.usernameLabel')}>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </FormField>
        <FormField
          label={t('admin.users.form.passwordLabel')}
          required={!editing}
          description={editing ? t('admin.users.leaveEmptyToKeep') : undefined}
          className="sm:col-span-2"
        >
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={editing ? t('admin.users.enterNewPassword') : t('admin.users.enterPassword')}
          />
        </FormField>
        <div className="sm:col-span-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPassword(randomPassword())}>
            {t('admin.users.generatePassword')}
          </Button>
        </div>
        <FormField label={t('admin.users.form.roleLabel')}>
          <NativeSelect value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')}>
            <option value="user">{t('admin.users.roles.user')}</option>
            <option value="admin">{t('admin.users.roles.admin')}</option>
          </NativeSelect>
        </FormField>
        {editing ? (
          <FormField label={t('admin.users.form.statusLabel')}>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}>
              <option value="active">{t('common.active')}</option>
              <option value="disabled">{t('admin.users.disabled')}</option>
            </NativeSelect>
          </FormField>
        ) : (
          <FormField label={t('admin.users.form.balanceLabel')}>
            <Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </FormField>
        )}
        <FormField
          label={t('admin.users.form.concurrencyLabel')}
          description={t('admin.users.form.concurrencyHint')}
        >
          <Input type="number" min={0} value={concurrency} onChange={(e) => setConcurrency(e.target.value)} />
        </FormField>
        <FormField label={t('admin.users.form.rpmLimit')} description={t('admin.users.form.rpmLimitHint')}>
          <Input type="number" min={0} value={rpm} onChange={(e) => setRpm(e.target.value)} />
        </FormField>
        <FormField
          label={t('admin.users.form.notesLabel')}
          description={t('admin.users.form.notesHint')}
          className="sm:col-span-2"
        >
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
      </div>
    </AdminFormDialog>
  )
}

/** 余额：充值 / 退款 / 设置为。 */
export function UserBalanceDialog({ user, onClose, onSaved, stepUp }: DialogBase & { user: AdminUser }) {
  const { busy, run } = useAdminAction()
  const [op, setOp] = React.useState<'add' | 'subtract' | 'set'>('add')
  const [amount, setAmount] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const value = numOrUndef(amount)
  const next =
    value === undefined
      ? user.balance
      : op === 'add'
        ? user.balance + value
        : op === 'subtract'
          ? user.balance - value
          : value
  const invalid = value === undefined || value < 0 || (op === 'subtract' && next < 0)

  const submit = async () => {
    if (value === undefined) return
    const ok = await run(() => adminAPI.users.updateBalance(user.id, value, op, notes), {
      success: t('admin.users.balanceAdjustedSuccess'),
      fallback: t('admin.users.failedToAdjust'),
      stepUp
    })
    if (ok) onSaved()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.users.adjustBalance')}
      description={user.email}
      onSubmit={submit}
      submitting={busy}
      submitDisabled={invalid}
    >
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('admin.users.adjustBalance')}>
        {(
          [
            ['add', t('admin.users.deposit')],
            ['subtract', t('admin.users.withdraw')],
            ['set', t('common.update')]
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            role="radio"
            aria-checked={op === key}
            variant={op === key ? 'default' : 'outline'}
            onClick={() => setOp(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <FormField
        label={t('admin.users.adjustmentAmount')}
        error={op === 'subtract' && next < 0 ? t('admin.users.insufficientBalance') : undefined}
      >
        <Input
          type="number"
          step="0.01"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </FormField>
      <FormField label={t('admin.users.notes')} description={t('admin.users.notesOptional')}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>
      <p className="text-sm text-muted-foreground">
        {t('admin.users.currentBalance')}:{' '}
        <span className="tabular font-medium text-foreground">{money(user.balance)}</span>
        {' → '}
        {t('admin.users.newBalance')}:{' '}
        <span className="tabular font-medium text-foreground">{money(next)}</span>
      </p>
    </AdminFormDialog>
  )
}

/** 允许分组 + 限制公开分组 + 专属倍率。 */
export function UserGroupsDialog({ user, onClose, onSaved, stepUp }: DialogBase & { user: AdminUser }) {
  const { busy, run } = useAdminAction()
  const groupsQuery = useQuery({
    queryKey: ['admin', 'groups', 'all'],
    queryFn: () => adminAPI.groups.getAll()
  })
  const [allowed, setAllowed] = React.useState<number[]>(user.allowed_groups ?? [])
  const [restrict, setRestrict] = React.useState(user.restrict_public_groups === true)
  const [rates, setRates] = React.useState<Record<number, string>>(() =>
    Object.fromEntries(Object.entries(user.group_rates ?? {}).map(([k, v]) => [k, String(v)]))
  )
  const groups = groupsQuery.data ?? []
  const exclusive = groups.filter((g) => g.is_exclusive)
  const publicGroups = groups.filter((g) => !g.is_exclusive)

  const toggle = (id: number) =>
    setAllowed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const submit = async () => {
    const group_rates: Record<number, number | null> = {}
    for (const g of groups) {
      const raw = rates[g.id]
      const original = user.group_rates?.[g.id]
      const parsed = raw === undefined || raw === '' ? null : (numOrUndef(raw) ?? null)
      if (parsed !== null) group_rates[g.id] = parsed
      else if (original !== undefined) group_rates[g.id] = null
    }
    const ok = await run(
      () =>
        adminAPI.users.update(user.id, {
          allowed_groups: allowed,
          restrict_public_groups: restrict,
          group_rates
        }),
      {
        success: t('admin.users.groupConfigUpdated'),
        fallback: t('admin.users.failedToUpdateAllowedGroups'),
        stepUp
      }
    )
    if (ok) onSaved()
  }

  const renderGroup = (g: (typeof groups)[number], selectable: boolean) => (
    <li key={g.id} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
      {selectable ? (
        <Checkbox checked={allowed.includes(g.id)} onCheckedChange={() => toggle(g.id)} aria-label={g.name} />
      ) : null}
      <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
      <Badge variant="secondary">{g.platform}</Badge>
      <span className="tabular text-xs text-muted-foreground">
        {t('admin.users.defaultRate')} {g.rate_multiplier}x
      </span>
      <Input
        type="number"
        step="0.01"
        min={0}
        className="h-8 w-24"
        aria-label={`${g.name} ${t('admin.users.customRate')}`}
        placeholder={t('admin.users.customRatePlaceholder')}
        value={rates[g.id] ?? ''}
        onChange={(e) => setRates((prev) => ({ ...prev, [g.id]: e.target.value }))}
      />
    </li>
  )

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.users.groupConfig')}
      description={t('admin.users.groupConfigHint', { email: user.email })}
      onSubmit={submit}
      submitting={busy}
      size="xl"
    >
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('admin.users.exclusiveGroups')}</h3>
        {exclusive.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.users.noStandardGroups')}</p>
        ) : (
          <ul className="grid gap-2">{exclusive.map((g) => renderGroup(g, true))}</ul>
        )}
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              {restrict ? t('admin.users.publicGroupsRestricted') : t('admin.users.publicGroups')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('admin.users.restrictPublicGroupsHint')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={restrict}
              onCheckedChange={setRestrict}
              aria-label={t('admin.users.restrictPublicGroups')}
            />
            {t('admin.users.restrictPublicGroups')}
          </label>
        </div>
        <ul className="grid gap-2">{publicGroups.map((g) => renderGroup(g, restrict))}</ul>
      </section>
    </AdminFormDialog>
  )
}

/** 查看用户 API 密钥。 */
export function UserApiKeysDialog({ user, onClose }: { user: AdminUser; onClose: Op }) {
  const q = useQuery({
    queryKey: ['admin', 'users', user.id, 'api-keys'],
    queryFn: () => adminAPI.users.getUserApiKeys(user.id)
  })
  const items = q.data?.items ?? []
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.users.userApiKeys')}
      description={user.email}
      size="lg"
    >
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('admin.users.noApiKeys')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{k.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {k.key.slice(0, 8)}…{k.key.slice(-4)}
                </p>
              </div>
              <Badge variant="secondary">{k.group?.name ?? t('admin.users.none')}</Badge>
              <Badge variant={k.status === 'active' ? 'success' : 'secondary'}>{k.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </AdminFormDialog>
  )
}

/** 余额流水（兑换码 / 管理员调整记录）。 */
export function UserBalanceHistoryDialog({ user, onClose }: { user: AdminUser; onClose: Op }) {
  const [page, setPage] = React.useState(1)
  const [type, setType] = React.useState('')
  const q = useQuery({
    queryKey: ['admin', 'users', user.id, 'balance-history', page, type],
    queryFn: () => adminAPI.users.getUserBalanceHistory(user.id, page, 10, type || undefined),
    placeholderData: (p) => p
  })
  const items = q.data?.items ?? []
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / 10))
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.users.balanceHistory')}
      description={user.email}
      size="xl"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <NativeSelect
            value={type}
            aria-label={t('admin.users.balanceHistory')}
            onChange={(e) => {
              setType(e.target.value)
              setPage(1)
            }}
          >
            <option value="">{t('common.all')}</option>
            <option value="balance">{t('admin.redeem.types.balance')}</option>
            <option value="admin_balance">{t('admin.redeem.types.admin_balance')}</option>
          </NativeSelect>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('admin.users.totalRecharged')}:{' '}
          <span className="tabular font-medium text-foreground">{money(q.data?.total_recharged)}</span>
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('admin.users.balanceHistory')}</TableHead>
              <TableHead>{t('admin.users.notes')}</TableHead>
              <TableHead>{t('admin.users.columns.created')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{t(`admin.redeem.types.${h.type}`)}</TableCell>
                <TableCell className={h.value >= 0 ? 'tabular text-success' : 'tabular text-destructive'}>
                  {h.value >= 0 ? '+' : ''}
                  {h.value.toFixed(2)}
                </TableCell>
                <TableCell className="max-w-48 truncate">{h.notes || '—'}</TableCell>
                <TableCell>{formatDateTime(h.used_at || h.created_at)}</TableCell>
              </TableRow>
            ))}
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  {t('common.noData')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} pageCount={pages} onPageChange={setPage} />
    </AdminFormDialog>
  )
}

const QUOTA_WINDOWS: PlatformQuotaWindow[] = ['daily', 'weekly', 'monthly']

/** 平台配额（每个平台的日 / 周 / 月额度）。 */
export function UserPlatformQuotaDialog({ user, onClose, onSaved }: DialogBase & { user: AdminUser }) {
  const { busy, run } = useAdminAction()
  const q = useQuery({
    queryKey: ['admin', 'users', user.id, 'platform-quotas'],
    queryFn: () => adminAPI.users.getPlatformQuotas(user.id)
  })
  const [draft, setDraft] = React.useState<Record<string, string>>({})
  const [seeded, setSeeded] = React.useState(false)
  if (q.data && !seeded) {
    setSeeded(true)
    const next: Record<string, string> = {}
    for (const item of q.data.platform_quotas) {
      for (const w of QUOTA_WINDOWS) next[`${item.platform}.${w}`] = str(item[`${w}_limit_usd`])
    }
    setDraft(next)
  }
  const quotas: PlatformQuotaItem[] = q.data?.platform_quotas ?? []

  const submit = async () => {
    const ok = await run(
      () =>
        adminAPI.users.updatePlatformQuotas(
          user.id,
          quotas.map((item) => ({
            platform: item.platform,
            daily_limit_usd: numOrNull(draft[`${item.platform}.daily`] ?? ''),
            weekly_limit_usd: numOrNull(draft[`${item.platform}.weekly`] ?? ''),
            monthly_limit_usd: numOrNull(draft[`${item.platform}.monthly`] ?? '')
          }))
        ),
      { success: t('common.saved') }
    )
    if (ok) onSaved()
  }

  const reset = async (platform: PlatformQuotaItem['platform'], window: PlatformQuotaWindow) => {
    const ok = await run(() => adminAPI.users.resetPlatformQuotaWindow(user.id, platform, window), {
      success: t('common.saved')
    })
    if (ok) void q.refetch()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.users.platformQuota.title')}
      description={user.email}
      onSubmit={submit}
      submitting={busy}
      size="xl"
    >
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.users.platformQuota.columns.platform')}</TableHead>
              {QUOTA_WINDOWS.map((w) => (
                <TableHead key={w}>{t(`admin.users.platformQuota.columns.${w}`)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotas.map((item) => (
              <TableRow key={item.platform}>
                <TableCell className="font-medium">{item.platform}</TableCell>
                {QUOTA_WINDOWS.map((w) => (
                  <TableCell key={w}>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-8 w-24"
                        aria-label={`${item.platform} ${w}`}
                        placeholder={t('admin.users.platformQuota.placeholder')}
                        value={draft[`${item.platform}.${w}`] ?? ''}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, [`${item.platform}.${w}`]: e.target.value }))
                        }
                      />
                      <span className="tabular text-xs text-muted-foreground">
                        {money(item[`${w}_usage_usd`])}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void reset(item.platform, w)}
                      >
                        {t('admin.users.platformQuota.reset.button')}
                      </Button>
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminFormDialog>
  )
}

/** 批量设置限制（并发 / RPM）。 */
export function BulkLimitsDialog({ userIds, onClose, onSaved, stepUp }: DialogBase & { userIds: number[] }) {
  const { busy, run } = useAdminAction()
  const [enableConc, setEnableConc] = React.useState(false)
  const [enableRpm, setEnableRpm] = React.useState(false)
  const [conc, setConc] = React.useState('')
  const [rpm, setRpm] = React.useState('')
  const concVal = numOrUndef(conc)
  const rpmVal = numOrUndef(rpm)
  const invalid =
    (!enableConc && !enableRpm) ||
    (enableConc && (concVal === undefined || concVal < 0 || !Number.isInteger(concVal))) ||
    (enableRpm && (rpmVal === undefined || rpmVal < 0 || !Number.isInteger(rpmVal)))

  const submit = async () => {
    const res = await run(
      () =>
        adminAPI.users.batchUpdateLimits({
          user_ids: userIds,
          ...(enableConc ? { concurrency: concVal } : {}),
          ...(enableRpm ? { rpm_limit: rpmVal } : {})
        }),
      { fallback: t('admin.users.bulkLimits.failed'), stepUp }
    )
    if (res) {
      useAppStore.getState().showSuccess(t('admin.users.bulkLimits.success', { count: res.affected }))
      onSaved()
    }
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.users.bulkLimits.title')}
      description={t('admin.users.bulkLimits.selectedCount', { count: userIds.length })}
      onSubmit={submit}
      submitting={busy}
      submitDisabled={invalid}
      submitText={t('admin.users.bulkLimits.apply')}
    >
      <div className="grid gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={enableConc} onCheckedChange={(v) => setEnableConc(v === true)} />
          {t('admin.users.bulkLimits.enableConcurrency')}
        </label>
        <Input
          type="number"
          min={0}
          disabled={!enableConc}
          value={conc}
          onChange={(e) => setConc(e.target.value)}
          aria-label={t('admin.users.bulkLimits.enableConcurrency')}
        />
      </div>
      <div className="grid gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={enableRpm} onCheckedChange={(v) => setEnableRpm(v === true)} />
          {t('admin.users.bulkLimits.enableRPMLimit')}
        </label>
        <Input
          type="number"
          min={0}
          disabled={!enableRpm}
          value={rpm}
          onChange={(e) => setRpm(e.target.value)}
          aria-label={t('admin.users.bulkLimits.enableRPMLimit')}
          placeholder={t('admin.users.bulkLimits.unlimited')}
        />
      </div>
    </AdminFormDialog>
  )
}
