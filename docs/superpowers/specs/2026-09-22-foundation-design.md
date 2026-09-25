# Foundation — design

**Date:** 2026-09-22
**Status:** approved, not yet implemented
**Sub-project 1 of 7** in the DwellDuel build order (see decomposition in the
brainstorming conversation that produced this spec). Everything else —
the market engine, the coin economy's earning side, admin controls beyond
invites, parlays, the social layer, and the design pass — depends on this
piece and is explicitly out of scope here.

## Goal

Stand up the parts of DwellDuel that every later feature needs:

- Google sign-in, gated to an invite-only allowlist of Gmail addresses
- A single, permanent admin account (the app owner)
- A coin balance per user that is **provably accurate** — it can never
  drift from its own audit trail, no matter what future feature writes to
  it
- The minimum UI needed to prove the whole pipeline works: sign in, land
  on a home shell showing your name/avatar/balance, sign out

## Non-goals (deferred to later sub-projects)

- Betting markets, odds, resolution, parlays
- Coin-earning tasks (Bible study essays/reading questions) — this spec
  only grants a one-time starting balance
- Admin controls beyond managing the invite list (no balance adjustment
  UI, no user banning, etc.)
- Friend leaderboards / social feed
- Visual design polish — this spec uses plain, unstyled or minimally
  styled markup; the dedicated design-system pass comes later
- Multi-admin support
- Any performance optimization beyond what's described below (e.g.
  platinum-club's header-forwarding trick to avoid a second
  `getUser()` network call) — add only if it's ever actually needed

## Prior art being reused

platinum-club (same author, same stack) already solved "invite-gated
Google sign-in with a single admin flag" and had to patch real security
holes doing it (see its migrations `0008_lock_down_definer_functions.sql`
and `0009_actually_lock_down_definer_functions.sql`, and the
privilege-escalation note in its `bootstrap-admin.ts`). This spec adopts
the same proven shape — invite gate enforced by RLS via an `is_invited()`
function, `is_admin()` as a `SECURITY DEFINER` function, admin-managed
`allowed_emails` table — instead of re-deriving it, and applies the
lessons already learned rather than repeating them as follow-up patches:

- every `SECURITY DEFINER` function uses `search_path = ''` with fully
  schema-qualified table references (platinum-club's actual convention,
  confirmed against its `0005_rls.sql`), closing the class of bug that
  needs a locked-down search path
- `EXECUTE` on every `SECURITY DEFINER` function is revoked from `public`
  and `anon` and granted only to `authenticated`, in the same migration
  that creates it — platinum-club needed two follow-up migrations
  (`0008`, `0009`) to retrofit this because Supabase's hosted platform
  grants `EXECUTE` directly to `anon`/`authenticated` independent of the
  `PUBLIC` pseudo-role, which a revoke-from-`public`-only misses
- the invite-claiming logic authenticates via `auth.jwt() ->> 'email'`
  (the verified JWT claim), never via the client-suppliable
  `profiles.email` column — matching how `is_invited()` itself checks
  identity, so a crafted insert with a spoofed `email` column can't
  desync which invite gets marked claimed
- an explicit `WITH CHECK` on the profile-insert policy pins
  `balance = 0` and `is_admin = false` so a crafted insert can't
  self-grant coins or admin

## Data model

New Supabase migration(s) under `supabase/migrations/`, sequential
zero-padded numbering starting at `0001_`.

### `profiles`

| column | type | notes |
|---|---|---|
| `id` | `uuid primary key` | `references auth.users(id)`, same id as the Supabase auth user |
| `email` | `text not null` | copied from the Google OAuth payload at profile-creation time |
| `display_name` | `text not null` | from Google's `full_name` |
| `avatar_url` | `text` | from Google's `avatar_url` |
| `is_admin` | `boolean not null default false` | see "Admin" below |
| `balance` | `integer not null default 0` | `check (balance >= 0)` |
| `created_at` | `timestamptz not null default now()` | |

### `allowed_emails`

| column | type | notes |
|---|---|---|
| `email` | `text primary key` | stored lowercased; app code lowercases before insert |
| `invited_by` | `uuid references profiles(id)` | nullable (the very first invite, your own, has no inviter) |
| `claimed_by` | `uuid references profiles(id)` | null until someone signs in with this email |
| `created_at` | `timestamptz not null default now()` | |

### `coin_transactions`

Append-only audit log. Nothing ever updates or deletes a row here.

