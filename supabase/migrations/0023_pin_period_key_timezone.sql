-- compute_period_key previously called to_char(p_at, fmt) directly, which
-- formats using the database session's ambient `TimeZone` setting.
-- PostgREST lets a client set that per-request via a `Prefer: timezone=<zone>`
-- header, so two requests for the *same instant* could get different
-- period_key values depending on the caller's chosen timezone -- defeating
-- the once-per-period unique index this whole feature relies on.
--
-- Converting to UTC wall-clock time before to_char ever sees it removes the
-- session TimeZone from the computation entirely, so the result depends only
-- on the two input parameters again (making `immutable` true rather than
-- just declared).
create or replace function compute_period_key(p_period text, p_at timestamptz default now())
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_period
    when 'daily'   then to_char(p_at at time zone 'utc', 'YYYY-MM-DD')
    when 'weekly'  then to_char(p_at at time zone 'utc', 'IYYY-"W"IW')
    when 'monthly' then to_char(p_at at time zone 'utc', 'YYYY-MM')
    when 'yearly'  then to_char(p_at at time zone 'utc', 'YYYY')
    else 'once'
  end;
$$;

revoke execute on function compute_period_key(text, timestamptz) from public;
revoke execute on function compute_period_key(text, timestamptz) from anon;
grant execute on function compute_period_key(text, timestamptz) to authenticated;
grant execute on function compute_period_key(text, timestamptz) to service_role;
