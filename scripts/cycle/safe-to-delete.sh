#!/usr/bin/env bash
# Check that a lane's worktree can be deleted without losing anything. The user, 2026-10-17: "Make sure
# the data and code is pushed and the audit trail before you delete stuff."
#
#   bash scripts/cycle/safe-to-delete.sh [--branch NAME] LANE=WORKTREE [LANE=WORKTREE ...]
#
# For each lane it checks, against origin/<branch> (default claude/stoic-ride-54ddxp, fetched first):
#   code       every commit of the lane since the branch is on the branch: the same subject (a cherry-pick),
#              or, for a squash, every file the lane changed is on the branch exactly as the lane left it;
#   changes    no uncommitted change to a tracked file (docs/screenshots/ that the e2e suite rewrites is
#              allowed) and no untracked file that git doesn't ignore (symlinks, such as data links, are fine);
#   checkpoint the lane's last wip/<lane>/STATUS.md on the branch names the worktree's HEAD, so the lane's
#              own commits (messages and authorship) are in the branch history as patches;
#   audit      docs/process/<lane>.md and docs/process/prompts/<lane>.md are on the branch.
# The crawl data is never in a lane: it is on the data-archive branch (scripts/cycle/local-data.js).
# Prints one line per check and exits 1 if any lane fails; delete only after it exits 0. Read-only.
set -uo pipefail
BRANCH=claude/stoic-ride-54ddxp
if [ "${1:-}" = --branch ]; then BRANCH=$2; shift 2; fi
[ $# -gt 0 ] || { echo "usage: $0 [--branch NAME] LANE=WORKTREE ..." >&2; exit 2; }
O=origin/$BRANCH
# True when the lane's version of file $3 is on the branch: the same blob, or, for a file that every lane
# appends to (the e2e registry, the WebKit workflow), every line the lane added is in the branch's version.
SHARED='^(scripts/e2e\.js|\.github/workflows/webkit-phone\.yml)$'
on_branch() {
  local wt=$1 base=$2 f=$3 a b
  a=$(git -C "$wt" rev-parse -q --verify "HEAD:$f" 2>/dev/null || echo none)
  b=$(git -C "$wt" rev-parse -q --verify "$O:$f" 2>/dev/null || echo none)
  [ "$a" = "$b" ] && return 0
  [[ $f =~ $SHARED ]] || return 1
  local theirs; theirs=$(git -C "$wt" show "$O:$f" 2>/dev/null) || return 1
  while IFS= read -r l; do grep -qxF -- "$l" <<<"$theirs" || return 1; done < <(git -C "$wt" diff "$base" HEAD -- "$f" | grep '^+[^+]' | sed 's/^+//')
  return 0
}
fail=0
first=1
for arg in "$@"; do
  lane=${arg%%=*}; wt=${arg#*=}
  if ! git -C "$wt" rev-parse --git-dir >/dev/null 2>&1; then echo "$lane: not a git worktree: $wt"; fail=1; continue; fi
  if [ $first = 1 ]; then timeout 120 git -C "$wt" fetch -q origin "$BRANCH" || { echo "fetch of $BRANCH failed" >&2; exit 2; }; first=0; fi
  head=$(git -C "$wt" rev-parse HEAD)
  base=$(git -C "$wt" merge-base HEAD "$O")
  bad=()
  # code
  subjects=$(git -C "$wt" log "$O" --format=%s)
  missing=0
  for c in $(git -C "$wt" rev-list "$base..HEAD"); do
    s=$(git -C "$wt" log -1 --format=%s "$c")
    grep -qxF -- "$s" <<<"$subjects" || missing=$((missing + 1))
  done
  if [ $missing -gt 0 ]; then
    differ=0
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      on_branch "$wt" "$base" "$f" || differ=$((differ + 1))
    done < <(git -C "$wt" diff --name-only "$base" HEAD)
    if [ $differ -gt 0 ]; then bad+=("code: $missing commit(s) not on $BRANCH by subject and $differ file(s) differ"); fi
  fi
  # changes
  dirty=$(git -C "$wt" status --porcelain --untracked-files=all | grep -v '^?? ' | grep -v ' docs/screenshots/' || true)
  untracked=$(git -C "$wt" ls-files --others --exclude-standard | while IFS= read -r f; do [ -L "$wt/$f" ] || echo "$f"; done)
  [ -z "$dirty" ] || bad+=("changes: uncommitted: $(echo "$dirty" | head -3 | tr '\n' ' ')")
  [ -z "$untracked" ] || bad+=("changes: untracked: $(echo "$untracked" | head -3 | tr '\n' ' ')")
  # checkpoint
  ck=$(git -C "$wt" log "$O" -1 --format=%h --diff-filter=AM -- "wip/$lane/STATUS.md")
  if [ "$(git -C "$wt" rev-list --count "$base..HEAD")" -gt 0 ]; then
    if [ -z "$ck" ]; then bad+=("checkpoint: no wip/$lane on $BRANCH")
    elif ! git -C "$wt" show "$ck:wip/$lane/STATUS.md" | grep -q "$head"; then bad+=("checkpoint: the last wip/$lane ($ck) is not at HEAD ${head:0:7}")
    fi
  fi
  # audit
  for f in "docs/process/$lane.md" "docs/process/prompts/$lane.md"; do
    git -C "$wt" cat-file -e "$O:$f" 2>/dev/null || bad+=("audit: $f is not on $BRANCH")
  done
  if [ ${#bad[@]} -eq 0 ]; then echo "$lane: safe to delete (HEAD ${head:0:7}, checkpoint ${ck:-none needed})"
  else fail=1; for b in "${bad[@]}"; do echo "$lane: NOT SAFE: $b"; done
  fi
done
exit $fail
