-- Web push notifications (#80).
--
-- A member turns notifications on per device in Settings. Each device's push
-- subscription is a push_subscriptions row, and notification_prefs holds the
-- member's four on/off choices, which apply to every device. The server sends
-- with the service role; the push_* functions below pick the recipients for
-- each kind, so the rules live here and not in the app, and no member can call
-- them. push_log records what must go out only once (a creator's reminder to
-- resolve a closed market).
--
-- One explicit transaction, like 0034-0056.
begin;
set local lock_timeout = '5s';

-- ─── Subscriptions ──────────────────────────────────────────────────────────

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  -- The server POSTs to the endpoint, so it must be a real https URL of sane length.
  constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://'),
  constraint push_subscriptions_endpoint_length check (char_length(endpoint) <= 1024),
  constraint push_subscriptions_p256dh_length check (char_length(p256dh) between 1 and 128),
  constraint push_subscriptions_auth_length check (char_length(auth) between 1 and 64),
  constraint push_subscriptions_user_agent_length check (char_length(user_agent) <= 512)
);

create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

create policy select_own_push_subscriptions on public.push_subscriptions for select to authenticated
  using (profile_id = (select auth.uid()));

create policy insert_own_push_subscriptions on public.push_subscriptions for insert to authenticated
  with check (profile_id = (select auth.uid()) and (select is_invited()));

create policy delete_own_push_subscriptions on public.push_subscriptions for delete to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.push_subscriptions from public, anon, authenticated, service_role;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (profile_id, endpoint, p256dh, auth, user_agent) on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- Saves this device's subscription for the caller. A browser keeps one subscription per site, so on
-- a shared device the row may already belong to whoever signed in there before; RLS hides that
-- row, so a plain insert would fail. Only a caller holding the same keys, which never leave the
-- device, takes it over.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
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
    set profile_id = excluded.profile_id, user_agent = excluded.user_agent
    where push_subscriptions.p256dh = excluded.p256dh and push_subscriptions.auth = excluded.auth;

  if not found then
    raise exception 'this device is subscribed with different keys';
  end if;
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ─── Preferences ────────────────────────────────────────────────────────────

-- No row means every default. push_wants() repeats these defaults for a member without one.
create table public.notification_prefs (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  resolve_reminders boolean not null default true,
  results boolean not null default true,
  task_reviews boolean not null default true,
  new_markets boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy select_own_notification_prefs on public.notification_prefs for select to authenticated
  using (profile_id = (select auth.uid()));

create policy insert_own_notification_prefs on public.notification_prefs for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy update_own_notification_prefs on public.notification_prefs for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

revoke all on public.notification_prefs from public, anon, authenticated, service_role;
grant select on public.notification_prefs to authenticated;
grant insert (profile_id, resolve_reminders, results, task_reviews, new_markets, updated_at) on public.notification_prefs to authenticated;
-- An upsert also sets profile_id; the update policy's check keeps it the caller's own.
grant update (profile_id, resolve_reminders, results, task_reviews, new_markets, updated_at) on public.notification_prefs to authenticated;
grant all on public.notification_prefs to service_role;

-- ─── Sent once ──────────────────────────────────────────────────────────────

create table public.push_log (
  kind text not null check (kind in ('resolve_reminder')),
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref)
);

alter table public.push_log enable row level security;
revoke all on public.push_log from public, anon, authenticated, service_role;
grant all on public.push_log to service_role;

-- ─── Recipients ─────────────────────────────────────────────────────────────

-- Whether a member should get a notification of this kind: still on the invite list, has at least
-- one device subscribed, and hasn't turned the kind off.
create function public.push_wants(p_profile_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.push_subscriptions s where s.profile_id = p_profile_id)
     and exists (
       select 1 from public.profiles p join public.allowed_emails a on a.email = lower(p.email)
       where p.id = p_profile_id
     )
     and coalesce(
       (select case p_kind
                 when 'resolve_reminders' then n.resolve_reminders
                 when 'results' then n.results
                 when 'task_reviews' then n.task_reviews
                 when 'new_markets' then n.new_markets
               end
        from public.notification_prefs n where n.profile_id = p_profile_id),
       p_kind <> 'new_markets'
     )
$$;

