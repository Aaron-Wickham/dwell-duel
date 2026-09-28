-- Proof for task submissions (#37) and market resolutions (#38).
--
-- Tasks: a member can add a note, photos, files and links when submitting.
-- An admin can mark a task "proof required", which then needs at least one
-- photo, file or link. Only the member and reviewers can see it.
--
-- Resolutions: resolving or overriding a market now needs a note saying why,
-- and can carry photos, files and links. Every member can see it.
--
-- Files live in one private `proof` bucket and are shown through short-lived
-- signed URLs, so the storage policies below decide who can read what:
--   task/<member id>/<uuid>/<file>          the member and reviewers
--   resolution/<market id>/<uuid>/<file>    every invited member
-- Uploads go straight from the browser to storage (a server action's body
-- is capped at 1MB), and the RPCs then check every path they're given is the
-- caller's own and really exists before recording it.
--
-- One explicit transaction, like 0034-0041; an abort applies nothing, and
-- the Deploy Production Database workflow can simply be re-run.
begin;
set local lock_timeout = '5s';

alter table public.tasks add column proof_required boolean not null default false;
-- Admins write tasks through column grants (0022), so the new flag needs its own.
grant insert (proof_required), update (proof_required) on public.tasks to authenticated;
alter table public.task_completions add column note text check (char_length(note) <= 500);
alter table public.market_resolutions add column note text check (char_length(note) <= 1000);

create table public.proof_attachments (
  id uuid primary key default gen_random_uuid(),
  task_completion_id uuid references public.task_completions (id) on delete cascade,
  resolution_id uuid references public.market_resolutions (id) on delete cascade,
  kind text not null check (kind in ('image', 'file', 'link')),
  storage_path text,
  url text check (url ~* '^https?://' and char_length(url) <= 2000),
  file_name text check (char_length(file_name) <= 200),
  size_bytes integer check (size_bytes >= 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (num_nonnulls(task_completion_id, resolution_id) = 1),
  check ((kind = 'link') = (url is not null)),
  check ((kind = 'link') = (storage_path is null))
);

create index proof_attachments_task_completion_idx on public.proof_attachments (task_completion_id) where task_completion_id is not null;
create index proof_attachments_resolution_idx on public.proof_attachments (resolution_id) where resolution_id is not null;
create index proof_attachments_created_by_idx on public.proof_attachments (created_by);

alter table public.proof_attachments enable row level security;

-- Written only through the two RPCs below.
create policy select_proof_attachments on public.proof_attachments for select to authenticated
  using (
    (
      task_completion_id is not null
      and exists (
        select 1 from public.task_completions c
        where c.id = task_completion_id
          and (c.profile_id = (select auth.uid()) or (select has_role('reviewer')))
      )
    )
    or (resolution_id is not null and (select is_invited()))
  );

revoke all on public.proof_attachments from public, anon, authenticated, service_role;
grant select on public.proof_attachments to authenticated;
grant all on public.proof_attachments to service_role;

-- ─── Storage ──────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proof', 'proof', false, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf', 'text/plain', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Who may resolve a market right now, for the upload policy: its creator
-- while it's open, or an admin. resolve_market still makes the final call
-- (a creator must also wait for close_at).
create function public.can_resolve_market(p_market_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.markets m
    where m.id = p_market_id and m.created_by = auth.uid() and m.status = 'open'
  )
$$;

revoke execute on function public.can_resolve_market(uuid) from public, anon;
grant execute on function public.can_resolve_market(uuid) to authenticated, service_role;

-- The folder's second segment is only cast to a uuid once it looks like one,
-- so a stray path is refused rather than erroring the whole policy.
create policy proof_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proof'
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

create policy proof_select on storage.objects for select to authenticated
  using (
    bucket_id = 'proof'
    and (
      (
        (storage.foldername(name))[1] = 'task'
        and ((storage.foldername(name))[2] = (select auth.uid())::text or (select public.has_role('reviewer')))
      )
      or ((storage.foldername(name))[1] = 'resolution' and (select public.is_invited()))
    )
  );

-- A failed submit or resolve deletes the files it had just uploaded.
create policy proof_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'proof' and owner_id = (select auth.uid())::text);

-- ─── Recording attachments ────────────────────────────────────────────────────

-- p_items: [{kind: image|file|link, storage_path?, url?, file_name?, size_bytes?}].
-- Every file must sit under p_prefix and already be in the bucket; links must
-- be http(s). Returns how many were recorded.
create function public.record_proof(p_items jsonb, p_prefix text, p_completion_id uuid, p_resolution_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_kind text;
  v_path text;
  v_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'attachments must be a list';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 10 then
    raise exception 'add at most 10 attachments';
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
      if not exists (select 1 from storage.objects o where o.bucket_id = 'proof' and o.name = v_path) then
        raise exception 'an attachment didn''t finish uploading; try again';
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

revoke execute on function public.record_proof(jsonb, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_proof(jsonb, text, uuid, uuid) to service_role;

-- ─── submit_task_completion, with a note and proof ──────────────────────────
-- The same as 0019 plus the note and attachments. The old one-argument
-- signature goes; callers that pass only the task still work through the
-- defaults.
drop function public.submit_task_completion(uuid);

create function public.submit_task_completion(p_task_id uuid, p_note text default null, p_attachments jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task record;
  v_period_key text;
  v_completion_id uuid;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  select reward_amount, period, is_active, proof_required
    into v_task
  from public.tasks
  where id = p_task_id;

  if not found or not v_task.is_active then
    raise exception 'task not found or inactive';
  end if;

  if v_task.proof_required and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then
    raise exception 'this task needs proof: add a photo, file or link';
  end if;

  v_period_key := public.compute_period_key(v_task.period);

  begin
    insert into public.task_completions (task_id, profile_id, status, reward_amount, period_key, note)
    values (p_task_id, auth.uid(), 'pending', v_task.reward_amount, v_period_key, nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_completion_id;
  exception when unique_violation then
    raise exception 'you already have a pending or approved submission for this task in the current period';
  end;

  perform public.record_proof(p_attachments, 'task/' || auth.uid()::text || '/', v_completion_id, null);

  return v_completion_id;
end;
$$;

revoke execute on function public.submit_task_completion(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_task_completion(uuid, text, jsonb) to authenticated, service_role;

-- ─── resolve_market, with a required note and proof ─────────────────────────
-- 0041's two-argument function keeps all the resolving logic under a new
-- name nobody but this wrapper can call; the wrapper adds the note rule and
-- records the proof against the resolution it just made.
alter function public.resolve_market(uuid, uuid) rename to resolve_market_core;
revoke execute on function public.resolve_market_core(uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_market_core(uuid, uuid) to service_role;

create function public.resolve_market(p_market_id uuid, p_outcome_id uuid, p_note text, p_attachments jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_resolution_id uuid;
begin
  if v_note is null then
    raise exception 'say why this outcome won';
  end if;

  perform public.resolve_market_core(p_market_id, p_outcome_id);

  select current_resolution_id into v_resolution_id from public.markets where id = p_market_id;
  update public.market_resolutions set note = v_note where id = v_resolution_id;

  perform public.record_proof(p_attachments, 'resolution/' || p_market_id::text || '/', null, v_resolution_id);
end;
$$;

revoke execute on function public.resolve_market(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.resolve_market(uuid, uuid, text, jsonb) to authenticated, service_role;

commit;
