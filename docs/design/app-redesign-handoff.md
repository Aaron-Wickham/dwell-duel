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
| Market (open, creator), MarketFull (slip full), MarketResolved (admin override); P1004-Market* (Proposals · Oct 4, #390) | `app/(app)/markets/[id]` |
| MyBets (solo bets and parlays, Open · Settled · Cancelled); P1004-MyBets* (Proposals · Oct 4, #393) | `app/(app)/bets` (`/parlays` redirects here) |
| P1004-Slip* (Proposals · Oct 4, #392) | `components/slip` |
| Settings | `app/(app)/settings` |
| Launch (System page: launch animation frames) | `components/brand/launch-screen.tsx` |
| Tasks; P1004-Tasks* (Proposals · Oct 4: Tasks, #394) | `app/(app)/tasks` |
| Feed; P1004-Activity* (Proposals · Oct 4: Activity, #385) | `app/(app)/feed` |
| Leaderboard | `app/(app)/leaderboard` |
| Profile | `app/(app)/members/[id]` |
| AdminInvites / AdminTasks / AdminMembers / AdminLedger; P1004-Admin* (Proposals · Oct 4: Admin, #399) | `app/(app)/admin/(sections)/*` |
| (no artboard; built like AdminTasks' queue) AdminMarkets: closed markets with no result, oldest first | `app/(app)/admin/(sections)/markets` |
| (no artboard) one member's Admin page | `app/(app)/admin/members/[id]` |
| P1004-HowItWorks* (Proposals · Oct 4: How it works, #398) | `app/(app)/how-it-works` (the short version), `app/(app)/how-it-works/rules` (the full rules) |
| (no artboard) Parlay breakdown, Edit profile | `app/(app)/parlays/[id]`, `app/(app)/profile` |
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
| `--s1` … `--s6` | chart series: five hues validated as a set for colour-vision deficiency (ink, green, blue, magenta, orange), and `--s6` is `--line-s`, the grey for a sixth outcome |
| `--wm-a`, `--wm-b`, `--sym-d`, `--splash`, `--on-splash`, `--status-band` | the wordmark, the launch screen and the iOS status bar |
| `--shadow`, `--overlay-shadow`, `--lift-shadow`, `--tab-shadow`, `--scrim` | cards, dialogs, hover lift, a chosen segment (`shadow-tab`, with its own dark value), the dialog backdrop |
| `--safe-top`, `--safe-bottom` | the iPhone's safe areas, non-zero only in the installed app |
| `--ease-*`, `--duration-*` | motion, in the `@theme static` block (mirrored by `lib/ui/motion.ts`) |

Every text pairing passes WCAG AA in both themes, and `--line-s` clears 3:1 on `--surface`, `--sunk` and `--acc-soft`; `tests/lib/ui/contrast.test.ts` checks them, so add a new pairing there.

**In dark, links are near-white and lime fills mark only the primary action and first place (#380).** `--acc-text` (`#8BE651` in dark) stays the positive and open text colour. `--link` is the dark ink, plainly underlined; a card or row title link (a stretched link, a bettor's name in a divided row) takes `text-ink` in both themes, and a stretched-link title isn't underlined until it's hovered or focused (#393); and active navigation uses the `nav-active`, `tab-active` and `segment-active` tokens rather than `--primary`. Light mode's lime and `--wm-b` are fills or brand only.

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
| Inline figure (`figureInlineClass`: Home's stat tiles, awards, member stats) | 20 | 20 | 800 |

The sizes live in `components/ui/page.tsx`; nothing else sets a `text-[Npx]` except the sign-in page and the brand mark (the wordmark and the beta badge).

- **Numbers (#382):** every DC amount goes through `formatDc` / `formatDcAmount` / `formatSignedDcAmount` (`lib/format/dc.ts`): en-US grouping from 1,000 ("2,577,831 DC"), a true minus (−) and a `+` on a gain. Animated numbers group too. An amount cell doesn't wrap. Tabular figures only where numbers line up in a column (the leaderboard's scores, the ledger, coin history, tooltips); a lone figure keeps proportional digits.

- **Real elements only:** `<button>`, `<a>`, and `<label>` paired with its input. No clickable divs.
- **Icon-only buttons** get an `aria-label`.
- **Press and hover (#153, #383):** every control shrinks to 97% on press. Under a mouse (not on touch), buttons, chips, tabs and nav items change colour and don't grow (the 103% grow went in #383: it read as a landing page and fought the sliding pills); standalone tappable cards lift 2px onto a shadow (`hover-lift`). A list card, a podium place, a leaderboard row and a row or tile inside a card, such as a row in Home's Needs you, never lift: they sit on a flat `--sunk` tint (`hover-tint`), since a card floating inside a card reads as a button inside a button (#244). Reduced motion keeps the colour changes (and the lift's shadow) and drops the movement. Curves and durations come from the motion tokens in `globals.css`.
- **Member-facing words (D7, #403):** members read "called off", never "voided" (the chip, meta line, feed, push, toast, coin history and the Markets list's group), and "waiting for a result", never "awaiting resolution". The database's `voided` and `awaiting` values, the admin ledger's type labels and the Admin guide keep the old words.
- **Page headers (#400):** a `PageHeader`'s `description` is for a rule the page enforces, not a summary of the page: Tasks keeps "A reviewer checks each one.", and a parlay's page its placed time. My bets, Settings, Edit profile and Activity have none; My bets' Coins tab says "Only you can see your coin history." above its list, and Admin's guide is a link in the header's action slot. A header skeleton draws a description line only where the page has one.
- **Section cards:** a `SectionCard`'s `description` slot puts a caption line right under its heading (the weekly recap's date range); the card's body follows at the usual gap.
- **One container per list (D2, #386; supersedes #328's list cards inside a section card):** a list that is a page's only content has no card around it. Its items sit straight on the page, as list cards or as divided rows, and the region keeps a name: a visible `h2`, or a screen-reader-only one where a visible heading would only repeat the `h1` or the current tab (`ListSection`, `components/ui/list-section.tsx`). A list inside a real section card (a page with several sections) is divided rows (`dividedRowsClass` / `dividedRowClass`: hairlines between rows, 14px above and below each), with `hover-tint` and a `stretched-link` title on a row that opens one thing, never bordered cards inside the card.
- **List cards:** `ListCard` (`components/ui/list-card.tsx`) is for a standalone list whose items each open one thing, on the page: the My bets parlay card's look, a `--line` hairline, 14px corners (`--radius-tile`), 14px padding on phones and 16px from `md:`, no shadow, tinting flush to its border under a mouse, 8px apart with no dividers (`listCardsClass`). Its title link stretches over it; other controls (Submit) sit above the cover. Solo, settled and cancelled bets and parlays are list cards on the page. The leaderboard, the feed (Activity) and Tasks' groups are divided rows on the page, and Admin › Members is a table on the page (divided rows below `lg`, #399); markets waiting to be resolved, the categories and the admin task catalog are divided rows inside their section cards, and pending approvals a table inside its card (#399), as are Home's Your bets and Activity, the ledger, coin history, invites and a market's bet list.
- **Chips (#387):** a chip appears only when it adds information the context doesn't. A list filtered to one status shows no status chip on its items (My bets' Open tab has no "Open" chips; a bet's or parlay's result on My bets is a word in its line, "won 18 DC", "lost" or "refunded", not a chip, #393). A market's category chip shows only on the All list while more than one category holds markets. No emoji in chrome: a streak reads "3-week streak".
- **Empty states (#387):** `EmptyState` is a bold line, a quieter body and, wherever there is one, the next step as a secondary button ("Browse markets" on My bets' Open, Activity's Mine and an empty month board; "See tasks" on Coins). No icon: the prop is optional and no list passes one.
- **Icons (#387):** an icon earns its place only when it carries meaning a word can't: the tab bar's, the close X, the error and success marks in `Message`, the chevrons on Needs you rows, the Google G. Secondary buttons (Edit profile, Settings, How it works, Your data, Sign out, Copy invite message, Remove from DwellDuel, Search) are text only, feed rows start with their sentence, and the 404 is the `h1` "Page not found", one line and "Go home".
- **Sliding pills:** the desktop nav's, the phone tab bar's and every segmented control's active pill all slide to the new tab the same way: 280ms on the iOS curve. On the nav and tab bar, each label's and icon's colour cross-fades over the same 280ms (`pill-label`), so the pill never covers a label still in its old colour; on the tab bar the label's weight also eases from bold to extrabold. Nothing else moves: the icon doesn't pop (#383).
- **Counting numbers (#383):** an `AnimatedNumber` counts only when its value changes after it's on screen (your balance after a bet, a chance moving live). A page load shows the final figure at once.
- **Reduced motion (#383):** the device setting or Settings' "Reduce animations" turns every page transition into a 150ms cross-fade (`--duration-fast`) with nothing sliding or rising, rather than a hard cut.

## Desktop layouts (#158)

Phone layouts are single columns and don't change. From `lg:` (1024px) each page uses its column like this:

| Page | Width | At `lg:` |
|---|---|---|
| Markets | wide | One filter row: the Open / Waiting / Resolved tabs, then the search field at the right (on a phone, a 44px search icon beside the tabs that opens the field below them). Category chips under it only while more than one category holds markets. Then three columns of market cards, each row's cards one height with their meta line at the bottom. |
| Market | wide | The chart, then Comments, then Bets (7fr) beside a rail (5fr) holding the outcomes, Your position and, for whoever may, the Resolve, Void and Delete cards. The rail sticks below the top bar unless it holds those cards, which could be taller than the screen. See *Market page* below. |
| Leaderboard | wide | The rankings are divided rows on the page (#396): a plain rank number (a lime badge only for first), a 32px avatar, the name on one line (truncated, never broken), the score right-aligned in tabular figures with no unit shown, and the win–loss chip from `md:`. A line under them says what the score is. Your own row is `--acc-soft` and sticks to the bottom of the viewport (above the tab bar) until you scroll to it; when it's further down than the page shows, a sticky "You" bar with Jump to me stands in for it on a phone. Net worth: rankings (7fr) beside a side column (5fr) that sticks below the top bar, holding the podium (no card, so it never stretches across the page) and Your standing with Jump to me; on a phone the podium sits above the rankings. This month has no podium: the race chart leads, full width, then rankings (7fr) beside the awards and past champions (5fr), which follow the rankings on a phone. |
| Activity (`/feed`) | reading | One centred stream. |
| My bets | wide | Open, Settled and Cancelled show bets as list cards on the page in two columns, with no card around them (D2); a parlay spans both columns (`lg:col-span-full`), so a tall card never leaves a hole beside it. See *My bets and the parlay page* below. Coins is divided rows on the page. |
| Member | wide | Photo, name, bio and a two-column Stats card (5fr) beside Recent activity (7fr). See *Member, Settings and How it works* below. |
| Edit profile | reading | One card: photo with Change photo, name, bio, then one Save. No preview (#397). |
| Settings | reading | One column of section cards: Appearance & motion, Notifications, Install the app (when it applies), Help, Account (#398). |
| How it works | reading | The short version: four sections and Questions, then Read the full rules (#398). |
| How it works › Full rules | reading | A sticky contents list (200px) beside the rules (about 68 characters a line); below `lg`, a collapsed On this page list after the first section. |
| Create market | wide | The form (7fr) beside a live preview of its market card (5fr). The fields run Title (with an example placeholder), Type, Outcomes or Line, Close time, Category, then Details (optional); under them, beside Create market, one line says what can't change later (#390). The type is three option cards, Yes/No, Multiple choice and Over/Under, each with a line saying what it asks: stacked on a phone, in a row from `lg:`. The chosen card is `acc-soft` with an `acc-text` border and dot; the native radio covers each card, transparent (#352). |
| Parlay | wide | Picks (7fr) beside the summary and How it adds up (5fr). See *My bets and the parlay page* below. |
| Admin › Members | wide | The Members heading, then a table on the page (D2): Member (name and email), Role, Balance, Net worth, Joined, figures right-aligned in tabular digits (#399). Below `lg`, divided rows: the name and email, then "Member · 4,886 DC balance · 5,161 DC net worth · Joined Sep 28". |
| Tasks | wide | To do (7fr) beside Waiting for review, Not approved and Done stacked (5fr), each a group of divided rows on the page under its visible heading (#394). With nothing waiting, turned down or done, To do takes the whole column. On a phone the groups follow one another in that order. |
| Admin › Tasks | wide | To review in its card: the bulk bar, then a table (checkbox, Member, Task with its reward, Proof, Sent, Approve and Reject…) (#399); Create task (5fr) beside the task catalog (7fr), divided rows in its card (D2). |
| Admin › Markets | wide | Markets waiting to be resolved, then the categories, each as divided rows in its card (D2). |
| Admin › Ledger | wide | The economy card (owner only), then the ledger card under a visible "Every coin movement" heading, divided rows. |
| Home | wide | The greeting, then Your bets and Activity as cards (7fr) beside a Balance card (`--acc-soft`, the balance in `figureHeroClass`, "Rank N of M · X DC riding on K bets") and Needs you (5fr). On a phone the sections are rows on the page with no card around them, in the order greeting, Needs you, Getting started, Your bets, Activity (#388). |

- **wide** is `max-w-[1280px]`: a 1120px content column inside the 80px padding.
- **reading** is `max-w-[980px]`: about 820px of content, centred, for a single stream or long text.
- Side-by-side columns are `minmax(0,7fr)` / `minmax(0,5fr)` (or the reverse), `items-start`, so each card is as tall as its content. Where the phone order differs from the columns, the grid places items (`lg:col-start-*`, `lg:row-start-*`) rather than reordering the markup. The market page is the one exception: its sticky rail needs a single box, so the markup is rail first and, on a phone, both columns are `display: contents` and each section's wrapper takes an `order-*`.
- A route's `loading.tsx` skeleton follows the same width and columns.

## Market page (#390)

- **Header:** the back link, and on the right a 44px "More actions" button (Base UI Menu, like the avatar's) holding Share, Duplicate, Edit (or Edit category), Reopen when the market can be reopened, and Edit history when it has been edited (a dialog listing every past version). Then the `h1` and one meta line: "Closes Sun 12:00 PM · by Ben Turner", "Closed…", "Resolved Oct 4" or "Called off Oct 4", plus " · Church" while more than one category holds markets. Every member sees the creator's stake under it, when they have one ("Ben has 40 DC on Yes.", #84); the creator reads "You have 40 DC on Yes.", plus who resolves it when that stake stops them. The description follows. No status or over/under chips.
- **Outcomes** come first on a phone and top the rail from `lg:`. Each row is the name, "10 DC wins 16" under it (the slip's own `soloPays` quote, so the two never differ), the chance as a figure on the right, and Add (named "Add Yes to slip"); in the slip, the line reads "In your slip" and the button Remove. No pool DC, no multiplier, no per-row parlay line. When parlays ride on the market, one muted line under the rows: "Includes 14 DC riding in parlays. How parlays pay".
- **Settled:** a resolved market says "Yes won" once, in a `--win-soft` block at the top of the outcomes, with the actual number for an over/under, when bets are paid, the resolver's note and proof, and "Changed from No" after an override; the winning row carries a Won chip and the rest are muted at their final chance. A called-off market says "This market was called off. Every bet was refunded, and parlays dropped this pick." with the reason ("Why it was called off"). A closed market waiting on its result says so in one line. No "No more bets" card.
- **Phone order:** outcomes, chart ("Yes over time" for two outcomes, "Chance over time" otherwise), Your position (its 2px ink border kept), then the Resolve and Void cards while the market waits on a result, Comments, Bets (the latest 10, then Show more; names are links in `--ink2`), and any Resolve, Void or Delete card on a market that hasn't closed yet.
- **Resolve and Void** are separate cards, Void below and quieter (the danger outline button at its own width); each confirms before anything moves. Delete (the owner, on a market nobody bet on) is its own card after them.

## Slip (#392)

- **Adding or removing a pick doesn't toast.** The row's "In your slip" and the slip button's count are the feedback; errors still toast. Focus stays on the control that replaces a pressed Add or Remove (A11Y-02), and removing a pick inside the slip moves focus to the next pick's Remove, or to Close once the slip is empty.
- **The sheet is modal:** Tab and Shift+Tab cycle inside it, Escape closes it, and focus goes back to the slip button (A11Y-01). A bottom sheet on a phone, a 440px panel from the right on desktop.
- **Header:** "Your slip", with the balance on the right ("4,886 DC", read as "Balance 4,886 DC"), and " · 5 DC short" in loss red when the stakes are more than the balance.
- **Each pick is a list card** on `--surface`: the market's title (a link) and Remove; the outcome (`rowTitleClass`) and its chance ("Yes · 61%"); the stake field and the 5 / 10 / 25 / Max chips; then "Wins 16 DC", the amount in `text-win`, from `soloPays`, the same quote as the market page's rows.
- **No Solo/Parlay switch for one pick:** a parlay needs two, so the switch shows from two picks (or on a lone pick that's already Parlay, so it can switch back), with a "How parlays pay" link under the picks. The parlay's panel says "Parlay · 2 picks" and its odds, then its stake, chips and "Wins 33 DC if every pick wins".
- **Footer:** one primary button, "Place bet · 10 DC", "Place 3 bets · 30 DC" or "Place parlay · 10 DC"; what holds it back, under it; then one centred rules line, "Bets are final once placed." No explanatory paragraphs. Placing doesn't ask first, and its money flow (attempt key, `price_moved`) is unchanged.

## My bets and the parlay page (#393)

- **A solo bet** is a list card: the market's title (a stretched link) with its closing day right-aligned in `--ink2` ("Oct 18"; "Closed" once it has closed; the day it was placed once settled), then one line: "10 DC on **Yes** · pays **18 DC**", the payout (`floor(shares)`) in `text-win`. A bet waiting on its result adds " · waiting for a result"; a settled one says " · won 18 DC" (`text-win`), " · lost" (`text-loss`) or " · refunded". No chips.
- **A parlay** is a list card spanning both columns at `lg:`: "Parlay · 3 picks" with the day it was placed, then "5 DC · pays **80 DC** if all win" (or "won 80 DC", "lost", "refunded"), then its first three picks as compact lines, "Market · **Pick**", each with a word on the right: Won (`text-win`), Lost (`text-loss`), Waiting or Called off (`--ink2`), not pills; "+2 more picks" under them. No multiplier and no progress bar on the card.
- **The parlay's page:** the summary is a plain card while the parlay is open, lost or refunded, and `--win-soft` only once it has won. It says the result once: "Pays if every pick wins" over the figure, "Won" over what it paid, or "Lost" alone in loss red; under it "5 DC stake · pays 16.00× your stake", or "would have paid 80 DC" for a loss. No chip in the summary. The picks carry the same words as My bets. How it adds up ends "Pays if every pick wins", "Won", "Returned", or "Paid: Nothing" for a loss.
- Members read "picks", never "legs".

## Tasks (#394)

- **Grouped by what you can do,** in this order, each a `ListSection` whose visible `h2` shows only when the group has rows: **To do** (tasks you can submit now), **Waiting for review**, **Not approved** and **Done** (approved and not yet open again: this period for a repeating task, for good for a one-off). Divided rows on the page, no card around them and none per row. From `lg:`, To do (7fr) sits beside the other three stacked (5fr).
- **The subtitle** is the one that teaches a rule: "Earn DC with Bible study. A reviewer checks each one."
- **A row** is the title (`rowTitleClass`), then one line: the reward first in gold, "**10 DC** · weekly" (`once` for a one-off), plus " · 3-week streak" from two periods in a row; the description in one clamped line under it; and "Photo, file or link needed" when the task needs proof. No chips. Its action is a secondary small button on the right, "I did this", which opens the submit dialog.
- **Waiting for review:** "**25 DC** · sent Thu" ("today", a weekday within the week, then a date), plus " · 1 attachment". No button. While the submission is on its way the button gives way to "Sent for review", and the row then moves here.
- **Not approved:** the reviewer's reason in `text-loss`, in quotes ("No reason given." without one), and a secondary "Try again" that opens the same dialog.
- **Done:** a quiet `--ink2` line, "Read Philippians · 15 DC", with a check in `text-win` on the right; under it, for a repeating task, its streak and when it opens again ("3-week streak · Again Monday, midnight ET").
- The skeleton draws To do's heading and four rows with their buttons beside one more group.

## Member, Settings and How it works (#397, #398)

- **Member:** under the name, "5,161 DC net worth · 2nd of 9" (`rowTitleClass`), then "4,886 DC balance + 275 DC riding on open bets" in `--ink2`, so net worth squares with the top bar's balance. Recent activity is the feed's sentence rows with the member's own name as plain text (no link back to the page you're on, A11Y-05); every other name stays a link.
- **Stats card:** a two-column `dl`. Solo bets and Parlays read "17–12" (won–lost; the words are read to screen readers), with "59% won · 2 refunded" under it in `--ink2`; Net profit and Best parlay; then Biggest win across both columns, its market's title under the figure; then Markets created and Tasks completed. "None yet" is caption-sized `--ink2`. Figures never wrap. The skeleton draws the card with history line for line, so nothing jumps when it streams in.
- **Edit profile:** one card at reading width: the Photo fieldset (avatar, Change photo, Remove photo), Display name, Bio, then Save profile.
- **Settings:** each card's `description` says where it applies: Appearance & motion "On this device."; Notifications "Turned on for each device. What you get follows your account."; Account "Your profile shows on every device you sign in on." No page subtitle. Where push can't work (no server key, a browser without it, an iPhone not on the Home Screen, or blocked), the "Notify me about" choices are a disabled fieldset with one `--ink2` line saying why, and Save choices is disabled. Turn on notifications and Turn off on this device are text only.
- **How it works:** the `h1`, then Betting, Parlays, Earning DC and When a market ends, each an `h2` and two or three plain sentences, no cards; then Questions, an `h2` over divided rows of native `<details>` (52px summaries with a chevron that turns when open); then "Read the full rules", a bold link to `/how-it-works/rules`. The copy lives in the page and must stay true to `docs/HOW-IT-WORKS.md`.

## Admin queue and members (#399)

- **Bulk bar:** at the top of To review, `sticky` under the top bar, a `--surface` panel with a hairline and the tile radius: Select all, "2 selected · pays 35 DC" (a polite live region), then Reject selected… (secondary) and Approve selected (primary, confirmed with the count and DC). Reject selected with nothing ticked says "Select at least one submission." instead of opening a dialog.
- **Queue rows:** one `<table>` at every width with explicit table roles. From `lg`, columns under eyebrow headers: the checkbox, Member (a link), Task with its reward in gold, Proof, Sent, then Approve (secondary, a direct button) and Reject… (quiet). Below `lg`, each row is a grid: the checkbox, then member, "Task · 10 DC · 2h ago" and the proof line stacked, then the buttons. The proof line is a `<details>` whose summary reads "Note · 1 photo" and opens the note and `ProofList`; "Nothing attached" without either. Your own submission has no checkbox and reads "Yours: another reviewer reviews it."
- **Reject dialog:** "Reject Ben’s Read Genesis 1–3?" (or "Reject 3 submissions?"), "Nothing is paid. They can try again.", one optional "Why not?" field with "Shown to them with the rejection.", Cancel and Reject.
- **Admin › Member:** one reading-width column: the header (email, joined and last active; the balance as plain bold text, not a chip; the role chip; Public profile), Coin history, then for the owner Role (its select labelled by the card's heading), Adjust balance and Access last.

## Activity rows and reactions (#395)

- **A feed row is a sentence** (#187): the member's and market's names are its links and its only tap targets, each given a 44px tap area by `hit-area` without growing the row (A11Y-06). The row itself never presses, lifts or opens anything. The age sits on the right, and on a row that takes reactions the React button sits under it, right-aligned, its 44px box hanging into the row's edge and bottom padding, so a row nobody reacted to is its sentence and age alone.
- **The sentences** (`describeEvent`): "Ruth bet 20 DC on No in {market}", "Ruth placed a 3-pick parlay for 8 DC", "Ruth created {market}", "{market} resolved Yes", "Ruth called off {market}", "Ruth won 175 DC on {market}", "Ruth's 3-pick parlay paid 160 DC", "Ruth completed {task} (+10 DC)" and "Ruth was September's champion with +140 DC".
- **Reactions on demand:** under the sentence, as a "Reactions" group shown only when there are any, the reactions someone has given, each a 32px pill drawn inside a 44px-tall button (its emoji and count, `aria-pressed` for your own, which is `--acc-soft` with an `--acc-text` edge; anyone else's has a `--line-s` edge, A11Y-07), plus one **React** button under the age (a lucide `SmilePlus`, `aria-label="React"`, 44px tap area) that opens a popover with all four reactions as 44px toggles. Focus stays in the popover while it's open, Escape closes it, and picking one closes it. Tapping a pill adds or takes back your own; taking back the last of a kind removes its pill and moves focus to React. Reactions stay optimistic, since they move no coins.
- Home's Activity uses the same row without reactions. The feed's skeleton draws one React button under each row's age. `ReactionBar` renders the pills and React as two cells of `FeedItem`'s grid (the sentence spans rows 1 and 2 beside the age and React; the pills take row 3), so one optimistic state drives both.

## Sign in and Not invited (#329)

Written for someone who has just been invited: get them oriented, then signed in. Both pages are `SignInFrame` (`components/sign-in/sign-in-frame.tsx`), not a `<Page>`, since they're outside the signed-in shell.

- **Contents, in order:** the wordmark (static, not a link) with the `BetaBadge` beside it (#354), a sample market card, the `h1` "Friendly bets. Faithful study.", one plain sentence under it ("Bet on friendly questions and earn DC with Bible-study tasks. Play money, invite-only.", #387), the "Sign in with Google" button (`SignInButton`: the primary `Button` with `GoogleMark`) with "Use the Google account your invite was sent to." under it, and Privacy. While Google opens, the button shows `LeafLoader` and "Opening Google…"; after a failed direct sign-in (`?error`), a secondary "Try another way" button beneath it goes through Supabase's redirect.
- **The sample market** (`SampleMarket`) is hard-coded: signed-out visitors can't read markets and real questions mustn't leak. It looks like a `MarketCard`: Open and Church chips and "Sample", "Will the sermon run past noon?", a plain-SVG step-line chart in `MarketSparkline`'s style (Yes in `--s2`, No in `--line-s`, a baseline and a dashed 50% line) with end labels, and "Sam bet 10 DC on Yes · just now" beside Yes's %. Screen readers get it as one image named "Sample market: …".
- **Layouts:** one column on a phone, card first. The page never scrolls on a phone: one 740pt tall or less (below `lg:`, the `short:` variant; the full page needs about 727pt) drops the chart's axes and the sentence. At `lg:` the copy (up to 480px, the button 380px) sits left of the card, 64px apart, both starting 32px under the wordmark rather than centred in the window (#354), and the `h1` is 52px.
- **The intro** plays once a session (`sessionStorage`), from a script that runs before the first paint (`components/sign-in/sign-in-intro.tsx`), so the page opens on the first frame or the last, never both:
  1. 0–0.9s: the D sits centred at the launch screen's size (`32vmin`) on the page background and its leaves grow in (`launch-leaf`, the launch screen's own frames).
  2. 0.9–1.35s: the symbol flies into the wordmark (`IntroDirector`, measured, `DURATION.sheet` on the iOS curve) as the backdrop fades.
  3. 1.1s on: the card rises in, then the copy; from 1.3s the chart draws; at 1.9s and 2.05s two bets land as steps on the line, and Yes counts 54% → 61% through `AnimatedNumber`.
  The times are `INTRO` in `components/sign-in/intro-timeline.ts`; the pre-paint script that starts the intro writes its CSS delays onto `<html>` as `--intro-*-at` properties (`INTRO_CSS_DELAYS`), so the CSS ("Sign-in intro" in `globals.css`) holds no time of its own beyond the motion tokens. In the installed app the launch screen plays over the first 0.9s and fades as the symbol starts to move. Reduced motion (the device or Settings) starts on the final frame.
- **Not invited:** the same frame with the sample card at 35% opacity, the `h1` "You're not on the list yet", the refused account's email when the callback passed it, a line about checking with the friend who invited them, and "Try another account" as a primary button with the G mark, back through sign-in with `next` kept.

## Navigation (one `<AppNav>` in the signed-in layout)

- **Tabs (D1, #385):** Home, Markets, Bets, Tasks and Leaders. The feed is Home's Activity section, whose See all opens `/feed` (h1 "Activity") as a drill-down from Home, which stays the marked tab there. The wordmark still links home but is never marked current.
- **Desktop:** a 72px top bar with the wordmark, then Home, Markets, My bets, Tasks and Leaderboard. On the right: the balance chip (a link to My bets) and your avatar. The active item is a filled pill. No Admin link and no BETA badge (the badge stays on sign-in and Not invited).
- **Phone:**
  - Top bar (64px): wordmark, balance chip, avatar, for every role. The balance chip is text only ("4,886 DC", no coin icon).
  - Bottom tab bar with 5 tabs: Home (lucide `House`), Markets, Bets, Tasks, Leaders. Bets has `aria-label="My bets"`; Leaders has `aria-label="Leaderboard"`.
- **The avatar is a menu** (`ProfileMenu`, Base UI Menu, `components/app-nav/profile-menu.tsx`): Your profile, Settings, Admin (reviewers and above) and Send feedback, each a 44px link. When work waits on a reviewer or above, the avatar carries a small red dot (`bg-loss`, `ring-surface`), its name says how much ("Your profile and settings, 3 waiting"), and the Admin item says it in words (`AttentionCount`, "3 waiting").
- **Admin** is reached from Home's Needs you rows and the avatar menu. It opens on the section with work in it: Tasks when task submissions wait, else Markets when markets wait to be resolved, else the first section the role can see (Invites for an admin or the owner, Tasks for a reviewer; `adminHref`). Inside Admin, the sections are a `SubNav` (Invites, Tasks, Markets, Members, Ledger, each shown by role), whose Tasks and Markets tabs carry their share of the count as a red badge on the label's corner (`AttentionBadge`, `components/ui/attention-badge.tsx`), read as the tab's description, "2 waiting" (#351). Below `md:` that row scrolls sideways edge to edge, starting scrolled to the current tab, so nothing clips at 320px. A reviewer, with only Tasks, gets no tabs.
- **Status band:** the light theme's `--status-band` against the new top bar still needs a check in the installed app (#385); it's unchanged.
- **The slip** is its own floating button (`SlipSheet`), not a tab badge. It rises 12px and fades in with the first pick (`--duration-enter`, iOS curve) and fades out after the last (`--duration-fast`); a button already there when a page loads just shows. Reduced motion keeps the fades and drops the rise. It sits bottom-right, above the tab bar on a phone, and `SlipSpacer` adds room at the foot of every page (72px, 88px from `md:`) so the last control can always scroll clear of it.
- **Switching tabs (#384)** is an instant swap, as a native tab bar's is: the nav, the tab bar, the balance chip, the wordmark, `SubNav` and Home's See all for My bets navigate with the `nav-tab` transition type, which has no fade or rise. A page visited in the last 30 seconds comes back from the client's cache at once, with no skeleton, and then refreshes in place. A drill-down still slides, with the old page gone by 120ms (`--duration-press`) so two titles never show stacked.
- **Pending feedback (#384):** the nav's and tab bar's pill moves to the tapped tab on the tap, before the page arrives (`aria-current` stays on the page you're on until it does). A tapped card, row or button that links through `IntentLink`, or a card clicked under a mouse, dims to 70% until its page arrives. Neither shows for a page that was prefetched or cached, so a fast tap never flashes. No spinners.

## Components (Components page on the canvas)

| Component | Props (see each artboard's `renderVals`) | Build with |
|---|---|---|
| `AppNav` (TopBar + TabBar) | size, theme, current tab | lucide-react icons, motion `layoutId` for the active pill |
| `ProbabilityChart` (the market page only, loaded lazily) | per range: the plotted outcomes' series, with times | Recharts v3 through `components/ui/chart.tsx` (adapted from shadcn/ui's chart and copied in): one `<Line type="stepAfter">` per plotted outcome, a crosshair tooltip, end labels, and a screen-reader table of the plotted points (see Charts) |
| `MarketCard` | title, leading chance and weekly change, chart, legend, meta | The title (a stretched link); the leading outcome's chance as a figure with its label and "▲ 8 this week" (`text-win`) or "▼ 5 this week" (`text-loss`), left out when it's 0 or there's no week of history; a resolved card leads with "Yes won", a called-off one with "Called off"; then `MarketSparkline` (`components/markets/market-sparkline.tsx`, 64px, the same window and colours as `ProbabilityChart`, plain SVG so the list server-renders it and ships no chart library); for multiple choice a one-line legend of the top three by chance ("● Sarah 44% · ● Eli 31% · ● Ruth 25%", then "+N more"); then the meta line ("Closes Sun 12:00 PM · 42 bets", "Closes in 3h" within a day, "Waiting for a result" past the close). No status, closes-soon or over/under chips: an over/under's line is in its label ("Over 42.5"). The leading outcome is Yes (or Over) on a two-outcome market and the favourite of several. |
| `OutcomeRow` | label, chance, what 10 DC wins (`soloPays`), state `add` / `inslip` / `disabled` / `none`, result `won` / `lost` | The name (`rowTitleClass`) over "10 DC wins 16" or "In your slip", the chance right-aligned (`figureInlineClass`, tabular), then Add or Remove (secondary, `sm`). A multiple-choice row keys its name to its chart colour with a dot. |
| `SlipPick` | market, outcome, chance or stale, stake, what it wins | A list card in the slip (see *Slip* above). |

The shared primitives are in `components/ui/`: Button (primary / secondary / danger / quiet; md and sm), Field (label, hint and inline error), StatusChip (six tones; md and sm), Card, Message (error / ok / gold), `SectionCard`, `ListSection`, `ListCard`, `EmptyState`, `SegmentedControl`, `SubNav`, `ShowMore`, `SearchField`, `FilterChips`, the confirm dialogs and the skeletons. Every repeated piece comes from these.

`SegmentedControl` (`components/ui/segmented-control.tsx`, #381) is every segmented control: a `--sunk` track with the tile radius and 4px padding, 44px segments with the segment radius, and one `--segment-active` pill with an `--ink2` border (the 3:1 indicator) and `shadow-tab` that slides on `PILL_SLIDE` (still under reduced motion). `SubNav` is its link form, with tab state in the URL and `aria-current`; the theme control (radios), the slip's Solo/Parlay toggle (pressed buttons) and the chart's range (a Base UI toggle group) are its local forms.

### Charts

The market page's `ProbabilityChart`, the cards' `MarketSparkline` and the leaderboard's race (#391):

- **One line for two outcomes.** A yes/no market draws only Yes and an over/under only Over, in `--s2` (green); the other side is the same line read from the top. Multiple choice draws one line per outcome.
- **Colours.** `outcomeSeries` gives Yes and Over `--s2`, No and Under `--s1`, and multiple choice `--s2`, `--s3`, `--s4`, `--s5`, `--s1` in its order, a sixth outcome `--s6` (grey). The race colours each member from their id (`memberSeries`), so a colour follows the member, not their rank, and nobody is special-cased.
- **Labels.** End labels are ink text (`--ink2` for a losing line) beside a small dot in the series colour, pushed apart so they never overlap and joined to their line by a `--line-s` leader when moved. The market page's y ticks (25%, 50%, 75%) sit inside the plot's left edge, clear of the end labels. The close date goes in the caption above the plot ("12 bets · Closed Oct 4"), never in the shaded zone.
- **Gridlines.** Solid `--line` hairlines, the 50% line included. The close line is the only dashed line.
- **Resolved.** The winning line stays at full strength and the others turn `--line-s`; the winner's end label reads "Yes won". A two-outcome chart's one line keeps its colour and carries the winner's name.
- **Tooltip.** Outcomes sorted by chance, highest first, following the pointer. On a phone the race's readout sits above the plot instead, so it never covers the lines.
- **Time bucketing.** Points are thinned by time, not by count: about one point every 3px of plot width (`bucketByTime`, `PX_PER_POINT`), each bucket keeping its last value, so a burst of bets is one step rather than a comb. Cards draw at most 24. Lines stay `stepAfter`.
- **Text alternative.** Each chart is an image named for how its lines moved over the visible range ("Yes rose from 46% to 61% this week", `describeMovement`). The market page adds a visually hidden table of the plotted points for the chosen range; the race keeps its keyboard slider and live region.
- **Data points:** an outcome's chance at a moment is the market maker's price then (shares sold, parlay legs included), so a new market starts at an even split; an older pool market's history uses its seeded pools (`effectivePools`). SQL samples the series, so no page reads every bet: `market_sparklines` gives the market page's chart 200 points (`lib/markets/chart-series.ts`), and `market_sparks` gives each card at most 24 compact points, cached per list in Next's data cache and keyed by its markets' pool versions (`lib/markets/sparklines.ts`). Both prepend the even opening split (`withSeededStart`). The weekly change on a card is read from those points: the leading outcome's chance now against the last point at least a week old.
- **Ranges:** 1D, 1W and All, each offered only when the data spans it; hide the range buttons when there's only one.
- **Closed markets:** shade the area after the close time.
- **No bets:** "No bets were placed on this market."
- **No animation.** Recharts animation stays off.

## History

The mockup's library plan (Recharts, NumberFlow, Base UI in place of vaul and Radix), its copy sign-offs and its suggested build order were all done by v0.2.0-beta. They're in git history and in `docs/archive/` if you need the detail.
