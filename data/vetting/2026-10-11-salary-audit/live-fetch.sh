#!/usr/bin/env bash
# Polite live fetches for the salary audit (docs/process/salary-audit-data.md, question 3).
#   bash data/vetting/2026-10-11-salary-audit/live-fetch.sh <out-dir> <url>...
# One request per URL, an honest User-Agent, at least 1.5 s between requests. Each response is
# saved as <out-dir>/<n>.html with its status in <out-dir>/index.tsv. The caller checks robots.txt
# first (fetch it with this script) and keeps the total under 25 requests.
set -u
out="$1"; shift
mkdir -p "$out"
UA="melon-seek-salary-audit/1.0 (read-only pay-transparency check; contact alvations on GitHub)"
n=$(ls "$out"/*.html 2>/dev/null | wc -l)
for u in "$@"; do
  n=$((n + 1))
  code=$(curl -sS -L --max-redirs 3 -m 30 -A "$UA" -H 'Accept-Language: en-US' -o "$out/$n.html" -w '%{http_code}' "$u" 2>>"$out/errors.log" || echo ERR)
  printf '%s\t%s\t%s\t%s\n' "$n" "$code" "$(wc -c <"$out/$n.html" 2>/dev/null || echo 0)" "$u" | tee -a "$out/index.tsv"
  sleep 1.5
done
