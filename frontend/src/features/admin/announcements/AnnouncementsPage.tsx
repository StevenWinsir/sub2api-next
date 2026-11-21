/** /admin/announcements：公告管理（列表 / 创建编辑 / Markdown 预览 / 定向条件编辑 / 已读情况）。 */
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { adminAPI } from '@/api/admin'
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
import { Pagination } from '@/components/ui/pagination'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminFormDialog } from '@/features/admin/common/AdminFormDialog'
import { FilterBar, FilterSelect } from '@/features/admin/common/FilterBar'
import { fromLocalInput, numOrUndef, str, toLocalInput } from '@/features/admin/common/fieldUtils'
import { RowActions } from '@/features/admin/common/RowActions'
import { useAdminAction } from '@/features/admin/common/useAdminAction'
import { useTableState } from '@/features/admin/common/useTableState'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import type {
  Announcement,
  AnnouncementCondition,
  AnnouncementConditionGroup,
  AnnouncementNotifyMode,
  AnnouncementOperator,
  AnnouncementStatus,
  AnnouncementTargeting
} from '@/types'
import { formatDateTime } from '@/utils/format'
import { renderMarkdownSafe } from '@/utils/markdown'

const STATUS_TONE = { draft: 'neutral', active: 'success', archived: 'warning' } as const
const OPERATORS: AnnouncementOperator[] = ['gt', 'gte', 'lt', 'lte', 'eq']

/** 定向条件的摘要：全部用户 / 自定义（OR 组数）。 */
export function targetingSummary(targeting: AnnouncementTargeting | undefined): {
  all: boolean
  groups: number
} {
  const groups = targeting?.any_of ?? []
  return { all: groups.length === 0, groups: groups.length }
}

/** 过滤掉没有条件的空组，避免后端把空 AND 组当作“匹配所有人”。 */
export function normalizeTargeting(targeting: AnnouncementTargeting): AnnouncementTargeting {
  const groups = (targeting.any_of ?? []).filter((g) => (g.all_of?.length ?? 0) > 0)
  return { any_of: groups }
}

