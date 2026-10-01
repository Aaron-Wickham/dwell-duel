# Market Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-sufficient pari-mutuel betting market on top of Foundation's
ledger — any invited member creates a market, bets Dwell Coin (DC) on its
outcomes, and the pool itself determines odds and payout. The creator
resolves it; an admin can always resolve an unresolved market or reverse
and re-resolve an already-resolved one.

**Architecture:** Four new tables (`markets`, `market_outcomes`, `bets`,
`market_resolutions`) and four `SECURITY DEFINER` functions
(`create_market`, `place_bet`, `resolve_market`, `void_market`), each a
narrow wrapper that ultimately calls Foundation's `apply_coin_transaction`
— no table here ever gets a direct write grant for `authenticated`.
Next.js App Router pages provide a market feed, a create-market form, and
a detail page with betting, resolution, and admin-override controls.

**Tech Stack:** Same as Foundation — Next.js 16 (App Router) + TypeScript
+ Supabase (Postgres/RLS/`SECURITY DEFINER`) + Vitest + Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-22-market-engine-design.md`](../specs/2026-09-22-market-engine-design.md)
— read it alongside this plan.

## Global Constraints

- Migrations continue Foundation's sequence: `0008_` through `0014_`,
  sequential and zero-padded. Never edit a past migration in place.
- Every `SECURITY DEFINER` function: `set search_path = ''` with fully
  schema-qualified (`public.table`) references, explicit `EXECUTE`
  grants (revoke from `public`/`anon`, grant to `authenticated`) in the
  same migration that creates it — **and** an explicit
  `grant execute ... to service_role` in that same migration. Likewise
  every new table gets `grant all ... to service_role` in the migration
  that creates it. This is not optional: Foundation shipped without
  this, passed on the local dev machine's Supabase CLI version (which
  happens to bootstrap `service_role` access implicitly), and failed CI
  outright on the pinned version once real DB tests ran there. Fixed in
  Foundation's `0007_grant_service_role.sql`; do not repeat the gap here.
- No table in this feature (`markets`, `market_outcomes`, `bets`,
  `market_resolutions`) ever gets an `INSERT`/`UPDATE`/`DELETE` grant
  for `authenticated` — every write happens through one of the four
  functions above, which each do their own internal permission check.
- Every FK from these four tables back to `profiles` uses
  `on delete cascade` — this isn't in the spec's SQL sketches, but is
  necessary so a `profiles` deletion (which every existing Foundation
  test file's wipe-and-reseed fixture performs) doesn't get blocked by
  a leftover market/bet row once these tables exist. Without this, any
  Foundation test file that runs *after* a market-engine test file in
  the same suite run would start failing on an unrelated FK violation.
- Currency is displayed as **Dwell Coin (DC)** in all new UI copy.
  Internal naming (`balance`, `amount`, `bet_won`, etc.) is unchanged.
- Server actions in this feature follow the `useActionState`-compatible
  pattern Foundation's final review established for
  `lib/invites/actions.ts` — `(prevState, formData) => { formError?: string } | undefined`
  — so a rejected action is never silently indistinguishable from success.
- Comments explain why, not what; default to no comments.
- No unrequested scope creep: parlays, coin-earning tasks, a public bets
  feed, and a general admin dashboard are explicitly out of scope here
  (see the spec's non-goals).

**Before Task 1:** `npm run db:start` (or confirm it's already running),
`.env.local` populated per `README.md`.

**Before the final task's full verification pass:** re-run the whole
verification chain against the exact Supabase CLI version CI pins
(`npx -y supabase@2.115.0 db reset` before testing) — not just whatever
version happens to be installed locally. This is exactly how
Foundation's `service_role` gap was caught after merge; catching it
during this plan's execution instead is the point of restating it here.

---

## Task 1: Core market tables

**Files:**
- Create: `supabase/migrations/0008_market_tables.sql`
- Modify: `tests/db/fixtures.ts`
- Create: `tests/db/market-schema.test.ts`

**Interfaces:**
- Consumes: `serviceClient()`, `makeMember()`, `Member` (Foundation, `tests/db/helpers.ts`/`fixtures.ts`)
- Produces: `TestMarket { marketId: string; outcomeIds: string[] }`,
  `ensureInvited(client: SupabaseClient): Promise<void>`,
  `createTestMarket(creatorClient: SupabaseClient, labels: string[], opts?: { kind?: 'binary' | 'multiple_choice'; closeInMs?: number; title?: string }): Promise<TestMarket>`
  (`tests/db/fixtures.ts`) — `createTestMarket` calls `ensureInvited`
  internally, so most later tasks never call `ensureInvited` directly.
  Task 2 is the one exception: its tests call the `create_market` RPC
  directly (to test the RPC's own validation, not through the
  `createTestMarket` wrapper), so it must call `ensureInvited` itself.

- [ ] **Step 1: Write `tests/db/market-schema.test.ts` (will fail — no tables yet)**

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { serviceClient } from './helpers'
import { makeMember, type Member } from './fixtures'

let creator: Member

beforeAll(async () => {
  const db = serviceClient()
  await db.from('bets').delete().gte('id', 0)
  await db.from('market_resolutions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await db.from('market_outcomes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await db.from('markets').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await db.from('coin_transactions').delete().gte('id', 0)
  await db.from('allowed_emails').delete().neq('email', '')
  await db.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const { data: existing } = await db.auth.admin.listUsers()
  for (const u of existing.users) await db.auth.admin.deleteUser(u.id)

  creator = await makeMember('Carla')
})

describe('markets table', () => {
  it('accepts a valid row with the expected defaults', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data, error } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Test market', kind: 'binary', close_at: closeAt })
      .select('status, current_resolution_id')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('open')
    expect(data?.current_resolution_id).toBeNull()
  })

  it('rejects an invalid kind', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { error } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Bad kind', kind: 'weird', close_at: closeAt })
    expect(error).not.toBeNull()
  })
})

describe('market_outcomes table', () => {
  it('enforces a unique label per market', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data: market } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Dup labels', kind: 'binary', close_at: closeAt })
      .select('id')
      .single()

    const { error: first } = await db.from('market_outcomes').insert({ market_id: market!.id, label: 'Yes' })
    expect(first).toBeNull()

    const { error: second } = await db.from('market_outcomes').insert({ market_id: market!.id, label: 'Yes' })
    expect(second).not.toBeNull()
  })

  it('rejects a negative pool_total', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data: market } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Neg pool', kind: 'binary', close_at: closeAt })
      .select('id')
      .single()
    const { data: outcome } = await db
      .from('market_outcomes')
      .insert({ market_id: market!.id, label: 'Yes' })
      .select('id')
      .single()

    const { error } = await db.from('market_outcomes').update({ pool_total: -1 }).eq('id', outcome!.id)
    expect(error).not.toBeNull()
  })
})

describe('bets table', () => {
  it('rejects a non-positive amount', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data: market } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Bet amount', kind: 'binary', close_at: closeAt })
      .select('id')
      .single()
    const { data: outcome } = await db
      .from('market_outcomes')
      .insert({ market_id: market!.id, label: 'Yes' })
      .select('id')
      .single()

    const { error } = await db
      .from('bets')
      .insert({ market_id: market!.id, outcome_id: outcome!.id, profile_id: creator.id, amount: 0 })
    expect(error).not.toBeNull()
  })
})

describe('market_resolutions table', () => {
  it('accepts a valid row and lets markets.current_resolution_id reference it', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data: market } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Resolution link', kind: 'binary', close_at: closeAt })
      .select('id')
      .single()
    const { data: outcome } = await db
      .from('market_outcomes')
      .insert({ market_id: market!.id, label: 'Yes' })
      .select('id')
      .single()

    const { data: resolution, error: resErr } = await db
      .from('market_resolutions')
      .insert({ market_id: market!.id, outcome_id: outcome!.id, resolved_by: creator.id })
      .select('id')
      .single()
    expect(resErr).toBeNull()

    const { error: linkErr } = await db
      .from('markets')
      .update({ current_resolution_id: resolution!.id })
      .eq('id', market!.id)
    expect(linkErr).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/market-schema.test.ts`
