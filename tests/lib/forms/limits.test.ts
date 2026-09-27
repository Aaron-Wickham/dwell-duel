import { describe, it, expect } from 'vitest'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

describe('TEXT_LIMITS', () => {
  it('holds the limits the database enforces', () => {
    expect(TEXT_LIMITS).toEqual({
      marketTitle: 120,
      marketDescription: 1000,
      outcomeLabel: 60,
      taskTitle: 120,
      taskDescription: 1000,
      reviewNote: 500,
      adjustReason: 200,
      inviteEmail: 254,
      displayName: 80,
    })
  })
})

describe('tooLong', () => {
  it('names the field and its limit', () => {
    expect(tooLong('Title', 120)).toBe('Title can be at most 120 characters.')
  })

  it('names a numbered outcome', () => {
    expect(tooLong('Outcome 3', TEXT_LIMITS.outcomeLabel)).toBe('Outcome 3 can be at most 60 characters.')
  })
})
