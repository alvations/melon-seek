# WIP checkpoint: qa-ci-6

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a6d5736b954b39411`
- Base (on claude/stoic-ride-54ddxp): `a0763eceb553a3da77408fd81acf018174302bbc`
- Head: `1dde1eb0d26f3657de2b18ebc3885a11873a43c4`
- Restore: `bash scripts/cycle/restore-wip.sh qa-ci-6 <new worktree dir>`

## Commits since the base
```
1dde1eb qa-ci-6: log: verification on f13ebd6, State done, change log
a5bdbc9 qa-ci-6: on f13ebd6: D-41 counts a place's state-wide roles (BN-1); V-43 reads pins in any currency (fix-salary-6's rows per country)
b9baf8d qa-ci-6: log verification table and known gaps
e3b9c56 qa-ci-6: D-50 and MR-34 name the case they picked in the run's notes; log decisions and steps
2c3621d WIP qa-ci-6: Badge swap picks its cluster and card by property; CI pins Playwright 1.56.1 (Chromium 141, the local gate's)
9dcca8d qa-ci-6: log: data sets, the classification table so far, State (paused)
5409367 WIP qa-ci-6: case selection by property for the 10-23 data, offline server in e2e, shard verdicts (not yet run)
f13df91 qa-ci-6: log skeleton with State
9be19e5 qa-ci-6: brief verbatim
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
```

## Left out (not in untracked.tgz)
- node_modules (symlink)
