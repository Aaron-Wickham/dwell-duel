-- Over/under markets (#39) and editing a market's title and description (#41).
--
-- Over/under: the creator sets a line ending in .5 (so there's never a tie)
-- and the server makes the "Over <line>" and "Under <line>" outcomes itself.
-- Resolving takes the actual number; resolve_over_under picks the side and
-- records the number beside the resolution's note and proof.
--
-- Editing: the creator (or an admin) can change the title and description
-- until the market closes. Every change is kept in market_edits, which every
-- member can read, so a question reworded after people bet is never hidden.
-- Outcomes, kind, close time and the line stay fixed: changing any of them
-- would change the bet itself.
--
-- One explicit transaction, like 0034-0042; an abort applies nothing, and
-- the Deploy Production Database workflow can simply be re-run.
begin;
set local lock_timeout = '5s';

alter table public.markets drop constraint markets_kind_check;
alter table public.markets
  add constraint markets_kind_check check (kind in ('binary', 'multiple_choice', 'over_under')),
  add column line numeric,
  add column edited_at timestamptz,
  add constraint markets_line_matches_kind check ((kind = 'over_under') = (line is not null)),
  add constraint markets_line_is_half check (line is null or (line >= 0.5 and line % 1 = 0.5));

alter table public.market_resolutions add column actual_value numeric;

-- ─── create_market, with an optional line ───────────────────────────────────
-- Identical to 0009 for binary and multiple-choice markets.
drop function public.create_market(text, text, text, text[], timestamptz);

create function public.create_market(
  p_title text,
  p_description text,
  p_kind text,
  p_outcome_labels text[],
  p_close_at timestamptz,
  p_line numeric default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market_id uuid;
  v_label text;
  v_labels text[] := p_outcome_labels;
begin
  if not public.is_invited() then
    raise exception 'not invited';
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

  return v_market_id;
end;
$$;

revoke execute on function public.create_market(text, text, text, text[], timestamptz, numeric) from public, anon;
grant execute on function public.create_market(text, text, text, text[], timestamptz, numeric) to authenticated, service_role;

-- ─── resolve_over_under ─────────────────────────────────────────────────────
-- Picks the side from the actual result, then resolves through resolve_market
-- (0042), so the note rule, proof, overrides and payouts are all the same.
create function public.resolve_over_under(p_market_id uuid, p_actual numeric, p_note text, p_attachments jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_line numeric;
  v_winner uuid;
  v_resolution_id uuid;
begin
  select kind, line into v_kind, v_line from public.markets where id = p_market_id;
  if not found then
    raise exception 'market not found';
  end if;
  if v_kind <> 'over_under' then
    raise exception 'this market isn''t an over/under';
  end if;
  if p_actual is null or p_actual < 0 then
    raise exception 'enter the actual result';
  end if;
  if p_actual = v_line then
    raise exception 'the result can''t equal the line';
  end if;

  select id into v_winner
  from public.market_outcomes
  where market_id = p_market_id
    and label = case when p_actual > v_line then 'Over ' else 'Under ' end || trim_scale(v_line)::text;

  perform public.resolve_market(p_market_id, v_winner, p_note, p_attachments);

  select current_resolution_id into v_resolution_id from public.markets where id = p_market_id;
  update public.market_resolutions set actual_value = p_actual where id = v_resolution_id;
end;
$$;

revoke execute on function public.resolve_over_under(uuid, numeric, text, jsonb) from public, anon;
grant execute on function public.resolve_over_under(uuid, numeric, text, jsonb) to authenticated, service_role;

-- ─── Editing a market ───────────────────────────────────────────────────────

create table public.market_edits (
  id bigint generated always as identity primary key,
  market_id uuid not null references public.markets (id) on delete cascade,
  edited_by uuid not null references public.profiles (id),
  edited_at timestamptz not null default now(),
  old_title text not null,
  new_title text not null,
  old_description text,
  new_description text
);

create index market_edits_market_idx on public.market_edits (market_id, edited_at desc);
create index market_edits_edited_by_idx on public.market_edits (edited_by);

alter table public.market_edits enable row level security;

create policy select_market_edits on public.market_edits for select to authenticated
  using ((select is_invited()));

revoke all on public.market_edits from public, anon, authenticated, service_role;
grant select on public.market_edits to authenticated;
grant all on public.market_edits to service_role;

create function public.update_market(p_market_id uuid, p_title text, p_description text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market record;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  select created_by, status, close_at, title, description into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;
  if not (v_market.created_by = auth.uid() or public.is_admin()) then
    raise exception 'only the market''s creator or an admin can edit it';
  end if;
  if v_market.status <> 'open' or now() >= v_market.close_at then
    raise exception 'this market has closed, so it can''t be edited';
  end if;
  if v_title = '' then
    raise exception 'enter a title';
  end if;

  if v_title = v_market.title and v_description is not distinct from v_market.description then
    return;
  end if;

  insert into public.market_edits (market_id, edited_by, old_title, new_title, old_description, new_description)
  values (p_market_id, auth.uid(), v_market.title, v_title, v_market.description, v_description);

  update public.markets
  set title = v_title, description = v_description, edited_at = now()
  where id = p_market_id;
end;
$$;

revoke execute on function public.update_market(uuid, text, text) from public, anon;
grant execute on function public.update_market(uuid, text, text) to authenticated, service_role;

commit;
