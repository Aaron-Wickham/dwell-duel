---
name: new-migration
description: Add a Supabase migration to DwellDuel the way this repo requires — numbered after main's newest, additive, with regenerated types, docs and a changelog line. Use whenever a change needs a schema, function, policy, grant or trigger change in supabase/migrations.
---

# New migration

Migrations apply to production by themselves when the PR merges (Deploy Production workflow), while
the old app is still serving. Everything below follows from that.

1. **Number it.** `git fetch origin`, then take the highest number in `git ls-tree --name-only
   origin/main supabase/migrations/` and add one, zero-padded to four digits:
   `supabase/migrations/00NN_short_description.sql`. If another PR merges that number first,
   renumber (`scripts/check-migration-order.sh` fails CI otherwise).
2. **Never edit a migration that is on main.** The PreToolUse hook refuses it; write a new one.
3. **Keep it additive.** New tables, columns and functions. A drop or a breaking rename ships in its
   own later PR, after the code stops using the old thing.
4. **House rules for SQL** (see AGENTS.md for the full list):
   - `security definer` functions `set search_path = ''` and schema-qualify every name. A
     `language sql` function meant to be inlined stays `security invoker` with no `SET` clause.
   - Gate by role with `has_role('<min>')`; money-moving functions that can be retried take an
     idempotency key through `claim_idempotency_key` / `finish_idempotent`.
   - A new member-entered text column gets a length CHECK plus a `TEXT_LIMITS` entry.
   - A new live table goes in `LIVE_TABLES` and the realtime publication; never a deferred trigger
     on a live table.
   - Since 0109, a new table gets `service_role` read and write by default, in production as
     locally; `tests/db/schema-privileges.test.ts` checks it. A table that must stay read-only
     to the server (like `activity_events`) revokes what it shouldn't have.
5. **Apply and regenerate.** `npm run db:reset`, then
   `npx supabase gen types typescript --local > lib/supabase/database.types.ts` (CI fails when stale).
6. **Test.** Add or extend a test in `tests/db/`; negative cases use `expectError`. Run `npm test`
   and `npm run typecheck`. The ledger check runs after every DB test.
7. **Document in the same PR.** A row in `docs/ARCHITECTURE.md`'s migrations table, any rule change
   in `docs/HOW-IT-WORKS.md`, and a line in `CHANGELOG.md` under `## Unreleased`.
8. **Never push it to production yourself** (`supabase db push` is denied). Merging the PR does it,
   after a backup.
