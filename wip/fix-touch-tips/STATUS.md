# WIP checkpoint: fix-touch-tips

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-ab71eae8dc63a1104`
- Base (on claude/stoic-ride-54ddxp): `32f556f70452f79022ea3d90fb19aaeeec27b44c`
- Head: `432449b3206c8a15b4ae63b0c70ae082acc64418`
- Restore: `bash scripts/cycle/restore-wip.sh fix-touch-tips <new worktree dir>`

## Commits since the base
```
432449b WIP fix-touch-tips: log, after screenshots, ui.e2e patch for the Keywords words, e2e size switch and drawer/map shots
0102980 WIP fix-touch-tips: one touch rule for every floating tip (comps, chart, strip, Insights, Compare, map), input-worded hints, touch-reachable words
e00c2c0 WIP fix-touch-tips: failing e2e for every sticky tip on touch (iPhone sequence), prompt, before screenshots
```

## Uncommitted and new files
```
 M docs/process/fix-touch-tips.md
 M docs/screenshots/fix-touch-tips/after-chart-circle-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/after-chart-circle-tap-p390-light.png
 M docs/screenshots/fix-touch-tips/after-chart-hover-desktop-dark.png
 M docs/screenshots/fix-touch-tips/after-chart-hover-desktop-light.png
 M docs/screenshots/fix-touch-tips/after-compare-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/after-compare-tap-p390-light.png
 M docs/screenshots/fix-touch-tips/after-comps-current-tap-p360-dark.png
 M docs/screenshots/fix-touch-tips/after-comps-current-tap-p360-light.png
 M docs/screenshots/fix-touch-tips/after-comps-current-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/after-comps-current-tap-p390-light.png
 M docs/screenshots/fix-touch-tips/after-comps-hover-desktop-dark.png
 M docs/screenshots/fix-touch-tips/after-comps-hover-desktop-light.png
 M docs/screenshots/fix-touch-tips/after-comps-keyboard-desktop-dark.png
 M docs/screenshots/fix-touch-tips/after-comps-keyboard-desktop-light.png
 M docs/screenshots/fix-touch-tips/after-comps-scroll-p390-dark.png
 M docs/screenshots/fix-touch-tips/after-comps-scroll-p390-light.png
 M docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p360-dark.png
 M docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p360-light.png
 M docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p390-dark.png
 M docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p390-light.png
 M docs/screenshots/fix-touch-tips/after-comps-tap-p360-dark.png
 M docs/screenshots/fix-touch-tips/after-comps-tap-p360-light.png
 M docs/screenshots/fix-touch-tips/after-comps-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/after-comps-tap-p390-light.png
 M docs/screenshots/fix-touch-tips/after-drawer-juice-household-p390-dark.png
 M docs/screenshots/fix-touch-tips/after-drawer-juice-household-p390-light.png
 M docs/screenshots/fix-touch-tips/after-drawer-pay-details-p390-dark.png
 M docs/screenshots/fix-touch-tips/after-drawer-pay-details-p390-light.png
 M docs/screenshots/fix-touch-tips/after-map-pin-keyboard-p390-dark.png
 M docs/screenshots/fix-touch-tips/after-map-pin-keyboard-p390-light.png
 M docs/screenshots/fix-touch-tips/after-map-pin-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/after-map-pin-tap-p390-light.png
 M docs/screenshots/fix-touch-tips/after-strip-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/after-strip-tap-p390-light.png
 M docs/screenshots/fix-touch-tips/before-chart-circle-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/before-chart-circle-tap-p390-light.png
 M docs/screenshots/fix-touch-tips/before-chart-hover-desktop-dark.png
 M docs/screenshots/fix-touch-tips/before-chart-hover-desktop-light.png
 M docs/screenshots/fix-touch-tips/before-compare-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/before-compare-tap-p390-light.png
 M docs/screenshots/fix-touch-tips/before-comps-current-tap-p360-dark.png
 M docs/screenshots/fix-touch-tips/before-comps-current-tap-p360-light.png
 M docs/screenshots/fix-touch-tips/before-comps-current-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/before-comps-current-tap-p390-light.png
 M docs/screenshots/fix-touch-tips/before-comps-hover-desktop-dark.png
 M docs/screenshots/fix-touch-tips/before-comps-hover-desktop-light.png
 M docs/screenshots/fix-touch-tips/before-comps-keyboard-desktop-dark.png
 M docs/screenshots/fix-touch-tips/before-comps-keyboard-desktop-light.png
 M docs/screenshots/fix-touch-tips/before-comps-scroll-p390-dark.png
 M docs/screenshots/fix-touch-tips/before-comps-scroll-p390-light.png
 M docs/screenshots/fix-touch-tips/before-comps-tap-elsewhere-p360-dark.png
 M docs/screenshots/fix-touch-tips/before-comps-tap-elsewhere-p360-light.png
 M docs/screenshots/fix-touch-tips/before-comps-tap-elsewhere-p390-dark.png
 M docs/screenshots/fix-touch-tips/before-comps-tap-elsewhere-p390-light.png
 M docs/screenshots/fix-touch-tips/before-comps-tap-p360-dark.png
 M docs/screenshots/fix-touch-tips/before-comps-tap-p360-light.png
 M docs/screenshots/fix-touch-tips/before-comps-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/before-comps-tap-p390-light.png
 M docs/screenshots/fix-touch-tips/before-drawer-juice-household-p390-dark.png
 M docs/screenshots/fix-touch-tips/before-drawer-juice-household-p390-light.png
 M docs/screenshots/fix-touch-tips/before-drawer-pay-details-p390-dark.png
 M docs/screenshots/fix-touch-tips/before-drawer-pay-details-p390-light.png
 M docs/screenshots/fix-touch-tips/before-map-pin-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/before-map-pin-tap-p390-light.png
 M docs/screenshots/fix-touch-tips/before-strip-tap-p390-dark.png
 M docs/screenshots/fix-touch-tips/before-strip-tap-p390-light.png
 M public/app.js
 M public/features/shared.js
 M test/fix-touch-tips.test.js
