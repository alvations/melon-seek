You are the app shell fixer for melon-seek (repo at /home/user/melon-seek, branch claude/stoic-ride-54ddxp). It is a zero-build vanilla ES-module app. Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (the UI simplicity budget), docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and the findings you are given below, with the sections they come from.

**Fix these findings for target `stable`:** P-1 (labels), P-2 (drawer copy), P-3 (cards and filters), P-4, P-5, P-6 (stats line), P-7, P-8 (cards and Juice), P-12, P-15, P-16 (app.js), P-18, and improvements I-1 to I-7. Each one is listed below with its repro steps and the test that encodes it, where there is one:

Sources: docs/process/persona-stable-18-24.md, persona-stable-25-34.md, persona-stable-35-44.md, persona-stable-45-54.md and persona-stable-55-plus.md (the "Broken, fix now" and "Improve" lists, with screenshots in docs/screenshots/persona-stable-*/), and the consolidation in docs/process/lead.md ("Persona review of the main site").

- **P-1 Pay label.** For `salary.kind === 'ote'`, show "On-target earnings (base plus commission at target)" instead of "Posted base pay", in the pay block and the card, and add a Juice note that it assumes commission at target. The pay-data lane produces the field; test with a fixture job.
- **P-2 compstimateBlock.** Never print "Typically within ±8%" next to "low confidence". Render the basis line the estimates lane returns. Don't build your own location or level text.
- **P-3 "Level not stated".** Use levelLabel on cards, the Seniority filter (put it last), the drawer, the CSV-facing labels if any, and the saved-search names.
- **P-4 Search and sorting.**
  - "intern" matches inside words: 9 of Anthropic's 12 results are International or Internal (titleMatch, line 533, uses `includes`). Match whole words or word starts, in the query filter too.
  - With a search active, "Newest" puts a 59-day-old title match first and a 2-day-old role 10th, and "Highest pay" puts title matches first (lines 525–530).
  - An explicit sort must be strict. While searching, offer "Best match" as the default in the existing sort select; add no new control.
- **P-5 Salary box** (makeSalary, parseBound/typed, around lines 1195–1210). It silently drops "£80,000", "£250,000" (as $250K), "80k", "A$350k", "AUD 350000", "60000" and "400", which snap to "Any".
  - Accept k/K, thousands separators and a currency symbol or code, converting to USD with the app's FX table, and show what was understood ("£80,000 ≈ $108K").
  - Keep values below the slider's floor instead of dropping them.
  - Label the box so people know it is yearly pay in US dollars ("Min $/yr").
  - Tell people when the pay filter hides postings that list no pay.
- **P-6 Stats line.** The summary line ("median … mostly …") and any city figure must use payLocations. Also, "mostly Sales" is shown at 19% (line 1657); say "mostly" only above a real majority, or drop it.
- **P-7 Juice uses the posting's best city, not the place the person chose.** A DC and Reston list is topped by a job scored for Huntsville; a Toronto seeker sees Montreal; the Fellows role shows San Francisco only, though it lists Ontario.
  - When a Location filter is set, the "Most juice" sort, the card badge and the drawer's Juice use the best matching filtered location.
  - "Compare locations" still shows the others.
  - Say which place and household the number is for ("for Couple in Washington, DC").
- **P-8 Fixed-term pay on cards and in the drawer** (salary.termWeeks; the card shows "$200K · Intern" for $3,850 a week over 4 months): show it as posted, and label Juice as covering only the term.
- **P-12 Saved search.** The menu says "4 new" but no card is marked New, when you visit the company between openings (savedNewCount vs isNewJob/markVisit). Make the two agree; the user must be able to find the new ones.
- **P-15 Couple.** "Couple" means one earner, married, filing jointly (server/juice.js around line 194), with no note, so a couple keeps more than a single person. Say it in the Juice block in plain words.
- **P-16 Text bugs in app.js:**
  - "≈ $44K–44K" and "≈ $59K–59K";
  - "0% percentile" and "Pays more than 0% of roles" in big green type on an internship stipend;
  - "Revenue · Revenue", "Internships · Internships · Intern [Intern]" and "Canada · Canada";
  - the chart's empty state showing two messages, both blaming the salary range when only a search word is set (app.js around line 1817; the viz lane fixes chart.js around line 292);
  - two identical "‹" icons side by side in the phone drawer (Close and Previous role).
- **P-18 Juice numbers.**
  - Monthly rows round to $1K, so they don't add up ("$5K − $1K − $2K − $2K" shown as "−$603"). Round to the nearest $10 a month, and $100 a year.
  - The "Juice left" bar is red even when the result is positive; use the app's existing colours, adding no new ones.
  - The header stays per-year after choosing Monthly.
