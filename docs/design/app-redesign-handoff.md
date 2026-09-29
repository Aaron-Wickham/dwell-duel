# App redesign — handoff from the mockup

The approved mockup is a Design canvas:
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
| AdminInvites / AdminTasks / AdminMembers / AdminLedger | `app/(app)/admin/*` |
| NotFound | `app/not-found.tsx` |
| EmptyStates | the empty branch of every list |

## Brand

- **Logo pack:** `/Users/aaronwickham/Documents/DwellDuel Logo Pack/` (see its README for the favicon `<head>` snippet and usage rules).
- **Wordmark:**
  - Symbol from `svg/dwellduel-symbol.svg`. The D is `#03272D` on light and `#FFFFFF` on dark; the leaves are always `#72DB2B`.
  - Text "DWELLDUEL" in Manrope ExtraBold, uppercase, `-0.03em` tracking.
  - "DUEL" is `#3FAE14` on light and `#72DB2B` on dark.
- **Font:** Manrope (400–800) via `next/font/google`, for the whole UI.

## Tokens (Tailwind v4, `app/globals.css`)

Theme is `data-theme` on `<html>`. It follows `prefers-color-scheme` until the member picks Light or Dark in Settings, which persists the choice in a cookie read by the root layout, so there's no flash on load. Choosing System clears it.

```css
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

:root {
  --bg: #F3F6F1; --surface: #FCFDFB; --sunk: #E6EDE6;
  --ink: #03272D; --ink2: #46605E; --line: #D5DFD8; --line-s: #7A8F8B;
  --primary: #03272D; --on-primary: #FFFFFF; --lime: #72DB2B; --link: #03272D;
  --acc-soft: #E3F4D5; --acc-text: #2A6E0B;
  --gold: #855600; --gold-soft: #F6E7C4;
  --win: #2A6E0B; --loss: #A8281C; --loss-soft: #FAE1DD;
  --focus: #03272D; --hero: #E3F4D5;
  --s1: #03272D; --s2: #2A6E0B; --s3: #855600; --s4: #3155B8; /* chart series */
}
[data-theme="dark"] {
  --bg: #021B1F; --surface: #07282E; --sunk: #0D343B;
  --ink: #EAF4EE; --ink2: #A3BDB8; --line: #17434A; --line-s: #5E8883;
  --primary: #72DB2B; --on-primary: #03272D; --link: #8BE651;
  --acc-soft: #143A1E; --acc-text: #8BE651;
  --gold: #F0C15A; --gold-soft: #3A2E14;
  --win: #8BE651; --loss: #FF9585; --loss-soft: #3D1C17;
  --focus: #72DB2B; --hero: #0D3A41;
  --s1: #EAF4EE; --s2: #8BE651; --s3: #F0C15A; --s4: #9DB0FF;
}
```

Every text pairing above passes WCAG AA; I checked them with a script.

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
| Body | 16 | 16 | normal |
| Caption | 14 | 14 | normal |

