import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient, type SlipSummary, setBalanceViaLedger } from './helpers'
import { expectError } from './assertions'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket, giveRole, backLeg, insertLockedParlay, cancelBetForHistory } from './fixtures'
import { pgQuery } from './pg-query'
import { describeCreatorStake, getCreatorStakes } from '@/lib/markets/creator-stakes'
import { getAdminMember } from '@/lib/members/list-members'

// 0046: the release 0.3 security batch. Each block reproduces the hole it closes.
let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const c of [aliceClient, bobClient]) await ensureInvited(c)
  await setBalanceViaLedger(bob.id, 3000)
})

async function bet(client: TestClient, market: TestMarket, index: number, amount: number): Promise<number> {
  const { error } = await client.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[index], p_amount: amount })
  if (error) throw error
  const { data } = await serviceClient().from('bets').select('id').eq('market_id', market.marketId).order('id', { ascending: false }).limit(1).single()
  return data!.id as number
}

async function close(market: TestMarket): Promise<void> {
  await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', market.marketId)
}

async function member(name: string, role: 'member' | 'reviewer' | 'admin'): Promise<{ member: Member; client: TestClient }> {
  const m = await makeMember(name)
  if (role !== 'member') await giveRole(m, role)
  const client = await clientFor(m)
  await ensureInvited(client)
  return { member: m, client }
}

const resolve = (client: TestClient, market: TestMarket, index = 0) =>
  client.rpc('resolve_market', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[index], p_note: 'Checked' })

describe('#57 parlay legs are priced without your own stakes', () => {
  async function pricedLegs(parlayId: string): Promise<Record<string, number>> {
    const { data } = await serviceClient().from('parlay_legs').select('market_id, locked_odds').eq('parlay_id', parlayId)
    return Object.fromEntries(data!.map((l) => [l.market_id, Number(l.locked_odds)]))
  }

  it("can't be pumped by betting against yourself, cancelled or not", async () => {
    await giveRole(alice, 'admin')
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    for (const m of [a, b]) await backLeg(m, 1)
    const pumpA = await bet(bobClient, a, 0, 1000)
    await bet(bobClient, b, 0, 1000)

    const { data: parlayId, error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[1], b.outcomeIds[1]], p_stake: 10 })
    expect(error).toBeNull()
    await cancelBetForHistory(pumpA)
    for (const m of [a, b]) expect((await resolve(aliceClient, m, 1)).error).toBeNull()

    // Without Bob's 1000s, each market is the backers' 50 DC, all on No: 50 / 50 = 1.00, not 21.
    expect(Object.values(await pricedLegs(parlayId as string))).toEqual([1, 1])
  })

  it("moves with everyone else's money until close", async () => {
    await giveRole(alice, 'admin')
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    for (const m of [a, b]) await backLeg(m, 1)
    const { data: parlayId } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[1], b.outcomeIds[1]], p_stake: 10 })
    await bet(aliceClient, a, 0, 60)
    for (const m of [a, b]) expect((await resolve(aliceClient, m, 1)).error).toBeNull()
    // A's No at close: (60 + 50) / 50 = 2.20.
    expect((await pricedLegs(parlayId as string))[a.marketId]).toBe(2.2)
  })

  it('leaves out your singles placed in the same slip', async () => {
    await giveRole(alice, 'admin')
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    for (const m of [a, b]) await backLeg(m, 1)
    const { data: summary, error } = await bobClient.rpc('place_slip_v4', {
      p_singles: [{ outcome_id: a.outcomeIds[0], amount: 500 }],
      p_parlay_outcome_ids: [a.outcomeIds[1], b.outcomeIds[1]],
      p_parlay_stake: 10,
    })
    expect(error).toBeNull()
    for (const m of [a, b]) expect((await resolve(aliceClient, m, 1)).error).toBeNull()
    expect(Object.values(await pricedLegs((summary as SlipSummary).parlay_id!))).toEqual([1, 1])
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
    const { client: rita } = await member('Rita', 'reviewer')
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const other = await createTestMarket(bobClient, ['Yes', 'No'], { seed: 20 })
    for (const market of [m, other]) await backLeg(market, 0)
    const { error } = await rita.rpc('place_parlay', { p_outcome_ids: [m.outcomeIds[0], other.outcomeIds[0]], p_stake: 5 })
    if (error) throw error
    await close(m)
    expect((await resolve(rita, m)).error?.message).toBe('you have a stake in this market, so someone else resolves it')
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
  it('checks the invite gate on place_bet', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await serviceClient().from('allowed_emails').delete().eq('email', bob.email)
    const placed = await bobClient.rpc('place_bet', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[0], p_amount: 5 })
    expect(placed.error?.message).toBe('not invited')
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
    expectError((await bobClient.rpc('stray_proof_objects', { p_limit: 5 })).error, { code: '42501', message: 'permission denied for function stray_proof_objects' })

    await serviceClient().storage.from('proof').remove([stale, fresh])
  })
})

