# Deploying cal.diy

This fork tracks upstream [cal.com](https://github.com/calcom/cal.diy) and builds a
single image, `ghcr.io/dokumentuj-sro/cal.diy`, serving <https://booking.dokumentuj.cz>.

We run exactly two CI workflows. Everything else upstream ships is removed on
each sync:

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `release-docker.yaml` | tag `v*`, or manual | Build, test and push the image (x86 only) |
| `security-audit.yml` | Mondays 06:00 UTC, or manual | `yarn npm audit`; fails on critical CVEs |

## One-time setup

```bash
git remote add upstream https://github.com/calcom/cal.diy.git
```

## The update ritual

1. **Sync.** `./scripts/sync-upstream.sh` — merges `upstream/main` and re-removes
   the workflows we don't run.
2. **Resolve any conflicts**, then re-run the script. It picks up where it left
   off and concludes the merge for you. Upstream edits workflows we deleted, so
   most conflicts are under `.github/workflows/` — for those, `git rm <file>` is
   always the right resolution.
3. **Re-check the patches we carry** (see below) — upstream may have caught up,
   in which case ours should be dropped rather than carried forever.
4. **Review**, then `git push`.
5. **Trigger the build**: push a tag (`git tag v6.0.5 && git push origin v6.0.5`),
   or run *Release Docker* from the Actions tab. The manual form takes a
   `RELEASE_TAG`, or `BUILD_FROM_BRANCH` to build the current branch instead.
6. **Deploy the image** on the server — see below.

The script refuses to run on a branch other than `main`, with a dirty working
tree, or without the `upstream` remote, and tells you how to fix each. Set
`ALLOW_ANY_BRANCH=1` to sync into a branch deliberately.

## Patches we carry on top of upstream

Fixes applied here because upstream has not applied them. Each one is a
deliberate deviation, and each needs re-checking on every sync: if upstream has
caught up, drop ours instead of carrying it indefinitely.

### next-auth pinned to 4.24.15

- **Package:** `next-auth`, pinned through `resolutions` in the root
  `package.json` — the same mechanism this repo already uses for its other
  security bumps.
- **Advisory:** [GHSA-7rqj-j65f-68wh](https://github.com/advisories/GHSA-7rqj-j65f-68wh),
  critical. The Auth.js email normalizer validates the address *before* Unicode
  normalization, which allows a homoglyph `@` to bypass validation. Vulnerable
  range `>=4.10.3 <4.24.15`; 4.24.15 is the fix release.
- **Why we carry it:** upstream declares `next-auth: 4.24.13` in both
  `apps/web` and `packages/features/auth` and has not bumped it.
- **Why it matters here:** this sits in the login path of a publicly reachable
  app. We do not override `normalizeIdentifier` anywhere, so the built-in
  normalizer that the advisory patches is the one actually running.
- **Check on each sync:**

  ```bash
  grep '"next-auth"' apps/web/package.json packages/features/auth/package.json
  ```

  If upstream declares 4.24.15 or later in **both**, remove the `next-auth`
  entry from `resolutions`, run `yarn install --mode=update-lockfile`, and
  confirm `yarn npm audit --all --recursive --severity critical` still does not
  mention next-auth.

  Drop the pin as soon as upstream reaches 4.24.15 — do not leave it in place
  "just to be safe". It is an exact version, so once upstream moves past it the
  pin silently *downgrades* next-auth instead of protecting it.

## Server-side deploy

> **TODO:** document how the built image is rolled out — whoever runs the deploy
> should fill this in. The image to pull is `ghcr.io/dokumentuj-sro/cal.diy:<tag>`.

## Notes

- Builds are x86 only; there is no ARM job.
- The image is published to GHCR only — we do not push to Docker Hub.
- Scheduled workflows only run from the default branch, and GitHub disables cron
  after 60 days of repo inactivity (it emails a warning first).