- **Real elements only:** `<button>`, `<a>`, and `<label>` paired with its input. No clickable divs.
- **Icon-only buttons** get an `aria-label`.
- **Press and hover (#153):** every control shrinks to 97% on press. Under a mouse (not on touch), buttons, chips, tabs and nav items grow to 103% and change colour; tappable cards and rows lift 2px onto a shadow instead. Reduced motion keeps the colour changes (and the lift's shadow) and drops the movement. Curves and durations come from the motion tokens in `globals.css`.
- **Sliding pills:** the desktop nav's, the phone tab bar's and the sub-tabs' active pill all slide to the new tab the same way: 280ms on the iOS curve. On the tab bar the new tab's icon pops (to 118% and back) over the same 280ms, and its label's weight eases from bold to extrabold.

## Desktop layouts (#158)

Phone layouts are single columns and don't change. From `lg:` (1024px) each page uses its column like this:

| Page | Width | At `lg:` |
|---|---|---|
| Markets | wide | Three columns of market cards. |
| Market | wide | Chart and outcomes (7fr) beside betting, resolution and the rest (5fr). |
| Leaderboard | wide | Podium across the top. This month: rankings (7fr) beside the race chart, the awards as a 2×2 grid and past champions (5fr). Net worth: podium and rankings at full width. |
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
- **Desktop:** a 72px top bar with the wordmark, then Markets, My bets, Tasks, Feed and Leaderboard, a divider, then Admin (admins only). On the right: the balance chip (a link to My bets) and your avatar (a link to your profile). The active item is a filled pill.
- **Phone:**
  - Top bar (64px): wordmark, balance chip, an Admin shield icon (admins only), avatar.
  - Bottom tab bar with 5 tabs: Markets, Bets, Tasks, Feed, Leaders. Bets has `aria-label="My bets"`; Leaders has `aria-label="Leaderboard"`.
- **The slip** is its own floating button (`SlipSheet`), not a tab badge.

## Components (Components page on the canvas)

| Component | Props (see each artboard's `renderVals`) | Build with |
|---|---|---|
| `AppNav` (TopBar + TabBar) | size, theme, current tab | lucide-react icons, motion `layoutId` for the active pill |
| `ProbabilityChart` | per range: series `{label, color, values[]}`, times; `compact` flag | Recharts v3 via the shadcn/ui Chart wrapper: one `<Line type="stepAfter">` per outcome, a crosshair tooltip, and end-of-line labels showing name and % |
| `MarketCard` | market, compact chart, outcomes with % and weekly change | reuses `ProbabilityChart` with `compact` |
| `OutcomeRow` | label, % and pool, bar, payout multiplier, state `add` / `inslip` / `disabled` / `none`, winner | Button variants with cva |
| `SlipPick` | market, outcome, odds or stale | — |

Also build: Button (primary / secondary / danger / quiet; md and sm), Field (label, hint and inline error), StatusChip, Card and Message (error / ok / gold). Every repeated piece in the mockup comes from these.

### Chart data

The chart needs no new table.

- **Data points:** an outcome's chance at any moment is its share of the pool, so recompute every outcome's pool share after each bet, using that market's `bets` rows ordered by time.
- **Ranges:** 1D, 1W and All; hide the range buttons when there's only one.
- **Closed markets:** shade the area after the close time and label it "Closed {date}" or "Resolved: {outcome}".
- **No bets yet:** show "No bets yet — the chart starts with the first bet."

## Libraries

| Library | Plan |
|---|---|
| recharts (v3), via the shadcn/ui `chart` component | add |
| `@number-flow/react` | add, for odds %, balance and payout numbers |
| Base UI | add: Drawer, Select, Checkbox, Dialog, ToggleGroup. **Confirm the current package name before installing.** Then **remove `vaul`**, which is unmaintained, and `@radix-ui/react-dialog`. |
| lucide-react, motion, sonner, class-variance-authority, clsx, tailwind-merge | already installed; keep |

## Copy

Every string the brief listed is used verbatim; tests look for those.

These strings were written for the mockup and need a sign-off before they land:
- "Insufficient balance — you have 120 DC. Try a smaller amount."
- "Add at least one more pick to place a parlay."
- "Remove the pick that's no longer available to place this parlay."
- "Your slip is empty."
- "Awaiting resolution"
- "Winning outcome: {x}"
- "Add a reason — it's shown in the ledger next to this adjustment."
- "Page not found" / "This page wandered off…"
- "Friendly bets. Faithful study."

## Suggested build order (one PR each)

1. **Theme, tokens and logo:** tokens, Manrope, the theme toggle with persistence, the wordmark, favicons.
2. **`AppNav`:** replaces the per-page link rows.
3. **Primitives:** Button, Field, Card, StatusChip, Message.
4. **Restyle screens, route by route:** auth → home → markets → parlays → tasks/feed/leaderboard/profile → admin → 404. Add the empty states along the way.
5. **Charts:** `ProbabilityChart` plus the chart data query, on Market detail and `MarketCard`.
6. **Polish:** NumberFlow, sonner toasts, the Base UI drawer, and removing vaul.
