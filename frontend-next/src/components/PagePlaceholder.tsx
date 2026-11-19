import * as React from 'react'
import { useRouter } from 'next/router'
import { Construction } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { matchRoute, routeRequiresAuth, type RouteDef } from '@/core/routes'
import { resolveRouteMetaKeys } from '@/core/title'
import { useAppStore } from '@/stores/app'
import { resolveSiteBillingMode } from '@/utils/siteBillingMode'
import { t } from '@/i18n'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2.5 text-sm sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  )
}

function accessLabel(route: RouteDef): string {
  if (route.requiresAdmin) return t('ui.placeholder.accessAdmin')
  return routeRequiresAuth(route) ? t('ui.placeholder.accessUser') : t('ui.placeholder.accessPublic')
}

/**
 * 路由占位页：展示路由元信息。R1 为附录 A 中全部路由建立占位页，
 * 用于在真相环境中验证深链、门禁、标题与布局；后续轮次逐页替换为真实实现。
 */
export function PagePlaceholder({ name }: { name: string }) {
  const router = useRouter()
  const settings = useAppStore((s) => s.cachedPublicSettings)
  const pathname = router.asPath.split(/[?#]/)[0]
  const match = matchRoute(pathname)
  const route = match?.route
  if (!route) return null
  const keys = resolveRouteMetaKeys(route, { billingMode: resolveSiteBillingMode(settings) })
  const flags: string[] = []
  if (route.requiresPayment) flags.push(t('ui.placeholder.flagPayment'))
  if (route.requiresRiskControl) flags.push(t('ui.placeholder.flagRiskControl'))
  if (route.requiresSubscription) flags.push(t('ui.placeholder.flagSubscription'))
  if (route.simpleRestricted) flags.push(t('ui.placeholder.flagSimple'))
  if (route.backendWhitelist) flags.push(t('ui.placeholder.flagBackend'))
  const params = Object.entries(match.params)

  return (
    <div data-testid="route-placeholder" data-route-name={name}>
      <PageHeader
        title={keys.titleKey ? t(keys.titleKey) : (route.title ?? route.name)}
        description={keys.descriptionKey ? t(keys.descriptionKey) : undefined}
        actions={
          <Badge variant="warning">
            <Construction aria-hidden />
            {t('ui.placeholder.badge')}
          </Badge>
        }
      />
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{t('ui.placeholder.description')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <Row label={t('ui.placeholder.route')}>
              <code className="font-mono text-[13px]">{route.path}</code>
            </Row>
            <Row label={t('ui.placeholder.layout')}>{route.layout ?? '—'}</Row>
            <Row label={t('ui.placeholder.access')}>{accessLabel(route)}</Row>
            <Row label={t('ui.placeholder.round')}>R{route.round}</Row>
            {params.length > 0 ? (
              <Row label={t('ui.placeholder.params')}>{params.map(([k, v]) => `${k}=${v}`).join(', ')}</Row>
            ) : null}
            <Row label={t('ui.placeholder.flags')}>
              {flags.length ? flags.join(' · ') : t('ui.placeholder.none')}
            </Row>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
