-- Market categories (#327). Every market has exactly one category, which members create freely when
-- they make a market; an admin can rename, merge and hide them.
--
-- 1. market_categories: a name of 1-24 characters in normal form (trimmed, runs of whitespace one
--    space) and a slug made from it (lower case, spaces as hyphens), unique, so "Bible  study" and
--    "bible study" are one category. Members read it; writes go through the functions below.
--    "Other" is seeded with a fixed id.
-- 2. markets.category_id defaults to Other's id, which backfills every existing market and keeps
--    the build still serving during the deploy creating markets (in Other) as before.
-- 3. create_market_v4 is create_market_v3 (0102) plus the category. v3 stays for that build.
-- 4. update_market gains a four-argument version with p_category. The creator can change the
--    category until close and an admin at any time; each change is logged to market_edits.
--    Unlike the title, other members' bets don't fix it. The three-argument version stays for the
--    old build.
-- 5. Admins rename, merge and hide categories; category_counts() ranks them for the markets list.
--    Making a market in a hidden or merged category's name shows it again. A member can make 20 new
--    categories a day (0090's write limits), since editing a market can make one too.
--
-- Additive: a new table, new columns with defaults, new functions, a new overload, and 0090's
-- write_limits() and enforce_write_limit() replaced with the same signatures.
--
-- One explicit transaction, like 0034-0102.
begin;
set local lock_timeout = '5s';

-- ─── Table ──────────────────────────────────────────────────────────────────

create table public.market_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null generated always as (lower(replace(name, ' ', '-'))) stored,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  constraint market_categories_name_length check (char_length(name) between 1 and 24),
  constraint market_categories_name_normal check (name = regexp_replace(btrim(name), '\s+', ' ', 'g'))
);

create unique index market_categories_slug_key on public.market_categories (slug);
create index market_categories_created_by_idx on public.market_categories (created_by);

alter table public.market_categories enable row level security;

create policy select_market_categories on public.market_categories for select to authenticated
  using ((select public.is_invited()));

revoke all on public.market_categories from public, anon, authenticated, service_role;
grant select on public.market_categories to authenticated;
grant all on public.market_categories to service_role;

insert into public.market_categories (id, name) values ('00000000-0000-4000-8000-000000000327', 'Other');

alter table public.markets
  add column category_id uuid not null default '00000000-0000-4000-8000-000000000327'
    references public.market_categories (id);

create index markets_category_status_close_idx on public.markets (category_id, status, close_at, id);

-- Null when that edit left the category alone, as every edit before 0103 did.
alter table public.market_edits
  add column old_category_id uuid references public.market_categories (id),
  add column new_category_id uuid references public.market_categories (id);

create index market_edits_old_category_idx on public.market_edits (old_category_id);
create index market_edits_new_category_idx on public.market_edits (new_category_id);

-- ─── Finding or creating one ────────────────────────────────────────────────

-- Concurrent creates of one name both land on the same row: the loser's insert does nothing and
-- the select finds the winner's. Choosing a hidden category shows it again.
create function public.category_for_name(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_slug text;
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'choose a category';
  end if;
  v_slug := lower(replace(v_name, ' ', '-'));

  -- Looked up first, so only a name nobody has used reaches the insert and its write limit.
  select id into v_id from public.market_categories where slug = v_slug;
  if v_id is null then
    insert into public.market_categories (name, created_by)
    values (v_name, auth.uid())
    on conflict (slug) do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id from public.market_categories where slug = v_slug;
    end if;
  end if;

  update public.market_categories set hidden_at = null where id = v_id and hidden_at is not null;

  return v_id;
end;
$$;

revoke execute on function public.category_for_name(text) from public, anon, authenticated;

-- New categories count against a daily write limit (0090), like markets: editing a market can make
-- one too, so the market limit alone wouldn't bound them. write_limits() and enforce_write_limit()
-- are 0090's, plus the category row and its message.
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
    ('bet_cancel', 20, 3600)
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
        when 'bet_cancel' then 'you have cancelled too many bets recently; try again later'
        else 'too many writes; try again later'
      end
      using errcode = 'DD429';
    end if;
  end loop;

  return new;
end;
$$;

create trigger market_categories_write_limit before insert on public.market_categories
  for each row execute function public.enforce_write_limit('category', 'created_by');

-- ─── Creating ───────────────────────────────────────────────────────────────

-- 0102's create_market_v3, plus the category.
create function public.create_market_v4(
  p_title text,
  p_description text,
  p_kind text,
  p_outcome_labels text[],
  p_close_at timestamptz,
  p_category text,
  p_line numeric default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market_id uuid;
  v_label text;
  v_labels text[] := p_outcome_labels;
  v_previous jsonb;
  v_category_id uuid;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_idempotency_key is not null then
    v_previous := public.claim_idempotency_key(p_idempotency_key, 'create_market');
    if v_previous is not null then
      return jsonb_build_object('market_id', v_previous ->> 'market_id', 'replayed', true);
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

  v_category_id := public.category_for_name(p_category);

  insert into public.markets (created_by, title, description, kind, close_at, line, pricing, seed_per_outcome, category_id)
  values (
    auth.uid(), p_title, p_description, p_kind, p_close_at,
    case when p_kind = 'over_under' then p_line end,
    'lmsr', 0, v_category_id
  )
  returning id into v_market_id;

  foreach v_label in array v_labels loop
    insert into public.market_outcomes (market_id, label) values (v_market_id, v_label);
  end loop;

  if p_idempotency_key is not null then
    perform public.finish_idempotent(p_idempotency_key, jsonb_build_object('market_id', v_market_id));
  end if;

  return jsonb_build_object('market_id', v_market_id, 'replayed', false);
end;
$$;

revoke execute on function public.create_market_v4(text, text, text, text[], timestamptz, text, numeric, uuid) from public, anon;
grant execute on function public.create_market_v4(text, text, text, text[], timestamptz, text, numeric, uuid) to authenticated, service_role;

-- ─── Editing ────────────────────────────────────────────────────────────────

-- 0073's update_market plus the category. A null p_title keeps the title and description as they
-- are, which is how an admin recategorises a market that has closed; a null p_category keeps the
-- category.
create function public.update_market(p_market_id uuid, p_title text, p_description text, p_category text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market record;
  v_admin boolean := public.is_admin();
  v_open boolean;
  v_title text;
  v_description text;
  v_category_id uuid;
  v_wording_changed boolean;
  v_category_changed boolean;
begin
  select created_by, status, close_at, title, description, category_id into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;
  if not ((v_market.created_by = auth.uid() and public.is_invited()) or v_admin) then
    raise exception 'only the market''s creator or an admin can edit it';
  end if;

  v_open := v_market.status = 'open' and now() < v_market.close_at;
  if not v_open and not v_admin then
    raise exception 'this market has closed, so it can''t be edited';
  end if;

  if p_title is null then
    v_title := v_market.title;
    v_description := v_market.description;
  else
    v_title := btrim(p_title);
    v_description := nullif(btrim(coalesce(p_description, '')), '');
  end if;
  if v_title = '' then
    raise exception 'enter a title';
  end if;

  -- The current category, however it's typed, stays as it is: category_for_name would show it
  -- again if an admin had hidden it.
  if p_category is null or exists (
    select 1 from public.market_categories
    where id = v_market.category_id
      and slug = lower(replace(regexp_replace(btrim(p_category), '\s+', ' ', 'g'), ' ', '-'))
  ) then
    v_category_id := v_market.category_id;
  else
    v_category_id := public.category_for_name(p_category);
  end if;

  v_wording_changed := v_title <> v_market.title or v_description is distinct from v_market.description;
  v_category_changed := v_category_id <> v_market.category_id;

  if v_wording_changed and not v_open then
    raise exception 'this market has closed, so it can''t be edited';
  end if;
  -- Rewording the question after someone else has bet on it, solo or as a parlay leg, would
  -- change their bet. Its category doesn't.
  if v_title <> v_market.title and (
    exists (
      select 1 from public.bets where market_id = p_market_id and profile_id <> v_market.created_by
    )
    or exists (
      select 1
      from public.parlay_legs l
      join public.parlays pa on pa.id = l.parlay_id
      where l.market_id = p_market_id and pa.profile_id <> v_market.created_by
    )
  ) then
    raise exception 'others have bet on this market, so its title can''t change';
  end if;

  if not v_wording_changed and not v_category_changed then
    return;
  end if;

  insert into public.market_edits (
    market_id, edited_by, old_title, new_title, old_description, new_description, old_category_id, new_category_id
  )
  values (
    p_market_id, auth.uid(), v_market.title, v_title, v_market.description, v_description,
    case when v_category_changed then v_market.category_id end,
    case when v_category_changed then v_category_id end
  );

  update public.markets
  set title = v_title, description = v_description, category_id = v_category_id, edited_at = now()
  where id = p_market_id;
end;
$$;

revoke execute on function public.update_market(uuid, text, text, text) from public, anon;
grant execute on function public.update_market(uuid, text, text, text) to authenticated, service_role;

-- ─── Admin ──────────────────────────────────────────────────────────────────

create function public.rename_market_category(p_category_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if not public.is_admin() then
    raise exception 'only an admin can change categories';
  end if;
  if v_name = '' then
    raise exception 'enter a name';
  end if;
  if not exists (select 1 from public.market_categories where id = p_category_id) then
    raise exception 'category not found';
  end if;
  if exists (
    select 1 from public.market_categories
    where slug = lower(replace(v_name, ' ', '-')) and id <> p_category_id
  ) then
    raise exception 'a category with that name already exists; merge them instead';
  end if;

  update public.market_categories set name = v_name where id = p_category_id;
end;
$$;

revoke execute on function public.rename_market_category(uuid, text) from public, anon;
grant execute on function public.rename_market_category(uuid, text) to authenticated, service_role;

-- Moves every market in p_from into p_into, logging each move as an edit by the admin, and hides
-- p_from. Returns how many markets moved.
create function public.merge_market_categories(p_from uuid, p_into uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moved integer;
begin
  if not public.is_admin() then
    raise exception 'only an admin can change categories';
  end if;
  if p_from = p_into then
    raise exception 'choose a different category to merge into';
  end if;
  -- Every market made by the build before 0103 lands in Other, so it can't be hidden.
  if p_from = '00000000-0000-4000-8000-000000000327' then
    raise exception 'Other can''t be merged away';
  end if;
  if not exists (select 1 from public.market_categories where id = p_from) then
    raise exception 'category not found';
  end if;
  if not exists (select 1 from public.market_categories where id = p_into) then
    raise exception 'category not found';
  end if;
  if exists (select 1 from public.market_categories where id = p_into and hidden_at is not null) then
    raise exception 'merge into a category that isn''t hidden';
  end if;

  insert into public.market_edits (
    market_id, edited_by, old_title, new_title, old_description, new_description, old_category_id, new_category_id
  )
  select id, auth.uid(), title, title, description, description, p_from, p_into
  from public.markets
  where category_id = p_from;

  update public.markets set category_id = p_into, edited_at = now() where category_id = p_from;
  get diagnostics v_moved = row_count;

  update public.market_categories set hidden_at = coalesce(hidden_at, now()) where id = p_from;

  return v_moved;
end;
$$;

revoke execute on function public.merge_market_categories(uuid, uuid) from public, anon;
grant execute on function public.merge_market_categories(uuid, uuid) to authenticated, service_role;

-- A hidden category drops out of the chips and suggestions; its markets keep it.
create function public.set_market_category_hidden(p_category_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can change categories';
  end if;
  if p_hidden and p_category_id = '00000000-0000-4000-8000-000000000327' then
    raise exception 'Other can''t be hidden';
  end if;

  update public.market_categories
  set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end
  where id = p_category_id;

  if not found then
    raise exception 'category not found';
  end if;
end;
$$;

revoke execute on function public.set_market_category_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_market_category_hidden(uuid, boolean) to authenticated, service_role;

-- ─── Ranking ────────────────────────────────────────────────────────────────

-- Busiest first: markets still taking bets, then every market, with ties broken by name. Invoker
-- rights, so it counts only what the caller's RLS lets them read.
create function public.category_counts(p_include_hidden boolean default false)
returns table (id uuid, name text, slug text, hidden_at timestamptz, open_markets integer, markets integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.name,
    c.slug,
    c.hidden_at,
    (count(m.id) filter (where m.status = 'open' and m.close_at > now()))::integer,
    count(m.id)::integer
  from public.market_categories c
  left join public.markets m on m.category_id = c.id
  where p_include_hidden or c.hidden_at is null
  group by c.id
  order by 5 desc, 6 desc, lower(c.name), c.name
$$;

revoke execute on function public.category_counts(boolean) from public, anon;
grant execute on function public.category_counts(boolean) to authenticated, service_role;

commit;
