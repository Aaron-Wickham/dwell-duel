alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.coin_transactions enable row level security;

grant select on public.profiles to authenticated;
-- Deliberately omits balance and is_admin: authenticated can't even
-- attempt to set them, regardless of what the RLS check below does.
grant insert (id, email, display_name, avatar_url) on public.profiles to authenticated;

create policy select_all_profiles on public.profiles for select to authenticated using (true);
create policy insert_own_profile on public.profiles for insert to authenticated
  with check (id = auth.uid() and is_invited() and balance = 0 and is_admin = false);

grant select, insert, delete on public.allowed_emails to authenticated;

create policy admin_select_invites on public.allowed_emails for select to authenticated using (is_admin());
create policy admin_insert_invites on public.allowed_emails for insert to authenticated with check (is_admin());
create policy admin_delete_invites on public.allowed_emails for delete to authenticated using (is_admin());

grant select on public.coin_transactions to authenticated;

create policy select_own_or_admin_transactions on public.coin_transactions for select to authenticated
  using (profile_id = auth.uid() or is_admin());
