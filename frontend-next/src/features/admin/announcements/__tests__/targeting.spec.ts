import { describe, expect, it } from 'vitest'
import { normalizeTargeting, targetingSummary } from '../AnnouncementsPage'

describe('announcement targeting', () => {
  it('treats an empty any_of as everyone', () => {
    expect(targetingSummary(undefined)).toEqual({ all: true, groups: 0 })
    expect(
      targetingSummary({ any_of: [{ all_of: [{ type: 'balance', operator: 'gt', value: 1 }] }] })
    ).toEqual({ all: false, groups: 1 })
  })
  it('drops empty AND groups so they never match everyone by accident', () => {
    expect(
      normalizeTargeting({
        any_of: [{ all_of: [] }, { all_of: [{ type: 'balance', operator: 'gte', value: 0 }] }, {}]
      })
    ).toEqual({
      any_of: [{ all_of: [{ type: 'balance', operator: 'gte', value: 0 }] }]
    })
  })
})
