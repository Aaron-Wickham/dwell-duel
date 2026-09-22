create function create_market(
  p_title text,
  p_description text,
  p_kind text,
  p_outcome_labels text[],
  p_close_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market_id uuid;
  v_label text;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_kind not in ('binary', 'multiple_choice') then
    raise exception 'invalid market kind';
  end if;

  if array_length(p_outcome_labels, 1) is null or array_length(p_outcome_labels, 1) < 2 then
    raise exception 'a market needs at least 2 outcomes';
  end if;

  if p_kind = 'binary' and array_length(p_outcome_labels, 1) <> 2 then
    raise exception 'a binary market must have exactly 2 outcomes';
  end if;

  if array_length(p_outcome_labels, 1) > 6 then
    raise exception 'a market may have at most 6 outcomes';
  end if;

  if p_close_at <= now() then
    raise exception 'close time must be in the future';
  end if;

  insert into public.markets (created_by, title, description, kind, close_at)
  values (auth.uid(), p_title, p_description, p_kind, p_close_at)
  returning id into v_market_id;

  foreach v_label in array p_outcome_labels loop
    insert into public.market_outcomes (market_id, label) values (v_market_id, v_label);
  end loop;

  return v_market_id;
end;
$$;

revoke execute on function create_market(text, text, text, text[], timestamptz) from public;
revoke execute on function create_market(text, text, text, text[], timestamptz) from anon;
grant execute on function create_market(text, text, text, text[], timestamptz) to authenticated;
grant execute on function create_market(text, text, text, text[], timestamptz) to service_role;
