import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type VisibilityState
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  loading?: boolean
  /** 服务端分页：page 从 1 开始。 */
  pagination?: {
    page: number
    pageSize: number
    total: number
    pageSizeOptions?: number[]
    onPageChange: (page: number) => void
    onPageSizeChange?: (size: number) => void
  }
  /** 服务端排序。 */
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  /** 行选择（批量操作）。 */
  selectable?: boolean
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  getRowId?: (row: TData, index: number) => string
  columnVisibility?: VisibilityState
  /** 选中后显示的批量操作栏。 */
  bulkActions?: (selectedRows: TData[]) => React.ReactNode
  emptyTitle?: React.ReactNode
  emptyDescription?: React.ReactNode
  className?: string
}

/**
 * DataTable 封装（TanStack Table）：服务端分页 / 排序、列显隐、行选择、骨架屏、空态。
 * 列宽与列显隐的持久化由调用方沿用原存储键（见 constants/storage.ts）。
 */
export function DataTable<TData>({
  columns,
  data,
  loading,
  pagination,
  sorting,
  onSortingChange,
  selectable,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  columnVisibility,
  bulkActions,
  emptyTitle,
  emptyDescription,
  className
}: DataTableProps<TData>) {
  const allColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!selectable) return columns
    const selectColumn: ColumnDef<TData, unknown> = {
      id: '__select',
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          aria-label="select all"
          checked={
            table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false
          }
          onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="select row"
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(v === true)}
        />
      )
    }
    return [selectColumn, ...columns]
  }, [columns, selectable])

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table 的已知限制，不影响正确性
  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: selectable,
    state: {
      sorting: sorting ?? [],
      rowSelection: rowSelection ?? {},
      columnVisibility: columnVisibility ?? {}
    },
    onSortingChange,
    onRowSelectionChange
  })

  const selected = table.getSelectedRowModel().rows.map((r) => r.original)
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1
  const visibleColumns = table.getVisibleLeafColumns().length

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card', className)}>
      {selectable && selected.length > 0 && bulkActions ? (
        <div className="flex items-center gap-3 border-b bg-accent px-3 py-2 text-sm">
          <span className="font-medium text-accent-foreground">
            {t('ui.table.selected', { count: selected.length })}
          </span>
          {bulkActions(selected)}
        </div>
      ) : null}

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const sortable = header.column.getCanSort()
                const dir = header.column.getIsSorted()
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {dir === 'asc' ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : dir === 'desc' ? (
                          <ArrowDown className="size-3" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: Math.min(pagination?.pageSize ?? 5, 8) }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="hover:bg-transparent">
                {Array.from({ length: visibleColumns }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full max-w-40" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={visibleColumns}>
                <EmptyState title={emptyTitle ?? t('ui.table.noData')} description={emptyDescription} />
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {pagination ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('ui.table.rowsPerPage')}</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) => pagination.onPageSizeChange?.(Number(v))}
              disabled={!pagination.onPageSizeChange}
            >
              <SelectTrigger className="h-8 w-[72px]" aria-label={t('ui.table.rowsPerPage')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(pagination.pageSizeOptions ?? [10, 20, 50, 100]).map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Pagination page={pagination.page} pageCount={pageCount} onPageChange={pagination.onPageChange} />
        </div>
      ) : null}
    </div>
  )
}
