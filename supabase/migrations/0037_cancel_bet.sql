-- A member can cancel their own bet, for a full refund, while its market is
-- still open and before close_at. Parlays can't be cancelled: their odds are
-- locked at placement.
--
-- A cancelled bet moves out of bets into cancelled_bets rather than gaining a
-- status column. Everything that reads bets -- resolve_market, void_market,
-- the odds, market_sparklines, the market's bet list -- then only ever sees
-- live stakes, with no filter to forget. activity_events.bet_id cascades, so
-- the bet's feed event goes with it, which is exactly what activity_feed
-- shows once the bet row is gone.
--
-- One explicit transaction, like 0034-0036, because the migration runner
-- autocommits each statement. create table's foreign keys take share row
-- exclusive locks on markets, market_outcomes and profiles; lock_timeout
-- bounds each wait, and an abort applies nothing, so the Deploy Production
-- Database workflow can simply be re-run.
begin;
set local lock_timeout = '5s';

-- id is the bet's own id, so a ledger row or a cursor that named the bet
-- still names it here.
create table public.cancelled_bets (
  id bigint primary key,
  market_id uuid not null references public.markets (id) on delete cascade,
  outcome_id uuid not null references public.market_outcomes (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  amount integer not null check (amount > 0),
  placed_at timestamptz not null,
  cancelled_at timestamptz not null default now()
);

-- A member's own bets page, newest first.
create index cancelled_bets_profile_cancelled_idx on public.cancelled_bets (profile_id, cancelled_at desc, id desc);
create index cancelled_bets_market_id_idx on public.cancelled_bets (market_id);
create index cancelled_bets_outcome_id_idx on public.cancelled_bets (outcome_id);

alter table public.cancelled_bets enable row level security;

-- The same audience as bets, which every invited member can already read.
-- It also lets a market page's live channel receive the insert: Postgres
-- Changes delivers only rows the subscriber's RLS allows, and it can't
-- deliver the bets delete to a market_id-filtered channel at all.
create policy select_invited_cancelled_bets on public.cancelled_bets for select to authenticated
  using ((select is_invited()) or (select is_admin()));

revoke all on public.cancelled_bets from public, anon, authenticated, service_role;
grant select on public.cancelled_bets to authenticated;
grant all on public.cancelled_bets to service_role;

-- Locks in place_bet's order: the market row first, so a cancel queues
-- behind a resolve or void of the same market (both lock it first too) and
-- sees its final status; then the ledger and profile, then bets and the pool.
create function public.cancel_bet(p_bet_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market_id uuid;
  v_status text;
  v_close_at timestamptz;
  v_bet public.bets%rowtype;
begin
  select market_id into v_market_id
  from public.bets
  where id = p_bet_id and profile_id = auth.uid();

  if not found then
    raise exception 'bet not found';
  end if;

  select status, close_at into v_status, v_close_at
  from public.markets
  where id = v_market_id
  for update;

  if v_status <> 'open' or now() >= v_close_at then
    raise exception 'this market has closed, so the bet can no longer be cancelled';
  end if;

  -- Re-read under the market lock: a second cancel of the same bet that
  -- waited on the lock finds nothing here and fails cleanly.
  select * into v_bet
  from public.bets
  where id = p_bet_id and profile_id = auth.uid()
  for update;

  if not found then
    raise exception 'bet not found';
  end if;

  perform public.apply_coin_transaction(
    v_bet.profile_id, v_bet.amount, 'bet_cancelled',
    jsonb_build_object('market_id', v_bet.market_id, 'outcome_id', v_bet.outcome_id, 'bet_id', v_bet.id)
  );

  insert into public.cancelled_bets (id, market_id, outcome_id, profile_id, amount, placed_at)
  values (v_bet.id, v_bet.market_id, v_bet.outcome_id, v_bet.profile_id, v_bet.amount, v_bet.created_at);

  delete from public.bets where id = v_bet.id;

  update public.market_outcomes
  set pool_total = pool_total - v_bet.amount
  where id = v_bet.outcome_id;
end;
$$;

revoke execute on function public.cancel_bet(bigint) from public, anon;
grant execute on function public.cancel_bet(bigint) to authenticated, service_role;

-- For live updates (components/live/live-refresh.tsx), guarded as in 0032.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cancelled_bets'
  ) then
    alter publication supabase_realtime add table public.cancelled_bets;
  end if;
end
$$;

commit;
