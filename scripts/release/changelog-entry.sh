#!/usr/bin/env bash
set -euo pipefail

tag=${1:-}
file=${2:-CHANGELOG.md}

[ -f "$file" ] || { printf 'CHANGELOG.md is missing; %s needs release notes.\n' "$tag" >&2; exit 1; }

awk -v tag="$tag" '
    $0 ~ "^## " tag "( - .*)?$" { found = 1; next }
    found && /^## / { exit }
    found { notes = notes $0 "\n"; if ($0 ~ /[^[:space:]]/) nonempty = 1 }
    END {
        if (!found) { printf "CHANGELOG.md has no heading for %s.\n", tag > "/dev/stderr"; exit 1 }
        if (!nonempty) { printf "CHANGELOG.md entry for %s has no release notes.\n", tag > "/dev/stderr"; exit 1 }
        sub(/^\n+/, "", notes)
        sub(/\n+$/, "", notes)
        print notes
    }
' "$file"
