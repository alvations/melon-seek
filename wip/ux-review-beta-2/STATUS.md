# WIP checkpoint: ux-review-beta-2

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-af29c49e4f4fc6d19`
- Base (on claude/stoic-ride-54ddxp): `d98a9f008d335b579c0da8852b959a796367f772`
- Head: `25e79af3c22bfab355155a72d9028df84afb56c5`
- Restore: `bash scripts/cycle/restore-wip.sh ux-review-beta-2 <new worktree dir>`

## Commits since the base
```
25e79af ux-review-beta-2: e2e group, 11 red tests (UX-35, UX-37 to UX-39, UX-42, UX-44 to UX-49, UX-53, UX-54)
eff99d9 ux-review-beta-2: first findings (UX-37 to UX-50) and screenshots
459a4c2 ux-review-beta-2: log skeleton with State
8dc2d36 ux-review-beta-2: prompt verbatim
```

## Uncommitted and new files
```
?? docs/screenshots/ux-review-beta-2/card-amazon-foreign-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-amazon-foreign-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-amazon-longtitle-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-amazon-longtitle-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-amazon-minimum-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-amazon-minimum-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-amazon-places-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-amazon-places-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-amazon-shift-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-amazon-term-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-amazon-term-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-anduril-foreign-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-anduril-foreign-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-anduril-hourly-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-anduril-hourly-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-anduril-longtitle-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-anduril-longtitle-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-anduril-term-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-anduril-term-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-apple-hourly-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-apple-longtitle-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-apple-longtitle-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-apple-places-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-apple-places-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-google-foreign-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-google-foreign-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-google-levels-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-google-levels-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-google-longtitle-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-google-longtitle-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-google-term-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-google-term-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-meta-foreign-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-meta-foreign-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-meta-longtitle-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-meta-longtitle-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-meta-term-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-meta-term-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-foreign-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-foreign-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-hourly-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-hourly-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-levels-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-levels-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-longtitle-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-longtitle-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-places-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-places-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-term-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-microsoft-term-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-netflix-foreign-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-netflix-foreign-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-netflix-hourly-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-netflix-hourly-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-netflix-longtitle-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-netflix-longtitle-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-nvidia-foreign-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-nvidia-foreign-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-nvidia-hourly-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-nvidia-hourly-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-nvidia-levels-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-nvidia-levels-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-nvidia-longtitle-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-nvidia-longtitle-p390-light.png
?? docs/screenshots/ux-review-beta-2/card-nvidia-term-d1440-light.png
?? docs/screenshots/ux-review-beta-2/card-nvidia-term-p390-light.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-chart.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-foreign.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-minimum.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-nopay.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-places.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-shift.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-term.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-top.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-insights.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-map.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-mapjuice.png
?? docs/screenshots/ux-review-beta-2/density-amazon-d1440-ranges.png
?? docs/screenshots/ux-review-beta-2/density-anduril-d1440-chart.png
?? docs/screenshots/ux-review-beta-2/density-anduril-d1440-drawer-foreign.png
?? docs/screenshots/ux-review-beta-2/density-anduril-d1440-drawer-nopay.png
?? docs/screenshots/ux-review-beta-2/density-anduril-d1440-drawer-term.png
?? docs/screenshots/ux-review-beta-2/density-anduril-d1440-drawer-top.png
?? docs/screenshots/ux-review-beta-2/density-anduril-d1440-insights.png
?? docs/screenshots/ux-review-beta-2/density-anduril-d1440-map.png
?? docs/screenshots/ux-review-beta-2/density-anduril-d1440-mapjuice.png
?? docs/screenshots/ux-review-beta-2/density-anduril-d1440-ranges.png
?? docs/screenshots/ux-review-beta-2/density-apple-d1440-chart.png
?? docs/screenshots/ux-review-beta-2/density-apple-d1440-drawer-nopay.png
?? docs/screenshots/ux-review-beta-2/density-apple-d1440-drawer-places.png
?? docs/screenshots/ux-review-beta-2/density-apple-d1440-drawer-top.png
?? docs/screenshots/ux-review-beta-2/density-apple-d1440-insights.png
?? docs/screenshots/ux-review-beta-2/density-apple-d1440-map.png
?? docs/screenshots/ux-review-beta-2/density-apple-d1440-mapjuice.png
?? docs/screenshots/ux-review-beta-2/density-apple-d1440-ranges.png
?? docs/screenshots/ux-review-beta-2/density-google-d1440-chart.png
?? docs/screenshots/ux-review-beta-2/density-google-d1440-drawer-foreign.png
?? docs/screenshots/ux-review-beta-2/density-google-d1440-drawer-levels.png
?? docs/screenshots/ux-review-beta-2/density-google-d1440-drawer-nopay.png
?? docs/screenshots/ux-review-beta-2/density-google-d1440-drawer-term.png
?? docs/screenshots/ux-review-beta-2/density-google-d1440-drawer-top.png
?? docs/screenshots/ux-review-beta-2/density-google-d1440-insights.png
?? docs/screenshots/ux-review-beta-2/density-google-d1440-map.png
?? docs/screenshots/ux-review-beta-2/density-google-d1440-mapjuice.png
?? docs/screenshots/ux-review-beta-2/density-google-d1440-ranges.png
?? docs/screenshots/ux-review-beta-2/density-meta-d1440-chart.png
?? docs/screenshots/ux-review-beta-2/density-meta-d1440-drawer-foreign.png
?? docs/screenshots/ux-review-beta-2/density-meta-d1440-drawer-nopay.png
?? docs/screenshots/ux-review-beta-2/density-meta-d1440-drawer-term.png
?? docs/screenshots/ux-review-beta-2/density-meta-d1440-drawer-top.png
?? docs/screenshots/ux-review-beta-2/density-meta-d1440-insights.png
?? docs/screenshots/ux-review-beta-2/density-meta-d1440-map.png
?? docs/screenshots/ux-review-beta-2/density-meta-d1440-mapjuice.png
?? docs/screenshots/ux-review-beta-2/density-meta-d1440-ranges.png
?? docs/screenshots/ux-review-beta-2/density-microsoft-d1440-chart.png
?? docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-foreign.png
?? docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-levels.png
?? docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-nopay.png
?? docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-places.png
?? docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-term.png
?? docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-top.png
?? docs/screenshots/ux-review-beta-2/density-microsoft-d1440-insights.png
?? docs/screenshots/ux-review-beta-2/density-microsoft-d1440-map.png
?? docs/screenshots/ux-review-beta-2/density-microsoft-d1440-mapjuice.png
?? docs/screenshots/ux-review-beta-2/density-microsoft-d1440-ranges.png
?? docs/screenshots/ux-review-beta-2/density-netflix-d1440-chart.png
?? docs/screenshots/ux-review-beta-2/density-netflix-d1440-drawer-foreign.png
?? docs/screenshots/ux-review-beta-2/density-netflix-d1440-drawer-nopay.png
?? docs/screenshots/ux-review-beta-2/density-netflix-d1440-drawer-top.png
?? docs/screenshots/ux-review-beta-2/density-netflix-d1440-insights.png
?? docs/screenshots/ux-review-beta-2/density-netflix-d1440-map.png
?? docs/screenshots/ux-review-beta-2/density-netflix-d1440-mapjuice.png
?? docs/screenshots/ux-review-beta-2/density-netflix-d1440-ranges.png
?? docs/screenshots/ux-review-beta-2/density-nvidia-d1440-chart.png
?? docs/screenshots/ux-review-beta-2/density-nvidia-d1440-drawer-foreign.png
?? docs/screenshots/ux-review-beta-2/density-nvidia-d1440-drawer-levels.png
?? docs/screenshots/ux-review-beta-2/density-nvidia-d1440-drawer-nopay.png
?? docs/screenshots/ux-review-beta-2/density-nvidia-d1440-drawer-term.png
?? docs/screenshots/ux-review-beta-2/density-nvidia-d1440-drawer-top.png
?? docs/screenshots/ux-review-beta-2/density-nvidia-d1440-insights.png
?? docs/screenshots/ux-review-beta-2/density-nvidia-d1440-map.png
?? docs/screenshots/ux-review-beta-2/density-nvidia-d1440-mapjuice.png
?? docs/screenshots/ux-review-beta-2/density-nvidia-d1440-ranges.png
?? docs/screenshots/ux-review-beta-2/insights-stat-note-cut-p360-light.png
?? docs/screenshots/ux-review-beta-2/insights-tiles-d1440-light.png
?? docs/screenshots/ux-review-beta-2/orphan-details-chart-d1440-light.png
?? docs/screenshots/ux-review-beta-2/orphan-details-chart-p390-light.png
?? docs/screenshots/ux-review-beta-2/orphan-details-map-d1440-light.png
?? docs/screenshots/ux-review-beta-2/orphan-details-map-p390-light.png
?? docs/screenshots/ux-review-beta-2/state-badge-d1440-light.png
?? docs/screenshots/ux-review-beta-2/state-badge-p390-light.png
?? docs/screenshots/ux-review-beta-2/state-empty-d1440-light.png
?? docs/screenshots/ux-review-beta-2/state-empty-p390-light.png
?? docs/screenshots/ux-review-beta-2/state-empty-pay-d1440-light.png
?? docs/screenshots/ux-review-beta-2/state-empty-pay-p390-light.png
?? docs/screenshots/ux-review-beta-2/state-error-d1440-light.png
?? docs/screenshots/ux-review-beta-2/state-error-p390-light.png
?? docs/screenshots/ux-review-beta-2/state-loading-d1440-light.png
?? docs/screenshots/ux-review-beta-2/state-loading-p390-light.png
```

## Left out (not in untracked.tgz)
- docs/screenshots/ux-review-beta-2/card-amazon-foreign-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-amazon-foreign-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-amazon-longtitle-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-amazon-longtitle-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-amazon-minimum-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-amazon-minimum-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-amazon-places-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-amazon-places-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-amazon-shift-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-amazon-term-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-amazon-term-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-anduril-foreign-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-anduril-foreign-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-anduril-hourly-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-anduril-hourly-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-anduril-longtitle-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-anduril-longtitle-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-anduril-term-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-anduril-term-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-apple-hourly-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-apple-longtitle-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-apple-longtitle-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-apple-places-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-apple-places-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-google-foreign-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-google-foreign-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-google-levels-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-google-levels-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-google-longtitle-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-google-longtitle-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-google-term-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-google-term-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-meta-foreign-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-meta-foreign-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-meta-longtitle-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-meta-longtitle-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-meta-term-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-meta-term-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-foreign-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-foreign-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-hourly-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-hourly-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-levels-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-levels-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-longtitle-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-longtitle-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-places-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-places-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-term-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-microsoft-term-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-netflix-foreign-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-netflix-foreign-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-netflix-hourly-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-netflix-hourly-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-netflix-longtitle-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-netflix-longtitle-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-nvidia-foreign-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-nvidia-foreign-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-nvidia-hourly-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-nvidia-hourly-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-nvidia-levels-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-nvidia-levels-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-nvidia-longtitle-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-nvidia-longtitle-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-nvidia-term-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/card-nvidia-term-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-chart.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-foreign.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-minimum.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-nopay.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-places.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-shift.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-term.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-drawer-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-mapjuice.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-amazon-d1440-ranges.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-anduril-d1440-chart.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-anduril-d1440-drawer-foreign.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-anduril-d1440-drawer-nopay.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-anduril-d1440-drawer-term.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-anduril-d1440-drawer-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-anduril-d1440-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-anduril-d1440-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-anduril-d1440-mapjuice.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-anduril-d1440-ranges.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-apple-d1440-chart.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-apple-d1440-drawer-nopay.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-apple-d1440-drawer-places.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-apple-d1440-drawer-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-apple-d1440-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-apple-d1440-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-apple-d1440-mapjuice.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-apple-d1440-ranges.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-google-d1440-chart.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-google-d1440-drawer-foreign.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-google-d1440-drawer-levels.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-google-d1440-drawer-nopay.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-google-d1440-drawer-term.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-google-d1440-drawer-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-google-d1440-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-google-d1440-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-google-d1440-mapjuice.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-google-d1440-ranges.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-meta-d1440-chart.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-meta-d1440-drawer-foreign.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-meta-d1440-drawer-nopay.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-meta-d1440-drawer-term.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-meta-d1440-drawer-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-meta-d1440-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-meta-d1440-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-meta-d1440-mapjuice.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-meta-d1440-ranges.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-microsoft-d1440-chart.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-foreign.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-levels.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-nopay.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-places.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-term.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-microsoft-d1440-drawer-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-microsoft-d1440-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-microsoft-d1440-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-microsoft-d1440-mapjuice.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-microsoft-d1440-ranges.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-netflix-d1440-chart.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-netflix-d1440-drawer-foreign.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-netflix-d1440-drawer-nopay.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-netflix-d1440-drawer-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-netflix-d1440-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-netflix-d1440-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-netflix-d1440-mapjuice.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-netflix-d1440-ranges.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-nvidia-d1440-chart.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-nvidia-d1440-drawer-foreign.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-nvidia-d1440-drawer-levels.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-nvidia-d1440-drawer-nopay.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-nvidia-d1440-drawer-term.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-nvidia-d1440-drawer-top.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-nvidia-d1440-insights.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-nvidia-d1440-map.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-nvidia-d1440-mapjuice.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/density-nvidia-d1440-ranges.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/insights-stat-note-cut-p360-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/insights-tiles-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/orphan-details-chart-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/orphan-details-chart-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/orphan-details-map-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/orphan-details-map-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/state-badge-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/state-badge-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/state-empty-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/state-empty-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/state-empty-pay-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/state-empty-pay-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/state-error-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/state-error-p390-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/state-loading-d1440-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/ux-review-beta-2/state-loading-p390-light.png (screenshot; the lane's tests regenerate it)
