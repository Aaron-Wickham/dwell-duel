# Changelog

Releases are tagged on GitHub; each one lists its pull requests. DwellDuel
is live at [www.dwellduel.com](https://www.dwellduel.com), and every merge to
`main` deploys, so a release marks a milestone, not a deploy.

## v0.3.0-beta — unreleased

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