?? docs/screenshots/fix-touch-tips/after-chart-circle-tap-p360-dark.png
?? docs/screenshots/fix-touch-tips/after-compare-tap-p360-dark.png
?? docs/screenshots/fix-touch-tips/after-comps-scroll-p360-dark.png
?? docs/screenshots/fix-touch-tips/after-drawer-juice-household-p360-dark.png
?? docs/screenshots/fix-touch-tips/after-drawer-pay-details-p360-dark.png
?? docs/screenshots/fix-touch-tips/after-map-pin-keyboard-p360-dark.png
?? docs/screenshots/fix-touch-tips/after-map-pin-tap-p360-dark.png
?? docs/screenshots/fix-touch-tips/after-strip-tap-p360-dark.png
?? docs/screenshots/fix-touch-tips/before-chart-circle-tap-p360-dark.png
?? docs/screenshots/fix-touch-tips/before-compare-tap-p360-dark.png
?? docs/screenshots/fix-touch-tips/before-comps-scroll-p360-dark.png
?? docs/screenshots/fix-touch-tips/before-drawer-juice-household-p360-dark.png
?? docs/screenshots/fix-touch-tips/before-drawer-pay-details-p360-dark.png
?? docs/screenshots/fix-touch-tips/before-map-pin-tap-p360-dark.png
?? docs/screenshots/fix-touch-tips/before-strip-tap-p360-dark.png
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-touch-tips/after-chart-circle-tap-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-compare-tap-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-scroll-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-drawer-juice-household-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-drawer-pay-details-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-map-pin-keyboard-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-map-pin-tap-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-strip-tap-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/before-chart-circle-tap-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/before-compare-tap-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/before-comps-scroll-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/before-drawer-juice-household-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/before-drawer-pay-details-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/before-map-pin-tap-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/before-strip-tap-p360-dark.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)
