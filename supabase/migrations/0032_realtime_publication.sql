-- Streams row changes on the tables DwellDuel's signed-in pages read, for
-- components/live/live-refresh.tsx, which refreshes whatever page is on
-- screen. Realtime is already enabled (supabase/config.toml's [realtime]
-- block); this is the missing piece. Postgres Changes checks each
-- subscriber's RLS, so a member only hears about rows they can already
-- read -- except DELETE events, which skip RLS and carry only the primary
-- key. LiveRefresh never reads payloads either way; it just triggers a
-- refresh, which re-reads through RLS.
--
-- Safe to run on the hosted project, where supabase_realtime already exists
-- and a table may already have been added from the dashboard: each table is
-- added only if it isn't published yet (ALTER PUBLICATION ... ADD TABLE
-- errors on a table that is), and a FOR ALL TABLES publication, which
-- rejects ADD TABLE, already covers them.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array array['bets', 'markets', 'market_resolutions', 'parlays', 'parlay_legs', 'tasks', 'task_completions', 'profiles']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
