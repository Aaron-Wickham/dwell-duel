create function reject_task_completion(p_completion_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can reject a task completion';
  end if;

  select status into v_status
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
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), review_note = p_reason
  where id = p_completion_id;
end;
$$;

revoke execute on function reject_task_completion(uuid, text) from public;
revoke execute on function reject_task_completion(uuid, text) from anon;
grant execute on function reject_task_completion(uuid, text) to authenticated;
grant execute on function reject_task_completion(uuid, text) to service_role;
