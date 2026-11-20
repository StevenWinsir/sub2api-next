import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/auth', () => ({
  authAPI: {
    login: vi.fn(),
    login2FA: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    getCurrentUser: vi.fn(),
    register: vi.fn()
  },
  isTotp2FARequired: (r: { requires_2fa?: boolean }) => r.requires_2fa === true
}))
vi.mock('@/api/passkey', () => ({ passkeyAPI: { login: vi.fn() } }))

import { authAPI } from '@/api/auth'
import { useAuthStore } from '../auth'

const user = { id: 1, email: 'a@b.c', username: 'a', role: 'user', balance: 0 }
const adminUser = { ...user, role: 'admin' }

function reset() {
  useAuthStore.getState().stopTimers()
  localStorage.clear()
  useAuthStore.setState({
    user: null,
    token: null,
    refreshTokenValue: null,
    tokenExpiresAt: null,
    runMode: 'standard',
    pendingAuthSession: null,
    isAuthenticated: false,
    isAdmin: false,
    isSimpleMode: false,
    hasPendingAuthSession: false
  })
}

describe('auth store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    reset()
  })
  afterEach(() => {
    reset()
    vi.useRealTimers()
  })

  it('persists tokens under the legacy keys on login (upgrade compatibility)', async () => {
    vi.mocked(authAPI.login).mockResolvedValue({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 900,
      user: { ...user, run_mode: 'simple' }
    } as never)
    await useAuthStore.getState().login({ email: 'a@b.c', password: 'x' })
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.isSimpleMode).toBe(true)
    expect(localStorage.getItem('auth_token')).toBe('at')
    expect(localStorage.getItem('refresh_token')).toBe('rt')
    expect(JSON.parse(localStorage.getItem('auth_user')!)).toEqual(user) // run_mode 不写入用户对象
    expect(Number(localStorage.getItem('token_expires_at'))).toBeGreaterThan(Date.now())
  })

  it('returns the 2FA challenge without setting auth state', async () => {
    vi.mocked(authAPI.login).mockResolvedValue({ requires_2fa: true, temp_token: 't' } as never)
    const res = await useAuthStore.getState().login({ email: 'a@b.c', password: 'x' })
    expect(res).toMatchObject({ requires_2fa: true })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(localStorage.getItem('auth_token')).toBeNull()
  })

  it('completes login with TOTP', async () => {
    vi.mocked(authAPI.login2FA).mockResolvedValue({ access_token: 'at', user: adminUser } as never)
    const u = await useAuthStore.getState().login2FA('t', '123456')
    expect(u.role).toBe('admin')
    expect(useAuthStore.getState().isAdmin).toBe(true)
    expect(authAPI.login2FA).toHaveBeenCalledWith({ temp_token: 't', totp_code: '123456' })
  })

  it('restores the session from localStorage and refreshes the user', async () => {
    localStorage.setItem('auth_token', 'at')
    localStorage.setItem('auth_user', JSON.stringify(user))
    vi.mocked(authAPI.getCurrentUser).mockResolvedValue({ data: { ...user, balance: 5 } } as never)
    useAuthStore.getState().checkAuth()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(authAPI.getCurrentUser).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user?.balance).toBe(5)
  })

  it('auto-refreshes user data every 60s with a single timer even if checkAuth runs twice (StrictMode)', async () => {
    localStorage.setItem('auth_token', 'at')
    localStorage.setItem('auth_user', JSON.stringify(user))
    vi.mocked(authAPI.getCurrentUser).mockResolvedValue({ data: user } as never)
    useAuthStore.getState().checkAuth()
    useAuthStore.getState().checkAuth()
    await vi.advanceTimersByTimeAsync(0)
    vi.mocked(authAPI.getCurrentUser).mockClear()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(authAPI.getCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('schedules a proactive token refresh before expiry and reschedules after it', async () => {
    localStorage.setItem('auth_token', 'at')
    localStorage.setItem('refresh_token', 'rt')
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('token_expires_at', String(Date.now() + 300_000))
    vi.mocked(authAPI.getCurrentUser).mockResolvedValue({ data: user } as never)
    vi.mocked(authAPI.refreshToken).mockResolvedValue({
      access_token: 'at2',
      refresh_token: 'rt2',
      expires_in: 900
    } as never)
    useAuthStore.getState().checkAuth()
    await vi.advanceTimersByTimeAsync(179_000)
    expect(authAPI.refreshToken).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000) // 过期前 120s 缓冲
    expect(authAPI.refreshToken).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().token).toBe('at2')
    expect(Number(localStorage.getItem('token_expires_at'))).toBeGreaterThan(Date.now() + 800_000)
  })

  it('does not clear the session when a proactive refresh fails (the interceptor owns 401)', async () => {
    localStorage.setItem('auth_token', 'at')
    localStorage.setItem('refresh_token', 'rt')
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('token_expires_at', '0')
    vi.mocked(authAPI.getCurrentUser).mockResolvedValue({ data: user } as never)
    vi.mocked(authAPI.refreshToken).mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    useAuthStore.getState().checkAuth()
    await vi.advanceTimersByTimeAsync(0)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('logout clears every auth key even if the API call fails', async () => {
    localStorage.setItem('auth_token', 'at')
    localStorage.setItem('refresh_token', 'rt')
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.setItem('token_expires_at', '1')
    useAuthStore.setState({ token: 'at', user: user as never, isAuthenticated: true })
    vi.mocked(authAPI.logout).mockRejectedValue(new Error('net'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await useAuthStore.getState().logout()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    for (const key of ['auth_token', 'refresh_token', 'auth_user', 'token_expires_at']) {
      expect(localStorage.getItem(key)).toBeNull()
    }
  })

  it('clears the session on a 401 during refreshUser but keeps the pending auth session', async () => {
    useAuthStore
      .getState()
      .setPendingAuthSession({ token: 'p', token_field: 'pending_auth_token', provider: 'github' })
    useAuthStore.setState({ token: 'at', user: user as never, isAuthenticated: true })
    vi.mocked(authAPI.getCurrentUser).mockRejectedValue({ status: 401 })
    await expect(useAuthStore.getState().refreshUser()).rejects.toMatchObject({ status: 401 })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().pendingAuthSession).toMatchObject({ provider: 'github' })
    expect(useAuthStore.getState().hasPendingAuthSession).toBe(true)
  })

  it('persists and restores pending auth sessions (and drops corrupt ones)', () => {
    useAuthStore
      .getState()
      .setPendingAuthSession({ token: 'p', token_field: 'pending_oauth_token', provider: 'oidc' })
    expect(JSON.parse(localStorage.getItem('pending_auth_session')!).provider).toBe('oidc')
    useAuthStore.setState({ pendingAuthSession: null })
    useAuthStore.getState().checkAuth()
    expect(useAuthStore.getState().pendingAuthSession?.provider).toBe('oidc')
    localStorage.setItem('pending_auth_session', '{bad')
    useAuthStore.getState().checkAuth()
    expect(useAuthStore.getState().pendingAuthSession).toBeNull()
    expect(localStorage.getItem('pending_auth_session')).toBeNull()
  })

  it('setToken (OAuth callback) loads the user and honours the stored refresh token / expiry', async () => {
    localStorage.setItem('refresh_token', 'rt')
    localStorage.setItem('token_expires_at', String(Date.now() + 600_000))
    vi.mocked(authAPI.getCurrentUser).mockResolvedValue({ data: user } as never)
    const u = await useAuthStore.getState().setToken('oauth-at')
    expect(u.email).toBe('a@b.c')
    expect(useAuthStore.getState().refreshTokenValue).toBe('rt')
    expect(localStorage.getItem('auth_token')).toBe('oauth-at')
  })
})
