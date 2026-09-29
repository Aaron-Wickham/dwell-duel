-- #123: tell the people who can act when there is work waiting for them: a task submission for
-- reviewers and above, a closed market for admins and above. Both go through the push pipeline
-- from 0057, so the audience rules live here, and both feed the Admin button's badge count.
--
-- One explicit transaction, like 0034-0057.
begin;
set local lock_timeout = '5s';

-- Whether a reviewer wants to hear about each submission waiting on them. Only reviewers and above
-- are ever offered it, and push_task_alerts checks the role, so a member's value is inert.
alter table public.notification_prefs add column review_alerts boolean not null default true;

grant insert (review_alerts) on public.notification_prefs to authenticated;
grant update (review_alerts) on public.notification_prefs to authenticated;

alter table public.push_log drop constraint push_log_kind_check;
alter table public.push_log add constraint push_log_kind_check
  check (kind in ('resolve_reminder', 'market_alert'));

create or replace function public.push_wants(p_profile_id uuid, p_kind text)
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
                 when 'review_alerts' then n.review_alerts
               end
        from public.notification_prefs n where n.profile_id = p_profile_id),
       p_kind <> 'new_markets'
     )
$$;

-- The reviewers and above who should hear about one new submission: not the submitter, who may
-- not review their own (0046), and only those who kept review alerts on.
create function public.push_task_alerts(p_completion_id uuid)
returns table (profile_id uuid, task_title text, submitter_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, t.title, s.display_name
  from public.task_completions c
  join public.tasks t on t.id = c.task_id
  join public.profiles s on s.id = c.profile_id
  join public.profiles r on r.role in ('reviewer', 'admin', 'owner') and r.id <> c.profile_id
  where c.id = p_completion_id
    and c.status = 'pending'
    and public.push_wants(r.id, 'review_alerts')
  order by r.id
$$;

-- Admins and above hear once about each market that has closed without a result, whoever made
-- it: an admin may resolve any market, stake or not (can_resolve_market). The creator gets their
-- own reminder from push_resolve_reminders, so they're left out here rather than told twice. A
-- market is claimed in push_log only when someone was there to tell, so an admin who turns
-- alerts on later still hears about markets still open at that point.
create function public.push_market_alerts()
returns table (market_id uuid, title text, profile_id uuid)
language sql
volatile
security definer
set search_path = ''
as $$
  with due as (
    select m.id, m.title, m.created_by
    from public.markets m
    where m.status = 'open'
      and m.close_at <= now()
      and not exists (select 1 from public.push_log l where l.kind = 'market_alert' and l.ref = m.id::text)
  ),
  recipients as (
    select d.id, d.title, a.id as profile_id
    from due d
    join public.profiles a on a.role in ('admin', 'owner') and a.id <> d.created_by
    where public.push_wants(a.id, 'resolve_reminders')
  ),
  claimed as (
    insert into public.push_log (kind, ref)
    select distinct 'market_alert', r.id::text from recipients r
    on conflict do nothing
    returning ref
  )
  select r.id, r.title, r.profile_id
  from recipients r
  join claimed c on c.ref = r.id::text
  order by r.id, r.profile_id
$$;

-- What is waiting on the caller, for the Admin button's badge: submissions from other members for
-- a reviewer or above, closed markets without a result for an admin or above. Security invoker,
-- so the tables' own RLS decides what the caller can see; the role checks decide what counts.
create function public.my_review_counts()
returns table (tasks bigint, markets bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case when public.has_role('reviewer') then
      (select count(*) from public.task_completions c where c.status = 'pending' and c.profile_id <> auth.uid())
    else 0 end,
    case when public.has_role('admin') then
      (select count(*) from public.markets m where m.status = 'open' and m.close_at <= now())
    else 0 end
$$;

revoke execute on function public.push_task_alerts(uuid) from public, anon, authenticated;
revoke execute on function public.push_market_alerts() from public, anon, authenticated;
revoke execute on function public.my_review_counts() from public, anon;
grant execute on function public.push_task_alerts(uuid) to service_role;
grant execute on function public.push_market_alerts() to service_role;
grant execute on function public.my_review_counts() to authenticated, service_role;

commit;