describe('#203 hygiene', () => {
  // Functions that deliberately have no search_path setting. A function with a SET clause can't be
  // inlined into the caller's plan, and each of these is only fast because it is inlined:
  //   market_sparklines: keeps its read on bets_market_created_idx (tests/db/market-sparklines.test.ts).
  //   i_bet_on, my_activity_events (0094, #264): the Markets "I bet on" filter and the Feed's Mine
  //   tab push the caller's cursor, order and limit into the function's body, onto its indexes.
  // The exemption is safe only while each one is security invoker, plain SQL and names every table
  // and schema-qualified function, so no search_path can redirect a reference; the test below
  // checks exactly that, and a new entry has to meet it.
  const INLINABLE = ['market_sparklines', 'i_bet_on', 'my_activity_events']

  it('pins an empty search_path on every function in public, except the inlinable allowlist', async () => {
    const loose = await pgQuery<{ proname: string }>(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname <> all (array[${INLINABLE.map((n) => `'${n}'`).join(', ')}])
        and not coalesce(p.proconfig, '{}') && array['search_path=""', 'search_path=']
      order by 1
    `)
    expect(loose).toEqual([])
  })

  it('holds every inlinable function to security invoker, SQL, and schema-qualified references', async () => {
    const fns = await pgQuery<{ proname: string; invoker: boolean; lang: string; src: string; config: string[] | null }>(`
      select p.proname, not p.prosecdef as invoker, l.lanname as lang, p.prosrc as src, p.proconfig as config
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
      where n.nspname = 'public' and p.proname = any (array[${INLINABLE.map((n) => `'${n}'`).join(', ')}])
      order by 1
    `)
    expect(fns.map((f) => f.proname).sort()).toEqual([...INLINABLE].sort())
    for (const f of fns) {
      expect(f.invoker, `${f.proname} must be security invoker`).toBe(true)
      expect(f.lang, `${f.proname} must be language sql`).toBe('sql')
      // Every relation after from/join is public-qualified, a subquery, the built-in unnest, lateral or one of its own CTEs; a bare name would resolve
      // through whatever search_path the caller has.
      const refs = [...f.src.matchAll(/\b(?:from|join)\s+(\(|[\w."]+)/gi)].map((m) => m[1])
      expect(refs.length, `${f.proname} reads some table`).toBeGreaterThan(0)
      // A name the body defines itself (`with ids as (...)`) is not a table lookup either.
      const ctes = new Set([...f.src.matchAll(/(?:\bwith|,)\s+(\w+)\s+as\s*\(/gi)].map((m) => m[1]))
      for (const ref of refs) if (!ctes.has(ref)) expect(ref, `${f.proname}: ${ref}`).toMatch(/^(public\.|\(|unnest$|lateral$)/)
      // auth.uid() is always schema-qualified; a bare uid() would follow the caller's search_path.
      expect(f.src, `${f.proname} calls uid() unqualified`).not.toMatch(/(?<![\w.])uid\s*\(/i)
    }
  })

  // pg_net is owned by supabase_admin, so a migration can't revoke anon's and authenticated's
  // EXECUTE on net.*; the only way they could reach it is a public function they can execute.
  it('lets no function anon or authenticated can execute call into the net schema', async () => {
    const doors = await pgQuery<{ proname: string; anon: boolean; authenticated: boolean }>(`
      select p.proname,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosrc ~* '\\mnet\\.'
      order by 1
    `)
    expect(doors.map((d) => d.proname)).toEqual(['ping_closing_alerts'])
    expect(doors).toEqual([{ proname: 'ping_closing_alerts', anon: false, authenticated: false }])
  })
})

describe('#84 the creator’s stake is shown', () => {
  it('sums solo bets per outcome and lists parlay picks, only for the creator', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const other = await createTestMarket(bobClient, ['Yes', 'No'], { seed: 20 })
    await bet(aliceClient, m, 0, 30)
    await bet(aliceClient, m, 0, 10)
    await bet(bobClient, m, 1, 50)
    // A creator can't put their own market in a parlay since 0074, but one placed before still shows.
    await insertLockedParlay(alice.id, 5, [
      { market: m, outcomeIndex: 1, lockedOdds: 2 },
      { market: other, outcomeIndex: 0, lockedOdds: 2 },
    ])

    const stakes = await getCreatorStakes(bobClient, [
      { id: m.marketId, createdBy: alice.id },
      { id: other.marketId, createdBy: bob.id },
    ])
    expect(describeCreatorStake(stakes.get(m.marketId), 'has')).toBe('Creator has 40 DC on Yes and a parlay on No.')
    expect(describeCreatorStake(stakes.get(other.marketId), 'has')).toBeNull()
  })
})

describe('#60 the admin Members list still shows emails', () => {
  it('reads them through admin_members (0093) for an admin', async () => {
    const { client: ada } = await member('Ada', 'admin')
    expect((await getAdminMember(ada, bob.id))?.email).toBe(bob.email)
  })

  it('fails for a plain member instead of showing blanks', async () => {
    await expect(getAdminMember(bobClient, bob.id)).rejects.toThrow('only an admin can list members')
  })
})
