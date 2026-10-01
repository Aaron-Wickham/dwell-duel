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

## Your first week

A path for a new collaborator. Each step links to the section with the
details.

1. **Day 1: run it.** Install the tools, start local Supabase, sign in
   and run the tests ([sections 1–6](#1-install-the-tools)). Seed some data
   with the scale seeder so the pages have something on them.
2. **Day 2: tour the code.** Read [AGENTS.md](../AGENTS.md), then
   [ARCHITECTURE.md](ARCHITECTURE.md) with the app open beside it, following
   one flow end to end: tap Place in the slip, find `place_slip_v2` in
   `supabase/migrations/`, and its test in `tests/db/place-slip.test.ts`
   ([section 7](#7-read-these-before-writing-code)). Read
   [HOW-IT-WORKS.md](HOW-IT-WORKS.md) as a member would.
3. **Day 3: pick something small.** Ask Aaron for an issue
   ([section 8](#8-pick-up-an-issue)), comment on it to claim it, and branch.
4. **Days 3–5: ship it.** Build it to the conventions, test it (for anything
   that moves coins, see [Testing money paths](#testing-money-paths)), open
   the PR and work through review and CI until it merges
   ([section 9](#9-ship-a-change)).

[Working as a collaborator](#10-working-as-a-collaborator) explains what your
access lets you do and what it doesn't, and the [glossary](#glossary) the
words the code and the docs use.

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
- **One local database per machine.** Docker runs one Supabase, on fixed
  ports, and every checkout and git worktree on the machine talks to that
  same one. The DB tests wipe it between files, and `db:reset` rebuilds it
  from the migrations of whichever checkout ran it. So two test runs at once,
  or a `db:reset` from another branch during a run, fail hundreds of tests
  with errors like "Could not find the 'role' column of 'profiles' in the
  schema cache". Run one database thing at a time, run `npm run db:reset`
  from the checkout you're testing before its DB tests, and if it still
  fails, restart the stack and reset once more before digging in.
- The e2e suite runs serially on purpose (one shared seeded session); it
  takes a few minutes. Run one spec while you work and the whole suite
  before you push.

### Working in more than one checkout

To keep a second branch going without stashing, add a git worktree:

```bash
git worktree add ../dwell-duel-123 -b 123-short-description origin/main
cd ../dwell-duel-123
npm install
cp ../dwell-duel/.env.local .env.local   # the same local keys: it's the same local Supabase
```

Each worktree is its own folder with its own `node_modules` and `.next`,
but they share the one local database (above) and port 3000. Run `npm run
dev -- -p 3001` for a second dev server, and remember that `npm run
test:e2e` always wants 3000. Remove a worktree with `git worktree remove
../dwell-duel-123` once its PR has merged.

### Testing money paths

Anything that moves DC (bets, the slip, parlays, resolving, voiding, task
rewards, balance adjustments) lives in a Postgres function, so it's tested
against the real database in `tests/db/`, not mocked:

- **Start from the fixtures** in `tests/db/fixtures.ts`: `makeMember` and
  `seedMembers` for members, `clientFor(member)` for a client signed in as
  them, `giveRole` for a role, `createTestMarket` and `createTestTask`, and
  `backers()` / `backLeg()` for the other members' money a parlay leg needs.
  `serviceClient()` (`tests/db/helpers.ts`) is the service role, for setup
  only: call the function under test as the member who would call it.
- **The ledger is checked after every test.** `tests/db/setup.ts` runs
  `assertLedgerConsistent()`: every balance equals its ledger rows, every
  outcome's pool equals its live bets, and every parlay's credit equals its
  payout rows. Set a balance with `setBalanceViaLedger`, never a raw update;
  a test that writes raw rows on purpose calls `skipLedgerCheck('why')`.
- **Test the refusals as carefully as the happy path.** Wrong role, no
  invite, a stake on the market, after close, a replayed attempt key. Check
  the message with `expectError(error, 'the message')`
  (`tests/db/assertions.ts`), never just "some error", which also passes
  when the function doesn't exist.
- **Races** go in `tests/db/money-races.test.ts`, which runs two members'
  calls at once.
- **If a rule changes,** the maths in [HOW-IT-WORKS.md](HOW-IT-WORKS.md)
  changes with it, and where TypeScript mirrors SQL (`parlay_limits()` and
  `lib/parlays/odds.ts`, `pool_payout()` and `poolPayout`) a DB test keeps the
  two equal, so update both.
- Then click it through once in the app, and cover the flow in `e2e/` if a
  member would notice it breaking.

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
   visual source of truth for UI work. The dated specs and plans in
   `docs/archive/` are history: they name things the code no longer has.
5. **[CONTRIBUTING.md](../CONTRIBUTING.md)**: how changes get in.

Also note: `node_modules/next/dist/docs/` documents **this** version of
Next.js (16), which differs from older tutorials and from what an AI
assistant may assume. Read the relevant guide there before writing
Next-specific code.

### The map

```
app/(app)/        signed-in routes: home, markets, bets, parlays, tasks, feed, leaderboard,
                  members, profile, settings, how-it-works, admin
app/(auth)/       sign-in, callback, not-invited, offline
app/api/          cron/keep-alive, cron/closing-alerts, health, push/resync
components/       ui/ (Page, SectionCard, Button, dialogs…), brand/, live/, and feature components
lib/              server actions, Supabase clients, odds maths, pagination, auth, forms
supabase/         migrations/ (every one, numbered; the newest is the last file) and config.toml
tests/            Vitest: app/ (route handlers), components/, lib/, and DB tests in db/
e2e/              Playwright specs
docs/             everything you're reading; archive/ holds the dated specs and plans
scripts/          favicons, iOS splash, iOS standalone check, scale seeder, backup/
```

## 8. Pick up an issue

- **Ask Aaron.** The issue list is often empty or already spoken for, so
  the quickest way to work is to ask him what's next; he'll open or point
  you at an issue.
- **Issues:** https://github.com/Aaron-Wickham/dwell-duel/issues. The
  `good first issue` and `help wanted` labels exist, but they're only on an
  issue when one is open and suitable. Labels tell you the area (`ui`,
  `parlays`, `tasks`, `economy`, `database` means a migration is needed,
  `needs-design` means it's drawn and approved before it's built).
- **Board:** the "DwellDuel" GitHub project tracks what's in flight. Move
  your issue to In progress when you start.
- **Claim it by commenting on the issue** before starting, so two people
  don't build the same thing.

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

**Merging needs:**

- CI's one required check, `ci-ok`, green. It sums up three jobs (`static`:
  the migration-order check, lint and the type check; `db`: the generated
  types and the DB tests; `web`: unit tests, a production build and
  Playwright). Nobody can merge past a red or missing `ci-ok`, not even
  Aaron: `gh pr merge --admin` only skips the review rule, never CI.
- The branch **up to date with `main`**. After another PR merges, update
  yours ("Update branch" on the PR, or `gh pr update-branch <n>`) and wait
  for CI to pass again, so what was tested is what merges.
- An approval from Aaron (the code owner). A new push after approval
  dismisses it and asks for a fresh review.
- Every review conversation resolved.

**Aaron merges.** Once it's green, approved and up to date, he merges it;
you don't need to. On merge, the
Deploy Production workflow backs up the database, applies any migrations
production doesn't have yet and then deploys through Vercel. It runs only
from `main`. There is no undo button for a migration, so the checklist
matters; `docs/OPERATIONS.md` covers backups and rollback.

### If your change needs a migration

- Add a new file `supabase/migrations/00NN_description.sql`, numbered one
  above the newest on `main` (`ls supabase/migrations | tail -1` after
  `git pull`), zero-padded. **Never edit a past migration.** If another PR
  takes your number first, renumber yours above `main`'s newest; CI's
  migration-order check fails until you do, because production refuses a
  migration that sorts before its latest.
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

## 10. Working as a collaborator

### Access and trust

- **Branch in this repo, don't fork,** if you have write access: CI runs
  the same either way, and Aaron can push a fix to your branch. Without
  write access, fork and open the PR from the fork.
- **Write access lets you** push branches, open and review PRs, and run
  workflows. It doesn't let you push to `main`, merge without Aaron's
  approval and a green `ci-ok`, or deploy: Deploy Production and the
  Backups workflow run only from `main`, and their secrets live in the
  GitHub `Production` environment, which nothing else can read.
- **Never press "Run workflow" on Deploy Production or Backups.** Both
  touch production. If something looks stuck, tell Aaron.
- **You won't get production access**: not the Supabase or Vercel
  dashboards, the production database, members' data or the secrets. You
  don't need them; everything you build runs against local Supabase. Never
  test against www.dwellduel.com with real members' accounts.
- [SECURITY.md](../SECURITY.md) has the whole trust model, and how to report
  anything that looks like a vulnerability (privately, never in an issue).

### The review loop

1. Open the PR and fill in the template. CI starts on its own.
2. Aaron reviews. Answer each comment with a fix or a reply, and resolve
   the conversation once it's settled.
3. Every push after an approval dismisses it, so expect a fresh review of
   the new commits.
4. When `main` moves on, `gh pr update-branch <n>` and wait for CI again.
5. Green, approved and up to date: Aaron merges, and Deploy Production
   ships it within a few minutes.

### Areas that need extra care

- **Coins.** A change to what moves DC is a Postgres function in a new
  migration, with DB tests for the refusals and the ledger check passing
  ([Testing money paths](#testing-money-paths)). Never update a balance
  from TypeScript.
- **Migrations** apply on merge with no approval step and no undo: keep
  them additive, and ship anything destructive in its own PR once the code
  stops using it.
- **Rules members see.** If odds, payouts, parlays, limits or roles change,
  [HOW-IT-WORKS.md](HOW-IT-WORKS.md) changes in the same PR, and the app
  renders it as its How it works page.
- **Permissions.** A new `security definer` function checks its caller
  itself (`is_invited()`, `has_role()`, `auth.uid()`) and is added to the
  list in `tests/db/schema-privileges.test.ts`, which is the review step.

### Using Claude or another AI agent

- `CLAUDE.md` just includes `AGENTS.md`, so both point an agent at the
  same conventions. AGENTS.md is authoritative; if the agent's habit and
  AGENTS.md disagree, AGENTS.md wins.
- This is Next.js 16, newer than most models know. Have the agent read the
  guide in `node_modules/next/dist/docs/` before Next-specific code.
- `next dev` re-adds a block at the top of AGENTS.md when it's missing.
  Don't commit changes to that block; if your diff touches it, drop that
  hunk.
- Review what it wrote as you would a stranger's PR. You're the author of
  everything you push.

## 11. Who to ask

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
node scripts/seed-scale.mjs   # 500 members, 200 markets, 20,000 bets, locally
```

## Glossary

| Word | Means |
|---|---|
| **DC** | Dwell Coin, the play money. Every movement is a row in `coin_transactions` |
| **Market** | A question members bet on: Yes/No, multiple choice or Over/Under |
| **Pool** | The real DC bet on one outcome (`market_outcomes.pool_total`); winners split the whole market's pools |
| **Seed** | 20 virtual DC per outcome (`seed_per_outcome`) that only shapes a market's chance and charts; never paid |
| **Slip** | Where picks wait before they're placed, each Solo or Parlay; `place_slip_v2` places them all or none |
| **Parlay** | Several picks combined into one bet that wins only if every pick wins, paid by the house |
| **Leg** | One pick in a parlay (`parlay_legs`); its odds are set when its market closes |
| **Open** | A market still taking bets, before its close time |
| **Awaiting** | Past its close time, with no result yet |
| **Settled** | Resolved or voided; for a bet or parlay, paid, lost or refunded |
| **Resolve / override / void** | Name the winner and pay out / change a result / cancel the market and refund everyone |
| **Attempt key** | A UUID a retryable action sends, so a replay returns the first result instead of acting twice |
| **Reviewer** | The role that approves task submissions; see [Roles](HOW-IT-WORKS.md#roles) |

