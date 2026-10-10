#!/usr/bin/env bash
# Reads the workflow runs JSON on stdin. Exit codes:
#   0 a matching push run succeeded
#   1 the runs failed, or the JSON is unusable
#   2 a matching run is queued or in progress (poll again)
#   3 no matching push run exists yet (poll again for a short grace period)
set -euo pipefail

workflow=${1:-}
sha=${2:-}
branch=${3:-main}

php -r '
    $workflow = $argv[1]; $sha = $argv[2]; $branch = $argv[3];
    $data = json_decode(stream_get_contents(STDIN), true);
    if (!is_array($data)) { fwrite(STDERR, "$workflow returned invalid runs JSON.\n"); exit(1); }
    $runs = $data["workflow_runs"] ?? [];
    $matches = array_values(array_filter($runs, fn ($run) => ($run["head_sha"] ?? "") === $sha && ($run["head_branch"] ?? "") === $branch && ($run["event"] ?? "") === "push"));
    if ($matches === []) { fwrite(STDERR, "$workflow has no push run for $sha on $branch yet.\n"); exit(3); }
    foreach ($matches as $run) {
        if (($run["status"] ?? "") !== "completed") { fwrite(STDERR, "$workflow is ".($run["status"] ?? "unknown")." for $sha.\n"); exit(2); }
    }
    foreach ($matches as $run) {
        if (($run["conclusion"] ?? "") === "success") { echo "$workflow is successful for $sha.\n"; exit(0); }
    }
    $conclusions = implode(", ", array_unique(array_map(fn ($run) => (string) ($run["conclusion"] ?? "unknown"), $matches)));
    fwrite(STDERR, "$workflow completed without success for $sha: $conclusions.\n"); exit(1);
' "$workflow" "$sha" "$branch"
