import { describe, it, expect } from 'vitest'
import { closesInLabel } from '@/lib/markets/closes-in'

const now = Date.parse('2026-09-25T12:00:00Z')
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const label = (ms: number) => closesInLabel(new Date(now + ms).toISOString(), now)

describe('closesInLabel', () => {
  it('never says "0m": under a minute it says so', () => {
    expect(label(30 * SECOND)).toBe('Closes in under a minute')
    expect(label(59 * SECOND)).toBe('Closes in under a minute')
    expect(label(MINUTE)).toBe('Closes in 1m')
  })

  it('counts minutes under an hour, to the nearest minute', () => {
    expect(label(5 * MINUTE + 59 * SECOND)).toBe('Closes in 6m')
    expect(label(59 * MINUTE)).toBe('Closes in 59m')
    expect(label(59 * MINUTE + 29 * SECOND)).toBe('Closes in 59m')
    expect(label(59 * MINUTE + 30 * SECOND)).toBe('Closes in 1h')
  })

  it('counts hours up to a day, to the nearest hour', () => {
    expect(label(HOUR)).toBe('Closes in 1h')
    expect(label(HOUR + 29 * MINUTE)).toBe('Closes in 1h')
    expect(label(HOUR + 31 * MINUTE)).toBe('Closes in 2h')
    expect(label(HOUR + 59 * MINUTE)).toBe('Closes in 2h')
    expect(label(23 * HOUR + 59 * MINUTE)).toBe('Closes in 24h')
    expect(label(24 * HOUR)).toBe('Closes in 24h')
  })

  it('says nothing about a market more than a day away, already closed or with a bad time', () => {
    expect(label(24 * HOUR + SECOND)).toBeNull()
    expect(label(0)).toBeNull()
    expect(label(-HOUR)).toBeNull()
    expect(closesInLabel('not a time', now)).toBeNull()
  })
})
