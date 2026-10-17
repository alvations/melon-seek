# Process log: fix-qa4

## State
- **Done:** fixes for D-52, D-49, D-50, D-48 and D-47 (commits 463c5c9, 1a04bf5), unit tests (test/fix-qa4.test.js,
  12 of 14 red on the base; 2 are guards), the e2e group (test/e2e/fix-qa4.e2e.js), the CONTRACT section.
- **In progress:** build with the README fix, then the e2e groups (fix-qa4, Beta desktop QA 4, fix-pay-at-place,
  Compstimate, the drawer), the phone smoke after, the clean `npm test`.
- **Next step:** send the lead the first tested SHA; screenshots before and after; the full e2e.

## 1. Brief
- **Prompt:** [prompts/fix-qa4.md](prompts/fix-qa4.md), verbatim.
- **Goal:** fix desktop QA round 4's D-52, D-49, D-50, D-48 and D-47 on the beta site
  ([qa-desktop-beta-4.md](qa-desktop-beta-4.md); red tests in test/e2e/beta-desktop-qa-4.e2e.js, copied here and
  registered in scripts/e2e.js), without cutting or hiding any posting or posted pay row.
- **Owned:** public/features/compstimate.js; `payRank` in public/features/shared.js; server/export.js and the CSV/README
  step of scripts/build-static.js; in public/app.js renderViz's unknown and error states, the drawer's rank line and the
  no-pay estimate line; test/fix-qa4.test.js, test/e2e/fix-qa4.e2e.js; this log and its prompt.
