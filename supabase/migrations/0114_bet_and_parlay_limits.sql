-- #450: bets and parlays had no limit but the balance, so a rich account (or a stolen session)
-- could write thousands of 1 DC rows. Each member may now place 200 solo bets and 100 parlays a
-- day, counted by the same BEFORE INSERT triggers as markets and comments (0090). A slip replayed
-- with its attempt key (0047) inserts nothing, so it isn't counted twice. Admins have no limit.
-- bet_cancel's message goes, since nothing cancels bets now (0107).

create or replace function public.write_limits()
returns table (action text, max_writes integer, window_seconds integer)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('market', 20, 86400),
    ('category', 20, 86400),
    ('comment', 10, 60),
    ('comment', 200, 86400),
    ('reaction', 60, 60),
    ('reaction', 1000, 86400),
    ('task_submission', 30, 86400),
    ('bet', 200, 86400),
    ('parlay', 100, 86400)
  ) as l (action, max_writes, window_seconds)
$$;

create or replace function public.enforce_write_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := tg_argv[0];
  v_owner uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
  v_limit record;
  v_writes integer;
begin
  if auth.uid() is null or v_owner is distinct from auth.uid() or public.has_role('admin') then
    return new;
  end if;

  -- A comment replayed with its attempt key (0083) is about to hit the key's unique index and post
  -- nothing, so it doesn't count: a member at the limit whose response was lost still sees it posted.
  if v_action = 'comment' and (to_jsonb(new) ->> 'attempt_key') is not null and exists (
    select 1 from public.market_comments c where c.attempt_key = (to_jsonb(new) ->> 'attempt_key')::uuid
  ) then
    return new;
  end if;

  for v_limit in select l.max_writes, l.window_seconds from public.write_limits() l where l.action = v_action loop
    insert into public.write_rate_counters as c (profile_id, action, window_seconds, window_start, writes)
    values (v_owner, v_action, v_limit.window_seconds, now(), 1)
    on conflict (profile_id, action, window_seconds) do update
      set window_start = case when c.window_start <= now() - make_interval(secs => v_limit.window_seconds) then now() else c.window_start end,
          writes = case when c.window_start <= now() - make_interval(secs => v_limit.window_seconds) then 1 else c.writes + 1 end
    returning c.writes into v_writes;

    if v_writes > v_limit.max_writes then
      raise exception '%', case v_action
        when 'market' then 'you have created too many markets recently; try again later'
        when 'category' then 'you have created too many categories recently; try again later'
        when 'comment' then 'you have posted too many comments recently; try again later'
        when 'reaction' then 'you have added too many reactions recently; try again later'
        when 'task_submission' then 'you have submitted too many tasks recently; try again later'
        when 'bet' then 'you have placed too many bets recently; try again later'
        when 'parlay' then 'you have placed too many parlays recently; try again later'
        else 'too many writes; try again later'
      end
      using errcode = 'DD429';
    end if;
  end loop;

  return new;
end;
$$;


create trigger bets_write_limit before insert on public.bets
  for each row execute function public.enforce_write_limit('bet', 'profile_id');
create trigger parlays_write_limit before insert on public.parlays
  for each row execute function public.enforce_write_limit('parlay', 'profile_id');
