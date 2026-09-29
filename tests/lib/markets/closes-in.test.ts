import { describe, it, expect } from 'vitest'
import { closesInLabel } from '@/lib/markets/closes-in'

const now = Date.parse('2026-09-25T12:00:00Z')

describe('closesInLabel', () => {
  it('counts whole minutes under an hour, rounding down', () => {
    expect(closesInLabel('2026-09-25T12:00:30Z', now)).toBe('Closes in under a minute')
    expect(closesInLabel('2026-09-25T12:05:59Z', now)).toBe('Closes in 5m')
    expect(closesInLabel('2026-09-25T12:59:59Z', now)).toBe('Closes in 59m')
  })

  it('counts whole hours up to a day, rounding down', () => {
    expect(closesInLabel('2026-09-25T13:00:00Z', now)).toBe('Closes in 1h')
    expect(closesInLabel('2026-09-25T14:59:00Z', now)).toBe('Closes in 2h')
    expect(closesInLabel('2026-09-26T12:00:00Z', now)).toBe('Closes in 24h')
  })

  it('says nothing about a market more than a day away, already closed or with a bad time', () => {
    expect(closesInLabel('2026-09-26T12:00:01Z', now)).toBeNull()
    expect(closesInLabel('2026-09-25T12:00:00Z', now)).toBeNull()
    expect(closesInLabel('2026-09-25T11:00:00Z', now)).toBeNull()
    expect(closesInLabel('not a time', now)).toBeNull()
  })
})
