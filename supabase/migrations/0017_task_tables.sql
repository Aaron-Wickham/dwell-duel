create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  reward_amount integer not null check (reward_amount > 0),
  is_repeatable boolean not null default false,
  period text check (period in ('daily', 'weekly', 'monthly', 'yearly')),
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint period_matches_repeatable check (
    (is_repeatable = false and period is null) or
    (is_repeatable = true and period is not null)
  )
);

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id),
  profile_id uuid not null references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reward_amount integer not null,
  period_key text not null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  review_note text
);

create unique index task_completions_one_active_per_period
  on public.task_completions (task_id, profile_id, period_key)
  where status in ('pending', 'approved');

grant all on public.tasks, public.task_completions to service_role;
