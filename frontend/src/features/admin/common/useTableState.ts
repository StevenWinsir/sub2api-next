import * as React from 'react'
import { getPersistedPageSize, setPersistedPageSize } from '@/hooks/usePersistedPageSize'
import { getConfiguredTablePageSizeOptions } from '@/utils/tablePreferences'

/** 服务端分页状态：页码 + 页大小（沿用 `table-page-size` 持久化键）。 */
export function useTableState(initialPageSize?: number) {
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSizeState] = React.useState(() => initialPageSize ?? getPersistedPageSize())
  const setPageSize = React.useCallback((size: number) => {
    setPersistedPageSize(size)
    setPageSizeState(size)
    setPage(1)
  }, [])
  const pagination = React.useCallback(
    (total: number) => ({
      page,
      pageSize,
      total,
      pageSizeOptions: getConfiguredTablePageSizeOptions(),
      onPageChange: setPage,
      onPageSizeChange: setPageSize
    }),
    [page, pageSize, setPageSize]
  )
  return { page, setPage, pageSize, setPageSize, pagination }
}

/** 从 localStorage 读取 JSON（挂载后调用；解析失败返回回退值）。 */
export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 忽略存储不可用 */
  }
}
