# Changelog

Releases are tagged on GitHub; each one lists its pull requests. DwellDuel
is live at [www.dwellduel.com](https://www.dwellduel.com), and every merge to
`main` deploys, so a release marks a milestone, not a deploy.

## Unreleased

### Fixes
- **Notifications don't repeat the app's name:** each one's title says what happened ("New market", "You won 26 DC", "Time to resolve", "Task approved"), with the detail underneath (#109).
- **Market cards' sparklines start at the seeded 50/50,** like the market page's chart, and a seeded market nobody has bet on shows a flat line (#110).
- **Home's Markets to resolve card appears when a market closes,** without a manual refresh (#111).
- **"Closes in" rounds to the nearest hour or minute,** so 1h 59m reads "2h", not "1h" (#112).

### Under the hood
- Upgraded Vitest 5 and the CI actions (checkout 7, setup-node 7, cache 6, upload-artifact 7, Supabase setup-cli 3) from Dependabot #92–#97. TypeScript stays on 5.9 and ESLint on 9 until typescript-eslint and eslint-config-next's plugins support TS 7 and ESLint 10, and @types/node stays on Node 22's line (#98–#100).

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
