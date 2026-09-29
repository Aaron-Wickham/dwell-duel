-- #146: Best parlay's figure was credited / stake, which the whole-DC floor on the payout can pull a
-- few hundredths below the multiplier the parlay page and the profile Stats card show. It is now
-- that same multiplier: the product of the resolved legs' locked odds (a voided leg drops out, as
-- settle_parlay drops it), truncated to four places and capped at parlay_limits(), as member_stats
-- (0055) computes best_parlay_multiplier. The UI truncates it to two places with formatOdds.
--
-- One explicit transaction, like 0034-0059.
begin;
set local lock_timeout = '5s';

-- This month's awards, one row each, only when someone earned it:
--   biggest_win  the largest payout less its stake on one solo bet paid this month (value: DC gained; detail: the market)
--   best_parlay  the highest multiplier among parlays paid this month, as member_stats works it out
--   sharpshooter the best solo hit rate over bets on markets resolved this month, at least 5 decided
--   most_active  the most solo bets and parlays placed this month (value: how many)
-- A tie goes to whoever has more of what's being counted, then the name, then the id, so a repeat
-- can't pick differently.
create or replace function public.leaderboard_awards()
returns table (kind text, profile_id uuid, display_name text, avatar_path text, value numeric, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := (date_trunc('month', (now() at time zone 'America/New_York')))::timestamp at time zone 'America/New_York';
  v_to timestamptz := (date_trunc('month', (now() at time zone 'America/New_York')) + interval '1 month')::timestamp at time zone 'America/New_York';
begin
  if not public.is_invited() then
    raise exception 'not invited' using errcode = '42501';
  end if;

  return query
  (
    select 'biggest_win'::text, p.id, p.display_name, p.avatar_path, (t.amount - b.amount)::numeric, m.title
    from public.coin_transactions t
    join public.bets b on b.id = (t.meta ->> 'bet_id')::bigint
    join public.markets m on m.id = b.market_id and m.current_resolution_id = (t.meta ->> 'resolution_id')::uuid
    join public.profiles p on p.id = t.profile_id
    where t.type = 'bet_won' and t.created_at >= v_from and t.created_at < v_to and t.amount > b.amount
    order by (t.amount - b.amount) desc, t.id
    limit 1
  )
  union all
  (
    select 'best_parlay'::text, p.id, p.display_name, p.avatar_path, least(x.product, lim.max_multiplier)::numeric, x.id::text
    from (
      select pa.id, pa.profile_id, pa.credited, trunc(round(exp(sum(ln(l.locked_odds))), 10), 4) as product
      from public.parlays pa
      join public.parlay_legs l on l.parlay_id = pa.id
      join public.markets m on m.id = l.market_id and m.status = 'resolved'
      where pa.status = 'won'
        and pa.id in (
          select (t.meta ->> 'parlay_id')::uuid
          from public.coin_transactions t
          where t.type = 'parlay_won' and t.created_at >= v_from and t.created_at < v_to
        )
      group by pa.id, pa.profile_id, pa.credited
    ) x
    cross join public.parlay_limits() lim
    join public.profiles p on p.id = x.profile_id
    order by 5 desc, x.credited desc, x.id
    limit 1
  )
  union all
  (
    select 'sharpshooter'::text, p.id, p.display_name, p.avatar_path,
           round(x.won::numeric / (x.won + x.lost), 4), x.won || ' of ' || (x.won + x.lost)
    from (
      select b.profile_id,
             count(*) filter (where b.outcome_id = r.outcome_id) as won,
             count(*) filter (where b.outcome_id <> r.outcome_id and w.pool_total > 0) as lost
      from public.bets b
      join public.markets m on m.id = b.market_id and m.status = 'resolved'
      join public.market_resolutions r on r.id = m.current_resolution_id and r.resolved_at >= v_from and r.resolved_at < v_to
      join public.market_outcomes w on w.id = r.outcome_id
      group by b.profile_id
    ) x
    join public.profiles p on p.id = x.profile_id
    where x.won + x.lost >= 5
    order by round(x.won::numeric / (x.won + x.lost), 4) desc, x.won + x.lost desc, p.display_name, p.id
    limit 1
  )
  union all
  (
    select 'most_active'::text, p.id, p.display_name, p.avatar_path, y.n::numeric, y.n || ' bets and parlays'
    from (
      select z.profile_id, count(*) as n
      from (
        select b.profile_id from public.bets b where b.created_at >= v_from and b.created_at < v_to
        union all
        select pa.profile_id from public.parlays pa where pa.created_at >= v_from and pa.created_at < v_to
      ) z
      group by z.profile_id
    ) y
    join public.profiles p on p.id = y.profile_id
    order by y.n desc, p.display_name, p.id
    limit 1
  );
end;
$$;

commit;
