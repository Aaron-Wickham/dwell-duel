# Parlays — design

**Date:** 2026-09-25
**Status:** approved, not yet implemented
**Sub-project 5 of 7** in the DwellDuel build order. Builds on
[Market Engine](2026-09-22-market-engine-design.md) — `markets`,
`market_outcomes`, `market_resolutions`, `resolve_market`, `void_market` —
and Foundation's `apply_coin_transaction()`, still the only path that can
ever change a balance. Market Engine's spec deferred parlays to this
sub-project.

## Goal

A member picks one outcome in each of 2–6 *different* markets, stakes
Dwell Coin once, and wins a multiplied payout only if every pick wins.

- **App-backed, odds locked at placement.** Each leg's odds are frozen
  the moment the parlay is placed, from that market's pool at that
  moment. The payout is known up front. A winning parlay's payout is new
  coin the app creates; a losing parlay's stake leaves circulation.
- **Capped at 20×.** The combined multiplier never exceeds 20× the stake.
- **Built with a bet slip.** "Add to parlay" on any market's page adds a
  pick to a slip that follows the member around the app; they place the
  parlay from the slip.
- **Settles itself.** Whenever a market is resolved, overridden, or voided,
  every parlay with a leg on it is re-settled in the same transaction.

## Non-goals (deferred or explicitly out of scope)

- A zero-sum parlay pool — considered and declined in favor of app-backed
  payouts; parlays deliberately sit outside the pari-mutuel pools.
- An admin-configurable cap — the 20× cap is a constant in the function.
- Cashing out a parlay early, or editing/cancelling one once placed —
  same immutability as single bets.
- A slip that follows a member across devices — the slip is a per-browser
  cookie.
- An admin parlay dashboard. Admins can already read every parlay under
  RLS, and every parlay coin movement appears on `/admin/ledger`.
- Showing anyone's parlays to other members — sub-project 6 (social
  layer), same as single bets.
- Same-market parlays (two picks from one market) — every leg must be a
  different market.

## Prior art being reused, and what's deliberately new

- **Every write is a narrow `SECURITY DEFINER` function** with
  `search_path = ''`, schema-qualified references, explicit `EXECUTE`
  grants (revoked from `public`/`anon`, granted to `authenticated` where
  members call it, and to `service_role` always). No table gets an
  `INSERT`/`UPDATE`/`DELETE` grant for `authenticated`.
- **RLS mirrors `bets`:** a member sees only their own parlays, an admin
  sees all, using the `(select auth.uid())` form from migration `0016`.
- **New transaction types need no schema change** — `coin_transactions.type`
  is unconstrained `text`. Four are added: `parlay_placed`, `parlay_won`,
  `parlay_refunded`, `parlay_reversed`.
- **What's new in kind:** parlays are the first betting mechanism that
  *creates* coin. Every other coin mover in the betting system only moves
  coin between members. That's the accepted cost of up-front, fixed
  payouts; the 20× cap bounds the worst case per parlay.
- **One existing constraint shapes the ledger tagging:** `resolve_market`'s
  override path reverses *every* `coin_transactions` row whose
  `meta ->> 'resolution_id'` matches the resolution being reversed. Parlay
  transactions therefore **never** carry a `resolution_id` in `meta` — only
  `parlay_id` — so a single-bet override can never double-reverse a parlay
  payout. `settle_parlay` does its own reversal (below).

## Data model

Migrations continue at `0025_`.

### `parlays`

| column | type | notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `profile_id` | `uuid not null references profiles(id)` | the bettor |
| `stake` | `integer not null` | `check (stake > 0)` |
| `status` | `text not null default 'pending'` | `check (status in ('pending', 'won', 'lost', 'refunded'))` |
| `credited` | `integer not null default 0` | `check (credited >= 0)` — DC currently paid back to the bettor for this parlay: the payout if `won`, the stake if `refunded`, otherwise 0 |
| `created_at` | `timestamptz not null default now()` | |
| `settled_at` | `timestamptz` | null while `pending` |

