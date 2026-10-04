---
name: release
description: Cut a DwellDuel release (vX.Y.Z-beta) by following docs/RELEASING.md — release PR rebuilding Unreleased into the new CHANGELOG section with the README and package.json bumps, then the tagged GitHub Release and the note to members. Use when Aaron asks to release, tag, ship a version or cut vX.Y.Z.
---

# Release

**`docs/RELEASING.md` is the checklist. Read it and follow it step by step;** this skill only
adds what an agent needs on top of it.

- **Version:** `gh release list --limit 3` for the latest. Minor bump for features or a rule
  members will notice, patch for fixes only (RELEASING.md). Confirm with Aaron if unsure.
- **Finding Unreleased:** the first "## Unreleased" in CHANGELOG.md is inside the intro text, so
  match `\n## Unreleased\n\n###` when editing it by script.
- **Release notes footer:** end `notes.md` with the "Full changelog" line RELEASING.md gives
  (v0.10.0-beta used a "Pull requests:" line instead; that was a slip, not the format). Name the
  PRs the release covers in the release PR's description.
- **Tag only after Deploy Production has finished** for the release PR's merge commit:
  `gh run list --branch main --limit 3`.
- **After tagging, check production with the connectors:** the Vercel production deployment for
  the merge commit is READY, UptimeRobot's `/api/health` monitor is UP, and Sentry (org
  `dwellduel`) shows no new unresolved issues since the deploy.
- **The note to members** (RELEASING.md step 3) goes out only when a rule changed. Draft it for
  Aaron to post; never send it yourself.
