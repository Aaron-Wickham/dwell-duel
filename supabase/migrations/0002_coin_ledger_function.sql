create function apply_coin_transaction(
  p_profile_id uuid,
  p_amount integer,
  p_type text,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.coin_transactions (profile_id, amount, type, meta)
  values (p_profile_id, p_amount, p_type, p_meta);

  update public.profiles
  set balance = balance + p_amount
  where id = p_profile_id;
end;
$$;

-- No grant to `authenticated`. This function *writes* — granting EXECUTE
-- to authenticated would let any signed-in user call
-- apply_coin_transaction(<their own id>, 1000000, ...) directly via
-- supabase.rpc() and mint themselves coins. Its only caller in this plan
-- is the trigger added in migration 0004, which runs as this function's
-- owner and so needs no grant (an owner always has implicit EXECUTE on
-- its own functions). A later sub-project that needs to move coins (a
-- bet, a task reward) must add its own narrow, validating
-- SECURITY DEFINER wrapper and grant EXECUTE on that wrapper instead.
revoke execute on function apply_coin_transaction(uuid, integer, text, jsonb) from public;
revoke execute on function apply_coin_transaction(uuid, integer, text, jsonb) from anon;
revoke execute on function apply_coin_transaction(uuid, integer, text, jsonb) from authenticated;
