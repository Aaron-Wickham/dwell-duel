import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'
import { listMyBets, listMyCancelledBets } from '@/lib/bets/list-my-bets'

const FIRST_PAGE = { top: null, bottom: null }

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const client of [aliceClient, bobClient]) await ensureInvited(client)
})

async function bet(client: SupabaseClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<number> {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
    p_amount: amount,
  })
  if (error) throw error
  const { data, error: readErr } = await serviceClient()
    .from('bets')
    .select('id')
    .eq('market_id', market.marketId)
    .order('id', { ascending: false })
    .limit(1)
    .single()
  if (readErr) throw readErr
  return data.id as number
}

async function closeAndResolve(market: TestMarket, outcomeIndex: number): Promise<void> {
  await serviceClient()
    .from('markets')
    .update({ close_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', market.marketId)
  const { error } = await aliceClient.rpc('resolve_market', {
    p_note: 'Resolved in a test',
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
  })
  if (error) throw error
}

describe('listMyBets', () => {
  it('splits my bets into open and settled, with each settled result', async () => {
    const open = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Still open' })
    const won = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Bob wins' })
    const lost = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Bob loses' })
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Voided' })

    await bet(bobClient, open, 0, 5)
    // Pool 30, winning pool 10: Bob's 10 pays floor(10 × 30 / 10) = 30.
    await bet(bobClient, won, 0, 10)
    await bet(aliceClient, won, 1, 20)
    await bet(bobClient, lost, 1, 7)
    await bet(aliceClient, lost, 0, 3)
    await bet(bobClient, voided, 0, 4)
    // Alice's own bet on the open market must not show up in Bob's list.
    await bet(aliceClient, open, 1, 9)

    await closeAndResolve(won, 0)
    await closeAndResolve(lost, 0)
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: voided.marketId })
    if (voidErr) throw voidErr

    const openPage = await listMyBets(bobClient, bob.id, 'open', FIRST_PAGE)
    expect(openPage.rows.map((b) => [b.marketTitle, b.outcomeLabel, b.amount, b.result])).toEqual([
      ['Still open', 'Yes', 5, { kind: 'open' }],
    ])
    expect(openPage.next).toBeNull()

    const settled = await listMyBets(bobClient, bob.id, 'settled', FIRST_PAGE)
    expect(settled.rows.map((b) => [b.marketTitle, b.result])).toEqual([
      ['Voided', { kind: 'refunded' }],
      ['Bob loses', { kind: 'lost' }],
      ['Bob wins', { kind: 'won', payout: 30 }],
    ])
  })

  it("shows an open market that's past close as awaiting its result", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 5)
    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', market.marketId)

    const page = await listMyBets(bobClient, bob.id, 'open', FIRST_PAGE)
    expect(page.rows.map((b) => b.result)).toEqual([{ kind: 'awaiting' }])
  })
})

describe('listMyCancelledBets', () => {
  it('lists only my cancelled bets, newest first', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Changed my mind' })
    const first = await bet(bobClient, market, 0, 5)
    const second = await bet(bobClient, market, 1, 6)
    const alices = await bet(aliceClient, market, 0, 7)
    for (const [client, id] of [
      [bobClient, first],
      [bobClient, second],
      [aliceClient, alices],
    ] as const) {
      const { error } = await client.rpc('cancel_bet', { p_bet_id: id })
      if (error) throw error
    }

    const page = await listMyCancelledBets(bobClient, bob.id, FIRST_PAGE)
    expect(page.rows.map((b) => [b.id, b.marketTitle, b.outcomeLabel, b.amount])).toEqual([
      [second, 'Changed my mind', 'No', 6],
      [first, 'Changed my mind', 'Yes', 5],
    ])

    // Cancelled bets are gone from the live lists.
    expect((await listMyBets(bobClient, bob.id, 'open', FIRST_PAGE)).rows).toEqual([])
  })
})
