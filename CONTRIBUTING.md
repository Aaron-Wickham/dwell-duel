# Contributing to DwellDuel

Thanks for helping. DwellDuel is a small, invite-only app, and every merge to
`main` deploys straight to production, so changes go through a pull request.

## How changes get in

1. **Branch** from `main`. Nobody can push to `main` directly.
2. **Build it** following [AGENTS.md](AGENTS.md), the conventions every change
   follows. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the app
   fits together.
3. **Test it locally** (see the [README](README.md#development)): `npm test`,
   `npm run test:e2e`, `npm run lint`.
4. **Open a pull request** using the template. Link the issue it closes.
5. **Merging needs:**
   - an approval from [@Aaron-Wickham](https://github.com/Aaron-Wickham)
     (the code owner). A new push after approval asks for a fresh review.
   - CI's `test` check passing (lint, unit and DB tests, build, e2e);
   - every review conversation resolved.
6. Once it's merged, the **Deploy Production** workflow applies any new
   migrations, then deploys the app through Vercel.

## Rules of thumb

- Keep a PR to one change, and update `docs/` and `CHANGELOG.md` with it.
- Coin-moving logic belongs in a Postgres function (a migration), never in
  the web app.
- Never commit secrets. `.env.local` is ignored; copy `.env.local.example`
  to `.env.local` and fill it in from `npx supabase status`.
