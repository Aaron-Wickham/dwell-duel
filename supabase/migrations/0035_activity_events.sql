-- The feed's events, stored instead of rebuilt on every read. activity_feed
-- (0031) derives every event from seven tables and sorts them all on each
-- load; this table holds the same rows, kept in step by triggers, so a feed
-- page is one index range. The view stays until no deployed build reads it.
--
-- One explicit transaction, like 0034, because the migration runner
-- autocommits each statement. lock_timeout bounds every wait this migration
-- can incur: if a lock below can't be taken in time, or two transactions
-- would deadlock, Postgres aborts this one with nothing applied, and the
-- Deploy Production Database workflow can simply be re-run.
--
-- The lock table statement takes every lock this migration needs up front,
-- in one call: not just the tables the triggers watch (markets and
-- completions, then bets and the ledger, then parlays, following 0033's
-- order), but also profiles, market_outcomes and market_resolutions, which
-- create table's own foreign keys would otherwise lock one at a time,
-- part-way through the transaction — the real cause of a deadlock a
-- place_bet-shaped transaction (coin_transactions, then bets) can hit
-- against this statement if those three are missing. Taking them all first
-- means create table's later requests for the same locks are free: this
-- session already holds them.
begin;
set local lock_timeout = '5s';
lock table public.markets, public.task_completions, public.bets, public.coin_transactions, public.parlays, public.profiles, public.market_outcomes, public.market_resolutions in share row exclusive mode;

