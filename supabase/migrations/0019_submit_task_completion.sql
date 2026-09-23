create function submit_task_completion(p_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task record;
  v_period_key text;
  v_completion_id uuid;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  select reward_amount, period, is_active
    into v_task
  from public.tasks
  where id = p_task_id;

  if not found or not v_task.is_active then
    raise exception 'task not found or inactive';
  end if;

  v_period_key := public.compute_period_key(v_task.period);

  begin
    insert into public.task_completions (task_id, profile_id, status, reward_amount, period_key)
    values (p_task_id, auth.uid(), 'pending', v_task.reward_amount, v_period_key)
    returning id into v_completion_id;
  exception when unique_violation then
    raise exception 'you already have a pending or approved submission for this task in the current period';
  end;

  return v_completion_id;
end;
$$;

revoke execute on function submit_task_completion(uuid) from public;
revoke execute on function submit_task_completion(uuid) from anon;
grant execute on function submit_task_completion(uuid) to authenticated;
grant execute on function submit_task_completion(uuid) to service_role;