function TargetingEditor({
  value,
  onChange,
  subGroups
}: {
  value: AnnouncementConditionGroup[]
  onChange: (v: AnnouncementConditionGroup[]) => void
  subGroups: { id: number; name: string }[]
}) {
  const updateCond = (gi: number, ci: number, next: AnnouncementCondition) =>
    onChange(
      value.map((g, i) => (i === gi ? { all_of: (g.all_of ?? []).map((c, j) => (j === ci ? next : c)) } : g))
    )
  return (
    <div className="space-y-3">
      {value.map((g, gi) => (
        <fieldset key={gi} className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">OR #{gi + 1}</legend>
          {(g.all_of ?? []).map((c, ci) => (
            <div key={ci} className="flex flex-wrap items-center gap-2">
              <div className="w-40">
                <NativeSelect
                  aria-label={t('admin.announcements.form.conditionType')}
                  value={c.type}
                  onChange={(e) =>
                    updateCond(
                      gi,
                      ci,
                      e.target.value === 'subscription'
                        ? { type: 'subscription', operator: 'in', group_ids: [] }
                        : { type: 'balance', operator: 'gte', value: 0 }
                    )
                  }
                >
                  <option value="subscription">{t('admin.announcements.form.conditionSubscription')}</option>
                  <option value="balance">{t('admin.announcements.form.conditionBalance')}</option>
                </NativeSelect>
              </div>
              {c.type === 'balance' ? (
                <>
                  <div className="w-24">
                    <NativeSelect
                      aria-label={t('admin.announcements.form.operator')}
                      value={c.operator}
                      onChange={(e) =>
                        updateCond(gi, ci, { ...c, operator: e.target.value as AnnouncementOperator })
                      }
                    >
                      {OPERATORS.map((op) => (
                        <option key={op} value={op}>
                          {t(`admin.announcements.operators.${op}`)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-28"
                    aria-label={t('admin.announcements.form.balanceValue')}
                    value={str(c.value)}
                    onChange={(e) => updateCond(gi, ci, { ...c, value: numOrUndef(e.target.value) ?? 0 })}
                  />
                </>
              ) : (
                <div className="flex max-h-24 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">
                  {subGroups.map((sg) => (
                    <label key={sg.id} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={(c.group_ids ?? []).includes(sg.id)}
                        onCheckedChange={(v) =>
                          updateCond(gi, ci, {
                            ...c,
                            group_ids:
                              v === true
                                ? [...(c.group_ids ?? []), sg.id]
                                : (c.group_ids ?? []).filter((x) => x !== sg.id)
                          })
                        }
                      />
                      {sg.name}
                    </label>
                  ))}
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('common.remove')}
                onClick={() =>
                  onChange(
                    value.map((x, i) =>
                      i === gi ? { all_of: (x.all_of ?? []).filter((_, j) => j !== ci) } : x
                    )
                  )
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onChange(
                  value.map((x, i) =>
                    i === gi
                      ? { all_of: [...(x.all_of ?? []), { type: 'balance', operator: 'gte', value: 0 }] }
                      : x
                  )
                )
              }
            >
              {t('admin.announcements.form.addAndCondition')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(value.filter((_, i) => i !== gi))}
            >
              {t('common.remove')}
            </Button>
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange([...value, { all_of: [{ type: 'balance', operator: 'gte', value: 0 }] }])}
      >
        {t('admin.announcements.form.addOrGroup')}
      </Button>
    </div>
  )
}

function AnnouncementFormDialog({
  item,
  onClose,
  onSaved
}: {
  item: Announcement | null
  onClose: () => void
  onSaved: () => void
}) {
  const { busy, run } = useAdminAction()
  const groups = useQuery({
    queryKey: ['admin', 'groups', 'all-including-inactive'],
    queryFn: () => adminAPI.groups.getAllIncludingInactive()
  })
  const subGroups = (groups.data ?? [])
    .filter((g) => g.subscription_type === 'subscription')
    .map((g) => ({ id: g.id, name: g.name }))
  const [title, setTitle] = React.useState(item?.title ?? '')
  const [content, setContent] = React.useState(item?.content ?? '')
  const [status, setStatus] = React.useState<AnnouncementStatus>(item?.status ?? 'draft')
  const [notify, setNotify] = React.useState<AnnouncementNotifyMode>(item?.notify_mode ?? 'silent')
  const [starts, setStarts] = React.useState(toLocalInput(item?.starts_at))
  const [ends, setEnds] = React.useState(toLocalInput(item?.ends_at))
  const [custom, setCustom] = React.useState(!targetingSummary(item?.targeting).all)
  const [groupsState, setGroupsState] = React.useState<AnnouncementConditionGroup[]>(
    item?.targeting?.any_of ?? []
  )
  const [error, setError] = React.useState('')
  const html = React.useMemo(() => renderMarkdownSafe(content), [content])

  const submit = async () => {
    if (!title.trim() || !content.trim()) return setError(t('ui.common.required'))
    setError('')
    const sIso = fromLocalInput(starts)
    const eIso = fromLocalInput(ends)
    const payload = {
      title: title.trim(),
      content,
      status,
      notify_mode: notify,
      targeting: custom ? normalizeTargeting({ any_of: groupsState }) : { any_of: [] },
      starts_at: sIso ? Math.floor(new Date(sIso).getTime() / 1000) : 0,
      ends_at: eIso ? Math.floor(new Date(eIso).getTime() / 1000) : 0
    }
    const ok = item
      ? await run(() => adminAPI.announcements.update(item.id, payload), {
          success: t('common.saved'),
          fallback: t('admin.announcements.failedToUpdate')
        })
      : await run(() => adminAPI.announcements.create(payload), {
          success: t('common.saved'),
          fallback: t('admin.announcements.failedToCreate')
        })
    if (ok) onSaved()
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={item ? t('admin.announcements.editAnnouncement') : t('admin.announcements.createAnnouncement')}
      onSubmit={submit}
      submitting={busy}
      size="xl"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          label={t('admin.announcements.form.title')}
          required
          error={error}
          className="sm:col-span-3"
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </FormField>
        <FormField label={t('admin.announcements.form.status')}>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as AnnouncementStatus)}>
            {(['draft', 'active', 'archived'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`admin.announcements.statusLabels.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          label={t('admin.announcements.form.notifyMode')}
          description={t('admin.announcements.form.notifyModeHint')}
        >
          <NativeSelect value={notify} onChange={(e) => setNotify(e.target.value as AnnouncementNotifyMode)}>
            <option value="silent">{t('admin.announcements.notifyModeLabels.silent')}</option>
            <option value="popup">{t('admin.announcements.notifyModeLabels.popup')}</option>
          </NativeSelect>
        </FormField>
        <span />
        <FormField
          label={t('admin.announcements.form.startsAt')}
          description={t('admin.announcements.form.startsAtHint')}
        >
          <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </FormField>
        <FormField
          label={t('admin.announcements.form.endsAt')}
          description={t('admin.announcements.form.endsAtHint')}
        >
          <Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </FormField>
      </div>
      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">{t('admin.announcements.form.content')}</TabsTrigger>
          <TabsTrigger value="preview">{t('admin.announcements.preview')}</TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="pt-3">
          <Textarea
            rows={8}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="font-mono"
            aria-label={t('admin.announcements.form.content')}
          />
        </TabsContent>
        <TabsContent value="preview" className="pt-3">
          {/* Markdown 已经 DOMPurify 清洗 */}
          <div
            className="markdown-body min-h-40 rounded-md border p-3"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </TabsContent>
      </Tabs>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('admin.announcements.form.targetingMode')}</h3>
        <div className="w-56">
          <NativeSelect
            value={custom ? 'custom' : 'all'}
            onChange={(e) => setCustom(e.target.value === 'custom')}
            aria-label={t('admin.announcements.form.targetingMode')}
          >
            <option value="all">{t('admin.announcements.form.targetingAll')}</option>
            <option value="custom">{t('admin.announcements.form.targetingCustom')}</option>
          </NativeSelect>
        </div>
        {custom ? (
          <TargetingEditor value={groupsState} onChange={setGroupsState} subGroups={subGroups} />
        ) : null}
      </section>
    </AdminFormDialog>
  )
}

function ReadStatusDialog({ item, onClose }: { item: Announcement; onClose: () => void }) {
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const q = useQuery({
    queryKey: ['admin', 'announcements', item.id, 'read-status', page, search],
    queryFn: () => adminAPI.announcements.getReadStatus(item.id, page, 10, { search: search || undefined }),
    placeholderData: (p) => p
  })
  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.announcements.readStatus')}
      description={item.title}
      size="lg"
    >
      <SearchInput
        value={search}
        onValueChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        placeholder={t('admin.announcements.searchUsers')}
      />
      <ul className="divide-y rounded-md border text-sm">
        {(q.data?.items ?? []).map((u) => (
          <li key={u.user_id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="truncate">{u.email}</span>
            <span className="flex items-center gap-2">
              {u.eligible ? <Badge variant="secondary">{t('admin.announcements.eligible')}</Badge> : null}
              <span className="text-muted-foreground">
                {u.read_at ? formatDateTime(u.read_at) : t('admin.announcements.unread')}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil((q.data?.total ?? 0) / 10))}
        onPageChange={setPage}
      />
    </AdminFormDialog>
  )
}

type Dlg =
  | { kind: 'form'; item: Announcement | null }
  | { kind: 'read'; item: Announcement }
  | { kind: 'delete'; item: Announcement }
  | null

export function AnnouncementsPage() {
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
    queryKey: ['admin', 'announcements', 'list', table.page, table.pageSize, filters],
    queryFn: ({ signal }) => adminAPI.announcements.list(table.page, table.pageSize, filters, { signal }),
    placeholderData: (p) => p
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'announcements'] })

  const cols = React.useMemo<ColumnDef<Announcement, unknown>[]>(
    () => [
      {
        id: 'title',
        header: t('admin.announcements.columns.title'),
        cell: ({ row }) => <span className="block max-w-72 truncate font-medium">{row.original.title}</span>
      },
      {
        id: 'status',
        header: t('admin.announcements.columns.status'),
        cell: ({ row }) => (
          <StatusBadge status={STATUS_TONE[row.original.status]}>
            {t(`admin.announcements.statusLabels.${row.original.status}`)}
          </StatusBadge>
        )
      },
      {
        id: 'notify',
        header: t('admin.announcements.columns.notifyMode'),
        cell: ({ row }) => t(`admin.announcements.notifyModeLabels.${row.original.notify_mode}`)
      },
      {
        id: 'targeting',
        header: t('admin.announcements.columns.targeting'),
        cell: ({ row }) => {
          const s = targetingSummary(row.original.targeting)
          return s.all
            ? t('admin.announcements.targetingSummaryAll')
            : t('admin.announcements.targetingSummaryCustom', { groups: s.groups, count: s.groups })
        }
      },
      {
        id: 'time',
        header: t('admin.announcements.columns.timeRange'),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.starts_at
              ? formatDateTime(row.original.starts_at)
              : t('admin.announcements.timeImmediate')}{' '}
            →{' '}
            {row.original.ends_at ? formatDateTime(row.original.ends_at) : t('admin.announcements.timeNever')}
          </span>
        )
      },
      {
        id: 'created',
        header: t('admin.announcements.columns.createdAt'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.created_at)}</span>
        )
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('admin.announcements.columns.actions')}</span>,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                key: 'edit',
                label: t('common.edit'),
                onSelect: () => setDlg({ kind: 'form', item: row.original })
              },
              {
                key: 'read',
                label: t('admin.announcements.readStatus'),
                onSelect: () => setDlg({ kind: 'read', item: row.original })
              },
              {
                key: 'delete',
                separator: true,
                label: t('common.delete'),
                destructive: true,
                onSelect: () => setDlg({ kind: 'delete', item: row.original })
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
        title={t('admin.announcements.title')}
        description={t('admin.announcements.description')}
        actions={
          <>
            <Button variant="outline" aria-label={t('common.refresh')} onClick={() => void refresh()}>
              <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden />
            </Button>
            <Button onClick={() => setDlg({ kind: 'form', item: null })}>
              <Plus aria-hidden />
              {t('admin.announcements.createAnnouncement')}
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
          placeholder={t('admin.announcements.searchAnnouncements')}
          containerClassName="w-full sm:w-72"
        />
        <FilterSelect
          label={t('admin.announcements.status')}
          value={status}
          onChange={(v) => {
            setStatus(v)
            table.setPage(1)
          }}
          options={[
            { value: '', label: t('admin.announcements.allStatus') },
            ...(['draft', 'active', 'archived'] as const).map((s) => ({
              value: s,
              label: t(`admin.announcements.statusLabels.${s}`)
            }))
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        data={query.data?.items ?? []}
        loading={query.isLoading}
        getRowId={(a) => String(a.id)}
        pagination={table.pagination(query.data?.total ?? 0)}
        emptyTitle={t('admin.announcements.createFirstAnnouncement')}
      />
      {dlg?.kind === 'form' ? (
        <AnnouncementFormDialog
          item={dlg.item}
          onClose={() => setDlg(null)}
          onSaved={() => {
            setDlg(null)
            void refresh()
          }}
        />
      ) : null}
      {dlg?.kind === 'read' ? <ReadStatusDialog item={dlg.item} onClose={() => setDlg(null)} /> : null}
      <ConfirmDialog
        open={dlg?.kind === 'delete'}
        onOpenChange={(o) => !o && setDlg(null)}
        title={t('admin.announcements.deleteAnnouncement')}
        description={t('admin.announcements.deleteConfirm')}
        destructive
        confirmText={t('common.delete')}
        loading={busy}
        onConfirm={async () => {
          if (dlg?.kind !== 'delete') return
          const a = dlg.item
          const ok = await run(() => adminAPI.announcements.delete(a.id), {
            success: t('common.deleted'),
            fallback: t('admin.announcements.failedToDelete')
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
