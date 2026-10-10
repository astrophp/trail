#!/usr/bin/env bash
set -euo pipefail

workflow=${1:-}
sha=${2:-}
branch=${3:-main}

# Exit 2 means GitHub still has a matching run queued or in progress; callers may poll.
php -r '
    $workflow = $argv[1]; $sha = $argv[2]; $branch = $argv[3];
    $data = json_decode(stream_get_contents(STDIN), true);
    if (!is_array($data)) { fwrite(STDERR, "$workflow returned invalid runs JSON.\n"); exit(1); }
    $runs = $data["workflow_runs"] ?? [];
    $matches = array_values(array_filter($runs, fn ($run) => ($run["head_sha"] ?? "") === $sha && ($run["head_branch"] ?? "") === $branch && ($run["event"] ?? "") === "push"));
    if ($matches === []) { fwrite(STDERR, "$workflow has no push run for $sha on $branch.\n"); exit(1); }
    foreach ($matches as $run) {
        if (($run["status"] ?? "") !== "completed") { fwrite(STDERR, "$workflow is ".($run["status"] ?? "unknown")." for $sha.\n"); exit(2); }
    }
    foreach ($matches as $run) {
        if (($run["conclusion"] ?? "") === "success") { echo "$workflow is successful for $sha."; exit(0); }
    }
    $conclusions = implode(", ", array_unique(array_map(fn ($run) => (string) ($run["conclusion"] ?? "unknown"), $matches)));
    fwrite(STDERR, "$workflow completed without success for $sha: $conclusions.\n"); exit(1);
' "$workflow" "$sha" "$branch"
