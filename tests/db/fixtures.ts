import { createClient, type PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/supabase/database'
import { serviceClient, wipeDatabase, type TestClient } from './helpers'
import { pgQuery } from './pg-query'

export interface Member {
  id: string
  email: string
  displayName: string
}

/** An authenticated user who has no profiles row yet — a fresh Google sign-in. */
export async function makeAuthUserWithoutProfile(email: string): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (error) throw error
  return data.user!.id
}

/**
 * Creates a real auth user AND its profile row via the service-role
 * client (bypassing RLS — this is fixture setup, not the thing under
 * test). `on_profile_created` (Task 4) still fires on this insert like
 * any other, so every member returned here already carries the 100-coin
 * starting balance the same code path a real sign-in goes through grants.
 *
 * This deliberately skips the real invite flow, so a member returned
 * here has no `allowed_emails` row and `is_invited()` is false for
 * them — a state no real user can ever be in (profile creation itself
 * requires it). Harmless for most tests, but a trap for anything gated
 * on `is_invited()` (e.g. `select_all_profiles`, `create_market()`) —
 * call `ensureInvited()` (below) on that member's client first.
 */
export async function makeMember(displayName: string): Promise<Member> {
  const email = `${displayName.toLowerCase()}@example.com`
  const id = await makeAuthUserWithoutProfile(email)
  const db = serviceClient()
  const { error } = await db.from('profiles').insert({ id, email, display_name: displayName })
  if (error) throw error
  return { id, email, displayName }
}

/** Wipes every table this suite touches and every auth user, then creates two fresh members. */
export async function seedMembers(): Promise<[Member, Member]> {
  await wipeDatabase()

  const alice = await makeMember('Alice')
  const bob = await makeMember('Bob')
  return [alice, bob]
}

/**
 * A client holding a real session for `email`, subject to RLS. `email`
 * must already belong to an existing auth user — call
 * `makeAuthUserWithoutProfile`/`makeMember` first.
 */
export async function clientForEmail(email: string): Promise<TestClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  const { data, error } = await serviceClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (error) throw error
  const c = createClient<Database>(url, anon, { auth: { persistSession: false } })
  const { error: vErr } = await c.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  })
  if (vErr) throw vErr
  return c
}

/** A client acting as the given member, subject to RLS. */
export async function clientFor(member: Member): Promise<TestClient> {
  return clientForEmail(member.email)
}

/** A signed-out client, subject to RLS as `anon`. */
export function anonClient(): TestClient {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  })
}

/**
 * Turns an authenticated test client's session into a real `Cookie`
 * header string, using `@supabase/ssr`'s own cookie adapter — needed by
 * `e2e/global-setup.ts` (Task 9) to inject a real session into a fresh
 * browser context without driving the real Google consent screen.
 */
export async function sessionCookieHeader(client: TestClient): Promise<string> {
  const {
    data: { session },
    error,
  } = await client.auth.getSession()
  if (error) throw error
  if (!session) throw new Error('sessionCookieHeader: client has no session')

  const jar = new Map<string, string>()
  const ssrClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
      },
    },
  )
  const { error: setErr } = await ssrClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (setErr) throw setErr

  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

export interface TestTask {
  taskId: string
}

export async function createTestTask(
  createdBy: Member,
  opts?: {
    title?: string
    rewardAmount?: number
    isRepeatable?: boolean
    period?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  },
): Promise<TestTask> {
  const db = serviceClient()
  const isRepeatable = opts?.isRepeatable ?? false
  const { data, error } = await db
    .from('tasks')
    .insert({
      title: opts?.title ?? 'Test task',
      reward_amount: opts?.rewardAmount ?? 10,
      is_repeatable: isRepeatable,
      period: isRepeatable ? (opts?.period ?? 'weekly') : null,
      created_by: createdBy.id,
    })
    .select('id')
    .single()
  if (error) throw error
  return { taskId: data.id }
}

export interface TestMarket {
  marketId: string
  outcomeIds: string[]
}

/**
 * create_market() requires is_invited() -- correct in production, since
 * nobody can have a profile without having been invited first, but
 * seedMembers()/makeMember() deliberately bypass that real flow for
 * fixture speed, so a fixture member has no allowed_emails row of their
 * own. This fixes that for one client's own user -- upsert, not insert,
 * so it never collides with a test that explicitly inserts its own row
 * for the same email (e.g. tests/db/list-invites.test.ts inserting
 * { email: admin.email, claimed_by: admin.id }). Deliberately not baked
 * into makeMember()/seedMembers() themselves: that would run this upsert
 * for every fixture member unconditionally, including in that same test.
 */
