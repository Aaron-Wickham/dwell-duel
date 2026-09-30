-- #206, #207, #210: fewer rows and round trips for the Tasks page and Home, and push claims that
-- follow a delivery instead of preceding it.
--
-- Every function here is new. 0057's push_resolve_reminders and 0058's push_market_alerts, which
-- claim inside the read, stay as they are for the deploy in flight; nothing calls them once this
-- ships, and a later migration drops them.
--
-- One explicit transaction, like 0034-0070.
begin;
set local lock_timeout = '5s';

-- ─── Tasks: only this period's rows ──────────────────────────────────────────
-- The Tasks page needs one completion per active task, the newest of the current period, not
-- every completion the member ever made. compute_period_key runs in the group's zone for each
-- task's period (a one-off's is 'once', as submit_task_completion stored it), so the page also
-- no longer asks for the period keys in a round trip of its own. Security invoker: a member reads
-- only their own completions and proof through the tables' own policies.
create function public.my_current_task_completions()
returns table (task_id uuid, status text, reward_amount integer, review_note text, proof_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (tc.task_id)
    tc.task_id, tc.status, tc.reward_amount, tc.review_note,
    (select count(*)::integer from public.proof_attachments pa where pa.task_completion_id = tc.id)
  from public.task_completions tc
  join public.tasks t on t.id = tc.task_id
  where tc.profile_id = (select auth.uid())
    and tc.period_key = public.compute_period_key(t.period)
  order by tc.task_id, tc.submitted_at desc;
$$;

revoke execute on function public.my_current_task_completions() from public, anon;
grant execute on function public.my_current_task_completions() to authenticated, service_role;

-- ─── Push: read what is due, claim what was delivered ────────────────────────
-- push_resolve_reminders and push_market_alerts wrote push_log before the send, so a push that
-- failed (push service down, keys wrong) was never retried. The route now reads the due rows, sends,
-- and claims only the markets at least one device received; a market whose sends all failed is
-- due again next run. The recipient rules are 0057's and 0058's, unchanged.
create function public.due_resolve_reminders()
returns table (market_id uuid, title text, profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.title, m.created_by
  from public.markets m
  join public.profiles p on p.id = m.created_by
  where m.status = 'open'
    and m.close_at <= now()
    and (p.role in ('admin', 'owner') or not public.has_stake_in_market(m.id, m.created_by))
    and not exists (select 1 from public.push_log l where l.kind = 'resolve_reminder' and l.ref = m.id::text)
    and public.push_wants(m.created_by, 'resolve_reminders')
  order by m.id
$$;

create function public.due_market_alerts()
returns table (market_id uuid, title text, profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.title, a.id
  from public.markets m
  join public.profiles a on a.role in ('admin', 'owner') and a.id <> m.created_by
  where m.status = 'open'
    and m.close_at <= now()
    and not exists (select 1 from public.push_log l where l.kind = 'market_alert' and l.ref = m.id::text)
    and public.push_wants(a.id, 'resolve_reminders')
  order by m.id, a.id
$$;

-- How many of the refs were newly claimed; one already claimed by a concurrent run is left alone.
create function public.claim_push_log(p_kind text, p_refs text[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with claimed as (
    insert into public.push_log (kind, ref)
    select p_kind, r.ref from unnest(p_refs) as r(ref)
    on conflict do nothing
    returning ref
  )
  select count(*)::integer from claimed
$$;

revoke execute on function public.due_resolve_reminders() from public, anon, authenticated;
revoke execute on function public.due_market_alerts() from public, anon, authenticated;
revoke execute on function public.claim_push_log(text, text[]) from public, anon, authenticated;
grant execute on function public.due_resolve_reminders() to service_role;
grant execute on function public.due_market_alerts() to service_role;
grant execute on function public.claim_push_log(text, text[]) to service_role;

-- ─── Home: one row for onboarding, one row for a standing ────────────────────
-- Home's onboarding card ran five count queries until the card was dismissed. Security invoker:
-- the same rows the member could count themselves.
create function public.my_onboarding()
returns table (photo boolean, bet boolean, task boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.avatar_path is not null),
    -- A cancelled bet still counts as a first bet (0037 moves it out of bets).
    exists (select 1 from public.bets b where b.profile_id = (select auth.uid()))
      or exists (select 1 from public.cancelled_bets c where c.profile_id = (select auth.uid()))
      or exists (select 1 from public.parlays pa where pa.profile_id = (select auth.uid())),
    exists (select 1 from public.task_completions tc where tc.profile_id = (select auth.uid()))
$$;

revoke execute on function public.my_onboarding() from public, anon;
grant execute on function public.my_onboarding() to authenticated, service_role;

-- One member's row on the net-worth board with the board's size, for Home's hero and a member's
-- page: the same net worth leaderboard_net_worth (0051) ranks, but read as a single row instead of
-- ranking and returning the whole board to pick one. Nobody is returned when the caller can't
-- see profiles (an uninvited session), as the board itself is empty for them.
create function public.member_standing(p_profile_id uuid)
returns table (score bigint, rank bigint, member_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with riding as (
    select s.profile_id, sum(s.amount)::bigint as dc
    from public.stakes_riding s
    group by s.profile_id
  ),
  worth as (
    select p.id, (p.balance + coalesce(r.dc, 0))::bigint as score
    from public.profiles p
    left join riding r on r.profile_id = p.id
  )
  select mine.score,
    1 + (select count(*) from worth w where w.score > mine.score),
    (select count(*) from worth)
  from worth mine
  where mine.id = p_profile_id;
$$;

revoke execute on function public.member_standing(uuid) from public, anon;
grant execute on function public.member_standing(uuid) to authenticated, service_role;

commit;
