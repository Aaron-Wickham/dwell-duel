-- service_role is meant to have full, unrestricted backend access and
-- bypass RLS entirely (rolbypassrls) -- but table-level GRANT is a
-- completely separate privilege layer from RLS bypass, and every
-- migration so far relied on it being granted implicitly. That's
-- version-dependent, not a guarantee: confirmed directly that local
-- Supabase CLI 2.117.0's bootstrap grants service_role table access on
-- newly created tables automatically, while CLI 2.115.0 -- what this
-- project's CI pins, matching platinum-club's own pin -- does not. Every
-- DB test in this suite has been passing locally only because the local
-- dev CLI happened to be on the newer version; CI caught the real gap.
--
-- Never depend on implicit, platform/version-specific default privileges
-- for the one role that must always have full access. Grant it
-- explicitly instead, so behavior is deterministic regardless of CLI
-- version or how a given Supabase project was originally provisioned.
grant all on public.profiles, public.allowed_emails, public.coin_transactions to service_role;

grant execute on function public.is_invited() to service_role;
grant execute on function public.is_admin() to service_role;
grant execute on function public.apply_coin_transaction(uuid, integer, text, jsonb) to service_role;
