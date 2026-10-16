# Process log: fix6-fresh-data

## State
- Base 53a03ec (branch head). All 5 checks reproduced red (0/5) on the unchanged head.
- Done and committed:
  - D-23 (product, server/geo.js): 210c34e.
  - BP-10 and BP-14 (test assumptions, test/e2e/fix3-app.e2e.js): fa79727; both pass.
  - fix3-data tag (product, server/keywords.js nearCopyOf): 2cbb977 + cda76cb.
  - T20 (test assumption, test/e2e/ui.e2e.js): df1b6be; passes.
- In progress: rebuild of dist/ with the geo and keyword fixes, to run D-23 and fix3-data e2e.
- Next: the 5 checks together; `MELON_BETA_SNAPSHOT_DIR= npm test` with the data links moved
  aside; the full e2e suite; the norm-11 patch; the log sections 2 to 7.

## 1. Brief
Prompt: [prompts/fix6-fresh-data.md](prompts/fix6-fresh-data.md). Five e2e checks went red on the
2026-10-16 crawl, and each is red on the unchanged head too. For each, decide from the data whether
the product or the test's assumption is wrong, and fix that one without weakening the check.
Files owned: server/keywords.js, server/geo.js, data/cities.json, public/features/comps.js, the
five checks' code in their e2e files, test/fix6-fresh-data.test.js, this log and the prompt.
