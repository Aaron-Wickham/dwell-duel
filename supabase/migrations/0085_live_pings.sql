-- #250: group-wide live updates become one coalesced, throttled Broadcast ping per topic, in place
-- of per-row Postgres Changes on whole tables. A ping carries no data (the page re-reads through RLS
-- when it refreshes), so it only has to say "something in this topic changed".
--
-- Coalesced: a transaction pings each topic at most once, however many rows it writes (a
-- resolution with 150 winners writes 150 activity_events rows, in a loop, one statement each).
-- Throttled: a topic pings at most once per live_ping_interval_ms(), judged when the transaction
-- commits (through a deferred trigger on live_ping_queue). A change is only held back when a
-- committed ping went out less than one interval before its own commit, and the client refreshes at
-- least an interval plus a second after the last ping it received, so that refresh reads it.
--
-- Additive: the tables stay in the supabase_realtime publication, so the app still serving while
-- this applies keeps its Postgres Changes channels.

begin;

-- Mirrored by LIVE_PING_INTERVAL_MS in components/live/live-refresh.tsx; a DB test keeps them equal.
create function public.live_ping_interval_ms()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 5000
$$;

-- One row per topic, seeded below; the list is mirrored by LIVE_TOPICS, and a DB test keeps them
-- equal. Nobody but the ping function reads or writes it.
create table public.live_pings (
  topic text primary key,
  sent_at timestamptz not null default '-infinity'
);
alter table public.live_pings enable row level security;
revoke all on public.live_pings from public, anon, authenticated;

insert into public.live_pings (topic) values
  ('markets'),    -- markets rows: created, edited, closed, resolved, voided, deleted
  ('pools'),      -- market_outcomes: every bet and cancellation moves a pool
  ('activity'),   -- activity_events: the feed
  ('reactions'),  -- feed_reactions
  ('tasks'),      -- tasks
  ('reviews');    -- task_completions, for reviewers and above

create function public.send_live_ping(p_topic text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guard text := 'dwellduel.live_ping_' || p_topic;
  v_sent_at timestamptz;
begin
  -- Once per topic per transaction; the queue already sends each topic once, and this also covers
  -- a direct call.
  if current_setting(v_guard, true) = '1' then
    return;
  end if;
  perform set_config(v_guard, '1', true);

  -- Read without a lock first, so a throttled write never touches the row. This sees only
  -- committed pings.
  select sent_at into v_sent_at from public.live_pings where topic = p_topic;
  if not found or v_sent_at > clock_timestamp() - make_interval(secs => public.live_ping_interval_ms() / 1000.0) then
    return;
  end if;

  -- skip locked, so a committing writer never waits here, and two transactions that ping two
  -- topics in opposite orders can't deadlock. A locked row means another transaction is sending
  -- this topic's ping right now, but it could still roll back, so this one sends its own as well
  -- rather than count on it. Only a committed ping ever holds a change back.
  select sent_at into v_sent_at from public.live_pings where topic = p_topic for update skip locked;
  if found then
    if v_sent_at > clock_timestamp() - make_interval(secs => public.live_ping_interval_ms() / 1000.0) then
      return;
    end if;
    update public.live_pings set sent_at = clock_timestamp() where topic = p_topic;
  end if;

  -- Delivered when this transaction commits, and never after a rollback. realtime.send traps its
  -- own errors, so a Realtime problem never fails the bet or resolution that pinged.
  perform realtime.send('{}'::jsonb, 'changed', 'live:' || p_topic, true);
end;
$$;

revoke execute on function public.send_live_ping(text) from public, anon, authenticated;

-- A live table's own trigger runs immediately and only queues its topic, once per transaction;
-- the deferred part lives on this queue instead. A deferred trigger on the live tables themselves
-- would leave pending trigger events on them, and Postgres refuses to ALTER a table with pending
-- events, so any migration or test that writes one of them and then alters it in one transaction
-- would fail (55006). Unlogged and always empty between transactions: each row is deleted by its
-- own commit-time trigger.
create unlogged table public.live_ping_queue (
  id bigint generated always as identity primary key,
  topic text not null
);
alter table public.live_ping_queue enable row level security;
revoke all on public.live_ping_queue from public, anon, authenticated;

create function public.live_ping_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guard text := 'dwellduel.live_ping_queued_' || tg_argv[0];
begin
  if current_setting(v_guard, true) = '1' then
    return null;
  end if;
  perform set_config(v_guard, '1', true);
  insert into public.live_ping_queue (topic) values (tg_argv[0]);
  return null;
end;
$$;

revoke execute on function public.live_ping_trigger() from public, anon, authenticated;

-- Deferred to commit, so the throttle is judged when the change becomes visible rather than when a
-- long transaction wrote its first row.
create function public.live_ping_at_commit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.live_ping_queue where id = new.id;
  perform public.send_live_ping(new.topic);
  return null;
end;
$$;

revoke execute on function public.live_ping_at_commit() from public, anon, authenticated;

create constraint trigger live_ping_at_commit after insert on public.live_ping_queue
  deferrable initially deferred for each row execute function public.live_ping_at_commit();

-- Row-level, which also skips an UPDATE that matched nothing; the per-transaction guard makes every
-- row after the first nearly free.
create trigger live_ping_markets after insert or update or delete on public.markets
  for each row execute function public.live_ping_trigger('markets');
create trigger live_ping_pools after insert or update or delete on public.market_outcomes
  for each row execute function public.live_ping_trigger('pools');
create trigger live_ping_activity after insert or update or delete on public.activity_events
  for each row execute function public.live_ping_trigger('activity');
create trigger live_ping_reactions after insert or update or delete on public.feed_reactions
  for each row execute function public.live_ping_trigger('reactions');
create trigger live_ping_tasks after insert or update or delete on public.tasks
  for each row execute function public.live_ping_trigger('tasks');
create trigger live_ping_reviews after insert or update or delete on public.task_completions
  for each row execute function public.live_ping_trigger('reviews');

-- Private channels: only invited members may join a live topic, and only reviewers and above the
-- review queue's. No insert policy, so no client can broadcast into these topics.
create policy live_topics_receive on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      (
        (select realtime.topic()) in ('live:markets', 'live:pools', 'live:activity', 'live:reactions', 'live:tasks')
        and (select public.is_invited())
      )
      or ((select realtime.topic()) = 'live:reviews' and (select public.has_role('reviewer')))
    )
  );

commit;
