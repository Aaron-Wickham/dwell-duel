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
  different variables. In dark, links are the near-white ink and lime
  *fills* mark only the primary action and first place; `acc-text` (dark
  `#8BE651`) stays the positive and open text colour. Active navigation uses
  `nav-active`, `tab-active` and `segment-active`, and a card or row title
  link takes `text-ink`. `StatusChip` tones come only from the semantic
  tokens (`open` is acc-soft / acc-text, `won` win, `lost` loss, `wait`
  gold, `done` and `void` sunk), never `primary`.
- **Every signed-in page is a `<Page>`.** It lives in `components/ui/page.tsx`
  and has exactly one `<h1>`, from `PageHeader` or `h1Class`. Sections are
  `SectionCard`s, whose `<h2>` names the region; a line under that heading
  goes in its `description` slot, never a negative margin. Lists with
  nothing in them render an `EmptyState`. The title of a row or tile in a
  list is `rowTitleClass`, beside `h1Class`, `h2Class` and `eyebrowClass`;
  a figure is `figureHeroClass`, `figureClass` or `figureInlineClass`, and
  the sizes between body and caption are `uiTextClass`, `chipTextClass` and
  `microTextClass`. Don't add a `text-[Npx]` of your own (the sign-in page, the
  404 and the brand mark (the wordmark and the beta badge) are the only
  exceptions), nor a `rounded-[Npx]`: radii are
  `rounded-segment` (10px), `-control`, `-tile`, `-card` or `-full`. A card
  built by hand takes `cardPaddingClass` from `components/ui/card.tsx`.
