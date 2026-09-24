create function adjust_balance(p_profile_id uuid, p_amount integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can adjust a balance';
  end if;

  if p_amount = 0 then
    raise exception 'adjustment amount must not be zero';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required for a balance adjustment';
  end if;

  perform public.apply_coin_transaction(
    p_profile_id, p_amount, 'admin_adjustment',
    jsonb_build_object('reason', p_reason, 'adjusted_by', auth.uid())
  );
end;
$$;

revoke execute on function adjust_balance(uuid, integer, text) from public;
revoke execute on function adjust_balance(uuid, integer, text) from anon;
grant execute on function adjust_balance(uuid, integer, text) to authenticated;
grant execute on function adjust_balance(uuid, integer, text) to service_role;
