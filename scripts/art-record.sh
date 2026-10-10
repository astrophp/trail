#!/usr/bin/env bash
#
# Records workbench runs over real time, so the dashboard's charts have history to draw.
#
# Run it from a checkout with the workbench database built (`composer build`). Every 2 to 4
# minutes it runs a varied handful of workbench scenarios through the real SDK, offline, against
# scripted provider responses. Nothing is backdated and no clock is faked: the history is as long
# as the script has run.
#
# A scenario whose run crashes (the command exits non-zero) is reported with its name, and the
# script exits 1 at the end. A scenario that fails on purpose, such as a provider error the
# scenario is built to show, is recorded and exits 0: that is not a crash.
#
# Usage:
#   scripts/art-record.sh [minutes]     default 70
#
# Run it in the background and leave it for the whole time, for example:
#   nohup scripts/art-record.sh 70 > /tmp/trail-record.log 2>&1 &
#
# Stop it before taking screenshots (see art/README.md): the screenshots must not be taken while
# runs are still being recorded.
#
set -uo pipefail

MINUTES=${1:-70}
cd "$(dirname "$0")/.."

# "Core" scenarios come up most ticks, "rare" ones now and then, so the activity chart is not flat
# and failures stay a minority.
CORE=(plain-answer tool-calls several-steps delegation streamed-run structured-output conversation long-conversation conversation-delegation embeddings-in-tool)
RARE=(failing-sub-agent throwing-tool provider-failure failover approval-gated-tool conversation-failover conversation-approval conversation-failure partly-priced-run unpriced-run)

END=$(( $(date +%s) + MINUTES * 60 ))
TICK=0
RUNS=0
CRASHES=0

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

        OUTPUT=$(php vendor/bin/testbench workbench:run "$SCENARIO" 2>&1)
        STATUS=$?
        RUNS=$((RUNS + 1))

        if [ "$STATUS" -eq 0 ]; then
            echo "  $(echo "$OUTPUT" | grep -E "\[(offline|live)\]" | head -1)"
        else
            CRASHES=$((CRASHES + 1))
            echo "  CRASHED: $SCENARIO (exit $STATUS)"
            echo "$OUTPUT" | tail -5 | sed 's/^/    /'
        fi

        sleep $(( RANDOM % 4 ))
    done

    sleep $(( 120 + RANDOM % 121 ))
done

echo "$(date '+%H:%M:%S') done after $TICK ticks, $RUNS runs, $CRASHES crashed"

[ "$CRASHES" -eq 0 ]
