create table parlays (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id),
  stake integer not null check (stake > 0),
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'refunded')),
  credited integer not null default 0 check (credited >= 0),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create table parlay_legs (
  id uuid primary key default gen_random_uuid(),
  parlay_id uuid not null references parlays (id) on delete cascade,
  market_id uuid not null references markets (id),
  outcome_id uuid not null references market_outcomes (id),
  locked_odds numeric not null check (locked_odds >= 1),
  unique (parlay_id, market_id)
);

create index parlays_profile_id_idx on parlays (profile_id);
create index parlay_legs_market_id_idx on parlay_legs (market_id);

alter table public.parlays enable row level security;
alter table public.parlay_legs enable row level security;

-- Supabase's default privileges pre-grant every new public table to anon
-- and authenticated; revoke first (the migration 0006 lesson).
revoke all on public.parlays, public.parlay_legs from anon, authenticated;

grant select on public.parlays to authenticated;
grant select on public.parlay_legs to authenticated;

create policy select_own_or_admin_parlays on public.parlays for select to authenticated
  using (profile_id = (select auth.uid()) or is_admin());

create policy select_own_or_admin_parlay_legs on public.parlay_legs for select to authenticated
  using (exists (
    select 1 from public.parlays p
    where p.id = parlay_id
      and (p.profile_id = (select auth.uid()) or is_admin())
  ));

grant all on public.parlays, public.parlay_legs to service_role;
