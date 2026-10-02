#!/usr/bin/env bash
# History ledger persistence for GitHub Actions (F4, docs/strategy/ROADMAP.md §7).
#
# The ledger is data/history/*.json, maintained by the snapshot step
# (scripts/snapshot.js -> scripts/history.js). Workflows keep it between runs in
# one of two stores, picked by the repository variable HISTORY_STORE:
#
#   artifact (default)  the newest non-expired `history-ledger` workflow artifact
#                       (90-day retention), from snapshot.yml or pages.yml
#   branch              an orphan `data-history` branch, history/<slug>.json
#
# Switching to the branch store is one step: set the repository variable
# HISTORY_STORE=branch (Settings -> Secrets and variables -> Actions -> Variables).
# Both workflows already contain the branch-mode job (`persist-ledger`, the only
# job with contents: write, skipped unless HISTORY_STORE=branch).
#
# Usage:
#   ledger.sh restore         restore into data/history/ (missing store = start fresh)
#   ledger.sh commit-branch   commit data/history/*.json to the data-history branch
#
# Env: HISTORY_STORE (artifact|branch), GITHUB_REPOSITORY, GH_TOKEN (artifact
# restore), LEDGER_DIR (default data/history), LEDGER_BRANCH (default
# data-history), LEDGER_ARTIFACT (default history-ledger), LEDGER_REMOTE
# (default origin).
set -euo pipefail

STORE="${HISTORY_STORE:-artifact}"
DIR="${LEDGER_DIR:-data/history}"
BRANCH="${LEDGER_BRANCH:-data-history}"
ARTIFACT="${LEDGER_ARTIFACT:-history-ledger}"
REMOTE="${LEDGER_REMOTE:-origin}"

log() { echo "ledger: $*"; }
count() { find "$DIR" -maxdepth 1 -name '*.json' 2>/dev/null | wc -l | tr -d ' '; }

restore_artifact() {
  local repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}" ids id
  # Newest first, non-expired, across every workflow that uploads the ledger.
  ids=$(gh api "repos/$repo/actions/artifacts?name=$ARTIFACT&per_page=100" \
          --jq '[.artifacts[] | select(.expired | not)] | sort_by(.created_at) | reverse | .[].workflow_run.id' 2>/dev/null || true)
  local err
  for id in $ids; do
    if err=$(gh run download "$id" --repo "$repo" --name "$ARTIFACT" --dir "$DIR" 2>&1); then
      log "restored $(count) file(s) from artifact '$ARTIFACT' of run $id"
      return 0
    fi
    echo "::warning::ledger: could not download '$ARTIFACT' from run $id: $(printf '%s' "$err" | head -1 | cut -c1-200)"
  done
  log "no '$ARTIFACT' artifact found; starting a fresh ledger"
}

restore_branch() {
  local tmp
  if ! git fetch --quiet --depth 1 "$REMOTE" "refs/heads/$BRANCH" 2>/dev/null; then
    log "no '$BRANCH' branch yet; starting a fresh ledger"
    return 0
  fi
  tmp=$(mktemp -d)
  git archive FETCH_HEAD history 2>/dev/null | tar -x -C "$tmp" 2>/dev/null || true
  if compgen -G "$tmp/history/*.json" > /dev/null; then
    cp "$tmp"/history/*.json "$DIR"/
    log "restored $(count) file(s) from branch '$BRANCH' ($(git rev-parse --short FETCH_HEAD))"
  else
    log "branch '$BRANCH' has no history/*.json; starting a fresh ledger"
  fi
  rm -rf "$tmp"
}

# Commit data/history/*.json as history/<slug>.json on the orphan branch, without
# touching the working tree or the checked-out branch (git plumbing on a
# throwaway index). No-op when nothing changed.
commit_branch() {
  local parent="" index blob tree commit f readme
  if ! compgen -G "$DIR/*.json" > /dev/null; then log "no ledger files in $DIR; nothing to commit"; return 0; fi
  if git fetch --quiet --depth 1 "$REMOTE" "refs/heads/$BRANCH" 2>/dev/null; then parent=$(git rev-parse FETCH_HEAD); fi
  index=$(mktemp); rm -f "$index"
  export GIT_INDEX_FILE="$index"
  for f in "$DIR"/*.json; do
    blob=$(git hash-object -w "$f")
    git update-index --add --cacheinfo "100644,$blob,history/$(basename "$f")"
  done
  readme=$(printf '%s\n' \
    '# melon-seek history ledger' '' \
    'Machine-maintained by .github/workflows (snapshot.yml, pages.yml) via' \
    '.github/scripts/ledger.sh. One file per company: history/<slug>.json, the F4' \
    'ledger written by scripts/history.js. Do not edit by hand; do not merge into main.' \
    | git hash-object -w --stdin)
  git update-index --add --cacheinfo "100644,$readme,README.md"
  tree=$(git write-tree)
  unset GIT_INDEX_FILE; rm -f "$index"
  if [ -n "$parent" ] && [ "$(git rev-parse "$parent^{tree}")" = "$tree" ]; then
    log "ledger unchanged; nothing to commit"
    return 0
  fi
  commit=$(GIT_AUTHOR_NAME="github-actions[bot]" GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com" \
           GIT_COMMITTER_NAME="github-actions[bot]" GIT_COMMITTER_EMAIL="41898282+github-actions[bot]@users.noreply.github.com" \
           git commit-tree "$tree" ${parent:+-p "$parent"} -m "ledger: $(date -u +%Y-%m-%dT%H:%MZ) ($(count) companies)")
  git push --quiet "$REMOTE" "$commit:refs/heads/$BRANCH"
  log "pushed $(git rev-parse --short "$commit") to '$BRANCH'"
}

case "${1:-}" in
  restore)
    mkdir -p "$DIR"
    case "$STORE" in
      artifact) restore_artifact ;;
      branch) restore_branch ;;
      *) echo "ledger: unknown HISTORY_STORE '$STORE' (artifact|branch)" >&2; exit 2 ;;
    esac
    ;;
  commit-branch) commit_branch ;;
  *) echo "usage: $0 restore|commit-branch" >&2; exit 2 ;;
esac
