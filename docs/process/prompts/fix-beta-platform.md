You are the data loading, server, chart and map for the beta boards fixer for melon-seek (repo at /home/user/melon-seek, branch claude/stoic-ride-54ddxp). It is a zero-build vanilla ES-module app. Read docs/CONTRACT.md, docs/strategy/ROADMAP.md §8 (the UI simplicity budget), docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md and the findings you are given below, with the sections they come from.

**Fix these findings for target `beta`:** D-20, DQ-7, D-29, M-23 (map and chart side), the chart side of shared decision 1, and the links-policy test isolation. Each one is listed below with its repro steps and the test that encodes it, where there is one:

Sources: docs/process/data-check-beta.md (DQ-n, with posting ids and URLs; its red to-do tests are in test/beta-data-check.test.js), the "Full QA pass (desktop, beta) 2026-10-10" (D-17 to D-30, tests in test/e2e/beta-desktop-qa.e2e.js) and "Full QA pass (mobile, beta) 2026-10-10" (M-19 to M-27, tests in test/e2e/beta-mobile-qa.e2e.js) sections of docs/QA.md.

- **D-20:** server mode with `MELON_CHANNEL=beta` serves demo data for every big-tech board (Apple gets 80 generated roles), because the server never reads data/beta/snapshots/ (server/index.js SNAPSHOT_DIR, readSnapshot, publicError). Read beta snapshots the way scripts/build-static.js does (MELON_BETA_SNAPSHOT_DIR, default data/beta/snapshots/, then MELON_SNAPSHOT_DIR). A beta company with no snapshot is "not available yet", never demo data.
- **DQ-7: never show demo data under a real company's name.**
  - When a company's list fails to load, the beta site shows 80 generated "Apple" roles (CONTRACT v3: "never demo data").
  - Stable sites fall back to the shipped `api/demo/<slug>.json` with the false note "no real snapshot was bundled".
  - Every build ships a demo fallback list plus one description file per demo posting for every stable company (773 files across 8 companies; the beta copy ships them again).
  - Decide the honest behaviour, document it in docs/CONTRACT.md (you may edit the static-mode section), and make the DQ-7 to-do tests pass: a failed load is an error state with Retry, never demo postings. Drop the demo payloads from the build if nothing honest needs them. Demo mode for "Add board" stays, clearly labelled as demo.
- **D-29:** the Ranges tooltip repeats code-only currencies: "PLN 345K – PLN 702K PLN" (also CHF and CZK) (chart.js showJobTip).
- **M-23:** map pins cap at "999+", though the Cupertino cluster holds 4,460 roles (map.js pinElement, lines 404/413; chart.js line 598). Show "4.5K"-style counts, with the exact count in the accessible name.
- **Shared decision 1, chart side:** "Group by Seniority" groups by `displayLevel(job)` (from public/features/roles.js; the app lane adds it). Until it lands in your worktree, write `typeof displayLevel === 'function' ? … : job.seniority`, or import it once it exists. Coordinate through the contract only.
- **Links-policy test isolation:** test/links-policy.test.js builds a temporary dist but reads the real data/beta/snapshots through ROOT. With beta data present, that build takes over a minute and times out under load. Point its beta and stable snapshot dirs at empty or fixture folders, so the test is fast and does not depend on local data.
- **Note:** a later performance pass will own api.js, unpack-worker.js and build-static.js for Apple's 2.52 MB list. Keep your changes there minimal and behaviour-focused.


**You own these files:** public/api.js, public/unpack-worker.js, scripts/build-static.js, server/index.js, public/viz/chart.js, public/viz/map.js, public/viz/viz.css, test/links-policy.test.js (isolation only), and your own new tests.
**Do NOT edit:** public/app.js, public/index.html, public/styles.css, public/features/** (the app lane), server/sources/**, server/geo.js, server/salary.js, server/keywords.js, server/normalize.js (the sources and pay lanes). Other agents own them right now. If a fix needs a change there, write it as a patch to docs/process/patches/fix-beta-platform-<name>.diff, with a line in your report saying why. Don't edit docs/QA.md either; record your work in your own log.

**Rules:**
- Keep the UI simple. Add no new visible control unless the finding cannot be fixed any other way, and say so if you add one.
- Use plain words. No abbreviation a job seeker would not know.
- Keep desktop density. Phone-only rules go in the phone media queries.
- A fix for one target must not break the other. Run the checks against both `/melon-seek/` and `/melon-seek/beta/`.
- Never `pkill -f` or `pgrep -f`; keep server pids in pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-platform/.
- Never run `playwright install`. Use NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules; Chromium is /opt/pw-browsers/chromium-1194/chrome-linux/chrome.

**Worktree lanes** (the usual case): you run in your own git worktree. Symlink `node_modules` and `data/snapshots` from /home/user/melon-seek. Its `dist/`, builds and e2e runs are yours. Commit locally with explicit paths and never push; report the worktree path and commit SHAs. The rest of this paragraph applies only to a lane that shares the main checkout.

**Builds:** build into your own folder, `node scripts/build-static.js --out /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-platform/dist`, and serve it with `node scripts/cycle/serve.mjs --dist /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-platform/dist --pid /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-platform/serve.pid`. Other lanes run at the same time, so never write the shared dist/. The e2e tests that read dist/ use the lead's build; the lead re-runs the whole suite on the integrated batch.

**Verify with all of these:**
- `npm test`, all green.
- The full e2e suite, `NODE_PATH=... node scripts/e2e.js`, with no new failures. The red tests for your findings must now pass.
- Before and after screenshots for every visible change, in docs/screenshots/fix-beta-platform/.
- Desktop at 1440x900 and phone at 390x844 show no regressions.
Timing tests (PERF-1, V15, Compstimate T21) can fail when the machine is busy. Re-run them alone before calling them failures.

Write docs/process/fix-beta-platform.md following docs/process/TEMPLATE.md: per finding, the root cause, the fix (file:line) and how it was verified. Save your prompt verbatim to docs/process/prompts/fix-beta-platform.md.

Never push; the lead integrates and pushes. In a worktree lane, commit locally; in the shared checkout, don't commit. Report: the findings fixed, any you couldn't fix and why, the test results, the files changed, and the patches you wrote.


**How this wave works (lead, 2026-10-10, beta fix wave):**
- You run in your OWN git worktree, created by the harness from the current head (it includes persona fix batches 1 and 2). Its `dist/` is yours. First run:
  - `ln -s /home/user/melon-seek/node_modules node_modules`;
  - `mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots`.

  These are gitignored; never commit them. Use `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-platform/` for pid files and scratch.
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
  Report your worktree path and SHAs. Shrink screenshots with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-beta-platform` before committing them.
- **Tests.** The red tests for your findings already exist: [D-n] and [M-n] e2e tests, and to-do DQ tests. Make them pass. Remove `TODO` from each DQ test you fix, and don't weaken any test. Add a test where a finding has none.
- **Before you report, run the whole `npm test`.** Docs are tested too (for example, a hand-written "Typically within ±N%" in docs/QA.md fails a refresh test unless it reads "e.g.").
