/** /model-plaza：按分组展示模型价目（公开页）；`?embedded=1` 且已登录时嵌入控制台外壳。 */
import * as React from 'react'
import { Info, Loader2 } from 'lucide-react'
import { getModelPlaza, type ModelPlazaResponse } from '@/api/modelPlaza'
import { ConsoleLayoutLazy as ConsoleLayout } from '@/components/layout/ConsoleLayoutLazy'
import { PageHeader } from '@/components/PageHeader'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useMounted } from '@/hooks/useMounted'
import { renderMarkdownSafe } from '@/utils/markdown'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { FilterBar } from './FilterBar'
import { GroupSection } from './GroupSection'
import { effectiveRateOf, filterGroups, type PlazaFilters } from './pricing'

const INITIAL_FILTERS: PlazaFilters = { platform: 'all', groupId: 'all', rate: 'all', search: '' }

export function ModelPlazaPage() {
  useLocale()
  const mounted = useMounted()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const fetchPublicSettings = useAppStore((s) => s.fetchPublicSettings)

  const [data, setData] = React.useState<ModelPlazaResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [failed, setFailed] = React.useState(false)
  const [rawFilters, setFilters] = React.useState<PlazaFilters>(INITIAL_FILTERS)
  // 页面只在门禁通过后的客户端渲染，可直接读取地址栏
  const [embeddedParam] = React.useState(
    () => new URLSearchParams(window.location.search).get('embedded') === '1'
  )

  React.useEffect(() => {
    // 独立形态导航条需要站点名 / Logo；有 __APP_CONFIG__ 注入时同步命中缓存
    void fetchPublicSettings()
    const controller = new AbortController()
    getModelPlaza({ signal: controller.signal })
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error('Failed to load model plaza:', error)
          setFailed(true)
        }
      })
      .finally(() => !controller.signal.aborted && setLoading(false))
    return () => controller.abort()
  }, [fetchPublicSettings])

  // embedded=1 但未登录（如转发的链接）自动降级为独立形态
  const embedded = embeddedParam && mounted && isAuthenticated

  const groups = React.useMemo(() => data?.groups ?? [], [data])
  const platforms = React.useMemo(
    () => [...new Set(groups.map((g) => g.platform).filter(Boolean))].sort(),
    [groups]
  )
  const groupOptions = React.useMemo(
    () => groups.map((g) => ({ id: g.id, name: g.name, platform: g.platform, rate: effectiveRateOf(g) })),
    [groups]
  )
  const rates = React.useMemo(() => [...new Set(groups.map(effectiveRateOf))].sort((a, b) => a - b), [groups])

  // 数据刷新后选中的倍率可能不复存在：按“全部”处理
  const filters = React.useMemo<PlazaFilters>(
    () =>
      rawFilters.rate !== 'all' && !rates.includes(rawFilters.rate)
        ? { ...rawFilters, rate: 'all' }
        : rawFilters,
    [rawFilters, rates]
  )

  const filtered = React.useMemo(() => filterGroups(groups, filters), [groups, filters])
  const descriptionHtml = React.useMemo(
    () => renderMarkdownSafe(data?.description?.trim() ?? ''),
    [data?.description]
  )
  const searchActive = filters.search.trim() !== ''

  const content = (
    <div className="space-y-5">
      {!embedded ? (
        <PageHeader title={t('modelPlaza.title')} description={t('modelPlaza.description')} />
      ) : null}

      {descriptionHtml ? (
        // 内容由管理员配置，经 DOMPurify 清洗后渲染
        <div
          className="markdown-body rounded-lg border bg-card p-4 text-sm"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      ) : null}

      {mounted && !isAuthenticated ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5" aria-hidden /> {t('modelPlaza.anonymousHint')}
        </p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16" role="status" aria-label={t('modelPlaza.loading')}>
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : failed ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive"
        >
          {t('modelPlaza.loadFailed')}
        </div>
      ) : (
        <>
          <FilterBar
            platforms={platforms}
            groups={groupOptions}
            rates={rates}
            filters={filters}
            onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
          />
          {filtered.length > 0 ? (
            <div className="space-y-5">
              {filtered.map((g) => (
                <GroupSection key={g.id} group={g} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              {searchActive ? t('modelPlaza.noSearchResult') : t('modelPlaza.empty')}
            </div>
          )}
        </>
      )}
    </div>
  )

  if (embedded) return <ConsoleLayout section={isAdmin ? 'admin' : 'user'}>{content}</ConsoleLayout>
  return <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{content}</div>
}
