import { describe, expect, it } from 'vitest'
import { canProceedFromStep, extractSetupError } from '../setupLogic'

const base = {
  dbConnected: false,
  redisConnected: false,
  adminEmail: '',
  adminPassword: '',
  confirmPassword: ''
}

describe('canProceedFromStep', () => {
  it('requires a successful connection test for the database and redis steps', () => {
    expect(canProceedFromStep(0, base)).toBe(false)
    expect(canProceedFromStep(0, { ...base, dbConnected: true })).toBe(true)
    expect(canProceedFromStep(1, { ...base, dbConnected: true })).toBe(false)
    expect(canProceedFromStep(1, { ...base, redisConnected: true })).toBe(true)
  })

  it('validates the admin step', () => {
    const ok = { ...base, adminEmail: 'a@b.co', adminPassword: '12345678', confirmPassword: '12345678' }
    expect(canProceedFromStep(2, ok)).toBe(true)
    expect(canProceedFromStep(2, { ...ok, adminEmail: '' })).toBe(false)
    expect(canProceedFromStep(2, { ...ok, adminPassword: '1234567', confirmPassword: '1234567' })).toBe(false)
    expect(canProceedFromStep(2, { ...ok, confirmPassword: '12345679' })).toBe(false)
  })

  it('always allows the review step', () => {
    expect(canProceedFromStep(3, base)).toBe(true)
  })
})

describe('extractSetupError', () => {
  it('prefers detail, then message, then error message, then fallback', () => {
    expect(extractSetupError({ response: { data: { detail: 'd', message: 'm' } }, message: 'e' }, 'f')).toBe(
      'd'
    )
    expect(extractSetupError({ response: { data: { message: 'm' } }, message: 'e' }, 'f')).toBe('m')
    expect(extractSetupError({ message: 'e' }, 'f')).toBe('e')
    expect(extractSetupError({}, 'f')).toBe('f')
  })
})
