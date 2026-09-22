create function handle_new_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Matches on the verified JWT claim, not the client-suppliable NEW.email
  -- column — same identity check is_invited() already used to admit this
  -- insert, so a crafted insert with a spoofed email column can't claim
  -- someone else's invite or fail to claim its own. A service-role insert
  -- (as in this migration's own tests) has no JWT, so auth.jwt() is null
  -- and this update matches zero rows — harmless, not an error.
  update public.allowed_emails
  set claimed_by = new.id
  where email = lower(auth.jwt() ->> 'email') and claimed_by is null;

  perform public.apply_coin_transaction(new.id, 100, 'starting_grant', '{}'::jsonb);

  return new;
end;
$$;

create trigger on_profile_created
  after insert on public.profiles
  for each row execute function handle_new_profile();
