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
#   ledger.sh restore           restore into data/history/ (missing store = start fresh)
#   ledger.sh restore-artifact  restore LEDGER_ARTIFACT into LEDGER_DIR from a TRUSTED run
#                               (pages.yml also uses it for job-board-snapshots)
#   ledger.sh commit-branch     commit data/history/*.json to the data-history branch
#
# Artifact trust (REVIEW.md V2): only artifacts from runs that (a) ran on this
# repository itself (head repository == this repo, so never a fork), (b) were
# triggered by push, schedule or workflow_dispatch (never pull_request /
# pull_request_target / workflow_run), and (c) ran on the default branch or a
# branch in TRUSTED_BRANCHES (space-separated; the workflows pass the deploy
# branch). Anything else is skipped, so a PR can't plant data that Pages publishes.
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

# "trusted" if run $1 may supply data, else a reason (stdout).
run_trust() {
  local repo="$1" id="$2" info event head branch
  info=$(gh api "repos/$repo/actions/runs/$id" --jq '"\(.event)\t\(.head_repository.full_name)\t\(.head_branch)"' 2>/dev/null) || { echo "run lookup failed"; return; }
  IFS=$'\t' read -r event head branch <<< "$info"
  case "$event" in push|schedule|workflow_dispatch) ;; *) echo "event '$event'"; return ;; esac
  [ "$head" = "$repo" ] || { echo "head repository '$head'"; return; }
  case " $TRUSTED " in *" $branch "*) ;; *) echo "branch '$branch'"; return ;; esac
  echo trusted
}

restore_artifact() {
  local repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}" ids id why err default
  default=$(gh api "repos/$repo" --jq '.default_branch' 2>/dev/null || true)
  TRUSTED="${default} ${TRUSTED_BRANCHES:-}"
  # Newest first, non-expired; same-repo heads only (fork runs carry another head repo id).
  ids=$(gh api "repos/$repo/actions/artifacts?name=$ARTIFACT&per_page=100" \
          --jq '[.artifacts[] | select(.expired | not) | select(.workflow_run.head_repository_id == .workflow_run.repository_id)] | sort_by(.created_at) | reverse | .[].workflow_run.id' 2>/dev/null || true)
  for id in $ids; do
    why=$(run_trust "$repo" "$id")
    if [ "$why" != trusted ]; then log "skipping '$ARTIFACT' from run $id (untrusted: $why)"; continue; fi
    if err=$(gh run download "$id" --repo "$repo" --name "$ARTIFACT" --dir "$DIR" 2>&1); then
      log "restored $(count) file(s) from artifact '$ARTIFACT' of trusted run $id"
      return 0
    fi
    echo "::warning::ledger: could not download '$ARTIFACT' from run $id: $(printf '%s' "$err" | head -1 | cut -c1-200)"
  done
  log "no trusted '$ARTIFACT' artifact found; starting fresh"
}

restore_branch() {
  local tmp
  if ! git fetch --quiet --depth 1 "$REMOTE" "refs/heads/$BRANCH" 2>/dev/null; then
    # First run after switching to the branch store: seed it from the newest
    # artifact (still uploaded every run), so the switch loses no history.
    log "no '$BRANCH' branch yet; seeding from the newest '$ARTIFACT' artifact"
    restore_artifact
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
  restore-artifact) mkdir -p "$DIR"; restore_artifact ;;
  commit-branch) commit_branch ;;
  *) echo "usage: $0 restore|restore-artifact|commit-branch" >&2; exit 2 ;;
esac
