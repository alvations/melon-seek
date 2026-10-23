# Process log: fix-data-6 (data and test engineer, fix wave 6)

## State
- 2026-10-23 21:45 UTC: base 00bd52c, detached. Brief 4d675bb.
- **Committed:** cb71da7 G-1 + K-1 + norm-14 (golden 2 of 300, both G-1 towns; refresh fixtures regenerated). Unit tests
  test/fix-data-6.test.js: 5 of 7 red on the base, 7/7 after.
- **In progress:** the build of cb71da7 (dist/), then before/after counts, the G-1/K-1 e2e, docs, CI-like npm test, send.
- **Queue (from the lead):** P-1 (payPlaceText names salary.places), P-2 (the drawer shows the posted yearly figure
  exactly), R-1 (roles.js: warehouse and store associates are not customer support), then T-19 (Fix app [P-2], Desktop QA
  [D-11]) and C-1.
- Scratch: `scratchpad/fd6/` (tools/, dist-base/, clean/ = the CI-like checkout).

## 1. Brief
- **Prompt:** [prompts/fix-data-6.md](prompts/fix-data-6.md), verbatim.

## 7. Change log
- 2026-10-23 21:12: checked out 00bd52c, saved the brief, linked the crawl, built the base.
