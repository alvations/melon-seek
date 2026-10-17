# WIP checkpoint: fix-pay-at-place

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-af40fcca54b57983d`
- Base (on claude/stoic-ride-54ddxp): `ff6a3d0648f338535010fbfc7a3804c41f702344`
- Head: `4b902b14de92c8744a209d126573262f6ea7007d`
- Restore: `bash scripts/cycle/restore-wip.sh fix-pay-at-place <new worktree dir>`

## Commits since the base
```
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
 M docs/process/fix-pay-at-place.md
 M docs/screenshots/chart.png
 M docs/screenshots/dark-drawer.png
 M docs/screenshots/dark.png
 M docs/screenshots/drawer-juice.png
 M docs/screenshots/drawer.png
 M docs/screenshots/insights.png
 M docs/screenshots/map-juice.png
 M docs/screenshots/map.png
 M docs/screenshots/mobile.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-28-360x640-with-the-keyboard-up-300-px-.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-28-iPhone-SE-Safari-375x548.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-28-landscape-844x390-with-5-saved-searches.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-28-landscape-844x390.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-29-company-menu-focus.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-30-saved-searches-loaded.png
 M docs/screenshots/qa-mobile-beta-2/e2e-M-31-empty-message-half-sheet.png
 M docs/screenshots/qa-mobile-beta/e2e-M-19-sort-while-scrolled.png
 M docs/screenshots/qa-mobile-beta/e2e-M-21-company-menu.png
 M docs/screenshots/qa-mobile-beta/e2e-M-22-paused-board.png
 M docs/screenshots/qa-mobile-beta/e2e-M-24-keyboard-location-search.png
 M docs/screenshots/qa-mobile-beta/e2e-M-27-topbar-360.png
 M docs/screenshots/qa-mobile/e2e-landscape-map.png
```

## Left out (not in untracked.tgz)
- node_modules (symlink)
