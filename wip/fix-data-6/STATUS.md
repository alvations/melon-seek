# WIP checkpoint: fix-data-6

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a08f9659d62990db4`
- Base (on claude/stoic-ride-54ddxp): `a0763eceb553a3da77408fd81acf018174302bbc`
- Head: `6c0f2f1092473d5ca76b88a31d5e7f56ddcd9b26`
- Restore: `bash scripts/cycle/restore-wip.sh fix-data-6 <new worktree dir>`

## Commits since the base
```
6c0f2f1 fix-data-6: fix-salary-6's e2e reads the job page's exact posted figures (P-2: €124,000–127,000; the card keeps €124K–127K)
e4f85cc fix-data-6: log state after the rebase onto e77cd41 and the restart
d68bb81 fix-data-6: on top of fix-salary-6, one line at 280 and 320 px: the hourly heading ($27.98–48.99/hour, then whole dollars), the yearly line (hours in Details), P-1's line (shorter forms); fix-salary-6's harness stubs isFullTimeHourly
57d6b83 fix-data-6: related e2e after P-2 and T-19: exact headings in fix-pay-at-place, a programme's per-place rates exact, Fix app [P-2] picks what the drawer shows; phone lines one line at every size
3a7886b fix-data-6: CONTRACT and DATA_SOURCES for G-2 and G-3; log with the counts, the red and green runs
99553f1 fix-data-6: G-2 bare ISO codes that are US state codes are countries; G-3 dotted state abbreviations, Monterrey and Apple Bayshore
a9fed1d fix-data-6: CONTRACT, DATA_SOURCES and the methodology guide for G-1, K-1, P-1 to P-3, R-1 to R-3 and C-1
3875840 fix-data-6: P-3 full-time hourly pay at its posted rate; C-1 equally similar comparables spread across the estimate's pay
771fd0d fix-data-6: log state after the restart
d2125a1 fix-data-6: T-19 the two e2e tests that skipped on every run now run
9885303 fix-data-6: R-1/R-3 operations and data-center families, R-2 lead associates are Mid, K-1 stated bonus targets as posted, P-1 pay places named, P-2 exact posted pay on the job page
698c1e2 fix-data-6: the freshness inventory regenerated (registry.js --docs --write) for the gazetteer size
8164b08 fix-data-6: log state (P-2 queued)
afb92b0 fix-data-6: G-1 359 towns near the big-tech hubs at their own place (Bay Area first), K-1 '+ 0% bonus target' is no bonus; norm-14
45137cb fix-data-6: log state (G-1, K-1 in progress; P-1, R-1 queued)
6947cb6 fix-data-6: process log started
b9aec1e fix-data-6: the brief, verbatim
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
```

## Left out (not in untracked.tgz)
- node_modules (symlink)