- **I-1 (all 5 groups) Switching company wipes the search and every filter** (switchCompany, resetFiltersPatch). Keep the search, the salary bounds and the filters that exist at the new company. Drop the rest with the toast "Same role elsewhere" already uses ("kept …, dropped …"). Peter switched seven times and started over each time.
- **I-2 (all 5) On arrival nothing says what the site is**, and the phone hides the melon·seek name. Add one short line (e.g. "Pay, and what's left after tax and rent, for 8 tech companies' open roles"), and the brand on phones, within the simplicity budget.
- **I-3 (all 5) Plain words in app.js.** Replace or explain:
  - stats and chart: "list pay", "% list pay", "middle 50%", "Clusters/Ranges" (if the labels are in app.js), "≈" before a score, "percentile";
  - levels and dates: "Staff+", "Director+" (explain once), "FX", "EOR", the ages "16mo", "13y+" and "2y+" (say "Listed 16 months ago", and "Always-open posting" for the 13-year ones);
  - Juice: the grades Juicy, Ripe, Dry and Rind, with a scale on the cards' first use; "regional/social" tax; "(update due)" (the viz lane changes freshness.js);
  - the company menu: "Board slug", "Add board", the GREENHOUSE/ASHBY/LEVER headings and slugs such as "andurilindustries" (show company names);
  - "Apply on Greenhouse/Ashby/Lever" (say "Apply on <Company>'s careers site").
  Keep the UI simple; no new controls.
- **I-4 (all 5) Saved searches.**
  - On phones Save is an unlabelled bookmark icon between clipped chips.
  - Saved searches hide in a menu titled "Job boards", and a return visit always opens Anthropic.
  - Label Save, reopen the last company and view on return, and say once that saves live in this browser.
- **I-5** The phone quickbar: active chips are cut off under the pinned Save icon ("ority", "Re", "ition"), and active filters scroll out of sight.
- **I-6** The Location list puts London (47 roles) behind "Show all 27" while Austin (3) shows. Order by count, and make a city pick also catch postings that list only the country or region ("United Kingdom", "Ontario, Canada", "Remote (Canada)") where that is honest (makeChecklist).
- **I-7** At 125% zoom the Chart/Map/Insights switch shows icons only, and "Add board" becomes "+". Keep the labels, and raise the 10–11 px counts and axes in your CSS to at least 12 px.


**You own these files:** public/app.js, public/index.html, public/styles.css, and your own new tests (test/e2e/fix-app.e2e.js and unit tests).
**Do NOT edit:** public/features/** and public/viz/** (the estimates and viz lanes), server/** and scripts/** (the pay-data lane). If you need a change there, write it as a patch. Other agents own them right now. If a fix needs a change there, write it as a patch to docs/process/patches/fix-app-<name>.diff, with a line in your report saying why. Don't edit docs/QA.md either; record your work in your own log.

**Rules:**
- Keep the UI simple. Add no new visible control unless the finding cannot be fixed any other way, and say so if you add one.
- Use plain words. No abbreviation a job seeker would not know.
- Keep desktop density. Phone-only rules go in the phone media queries.
- A fix for one target must not break the other. Run the checks against both `/melon-seek/` and `/melon-seek/beta/`.
- Never `pkill -f` or `pgrep -f`; keep server pids in pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-app/.
- Never run `playwright install`. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

**Builds:** build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-app/dist`, and serve it with `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-app/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-app/serve.pid`. Other lanes run at the same time, so never write the shared dist/. The e2e tests that read dist/ use the lead's build; the lead re-runs the whole suite on the integrated batch.

**Verify with all of these:**
- `npm test`, all green.
- The full e2e suite, `NODE_PATH=... node scripts/e2e.js`, with no new failures. The red tests for your findings must now pass.
- Before and after screenshots for every visible change, in docs/screenshots/fix-app/.
- Desktop at 1440x900 and phone at 390x844 show no regressions.
Timing tests (PERF-1, V15, Compstimate T21) can fail when the machine is busy. Re-run them alone before calling them failures.

Write docs/process/fix-app.md following docs/process/TEMPLATE.md: per finding, the root cause, the fix (file:line) and how it was verified. Save your prompt verbatim to docs/process/prompts/fix-app.md.

Never push; the lead integrates and pushes. Commit only locally in your worktree, as described below. Report: the findings fixed, any you couldn't fix and why, the test results, the files changed, and the patches you wrote.


**How this wave works (lead, 2026-10-10):**
- You run in your OWN git worktree (the harness created it from commit a9a46a7). Its `dist/` is yours, so `npm run build` and the full e2e suite there collide with no one (this replaces the "Builds" paragraph above). First run `ln -s /home/user/melon-seek/node_modules node_modules`, `mkdir -p data && ln -s /home/user/melon-seek/data/snapshots data/snapshots` (both gitignored; never commit them). Use `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-app/` for pid files and scratch.
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
  Report your worktree path and commit SHAs. Run `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-app` before committing screenshots.
- **Tests first.** Encode each finding as a failing test where you can (a unit test in test/*.test.js, or an e2e test in a NEW file test/e2e/fix-app.e2e.js registered in scripts/e2e.js), then fix it.
