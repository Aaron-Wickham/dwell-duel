-- Post-beta cleanup: activity_feed closed to the app, activity_events'
-- foreign key columns indexed, and the feed's two timestamp invariants
-- enforced.
--
-- One explicit transaction, like 0034 and 0035, because the migration runner
-- autocommits each statement. lock_timeout bounds the wait on every
-- statement below the lock block; if one can't be taken in time, nothing is
-- applied and the Deploy Production Database workflow can simply be
-- re-run.
--
-- The app writes task_completions, parlays and activity_events in both
-- orders: resolve_market/void_market update markets (whose trigger writes
-- activity_events) before settle_parlay touches parlays, while an ordinary
-- parlay settle writes parlays and only then activity_events through its
-- own trigger. No fixed lock order is deadlock-free against every writer,
-- so this migration never waits while holding a lock. Each attempt below
-- takes all three locks with NOWAIT inside a subtransaction: either every
-- lock is granted immediately, or none are, since a failed attempt's
-- subtransaction rollback releases whatever that attempt had already
-- taken. It retries every 0.1s for about 5s (matching lock_timeout below),
-- then raises -- nothing is applied, and the migration is simply re-run.
-- Locks taken inside a subtransaction that commits carry through to this
-- outer transaction and hold until its own commit, so no completion or
-- parlay can change between the guard's count and the constraints being
-- added. task_completions and parlays are taken in access exclusive mode,
-- what their own `add constraint ... check` needs to validate;
-- activity_events only needs share row exclusive, since `create index`
-- (not concurrently) takes a plain share lock, which share row exclusive
-- already covers, and nothing here writes rows into it. activity_feed
-- isn't locked: locking a view locks every table it reads, and a revoke
-- needs no lock of its own.
begin;
set local lock_timeout = '5s';

do $$
declare
  attempt int := 0;
begin
  loop
    begin
      lock table public.task_completions, public.parlays in access exclusive mode nowait;
      lock table public.activity_events in share row exclusive mode nowait;
      exit;
    exception when lock_not_available then
      attempt := attempt + 1;
      if attempt >= 50 then
        raise;
      end if;
      perform pg_sleep(0.1);
    end;
  end loop;
end
$$;

-- Preflight: the constraints below are added validated, so a row already
-- breaking either invariant would fail the whole migration at the alter
-- table, with Postgres naming only the constraint. This counts both first
-- and raises with each count, so the rows can be found and fixed before
-- anything is applied.
do $$
declare
  parts text[] := '{}';
  n integer;
begin
  select count(*) into n from public.task_completions where status = 'approved' and reviewed_at is null;
  if n > 0 then parts := parts || format('task_completions approved without reviewed_at: %s', n); end if;

  select count(*) into n from public.parlays where status = 'won' and settled_at is null;
  if n > 0 then parts := parts || format('parlays won without settled_at: %s', n); end if;

  if array_length(parts, 1) > 0 then
    raise exception '0036: rows already break the new invariants — %. Fix them before applying.', array_to_string(parts, ', ');
  end if;
end;
$$;

-- No deployed build reads activity_feed since the feed moved to
-- activity_events (0035). It stays, unchanged, as the DB tests' equivalence
-- oracle, which reads it through the service role or as its owner.
revoke select on public.activity_feed from authenticated, anon;

-- Deleting a source row cascades to its events. Without an index on the
-- referencing column, every deleted bet, parlay, completion, outcome, market
-- or resolution scans the whole events table.
-- activity_events_market_resolution_idx (0035) is partial, so it can't serve
-- the market cascade, and a resolution delete could only walk all of it.
-- actor_id doesn't cascade, but deleting a profile still looks its events
-- up, with no hidden_at predicate, so the partial activity_events_actor_idx
-- can't serve that either.
create index activity_events_bet_id_idx on public.activity_events (bet_id);
create index activity_events_parlay_id_idx on public.activity_events (parlay_id);
create index activity_events_task_completion_id_idx on public.activity_events (task_completion_id);
create index activity_events_outcome_id_idx on public.activity_events (outcome_id);
create index activity_events_market_id_idx on public.activity_events (market_id);
create index activity_events_resolution_id_idx on public.activity_events (resolution_id);
create index activity_events_actor_id_idx on public.activity_events (actor_id);

