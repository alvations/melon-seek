#!/usr/bin/env bash
# Re-run the e2e tests the full run skipped for "dist/ not built", with dist/ linked to the lead's build.
set -u
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
cd /home/user/melon-seek/.claude/worktrees/agent-af29c49e4f4fc6d19
uptime
RX="$(cat "$S/ux-review-beta-2/skipped-rx.txt")"
BETA_QA_DIST="$S/cycle-beta6-dist" NODE_PATH="$S/pw/node_modules" CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  timeout 2400 node scripts/e2e.js "--grep=$RX"
echo "exit $?"
uptime
