-- Reactions on feed items and comments on markets (#79).
--
-- Reactions: any invited member can add or take back each of four reactions
-- (fire, pray, laugh, clap) on any activity_events row, at most one of each
-- kind per member per event. Members write their own rows directly, under
-- RLS; the page reads a page of events' counts through
-- feed_reaction_counts, one row per event and kind, so it never reads one
-- row per reaction.
--
-- Comments: a short thread on each market. A member posts their own; the
-- author, or an admin or the owner for moderation, deletes one through
-- delete_market_comment. That's a soft delete: the row stays, emptied, with
-- deleted_at set. The market page's live channel is filtered to its market,
-- and a filtered Postgres Changes channel never receives a DELETE, so a hard
-- delete would never reach anyone else watching; an UPDATE does. Members
-- have no direct UPDATE or DELETE, so a deleted comment's text is gone for
-- good and nothing can bring it back.
--
-- One explicit transaction, like 0034-0052.
begin;
set local lock_timeout = '5s';

-- ─── Reactions ──────────────────────────────────────────────────────────────

create table public.feed_reactions (
  event_id text not null references public.activity_events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('fire', 'pray', 'laugh', 'clap')),
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id, kind)
);

-- The primary key serves lookups by event; this one serves the profile
-- cascade and "my reactions".
create index feed_reactions_profile_idx on public.feed_reactions (profile_id);

alter table public.feed_reactions enable row level security;

create policy select_feed_reactions on public.feed_reactions for select to authenticated
  using ((select is_invited()));

create policy insert_own_feed_reactions on public.feed_reactions for insert to authenticated
  with check (profile_id = (select auth.uid()) and (select is_invited()));

create policy delete_own_feed_reactions on public.feed_reactions for delete to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.feed_reactions from public, anon, authenticated, service_role;
grant select, delete on public.feed_reactions to authenticated;
-- created_at is left to its default, so nobody backdates a reaction.
grant insert (event_id, profile_id, kind) on public.feed_reactions to authenticated;
grant all on public.feed_reactions to service_role;

-- Security invoker, so RLS on feed_reactions still decides what counts.
create function public.feed_reaction_counts(p_event_ids text[])
returns table (event_id text, kind text, reactions integer, mine boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.event_id, r.kind, count(*)::integer, bool_or(r.profile_id = (select auth.uid()))
  from public.feed_reactions r
  where r.event_id = any (p_event_ids)
  group by r.event_id, r.kind
$$;

revoke execute on function public.feed_reaction_counts(text[]) from public, anon;
grant execute on function public.feed_reaction_counts(text[]) to authenticated, service_role;

-- ─── Comments ───────────────────────────────────────────────────────────────

create table public.market_comments (
  id bigint generated always as identity primary key,
  market_id uuid not null references public.markets (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  constraint market_comments_body_length check (char_length(body) <= 280),
  constraint market_comments_body_present check (deleted_at is not null or btrim(body) <> ''),
  constraint market_comments_deleted_emptied check (deleted_at is null or body = '')
);

-- A market's thread, newest first, keyset-paged on (created_at, id).
create index market_comments_market_idx on public.market_comments (market_id, created_at desc, id desc) where deleted_at is null;
create index market_comments_profile_idx on public.market_comments (profile_id);
create index market_comments_deleted_by_idx on public.market_comments (deleted_by);

alter table public.market_comments enable row level security;

-- Deleted rows stay readable (emptied), so their UPDATE reaches every
-- viewer's filtered live channel; the page leaves them out.
create policy select_market_comments on public.market_comments for select to authenticated
  using ((select is_invited()));

create policy insert_own_market_comments on public.market_comments for insert to authenticated
  with check (profile_id = (select auth.uid()) and (select is_invited()));

revoke all on public.market_comments from public, anon, authenticated, service_role;
grant select on public.market_comments to authenticated;
-- Only these columns, so nobody posts a comment already deleted or backdated.
grant insert (market_id, profile_id, body) on public.market_comments to authenticated;
grant all on public.market_comments to service_role;

create function public.delete_market_comment(p_comment_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_deleted_at timestamptz;
begin
  select profile_id, deleted_at into v_author, v_deleted_at
  from public.market_comments
  where id = p_comment_id
  for update;

  if not found then
    raise exception 'comment not found';
  end if;
  if not (v_author = auth.uid() or public.has_role('admin')) then
    raise exception 'only the comment''s author or an admin can delete it';
  end if;
  if v_deleted_at is not null then
    return;
  end if;

  update public.market_comments
  set body = '', deleted_at = now(), deleted_by = auth.uid()
  where id = p_comment_id;
end;
$$;

revoke execute on function public.delete_market_comment(bigint) from public, anon;
grant execute on function public.delete_market_comment(bigint) to authenticated, service_role;

-- ─── Live updates ───────────────────────────────────────────────────────────

-- For live updates (components/live/live-refresh.tsx), guarded as in 0032.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array array['feed_reactions', 'market_comments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

commit;
