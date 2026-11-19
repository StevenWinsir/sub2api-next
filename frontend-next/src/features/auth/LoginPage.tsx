/**
 * 最小可用登录（R1）：账号密码登录 + TOTP 二次验证弹窗 + 退出，用于验证令牌流程。
 * 完整登录 UI（Passkey、验证码、第三方登录、协议同意等）在 R2 完成。
 */
import * as React from 'react'
import { useRouter } from 'next/router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isTotp2FARequired } from '@/api'
import { sanitizeRedirect } from '@/core/safeNavigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/FormField'
import { TotpStepDialog } from './TotpStepDialog'
import { STORAGE_KEYS } from '@/constants/storage'
import { useAuthStore } from '@/stores/auth'
import { extractApiErrorMessage } from '@/utils/apiError'
import { t } from '@/i18n'
import { useLocale } from '@/i18n/react'

const schema = z.object({
  email: z.string().min(1, 'required').email('invalid'),
  password: z.string().min(1, 'required')
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  useLocale()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const login2FA = useAuthStore((s) => s.login2FA)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [formError, setFormError] = React.useState('')
  // 会话过期提示（auth_expired 由 API 层在刷新失败时设置）。LoginPage 只在客户端门禁通过后渲染，可安全读取 sessionStorage
  const [expired] = React.useState(() => {
    try {
      return !!window.sessionStorage.getItem(STORAGE_KEYS.authExpired)
    } catch {
      return false
    }
  })
  const [totp, setTotp] = React.useState<{ tempToken: string; masked?: string } | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  // 提示只显示一次：读取后立即移除标记（放在 effect 中，StrictMode 下重复执行无副作用）
  React.useEffect(() => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEYS.authExpired)
    } catch {
      /* ignore */
    }
  }, [])

  const afterLogin = React.useCallback(
    async (admin: boolean) => {
      const fallback = admin ? '/admin/dashboard' : '/dashboard'
      // redirect 只接受站内相对路径，防止开放重定向（§5.3.4 / §5.9）
      const raw = new URLSearchParams(window.location.search).get('redirect')
      await router.replace(sanitizeRedirect(raw, fallback))
    },
    [router]
  )

  const onSubmit = handleSubmit(async (values) => {
    setFormError('')
    try {
      const response = await login({ email: values.email.trim(), password: values.password })
      if (isTotp2FARequired(response)) {
        setTotp({ tempToken: response.temp_token ?? '', masked: response.user_email_masked })
        return
      }
      await afterLogin(useAuthStore.getState().isAdmin)
    } catch (err) {
      setFormError(extractApiErrorMessage(err, t('common.unknownError')))
    }
  })

  // 后端模式下已登录的非管理员会留在登录页，这里只提示，不跳转（避免死循环）
  const alreadySignedIn = isAuthenticated && !isAdmin

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('ui.login.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('ui.login.subtitle')}</p>
      </div>

      {expired ? (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {t('ui.login.sessionExpired')}
        </p>
      ) : null}
      {alreadySignedIn ? (
        <p role="status" className="rounded-md border bg-muted px-3 py-2 text-sm">
          {t('ui.login.alreadySignedIn')}
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField
          label={t('ui.login.email')}
          error={errors.email ? t('ui.common.required') : undefined}
          required
        >
          <Input type="email" autoComplete="username" inputMode="email" {...register('email')} />
        </FormField>
        <FormField
          label={t('ui.login.password')}
          error={errors.password ? t('ui.common.required') : undefined}
          required
        >
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </FormField>
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {isSubmitting ? t('ui.login.submitting') : t('ui.login.submit')}
        </Button>
      </form>

      <TotpStepDialog
        open={totp !== null}
        masked={totp?.masked}
        onCancel={() => setTotp(null)}
        onSubmit={async (code) => {
          if (!totp) return
          const user = await login2FA(totp.tempToken, code)
          setTotp(null)
          await afterLogin(user?.role === 'admin')
        }}
      />
    </div>
  )
}