`status` and `credited` are stored because they record money that has
actually moved; `settle_parlay` is the only thing that ever changes them.

### `parlay_legs`

| column | type | notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `parlay_id` | `uuid not null references parlays(id) on delete cascade` | |
| `market_id` | `uuid not null references markets(id)` | |
| `outcome_id` | `uuid not null references market_outcomes(id)` | the pick |
| `locked_odds` | `numeric not null` | `check (locked_odds >= 1)` — market total pool ÷ this outcome's pool, at placement |

`unique (parlay_id, market_id)` — one pick per market per parlay. An index
on `parlay_legs (market_id)` serves the settlement lookup.

**A leg's status is not stored.** It is derived from its market's current
state, the same reasoning Market Engine used for not storing a `closed`
status — a stored copy could drift:

| market state | leg status |
|---|---|
| `status = 'voided'` | voided |
| `status = 'resolved'`, current resolution's outcome = the pick | won |
| `status = 'resolved'`, any other outcome | lost |
| `status = 'open'` | pending |

## `place_parlay(p_outcome_ids uuid[], p_stake integer) returns uuid`

```sql
create function place_parlay(p_outcome_ids uuid[], p_stake integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leg_count integer;
  v_found_count integer;
  v_market_count integer;
  v_parlay_id uuid;
  v_pick record;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_stake is null or p_stake <= 0 then
    raise exception 'stake must be positive';
  end if;

  v_leg_count := coalesce(array_length(p_outcome_ids, 1), 0);
  if v_leg_count < 2 or v_leg_count > 6 then
    raise exception 'a parlay needs 2 to 6 picks';
  end if;

  if (select count(distinct o) from unnest(p_outcome_ids) o) <> v_leg_count then
    raise exception 'each pick must be from a different market';
  end if;

  select count(*), count(distinct market_id) into v_found_count, v_market_count
  from public.market_outcomes
  where id = any(p_outcome_ids);

  if v_found_count <> v_leg_count then
    raise exception 'outcome not found';
  end if;

  if v_market_count <> v_leg_count then
    raise exception 'each pick must be from a different market';
  end if;

  -- Lock every leg's market in a fixed order, so pools can't move while
  -- odds are read and two concurrent placements can't deadlock.
  perform 1 from public.markets
  where id in (select market_id from public.market_outcomes where id = any(p_outcome_ids))
  order by id
  for update;

  for v_pick in
    select o.label, o.pool_total, m.title, m.status, m.close_at
    from public.market_outcomes o
    join public.markets m on m.id = o.market_id
    where o.id = any(p_outcome_ids)
  loop
    if v_pick.status <> 'open' or now() >= v_pick.close_at then
      raise exception '''%'' is no longer open', v_pick.title;
    end if;
    if v_pick.pool_total = 0 then
      raise exception '''%'' has no bets yet', v_pick.label;
    end if;
  end loop;

  insert into public.parlays (profile_id, stake)
  values (auth.uid(), p_stake)
  returning id into v_parlay_id;

  perform public.apply_coin_transaction(
    auth.uid(), -p_stake, 'parlay_placed',
    jsonb_build_object('parlay_id', v_parlay_id)
  );

  insert into public.parlay_legs (parlay_id, market_id, outcome_id, locked_odds)
  select v_parlay_id, o.market_id, o.id,
         (select sum(o2.pool_total) from public.market_outcomes o2 where o2.market_id = o.market_id)::numeric
           / o.pool_total
  from public.market_outcomes o
  where o.id = any(p_outcome_ids);

  return v_parlay_id;
end;
$$;

revoke execute on function place_parlay(uuid[], integer) from public;
revoke execute on function place_parlay(uuid[], integer) from anon;
grant execute on function place_parlay(uuid[], integer) to authenticated;
grant execute on function place_parlay(uuid[], integer) to service_role;
```

