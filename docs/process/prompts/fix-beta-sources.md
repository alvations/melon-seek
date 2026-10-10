You are the big-tech sources and locations fixer for melon-seek (repo at /home/user/melon-seek, branch claude/stoic-ride-54ddxp). It is a zero-build vanilla ES-module app. Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (the UI simplicity budget), docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and the findings you are given below, with the sections they come from.

**Fix these findings for target `beta`:** DQ-2, DQ-4, DQ-9, DQ-10, DQ-11, DQ-12, DQ-16, D-23 (data side), D-24. Each one is listed below with its repro steps and the test that encodes it, where there is one:

Sources: docs/process/data-check-beta.md (DQ-n, with posting ids and URLs; its red to-do tests are in test/beta-data-check.test.js), the "Full QA pass (desktop, beta) 2026-10-10" (D-17 to D-30, tests in test/e2e/beta-desktop-qa.e2e.js) and "Full QA pass (mobile, beta) 2026-10-10" (M-19 to M-27, tests in test/e2e/beta-mobile-qa.e2e.js) sections of docs/QA.md.

- **DQ-2 (high) Apple lists one requisition once per location**, and each copy lists every city: 827 requisitions produce 1,223 extra copies, and in 393 of them the same city shows two pay ranges. Collapse copies into one posting per requisition with all its locations, and keep the pay that belongs to each location (in `salary.ranges` if the copies differ), so a city never shows two ranges. Report the before and after counts. The DQ-2 to-do test must pass.
- **DQ-4: 670 paid postings get no Juice** because their city has no record: Apple "San Francisco Bay Area", Beaverton, Culver City and Waltham; Netflix Los Gatos; Google San Bruno; Microsoft and NVIDIA Hillsboro. Add them as `nearby` aliases of a covered city (as the existing entries do) where that is honest. Report the count before and after.
- **DQ-9:**
  - Apple store names become map pins at the US centroid (124).
  - About 49 corporate roles are marked Part-time.
  - 19 links are double-encoded.
- **DQ-10 / D-23 (data side):**
  - "Seoul, Korea, Republic of" gives a phantom "Republic of" location (Apple 24, Netflix 18).
  - Bare country codes ("ES", "NO", "KW", "PT") show as place names.
  - Local-script or abbreviated cities ("ב"ש", "ק"א", "กทม", "HKI") and Apple's "City-CC" strings ("Klang Valley-MY", "Xi'an-CN") don't resolve.

  Resolve them to real places and canonical English names.
- **DQ-11:** 61 talent pools or general applications are listed as openings. Mark them so the app can label them (add `job.pool: true`, documented in docs/CONTRACT.md as an added field; the app lane will label it). Report how you detect them, and the false-positive check.
- **DQ-12:** 60 NVIDIA postings that NVIDIA tags as hybrid are marked remote (eightfold.js workLocationOption).
- **DQ-16:** 4 Google titles show "&amp;". Decode the entities.
- **D-24:** every Google role is "No department", so the default chart is one row. Find a department or team in the Google record (brand, categories, or the jobs sitemap) and map it. If Google exposes none, say so.
- Note: the pay-data lane's DQ-1 fix landed in server/geo.js in batch 2. Don't regress its tests (test/fix-pay-data.test.js, and the DQ-1 tests in test/beta-data-check.test.js).