Expected: FAIL — `relation "public.markets" does not exist` (or similar)

- [ ] **Step 3: Write `supabase/migrations/0008_market_tables.sql`**

```sql
create table markets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles (id) on delete cascade,
  title text not null,
  description text,
  kind text not null check (kind in ('binary', 'multiple_choice')),
  status text not null default 'open' check (status in ('open', 'resolved', 'voided')),
  current_resolution_id uuid,
  close_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table market_outcomes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets (id) on delete cascade,
  label text not null,
  pool_total integer not null default 0 check (pool_total >= 0),
  created_at timestamptz not null default now(),
  unique (market_id, label)
);

create table bets (
  id bigint generated always as identity primary key,
  market_id uuid not null references markets (id) on delete cascade,
  outcome_id uuid not null references market_outcomes (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table market_resolutions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets (id) on delete cascade,
  outcome_id uuid not null references market_outcomes (id) on delete cascade,
  resolved_by uuid not null references profiles (id) on delete cascade,
  resolved_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references profiles (id) on delete cascade
);

-- markets.current_resolution_id and market_resolutions.market_id
-- reference each other, so this FK is added after both tables exist.
alter table markets add constraint markets_current_resolution_id_fkey
  foreign key (current_resolution_id) references market_resolutions (id);

grant all on public.markets, public.market_outcomes, public.bets, public.market_resolutions to service_role;
```

- [ ] **Step 4: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/market-schema.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Add `createTestMarket` to `tests/db/fixtures.ts`**

Add this import at the top (alongside the existing `import { serviceClient } from './helpers'`):

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
```

(If `SupabaseClient` is already imported as a type in this file from an
earlier line, don't duplicate the import — just make sure it's imported.)

Append to the end of `tests/db/fixtures.ts`:

```typescript
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
 * Creates a market via the real create_market() RPC (not a raw insert),
 * so every test that needs a market also exercises the same validation
 * path a real user's create-market request goes through. Returns
 * outcome ids in the same order as the labels passed in.
 */
