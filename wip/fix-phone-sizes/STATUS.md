# WIP checkpoint: fix-phone-sizes

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a3ec7679b4d2dd1a0`
- Base (on claude/stoic-ride-54ddxp): `1ef0646b6f16aca8f215cf21e368185bddcf7b89`
- Head: `780e0ac7238abecbf2f569ae56236ad8b4c28fe2`
- Restore: `bash scripts/cycle/restore-wip.sh fix-phone-sizes <new worktree dir>`

## Commits since the base
```
780e0ac fix-phone-sizes: UX-39 before and after (Amazon's preview at 390x844 and on the Razr cover screen)
623e430 WIP fix-phone-sizes: log for the department rows and UX-39
93228f6 WIP fix-phone-sizes: UX-39, the peeking sheet rises to show the preview's first card while Amazon's list loads; a matrix test per phone size
6c0ebab fix-phone-sizes: a long department name that fits whole in two lines flows as one text (13 px, then 12 px, on the narrowest phones), so Amazon's 'Non-Technical Project, Program and Product Management' is never cut (M-40 with fix-data-3's names)
d06c5fd WIP fix-phone-sizes: log State on fbdad58, the stacked Duo, the conflict line
dd58b48 fix-phone-sizes: the Surface Duo stacked (720x1114, hinge across): chart and filters on the top screen, the list, job page and sheets on the bottom one; in phone-sizes.mjs and the matrix. Drop a stray conflict marker in styles.css
```

## Uncommitted and new files
```
 M docs/process/fix-phone-sizes.md
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
```

## Left out (not in untracked.tgz)
- node_modules (symlink)
