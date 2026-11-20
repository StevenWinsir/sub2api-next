import * as React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { t } from '@/i18n'

/** 通用错误页内容：未捕获的渲染错误 / 运行时异常。 */
export function ErrorContent({ error, onRetry }: { error?: Error | null; onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24" role="alert" data-testid="app-error">
      <EmptyState
        icon={AlertTriangle}
        title={t('ui.error.title')}
        description={t('ui.error.description')}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={onRetry ?? (() => window.location.reload())}>
              <RefreshCw aria-hidden />
              {t('ui.error.retry')}
            </Button>
            <Button variant="outline" onClick={() => window.location.assign('/home')}>
              {t('ui.notFound.backHome')}
            </Button>
          </div>
        }
      />
      {error?.message ? (
        <p className="mt-4 break-words text-center font-mono text-xs text-muted-foreground">
          {error.message}
        </p>
      ) : null}
    </div>
  )
}

interface State {
  error: Error | null
}

/** 捕获渲染期异常，避免整页白屏；“重试”重置边界重新渲染，必要时用户可整页刷新。 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string },
  State
> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // 路由变化后自动恢复
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (this.state.error)
      return <ErrorContent error={this.state.error} onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}
