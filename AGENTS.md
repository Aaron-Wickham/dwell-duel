<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DwellDuel

An invite-only prediction-market app for a church friend group: members
bet play-money Dwell Coin on friendly markets and earn it through
Bible-study tasks. Next.js 16 (App Router) + TypeScript + Tailwind v4,
Supabase (Postgres, Auth, Realtime, Storage), deployed on Vercel. Live at
www.dwellduel.com; current release in `CHANGELOG.md`.

Read before changing things:
- `docs/ARCHITECTURE.md`: routes, code layout, data model, the functions
  that move coins, migrations and key flows.
- `docs/HOW-IT-WORKS.md`: the rules members see. Odds, payouts and parlay
  maths there must stay true, so update it with any rule change.
- This file: the conventions below.

When a change adds a feature, a route, a table or a rule, update
`docs/ARCHITECTURE.md` or `docs/HOW-IT-WORKS.md` in the same PR, and add
a line to `CHANGELOG.md` under the next release.

## Working in this repo

- **No unrequested scope creep.** Stay focused on what was asked.
- **Comments explain why, not what.** Default to no comments.
- **DRY, but only once duplication is real.** Don't abstract pre-emptively.

## UI conventions

- **Tokens, never raw colours.** Colours come from the CSS variables in
  `app/globals.css`, through Tailwind utilities (`bg-surface`, `text-ink2`,
  `border-line` and so on). Light and dark are the same markup with
  different variables.
- **Every signed-in page is a `<Page>`.** It lives in `components/ui/page.tsx`
  and has exactly one `<h1>`, from `PageHeader` or `h1Class`. Sections are
  `SectionCard`s, whose `<h2>` names the region. Lists with nothing in them
  render an `EmptyState`.
- **Breakpoints.** The design is phone-first. Type sizes and page padding
  switch at `md:`, the same breakpoint as the nav. Multi-column grids
  switch at `lg:`.
- **Controls.** Every control is a real `<button>`, `<a>` or `<label>`ed
  input, at least 44px tall. Selects and checkboxes stay native. When a
  form shows a server error, wire `aria-invalid` and `aria-describedby`
  at the call site. A standalone inline text link that acts as a primary
  tap target — a title link in a row, say — gets the `hit-area` utility:
  a 44px invisible tap area without growing the row. A link inside a
  sentence doesn't need it.
- **Links are underlined by default.** The base `a` rule underlines
  every link, matching the mockup (its links use the browser default
  underline). A link styled as a button, tab, tile, chip or nav item
  carries `no-underline`.
- **Visual source of truth:** `docs/design/app-redesign-handoff.md` and
  the design spec in `docs/superpowers/specs/`.

## Native feel and speed

- **Skeletons, or a streamed Suspense.** Every signed-in route gets a
  `loading.tsx` skeleton (`SkeletonScreen`), unless a real 404 must
  survive the initial load, in which case it streams behind `<Suspense>`
  instead, as the member page does. A `loading.tsx` also wraps every
  route below it — that's why the markets list lives in
  `markets/(list)/`, so the market page can return a real 404. A page
  with several independently streamed sections passes each
  `SkeletonScreen` fallback `announce={false}` and wraps those sections in
  `components/ui/loading-status.tsx`'s `<LoadingStatus>` — a
  `display: contents` wrapper announcing one status scoped to its own
  subtree, for as long as any of its fallbacks is still showing — as the
  market page does. A route-level `loading.tsx` keeps its own single
  status.
- **Drill-down pages** pass `Page`'s `transition="drill-down"`, which
  also enables the back-swipe; its logical parents live in
  `lib/nav/back-swipe.ts`.
- **Signed-out redirects** live in `proxy.ts`, and a new `(app)` section
  must be added to `lib/auth/app-paths.ts` (a test guards the drift).
