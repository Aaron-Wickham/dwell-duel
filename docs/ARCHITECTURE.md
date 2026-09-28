# Architecture

How DwellDuel fits together. For the rules members see (odds, payouts,
parlays, tasks), read [HOW-IT-WORKS.md](HOW-IT-WORKS.md). For the coding
conventions every change follows, read [AGENTS.md](../AGENTS.md).

## The shape of it

```
Browser / installed app (PWA)
  │  React Server Components + a few client islands
  ▼
Next.js 16 on Vercel ── proxy.ts: signed-out requests → /sign-in
  │  server components read with the member's own Supabase session
  │  server actions call Postgres RPCs; nothing writes tables directly
  ▼
Supabase (one hosted project: production)
  ├─ Auth: Google only, invite-gated
  ├─ Postgres: tables + RLS + security-definer RPCs (all money moves here)
  ├─ Realtime: 10 published tables drive live page refreshes
  └─ Storage: `avatars` (public), `proof` (private, signed URLs)
```

The rule that shapes everything else is that **all business logic that
touches coins lives in Postgres.** Placing a bet, resolving a market,
approving a task or adjusting a balance are each one `security definer`
function that checks permissions, locks the rows it needs, and writes the
ledger in a single transaction. The Next.js side renders, validates input
for friendly errors, and calls those functions. It never updates a balance
itself.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, server actions, `proxy.ts`) |
| Language | TypeScript, strict |
| Styling | Tailwind v4 with CSS-variable tokens (`app/globals.css`), light and dark |
| UI pieces | Base UI (dialogs, drawers), lucide-react icons, Motion, NumberFlow, Recharts, sonner toasts |
| Data | Supabase: Postgres, Auth, Realtime, Storage (`@supabase/ssr`) |
| Hosting | Vercel (production only, plus a daily cron) |
| Tests | Vitest (unit, component, DB against local Supabase), Playwright (e2e) |

## Routes

Signed-in routes live under `app/(app)/`, which share one layout: the nav,
the slip, live updates and toasts. `lib/auth/app-paths.ts` lists them so
`proxy.ts` can redirect signed-out visitors (a test keeps the two in step).

| Route | What it is |
|---|---|
| `/` | Home: greeting, balance hero (balance, rank, At stake, Pending), tiles |
| `/markets` | Open markets as cards with sparklines, paged |
| `/markets/new` | Create a market: Yes/No, multiple choice (up to 6) or Over/Under |
| `/markets/[id]` | A market: chart, outcomes, the slip controls, bets, resolve/void/edit, resolution proof |
| `/bets` | My bets: Open · Settled · Cancelled, solo bets and parlays together (`?tab=`) |
| `/parlays` | Redirects to `/bets` (kept for old links) |
| `/tasks` | Bible-study tasks to submit, with optional or required proof |
| `/feed` | Everyone's activity, live |
| `/leaderboard` | Balance ranks |
| `/members/[id]` | A member's profile and activity; your own adds Edit profile and Settings |
| `/profile` | Edit your name, photo and bio |
| `/settings` | Theme, haptics, reduced motion, sign out |
| `/admin/invites` · `/admin/tasks` · `/admin/members` · `/admin/ledger` | Admin sections, shown by role |

Public routes live under `app/(auth)/`: `/sign-in`, `/callback` (the OAuth
return), `/not-invited` and `/offline`. The API has one route,
`/api/cron/keep-alive`, which a daily Vercel cron calls so the free
Supabase project never pauses.

## Code layout

```
app/            routes (see above), globals.css, manifest, error pages
components/     UI by area: app-nav, brand, feed, home, markets, parlays, proof,
                slip, tasks, live, offline, ui (shared primitives: Page, SectionCard,
                Button, Field, SubNav, ShowMore, EmptyState, Skeleton…)
lib/            logic by area: auth, markets, bets, parlays, tasks, proof, social,
                live, pagination, preferences, theme, forms, env, nav…
supabase/       migrations/0001…0045, config.toml
tests/          components/, lib/, db/ (Vitest), plus e2e/ (Playwright)
scripts/        generate-splash.mjs, generate-favicons.mjs
public/         sw.js (service worker), icons, favicons, iOS splash screens
docs/           this file, HOW-IT-WORKS, design handoff, dated specs and plans
```

