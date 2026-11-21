import { describe, expect, it } from 'vitest'
import { getAdminSteps, getUserSteps } from '../steps'
import { isInteractiveStep, shouldAutoStartTour, tourStorageKey } from '../tourLogic'

const t = (k: string) => k

describe('tour logic', () => {
  it('detects interactive steps by the close-only button set', () => {
    expect(isInteractiveStep({ popover: { showButtons: ['close'] } })).toBe(true)
    expect(isInteractiveStep({ popover: { showButtons: ['next', 'previous'] } })).toBe(false)
    expect(isInteractiveStep({ popover: {} })).toBe(false)
    expect(isInteractiveStep(undefined)).toBe(false)
  })
  it('keys the seen-flag per user and role', () => {
    expect(tourStorageKey({ id: 3, role: 'admin' })).toBe('onboarding_tour_3_admin_v4_interactive')
    expect(tourStorageKey(null)).toBe('onboarding_tour_guest_user_v4_interactive')
  })
  it('auto-starts only for admins in standard mode who have not seen it', () => {
    const base = { isAdmin: true, isSimpleMode: false, seen: false, autoStart: true }
    expect(shouldAutoStartTour(base)).toBe(true)
    expect(shouldAutoStartTour({ ...base, isAdmin: false })).toBe(false)
    expect(shouldAutoStartTour({ ...base, isSimpleMode: true })).toBe(false)
    expect(shouldAutoStartTour({ ...base, seen: true })).toBe(false)
    expect(shouldAutoStartTour({ ...base, autoStart: false })).toBe(false)
  })
  it('keeps the original step selectors that pages expose via data-tour', () => {
    const selectors = [...getAdminSteps(t), ...getUserSteps(t)].map((s) => s.element).filter(Boolean)
    expect(selectors).toContain('[data-tour="keys-create-btn"]')
    expect(selectors).toContain('[data-tour="key-form-name"]')
    expect(selectors).toContain('[data-tour="key-form-group"]')
    expect(selectors).toContain('[data-tour="key-form-submit"]')
    expect(selectors).toContain('[data-tour="sidebar-my-keys"]')
    expect(selectors).toContain('#sidebar-group-manage')
  })
})
