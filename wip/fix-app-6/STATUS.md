# WIP checkpoint: fix-app-6

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-af65001c61c5e8b4f`
- Base (on claude/stoic-ride-54ddxp): `db38a3042a057155ac8f7ef45a65d54552046662`
- Head: `08d9e9e4e4bf4f9264a8ea61ddf02704029bad33`
- Restore: `bash scripts/cycle/restore-wip.sh fix-app-6 <new worktree dir>`

## Commits since the base
```
08d9e9e fix-app-6: CONTRACT (medianWording, the fits) and log decisions
33bdc74 fix-app-6: one wording function (chart.js medianWording) for the stats line's median and the chart caption
e856d8d fix-app-6: two e2e checks read a place's count as its own plus its country- or state-wide postings (BN-1)
559e6e5 fix-app-6: log State and change log
41ffc42 fix-app-6: BN-6 the Salary note's line fits one line with a big count; screenshots (shrunk)
7ee0894 fix-app-6: BN-4 the stats line and the chart caption take short words where a long median would wrap or be cut; BN-8 e2e types in the phone's filter sheet
0c06bb2 fix-app-6: BN-7 the main site's Seniority note names no beta company; log gaps
ed53ac0 fix-app-6: e2e: BN-1 country-wide, BN-5 and BN-6 checks fail on the base build too; log before and after
21e80e1 fix-app-6: BN-2 the chart caption's median in the plotted pay's currency (a place's own row); log steps
f4c1a72 fix-app-6: log State after the restart
5ceb621 fix-app-6: BN-8 the pay box keeps the typed currency (chip, link, saved name), reads zł and grouped thousands, a bare number takes the view's currency; CONTRACT and guide for BN-1's wide counts and BN-8
4a0265d fix-app-6: e2e fixes (empty results, locale counts, Location row counts at every phone size); log decisions
80a676b fix-app-6: BN-1 a town's own count beside its country- or state-wide postings (list and map pins); BN-7 the chip reads the level from the loaded posting
d9d050e fix-app-6: log State
30fc159 fix-app-6: e2e group (42 tests), BP-10/MR-39/shared-decision tests on the new rules, CONTRACT and methodology guide
27bb06c fix-app-6: BN-1 place counts judged per place, BN-2/BN-4 medians in the pay's currency and per hour, BN-3 count once, BN-5 held values kept, BN-6 minimums under a floor, BN-7 posted levels
9de575d fix-app-6: red unit tests for BN-1 to BN-7 (16 of 18 fail on 4ebe24f)
4ebe24f fix-app-6: log with State
7ea8be8 fix-app-6: prompt verbatim
```

## Uncommitted and new files
```
 M docs/screenshots/fix-pay-at-place/e2e-card-1114x720.png
 M docs/screenshots/fix-pay-at-place/e2e-card-280x653.png
 M docs/screenshots/fix-pay-at-place/e2e-card-352x355.png
 M docs/screenshots/fix-pay-at-place/e2e-card-375x812.png
 M docs/screenshots/qa-mobile-beta/e2e-M-24-keyboard-location-search.png
```

## Left out (not in untracked.tgz)
- node_modules (symlink)
