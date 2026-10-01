-- #253: Storage is capped at 1 GB on the free plan, and nothing limited what members could put in it.
--
--   * proof bucket: 3 MB a file, and no Word files (Storage checks the declared type, not the bytes,
--     and reviewers would be opening legacy .doc files from anyone)
--   * uploads: a member's proof uploads are limited per rolling day by count and bytes, checked in the
--     insert policy so the Storage API can't be used to get round the app's limits
--   * submissions: record_proof takes at most 5 attachments, 3 of them files, 6 MB of files in all
--   * submitted proof can't be deleted by the member any more; only unattached uploads can
--   * retention: proof of a reviewed task expires after 30 days and resolution proof after 90; the
--     daily cron removes the files and stamps proof_attachments.expired_at, keeping the row
--   * avatars nothing points at, and a usage report for the cron to watch
--
-- Additive, like every migration that applies before the app deploys: an old client sending more than
-- 5 attachments is refused until the new app is live.
begin;
set local lock_timeout = '5s';

update storage.buckets
set file_size_limit = 3145728,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'application/pdf', 'text/plain'
    ]
where id = 'proof';

alter table public.proof_attachments add column expired_at timestamptz;

-- ─── Upload quota ─────────────────────────────────────────────────────────────

-- security definer so the count sees the caller's objects in every folder, whatever the select policy shows.
create function public.proof_upload_quota_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 30 and coalesce(sum((o.metadata ->> 'size')::bigint), 0) < 62914560
  from storage.objects o
  where o.bucket_id = 'proof'
    and o.owner_id = auth.uid()::text
    and o.created_at > now() - interval '1 day'
$$;

revoke execute on function public.proof_upload_quota_ok() from public, anon;
grant execute on function public.proof_upload_quota_ok() to authenticated, service_role;

drop policy proof_insert on storage.objects;
create policy proof_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proof'
    and (select public.proof_upload_quota_ok())
    and (
      (
        (storage.foldername(name))[1] = 'task'
        and (storage.foldername(name))[2] = (select auth.uid())::text
        and (select public.is_invited())
      )
      or (
        (storage.foldername(name))[1] = 'resolution'
        and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
        and public.can_resolve_market(((storage.foldername(name))[2])::uuid)
      )
    )
  );

-- Rolling-day cap on avatar uploads (0038's policy had none). A photo change is one upload, so 10 is
-- generous. Checked per insert, so parallel uploads can slightly overshoot; the daily sweep collects
-- whatever isn't referenced.
create function public.avatar_upload_quota_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 10
  from storage.objects o
  where o.bucket_id = 'avatars'
    and o.owner_id = auth.uid()::text
    and o.created_at > now() - interval '1 day'
$$;

revoke execute on function public.avatar_upload_quota_ok() from public, anon;
grant execute on function public.avatar_upload_quota_ok() to authenticated, service_role;

drop policy avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_invited())
    and (select public.avatar_upload_quota_ok())
  );

-- security definer, so the answer doesn't depend on which attachment rows the caller's own RLS shows
-- (a resolver who has since been removed can't see the resolution's rows).
create function public.proof_is_attached(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.proof_attachments a where a.storage_path = p_name)
$$;

revoke execute on function public.proof_is_attached(text) from public, anon;
grant execute on function public.proof_is_attached(text) to authenticated, service_role;

-- A failed submit or resolve deletes the files it had just uploaded; a file a submission holds stays.
drop policy proof_delete_own on storage.objects;
create policy proof_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'proof'
    and owner_id = (select auth.uid())::text
    and not (select public.proof_is_attached(name))
  );

-- ─── Per-submission cap ───────────────────────────────────────────────────────

