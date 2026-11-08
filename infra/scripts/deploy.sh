#!/bin/sh
# `npm run deploy`: push main to GitHub, start the Deploy workflow (CI → build images → roll out to
# smart-outlet.in) and follow it until it finishes. Commits any uncommitted changes first:
#   npm run deploy -- "commit message"   (message optional). Exits non-zero if any stage fails.
set -eu
cd "$(dirname "$0")/../.."

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = main ] || { echo "Deploy from main (you are on $branch)." >&2; exit 1; }
command -v gh >/dev/null || { echo "GitHub CLI (gh) is required." >&2; exit 1; }

# Uncommitted work is committed as part of the deploy (message: first argument, or a dated default).
# Formatting and the OpenAPI spec are refreshed first, since CI fails the deploy on either.
if [ -n "$(git status --porcelain)" ]; then
  echo "==> Committing local changes"
  pnpm -s prettier --write . --log-level warn
  pnpm -s --filter @csp2all/api openapi >/dev/null
  git add -A
  git commit -q -m "${1:-Deploy $(date '+%Y-%m-%d %H:%M')}"
  git log --oneline -1
fi

echo "==> Pushing main"
git push origin main
sha=$(git rev-parse HEAD)

echo "==> Starting Deploy workflow for $(git rev-parse --short HEAD)"
gh workflow run deploy.yml --ref main

run=
for _ in $(seq 1 30); do
  run=$(gh run list --workflow deploy.yml --branch main --event workflow_dispatch -L 10 \
    --json databaseId,headSha --jq "map(select(.headSha == \"$sha\"))[0].databaseId // empty")
  [ -n "$run" ] && break
  sleep 2
done
[ -n "$run" ] || { echo "Could not find the Deploy run; check: gh run list --workflow deploy.yml" >&2; exit 1; }

gh run watch "$run" --exit-status --interval 15
echo "==> Live: https://smart-outlet.in"
