#!/usr/bin/env bash
# The lead's tick: checkpoint every lane, publish the lead's state to wip/LEAD-STATE.md on the branch,
# and report each running agent's transcript age, so a resume (after a usage limit, a killed session
# or a restarted container) continues instead of redoing work.  --agents: only the age report.
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
T=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/tasks
agents() {
  now=$(date +%s)
  grep -E '^\| [a-z0-9-]+ \| a[0-9a-f]{16} ' $S/lead-state.md | while IFS='|' read -r _ lane id wt items status _; do
    lane=$(echo $lane); id=$(echo $id); status=$(echo $status)
    [ "$status" = running ] || continue
    f=$T/$id.output
    if [ -e "$f" ]; then age=$(( (now - $(stat -L -c %Y "$f")) / 60 )); else age=none; fi
    head=$(git -C /home/user/melon-seek/$(echo $wt) log -1 --format=%h 2>/dev/null || echo gone)
    flag=; [ "$age" = none ] || [ "$age" -ge 20 ] && flag=" STALE"
    echo "agent $lane $id transcript-age=${age}min head=$head$flag"
  done
}
if [ "${1:-}" = --agents ]; then agents; exit 0; fi
# Test suites leave their mkdtemp folders behind (~3.8 GB by 2026-10-24 05:00): clear the finished ones.
find /tmp -maxdepth 1 -name 'melon-*' ! -name 'melon-ckpt' -mmin +120 -exec rm -rf {} + 2>/dev/null
cd $S/wt-nc || exit 1
mapfile -t L < <(grep = $S/ckpt-lanes.txt)
[ ${#L[@]} -gt 0 ] && TMPDIR=$S timeout 600 bash scripts/cycle/checkpoint.sh --push --ckpt $S/wt-ckpt "${L[@]}" 2>&1 | tail -2
# Publish the lead's state (wip/** is ignored by CI and Pages).
C=$S/wt-ckpt
git -C $C fetch -q origin claude/stoic-ride-54ddxp && git -C $C checkout -q --detach origin/claude/stoic-ride-54ddxp || exit 1
mkdir -p $C/wip/lead-tools
# The lead's own scripts, so a new container (scratch gone) can restore them: cp wip/lead-tools/* $S/.
cp $S/tick.sh $S/heavy.sh $S/pick.sh $S/gate.sh $S/keepboth.py $S/tick-loop.sh $C/wip/lead-tools/ 2>/dev/null
git -C $C add wip/lead-tools 2>/dev/null
{ cat $S/lead-state.md; echo; echo "### Lead notes so far (\$S/lead-notes-wave6.md)"; cat $S/lead-notes-wave6.md 2>/dev/null; echo; echo "### Agents at $(date -u +%FT%TZ)"; agents; } > $C/wip/LEAD-STATE.md
git -C $C add wip/LEAD-STATE.md
if ! git -C $C diff --cached --quiet; then
  git -C $C -c user.name="$(git -C $S/wt-int config user.name)" -c user.email="$(git -C $S/wt-int config user.email)" commit -q -m "WIP lead state (wip/LEAD-STATE.md, wip/lead-tools): lanes, resume procedure, next steps

CI and Pages ignore wip/**.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc"
  for i in 1 2 3 4; do timeout 120 git -C $C push -q origin HEAD:claude/stoic-ride-54ddxp && { echo "lead state published $(git -C $C rev-parse --short HEAD)"; break; }; sleep $((2**i)); git -C $C pull -q --rebase origin claude/stoic-ride-54ddxp; done
fi
agents
