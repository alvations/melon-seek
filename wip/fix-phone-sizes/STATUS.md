# WIP checkpoint: fix-phone-sizes

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a3ec7679b4d2dd1a0`
- Base (on claude/stoic-ride-54ddxp): `1ef0646b6f16aca8f215cf21e368185bddcf7b89`
- Head: `e939c46367f58295cce292b6c123ad979087e625`
- Restore: `bash scripts/cycle/restore-wip.sh fix-phone-sizes <new worktree dir>`

## Commits since the base
```
e939c46 WIP fix-phone-sizes: M-48, M-49, M-51, M-52 (untested)
8606e3d fix-phone-sizes: the iPhone 15 Pro Max in landscape (932x430) joins the phone sizes (mobile QA 4, M-52)
13bff8f WIP fix-phone-sizes: log, the verification on 780e0ac
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
 M docs/screenshots/dark-drawer.png
 M docs/screenshots/dark.png
 M docs/screenshots/drawer-juice.png
 M docs/screenshots/drawer.png
 M public/styles.css
 M scripts/e2e.js
 M test/e2e/phone-matrix.e2e.js
?? docs/screenshots/fix-phone-sizes/after-m49-apply-microsoft-390.png
?? docs/screenshots/fix-phone-sizes/after-m51-meta-line-amazon-390.png
?? docs/screenshots/fix-phone-sizes/after-m52-razr-landscape-1005x412.png
?? docs/screenshots/fix-phone-sizes/after-m52-razr-landscape-keyboard.png
?? docs/screenshots/fix-phone-sizes/before-m49-apply-microsoft-390.png
?? docs/screenshots/fix-phone-sizes/before-m51-meta-line-amazon-390.png
?? docs/screenshots/fix-phone-sizes/before-m52-razr-landscape-1005x412.png
?? docs/screenshots/fix-phone-sizes/before-m52-razr-landscape-keyboard.png
?? test/e2e/beta-mobile-qa-4.e2e.js
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-phone-sizes/after-m49-apply-microsoft-390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-m51-meta-line-amazon-390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-m52-razr-landscape-1005x412.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/after-m52-razr-landscape-keyboard.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-m49-apply-microsoft-390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-m51-meta-line-amazon-390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-m52-razr-landscape-1005x412.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-phone-sizes/before-m52-razr-landscape-keyboard.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)
