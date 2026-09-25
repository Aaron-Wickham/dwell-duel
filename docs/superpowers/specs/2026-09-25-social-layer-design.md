# Social Layer — design

**Date:** 2026-09-25
**Status:** approved, not yet implemented
**Sub-project 6 of 7** in the DwellDuel build order. Market Engine and
Parlays both deferred "who bet what" visibility to this sub-project. Until
now, bets and parlays have been private to their owner and admins.

## Goal

Make the app social, in four parts that share one decision:

- **Leaderboard**: every member ranked by Dwell Coin balance.
- **Activity feed**: a running list of what's happening across the app.
- **Who bet what**: every member's bets shown on each market page.
- **Member profile pages**: one member's balance, rank and recent activity.

The shared decision is that bets, parlays and approved task completions
become visible to every invited member. **They are visible the moment
they're placed**, not after the market closes. That fits a small, trusting
friend group, and it keeps the feed lively.

## Non-goals

- Comments, reactions, notifications, or following members.
- Ranking by betting profit. The leaderboard ranks by balance only.
- Paging the feed past its newest 50 events.
- Hiding bets until a market closes or resolves. This was considered and
  declined.
- Showing pending or rejected task completions, or rejection notes, to
  anyone but the member and admins.
- Opening the coin ledger (`coin_transactions`). It stays private because
  it also holds admin adjustments and their reasons.

## Prior art being reused, and what's deliberately new

- **No new table and no new coin-moving function.** The feed is a
  read-only view over data that already exists.
- **The view runs with the reader's permissions**
  (`with (security_invoker = true)`, available in Postgres 15+; local and
  hosted Supabase run 17). The table access rules below decide what any
  member can see through it, so the view can never show more than they
  allow.
- **Access follows the rule markets already use,** `using (is_invited())`
  (migration `0014`). Uninvited sessions see nothing.
- **Revoke before grant.** The new view is revoked from `anon` and
  `authenticated` before `select` is granted, because Supabase's default
  privileges pre-grant every new public relation (the migration `0006`
  lesson). `service_role` gets explicit access (the `0007` lesson).
- **This reverses two earlier promises, on purpose.** The Market Engine
  spec said bets are private to the bettor and admins. The Parlays spec
  said parlays are private to their owner and admins. Both were explicitly
  deferred to this sub-project, and this spec ends both.

## Who can see what

Migration `0030_social_visibility.sql` replaces four read policies. No
function changes, and no new write access.

| Table | Before | After |
|---|---|---|
| `bets` | owner or admin | every invited member, and admins |
| `parlays` | owner or admin | every invited member, and admins |
| `parlay_legs` | owner or admin (through its parlay) | every invited member, and admins |
| `task_completions` | owner or admin | owner or admin, **plus** every invited member for `approved` rows |
| `coin_transactions` | owner or admin | unchanged |

```sql
drop policy select_own_or_admin_bets on public.bets;
create policy select_invited_bets on public.bets for select to authenticated
  using (is_invited() or is_admin());

drop policy select_own_or_admin_parlays on public.parlays;
create policy select_invited_parlays on public.parlays for select to authenticated
  using (is_invited() or is_admin());

drop policy select_own_or_admin_parlay_legs on public.parlay_legs;
create policy select_invited_parlay_legs on public.parlay_legs for select to authenticated
  using (is_invited() or is_admin());

drop policy select_own_or_admin_task_completions on public.task_completions;
create policy select_task_completions on public.task_completions for select to authenticated
  using (
    profile_id = (select auth.uid())
    or is_admin()
    or (status = 'approved' and is_invited())
  );
```

Existing app queries that are meant to show only the viewer's own rows
already filter by `profile_id` explicitly: `listMyParlays`,
`listMyTaskCompletions` and `getOwnBets`. Widening access therefore
doesn't leak other members' rows into "my" views.

## The `activity_feed` view

Migration `0031_activity_feed_view.sql`. Every row has the same columns:

| column | type | meaning |
|---|---|---|
| `id` | `text` | unique key, e.g. `bet:123`, `parlay:<uuid>` |
| `kind` | `text` | one of the seven kinds below |
| `occurred_at` | `timestamptz` | when it happened |
| `actor_id` | `uuid` | who did it |
| `actor_name` | `text` | their display name |
| `market_id` | `uuid` | the market, when relevant |
| `market_title` | `text` | the market's title, when relevant |
| `outcome_label` | `text` | the outcome, when relevant |
| `amount` | `integer` | DC staked, won or rewarded, when relevant |
| `leg_count` | `integer` | number of picks, for parlays |
| `task_title` | `text` | the task, for completions |

