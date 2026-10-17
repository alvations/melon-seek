# WIP checkpoint: fix-pay-at-place

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-af40fcca54b57983d`
- Base (on claude/stoic-ride-54ddxp): `ff6a3d0648f338535010fbfc7a3804c41f702344`
- Head: `6fb7f11105675589253cc3e01a1eb5440b1c9d4a`
- Restore: `bash scripts/cycle/restore-wip.sh fix-pay-at-place <new worktree dir>`

## Commits since the base
```
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
 M docs/process/fix-pay-at-place.md
?? docs/screenshots/fix-pay-at-place/
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-pay-at-place/after-card-amazon-10568868-phone-390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-card-amazon-capex-fold-280.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-card-microsoft-places-phone-390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-card-nvidia-levels-phone-390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-chart-amazon-clusters-by-location.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-chart-amazon-ranges.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-chart-google-ranges-by-location.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-chart-microsoft-clusters-by-location.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-drawer-amazon-10371179-desktop.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-drawer-amazon-10371179-phone.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-drawer-amazon-10502807-internship.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-drawer-amazon-10568868-remote-states.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-drawer-microsoft-1970393556650765-desktop.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-microsoft-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-microsoft-map-pins.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-microsoft-mountain-view-chart-and-stats.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/after-microsoft-mountain-view-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-card-amazon-10568868-phone-390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-card-amazon-capex-fold-280.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-card-microsoft-places-phone-390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-card-nvidia-levels-phone-390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-chart-amazon-clusters-by-location.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-chart-amazon-ranges.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-chart-google-ranges-by-location.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-chart-microsoft-clusters-by-location.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-drawer-amazon-10371179-desktop.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-drawer-amazon-10371179-phone.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-drawer-amazon-10502807-internship.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-drawer-amazon-10568868-remote-states.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-drawer-microsoft-1970393556650765-desktop.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-microsoft-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-microsoft-map-pins.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-microsoft-mountain-view-chart-and-stats.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/before-microsoft-mountain-view-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/e2e-card-1114x720.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/e2e-card-280x653.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/e2e-card-352x355.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-pay-at-place/e2e-card-375x812.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)
