# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google sign-in gated to an invite-only Gmail allowlist, a single
permanent admin account, and a coin balance per user that's provably
accurate by construction — the foundation every later DwellDuel
sub-project (markets, coin-earning tasks, parlays, social, admin) builds on.

**Architecture:** Supabase Postgres does the heavy lifting — RLS policies
and `SECURITY DEFINER` functions enforce the invite gate and the ledger
invariant at the database layer, not in app code, so the guarantees hold
regardless of what calls them later. Next.js App Router provides just
enough UI (sign-in, a home shell, an admin invites page) to prove the
whole pipeline end-to-end. This adapts platinum-club's proven
invite-gate/ledger pattern (same author, same stack) rather than
re-deriving it, applying the security fixes it needed as follow-up
migrations from the start instead.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Supabase
(`@supabase/ssr`, `@supabase/supabase-js`) + Vitest + Playwright, all
already installed in this repo.

**Spec:** [`docs/superpowers/specs/2026-09-22-foundation-design.md`](../specs/2026-09-22-foundation-design.md)
— read it alongside this plan. This plan fills in the exact file paths,
grants, and test code the spec's SQL sketches didn't spell out (in
particular: explicit table-level `GRANT`s, including column-restricted
`INSERT` grants on `profiles`, which the spec's RLS section implies but
doesn't show).

## Global Constraints

- Migrations: sequential, zero-padded numbering (`00NN_description.sql`)
  in `supabase/migrations/`. Never edit a past migration in place.
- Every `SECURITY DEFINER` function: `set search_path = ''` with fully
  schema-qualified (`public.table`) references, and its `EXECUTE` grants
  (revoke from `public`/`anon`, grant to `authenticated` only where the
  spec calls for it) set explicitly in the same migration that creates it.
- The coin-ledger primitive (`apply_coin_transaction`) is never granted
  `EXECUTE` to `authenticated` — only its owner (via the trigger) can call
  it. See the spec's "reliability guarantee" section for why.
- Starting balance is exactly 100 coins, granted once per profile by the
  `on_profile_created` trigger — never anywhere else in this plan.
- `tests/db/helpers.ts`'s `serviceClient()` refuses to run against
  anything but `localhost`/`127.0.0.1` — this suite is destructive
  (wipes all profiles/invites/transactions/auth users between tests).
- Vitest config: `environment: 'node'`, `fileParallelism: false` (the DB
  suite shares one local Postgres instance across files; parallel files
  wiping the same tables would race).
- No unrequested scope creep: this plan implements exactly the spec's
  Foundation scope. Markets, coin-earning tasks, parlays, social, and
  admin controls beyond the invite list are out of scope here.
- Comments explain why, not what; default to no comments.

**Before Task 1:** `npm run db:start`, then populate `.env.local` from
`npx supabase status` per `README.md` — every task's tests depend on
this local Supabase instance being up.

---

## Task 1: DB test harness + core tables

**Files:**
- Create: `tests/db/helpers.ts`
- Create: `tests/db/fixtures.ts`
- Create: `tests/db/schema.test.ts`
- Create: `supabase/migrations/0001_core_tables.sql`
- Modify: `vitest.config.mts`

**Interfaces:**
- Produces: `serviceClient(): SupabaseClient` (helpers.ts) — a
  service-role client, refuses to run against non-local Supabase.
- Produces: `Member { id: string; email: string; displayName: string }`,
  `makeAuthUserWithoutProfile(email: string): Promise<string>`,
  `makeMember(displayName: string): Promise<Member>`,
  `seedMembers(): Promise<[Member, Member]>`,
  `clientForEmail(email: string): Promise<SupabaseClient>`,
  `clientFor(member: Member): Promise<SupabaseClient>`,
  `sessionCookieHeader(client: SupabaseClient): Promise<string>`
  (fixtures.ts) — every later task's tests, and `e2e/global-setup.ts`
  (Task 9), consume these.

- [ ] **Step 1: Write `tests/db/helpers.ts`**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

function assertLocal(url: string): void {
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

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars — is .env.local present?')
  assertLocal(url)
  return createClient(url, key, { auth: { persistSession: false } })
}
```

- [ ] **Step 2: Write `tests/db/fixtures.ts`**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { serviceClient } from './helpers'

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
  const db = serviceClient()

  await db.from('coin_transactions').delete().gte('id', 0)
  await db.from('allowed_emails').delete().neq('email', '')
  await db.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const { data: existing } = await db.auth.admin.listUsers()
  for (const u of existing.users) await db.auth.admin.deleteUser(u.id)

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
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
```

- [ ] **Step 3: Write `tests/db/schema.test.ts` (will fail — no tables yet)**

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { serviceClient } from './helpers'

let userId: string

beforeAll(async () => {
  const db = serviceClient()
  await db.from('coin_transactions').delete().gte('id', 0)
  await db.from('allowed_emails').delete().neq('email', '')
  await db.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const { data: existing } = await db.auth.admin.listUsers()
  for (const u of existing.users) await db.auth.admin.deleteUser(u.id)

  const { data, error } = await db.auth.admin.createUser({
    email: 'schema-test@example.com',
    email_confirm: true,
  })
  if (error) throw error
  userId = data.user!.id
})

describe('profiles table', () => {
  it('accepts a valid row with the expected defaults', async () => {
    const db = serviceClient()
    const { data, error } = await db
      .from('profiles')
      .insert({ id: userId, email: 'schema-test@example.com', display_name: 'Test User' })
      .select('is_admin, balance')
      .single()

    expect(error).toBeNull()
    expect(data?.is_admin).toBe(false)
    expect(data?.balance).toBe(0)
  })

  it('rejects a negative balance', async () => {
    const db = serviceClient()
    const { error } = await db.from('profiles').update({ balance: -1 }).eq('id', userId)
    expect(error).not.toBeNull()
  })
})

describe('allowed_emails table', () => {
  it('enforces a unique email', async () => {
    const db = serviceClient()
    const { error: first } = await db.from('allowed_emails').insert({ email: 'dupe@example.com' })
    expect(first).toBeNull()

    const { error: second } = await db.from('allowed_emails').insert({ email: 'dupe@example.com' })
    expect(second).not.toBeNull()
  })
})

describe('coin_transactions table', () => {
  it('rejects a zero amount', async () => {
    const db = serviceClient()
    const { error } = await db
      .from('coin_transactions')
      .insert({ profile_id: userId, amount: 0, type: 'test' })
    expect(error).not.toBeNull()
  })

  it('accepts a nonzero amount', async () => {
    const db = serviceClient()
    const { error } = await db
      .from('coin_transactions')
      .insert({ profile_id: userId, amount: 50, type: 'test' })
    expect(error).toBeNull()
  })
})
```

- [ ] **Step 4: Update `vitest.config.mts`**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    fileParallelism: false,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: FAIL — `relation "public.profiles" does not exist` (or similar)

- [ ] **Step 6: Write `supabase/migrations/0001_core_tables.sql`**

```sql
create table profiles (
  id uuid primary key references auth.users (id),
  email text not null,
  display_name text not null,
  avatar_url text,
  is_admin boolean not null default false,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

create table allowed_emails (
  email text primary key,
  invited_by uuid references profiles (id) on delete set null,
  claimed_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table coin_transactions (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  amount integer not null check (amount <> 0),
  type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 7: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/schema.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add tests/db/helpers.ts tests/db/fixtures.ts tests/db/schema.test.ts \
  supabase/migrations/0001_core_tables.sql vitest.config.mts
git commit -m "Add core tables (profiles, allowed_emails, coin_transactions) and DB test harness"
```

---

## Task 2: Coin ledger function

**Files:**
- Create: `supabase/migrations/0002_coin_ledger_function.sql`
- Create: `tests/db/coin-ledger.test.ts`

**Interfaces:**
- Consumes: `serviceClient()`, `seedMembers()`, `clientFor()`, `Member` (Task 1)
- Produces: the `apply_coin_transaction(p_profile_id uuid, p_amount integer, p_type text, p_meta jsonb default '{}')`
  Postgres RPC — every later coin-moving feature (bets, task rewards, admin
  adjustments, in future sub-projects) calls this by name.

- [ ] **Step 1: Write `tests/db/coin-ledger.test.ts` (will fail — function doesn't exist)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('apply_coin_transaction', () => {
  it('inserts a ledger row and updates the balance together', async () => {
    const db = serviceClient()
    const { error } = await db.rpc('apply_coin_transaction', {
      p_profile_id: alice.id,
      p_amount: 50,
      p_type: 'test_credit',
    })
    expect(error).toBeNull()

    const { data: profile } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    const { data: txns } = await db.from('coin_transactions').select('amount').eq('profile_id', alice.id)

    const ledgerSum = (txns ?? []).reduce((sum, t) => sum + t.amount, 0)
    expect(profile?.balance).toBe(ledgerSum)
    // seedMembers()'s own profile-creation trigger (Task 4) already grants
    // +100, so the expected total is that starting grant plus this +50.
    expect(profile?.balance).toBe(150)
  })

  it('rejects an over-draft, leaving the ledger and balance unchanged', async () => {
    const db = serviceClient()
    const { data: before } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    const { count: countBefore } = await db
      .from('coin_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', bob.id)

    const { error } = await db.rpc('apply_coin_transaction', {
      p_profile_id: bob.id,
      p_amount: -(before!.balance + 1),
      p_type: 'test_overdraft',
    })
    expect(error).not.toBeNull()

    const { data: after } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    const { count: countAfter } = await db
      .from('coin_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', bob.id)

    expect(after?.balance).toBe(before?.balance)
    expect(countAfter).toBe(countBefore)
  })

  it('cannot be called directly by a regular authenticated user', async () => {
    const client = await clientFor(alice)
    const { error } = await client.rpc('apply_coin_transaction', {
      p_profile_id: alice.id,
      p_amount: 1000000,
      p_type: 'self_grant_attempt',
    })
    expect(error).not.toBeNull()

    const { data: profile } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(profile?.balance).toBe(100)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/coin-ledger.test.ts`
Expected: FAIL — `function apply_coin_transaction(...) does not exist`

- [ ] **Step 3: Write `supabase/migrations/0002_coin_ledger_function.sql`**

```sql
create function apply_coin_transaction(
  p_profile_id uuid,
  p_amount integer,
  p_type text,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.coin_transactions (profile_id, amount, type, meta)
  values (p_profile_id, p_amount, p_type, p_meta);

  update public.profiles
  set balance = balance + p_amount
  where id = p_profile_id;
end;
$$;

-- No grant to `authenticated`. This function *writes* — granting EXECUTE
-- to authenticated would let any signed-in user call
-- apply_coin_transaction(<their own id>, 1000000, ...) directly via
-- supabase.rpc() and mint themselves coins. Its only caller in this plan
-- is the trigger added in migration 0004, which runs as this function's
-- owner and so needs no grant (an owner always has implicit EXECUTE on
-- its own functions). A later sub-project that needs to move coins (a
-- bet, a task reward) must add its own narrow, validating
-- SECURITY DEFINER wrapper and grant EXECUTE on that wrapper instead.
revoke execute on function apply_coin_transaction(uuid, integer, text, jsonb) from public;
revoke execute on function apply_coin_transaction(uuid, integer, text, jsonb) from anon;
revoke execute on function apply_coin_transaction(uuid, integer, text, jsonb) from authenticated;
```

- [ ] **Step 4: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/coin-ledger.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_coin_ledger_function.sql tests/db/coin-ledger.test.ts
git commit -m "Add apply_coin_transaction: the only path that can ever change a balance"
```

---

## Task 3: Invite and admin check functions

**Files:**
- Create: `supabase/migrations/0003_invite_admin_functions.sql`
- Create: `tests/db/invite-admin-functions.test.ts`

**Interfaces:**
- Consumes: `serviceClient()`, `seedMembers()`, `clientFor()`,
  `clientForEmail()`, `makeAuthUserWithoutProfile()`, `Member` (Task 1)
- Produces: `is_invited()` and `is_admin()` Postgres RPCs — Task 5's RLS
  policies and Task 8's admin-page gate call these by name.

- [ ] **Step 1: Write `tests/db/invite-admin-functions.test.ts` (will fail)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, clientForEmail, makeAuthUserWithoutProfile, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('is_invited', () => {
  it('is true for an authenticated email on the allowlist', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'pending@example.com' })
    await makeAuthUserWithoutProfile('pending@example.com')
    const client = await clientForEmail('pending@example.com')

    const { data, error } = await client.rpc('is_invited')
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('is false for an authenticated email not on the allowlist', async () => {
    await makeAuthUserWithoutProfile('stranger@example.com')
    const client = await clientForEmail('stranger@example.com')

    const { data } = await client.rpc('is_invited')
    expect(data).toBe(false)
  })
})

describe('is_admin', () => {
  it('is false for a regular member', async () => {
    const client = await clientFor(alice)
    const { data } = await client.rpc('is_admin')
    expect(data).toBe(false)
  })

  it('is true once the profile row is promoted', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const client = await clientFor(bob)

    const { data } = await client.rpc('is_admin')
    expect(data).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/invite-admin-functions.test.ts`
Expected: FAIL — `function is_invited() does not exist`

- [ ] **Step 3: Write `supabase/migrations/0003_invite_admin_functions.sql`**

```sql
create function is_invited() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(auth.jwt() ->> 'email')
  );
$$;

create function is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

-- Both just return false for an unauthenticated caller (auth.uid()/
-- auth.jwt() are null), so exposing them isn't a live hole either way —
-- but revoking from public/anon and granting only to authenticated is
-- free defense in depth, and is_admin() is called directly from app code
-- as supabase.rpc('is_admin'), so it needs the authenticated grant regardless.
revoke execute on function is_invited() from public;
revoke execute on function is_invited() from anon;
grant execute on function is_invited() to authenticated;

revoke execute on function is_admin() from public;
revoke execute on function is_admin() from anon;
grant execute on function is_admin() to authenticated;
```

- [ ] **Step 4: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/invite-admin-functions.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_invite_admin_functions.sql tests/db/invite-admin-functions.test.ts
git commit -m "Add is_invited() and is_admin() checks"
```

---

## Task 4: New-profile trigger

**Files:**
- Create: `supabase/migrations/0004_new_profile_trigger.sql`
- Create: `tests/db/new-profile-trigger.test.ts`

**Interfaces:**
- Consumes: `serviceClient()`, `makeAuthUserWithoutProfile()` (Task 1),
  `apply_coin_transaction` (Task 2)
- Produces: the `on_profile_created` trigger — fires on every insert into
  `profiles` from here on, including in every other task's fixtures.

- [ ] **Step 1: Write `tests/db/new-profile-trigger.test.ts` (will fail)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { makeAuthUserWithoutProfile } from './fixtures'

beforeEach(async () => {
  const db = serviceClient()
  await db.from('coin_transactions').delete().gte('id', 0)
  await db.from('allowed_emails').delete().neq('email', '')
  await db.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const { data: existing } = await db.auth.admin.listUsers()
  for (const u of existing.users) await db.auth.admin.deleteUser(u.id)
})

describe('handle_new_profile trigger', () => {
  it('grants exactly the 100-coin starting balance on insert', async () => {
    const db = serviceClient()
    const userId = await makeAuthUserWithoutProfile('newmember@example.com')

    const { error } = await db
      .from('profiles')
      .insert({ id: userId, email: 'newmember@example.com', display_name: 'New Member' })
    expect(error).toBeNull()

    const { data: profile } = await db.from('profiles').select('balance').eq('id', userId).single()
    expect(profile?.balance).toBe(100)

    const { data: txns } = await db.from('coin_transactions').select('amount, type').eq('profile_id', userId)
    expect(txns).toEqual([{ amount: 100, type: 'starting_grant' }])
  })
})
```

Note: this task only exercises the trigger via a service-role insert,
which has no JWT — so the invite-claiming half of the trigger (matched on
`auth.jwt() ->> 'email'`) can't be meaningfully verified here. That's
verified in Task 5 instead, once a real authenticated session can
actually perform the insert through RLS.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/new-profile-trigger.test.ts`
Expected: FAIL — balance is `0`, not `100` (no trigger yet)

- [ ] **Step 3: Write `supabase/migrations/0004_new_profile_trigger.sql`**

```sql
create function handle_new_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Matches on the verified JWT claim, not the client-suppliable NEW.email
  -- column — same identity check is_invited() already used to admit this
  -- insert, so a crafted insert with a spoofed email column can't claim
  -- someone else's invite or fail to claim its own. A service-role insert
  -- (as in this migration's own tests) has no JWT, so auth.jwt() is null
  -- and this update matches zero rows — harmless, not an error.
  update public.allowed_emails
  set claimed_by = new.id
  where email = lower(auth.jwt() ->> 'email') and claimed_by is null;

  perform public.apply_coin_transaction(new.id, 100, 'starting_grant', '{}'::jsonb);

  return new;
end;
$$;

create trigger on_profile_created
  after insert on public.profiles
  for each row execute function handle_new_profile();
```

`handle_new_profile()` needs no `EXECUTE` grant of its own — Postgres
fires trigger functions directly, not via a role-checked call — and its
`perform apply_coin_transaction(...)` call works despite that function's
grants being fully revoked in Task 2, because both functions are owned by
the same (migration-applying) role and an owner always has implicit
`EXECUTE` on its own functions.

- [ ] **Step 4: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/new-profile-trigger.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Re-run Tasks 1–3's tests to confirm nothing broke**

Run: `npx vitest run tests/db`
Expected: all PASS — Task 1/2/3's fixtures create profiles via
`makeMember`/`makeAuthUserWithoutProfile`, which now also go through this
trigger; Task 2's ledger test already accounted for the +100 starting
grant, so this should need no changes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_new_profile_trigger.sql tests/db/new-profile-trigger.test.ts
git commit -m "Add on_profile_created trigger: atomic invite-claim + starting grant"
```

---

## Task 5: RLS policies and table grants

This is the security boundary: without it, any authenticated user could
read/write any row in these tables directly. This task also verifies the
end-to-end "real invited user signs up" flow, which Tasks 1–4 couldn't
test yet (no table grants existed for a non-service-role client to even
attempt the insert).

**Files:**
- Create: `supabase/migrations/0005_rls_policies.sql`
- Create: `tests/db/rls.test.ts`

**Interfaces:**
- Consumes: `serviceClient()`, `seedMembers()`, `clientFor()`,
  `clientForEmail()`, `makeAuthUserWithoutProfile()`, `Member` (Task 1);
  `is_invited()`, `is_admin()` (Task 3)
- Produces: no new functions — this is the last piece needed before any
  non-service-role client can read/write these tables at all.

- [ ] **Step 1: Write `tests/db/rls.test.ts` (will fail — no grants yet, so every non-service call errors with "permission denied")**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, clientForEmail, makeAuthUserWithoutProfile, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('profiles insert policy', () => {
  it('rejects a non-invited user creating their own profile', async () => {
    const userId = await makeAuthUserWithoutProfile('notinvited@example.com')
    const client = await clientForEmail('notinvited@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'notinvited@example.com', display_name: 'Nope' })

    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it("lets an invited user create their own profile, and the trigger claims their invite via their real session", async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'invitee@example.com' })
    const userId = await makeAuthUserWithoutProfile('invitee@example.com')
    const client = await clientForEmail('invitee@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'invitee@example.com', display_name: 'Invitee' })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: profile } = await db.from('profiles').select('balance').eq('id', userId).single()
    expect(profile?.balance).toBe(100)

    const { data: invite } = await db
      .from('allowed_emails')
      .select('claimed_by')
      .eq('email', 'invitee@example.com')
      .single()
    expect(invite?.claimed_by).toBe(userId)
  })

  it('rejects an insert for a different id than the caller', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'invitee2@example.com' })
    await makeAuthUserWithoutProfile('invitee2@example.com')
    const client = await clientForEmail('invitee2@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: bob.id, email: 'invitee2@example.com', display_name: 'Sneaky' })

    expect(error).not.toBeNull()
  })

  it('rejects an insert that tries to set balance directly', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'invitee3@example.com' })
    const userId = await makeAuthUserWithoutProfile('invitee3@example.com')
    const client = await clientForEmail('invitee3@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'invitee3@example.com', display_name: 'Rich', balance: 999 } as never)

    expect(error).not.toBeNull()
  })

  it('rejects an insert that tries to set is_admin directly', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'invitee4@example.com' })
    const userId = await makeAuthUserWithoutProfile('invitee4@example.com')
    const client = await clientForEmail('invitee4@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'invitee4@example.com', display_name: 'Boss', is_admin: true } as never)

    expect(error).not.toBeNull()
  })
})

