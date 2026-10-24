# WIP checkpoint: fix-ui-6

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-add67b9453342f4ba`
- Base (on claude/stoic-ride-54ddxp): `a0763eceb553a3da77408fd81acf018174302bbc`
- Head: `18dcea446c6db5bcc69229436cb6ead29cc7c87c`
- Restore: `bash scripts/cycle/restore-wip.sh fix-ui-6 <new worktree dir>`

## Commits since the base
```
18dcea4 fix-ui-6: log: steps, gaps, change log
5cec245 fix-ui-6: screenshots before and after (shrunk), the log's verification
f7d64aa fix-ui-6: B-12 the peek is measured to the first card's pay; B-7 one pan to the nearest clear offset, the map fits short boxes over 860 px
2a79b65 fix-ui-6: fix-qa4's UX-50 source test reads cardMetaItems (B-1)
9190774 WIP fix-ui-6: tests: B-4 thresholds, B-9 seeds by seen ids, the iPhone mini as Safari leaves it (375x625)
6d56984 WIP fix-ui-6: the map keeps its peek; the Duo's left screen drops the wordmark; CONTRACT; log decisions
011a10b WIP fix-ui-6: B-9 to B-12 (cover menu and toast, few roles, arrival line, a card on the first screen) and their tests
c3efea4 WIP fix-ui-6: B-4 (slide first, panel catch-up after the first frame; root vars written on change), B-8 (the Duo's two screens without viewport segments)
49dd8b8 WIP fix-ui-6: B-1 to B-7 first fixes, the e2e group, the log
e4cf9d1 fix-ui-6: prompt, verbatim
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
