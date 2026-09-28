import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'
import { pgQuery } from './pg-query'
import { getSlipView } from '@/lib/parlays/get-slip'
import { describeCreatorStake, getCreatorStakes } from '@/lib/markets/creator-stakes'
import { listMembers } from '@/lib/members/list-members'

// 0046: the release 0.3 security batch. Each block reproduces the hole it closes.
let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const c of [aliceClient, bobClient]) await ensureInvited(c)
  await serviceClient().from('profiles').update({ balance: 3000 }).eq('id', bob.id)
})

async function bet(client: SupabaseClient, market: TestMarket, index: number, amount: number): Promise<number> {
  const { error } = await client.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[index], p_amount: amount })
  if (error) throw error
  const { data } = await serviceClient().from('bets').select('id').eq('market_id', market.marketId).order('id', { ascending: false }).limit(1).single()
  return data!.id as number
}

async function close(market: TestMarket): Promise<void> {
  await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', market.marketId)
}

async function member(name: string, role: 'member' | 'reviewer' | 'admin'): Promise<{ member: Member; client: SupabaseClient }> {
  const m = await makeMember(name)
  if (role !== 'member') await serviceClient().from('profiles').update({ role }).eq('id', m.id)
  const client = await clientFor(m)
  await ensureInvited(client)
  return { member: m, client }
}

const resolve = (client: SupabaseClient, market: TestMarket, index = 0) =>
  client.rpc('resolve_market', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[index], p_note: 'Checked' })

describe('#57 parlay legs lock without your own stakes', () => {
  it("can't be pumped by betting against yourself and cancelling", async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const pumpA = await bet(bobClient, a, 0, 1000)
    const pumpB = await bet(bobClient, b, 0, 1000)

    const { data: parlayId, error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[1], b.outcomeIds[1]], p_stake: 10 })
    expect(error).toBeNull()
    for (const id of [pumpA, pumpB]) await bobClient.rpc('cancel_bet', { p_bet_id: id })

    const { data: legs } = await serviceClient().from('parlay_legs').select('locked_odds').eq('parlay_id', parlayId as string)
    // Without Bob's 1000s, each market is just its seed: 40 / 20 = 2.00, not 52.
    expect(legs!.map((l) => Number(l.locked_odds))).toEqual([2, 2])
  })

  it("still moves with everyone else's money", async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await bet(aliceClient, a, 0, 60)
    const { data: parlayId } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[1], b.outcomeIds[1]], p_stake: 10 })
    const { data: legs } = await serviceClient().from('parlay_legs').select('market_id, locked_odds').eq('parlay_id', parlayId as string)
    // A's No: (60 + 40) / 20 = 5.00.
    expect(Number(legs!.find((l) => l.market_id === a.marketId)!.locked_odds)).toBe(5)
  })

  it('shows the same odds in the slip before you place it', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await bet(bobClient, a, 0, 1000)
    const view = await getSlipView(bobClient, [
      { outcomeId: a.outcomeIds[1], parlay: true },
      { outcomeId: b.outcomeIds[1], parlay: true },
    ], bob.id)
    expect(view.picks.map((p) => p.oddsBp)).toEqual([20_000, 20_000])
    // Alice's view of the same leg still counts Bob's money: (1000 + 40) / 20 = 52.00.
    const aliceView = await getSlipView(aliceClient, [{ outcomeId: a.outcomeIds[1], parlay: true }], alice.id)
    expect(aliceView.picks[0].oddsBp).toBe(520_000)
  })

  it('leaves out your singles placed in the same slip', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const { data: parlayId, error } = await bobClient.rpc('place_slip', {
      p_singles: [{ outcome_id: a.outcomeIds[0], amount: 500 }],
      p_parlay_outcome_ids: [a.outcomeIds[1], b.outcomeIds[1]],
      p_parlay_stake: 10,
    })
    expect(error).toBeNull()
    const { data: legs } = await serviceClient().from('parlay_legs').select('locked_odds').eq('parlay_id', parlayId as string)
    expect(legs!.map((l) => Number(l.locked_odds))).toEqual([2, 2])
  })
})

describe('#58 nobody but an admin resolves a market they have a stake in', () => {
  it('stops a creator who bet on their own market', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await bet(aliceClient, m, 0, 10)
    await close(m)
    expect((await resolve(aliceClient, m)).error?.message).toBe('you have a stake in this market, so someone else resolves it')
    expect((await aliceClient.rpc('can_resolve_market', { p_market_id: m.marketId })).data).toBe(false)
  })

  it('counts a pending parlay leg as a stake', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const other = await createTestMarket(bobClient, ['Yes', 'No'], { seed: 20 })
    const { error } = await aliceClient.rpc('place_parlay', { p_outcome_ids: [m.outcomeIds[0], other.outcomeIds[0]], p_stake: 5 })
    if (error) throw error
    await close(m)
    expect((await resolve(aliceClient, m)).error?.message).toBe('you have a stake in this market, so someone else resolves it')
  })

  it('still lets a creator with no stake resolve after close, and not before', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await bet(bobClient, m, 0, 10)
    expect((await resolve(aliceClient, m)).error?.message).toBe('market has not closed yet')
    await close(m)
    expect((await aliceClient.rpc('can_resolve_market', { p_market_id: m.marketId })).data).toBe(true)
    expect((await resolve(aliceClient, m)).error).toBeNull()
  })

  it('lets a reviewer with no stake resolve after close, but not one who bet', async () => {
    const { client: rita } = await member('Rita', 'reviewer')
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await bet(aliceClient, m, 0, 10)
    expect((await resolve(rita, m)).error?.message).toBe('market has not closed yet')
    await close(m)
    expect((await resolve(rita, m)).error).toBeNull()

    const n = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await bet(rita, n, 1, 5)
    await close(n)
    expect((await resolve(rita, n)).error?.message).toBe('you have a stake in this market, so someone else resolves it')
  })

  it('lets an admin resolve a market they bet on, even before close', async () => {
    const { client: ada } = await member('Ada', 'admin')
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await bet(ada, m, 0, 10)
    expect((await resolve(ada, m)).error).toBeNull()
  })

  it("won't let a plain member who isn't the creator resolve", async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await close(m)
    expect((await resolve(bobClient, m)).error?.message).toBe('only the market creator, a reviewer or an admin can resolve this market')
  })
})

