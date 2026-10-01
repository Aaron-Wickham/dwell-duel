import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { serviceClient, wipeDatabase } from './helpers'

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
export async function clientForEmail(email: string): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  const { data, error } = await serviceClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (error) throw error
  const c = createClient(url, anon, { auth: { persistSession: false } })
  const { error: vErr } = await c.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  })
  if (vErr) throw vErr
  return c
}

/** A client acting as the given member, subject to RLS. */
export async function clientFor(member: Member): Promise<SupabaseClient> {
  return clientForEmail(member.email)
}

/** A signed-out client, subject to RLS as `anon`. */
export function anonClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  })
}

/**
 * Turns an authenticated test client's session into a real `Cookie`
 * header string, using `@supabase/ssr`'s own cookie adapter — needed by
 * `e2e/global-setup.ts` (Task 9) to inject a real session into a fresh
 * browser context without driving the real Google consent screen.
 */
export async function sessionCookieHeader(client: SupabaseClient): Promise<string> {
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
export async function ensureInvited(client: SupabaseClient): Promise<void> {
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
export async function createTestMarket(
  creatorClient: SupabaseClient,
  labels: string[],
  opts?: { kind?: 'binary' | 'multiple_choice'; closeInMs?: number; title?: string; seed?: number },
): Promise<TestMarket> {
  await ensureInvited(creatorClient)

  const kind = opts?.kind ?? (labels.length === 2 ? 'binary' : 'multiple_choice')
  const closeAt = new Date(Date.now() + (opts?.closeInMs ?? 1000 * 60 * 60)).toISOString()

  const { data: marketId, error } = await creatorClient.rpc('create_market', {
    p_title: opts?.title ?? 'Test market',
    p_description: null,
    p_kind: kind,
    p_outcome_labels: labels,
    p_close_at: closeAt,
  })
  if (error) throw error

  const { data: created, error: seedErr } = await serviceClient()
    .from('markets')
    .update({ seed_per_outcome: opts?.seed ?? 0 })
    .eq('id', marketId as string)
    .select('created_by')
    .single()
  if (seedErr) throw seedErr

  // Some suites have one member make dozens of markets; the daily limit (0078) has its own tests.
  const { error: limitErr } = await serviceClient()
    .from('write_rate_counters')
    .delete()
    .eq('profile_id', created.created_by)
    .eq('action', 'market')
  if (limitErr) throw limitErr

  const { data: outcomes, error: outcomesErr } = await serviceClient()
    .from('market_outcomes')
    .select('id, label')
    .eq('market_id', marketId as string)
  if (outcomesErr) throw outcomesErr

  const outcomeIds = labels.map((label) => {
    const row = outcomes!.find((o) => o.label === label)
    if (!row) throw new Error(`outcome ${label} not found after create_market`)
    return row.id
  })

  return { marketId: marketId as string, outcomeIds }
}
