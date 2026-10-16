# Process log: qa-desktop-beta-3

The third desktop QA pass of the beta site (`/melon-seek/beta/`), beta round 3 (2026-10-16).

## State
- 2026-10-16 21:35 UTC: worktree at d98a9f0 (local branch qa-desktop-beta-3), today's crawl linked into
  `data/snapshots` and `data/beta/snapshots` (not committed). Prompt saved.
- Serving the lead's build `<scratch>/cycle-beta6-dist` (its app.js, chart.js, map.js, api.js equal d98a9f0's)
  on port 37705, pid in `<scratch>/qa-desktop-beta-3/serve.pid`. Scripts in `<scratch>/qa-desktop-beta-3/`.
- Done (21:58): landing and badges (s1), absent boards (s1b), Amazon preview (s2), company menu and Add board
  (s3), facets on 8 boards (s5: 1,281 checks, 0 wrong), Location labels (s6), search ranking (s7), all sorts
  (s8), salary filter (s9), card pay text for every paid posting (cards.mjs).
- Candidate bugs (to confirm with screenshots and tests): Amazon "· 2 places" for one place with two rows
  (26 postings); St./St/Saint spellings split one place or hide the state (Amazon St. Louis MO vs St Louis MI;
  Google St. George UT, Saint George SC, St George SC); NVIDIA state-only places read "New York, US" and
  "Washington, US"; Microsoft "· 2 places" cards whose place ranges span two levels (19); an Amazon internship
  with two place rows shows one figure.
- Next: chart, map, Insights, drawer, other features, layout, timings; then tests, screenshots, suites.
- New IDs start at D-38 (the highest in the newest sections is D-37).

## 1. Brief
- **Prompt:** [prompts/qa-desktop-beta-3.md](prompts/qa-desktop-beta-3.md), saved verbatim.
- **Goal:** a functional pass of every desktop feature on the seven big-tech boards (Amazon, Apple, Google, Meta,
  Microsoft, NVIDIA, Netflix) plus Anduril from the main site, on the 2026-10-16 crawl with every board whole;
  check what changed since round 2 (fix-density, google-grouping, the salary audit, perf-mobile-beta-2,
  fix6-fresh-data, viz-even); re-check earlier findings; file new bugs from D-38. No product code changed.
- **Files owned:** this log; the prompt file; `test/e2e/beta-desktop-qa-3.e2e.js` and its registration in
  `scripts/e2e.js`; the screenshots in `docs/screenshots/qa-desktop-beta-3/`; the QA section at the end of this
  log ("Section for docs/QA.md"), which the lead copies into `docs/QA.md`.
