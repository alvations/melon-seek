#!/usr/bin/env bash
# Wait (up to WAIT_TIMEOUT s, default 300) until no GitHub "pages build and
# deployment" run (the branch-based Pages builder, which publishes the README
# while Settings -> Pages -> Source is "Deploy from a branch") is queued or in
# progress for commit $1 (default $GITHUB_SHA), so our app deploy lands last.
# Needs GH_TOKEN with actions: read, and GITHUB_REPOSITORY. Never fails the job.
set -uo pipefail
sha="${1:-${GITHUB_SHA:?}}"
deadline=$((SECONDS + ${WAIT_TIMEOUT:-300}))
while :; do
  n=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs?head_sha=$sha&per_page=100" \
        --jq '[.workflow_runs[] | select(.name == "pages build and deployment" or .path == "dynamic/pages/pages-build-deployment") | select(.status != "completed")] | length' 2>/dev/null || echo 0)
  if [ "${n:-0}" = 0 ]; then echo "No branch-based Pages build in progress for $sha."; exit 0; fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "::warning::A 'pages build and deployment' run is still active after ${WAIT_TIMEOUT:-300}s; deploying anyway (the post-deploy check will catch an overwrite)."
    exit 0
  fi
  echo "Waiting for $n 'pages build and deployment' run(s) to finish..."
  sleep "${WAIT_INTERVAL:-10}"
done
