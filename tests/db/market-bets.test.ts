import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient, skipLedgerCheck } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { getMarketBets } from '@/lib/markets/get-market'
import { readPageParams, showMoreHref, type PageParams } from '@/lib/pagination/cursor'

let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient

const FIRST: PageParams = { top: null, bottom: null }

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

describe('getMarketBets', () => {
  it("lists every member's bets on the market, newest first, with names", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Other market' })
    for (const [client, outcomeIndex, amount] of [
      [aliceClient, 0, 10],
      [bobClient, 1, 20],
    ] as const) {
      const { error } = await client.rpc('place_bet', {
        p_market_id: market.marketId,
        p_outcome_id: market.outcomeIds[outcomeIndex],
        p_amount: amount,
      })
      if (error) throw error
    }
    const { error: otherErr } = await bobClient.rpc('place_bet', {
      p_market_id: other.marketId,
      p_outcome_id: other.outcomeIds[0],
      p_amount: 5,
    })
    if (otherErr) throw otherErr

    const page = await getMarketBets(bobClient, market.marketId, FIRST)
    expect(page.rows.map((b) => [b.bettorName, b.profileId, b.outcomeId, b.amount])).toEqual([
      ['Bob', bob.id, market.outcomeIds[1], 20],
      ['Alice', alice.id, market.outcomeIds[0], 10],
    ])
    expect(page.next).toBeNull()
  })

  it('is empty for an uninvited session', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { error } = await aliceClient.rpc('place_bet', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[0],
      p_amount: 10,
    })
    if (error) throw error

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await getMarketBets(carolClient, market.marketId, FIRST)).toEqual({ rows: [], next: null, windowed: false })
  })

  it("pages a busy market's bets 50 at a time, newest first, with nothing skipped or repeated", async () => {
    skipLedgerCheck('the test inserts bets directly, so pool totals stay behind')
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Other market' })
    const start = Date.parse('2026-09-01T00:00:00.000Z')
    // Inserted directly: 75 place_bet calls are slow, and paging never looks at pools. Runs of
    // three share a microsecond timestamp, so page boundaries fall inside ties.
    const rows = Array.from({ length: 75 }, (_, i) => ({
      market_id: i < 70 ? market.marketId : other.marketId,
      outcome_id: i < 70 ? market.outcomeIds[i % 2] : other.outcomeIds[0],
      profile_id: alice.id,
      amount: i + 1,
      created_at: `${new Date(start + Math.floor(i / 3) * 60_000).toISOString().slice(0, 19)}.000123+00:00`,
    }))
    const { error } = await serviceClient().from('bets').insert(rows)
    if (error) throw error

    const first = await getMarketBets(bobClient, market.marketId, FIRST)
    expect(first.rows.map((b) => b.amount)).toEqual(Array.from({ length: 50 }, (_, i) => 70 - i))
    expect(first.next?.kind).toBe('extend')

    const href = new URL(showMoreHref(`/markets/${market.marketId}`, {}, 'bets', first.next!), 'http://localhost')
    const second = await getMarketBets(bobClient, market.marketId, readPageParams(Object.fromEntries(href.searchParams), 'bets'))
    expect(second.rows.map((b) => b.amount)).toEqual(Array.from({ length: 70 }, (_, i) => 70 - i))
    expect(second.next).toBeNull()
  })

  it('reads a garbage bets param as the first page', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { error } = await aliceClient.rpc('place_bet', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[0],
      p_amount: 10,
    })
    if (error) throw error

    const page = await getMarketBets(bobClient, market.marketId, readPageParams({ bets: 'x', bets_from: 'y' }, 'bets'))
    expect(page.rows.map((b) => b.amount)).toEqual([10])
    expect(page.windowed).toBe(false)
  })
})
