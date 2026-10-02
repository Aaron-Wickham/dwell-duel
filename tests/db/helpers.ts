import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import type { Database } from '@/lib/supabase/database'
import { pgQuery } from './pg-query'

export type TestClient = SupabaseClient<Database>

config({ path: '.env.local', quiet: true })

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

export function assertLocal(url: string): void {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`)
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run the DB test suite against ${host}. This suite is DESTRUCTIVE — ` +
        'it deletes every auth user, profile, invite and coin transaction — so it only runs ' +
        `against a local Supabase instance (${[...LOCAL_HOSTS].join(' or ')}). Point ` +
        'NEXT_PUBLIC_SUPABASE_URL in .env.local back at your local stack before testing.',
    )
  }
}

export type RpcName = keyof Database['public']['Functions']

/**
 * An RPC call whose name is type-checked but whose arguments aren't, for tests that loop over
 * many functions with different argument shapes (grant checks) or send a deliberately wrong one.
 */
export function rpcLoose(client: TestClient, fn: RpcName, args?: object) {
  return client.rpc(fn, args as never)
}

export function serviceClient(): TestClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars — is .env.local present?')
  assertLocal(url)
  return createClient<Database>(url, key, { auth: { persistSession: false } })
}

/**
 * Wipes every table the suite touches and every auth user, in one round trip through
 * postgres-meta (pgQuery refuses anything but localhost). Every DB test file starts this way,
 * and going table by table through PostgREST and then user by user through Auth's admin API
 * was most of the suite's time (#214). Deleting from auth.users takes identities, sessions and
 * tokens with it through Auth's own foreign keys, the same rows the admin API deletes.
 */
export async function wipeDatabase(): Promise<void> {
  await pgQuery(`
    delete from public.parlays;
    delete from public.task_completions;
    delete from public.tasks;
    delete from public.markets;
    delete from public.market_categories where id <> '00000000-0000-4000-8000-000000000327';
    delete from public.coin_transactions;
    delete from public.allowed_emails;
    delete from public.profiles;
    delete from auth.users;
  `)
}

// Local Auth's admin API occasionally answers a delete with a retryable "Database error deleting
// user" under the suite's sustained load; it succeeds when asked again.
export async function deleteAuthUser(db: TestClient, id: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const { error } = await db.auth.admin.deleteUser(id)
    if (!error) return
    if (!isAuthRetryableFetchError(error) || attempt === 3) throw error
    await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
  }
}

/**
 * Moves a member's balance to `target` through the ledger, the way a grant or a charge would. A
 * test that set `profiles.balance` directly left the ledger behind, and the ledger check after
 * every test (setup.ts) would rightly call that drift.
 */
export async function setBalanceViaLedger(memberId: string, target: number): Promise<void> {
  const db = serviceClient()
  const { data, error } = await db.from('profiles').select('balance').eq('id', memberId).single()
  if (error) throw error
  const delta = target - data.balance
  if (delta === 0) return
  const { error: txErr } = await db.rpc('apply_coin_transaction', {
    p_profile_id: memberId,
    p_amount: delta,
    p_type: 'test_adjustment',
  })
  if (txErr) throw txErr
}

let ledgerCheckSkippedFor: string | null = null

/** Opts the current test out of the after-each ledger check, with the reason a reader can judge. */
export function skipLedgerCheck(reason: string): void {
  ledgerCheckSkippedFor = reason
}

/** True if the test that just ran opted out; clears the opt-out for the next one. */
export function takeLedgerCheckSkip(): boolean {
  const skipped = ledgerCheckSkippedFor !== null
  ledgerCheckSkippedFor = null
  return skipped
}

export interface LedgerViolation {
  invariant: string
  id: string
  stored: number
  expected: number
}

