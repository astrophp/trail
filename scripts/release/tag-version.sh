#!/usr/bin/env bash
set -euo pipefail

tag=${1:-}

if [[ ! $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$ ]]; then
    printf 'Invalid release tag: %s. Expected vMAJOR.MINOR.PATCH with an optional pre-release suffix.\n' "$tag" >&2
    exit 1
fi

printf 'version=%s\n' "$tag"
if [[ $tag == *-* ]]; then
    printf 'prerelease=true\n'
else
    printf 'prerelease=false\n'
fi
