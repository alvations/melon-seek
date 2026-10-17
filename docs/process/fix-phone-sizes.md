# Process log: fix-phone-sizes

## State

- **Done:** prompt saved; baseline phone-smoke (Chromium, 19 sizes x 7 boards: 7 failures, all on the Razr cover
  screen); test/e2e/phone-matrix.e2e.js written and registered; baseline run of it in progress.
- **In progress:** the fixes in public/styles.css.
- **Next:** CSS fixes per finding, then the gate (npm test without data links, the full e2e), screenshots after.

## 1. Brief

Prompt: [prompts/fix-phone-sizes.md](prompts/fix-phone-sizes.md) (verbatim). Goal: the phone layout works on every
size and posture in test/e2e/phone-sizes.mjs, from the folded Galaxy Fold (280 px) to the Surface Duo spanned
(1114 px), the Razr cover screen and landscape; the company name is always whole; dual screens keep the hinge clear.
Files owned: public/styles.css (layout rule blocks only), test/e2e/phone-matrix.e2e.js (new), scripts/e2e.js
(registration), this log, the prompt file, docs/screenshots/fix-phone-sizes/.

## 2. Inputs and sources

## 3. Decisions and rationale

## 4. Replayable steps

## 5. Verification

## 6. Known gaps and follow-ups

## 7. Change log

- 2026-10-16 23:50: started from a92a3c8; baseline smoke and matrix runs.
