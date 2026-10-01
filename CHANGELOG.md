# Changelog

Releases are tagged on GitHub; each one lists its pull requests. DwellDuel
is live at [www.dwellduel.com](https://www.dwellduel.com), and every merge to
`main` deploys, so a release marks a milestone, not a deploy.

## Unreleased

### Security
- **Removing a member takes away everything they could do, and signs them out.** A creator's powers over their own markets (resolving, voiding, editing, attaching resolution proof) and deleting their own comments now need a current invite, as roles already did, and `remove_member` ends the member's sessions on every device. A schema test fails on any member-callable security definer function that writes without checking the invite or a role (#288).
- **Only an unclaimed invite can be revoked, in the database as well as the app.** An admin's delete of an invite someone has already signed in with removes nothing; taking out a member stays the owner's, through Remove member. A new invite records the admin who added it and starts unclaimed, whatever the request says (#289).

### Betting
- **Parlay legs are priced from real money when their markets close.** Parlays are still paid by the house and stay out of the pools, but each leg's odds are now set when its market closes (or is resolved, if that comes first), from other members' money on the market divided by their money on the pick, with your own money and the seed left out, and at most 5× a leg. The slip, My bets and the parlay page show `~` estimates until then. A leg needs at least 50 DC from at least 2 other members on its market when it's placed, can't be on a market you created, and counts 1.00× if its market no longer has that at close or nobody else backed the pick. A parlay multiplies to at most 20× (was 100×) and pays at most 1,000 DC; one that staked more than that before the cap still gets its stake back on a win. One member's pending parlays on any one market can pay at most 1,000 DC between them. Parlays still pending from before keep their locked odds under the 20× and 1,000 DC caps (#287).
- **Winners split exactly the real pool.** The seed now only shapes the chance and charts a thin market shows; it's never paid out, so a winner nobody bet against gets their stake back. Each outcome's "× payout per DC", the slip's "Pays ~" and My bets show what will really be paid. Results from before keep what they paid (#287).

### Fixes
- **A balance can't run past the ledger's integer ceiling.** A credit that would take a balance past 2,147,483,647 DC is cut to fit, so it can never block a resolution (#287).
- **The economy panel shows payout rounding apart from seed payouts.** With the seed no longer paid, a result only ever leaves the fractions that rounding down keeps, now their own "Payout rounding" row; "Seed payouts (older results)" shows only in a month an older, seeded result was paid or overridden (#287).
- **This month's awards leave out removed members**, so an award goes to the next member still in (#287).
- **The owner can remove a bet only until its market closes**, the same moment members stop being able to cancel one (#272).
- **Voids follow the same rule as results, and say why.** Until a market closes, its creator or an admin can void it; once it has closed, only an admin can. Every void needs a reason (up to 500 characters), which shows on the market page and, with the void itself, in the feed (#290).
- **The feed skips an event kind it doesn't recognise** instead of failing, so a new kind can reach the database before the build that shows it (#290).

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
- `markets.settled_at` (0066) records when a market left the open state, set once by its first resolution or its void, backfilled for existing markets, with a `(status, settled_at desc, id)` index for the Resolved list.
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
