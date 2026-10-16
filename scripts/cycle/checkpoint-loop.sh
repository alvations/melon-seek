#!/usr/bin/env bash
# Run scripts/cycle/checkpoint.sh --push every N seconds for the lanes listed in a file, until the
# file is gone or empty. The lead starts it in the background while agents work, and edits the
# file as lanes start and finish (one LANE=WORKTREE per line; # comments allowed).
#
#   bash scripts/cycle/checkpoint-loop.sh LANES_FILE [SECONDS=900] [CKPT_DIR]
set -uo pipefail

FILE="${1:?usage: checkpoint-loop.sh LANES_FILE [SECONDS] [CKPT_DIR]}"
EVERY="${2:-900}"
CKPT="${3:-${TMPDIR:-/tmp}/melon-ckpt}"
HERE="$(cd "$(dirname "$0")" && pwd)"

while [ -s "$FILE" ]; do
  mapfile -t lanes < <(grep -v '^\s*#' "$FILE" | grep '=' || true)
  if [ ${#lanes[@]} -gt 0 ]; then
    echo "$(date -u +%FT%TZ) checkpoint: ${#lanes[@]} lanes"
    bash "$HERE/checkpoint.sh" --push --ckpt "$CKPT" "${lanes[@]}" || echo "$(date -u +%FT%TZ) checkpoint failed; next try in ${EVERY}s"
  fi
  sleep "$EVERY"
done
echo "$(date -u +%FT%TZ) checkpoint-loop: $FILE is empty or gone; stopping"
