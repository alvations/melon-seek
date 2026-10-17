# WIP checkpoint: fix-pay-at-place

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-af40fcca54b57983d`
- Base (on claude/stoic-ride-54ddxp): `ff6a3d0648f338535010fbfc7a3804c41f702344`
- Head: `37a6971a05cb8d1f7ff44df11490e24ca19db776`
- Restore: `bash scripts/cycle/restore-wip.sh fix-pay-at-place <new worktree dir>`

## Commits since the base
```
37a6971 fix-pay-at-place: V-40 Compstimate uses the comparables that post a range for the city asked (5 or more); e2e file (10 checks, all red on ff6a3d0)
ea3a2b6 fix-pay-at-place: UX-52 place count as a muted line under the pill; drawer heading = the card's range; no label cut (WIP)
05e5c24 WIP fix-pay-at-place: chart notes count pay posted for other places only; comments name payAt
0ff4484 fix-pay-at-place: price every place at its posted pay (payAt) in the chart, map, stats line, Compstimate, Insights and drawer (WIP)
3374a45 fix-pay-at-place: payAt(job, place) helper in features/shared.js (WIP, no callers yet)
```

## Uncommitted and new files
```
?? docs/process/prompts/fix-pay-at-place.md
?? docs/screenshots/fix-pay-at-place/
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-pay-at-place/after-card-1114x720.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-card-280x653.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-card-352x355.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-card-375x812.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)
