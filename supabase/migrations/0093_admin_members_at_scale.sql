-- #254, #265: Admin › Members at a thousand members, and removed members out of the rankings.
--
-- 1. invited_member_ids(): who is in DwellDuel now. A member is removed once their invite is gone
--    (remove_member, 0068), matched as remove_member deletes it: by email or by claim.
-- 2. The boards, "Rank X of N", the month's champion and the weekly recap's best call and top
--    tasker count invited members only. A removed member keeps their coins, bets and history, and
--    their profile still shows their net worth.
-- 3. admin_members() lists members for Admin › Members, searchable by name or email, with whether
--    each has been removed; admin_member_counts() counts both tabs. reinvite_member() restores a
--    removed member's invite (owner only, like remove_member).
-- 4. Indexes for Admin › Invites' pages (newest first) and the claim lookups above.
--
-- Every function keeps its shape, so the previous build reads them unchanged while this deploys.
--
-- One explicit transaction, like 0034-0092.
begin;
set local lock_timeout = '5s';

-- ─── 1. Who is in ────────────────────────────────────────────────────────────

create index allowed_emails_claimed_by_idx on public.allowed_emails (claimed_by);
create index allowed_emails_created_idx on public.allowed_emails (created_at desc, email desc);

-- Security definer, because members can't read allowed_emails; it returns only ids, which the
-- boards already show an invited member. A signed-in caller without an invite gets nobody, as
-- they get no profiles; the service role and the database's own sessions (the season cron, tests)
-- carry no member JWT and see everyone invited.
create function public.invited_member_ids()
returns table (id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where (exists (select 1 from public.allowed_emails a where a.email = lower(p.email))
      or exists (select 1 from public.allowed_emails a where a.claimed_by = p.id))
    and ((select auth.role()) is distinct from 'authenticated' or (select public.is_invited()));
$$;

revoke execute on function public.invited_member_ids() from public, anon;
grant execute on function public.invited_member_ids() to authenticated, service_role;

-- ─── 2. Ranks and counts ─────────────────────────────────────────────────────

-- 0051's definition, over invited members only.
create or replace function public.leaderboard_net_worth()
returns table (id uuid, display_name text, avatar_path text, balance integer, at_stake bigint, score bigint, rank bigint)
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
    select p.id, p.display_name, p.avatar_path, p.balance,
      coalesce(r.dc, 0)::bigint as at_stake,
      (p.balance + coalesce(r.dc, 0))::bigint as score
    from public.profiles p
    left join riding r on r.profile_id = p.id
    where p.id in (select i.id from public.invited_member_ids() i)
  )
  select w.id, w.display_name, w.avatar_path, w.balance, w.at_stake, w.score,
    rank() over (order by w.score desc)
  from worth w;
$$;

-- 0071's definition: the rank and the count are over invited members only. A removed member still
-- gets their row, for their profile's net worth, with no rank.
create or replace function public.member_standing(p_profile_id uuid)
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
  invited as (
    select i.id from public.invited_member_ids() i
  ),
  worth as (
    select p.id, (p.balance + coalesce(r.dc, 0))::bigint as score, p.id in (select id from invited) as ranked
    from public.profiles p
    left join riding r on r.profile_id = p.id
  )
  select mine.score,
    case when mine.ranked then 1 + (select count(*) from worth w where w.ranked and w.score > mine.score) end,
    (select count(*) from worth w where w.ranked)
  from worth mine
  where mine.id = p_profile_id;
$$;

