import { describe, it, expect } from 'vitest'
import { buildContext, type Lookups } from '@/lib/ledger/list-transactions'

const EMPTY_LOOKUPS: Lookups = { markets: new Map(), outcomes: new Map(), tasks: new Map() }

function lookups(overrides: Partial<Lookups>): Lookups {
  return { ...EMPTY_LOOKUPS, ...overrides }
}

describe('buildContext', () => {
  it('falls back to the type label when the task lookup is missing (e.g. a deleted task)', () => {
    expect(buildContext('task_completed', { task_id: 'missing-task' }, EMPTY_LOOKUPS)).toBe('Task reward')
  })

  it('names the approved task when the lookup has it', () => {
    const found = lookups({ tasks: new Map([['t1', 'Read Genesis 1-3']]) })
    expect(buildContext('task_completed', { task_id: 't1' }, found)).toBe('Task approved: Read Genesis 1-3')
  })

  it('uses the default label + market title for a type with no special-case wording, when a market_id is present', () => {
    const found = lookups({ markets: new Map([['m1', 'Will it rain?']]) })
    expect(buildContext('bet_refunded', { market_id: 'm1' }, found)).toBe('Bet refunded: Will it rain?')
  })

  it('falls back to the bare label for a type with no special case and no market_id', () => {
    expect(buildContext('parlay_refunded', {}, EMPTY_LOOKUPS)).toBe('Parlay refunded')
  })

  it('falls back to the bare label when the default branch\'s market lookup is missing', () => {
    expect(buildContext('bet_voided_refund', { market_id: 'missing-market' }, EMPTY_LOOKUPS)).toBe('Market voided')
  })

  it('gives the parlay lines their own fixed wording, ignoring meta', () => {
    expect(buildContext('parlay_won', {}, EMPTY_LOOKUPS)).toBe('Parlay won')
    expect(buildContext('parlay_placed', {}, EMPTY_LOOKUPS)).toBe('Parlay placed')
  })

  it('quotes the reason on an admin adjustment, and falls back to the label without one', () => {
    expect(buildContext('admin_adjustment', { reason: 'Task was claimed twice' }, EMPTY_LOOKUPS)).toBe(
      'Admin adjustment — “Task was claimed twice”',
    )
    expect(buildContext('admin_adjustment', {}, EMPTY_LOOKUPS)).toBe('Admin adjustment')
  })

  it('names the market and outcome for a bet stake, falling back without both lookups', () => {
    const found = lookups({ markets: new Map([['m1', 'Will it rain?']]), outcomes: new Map([['o1', 'Yes']]) })
    expect(buildContext('bet_placed', { market_id: 'm1', outcome_id: 'o1' }, found)).toBe('Bet on Yes in Will it rain?')
    expect(buildContext('bet_placed', { market_id: 'm1' }, found)).toBe('Bet placed')
  })

  it('names the market for a bet win, falling back to the label without it', () => {
    const found = lookups({ markets: new Map([['m1', 'Will it rain?']]) })
    expect(buildContext('bet_won', { market_id: 'm1' }, found)).toBe('Bet won: Will it rain?')
    expect(buildContext('bet_won', { market_id: 'missing-market' }, EMPTY_LOOKUPS)).toBe('Bet won')
  })

  it('always reads "Starting grant"', () => {
    expect(buildContext('starting_grant', {}, EMPTY_LOOKUPS)).toBe('Starting grant')
  })
})
