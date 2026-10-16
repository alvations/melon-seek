# Process log: viz-even

## State
- **Done:** worktree on origin/claude/stoic-ride-54ddxp (3145975); docs and chart.js read; data linked.
- **In progress:** step 1, measuring the clusters and ranges views on the 2026-10-16 crawl.
- **Next step:** build, dump each board's plotted list, measure per row at 1440 and 390.

## 1. Brief
Prompt: [prompts/viz-even.md](prompts/viz-even.md) (verbatim). The user (2026-10-11): "Are you sure the salary
range of the big tech are correct?! They don't look correct and kinda all span too evenly." The numbers are
the companies' own; this lane fixes the part of the "even" look that is our drawing: the clusters view's
evenly spaced circles and the ranges view's repeated identical bars.

Files owned: `public/viz/chart.js` (the drawing of clusters and ranges), chart-mark CSS, `test/viz-even.test.js`,
`test/e2e/viz-even.e2e.js`, this log, the prompt copy and `docs/screenshots/viz-even/`.
