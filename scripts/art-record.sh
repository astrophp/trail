#!/usr/bin/env bash
#
# Records workbench runs over real time, so the dashboard's charts have history to draw.
#
# Run it from a checkout with the workbench database built (`composer build`). Every 2 to 4
# minutes it runs a varied handful of workbench scenarios through the real SDK, offline, against
# scripted provider responses. Nothing is backdated and no clock is faked: the history is as long
# as the script has run.
#
# Usage:
#   scripts/art-record.sh [minutes]     default 70
#
# Run it in the background and leave it for the whole time, for example:
#   nohup scripts/art-record.sh 70 > /tmp/trail-record.log 2>&1 &
#
set -uo pipefail

MINUTES=${1:-70}
cd "$(dirname "$0")/.."

# Scenarios that always run offline. "Core" ones come up most ticks, "rare" ones now and then,
# so the activity chart is not flat and failures stay a minority.
CORE=(plain-answer tool-calls several-steps delegation streamed-run structured-output conversation long-conversation conversation-delegation embeddings-in-tool)
RARE=(failing-sub-agent throwing-tool provider-failure failover approval-gated-tool conversation-failover conversation-approval conversation-failure partly-priced-run unpriced-run)

END=$(( $(date +%s) + MINUTES * 60 ))
TICK=0

while [ "$(date +%s)" -lt "$END" ]; do
    TICK=$((TICK + 1))
    COUNT=$(( RANDOM % 7 + 1 ))
    echo "$(date '+%H:%M:%S') tick $TICK: $COUNT scenarios"

    for ((i = 0; i < COUNT; i++)); do
        if (( RANDOM % 4 == 0 )); then
            SCENARIO=${RARE[$((RANDOM % ${#RARE[@]}))]}
        else
            SCENARIO=${CORE[$((RANDOM % ${#CORE[@]}))]}
        fi
        php vendor/bin/testbench workbench:run "$SCENARIO" 2>&1 | grep -E "ok|fail|error" | sed "s/^/  /"
        sleep $(( RANDOM % 4 ))
    done

    sleep $(( 120 + RANDOM % 121 ))
done

echo "$(date '+%H:%M:%S') done after $TICK ticks"
