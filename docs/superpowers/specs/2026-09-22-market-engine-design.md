# Market Engine — design

**Date:** 2026-09-22
**Status:** approved, not yet implemented
**Sub-project 2 of 7** in the DwellDule build order. Builds directly on
[Foundation](2026-09-22-foundation-design.md) — Google sign-in, the
invite gate, `is_admin()`/`is_invited()`, and `apply_coin_transaction()`
(the only path that can ever change a balance). Everything here routes
through that existing ledger primitive rather than touching
`profiles.balance` or `coin_transactions` any other way.

Currency is called **Dwell Coin (DC)** in all user-facing copy from this
sub-project onward. The underlying schema/ledger naming (`balance`,
`amount`, `coin_transactions`, transaction `type` values like
`bet_won`) is unchanged — this is a display-layer rename only.

## Goal

A self-sufficient betting market: any invited member can create a
market, anyone can bet Dwell Coin on its outcomes, and the pool itself —
not an admin, not an algorithm — determines both the implied odds and
the eventual payout. Specifically:

- Binary (yes/no) and multiple-choice (up to 6 outcomes) markets
- A pari-mutuel pool per market: bettors on the winning outcome split
  the entire pool (both sides combined) proportional to their own stake
- The market's creator resolves it once the outcome is known; an admin
  can always resolve an unresolved market, or **override and reverse**
  an already-resolved one if the call turns out to be wrong
- A market feed, a create-market form, and a market detail page with
  betting, resolution, and admin override

## Non-goals (deferred to later sub-projects)

- Parlays / multi-leg combined bets (sub-project 5)
- Coin-earning tasks — this sub-project only ever moves coin that
  already exists in someone's balance; it never creates new coin
- A public "who bet what" social feed — bets stay visible only to their
  own bettor and admins in this pass (sub-project 6: social layer)
- A broader admin moderation dashboard (bulk actions, audit views,
  general balance adjustment) — the one admin capability built here
  (resolve/override a market) is scoped tightly to *this* feature, not
  a general admin-tools UI (sub-project 4)
- AMM-style continuously tradeable prices / early cash-out — the
  pari-mutuel pool is fixed once you bet; you can't sell your position
  before resolution
- Live/scheduled auto-closing — a market's `close_at` is enforced by
  every function that checks it (`place_bet`, `resolve_market`), not by
  a background job that flips a stored status; there is no `closed` row
  state (see "Data model" below)

## Prior art being reused, and one lesson carried forward