- Always bets as `auth.uid()` — no parameter names a profile.
- The stake does **not** enter any market's pool; a parlay never moves a
  market's odds.
- An insufficient balance is rejected by `apply_coin_transaction`'s
  existing `balance >= 0` check. The whole call is one transaction, so a
  rejected parlay leaves no parlay row, no legs, and no debit.
- Requiring a non-zero pool on every pick removes the undefined-odds case
  and the most exploitable thin-market case.

## `settle_parlay(p_parlay_id uuid) returns void`

Internal. Members never call it; `resolve_market` and `void_market` do.
It is idempotent: it computes what the parlay *should* be from its legs'
current market states and moves only the difference.

```sql
create function settle_parlay(p_parlay_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_stake integer;
  v_status text;
  v_credited integer;
  v_leg record;
  v_any_lost boolean := false;
  v_any_pending boolean := false;
  v_any_won boolean := false;
  v_multiplier numeric := 1;
  v_target_status text;
  v_target_credit integer;
begin
  select profile_id, stake, status, credited
    into v_profile_id, v_stake, v_status, v_credited
  from public.parlays
  where id = p_parlay_id
  for update;

  for v_leg in
    select l.outcome_id, l.locked_odds, m.status as market_status, r.outcome_id as winning_outcome_id
    from public.parlay_legs l
    join public.markets m on m.id = l.market_id
    left join public.market_resolutions r on r.id = m.current_resolution_id
    where l.parlay_id = p_parlay_id
  loop
    if v_leg.market_status = 'voided' then
      null;
    elsif v_leg.market_status = 'resolved' then
      if v_leg.winning_outcome_id = v_leg.outcome_id then
        v_any_won := true;
        v_multiplier := v_multiplier * v_leg.locked_odds;
      else
        v_any_lost := true;
      end if;
    else
      v_any_pending := true;
    end if;
  end loop;

  if v_any_lost then
    v_target_status := 'lost';
    v_target_credit := 0;
  elsif v_any_pending then
    v_target_status := 'pending';
    v_target_credit := 0;
  elsif not v_any_won then
    v_target_status := 'refunded';
    v_target_credit := v_stake;
  else
    v_target_status := 'won';
    v_target_credit := floor(v_stake * least(v_multiplier, 20))::integer;
  end if;

  if v_target_status = v_status and v_target_credit = v_credited then
    return;
  end if;

  if v_credited > 0 then
    perform public.apply_coin_transaction(
      v_profile_id, -v_credited, 'parlay_reversed',
      jsonb_build_object('parlay_id', p_parlay_id)
    );
  end if;

  if v_target_credit > 0 then
    perform public.apply_coin_transaction(
      v_profile_id, v_target_credit,
      case v_target_status when 'won' then 'parlay_won' else 'parlay_refunded' end,
      jsonb_build_object('parlay_id', p_parlay_id)
    );
  end if;

  update public.parlays
  set status = v_target_status,
      credited = v_target_credit,
      settled_at = case when v_target_status = 'pending' then null else now() end
  where id = p_parlay_id;
end;
$$;

revoke execute on function settle_parlay(uuid) from public;
revoke execute on function settle_parlay(uuid) from anon;
revoke execute on function settle_parlay(uuid) from authenticated;
grant execute on function settle_parlay(uuid) to service_role;
```

**Rules, in order:** any leg lost → `lost`; otherwise any leg pending →
`pending`; otherwise every leg voided → `refunded` (stake back); otherwise
→ `won`, paying `floor(stake × min(product of the won legs' locked odds, 20))`.
Voided legs drop out of the product. Rounding is down, like every other
payout in the app.

**What that covers:**

- **Early loss.** A parlay is `lost` as soon as any leg loses, even with
  other legs still open. No coin moves — the stake was debited at
  placement.
