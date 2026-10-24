# Process log: fix-data-6 (data and test engineer, fix wave 6)

## State
- 2026-10-24 00:35 UTC (after the container restart at 00:23; nothing lost): base 00bd52c, detached.
- **Committed:** cb71da7 G-1 + K-1 + norm-14; fa52f61 freshness inventory; 5440eba R-1/R-3 (site-ops family, data-center
  department rules), R-2 (lead associates Mid), K-1 bonusTarget, P-1 (payPlaceText names salary.places), P-2 (exact posted
  yearly pay in the drawer), e2e file test/e2e/fix-data-6.e2e.js (registered); 5e29ff4 T-19 (Fix app [P-2], Desktop QA [D-11]).
- **Verified:** npm test CI-like at 5440eba: 1,324 tests, 1,314 pass, 0 fail, 10 skipped. Unit file 16/16 (G-1/K-1 red on
  00bd52c, the R/K-1 sibling tests red on cb71da7). dist/ is the build of 5440eba.
- **Next:** run the fix-data-6 e2e group on dist/ and on scratchpad/fd6/dist-base (red), then T-19 groups with
  `--max-skips`; P-3 (the card's full-time hourly pill), C-1 (comparables' tie rule); docs (DATA_SOURCES, CONTRACT,
  METHODOLOGY_GUIDE); send to the lead.
- Shares norm-14 with fix-salary-6 (the lead re-baselines after integrating both).
- Scratch: `scratchpad/fd6/` (tools/, dist-base/ = 00bd52c build, clean/ = the CI-like checkout).

## 1. Brief
- **Prompt:** [prompts/fix-data-6.md](prompts/fix-data-6.md), verbatim.

## 7. Change log
- 2026-10-23 21:12: checked out 00bd52c, saved the brief, linked the crawl, built the base.
