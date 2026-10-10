You are the charts, map and freshness fixer for melon-seek (repo at /home/user/melon-seek, branch claude/stoic-ride-54ddxp). It is a zero-build vanilla ES-module app. Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (the UI simplicity budget), docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and the findings you are given below, with the sections they come from.

**Fix these findings for target `stable`:** P-3 (chart), P-6 (map), P-13, P-14, P-16 (chart.js), and improvements I-3 (chart words) and I-10. Each one is listed below with its repro steps and the test that encodes it, where there is one:

Sources: docs/process/persona-stable-18-24.md, persona-stable-25-34.md, persona-stable-35-44.md, persona-stable-45-54.md and persona-stable-55-plus.md (the "Broken, fix now" and "Improve" lists, with screenshots in docs/screenshots/persona-stable-*/), and the consolidation in docs/process/lead.md ("Persona review of the main site").

- **P-6 Map.**
  - A cluster labelled "San Francisco, CA + 3 nearby" contains New York and DC, and tapping it lists New York and DC roles under that label (public/viz/map.js around line 355). Fix the clustering or the label.
  - On phones the pin labels overlap ("San Diego + 2 nearby" printed through Dallas, Washington cut off).
  - US-dollar pay is pinned on non-US cities: Anduril shows "Sydney · $61K · 55 roles" from 5 US contractor roles that also list Sydney (50 of the 55 have no pay), and the Fellows pins show London and Ontario at $200K. Use payLocations for the pay at each pin; count roles at every listed location, but take pay only where it applies.
  - The map legend covers a third of the map on phones.
- **P-3** Chart "Group by Seniority": use levelLabel, and put "Level not stated" last.
- **P-13 Rent dates contradict each other.** The methodology says "Rents as of May–October 2026", but Couple and Family Juice in US cities use 2- and 3-bedroom rents from Oct 2025 (scripts/methodology-figures.js rentAsOf, around line 161, counts only 1-bedroom dates). State both ("1-bedroom rents May–October 2026; 2- and 3-bedroom rents October 2025 in US cities") everywhere the date appears, and explain the ratio method in one plain sentence.
- **P-14 "(update due)"** appears on nearly every Juice footnote and comparison, on the snapshot's own day (public/features/freshness.js). Job seekers need the as-of date, not our maintenance status. Show "as of <month year>" in the app, and keep due and stale status on the methodology and freshness pages.
- **P-16 Chart text bugs.**
  - The empty state shows two messages on top of each other, both blaming the salary range when only a search word is set (chart.js around line 292; the app lane fixes its side around app.js line 1817). Show one message that names the real cause.
  - In the Ranges view the highlighted title runs into its pay ("…Discove$350K–$850K").
- **I-3 Plain words in the chart and map:** "Clusters" and "Ranges" (if the labels live in chart.js), "list pay", "middle 50%", axis "Annual salary · approx USD". Raise 10–11 px text to at least 12 px.
- **I-10 Juice grades.** The map's Juice colours and the grade badges are three shades of red, and the "Juice left" bar reads as a warning. Without adding colours (docs/strategy/ROADMAP.md §8), make the grades readable: labels, the dollar thresholds the map legend already shows, or a pattern.


