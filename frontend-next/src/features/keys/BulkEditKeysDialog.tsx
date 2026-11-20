/** 批量编辑密钥：勾选需要修改的字段，逐个复用单个更新的校验与权限（最多 5 并发）。 */
import * as React from 'react'
import { keysAPI } from '@/api/keys'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/NativeSelect'
import { t } from '@/i18n'
import { useAppStore } from '@/stores/app'
import type { ApiKey, Group, UpdateApiKeyRequest } from '@/types'

type LimitField = 'quota' | 'rate_limit_5h' | 'rate_limit_1d' | 'rate_limit_7d'
type IPField = 'ip_whitelist' | 'ip_blacklist'
type EditableField = LimitField | IPField | 'group_id' | 'status' | 'expires_at'

const LIMITS: { key: LimitField; label: string }[] = [
  { key: 'quota', label: 'keys.quotaAmount' },
  { key: 'rate_limit_5h', label: 'keys.rateLimit5h' },
  { key: 'rate_limit_1d', label: 'keys.rateLimit1d' },
  { key: 'rate_limit_7d', label: 'keys.rateLimit7d' }
]
const IPS: { key: IPField; label: string }[] = [
  { key: 'ip_whitelist', label: 'keys.ipWhitelist' },
  { key: 'ip_blacklist', label: 'keys.ipBlacklist' }
]

const emptyEnabled = (): Record<EditableField, boolean> => ({
  group_id: false,
  status: false,
  quota: false,
  rate_limit_5h: false,
  rate_limit_1d: false,
  rate_limit_7d: false,
  expires_at: false,
  ip_whitelist: false,
  ip_blacklist: false
})

type SelectedKey = Pick<ApiKey, 'id' | 'name'>

