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
- 2026-10-16 22:20: density scan done (16 runs; summary `probes/density-sum.mjs`). Confirmed so far:
  - text density over budget on every board, both phones: drawer "Same role elsewhere" captions (up to 4 lines /
    33 words), Pay estimate card (explain 5 lines / 30 words), Juice explainer (3 lines / 30 words), filter-sheet
    notes (up to 4 lines / 30 words), drawer Juice and listing lines (2-3 lines), badge popover (3-4 lines; 6 on
    the main site with a live-fetch error), More sheet note (2 lines); the drawer percentile line is cut off
    ("Pays more than 72% of Amazon's roles in the …") on 6 boards;
  - Amazon's two "Project/Program/Product Management--…" departments read the same in the filter sheet (cut);
    Insights row names cut to 6-9 letters ("Network…", "Datacen…");
  - "Microsoft" cut to "Micros…" in the top bar at 380-392 px (the text is 0.2 px wider than its box at 390);
  - a "· N places" card ($60K–129K · 4 places) opens a job page headed with one place's range ($83K–117K), unlabelled;
  - the stats line is a bare "Details" when the view has no pay (Google, l=Buenos Aires);
  - map pin tooltip on tap: off screen and stays (sent to the lead for fix-touch-tips);
  - a tap on an Amazon preview card gives no feedback; the job opens 10 s later on Slow 4G.
  - Works: preview (first cards 1.6-1.8 s Fast 4G, 4.4 s Slow 4G at 4x CPU; list replaces them in place, same
    ids), Google families + Company (Show 162 roles = 162), pay-shape cards, chart taps, flicks (with exact event
    timestamps), sort 91-189 ms and filter 166-303 ms at load 8-12, heap bounded at ~70 MB over 3 rounds with Amazon.
  - Running: per-board smoke (`probes/run-smoke.sh`, logs in `<scratch>/qa-mobile-beta-3/smoke/`).

## 1. Brief
Prompt: [prompts/qa-mobile-beta-3.md](prompts/qa-mobile-beta-3.md). A functional QA pass of the phone beta site
(`/melon-seek/beta/`) on the 2026-10-16 whole-board crawl (Amazon 22,179 postings), after fix wave 5, fix-density,
google-grouping, the salary audit, perf-mobile-beta-2, fix6-fresh-data and viz-even. No product code is edited.
Files owned: this log, the prompt, test/e2e/beta-mobile-qa-3.e2e.js (and its registration in scripts/e2e.js),
docs/screenshots/qa-mobile-beta-3/, and the "Section for docs/QA.md" at the end of this log (the lead copies it in).