| `kind` | Source | `occurred_at` | `amount` |
|---|---|---|---|
| `bet_placed` | every bet | bet placed | stake |
| `parlay_placed` | every parlay | parlay placed | stake |
| `market_created` | every market | market created | — |
| `market_resolved` | each market's **current** resolution only | resolved | — |
| `bet_won` | bets on the current resolution's outcome | resolved | payout |
| `parlay_won` | parlays with `status = 'won'` | settled | amount credited |
| `task_completed` | `approved` completions | reviewed | the completion's stored reward |

```sql
create view public.activity_feed
with (security_invoker = true)
as
select
  'bet:' || b.id as id,
  'bet_placed' as kind,
  b.created_at as occurred_at,
  b.profile_id as actor_id,
  p.display_name as actor_name,
  m.id as market_id,
  m.title as market_title,
  o.label as outcome_label,
  b.amount as amount,
  null::integer as leg_count,
  null::text as task_title
from public.bets b
join public.market_outcomes o on o.id = b.outcome_id
join public.markets m on m.id = b.market_id
join public.profiles p on p.id = b.profile_id

union all

select
  'parlay:' || pa.id, 'parlay_placed', pa.created_at, pa.profile_id, p.display_name,
  null, null, null, pa.stake,
  (select count(*)::integer from public.parlay_legs l where l.parlay_id = pa.id),
  null
from public.parlays pa
join public.profiles p on p.id = pa.profile_id

union all

select
  'market:' || m.id, 'market_created', m.created_at, m.created_by, p.display_name,
  m.id, m.title, null, null, null, null
from public.markets m
join public.profiles p on p.id = m.created_by

union all

select
  'resolution:' || r.id, 'market_resolved', r.resolved_at, r.resolved_by, p.display_name,
  m.id, m.title, o.label, null, null, null
from public.markets m
join public.market_resolutions r on r.id = m.current_resolution_id
join public.market_outcomes o on o.id = r.outcome_id
join public.profiles p on p.id = r.resolved_by

union all

-- Same payout arithmetic as resolve_market; a DB test pins it to the ledger credit.
select
  'win:' || b.id || ':' || r.id, 'bet_won', r.resolved_at, b.profile_id, p.display_name,
  m.id, m.title, o.label,
  floor(b.amount::numeric * pools.total / o.pool_total)::integer,
  null, null
from public.markets m
join public.market_resolutions r on r.id = m.current_resolution_id
join public.market_outcomes o on o.id = r.outcome_id
join public.bets b on b.outcome_id = o.id
join public.profiles p on p.id = b.profile_id
cross join lateral (
  select sum(o2.pool_total) as total from public.market_outcomes o2 where o2.market_id = m.id
) pools

union all

select
  'parlay_win:' || pa.id, 'parlay_won', pa.settled_at, pa.profile_id, p.display_name,
  null, null, null, pa.credited,
  (select count(*)::integer from public.parlay_legs l where l.parlay_id = pa.id),
  null
from public.parlays pa
join public.profiles p on p.id = pa.profile_id
where pa.status = 'won'

union all

select
  'task:' || c.id, 'task_completed', c.reviewed_at, c.profile_id, p.display_name,
  null, null, null, c.reward_amount, null, t.title
from public.task_completions c
join public.tasks t on t.id = c.task_id
join public.profiles p on p.id = c.profile_id
where c.status = 'approved';

revoke all on public.activity_feed from anon, authenticated;
grant select on public.activity_feed to authenticated;
grant select on public.activity_feed to service_role;
```

What this gets for free, because every row is derived from current state:

- **Overrides.** Only a market's current resolution is joined. When an
  admin overrides, the old `market_resolved` row and its `bet_won` rows
  disappear, and the new ones appear. A `parlay_won` row disappears when
  settlement reverses the parlay.
- **Voided markets.** Their bets still show as `bet_placed`. With no
  current resolution, they produce no `market_resolved` or `bet_won` rows.
- **Refunds aren't wins.** When nobody backed the winning outcome, there are
  no bets on it, so the refund produces no `bet_won` rows. The
  division by that outcome's zero pool is never evaluated.
