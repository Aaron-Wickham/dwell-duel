# DwellDule

**Status:** scaffolding — no features yet.

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

## CI (`.github/workflows/ci.yml`)

Every push to `main` and every pull request: lint, the Vitest suite, a
production build, and the Playwright suite — all against an ephemeral local
Supabase instance, never a hosted database. No Supabase project or Vercel
deployment is wired up yet; those get added once the app has a data model
worth deploying.