## Data model

Every table has row-level security. Members read what the app shows them.
Almost every write goes through an RPC; the exceptions are admin writes to
the task catalogue and invite list, which are allowed by policy.

**People**

- `allowed_emails`: the invite list. Only invited Google accounts get in.
- `profiles`: one per member. Display name, bio, `avatar_path`, `balance`
  and `role` (owner › admin › reviewer › member). A trigger creates it on
  first sign-in and grants 100 DC.
- `coin_transactions`: the ledger. Every balance change is a row
  (`starting_grant`, `bet_placed`, `bet_won`, `bet_voided_refund`,
  `bet_cancelled`, `resolution_reversed`, `parlay_placed`, `parlay_won`,
  `parlay_refunded`, `parlay_reversed`, `task_completed`,
  `admin_adjustment`), written only by `apply_coin_transaction`.

**Markets and bets**

- `markets`: title, description, kind (`binary`, `multiple_choice`,
  `over_under`), `line` (Over/Under only), `close_at`, status (`open`,
  `resolved`, `voided`), `seed_per_outcome` (20 DC by default),
  `current_resolution_id` and `edited_at`.
- `market_outcomes`: labels and `pool_total`, the real DC bet on each.
- `bets`: live stakes only. A cancelled bet moves to `cancelled_bets`.
- `market_resolutions`: each resolution or override, with its required
  note, `actual_value` for an Over/Under, and a link to the one it
  replaced.
- `market_edits`: every title or description change, readable by all
  members.
- `parlays` and `parlay_legs`: a stake, a status (`pending`, `won`, `lost`,
  `refunded`), and each leg's outcome with odds locked at placement.

**Tasks and proof**

- `tasks`: the Bible-study catalogue. Reward, whether it repeats (daily,
  weekly, monthly or yearly), active flag and `proof_required`.
- `task_completions`: submissions (`pending`, `approved`, `rejected`) with
  a note, one per task per period.
- `proof_attachments`: files, photos and links attached to a submission or
  a resolution. The files live in the private `proof` storage bucket.

**Feed**

- `activity_events`: one row per feed item (bets, parlays, new markets,
  results, wins and approved tasks), kept in step by triggers (0035). The
  feed and member activity read only this table.
- `activity_feed` (view): the old computed feed. It is kept only as the
  DB tests' oracle; members can't read it.

**Views for pages**

- `my_wagers`: keys for My bets, solo bets and parlays together
  (`bet:<id>`, `parlay:<uuid>`), bucketed open or settled.

### The functions that move coins

| Function | Who | What it does |
|---|---|---|
| `place_slip` | member | Places every solo bet and the parlay in the slip, all or nothing |
| `place_bet` / `place_parlay` | member | The single-bet and single-parlay versions `place_slip` builds on |
| `cancel_bet` | bettor | Refunds a bet before its market closes |
| `resolve_market` | creator after close, or admin | Needs a note; may take proof; pays winners from the seeded pool; an admin override reverses the old payouts first and is blocked if a past winner has already spent them |
| `resolve_over_under` | same | Picks Over or Under from the actual number, then resolves |
| `void_market` | creator or admin | Refunds every bet; parlays drop the voided leg |
| `settle_parlay` | trigger | Runs when a leg's market resolves or voids |
| `submit_task_completion` | member | Submits a task with an optional note and proof |
| `approve_task_completion`, `reject_task_completion`, `review_task_completions` | reviewer+ | Pays or rejects submissions, one at a time or in bulk |
| `adjust_balance` | owner | A manual correction, with a required reason |

Also: `create_market`, `update_market` (creator or admin, before close),
`set_member_role`, `delete_market`, `delete_task` and `remove_bet` (owner
only), `update_my_profile`, `record_proof`, `market_sparklines`,
`my_at_stake` and `parlay_limits`.

### Migrations

Migrations are numbered in order, `0001`–`0045`, and none is ever edited
after it ships. They roughly follow the project's history:

| Range | What they add |
|---|---|
| 0001–0007 | Profiles, invites, the coin ledger, RLS |
| 0008–0016 | Markets, betting, resolution, overrides and voids |
| 0017–0024 | Tasks, periods, approvals and balance adjustment |
| 0025–0029 | Parlays |
| 0030–0036 | The social layer, realtime, scale work and the `activity_events` feed |
| 0037–0039 | Cancelling bets, profile editing, the unified slip |
| 0040–0045 | Roles, seeded odds, proof, Over/Under and market edits, My bets, At stake |

Merging a migration to `main` runs the **Deploy Production Database**
workflow. It runs in parallel with Vercel's deploy, so a build that needs
a new migration runs that workflow on its branch before merging.

## Key flows

**Signing in.** Google OAuth only; Supabase has every other provider
switched off. `/callback` exchanges the code, and a member whose email
isn't in `allowed_emails` lands on `/not-invited`. The `profiles` trigger
creates the profile and the 100 DC starting grant. `requireUser` reads
claims and throws `AuthUnavailableError` (not "signed out") when Auth
itself is down.

**Betting through the slip.** An outcome's "Add to slip" writes a cookie
of picks (`lib/parlays/slip.ts`). `SlipProvider` in the signed-in layout
holds those picks, each marked Solo or Parlay, with optimistic add, remove
and mode switches. Stakes live only in client state. The floating
`SlipSheet` sends everything to `place_slip` in one call; it either all
succeeds or nothing is placed. Bets are never optimistic.

**Odds.** Pari-mutuel with a seed. Each outcome's pool counts
`seed_per_outcome` virtual DC on top of real stakes, so a new market
already shows even odds, and one-sided betting never pays 1.00×.
`effectivePools` in `lib/markets/odds.ts` is the one place the app does
this sum. It matches `resolve_market`, so the percentages, charts, payout
estimates and My bets results all agree with what's actually paid.
Parlay legs lock their odds at placement, and parlays are paid by the
house, not from market pools (the #51 decision).

**Resolution and proof.** The resolve form needs a reason and can carry
photos, files and links. Files upload straight from the browser to the
private `proof` bucket (`lib/proof/upload.ts`), then `record_proof`
checks the paths when the RPC runs. Pages show proof through short-lived
signed URLs made with the viewer's own session.

**Live updates.** A page declares the tables it shows with
`<LiveTables subscriptions={pageSubscriptions.x(…)}>`. `LiveRefresh` keeps
a long-lived channel on the member's own profile, which carries their
balance and avatar, plus a per-page channel. A change to a subscribed
table triggers `router.refresh()`, so the server re-renders with fresh
data. Ten tables are published (`LIVE_TABLES`).

**Long lists.** Keyset pagination (`lib/pagination`) with "Show more".
Each list keeps its place in URL cursors, jumps to a fresh window after
500 rows, and moves focus to the first new row. Every `.in()` lookup that
grows with the data is split into chunks.

**Installed app and offline.** The manifest and iOS splash screens make
it installable. On a cold start of the installed app, `LaunchScreen`
grows the leaves onto the splash's D, using only CSS and a small inline
script. `public/sw.js` is hand-written. It caches only the content-hashed
`/_next/static/` files and a precached `/offline` page, which it serves
when a navigation can't reach the network. Each deploy gets its own cache. It never caches per-member HTML, RSC
payloads, server actions or Supabase responses. Pages slide in with
React's `<ViewTransition>`, drill-down pages support a back swipe, and
each signed-in route has a skeleton.

**Settings.** Theme, haptics and reduced motion are cookies. The root
layout renders them as attributes on `<html>` (`data-theme`,
`data-haptics`, `data-motion`), so they apply before any script runs.
`motion-reduce:` in CSS covers both the device setting and the app's own.

## Environments and deploys

- **Local:** Docker Supabase (`npm run db:start`) is the only dev and test
  database. DB tests refuse to run against anything but localhost.
- **Production:** one Vercel project and one hosted Supabase project.
  Vercel preview deploys are off on purpose (see the README).
- **CI** (`.github/workflows/ci.yml`): lint, Vitest, a production build
  and Playwright on every push and PR, all against a throwaway local
  Supabase.
- **Required env vars** are checked at boot (`lib/env/required.ts`):
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` always;
  `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` in production.