create or replace function public.record_proof(p_items jsonb, p_prefix text, p_completion_id uuid, p_resolution_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_kind text;
  v_path text;
  v_size bigint;
  v_files integer := 0;
  v_bytes bigint := 0;
  v_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'attachments must be a list';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 5 then
    raise exception 'add at most 5 attachments';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_kind := v_item ->> 'kind';
    if v_kind = 'link' then
      if coalesce(v_item ->> 'url', '') !~* '^https?://' then
        raise exception 'links must start with http:// or https://';
      end if;
      insert into public.proof_attachments (task_completion_id, resolution_id, kind, url, created_by)
      values (p_completion_id, p_resolution_id, 'link', v_item ->> 'url', auth.uid());
    elsif v_kind in ('image', 'file') then
      v_path := v_item ->> 'storage_path';
      if v_path is null or left(v_path, char_length(p_prefix)) <> p_prefix or v_path like '%..%' then
        raise exception 'that file can''t be attached here';
      end if;
      -- One object, one attachment: retention of one row would otherwise delete another's file.
      if exists (select 1 from public.proof_attachments a where a.storage_path = v_path) then
        raise exception 'that file is already attached';
      end if;
      select coalesce((o.metadata ->> 'size')::bigint, 0) into v_size
      from storage.objects o where o.bucket_id = 'proof' and o.name = v_path;
      if not found then
        raise exception 'an attachment didn''t finish uploading; try again';
      end if;
      v_files := v_files + 1;
      v_bytes := v_bytes + v_size;
      if v_files > 3 then
        raise exception 'add at most 3 photos or files';
      end if;
      if v_bytes > 6291456 then
        raise exception 'those files are over 6 MB together';
      end if;
      insert into public.proof_attachments (task_completion_id, resolution_id, kind, storage_path, file_name, size_bytes, created_by)
      values (
        p_completion_id, p_resolution_id, v_kind, v_path,
        left(coalesce(v_item ->> 'file_name', 'attachment'), 200),
        nullif(v_item ->> 'size_bytes', '')::integer,
        auth.uid()
      );
    else
      raise exception 'unknown attachment kind';
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Backs the check above and stops a double attachment even from a concurrent call. Created only when
-- the existing rows hold no duplicate (record_proof never refused one before), so the migration can't
-- fail; the check in record_proof covers the rest.
do $$
begin
  if not exists (
    select 1 from public.proof_attachments where storage_path is not null group by storage_path having count(*) > 1
  ) then
    create unique index proof_attachments_storage_path_key on public.proof_attachments (storage_path) where storage_path is not null;
  end if;
end $$;

-- The retention query's candidates: attachments with a file not yet expired.
create index proof_attachments_unexpired_idx on public.proof_attachments (created_at) where expired_at is null and storage_path is not null;

-- ─── Retention ────────────────────────────────────────────────────────────────

-- Files of a task submission reviewed (approved or rejected) over p_task_days ago, or of a resolution
-- over p_resolution_days old. A pending submission's proof never expires. The daily cron removes the
-- objects through the Storage API, then marks the rows.
create function public.expired_proof_attachments(p_task_days integer default 30, p_resolution_days integer default 90, p_limit integer default 500)
returns table (id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.storage_path
  from public.proof_attachments a
  left join public.task_completions c on c.id = a.task_completion_id
  left join public.market_resolutions r on r.id = a.resolution_id
  where a.expired_at is null
    and a.storage_path is not null
    and (
      (c.status in ('approved', 'rejected') and c.reviewed_at < now() - make_interval(days => p_task_days))
      or r.resolved_at < now() - make_interval(days => p_resolution_days)
    )
  order by a.created_at
  limit p_limit
$$;

create function public.mark_proof_expired(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.proof_attachments set expired_at = now() where id = any (p_ids) and expired_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Avatar files no profile points at (a failed remove on replace, a deleted member), once a day old so
-- an upload still waiting for update_my_profile isn't taken.
create function public.stray_avatar_objects(p_limit integer default 500)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'avatars'
    and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.profiles p where p.avatar_path = o.name)
  order by o.created_at
  limit p_limit
$$;

create function public.storage_usage()
returns table (bucket_id text, objects bigint, bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, count(*), coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o
  group by o.bucket_id
$$;

revoke execute on function public.expired_proof_attachments(integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.mark_proof_expired(uuid[]) from public, anon, authenticated;
revoke execute on function public.stray_avatar_objects(integer) from public, anon, authenticated;
revoke execute on function public.storage_usage() from public, anon, authenticated;
grant execute on function public.expired_proof_attachments(integer, integer, integer) to service_role;
grant execute on function public.mark_proof_expired(uuid[]) to service_role;
grant execute on function public.stray_avatar_objects(integer) to service_role;
grant execute on function public.storage_usage() to service_role;

commit;
