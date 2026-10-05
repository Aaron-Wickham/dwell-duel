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
| P1002-SignIn*, P1002-NotInvited* (Proposals · Oct 2, #329) | `app/(auth)/sign-in`, `app/(auth)/not-invited` |
| Home; P1004-Home* (Proposals · Oct 4, #388) | `app/(app)/(home)/page.tsx` |
| Markets | `app/(app)/markets/(list)` |
| CreateMarket | `app/(app)/markets/new` |
| Market (open, creator), MarketFull (slip full), MarketResolved (admin override) | `app/(app)/markets/[id]` |
| MyBets (solo bets and parlays, Open · Settled · Cancelled) | `app/(app)/bets` (`/parlays` redirects here) |
| Settings | `app/(app)/settings` |
| Launch (System page: launch animation frames) | `components/brand/launch-screen.tsx` |
| Tasks | `app/(app)/tasks` |
| Feed; P1004-Activity* (Proposals · Oct 4: Activity, #385) | `app/(app)/feed` |
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
| `--nav-active`, `--on-nav-active` | the desktop nav's active pill, a chosen filter chip, your avatar's ring on your profile (teal and white in light, near-white and `#021B1F` in dark) |
| `--tab-active`, `--on-tab-active`, `--tab-active-ring` | the phone tab bar's active pill (lime with a teal ring in light; `#17434A` with a `--line-s` ring in dark) |
| `--segment-active` | a segmented control's chosen segment (the surface in light, `#17434A` in dark) |
| `--acc-soft`, `--acc-text`, `--win`, `--win-soft`, `--loss`, `--loss-soft`, `--gold`, `--gold-soft` | chips, wins, losses and warnings |
| `--hero`, `--on-hero`, `--hero-2`, `--hero-num`, `--hero-inset` | the hero surfaces (Home's balance hero went in #388; its desktop Balance card is `--acc-soft`) |
| `--s1` … `--s6` | chart series, one per outcome |
| `--wm-a`, `--wm-b`, `--sym-d`, `--splash`, `--on-splash`, `--status-band` | the wordmark, the launch screen and the iOS status bar |
| `--shadow`, `--overlay-shadow`, `--lift-shadow`, `--tab-shadow`, `--scrim` | cards, dialogs, hover lift, a chosen segment (`shadow-tab`, with its own dark value), the dialog backdrop |
| `--safe-top`, `--safe-bottom` | the iPhone's safe areas, non-zero only in the installed app |
| `--ease-*`, `--duration-*` | motion, in the `@theme static` block (mirrored by `lib/ui/motion.ts`) |

Every text pairing passes WCAG AA in both themes, and `--line-s` clears 3:1 on `--surface`, `--sunk` and `--acc-soft`; `tests/lib/ui/contrast.test.ts` checks them, so add a new pairing there.

**In dark, links are near-white and lime fills mark only the primary action and first place (#380).** `--acc-text` (`#8BE651` in dark) stays the positive and open text colour. `--link` is the dark ink, plainly underlined; a card or row title link (a stretched link, a bettor's name in a divided row) takes `text-ink` in both themes; and active navigation uses the `nav-active`, `tab-active` and `segment-active` tokens rather than `--primary`. Light mode's lime and `--wm-b` are fills or brand only.

**Chip tones** come only from the semantic tokens, never `--primary`: `open` (acc-soft with acc-text), `wait` (gold), `won` (win: a won bet or parlay, a winning outcome), `done` (sunk with ink: a resolved market, the owner's role), `lost` (loss) and `void` (sunk with ink2). `StatusChip` comes in `md` (28px) and `sm` (24px).

**Lime is never used as text on the light background.** It appears only as a fill behind teal text (the phone tab bar's active pill, the leaderboard's first-place rank badge and podium block, large avatars, Getting started's step dots). Count badges are red (`--loss`, #351).

## Sizing and accessibility

- **Targets:** every control is at least 44px tall. Primary buttons are 48px and compact ones 44px.
- **Focus:** every control gets a visible ring: `:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px }`.
- **Corner radii:** cards 18px (`--radius-card`), list cards, sunken panels and segmented tracks 14px (`--radius-tile`), buttons and inputs 12px (`--radius-control`), segments, icon tiles and inline code 10px (`--radius-segment`), chips fully rounded (999px). Every corner is one of these; there's no `rounded-[Npx]`.
- **Card padding:** 18px on phones and 24px from `md:` (`cardPaddingClass`), for `Card`, `SectionCard` and every card built by hand, the market card included.
- **Grid gaps:** a `lg:` grid of cards is 20px apart (`lg:gap-5`).
- **Page padding:** 16px on phone, 80px on desktop with a 1120px max content width.
- **Page widths:** `<Page width>` picks one of two centred columns, and the page's header, tabs and content always share its edges, so nothing is left-pinned with empty space on the right. See *Desktop layouts* below.
- **Type sizes (px):**

| Element | Phone | Desktop | Weight |
|---|---|---|---|
| H1 | 28 | 40 | 800 |
| H2 | 19 | 21 | 800 |
| Row title (`rowTitleClass`: a tile, task, bet, parlay, catalog or leaderboard row) | 17 | 17 | 800 |
| Body | 16 | 16 | normal |
| UI text (`uiTextClass`: buttons, tabs, filter chips, the nav, messages, labels) | 15 | 15 | 700–800 |
| Caption | 14 | 14 | normal |
| Chip text (`chipTextClass`: status and category chips, chart labels) | 13 | 13 | 700–800 |
| Micro text (`microTextClass`: count badges, chart axes) | 11 | 11 | 700–800 |
| Hero figure (`figureHeroClass`: Home's balance, a parlay's summary) | 40 | 56 | 800, `-0.03em` |
| Stat figure (`figureClass`: the economy card, the chart's end labels, large avatars' initials) | 24 | 28 | 800 |
| Inline figure (`figureInlineClass`: Home's stat tiles, a parlay card's figures, awards, member stats) | 20 | 20 | 800 |

The sizes live in `components/ui/page.tsx`; nothing else sets a `text-[Npx]` except the sign-in page, the 404 and the brand mark (the wordmark and the beta badge).

- **Numbers (#382):** every DC amount goes through `formatDc` / `formatDcAmount` / `formatSignedDcAmount` (`lib/format/dc.ts`): en-US grouping from 1,000 ("2,577,831 DC"), a true minus (−) and a `+` on a gain. Animated numbers group too. An amount cell doesn't wrap. Tabular figures only where numbers line up in a column (the leaderboard's scores, the ledger, coin history, tooltips); a lone figure keeps proportional digits.

- **Real elements only:** `<button>`, `<a>`, and `<label>` paired with its input. No clickable divs.
- **Icon-only buttons** get an `aria-label`.
- **Press and hover (#153, #383):** every control shrinks to 97% on press. Under a mouse (not on touch), buttons, chips, tabs and nav items change colour and don't grow (the 103% grow went in #383: it read as a landing page and fought the sliding pills); standalone tappable cards lift 2px onto a shadow (`hover-lift`). A row or tile inside a card, such as a list card, a podium place, a member on Admin › Members or a row in Home's Needs you, never lifts: it sits on a flat `--sunk` tint (`hover-tint`), since a card floating inside a card reads as a button inside a button (#244). Reduced motion keeps the colour changes (and the lift's shadow) and drops the movement. Curves and durations come from the motion tokens in `globals.css`.
- **Section cards:** a `SectionCard`'s `description` slot puts a caption line right under its heading (the weekly recap's date range); the card's body follows at the usual gap.
- **List cards (#328):** a list item that opens one thing is a `ListCard` (`components/ui/list-card.tsx`); a sentence row (the feed) or a data row (the ledger) stays a divided row. A list card is the My bets parlay card: a `--line` hairline, 14px corners (`--radius-tile`), 14px padding on phones and 16px from `md:`, no shadow, tinting flush to its border under a mouse. Its title link stretches over it; other controls (Resolve, Submit, Approve) sit above the cover. Inside a section card the cards are 8px apart with no dividers. Solo, settled and cancelled bets, parlays, tasks, markets waiting to be resolved, the admin task catalog, pending approvals, the leaderboard and admin members are list cards; the feed, Home's Your bets and Activity rows, ledger, coin history, invites and a market's bet list are divided rows. Your own leaderboard card keeps the `--acc-soft` tint.
- **Sliding pills:** the desktop nav's, the phone tab bar's and every segmented control's active pill all slide to the new tab the same way: 280ms on the iOS curve. On the nav and tab bar, each label's and icon's colour cross-fades over the same 280ms (`pill-label`), so the pill never covers a label still in its old colour; on the tab bar the label's weight also eases from bold to extrabold. Nothing else moves: the icon doesn't pop (#383).
- **Counting numbers (#383):** an `AnimatedNumber` counts only when its value changes after it's on screen (your balance after a bet, a chance moving live). A page load shows the final figure at once.
- **Reduced motion (#383):** the device setting or Settings' "Reduce animations" turns every page transition into a 150ms cross-fade (`--duration-fast`) with nothing sliding or rising, rather than a hard cut.

## Desktop layouts (#158)

Phone layouts are single columns and don't change. From `lg:` (1024px) each page uses its column like this:

| Page | Width | At `lg:` |
|---|---|---|
| Markets | wide | Three columns of market cards. |
| Market | wide | Chart and outcomes (7fr) beside betting, resolution and the rest (5fr). |
| Leaderboard | wide | Podium across the top; the rankings stay one column of list cards, since rank reads top to bottom. This month: rankings (7fr) beside the race chart, the awards as a 2×2 grid and past champions (5fr). Net worth: rankings (7fr) beside a "Your standing" card (5fr); on a phone that card is hidden, and a compact standing card with Jump to me sits above the list instead. |
| Activity (`/feed`) | reading | One centred stream. |
| My bets | wide | Open, Settled and Cancelled show bets as list cards in three columns (a solo bet's status sits at the bottom of its card); Coins stays a divided list. |
| Member | wide | Photo, name, bio and a two-column Stats card (5fr) beside Recent activity (7fr). |
| Edit profile | wide | Photo and a live preview of the profile (5fr) beside name, bio and Save (7fr). |
| Settings | wide | Two columns of section cards: Appearance, Profile, Haptics & motion; then Notifications, Help, Account. |
| How it works | reading | A sticky contents list (200px) beside the rules (about 68 characters a line). |
| Create market | wide | The form (7fr) beside a live preview of its market card (5fr). The type is three option cards, Yes/No, Multiple choice and Over/Under, each with a line saying what it asks: stacked on a phone, in a row from `lg:`. The chosen card is `acc-soft` with an `acc-text` border and dot; the native radio covers each card, transparent (#352). |
| Parlay | wide | Picks (7fr) beside the summary and How it adds up (5fr). |
| Admin › Members | wide | A card per member in three columns. |
| Tasks | wide | Task cards in two columns, each with its action on the right. |
| Admin › Tasks | wide | Pending approvals as cards in two columns; Create task (5fr) beside the task catalog (7fr), its cards in two columns. |
| Admin › Markets | wide | Markets waiting to be resolved as cards in three columns. |
| Home | wide | The greeting, then Your bets and Activity as cards (7fr) beside a Balance card (`--acc-soft`, the balance in `figureHeroClass`, "Rank N of M · X DC riding on K bets") and Needs you (5fr). On a phone the sections are rows on the page with no card around them, in the order greeting, Needs you, Getting started, Your bets, Activity (#388). |

- **wide** is `max-w-[1280px]`: a 1120px content column inside the 80px padding.
- **reading** is `max-w-[980px]`: about 820px of content, centred, for a single stream or long text.
- Side-by-side columns are `minmax(0,7fr)` / `minmax(0,5fr)` (or the reverse), `items-start`, so each card is as tall as its content. Where the phone order differs from the columns, the grid places items (`lg:col-start-*`, `lg:row-start-*`) rather than reordering the markup.
- A route's `loading.tsx` skeleton follows the same width and columns.

## Sign in and Not invited (#329)

Written for someone who has just been invited: get them oriented, then signed in. Both pages are `SignInFrame` (`components/sign-in/sign-in-frame.tsx`), not a `<Page>`, since they're outside the signed-in shell.

- **Contents, in order:** the wordmark (static, not a link) with the `BetaBadge` beside it (#354), a sample market card, the `h1` "Friendly bets. Faithful study.", three facts with icons (Bet on friendly questions · Earn DC with Bible-study tasks · Play money, invite-only), the "Sign in with Google" button (`SignInButton`: the primary `Button` with `GoogleMark`) with "Use the Google account your invite was sent to." under it, and Privacy. While Google opens, the button shows `LeafLoader` and "Opening Google…"; after a failed direct sign-in (`?error`), a secondary "Try another way" button beneath it goes through Supabase's redirect.
- **The sample market** (`SampleMarket`) is hard-coded: signed-out visitors can't read markets and real questions mustn't leak. It looks like a `MarketCard`: Open and Church chips and "Sample", "Will the sermon run past noon?", a plain-SVG step-line chart in `MarketSparkline`'s style (Yes in `--s2`, No in `--line-s`, a baseline and a dashed 50% line) with end labels, and "Sam bet 10 DC on Yes · just now" beside Yes's %. Screen readers get it as one image named "Sample market: …".
- **Layouts:** one column on a phone, card first. The page never scrolls on a phone: one 740pt tall or less (below `lg:`, the `short:` variant; the full page needs about 727pt) drops the chart's axes and the facts. At `lg:` the copy (up to 480px, the button 380px) sits left of the card, 64px apart, both starting 32px under the wordmark rather than centred in the window (#354), and the `h1` is 52px.
- **The intro** plays once a session (`sessionStorage`), from a script that runs before the first paint (`components/sign-in/sign-in-intro.tsx`), so the page opens on the first frame or the last, never both:
  1. 0–0.9s: the D sits centred at the launch screen's size (`32vmin`) on the page background and its leaves grow in (`launch-leaf`, the launch screen's own frames).
  2. 0.9–1.35s: the symbol flies into the wordmark (`IntroDirector`, measured, `DURATION.sheet` on the iOS curve) as the backdrop fades.
  3. 1.1s on: the card rises in, then the copy; from 1.3s the chart draws; at 1.9s and 2.05s two bets land as steps on the line, and Yes counts 54% → 61% through `AnimatedNumber`.
  The times are `INTRO` in `components/sign-in/intro-timeline.ts`; the pre-paint script that starts the intro writes its CSS delays onto `<html>` as `--intro-*-at` properties (`INTRO_CSS_DELAYS`), so the CSS ("Sign-in intro" in `globals.css`) holds no time of its own beyond the motion tokens. In the installed app the launch screen plays over the first 0.9s and fades as the symbol starts to move. Reduced motion (the device or Settings) starts on the final frame.
- **Not invited:** the same frame with the sample card at 35% opacity, a gold notice "This Google account isn't on the invite list.", the `h1` "You're not on the list yet", the refused account's email when the callback passed it, a line about checking with the friend who invited them, and "Try another account" as a primary button with the G mark, back through sign-in with `next` kept.

## Navigation (one `<AppNav>` in the signed-in layout)

- **Tabs (D1, #385):** Home, Markets, Bets, Tasks and Leaders. The feed is Home's Activity section, whose See all opens `/feed` (h1 "Activity") as a drill-down from Home, which stays the marked tab there. The wordmark still links home but is never marked current.
- **Desktop:** a 72px top bar with the wordmark, then Home, Markets, My bets, Tasks and Leaderboard. On the right: the balance chip (a link to My bets) and your avatar. The active item is a filled pill. No Admin link and no BETA badge (the badge stays on sign-in and Not invited).
- **Phone:**
  - Top bar (64px): wordmark, balance chip, avatar, for every role. The balance chip is text only ("4,886 DC", no coin icon).
  - Bottom tab bar with 5 tabs: Home (lucide `House`), Markets, Bets, Tasks, Leaders. Bets has `aria-label="My bets"`; Leaders has `aria-label="Leaderboard"`.
- **The avatar is a menu** (`ProfileMenu`, Base UI Menu, `components/app-nav/profile-menu.tsx`): Your profile, Settings, Admin (reviewers and above) and Send feedback, each a 44px link. When work waits on a reviewer or above, the avatar carries a small red dot (`bg-loss`, `ring-surface`), its name says how much ("Your profile and settings, 3 waiting"), and the Admin item says it in words (`AttentionCount`, "3 waiting").
- **Admin** is reached from Home's Needs you rows and the avatar menu. It opens on the section with work in it: Tasks when task submissions wait, else Markets when markets wait to be resolved, else the first section the role can see (Invites for an admin or the owner, Tasks for a reviewer; `adminHref`). Inside Admin, the sections are a `SubNav` (Invites, Tasks, Markets, Members, Ledger, each shown by role), whose Tasks and Markets tabs carry their share of the count as a red badge on the label's corner (`AttentionBadge`, `components/ui/attention-badge.tsx`), read as the tab's description, "2 waiting" (#351). Below `md:` that row scrolls sideways edge to edge, starting scrolled to the current tab, so nothing clips at 320px. A reviewer, with only Tasks, gets no tabs.
- **Status band:** the light theme's `--status-band` against the new top bar still needs a check in the installed app (#385); it's unchanged.
- **The slip** is its own floating button (`SlipSheet`), not a tab badge. It rises 12px and fades in with the first pick (`--duration-enter`, iOS curve) and fades out after the last (`--duration-fast`); a button already there when a page loads just shows. Reduced motion keeps the fades and drops the rise.
- **Switching tabs (#384)** is an instant swap, as a native tab bar's is: the nav, the tab bar, the balance chip, the wordmark, `SubNav` and Home's See all for My bets navigate with the `nav-tab` transition type, which has no fade or rise. A page visited in the last 30 seconds comes back from the client's cache at once, with no skeleton, and then refreshes in place. A drill-down still slides, with the old page gone by 120ms (`--duration-press`) so two titles never show stacked.
- **Pending feedback (#384):** the nav's and tab bar's pill moves to the tapped tab on the tap, before the page arrives (`aria-current` stays on the page you're on until it does). A tapped card, row or button that links through `IntentLink`, or a card clicked under a mouse, dims to 70% until its page arrives. Neither shows for a page that was prefetched or cached, so a fast tap never flashes. No spinners.

## Components (Components page on the canvas)

| Component | Props (see each artboard's `renderVals`) | Build with |
|---|---|---|
| `AppNav` (TopBar + TabBar) | size, theme, current tab | lucide-react icons, motion `layoutId` for the active pill |
| `ProbabilityChart` (the market page only, loaded lazily) | per range: one series per outcome, with times | Recharts v3 through `components/ui/chart.tsx` (adapted from shadcn/ui's chart and copied in): one `<Line type="stepAfter">` per outcome, a crosshair tooltip, and end-of-line labels showing name and % |
| `MarketCard` | market, sparkline, outcomes with % and weekly change | `MarketSparkline` (`components/markets/market-sparkline.tsx`): the same window and colours as `ProbabilityChart`, drawn as plain SVG so the list server-renders it and ships no chart library |
| `OutcomeRow` | label, % and pool, bar, payout multiplier, state `add` / `inslip` / `disabled` / `none`, winner | Button variants with cva |
| `SlipPick` | market, outcome, odds or stale | — |

The shared primitives are in `components/ui/`: Button (primary / secondary / danger / quiet; md and sm), Field (label, hint and inline error), StatusChip (six tones; md and sm), Card, Message (error / ok / gold), `SectionCard`, `EmptyState`, `SegmentedControl`, `SubNav`, `ShowMore`, `SearchField`, `FilterChips`, the confirm dialogs and the skeletons. Every repeated piece comes from these.

`SegmentedControl` (`components/ui/segmented-control.tsx`, #381) is every segmented control: a `--sunk` track with the tile radius and 4px padding, 44px segments with the segment radius, and one `--segment-active` pill with an `--ink2` border (the 3:1 indicator) and `shadow-tab` that slides on `PILL_SLIDE` (still under reduced motion). `SubNav` is its link form, with tab state in the URL and `aria-current`; the theme control (radios), the slip's Solo/Parlay toggle (pressed buttons) and the chart's range (a Base UI toggle group) are its local forms.

### Chart data

- **Data points:** an outcome's chance at a moment is the market maker's price then (shares sold, parlay legs included), so a new market starts at an even split; an older pool market's history uses its seeded pools (`effectivePools`). SQL samples the series, so no page reads every bet: `market_sparklines` gives the market page's chart 200 points (`lib/markets/chart-series.ts`), and `market_sparks` gives each card at most 24 compact points, cached per list in Next's data cache and keyed by its markets' pool versions (`lib/markets/sparklines.ts`). Both prepend the even opening split (`withSeededStart`).
- **Ranges:** 1D, 1W and All, each offered only when the data spans it; hide the range buttons when there's only one.
- **Closed markets:** shade the area after the close time and label it "Closed {date}" or "Resolved: {outcome}".
- **No bets:** "No bets were placed on this market."

## History

The mockup's library plan (Recharts, NumberFlow, Base UI in place of vaul and Radix), its copy sign-offs and its suggested build order were all done by v0.2.0-beta. They're in git history and in `docs/archive/` if you need the detail.
