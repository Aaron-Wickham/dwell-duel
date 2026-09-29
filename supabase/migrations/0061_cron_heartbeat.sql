-- #149: GitHub runs the ten-minute closing-alerts schedule, and it can delay it or switch it off
-- (after 60 days without repository activity) without telling anyone. The route records each
-- successful run here, so the Admin pages can warn when the last one is too old.
--
-- One explicit transaction, like 0034-0060.
begin;
set local lock_timeout = '5s';

-- One row per scheduled job, holding when it last finished without an error. Only the service
-- role writes it; admins and the owner read it.
create table public.cron_heartbeats (
  name text primary key check (char_length(name) between 1 and 64),
  last_run_at timestamptz not null
);

alter table public.cron_heartbeats enable row level security;

create policy select_cron_heartbeats_admin on public.cron_heartbeats for select to authenticated
  using ((select public.has_role('admin')));

revoke all on public.cron_heartbeats from public, anon, authenticated, service_role;
grant select on public.cron_heartbeats to authenticated;
grant all on public.cron_heartbeats to service_role;

-- Stamps a job's run with the database's clock, so the age the Admin pages show doesn't depend on
-- the server that called it.
create function public.record_cron_heartbeat(p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.cron_heartbeats (name, last_run_at)
  values (p_name, now())
  on conflict (name) do update set last_run_at = excluded.last_run_at;
$$;

revoke execute on function public.record_cron_heartbeat(text) from public, anon, authenticated;
grant execute on function public.record_cron_heartbeat(text) to service_role;

commit;