Every write in this sub-project happens through a narrow, validating
`SECURITY DEFINER` function — the exact pattern Foundation's spec
mandated for any future coin-mover ("later sub-projects that need to
move coins... must add their own narrow, validating wrapper... and
grant EXECUTE on that wrapper, never on `apply_coin_transaction`
directly"). No table here ever gets an `INSERT`/`UPDATE`/`DELETE` grant
for `authenticated` — only `SELECT`, gated by RLS. Every function uses
`search_path = ''` with schema-qualified references and explicit
`EXECUTE` grants, exactly like Foundation's functions.

One concrete lesson from Foundation's own post-merge incident: every
migration here grants `service_role` explicit access to its new tables
and functions from the start, rather than relying on the Supabase CLI's
version-dependent implicit defaults (Foundation shipped without this,
passed on the local dev machine's CLI version, and failed CI on the
pinned version — fixed in `0007_grant_service_role.sql`). Not repeating
that here.

## Data model

Migrations continue Foundation's sequence, starting at `0008_`.

### `markets`

| column | type | notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `created_by` | `uuid not null references profiles(id)` | |
| `title` | `text not null` | |
| `description` | `text` | nullable |
| `kind` | `text not null` | `check (kind in ('binary', 'multiple_choice'))` |
| `status` | `text not null default 'open'` | `check (status in ('open', 'resolved', 'voided'))` — see below on why there's no `closed` state |
| `close_at` | `timestamptz not null` | betting stops here; enforced by function, not a stored transition |
| `current_resolution_id` | `uuid references market_resolutions(id)` | the active (non-reversed) resolution, if any — nullable |
| `created_at` | `timestamptz not null default now()` | |

**Why no `closed` status:** nothing in this app runs on a schedule to
flip a status the instant `close_at` passes. "Closed" is simply
`status = 'open' and now() >= close_at` — a computed fact every
function already checks directly, not a state anything needs to
transition into. Storing it would just be a value that's sometimes
stale between the moment it should flip and whenever something happens
to write it.

### `market_outcomes`

| column | type | notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `market_id` | `uuid not null references markets(id) on delete cascade` | |
| `label` | `text not null` | e.g. `"Yes"`, `"Home team wins"` |
| `pool_total` | `integer not null default 0` | `check (pool_total >= 0)` — total DC staked on this outcome |
| `created_at` | `timestamptz not null default now()` | |

`unique (market_id, label)` — no duplicate outcome labels within one
market.

`pool_total` is the same "cached, but only ever updated atomically
alongside the write that changes it" shape as `profiles.balance` — it's
maintained exclusively inside `place_bet()`, in the same transaction as
the bet that changes it, so it can never drift from
`sum(bets.amount)` for that outcome.

### `bets`

| column | type | notes |
|---|---|---|
| `id` | `bigint generated always as identity primary key` | |
| `market_id` | `uuid not null references markets(id) on delete cascade` | denormalized from `outcome_id` for query/aggregation convenience |
| `outcome_id` | `uuid not null references market_outcomes(id) on delete cascade` | |
| `profile_id` | `uuid not null references profiles(id)` | |
| `amount` | `integer not null` | `check (amount > 0)` |
| `created_at` | `timestamptz not null default now()` | |

Immutable once placed — no cancellation, no editing. A bettor's coin is
debited from their balance the moment they bet (via
`apply_coin_transaction`), not held in escrow separately — so a losing
bet needs no further action at resolution time, only a winning one does.

### `market_resolutions`

The record of every resolution *event* a market has ever had — needed
because an admin override must reverse *exactly* the payouts one
specific prior resolution made, and a market can be re-resolved more
than once.

| column | type | notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `market_id` | `uuid not null references markets(id) on delete cascade` | |
| `outcome_id` | `uuid not null references market_outcomes(id)` | the outcome this resolution declared winning |
| `resolved_by` | `uuid not null references profiles(id)` | |
| `resolved_at` | `timestamptz not null default now()` | |
| `reversed_at` | `timestamptz` | null unless a later admin override superseded this one |
| `reversed_by` | `uuid references profiles(id)` | |

`markets.current_resolution_id` always points at the one
`market_resolutions` row for that market with `reversed_at is null` (or
is null itself, if the market has never been resolved).

## The reliability guarantee, extended

Every coin movement in this sub-project — a bet, a win, a refund, a
reversal — is still, ultimately, exactly one call to
`apply_coin_transaction()`. Nothing here writes to `profiles.balance` or
`coin_transactions` any other way. The three new functions below are
each narrow, single-purpose wrappers around it, matching Foundation's
established shape.

### `place_bet(p_market_id uuid, p_outcome_id uuid, p_amount integer) returns void`

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
```

Always bets as `auth.uid()` — there is no parameter for "which profile,"
so there's no way to place a bet on someone else's behalf. `select ...
for update` locks the market row so two concurrent bets can't race past
the close-time check. An insufficient balance is rejected by
`apply_coin_transaction`'s existing `balance >= 0` check — the whole
function's transaction rolls back, so a rejected bet never partially
debits or partially records itself.

### `create_market(p_title text, p_description text, p_kind text, p_outcome_labels text[], p_close_at timestamptz) returns uuid`

Also a single atomic function, rather than two separate client-side
inserts (`markets` then `market_outcomes`) — so a market is never left
half-created with zero outcomes.

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
```

Because `create_market` is the *only* path that can ever insert into
`markets` or `market_outcomes`, neither table needs any `INSERT` grant
for `authenticated` at all — see RLS below.

### `resolve_market(p_market_id uuid, p_outcome_id uuid) returns void`

Handles first-time resolution, the pari-mutuel payout math, the
empty-winning-pool refund case, **and** admin override-with-reversal —
one function, branching on whether the market already has an active
resolution.

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
    -- clawback path -- see below.
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
  -- Every payout/refund this resolution ever made carries its own
  -- resolution_id in meta, so this targets exactly (and only) those
  -- transactions -- never a later resolution's, never an unrelated bet.
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
```

**Rounding is always down, never up:** `floor(...)` on each individual
payout means the sum of all payouts can be a few DC *less* than the
total pool (whatever's left over from rounding simply isn't
distributed), but can never exceed it. This preserves the same
never-pay-out-more-than-was-staked solvency guarantee the pari-mutuel
model is supposed to give, at the cost of at most
`(number of winners − 1)` DC per resolution going nowhere. That's an
accepted, deliberate trade-off, not a bug to fix later.

**Reversal can fail, on purpose:** if a winner has already spent their
winnings elsewhere (bet them on another market) before the reversal
happens, clawing back the original payout would take their balance
negative — which `apply_coin_transaction`'s `balance >= 0` check
rejects. Because the whole reversal-and-re-resolve sequence is one
Postgres function call, that failure rolls back *everything*: the old
resolution stays active, untouched, and the override attempt fails with
a clear error rather than leaving a partial reversal. This is an
accepted limitation for this sub-project's scale — resolving it (e.g.
letting an admin manually true up a balance first) is future
admin-controls-sub-project territory, not solved here.

### `void_market(p_market_id uuid) returns void`

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
```

Voiding is deliberately **not** reversible and **not** available once a
market has ever been resolved — it's for "this market shouldn't have
existed" (a mistake at creation, a cancelled event), a lower-stakes and
simpler case than a wrong resolution. If a market is resolved with the
wrong outcome, the fix is `resolve_market`'s override path, not voiding.

## RLS policies

Every table below is `select`-only for `authenticated` — there is no
`insert`/`update`/`delete` grant on any of them. The three functions
above are the only way any of these rows ever change, and each already
does its own permission check internally (creator/admin, invited,
etc.), so there is nothing left for a table-level policy to gate on the
write side.

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

grant all on public.markets, public.market_outcomes, public.bets, public.market_resolutions to service_role;
grant execute on function create_market(text, text, text, text[], timestamptz) to service_role;
grant execute on function place_bet(uuid, uuid, integer) to service_role;
grant execute on function resolve_market(uuid, uuid) to service_role;
grant execute on function void_market(uuid) to service_role;
```

`bets` stays private to the bettor (plus admins) in this pass — a
"who's betting what" social feed is explicitly sub-project 6's
territory, not this one.

## UI

- **`/markets`** — the market feed: open markets (with each outcome's
  live implied odds — `pool_total ÷ sum of all outcomes' pool_total` —
  shown as a percentage, or "no bets yet" if the market has none),
  markets past their close time awaiting resolution, and resolved
  markets with their outcome.
