# WIP checkpoint: fix-ui-6

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-add67b9453342f4ba`
- Base (on claude/stoic-ride-54ddxp): `a0763eceb553a3da77408fd81acf018174302bbc`
- Head: `5e2c2522bf7c87d426aa4f61ab0c5b238f5b6480`
- Restore: `bash scripts/cycle/restore-wip.sh fix-ui-6 <new worktree dir>`

## Commits since the base
```
5e2c252 fix-ui-6: D screenshots before and after (375x625, 440x757, 1114x616, 820x1070, Duo stacked)
6d82ea4 WIP fix-ui-6: phase 2: the rows' medians in their pay's currency (fix-app-6's BN-2 rule: PLN for Warsaw, CA$ for Vancouver); its test; UX-40's row form accepts the currencies
bba9bc1 WIP fix-ui-6: phase 2: Map view keeps its 84 px peek where a card would leave the map under 300 px (map.js back as B left it); B-4 keeps to its three screens; D-1 follows the map rule
ae130b7 WIP fix-ui-6: phase 2: the stats line's hidden parts are .sr-only (detectors skip them, a screen reader keeps them); an untouched map refits when its box changes; tests: B-3 skips the docked filters (iPads in landscape), fix-density and UX-57 read the folded chart
cda8823 WIP fix-ui-6: D tests: the Razr cover under its bars (a three-line title past its room, a chart under the sheet), the shortest search placeholder
f4c4c42 WIP fix-ui-6: phase 2 (ux-density-6 D-1 to D-14): size classes, the folded chart (band, median, posted range; one Details), the median once, the tagline on a first visit, the measured peek, the one-row top bar from 640 px; phone-sizes VISIBLE and TABLETS; the D tests
f13ebd6 fix-app-6: log State: done on 94d65d0
6dfbbd4 fix-app-6: log State on 94d65d0
f753bb7 fix-app-6: V-44 on a short map: the short line hangs under the Pay | Juice switch, off the pins (the Razr cover's Menlo Park pin)
d5f2daa fix-app-6: BN-7 the chip is replaced only when the loaded posting names another level, and keeps B-2's spacing (fitMetaLine)
1a58b74 fix-app-6: log State after the rebase onto 94d65d0
b0feb05 fix-app-6: V-44 at the Razr cover (from fix-ui-6): a short map's 'N postings list no place' line is short, the sentence in its title
fce46c7 fix-app-6: log State after the rebase onto e77cd41
ef51747 fix-app-6: on fix-salary-6's rows per country: BN-6 reads a row's own kind where rows carry one; a unit test of BN-1 and BN-2 at each country's row
1558aae fix-app-6: the own-plus-wide count belongs to UI: location filter, not the department test
3818808 fix-app-6: CONTRACT (medianWording, the fits) and log decisions
5d2d515 fix-app-6: one wording function (chart.js medianWording) for the stats line's median and the chart caption
a8df758 fix-app-6: two e2e checks read a place's count as its own plus its country- or state-wide postings (BN-1)
6ab1aa1 fix-app-6: log State and change log
d66a97d fix-app-6: BN-6 the Salary note's line fits one line with a big count; screenshots (shrunk)
69f8ed8 fix-app-6: BN-4 the stats line and the chart caption take short words where a long median would wrap or be cut; BN-8 e2e types in the phone's filter sheet
1adeb58 fix-app-6: BN-7 the main site's Seniority note names no beta company; log gaps
91249d9 fix-app-6: e2e: BN-1 country-wide, BN-5 and BN-6 checks fail on the base build too; log before and after
24ccfc7 fix-app-6: BN-2 the chart caption's median in the plotted pay's currency (a place's own row); log steps
120b18c fix-app-6: log State after the restart
ae010d1 fix-app-6: BN-8 the pay box keeps the typed currency (chip, link, saved name), reads zł and grouped thousands, a bare number takes the view's currency; CONTRACT and guide for BN-1's wide counts and BN-8
5ae6a7c fix-app-6: e2e fixes (empty results, locale counts, Location row counts at every phone size); log decisions
68875fb fix-app-6: BN-1 a town's own count beside its country- or state-wide postings (list and map pins); BN-7 the chip reads the level from the loaded posting
55f86f2 fix-app-6: log State
8eee01d fix-app-6: e2e group (42 tests), BP-10/MR-39/shared-decision tests on the new rules, CONTRACT and methodology guide
3ca131d fix-app-6: BN-1 place counts judged per place, BN-2/BN-4 medians in the pay's currency and per hour, BN-3 count once, BN-5 held values kept, BN-6 minimums under a floor, BN-7 posted levels
cd85e03 fix-app-6: red unit tests for BN-1 to BN-7 (16 of 18 fail on 4ebe24f)
efe9e9e fix-app-6: log with State
93cd8ea fix-app-6: prompt verbatim
94d65d0 fix-salary-6: CONTRACT and log for the Juice follow-up
aec5de1 fix-salary-6 S-1 follow-up: Juice says 'pay-other-country' again when every place with a city record is in a country no row prices (Cohere's London)
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
 M docs/screenshots/fix-pay-at-place/e2e-card-1114x720.png
 M docs/screenshots/fix-pay-at-place/e2e-card-280x653.png
 M docs/screenshots/fix-pay-at-place/e2e-card-352x355.png
 M docs/screenshots/fix-pay-at-place/e2e-card-375x812.png
 M docs/screenshots/fix-pay-at-place/e2e-card-720x1114.png
 M docs/screenshots/fix-salary-6/dublin-card-1280x800.png
 M docs/screenshots/fix-salary-6/dublin-card-352x355.png
 M docs/screenshots/fix-salary-6/dublin-card-375x812.png
 M docs/screenshots/fix-salary-6/dublin-drawer-1280x800.png
 M docs/screenshots/fix-salary-6/dublin-drawer-352x355.png
 M docs/screenshots/fix-salary-6/dublin-drawer-375x812.png
 M docs/screenshots/fix-salary-6/milan-card-1280x800.png
 M docs/screenshots/fix-salary-6/milan-card-352x355.png
 M docs/screenshots/fix-salary-6/milan-card-375x812.png
 M docs/screenshots/fix-salary-6/milan-drawer-1280x800.png
 M docs/screenshots/fix-salary-6/milan-drawer-352x355.png
 M docs/screenshots/fix-salary-6/milan-drawer-375x812.png
 M docs/screenshots/fix-salary-6/paris-card-1280x800.png
 M docs/screenshots/fix-salary-6/paris-card-352x355.png
 M docs/screenshots/fix-salary-6/paris-card-375x812.png
 M docs/screenshots/fix-salary-6/paris-drawer-1280x800.png
 M docs/screenshots/fix-salary-6/paris-drawer-352x355.png
 M docs/screenshots/fix-salary-6/paris-drawer-375x812.png
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
