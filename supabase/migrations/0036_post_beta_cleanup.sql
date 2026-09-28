-- Post-beta cleanup: activity_feed closed to the app, activity_events'
-- foreign key columns indexed, and the feed's two timestamp invariants
-- enforced.
--
-- One explicit transaction, like 0034 and 0035, because the migration runner
-- autocommits each statement. lock_timeout bounds each lock wait below
-- separately; if one can't be taken in time, or Postgres picks this
-- transaction to break a deadlock, nothing is applied and the Deploy
-- Production Database workflow can simply be re-run.
--
-- The locks hold until commit, so no completion or parlay can change between
-- the guard's count and the constraints being added. They're taken in the
-- order the app's own writers take them: task_completions before parlays
-- (0033's order), and activity_events last, since every writer reaches it
-- through a trigger after writing its source row. Each alter table ... add
-- constraint below still upgrades its table to access exclusive while it
-- validates; lock_timeout covers that wait too. activity_feed isn't in the
-- list: locking a view locks every table it reads, and a revoke needs no
-- lock of its own.
begin;
set local lock_timeout = '5s';
lock table public.task_completions, public.parlays, public.activity_events in share row exclusive mode;

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

commit;
