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
`ALLOW_ANY_BRANCH=1` to sync into a branch deliberately. If the tree is dirty
and you did not edit anything, see "Running yarn install locally" below — a
failed install can leave a tracked file zeroed.

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

### tar pinned to 7.5.22 — an inherited pin that had rotted

- **Package:** `tar`, pinned in root `resolutions`. We did not add this one; it
  came in from upstream, at `7.5.11`.
- **What happened:** `7.5.11` was presumably a security bump when it was added,
  ahead of what the tree would otherwise resolve. Then
  [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw)
  landed (vulnerable `<=7.5.18`) and made that exact version the flagged one.
  The pin had turned from a floor into a ceiling, and was itself what held the
  tree at a vulnerable `tar`.
- **Resolved:** raised to `7.5.22` (fixed in 7.5.19+). This is a closed
  incident, kept here for the lesson rather than as a live issue.
- **Why raised and not removed.** Deleting the entry does *not* help: `sqlite3`
  asks for `^6.1.11`, so `tar` would fall back to 6.x, which the advisory also
  covers. The pin forces `tar` a full major above what `sqlite3` requests, but
  that override was already in force at `7.5.11` — raising the value does not
  add a new one.
- **How it was caught matters.** The first run of the scheduled *Security Audit*
  surfaced it. Nobody spotted it by reading `package.json`: a stale pin looks
  exactly like a fresh one, and does not announce the day it starts doing the
  opposite of its job. That is the entire reason the next-auth entry above
  carries a per-sync check instead of trusting that a pin stays correct.

### websocket-driver pinned to 0.7.5

- **Package:** `websocket-driver`, pinned via root `resolutions`.
- **Advisory:** [GHSA-xv26-6w52-cph6](https://github.com/advisories/GHSA-xv26-6w52-cph6),
  critical — message corruption via abuse of protocol length headers.
  Vulnerable `<0.7.5`.
- **How it reaches us:** `faye-websocket` ← `faye` ← `@jsforce/jsforce-node`, a
  `dependencies` entry of `packages/app-store/salesforce`. `jsforce` uses `faye`
  for the Salesforce Streaming API, so this is genuine runtime network I/O, not
  a build-time path.
- **Why pinned rather than reasoned away:** the Salesforce app is dormant here —
  it is only seeded and enabled when `SALESFORCE_CONSUMER_KEY` and
  `SALESFORCE_CONSUMER_SECRET` are set, and its CRM service loads through a
  dynamic import that runs only once a Salesforce credential exists. That makes
  the code shipped-but-unloaded today. It is not a property worth depending on:
  it stops being true the moment somebody enables the integration, and nothing
  would flag that as a security decision. The pin removes the exposure outright.
- **No override involved.** `faye-websocket` requests `>=0.5.1`, so `0.7.5`
  satisfies it natively — this raises a floor rather than forcing a version past
  what a package asked for.
- **We deliberately did not remove the Salesforce app.** Deleting
  `packages/app-store/salesforce/` would drop the dependency entirely, but the
  app-store generator has no exclusion mechanism — it includes every directory
  containing a `config.json` — so it would mean deleting a directory upstream
  actively maintains and regenerating six barrel files on every sync. A
  one-line pin costs far less than a carried patch that fights upstream forever.

## Expected audit state

`yarn npm audit --all --recursive --severity critical` is expected to pass
clean: **zero criticals, exit 0.** The Monday *Security Audit* run should be
green, and there is no standing list of tolerated findings.

**So a red Monday email means something new.** There is no "that's just the
usual two" to fall back on — treat it as a real finding:

1. Read the advisory and check whether it reaches production.
   `yarn npm audit --all --recursive --severity critical --environment production`
   drops devDependencies, which is the quickest way to separate build-time noise
   from live exposure.
2. Prefer fixing it. Most of these are a one-line `resolutions` entry, and a
   fix taken is one less thing to re-reason about every week.
3. Only if it genuinely cannot be fixed, record it here with the reasoning —
   and then this section is no longer accurate, so rewrite it. A list of
   tolerated findings is worth far less than a green baseline.

Judge "reaches production" from the dependency graph, not the package's
reputation. Both criticals cleared in August 2026 looked build-time from their
names and neither was: `tar` arrived through SAML SSO and `websocket-driver`
through the Salesforce SDK.

**Check on each sync** (for both pins above): if upstream has bumped either
package to at least our pinned version, drop our entry and let upstream's carry
it. If upstream has moved *past* it, drop ours too — an exact pin left behind is
how the `tar` entry above became a vulnerability in the first place.

## Running yarn install locally

The root `postinstall` runs `prisma generate && prisma format` across the
monorepo through turbo. That is fine on a clean run, and has one sharp edge
when a run is not clean.

### An interrupted install can zero schema.prisma

If the postinstall pipeline dies partway — an unrelated package failing its own
build, or the install being interrupted — `prisma format` can be killed
mid-write and leave `packages/prisma/schema.prisma` **truncated to zero bytes**.
On a run that completes normally it only rewrites line endings, which is
harmless. The destructive case needs an aborted run.

Recognise it by any of:

- `packages/prisma/schema.prisma` is 0 bytes. It should be ~2850 lines, ~100 KB.
- The next command that touches Prisma fails with
  `You don't have any datasource defined in your schema.prisma`.
- `git status` lists `packages/prisma/schema.prisma` as modified when you did
  not edit it.

The fix is to restore the tracked copy:

```bash
git checkout -- packages/prisma/schema.prisma
```

**Check `git status` after any `yarn install` that did not exit cleanly.** The
file is tracked, so nothing is lost permanently — but only if you notice before
building on top of it.

Yarn's exit code is easy to lose here. If you pipe the install through `tail`
or chain another command after it, you get that command's exit status rather
than yarn's, and a failed install reads as a success. Look for
`Failed with errors` in the output instead of trusting a `0`.

This also reaches the sync ritual: `sync-upstream.sh` refuses to run on a dirty
tree, so a zeroed schema does not announce itself — it resurfaces later as a
blocked sync whose error message says nothing about Prisma.

### A local install does not prove the native build

`sqlite3@5.1.7` compiled here against `tar` 7.5.11 and was **not** rebuilt when
the pin moved to 7.5.22; the package itself did not change, so yarn had no
reason to rebuild it. `sqlite3` reaches `tar` through `prebuild-install` to
unpack prebuilt binaries at install time, and that path only runs on a clean
install.

**The CI Docker build is what proves it.** If *Release Docker* passes, the
combination is good. If it fails inside a native module — `sqlite3`,
`node-gyp`, or anything unpacking a prebuilt binary — suspect the `tar` pin
first: it forces a full major above the `^6.1.11` that `sqlite3` asks for. See
the tar entry under "Patches we carry" for why the pin is raised rather than
removed.

## Server-side deploy

> **TODO:** document how the built image is rolled out — whoever runs the deploy
> should fill this in. The image to pull is `ghcr.io/dokumentuj-sro/cal.diy:<tag>`.

## Notes

- Builds are x86 only; there is no ARM job.
- The image is published to GHCR only — we do not push to Docker Hub.
- Scheduled workflows only run from the default branch, and GitHub disables cron
  after 60 days of repo inactivity (it emails a warning first).
