import { describe, it, expect, beforeEach } from 'vitest'
import { anonClient, clientFor, createTestMarket, ensureInvited, giveRole, insertLockedParlay, makeMember, seedMembers, backers, type Member, type TestMarket } from './fixtures'
import { rpcLoose, serviceClient, setBalanceViaLedger, type TestClient } from './helpers'
import { expectError } from './assertions'
import { lockedOddsToBp } from '@/lib/parlays/odds'

// 0074: parlays stay house-paid, and each leg is priced from real money when its market closes or
// settles, whichever comes first. Alice creates and resolves (as an admin, before close) every
// market unless a test says otherwise; Bob places the parlays; Backer1 and Backer2 are the other
// members whose money prices the legs.
let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient
let backer1: TestClient
let backer2: TestClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
  await giveRole(alice, 'admin')
  const both = await backers()
  for (const { id } of both) await setBalanceViaLedger(id, 2000)
  ;[backer1, backer2] = both.map((b) => b.client)
})

async function bet(client: TestClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<number> {
  const { error } = await client.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[outcomeIndex], p_amount: amount })
  if (error) throw error
  const { data } = await serviceClient().from('bets').select('id').eq('market_id', market.marketId).order('id', { ascending: false }).limit(1).single()
  return data!.id as number
}

async function resolve(market: TestMarket, outcomeIndex: number): Promise<void> {
  const { error } = await aliceClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: market.marketId, p_outcome_id: market.outcomeIds[outcomeIndex] })
  if (error) throw error
}

async function placeParlay(outcomeIds: string[], stake: number): Promise<string> {
  const { data, error } = await bobClient.rpc('place_parlay', { p_outcome_ids: outcomeIds, p_stake: stake })
  if (error) throw error
  return data as string
}

async function parlayRow(id: string) {
  const { data, error } = await serviceClient().from('parlays').select('status, credited').eq('id', id).single()
  if (error) throw error
  return data
}

async function legOdds(parlayId: string, market: TestMarket): Promise<number | null> {
  const { data, error } = await serviceClient().from('parlay_legs').select('locked_odds').eq('parlay_id', parlayId).eq('market_id', market.marketId).single()
  if (error) throw error
  return data.locked_odds === null ? null : Number(data.locked_odds)
}

async function closeNow(market: TestMarket): Promise<void> {
  const { error } = await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', market.marketId)
  if (error) throw error
}

// Backer1 on the first outcome, Backer2 on the second.
async function coinFlip(title: string, yes = 25, no = 25): Promise<TestMarket> {
  const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title, seed: 20 })
  if (yes > 0) await bet(backer1, market, 0, yes)
  if (no > 0) await bet(backer2, market, 1, no)
  return market
}

describe('legs on markets the bettor created, or nobody has bet on', () => {
  it('can’t use markets the bettor created, however much others have bet on them', async () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const own = await Promise.all(['Day one', 'Day two', 'Day three'].map((title) => createTestMarket(bobClient, days, { title, seed: 20 })))
    for (const m of own) {
      await bet(backer1, m, 1, 30)
      await bet(backer2, m, 2, 30)
    }
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: own.map((m) => m.outcomeIds[0]), p_stake: 10 })
    expectError(error, /^'Day (one|two|three)' is your own market, so it can't be a parlay pick$/)
  })

  it('can’t use someone else’s markets that nobody has bet on: the seed gives a leg no odds', async () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const empty = await Promise.all(['Day one', 'Day two', 'Day three'].map((title) => createTestMarket(aliceClient, days, { title, seed: 20 })))
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: empty.map((m) => m.outcomeIds[0]), p_stake: 10 })
    expectError(error, 'needs at least 50 DC from 2 other members before it can be a parlay pick')
  })
})

describe('legs on copies of one market', () => {
  it('multiply up to the caps and no further', async () => {
    // Six copies of one coin flip (the most a parlay takes since 0104), each with the floor: 2^6 = 64x uncapped.
    const copies: TestMarket[] = []
    for (let i = 1; i <= 6; i++) copies.push(await coinFlip(`Coin flip ${i}`))
    const id = await placeParlay(copies.map((m) => m.outcomeIds[0]), 100)
    for (const m of copies) await resolve(m, 0)
    // 20x of 100 is 2,000, and a parlay pays at most 1,000.
    expect(await parlayRow(id)).toEqual({ status: 'won', credited: 1000 })
  })
})

