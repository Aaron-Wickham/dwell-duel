# DwellDule

**Status:** Foundation + Market Engine complete — Google sign-in
(invite-only), a single admin account, a Dwell Coin (DC) ledger, and a
pari-mutuel betting market (create, bet, resolve, admin override). Live at
[dwelldule.com](https://dwelldule.com).

## Stack

Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres, auth,
storage), deployed on Vercel.

## Production

- **Vercel project** `dwelldule`, connected to this GitHub repo — every
  merge to `main` auto-deploys.
- **Supabase project** `dwelldule` (hosted, separate from local dev)
  holds the real data. New migrations need `supabase link --project-ref
  <ref>` once, then `supabase db push` after each merge.
- Google's OAuth consent screen is published (not in Testing mode), so
  inviting someone is purely an app-side action — add their email via
  `/admin/invites`, no Google Cloud Console step needed.
- **Gotcha:** `dwelldule.com` 308-redirects to `www.dwelldule.com`, so the
  app actually serves from the `www` host. Supabase's Site URL and
  Redirect URLs must reference `www.dwelldule.com`, not the bare apex —
  a mismatch here makes Google sign-in silently bounce back to `/sign-in`
  with no error, because the OAuth code lands on the (non-`www`) Site URL
  fallback instead of the app's `/callback` route.

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
