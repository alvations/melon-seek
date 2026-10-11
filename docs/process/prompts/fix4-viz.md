You are fix lane **fix4-viz** for melon-seek (/home/user/melon-seek, "the Zillow of job postings"). Save this prompt verbatim to docs/process/prompts/fix4-viz.md and write your log to docs/process/fix4-viz.md following docs/process/TEMPLATE.md. Follow docs/process/prompts/cycle/fix-lane.md, docs/process/PLAYBOOK.md, docs/strategy/ROADMAP.md §8 (keep it simple: no new visible control unless a finding can't be fixed otherwise) and the dataviz conventions already in public/viz/.

**Base.** In your worktree run `git checkout --detach b4d4c0f`. Symlink node_modules, data/snapshots and data/beta/snapshots from /home/user/melon-seek. Commit locally at milestones, never push, and report your SHAs.

**Your findings.** Read each in its source (cause, numbers, owner, suggested fix). The failing e2e tests are your gate.
- docs/process/viz-review-beta.md, V-16 to V-29 and V-31. Tests: test/e2e/beta-viz-review.e2e.js.
  - V-16: Pay pin colours on one fixed scale, plus a Pay legend.
  - V-17: a pin's pay figure says how many postings it's based on, or isn't shown from too few. Its US-pay-on-a-UAE-role part is `payLocations`, which the data lane fixes.
  - V-18: Group by Location uses only pay posted for that place.
  - V-19: part-time hourly pay is labelled "if full-time" or shown as hourly, following shared decision 4 in docs/process/lead.md.
  - V-20: two-level and multi-place spans are drawn and labelled differently from a single posted range.
  - V-21: level and department rows don't mix countries; say which country, or compare within one.
  - V-22: marks at 3:1 or better.
  - V-23: company colours readable in dark mode.
  - V-25: colour-blind-safe categories.
  - V-26: a pin at a state or country centre says so.
  - V-24: no floating names without a basemap.
  - V-27: axis label rounding.
  - V-28: the grey-vs-white legend.
  - V-29: the edge-bin overlap.
  - V-31: performance; log only.
- docs/QA.md "Full QA pass (desktop, beta) 2026-10-11", D-31: without a basemap, a pin click folds off-screen pins into one. Test in test/e2e/beta-desktop-qa-2.e2e.js. Same root as V-24.
- docs/process/ux-review-beta.md: UX-17 (chart edge chips off the phone screen; test in test/e2e/beta-ux-review.e2e.js), UX-19 (map tap targets: zoom 30x30, Pay/Juice 52x26), UX-24 (fold departments past the 8 largest into one "N more" row), UX-36 (Ranges' "Group: None" vs its legend).
- docs/process/methodology-review-beta.md: MR-2 (the chart footnote and the map's Pay pins show the exchange rate's date and source next to converted pay, not only in a tooltip) and MR-13 (the map's Pay legend says what the figures are: median base pay, approx US dollars, rate date, posting count).
- The mobile QA's remaining M-8 items: map zoom 30x30, Pay|Juice 52x26, Remote badge 32 px tall.

**You own:** public/viz/chart.js, public/viz/map.js, public/viz/comps.js, public/viz/viz.css, and the colour parts of public/viz/palette.js (not its FX tables, which the data lane owns: don't touch `FX_PER_USD`, `FX_AS_OF` or `COUNTRY_CURRENCY`), plus the test files above.
**Not yours:** public/app.js, public/styles.css and public/features/* belong to fix4-app; server/** and `payLocations` belong to fix4-data. All three lanes run now. If you need app.js to pass something new to the chart or map, write a patch to docs/process/patches/fix4-viz-<name>.diff and make your side work without it, defaulting to today's behaviour.

**Gate:**
- the tests above pass;
- `npm test` passes with MELON_BETA_SNAPSHOT_DIR set to an empty folder and no data links;
- the full e2e suite has no new failures (build with `node scripts/build-static.js --out <scratch>/dist` and set BETA_QA_DIST);
- measured contrast ratios before and after, in your log;
- colour-blind simulations as screenshots;
- before/after screenshots, shrunk with scripts/cycle/shrink-screenshots.sh;
- drawing time on Apple no worse than before.
Check `df -h /` and delete your scratch build at the end. Use pid files; never `pkill -f`; never `playwright install` (Playwright: NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium /opt/pw-browsers/chromium-1194/chrome-linux/chrome). Report: each finding fixed or not, test counts before and after, patches, and SHAs.
