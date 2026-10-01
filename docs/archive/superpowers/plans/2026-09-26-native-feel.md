# Native Feel and Perceived Speed (Sub-project 8, PR B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DwellDuel feel like a native app when installed to an iPhone or Android home screen, and make every interaction feel instant. That covers:
- a full-screen launch with a splash screen and a teal status band
- edge-to-edge layout around the notch and home indicator
- no pull-to-refresh and no browser tap feel
- an iOS-style back-swipe and slide transitions
- a skeleton on every route
- optimistic updates
- live data
- offline support
- an Add to Home Screen card
- Android haptics

**Architecture:**
- **Home-screen shell:** Next's `app/manifest.ts`, plus `appleWebApp` and `viewport` metadata. Safe-area CSS variables apply only in standalone mode.
- **Transitions:** React's `<ViewTransition>`, which runs automatically on App Router navigations, for route transitions and the skeleton→content reveal. Chrome is anchored with `viewTransitionName`.
- **Back-swipe:** a client touch handler driven by a pure decision function and a per-session navigation-depth tracker.
- **Skeletons:** a `loading.tsx` per route, except where a real HTTP 404 must survive (the member page streams instead). Signed-out redirects move into `proxy.ts`.
- **Optimistic updates:** `useOptimistic` for the slip and "I did this". Money actions are never optimistic.
- **Live updates:** Supabase Realtime Postgres Changes feeding a debounced `router.refresh()`.
- **Offline:** Next's `experimental.useOffline`, plus a hand-rolled service worker that never caches member data.

**Tech Stack:**
- Next.js 16 (App Router), React 19 and TypeScript
- Tailwind CSS v4.3
- Supabase (Postgres, Realtime)
- Base UI and sonner, already installed
- `sharp`, bundled with Next, for the splash generator
- Vitest 4 with React Testing Library and jsdom
- Playwright

**Spec:** [`docs/superpowers/specs/2026-09-26-native-feel-design.md`](../specs/2026-09-26-native-feel-design.md). The reference implementation of these techniques is the user's `platinum-club` repo.

**How this plan was checked.** All eleven tasks were applied in order to a fresh copy of `main` (`7ed3655`), and the full chain ran:
- lint and tsc were clean
- `npx vitest run` passed 731 tests, DB tests included
- the build passed
- Playwright passed 24/24
- Task 11's visual-check spec ran

Re-applying the final tasks to a fresh `main` reproduced the identical tree. Not run: Task 11's pinned-CLI re-run, and everything that needs a real phone.

## Global Constraints

- **Scope: this PR only.** The data-layer and reliability work is PR A, which comes later:
  - indexes and the access-rule rewrite
  - pagination and parallel reads
  - error pages, the auth changes and the cron
- **One migration only:** the realtime publication. No access-policy changes, and no changes to any coin-moving SQL function or server action's failure shape.
- **Tokens, never raw colours.**
  - `--status-band` (`#03272d` in both themes) is a token.
  - `--safe-top` / `--safe-bottom` are `0px` by default and take `env(safe-area-inset-*)` only under `@media (display-mode: standalone)`.
- **Phone-first.** `md:` switches type and padding; `lg:` switches grids. Every control is at least 44px.
- **Real elements.** Icon-only controls have `aria-label`s, and visually hidden suffixes keep their space outside the span. Links are underlined by default; button-, tab- and tile-styled links carry `no-underline`.
- **Forms.** Every submit button posting a server action is a `FormSubmitButton`. Success toasts go through `withSuccessToast` / `ToastActionForm`, and errors stay inline.
- **Never optimistic:** bet, parlay, resolve, void and balance adjustments.
- **The service worker never caches** per-member HTML, RSC payloads, server actions or Supabase responses.
- **Reduced motion is respected everywhere:** transitions, the back-swipe slide, the skeleton shimmer and press states.
- **The e2e contract.** Every existing asserted string, role and count keeps resolving the same way. In particular:
  - the member page's **real HTTP 404**
  - exactly one "Pending review" per submitted task
  - exactly one "In your slip" per market
  - no second "Place parlay", "Stake (DC)" or "Void this market" on desktop

  Existing specs may gain *waits* for server responses (because optimistic UI changes timing), never changed assertions.
- **E2E counts:** 18 before this PR, then after each task: 19, 19, 20, 21, 21, 22, 23, 23, 24, 24, 24.
- **Where files live.** Presentational pieces go in `components/<area>/`. Forms and client pieces that import server actions stay beside their route. Tests go in `tests/components/`, `tests/lib/` and `tests/db/`.
- **Code style:** single quotes, no semicolons, and comments only for a non-obvious why. Quote `(app)` / `(home)` / `[id]` paths in shell commands.
- **Next.js 16 differs from older versions.** Read `node_modules/next/dist/docs/` before writing anything Next-specific.
- **Local Supabase must be running.** `npx vitest run` includes `tests/db/`, which wipes and reseeds it.
- **Reinstall first.** Run `npm ci` before Task 1 if `node_modules` predates Design Pass PR C.

## Rulings this plan makes

- **Existing e2e specs wait for the server.** `parlays`, `slip-drawer`, `coin-economy` and `admin-controls` wait for the server action response after optimistic changes. Without the wait, navigating away aborts the request. No assertion changes.
- **`tasks` is also in the realtime publication,** so new tasks appear live. The spec's list omitted it.
- **Replacing a pick flips the old pick off in the same commit** (a `MarketSlipProvider`), so one market never shows two "In your slip" chips.
- **`LiveRefresh` also refreshes when the app returns to the foreground,** because phones suspend the socket in the background. `AppNav`'s old visibility refresh is removed.
- **Playwright blocks service workers suite-wide** (`serviceWorkers: 'block'`), so request interception stays reliable. Only the offline spec re-enables them.
- **The back-swipe goes back without a transition when there's history.** With in-app history it calls a plain `router.back()`: React commits back navigations synchronously, so no view transition runs, and the page has already slid off under the finger. From a deep link it calls `router.push(logicalParent, { transitionTypes: ['nav-back'] })`.
- **One combined transition wrapper.** The skeleton reveal and the route transitions are composed in one `ViewTransition` mapping in `components/nav/page-transition.tsx`, so neither silences the other. Pages opt in through a `Page` prop.
- **Haptics:**
  - a success buzz on form-action success toasts
  - an error buzz via the error `Message`
  - a tap buzz on tab-bar taps and adding or removing a pick (so the slip toasts don't buzz twice)
  - no buzz on bulk approve
- **iOS gets the extra `apple-mobile-web-app-capable` tag.** Next 16 emits only `mobile-web-app-capable`, so the Apple tag is added as insurance for the splash screens.
- **The install card shows on iPhone, iPad and Android only,** and never when already installed.

---

## Task 1: Home-screen shell — manifest, iOS standalone, safe-area tokens, status band and splash screens

Installed from the home screen, DwellDuel opens full screen, edge to edge, with DwellDuel's teal behind the iPhone status bar and a teal launch screen instead of a white flash. This task builds the shell. Task 2 then moves the chrome and overlays inside the safe area.

What changes:
- **Manifest.** `app/manifest.ts` (Next's file convention, served at `/manifest.webmanifest` and linked automatically) replaces `public/site.webmanifest` and the root layout's `metadata.manifest` pointer.
- **Metadata and viewport** move out of `app/layout.tsx` into `lib/app-shell/site-metadata.ts`, so a node unit test can import them. `app/layout.tsx` imports `next/font/google`, which only works inside Next's compiler. The layout re-exports them.
- **iOS standalone:** `appleWebApp` (capable, title, `black-translucent`), `viewportFit: 'cover'` and `interactiveWidget: 'resizes-content'`.
- **Tokens:** `--safe-top` / `--safe-bottom` (0px, or the device insets under `display-mode: standalone`) and `--status-band` (`#03272D` in both themes, used through `bg-status-band`).
- **The status band:** a fixed teal strip, `--safe-top` tall, mounted in the root layout so it covers every page, including sign-in. `body` gets `padding-top: var(--safe-top)`, so no page's first content hides under it. Outside standalone, both are 0px and nothing moves.
- **Splash screens:** one portrait PNG per current iPhone viewport. A committed script, `scripts/generate-splash.mjs`, makes them with `sharp`, and they're committed to `public/splash/`. `appleWebApp.startupImage` links each one with a device media query.

**Files:**
- Create: `app/manifest.ts`
- Delete: `public/site.webmanifest`
- Create: `lib/app-shell/splash-devices.json`
- Create: `lib/app-shell/site-metadata.ts`
- Create: `components/app-shell/status-band.tsx`
- Modify: `app/layout.tsx` (anchored edits)
- Modify: `app/globals.css` (anchored edits: tokens, the standalone block, the Tailwind colour, body padding)
- Create: `scripts/generate-splash.mjs`
- Create (generated, committed): `public/splash/iphone-{W}x{H}.png`, 11 files
- Test: `tests/lib/app-shell/manifest.test.ts`
- Test: `tests/lib/app-shell/site-metadata.test.ts`
- Test: `tests/components/status-band.test.tsx`
- Create: `e2e/home-screen.spec.ts`

**Interfaces:**
- Consumes:
  - Next 16's `MetadataRoute.Manifest`, `Metadata` and `Viewport` types. They were checked against `node_modules/next/dist/lib/metadata/types/{manifest-types,extra-types}.d.ts`:
    - `appleWebApp.startupImage: AppleImage | AppleImage[]`, where `AppleImage = string | { url: string; media?: string }`
    - `viewportFit: 'auto' | 'cover' | 'contain'`
    - `interactiveWidget: 'resizes-visual' | 'resizes-content' | 'overlays-content'`
  - `sharp`, already in `node_modules` as Next's optional image optimiser (`npm ls sharp` → `next@16.3.5 └── sharp@0.35.4`). It's used only by the one-off generator script. Don't add it to `package.json`.
  - The existing icons in `public/`: `android-chrome-192.png`, `android-chrome-512.png`, `maskable-512.png`.
- Produces (later tasks consume these exact names):
  - CSS custom properties in `app/globals.css` `:root`:
    - `--safe-top` and `--safe-bottom`: `0px` by default. Under `@media (display-mode: standalone)` they become `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
    - `--status-band: #03272D`, the same in both themes. Tailwind colour `--color-status-band`, so the utility is `bg-status-band`.
  - Use them in Tailwind as `top-(--safe-top)`, `h-(--safe-top)` or `pb-[calc(12px+var(--safe-bottom))]`. Tailwind v4 adds the spaces around `+`/`-` inside `calc()`; this was checked in the built CSS.
  - `components/app-shell/status-band.tsx`: `export function StatusBand(): JSX.Element`, mounted once in `app/layout.tsx`. Task 5 gives it a `viewTransitionName`.
  - `lib/app-shell/site-metadata.ts`:
    ```ts
    export const BRAND_TEAL: '#03272d'
    export type SplashDevice = { width: number; height: number; ratio: number }
    export function splashPath(device: SplashDevice): string   // '/splash/iphone-1179x2556.png'
    export function splashMedia(device: SplashDevice): string  // 'screen and (device-width: 393px) and … (orientation: portrait)'
    export const siteMetadata: Metadata
    export const siteViewport: Viewport
    ```
  - `/manifest.webmanifest`. Task 3's proxy matcher must exclude it. The splash PNGs are already excluded by the proxy's `.png` rule.

**Where the iPhone list comes from.** Apple's Human Interface Guidelines, Layout → "iOS, iPadOS device screen dimensions". The live page's September 9, 2026 revision no longer carries the table, so the list was read from the archived copy: <https://web.archive.org/web/20251201140322/https://developer.apple.com/design/human-interface-guidelines/layout> (JSON source: `…/tutorials/data/design/human-interface-guidelines/layout.json`). "Current" means the iPhones iOS 26 supports: iPhone 11 and later, plus iPhone SE 2nd/3rd generation. Each distinct portrait viewport gets one splash:

| CSS points | Scale | PNG pixels | Devices (HIG table) |
|---|---|---|---|
| 440×956 | 3 | 1320×2868 | iPhone 17 Pro Max, 16 Pro Max |
| 430×932 | 3 | 1290×2796 | iPhone 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max |
| 428×926 | 3 | 1284×2778 | iPhone 14 Plus, 13 Pro Max, 12 Pro Max |
| 420×912 | 3 | 1260×2736 | iPhone Air |
| 414×896 | 3 | 1242×2688 | iPhone 11 Pro Max |
| 414×896 | 2 | 828×1792 | iPhone 11 |
| 402×874 | 3 | 1206×2622 | iPhone 17 Pro, 17, 16 Pro |
| 393×852 | 3 | 1179×2556 | iPhone 16, 15 Pro, 15, 14 Pro |
| 390×844 | 3 | 1170×2532 | iPhone 16e, 14, 13 Pro, 13, 12 Pro, 12 |
| 375×812 | 3 | 1125×2436 | iPhone 13 mini, 12 mini, 11 Pro |
| 375×667 | 2 | 750×1334 | iPhone SE 4.7-inch (2nd/3rd gen) |

Each gets the media query `screen and (device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {scale}) and (orientation: portrait)`. That's the form in Next's own `appleWebApp` example (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`, "appleWebApp"), plus the pixel ratio and orientation that tell the 414×896 @2 and @3 models apart. A future iPhone with a new viewport finds no match, and iOS falls back to the manifest's `background_color`. To add one, append it to `splash-devices.json` and re-run the script.

**Why an extra `apple-mobile-web-app-capable` tag.** Next 16's `appleWebApp.capable` emits only `<meta name="mobile-web-app-capable">` (see `node_modules/next/dist/lib/metadata/metadata.js`, "Apple Web App"). iOS has historically required Apple's own tag before it shows `apple-touch-startup-image` splash screens. `metadata.other` adds it next to Next's tag. Chrome only warns about the Apple tag when the standard one is missing, and it isn't.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/lib/app-shell/manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import manifest from '@/app/manifest'

describe('manifest', () => {
  it('launches standalone from the root with a stable id', () => {
    expect(manifest()).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      name: 'DwellDuel',
      short_name: 'DwellDuel',
    })
  })

  it('paints the splash and OS chrome in the brand teal', () => {
    expect(manifest()).toMatchObject({ background_color: '#03272d', theme_color: '#03272d' })
  })

  it('lists the 192, 512 and maskable 512 icons, and every one exists in public/', () => {
    const icons = manifest().icons ?? []
    expect(icons).toEqual([
      { src: '/android-chrome-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
    for (const icon of icons) {
      expect(existsSync(path.join(process.cwd(), 'public', icon.src))).toBe(true)
    }
  })

  it('offers the Markets and My slip shortcuts', () => {
    expect(manifest().shortcuts).toEqual([
      { name: 'Markets', url: '/markets' },
      { name: 'My slip', url: '/parlays' },
    ])
  })
})
```

Create `tests/lib/app-shell/site-metadata.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { siteMetadata, siteViewport, splashMedia, splashPath } from '@/lib/app-shell/site-metadata'
import splashDevices from '@/lib/app-shell/splash-devices.json'

type StartupImage = { url: string; media: string }

describe('siteMetadata', () => {
  it('no longer points at a hand-written manifest, since app/manifest.ts is linked automatically', () => {
    expect(siteMetadata.manifest).toBeUndefined()
  })

  it('makes iOS open it as a full-screen app with a translucent status bar', () => {
    expect(siteMetadata.appleWebApp).toMatchObject({
      capable: true,
      title: 'DwellDuel',
      statusBarStyle: 'black-translucent',
    })
    expect(siteMetadata.other).toEqual({ 'apple-mobile-web-app-capable': 'yes' })
  })

  it('names a portrait splash screen for every listed iPhone, each committed to public/splash', () => {
    const images = (siteMetadata.appleWebApp as { startupImage: StartupImage[] }).startupImage
    expect(images).toHaveLength(splashDevices.length)
    expect(new Set(images.map((image) => image.url)).size).toBe(images.length)
    for (const image of images) {
      expect(image.url).toMatch(/^\/splash\/iphone-\d+x\d+\.png$/)
      expect(existsSync(path.join(process.cwd(), 'public', image.url))).toBe(true)
    }
  })

  it('matches each splash screen to its device by CSS size, pixel ratio and orientation', () => {
    const iphone16 = { width: 393, height: 852, ratio: 3 }
    expect(splashPath(iphone16)).toBe('/splash/iphone-1179x2556.png')
    expect(splashMedia(iphone16)).toBe(
      'screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    )
    const images = (siteMetadata.appleWebApp as { startupImage: StartupImage[] }).startupImage
    expect(images).toContainEqual({ url: splashPath(iphone16), media: splashMedia(iphone16) })
  })
})

describe('siteViewport', () => {
  it('runs edge to edge, lets the keyboard resize the page, and keeps the teal theme colour', () => {
    expect(siteViewport).toEqual({
      themeColor: '#03272d',
      viewportFit: 'cover',
      interactiveWidget: 'resizes-content',
    })
  })
})
```

Create `tests/components/status-band.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusBand } from '@/components/app-shell/status-band'

describe('StatusBand', () => {
  it('is a decorative teal strip fixed to the top, as tall as the standalone top inset', () => {
    const { container } = render(<StatusBand />)
    const band = container.firstElementChild
    expect(band).toHaveAttribute('aria-hidden', 'true')
    expect(band).toHaveClass('fixed', 'top-0', 'inset-x-0', 'h-(--safe-top)', 'bg-status-band', 'pointer-events-none')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/app-shell tests/components/status-band.test.tsx`
Expected: FAIL. All 3 files fail to import (`@/app/manifest`, `@/lib/app-shell/site-metadata` and `@/components/app-shell/status-band` don't exist yet).

- [ ] **Step 3: Create the device list, the metadata module, the manifest and the status band**

Create `lib/app-shell/splash-devices.json`. It's the single source for both the generator script and the metadata, in the table's order:

```json
[
  { "width": 440, "height": 956, "ratio": 3 },
  { "width": 430, "height": 932, "ratio": 3 },
  { "width": 428, "height": 926, "ratio": 3 },
  { "width": 420, "height": 912, "ratio": 3 },
  { "width": 414, "height": 896, "ratio": 3 },
  { "width": 414, "height": 896, "ratio": 2 },
  { "width": 402, "height": 874, "ratio": 3 },
  { "width": 393, "height": 852, "ratio": 3 },
  { "width": 390, "height": 844, "ratio": 3 },
  { "width": 375, "height": 812, "ratio": 3 },
  { "width": 375, "height": 667, "ratio": 2 }
]
```

Create `lib/app-shell/site-metadata.ts`. The icon, OG and title values are moved unchanged from `app/layout.tsx`; only `manifest` is dropped.

```ts
import type { Metadata, Viewport } from 'next'
import splashDevices from './splash-devices.json'

export const BRAND_TEAL = '#03272d'

export type SplashDevice = { width: number; height: number; ratio: number }

export function splashPath({ width, height, ratio }: SplashDevice): string {
  return `/splash/iphone-${width * ratio}x${height * ratio}.png`
}

export function splashMedia({ width, height, ratio }: SplashDevice): string {
  return `screen and (device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`
}

export const siteMetadata: Metadata = {
  metadataBase: new URL('https://www.dwellduel.com'),
  title: 'DwellDuel',
  description: 'Friendly bets. Faithful study.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon-180.png',
  },
  openGraph: { images: ['/og-image-1200x630.png'] },
  // iOS ignores theme_color for the status bar in an installed app. black-translucent lets the
  // page draw under it, where the status band paints the teal behind the time and battery.
  appleWebApp: {
    capable: true,
    title: 'DwellDuel',
    statusBarStyle: 'black-translucent',
    startupImage: (splashDevices as SplashDevice[]).map((device) => ({
      url: splashPath(device),
      media: splashMedia(device),
    })),
  },
  // Next's `capable` emits only the standard mobile-web-app-capable tag. iOS has historically
  // needed Apple's own tag before it shows apple-touch-startup-image splash screens.
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

// viewport-fit=cover lets the page run under the notch and home indicator; the --safe-* tokens
// in globals.css put the chrome back inside the safe area. resizes-content makes the keyboard
// shrink the layout viewport instead of covering a focused field.
export const siteViewport: Viewport = {
  themeColor: BRAND_TEAL,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
}
```

Create `app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'
import { BRAND_TEAL } from '@/lib/app-shell/site-metadata'

export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable identity apart from start_url, so moving the launch page later doesn't read as a new app to the OS.
    id: '/',
    name: 'DwellDuel',
    short_name: 'DwellDuel',
    description: 'Friendly bets. Faithful study.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BRAND_TEAL,
    theme_color: BRAND_TEAL,
    icons: [
      { src: '/android-chrome-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Android's long-press menu on the home-screen icon. iOS doesn't support manifest shortcuts.
    shortcuts: [
      { name: 'Markets', url: '/markets' },
      { name: 'My slip', url: '/parlays' },
    ],
  }
}
```

Create `components/app-shell/status-band.tsx`:

```tsx
// Standalone iOS draws the time and battery over the page (black-translucent), so this strip
// gives them DwellDuel's teal in both themes. --safe-top is 0px outside standalone, so it
// takes no space in a browser tab or on desktop.
export function StatusBand() {
  return <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-30 h-(--safe-top) bg-status-band" />
}
```

It sits at `z-30`, the nav's level; the two never overlap. The drawer and dialog scrims (`z-40`) dim it like the rest of the page, as a native sheet dims the status bar.

- [ ] **Step 4: Add the tokens to `app/globals.css`**

(a) At the end of the light `:root` block, replace:

```css
  --s6: #B0306F;
}
```

with:

```css
  --s6: #B0306F;
  --status-band: #03272D;
  --safe-top: 0px;
  --safe-bottom: 0px;
}

/* viewport-fit=cover makes env(safe-area-inset-*) non-zero in a normal Safari tab too, where
   Safari's own bars already keep clear of the notch and home indicator. Only the installed app
   has no browser chrome, so only there does the page reserve the insets itself. */
@media (display-mode: standalone) {
  :root {
    --safe-top: env(safe-area-inset-top);
    --safe-bottom: env(safe-area-inset-bottom);
  }
}
```

Only the light block's `--s6: #B0306F;` is followed directly by `}`. The dark blocks use `#FF8FC4`, so the match is unique. The dark blocks don't redefine the three new variables: the band is the same teal in both themes.

(b) In `@theme inline`, replace:

```css
  --color-scrim: var(--scrim);
```

with:

```css
  --color-scrim: var(--scrim);
  --color-status-band: var(--status-band);
```

(c) In `@layer base`, replace:

```css
  body {
    background: var(--bg);
```

with:

```css
  body {
    /* Keeps every page's first content below the fixed status band. */
    padding-top: var(--safe-top);
    background: var(--bg);
```

`body` is `min-h-full` under Tailwind's `box-sizing: border-box`, so the padding never adds a scrollbar.

- [ ] **Step 5: Wire the root layout and delete the old manifest**

In `app/layout.tsx`:

(a) Replace:

```tsx
import type { Metadata, Viewport } from 'next'
import { Manrope } from 'next/font/google'
```

with:

```tsx
import { Manrope } from 'next/font/google'
```

(b) Replace:

```tsx
import { SpeedInsights } from '@vercel/speed-insights/next'
import { resolveTheme, THEME_COOKIE } from '@/lib/theme/theme'
```

with:

```tsx
import { SpeedInsights } from '@vercel/speed-insights/next'
import { StatusBand } from '@/components/app-shell/status-band'
import { siteMetadata, siteViewport } from '@/lib/app-shell/site-metadata'
import { resolveTheme, THEME_COOKIE } from '@/lib/theme/theme'
```

(c) Replace the whole `export const metadata: Metadata = { … }` and `export const viewport: Viewport = { … }` blocks, from `export const metadata: Metadata = {` through the viewport's closing `}`, with:

```tsx
export const metadata = siteMetadata

export const viewport = siteViewport
```

(d) Replace:

```tsx
      <body className="flex min-h-full flex-col">
        {children}
```

with:

```tsx
      <body className="flex min-h-full flex-col">
        <StatusBand />
        {children}
```

Then delete the old manifest:

```bash
git rm public/site.webmanifest
```

Nothing else referenced it: after this step, `grep -rn webmanifest app components lib` finds nothing.

- [ ] **Step 6: Write the splash generator and run it**

Create `scripts/generate-splash.mjs`:

```js
// Regenerates the iOS launch screens in public/splash/ from lib/app-shell/splash-devices.json.
// Run by hand after changing that list or the symbol: `node scripts/generate-splash.mjs`.
// It uses sharp, which Next installs as its own image optimiser; it is not a runtime dependency.
import { mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import devices from '../lib/app-shell/splash-devices.json' with { type: 'json' }

const OUT_DIR = path.join(import.meta.dirname, '..', 'public', 'splash')

// The same art as DwellDuelSymbol (components/brand/wordmark.tsx), in its dark-theme colours,
// since the splash is teal in both themes.
const TEAL = '#03272D'
const LIME = '#72DB2B'
const WHITE = '#FFFFFF'
const LEAF = 'M50 3 C60 11 57 24 48 27 C41 20 43 10 50 3 Z'
const D_SHAPE = 'M14 26 H42 A24 24 0 0 1 42 74 H14 Z M28 40 H42 A10 10 0 0 1 42 60 H28 Z'

function splashSvg(width, height) {
  const symbol = Math.round(Math.min(width, height) * 0.32)
  const x = Math.round((width - symbol) / 2)
  const y = Math.round((height - symbol) / 2)
  const leaves = [30, 50, 70, 90].map((angle) => `<path d="${LEAF}" transform="rotate(${angle} 50 50)"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${TEAL}"/>
  <svg x="${x}" y="${y}" width="${symbol}" height="${symbol}" viewBox="0 0 100 100">
    <g transform="translate(50 50) translate(-55.5 -41.5)">
      <g fill="${LIME}">${leaves}</g>
      <path fill="${WHITE}" fill-rule="evenodd" d="${D_SHAPE}"/>
    </g>
  </svg>
</svg>`
}

await mkdir(OUT_DIR, { recursive: true })
for (const file of await readdir(OUT_DIR)) {
  if (file.endsWith('.png')) await rm(path.join(OUT_DIR, file))
}

for (const { width, height, ratio } of devices) {
  const pxWidth = width * ratio
  const pxHeight = height * ratio
  const file = path.join(OUT_DIR, `iphone-${pxWidth}x${pxHeight}.png`)
  await sharp(Buffer.from(splashSvg(pxWidth, pxHeight)))
    .png({ compressionLevel: 9, palette: true })
    .toFile(file)
  console.log(`wrote ${path.relative(process.cwd(), file)}`)
}
```

The raw hex values are the brand art, burned into a PNG, so they aren't UI styling; the tokens rule doesn't apply. The script is `.mjs`, not `.ts`: `next build` type-checks every `.ts` in the repo, and Node's native type stripping needs `.ts` import extensions, which this tsconfig rejects.

Run: `node scripts/generate-splash.mjs`
Expected: 11 lines, `wrote public/splash/iphone-1320x2868.png` through `wrote public/splash/iphone-750x1334.png`. About 80 KB in total, since the palette PNGs are flat colour.

Check one: open `public/splash/iphone-1179x2556.png`. It's a full teal (`#03272D`) portrait with the white D and lime leaves centred, about a third of the width. If `sharp` is missing (`Cannot find package 'sharp'`), run `npm install` first. It arrives with `next`.

- [ ] **Step 7: Run the unit tests to verify they pass**

Run: `npx vitest run tests/lib/app-shell tests/components/status-band.test.tsx`
Expected: PASS (3 files, 10 tests)

- [ ] **Step 8: Write `e2e/home-screen.spec.ts`**

It reads the head from `/sign-in`, which renders the root layout with or without a session, so the spec doesn't depend on Task 3's redirects.

```ts
import { test, expect } from '@playwright/test'

test('the app installs to the home screen with its manifest, splash screens and edge-to-edge viewport', async ({ page, request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/manifest+json')
  expect(await response.json()).toMatchObject({
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    name: 'DwellDuel',
    background_color: '#03272d',
    theme_color: '#03272d',
    shortcuts: [
      { name: 'Markets', url: '/markets' },
      { name: 'My slip', url: '/parlays' },
    ],
  })
  expect((await request.get('/site.webmanifest')).status()).toBe(404)

  // The sign-in page renders the root layout's head without depending on the session.
  await page.goto('/sign-in')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /interactive-widget=resizes-content/)
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black-translucent')

  const splashes = page.locator('link[rel="apple-touch-startup-image"]')
  await expect(splashes).toHaveCount(11)
  const firstSplash = await splashes.first().getAttribute('href')
  const image = await request.get(firstSplash!)
  expect(image.status()).toBe(200)
  expect(image.headers()['content-type']).toBe('image/png')
})
```

- [ ] **Step 9: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS. The build's route table lists `○ /manifest.webmanifest` (static).

Check the built output (the server must be running, so do this after starting `npm run start` or during the Playwright run's server):

```bash
npm run start &
sleep 4
curl -s http://localhost:3000/sign-in | grep -o '<meta name="viewport"[^>]*>\|<link rel="manifest"[^>]*>\|<meta name="apple-mobile-web-app[^>]*>'
cat .next/static/chunks/*.css | grep -o -E '@media \(display-mode:standalone\)\{:root\{[^}]*\}|\.bg-status-band\{[^}]*\}|\.h-\\\(--safe-top\\\)\{[^}]*\}'
lsof -ti:3000 | xargs -r kill
```

Expected:
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"/>`
- `<link rel="manifest" href="/manifest.webmanifest"/>`
- `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` (DwellDuel) and `apple-mobile-web-app-status-bar-style` (black-translucent)
- `@media (display-mode:standalone){:root{--safe-top:env(safe-area-inset-top);--safe-bottom:env(safe-area-inset-bottom)}`
- `.bg-status-band{background-color:var(--status-band)}`
- `.h-\(--safe-top\){height:var(--safe-top)}`

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 19 passed. That's the 18 before this PR plus `home-screen.spec.ts`. No existing spec changes: outside standalone every new variable is `0px`, so nothing moves.

- [ ] **Step 10: Commit**

```bash
git add app/manifest.ts app/layout.tsx app/globals.css lib/app-shell components/app-shell scripts/generate-splash.mjs public/splash tests/lib/app-shell tests/components/status-band.test.tsx e2e/home-screen.spec.ts
git commit -m "Add the home-screen shell: manifest, iOS standalone, status band and splash screens"
```

(`git rm` in Step 5 already staged the deletion of `public/site.webmanifest`.)

---

## Task 2: Edge to edge and no browser feel — safe areas, overscroll, touch polish and press states

Task 1 made the page run under the notch and the home indicator in the installed app. This task moves the chrome and overlays back inside the safe area. It also removes what gives a web page away on a phone:
- pull-to-refresh and the overscroll glow
- the tap flash
- the long-press callout on controls
- controls that don't react to a press

**Who consumes the safe-area variables:**

| Where | Before | After |
|---|---|---|
| Desktop and phone top bars (`AppNav`) | `sticky top-0` | `sticky top-(--safe-top)`, directly below the status band. `body`'s `padding-top` (Task 1) places them there before any scroll. |
| Phone tab bar (`AppNav`) | `pb-3` | `pb-[calc(12px+var(--safe-bottom))]` |
| `(app)` layout `<main>` | `pb-[82px]` | `pb-[calc(82px+var(--safe-bottom))]` |
| "Slip (n)" trigger | `bottom-[94px]` | `bottom-[calc(94px+var(--safe-bottom))]` |
| Slip drawer popup | `max-h-[calc(100dvh-48px)]` | `max-h-[calc(100dvh-48px-var(--safe-top))]`, so the sheet never rises under the status bar |
| Slip drawer scroller | `pb-6` | `pb-[calc(24px+var(--safe-bottom))]`, so Place parlay clears the home indicator |
| Void dialog popup | `top-1/2`, no height cap | Centred in the safe rectangle: `top-[calc(50%+(var(--safe-top)-var(--safe-bottom))/2)]`, `max-h-[calc(100dvh-32px-var(--safe-top)-var(--safe-bottom))]`, `overflow-y-auto overscroll-contain` |
| Toaster phone offset | `top: 80` | `top: 'calc(80px + var(--safe-top))'`. Sonner passes a string offset through to its CSS variable unchanged (`assignOffset` in `node_modules/sonner/dist/index.mjs`). |

Outside standalone every variable is `0px`, so each `calc()` equals today's value. No e2e box or position changes.

**No browser feel (`app/globals.css`):**
- `html`:
  - `background-color: var(--bg)`. iOS's rubber-band bounce can't be disabled, and it paints `html`'s background colour, so the bounce shows the page colour instead of white.
  - `overscroll-behavior-y: none`
  - `-webkit-tap-highlight-color: transparent` (inherited, so it applies everywhere)
- `body`: `overscroll-behavior-y: none`, which removes Android pull-to-refresh, the glow and scroll chaining.
- Overlay scrollers already or now carry `overscroll-contain`: the drawer's `Drawer.Content` already has it, and the void dialog popup gets it here.
- `touch-action: manipulation` on `a, button, input, select, textarea, label, summary, [role="button"]`. It drops the double-tap-zoom wait but still allows panning and pinch zoom.
- Two utilities, both declared with Tailwind v4's `@utility` so they sit in the utilities layer and work with variants:
  - `no-callout`: `-webkit-touch-callout: none` and `user-select: none`. It goes on chrome containers: both top bars, the tab bar, the admin section tabs and status chips. It isn't global, so text content stays selectable.
  - `pressable`: the same callout and selection rules, plus the press state. On `:active` the element scales to `0.97` with a 120ms `scale` transition. Under `prefers-reduced-motion: reduce` there's no transition and no scale, only `opacity: 0.7` while pressed. Disabled and `aria-disabled="true"` elements don't react. It goes on every control that is tapped:
    - `Button` / `buttonVariants`, and so every button-styled link, `FormSubmitButton`, the drawer trigger and the dialog buttons
    - the nav links, the phone Admin icon and the theme toggle
    - the tab-bar tabs, the admin section tabs and the chart's range toggles
    - the Home tiles and the drawer's close button

  **Which cards are tappable:** only the Home tiles are whole-card links. The market card and the leaderboard row link just their title or name, which stays an ordinary underlined text link, so they get no press state.

`pressable` declares the `transition` shorthand. Don't combine it with a Tailwind `transition-*` utility on the same element; none of today's targets has one. iOS applies `:active` only when a touch listener exists. React 19 attaches its `touchstart` listener at the root, so this works without extra code.

**Files:**
- Modify: `app/globals.css` (anchored edits: two `@utility` blocks, `html`, `body`, `touch-action`)
- Modify: `components/app-nav/app-nav.tsx` (class strings only)
- Modify: `components/app-nav/theme-toggle.tsx`
- Modify: `components/ui/button.tsx`
- Modify: `components/ui/status-chip.tsx`
- Modify: `components/ui/toaster.tsx`
- Modify: `components/admin/admin-nav.tsx`
- Modify: `components/home/home-tiles.tsx`
- Modify: `components/markets/probability-chart.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/markets/[id]/slip-drawer.tsx`
- Modify: `app/(app)/markets/[id]/void-button.tsx`
- Test (modify): `tests/components/app-nav.test.tsx`, `tests/components/ui.test.tsx`, `tests/components/slip-drawer.test.tsx`, `tests/components/void-button.test.tsx`, `tests/components/admin-nav.test.tsx`, `tests/components/home-tiles.test.tsx`
- Test (create): `tests/components/toaster.test.tsx`

**Interfaces:**
- Consumes (Task 1): `--safe-top`, `--safe-bottom` and body `padding-top: var(--safe-top)` in `app/globals.css`.
- Produces:
  - `pressable`, a Tailwind utility class for any tappable control. It combines callout off, selection off and the reduced-motion-aware press state. Tasks 4–10 put it on new tappable chrome, for example Task 10's "Not now" if it isn't a `Button`.
  - `no-callout`, a Tailwind utility class for non-interactive chrome containers.
  - No component props change.

- [ ] **Step 1: Write the failing tests**

(a) `tests/components/app-nav.test.tsx`: insert these two cases directly above `it('offers a skip-to-content link as the first link on the page', () => {`:

```tsx
  it('keeps the phone chrome inside the installed app\'s safe area', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin />)
    for (const header of screen.getAllByRole('banner')) expect(header).toHaveClass('sticky', 'top-(--safe-top)')
    const phone = screen.getAllByRole('navigation', { name: 'Primary' })[1]
    expect(phone).toHaveClass('fixed', 'bottom-0', 'pb-[calc(12px+var(--safe-bottom))]')
  })

  it('keeps the nav off the long-press menu and gives every nav control a press state', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin />)
    for (const header of screen.getAllByRole('banner')) expect(header).toHaveClass('no-callout')
    const [desktop, phone] = screen.getAllByRole('navigation', { name: 'Primary' })
    expect(phone).toHaveClass('no-callout')
    for (const link of [...within(desktop).getAllByRole('link'), ...within(phone).getAllByRole('link')]) {
      expect(link).toHaveClass('pressable')
    }
    for (const toggle of screen.getAllByRole('button', { name: /Switch to (dark|light) theme/ })) {
      expect(toggle).toHaveClass('pressable')
    }
  })

```

(b) `tests/components/ui.test.tsx`: insert directly above `it('looks disabled under aria-disabled too, not just the disabled attribute', () => {`:

```tsx
  it('gives every variant the shared press state', () => {
    for (const variant of ['primary', 'secondary', 'danger', 'quiet'] as const) {
      expect(buttonVariants({ variant }).split(' ')).toContain('pressable')
    }
  })

```

and directly above `it('colours itself by tone', () => {`:

```tsx
  it('keeps chips off the long-press menu', () => {
    render(<StatusChip tone="open">Open</StatusChip>)
    expect(screen.getByText('Open')).toHaveClass('no-callout')
  })

```

(c) `tests/components/slip-drawer.test.tsx`. Replace:

```tsx
    expect(trigger).toHaveClass('md:hidden', 'fixed', 'bottom-[94px]')
```

with:

```tsx
    expect(trigger).toHaveClass('md:hidden', 'fixed', 'bottom-[calc(94px+var(--safe-bottom))]')
```

and insert directly above `it('closes the sheet when a link inside it is clicked', async () => {`:

```tsx
  it('keeps the open sheet clear of the status band and its last control above the home indicator', async () => {
    render(<SlipDrawer slip={slipView([pick(1), pick(2)])} />)
    await userEvent.click(screen.getByRole('button', { name: 'Slip (2)' }))
    const sheet = await screen.findByRole('dialog', { name: 'Your slip' })

    expect(sheet).toHaveClass('max-h-[calc(100dvh-48px-var(--safe-top))]')
    const scroller = within(sheet).getByRole('button', { name: 'Place parlay' }).closest('.overflow-y-auto')
    expect(scroller).toHaveClass('overscroll-contain', 'pb-[calc(24px+var(--safe-bottom))]')
  })

```

(d) `tests/components/void-button.test.tsx`: insert directly above `it('closes on Cancel and on Escape without voiding, returning focus to the trigger', async () => {`:

```tsx
  it('centres the dialog inside the safe area and keeps its scrolling to itself', async () => {
    render(<VoidButton marketId="m1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Void this market' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Void this market?' })
    expect(dialog).toHaveClass(
      'top-[calc(50%+(var(--safe-top)-var(--safe-bottom))/2)]',
      'max-h-[calc(100dvh-32px-var(--safe-top)-var(--safe-bottom))]',
      'overflow-y-auto',
      'overscroll-contain',
    )
  })

```

(e) `tests/components/admin-nav.test.tsx`: insert directly above `it.each(SECTIONS)(`:

```tsx
  it('behaves like a native segmented control: no long-press menu, a press state on each tab', () => {
    render(<AdminNav />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    expect(nav).toHaveClass('no-callout')
    for (const link of within(nav).getAllByRole('link')) expect(link).toHaveClass('pressable')
  })

```

(f) `tests/components/home-tiles.test.tsx`: insert after the existing test's closing `})`, inside the `describe`:

```tsx

  it('gives each tile a press state', () => {
    render(<HomeTiles tiles={[{ id: 'markets', href: '/markets', icon: ChartColumn, title: 'Markets', subtitle: '3 open markets' }]} />)
    expect(screen.getByRole('link', { name: /Markets/ })).toHaveClass('pressable')
  })
```

(g) Create `tests/components/toaster.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const { toasterProps } = vi.hoisted(() => ({ toasterProps: [] as Record<string, unknown>[] }))
vi.mock('sonner', () => ({
  Toaster: (props: Record<string, unknown>) => {
    toasterProps.push(props)
    return null
  },
}))

import { Toaster } from '@/components/ui/toaster'

function mockDesktop(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

beforeEach(() => {
  toasterProps.length = 0
})

describe('Toaster', () => {
  it('drops phone toasts below the top bar and, in the installed app, the status band', () => {
    mockDesktop(false)
    render(<Toaster />)
    const props = toasterProps.at(-1)!
    const phoneOffset = { top: 'calc(80px + var(--safe-top))', left: 16, right: 16 }
    expect(props.position).toBe('top-center')
    expect(props.offset).toEqual(phoneOffset)
    expect(props.mobileOffset).toEqual(phoneOffset)
  })

  it('keeps desktop toasts bottom-right', () => {
    mockDesktop(true)
    render(<Toaster />)
    const props = toasterProps.at(-1)!
    expect(props.position).toBe('bottom-right')
    expect(props.offset).toEqual({ bottom: 24, right: 24 })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/components/app-nav.test.tsx tests/components/ui.test.tsx tests/components/slip-drawer.test.tsx tests/components/void-button.test.tsx tests/components/admin-nav.test.tsx tests/components/home-tiles.test.tsx tests/components/toaster.test.tsx`

Expected: FAIL, with 10 failed. They are:
- the two new AppNav cases
- Button's press state and the chip's callout
- the updated "Slip (n)" trigger case and the new sheet case
- the void dialog case
- the admin nav case
- the home tile case
- the phone Toaster case

The desktop Toaster case already passes.

- [ ] **Step 3: Add the utilities and the root rules to `app/globals.css`**

(a) Replace the end of the `@theme inline` block:

```css
  --shadow-overlay: var(--overlay-shadow);
}
```

with:

```css
  --shadow-overlay: var(--overlay-shadow);
}

/* Chrome that is tapped, never read: a long press shouldn't select it or open iOS's callout menu.
   Text content stays selectable. */
@utility no-callout {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

/* The native press: controls give under the finger. Reduced motion swaps the scale for a dim. */
@utility pressable {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  transition: scale 120ms ease-out;

  &:active:not(:disabled, [aria-disabled="true"]) {
    scale: 0.97;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:active:not(:disabled, [aria-disabled="true"]) {
      scale: none;
      opacity: 0.7;
    }
  }
}
```

(b) Replace:

```css
@layer base {
  body {
```

with:

```css
@layer base {
  html {
    /* iOS's rubber-band bounce can't be turned off; it shows html's background colour, so make
       that the page colour rather than white. */
    background-color: var(--bg);
    overscroll-behavior-y: none;
    -webkit-tap-highlight-color: transparent;
  }

  body {
```

(c) Replace:

```css
    -webkit-font-smoothing: antialiased;
  }
```

with:

```css
    -webkit-font-smoothing: antialiased;
    /* No pull-to-refresh, overscroll glow or scroll chaining; live updates keep data fresh. */
    overscroll-behavior-y: none;
  }

  /* Drops the double-tap-to-zoom wait, so taps land at once. */
  a,
  button,
  input,
  select,
  textarea,
  label,
  summary,
  [role="button"] {
    touch-action: manipulation;
  }
```

After (b) and (c), the `body` rule reads, in order: Task 1's `padding-top`, `background`, `color`, `font-family`, `-webkit-font-smoothing` and `overscroll-behavior-y`.

- [ ] **Step 4: Apply the safe areas and press states to the chrome**

`components/app-nav/app-nav.tsx`. These are class-string edits only; leave everything else as it is.

(a) In `DesktopLink`, replace:

```tsx
        'relative isolate inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[15px] font-bold no-underline',
```

with:

```tsx
        'pressable relative isolate inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[15px] font-bold no-underline',
```

(b) Replace:

```tsx
      <header className="sticky top-0 z-30 hidden h-[72px] shrink-0 items-center gap-5 border-b border-line bg-surface px-10 md:flex">
```

with:

```tsx
      <header className="no-callout sticky top-(--safe-top) z-30 hidden h-[72px] shrink-0 items-center gap-5 border-b border-line bg-surface px-10 md:flex">
```

(c) Replace:

```tsx
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface pr-2 pl-3 md:hidden">
```

with:

```tsx
      <header className="no-callout sticky top-(--safe-top) z-30 flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface pr-2 pl-3 md:hidden">
```

(d) In the phone Admin link, replace:

```tsx
              'inline-flex size-11 shrink-0 items-center justify-center rounded-control no-underline',
```

with:

```tsx
              'pressable inline-flex size-11 shrink-0 items-center justify-center rounded-control no-underline',
```

(e) Replace:

```tsx
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 gap-0.5 border-t border-line bg-surface px-1 pt-1.5 pb-3 md:hidden"
```

with:

```tsx
        className="no-callout fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 gap-0.5 border-t border-line bg-surface px-1 pt-1.5 pb-[calc(12px+var(--safe-bottom))] md:hidden"
```

(f) In the tab-bar links, replace:

```tsx
                'flex min-h-14 flex-col items-center justify-center gap-[3px] rounded-[14px] text-xs leading-[1.1] no-underline',
```

with:

```tsx
                'pressable flex min-h-14 flex-col items-center justify-center gap-[3px] rounded-[14px] text-xs leading-[1.1] no-underline',
```

`components/app-nav/theme-toggle.tsx`. Replace:

```tsx
      className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk"
```

with:

```tsx
      className="pressable inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk"
```

`components/ui/button.tsx`. In `buttonCva`'s base string, replace:

```ts
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control
```

with:

```ts
  'pressable inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control
```

That changes only the start of the line; the rest of the string is unchanged.

`components/ui/status-chip.tsx`. Replace:

```ts
  'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-extrabold',
```

with:

```ts
  'no-callout inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-extrabold',
```

`components/admin/admin-nav.tsx`:

(a) Replace:

```tsx
    <nav aria-label="Admin sections" className="flex gap-1 rounded-[14px] bg-sunk p-1 md:self-start">
```

with:

```tsx
    <nav aria-label="Admin sections" className="no-callout flex gap-1 rounded-[14px] bg-sunk p-1 md:self-start">
```

(b) Replace:

```tsx
              'inline-flex min-h-11 grow items-center justify-center rounded-[10px] px-2 text-[15px] font-bold no-underline md:grow-0 md:px-4',
```

with:

```tsx
              'pressable inline-flex min-h-11 grow items-center justify-center rounded-[10px] px-2 text-[15px] font-bold no-underline md:grow-0 md:px-4',
```

`components/home/home-tiles.tsx`. Replace:

```tsx
            className="group flex min-h-[72px] items-center gap-3.5 px-4 py-3 text-ink no-underline lg:min-h-24 lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-5 lg:shadow-card"
```

with:

```tsx
            className="pressable group flex min-h-[72px] items-center gap-3.5 px-4 py-3 text-ink no-underline lg:min-h-24 lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-5 lg:shadow-card"
```

`components/markets/probability-chart.tsx`. In the range `Toggle`, replace:

```tsx
                  className="min-h-11 min-w-[52px] cursor-pointer rounded-[9px] px-3 text-sm font-extrabold text-ink2 data-pressed:bg-surface data-pressed:text-ink data-pressed:shadow-tab"
```

with:

```tsx
                  className="pressable min-h-11 min-w-[52px] cursor-pointer rounded-[9px] px-3 text-sm font-extrabold text-ink2 data-pressed:bg-surface data-pressed:text-ink data-pressed:shadow-tab"
```

- [ ] **Step 5: Apply the safe areas to the layout, the drawer, the dialog and the toaster**

`app/(app)/layout.tsx`. Replace:

```tsx
      <main id="main" className="flex flex-1 flex-col pb-[82px] md:pb-0">
```

with:

```tsx
      <main id="main" className="flex flex-1 flex-col pb-[calc(82px+var(--safe-bottom))] md:pb-0">
```

`app/(app)/markets/[id]/slip-drawer.tsx`:

(a) Replace:

```tsx
              'fixed right-4 bottom-[94px] z-20 rounded-full tabular-nums shadow-overlay md:hidden',
```

with:

```tsx
              'fixed right-4 bottom-[calc(94px+var(--safe-bottom))] z-20 rounded-full tabular-nums shadow-overlay md:hidden',
```

(b) In `Drawer.Popup`'s `className`, replace only the leading:

```tsx
              className="flex max-h-[calc(100dvh-48px)] w-full
```

with:

```tsx
              className="flex max-h-[calc(100dvh-48px-var(--safe-top))] w-full
```

The rest of that class string is unchanged.

(c) Replace:

```tsx
                  className="inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk"
```

with:

```tsx
                  className="pressable inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk"
```

(d) Replace:

```tsx
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6"
```

with:

```tsx
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(24px+var(--safe-bottom))]"
```

`app/(app)/markets/[id]/void-button.tsx`. Replace the popup's full `className`:

```tsx
            className="fixed top-1/2 left-1/2 z-40 flex w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-card border border-line bg-surface p-6 text-ink shadow-overlay transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none"
```

with:

```tsx
            className="fixed top-[calc(50%+(var(--safe-top)-var(--safe-bottom))/2)] left-1/2 z-40 flex max-h-[calc(100dvh-32px-var(--safe-top)-var(--safe-bottom))] w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-6 text-ink shadow-overlay transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none"
```

`components/ui/toaster.tsx`:

(a) Replace the last line of the file's top comment:

```tsx
// pick is added.
const DESKTOP_QUERY = '(min-width: 768px)'
```

with:

```tsx
// pick is added. In the installed app the top bar sits below the status band, so the phone
// offset grows by --safe-top.
const DESKTOP_QUERY = '(min-width: 768px)'
```

(b) Replace:

```tsx
export function Toaster() {
```

with:

```tsx
const PHONE_OFFSET = { top: 'calc(80px + var(--safe-top))', left: 16, right: 16 }

export function Toaster() {
```

(c) Replace:

```tsx
      offset={isDesktop ? { bottom: 24, right: 24 } : { top: 80, left: 16, right: 16 }}
      mobileOffset={{ top: 80, left: 16, right: 16 }}
```

with:

```tsx
      offset={isDesktop ? { bottom: 24, right: 24 } : PHONE_OFFSET}
      mobileOffset={PHONE_OFFSET}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/components/app-nav.test.tsx tests/components/ui.test.tsx tests/components/slip-drawer.test.tsx tests/components/void-button.test.tsx tests/components/admin-nav.test.tsx tests/components/home-tiles.test.tsx tests/components/toaster.test.tsx`
Expected: PASS (7 files)

- [ ] **Step 7: Verify, including the built stylesheet**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

jsdom applies no CSS, so check the compiled rules in the built stylesheet:

```bash
cat .next/static/chunks/*.css | grep -o -E 'html\{[^}]*\}|\.pressable\{[^}]*\}|\.pressable:active:not\([^)]*\)\)?\{[^}]*\}|@media \(prefers-reduced-motion:reduce\)\{\.pressable[^}]*\}[^}]*\}[^}]*\}|\.no-callout\{[^}]*\}|[a-z,\[\]="]*\{touch-action:manipulation\}|\.top-\\\[calc[^}]*\}|\.top-\\\(--safe-top\\\)\{[^}]*\}|\.pb-\\\[calc\\\(12px[^}]*\}'
```

Expected, among the matches:
- `html{background-color:var(--bg);overscroll-behavior-y:none;-webkit-tap-highlight-color:transparent}`
- `.pressable{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;transition:scale .12s ease-out}`
- `.pressable:active:not(:disabled,[aria-disabled=true]){scale:.97}`
- `@media (prefers-reduced-motion:reduce){.pressable{transition:none}.pressable:active:not(:disabled,[aria-disabled=true]){opacity:.7;scale:none}}`
- `.no-callout{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}`
- `…{touch-action:manipulation}`
- `.top-\[calc\(50\%\+\(var\(--safe-top\)-var\(--safe-bottom\)\)\/2\)\]{top:calc(50% + (var(--safe-top) - var(--safe-bottom)) / 2)}`. This shows Tailwind spaced the `calc()` operators, which CSS requires.
- `.top-\(--safe-top\){top:var(--safe-top)}`
- `.pb-\[calc\(12px\+var\(--safe-bottom\)\)\]{padding-bottom:calc(12px + var(--safe-bottom))}`

Also confirm `overscroll-behavior-y:none` appears twice (`html` and `body`): `cat .next/static/chunks/*.css | grep -o 'overscroll-behavior-y:none' | wc -l` → `2`.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 19 passed, with no new spec. Outside standalone the variables are `0px`, so `slip-drawer.spec.ts`'s "trigger floats above the tab bar" box check still holds. The press scale applies only while a pointer is down, so it doesn't affect Playwright's actionability checks.

- [ ] **Step 8: Commit**

```bash
git add app/globals.css components/app-nav/app-nav.tsx components/app-nav/theme-toggle.tsx components/ui/button.tsx components/ui/status-chip.tsx components/ui/toaster.tsx components/admin/admin-nav.tsx components/home/home-tiles.tsx components/markets/probability-chart.tsx "app/(app)/layout.tsx" "app/(app)/markets/[id]/slip-drawer.tsx" "app/(app)/markets/[id]/void-button.tsx" tests/components/app-nav.test.tsx tests/components/ui.test.tsx tests/components/slip-drawer.test.tsx tests/components/void-button.test.tsx tests/components/admin-nav.test.tsx tests/components/home-tiles.test.tsx tests/components/toaster.test.tsx
git commit -m "Run edge to edge inside the safe areas, drop browser overscroll and tap flash, add press states"
```

---

## Task 3: Routing prep for skeletons — signed-out 307 in the proxy, Home in a route group, UUID-checked market ids

Task 4 puts a `loading.tsx` skeleton on nearly every route. Three things have to change first, or the skeletons break behaviour:
- **Signed-out redirects move into `proxy.ts`.** Every page runs `if (!user) redirect('/sign-in')`. Under a loading boundary, the skeleton streams first. The response is then already a `200`, and the redirect turns into a client-side hop after a flash of skeleton. The proxy already calls `supabase.auth.getUser()` on every request. It now answers signed-out page loads of `(app)` routes with a real `307` to `/sign-in`. Each page's own check stays as defence in depth.
- **Home moves into `app/(app)/(home)/`.** It needs its own `loading.tsx`. But a `loading.tsx` directly under `app/(app)/` would also wrap `/members/[id]`, and that page must keep its real HTTP 404. Moving the page into a route group doesn't change the URL (`03-file-conventions/route-groups.md`).
- **Market ids are validated as UUIDs.** `/markets/not-a-uuid` currently reaches Postgres. Postgres rejects the malformed `uuid` literal, and the page throws a 500. The page now calls `notFound()` first.

**Files:**
- Create: `lib/auth/app-paths.ts`
- Create: `lib/uuid.ts`
- Modify: `proxy.ts` (three anchored edits)
- Move: `app/(app)/page.tsx` → `app/(app)/(home)/page.tsx` (`git mv`, contents unchanged)
- Modify: `app/(app)/markets/[id]/page.tsx` (two anchored edits)
- Test: `tests/lib/auth/app-paths.test.ts`
- Test: `tests/lib/uuid.test.ts`
- Create: `e2e/signed-out.spec.ts`

**Interfaces:**
- Consumes:
  - `NextResponse.redirect(url)`. With no status it defaults to `307` (`node_modules/next/dist/server/web/spec-extension/response.js`, `static redirect`).
  - `request.nextUrl.clone()` from `next/server`.
  - Playwright's `request` fixture. It inherits the project's context options, including `storageState` (`runBeforeCreateRequestContext` in `node_modules/playwright/lib/index.js`). So `test.use({ storageState: { cookies: [], origins: [] } })` makes it signed out. `request.get(path, { maxRedirects: 0 })` returns the redirect itself instead of following it.
- Produces:
  - `lib/auth/app-paths.ts`: `export function isAppPath(pathname: string): boolean`. It's `true` for `/` and for any path whose first segment is `markets`, `parlays`, `tasks`, `feed`, `leaderboard`, `members` or `admin`. It's `false` for everything else: `/sign-in`, `/callback`, `/not-invited`, `/offline`, `/sw.js`, `/manifest.webmanifest`, `/api/*`, look-alikes like `/marketsx`, and unknown URLs.
  - `lib/uuid.ts`: `export function isUuid(value: string): boolean`. It checks the canonical 8-4-4-4-12 hex form, in either case.
  - `proxy.ts` matcher: it also excludes exactly `/manifest.webmanifest`, `/sw.js` and `/offline` (Tasks 1 and 9 serve those), so they never wait on an auth round trip. Each exclusion is anchored with `$`, so a look-alike such as `/offline-report` still runs the proxy; Next honours the `$` inside the lookahead.
  - Home's page now lives at `app/(app)/(home)/page.tsx`. **Later tasks that edit Home (Task 4, Task 10) use this path.**

**Behaviour:**
- **Only `GET` and `HEAD` are redirected.** A server action is a `POST` to the page's URL. Redirecting it would re-post to `/sign-in`, where the action doesn't exist. Signed-out actions keep reaching their own `requireUser()` check and its existing error, as today.
- **The query string is dropped** on the way to `/sign-in`. It's never needed there.
- **Refreshed cookies are carried over.** When `getUser()` clears a dead session, Supabase writes those cookie changes onto `response`, and they're copied onto the redirect. This is the same pattern as the reference app's `proxy.ts`.
- **Unknown top-level URLs aren't redirected.** A signed-out `/this-page-does-not-exist` still gets its 404. `isAppPath` is an allowlist of the `(app)` sections, not a denylist of public pages.
- **The drift guard.** A unit test reads the folders in `app/(app)/` and fails if a new top-level section isn't in `isAppPath`. It skips route groups like `(home)`.
- **The UUID guard** runs after the signed-in check and before `getMarket`. Postgres would accept a few more spellings (braces, no hyphens), but the app only ever links the canonical form. In this task a bad id still returns a real 404. Once Task 4 adds `markets/[id]/loading.tsx`, it becomes a soft 404: a 200 with the not-found UI. The spec accepts that.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/lib/uuid.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isUuid } from '@/lib/uuid'

describe('isUuid', () => {
  it('accepts a canonical uuid in either case', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000000')).toBe(true)
    expect(isUuid('3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b')).toBe(true)
    expect(isUuid('3F2B8C1E-9D4A-4E6B-8A7C-1B2D3E4F5A6B')).toBe(true)
  })

  it('rejects anything Postgres would refuse to compare with a uuid column', () => {
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid('new')).toBe(false)
    expect(isUuid('3f2b8c1e9d4a4e6b8a7c1b2d3e4f5a6b')).toBe(false)
    expect(isUuid('3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6')).toBe(false)
    expect(isUuid('3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6bb')).toBe(false)
    expect(isUuid(' 3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b')).toBe(false)
    expect(isUuid('g3f2b8c1-9d4a-4e6b-8a7c-1b2d3e4f5a6b')).toBe(false)
  })
})
```

Create `tests/lib/auth/app-paths.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { isAppPath } from '@/lib/auth/app-paths'

describe('isAppPath', () => {
  it('covers Home and every signed-in section, at any depth', () => {
    for (const p of [
      '/',
      '/markets',
      '/markets/new',
      '/markets/3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b',
      '/parlays',
      '/tasks',
      '/feed',
      '/leaderboard',
      '/members/3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b',
      '/admin/invites',
      '/admin/ledger',
    ]) {
      expect(isAppPath(p), p).toBe(true)
    }
  })

  it('leaves the public routes and look-alike paths alone', () => {
    for (const p of [
      '/sign-in',
      '/callback',
      '/not-invited',
      '/offline',
      '/sw.js',
      '/manifest.webmanifest',
      '/api/cron/keep-alive',
      '/marketsx',
      '/this-page-does-not-exist',
    ]) {
      expect(isAppPath(p), p).toBe(false)
    }
  })

  it('knows every top-level folder in app/(app)', () => {
    const dir = path.resolve(import.meta.dirname, '../../../app/(app)')
    const sections = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('('))
      .map((entry) => entry.name)
    expect(sections.length).toBeGreaterThan(0)
    for (const section of sections) {
      expect(isAppPath(`/${section}`), section).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/uuid.test.ts tests/lib/auth/app-paths.test.ts`
Expected: FAIL. Both files fail to import (`Failed to resolve import "@/lib/uuid"` and `"@/lib/auth/app-paths"`).

- [ ] **Step 3: Create `lib/uuid.ts`**

```typescript
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Postgres rejects a malformed uuid literal with an error rather than matching no rows,
// so a route id is checked here before it reaches a query.
export function isUuid(value: string): boolean {
  return UUID.test(value)
}
```

- [ ] **Step 4: Create `lib/auth/app-paths.ts`**

```typescript
const APP_SECTIONS = new Set(['markets', 'parlays', 'tasks', 'feed', 'leaderboard', 'members', 'admin'])

// The signed-in routes under app/(app)/. Everything else (sign-in, the auth callback,
// not-invited, the cron route, the manifest, the service worker, offline) stays public.
export function isAppPath(pathname: string): boolean {
  if (pathname === '/') return true
  return APP_SECTIONS.has(pathname.split('/')[1] ?? '')
}
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `npx vitest run tests/lib/uuid.test.ts tests/lib/auth/app-paths.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Redirect signed-out page loads in `proxy.ts`**

Make three edits. Only the lines shown here change.

(a) Replace:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
```

with:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { isAppPath } from '@/lib/auth/app-paths'
```

(b) Replace:

```typescript
  await supabase.auth.getUser()

  return response
}
```

with:

```typescript
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // A page's own redirect('/sign-in') runs after its loading skeleton has streamed, so the
  // browser gets a 200 and a client-side hop. Redirecting here keeps it a real 307. Only
  // page loads: a server action posted without a session still reaches its own check.
  const isPageLoad = request.method === 'GET' || request.method === 'HEAD'
  if (!user && isPageLoad && isAppPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = ''
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  return response
}
```

(c) Replace:

```typescript
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

with:

```typescript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|offline$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 7: Move Home into the `(home)` route group**

```bash
mkdir -p "app/(app)/(home)"
git mv "app/(app)/page.tsx" "app/(app)/(home)/page.tsx"
```

The file is unchanged. Every import in it is an `@/` alias, so nothing needs fixing. Check that nothing else imports the old path:

Run: `grep -rn "(app)/page" app components lib tests e2e`
Expected: no output.

`app/(app)/layout.tsx` and `app/(app)/not-found.tsx` stay where they are. The layout still wraps Home, and the `(app)` not-found still catches `notFound()` from every `(app)` page.

- [ ] **Step 8: Validate the market id before querying**

In `app/(app)/markets/[id]/page.tsx`:

(a) Replace:

```typescript
import { rowState } from '@/lib/markets/row-state'
```

with:

```typescript
import { rowState } from '@/lib/markets/row-state'
import { isUuid } from '@/lib/uuid'
```

(b) Replace:

```typescript
  if (!user) redirect('/sign-in')

  const market = await getMarket(supabase, id)
```

with:

```typescript
  if (!user) redirect('/sign-in')
  if (!isUuid(id)) notFound()

  const market = await getMarket(supabase, id)
```

`notFound` is already imported from `next/navigation` in this file.

- [ ] **Step 9: Write `e2e/signed-out.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('a signed-out request for a signed-in page gets a real 307 to sign-in', async ({ request }) => {
  for (const path of ['/', '/markets', '/markets/not-a-uuid', '/members/00000000-0000-4000-8000-000000000000', '/admin/invites']) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(307)
    expect(new URL(response.headers()['location'], 'http://localhost').pathname, path).toBe('/sign-in')
  }

  const signIn = await request.get('/sign-in', { maxRedirects: 0 })
  expect(signIn.status()).toBe(200)
})
```

- The `test.use` override applies only to this file. Every other spec keeps the seeded admin session from `e2e/global-setup.ts`.
- `Location` is absolute (`http://localhost:3000/sign-in`), so the test compares only the pathname.
- **This spec also passes before Step 6.** Without loading boundaries, each page's own `redirect()` still produces a 307. It guards Task 4: once the skeletons land, only the proxy keeps these a 307.

- [ ] **Step 10: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS. The build's route table still lists `ƒ /`, now served from `app/(app)/(home)/page.tsx`, and `ƒ Proxy (Middleware)`.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 20 passed. That's the 18 before this PR, plus Task 1's `home-screen.spec.ts`, plus `signed-out.spec.ts`. No existing spec changes:
- every other spec runs signed in, so the proxy passes their requests straight through
- `not-found.spec.ts`'s unknown URL isn't an app path
- `social.spec.ts`'s unknown member id is a valid UUID, so it still reaches the page's 404

- [ ] **Step 11: Commit**

```bash
git add proxy.ts lib/auth/app-paths.ts lib/uuid.ts "app/(app)/markets/[id]/page.tsx" tests/lib/auth/app-paths.test.ts tests/lib/uuid.test.ts e2e/signed-out.spec.ts
git status --short "app/(app)"   # the git mv from Step 7 is already staged: R  app/(app)/page.tsx -> app/(app)/(home)/page.tsx
git commit -m "Redirect signed-out page loads in the proxy, move Home into a route group, and 404 non-UUID market ids"
```

---

## Task 4: Skeletons — the `Skeleton` primitive, a `loading.tsx` for every route, and a streamed member page

Every signed-in route gets a skeleton that paints the instant you tap. Next prefetches a dynamic route's loading state once it has a `loading.tsx` (`01-app/02-guides/prefetching.md`, "Prefetching static vs. dynamic routes"), so the skeleton is already on the device before the tap. When the real content arrives, a React `<ViewTransition>` hands off: the skeleton slides down and out, and the content fades and rises in.

What changes:
- **`Skeleton`,** a hidden block. It uses the `sunk` fill and the control radius, with a band of the `surface` colour sweeping across it. The sweep stops under `prefers-reduced-motion`. The look lives in one `.skeleton` rule in `globals.css`'s component layer, so a `bg-*` or `rounded-*` utility on a Skeleton overrides it.
- **Skeleton helpers:**
  - `SkeletonScreen`: the named, announced wrapper each loading state renders
  - `SkeletonCard`: the `SectionCard` shell
  - `SkeletonPageHeader`: the `PageHeader` shape
  - `SkeletonField`: a label bar over a control bar
  - `FeedListSkeleton`: `FeedList`'s shape, shared by the feed skeleton and the member page
- **Reveals:** `components/nav/page-transition.tsx` exports `SkeletonReveal` and `ContentReveal`. They work in Server Components, since `ViewTransition` needs no `'use client'`. Task 5 later rewrites this file with one combined mapping that also carries the drill-down and tab transitions, keeping both names.
- **`Page` gets a `reveal` prop.** `<Page reveal>` wraps the page in `ContentReveal`, so each page opts in with a one-line change and nothing is re-indented. Task 5 replaces the prop with `transition`.
- **Twelve `loading.tsx` files,** each mirroring its page's real layout, `lg:` grid columns included:
  - `(home)`
  - `markets`, `markets/[id]` and `markets/new`
  - `parlays`, `tasks`, `feed` and `leaderboard`
  - `admin/invites`, `admin/tasks`, `admin/members` and `admin/ledger`
- **Every page with a skeleton reveals its content:** the eight `<Page>` pages through `<Page reveal>`, the four admin sections by wrapping their root element in `<ContentReveal>`.
- **The member page keeps its real HTTP 404.** It still finds the member before anything streams, then `notFound()`s an unknown id. Only the activity list streams, inside its own `<Suspense>` with a feed skeleton.

**Hard rules this task keeps:**
- **No `loading.tsx` directly under `app/(app)/` or `app/(app)/members/`.** Either would put a Suspense boundary above `members/[id]/page.tsx`. The response would start streaming as a `200` before the page could `notFound()`, and `e2e/social.spec.ts` asserts a 404 (`03-file-conventions/loading.md`, § Status Codes).
- **A skeleton adds no heading, list item, link, button or region.** It's only `aria-hidden` blocks plus one visually hidden `role="status"` "Loading…". While one is on screen, no e2e locator can match it or double-count. A unit test asserts this for all twelve.

**Files:**
- Modify: `components/ui/page.tsx` (export `pageClass`; `Page` uses it and takes `reveal`)
- Create: `components/nav/page-transition.tsx`
- Create: `components/ui/skeleton.tsx`
- Create: `components/feed/feed-list-skeleton.tsx`
- Modify: `app/globals.css` (append one block)
- Create: `app/(app)/(home)/loading.tsx`
- Create: `app/(app)/markets/loading.tsx`
- Create: `app/(app)/markets/[id]/loading.tsx`
- Create: `app/(app)/markets/new/loading.tsx`
- Create: `app/(app)/parlays/loading.tsx`
- Create: `app/(app)/tasks/loading.tsx`
- Create: `app/(app)/feed/loading.tsx`
- Create: `app/(app)/leaderboard/loading.tsx`
- Create: `app/(app)/admin/invites/loading.tsx`
- Create: `app/(app)/admin/tasks/loading.tsx`
- Create: `app/(app)/admin/members/loading.tsx`
- Create: `app/(app)/admin/ledger/loading.tsx`
- Modify (`<Page reveal>`, or the admin sections wrapped in `ContentReveal`):
  - `app/(app)/(home)/page.tsx` (moved there by Task 3)
  - `app/(app)/markets/page.tsx`
  - `app/(app)/markets/[id]/page.tsx`
  - `app/(app)/markets/new/page.tsx`
  - `app/(app)/parlays/page.tsx`
  - `app/(app)/tasks/page.tsx`
  - `app/(app)/feed/page.tsx`
  - `app/(app)/leaderboard/page.tsx`
  - `app/(app)/admin/invites/page.tsx`
  - `app/(app)/admin/tasks/page.tsx`
  - `app/(app)/admin/members/page.tsx`
  - `app/(app)/admin/ledger/page.tsx`
- Modify (rewrite): `app/(app)/members/[id]/page.tsx`
- Create: `tests/components/view-transition-mock.ts` (the shared `react` mock for tests that render a `ViewTransition`)
- Test: `tests/components/skeleton.test.tsx`
- Test: `tests/components/loading-skeletons.test.tsx`
- Create: `e2e/skeletons.spec.ts`

**Interfaces:**
- Consumes:
  - `ViewTransition` from `react`. Next's bundled React canary exports it, and `@types/react` 19.3 types it. **Vitest resolves the stable `react@19.2.8` package, which does not export it.** Rendering a reveal in jsdom unmocked throws "Element type is invalid". So every test that renders one mocks `react` the same way, through the shared helper `tests/components/view-transition-mock.ts`: its stand-in renders the children with no DOM of its own and records each call's props in `viewTransitionCalls`. Both test files below use it, and so do Tasks 5 and 6.
  - From Task 3: Home at `app/(app)/(home)/page.tsx`, and signed-out page loads already 307'd by `proxy.ts`. The pages' own `redirect('/sign-in')` calls now sit under loading boundaries, where they would only be client-side hops, so the proxy is what keeps a real redirect.
  - `cardClass` (`components/ui/card.tsx`), `Page`/`PageHeader`/`h1Class` (`components/ui/page.tsx`), `FeedList` (`app/(app)/feed/feed-list.tsx`), `listFeed`, `getLeaderboard` and `requireUser`, all unchanged.
- Produces (Task 5 builds on these exact names):
  - `components/nav/page-transition.tsx` (Task 5 rewrites it, keeping both names):
    ```tsx
    export function SkeletonReveal({ children }: { children: ReactNode }): JSX.Element // <ViewTransition exit="skeleton-exit" default="none">
    export function ContentReveal({ children }: { children: ReactNode }): JSX.Element  // <ViewTransition enter="content-enter" default="none">
    ```
  - `components/ui/page.tsx`: `Page({ className, reveal, children })`, where `reveal?: boolean` wraps the page in `ContentReveal`
  - `tests/components/view-transition-mock.ts`: `viewTransitionCalls: ViewTransitionProps[]` and `withViewTransition(actual)`, for `vi.mock('react', …)`
  - `components/ui/skeleton.tsx`:
    ```tsx
    export function Skeleton({ className }: { className?: string }): JSX.Element // <div aria-hidden="true" class="skeleton …">
    export function SkeletonScreen({ name, className, children }: { name: string; className?: string; children: ReactNode }): JSX.Element
    // SkeletonReveal > <div data-skeleton={name} class={className}> + sr-only role="status" "Loading…" + children
    export function SkeletonCard({ className, children }: { className?: string; children: ReactNode }): JSX.Element
    export function SkeletonPageHeader({ description, action }: { description?: boolean; action?: boolean }): JSX.Element
    export function SkeletonField({ className, tall }: { className?: string; tall?: boolean }): JSX.Element
    ```
  - `components/feed/feed-list-skeleton.tsx`: `FeedListSkeleton({ headingHidden?: boolean; rows?: number })`
  - `components/ui/page.tsx`: `export const pageClass`, the exact class string `Page` already used
  - CSS in `app/globals.css`:
    - the `.skeleton` rule and `@keyframes skeleton-shimmer`
    - the view-transition classes `skeleton-exit` and `content-enter`, with `@keyframes reveal-fade` and `reveal-rise`
    - `::view-transition { pointer-events: none }`
  - `data-skeleton` names: `home`, `markets`, `market`, `create-market`, `parlays`, `tasks`, `feed`, `leaderboard`, `admin-invites`, `admin-tasks`, `admin-members`, `admin-ledger` and `member-activity`

**Behaviour:**
- **Where each boundary sits.**
  - `loading.tsx` wraps its segment's page and everything below it, but not the segment's own layout (`03-file-conventions/loading.md`).
  - So the admin skeletons render inside `admin/layout.tsx`, below the real Admin header and section tabs. The layout's admin gate (`redirect('/sign-in')`, `redirect('/')`) stays above every boundary and keeps a real 307. There's no `admin/loading.tsx`, because each section mirrors its own layout.
  - `markets/loading.tsx` also sits above `markets/[id]` and `markets/new`. That was checked against Next 16.3.5: a navigation from outside `/markets` straight to a market shows the market skeleton, not the list skeleton, because the prefetch carries the inner boundary.
- **Soft 404s on markets.** `/markets/<unknown uuid>` and `/markets/not-a-uuid` now return `200` with the not-found UI and a `noindex` meta tag, instead of a 404 status. The spec accepts this. No test asserts that status, and the app sits behind a login.
- **The member page.**
  - It awaits the leaderboard, which the header needs anyway for the balance and rank, and calls `notFound()` before returning any JSX. No boundary sits above it, so an unknown id is a real 404.
  - The activity list moves into an async `MemberActivity` inside `<Suspense>`. Its fallback is `FeedListSkeleton` in a `SkeletonScreen` named `member-activity`.
  - `requireUser()` is React-`cache`d per request, so `MemberActivity` calling it again costs nothing.
  - There's no `ContentReveal` around the whole member page. It has no route skeleton, so a whole-page enter animation would play on every arrival. Only the activity list reveals.
- **The reveal (CSS).**
  - The skeleton's old snapshot fades out and moves down 10px in 150ms.
  - The content's new snapshot waits 150ms, then fades in over 210ms while rising 10px over 400ms. That's the timing from `02-guides/view-transitions.md` Step 2.
  - Under reduced motion both animations are `none`, and the skeleton sweep stops, gradient removed, so blocks are flat `sunk`.
  - `::view-transition { pointer-events: none }` stops the transition overlay swallowing taps during a reveal (same guide, "Keeping the page interactive").
  - `default="none"` on both wrappers keeps them still during every other transition, like Task 5's slides and `router.refresh()`.
- **Why `Skeleton`'s look is CSS, not utilities.** `tailwind-merge` doesn't know the custom `rounded-control` class, so `cn('rounded-control', 'rounded-full')` keeps both, and whichever comes later in the stylesheet wins. Putting the defaults in a component-layer rule makes any utility win. `var(--radius-control)` is emitted to `:root` by the `@theme` block, which was checked in the built CSS.
- **The hero skeleton on Home** uses `bg-on-hero/15` blocks on `bg-hero`, so it reads as the hero in both themes.

- [ ] **Step 1: Write the failing tests**

Create `tests/components/view-transition-mock.ts`, the one way every test in this PR stands in for `ViewTransition`:

```ts
import type * as React from 'react'

// Vitest resolves the stable react package, which doesn't export ViewTransition; only Next's
// bundled canary React does. A test that renders one mocks react with this stand-in:
//   vi.mock('react', async (importOriginal) =>
//     (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()))
// It renders the children with no DOM of its own and records each call's props.
export const viewTransitionCalls: React.ViewTransitionProps[] = []

export function withViewTransition(actual: typeof React) {
  return {
    ...actual,
    ViewTransition: (props: React.ViewTransitionProps) => {
      viewTransitionCalls.push(props)
      return props.children
    },
  }
}
```

It imports React's types only, so loading it from inside the `react` mock can't loop back into the mock. It isn't a `*.test.ts` file, so Vitest doesn't run it as a suite.

Create `tests/components/skeleton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { viewTransitionCalls } from '@/tests/components/view-transition-mock'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { Skeleton, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'
import { ContentReveal, SkeletonReveal } from '@/components/nav/page-transition'
import { Page } from '@/components/ui/page'

beforeEach(() => {
  viewTransitionCalls.length = 0
})

// The props a ViewTransition got, apart from its children.
function transitionProps(index = 0) {
  return Object.fromEntries(Object.entries(viewTransitionCalls[index]).filter(([key]) => key !== 'children'))
}

describe('Skeleton', () => {
  it('is a hidden block carrying the shimmer class and any overrides', () => {
    const { container } = render(<Skeleton className="h-6 w-40 rounded-full" />)
    const block = container.firstElementChild!
    expect(block).toHaveAttribute('aria-hidden', 'true')
    expect(block).toHaveClass('skeleton', 'h-6', 'w-40', 'rounded-full')
    expect(block).toBeEmptyDOMElement()
  })

  it('builds a field from a label bar and a control bar, taller for a textarea', () => {
    const { container } = render(
      <>
        <SkeletonField />
        <SkeletonField tall />
      </>,
    )
    const [field, tallField] = Array.from(container.children)
    expect(field.lastElementChild).toHaveClass('h-12')
    expect(tallField.lastElementChild).toHaveClass('h-[100px]')
  })
})

describe('SkeletonScreen', () => {
  it('names the skeleton, announces loading, and hands off through the skeleton reveal', () => {
    const { container } = render(
      <SkeletonScreen name="feed" className="flex flex-col">
        <Skeleton className="h-6" />
      </SkeletonScreen>,
    )
    expect(viewTransitionCalls).toHaveLength(1)
    expect(transitionProps()).toEqual({ exit: 'skeleton-exit', default: 'none' })
    const screenEl = container.firstElementChild!
    expect(screenEl).toHaveAttribute('data-skeleton', 'feed')
    expect(screenEl).toHaveClass('flex', 'flex-col')
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screenEl.querySelectorAll('.skeleton')).toHaveLength(1)
  })
})

describe('reveals', () => {
  it('slides the skeleton out on exit and nothing else', () => {
    render(<SkeletonReveal>skeleton</SkeletonReveal>)
    expect(transitionProps()).toEqual({ exit: 'skeleton-exit', default: 'none' })
  })

  it('brings the content in on enter and nothing else', () => {
    render(<ContentReveal>content</ContentReveal>)
    expect(transitionProps()).toEqual({ enter: 'content-enter', default: 'none' })
  })

  it('reveals a Page that asks for it, and leaves a plain Page alone', () => {
    const { container, rerender } = render(<Page>Body</Page>)
    expect(viewTransitionCalls).toHaveLength(0)
    rerender(<Page reveal>Body</Page>)
    expect(viewTransitionCalls).toHaveLength(1)
    expect(transitionProps()).toEqual({ enter: 'content-enter', default: 'none' })
    expect(container.firstElementChild).toBe(screen.getByText('Body'))
  })
})
```

Create `tests/components/loading-skeletons.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import HomeLoading from '@/app/(app)/(home)/loading'
import MarketsLoading from '@/app/(app)/markets/loading'
import MarketLoading from '@/app/(app)/markets/[id]/loading'
import CreateMarketLoading from '@/app/(app)/markets/new/loading'
import ParlaysLoading from '@/app/(app)/parlays/loading'
import TasksLoading from '@/app/(app)/tasks/loading'
import FeedLoading from '@/app/(app)/feed/loading'
import LeaderboardLoading from '@/app/(app)/leaderboard/loading'
import AdminInvitesLoading from '@/app/(app)/admin/invites/loading'
import AdminTasksLoading from '@/app/(app)/admin/tasks/loading'
import AdminMembersLoading from '@/app/(app)/admin/members/loading'
import AdminLedgerLoading from '@/app/(app)/admin/ledger/loading'

const SKELETONS: [string, ComponentType][] = [
  ['home', HomeLoading],
  ['markets', MarketsLoading],
  ['market', MarketLoading],
  ['create-market', CreateMarketLoading],
  ['parlays', ParlaysLoading],
  ['tasks', TasksLoading],
  ['feed', FeedLoading],
  ['leaderboard', LeaderboardLoading],
  ['admin-invites', AdminInvitesLoading],
  ['admin-tasks', AdminTasksLoading],
  ['admin-members', AdminMembersLoading],
  ['admin-ledger', AdminLedgerLoading],
]

describe.each(SKELETONS)('the %s skeleton', (name, Loading) => {
  it('is named, announces loading, and shows nothing but hidden blocks', () => {
    const { container } = render(<Loading />)

    expect(container.querySelector(`[data-skeleton="${name}"]`)).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(3)
    for (const block of container.querySelectorAll('.skeleton')) {
      expect(block).toHaveAttribute('aria-hidden', 'true')
    }
    // Page e2e specs count headings, list items, links and buttons; a skeleton must add none.
    for (const role of ['heading', 'listitem', 'link', 'button', 'region'] as const) {
      expect(screen.queryAllByRole(role)).toHaveLength(0)
    }
    expect(container).toHaveTextContent(/^Loading…$/)
  })
})
```

Both files mock `react` inside the test module graph only. React DOM, loaded from `node_modules` as CommonJS, still gets the real package. Spreading `actual` keeps hooks on the same React instance.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/components/skeleton.test.tsx tests/components/loading-skeletons.test.tsx`
Expected: FAIL. Both files fail to import (`Failed to resolve import "@/components/ui/skeleton"` / `"@/app/(app)/(home)/loading"`).

- [ ] **Step 3: Export `pageClass` from `components/ui/page.tsx`, and give `Page` its `reveal` prop**

Replace the imports:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
```

with:

```tsx
import type { ReactNode } from 'react'
import { ContentReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'
```

Then replace:

```tsx
export function Page({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-5 px-4 pt-5 pb-8 md:gap-7 md:px-20 md:pt-10 md:pb-20',
        className,
      )}
    >
      {children}
    </div>
  )
}
```

with:

```tsx
export const pageClass =
  'mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-5 px-4 pt-5 pb-8 md:gap-7 md:px-20 md:pt-10 md:pb-20'

export function Page({
  className,
  reveal = false,
  children,
}: {
  className?: string
  reveal?: boolean
  children: ReactNode
}) {
  const page = <div className={cn(pageClass, className)}>{children}</div>
  return reveal ? <ContentReveal>{page}</ContentReveal> : page
}
```

A page-level skeleton renders its own `<div>` with this class, not a `<Page>`, because `SkeletonScreen` needs `data-skeleton` on that same element. `reveal` adds no DOM: `ViewTransition` animates the page's own `<div>`.

- [ ] **Step 4: Create `components/nav/page-transition.tsx`**

```tsx
import { ViewTransition, type ReactNode } from 'react'

// The skeleton-to-content handoff. A loading.tsx wraps its skeleton in SkeletonReveal and the
// page wraps its content in ContentReveal (<Page reveal>); when the Suspense boundary resolves, the skeleton
// slides down and out while the content slides up and in (app/globals.css). default="none"
// keeps both still during every other transition on the page.
export function SkeletonReveal({ children }: { children: ReactNode }) {
  return (
    <ViewTransition exit="skeleton-exit" default="none">
      {children}
    </ViewTransition>
  )
}

export function ContentReveal({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="content-enter" default="none">
      {children}
    </ViewTransition>
  )
}
```

- [ ] **Step 5: Create `components/ui/skeleton.tsx`**

```tsx
import type { ReactNode } from 'react'
import { cardClass } from '@/components/ui/card'
import { SkeletonReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'

// The sunk fill, control radius and shimmer come from the .skeleton rule in app/globals.css, a
// component layer, so a bg-* or rounded-* utility in className overrides them.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton', className)} />
}

export function SkeletonScreen({ name, className, children }: { name: string; className?: string; children: ReactNode }) {
  return (
    <SkeletonReveal>
      <div data-skeleton={name} className={className}>
        <p role="status" className="sr-only">
          Loading…
        </p>
        {children}
      </div>
    </SkeletonReveal>
  )
}

export function SkeletonCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(cardClass, 'flex flex-col gap-3 p-[18px] md:p-6', className)}>{children}</div>
}

export function SkeletonPageHeader({ description = false, action = false }: { description?: boolean; action?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 grow flex-col gap-2">
        <Skeleton className="h-8 w-44 md:h-11 md:w-64" />
        {description && <Skeleton className="h-5 w-full max-w-[420px]" />}
      </div>
      {action && <Skeleton className="h-11 w-36 shrink-0 md:h-12 md:w-44" />}
    </div>
  )
}

export function SkeletonField({ className, tall = false }: { className?: string; tall?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Skeleton className="h-5 w-24" />
      <Skeleton className={tall ? 'h-[100px]' : 'h-12'} />
    </div>
  )
}
```

- [ ] **Step 6: Append the skeleton and reveal CSS to `app/globals.css`**

Add this block at the end of the file, after the closing `}` of `@layer base`.

```css
/* Skeleton blocks (components/ui/skeleton.tsx): a band of the surface colour sweeps across the
   sunk fill. A component layer, so bg-* and rounded-* utilities on a Skeleton win. */
@layer components {
  .skeleton {
    border-radius: var(--radius-control);
    background-color: var(--sunk);
    background-image: linear-gradient(
      100deg,
      transparent 30%,
      color-mix(in oklab, var(--surface) 55%, transparent) 50%,
      transparent 70%
    );
    background-repeat: no-repeat;
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.6s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      background-image: none;
      animation: none;
    }
  }
}

@keyframes skeleton-shimmer {
  from {
    background-position: 150% 0;
  }
  to {
    background-position: -50% 0;
  }
}

/* Skeleton-to-content reveal (components/nav/page-transition.tsx). The skeleton leaves fast, sliding down;
   the content waits for it, then fades and rises in. */
::view-transition-old(.skeleton-exit) {
  animation:
    150ms ease-out both reveal-fade reverse,
    150ms ease-out both reveal-rise reverse;
}

::view-transition-new(.content-enter) {
  animation:
    210ms ease-in 150ms both reveal-fade,
    400ms ease-in both reveal-rise;
}

/* The transition overlay would otherwise swallow taps for the length of the reveal. */
::view-transition {
  pointer-events: none;
}

@keyframes reveal-fade {
  from {
    opacity: 0;
    filter: blur(3px);
  }
  to {
    opacity: 1;
    filter: blur(0);
  }
}

@keyframes reveal-rise {
  from {
    transform: translateY(10px);
  }
  to {
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(.skeleton-exit),
  ::view-transition-new(.content-enter) {
    animation: none;
  }
}
```

- [ ] **Step 7: Create `components/feed/feed-list-skeleton.tsx`**

```tsx
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const ROW_WIDTHS = ['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2', 'w-3/4', 'w-7/12']

// Mirrors FeedList (app/(app)/feed/feed-list.tsx), with or without its visible heading.
export function FeedListSkeleton({ headingHidden = false, rows = 6 }: { headingHidden?: boolean; rows?: number }) {
  return (
    <SkeletonCard
      className={cn('max-w-[820px]', headingHidden ? 'gap-0 px-0 py-1 md:px-0 md:py-1' : 'pb-1 md:pt-[18px] md:pb-1')}
    >
      {!headingHidden && <Skeleton className="h-6 w-44" />}
      <div className={cn('flex flex-col divide-y divide-line', headingHidden && 'px-[18px] md:px-6')}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-start gap-3 py-3.5">
            <Skeleton className="size-9 shrink-0 rounded-[10px]" />
            <div className="grow pt-[7px]">
              <Skeleton className={cn('h-4', ROW_WIDTHS[i % ROW_WIDTHS.length])} />
            </div>
            <Skeleton className="mt-[7px] h-4 w-9 shrink-0" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  )
}
```

- [ ] **Step 8: Create the twelve `loading.tsx` files**

Each one is a synchronous Server Component. Page-level skeletons pass `pageClass`, so they sit exactly where the `<Page>` will. Admin skeletons pass the section's own root classes, because they render inside the admin layout's `<Page>`.

`app/(app)/(home)/loading.tsx`:

```tsx
import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Home: greeting, balance hero, the tile list (a grid from lg) and Sign out.
export default function Loading() {
  return (
    <SkeletonScreen name="home" className={pageClass}>
      <SkeletonPageHeader />
      <div className="flex flex-col gap-3 rounded-[22px] bg-hero px-[22px] pt-[22px] pb-6 md:px-9 md:py-8">
        <Skeleton className="h-4 w-24 bg-on-hero/15" />
        <Skeleton className="h-11 w-56 bg-on-hero/15 md:h-[60px] md:w-80" />
        <Skeleton className="h-4 w-64 max-w-full bg-on-hero/15" />
      </div>
      <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface px-1 lg:grid lg:grid-cols-3 lg:gap-5 lg:divide-y-0 lg:border-0 lg:bg-transparent lg:px-0">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="flex min-h-[72px] items-center gap-3.5 px-4 py-3 lg:min-h-24 lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-5 lg:shadow-card"
          >
            <Skeleton className="size-11 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-44 max-w-full" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-12 w-full md:w-36" />
    </SkeletonScreen>
  )
}
```

`app/(app)/markets/loading.tsx`:

```tsx
import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors the markets list: header with Create market, then one status group of market cards,
// three across from lg.
export default function Loading() {
  return (
    <SkeletonScreen name="markets" className={pageClass}>
      <SkeletonPageHeader action />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-20" />
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i} className="md:p-[18px]">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-16 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="h-[84px]" />
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 2 }, (_, j) => (
                  <div key={j} className="flex min-h-7 items-center gap-2.5">
                    <Skeleton className="size-2.5 shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="ml-auto h-4 w-10" />
                  </div>
                ))}
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  )
}
```

`app/(app)/markets/[id]/loading.tsx`:

```tsx
import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors market detail: back link, status line and title, then from lg the two-column grid with
// the chart, outcomes and bets on the left and the bet card on the right.
export default function Loading() {
  return (
    <SkeletonScreen name="market" className={pageClass}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-4/5 md:h-11 md:w-3/5" />
      </div>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-7">
        <SkeletonCard className="lg:col-start-1 lg:row-start-1">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-[220px] md:h-[300px]" />
        </SkeletonCard>
        <SkeletonCard className="gap-1 lg:col-start-1 lg:row-start-2">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 py-4">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                </div>
                <Skeleton className="h-2 rounded-full" />
                <div className="flex min-h-11 items-center justify-between gap-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-11 w-36" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard className="gap-4 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <Skeleton className="h-6 w-32" />
          <SkeletonField />
          <SkeletonField />
          <Skeleton className="h-12" />
        </SkeletonCard>
        <SkeletonCard className="gap-1 lg:col-start-1 lg:row-start-3">
          <Skeleton className="h-6 w-16" />
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex min-h-[52px] items-center gap-3 py-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-52 max-w-full" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </SkeletonScreen>
  )
}
```

`app/(app)/markets/new/loading.tsx`:

```tsx
import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonField, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Create market: back link, header, and the form card with a Yes/No market's fields.
export default function Loading() {
  return (
    <SkeletonScreen name="create-market" className={pageClass}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-24" />
      </div>
      <SkeletonPageHeader />
      <SkeletonCard className="max-w-[720px] gap-5">
        <SkeletonField />
        <SkeletonField tall />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-[52px] rounded-[14px]" />
        </div>
        <SkeletonField />
        <Skeleton className="h-12 w-full md:w-44" />
      </SkeletonCard>
    </SkeletonScreen>
  )
}
```

`app/(app)/parlays/loading.tsx`:

```tsx
import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Parlays: the slip card beside My parlays from lg (5 : 7).
export default function Loading() {
  return (
    <SkeletonScreen name="parlays" className={pageClass}>
      <SkeletonPageHeader />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <SkeletonCard>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-4">
                <div className="flex grow flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
                <Skeleton className="h-11 w-20 shrink-0" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard className="gap-1">
          <Skeleton className="h-6 w-32" />
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex flex-col gap-3 py-4">
                <Skeleton className="h-4 w-4/5" />
                {Array.from({ length: 2 }, (_, j) => (
                  <div key={j} className="flex items-center justify-between gap-3">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </SkeletonScreen>
  )
}
```

`app/(app)/tasks/loading.tsx`:

```tsx
import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Tasks: header with its description, then the catalog card of task rows.
export default function Loading() {
  return (
    <SkeletonScreen name="tasks" className={pageClass}>
      <SkeletonPageHeader description />
      <SkeletonCard className="gap-0 p-0 md:p-0">
        <div className="flex flex-col divide-y divide-line px-[18px] md:px-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 py-[18px] md:flex-row md:items-center md:gap-5 md:py-[22px]">
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-5 w-3/5" />
                <Skeleton className="h-4 w-4/5" />
              </div>
              <Skeleton className="h-11 w-32 shrink-0" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}
```

`app/(app)/feed/loading.tsx`:

```tsx
import { pageClass } from '@/components/ui/page'
import { SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'
import { FeedListSkeleton } from '@/components/feed/feed-list-skeleton'

export default function Loading() {
  return (
    <SkeletonScreen name="feed" className={pageClass}>
      <SkeletonPageHeader description />
      <FeedListSkeleton headingHidden />
    </SkeletonScreen>
  )
}
```

`app/(app)/leaderboard/loading.tsx`:

```tsx
import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors the leaderboard: header with its description, then the rankings card.
export default function Loading() {
  return (
    <SkeletonScreen name="leaderboard" className={pageClass}>
      <SkeletonPageHeader description />
      <SkeletonCard className="max-w-[820px] gap-0 px-2 py-1.5 md:px-3 md:py-1.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex min-h-[60px] items-center gap-3 px-2.5 py-2.5 md:px-3.5">
            <Skeleton className="size-10 shrink-0" />
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="grow">
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-5 w-16 shrink-0" />
          </div>
        ))}
      </SkeletonCard>
    </SkeletonScreen>
  )
}
```

`app/(app)/admin/invites/loading.tsx`:

```tsx
import { Skeleton, SkeletonCard, SkeletonScreen } from '@/components/ui/skeleton'

// Below the Admin header and section tabs (admin/layout.tsx): the invite form beside the invite
// list from lg (5 : 7).
export default function Loading() {
  return (
    <SkeletonScreen
      name="admin-invites"
      className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7"
    >
      <SkeletonCard>
        <Skeleton className="h-6 w-40" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-16" />
          <div className="flex gap-2">
            <Skeleton className="h-12 grow" />
            <Skeleton className="h-12 w-20 shrink-0" />
          </div>
          <Skeleton className="h-4 w-4/5" />
        </div>
      </SkeletonCard>
      <SkeletonCard className="gap-1">
        <Skeleton className="h-6 w-24" />
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex min-h-16 items-center justify-between gap-3 py-2.5">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-11 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}
```

`app/(app)/admin/tasks/loading.tsx`:

```tsx
import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

// Below the Admin header and section tabs: pending approvals, then Create task beside the task
// catalog from lg (5 : 7).
export default function Loading() {
  return (
    <SkeletonScreen name="admin-tasks" className="flex flex-col gap-5 md:gap-7">
      <SkeletonCard className="gap-4">
        <Skeleton className="h-6 w-48" />
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 py-4">
              <div className="flex items-start gap-2">
                <Skeleton className="size-[22px] shrink-0 rounded-md" />
                <div className="flex grow flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-11 w-28" />
                <Skeleton className="h-11 w-24" />
              </div>
            </div>
          ))}
        </div>
      </SkeletonCard>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7">
        <SkeletonCard className="gap-4">
          <Skeleton className="h-6 w-32" />
          <SkeletonField />
          <SkeletonField tall />
          <SkeletonField />
          <Skeleton className="h-12 w-full md:w-36" />
        </SkeletonCard>
        <SkeletonCard className="gap-1">
          <Skeleton className="h-6 w-32" />
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-3/5" />
                  <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-11 w-20" />
                  <Skeleton className="h-11 w-28" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </SkeletonScreen>
  )
}
```

`app/(app)/admin/members/loading.tsx`:

```tsx
import { cardClass } from '@/components/ui/card'
import { Skeleton, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Below the Admin header and section tabs: one card of member rows, each an adjust-balance form
// that lays out in a row from md.
export default function Loading() {
  return (
    <SkeletonScreen name="admin-members" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
      <div className="flex flex-col divide-y divide-line">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 py-4 md:flex-row md:items-end md:gap-4">
            <div className="flex items-center gap-3 md:w-60 md:shrink-0 md:self-center">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <div className="flex min-w-0 grow items-end gap-2">
              <SkeletonField className="w-[108px] shrink-0 md:w-[150px]" />
              <SkeletonField className="grow" />
            </div>
            <Skeleton className="h-12 w-full md:w-28" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  )
}
```

`app/(app)/admin/ledger/loading.tsx`:

```tsx
import { cardClass } from '@/components/ui/card'
import { Skeleton, SkeletonScreen } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const ROW_WIDTHS = ['w-4/5', 'w-3/5', 'w-2/3', 'w-3/4']

// Below the Admin header and section tabs: one card listing every coin movement.
export default function Loading() {
  return (
    <SkeletonScreen name="admin-ledger" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
      <div className="flex flex-col divide-y divide-line">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-start gap-3 py-3.5">
            <div className="grow">
              <Skeleton className={cn('h-4', ROW_WIDTHS[i % ROW_WIDTHS.length])} />
            </div>
            <Skeleton className="mt-0.5 h-4 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  )
}
```

Check the two forbidden spots are still empty:

Run: `ls "app/(app)/loading.tsx" "app/(app)/members/loading.tsx" "app/(app)/members/[id]/loading.tsx" 2>&1`
Expected: three `No such file or directory` lines.

- [ ] **Step 9: Run the unit tests to verify they pass**

Run: `npx vitest run tests/components/skeleton.test.tsx tests/components/loading-skeletons.test.tsx`
Expected: PASS (18 tests: 6 in `skeleton.test.tsx`, 12 in `loading-skeletons.test.tsx`)

- [ ] **Step 10: Reveal each page's content**

**The eight `<Page>` pages** change one line each: the `<Page>` the page returns (exactly one per file) becomes `<Page reveal>`. Nothing else in these files changes, and nothing is re-indented.
- `app/(app)/(home)/page.tsx`
- `app/(app)/markets/page.tsx`
- `app/(app)/markets/[id]/page.tsx` (the `<SlipDrawer>` inside stays inside)
- `app/(app)/markets/new/page.tsx`
- `app/(app)/parlays/page.tsx`
- `app/(app)/tasks/page.tsx`
- `app/(app)/feed/page.tsx`
- `app/(app)/leaderboard/page.tsx`

As a worked example, `app/(app)/feed/page.tsx` in full after the change:

```tsx
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { listFeed } from '@/lib/social/list-feed'
import { Page, PageHeader } from '@/components/ui/page'
import { FeedList } from './feed-list'

export default async function FeedPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const events = await listFeed(supabase)

  return (
    <Page reveal>
      <PageHeader title="Feed" description="The 50 newest things that happened in DwellDuel." />
      <FeedList events={events} heading="Events" headingId="feed-events" headingHidden />
    </Page>
  )
}
```

**The four admin sections** render inside the admin layout's `<Page>`, so each wraps its own root element in `<ContentReveal>` … `</ContentReveal>`, with every line between re-indented by two spaces. Add `import { ContentReveal } from '@/components/nav/page-transition'` on the line after `import { EmptyState } from '@/components/ui/empty-state'` in each:

| Page | Root element to wrap |
|---|---|
| `app/(app)/admin/invites/page.tsx` | the outer `<div className="flex flex-col gap-5 lg:grid …">` … `</div>` |
| `app/(app)/admin/ledger/page.tsx` | `<section aria-labelledby="ledger-title" …>` … `</section>` |
| `app/(app)/admin/members/page.tsx` | `<section aria-labelledby="members-title" …>` … `</section>` |
| `app/(app)/admin/tasks/page.tsx` | the fragment `<>` … `</>`. Replace it with `<div className="flex flex-col gap-5 md:gap-7">` … `</div>` first (below). |

**`app/(app)/admin/tasks/page.tsx`.** A `ViewTransition` animates its nearest DOM children, and a fragment would give it two unrelated ones. So the fragment becomes one `<div>` with the admin `<Page>`'s own gap, and spacing is unchanged. Its `return` becomes:

```tsx
  return (
    <ContentReveal>
      <div className="flex flex-col gap-5 md:gap-7">
        <SectionCard
          title="Pending approvals"
          titleId="pending-approvals"
          className="gap-4"
          action={pending.length > 0 ? <span className="text-sm text-ink2">{pending.length} waiting</span> : undefined}
        >
          <PendingApprovals pending={pending} />
        </SectionCard>
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7">
          <SectionCard title="Create task" titleId="create-task" className="gap-4">
            <CreateTaskForm />
          </SectionCard>
          <SectionCard title="Task catalog" titleId="task-catalog" className="gap-1">
            {tasks.length === 0 ? (
              <EmptyState icon={BookOpen} title="No tasks yet." />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {tasks.map((task) => (
                  <TaskCatalogItem key={task.id} task={task} />
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </ContentReveal>
  )
```

The other three admin pages' `return` blocks after the change:

`app/(app)/admin/invites/page.tsx`:

```tsx
  return (
    <ContentReveal>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7">
        <SectionCard title="Invite someone" titleId="invite-someone">
          <AddInviteForm />
        </SectionCard>
        <SectionCard title="Invites" titleId="invites" className="gap-1">
          {invites.length === 0 ? (
            <EmptyState icon={Mail} title="No invites yet.">
              Add an email to invite someone.
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {invites.map((invite) => (
                <InviteListItem key={invite.email} invite={invite} revoke={<RevokeInviteButton email={invite.email} />} />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </ContentReveal>
  )
```

`app/(app)/admin/ledger/page.tsx`:

```tsx
  return (
    <ContentReveal>
      <section aria-labelledby="ledger-title" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
        <h2 id="ledger-title" className="sr-only">
          Every coin movement
        </h2>
        {entries.length === 0 ? (
          <div className="py-[18px] md:py-6">
            <EmptyState icon={NotebookText} title="No coin movements yet." />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {entries.map((e) => (
              <LedgerRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </section>
    </ContentReveal>
  )
```

`app/(app)/admin/members/page.tsx`:

```tsx
  return (
    <ContentReveal>
      <section aria-labelledby="members-title" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
        <h2 id="members-title" className="sr-only">
          Members
        </h2>
        {members.length === 0 ? (
          <div className="py-[18px] md:py-6">
            <EmptyState icon={Users} title="No members yet." />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex flex-col gap-3 py-4">
                <AdjustBalanceForm member={m} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </ContentReveal>
  )
```

No markup inside any wrapped element changes, so every e2e locator resolves exactly as before.

- [ ] **Step 11: Rewrite `app/(app)/members/[id]/page.tsx`**

```tsx
import { Suspense } from 'react'
import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { getLeaderboard } from '@/lib/social/leaderboard'
import { listFeed } from '@/lib/social/list-feed'
import { Page, h1Class } from '@/components/ui/page'
import { BackLink } from '@/components/ui/back-link'
import { Avatar } from '@/components/ui/avatar'
import { SkeletonScreen } from '@/components/ui/skeleton'
import { ContentReveal } from '@/components/nav/page-transition'
import { FeedListSkeleton } from '@/components/feed/feed-list-skeleton'
import { FeedList } from '@/app/(app)/feed/feed-list'

// No loading.tsx for this route: the member must be found before anything streams, so an
// unknown id still gets a real 404 status. Only the activity list streams in behind a skeleton.
export default async function MemberPage(props: PageProps<'/members/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = await getLeaderboard(supabase)
  const member = board.find((m) => m.id === id)
  if (!member) notFound()

  return (
    <Page>
      <BackLink href="/leaderboard">Leaderboard</BackLink>
      <section className="flex items-center gap-4 md:gap-5">
        <Avatar name={member.displayName} size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className={h1Class}>{member.displayName}</h1>
          <p className="text-[18px] font-extrabold tabular-nums">
            {member.balance} DC · Rank {member.rank} of {board.length}
          </p>
        </div>
      </section>
      <Suspense
        fallback={
          <SkeletonScreen name="member-activity">
            <FeedListSkeleton />
          </SkeletonScreen>
        }
      >
        <MemberActivity memberId={member.id} />
      </Suspense>
    </Page>
  )
}

async function MemberActivity({ memberId }: { memberId: string }) {
  const { supabase } = await requireUser()
  const events = await listFeed(supabase, { actorId: memberId })

  return (
    <ContentReveal>
      <FeedList events={events} heading="Recent activity" headingId="recent-activity" />
    </ContentReveal>
  )
}
```

- [ ] **Step 12: Write `e2e/skeletons.spec.ts`**

```typescript
import { test, expect, type Request } from '@playwright/test'

// Next fetches a route's loading state ahead of time (a prefetch, marked Next-Router-Prefetch), and
// fetches the page itself on click (RSC, no prefetch header). Holding only the second one keeps the
// destination loading for as long as the test needs, whatever the database's speed.
const isLeaderboard = (url: URL) => url.pathname === '/leaderboard'

function isPageFetch(request: Request) {
  const headers = request.headers()
  return headers['rsc'] === '1' && !('next-router-prefetch' in headers)
}

function isLoadingStatePrefetch(request: Request) {
  const headers = request.headers()
  return headers['next-router-prefetch'] === '1' && !('next-router-segment-prefetch' in headers)
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('a slow navigation shows the destination skeleton before its content', async ({ page }) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(isLeaderboard, async (route) => {
      if (isPageFetch(route.request())) await held
      await route.continue()
    })
    // Registered before goto: a link in view is prefetched as soon as the page is idle.
    const prefetched = page.waitForResponse(
      (response) => isLeaderboard(new URL(response.url())) && isLoadingStatePrefetch(response.request()),
    )

    await page.goto('/')
    const link = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Leaderboard', exact: true })
    await link.hover()
    await prefetched

    await link.click()
    const skeleton = page.locator('[data-skeleton="leaderboard"]')
    await expect(skeleton).toBeVisible()
    await expect(page).toHaveURL(/\/leaderboard$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Leaderboard' })).toHaveCount(0)

    release()
    await expect(page.getByRole('heading', { level: 1, name: 'Leaderboard' })).toBeVisible()
    await expect(skeleton).toHaveCount(0)
  })
})
```

**How the delay is deterministic.** Checked against Next 16.3.5 in production mode:
- **The prefetch.** Links are prefetched once the page is idle, and again on hover. A dynamic route with a `loading.tsx` is prefetched in two requests. Both carry `RSC: 1` and `Next-Router-Prefetch: 1`:
  - a `Next-Router-Segment-Prefetch: /_tree` request for the route tree
  - a request without that header, which carries the segments down to the loading boundary
- **The click** fetches the page with `RSC: 1` and no prefetch header.
- **The spec** waits for the loading-state prefetch to finish, then holds only the click's fetch in `page.route` until it calls `release()`. The skeleton must be on screen, with no `Leaderboard` h1, for as long as the fetch is held. Once released, the h1 arrives and the skeleton is gone.
- **Why it can't pass by accident.** If Next ever renames these headers, the spec times out on `prefetched` or finds no skeleton. It fails loudly; it can't pass by luck.
- **Why desktop.** At 1280px the Primary navigation shows a `Leaderboard` link (`e2e/app-nav.spec.ts`). The leaderboard page has no drawer or dialog, so nothing else intercepts the click.

- [ ] **Step 13: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS. The build's route table is unchanged. `loading.tsx` files add no routes.

Check the CSS landed in the build:

Run: `grep -l "skeleton-shimmer" .next/static/chunks/*.css | xargs grep -o "::view-transition-new(.content-enter){[^}]*}"`
Expected: two matches. The first is `::view-transition-new(.content-enter){animation:.21s ease-in .15s both reveal-fade,.4s ease-in both reveal-rise}`, and the second is the reduced-motion `::view-transition-new(.content-enter){animation:none}`.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 21 passed. That's the 20 after Task 3 plus `skeletons.spec.ts`.
- `social.spec.ts`'s `an unknown member id shows a 404` still gets 404, because the member page has no boundary above its `notFound()`.
- `signed-out.spec.ts` still gets 307s through the proxy.
- Every other spec's locators auto-wait past the skeletons, which contain no matching roles or text.

- [ ] **Step 14: Commit**

```bash
git add components/ui/page.tsx components/nav/page-transition.tsx components/ui/skeleton.tsx components/feed/feed-list-skeleton.tsx app/globals.css "app/(app)" tests/components/view-transition-mock.ts tests/components/skeleton.test.tsx tests/components/loading-skeletons.test.tsx e2e/skeletons.spec.ts
git commit -m "Add route skeletons with a view-transition reveal, and stream the member page's activity"
```

---

## Task 5: Page transitions, navigation depth and nav pending hints

Navigations animate with React's `<ViewTransition>`, which the App Router runs on every navigation with no configuration (`node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`):
- **Drill-down.** A link into a market, a member, Create market or Admin carries `transitionTypes={['nav-forward']}`: the old page slides out left and the new one in from the right. `BackLink` carries `['nav-back']` and slides the other way.
- **Tabs and everything untagged** (a tab-bar tap, a skeleton giving way to its content) crossfade. That includes Task 4's skeleton reveals: one combined mapping in `components/nav/page-transition.tsx` carries the drill-down slides, the tab crossfade and the skeleton-to-content reveal, so no wrapper silences another. (The browser's own back, and `router.back()`, run no view transition at all: React commits a popstate traversal synchronously.)
- **The chrome stays put.** The two top bars, the tab bar and Task 1's status band each carry a `viewTransitionName`. CSS takes them out of the animation and draws them above the moving content.
- **Reduced motion** zeroes every view-transition duration.

This task also adds:
- `lib/nav/nav-depth.ts`, the per-session navigation count Task 6's back-swipe uses to decide between `router.back()` and the page's logical parent
- a `useLinkStatus` pending hint on every nav link

**How each page opts in.** `Page` (`components/ui/page.tsx`) swaps Task 4's `reveal` prop for a `transition` prop: `'tab'` or `'drill-down'`. Each page then changes one line, `<Page reveal>` (or `<Page>`) → `<Page transition="…">`, and doesn't need re-indenting or wrapping by hand. The wrapper sits in each page rather than in a layout: a layout persists across navigations, so its enter and exit never fire (view-transitions guide, "Wrap every participating page"). The exception is the admin layout, which persists only while you move between admin sections. That's exactly when the admin page shouldn't slide.

**Files:**
- Create: `lib/nav/nav-depth.ts`
- Create: `tests/lib/nav/nav-depth.test.tsx`
- Rewrite (Task 4 created it): `components/nav/page-transition.tsx`
- Create: `tests/components/page-transition.test.tsx`
- Rewrite: `tests/components/skeleton.test.tsx` (Task 4's reveal expectations move to the combined mapping)
- Create: `components/nav/nav-pending-hint.tsx`
- Create: `tests/components/nav-pending-hint.test.tsx`
- Create: `tests/components/transition-links.test.tsx`
- Modify: `app/globals.css` (replace Task 4's reveal rules with the view-transition block)
- Modify: `components/ui/page.tsx` (the `transition` prop replaces `reveal`)
- Modify: `components/app-nav/app-nav.tsx`, `tests/components/app-nav.test.tsx`
- Modify: `components/app-shell/status-band.tsx` (its `viewTransitionName`)
- Modify: `app/(app)/layout.tsx` (mount `NavDepthTracker`)
- Modify, links: `components/ui/back-link.tsx`, `components/markets/market-card.tsx`, `components/leaderboard/leaderboard-row.tsx`, `components/home/home-tiles.tsx`, `components/feed/feed-item.tsx`, `components/markets/bet-list.tsx`, `components/admin/ledger-row.tsx`, `components/parlays/slip-pick.tsx`, `components/parlays/placed-parlay.tsx`, `app/(app)/markets/page.tsx`, `app/(app)/admin/tasks/pending-approvals.tsx`, `app/(app)/admin/members/adjust-balance-form.tsx`
- Modify, pages: `app/(app)/(home)/page.tsx` (Task 3 moved Home here), `app/(app)/markets/page.tsx`, `app/(app)/parlays/page.tsx`, `app/(app)/tasks/page.tsx`, `app/(app)/feed/page.tsx`, `app/(app)/leaderboard/page.tsx`, `app/(app)/markets/[id]/page.tsx`, `app/(app)/markets/new/page.tsx`, `app/(app)/members/[id]/page.tsx`, `app/(app)/admin/layout.tsx`

**Interfaces:**
- Consumes:
  - `ViewTransition` and the types `ViewTransitionProps` / `ViewTransitionClassPerType` from `react`. Next's bundled canary React exports them at runtime, including its `react-server` build, so the wrappers work in Server Components. `@types/react` 19.3 types them. No config flag is needed.
  - `Link`'s `transitionTypes?: string[]` prop and `useLinkStatus()` from `next/link` (`02-components/link.md#transitiontypes`, `04-functions/use-link-status.md`).
  - `usePathname` from `next/navigation`.
  - Task 1's `StatusBand` (`components/app-shell/status-band.tsx`). Task 3's `app/(app)/(home)/page.tsx`. Task 4's `components/nav/page-transition.tsx` (`SkeletonReveal`, `ContentReveal`), its `Page` `reveal` prop and `pageClass`, and its shared `react` mock `tests/components/view-transition-mock.ts`.
- Produces:
  - `lib/nav/nav-depth.ts` (`'use client'`):
    - `useNavDepth(): number` is 0 on a fresh load or deep link, +1 per in-app forward navigation, and −1 on back.
    - `NavDepthTracker(): null` is mounted once in the `(app)` layout.
  - `components/nav/page-transition.tsx`, server-safe (no `'use client'`):
    - `RouteTransition({ children })`
    - `DrillDownTransition`, `TabTransition`, `SkeletonReveal` and `ContentReveal`, all the same component.
    - The classes on those routes are `nav-forward`, `nav-back`, `page-enter` and `page-exit`, with `default="none"`.
  - `Page({ className, transition, children })`, where `transition?: 'tab' | 'drill-down'`. It replaces Task 4's `reveal`. Task 6 adds `BackSwipe` inside the `'drill-down'` branch.
  - `NavPendingHint({ className })` (`'use client'`), rendered inside a `Link`.
  - These view-transition names are reserved: `status-band`, `app-header`, `app-topbar` and `app-tabbar`.

**Rulings.**
- **One wrapper for every route.**
  - Whether a navigation slides or fades depends on the link, not the page. A tab page must slide out when you drill in from it, and a drilled page must fade when you leave it by the tab bar.
  - So `DrillDownTransition` and `TabTransition` are the same component. The two names only say, at the call site, which kind of page is wrapped.
  - Task 4's `SkeletonReveal` and `ContentReveal` join them. A skeleton then slides in with its route on `nav-forward`, and it fades into its content on the untagged reveal.
- **Tab links get no transition type.** Untagged means fade. `router.refresh()`, Task 8's live refreshes and server-action revalidations update the page in place, and `default="none"` keeps those still.
- **Links that get `nav-forward`:** every link that opens a market, a member or Create market, Admin (top bar, desktop nav and the Home tile), and market links in the slip and placed parlays.
- **Links that get `nav-back`:** `BackLink`.
- **Links left untagged, so they fade:** tab-bar and desktop-nav tabs, Home's tab tiles, the wordmark, "Review slip", and the admin section tabs.
- **Admin sections.** The admin layout slides as one drilled-into page, header and section nav included. Moving between sections fades through the `ContentReveal` Task 4 put around each section and the section skeletons' `SkeletonReveal`.
- **Nesting.** `enter`/`exit` fire only on the outermost `ViewTransition` of the subtree that mounts or unmounts. On a navigation that is the page's own wrapper. When a Suspense boundary later reveals content inside an already-mounted page (the member page's activity list, an admin section), that inner `ContentReveal` is the outermost of the new subtree, so it fades in; the outer wrapper only sees an update, which `default="none"` keeps still.
- **Chrome.**
  - The desktop and phone headers get different names (`app-header`, `app-topbar`). Only one is displayed at a time, and a duplicate `view-transition-name` on two rendered elements would abort the transition.
  - Named chrome is skipped by hit-testing for the ~0.4s of a transition. That is why the durations stay short.
- **Pending hint.** It's a 2px bar, always rendered and `aria-hidden`, so it adds nothing to any link's name or to layout. It fades in only after 120ms.

- [ ] **Step 1: Write the nav-depth test**

Create `tests/lib/nav/nav-depth.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

type NavDepthModule = typeof import('@/lib/nav/nav-depth')
let mod: NavDepthModule

// The count lives in module scope, so each test loads a fresh copy of the module.
beforeEach(async () => {
  vi.resetModules()
  mod = await import('@/lib/nav/nav-depth')
  pathname = '/'
  window.history.replaceState(null, '', '/')
})

function Harness() {
  const depth = mod.useNavDepth()
  return (
    <>
      <mod.NavDepthTracker />
      <output>{depth}</output>
    </>
  )
}

function navigate(rerender: (ui: React.ReactElement) => void, to: string) {
  pathname = to
  window.history.pushState(null, '', to)
  rerender(<Harness />)
}

function goBack(rerender: (ui: React.ReactElement) => void, to: string) {
  pathname = to
  window.history.replaceState(null, '', to)
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  rerender(<Harness />)
}

const depth = () => screen.getByRole('status').textContent

describe('nav depth', () => {
  it('starts at 0 on a fresh load or deep link', () => {
    pathname = '/markets/3f2a'
    render(<Harness />)
    expect(depth()).toBe('0')
  })

  it('counts each in-app forward navigation', () => {
    const { rerender } = render(<Harness />)
    navigate(rerender, '/markets')
    expect(depth()).toBe('1')
    navigate(rerender, '/markets/3f2a')
    expect(depth()).toBe('2')
  })

  it('counts a back navigation down again', () => {
    const { rerender } = render(<Harness />)
    navigate(rerender, '/markets')
    navigate(rerender, '/markets/3f2a')
    goBack(rerender, '/markets')
    expect(depth()).toBe('1')
    goBack(rerender, '/')
    expect(depth()).toBe('0')
  })

  it('never goes below 0', () => {
    pathname = '/markets/3f2a'
    const { rerender } = render(<Harness />)
    goBack(rerender, '/markets')
    expect(depth()).toBe('0')
  })

  it('ignores re-renders on the same pathname', () => {
    const { rerender } = render(<Harness />)
    navigate(rerender, '/feed')
    rerender(<Harness />)
    rerender(<Harness />)
    expect(depth()).toBe('1')
  })

  it('ignores a popstate that keeps the pathname, so the next push still counts up', () => {
    const { rerender } = render(<Harness />)
    navigate(rerender, '/feed')
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    navigate(rerender, '/leaderboard')
    expect(depth()).toBe('2')
  })

  it('shares one count between every reader', () => {
    function Reader() {
      return <span data-testid="reader">{mod.useNavDepth()}</span>
    }
    const { rerender } = render(
      <>
        <Harness />
        <Reader />
      </>,
    )
    pathname = '/markets'
    rerender(
      <>
        <Harness />
        <Reader />
      </>,
    )
    expect(screen.getByTestId('reader')).toHaveTextContent('1')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/nav/nav-depth.test.tsx`
Expected: FAIL. The module `@/lib/nav/nav-depth` doesn't exist.

- [ ] **Step 3: Write `lib/nav/nav-depth.ts`**

```ts
'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'

// history.length also counts entries from before the app loaded and never shrinks on back, so
// the app keeps its own count. It lives in module scope: a full reload starts it again at 0.
let depth = 0
let popPending = false
const listeners = new Set<() => void>()

function setDepth(next: number) {
  depth = Math.max(0, next)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useNavDepth(): number {
  return useSyncExternalStore(
    subscribe,
    () => depth,
    () => 0,
  )
}

export function NavDepthTracker(): null {
  const pathname = usePathname()
  const previous = useRef<string | null>(null)

  useEffect(() => {
    function onPopState() {
      // A hash or search-only traversal fires popstate without changing the pathname.
      if (window.location.pathname !== previous.current) popPending = true
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (previous.current === null || previous.current === pathname) {
      previous.current = pathname
      return
    }
    previous.current = pathname
    if (popPending) {
      popPending = false
      setDepth(depth - 1)
    } else {
      setDepth(depth + 1)
    }
  }, [pathname])

  return null
}
```

**Why a module-level count.**
- `history.length` counts entries from before the app loaded, and doesn't shrink on back, so it can't say whether `history.back()` stays in the app.
- A full reload resets the count to 0. The back-swipe then pushes the logical parent instead of going back, which is the safe direction.
- A browser forward traversal also counts down, because popstate can't tell back from forward. That can only make the count too low, which is again the safe direction.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/lib/nav/nav-depth.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the transition-wrapper and link tests**

Create `tests/components/page-transition.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { viewTransitionCalls as calls } from '@/tests/components/view-transition-mock'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { Page } from '@/components/ui/page'
import {
  ContentReveal,
  DrillDownTransition,
  SkeletonReveal,
  TabTransition,
} from '@/components/nav/page-transition'

beforeEach(() => {
  calls.length = 0
})

describe('route transitions', () => {
  it.each([
    ['DrillDownTransition', DrillDownTransition],
    ['TabTransition', TabTransition],
    ['SkeletonReveal', SkeletonReveal],
    ['ContentReveal', ContentReveal],
  ])('%s slides for nav-forward and nav-back, fades otherwise, and stays still on updates', (_name, Wrapper) => {
    render(
      <Wrapper>
        <p>Page content</p>
      </Wrapper>,
    )

    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(calls).toHaveLength(1)
    expect(calls[0].enter).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-enter' })
    expect(calls[0].exit).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-exit' })
    expect(calls[0].default).toBe('none')
    expect(calls[0].name).toBeUndefined()
    expect(calls[0].share).toBeUndefined()
  })

  it('leaves a plain Page without a transition', () => {
    const { container } = render(<Page>Body</Page>)
    expect(calls).toHaveLength(0)
    expect(container.firstElementChild).toBe(screen.getByText('Body'))
  })

  it('wraps a tab Page in the route transition and adds no DOM of its own', () => {
    const { container } = render(<Page transition="tab">Body</Page>)
    expect(calls).toHaveLength(1)
    expect(calls[0].default).toBe('none')
    expect(container.firstElementChild).toBe(screen.getByText('Body'))
  })

  it('wraps a drilled-into Page in the route transition', () => {
    const { container } = render(<Page transition="drill-down">Body</Page>)
    expect(calls).toHaveLength(1)
    expect(calls[0].enter).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-enter' })
    expect(container.firstElementChild).toBe(screen.getByText('Body'))
  })
})
```

Create `tests/components/transition-links.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { Target } from 'lucide-react'

// Vitest resolves next/link to the Pages Router Link, which drops transitionTypes before the DOM,
// so the prop is written onto the anchor for these assertions.
vi.mock('next/link', () => ({
  default: ({ transitionTypes, href, ...props }: ComponentProps<'a'> & { href: string; transitionTypes?: string[] }) => (
    <a href={href} data-transition-types={transitionTypes?.join(' ')} {...props} />
  ),
}))
vi.mock('@/components/markets/probability-chart', () => ({ ProbabilityChart: () => null }))

import { BackLink } from '@/components/ui/back-link'
import { MarketCard } from '@/components/markets/market-card'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'
import { FeedItem } from '@/components/feed/feed-item'
import { HomeTiles } from '@/components/home/home-tiles'

const types = (name: string | RegExp) => screen.getByRole('link', { name }).getAttribute('data-transition-types')

describe('transition types on links', () => {
  it('tags the back link nav-back', () => {
    render(<BackLink href="/markets">Markets</BackLink>)
    expect(types('Markets')).toBe('nav-back')
  })

  it('tags links into a market or a member nav-forward', () => {
    render(
      <>
        <MarketCard
          id="m1"
          title="Will it rain?"
          status="open"
          kind="binary"
          closeAt="2026-10-04T16:30:00.000Z"
          resolvedAt={null}
          outcomes={[]}
          resolvedOutcomeLabel={null}
        />
        <ol>
          <LeaderboardRow rank={1} name="Bob" balance={120} isMe={false} href="/members/b" />
        </ol>
        <ul>
          <FeedItem icon={Target} segments={[{ text: 'Carol', href: '/members/c' }]} age="1m ago" />
        </ul>
      </>,
    )
    expect(types('Will it rain?')).toBe('nav-forward')
    expect(types('Bob')).toBe('nav-forward')
    expect(types('Carol')).toBe('nav-forward')
  })

  it('slides into Admin from Home, and leaves tab tiles to the crossfade', () => {
    render(
      <HomeTiles
        tiles={[
          { id: 'markets', href: '/markets', icon: Target, title: 'Markets', subtitle: '2 open' },
          { id: 'admin', href: '/admin/invites', icon: Target, title: 'Admin', subtitle: 'All clear' },
        ]}
      />,
    )
    expect(types(/^Admin/)).toBe('nav-forward')
    expect(types(/^Markets/)).toBeNull()
  })
})
```

Create `tests/components/nav-pending-hint.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let pending = false
vi.mock('next/link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/link')>()
  return { ...actual, useLinkStatus: () => ({ pending }) }
})

import Link from 'next/link'
import { NavPendingHint } from '@/components/nav/nav-pending-hint'

beforeEach(() => {
  pending = false
})

describe('NavPendingHint', () => {
  it('stays in the link, hidden from assistive tech, while idle', () => {
    render(
      <Link href="/markets">
        Markets
        <NavPendingHint className="bottom-1 left-3 h-0.5 w-4" />
      </Link>,
    )
    const link = screen.getByRole('link', { name: 'Markets' })
    const hint = link.querySelector('.nav-pending-hint')
    expect(hint).toHaveAttribute('aria-hidden', 'true')
    expect(hint).not.toHaveAttribute('data-pending')
    expect(hint).toHaveClass('absolute', 'bottom-1', 'left-3', 'h-0.5', 'w-4')
    expect(hint).toBeEmptyDOMElement()
  })

  it('marks itself pending while the navigation is in flight', () => {
    pending = true
    render(
      <Link href="/markets">
        Markets
        <NavPendingHint />
      </Link>,
    )
    expect(screen.getByRole('link', { name: 'Markets' }).querySelector('.nav-pending-hint')).toHaveAttribute(
      'data-pending',
      '',
    )
  })
})
```

Rewrite `tests/components/skeleton.test.tsx` in full. The reveals now use the combined mapping, which `page-transition.test.tsx` covers, and `Page` no longer takes `reveal`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { viewTransitionCalls } from '@/tests/components/view-transition-mock'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { Skeleton, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

beforeEach(() => {
  viewTransitionCalls.length = 0
})

describe('Skeleton', () => {
  it('is a hidden block carrying the shimmer class and any overrides', () => {
    const { container } = render(<Skeleton className="h-6 w-40 rounded-full" />)
    const block = container.firstElementChild!
    expect(block).toHaveAttribute('aria-hidden', 'true')
    expect(block).toHaveClass('skeleton', 'h-6', 'w-40', 'rounded-full')
    expect(block).toBeEmptyDOMElement()
  })

  it('builds a field from a label bar and a control bar, taller for a textarea', () => {
    const { container } = render(
      <>
        <SkeletonField />
        <SkeletonField tall />
      </>,
    )
    const [field, tallField] = Array.from(container.children)
    expect(field.lastElementChild).toHaveClass('h-12')
    expect(tallField.lastElementChild).toHaveClass('h-[100px]')
  })
})

describe('SkeletonScreen', () => {
  it('names the skeleton, announces loading, and hands off through the route transition', () => {
    const { container } = render(
      <SkeletonScreen name="feed" className="flex flex-col">
        <Skeleton className="h-6" />
      </SkeletonScreen>,
    )
    expect(viewTransitionCalls).toHaveLength(1)
    expect(viewTransitionCalls[0].exit).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-exit' })
    expect(viewTransitionCalls[0].default).toBe('none')
    const screenEl = container.firstElementChild!
    expect(screenEl).toHaveAttribute('data-skeleton', 'feed')
    expect(screenEl).toHaveClass('flex', 'flex-col')
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screenEl.querySelectorAll('.skeleton')).toHaveLength(1)
  })
})
```

In `tests/components/app-nav.test.tsx`, add these two cases as the first two inside `describe('AppNav', () => {`, straight after that line:

```tsx
  it('names the top bars and the tab bar so page transitions leave them in place', () => {
    render(<AppNav balance={120} slipCount={0} isAdmin={false} />)
    const [desktopBar, phoneBar] = screen.getAllByRole('banner')
    const [, tabs] = screen.getAllByRole('navigation', { name: 'Primary' })
    expect(desktopBar.style.viewTransitionName).toBe('app-header')
    expect(phoneBar.style.viewTransitionName).toBe('app-topbar')
    expect(tabs.style.viewTransitionName).toBe('app-tabbar')
  })

  it('gives every nav link a hidden pending hint that adds nothing to its name', () => {
    render(<AppNav balance={120} slipCount={2} isAdmin />)
    const links = [
      ...screen.getAllByRole('navigation', { name: 'Primary' }).flatMap((nav) => within(nav).getAllByRole('link')),
      within(screen.getAllByRole('banner')[1]).getByRole('link', { name: 'Admin' }),
    ]
    expect(links).toHaveLength(14)
    for (const link of links) {
      const hint = link.querySelector('.nav-pending-hint')
      expect(hint).toHaveAttribute('aria-hidden', 'true')
      expect(hint).toBeEmptyDOMElement()
    }
    expect(screen.getAllByRole('link', { name: 'Parlays (2)' })).toHaveLength(2)
  })
```

**Two jsdom facts these tests work around:**
- **`ViewTransition` is mocked** through Task 4's shared helper. Vitest resolves the stable `react` 19.2.8 package, which doesn't export `ViewTransition`. Only Next's bundled canary React does. The stand-in records the props and renders the children.
- **`next/link` is mocked in the link test.** In Vitest, `next/link` resolves to the Pages Router `Link` (`next/dist/client/link.js`). That `Link` strips `transitionTypes`, and its `useLinkStatus` always returns `{ pending: false }`. That's why the AppNav test can render the real hint without a router.

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run tests/components/page-transition.test.tsx tests/components/skeleton.test.tsx tests/components/transition-links.test.tsx tests/components/nav-pending-hint.test.tsx tests/components/app-nav.test.tsx`
Expected: FAIL.
- `page-transition` fails its route-transition cases (Task 4's wrappers still carry the reveal classes) and its `transition` Page cases.
- `skeleton` fails its SkeletonScreen case, for the same reason.
- `nav-pending-hint` fails to import its module.
- `transition-links` fails all three cases: the `data-transition-types` attributes are missing.
- `app-nav` fails the two new cases, with no `viewTransitionName` and no `.nav-pending-hint`.

- [ ] **Step 7: Rewrite `components/nav/page-transition.tsx`**

Replace Task 4's file whole. `SkeletonReveal` and `ContentReveal` keep their names and their `{ children }` props, so the `loading.tsx` files, the admin sections and the member page compile unchanged.

```tsx
import { ViewTransition, type ReactNode, type ViewTransitionClassPerType } from 'react'

// The class names match the ::view-transition rules in app/globals.css. A navigation tagged
// nav-forward or nav-back slides; an untagged one (a tab, a skeleton giving way to content, the
// browser's own back button) fades across. default="none" keeps router.refresh() and in-place
// updates still.
const DIRECTIONAL = { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back' }
const ENTER: ViewTransitionClassPerType = { ...DIRECTIONAL, default: 'page-enter' }
const EXIT: ViewTransitionClassPerType = { ...DIRECTIONAL, default: 'page-exit' }

export function RouteTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={ENTER} exit={EXIT} default="none">
      {children}
    </ViewTransition>
  )
}

// Every route animates alike: the link that leads somewhere picks the motion through its
// transitionTypes. The names say which kind of page a call site wraps.
export const DrillDownTransition = RouteTransition
export const TabTransition = RouteTransition
export const SkeletonReveal = RouteTransition
export const ContentReveal = RouteTransition
```

- [ ] **Step 8: Write `components/nav/nav-pending-hint.tsx`**

```tsx
'use client'

import { useLinkStatus } from 'next/link'
import { cn } from '@/lib/utils'

// Always rendered, so a pending navigation never shifts the layout. app/globals.css holds it
// invisible until the navigation has taken longer than a prefetched one would.
export function NavPendingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden="true"
      data-pending={pending ? '' : undefined}
      className={cn('nav-pending-hint pointer-events-none absolute rounded-full bg-current', className)}
    />
  )
}
```

- [ ] **Step 9: Append the view-transition CSS to `app/globals.css`**

First, delete Task 4's reveal rules: its wrappers now emit `page-enter` / `page-exit`, which the block below styles. Delete everything from this comment:

```css
/* Skeleton-to-content reveal (components/nav/page-transition.tsx). The skeleton leaves fast, sliding down;
```

through the end of the file, which is Task 4's reduced-motion block:

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(.skeleton-exit),
  ::view-transition-new(.content-enter) {
    animation: none;
  }
}
```

That removes the `.skeleton-exit` / `.content-enter` rules, Task 4's `::view-transition { pointer-events: none }` (the block below has its own), and the `reveal-fade` / `reveal-rise` keyframes. Task 4's `.skeleton` rule and `skeleton-shimmer` keyframes, just above, stay.

Then append this block at the end of the file:

```css
/* Page transitions. React's <ViewTransition> (components/nav/page-transition.tsx) adds these
   classes: nav-forward / nav-back from a link's transitionTypes, page-enter / page-exit for
   everything else. */
:root {
  --vt-exit: 150ms;
  --vt-enter: 210ms;
  --vt-move: 360ms;
}

/* The overlay would otherwise swallow every tap made while a transition runs. */
::view-transition {
  pointer-events: none;
}

@keyframes vt-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes vt-slide-x {
  from { translate: var(--vt-offset) 0; }
  to { translate: 0 0; }
}

@keyframes vt-rise {
  from { translate: 0 8px; }
  to { translate: 0 0; }
}

::view-transition-old(.nav-forward) {
  --vt-offset: -60px;
  animation:
    var(--vt-exit) ease-in both vt-fade reverse,
    var(--vt-move) cubic-bezier(0.32, 0.72, 0, 1) both vt-slide-x reverse;
}
::view-transition-new(.nav-forward) {
  --vt-offset: 60px;
  animation:
    var(--vt-enter) ease-out var(--vt-exit) both vt-fade,
    var(--vt-move) cubic-bezier(0.32, 0.72, 0, 1) both vt-slide-x;
}
::view-transition-old(.nav-back) {
  --vt-offset: 60px;
  animation:
    var(--vt-exit) ease-in both vt-fade reverse,
    var(--vt-move) cubic-bezier(0.32, 0.72, 0, 1) both vt-slide-x reverse;
}
::view-transition-new(.nav-back) {
  --vt-offset: -60px;
  animation:
    var(--vt-enter) ease-out var(--vt-exit) both vt-fade,
    var(--vt-move) cubic-bezier(0.32, 0.72, 0, 1) both vt-slide-x;
}

::view-transition-old(.page-exit) {
  animation: var(--vt-exit) ease-in both vt-fade reverse;
}
::view-transition-new(.page-enter) {
  animation:
    var(--vt-enter) ease-out both vt-fade,
    var(--vt-enter) ease-out both vt-rise;
}

/* The chrome stays put while the content under it moves: no animation, drawn above the
   content, and only the new snapshot shown so the old and new bars never overlap. */
::view-transition-group(status-band),
::view-transition-group(app-header),
::view-transition-group(app-topbar),
::view-transition-group(app-tabbar) {
  animation: none;
  z-index: 100;
}
::view-transition-old(status-band),
::view-transition-old(app-header),
::view-transition-old(app-topbar),
::view-transition-old(app-tabbar) {
  display: none;
}
::view-transition-new(status-band),
::view-transition-new(app-header),
::view-transition-new(app-topbar),
::view-transition-new(app-tabbar) {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*),
  ::view-transition-new(*),
  ::view-transition-group(*) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
}

/* The nav's pending hint (components/nav/nav-pending-hint.tsx) waits 120ms before showing, so
   a prefetched navigation never flashes it. */
.nav-pending-hint {
  opacity: 0;
}
.nav-pending-hint[data-pending] {
  animation:
    vt-hint-in 150ms ease-out 120ms forwards,
    vt-hint-pulse 1s ease-in-out 270ms infinite;
}
@media (prefers-reduced-motion: reduce) {
  .nav-pending-hint[data-pending] {
    animation: vt-hint-in 0s linear 120ms forwards;
  }
}
@keyframes vt-hint-in {
  to { opacity: 1; }
}
@keyframes vt-hint-pulse {
  50% { opacity: 0.35; }
}
```

- [ ] **Step 10: Give `Page` its `transition` prop**

In `components/ui/page.tsx`, replace the import:

```tsx
import { ContentReveal } from '@/components/nav/page-transition'
```

with:

```tsx
import { DrillDownTransition, TabTransition } from '@/components/nav/page-transition'
```

and replace `Page`:

```tsx
export function Page({
  className,
  reveal = false,
  children,
}: {
  className?: string
  reveal?: boolean
  children: ReactNode
}) {
  const page = <div className={cn(pageClass, className)}>{children}</div>
  return reveal ? <ContentReveal>{page}</ContentReveal> : page
}
```

with:

```tsx
export function Page({
  className,
  transition,
  children,
}: {
  className?: string
  transition?: 'tab' | 'drill-down'
  children: ReactNode
}) {
  const page = <div className={cn(pageClass, className)}>{children}</div>
  if (transition === 'tab') return <TabTransition>{page}</TabTransition>
  if (transition === 'drill-down') return <DrillDownTransition>{page}</DrillDownTransition>
  return page
}
```

`pageClass`, `PageHeader`, `h1Class`, `h2Class` and `eyebrowClass` don't change.

- [ ] **Step 11: Opt each page in**

In each file below, change the `<Page …>` that the page returns (exactly one per file) to the form shown. Nothing else in these files changes.

| File | Before | After |
|---|---|---|
| `app/(app)/(home)/page.tsx` | `<Page reveal>` | `<Page transition="tab">` |
| `app/(app)/markets/page.tsx` | `<Page reveal>` | `<Page transition="tab">` |
| `app/(app)/parlays/page.tsx` | `<Page reveal>` | `<Page transition="tab">` |
| `app/(app)/tasks/page.tsx` | `<Page reveal>` | `<Page transition="tab">` |
| `app/(app)/feed/page.tsx` | `<Page reveal>` | `<Page transition="tab">` |
| `app/(app)/leaderboard/page.tsx` | `<Page reveal>` | `<Page transition="tab">` |
| `app/(app)/markets/[id]/page.tsx` | `<Page reveal>` | `<Page transition="drill-down">` |
| `app/(app)/markets/new/page.tsx` | `<Page reveal>` | `<Page transition="drill-down">` |
| `app/(app)/members/[id]/page.tsx` | `<Page>` | `<Page transition="drill-down">` |
| `app/(app)/admin/layout.tsx` | `<Page>` | `<Page transition="drill-down">` |

- **Keep every `ContentReveal` Task 4 put inside a page:** the four admin sections, and the member page's streamed activity list inside `<Suspense>`. They're now the same route transition, and they fade their content in when it streams.
- **The `loading.tsx` files don't change.** Their `SkeletonScreen` already wraps each skeleton in `SkeletonReveal`.

Check nothing still passes `reveal`:

Run: `grep -rn "Page reveal" app components`
Expected: no output.

- [ ] **Step 12: Tag the drill-down and back links**

Make these edits.

(a) `components/ui/back-link.tsx`, in full:

```tsx
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      transitionTypes={['nav-back']}
      className="inline-flex min-h-11 items-center gap-1.5 self-start font-bold"
    >
      <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
      {children}
    </Link>
  )
}
```

(b) `components/markets/market-card.tsx`: replace

```tsx
        <Link href={`/markets/${id}`}>{title}</Link>
```

with

```tsx
        <Link href={`/markets/${id}`} transitionTypes={['nav-forward']}>{title}</Link>
```

(c) `components/leaderboard/leaderboard-row.tsx`: replace

```tsx
        <Link href={href}>{name}</Link>
```

with

```tsx
        <Link href={href} transitionTypes={['nav-forward']}>{name}</Link>
```

(d) `app/(app)/markets/page.tsx`, both Create market links. Replace

```tsx
          <Link
            href="/markets/new"
            className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'md:min-h-12 md:px-5 md:text-base')}
```

with

```tsx
          <Link
            href="/markets/new"
            transitionTypes={['nav-forward']}
            className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'md:min-h-12 md:px-5 md:text-base')}
```

and replace

```tsx
            <Link href="/markets/new" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
```

with

```tsx
            <Link
              href="/markets/new"
              transitionTypes={['nav-forward']}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
```

(e) `components/home/home-tiles.tsx`: replace

```tsx
            key={id}
            href={href}
```

with

```tsx
            key={id}
            href={href}
            transitionTypes={id === 'admin' ? ['nav-forward'] : undefined}
```

(f) `components/feed/feed-item.tsx`: replace

```tsx
            <Link key={i} href={segment.href}>
```

with

```tsx
            <Link key={i} href={segment.href} transitionTypes={['nav-forward']}>
```

(g) `components/markets/bet-list.tsx`: replace

```tsx
<Link href={`/members/${b.profileId}`}>{b.bettorName}</Link>
```

with

```tsx
<Link href={`/members/${b.profileId}`} transitionTypes={['nav-forward']}>{b.bettorName}</Link>
```

(h) `components/admin/ledger-row.tsx`: replace

```tsx
<Link href={`/members/${entry.profileId}`}>{entry.memberName}</Link>
```

with

```tsx
<Link href={`/members/${entry.profileId}`} transitionTypes={['nav-forward']}>{entry.memberName}</Link>
```

(i) `app/(app)/admin/tasks/pending-approvals.tsx`: replace

```tsx
<Link href={`/members/${c.submitterId}`}>{c.submitterName}</Link>
```

with

```tsx
<Link href={`/members/${c.submitterId}`} transitionTypes={['nav-forward']}>{c.submitterName}</Link>
```

(j) `app/(app)/admin/members/adjust-balance-form.tsx`: replace

```tsx
            <Link href={`/members/${member.id}`} className="font-extrabold">
```

with

```tsx
            <Link href={`/members/${member.id}`} transitionTypes={['nav-forward']} className="font-extrabold">
```

(k) `components/parlays/slip-pick.tsx`: replace

```tsx
        <Link href={`/markets/${pick.marketId}`} className="text-sm">
```

with

```tsx
        <Link href={`/markets/${pick.marketId}`} transitionTypes={['nav-forward']} className="text-sm">
```

(l) `components/parlays/placed-parlay.tsx`: replace

```tsx
              <Link href={`/markets/${leg.marketId}`}>
```

with

```tsx
              <Link href={`/markets/${leg.marketId}`} transitionTypes={['nav-forward']}>
```

**Why (g)–(i) stay on one line.** The text after each link, like `— 5 DC on`, stays exactly as it was. `e2e/social.spec.ts` matches `Alice — 5 DC on Yes (you)` verbatim, and splitting the JSX across lines risks changing that whitespace.

- [ ] **Step 13: Anchor the chrome and add the pending hints in `AppNav`**

These are anchored edits; the class strings include Task 2's `no-callout`, `top-(--safe-top)` and `pressable`.

(a) Add the import after the `AnimatedText` import:

```tsx
import { AnimatedText } from '@/components/ui/animated-text'
import { NavPendingHint } from '@/components/nav/nav-pending-hint'
```

(b) `DesktopLink` takes and passes `transitionTypes`. Replace

```tsx
  count = 0,
  icon: Icon,
}: {
  href: string
  label: string
  active: boolean
  count?: number
  icon?: LucideIcon
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
```

with

```tsx
  count = 0,
  icon: Icon,
  transitionTypes,
}: {
  href: string
  label: string
  active: boolean
  count?: number
  icon?: LucideIcon
  transitionTypes?: string[]
}) {
  return (
    <Link
      href={href}
      transitionTypes={transitionTypes}
      aria-current={active ? 'page' : undefined}
```

(c) Put the hint at the end of `DesktopLink`'s `Link`. Replace

```tsx
          </span>
        </>
      )}
    </Link>
  )
}
```

with

```tsx
          </span>
        </>
      )}
      <NavPendingHint className="inset-x-3.5 bottom-1 h-0.5" />
    </Link>
  )
}
```

(d) Name the desktop header. Replace

```tsx
      <header className="no-callout sticky top-(--safe-top) z-30 hidden h-[72px] shrink-0 items-center gap-5 border-b border-line bg-surface px-10 md:flex">
```

with

```tsx
      <header
        style={{ viewTransitionName: 'app-header' }}
        className="no-callout sticky top-(--safe-top) z-30 hidden h-[72px] shrink-0 items-center gap-5 border-b border-line bg-surface px-10 md:flex"
      >
```

(e) Admin in the desktop nav slides forward. Replace

```tsx
              <DesktopLink href={ADMIN_HREF} label="Admin" active={active === 'admin'} icon={ShieldCheck} />
```

with

```tsx
              <DesktopLink
                href={ADMIN_HREF}
                label="Admin"
                active={active === 'admin'}
                icon={ShieldCheck}
                transitionTypes={['nav-forward']}
              />
```

(f) Name the phone top bar. Replace

```tsx
      <header className="no-callout sticky top-(--safe-top) z-30 flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface pr-2 pl-3 md:hidden">
```

with

```tsx
      <header
        style={{ viewTransitionName: 'app-topbar' }}
        className="no-callout sticky top-(--safe-top) z-30 flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface pr-2 pl-3 md:hidden"
      >
```

(g) The phone Admin button slides forward, is `relative`, and gets a hint. Replace

```tsx
          <Link
            href={ADMIN_HREF}
            aria-label="Admin"
            aria-current={active === 'admin' ? 'page' : undefined}
            className={cn(
              'pressable inline-flex size-11 shrink-0 items-center justify-center rounded-control no-underline',
```

with

```tsx
          <Link
            href={ADMIN_HREF}
            transitionTypes={['nav-forward']}
            aria-label="Admin"
            aria-current={active === 'admin' ? 'page' : undefined}
            className={cn(
              'pressable relative inline-flex size-11 shrink-0 items-center justify-center rounded-control no-underline',
```

and replace

```tsx
            <ShieldCheck aria-hidden="true" className="size-[22px]" />
          </Link>
```

with

```tsx
            <ShieldCheck aria-hidden="true" className="size-[22px]" />
            <NavPendingHint className="inset-x-3 bottom-1 h-0.5" />
          </Link>
```

(h) Name the tab bar. Replace

```tsx
      <nav
        aria-label="Primary"
        className="no-callout fixed inset-x-0 bottom-0 z-30
```

with (the rest of the `className` string, including Task 2's safe-area padding, is unchanged)

```tsx
      <nav
        aria-label="Primary"
        style={{ viewTransitionName: 'app-tabbar' }}
        className="no-callout fixed inset-x-0 bottom-0 z-30
```

(i) Each tab link is `relative` and gets a hint. Replace

```tsx
                'pressable flex min-h-14 flex-col items-center justify-center gap-[3px] rounded-[14px] text-xs leading-[1.1] no-underline',
```

with

```tsx
                'pressable relative flex min-h-14 flex-col items-center justify-center gap-[3px] rounded-[14px] text-xs leading-[1.1] no-underline',
```

and replace

```tsx
                  </>
                )}
              </span>
            </Link>
```

with

```tsx
                  </>
                )}
              </span>
              <NavPendingHint className="bottom-0.5 left-1/2 h-0.5 w-5 -translate-x-1/2" />
            </Link>
```

Task 2's `pressable` and `no-callout` classes stay. Only `relative` is new.

- [ ] **Step 14: Name the status band**

In `components/app-shell/status-band.tsx`, replace:

```tsx
  return <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-30 h-(--safe-top) bg-status-band" />
```

with:

```tsx
  return (
    <div
      aria-hidden="true"
      style={{ viewTransitionName: 'status-band' }}
      className="pointer-events-none fixed inset-x-0 top-0 z-30 h-(--safe-top) bg-status-band"
    />
  )
```

The band is fixed chrome, like the bars.

- [ ] **Step 15: Mount the tracker in `app/(app)/layout.tsx`**

Add the import after the `AppNav` import:

```tsx
import { AppNav } from '@/components/app-nav/app-nav'
import { NavDepthTracker } from '@/lib/nav/nav-depth'
```

and render it first in the signed-in fragment. Replace

```tsx
    <>
      <AppNav
```

with

```tsx
    <>
      <NavDepthTracker />
      <AppNav
```

It only needs to sit inside the signed-in branch.

- [ ] **Step 16: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/nav/nav-depth.test.tsx tests/components/page-transition.test.tsx tests/components/skeleton.test.tsx tests/components/loading-skeletons.test.tsx tests/components/transition-links.test.tsx tests/components/nav-pending-hint.test.tsx tests/components/app-nav.test.tsx tests/components/screen-ui.test.tsx tests/components/status-band.test.tsx`
Expected: PASS.
- nav-depth: 7
- page-transition: 7
- skeleton: 3
- loading-skeletons: 12, unchanged
- transition-links: 3
- nav-pending-hint: 2
- app-nav: 2 more than before
- screen-ui and status-band: unchanged, since a plain `<Page>` renders exactly as before and the band's classes are the same

- [ ] **Step 17: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS.

Check that the built stylesheet carries the rules:

```bash
cat .next/static/chunks/*.css | grep -o '::view-transition-new(.nav-forward){[^}]*}'
cat .next/static/chunks/*.css | grep -o '::view-transition-group(app-tabbar){[^}]*}'
cat .next/static/chunks/*.css | grep -o '.nav-pending-hint\[data-pending\]{[^}]*}'
```

Expected: each prints one rule. The third prints two: the pulse, and the reduced-motion version.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 21 passed, the same as after Task 4. This task adds no spec.
- Transitions add no DOM text. The hints are `aria-hidden` and empty.
- `transitionTypes` never reaches the DOM.
- So every e2e role and name still resolves to the same number of elements.
- Chromium in Playwright supports `document.startViewTransition`, so transitions really run there. Named chrome is briefly unclickable mid-transition, and Playwright's actionability wait absorbs that.

- [ ] **Step 18: Commit**

```bash
git add lib/nav/nav-depth.ts components/nav/page-transition.tsx components/nav/nav-pending-hint.tsx components/ui/page.tsx \
  components/app-nav/app-nav.tsx app/globals.css "app/(app)/layout.tsx" \
  components/ui/back-link.tsx components/markets/market-card.tsx components/leaderboard/leaderboard-row.tsx \
  components/home/home-tiles.tsx components/feed/feed-item.tsx components/markets/bet-list.tsx components/admin/ledger-row.tsx \
  components/parlays/slip-pick.tsx components/parlays/placed-parlay.tsx \
  "app/(app)/markets/page.tsx" "app/(app)/admin/tasks/pending-approvals.tsx" "app/(app)/admin/members/adjust-balance-form.tsx" \
  "app/(app)/(home)/page.tsx" "app/(app)/parlays/page.tsx" "app/(app)/tasks/page.tsx" "app/(app)/feed/page.tsx" \
  "app/(app)/leaderboard/page.tsx" "app/(app)/markets/[id]/page.tsx" "app/(app)/markets/new/page.tsx" \
  "app/(app)/members/[id]/page.tsx" "app/(app)/admin/layout.tsx" \
  components/app-shell/status-band.tsx \
  tests/lib/nav/nav-depth.test.tsx tests/components/page-transition.test.tsx tests/components/skeleton.test.tsx \
  tests/components/transition-links.test.tsx tests/components/nav-pending-hint.test.tsx tests/components/app-nav.test.tsx
git commit -m "Animate navigations with view transitions, and count in-app navigation depth"
```

---

## Task 6: The iOS-style back-swipe

Installed to an iPhone home screen, DwellDuel has no browser back gesture, so drilled-into pages get their own:
- **Start and drag.** A touch that starts within 20px of the left edge and moves sideways drags the page content, not the chrome, with the finger. A dimmed backdrop sits behind the content and lightens as the page moves.
- **Complete.** On release, the swipe completes if the drag passed a third of the width, or if it ended in a rightward flick faster than 0.5 px/ms. The page slides the rest of the way off, then navigates:
  - With in-app history (`useNavDepth() > 0`), it calls `router.back()`.
  - Otherwise, as after a deep link or a home-screen launch, it calls `router.push(logicalParent(pathname), { transitionTypes: ['nav-back'] })`.
- **Cancel.** Anything short of that springs back.
- **Never starts** on a vertical drag, inside an open drawer or dialog, or from a mouse. Under reduced motion it doesn't move the page, but still navigates.

The maths lives in pure functions, and the gesture wraps every drilled-into page through Task 5's `<Page transition="drill-down">`. That covers:
- market detail
- Create market
- a member profile
- the admin layout, so every admin section

**Files:**
- Create: `lib/nav/back-swipe.ts`
- Create: `tests/lib/nav/back-swipe.test.ts`
- Create: `components/nav/back-swipe.tsx`
- Create: `tests/components/back-swipe.test.tsx`
- Modify: `components/ui/page.tsx` (the `'drill-down'` branch)
- Modify: `tests/components/page-transition.test.tsx` (the drill-down case, plus a router mock)
- Create: `e2e/back-swipe.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 5: `useNavDepth()` (`lib/nav/nav-depth.ts`), and `DrillDownTransition` plus `Page`'s `transition` prop.
  - From Task 4: the shared `react` mock `tests/components/view-transition-mock.ts`.
  - `useRouter()` from `next/navigation`. `router.push(href, { transitionTypes })` is documented in `04-functions/use-router.md` and implemented in `next/dist/client/components/app-router-instance.js`, which calls `React.addTransitionType` inside the navigation transition. `router.back()` is `window.history.back()`.
  - The `bg-scrim`, `bg-bg` and `shadow-overlay` tokens.
- Produces:
  - `lib/nav/back-swipe.ts` (pure):
    - `type BackSwipeInput = { dx; dy; width; velocity }`
    - `backSwipeDecision(input): 'complete' | 'cancel' | 'ignore'`
    - `logicalParent(pathname): string`
    - the constants `BACK_SWIPE_EDGE` (20) and `BACK_SWIPE_SLOP` (8)
  - `components/nav/back-swipe.tsx` (`'use client'`): `BackSwipe({ children })`.
  - The DOM contract is two siblings inside a surface `<div>` (`flex flex-1 flex-col touch-pan-y touch-pinch-zoom overflow-x-clip`):
    - the backdrop (`aria-hidden`, fixed, `bg-scrim`, shown only with `data-swiping`)
    - the content wrapper, which carries `data-swiping` and an inline `transform` only mid-gesture
  - `[data-swiping]` is what the e2e spec, and Task 11's mid-drag screenshot, look for.

**Behaviour.**
- **`backSwipeDecision`:**
  - `'ignore'` when `|dy| > |dx|`. An exact diagonal counts as horizontal.
  - `'complete'` when `dx > 0` and either `dx >= width / 3` or `velocity > 0.5`.
  - Otherwise `'cancel'`.
  - The `dx > 0` guard is the one addition to the spec's rule. Without it, a flick back towards the edge would complete.
- **Direction lock.**
  - Until the finger has moved 8px, nothing is decided and nothing is prevented, so the browser can still start a vertical scroll.
  - At 8px, the component calls `backSwipeDecision` with zero velocity. On `'ignore'`, or on a leftward move, it lets go of the touch for good, and the page scrolls natively.
  - Otherwise it takes the touch. It calls `preventDefault()` on every later `touchmove`, so the page can't scroll under the finger.
- **Velocity.**
  - Velocity is the average over the last 100ms of moves.
  - A finger that held still for more than 100ms before lifting has none, so only distance decides. The e2e spec relies on that to be deterministic.
- **Logical parents:**
  - `/markets/<id>` and `/markets/new` → `/markets`
  - `/members/<id>` → `/leaderboard`
  - `/admin/*` and anything else → `/`
- **Motion.**
  - While dragging:
    - `translate3d(dx, 0, 0)` on the content wrapper
    - the content lifted to `z-[21]` with `bg-bg` and `shadow-overlay`, above a fixed `z-20` `bg-scrim` backdrop whose opacity is `1 − dx/width`
  - The top bar, tab bar and status band (`z-30`) stay above both.
  - Release settles over 280ms on the same curve the slip drawer uses. The content goes to `x = 0` (spring back) or `x = width` (complete, then navigate).
  - The transform is cleared completely at rest. A transformed ancestor would otherwise capture the market page's fixed "Slip (n)" button.
- **Which navigations animate.**
  - `router.push` with `nav-back` runs Task 5's slide: the parent comes in from the left while the swiped page, already off-screen, fades out.
  - `router.back()` has no view transition. React commits a popstate traversal synchronously (`shouldAttemptEagerTransition` in react-dom), and it never starts one; this was checked in Chromium: `ViewTransition`'s `onEnter`/`onExit` never fire on a back traversal, typed or not.
  - That's fine here: by the time `back()` runs, the page has already slid off under the finger.
- **Safety nets.**
  - If the page is still mounted 4s after completing, for example a push waiting offline, it springs itself back.
  - A back-forward-cache restore (`pageshow` with `persisted`) resets it.
  - A second finger, or the system cancelling the touch (`touchcancel`, e.g. Safari's own edge gesture in a browser tab), springs it back.

**Touch handling on iOS Safari.**
- **Listeners** go on `document`, so a swipe starting over the top bar or tab bar counts too.
  - `touchstart`, `touchend` and `touchcancel` are passive. They never cancel anything.
  - `touchmove` is non-passive and registered for the component's lifetime. WebKit isn't documented to honour a non-passive listener added mid-gesture. Chromium does, which was checked. The listener returns at once unless the touch began at the edge, so ordinary scrolling pays one function call per move.
- **`touch-action: pan-y pinch-zoom` on the surface.**
  - The browser never starts a horizontal pan inside a drilled page's content, so a sideways drag reaches the listener uncancelled. There's also no horizontal rubber-banding.
  - Vertical scrolling and pinch-zoom stay native.
  - No drilled page has a horizontal scroller (checked: no `overflow-x` scroll containers in `app/` or `components/`).
  - It also drops double-tap zoom, which Task 2's `touch-action: manipulation` already does for controls.
- **`overflow-x: clip` on the surface** keeps the translated content from widening the page's scrollable area. Without it, iOS would let the layout viewport pan sideways mid-drag. `clip` doesn't create a scroll container, so `sticky` and `fixed` descendants behave as before.
- **Dialogs.** The swipe never starts while any `[role="dialog"]` or `[role="alertdialog"]` is in the document. Base UI mounts the slip drawer and the void dialog only while they're open, or closing.

- [ ] **Step 1: Write the pure-function tests**

Create `tests/lib/nav/back-swipe.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BACK_SWIPE_EDGE, BACK_SWIPE_SLOP, backSwipeDecision, logicalParent } from '@/lib/nav/back-swipe'

const width = 375

describe('backSwipeDecision', () => {
  it('ignores a drag that is more vertical than horizontal, whatever its distance or speed', () => {
    expect(backSwipeDecision({ dx: 10, dy: 11, width, velocity: 0 })).toBe('ignore')
    expect(backSwipeDecision({ dx: 200, dy: -201, width, velocity: 2 })).toBe('ignore')
    expect(backSwipeDecision({ dx: -5, dy: 30, width, velocity: 0 })).toBe('ignore')
  })

  it('treats an exact diagonal as horizontal', () => {
    expect(backSwipeDecision({ dx: 40, dy: 40, width, velocity: 0 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 125, dy: -125, width, velocity: 0 })).toBe('complete')
  })

  it('completes once the drag reaches a third of the width', () => {
    expect(backSwipeDecision({ dx: 124.9, dy: 0, width, velocity: 0 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 125, dy: 0, width, velocity: 0 })).toBe('complete')
    expect(backSwipeDecision({ dx: 300, dy: 20, width, velocity: 0 })).toBe('complete')
  })

  it('scales the distance threshold with the width', () => {
    expect(backSwipeDecision({ dx: 200, dy: 0, width: 1024, velocity: 0 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 342, dy: 0, width: 1024, velocity: 0 })).toBe('complete')
  })

  it('completes a short drag that ends in a rightward flick faster than 0.5 px/ms', () => {
    expect(backSwipeDecision({ dx: 30, dy: 2, width, velocity: 0.5 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 30, dy: 2, width, velocity: 0.51 })).toBe('complete')
    expect(backSwipeDecision({ dx: 30, dy: 2, width, velocity: 3 })).toBe('complete')
  })

  it('cancels a short, slow drag, and a flick back towards the edge', () => {
    expect(backSwipeDecision({ dx: 60, dy: 5, width, velocity: 0.2 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 60, dy: 5, width, velocity: -1 })).toBe('cancel')
  })

  it('never completes a drag that ends left of where it started', () => {
    expect(backSwipeDecision({ dx: -40, dy: 0, width, velocity: 1 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 0, dy: 0, width, velocity: 1 })).toBe('cancel')
  })

  it('cancels when the finger has not moved', () => {
    expect(backSwipeDecision({ dx: 0, dy: 0, width, velocity: 0 })).toBe('cancel')
  })

  it('keeps the edge zone and direction slop small', () => {
    expect(BACK_SWIPE_EDGE).toBe(20)
    expect(BACK_SWIPE_SLOP).toBeLessThan(10)
  })
})

describe('logicalParent', () => {
  it.each([
    ['/markets/3f2a0c1e-8d8b-4c43-9f0f-0a7c5b1d2e3f', '/markets'],
    ['/markets/new', '/markets'],
    ['/members/3f2a0c1e-8d8b-4c43-9f0f-0a7c5b1d2e3f', '/leaderboard'],
    ['/admin/invites', '/'],
    ['/admin/tasks', '/'],
    ['/admin/members', '/'],
    ['/admin/ledger', '/'],
    ['/markets', '/'],
    ['/leaderboard', '/'],
    ['/members', '/'],
    ['/parlays', '/'],
    ['/', '/'],
    ['', '/'],
  ])('%s goes up to %s', (pathname, parent) => {
    expect(logicalParent(pathname)).toBe(parent)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/nav/back-swipe.test.ts`
Expected: FAIL. The module `@/lib/nav/back-swipe` doesn't exist.

- [ ] **Step 3: Write `lib/nav/back-swipe.ts`**

```ts
export type BackSwipeInput = { dx: number; dy: number; width: number; velocity: number }

// A swipe has to start this close to the left edge.
export const BACK_SWIPE_EDGE = 20
// Movement below this doesn't yet say whether the finger is going sideways or scrolling.
export const BACK_SWIPE_SLOP = 8

const FLICK_VELOCITY = 0.5

export function backSwipeDecision({ dx, dy, width, velocity }: BackSwipeInput): 'complete' | 'cancel' | 'ignore' {
  if (Math.abs(dy) > Math.abs(dx)) return 'ignore'
  if (dx > 0 && (dx >= width / 3 || velocity > FLICK_VELOCITY)) return 'complete'
  return 'cancel'
}

export function logicalParent(pathname: string): string {
  const [first, second] = pathname.split('/').filter(Boolean)
  if (first === 'markets' && second) return '/markets'
  if (first === 'members' && second) return '/leaderboard'
  return '/'
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/lib/nav/back-swipe.test.ts`
Expected: PASS (22 tests)

- [ ] **Step 5: Write the component test**

Create `tests/components/back-swipe.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { back, push } = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }))
let pathname = '/markets/new'
let depth = 0
vi.mock('next/navigation', () => ({ useRouter: () => ({ back, push }), usePathname: () => pathname }))
vi.mock('@/lib/nav/nav-depth', () => ({ useNavDepth: () => depth }))

import { BackSwipe } from '@/components/nav/back-swipe'

let reduceMotion = false

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  back.mockReset()
  push.mockReset()
  pathname = '/markets/new'
  depth = 0
  reduceMotion = false
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' && reduceMotion,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

afterEach(() => {
  vi.useRealTimers()
})

// jsdom's TouchEvent takes plain objects for its touch lists; timeStamp is pinned so the
// release velocity is exact.
function touch(target: Element, type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', x: number, y: number, t: number) {
  const point = { identifier: 1, target, clientX: x, clientY: y }
  const ending = type === 'touchend' || type === 'touchcancel'
  const event = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: ending ? [] : [point as unknown as Touch],
    changedTouches: [point as unknown as Touch],
  })
  Object.defineProperty(event, 'timeStamp', { value: t })
  target.dispatchEvent(event)
  return event
}

// Moves in 10 steps of 20ms, then lifts after `holdMs`.
function drag(target: Element, from: [number, number], to: [number, number], holdMs = 0) {
  touch(target, 'touchstart', from[0], from[1], 1000)
  const moves: TouchEvent[] = []
  for (let step = 1; step <= 10; step++) {
    const x = from[0] + ((to[0] - from[0]) * step) / 10
    const y = from[1] + ((to[1] - from[1]) * step) / 10
    moves.push(touch(target, 'touchmove', x, y, 1000 + step * 20))
  }
  touch(target, 'touchend', to[0], to[1], 1200 + holdMs)
  return moves
}

function setup() {
  const { unmount } = render(
    <BackSwipe>
      <h1>Create market</h1>
    </BackSwipe>,
  )
  const heading = screen.getByRole('heading', { name: 'Create market' })
  const content = heading.parentElement!
  const backdrop = content.previousElementSibling as HTMLElement
  return { heading, content, backdrop, unmount }
}

describe('BackSwipe', () => {
  it('renders its children in a pan-y surface that clips sideways overflow, with a hidden backdrop', () => {
    const { content, backdrop } = setup()
    expect(content.parentElement).toHaveClass('touch-pan-y', 'touch-pinch-zoom', 'overflow-x-clip', 'flex-1')
    expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    expect(backdrop).toHaveClass('hidden', 'bg-scrim', 'data-swiping:block')
    expect(content.style.transform).toBe('')
  })

  it('moves the page with the finger over the dimmed backdrop, and stops the page scrolling', () => {
    const { heading, content, backdrop } = setup()
    touch(heading, 'touchstart', 10, 400, 1000)
    const first = touch(heading, 'touchmove', 40, 402, 1020)
    const second = touch(heading, 'touchmove', 160, 405, 1040)

    expect(first.defaultPrevented).toBe(true)
    expect(second.defaultPrevented).toBe(true)
    expect(content).toHaveAttribute('data-swiping')
    expect(backdrop).toHaveAttribute('data-swiping')
    expect(content.style.transform).toBe('translate3d(150px, 0, 0)')
    expect(Number(backdrop.style.opacity)).toBeCloseTo(1 - 150 / 375)
  })

  it('goes to the logical parent with nav-back when there is no in-app history', () => {
    const { heading, content } = setup()
    drag(heading, [5, 400], [200, 410], 200)

    expect(content.style.transform).toBe('translate3d(375px, 0, 0)')
    expect(push).not.toHaveBeenCalled()
    vi.advanceTimersByTime(280)
    expect(push).toHaveBeenCalledWith('/markets', { transitionTypes: ['nav-back'] })
    expect(back).not.toHaveBeenCalled()
  })

  it('goes back through history when the app has some', () => {
    depth = 2
    pathname = '/members/3f2a'
    const { heading } = setup()
    drag(heading, [5, 400], [200, 400], 200)
    vi.advanceTimersByTime(280)

    expect(back).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('springs back from a short, slow drag', () => {
    const { heading, content, backdrop } = setup()
    drag(heading, [5, 400], [80, 400], 200)

    expect(content.style.transform).toBe('translate3d(0px, 0, 0)')
    vi.advanceTimersByTime(280)
    expect(content.style.transform).toBe('')
    expect(content).not.toHaveAttribute('data-swiping')
    expect(backdrop).not.toHaveAttribute('data-swiping')
    expect(push).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('completes a short drag that ends in a flick', () => {
    const { heading } = setup()
    // 115px, short of a third of 375, but the last 100ms ran at 0.575 px/ms and the finger lifted at once.
    drag(heading, [5, 400], [120, 400], 0)
    vi.advanceTimersByTime(280)
    expect(push).toHaveBeenCalledWith('/markets', { transitionTypes: ['nav-back'] })
  })

  it('leaves a vertical drag from the edge to the page scroll', () => {
    const { heading, content } = setup()
    const moves = drag(heading, [5, 400], [30, 150], 0)
    vi.advanceTimersByTime(1000)

    expect(moves.every((move) => !move.defaultPrevented)).toBe(true)
    expect(content).not.toHaveAttribute('data-swiping')
    expect(content.style.transform).toBe('')
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores a touch that starts more than 20px from the edge', () => {
    const { heading, content } = setup()
    const moves = drag(heading, [21, 400], [300, 400], 0)
    vi.advanceTimersByTime(1000)

    expect(moves.every((move) => !move.defaultPrevented)).toBe(true)
    expect(content.style.transform).toBe('')
    expect(push).not.toHaveBeenCalled()
  })

  it('ignores a leftward drag and a second finger', () => {
    const { heading, content } = setup()
    drag(heading, [15, 400], [2, 400], 0)
    touch(heading, 'touchstart', 5, 400, 2000)
    touch(heading, 'touchmove', 60, 400, 2020)
    const pinch = new TouchEvent('touchmove', {
      bubbles: true,
      cancelable: true,
      touches: [{ clientX: 60, clientY: 400 }, { clientX: 200, clientY: 300 }] as unknown as Touch[],
    })
    heading.dispatchEvent(pinch)
    vi.advanceTimersByTime(1000)

    expect(content.style.transform).toBe('')
    expect(push).not.toHaveBeenCalled()
  })

  it('never starts while a drawer or dialog is open', () => {
    const { heading, content } = setup()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    try {
      drag(heading, [5, 400], [300, 400], 0)
      vi.advanceTimersByTime(1000)
      expect(content.style.transform).toBe('')
      expect(push).not.toHaveBeenCalled()
    } finally {
      dialog.remove()
    }
  })

  it('springs back when the system cancels the touch', () => {
    const { heading, content } = setup()
    touch(heading, 'touchstart', 5, 400, 1000)
    touch(heading, 'touchmove', 200, 400, 1100)
    touch(heading, 'touchcancel', 200, 400, 1120)
    vi.advanceTimersByTime(280)

    expect(content.style.transform).toBe('')
    expect(push).not.toHaveBeenCalled()
  })

  it('under reduced motion, never moves the page but still completes', () => {
    reduceMotion = true
    const { heading, content, backdrop } = setup()
    touch(heading, 'touchstart', 5, 400, 1000)
    touch(heading, 'touchmove', 200, 400, 1100)
    expect(content.style.transform).toBe('')
    expect(backdrop).not.toHaveAttribute('data-swiping')
    touch(heading, 'touchend', 200, 400, 1300)

    expect(push).toHaveBeenCalledWith('/markets', { transitionTypes: ['nav-back'] })
  })

  it('stops listening once unmounted', () => {
    const { heading, unmount } = setup()
    unmount()
    document.body.append(heading)
    drag(heading, [5, 400], [300, 400], 0)
    vi.advanceTimersByTime(1000)
    expect(push).not.toHaveBeenCalled()
    heading.remove()
  })
})
```

jsdom's `TouchEvent` accepts plain objects in its touch lists. Its `timeStamp` is epoch-based, so the test pins it per event. The component only ever subtracts one `timeStamp` from another, so the base doesn't matter.

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/components/back-swipe.test.tsx`
Expected: FAIL. `@/components/nav/back-swipe` doesn't exist.

- [ ] **Step 7: Write `components/nav/back-swipe.tsx`**

```tsx
'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useNavDepth } from '@/lib/nav/nav-depth'
import { BACK_SWIPE_EDGE, BACK_SWIPE_SLOP, backSwipeDecision, logicalParent } from '@/lib/nav/back-swipe'

const SETTLE_MS = 280
const SETTLE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
// Release velocity comes from the last 100ms of movement; a finger that stopped before lifting has none.
const VELOCITY_WINDOW_MS = 100
// If the navigation never unmounts this page (a failed or offline push), give the page back.
const STUCK_RESET_MS = 4000

type Sample = { x: number; t: number }

export function BackSwipe({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const depth = useNavDepth()
  const contentRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const latest = useRef({ router, pathname, depth })

  useEffect(() => {
    latest.current = { router, pathname, depth }
  }, [router, pathname, depth])

  useEffect(() => {
    const content = contentRef.current
    const backdrop = backdropRef.current
    if (!content || !backdrop) return

    let start: { x: number; y: number } | null = null
    let dragging = false
    let busy = false
    let reduceMotion = false
    let samples: Sample[] = []
    let timer: number | undefined

    function paint(dx: number) {
      content!.style.transform = `translate3d(${dx}px, 0, 0)`
      backdrop!.style.opacity = String(1 - Math.min(dx / window.innerWidth, 1))
    }

    function lift() {
      content!.dataset.swiping = ''
      backdrop!.dataset.swiping = ''
      content!.style.transition = 'none'
      backdrop!.style.transition = 'none'
    }

    function reset() {
      window.clearTimeout(timer)
      busy = false
      delete content!.dataset.swiping
      delete backdrop!.dataset.swiping
      content!.style.transform = ''
      content!.style.transition = ''
      backdrop!.style.opacity = ''
      backdrop!.style.transition = ''
    }

    function settle(toX: number, then: () => void) {
      busy = true
      content!.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASE}`
      backdrop!.style.transition = `opacity ${SETTLE_MS}ms ${SETTLE_EASE}`
      paint(toX)
      timer = window.setTimeout(then, SETTLE_MS)
    }

    function navigateBack() {
      const { router, pathname, depth } = latest.current
      // A history traversal commits synchronously inside popstate, so it never runs a view
      // transition; the page has already slid off under the finger by then.
      if (depth > 0) {
        router.back()
      } else {
        router.push(logicalParent(pathname), { transitionTypes: ['nav-back'] })
      }
    }

    function release(velocity: number, dx: number, dy: number) {
      const decision = backSwipeDecision({ dx, dy, width: window.innerWidth, velocity })
      if (decision !== 'complete') {
        if (reduceMotion) reset()
        else settle(0, reset)
        return
      }
      if (reduceMotion) {
        navigateBack()
        return
      }
      settle(window.innerWidth, () => {
        navigateBack()
        timer = window.setTimeout(reset, STUCK_RESET_MS)
      })
    }

    function stopTracking() {
      start = null
      dragging = false
      samples = []
    }

    function onTouchStart(event: TouchEvent) {
      if (start || busy || event.touches.length !== 1) return
      const touch = event.touches[0]
      if (touch.clientX > BACK_SWIPE_EDGE) return
      // Base UI only mounts a drawer or dialog popup while it's open.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      start = { x: touch.clientX, y: touch.clientY }
      samples = [{ x: touch.clientX, t: event.timeStamp }]
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }

    function onTouchMove(event: TouchEvent) {
      if (!start) return
      if (event.touches.length !== 1) {
        if (dragging) release(0, 0, 0)
        stopTracking()
        return
      }
      const touch = event.touches[0]
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      if (!dragging) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < BACK_SWIPE_SLOP) return
        if (dx <= 0 || backSwipeDecision({ dx, dy, width: window.innerWidth, velocity: 0 }) === 'ignore') {
          stopTracking()
          return
        }
        dragging = true
        if (!reduceMotion) lift()
      }
      // Once the swipe owns the touch, the page mustn't scroll under the finger.
      if (event.cancelable) event.preventDefault()
      samples.push({ x: touch.clientX, t: event.timeStamp })
      while (samples.length > 2 && samples[0].t < event.timeStamp - VELOCITY_WINDOW_MS) samples.shift()
      if (!reduceMotion) paint(Math.max(0, dx))
    }

    function onTouchEnd(event: TouchEvent) {
      if (!start) return
      if (!dragging) {
        stopTracking()
        return
      }
      const touch = event.changedTouches[0]
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      const first = samples[0]
      const last = samples[samples.length - 1]
      const fresh = event.timeStamp - last.t <= VELOCITY_WINDOW_MS
      const velocity = fresh && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0
      stopTracking()
      release(velocity, dx, dy)
    }

    function onTouchCancel() {
      if (!start) return
      const wasDragging = dragging
      stopTracking()
      if (wasDragging) release(0, 0, 0)
    }

    function onPageShow(event: PageTransitionEvent) {
      // A page restored from the back-forward cache comes back mid-swipe otherwise.
      if (event.persisted) reset()
    }

    // touchmove stays registered, non-passive, for the page's lifetime: a listener added mid-gesture
    // isn't promised cancelable moves on iOS. It returns at once unless a touch began at the edge.
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchCancel, { passive: true })
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
      window.removeEventListener('pageshow', onPageShow)
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <div className="flex flex-1 touch-pan-y touch-pinch-zoom flex-col overflow-x-clip">
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-20 hidden bg-scrim data-swiping:block"
      />
      <div
        ref={contentRef}
        className="flex flex-1 flex-col data-swiping:relative data-swiping:z-[21] data-swiping:bg-bg data-swiping:shadow-overlay"
      >
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run tests/components/back-swipe.test.tsx`
Expected: PASS (13 tests)

- [ ] **Step 9: Wire it into every drilled-into page**

In `components/ui/page.tsx`, replace

```tsx
import { DrillDownTransition, TabTransition } from '@/components/nav/page-transition'
```

with

```tsx
import { BackSwipe } from '@/components/nav/back-swipe'
import { DrillDownTransition, TabTransition } from '@/components/nav/page-transition'
```

and replace

```tsx
  if (transition === 'drill-down') return <DrillDownTransition>{page}</DrillDownTransition>
```

with

```tsx
  if (transition === 'drill-down') {
    return (
      <DrillDownTransition>
        <BackSwipe>{page}</BackSwipe>
      </DrillDownTransition>
    )
  }
```

- **The view transition names the surface.** `DrillDownTransition` stays outermost, so its view-transition name lands on `BackSwipe`'s surface `<div>`. After a completed swipe, the old snapshot is that surface, with the content already off-screen and the backdrop faded out, so the `nav-back` exit has nothing left to show.
- **Every drilled-into page gets the swipe with no page edits.** Task 5 already gave market detail, Create market, the member page and the admin layout `transition="drill-down"`.

Rewrite `tests/components/page-transition.test.tsx` in full. It adds the router mock `BackSwipe` needs, and the drill-down case now checks for the swipe surface:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { viewTransitionCalls as calls } from '@/tests/components/view-transition-mock'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }), usePathname: () => '/markets/new' }))

import { Page } from '@/components/ui/page'
import {
  ContentReveal,
  DrillDownTransition,
  SkeletonReveal,
  TabTransition,
} from '@/components/nav/page-transition'

beforeEach(() => {
  calls.length = 0
})

describe('route transitions', () => {
  it.each([
    ['DrillDownTransition', DrillDownTransition],
    ['TabTransition', TabTransition],
    ['SkeletonReveal', SkeletonReveal],
    ['ContentReveal', ContentReveal],
  ])('%s slides for nav-forward and nav-back, fades otherwise, and stays still on updates', (_name, Wrapper) => {
    render(
      <Wrapper>
        <p>Page content</p>
      </Wrapper>,
    )

    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(calls).toHaveLength(1)
    expect(calls[0].enter).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-enter' })
    expect(calls[0].exit).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-exit' })
    expect(calls[0].default).toBe('none')
    expect(calls[0].name).toBeUndefined()
    expect(calls[0].share).toBeUndefined()
  })

  it('leaves a plain Page without a transition', () => {
    const { container } = render(<Page>Body</Page>)
    expect(calls).toHaveLength(0)
    expect(container.firstElementChild).toBe(screen.getByText('Body'))
  })

  it('wraps a tab Page in the route transition and adds no DOM of its own', () => {
    const { container } = render(<Page transition="tab">Body</Page>)
    expect(calls).toHaveLength(1)
    expect(calls[0].default).toBe('none')
    expect(container.firstElementChild).toBe(screen.getByText('Body'))
  })

  it('wraps a drilled-into Page in the route transition around the back-swipe surface', () => {
    const { container } = render(<Page transition="drill-down">Body</Page>)
    expect(calls).toHaveLength(1)
    const surface = container.firstElementChild
    expect(surface).toHaveClass('touch-pan-y', 'overflow-x-clip')
    expect(surface).toContainElement(screen.getByText('Body'))
  })
})
```

- [ ] **Step 10: Run the unit tests**

Run: `npx vitest run tests/lib/nav tests/components/back-swipe.test.tsx tests/components/page-transition.test.tsx tests/components/screen-ui.test.tsx`
Expected: PASS

- [ ] **Step 11: Write `e2e/back-swipe.spec.ts`**

```typescript
import { test, expect, type Page } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

// Real touches through Chromium's input pipeline (CDP), so passive listeners, touch-action,
// cancelability and native scrolling behave as they do on a phone.
async function drag(page: Page, from: [number, number], to: [number, number], holdMs = 0) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] })
  for (let step = 1; step <= 10; step++) {
    const x = from[0] + ((to[0] - from[0]) * step) / 10
    const y = from[1] + ((to[1] - from[1]) * step) / 10
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    await page.waitForTimeout(16)
  }
  // Holding still before lifting leaves no release velocity, so only the distance decides.
  await page.waitForTimeout(holdMs)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('on a phone, an edge swipe goes back, and a short or vertical drag does not', async ({ page }) => {
  // A deep link has no in-app history, so the swipe goes to the page's logical parent.
  await page.goto('/markets/new')
  const form = page.getByRole('heading', { level: 1, name: 'Create market' })
  await expect(form).toBeVisible()

  await drag(page, [5, 400], [80, 400], 200)
  await expect(page.locator('[data-swiping]')).toHaveCount(0)
  await expect(page).toHaveURL(/\/markets\/new$/)

  await drag(page, [5, 600], [30, 300])
  await page.waitForTimeout(400)
  await expect(page.locator('[data-swiping]')).toHaveCount(0)
  await expect(page).toHaveURL(/\/markets\/new$/)

  await drag(page, [5, 400], [220, 410], 200)
  await expect(page).toHaveURL(/\/markets$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Markets' })).toBeVisible()

  // With in-app history the swipe is a real back, so forward returns to the form.
  await page.getByRole('link', { name: 'Create market', exact: true }).first().click()
  await expect(form).toBeVisible()
  await drag(page, [5, 400], [220, 410], 200)
  await expect(page).toHaveURL(/\/markets$/)
  await page.goForward()
  await expect(form).toBeVisible()
})
```

**How the spec works.**
- **Touches.** The drags go through CDP `Input.dispatchTouchEvent`, Chromium's real touch pipeline, so they exercise what synthetic `TouchEvent`s dispatched from `page.evaluate` wouldn't:
  - the passive and non-passive listeners
  - `touch-action`
  - `event.cancelable`
  - real native scrolling on the vertical drag
  - Playwright's `hasTouch: true` is what enables them. Both methods work in Playwright's Chromium, but only CDP proves the passive/`touch-action` setup: a synthetic event would pass even if that were wrong.
- **The two paths.**
  - The deep link covers `router.push(logicalParent)`: depth is 0 after `page.goto`.
  - The second swipe covers `router.back()`. Depth is 2 by then (the push to `/markets`, then Create market), and `goForward()` returning to the form proves history went back rather than pushing a new entry.
- **Why the waits.**
  - `[data-swiping]` reaching zero waits out the 280ms spring-back.
  - The vertical drag never sets `data-swiping`, so a fixed 400ms wait covers any stray settle before the URL check.
- **Locators.** `Create market` is both the h1 and the submit button on `/markets/new`, so the heading is matched by level. On `/markets` there are one or two "Create market" links (the header, plus the empty state when there are no markets), so `.first()` is used. No existing spec asserts a count of "Create market" links.

- [ ] **Step 12: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 22 passed, the 21 after Task 5 plus `back-swipe.spec.ts`.
- `slip-drawer.spec.ts` still passes. The "Slip (n)" trigger is `fixed` inside the swipe surface, and nothing transforms it at rest.
- `overflow-x: clip` doesn't clip `fixed` descendants whose containing block is the viewport.
- `app-nav.spec.ts`'s no-overflow check at 375px runs on Home, which has no swipe surface.

- [ ] **Step 13: Commit**

```bash
git add lib/nav/back-swipe.ts components/nav/back-swipe.tsx components/ui/page.tsx \
  tests/lib/nav/back-swipe.test.ts tests/components/back-swipe.test.tsx tests/components/page-transition.test.tsx \
  e2e/back-swipe.spec.ts
git commit -m "Swipe back from the left edge on drilled-into pages"
```

---

## Task 7: Optimistic slip and task updates

Three interactions stop waiting for the server:
- **Add to parlay / Remove** on a market page flip the row to "In your slip" (or back) the instant they're pressed.
- **Remove** on a slip pick (on `/parlays` and in the phone drawer) takes the pick out at once.
- **"I did this"** on `/tasks` shows "Pending review" at once.

The nav's slip badge follows every slip change straight away, through a small client context fed by the `(app)` layout. Money actions are untouched: bet, parlay, resolve, void and balance adjustments keep their pending buttons until the server answers.

This task also makes four existing e2e specs wait for the server before they navigate away. With the flip instant, `toBeVisible()` passes before the request has finished, and a `page.goto` straight after aborts it. This was reproduced in Chromium: navigating right after the optimistic flip left the slip cookie unwritten. No asserted string or count changes.

**Files:**
- Create: `components/app-nav/slip-count.tsx`
- Create: `components/markets/market-slip.tsx`
- Create: `components/markets/outcome-slip-control.tsx`
- Modify (rewrite): `components/ui/toast-action-form.tsx`
- Modify (rewrite): `components/markets/outcome-row.tsx`
- Modify: `app/(app)/markets/[id]/page.tsx` (the market's pick, `MarketSlipProvider` around the rows, `outcomeId` on each row)
- Modify: `components/parlays/slip-pick.tsx`
- Modify: `app/(app)/parlays/slip-form.tsx`
- Modify: `components/app-nav/app-nav.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `components/tasks/task-row.tsx`
- Modify (rewrite): `app/(app)/tasks/submit-button.tsx`
- Test, create: `tests/components/commit-history.tsx` (a test helper, not a test), `tests/components/slip-count.test.tsx`, `tests/components/outcome-slip-control.test.tsx`, `tests/components/task-submit-button.test.tsx`
- Test, modify (rewrite): `tests/components/toast-action-form.test.tsx`, `tests/components/slip-form.test.tsx`
- Test, modify: `tests/components/slip-pick.test.tsx`, `tests/components/outcome-row.test.tsx` (the new `outcomeId` prop)
- Test, modify: `tests/components/app-nav.test.tsx` (anchored: tasks 2 and 5 also add cases)
- E2E, create: `e2e/server-action.ts`, `e2e/optimistic-slip.spec.ts`
- E2E, modify: `e2e/parlays.spec.ts`, `e2e/slip-drawer.spec.ts`, `e2e/coin-economy.spec.ts`, `e2e/admin-controls.spec.ts`

**Interfaces:**
- Consumes:
  - React 19.2's `useOptimistic`. The optimistic value shows at once, and gives way to the real value when the transition it was set in ends.
  - `addToSlipAction` / `removeFromSlipAction` (`lib/parlays/slip-actions.ts`), unchanged. They return `true` when the slip changed and `false` on every no-op. They call `revalidatePath('/', 'layout')` on success.
  - `submitTaskCompletionAction` and `ActionState` (`lib/tasks/submit-task-completion.ts`), unchanged. A failure returns `{ formError }`; success calls `revalidatePath('/tasks')` and returns `undefined`.
  - `withSuccessToast` (`lib/toast/with-success-toast.ts`), `FormSubmitButton`, `StatusChip`, `Message`, `Button`.
  - `readSlip()` in `app/(app)/layout.tsx`, which already feeds the nav its count.
- Produces:
  - `components/app-nav/slip-count.tsx` (the fixed interface):
    ```ts
    export function SlipCountProvider({ initial, children }: { initial: number; children: ReactNode }): JSX.Element
    export function useSlipCount(): { count: number; adjust: (delta: number) => void }
    ```
    - `adjust` is a `useOptimistic` setter, so it must be called inside the action that changes the slip. The count never goes below 0.
    - Outside a provider, `useSlipCount()` returns `{ count: 0, adjust: () => {} }`. That's the context default, so the slip controls still render alone in unit tests.
  - `AppNav({ balance, isAdmin })`: the `slipCount` prop is gone, and the badges read `useSlipCount().count`. `AppNav` must render inside `SlipCountProvider`, which the `(app)` layout does.
  - `ToastActionForm` gains `optimistic?: () => void`. It runs first, inside the form's transition.
  - `MarketSlipProvider({ pick, children })` and `useMarketSlip(): { pick: string | null; choose(outcomeId: string | null): void } | null` in `components/markets/market-slip.tsx`. The provider holds the market's one pick (`useOptimistic`), and the market page wraps its outcome rows in it.
  - `OutcomeSlipControl({ outcomeId, label, state, addAction, removeAction, disabledReasonId? })` in `components/markets/`, where `state` is `'add' | 'inslip' | 'disabled'`. It is the outcome row's slip control, and the only client piece the row has. Inside a `MarketSlipProvider` it follows the market's pick; on its own it keeps its own.
  - `OutcomeRow` gains `outcomeId: string`, passed through to the control.
  - `SlipPick` gains `optimisticRemove?: () => void`.
  - `PendingReviewChip()` is exported from `components/tasks/task-row.tsx`. The row and the optimistic button share it.
  - `e2e/server-action.ts`: `serverActionSettled(page): Promise<Response>`, which resolves when the next server-action POST answers.

**How the optimistic state settles (no flicker).**
- A `useOptimistic` value applies while the transition it was set in is pending. The form's action runs in that transition.
- The server action's result and its refreshed server props arrive in one response. Next dispatches the router update inside `startTransition` when the action starts (`next/dist/client/app-call-server.js`), and resolves the action's promise in the same reducer step that returns the new router state (`server-action-reducer.js`).
- React entangles transitions started while an async action is pending. The optimistic value therefore reverts in the same commit that renders the new server props. The row goes "In your slip" (optimistic) → "In your slip" (server) with nothing in between.
- The Next.js guide says the same: "When the transition ends and fresh data arrives, the optimistic value reverts to the new server-rendered prop" (`node_modules/next/dist/docs/01-app/02-guides/interactive-apps.md`).
- Two tests pin this. The jsdom "no flash back" tests record every React commit through a `Profiler`, and fail if the server update isn't entangled; that was checked by making it deliberately un-entangled. The e2e spec watches the row with a `MutationObserver` while the held request is released.

**How failure settles.**
- A slip action that returns `false` makes no change and no revalidation. The transition ends, and the row, the pick or the count reverts to the unchanged server state. No toast fires, as today.
- A failed task submission returns `{ formError }`. The optimistic chip reverts in the same commit that shows the inline error, beside the restored "I did this" button.
- A thrown error still goes to the nearest error boundary, as it does today.

**Why a task never shows two "Pending review" chips.** `e2e/admin-controls.spec.ts` asserts `toHaveCount(2)` after two submissions.
- The optimistic chip is rendered by `SubmitButton`, in place of its form.
- `TaskRow` renders `SubmitButton` only while the task is `available`. Once the server has the submission, the row renders its own chip and drops `SubmitButton` in the same commit.
- So at any moment a row shows at most one chip. The jsdom test asserts exactly one in every commit.

**Replacing a pick.** A second pick from the same market replaces the first on the server. So the market's pick lives in one place, `MarketSlipProvider`, above every outcome row:
- Adding an outcome sets the market's pick to it. The replaced row reads the same pick, so it flips back to "Add to parlay" in the same commit as the new row flips to "In your slip". Two "In your slip" chips never show for one market; a jsdom test records every commit to prove it.
- The badge count only grows when the market had no pick, so a replacement leaves it unchanged.
- The server's answer settles both rows together.

**Focus.** Pressing "Add to parlay", "Remove" or "I did this" swaps the pressed button for other content, as the server's re-render already did before this task. Keyboard focus lands in the same place as before; it just happens sooner.

- [ ] **Step 1: Write the failing tests for the count, the row control and the form hook**

Create `tests/components/commit-history.tsx`, a test helper that records the page's text after every React commit:

```tsx
import { Profiler, type ReactNode } from 'react'

// Records the page's text after every React commit inside it, so a test can prove a state never
// reached the screen, not even for one commit between the optimistic state and the server's.
export function CommitHistory({ history, children }: { history: string[]; children: ReactNode }) {
  return (
    <Profiler id="commit-history" onRender={() => history.push(document.body.textContent ?? '')}>
      {children}
    </Profiler>
  )
}
```

Create `tests/components/slip-count.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { startTransition } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlipCountProvider, useSlipCount } from '@/components/app-nav/slip-count'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function Probe({ delta = 1, until = Promise.resolve() }: { delta?: number; until?: Promise<void> }) {
  const { count, adjust } = useSlipCount()
  return (
    <>
      <output aria-label="Slip count">{count}</output>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            adjust(delta)
            await until
          })
        }
      >
        Adjust
      </button>
    </>
  )
}

describe('SlipCountProvider', () => {
  it('shows the count it was given', () => {
    render(
      <SlipCountProvider initial={3}>
        <Probe />
      </SlipCountProvider>,
    )
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('3')
  })

  it('reads 0, with an adjust that does nothing, outside the signed-in layout', async () => {
    render(<Probe />)
    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('0')
  })

  it('shows an adjustment at once and drops it when the action settles', async () => {
    const gate = deferred()
    render(
      <SlipCountProvider initial={1}>
        <Probe delta={1} until={gate.promise} />
      </SlipCountProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('2')

    await act(async () => gate.resolve())
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('1')
  })

  it('never shows a negative count', async () => {
    const gate = deferred()
    render(
      <SlipCountProvider initial={1}>
        <Probe delta={-3} until={gate.promise} />
      </SlipCountProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('0')

    // React entangles every pending action, so one left hanging would hold later tests' optimistic state.
    await act(async () => gate.resolve())
  })
})
```

Create `tests/components/outcome-slip-control.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTransition, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlipCountProvider, useSlipCount } from '@/components/app-nav/slip-count'
import { MarketSlipProvider } from '@/components/markets/market-slip'
import { OutcomeSlipControl } from '@/components/markets/outcome-slip-control'
import { CommitHistory } from './commit-history'

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

beforeEach(() => {
  success.mockReset()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function Count() {
  return <output aria-label="Slip count">{`Badge ${useSlipCount().count}`}</output>
}

function countChips(text: string): number {
  return text.split('In your slip').length - 1
}

function renderControl(state: 'add' | 'inslip', { count = 0, result }: { count?: number; result: Promise<boolean> }) {
  const action = vi.fn(() => result)
  render(
    <SlipCountProvider initial={count}>
      <Count />
      <OutcomeSlipControl outcomeId="o1" label="Yes" state={state} addAction={action} removeAction={action} />
    </SlipCountProvider>,
  )
  return action
}

describe('OutcomeSlipControl', () => {
  it('flips to In your slip and bumps the nav count before the server answers', async () => {
    const answer = deferred<boolean>()
    const addAction = renderControl('add', { result: answer.promise })

    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay Yes' }))

    expect(addAction).toHaveBeenCalledWith(expect.any(FormData))
    expect(screen.getByText('In your slip')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Yes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to parlay Yes' })).toBeNull()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 1')
    expect(success).not.toHaveBeenCalled()

    await act(async () => answer.resolve(true))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Added to your slip.'))
  })

  it('flips back and restores the count when the server makes no change', async () => {
    const answer = deferred<boolean>()
    renderControl('add', { result: answer.promise })

    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay Yes' }))
    expect(screen.getByText('In your slip')).toBeInTheDocument()

    await act(async () => answer.resolve(false))

    expect(screen.getByRole('button', { name: 'Add to parlay Yes' })).toBeInTheDocument()
    expect(screen.queryByText('In your slip')).toBeNull()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 0')
    expect(success).not.toHaveBeenCalled()
  })

  it('keeps In your slip on screen while the server state lands, with no flash back to Add', async () => {
    const history: string[] = []
    const answer = deferred<void>()

    function Page() {
      const [slip, setSlip] = useState<string[]>([])
      async function addAction() {
        await answer.promise
        // Next applies the action's refreshed server props in a transition, like this one.
        startTransition(() => setSlip(['o1']))
        return true
      }
      return (
        <SlipCountProvider initial={slip.length}>
          <p>{`Server slip: ${slip.length}`}</p>
          <Count />
          <OutcomeSlipControl
            outcomeId="o1"
            label="Yes"
            state={slip.includes('o1') ? 'inslip' : 'add'}
            addAction={addAction}
            removeAction={vi.fn()}
          />
        </SlipCountProvider>
      )
    }

    render(
      <CommitHistory history={history}>
        <Page />
      </CommitHistory>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay Yes' }))
    expect(screen.getByText('Server slip: 0')).toBeInTheDocument()
    expect(screen.getByText('In your slip')).toBeInTheDocument()
    const flipped = history.length

    // Not inside act(): React commits the rest in separate tasks, as in a browser, so a
    // flash back to Add would get its own commit in the history.
    answer.resolve()
    await waitFor(() => expect(screen.getByText('Server slip: 1')).toBeInTheDocument())

    expect(screen.getAllByText('In your slip')).toHaveLength(1)
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 1')
    for (const text of history.slice(flipped - 1)) {
      expect(text).toContain('In your slip')
      expect(text).toContain('Badge 1')
      expect(text).not.toContain('Add to parlay')
    }
  })

  it('flips the market’s current pick off as the new one goes on, and leaves the count alone', async () => {
    const answer = deferred<boolean>()
    const action = vi.fn(() => answer.promise)
    render(
      <SlipCountProvider initial={2}>
        <Count />
        <MarketSlipProvider pick="o1">
          <OutcomeSlipControl outcomeId="o1" label="Yes" state="inslip" addAction={action} removeAction={action} />
          <OutcomeSlipControl outcomeId="o2" label="No" state="add" addAction={action} removeAction={action} />
        </MarketSlipProvider>
      </SlipCountProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay No' }))

    expect(screen.getAllByText('In your slip')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Remove No' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to parlay Yes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 2')
    // React entangles every pending action, so one left hanging would hold later tests' optimistic state.
    await act(async () => answer.resolve(true))
  })

  it('never shows two In your slip chips for one market while the replacement lands', async () => {
    const history: string[] = []
    const answer = deferred<void>()

    function Market() {
      const [pick, setPick] = useState('o1')
      async function addNo() {
        await answer.promise
        // Next applies the action's refreshed server props in a transition, like this one.
        startTransition(() => setPick('o2'))
        return true
      }
      return (
        <MarketSlipProvider pick={pick}>
          <p>{`Server pick: ${pick}`}</p>
          <OutcomeSlipControl
            outcomeId="o1"
            label="Yes"
            state={pick === 'o1' ? 'inslip' : 'add'}
            addAction={vi.fn()}
            removeAction={vi.fn()}
          />
          <OutcomeSlipControl
            outcomeId="o2"
            label="No"
            state={pick === 'o2' ? 'inslip' : 'add'}
            addAction={addNo}
            removeAction={vi.fn()}
          />
        </MarketSlipProvider>
      )
    }

    render(
      <CommitHistory history={history}>
        <Market />
      </CommitHistory>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay No' }))
    expect(screen.getByText('Server pick: o1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove No' })).toBeInTheDocument()

    // Not inside act(): React commits the rest in separate tasks, as in a browser.
    answer.resolve()
    await waitFor(() => expect(screen.getByText('Server pick: o2')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Remove No' })).toBeInTheDocument()
    expect(history.length).toBeGreaterThan(2)
    for (const text of history) expect(countChips(text)).toBe(1)
  })

  it('flips Remove back to Add and drops the count before the server answers, and reverts on false', async () => {
    const answer = deferred<boolean>()
    const removeAction = renderControl('inslip', { count: 1, result: answer.promise })

    await userEvent.click(screen.getByRole('button', { name: 'Remove Yes' }))

    expect(removeAction).toHaveBeenCalledWith(expect.any(FormData))
    expect(screen.getByRole('button', { name: 'Add to parlay Yes' })).toBeInTheDocument()
    expect(screen.queryByText('In your slip')).toBeNull()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 0')

    await act(async () => answer.resolve(false))

    expect(screen.getByText('In your slip')).toBeInTheDocument()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('Badge 1')
    expect(success).not.toHaveBeenCalled()
  })

  it('offers no form while the slip is full', () => {
    render(
      <OutcomeSlipControl
        outcomeId="o1"
        label="Yes"
        state="disabled"
        addAction={vi.fn()}
        removeAction={vi.fn()}
        disabledReasonId="slip-full-note"
      />,
    )
    const add = screen.getByRole('button', { name: 'Add to parlay Yes' })
    expect(add).toBeDisabled()
    expect(add).toHaveAttribute('aria-describedby', 'slip-full-note')
    expect(add.closest('form')).toBeNull()
  })
})
```

Two details in these tests matter:
- **Resolving from outside `act()`.** The "no flash back" test resolves the server's answer outside `act()`, then waits with `waitFor`, which turns React's act environment off. React then commits each update in its own task, as a browser would. Inside one `act()`, React would batch the revert and the new props into a single commit and hide a flash.
- **No action left hanging.** React entangles every pending async action. A test that leaves one pending holds every later test's optimistic state, so each test resolves its action before it ends.

Rewrite `tests/components/toast-action-form.test.tsx` in full. The four existing cases are unchanged, and the new case goes last:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useOptimistic, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastActionForm } from '@/components/ui/toast-action-form'

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

beforeEach(() => {
  success.mockReset()
})

describe('ToastActionForm', () => {
  it('calls the wrapped action and toasts once it resolves', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    render(
      <ToastActionForm action={action} successMessage="Added.">
        <button type="submit">Add</button>
      </ToastActionForm>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Added.'))
  })

  it('passes the submitted FormData to the action', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    render(
      <ToastActionForm action={action} successMessage="Added.">
        <input type="hidden" name="outcomeId" value="o1" />
        <button type="submit">Add</button>
      </ToastActionForm>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    const formData = action.mock.calls[0][0] as FormData
    expect(formData.get('outcomeId')).toBe('o1')
  })

  it('does not toast when the action resolves false', async () => {
    const action = vi.fn().mockResolvedValue(false)
    render(
      <ToastActionForm action={action} successMessage="Added.">
        <button type="submit">Add</button>
      </ToastActionForm>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(success).not.toHaveBeenCalled()
  })

  it('still toasts when the action’s success removes the form', async () => {
    function Row() {
      const [added, setAdded] = useState(false)
      if (added) return <p>In the slip</p>
      return (
        <ToastActionForm action={async () => setAdded(true)} successMessage="Added.">
          <button type="submit">Add</button>
        </ToastActionForm>
      )
    }

    render(<Row />)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('In the slip')).toBeInTheDocument()
    await waitFor(() => expect(success).toHaveBeenCalledWith('Added.'))
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('runs the optimistic update inside the action, so it shows until the action settles', async () => {
    let finish!: (value: boolean) => void
    const action = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)))
    function Row() {
      const [label, setLabel] = useOptimistic('Idle')
      return (
        <ToastActionForm action={action} successMessage="Added." optimistic={() => setLabel('Adding')}>
          <p>{label}</p>
          <button type="submit">Add</button>
        </ToastActionForm>
      )
    }

    render(<Row />)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('Adding')).toBeInTheDocument()
    expect(action).toHaveBeenCalledTimes(1)

    await act(async () => finish(false))
    expect(screen.getByText('Idle')).toBeInTheDocument()
    expect(success).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/components/slip-count.test.tsx tests/components/outcome-slip-control.test.tsx tests/components/toast-action-form.test.tsx`
Expected: FAIL.
- `slip-count.test.tsx` and `outcome-slip-control.test.tsx` fail to import `@/components/app-nav/slip-count`.
- `toast-action-form.test.tsx`: 1 failed ("runs the optimistic update…"), 4 passed.

- [ ] **Step 3: Write the count context, the form hook and the row control**

Create `components/app-nav/slip-count.tsx`:

```tsx
'use client'

import { createContext, useContext, useOptimistic, type ReactNode } from 'react'

type SlipCount = { count: number; adjust: (delta: number) => void }

// Outside the signed-in layout (unit tests of a lone slip control) there's no badge to move.
const SlipCountContext = createContext<SlipCount>({ count: 0, adjust: () => {} })

// `adjust` is a useOptimistic setter, so it must be called inside the action that changes the
// slip. The adjusted count shows at once and gives way to the layout's fresh `initial` in the
// same render that the action's server result lands in.
export function SlipCountProvider({ initial, children }: { initial: number; children: ReactNode }) {
  const [count, adjust] = useOptimistic(initial, (current: number, delta: number) => Math.max(0, current + delta))
  return <SlipCountContext value={{ count, adjust }}>{children}</SlipCountContext>
}

export function useSlipCount(): SlipCount {
  return useContext(SlipCountContext)
}
```

Rewrite `components/ui/toast-action-form.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import { toast } from 'sonner'

// Adds a success toast to a plain server action (the slip's add and remove) without making
// the presentational row that renders it a client component. The toast fires once the
// action resolves, so it still shows after the row re-renders without this form, as an
// added pick's row does when it turns into "In your slip". The action may return `false`
// for a no-op (e.g. the slip was already full, or the pick wasn't there to remove) — any
// other result, including plain `void`, still toasts.
//
// `optimistic` runs first, inside the form's transition, so the useOptimistic setters it
// calls show at once and give way to the server's state when the action settles.
export function ToastActionForm({
  action,
  successMessage,
  optimistic,
  className,
  children,
}: {
  action: (formData: FormData) => void | boolean | Promise<void | boolean>
  successMessage: string
  optimistic?: () => void
  className?: string
  children: ReactNode
}) {
  async function formAction(formData: FormData) {
    optimistic?.()
    const result = await action(formData)
    if (result !== false) toast.success(successMessage)
  }

  return (
    <form action={formAction} className={className}>
      {children}
    </form>
  )
}
```

Create `components/markets/market-slip.tsx`:

```tsx
'use client'

import { createContext, useContext, useOptimistic, type ReactNode } from 'react'

type MarketSlip = { pick: string | null; choose: (outcomeId: string | null) => void }

const MarketSlipContext = createContext<MarketSlip | null>(null)

// A market has at most one pick in the slip, and a new pick replaces the old one. Holding the
// pick here, above every outcome row, lets an add flip the replaced row off in the same commit
// that flips the new one on. `choose` is a useOptimistic setter, so it must be called inside the
// action that changes the slip; the server's `pick` takes over when that action settles.
export function MarketSlipProvider({ pick, children }: { pick: string | null; children: ReactNode }) {
  const [shown, choose] = useOptimistic(pick)
  return <MarketSlipContext value={{ pick: shown, choose }}>{children}</MarketSlipContext>
}

export function useMarketSlip(): MarketSlip | null {
  return useContext(MarketSlipContext)
}
```

Create `components/markets/outcome-slip-control.tsx`:

```tsx
'use client'

import { useOptimistic } from 'react'
import { Check, Plus } from 'lucide-react'
import { useSlipCount } from '@/components/app-nav/slip-count'
import { useMarketSlip } from '@/components/markets/market-slip'
import { Button } from '@/components/ui/button'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { StatusChip } from '@/components/ui/status-chip'
import { ToastActionForm } from '@/components/ui/toast-action-form'
import type { OutcomeRowState } from '@/lib/markets/row-state'

type SlipAction = (formData: FormData) => void | boolean | Promise<void | boolean>

// Add to parlay and Remove flip the row at once. Which row shows "In your slip" follows the
// market's one pick: on the market page MarketSlipProvider holds it for every row, so adding a
// pick flips the replaced row off in the same commit; a row rendered on its own keeps its own.
// The server's answer settles it: a `false` result (a no-op, e.g. the slip was full) leaves the
// server's state unchanged, so the rows flip back.
export function OutcomeSlipControl({
  outcomeId,
  label,
  state,
  addAction,
  removeAction,
  disabledReasonId,
}: {
  outcomeId: string
  label: string
  state: Exclude<OutcomeRowState, 'none'>
  addAction: SlipAction
  removeAction: SlipAction
  disabledReasonId?: string
}) {
  const [ownPick, setOwnPick] = useOptimistic<string | null>(state === 'inslip' ? outcomeId : null)
  const market = useMarketSlip()
  const pick = market ? market.pick : ownPick
  const choose = market ? market.choose : setOwnPick
  const { adjust } = useSlipCount()
  const shown = pick === outcomeId ? 'inslip' : state === 'inslip' ? 'add' : state
  const addLabel = (
    <>
      <Plus aria-hidden="true" className="size-[18px]" />
      Add to parlay <span className="sr-only">{label}</span>
    </>
  )

  if (shown === 'inslip') {
    return (
      <span className="flex items-center gap-2">
        <StatusChip tone="open">
          <Check aria-hidden="true" className="size-4" />
          In your slip
        </StatusChip>
        <ToastActionForm
          action={removeAction}
          successMessage="Removed from your slip."
          optimistic={() => {
            choose(null)
            adjust(-1)
          }}
        >
          <FormSubmitButton variant="quiet" size="sm">
            Remove <span className="sr-only">{label}</span>
          </FormSubmitButton>
        </ToastActionForm>
      </span>
    )
  }

  if (shown === 'add') {
    return (
      <ToastActionForm
        action={addAction}
        successMessage="Added to your slip."
        optimistic={() => {
          // A new pick replaces the market's current one, so the count only grows when there was none.
          if (pick === null) adjust(1)
          choose(outcomeId)
        }}
      >
        <FormSubmitButton variant="secondary" size="sm">
          {addLabel}
        </FormSubmitButton>
      </ToastActionForm>
    )
  }

  return (
    <Button variant="secondary" size="sm" disabled aria-describedby={disabledReasonId}>
      {addLabel}
    </Button>
  )
}
```

Rewrite `components/markets/outcome-row.tsx`. The chance, pool, bar and payout markup is unchanged; the slip actions move into `OutcomeSlipControl`:

```tsx
import { Trophy } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import { AnimatedText } from '@/components/ui/animated-text'
import { StatusChip } from '@/components/ui/status-chip'
import { OutcomeSlipControl } from '@/components/markets/outcome-slip-control'
import { SERIES_BG } from '@/components/markets/series-classes'
import type { Series } from '@/lib/markets/outcome-series'
import type { OutcomeRowState } from '@/lib/markets/row-state'
import { formatOdds } from '@/lib/parlays/odds'
import { cn } from '@/lib/utils'

// Re-exported for existing importers (e.g. this file's own test) -- the type lives in
// lib/markets/row-state.ts now, next to the pure function that produces its values.
export type { OutcomeRowState }

export function OutcomeRow({
  outcomeId,
  label,
  poolTotal,
  probability,
  oddsBp,
  series,
  state,
  winner = false,
  addAction,
  removeAction,
  disabledReasonId,
}: {
  outcomeId: string
  label: string
  poolTotal: number
  probability: number | null
  oddsBp: number | null
  series: Series
  state: OutcomeRowState
  winner?: boolean
  addAction: (formData: FormData) => void | boolean | Promise<void | boolean>
  removeAction: (formData: FormData) => void | boolean | Promise<void | boolean>
  disabledReasonId?: string
}) {
  const percent = (probability ?? 0) * 100

  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', SERIES_BG[series])} />
          <span className="min-w-0 text-[17px] font-extrabold wrap-break-word">{label}</span>
          {winner && (
            <StatusChip tone="done">
              <Trophy aria-hidden="true" className="size-4" />
              Winner
            </StatusChip>
          )}
        </span>
        <span className="shrink-0 font-extrabold tabular-nums">
          <AnimatedText plainText={`${Math.round(percent)}% (${poolTotal} DC)`}>
            <NumberFlow value={Math.round(percent)} locales="en-US" format={{ useGrouping: false }} suffix="% (" />
            <NumberFlow value={poolTotal} locales="en-US" format={{ useGrouping: false }} suffix=" DC)" />
          </AnimatedText>
        </span>
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-sunk">
        <span className={cn('block h-full rounded-full', SERIES_BG[series])} style={{ width: `${percent}%` }} />
      </div>
      {state !== 'none' && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-ink2">
            {oddsBp !== null && (
              <AnimatedText plainText={`${formatOdds(oddsBp)}× payout per DC`}>
                <NumberFlow
                  value={Number(formatOdds(oddsBp))}
                  locales="en-US"
                  format={{ minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }}
                  suffix="× payout per DC"
                />
              </AnimatedText>
            )}
          </span>
          <OutcomeSlipControl
            outcomeId={outcomeId}
            label={label}
            state={state}
            addAction={addAction}
            removeAction={removeAction}
            disabledReasonId={disabledReasonId}
          />
        </div>
      )}
    </div>
  )
}
```

In `tests/components/outcome-row.test.tsx`, pass the new prop. Replace:

```tsx
    <OutcomeRow
      label="Yes"
```

with:

```tsx
    <OutcomeRow
      outcomeId="o1"
      label="Yes"
```

and replace:

```tsx
            <OutcomeRow
              label={label}
```

with:

```tsx
            <OutcomeRow
              outcomeId={label}
              label={label}
```

In `app/(app)/markets/[id]/page.tsx`, make three edits.

(a) Replace:

```tsx
import { OutcomeRow } from '@/components/markets/outcome-row'
```

with:

```tsx
import { MarketSlipProvider } from '@/components/markets/market-slip'
import { OutcomeRow } from '@/components/markets/outcome-row'
```

(b) Name the market's current pick. Replace:

```tsx
  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
```

with:

```tsx
  const marketPick = market.outcomes.find((o) => slip.includes(o.id))?.id ?? null
  const marketInSlip = marketPick !== null
```

(c) Wrap the outcome rows in the provider, and give each row its id. Replace:

```tsx
          <ul className="flex flex-col divide-y divide-line">
            {odds.map((o, index) => (
              <li key={o.outcomeId}>
                <OutcomeRow
                  label={o.label}
```

with:

```tsx
          <MarketSlipProvider pick={marketPick}>
            <ul className="flex flex-col divide-y divide-line">
              {odds.map((o, index) => (
                <li key={o.outcomeId}>
                  <OutcomeRow
                    outcomeId={o.outcomeId}
                    label={o.label}
```

then re-indent the rest of the `OutcomeRow` props by two spaces, and replace the list's closing lines:

```tsx
                />
              </li>
            ))}
          </ul>
        </SectionCard>
```

with:

```tsx
                  />
                </li>
              ))}
            </ul>
          </MarketSlipProvider>
        </SectionCard>
```

After this edit the block reads:

```tsx
          <MarketSlipProvider pick={marketPick}>
            <ul className="flex flex-col divide-y divide-line">
              {odds.map((o, index) => (
                <li key={o.outcomeId}>
                  <OutcomeRow
                    outcomeId={o.outcomeId}
                    label={o.label}
                    poolTotal={o.poolTotal}
                    probability={o.impliedProbability}
                    oddsBp={legOddsBp(totalPool, o.poolTotal)}
                    series={outcomeSeries(market.kind, o.label, index)}
                    state={rowState(o.outcomeId, o.poolTotal, { slip, canBet, slipFull })}
                    winner={market.status === 'resolved' && o.label === market.resolvedOutcomeLabel}
                    addAction={addToSlipAction.bind(null, o.outcomeId)}
                    removeAction={removeFromSlipAction.bind(null, o.outcomeId)}
                    disabledReasonId={slipFull ? 'slip-full-note' : undefined}
                  />
                </li>
              ))}
            </ul>
          </MarketSlipProvider>
```

`MarketSlipProvider` renders no DOM of its own, so the list's markup and every e2e locator are unchanged.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/components/slip-count.test.tsx tests/components/outcome-slip-control.test.tsx tests/components/toast-action-form.test.tsx tests/components/outcome-row.test.tsx`
Expected: PASS (28 tests). `outcome-row.test.tsx`'s button names and states are the same; it only passes the new `outcomeId`.

- [ ] **Step 5: Write the failing tests for slip picks and the nav badge**

In `tests/components/slip-pick.test.tsx`, add this case at the end of the `describe` block:

```tsx
  it('runs the optimistic removal as the Remove button is pressed', async () => {
    const optimisticRemove = vi.fn()
    render(<SlipPick pick={live} removeAction={vi.fn()} optimisticRemove={optimisticRemove} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove No, Will it rain on the church picnic?' }))
    expect(optimisticRemove).toHaveBeenCalledTimes(1)
  })
```

Rewrite `tests/components/slip-form.test.tsx` in full. The existing cases are unchanged, and the new case goes last. It now mocks `sonner`, because the Remove form toasts, and it holds `removeFromSlipAction` so it can control it:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SlipPick as SlipPickView, SlipView } from '@/lib/parlays/get-slip'
import { combineOdds } from '@/lib/parlays/odds'

type NumberFlowProps = { value: number; suffix?: string; locales?: unknown; format?: { useGrouping?: boolean } }
const { numberFlowCalls } = vi.hoisted(() => ({ numberFlowCalls: [] as NumberFlowProps[] }))
vi.mock('@number-flow/react', () => ({
  default: (props: NumberFlowProps) => {
    numberFlowCalls.push(props)
    return `${props.value}${props.suffix ?? ''}`
  },
}))

const { placeParlayAction } = vi.hoisted(() => ({ placeParlayAction: vi.fn() }))
vi.mock('@/lib/parlays/place-parlay', () => ({ placeParlayAction }))
const { removeFromSlipAction } = vi.hoisted(() => ({ removeFromSlipAction: vi.fn() }))
vi.mock('@/lib/parlays/slip-actions', () => ({ removeFromSlipAction }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { SlipCountProvider, useSlipCount } from '@/components/app-nav/slip-count'
import { SlipForm } from '@/app/(app)/parlays/slip-form'

function Count() {
  return <output aria-label="Slip count">{useSlipCount().count}</output>
}

function pick(n: number, available = true): SlipPickView {
  return { outcomeId: `o${n}`, outcomeLabel: 'Yes', marketId: `m${n}`, marketTitle: `Market ${n}?`, oddsBp: 40_000, available }
}

function slipView(picks: SlipPickView[]): SlipView {
  const legBps = picks.flatMap((p) => (p.available && p.oddsBp !== null ? [p.oddsBp] : []))
  return { picks, legBps, ...combineOdds(legBps), canPlace: picks.length >= 2 && picks.every((p) => p.available) }
}

beforeEach(() => {
  placeParlayAction.mockReset()
  removeFromSlipAction.mockReset()
})

describe('SlipForm', () => {
  it('shows the empty state when the slip has no picks', () => {
    render(<SlipForm slip={slipView([])} />)
    const card = screen.getByRole('region', { name: 'Your slip' })
    expect(within(card).getByText('Empty')).toBeInTheDocument()
    expect(within(card).getByText('Your slip is empty.')).toBeInTheDocument()
    expect(within(card).getByText('Add picks from any open market.')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/markets')
    expect(screen.queryByRole('button', { name: 'Place parlay' })).toBeNull()
  })

  it('asks for another pick instead of offering a stake when there is only one', () => {
    render(<SlipForm slip={slipView([pick(1)])} />)
    expect(screen.getByText('1 pick · max 6')).toBeInTheDocument()
    expect(screen.getByText('Add at least one more pick to place a parlay.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse markets' })).toHaveAttribute('href', '/markets')
    expect(screen.queryByLabelText('Stake (DC)')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Place parlay' })).toBeNull()
  })

  it('shows the combined odds, and the payout once a stake is typed', async () => {
    render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
    expect(screen.getByText('2 picks · max 6')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Remove Yes, Market \d\?$/ })).toHaveLength(2)
    expect(screen.getByText('16.00×', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.queryByText(/Potential payout/)).toBeNull()
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    expect(screen.getByText(/Potential payout:/)).toHaveTextContent('Potential payout: 80 DC')
    expect(screen.getByRole('button', { name: 'Place parlay' })).toBeEnabled()
  })

  it('formats the combined odds and the payout as plain digits, in en-US regardless of the browser locale', async () => {
    numberFlowCalls.length = 0
    render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    expect(numberFlowCalls.length).toBeGreaterThanOrEqual(2)
    for (const call of numberFlowCalls) {
      expect(call.locales).toBe('en-US')
      expect(call.format?.useGrouping).toBe(false)
    }
  })

  it('notes a capped multiplier and caps the payout', async () => {
    render(<SlipForm slip={slipView([pick(1), pick(2), pick(3)])} />)
    expect(screen.getByText('20.00× (capped at 20×)', { selector: '.sr-only' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    expect(screen.getByText(/Potential payout:/)).toHaveTextContent('Potential payout: 100 DC')
  })

  it('blocks placing while a pick is no longer available, and says why', () => {
    render(<SlipForm slip={slipView([pick(1), pick(2, false)])} />)
    expect(screen.getByText('No longer available')).toBeInTheDocument()
    // The live pick's own odds are also 4.00×, so match the Combined line's text rather than a bare number.
    expect(screen.getByText(/^Combined:/)).toHaveTextContent('Combined: 4.00×')
    const button = screen.getByRole('button', { name: 'Place parlay' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('Remove the pick that’s no longer available to place this parlay.')
  })

  it('shows a server error and ties it to the stake field', async () => {
    placeParlayAction.mockResolvedValue({ formError: 'Insufficient balance — you have 3 DC. Try a smaller amount.' })
    render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
    const stake = screen.getByLabelText('Stake (DC)')
    expect(stake).toHaveAttribute('aria-invalid', 'false')
    await userEvent.type(stake, '5')
    await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Insufficient balance — you have 3 DC. Try a smaller amount.')
    expect(alert).toHaveAttribute('id', 'slip-error')
    expect(stake).toHaveAttribute('aria-invalid', 'true')
    expect(stake).toHaveAccessibleDescription('Insufficient balance — you have 3 DC. Try a smaller amount.')
    expect((placeParlayAction.mock.calls[0][1] as FormData).get('stake')).toBe('5')
  })

  it('keeps the success message after the placed slip empties', async () => {
    placeParlayAction.mockResolvedValue({ placed: { multiplierBp: 160_000, potentialPayout: 80 } })
    const { rerender } = render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Parlay placed at 16.00× — potential payout 80 DC.')

    rerender(<SlipForm slip={slipView([])} />)
    expect(screen.getByRole('status')).toHaveTextContent('Parlay placed at 16.00× — potential payout 80 DC.')
    expect(screen.getByText('Your slip is empty.')).toBeInTheDocument()
  })

  it('drops a removed pick and the nav count at once, and brings both back when nothing changed', async () => {
    let finish!: (value: boolean) => void
    removeFromSlipAction.mockImplementation(() => new Promise<boolean>((resolve) => (finish = resolve)))
    render(
      <SlipCountProvider initial={2}>
        <Count />
        <SlipForm slip={slipView([pick(1), pick(2)])} />
      </SlipCountProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove Yes, Market 1?' }))

    expect(removeFromSlipAction).toHaveBeenCalledWith('o1', expect.any(FormData))
    expect(screen.queryByRole('link', { name: 'Market 1?' })).toBeNull()
    expect(screen.getByText('1 pick · max 6')).toBeInTheDocument()
    expect(screen.getByText('Add at least one more pick to place a parlay.')).toBeInTheDocument()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('1')

    await act(async () => finish(false))

    expect(screen.getByRole('link', { name: 'Market 1?' })).toBeInTheDocument()
    expect(screen.getByText('2 picks · max 6')).toBeInTheDocument()
    expect(screen.getByLabelText('Slip count')).toHaveTextContent('2')
  })
})
```

Edit `tests/components/app-nav.test.tsx`. These edits are anchored rather than a rewrite, because Tasks 2 and 5 added cases to this file. `AppNav` loses its `slipCount` prop, so every case renders through a `Nav` helper that takes the old three props and wraps `AppNav` in `SlipCountProvider`.

(a) Turn every existing render into a `Nav` render, including cases Tasks 2 and 5 added. Run:

```bash
perl -pi -e 's/<AppNav balance=/<Nav balance=/g' tests/components/app-nav.test.tsx
```

Every existing `render(…)` / `rerender(…)` passes all three props, so `<Nav balance={…} slipCount={…} isAdmin… />` needs no other change. Run this before (b), which adds the one `<AppNav balance=` that must stay.

(b) Replace:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
```

with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTransition } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
```

and replace:

```tsx
import { AppNav } from '@/components/app-nav/app-nav'
```

with:

```tsx
import { AppNav } from '@/components/app-nav/app-nav'
import { SlipCountProvider, useSlipCount } from '@/components/app-nav/slip-count'

// The badge count comes from the layout's SlipCountProvider, so every case renders the nav inside one.
function Nav({ balance, slipCount, isAdmin }: { balance: number; slipCount: number; isAdmin: boolean }) {
  return (
    <SlipCountProvider initial={slipCount}>
      <AppNav balance={balance} isAdmin={isAdmin} />
    </SlipCountProvider>
  )
}
```

(c) Add this case as the last `it` inside `describe('AppNav', …)`. The refresh-on-visibility case stays for now; Task 8 removes it.

```tsx
  it('moves the slip badge with an optimistic change before the layout re-renders', async () => {
    let finish!: () => void
    const settled = new Promise<void>((resolve) => (finish = resolve))
    function AddPick() {
      const { adjust } = useSlipCount()
      return (
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              adjust(1)
              await settled
            })
          }
        >
          Add pick
        </button>
      )
    }
    render(
      <SlipCountProvider initial={1}>
        <AppNav balance={120} isAdmin={false} />
        <AddPick />
      </SlipCountProvider>,
    )
    expect(screen.getAllByRole('link', { name: 'Parlays (1)' })).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Add pick' }))
    expect(screen.getAllByRole('link', { name: 'Parlays (2)' })).toHaveLength(2)

    await act(async () => finish())
    expect(screen.getAllByRole('link', { name: 'Parlays (1)' })).toHaveLength(2)
  })
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run tests/components/slip-pick.test.tsx tests/components/slip-form.test.tsx tests/components/app-nav.test.tsx`
Expected: FAIL, with 6 failed and 24 passed.
- the new slip-pick case
- the new slip-form case
- four app-nav cases that need a count: "gives every nav link a hidden pending hint…" (Task 5's, which checks `Parlays (2)`), "names the Parlays link…", "gives the desktop parlays badge…" and "moves the slip badge…". `AppNav` still reads the old `slipCount` prop.

- [ ] **Step 7: Wire the picks, the slip form, the nav and the layout**

In `components/parlays/slip-pick.tsx`, replace:

```tsx
export function SlipPick({
  pick,
  removeAction,
}: {
  pick: SlipPickView
  removeAction: (formData: FormData) => void | boolean | Promise<void | boolean>
}) {
```

with:

```tsx
export function SlipPick({
  pick,
  removeAction,
  optimisticRemove,
}: {
  pick: SlipPickView
  removeAction: (formData: FormData) => void | boolean | Promise<void | boolean>
  optimisticRemove?: () => void
}) {
```

and replace:

```tsx
      <ToastActionForm action={removeAction} successMessage="Removed from your slip.">
```

with:

```tsx
      <ToastActionForm action={removeAction} successMessage="Removed from your slip." optimistic={optimisticRemove}>
```

In `app/(app)/parlays/slip-form.tsx`, make these three edits.

(a) Replace:

```tsx
import { useActionState, useState } from 'react'
```

with:

```tsx
import { useActionState, useOptimistic, useState } from 'react'
```

and replace:

```tsx
import { SlipPick } from '@/components/parlays/slip-pick'
```

with:

```tsx
import { useSlipCount } from '@/components/app-nav/slip-count'
import { SlipPick } from '@/components/parlays/slip-pick'
```

(b) Replace:

```tsx
  const { picks } = slip
```

with:

```tsx
  // A removed pick leaves at once. The combined odds and whether the slip can be placed stay the
  // server's until the removal lands, since only the server prices the remaining legs.
  const [picks, removePick] = useOptimistic(slip.picks, (current, outcomeId: string) =>
    current.filter((p) => p.outcomeId !== outcomeId),
  )
  const { adjust } = useSlipCount()
```

(c) Replace:

```tsx
                  <SlipPick pick={pick} removeAction={removeFromSlipAction.bind(null, pick.outcomeId)} />
```

with:

```tsx
                  <SlipPick
                    pick={pick}
                    removeAction={removeFromSlipAction.bind(null, pick.outcomeId)}
                    optimisticRemove={() => {
                      removePick(pick.outcomeId)
                      adjust(-1)
                    }}
                  />
```

Everything below that reads `picks` (the count label, the empty state, the one-pick hint, `hasStalePick`) now follows the optimistic list.

In `components/app-nav/app-nav.tsx`, replace:

```tsx
import { ADMIN_HREF, NAV_ITEMS, activeNavId, type NavId } from './nav-items'
```

with:

```tsx
import { ADMIN_HREF, NAV_ITEMS, activeNavId, type NavId } from './nav-items'
import { useSlipCount } from './slip-count'
```

and replace:

```tsx
export function AppNav({ balance, slipCount, isAdmin }: { balance: number; slipCount: number; isAdmin: boolean }) {
  const active = activeNavId(usePathname())
```

with:

```tsx
export function AppNav({ balance, isAdmin }: { balance: number; isAdmin: boolean }) {
  const active = activeNavId(usePathname())
  const { count: slipCount } = useSlipCount()
```

The rest of `AppNav` keeps reading `slipCount` as before; only the signature and the new `useSlipCount` line change.

In `app/(app)/layout.tsx`, replace:

```tsx
import { AppNav } from '@/components/app-nav/app-nav'
```

with:

```tsx
import { AppNav } from '@/components/app-nav/app-nav'
import { SlipCountProvider } from '@/components/app-nav/slip-count'
```

Then make `SlipCountProvider` the outermost element of the signed-in return, so the nav and the page share it, and drop `slipCount` from `AppNav`. Replace:

```tsx
  return (
    <>
      <NavDepthTracker />
      <AppNav balance={profile.balance} slipCount={slip.length} isAdmin={admin} />
      <main id="main" className="flex flex-1 flex-col pb-[calc(82px+var(--safe-bottom))] md:pb-0">
        {children}
      </main>
      <Toaster />
    </>
  )
```

with:

```tsx
  return (
    <SlipCountProvider initial={slip.length}>
      <NavDepthTracker />
      <AppNav balance={profile.balance} isAdmin={admin} />
      <main id="main" className="flex flex-1 flex-col pb-[calc(82px+var(--safe-bottom))] md:pb-0">
        {children}
      </main>
      <Toaster />
    </SlipCountProvider>
  )
```

- [ ] **Step 8: Run them to verify they pass**

Run: `npx vitest run tests/components/slip-pick.test.tsx tests/components/slip-form.test.tsx tests/components/app-nav.test.tsx tests/components/slip-drawer.test.tsx`
Expected: PASS (39 tests). `slip-drawer.test.tsx` passes unchanged; its remove case rerenders with the server's new slip, as before.

- [ ] **Step 9: Write the failing test for "I did this"**

Create `tests/components/task-submit-button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTransition, useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskRow } from '@/components/tasks/task-row'
import { CommitHistory } from './commit-history'

const { submitTaskCompletionAction } = vi.hoisted(() => ({ submitTaskCompletionAction: vi.fn() }))
vi.mock('@/lib/tasks/submit-task-completion', () => ({ submitTaskCompletionAction }))

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success } }))

import { SubmitButton } from '@/app/(app)/tasks/submit-button'

beforeEach(() => {
  submitTaskCompletionAction.mockReset()
  success.mockReset()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function countPendingChips(text: string): number {
  return text.split('Pending review').length - 1
}

describe('SubmitButton (tasks)', () => {
  it('shows Pending review the moment it is pressed, before the server answers', async () => {
    const answer = deferred<undefined>()
    submitTaskCompletionAction.mockReturnValue(answer.promise)
    render(<SubmitButton taskId="t1" />)

    await userEvent.click(screen.getByRole('button', { name: 'I did this' }))

    expect(submitTaskCompletionAction).toHaveBeenCalledWith('t1', undefined, expect.any(FormData))
    expect(screen.getByText('Pending review')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I did this' })).toBeNull()
    expect(success).not.toHaveBeenCalled()

    await act(async () => answer.resolve(undefined))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Submitted for review.'))
  })

  it('puts the button back, with the error, when the submission fails', async () => {
    const answer = deferred<{ formError: string }>()
    submitTaskCompletionAction.mockReturnValue(answer.promise)
    render(<SubmitButton taskId="t1" />)

    await userEvent.click(screen.getByRole('button', { name: 'I did this' }))
    expect(screen.getByText('Pending review')).toBeInTheDocument()

    await act(async () => answer.resolve({ formError: 'Already submitted this period.' }))

    expect(screen.queryByText('Pending review')).toBeNull()
    const button = screen.getByRole('button', { name: 'I did this' })
    expect(screen.getByRole('alert')).toHaveTextContent('Already submitted this period.')
    expect(button).toHaveAttribute('aria-describedby', 'submit-error-t1')
    expect(button).toHaveAccessibleDescription('Already submitted this period.')
    expect(success).not.toHaveBeenCalled()
  })

  it('never shows two Pending review chips for one task while the server state lands', async () => {
    const history: string[] = []
    const answer = deferred<void>()

    function TasksPage() {
      const [pending, setPending] = useState(false)
      submitTaskCompletionAction.mockImplementation(async () => {
        await answer.promise
        // Next applies the action's refreshed server props in a transition, like this one.
        startTransition(() => setPending(true))
        return undefined
      })
      return (
        <ul>
          <TaskRow
            title="Read Psalm 23"
            rewardAmount={5}
            description={`Server says ${pending ? 'pending' : 'available'}`}
            state={pending ? { kind: 'pending' } : { kind: 'available' }}
            action={<SubmitButton taskId="t1" />}
          />
        </ul>
      )
    }

    render(
      <CommitHistory history={history}>
        <TasksPage />
      </CommitHistory>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'I did this' }))
    expect(screen.getByText('Server says available')).toBeInTheDocument()
    expect(screen.getAllByText('Pending review')).toHaveLength(1)

    // Not inside act(): React commits the rest in separate tasks, as in a browser.
    answer.resolve()
    await waitFor(() => expect(screen.getByText('Server says pending')).toBeInTheDocument())

    expect(screen.getAllByText('Pending review')).toHaveLength(1)
    expect(success).toHaveBeenCalledWith('Submitted for review.')
    expect(history.length).toBeGreaterThan(1)
    for (const text of history.slice(1)) expect(countPendingChips(text)).toBe(1)
  })
})
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run tests/components/task-submit-button.test.tsx`
Expected: FAIL (3 failed). "Pending review" doesn't appear until the server answers.

- [ ] **Step 11: Share the chip and make the button optimistic**

In `components/tasks/task-row.tsx`, replace:

```tsx
export type TaskRowState
```

with:

```tsx
export function PendingReviewChip() {
  return (
    <StatusChip tone="wait">
      <Clock aria-hidden="true" className="size-4" />
      Pending review
    </StatusChip>
  )
}

export type TaskRowState
```

and replace:

```tsx
        {state.kind === 'pending' && (
          <StatusChip tone="wait">
            <Clock aria-hidden="true" className="size-4" />
            Pending review
          </StatusChip>
        )}
```

with:

```tsx
        {state.kind === 'pending' && <PendingReviewChip />}
```

Rewrite `app/(app)/tasks/submit-button.tsx`:

```tsx
'use client'

import { useActionState, useOptimistic } from 'react'
import { PendingReviewChip } from '@/components/tasks/task-row'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { submitTaskCompletionAction, type ActionState } from '@/lib/tasks/submit-task-completion'

export function SubmitButton({ taskId }: { taskId: string }) {
  const [submitting, setSubmitting] = useOptimistic(false)
  const [state, formAction] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        setSubmitting(true)
        return submitTaskCompletionAction(taskId, prev, formData)
      },
      (s) => Boolean(s?.formError),
      'Submitted for review.',
    ),
    undefined,
  )
  const errorId = `submit-error-${taskId}`

  // TaskRow renders this button only while the task is available. Once the server has the
  // submission, the row shows its own chip and drops this component in the same render that
  // ends `submitting`, so a task never shows two "Pending review" chips.
  if (submitting) return <PendingReviewChip />

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <FormSubmitButton size="sm" aria-describedby={state?.formError ? errorId : undefined}>
        I did this
      </FormSubmitButton>
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
    </form>
  )
}
```

`setSubmitting` runs inside the `useActionState` action. React runs that action in the form's transition, so the setter needs no `startTransition` of its own. The test run shows no "optimistic state update occurred outside a transition" warning.

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npx vitest run tests/components/task-submit-button.test.tsx tests/components/task-row.test.tsx`
Expected: PASS (9 tests)

- [ ] **Step 13: Make the e2e specs wait for the server, and prove the flip**

Create `e2e/server-action.ts`:

```ts
import type { Page } from '@playwright/test'

// Resolves once the next server action has answered. Optimistic rows show the result before the
// server has it, and navigating away straight after would abort the request, so a spec that
// leaves the page after one waits for this first.
export function serverActionSettled(page: Page) {
  return page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.request().headers()['next-action'] !== undefined,
  )
}
```

A server action is a `POST` to the page's own URL with a `Next-Action` header (`ACTION_HEADER = 'next-action'` in `next/dist/client/components/app-router-headers.js`). Playwright lower-cases header names.

In `e2e/parlays.spec.ts`:
- Add `import { serverActionSettled } from './server-action'` below the `local-date-time` import.
- Inside the loop, replace:

```ts
    await page
      .getByRole('region', { name: 'Outcomes' })
      .getByRole('listitem')
      .filter({ hasText: 'Yes' })
      .getByRole('button', { name: 'Add to parlay' })
      .click()
    await expect(page.getByText('In your slip')).toBeVisible()
  }
```

with:

```ts
    const added = serverActionSettled(page)
    await page
      .getByRole('region', { name: 'Outcomes' })
      .getByRole('listitem')
      .filter({ hasText: 'Yes' })
      .getByRole('button', { name: 'Add to parlay' })
      .click()
    await expect(page.getByText('In your slip')).toBeVisible()
    await added
  }
```

In `e2e/slip-drawer.spec.ts`:
- Add the same import below the `local-date-time` import.
- Inside the loop, replace:

```ts
    await page
      .getByRole('region', { name: 'Outcomes' })
      .getByRole('listitem')
      .filter({ hasText: 'Yes' })
      .getByRole('button', { name: 'Add to parlay' })
      .click()
    await expect(page.getByRole('region', { name: 'Outcomes' }).getByText('In your slip')).toBeVisible()
  }
```

with:

```ts
    const added = serverActionSettled(page)
    await page
      .getByRole('region', { name: 'Outcomes' })
      .getByRole('listitem')
      .filter({ hasText: 'Yes' })
      .getByRole('button', { name: 'Add to parlay' })
      .click()
    await expect(page.getByRole('region', { name: 'Outcomes' }).getByText('In your slip')).toBeVisible()
    await added
  }
```

In `e2e/coin-economy.spec.ts`:
- Add `import { serverActionSettled } from './server-action'` below the `@playwright/test` import.
- Replace:

```ts
  await page.getByRole('button', { name: 'I did this' }).click()
  await expect(page.getByText('Pending review')).toBeVisible()
```

with:

```ts
  const submitted = serverActionSettled(page)
  await page.getByRole('button', { name: 'I did this' }).click()
  await expect(page.getByText('Pending review')).toBeVisible()
  await submitted
```

In `e2e/admin-controls.spec.ts`:
- Add the same import below the `@playwright/test` import.
- Replace:

```ts
  await page.getByRole('button', { name: 'I did this' }).first().click()
  await expect(page.getByText('Pending review').first()).toBeVisible()
  await page.getByRole('button', { name: 'I did this' }).first().click()
  await expect(page.getByText('Pending review')).toHaveCount(2)
```

with:

```ts
  let submitted = serverActionSettled(page)
  await page.getByRole('button', { name: 'I did this' }).first().click()
  await expect(page.getByText('Pending review').first()).toBeVisible()
  await submitted
  submitted = serverActionSettled(page)
  await page.getByRole('button', { name: 'I did this' }).first().click()
  await expect(page.getByText('Pending review')).toHaveCount(2)
  await submitted
```

Every existing assertion is kept, and each resolves to the same number of elements. The second "I did this" `.first()` still finds the other task's button, since the first task's button has already turned into its chip.

Create `e2e/optimistic-slip.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('Add to parlay flips the row and the nav count before the server answers', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the optimistic pick land?')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

  // An outcome needs a pool before it can join a slip.
  await page.getByRole('combobox').first().selectOption({ label: 'Yes' })
  await page.getByPlaceholder('Amount (DC)').fill('1')
  await page.getByRole('button', { name: 'Place bet' }).click()
  await expect(page.getByRole('region', { name: 'Bets' }).getByText('1 DC on Yes')).toBeVisible()

  // Hold the add request until the optimistic state has been checked, so the check can't race
  // the server. A server action is a POST to the page's own URL with a Next-Action header.
  const marketPath = new URL(page.url()).pathname
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let intercepted = false
  await page.route(
    (url) => url.pathname === marketPath,
    async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
        intercepted = true
        await held
      }
      await route.continue()
    },
  )

  const outcomes = page.getByRole('region', { name: 'Outcomes' })
  const yesRow = outcomes.getByRole('listitem').filter({ hasText: 'Yes' })
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await expect(nav.getByRole('link', { name: 'Parlays', exact: true })).toBeVisible()

  await yesRow.getByRole('button', { name: 'Add to parlay' }).click()

  await expect(yesRow.getByText('In your slip')).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Parlays (1)', exact: true })).toBeVisible()
  await expect.poll(() => intercepted).toBe(true)
  await expect(page.getByText('Added to your slip.')).toHaveCount(0)

  // Record whether the row ever flashes back to "Add to parlay" while the server state lands.
  await yesRow.evaluate((row) => {
    const flags = window as unknown as { flashedBack: boolean }
    flags.flashedBack = false
    new MutationObserver(() => {
      if (row.textContent?.includes('Add to parlay')) flags.flashedBack = true
    }).observe(row, { childList: true, subtree: true, characterData: true })
  })
  release()

  await expect(page.getByText('Added to your slip.')).toBeVisible()
  await expect(outcomes.getByText('In your slip')).toHaveCount(1)
  await expect(nav.getByRole('link', { name: 'Parlays (1)', exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { flashedBack: boolean }).flashedBack)).toBe(false)
  await page.unrouteAll()
})
```

**How the spec holds the request.**
- The route handler holds the action `POST` on a promise until the test releases it. So the optimistic assertions run while the server provably hasn't answered: `intercepted` is true, and there is no toast yet. No timer is involved.
- Every other request to the market URL (the page itself, and RSC refreshes) passes straight through.
- The seeded session starts every test with an empty slip, because the slip cookie isn't in the stored state. The Parlays link therefore goes from "Parlays" to "Parlays (1)".
- At the default 1280px viewport, the only `Primary` navigation Playwright can see is the desktop top bar. The phone tab bar is `display: none`.

- [ ] **Step 14: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 23 passed: the 22 after Task 6 plus `optimistic-slip.spec.ts`.

- [ ] **Step 15: Commit**

```bash
git add components/app-nav/slip-count.tsx components/markets/market-slip.tsx components/markets/outcome-slip-control.tsx components/ui/toast-action-form.tsx components/markets/outcome-row.tsx "app/(app)/markets/[id]/page.tsx" components/parlays/slip-pick.tsx "app/(app)/parlays/slip-form.tsx" components/app-nav/app-nav.tsx "app/(app)/layout.tsx" components/tasks/task-row.tsx "app/(app)/tasks/submit-button.tsx" tests/components/commit-history.tsx tests/components/slip-count.test.tsx tests/components/outcome-slip-control.test.tsx tests/components/task-submit-button.test.tsx tests/components/toast-action-form.test.tsx tests/components/slip-pick.test.tsx tests/components/outcome-row.test.tsx tests/components/slip-form.test.tsx tests/components/app-nav.test.tsx e2e/server-action.ts e2e/optimistic-slip.spec.ts e2e/parlays.spec.ts e2e/slip-drawer.spec.ts e2e/coin-economy.spec.ts e2e/admin-controls.spec.ts
git commit -m "Flip slip picks and task submissions optimistically, with the nav count following"
```

---

## Task 8: Live updates

Data now stays fresh without pull-to-refresh. When anything the signed-in pages show changes, whoever made the change, the page on screen re-fetches its server data about 400ms later:
- bets
- markets and resolutions
- parlays and their legs
- tasks and task completions
- balances

This takes two pieces:
- **A migration** that adds the watched tables to Supabase's `supabase_realtime` publication. Realtime is already enabled in `supabase/config.toml`.
- **A `LiveRefresh` client component** in the `(app)` layout. It holds one channel and calls a debounced `router.refresh()`.

`LiveRefresh` replaces `AppNav`'s refresh-on-tab-return, which is removed along with its test. It also fixes the nav balance going stale after someone else's action.

**Files:**
- Create: `supabase/migrations/0032_realtime_publication.sql`
- Create: `components/live/live-refresh.tsx`
- Modify: `app/(app)/layout.tsx` (mount `LiveRefresh`)
- Modify: `components/app-nav/app-nav.tsx` (remove the visibility effect)
- Modify: `tests/db/helpers.ts` (export `assertLocal`)
- Test, create: `tests/components/live-refresh.test.tsx`, `tests/db/realtime-publication.test.ts`
- Test, modify: `tests/components/app-nav.test.tsx` (remove the visibility case, which is the "refresh-on-visibility" test)

**Interfaces:**
- Consumes:
  - `browserClient()` from `lib/supabase/client.ts`: `@supabase/ssr`'s `createBrowserClient`, a singleton in the browser.
    - supabase-js 2.116 gives its realtime client the signed-in user's access token (`accessToken: this._getAccessToken`, and `realtime.setAuth` on `INITIAL_SESSION` / `SIGNED_IN` / `TOKEN_REFRESHED`).
    - So Postgres Changes are filtered by the member's RLS, not the anon role's.
  - `useRouter().refresh()` from `next/navigation`.
  - Task 7's `SlipCountProvider` return in `app/(app)/layout.tsx`, and its `AppNav({ balance, isAdmin })`.
  - The tables `bets`, `markets`, `market_resolutions`, `parlays`, `parlay_legs`, `tasks`, `task_completions` and `profiles`. All exist today, all are owned by `postgres`, and all have `select … to authenticated` policies (migrations 0005, 0014, 0022, 0025, 0030). `tasks` is published too, so a task an admin creates appears on members' `/tasks` pages straight away.
- Produces:
  - `components/live/live-refresh.tsx`:
    ```ts
    export const LIVE_TABLES: readonly ['bets', 'markets', 'market_resolutions', 'parlays', 'parlay_legs', 'tasks', 'task_completions', 'profiles']
    export function LiveRefresh(): null
    ```
  - Migration `0032_realtime_publication.sql`. The highest existing migration is `0031_activity_feed_view.sql`.
  - `assertLocal(url: string): void`, now exported from `tests/db/helpers.ts`.

**Behaviour.**
- **One channel per signed-in session.** Topic `live-refresh`, with a `postgres_changes` binding (`event: '*'`, `schema: 'public'`) for each table in `LIVE_TABLES`.
- **Debounced.** Every change (re)starts a 400ms timer, and the timer calls `router.refresh()`. One action touches several tables (a bet writes `bets` and the member's `profiles.balance`), so a burst becomes a single refresh.
- **Reconnect catch-up.** Postgres Changes has no replay. The subscribe callback reports `SUBSCRIBED` on the first join and again after every automatic rejoin, because realtime-js re-runs the join push's `ok` hook. The first one is ignored; every later one schedules a refresh.
- **Foreground catch-up.**
  - Returning to the tab or app (`visibilitychange` → `visible`) also schedules a refresh.
  - This keeps what `AppNav`'s effect did, now owned by the live-update component. A phone that backgrounds the app suspends the socket, and realtime-js only notices a dead socket at its next heartbeat (25s).
  - A foreground event and a rejoin that land within 400ms share one refresh.
- **Loaded lazily.** `@/lib/supabase/client` is imported inside the effect, so supabase-js stays off every page's critical path, as in the reference app.
- **Cleanup on unmount.**
  - It clears the pending timer, removes the visibility listener and calls `supabase.removeChannel(channel)`.
  - If the component unmounts before the client has loaded, no channel is ever opened.
  - Signing out leaves the `(app)` layout, which unmounts it.
- **Renders nothing.** It is mounted once, in the signed-in branch of `app/(app)/layout.tsx`, next to the `Toaster`.
- **Own changes echo.** A member's own action revalidates straight away, and its realtime echo refreshes once more 400ms later. That's harmless (`router.refresh()` keeps client state), and it's the price of one simple channel. PR A may narrow it.
- **Delete events.** Realtime doesn't apply RLS to `DELETE` payloads. They carry only the primary key, and `LiveRefresh` ignores payloads anyway; the refresh re-reads through RLS.

**Why the migration is safe on production.**
- Hosted Supabase already has an empty `supabase_realtime` publication. `ALTER PUBLICATION … ADD TABLE` errors if a table is already a member, for example one enabled from the dashboard.
- So the migration adds each table only if `pg_publication_tables` doesn't list it yet.
- It creates the publication only if it's missing, and it leaves a `FOR ALL TABLES` publication alone, since that already covers the tables and rejects `ADD TABLE`.
- It runs as `postgres`, which owns both the publication and the tables. It ships through the existing `deploy-production-db.yml` (`supabase db push`).

**How the DB test reads the catalogue.** PostgREST doesn't expose `pg_catalog`, and the repo has no Postgres driver. So the test posts SQL to the local stack's postgres-meta service at `${NEXT_PUBLIC_SUPABASE_URL}/pg/query` with the service-role key. That's the route Supabase Studio uses. It refuses non-local URLs through `assertLocal`, like every DB test.

- [ ] **Step 1: Write the failing `LiveRefresh` test**

Create `tests/components/live-refresh.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'

type Status = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT'

const mocks = vi.hoisted(() => {
  const handlers: Array<() => void> = []
  const status: { report: (status: Status) => void } = { report: () => {} }
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, handler: () => void) => {
      handlers.push(handler)
      return channel
    }),
    subscribe: vi.fn((callback: (status: Status) => void) => {
      status.report = callback
      return channel
    }),
  }
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() }
  return { handlers, status, channel, client, browserClient: vi.fn(() => client), refresh: vi.fn() }
})

vi.mock('@/lib/supabase/client', () => ({ browserClient: mocks.browserClient }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { LIVE_TABLES, LiveRefresh } from '@/components/live/live-refresh'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

// The client loads through a dynamic import; timers are faked only once it has, so the import
// itself isn't held up.
async function mount() {
  const view = render(<LiveRefresh />)
  await act(() => vi.dynamicImportSettled())
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  return view
}

function fireChange() {
  mocks.handlers[0]()
}

beforeEach(() => {
  mocks.handlers.length = 0
  mocks.status.report = () => {}
  mocks.channel.on.mockClear()
  mocks.channel.subscribe.mockClear()
  mocks.client.channel.mockClear()
  mocks.client.removeChannel.mockClear()
  mocks.browserClient.mockClear()
  mocks.refresh.mockClear()
  setVisibility('visible')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('LiveRefresh', () => {
  it('renders nothing and opens one channel on every change to each live table', async () => {
    const { container } = await mount()

    expect(container).toBeEmptyDOMElement()
    expect(mocks.client.channel).toHaveBeenCalledTimes(1)
    expect(mocks.channel.on).toHaveBeenCalledTimes(LIVE_TABLES.length)
    for (const table of ['bets', 'markets', 'market_resolutions', 'parlays', 'parlay_legs', 'tasks', 'task_completions', 'profiles']) {
      expect(mocks.channel.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table }, expect.any(Function))
    }
    expect(mocks.channel.subscribe).toHaveBeenCalledTimes(1)
  })

  it('refreshes once, 400ms after the last change in a burst', async () => {
    await mount()

    fireChange()
    vi.advanceTimersByTime(200)
    mocks.handlers[3]()
    vi.advanceTimersByTime(200)
    mocks.handlers[7]()
    vi.advanceTimersByTime(399)
    expect(mocks.refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes after a reconnect, but not on the first join', async () => {
    await mount()

    mocks.status.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    mocks.status.report('CLOSED')
    mocks.status.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('catches up when the app comes back to the foreground, not when it leaves', async () => {
    await mount()

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('folds a reconnect and a return to the foreground into one refresh', async () => {
    await mount()
    mocks.status.report('SUBSCRIBED')

    document.dispatchEvent(new Event('visibilitychange'))
    mocks.status.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)

    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('removes the channel, the listener and any pending refresh on unmount', async () => {
    const { unmount } = await mount()
    fireChange()

    unmount()
    vi.advanceTimersByTime(400)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)

    expect(mocks.client.removeChannel).toHaveBeenCalledWith(mocks.channel)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('opens no channel when it unmounts before the client has loaded', async () => {
    const { unmount } = render(<LiveRefresh />)
    unmount()
    await act(() => vi.dynamicImportSettled())

    expect(mocks.browserClient).not.toHaveBeenCalled()
    expect(mocks.client.channel).not.toHaveBeenCalled()
  })
})
```

`vi.dynamicImportSettled()` waits for the component's lazy import, which resolves to the mock. Fake timers are switched on only afterwards, and only for `setTimeout`/`clearTimeout`, so they can't stall module loading.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/live-refresh.test.tsx`
Expected: FAIL. The file can't import `@/components/live/live-refresh`.

- [ ] **Step 3: Write `components/live/live-refresh.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Every table a signed-in page reads its live numbers from. supabase/migrations/0032 adds them to
// the realtime publication; Postgres Changes then only delivers rows the member's RLS lets them read.
export const LIVE_TABLES = [
  'bets',
  'markets',
  'market_resolutions',
  'parlays',
  'parlay_legs',
  'tasks',
  'task_completions',
  'profiles',
] as const

const DEBOUNCE_MS = 400

export function LiveRefresh(): null {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let teardown: (() => void) | undefined

    // One action touches several tables (a bet writes bets and profiles), so bursts coalesce
    // into a single refresh.
    function scheduleRefresh() {
      clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS)
    }

    // A phone that backgrounds the app suspends the socket, and the client only notices a dead one
    // at its next heartbeat, so returning to the app catches up straight away.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') scheduleRefresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Loaded on mount rather than imported, so the Supabase client stays off every page's
    // critical path.
    import('@/lib/supabase/client').then(({ browserClient }) => {
      if (cancelled) return
      const supabase = browserClient()
      const channel = supabase.channel('live-refresh')
      for (const table of LIVE_TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh)
      }

      // Postgres Changes has no replay: whatever changed while the socket was down is gone once it
      // rejoins. The first SUBSCRIBED is the initial join, and every later one follows a reconnect.
      let joined = false
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        if (joined) scheduleRefresh()
        joined = true
      })

      teardown = () => {
        supabase.removeChannel(channel)
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      teardown?.()
    }
  }, [router])

  return null
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/components/live-refresh.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the failing DB test**

In `tests/db/helpers.ts`, export the local-only guard. Replace:

```ts
function assertLocal(url: string): void {
```

with:

```ts
export function assertLocal(url: string): void {
```

Create `tests/db/realtime-publication.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { assertLocal } from './helpers'
import { LIVE_TABLES } from '@/components/live/live-refresh'

// PostgREST doesn't expose pg_catalog, so this reads it through the local stack's postgres-meta
// service: the /pg route Supabase Studio uses, behind the service-role key.
async function query<Row>(sql: string): Promise<Row[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars — is .env.local present?')
  assertLocal(url)
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`postgres-meta ${res.status}: ${body.message ?? JSON.stringify(body)}`)
  return body as Row[]
}

async function publishedTables(): Promise<string[]> {
  const rows = await query<{ tablename: string }>(
    "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'",
  )
  return rows.map((row) => row.tablename)
}

describe('supabase_realtime publication', () => {
  it('contains every table the live updates watch', async () => {
    expect(await publishedTables()).toEqual(
      expect.arrayContaining([
        'bets',
        'markets',
        'market_resolutions',
        'parlays',
        'parlay_legs',
        'tasks',
        'task_completions',
        'profiles',
      ]),
    )
  })

  it('publishes every table LiveRefresh subscribes to', async () => {
    expect(await publishedTables()).toEqual(expect.arrayContaining([...LIVE_TABLES]))
  })

  it('publishes inserts, updates and deletes', async () => {
    const [publication] = await query<{ pubinsert: boolean; pubupdate: boolean; pubdelete: boolean }>(
      "select pubinsert, pubupdate, pubdelete from pg_publication where pubname = 'supabase_realtime'",
    )
    expect(publication).toEqual({ pubinsert: true, pubupdate: true, pubdelete: true })
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Local Supabase must be running.

Run: `npx vitest run tests/db/realtime-publication.test.ts`
Expected: FAIL, with 2 failed and 1 passed. Both table checks fail with `expected [] to deeply equal ArrayContaining{…}`: the publication exists but publishes nothing yet. "publishes inserts, updates and deletes" passes.

- [ ] **Step 7: Write the migration and apply it**

Create `supabase/migrations/0032_realtime_publication.sql`:

```sql
-- Streams row changes on the tables DwellDuel's signed-in pages read, for
-- components/live/live-refresh.tsx, which refreshes whatever page is on
-- screen. Realtime is already enabled (supabase/config.toml's [realtime]
-- block); this is the missing piece. Postgres Changes checks each
-- subscriber's RLS, so a member only hears about rows they can already read.
--
-- Safe to run on the hosted project, where supabase_realtime already exists
-- and a table may already have been added from the dashboard: each table is
-- added only if it isn't published yet (ALTER PUBLICATION ... ADD TABLE
-- errors on a table that is), and a FOR ALL TABLES publication, which
-- rejects ADD TABLE, already covers them.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array array['bets', 'markets', 'market_resolutions', 'parlays', 'parlay_legs', 'tasks', 'task_completions', 'profiles']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
```

Run: `npm run db:reset`
Expected: the reset applies migrations through `0032_realtime_publication.sql` without error.

- [ ] **Step 8: Run the DB test to verify it passes**

Run: `npx vitest run tests/db/realtime-publication.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Mount `LiveRefresh`, and remove `AppNav`'s refresh-on-visibility**

In `app/(app)/layout.tsx`, replace:

```tsx
import { SlipCountProvider } from '@/components/app-nav/slip-count'
```

with:

```tsx
import { SlipCountProvider } from '@/components/app-nav/slip-count'
import { LiveRefresh } from '@/components/live/live-refresh'
```

and replace:

```tsx
      <Toaster />
    </SlipCountProvider>
```

with:

```tsx
      <Toaster />
      <LiveRefresh />
    </SlipCountProvider>
```

Only the signed-in branch renders it. The early `return children` branches for a missing user or profile stay as they are.

In `components/app-nav/app-nav.tsx`, remove the refresh-on-visibility effect. `LiveRefresh` now owns catching up. Replace:

```tsx
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
```

with:

```tsx
import Link from 'next/link'
import { usePathname } from 'next/navigation'
```

and replace:

```tsx
  const { count: slipCount } = useSlipCount()
  const router = useRouter()

  useEffect(() => {
    // Layouts don't re-render on client navigation, so refresh when the member returns to the tab
    // to pick up balance/slip changes someone else made while they were away.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [router])
```

with:

```tsx
  const { count: slipCount } = useSlipCount()
```

Nothing else in `AppNav` uses `useEffect` or `useRouter`.

In `tests/components/app-nav.test.tsx`, remove the refresh-on-visibility test and its scaffolding. `AppNav` no longer calls `useRouter`; `tests/components/live-refresh.test.tsx` covers the same behaviour.

(a) Replace:

```tsx
const { refresh, numberFlowCalls } = vi.hoisted(() => ({ refresh: vi.fn(), numberFlowCalls: [] as NumberFlowProps[] }))
let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ refresh }) }))
```

with:

```tsx
const { numberFlowCalls } = vi.hoisted(() => ({ numberFlowCalls: [] as NumberFlowProps[] }))
let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
```

(b) Delete:

```tsx
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

```

(c) In `beforeEach`, delete the line:

```tsx
  refresh.mockClear()
```

(d) Delete the whole case:

```tsx
  it('refreshes when the tab becomes visible again, not when it hides', () => {
    render(<Nav balance={120} slipCount={0} isAdmin={false} />)

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refresh).toHaveBeenCalledOnce()
  })

```

Run: `npx vitest run tests/components/app-nav.test.tsx tests/components/live-refresh.test.tsx`
Expected: PASS (22 tests): the 15 remaining `app-nav.test.tsx` cases and the 7 live-refresh cases

- [ ] **Step 10: Verify**

Local Supabase must be running, with migration 0032 applied (Step 7).

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 23 passed, the same as after Task 7; this task adds no e2e spec.
- Every page now opens a realtime socket to the local stack.
- A realtime event only triggers a `router.refresh()`, which keeps client state such as an open drawer or dialog, typed stakes and inline messages. So no spec changes.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/0032_realtime_publication.sql components/live/live-refresh.tsx "app/(app)/layout.tsx" components/app-nav/app-nav.tsx tests/db/helpers.ts tests/db/realtime-publication.test.ts tests/components/live-refresh.test.tsx tests/components/app-nav.test.tsx
git commit -m "Refresh signed-in pages live from Supabase Realtime, replacing the nav's tab-return refresh"
```

---

## Task 9: Offline — `useOffline`, the offline banner, the service worker and the `/offline` page

This task makes a flaky connection survivable, in three layers:
- **Soft navigations and server actions:** Next's `experimental.useOffline`. A failed navigation, prefetch or server action no longer throws. Next holds it and retries once the connection is back. `loading.tsx` skeletons (Task 4) are the offline shell while a navigation waits.
- **The banner:** `OfflineBanner` reads `useOffline()` from `next/offline` and shows "You’re offline — changes will send when you reconnect." while disconnected. It sticks just under the top bar on every signed-in page.
- **Hard navigations:** a hand-rolled `public/sw.js`. A full page load with no network gets the precached `/offline` page instead of the browser's error screen.

**What the service worker caches, and what it never touches.**
- **Cache-first:** `/_next/static/*`. Every URL there is content-hashed, so a cached copy can't go stale. Only `ok` responses are cached.
- **Network-first:** navigations (`request.mode === 'navigate'`). The response always comes from the network. Only when `fetch` rejects does the worker answer with the cached `/offline` page. A navigation response is never written to the cache.
- **Untouched (no `respondWith`):** RSC fetches, prefetches, server actions (POST), Next's `HEAD` connectivity polling, and any cross-origin request, Supabase included. Per-member HTML, RSC payloads and Supabase responses are never cached.
- **Install:** fetches `/offline`, caches it, and caches every `/_next/static/…` URL its HTML references: the CSS, the font and the scripts. The offline page is shown exactly when the network is gone, so it can't rely on the runtime cache already holding its assets. Then it calls `skipWaiting()`.
- **Activate:** deletes every cache except `dwellduel-v1`, then `clients.claim()`. A bump of `CACHE_VERSION` is what rolls a caching change out to installed phones.
- **Registration:** production only. In development the component unregisters any worker, because a local `next start` on port 3000 would leave one that serves dev chunks cache-first.

**The `/offline` page** lives at `app/(auth)/offline/page.tsx`. It reads no data, so it has no `requireUser` and no Supabase import. Its copy comes from the spec: "You’re offline" / "DwellDuel needs a connection for this page. It’ll load as soon as you’re back online." / "Try again".
- **"Try again" is `<a href="">`, not a client button.** The worker serves the offline page *at the URL the member was opening*, so an empty href reloads exactly that URL. A plain link also works if the page's scripts never load.
- React 19 renders `href=""` on anchors without a warning. `react-dom` exempts `a`/`href` from its empty-string check (`node_modules/react-dom/cjs/react-dom-client.development.js`, `"a" !== tag || "href" !== key`).
- Testing Library doesn't give an empty-href anchor the `link` role, though browsers and Playwright do. The unit test finds it by text; the e2e uses the role.

**The proxy.** `/sw.js`, `/offline` and `/manifest.webmanifest` must never run the proxy. A redirected `/sw.js` fails the worker's install, and the offline page must not depend on an auth round trip. Task 3's matcher already excludes all three, anchored with `$`, so `/offline-report` still runs the proxy. Next's matcher honours the `$` inside the lookahead: in a production build, `/offline` skipped the proxy and `/offline-x` ran it. This task adds a unit test that pins those exclusions; `proxy.ts` itself doesn't change.

**The e2e suite blocks service workers.** `page.route()` doesn't reliably see requests that pass through a service worker, and Tasks 4 and 7 delay requests with it. So `playwright.config.ts` gets `serviceWorkers: 'block'`, and the one spec that tests the worker opts back in with `test.use({ serviceWorkers: 'allow' })`.

**Files:**
- Modify (rewrite): `next.config.ts`
- Create: `public/sw.js`
- Create: `components/offline/offline-banner.tsx`
- Create: `components/offline/service-worker-registration.tsx`
- Create: `app/(auth)/offline/page.tsx`
- Modify: `app/layout.tsx` (anchored edit: mount `ServiceWorkerRegistration`)
- Modify: `app/(app)/layout.tsx` (anchored edit: mount `OfflineBanner`)
- Modify: `playwright.config.ts` (anchored edit: `serviceWorkers: 'block'`)
- Test: `tests/lib/offline/service-worker.test.ts`
- Test: `tests/lib/offline/proxy-matcher.test.ts`
- Test: `tests/components/offline-banner.test.tsx`
- Test: `tests/components/offline-page.test.tsx`
- Test: `tests/components/service-worker-registration.test.tsx`
- Create: `e2e/offline.spec.ts` (e2e +1)

**Interfaces:**
- Consumes:
  - `useOffline(): boolean` from `next/offline`. It is `false` on the server, before hydration, and whenever `experimental.useOffline` is off (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-offline.md`).
  - `--safe-top` (Task 1). It is `0px` outside standalone. Task 2's top bars are `sticky top-(--safe-top)` and 64px (phone) / 72px (desktop) tall, so the banner sticks at `calc(4rem + var(--safe-top))` / `calc(72px + var(--safe-top))`.
  - `Card`, `buttonVariants`, `h1Class`, `cn`; `WifiOff` from `lucide-react`.
  - `config.matcher` from `proxy.ts` (Task 3's version).
- Produces:
  - `OfflineBanner(): JSX.Element`, a `'use client'` component. It renders a persistent `role="status"` region, which is empty while online.
  - `ServiceWorkerRegistration(): null`, a `'use client'` component mounted once in the root layout.
  - `public/sw.js` with the cache `dwellduel-v1`.
  - The `/offline` route. It reads no data and is excluded from the proxy.
  - `Cache-Control: no-cache, no-store, must-revalidate` on `/sw.js`.
  - `serviceWorkers: 'block'` in `playwright.config.ts`. Later specs that need a worker opt in per file.

- [ ] **Step 1: Write the failing service-worker test**

It runs the real `public/sw.js` in a `node:vm` context. The fake worker scope has its own listeners, an in-memory Cache Storage and a stubbed `fetch`. No file is duplicated, and no routing logic is extracted: the test exercises the shipped file.

Create `tests/lib/offline/service-worker.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Runs the real public/sw.js in a fake worker scope: its own listeners, an in-memory Cache
// Storage, and a stubbed network.
const SOURCE = readFileSync(path.resolve(import.meta.dirname, '../../../public/sw.js'), 'utf8')
const ORIGIN = 'https://www.dwellduel.com'
const OFFLINE_HTML =
  '<html><head><link rel="stylesheet" href="/_next/static/chunks/app.css"></head>' +
  '<body><script src="/_next/static/chunks/main.js"></script>' +
  '<script>self.__next_f.push([1,"\\"/_next/static/chunks/main.js\\""])</script></body></html>'

type FakeRequest = { url: string; method: string; mode: string }
type Listener = (event: unknown) => void

const keyOf = (input: string | FakeRequest) => new URL(typeof input === 'string' ? input : input.url, ORIGIN).href

function loadWorker(network: (url: string) => Promise<Response>) {
  const listeners: Record<string, Listener> = {}
  const storage = new Map<string, Map<string, Response>>()
  const fetch = vi.fn((input: string | FakeRequest) => network(keyOf(input)))

  function openSync(name: string) {
    if (!storage.has(name)) storage.set(name, new Map())
    const entries = storage.get(name)!
    return {
      match: async (input: string | FakeRequest) => entries.get(keyOf(input))?.clone(),
      put: async (input: string | FakeRequest, response: Response) => void entries.set(keyOf(input), response),
      add: async (input: string) => {
        const response = await fetch(input)
        if (!response.ok) throw new TypeError(`Request failed: ${response.status}`)
        entries.set(keyOf(input), response)
      },
    }
  }

  const caches = {
    open: async (name: string) => openSync(name),
    keys: async () => [...storage.keys()],
    delete: async (name: string) => storage.delete(name),
    match: async (input: string | FakeRequest) => {
      for (const entries of storage.values()) {
        const hit = entries.get(keyOf(input))
        if (hit) return hit.clone()
      }
      return undefined
    },
  }

  const scope: Record<string, unknown> = {
    caches,
    fetch,
    URL,
    Response,
    Promise,
    Set,
    Error,
    TypeError,
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener
    },
  }
  scope.self = scope
  vm.runInNewContext(SOURCE, scope)

  async function lifecycle(type: 'install' | 'activate') {
    let done: Promise<unknown> = Promise.resolve()
    listeners[type]({ waitUntil: (promise: Promise<unknown>) => (done = promise) })
    await done
  }

  async function request(pathOrUrl: string, init: { method?: string; mode?: string } = {}) {
    const pending: Promise<unknown>[] = []
    let responded: Promise<Response> | undefined
    listeners.fetch({
      request: { url: keyOf(pathOrUrl), method: init.method ?? 'GET', mode: init.mode ?? 'cors' },
      respondWith: (response: Promise<Response>) => (responded = response),
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    })
    const response = responded ? await responded : undefined
    await Promise.all(pending)
    return response
  }

  const cached = (name: string) => [...(storage.get(name)?.keys() ?? [])].map((key) => key.replace(ORIGIN, ''))

  return { fetch, storage, scope, lifecycle, request, cached }
}

const ok = (body: string) => Promise.resolve(new Response(body, { status: 200 }))

function onlineNetwork(url: string) {
  if (url === `${ORIGIN}/offline`) return ok(OFFLINE_HTML)
  return ok(`body of ${url}`)
}

function offlineNetwork(): Promise<Response> {
  return Promise.reject(new TypeError('Failed to fetch'))
}

describe('public/sw.js', () => {
  it('precaches the offline page and every static asset its HTML references, then skips waiting', async () => {
    const worker = loadWorker(onlineNetwork)
    await worker.lifecycle('install')

    expect(worker.cached('dwellduel-v1').sort()).toEqual([
      '/_next/static/chunks/app.css',
      '/_next/static/chunks/main.js',
      '/offline',
    ])
    expect(worker.scope.skipWaiting).toHaveBeenCalledTimes(1)
  })

  it('fails the install when the offline page cannot be fetched', async () => {
    const worker = loadWorker((url) => (url.endsWith('/offline') ? Promise.resolve(new Response('', { status: 500 })) : ok('')))
    await expect(worker.lifecycle('install')).rejects.toThrow('Precaching /offline failed with 500')
    expect(worker.scope.skipWaiting).not.toHaveBeenCalled()
  })

  it('deletes caches from older versions on activate and claims open pages', async () => {
    const worker = loadWorker(onlineNetwork)
    worker.storage.set('dwellduel-v0', new Map())
    await worker.lifecycle('install')
    await worker.lifecycle('activate')

    expect([...worker.storage.keys()]).toEqual(['dwellduel-v1'])
    expect((worker.scope.clients as { claim: () => void }).claim).toHaveBeenCalledTimes(1)
  })

  it('serves static assets cache-first, fetching each once', async () => {
    const worker = loadWorker(onlineNetwork)
    const first = await worker.request('/_next/static/chunks/page-abc123.js')
    const second = await worker.request('/_next/static/chunks/page-abc123.js')

    expect(await first!.text()).toBe(`body of ${ORIGIN}/_next/static/chunks/page-abc123.js`)
    expect(await second!.text()).toBe(`body of ${ORIGIN}/_next/static/chunks/page-abc123.js`)
    expect(worker.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed static asset response', async () => {
    const worker = loadWorker(() => Promise.resolve(new Response('', { status: 503 })))
    const response = await worker.request('/_next/static/chunks/page-abc123.js')

    expect(response!.status).toBe(503)
    expect(worker.cached('dwellduel-v1')).toEqual([])
  })

  it('answers navigations from the network and never caches them', async () => {
    const worker = loadWorker(onlineNetwork)
    await worker.lifecycle('install')
    const response = await worker.request('/markets', { mode: 'navigate' })

    expect(await response!.text()).toBe(`body of ${ORIGIN}/markets`)
    expect(worker.cached('dwellduel-v1')).not.toContain('/markets')
  })

  it('falls back to the precached offline page when a navigation cannot reach the network', async () => {
    const worker = loadWorker(onlineNetwork)
    await worker.lifecycle('install')
    worker.fetch.mockImplementation(offlineNetwork)

    const response = await worker.request('/markets/3f2a', { mode: 'navigate' })
    expect(await response!.text()).toBe(OFFLINE_HTML)
  })

  it('returns a network error for an offline navigation before the offline page is cached', async () => {
    const worker = loadWorker(offlineNetwork)
    const response = await worker.request('/markets', { mode: 'navigate' })
    expect(response!.type).toBe('error')
  })

  it.each([
    ['an RSC fetch', `${ORIGIN}/markets?_rsc=1x2y`, 'GET', 'cors'],
    ['a server action', `${ORIGIN}/markets/3f2a`, 'POST', 'cors'],
    ['a server action posted from a navigation', `${ORIGIN}/markets/3f2a`, 'POST', 'navigate'],
    ['the offline check', `${ORIGIN}/markets`, 'HEAD', 'cors'],
    ['a Supabase request', 'https://abc.supabase.co/rest/v1/markets?select=*', 'GET', 'cors'],
    ['a cross-origin navigation', 'https://accounts.google.com/o/oauth2/auth', 'GET', 'navigate'],
  ])('leaves %s to the browser untouched', async (_name, url, method, mode) => {
    const worker = loadWorker(onlineNetwork)
    const response = await worker.request(url, { method, mode })

    expect(response).toBeUndefined()
    expect(worker.fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it (expected fail)**

Run: `npx vitest run tests/lib/offline/service-worker.test.ts`
Expected: FAIL. `readFileSync` throws `ENOENT` for `public/sw.js`.

- [ ] **Step 3: Write `public/sw.js`**

```js
// Hand-rolled on purpose: three routing rules don't need a library. Bump CACHE_VERSION whenever
// this file's caching changes; activate deletes every other cache, which is what rolls the
// change out to phones that already installed the old worker.
const CACHE_VERSION = 'v1'
const CACHE_NAME = `dwellduel-${CACHE_VERSION}`
const OFFLINE_URL = '/offline'
const STATIC_PREFIX = '/_next/static/'
const STATIC_ASSET_URL = /\/_next\/static\/[^"'\s\\)]+/g

// The offline page is shown exactly when the network is gone, so the CSS, fonts and scripts
// its HTML references are cached alongside it rather than left to the runtime cache.
async function precacheOfflinePage() {
  const cache = await caches.open(CACHE_NAME)
  const response = await fetch(OFFLINE_URL, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Precaching ${OFFLINE_URL} failed with ${response.status}`)
  const html = await response.clone().text()
  await cache.put(OFFLINE_URL, response)
  const assets = [...new Set(html.match(STATIC_ASSET_URL) ?? [])]
  await Promise.all(assets.map((url) => cache.add(url).catch(() => undefined)))
}

// Everything under /_next/static/ is content-hashed, so a URL never changes meaning and a
// cached copy can't go stale. Error responses aren't cached: they aren't that URL's bytes.
async function cacheFirst(event) {
  const cached = await caches.match(event.request)
  if (cached) return cached
  const response = await fetch(event.request)
  if (response.ok) {
    const copy = response.clone()
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)))
  }
  return response
}

// Every page is live, per-member data, so a navigation is never answered from cache. The
// offline page is the only fallback.
async function networkFirstNavigation(request) {
  try {
    return await fetch(request)
  } catch {
    return (await caches.match(OFFLINE_URL)) ?? Response.error()
  }
}

// Taking over at once means the first visit's tab gets the offline fallback from its next
// navigation. It's safe because nothing this worker serves can go stale mid-session.
self.addEventListener('install', (event) => {
  event.waitUntil(precacheOfflinePage().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// RSC fetches, server actions, Next's offline polling and Supabase get no respondWith at all,
// so the browser handles them exactly as if this worker didn't exist.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith(STATIC_PREFIX)) {
    event.respondWith(cacheFirst(event))
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
  }
})
```

- [ ] **Step 4: Run it (expected pass)**

Run: `npx vitest run tests/lib/offline/service-worker.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Write the failing component tests**

Create `tests/components/offline-banner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useOffline } = vi.hoisted(() => ({ useOffline: vi.fn() }))
vi.mock('next/offline', () => ({ useOffline }))

import { OfflineBanner } from '@/components/offline/offline-banner'

const COPY = 'You’re offline — changes will send when you reconnect.'

beforeEach(() => {
  useOffline.mockReset()
})

describe('OfflineBanner', () => {
  it('keeps an empty live region while online', () => {
    useOffline.mockReturnValue(false)
    render(<OfflineBanner />)
    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()
    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('shows the offline copy inside the live region while offline', () => {
    useOffline.mockReturnValue(true)
    render(<OfflineBanner />)
    expect(screen.getByRole('status')).toHaveTextContent(COPY)
  })

  it('sticks below the phone and desktop top bars, including the installed app\'s status band', () => {
    useOffline.mockReturnValue(true)
    render(<OfflineBanner />)
    expect(screen.getByRole('status')).toHaveClass(
      'sticky',
      'top-[calc(4rem+var(--safe-top))]',
      'md:top-[calc(72px+var(--safe-top))]',
    )
  })

  it('announces going offline and clears when the connection returns', () => {
    useOffline.mockReturnValue(false)
    const { rerender } = render(<OfflineBanner />)
    const region = screen.getByRole('status')

    useOffline.mockReturnValue(true)
    rerender(<OfflineBanner />)
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent(COPY)

    useOffline.mockReturnValue(false)
    rerender(<OfflineBanner />)
    expect(region).toBeEmptyDOMElement()
  })
})
```

Create `tests/components/offline-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OfflinePage from '@/app/(auth)/offline/page'

describe('OfflinePage', () => {
  it('explains the page needs a connection', () => {
    render(<OfflinePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'You’re offline' })).toBeInTheDocument()
    expect(
      screen.getByText('DwellDuel needs a connection for this page. It’ll load as soon as you’re back online.'),
    ).toBeInTheDocument()
  })

  it('offers "Try again" as a plain link that reloads the URL being opened', () => {
    render(<OfflinePage />)
    // Testing Library doesn't give an empty-href anchor the link role, though browsers do.
    const retry = screen.getByText('Try again')
    expect(retry.tagName).toBe('A')
    expect(retry).toHaveAttribute('href', '')
    expect(retry).toHaveClass('no-underline')
  })
})
```

Create `tests/components/service-worker-registration.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ServiceWorkerRegistration } from '@/components/offline/service-worker-registration'

const register = vi.fn()
const unregister = vi.fn()
const getRegistrations = vi.fn()

beforeEach(() => {
  register.mockReset().mockResolvedValue({})
  unregister.mockReset().mockResolvedValue(true)
  getRegistrations.mockReset().mockResolvedValue([{ unregister }])
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register, getRegistrations },
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('ServiceWorkerRegistration', () => {
  it('registers /sw.js for the whole site in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { container } = render(<ServiceWorkerRegistration />)
    await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' }))
    expect(container).toBeEmptyDOMElement()
  })

  it('never registers in development, and removes a worker left by a local production run', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    render(<ServiceWorkerRegistration />)
    await waitFor(() => expect(unregister).toHaveBeenCalledTimes(1))
    expect(register).not.toHaveBeenCalled()
  })

  it('does nothing where service workers are unsupported', () => {
    vi.stubEnv('NODE_ENV', 'production')
    Reflect.deleteProperty(navigator, 'serviceWorker')
    expect(() => render(<ServiceWorkerRegistration />)).not.toThrow()
    expect(register).not.toHaveBeenCalled()
  })
})
```

Create `tests/lib/offline/proxy-matcher.test.ts`. It pins the exclusions Task 3 put in the matcher:

```ts
import { describe, it, expect } from 'vitest'
import { config } from '@/proxy'

// The service worker, the offline page and the manifest must load with no session and no
// auth round trip: a redirected /sw.js fails the worker's install.
describe('proxy matcher', () => {
  const pattern = new RegExp(`^${config.matcher[0]}$`)

  it.each([
    ['/', true],
    ['/markets', true],
    ['/markets/3f2a', true],
    ['/sign-in', true],
    ['/offline-report', true],
    ['/sw.js', false],
    ['/offline', false],
    ['/manifest.webmanifest', false],
    ['/_next/static/chunks/main.js', false],
    ['/favicon.ico', false],
    ['/android-chrome-192.png', false],
  ])('%s runs the proxy: %s', (pathname, runs) => {
    expect(pattern.test(pathname)).toBe(runs)
  })
})
```

Run: `npx vitest run tests/components/offline-banner.test.tsx tests/components/offline-page.test.tsx tests/components/service-worker-registration.test.tsx tests/lib/offline/proxy-matcher.test.ts`
Expected: FAIL. The three component files can't resolve their imports. The matcher test already passes (11 tests), since Task 3's matcher excludes these paths.

- [ ] **Step 6: Write the components and the page**

Create `components/offline/offline-banner.tsx`:

```tsx
'use client'

import { WifiOff } from 'lucide-react'
import { useOffline } from 'next/offline'

// Sticks just below whichever top bar is showing. The live region stays mounted while online:
// screen readers often skip a region that is inserted together with its text.
export function OfflineBanner() {
  const isOffline = useOffline()

  return (
    <div role="status" className="sticky top-[calc(4rem+var(--safe-top))] z-20 md:top-[calc(72px+var(--safe-top))]">
      {isOffline && (
        <p className="flex items-center gap-2.5 border-b border-line bg-gold-soft px-4 py-2.5 text-sm font-bold leading-[1.4] text-gold md:px-20">
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          You’re offline — changes will send when you reconnect.
        </p>
      )}
    </div>
  )
}
```

Create `components/offline/service-worker-registration.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') {
      // A worker left behind by a local `next start` on the same port would serve dev chunks
      // cache-first and hide code changes.
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined)
      return
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      console.error('Service worker registration failed', error)
    })
  }, [])

  return null
}
```

Create `app/(auth)/offline/page.tsx`:

```tsx
import { WifiOff } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { h1Class } from '@/components/ui/page'
import { cn } from '@/lib/utils'

// public/sw.js serves this page in place of any navigation that can't reach the network, so
// it reads no data. "Try again" is a plain empty-href link, not a client button: it reloads
// whatever URL the member was opening, and it works even if this page's scripts never load.
export default function OfflinePage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[440px] flex-col items-start gap-4 p-7 md:p-10">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold">
          <WifiOff className="size-6" />
        </span>
        <h1 className={h1Class}>You’re offline</h1>
        <p className="text-ink2">DwellDuel needs a connection for this page. It’ll load as soon as you’re back online.</p>
        <a href="" className={cn(buttonVariants({ variant: 'primary', block: true }), 'md:w-auto')}>
          Try again
        </a>
      </Card>
    </div>
  )
}
```

- [ ] **Step 7: Config, proxy, layouts and Playwright**

(a) Rewrite `next.config.ts` in full. No earlier task in this PR edits it.

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    useOffline: true,
  },
  // A service worker only updates when the browser sees new bytes at /sw.js, so neither the
  // browser nor Vercel's CDN may keep a copy.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
}

export default nextConfig
```

(b) `proxy.ts` needs no change. Check the exclusions are there:

Run: `grep -cF 'manifest\\.webmanifest$|sw\\.js$|offline$' proxy.ts`
Expected: `1`. The matcher line carries all three exclusions, from Task 3.

(c) `app/layout.tsx`: add the import after the `lib/theme/theme` import:

```tsx
import { resolveTheme, THEME_COOKIE } from '@/lib/theme/theme'
import { ServiceWorkerRegistration } from '@/components/offline/service-worker-registration'
```

Then replace:

```tsx
        {children}
        <Analytics />
```

with:

```tsx
        {children}
        <ServiceWorkerRegistration />
        <Analytics />
```

It goes in the root layout, so the worker installs on the first visit to any page, including sign-in.

(d) `app/(app)/layout.tsx`: add the import after the `Toaster` import:

```tsx
import { Toaster } from '@/components/ui/toaster'
import { OfflineBanner } from '@/components/offline/offline-banner'
```

Then make `<OfflineBanner />` the first child of `<main id="main">`. Replace:

```tsx
        {children}
      </main>
```

with:

```tsx
        <OfflineBanner />
        {children}
      </main>
```

Task 7's `SlipCountProvider`, and the siblings Tasks 5 and 8 added around `<main>`, stay as they are. Only the `<OfflineBanner />` line is new.

(e) `playwright.config.ts`: in `use`, replace:

```ts
    trace: 'on-first-retry',
```

with:

```ts
    trace: 'on-first-retry',
    serviceWorkers: 'block',
```

- [ ] **Step 8: Run the unit tests (expected pass)**

Run: `npx vitest run tests/components/offline-banner.test.tsx tests/components/offline-page.test.tsx tests/components/service-worker-registration.test.tsx tests/lib/offline`
Expected: PASS: 4 + 2 + 3 + 14 + 11 = 34 tests.

- [ ] **Step 9: Write the e2e spec**

Create `e2e/offline.spec.ts`. It uses the shared signed-in session and only reads. Chromium's offline emulation (`context.setOffline`) also cuts the service worker's own fetches, so the fallback is exercised for real.

```ts
import { test, expect } from '@playwright/test'

// playwright.config.ts blocks service workers for every other spec; this one runs the real one.
test.use({ serviceWorkers: 'allow' })

test('offline: the banner shows, a navigation falls back to the offline page, and Try again recovers', async ({
  context,
  page,
  request,
}) => {
  const worker = await request.get('/sw.js')
  expect(worker.status()).toBe(200)
  expect(worker.headers()['cache-control']).toBe('no-cache, no-store, must-revalidate')

  await page.goto('/')
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await navigator.serviceWorker.ready
        return Boolean(navigator.serviceWorker.controller)
      }),
    )
    .toBe(true)

  const banner = page.getByText('You’re offline — changes will send when you reconnect.')
  await expect(banner).toHaveCount(0)
  await context.setOffline(true)
  await expect(banner).toBeVisible()

  await page.goto('/markets')
  await expect(page.getByRole('heading', { level: 1, name: 'You’re offline' })).toBeVisible()
  await expect(page).toHaveURL(/\/markets$/)

  await context.setOffline(false)
  await page.getByRole('link', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Markets' })).toBeVisible()
})
```

- [ ] **Step 10: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS. The build's "Experiments" list shows `✓ useOffline`, and the route table lists `ƒ /offline`.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 24 passed, the 23 after Task 8 plus `offline.spec.ts`.

- [ ] **Step 11: Commit**

```bash
git add next.config.ts public/sw.js components/offline "app/(auth)/offline/page.tsx" app/layout.tsx "app/(app)/layout.tsx" playwright.config.ts tests/lib/offline tests/components/offline-banner.test.tsx tests/components/offline-page.test.tsx tests/components/service-worker-registration.test.tsx e2e/offline.spec.ts
git commit -m "Add offline support: useOffline, an offline banner, a service worker and the offline page"
```


---

## Task 10: The Add to Home Screen card and haptics

Two small extras from the spec.

**The install card.** `InstallCard` is a dismissible card on Home, titled "Get the app".
- **Who sees it:**
  - iPhone and iPad get "Tap Share, then Add to Home Screen."
  - Android gets "Open the menu, then Install app."
  - Nobody else sees it. The spec's copy covers only those two platforms, and "Open the menu, then Install app." would be wrong in desktop Safari or Firefox.
  - iPadOS reports itself as a Mac, so a Mac with more than one touch point counts as an iPad.
- **When it hides:**
  - when the app already runs from the home screen (`matchMedia('(display-mode: standalone)')`)
  - after "Not now", which is remembered in `localStorage` under `dwellduel:install-card-dismissed`
  - It isn't built on `beforeinstallprompt`, which iOS never fires. Next's PWA guide recommends against that event for the same reason (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`, "Adding to Home Screen").
- **Rendering:** the platform and dismissal are read through `useSyncExternalStore` with a server snapshot of "hidden". So the server and hydration render nothing, and the card appears on the client with no hydration mismatch.
- **Placement:** after the tiles, above "Sign out". The card appears only after hydration, so placing it low keeps the layout shift small: only the sign-out button moves.
- **"Not now":** hides the card, writes the flag, and moves focus to the page's `<h1>` through `focusPageHeading()`, so a keyboard or screen-reader user doesn't land on `<body>`. If storage throws (private browsing), the card still hides for this visit.
- **The e2e contract holds.** Playwright's Desktop Chrome user agent is neither iOS nor Android, so the card never renders in the existing specs, and no count on Home changes.

**Haptics.** `lib/haptics.ts` exports `tap`, `success` and `error` over `navigator.vibrate`. Each is a no-op where the API is missing, which includes iOS and the server. The hook points are the fewest that cover the spec, with no scattered calls:

| Spec use | Hook point | Why there |
|---|---|---|
| `tap` on tab-bar taps | `onClick={haptics.tap}` on the phone tab bar's `Link` in `AppNav` | The desktop nav gets none: it's not a phone surface. |
| `tap` on adding a pick | `ToastActionForm`'s `formAction`, before it awaits the action | It's the one form behind both "Add to parlay" and "Remove", on market rows and in the slip. The tap fires on the press, not after the server answers. |
| `success` on a bet placed and on an approval | `withSuccessToast`, beside `toast.success` | Every success toast from a form action buzzes: bet placed, approve/reject, submit for review, invite added, balance adjusted, resolve, void. It's one rule, a small superset of the spec's list. The slip's own "Added to your slip." / "Removed from your slip." toasts come from `ToastActionForm`, which already tapped on the press, so they don't buzz a second time. |
| `success` on a parlay placed | `SlipForm`'s `useActionState` action, when the result has `placed` | Placing a parlay shows an inline confirmation, not a toast, so it has no `withSuccessToast`. It covers the `/parlays` page and the phone slip drawer, which renders `SlipForm`. |
| `error` on an inline error | `Message tone="error"` renders a client `ErrorHaptic` leaf that buzzes on mount | Every inline error in the app is a `Message tone="error"`, so one hook covers them all. `Message` stays a server-safe component. |

Bulk "Approve selected" reports through an inline `Message tone="ok"`, not a toast, so it doesn't buzz. `Message tone="ok"` can't be the hook for that: the market page renders one statically, for a resolved market's winner, and it would buzz on page load.

**Limits of the error hook, accepted:**
- An identical error that stays on screen through a second failed submit doesn't buzz again, because the `Message` isn't remounted.
- The sign-in page's error (from a failed OAuth redirect) buzzes on load. Chrome may log an intervention warning there, since no tap came first.

**Files:**
- Create: `lib/haptics.ts`
- Create: `components/ui/error-haptic.tsx`
- Create: `components/home/install-card.tsx`
- Modify: `components/ui/message.tsx` (anchored edit)
- Modify: `lib/toast/with-success-toast.ts` (anchored edit)
- Modify: `components/ui/toast-action-form.tsx` (anchored edit)
- Modify: `components/app-nav/app-nav.tsx` (anchored edit)
- Modify: `app/(app)/parlays/slip-form.tsx` (anchored edit)
- Modify: `app/(app)/(home)/page.tsx` (anchored edit; Task 3 moved Home here)
- Test: `tests/lib/haptics.test.ts`
- Test: `tests/components/haptics-call-sites.test.tsx`
- Test: `tests/components/install-card.test.tsx`
- Modify: `tests/components/app-nav.test.tsx` (one new case plus a mock)
- Modify: `tests/components/slip-form.test.tsx` (one new case plus a mock)

**Interfaces:**
- Consumes:
  - `focusPageHeading()` from `lib/ui/focus-page-heading.ts`
  - `Button`, `cardClass`, `h2Class`, `cn`; `Smartphone` from `lucide-react`
  - `withSuccessToast`, `ToastActionForm`, `Message`, `AppNav` and `SlipForm` as they stand after Tasks 5, 7 and 8. Task 7 rewrote parts of `ToastActionForm`, `SlipForm` and `AppNav`, and Tasks 7 and 8 edited `app-nav.test.tsx` and `slip-form.test.tsx`; the anchors below are those files' current lines.
- Produces:
  - `lib/haptics.ts`: `export const haptics: { tap(): void; success(): void; error(): void }`. Patterns: tap `10`, success `[15, 60, 15]`, error `[40, 60, 40]` (ms).
  - `components/ui/error-haptic.tsx`: `export function ErrorHaptic(): null`, a `'use client'` component
  - `components/home/install-card.tsx`: `export function InstallCard(): JSX.Element | null` and `export const INSTALL_CARD_DISMISSED_KEY = 'dwellduel:install-card-dismissed'`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/haptics.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { haptics } from '@/lib/haptics'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('haptics', () => {
  it.each([
    ['tap', 10],
    ['success', [15, 60, 15]],
    ['error', [40, 60, 40]],
  ] as const)('%s vibrates with its preset pattern', (preset, pattern) => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    haptics[preset]()
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(pattern)
  })

  it('is a silent no-op where the Vibration API is missing, as on iOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone' })
    expect(() => {
      haptics.tap()
      haptics.success()
      haptics.error()
    }).not.toThrow()
  })

  it('is a silent no-op with no navigator at all, as during server rendering', () => {
    vi.stubGlobal('navigator', undefined)
    expect(() => haptics.success()).not.toThrow()
  })
})
```

Create `tests/components/haptics-call-sites.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { haptics } = vi.hoisted(() => ({ haptics: { tap: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/haptics', () => ({ haptics }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { ToastActionForm } from '@/components/ui/toast-action-form'
import { Message } from '@/components/ui/message'

type State = { formError?: string } | undefined
const hasError = (state: State) => Boolean(state?.formError)

beforeEach(() => {
  haptics.tap.mockReset()
  haptics.success.mockReset()
  haptics.error.mockReset()
})

describe('success haptic', () => {
  it('buzzes with every success toast from withSuccessToast', async () => {
    await withSuccessToast(async (): Promise<State> => undefined, hasError, 'Bet placed.')(undefined, new FormData())
    expect(haptics.success).toHaveBeenCalledOnce()
  })

  it('stays still when the action fails', async () => {
    await withSuccessToast(async (): Promise<State> => ({ formError: 'Nope.' }), hasError, 'Bet placed.')(
      undefined,
      new FormData(),
    )
    expect(haptics.success).not.toHaveBeenCalled()
  })
})

describe('tap haptic', () => {
  it('taps as soon as a slip form is submitted, before the action resolves', async () => {
    let resolve: () => void = () => {}
    const action = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    render(
      <ToastActionForm action={action} successMessage="Added to your slip.">
        <button type="submit">Add to parlay</button>
      </ToastActionForm>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add to parlay' }))
    await waitFor(() => expect(action).toHaveBeenCalledOnce())
    expect(haptics.tap).toHaveBeenCalledOnce()
    resolve()
  })
})

describe('error haptic', () => {
  it('buzzes once when an inline error appears, not on re-renders', () => {
    const { rerender } = render(<Message tone="error">Insufficient balance.</Message>)
    expect(haptics.error).toHaveBeenCalledOnce()
    rerender(<Message tone="error">Insufficient balance.</Message>)
    expect(haptics.error).toHaveBeenCalledOnce()
  })

  it('buzzes again when the error comes back after clearing', () => {
    function Form({ error }: { error?: string }) {
      return <form>{error && <Message tone="error">{error}</Message>}</form>
    }
    const { rerender } = render(<Form error="Nope." />)
    rerender(<Form />)
    rerender(<Form error="Nope." />)
    expect(haptics.error).toHaveBeenCalledTimes(2)
  })

  it.each(['ok', 'gold'] as const)('stays still for a %s message', (tone) => {
    render(<Message tone={tone}>Parlay placed.</Message>)
    expect(haptics.error).not.toHaveBeenCalled()
  })
})
```

Create `tests/components/install-card.test.tsx`. Two jsdom gaps are handled in the file:
- Node 25 and later define their own global `localStorage`, which shadows jsdom's and is `undefined` without `--localstorage-file`. Each test stubs an in-memory one.
- jsdom has no `navigator.maxTouchPoints`. It is defined per test and removed afterwards.

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallCard, INSTALL_CARD_DISMISSED_KEY } from '@/components/home/install-card'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

function setDevice({ userAgent, standalone = false, touchPoints = 5 }: { userAgent: string; standalone?: boolean; touchPoints?: number }) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  // jsdom has no maxTouchPoints, so it is defined here and removed after each test.
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => touchPoints })
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

// Newer Node versions define their own global localStorage, which shadows jsdom's and is
// unusable without a backing file, so each test gets a fresh in-memory one.
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'maxTouchPoints')
})

describe('InstallCard', () => {
  it('tells iPhone users to use the Share sheet', () => {
    setDevice({ userAgent: IPHONE })
    render(<InstallCard />)
    const card = screen.getByRole('region', { name: 'Get the app' })
    expect(card).toHaveTextContent('Tap Share, then Add to Home Screen.')
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument()
  })

  it('treats an iPad that reports itself as a Mac as iOS', () => {
    setDevice({ userAgent: IPAD_AS_MAC, touchPoints: 5 })
    render(<InstallCard />)
    expect(screen.getByRole('region', { name: 'Get the app' })).toHaveTextContent('Tap Share, then Add to Home Screen.')
  })

  it('tells Android users to use the browser menu', () => {
    setDevice({ userAgent: ANDROID })
    render(<InstallCard />)
    expect(screen.getByRole('region', { name: 'Get the app' })).toHaveTextContent('Open the menu, then Install app.')
  })

  it.each([
    ['a desktop browser', DESKTOP, 0],
    ['a Mac without a touch screen', IPAD_AS_MAC, 0],
  ])('stays hidden on %s', (_name, userAgent, touchPoints) => {
    setDevice({ userAgent, touchPoints })
    const { container } = render(<InstallCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden when already running from the home screen', () => {
    setDevice({ userAgent: IPHONE, standalone: true })
    const { container } = render(<InstallCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('hides on "Not now", remembers it, and moves focus to the page heading', async () => {
    setDevice({ userAgent: ANDROID })
    render(
      <>
        <h1>Welcome, Alice</h1>
        <InstallCard />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))

    expect(screen.queryByRole('region', { name: 'Get the app' })).toBeNull()
    expect(localStorage.getItem(INSTALL_CARD_DISMISSED_KEY)).toBe('1')
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('still shows, and still hides on "Not now", when storage is unavailable', async () => {
    setDevice({ userAgent: IPHONE })
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    render(<InstallCard />)
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Get the app' })).toBeNull()
  })

  it('stays hidden after an earlier dismissal', () => {
    setDevice({ userAgent: IPHONE })
    localStorage.setItem(INSTALL_CARD_DISMISSED_KEY, '1')
    const { container } = render(<InstallCard />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

Edit `tests/components/app-nav.test.tsx`:

(a) Replace:

```tsx
import { act, render, screen, within } from '@testing-library/react'
```

with:

```tsx
import { act, fireEvent, render, screen, within } from '@testing-library/react'
```

(b) Replace:

```tsx
vi.mock('@/lib/theme/set-theme', () => ({ setThemeAction: vi.fn() }))
```

with:

```tsx
vi.mock('@/lib/theme/set-theme', () => ({ setThemeAction: vi.fn() }))
const { tap } = vi.hoisted(() => ({ tap: vi.fn() }))
vi.mock('@/lib/haptics', () => ({ haptics: { tap, success: vi.fn(), error: vi.fn() } }))
```

(c) In `beforeEach`, replace:

```tsx
beforeEach(() => {
  pathname = '/'
```

with:

```tsx
beforeEach(() => {
  pathname = '/'
  tap.mockClear()
```

(d) Add this case as the last `it` inside `describe('AppNav', …)`. Like the file's other cases, it renders through Task 7's `Nav` helper, which wraps `AppNav` in `SlipCountProvider`.

```tsx
  it('taps on a phone tab press, and not on a desktop link', () => {
    // Cancelled before React sees the click, so jsdom never attempts the real navigation.
    const cancel = (event: Event) => event.preventDefault()
    window.addEventListener('click', cancel, true)
    try {
      render(<Nav balance={120} slipCount={0} isAdmin={false} />)
      const [desktop, phone] = screen.getAllByRole('navigation', { name: 'Primary' })
      fireEvent.click(within(desktop).getByRole('link', { name: 'Markets' }))
      expect(tap).not.toHaveBeenCalled()
      fireEvent.click(within(phone).getByRole('link', { name: 'Markets' }))
      expect(tap).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('click', cancel, true)
    }
  })
```

Edit `tests/components/slip-form.test.tsx`:

(a) Replace:

```tsx
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
```

with:

```tsx
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
const { haptics } = vi.hoisted(() => ({ haptics: { tap: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/haptics', () => ({ haptics }))
```

(b) In `beforeEach`, after `placeParlayAction.mockReset()`, add:

```tsx
  haptics.success.mockReset()
  haptics.error.mockReset()
```

(c) Add this case as the last `it` inside `describe('SlipForm', …)`:

```tsx
  it('buzzes success once a parlay is placed, and error (from the inline message) when it fails', async () => {
    placeParlayAction.mockResolvedValueOnce({ formError: 'Insufficient balance — you have 3 DC. Try a smaller amount.' })
    placeParlayAction.mockResolvedValueOnce({ placed: { multiplierBp: 160_000, potentialPayout: 80 } })
    render(<SlipForm slip={slipView([pick(1), pick(2)])} />)
    await userEvent.type(screen.getByLabelText('Stake (DC)'), '5')

    await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))
    await screen.findByRole('alert')
    expect(haptics.error).toHaveBeenCalledOnce()
    expect(haptics.success).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Place parlay' }))
    await screen.findByRole('status')
    expect(haptics.success).toHaveBeenCalledOnce()
  })
```

- [ ] **Step 2: Run them (expected fail)**

Run: `npx vitest run tests/lib/haptics.test.ts tests/components/haptics-call-sites.test.tsx tests/components/install-card.test.tsx tests/components/app-nav.test.tsx tests/components/slip-form.test.tsx`
Expected: FAIL.
- `haptics.test.ts` and `install-card.test.tsx` can't resolve `@/lib/haptics` or `@/components/home/install-card`.
- Six cases fail on unmet `haptics` expectations: four in `haptics-call-sites.test.tsx` (the two "stays still" cases already pass), plus the new case in each of `app-nav.test.tsx` and `slip-form.test.tsx`.
- Every existing case in `app-nav.test.tsx` and `slip-form.test.tsx` still passes.

- [ ] **Step 3: Write `lib/haptics.ts`, `ErrorHaptic` and `InstallCard`**

Create `lib/haptics.ts`:

```ts
// Android only in practice: iOS Safari has no Vibration API, even for a home-screen app.
function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern)
}

export const haptics = {
  tap: () => vibrate(10),
  success: () => vibrate([15, 60, 15]),
  error: () => vibrate([40, 60, 40]),
}
```

Create `components/ui/error-haptic.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { haptics } from '@/lib/haptics'

// Mounted by an error Message, so it buzzes when an inline error appears. It doesn't buzz
// again while the same message stays on screen.
export function ErrorHaptic() {
  useEffect(() => {
    haptics.error()
  }, [])
  return null
}
```

Create `components/home/install-card.tsx`:

```tsx
'use client'

import { useState, useSyncExternalStore } from 'react'
import { Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cardClass } from '@/components/ui/card'
import { h2Class } from '@/components/ui/page'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'
import { cn } from '@/lib/utils'

export const INSTALL_CARD_DISMISSED_KEY = 'dwellduel:install-card-dismissed'

type Platform = 'ios' | 'android'

const HOW_TO: Record<Platform, string> = {
  ios: 'Tap Share, then Add to Home Screen.',
  android: 'Open the menu, then Install app.',
}

// Nothing here changes without a reload, so there is nothing to subscribe to. The external
// store is only how a browser-only value is read without a hydration mismatch.
const subscribe = () => () => {}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_CARD_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

// Not built on beforeinstallprompt, which iOS never fires. The copy only covers iPhone/iPad
// and Android, so other devices get no card. iPadOS reports itself as a Mac, so a Mac with
// a touch screen counts as an iPad.
function platformToNudge(): Platform | null {
  if (window.matchMedia('(display-mode: standalone)').matches) return null
  if (wasDismissed()) return null
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return null
}

export function InstallCard() {
  const platform = useSyncExternalStore(subscribe, platformToNudge, () => null)
  const [dismissed, setDismissed] = useState(false)

  if (!platform || dismissed) return null

  function dismiss() {
    try {
      localStorage.setItem(INSTALL_CARD_DISMISSED_KEY, '1')
    } catch {
      // Storage can be unavailable (e.g. private browsing); the card still hides for this visit.
    }
    setDismissed(true)
    focusPageHeading()?.focus()
  }

  return (
    <section aria-labelledby="install-card-title" className={cn(cardClass, 'flex items-start gap-4 p-[18px] md:p-6')}>
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-acc-soft text-acc-text"
      >
        <Smartphone className="size-6" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="install-card-title" className={h2Class}>
            Get the app
          </h2>
          <p className="text-ink2">{HOW_TO[platform]}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Wire the call sites**

(a) `components/ui/message.tsx`. Replace:

```tsx
import { cn } from '@/lib/utils'
```

with:

```tsx
import { cn } from '@/lib/utils'
import { ErrorHaptic } from '@/components/ui/error-haptic'
```

and replace:

```tsx
      <span>{children}</span>
```

with:

```tsx
      <span>{children}</span>
      {tone === 'error' && <ErrorHaptic />}
```

(b) `lib/toast/with-success-toast.ts`. Replace:

```ts
import { toast } from 'sonner'
```

with:

```ts
import { toast } from 'sonner'
import { haptics } from '@/lib/haptics'
```

and replace:

```ts
    if (!hasError(next)) toast.success(message)
```

with:

```ts
    if (!hasError(next)) {
      toast.success(message)
      haptics.success()
    }
```

(c) `components/ui/toast-action-form.tsx`. Replace:

```tsx
import { toast } from 'sonner'
```

with:

```tsx
import { toast } from 'sonner'
import { haptics } from '@/lib/haptics'
```

and make `haptics.tap()` the first statement of the form's action, before Task 7's optimistic update and the `await`. Replace:

```tsx
  async function formAction(formData: FormData) {
    optimistic?.()
```

with:

```tsx
  async function formAction(formData: FormData) {
    haptics.tap()
    optimistic?.()
```

(d) `components/app-nav/app-nav.tsx`. Replace:

```tsx
import { cn } from '@/lib/utils'
```

with:

```tsx
import { haptics } from '@/lib/haptics'
import { cn } from '@/lib/utils'
```

In the phone tab bar (the `<nav>` with `fixed inset-x-0 bottom-0`), replace:

```tsx
              aria-label={item.shortLabel === item.label ? undefined : item.label}
```

with:

```tsx
              aria-label={item.shortLabel === item.label ? undefined : item.label}
              onClick={haptics.tap}
```

That line appears only once, on the phone tab `Link`. The desktop `DesktopLink` doesn't get it.

(e) `app/(app)/parlays/slip-form.tsx`. Replace:

```tsx
import { removeFromSlipAction } from '@/lib/parlays/slip-actions'
```

with:

```tsx
import { removeFromSlipAction } from '@/lib/parlays/slip-actions'
import { haptics } from '@/lib/haptics'
```

and replace:

```tsx
  const [state, formAction] = useActionState<PlaceParlayState, FormData>(placeParlayAction, undefined)
```

with:

```tsx
  const [state, formAction] = useActionState<PlaceParlayState, FormData>(async (prevState, formData) => {
    const next = await placeParlayAction(prevState, formData)
    if (next?.placed) haptics.success()
    return next
  }, undefined)
```

(f) `app/(app)/(home)/page.tsx`. Replace:

```tsx
import { HomeTiles, type HomeTile } from '@/components/home/home-tiles'
```

with:

```tsx
import { HomeTiles, type HomeTile } from '@/components/home/home-tiles'
import { InstallCard } from '@/components/home/install-card'
```

and replace:

```tsx
      <HomeTiles tiles={tiles} />
```

with:

```tsx
      <HomeTiles tiles={tiles} />
      <InstallCard />
```


- [ ] **Step 5: Run the tests (expected pass)**

Run: `npx vitest run tests/lib/haptics.test.ts tests/components/haptics-call-sites.test.tsx tests/components/install-card.test.tsx tests/components/app-nav.test.tsx tests/components/slip-form.test.tsx tests/components/with-success-toast.test.tsx tests/components/toast-action-form.test.tsx`
Expected: PASS.
- `haptics.test.ts`: 5 tests
- `haptics-call-sites.test.tsx`: 7 tests
- `install-card.test.tsx`: 9 tests
- the two edited files each gain one case
- The existing `with-success-toast` and `toast-action-form` tests still pass. They don't mock `@/lib/haptics`, which is a safe no-op in jsdom because jsdom has no `navigator.vibrate`.

- [ ] **Step 6: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 24 passed, the same as after Task 9. This task adds no spec. The card doesn't render under Playwright's desktop user agent, and haptics have no visible effect.

- [ ] **Step 7: Commit**

```bash
git add lib/haptics.ts components/ui/error-haptic.tsx components/home/install-card.tsx components/ui/message.tsx lib/toast/with-success-toast.ts components/ui/toast-action-form.tsx components/app-nav/app-nav.tsx "app/(app)/parlays/slip-form.tsx" "app/(app)/(home)/page.tsx" tests/lib/haptics.test.ts tests/components/haptics-call-sites.test.tsx tests/components/install-card.test.tsx tests/components/app-nav.test.tsx tests/components/slip-form.test.tsx
git commit -m "Add the Add to Home Screen card and Android haptics"
```

---

## Task 11: Full verification

This task changes no product code. It runs the whole chain on the finished branch, then re-runs it on the Supabase CLI version CI pins. The controller then takes a visual pass, with standalone emulated. Last comes the user's real-device checklist, which only the user can run, on real phones, after deploy.

**Files:**
- Temporary, not committed: `e2e/zz-visual.spec.ts` (Step 4, the controller's screenshot spec, deleted after use)

**Interfaces:**
- Consumes every task in this PR:
  - the manifest, status band and splash screens (Task 1)
  - insets and touch polish (Task 2)
  - the proxy redirect and the `(home)` group (Task 3)
  - skeletons (Task 4)
  - transitions and nav depth (Task 5)
  - back-swipe (Task 6)
  - optimistic rows (Task 7)
  - live refresh and the realtime migration (Task 8)
  - offline (Task 9)
  - the install card and haptics (Task 10)
- Produces nothing new. This is the last task.

- [ ] **Step 1: Run the whole chain**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS: 122 test files, 731 tests. `npx vitest run` includes `tests/db/`, including Task 8's publication test, so local Supabase must be running, with migration 0032 applied (`npm run db:reset`).
- The build's "Experiments" list shows `✓ useOffline`.
- The route table lists `/offline` and `/manifest.webmanifest`.
- Home is still `/`, now served from the `(home)` group.

Run: `npm run db:reset && (lsof -ti:3000 | xargs -r kill 2>/dev/null); npx playwright test`
Expected: PASS, 24 tests:
- the 18 from before this PR
- `home-screen.spec.ts` (Task 1)
- the signed-out 307 spec (Task 3)
- the skeleton spec (Task 4)
- the back-swipe spec (Task 6)
- the optimistic "Add to parlay" spec (Task 7)
- `offline.spec.ts` (Task 9)

- [ ] **Step 2: Re-run the chain on the CLI version CI pins**

```bash
npx -y supabase@2.115.0 stop --no-backup
npx -y supabase@2.115.0 start
npm run lint
npx vitest run
npm run build
npx -y supabase@2.115.0 db reset
lsof -ti:3000 | xargs -r kill 2>/dev/null
npx playwright test
```

Expected: every step passes on this exact CLI version, with 24 e2e tests. Pay particular attention to Task 8's migration. `db reset` must apply the realtime publication migration cleanly on 2.115.0, and the publication DB test must pass after it.

- [ ] **Step 3: Confirm the tree is clean**

Run: `git status --short`
Expected: no output. Every task committed its own files, and this task has nothing to commit.

- [ ] **Step 4 (controller, not the implementer): visual check at 375px and 1280px, light and dark, with standalone emulated**

The executing controller does this step. It isn't dispatched to a subagent. As in PR C, the controller takes screenshots with a temporary Playwright spec, views them, and deletes the spec. Nothing from this step is committed.

**How standalone is emulated.** Chromium can't emulate `display-mode: standalone`. `Emulation.setEmulatedMedia` with a `display-mode` feature is accepted but has no effect; this was tested. Desktop Chromium's `env(safe-area-inset-*)` is 0 in any case. So the spec forces the two variables Task 1 derives from standalone, at an iPhone 16's insets. It injects this style before any page script runs, through `context.addInitScript`:

```css
:root { --safe-top: 47px !important; --safe-bottom: 34px !important; }
```

That drives everything standalone changes: the status band's height, `body`'s top padding, the sticky top bars' offset, the tab bar's bottom padding, the `(app)` layout's bottom padding, the drawer, the dialog, the toaster offset and the offline banner's offset. Only the install card reads `display-mode` itself, so it stays visible, which is wanted here.

**Contexts.**
- At 375px, each context uses an iPhone user agent with `hasTouch: true`. The install card then shows the iPhone copy, and Task 6's touch-only back-swipe is live.
- At 1280px, each context uses an Android-tablet user agent, so the card shows the Android copy.
- Service workers stay blocked (the suite default), so the skeleton shots can hold RSC requests with `page.route`. Only the offline-page test allows them.

1. Create `e2e/zz-visual.spec.ts`:

```ts
import { test, expect, type Browser, type BrowserContext, type Locator, type Page, type Route } from '@playwright/test'
import { STORAGE_STATE_PATH } from './global-setup'
import { localDateTimeString } from './local-date-time'

// Temporary: the controller's native-feel visual check. Delete this file after viewing the screenshots.
const OUT = process.env.VISUAL_OUT ?? 'test-results/visual'
const BASE_URL = 'http://localhost:3000'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const ANDROID_TABLET_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
// An iPhone 16's insets. Chromium can't emulate display-mode: standalone, so the variables
// Task 1 derives from it are forced instead; nothing else in the app reads display-mode
// except the install card, which stays visible here on purpose.
const STANDALONE_INSETS = ':root { --safe-top: 47px !important; --safe-bottom: 34px !important; }'

type Scheme = 'light' | 'dark'

async function openContext(
  browser: Browser,
  { width, scheme, standalone, serviceWorkers = 'block' }: { width: number; scheme: Scheme; standalone: boolean; serviceWorkers?: 'allow' | 'block' },
): Promise<BrowserContext> {
  const phone = width === 375
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: STORAGE_STATE_PATH,
    viewport: { width, height: phone ? 812 : 800 },
    colorScheme: scheme,
    userAgent: phone ? IPHONE_UA : ANDROID_TABLET_UA,
    hasTouch: phone,
    serviceWorkers,
  })
  if (standalone) {
    await context.addInitScript((css) => {
      const inject = () => {
        const style = document.createElement('style')
        style.textContent = css
        document.head.appendChild(style)
      }
      if (document.head) inject()
      else document.addEventListener('DOMContentLoaded', inject)
    }, STANDALONE_INSETS)
  }
  return context
}

// Waits out any running view transition (a route change or a skeleton-to-content reveal), so a
// shot shows the settled page rather than a crossfade between two snapshots.
async function settle(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .some((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition')),
      ),
    )
    .toBe(false)
}

async function createMarket(page: Page, title: string) {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
}

// Holds the navigation's RSC request (not the prefetches, which carry the skeleton) until the
// screenshot is taken, so the target route's loading.tsx is what's on screen. The pause before
// the click gives the visible links time to prefetch that skeleton.
async function shootSkeleton(page: Page, link: Locator, path: string, url: RegExp) {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  const hold = async (route: Route) => {
    const headers = route.request().headers()
    const isPrefetch = 'next-router-prefetch' in headers || 'next-router-segment-prefetch' in headers
    if (headers.rsc === '1' && !isPrefetch) await gate
    await route.continue()
  }
  await page.route('**/*', hold)
  await link.waitFor()
  await page.waitForTimeout(750)
  await link.click()
  await page.waitForTimeout(500)
  await page.screenshot({ path })
  release()
  await expect(page).toHaveURL(url)
  await page.unroute('**/*', hold)
}

// Starts a touch 5px from the left edge and drags it to toX without lifting the finger.
async function dragFromLeftEdge(page: Page, toX: number) {
  await page.evaluate((endX) => {
    const y = 420
    const target = document.elementFromPoint(5, y)!
    const touch = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y })
    const fire = (type: string, x: number) =>
      target.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          touches: [touch(x)],
          targetTouches: [touch(x)],
          changedTouches: [touch(x)],
        }),
      )
    fire('touchstart', 5)
    for (let x = 15; x <= endX; x += 10) fire('touchmove', x)
  }, toX)
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [375, 1280]) {
    test(`native feel at ${width}px, ${scheme}`, async ({ browser }) => {
      test.setTimeout(180_000)
      const shot = (name: string) => `${OUT}/${name}-${width}-${scheme}.png`
      const phone = width === 375

      const tab = await openContext(browser, { width, scheme, standalone: false })
      const tabPage = await tab.newPage()
      await tabPage.goto('/')
      await expect(tabPage.getByRole('heading', { level: 1 })).toBeVisible()
      await settle(tabPage)
      await tabPage.screenshot({ path: shot('home-browser-tab') })
      await tab.close()

      const context = await openContext(browser, { width, scheme, standalone: true })
      const page = await context.newPage()
      const primary = page.getByRole('navigation', { name: 'Primary' })

      await page.goto('/')
      await expect(page.getByRole('region', { name: 'Get the app' })).toBeVisible()
      await settle(page)
      await page.screenshot({ path: shot('home-standalone') })
      await page.screenshot({ path: shot('home-standalone-full'), fullPage: true })

      const title = `Visual native ${width} ${scheme}?`
      await createMarket(page, title)
      const marketUrl = page.url()
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await settle(page)
      await page.screenshot({ path: shot('market-standalone'), fullPage: true })

      if (phone) {
        await page.goto('/markets')
        await page.getByRole('link', { name: title }).click()
        await expect(page).toHaveURL(marketUrl)
        await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
        await settle(page)
        await dragFromLeftEdge(page, 150)
        await expect(page.locator('[data-swiping]')).toHaveCount(2)
        await page.screenshot({ path: shot('back-swipe-mid-drag') })
        await page.goto(marketUrl)
      }

      await page.goto('/leaderboard')
      await shootSkeleton(page, primary.getByRole('link', { name: 'Home', exact: true }), shot('skeleton-home'), /\/$/)
      await shootSkeleton(page, primary.getByRole('link', { name: 'Markets', exact: true }), shot('skeleton-markets'), /\/markets$/)
      await shootSkeleton(page, page.getByRole('link', { name: title }), shot('skeleton-market-detail'), /\/markets\/[0-9a-f-]+$/)
      await page.goto('/markets')
      await shootSkeleton(page, page.getByRole('link', { name: 'Create market' }), shot('skeleton-create-market'), /\/markets\/new$/)
      await shootSkeleton(page, primary.getByRole('link', { name: /^Parlays/ }), shot('skeleton-parlays'), /\/parlays$/)
      await shootSkeleton(page, primary.getByRole('link', { name: 'Tasks', exact: true }), shot('skeleton-tasks'), /\/tasks$/)
      await shootSkeleton(page, primary.getByRole('link', { name: 'Feed', exact: true }), shot('skeleton-feed'), /\/feed$/)
      await shootSkeleton(page, primary.getByRole('link', { name: 'Leaderboard', exact: true }), shot('skeleton-leaderboard'), /\/leaderboard$/)
      // The member page has no loading.tsx (its 404 must stay real); its activity list streams
      // in behind Suspense, which a held request can't show, so this is the loaded page.
      await page.getByRole('main').getByRole('link', { name: 'Alice' }).first().click()
      await expect(page).toHaveURL(/\/members\/[0-9a-f-]+$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Alice' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Recent activity' })).toBeVisible()
      await settle(page)
      await page.screenshot({ path: shot('member-page'), fullPage: true })

      await page.goto('/admin/invites')
      const sections = page.getByRole('navigation', { name: 'Admin sections' })
      for (const [label, path] of [['Tasks', 'tasks'], ['Members', 'members'], ['Ledger', 'ledger'], ['Invites', 'invites']] as const) {
        await shootSkeleton(page, sections.getByRole('link', { name: label, exact: true }), shot(`skeleton-admin-${path}`), new RegExp(`/admin/${path}$`))
      }

      await page.goto('/markets')
      await expect(page.getByRole('heading', { level: 1, name: 'Markets' })).toBeVisible()
      await settle(page)
      await context.setOffline(true)
      await expect(page.getByText('You’re offline — changes will send when you reconnect.')).toBeVisible()
      await page.screenshot({ path: shot('offline-banner') })
      await context.setOffline(false)
      await expect(page.getByText('You’re offline — changes will send when you reconnect.')).toBeHidden({ timeout: 10_000 })

      await context.close()
    })

    test(`offline page at ${width}px, ${scheme}`, async ({ browser }) => {
      const context = await openContext(browser, { width, scheme, standalone: true, serviceWorkers: 'allow' })
      const page = await context.newPage()
      await page.goto('/')
      await expect
        .poll(() =>
          page.evaluate(async () => {
            await navigator.serviceWorker.ready
            return Boolean(navigator.serviceWorker.controller)
          }),
        )
        .toBe(true)
      await context.setOffline(true)
      await page.goto('/markets')
      await expect(page.getByRole('heading', { level: 1, name: 'You’re offline' })).toBeVisible()
      await settle(page)
      await page.screenshot({ path: `${OUT}/offline-page-${width}-${scheme}.png` })
      await context.close()
    })
  }
}
```

How the helpers work:
- **`shootSkeleton`** holds only the *navigation's* RSC request. That's a request with `RSC: 1` and no prefetch header. Prefetches pass, because they carry the `loading.tsx` shell.
  - It waits 750ms before clicking, so the visible link has prefetched that shell.
  - If a shot shows the page being left instead of the target's skeleton, the prefetch hadn't landed. Raise the wait, or wait for the loading-state prefetch's response first, as `e2e/skeletons.spec.ts` does.
- **`settle`** polls until no `::view-transition` animation is running. Without it, a shot taken just after a navigation or a skeleton-to-content reveal catches the crossfade: two half-transparent snapshots on top of each other.
- **The member page** has no `loading.tsx`, so it has no route skeleton to hold: its 404 must stay real. Its activity list streams in behind `<Suspense>`, which a held request can't show, so the spec shoots the loaded page. The activity skeleton is covered by Task 4's tests.
- **`dragFromLeftEdge`** dispatches a touchstart 5px from the left edge, then touchmoves to 150px, and never lifts. Task 6 listens on `document`, so these synthetic events reach it; the spec waits for both `[data-swiping]` elements (backdrop and content) before the shot. The screenshot catches the gesture mid-drag, and the page is then reloaded to reset it. `e2e/back-swipe.spec.ts` uses CDP touches instead, because it also has to prove the passive and `touch-action` setup.

2. Run it on its own. Its global setup reseeds the database, and it spends no DC. It creates four markets, one per run.

```bash
lsof -ti:3000 | xargs -r kill 2>/dev/null
VISUAL_OUT="$SCRATCHPAD/nf-visual" npx playwright test e2e/zz-visual.spec.ts
```

(`$SCRATCHPAD` is the controller's scratchpad directory. Leave `VISUAL_OUT` unset to write under the git-ignored `test-results/visual/`.)

Expected: 8 passed. Each 375px "native feel" run writes 19 PNGs, and each 1280px run writes 18; the back-swipe shot is phone-only. Each offline-page run writes 1. That's 78 PNGs in total.

3. View every PNG and check each item below.

   **Status band and insets** (`home-standalone`, `home-standalone-full`, `market-standalone`, versus `home-browser-tab`):
   - In standalone, a solid `#03272d` band 47px tall sits at the very top, in both themes. The top bar sits directly under it, with nothing hidden beneath it.
   - The phone tab bar's labels clear the bottom 34px. The last content on a full-page shot clears the tab bar.
   - In the browser-tab shot there's no band and no extra padding: it matches `main` before this PR.
   - At 1280px the desktop top bar sits under the band. That's the desktop installed-app case.

   **Back-swipe** (`back-swipe-mid-drag`, 375px only):
   - The page content has moved right with the finger, about 145px, over a dimmed backdrop.
   - The top bar, the status band and the tab bar haven't moved.

   **Skeletons** (`skeleton-*`, 12 per run):
   - Home, markets, market detail, create market, parlays, tasks, feed, leaderboard, and admin invites / tasks / members / ledger.
   - Each shows the *target* route's skeleton, and its blocks sit where the real page's cards and rows land.
   - The chrome stays put. The shimmer is visible in both themes (the `sunk` token).
   - `member-page` shows the loaded profile, with its header and activity in place under the chrome.

   **Offline** (`offline-banner`, `offline-page`):
   - The banner reads "You’re offline — changes will send when you reconnect." with the wifi-off icon. It's in gold tokens, full width, directly under the top bar, and below the status band in standalone.
   - The offline page: a card with "You’re offline", the body copy and a full-width "Try again" at 375px (auto width at 1280px). It renders styled, with the Manrope font, while offline. That proves the worker cached its CSS and font.

   **Install card** (`home-standalone`, `home-browser-tab`):
   - "Get the app" sits under the tiles, with the phone icon, the platform copy (iPhone at 375px, Android at 1280px) and a 44px "Not now".
   - It's tokens only, in both themes, and doesn't cause sideways scroll at 375px.

   **Everywhere:**
   - every control is at least 44px
   - focus rings are visible
   - no sideways scroll at 375px (compare each full-page shot's width with the viewport)

4. Delete `e2e/zz-visual.spec.ts` (and the PNGs, if they went under `test-results/visual/`). Run `git status` and confirm the tree is clean.
5. Record every mismatch as a final-review finding.

- [ ] **Step 5 (the user, after deploy): real-device checklist**

These can't be checked in a desktop browser. Hand this list to the user with the PR. Install from `https://www.dwellduel.com` on one iPhone (Safari: Share → Add to Home Screen) and one Android phone (Chrome: menu → Install app). Then confirm:

1. **Full-screen launch and splash.** Opening from the home-screen icon shows the teal splash with the DwellDuel symbol (iPhone), then the app with no browser bars.
2. **Status band.** On iPhone, the time and battery sit on the dark teal band, in light and dark themes. The top bar sits directly below it, and nothing hides under the notch or the Dynamic Island.
3. **Home indicator.** The tab bar clears the home indicator, and so do the "Slip (n)" button and the open slip drawer on a market page.
4. **Back-swipe feel.** On a market, a profile, Create market and an admin section:
   - a drag from the left edge moves the page with your finger
   - past a third of the width, or with a flick, it goes back
   - a short drag springs back
   - scrolling vertically near the edge never triggers it
   - On a deep link (open a market from a shared link, then swipe), it lands on Markets.
5. **No pull-to-refresh.** Pulling down at the top of a page does nothing on Android. On iPhone, the bounce shows the page colour, not white.
6. **No browser feel.** Tapping controls shows no grey flash. Long-pressing a tab, a button or a card shows no callout menu. Text in bets, the feed and task descriptions can still be selected.
7. **Live updates between two phones.** With both phones signed in as different members, on the same market:
   - a bet placed on one shows on the other within about a second, without touching it
   - the other phone's pool and percentages update, and so does its balance in the top bar
8. **Offline.**
   - In airplane mode, tapping between tabs shows the skeletons and the banner "You’re offline — changes will send when you reconnect."
   - Pulling the app from the app switcher and reopening it shows the "You’re offline" page.
   - Turning airplane mode off and tapping "Try again" loads the page.
   - An "I did this" tapped while offline goes through once you're back online, exactly once.
9. **Install card.** In a normal browser tab, Home shows "Get the app" with the right copy for each phone. "Not now" hides it for good. It never shows in the installed app.
10. **Haptics (Android only).** A short buzz on each tab-bar tap and on "Add to parlay". A double buzz on placing a bet or a parlay, and on approving a submission. A stronger double buzz when an inline error appears. iPhone: none of these buzz, which is expected.
11. **Shortcuts (Android).** Long-pressing the home-screen icon offers "Markets" and "My slip", and each opens the right page. iOS ignores manifest shortcuts, so the iPhone shows none.

Items 1, 2, 4, 5 and 7 are the spec's real-device check. Items 3, 6 and 8 to 11 cover what this PR adds that no desktop check can prove.

---


## Self-Review

**Spec coverage:**
- **Home-screen shell** → Task 1:
  - manifest with `id`, `scope` and shortcuts
  - `appleWebApp` black-translucent
  - `viewportFit: 'cover'` and `interactiveWidget: 'resizes-content'`
  - the status band
  - splash screens ✓
- **Edge to edge (safe areas on top bar, tab bar, layout, drawer, dialog, toasts)** → Task 2 ✓
- **No browser feel (overscroll, tap highlight, `touch-action`, callouts on chrome, press states)** → Task 2 ✓
- **Skeletons on every route; member page streams and keeps its 404; signed-out 307 in the proxy; UUID guard** → Tasks 3 and 4 ✓
- **Transitions (drill-down slide, tab crossfade, anchored chrome, reduced motion); link pending hints** → Task 5 ✓
- **Back-swipe (finger-following, a third of the width or a 0.5 px/ms flick, in-app back or logical parent, vertical cancel, touch-only)** → Task 6 ✓
- **Optimistic slip and "I did this"; money actions untouched** → Task 7 ✓
- **Live updates (publication migration, debounced refresh, reconnect catch-up)** → Task 8 ✓
- **Offline (`useOffline`, banner, service worker, `/offline` page)** → Task 9 ✓
- **Install card and Android haptics** → Task 10 ✓
- **Home-screen shortcuts** → Task 1's manifest ✓
- **The spec's testing list** → e2e checks for:
  - the manifest (Task 1)
  - the signed-out 307 (Task 3)
  - the skeleton (Task 4)
  - back-swipe (Task 6)
  - the optimistic flip (Task 7)
  - offline (Task 9)
  
  Plus unit, jsdom and DB tests in every task, and the controller visual check and the user's real-device checklist in Task 11 ✓

**New copy for sign-off:**
- **Offline:** "You're offline — changes will send when you reconnect." / "You're offline" / "DwellDuel needs a connection for this page. It'll load as soon as you're back online." / "Try again"
- **Install card:** "Get the app" / "Tap Share, then Add to Home Screen." / "Open the menu, then Install app." / "Not now"
- **Shortcuts:** "Markets" / "My slip"

**Placeholder scan:** none. An integration pass applied every task to a fresh `main` and proved the full chain green (vitest 731, Playwright 24). The tasks hold exactly the code that passed.

**Type consistency:** the fixed interfaces were checked in one integrated tree:
- `--safe-top` / `--safe-bottom` / `--status-band`
- `Skeleton`
- the `page-transition` wrappers
- `useNavDepth` / `NavDepthTracker`
- `backSwipeDecision` / `logicalParent` / `BackSwipe`
- `SlipCountProvider` / `useSlipCount` and `MarketSlipProvider`
- `LiveRefresh`
- `haptics`