describe('pricing at close', () => {
  it('prices a leg from the pool at close, so a bet cancelled after placement can’t raise the payout', async () => {
    const a = await coinFlip('A', 25, 500)
    const b = await coinFlip('B', 25, 500)
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)

    // With 500 on No, each Yes would be 525 / 25 = 21x, shown at the 5x leg cap.
    const { data: before } = await bobClient.rpc('parlay_leg_odds', { p_parlay_ids: [id] })
    expect(before!.map((l) => lockedOddsToBp(l.odds))).toEqual([50_000, 50_000])

    // Backer2 takes the 500 back and leaves 25, so each Yes is 50 / 25 = 2x at close.
    for (const m of [a, b]) {
      const { data: big } = await serviceClient().from('bets').select('id').eq('market_id', m.marketId).eq('amount', 500).single()
      const { error } = await backer2.rpc('cancel_bet', { p_bet_id: big!.id })
      if (error) throw error
      await bet(backer2, m, 1, 25)
    }
    await resolve(a, 0)
    await resolve(b, 0)
    expect(await legOdds(id, a)).toBe(2)
    expect(await parlayRow(id)).toEqual({ status: 'won', credited: 40 })
  })

  it('sets a leg’s odds when its market closes, before it resolves, and they don’t move after', async () => {
    const a = await coinFlip('A', 25, 75)
    const b = await coinFlip('B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)
    expect(await legOdds(id, a)).toBeNull()

    // A closes; resolving B settles the parlay, which prices A's leg from its now-final pool.
    await closeNow(a)
    await resolve(b, 0)
    expect(await legOdds(id, a)).toBe(4)
    const { error } = await backer2.rpc('place_bet', { p_market_id: a.marketId, p_outcome_id: a.outcomeIds[1], p_amount: 5 })
    expectError(error, 'market is not open for betting')

    await resolve(a, 0)
    expect(await legOdds(id, a)).toBe(4)
    expect(await parlayRow(id)).toEqual({ status: 'won', credited: 80 })
  })

  it('sets a leg’s odds when an admin resolves its market before close', async () => {
    const a = await coinFlip('A', 20, 60)
    const b = await coinFlip('B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)
    await resolve(a, 0)
    expect(await legOdds(id, a)).toBe(4)
    expectError((await backer2.rpc('place_bet', { p_market_id: a.marketId, p_outcome_id: a.outcomeIds[1], p_amount: 5 })).error, 'market is not open for betting')
  })

  it('counts a leg 1.00x when its market no longer has the floor at close, but it must still win', async () => {
    const a = await coinFlip('A')
    const b = await coinFlip('B')
    const c = await coinFlip('C')
    const won = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)
    const lost = await placeParlay([c.outcomeIds[1], b.outcomeIds[0]], 10)

    // Backer2 cancels on A and C, leaving 25 DC from one member on each.
    for (const m of [a, c]) {
      const { data: theirs } = await serviceClient().from('bets').select('id').eq('market_id', m.marketId).eq('outcome_id', m.outcomeIds[1]).single()
      const { error } = await backer2.rpc('cancel_bet', { p_bet_id: theirs!.id })
      if (error) throw error
    }
    for (const m of [a, b]) await resolve(m, 0)
    await resolve(c, 0)

    expect(await legOdds(won, a)).toBe(1)
    expect(await parlayRow(won)).toEqual({ status: 'won', credited: 20 })
    expect(await legOdds(lost, c)).toBe(1)
    expect(await parlayRow(lost)).toEqual({ status: 'lost', credited: 0 })
  })

  it('counts a leg 1.00x when nobody else backed the pick at close', async () => {
    const a = await coinFlip('A', 0, 0)
    await bet(backer1, a, 1, 25)
    await bet(backer2, a, 1, 25)
    const b = await coinFlip('B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)
    await resolve(a, 0)
    await resolve(b, 0)
    expect(await legOdds(id, a)).toBe(1)
    expect(await parlayRow(id)).toEqual({ status: 'won', credited: 20 })
  })
})

describe('parlays placed before 0074', () => {
  it('keep their locked odds under the 20x and 1,000 DC caps, and get at least their stake back', async () => {
    await setBalanceViaLedger(bob.id, 3000)
    const a = await coinFlip('A')
    const b = await coinFlip('B')
    // Locked at 6.00x each when placed; at close the pools would give 2x.
    const legs = [
      { market: a, outcomeIndex: 0, lockedOdds: 6 },
      { market: b, outcomeIndex: 0, lockedOdds: 6 },
    ]
    const small = await insertLockedParlay(bob.id, 10, legs)
    const capped = await insertLockedParlay(bob.id, 60, legs)
    const large = await insertLockedParlay(bob.id, 1500, legs.map((l) => ({ ...l, lockedOdds: 2 })))
    await resolve(a, 0)
    await resolve(b, 0)

    expect(await legOdds(small, a)).toBe(6)
    // 36x is capped to 20x: 200.
    expect(await parlayRow(small)).toEqual({ status: 'won', credited: 200 })
    // 60 x 20 = 1,200, over the payout cap.
    expect(await parlayRow(capped)).toEqual({ status: 'won', credited: 1000 })
    // A stake above the cap still gets at least its stake back on a win.
    expect(await parlayRow(large)).toEqual({ status: 'won', credited: 1500 })
  })
})

describe('a leg on a thin pick', () => {
  it('counts at most 5x, however little others put on the pick', async () => {
    // 1 DC on Yes against 49 on No meets the floor, and would price Yes at 50x.
    const a = await coinFlip('A', 1, 49)
    const b = await coinFlip('B')
    const id = await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)
    const { data: quotes } = await bobClient.rpc('pick_quotes', { p_outcome_ids: [a.outcomeIds[0]] })
    expect(quotes![0].odds).toBe(5)
    await resolve(a, 0)
    await resolve(b, 0)
    expect(await legOdds(id, a)).toBe(5)
    expect(await parlayRow(id)).toEqual({ status: 'won', credited: 100 })
  })
})

