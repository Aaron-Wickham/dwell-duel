-- A market's creator or an admin can change its close time, and reopen a closed market (#326).
--
-- Since fixed payouts (0101-0105) nothing is set when a market closes: a bet's payout and a
-- parlay's multiplier are fixed when they're placed. So the close time is only the end of the
-- betting window, and moving it changes nothing already placed.
--
-- 1. market_edits gains old_close_at and new_close_at, set only on an edit that moved the close.
-- 2. update_market gains a five-argument version with p_close_at (null keeps it). The creator (while
--    invited) or an admin can move it while the market is open, before or after it closed, but
--    never once it's resolved or voided, and only to a time still in the future. Moving a closed
--    market's close into the future reopens it. A creator can't reword or recategorise a closed
--    market, as before; the close time is the one thing they can still change.
--    A creator with a stake in the market (a bet or any parlay leg on it) can't move it: they
--    would choose when betting on their own question stops. An admin can.
-- 3. Moving the close clears the market's closing-alert claims (push_log and push_attempts, 0057,
--    0058, 0076), so the creator's reminder and the admins' alert go out again at the new close.
--    claim_push_log now claims only a market whose close has passed, so a closing-alerts run that
--    read a market as due before it was reopened can't claim it afterwards and swallow the alert
--    for the new close.
-- 4. can_move_market_close mirrors the rule, so the market page offers the close-time field and
--    Reopen only to those who may use them, as it offers Void through can_void_market.
--
-- Additive: two columns, two new functions, a new overload, and claim_push_log replaced with the
-- same signature. The four-argument update_market stays for the build before this one.
--
-- One explicit transaction, like 0034-0105.
begin;
set local lock_timeout = '5s';

alter table public.market_edits
  add column old_close_at timestamptz,
  add column new_close_at timestamptz;

create function public.update_market(
  p_market_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_close_at timestamptz
)
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
  v_close_at timestamptz;
  v_wording_changed boolean;
  v_category_changed boolean;
  v_close_changed boolean;
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

  -- As 0103: the current category, however it's typed, stays as it is. A creator can't change it
  -- once the market has closed, and that is checked before category_for_name can make a new one.
  if p_category is null or exists (
    select 1 from public.market_categories
    where id = v_market.category_id
      and slug = lower(replace(regexp_replace(btrim(p_category), '\s+', ' ', 'g'), ' ', '-'))
  ) then
    v_category_id := v_market.category_id;
  elsif not v_open and not v_admin then
    raise exception 'this market has closed, so it can''t be edited';
  else
    v_category_id := public.category_for_name(p_category);
  end if;

  v_close_at := coalesce(p_close_at, v_market.close_at);
  v_wording_changed := v_title <> v_market.title or v_description is distinct from v_market.description;
  v_category_changed := v_category_id <> v_market.category_id;
  v_close_changed := v_close_at <> v_market.close_at;

  if v_wording_changed and not v_open then
    raise exception 'this market has closed, so it can''t be edited';
  end if;
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

  if v_close_changed then
    if v_market.status <> 'open' then
      raise exception 'this market has been settled, so its close time can''t change';
    end if;
    if v_close_at <= now() then
      raise exception 'close time must be in the future';
    end if;
    if not v_admin and public.has_stake_in_market(p_market_id, auth.uid()) then
      raise exception 'you have a stake in this market, so ask an admin to move its close time';
    end if;
  end if;

  if not v_wording_changed and not v_category_changed and not v_close_changed then
    return;
  end if;

  insert into public.market_edits (
    market_id, edited_by, old_title, new_title, old_description, new_description,
    old_category_id, new_category_id, old_close_at, new_close_at
  )
  values (
    p_market_id, auth.uid(), v_market.title, v_title, v_market.description, v_description,
    case when v_category_changed then v_market.category_id end,
    case when v_category_changed then v_category_id end,
    case when v_close_changed then v_market.close_at end,
    case when v_close_changed then v_close_at end
  );

  update public.markets
  set title = v_title, description = v_description, category_id = v_category_id, close_at = v_close_at, edited_at = now()
  where id = p_market_id;

  -- The closing alerts claim each market once (0071, 0076). A new close is a new closing, so both
  -- alerts are due again when it passes.
  if v_close_changed then
    delete from public.push_log
    where kind in ('resolve_reminder', 'market_alert') and ref = p_market_id::text;
    delete from public.push_attempts
    where kind in ('resolve_reminder', 'market_alert') and ref = p_market_id::text;
  end if;
end;
$$;

revoke execute on function public.update_market(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.update_market(uuid, text, text, text, timestamptz) to authenticated, service_role;

-- Whether the caller may move this market's close time: update_market's rule above.
create function public.can_move_market_close(p_market_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.markets m
    where m.id = p_market_id
      and m.status = 'open'
      and (
        public.is_admin()
        or (
          m.created_by = auth.uid()
          and public.is_invited()
          and not public.has_stake_in_market(m.id, auth.uid())
        )
      )
  )
$$;

revoke execute on function public.can_move_market_close(uuid) from public, anon;
grant execute on function public.can_move_market_close(uuid) to authenticated, service_role;

-- As 0071, but a ref is claimed only once its market's close has passed. The route reads what's
-- due, sends, then claims; a market reopened in between has had its claims cleared by
-- update_market, and claiming it now would stop the alert for its new close. Both kinds' refs are
-- market ids; a ref that names no market is claimed as before.
create or replace function public.claim_push_log(p_kind text, p_refs text[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with claimed as (
    insert into public.push_log (kind, ref)
    select p_kind, r.ref
    from unnest(p_refs) as r(ref)
    left join public.markets m on m.id::text = r.ref
    where m.id is null or m.close_at <= now()
    on conflict do nothing
    returning ref
  )
  select count(*)::integer from claimed
$$;

commit;
