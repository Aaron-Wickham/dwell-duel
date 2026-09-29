-- #189: GitHub runs a */10 scheduled workflow on a best-effort basis and dropped most of
-- closing-alerts.yml's runs (twice in seven hours on 2026-09-29), so the timer moves into the
-- database. pg_cron calls ping_closing_alerts() every ten minutes, which asks the app to send
-- closing alerts through pg_net, exactly as the workflow does. The route claims each market in
-- push_log, so the workflow, kept as a backup, never causes a repeat.
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
select cron.schedule('closing-alerts', '*/10 * * * *', 'select public.ping_closing_alerts()');
