#!/usr/bin/env bash
# pick.sh <lane worktree> <range>: cherry-pick a lane's commits; registration-only conflicts are resolved keep-both.
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
wt=$1; range=$2; cd ${PICK_DIR:-$S/wt-int} || exit 2
continuing=0
if [ -f .git/CHERRY_PICK_HEAD ] || git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null; then continuing=1; fi
for c in $(git -C $wt rev-list --reverse $range); do
  if git log --format=%B -n 200 HEAD | grep -q "cherry picked from commit $c"; then continue; fi
  if ! git cherry-pick -x $c > /dev/null 2>&1; then
    files=$(git diff --name-only --diff-filter=U)
    other=$(echo "$files" | grep -v '^scripts/e2e.js$' | grep -v '^.github/workflows/webkit-phone.yml$')
    if [ -n "$other" ]; then echo "CONFLICT at $(git -C $wt log -1 --format='%h %s' $c | cut -c1-90): $other"; exit 1; fi
    python3 $S/keepboth.py $files >/dev/null && node --check scripts/e2e.js && git add $files && GIT_EDITOR=true git cherry-pick --continue >/dev/null || { echo "resolve failed at $c"; exit 1; }
    echo "  keep-both resolved: $files at $(git -C $wt log -1 --format=%h $c)"
  fi
done
echo "ok $range -> $(git log --oneline -1 | cut -c1-80)"
