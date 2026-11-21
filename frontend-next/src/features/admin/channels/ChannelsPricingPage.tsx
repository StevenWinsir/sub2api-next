/** /admin/channels/pricing：渠道定价（渠道列表 / 关联分组 / 逐模型定价 / 模型映射）。区间、时间段与账号统计规则在编辑时原样保留。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { adminAPI } from '@/api/admin'
import type { Channel } from '@/api/admin/channels'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/DataTable'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { PageHeader } from '@/components/PageHeader'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CONCRETE_PLATFORM_OPTIONS } from '@/constants/platforms'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { notifyError } from '@/features/admin/common/notify'
import { RowActions } from '@/features/admin/common/RowActions'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { formatDateTime } from '@/utils/format'
import {
  draftToPricing,
  emptyDraft,
  pricingToDraft,
  validateDrafts,
  type PricingDraft
} from './channelPricingModel'

const BILLING_MODES = ['token', 'per_request', 'image', 'video'] as const
const MODE_LABEL: Record<(typeof BILLING_MODES)[number], string> = {
  token: 'token',
  per_request: 'perRequest',
  image: 'image',
  video: 'video'
}
const SOURCES = ['requested', 'upstream', 'channel_mapped', 'response_model'] as const
const SOURCE_LABEL: Record<(typeof SOURCES)[number], string> = {
  requested: 'billingModelSourceRequested',
  upstream: 'billingModelSourceUpstream',
  channel_mapped: 'billingModelSourceChannelMapped',
  response_model: 'billingModelSourceResponse'
}

function PricingEntryEditor({
  draft,
  onChange,
  onRemove
}: {
  draft: PricingDraft
  onChange: (d: PricingDraft) => void
  onRemove: () => void
}) {
  const set = <K extends keyof PricingDraft>(k: K, v: PricingDraft[K]) => onChange({ ...draft, [k]: v })
  const priceField = (
    label: string,
    key: 'input' | 'output' | 'cacheWrite' | 'cacheRead' | 'imageInput' | 'imageOutput'
  ) => (
    <FormField label={label}>
      <Input
        type="number"
        min={0}
        step="any"
        value={draft[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={t('admin.channels.form.pricePlaceholder')}
      />
    </FormField>
  )
  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={t('admin.accounts.columns.platform')}>
          <NativeSelect value={draft.platform} onChange={(e) => set('platform', e.target.value)}>
            {CONCRETE_PLATFORM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('admin.channels.form.billingMode')}>
          <NativeSelect
            value={draft.billingMode}
            onChange={(e) => set('billingMode', e.target.value as PricingDraft['billingMode'])}
          >
            {BILLING_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`admin.channels.billingMode.${MODE_LABEL[m]}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <div className="flex items-end justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 aria-hidden />
            {t('common.remove')}
          </Button>
        </div>
      </div>
      <FormField
        label={t('admin.channels.form.models')}
        description={t('admin.channels.form.modelInputHint')}
      >
        <Textarea
          rows={2}
          className="font-mono"
          value={draft.modelsText}
          onChange={(e) => set('modelsText', e.target.value)}
          placeholder={t('admin.channels.form.modelsPlaceholder')}
        />
      </FormField>
      {draft.billingMode === 'token' ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {priceField(t('admin.channels.form.inputPrice'), 'input')}
          {priceField(t('admin.channels.form.outputPrice'), 'output')}
          {priceField(t('admin.channels.form.cacheWritePrice'), 'cacheWrite')}
          {priceField(t('admin.channels.form.cacheReadPrice'), 'cacheRead')}
          {priceField(t('admin.channels.form.imageInputPrice'), 'imageInput')}
          {priceField(t('admin.channels.form.imageOutputPrice'), 'imageOutput')}
        </div>
      ) : (
        <FormField label={t('admin.channels.form.perRequestPrice')}>
          <Input
            type="number"
            min={0}
            step="any"
            value={draft.perRequest}
            onChange={(e) => set('perRequest', e.target.value)}
          />
        </FormField>
      )}
      {(draft.base?.intervals?.length ?? 0) > 0 || draft.base?.time_pricing ? (
        <p className="text-xs text-muted-foreground">
          {draft.base?.intervals?.length ?? 0} {t('admin.channels.form.intervals')}
          {draft.base?.time_pricing ? ` · ${t('admin.channels.form.timePricing')}` : ''}
        </p>
      ) : null}
    </fieldset>
  )
}

function ChannelFormDialog({
  channel,
  onClose,
  onSaved
}: {
  channel: Channel | null
  onClose: () => void
  onSaved: () => void
}) {
  const { busy, run } = useAdminAction()
  const groups = useQuery({
    queryKey: ['admin', 'groups', 'all-including-inactive'],
    queryFn: () => adminAPI.groups.getAllIncludingInactive()
  })
  const allChannels = useQuery({
    queryKey: ['admin', 'channels', 'all'],
    queryFn: () => adminAPI.channels.list(1, 1000)
  })
  const [name, setName] = React.useState(channel?.name ?? '')
  const [description, setDescription] = React.useState(channel?.description ?? '')
  const [status, setStatus] = React.useState(channel?.status ?? 'active')
  const [groupIds, setGroupIds] = React.useState<number[]>(channel?.group_ids ?? [])
  const [drafts, setDrafts] = React.useState<PricingDraft[]>(() =>
    (channel?.model_pricing ?? []).map(pricingToDraft)
  )
  const [source, setSource] = React.useState<string>(channel?.billing_model_source ?? 'requested')
  const [restrict, setRestrict] = React.useState(channel?.restrict_models ?? false)
  const [mappingJson, setMappingJson] = React.useState(JSON.stringify(channel?.model_mapping ?? {}, null, 2))
  const [error, setError] = React.useState('')

  const takenBy = new Map<number, string>()
  for (const c of allChannels.data?.items ?? [])
    if (c.id !== channel?.id) for (const gid of c.group_ids) takenBy.set(gid, c.name)

  const submit = async () => {
    if (!name.trim()) return setError(t('admin.channels.nameRequired'))
    const invalid = validateDrafts(drafts)
    if (invalid) {
      notifyError(new Error(t(invalid.key, invalid.params)))
      return
    }
    let mapping: Record<string, Record<string, string>>
    try {
      const parsed: unknown = JSON.parse(mappingJson || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
      mapping = parsed as Record<string, Record<string, string>>
    } catch {
      notifyError(new Error(t('adminUi.channels.mappingInvalid')))
      return
    }
    setError('')
    const payload = {
      name: name.trim(),
      description: description.trim(),
      group_ids: groupIds,
      model_pricing: drafts.map(draftToPricing),
      model_mapping: mapping,
      billing_model_source: source,
      restrict_models: restrict
    }
    const ok = channel
      ? await run(() => adminAPI.channels.update(channel.id, { ...payload, status }), {
          success: t('admin.channels.updateSuccess'),
          fallback: t('admin.channels.updateError')
        })
      : await run(() => adminAPI.channels.create(payload), {
          success: t('admin.channels.createSuccess'),
          fallback: t('admin.channels.createError')
        })
    if (ok) onSaved()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={channel ? t('admin.channels.editChannel') : t('admin.channels.createChannel')}
      onSubmit={submit}
      submitting={busy}
      size="xl"
    >
      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">{t('adminUi.groups.tabBasic')}</TabsTrigger>
          <TabsTrigger value="pricing">{t('admin.channels.form.modelPricing')}</TabsTrigger>
          <TabsTrigger value="mapping">{t('admin.channels.form.modelMapping')}</TabsTrigger>
        </TabsList>
        <TabsContent value="basic" className="grid gap-4 pt-4 sm:grid-cols-2">
          <FormField label={t('admin.channels.form.name')} required error={error}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('admin.channels.form.namePlaceholder')}
            />
          </FormField>
          {channel ? (
            <FormField label={t('admin.channels.form.status')}>
              <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as Channel['status'])}>
                <option value="active">{t('admin.channels.statusActive')}</option>
                <option value="disabled">{t('admin.channels.statusDisabled')}</option>
              </NativeSelect>
            </FormField>
          ) : (
            <span />
          )}
          <FormField label={t('admin.channels.form.description')} className="sm:col-span-2">
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('admin.channels.form.descriptionPlaceholder')}
            />
          </FormField>
          <FormField
            label={t('admin.channels.form.billingModelSource')}
            description={t('admin.channels.form.billingModelSourceHint')}
          >
            <NativeSelect value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.channels.form.${SOURCE_LABEL[s]}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Switch checked={restrict} onCheckedChange={setRestrict} />
            {t('admin.channels.form.restrictModels')}
          </label>
          <FormField
            label={t('admin.channels.form.groups')}
            className="sm:col-span-2"
            description={t('admin.channels.form.selectedCount', { count: groupIds.length })}
          >
            {(groups.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('admin.channels.form.noGroupsAvailable')}</p>
            ) : (
              <div className="grid max-h-44 gap-1.5 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                {(groups.data ?? []).map((g) => {
                  const other = takenBy.get(g.id)
                  return (
                    <label key={g.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={groupIds.includes(g.id)}
                        onCheckedChange={(v) =>
                          setGroupIds((p) => (v === true ? [...p, g.id] : p.filter((x) => x !== g.id)))
                        }
                      />
                      <span className="truncate">{g.name}</span>
                      <Badge variant="secondary">{g.platform}</Badge>
                      {other ? (
                        <span className="truncate text-xs text-warning">
                          {t('admin.channels.form.inOtherChannel', { name: other })}
                        </span>
                      ) : null}
                    </label>
                  )
                })}
              </div>
            )}
          </FormField>
        </TabsContent>
        <TabsContent value="pricing" className="space-y-3 pt-4">
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('admin.channels.form.noPricingRules')}</p>
          ) : null}
          {drafts.map((d, i) => (
            <PricingEntryEditor
              key={i}
              draft={d}
              onChange={(next) => setDrafts((p) => p.map((x, j) => (j === i ? next : x)))}
              onRemove={() => setDrafts((p) => p.filter((_, j) => j !== i))}
            />
          ))}
          <Button type="button" variant="outline" onClick={() => setDrafts((p) => [...p, emptyDraft()])}>
            <Plus aria-hidden />
            {t('admin.channels.form.modelPricing')}
          </Button>
        </TabsContent>
        <TabsContent value="mapping" className="pt-4">
          <FormField
            label={t('admin.channels.form.modelMapping')}
            description={t('admin.channels.form.modelMappingHint')}
          >
            <Textarea
              rows={10}
              className="font-mono"
              value={mappingJson}
              onChange={(e) => setMappingJson(e.target.value)}
              spellCheck={false}
            />
          </FormField>
        </TabsContent>
      </Tabs>
    </AdminFormDialog>
  )
}

type Dlg = { kind: 'form'; channel: Channel | null } | { kind: 'delete'; channel: Channel } | null

export function ChannelsPricingPage() {
  const locale = useLocale()
  const qc = useQueryClient()
  const { busy, run } = useAdminAction()
  const table = useTableState()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [dlg, setDlg] = React.useState<Dlg>(null)
  const filters = React.useMemo(
    () => ({ status: status || undefined, search: search || undefined }),
    [status, search]
  )
  const query = useQuery({
    queryKey: ['admin', 'channels', 'list', table.page, table.pageSize, filters],
    queryFn: ({ signal }) => adminAPI.channels.list(table.page, table.pageSize, filters, { signal }),
    placeholderData: (p) => p
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'channels'] })

  const cols = React.useMemo<ColumnDef<Channel, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('admin.channels.columns.name'),
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>
      },
      {
        id: 'description',
        header: t('admin.channels.columns.description'),
        cell: ({ row }) => (
          <span className="block max-w-64 truncate text-muted-foreground">
            {row.original.description || '—'}
          </span>
        )
      },
      {
        id: 'status',
        header: t('admin.channels.columns.status'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.status === 'active' ? 'success' : 'neutral'}>
            {row.original.status === 'active'
              ? t('admin.channels.statusActive')
              : t('admin.channels.statusDisabled')}
          </StatusBadge>
        )
      },
      {
        id: 'groups',
        header: t('admin.channels.columns.groups'),
        cell: ({ row }) => `${row.original.group_ids.length} ${t('admin.channels.groupsUnit')}`
      },
      {
        id: 'pricing',
        header: t('admin.channels.columns.pricing'),
        cell: ({ row }) => `${row.original.model_pricing.length} ${t('admin.channels.pricingUnit')}`
      },
      {
        id: 'created',
        header: t('admin.channels.columns.createdAt'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.created_at)}</span>
        )
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('admin.channels.columns.actions')}</span>,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                key: 'edit',
                label: t('common.edit'),
                onSelect: () => setDlg({ kind: 'form', channel: row.original })
              },
              {
                key: 'delete',
                separator: true,
                label: t('common.delete'),
                destructive: true,
                onSelect: () => setDlg({ kind: 'delete', channel: row.original })
              }
            ]}
          />
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只依赖语言
    [locale]
  )

  return (
    <div>
      <PageHeader
        title={t('admin.channels.title')}
        description={t('admin.channels.description')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <Button onClick={() => setDlg({ kind: 'form', channel: null })}>
              <Plus aria-hidden />
              {t('admin.channels.createChannel')}
            </Button>
          </>
        }
      />
      <FilterBar
        onReset={() => {
          setSearch('')
          setStatus('')
          table.setPage(1)
        }}
      >
        <SearchInput
          value={search}
          onValueChange={(v) => {
            setSearch(v)
            table.setPage(1)
          }}
          placeholder={t('admin.channels.searchChannels')}
          containerClassName="w-full sm:w-72"
        />
        <FilterSelect
          label={t('admin.channels.columns.status')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.channels.allStatus') },
            { value: 'active', label: t('admin.channels.statusActive') },
            { value: 'disabled', label: t('admin.channels.statusDisabled') }
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        data={query.data?.items ?? []}
        loading={query.isLoading}
        getRowId={(c) => String(c.id)}
        pagination={table.pagination(query.data?.total ?? 0)}
        emptyTitle={t('admin.channels.noChannelsYet')}
        emptyDescription={t('admin.channels.createFirstChannel')}
      />
      {dlg?.kind === 'form' ? (
        <ChannelFormDialog
          channel={dlg.channel}
          onClose={() => setDlg(null)}
          onSaved={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      <ConfirmDialog
        open={dlg?.kind === 'delete'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('admin.channels.deleteChannel')}
        description={
          dlg?.kind === 'delete' ? t('admin.channels.deleteConfirm', { name: dlg.channel.name }) : undefined
        }
        destructive
        confirmText={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind !== 'delete') return
          const c = dlg.channel
          const ok = await run(() => adminAPI.channels.remove(c.id).then(() => true), {
            success: t('admin.channels.deleteSuccess'),
            fallback: t('admin.channels.deleteError')
          })
          if (ok) {
            setDlg(null)
            void refresh()
          }
        }}
      />
    </div>
  )
}