describe('one member’s exposure on a market', () => {
  it('refuses another parlay on a market once the member’s parlays on it could pay 1,000 DC', async () => {
    const a = await coinFlip('A')
    const b = await coinFlip('B')
    const c = await coinFlip('C')
    const d = await coinFlip('D')
    // Each 10 DC parlay could pay at most 200 (20x), so five of them reach 1,000.
    for (let i = 0; i < 5; i++) await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 10)
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], c.outcomeIds[0]], p_stake: 10 })
    expectError(error, "your parlays with 'A' in them could already pay 1000 DC, and one member's parlays on a market can pay at most 1000 DC in all")
    // Markets none of them touch are still open to a parlay.
    await placeParlay([c.outcomeIds[0], d.outcomeIds[0]], 10)
  })

  it('stops counting a parlay once it has settled', async () => {
    const a = await coinFlip('A')
    const b = await coinFlip('B')
    const c = await coinFlip('C')
    await placeParlay([a.outcomeIds[0], b.outcomeIds[0]], 50)
    expectError((await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], c.outcomeIds[0]], p_stake: 1 })).error, 'could already pay 1000 DC')
    await resolve(b, 1)
    await placeParlay([a.outcomeIds[0], c.outcomeIds[0]], 1)
  })
})

describe('the quote readers', () => {
  it('are for invited members only, and the pricing function behind them for nobody', async () => {
    const a = await coinFlip('A')
    const uninvited = await clientFor(await makeMember('Dave'))
    for (const client of [uninvited, anonClient()]) {
      expect((await client.rpc('pick_quotes', { p_outcome_ids: a.outcomeIds })).error?.code).toBe('42501')
      expect((await client.rpc('parlay_leg_odds', { p_parlay_ids: [] })).error?.code).toBe('42501')
    }
    const { error } = await rpcLoose(bobClient, 'pick_quote', { p_profile_id: bob.id, p_outcome_id: a.outcomeIds[0] })
    expectError(error, { code: '42501', message: 'permission denied for function pick_quote' })
  })

  it('give a member each pick’s leg odds and the floor from their own side', async () => {
    const a = await coinFlip('A', 20, 30)
    await bet(bobClient, a, 1, 40)
    const { data, error } = await bobClient.rpc('pick_quotes', { p_outcome_ids: [a.outcomeIds[0], a.outcomeIds[1]] })
    expect(error).toBeNull()
    const byOutcome = Object.fromEntries(data!.map((q) => [q.outcome_id, q]))
    expect(byOutcome[a.outcomeIds[0]]).toMatchObject({ others_total: 50, others_on_pick: 20, other_bettors: 2, meets_floor: true, own_market: false, odds: 2.5 })
    expect(byOutcome[a.outcomeIds[1]]).toMatchObject({ others_total: 50, others_on_pick: 30, other_bettors: 2, meets_floor: true, odds: 1.6666 })
  })
})
