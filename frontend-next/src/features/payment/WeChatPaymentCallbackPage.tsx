/** /auth/wechat/payment/callback：微信 JSAPI 支付 OAuth 回调，读取 query + fragment 后带 wechat_resume 参数回到购买页。 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { t } from '@/i18n'
import { useAppStore } from '@/stores/app'

/** 回跳路径只接受站内相对路径；/payment 旧路径映射到 /purchase。 */
export function normalizeRedirectPath(path: string | null | undefined): string {
  const value = (path || '').trim()
  if (!value) return '/purchase'
  if (!value.startsWith('/')) return '/purchase'
  if (value.startsWith('//') || value.includes('://')) return '/purchase'
  if (value === '/payment') return '/purchase'
  if (value.startsWith('/payment?')) return '/purchase' + value.slice('/payment'.length)
  return value
}

export interface WechatCallbackResult {
  error?: string
  /** 目标路径（不含 query） */
  pathname?: string
  query?: Record<string, string>
}

/** 由 fragment（优先）与 query 解析回调：失败返回 error，成功返回要跳转的路径与 query。 */
export function parseWechatPaymentCallback(
  search: string,
  hash: string,
  origin: string,
  missingTokenMessage: string
): WechatCallbackResult {
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const query = new URLSearchParams(search)
  const read = (k: string) => fragment.get(k) || query.get(k) || ''

  const error = read('error') || read('err_msg') || read('errmsg')
  const description = read('error_description') || read('message')
  if (error) return { error: description || error }

  const resumeToken = read('wechat_resume_token')
  const openid = read('openid')
  if (!resumeToken && !openid) return { error: missingTokenMessage }

  const redirect = new URL(normalizeRedirectPath(read('redirect')), origin)
  const out: Record<string, string> = {
    ...Object.fromEntries(redirect.searchParams.entries()),
    wechat_resume: '1'
  }
  if (resumeToken) out.wechat_resume_token = resumeToken
  else {
    out.openid = openid
    for (const k of ['state', 'scope', 'payment_type', 'amount', 'order_type', 'plan_id']) {
      const v = read(k)
      if (v) out[k] = v
    }
  }
  return { pathname: redirect.pathname, query: out }
}

export function WeChatPaymentCallbackPage() {
  const router = useRouter()
  const [errorMessage, setErrorMessage] = React.useState('')

  React.useEffect(() => {
    const result = parseWechatPaymentCallback(
      window.location.search,
      window.location.hash,
      window.location.origin,
      t('auth.wechatPayment.callbackMissingResumeToken')
    )
    if (result.error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 回调解析结果只在挂载时同步一次
      setErrorMessage(result.error)
      useAppStore.getState().showError(result.error)
      return
    }
    void router.replace({ pathname: result.pathname, query: result.query })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时处理一次
  }, [])

  return (
    <Card className="mx-auto flex w-full max-w-md flex-col items-center gap-4 p-8 text-center" role="status">
      {errorMessage ? (
        <>
          <AlertCircle className="size-12 text-destructive" aria-hidden />
          <h1 className="text-lg font-semibold">{t('auth.wechatPayment.callbackTitle')}</h1>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          <Button onClick={() => void router.replace('/purchase')}>
            {t('auth.wechatPayment.backToPayment')}
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('auth.wechatPayment.callbackProcessing')}</p>
        </>
      )}
    </Card>
  )
}
