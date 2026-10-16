#!/usr/bin/env bash
# Restore a lane's WIP checkpoint (scripts/cycle/checkpoint.sh) into a new worktree, so a resumed or
# replacement agent continues where the stopped one was.
#
#   bash scripts/cycle/restore-wip.sh LANE DIR [--from REF]
#
# Reads wip/LANE/ from REF (default origin/claude/stoic-ride-54ddxp), creates a detached worktree
# DIR at the checkpoint's base SHA, replays commits/*.patch with `git am`, applies
# uncommitted.diff (left uncommitted, as it was), and unpacks untracked.tgz. Data links are never
# in a checkpoint: re-link data/snapshots and data/beta/snapshots afterwards. Then rebase onto the
# branch head if it has moved.
set -euo pipefail

LANE="${1:?usage: restore-wip.sh LANE DIR [--from REF]}"
DIR="${2:?usage: restore-wip.sh LANE DIR [--from REF]}"
REF="origin/${MELON_BRANCH:-claude/stoic-ride-54ddxp}"
[ "${3:-}" = "--from" ] && REF="${4:?--from needs a ref}"

REPO="$(git rev-parse --show-toplevel)"
git -C "$REPO" fetch -q origin "${MELON_BRANCH:-claude/stoic-ride-54ddxp}" || true
git -C "$REPO" cat-file -e "$REF:wip/$LANE/STATUS.md" 2>/dev/null || { echo "restore-wip: no wip/$LANE in $REF" >&2; exit 1; }

TMP="$(mktemp -d)"
git -C "$REPO" archive "$REF" "wip/$LANE" | tar -x -C "$TMP"
SRC="$TMP/wip/$LANE"
BASE="$(sed -n 's/^- Base (on .*): `\([0-9a-f]*\)`$/\1/p' "$SRC/STATUS.md")"
[ -n "$BASE" ] || { echo "restore-wip: no base SHA in STATUS.md" >&2; exit 1; }

git -C "$REPO" worktree add -q --detach "$DIR" "$BASE"
shopt -s nullglob
patches=("$SRC"/commits/*.patch)
if [ ${#patches[@]} -gt 0 ]; then git -C "$DIR" am -q --3way "${patches[@]}"; fi
if [ -s "$SRC/uncommitted.diff" ]; then git -C "$DIR" apply --3way --whitespace=nowarn "$SRC/uncommitted.diff" || git -C "$DIR" apply --whitespace=nowarn "$SRC/uncommitted.diff"; fi
if [ -f "$SRC/untracked.tgz" ]; then tar -xzf "$SRC/untracked.tgz" -C "$DIR"; fi
rm -rf "$TMP"
echo "restore-wip: $LANE restored in $DIR (base ${BASE:0:7}, ${#patches[@]} commits replayed)"
git -C "$DIR" status --short | head -20
