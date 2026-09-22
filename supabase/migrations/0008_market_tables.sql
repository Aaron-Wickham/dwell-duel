create table markets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles (id) on delete cascade,
  title text not null,
  description text,
  kind text not null check (kind in ('binary', 'multiple_choice')),
  status text not null default 'open' check (status in ('open', 'resolved', 'voided')),
  current_resolution_id uuid,
  close_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table market_outcomes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets (id) on delete cascade,
  label text not null,
  pool_total integer not null default 0 check (pool_total >= 0),
  created_at timestamptz not null default now(),
  unique (market_id, label)
);

create table bets (
  id bigint generated always as identity primary key,
  market_id uuid not null references markets (id) on delete cascade,
  outcome_id uuid not null references market_outcomes (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table market_resolutions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets (id) on delete cascade,
  outcome_id uuid not null references market_outcomes (id) on delete cascade,
  resolved_by uuid not null references profiles (id) on delete cascade,
  resolved_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references profiles (id) on delete cascade
);

-- markets.current_resolution_id and market_resolutions.market_id
-- reference each other, so this FK is added after both tables exist.
alter table markets add constraint markets_current_resolution_id_fkey
  foreign key (current_resolution_id) references market_resolutions (id);

grant all on public.markets, public.market_outcomes, public.bets, public.market_resolutions to service_role;
