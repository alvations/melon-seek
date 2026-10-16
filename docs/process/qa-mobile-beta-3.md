# Process log: qa-mobile-beta-3 (third mobile QA pass on beta)

## State
- 2026-10-16 21:32: started at d98a9f0 (detached at origin/claude/stoic-ride-54ddxp); crawl symlinked; prompt saved.
- 2026-10-16 22:00: serving the lead's build `<scratch>/cycle-beta6-dist` (port 5431, pid file
  `<scratch>/qa-mobile-beta-3/serve.pid`). Probes in `<scratch>/qa-mobile-beta-3/probes/`. New IDs start at M-33
  (highest so far M-32).
  - Done: landing on 8 boards (p1), Amazon preview (p2, Fast and Slow 4G at 4x CPU), first density scan on Amazon
    390 (p3), touch tooltips (p4, p5; sent to the lead for fix-touch-tips). Earlier groups `^Beta mobile QA`: 20/20 pass.
  - Running: density scan on all boards at 390x844 and 360x740 (`probes/run-density.sh`, logs in
    `<scratch>/qa-mobile-beta-3/density/`).
  - Candidate findings so far (to confirm): Juice explainer 3 lines above the list (UX-35, phone); drawer "Same role
    elsewhere" captions 2-3 lines each; Compstimate result card explainer 5 lines; filter-sheet notes 2-3 lines;
    drawer Juice / listing lines 2 lines; Insights skill names cut ("Network…"); map pin tooltip off screen and
    sticky; a tap on a preview card gives no feedback for up to 10 s; a bare "Details" stats line when an area has no
    pay; `l=Seattle, WA` gives 0 roles (check the key format).
  - Next: per-board functional smoke, Google families and Company, pay-shape cards, sheet/filter/map gestures,
    landscape, big-board timings and memory; then the test file.

## 1. Brief
Prompt: [prompts/qa-mobile-beta-3.md](prompts/qa-mobile-beta-3.md). A functional QA pass of the phone beta site
(`/melon-seek/beta/`) on the 2026-10-16 whole-board crawl (Amazon 22,179 postings), after fix wave 5, fix-density,
google-grouping, the salary audit, perf-mobile-beta-2, fix6-fresh-data and viz-even. No product code is edited.
Files owned: this log, the prompt, test/e2e/beta-mobile-qa-3.e2e.js (and its registration in scripts/e2e.js),
docs/screenshots/qa-mobile-beta-3/, and the "Section for docs/QA.md" at the end of this log (the lead copies it in).
