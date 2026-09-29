-- #86: the owner's economy panel on Admin -> Ledger. How much DC exists, and where this month's
-- new DC came from (and where DC left).
--
-- One explicit transaction, like 0034-0051.
begin;
set local lock_timeout = '5s';

-- Every DC that is created or destroyed, as (source, event key, instant, amount) rows. A stake is
-- not creation: placing one moves DC from a balance to "at stake", and a cancel or void moves it
-- back. It stops being at stake when its market or parlay settles, and that moment is where the
-- payout's creation (or the stake's loss) is measured from, so each settlement adds a negative
-- "stake leaves" row beside the ledger's payout rows. Rows that share a source, key and instant
-- are one event, and an event's net is what it added (or removed).
--
-- Every coin_transactions type, from apply_coin_transaction's callers in 0004-0047:
--   starting_grant         -> starting_grants    (0004, a new profile's 100 DC)
--   task_completed         -> task_rewards       (approve_task_completion)
--   admin_adjustment       -> owner_adjustments  (adjust_balance, either sign)
--   bet_won                -> seed_payouts       (resolve_market_core, a winner's payout)
--   bet_refunded           -> seed_payouts       (resolve_market_core, nobody backed the winner;
--                                                 nets to zero against the stakes leaving)
--   resolution_reversed    -> seed_payouts       (an override taking the old payouts back)
--   parlay_won             -> house_parlays      (settle_parlay)
--   parlay_refunded        -> house_parlays      (settle_parlay, every leg voided; nets to zero)
--   parlay_reversed        -> house_parlays      (settle_parlay re-settling after an override)
--   bet_placed             -> excluded: a stake, balance -> at stake
--   bet_cancelled          -> excluded: cancel_bet and remove_bet, at stake -> balance
--   bet_voided_refund      -> excluded: void_market, at stake -> balance
--   parlay_placed          -> excluded: a stake, balance -> at stake
-- economy_summary counts any other type as unclassified, so a new one can't slip past the
-- reconciliation unnoticed.
--
-- Timing. A ledger row counts when it was written. A market's live stakes leave at its first
-- resolution (voids refund them instead, and only an open market can be voided or have a bet
-- cancelled or removed, so its bets never change after that). A parlay's stake leaves when it
-- first stops being pending: its first win or refund credit, or the first resolution that lost
-- one of its legs, whichever came first (settled_at can't say, since an override rewrites it).
-- Each of those instants is the now() of the transaction that also wrote the matching ledger
-- rows, so an event's rows share one instant. One case is read from the parlay's state today, not
-- its history: an override that clears the only losing leg while another leg is still open puts
-- the parlay back to pending, and its stake then counts as at stake again rather than as lost in
-- the month it lost. Totals still reconcile; only that month's figure moves.
--
-- Security invoker, and callable by nobody but its owner: economy_summary runs it as definer.
create function public.economy_flows(p_from timestamptz, p_to timestamptz)
returns table (source text, added bigint, removed bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with parlay_first_credit as (
    select t.meta ->> 'parlay_id' as parlay_id, min(t.created_at) as happened_at
    from public.coin_transactions t
    where t.type in ('parlay_won', 'parlay_refunded')
    group by 1
  ),
  parlay_first_loss as (
    select l.parlay_id, min(r.resolved_at) as happened_at
    from public.parlay_legs l
    join public.market_resolutions r on r.market_id = l.market_id and r.outcome_id <> l.outcome_id
    group by 1
  ),
  flows (source, event_key, happened_at, amount) as (
    select
      case t.type
        when 'starting_grant' then 'starting_grants'
        when 'task_completed' then 'task_rewards'
        when 'admin_adjustment' then 'owner_adjustments'
        when 'bet_won' then 'seed_payouts'
        when 'bet_refunded' then 'seed_payouts'
        when 'resolution_reversed' then 'seed_payouts'
        else 'house_parlays'
      end,
      case
        when t.type in ('bet_won', 'bet_refunded', 'resolution_reversed') then 'market:' || (t.meta ->> 'market_id')
        when t.type like 'parlay_%' then 'parlay:' || (t.meta ->> 'parlay_id')
        else 'txn:' || t.id
      end,
      t.created_at,
      t.amount::bigint
    from public.coin_transactions t
    where t.type in (
      'starting_grant', 'task_completed', 'admin_adjustment',
      'bet_won', 'bet_refunded', 'resolution_reversed',
      'parlay_won', 'parlay_refunded', 'parlay_reversed'
    )

    union all

    select 'seed_payouts', 'market:' || b.market_id, first_resolution.happened_at, -sum(b.amount)::bigint
    from public.bets b
    join public.markets m on m.id = b.market_id and m.status = 'resolved'
    cross join lateral (
      select min(r.resolved_at) as happened_at from public.market_resolutions r where r.market_id = b.market_id
    ) first_resolution
    group by b.market_id, first_resolution.happened_at

    union all

    select 'house_parlays', 'parlay:' || pa.id, least(c.happened_at, x.happened_at), -pa.stake::bigint
    from public.parlays pa
    left join parlay_first_credit c on c.parlay_id = pa.id::text
    left join parlay_first_loss x on x.parlay_id = pa.id
    where pa.status <> 'pending'
  ),
  events as (
    select f.source, sum(f.amount) as net
    from flows f
    where f.happened_at >= p_from and f.happened_at < p_to
    group by f.source, f.event_key, f.happened_at
  )
  select e.source,
         coalesce(sum(greatest(e.net, 0)), 0)::bigint,
         coalesce(sum(greatest(-e.net, 0)), 0)::bigint
  from events e
  group by e.source
$$;

revoke execute on function public.economy_flows(timestamptz, timestamptz) from public, anon, authenticated;

-- The panel's figures, owner only. p_month_start is any instant in the month wanted; the month
-- runs midnight to midnight in America/New_York, the group's own time. `balances` plus the two
-- at-stake figures is the DC in circulation, and it equals all_time_added - all_time_removed
-- whenever every ledger type is classified above, which the page checks. `unclassified` counts
-- ledger rows of a type economy_flows doesn't know.
create function public.economy_summary(p_month_start timestamptz)
returns table (
  month_start timestamptz,
  month_end timestamptz,
  balances bigint,
  bets_at_stake bigint,
  parlays_at_stake bigint,
  starting_grants_added bigint,
  task_rewards_added bigint,
  seed_payouts_added bigint,
  seed_payouts_removed bigint,
  house_parlays_added bigint,
  house_parlays_removed bigint,
  owner_adjustments_added bigint,
  owner_adjustments_removed bigint,
  all_time_added bigint,
  all_time_removed bigint,
  unclassified bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local_month timestamp;
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can see the economy';
  end if;
  if p_month_start is null then
    raise exception 'a month is required';
  end if;

  v_local_month := date_trunc('month', p_month_start at time zone 'America/New_York');
  month_start := v_local_month at time zone 'America/New_York';
  month_end := (v_local_month + interval '1 month') at time zone 'America/New_York';

  select coalesce(sum(p.balance), 0) into balances from public.profiles p;

  select coalesce(sum(b.amount), 0) into bets_at_stake
  from public.bets b
  join public.markets m on m.id = b.market_id
  where m.status = 'open';

  select coalesce(sum(pa.stake), 0) into parlays_at_stake
  from public.parlays pa
  where pa.status = 'pending';

  select
    coalesce(sum(f.added) filter (where f.source = 'starting_grants'), 0),
    coalesce(sum(f.added) filter (where f.source = 'task_rewards'), 0),
    coalesce(sum(f.added) filter (where f.source = 'seed_payouts'), 0),
    coalesce(sum(f.removed) filter (where f.source = 'seed_payouts'), 0),
    coalesce(sum(f.added) filter (where f.source = 'house_parlays'), 0),
    coalesce(sum(f.removed) filter (where f.source = 'house_parlays'), 0),
    coalesce(sum(f.added) filter (where f.source = 'owner_adjustments'), 0),
    coalesce(sum(f.removed) filter (where f.source = 'owner_adjustments'), 0)
  into
    starting_grants_added, task_rewards_added,
    seed_payouts_added, seed_payouts_removed,
    house_parlays_added, house_parlays_removed,
    owner_adjustments_added, owner_adjustments_removed
  from public.economy_flows(month_start, month_end) f;

  select coalesce(sum(f.added), 0), coalesce(sum(f.removed), 0)
    into all_time_added, all_time_removed
  from public.economy_flows('-infinity', 'infinity') f;

  select count(*) into unclassified
  from public.coin_transactions t
  where t.type not in (
    'starting_grant', 'task_completed', 'admin_adjustment',
    'bet_won', 'bet_refunded', 'resolution_reversed',
    'parlay_won', 'parlay_refunded', 'parlay_reversed',
    'bet_placed', 'bet_cancelled', 'bet_voided_refund', 'parlay_placed'
  );

  return next;
end;
$$;

revoke execute on function public.economy_summary(timestamptz) from public, anon;
grant execute on function public.economy_summary(timestamptz) to authenticated;

commit;
