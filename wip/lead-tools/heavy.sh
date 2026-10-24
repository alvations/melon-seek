#!/usr/bin/env bash
# heavy.sh CMD [ARGS...]: run CMD once one of the machine's heavy-job slots is free, so the agents
# sharing this 4-CPU machine never run more than HEAVY_SLOTS (default 3) builds, npm tests, e2e
# runs or perf probes at once. Put any timeout inside: `bash heavy.sh timeout 1500 npm test`.
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
N=${HEAVY_SLOTS:-3}
while :; do
  for i in $(seq 1 $N); do
    exec {fd}>"$S/heavy-$i.lock"
    if flock -n $fd; then
      echo "[heavy slot $i $(date -u +%T)] $*" >&2
      "$@"; rc=$?
      flock -u $fd; exec {fd}>&-
      exit $rc
    fi
    exec {fd}>&-
  done
  sleep 5
done
