#!/usr/bin/env bash
# Open and commit the orphan data branch (default data-archive) as a git worktree,
# without touching the checked-out code branch (docs/DATA_ARCHIVE.md "Workflows").
#
#   branch.sh open DIR            worktree of the data branch at DIR (an empty orphan tree
#                                 when the branch does not exist yet)
#   branch.sh commit DIR MESSAGE  commit everything in DIR and push it to the data branch;
#                                 no-op when nothing changed. Never force-pushes: a rejected
#                                 push (someone else pushed first) fails, and the next run
#                                 re-ingests on top (ingest is idempotent).
#   branch.sh close DIR           remove the worktree
#
# Env: ARCHIVE_BRANCH (default data-archive), ARCHIVE_REMOTE (default origin),
#      ARCHIVE_DEPTH (fetch depth, default 1; verify.js --history needs more).
set -euo pipefail

BRANCH="${ARCHIVE_BRANCH:-data-archive}"
REMOTE="${ARCHIVE_REMOTE:-origin}"
DEPTH="${ARCHIVE_DEPTH:-1}"
BOT_NAME="github-actions[bot]"
BOT_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"

log() { echo "archive-branch: $*"; }

case "$BRANCH" in
  claude/*|main|master|gh-pages) echo "archive-branch: refusing to write code/deploy branch '$BRANCH'" >&2; exit 2 ;;
esac

cmd="${1:-}"
dir="${2:-}"
[ -n "$dir" ] || { echo "usage: $0 open|commit|close DIR [MESSAGE]" >&2; exit 2; }

case "$cmd" in
  open)
    [ ! -e "$dir" ] || { echo "archive-branch: $dir already exists" >&2; exit 2; }
    if git fetch --quiet --depth "$DEPTH" "$REMOTE" "+refs/heads/$BRANCH:refs/remotes/$REMOTE/$BRANCH" 2>/dev/null; then
      git worktree add --quiet --detach "$dir" "refs/remotes/$REMOTE/$BRANCH"
      log "opened '$BRANCH' at $(git -C "$dir" rev-parse --short HEAD) in $dir"
    else
      git worktree add --quiet --detach "$dir" HEAD
      git -C "$dir" checkout --quiet --orphan "archive-orphan-$$"
      git -C "$dir" rm -rf --quiet . >/dev/null 2>&1 || true
      git -C "$dir" clean -fdxq
      log "no '$BRANCH' branch yet; $dir is an empty orphan tree (the first commit creates the branch)"
    fi
    ;;
  commit)
    msg="${3:-archive: update}"
    git -C "$dir" add -A .
    if git -C "$dir" diff --cached --quiet; then
      log "no changes to commit"
      exit 0
    fi
    GIT_AUTHOR_NAME="$BOT_NAME" GIT_AUTHOR_EMAIL="$BOT_EMAIL" GIT_COMMITTER_NAME="$BOT_NAME" GIT_COMMITTER_EMAIL="$BOT_EMAIL" \
      git -C "$dir" commit --quiet --no-verify -m "$msg"
    git -C "$dir" push --quiet "$REMOTE" "HEAD:refs/heads/$BRANCH"
    log "pushed $(git -C "$dir" rev-parse --short HEAD) to '$BRANCH': $msg"
    ;;
  close)
    git worktree remove --force "$dir" 2>/dev/null || rm -rf "$dir"
    git worktree prune
    ;;
  *)
    echo "usage: $0 open|commit|close DIR [MESSAGE]" >&2
    exit 2
    ;;
esac