function Body({
  selectedKeys,
  groups,
  onClose,
  onUpdated
}: {
  selectedKeys: SelectedKey[]
  groups: Group[]
  onClose: () => void
  onUpdated: (succeededIds: number[]) => void
}) {
  const showSuccess = useAppStore((s) => s.showSuccess)
  const showWarning = useAppStore((s) => s.showWarning)
  const [pending, setPending] = React.useState<SelectedKey[]>(() =>
    selectedKeys.map(({ id, name }) => ({ id, name }))
  )
  const [failures, setFailures] = React.useState<{ id: number; name: string; message: string }[]>([])
  const [enabled, setEnabled] = React.useState(emptyEnabled)
  const [groupId, setGroupId] = React.useState<number | null>(null)
  const [status, setStatus] = React.useState<'active' | 'inactive'>('active')
  const [limits, setLimits] = React.useState<Record<LimitField, string>>({
    quota: '',
    rate_limit_5h: '',
    rate_limit_1d: '',
    rate_limit_7d: ''
  })
  const [ips, setIps] = React.useState<Record<IPField, string>>({ ip_whitelist: '', ip_blacklist: '' })
  const [never, setNever] = React.useState(false)
  const [expiration, setExpiration] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  const toggle = (k: EditableField, v: boolean) => setEnabled((e) => ({ ...e, [k]: v }))

  let validation = ''
  if (enabled.group_id && !groups.some((g) => g.id === groupId)) validation = t('keys.groupRequired')
  for (const { key } of LIMITS) {
    if (!enabled[key] || validation) continue
    const v = limits[key].trim()
    if (!v || !Number.isFinite(Number(v)) || Number(v) < 0) validation = t('keys.bulkEdit.invalidLimit')
  }
  if (!validation && enabled.expires_at && !never && !Number.isFinite(Date.parse(expiration))) {
    validation = t('keys.bulkEdit.invalidExpiration')
  }
  const canSubmit = pending.length > 0 && Object.values(enabled).some(Boolean) && !validation && !submitting

  const submit = async () => {
    if (!canSubmit) return
    const updates: UpdateApiKeyRequest = {}
    if (enabled.group_id) updates.group_id = groupId
    if (enabled.status) updates.status = status
    for (const { key } of LIMITS) if (enabled[key]) updates[key] = Number(limits[key])
    for (const { key } of IPS) {
      if (enabled[key])
        updates[key] = ips[key]
          .split('\n')
          .map((ip) => ip.trim())
          .filter(Boolean)
    }
    if (enabled.expires_at) updates.expires_at = never ? '' : new Date(expiration).toISOString()

    setSubmitting(true)
    try {
      const result = await keysAPI.bulkUpdate(
        pending.map((k) => k.id),
        updates
      )
      const names = new Map(pending.map((k) => [k.id, k.name]))
      const failed = result.failures.map((f) => ({
        id: f.id,
        name: names.get(f.id) ?? String(f.id),
        message: ((f.error as { message?: unknown })?.message as string) || t('keys.failedToSave')
      }))
      if (result.succeededIds.length > 0) onUpdated(result.succeededIds)
      if (failed.length === 0) {
        showSuccess(t('keys.bulkEdit.success', { count: result.succeededIds.length }))
        onClose()
        return
      }
      // 只重试失败的密钥
      setPending((p) => p.filter((k) => failed.some((f) => f.id === k.id)))
      setFailures(failed)
      showWarning(
        t('keys.bulkEdit.partialFailure', { success: result.succeededIds.length, failed: failed.length })
      )
    } finally {
      setSubmitting(false)
    }
  }

  // 注意：用渲染函数而非内部组件，避免每次渲染重新挂载导致输入框失焦
  const row = (field: EditableField, label: string, children: React.ReactNode) => (
    <div key={field} className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`bulk-${field}`}
          checked={enabled[field]}
          onCheckedChange={(v) => toggle(field, v === true)}
        />
        <Label htmlFor={`bulk-${field}`}>{label}</Label>
      </div>
      {enabled[field] ? children : null}
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('keys.bulkEdit.hint')}</p>
      <p className="text-xs text-muted-foreground">
        {t('keys.bulkEdit.selectedCount', { count: pending.length })}
      </p>

      {row(
        'group_id',
        t('keys.groupLabel'),
        <>
          <NativeSelect
            value={groupId ?? ''}
            onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t('keys.selectGroup')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </>
      )}
      {row(
        'status',
        t('keys.statusLabel'),
        <>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}>
            <option value="active">{t('keys.enable')}</option>
            <option value="inactive">{t('keys.disable')}</option>
          </NativeSelect>
        </>
      )}
      {LIMITS.map(({ key, label }) =>
        row(
          key,
          t(label),
          <>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={limits[key]}
              onChange={(e) => setLimits((l) => ({ ...l, [key]: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{t('keys.bulkEdit.limitHint')}</p>
          </>
        )
      )}
      {row(
        'expires_at',
        t('keys.expiration'),
        <>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={never} onCheckedChange={(v) => setNever(v === true)} />
            {t('keys.noExpiration')}
          </label>
          {!never ? (
            <Input type="datetime-local" value={expiration} onChange={(e) => setExpiration(e.target.value)} />
          ) : null}
        </>
      )}
      {IPS.map(({ key, label }) =>
        row(
          key,
          t(label),
          <>
            <Textarea
              rows={3}
              className="font-mono"
              value={ips[key]}
              onChange={(e) => setIps((v) => ({ ...v, [key]: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{t('keys.bulkEdit.ipHint')}</p>
          </>
        )
      )}

      {validation ? (
        <p role="alert" className="text-sm text-destructive">
          {validation}
        </p>
      ) : null}
      {failures.length > 0 ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">{t('keys.bulkEdit.failureHint')}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {failures.map((f) => (
              <li key={f.id}>
                {f.name}: {f.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          {t('common.cancel')}
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={!canSubmit} loading={submitting}>
          {t('keys.bulkEdit.apply', { count: pending.length })}
        </Button>
      </DialogFooter>
    </div>
  )
}

export function BulkEditKeysDialog({
  open,
  onOpenChange,
  selectedKeys,
  groups,
  onUpdated
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedKeys: SelectedKey[]
  groups: Group[]
  onUpdated: (succeededIds: number[]) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('keys.bulkEdit.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('keys.bulkEdit.hint')}</DialogDescription>
        </DialogHeader>
        {open ? (
          <Body
            selectedKeys={selectedKeys}
            groups={groups}
            onClose={() => onOpenChange(false)}
            onUpdated={onUpdated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
