-- Task periods in the group's own time zone, and task streaks (#82).
--
-- compute_period_key has read the clock in UTC since 0023, so a daily task reset at 8pm
-- Eastern in summer and 7pm in winter, in the middle of evening devotionals. The group lives
-- on US Eastern time, as seasons do (0051); one function names the zone so it could become a
-- setting later.

create function public.group_time_zone()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'America/New_York'::text;
$$;

revoke execute on function public.group_time_zone() from public, anon;
grant execute on function public.group_time_zone() to authenticated, service_role;

-- Still pinned to one zone rather than the session's TimeZone (0023): PostgREST lets a caller
-- choose the session zone per request, which would let them pick their own period.
create or replace function public.compute_period_key(p_period text, p_at timestamptz default now())
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_period
    when 'daily'   then to_char(l.t, 'YYYY-MM-DD')
    when 'weekly'  then to_char(l.t, 'IYYY-"W"IW')
    when 'monthly' then to_char(l.t, 'YYYY-MM')
    when 'yearly'  then to_char(l.t, 'YYYY')
    else 'once'
  end
  from (select p_at at time zone public.group_time_zone() as t) l;
$$;

revoke execute on function public.compute_period_key(text, timestamptz) from public, anon;
grant execute on function public.compute_period_key(text, timestamptz) to authenticated, service_role;

-- ─── Existing keys ────────────────────────────────────────────────────────────
-- Every stored key was computed in UTC, so a submission made between 8pm (7pm in winter) and
-- midnight Eastern was filed under the next day, and on a Sunday evening or the last evening of
-- a month or year, under the next week, month or year. Left alone, a member who submitted
-- last evening would find today's period already used on the day this ships, and streaks
-- would count the old evening rows a period late.
--
-- submit_task_completion computes the key from now() in the same transaction that sets
-- submitted_at, so recomputing from submitted_at gives exactly the key the new rule would
-- have given. The one catch is the one-active-per-period index: someone who did a daily task
-- at 9am and again at 9pm Eastern on the same day holds two UTC days that are one Eastern day.
-- Row by row, oldest first, a pending or approved row moves only when no other pending or
-- approved row already holds its new key; one that can't move keeps its UTC key, a period it
-- was genuinely granted at the time. Rejected rows aren't in the index, so they always move.
-- No trigger watches period_key (0035's activity trigger lists its columns), so nothing
-- else changes.
-- The lock sits inside the block: the CLI runs each migration statement on its own, and a bare
-- LOCK TABLE needs a transaction around it. It holds until the block's statement ends.
do $$
declare
  r record;
begin
  lock table public.task_completions in share row exclusive mode;
  for r in
    select tc.id, tc.task_id, tc.profile_id, tc.status, public.compute_period_key(t.period, tc.submitted_at) as new_key
    from public.task_completions tc
    join public.tasks t on t.id = tc.task_id
    where t.period is not null
      and tc.period_key <> public.compute_period_key(t.period, tc.submitted_at)
    order by tc.submitted_at, tc.id
  loop
    if r.status = 'rejected' or not exists (
      select 1
      from public.task_completions o
      where o.task_id = r.task_id
        and o.profile_id = r.profile_id
        and o.period_key = r.new_key
        and o.status in ('pending', 'approved')
        and o.id <> r.id
    ) then
      update public.task_completions set period_key = r.new_key where id = r.id;
    end if;
  end loop;
end;
$$;

-- ─── Streaks ──────────────────────────────────────────────────────────────────

-- A period key as a whole number that goes up by one per period, so consecutive periods are
-- consecutive numbers: days and ISO weeks counted from Monday 3 January 2000, months as
-- year * 12 + month, years as themselves. ISO years have 52 or 53 weeks, which is why weeks are
-- counted from each key's Monday rather than from its week number. A key that isn't in the
-- period's shape gives null.
create function public.period_index(p_period text, p_key text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_period = 'daily' and p_key ~ '^\d{4}-\d{2}-\d{2}$' then
      p_key::date - date '2000-01-03'
    when p_period = 'weekly' and p_key ~ '^\d{4}-W\d{2}$' then
      (w.jan4 - extract(isodow from w.jan4)::integer + 1 + (substr(p_key, 7, 2)::integer - 1) * 7 - date '2000-01-03') / 7
    when p_period = 'monthly' and p_key ~ '^\d{4}-\d{2}$' then
      left(p_key, 4)::integer * 12 + substr(p_key, 6, 2)::integer - 1
    when p_period = 'yearly' and p_key ~ '^\d{4}$' then
      p_key::integer
  end
  from (select case when p_key ~ '^\d{4}-W\d{2}$' then make_date(left(p_key, 4)::integer, 1, 4) end as jan4) w;
$$;

revoke execute on function public.period_index(text, text) from public, anon, authenticated;
grant execute on function public.period_index(text, text) to service_role;

create index task_completions_approved_streak_idx
  on public.task_completions (profile_id, task_id, period_key)
  where status = 'approved';

-- The signed-in member's current streak on each repeating task: the run of consecutive periods
-- with an approved completion that ends in the current period or the one before it (so a
-- streak survives until the current period is over). Only approved rows count, so a pending
-- submission can't be shown as a streak a reviewer later rejects; the task row shows it as
-- pending beside the badge instead. includes_current says whether the current period is in
-- the run. p_at stands in for now(), so tests can pin the clock.
create function public.my_task_streaks(p_at timestamptz default now())
returns table (task_id uuid, streak integer, includes_current boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with done as (
    select distinct tc.task_id, t.period, public.period_index(t.period, tc.period_key) as idx
    from public.task_completions tc
    join public.tasks t on t.id = tc.task_id
    where tc.profile_id = (select auth.uid())
      and tc.status = 'approved'
      and t.period is not null
  ),
  runs as (
    select g.task_id, g.period, max(g.idx) as last_idx, count(*)::integer as len
    from (
      select d.task_id, d.period, d.idx, d.idx - row_number() over (partition by d.task_id order by d.idx) as grp
      from done d
      where d.idx is not null
    ) g
    group by g.task_id, g.period, g.grp
  ),
  scored as (
    select r.task_id, r.len, r.last_idx, public.period_index(r.period, public.compute_period_key(r.period, p_at)) as now_idx
    from runs r
  )
  select s.task_id, s.len, s.last_idx = s.now_idx
  from scored s
  where s.last_idx in (s.now_idx, s.now_idx - 1);
$$;

revoke execute on function public.my_task_streaks(timestamptz) from public, anon;
grant execute on function public.my_task_streaks(timestamptz) to authenticated, service_role;
