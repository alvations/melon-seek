# Process log: fix-ui-6

## State

- **Done (in the worktree, not yet sent):**
  - prompt saved (814f6f1); baseline build of 00bd52c (e800c43 plus the checkpoint retirements) kept as a hard-linked copy;
  - baselines on that build: phone smoke 147/147 (21 sizes x 7 boards), phone matrix 60/60;
  - first fixes in public/app.js, public/styles.css and public/viz/map.js for B-1 to B-7 (section 3);
  - test/e2e/fix-ui-6.e2e.js (72 tests), registered in scripts/e2e.js.
- **In progress:** B-4's before/after timings; the red run of the new tests on the baseline build.
- **Next:** B-8 to B-11 (persona wave 2, from the lead); green runs, the related groups, smoke and matrix after, screenshots,
  npm test in a clean checkout, then send the SHAs.

## 1. Brief

Prompt: [prompts/fix-ui-6.md](prompts/fix-ui-6.md) (verbatim). Round 4's backlog on e800c43: the card's dot under Group by
Location and by Level (B-1), the job page's level badge gap (B-2), the filter sheet's footer under the keyboard and its
slow start on touch screens over 860 px (B-3, B-4), the Razr inner landscape chart (B-5), the search box from 861 px
(B-6), the Razr cover screen's map (B-7). Later from the lead (persona wave 2): the Duo's hinge (B-8), the Razr cover
screen's saved searches and toast (B-9), a phone with few roles (B-10), the arrival line (B-11).

Owned: the card's dot and meta line, the filter sheet's footer and opening, the layout rules over 860 px, the map's fit
and padding (fitToData, clearOfControls in public/viz/map.js); test/e2e/fix-ui-6.e2e.js; this log; the prompt.
Not owned: pay parsing and Compstimate (fix-data-6), derive(), the stats line's median, the map pins' and the chart
caption's label text (fix-app-6), data files.

## 2. Inputs and sources

- docs/CONTRACT.md (fix-qa4's UX-50 section; fix-pay-at-place; the frontend interfaces), docs/process/PLAYBOOK.md
  ("Checkpoints", "Known traps"), TEMPLATE.md, fix-phone-sizes.md (decisions 7, 14 and §6), fix-qa4.md (§3.9, §6),
  lead.md from "Fix wave 5".
- test/e2e/phone-sizes.mjs (21 sizes), phone-matrix.e2e.js (its M-52 keyboard stand-in and the meta-line check),
  beta-mobile-qa-4.e2e.js (M-51, M-52), fix-viz-5.e2e.js (the Razr map test), fix-qa4.e2e.js (UX-50's test).
- Chrome traces with invalidation tracking (scratch `probes/inval.cjs`) for B-4.

## 3. Decisions and rationale

(written as each item lands; see the change log)

## 4. Replayable steps

1. `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp`; link
   `node_modules`, `data/snapshots`, `data/beta/snapshots` (the 2026-10-16 crawl); `node scripts/build-static.js`.
2. Keep the baseline: `cp -al dist <scratch>/fui6/dist-before`; app.js, styles.css and viz/map.js are copied verbatim by
   the build, so edits go into dist/ with `cp --remove-destination` (the hard-linked baseline keeps its files).
3. Baselines: `node test/e2e/webkit/phone-smoke.mjs --dist <scratch>/fui6/dist-before --sizes all --engines chromium
   --boards apple,amazon,google,meta,microsoft,netflix,nvidia` and `PHONE_MATRIX_DIST=<scratch>/fui6/dist-before node
   test/e2e/phone-matrix.e2e.js` (NODE_PATH=<scratch>/pw/node_modules).
4. The new group: `FUI6_DIST=<dir> node test/e2e/fix-ui-6.e2e.js [--grep=re]`, or `node scripts/e2e.js --grep=fix-ui-6`.

## 5. Verification

(filled in as runs finish)

## 6. Known gaps and follow-ups

(filled in at the end)

## 7. Change log

- 2026-10-23 21:12: started on 00bd52c; build, baselines (smoke 147/147, matrix 60/60).