-- The feed dates an approved completion by reviewed_at and a won parlay by
-- settled_at, and activity_events.occurred_at is not null. approve_task_completion
-- and settle_parlay always set both. With these, a direct write that leaves
-- one out fails here, naming the rule, rather than in the events trigger
-- with a bare not-null error. Validated, not NOT VALID: the guard above has
-- already proved every existing row passes.
alter table public.task_completions
  add constraint task_completions_approved_has_reviewed_at check (status <> 'approved' or reviewed_at is not null);
alter table public.parlays
  add constraint parlays_won_has_settled_at check (status <> 'won' or settled_at is not null);

-- market_sparklines (0035), recreated with the same signature, return shape,
-- caps and output, bit for bit. 0035 joined every bet to every outcome of its
-- market to keep a running pool per outcome, so the work grew with bets ×
-- outcomes. Here each outcome's running pool runs over that outcome's own
-- bets, and the market's running total over its bets, both in the one
-- (created_at, id) order that numbers them. Only the picked positions need
-- every outcome's share: each position is added to each outcome's own run as
-- a zero-amount marker, sorted just after the bet at that position, so the
-- marker's running sum is that outcome's pool at or before it, and 0 for an
-- outcome with no bet yet. The sums are the same integers 0035 added, divided
-- the same way, so every share is the same double.
--
-- Everything else is as 0035 explains it: security invoker, so the caller's
-- access rules on bets and market_outcomes apply; no set search_path, so
-- Postgres can inline it and plan each market's bets through
-- bets_market_created_idx (every relation is schema-qualified, and the
-- functions it calls resolve from pg_catalog); ids capped at the first 50
-- flattened elements; p_points clamped to 1..200; each market's bets read
-- through an offset 0 fenced lateral subquery, so the lookup stays keyed on
-- market_id. create or replace keeps the grants 0035 gave it.
create or replace function public.market_sparklines(p_market_ids uuid[], p_points integer default 40)
returns table (market_id uuid, points jsonb)
language sql
stable
as $$
  with ids as (
    select distinct u.id
    from unnest(p_market_ids) with ordinality as u(id, ord)
    where u.ord <= 50
  ),
  ordered as (
    select bet.market_id, bet.outcome_id, bet.amount, bet.created_at,
      row_number() over w as n,
      sum(bet.amount) over w as total
    from ids
    cross join lateral (
      select b.id, b.market_id, b.outcome_id, b.amount, b.created_at
      from public.bets b
      where b.market_id = ids.id
      offset 0
    ) bet
    window w as (partition by bet.market_id order by bet.created_at, bet.id)
  ),
  sized as (
    select o.market_id, count(*) as bets,
      least(count(*), greatest(1, least(coalesce(p_points, 40), 200))) as points
    from ordered o
    group by o.market_id
  ),
  picked as (
    select s.market_id,
      case when s.points = 1 then s.bets else 1 + (g.i - 1) * (s.bets - 1) / (s.points - 1) end as n
    from sized s
    cross join lateral generate_series(1, s.points) as g(i)
  ),
  pooled as (
    select e.market_id, e.n, e.outcome_id, e.mark,
      sum(e.amount) over (partition by e.market_id, e.outcome_id order by e.n, e.mark) as pool
    from (
      select o.market_id, o.n, o.outcome_id, o.amount, false as mark
      from ordered o
      union all
      select p.market_id, p.n, mo.id, 0, true
      from picked p
      join public.market_outcomes mo on mo.market_id = p.market_id
    ) e
  ),
  chosen as (
    select o.market_id, o.n, o.created_at,
      jsonb_object_agg(pl.outcome_id, pl.pool::double precision / o.total::double precision) as shares
    from pooled pl
    join ordered o on o.market_id = pl.market_id and o.n = pl.n
    where pl.mark
    group by o.market_id, o.n, o.created_at
  )
  select c.market_id, jsonb_agg(jsonb_build_object('t', c.created_at, 'shares', c.shares) order by c.n)
  from chosen c
  group by c.market_id
  order by c.market_id
$$;

commit;
