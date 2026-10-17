# WIP checkpoint: lead-integration

- Worktree: `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-int`
- Base (on claude/stoic-ride-54ddxp): `0e6f21abb1304c3b871382a9d59179a27a1ca9e8`
- Head: `912a158a23c7fe13d44169f060cf03b323e8a1da`
- Restore: `bash scripts/cycle/restore-wip.sh lead-integration <new worktree dir>`

## Commits since the base
```
912a158 fix-viz-5: log: State (integrated by the lead, gate pending on the lead's head), D-51, M-50, the tile note and the [V-36] checks, phones, e2e, V-47 timings
700b695 fix-viz-5: the two [V-36] e2e checks' reference medians leave out stated minimums, shift pay and part-time pay (MR-28), as the chart's do
e57151f Integration: fix-viz-5's patches: UX-36 Group select reads "No grouping"; build-market uses shared.js notBasePay (one rule for the market cells and the browser's medians)
08abb08 fix-viz-5: the two [V-36] e2e checks open the "N more places" row (D-44 folds the small places) before they look for a place's row; assertions unchanged
f3efc61 fix-viz-5: the insights median tile reads "of N ranges" when some pay is not base pay ("with base pay" wrapped at 360 and 1440)
3730f7e fix-viz-5: D-51 the Ranges legend wraps on a desktop and leads with its pattern keys; M-50 the map's tap check leaves out the offline note; e2e checks for both
e33ca15 fix-viz-5: mobile QA 3's stacked-row tap test finds the row by its count (UX-41 names it by its roles)
f2a4b0f fix-viz-5: on a landscape phone the label column fits the axis caption with its median (cut on Apple and Microsoft at 667 and 812 px); the caption check covers them
7a263ec fix-viz-5: before/after screenshots (66, shrunk to 1.9 MB); log
14c7fd9 fix-viz-5: V-35 runs again (its precondition reads barPlace's wording); a one-place bar's tip lists its posting's place ranges; the new legend keys have their own class
9e37995 fix-viz-5: UX-45 the map's Juice legend starts each grade where the list and the drawer do; patches for UX-36 (index.html) and one notBasePay for build-market
9fa0e04 WIP fix-viz-5: the measurement script, V-45 test on the pins themselves, map words
750219e WIP fix-viz-5: e2e checks per finding, viz-lane allow-list entries removed, landscape median caption
a404eb4 WIP fix-viz-5: V-47 chart update keeps its work across a view or Group switch (same drawing); map pins clear of controls
4164585 WIP fix-viz-5: settled circle plan and area sizes (V-33, V-34), bar weight and titles (V-38, UX-41), pay as posted (V-41, V-48, MR-28, D-43), axis and words (V-42, V-46, UX-40/42/43/59/61, A-8, D-44), map (V-43 to V-45, Razr)
36dca11 WIP fix-viz-5: log skeleton with State
c971aa4 fix-viz-5: prompt verbatim
f348b14 Lead log: the 15:0x session-limit stop; four agents checkpointed and resumed
1e412f6 fix-phone-sizes: UX-39 before and after (Amazon's preview at 390x844 and on the Razr cover screen)
24b1151 WIP fix-phone-sizes: log for the department rows and UX-39
3a4356f WIP fix-phone-sizes: UX-39, the peeking sheet rises to show the preview's first card while Amazon's list loads; a matrix test per phone size
246f772 fix-phone-sizes: a long department name that fits whole in two lines flows as one text (13 px, then 12 px, on the narrowest phones), so Amazon's 'Non-Technical Project, Program and Product Management' is never cut (M-40 with fix-data-3's names)
4c0e9e9 WIP fix-phone-sizes: log State on fbdad58, the stacked Duo, the conflict line
45ef550 fix-phone-sizes: the Surface Duo stacked (720x1114, hinge across): chart and filters on the top screen, the list, job page and sheets on the bottom one; in phone-sizes.mjs and the matrix. Drop a stray conflict marker in styles.css
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
