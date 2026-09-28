-- Members edit their own display name, bio and profile photo.
--
-- Edits go through update_my_profile rather than an update grant on
-- profiles, so a member still can't write any column of the table directly
-- (tests/db/rls.test.ts), and every rule lives in one validated function.
--
-- Photos live in a public avatars bucket, one folder per member. The app
-- resizes a photo to a small square JPEG in the browser before uploading, so
-- the bucket takes only JPEGs, and only small ones.
--
-- avatar_path is new rather than reusing avatar_url: avatar_url holds the
-- Google photo URL captured at sign-up, which the app has never shown, and
-- the app builds a photo's URL from its storage path.
--
-- One explicit transaction, like 0034-0037. The alter table takes an access
-- exclusive lock on profiles for an instant; lock_timeout bounds the wait,
-- and an abort applies nothing, so the Deploy Production Database workflow
-- can simply be re-run.
begin;
set local lock_timeout = '5s';

alter table public.profiles
  add column bio text,
  add column avatar_path text;

-- The checks are new, so no existing row can break them, except a blank
-- display_name, which not valid leaves alone while still guarding every
-- later write.
alter table public.profiles
  add constraint profiles_bio_length check (char_length(bio) <= 160),
  add constraint profiles_avatar_path_own_folder check (avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.jpg$')),
  add constraint profiles_display_name_not_blank check (btrim(display_name) <> '') not valid;

create function public.update_my_profile(p_display_name text, p_bio text, p_avatar_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
  v_bio text := nullif(btrim(coalesce(p_bio, '')), '');
begin
  if auth.uid() is null or not public.is_invited() then
    raise exception 'not allowed';
  end if;

  if v_name = '' then
    raise exception 'display name is required';
  end if;

  update public.profiles
  set display_name = v_name, bio = v_bio, avatar_path = p_avatar_path
  where id = auth.uid();
end;
$$;

revoke execute on function public.update_my_profile(text, text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A public bucket serves its objects to anyone by URL, so reads need no
-- policy for display. The select policy is for the storage API itself,
-- which checks it when a member removes their own old photo.
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_invited())
  );

create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
