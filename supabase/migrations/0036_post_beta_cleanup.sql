-- Post-beta cleanup: activity_feed closed to the app, activity_events'
-- foreign key columns indexed, and the feed's two timestamp invariants
-- enforced.
--
-- One explicit transaction, like 0034 and 0035, because the migration runner
-- autocommits each statement. lock_timeout bounds each lock wait below
-- separately; if a lock can't be taken in time, or a conflicting
-- transaction is already in flight and this migration would deadlock
-- against it, nothing is applied and the Deploy Production Database
-- workflow can simply be re-run.
--
-- The locks hold until commit, so no completion or parlay can change between
-- the guard's count and the constraints being added. task_completions and
-- parlays are taken in access exclusive mode up front -- the mode their
-- own `add constraint ... check` needs to validate -- so neither lock is
-- ever upgraded mid-transaction. Locking at a weaker mode first (say share
-- row exclusive) and upgrading later would deadlock against any read that
-- already holds that weaker mode and is itself waiting on this
-- transaction's own later statement: an in-flight approve_task_completion's
-- `select ... for update`, for instance, or resolve_market/void_market
-- reaching settle_parlay's update. activity_events only needs share row
-- exclusive: `create index` (not concurrently) takes a plain share lock,
-- which share row exclusive already covers, and nothing here writes rows
-- into it. The three are locked in the app's own global write order --
-- task_completions, then parlays, then activity_events, since every writer
-- reaches activity_events through a trigger after writing its source row --
-- so a transaction already holding an earlier table's lock and waiting on a
-- later one can still finish instead of deadlocking against this one. If a
-- conflicting transaction is already in progress regardless, this migration
-- is the one that waits, up to lock_timeout, and then aborts cleanly -- the
-- app's own transaction completes, and the migration is simply re-run.
-- activity_feed isn't in the list: locking a view locks every table it
-- reads, and a revoke needs no lock of its own.
begin;
set local lock_timeout = '5s';
lock table public.task_completions, public.parlays in access exclusive mode;
lock table public.activity_events in share row exclusive mode;

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
