# DwellDule

**Status:** Foundation complete — Google sign-in (invite-only), a single
admin account, and a coin ledger. No betting features yet.

## Stack

Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres, auth,
storage), deployed on Vercel.

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
- After your own first sign-in, flip your profile row's `is_admin` to
  `true` once, by hand, via the Supabase dashboard's SQL editor, keyed off
  the verified `auth.users` record rather than the app-writable
  `profiles.email` column:
  `update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@gmail.com');`

## CI (`.github/workflows/ci.yml`)

Every push to `main` and every pull request: lint, the Vitest suite, a
production build, and the Playwright suite — all against an ephemeral local
Supabase instance, never a hosted database. No Supabase project or Vercel
deployment is wired up yet; those get added once the app has a data model
worth deploying.
