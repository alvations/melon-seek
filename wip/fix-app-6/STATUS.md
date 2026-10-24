# WIP checkpoint: fix-app-6

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-af65001c61c5e8b4f`
- Base (on claude/stoic-ride-54ddxp): `a0763eceb553a3da77408fd81acf018174302bbc`
- Head: `55a53be0ee538475c218b30b1eb50f17810f94ea`
- Restore: `bash scripts/cycle/restore-wip.sh fix-app-6 <new worktree dir>`

## Commits since the base
```
55a53be fix-app-6: log State after the rebase onto e77cd41
d928b03 fix-app-6: on fix-salary-6's rows per country: BN-6 reads a row's own kind where rows carry one; a unit test of BN-1 and BN-2 at each country's row
a15d861 fix-app-6: the own-plus-wide count belongs to UI: location filter, not the department test
c6a531a fix-app-6: CONTRACT (medianWording, the fits) and log decisions
bd23782 fix-app-6: one wording function (chart.js medianWording) for the stats line's median and the chart caption
25cbc82 fix-app-6: two e2e checks read a place's count as its own plus its country- or state-wide postings (BN-1)
4cd1832 fix-app-6: log State and change log
adc6232 fix-app-6: BN-6 the Salary note's line fits one line with a big count; screenshots (shrunk)
d47a8ed fix-app-6: BN-4 the stats line and the chart caption take short words where a long median would wrap or be cut; BN-8 e2e types in the phone's filter sheet
e95825e fix-app-6: BN-7 the main site's Seniority note names no beta company; log gaps
0d8e786 fix-app-6: e2e: BN-1 country-wide, BN-5 and BN-6 checks fail on the base build too; log before and after
ade2685 fix-app-6: BN-2 the chart caption's median in the plotted pay's currency (a place's own row); log steps
9cf3ee3 fix-app-6: log State after the restart
60e5f2f fix-app-6: BN-8 the pay box keeps the typed currency (chip, link, saved name), reads zł and grouped thousands, a bare number takes the view's currency; CONTRACT and guide for BN-1's wide counts and BN-8
f036072 fix-app-6: e2e fixes (empty results, locale counts, Location row counts at every phone size); log decisions
880261e fix-app-6: BN-1 a town's own count beside its country- or state-wide postings (list and map pins); BN-7 the chip reads the level from the loaded posting
08fda0e fix-app-6: log State
a8435e2 fix-app-6: e2e group (42 tests), BP-10/MR-39/shared-decision tests on the new rules, CONTRACT and methodology guide
e7445f6 fix-app-6: BN-1 place counts judged per place, BN-2/BN-4 medians in the pay's currency and per hour, BN-3 count once, BN-5 held values kept, BN-6 minimums under a floor, BN-7 posted levels
35813d9 fix-app-6: red unit tests for BN-1 to BN-7 (16 of 18 fail on 4ebe24f)
b467bcc fix-app-6: log with State
fe41e38 fix-app-6: prompt verbatim
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
 M docs/screenshots/qa-mobile-beta/e2e-M-24-keyboard-location-search.png
```

## Left out (not in untracked.tgz)
- node_modules (symlink)