export async function createTestMarket(
  creatorClient: SupabaseClient,
  labels: string[],
  opts?: { kind?: 'binary' | 'multiple_choice'; closeInMs?: number; title?: string },
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
```

This function calls the `create_market` RPC, which doesn't exist until
Task 2 — that's fine, nothing in this task calls `createTestMarket` yet.

- [ ] **Step 6: Run the full test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: all PASS (existing Foundation tests + the 5 new schema tests)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0008_market_tables.sql tests/db/fixtures.ts tests/db/market-schema.test.ts
git commit -m "Add markets, market_outcomes, bets, market_resolutions tables"
```

---

## Task 2: `create_market` function

**Files:**
- Create: `supabase/migrations/0009_create_market_function.sql`
- Create: `tests/db/create-market.test.ts`

**Interfaces:**
- Consumes: `serviceClient()`, `seedMembers()`, `clientFor()`, `Member` (Foundation)
- Produces: the `create_market(p_title text, p_description text, p_kind text, p_outcome_labels text[], p_close_at timestamptz) returns uuid`
  RPC — Task 1's `createTestMarket` fixture and every later task's tests
  call this by name.

- [ ] **Step 1: Write `tests/db/create-market.test.ts` (will fail — function doesn't exist)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, type Member } from './fixtures'

let alice: Member

beforeEach(async () => {
  ;[alice] = await seedMembers()
})

describe('create_market', () => {
  it('creates a binary market with exactly the given outcomes', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() + 60_000).toISOString()

    const { data: marketId, error } = await client.rpc('create_market', {
      p_title: 'Will it rain?',
      p_description: 'Tomorrow, in town',
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: closeAt,
    })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: market } = await db.from('markets').select('title, created_by, status').eq('id', marketId).single()
    expect(market?.title).toBe('Will it rain?')
    expect(market?.created_by).toBe(alice.id)
    expect(market?.status).toBe('open')

    const { data: outcomes } = await db.from('market_outcomes').select('label').eq('market_id', marketId)
    expect(outcomes?.map((o) => o.label).sort()).toEqual(['No', 'Yes'])
  })

  it('rejects a binary market with more or fewer than 2 outcomes', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() + 60_000).toISOString()

    const { error } = await client.rpc('create_market', {
      p_title: 'Bad binary',
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No', 'Maybe'],
      p_close_at: closeAt,
    })
    expect(error).not.toBeNull()
  })

  it('rejects more than 6 outcomes', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() + 60_000).toISOString()

    const { error } = await client.rpc('create_market', {
      p_title: 'Too many options',
      p_description: null,
      p_kind: 'multiple_choice',
      p_outcome_labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      p_close_at: closeAt,
    })
    expect(error).not.toBeNull()
  })

  it('rejects a close time in the past', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() - 60_000).toISOString()

    const { error } = await client.rpc('create_market', {
      p_title: 'Already closed',
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: closeAt,
    })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/create-market.test.ts`
Expected: FAIL — `function create_market(...) does not exist`

- [ ] **Step 3: Write `supabase/migrations/0009_create_market_function.sql`**

```sql
create function create_market(
  p_title text,
  p_description text,
  p_kind text,
  p_outcome_labels text[],
  p_close_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market_id uuid;
  v_label text;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_kind not in ('binary', 'multiple_choice') then
    raise exception 'invalid market kind';
  end if;

  if array_length(p_outcome_labels, 1) is null or array_length(p_outcome_labels, 1) < 2 then
    raise exception 'a market needs at least 2 outcomes';
  end if;

  if p_kind = 'binary' and array_length(p_outcome_labels, 1) <> 2 then
    raise exception 'a binary market must have exactly 2 outcomes';
  end if;

  if array_length(p_outcome_labels, 1) > 6 then
    raise exception 'a market may have at most 6 outcomes';
  end if;

  if p_close_at <= now() then
    raise exception 'close time must be in the future';
  end if;

  insert into public.markets (created_by, title, description, kind, close_at)
  values (auth.uid(), p_title, p_description, p_kind, p_close_at)
  returning id into v_market_id;

  foreach v_label in array p_outcome_labels loop
    insert into public.market_outcomes (market_id, label) values (v_market_id, v_label);
  end loop;

  return v_market_id;
end;
$$;

revoke execute on function create_market(text, text, text, text[], timestamptz) from public;
revoke execute on function create_market(text, text, text, text[], timestamptz) from anon;
grant execute on function create_market(text, text, text, text[], timestamptz) to authenticated;
grant execute on function create_market(text, text, text, text[], timestamptz) to service_role;
```

- [ ] **Step 4: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/create-market.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_create_market_function.sql tests/db/create-market.test.ts
git commit -m "Add create_market: atomically creates a market and its outcomes"
```

---

## Task 3: `place_bet` function

**Files:**
- Create: `supabase/migrations/0010_place_bet_function.sql`
- Create: `tests/db/place-bet.test.ts`

**Interfaces:**
- Consumes: `serviceClient()`, `seedMembers()`, `clientFor()`, `createTestMarket()`, `TestMarket`, `Member` (Task 1); `create_market` (Task 2)
- Produces: the `place_bet(p_market_id uuid, p_outcome_id uuid, p_amount integer) returns void`
  RPC — Task 4/5's `resolve_market` tests and the UI (Task 10) call this.

- [ ] **Step 1: Write `tests/db/place-bet.test.ts` (will fail — function doesn't exist)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('place_bet', () => {
  it('debits the bettor and increases the outcome pool together', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 30,
    })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: profile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(profile?.balance).toBe(70) // 100 starting grant - 30

    const { data: outcome } = await db.from('market_outcomes').select('pool_total').eq('id', outcomeIds[0]).single()
    expect(outcome?.pool_total).toBe(30)
  })

  it('rejects an insufficient balance, leaving the ledger and pool unchanged', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 1000,
    })
    expect(error).not.toBeNull()

    const db = serviceClient()
    const { data: profile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(profile?.balance).toBe(100)

    const { data: outcome } = await db.from('market_outcomes').select('pool_total').eq('id', outcomeIds[0]).single()
    expect(outcome?.pool_total).toBe(0)
  })

  it('rejects betting after close_at', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 10,
    })
    expect(error).not.toBeNull()
  })

  it('rejects an outcome that belongs to a different market', async () => {
    const aliceClient = await clientFor(alice)
    const marketA = await createTestMarket(aliceClient, ['Yes', 'No'])
    const marketB = await createTestMarket(aliceClient, ['Red', 'Blue'])

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketA.marketId,
      p_outcome_id: marketB.outcomeIds[0],
      p_amount: 10,
    })
    expect(error).not.toBeNull()
  })

  it('stacks two bets on the same outcome', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 15 })

    const db = serviceClient()
    const { data: outcome } = await db.from('market_outcomes').select('pool_total').eq('id', outcomeIds[0]).single()
    expect(outcome?.pool_total).toBe(25)

    const { data: profile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(profile?.balance).toBe(75)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/place-bet.test.ts`
Expected: FAIL — `function place_bet(...) does not exist`

- [ ] **Step 3: Write `supabase/migrations/0010_place_bet_function.sql`**

```sql
create function place_bet(p_market_id uuid, p_outcome_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_close_at timestamptz;
  v_outcome_market_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'bet amount must be positive';
  end if;

  select status, close_at into v_status, v_close_at
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status <> 'open' or now() >= v_close_at then
    raise exception 'market is not open for betting';
  end if;

  select market_id into v_outcome_market_id
  from public.market_outcomes
  where id = p_outcome_id;

  if v_outcome_market_id is null or v_outcome_market_id <> p_market_id then
    raise exception 'outcome does not belong to this market';
  end if;

  perform public.apply_coin_transaction(
    auth.uid(), -p_amount, 'bet_placed',
    jsonb_build_object('market_id', p_market_id, 'outcome_id', p_outcome_id)
  );

  insert into public.bets (market_id, outcome_id, profile_id, amount)
  values (p_market_id, p_outcome_id, auth.uid(), p_amount);

  update public.market_outcomes
  set pool_total = pool_total + p_amount
  where id = p_outcome_id;
end;
$$;

revoke execute on function place_bet(uuid, uuid, integer) from public;
revoke execute on function place_bet(uuid, uuid, integer) from anon;
grant execute on function place_bet(uuid, uuid, integer) to authenticated;
grant execute on function place_bet(uuid, uuid, integer) to service_role;
```

- [ ] **Step 4: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/place-bet.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0010_place_bet_function.sql tests/db/place-bet.test.ts
git commit -m "Add place_bet: debits the bettor and grows the outcome pool atomically"
```

---

## Task 4: `resolve_market` — first-time resolution

**Files:**
- Create: `supabase/migrations/0011_resolve_market_function.sql`
- Create: `tests/db/resolve-market.test.ts`

**Interfaces:**
- Consumes: `serviceClient()`, `seedMembers()`, `clientFor()`, `createTestMarket()`, `Member` (Task 1); `place_bet` (Task 3)
- Produces: the `resolve_market(p_market_id uuid, p_outcome_id uuid) returns void`
  RPC — first-resolution behavior only in this task. Task 5 replaces this
  function's body to add admin override/reversal on top; the function
  signature and the payout/refund math established here don't change.

- [ ] **Step 1: Write `tests/db/resolve-market.test.ts` (will fail — function doesn't exist)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('resolve_market (first resolution)', () => {
  it('pays winners in proportion to their stake', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 30 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).toBeNull()

    const db = serviceClient()
    // Total pool 50, Alice's 20 was the entire winning pool -> she gets all 50.
    const { data: aliceProfile } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceProfile?.balance).toBe(100 - 20 + 50)

    const { data: bobProfile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(bobProfile?.balance).toBe(100 - 30)

    const { data: market } = await db.from('markets').select('status, current_resolution_id').eq('id', marketId).single()
    expect(market?.status).toBe('resolved')
    expect(market?.current_resolution_id).not.toBeNull()
  })

  it('refunds everyone when the winning outcome has no bets', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    const bobClient = await clientFor(bob)
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 40 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    // outcomeIds[0] ("Yes") wins, but nobody bet it.
    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: bobProfile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(bobProfile?.balance).toBe(100) // fully refunded
  })

  it('rejects a non-creator, non-admin caller', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).not.toBeNull()
  })

  it('rejects resolving before close_at for a non-admin', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 60_000 })

    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).not.toBeNull()
  })

  it('lets an admin resolve before close_at', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 60_000 })

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const bobClient = await clientFor(bob)

    const { error } = await bobClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(error).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/resolve-market.test.ts`
Expected: FAIL — `function resolve_market(...) does not exist`

- [ ] **Step 3: Write `supabase/migrations/0011_resolve_market_function.sql`**

```sql
create function resolve_market(p_market_id uuid, p_outcome_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_status text;
  v_close_at timestamptz;
  v_outcome_market_id uuid;
  v_total_pool integer;
  v_winning_pool integer;
  v_new_resolution_id uuid;
  v_is_admin boolean;
  v_bet record;
begin
  select created_by, status, close_at into v_created_by, v_status, v_close_at
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status <> 'open' then
    raise exception 'market already resolved or voided';
  end if;

  select public.is_admin() into v_is_admin;

  if not (auth.uid() = v_created_by or v_is_admin) then
    raise exception 'only the market creator or an admin can resolve this market';
  end if;

  if now() < v_close_at and not v_is_admin then
    raise exception 'market has not closed yet';
  end if;

  select market_id into v_outcome_market_id
  from public.market_outcomes
  where id = p_outcome_id;

  if v_outcome_market_id is null or v_outcome_market_id <> p_market_id then
    raise exception 'outcome does not belong to this market';
  end if;

  insert into public.market_resolutions (market_id, outcome_id, resolved_by)
  values (p_market_id, p_outcome_id, auth.uid())
  returning id into v_new_resolution_id;

  update public.markets
  set status = 'resolved', current_resolution_id = v_new_resolution_id
  where id = p_market_id;

  select coalesce(sum(pool_total), 0) into v_total_pool
  from public.market_outcomes where market_id = p_market_id;

  select pool_total into v_winning_pool
  from public.market_outcomes where id = p_outcome_id;

  if v_winning_pool = 0 then
    -- Nobody bet the winning outcome -- there's no one to pay the
    -- losers' money to, so refund every bet instead of manufacturing a
    -- payout or letting the pool vanish.
    for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id, v_bet.amount, 'bet_refunded',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  else
    for v_bet in select profile_id, amount, id from public.bets where outcome_id = p_outcome_id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id,
        floor(v_bet.amount::numeric * v_total_pool / v_winning_pool)::integer,
        'bet_won',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  end if;
end;
$$;

revoke execute on function resolve_market(uuid, uuid) from public;
revoke execute on function resolve_market(uuid, uuid) from anon;
grant execute on function resolve_market(uuid, uuid) to authenticated;
grant execute on function resolve_market(uuid, uuid) to service_role;
```

Note: this version rejects any market whose `status <> 'open'` —
including an already-`'resolved'` one, unconditionally, even for an
admin. Task 5 replaces this function to allow an admin (and only an
admin) to call it again on an already-resolved market, which then
reverses the prior payout and re-resolves.

- [ ] **Step 4: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/resolve-market.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0011_resolve_market_function.sql tests/db/resolve-market.test.ts
git commit -m "Add resolve_market: pari-mutuel payout, refund when winning pool is empty"
```

---

## Task 5: `resolve_market` — admin override and reversal

**Files:**
- Create: `supabase/migrations/0012_resolve_market_override.sql`
- Modify: `tests/db/resolve-market.test.ts`

**Interfaces:**
- Consumes: everything Task 4 consumed, plus Task 4's `resolve_market` (being replaced)
- Produces: no new function name — `resolve_market`'s signature is
  unchanged; only its body changes, adding the override/reversal branch.

- [ ] **Step 1: Append override/reversal tests to `tests/db/resolve-market.test.ts`**

Add this new `describe` block at the end of the file (after the
existing `describe('resolve_market (first resolution)', ...)` block,
same file, same imports already present):

```typescript
describe('resolve_market (admin override)', () => {
  it('reverses the prior payout exactly and re-resolves with the new outcome', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 30 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    // First resolution: "Yes" wins, Alice gets the whole pool.
    await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    const db = serviceClient()
    const { data: aliceAfterFirst } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceAfterFirst?.balance).toBe(100 - 20 + 50)

    // Admin override: it was actually "No" that won.
    await db.from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[1] })
    expect(error).toBeNull()

    const { data: aliceAfterOverride } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceAfterOverride?.balance).toBe(100 - 20) // her win is clawed back, her original bet stays spent

    const { data: bobAfterOverride } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(bobAfterOverride?.balance).toBe(100 - 30 + 50) // Bob now wins the whole pool

    const { data: resolutions } = await db
      .from('market_resolutions')
      .select('outcome_id, reversed_at')
      .eq('market_id', marketId)
      .order('resolved_at', { ascending: true })
    expect(resolutions).toHaveLength(2)
    expect(resolutions?.[0].outcome_id).toBe(outcomeIds[0])
    expect(resolutions?.[0].reversed_at).not.toBeNull()
    expect(resolutions?.[1].outcome_id).toBe(outcomeIds[1])
    expect(resolutions?.[1].reversed_at).toBeNull()
  })

  it('rejects a non-admin trying to change an already-resolved market', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    // Alice is the creator, not an admin -- can't change it once resolved.
    const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[1] })
    expect(error).not.toBeNull()
  })

  it('fails atomically, changing nothing, if reversal would take a past winner negative', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 30 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    const db = serviceClient()
    // Alice won 50 DC and immediately spends nearly all of it elsewhere,
    // so clawing back her win would take her negative.
    const { data: aliceBalance } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    await db.rpc('apply_coin_transaction', {
      p_profile_id: alice.id,
      p_amount: -(aliceBalance!.balance - 5),
      p_type: 'test_spend',
    })

    await db.from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[1] })
    expect(error).not.toBeNull()

    // Nothing changed: original resolution still active, nobody's balance moved.
    const { data: market } = await db.from('markets').select('current_resolution_id').eq('id', marketId).single()
    const { data: resolution } = await db
      .from('market_resolutions')
      .select('outcome_id, reversed_at')
      .eq('id', market!.current_resolution_id)
      .single()
    expect(resolution?.outcome_id).toBe(outcomeIds[0])
    expect(resolution?.reversed_at).toBeNull()

    const { data: aliceAfter } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceAfter?.balance).toBe(5)
  })
})
```

- [ ] **Step 2: Run the test to verify the new cases fail**

Run: `npx vitest run tests/db/resolve-market.test.ts`
Expected: the 3 new tests FAIL — `resolve_market` still unconditionally
rejects a `'resolved'` market

- [ ] **Step 3: Write `supabase/migrations/0012_resolve_market_override.sql`**

This replaces the function body from Task 4 with one that adds the
override/reversal branch. Same signature, same grants (still in effect
from `0011`, so no need to repeat them — `create or replace function`
doesn't reset grants).

```sql
create or replace function resolve_market(p_market_id uuid, p_outcome_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_status text;
  v_close_at timestamptz;
  v_current_resolution_id uuid;
  v_outcome_market_id uuid;
  v_total_pool integer;
  v_winning_pool integer;
  v_new_resolution_id uuid;
  v_is_admin boolean;
  v_txn record;
  v_bet record;
begin
  select created_by, status, close_at, current_resolution_id
    into v_created_by, v_status, v_close_at, v_current_resolution_id
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status = 'voided' then
    raise exception 'market was voided';
  end if;

  select public.is_admin() into v_is_admin;

  if v_status = 'resolved' then
    -- Overriding an already-resolved market: admin only. This is the
    -- clawback path.
    if not v_is_admin then
      raise exception 'only an admin can change an already-resolved market';
    end if;
  else
    -- First-time resolution: the creator or an admin. Only once closed,
    -- unless an admin is resolving early.
    if not (auth.uid() = v_created_by or v_is_admin) then
      raise exception 'only the market creator or an admin can resolve this market';
    end if;
    if now() < v_close_at and not v_is_admin then
      raise exception 'market has not closed yet';
    end if;
  end if;

  select market_id into v_outcome_market_id
  from public.market_outcomes
  where id = p_outcome_id;

  if v_outcome_market_id is null or v_outcome_market_id <> p_market_id then
    raise exception 'outcome does not belong to this market';
  end if;

  -- Reverse the currently-active resolution's payouts, if there is one.
  -- Every payout/refund a resolution makes carries that resolution's own
  -- id in meta, so this targets exactly (and only) those transactions --
  -- never a later resolution's, never an unrelated bet.
  if v_current_resolution_id is not null then
    for v_txn in
      select profile_id, amount, id
      from public.coin_transactions
      where (meta ->> 'resolution_id')::uuid = v_current_resolution_id
    loop
      perform public.apply_coin_transaction(
        v_txn.profile_id, -v_txn.amount, 'resolution_reversed',
        jsonb_build_object(
          'market_id', p_market_id,
          'reversed_resolution_id', v_current_resolution_id,
          'original_transaction_id', v_txn.id
        )
      );
    end loop;

    update public.market_resolutions
    set reversed_at = now(), reversed_by = auth.uid()
    where id = v_current_resolution_id;
  end if;

  insert into public.market_resolutions (market_id, outcome_id, resolved_by)
  values (p_market_id, p_outcome_id, auth.uid())
  returning id into v_new_resolution_id;

  update public.markets
  set status = 'resolved', current_resolution_id = v_new_resolution_id
  where id = p_market_id;

  select coalesce(sum(pool_total), 0) into v_total_pool
  from public.market_outcomes where market_id = p_market_id;

  select pool_total into v_winning_pool
  from public.market_outcomes where id = p_outcome_id;

  if v_winning_pool = 0 then
    for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id, v_bet.amount, 'bet_refunded',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  else
    for v_bet in select profile_id, amount, id from public.bets where outcome_id = p_outcome_id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id,
        floor(v_bet.amount::numeric * v_total_pool / v_winning_pool)::integer,
        'bet_won',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  end if;
end;
$$;
```

- [ ] **Step 4: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/resolve-market.test.ts`
Expected: PASS (8 tests total — 5 from Task 4 plus 3 new)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0012_resolve_market_override.sql tests/db/resolve-market.test.ts
git commit -m "Add admin override to resolve_market: reverse a prior resolution's payout and re-resolve"
```

---

## Task 6: `void_market` function

**Files:**
- Create: `supabase/migrations/0013_void_market_function.sql`
- Create: `tests/db/void-market.test.ts`

**Interfaces:**
- Consumes: `serviceClient()`, `seedMembers()`, `clientFor()`, `createTestMarket()`, `Member` (Task 1); `place_bet` (Task 3)
- Produces: the `void_market(p_market_id uuid) returns void` RPC — the
  UI (Task 10) calls this.

- [ ] **Step 1: Write `tests/db/void-market.test.ts` (will fail — function doesn't exist)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('void_market', () => {
  it('refunds every bet on the market', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 30 })

    const { error } = await aliceClient.rpc('void_market', { p_market_id: marketId })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: aliceProfile } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceProfile?.balance).toBe(100)

    const { data: bobProfile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(bobProfile?.balance).toBe(100)

    const { data: market } = await db.from('markets').select('status').eq('id', marketId).single()
    expect(market?.status).toBe('voided')
  })

  it('rejects voiding an already-resolved market', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)
    await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    const { error } = await aliceClient.rpc('void_market', { p_market_id: marketId })
    expect(error).not.toBeNull()
  })

  it('rejects a non-creator, non-admin caller', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('void_market', { p_market_id: marketId })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/void-market.test.ts`
Expected: FAIL — `function void_market(...) does not exist`

- [ ] **Step 3: Write `supabase/migrations/0013_void_market_function.sql`**

```sql
create function void_market(p_market_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_status text;
  v_bet record;
begin
  select created_by, status into v_created_by, v_status
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status <> 'open' then
    raise exception 'only an unresolved, unvoided market can be voided';
  end if;

  if not (auth.uid() = v_created_by or public.is_admin()) then
    raise exception 'only the market creator or an admin can void this market';
  end if;

  update public.markets set status = 'voided' where id = p_market_id;

  for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id loop
    perform public.apply_coin_transaction(
      v_bet.profile_id, v_bet.amount, 'bet_voided_refund',
      jsonb_build_object('market_id', p_market_id, 'bet_id', v_bet.id)
    );
  end loop;
end;
$$;

revoke execute on function void_market(uuid) from public;
revoke execute on function void_market(uuid) from anon;
grant execute on function void_market(uuid) to authenticated;
grant execute on function void_market(uuid) to service_role;
```

- [ ] **Step 4: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/void-market.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0013_void_market_function.sql tests/db/void-market.test.ts
git commit -m "Add void_market: refunds everyone, only while a market is still open"
```

---

## Task 7: RLS policies

This is the security boundary for the new tables — matching Foundation's
pattern, every write already routes exclusively through the four
functions above (each with its own internal permission check), so this
task only needs `select`-only policies plus `service_role` access (which
each earlier task already granted per-object; this task double-checks
that and adds the `select` policies for `authenticated`).

**Files:**
- Create: `supabase/migrations/0014_market_rls_policies.sql`
- Create: `tests/db/market-rls.test.ts`

**Interfaces:**
- Consumes: `serviceClient()`, `seedMembers()`, `clientFor()`, `createTestMarket()`, `Member` (Task 1); `is_invited()`, `is_admin()` (Foundation); `place_bet` (Task 3)

- [ ] **Step 1: Write `tests/db/market-rls.test.ts` (will fail — no select grant/policy yet)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('markets/market_outcomes/market_resolutions select policy', () => {
  it('an invited member can read markets and outcomes', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const { data: markets, error: marketsErr } = await aliceClient.from('markets').select('id').eq('id', marketId)
    expect(marketsErr).toBeNull()
    expect(markets).toHaveLength(1)

    const { data: outcomes, error: outcomesErr } = await aliceClient
      .from('market_outcomes')
      .select('id')
      .eq('market_id', marketId)
    expect(outcomesErr).toBeNull()
    expect(outcomes).toHaveLength(2)
  })

  it('a non-invited authenticated session sees zero rows', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId } = await createTestMarket(aliceClient, ['Yes', 'No'])

    // Bob is a seedMembers() fixture member -- never actually invited
    // (no allowed_emails row) -- so is_invited() is false for him,
    // exactly like Foundation's select_all_profiles behaves.
    const bobClient = await clientFor(bob)
    const { data, error } = await bobClient.from('markets').select('id').eq('id', marketId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('bets select policy', () => {
  it("shows a member only their own bets", async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 10 })

    const { data, error } = await aliceClient.from('bets').select('profile_id')
    expect(error).toBeNull()
    expect(data?.every((b) => b.profile_id === alice.id)).toBe(true)
  })

  it('shows an admin every bet', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 10 })

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
    const adminClient = await clientFor(alice)
    const { data, error } = await adminClient.from('bets').select('profile_id')
    expect(error).toBeNull()
    const profileIds = new Set(data?.map((b) => b.profile_id))
    expect(profileIds.has(alice.id)).toBe(true)
    expect(profileIds.has(bob.id)).toBe(true)
  })
})

