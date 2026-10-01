-- Destructive cleanup, shipped on its own after the code stopped using these (AGENTS.md).
--
-- 1. market_outcomes, tasks and feed_reactions leave the supabase_realtime publication: live
--    updates for them moved to Broadcast pings (0092), and LiveRefresh's Postgres Changes channels
--    follow none of them.
-- 2. markets.sparkline (0070), its trigger and cache_market_sparkline: the list reads market_sparks
--    (0095) now.
-- 3. push_resolve_reminders (0057) and push_market_alerts (0058): the closing alerts read
--    due_resolve_reminders and due_market_alerts since 0071, and nothing calls the old claiming pair.
begin;
set local lock_timeout = '5s';

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     or (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array array['market_outcomes', 'tasks', 'feed_reactions'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end
$$;

drop trigger if exists markets_cache_sparkline on public.markets;
drop function if exists public.cache_market_sparkline();
alter table public.markets drop column if exists sparkline;

drop function if exists public.push_resolve_reminders();
drop function if exists public.push_market_alerts();

commit;