- **Admin override.** If a losing leg's market is overridden to the pick,
  the parlay returns to `pending` (or `won`, if every other leg is already
  decided). An override the other way on a `won` parlay reverses the
  payout with `parlay_reversed`.
- **Voided leg.** Dropped; the parlay continues on the rest. If one leg
  survives, it pays like a single bet at that leg's locked odds. If all
  are voided, the stake is refunded.
- **Nobody backed the winner.** `resolve_market` refunds single bets when
  the winning outcome's pool is empty. A parlay leg on that market counts
  as **lost**: the pick had a non-zero pool at placement (bets are
  immutable, so it still does), so the pick can't be the empty winner. The
  app backs parlays, so there's no "nobody to pay" problem to refund around.
- **Clawback can fail, on purpose.** If reversing a payout would take the
  bettor negative, `apply_coin_transaction` rejects it and the entire
  override rolls back — the same accepted limitation as single-bet
  reversals. An admin can now true up the balance first via
  `/admin/members` (Admin Controls) and retry.
- **No-op re-runs.** Settling a parlay whose state hasn't changed writes
  nothing.

## Hooking settlement into `resolve_market` and `void_market`

A new migration redefines both functions with `create or replace`
(existing grants are preserved). Their bodies are copied verbatim from
their current definitions (`0012_resolve_market_override.sql` and
`0013_void_market_function.sql`), with one added declaration
(`v_parlay_id uuid;`) and one added loop as the last statement of each:

```sql
  for v_parlay_id in
    select distinct parlay_id from public.parlay_legs
    where market_id = p_market_id
    order by parlay_id
  loop
    perform public.settle_parlay(v_parlay_id);
  end loop;
```

- It runs after the market's own status/resolution is written, so
  `settle_parlay` sees the new state in the same transaction.
- `order by parlay_id` means two concurrent resolutions that touch
  overlapping parlays lock them in the same order and can't deadlock. They
  queue on the shared parlay row, and the second sees the first's result.
- Nothing else in either function changes.

## RLS policies and grants

```sql
alter table public.parlays enable row level security;
alter table public.parlay_legs enable row level security;

-- Supabase's default privileges pre-grant every new public table to anon
-- and authenticated; revoke first (the migration 0006 lesson).
revoke all on public.parlays, public.parlay_legs from anon, authenticated;

grant select on public.parlays to authenticated;
grant select on public.parlay_legs to authenticated;

create policy select_own_or_admin_parlays on public.parlays for select to authenticated
  using (profile_id = (select auth.uid()) or is_admin());

create policy select_own_or_admin_parlay_legs on public.parlay_legs for select to authenticated
  using (exists (
    select 1 from public.parlays p
    where p.id = parlay_id
      and (p.profile_id = (select auth.uid()) or is_admin())
  ));

grant all on public.parlays, public.parlay_legs to service_role;
```

An uninvited session can never own a parlay (`place_parlay` checks
`is_invited()`) and isn't an admin, so it sees zero rows.

## UI

### The slip cookie

- Name `parlay_slip`: a JSON array of picked outcome ids, at most 6.
  `httpOnly`, `sameSite: 'lax'`, 7-day expiry.
- Written only by server actions (add, remove, clear after placing).
- Treated as untrusted input on every read: parse defensively, keep only
  well-formed uuid strings, cap at 6, and drop anything else. `place_parlay`
  re-validates everything regardless.
- One pick per market: adding a second outcome from a market already in
  the slip replaces the first.

### `/markets/[id]` (existing page, enhanced)

- Each outcome gets an **Add to parlay** button while the market is open,
  before `close_at`, and that outcome's `pool_total > 0`.
- The outcome currently in the slip shows **In your slip** with a
  **Remove** button instead.
- A full slip (6 picks, this market not among them) shows "Your slip is
  full (6 picks)."

### `/parlays` (new)

