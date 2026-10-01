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
  `SectionCard`s, whose `<h2>` names the region; a line under that heading
  goes in its `description` slot, never a negative margin. Lists with
  nothing in them render an `EmptyState`. The title of a row or tile in a
  list is `rowTitleClass`, beside `h1Class`, `h2Class` and `eyebrowClass`;
  don't add a `text-[Npx]` of your own.
- **Page widths come from `<Page width>`:** `wide` (default, 1120px of
  content) or `reading` (about 820px, centred), and a skeleton uses
  `pageClassFor(width)`. Don't cap a card's width inside a page; fill the
  column, with multi-column grids at `lg:` (the table in the handoff doc).
- **Breakpoints.** The design is phone-first. Type sizes and page padding
  switch at `md:`, the same breakpoint as the nav. Multi-column grids
  switch at `lg:`.
- **Forms keep what was typed.** React resets a form after its action,
  even one that returned an error, so every field in a form with an action
  is controlled (`value`/`checked` plus `onChange` state), cleared by hand
  on success where that makes sense. A checkbox or radio also takes
  `ref={keepCheckedOnReset(checked)}` (`lib/forms/keep-on-reset.ts`);
  `Select` does the same for itself when given a `value`.
- **Confirm before money or access changes.** A single-button action uses
  `ConfirmActionButton`. A form that must ask first (resolve, balance,
  role) keeps its own button and fields, passes `useConfirmSubmit()`'s
  `onSubmit`, and renders `ConfirmSubmitDialog`, whose button submits the
  form through its `form` attribute. A form with several submit buttons
  passes `useConfirmSubmit` a predicate naming which ones ask. The one
  exception is approving a single task submission from its row, which
  stays a direct button (the e2e suite clicks the first "Approve");
  "Approve selected" confirms, saying how many it approves and what it pays.
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
- **Visual source of truth:** `docs/design/app-redesign-handoff.md`, which
  describes the app as it is. The dated specs and plans in `docs/archive/`
  are history: they name things the code no longer has, so don't build
  from them (`.ignore` keeps ripgrep out of them).

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
- **Prefetch on intent.** The nav, `SubNav` and dense list rows link
  through `IntentLink`, which prefetches on hover or focus (and on touch
  for the nav and `SubNav`) instead of on sight: every signed-in page is
  dynamic, so each viewport prefetch is a server render on Vercel's
  budget (#251).
- **Signed-out redirects** live in `proxy.ts`, and a new `(app)` section
  must be added to `lib/auth/app-paths.ts` (a test guards the drift).
- **The brand mark's art** lives in `components/brand/symbol-paths.ts`.
  The iOS splash is the D alone (`scripts/generate-splash.mjs`), because
  the installed app's `LaunchScreen` grows the leaves in from that frame;
  change one and you change the other. Favicons come from
  `scripts/generate-favicons.mjs`. A full-page wait with no skeleton shows
  `LeafLoader` beside words saying what's happening.
- **In the installed iPhone app, the viewport is only as tall as the
  page** (up to the screen), so a short page gets a viewport 62pt short and
  every fixed element, the tab bar and launch overlay included, floats above
  the bottom. `globals.css` makes `body` at least `100lvh` tall in
  `display-mode: standalone`; `min-height: 100%` can't do it, because it is
  measured against that shrinking viewport. Don't remove it, and check
  changes to the shell in the simulator's installed app, not just Safari:
  `npm run check:ios` cold-launches the installed app on a booted
  simulator and fails on a short viewport (`--video` records the launch).
- **The `pressable` and `no-callout` utilities,** plus the `--safe-top` /
  `--safe-bottom` tokens, which are non-zero only in standalone mode.
  Every tap target is `pressable`. A card or row that one link makes
  tappable as a whole is `relative pressable`, and its link carries
  `stretched-link` (its `::after` covers the card on touch; under a mouse
  the cover is off so text can be selected, and `CardLinkClick` in the
  signed-in layout opens the card on click instead, unless the click hit
  another control or finished a text selection); any other control in
  the card sits in a `relative z-[1]` wrapper. `press-feedback.test.tsx`
  guards the listed components. Under a mouse (`(hover: hover) and
  (pointer: fine)`), `pressable` also grows a control to 103%; a
  standalone card adds `hover-lift` to lift onto `--lift-shadow` instead.
  A row or tile *inside* a card never lifts (#244: a card floating in a
  card reads as a button in a button): it takes `hover-tint`, a flat
  `--sunk` panel drawn a little wider than a divided list's row, or flush
  with a padded row that sets `[--tint-inset:0]`. The lift drops its
  movement under reduced motion, and `pressable` carries the transition,
  so a colour hover on a `pressable` eases on its own.
- **Motion tokens.** Curves and durations are the `--ease-*` /
  `--duration-*` tokens in `globals.css`'s `@theme static` block (`ease-ios`,
  `duration-(--duration-fast)` in markup), mirrored for script by
  `lib/ui/motion.ts` (`EASE`, `DURATION`, `PILL_SLIDE`, `PILL_TRANSITION`);
  a test keeps them equal and fails on a `cubic-bezier` anywhere else.
  Every sliding pill uses the pill slide, and every dialog takes
  `components/ui/dialog-classes.ts`.
