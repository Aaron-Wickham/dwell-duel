import { describe, it, expect, vi } from 'vitest'
import { monthLabel, readEconomySummary, toEconomySummary, type EconomySummaryRow } from '@/lib/economy/summary'
import type { DbClient } from '@/lib/supabase/database'

const ROW: EconomySummaryRow = {
  month_start: '2026-09-01T04:00:00+00:00',
  month_end: '2026-10-01T04:00:00+00:00',
  balances: 325,
  bets_at_stake: '12',
  parlays_at_stake: 4,
  starting_grants_added: 300,
  task_rewards_added: 10,
  seed_payouts_added: 8,
  seed_payouts_removed: 22,
  payout_rounding_added: 1,
  payout_rounding_removed: 4,
  house_parlays_added: 30,
  house_parlays_removed: 5,
  owner_adjustments_added: 25,
  owner_adjustments_removed: 5,
  all_time_added: 377,
  all_time_removed: 36,
  unclassified: 0,
}

describe('toEconomySummary', () => {
  it('adds balances and both at-stake figures into what is in circulation', () => {
    const s = toEconomySummary(ROW)
    expect(s.inCirculation).toBe(341)
    expect(s.betsAtStake).toBe(12)
  })

  it('lists the sources in order, with no removed figure for grants or task rewards', () => {
    const s = toEconomySummary(ROW)
    expect(s.sources.map((x) => [x.label, x.added, x.removed])).toEqual([
      ['Starting grants', 300, null],
      ['Task rewards', 10, null],
      ['Seed payouts (older results)', 8, 22],
      ['Payout rounding', 1, 4],
      ['House-paid parlays', 30, 5],
      ['Owner adjustments', 25, 5],
    ])
    expect(s.monthAdded).toBe(374)
    expect(s.monthRemoved).toBe(36)
  })

  it('leaves out the seed row in a month no older result was paid or overridden', () => {
    const s = toEconomySummary({ ...ROW, seed_payouts_added: 0, seed_payouts_removed: 0 })
    expect(s.sources.map((x) => x.key)).not.toContain('seed_payouts')
    expect(s.sources.map((x) => x.key)).toContain('payout_rounding')
  })

  it('reports how far the all-time totals are from what is in circulation', () => {
    expect(toEconomySummary(ROW).discrepancy).toBe(0)
    expect(toEconomySummary({ ...ROW, all_time_added: 384 }).discrepancy).toBe(7)
  })
})

describe('readEconomySummary', () => {
  it('asks for the month `now` falls in and throws the RPC’s error', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: new Error('only the owner can see the economy') })
    const rpc = vi.fn(() => ({ single }))
    const supabase = { rpc } as unknown as DbClient
    await expect(readEconomySummary(supabase, new Date('2026-09-28T12:00:00Z'))).rejects.toThrow(
      'only the owner can see the economy',
    )
    expect(rpc).toHaveBeenCalledWith('economy_summary', { p_month_start: '2026-09-28T12:00:00.000Z' })
  })
})

describe('monthLabel', () => {
  it('names the Eastern month, even though its first instant is the 1st at 04:00 UTC', () => {
    expect(monthLabel('2026-09-01T04:00:00+00:00')).toBe('September 2026')
    expect(monthLabel('2026-03-01T05:00:00+00:00')).toBe('March 2026')
  })
})
