/**
 * Authentication Store（对应 Pinia auth store）
 * 令牌与用户的持久化键不变；定时器放在模块级并保证幂等（兼容 StrictMode 双执行）。
 */
import { create } from 'zustand'
import { authAPI, isTotp2FARequired, type LoginResponse } from '@/api/auth'
import { passkeyAPI } from '@/api/passkey'
import type { User, LoginRequest, RegisterRequest, AuthResponse, ActionCaptchaRequestProof } from '@/types'
import { STORAGE_KEYS } from '@/constants/storage'
import { readStorage, removeStorage, writeStorage } from './storage'

const AUTO_REFRESH_INTERVAL = 60 * 1000
const TOKEN_REFRESH_BUFFER = 120 * 1000

type PendingAuthTokenField = 'pending_auth_token' | 'pending_oauth_token'

export interface PendingAuthSessionSummary {
  token: string
  token_field: PendingAuthTokenField
  provider: string
  redirect?: string
  adoption_required?: boolean
  suggested_display_name?: string
  suggested_avatar_url?: string
}

function normalizePendingAuthTokenField(value: unknown): PendingAuthTokenField {
  return value === 'pending_oauth_token' ? 'pending_oauth_token' : 'pending_auth_token'
}

function getPersistedPendingAuthSession(): PendingAuthSessionSummary | null {
  const raw = readStorage(STORAGE_KEYS.pendingAuthSession)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PendingAuthSessionSummary> | null
    const provider = typeof parsed?.provider === 'string' ? parsed.provider.trim() : ''
    if (!provider) {
      removeStorage(STORAGE_KEYS.pendingAuthSession)
      return null
    }
    return {
      token: typeof parsed?.token === 'string' ? parsed.token : '',
      token_field: normalizePendingAuthTokenField(parsed?.token_field),
      provider,
      redirect: typeof parsed?.redirect === 'string' ? parsed.redirect : undefined,
      adoption_required:
        typeof parsed?.adoption_required === 'boolean' ? parsed.adoption_required : undefined,
      suggested_display_name:
        typeof parsed?.suggested_display_name === 'string' ? parsed.suggested_display_name : undefined,
      suggested_avatar_url:
        typeof parsed?.suggested_avatar_url === 'string' ? parsed.suggested_avatar_url : undefined
    }
  } catch {
    removeStorage(STORAGE_KEYS.pendingAuthSession)
    return null
  }
}

export type RunMode = 'standard' | 'simple'

interface AuthState {
  user: User | null
  token: string | null
  refreshTokenValue: string | null
  tokenExpiresAt: number | null
  runMode: RunMode
  pendingAuthSession: PendingAuthSessionSummary | null
  // 派生值（每次状态变更时重新计算，对应 Pinia computed）
  isAuthenticated: boolean
  isAdmin: boolean
  isSimpleMode: boolean
  hasPendingAuthSession: boolean
}

interface AuthActions {
  login: (credentials: LoginRequest) => Promise<LoginResponse>
  loginWithPasskey: (proof?: ActionCaptchaRequestProof) => Promise<User>
  login2FA: (tempToken: string, totpCode: string) => Promise<User>
  register: (userData: RegisterRequest) => Promise<User>
  setToken: (newToken: string) => Promise<User>
  logout: () => Promise<void>
  checkAuth: () => void
  refreshUser: () => Promise<User>
  /** 用接口返回的最新用户资料（如更新资料后）替换当前用户，并同步 auth_user 存储。 */
  setUser: (user: User) => void
  setPendingAuthSession: (session: PendingAuthSessionSummary | null) => void
  clearPendingAuthSession: () => void
  /** 停止全部定时器（组件卸载 / 测试清理）。 */
  stopTimers: () => void
}

export type AuthStore = AuthState & AuthActions

let refreshIntervalId: ReturnType<typeof setInterval> | null = null
let tokenRefreshTimeoutId: ReturnType<typeof setTimeout> | null = null

function derive(state: Pick<AuthState, 'user' | 'token' | 'runMode' | 'pendingAuthSession'>) {
  return {
    isAuthenticated: !!state.token && !!state.user,
    isAdmin: state.user?.role === 'admin',
    isSimpleMode: state.runMode === 'simple',
    hasPendingAuthSession: state.pendingAuthSession !== null
  }
}

