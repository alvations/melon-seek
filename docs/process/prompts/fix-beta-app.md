You are the app shell for the beta boards fixer for melon-seek (repo at /home/user/melon-seek, branch claude/stoic-ride-54ddxp). It is a zero-build vanilla ES-module app. Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (the UI simplicity budget), docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and the findings you are given below, with the sections they come from.

**Fix these findings for target `beta`:** D-18, D-19 / M-22, D-21 (display), D-23 (app side), D-25 / M-21, D-26, D-27, D-28, M-19, M-20, M-23 (app side), M-24, M-25, M-26, M-27, and shared decisions 1 to 3. Each one is listed below with its repro steps and the test that encodes it, where there is one:

Sources: docs/process/data-check-beta.md (DQ-n, with posting ids and URLs; its red to-do tests are in test/beta-data-check.test.js), the "Full QA pass (desktop, beta) 2026-10-10" (D-17 to D-30, tests in test/e2e/beta-desktop-qa.e2e.js) and "Full QA pass (mobile, beta) 2026-10-10" (M-19 to M-27, tests in test/e2e/beta-mobile-qa.e2e.js) sections of docs/QA.md.

- **D-18:** a search saved on a board with more than 2,000 matches shows "N new" at once ("Apple · On-site · 4105 new"), because toggleSave keeps only the first 2,000 ids. Make "new" correct at any size, compactly: for example a first-seen time, or a hash set.
- **D-19 / M-22:** beta and the main site share one origin.
  - Beta saved searches appear on the main site, and opening one gives "No data · Unknown company "apple" · Offline · Retry".
  - A link to a paused or unknown board (`#c=meta`, `#c=amazon`, `#c=tesla`) shows a red "Offline" badge and a Retry that can never work.
  - Keep each site's saved searches to itself (or show beta ones only with a link to /beta/).
  - An unknown or paused company gets a plain message ("This board isn't on this site", with a link to the right site where there is one), with no Offline badge and no Retry.
- **D-21 (display):** render `salary.levels` in the pay block, e.g. "Level 4: $168K–264.5K · Level 5: $196K–310.5K". Replace the bare "Multiple pay zones" for those postings.
- **D-23 (app side):** the Location filter's "Unknown Region" heading (countryName('ZZ')) needs a plain label, such as "Other places".
- **D-25 / M-21:** the company menu files the five big-tech boards last, below the fold, and opens without the current board in view. Group them sensibly and scroll the current board into view.
- **D-26:** the top-bar Refresh says "Refresh from the live board" on snapshot-only boards.
- **D-27 / D-28:** shared decision 3.
- **M-19:** changing the sort or a filter while scrolled down keeps the old scroll position, so the top results are hidden. Scroll the list to the top on a new result set.
- **M-20:** the results list keeps adding cards and never removes any (30,585 DOM nodes after 2,000 Apple cards; swipe frames 83–133 ms; sort 0.8–0.9 s at 4x CPU). Window it, keeping only the cards near the viewport in the DOM, while keeping keyboard navigation, focus, "Show more" semantics and screen-reader counts correct.
- **M-23 (app side):** "1 of 6105" needs a thousands separator. The platform lane fixes the map pins' "999+".
- **M-24:** with the keyboard up, the Location and Department search boxes scroll to mid-screen, and the first match sits under the keyboard (bindKeyboardInsets uses scrollIntoView with block 'center').
- **M-25:** touch targets under 44 px: the filter-sheet Remote segment is 32 px, the Juice "How it's calculated" link 15 px, and 38 Market insights rows are 26 px. M-8 is still partly open (Pay|Juice 26 px, the Remote badge 32 px).
- **M-26:** tapping Filters after a quick chip reopens the sheet at that chip's section, but focus goes to "Salary", about 1,900 px off-screen.
- **M-27:** batch 1's phone logo plus the Beta pill squeeze the company name to "Mic…" at 360 and 430 px, and the logo link is a 26 px tap target.
- **Shared decision 1:** add `displayLevel(job)` in roles.js and use it for cards, the Seniority filter, the drawer and saved-search names. Tell the platform lane's chart grouping how to call it; it is in the shared contract.
- **DQ-11 label:** if a job has `job.pool === true` (the sources lane adds it), show "General application (no specific opening)" on the card and in the drawer.


**You own these files:** public/app.js, public/index.html, public/styles.css, public/features/** (roles.js for displayLevel, features.css), and your own new tests.
**Do NOT edit:** public/api.js, public/unpack-worker.js, public/viz/**, server/index.js, scripts/build-static.js (the platform lane), server/** (the sources and pay lanes). If you need a change there, write a patch. Other agents own them right now. If a fix needs a change there, write it as a patch to docs/process/patches/fix-beta-app-<name>.diff, with a line in your report saying why. Don't edit docs/QA.md either; record your work in your own log.

**Rules:**
- Keep the UI simple. Add no new visible control unless the finding cannot be fixed any other way, and say so if you add one.
- Use plain words. No abbreviation a job seeker would not know.
- Keep desktop density. Phone-only rules go in the phone media queries.
- A fix for one target must not break the other. Run the checks against both `/melon-seek/` and `/melon-seek/beta/`.
- Never `pkill -f` or `pgrep -f`; keep server pids in pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-app/.
- Never run `playwright install`. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

**Worktree lanes** (the usual case): you run in your own git worktree. Symlink `node_modules` and `data/snapshots` from /home/user/melon-seek. Its `dist/`, builds and e2e runs are yours. Commit locally with explicit paths and never push; report the worktree path and commit SHAs. The rest of this paragraph applies only to a lane that shares the main checkout.

**Builds:** build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-app/dist`, and serve it with `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-app/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-app/serve.pid`. Other lanes run at the same time, so never write the shared dist/. The e2e tests that read dist/ use the lead's build; the lead re-runs the whole suite on the integrated batch.

**Verify with all of these:**
- `npm test`, all green.
- The full e2e suite, `NODE_PATH=... node scripts/e2e.js`, with no new failures. The red tests for your findings must now pass.
- Before and after screenshots for every visible change, in docs/screenshots/fix-beta-app/.
- Desktop at 1440x900 and phone at 390x844 show no regressions.
Timing tests (PERF-1, V15, Compstimate T21) can fail when the machine is busy. Re-run them alone before calling them failures.

Write docs/process/fix-beta-app.md following docs/process/TEMPLATE.md: per finding, the root cause, the fix (file:line) and how it was verified. Save your prompt verbatim to docs/process/prompts/fix-beta-app.md.

Never push; the lead integrates and pushes. In a worktree lane, commit locally; in the shared checkout, don't commit. Report: the findings fixed, any you couldn't fix and why, the test results, the files changed, and the patches you wrote.


**How this wave works (lead, 2026-10-10, beta fix wave):**
- You run in your OWN git worktree, created by the harness from the current head (it includes persona fix batches 1 and 2). Its `dist/` is yours. First run:
  - `ln -s /home/user/melon-seek/node_modules node_modules`;
  - `mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots`.

  These are gitignored; never commit them. Use `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-app/` for pid files and scratch.
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
  Report your worktree path and SHAs. Shrink screenshots with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-beta-app` before committing them.
- **Tests.** The red tests for your findings already exist: [D-n] and [M-n] e2e tests, and to-do DQ tests. Make them pass. Remove `TODO` from each DQ test you fix, and don't weaken any test. Add a test where a finding has none.
- **Before you report, run the whole `npm test`.** Docs are tested too (for example, a hand-written "Typically within ±N%" in docs/QA.md fails a refresh test unless it reads "e.g.").
