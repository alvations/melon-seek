#!/usr/bin/env bash
# Bring the shared checkout up to a commit the lead pushed from a clean worktree, without
# losing any agent's uncommitted work (docs/process/PLAYBOOK.md Stage 3, step 5).
#
#   bash scripts/cycle/sync-shared.sh OLD NEW     (run in the shared checkout; HEAD must be OLD)
#
# For each file that changed between OLD and NEW:
#   - the working copy equals OLD (no one touched it)   -> take NEW
#   - the working copy already equals NEW               -> leave it
#   - a binary file someone changed                     -> leave the working copy, list it
#   - any other edited text file                        -> 3-way merge (git merge-file); on a
#                                                          conflict keep the working copy, list it
# Then `git reset NEW` (mixed): HEAD and the index move, the working tree is not touched.
set -euo pipefail

old="${1:?usage: sync-shared.sh OLD NEW}"
new="${2:?usage: sync-shared.sh OLD NEW}"
old=$(git rev-parse --verify "$old^{commit}")
new=$(git rev-parse --verify "$new^{commit}")
[ "$(git rev-parse HEAD)" = "$old" ] || { echo "sync-shared: HEAD is $(git rev-parse --short HEAD), expected $(git rev-parse --short "$old")" >&2; exit 2; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
took=0; same=0; merged=0; kept=()

blob() { git cat-file -e "$1:$2" 2>/dev/null && git show "$1:$2" > "$3" || return 1; }
# git's numstat prints "-<TAB>-" for a binary pair (captured, so pipefail and SIGPIPE don't bite).
binary() { local out; out=$(git diff --no-index --numstat -- "$1" "$2" 2>/dev/null || true); [[ "$out" == -* ]]; }

while IFS= read -r -d '' f; do
  if ! blob "$new" "$f" "$tmp/new"; then
    # Deleted in NEW: remove only an untouched copy.
    if [ -f "$f" ] && blob "$old" "$f" "$tmp/old" && cmp -s "$f" "$tmp/old"; then rm -f "$f"; took=$((took + 1))
    elif [ -e "$f" ]; then kept+=("$f (deleted upstream, edited here)"); fi
    continue
  fi
  if [ ! -e "$f" ]; then mkdir -p "$(dirname "$f")"; cp "$tmp/new" "$f"; took=$((took + 1)); continue; fi
  if cmp -s "$f" "$tmp/new"; then same=$((same + 1)); continue; fi
  if blob "$old" "$f" "$tmp/old"; then
    if cmp -s "$f" "$tmp/old"; then cp "$tmp/new" "$f"; took=$((took + 1)); continue; fi
  else
    : > "$tmp/old"
  fi
  if ! binary "$tmp/old" "$tmp/new" && ! binary "$tmp/old" "$f"; then
    cp "$f" "$tmp/mine"
    if git merge-file -q "$tmp/mine" "$tmp/old" "$tmp/new"; then cp "$tmp/mine" "$f"; merged=$((merged + 1))
    else kept+=("$f (merge conflict; working copy kept)"); fi
  else
    kept+=("$f (binary; working copy kept)")
  fi
done < <(git diff -z --name-only --no-renames "$old" "$new")

git reset -q "$new"
echo "sync-shared: $(git rev-parse --short "$old") -> $(git rev-parse --short "$new"): took $took, already current $same, merged $merged, kept ${#kept[@]}"
for k in "${kept[@]+"${kept[@]}"}"; do echo "  kept: $k"; done