- **Never optimistic:** bet, parlay, resolve, void and balance actions.
- **Every action that creates something is retry-safe,** not only the ones
  that move coins: `experimental.useOffline` replays an action whose
  response was lost, even when it had committed. Creating a market, a
  comment or a task sends an attempt key from `useAttemptKey`; a form whose
  fields can be edited after a lost response uses its `fingerprintOf` so an
  edit starts a new attempt (#267).
- **Retry-safe money actions.** The slip and the balance adjustment send
  an attempt key (0047), held in a ref until the action succeeds and kept
  when the response is lost, so tapping again returns the first result.
  The slip's ref lives in `SlipProvider`, because the sheet unmounts the
  panel when it closes. A new action that moves coins and can be retried
  takes a key the same way, through `claim_idempotency_key` and `finish_idempotent`.
- **Settings are cookies on `<html>`.** Theme (`data-theme`), haptics
  (`data-haptics="off"`) and reduced motion (`data-motion="reduce"`) are
  set by the root layout before any JS runs. `motion-reduce:` covers both
  the device setting and Settings' choice; plain CSS repeats each
  `prefers-reduced-motion` rule under `:root[data-motion="reduce"]`; an
  animated number uses `AnimatedNumber`, never `NumberFlow` directly, and
  script checks `reducedMotion()` from `lib/ui/reduced-motion.ts`.
- **Segmented tabs are `SubNav`** (`components/ui/sub-nav.tsx`, a client
  component whose pill slides between tabs), with tab state in the URL, as My bets' `?tab=` and the admin sections do.
- **The seed is for display; payouts are the real pool** (0041, 0074). Every
  outcome's *chance* counts `markets.seed_per_outcome` virtual DC: chance,
  charts and sparklines go through `effectivePools` (`lib/markets/odds.ts`),
  mirrored by `market_sparklines`. Payouts never count it: payout figures
  ("× payout per DC", "Pays ~", My bets) go through `poolPayout` /
  `soloPayout`, mirrored by SQL `pool_payout()`, which `resolve_market_core`
  pays with; a DB test keeps the two equal. Parlay limits live in SQL
  `parlay_limits()`, mirrored by `MAX_PICKS` / `MAX_MULTIPLIER` /
  `MAX_PAYOUT` / `MIN_LEG_*` / `MAX_LEG_ODDS`; a DB test keeps them equal. A
  parlay leg's odds are set at close from real money (`pick_quote`), so the
  slip and parlay views show `~` estimates until then.
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
  at once through `place_slip_v2` (0072), which is all or nothing and
  returns what it placed and whether the call replayed an earlier attempt
  (`place_slip` only wraps it for the previous build). Stakes live
  only in the provider's state, never in the cookie.
- **The service worker never caches** per-member HTML, RSC payloads,
  server actions or Supabase responses.
- **Live updates come in two kinds** (0092, #250). A row subscription is
  Postgres Changes on a `LIVE_TABLES` table and always has a filter; a new
  one goes in `LIVE_TABLES` and a realtime-publication migration. Anything
  group-wide is a topic (`LIVE_TOPICS`): a plain (not deferred) row
  trigger calling `live_ping_trigger('<topic>')`, a seeded `live_pings`
  row and the `realtime.messages` policy's topic list, all in a migration.
  Never put a deferred trigger on a live table: its pending events make
  any later ALTER of that table in the same transaction fail (55006).
  Never follow a whole table unfiltered: every open page would get a
  message per row anyone writes. Prefer the narrowest source that moves
  with what the page shows (`/markets` follows the `pools` topic, not
  `bets`), and never follow `profiles` group-wide: every coin movement
  updates one.
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
- **`LiveRefresh` keeps a base channel** for the member's own profile, a
  page channel for the page's row subscriptions, rebuilt on every
  navigation, and one channel per topic. The database judges its
  throttle at commit (a deferred trigger on `live_ping_queue`), and a
  topic always refreshes at least an interval plus a second after its
  latest ping, so a change the throttle held back is still read; keep
  every `TOPIC_REFRESH_DELAY_MS` above `LIVE_PING_INTERVAL_MS`. A tab
  hidden for 60 s closes them all, and a channel that can't join makes the
  page poll every 60 s. A page's subscriptions live in
  `page-subscriptions`; the budget they're held to is in
  `docs/ARCHITECTURE.md`.
- **Every Realtime channel is private** (`{ config: { private: true } }`,
  0100), so production keeps Supabase's "Allow public access to channels"
  off. The base and page channels join `live-member:<member id>:base|page:<n>`
  (`memberTopic`), which only that invited member may join; topics join
  `live:<topic>` (0092). A new channel needs a topic a `realtime.messages`
  SELECT policy covers, with Broadcast read even when it carries only
  Postgres Changes, since that's all a private join checks. Await
  `realtime.setAuth()` before any join (#310): one sent as anon is refused.
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
  production won't boot. Supabase keys are the publishable and secret
  kind, never the legacy JWT keys.
- **Typed clients.** Helpers take `DbClient` (`lib/supabase/database.ts`).
  After a migration, regenerate `lib/supabase/database.types.ts`
  (`npx supabase gen types typescript --local`); CI fails when it's stale.
  Don't cast query rows with `as unknown as` unless the select list is a
  runtime string, and say so.
- **My bets pages `my_wagers`** (0044), a keys-only view of solo bets and
  parlays together (`bet:<id>`, `parlay:<uuid>`), then fetches the rows it
  names (`listMyWagers`). Cancelled bets page on their own.
- **The feed and member activity read `activity_events`,** not
  `activity_feed`. Triggers in 0035 keep it equal to what `activity_feed`
  would show. A new feed kind, or a new way of writing a source table,
  needs a trigger change plus a step in `tests/db/activity-events.test.ts`'s
  equivalence scenario. A kind with no source row for a trigger to follow
  (`season_champion`, `market_voided`) is inserted by the function that
  makes the event instead, left out of that equivalence check, and tested
  on its own. `FeedList` skips a kind it doesn't know, so a new kind reaches
  the database before the build that renders it without breaking the feed. No trigger watches `market_resolutions`. A feed
  row is a sentence, not a card: its member and market names are its links
  and tap targets, and the row itself doesn't press, lift or open anything
  (decided in #187), since one row can name two destinations.
- **Members can't select `activity_feed`** since 0036. It stays only as
  the DB tests' equivalence oracle, and tests read it through the service
  client or `pgQuery`, never a member client.
- **`bets` holds only live stakes.** `cancel_bet` (0037) moves a
  cancelled bet into `cancelled_bets`, so resolve, void, odds and the feed
  never need a cancelled filter. A page that shows a market's bets live
  also subscribes to `cancelled_bets`: a filtered channel never receives
  the `bets` delete.
- **Members can't read `profiles.email`** (0046). Select profile columns
  by name, never `*`; admins read emails through `member_emails()`.
- **Nobody but an admin resolves a market they have a stake in**, and
  nobody reviews their own task submission (0046). Ask the database
  (`can_resolve_market`) rather than re-deriving who may resolve.
- **The CSP lives in `next.config.ts`.** A new external origin for scripts,
  images or connections must be added there, or the browser blocks it.
- **Profile photos** are `profiles.avatar_path`, a path in the public
  `avatars` bucket; render them with `avatarUrl()` from
  `lib/profile/avatar.ts` through `<Avatar src>`. Profile edits go through
  `update_my_profile`; members have no direct update on `profiles`.
- **Migrations apply themselves on merge, before the app deploys.**
  Merging to `main` runs the Deploy Production workflow with no approval
  step: it dry-runs against production, and when production lacks any
  migration it takes an encrypted backup (`scripts/backup/backup.sh`) and
  pushes them, then triggers Vercel through a deploy hook (Vercel's own Git
  deploys are off for `main`). It runs only from `main`, with its secrets
  in the `Production` environment; never add a prod secret at repository
  level. The old app keeps serving while a migration applies, so keep
  migrations additive (new tables, columns and functions), and ship a
  destructive change in its own PR after the code stops using it. Backups
  and restore: `docs/OPERATIONS.md`.

## Testing

- `npm test` runs the Vitest suite; `npm run test:e2e` runs Playwright
  (builds and starts its own production server on port 3000 — kill any
  server already listening there first).
- `npm run db:reset` before running tests that hit local Supabase. DB
  tests (`tests/db/`) refuse to run against anything but localhost. If
  storage uploads then fail with `42P10` (the local Storage service holds
  stale state after a reset), run `npx supabase stop && npx supabase start`.
- **DB tests are typed and name what a refusal was for.** `serviceClient()`,
  `clientFor()`, `clientForEmail()` and `anonClient()` return `TestClient` (`SupabaseClient<Database>`),
  so a renamed RPC argument fails `npm run typecheck`. A negative test calls
  `expectError(error, 'the message' | { code, message })` (`tests/db/assertions.ts`),
  never `expect(error).not.toBeNull()`, which also passes on a missing function.
  `tests/db/setup.ts` runs `assertLedgerConsistent()` after every DB test
  (balances equal their ledger, pools equal live bets, a parlay's `credited` equals
  its payout rows). Shape balances with `setBalanceViaLedger`; a test that seeds
  raw rows on purpose calls `skipLedgerCheck('why')`. Slip tests call `place_slip_v2`.
- **CI runs on pull requests only,** as three parallel jobs (`static`,
  `db`, `web`) summed up by the one required check, `ci-ok`. A PR must be
  up to date with `main` to merge: after another PR lands, run
  `gh pr update-branch <n>` and let CI run again. Merging to `main` only
  deploys, so nothing tests the merge commit separately. `ci-ok` has no
  bypass: `gh pr merge --admin` skips only the review rule, so a red PR
  can't merge.

## Migrations

- Sequential, zero-padded numbering (`00NN_description.sql`) in
  `supabase/migrations/`. Never edit a past migration in place — add a
  new one. A new migration must be numbered after `main`'s newest
  (`scripts/check-migration-order.sh` fails CI otherwise); renumber after
  another PR takes the number.
