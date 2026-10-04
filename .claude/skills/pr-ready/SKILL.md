---
name: pr-ready
description: Check the current branch against DwellDuel's "same PR" rules before opening or updating a pull request — docs, changelog, regenerated types, text limits, attempt keys, env vars, migration order and the checks CI runs.
disable-model-invocation: true
---

# PR ready?

Report what's missing; don't fix anything unless asked.

1. **Get the diff.** `git fetch origin`, then `git diff --stat origin/main...HEAD` and
   `git diff origin/main...HEAD` (plus uncommitted changes from `git status`). If the branch is
   behind main, say so (`gh pr update-branch <n>` once it's a PR).
2. **Walk the checklist.** For each item, answer ✅, ❌ (with the file and what to add) or n/a:
   - **Changelog.** Any user-visible or infra change has a line under `## Unreleased` in
     `CHANGELOG.md`, under the right heading (Security, Features, Fixes, Polish, Under the hood,
     Tests), with the issue number.
   - **Architecture.** A new route, table, column, function, live source, env var or folder appears
     in `docs/ARCHITECTURE.md` (Routes, Data model, functions that move coins, Migrations table, live
     budget).
   - **Rules.** A change to odds, payouts, parlays, tasks, roles or anything members see is true in
     `docs/HOW-IT-WORKS.md`.
   - **Migrations.** Numbered after main's newest (`scripts/check-migration-order.sh`), additive,
     none on main edited; `lib/supabase/database.types.ts` regenerated in the same diff; a DB test
     added or extended, negatives using `expectError`.
   - **Text columns.** A new member-entered text column has a length CHECK, a `TEXT_LIMITS` entry,
     `maxLength` on its input and a `tooLong` check in its action.
   - **Actions.** A new action that creates something sends a `useAttemptKey` key; one that moves
     coins goes through `claim_idempotency_key` / `finish_idempotent`, confirms first, and isn't
     optimistic.
   - **Env vars.** A new required variable is in `lib/env/required.ts` and `.env.local.example`;
     a production-only one is flagged for Aaron to set in Vercel *before* merge.
   - **CSP.** A new external origin is in `next.config.ts`.
   - **Routes.** A new `(app)` section is in `lib/auth/app-paths.ts`; a drill-down has its parent in
     `lib/nav/back-swipe.ts`; the route has `loading.tsx` or a streamed Suspense.
   - **Live.** New subscriptions are filtered or topics, in `pageSubscriptions`; a new live table or
     topic has its migration.
   - **AGENTS.md block.** The diff doesn't touch the `next dev` block at the top of AGENTS.md.
3. **Run the checks CI runs** (in parallel where you can): `npm run lint`, `npm run typecheck`,
   `npx vitest run --project unit`. Run `npx vitest run --project db` only if local Supabase is up
   (`npx supabase status`) and the diff touches SQL or `lib/` data code. Say which you skipped.
4. **Review the risky parts.** If the diff touches `supabase/migrations/`, `lib/markets/`,
   `lib/parlays/` or the slip, dispatch the `money-path-reviewer` agent; for UI or data-layer code,
   the `conventions-reviewer` agent. Run them in parallel.
5. **Report** a short list: what's missing, what failed, and what the reviewers found, most
   serious first. End with "Ready" only if nothing is ❌ and every check passed.
