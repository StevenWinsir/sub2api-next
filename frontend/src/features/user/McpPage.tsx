/** /settings/mcp：MCP 连接信息 + 已授权客户端（撤销）。 */
import * as React from 'react'
import { Copy, Plug, RefreshCw } from 'lucide-react'
import { mcpAPI, type MCPGrant } from '@/api/mcp'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useClipboard } from '@/hooks/useClipboard'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'
import { useAppStore } from '@/stores/app'
import { formatDate } from '@/utils/format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const messageOf = (error: unknown, fallback: string): string => {
  const m = (error as { message?: unknown } | null)?.message
  return typeof m === 'string' && m ? m : fallback
}

export const isGrantActive = (g: MCPGrant, now = Date.now()): boolean =>
  !g.revoked_at && !g.invalidated && new Date(g.expires_at).getTime() > now

export function grantStatusLabel(g: MCPGrant, now = Date.now()): string {
  if (g.revoked_at) return t('mcp.revoked')
  if (g.invalidated) return t('mcp.invalidated')
  return isGrantActive(g, now) ? t('mcp.active') : t('mcp.expired')
}

export function McpPage() {
  useLocale()
  const queryClient = useQueryClient()
  const { copy } = useClipboard()
  const [target, setTarget] = React.useState<MCPGrant | null>(null)
  const [revokeError, setRevokeError] = React.useState('')

  const connection = useQuery({
    queryKey: ['user', 'mcp', 'config'],
    queryFn: () => mcpAPI.getConnectionConfig(),
    retry: false
  })
  const grants = useQuery({
    queryKey: ['user', 'mcp', 'grants'],
    queryFn: () => mcpAPI.listGrants(),
    retry: false
  })
  const revoke = useMutation({
    mutationFn: (id: string) => mcpAPI.revokeGrant(id),
    onSuccess: (_d, id) => {
      queryClient.setQueryData<MCPGrant[]>(['user', 'mcp', 'grants'], (old) =>
        (old ?? []).map((g) => (g.id === id ? { ...g, revoked_at: new Date().toISOString() } : g))
      )
      setTarget(null)
      useAppStore.getState().showSuccess(t('mcp.revokeSuccess'))
    },
    onError: (error) => setRevokeError(messageOf(error, t('mcp.revokeFailed')))
  })
  const endpoint = connection.data?.resource ?? ''

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={t('mcp.title')} description={t('mcp.description')} />

      <Card aria-labelledby="mcp-connection-title">
        <CardContent className="space-y-5 p-5 sm:p-6" aria-busy={connection.isLoading}>
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-accent p-3 text-accent-foreground">
              <Plug className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="mcp-connection-title" className="text-lg font-semibold">
                {t('mcp.connectionTitle')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('mcp.connectionDescription')}</p>
            </div>
          </div>
          <div>
            <label htmlFor="mcp-endpoint" className="mb-1.5 block text-sm font-medium">
              {t('mcp.endpoint')}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="mcp-endpoint"
                readOnly
                value={endpoint}
                placeholder={connection.isLoading ? t('mcp.connectionLoading') : ''}
                className="min-w-0 flex-1 font-mono"
              />
              <Button
                data-testid="copy-endpoint"
                variant="outline"
                disabled={!endpoint || connection.isLoading}
                onClick={() => void copy(endpoint)}
              >
                <Copy aria-hidden />
                {t('mcp.copyEndpoint')}
              </Button>
            </div>
            {connection.isError ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p role="alert" className="text-sm text-destructive">
                  {messageOf(connection.error, t('mcp.connectionLoadFailed'))}
                </p>
                <Button
                  data-testid="retry-connection"
                  size="sm"
                  variant="outline"
                  disabled={connection.isFetching}
                  onClick={() => void connection.refetch()}
                >
                  {t('common.refresh')}
                </Button>
              </div>
            ) : null}
            <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>{t('mcp.connectStep1')}</li>
              <li>{t('mcp.connectStep2')}</li>
              <li>{t('mcp.connectStep3')}</li>
            </ol>
          </div>
          <p className="border-t pt-4 text-sm text-muted-foreground">{t('mcp.capabilities')}</p>
        </CardContent>
      </Card>

      <Card aria-labelledby="mcp-grants-title">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5 sm:p-6">
          <div className="max-w-xl">
            <h2 id="mcp-grants-title" className="text-lg font-semibold">
              {t('mcp.grantsTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('mcp.grantsDescription')}</p>
          </div>
          <Button
            data-testid="refresh-grants"
            variant="outline"
            disabled={grants.isFetching || revoke.isPending}
            onClick={() => void grants.refetch()}
          >
            <RefreshCw className={grants.isFetching ? 'animate-spin' : ''} aria-hidden />
            {t('common.refresh')}
          </Button>
        </div>
        <CardContent className="p-5 sm:p-6" aria-busy={grants.isLoading}>
          {grants.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {messageOf(grants.error, t('mcp.loadFailed'))}
            </p>
          ) : grants.isLoading ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              {t('mcp.loading')}
            </p>
          ) : (grants.data ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              {t('mcp.empty')}
            </p>
          ) : (
            <ul className="divide-y">
              {(grants.data ?? []).map((g) => (
                <li
                  key={g.id}
                  data-grant-id={g.id}
                  className="flex items-start justify-between gap-4 py-5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-all font-medium">{g.client_name}</span>
                      <Badge variant="secondary">
                        {g.scope === 'admin' ? t('mcp.adminScope') : t('mcp.userScope')}
                      </Badge>
                      <Badge>{g.read_only ? t('mcp.readOnly') : t('mcp.readWrite')}</Badge>
                      <span
                        className={`text-xs ${isGrantActive(g) ? 'text-success' : 'text-muted-foreground'}`}
                      >
                        {grantStatusLabel(g)}
                      </span>
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground" title={g.client_id}>
                      {g.client_id}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{t('mcp.createdAt', { date: formatDate(g.created_at) })}</span>
                      <span>{t('mcp.expiresAt', { date: formatDate(g.expires_at) })}</span>
                      <span>
                        {g.last_used_at
                          ? t('mcp.lastUsedAt', { date: formatDate(g.last_used_at) })
                          : t('mcp.neverUsed')}
                      </span>
                    </div>
                  </div>
                  {!g.revoked_at ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => {
                        setTarget(g)
                        setRevokeError('')
                      }}
                    >
                      {t('mcp.revoke')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => !o && !revoke.isPending && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('mcp.revokeTitle')}</DialogTitle>
            <DialogDescription>
              {t('mcp.revokeConfirm', { name: target?.client_name || '' })}
            </DialogDescription>
          </DialogHeader>
          {revokeError ? (
            <p role="alert" className="text-sm text-destructive">
              {revokeError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={revoke.isPending} onClick={() => setTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              data-testid="confirm-revoke"
              variant="destructive"
              loading={revoke.isPending}
              disabled={grants.isFetching}
              onClick={() => target && revoke.mutate(target.id)}
            >
              {revoke.isPending ? t('common.processing') : t('mcp.revoke')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
