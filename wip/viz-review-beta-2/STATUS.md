# WIP checkpoint: viz-review-beta-2

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-ad0fd955ea2a5ca0e`
- Base (on claude/stoic-ride-54ddxp): `d98a9f008d335b579c0da8852b959a796367f772`
- Head: `fdef774e63529b10a94914a88c61b011ee4ccc4b`
- Restore: `bash scripts/cycle/restore-wip.sh viz-review-beta-2 <new worktree dir>`

## Commits since the base
```
fdef774 viz-review-beta-2: log V-46 to V-48
c1609b2 viz-review-beta-2: red test V-48 (on-target earnings: no legend key, OTE spans striped)
e0d6300 viz-review-beta-2: red test V-46 (phone axis has no unit), screenshots
1a9f468 viz-review-beta-2: log with V-33 to V-45, the viz-even judgement and what works
eb76e46 viz-review-beta-2: red tests V-39 to V-45, screenshots
93b9a79 viz-review-beta-2: red e2e tests for V-33 to V-38, registered in scripts/e2e.js
ddb308f viz-review-beta-2: findings V-33 to V-38, first screenshots
46c64b6 viz-review-beta-2: prompt and log skeleton
```

## Uncommitted and new files
```
 M docs/process/viz-review-beta-2.md
 M docs/screenshots/viz-review-beta-2/clusters-amazon-1440-dark.png
 D docs/screenshots/viz-review-beta-2/clusters-amazon-1440-light.png
 M docs/screenshots/viz-review-beta-2/clusters-amazon-1440.png
 M docs/screenshots/viz-review-beta-2/clusters-amazon-390-dark.png
 M docs/screenshots/viz-review-beta-2/clusters-amazon-390-light.png
 M docs/screenshots/viz-review-beta-2/clusters-amazon-390.png
 M docs/screenshots/viz-review-beta-2/clusters-anduril-1440.png
 M docs/screenshots/viz-review-beta-2/clusters-anduril-390.png
 M docs/screenshots/viz-review-beta-2/clusters-apple-1440.png
 M docs/screenshots/viz-review-beta-2/clusters-apple-390.png
 M docs/screenshots/viz-review-beta-2/clusters-google-1440.png
 M docs/screenshots/viz-review-beta-2/clusters-google-390.png
 M docs/screenshots/viz-review-beta-2/clusters-meta-1440.png
 M docs/screenshots/viz-review-beta-2/clusters-meta-390.png
 M docs/screenshots/viz-review-beta-2/clusters-microsoft-1440.png
 M docs/screenshots/viz-review-beta-2/clusters-microsoft-390.png
 M docs/screenshots/viz-review-beta-2/clusters-netflix-1440.png
 M docs/screenshots/viz-review-beta-2/clusters-netflix-390.png
 M docs/screenshots/viz-review-beta-2/clusters-nvidia-1440.png
 M docs/screenshots/viz-review-beta-2/clusters-nvidia-390.png
 M docs/screenshots/viz-review-beta-2/cvd-amazon-map-juice-deuteranopia.png
 M docs/screenshots/viz-review-beta-2/cvd-amazon-map-juice-protanopia.png
 M docs/screenshots/viz-review-beta-2/cvd-amazon-map-pay-deuteranopia.png
 M docs/screenshots/viz-review-beta-2/cvd-amazon-map-pay-protanopia.png
 M docs/screenshots/viz-review-beta-2/cvd-amazon-ranges-deuteranopia.png
 M docs/screenshots/viz-review-beta-2/cvd-amazon-ranges-protanopia.png
 M docs/screenshots/viz-review-beta-2/cvd-google-clusters-deuteranopia.png
 M docs/screenshots/viz-review-beta-2/cvd-google-clusters-protanopia.png
 M docs/screenshots/viz-review-beta-2/drawer-amazon-amazon10451598.png
 D docs/screenshots/viz-review-beta-2/drawer-amazon-amazon10462294.png
 M docs/screenshots/viz-review-beta-2/drawer-amazon-amazon10520490.png
 D docs/screenshots/viz-review-beta-2/drawer-amazon-amazon10526694.png
 D docs/screenshots/viz-review-beta-2/drawer-amazon-amazon10571268.png
 D docs/screenshots/viz-review-beta-2/drawer-amazon-amazon10571465.png
 M docs/screenshots/viz-review-beta-2/drawer-meta-meta1102464902292466.png
 D docs/screenshots/viz-review-beta-2/drawer-meta-meta1564387271657413.png
 D docs/screenshots/viz-review-beta-2/drawer-meta-meta2035912784006651.png
 D docs/screenshots/viz-review-beta-2/drawer-meta-meta4385739228344797.png
 M docs/screenshots/viz-review-beta-2/google-company-1440.png
 M docs/screenshots/viz-review-beta-2/insights-google-1440.png
 M docs/screenshots/viz-review-beta-2/insights-meta-1440.png
 M docs/screenshots/viz-review-beta-2/insights-microsoft-1440.png
 M docs/screenshots/viz-review-beta-2/map-amazon-l=Cupertino.png
 M docs/screenshots/viz-review-beta-2/map-amazon-l=Seattle.png
 M docs/screenshots/viz-review-beta-2/map-amazon-pay-dark.png
 M docs/screenshots/viz-review-beta-2/map-amazon-pay-light.png
 M docs/screenshots/viz-review-beta-2/map-amazon-seattle-drawer-1024.png
 M docs/screenshots/viz-review-beta-2/map-amazon-world-1440.png
 M docs/screenshots/viz-review-beta-2/map-amazon.png
 M docs/screenshots/viz-review-beta-2/map-meta-l=London.png
 M docs/screenshots/viz-review-beta-2/map-meta-l=MenloPark.png
 M docs/screenshots/viz-review-beta-2/map-meta.png
 M docs/screenshots/viz-review-beta-2/preview-amazon-1440-0.png
 M docs/screenshots/viz-review-beta-2/preview-amazon-1440-1.png
 D docs/screenshots/viz-review-beta-2/preview-amazon-1440-2.png
 M docs/screenshots/viz-review-beta-2/preview-amazon-390-mmap-0.png
 D docs/screenshots/viz-review-beta-2/preview-amazon-390-mmap-1.png
 D docs/screenshots/viz-review-beta-2/preview-amazon-390-mmap-2.png
 D docs/screenshots/viz-review-beta-2/preview-amazon-390-mmap-3.png
 M docs/screenshots/viz-review-beta-2/preview-amazon-390-mmap-4.png
 M docs/screenshots/viz-review-beta-2/ranges-amazon-1440-dark.png
 M docs/screenshots/viz-review-beta-2/ranges-amazon-1440-light-end.png
 M docs/screenshots/viz-review-beta-2/ranges-amazon-1440-light.png
 M docs/screenshots/viz-review-beta-2/ranges-amazon-1440.png
 M docs/screenshots/viz-review-beta-2/ranges-amazon-390-dark.png
 M docs/screenshots/viz-review-beta-2/ranges-amazon-390-light-end.png
 M docs/screenshots/viz-review-beta-2/ranges-amazon-390-light.png
 M docs/screenshots/viz-review-beta-2/ranges-anduril-1440.png
 M docs/screenshots/viz-review-beta-2/ranges-apple-1440.png
 M docs/screenshots/viz-review-beta-2/ranges-google-1440.png
 M docs/screenshots/viz-review-beta-2/ranges-meta-1440.png
 M docs/screenshots/viz-review-beta-2/ranges-microsoft-1440-dark.png
 M docs/screenshots/viz-review-beta-2/ranges-microsoft-1440-light.png
 M docs/screenshots/viz-review-beta-2/ranges-microsoft-1440.png
 M docs/screenshots/viz-review-beta-2/ranges-netflix-1440.png
 M docs/screenshots/viz-review-beta-2/ranges-nvidia-1440.png
 M docs/screenshots/viz-review-beta-2/v-amazon-location-Nashville.png
 M docs/screenshots/viz-review-beta-2/v-amazon-map-Cupertino.png
 M docs/screenshots/viz-review-beta-2/v-amazon-ranges-min.png
 M docs/screenshots/viz-review-beta-2/v-amazon-ranges-min2.png
 M docs/screenshots/viz-review-beta-2/v-amazon-ranges-shift.png
 M docs/screenshots/viz-review-beta-2/v-anthropic-ranges-ote.png
 M docs/screenshots/viz-review-beta-2/v-google-ranges-location-London.png
 M docs/screenshots/viz-review-beta-2/v-google-ranges-location-Zurich.png
 M docs/screenshots/viz-review-beta-2/v-microsoft-location-MountainView.png
 M docs/screenshots/viz-review-beta-2/v-microsoft-location-NewYork.png
 M docs/screenshots/viz-review-beta-2/v-microsoft-map-MountainView.png
 M docs/screenshots/viz-review-beta-2/v-microsoft-map-NewYork.png
 M docs/screenshots/viz-review-beta-2/v-nvidia-ranges-location-Munich.png
 M docs/screenshots/viz-review-beta-2/v-nvidia-ranges-ote.png
?? docs/screenshots/viz-review-beta-2/google-bDeepMind-gseniority.png
?? docs/screenshots/viz-review-beta-2/google-bYouTube.png
?? docs/screenshots/viz-review-beta-2/google-gbrand-vranges.png
```

## Left out (not in untracked.tgz)
- docs/screenshots/viz-review-beta-2/google-bDeepMind-gseniority.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/viz-review-beta-2/google-bYouTube.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/viz-review-beta-2/google-gbrand-vranges.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)
