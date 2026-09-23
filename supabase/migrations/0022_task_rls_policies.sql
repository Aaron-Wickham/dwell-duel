alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;

revoke all on public.tasks from anon, authenticated;
revoke all on public.task_completions from anon, authenticated;

grant select on public.tasks to authenticated;
grant insert (title, description, reward_amount, is_repeatable, period) on public.tasks to authenticated;
grant update (title, description, reward_amount, is_active) on public.tasks to authenticated;
grant select on public.task_completions to authenticated;

create policy select_tasks on public.tasks for select to authenticated
  using (is_invited());
create policy admin_insert_tasks on public.tasks for insert to authenticated
  with check (is_admin());
create policy admin_update_tasks on public.tasks for update to authenticated
  using (is_admin()) with check (is_admin());

create policy select_own_or_admin_task_completions on public.task_completions for select to authenticated
  using (profile_id = (select auth.uid()) or is_admin());
