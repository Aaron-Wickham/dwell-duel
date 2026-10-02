import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { decodeCursor } from '@/lib/pagination/cursor'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket, giveRole, backLeg, cancelBetForHistory } from './fixtures'
import { listMyCancelledBets } from '@/lib/bets/list-my-bets'
import { listMyWagers, type Wager, type WagerBucket } from '@/lib/bets/list-my-wagers'

const FIRST_PAGE = { top: null, bottom: null }

// Bob's solo bets on one My bets tab.
async function myBets(bucket: WagerBucket) {
  const page = await listMyWagers(bobClient, bob.id, bucket, FIRST_PAGE)
  return { ...page, rows: page.rows.flatMap((w) => (w.kind === 'bet' ? [w.bet] : [])) }
}

let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const client of [aliceClient, bobClient]) await ensureInvited(client)
  // Alice bets and resolves in these tests; only an admin may resolve a market they've bet on (0046).
  await giveRole(alice, 'admin')
})

async function bet(client: TestClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<number> {
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

describe('listMyWagers: solo bets', () => {
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
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: voided.marketId, p_reason: 'Voided in a test' })
    if (voidErr) throw voidErr

    const openPage = await myBets('open')
    expect(openPage.rows.map((b) => [b.marketTitle, b.outcomeLabel, b.amount, b.result])).toEqual([
      ['Still open', 'Yes', 5, { kind: 'open' }],
    ])
    expect(openPage.next).toBeNull()

    const settled = await myBets('settled')
    expect(settled.rows.map((b) => [b.marketTitle, b.result])).toEqual([
      ['Voided', { kind: 'refunded', reason: 'voided' }],
      ['Bob loses', { kind: 'lost' }],
      ['Bob wins', { kind: 'won', payout: 30 }],
    ])
  })

  it('shows a bet as refunded, not lost, when nobody backed the winning outcome (#193)', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Nobody picked No', seed: 20 })
    await bet(bobClient, market, 0, 10)
    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()
    await closeAndResolve(market, 1)
    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()

    // resolve_market_core refunds every stake when the winning pool is 0, seed or no seed.
    expect(after!.balance - before!.balance).toBe(10)
    const settled = await myBets('settled')
    expect(settled.rows.map((b) => [b.marketTitle, b.result])).toEqual([['Nobody picked No', { kind: 'refunded', reason: 'no_winners' }]])
  })

  it('reports a win on a seeded market as what resolve_market actually paid', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Seeded', seed: 20 })
    await bet(bobClient, market, 0, 10)
    await bet(aliceClient, market, 1, 20)
    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()
    await closeAndResolve(market, 0)
    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()

    // The real pool, the seed left out: floor(10 × 30 / 10) = 30.
    const settled = await myBets('settled')
    expect(settled.rows.map((b) => b.result)).toEqual([{ kind: 'won', payout: 30 }])
    expect(after!.balance - before!.balance).toBe(30)
  })

  it("shows an open market that's past close as awaiting its result", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 5)
    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', market.marketId)

    const page = await myBets('open')
    expect(page.rows.map((b) => b.result)).toEqual([{ kind: 'awaiting' }])
  })
})

describe('listMyCancelledBets', () => {
  it('lists only my cancelled bets, newest first', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Changed my mind' })
    const first = await bet(bobClient, market, 0, 5)
    const second = await bet(bobClient, market, 1, 6)
    const alices = await bet(aliceClient, market, 0, 7)
    for (const id of [first, second, alices]) await cancelBetForHistory(id)

    const page = await listMyCancelledBets(bobClient, bob.id, FIRST_PAGE)
    expect(page.rows.map((b) => [b.id, b.marketTitle, b.outcomeLabel, b.amount])).toEqual([
      [second, 'Changed my mind', 'No', 6],
      [first, 'Changed my mind', 'Yes', 5],
    ])

    // Cancelled bets are gone from the live lists.
    expect((await myBets('open')).rows).toEqual([])
  })
})

describe('listMyWagers: bets and parlays together', () => {
  const label = (w: Wager) => (w.kind === 'bet' ? `bet ${w.bet.marketTitle}` : `parlay of ${w.parlay.legs.length}`)

  it('mixes solo bets and parlays newest first, each on the tab its state puts it', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'A', seed: 20 })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'B', seed: 20 })
    await bet(bobClient, a, 0, 5)
    await backLeg(a, 1)
    await backLeg(b, 0)
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[1]], p_stake: 4 })
    if (error) throw error
    await bet(bobClient, b, 0, 3)

    const open = await listMyWagers(bobClient, bob.id, 'open', FIRST_PAGE)
    expect(open.rows.map(label)).toEqual(['bet B', 'parlay of 2', 'bet A'])
    expect(open.rows.map((w) => w.key)).toEqual([expect.stringMatching(/^bet:\d+$/), expect.stringMatching(/^parlay:[0-9a-f-]{36}$/), expect.stringMatching(/^bet:\d+$/)])

    // A losing leg settles the parlay; the solo bet on B settles with its market.
    await closeAndResolve(b, 0)
    expect((await listMyWagers(bobClient, bob.id, 'open', FIRST_PAGE)).rows.map(label)).toEqual(['bet A'])
    expect((await listMyWagers(bobClient, bob.id, 'settled', FIRST_PAGE)).rows.map(label)).toEqual(['bet B', 'parlay of 2'])

    // Alice's own list holds none of Bob's.
    expect((await listMyWagers(aliceClient, alice.id, 'open', FIRST_PAGE)).rows).toEqual([])
  })

  it('pages across both kinds with Show more, and ignores a cursor that names neither', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    for (const m of [market, other]) await backLeg(m, 1)
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [market.outcomeIds[0], other.outcomeIds[0]], p_stake: 2 })
    if (error) throw error
    for (let i = 0; i < 50; i++) await bet(bobClient, market, i % 2, 1)

    const first = await listMyWagers(bobClient, bob.id, 'open', FIRST_PAGE)
    expect(first.rows).toHaveLength(50)
    expect(first.rows.every((w) => w.kind === 'bet')).toBe(true)
    expect(first.next).toMatchObject({ kind: 'extend', firstId: expect.stringMatching(/^parlay:/) })

    const more = await listMyWagers(bobClient, bob.id, 'open', { top: null, bottom: decodeCursor(first.next!.cursor) })
    expect(more.rows).toHaveLength(51)
    expect(more.rows.at(-1)?.kind).toBe('parlay')
    expect(more.next).toBeNull()

    const bogus = await listMyWagers(bobClient, bob.id, 'open', { top: null, bottom: { ts: new Date().toISOString(), id: 'task:1' } })
    expect(bogus.rows).toHaveLength(50)
  })
})
