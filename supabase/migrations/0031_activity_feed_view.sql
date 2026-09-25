create view public.activity_feed
with (security_invoker = true)
as
select
  'bet:' || b.id as id,
  'bet_placed' as kind,
  b.created_at as occurred_at,
  b.profile_id as actor_id,
  p.display_name as actor_name,
  m.id as market_id,
  m.title as market_title,
  o.label as outcome_label,
  b.amount as amount,
  null::integer as leg_count,
  null::text as task_title
from public.bets b
join public.market_outcomes o on o.id = b.outcome_id
join public.markets m on m.id = b.market_id
join public.profiles p on p.id = b.profile_id

union all

select
  'parlay:' || pa.id, 'parlay_placed', pa.created_at, pa.profile_id, p.display_name,
  null, null, null, pa.stake,
  (select count(*)::integer from public.parlay_legs l where l.parlay_id = pa.id),
  null
from public.parlays pa
join public.profiles p on p.id = pa.profile_id

union all

select
  'market:' || m.id, 'market_created', m.created_at, m.created_by, p.display_name,
  m.id, m.title, null, null, null, null
from public.markets m
join public.profiles p on p.id = m.created_by

union all

select
  'resolution:' || r.id, 'market_resolved', r.resolved_at, r.resolved_by, p.display_name,
  m.id, m.title, o.label, null, null, null
from public.markets m
join public.market_resolutions r on r.id = m.current_resolution_id
join public.market_outcomes o on o.id = r.outcome_id
join public.profiles p on p.id = r.resolved_by

union all

-- Same payout arithmetic as resolve_market; a DB test pins it to the ledger credit.
select
  'win:' || b.id || ':' || r.id, 'bet_won', r.resolved_at, b.profile_id, p.display_name,
  m.id, m.title, o.label,
  floor(b.amount::numeric * pools.total / o.pool_total)::integer,
  null, null
from public.markets m
join public.market_resolutions r on r.id = m.current_resolution_id
join public.market_outcomes o on o.id = r.outcome_id
join public.bets b on b.outcome_id = o.id
join public.profiles p on p.id = b.profile_id
cross join lateral (
  select sum(o2.pool_total) as total from public.market_outcomes o2 where o2.market_id = m.id
) pools

union all

select
  'parlay_win:' || pa.id, 'parlay_won', pa.settled_at, pa.profile_id, p.display_name,
  null, null, null, pa.credited,
  (select count(*)::integer from public.parlay_legs l where l.parlay_id = pa.id),
  null
from public.parlays pa
join public.profiles p on p.id = pa.profile_id
where pa.status = 'won'

union all

select
  'task:' || c.id, 'task_completed', c.reviewed_at, c.profile_id, p.display_name,
  null, null, null, c.reward_amount, null, t.title
from public.task_completions c
join public.tasks t on t.id = c.task_id
join public.profiles p on p.id = c.profile_id
where c.status = 'approved';

revoke all on public.activity_feed from anon, authenticated;
grant select on public.activity_feed to authenticated;
grant select on public.activity_feed to service_role;
