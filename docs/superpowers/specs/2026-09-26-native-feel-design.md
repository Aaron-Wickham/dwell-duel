# Native feel and perceived speed — design

**Date:** 2026-09-26
**Status:** approved, not yet implemented
**Sub-project 8, PR B.** Sub-project 8 is "Speed, reliability and native feel", and it ships as two PRs:
- **PR B** (this spec) makes DwellDuel feel like a native app when it's installed to the home screen, and makes every interaction feel instant.
- **PR A** (a later spec) covers the data layer and reliability: indexes, the access-rule speed-up, correctness past 1,000 rows, pagination, parallel reads, error pages and the keep-alive cron. Its audit findings are recorded in the project memory `perf-reliability-followup.md`.

The user chose to do PR B first.

**Reference app:** the user's `platinum-club` repo (Next 16 + React 19 + Tailwind v4), which already feels native when installed. This design mirrors its techniques and adds back-swipe, live updates, skeletons on every route, and iOS splash screens.

## Goal

Installed from the home screen on an iPhone or Android phone, DwellDuel behaves like a native app:
- it opens full screen with no browser chrome, and content runs edge to edge around the notch and home indicator
- no pull-to-refresh, no browser tap flash, no long-press menus on controls
- drilled-into pages can be swiped back from the left edge, with the page following the finger
- every page shows a skeleton the instant you tap
- data updates live
- it keeps working through a flaky connection

On desktop and in a normal browser tab, nothing regresses.

## Non-goals

- Anything in PR A: database indexes and the access-rule rewrite, pagination, parallel reads, error pages, the auth changes, the cron, the scale bugs.
- A native app wrapper (Capacitor and the like). DwellDuel stays a web app.
- Push notifications, and home-screen app badges.
- A client-side screen-stack navigator. Navigation stays Next's router.

## Decisions (from the user)

1. **Back-swipe follows the finger, iOS-style,** on drilled-into pages.
2. **A teal status band in both themes.** On iPhone, the time and battery sit on DwellDuel's dark teal.
3. **Live updates** replace pull-to-refresh as the way data stays fresh.
4. **Extras included:** offline support, an "Add to Home Screen" nudge, Android haptics, and home-screen shortcuts.

## Design

### 1. The home-screen app shell

