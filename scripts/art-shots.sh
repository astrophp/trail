#!/usr/bin/env bash
#
# Retakes the screenshots and the social preview in art/ from a running workbench.
#
# Usage:
#   scripts/art-shots.sh <workbench url> [--path /trail] [--out art] [--only overview,trace]
#
# Needs Node 18 or newer, npm, and Google Chrome (set ART_BROWSER=chromium to use Playwright's own
# Chromium instead, which `npx playwright@1.64.0 install chromium` downloads once). Playwright is
# not a dependency of this repository: it is installed at a pinned version into a cache directory
# outside the repository the first time, and reused. See art/README.md for the whole procedure.
#
set -euo pipefail

PLAYWRIGHT_VERSION=1.64.0
CACHE="${TMPDIR:-/tmp}/trail-art-playwright-$PLAYWRIGHT_VERSION"

if [ ! -d "$CACHE/node_modules/playwright" ]; then
    mkdir -p "$CACHE"
    npm install --prefix "$CACHE" --no-save --no-audit --no-fund --silent "playwright@$PLAYWRIGHT_VERSION"
fi

PLAYWRIGHT_DIR="$CACHE" exec node "$(dirname "$0")/art-shots.mjs" "$@"
