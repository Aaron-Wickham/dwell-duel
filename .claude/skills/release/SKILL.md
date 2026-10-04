---
name: release
description: Cut a DwellDuel release (vX.Y.Z-beta) — release PR bumping the version and turning Unreleased into the new CHANGELOG section, then a GitHub release tagged on the merge commit. Use when Aaron asks to release, tag, ship a version or cut vX.Y.Z.
---

# Release

Every merge to `main` already deploys, so a release marks a milestone, not a deploy.

1. **Pick the version.** `gh release list --limit 3` for the latest; a normal round bumps the minor
   (`v0.10.0-beta` → `v0.11.0-beta`). Confirm with Aaron if unsure.
2. **Branch** `release/vX.Y.Z-beta` from an up-to-date `origin/main`.
3. **Bump the version** in `package.json`, `package-lock.json` (`npm version X.Y.Z-beta
   --no-git-tag-version`) and `README.md`.
4. **CHANGELOG.md.** Rename the `## Unreleased` section (match `\n## Unreleased\n\n###`; the
   first "## Unreleased" is inside the intro text) to `## vX.Y.Z-beta — YYYY-MM-DD`, and put a
   fresh empty `## Unreleased` above it. Under the new heading, write a 2–3 sentence plain-language
   summary of the round. Headings stay in order: Security, Features, Fixes, Polish, Under the hood,
   Tests, dropping empty ones.
5. **Release PR** titled `Release vX.Y.Z-beta`; body: what it bumps, then `Includes #PR (#issue…)`
   for every PR in the round.
6. **After it merges**, create the release on the merge commit:
   `gh release create vX.Y.Z-beta --target <merge sha> --title "DwellDuel vX.Y.Z-beta" --notes-file <notes>`.
   The notes are the summary and sections from the CHANGELOG, ending with
   `**Pull requests:** #a, #b, …` including the release PR.
7. **Check it landed**: the Vercel production deploy for the merge commit is READY, UptimeRobot's
   `/api/health` monitor is UP, and Sentry has no new unresolved issues for the release.