**You own these files:** server/sources/apple.js, server/sources/google.js, server/sources/eightfold.js, server/sources/polite.js, server/geo.js, data/cities.json (nearby aliases and city records only; keep the registry fields), docs/DATA_SOURCES.md §7 (adapter facts, not §7a pay rules), and your own new tests.
**Do NOT edit:** server/salary.js, server/keywords.js, server/normalize.js, scripts/vet-salaries.js (the pay lane), public/** (the app and platform lanes), server/index.js and scripts/build-static.js (the platform lane). Other agents own them right now. If a fix needs a change there, write it as a patch to docs/process/patches/fix-beta-sources-<name>.diff, with a line in your report saying why. Don't edit docs/QA.md either; record your work in your own log.

**Rules:**
- Keep the UI simple. Add no new visible control unless the finding cannot be fixed any other way, and say so if you add one.
- Use plain words. No abbreviation a job seeker would not know.
- Keep desktop density. Phone-only rules go in the phone media queries.
- A fix for one target must not break the other. Run the checks against both `/melon-seek/` and `/melon-seek/beta/`.
- Never `pkill -f` or `pgrep -f`; keep server pids in pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-sources/.
- Never run `playwright install`. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

**Worktree lanes** (the usual case): you run in your own git worktree. Symlink `node_modules` and `data/snapshots` from /home/user/melon-seek. Its `dist/`, builds and e2e runs are yours. Commit locally with explicit paths and never push; report the worktree path and commit SHAs. The rest of this paragraph applies only to a lane that shares the main checkout.

**Builds:** build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-sources/dist`, and serve it with `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-sources/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-sources/serve.pid`. Other lanes run at the same time, so never write the shared dist/. The e2e tests that read dist/ use the lead's build; the lead re-runs the whole suite on the integrated batch.

**Verify with all of these:**
- `npm test`, all green.
- The full e2e suite, `NODE_PATH=... node scripts/e2e.js`, with no new failures. The red tests for your findings must now pass.
- Before and after screenshots for every visible change, in docs/screenshots/fix-beta-sources/.
- Desktop at 1440x900 and phone at 390x844 show no regressions.
Timing tests (PERF-1, V15, Compstimate T21) can fail when the machine is busy. Re-run them alone before calling them failures.

Write docs/process/fix-beta-sources.md following docs/process/TEMPLATE.md: per finding, the root cause, the fix (file:line) and how it was verified. Save your prompt verbatim to docs/process/prompts/fix-beta-sources.md.

Never push; the lead integrates and pushes. In a worktree lane, commit locally; in the shared checkout, don't commit. Report: the findings fixed, any you couldn't fix and why, the test results, the files changed, and the patches you wrote.


**How this wave works (lead, 2026-10-10, beta fix wave):**
- You run in your OWN git worktree, created by the harness from the current head (it includes persona fix batches 1 and 2). Its `dist/` is yours. First run:
  - `ln -s /home/user/melon-seek/node_modules node_modules`;
  - `mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots`.

  These are gitignored; never commit them. Use `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-sources/` for pid files and scratch.
- Three other lanes work in parallel on other files. Shared decisions:
  1. **Where a level came from.** The pay lane adds `job.seniorityBasis: 'title' | 'pay' | 'default'` in server/normalize.js: the title named the level, the pay sentence did (Microsoft "IC6"), or it is the default. A company ladder rung that means mid-level (Google "III", Netflix "L4") is stored as 'Mid' with basis 'title'.
     The app lane adds `displayLevel(job)` to public/features/roles.js: it returns 'Not stated' for `seniority === 'Mid'` with basis 'default' or missing, and the stored level otherwise. `levelLabel('Not stated')` is "Level not stated", and `levelLabel('Mid')` is "Mid".
     Everything that shows or groups levels to people uses displayLevel: cards, filters, the chart and saved-search names. Stored data keeps 'Mid'.
  2. **Pay by level.** The pay lane adds `salary.levels?: [{ label, min, max }]` (annual, in the salary's currency) when one posting prices several levels (NVIDIA "Level 4 … Level 5", Microsoft "IC4 … IC5"). min and max stay the overall span. The app lane renders the levels in the pay block in plain words.
  3. **The Beta tag** (D-27, D-28; CONTRACT v3 allows only "a small Beta tag by the logo"). The existing tag becomes a link to the main site. Its accessible name says it is the beta site and links back, and the page title reads "melon·seek beta". No other new control.
  4. Keep every existing export's signature and return shape. Adding fields is fine.
- **Commits.** Commit locally in your worktree with explicit paths, ending the message with the two lines below. Never push.
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc
  ```
  Report your worktree path and SHAs. Shrink screenshots with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-beta-sources` before committing them.
- **Tests.** The red tests for your findings already exist: [D-n] and [M-n] e2e tests, and to-do DQ tests. Make them pass. Remove `TODO` from each DQ test you fix, and don't weaken any test. Add a test where a finding has none.
- **Before you report, run the whole `npm test`.** Docs are tested too (for example, a hand-written "Typically within ±N%" in docs/QA.md fails a refresh test unless it reads "e.g.").