- **Manifest.** `app/manifest.ts` (Next's file convention, served at `/manifest.webmanifest`) replaces `public/site.webmanifest`. It declares:
  - `id: '/'`, `start_url: '/'`, `scope: '/'`, and `display: 'standalone'`
  - name and short name "DwellDuel"
  - `background_color` and `theme_color` set to `#03272d`
  - the existing 192px, 512px and maskable 512px icons
  - `shortcuts`: "Markets" → `/markets`, and "My slip" → `/parlays`

  The root layout's `metadata.manifest` pointer and the old file are removed.
- **iOS standalone.**
  - `metadata.appleWebApp` gets `{ capable: true, title: 'DwellDuel', statusBarStyle: 'black-translucent' }`.
  - `viewport` gets `viewportFit: 'cover'` and `interactiveWidget: 'resizes-content'`. The keyboard then shrinks the page rather than covering a focused field.
  - `themeColor` stays `#03272d`.
- **Splash screens.** iOS gets `apple-touch-startup-image` entries for current iPhone sizes: a teal background with the DwellDuel symbol, generated once by a script and committed to `public/splash/`. Launching then shows the teal screen instead of a white flash.
- **The teal status band.**
  - A new token, `--status-band: #03272d`, is the same in both themes.
  - In standalone mode, a fixed strip of height `env(safe-area-inset-top)` in that colour sits behind the iOS status bar.
  - The phone top bar sits directly below it.

### 2. Edge to edge (safe areas)

- **Two variables, standalone only.** `--safe-top` and `--safe-bottom` are `0px`, except under `@media (display-mode: standalone)`, where they become `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`. A normal Safari tab already reserves this space, so the variables stay zero there.
- **Who consumes them:**
  - the phone top bar and the status band
  - the bottom tab bar's padding, and the `(app)` layout's bottom padding
  - the phone slip drawer and its "Slip (n)" trigger
  - the void dialog
  - the Toaster's phone offset
- **Why they come back:** PR B of the Design Pass dropped the inert `env()` calls. `viewport-fit=cover` makes them live again.

### 3. No browser feel

- **Overscroll.**
  - `html` and `body` get `overscroll-behavior-y: none`. That removes Android pull-to-refresh, the glow, and scroll chaining.
  - Overlay scrollers (the drawer popup, the dialog) get `overscroll-behavior: contain`.
  - iOS's root rubber-band bounce can't be disabled. `html` carries the `--bg` token as its background colour, so the bounce reveals the page colour, not white.
- **Touch polish.**
  - `-webkit-tap-highlight-color: transparent` everywhere.
  - `touch-action: manipulation` on interactive elements, which removes the double-tap-zoom delay.
  - `-webkit-touch-callout: none` and `user-select: none` only on chrome: the nav, tab bar, buttons, chips, the tappable cards and tiles. Text content stays selectable.
  - Press states on buttons, tabs, tiles and cards: a slight scale or background change on `:active`, with reduced motion respected.

### 4. Back-swipe and transitions

- **Page transitions** use React's `<ViewTransition>`, which runs automatically on App Router navigations (`02-guides/view-transitions.md`).
  - Opening a drilled-into page (a market, a profile, Create market, an admin section) sets the `nav-forward` transition type and slides in from the right.
  - Going back, by a back link or by swipe, sets `nav-back` and slides out to the right.
  - Switching tabs crossfades.
  - The top bar, the tab bar and the status band carry their own `viewTransitionName`, so they stay put while the content moves.
  - All durations drop to zero under `prefers-reduced-motion`.
- **The back-swipe gesture.** A client component on drilled-into pages listens for touches that start within 20px of the left edge.
  - **While dragging,** the page content (not the chrome) translates with the finger over a dimmed backdrop.
  - **On release,** it completes if the drag passed a third of the screen width or ended with a flick (release velocity above 0.5 px/ms). Otherwise it springs back.
  - **Where it goes:** it calls `router.back()` when the app has in-app history. The session counts navigations, since `history.length` can't be trusted. Without history (a deep link), it navigates to the page's logical parent:
    - market → `/markets`
    - profile → `/leaderboard`
    - Create market → `/markets`
    - an admin section → `/`
  - **Rules:**
    - Vertical movement cancels it, so it never fights scrolling.
    - It never starts inside the open drawer or dialog.
    - It's touch-only, so it's inert on desktop.
    - Under reduced motion, it completes without the slide.
  - **The maths is a pure function:** `backSwipeDecision({ dx, dy, width, velocity }) → 'complete' | 'cancel' | 'ignore'`.

### 5. Skeletons and instant response

- **A `loading.tsx` skeleton for every route** whose layout mirrors the real page, built from one `Skeleton` primitive: the `sunk` token with a subtle shimmer that stops under reduced motion.
  - **Covered:** markets, market detail, create market, parlays, tasks, feed, leaderboard, and each admin section.
  - **Home** moves into an `app/(app)/(home)/` route group with its own `loading.tsx`. A `loading.tsx` directly under `app/(app)/` would also wrap the profile route.
  - **Profile keeps its real HTTP 404** for unknown members. `e2e/social.spec.ts` asserts it, and a `loading.tsx` above a `notFound()` would turn it into a 200. The page does a fast existence check, then `notFound()`, and streams the activity list inside `<Suspense>` with a skeleton.
- **Skeleton-to-content swap:** a `<ViewTransition>` slides the skeleton out and the content in.
- **Signed-out redirects move into `proxy.ts`.** A `redirect('/sign-in')` from inside a page under a loading boundary becomes a client-side redirect after the skeleton shows. The proxy already knows the user, so it sends signed-out requests for `(app)` routes to `/sign-in` as a real 307. Each page's own check stays as defence in depth.
- **The markets page accepts soft 404s.** A `loading.tsx` under `markets/` makes an unknown market id return 200 with Next's not-found UI. No test asserts that status, and the app sits behind a login.
- **Non-UUID ids.** `/markets/not-a-uuid` currently throws a Postgres error and returns a 500. It's validated before the query and calls `notFound()`.
- **Prefetching.** With loading boundaries in place, Next prefetches each route's skeleton, so taps paint instantly. The nav links show a pending hint through `useLinkStatus` while a slow navigation finishes.
- **Optimistic updates.** They use `useOptimistic` and never apply to money actions.
  - **Add to parlay / Remove:** the row flips to "In your slip" or back instantly, and the nav's slip count follows through a small client context fed by the `(app)` layout.
  - **"I did this":** the row shows "Pending review" instantly.
  - **Reconciling:** the server result settles each of these. On failure, the optimistic state reverts and the inline error shows.
  - **Money actions keep their pending buttons until the server answers:** bet, parlay, resolve, void and balance adjustments.

### 6. Live updates

- **Migration.** A new migration adds `bets`, `markets`, `market_resolutions`, `parlays`, `parlay_legs`, `task_completions` and `profiles` to the `supabase_realtime` publication. Realtime is already enabled (`supabase/config.toml`).
  - Realtime's Postgres Changes respect row-level security for the signed-in client, so members only receive changes to rows they can already read.
- **Client.** A `LiveRefresh` component in the `(app)` layout subscribes to those tables and calls a debounced `router.refresh()` (about 400ms) on any change.
  - After a reconnect, it refreshes once to catch up on anything missed.
  - It replaces the `AppNav` refresh-on-tab-return, which goes away.
  - It also fixes the nav balance going stale after someone else's action.
- **Scope.** It is one channel per signed-in session. At this app's size that's fine; PR A may narrow it.

### 7. Offline and extras

- **Offline.**
  - `next.config.ts` enables `experimental.useOffline` (`05-config/01-next-config-js/useOffline.md`). Failed navigations, prefetches and server actions wait and retry once the connection returns.
  - A client banner reads Next's `useOffline()` hook and shows "You're offline — changes will send when you reconnect." while disconnected.
  - **A hand-rolled `public/sw.js`,** registered by a small client component:
    - cache-first for content-hashed `/_next/static/*`
    - network-first for navigations, falling back to a precached `/offline` page
    - everything else passes through untouched: RSC fetches, server actions and Supabase
    - no member data is cached
  - `next.config.ts` serves `/sw.js` with `Cache-Control: no-cache`.
  - `/offline` lives in `app/(auth)/offline/` with no data dependency. The proxy matcher excludes `/sw.js`, `/offline` and the manifest.
- **The Add to Home Screen nudge.**
  - It's a dismissible card on Home, and only shows when not already installed (`matchMedia('(display-mode: standalone)')`).
  - Copy differs by platform: on iPhone, "Tap Share, then Add to Home Screen"; on Android, "Open the menu, then Install app".
  - Dismissal is remembered in `localStorage`.
  - It isn't built on `beforeinstallprompt`, which iOS doesn't support.
- **Haptics.**
  - `lib/haptics.ts` offers `tap`, `success` and `error` presets over `navigator.vibrate`, a no-op where unsupported.
  - Uses: `tap` on tab-bar taps and on adding a pick; `success` on a bet or parlay placed and on an approval; `error` on an inline error.
  - Android only: iOS has no web vibration.

## Copy (new, needs sign-off)

- **Offline:**
  - banner: "You're offline — changes will send when you reconnect."
  - offline page: "You're offline" / "DwellDuel needs a connection for this page. It'll load as soon as you're back online." / "Try again"
- **Add to Home Screen card:**
  - title: "Get the app"
  - body, iPhone: "Tap Share, then Add to Home Screen."
  - body, Android: "Open the menu, then Install app."
  - dismiss button: "Not now"
- **Home-screen shortcuts:** "Markets" and "My slip".

## Testing

- **E2E:**
  - Every existing assertion keeps passing, including the profile's HTTP 404.
  - **New: back-swipe at 375px with touch.**
    - A synthetic edge drag past a third of the width navigates back.
    - A short drag doesn't.
    - A vertical drag doesn't.
  - **New: skeletons.** A slowed navigation shows the target route's skeleton before its content.
  - **New: optimistic "Add to parlay".** The row flips before the server responds.
  - **New:** the manifest serves with the expected fields.
  - **New:** a signed-out request to an `(app)` route gets a 307 to `/sign-in`.
- **Unit tests:**
  - `backSwipeDecision`, including thresholds, flicks, vertical cancel and the ignore zone
  - the navigation-depth tracker
  - the `LiveRefresh` debounce and reconnect catch-up, with the Supabase channel mocked
  - the optimistic rows reverting on failure
  - the offline banner
  - the install card per platform and after dismissal
  - haptics as a no-op without `vibrate`
- **DB test:** the realtime publication contains the listed tables.
- **Visual check** by the controller, at 375px and 1280px in light and dark, with standalone emulated through the safe-area variables:
  - status band, top bar and tab bar insets
  - the swipe mid-drag
  - skeletons for each route
  - the offline banner and page
  - the install card
- **Real-device check** (the user, after deploy): install on an iPhone and an Android phone, and confirm:
  - the full-screen launch and splash
  - the status band
  - the back-swipe feel
  - no pull-to-refresh
  - live updates between two phones
