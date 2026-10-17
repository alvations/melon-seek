# WIP checkpoint: fix-phone-sizes

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a3ec7679b4d2dd1a0`
- Base (on claude/stoic-ride-54ddxp): `a92a3c83eb4890db11b724667e469ec99655e95c`
- Head: `a6c3e2b120508907e5c530b802ad78d871e07488`
- Restore: `bash scripts/cycle/restore-wip.sh fix-phone-sizes <new worktree dir>`

## Commits since the base
```
a6c3e2b WIP fix-phone-sizes: the matrix measures the placeholder in the field's font; log decisions
2754e9d WIP fix-phone-sizes: landscape means landscape, short screens, the name whole at every width, the 280 px toolbar and tagline, cards and Apply fit, map scale, dual screens
fdc9779 WIP fix-phone-sizes: phone matrix guard (every size in phone-sizes.mjs, 3 boards), prompt and log
```

## Uncommitted and new files
```
 M docs/screenshots/chart.png
 M docs/screenshots/dark-drawer.png
 M docs/screenshots/dark.png
 M docs/screenshots/drawer-juice.png
 M docs/screenshots/drawer.png
 M docs/screenshots/insights.png
 M docs/screenshots/map-juice.png
 M docs/screenshots/map.png
 M docs/screenshots/mobile.png
 M docs/screenshots/qa-mobile/e2e-landscape-map.png
 M public/styles.css
 M test/e2e/phone-matrix.e2e.js
?? docs/screenshots/fix-phone-sizes/
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-phone-sizes/after-galaxy-fold-folded-280x653-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-galaxy-fold-folded-280x653-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-galaxy-s8-small-android-360x740-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-galaxy-z-flip-5-360x880-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-galaxy-z-fold-5-cover-344x882-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-galaxy-z-fold-5-cover-344x882-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-galaxy-z-fold-5-open-690x829-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-iphone-13-14-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-iphone-13-mini-375x812-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-iphone-13-mini-landscape-812x375-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-iphone-15-16-393x852-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-iphone-15-pro-max-430x932-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-iphone-se-1st-gen-320x568-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-iphone-se-1st-gen-320x568-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-iphone-se-3rd-gen-375x667-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-iphone-se-3rd-gen-landscape-667x375-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-motorola-razr-cover-screen-352x355-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-motorola-razr-inner-open-412x1005-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-pixel-8-412x915-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-surface-duo-one-screen-540x720-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-surface-duo-spanned-two-screens-1114x720-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-surface-duo-spanned-two-screens-1114x720-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-galaxy-fold-folded-280x653-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-galaxy-fold-folded-280x653-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-galaxy-s8-small-android-360x740-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-galaxy-z-flip-5-360x880-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-galaxy-z-fold-5-cover-344x882-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-galaxy-z-fold-5-cover-344x882-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-galaxy-z-fold-5-open-690x829-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-iphone-13-14-390x844-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-iphone-13-mini-375x812-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-iphone-13-mini-landscape-812x375-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-iphone-15-16-393x852-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-iphone-15-pro-max-430x932-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-iphone-se-1st-gen-320x568-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-iphone-se-1st-gen-320x568-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-iphone-se-3rd-gen-375x667-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-iphone-se-3rd-gen-landscape-667x375-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-motorola-razr-cover-screen-352x355-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-motorola-razr-inner-landscape-1005x412-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-motorola-razr-inner-open-412x1005-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-pixel-8-412x915-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-surface-duo-one-screen-540x720-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-surface-duo-spanned-hinge-1114x720-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-surface-duo-spanned-hinge-filters-1114x720-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-surface-duo-spanned-hinge-job-1114x720-light.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-surface-duo-spanned-two-screens-1114x720-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-surface-duo-spanned-two-screens-1114x720-light.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)
