# WIP checkpoint: fix-viz-5

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a500839343c7a8ea9`
- Base (on claude/stoic-ride-54ddxp): `228aed732384c0c6e1b94b673bd6d56c31ec9beb`
- Head: `09d9bdeaaff8e180d6e32431d47c2a3c58f64043`
- Restore: `bash scripts/cycle/restore-wip.sh fix-viz-5 <new worktree dir>`

## Commits since the base
```
09d9bde fix-viz-5: UX-45 the map's Juice legend starts each grade where the list and the drawer do; patches for UX-36 (index.html) and one notBasePay for build-market
db0dc60 WIP fix-viz-5: the measurement script, V-45 test on the pins themselves, map words
7952304 WIP fix-viz-5: e2e checks per finding, viz-lane allow-list entries removed, landscape median caption
2a94318 WIP fix-viz-5: V-47 chart update keeps its work across a view or Group switch (same drawing); map pins clear of controls
90ee349 WIP fix-viz-5: settled circle plan and area sizes (V-33, V-34), bar weight and titles (V-38, UX-41), pay as posted (V-41, V-48, MR-28, D-43), axis and words (V-42, V-46, UX-40/42/43/59/61, A-8, D-44), map (V-43 to V-45, Razr)
29e245b WIP fix-viz-5: log skeleton with State
7cad5b3 fix-viz-5: prompt verbatim
164874a Lead log: fix wave 5 integrated (sec-3, data-3, phone sizes and text, pay at a place); integration fixes; the gate's browser crash and re-run
b815f2b Integration fixes for fix wave 5: a merge's stray '=======' in styles.css (dropped UX-58's rule), one Pay by place row per place set (D-39), tests read the pill's sub line, data-3's department names and MR-28 footnote
fbdad58 Integration: fix-data-3's patches (postedPlaces per tied row, the Compare footnote names MR-28's left-out pay, M-40's precondition) and the pay lane's Juice test on
83512bc fix-pay-at-place: log the final gate (full e2e 389/394, T21 under load passes alone); the Juice patch is a reference (fix-data-3 0ae184e)
7833e88 fix-pay-at-place: before/after screenshots (shrunk, 1.2 MB)
b47863a fix-pay-at-place: log timings and e2e results
fb92454 fix-pay-at-place: cheaper per-place pricing (no copies for one-range postings, a covered list instead of a Map), bounded phone-check steps
4bf0b2a fix-pay-at-place: the drawer names the headline row by its own label (Remote (CA)); payHere needs US-dollar pay; the phone check runs per size
0657402 fix-pay-at-place: log, prompt, CONTRACT note on payAt, DATA_SOURCES §7a, the Juice patch (server/juice.js) and its to-do test
a5b3672 fix-pay-at-place: V-40 Compstimate uses the comparables that post a range for the city asked (5 or more); e2e file (10 checks, all red on ff6a3d0)
bdc045f fix-pay-at-place: UX-52 place count as a muted line under the pill; drawer heading = the card's range; no label cut (WIP)
9e987f0 WIP fix-pay-at-place: chart notes count pay posted for other places only; comments name payAt
a2a86cf fix-pay-at-place: price every place at its posted pay (payAt) in the chart, map, stats line, Compstimate, Insights and drawer (WIP)
2a86425 fix-pay-at-place: payAt(job, place) helper in features/shared.js (WIP, no callers yet)
1dd9bc8 fix-phone-text: log (state, verification before and after, gaps); the gate is clean
d43dcea fix-phone-text: before and after screenshots (phone and desktop, light and dark), shrunk
bbaae7d WIP fix-phone-text: fitLine touches only lines that don't fit; shorter always-open line; compare tests read the note's Details
30f6069 WIP fix-phone-text: the basis line is the Pay estimate's explainer; badge line spacing; a popover test reads its Details
a5db674 WIP fix-phone-text: fitLine shared in viz/note.js; the comps line, the estimate's basis and accuracy keep their full words where they fit
ef4d46e WIP fix-phone-text: the tagline fits its box at every width (fitTagline); desktop guard at 1024, 1280, 1440; empty-state Details described
7bd9ff2 WIP fix-phone-text: log, WebKit step, narrow-screen rule, viz-lane allow-list, tagline and search hint under 360 px
6a7de9e WIP fix-phone-text: drawer lines, badge popover, Insights tiles and rows, stats line, search placeholder; guard on every phone size
0adf8ba WIP fix-phone-text: one-line captions (Same role elsewhere, Pay estimate, Juice explainer, filter notes, More), Details described (A-9)
25ca8cb WIP fix-phone-text: prompt, red tests (one per ID) and the density guard
5902b17 WIP fix-phone-sizes: State after the container restart
28a18a8 fix-phone-sizes: the Razr cover screen's map before and after; log for the lead's two Razr findings
2c378b8 fix-phone-sizes: the Razr cover screen's map shows its pins (no empty toolbar band, no zoom buttons, the Pay | Juice switch only); the matrix checks the sheet's peek row, the screen's own size, a zoomed or panned page and covered pins
becb20b fix-phone-sizes: final npm test and suite-runner numbers in the log
5f0bc7f fix-phone-sizes: log with the e2e results and State
d2bb4b3 fix-phone-sizes: before and after screenshots for every size in the matrix (shrunk), verification table
debebf5 WIP fix-phone-sizes: one name-sweep test per board; dual-screen rules only from 861 px
79a7c1a WIP fix-phone-sizes: the matrix measures the placeholder in the field's font; log decisions
68fe621 WIP fix-phone-sizes: landscape means landscape, short screens, the name whole at every width, the 280 px toolbar and tagline, cards and Apply fit, map scale, dual screens
b077559 WIP fix-phone-sizes: phone matrix guard (every size in phone-sizes.mjs, 3 boards), prompt and log
93193d0 fix-data-3: log with the gate results; M-40 test patch for the renamed Amazon departments
3983071 WIP fix-data-3: log verification numbers; MR-28 counts
47c316d WIP fix-data-3: e2e title wording
2fea155 fix-data-3: old links resolve on a hash change too; shift-pay Juice line fits 280 px; registry and fixtures for norm-12
d8c317b WIP fix-data-3: departments renamed at read time without a per-job field; e2e tests; docs
c8bde7c fix-data-3: places (D-41, D-42, V-45, Town and Country, old location links) and department names (UX-32); norm-12
84cf5de fix-data-3: no Juice at a place the posting gives no pay row of its own (lead decision 2026-10-16)
fb37fe9 fix-data-3: MR-28 minimums, shift-inclusive and part-time hourly figures leave the base-pay cells; one Juice line
ca1e008 fix-data-3: D-38 a Fellow rank is Staff+ and its posted pay is shown; Data Residency is not a residency
6f6add6 WIP fix-data-3: prompt and log skeleton
f8f296b fix-sec-3: log: gate results (npm test, full e2e versus an f53a270 baseline)
c7f2d49 fix-sec-3: REVIEW.md: S-2, S-4, S-9 and V12/V14 residuals and S-10 marked fixed, with commits
e394553 fix-sec-3: process log (State, decisions, replay steps)
edcdd10 fix-sec-3: S-9 residual: the refresh commits FX values only in code files, and never test code
3ef8b33 fix-sec-3: V12 residual: read-only checkouts keep no token; idb pinned in the iOS Simulator job
204cdcd fix-sec-3: V14 residual: a custom board never shows a built-in company's name
4e8fb5b fix-sec-3: S-10: bounded Meta, job-family and DOL parsers (linear on hostile text, same output on real data)
e81f138 fix-sec-3: S-4 residual: Amazon links on-host, beta links only on their company's hosts, no dead Apply button
bc95d97 fix-sec-3: S-2 residual: one pause guard for every crawl (fetchLive, snapshot.js one(), probe full mode)
```

## Uncommitted and new files
```
?? docs/screenshots/fix-viz-5/
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-viz-5/after-clusters-amazon-d1440-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-clusters-amazon-d1440-deuteranopia.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-clusters-amazon-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-clusters-amazon-p280.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-clusters-amazon-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-clusters-amazon-p390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-clusters-anduril-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-clusters-google-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-clusters-google-landscape-812.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-location-google-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-location-google-p390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-map-amazon-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-map-amazon-p280.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-map-amazon-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-map-amazon-razr-cover.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-map-apple-razr-cover.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-map-meta-d1440-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-map-meta-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-amazon-d1440-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-amazon-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-amazon-min-d1440-deuteranopia.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-amazon-min-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-amazon-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-amazon-p390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-amazon-p540.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-amazon-shift-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-google-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-microsoft-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-netflix-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-nvidia-ote-d1440-protanopia.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/after-ranges-nvidia-ote-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-clusters-amazon-d1440-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-clusters-amazon-d1440-deuteranopia.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-clusters-amazon-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-clusters-amazon-p280.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-clusters-amazon-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-clusters-amazon-p390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-clusters-anduril-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-clusters-google-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-clusters-google-landscape-812.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-location-google-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-location-google-p390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-map-amazon-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-map-amazon-p280.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-map-amazon-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-map-amazon-razr-cover.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-map-apple-razr-cover.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-map-meta-d1440-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-map-meta-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-amazon-d1440-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-amazon-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-amazon-min-d1440-deuteranopia.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-amazon-min-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-amazon-p390-dark.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-amazon-p390.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-amazon-p540.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-amazon-shift-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-google-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-microsoft-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-netflix-d1440.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-nvidia-ote-d1440-protanopia.png (screenshot; the lane's tests regenerate it)
- docs/screenshots/fix-viz-5/before-ranges-nvidia-ote-d1440.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)