- **The brand mark's art** lives in `components/brand/symbol-paths.ts`.
  The iOS splash is the D alone (`scripts/generate-splash.mjs`), because
  the installed app's `LaunchScreen` grows the leaves in from that frame;
  change one and you change the other. Favicons come from
  `scripts/generate-favicons.mjs`. A full-page wait with no skeleton shows
  `LeafLoader` beside words saying what's happening.
- **The `pressable` and `no-callout` utilities,** plus the `--safe-top` /
  `--safe-bottom` tokens, which are non-zero only in standalone mode.
- **Never optimistic:** bet, parlay, resolve, void and balance actions.
- **Settings are cookies on `<html>`.** Theme (`data-theme`), haptics
  (`data-haptics="off"`) and reduced motion (`data-motion="reduce"`) are
  set by the root layout before any JS runs. `motion-reduce:` covers both
  the device setting and Settings' choice; plain CSS repeats each
  `prefers-reduced-motion` rule under `:root[data-motion="reduce"]`; an
  animated number uses `AnimatedNumber`, never `NumberFlow` directly, and
  script checks `reducedMotion()` from `lib/ui/reduced-motion.ts`.
- **Segmented tabs are `SubNav`** (`components/ui/sub-nav.tsx`), with tab
  state in the URL, as My bets' `?tab=` and the admin sections do.
- **Odds are seeded** (0041): every outcome's pool counts
  `markets.seed_per_outcome` virtual DC. Odds, chance, payout estimates and
  charts go through `effectivePools` (`lib/markets/odds.ts`), the same maths
  `resolve_market` pays on. Parlay limits live in SQL `parlay_limits()`,
  mirrored by `MAX_PICKS` / `MAX_MULTIPLIER`; a DB test keeps them equal.