export async function ensureInvited(client: TestClient): Promise<void> {
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user?.email) throw new Error('ensureInvited: client has no authenticated user')

  const { error } = await serviceClient()
    .from('allowed_emails')
    .upsert({ email: user.email.toLowerCase() }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) throw error
}

/**
 * Gives a fixture member a role and the invite that makes it count: since
 * 0068, my_role() answers 'member' for anyone without an allowed_emails row,
 * however profiles.role reads. Same upsert as ensureInvited, so a test that
 * inserts its own row for this email afterwards should update it instead.
 */
export async function giveRole(member: Member, role: 'owner' | 'admin' | 'reviewer' | 'member'): Promise<void> {
  const db = serviceClient()
  const { error } = await db.from('profiles').update({ role }).eq('id', member.id)
  if (error) throw error
  const { error: inviteErr } = await db
    .from('allowed_emails')
    .upsert({ email: member.email.toLowerCase() }, { onConflict: 'email', ignoreDuplicates: true })
  if (inviteErr) throw inviteErr
}

/**
 * Creates a market via the real create_market() RPC (not a raw insert),
 * so every test that needs a market also exercises the same validation
 * path a real user's create-market request goes through. Returns
 * outcome ids in the same order as the labels passed in.
 *
 * Markets start unseeded (seed_per_outcome 0), so tests about pools, payouts
 * and parlay odds check the plain pool arithmetic; tests about seeded odds
 * (0041) pass `seed` explicitly.
 */
export type CreateMarketArgs = Database['public']['Functions']['create_market_v3']['Args']

/**
 * A pool market, as create_market made one before 0105 (with its 20 DC seed). Pool markets made
 * before then are still shown, resolved again by an admin and charted under the pool rules, so
 * their tests need one. Nothing in the app makes one any more, so this makes an lmsr market and
 * turns it into a pool market while it has no bets. Answers with the new market's id.
 */
export async function createPoolMarket(client: TestClient, args: CreateMarketArgs): Promise<{ data: string; error: null } | { data: null; error: PostgrestError }> {
  const { data, error } = await client.rpc('create_market_v3', args)
  if (error) return { data: null, error }
  const marketId = (data as { market_id: string }).market_id
  const { error: poolErr } = await serviceClient().from('markets').update({ pricing: 'pool', seed_per_outcome: 20 }).eq('id', marketId)
  if (poolErr) throw poolErr
  return { data: marketId, error: null }
}

export async function createTestMarket(
  creatorClient: TestClient,
  labels: string[],
  opts?: { kind?: 'binary' | 'multiple_choice'; closeInMs?: number; title?: string; seed?: number; lmsr?: boolean },
): Promise<TestMarket> {
  await ensureInvited(creatorClient)

  const kind = opts?.kind ?? (labels.length === 2 ? 'binary' : 'multiple_choice')
  const closeAt = new Date(Date.now() + (opts?.closeInMs ?? 1000 * 60 * 60)).toISOString()
  const args = {
    p_title: opts?.title ?? 'Test market',
    p_description: null,
    p_kind: kind,
    p_outcome_labels: labels,
    p_close_at: closeAt,
  }

  let marketId: string
  if (opts?.lmsr) {
    // create_market_v3 (0102): what the app calls since #333, priced by LMSR with no seed.
    const { data, error } = await creatorClient.rpc('create_market_v3', args)
    if (error) throw error
    marketId = (data as { market_id: string }).market_id
  } else {
    const { data, error } = await createPoolMarket(creatorClient, args)
    if (error) throw error
    marketId = data!
  }

  const { data: created, error: seedErr } = await serviceClient()
    .from('markets')
    .update({ seed_per_outcome: opts?.lmsr ? 0 : (opts?.seed ?? 0) })
    .eq('id', marketId)
    .select('created_by')
    .single()
  if (seedErr) throw seedErr

  // Some suites have one member make dozens of markets; the daily limit (0090) has its own tests.
  const { error: limitErr } = await serviceClient()
    .from('write_rate_counters')
    .delete()
    .eq('profile_id', created.created_by)
    .eq('action', 'market')
  if (limitErr) throw limitErr

  const { data: outcomes, error: outcomesErr } = await serviceClient()
    .from('market_outcomes')
    .select('id, label')
    .eq('market_id', marketId)
  if (outcomesErr) throw outcomesErr

  const outcomeIds = labels.map((label) => {
    const row = outcomes!.find((o) => o.label === label)
    if (!row) throw new Error(`outcome ${label} not found after create_market`)
    return row.id
  })

  return { marketId, outcomeIds }
}

