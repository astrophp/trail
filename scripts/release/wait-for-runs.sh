#!/usr/bin/env bash
set -euo pipefail

workflow=${1:-}
sha=${2:-}
branch=${3:-main}
attempts=${RELEASE_RUNS_ATTEMPTS:-40}
sleep_seconds=${RELEASE_RUNS_SLEEP_SECONDS:-30}

case "$attempts" in ''|*[!0-9]*) printf 'RELEASE_RUNS_ATTEMPTS must be a positive integer.\n' >&2; exit 2;; esac
[ "$attempts" -gt 0 ] || { printf 'RELEASE_RUNS_ATTEMPTS must be a positive integer.\n' >&2; exit 2; }

fetch_runs() {
    if [ -n "${RELEASE_RUNS_FETCH_COMMAND:-}" ]; then
        "$RELEASE_RUNS_FETCH_COMMAND" "$workflow" "$sha" "$branch"
    else
        gh api "repos/${GH_REPO:?GH_REPO is required}/actions/workflows/$workflow/runs?head_sha=$sha&branch=$branch&event=push"
    fi
}

for attempt in $(seq 1 "$attempts"); do
    if ! runs=$(fetch_runs 2>&1); then
        printf '%s\n' "$runs" >&2
        printf 'Could not query %s for %s.\n' "$workflow" "$sha" >&2
        exit 1
    fi
    if printf '%s' "$runs" | "$(dirname "$0")/runs-green.sh" "$workflow" "$sha" "$branch"; then
        exit 0
    else
        status=$?
    fi
    if [ "$status" -ne 2 ]; then exit "$status"; fi
    if [ "$attempt" -lt "$attempts" ]; then sleep "$sleep_seconds"; fi
done

printf '%s did not finish successfully for %s after %s attempts.\n' "$workflow" "$sha" "$attempts" >&2
exit 1
