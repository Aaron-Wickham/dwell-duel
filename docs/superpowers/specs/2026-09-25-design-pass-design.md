# Design Pass — design

**Date:** 2026-09-25
**Status:** approved, not yet implemented
**Sub-project 7 of 7** in the DwellDuel build order. Every earlier spec used
plain, minimally styled markup and deferred visual design to this pass.

## Source of truth

- **Visual spec:** [`docs/design/app-redesign-handoff.md`](../../design/app-redesign-handoff.md).
  It was written by the mockup session and covers the screen → route map,
  brand, the light and dark tokens, sizing and accessibility, navigation,
  components, chart data, libraries, copy, and the original build order.
  Where this document and the handoff differ, **this document wins**. The
  decisions below amend the handoff.
- **Mockup:** the Claude Design canvas at
  <https://claude.ai/artifact/DkowpVq9ZMm7Gn9rL4cTqw>. Every screen is drawn
  at phone (375px) and desktop (1280px), in light and dark. Read an
  artboard with the Artifact tool's `read` action at
  `project/<Screen>--<phone|desktop>-<light|dark>.dc.html`. Shared
  components are at `project/<TopBar|TabBar|ProbabilityChart|MarketCard|OutcomeRow|SlipPick>.dc.html`.
  The markup is a visual spec with inline styles, not code to paste.
- **Brand assets:** the logo pack at `~/Documents/DwellDuel Logo Pack/`. Its
  `web/` and `svg/` files are copied into the repo (see PR A).

## Goal

A fully responsive, phone-first redesign of every screen. It has to work
well at both phone and desktop widths, with:
- a deliberately designed light theme and dark theme, plus a toggle
- one shared navigation
- the DwellDuel wordmark
- accessible controls throughout

It changes no data, no access rules and no money logic, with one read-only
addition: the probability chart.

## Non-goals

- New features beyond what the mockup shows. The probability chart, empty
  states and 404 page are in scope; nothing else is.
- Changes to the database schema, access policies or any coin-moving
  function. The chart reads existing `bets` rows.
- A native mobile app. The logo pack's iOS and Android icons are unused
  apart from the web manifest.

## Decisions that amend the handoff

1. **Native form controls stay native.**
   - `<select>` (bet outcome, resolve outcome) and `<input type="checkbox">`
     (bulk approve) stay real HTML elements and are styled with CSS.
   - Base UI is used only for Dialog, Drawer and ToggleGroup. This matches
     the mockup, which draws native selects and checkboxes, and keeps the
     e2e tests valid:
     - Playwright's `selectOption` only works on a real `<select>`.
     - The bulk-approve form relies on the HTML `form` attribute on
       `<input name="completionIds">`.
   - The Base UI package is `@base-ui/react` (1.8.x). The old
     `@base-ui-components/react` name is deprecated.
2. **One e2e selector is updated.** The redesigned outcome row is no longer
   an `<li>` whose text starts "Yes —".
   - `e2e/parlays.spec.ts` locates "Add to parlay" by scoping to the outcome
     row that contains the outcome's name. Its asserted strings don't
     change.
   - Every other e2e string and role stays exactly as it is.
3. **Signed-in pages move into an `app/(app)/` route group.**
   - That group's layout renders the shared `AppNav`, including the
     balance and the slip count, once per request.
   - `app/(auth)/` (sign-in, not-invited) gets no navigation.
   - URLs don't change: route groups don't appear in paths.
4. **The theme follows the system until the member chooses.**
   - A `theme` cookie (`light` | `dark`) is read on the server in the root
     layout and set as `data-theme` on `<html>`, so there's no flash on load.
   - With no cookie, `data-theme` is omitted and a
     `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`
     block applies the dark tokens.
   - The toggle is a server action that writes the cookie.
   - The Tailwind `dark` variant matches both an explicit
     `data-theme="dark"` and the system-dark fallback.
