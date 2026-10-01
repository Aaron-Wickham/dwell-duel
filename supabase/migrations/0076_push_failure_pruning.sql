-- #257: a push endpoint that kept failing for any reason but 404/410 was retried forever and never
-- pruned. Each send now records its outcome per device through record_push_results(): a delivery
-- resets the device's failure streak, a failure extends it, and a device is deleted once it has
-- failed five sends in a row with the first of them over 24 hours ago (so a push-service outage of
-- a few hours never costs anyone their subscription), or has had no delivery for 60 days while
-- failing and its first failure is over 24 hours old too (one transient error never deletes a
-- quiet, healthy device). The app passes only failures the device itself caused; ours (credentials,
-- network, the push service) are never recorded. A member whose subscription was pruned is put back by the client's re-sync (a
-- subscription saved again starts a clean streak).
-- The same migration holds two smaller guards for the closing-alerts route: a lease, so two callers
-- (pg_cron and the GitHub backup) never send the same alert at once, and push_attempts, so a
-- market whose only device keeps failing is given up on after 24 hours (claimed in push_log, so the
-- due_* functions stop returning it) instead of being retried for ever.
-- Additive: two columns, two tables and a few functions; save_push_subscription is replaced in place.
begin;
set local lock_timeout = '5s';

alter table public.push_subscriptions
  add column failure_count integer not null default 0,
  add column first_failed_at timestamptz;

create function public.record_push_results(p_delivered uuid[], p_failed uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pruned integer;
begin
  update public.push_subscriptions
    set last_success_at = now(), failure_count = 0, first_failed_at = null
    where id = any (p_delivered);

  update public.push_subscriptions
    set failure_count = failure_count + 1, first_failed_at = coalesce(first_failed_at, now())
    where id = any (p_failed);

  with pruned as (
    delete from public.push_subscriptions
    where failure_count > 0
      and (
        (failure_count >= 5 and first_failed_at < now() - interval '24 hours')
        or (coalesce(last_success_at, created_at) < now() - interval '60 days' and first_failed_at < now() - interval '24 hours')
      )
    returning 1
  )
  select count(*)::integer into v_pruned from pruned;
  return v_pruned;
end;
$$;

revoke execute on function public.record_push_results(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.record_push_results(uuid[], uuid[]) to service_role;

-- ─── Lease: one closing-alerts run at a time ────────────────────────────────
create table public.cron_leases (
  name text primary key check (char_length(name) between 1 and 64),
  lease_until timestamptz not null
);
alter table public.cron_leases enable row level security;
revoke all on public.cron_leases from public, anon, authenticated, service_role;
grant all on public.cron_leases to service_role;

-- True when the caller now holds the lease; false while another run's lease hasn't expired. The
-- expiry covers a run that died without releasing it.
create function public.claim_cron_lease(p_name text, p_seconds integer)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  with claimed as (
    insert into public.cron_leases (name, lease_until)
    values (p_name, now() + make_interval(secs => p_seconds))
    on conflict (name) do update set lease_until = excluded.lease_until
      where public.cron_leases.lease_until < now()
    returning 1
  )
  select exists (select 1 from claimed)
$$;

create function public.release_cron_lease(p_name text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.cron_leases set lease_until = now() where name = p_name
$$;

revoke execute on function public.claim_cron_lease(text, integer) from public, anon, authenticated;
revoke execute on function public.release_cron_lease(text) from public, anon, authenticated;
grant execute on function public.claim_cron_lease(text, integer) to service_role;
grant execute on function public.release_cron_lease(text) to service_role;

-- ─── Give up on a market nobody can be reached about ─────────────────────────
create table public.push_attempts (
  kind text not null,
  ref text not null,
  attempts integer not null default 1,
  first_tried_at timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.push_attempts enable row level security;
revoke all on public.push_attempts from public, anon, authenticated, service_role;
grant all on public.push_attempts to service_role;

-- Records that every push for these markets failed. One whose first failure is over 24 hours old is
-- claimed in push_log, which is what stops due_resolve_reminders and due_market_alerts offering it
-- again. Returns how many were given up.
create function public.record_push_failures(p_kind text, p_refs text[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with tried as (
    insert into public.push_attempts (kind, ref)
    select p_kind, r.ref from unnest(p_refs) as r(ref)
    on conflict (kind, ref) do update set attempts = public.push_attempts.attempts + 1
    returning kind, ref, first_tried_at
  ),
  gave_up as (
    insert into public.push_log (kind, ref)
    select kind, ref from tried where first_tried_at < now() - interval '24 hours'
    on conflict do nothing
    returning 1
  )
  select count(*)::integer from gave_up
$$;

revoke execute on function public.record_push_failures(text, text[]) from public, anon, authenticated;
grant execute on function public.record_push_failures(text, text[]) to service_role;

-- As 0057, but a device that saves its subscription again has proved it is alive, so its failure
-- streak starts over.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_invited() then
    raise exception 'not invited' using errcode = '42501';
  end if;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, user_agent = excluded.user_agent, failure_count = 0, first_failed_at = null
    where push_subscriptions.p256dh = excluded.p256dh and push_subscriptions.auth = excluded.auth;

  if not found then
    raise exception 'this device is subscribed with different keys';
  end if;
end;
$$;

commit;
