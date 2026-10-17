-- #453: the Supabase advisor's four foreign keys with no covering index. Each table is small, so a
-- plain index inside the migration's transaction is fine.
create index if not exists allowed_emails_invited_by_idx on public.allowed_emails (invited_by);
create index if not exists market_resolutions_reversed_by_idx on public.market_resolutions (reversed_by);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists task_completions_reviewed_by_idx on public.task_completions (reviewed_by);