| column | type | notes |
|---|---|---|
| `id` | `bigint generated always as identity primary key` | |
| `profile_id` | `uuid not null references profiles(id)` | |
| `amount` | `integer not null` | positive (credit) or negative (debit); never zero — enforced by `check (amount <> 0)` |
| `type` | `text not null` | e.g. `'starting_grant'`; later sub-projects add more types (`'bet_placed'`, `'bet_won'`, `'task_reward'`, `'admin_adjustment'`, ...) |
| `meta` | `jsonb not null default '{}'::jsonb` | type-specific detail, e.g. later a bet id |
| `created_at` | `timestamptz not null default now()` | |

## The reliability guarantee

`profiles.balance` is a real, cheap-to-read column, but it can only ever
change through one function:

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

-- No grant to `authenticated` here, unlike is_invited()/is_admin() below.
-- This function *writes* — granting EXECUTE to authenticated would let any
-- signed-in user call `apply_coin_transaction(<their own id>, 1000000, ...)`
-- directly via `supabase.rpc()` and mint themselves coins. Its only caller
-- in this spec is the trigger below, which runs as this function's owner
-- and so needs no grant (an owner always has implicit EXECUTE on its own
-- functions). Later sub-projects that need to move coins (placing a bet,
-- paying out a task reward) must add their own narrow, validating
-- SECURITY DEFINER wrapper — e.g. `place_bet()` checks the bet is open and
-- the balance covers it, *then* calls this — and grant EXECUTE on that
-- wrapper, never on this primitive directly.
revoke execute on function apply_coin_transaction(uuid, integer, text, jsonb) from public;
revoke execute on function apply_coin_transaction(uuid, integer, text, jsonb) from anon;
revoke execute on function apply_coin_transaction(uuid, integer, text, jsonb) from authenticated;
```

Both writes happen in the same statement-level transaction. If the
`balance >= 0` check fails (an over-draft), the whole function raises and
rolls back — the ledger insert and the balance update either both happen
or neither does. This is the invariant every later feature (bets, task
rewards, admin adjustments) depends on: **`profiles.balance` always
exactly equals `sum(coin_transactions.amount)` for that profile.**

`coin_transactions` has no `INSERT`/`UPDATE`/`DELETE` RLS policy for
`anon` or `authenticated` — the only way to write to it is through this
function, which runs as its (superuser-owned) definer and so bypasses RLS
regardless. `profiles.balance` is likewise never directly writable by a
user (see RLS below), so the only path to a balance change is this one
audited function.

## RLS policies

- **`profiles`**
  - `select`: any authenticated user can read any profile (needed later
    for leaderboards/social; there's no private data in this table).
  - `insert`: `with check (id = auth.uid() and is_invited() and balance = 0 and is_admin = false)`.
    Pins the two privilege-sensitive columns so a crafted insert can't
    self-grant coins or admin — the exact hole platinum-club had to close
    after the fact; closed here from the start.
  - No `update` policy in this spec (profile editing isn't a feature
    yet — deferred).
- **`allowed_emails`**: `select`, `insert`, `delete` all gated by
  `is_admin()`. No `update` policy — `claimed_by` is set by the trigger
  below, which runs as definer and bypasses RLS.
- **`coin_transactions`**: `select` where `profile_id = auth.uid()` or
  `is_admin()`. No write policies at all (see above).

### Supporting functions

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
-- as `supabase.rpc('is_admin')`, so it needs the authenticated grant regardless.
revoke execute on function is_invited() from public;
revoke execute on function is_invited() from anon;
grant execute on function is_invited() to authenticated;

revoke execute on function is_admin() from public;
revoke execute on function is_admin() from anon;
grant execute on function is_admin() to authenticated;
```

### New-profile trigger

