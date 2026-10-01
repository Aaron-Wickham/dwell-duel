# Releasing

Every merge to `main` deploys, so a release doesn't ship anything: it names
a milestone, writes up what changed since the last one, and tags it. Cut
one when a batch of work has landed, typically after a review round or a
feature set. Aaron cuts releases; the steps go through a pull request like
any other change.

Releases are `vMAJOR.MINOR.PATCH-beta`. Bump the **minor** version for new
features or a rule change members will notice, and the **patch** version
for fixes only.

## Checklist

### 1. Prepare the release PR

Branch from an up-to-date `main` as `release/vX.Y.Z-beta`.

- [ ] **Rebuild `## Unreleased` in `CHANGELOG.md` into the release.** Each
  PR adds its lines under Unreleased with whatever heading it chose, so
  the section usually holds the same heading more than once. Turn it into
  **one section per heading**, in the order the top of the changelog
  gives (Security, Features, Fixes, Polish, Under the hood, Tests), leaving
  out empty ones:
  - move each line under its heading, merging lines about the same issue;
  - drop a line that repeats one already in an earlier release (a merge
    can carry one across);
  - check each line still matches what shipped, and that it names its
    issue (`(#123)`).
- [ ] **Rename it** `## vX.Y.Z-beta — YYYY-MM-DD` (today's date), and open
  a fresh, empty `## Unreleased` above it.
- [ ] **Write the summary**: one paragraph under the version heading, for
  members as much as for developers, leading with what they'll notice.
- [ ] **README:** update the "Current release" line near the top to the new
  tag. (The releases table is gone; the README links GitHub Releases.)
- [ ] **`package.json`:** set `"version"` to `X.Y.Z-beta` with
  `npm version X.Y.Z-beta --no-git-tag-version`, which updates
  `package-lock.json` too.
- [ ] **Docs:** if a rule changed, check [HOW-IT-WORKS.md](HOW-IT-WORKS.md)
  says it (the app renders that file), and that [ADMIN-GUIDE.md](ADMIN-GUIDE.md)
  and [OPERATIONS.md](OPERATIONS.md) still match what admins and the owner
  do.
- [ ] **The installed iPhone app:** if the release touched the shell (tab
  bar, launch screen, page height, safe areas), run `npm run check:ios` on
  a booted simulator (ARCHITECTURE.md, Environments and deploys).

Open the PR titled `Release vX.Y.Z-beta`, saying which issues and PRs it
covers. CI runs as for any PR, and it merges the usual way.

### 2. Tag and publish

Once the release PR has merged and Deploy Production has finished:

- [ ] **Tag the merge commit and publish the GitHub Release** in one step,
  with the changelog section as its notes. Save the section (the summary
  paragraph and the headings below it, without the `## v…` line) as
  `notes.md`, add a last line
  `Full changelog: [CHANGELOG.md](https://github.com/Aaron-Wickham/dwell-duel/blob/main/CHANGELOG.md)`,
  then:

  ```bash
  git checkout main && git pull
  gh release create vX.Y.Z-beta --target "$(git rev-parse HEAD)" \
    --title "DwellDuel vX.Y.Z-beta" --notes-file notes.md --latest
  ```

  Check that `HEAD` is the release PR's merge commit before running it.
- [ ] **Check** the release page renders, is marked Latest, and that the
  README's link to it works.

### 3. Tell members

- [ ] **If a rule members play by changed** (odds, payouts, parlays,
  limits, roles, tasks, or what data is kept), post a short note in the
  group's chat. Plain words, what changes for them and from when, and a
  link to How it works (`https://www.dwellduel.com/how-it-works`). For
  example:

  > DwellDuel update: parlay legs are now priced when each market closes,
  > from other members' money. A parlay pays at most 20× and 1,000 DC.
  > Bets you already placed keep their odds. Details under Settings → How
  > it works.

  A release with only fixes and polish needs no note.
- [ ] **Close the loop:** close the issues it covered if their PRs didn't,
  and move them to Done on the project board.
