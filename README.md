# DwellDuel

**Status:** Foundation + Market Engine + Coin Economy + Admin Controls +
Parlays + Social Layer complete — Google sign-in (invite-only), a single
admin account, a Dwell Coin (DC) ledger, a pari-mutuel betting market, an
admin-managed Bible-study task catalog with approval-gated coin rewards,
admin tooling for manual balance adjustment, a full transaction ledger,
and bulk task-completion review, app-backed parlays (2–6 picks, odds
locked at placement, capped at 20×) built from a bet slip, and a social
layer: a balance leaderboard, an activity feed, member profiles, and
every member's bets visible on each market. Live at
[dwellduel.com](https://dwellduel.com).

## Stack

Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres, auth,
storage), deployed on Vercel.

## Production

- **Vercel project** `dwell-duel`, connected to this GitHub repo — every
  merge to `main` auto-deploys.
- **Supabase project** `dwell-duel` (hosted, separate from local dev)
  holds the real data. Merging a change under `supabase/migrations/` to
  `main` runs `.github/workflows/deploy-production-db.yml`, which pushes
  it to production (needs the `SUPABASE_ACCESS_TOKEN` repo secret). It
  runs alongside Vercel's deploy, not before it, so keep migrations
  additive or the new code can briefly hit the old schema. Re-run it
  manually from the Actions tab if a push fails.
- Google's OAuth consent screen is published (not in Testing mode), so
  inviting someone is purely an app-side action — add their email via
  `/admin/invites`, no Google Cloud Console step needed.
- **Gotcha:** `dwellduel.com` 308-redirects to `www.dwellduel.com`, so the
  app actually serves from the `www` host. Supabase's Site URL and
  Redirect URLs must reference `www.dwellduel.com`, not the bare apex —
  a mismatch here makes Google sign-in silently bounce back to `/sign-in`
  with no error, because the OAuth code lands on the (non-`www`) Site URL
  fallback instead of the app's `/callback` route.
- **No dev/staging Supabase project, and Preview deployments are
  disabled on purpose.** There's only one hosted Supabase project — the
  production one — and Vercel's Preview environment has zero credentials
  for it (removed deliberately, not just unset). `commandForIgnoringBuildStep`
  in the Vercel project settings skips every non-production build, so a
  PR never gets a live preview URL at all. This was a deliberate choice
  over adding a second hosted Supabase project: the account's free tier
  caps at 2 projects org-wide, already fully used by another app, and
  paying for Pro or sacrificing that app's own dev project wasn't worth
  it for a live-preview convenience this small a team hasn't needed so
  far (PRs are reviewed via the GitHub diff and CI, not a clicked-through
  preview). Revisit if either constraint changes. Local Docker Supabase
  remains the real dev environment for day-to-day work and every
  automated test — `tests/db/helpers.ts`'s `assertLocal()` refuses to run
  the destructive test suite against anything but `localhost`, so normal
  `npm test` runs can never touch production data.

## Development

Requires Docker (for local Supabase) and Node 22.

```bash
npm install       # install dependencies
npm run db:start  # start local Supabase (Postgres, auth, storage) in Docker
npm run dev       # start the dev server on http://localhost:3000
```

`.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
and `SUPABASE_SERVICE_ROLE_KEY` — take them from `npx supabase status`. See
`.env.local.example`.

### Tests

```bash
npm test          # Vitest suite (unit tests)
npm run test:e2e  # Playwright critical path
npm run lint      # ESLint
npm run build     # production build
```

### One-time manual setup (not app code)

- A Google Cloud OAuth client (web application type), with the Supabase
  project's callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`)
  registered as an authorized redirect URI.
- That client's ID/secret entered into the Supabase dashboard's Auth →
  Providers → Google settings.
- **Required:** in the Supabase dashboard's Auth → Providers settings,
  disable every provider except Google, and disable email/password
  sign-ups. Without this, anyone can obtain a session against the public
  anon key without ever going through the invite-gated Google flow.
- The app's own redirect URLs (`http://localhost:3000/callback` for dev,
  the production URL once deployed) added to Supabase's Auth → URL
  Configuration allowlist.
- **Before your first sign-in:** add your own Gmail address to the invite
  allowlist by hand, via the Supabase dashboard's SQL editor — sign-in is
  invite-gated from the first request, so there's no admin yet to add you
  through the app itself:
  `insert into public.allowed_emails (email) values ('you@gmail.com');`
- After your own first sign-in, flip your profile row's `is_admin` to
  `true` once, by hand, via the Supabase dashboard's SQL editor, keyed off
  the verified `auth.users` record rather than the app-writable
  `profiles.email` column:
  `update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@gmail.com');`

## CI (`.github/workflows/ci.yml`)

Every push to `main` and every pull request: lint, the Vitest suite, a
production build, and the Playwright suite — all against an ephemeral local
Supabase instance, never the hosted production database.