```sql
create function handle_new_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Matches on the verified JWT claim, not the client-suppliable NEW.email
  -- column — same identity check is_invited() already used to admit this
  -- insert in the first place, so a crafted insert with a spoofed `email`
  -- column can't claim someone else's invite or fail to claim its own.
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

Every profile row, however it's created, atomically claims its invite and
receives the 100-coin starting grant. No app code has to remember to call
either step. `handle_new_profile()` needs no `EXECUTE` grant of its own —
Postgres fires trigger functions directly, not via a role-checked call —
and its `perform apply_coin_transaction(...)` call works despite that
function's grants being fully revoked above, because both functions are
owned by the same (migration-applying) role and an owner always has
implicit `EXECUTE` on its own functions.

## Sign-in flow

1. User clicks "Sign in with Google" → Supabase's OAuth redirect flow
   (`supabase.auth.signInWithOAuth({ provider: 'google' })`).
2. Google redirects back to `app/(auth)/callback/route.ts`, which calls
   `supabase.auth.exchangeCodeForSession(code)`.
3. On success, the app attempts to insert the caller's own `profiles` row
   (id, email, display_name, avatar_url pulled from
   `supabase.auth.getUser()`'s `user_metadata`), using the user's own
   session client — **never** a service-role client, so the `is_invited()`
   check in the RLS policy actually runs.
   - If the insert succeeds (first sign-in): the trigger above runs;
     redirect to the home shell.
   - If a profile row already exists for this id (returning user, unique
     violation on `id`): that's expected, not an error — proceed to the
     home shell.
   - If the insert is rejected by RLS (email not in `allowed_emails`):
     sign the user out immediately (`supabase.auth.signOut()`) and
     redirect to `/not-invited`, a static page explaining the app is
     invite-only.
4. `middleware.ts` uses the standard Supabase SSR cookie-refresh pattern
   so sessions stay valid across requests. (This is the standard
   `createServerClient` + `getUser()` middleware from Supabase's own
   Next.js docs — not platinum-club's optimized `proxy.ts` variant,
   which is deferred per the non-goals above.)

## Admin

- `is_admin` starts `false` for every row, including yours. After your
  own first sign-in, you flip it to `true` for your row **once**, by
  hand, via the Supabase dashboard's SQL editor (running as the
  postgres/service role, which bypasses RLS). This is a one-time manual
  step, not app functionality — documented in `README.md`, not built as
  a feature, since it only ever happens once for one account.
- `/admin/invites` — a page that server-side checks `is_admin()` (redirects
  to `/` if false) and lets you:
  - view all rows in `allowed_emails` (email, invited-by, claimed-by,
    created-at)
  - add a new allowed email (lowercased, validated as an email shape,
    inserted with `invited_by = <your id>`)
  - delete an allowed_emails row that hasn't been claimed yet (revoke an
    unused invite)

## Home shell

`app/page.tsx`, behind auth (redirects to a `/sign-in` page if no
session): shows the signed-in user's display name, avatar, and current
coin balance, plus a sign-out button. This is a verification surface for
this sub-project, not a real feature — later sub-projects replace it with
the actual market feed.

## Error handling

- Failed OAuth exchange (`exchangeCodeForSession` errors): redirect to
  `/sign-in?error=auth` with a generic "something went wrong signing you
  in, try again" message.
- Rejected profile insert (not invited): see step 3 above — always signed
  out, never left in a half-authenticated state.
- `apply_coin_transaction` over-draft (not reachable from this spec's
  only caller, the fixed +100 starting grant, but future callers will
  hit this): the function raises, the caller's transaction fails, no
  partial write is possible.
- Every `SECURITY DEFINER` function pins `search_path = ''` with fully
  schema-qualified references from its first migration, and has its
  `EXECUTE` grants set correctly (revoked from `public`/`anon`, and from
  `authenticated` too for the coin-moving primitive) in that same
  migration — platinum-club needed follow-up migrations to fix both of
  these after the fact; doing them correctly from the start avoids that
  class of bug entirely.

## Testing

- **Vitest, against local Supabase** (`npm run db:start` first, same as
  platinum-club): a `tests/db/` suite that, using a service-role client
  for setup, verifies:
  - `apply_coin_transaction` updates both the ledger and the balance
    together, and that `sum(coin_transactions.amount) === profiles.balance`
    after a sequence of calls
  - an over-draft (negative balance) is rejected and leaves both the
    ledger and the balance unchanged
  - a `profiles` insert with a non-invited email is rejected by RLS
  - a `profiles` insert that tries to set `balance` or `is_admin` to a
    non-default value is rejected by RLS
  - the new-profile trigger claims the matching `allowed_emails` row and
    grants exactly 100 starting coins
- **Playwright**: one smoke test covering sign-in → landing on the home
  shell with the starting balance visible → sign-out. (Signing in via
  real Google OAuth in CI isn't practical; this test seeds a session
  against local Supabase the way platinum-club's e2e suite already does,
  rather than driving the real Google consent screen.)

## Manual setup required (not app code)

- A Google Cloud OAuth client (web application type), with the Supabase
  project's callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`)
  registered as an authorized redirect URI.
- That client's ID/secret entered into the Supabase dashboard's Auth →
  Providers → Google settings.
- The app's own redirect URLs (`http://localhost:3000/callback` for dev,
  the production URL once deployed) added to Supabase's Auth → URL
  Configuration allowlist.
- Your own row's `is_admin` flipped to `true` after your first sign-in
  (see "Admin" above).
- No new `.env.local` variables beyond the three already in
  `.env.local.example` — Google OAuth credentials live in Supabase's own
  config, not app env vars.
