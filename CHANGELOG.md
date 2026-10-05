# Changelog

Releases are tagged on GitHub; each one lists its pull requests. DwellDuel
is live at [www.dwellduel.com](https://www.dwellduel.com), and every merge to
`main` deploys, so a release marks a milestone, not a deploy.

Each release's notes use these headings, in this order, leaving out any
that are empty: **Security**, **Features**, **Fixes**, **Polish**, **Under
the hood**, **Tests**. Add a line under `## Unreleased

## Unreleased

### Polish
- **Dark mode has its own colour roles.** Links and card titles are near-white instead of lime. The desktop nav pill and a chosen filter chip are near-white with dark text, the phone tab bar's pill and a chosen segment are a raised `#17434A`, and lime fills are left to the primary button and first place. A won bet or parlay gets a win-toned chip and a resolved market a neutral one, in both themes; the segmented pills' shadow has a dark value, and light mode's stronger borders clear 3:1 (#380).
- **One type, radius and padding vocabulary.** Figures come from three named sizes, every corner from a radius token (a new 10px segment radius; the home hero takes the card's), every card from one padding, and bet, parlay and catalog titles match a market card's. The four segmented controls (sub-tabs, theme, Solo/Parlay, chart range) are one `SegmentedControl` with one sliding pill, and the small chips are `StatusChip`'s new small size (#381).
- **Amounts are grouped.** Every DC amount reads "2,577,831 DC", animated ones included, and never wraps mid-figure; tabular figures are kept for columns that line up (#382).
- **Calmer motion.** Under a mouse, buttons, tabs and nav items no longer grow on hover; they change colour, every control still gives on press, and cards still lift. The tab bar's icon no longer pops, and the nav's labels change colour as the pill slides under them instead of after. Numbers count only when they change, not on every page load, and Reduce animations gives a short cross-fade between pages instead of a hard cut (#383).
- **Tabs switch instantly.** Changing tabs swaps the page at once instead of fading out and in, and a tab you visited in the last 30 seconds comes back straight away without a loading skeleton. The tab pill moves the moment you tap, a tapped card or row dims until its page arrives, a drill-down no longer shows two titles stacked mid-slide, and the slip button rises in and fades out instead of popping (#384).

### Under the hood
- **More Claude Code setup.** Hooks that lint each edited file as CI does and refuse hand edits to the generated database types and `.env` files; `new-route` and `pr-ready` skills; `money-path-reviewer` and `conventions-reviewer` agents; and the context7 docs server in `.mcp.json` (#379).

## v0.10.1-beta — 2026-10-04

A fixes release. The sign-in page fits a phone with the familiar Sign in with Google button, Create market's closing-time hint tells the truth about moving it, and the daily keep-alive that stops the database pausing passes again. Behind the scenes, Sentry now gets readable stack traces, the docs were reviewed end to end, and Claude Code works in the repo behind guard rails that keep production changes going through pull requests.

### Fixes
- **The daily keep-alive cron passes again.** Its idempotency-key cleanup had failed every run in production with "permission denied", because the production database never gave the server read and write rights on three tables that local databases do. The server can now read and write every table there, as it does locally, and new tables get the same rights (0109, #362).
- **The sign-in page doesn't scroll on a phone.** The paragraph under the headline is gone, and a phone too short for the rest drops the three facts, so the whole page fits on one screen (#366).
- **Create market's closing-time hint is right again.** It said the closing time can't change later; it can be moved while the market is open, unless you bet on it, and only the outcomes (and an Over/Under's line) are fixed (#371).
- **My bets' Cancelled tab explains itself.** Its empty state said "Bets you cancel…", but bets are final; it now says the tab keeps bets cancelled before October 2026 (#372).
- **Create market's Type heading has room to breathe.** It sits as far above its options as Title does above its box, and Outcomes matches too (#365).

### Polish
- **The old Sign in with Google button is back.** It replaces Google's own button and still goes straight to Google, so Google's account chooser still says "continue to dwellduel.com". Nothing of Google's loads on the page any more (#366).

### Under the hood
- **Readable production stack traces in Sentry.** A Vercel build holding `SENTRY_AUTH_TOKEN` uploads its source maps to Sentry under the deploy's release, links the release to its commit, then deletes them from the output, so nothing public changes. Vercel never had the org and project set, so no build uploaded until `next.config.ts` defaulted them to `dwellduel` and `dwell-duel`. Builds without the token (CI, e2e, local) are unchanged, and an upload that fails only warns (#348, #370).
- **Less noise in Sentry from sign-in.** A blocked or unreachable Google sign-in script stopped reporting errors, and the detail-free "Script error." browsers report for a cross-origin script is dropped; since #366 nothing of Google's loads at all (#363).
- **Guard rails for Claude Code in the repo.** A checked-in `.claude/settings.json` refuses `supabase db push`, pushing straight to `main`, the Supabase connector's write tools, and the Vercel and UptimeRobot connectors' irreversible ones, and a hook refuses edits to a migration that's already on `main`. `.mcp.json` adds a read-only Supabase server scoped to production, and two project skills (`new-migration`, `release`) write down how those are done here (#368, #376).
- **The docs match the app again.** A full review brought README, Getting started, the admin guide, Architecture, Operations and Security up to date with LMSR pricing, the direct Google sign-in, 0109's grants, the monitoring now in place and the Claude Code setup. How it works now says error reports go to Sentry, Operations gains a Monitoring section, Security gains an AI agents section, and the October plans moved into `docs/archive/` (#369).
- **The scale seeder makes today's data.** Its markets are priced by the market maker and its bets and parlays go through the slip's own function, in order, so the seed matches what the app makes and about 70 markets stay open to bet on; its parlay step, which had placed nothing since bets went final, works again (#373).
- **Tidier code and setup notes.** The unused `chip` button size is gone, a comment on parlays riding an outcome is current, and the local Google sign-in notes agree on where the keys go (#374, #375).

## v0.10.0-beta — 2026-10-03

A polish release from a round of phone testing. Pages open at their top, the tab bar stays at the bottom of the installed iPhone app after typing, and dark mode shows less white during a reload. The admin tabs show their count as a badge, Create market explains each market type, and the sign-in page loses the white box around Google's button and gains a beta badge.

### Fixes
- **A new page opens at its top.** Switching pages from one scrolled only a little, or between Admin sections, used to keep the old scroll position; going back still returns to where you were (#349).
- **The tab bar stays at the bottom after typing.** In the installed iPhone app, the tab bar and top bar could stay a keyboard's height up the screen after the keyboard closed, most often after tapping a tab while a field had focus; the app now puts them back once the keyboard has gone (#350).
- **Less white between pages in dark mode.** A full page load, such as the reload after an update, now starts on a dark background in dark mode instead of white (#353).

### Polish
- **Admin tabs show a badge, not a number in brackets.** Tasks and Markets carry the same red badge as the top bar's Admin button, so the tabs stay on one line on a phone (#351).
- **Choosing a market's type explains each one.** Create market's type picker is three cards, Yes/No, Multiple choice and Over/Under, each saying in a line what it asks; stacked on a phone and side by side on a wide screen (#352).
- **A tidier sign-in page.** The white box around Google's button in dark mode is gone, the page says it's a beta beside the wordmark, and on a wide screen the page starts under the wordmark instead of floating mid-window (#354).

## v0.9.0-beta — 2026-10-02

Every bet now pays a fixed amount you see before you place it. Markets are run by a market maker, so the slip shows exactly what a bet or parlay pays, odds move as people bet, and bets are final once placed; open markets switched over without changing anyone's payout. Markets have categories to filter by, a closed market can be reopened for more bets, lists across the app are cards, and new invitees get a sign-in page that shows what DwellDuel is.

### Features
- **Every market pays a fixed amount, and bets are final.** Markets are now run by a market maker (LMSR). A new market opens at even odds, a bet buys shares that pay 1 DC each if its outcome wins, and the slip says exactly what a bet pays ("Pays 18 DC if it wins", no "~"). If the price moves by more than 2% before you place it, the slip shows the new payout and asks again. Bets can't be cancelled, the chance, chart and sparklines show the market maker's price, a void refunds what each bet cost, and the owner's economy panel has a Market maker line (#325, #333).
- **Parlays pay a fixed amount and move the odds.** A parlay's stake is split evenly across its 2 to 6 picks, and each part buys shares at its market's price, so the slip shows exactly what the parlay pays ("Pays 49 DC (4.96×) if every pick wins"). There's no cap on the multiplier or payout, your own markets count, and no money from others is needed first. A voided pick drops out and the rest pay at their own odds; if all are voided, the stake comes back. Best parlay uses the multiplier fixed when the parlay was placed (#334).
- **Open markets switched over, and nobody's payout changed.** Markets from before fixed payouts that were still open, or closed and waiting for a result, switched over at this release. Each bet now pays exactly the "Pays ~" it showed, each outcome's chance stayed where it was, and if a market resolves to an outcome nobody had backed at the switch, the bets placed before it are still refunded, as the old rules promised. Pending parlays had their unset picks' odds set from the pools as they stood, with the old 20× and 1,000 DC caps kept. How it works is rewritten for one set of rules (#335).
- **Market categories.** Every market now has one category, chosen when it's made: type to pick from the suggestions, tap one of the six most used, or type a new one (up to 24 characters; capitals and spacing don't make a new one). Markets shows a row of category chips, All, the eight busiest and More…, that scrolls sideways on a phone and stays in the link, with a "Showing … in X · Show all categories" line; cards and the market page show each market's category. The creator can change it until the market closes and an admin at any time, each change listed under Edited, and Admin › Markets gains a Categories section to rename, merge and hide them. Existing markets are in Other. The Everyone's / I bet on / I made chips are gone, and old links to them show every market (#327).
- **A sign-in page for new invitees.** Sign in opens on the DwellDuel symbol growing its leaves and settling into the wordmark, then a sample market draws its chart as two bets land, above "Friendly bets. Faithful study.", what DwellDuel is in three lines, and the Google button with a reminder to use the invited account. It plays once a visit (never under reduced motion), keeps the button on screen on an iPhone SE, and splits into two columns on a desktop; Not invited gets the same look (#329).
- **Change a market's close time, and reopen a closed market.** The market's creator or an admin can now move the close time from Edit, later or earlier as long as it's still to come, and a market that has closed with no result shows **Reopen**, which takes bets again until a new close time. Both ask first, naming the new time. A creator with money on their own market asks an admin instead. Bets already placed stay as they are, a reopened market leaves Markets to resolve until it closes again, its closing reminders go out again then, and every move is listed under Edited (#326).

### Fixes
- **A settled parlay still counts as a stake.** Its owner can't resolve a market their parlay has a leg on even after the parlay was settled elsewhere, since an override there could bring it back, and a creator with a bet or parlay leg on their own market now asks an admin to void it (#334).
- **A converted parlay's page explains it truly.** Its "How it adds up" note says each pick's odds came from the pools and were fixed by the October 2026 switch, and that the old 20× and 1,000 DC caps still apply, instead of the split-stake wording of new parlays (#335).
- **A creator with a stake in their own market no longer sees Void.** The database has refused it since #334; the market page now asks `can_void_market`, as it asks `can_resolve_market` for Resolve, and tells the creator a reviewer resolves it and only an admin can void it (#335).
- **A moved-price message clears when you change the stake.** The slip's "The price moved, so this bet now pays N DC" note no longer lingers beside a stake it no longer describes (#334).
- **Category changes show without a reload.** When an admin renames, merges or hides a category, Markets, Home and the other pages listing markets update within seconds, and an open market page updates its category chip (#345).

### Polish
- **List items are cards across the app.** Bets, tasks, the leaderboard, markets waiting to be resolved, the admin task catalog, pending approvals, admin members and the home tiles now share My bets' parlay card: a hairline border and 14px corners, spaced apart instead of divided, in two or three columns on a wide screen. The feed, ledger, coin history, invites and a market's bet list stay divided rows (#328).

### Under the hood
- **The last LMSR leftovers are gone (0108).** `pick_quotes`, kept by 0107 for the build serving during that deploy, is dropped, as are `enforce_write_limit`'s message for the dropped `bet_cancel` limit and `cancelled_bets`' place in the realtime publication, which no page follows any more. `market_categories` pings the `markets` topic, and joins the publication so the market page can follow its own category's row (#345).
- **The pool rules' leftovers are gone (0107).** With no pool market open since #335, `cancel_bet`, `remove_bet`, `refund_room`, `place_slip`, `place_slip_v2`, `place_slip_v3`, `create_market` and `create_market_v2` are dropped, with the cancel write limit; the app loses the Cancel and Remove controls, the slip's pool estimates and parlay rules (`pick_quotes`, `soloPayout`, the leg floor note), the pool parlay fallback after placing, and its live follows of `cancelled_bets`. Everything history and overrides still read stays: My bets' Cancelled tab, the seed, locked parlay odds, `pool_payout` for re-resolving an old market, `pick_quote` and `parlay_leg_odds` for old parlays, and `pick_quotes` until the previous build is gone. The audit is in `docs/archive/superpowers/plans/2026-10-02-lmsr-5-cleanup.md` (#332).
- **Converting open pool markets at release (0105).** `convert_pool_markets_to_lmsr()`, which the migration calls once and refuses to run on a pool that doesn't equal its live bets, gives each live bet `shares` equal to its `pool_payout`, `cost`, `converted` and `refund_outcomes`, starts each market maker at the shown chance (`q = 50 ln p`, shifted, with `q_offset = q − shares`), and fixes each pending pool parlay (`converted`, legs locked at `pick_quote`, `factor` = locked odds, no book shares, 0074's capped `multiplier` and `payout`). `resolve_market_core` refunds a converted bet whose `refund_outcomes` has the winner, `settle_parlay` keeps a converted parlay's caps when a leg is voided, `market_sparklines` charts converted bets at their pool chance, member stats, records and awards count those refunds as refunded, `place_slip_v2` and `place_slip`, and `create_market_v2` and `create_market`, refuse after replaying a finished key, so no pool market can be made after release, and `can_void_market` is new. Tests make a pool market with `createPoolMarket`. The DB tests' slip calls move to `place_slip_v4`, and the ledger check allows a converted parlay's legs a factor without shares (#335).
- **Fixed-payout parlays in the database (0104).** `place_slip_v4` and the internal `place_lmsr_parlay` buy each leg's shares into the house parlay book and store each leg's factor and the parlay's multiplier and payout; `settle_parlay` pays them, a voided leg dropping its factor; `parlay_limits()` caps every parlay at 6 legs; a `parlay_legs` trigger keeps each leg's figures matching its market's pricing; the economy panel books these parlays on the market maker line; charts include parlay legs and compute their weights in double precision (about 35× faster); the DB tests' ledger check now holds each outcome's shares equal to its bets' plus its parlay legs', and `activity_feed`, their oracle, pays `floor(shares)` on new markets (#334).
- **Categories in the database (0103).** `market_categories` with a unique slug, `markets.category_id` defaulting to Other so the previous build keeps creating markets, `create_market_v4`, `update_market` with `p_category`, admin rename, merge and hide functions logging to `market_edits`, and `category_counts()` for the chips (#327).
- **Fixed-payout markets in the database (0102).** `create_market_v3`, `place_slip_v3` and `place_lmsr_bet` price new markets by LMSR; `place_bet`, `cancel_bet` and `remove_bet` refuse them, so a cached older app can't bet on one; resolving pays `floor(shares)` and keeps the fractions for payout rounding; charts, the weekly recap's upset and member stats read the new rules, and the DB tests' ledger check holds each outcome's shares equal to its bets' (#333).
- **The maths for fixed-payout markets is in.** The LMSR market maker that will price markets and parlays at the moment you bet (#325) exists in the database and in the app, kept equal by a test, with nothing using it yet (#331).

### Tests
- **Tests of the pool rules' leftovers go with them.** The tests of cancelling, removing, the old slips and the old create paths are gone; tests that need a cancelled bet as history write it with `cancelBetForHistory`, the e2e slip and parlay specs run on fixed-payout markets, and pool history is still built with `createPoolMarket` and `place_bet` (#332).
- **The conversion, on a production-shaped snapshot.** `tests/db/lmsr-conversion.test.ts` builds binary, seeded multiple-choice, over/under, closed-but-unresolved, untouched, resolved and voided markets with several members' bets, a cancelled bet and seven pending parlays (locked at placement, at close, not yet, with a voided leg, at both caps), records every "Pays ~", chance, balance and parlay payout, converts, checks them all, resolves every market to every outcome and settles every parlay through wins and voids against the pool rules, and checks the refund rule with bets placed after the switch (#335).

## v0.8.0-beta — 2026-10-01

Signing in now feels like DwellDuel's own: Google's account chooser says "continue to dwellduel.com" instead of a long Supabase address, the sign-in page explains what DwellDuel is, and a public privacy page says what's stored and who to ask. Behind the scenes, every live-update channel is now private, and error reports to Sentry are clearer and quieter.

### Security
- **Every live-update channel is private.** The member's own balance channel and each page's row channels now join private Realtime topics only that member may open (0100), as the group-wide pings already did, so Supabase's "Allow public access to channels" can be switched off and nobody holding the public key can open channels and spend the message quota (#321).
- **`rls_auto_enable()` can't be called signed out.** Supabase's platform function behind automatic RLS loses EXECUTE for `PUBLIC` as well as `anon` and `authenticated` (0099), clearing the Security Advisor's warning (#320).

### Features
- **Google's sign-in says "continue to dwellduel.com".** With `NEXT_PUBLIC_GOOGLE_CLIENT_ID` set, the sign-in page shows Google's own button in redirect mode (it works in the installed iPhone app), and Google sends the sign-in to `/auth/google` on our domain, which checks Google's CSRF token and a one-time nonce before Supabase signs the member in. Without the variable, or if Google's script can't load, sign-in works as before (#322).
- **A public privacy page and a public description.** `/privacy` shows How it works' Your data section, now saying who runs DwellDuel and how to ask about your data, and the sign-in page says what DwellDuel is and links to it, ready for Google's brand verification (#322).

### Fixes
- **Sentry no longer reports a skipped page transition.** Rotating a phone or opening the keyboard mid-navigation made the browser skip the animation, and React left that rejection unhandled; those events are now dropped (#320).
- **A Supabase error reported to Sentry says what failed.** A timed-out or refused call is sent as an error named for its step (for example "Closing alerts failed: TimeoutError: …") with the caller's stack, instead of a bare message with no frame of ours (#320).

### Polish
- **The privacy page lists a contact email** for questions about your data (#323).

## v0.7.0-beta — 2026-10-01

Finding things and knowing where you stand are much easier. Markets has a title search and "I bet on" / "I made" filters, the Feed has Results and Mine tabs, and a market you have money on now shows a **Your position** card with each bet, what it pays and how it ended. Each outcome shows the DC riding on it in pending parlays, without moving the odds. New members get a clearer start: How it works comes first, 0 DC points to Tasks instead of a dead end, and the slip shows your balance and what's left after you bet. Lists load faster, and live updates are lighter and stay within the free-plan limits, falling back to a refresh every minute if a connection can't be made. Signing in returns you to the link you opened, and accessibility and layout polish touches the tab bar, toasts, My bets and long names. For admins, Members and Invites have search, tabs and paging, each member has their own Admin page, and the task review queue pages instead of loading everything. Behind the scenes there are caps and retention on stored files, limits on how fast members can write, a Your data section on what DwellDuel keeps, and new Admin guide, Operations, Releasing and Security docs.

### Security
- **Members' writes are rate-limited.** Each member can make at most 20 markets a day, 10 comments a minute (200 a day), 60 reactions a minute (1,000 a day), 30 task submissions a day and 20 bet cancels an hour; going over shows a message saying so. Admins and the owner aren't limited, and a member keeps notifications on their ten most recently used devices (#273).
- **New database objects grant signed-out visitors nothing by default,** and a schema-wide test fails on any table without RLS, any grant to `anon`, or any new SECURITY DEFINER function a signed-in account can call that hasn't been reviewed (#274).
- **Google accounts that were never invited are deleted a day later** by the daily cron, instead of staying in Auth forever (#275).
- **Dependencies and headers tightened.** Next is upgraded to 16.3.8 (with `eslint-config-next`), the `x-powered-by` header is gone and a `Permissions-Policy` denies camera, microphone and location (#276).

### Features
- **The market page shows your own position.** A market you have money on gets a **Your position** card, above the chart on a phone and at the top of the right-hand column on a computer: each of your bets with what it pays if it wins and its own Cancel, and each parlay with a leg there, linking to the parlay. Once the market settles it shows each bet as Won, Lost or Refunded, what you won or lost on the market overall, and where each parlay leg and its parlay stand. "No more bets" on a resolved market now says solo bets have been paid and parlays pay once every pick has settled (#262).
- **Parlay money shows on each outcome, without moving the odds.** Each outcome on a market page shows the DC riding on it in pending parlays ("+45 DC riding in parlays"), each parlay's full stake on every pick, updated live, with a note that parlays are paid by DwellDuel and never move the pool. It's a total only, never whose; the pool, chance, payouts and charts don't count it (#279).
- **Admin › Members and Invites work at a thousand members.** Both have a search box (Members by name or email, Invites by email), tabs (Members: Active · Removed; Invites: Waiting · Claimed) with counts, and "Show more" paging, so nobody past the 1,000th row is silently dropped. Members are compact read-only rows; each opens the member's own Admin page with Adjust balance, Role, their last coin movements ("Open in Ledger", which filters Admin › Ledger to them with `?member=`) and Remove from DwellDuel. New-market notifications now reach every opted-in member past the first 1,000 (#254).
- **Lists can be narrowed.** Markets has a title search and "Everyone's · I bet on · I made" chips (a search or a chip lists matches as one flat list, newest first), the Feed has All, Results and Mine tabs (a void counts as a result, and Mine shows voids of markets you bet on or made), and on a phone the Net worth board has a compact standing card whose "Jump to me" opens the list ten ranks above your own row, so a member ranked 600 no longer pages down twelve times (#264).
- **Getting started has five steps, How it works first.** New members are pointed to How it works and to turning on notifications on this device, before the photo, first bet and first task. Once the card is gone, the installed app without notifications asks once to turn them on, in place of Get the app (#260).
- **0 DC isn't a dead end.** At 0 DC, Home and the slip point to Tasks, Home with what tasks pay. The slip shows your balance and what's left after it (or how many DC short it is), and a line under Place says why it can't be tapped (#260).
- **How it works opens with the short version**, has a collapsible "On this page" list on phones, keeps the formulas in "The maths", and says "shared pot" and "Monday–Sunday weeks" instead of jargon (#260).
- **A link survives signing in.** A shared market link opened while signed out lands on that market after sign-in, not Home; only a same-site app path is accepted. Google always asks which account to use, so "Try another account" really offers another, and the not-invited page says which account was refused (#263).
- **Settings links to what DwellDuel keeps about you.** How it works has a new **Your data** section: what's stored, who can see it, where it's kept, how long (proof 30 and 90 days, backups about 60) and how to leave or ask for deletion; Settings' Help card links straight to it (#286).
- **Admin links to the new Admin guide** (`docs/ADMIN-GUIDE.md`): roles, inviting, resolving, overriding and voiding, reviewing tasks, members, balances and the ledger, for reviewers, admins and the owner (#283).

### Fixes
- **Live updates no longer die on a fresh page load.** The live channels could join before the app had read your session, as a signed-out visitor, and the server then refused them, so your balance and the page stopped updating until a reload. They now wait for your session, and a refused channel falls back to refreshing every minute (#310).
- **The Markets tab opens on markets you can bet on.** Open markets now come first on the All tab however many are waiting on a result, with Awaiting resolution as its own list and its own Show more; before, 50 or more awaiting markets filled the first page. Home's open-market count leaves out markets past their close (#261).
- **The task review queue pages.** Admin › Tasks lists the oldest 50 pending submissions with "Show more", signs proof files only for the rows on screen, and takes its "waiting" badge from the whole queue instead of the page shown (#255).
- **Removed members are no longer ranked.** They drop off both leaderboards, out of "Rank X of N", the month's champion and the weekly recap's best call and top tasker; their profile still shows their net worth, marked "Not ranked". Admin › Members marks them Removed, and the owner can invite them again from their page, after a confirmation (#265).
- **Creator stakes stay within the URL limit.** A deep feed window asks about each chunk of 50 markets with only that chunk's creators, not every creator on the page (#272).
- **The void copy says what happens to parlays**: every bet is refunded, and parlays drop the voided leg and carry on with the rest. The resolve and override confirmations no longer say parlay legs are paid out: winning solo bets are paid, and a parlay pays once every pick has won (#266).
- **Home's Admin tile counts what the Admin badge counts**, approvals and markets to resolve, and opens the queue that has work in it (#266).
- **Create market explains the close time**: betting stops then, so set it before the answer is known, and the outcomes, close time and line can't change later; the preview notes that a reviewer resolves a market you bet on (#266).
- **Approved repeating tasks say when they open again**, such as "Again Monday, midnight ET" (#266).
- **The slip's "How parlays pay" link lands on its section** of How it works (#260).
- **A link to a section of How it works from another page now scrolls to it.** Following one from inside the app (the slip's How parlays pay, Settings' Your data) used to open the page at the top, because the section wasn't there yet while the page loaded (#286).

### Polish
- **Code nits.** One `GROUP_TIME_ZONE` for seasons, the recap week and the economy month; one shared `labelClass` for field labels and legends; exports nothing else uses are no longer exported (#272).
- **Accessibility fixes (#268).** Error toasts use the app's loss colours (5.65:1 in light, 7.18:1 in dark, where Sonner's own red was 4.35:1), the phone tab bar's active pill, Admin button and profile ring, and SubNav's selected pill, now carry an edge that reaches 3:1 on the page in light mode, and the Leaders tab's accessible name is "Leaders, leaderboard", so voice control hears the word on screen.
- **My bets on desktop (#269).** Parlay and bet tiles tint on hover like every other row inside a card, instead of lifting, and the grid aligns tiles to the top, so a tall parlay no longer stretches its neighbours.
- **Smaller fixes (#270).** A proof link longer than 2000 characters is refused in the picker (and by the task and resolve actions) with a plain message, instead of failing the whole submission; market, outcome and slip titles share the row title size; the Preview and race cards put their line in the description slot; more tap targets press; removing outcomes in Create market keeps keyboard focus; the global error page follows your theme; unknown URLs show the 404 inside the app's header and tab bar, with copy that no longer blames a removed market; `/admin` opens its first section and `/members` the leaderboard; long names on the podium wrap over up to three lines instead of cutting off at one.

### Under the hood
- **Live updates fit the free tiers at 1,000 members.** Group-wide changes (markets, pools, the feed, reactions, tasks and the review queue) now arrive as one private Broadcast ping per topic per transaction, at most one every 5 seconds, instead of a message per row to every open page, so a 150-winner resolution sends one ping rather than 150; only invited members can join, and only reviewers the review queue. A tab hidden for a minute closes its live channels and catches up when it returns, and a channel that can't join (past the connection cap, say) falls back to refreshing every minute instead of going quiet. The busiest topics, bets moving pools and the feed, refresh an open `/markets` or feed at most every 15 seconds. The proxy no longer runs on link prefetches, and the nav, tabs and long lists prefetch a page when you point at, focus or (for the nav) touch its link rather than whenever it scrolls into view. The Realtime and Vercel budget is modelled in `docs/ARCHITECTURE.md` (#250, #251).
- **`/markets` reads a tenth of the sparkline data, and only what changed.** Card sparklines come from the new `market_sparks` (0095): at most 24 points, as epoch seconds and shares to 4 decimals in outcome order, instead of 40 points with every outcome's id repeated; it answers the same for every invited member and refuses anyone else. Each list's series are kept as one entry in Next's data cache, keyed by its markets' pool versions (0095's `market_outcomes.pool_version`, bumped on every bet and cancellation), so a render costs one cache read per list and a live refresh reads from Supabase only a list whose markets moved. With 200 markets and 20,000 bets seeded locally, the All tab's sparkline reads from Supabase went from 722 KB a render to 85 KB on a cold cache and nothing on a warm one, and the page's HTML from 1,014 KB (135 KB gzip) to 951 KB (104 KB gzip). The cache's reads and the remaining egress are modelled in `docs/ARCHITECTURE.md`'s budget (#252).
- **This month's awards read who is still in from the same rule as the boards** (`invited_member_ids()`), instead of their own copy of it; no award changes (#265).
- **Unused database objects are dropped (0098).** `market_outcomes`, `tasks` and `feed_reactions` leave the realtime publication (live updates are Broadcast pings now), and `markets.sparkline`, its trigger and the two old claiming push functions (`push_resolve_reminders`, `push_market_alerts`) are removed. Nothing in the app used any of them (#317).
- **Storage can't fill up the free 1 GB plan (#253).** Proof photos are smaller (1200px, quality 0.7, WebP), a submission takes at most 5 attachments with 3 files and 6 MB of files, and the proof bucket takes 3 MB a file and no Word files. The database enforces per-submission caps and a daily per-member upload quota, so the limits hold however a file is uploaded. Submitted proof can no longer be deleted by its owner. Proof of a reviewed task expires after 30 days and resolution proof after 90 (the rows stay, marked expired), avatar files nothing points at are swept daily, and the daily cron reports Storage use and fails past 800 MB. The retention rule is in How it works.
- **Node is pinned for Vercel** with `engines.node: 22.x`, matching `.nvmrc` and CI (#277).
- **CI caches stay under GitHub's limit.** The Next build cache is keyed on the lockfile and saved from `warm-caches.yml` (which now also warms npm and Playwright), a closed PR's caches are deleted, `closing-alerts` has a timeout, and a test fails on any action not pinned to a commit SHA (#277).
- **Vercel Analytics and Speed Insights are sampled** (10% and 5%) so their free quotas last the month at 1000 members (#278).
- **Docs for running DwellDuel.** `docs/OPERATIONS.md` now covers rollback (Vercel's one-step Instant Rollback and Undo Rollback, forward-fix migrations), rotating every secret, what each alarm means, owner recovery and the free-tier limits (#282); `docs/RELEASING.md` is the release checklist (#286); `SECURITY.md` is a full policy with scope, testing rules, response targets and the trust model (#284); `docs/GETTING-STARTED.md` adds a first-week path, worktrees and the shared local database, testing money paths and working as a collaborator (#285).
- **Docs match the code.** The VAPID keys only warn at boot, ARCHITECTURE lists the direct table writes RLS allows, notification preferences include review alerts, AGENTS.md names `place_slip_v2`, the README links GitHub Releases instead of a table, and the changelog states its headings (#280). The dated specs and plans moved to `docs/archive/` (kept out of ripgrep by `.ignore`), and the design handoff describes the app as built (#281).

### Tests
- **Your position and riding in parlays are covered end to end**: `my_market_position` names only the caller's own bets and parlays, `market_parlay_riding` counts each pending parlay's full stake per pick, drops settled ones and returns sums only (`tests/db/market-position.test.ts`), the card's lines and states (`tests/lib/markets/position.test.ts`, `tests/components/market-position.test.tsx`), and the card and figure on an open and a resolved market, live (`e2e/market-position.spec.ts`) (#262, #279).

## v0.6.0-beta — 2026-10-01

Parlays are now priced at close from other members' real money, with new caps (at most 5× a leg, 20× a parlay and 1,000 DC paid), winners split exactly the real pool instead of the seed, and every void says why. Behind the scenes there are nightly encrypted backups and a restore point before every migration, deploy guardrails that push whatever production is missing and run only from `main`, error monitoring with a health route and cron heartbeat, a cron that finishes every step even when one fails, more reliable notifications, retry-safe market, comment and task actions, a stricter rule that removing a member ends their access, and a database test suite that checks the money after every test.

### Security
- **Removing a member takes away everything they could do, and signs them out.** A creator's powers over their own markets (resolving, voiding, editing, attaching resolution proof) and deleting their own comments now need a current invite, as roles already did, and `remove_member` ends the member's sessions on every device. A schema test fails on any member-callable security definer function that writes without checking the invite or a role (#288).
- **Only an unclaimed invite can be revoked, in the database as well as the app.** An admin's delete of an invite someone has already signed in with removes nothing; taking out a member stays the owner's, through Remove member. A new invite records the admin who added it and always starts unclaimed (#289).

### Features
- **Parlay legs are priced from real money when their markets close.** Parlays are still paid by the house and stay out of the pools, but each leg's odds are now set when its market closes (or is resolved, if that comes first), from other members' money on the market divided by their money on the pick, with your own money and the seed left out, and at most 5× a leg. The slip, My bets and the parlay page show `~` estimates until then. A leg needs at least 50 DC from at least 2 other members on its market when it's placed, can't be on a market you created, and counts 1.00× if its market no longer has that at close or nobody else backed the pick. A parlay multiplies to at most 20× (was 100×) and pays at most 1,000 DC; one that staked more than that before the cap still gets its stake back on a win. One member's pending parlays on any one market can pay at most 1,000 DC between them. Parlays still pending from before keep their locked odds under the 20× and 1,000 DC caps (#287).
- **Winners split exactly the real pool.** The seed now only shapes the chance and charts a thin market shows; it's never paid out, so a winner nobody bet against gets their stake back. Each outcome's "× payout per DC", the slip's "Pays ~" and My bets show what will really be paid. Results from before keep what they paid (#287).
- **Voids follow the same rule as results, and say why.** Until a market closes, its creator or an admin can void it; once it has closed, only an admin can. Every void needs a reason (up to 500 characters), which shows on the market page and, with the void itself, in the feed (#290).

### Fixes
- **A lost response no longer duplicates a market, comment or task.** Next replays a server action whose response never arrived, even when it had already committed, so a phone switching networks while creating a market could make it twice. Creating a market, posting a comment and creating a task now send an attempt key, and a repeat returns the first result, without a second new-market push, and a replayed resolve, void or review that already went through reads as done instead of an error (#258).
- **Editing a balance adjustment after a lost response applies the edit.** The form used to replay the first amount and still say "Balance adjusted"; it now starts a new attempt when the amount or reason changes, and the toast names the amount applied (#267).
- **One broken notification device no longer raises the closing-alerts alarm, and a systemic failure still does.** A failed push is logged and counted instead of failing the run, so one dead device can't keep the Admin warning on or make the backup workflow email. A run that delivers nothing while any failure is systemic (every device answering 401/403 because our VAPID credentials are wrong, our own network errors, 429, 5xx) returns 502 and leaves the heartbeat alone, even for a one-device group. Only a 4xx the device caused counts (not 429, and not 404/410, which delete at once; 401/403 count when the run delivered something else, so a subscription left over from an older key is pruned) against a device, which is pruned after five such failures spanning more than a day, or after 60 days without a delivery once it has also been failing for a day (#257).
- **Closing alerts run one at a time, and stop retrying a market nobody can be reached about.** A lease stops pg_cron and the GitHub backup sending the same alert twice, and a market whose pushes have failed for 24 hours is given up on instead of retried for ever (#257).
- **Notifications re-sync themselves.** On load, a device that turned notifications on re-makes a subscription the browser dropped or made with an old key, and saves a rotated one; the service worker also handles `pushsubscriptionchange` (#257). A device subscribed before this ships re-syncs after its member next opens Settings; if the server already deleted its row, the member taps "Turn on" there.
- **The daily cron runs every step even when one fails.** A Storage error in proof cleanup no longer skips key pruning, the champion post or the reminders; the failures are listed at the end with a 502 (#259).
- **Unexpected database errors in resolve and slip placement** are logged and shown as "Something went wrong" instead of raw text, and the sign-in callback logs why it failed (#256).
- **Error pages show an "Error code"** members can quote, and `/api/cron/closing-alerts` pings an optional healthchecks.io check (`HEALTHCHECKS_CLOSING_ALERTS_URL`) too (#256).
- **A failed read of the closing-alerts health no longer takes down Admin.** The banner says it couldn't check and every Admin page still loads (#256).
- **A balance can't run past the ledger's integer ceiling.** A credit that would take a balance past 2,147,483,647 DC is cut to fit, so it can never block a resolution (#287).
- **The economy panel shows payout rounding apart from seed payouts.** With the seed no longer paid, a result only ever leaves the fractions that rounding down keeps, now their own "Payout rounding" row; "Seed payouts (older results)" shows only in a month an older, seeded result was paid or overridden (#287).
- **This month's awards leave out removed members**, so an award goes to the next member still in (#287).
- **The owner can remove a bet only until its market closes**, the same moment members stop being able to cancel one (#272).
- **The feed skips an event kind it doesn't recognise** instead of failing, so a new kind can reach the database before the build that shows it (#290).

### Under the hood
- **Production errors are captured, and there's a health route and a cron heartbeat.** Uncaught server errors and browser crashes go to Sentry (errors only, PII scrubbed) when `NEXT_PUBLIC_SENTRY_DSN` is set; `/api/health` answers 200 only while Supabase is reachable, for an uptime monitor; and the daily cron pings healthchecks.io (`HEALTHCHECKS_KEEP_ALIVE_URL`), with a fail ping when a step failed. All three are off when unset (#256).
- **Nightly encrypted backups.** A new Backups workflow dumps the production database every night (roles, schema, and data including sign-ins and Storage records) and copies the proof and avatars buckets every Sunday, encrypted with age into a private backups repo that keeps 60 days; `docs/OPERATIONS.md` is the restore runbook, rehearsed once against a local copy (#248).
- **Every migration has a restore point.** Deploy Production takes the same encrypted dump just before it applies migrations, and doesn't migrate if the dump fails (#248).
- **Deploys push whatever production is missing.** Deploy Production asks production which migrations it lacks on every run instead of reading the merge's diff, so one a failed run left behind goes out with the next; waiting runs queue instead of replacing each other; and a run that main has moved past no longer fails waiting on a build it never started (#249).
- **CI fails a migration numbered out of order.** A PR's new migration must be numbered after main's newest (#249).
- **Deploy Production runs only from main,** with its secrets in the Production environment, and `ci-ok` is required for every merge (#291).
- **Backup jobs register secret masks before running.** Each job masks its backup secrets in a step of its own, the backup scripts blank them from every tool's output, and the workflows check that a backup printed only its file paths before pushing them. `restore.sh` now takes the database URL from `RESTORE_DB_URL` or a hidden prompt instead of an argument.

### Tests
- **DB tests cover parlay pricing and real-pool payouts**: legs on your own markets and on markets without the floor, copies of one market held to the caps, the 5× leg cap, the per-market exposure cap, a bet cancelled after placement, a market that loses the floor before close, a parlay placed before the change, payouts that split exactly the real pool (`pool_payout` and `poolPayout` kept equal), and credits and refunds at the integer ceiling (`tests/db/parlay-pricing.test.ts`, `seeded-odds.test.ts`). `backers()` and `backLeg()` give a test the other members' money a leg needs (#287).
- **The DB suite is typed, names what each refusal was for, and checks the money after every test.** Test clients carry the `Database` type, so a renamed RPC argument fails the typecheck. 86 negative assertions that accepted any error now check the message or SQLSTATE (`expectError`). After each DB test, `tests/db/setup.ts` checks that every balance equals its ledger, every outcome's pool equals its live bets, and every parlay's credit equals its payout rows; bulk raw seeds reconcile pools and balances afterwards, and the few tests that need drift opt out with a reason. Slip tests call `place_slip_v2` and assert its summary, and `money-races` gains cancel-vs-resolve and double-approve races (#271).

## v0.5.2-beta — 2026-09-30

An Admin › Markets tab for the markets waiting on a result, with tab counts that add up to the Admin badge, and rows inside cards that tint on hover instead of floating like a button inside a button.

### Features
- **Admin has a Markets tab.** It lists every market that has closed without a result, oldest first, with when it closed, how much is in its pool, who made it and a Resolve button, so the markets share of the Admin badge has somewhere to go. The Tasks and Markets tabs show their counts, which add up to the badge (#243).

### Polish
- **Rows inside a card no longer float like a button inside a button.** Under a mouse, a leaderboard row, a podium place, a member on Admin › Members, a past champion, and Home's and My bets' rows below desktop width now sit on a flat tint instead of lifting onto a ringed shadow; standalone cards (markets, awards, parlays, Home's desktop tiles) still lift (#244).

## v0.5.1-beta — 2026-09-30

The last open issues closed: a "Your standing" card beside the Net worth rankings, selectable card text on desktop, a race-chart label fix, CI that no longer trips on Supabase's image registry, and the misspelled dwelldule.com now redirecting to the app.

### Features
- **Net worth shows your standing beside the rankings on a wide screen.** A "Your standing" card fills the side column with your rank, net worth, record and how far you are behind the member above you; a phone keeps the list as it was (#185).

### Fixes
- **Card text can be selected and copied with a mouse.** Market cards, bet rows, leaderboard rows and the like no longer cover their text with an invisible link on desktop, so a title can be selected; the whole card still opens on click (a click that finishes a selection doesn't), and a tap opens it on a phone as before. Thanks to @MrMortem for the CSS in #222 (#188).
- **A cut-off line in the leaderboard race always keeps its label** on a phone, where only five fit: a runaway last place among eight used to be the first label dropped, hiding the only place its true total shows (#186).

### Under the hood
- **CI keeps Supabase's images in its own cache.** They come from AWS's public registry, not Docker Hub, and that registry's anonymous data limit was failing image pulls (run 36750361148 got through only on retries), so #213's Docker Hub login never applied. The images are now cached per Supabase CLI version and loaded before the stack starts; the Docker Hub login and its setup steps are gone (#238).
- **dwelldule.com redirects to www.dwellduel.com.** Both it and its www host answer with a 301 that keeps the path and query, so a misspelled link still lands (#191).

## v0.5.0-beta — 2026-09-30

Everything the post-v0.4.0 codebase review found, #192–#236, with nothing left open from it: security fixes (push endpoints, roles that need an invite, per-device sign-out), a round of bug fixes across the slip, results, tasks and admin, pages that no longer jump while loading, faster live refresh at scale, safer deploys and push delivery, CI in about half the time, and docs that match the code.

### Security
- **Signing out signs out only that device, and stops its notifications.** Sign out used to revoke every device's session, and a transient error on sign-in did the same; both now sign out the one session. Sign out also deletes the device's push subscription first, so on a shared phone the next member never sees the last one's "You won 26 DC" (#194).
- **Push endpoints are allowlisted in the database.** A subscription's endpoint must be on a known push service (FCM, Apple, Mozilla, WNS) to be stored at all, not just when Settings saves it; the direct insert grant is gone, so `save_push_subscription` is the only writer, and the sender checks again before every POST. The SQL and TypeScript host lists are kept equal by a test (#201).
- **A role only counts while you're invited.** `my_role()` answers member unless the caller's email is still on the invite list, so a de-invited admin loses every admin power at once and can't re-invite themselves. The owner can now **remove a member** from Admin → Members: back to member, invite revoked, devices unsubscribed; coins and bets untouched (#202).
- **Hygiene:** the cron secret is compared in constant time; every server action words the database's refusals itself and never shows a member raw Postgres text (#203).

### Fixes
- **A retried slip reports what was actually placed.** After a lost response, tapping Place again used to toast the slip's *current* picks and clear any added since; now it says your earlier attempt already went through, names what it placed, and keeps the picks that weren't part of it (#226).
- **A bet nobody could win says "Refunded · no winners", not "Lost".** When nobody backs the winning outcome, every stake is refunded, but My bets called such a bet Lost; it now matches the Coins tab and the Stats card (#193).
- **An override must name a different outcome.** An admin could override a resolution to the outcome that had already won, which reversed and re-paid every win under a new date, pushed a "changed by an override" alert to the winners and moved the leaderboard's Biggest win. The database now refuses it, and the form disables the current result and says why (#198).
- **Resolved markets list in the order they settled,** most recent first, as How it works says, instead of the order they were created in. A voided market shows the day it was voided, and one voided before its close time no longer draws as live until a close it never reached (#221).
- **A market's title is fixed once someone else's parlay has a leg on it,** as it already was once someone else had a solo bet (#221).
- **Closing alerts arrive within a minute.** GitHub was dropping most runs of the ten-minute schedule (the Admin warning from #149 caught it), so the timer now lives in Supabase: every minute `pg_cron` checks for a market that has just closed and, if there is one, calls the app through `pg_net` with the address and secret from Vault; it also calls at least every ten minutes to keep the heartbeat honest. The GitHub schedule stays as a backup, and the Admin warning names both (#189).
- **How it works' own links land.** A link inside the rules to another section ("the leaderboard", "notifications") pointed at an anchor the page didn't have, so tapping it did nothing; it now jumps to the section, and the heading stops clear of the top bar on a phone as well as a desktop (#196).
- **Admin › Members shows each member's email again,** under their name, so an admin can match a Google account to a member. The admin restyle had dropped it while still fetching it; members still can't read emails anywhere (#195).
- **A rejected task always says so.** Your Tasks row now reads "Not approved" whenever your latest submission was turned down, with the reviewer's reason after a dash when they gave one; before, a rejection with no reason left the row looking untouched. The reason stays optional, and How it works says so. A reject that the server refuses also keeps the reason you typed, for a single row and for the shared bulk reason (#200).
- **The monthly champion posts on the 1st.** The daily job that settles the month ran at midnight UTC, which is still the previous evening in Eastern time, so it settled the month before last and the new champion only reached the feed a day and a half late. It now runs at 05:15 UTC, past midnight Eastern in both EST and EDT, and a test keeps it there (#197).
- **"Approve selected" asks first,** saying how many submissions it approves and how many DC it pays, since one tap pays every reward at once. A row's own Approve stays a single tap, and rejecting never asks. Admin › Invites also keeps a typed email the server refuses (#221).
- **Editing a task you may not edit now says so.** Row-level security hides such a row instead of refusing the update, so the edit form used to toast "Task saved" while changing nothing; it now reports the refusal (#221).
- **Home's Admin tile and the "waiting" count on Admin › Tasks leave out your own submission,** matching the Admin badge, since someone else reviews it (#221).
- **"Delete this market" only shows when the delete would go through.** The database also refuses a market whose only bets were cancelled or sat in a parlay, so the page now checks those two tables too, for the owner of an empty market (#221).
- **A Google sign-in that can't start says so.** If Google or Supabase can't be reached, the sign-in button now comes back with a message instead of silently (#221).
- **A slip retry after a lost answer never places twice, even after closing the sheet.** The attempt key and the "couldn't confirm" message used to live in the slip panel, which the sheet unmounts on close, so reopening and tapping Place again started a fresh attempt. Both now live with the stakes in the slip provider (#192).
- **A failed proof upload no longer leaves the resolve confirmation open.** The dialog closes whatever happens, so the error shows instead of hiding behind it; a failed cleanup of uploaded proof can't hide the real error either. After an override goes through, the form clears its winner and reason instead of keeping the last ones (#199).
- **Slip and bet actions say what happened.** "Add to slip" on a page drawn before the slip filled up (in another tab, say) now says the slip is full instead of silently flipping back; cancelling a bet that is already gone or whose market has closed says so in plain words and refreshes the page; and a stake typed for a parlay no longer holds back the solo picks' quick stakes or the button's total once only one Parlay pick is left (#221).
- **The resolve form marks the winner's field only for an error about the winner.** A lost attachment or a sign-in problem used to flag the outcome select or the actual-result input as invalid too (#219).

### Polish
- **Pages stop jumping as they load, and every screen reads right.** Each skeleton now draws the same rows as its page (the markets filter tabs, the leaderboard's podium, the feed's reaction bars, Home's tiles, Settings' choices, Edit profile's preview), and a parlay's page streams its sections behind skeletons instead of waiting blank (#218). Screen readers meet the podium in rank order, focus lands somewhere sensible after submitting a task, editing a task or switching notifications on, toasts follow dark mode, the market page's "Edited" line shows it opens, and the race chart's keyboard readout keeps clear of its labels on a small phone (#219). Long names and titles wrap instead of pushing rows out at 320px, a market's page and card use the same words for its state and kind ("Over/Under", "Awaiting resolution", "No more bets"), a parlay whose markets have all closed says so, row titles share one size, and the feed shows a date once an event is over a week old (#220).

### Under the hood
- Docs reconciled with the code (#217): How it works, Architecture and the README now match the current rules, migrations, scripts and CI, and GitHub Actions are pinned by commit SHA (#203).
- `markets.settled_at` (0066) records when a market left the open state, set once by its first resolution or its void, backfilled for existing markets, with a `(status, settled_at desc, id desc)` index for the Resolved list.
- A daily `pg_cron` job prunes `cron.job_run_details` older than a week, which the every-minute closing-alerts job grew by about 1,440 rows a day (#210).
- **CI in half the time, on PRs only.** Three parallel jobs (lint and types; the database tests; unit tests, build and e2e) behind one required check, `ci-ok`; the Next build cache is kept between runs, and the database tests wipe auth users in one statement instead of one API call each. CI no longer runs again on `main`: the ruleset requires a PR to be up to date, so the tested head is what merges. CI logs in to Docker Hub when a token is set, so `supabase start` stops hitting the anonymous pull limit. Deploy Production now watches the Vercel build and fails when it fails, the closing-alerts backup fails loudly without its secret, and the README says which notification setting and secrets make those failures an email (#211, #212, #213, #214, #215, #216).
- `docs/GETTING-STARTED.md` walks a new collaborator from a fresh machine to a signed-in local app, a green test suite and a first pull request. Local Supabase now has Google sign-in enabled through each developer's own OAuth client (`supabase/.env`), so a real sign-in works locally.
- Local testing: after `npm run db:reset`, file uploads in the DB tests can fail with `42P10` until the local stack is restarted (`npx supabase stop && npx supabase start`); AGENTS.md says so.
- **The markets list at scale (#204).** A resolved or voided market's sparkline is written once to `markets.sparkline` by a trigger (0070) and read back, never recomputed; only open markets compute live. The list follows `market_outcomes` (now published for realtime) and `markets` instead of every `bets` row, so a bet elsewhere no longer refreshes every viewer.
- **The leaderboard no longer watches every profile (#205),** which refreshed every viewer on every coin movement; it follows `markets`, and catches up on the next visit. A partial index on pending parlays serves `stakes_riding`.
- **The Tasks page reads one row per task (#206):** `my_current_task_completions()` filters to the current period in SQL, with no separate period-key round trip.
- **A failed push is retried (#207).** Closing alerts read what is due, send one market at a time, and claim only the markets a device took (`claim_push_log`); a run whose every push failed returns 502 without stamping the heartbeat, so the Admin warning shows.
- **Deploys build the commit they ran for (#208):** the deploy job skips the Vercel hook when `main` has moved on, leaving the deploy to the later push's run, after its own migrations.
- **A deploy no longer strands open tabs (#209).** The service worker keeps the previous deploy's cache alongside the new one, and the app's error boundary reloads once (a minute's cooldown) on a stale-chunk error.
- **Reliability odds and ends (#210):** `maxDuration = 60` on both cron routes; a fetch timeout on the service-role client; missing VAPID keys warn at boot and switch push off instead of refusing to serve; avatars are 256px, lazy, sized and cached for a year; the Recharts plots load in their own chunk behind their skeletons; the nav balance is plain text until it first changes; Home's onboarding and standing each read one row (`my_onboarding`, `member_standing`); the feed's reactions load alongside the creator stakes.

## v0.4.0-beta — 2026-09-29

Everything from the September 29 rounds: #109–#183, with nothing left open. Desktop layouts that use the whole width, one motion language on phone and desktop (sliding tab bar, hover lifts, press feedback), one set of words for a market's state, a leaderboard race that reads with real data, review alerts, a markets filter, parlay breakdowns, and deploys that wait for their migrations.

### Features
- **Desktop hover: buttons grow, cards lift.** With a mouse, buttons, chips, tabs and nav items grow slightly and change colour, and tappable cards and rows (market cards, parlays, home tiles, the leaderboard, bets, admin's members) lift onto a shadow. Every colour hover eases instead of snapping. Nothing changes on touch, and reduced motion keeps only the colour (#155).
- **Desktop layouts use the whole width:** no page leaves its content pinned left with empty space on the right. The leaderboard puts the race chart, awards and past champions beside the rankings; My bets shows bets as a grid of cards; a member's page puts their stats beside their activity; Edit profile shows a live preview of your profile; Settings is two columns; Create market shows a live preview of the market's card; a parlay's picks sit beside its payout; Admin › Members is a grid of cards. The feed and How it works (now with a sticky contents list) get a centred reading width. Phone layouts don't change (#158, #159, #160, #161, #162, #163, #164, #165).
- **Alerts for reviewers and admins:** a task submission pushes to reviewers and above (not the submitter), a market that has closed with no result pushes to admins and above, and the Admin button shows a badge with what is waiting on you. A new "Tasks to review" choice in Settings covers reviewers; admins use "Markets to resolve" (#123).
- **A livelier leaderboard:** a podium for the top three, win-loss records on every row, and on This month a race chart of the top five's profit through the month, four awards (biggest win, best parlay, sharpshooter, most active) and the past champions (#121).
- **Filter the markets page** by All, Open, Awaiting (past the close time, not yet resolved) or Resolved (voided included); the choice is in the URL (#124, #152).
- **Parlays open into a breakdown:** each parlay on My bets is one tappable card (stake, multiplier, what it pays, a progress bar of its picks) leading to a new page with every pick's locked odds and result, and how the multiplier adds up (#120).

### Fixes
- **The race works from the keyboard and clips at the bottom too.** Focus the chart and the arrow keys, Page Up/Down, Home and End step through the moments, showing the same readout as hover and reading everyone's total out to a screen reader. A runaway last place now runs off the bottom, marked and noted like a runaway leader, so it no longer squashes everyone else; the step cap on the race has a database test (#177).
- **The leaderboard's race reads with real data.** It starts at the month's first settled bet instead of the 1st, steps at each moment a total moved (so a burst of settlements on one day is a run of steps, not one jump at "Today"), and runs a runaway leader's line off the top, marked with an arrow and a note, so second place stays readable; the leader's label keeps their true total. Hover or tap anywhere on it for every member's exact total at that moment. Labels are bigger and never overlap, and until a bet settles the card says the race hasn't started (#145).
- **The Best parlay award shows the parlay's multiplier,** the same figure as its parlay page and the profile's Stats card, instead of the payout over the stake, which rounding the payout down to whole DC could leave a few hundredths lower (#146).
- **The phone tab bar's pill slides between tabs** like the desktop nav's and the sub-tabs', instead of jumping, including while the page moves under it. The new tab's icon pops as the pill arrives and its label eases to bold; reduced motion keeps it all still (#154).
- **Every tap target gives under the finger:** the back links, the logo, Settings' switches, a market's edit history, and create-market's kind choices and remove-outcome button now shrink on press like the rest, and market cards, leaderboard rows, the podium, awards, past champions, bet rows and admin's member names are tappable as a whole, pressing as one card (#156).
- **Settings' "Reduce animations" stills toasts too:** they used to slide and fade unless the device itself asked for reduced motion (#157).
- **One set of words for where a market stands: Open, Awaiting, Resolved.** The markets filter's Pending and Closed tabs are now Awaiting and Resolved, so a tab no longer calls a market "Closed" while its card says it is awaiting resolution; a voided market sits under Resolved with its own Voided chip, and old links to the Pending and Closed tabs still land. "Closed" is now only ever a time. A parlay pick whose market is past its close time says "Awaiting resolution", like a solo bet, Home's Markets to resolve card links straight to the Awaiting tab, and the owner's Economy card counts DC in open parlays, not pending ones (#152).
- **The tab bar and launch animation sit right in iPhone's installed app.** On a page too short to scroll, the app gave the page a viewport about 62pt short, so the tab bar floated above the bottom and jumped when a page finished loading, and the launch animation left a bar at the bottom. The page is now always at least screen-tall there, and the launch overlay is sized to the whole screen from its first frame, which also stops its D flashing doubled and jumping before the leaves grow (#127, #128).
- **Sub-tabs slide like the main nav:** the active pill on My bets, Leaderboard, Markets and Admin's tabs glides to the new tab, and stays still with reduced motion (#117).
- **Cancel and Remove sit at the status chip's height** on My bets and market pages, instead of a full-size button beside a small chip (#118).
- **The top bar's logo and wordmark line up:** the bottom of the symbol's D now meets the wordmark's baseline, on phone and desktop (#119).
- **New favicon:** a big D with one lime leaf. The SVG turns the D white on dark browser themes; the PNG fallbacks (Safari) put the same mark on a teal tile (#122).
- **Mobile page can't zoom or scroll sideways:** the viewport is locked and the page is clipped to the screen's width (#129). Pinch-zoom is gone with it.
- **Notifications don't repeat the app's name:** each one's title says what happened ("New market", "You won 26 DC", "Time to resolve", "Task approved"), with the detail underneath (#109).
- **Market cards' sparklines start at the seeded 50/50,** like the market page's chart, and a seeded market nobody has bet on shows a flat line (#110).
- **Home's Markets to resolve card appears when a market closes,** without a manual refresh (#111).
- **"Closes in" rounds to the nearest hour or minute,** so 1h 59m reads "2h", not "1h" (#112).

### Under the hood
- **Local tooling:** `scripts/seed-scale.mjs` runs on the current schema again (#173) and spreads settlements over the month so the race looks real locally (#178), and the Admin badge e2e test no longer fails on retry, or when the page's live channel joins after the market closes (#182).
- **The old day-by-day race function is gone:** `leaderboard_race` (0059) is dropped now that the chart reads `leaderboard_race_steps` (#176).
- **Admins are told if closing alerts stop.** Each successful run of the ten-minute schedule is recorded (`cron_heartbeats`), and the Admin pages show admins and the owner a warning once none has landed for 30 minutes. The workflow reads the app's address from the `APP_URL` repository variable instead of a hard-coded URL, and fails if it isn't set (#149).
- **`npm run check:ios` checks the installed iPhone app** in the iOS Simulator: it cold-launches the Home Screen web app on a page and fails when the viewport is shorter than the screen, the bug behind #127 and #128, which no browser test can see. `--video` records the launch as contact sheets (#147).
- **The app deploys only after its migrations.** Vercel's own Git deploys are off for `main`; the Deploy Production workflow (was Deploy Production Database) pushes any new migrations, then triggers Vercel through a deploy hook. A failed migration blocks the deploy (#148).
- **Migrations apply on merge with no approval step,** so keep them additive; the workflow no longer waits on the `production-db` environment (#138).
- **A GitHub Actions schedule** (`closing-alerts.yml`, every ten minutes, needs the `CRON_SECRET` repository secret) calls `/api/cron/closing-alerts`, because Vercel's Hobby cron runs once a day. The daily cron still sends the same alerts as a backstop (#123).
- **Shared motion tokens:** every curve and duration comes from one set of `--ease-*` / `--duration-*` tokens in `globals.css`, mirrored for script in `lib/ui/motion.ts`, and a test fails on a hard-coded curve. The desktop nav's pill and the sub-tabs' pill now slide the same way, and the three dialogs share one animation (#157).
- **The coin-history index test no longer fails at random:** it asserts that the keyset bound lands in an index condition, whichever ledger index the planner picks (#139).
- The rules doc, which the How it works page renders, now covers the markets filter, the parlay breakdown and review alerts.
- Upgraded Vitest 5 and the CI actions (checkout 7, setup-node 7, cache 6, upload-artifact 7, Supabase setup-cli 3) from Dependabot #92–#97. TypeScript moves to 6.0 (#114) and stays below 7, and ESLint stays on 9, until typescript-eslint and eslint-config-next's plugins support TS 7 and ESLint 10, and @types/node stays on Node 22's line (#98–#100).

## v0.3.0-beta — 2026-09-28

Every open issue from the post-beta audit, #57 to #89 (32 done; #75, a DC floor, was declined): security fixes, new Supabase keys, speed, and a round of features for markets, coins, the leaderboard, social and notifications.

### Security
- **Parlay odds can't be pumped:** a leg's odds are locked without your own bets on that market, so betting against yourself and cancelling no longer inflates a parlay (#57).
- **No resolving with a stake:** once a market closes, its creator or any reviewer can resolve it, but nobody except an admin can resolve a market they have a bet or parlay leg on (#58).
- **The creator's stake is shown** on every market and on its result in the feed (#84).
- **No self-review,** and task rewards are capped at 500 DC (#59).
- **Emails are private:** members can no longer read each other's email addresses, including through live updates. Admins still see them on Members (#60).
- **Hardening** (#62):
  - betting and cancelling check the invite list;
  - a market's title is fixed once others have bet;
  - unattached proof files are cleaned up daily;
  - security headers and a Content Security Policy;
  - the secret-key client is server-only.

### Platform
- **New Supabase keys:** moved Supabase to asymmetric signing keys and the new publishable/secret API keys; legacy keys disabled (#89).
- **Typed database queries** generated from the migrations, checked in CI (#71).
- **Guarded database deploys:** a dry run, an approval step and no overlapping runs (#70).
- **Faster CI** with parallel unit tests, a single build and cached browsers; pinned Node 22 and weekly Dependabot updates (#73).
- **Functions run next to the database,** in Cleveland beside Supabase's Ohio region (#66).

### Polish
- **Long names and titles wrap** on narrow phones: market titles, leaderboard names and the admin task list's pills no longer overflow at 320px, and an admin's phone header shows the logo's symbol alone below 360px so the page never scrolls sideways (#65).
- **Clearer buttons for screen readers:** Approve, Reject and "I did this" name the member and task they act on (#65).
- **Consistent wording:** "Awaiting resolution", "Refunded" and "Open" everywhere in My bets, sentence-case parlay leg pills, and Tasks now says a reviewer checks each submission (#65).
- **No more "no bets yet"** on markets that always have seeded odds; only a market closed before seeding with no bets says none were placed (#65).
- **A missing profile no longer breaks the app:** the nav and page stay, Home greets you as "Member" and skips the rank (#65).
- **Landmarks and back links:** sign-in, not-invited and offline pages have a main landmark, and a member's page says "Back" and returns to wherever you came from (#65).
- **Friendly errors** when creating a market or saving a task, instead of raw database messages (#65).
- The sign-in button's Google badge and the logo's leaves use theme colours, and the design handoff's routes and hero colour match the app (#65).

### Forms and feedback
- **Placing twice is safe:** if your bets go through but the answer is lost on a bad connection, the slip says so, and tapping Place again shows them placed instead of betting twice. Balance adjustments work the same way (#61).
- **Forms keep what you typed** when they show an error: creating or editing a market, resolving, submitting a task, adjusting a balance, creating or editing a task, and your bio (#63).
- **Resolving asks first:** the confirmation names the winner ("Over 42.5 wins"), and an override says the previous payouts will be reversed. Nothing is paid until you confirm, and Cancel leaves the form as it was (#64).
- **Admin confirmations and toasts:** revoking an invite, changing a role and adjusting a balance ask first; revoking, and creating, saving, deactivating or reactivating a task, confirm with a toast (#65).
- **Select all stays in step** with the pending approvals it covers, showing checked or partly checked as rows are ticked or leave the list (#65).

### Speed
- **Lighter pages** (#69): every signed-in page loads at least a fifth less JavaScript, and the markets list almost half as much:
  - market cards draw their sparklines as plain SVG, server-rendered, instead of loading the charting library;
  - the nav's sliding pill loads its animation code after the page is up;
  - the slip's drawer loads the first time you open it;
  - the Supabase client loads only when you upload proof or sign in.
- **Faster lists and history** (#67): indexes for the markets list, a market's resolutions, your coin history and a few foreign keys the database was scanning without.
- **Fewer live refreshes and lighter reads** (#68):
  - Home and member pages no longer refresh whenever anyone bets;
  - the market chart is sampled to 200 points in the database instead of reading every bet;
  - Home counts pending tasks instead of reading your whole task history;
  - the signed-in layout reads your slip alongside everything else.

### Markets
- Open markets now sort by closing time, soonest first, with a "Closes in 2h" chip inside a day, and Home lists the closed markets waiting on you to resolve (#74).
- Quick stakes in the slip: tap 5, 10, 25 or Max to set a solo pick's or the parlay's stake; Max is your balance less the slip's other stakes, and chips you can't cover are disabled (#87).
- A Share button on every market: it uses the share sheet where there is one, or copies the market's link (#87).
- Duplicate a market for weekly questions: Create market opens filled in with the question, description, kind and outcomes or line, closing at the same local time a week or more later; nothing is created until you submit (#88).

### Getting started
- New members get a dismissible Getting started card on Home (add your photo, place your first bet, try a task), and How it works is now a page in the app, linked from Settings and the slip (#78).

### Admin
- Invites offer "Copy invite message", with the sign-in link and the Google account to use, and Admin → Members shows when each member joined and last signed in (#85).

### Coins
- Your own coin history: a new Coins tab on My bets lists every DC you've gained or spent, newest first, in plain words: winnings, stakes, refunds, task rewards and the owner's adjustment reasons (#76).
- The owner's Economy card on Admin → Ledger shows the DC in circulation (balances, open bets, pending parlays) and this month's DC added and removed by source, and checks that the ledger reconciles (#86).

### Leaderboard
- The leaderboard ranks by net worth (balance plus DC riding on open bets) everywhere, adds a "This month" tab ranked by net betting profit on Eastern time, and posts each month's champion to the feed (#77).

### Social
- Reactions and comments (#79): react 🔥 🙏 😂 👏 to anything in the feed or a member's activity, and discuss each market in a comment thread (280 characters, newest at the bottom). Authors delete their own comments, admins and the owner any, and both update live.
- A weekly recap on Home on Sundays and Mondays (Eastern): your net betting profit and task rewards, the group's best call and biggest upset, who did the most tasks, and the markets closing in the week ahead (#81).
- Profile stats: each member's profile shows their settled record for solo bets and parlays, all-time net betting profit, biggest win, best parlay, markets created and tasks completed (#83).

### Tasks
- Daily, weekly, monthly and yearly tasks now reset at midnight US Eastern instead of UTC, and each repeating task shows your current streak ("🔥 5-week streak") once you've done it two periods in a row; only approved submissions count (#82).

### Notifications
- Push notifications, opt in per device under Settings → Notifications (#80): a reminder to resolve your closed market, the result of a market you bet on (what you won, an override or a void), your task's approval or rejection with the reason, and, if you turn it on, new markets. Each kind can be turned off; on iPhone and iPad, add DwellDuel to your Home Screen first (iOS 16.4+).

### Tests
- **Closed test gaps** (#72): end-to-end tests for role gates (a member is kept out of Admin and sees no admin controls; a reviewer lands on the approval queue), cancelling a bet, overriding a resolution, rejecting a submission with a reason and editing your profile; unit tests for saving a profile and submitting a task; and database tests for money moving at the same time: a bet racing a resolve, two resolves at once, a void racing a resolve and two slips that together overdraw a balance.

## v0.2.0-beta — 2026-09-28

The first round of beta feedback: 20 issues, from roles to a new Home.

### Betting
- **Seeded odds** (#32, [PR #45](https://github.com/Aaron-Wickham/dwell-duel/pull/45)): every outcome starts with 20 DC of virtual money, so new markets show real odds and one-sided betting no longer pays 1.00×. Odds, charts, payout estimates and results all use the same maths.
- **Bigger parlays** (#33, #45): up to 10 legs, capped at 100×.
- **One slip for every bet** (#27, [PR #28](https://github.com/Aaron-Wickham/dwell-duel/pull/28)): add outcomes from any market, mark each Solo or Parlay, and place them all at once. It either all goes through or nothing does.
- **Cancel a bet** before its market closes, for a full refund (#21, [PR #26](https://github.com/Aaron-Wickham/dwell-duel/pull/26)).
- **Over/Under markets** with a .5 line, resolved from the actual number (#39, [PR #47](https://github.com/Aaron-Wickham/dwell-duel/pull/47)).
- **Edit a market's wording** until it closes, with every change visible to all (#41, #47).
- **Resolutions need a reason**, and can carry photos, files and links as proof (#38, [PR #46](https://github.com/Aaron-Wickham/dwell-duel/pull/46)).
- **Parlays on unbet outcomes** work thanks to seeding, now covered by a test. Parlay money stays out of market pools, as on Kalshi and Polymarket (#51, [PR #53](https://github.com/Aaron-Wickham/dwell-duel/pull/53)).

### Tasks
- **Proof on task submissions**: a note, photos, files or links. Admins can require proof per task (#37, #46).

### People and roles
- **Layered roles:** Owner › Admin › Reviewer › Member. Reviewers handle task approvals, and only the owner moves balances, grants roles or deletes (#40, [PR #44](https://github.com/Aaron-Wickham/dwell-duel/pull/44)).
- **Full profile control:** name, photo and bio (#22, #26).

### App
- **My bets** (#23, #34, [PR #48](https://github.com/Aaron-Wickham/dwell-duel/pull/48)): solo bets and parlays together under Open · Settled · Cancelled. `/parlays` now redirects here.
- **Simpler nav** (#30, #31, #35, #48): no Home tab (the logo goes home), the DC balance opens My bets, and your avatar opens your profile.
- **Settings** (#36, #48): System, Light or Dark theme, vibration and reduced motion, applied before the page paints. Sign out moved here.
- **A new Home hero** (#29, [PR #49](https://github.com/Aaron-Wickham/dwell-duel/pull/49)): your balance with a rank chip, the DC at stake and pending task rewards.
- **Launch animation** for the installed app, and a **favicon** that reads on light and dark tabs (#42, #43, [PR #50](https://github.com/Aaron-Wickham/dwell-duel/pull/50)).
- **Fixes** (#19, #20, #25, #26): the create-market close time on phones, the light-theme balance card, and the desktop header overflowing between 768px and 1180px.

### Under the hood
- **Post-beta cleanup** ([PR #24](https://github.com/Aaron-Wickham/dwell-duel/pull/24)): retired the old feed view for the stored events table, indexed events, paged the last unbounded lists, and fixed accessibility issues.
- My bets was reporting settled payouts without the seed. Fixed in #48.
- Docs: an architecture overview, a how-it-works guide, this changelog and a refreshed design handoff ([PR #52](https://github.com/Aaron-Wickham/dwell-duel/pull/52), [PR #55](https://github.com/Aaron-Wickham/dwell-duel/pull/55)).
- Migrations 0036–0045.

## v0.1.0-beta — 2026-09-27

The first beta, built as a series of sub-projects ([PRs #1–#18](https://github.com/Aaron-Wickham/dwell-duel/pulls?q=is%3Apr+is%3Amerged)).

- **Foundation:** Google sign-in, an invite allowlist, and the Dwell Coin ledger with a 100 DC starting grant.
- **Market engine:** pari-mutuel markets (Yes/No or multiple choice), with resolution by the creator or an admin, overrides and voids.
- **Coin economy:** Bible-study tasks with approval-gated rewards, one-off or repeating.
- **Admin controls:** invites, balance adjustments, the full ledger, and bulk task review.
- **Parlays:** multi-market bets from a slip, with odds locked at placement.
- **Social layer:** a leaderboard, an activity feed, member profiles, and who bet what on each market.
- **Design pass:** the DwellDuel look (tokens, light and dark themes, the wordmark), charts, animated numbers and toasts.
- **Native feel:** installable, with a splash screen, safe areas, swipe back, page transitions, skeletons and an offline page.
- **Scale and reliability:** indexes, keyset pagination, a stored events table behind the feed, sparklines, error pages at every level, and a startup check for required settings.
- **Beta touches:** a Beta badge, and a Send feedback tile.