-- Ids, kinds, times, actors and amounts are the view's, so feed cursors
-- (occurred_at, id) from before this migration still point at the same rows.
-- Names, titles, labels and leg counts are joined at read time, so nothing
-- here can go stale. hidden_at marks an event the current truth no longer
-- shows: an overridden resolution and its wins, or a reversed parlay win.
--
-- The foreign keys clean events up with their source rows (tests/db/
-- fixtures.ts deletes parlays, completions and markets before profiles).
-- Creating each one takes a share row exclusive lock on the table it
-- references — profiles, markets, market_outcomes, bets, market_resolutions,
-- parlays and task_completions — but the lock table statement above already
-- holds every one of those, so none of these seven waits or can deadlock.
-- At runtime, each FK's check takes FOR KEY SHARE on the row it names, which
-- each source row's own foreign keys already hold in the same transaction,
-- or which that transaction already locks itself (a resolve's market, a
-- settle's parlay), so the triggers add no new lock waits there either.
-- Nothing takes FOR UPDATE on profiles (0033), and no trigger takes a row
-- lock of its own on a profile or a market.
create table public.activity_events (
  id text primary key,
  kind text not null check (kind in ('bet_placed','parlay_placed','market_created','market_resolved','bet_won','parlay_won','task_completed')),
  occurred_at timestamptz not null,
  actor_id uuid not null references public.profiles (id),
  market_id uuid references public.markets (id) on delete cascade,
  outcome_id uuid references public.market_outcomes (id) on delete cascade,
  bet_id bigint references public.bets (id) on delete cascade,
  resolution_id uuid references public.market_resolutions (id) on delete cascade,
  parlay_id uuid references public.parlays (id) on delete cascade,
  task_completion_id uuid references public.task_completions (id) on delete cascade,
  amount integer,
  hidden_at timestamptz
);

create index activity_events_feed_idx on public.activity_events (occurred_at desc, id desc) where hidden_at is null;
create index activity_events_actor_idx on public.activity_events (actor_id, occurred_at desc, id desc) where hidden_at is null;
-- A resolve or override hides and un-hides one market's resolution events;
-- without this it would scan the whole table while the market row is locked.
create index activity_events_market_resolution_idx on public.activity_events (market_id) where resolution_id is not null;

alter table public.activity_events enable row level security;

-- The same audience that can read the feed's source tables today. Task
-- events exist only for approved completions, which every invited member
-- can already see. No insert, update or delete policy: only the triggers
-- below write.
create policy select_activity_events on public.activity_events for select to authenticated
  using ((select is_invited()));

revoke all on public.activity_events from public, anon, authenticated, service_role;
grant select on public.activity_events to authenticated, service_role;

-- Each trigger mirrors the columns an event copies from its own source row,
-- on insert and on any later update of them, so a row written or edited
-- directly (the scale seed inserts approved completions and moves parlays'
-- created_at) still matches the view. Re-writing an existing event updates it
-- in place and un-hides it; on conflict keeps every write idempotent.
--
-- No trigger watches market_resolutions itself: resolve_market is its only
-- writer, and a direct edit of resolved_at, resolved_by or outcome_id on an
-- existing resolution would drift this table from the view, same as hand-
-- editing any other source row the triggers don't expect.

create function public.activity_events_from_bet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity_events (id, kind, occurred_at, actor_id, market_id, outcome_id, bet_id, amount)
  values ('bet:' || new.id, 'bet_placed', new.created_at, new.profile_id, new.market_id, new.outcome_id, new.id, new.amount)
  on conflict (id) do update set
    occurred_at = excluded.occurred_at,
    actor_id = excluded.actor_id,
    market_id = excluded.market_id,
    outcome_id = excluded.outcome_id,
    amount = excluded.amount,
    hidden_at = null;
  return null;
end;
$$;

create function public.activity_events_from_market()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or (new.created_by, new.created_at) is distinct from (old.created_by, old.created_at) then
    insert into public.activity_events (id, kind, occurred_at, actor_id, market_id)
    values ('market:' || new.id, 'market_created', new.created_at, new.created_by, new.id)
    on conflict (id) do update set
      occurred_at = excluded.occurred_at,
      actor_id = excluded.actor_id,
      hidden_at = null;
  end if;

  if (tg_op = 'INSERT' and new.current_resolution_id is null)
     or (tg_op = 'UPDATE' and new.current_resolution_id is not distinct from old.current_resolution_id) then
    return null;
  end if;

  -- The view shows only the current resolution and its wins. resolve_market
  -- moves current_resolution_id before it pays the new winners, so their
  -- bet_won events (coin_transactions trigger below) arrive after this hide.
  update public.activity_events
  set hidden_at = now()
  where market_id = new.id
    and resolution_id is not null
    and resolution_id is distinct from new.current_resolution_id
    and hidden_at is null;

  if new.current_resolution_id is not null then
    insert into public.activity_events (id, kind, occurred_at, actor_id, market_id, outcome_id, resolution_id)
    select 'resolution:' || r.id, 'market_resolved', r.resolved_at, r.resolved_by, new.id, r.outcome_id, r.id
    from public.market_resolutions r
    where r.id = new.current_resolution_id
    on conflict (id) do update set
      occurred_at = excluded.occurred_at,
      actor_id = excluded.actor_id,
      outcome_id = excluded.outcome_id,
      hidden_at = null;

    -- Only reachable by pointing a market back at an older resolution by
    -- hand; resolve_market always makes a new one.
    update public.activity_events
    set hidden_at = null
    where market_id = new.id
      and resolution_id = new.current_resolution_id
      and hidden_at is not null;
  end if;

  return null;
end;
$$;

-- A winner's payout, from the ledger row resolve_market writes for it, so the
-- amount is exactly what was paid. The view computes the same floor(stake ×
-- pool / winning pool) from pools that can't move once a market resolves.
-- Rows without resolve_market's meta (a hand-written ledger row) are skipped.
create function public.activity_events_from_payout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.meta ->> 'bet_id', '') !~ '^[0-9]{1,18}$'
     or coalesce(new.meta ->> 'resolution_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;

  insert into public.activity_events (id, kind, occurred_at, actor_id, market_id, outcome_id, bet_id, resolution_id, amount, hidden_at)
  select 'win:' || b.id || ':' || r.id, 'bet_won', r.resolved_at, new.profile_id, r.market_id, b.outcome_id, b.id, r.id, new.amount,
    case when m.current_resolution_id = r.id then null else now() end
  from public.bets b
  join public.market_resolutions r on r.id = (new.meta ->> 'resolution_id')::uuid
  join public.markets m on m.id = r.market_id
  where b.id = (new.meta ->> 'bet_id')::bigint
  on conflict (id) do update set
    occurred_at = excluded.occurred_at,
    actor_id = excluded.actor_id,
    outcome_id = excluded.outcome_id,
    amount = excluded.amount,
    hidden_at = excluded.hidden_at;
  return null;
end;
$$;

-- settle_parlay writes status, credited and settled_at in one update, so a
-- win is inserted with its final credit and time, and a reversal (won to
-- lost, through an override) hides it. A parlay that wins again later gets
-- its event back, with the new time and credit.
create function public.activity_events_from_parlay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or (new.profile_id, new.stake, new.created_at) is distinct from (old.profile_id, old.stake, old.created_at) then
    insert into public.activity_events (id, kind, occurred_at, actor_id, parlay_id, amount)
    values ('parlay:' || new.id, 'parlay_placed', new.created_at, new.profile_id, new.id, new.stake)
    on conflict (id) do update set
      occurred_at = excluded.occurred_at,
      actor_id = excluded.actor_id,
      amount = excluded.amount,
      hidden_at = null;
  end if;

  if new.status = 'won' then
    if tg_op = 'INSERT' or old.status <> 'won'
       or (new.profile_id, new.credited, new.settled_at) is distinct from (old.profile_id, old.credited, old.settled_at) then
      insert into public.activity_events (id, kind, occurred_at, actor_id, parlay_id, amount)
      values ('parlay_win:' || new.id, 'parlay_won', new.settled_at, new.profile_id, new.id, new.credited)
      on conflict (id) do update set
        occurred_at = excluded.occurred_at,
        actor_id = excluded.actor_id,
        amount = excluded.amount,
        hidden_at = null;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'won' then
    update public.activity_events
    set hidden_at = now()
    where id = 'parlay_win:' || new.id and hidden_at is null;
  end if;

  return null;
end;
$$;

create function public.activity_events_from_task_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' then
    if tg_op = 'INSERT' or old.status <> 'approved'
       or (new.profile_id, new.reward_amount, new.reviewed_at) is distinct from (old.profile_id, old.reward_amount, old.reviewed_at) then
      insert into public.activity_events (id, kind, occurred_at, actor_id, task_completion_id, amount)
      values ('task:' || new.id, 'task_completed', new.reviewed_at, new.profile_id, new.id, new.reward_amount)
      on conflict (id) do update set
        occurred_at = excluded.occurred_at,
        actor_id = excluded.actor_id,
        amount = excluded.amount,
        hidden_at = null;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'approved' then
    update public.activity_events
    set hidden_at = now()
    where id = 'task:' || new.id and hidden_at is null;
  end if;

  return null;
end;
$$;

-- Trigger functions can't be called directly, but they get the same
-- explicit revoke as every other function here (0006).
revoke execute on function public.activity_events_from_bet() from public, anon, authenticated;
revoke execute on function public.activity_events_from_market() from public, anon, authenticated;
revoke execute on function public.activity_events_from_payout() from public, anon, authenticated;
revoke execute on function public.activity_events_from_parlay() from public, anon, authenticated;
revoke execute on function public.activity_events_from_task_completion() from public, anon, authenticated;

create trigger activity_events_from_bet
  after insert or update of market_id, outcome_id, profile_id, amount, created_at on public.bets
  for each row execute function public.activity_events_from_bet();

create trigger activity_events_from_market
  after insert or update of created_by, created_at, current_resolution_id on public.markets
  for each row execute function public.activity_events_from_market();

create trigger activity_events_from_payout
  after insert on public.coin_transactions
  for each row when (new.type = 'bet_won') execute function public.activity_events_from_payout();

create trigger activity_events_from_parlay
  after insert or update of profile_id, stake, created_at, status, credited, settled_at on public.parlays
  for each row execute function public.activity_events_from_parlay();

create trigger activity_events_from_task_completion
  after insert or update of profile_id, status, reward_amount, reviewed_at on public.task_completions
  for each row execute function public.activity_events_from_task_completion();

-- Every row the view shows today, with the related ids its own ids carry.
-- The view has no outcome id, so it comes from the bet, or for a resolution
-- from the resolution row. tests/db/activity-events.test.ts runs this same
-- statement against a scratch table and compares it with the triggers' rows.
insert into public.activity_events (id, kind, occurred_at, actor_id, market_id, outcome_id, bet_id, resolution_id, parlay_id, task_completion_id, amount)
select f.id, f.kind, f.occurred_at, f.actor_id, f.market_id, coalesce(b.outcome_id, r.outcome_id), f.bet_id, f.resolution_id, f.parlay_id, f.task_completion_id, f.amount
from (
  select v.id, v.kind, v.occurred_at, v.actor_id, v.market_id, v.amount,
    case when v.kind in ('bet_placed', 'bet_won') then split_part(v.id, ':', 2)::bigint end as bet_id,
    case v.kind when 'market_resolved' then split_part(v.id, ':', 2)::uuid when 'bet_won' then split_part(v.id, ':', 3)::uuid end as resolution_id,
    case when v.kind in ('parlay_placed', 'parlay_won') then split_part(v.id, ':', 2)::uuid end as parlay_id,
    case when v.kind = 'task_completed' then split_part(v.id, ':', 2)::uuid end as task_completion_id
  from public.activity_feed v
) f
left join public.bets b on b.id = f.bet_id
left join public.market_resolutions r on r.id = f.resolution_id;

-- For live updates (components/live/live-refresh.tsx), guarded as in 0032.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_events'
  ) then
    alter publication supabase_realtime add table public.activity_events;
  end if;
end
$$;

commit;
