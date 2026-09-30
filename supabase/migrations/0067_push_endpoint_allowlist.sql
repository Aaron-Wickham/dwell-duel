-- #201: the push-service allowlist moves into the database. lib/push/subscription.ts only checked
-- an endpoint's host inside savePushSubscriptionAction, while the table itself accepted any https
-- URL, through the direct INSERT grant or save_push_subscription. The server then POSTs to every
-- stored endpoint with the service role and records the answer, so a member could have made it
-- call anywhere and read back whether the call landed.
--
-- Now the table refuses an endpoint whose host isn't a push service (the same list as PUSH_HOSTS;
-- a DB test keeps the two equal), and save_push_subscription is the only way a member writes one:
-- the direct INSERT grant goes.
--
-- One explicit transaction, like 0034-0064.
begin;
set local lock_timeout = '5s';

-- The push services of the browsers that support web push: Chrome and other Chromium browsers
-- (FCM), Firefox, Safari and Edge. Named once here and mirrored by lib/push/subscription.ts.
create function public.push_hosts()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com']
$$;

-- The host of an https URL as the app's URL parser would read it: lowercased, after any userinfo
-- and before any port, path, query or fragment. A backslash ends the authority too, as it does
-- for a browser. Null for anything that isn't an https URL.
create function public.push_endpoint_host(p_endpoint text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substring(lower(p_endpoint) from '^https://(?:[^/?#\\]*@)?([^/?#:@\\]+)')
$$;

-- Whether an endpoint belongs to a push service: its host is one of push_hosts() or a subdomain of one.
create function public.is_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from unnest(public.push_hosts()) as h
    where public.push_endpoint_host(p_endpoint) = h
       or public.push_endpoint_host(p_endpoint) like ('%.' || h)
  )
$$;

revoke execute on function public.push_hosts() from public, anon;
revoke execute on function public.push_endpoint_host(text) from public, anon;
revoke execute on function public.is_push_endpoint(text) from public, anon;
grant execute on function public.push_hosts() to authenticated, service_role;
grant execute on function public.push_endpoint_host(text) to authenticated, service_role;
grant execute on function public.is_push_endpoint(text) to authenticated, service_role;

-- Every row so far passed the app's check, so nothing here fails validation.
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_push_service check (public.is_push_endpoint(endpoint));

-- save_push_subscription (0057) is the only writer now; it inserts as its owner, so the constraint
-- above still applies to what it saves.
drop policy insert_own_push_subscriptions on public.push_subscriptions;
revoke insert on public.push_subscriptions from authenticated;

commit;
