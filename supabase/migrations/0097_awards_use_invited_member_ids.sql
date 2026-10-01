-- leaderboard_awards reads who is in DwellDuel from invited_member_ids() (0093) instead of its own
-- copy of the rule (0074), so the awards, the boards, the ranks and the recap can't drift apart.
-- The rule is the same (an invite by email, or one they claimed), and leaderboard_awards already
-- refuses a caller who isn't invited, so every award is unchanged.
--
-- Additive: the function keeps its signature and its answers.
begin;
set local lock_timeout = '5s';

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
  -- Members still in DwellDuel: a removed member (remove_member deletes their invite) wins no award.
  with members as (
    select i.id from public.invited_member_ids() i
  )
  (
    select 'biggest_win'::text, p.id, p.display_name, p.avatar_path, (t.amount - b.amount)::numeric, m.title
    from public.coin_transactions t
    join public.bets b on b.id = (t.meta ->> 'bet_id')::bigint
    join public.markets m on m.id = b.market_id and m.current_resolution_id = (t.meta ->> 'resolution_id')::uuid
    join public.profiles p on p.id = t.profile_id
    join members cm on cm.id = p.id
    where t.type = 'bet_won' and t.created_at >= v_from and t.created_at < v_to and t.amount > b.amount
    order by (t.amount - b.amount) desc, t.id
    limit 1
  )
  union all
  (
    select 'best_parlay'::text, p.id, p.display_name, p.avatar_path, least(x.product, x.max_multiplier)::numeric, x.id::text
    from (
      select pa.id, pa.profile_id, pa.credited, pa.max_multiplier, trunc(round(exp(sum(ln(l.locked_odds))), 10), 4) as product
      from public.parlays pa
      join public.parlay_legs l on l.parlay_id = pa.id
      join public.markets m on m.id = l.market_id and m.status = 'resolved'
      where pa.status = 'won'
        and pa.id in (
          select (t.meta ->> 'parlay_id')::uuid
          from public.coin_transactions t
          where t.type = 'parlay_won' and t.created_at >= v_from and t.created_at < v_to
        )
      group by pa.id, pa.profile_id, pa.credited, pa.max_multiplier
    ) x
    join public.profiles p on p.id = x.profile_id
    join members cm on cm.id = p.id
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
    join members cm on cm.id = p.id
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
    join members cm on cm.id = p.id
    order by y.n desc, p.display_name, p.id
    limit 1
  );
end;
$$;

commit;
