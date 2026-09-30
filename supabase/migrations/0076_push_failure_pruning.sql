-- #257: a push endpoint that kept failing for any reason but 404/410 was retried forever and never
-- pruned. Each send now records its outcome per device through record_push_results(): a delivery
-- resets the device's failure streak, a failure extends it, and a device is deleted once it has
-- failed five sends in a row with the first of them over 24 hours ago (so a push-service outage of
-- a few hours never costs anyone their subscription), or has had no delivery for 60 days while
-- failing. A member whose subscription was pruned is put back by the client's re-sync (a
-- subscription saved again starts a clean streak).
-- Additive: two columns and one function; save_push_subscription is replaced in place.
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
        or coalesce(last_success_at, created_at) < now() - interval '60 days'
      )
    returning 1
  )
  select count(*)::integer into v_pruned from pruned;
  return v_pruned;
end;
$$;

revoke execute on function public.record_push_results(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.record_push_results(uuid[], uuid[]) to service_role;

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