5. **Chart series grow from 4 to 6 colors,** because multiple-choice
   markets allow up to 6 outcomes. The contrast ratios below were
   computed.

   | Token | Light | Contrast on light bg / surface | Dark | Contrast on dark bg / surface / sunk |
   |---|---|---|---|---|
   | `--s5` | `#7B3FA8` | 6.18 / 6.60 | `#D2A8FF` | 9.15 / 7.98 / 6.86 |
   | `--s6` | `#B0306F` | 5.51 / 5.88 | `#FF8FC4` | 8.46 / 7.38 / 6.35 |

   Every series color is readable as text (≥ 4.5:1) on every background it
   appears on. That matters because the chart's end-of-line labels are
   drawn in the series color.
6. **All of the handoff's new copy is approved as written:**
   - "Insufficient balance — you have {n} DC. Try a smaller amount."
     This uses the member's real balance. `120` was mockup sample data.
   - "Add at least one more pick to place a parlay."
   - "Remove the pick that's no longer available to place this parlay."
   - "Your slip is empty."
   - "Awaiting resolution"
   - "Winning outcome: {x}"
   - "Add a reason — it's shown in the ledger next to this adjustment."
   - "Page not found" / "This page wandered off…"
   - The tagline "Friendly bets. Faithful study."
7. **Friendly error copy maps from Postgres errors in the server actions.**
   - An insufficient-balance failure is the `profiles_balance_check`
     violation, code `23514`. It becomes the insufficient-balance copy
     above.
   - Every other error keeps its current message.
8. **Removed dependencies:** `vaul` and `@radix-ui/react-dialog`. Both are
   installed today, and neither is imported anywhere.
9. **Correction to the handoff.** No e2e test currently asserts
   "Parlays (2)". The visually hidden " (n)" in the Parlays nav link is still
   kept, because it gives the link a sensible accessible name.

## Build: three PRs

Each PR is its own plan, executed with subagent-driven development in an
isolated worktree and merged before the next one starts. Each ends with
lint, the full Vitest suite, the build, and the full Playwright suite
passing, including a run on the pinned CLI (`supabase@2.115.0`).

### PR A — Foundation

Covers handoff build steps 1–3.
- **Tokens and theme:**
  - the tokens, with `--s5` and `--s6` added, in `app/globals.css` using
    Tailwind v4 `@theme`
  - the system-dark fallback, the `dark` custom variant, and a
    `:focus-visible` ring
- **Type:** Manrope (400–800) via `next/font/google`. It replaces Geist,
  and fixes the starter stylesheet's forced `font-family: Arial`.
- **Theme toggle:** the cookie is read in the root layout, and a server
  action writes it.
- **Brand:**
  - a `Wordmark` component using the symbol SVG and "DWELL" + "DUEL" in the
    brand colors
  - favicons, the web manifest and the OG image copied from the logo
    pack's `web/` folder into `public/`, plus the pack's `<head>` metadata
    in the root layout
- **Layout:** the `app/(app)/` route group with its layout and `AppNav`:
  - desktop: the top bar
  - phone: the top bar plus the bottom tab bar
  - an active-item pill, the balance chip, admin entry (admins only), and
    the slip count

  This replaces every page's own link row.
- **Primitives:** Button (primary, secondary, danger, quiet; md 48px and
  sm 44px) built with `class-variance-authority`, Field (label, hint,
  inline error), Card, StatusChip, and Message (error, ok, gold).
- **Existing pages:** they render inside the new layout, but their bodies
  aren't restyled until PR B.

### PR B — Screens

Covers handoff build step 4.
- Every route is restyled to its artboards, in this order:
  auth → home → markets → market detail → parlays →
  tasks / feed / leaderboard / profile → admin → 404.
