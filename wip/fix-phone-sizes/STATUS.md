# WIP checkpoint: fix-phone-sizes

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a3ec7679b4d2dd1a0`
- Base (on claude/stoic-ride-54ddxp): `1ef0646b6f16aca8f215cf21e368185bddcf7b89`
- Head: `55606359ccddfed1cfb1f63f918c69ff8fd56173`
- Restore: `bash scripts/cycle/restore-wip.sh fix-phone-sizes <new worktree dir>`

## Commits since the base
```
5560635 fix-phone-sizes: M-52 follow-up, at 861-999 px the search box keeps "Search" on a board with a Refresh button (no "/" hint, tighter padding); the top bar sweep checks it
51364e1 fix-phone-sizes: mobile QA 4 before and after (M-49 Microsoft's Apply at 390, M-51 Amazon's meta line at 390, M-52 the Razr in landscape and its filter field with the keyboard up)
b0abf24 fix-phone-sizes: the matrix checks the job page's meta line (no "·" at a line's start or end, no word clipped) and the Apply label (one line, the whole name) at every size (M-49, M-51)
8cb8fb0 fix-phone-sizes: M-52, touch screens wider than 860 px get 44 px controls and 16 px fields, a focused filter field moves above the keyboard, and the top bar fits from 861 px; matrix tests at 932x430, 1005x412 and 1114x720 and a 861-1001 px sweep
13f0082 fix-phone-sizes: M-51, the job page's meta line never starts or ends a line with "·" (each item carries its "·"; the one that starts a line is clipped away)
0a00102 fix-phone-sizes: M-49, the job page's Apply label is one line: "Apply on X’s careers site", else "Apply on X’s site", else "Apply" (the host stays under it); the link's name stays the long label
97a36d3 fix-phone-sizes: M-48, a card's "N places" / "2 levels" line is 12 px (was 11.5), on one line
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
 M docs/screenshots/fix-pay-at-place/e2e-card-1114x720.png
 M docs/screenshots/fix-pay-at-place/e2e-card-280x653.png
 M docs/screenshots/fix-pay-at-place/e2e-card-352x355.png
 M docs/screenshots/fix-pay-at-place/e2e-card-375x812.png
 M scripts/e2e.js
?? docs/screenshots/fix-pay-at-place/e2e-card-720x1114.png
?? test/e2e/beta-mobile-qa-4.e2e.js
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-pay-at-place/e2e-card-720x1114.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)
