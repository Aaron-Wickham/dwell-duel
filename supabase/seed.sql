-- Local and CI databases only (supabase db reset / supabase start); production is never seeded.
-- The tests sign members in with magic links, the email provider, which is_invited() refuses
-- unless this flag is set (0112).
insert into public.app_flags (key) values ('allow_email_sign_in') on conflict do nothing;