-- Closed, unresolved markets whose creator may resolve them (an admin creator always may; anyone
-- else only without a stake, as resolve_market_core rules) and wants the reminder. Each market is
-- claimed in push_log as it's returned, so a market is reminded about at most once. A creator who
-- has notifications off isn't claimed, so turning them on later still brings the reminder.
create function public.push_resolve_reminders()
returns table (market_id uuid, title text, profile_id uuid)
language sql
volatile
security definer
set search_path = ''
as $$
  with due as (
    select m.id, m.title, m.created_by
    from public.markets m
    join public.profiles p on p.id = m.created_by
    where m.status = 'open'
      and m.close_at <= now()
      and (p.role in ('admin', 'owner') or not public.has_stake_in_market(m.id, m.created_by))
      and not exists (select 1 from public.push_log l where l.kind = 'resolve_reminder' and l.ref = m.id::text)
      and public.push_wants(m.created_by, 'resolve_reminders')
  ),
  claimed as (
    insert into public.push_log (kind, ref)
    select 'resolve_reminder', d.id::text from due d
    on conflict do nothing
    returning ref
  )
  select d.id, d.title, d.created_by
  from due d
  join claimed c on c.ref = d.id::text
  order by d.id
$$;

-- Everyone with a solo bet or a parlay leg on a resolved or voided market, with what they need for
-- their own wording: their solo payout and refund from the current resolution, and whether they
-- hold a solo bet at all. Cancelled bets live in cancelled_bets, so they never count.
create function public.push_market_result(p_market_id uuid)
returns table (
  profile_id uuid,
  title text,
  status text,
  outcome_label text,
  is_override boolean,
  won bigint,
  refunded bigint,
  has_solo boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select mk.title, mk.status, mk.current_resolution_id, o.label,
           exists (
             select 1 from public.market_resolutions pr
             where pr.market_id = mk.id and pr.id <> mk.current_resolution_id
           ) as is_override
    from public.markets mk
    left join public.market_resolutions r on r.id = mk.current_resolution_id
    left join public.market_outcomes o on o.id = r.outcome_id
    where mk.id = p_market_id and mk.status in ('resolved', 'voided')
  ),
  holders as (
    select b.profile_id, true as solo from public.bets b where b.market_id = p_market_id
    union all
    select pa.profile_id, false
    from public.parlay_legs l join public.parlays pa on pa.id = l.parlay_id
    where l.market_id = p_market_id
  ),
  people as (
    select h.profile_id, bool_or(h.solo) as has_solo from holders h group by h.profile_id
  )
  select pe.profile_id, m.title, m.status, m.label, m.is_override,
         coalesce(sum(t.amount) filter (where t.type = 'bet_won'), 0)::bigint,
         coalesce(sum(t.amount) filter (where t.type = 'bet_refunded'), 0)::bigint,
         pe.has_solo
  from people pe
  cross join m
  left join public.coin_transactions t
    on t.profile_id = pe.profile_id
   and m.current_resolution_id is not null
   and t.meta ->> 'resolution_id' = m.current_resolution_id::text
  where public.push_wants(pe.profile_id, 'results')
  group by pe.profile_id, m.title, m.status, m.label, m.is_override, pe.has_solo
  order by pe.profile_id
$$;

-- The submitters of reviewed completions among these ids, with the task and the reviewer's reason.
create function public.push_task_reviews(p_completion_ids uuid[])
returns table (completion_id uuid, profile_id uuid, task_title text, status text, reward_amount integer, review_note text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.profile_id, t.title, c.status, c.reward_amount, c.review_note
  from public.task_completions c
  join public.tasks t on t.id = c.task_id
  where c.id = any (p_completion_ids)
    and c.status in ('approved', 'rejected')
    and public.push_wants(c.profile_id, 'task_reviews')
  order by c.id
$$;

-- Every member who asked to hear about new markets, except the one who made it.
create function public.push_new_market(p_market_id uuid)
returns table (profile_id uuid, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, m.title
  from public.markets m
  join public.profiles p on p.id <> m.created_by
  where m.id = p_market_id
    and public.push_wants(p.id, 'new_markets')
  order by p.id
$$;

revoke execute on function public.push_wants(uuid, text) from public, anon, authenticated;
revoke execute on function public.push_resolve_reminders() from public, anon, authenticated;
revoke execute on function public.push_market_result(uuid) from public, anon, authenticated;
revoke execute on function public.push_task_reviews(uuid[]) from public, anon, authenticated;
revoke execute on function public.push_new_market(uuid) from public, anon, authenticated;
grant execute on function public.push_wants(uuid, text) to service_role;
grant execute on function public.push_resolve_reminders() to service_role;
grant execute on function public.push_market_result(uuid) to service_role;
grant execute on function public.push_task_reviews(uuid[]) to service_role;
grant execute on function public.push_new_market(uuid) to service_role;

commit;