- **Proof files** (0042) live in the private `proof` bucket and upload from
  the browser (`lib/proof/upload.ts`), never through a server action. Show
  them with `toProofViews` (signed URLs made with the viewer's own client)
  and `ProofList`. `resolve_market` needs a note; its logic is
  `resolve_market_core`, which members can't call.
- **Market kinds** are `MarketKind` in `lib/markets/kind.ts`. An
  over/under's outcomes are made by `create_market` from its line, and it
  resolves through `resolve_over_under` with the actual number. Title and
  description change only through `update_market` (0043), which logs every
  change to `market_edits`; outcomes, close time and line never change.
- **Every bet goes through the slip.** `SlipProvider` (in the signed-in
  layout) holds the cookie's picks, each Solo or Parlay, with optimistic
  add, remove and mode switches; the floating `SlipSheet` places them all
  at once through `place_slip` (0039), which is all or nothing. Stakes live
  only in the provider's state, never in the cookie.
- **The service worker never caches** per-member HTML, RSC payloads,
  server actions or Supabase responses.
- **A new live table** goes in both `LIVE_TABLES` and a
  realtime-publication migration.
- **E2e specs await `serverActionSettled`** after an optimistic action,
  before navigating away.

## Data and reliability

- **Long lists page with "Show more".** `lib/pagination` plus
  `components/ui/show-more.tsx`'s `ShowMore`, which takes `href`, an
  optional `fresh` prop — pass `fresh` when `next.kind === 'window'`, so a
  fresh window scrolls to the top — `focusId`, `rowDomId(prefix,
  next.firstId)`, and an optional `description` for a page that has more
  than one "Show more" on it. Each row spreads
  `focusTarget(rowDomId(prefix, row.id))` (`lib/pagination/row-id.ts`); a
  row whose content is long enough to make a verbose accessible name (a
  card) instead passes `focusTarget(domId, labelId)`, naming itself from
  its title. The page renders one `<ShowMoreFocus />`, and a window that
  comes back empty renders `NothingOlder` instead of the list's empty
  state. A reader whose row select carries embeds passes `readKeyset` a
  keys-only `fetchKeys` for its probe. An order that isn't
  `(timestamp, id)` — the leaderboard's rank — reads through
  `readOrdered` with its own `KeysetOrder`, `lib/pagination/rank-cursor.ts`'s
  `RANK_ORDER`, instead of `readKeyset`.
- **Keyset filters AND a plain timestamp bound** onto the cursor's
  tiebreak OR, so the query plans an Index Cond instead of scanning the
  whole table.
- **Every `.in(col, ids)` lookup that grows with rows is chunked** with
  `lib/pagination/chunk.ts`'s `chunk()`.
- **A page declares what it shows live** with
  `<LiveTables subscriptions={pageSubscriptions.x(…)}>`, from
  `lib/live/page-subscriptions.ts` and `components/live/live-tables.tsx`.
- **`LiveRefresh` keeps two channels:** a long-lived base channel for the
  member's own profile, and a page channel rebuilt on every navigation. A
  new live table goes in `LIVE_TABLES`, a realtime-publication migration
  and `page-subscriptions`.
- **An Auth failure isn't "signed out."** `requireUser` reads claims
  through `readClaims` (`lib/auth/auth-unavailable.ts`) and throws
  `AuthUnavailableError` when Auth itself is unavailable; `getRole`
  (`lib/auth/roles.ts`) throws on an RPC error the same way.
- **Roles are owner › admin › reviewer › member** (`profiles.role`, 0040).
  Gate SQL with `has_role('<min>')` (`is_admin()` means admin or owner)
  and pages with `atLeast(await getRole(supabase), '<min>')`. Balances,
  deletes and granting roles are the owner's alone.
- **Every level has an error page** — `app/(app)/error.tsx`,
  `app/error.tsx` and `app/global-error.tsx` — rendering
  `components/ui/error-card.tsx`'s `ErrorCard`, whose "Try again" calls
  Next 16's `retry()`.
- **A new member-entered text column** gets a length CHECK in a
  migration, a `TEXT_LIMITS` entry in `lib/forms/limits.ts`, `maxLength`
  on its input, and a `tooLong` check in its server action.
- **A new required env var** goes in `lib/env/required.ts`. A
  production-only one must be set in Vercel before merging, or
  production won't boot.
- **My bets pages `my_wagers`** (0044), a keys-only view of solo bets and
  parlays together (`bet:<id>`, `parlay:<uuid>`), then fetches the rows it
  names (`listMyWagers`). Cancelled bets page on their own.
- **The feed and member activity read `activity_events`,** not
  `activity_feed`. Triggers in 0035 keep it equal to what `activity_feed`
  would show. A new feed kind, or a new way of writing a source table,
  needs a trigger change plus a step in `tests/db/activity-events.test.ts`'s
  equivalence scenario. No trigger watches `market_resolutions`.
- **Members can't select `activity_feed`** since 0036. It stays only as
  the DB tests' equivalence oracle, and tests read it through the service
  client or `pgQuery`, never a member client.
- **`bets` holds only live stakes.** `cancel_bet` (0037) moves a
  cancelled bet into `cancelled_bets`, so resolve, void, odds and the feed
  never need a cancelled filter. A page that shows a market's bets live
  also subscribes to `cancelled_bets`: a filtered channel never receives
  the `bets` delete.
- **Profile photos** are `profiles.avatar_path`, a path in the public
  `avatars` bucket; render them with `avatarUrl()` from
  `lib/profile/avatar.ts` through `<Avatar src>`. Profile edits go through
  `update_my_profile`; members have no direct update on `profiles`.
- **A build that depends on a new migration needs the migration applied
  first.** Merging to `main` runs the migration and the deploy in
  parallel, so run the Deploy Production Database workflow on the branch
  before merging, or ship the migration in its own PR ahead of the build.

## Testing

- `npm test` runs the Vitest suite; `npm run test:e2e` runs Playwright
  (builds and starts its own production server on port 3000 — kill any
  server already listening there first).
- `npm run db:reset` before running tests that hit local Supabase. DB
  tests (`tests/db/`) refuse to run against anything but localhost.

## Migrations

- Sequential, zero-padded numbering (`00NN_description.sql`) in
  `supabase/migrations/`. Never edit a past migration in place — add a
  new one.
