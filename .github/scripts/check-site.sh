#!/usr/bin/env bash
# Check that the live site is the melon-seek APP (this build), not GitHub's
# branch-based "pages build and deployment" rendering of the README.
#
#   check-site.sh <url> [expected-build]
#
# Passes when the page carries <meta name="melon-seek-build" content="...">
# (injected by scripts/build-static.js; equal to expected-build when given), is
# the expected channel, and shows no README/Jekyll markers. Retries for
# CHECK_TIMEOUT seconds (default 180, for the CDN) every CHECK_INTERVAL (default
# 15). Writes `result=` to $GITHUB_OUTPUT when set: ok | readme | wrong-build |
# wrong-channel | no-marker | unreachable.
#
# Channel (docs/process/beta-deploy.md): the beta copy at <site>/beta/ carries
# <meta name="melon-channel" content="beta">; the main site carries none. Set
# EXPECT_CHANNEL=beta to check /beta/ (default: stable, i.e. no channel meta).
# CHECK_LEVEL=warning reports a failure as a ::warning:: instead of an ::error::
# (a beta outage never fails a run); the exit code is 1 either way.
set -uo pipefail

url="${1:?usage: check-site.sh <url> [expected-build]}"
expect="${2:-}"
timeout="${CHECK_TIMEOUT:-180}"
interval="${CHECK_INTERVAL:-15}"
want_channel="${EXPECT_CHANNEL:-stable}"
level="${CHECK_LEVEL:-error}"
case "$level" in error|warning|notice) ;; *) level=error ;; esac
deadline=$((SECONDS + timeout))
i=0
result=unreachable
detail=""

out() { [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1" >> "$GITHUB_OUTPUT"; return 0; }

while :; do
  i=$((i + 1))
  sep='?'; case "$url" in *\?*) sep='&' ;; esac
  # A fresh query string skips the CDN's cached copy.
  if body=$(curl -fsSL --max-time 20 "${url}${sep}site-check=${GITHUB_RUN_ID:-local}-${i}-$RANDOM" 2>/dev/null); then
    marker=$(printf '%s' "$body" | sed -n 's/.*<meta name="melon-seek-build" content="\([^"]*\)".*/\1/p' | head -1)
    channel=$(printf '%s' "$body" | sed -n 's/.*<meta name="melon-channel" content="\([^"]*\)".*/\1/p' | head -1)
    if printf '%s' "$body" | grep -qiE '<meta name="generator" content="Jekyll|<h1 id="melon-seek"|class="markdown-body"'; then
      result=readme; detail="GitHub's README page (branch-based Pages build) is being served"
    elif printf '%s' "$body" | grep -q 'name="melon-seek-holding"'; then
      result=holding; detail="the branch-build holding page (repo-root index.html) is being served; the app deploy has not landed yet"
    elif [ -z "$marker" ]; then
      result=no-marker; detail="page has no melon-seek-build marker"
    elif [ -n "$expect" ] && [ "$marker" != "$expect" ]; then
      result=wrong-build; detail="serving build $marker, expected $expect"
    elif [ "${channel:-stable}" != "$want_channel" ]; then
      result=wrong-channel; detail="page is the ${channel:-stable} channel, expected $want_channel"
    else
      echo "site-check: OK, $url is the app (build $marker${channel:+, channel $channel})"
      out "result=ok"; out "served=$marker"
      exit 0
    fi
    out "served=${marker:-}"
  else
    result=unreachable; detail="could not fetch $url"
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then break; fi
  echo "site-check: attempt $i: $detail; retrying in ${interval}s"
  sleep "$interval"
done

echo "::${level}::site-check: $url is NOT the app: $detail"
out "result=$result"
out "detail=$detail"
exit 1
