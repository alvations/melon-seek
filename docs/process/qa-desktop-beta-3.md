# Process log: qa-desktop-beta-3

The third desktop QA pass of the beta site (`/melon-seek/beta/`), beta round 3 (2026-10-16).

## State
- 2026-10-16 21:35 UTC: worktree at d98a9f0 (detached, origin/claude/stoic-ride-54ddxp), today's crawl linked
  into `data/snapshots` and `data/beta/snapshots` (not committed). Prompt saved. Reading the docs next.
- Bugs confirmed so far: none yet. New IDs start at D-38 (the highest in the newest sections is D-37).

## 1. Brief
- **Prompt:** [prompts/qa-desktop-beta-3.md](prompts/qa-desktop-beta-3.md), saved verbatim.
- **Goal:** a functional pass of every desktop feature on the seven big-tech boards (Amazon, Apple, Google, Meta,
  Microsoft, NVIDIA, Netflix) plus Anduril from the main site, on the 2026-10-16 crawl with every board whole;
  check what changed since round 2 (fix-density, google-grouping, the salary audit, perf-mobile-beta-2,
  fix6-fresh-data, viz-even); re-check earlier findings; file new bugs from D-38. No product code changed.
- **Files owned:** this log; the prompt file; `test/e2e/beta-desktop-qa-3.e2e.js` and its registration in
  `scripts/e2e.js`; the screenshots in `docs/screenshots/qa-desktop-beta-3/`; the QA section at the end of this
  log ("Section for docs/QA.md"), which the lead copies into `docs/QA.md`.
