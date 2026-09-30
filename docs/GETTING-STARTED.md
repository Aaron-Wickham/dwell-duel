# Getting started on DwellDuel

Everything you need to go from a fresh Mac to a running local app, a green
test suite and your first pull request. Budget about 30 minutes, most of it
waiting on downloads.

DwellDuel is an invite-only prediction-market app for a church friend group.
Members bet play-money **Dwell Coin (DC)** on friendly markets and earn it
through Bible-study tasks. It's live at [www.dwellduel.com](https://www.dwellduel.com),
and **every merge to `main` deploys straight to production**, so the workflow
below is deliberately careful.

**The stack in one line:** Next.js 16 (App Router, React 19) · TypeScript ·
Tailwind v4 · Supabase (Postgres, Auth, Realtime, Storage) · Vercel · Vitest ·
Playwright. All coin-moving logic lives in Postgres functions; the web app
renders, validates and calls them.

---

## 1. Install the tools

| Tool | Version | Install |
|---|---|---|
| **Node** | 22 (see `.nvmrc`; `engines.node` pins Vercel to it) | `brew install nvm` then `nvm install 22`, or [nodejs.org](https://nodejs.org) |
| **Docker Desktop** | any current | [docker.com](https://www.docker.com/products/docker-desktop/). Local Supabase runs in Docker; it must be **running** before `npm run db:start`. |
| **Supabase CLI** | 2.117.0 (what CI and deploys use) | `brew install supabase/tap/supabase` |
| **GitHub CLI** (optional, handy) | any | `brew install gh` then `gh auth login` |

Check them:

```bash
node --version && docker --version && supabase --version
```

## 2. Clone and install

```bash
git clone https://github.com/Aaron-Wickham/dwell-duel.git
cd dwell-duel
npm install
```

If you use nvm, `nvm use` picks up Node 22 from `.nvmrc`.

## 3. Start the local database

Local Supabase (Postgres, Auth, Storage, Realtime) runs in Docker. It is the
**only** dev and test database. There is no staging, and nothing you do here
can touch production.

```bash
npm run db:start   # first run pulls images: a few minutes
npm run db:reset   # applies every migration in supabase/migrations/ to a fresh DB
```

Useful local URLs once it's up:

| What | Where |
|---|---|
| Supabase Studio (browse tables, run SQL) | http://127.0.0.1:54323 |
| API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Stop it later with `npx supabase stop` (data is kept) or reset it any time
with `npm run db:reset` (data is wiped).

## 4. Environment variables

```bash
cp .env.local.example .env.local
npx supabase status
```

Fill in the three required values in `.env.local` from that status output:

| `.env.local` | from `supabase status` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `Publishable key` |
| `SUPABASE_SECRET_KEY` | `Secret key` |

Leave the two VAPID (push notification) variables blank: locally, sending
is a no-op and Settings just says notifications aren't available.

`.env.local` is git-ignored. Never commit secrets. The server refuses to boot
if a required variable is missing (`lib/env/required.ts`), so a blank screen
on start usually means this step.

## 5. Run the app

```bash
npm run dev
```

Open http://localhost:3000. You'll land on the sign-in page.

### Signing in locally

The app signs in with Google only. Local Supabase is a separate Auth
instance with its own empty database, so your dwellduel.com account, invite
and role don't carry over. You set up Google sign-in against local Supabase
once, with **your own** Google OAuth client. Nothing here touches production
or needs anyone else's secrets.

**1. Create an OAuth client (about 5 minutes).** In
[Google Cloud Console](https://console.cloud.google.com/apis/credentials),
on any project (a new personal one is fine):

1. Configure the OAuth consent screen if asked (External, your email as the
   test user is enough).
2. Create credentials › **OAuth client ID** › **Web application**.
3. Under **Authorised redirect URIs**, add exactly:
   `http://127.0.0.1:54321/auth/v1/callback`
4. Copy the client ID and client secret.

**2. Give them to local Supabase.** Create `supabase/.env` (git-ignored, and
separate from `.env.local`, because the Supabase CLI reads this one):

```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=your-secret
```

`supabase/config.toml` already enables the Google provider and allows the
`http://localhost:3000/callback` redirect, so there's nothing to edit. Restart
the stack so Auth picks the values up:

```bash
npx supabase stop && npm run db:start && npm run db:reset
```

**3. Invite yourself.** The local database starts empty after every
`db:reset`, so this is repeated after one. Open Studio's SQL editor
(http://127.0.0.1:54323) and run:

```sql
insert into public.allowed_emails (email) values ('you@gmail.com');
```

Use the same Google account you sign in with. Then go to
http://localhost:3000, tap **Sign in with Google**, and you land on the home
page. Back in the SQL editor, make yourself the owner so every page,
including Admin, is reachable:

```sql
update public.profiles set role = 'owner'
where id = (select id from auth.users where email = 'you@gmail.com');
```

**If sign-in bounces back to `/sign-in`:** check the redirect URI in Google
matches step 1 character for character, that `supabase/.env` has both values
and the stack was restarted after adding them, and that you ran the invite
insert with the email you're signing in with.

**Shortcut for quick UI checks: borrow the e2e session.** The Playwright
global setup writes an owner session ("Alice") to `e2e/.auth/session.json`
(`npx playwright test e2e/brand.spec.ts` creates it; stop `npm run dev`
first). Copy each cookie's name and value into DevTools › Application ›
Cookies for `http://localhost:3000`. Every `db:reset` and e2e run
invalidates it, so use real sign-in for anything longer than a glance.

### Getting some data to look at

A fresh database is empty. Create markets and tasks from the app as an owner,
or run the scale seeder for a realistic load (500 members, 200 markets,
20,000 bets):

```bash
node scripts/seed-scale.mjs
```

It only ever writes to a local database. Run `npm run db:reset` before the DB
test suite afterwards.

## 6. Run the tests

CI runs all of these on every PR, so run them before you push.

```bash
npm run lint       # ESLint, zero warnings allowed
npm run typecheck  # next typegen + tsc
npm test           # Vitest: unit + component tests, then DB tests against local Supabase
npm run test:e2e   # Playwright: builds and serves on :3000 (free that port first)
```

Faster loops:

```bash
npx vitest run --project unit          # only tests that don't need the database
npx vitest run --project db            # only the DB tests (run npm run db:reset first)
npx vitest run tests/db/place-bet      # one file
npm run test:watch                     # watch mode
npx playwright test e2e/parlays.spec.ts   # one e2e spec
npx playwright test --ui               # Playwright's UI runner
```

First time only, Playwright needs its browser:

```bash
npx playwright install chromium
```

**Gotchas**

- DB tests wipe the local database between files and refuse to run against
  anything but `localhost`. Run `npm run db:reset` before them.
- If DB tests fail on file uploads with `42P10`, the local Storage service
  holds stale state after a reset. Fix: `npx supabase stop && npx supabase start`.
- `npm run test:e2e` starts its own production server on port 3000. Kill a
  running `npm run dev` first.
- **One local database per machine.** Every checkout and git worktree talks
  to the same Docker Supabase, and the DB tests wipe it between files. Two
  test runs at once, or a `db:reset` during a run, fail hundreds of tests with
  errors like "Could not find the 'role' column of 'profiles' in the schema
  cache". Run one thing at a time, and if it still fails, restart the stack
  and reset once more before digging in.
- The e2e suite runs serially on purpose (one shared seeded session); it
  takes about a minute.

## 7. Read these before writing code

In this order. They're short and they'll save you a review round-trip.

1. **[AGENTS.md](../AGENTS.md)**: the conventions every change follows. UI
   tokens, `<Page>` and `SectionCard`, controlled forms, confirm-before-money,
   skeletons, pagination, live tables, roles, migrations. Reviews check
   against this.
2. **[ARCHITECTURE.md](ARCHITECTURE.md)**: routes, code layout, the data
   model, the Postgres functions that move coins, and the key flows.
3. **[HOW-IT-WORKS.md](HOW-IT-WORKS.md)**: the rules members see. Odds,
   payouts and parlay maths there must stay true, so any rule change updates
   it.
4. **[design/app-redesign-handoff.md](design/app-redesign-handoff.md)**: the
   visual source of truth for UI work.
5. **[CONTRIBUTING.md](../CONTRIBUTING.md)**: how changes get in.

Also note: `node_modules/next/dist/docs/` documents **this** version of
Next.js (16), which differs from older tutorials and from what an AI
assistant may assume. Read the relevant guide there before writing
Next-specific code.

### The map

```
app/(app)/        signed-in routes (home, markets, bets, tasks, feed, members, admin, settings)
app/(auth)/       sign-in, callback, not-invited, offline
app/api/cron/     keep-alive and closing-alerts endpoints
components/       ui/ (Page, SectionCard, Button, dialogs…), brand/, live/, and feature components
lib/              server actions, Supabase clients, odds maths, pagination, auth, forms
supabase/         migrations/ (0001…0064) and config.toml
tests/            Vitest: unit, component (tests/components), and DB tests (tests/db)
e2e/              Playwright specs
docs/             everything you're reading, plus dated specs and plans in superpowers/
scripts/          favicons, iOS splash, iOS standalone check, scale seeder
```

## 8. Pick up an issue

- **Issues:** https://github.com/Aaron-Wickham/dwell-duel/issues. Look for
  `good first issue` and `help wanted`. Labels tell you the area
  (`ui`, `parlays`, `tasks`, `economy`, `database` means a migration is needed,
  `needs-design` means draw it before building).
- **Board:** the "DwellDuel" GitHub project tracks what's in flight. Move
  your issue to In progress when you start.
- **Comment on the issue** before starting so we don't both pick it up.

## 9. Ship a change

Nobody can push to `main`. Everything goes through a PR.

```bash
git checkout main && git pull
git checkout -b 123-short-description     # issue number first, like the existing branches
# ...build it, following AGENTS.md...
npm run lint && npm run typecheck && npm test && npm run test:e2e
git push -u origin 123-short-description
gh pr create --fill                       # or open one on GitHub; the template fills in
```

**The PR template asks for:** a summary grouped by area, whether there's a
migration, the tests you ran, a light/dark and phone/desktop check for UI
changes, and which docs you updated.

**Every change also updates:**

- `CHANGELOG.md`, a line under `## Unreleased`.
- `docs/ARCHITECTURE.md` or `docs/HOW-IT-WORKS.md` when you add a feature,
  route, table or rule.
- `AGENTS.md` when you add a convention.

**Merging needs:** CI's `test` check green, an approval from Aaron (the code
owner; a new push after approval asks for a fresh review), and every review
conversation resolved. On merge, the Deploy Production workflow applies any
new migrations and then deploys through Vercel. There is no undo button, so
the checklist matters.

### If your change needs a migration

- Add a new file `supabase/migrations/00NN_description.sql`, next number in
  sequence, zero-padded. **Never edit a past migration.**
- Keep it **additive** (new tables, columns, functions). The old app keeps
  serving while a migration applies. A destructive change ships in its own PR
  after the code stops using it.
- Apply and regenerate the types, then commit the generated file. CI fails
  if it's stale:
  ```bash
  npm run db:reset
  npx supabase gen types typescript --local > lib/supabase/database.types.ts
  ```
- Gate new SQL with `has_role('<min>')` and test it in `tests/db/`.

### Checking the installed iPhone app

Layout bugs in the Home Screen web app don't show in Safari. If you touch the
shell (tab bar, launch overlay, page height), run `npm run check:ios` on a
booted iOS Simulator with the app installed. `docs/ARCHITECTURE.md`
(Environments and deploys) explains the setup.

## 10. Who to ask

**Aaron Wickham** ([@Aaron-Wickham](https://github.com/Aaron-Wickham)) owns
the repo, the production Supabase project and the Vercel project. Anything involving production, secrets, inviting members or the
design canvas goes through him. For everything else, the issue thread is the
place to talk.

## Quick reference

```bash
npm run dev            # dev server on :3000
npm run db:start       # start local Supabase (Docker must be running)
npm run db:reset       # wipe + re-migrate local DB
npx supabase status    # local URLs and keys
npx supabase stop      # stop local Supabase
npm test               # all Vitest (unit + DB)
npm run test:e2e       # Playwright (needs :3000 free)
npm run lint           # ESLint
npm run typecheck      # TypeScript
npm run build          # production build
npm run check:ios      # installed-app viewport check in the iOS Simulator
node scripts/seed-scale.mjs   # ~10x realistic local data
```
