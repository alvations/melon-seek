#!/usr/bin/env bash
# Beta salary vetting gate (docs/CONTRACT.md "v3 additions"; docs/process/beta-deploy.md).
#
#   beta-gate.sh [snapshot-dir] [rejected-dir]   (defaults: data/beta/snapshots data/beta/rejected)
#
# Runs the salary vetting gate (scripts/vet-salaries.js: the same scan as the stable
# gate, with the vetting gate applied first, so "blocking" means "would be published")
# on each beta snapshot separately, each with its own time limit. A snapshot that fails
# (a critical salary anomaly, a gate crash, or the time limit) is moved to the rejected
# dir: in snapshot.yml's per-company crawl job it is then not handed on (the company keeps
# its previous snapshot); in pages.yml scripts/build-static.js leaves that company out of
# dist/beta/ ("no snapshot").
# The stable snapshots (data/snapshots/) are never read, and the regression fixtures are
# left to the stable gate, which already ran them.
#
# Always exits 0: a beta problem never fails the stable deploy. Each left-out company is
# a ::warning:: annotation and a row in $GITHUB_STEP_SUMMARY (when set).
# Env: BETA_GATE_TIMEOUT (seconds per company, default 300); BETA_VET (the gate command,
# default "node scripts/vet-salaries.js --no-fixtures --no-write-flags"; tests stub it).
set -uo pipefail

dir="${1:-data/beta/snapshots}"
rejected="${2:-data/beta/rejected}"
limit="${BETA_GATE_TIMEOUT:-300}"
vet="${BETA_VET:-node scripts/vet-salaries.js --no-fixtures --no-write-flags}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

shopt -s nullglob
files=("$dir"/*.json)
rows=()
kept=0
left=0
for f in "${files[@]}"; do
  slug=$(basename "$f" .json)
  log=$(mktemp)
  # $vet is word-split on purpose (a command plus its options).
  # shellcheck disable=SC2086
  timeout --kill-after=10 "$limit" $vet "$f" > "$log" 2>&1
  code=$?
  sed "s/^/  [$slug] /" "$log" | tail -n 20
  if [ "$code" = 0 ]; then
    kept=$((kept + 1))
    rows+=("| $slug | passed | |")
    echo "beta-gate: $slug passed"
  else
    case "$code" in
      1) why="critical salary anomaly (implausible pay that would be published)" ;;
      124|137) why="timed out after ${limit}s" ;;
      *) why="gate error (exit $code)" ;;
    esac
    detail=$(grep -m 3 -E 'CRITICAL|FIXTURE FAIL|failed|Error' "$log" | tr '\n|' '  ' | cut -c1-300)
    mkdir -p "$rejected"
    mv -f "$f" "$rejected/"
    left=$((left + 1))
    rows+=("| $slug | **left out of /beta/**: $why | ${detail} |")
    echo "::warning::beta-gate: $slug left out of the beta site: $why"
  fi
  rm -f "$log"
done

{
  echo "### Beta salary vetting gate"
  echo ""
  if [ "${#files[@]}" = 0 ]; then
    echo "_No beta snapshots in \`$dir\` to vet._"
  else
    echo "Per company, ${limit}s limit each: $kept passed, $left left out (the main site is unaffected)."
    echo ""
    echo "| company | result | detail |"
    echo "| --- | --- | --- |"
    printf '%s\n' "${rows[@]}"
  fi
  echo ""
} >> "$summary"
echo "beta-gate: $kept passed, $left left out"
exit 0
