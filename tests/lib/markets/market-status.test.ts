import { describe, it, expect } from 'vitest'
import { marketCardStatus } from '@/lib/markets/market-status'

describe('marketCardStatus', () => {
  const now = new Date('2026-10-01T12:00:00.000Z')

  it('is open while still accepting bets', () => {
    expect(marketCardStatus('open', '2026-10-04T12:00:00.000Z', now)).toBe('open')
  })

  it('is awaiting resolution once closed but not yet resolved', () => {
    expect(marketCardStatus('open', '2026-09-30T12:00:00.000Z', now)).toBe('awaiting')
  })

  it('treats the exact close instant as awaiting resolution', () => {
    expect(marketCardStatus('open', now.toISOString(), now)).toBe('awaiting')
  })

  it('is resolved once an admin resolves it, regardless of close time', () => {
    expect(marketCardStatus('resolved', '2026-10-04T12:00:00.000Z', now)).toBe('resolved')
  })

  it('is voided regardless of close time', () => {
    expect(marketCardStatus('voided', '2026-10-04T12:00:00.000Z', now)).toBe('voided')
  })
})
