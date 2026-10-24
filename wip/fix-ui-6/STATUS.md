# WIP checkpoint: fix-ui-6

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-add67b9453342f4ba`
- Base (on claude/stoic-ride-54ddxp): `a0763eceb553a3da77408fd81acf018174302bbc`
- Head: `a8ebe21618972da05cb76361b8ac70d735260d3d`
- Restore: `bash scripts/cycle/restore-wip.sh fix-ui-6 <new worktree dir>`

## Commits since the base
```
a8ebe21 WIP fix-ui-6: D tests: the Razr cover under its bars (a three-line title past its room, a chart under the sheet), the shortest search placeholder
94b1bf2 WIP fix-ui-6: phase 2 (ux-density-6 D-1 to D-14): size classes, the folded chart (band, median, posted range; one Details), the median once, the tagline on a first visit, the measured peek, the one-row top bar from 640 px; phone-sizes VISIBLE and TABLETS; the D tests
942db8a fix-juice-6: log, the related groups and State
4de206c fix-juice-6: log, verification so far and State
38e122e fix-juice-6: after screenshots (Toronto, Milan, London, Munich, New York at 280, 375, 352 and 1280; J-5 cards), shrunk
4557c35 WIP fix-juice-6: State at the pause
6d17705 WIP fix-juice-6: narrow forms for 280 px, two test fixes, BP-2 accepts any pay place first, before screenshots
4898712 fix-juice-6: log, State and decisions
f02ad51 fix-juice-6: J-1 to J-5 in the Juice drawer, the card badge and the chart's tips
92314bb fix-juice-6: red tests for J-1 to J-5, and the words module they read
e1e65b2 fix-juice-6: log with State
83279cc fix-juice-6: prompt verbatim
b68f237 fix-ui-6: log: the rebase, the related groups, the three follow-ups, B-12's timing
5fa1956 fix-ui-6: CONTRACT: the measured peek, the saved search with new roles, the 12-word arrival line
7dcda9d fix-ui-6: B-9 keeps a saved search with new roles in view (M-28's five plain ones leave the company centred); B-11's line at 12 words; the chart scrolls rows into view under its axis (A-8 at 280 px)
21eab33 fix-ui-6: log: steps, gaps, change log
51a0ed9 fix-ui-6: screenshots before and after (shrunk), the log's verification
edebed5 fix-ui-6: B-12 the peek is measured to the first card's pay; B-7 one pan to the nearest clear offset, the map fits short boxes over 860 px
98b946f fix-ui-6: fix-qa4's UX-50 source test reads cardMetaItems (B-1)
334e60c WIP fix-ui-6: tests: B-4 thresholds, B-9 seeds by seen ids, the iPhone mini as Safari leaves it (375x625)
40d71b4 WIP fix-ui-6: the map keeps its peek; the Duo's left screen drops the wordmark; CONTRACT; log decisions
fcffc77 WIP fix-ui-6: B-9 to B-12 (cover menu and toast, few roles, arrival line, a card on the first screen) and their tests
52610d3 WIP fix-ui-6: B-4 (slide first, panel catch-up after the first frame; root vars written on change), B-8 (the Duo's two screens without viewport segments)
07f3b45 WIP fix-ui-6: B-1 to B-7 first fixes, the e2e group, the log
abccc16 fix-ui-6: prompt, verbatim
f2f6d84 fix-salary-6: log State (sent 49e86ee)
e77cd41 fix-salary-6: CONTRACT names the drawer rank's country rule
98de6b2 fix-salary-6: log (e2e before/after, rank decision, payload)
987b528 fix-salary-6: screenshots before (e800c43's build) and after, card and drawer, Milan, Paris and Dublin at 375x812, 352x355 and 1280x800 (shrunk)
91fb9a0 fix-salary-6 S-1: the drawer's rank and strip rank a place's own line among its country's roles; e2e collects every problem and checks the rank line
70d9214 fix-salary-6: e2e Spain case reads the card's rounding
8b3b9f2 fix-salary-6: log (decisions, census, nothing-dropped proof, backtest)
d5b4d9a fix-salary-6: DATA_SOURCES §7a and CONTRACT for S-1; the CSV README names place levels and unlisted lines
e4de986 fix-salary-6 S-1: Amazon's stored rows are left to upgradeAmazonJobs (no label tie); a guard test
dc7dc71 fix-salary-6 S-1: degree headers over bulleted country lines; e2e checks registered
ed32bf1 fix-salary-6: norm-14; golden re-baselined (0 of 300 hashes changed) and refresh fixtures regenerated with their tooling
241339a fix-salary-6 S-1: every country line kept as a row with its places; unlisted lines; kr by line country; main-site rows tied (WIP, before golden)
8bb8b73 fix-salary-6: log with State and the census before
8c32da5 fix-salary-6: prompt verbatim
```

## Uncommitted and new files
```
 M docs/screenshots/fix-ui-6/after-B-1-cards-level-apple.png
 M docs/screenshots/fix-ui-6/after-B-1-cards-location-amazon.png
 M docs/screenshots/fix-ui-6/after-B-2-meta-desktop-1440x900.png
 M docs/screenshots/fix-ui-6/after-B-2-meta-galaxy-fold-folded-280x653.png
 M docs/screenshots/fix-ui-6/after-B-2-meta-iphone-13-14-390x844.png
 M public/app.js
 M public/styles.css
 M test/e2e/fix-density.e2e.js
 M test/e2e/fix-phone-controls.e2e.js
?? docs/screenshots/fix-ui-6/after-B-3-keyboard-ipad-pro-12-9-ipad-air-13-landscape-1366x914.png
```

## Left out (not in untracked.tgz)
- docs/screenshots/fix-ui-6/after-B-3-keyboard-ipad-pro-12-9-ipad-air-13-landscape-1366x914.png (screenshot; the lane's tests regenerate it)
- node_modules (symlink)
