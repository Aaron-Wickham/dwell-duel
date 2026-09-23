create function compute_period_key(p_period text, p_at timestamptz default now())
returns text
language sql
immutable
as $$
  select case p_period
    when 'daily'   then to_char(p_at, 'YYYY-MM-DD')
    when 'weekly'  then to_char(p_at, 'IYYY-"W"IW')
    when 'monthly' then to_char(p_at, 'YYYY-MM')
    when 'yearly'  then to_char(p_at, 'YYYY')
    else 'once'
  end;
$$;

revoke execute on function compute_period_key(text, timestamptz) from public;
revoke execute on function compute_period_key(text, timestamptz) from anon;
grant execute on function compute_period_key(text, timestamptz) to authenticated;
grant execute on function compute_period_key(text, timestamptz) to service_role;
