# WIP checkpoint: fix-pay-at-place

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-af40fcca54b57983d`
- Base (on claude/stoic-ride-54ddxp): `ff6a3d0648f338535010fbfc7a3804c41f702344`
- Head: `ea3a2b66a46869dade440330b4f3e555ed2f6fa4`
- Restore: `bash scripts/cycle/restore-wip.sh fix-pay-at-place <new worktree dir>`

## Commits since the base
```
ea3a2b6 fix-pay-at-place: UX-52 place count as a muted line under the pill; drawer heading = the card's range; no label cut (WIP)
05e5c24 WIP fix-pay-at-place: chart notes count pay posted for other places only; comments name payAt
0ff4484 fix-pay-at-place: price every place at its posted pay (payAt) in the chart, map, stats line, Compstimate, Insights and drawer (WIP)
3374a45 fix-pay-at-place: payAt(job, place) helper in features/shared.js (WIP, no callers yet)
```

## Uncommitted and new files
```
 M public/features/compstimate.js
 M scripts/e2e.js
 M test/e2e/viz-even.e2e.js
```

## Left out (not in untracked.tgz)
- node_modules (symlink)