describe('direct table writes', () => {
  it('rejects a direct insert into markets, bypassing create_market', async () => {
    const aliceClient = await clientFor(alice)
    const { error } = await aliceClient.from('markets').insert({
      created_by: alice.id,
      title: 'Sneaky',
      kind: 'binary',
      close_at: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(error).not.toBeNull()
  })

  it('rejects a direct insert into bets, bypassing place_bet', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const { error } = await aliceClient.from('bets').insert({
      market_id: marketId,
      outcome_id: outcomeIds[0],
      profile_id: alice.id,
      amount: 10,
    })
    expect(error).not.toBeNull()

    const db = serviceClient()
    const { count } = await db.from('bets').select('*', { count: 'exact', head: true }).eq('market_id', marketId)
    expect(count).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/market-rls.test.ts`
Expected: FAIL — every `select` against these tables errors with
"permission denied" (no grant yet), and the "rejects a direct insert"
tests fail because there's no RLS blocking them yet either

- [ ] **Step 3: Write `supabase/migrations/0014_market_rls_policies.sql`**

```sql
alter table public.markets enable row level security;
alter table public.market_outcomes enable row level security;
alter table public.bets enable row level security;
alter table public.market_resolutions enable row level security;

grant select on public.markets to authenticated;
grant select on public.market_outcomes to authenticated;
grant select on public.bets to authenticated;
grant select on public.market_resolutions to authenticated;

create policy select_markets on public.markets for select to authenticated
  using (is_invited());
create policy select_market_outcomes on public.market_outcomes for select to authenticated
  using (is_invited());
create policy select_own_or_admin_bets on public.bets for select to authenticated
  using (profile_id = auth.uid() or is_admin());
create policy select_market_resolutions on public.market_resolutions for select to authenticated
  using (is_invited());
```

Note: no `insert`/`update`/`delete` grant is added for `authenticated`
on any of these four tables — none has ever existed, and none should.
`service_role` already has `grant all` (from Task 1's migration) and
`EXECUTE` on all four functions (from each function's own migration),
so this migration adds nothing new for it.

- [ ] **Step 4: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/market-rls.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full DB suite**

Run: `npx vitest run tests/db`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0014_market_rls_policies.sql tests/db/market-rls.test.ts
git commit -m "Add RLS select policies for markets, market_outcomes, bets, market_resolutions"
```

---

## Task 8: Market feed

**Files:**
- Create: `lib/markets/odds.ts`
- Create: `lib/markets/list-markets.ts`
- Create: `app/markets/page.tsx`

**Interfaces:**
- Consumes: `requireUser()` (Foundation)
- Produces: `OutcomeOdds { outcomeId: string; label: string; poolTotal: number; impliedProbability: number | null }`,
  `computeOdds(outcomes: { id: string; label: string; pool_total: number }[]): OutcomeOdds[]`
  (`lib/markets/odds.ts`); `MarketSummary { id: string; title: string; kind: 'binary' | 'multiple_choice'; status: 'open' | 'resolved' | 'voided'; closeAt: string; outcomes: { id: string; label: string; poolTotal: number }[] }`,
  `listMarkets(supabase: SupabaseClient): Promise<MarketSummary[]>`
  (`lib/markets/list-markets.ts`) — Task 10's detail page reuses `computeOdds`.

- [ ] **Step 1: Write `tests/lib/markets/odds.test.ts` (a plain unit test — no DB needed)**

```typescript
import { describe, it, expect } from 'vitest'
import { computeOdds } from '@/lib/markets/odds'

describe('computeOdds', () => {
  it('computes implied probability from pool totals', () => {
    const result = computeOdds([
      { id: 'a', label: 'Yes', pool_total: 30 },
      { id: 'b', label: 'No', pool_total: 70 },
    ])
    expect(result).toEqual([
      { outcomeId: 'a', label: 'Yes', poolTotal: 30, impliedProbability: 0.3 },
      { outcomeId: 'b', label: 'No', poolTotal: 70, impliedProbability: 0.7 },
    ])
  })

  it('returns null probability for every outcome when nothing has been bet', () => {
    const result = computeOdds([
      { id: 'a', label: 'Yes', pool_total: 0 },
      { id: 'b', label: 'No', pool_total: 0 },
    ])
    expect(result.every((o) => o.impliedProbability === null)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/markets/odds.test.ts`
Expected: FAIL — cannot find module `@/lib/markets/odds`

- [ ] **Step 3: Write `lib/markets/odds.ts`**

```typescript
export interface OutcomeOdds {
  outcomeId: string
  label: string
  poolTotal: number
  impliedProbability: number | null
}

export function computeOdds(outcomes: { id: string; label: string; pool_total: number }[]): OutcomeOdds[] {
  const totalPool = outcomes.reduce((sum, o) => sum + o.pool_total, 0)
  return outcomes.map((o) => ({
    outcomeId: o.id,
    label: o.label,
    poolTotal: o.pool_total,
    impliedProbability: totalPool > 0 ? o.pool_total / totalPool : null,
  }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/markets/odds.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `lib/markets/list-markets.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MarketSummary {
  id: string
  title: string
  kind: 'binary' | 'multiple_choice'
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  outcomes: { id: string; label: string; poolTotal: number }[]
}

export async function listMarkets(supabase: SupabaseClient): Promise<MarketSummary[]> {
  const { data, error } = await supabase
    .from('markets')
    .select('id, title, kind, status, close_at, market_outcomes(id, label, pool_total)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    kind: m.kind,
    status: m.status,
    closeAt: m.close_at,
    outcomes: (m.market_outcomes ?? []).map((o: { id: string; label: string; pool_total: number }) => ({
      id: o.id,
      label: o.label,
      poolTotal: o.pool_total,
    })),
  }))
}
```

- [ ] **Step 6: Write `app/markets/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { listMarkets } from '@/lib/markets/list-markets'
import { computeOdds } from '@/lib/markets/odds'

export default async function MarketsPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const markets = await listMarkets(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Markets</h1>
        <Link href="/markets/new" className="text-sm underline">
          New market
        </Link>
      </div>
      <ul className="mt-6 space-y-4">
        {markets.map((market) => {
          const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))
          return (
            <li key={market.id} className="border p-4">
              <Link href={`/markets/${market.id}`} className="font-medium underline">
                {market.title}
              </Link>
              <p className="text-sm text-foreground/70">{market.status}</p>
              <ul className="mt-2 text-sm">
                {odds.map((o) => (
                  <li key={o.outcomeId}>
                    {o.label}: {o.impliedProbability === null ? 'no bets yet' : `${Math.round(o.impliedProbability * 100)}%`}
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 7: Run the full test suite and the build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS, build succeeds

- [ ] **Step 8: Commit**

```bash
git add lib/markets/odds.ts lib/markets/list-markets.ts app/markets/page.tsx tests/lib/markets/odds.test.ts
git commit -m "Add market feed: implied odds from pool totals, list page"
```

---

## Task 9: Create-market UI

**Files:**
- Create: `lib/markets/create-market.ts`
- Create: `app/markets/new/page.tsx`
- Create: `app/markets/new/create-market-form.tsx`

**Interfaces:**
- Consumes: `requireUser()` (Foundation)
- Produces: `ActionState = { formError?: string } | undefined`,
  `createMarketAction(prevState: ActionState, formData: FormData): Promise<ActionState>`
  (`lib/markets/create-market.ts`) — this exact `ActionState` shape is
  reused by Task 10's `place-bet.ts`, `resolve-market.ts`, `void-market.ts`.

- [ ] **Step 1: Write `lib/markets/create-market.ts`**

```typescript
'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function createMarketAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const kind = String(formData.get('kind') ?? '')
  const closeAtRaw = String(formData.get('close_at') ?? '')

  if (!title) return { formError: 'Enter a title.' }
  if (kind !== 'binary' && kind !== 'multiple_choice') return { formError: 'Choose a market kind.' }
  if (!closeAtRaw) return { formError: 'Choose a close time.' }

  const outcomeLabels =
    kind === 'binary'
      ? formData.getAll('outcome_labels').map(String)
      : String(formData.get('outcome_labels_text') ?? '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)

  const closeAt = new Date(closeAtRaw).toISOString()

  const { data: marketId, error } = await supabase.rpc('create_market', {
    p_title: title,
    p_description: description || null,
    p_kind: kind,
    p_outcome_labels: outcomeLabels,
    p_close_at: closeAt,
  })

  if (error) return { formError: error.message }

  redirect(`/markets/${marketId}`)
}
```

- [ ] **Step 2: Write `app/markets/new/create-market-form.tsx`**

```typescript
'use client'

import { useActionState, useState } from 'react'
import { createMarketAction, type ActionState } from '@/lib/markets/create-market'

export function CreateMarketForm() {
  const [kind, setKind] = useState<'binary' | 'multiple_choice'>('binary')
  const [state, formAction] = useActionState<ActionState, FormData>(createMarketAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        Title
        <input name="title" required className="border px-2 py-1" />
      </label>

      <label className="flex flex-col gap-1">
        Description
        <textarea name="description" className="border px-2 py-1" />
      </label>

      <fieldset className="flex gap-4">
        <label>
          <input type="radio" name="kind" value="binary" checked={kind === 'binary'} onChange={() => setKind('binary')} />{' '}
          Yes/No
        </label>
        <label>
          <input
            type="radio"
            name="kind"
            value="multiple_choice"
            checked={kind === 'multiple_choice'}
            onChange={() => setKind('multiple_choice')}
          />{' '}
          Multiple choice
        </label>
      </fieldset>

      {kind === 'binary' ? (
        <>
          <input type="hidden" name="outcome_labels" value="Yes" />
          <input type="hidden" name="outcome_labels" value="No" />
        </>
      ) : (
        <label className="flex flex-col gap-1">
          Outcomes (one per line, 2-6)
          <textarea name="outcome_labels_text" rows={4} className="border px-2 py-1" placeholder={'Option A\nOption B'} />
        </label>
      )}

      <label className="flex flex-col gap-1">
        Close time
        <input name="close_at" type="datetime-local" required className="border px-2 py-1" />
      </label>

      <button type="submit">Create market</button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Write `app/markets/new/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { CreateMarketForm } from './create-market-form'

export default async function NewMarketPage() {
  const { user } = await requireUser()
  if (!user) redirect('/sign-in')

  return (
    <div className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-semibold">New market</h1>
      <div className="mt-4">
        <CreateMarketForm />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the full test suite and the build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS, build succeeds

- [ ] **Step 5: Commit**

```bash
git add lib/markets/create-market.ts app/markets/new
git commit -m "Add create-market UI: binary or multiple-choice, close time picker"
```

---

## Task 10: Market detail page (betting, resolving, voiding)

**Files:**
- Create: `lib/markets/get-market.ts`
- Create: `lib/markets/place-bet.ts`
- Create: `lib/markets/resolve-market.ts`
- Create: `lib/markets/void-market.ts`
- Create: `app/markets/[id]/page.tsx`
- Create: `app/markets/[id]/bet-form.tsx`
- Create: `app/markets/[id]/resolve-form.tsx`
- Create: `app/markets/[id]/void-button.tsx`

**Interfaces:**
- Consumes: `requireUser()`, `isAdmin()` (Foundation); `computeOdds` (Task 8); `ActionState` (Task 9)
- Produces: `MarketDetail { id, title, description, kind, status, closeAt, createdBy, currentResolutionId, outcomes }`,
  `OwnBet { id: number; outcomeId: string; amount: number; createdAt: string }`,
  `getMarket(supabase, marketId): Promise<MarketDetail | null>`,
  `getOwnBets(supabase, marketId, userId): Promise<OwnBet[]>` (`lib/markets/get-market.ts`)

Next.js 16 breaking change: this project's installed Next.js version
deprecates the `{ params: Promise<...> }` inline type in favor of a
globally-generated `PageProps<'/route/[param]'>` helper (the same kind
of thing Foundation's `app/layout.tsx` already uses via `LayoutProps<"/">`).
Confirmed against `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
— the code below already uses this correctly
(`PageProps<'/markets/[id]'>`, `await props.params`); no need to
re-derive it, but if anything about dynamic route typing looks off when
you run the build, that doc is where to check first.

- [ ] **Step 1: Write `lib/markets/get-market.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MarketDetail {
  id: string
  title: string
  description: string | null
  kind: 'binary' | 'multiple_choice'
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  createdBy: string
  currentResolutionId: string | null
  outcomes: { id: string; label: string; poolTotal: number }[]
}

export interface OwnBet {
  id: number
  outcomeId: string
  amount: number
  createdAt: string
}

export async function getMarket(supabase: SupabaseClient, marketId: string): Promise<MarketDetail | null> {
  const { data, error } = await supabase
    .from('markets')
    .select(
      'id, title, description, kind, status, close_at, created_by, current_resolution_id, market_outcomes(id, label, pool_total)',
    )
    .eq('id', marketId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    kind: data.kind,
    status: data.status,
    closeAt: data.close_at,
    createdBy: data.created_by,
    currentResolutionId: data.current_resolution_id,
    outcomes: (data.market_outcomes ?? []).map((o: { id: string; label: string; pool_total: number }) => ({
      id: o.id,
      label: o.label,
      poolTotal: o.pool_total,
    })),
  }
}

export async function getOwnBets(supabase: SupabaseClient, marketId: string, userId: string): Promise<OwnBet[]> {
  const { data, error } = await supabase
    .from('bets')
    .select('id, outcome_id, amount, created_at')
    .eq('market_id', marketId)
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((b) => ({ id: b.id, outcomeId: b.outcome_id, amount: b.amount, createdAt: b.created_at }))
}
```

- [ ] **Step 2: Write `lib/markets/place-bet.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function placeBetAction(marketId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const outcomeId = String(formData.get('outcome_id') ?? '')
  const amountRaw = String(formData.get('amount') ?? '')
  const amount = Number(amountRaw)

  if (!outcomeId) return { formError: 'Choose an outcome.' }
  if (!Number.isInteger(amount) || amount <= 0) return { formError: 'Enter a whole number of DC greater than 0.' }

  const { error } = await supabase.rpc('place_bet', {
    p_market_id: marketId,
    p_outcome_id: outcomeId,
    p_amount: amount,
  })

  if (error) return { formError: error.message }

  revalidatePath(`/markets/${marketId}`)
  return undefined
}
```

- [ ] **Step 3: Write `lib/markets/resolve-market.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function resolveMarketAction(
  marketId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const outcomeId = String(formData.get('outcome_id') ?? '')
  if (!outcomeId) return { formError: 'Choose the winning outcome.' }

  const { error } = await supabase.rpc('resolve_market', {
    p_market_id: marketId,
    p_outcome_id: outcomeId,
  })

  if (error) return { formError: error.message }

  revalidatePath(`/markets/${marketId}`)
  return undefined
}
```

- [ ] **Step 4: Write `lib/markets/void-market.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function voidMarketAction(
  marketId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('void_market', { p_market_id: marketId })

  if (error) return { formError: error.message }

  revalidatePath(`/markets/${marketId}`)
  return undefined
}
```

- [ ] **Step 5: Write the three small client components**

`app/markets/[id]/bet-form.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { placeBetAction, type ActionState } from '@/lib/markets/place-bet'

export function BetForm({ marketId, outcomes }: { marketId: string; outcomes: { id: string; label: string }[] }) {
  const boundAction = placeBetAction.bind(null, marketId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-2">
      <select name="outcome_id" required className="border px-2 py-1">
        {outcomes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <input name="amount" type="number" min="1" step="1" required placeholder="Amount (DC)" className="border px-2 py-1" />
      <button type="submit">Place bet</button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
```

`app/markets/[id]/resolve-form.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { resolveMarketAction, type ActionState } from '@/lib/markets/resolve-market'

export function ResolveForm({ marketId, outcomes }: { marketId: string; outcomes: { id: string; label: string }[] }) {
  const boundAction = resolveMarketAction.bind(null, marketId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <select name="outcome_id" required className="border px-2 py-1">
        {outcomes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="submit">Confirm outcome</button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
```

`app/markets/[id]/void-button.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { voidMarketAction, type ActionState } from '@/lib/markets/void-market'

export function VoidButton({ marketId }: { marketId: string }) {
  const boundAction = voidMarketAction.bind(null, marketId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className="mt-4">
      <button type="submit" className="text-sm text-red-600 underline">
        Void this market
      </button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
```

- [ ] **Step 6: Write `app/markets/[id]/page.tsx`**

```typescript
import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { getMarket, getOwnBets } from '@/lib/markets/get-market'
import { computeOdds } from '@/lib/markets/odds'
import { BetForm } from './bet-form'
import { ResolveForm } from './resolve-form'
import { VoidButton } from './void-button'

export default async function MarketDetailPage(props: PageProps<'/markets/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const market = await getMarket(supabase, id)
  if (!market) notFound()

  const ownBets = await getOwnBets(supabase, id, user.id)
  const admin = await isAdmin(supabase)
  const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))

  const isCreator = market.createdBy === user.id
  const isPastClose = new Date(market.closeAt).getTime() <= Date.now()
  const canBet = market.status === 'open' && !isPastClose
  const canResolve = market.status === 'open' && ((isCreator && isPastClose) || admin)
  const canOverride = market.status === 'resolved' && admin
  const canVoid = market.status === 'open' && (isCreator || admin)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">{market.title}</h1>
      {market.description && <p className="mt-1 text-sm text-foreground/70">{market.description}</p>}
      <p className="mt-1 text-sm">Status: {market.status}</p>

      <ul className="mt-4 space-y-1">
        {odds.map((o) => (
          <li key={o.outcomeId}>
            {o.label} — {o.impliedProbability === null ? 'no bets yet' : `${Math.round(o.impliedProbability * 100)}%`} (
            {o.poolTotal} DC)
          </li>
        ))}
      </ul>

      {canBet && <BetForm marketId={market.id} outcomes={market.outcomes} />}

      {ownBets.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold">Your bets</h2>
          <ul className="text-sm">
            {ownBets.map((b) => {
              const outcome = market.outcomes.find((o) => o.id === b.outcomeId)
              return (
                <li key={b.id}>
                  {b.amount} DC on {outcome?.label ?? 'unknown outcome'}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {(canResolve || canOverride) && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold">{canOverride ? 'Override resolution' : 'Resolve market'}</h2>
          <ResolveForm marketId={market.id} outcomes={market.outcomes} />
        </div>
      )}

      {canVoid && <VoidButton marketId={market.id} />}
    </div>
  )
}
```

- [ ] **Step 7: Run the full test suite and the build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS, build succeeds. If the build reports a type
error on `PageProps<'/markets/[id]'>`, re-read the Next.js doc cited
above — do not fall back to a hand-written `params` type without
checking it first.

- [ ] **Step 8: Commit**

```bash
git add lib/markets/get-market.ts lib/markets/place-bet.ts lib/markets/resolve-market.ts lib/markets/void-market.ts "app/markets/[id]"
git commit -m "Add market detail page: betting, resolving, voiding, admin override"
```

---

## Task 11: End-to-end wiring

**Files:**
- Create: `e2e/market-engine.spec.ts`

**Interfaces:**
- Consumes: the seeded, admin-promoted session `e2e/global-setup.ts` already provides (Foundation)

- [ ] **Step 1: Write `e2e/market-engine.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

test('create a market, place a bet, and resolve it as admin', async ({ page }) => {
  await page.goto('/markets/new')

  await page.getByLabel('Title').fill('Will it rain tomorrow?')
  const closeAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)
  await page.getByLabel('Close time').fill(closeAt)
  await page.getByRole('button', { name: 'Create market' }).click()

  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  await expect(page.getByRole('heading', { name: 'Will it rain tomorrow?' })).toBeVisible()

  await page.getByRole('combobox').first().selectOption({ label: 'Yes' })
  await page.getByPlaceholder('Amount (DC)').fill('20')
  await page.getByRole('button', { name: 'Place bet' }).click()

  await expect(page.getByText('20 DC on Yes')).toBeVisible()

  // The seeded session is promoted to admin (e2e/global-setup.ts), so it
  // can resolve immediately without waiting for close_at.
  await page.getByRole('combobox').last().selectOption({ label: 'Yes' })
  await page.getByRole('button', { name: 'Confirm outcome' }).click()

  await expect(page.getByText('Status: resolved')).toBeVisible()
})
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run db:reset && npx playwright test`
Expected: PASS (this new test plus Foundation's 3 existing ones — 4 total)

- [ ] **Step 3: Run everything (lint, unit+DB tests, build, e2e)**

Run: `npm run lint && npx vitest run && npm run build && npx playwright test`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/market-engine.spec.ts
git commit -m "Add e2e test: create market, bet, admin-resolve"
```

---

## Task 12: Documentation and CI-version verification

**Files:**
- Modify: `README.md`

**Interfaces:** none — documentation only, plus a verification pass.

- [ ] **Step 1: Update `README.md`'s status line**

Replace:

```markdown
**Status:** Foundation complete — Google sign-in (invite-only), a single
admin account, and a coin ledger. No betting features yet.
```

with:

```markdown
**Status:** Foundation + Market Engine complete — Google sign-in
(invite-only), a single admin account, a Dwell Coin (DC) ledger, and a
pari-mutuel betting market (create, bet, resolve, admin override).
```

- [ ] **Step 2: Verify the full chain against the exact Supabase CLI version CI pins**

This is not optional — it's how Foundation's `service_role` gap reached
production before being caught. Run:

```bash
npx -y supabase@2.115.0 stop --no-backup
npx -y supabase@2.115.0 start
npm run lint
npx vitest run
npm run build
npx -y supabase@2.115.0 db reset
npx playwright test
```

Expected: every step PASS, using this exact CLI version, not whatever's
installed globally.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document Market Engine in README"
```

---

## Self-Review

**Spec coverage:**
- Binary + multiple-choice markets, pari-mutuel pooling → Tasks 1-3 ✓
- Creator resolves, admin can resolve early or override an already-resolved market with reversal → Tasks 4-5 ✓
- Rounding always down, never up → Task 4/5's `floor()` math ✓
- Reversal fails atomically rather than partially clawing back → Task 5's third test ✓
- Voiding, one-way, only while open → Task 6 ✓
- No table ever gets a write grant for `authenticated`; `service_role` granted explicitly per-object as each is created (not batched at the end) → every migration in Tasks 1-6, verified in Task 7 ✓
- RLS: markets/outcomes/resolutions visible only to invited members, bets private to the bettor + admin, direct writes rejected → Task 7 ✓
- Market feed with live implied odds, create-market form, detail page with bet/resolve/void/override → Tasks 8-10 ✓
- Dwell Coin (DC) display naming → all new UI copy in Tasks 8-10 ✓
- `useActionState`-compatible actions (no silent failures) → Tasks 9-10 ✓
- e2e smoke test → Task 11 ✓
- CI-pinned-version verification (carrying forward Foundation's lesson) → Task 12 ✓

**Placeholder scan:** none found — every step has complete, real code.

**Type consistency:** `TestMarket { marketId, outcomeIds }` (Task 1) used
identically in Tasks 3-7. `ActionState = { formError?: string } | undefined`
(Task 9) reused verbatim in Task 10's three action files. `MarketDetail`/
`OwnBet` (Task 10) field names (`createdBy`, `closeAt`, `outcomeId`, camelCase
throughout the TS layer, matching Foundation's `InviteRow` convention)
match exactly between `get-market.ts` and `[id]/page.tsx`'s usage.
`computeOdds`'s input shape (`{ id, label, pool_total }`, snake_case
`pool_total` matching the raw DB column) is used identically in both
Task 8's feed page and Task 10's detail page.

**Caught and fixed during this self-review:** `create_market()` requires
`is_invited()`, but `seedMembers()`/`makeMember()` (Foundation's fixture
helpers) deliberately bypass the real invite flow and never insert an
`allowed_emails` row — meaning every test that creates a market via a
fixture member would have failed with "not invited" before ever
reaching the behavior under test. This would have broken essentially
every test in Tasks 2-7. Fixed by adding `ensureInvited()` to
`tests/db/fixtures.ts` (Task 1) and calling it from `createTestMarket`
and directly from all four of Task 2's tests (the only place that calls
the `create_market` RPC without going through `createTestMarket`).
Deliberately scoped to a new, narrow helper rather than baked into the
shared `makeMember()`/`seedMembers()` fixture itself, which would have
broken `tests/db/list-invites.test.ts` (a plain `.insert()`, not
`upsert`, for `admin.email` — colliding with an auto-inserted row).
