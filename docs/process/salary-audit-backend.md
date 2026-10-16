# Process log: salary-audit-backend

## State
- **Done (committed, WIP):** SB-1, SB-3, SB-4, SB-5 code and tests (`test/salary-pipeline.test.js`), norm-11.
- **In progress:** the existing tests that norm-11 or the fixes move (golden hashes, the two "delivery: relocateJobs"
  tests, the jobs drift test); then SA-4 (degree lines) and SA-7 (trimmed pay) from salary-audit-data.
- **Next step:** run `node --test test/golden-normalize.test.js test/fix-pay-data.test.js test/fix-beta-pay.test.js
  test/refresh-jobs.test.js` and fix or re-baseline each failure. Then build "after" with
  `node scripts/build-static.js --out <scratch>/sab/dist-after` and run `<scratch>/sab/trace.mjs`.
- **Baseline for before/after:** `<scratch>/sab/base` (git archive of 2474fc4, 2026-10-16 data links) built to
  `<scratch>/sab/dist-before`.

## 1. Brief
- **Prompt:** [prompts/salary-audit-backend.md](prompts/salary-audit-backend.md) (verbatim).
- **Goal:** trace every beta salary from the source adapter to the pixel, find every place where the range a user
  sees can differ from the posted one, and fix the backend code. The data engineer (salary-audit-data) owns the
  statistical audit and the live comparison.
- **Owned:** server/normalize.js, server/salary.js, server/vet.js, server/sources/*.js (not google.js),
  salary-carrying fields of scripts/snapshot.js and scripts/build-static.js, test/salary-pipeline.test.js, this
  log, docs/screenshots/salary-audit-backend/.

(Sections 2 to 7 are written when the lane ends.)
