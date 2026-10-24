# Process log: ux-density-6

## State

- **Done:** brief saved verbatim (f52d08c); e800c43's site built (no product file differs between e800c43 and the
  branch tip 0c6990e) and served; the user's two screenshots measured (375x625 page, Chrome on iOS); the size matrix
  drafted (scratch `ux6/sizes.mjs`); the audit script written and checked against the user's screenshot.
- **In progress:** the before audit (35 sizes x 4 boards x 4 states, scratch `ux6/before/`).
- **Next:** the density spec table and the phone-sizes.mjs patch, sent to the lead; then the mockups.

## 1. Brief

Prompt: [prompts/ux-density-6.md](prompts/ux-density-6.md) (verbatim).

Goal: "the charts and view is way too noisy on an iPhone mini" (the user, 2026-10-24). Make the amount of
information scale with the screen, from the iPhone mini to the largest iPhones, the folds and the Surface Duo, and the
iPads. Density means fewer things on the first screen and more behind one tap, never less data. This lane designs and
measures; fix-ui-6 implements.

Files owned: this log, the prompt, docs/screenshots/ux-density-6/.
