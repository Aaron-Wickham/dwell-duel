-- #288, #289, #290: who may settle, edit and remove, checked in the database.
--
-- 1. A creator's or author's own powers need a current invite, as every role already does (0068):
--    resolving and voiding their own market, editing it, and deleting their own comment. has_role()
--    and is_admin() imply an invite, so only the own-row branches gain the check.
-- 2. remove_member also ends the member's Auth sessions (refresh tokens go with them), so their
--    devices are signed out and can't renew a token.
-- 3. An admin deletes only an unclaimed invite. A claimed invite is a member's, and removing a
--    member is the owner's alone (remove_member). An admin inserts only an invite's email, with
--    themselves as the inviter.
-- 4. Voiding follows the settle rules: before close, the creator (while invited) or an admin; once
--    the market has closed, an admin only. Every void says why (markets.void_reason), and the void
--    is posted to the feed as a market_voided event.
--
-- void_market gains p_reason. The function is replaced rather than overloaded: two candidates
-- matching a call by p_market_id alone would make PostgREST refuse it as ambiguous. p_reason
-- defaults to null, so the previous build's call (p_market_id only) still reaches the function
-- while this deploys, and is refused for having no reason instead of failing to resolve.
--
-- One explicit transaction, like 0034-0072.
begin;
set local lock_timeout = '5s';

-- ─── 1. Own-row powers need an invite ────────────────────────────────────────

-- 0066's definition; only the creator branch changes.
create or replace function public.resolve_market_core(p_market_id uuid, p_outcome_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_status text;
  v_close_at timestamptz;
  v_current_resolution_id uuid;
  v_seed integer;
  v_outcome_count integer;
  v_outcome_market_id uuid;
  v_total_pool bigint;
  v_winning_pool bigint;
  v_new_resolution_id uuid;
  v_is_admin boolean;
  v_txn record;
  v_bet record;
  v_parlay_id uuid;
  v_short jsonb;
begin
  select created_by, status, close_at, current_resolution_id, seed_per_outcome
    into v_created_by, v_status, v_close_at, v_current_resolution_id, v_seed
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status = 'voided' then
    raise exception 'market was voided';
  end if;

  select public.is_admin() into v_is_admin;

  if v_status = 'resolved' then
    if not v_is_admin then
      raise exception 'only an admin can change an already-resolved market';
    end if;
    if exists (
      select 1 from public.market_resolutions
      where id = v_current_resolution_id and outcome_id = p_outcome_id
    ) then
      raise exception 'that outcome is already the result';
    end if;
  elsif not v_is_admin then
    if not ((auth.uid() = v_created_by and public.is_invited()) or public.has_role('reviewer')) then
      raise exception 'only the market creator, a reviewer or an admin can resolve this market';
    end if;
    if now() < v_close_at then
      raise exception 'market has not closed yet';
    end if;
    -- #58: a stake in the result rules you out, unless you're an admin.
    if public.has_stake_in_market(p_market_id, auth.uid()) then
      raise exception 'you have a stake in this market, so someone else resolves it';
    end if;
  end if;

  select market_id into v_outcome_market_id
  from public.market_outcomes
  where id = p_outcome_id;

  if v_outcome_market_id is null or v_outcome_market_id <> p_market_id then
    raise exception 'outcome does not belong to this market';
  end if;

  perform 1 from public.profiles where id in (
    select profile_id from public.coin_transactions where meta ->> 'resolution_id' = v_current_resolution_id::text
    union select profile_id from public.bets where market_id = p_market_id
    union select pa.profile_id from public.parlays pa join public.parlay_legs l on l.parlay_id = pa.id where l.market_id = p_market_id
  ) order by id for no key update;

  if v_status = 'resolved' then
    select jsonb_agg(
             jsonb_build_object('display_name', m.display_name, 'owed', m.owed, 'balance', m.balance)
             order by m.display_name, m.id
           ) filter (where m.balance < m.owed)
      into v_short
    from (
      select p.id, p.display_name, p.balance, o.owed
      from public.profiles p
      join (
        select c.profile_id, sum(c.amount) as owed
        from (
          select t.profile_id, t.amount
          from public.coin_transactions t
          where t.meta ->> 'resolution_id' = v_current_resolution_id::text
          union all
          select pa.profile_id, pa.credited
          from public.parlays pa
          where pa.status = 'won'
            and exists (
              select 1 from public.parlay_legs l
              where l.parlay_id = pa.id
                and l.market_id = p_market_id
                and l.outcome_id <> p_outcome_id
            )
        ) c
        group by c.profile_id
      ) o on o.profile_id = p.id
      order by p.id
      for no key update of p
    ) m;

    if v_short is not null then
      raise exception '%', 'clawback_short:' || v_short::text;
    end if;
  end if;

  if v_current_resolution_id is not null then
    for v_txn in
      select profile_id, amount, id
      from public.coin_transactions
      where meta ->> 'resolution_id' = v_current_resolution_id::text
      order by profile_id, id
    loop
      perform public.apply_coin_transaction(
        v_txn.profile_id, -v_txn.amount, 'resolution_reversed',
        jsonb_build_object(
          'market_id', p_market_id,
          'reversed_resolution_id', v_current_resolution_id,
          'original_transaction_id', v_txn.id
        )
      );
    end loop;

    update public.market_resolutions
    set reversed_at = now(), reversed_by = auth.uid()
    where id = v_current_resolution_id;
  end if;

  insert into public.market_resolutions (market_id, outcome_id, resolved_by)
  values (p_market_id, p_outcome_id, auth.uid())
  returning id into v_new_resolution_id;

  update public.markets
  set status = 'resolved', current_resolution_id = v_new_resolution_id, settled_at = coalesce(settled_at, now())
  where id = p_market_id;

  select coalesce(sum(pool_total), 0), count(*) into v_total_pool, v_outcome_count
  from public.market_outcomes where market_id = p_market_id;

  select pool_total into v_winning_pool
  from public.market_outcomes where id = p_outcome_id;

  if v_winning_pool = 0 then
    for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id order by profile_id, id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id, v_bet.amount, 'bet_refunded',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  else
    for v_bet in select profile_id, amount, id from public.bets where outcome_id = p_outcome_id order by profile_id, id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id,
        floor(v_bet.amount::numeric * (v_total_pool + v_seed * v_outcome_count) / (v_winning_pool + v_seed))::integer,
        'bet_won',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id, 'seed_per_outcome', v_seed)
      );
    end loop;
  end if;

  for v_parlay_id in
    select distinct parlay_id from public.parlay_legs
    where market_id = p_market_id
    order by parlay_id
  loop
    perform public.settle_parlay(v_parlay_id);
  end loop;
