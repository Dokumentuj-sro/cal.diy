#!/bin/bash
# scripts/sync-upstream.sh
#
# Pull upstream cal.com changes into this fork and re-remove the CI
# workflows we don't run. See DEPLOY.md for the full update ritual.
#
# One-time setup:
#   git remote add upstream https://github.com/calcom/cal.diy.git
set -e

# Workflows this fork keeps. Everything else in .github/workflows is
# removed after each sync. Add to this list if we adopt another one.
KEEP="^(release-docker.yaml|security-audit.yml)$"

cd "$(git rev-parse --show-toplevel)"

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "No 'upstream' remote. Run this once, then re-run this script:"
  echo "  git remote add upstream https://github.com/calcom/cal.diy.git"
  exit 1
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ] && [ -z "$ALLOW_ANY_BRANCH" ]; then
  echo "On '$branch', not 'main'. Run 'git checkout main' first,"
  echo "or set ALLOW_ANY_BRANCH=1 if you meant to sync into this branch."
  exit 1
fi

if [ -e "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
  # Resuming after a conflicted run. Re-running the script is the
  # documented next step, so pick up where the last one stopped.
  unresolved=$(git ls-files --unmerged | cut -f2 | sort -u)
  if [ -n "$unresolved" ]; then
    echo "Merge still has unresolved conflicts:"
    echo "$unresolved" | sed 's/^/  /'
    echo
    echo "Resolve them, then re-run this script."
    echo "For anything under .github/workflows/, the answer is 'git rm <file>'."
    exit 1
  fi
  echo "Concluding the merge you resolved..."
  git commit --no-edit
else
  if [ -n "$(git status --porcelain)" ]; then
    echo "Working tree is dirty. Commit or stash first — a merge needs a clean tree."
    exit 1
  fi
  git fetch upstream
  git merge upstream/main || {
    echo
    echo "Conflicts — resolve, then re-run this script."
    echo "Upstream keeps editing workflows we deleted, so most conflicts here"
    echo "are under .github/workflows/. For those, 'git rm <file>' is always"
    echo "the right resolution — we don't run upstream CI."
    exit 1
  }
fi

# grep -v exits 1 when it filters out every line, which is fine: set -e
# only inspects the last command of a pipeline. Do not add 'set -o pipefail'.
cd .github/workflows
ls | grep -vE "$KEEP" | xargs -r git rm -f
cd ../..

git commit -m "chore: sync upstream, clean workflows" || true
echo "Done. Review, then push."
