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
3. **Review**, then `git push`.
4. **Trigger the build**: push a tag (`git tag v6.0.5 && git push origin v6.0.5`),
   or run *Release Docker* from the Actions tab. The manual form takes a
   `RELEASE_TAG`, or `BUILD_FROM_BRANCH` to build the current branch instead.
5. **Deploy the image** on the server — see below.

The script refuses to run on a branch other than `main`, with a dirty working
tree, or without the `upstream` remote, and tells you how to fix each. Set
`ALLOW_ANY_BRANCH=1` to sync into a branch deliberately.

## Server-side deploy

> **TODO:** document how the built image is rolled out — whoever runs the deploy
> should fill this in. The image to pull is `ghcr.io/dokumentuj-sro/cal.diy:<tag>`.

## Notes

- Builds are x86 only; there is no ARM job.
- The image is published to GHCR only — we do not push to Docker Hub.
- Scheduled workflows only run from the default branch, and GitHub disables cron
  after 60 days of repo inactivity (it emails a warning first).
