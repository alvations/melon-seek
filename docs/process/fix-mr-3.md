# Process log: fix-mr-3 (methodology and data engineer, fix wave 5)

## State
- 2026-10-23 13:25 UTC: started. Base: origin/claude/stoic-ride-54ddxp at 05263e8 (detached).
- Done: brief saved (d8818ca); data linked (not committed); first build of the base made (dist/).
- In progress: red tests per ID (test/fix-mr-3.test.js).
- Next: fixes in this order: MR-21/MR-22, MR-26, MR-41, MR-40, MR-38/MR-33, MR-37, MR-29, MR-39; then the e2e file and the docs.

## 1. Brief
- **Prompt:** [prompts/fix-mr-3.md](prompts/fix-mr-3.md), verbatim.
- **Goal:** fix MR-21, MR-22, MR-26, MR-29 (the UI half), MR-33, MR-37, MR-38, MR-39, MR-40 and MR-41
  ([methodology-review-beta-2](methodology-review-beta-2.md), [methodology-review-beta](methodology-review-beta.md)), keeping every
  posting and pay row, with a red test per ID first.
- **Files owned:** server/salary.js and server/normalize.js (fixed-term pay), server/geo.js (gazetteer),
  scripts/build-market.js (fx.source), scripts/refresh/registry.js, the freshness rule for MR-26, in public/app.js the drawer's
  converted-pay and "As posted" lines, the stats line's median basis and the Mid chip's tip, public/features/insights.js (the
  tiles' basis), test/fix-mr-3.test.js, test/e2e/fix-mr-3.e2e.js, this log and the prompt file.

## 2. Inputs and sources

## 3. Decisions and rationale

## 4. Replayable steps

## 5. Verification

## 6. Known gaps and follow-ups

## 7. Change log
- 2026-10-23 13:13: checked out 05263e8, saved the brief, linked the 2026-10-16 crawl, built the base.