- **Your slip.** Each pick shows its market title, outcome label, current
  odds, and a Remove button. Below: the combined multiplier (with
  "capped at 20×" when the cap applies), a stake field, a live potential
  payout (a small client component doing arithmetic on the
  server-computed multiplier), and **Place parlay**.
- **Stale picks.** A pick whose market has since closed, resolved, or been
  voided stays in the slip marked **No longer available**, and **Place
  parlay** is disabled until it's removed. (A pick's outcome can't lose
  its bets — bets are immutable — so market state is the only way a pick
  goes stale.) The page can't rewrite the cookie while rendering, so removal
  is the member's action.
- **After placing.** The slip clears and a confirmation shows the odds
  actually locked and the potential payout.
- **My parlays.** Every parlay the member has placed, newest first: status,
  stake, locked combined multiplier, payout (or potential payout while
  pending), and each leg with its derived status.

### Elsewhere

- **Home page:** a **Parlays** link next to Markets and Tasks, showing the
  slip count, e.g. "Parlays (2)".
- **`/admin/ledger`:** `TYPE_LABELS` gains `parlay_placed` → "Parlay
  placed", `parlay_won` → "Parlay won", `parlay_refunded` → "Parlay
  refunded", `parlay_reversed` → "Parlay reversed".

## Error handling

`place_parlay` raises plain exceptions with readable messages, surfaced
on the slip form as a `formError`, the same `useActionState` pattern used
everywhere else:

- "a parlay needs 2 to 6 picks"
- "each pick must be from a different market"
- "outcome not found"
- "'<market title>' is no longer open"
- "'<outcome label>' has no bets yet"
- "stake must be positive"
- the existing insufficient-balance error from `apply_coin_transaction`

A rejected placement never partially debits or partially records. A
rejected override (clawback would go negative) never partially reverses.

## Testing

DB tests against real RLS-scoped sessions (`seedMembers()`, `clientFor()`,
`serviceClient()`):

- **`place_parlay`:** rejects fewer than 2 and more than 6 picks, two picks
  from one market, a repeated outcome id, an unknown outcome, a closed /
  resolved / voided market, a zero-pool outcome, a zero or negative stake,
  and an insufficient balance — each leaving no parlay, no legs, and no
  debit. On success: locked odds equal total pool ÷ outcome pool for every
  leg, the stake is debited once as `parlay_placed`, and no
  `market_outcomes.pool_total` changes.
- **Settlement via `resolve_market` / `void_market`:**
  - every leg wins → `won` with exactly `floor(stake × product)`;
  - a product above 20 pays exactly `stake × 20`;
  - one leg loses while another is still open → `lost` immediately, no
    coin moved;
  - one leg voided, the rest win → paid on the surviving legs' product;
  - every leg voided → `refunded`, stake returned;
  - override a lost leg to the pick → parlay pays out (or returns to
    `pending` if another leg is still open);
  - override a won leg away from the pick → payout reversed with
    `parlay_reversed`, balance back to its pre-payout value;
  - an override whose parlay clawback would go negative fails atomically —
    market resolution, parlay status, and balances all unchanged;
  - a leg on a market whose winning outcome had no bets counts as lost;
  - a single-bet override on a market leaves parlay transactions untouched
    (no double reversal), while the parlay itself is correctly re-settled;
  - re-resolving with no net change writes no new parlay transactions.
- **RLS:** a member can't see another member's parlays or legs; an admin
  can see all; an uninvited session sees zero rows; direct
  `INSERT`/`UPDATE`/`DELETE` on either table by `authenticated` is rejected;
  `authenticated` can't execute `settle_parlay`.
- **Playwright e2e:** as the seeded admin, create two markets and place a
  single bet on one outcome in each (so pools are non-zero); add a pick
  from each market's page; place the parlay from `/parlays`; resolve both
  markets to the picks; confirm `/parlays` shows the parlay as **Won** with
  the expected payout. Per the Admin Controls lesson, the test never
  asserts an absolute balance.
