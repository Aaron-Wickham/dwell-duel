-- #221: update_market (0043) let the creator reword a market's title while another member's
-- parlay had a leg on it, because "others have bet" looked only at solo bets. A parlay leg is a
-- bet on the question as worded too, so the check now counts legs of other members' parlays.
-- Otherwise the function is 0043's, unchanged.
create or replace function public.update_market(p_market_id uuid, p_title text, p_description text)
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
  -- Rewording the question after someone else has bet on it, solo or as a parlay leg, would
  -- change their bet.
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