describe('#59 task rewards are capped at 500 DC', () => {
  it('refuses a larger reward, even from an admin writing the table directly', async () => {
    const { client: ada } = await member('Ada', 'admin')
    const insert = (reward: number) => ada.from('tasks').insert({ title: `Reward ${reward}`, reward_amount: reward, is_repeatable: false, period: null })
    expect((await insert(500)).error).toBeNull()
    expect((await insert(501)).error?.code).toBe('23514')
  })
})

describe('#60 members can no longer read each other’s emails', () => {
  it('hides the email column from members, but keeps the rest of the profile', async () => {
    const { error } = await bobClient.from('profiles').select('email')
    expect(error?.code).toBe('42501')
    const { data, error: readErr } = await bobClient.from('profiles').select('id, display_name, balance, role')
    expect(readErr).toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(2)
  })

  it('gives admins the emails through member_emails(), and refuses everyone else', async () => {
    const { client: ada } = await member('Ada', 'admin')
    const { data, error } = await ada.rpc('member_emails', { p_ids: [alice.id, bob.id] })
    expect(error).toBeNull()
    expect(new Set((data as { email: string }[]).map((r) => r.email))).toEqual(new Set([alice.email, bob.email]))
    expect((await bobClient.rpc('member_emails', { p_ids: [alice.id] })).error?.message).toBe('only an admin can see member emails')
  })
})

describe('#62 hardening', () => {
  it('checks the invite gate on place_bet and cancel_bet', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const betId = await bet(bobClient, m, 0, 10)
    await serviceClient().from('allowed_emails').delete().eq('email', bob.email)
    const placed = await bobClient.rpc('place_bet', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[0], p_amount: 5 })
    expect(placed.error?.message).toBe('not invited')
    expect((await bobClient.rpc('cancel_bet', { p_bet_id: betId })).error?.message).toBe('not invited')
  })

  it("fixes a market's title once someone else has bet, but not its description", async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20, title: 'Will it rain?' })
    await bet(aliceClient, m, 0, 5)
    // The creator's own bet doesn't lock it.
    expect((await aliceClient.rpc('update_market', { p_market_id: m.marketId, p_title: 'Will it rain Sunday?', p_description: null })).error).toBeNull()

    await bet(bobClient, m, 1, 5)
    const retitle = await aliceClient.rpc('update_market', { p_market_id: m.marketId, p_title: 'Will it snow?', p_description: null })
    expect(retitle.error?.message).toBe("others have bet on this market, so its title can't change")
    const describe = await aliceClient.rpc('update_market', { p_market_id: m.marketId, p_title: 'Will it rain Sunday?', p_description: 'Before noon.' })
    expect(describe.error).toBeNull()
  })

  it('lists only proof files older than a day that nothing attached, for the service role only', async () => {
    const path = (name: string) => `task/${bob.id}/${randomUUID()}/${name}.txt`
    const stale = path('stale')
    const fresh = path('fresh')
    for (const p of [stale, fresh]) {
      const { error } = await bobClient.storage.from('proof').upload(p, new Blob(['x'], { type: 'text/plain' }), { contentType: 'text/plain' })
      if (error) throw error
    }
    await pgQuery(`update storage.objects set created_at = now() - interval '2 days' where name = '${stale}'`)

    const { data, error } = await serviceClient().rpc('stray_proof_objects', { p_limit: 500 })
    expect(error).toBeNull()
    const names = (data as { name: string }[]).map((r) => r.name)
    expect(names).toContain(stale)
    expect(names).not.toContain(fresh)
    expect((await bobClient.rpc('stray_proof_objects', { p_limit: 5 })).error).not.toBeNull()

    await serviceClient().storage.from('proof').remove([stale, fresh])
  })
})

describe('#84 the creator’s stake is shown', () => {
  it('sums solo bets per outcome and lists parlay picks, only for the creator', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const other = await createTestMarket(bobClient, ['Yes', 'No'], { seed: 20 })
    await bet(aliceClient, m, 0, 30)
    await bet(aliceClient, m, 0, 10)
    await bet(bobClient, m, 1, 50)
    const { error } = await aliceClient.rpc('place_parlay', { p_outcome_ids: [m.outcomeIds[1], other.outcomeIds[0]], p_stake: 5 })
    if (error) throw error

    const stakes = await getCreatorStakes(bobClient, [
      { id: m.marketId, createdBy: alice.id },
      { id: other.marketId, createdBy: bob.id },
    ])
    expect(describeCreatorStake(stakes.get(m.marketId), 'has')).toBe('Creator has 40 DC on Yes and a parlay on No.')
    expect(describeCreatorStake(stakes.get(other.marketId), 'has')).toBeNull()
  })
})

describe('#60 the admin Members list still shows emails', () => {
  it('reads them through member_emails for an admin', async () => {
    const { client: ada } = await member('Ada', 'admin')
    const members = await listMembers(ada)
    expect(members.find((m) => m.id === bob.id)?.email).toBe(bob.email)
  })

  it('fails for a plain member instead of showing blanks', async () => {
    await expect(listMembers(bobClient)).rejects.toThrow('only an admin can see member emails')
  })
})
