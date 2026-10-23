# WIP checkpoint: lead-integration

- Worktree: `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/wt-int`
- Base (on claude/stoic-ride-54ddxp): `0e6f21abb1304c3b871382a9d59179a27a1ca9e8`
- Head: `5c0cda3ce45594d4b5daa0a4ca2455dbdb63e327`
- Restore: `bash scripts/cycle/restore-wip.sh lead-integration <new worktree dir>`

## Commits since the base
```
5c0cda3 QA: the desktop beta pass of 2026-10-17 (qa-desktop-beta-4) in docs/QA.md
2e7da1a qa-desktop-beta-4: final log and QA section (full e2e, npm test CI-like)
61d2c2d WIP qa-desktop-beta-4: process log and QA section (full e2e pending)
17cfc89 WIP qa-desktop-beta-4: round-3 re-check screenshots (shrunk)
03fc47f WIP qa-desktop-beta-4: D-52 Compstimate city test and screenshots
9a440ea WIP qa-desktop-beta-4: D-51 Ranges legend test and screenshot
99c7536 WIP qa-desktop-beta-4: D-50 test; bug screenshots D-46 (by decision) to D-50
d414f1e WIP qa-desktop-beta-4: D-46 is by decision (guard instead of a red test); D-49 CSV test
922a2a0 WIP qa-desktop-beta-4: e2e group with D-46 to D-48 and two guards
707f472 WIP qa-desktop-beta-4: state after the first sweep
388fd26 WIP qa-desktop-beta-4: log with State
d913219 qa-desktop-beta-4: brief verbatim
d4c269b fix-qa4: screenshots before and after (shrunk), log State: integration by the lead pending
5cff46c WIP fix-qa4: log the numbers (before and after, backtests) and the test results so far
ef7dc49 fix-qa4: D-50 a third, shorter form of the capped line (280 px took two lines)
7551124 WIP fix-qa4: log decisions and steps; e2e: D-47 chart case, New York by option value
a979e58 fix-qa4: the careers-site names live in the build script, not in lib/export.js (the main site ships no beta host)
4a7992e WIP fix-qa4: CONTRACT section, log with State
b4dc91f WIP fix-qa4: unit tests (12 of 14 red on the base), the e2e group, the README's per-file sources
0d1c604 WIP fix-qa4: D-52 local comparables by payAt, D-48 rank words, D-47 hide the old chart, D-50 cap at the stated maximum, D-49 CSV kind and ranges
c40b995 fix-qa4: copy QA round 4's desktop tests (beta-desktop-qa-4.e2e.js) and register them
a12990f fix-qa4: the brief verbatim
a0c6695 fix-phone-sizes: M-52 follow-up, at 861-999 px the search box keeps "Search" on a board with a Refresh button (no "/" hint, tighter padding); the top bar sweep checks it
2317a73 fix-phone-sizes: mobile QA 4 before and after (M-49 Microsoft's Apply at 390, M-51 Amazon's meta line at 390, M-52 the Razr in landscape and its filter field with the keyboard up)
61757b9 fix-phone-sizes: the matrix checks the job page's meta line (no "·" at a line's start or end, no word clipped) and the Apply label (one line, the whole name) at every size (M-49, M-51)
8620933 fix-phone-sizes: M-52, touch screens wider than 860 px get 44 px controls and 16 px fields, a focused filter field moves above the keyboard, and the top bar fits from 861 px; matrix tests at 932x430, 1005x412 and 1114x720 and a 861-1001 px sweep
64f9a53 fix-phone-sizes: M-51, the job page's meta line never starts or ends a line with "·" (each item carries its "·"; the one that starts a line is clipped away)
21900d0 fix-phone-sizes: M-49, the job page's Apply label is one line: "Apply on X’s careers site", else "Apply on X’s site", else "Apply" (the host stays under it); the link's name stays the long label
ec2aa4b fix-phone-sizes: M-48, a card's "N places" / "2 levels" line is 12 px (was 11.5), on one line
3ed0d62 fix-phone-sizes: the iPhone 15 Pro Max in landscape (932x430) joins the phone sizes (mobile QA 4, M-52)
da66bde WIP fix-phone-sizes: log, the verification on 780e0ac
9fa0ab2 e2e: relaunch the browser when it dies mid-run; fix-density's one-row legend rule is for phones only (D-51)
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
```

## Left out (not in untracked.tgz)
- node_modules (symlink)
