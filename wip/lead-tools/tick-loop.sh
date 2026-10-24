#!/usr/bin/env bash
# Run the lead's tick every 15 minutes with no model turn (the user, 2026-10-24: "work efficiently cos we keep hitting
# the limit"). Start detached: setsid nohup bash $S/tick-loop.sh >> $S/tick-loop.log 2>&1 < /dev/null & disown
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
echo $$ > $S/tick-loop.pid
while :; do echo "== $(date -u +%FT%TZ)"; timeout 900 bash $S/tick.sh 2>&1 | tail -12; sleep 900; done
