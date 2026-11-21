/** 分组专属倍率 / 专属 RPM：按用户覆盖分组默认值（两个页签共用一份数据）。 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminAPI } from '@/api/admin'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SearchInput } from '@/components/SearchInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { numOrUndef } from '@/features/admin/common/fieldUtils'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { t } from '@/i18n'
import type { AdminGroup } from '@/types'

export function GroupRatesDialog({
  group,
  mode,
  onClose
}: {
  group: AdminGroup
  mode: 'rate' | 'rpm'
  onClose: () => void
}) {
  const { busy, run } = useAdminAction()
  const q = useQuery({
    queryKey: ['admin', 'groups', group.id, 'rate-multipliers'],
    queryFn: () => adminAPI.groups.getGroupRateMultipliers(group.id)
  })
  const [draft, setDraft] = React.useState<Record<number, string>>({})
  const [added, setAdded] = React.useState<Record<number, { email: string; name: string }>>({})
  const [search, setSearch] = React.useState('')
  const [confirmClear, setConfirmClear] = React.useState(false)
  const field = mode === 'rate' ? 'rate_multiplier' : 'rpm_override'

  const base = (q.data ?? []).filter((e) => e[field] != null)
  const userSearch = useQuery({
    queryKey: ['admin', 'users', 'picker', search],
    queryFn: () => adminAPI.users.list(1, 8, { search }),
    enabled: search.trim().length >= 2
  })

  const rows = [
    ...base.map((e) => ({ id: e.user_id, email: e.user_email, name: e.user_name, value: String(e[field]) })),
    ...Object.entries(added)
      .filter(([id]) => !base.some((e) => e.user_id === Number(id)))
      .map(([id, u]) => ({ id: Number(id), email: u.email, name: u.name, value: '' }))
  ]
  const valueOf = (id: number, fallback: string) => draft[id] ?? fallback
  const dirty = rows.some((r) => valueOf(r.id, r.value) !== r.value)

  const save = async () => {
    const entries = rows
      .filter((r) => valueOf(r.id, r.value) !== r.value && numOrUndef(valueOf(r.id, r.value)) !== undefined)
      .map((r) => ({ user_id: r.id, v: numOrUndef(valueOf(r.id, r.value)) as number }))
    if (entries.length === 0) return
    const ok = await run(
      () =>
        mode === 'rate'
          ? adminAPI.groups.batchSetGroupRateMultipliers(
              group.id,
              entries.map((e) => ({ user_id: e.user_id, rate_multiplier: e.v }))
            )
          : adminAPI.groups.batchSetGroupRPMOverrides(
              group.id,
              entries.map((e) => ({ user_id: e.user_id, rpm_override: Math.trunc(e.v) }))
            ),
      { success: mode === 'rate' ? t('admin.groups.rateSaved') : t('admin.groups.rpmSaved') }
    )
    if (ok) {
      setDraft({})
      setAdded({})
      void q.refetch()
    }
  }

  const clearAll = async () => {
    const ok = await run(
      () =>
        mode === 'rate'
          ? adminAPI.groups.clearGroupRateMultipliers(group.id)
          : adminAPI.groups.clearGroupRPMOverrides(group.id),
      { success: t('admin.groups.rateCleared') }
    )
    setConfirmClear(false)
    if (ok) void q.refetch()
  }

  return (
    <>
      <AdminFormDialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={mode === 'rate' ? t('admin.groups.rateMultipliersTitle') : t('admin.groups.rpmOverridesTitle')}
        description={group.name}
        onSubmit={save}
        submitting={busy}
        submitDisabled={!dirty}
        size="lg"
        footerExtra={
          rows.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmClear(true)}
            >
              {t('admin.groups.clearAll')}
            </Button>
          ) : null
        }
      >
        <div className="space-y-2">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder={t('admin.groups.searchUserPlaceholder')}
          />
          {userSearch.data && search.trim().length >= 2 ? (
            <ul className="max-h-40 divide-y overflow-y-auto rounded-md border text-sm">
              {userSearch.data.items.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-muted"
                    onClick={() => {
                      setAdded((p) => ({ ...p, [u.id]: { email: u.email, name: u.username } }))
                      setSearch('')
                    }}
                  >
                    <span className="truncate">{u.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {mode === 'rate' ? t('admin.groups.addUserRate') : t('admin.groups.addUserRpm')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="max-h-80 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.groups.columns.userEmail')}</TableHead>
                <TableHead>
                  {mode === 'rate'
                    ? t('admin.groups.columns.rateMultiplier')
                    : t('admin.groups.columns.rpmOverride')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="max-w-64 truncate">{r.email}</p>
                    {r.name ? <p className="text-xs text-muted-foreground">{r.name}</p> : null}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step={mode === 'rate' ? '0.01' : '1'}
                      className="h-8 w-28"
                      aria-label={r.email}
                      value={valueOf(r.id, r.value)}
                      onChange={(e) => setDraft((p) => ({ ...p, [r.id]: e.target.value }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                    {mode === 'rate' ? t('admin.groups.noRateMultipliers') : t('admin.groups.noRpmOverrides')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </AdminFormDialog>
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('admin.groups.clearAll')}
        description={t('admin.groups.confirmClearAll')}
        destructive
        loading={busy}
        onConfirm={clearAll}
      />
    </>
  )
}