- **`/markets/new`** — create-market form: title, description, kind
  (binary/multiple-choice), outcome labels (fixed at 2 for binary,
  add-up-to-6 for multiple-choice), a close-time picker.
- **`/markets/[id]`** — market detail: each outcome with its pool/odds,
  a bet form (pick an outcome, enter a DC amount) when the market is
  open and before `close_at`, the viewer's own bets on this market, a
  resolve control for the creator (once past `close_at`) or an admin
  (anytime), a void button for the creator or admin (only while
  `status = 'open'`), and — for an admin, when the market is already
  resolved — an "override resolution" control that calls the same
  `resolve_market` with a different outcome.

## Error handling

- Every function raises a plain Postgres exception with a human-readable
  message on any invalid state (wrong permissions, market not open,
  outcome mismatch, etc.) — the calling page surfaces that message
  directly to the user rather than a generic failure, the same pattern
  `createOwnProfile`/`addInvite` already established in Foundation.
- A rejected `place_bet` (insufficient balance, market closed) never
  partially debits or partially records — the whole function call is
  one transaction.
- A rejected resolution override (would take a past winner negative)
  never partially reverses — same guarantee.

## Testing

DB tests against real RLS-scoped sessions, following Foundation's
established fixture pattern (`seedMembers()`, `clientFor()`,
`serviceClient()`):

- `create_market`: rejects a non-2-outcome binary market, rejects more
  than 6 outcomes, rejects a past `close_at`, succeeds and creates
  exactly the given outcome rows.
- `place_bet`: debits the bettor's balance and increases the outcome's
  `pool_total` together in the same amount; rejects an insufficient
  balance leaving both the ledger and `pool_total` unchanged; rejects
  betting after `close_at`; rejects an outcome that belongs to a
  different market; two bets on the same outcome by the same bettor
  both land and both add to `pool_total`.
- `resolve_market`: pays out winners in exact proportion to their stake
  (verified against the deterministic `floor()` math); refunds
  everyone when the winning outcome's pool is empty; rejects a
  non-creator, non-admin caller; rejects resolving before `close_at`
  for a non-admin; an admin *can* resolve early; an admin can override
  an already-resolved market — the prior payouts are exactly reversed
  (each affected balance returns to its pre-payout value) and the new
  outcome's payouts land correctly; an override that would take a past
  winner's balance negative fails atomically, leaving the original
  resolution and all balances untouched.
- `void_market`: refunds every bet; rejects voiding an already-resolved
  market; rejects a non-creator, non-admin caller.
- RLS: a non-admin can't see another bettor's bets; a non-invited
  authenticated session sees zero rows from any of these four tables
  (mirroring Foundation's `select_all_profiles` fix); direct
  `INSERT`/`UPDATE`/`DELETE` against any of the four tables by
  `authenticated` is rejected (there's no grant for it at all).
- Playwright e2e: create a market as one seeded member, bet as a second
  seeded member on each outcome, resolve it as the creator, confirm
  balances updated correctly on the page.
