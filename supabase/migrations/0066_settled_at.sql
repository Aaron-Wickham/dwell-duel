-- #221: a market's settled instant. The Resolved list ordered by created_at, so "newest first"
-- was newest-created, not newest-settled, and a market voided before its close time had no
-- instant at all: the chart drew it as still live up to a close it never reached. settled_at is
-- when the market left the open state, set once by the first resolution (an override keeps it;
-- market_resolutions.resolved_at dates each resolution) and by the void.
alter table public.markets add column settled_at timestamptz;

comment on column public.markets.settled_at is
  'When the market stopped being open: its first resolution, or its void. Null while open.';

-- Backfill: a resolved market's first resolution; a voided one has no record of the void, so the
-- later of its close and creation, capped at now so a market voided early never sorts into the
-- future.
update public.markets m
set settled_at = (select min(r.resolved_at) from public.market_resolutions r where r.market_id = m.id)
where m.status = 'resolved';

update public.markets
set settled_at = least(greatest(close_at, created_at), now())
where status = 'voided';

-- The Resolved list's order: (status, settled_at desc, id desc), as 0048's created_at index did.
create index markets_status_settled_idx on public.markets (status, settled_at desc, id desc);

-- #198: an admin could "override" a resolved market to the outcome that had already won. Nothing
-- changed except the ledger: every bet_won was reversed and paid again under a new resolution
-- row, the winners were pushed a "changed by an override" alert, and the leaderboard's Biggest
-- win and the weekly recap moved to the re-payment's date. The resolved branch now refuses the
-- current outcome, and the market update stamps settled_at on the first resolution. Otherwise
-- the function is 0046's, unchanged.
create or replace function public.resolve_market_core(p_market_id uuid, p_outcome_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_status text;
  v_close_at timestamptz;
  v_current_resolution_id uuid;
  v_seed integer;
  v_outcome_count integer;
  v_outcome_market_id uuid;
  v_total_pool bigint;
  v_winning_pool bigint;
  v_new_resolution_id uuid;
  v_is_admin boolean;
  v_txn record;
  v_bet record;
  v_parlay_id uuid;
  v_short jsonb;
begin
  select created_by, status, close_at, current_resolution_id, seed_per_outcome
    into v_created_by, v_status, v_close_at, v_current_resolution_id, v_seed
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status = 'voided' then
    raise exception 'market was voided';
  end if;

  select public.is_admin() into v_is_admin;

  if v_status = 'resolved' then
    if not v_is_admin then
      raise exception 'only an admin can change an already-resolved market';
    end if;
    if exists (
      select 1 from public.market_resolutions
      where id = v_current_resolution_id and outcome_id = p_outcome_id
    ) then
      raise exception 'that outcome is already the result';
    end if;
  elsif not v_is_admin then
    if not (auth.uid() = v_created_by or public.has_role('reviewer')) then
      raise exception 'only the market creator, a reviewer or an admin can resolve this market';
    end if;
    if now() < v_close_at then
      raise exception 'market has not closed yet';
    end if;
    -- #58: a stake in the result rules you out, unless you're an admin.
    if public.has_stake_in_market(p_market_id, auth.uid()) then
      raise exception 'you have a stake in this market, so someone else resolves it';
    end if;
  end if;

  select market_id into v_outcome_market_id
  from public.market_outcomes
  where id = p_outcome_id;

  if v_outcome_market_id is null or v_outcome_market_id <> p_market_id then
    raise exception 'outcome does not belong to this market';
  end if;

  perform 1 from public.profiles where id in (
    select profile_id from public.coin_transactions where meta ->> 'resolution_id' = v_current_resolution_id::text
    union select profile_id from public.bets where market_id = p_market_id
    union select pa.profile_id from public.parlays pa join public.parlay_legs l on l.parlay_id = pa.id where l.market_id = p_market_id
  ) order by id for no key update;

  if v_status = 'resolved' then
    select jsonb_agg(
             jsonb_build_object('display_name', m.display_name, 'owed', m.owed, 'balance', m.balance)
             order by m.display_name, m.id
           ) filter (where m.balance < m.owed)
      into v_short
    from (
      select p.id, p.display_name, p.balance, o.owed
      from public.profiles p
      join (
        select c.profile_id, sum(c.amount) as owed
        from (
          select t.profile_id, t.amount
          from public.coin_transactions t
          where t.meta ->> 'resolution_id' = v_current_resolution_id::text
          union all
          select pa.profile_id, pa.credited
          from public.parlays pa
          where pa.status = 'won'
            and exists (
              select 1 from public.parlay_legs l
              where l.parlay_id = pa.id
                and l.market_id = p_market_id
                and l.outcome_id <> p_outcome_id
            )
        ) c
        group by c.profile_id
      ) o on o.profile_id = p.id
      order by p.id
      for no key update of p
    ) m;

    if v_short is not null then
      raise exception '%', 'clawback_short:' || v_short::text;
    end if;
  end if;

  if v_current_resolution_id is not null then
    for v_txn in
      select profile_id, amount, id
      from public.coin_transactions
      where meta ->> 'resolution_id' = v_current_resolution_id::text
      order by profile_id, id
    loop
      perform public.apply_coin_transaction(
        v_txn.profile_id, -v_txn.amount, 'resolution_reversed',
        jsonb_build_object(
          'market_id', p_market_id,
          'reversed_resolution_id', v_current_resolution_id,
          'original_transaction_id', v_txn.id
        )
      );
    end loop;

    update public.market_resolutions
    set reversed_at = now(), reversed_by = auth.uid()
    where id = v_current_resolution_id;
  end if;

  insert into public.market_resolutions (market_id, outcome_id, resolved_by)
  values (p_market_id, p_outcome_id, auth.uid())
  returning id into v_new_resolution_id;

  update public.markets
  set status = 'resolved', current_resolution_id = v_new_resolution_id, settled_at = coalesce(settled_at, now())
  where id = p_market_id;

  select coalesce(sum(pool_total), 0), count(*) into v_total_pool, v_outcome_count
  from public.market_outcomes where market_id = p_market_id;

  select pool_total into v_winning_pool
  from public.market_outcomes where id = p_outcome_id;

  if v_winning_pool = 0 then
    for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id order by profile_id, id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id, v_bet.amount, 'bet_refunded',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  else
    for v_bet in select profile_id, amount, id from public.bets where outcome_id = p_outcome_id order by profile_id, id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id,
        floor(v_bet.amount::numeric * (v_total_pool + v_seed * v_outcome_count) / (v_winning_pool + v_seed))::integer,
        'bet_won',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id, 'seed_per_outcome', v_seed)
      );
    end loop;
  end if;

  for v_parlay_id in
    select distinct parlay_id from public.parlay_legs
    where market_id = p_market_id
    order by parlay_id
  loop
    perform public.settle_parlay(v_parlay_id);
  end loop;