end;
$$;

-- 0046's definition, with the invite on the creator branch. The proof storage policy for
-- resolution/<market>/ rests on this, so it follows too.
create or replace function public.can_resolve_market(p_market_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Mirrors resolve_market_core's rules; the resolve form and the proof storage policy use it.
  select public.is_admin() or exists (
    select 1 from public.markets m
    where m.id = p_market_id
      and m.status = 'open'
      and now() >= m.close_at
      and ((m.created_by = auth.uid() and public.is_invited()) or public.has_role('reviewer'))
      and not public.has_stake_in_market(m.id, auth.uid())
  )
$$;

-- 0065's definition; only the creator branch changes.
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
  if not ((v_market.created_by = auth.uid() and public.is_invited()) or public.is_admin()) then
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

-- 0053's definition; only the author branch changes.
create or replace function public.delete_market_comment(p_comment_id bigint)
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
  if not ((v_author = auth.uid() and public.is_invited()) or public.has_role('admin')) then
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

-- ─── 2. Removing a member signs them out ─────────────────────────────────────

-- 0068's definition, plus the member's Auth sessions. auth.refresh_tokens cascades from
-- auth.sessions, so no device can renew; an access token already issued lives out its expiry,
-- which is why every own-row power above checks the invite too.
create or replace function public.remove_member(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_role text;
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can remove a member';
  end if;

  select lower(email), role into v_email, v_role
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'member not found';
  end if;

  if p_profile_id = auth.uid() or v_role = 'owner' then
    raise exception 'the owner can''t be removed';
  end if;

  update public.profiles set role = 'member' where id = p_profile_id;
  -- By email, as is_invited() matches, and by claim, in case the profile's email was ever recased.
  delete from public.allowed_emails where email = v_email or claimed_by = p_profile_id;
  delete from public.push_subscriptions where profile_id = p_profile_id;
  delete from auth.sessions where user_id = p_profile_id;
end;
$$;

-- ─── 3. Only an unclaimed invite can be revoked ──────────────────────────────

-- 0033's policy plus the claim. A claimed invite goes only through remove_member (owner only),
-- which runs as its definer and doesn't pass through this policy.
drop policy admin_delete_invites on public.allowed_emails;
create policy admin_delete_invites on public.allowed_emails for delete to authenticated
  using ((select is_admin()) and claimed_by is null);

-- An admin's invite names only the email and themselves as the inviter: claimed_by is written by
-- the profile trigger alone, and invited_by defaults to, and must equal, the caller. The previous
-- build sends invited_by as its own verified id, so it keeps working while this deploys.
revoke insert on public.allowed_emails from authenticated;
grant insert (email, invited_by) on public.allowed_emails to authenticated;
alter table public.allowed_emails alter column invited_by set default auth.uid();

drop policy admin_insert_invites on public.allowed_emails;
create policy admin_insert_invites on public.allowed_emails for insert to authenticated
  with check ((select is_admin()) and invited_by = (select auth.uid()));

-- ─── 4. Voids follow the settle rules and say why ────────────────────────────

alter table public.markets add column void_reason text;
alter table public.markets
  add constraint markets_void_reason_length check (char_length(void_reason) <= 500);

comment on column public.markets.void_reason is
  'Why the market was voided, shown on the market and in the feed. Null unless voided (and for voids before 0073).';

-- market_voided: the void itself, written by void_market (like season_champion, it has no source
-- row of its own for a trigger to follow). Its market foreign key cascades.
alter table public.activity_events drop constraint activity_events_kind_check;
alter table public.activity_events add constraint activity_events_kind_check
  check (kind in ('bet_placed','parlay_placed','market_created','market_resolved','bet_won','parlay_won','task_completed','season_champion','market_voided'));

drop function public.void_market(uuid);

-- 0066's definition, with the rules above: an admin at any time; otherwise the invited creator,
-- only before the market closes. After close, a market is settled by someone with no stake in it
-- (resolve_market) or by an admin, the same rule 0046 set for resolving.
create function public.void_market(p_market_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
  v_created_by uuid;
  v_status text;
  v_close_at timestamptz;
  v_bet record;
  v_parlay_id uuid;
begin
  select created_by, status, close_at into v_created_by, v_status, v_close_at
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status <> 'open' then
    raise exception 'only an unresolved, unvoided market can be voided';
  end if;

  if not public.is_admin() then
    if not (auth.uid() = v_created_by and public.is_invited()) then
      raise exception 'only the market creator or an admin can void this market';
    end if;
    if now() >= v_close_at then
      raise exception 'this market has closed, so only an admin can void it';
    end if;
  end if;

  if v_reason is null then
    raise exception 'say why this market is voided';
  end if;

  -- Every profile this call could touch, locked once up front in id order,
  -- before any write: this market's bettors and the owners of parlays with a
  -- leg here. A voided market only ever had status 'open' (checked above),
  -- so it never has a current resolution to reverse -- see the note above
  -- resolve_market and void_market (0033) for why this, not the per-loop
  -- ordering below, is what rules out a cross-phase deadlock. NO KEY UPDATE,
  -- not UPDATE: FOR UPDATE here would block other transactions' foreign-key
  -- checks (FOR KEY SHARE) on these profiles.
  perform 1 from public.profiles where id in (
    select profile_id from public.bets where market_id = p_market_id
    union select pa.profile_id from public.parlays pa join public.parlay_legs l on l.parlay_id = pa.id where l.market_id = p_market_id
  ) order by id for no key update;

  update public.markets set status = 'voided', settled_at = now(), void_reason = v_reason where id = p_market_id;

  for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id order by profile_id, id loop
    perform public.apply_coin_transaction(
      v_bet.profile_id, v_bet.amount, 'bet_voided_refund',
      jsonb_build_object('market_id', p_market_id, 'bet_id', v_bet.id)
    );
  end loop;

  for v_parlay_id in
    select distinct parlay_id from public.parlay_legs
    where market_id = p_market_id
    order by parlay_id
  loop
    perform public.settle_parlay(v_parlay_id);
  end loop;

  insert into public.activity_events (id, kind, occurred_at, actor_id, market_id)
  values ('void:' || p_market_id, 'market_voided', now(), auth.uid(), p_market_id);
end;
$$;

revoke execute on function public.void_market(uuid, text) from public, anon;
grant execute on function public.void_market(uuid, text) to authenticated, service_role;

commit;
