# WIP checkpoint: fix-mr-3

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a2e3d85e328fdbc3e`
- Base (on claude/stoic-ride-54ddxp): `0e6f21abb1304c3b871382a9d59179a27a1ca9e8`
- Head: `134ae044fa254e386d08cb0a3dcc3d0ddd67dc58`
- Restore: `bash scripts/cycle/restore-wip.sh fix-mr-3 <new worktree dir>`

## Commits since the base
```
134ae04 fix-mr-3: MR-39 e2e counts base pay as the integrated build does (MR-28's notBasePay out), and the numbers on it ($149K → $152K US)
b119cd9 fix-mr-3: MR-39 the chart caption's median on the same basis ("Median base pay $149K US"), applied in chart.js (was the patch for fix-viz-5)
332f9c8 fix-mr-3: log State: done, sent to the lead; next: rebase when told
ae6ba37 fix-mr-3: MR-39 the stats line says its median's country short ("base pay median (US)"), within fix-density's 12 words when filtered
c6c329f fix-mr-3: the BP-13 e2e takes the stats line's median on the MR-39 rule (the main currency's, with pay in several)
36530fb fix-mr-3: log: T-17, npm test, before/after e2e, phone lines
be1810e fix-mr-3: T-17 job titles on one line (line breaks and runs of whitespace are one space), in the norm-13 bump
0d846e5 fix-mr-3: the Juice headline's "while it lasts" moves to the text below when it would wrap (one line from 344 px up)
ca88310 fix-mr-3: review logs mark MR-21, MR-22, MR-26, MR-29, MR-33, MR-37, MR-38, MR-39, MR-40, MR-41 fixed; process log
951968d fix-mr-3: e2e on the built site (every ID, and every phone size), docs, and the chart caption patch for fix-viz-5
4197588 fix-mr-3: refresh fixtures regenerated at norm-13 (make-fixtures.mjs)
65b17fa fix-mr-3: MR-38/MR-33 fixed-term pay of unstated length, MR-37 stated annual figure, MR-29 departments note, MR-39 headline median basis
6e0e296 fix-mr-3: MR-40 43 NYC-area towns in the gazetteer, so the NYC pay area sees them; norm-13
9fd9158 fix-mr-3: MR-41 the Mid chip's tip gives each board's own example of a mid level
0412b39 fix-mr-3: MR-26 build-day data is never "update due"
d5456a5 fix-mr-3: MR-21 registry.js usage lists --docs; MR-22 market.json fx.source is FX_SOURCE
d6afaba fix-mr-3: red tests for MR-21, MR-22, MR-26, MR-29, MR-33, MR-37, MR-38, MR-39, MR-40, MR-41
cc0ebd9 fix-mr-3: log skeleton with State
75a6976 fix-mr-3: brief, verbatim
e168ac7 fix-qa4: log State after UX-51, MR-35 and UX-50 (gated, sent to the lead)
594845f fix-qa4: UX-51 and UX-50 screenshots before and after (shrunk); the phone shot opens the sheet first; log the e2e results
743ae59 WIP fix-qa4: log the UX-51, MR-35 and UX-50 numbers and State
fc32216 fix-qa4: salary-audit's lifted card helpers include UX-51's shift pay (payPill asks shiftRange of every posting)
1edb804 fix-qa4: MR-35 marked fixed (6185ba3) in the methodology review; log
82d24da fix-qa4: UX-51 shift pay labelled on the card, its tip, the drawer heading and the CSV; MR-35 the base keeps its cents; UX-50 the company beside its dot
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
 M docs/screenshots/dark-drawer.png
 M docs/screenshots/dark.png
 M docs/screenshots/drawer-juice.png
 M docs/screenshots/drawer.png
 M docs/screenshots/fix-pay-at-place/e2e-card-1114x720.png
 M docs/screenshots/fix-pay-at-place/e2e-card-280x653.png
 M docs/screenshots/fix-pay-at-place/e2e-card-352x355.png
 M docs/screenshots/fix-pay-at-place/e2e-card-375x812.png
 M public/viz/chart.js
?? docs/screenshots/fix-pay-at-place/e2e-card-720x1114.png
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-pay-at-place/e2e-card-720x1114.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)
