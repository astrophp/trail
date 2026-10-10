#!/usr/bin/env bash
set -euo pipefail

tag=${1:-}
commit=${PREFLIGHT_COMMIT:-origin/main}
remote=${PREFLIGHT_REMOTE:-origin}
branch=${PREFLIGHT_BRANCH:-main}

"$(dirname "$0")/tag-version.sh" "$tag"

if git rev-parse -q --verify "refs/tags/$tag" > /dev/null; then
    printf 'Release tag %s already exists locally.\n' "$tag" >&2
    exit 1
fi

git fetch "$remote" "$branch"
if git ls-remote --exit-code --tags "$remote" "refs/tags/$tag" > /dev/null 2>&1; then
    printf 'Release tag %s already exists on %s.\n' "$tag" "$remote" >&2
    exit 1
fi

sha=$(git rev-parse "$commit")
"$(dirname "$0")/on-main.sh" "$sha" "${PREFLIGHT_MAIN_REF:-$remote/$branch}"
"$(dirname "$0")/changelog-entry.sh" "$tag" "${PREFLIGHT_CHANGELOG:-CHANGELOG.md}" > /dev/null

if [ "${PREFLIGHT_SKIP_RUNS:-0}" = 1 ]; then
    printf 'Skipping workflow-run checks because PREFLIGHT_SKIP_RUNS=1.\n' >&2
elif ! command -v gh > /dev/null 2>&1; then
    printf 'gh is required to verify tests.yml and install.yml; install it or set PREFLIGHT_SKIP_RUNS=1.\n' >&2
    exit 1
else
    repository=${GH_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}
    for workflow in tests.yml install.yml; do
        GH_REPO="$repository" "$(dirname "$0")/wait-for-runs.sh" "$workflow" "$sha" "$branch"
    done
fi

printf 'Before creating the tag, run: npm ci && npm run build && git diff --exit-code -- dist resources/js/lib/cn-tables.ts\n'