-- 0055's definition, over invited members only. The This month board, the race and the month's
-- champion (settle_season) all read it, so a removed member drops out of all three.
create or replace function public.season_profits(p_month date)
returns table (profile_id uuid, profit bigint, last_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.profile_id, sum(t.amount)::bigint, max(t.created_at)
  from public.coin_transactions t
  where t.created_at >= (date_trunc('month', p_month)::timestamp at time zone 'America/New_York')
    and t.created_at < ((date_trunc('month', p_month) + interval '1 month')::timestamp at time zone 'America/New_York')
    and t.type = any(public.betting_ledger_types())
    and t.profile_id in (select i.id from public.invited_member_ids() i)
  group by t.profile_id;
$$;

-- 0056's definition: the week's best call and top tasker are picked from invited members only, so
-- Home's recap never names someone who has been removed. The rest is unchanged.
create or replace function public.weekly_recap(p_week date)
returns table (
  week_start timestamptz,
  week_end timestamptz,
  my_betting_net bigint,
  my_betting_moves integer,
  my_task_income bigint,
  best_bettor_id uuid,
  best_bettor_name text,
  best_market_id uuid,
  best_market_title text,
  best_stake integer,
  best_payout integer,
  upset_market_id uuid,
  upset_market_title text,
  upset_outcome_label text,
  upset_chance double precision,
  top_tasker_id uuid,
  top_tasker_name text,
  top_tasker_count integer,
  closing_total integer,
  closing jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with week as (
    select
      (date_trunc('week', p_week::timestamp) at time zone 'America/New_York') as starts,
      ((date_trunc('week', p_week::timestamp) + interval '7 days') at time zone 'America/New_York') as ends,
      ((date_trunc('week', p_week::timestamp) + interval '14 days') at time zone 'America/New_York') as next_ends
  ),
  mine as (
    select
      coalesce(sum(t.amount) filter (where t.betting), 0)::bigint as betting_net,
      (count(*) filter (where t.betting))::integer as betting_moves,
      coalesce(sum(t.amount) filter (where t.type = 'task_completed'), 0)::bigint as task_income
    from (
      select c.amount, c.type, c.type = any(public.betting_ledger_types()) as betting
      from public.coin_transactions c
      cross join week w
      where c.profile_id = (select auth.uid())
        and c.created_at >= w.starts
        and c.created_at < w.ends
    ) t
  ),
  best as (
    select e.actor_id, e.market_id, b.amount as stake, e.amount as payout
    from public.activity_events e
    cross join week w
    join public.bets b on b.id = e.bet_id
    where e.hidden_at is null
      and e.kind = 'bet_won'
      and e.occurred_at >= w.starts
      and e.occurred_at < w.ends
      and e.amount > b.amount
      and e.actor_id in (select i.id from public.invited_member_ids() i)
    order by e.amount - b.amount desc, e.occurred_at, e.id
    limit 1
  ),
  upset as (
    select e.market_id, e.outcome_id, c.chance
    from public.activity_events e
    cross join week w
    join public.markets m on m.id = e.market_id
    cross join lateral (
      select
        sum(o.pool_total) as real_total,
        (max(o.pool_total) filter (where o.id = e.outcome_id) + m.seed_per_outcome)::double precision
          / (sum(o.pool_total) + m.seed_per_outcome * count(*))::double precision as chance
      from public.market_outcomes o
      where o.market_id = e.market_id
    ) c
    where e.hidden_at is null
      and e.kind = 'market_resolved'
      and e.occurred_at >= w.starts
      and e.occurred_at < w.ends
      and c.real_total > 0
      and c.chance < 0.5
    order by c.chance, e.occurred_at desc, e.id
    limit 1
  ),
  tasker as (
    select c.profile_id, count(*)::integer as n
    from public.task_completions c
    cross join week w
    where c.status = 'approved'
      and c.reviewed_at >= w.starts
      and c.reviewed_at < w.ends
      and c.profile_id in (select i.id from public.invited_member_ids() i)
    group by c.profile_id
    order by count(*) desc, max(c.reviewed_at), c.profile_id
    limit 1
  ),
  closing as (
    select m.id, m.title, m.close_at, count(*) over () as total
    from public.markets m
    cross join week w
    where m.status = 'open'
      and m.close_at >= greatest(now(), w.ends)
      and m.close_at < w.next_ends
    order by m.close_at, m.id
    limit 3
  )
  select
    w.starts,
    w.ends,
    mi.betting_net,
    mi.betting_moves,
    mi.task_income,
    b.actor_id,
    bp.display_name,
    b.market_id,
    bm.title,
    b.stake,
    b.payout,
    u.market_id,
    um.title,
    uo.label,
    u.chance,
    t.profile_id,
    tp.display_name,
    t.n,
    coalesce((select max(c.total) from closing c), 0)::integer,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'close_at', c.close_at) order by c.close_at, c.id) from closing c),
      '[]'::jsonb
    )
  from week w
  cross join mine mi
  left join best b on true
  left join public.profiles bp on bp.id = b.actor_id
  left join public.markets bm on bm.id = b.market_id
  left join upset u on true
  left join public.markets um on um.id = u.market_id
  left join public.market_outcomes uo on uo.id = u.outcome_id
  left join tasker t on true
  left join public.profiles tp on tp.id = t.profile_id
  where (select public.is_invited());
$$;

-- ─── 3. Admin › Members ──────────────────────────────────────────────────────

-- Every member with what Admin › Members shows, or the one asked for by p_id. The page filters,
-- orders and pages the result through PostgREST (display_name, id). p_query matches a name or an
-- email anywhere, taken literally: % and _ are escaped. Emails and sign-ins are admin-only
-- (member_emails, 0046; member_activity, 0050), and so is this.
create function public.admin_members(p_query text default null, p_id uuid default null)
returns table (
  id uuid,
  display_name text,
  avatar_path text,
  balance integer,
  role text,
  email text,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  removed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_pattern text := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if not public.has_role('admin') then
    raise exception 'only an admin can list members';
  end if;

  return query
    select p.id, p.display_name, p.avatar_path, p.balance, p.role, p.email, p.created_at, u.last_sign_in_at,
      p.id not in (select i.id from public.invited_member_ids() i)
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (p_id is null or p.id = p_id)
      and (v_query = '' or p.display_name ilike v_pattern or p.email ilike v_pattern);
end;
$$;

revoke execute on function public.admin_members(text, uuid) from public, anon;
grant execute on function public.admin_members(text, uuid) to authenticated, service_role;

-- The Active and Removed tabs' counts for the same search. Invoker: admin_members checks the role.
create function public.admin_member_counts(p_query text default null)
returns table (active bigint, removed bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*) filter (where not m.removed), count(*) filter (where m.removed)
  from public.admin_members(p_query) m;
$$;

revoke execute on function public.admin_member_counts(text) from public, anon;
grant execute on function public.admin_member_counts(text) to authenticated, service_role;

-- Undoes remove_member's invite: the owner's alone, as removing is. The invite is written as
-- claimed by the member, so it lists under Claimed and only remove_member takes it away again.
-- Their role isn't restored; the owner grants it afresh.
create function public.reinvite_member(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can invite a member back';
  end if;

  select lower(email) into v_email from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'member not found';
  end if;
  if btrim(coalesce(v_email, '')) = '' then
    raise exception 'this member has no email to invite';
  end if;

  insert into public.allowed_emails (email, invited_by, claimed_by)
  values (v_email, auth.uid(), p_profile_id)
  on conflict (email) do update set claimed_by = excluded.claimed_by;
end;
$$;

revoke execute on function public.reinvite_member(uuid) from public, anon;
grant execute on function public.reinvite_member(uuid) to authenticated, service_role;

commit;
