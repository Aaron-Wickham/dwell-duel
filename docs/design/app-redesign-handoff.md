# App design — the visual source of truth

How DwellDuel looks and behaves, as built. It started as the handoff from
the approved mockup (v0.2) and is kept up to date with the app: when a
change alters a screen, a token or a component's behaviour, update this
doc in the same PR. Where the mockup and the app differ, the app and this
doc win; new designs are drawn on the canvas and approved before they're
built.

The mockup is a Design canvas:
**https://claude.ai/artifact/DkowpVq9ZMm7Gn9rL4cTqw**

- **Pages:** Light, Dark, Components, System.
- **Screens:** every screen and state is drawn at phone (375px) and desktop (1280px) width, in both themes.
- **Reading it from Claude Code:** use the Artifact tool's `read` action with that URL. Each artboard is `project/<Screen>--<size>-<theme>.dc.html`, and the shared pieces are `project/<Component>.dc.html`. Treat the markup as a visual spec, not code to paste. It's a mockup format with inline styles, not React.

## Screen → route map

| Artboards | Route |
|---|---|
| SignIn, NotInvited | `app/(auth)/sign-in`, `app/(auth)/not-invited` |
| Home | `app/(app)/(home)/page.tsx` |
| Markets | `app/(app)/markets/(list)` |
| CreateMarket | `app/(app)/markets/new` |
| Market (open, creator), MarketFull (slip full), MarketResolved (admin override) | `app/(app)/markets/[id]` |
| MyBets (solo bets and parlays, Open · Settled · Cancelled) | `app/(app)/bets` (`/parlays` redirects here) |
| Settings | `app/(app)/settings` |
| Launch (System page: launch animation frames) | `components/brand/launch-screen.tsx` |
| Tasks | `app/(app)/tasks` |
| Feed | `app/(app)/feed` |
| Leaderboard | `app/(app)/leaderboard` |
| Profile | `app/(app)/members/[id]` |
| AdminInvites / AdminTasks / AdminMembers / AdminLedger | `app/(app)/admin/(sections)/*` |
| (no artboard; built like AdminTasks' queue) AdminMarkets: closed markets with no result, oldest first | `app/(app)/admin/(sections)/markets` |
| (no artboard) one member's Admin page | `app/(app)/admin/members/[id]` |
| (no artboard) Parlay breakdown, How it works, Edit profile | `app/(app)/parlays/[id]`, `app/(app)/how-it-works`, `app/(app)/profile` |
| NotFound | `app/(app)/[...missing]` inside the app shell, `app/not-found.tsx` signed out |
| EmptyStates | the empty branch of every list |

## Brand

- **Where the brand lives in the repo:** the symbol's art is `components/brand/symbol-paths.ts`, drawn by `components/brand/wordmark.tsx`; the favicons, app icons and social image are in `public/` (`favicon.svg`, `favicon-*.png`, `apple-touch-icon-180.png`, `android-chrome-*.png`, `maskable-512.png`, `og-image-1200x630.png`) and the iOS launch screens in `public/splash/`. `scripts/generate-favicons.mjs` and `scripts/generate-splash.mjs` rebuild them from `symbol-paths.ts`. The original logo pack is Aaron's; ask him for it.
- **Wordmark:**
  - The symbol: the D is `--sym-d` (`#03272D` on light, `#FFFFFF` on dark); the leaves are always lime `#72DB2B`.
  - Text "DWELLDUEL" in Manrope ExtraBold, uppercase, `-0.03em` tracking.
  - "DWELL" is `--wm-a` and "DUEL" is `--wm-b` (`#3FAE14` on light, `#72DB2B` on dark).
- **Font:** Manrope (400–800) via `next/font/google`, for the whole UI.

## Tokens (Tailwind v4, `app/globals.css`)

Theme is `data-theme` on `<html>`. It follows `prefers-color-scheme` until the member picks Light or Dark in Settings, which persists the choice in a cookie read by the root layout, so there's no flash on load. Choosing System clears it.

`app/globals.css` is the only place colours are defined, and it's the
source of truth for their values: `:root` for light, `[data-theme="dark"]`
(and the system preference when no choice is saved) for dark. Markup uses
them through Tailwind utilities (`bg-surface`, `text-ink2`, `border-line`),
never a raw colour. The groups:

| Tokens | For |
|---|---|
| `--bg`, `--surface`, `--sunk` | the page, cards, and sunken panels and hover tints |
| `--ink`, `--ink2`, `--line`, `--line-s` | text, secondary text, hairlines, stronger borders |
| `--primary`, `--on-primary`, `--lime`, `--on-lime`, `--link`, `--focus` | buttons, the lime accent and what sits on it, links, focus rings |
| `--acc-soft`, `--acc-text`, `--win`, `--win-soft`, `--loss`, `--loss-soft`, `--gold`, `--gold-soft` | chips, wins, losses and warnings |
| `--hero`, `--on-hero`, `--hero-2`, `--hero-num`, `--hero-inset` | Home's balance hero |
| `--s1` … `--s6` | chart series, one per outcome |
| `--wm-a`, `--wm-b`, `--sym-d`, `--splash`, `--on-splash`, `--status-band` | the wordmark, the launch screen and the iOS status bar |
| `--shadow`, `--overlay-shadow`, `--lift-shadow`, `--scrim` | cards, dialogs, hover lift, the dialog backdrop |
| `--safe-top`, `--safe-bottom` | the iPhone's safe areas, non-zero only in the installed app |
| `--ease-*`, `--duration-*` | motion, in the `@theme static` block (mirrored by `lib/ui/motion.ts`) |

Every text pairing passes WCAG AA in both themes; check a new one before using it.

**Lime is never used as text on the light background.** It appears only as a fill behind teal text (active tab, count badges, rank badges).

## Sizing and accessibility

- **Targets:** every control is at least 44px tall. Primary buttons are 48px and compact ones 44px.
- **Focus:** every control gets a visible ring: `:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px }`.
- **Corner radii:** cards 18px, buttons and inputs 12px, chips fully rounded (999px).
- **Page padding:** 16px on phone, 80px on desktop with a 1120px max content width.
- **Page widths:** `<Page width>` picks one of two centred columns, and the page's header, tabs and content always share its edges, so nothing is left-pinned with empty space on the right. See *Desktop layouts* below.
- **Type sizes (px):**

| Element | Phone | Desktop | Weight |
|---|---|---|---|
| H1 | 28 | 40 | 800 |
| H2 | 19 | 21 | 800 |
| Row title (`rowTitleClass`: a tile, task or leaderboard row) | 17 | 17 | 800 |
| Body | 16 | 16 | normal |
| Caption | 14 | 14 | normal |

- **Real elements only:** `<button>`, `<a>`, and `<label>` paired with its input. No clickable divs.
- **Icon-only buttons** get an `aria-label`.
- **Press and hover (#153):** every control shrinks to 97% on press. Under a mouse (not on touch), buttons, chips, tabs and nav items grow to 103% and change colour; tappable cards lift 2px onto a shadow instead (`hover-lift`). A row or tile inside a card, such as a leaderboard row, a podium place, a member on Admin › Members or a home tile below `lg:`, never lifts: it sits on a flat `--sunk` tint (`hover-tint`), since a card floating inside a card reads as a button inside a button (#244). Reduced motion keeps the colour changes (and the lift's shadow) and drops the movement. Curves and durations come from the motion tokens in `globals.css`.
- **Section cards:** a `SectionCard`'s `description` slot puts a caption line right under its heading (the weekly recap's date range); the card's body follows at the usual gap.
- **Sliding pills:** the desktop nav's, the phone tab bar's and the sub-tabs' active pill all slide to the new tab the same way: 280ms on the iOS curve. On the tab bar the new tab's icon pops (to 118% and back) over the same 280ms, and its label's weight eases from bold to extrabold.

## Desktop layouts (#158)

Phone layouts are single columns and don't change. From `lg:` (1024px) each page uses its column like this:

| Page | Width | At `lg:` |
|---|---|---|
| Markets | wide | Three columns of market cards. |
| Market | wide | Chart and outcomes (7fr) beside betting, resolution and the rest (5fr). |
| Leaderboard | wide | Podium across the top. This month: rankings (7fr) beside the race chart, the awards as a 2×2 grid and past champions (5fr). Net worth: rankings (7fr) beside a "Your standing" card (5fr); on a phone that card is hidden, and a compact standing card with Jump to me sits above the list instead. |
| Feed | reading | One centred stream. |
| My bets | wide | Open, Settled and Cancelled show bets as cards in three columns (a solo bet's status sits at the bottom of its card); Coins stays a list. |
| Member | wide | Photo, name, bio and a two-column Stats card (5fr) beside Recent activity (7fr). |
| Edit profile | wide | Photo and a live preview of the profile (5fr) beside name, bio and Save (7fr). |
| Settings | wide | Two columns of section cards: Appearance, Profile, Haptics & motion; then Notifications, Help, Account. |
| How it works | reading | A sticky contents list (200px) beside the rules (about 68 characters a line). |
| Create market | wide | The form (7fr) beside a live preview of its market card (5fr). |
| Parlay | wide | Picks (7fr) beside the summary and How it adds up (5fr). |
| Admin › Members | wide | A card per member in three columns. |

- **wide** is `max-w-[1280px]`: a 1120px content column inside the 80px padding.
- **reading** is `max-w-[980px]`: about 820px of content, centred, for a single stream or long text.
- Side-by-side columns are `minmax(0,7fr)` / `minmax(0,5fr)` (or the reverse), `items-start`, so each card is as tall as its content. Where the phone order differs from the columns, the grid places items (`lg:col-start-*`, `lg:row-start-*`) rather than reordering the markup.
- A route's `loading.tsx` skeleton follows the same width and columns.

## Navigation (one `<AppNav>` in the signed-in layout)

- **There's no Home tab.** The wordmark links home and is marked current there.
- **Desktop:** a 72px top bar with the wordmark, then Markets, My bets, Tasks, Feed and Leaderboard, a divider, then Admin (reviewers and above). On the right: the balance chip (a link to My bets) and your avatar (a link to your profile). The active item is a filled pill.
- **Phone:**
  - Top bar (64px): wordmark, balance chip, an Admin shield icon (reviewers and above), avatar.
- **Admin** opens the first section the role can see: Tasks (the approval queue) for a reviewer, Invites for an admin or the owner. It carries a red count of what waits on the viewer: other members' task submissions (reviewers and above) and closed markets with no result (admins and above), and the Tasks and Markets tabs show their share of it. Inside Admin, the sections are a `SubNav` (Invites, Tasks, Markets, Members, Ledger, each shown by role); a reviewer, with only Tasks, gets no tabs.
  - Bottom tab bar with 5 tabs: Markets, Bets, Tasks, Feed, Leaders. Bets has `aria-label="My bets"`; Leaders has `aria-label="Leaderboard"`.
- **The slip** is its own floating button (`SlipSheet`), not a tab badge.

## Components (Components page on the canvas)

| Component | Props (see each artboard's `renderVals`) | Build with |
|---|---|---|
| `AppNav` (TopBar + TabBar) | size, theme, current tab | lucide-react icons, motion `layoutId` for the active pill |
| `ProbabilityChart` (the market page only, loaded lazily) | per range: one series per outcome, with times | Recharts v3 through `components/ui/chart.tsx` (adapted from shadcn/ui's chart and copied in): one `<Line type="stepAfter">` per outcome, a crosshair tooltip, and end-of-line labels showing name and % |
| `MarketCard` | market, sparkline, outcomes with % and weekly change | `MarketSparkline` (`components/markets/market-sparkline.tsx`): the same window and colours as `ProbabilityChart`, drawn as plain SVG so the list server-renders it and ships no chart library |
| `OutcomeRow` | label, % and pool, bar, payout multiplier, state `add` / `inslip` / `disabled` / `none`, winner | Button variants with cva |
| `SlipPick` | market, outcome, odds or stale | — |

The shared primitives are in `components/ui/`: Button (primary / secondary / danger / quiet; md and sm), Field (label, hint and inline error), StatusChip, Card, Message (error / ok / gold), `SectionCard`, `EmptyState`, `SubNav`, `ShowMore`, `SearchField`, `FilterChips`, the confirm dialogs and the skeletons. Every repeated piece comes from these.

### Chart data

- **Data points:** an outcome's chance at a moment is its share of the pool with the seed counted (`effectivePools`), so a new market starts at an even split. SQL samples the series, so no page reads every bet: `market_sparklines` gives the market page's chart 200 points (`lib/markets/chart-series.ts`), and `market_sparks` gives each card at most 24 compact points, cached per list in Next's data cache and keyed by its markets' pool versions (`lib/markets/sparklines.ts`). Both prepend the seeded opening split (`withSeededStart`).
- **Ranges:** 1D, 1W and All, each offered only when the data spans it; hide the range buttons when there's only one.
- **Closed markets:** shade the area after the close time and label it "Closed {date}" or "Resolved: {outcome}".
- **No bets:** "No bets were placed on this market."

## History

The mockup's library plan (Recharts, NumberFlow, Base UI in place of vaul and Radix), its copy sign-offs and its suggested build order were all done by v0.2.0-beta. They're in git history and in `docs/archive/` if you need the detail.
