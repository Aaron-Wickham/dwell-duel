create table profiles (
  id uuid primary key references auth.users (id),
  email text not null,
  display_name text not null,
  avatar_url text,
  is_admin boolean not null default false,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

create table allowed_emails (
  email text primary key,
  invited_by uuid references profiles (id) on delete set null,
  claimed_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table coin_transactions (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  amount integer not null check (amount <> 0),
  type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