const BACKERS = ['Backer1', 'Backer2'] as const
const backerSessions = new Map<string, TestClient>()

export interface Backer {
  id: string
  client: TestClient
}

let backersQueue: Promise<unknown> = Promise.resolve()

/**
 * Two more members, Backer1 and Backer2, invited, with a session each. Made on first use after a
 * wipe; a session is kept only while its profile is the same one. Calls queue behind each other, so
 * markets built in parallel don't each try to make the pair.
 */
export function backers(): Promise<Backer[]> {
  const next = backersQueue.then(findOrMakeBackers)
  backersQueue = next.catch(() => undefined)
  return next
}

async function findOrMakeBackers(): Promise<Backer[]> {
  const db = serviceClient()
  const result: Backer[] = []
  for (const name of BACKERS) {
    const email = `${name.toLowerCase()}@example.com`
    const { data, error } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
    if (error) throw error
    const id = data?.id ?? (await makeMember(name)).id
    let client = backerSessions.get(id)
    if (!client) {
      client = await clientForEmail(email)
      await ensureInvited(client)
      backerSessions.set(id, client)
    }
    result.push({ id, client })
  }
  return result
}

/**
 * Since 0074 a parlay leg needs at least 50 DC of other members' stakes on its market, from at
 * least 2 other members. Backer1 and Backer2 each stake `each` DC (25 by default) on the given
 * outcome, which meets that floor for anyone but them. These are real bets: they move the pool,
 * count toward a leg's odds at close, and are paid or lost like any other.
 */
export async function backLeg(market: TestMarket, outcomeIndex: number, each = 25): Promise<void> {
  for (const { client } of await backers()) {
    const { error } = await client.rpc('place_bet', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[outcomeIndex],
      p_amount: each,
    })
    if (error) throw error
  }
}

/**
 * A parlay as place_parlay wrote one before 0074, as 0074 leaves it while still pending: every
 * leg's odds locked at placement, and the 20x cap. place_parlay can't make one any more, so it's
 * written directly, with its stake debited through the ledger as place_parlay would. For how such
 * a parlay settles and shows.
 */
export async function insertLockedParlay(
  profileId: string,
  stake: number,
  legs: { market: TestMarket; outcomeIndex: number; lockedOdds: number }[],
): Promise<string> {
  const values = legs
    .map((l) => `('${l.market.marketId}'::uuid, '${l.market.outcomeIds[l.outcomeIndex]}'::uuid, ${l.lockedOdds}::numeric)`)
    .join(', ')
  const [row] = await pgQuery<{ id: string }>(`
    with p as (
      insert into public.parlays (profile_id, stake, max_multiplier, odds_at_close) values ('${profileId}', ${stake}, 20, false) returning id
    ),
    l as (
      insert into public.parlay_legs (parlay_id, market_id, outcome_id, locked_odds)
      select p.id, x.market_id, x.outcome_id, x.odds from p, (values ${values}) as x(market_id, outcome_id, odds)
    )
    select p.id, public.apply_coin_transaction('${profileId}', -${stake}, 'parlay_placed', jsonb_build_object('parlay_id', p.id)) from p
  `)
  return row.id
}

/**
 * Writes what cancel_bet did before #332 dropped it (0037, 0046): the stake back on the ledger, and
 * the bet moved into cancelled_bets and out of its pool. Nothing cancels a bet any more, but the
 * cancellations made before then are history that My bets, the feed and the stats still read.
 * Only for a bet on a pool market, the only kind that could be cancelled.
 */
export async function cancelBetForHistory(betId: number): Promise<void> {
  await pgQuery(`
    do $$
    declare
      v public.bets%rowtype;
    begin
      select * into strict v from public.bets where id = ${Math.trunc(betId)} for update;
      perform public.apply_coin_transaction(
        v.profile_id, v.amount, 'bet_cancelled',
        jsonb_build_object('market_id', v.market_id, 'outcome_id', v.outcome_id, 'bet_id', v.id)
      );
      insert into public.cancelled_bets (id, market_id, outcome_id, profile_id, amount, placed_at)
      values (v.id, v.market_id, v.outcome_id, v.profile_id, v.amount, v.created_at);
      delete from public.bets where id = v.id;
      update public.market_outcomes set pool_total = pool_total - v.amount where id = v.outcome_id;
    end
    $$
  `)
}
