-- Per-member write limits (#273).
--
-- One script run from a member's session could otherwise post thousands of
-- markets, comments, reactions or task submissions, or loop place-and-cancel
-- (a full refund while the market is open) to write unbounded bets,
-- cancelled_bets, ledger and feed rows, and push the free-tier database toward
-- its 500 MB read-only line. Each of those inserts now passes a BEFORE INSERT
-- trigger that counts the member's own writes in fixed windows and raises once
-- a window is full. The limits sit far above what a friend group does by hand.
--
-- The counts live in write_rate_counters, one small row per member, action and
-- window, not in a scan of the source tables: an upsert's row lock makes the
-- count exact under concurrent requests, and a raise rolls the increment back
-- with the insert. The windows are fixed, not sliding: a window starts at the
-- first write after the last one expired, so a member who fills one window
-- just before it ends can fill the next straight after, up to twice the limit
-- across the boundary. That's accepted: the point is a bound on growth, not
-- an exact rate, and a fixed window needs one row per member, action and
-- window instead of a row per write.
-- Only a member's own row counts (auth.uid() is the row's
-- owner), so the service role, and an admin removing someone else's bet, pass.
-- Admins and the owner aren't limited at all: they're trusted with far more
-- than this already, and set up markets for the group in bulk.
--
-- write_limits() is the one list; lib/forms/limits.ts's WRITE_LIMITS mirrors
-- it and tests/db/write-limits.test.ts keeps them equal.
--
-- Push devices are capped rather than rate-limited: a member keeps their ten
-- most recently used subscriptions, and saving an eleventh drops the oldest,
-- so a closing-alerts run can't be made to fan out to thousands of endpoints.
--
-- Additive: new table, functions and triggers only. The old build shows its
-- generic error for a refused write until the new one deploys.
--
-- One explicit transaction, like 0034-0072.
begin;
set local lock_timeout = '5s';

create function public.write_limits()
returns table (action text, max_writes integer, window_seconds integer)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('market', 20, 86400),
    ('comment', 10, 60),
    ('comment', 200, 86400),
    ('reaction', 60, 60),
    ('reaction', 1000, 86400),
    ('task_submission', 30, 86400),
    ('bet_cancel', 20, 3600)
  ) as l (action, max_writes, window_seconds)
$$;

revoke execute on function public.write_limits() from public, anon;
grant execute on function public.write_limits() to authenticated, service_role;

create table public.write_rate_counters (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  window_seconds integer not null,
  window_start timestamptz not null,
  writes integer not null,
  primary key (profile_id, action, window_seconds)
);

-- Written only by enforce_write_limit (security definer); members have no access at all.
alter table public.write_rate_counters enable row level security;
revoke all on public.write_rate_counters from public, anon, authenticated, service_role;
grant all on public.write_rate_counters to service_role;

-- tg_argv: the action, then the name of the column holding the row's owner.
create function public.enforce_write_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := tg_argv[0];
  v_owner uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
  v_limit record;
  v_writes integer;
begin
  if auth.uid() is null or v_owner is distinct from auth.uid() or public.has_role('admin') then
    return new;
  end if;

  -- A comment replayed with its attempt key (0083) is about to hit the key's unique index and post
  -- nothing, so it doesn't count: a member at the limit whose response was lost still sees it posted.
  if v_action = 'comment' and (to_jsonb(new) ->> 'attempt_key') is not null and exists (
    select 1 from public.market_comments c where c.attempt_key = (to_jsonb(new) ->> 'attempt_key')::uuid
  ) then
    return new;
  end if;

  for v_limit in select l.max_writes, l.window_seconds from public.write_limits() l where l.action = v_action loop
    insert into public.write_rate_counters as c (profile_id, action, window_seconds, window_start, writes)
    values (v_owner, v_action, v_limit.window_seconds, now(), 1)
    on conflict (profile_id, action, window_seconds) do update
      set window_start = case when c.window_start <= now() - make_interval(secs => v_limit.window_seconds) then now() else c.window_start end,
          writes = case when c.window_start <= now() - make_interval(secs => v_limit.window_seconds) then 1 else c.writes + 1 end
    returning c.writes into v_writes;

    if v_writes > v_limit.max_writes then
      raise exception '%', case v_action
        when 'market' then 'you have created too many markets recently; try again later'
        when 'comment' then 'you have posted too many comments recently; try again later'
        when 'reaction' then 'you have added too many reactions recently; try again later'
        when 'task_submission' then 'you have submitted too many tasks recently; try again later'
        when 'bet_cancel' then 'you have cancelled too many bets recently; try again later'
        else 'too many writes; try again later'
      end
      using errcode = 'DD429';
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function public.enforce_write_limit() from public, anon, authenticated;

create trigger markets_write_limit before insert on public.markets
  for each row execute function public.enforce_write_limit('market', 'created_by');
create trigger market_comments_write_limit before insert on public.market_comments
  for each row execute function public.enforce_write_limit('comment', 'profile_id');
create trigger feed_reactions_write_limit before insert on public.feed_reactions
  for each row execute function public.enforce_write_limit('reaction', 'profile_id');
create trigger task_completions_write_limit before insert on public.task_completions
  for each row execute function public.enforce_write_limit('task_submission', 'profile_id');
create trigger cancelled_bets_write_limit before insert on public.cancelled_bets
  for each row execute function public.enforce_write_limit('bet_cancel', 'profile_id');

-- ─── Push devices ───────────────────────────────────────────────────────────

-- The row just saved always stays; of the rest, the nine last used (or saved) do.
-- Also on a change of owner, since save_push_subscription can hand a shared device's row over.
create function public.cap_push_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_subscriptions s
  where s.profile_id = new.profile_id
    and s.id <> new.id
    and s.id not in (
      select k.id from public.push_subscriptions k
      where k.profile_id = new.profile_id and k.id <> new.id
      order by greatest(k.created_at, coalesce(k.last_success_at, k.created_at)) desc, k.id desc
      limit 9
    );
  return null;
end;
$$;

revoke execute on function public.cap_push_subscriptions() from public, anon, authenticated;

create trigger push_subscriptions_cap after insert or update of profile_id on public.push_subscriptions
  for each row execute function public.cap_push_subscriptions();

commit;
