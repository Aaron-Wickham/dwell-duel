-- #189: GitHub runs a */10 scheduled workflow on a best-effort basis and dropped most of
-- closing-alerts.yml's runs (twice in seven hours on 2026-09-29), so the timer moves into the
-- database. pg_cron runs ping_closing_alerts() every minute, and it asks the app to send closing
-- alerts through pg_net, exactly as the workflow does, but only when there's something to send:
-- a market that closed in the last 15 minutes still missing either alert. So an alert lands
-- within about a minute of the close, and a quiet minute costs one index lookup. The window keeps
-- a market whose alerts nobody wants (no push_log row is ever written) from pinging for ever.
--
-- The app stamps cron_heartbeats (#149) when it runs, and the Admin warning watches that stamp,
-- so the app is also called whenever the stamp is over nine minutes old: a quiet day still proves
-- the whole path works every ten minutes, and it also sweeps up anything older than the window.
-- The route claims each market in push_log, so the workflow, kept as a backup, never repeats one.
--
-- The app's address and CRON_SECRET live in Supabase Vault as 'app_url' and 'cron_secret', set
-- once by the owner in the SQL editor, never in a migration. Without them the ping does nothing,
-- so the local stack and CI never call anything.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.ping_closing_alerts()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1
    from public.markets m
    where m.status = 'open'
      and m.close_at <= now()
      and m.close_at > now() - interval '15 minutes'
      and (
        not exists (select 1 from public.push_log l where l.kind = 'resolve_reminder' and l.ref = m.id::text)
        or not exists (select 1 from public.push_log l where l.kind = 'market_alert' and l.ref = m.id::text)
      )
  ) and exists (
    select 1 from public.cron_heartbeats h
    where h.name = 'closing-alerts' and h.last_run_at > now() - interval '9 minutes'
  ) then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  return net.http_get(
    url := rtrim(v_url, '/') || '/api/cron/closing-alerts',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.ping_closing_alerts() from public, anon, authenticated;

-- cron.schedule with a job name replaces a job of the same name, so re-running this is harmless.
select cron.schedule('closing-alerts', '* * * * *', 'select public.ping_closing_alerts()');
