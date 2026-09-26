import { describe, it, expect } from 'vitest'
import { marketCardStatus, chartClosedAt } from '@/lib/markets/market-status'

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

describe('chartClosedAt', () => {
  it('uses the close time for an open market', () => {
    expect(chartClosedAt('open', '2026-10-04T12:00:00.000Z', null)).toBe('2026-10-04T12:00:00.000Z')
  })

  it('uses the close time for a voided market', () => {
    expect(chartClosedAt('voided', '2026-10-04T12:00:00.000Z', null)).toBe('2026-10-04T12:00:00.000Z')
  })

  it('uses the close time for a resolved market that closed on schedule', () => {
    expect(chartClosedAt('resolved', '2026-09-21T09:00:00.000Z', '2026-09-21T09:05:00.000Z')).toBe('2026-09-21T09:00:00.000Z')
  })

  it('uses the resolution time for a market resolved before its close time', () => {
    expect(chartClosedAt('resolved', '2026-10-04T12:00:00.000Z', '2026-10-01T09:00:00.000Z')).toBe('2026-10-01T09:00:00.000Z')
  })
})
