create function approve_task_completion(p_completion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_profile_id uuid;
  v_reward_amount integer;
  v_task_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an admin can approve a task completion';
  end if;

  select status, profile_id, reward_amount, task_id
    into v_status, v_profile_id, v_reward_amount, v_task_id
  from public.task_completions
  where id = p_completion_id
  for update;

  if not found then
    raise exception 'completion not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'completion is not pending';
  end if;

  update public.task_completions
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_completion_id;

  perform public.apply_coin_transaction(
    v_profile_id, v_reward_amount, 'task_completed',
    jsonb_build_object('task_id', v_task_id, 'completion_id', p_completion_id)
  );
end;
$$;

revoke execute on function approve_task_completion(uuid) from public;
revoke execute on function approve_task_completion(uuid) from anon;
grant execute on function approve_task_completion(uuid) to authenticated;
grant execute on function approve_task_completion(uuid) to service_role;
