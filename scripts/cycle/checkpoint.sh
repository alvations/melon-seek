#!/usr/bin/env bash
# Checkpoint the agents' unfinished work onto the deploy branch, so a stop (a usage limit, a
# reclaimed container) loses minutes, not hours. The user, 2026-10-16: "Make sure that if we get
# stop again due to limits, we're able to resume without losing much progress. So push and
# compile often so that we don't lose that much."
#
#   bash scripts/cycle/checkpoint.sh [--push] [--ckpt DIR] LANE=WORKTREE [LANE=WORKTREE ...]
#
# For each lane it writes wip/<lane>/ in a checkout of the branch (DIR, default
# $TMPDIR/melon-ckpt):
#   commits/*.patch   `git format-patch --binary` of the lane's commits since the branch
#   uncommitted.diff  `git diff --binary HEAD` (tracked files, staged or not)
#   untracked.tgz     new files (git's ignore rules apply; symlinks, new screenshots and files over
#                     5 MB are left out and listed in STATUS.md, so data links are never copied and
#                     the repo does not grow by a screenshot folder every 15 minutes)
#   STATUS.md         base and head SHAs, the commit list, `git status`, what was left out
# then commits "WIP checkpoint: <lanes>" and, with --push, pushes it. The branch's CI and Pages
# workflows ignore wip/** (paths-ignore), so a checkpoint never rebuilds or redeploys the site.
# A lane whose wip/ is unchanged is not recommitted. Restore with scripts/cycle/restore-wip.sh.
# Agents never push; the lead (or the lead's checkpoint loop) runs this.
set -euo pipefail

BRANCH="${MELON_BRANCH:-claude/stoic-ride-54ddxp}"
PUSH=0
CKPT="${TMPDIR:-/tmp}/melon-ckpt"
MAX_BYTES=$((5 * 1024 * 1024))
LANES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --push) PUSH=1 ;;
    --ckpt) CKPT="$2"; shift ;;
    *=*) LANES+=("$1") ;;
    *) echo "checkpoint: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done
[ ${#LANES[@]} -gt 0 ] || { echo "usage: checkpoint.sh [--push] [--ckpt DIR] LANE=WORKTREE ..." >&2; exit 2; }

REPO="$(git rev-parse --show-toplevel)"
git -C "$REPO" fetch -q origin "$BRANCH"
if [ ! -e "$CKPT/.git" ]; then
  git -C "$REPO" worktree add -q --detach "$CKPT" "origin/$BRANCH"
fi

fill() { # fill <lane> <worktree> <dest>
  local lane="$1" wt="$2" dest="$3" base head
  base="$(git -C "$wt" merge-base HEAD "origin/$BRANCH")"
  head="$(git -C "$wt" rev-parse HEAD)"
  rm -rf "$dest"; mkdir -p "$dest/commits"
  git -C "$wt" format-patch -q --binary -o "$dest/commits" "$base..HEAD" >/dev/null
  git -C "$wt" diff --binary HEAD > "$dest/uncommitted.diff"
  local list skipped
  list="$(mktemp)"; skipped="$(mktemp)"
  (cd "$wt" && git ls-files --others --exclude-standard -z) | while IFS= read -r -d '' f; do
    if [ -L "$wt/$f" ]; then echo "$f (symlink)" >> "$skipped"
    elif [[ "$f" == docs/screenshots/* ]]; then echo "$f (screenshot; the lane's tests regenerate it)" >> "$skipped"
    elif [ "$(stat -c %s "$wt/$f")" -gt "$MAX_BYTES" ]; then echo "$f ($(stat -c %s "$wt/$f") bytes)" >> "$skipped"
    else printf '%s\0' "$f" >> "$list"; fi
  done
  if [ -s "$list" ]; then tar -C "$wt" --null -T "$list" -czf "$dest/untracked.tgz"; fi
  {
    echo "# WIP checkpoint: $lane"
    echo
    echo "- Worktree: \`$wt\`"
    echo "- Base (on $BRANCH): \`$base\`"
    echo "- Head: \`$head\`"
    echo "- Restore: \`bash scripts/cycle/restore-wip.sh $lane <new worktree dir>\`"
    echo
    echo "## Commits since the base"
    echo '```'; git -C "$wt" log --oneline "$base..HEAD"; echo '```'
    echo
    echo "## Uncommitted and new files"
    echo '```'; git -C "$wt" status --short | grep -v 'node_modules' || true; echo '```'
    if [ -s "$skipped" ]; then echo; echo "## Left out (not in untracked.tgz)"; sed 's/^/- /' "$skipped"; fi
  } > "$dest/STATUS.md"
  rm -f "$list" "$skipped"
}

attempt() {
  git -C "$CKPT" checkout -q --detach "origin/$BRANCH"
  local names=()
  for spec in "${LANES[@]}"; do
    local lane="${spec%%=*}" wt="${spec#*=}"
    [ -d "$wt" ] || { echo "checkpoint: $lane: no worktree at $wt" >&2; continue; }
    fill "$lane" "$wt" "$CKPT/wip/$lane"
    git -C "$CKPT" add -A -- "wip/$lane"
    names+=("$lane")
  done
  if git -C "$CKPT" diff --cached --quiet; then echo "checkpoint: nothing changed"; return 0; fi
  git -C "$CKPT" commit -q -m "WIP checkpoint: ${names[*]}

Unfinished agent work, saved so a stop loses little (scripts/cycle/checkpoint.sh).
CI and Pages ignore wip/**.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc"
  echo "checkpoint: committed $(git -C "$CKPT" rev-parse --short HEAD) (${names[*]})"
  [ "$PUSH" = 1 ] || return 0
  git -C "$CKPT" push -q origin "HEAD:$BRANCH"
}

for try in 1 2 3 4; do
  if attempt; then exit 0; fi
  echo "checkpoint: push failed (try $try); refetching" >&2
  sleep $((2 ** try))
  git -C "$REPO" fetch -q origin "$BRANCH"
done
echo "checkpoint: gave up after 4 tries" >&2
exit 1
