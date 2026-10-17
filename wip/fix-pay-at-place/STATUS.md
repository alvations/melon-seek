# WIP checkpoint: fix-pay-at-place

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-af40fcca54b57983d`
- Base (on claude/stoic-ride-54ddxp): `ff6a3d0648f338535010fbfc7a3804c41f702344`
- Head: `306768d4789c5bbd9ab6fa06626d7c9d9675b6f4`
- Restore: `bash scripts/cycle/restore-wip.sh fix-pay-at-place <new worktree dir>`

## Commits since the base
```
306768d fix-pay-at-place: log the final gate (full e2e 389/394, T21 under load passes alone); the Juice patch is a reference (fix-data-3 0ae184e)
4b902b1 fix-pay-at-place: before/after screenshots (shrunk, 1.2 MB)
b2b992c fix-pay-at-place: log timings and e2e results
6fb7f11 fix-pay-at-place: cheaper per-place pricing (no copies for one-range postings, a covered list instead of a Map), bounded phone-check steps
c54e297 fix-pay-at-place: the drawer names the headline row by its own label (Remote (CA)); payHere needs US-dollar pay; the phone check runs per size
72c8d83 fix-pay-at-place: log, prompt, CONTRACT note on payAt, DATA_SOURCES §7a, the Juice patch (server/juice.js) and its to-do test
37a6971 fix-pay-at-place: V-40 Compstimate uses the comparables that post a range for the city asked (5 or more); e2e file (10 checks, all red on ff6a3d0)
ea3a2b6 fix-pay-at-place: UX-52 place count as a muted line under the pill; drawer heading = the card's range; no label cut (WIP)
05e5c24 WIP fix-pay-at-place: chart notes count pay posted for other places only; comments name payAt
0ff4484 fix-pay-at-place: price every place at its posted pay (payAt) in the chart, map, stats line, Compstimate, Insights and drawer (WIP)
3374a45 fix-pay-at-place: payAt(job, place) helper in features/shared.js (WIP, no callers yet)
```

## Uncommitted and new files
```
```

## Left out (not in untracked.tgz)
- node_modules (symlink)
