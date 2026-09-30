# Changelog

Releases are tagged on GitHub; each one lists its pull requests. DwellDuel
is live at [www.dwellduel.com](https://www.dwellduel.com), and every merge to
`main` deploys, so a release marks a milestone, not a deploy.

## Unreleased

### Fixes
- **A bet nobody could win says "Refunded · no winners", not "Lost".** When nobody backs the winning outcome, every stake is refunded, but My bets called such a bet Lost; it now matches the Coins tab and the Stats card (#193).
- **An override must name a different outcome.** An admin could override a resolution to the outcome that had already won, which reversed and re-paid every win under a new date, pushed a "changed by an override" alert to the winners and moved the leaderboard's Biggest win. The database now refuses it, and the form disables the current result and says why (#198).
- **Resolved markets list in the order they settled,** most recent first, as How it works says, instead of the order they were created in. A voided market shows the day it was voided, and one voided before its close time no longer draws as live until a close it never reached (#221).
- **A market's title is fixed once someone else's parlay has a leg on it,** as it already was once someone else had a solo bet (#221).
- **Closing alerts arrive within a minute.** GitHub was dropping most runs of the ten-minute schedule (the Admin warning from #149 caught it), so the timer now lives in Supabase: every minute `pg_cron` checks for a market that has just closed and, if there is one, calls the app through `pg_net` with the address and secret from Vault; it also calls at least every ten minutes to keep the heartbeat honest. The GitHub schedule stays as a backup, and the Admin warning names both (#189).

### Under the hood
- `markets.settled_at` (0066) records when a market left the open state, set once by its first resolution or its void, backfilled for existing markets, with a `(status, settled_at desc, id)` index for the Resolved list.
- A daily `pg_cron` job prunes `cron.job_run_details` older than a week, which the every-minute closing-alerts job grew by about 1,440 rows a day (#210).
- Local testing: after `npm run db:reset`, file uploads in the DB tests can fail with `42P10` until the local stack is restarted (`npx supabase stop && npx supabase start`); AGENTS.md says so.

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