/**
 * The money invariants that no single scenario asserts, as one query that returns every
 * violating row: a balance equals the sum of its ledger rows, an outcome's pool equals its live
 * bets, an lmsr outcome's shares equal its bets' shares plus its parlay legs' (the house parlay
 * book's, 0104), a pool outcome holds no shares, an lmsr bet has shares and cost = amount, a fixed
 * parlay's legs (and only its legs) carry a factor and shares, and a parlay's `credited` equals what the ledger paid and took back for it. (Balances
 * and pools can't go negative: the schema's CHECKs already guarantee that.)
 */
export async function ledgerViolations(): Promise<LedgerViolation[]> {
  return pgQuery<LedgerViolation>(`
    select 'balance <> ledger' as invariant, p.id::text as id, p.balance::int as stored,
           coalesce(sum(t.amount), 0)::int as expected
    from public.profiles p
    left join public.coin_transactions t on t.profile_id = p.id
    group by p.id, p.balance
    having p.balance <> coalesce(sum(t.amount), 0)
    union all
    select 'pool_total <> live bets', o.id::text, o.pool_total::int, coalesce(sum(b.amount), 0)::int
    from public.market_outcomes o
    left join public.bets b on b.outcome_id = o.id
    group by o.id, o.pool_total
    having o.pool_total <> coalesce(sum(b.amount), 0)
    union all
    select 'lmsr shares <> bets + parlay book', o.id::text, o.shares::float, (coalesce(b.held, 0) + coalesce(l.held, 0))::float
    from public.market_outcomes o
    join public.markets m on m.id = o.market_id and m.pricing = 'lmsr'
    left join (select outcome_id, sum(shares) as held from public.bets group by outcome_id) b on b.outcome_id = o.id
    left join (select outcome_id, sum(shares) as held from public.parlay_legs group by outcome_id) l on l.outcome_id = o.id
    where o.shares <> coalesce(b.held, 0) + coalesce(l.held, 0)
    union all
    select 'pool outcome holds shares', o.id::text, o.shares::float, 0
    from public.market_outcomes o
    join public.markets m on m.id = o.market_id and m.pricing = 'pool'
    where o.shares <> 0
    union all
    select 'lmsr bet without shares, or cost <> amount', b.id::text, coalesce(b.cost, 0), b.amount
    from public.bets b
    join public.markets m on m.id = b.market_id and m.pricing = 'lmsr'
    where b.shares is null or b.cost is distinct from b.amount
    union all
    select 'fixed parlay leg without factor and shares', l.id::text, 0, 1
    from public.parlay_legs l
    join public.parlays pa on pa.id = l.parlay_id
    where (pa.multiplier is not null) <> (l.factor is not null and l.shares is not null)
    union all
    select 'parlay credited <> ledger', pa.id::text, pa.credited::int, coalesce(sum(t.amount), 0)::int
    from public.parlays pa
    left join public.coin_transactions t
      on t.meta ->> 'parlay_id' = pa.id::text
     and t.type in ('parlay_won', 'parlay_refunded', 'parlay_reversed')
    group by pa.id, pa.credited
    having pa.credited <> coalesce(sum(t.amount), 0)
  `)
}

/** What place_slip_v2 answers with: what the call placed, and whether it replayed an earlier attempt. */
export type SlipSummary = { parlay_id: string | null; solos: number; picks: string[]; replayed: boolean }

/**
 * For a test that seeds bets or ledger rows in bulk with a raw insert (a real flow would take
 * hundreds of RPC calls): brings pools and balances in line with what was inserted, so the
 * ledger check after the test still guards everything the test didn't deliberately write.
 */
// Run right after the raw seed, before anything under test moves coins: this rewrites every row.
export async function reconcilePoolTotals(): Promise<void> {
  await pgQuery(`
    update public.market_outcomes o
    set pool_total = coalesce((select sum(b.amount) from public.bets b where b.outcome_id = o.id), 0)
  `)
}

// Run right after the raw seed, before anything under test moves coins: this rewrites every row.
export async function reconcileBalances(): Promise<void> {
  await pgQuery(`
    update public.profiles p
    set balance = coalesce((select sum(t.amount) from public.coin_transactions t where t.profile_id = p.id), 0)
  `)
}
