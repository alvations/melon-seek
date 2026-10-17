# WIP checkpoint: fix-viz-5

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a500839343c7a8ea9`
- Base (on claude/stoic-ride-54ddxp): `1ef0646b6f16aca8f215cf21e368185bddcf7b89`
- Head: `6349a5109bdfdf1705dfd845df53258f24388c2d`
- Restore: `bash scripts/cycle/restore-wip.sh fix-viz-5 <new worktree dir>`

## Commits since the base
```
6349a51 fix-viz-5: D-51 the Ranges legend wraps on a desktop and leads with its pattern keys; M-50 the map's tap check leaves out the offline note; e2e checks for both
ed6f124 fix-viz-5: mobile QA 3's stacked-row tap test finds the row by its count (UX-41 names it by its roles)
724550a fix-viz-5: on a landscape phone the label column fits the axis caption with its median (cut on Apple and Microsoft at 667 and 812 px); the caption check covers them
3e06304 fix-viz-5: before/after screenshots (66, shrunk to 1.9 MB); log
2c5444c fix-viz-5: V-35 runs again (its precondition reads barPlace's wording); a one-place bar's tip lists its posting's place ranges; the new legend keys have their own class
97cd2b8 fix-viz-5: UX-45 the map's Juice legend starts each grade where the list and the drawer do; patches for UX-36 (index.html) and one notBasePay for build-market
22b705a WIP fix-viz-5: the measurement script, V-45 test on the pins themselves, map words
dd1c522 WIP fix-viz-5: e2e checks per finding, viz-lane allow-list entries removed, landscape median caption
85dbec8 WIP fix-viz-5: V-47 chart update keeps its work across a view or Group switch (same drawing); map pins clear of controls
3449222 WIP fix-viz-5: settled circle plan and area sizes (V-33, V-34), bar weight and titles (V-38, UX-41), pay as posted (V-41, V-48, MR-28, D-43), axis and words (V-42, V-46, UX-40/42/43/59/61, A-8, D-44), map (V-43 to V-45, Razr)
849ad9f WIP fix-viz-5: log skeleton with State
ece9af7 fix-viz-5: prompt verbatim
```

## Uncommitted and new files
```
 M docs/screenshots/chart.png
 M docs/screenshots/dark-drawer.png
 M docs/screenshots/dark.png
 M docs/screenshots/drawer-juice.png
 M docs/screenshots/drawer.png
 M docs/screenshots/fix-pay-at-place/e2e-card-1114x720.png
 M docs/screenshots/fix-pay-at-place/e2e-card-280x653.png
 M docs/screenshots/fix-pay-at-place/e2e-card-352x355.png
 M docs/screenshots/fix-pay-at-place/e2e-card-375x812.png
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
 M public/features/insights.js
```

## Left out (not in untracked.tgz)
- node_modules (symlink)