- **Inactive tasks.** Their completions still show, because `tasks` is
  readable by every invited member whether active or not.

The one cost is that the `bet_won` payout repeats `resolve_market`'s
arithmetic (stake × total pool ÷ winning pool, rounded down). A database
test compares the view's amount with the real `bet_won` ledger credit, so
the two can't silently drift.

The app reads the view with `order by occurred_at desc, id desc limit 50`.
The profile page adds `actor_id = <member>`.

## UI

- **`/leaderboard`**: every member, highest balance first, ties broken
  alphabetically by display name.
  - Ties share a rank, standard competition style (1, 1, 3).
  - Each name links to the member's profile.
- **`/feed`**: the 50 newest `activity_feed` rows, each as one sentence.
  - Each row shows its age: "just now", "5m ago", "3h ago" or "2d ago".
    The age is computed on the server from the difference between now and
    `occurred_at`, so it's the same in every time zone.
  - Market titles link to the market; names link to the member's profile.
- **`/members/[id]`**: a member's display name, balance, leaderboard rank,
  and their 50 most recent feed rows, as sentences.
  - An unknown id shows a 404.
  - This route is separate from the admin-only `/admin/members`.
- **Market page (`/markets/[id]`)**: the "Your bets" section becomes
  **"Bets"**. It lists every member's bets on that market, newest first,
  as "Sarah — 20 DC on Yes". The viewer's own bets are marked "(you)".
- **Home page**: **Leaderboard** and **Feed** links join Markets, Tasks
  and Parlays.

Feed sentences (italics mark a link):

| `kind` | Sentence |
|---|---|
| `bet_placed` | "*Sarah* bet 20 DC on Yes in *Will it rain?*" |
| `parlay_placed` | "*Tom* placed a 3-pick parlay for 10 DC" |
| `market_created` | "*Mia* opened *Will it rain?*" |
| `market_resolved` | "*Will it rain?* resolved: Yes" |
| `bet_won` | "*Sarah* won 45 DC on *Will it rain?*" |
| `parlay_won` | "*Tom*'s 3-pick parlay paid 160 DC" |
| `task_completed` | "*Mia* completed Read Genesis 1-3 (+10 DC)" |

## Error handling

- Every new page is read-only and follows the existing pattern: signed out
  redirects to `/sign-in`, and a failed Supabase read throws rather than
  rendering an empty list that hides the failure.
- An uninvited session sees empty lists, because every underlying access
  rule requires `is_invited()`.
- `/members/[id]` calls `notFound()` for an id with no profile row.

## Testing

DB tests against real RLS-scoped sessions (`seedMembers()`, `clientFor()`,
`serviceClient()`, `ensureInvited()`).

**Access:**
- An invited member can read another member's bets, parlays and parlay
  legs.
- Another invited member can read an approved completion, but not a
  pending or rejected one. The owner and an admin still read all three.
- `coin_transactions` stays owner-or-admin.
- An uninvited session reads zero rows from all four tables and from
  `activity_feed`.
- Direct `insert`/`update`/`delete` on all four tables is still rejected.
- Two existing tests change on purpose, because they pin down the rule
  this sub-project reverses:
  - `market-rls.test.ts` "shows a member only their own bets"
  - `parlay-rls.test.ts` "shows a member only their own parlays and legs"

  Each is rewritten to assert the new visibility.

**The feed view:**
- Every `kind` appears with the documented fields.
- A `bet_won` amount equals the member's actual `bet_won` ledger credit for
  that resolution.
- After an admin override, the old `market_resolved` and `bet_won` rows are
  gone and the new ones are present.
- A voided market, and a market resolved to an outcome nobody backed,
  produce no `bet_won` rows.
- Another member never sees a pending or rejected completion.
- Filtering by `actor_id` returns only that member's rows.

**Unit tests:** leaderboard ranking with ties, relative-time formatting,
and the sentence for each `kind`.

**Playwright e2e:** as the seeded admin, create a market and place a bet,
then confirm:
- `/feed` shows the "bet 5 DC on Yes in …" sentence
- `/leaderboard` lists the member
- the member's profile page shows the same event

No absolute balance is asserted (the Admin Controls lesson). Visibility
across two members lives in the DB tests, since the e2e suite has a single
seeded session.
