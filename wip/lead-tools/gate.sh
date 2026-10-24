#!/usr/bin/env bash
# Lead gate for the integration worktree: npm test with the data links out (as CI), then build, check-lists and full e2e
# with the data linked. Writes $S/gate/{npm,build,e2e}.log and $S/gate/result.
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
W=${1:-$S/wt-int}
G=$S/gate; mkdir -p $G/links/beta $G/archive; for f in $G/npm.log $G/build.log $G/e2e.log $G/e2e-[0-9]*.log; do [ -f $f ] && mv $f $G/archive/$(basename $f .log)-$(date -u +%m%dT%H%M%S).log; done; rm -f $G/result
# SHARDS=n runs the e2e suite as n parallel shards (scripts/e2e.js --shard=i/n), balanced by the last full run's timings.
TIMINGS=$(ls -t $G/archive/e2e-[0-9][0-9][0-9][0-9]T*.log 2>/dev/null | head -1)
cd "$W" || exit 1
restore() {
  [ -L $G/links/snapshots ] && mv $G/links/snapshots data/snapshots
  [ -L $G/links/beta/snapshots ] && mv $G/links/beta/snapshots data/beta/snapshots
  [ -e $G/links/dist ] && rm -rf dist && mv $G/links/dist dist
  true
}
trap restore EXIT
[ -L data/snapshots ] && mv data/snapshots $G/links/snapshots
[ -L data/beta/snapshots ] && mv data/beta/snapshots $G/links/beta/snapshots
[ -e dist ] && mv dist $G/links/dist
echo "head $(git rev-parse --short HEAD) start $(date -u +%T)" > $G/progress
MELON_BETA_SNAPSHOT_DIR= timeout 2400 npm test > $G/npm.log 2>&1; rc=$?
echo "npm $rc $(date -u +%T)" >> $G/progress
restore; rm -rf $G/links/dist
timeout 900 node scripts/build-static.js > $G/build.log 2>&1 && timeout 300 node .github/scripts/check-lists.mjs dist >> $G/build.log 2>&1; brc=$?
echo "build $brc $(date -u +%T)" >> $G/progress
erc=skip
if [ $brc = 0 ]; then
  if [ -n "${SHARDS:-}" ]; then
    pids=()
    for i in $(seq 1 $SHARDS); do
      NODE_PATH=$S/pw/node_modules timeout -k 60 10800 node scripts/e2e.js ${GREP:+"--grep=$GREP"} --shard=$i/$SHARDS ${TIMINGS:+--timings=$TIMINGS} > $G/e2e-$i.log 2>&1 &
      pids+=($!)
    done
    erc=0; for p in "${pids[@]}"; do wait $p || erc=$?; done
    cat $G/e2e-[0-9]*.log > $G/e2e.log
  else
    NODE_PATH=$S/pw/node_modules timeout -k 60 10800 node scripts/e2e.js ${GREP:+"--grep=$GREP"} > $G/e2e.log 2>&1; erc=$?
  fi
  echo "e2e $erc $(date -u +%T)" >> $G/progress
fi
git checkout -- docs/screenshots 2>/dev/null
echo "npm=$rc build=$brc e2e=$erc" > $G/result
