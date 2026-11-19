import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/auth', () => ({ getPublicSettings: vi.fn() }))
vi.mock('@/api/admin/system', () => ({ checkUpdates: vi.fn() }))
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(() => 1),
    error: vi.fn(() => 2),
    warning: vi.fn(() => 3),
    info: vi.fn(() => 4),
    dismiss: vi.fn()
  }
}))

import { getPublicSettings } from '@/api/auth'
import { useAppStore } from '../app'

const settings = (extra: Record<string, unknown> = {}) =>
  ({ site_name: 'Acme', backend_mode_enabled: true, ...extra }) as never

describe('app store · public settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete window.__APP_CONFIG__
    useAppStore.getState().clearPublicSettingsCache()
  })

  it('applies injected config synchronously without a request', async () => {
    window.__APP_CONFIG__ = settings()
    const res = await useAppStore.getState().fetchPublicSettings()
    expect(res?.site_name).toBe('Acme')
    expect(getPublicSettings).not.toHaveBeenCalled()
    expect(useAppStore.getState()).toMatchObject({
      siteName: 'Acme',
      backendModeEnabled: true,
      publicSettingsLoaded: true
    })
  })

  it('dedupes concurrent requests; force refresh issues a new one', async () => {
    vi.mocked(getPublicSettings).mockResolvedValue(settings({ site_name: 'Net' }))
    const [a, b] = await Promise.all([
      useAppStore.getState().fetchPublicSettings(),
      useAppStore.getState().fetchPublicSettings()
    ])
    expect(a).toBe(b)
    expect(getPublicSettings).toHaveBeenCalledTimes(1)
    await useAppStore.getState().fetchPublicSettings() // 缓存命中
    expect(getPublicSettings).toHaveBeenCalledTimes(1)
    await useAppStore.getState().fetchPublicSettings(true)
    expect(getPublicSettings).toHaveBeenCalledTimes(2)
  })

  it('a failed fetch resolves null and leaves settings "not loaded" (gate fails open)', async () => {
    vi.mocked(getPublicSettings).mockRejectedValue(new Error('net'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await useAppStore.getState().fetchPublicSettings()).toBeNull()
    expect(useAppStore.getState().publicSettingsLoaded).toBe(false)
  })

  it('keeps the Toast API (showSuccess / showError) backed by sonner', async () => {
    const { toast } = await import('sonner')
    useAppStore.getState().showSuccess('ok')
    useAppStore.getState().showError('bad')
    expect(toast.success).toHaveBeenCalledWith('ok', { duration: 3000 })
    expect(toast.error).toHaveBeenCalledWith('bad', { duration: 5000 })
  })

  it('tracks nested loading state', () => {
    const s = useAppStore.getState()
    s.setLoading(true)
    s.setLoading(true)
    s.setLoading(false)
    expect(useAppStore.getState().loading).toBe(true)
    s.setLoading(false)
    expect(useAppStore.getState().loading).toBe(false)
  })
})
