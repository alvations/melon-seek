You are the pay data (server) fixer for melon-seek (repo at /home/user/melon-seek, branch claude/stoic-ride-54ddxp). It is a zero-build vanilla ES-module app. Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (the UI simplicity budget), docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and the findings you are given below, with the sections they come from.

**Fix these findings for target `stable`:** P-1 (server side), P-3 (level rules), P-8, P-9, P-17. Each one is listed below with its repro steps and the test that encodes it, where there is one:

Sources: docs/process/persona-stable-18-24.md, persona-stable-25-34.md, persona-stable-35-44.md, persona-stable-45-54.md and persona-stable-55-plus.md (the "Broken, fix now" and "Improve" lists, with screenshots in docs/screenshots/persona-stable-*/), and the consolidation in docs/process/lead.md ("Persona review of the main site").

- **P-1 On-target earnings shown as base pay** (all 5 groups). Anthropic's sales postings (about 100 with pay) say the range is On Target Earnings, but the drawer says "Posted base pay". Return `salary.kind: 'ote'` for those, using the posting's own words and the clause that holds the range. Other OTE phrasings to cover: "OTE", "on-target earnings", "on target compensation", "base + commission at target". A "for sales roles, the range is OTE" boilerplate applies only to sales titles (see SALES_CONDITIONAL_RE and SALES_TITLE_RE in server/keywords.js). Count, per company in data/snapshots, how many postings change, and list 5 real examples in your log.
- **P-3 Level rules** (server/keywords.js seniorityOf; keep 'Mid' as the default and don't add a 'Mid' title rule):
  - "Federal Account Director" (a sales role) is filed Director+.
  - "Conceptual Reasoning Fellow" ($100–167K, part of the Anthropic Fellows programme) is filed Staff+.
  - A bare "Fellow" in a programme title is a fixed-term fellowship, not a distinguished fellow.
  Check every title in the 8 snapshots that the change moves, and report the before and after counts per level.
- **P-8 Fixed-term pay.**
  - The Anthropic Fellows posting pays $3,850 a week (also £2,310 and C$4,300) for 4 months. The card shows "$200K · Intern", and Juice scores it as a full year ("58 Ripe").
  - 12-week internships get a full-year Juice.
  - Add `salary.termWeeks` when the posting states the length, and document it in docs/CONTRACT.md.
- **P-9 Victoria, British Columbia is geocoded to Australia.** Cohere's Canada-only annotation roles list "Victoria, Australia", and Winnipeg and Halifax get no country. Fix server/geo.js, using the job's other locations and the raw string as context.
- **P-17 Wrong keyword tags** (server/keywords.js, around lines 510–525):
  - "CAD" appears on postings paid in Canadian dollars;
  - "Mechanical design" comes from "mechanisms";
  - "Autonomy" appears on sales roles;
  - TypeScript appears on designers, Machine learning on a Customer Success Manager, Embedded on a Contracts Manager.
  Fix the patterns, measure the false-positive change on a labelled sample, and keep the existing keyword tests green.
- **Delivery.** Make sure these fields reach users on both paths:
  - The browser normalizes live boards with the same modules (public/lib/*, copied at build).
  - Find out whether the static build re-derives salary and seniority from the stored snapshots or uses the stored values. If it uses the stored values, make the build re-derive them, so the deployed bundle shows the fix before the next crawl.
  - Note in your log that the next crawl will archive new versions of the affected postings (the archive is append-only; that is expected).


**You own these files:** server/salary.js, server/keywords.js, server/geo.js, server/normalize.js, server/vet.js, scripts/vet-salaries.js, scripts/build-static.js (only for the re-derivation below), docs/CONTRACT.md, docs/VETTING.md and docs/DATA_SOURCES.md (pay rules), and your own new tests.
**Do NOT edit:** public/** (another three lanes own all of it), scripts/build-market.js, scripts/methodology*.js. Other agents own them right now. If a fix needs a change there, write it as a patch to docs/process/patches/fix-pay-data-<name>.diff, with a line in your report saying why. Don't edit docs/QA.md either; record your work in your own log.

**Rules:**
- Keep the UI simple. Add no new visible control unless the finding cannot be fixed any other way, and say so if you add one.
- Use plain words. No abbreviation a job seeker would not know.
- Keep desktop density. Phone-only rules go in the phone media queries.
- A fix for one target must not break the other. Run the checks against both `/melon-seek/` and `/melon-seek/beta/`.
- Never `pkill -f` or `pgrep -f`; keep server pids in pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-pay-data/.
- Never run `playwright install`. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

**Builds:** build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-pay-data/dist`, and serve it with `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-pay-data/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-pay-data/serve.pid`. Other lanes run at the same time, so never write the shared dist/. The e2e tests that read dist/ use the lead's build; the lead re-runs the whole suite on the integrated batch.

**Verify with all of these:**
- `npm test`, all green.
- The full e2e suite, `NODE_PATH=... node scripts/e2e.js`, with no new failures. The red tests for your findings must now pass.
- Before and after screenshots for every visible change, in docs/screenshots/fix-pay-data/.
- Desktop at 1440x900 and phone at 390x844 show no regressions.
Timing tests (PERF-1, V15, Compstimate T21) can fail when the machine is busy. Re-run them alone before calling them failures.

Write docs/process/fix-pay-data.md following docs/process/TEMPLATE.md: per finding, the root cause, the fix (file:line) and how it was verified. Save your prompt verbatim to docs/process/prompts/fix-pay-data.md.

Never push; the lead integrates and pushes. Commit only locally in your worktree, as described below. Report: the findings fixed, any you couldn't fix and why, the test results, the files changed, and the patches you wrote.


**How this wave works (lead, 2026-10-10):**
- You run in your OWN git worktree (the harness created it from commit a9a46a7). Its `dist/` is yours, so `npm run build` and the full e2e suite there collide with no one (this replaces the "Builds" paragraph above). First run `ln -s /home/user/melon-seek/node_modules node_modules`, `mkdir -p data && ln -s /home/user/melon-seek/data/snapshots data/snapshots` (both gitignored; never commit them). Use `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-pay-data/` for pid files and scratch.
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
  Report your worktree path and commit SHAs. Run `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-pay-data` before committing screenshots.
- **Tests first.** Encode each finding as a failing test where you can (a unit test in test/*.test.js, or an e2e test in a NEW file test/e2e/fix-pay-data.e2e.js registered in scripts/e2e.js), then fix it.
