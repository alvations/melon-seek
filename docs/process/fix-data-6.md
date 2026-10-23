# Process log: fix-data-6 (data and test engineer, fix wave 6)

## State
- 2026-10-23 22:00 UTC: base 00bd52c, detached. Brief 4d675bb, log 93dfb08. Base build in `scratchpad/fd6/dist-base` (7/7 beta).
- **Done, not committed yet:** G-1 code (server/geo.js: 359 "?" entries, the region-less "?" rule, finalCountry ignores "?"
  entries; geodiff: 359 results, 2,206 postings, latitude and longitude only), K-1 code (server/keywords.js ZERO_BONUS_RE,
  zeroBonusOnly; normalize.js relabelJobs), norm-14, the registry's gazetteer size (743).
- **Next:** unit tests (red on base), golden re-baseline (UPDATE_GOLDEN=1), refresh fixtures, commit; build; before/after counts;
  e2e; docs; send G-1 + K-1.
- **Queue (from the lead):** P-1 (payPlaceText names salary.places), R-1 (roles.js: warehouse and store associates are not
  customer support), then T-19 (P-2, D-11) and C-1.

## 1. Brief
- **Prompt:** [prompts/fix-data-6.md](prompts/fix-data-6.md), verbatim.

## 7. Change log
- 2026-10-23 21:12: checked out 00bd52c, saved the brief, linked the crawl, built the base.
