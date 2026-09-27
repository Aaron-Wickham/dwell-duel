-- Preflight: NOT VALID only skips validating existing rows at migration time --
-- it still binds every later UPDATE, so a row already over a new limit would
-- start failing on its very next update in production, on whichever column
-- that update touches, with no warning until it happened. This counts rows
-- over each new limit before any constraint exists below, and raises if it
-- finds any; the whole migration is one transaction, so a raise here leaves
-- the database untouched instead of applying half the limits.
do $$
declare
  parts text[] := '{}';
  n integer;
begin
  select count(*) into n from public.markets where char_length(title) > 120;
  if n > 0 then parts := parts || format('markets.title: %s', n); end if;

  select count(*) into n from public.markets where char_length(description) > 1000;
  if n > 0 then parts := parts || format('markets.description: %s', n); end if;

  select count(*) into n from public.market_outcomes where char_length(label) > 60;
  if n > 0 then parts := parts || format('market_outcomes.label: %s', n); end if;

  select count(*) into n from public.tasks where char_length(title) > 120;
  if n > 0 then parts := parts || format('tasks.title: %s', n); end if;

  select count(*) into n from public.tasks where char_length(description) > 1000;
  if n > 0 then parts := parts || format('tasks.description: %s', n); end if;

  select count(*) into n from public.task_completions where char_length(review_note) > 500;
  if n > 0 then parts := parts || format('task_completions.review_note: %s', n); end if;

  select count(*) into n from public.allowed_emails where char_length(email) > 254;
  if n > 0 then parts := parts || format('allowed_emails.email: %s', n); end if;

  select count(*) into n from public.profiles where char_length(display_name) > 80;
  if n > 0 then parts := parts || format('profiles.display_name: %s', n); end if;

  if array_length(parts, 1) > 0 then
    raise exception '0034: rows already over the new length limits — %. Shorten them before applying.', array_to_string(parts, ', ');
  end if;
end;
$$;

-- Length limits on member-entered text. lib/forms/limits.ts holds the same
-- numbers, so the forms explain a limit before the database has to refuse it.
--
-- NOT VALID: every insert and update from now on is checked, but existing rows
-- aren't, so this migration can't fail on production data nobody has
-- inspected. A null in a nullable column passes.
alter table public.markets
  add constraint markets_title_length check (char_length(title) <= 120) not valid;
alter table public.markets
  add constraint markets_description_length check (char_length(description) <= 1000) not valid;
alter table public.market_outcomes
  add constraint market_outcomes_label_length check (char_length(label) <= 60) not valid;
alter table public.tasks
  add constraint tasks_title_length check (char_length(title) <= 120) not valid;
alter table public.tasks
  add constraint tasks_description_length check (char_length(description) <= 1000) not valid;
alter table public.task_completions
  add constraint task_completions_review_note_length check (char_length(review_note) <= 500) not valid;
alter table public.allowed_emails
  add constraint allowed_emails_email_length check (char_length(email) <= 254) not valid;
alter table public.profiles
  add constraint profiles_display_name_length check (char_length(display_name) <= 80) not valid;

-- The balance-adjust reason is stored in the ledger's meta JSON, not a text
-- column, so the function enforces its limit. Identical to 0024 apart from the
-- length check; create or replace keeps its grants.
create or replace function public.adjust_balance(p_profile_id uuid, p_amount integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can adjust a balance';
  end if;

  if p_amount = 0 then
    raise exception 'adjustment amount must not be zero';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required for a balance adjustment';
  end if;

  if char_length(p_reason) > 200 then
    raise exception 'reason too long';
  end if;

  perform public.apply_coin_transaction(
    p_profile_id, p_amount, 'admin_adjustment',
    jsonb_build_object('reason', p_reason, 'adjusted_by', auth.uid())
  );
end;
$$;
