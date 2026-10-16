# WIP checkpoint: fix-touch-tips

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-ab71eae8dc63a1104`
- Base (on claude/stoic-ride-54ddxp): `32f556f70452f79022ea3d90fb19aaeeec27b44c`
- Head: `01029801928b9a1518e7068ee05aaa3f903321bb`
- Restore: `bash scripts/cycle/restore-wip.sh fix-touch-tips <new worktree dir>`

## Commits since the base
```
0102980 WIP fix-touch-tips: one touch rule for every floating tip (comps, chart, strip, Insights, Compare, map), input-worded hints, touch-reachable words
e00c2c0 WIP fix-touch-tips: failing e2e for every sticky tip on touch (iPhone sequence), prompt, before screenshots
```

## Uncommitted and new files
```
 M docs/screenshots/chart.png
 M docs/screenshots/dark-drawer.png
 M docs/screenshots/dark.png
 M docs/screenshots/drawer-juice.png
 M docs/screenshots/insights.png
 M docs/screenshots/map-juice.png
 M docs/screenshots/map.png
 M docs/screenshots/mobile.png
?? docs/process/fix-touch-tips.md
?? docs/process/patches/fix-touch-tips-ui-e2e.diff
?? docs/screenshots/fix-touch-tips/after-chart-circle-tap-p390-dark.png
?? docs/screenshots/fix-touch-tips/after-chart-circle-tap-p390-light.png
?? docs/screenshots/fix-touch-tips/after-chart-hover-desktop-dark.png
?? docs/screenshots/fix-touch-tips/after-chart-hover-desktop-light.png
?? docs/screenshots/fix-touch-tips/after-compare-tap-p390-dark.png
?? docs/screenshots/fix-touch-tips/after-compare-tap-p390-light.png
?? docs/screenshots/fix-touch-tips/after-comps-current-tap-p360-dark.png
?? docs/screenshots/fix-touch-tips/after-comps-current-tap-p360-light.png
?? docs/screenshots/fix-touch-tips/after-comps-current-tap-p390-dark.png
?? docs/screenshots/fix-touch-tips/after-comps-current-tap-p390-light.png
?? docs/screenshots/fix-touch-tips/after-comps-hover-desktop-dark.png
?? docs/screenshots/fix-touch-tips/after-comps-hover-desktop-light.png
?? docs/screenshots/fix-touch-tips/after-comps-keyboard-desktop-dark.png
?? docs/screenshots/fix-touch-tips/after-comps-keyboard-desktop-light.png
?? docs/screenshots/fix-touch-tips/after-comps-scroll-p390-dark.png
?? docs/screenshots/fix-touch-tips/after-comps-scroll-p390-light.png
?? docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p360-dark.png
?? docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p360-light.png
?? docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p390-dark.png
?? docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p390-light.png
?? docs/screenshots/fix-touch-tips/after-comps-tap-p360-dark.png
?? docs/screenshots/fix-touch-tips/after-comps-tap-p360-light.png
?? docs/screenshots/fix-touch-tips/after-comps-tap-p390-dark.png
?? docs/screenshots/fix-touch-tips/after-comps-tap-p390-light.png
?? docs/screenshots/fix-touch-tips/after-drawer-juice-household-p390-dark.png
?? docs/screenshots/fix-touch-tips/after-drawer-juice-household-p390-light.png
?? docs/screenshots/fix-touch-tips/after-drawer-pay-details-p390-dark.png
?? docs/screenshots/fix-touch-tips/after-drawer-pay-details-p390-light.png
?? docs/screenshots/fix-touch-tips/after-map-pin-tap-p390-dark.png
?? docs/screenshots/fix-touch-tips/after-map-pin-tap-p390-light.png
?? docs/screenshots/fix-touch-tips/after-strip-tap-p390-dark.png
?? docs/screenshots/fix-touch-tips/after-strip-tap-p390-light.png
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-touch-tips/after-chart-circle-tap-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-chart-circle-tap-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-chart-hover-desktop-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-chart-hover-desktop-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-compare-tap-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-compare-tap-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-current-tap-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-current-tap-p360-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-current-tap-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-current-tap-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-hover-desktop-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-hover-desktop-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-keyboard-desktop-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-keyboard-desktop-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-scroll-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-scroll-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p360-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-tap-elsewhere-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-tap-p360-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-tap-p360-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-tap-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-comps-tap-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-drawer-juice-household-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-drawer-juice-household-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-drawer-pay-details-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-drawer-pay-details-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-map-pin-tap-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-map-pin-tap-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-strip-tap-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-touch-tips/after-strip-tap-p390-light.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)
