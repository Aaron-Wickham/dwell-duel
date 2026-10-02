-- Leftovers from the LMSR release (#345, after #325 and 0107).
--
-- 1. pick_quotes goes: 0107 kept it only for the build that served during that deploy, and no
--    build or function body reads it now. pick_quote, which settle_parlay and the conversion use,
--    stays.
-- 2. enforce_write_limit loses its bet_cancel message: 0107 dropped that limit and its trigger.
-- 3. cancelled_bets leaves the realtime publication; no page follows it row by row any more. The
--    table stays, for My bets' Cancelled tab and a market's bet history.
-- 4. Category changes (0103) reach open pages. A rename or hide writes only market_categories, so
--    it pings the markets topic, which every page showing a market list already follows; no new
--    topic, so the realtime.messages policy is unchanged. The market page follows only its own
--    rows, so market_categories joins the publication and that page follows its category's row. A
--    merge moves markets.category_id, which both already hear.
--
-- Safe while the previous build serves: it never calls pick_quotes, never follows cancelled_bets,
-- and the trigger and publication entry are additive.

begin;
set local lock_timeout = '5s';

drop function public.pick_quotes(uuid[]);

create or replace function public.enforce_write_limit()
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
        when 'category' then 'you have created too many categories recently; try again later'
        when 'comment' then 'you have posted too many comments recently; try again later'
        when 'reaction' then 'you have added too many reactions recently; try again later'
        when 'task_submission' then 'you have submitted too many tasks recently; try again later'
        else 'too many writes; try again later'
      end
      using errcode = 'DD429';
    end if;
  end loop;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     or (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cancelled_bets'
  ) then
    alter publication supabase_realtime drop table public.cancelled_bets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'market_categories'
  ) then
    alter publication supabase_realtime add table public.market_categories;
  end if;
end
$$;

-- Plain, not deferred (AGENTS.md): live_ping_trigger only queues the topic.
create trigger live_ping_market_categories after insert or update or delete on public.market_categories
  for each row execute function public.live_ping_trigger('markets');

commit;