**You own these files:** public/viz/chart.js, public/viz/map.js, public/viz/viz.css, public/viz/palette.js (keep COUNTRY_CURRENCY unchanged), public/features/freshness.js, public/features/features.css, scripts/methodology.js, scripts/methodology-figures.js, docs/METHODOLOGY_GUIDE.md, docs/LIVABILITY.md (rent dates only), and your own new tests.
**Do NOT edit:** public/app.js, public/index.html, public/styles.css (the app lane), public/features/compstimate.js, comps.js, roles.js, insights.js, shared.js (the estimates lane; import payLocations and levelLabel, don't edit them), server/** (the pay-data lane). Other agents own them right now. If a fix needs a change there, write it as a patch to docs/process/patches/fix-viz-<name>.diff, with a line in your report saying why. Don't edit docs/QA.md either; record your work in your own log.

**Rules:**
- Keep the UI simple. Add no new visible control unless the finding cannot be fixed any other way, and say so if you add one.
- Use plain words. No abbreviation a job seeker would not know.
- Keep desktop density. Phone-only rules go in the phone media queries.
- A fix for one target must not break the other. Run the checks against both `/melon-seek/` and `/melon-seek/beta/`.
- Never `pkill -f` or `pgrep -f`; keep server pids in pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-viz/.
- Never run `playwright install`. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

**Builds:** build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-viz/dist`, and serve it with `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-viz/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-viz/serve.pid`. Other lanes run at the same time, so never write the shared dist/. The e2e tests that read dist/ use the lead's build; the lead re-runs the whole suite on the integrated batch.

**Verify with all of these:**
- `npm test`, all green.
- The full e2e suite, `NODE_PATH=... node scripts/e2e.js`, with no new failures. The red tests for your findings must now pass.
- Before and after screenshots for every visible change, in docs/screenshots/fix-viz/.
- Desktop at 1440x900 and phone at 390x844 show no regressions.
Timing tests (PERF-1, V15, Compstimate T21) can fail when the machine is busy. Re-run them alone before calling them failures.

Write docs/process/fix-viz.md following docs/process/TEMPLATE.md: per finding, the root cause, the fix (file:line) and how it was verified. Save your prompt verbatim to docs/process/prompts/fix-viz.md.

Never push; the lead integrates and pushes. Commit only locally in your worktree, as described below. Report: the findings fixed, any you couldn't fix and why, the test results, the files changed, and the patches you wrote.


**How this wave works (lead, 2026-10-10):**
- You run in your OWN git worktree (the harness created it from commit a9a46a7). Its `dist/` is yours, so `npm run build` and the full e2e suite there collide with no one (this replaces the "Builds" paragraph above). First run `ln -s /home/user/melon-seek/node_modules node_modules`, `mkdir -p data && ln -s /home/user/melon-seek/data/snapshots data/snapshots` (both gitignored; never commit them). Use `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-viz/` for pid files and scratch.
- Three other lanes work in parallel on other files. Shared decisions, already in the base commit:
  1. **Level not stated.** The stored level 'Mid' is never read from a title; it is the default for titles that name no level (48% of postings). The value stays 'Mid' (no data or archive change). Every job-seeker surface shows it with `levelLabel(level)` from public/features/roles.js ('Mid' becomes "Level not stated"). In any level list or ladder shown to people, "Level not stated" goes last. Never present it as a matched level ("Mid · London").
  2. **Pay covers its own country.** `payLocations(job)` in public/features/shared.js returns the locations a posting's pay applies to (those in the pay currency's countries). Every city or country statistic, map pin, sort or estimate that ties pay to a place must use it.
  3. **On-target earnings.** The pay-data lane makes server/salary.js return `salary.kind: 'ote'` when the posting says the range is on-target earnings (OTE: base plus commission at target; Anthropic sales postings say "On Target Earnings"), kept through toJobSalary. Everyone else codes against `salary.kind === 'ote'`:
     - show it as "On-target earnings (base plus commission at target)", never "Posted base pay";
     - never compare or pool it with base pay (compare OTE only with OTE; leave it out of base-pay medians and cells);
     - Juice may use it with a note that it assumes commission at target.
  4. **Fixed-term pay.** The pay-data lane adds `salary.termWeeks` (an integer) when the posting states the programme length ("4-month fellowship", "12-week internship"). Surfaces show the pay as posted, e.g. "$3,850 a week for about 17 weeks". They never show a fixed-term stipend as a plain yearly salary, and Juice says it covers only that term.
  5. Keep every existing export's signature and return shape; adding fields is fine.
- **Commits.** Commit locally in your worktree, with explicit paths and the message ending in the two lines below. Never push.
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc
  ```
  Report your worktree path and commit SHAs. Run `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-viz` before committing screenshots.
- **Tests first.** Encode each finding as a failing test where you can (a unit test in test/*.test.js, or an e2e test in a NEW file test/e2e/fix-viz.e2e.js registered in scripts/e2e.js), then fix it.
