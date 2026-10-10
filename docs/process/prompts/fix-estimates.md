You are the estimates and comparisons fixer for melon-seek (repo at /home/user/melon-seek, branch claude/stoic-ride-54ddxp). It is a zero-build vanilla ES-module app. Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (the UI simplicity budget), docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and the findings you are given below, with the sections they come from.

**Fix these findings for target `stable`:** P-1 (comparisons), P-2, P-3 (your surfaces), P-6 (Insights), P-10, P-11, and improvements I-8 and I-9. Each one is listed below with its repro steps and the test that encodes it, where there is one:

Sources: docs/process/persona-stable-18-24.md, persona-stable-25-34.md, persona-stable-35-44.md, persona-stable-45-54.md and persona-stable-55-plus.md (the "Broken, fix now" and "Improve" lists, with screenshots in docs/screenshots/persona-stable-*/), and the consolidation in docs/process/lead.md ("Persona review of the main site").

- **P-1 Do not pool on-target earnings with base pay** in "Same role elsewhere" (compsForJob), Compare companies (public/viz/comps.js), the market cells (scripts/build-market.js) or Compstimate comparables. Use `salary.kind === 'ote'`; compare OTE only with OTE, and say so.
- **P-2 Compstimate claims what its comparables don't have** (all 5 groups):
  - "≈$222K Staff+ · Sydney" is built from 205 US roles, "≈$133K Mid · London" from US pay, "≈$301K Senior · Sydney" and "$245K London" from SF/NY roles. `locationSim` weights other countries 0.25 instead of excluding them, and the basis line still names the city.
  - "≈$215K Intern · Canada" for a Cohere intern comes from full-time roles (senioritySim).
  - "Typically within ±8%" is printed next to "low confidence".
  - The drawer gives ≈$222K while Insights says "Not enough comparable roles" for the same job.
  - The Insights range bar's end labels ($78K … $279K) are not its real ends (its High of $381K sits inside them), around lines 730–760.

  Rules:
  - Never use pay from another country for a city or country estimate. If you fall back, say so in the basis line ("from US roles; no role in Sydney lists pay").
  - An intern estimate uses only intern or fixed-term pay.
  - The basis line describes the comparables actually used: their level, place and count.
  - No accuracy claim at low confidence.
  - One function gives the same answer to the drawer and to Insights.
- **P-3 levelLabel** in your surfaces (basis lines, Compare, Insights tables). Comparisons between companies by level must not treat "Level not stated" as a level match. For example, xAI's 305 roles all lack a level, so "xAI has no Staff role" is not true; the honest statement is that xAI does not state levels.
- **P-6 Insights statistics by city** (Market insights' "Sydney median $61K" comes from 5 US contractor roles that list Sydney among 5 cities): use payLocations. Hide statistics built from tiny or tied samples, such as bars from 2 roles, "+$38K" for 8 different skills, or "Strong communication −$34K". Set a minimum, document it, and test it.
- **P-10 Compare companies mixes internships and levels with full-time pay.** "xAI · Business operations · $52K" is two hourly internships plus an analyst. Compare like with like: leave out interns and fixed-term roles unless the level is Intern, and leave out OTE when comparing base pay.
- **P-11 "Same role elsewhere" picks the wrong family** (public/features/roles.js roleFamily and the comps fallback):
  - "Head of National Security Sales" and the Fellows programme are compared with security roles, because the security rule runs before the sales rule.
  - A drone operator is set against Anthropic "Field operations" ($310K; Life Sciences Operator, Instructor), from the field-ops regex near line 195.
  - A policy lead is compared with security engineers.
  - When the level doesn't match, it falls back to all levels, so an intern fellowship is compared with full-time Security roles.

  Fix the family rules with a test per real title. Never fall back across the intern/full-time line. Return why it fell back (a field on the result), so the app can print a true message instead of "No other company lists this level" (public/app.js around line 2567; write that change as a patch).
- **I-8 Compare companies follows the current filter.** It opens on Software engineering while the filter is Public Policy, ignores search, level and location, and drops companies with fewer than 3 salaried postings without saying so. Offer the job's or filter's family by default and a level choice inside the existing card, with no new top-level control. If the wiring is in app.js (around line 1750), send it as a patch.
- **I-9 Plain words in your surfaces:** "Compstimate" (say "Pay estimate" to job seekers), "percentile", "middle 50%", "≈". Keep the names in code.


**You own these files:** public/features/compstimate.js, public/features/comps.js, public/features/roles.js, public/features/insights.js, public/features/shared.js, public/viz/comps.js, scripts/build-market.js, and your own new tests.
**Do NOT edit:** public/app.js, public/index.html, public/styles.css (the app lane), public/viz/chart.js, public/viz/map.js, public/features/freshness.js (the viz lane), server/** (the pay-data lane). If the app needs to render something new from your functions (for example a reason code), add a field to your function's result and write the app.js change as a patch. Other agents own them right now. If a fix needs a change there, write it as a patch to docs/process/patches/fix-estimates-<name>.diff, with a line in your report saying why. Don't edit docs/QA.md either; record your work in your own log.

**Rules:**
- Keep the UI simple. Add no new visible control unless the finding cannot be fixed any other way, and say so if you add one.
- Use plain words. No abbreviation a job seeker would not know.
- Keep desktop density. Phone-only rules go in the phone media queries.
- A fix for one target must not break the other. Run the checks against both `/melon-seek/` and `/melon-seek/beta/`.
- Never `pkill -f` or `pgrep -f`; keep server pids in pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-estimates/.
- Never run `playwright install`. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

**Builds:** build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-estimates/dist`, and serve it with `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-estimates/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-estimates/serve.pid`. Other lanes run at the same time, so never write the shared dist/. The e2e tests that read dist/ use the lead's build; the lead re-runs the whole suite on the integrated batch.

**Verify with all of these:**
- `npm test`, all green.
- The full e2e suite, `NODE_PATH=... node scripts/e2e.js`, with no new failures. The red tests for your findings must now pass.
- Before and after screenshots for every visible change, in docs/screenshots/fix-estimates/.
- Desktop at 1440x900 and phone at 390x844 show no regressions.
Timing tests (PERF-1, V15, Compstimate T21) can fail when the machine is busy. Re-run them alone before calling them failures.

Write docs/process/fix-estimates.md following docs/process/TEMPLATE.md: per finding, the root cause, the fix (file:line) and how it was verified. Save your prompt verbatim to docs/process/prompts/fix-estimates.md.

Never push; the lead integrates and pushes. Commit only locally in your worktree, as described below. Report: the findings fixed, any you couldn't fix and why, the test results, the files changed, and the patches you wrote.


**How this wave works (lead, 2026-10-10):**
- You run in your OWN git worktree (the harness created it from commit a9a46a7). Its `dist/` is yours, so `npm run build` and the full e2e suite there collide with no one (this replaces the "Builds" paragraph above). First run `ln -s /home/user/melon-seek/node_modules node_modules`, `mkdir -p data && ln -s /home/user/melon-seek/data/snapshots data/snapshots` (both gitignored; never commit them). Use `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-estimates/` for pid files and scratch.
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
  Report your worktree path and commit SHAs. Run `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-estimates` before committing screenshots.
- **Tests first.** Encode each finding as a failing test where you can (a unit test in test/*.test.js, or an e2e test in a NEW file test/e2e/fix-estimates.e2e.js registered in scripts/e2e.js), then fix it.
