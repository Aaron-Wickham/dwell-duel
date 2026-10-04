-- The service role can read and write every table in public, as it already can locally.
--
-- Production (a project made after Supabase changed its defaults) gives service_role only
-- TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on a table postgres creates; local Supabase gives it
-- everything. Tables whose migration granted service_role explicitly, or that predate the
-- difference, are fine. Three never got a grant: idempotency_keys, so the keep-alive cron's
-- `key cleanup` step has failed with 42501 every run, and live_pings and live_ping_queue, which only
-- definer triggers touch today. service_role bypasses RLS and is held only by the server, so this
-- gives it nothing it couldn't already reach through a definer function.
--
-- Additive: grants only.
begin;
set local lock_timeout = '5s';

grant select, insert, update, delete on public.idempotency_keys, public.live_pings, public.live_ping_queue to service_role;

-- So the next table doesn't need to remember it either, on either side.
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role;

commit;
