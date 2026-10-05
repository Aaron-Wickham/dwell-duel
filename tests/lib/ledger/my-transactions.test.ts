import { describe, it, expect } from 'vitest'
import type { Lookups } from '@/lib/ledger/list-transactions'
import { coinLabel, listMyTransactions } from '@/lib/ledger/my-transactions'
import { encodeCursor } from '@/lib/pagination/cursor'
import { fakeSupabase } from '../fake-supabase'

const EMPTY: Lookups = { markets: new Map(), outcomes: new Map(), tasks: new Map() }
const FOUND: Lookups = {
  markets: new Map([['m1', 'Will it rain?']]),
  outcomes: new Map([['o1', 'Yes']]),
  tasks: new Map([['t1', 'Read Ruth']]),
}

describe('coinLabel', () => {
  it.each([
    ['starting_grant', 100, {}, 'Starting balance'],
    ['bet_placed', -10, { market_id: 'm1', outcome_id: 'o1' }, 'Bet 10 DC on Yes · Will it rain?'],
    ['bet_won', 26, { market_id: 'm1' }, 'Won 26 DC on Will it rain?'],
    ['bet_voided_refund', 10, { market_id: 'm1' }, 'Refund: market called off · Will it rain?'],
    ['bet_refunded', 10, { market_id: 'm1' }, 'Refund: nobody picked the winner · Will it rain?'],
    ['bet_cancelled', 10, { market_id: 'm1', outcome_id: 'o1' }, 'Refund: cancelled bet on Yes · Will it rain?'],
    ['resolution_reversed', -26, { market_id: 'm1' }, 'Payout taken back: result changed · Will it rain?'],
    ['parlay_placed', -5, {}, 'Parlay 5 DC'],
    ['parlay_won', 20, {}, 'Won 20 DC on a parlay'],
    ['parlay_refunded', 5, {}, 'Refund: parlay called off'],
    ['parlay_reversed', -20, {}, 'Parlay payout taken back: result changed'],
    ['task_completed', 10, { task_id: 't1' }, 'Task reward: Read Ruth'],
    ['admin_adjustment', -15, { reason: 'Claimed twice' }, 'Adjusted by the owner: Claimed twice'],
  ])('labels %s', (type, amount, meta, label) => {
    expect(coinLabel(type, amount, meta, FOUND)).toBe(label)
  })

  it('falls back to wording without names when the lookups are missing (a deleted market or task)', () => {
    expect(coinLabel('bet_placed', -10, { market_id: 'm1', outcome_id: 'o1' }, EMPTY)).toBe('Bet 10 DC')
    expect(coinLabel('bet_won', 26, { market_id: 'm1' }, EMPTY)).toBe('Won 26 DC')
    expect(coinLabel('bet_voided_refund', 10, { market_id: 'm1' }, EMPTY)).toBe('Refund: market called off')
    expect(coinLabel('bet_cancelled', 10, { market_id: 'm1' }, EMPTY)).toBe('Refund: cancelled bet')
    expect(coinLabel('task_completed', 10, { task_id: 't1' }, EMPTY)).toBe('Task reward')
  })

  it('names the market alone when a bet has no outcome label', () => {
    const noOutcome: Lookups = { ...FOUND, outcomes: new Map() }
    expect(coinLabel('bet_placed', -10, { market_id: 'm1', outcome_id: 'o1' }, noOutcome)).toBe('Bet 10 DC on Will it rain?')
  })

  it('leaves off the reason when an adjustment has none', () => {
    expect(coinLabel('admin_adjustment', 5, {}, EMPTY)).toBe('Adjusted by the owner')
  })

  it('reads an unknown type as a plain balance change, never its raw type', () => {
    expect(coinLabel('something_new', 5, {}, EMPTY)).toBe('Balance change')
  })
})

function row(n: number) {
  return {
    id: n,
    amount: -1,
    type: 'bet_placed',
    meta: { market_id: `m${n}`, outcome_id: `o${n}` },
    created_at: `2026-09-26T10:00:00.${String(n).padStart(6, '0')}+00:00`,
  }
}

describe('listMyTransactions', () => {
  it("reads only the member's own rows newest first, probes 50 keys for Show more, and labels each row", async () => {
    const shown = Array.from({ length: 50 }, (_, i) => 200 - i)
    const probed = Array.from({ length: 50 }, (_, i) => 150 - i)
    let reads = 0
    const { client, queries } = fakeSupabase((query) => {
      if (query.table === 'coin_transactions') return { data: (reads++ === 0 ? shown : probed).map(row) }
      const ids = query.in[0][1] as string[]
      const column = query.table === 'market_outcomes' ? 'label' : 'title'
      return { data: ids.map((id) => ({ id, [column]: `Name of ${id}` })) }
    })

    const page = await listMyTransactions(client, 'me', { top: null, bottom: null })

    const [read, probe] = queries.filter((q) => q.table === 'coin_transactions')
    expect(read.select).toBe('id, amount, type, meta, created_at')
    expect(read.eq).toEqual([['profile_id', 'me']])
    expect(read.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(read.limit).toBe(50)
    expect(probe.select).toBe('id, created_at')
    expect(probe.eq).toEqual([['profile_id', 'me']])
    expect(probe.or).toHaveLength(1)
    expect(page.rows[0]).toEqual({
      id: 200,
      amount: -1,
      label: 'Bet 1 DC on Name of o200 · Name of m200',
      createdAt: row(200).created_at,
    })
    expect(page.next).toEqual({
      kind: 'extend',
      cursor: encodeCursor({ ts: row(101).created_at, id: '101' }),
      firstId: '150',
    })
  })
})
