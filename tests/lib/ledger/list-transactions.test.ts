import { describe, it, expect } from 'vitest'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { encodeCursor } from '@/lib/pagination/cursor'
import { fakeSupabase, type RecordedQuery } from '../fake-supabase'

function ledgerRow(n: number) {
  return {
    id: n,
    profile_id: 'p1',
    amount: -1,
    type: 'bet_placed',
    meta: { market_id: `m${n}`, outcome_id: `o${n}` },
    created_at: `2026-09-26T10:00:00.${String(n).padStart(6, '0')}+00:00`,
    profiles: { display_name: 'Mia' },
  }
}

// Answers the ledger's range read with `shown`, its key probe with `probed`, and every lookup with
// a title for each id it asked for.
function fakeLedger(shown: number[], probed: number[]) {
  let ledgerReads = 0
  return fakeSupabase((query) => {
    if (query.table === 'coin_transactions') {
      ledgerReads++
      return { data: (ledgerReads === 1 ? shown : probed).map(ledgerRow) }
    }
    const ids = query.in[0][1] as string[]
    const column = query.table === 'market_outcomes' ? 'label' : 'title'
    return { data: ids.map((id) => ({ id, [column]: `Name of ${id}` })) }
  })
}

const lookupIds = (queries: RecordedQuery[], table: string) =>
  queries.filter((q) => q.table === table).flatMap((q) => q.in[0][1] as string[])

describe('listAllTransactions', () => {
  it('reads 50 rows newest first, then probes 50 older ones for the Show more cursor', async () => {
    const shown = Array.from({ length: 50 }, (_, i) => 200 - i)
    const probed = Array.from({ length: 50 }, (_, i) => 150 - i)
    const { client, queries } = fakeLedger(shown, probed)

    const page = await listAllTransactions(client, { top: null, bottom: null })

    const [read, probe] = queries.filter((q) => q.table === 'coin_transactions')
    expect(read.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(read.limit).toBe(50)
    expect(read.or).toEqual([])
    expect(probe.limit).toBe(50)
    expect(probe.or).toHaveLength(1)
    expect(page.rows.map((e) => e.id)).toEqual(shown)
    expect(page.rows[0]).toMatchObject({ memberName: 'Mia', context: 'Bet on Name of o200 in Name of m200' })
    expect(page.next).toEqual({ kind: 'extend', cursor: encodeCursor({ ts: ledgerRow(101).created_at, id: '101' }) })
  })

  it('looks up names only for the rows shown, never the probed ones', async () => {
    const { client, queries } = fakeLedger(
      Array.from({ length: 50 }, (_, i) => 200 - i),
      Array.from({ length: 50 }, (_, i) => 150 - i),
    )
    await listAllTransactions(client, { top: null, bottom: null })

    const marketIds = lookupIds(queries, 'markets')
    expect(marketIds).toHaveLength(50)
    expect(marketIds).not.toContain('m150')
  })

  it('splits the lookups for a long range into chunks of at most 50 ids', async () => {
    const shown = Array.from({ length: 120 }, (_, i) => 500 - i)
    const { client, queries } = fakeLedger(shown, [])
    const bottom = { ts: ledgerRow(381).created_at, id: '381' }

    const page = await listAllTransactions(client, { top: null, bottom })

    expect(queries[0].limit).toBe(500)
    for (const table of ['markets', 'market_outcomes']) {
      const reads = queries.filter((q) => q.table === table)
      expect(reads.map((q) => (q.in[0][1] as string[]).length)).toEqual([50, 50, 20])
    }
    expect(queries.some((q) => q.table === 'tasks')).toBe(false)
    expect(page.rows).toHaveLength(120)
    expect(page.rows.at(-1)?.context).toBe('Bet on Name of o381 in Name of m381')
    expect(page.next).toBeNull()
  })

  it('throws when a lookup fails, so the error page shows rather than a ledger missing its names', async () => {
    const { client } = fakeSupabase((query) =>
      query.table === 'coin_transactions' ? { data: [ledgerRow(1)] } : { error: new Error('lookup failed') },
    )
    await expect(listAllTransactions(client, { top: null, bottom: null })).rejects.toThrow('lookup failed')
  })
})