export const useAuthStore = create<AuthStore>((rawSet, get) => {
  const set = (partial: Partial<AuthState>) =>
    rawSet((prev) => {
      const next = { ...prev, ...partial }
      return { ...partial, ...derive(next) }
    })

  function startAutoRefresh(): void {
    stopAutoRefresh()
    refreshIntervalId = setInterval(() => {
      if (get().token) {
        get()
          .refreshUser()
          .catch((error) => console.error('Auto-refresh user failed:', error))
      }
    }, AUTO_REFRESH_INTERVAL)
  }

  function stopAutoRefresh(): void {
    if (refreshIntervalId) {
      clearInterval(refreshIntervalId)
      refreshIntervalId = null
    }
  }

  function stopTokenRefresh(): void {
    if (tokenRefreshTimeoutId) {
      clearTimeout(tokenRefreshTimeoutId)
      tokenRefreshTimeoutId = null
    }
  }

  function scheduleTokenRefreshAt(expiresAtMs: number): void {
    stopTokenRefresh()
    const refreshInMs = Math.max(0, expiresAtMs - Date.now() - TOKEN_REFRESH_BUFFER)
    if (refreshInMs <= 0) {
      void performTokenRefresh()
      return
    }
    tokenRefreshTimeoutId = setTimeout(() => {
      void performTokenRefresh()
    }, refreshInMs)
  }

  function scheduleTokenRefresh(expiresInSeconds: number): void {
    const expiresAtMs = Date.now() + expiresInSeconds * 1000
    set({ tokenExpiresAt: expiresAtMs })
    writeStorage(STORAGE_KEYS.tokenExpiresAt, String(expiresAtMs))
    scheduleTokenRefreshAt(expiresAtMs)
  }

  async function performTokenRefresh(): Promise<void> {
    if (!get().refreshTokenValue) return
    try {
      const response = await authAPI.refreshToken()
      set({ token: response.access_token, refreshTokenValue: response.refresh_token })
      scheduleTokenRefresh(response.expires_in)
    } catch (error) {
      console.error('Token refresh failed:', error)
      // 不在此清理会话——401 由请求拦截器处理
    }
  }

  function clearAuth(options?: { preservePendingAuthSession?: boolean }): void {
    stopAutoRefresh()
    stopTokenRefresh()
    removeStorage(STORAGE_KEYS.authToken)
    removeStorage(STORAGE_KEYS.authUser)
    removeStorage(STORAGE_KEYS.refreshToken)
    removeStorage(STORAGE_KEYS.tokenExpiresAt)

    if (options?.preservePendingAuthSession) {
      set({
        token: null,
        refreshTokenValue: null,
        tokenExpiresAt: null,
        user: null,
        pendingAuthSession: getPersistedPendingAuthSession()
      })
      return
    }
    removeStorage(STORAGE_KEYS.pendingAuthSession)
    set({ token: null, refreshTokenValue: null, tokenExpiresAt: null, user: null, pendingAuthSession: null })
  }

  const preservePending = () => ({ preservePendingAuthSession: get().pendingAuthSession !== null })

  function setAuthFromResponse(response: AuthResponse): void {
    const { run_mode, ...userData } = response.user
    set({
      token: response.access_token,
      ...(response.refresh_token ? { refreshTokenValue: response.refresh_token } : {}),
      ...(run_mode ? { runMode: run_mode } : {}),
      user: userData as User
    })
    if (response.refresh_token) writeStorage(STORAGE_KEYS.refreshToken, response.refresh_token)
    writeStorage(STORAGE_KEYS.authToken, response.access_token)
    writeStorage(STORAGE_KEYS.authUser, JSON.stringify(userData))
    get().clearPendingAuthSession()
    startAutoRefresh()
    if (response.refresh_token && response.expires_in) {
      scheduleTokenRefresh(response.expires_in)
    }
  }

  return {
    user: null,
    token: null,
    refreshTokenValue: null,
    tokenExpiresAt: null,
    runMode: 'standard',
    pendingAuthSession: null,
    isAuthenticated: false,
    isAdmin: false,
    isSimpleMode: false,
    hasPendingAuthSession: false,

    checkAuth() {
      const savedToken = readStorage(STORAGE_KEYS.authToken)
      const savedUser = readStorage(STORAGE_KEYS.authUser)
      const savedRefreshToken = readStorage(STORAGE_KEYS.refreshToken)
      const savedExpiresAt = readStorage(STORAGE_KEYS.tokenExpiresAt)
      set({ pendingAuthSession: getPersistedPendingAuthSession() })

      if (savedToken && savedUser) {
        try {
          const expiresAt = savedExpiresAt ? parseInt(savedExpiresAt, 10) : null
          set({
            token: savedToken,
            user: JSON.parse(savedUser),
            refreshTokenValue: savedRefreshToken,
            tokenExpiresAt: expiresAt
          })
          get()
            .refreshUser()
            .catch((error) => console.error('Failed to refresh user on init:', error))
          startAutoRefresh()
          // 用 !== null：过期时间为 0（已过期）时也要刷新
          if (savedRefreshToken && expiresAt !== null) scheduleTokenRefreshAt(expiresAt)
        } catch (error) {
          console.error('Failed to parse saved user data:', error)
          clearAuth({ preservePendingAuthSession: true })
        }
      }
    },

    async login(credentials) {
      try {
        const response = await authAPI.login(credentials)
        if (isTotp2FARequired(response)) return response
        setAuthFromResponse(response)
        return response
      } catch (error) {
        clearAuth(preservePending())
        throw error
      }
    },

    async login2FA(tempToken, totpCode) {
      try {
        const response = await authAPI.login2FA({ temp_token: tempToken, totp_code: totpCode })
        setAuthFromResponse(response)
        return get().user as User
      } catch (error) {
        clearAuth(preservePending())
        throw error
      }
    },

    async loginWithPasskey(proof) {
      try {
        const response = await passkeyAPI.login(proof)
        setAuthFromResponse(response)
        return get().user as User
      } catch (error) {
        clearAuth(preservePending())
        throw error
      }
    },

    async register(userData) {
      try {
        const response = await authAPI.register(userData)
        setAuthFromResponse(response)
        return get().user as User
      } catch (error) {
        clearAuth(preservePending())
        throw error
      }
    },

    async setToken(newToken) {
      // OAuth 回调可能已写入 refresh_token / token_expires_at，因此不清理 localStorage
      stopAutoRefresh()
      stopTokenRefresh()
      set({ token: newToken, user: null })
      writeStorage(STORAGE_KEYS.authToken, newToken)

      const savedRefreshToken = readStorage(STORAGE_KEYS.refreshToken)
      const savedExpiresAt = readStorage(STORAGE_KEYS.tokenExpiresAt)
      if (savedRefreshToken) set({ refreshTokenValue: savedRefreshToken })
      if (savedExpiresAt) set({ tokenExpiresAt: parseInt(savedExpiresAt, 10) })

      try {
        const userData = await get().refreshUser()
        startAutoRefresh()
        const expiresAt = get().tokenExpiresAt
        if (savedRefreshToken && expiresAt !== null) scheduleTokenRefreshAt(expiresAt)
        get().clearPendingAuthSession()
        return userData
      } catch (error) {
        clearAuth(preservePending())
        throw error
      }
    },

    setPendingAuthSession(session) {
      set({ pendingAuthSession: session })
      if (session) {
        writeStorage(STORAGE_KEYS.pendingAuthSession, JSON.stringify(session))
        return
      }
      removeStorage(STORAGE_KEYS.pendingAuthSession)
    },

    clearPendingAuthSession() {
      get().setPendingAuthSession(null)
    },

    async logout() {
      try {
        await authAPI.logout()
      } catch (err) {
        // 服务端吊销失败不应阻止本地登出
        console.warn('Logout API call failed, clearing local session anyway', err)
      } finally {
        clearAuth()
      }
    },

    async refreshUser() {
      if (!get().token) throw new Error('Not authenticated')
      try {
        const response = await authAPI.getCurrentUser()
        const { run_mode, ...userData } = response.data
        set({ ...(run_mode ? { runMode: run_mode } : {}), user: userData as User })
        writeStorage(STORAGE_KEYS.authUser, JSON.stringify(userData))
        return userData as User
      } catch (error) {
        if ((error as { status?: number }).status === 401) clearAuth(preservePending())
        throw error
      }
    },

    setUser(user) {
      set({ user })
      writeStorage(STORAGE_KEYS.authUser, JSON.stringify(user))
    },

    stopTimers() {
      stopAutoRefresh()
      stopTokenRefresh()
    }
  }
})
