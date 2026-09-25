import { describe, it, expect } from 'vitest'
import { relativeTime } from '@/lib/social/relative-time'

const now = Date.parse('2026-09-25T12:00:00Z')

describe('relativeTime', () => {
  it('says "just now" under a minute', () => {
    expect(relativeTime('2026-09-25T11:59:30Z', now)).toBe('just now')
  })

  it('counts minutes, then hours, then days', () => {
    expect(relativeTime('2026-09-25T11:55:00Z', now)).toBe('5m ago')
    expect(relativeTime('2026-09-25T09:00:00Z', now)).toBe('3h ago')
    expect(relativeTime('2026-09-23T12:00:00Z', now)).toBe('2d ago')
  })

  it('treats a timestamp slightly in the future as just now', () => {
    expect(relativeTime('2026-09-25T12:00:10Z', now)).toBe('just now')
  })
})