- The empty state of every list.
- A new `app/not-found.tsx`.
- The approved copy, including the insufficient-balance mapping.
- The e2e selector update (decision 2).
- Charts are omitted from market pages and cards until PR C.
- **Carried from PR A:**
  - **`Field` doesn't wire its own ARIA.** `Field` renders `{id}-hint` and `{id}-error` but leaves `aria-describedby` and `aria-invalid` on the control to the caller. Every `Field` call site must wire both, or a small helper can be added once real call sites exist.
  - **The balance can disagree with itself.** The nav's balance chip refreshes only on a hard load, on the member's own money or slip actions, and when the tab becomes visible again. It does not refresh on client navigation, so a balance shown in a page body can briefly disagree with the chip after an admin's action. The home page still shows its hero balance: the mockup and `e2e/foundation.spec.ts` both need it. The brief mismatch after someone else changes a member's balance is an accepted limitation. (This is ruled on in the PR B plan.)
  - **`Message tone="gold"` shouldn't always be a live region.** Used for static text like "Awaiting resolution", it shouldn't be `role="status"`.
  - **The phone top bar is tight at 375px.**
    - A 4-digit admin balance fits.
    - A 5-digit one overflows by about 6px.
    - Check it in the per-screen 375px pass.
  - **`env(safe-area-inset-bottom)` does nothing yet.** It has no effect without `viewport-fit=cover`. Either enable cover, adding top-inset padding to the top bar, or drop the `env()` calls.
  - **The balance is fetched twice on home.** The `(app)` layout and the home page each fetch it.

### PR C — Charts and polish

Covers handoff build steps 5–6.
- **`ProbabilityChart`:**
  - Recharts v3 via the shadcn/ui `chart` wrapper, copied in as a file
    (no shadcn CLI setup is needed)
  - one `stepAfter` line per outcome, with a crosshair tooltip and
    end-of-line labels
  - the 1D / 1W / All ranges, hidden when there's only one
  - closed-market shading ("Closed {date}" / "Resolved: {outcome}")
  - a no-bets state
- **Chart data:** each outcome's pool share, recomputed after each bet
  from that market's `bets` rows in time order. The data comes from
  existing tables, which invited members can already read.
- **Where the chart appears:** on market detail and, in compact form, on
  `MarketCard`. The markets list reads bets for the listed markets in one
  query. That's fine at today's size, and the speed/scale PR after PR C
  adds limits.
- **Polish:**
  - NumberFlow for odds, balances and payouts.
  - **`sonner` toasts** confirm successful actions that don't navigate:
    - bet placed
    - pick added or removed
    - task submitted
    - completion approved or rejected
    - invite added
    - balance adjusted
    - market resolved or voided

    Errors stay inline next to their form, as in PR B.
  - **The Base UI Drawer** becomes a phone bet-slip drawer. On market
    pages at phone width, a "Slip (n)" button opens a bottom drawer
    holding the member's picks, the stake field and "Place parlay". This
    lets members build and place a parlay without leaving the market.
    Desktop keeps `/parlays`.
  - **The Base UI Dialog** confirms "Void this market": "Void this
    market? Every bet and parlay leg is refunded. This can't be undone."
    with Cancel / Void market.
  - **Base UI ToggleGroup** provides the chart's 1D / 1W / All range
    control.
- **Cleanup:** removing `vaul` and `@radix-ui/react-dialog`.

## Testing

- **E2E:** every existing assertion keeps passing, with the one selector
  change from decision 2. Each PR adds e2e checks for what it introduces:
  - **PR A:** the nav's destinations are reachable on phone and desktop
    widths, and the theme toggle persists across a reload.
  - **PR B:** the 404 page and an empty state render.
  - **PR C:** a market page with bets renders its chart.
- **Unit tests:**
  - the theme-cookie resolution
  - the chart's pool-share series builder, a pure function over time-ordered
    bets that gets exact expected series
  - the Postgres-error → friendly-copy mapping
- **Accessibility checks, per screen in both themes:**
  - every control is ≥ 44px
  - focus rings are visible
  - icon-only buttons have `aria-label`s
  - no clickable `div`s
- **Visual check:** each screen compared by eye against its artboards at
  375px and 1280px, in light and dark, in the built-in browser.