describe('allowed_emails policies', () => {
  it('denies a non-admin read/write', async () => {
    const client = await clientFor(alice)

    const { error: selectErr } = await client.from('allowed_emails').select('*')
    expect(selectErr).not.toBeNull()

    const { error: insertErr } = await client.from('allowed_emails').insert({ email: 'x@example.com' })
    expect(insertErr).not.toBeNull()
  })

  it('allows an admin to read and write', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
    const client = await clientFor(alice)

    const { error: insertErr } = await client.from('allowed_emails').insert({ email: 'y@example.com' })
    expect(insertErr).toBeNull()

    const { data, error: selectErr } = await client.from('allowed_emails').select('email')
    expect(selectErr).toBeNull()
    expect(data?.some((row) => row.email === 'y@example.com')).toBe(true)
  })
})

describe('coin_transactions select policy', () => {
  it('shows a member only their own transactions', async () => {
    const client = await clientFor(alice)
    const { data, error } = await client.from('coin_transactions').select('profile_id')

    expect(error).toBeNull()
    expect(data?.every((row) => row.profile_id === alice.id)).toBe(true)
  })

  it('shows an admin every transaction', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
    const client = await clientFor(alice)

    const { data, error } = await client.from('coin_transactions').select('profile_id')
    expect(error).toBeNull()
    const profileIds = new Set(data?.map((r) => r.profile_id))
    expect(profileIds.has(alice.id)).toBe(true)
    expect(profileIds.has(bob.id)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/rls.test.ts`
Expected: FAIL — every non-service call errors with "permission denied
for table profiles/allowed_emails/coin_transactions" (no grants yet)

- [ ] **Step 3: Write `supabase/migrations/0005_rls_policies.sql`**

```sql
alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.coin_transactions enable row level security;

grant select on public.profiles to authenticated;
-- Deliberately omits balance and is_admin: authenticated can't even
-- attempt to set them, regardless of what the RLS check below does.
grant insert (id, email, display_name, avatar_url) on public.profiles to authenticated;

create policy select_all_profiles on public.profiles for select to authenticated using (true);
create policy insert_own_profile on public.profiles for insert to authenticated
  with check (id = auth.uid() and is_invited() and balance = 0 and is_admin = false);

grant select, insert, delete on public.allowed_emails to authenticated;

create policy admin_select_invites on public.allowed_emails for select to authenticated using (is_admin());
create policy admin_insert_invites on public.allowed_emails for insert to authenticated with check (is_admin());
create policy admin_delete_invites on public.allowed_emails for delete to authenticated using (is_admin());

grant select on public.coin_transactions to authenticated;

create policy select_own_or_admin_transactions on public.coin_transactions for select to authenticated
  using (profile_id = auth.uid() or is_admin());
```

- [ ] **Step 4: Apply the migration and run the test again**

Run: `npm run db:reset && npx vitest run tests/db/rls.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full DB suite**

Run: `npx vitest run tests/db`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0005_rls_policies.sql tests/db/rls.test.ts
git commit -m "Add RLS policies and table grants for profiles, allowed_emails, coin_transactions"
```

---

## Task 6: Sign-in flow (create-own-profile, callback, sign-in page, middleware)

**Files:**
- Create: `lib/auth/create-own-profile.ts`
- Create: `tests/db/create-own-profile.test.ts`
- Create: `app/(auth)/callback/route.ts`
- Create: `app/(auth)/sign-in/page.tsx`
- Create: `app/(auth)/sign-in/sign-in-button.tsx`
- Create: `app/(auth)/not-invited/page.tsx`
- Create: `middleware.ts`

**Interfaces:**
- Consumes: `serverClient()` (`lib/supabase/server.ts`, already exists),
  `browserClient()` (`lib/supabase/client.ts`, already exists),
  `serviceClient()`, `clientForEmail()`, `makeAuthUserWithoutProfile()` (Task 1)
- Produces: `createOwnProfile(supabase: SupabaseClient, userId: string, email: string, displayName: string, avatarUrl: string | null): Promise<{ ok: true } | { ok: false; reason: 'not_invited' | 'error' }>`
  — Task 7's home shell doesn't call this directly, but the callback route does.

- [ ] **Step 1: Write `tests/db/create-own-profile.test.ts` (will fail — module doesn't exist)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { clientForEmail, makeAuthUserWithoutProfile } from './fixtures'
import { createOwnProfile } from '@/lib/auth/create-own-profile'

beforeEach(async () => {
  const db = serviceClient()
  await db.from('coin_transactions').delete().gte('id', 0)
  await db.from('allowed_emails').delete().neq('email', '')
  await db.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const { data: existing } = await db.auth.admin.listUsers()
  for (const u of existing.users) await db.auth.admin.deleteUser(u.id)
})

describe('createOwnProfile', () => {
  it('returns not_invited for an email not on the allowlist', async () => {
    const userId = await makeAuthUserWithoutProfile('outsider@example.com')
    const client = await clientForEmail('outsider@example.com')

    const result = await createOwnProfile(client, userId, 'outsider@example.com', 'Outsider', null)
    expect(result).toEqual({ ok: false, reason: 'not_invited' })
  })

  it('creates the profile for an invited email', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'welcome@example.com' })
    const userId = await makeAuthUserWithoutProfile('welcome@example.com')
    const client = await clientForEmail('welcome@example.com')

    const result = await createOwnProfile(
      client,
      userId,
      'welcome@example.com',
      'Welcome',
      'https://example.com/a.png',
    )
    expect(result).toEqual({ ok: true })

    const { data: profile } = await serviceClient().from('profiles').select('balance').eq('id', userId).single()
    expect(profile?.balance).toBe(100)
  })

  it('treats an already-existing profile as success (idempotent)', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'returning@example.com' })
    const userId = await makeAuthUserWithoutProfile('returning@example.com')
    const client = await clientForEmail('returning@example.com')

    const first = await createOwnProfile(client, userId, 'returning@example.com', 'Returning', null)
    expect(first).toEqual({ ok: true })

    const second = await createOwnProfile(client, userId, 'returning@example.com', 'Returning', null)
    expect(second).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/create-own-profile.test.ts`
Expected: FAIL — cannot find module `@/lib/auth/create-own-profile`

- [ ] **Step 3: Write `lib/auth/create-own-profile.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export type CreateOwnProfileResult = { ok: true } | { ok: false; reason: 'not_invited' | 'error' }

/**
 * Inserts the caller's own profile row using their own session's Supabase
 * client, so insert_own_profile's is_invited() RLS check actually runs.
 * `supabase` must be a client bound to the calling user's own session;
 * `userId`/`email` must come from that same session — never from
 * client-suppliable input.
 */
export async function createOwnProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<CreateOwnProfileResult> {
  const { error } = await supabase
    .from('profiles')
    .insert({ id: userId, email, display_name: displayName, avatar_url: avatarUrl })

  if (!error) return { ok: true }

  // 23505 = unique_violation on the primary key: a profile already exists
  // for this id (a returning user) — expected, not a failure.
  if (error.code === '23505') return { ok: true }

  // 42501 = insufficient_privilege: either insert_own_profile's RLS check
  // rejected the row (is_invited() was false) or the column-restricted
  // grant rejected an attempted column — this function never sends
  // balance/is_admin, so in practice this means "not invited."
  if (error.code === '42501') return { ok: false, reason: 'not_invited' }

  return { ok: false, reason: 'error' }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/db/create-own-profile.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `middleware.ts` (project root)**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 6: Write `app/(auth)/callback/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabase/server'
import { createOwnProfile } from '@/lib/auth/create-own-profile'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await serverClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const result = await createOwnProfile(
          supabase,
          user.id,
          user.email ?? '',
          user.user_metadata.full_name ?? user.email ?? 'Member',
          user.user_metadata.avatar_url ?? null,
        )

        if (result.ok) {
          return NextResponse.redirect(`${origin}/`)
        }
        if (result.reason === 'not_invited') {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/not-invited`)
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth`)
}
```

- [ ] **Step 7: Write `app/(auth)/sign-in/sign-in-button.tsx`**

```typescript
'use client'

import { useSearchParams } from 'next/navigation'
import { browserClient } from '@/lib/supabase/client'

export function SignInButton() {
  const searchParams = useSearchParams()
  const hasError = searchParams.get('error') === 'auth'

  async function signIn() {
    const supabase = browserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/callback` },
    })
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {hasError && <p className="text-sm text-red-600">Something went wrong signing you in. Try again.</p>}
      <button onClick={signIn} className="rounded-md bg-foreground px-4 py-2 text-background">
        Sign in with Google
      </button>
    </div>
  )
}
```

- [ ] **Step 8: Write `app/(auth)/sign-in/page.tsx`**

```typescript
import { Suspense } from 'react'
import { SignInButton } from './sign-in-button'

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Suspense>
        <SignInButton />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 9: Write `app/(auth)/not-invited/page.tsx`**

```typescript
export default function NotInvitedPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold">This app is invite-only</h1>
      <p className="text-sm text-foreground/70">
        Ask the admin to add your Gmail address, then try signing in again.
      </p>
    </div>
  )
}
```

- [ ] **Step 10: Run the full test suite and the build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS, build succeeds

- [ ] **Step 11: Commit**

```bash
git add lib/auth/create-own-profile.ts tests/db/create-own-profile.test.ts \
  middleware.ts "app/(auth)"
git commit -m "Add Google sign-in flow: callback, sign-in page, not-invited page, session middleware"
```

---

## Task 7: Home shell and sign-out

**Files:**
- Create: `lib/auth/require-user.ts`
- Create: `lib/auth/sign-out.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `serverClient()` (`lib/supabase/server.ts`, already exists)
- Produces: `requireUser(): Promise<{ supabase: SupabaseClient; user: User | null }>`
  — Task 8's admin page also uses this.

- [ ] **Step 1: Write `lib/auth/require-user.ts`**

```typescript
import { serverClient } from '@/lib/supabase/server'

export async function requireUser() {
  const supabase = await serverClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}
```

- [ ] **Step 2: Write `lib/auth/sign-out.ts`**

```typescript
'use server'

import { redirect } from 'next/navigation'
import { serverClient } from '@/lib/supabase/server'

export async function signOut() {
  const supabase = await serverClient()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
```

- [ ] **Step 3: Rewrite `app/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { signOut } from '@/lib/auth/sign-out'

export default async function Home() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, balance')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Welcome, {profile?.display_name}</h1>
      <p>Balance: {profile?.balance} coins</p>
      <form action={signOut}>
        <button type="submit" className="text-sm underline">
          Sign out
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run the full test suite and the build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS, build succeeds

- [ ] **Step 5: Commit**

```bash
git add lib/auth/require-user.ts lib/auth/sign-out.ts app/page.tsx
git commit -m "Replace placeholder home page with the authenticated home shell"
```

---

## Task 8: Admin invites feature

**Files:**
- Create: `lib/auth/is-admin.ts`
- Create: `lib/invites/add-invite.ts`
- Create: `lib/invites/list-invites.ts`
- Create: `lib/invites/revoke-invite.ts`
- Create: `lib/invites/actions.ts`
- Create: `app/admin/invites/page.tsx`
- Create: `tests/db/add-invite.test.ts`
- Create: `tests/db/list-invites.test.ts`
- Create: `tests/db/revoke-invite.test.ts`

**Interfaces:**
- Consumes: `requireUser()` (Task 7), `serviceClient()`, `seedMembers()`,
  `clientFor()`, `Member` (Task 1)
- Produces: `isAdmin(supabase: SupabaseClient): Promise<boolean>`,
  `addInvite(supabase, invitedBy: string, rawEmail: string): Promise<{ ok: boolean; formError?: string }>`,
  `listInvites(supabase): Promise<{ email: string; claimed: boolean; createdAt: string }[]>`,
  `revokeInvite(supabase, email: string): Promise<{ ok: boolean }>`

- [ ] **Step 1: Write `tests/db/add-invite.test.ts` (will fail — module doesn't exist)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { addInvite } from '@/lib/invites/add-invite'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, type Member } from './fixtures'

let admin: Member
let member: Member

beforeEach(async () => {
  ;[admin, member] = await seedMembers()
  const { error } = await serviceClient().from('profiles').update({ is_admin: true }).eq('id', admin.id)
  if (error) throw error
})

describe('addInvite', () => {
  it('inserts a new row when the caller is an admin', async () => {
    const adminClient = await clientFor(admin)
    const result = await addInvite(adminClient, admin.id, 'newfriend@example.com')

    expect(result.ok).toBe(true)

    const { data } = await serviceClient()
      .from('allowed_emails')
      .select('email, invited_by')
      .eq('email', 'newfriend@example.com')
      .single()
    expect(data?.invited_by).toBe(admin.id)
  })

  it('lowercases and trims the email before inserting', async () => {
    const adminClient = await clientFor(admin)
    const result = await addInvite(adminClient, admin.id, '  Shouty@Example.com  ')

    expect(result.ok).toBe(true)

    const { data } = await serviceClient()
      .from('allowed_emails')
      .select('email')
      .eq('email', 'shouty@example.com')
      .maybeSingle()
    expect(data).not.toBeNull()
  })

  it('rejects an invalid email address without touching the database', async () => {
    const adminClient = await clientFor(admin)
    const result = await addInvite(adminClient, admin.id, 'not-an-email')

    expect(result.ok).toBe(false)
    expect(result.formError).toBe('Enter a valid email address.')
  })

  it('reports a friendly error for a duplicate email', async () => {
    const adminClient = await clientFor(admin)
    await addInvite(adminClient, admin.id, 'dupe@example.com')
    const second = await addInvite(adminClient, admin.id, 'dupe@example.com')

    expect(second.ok).toBe(false)
    expect(second.formError).toBe('That email is already invited.')
  })

  it('refuses a non-admin at the RLS layer — no row is inserted', async () => {
    const memberClient = await clientFor(member)
    const result = await addInvite(memberClient, member.id, 'sneaky@example.com')

    expect(result.ok).toBe(false)

    const { data } = await serviceClient()
      .from('allowed_emails')
      .select('email')
      .eq('email', 'sneaky@example.com')
      .maybeSingle()
    expect(data).toBeNull()
  })
})
```

- [ ] **Step 2: Write `tests/db/list-invites.test.ts` and `tests/db/revoke-invite.test.ts`**

```typescript
// tests/db/list-invites.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { listInvites } from '@/lib/invites/list-invites'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, type Member } from './fixtures'

let admin: Member

beforeEach(async () => {
  ;[admin] = await seedMembers()
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', admin.id)
})

describe('listInvites', () => {
  it('shows claimed and unclaimed invites', async () => {
    const db = serviceClient()
    await db.from('allowed_emails').insert([
      { email: 'unclaimed@example.com' },
      { email: admin.email, claimed_by: admin.id },
    ])

    const adminClient = await clientFor(admin)
    const invites = await listInvites(adminClient)

    const unclaimed = invites.find((i) => i.email === 'unclaimed@example.com')
    const claimed = invites.find((i) => i.email === admin.email)

    expect(unclaimed?.claimed).toBe(false)
    expect(claimed?.claimed).toBe(true)
  })
})
```

```typescript
// tests/db/revoke-invite.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { revokeInvite } from '@/lib/invites/revoke-invite'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, type Member } from './fixtures'

let admin: Member

beforeEach(async () => {
  ;[admin] = await seedMembers()
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', admin.id)
})

describe('revokeInvite', () => {
  it('deletes an unclaimed invite', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'unclaimed@example.com' })
    const adminClient = await clientFor(admin)

    const result = await revokeInvite(adminClient, 'unclaimed@example.com')
    expect(result.ok).toBe(true)

    const { data } = await serviceClient()
      .from('allowed_emails')
      .select('email')
      .eq('email', 'unclaimed@example.com')
      .maybeSingle()
    expect(data).toBeNull()
  })

  it('leaves a claimed invite in place', async () => {
    await serviceClient().from('allowed_emails').insert({ email: admin.email, claimed_by: admin.id })
    const adminClient = await clientFor(admin)

    await revokeInvite(adminClient, admin.email)

    const { data } = await serviceClient()
      .from('allowed_emails')
      .select('email')
      .eq('email', admin.email)
      .maybeSingle()
    expect(data).not.toBeNull()
  })
})
```

- [ ] **Step 3: Run all three tests to verify they fail**

Run: `npx vitest run tests/db/add-invite.test.ts tests/db/list-invites.test.ts tests/db/revoke-invite.test.ts`
Expected: FAIL — cannot find modules under `@/lib/invites`

- [ ] **Step 4: Write `lib/invites/add-invite.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AddInviteResult {
  ok: boolean
  formError?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Inserts a new row into allowed_emails using the caller's own session's
 * Supabase client, so admin_insert_invites's is_admin() RLS check
 * actually runs. `invitedBy` must come from the caller's own verified
 * session — never from client-supplied input.
 */
export async function addInvite(
  supabase: SupabaseClient,
  invitedBy: string,
  rawEmail: string,
): Promise<AddInviteResult> {
  const email = rawEmail.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, formError: 'Enter a valid email address.' }
  }

  const { error } = await supabase.from('allowed_emails').insert({ email, invited_by: invitedBy })

  if (error) {
    if (error.code === '23505') {
      return { ok: false, formError: 'That email is already invited.' }
    }
    return { ok: false, formError: 'Could not add that invite.' }
  }

  return { ok: true }
}
```

- [ ] **Step 5: Write `lib/invites/list-invites.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface InviteRow {
  email: string
  claimed: boolean
  createdAt: string
}

export async function listInvites(supabase: SupabaseClient): Promise<InviteRow[]> {
  const { data, error } = await supabase
    .from('allowed_emails')
    .select('email, claimed_by, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
    email: row.email,
    claimed: row.claimed_by !== null,
    createdAt: row.created_at,
  }))
}
```

- [ ] **Step 6: Write `lib/invites/revoke-invite.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RevokeInviteResult {
  ok: boolean
}

/** Only ever deletes an unclaimed invite — `.is('claimed_by', null)` makes
 * an attempt to revoke a claimed one a no-op rather than an error. */
export async function revokeInvite(supabase: SupabaseClient, email: string): Promise<RevokeInviteResult> {
  const { error } = await supabase
    .from('allowed_emails')
    .delete()
    .eq('email', email.trim().toLowerCase())
    .is('claimed_by', null)

  return { ok: !error }
}
```

- [ ] **Step 7: Run the three tests again to verify they pass**

Run: `npx vitest run tests/db/add-invite.test.ts tests/db/list-invites.test.ts tests/db/revoke-invite.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 8: Write `lib/auth/is-admin.ts`**

```typescript
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export const isAdmin = cache(async (supabase: SupabaseClient): Promise<boolean> => {
  const { data } = await supabase.rpc('is_admin')
  return data === true
})
```

- [ ] **Step 9: Write `lib/invites/actions.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { addInvite } from './add-invite'
import { revokeInvite } from './revoke-invite'

export async function addInviteAction(formData: FormData) {
  const { supabase, user } = await requireUser()
  if (!user) return
  const email = String(formData.get('email') ?? '')
  await addInvite(supabase, user.id, email)
  revalidatePath('/admin/invites')
}

export async function revokeInviteAction(formData: FormData) {
  const { supabase, user } = await requireUser()
  if (!user) return
  const email = String(formData.get('email') ?? '')
  await revokeInvite(supabase, email)
  revalidatePath('/admin/invites')
}
```

- [ ] **Step 10: Write `app/admin/invites/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listInvites } from '@/lib/invites/list-invites'
import { addInviteAction, revokeInviteAction } from '@/lib/invites/actions'

export default async function AdminInvitesPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const invites = await listInvites(supabase)

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">Invites</h1>
      <form action={addInviteAction} className="mt-4 flex gap-2">
        <input name="email" type="email" required placeholder="friend@gmail.com" className="border px-2 py-1" />
        <button type="submit">Add</button>
      </form>
      <ul className="mt-6 space-y-2">
        {invites.map((invite) => (
          <li key={invite.email} className="flex items-center justify-between">
            <span>
              {invite.email} {invite.claimed ? '(claimed)' : ''}
            </span>
            {!invite.claimed && (
              <form action={revokeInviteAction}>
                <input type="hidden" name="email" value={invite.email} />
                <button type="submit">Revoke</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 11: Run the full test suite and the build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS, build succeeds

- [ ] **Step 12: Commit**

```bash
git add lib/auth/is-admin.ts lib/invites app/admin \
  tests/db/add-invite.test.ts tests/db/list-invites.test.ts tests/db/revoke-invite.test.ts
git commit -m "Add admin invites page: view, add, and revoke allowed emails"
```

---

## Task 9: End-to-end wiring

**Files:**
- Create: `e2e/global-setup.ts`
- Modify: `playwright.config.ts`
- Create: `e2e/foundation.spec.ts`
- Delete: `e2e/smoke.spec.ts` (superseded — the placeholder home page it
  tested no longer exists)

**Interfaces:**
- Consumes: `seedMembers()`, `clientFor()`, `sessionCookieHeader()` (Task 1),
  `serviceClient()` (Task 1)

- [ ] **Step 1: Write `e2e/global-setup.ts`**

```typescript
import { chromium } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import { seedMembers, clientFor, sessionCookieHeader } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

loadEnv({ path: '.env.local', quiet: true })

export const STORAGE_STATE_PATH = 'e2e/.auth/session.json'

/**
 * Real Google OAuth can't run in CI, so this seeds a real session for a
 * fixture member the same way tests/db's suite already does (magic-link
 * generation + verifyOtp), promotes them to admin so one seeded session
 * can cover both the home shell and the admin invites page, then injects
 * the resulting cookies directly into a fresh browser context.
 */
export default async function globalSetup(): Promise<void> {
  const [alice] = await seedMembers()
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)

  const client = await clientFor(alice)
  const cookieHeader = await sessionCookieHeader(client)

  const cookies = cookieHeader.split('; ').map((pair) => {
    const [name, ...rest] = pair.split('=')
    return { name, value: rest.join('='), domain: 'localhost', path: '/' }
  })

  const browser = await chromium.launch()
  const context = await browser.newContext()
  await context.addCookies(cookies)
  await context.storageState({ path: STORAGE_STATE_PATH })
  await browser.close()
}
```

- [ ] **Step 2: Update `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE_PATH } from './e2e/global-setup'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    storageState: STORAGE_STATE_PATH,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

- [ ] **Step 3: Delete `e2e/smoke.spec.ts`**

```bash
rm e2e/smoke.spec.ts
```

- [ ] **Step 4: Write `e2e/foundation.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

test('signed-in member sees their name and starting balance', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Alice', { exact: false })).toBeVisible()
  await expect(page.getByText('100', { exact: false })).toBeVisible()
})

test('admin can add and revoke an invite', async ({ page }) => {
  await page.goto('/admin/invites')
  await page.getByPlaceholder('friend@gmail.com').fill('newperson@example.com')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('newperson@example.com')).toBeVisible()

  await page.getByRole('button', { name: 'Revoke' }).click()
  await expect(page.getByText('newperson@example.com')).not.toBeVisible()
})

test('sign-out returns to the sign-in page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
})
```

- [ ] **Step 5: Run the e2e suite**

Run: `npm run db:reset && npx playwright test`
Expected: PASS (3 tests)

- [ ] **Step 6: Run everything (lint, unit+DB tests, build, e2e)**

Run: `npm run lint && npx vitest run && npm run build && npx playwright test`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add e2e/global-setup.ts e2e/foundation.spec.ts playwright.config.ts
git rm e2e/smoke.spec.ts
git commit -m "Wire up e2e: seeded-session global setup, sign-in/admin/sign-out smoke tests"
```

---

## Task 10: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update `README.md`'s status line and add manual setup steps**

Replace the `**Status:** scaffolding — no features yet.` line with:

```markdown
**Status:** Foundation complete — Google sign-in (invite-only), a single
admin account, and a coin ledger. No betting features yet.
```

Add a new section after "### Tests":

```markdown
### One-time manual setup (not app code)

- A Google Cloud OAuth client (web application type), with the Supabase
  project's callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`)
  registered as an authorized redirect URI.
- That client's ID/secret entered into the Supabase dashboard's Auth →
  Providers → Google settings.
- The app's own redirect URLs (`http://localhost:3000/callback` for dev,
  the production URL once deployed) added to Supabase's Auth → URL
  Configuration allowlist.
- After your own first sign-in, flip your profile row's `is_admin` to
  `true` once, by hand, via the Supabase dashboard's SQL editor:
  `update profiles set is_admin = true where email = 'you@gmail.com';`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document Foundation's manual setup steps"
```

---

## Self-Review

**Spec coverage:**
- Google sign-in gated to invite allowlist → Tasks 4, 5, 6 ✓
- Single permanent admin → Tasks 3, 5, 8 (manual flip documented in Task 10) ✓
- Ledger-backed, provably accurate balance → Tasks 1, 2, 4 ✓
- Home shell (name/avatar/balance/sign-out) → Task 7 ✓ (avatar_url is
  fetched and available on `profile`, though not yet rendered as an
  `<img>` — deferred to the design-system pass per the spec's explicit
  non-goal on visual polish; the data plumbing is in place)
- Admin invites page (view/add/revoke) → Task 8 ✓
- `search_path`/`EXECUTE` grant hardening applied from the start → Tasks 2, 3, 4 ✓
- JWT-based (not column-based) invite claiming → Task 4 ✓
- `WITH CHECK` pinning `balance`/`is_admin` + column-restricted `INSERT` grant → Task 5 ✓
- Vitest DB suite + Playwright smoke test → Tasks 1–9 ✓
- Manual setup steps documented → Task 10 ✓

**Placeholder scan:** none found — every step has real, complete code.

**Type consistency:** `Member { id, email, displayName }` (Task 1) used
identically in Tasks 2–5, 8, 9. `CreateOwnProfileResult` (Task 6) matches
its three call sites in the same task's tests. `InviteRow { email, claimed, createdAt }`
(Task 8) matches `list-invites.test.ts`'s `.claimed` assertions exactly —
fixed from an earlier draft that called the field `claimedByName`
(platinum-club's actual field, not applicable here since we don't join
profile names in this simpler v1 list).
