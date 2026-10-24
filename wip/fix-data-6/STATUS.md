# WIP checkpoint: fix-data-6

- Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a08f9659d62990db4`
- Base (on claude/stoic-ride-54ddxp): `a0763eceb553a3da77408fd81acf018174302bbc`
- Head: `799a1648f4b0ee614511c8b82724207095c9421a`
- Restore: `bash scripts/cycle/restore-wip.sh fix-data-6 <new worktree dir>`

## Commits since the base
```
799a164 fix-data-6: related e2e after P-2 and T-19: exact headings in fix-pay-at-place, a programme's per-place rates exact, Fix app [P-2] picks what the drawer shows; phone lines one line at every size
30603a6 fix-data-6: CONTRACT and DATA_SOURCES for G-2 and G-3; log with the counts, the red and green runs
1ebab41 fix-data-6: G-2 bare ISO codes that are US state codes are countries; G-3 dotted state abbreviations, Monterrey and Apple Bayshore
3115ae8 fix-data-6: CONTRACT, DATA_SOURCES and the methodology guide for G-1, K-1, P-1 to P-3, R-1 to R-3 and C-1
08512b1 fix-data-6: P-3 full-time hourly pay at its posted rate; C-1 equally similar comparables spread across the estimate's pay
5f9ed0f fix-data-6: log state after the restart
5eb6871 fix-data-6: T-19 the two e2e tests that skipped on every run now run
8afc8a3 fix-data-6: R-1/R-3 operations and data-center families, R-2 lead associates are Mid, K-1 stated bonus targets as posted, P-1 pay places named, P-2 exact posted pay on the job page
f21a0c4 fix-data-6: the freshness inventory regenerated (registry.js --docs --write) for the gazetteer size
c89c769 fix-data-6: log state (P-2 queued)
5887101 fix-data-6: G-1 359 towns near the big-tech hubs at their own place (Bay Area first), K-1 '+ 0% bonus target' is no bonus; norm-14
63139ff fix-data-6: log state (G-1, K-1 in progress; P-1, R-1 queued)
2ac23ef fix-data-6: process log started
5c995f2 fix-data-6: the brief, verbatim
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
 M public/app.js
 M test/e2e/fix-data-6.e2e.js
```

## Left out (not in untracked.tgz)
- node_modules (symlink)