end;
$$;

-- void_market (0046, live definition) stamps settled_at with the void. Otherwise unchanged.
create or replace function public.void_market(p_market_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_status text;
  v_bet record;
  v_parlay_id uuid;
begin
  select created_by, status into v_created_by, v_status
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status <> 'open' then
    raise exception 'only an unresolved, unvoided market can be voided';
  end if;

  if not (auth.uid() = v_created_by or public.is_admin()) then
    raise exception 'only the market creator or an admin can void this market';
  end if;

  -- Every profile this call could touch, locked once up front in id order,
  -- before any write: this market's bettors and the owners of parlays with a
  -- leg here. A voided market only ever had status 'open' (checked above),
  -- so it never has a current resolution to reverse -- see the note above
  -- resolve_market and void_market for why this, not the per-loop ordering
  -- below, is what rules out a cross-phase deadlock. NO KEY UPDATE, not
  -- UPDATE -- see that same note: FOR UPDATE here would block other
  -- transactions' foreign-key checks (FOR KEY SHARE) on these profiles.
  perform 1 from public.profiles where id in (
    select profile_id from public.bets where market_id = p_market_id
    union select pa.profile_id from public.parlays pa join public.parlay_legs l on l.parlay_id = pa.id where l.market_id = p_market_id
  ) order by id for no key update;

  update public.markets set status = 'voided', settled_at = now() where id = p_market_id;

  for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id order by profile_id, id loop
    perform public.apply_coin_transaction(
      v_bet.profile_id, v_bet.amount, 'bet_voided_refund',
      jsonb_build_object('market_id', p_market_id, 'bet_id', v_bet.id)
    );
  end loop;

  for v_parlay_id in
    select distinct parlay_id from public.parlay_legs
    where market_id = p_market_id
    order by parlay_id
  loop
    perform public.settle_parlay(v_parlay_id);
  end loop;
end;
$$;