- **Numbers.** Every DC amount goes through `lib/format/dc.ts`
  (`formatDc`, `formatDcAmount`, `formatSignedDcAmount`), which groups it
  ("2,577,831 DC") and signs a change with a true minus; an amount cell is
  `whitespace-nowrap`. `tabular-nums` only where numbers line up in a
  column (the leaderboard's scores, the ledger, coin history, tooltips),
  never on a lone figure.
- **A list item that opens one thing is a `ListCard`; a sentence row
  (feed) or data row (ledger) stays a divided row** (#328).
  `components/ui/list-card.tsx`'s `ListCard` is the My bets parlay card: a
  `border-line` hairline, `rounded-tile` (`--radius-tile`, 14px), `p-3.5`
  / `md:p-4`, no shadow, tinting flush (`hover-tint [--tint-inset:0]`)
  rather than lifting. Its title link is a `stretched-link` and any other
  control sits in a `relative z-[1]` wrapper; a card whose only controls
  are its own buttons (a task, a submission to review) passes
  `tappable={false}`. Inside a `SectionCard` the list is `listCardsClass`
  (`flex flex-col gap-2`, no dividers), with its `lg:` grid added at the
  call site. Something that isn't an `<li>` (a home tile's link) uses
  `tappableListCardClass`. The feed, ledger, coin history, invites and a
  market's bet list stay divided rows.
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
- **Tab switches swap at once** (#384). A link to a tab (the nav, the tab
  bar, `SubNav`, Home's tab tiles) passes `transitionTypes={TAB_TRANSITION}`
  (`components/nav/page-transition.tsx`), which turns the view transition
  off; a link into a drill-down passes `['nav-forward']`. Pages stay in the
  client router's cache for 30s (`experimental.staleTimes.dynamic` in
  `next.config.ts`), so a revisited tab shows at once; `LiveRefresh`'s
  `router.refresh()` and any revalidating action still re-read it. This
  fits #251: a cached revisit is one server render fewer, and nothing
  prefetches more than before.
- **Pending state is UI, not data.** The nav's pill moves to a tapped tab
  as its navigation starts (`useLinkStatus`), and `IntentLink` marks a
  pending link so `globals.css` dims its card or control (`pendingMarker`;
  the nav passes `false`). That isn't an optimistic update, so it doesn't
  break "Never optimistic".
- **Prefetch on intent.** The nav, `SubNav` and dense list rows link
  through `IntentLink`, which prefetches on hover or focus (and on touch
  for the nav and `SubNav`) instead of on sight: every signed-in page is
  dynamic, so each viewport prefetch is a server render on Vercel's
  budget (#251). The 30s client cache (above) keeps a visited page, not a
  prefetch on sight, so it doesn't reopen #251.
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
  (pointer: fine)`) a `pressable` only changes colour; nothing grows on
  hover (#383 reversed #155's 103%, which fought the sliding pills). A
  standalone card adds `hover-lift` to lift onto `--lift-shadow`.
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
  Every sliding pill uses the pill slide, and a link it slides under
  takes `pill-label`, so its colour cross-fades over the same 280ms; every
  dialog takes `components/ui/dialog-classes.ts`. Reduced motion turns page
  transitions into a `--duration-fast` cross-fade, never a cut. Times in
  CSS that script also keeps (the sign-in intro's) are custom properties
  script writes from its constants, not copies.
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
  animated number uses `AnimatedNumber`, never `NumberFlow` directly (it
  counts only on a change after mount, never on first render), and
  script checks `reducedMotion()` from `lib/ui/reduced-motion.ts`.
- **Segmented tabs are `SubNav`** (`components/ui/sub-nav.tsx`, a client
  component whose pill slides between tabs), with tab state in the URL, as My bets' `?tab=` and the admin sections do.
  `SubNav` is built on `SegmentedControl` (`components/ui/segmented-control.tsx`),
  which every segmented control uses: one `rounded-tile` track, `rounded-segment`
  segments, and one pill sliding on `PILL_SLIDE`. A local control (the theme,
  the slip's Solo/Parlay, the chart's range) keeps its own semantics (radios,
  pressed buttons) and marks its chosen segment with `segmentMarker`.
- **Markets are LMSR** (0101, 0102, 0105). `create_market_v3`/`v4` make every
  new market `pricing = 'lmsr'`, 0105 converted every open pool market, and
  every money function branches on `markets.pricing`. The price is the chance
  (`marketOdds` in `lib/markets/pricing.ts`, mirrored by `market_sparklines`),
  a solo bet buys shares through `place_slip_v4` at a payout fixed when it's
  placed (`lmsrQuote`, the same rounding as `place_lmsr_bet`; refused with
  `price_moved` when it would pay more than 2% less than the slip showed),
  it is final (no cancel or remove), and resolving pays `floor(shares)`.
- **Parlays on `lmsr` markets are fixed at placement** (0104). The stake is
  split evenly across 2–6 legs, each buying stake/n DC of shares into the
  house parlay book (`parlay_legs.shares`, added to `market_outcomes.shares`,
  so they move prices); a leg's `factor` is shares ÷ (stake/n), and
  `parlays.multiplier` (the factors' exact product) and `payout`
  (`floor(stake × multiplier)`) are stored. `lmsrParlayQuote` and
  `fixedParlay` (`lib/parlays/odds.ts`) mirror `place_lmsr_parlay` and
  `settle_parlay`; the 2% re-price rule applies to the parlay's payout; a
  voided leg drops its factor; no caps but the leg count
  (`parlay_limits().max_legs`, mirrored by `MAX_PICKS`). The ledger check
  holds each `lmsr` outcome's `shares` equal to its bets' shares plus its
  legs'.
- **Converted at release** (0105, `convert_pool_markets_to_lmsr`). A pool
  bet still live became `converted`, with `shares` = its "Pays ~" and
  `refund_outcomes` = the outcomes nobody had backed then:
  `resolve_market_core` refunds its `cost` when one of those wins (the pool
  rule), and `betResult`, member stats and records count that as refunded.
  A pending pool parlay became `converted`, every leg's `factor` its locked
  odds and no book `shares`, with 0074's capped `multiplier`/`payout`;
  `settle_parlay` and `parlayTerms` keep those caps when a leg is voided.
  `market_sparklines` charts a converted bet at the pool chance it showed.
- **Pool history stays readable** (0107, #332 dropped what nothing could
  reach). Resolved and voided `pool` markets keep their chance, charts and
  results, and an admin can still override one, so the pool code that
  reads or pays them stays: `effectivePools`/`computeOdds` and
  `seed_per_outcome`, `poolPayout`/`pool_payout()` and `payout_seed`,
  `locked_odds`, `pick_quote`/`parlay_leg_odds` (an old parlay's unpriced
  legs), `parlay_limits()`' pool columns, and `place_bet`/`place_parlay`,
  which refuse every market now but build pool history in tests
  (`createPoolMarket`, `cancelBetForHistory`). Don't build on any of it,
  and don't drop it without checking an override and the history pages
  still work.
- **Proof files** (0042) live in the private `proof` bucket and upload from
  the browser (`lib/proof/upload.ts`), never through a server action. Show
  them with `toProofViews` (signed URLs made with the viewer's own client)
  and `ProofList`. `resolve_market` needs a note; its logic is
  `resolve_market_core`, which members can't call.
- **Market kinds** are `MarketKind` in `lib/markets/kind.ts`. An
  over/under's outcomes are made by `create_market_v4` from its line, and it
  resolves through `resolve_over_under` with the actual number. Title,
  description, category and close time change only through `update_market`
  (0043, 0103, 0106), which logs every change to `market_edits`; outcomes
  and line never change. The close time moves (later, or earlier but still
  in the future) only while the market is open, never by a creator with a
  stake in it (`can_move_market_close`), which reopens a closed one
  and re-arms its closing alerts; nothing is fixed at close, since payouts
  and parlay multipliers are fixed when placed.
- **Every bet goes through the slip.** `SlipProvider` (in the signed-in
  layout) holds the cookie's picks, each Solo or Parlay, with optimistic
  add, remove and mode switches; the floating `SlipSheet` places them all
  at once through `place_slip_v4` (0104; 0072's `place_slip_v2` with each
  single's and the parlay's shown payout), which is all or nothing and
  returns what it placed and whether the call replayed an earlier attempt.
  A pick on a `pool` market is never open, since none has been since 0105.
  Stakes live only in the provider's state, never in the cookie.
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
- **`bets` holds only live stakes.** Bets cancelled before 0107 sit in
  `cancelled_bets` (0037), so resolve, void, odds and the feed never need a
  cancelled filter. Nothing cancels or removes a bet now, so nothing
  writes there and no page follows it; My bets' Cancelled tab reads it as
  history.
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
  (balances equal their ledger, pools equal live bets, each `lmsr` outcome's shares
  equal its bets' plus its parlay legs', pool outcomes hold none, `lmsr` bets carry
  shares and `cost = amount`, a fixed parlay's legs carry factor and shares (a
  converted one's a factor and no shares), a parlay's `credited` equals its payout rows). Shape balances with `setBalanceViaLedger`; a test that seeds
  raw rows on purpose calls `skipLedgerCheck('why')`. Slip tests call `place_slip_v4`.
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
  another PR takes the number. `.claude/hooks/protect-migrations.sh`
  refuses an edit to a migration already on `origin/main`, and
  `.claude/settings.json` denies `supabase db push`; the `new-migration`
  skill has the full checklist.
