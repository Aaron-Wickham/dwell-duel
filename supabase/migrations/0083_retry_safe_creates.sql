-- #258: Next's useOffline replays a Server Action whose fetch rejected, even when the server had
-- already committed it. Creating a market, posting a comment and creating a task made a second row
-- each time. The forms now send an attempt key per attempt.
--
-- Additive: the old create_market signature stays, as a thin wrapper, so the app still serving
-- while this applies keeps working.

-- create_market_v2 is create_market (0043) plus the key. A repeat of the key returns the market the
-- first call made. The key row is written in the same transaction as the market, so a call that
-- fails rolls its key back and a retry tries again.
create function public.create_market_v2(
  p_title text,
  p_description text,
  p_kind text,
  p_outcome_labels text[],
  p_close_at timestamptz,
  p_line numeric default null,
  p_idempotency_key uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market_id uuid;
  v_label text;
  v_labels text[] := p_outcome_labels;
  v_previous jsonb;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_idempotency_key is not null then
    v_previous := public.claim_idempotency_key(p_idempotency_key, 'create_market');
    if v_previous is not null then
      return (v_previous #>> '{}')::uuid;
    end if;
  end if;

  if p_kind not in ('binary', 'multiple_choice', 'over_under') then
    raise exception 'invalid market kind';
  end if;

  if p_kind = 'over_under' then
    if p_line is null or p_line < 0.5 or p_line % 1 <> 0.5 then
      raise exception 'the line must end in .5, like 3.5';
    end if;
    v_labels := array['Over ' || trim_scale(p_line)::text, 'Under ' || trim_scale(p_line)::text];
  elsif p_line is not null then
    raise exception 'only an over/under market has a line';
  end if;

  if array_length(v_labels, 1) is null or array_length(v_labels, 1) < 2 then
    raise exception 'a market needs at least 2 outcomes';
  end if;

  if p_kind = 'binary' and array_length(v_labels, 1) <> 2 then
    raise exception 'a binary market must have exactly 2 outcomes';
  end if;

  if array_length(v_labels, 1) > 6 then
    raise exception 'a market may have at most 6 outcomes';
  end if;

  if p_close_at <= now() then
    raise exception 'close time must be in the future';
  end if;

  insert into public.markets (created_by, title, description, kind, close_at, line)
  values (auth.uid(), p_title, p_description, p_kind, p_close_at, case when p_kind = 'over_under' then p_line end)
  returning id into v_market_id;

  foreach v_label in array v_labels loop
    insert into public.market_outcomes (market_id, label) values (v_market_id, v_label);
  end loop;

  if p_idempotency_key is not null then
    perform public.finish_idempotent(p_idempotency_key, to_jsonb(v_market_id));
  end if;

  return v_market_id;
end;
$$;

revoke execute on function public.create_market_v2(text, text, text, text[], timestamptz, numeric, uuid) from public, anon;
grant execute on function public.create_market_v2(text, text, text, text[], timestamptz, numeric, uuid) to authenticated, service_role;

create or replace function public.create_market(
  p_title text,
  p_description text,
  p_kind text,
  p_outcome_labels text[],
  p_close_at timestamptz,
  p_line numeric default null
) returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_market_v2(p_title, p_description, p_kind, p_outcome_labels, p_close_at, p_line, null);
$$;

-- Comments and tasks are plain inserts with nothing to return, so the key is a column: a repeat of
-- an attempt hits the unique index, and the action treats that as the success it already was.
alter table public.market_comments add column attempt_key uuid;
create unique index market_comments_attempt_key_idx on public.market_comments (attempt_key) where attempt_key is not null;
grant insert (attempt_key) on public.market_comments to authenticated;

alter table public.tasks add column attempt_key uuid;
create unique index tasks_attempt_key_idx on public.tasks (attempt_key) where attempt_key is not null;
grant insert (attempt_key) on public.tasks to authenticated;
