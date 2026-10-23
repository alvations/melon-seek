# Process log: qa-suite-beta (test-suite QA, target `beta`, 2026-10-23)

## State
- **Done:**
  - the brief, saved verbatim (f06c2f8);
  - **npm test, CI-like, 3 runs** on 6038890 (= 05263e8 plus this log), §5;
  - the coverage map (§4) and the phone-size matrix (§4.3);
  - **T-12, the browser "crash": root cause found and reproduced.** The e2e process gets a signal (SIGTERM or
    SIGHUP), Playwright closes Chromium and the run carries on (§7). The fix is the core of the runner patch;
  - new files:
    - `test/beta-coverage.test.js`, 14 tests: 7 guards, 6 [T-n] to-dos and 1 real-data check. In CI: 7 pass,
      2 skipped, 5 to-dos, 0 fail;
    - `test/e2e/beta-coverage.e2e.js`, 32 tests: 4 desktop tests, 7 per board and 21 per phone size, registered in
      scripts/e2e.js;
  - the 12 patches in `docs/process/patches/qa-suite-beta-*.diff` (§11):
    - the runner: signals, --shard, --list, --max-skips, failure durations, links registered;
    - T-1, T-4 and T-11 (state waits: the same results, 44% less time);
    - six flake fixes;
    - the CI workflow;
  - on the lead's 5c0cda3 build, with the runner and T-1 patches: my group plus the three T-1 groups pass 75/75;
  - the coverage group: 28/30 on its third run, and both failures were my test's own wait (fixed);
  - the stress runs: originals fail every run, patched 0 of 9;
  - a with-data `npm test` (`runs/unit-data-1`, 271 s, load 11–17): 1,262 tests, 1 fail (my own guard, fixed), and
    no vacuous pass found (§9.3);
  - the patches checked on a copy of 5c0cda3 with the runner and T-1 patches applied: my [T-1], [T-5], [T-9] and
    [T-10] to-dos pass there.
- **In progress:** the lead's gate run on 5c0cda3, sampled every 30 s (`<scratch>/qa-suite-beta/mem-gate.jsonl`).
  At 14:29 it was at test 616 of 864, with only T21 failed so far.
- **Next:**
  1. the red-by-design list from the gate log (`<scratch>/gate/e2e.log`);
  2. the one full e2e run, instrumented (`tools/instrument.mjs`), on the landed head;
  3. regenerate the runner patch on that head;
  4. write out the CI patch and the expected-red list;
  5. the final report.
- **Waiting on:** the lead's message that fix wave 5's last batch has landed. Then I move to that head and rebase my
  four files and the scripts/e2e.js registration onto it.
- **Scratch:** `<scratch>/qa-suite-beta/`, where `<scratch>` is
  `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad`. It holds:
  - `tools/`: the log and TAP summarisers, the memory sampler, the instrument preload, the runners, the probes and
    the signal repro;
  - `runs/`: the npm test TAP and spec outputs;
  - `dist/`: my build, linked as `dist` in the worktree and never committed;
  - `clean/`: the CI-like checkout;
  - `patchwt/`: the worktree the patches are made in;
  - `pshard/`: the lead-head copies the runner patch is made against.

## 1. Brief
- Prompt (verbatim): [prompts/qa-suite-beta.md](prompts/qa-suite-beta.md).
- Goal: make sure `npm test` and `node scripts/e2e.js` actually protect `/melon-seek/beta/` (Amazon, Apple, Google,
  Meta, Microsoft, NVIDIA, Netflix) and Anduril on the main site. Find what the tests miss, why the full e2e takes over
  2 hours, why its browser closes near test 750, which red-by-design tests can never pass, and what CI should run.
- Files owned: this log, the prompt, `test/e2e/beta-coverage.e2e.js` (registered in scripts/e2e.js),
  `test/beta-coverage.test.js`, and `docs/process/patches/qa-suite-beta-*.diff`.

## 2. Inputs and sources
- **Read:**
  - docs/QA.md and docs/process/qa.md (the suite's design: a hand-rolled runner, checks against the data, `skip()`
    for missing data), scripts/e2e.js, test/e2e/harness.js, package.json and .github/workflows/ci.yml;
  - webkit-phone.yml, pages.yml and workflows.test.js;
  - docs/process/PLAYBOOK.md and TEMPLATE.md;
  - docs/process/lead.md from "Fix wave 5" on, the test sections of qa-mobile-beta-4.md and qa-desktop-beta-4.md
    (on 5c0cda3), and the cycle templates (desktop-qa.md, mobile-qa.md: the feature lists).
- **Lead head 5c0cda3** (not on origin yet; it carries 9fa0ab2, the relaunch) was read from git objects: the e2e
  files there have 864 tests. Origin head 05263e8 has 746 (`tools/list-tests.mjs` registers every group with a stub
  suite and lists the names without running anything).
- **Run logs (read-only):**
  - Complete full runs: fps/e2e-full3.log (766 tests, 2026-10-17 15:16) and fv5/e2e-full.log (762 tests, 15:12).
  - Runs that ended with "browser has been closed": fv5/e2e-fullA.log, fpt/full-after-rerun.log,
    qa-desktop-beta-4/e2e-full.log, fd3/e2e-full.log and fps/e2e-matrix-suite2.log, all in the scratchpad.
  - The lead's two gate logs were deleted by the gate script (`rm -f $G/*.log`). The lead gave their facts:
    - fbdad58: the browser closed at test 771 of 856;
    - e57151f: timed out at 90 min after 792 tests;
    - both runs ended at the lead's own `timeout 5400` (exit 124).
  - The lead's gate on 5c0cda3 (`<scratch>/gate/e2e.log`), read as it grew.
- **Source code read:** playwright-core 1.56.1 `lib/server/utils/processLauncher.js`, the signal handlers (§7).
- **Data:** the 2026-10-16 crawl the lead linked: Amazon 22,179, Apple 4,851, Google 3,821, NVIDIA 2,711,
  Microsoft 2,435, Meta 1,208, Netflix 414; Anduril 2,537. My build: `node scripts/build-static.js --out
  <scratch>/qa-suite-beta/dist` (7/7 beta companies, 51 s, load 9).

## 3. Findings, ordered by risk
Severity: **High** means a real bug or a whole feature untested. **Medium** means a flake or a gap that hides
regressions. **Low** means speed or tidiness.

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| T-12 | High | **The browser does not crash.** The e2e process gets SIGTERM or SIGHUP: from `timeout 5400` (both 10-17 gate runs, exit 124), a tool's 2-hour background limit, or a paused or stopped session. Playwright's launch handlers then close Chromium and let node run on, so every later test fails "Target page, context or browser has been closed". 9fa0ab2's relaunch now turns a SIGTERM into 2 failed tests and a run that ignores its time limit | §7: playwright-core's handlers; the crashed logs show Playwright's own `<gracefully close start>`; reproduced with `kill -TERM` on 05263e8 and on 5c0cda3 | runner patch: launch with `handleSIGTERM/handleSIGHUP/handleSIGINT: false`; scripts/e2e.js traps the three signals, stops before the next test, prints the partial summary and the number of tests not run, and exits 143/129/130; relaunch only after a `disconnected` event no signal caused. Verified: SIGTERM stops in 1 s with exit 143, SIGHUP with 129 |
| T-14 | High | **The e2e suite runs nowhere in CI**, and CI's `npm test` has no data, so every data-dependent unit check skips there. webkit-phone.yml (manual) runs 6 groups | ci.yml; §10 | `qa-suite-beta-ci-e2e.diff`: e2e.yml, 4 shards on the archived crawl, with a summary that fails only on unexpected failures |
| T-1 | High | **Amazon and Meta were never in three "every big-tech board" lists**: BIG_TECH in beta-desktop-qa.e2e.js, beta-desktop-qa-2.e2e.js and beta-mobile-qa.e2e.js (plus that file's `names`). So bundle-only + badge + CSV (mobile), Apply host, share pages, the heap check while switching, and desktop QA 2's per-board loop never ran on the two boards added on 2026-10-11 | `[T-1]` to-do in test/beta-coverage.test.js reads the lists | `qa-suite-beta-t1-board-list.diff`: one source, test/e2e/beta-boards.mjs (the registry's non-paused beta boards). Patched run, all seven boards: everything passes except the mobile CSV count on Meta. That is the test's naive line count meeting T-17; the patch counts records |
| T-2 | High | The pay filter (minimum, maximum, "only with pay") was tested only on Anthropic (ui.e2e.js). On beta (several currencies, a range per place, hourly, minimums) nothing checked that it shows the right roles | coverage map §4 | new: `Beta coverage: [<board>] the pay filter …` (7 tests). All seven pass: counts equal the data's approx-USD pay, and no listed card is below the bound |
| T-3 | Medium | The sorts on beta were checked only as "the first card changed" (beta-mobile-qa) | beta-mobile-qa.e2e.js sort loop | new: Highest pay, Lowest pay, Most juice and Title A–Z orders checked against the data on all seven boards; pass |
| T-5 | Medium | A board missing from the build turns its tests into skips, and the run stays green. beta-gate.sh can drop a board and still exit 0, and the post-deploy check of /beta/ is warning-only | beta-build.test.js ("moves only that snapshot out; always exits 0"); every beta group calls `skip('no <slug> list in this build')` | new e2e test: every registry beta board is in the build, with its count on screen = its list = its CSV records, and fails rather than skips. New unit check: snapshot count = build count = preview total. Runner patch: `--max-skips=n` |
| T-13 | Medium | Timing tests fail under load: S-6, S-3 (6 tests), PERF-1, V15, T21, the politeRequest spacing | §6 (runs and stress) | five patches: CPU time, not wall time (S-3, S-6, PERF-1, V15, T21), and a virtual clock for the spacing tests |
| T-4 | Medium | test/e2e/links.e2e.js (README and docs links; every in-app link, share page and job URL) was never registered. Registered, the in-app crawl is clean and the markdown check fails on 17 links: 11 site-relative links in METHODOLOGY_GUIDE.md (by design: it is rendered as /methodology/) and 6 in "Section for docs/QA.md" blocks pasted into three process logs (relative to docs/) | patched run | registration in the runner patch; `qa-suite-beta-t4-link-check.diff` maps both kinds (0 broken, 2,012 links) |
| T-6 | Medium | No test of "title matches rank first" on a beta board | coverage map | new test (Amazon, Apple, Google); passes |
| T-7 | Medium | No deep link / reload / Back / Forward test on beta | coverage map | new test on Amazon; passes |
| T-8 | Medium | Phone flows were not run at every size: open a job page by a real tap, close it with its Back button and with the browser's Back, and a filter row's "Show N roles". The matrix opens the job page with `.click()` in the page | §4.3 | new: one test per size in phone-sizes.mjs (21), a different board at each in turn |
| T-16 | Medium | The Listed filter and the Juice grade filter were untested on beta | coverage map | new: Listed against each posting's age; each grade against its own count, with the grades summing to "N have a Juice Score"; pass on all seven |
| T-17 | Low | Data: 3 titles hold a line break (Meta 1, Amazon 2: "Partner Development Manager\n, Benelux Partner Team"). Cards read "Manager , Benelux", and a CSV reader that splits lines counts an extra row | `[T-17]` to-do (real data) | the lead: fix-mr-3 (server/normalize.js) |
| T-11 | Low | Runtime: Fix phone text is 31% of a full run (85 guard walks of about 22 s, mostly fixed sleeps). Phone loops load Amazon's 22,179 postings about 130 times | §8 | `--shard` (4 × about 31 min); proposals in §8 |
| T-9 | Low | Failed e2e tests print no duration, so a run's time cannot be split by group | harness.js | runner patch |
| T-10 | Low | No `--shard` or `--list` | scripts/e2e.js | runner patch |
| T-15 | Low | Stale names: "Apple (6,105 roles)" in 2 test names (Apple has 4,851) and "1 of 6,105" in another; "Amazon (22,179 roles)"; "paused and absent companies (Meta, Amazon, Tesla)" (both resumed). Their assertions use the data, so only the names mislead | grep | renamed in the T-1 patch (the paused test); the rest are listed in §9 |

## 4. Coverage map
### 4.1 User-facing features of `beta` (feature list of prompts/cycle/desktop-qa.md and mobile-qa.md)
"Beta" names a test that runs on /melon-seek/beta/ with a big-tech board; "main" names one that runs only on the main
site's boards. Every file is in `test/e2e/`; **new** marks this pass's `beta-coverage.e2e.js`.

| Feature | Covered on beta by | Main site only / gap |
|---|---|---|
| Company menu search and switch | beta-mobile-qa: switching between the big boards keeps the JS heap bounded; [M-21]; beta-mobile-qa-2 [M-28]–[M-30]; fix-company-scroll (3 sizes) | — |
| Recent pills | none | main: ui "company menu switches to Anduril and OpenAI (… recents become pills)" |
| Add board (custom board) | none | main: ui "custom board via Add board loads jobs" |
| Search, title matches first | **new** "a search lists the roles whose title (or team) has the word before …" (Amazon, Apple, Google) | before this pass: placeholder only (UX-21) |
| Pay filter: minimum, maximum, only with pay | **new** `[<board>]` × 7 | before: main only (ui "salary min filter narrows list", Anthropic) [T-2] |
| Department, Location, Seniority, Remote | beta-desktop-qa "Apple facet counts stay consistent", [D-23]; fix3-app [BP-6], [BP-17]; beta-desktop-qa-2 "fix wave 3 holds" (all 7 boards with the T-1 patch); fix-phone-controls [M-40] | — |
| Responsibilities, Fit and Skills chips | beta-desktop-qa (ks=, Apple) | — |
| More: employment type | fix-phone-controls [A-10] (names only) | the count is unchecked on beta |
| More: Listed | **new** `[<board>]` × 7 | before: main only (ui "Listed … round-trips") [T-16] |
| More: Juice grades | **new** `[<board>]` × 7 | before: main only (desktop-qa "picking a facet gives exactly its count") [T-16] |
| Clear all, faceted counts | beta-desktop-qa "Apple … Clear all restores the board"; beta-mobile-qa / -3 "Show N roles equals the result count" | — |
| Sorting (every option) | **new** `[<board>]` × 7 (order against the data) | before: "the first card changed" only [T-3] |
| Chart: Clusters, Ranges, Group by, chip | beta-viz-review, beta-viz-review-2, viz-even, fix-viz-5, google-grouping, beta-mobile-qa-3 (stacked row tap), fix-density | — |
| Chart: hover, keyboard, overflow | beta-viz-review [V-29]; fix-touch-tips; beta-a11y-2 [A-8] | — |
| Map: pins, tooltips, Pay/Juice, Remote, zoom | fix3-viz [map]; beta-desktop-qa-2 [D-31], "map Remote control equals the Remote filter"; beta-mobile-qa "Apple map: one-finger pan and pinch"; beta-viz-review [V-28]; fix-viz-5 [M-50] | — |
| Insights: Compstimate | fix-estimates (static /beta/), beta-mobile-qa-3 [M-34], [M-47]; fix-phone-controls [M-47] (every size); fix-pay-at-place [V-40] | the 23 "Compstimate: T*" tests are main only |
| Insights: Market insights, Compare companies | fix-estimates; fix3-compare; fix-pay-at-place [V-40] | — |
| Job page: pay block, honest labels, Pay unclear | beta-desktop-qa [D-21]; fix-beta-app; fix-pay-at-place; beta-desktop-qa-4 [D-50]; fix-qa4 | — |
| Job page: Juice waterfall, household | beta-desktop-qa-2 "the Juice waterfall adds up …"; beta-viz-review [V-30], [V-32]; fix-touch-tips | — |
| Job page: Same role elsewhere, Back | fix3-compare [BP-3]; fix-touch-tips; beta-mobile-qa-3 [M-33] | Back from it: main only (ui, desktop-qa) |
| Job page: Listing, lazy description | beta-mobile-qa-3 [M-37]; fix-phone-text [M-37] | the lazy description load: main only (ui) |
| Job page: Apply link (the right host) | beta-desktop-qa "Apply opens each big-tech careers host" (5 boards; 7 with the T-1 patch); **new** Apply × 3 postings × 7 boards; fix-sec-3 [S-4] | — |
| Job page: Copy link, next/prev, Esc, focus | beta-mobile-qa-4 (prev/next); fix-phone-controls [A-11]; **new** Back button and browser Back at every size | Copy link: main only (desktop-qa) |
| Save search and "N new" | beta-desktop-qa [D-18], [D-19]; fix-beta-app [D-18], [D-19] | — |
| Download CSV | beta-mobile-qa (5 boards; 7 with T-1); **new** CSV records = roles on 7 boards + Anduril; fix-qa4 [D-49] | — |
| Theme toggle (persists) | dark-mode contrast tests (beta-a11y [A-4], beta-viz-review [V-23], [V-32]); fix-phone-text dark guards | the persistence across reload: main only (ui) |
| URL hash round trip, deep links, Back/Forward | **new** on Amazon | before: main only (ui) [T-7] |
| Share pages /beta/c/<slug>/ | beta-desktop-qa (5 boards; 7 with T-1), beta-desktop-qa-2 [D-37] | — |
| Keyboard shortcuts (/, t, j/k) | none | main only (desktop-qa "single-key shortcuts never fire while typing") |
| Data badge, popover, as-of | beta-desktop-qa; beta-mobile-qa; fix-beta-app; beta-mobile-qa-3 [M-39]; fix-phone-text [M-39] | — |
| Methodology links open on-site | beta-desktop-qa-2 [D-37]; links.e2e.js (never registered, T-4) | — |
| No console errors | most beta groups collect `pageerror`; fix-app "static build … no console errors" | — |
| Beta: says it is beta | beta-desktop-qa [D-27], [D-28]; fix-beta-app [D-26–28]; beta-mobile-qa [M-27] | — |
| Beta: bundle only, Snapshot not Live, no live request | beta-desktop-qa (5; 7 with T-1); beta-desktop-qa-3 (all 7); **new** | — |
| Beta: paused companies absent | beta-desktop-qa (reads the registry); beta-mobile-qa [M-22] | — |
| Beta: a big board stays responsive | beta-desktop-qa (Apple, 4 s budget); beta-mobile-qa / -3 (Apple, Amazon: filter and sort under 1 s; heap bounded) | — |
| Beta: links back to the main site | beta-desktop-qa [D-28]; fix-beta-app | — |
| Beta: spans over several levels labelled honestly | beta-desktop-qa [D-21]; fix-beta-app; beta-viz-review [V-20]; beta-mobile-qa-4 [M-48] | — |
| Phone: filter sheet, results sheet, text density, tap targets, keyboard, landscape | beta-mobile-qa 1–4, fix-phone-controls, fix-phone-text, fix-touch-tips, fix-company-scroll, phone-matrix, fix-density; §4.3 | — |

### 4.2 The data pipeline (npm test, `test/*.test.js`)
| Part | Covered by | Note |
|---|---|---|
| Adapters: Amazon, Apple, Google, Meta, Eightfold (Microsoft, NVIDIA, Netflix) | bigtech-sources (real recorded rows per board, fetch*: robots, paging, one detail per posting), amazon-meta-adapters, fix-beta-sources, incremental-boards.js (all seven in BOARDS) | fixtures only; CI never sees a real crawl |
| Greenhouse, Ashby, Lever (Anduril and the main site) | sources, perf-mobile*, static-build | — |
| Incremental crawl and closures | incremental-unit, incremental-closures, incremental-equivalence (full vs incremental, archive rebuilds lossless) | — |
| politeRequest (spacing, UA, robots, backoff) | bigtech-polite, polite-spacing, amazon-meta-adapters | the spacing tests are timing tests (T-13) |
| Normalizer | golden-normalize (300 real jobs, byte-identical hashes), fix-*-data, beta-data-check 1–3 | the golden set has no big-tech board |
| Salary parser | salary (39), bigtech-salary, salary-pipeline (SB-1…), salary-audit, fix-beta-pay, beta-vetting 1–2 | — |
| Vetting gate | vet-gate, beta-vetting 1–2, beta-build "betaGate drops the company", "beta-gate.sh … always exits 0" | the gate can drop a whole board silently (T-5) |
| Build: the channel split | beta-build (stable dist has no beta company, byte-for-byte the --no-beta build; beta dist; noindex; share pages; market), static-build, ci-lists | the real-data check that every posting reaches the build: **new** (skips in CI) |
| Archive ingest and rebuild | archive, archive-lossless, archive-reference, archive-report, archive-sweep | — |
| Crawl workflows | beta-build (snapshot.yml, pages.yml, site-watchdog.yml, beta-snapshots.mjs), workflows, archive-workflows, beta-security-review (V12), monthly-refresh-commit | static checks of the YAML; the crawls themselves run only on GitHub |

### 4.3 Phone features by size (21 sizes in phone-sizes.mjs on 5c0cda3, 19 on 05263e8)
Counted from the test names on 5c0cda3 (`tools/list-tests.mjs`). Groups that tag a size use its `name WxH`.

| Check | Sizes | Boards |
|---|---|---|
| Phone matrix: page fits, company name whole, controls on screen, first card, job page and filter sheet fit | 21/21 | apple, amazon, google |
| fix-phone-controls [M-43] preview tap opens the job page while Amazon loads | 21/21 + desktop | amazon |
| fix-phone-controls [M-40] department rows told apart | 21/21 + 1 extra landscape | amazon |
| fix-phone-controls [M-47] Pay estimate field above the keyboard | 21/21 + extra landscapes | — |
| fix-phone-text guard: captions one line, nothing cut | 21/21 (19 sizes, plus the 390 and 360 guards) | amazon, google at 19; all 7 at 390 and 360 |
| fix-qa4 [D-48], [D-50] | 21/21 | amazon, netflix |
| phone-matrix [UX-39] preview on the first screen | 18/21 (not the 3 desktop-layout postures) | amazon |
| fix-pay-at-place [phones] pill, place count, title fit | 17/21 (not the 4 landscapes) | — |
| Everything else (sheet drag and lazy list, map pan and pinch, chart tap, sort, company switch, Save, theme) | 1–3 sizes | — |
| **new** a real tap opens the job page, its Back button and the browser's Back close it, a filter row's "Show N roles" = its count = the list | 21/21 | one per size, all 7 in turn |

## 5. The runs
| # | Suite | Tree | Load (start → end) | Result |
|---|---|---|---|---|
| U1 | `npm test` CI-like (clean checkout, no links, `MELON_BETA_SNAPSHOT_DIR=`) | 6038890 | 6.0 → 10.8 | 1,242 tests: **1,188 pass, 1 fail**, 8 skipped, 45 to-dos (35 of them pass); 125 s. The fail is S-6, "median 29 ms per request" (limit 25) |
| U2 | the same | 6038890 | 10.8 → 8.4 | 1,189 pass, 0 fail, 8 skipped, 45 to-dos; 108 s |
| U3 | the same | 6038890 | 8.4 → 6.0 | 1,189 pass, 0 fail, 8 skipped, 45 to-dos; 90 s |
| E1 | full e2e, this pass's run (instrumented) | the landed head | — | **pending** |
| E2 | full e2e, fps/e2e-full3.log (fix-phone-sizes, 2026-10-17; stands in for the deleted gate log on fbdad58) | fix-phone-sizes lane | 7–10 (lane notes) | 766 tests: 745 pass, 16 fail, 5 skipped; 111 min of passing-test time |
| E3 | full e2e, fv5/e2e-full.log (fix-viz-5, 2026-10-17 15:12; stands in for the deleted gate log on e57151f) | fix-viz-5 lane | — | 762 tests: 735 pass, 21 fail, 6 skipped |
| E4 | full e2e, the lead's gate (`<scratch>/gate/e2e.log`) | 5c0cda3 | 15 → … | **running**; read for the red-by-design list (§9) |

Group runs of this pass (load at start):
- `Beta coverage`, three development runs: 13:36 (load 1.0), 13:48 (5.3) and 14:09 (9.5). The third: 28/30, and both
  failures were my test's own missing wait, since fixed.
- The T-1/T-4 patched groups, 13:52 (load 7): 42/46. The 4 failures were T21, the 2 Links tests and the mobile CSV
  count. All four pass after their patches (14:00, load 6.7).

## 6. Flakes (T-13): every failure in any run, with its cause
| Test | Runs where it failed (load) | Error | Root cause | Fix |
|---|---|---|---|---|
| S-6 /methodology/ not re-rendered | U1 (9–11); stress 5/5 at 12–24 | "median 29 ms per request" | wall-clock limit of 25 ms on a cached reply. A loaded machine stretches the wall time; the CPU cost is 4–7 ms (a render is 120 ms: `tools/s6-probe.mjs`) | `flake-s6-cpu`: the request's CPU time (this thread's, threadCpuUsage) < 25 ms, plus wall < 1 s |
| S-3 parse/geocode/normalize linear (6 tests) | stress 5/5 (2–6 of the 6 each run) | "N ms" over 2 s / 1 s | wall time inside the worker | `flake-s3-cpu`: the worker thread's CPU time. The wall limit becomes 5× the limit, and only stops a runaway |
| PERF-1 first loads do not block | the lead, 2026-10-11 (171 ms, load 4); qa-mobile-beta-4 (264 ms, load 10–12); qa-desktop-beta-4 (281 ms, load 20–28); stress 4/4 | "event loop blocked for N ms" | the probe counts any late tick as a block, including a tick late because the OS ran another process | `flake-perf1-v15-cpu`: a tick counts the CPU this thread spent in it (min(wall gap, CPU delta)). The health-ping limit allows the scheduling delay the probe saw. A 300 ms busy loop still reads 295 ms |
| V15 cold /api/market | the lead, 2026-10-11 (182 ms); qa-mobile-beta-4 (267 ms); qa-desktop-beta-4 (557 ms); stress 4/4; patched run 3 once ("warm … 201 ms") | the same; and the warm reply over 200 ms | the same; the warm check is wall time | the same probe; the warm reply's CPU < 200 ms, wall < 2 s |
| politeRequest per-host spacing | the lead, 2026-10-11 ("gaps 27,40"); qa-mobile-beta-4 ("gaps 27,42", load 10–12) | gap below 35 ms | the mock fetch stamps `Date.now()` after takeTurn. A preempted process stamps late, so the gap shrinks while polite.js kept its own gap (its `lastStart` check, polite-spacing.test.js) | `flake-polite-clock`: node:test mock timers (setTimeout and Date) drive the calls on a virtual clock, so gaps are exactly 40 (and ≥ 25 for fetchAmazon) |
| Compstimate T21 cold server | E3 (fv5), the gate on 5c0cda3, the T-1 group run (load 7) | "app not ready (initial load) after 30000ms … Loading roles…" | the cold server re-normalizes Anduril's 2,537 postings: the crawl is norm-9 and the code norm-12, 16 s at load 5 (`curl` on a fresh MELON_CACHE_DIR). That exceeds the 30 s READY_TIMEOUT at load 10+. The 10 s accuracy budget is never reached | `flake-t21-cpu`: that one load gets 75 s; the accuracy line is budgeted 10 s of the server's CPU (/proc/<pid>/stat; harness returns the pid) and 40 s of wall time. Passes patched (28 s) |
| UI: map mode shows price pins | E2 (fps) | "map pressed: expected true, got false" | aria-pressed is read right after the click, before the view re-renders (a race under load) | `flake-ui-map-order`: wait for aria-pressed |
| UI: map initial fit keeps every pin inside | E2 (fps) | "map test did not run" | order dependence: it reads `ctx.mapClipped`, written by the test above. ui.e2e.js has a second such pair (`ctx.mobileUnnamed`). A grep or a shard cut between them fails the second | the same patch: skip with the reason when run alone; and the shard cuts in §8 do not fall between them |
| Beta desktop QA [D-20] server mode, 7 boards | none failed, but 101 s in E2 against the 120 s limit; 21 s in the T-1 run | — | the same cold re-normalize as T21, for 7 boards. The time depends on whether `data/cache` already holds upgraded stores from an earlier run: state shared through the disk | none patched. Re-crawl at norm-12, or give D-20 its own 300 s limit (`E2E_TEST_TIMEOUT` is global) |
| Beta mobile QA: every big-tech board … CSV agree | the T-1 group run (Meta) | "CSV rows: expected 1209, got 1210" | not a flake: a split on "\n" counts a quoted line break (T-17's title) | in the T-1 patch: count records |

Also seen, outside these runs: the browser "crash" cascades (T-12, §7). Those are not flakes: every one was a signal.

## 7. The browser "crash" (T-12)
**What happens.** playwright-core 1.56.1 (`lib/server/utils/processLauncher.js`) installs process handlers when a
browser is launched. The defaults are `handleSIGINT`, `handleSIGTERM` and `handleSIGHUP`, all true:
```js
function sigtermHandler() { gracefullyCloseAll(); }
function sighupHandler() { gracefullyCloseAll(); }
// sigintHandler closes, then process.exit(130)
```
On SIGTERM or SIGHUP, Playwright closes Chromium and installs no exit. Node's default "exit on SIGTERM" is replaced by
the handler, so the runner goes on. The test in progress fails (`page.evaluate: Target page, context or browser has
been closed`), and every later one fails at `browser.newContext`. No test or memory problem is involved.

**Where the signals came from:**
- the lead's `timeout 5400` in both 2026-10-17 gate runs (exit 124, the lead's own record);
- the Bash tool's 2-hour cap on a background command: fbdad58 closed at test 771, about 2 h into a full run;
- a stopped or paused agent session. qa-desktop-beta-4's run stopped "when the session paused at an API limit".
  fd3/e2e-full.log and fps/e2e-matrix-suite2.log, two agents and two browsers, both closed at 02:10 on 10-17: a
  system-wide event, not a crash.

**Evidence:**
1. The crashed logs carry Playwright's own close sequence, not a crash: fv5/e2e-fullA.log lines 197–200 and
   fd3/e2e-full.log 409–412 read `[pid=…] <gracefully close start>`, `<forcefully close>`, `<kill>`,
   `<will force kill>`. No log has a "Target crashed", a SIGSEGV or an OOM line.
2. Repro (`tools/sigterm-repro.sh`, `sigterm-repro.log`, 05263e8, load 7): 2 phone-matrix tests passed, then
   `kill -TERM` after 45 s. The current test failed "page.evaluate: Target page, context or browser has been closed",
   the next 5 failed "browser.newContext: …closed", and the run ended 2/8.
3. The same on a copy of 5c0cda3, with 9fa0ab2's relaunch (`sigterm-repro-relaunch.log`): 2 tests failed (the first
   mid-test, the second because `isConnected()` was still true while the browser was closing), then "! the browser
   closed; relaunching it (1)", and the run went on to its end. **The relaunch makes a run ignore its `timeout`**: one
   SIGTERM, no `-k`, and the run no longer stops.
4. Memory is not the cause. I sampled every 30 s during the lead's gate run on 5c0cda3 (`tools/memwatch.mjs`,
   `mem-gate.jsonl`; 13:24 to the end):
   - no OOM line in dmesg;
   - the Chromium browser process flat at 186–205 MB, with 2 renderers (3 for moments);
   - Chromium in total 0.7–1.2 GB;
   - 12+ GB available.
   The node test process grew from 210 to about 750 MB: each e2e file caches its own unpacked lists, Amazon included.
   It is not the browser.

**Fix** (`qa-suite-beta-e2e-runner.diff`, against 9fa0ab2's scripts/e2e.js and harness.js; it replaces the
relaunch-before-every-test):
- launch with `handleSIGTERM: false, handleSIGHUP: false, handleSIGINT: false`;
- scripts/e2e.js traps the three signals and calls `suite.stop(sig)`:
  - the browser closes at once, so the test in progress ends "(N ms, interrupted by SIGTERM)";
  - the loop counts the rest as not run;
  - then the browser and the server close, and the summary reads "e2e: stopped by SIGTERM: N tests ran, M not run",
    with exit 128 + the signal (143, 129, 130);
  - a second signal exits at once;
- `ensureBrowser` relaunches only after a `disconnected` event that no signal caused.

Verified on a copy of 5c0cda3 with the patch:
- SIGTERM after 45 s: "stopped by SIGTERM: 3 tests ran, 5 not run", exit 143, 1 s after the signal;
- SIGHUP after 30 s: "(9712ms, interrupted by SIGHUP)", "2 tests ran, 6 not run", exit 129.

**For the gate:** use `timeout -k 60 <s>` (a SIGKILL if the SIGTERM is ignored), and read the exit code. 124 is the
time limit, not a crash.

## 8. Speed (T-11)
### 8.1 npm test (U1–U3)
The wall time is 90–125 s: node:test runs files 3 at a time. The 10 slowest tests (U1/U2/U3, seconds):

| s | Test | File |
|---|---|---|
| 20.4 / 18.8 / 12.4 | resumed: with no `paused` … matrix, crawl, gate, merge, archive, build and list all pick both up | amazon-meta-resume |
| 15.8 / 14.2 / 8.8 | stable dist: no beta company anywhere outside dist/beta/ | beta-build |
| 14.2 / 7.6 / 6.5 | public/**/*.{js,html}: no GitHub links, only allowlisted hosts | links-policy |
| 11.5 / 6.7 / – | S-9 residual: a code line outside the FX table is refused | monthly-refresh-commit |
| 11.3 / 7.2 / 7.0 | static build: absolute og URLs with the default SITE_URL | og |
| 10.6 / 10.7 / 10.6 | fx check(): ECB monthly down → daily fallback | refresh-fx |
| 10.5 / 8.0 / – | paused: a leftover snapshot is dropped by the merge | amazon-meta-resume |
| 9.6 / 8.4 / 7.7 | config.js hands api.js a Response it can read like its own fetch() | perf-mobile-beta |
| 8.5 / 8.9 / 8.0 | static getJobs returns exactly the old unpack → vet → juice output | perf-mobile-beta |
| 7.5 / 5.6 / – | [DQ-7] the build bundles no demo list next to a snapshot | fix-beta-platform |

- **Repeated setup:** 13 test files run `scripts/build-static.js` themselves (beta-build 2×, perf-mobile-beta-2 9×,
  and others). Each is a few seconds on fixtures. A build cache keyed by the source tree would save a minute of CPU,
  but the wall time is already 2 min, so this is not worth a patch.
- **Waits on real timers:**
  - `fx check()` waits a constant 10.6 s;
  - `checkRobots` (5xx retries) 6 s;
  - `fetchMeta` (a wall of failures) 6 s.
  These are backoff delays on the real clock; the virtual-clock helper of `flake-polite-clock` would remove them.
  Low priority.

### 8.2 The e2e suite
The full run on 5c0cda3 has 864 tests (+32 with this pass's group). From E2 (fps/e2e-full3.log, 766 tests, 111 min of
passing-test time; failed tests had no time before the runner patch):

| Group | Tests | Minutes | Share |
|---|---|---|---|
| Fix phone text | 102 | 35.0 | 31% |
| Fix phone controls | 101 | 10.0 | 9% |
| Phone matrix | 54 | 9.2 | 8% |
| Fix touch tips | 34 | 7.6 | 7% |
| fix-density | 51 | 6.9 | 6% |
| Compstimate | 23 | 4.9 | 4% |
| Beta mobile QA 3 | 22 | 4.1 | 4% |
| Beta desktop QA | 19 | 3.6 | 3% |

The 10 slowest (E2): Compstimate consistency 116.5 s, [D-20] server mode 100.7 s, [UX-46] 52.9 s, Beta mobile QA 2
"every other phone scroll area" 50.9 s, [M-28] 40.0 s, Beta mobile QA 3 [M-33] 33.5 s, T21 32.3 s, Badge narrow
widths 31.8 s, Fix phone text [M-37] 29.4 s and [M-39] 29.4 s.

What dominates:
1. **Fix phone text's guard walks.** There are 85 tests: 7 boards × 4 (390/360, light/dark), 7 × 3 desktops, and 2
   boards × 19 sizes. Each takes about 22 s (20–28 s). One walk opens 10+ views (first screen, sheet half and full,
   Ranges, map, Insights, up to 6 job pages, filters, badge, More, company menu). After each step it waits a fixed
   0.4–1.2 s: about 14 s of fixed waits plus about 1.4 s per job page. So the group is mostly sleeping.
   **Measured** with `tools/instrument.mjs` (setTimeout ≥ 200 ms started from a test file; `instr-probe.jsonl`,
   05263e8, load 9):

   | Test | Time | Fixed waits | Share |
   |---|---|---|---|
   | guard, amazon 390 light | 27.8 s | 18.9 s | 68% |
   | guard, netflix 390 light | 22.2 s | 18.9 s | 85% |
   | matrix, Pixel 8 (3 boards) | 19.4 s | 11.6 s | 60% |
   | [M-40] Pixel 8 | 6.5 s | 2.1 s | 32% |

   Across the 85 guard walks that is about **27 min of the group's 35 min spent in fixed waits**.
2. **Phone loops that reload Amazon.** [M-43] × 22, [M-40] × 23, [M-47] × 23, the matrix × 21 (Amazon is one of 3
   boards), the guard × 19 (one of 2) and [UX-39] × 18. That is about 130 loads of Amazon's 22,179 postings, each in a
   fresh context, about 3–6 s each.
3. **Long single tests near the 120 s limit**: Compstimate consistency (116 s) and [D-20] (101 s cold, §6).
4. Smaller: every test file's static server gzips each response on every request. Amazon's 6.8 MB list costs 117 ms
   of CPU, about 300 times per run, on the same event loop that drives Playwright. `beta-coverage.e2e.js` caches
   the gzipped bodies.

Proposals, without losing coverage:
- **Shard** (the runner patch): `--shard=i/n --timings=<log>` cuts the list into contiguous slices of equal time.
  With E2's timings, 4 shards are 31 min each. Order is kept inside each slice; check that a cut does not fall between
  T-18's two ctx pairs (it does not today: they are in shard 1). In CI the shards run in parallel (§10). In the
  sandbox, one shard at a time still lets a gate stop and resume by shard.
- **Wait for states, not times** (`qa-suite-beta-t11-state-waits.diff`, fix-phone-text.e2e.js and
  phone-matrix.e2e.js, at the lead's request):
  - each fixed sleep becomes `quiet(page, cap)`: at least 150 ms after the action, then until there has been no DOM
    change for 120 ms, the fonts are loaded and no transition is running. The cap is the old sleep, so a page that
    never settles is measured exactly as before;
  - plus waits for the specific state each step changes: `body[data-sheet]` changing, `#popover` visible and then
    hidden, `#drawer.is-open`, `#insightsHost .msi-stat`.
  - **Measured on the same load, alternating** (`tools/waits-ab.sh`, 5c0cda3 tests on the lead's 5c0cda3 build,
    14:45–14:55, load 3–10): 8 tests (3 matrix sizes, 3 guards, 2 size guards), 2 runs each way. **The same result
    in every run (8/8 pass), with mean time 3.01 → 1.68 min (44% less).** For example, the guard on amazon 390 light
    went from 31.1/27.2 s to 15.9/15.0 s, and the matrix at 280 px from 20.6/20.1 s to 13.4/11.5 s.
  - **Sensitivity** (`tools/waits-sens.sh`): on my 05263e8 build, which still has the long department-name cuts, the
    original and the patched guard report **the same problems, to the pixel**:
    - 2 problems at 360;
    - 6 at 280, among them "Program and Product Management" cut by 80.42 px and the fold arrow by 17.08 px;
    - 2 at 320.

    The patched guard took 14 s against 25 s.
  - Over the group's 85 guard walks and the matrix's 21 sizes, that is about 15–18 min less per full run.
- **Size checks share widths:** the 21 sizes have 18 distinct widths. Captions depend on width, so the guard can
  run once per width (−3 sizes × 2 boards, about 2 min). A small gain.
- **A light/dark pair on one load:** `page.emulateMedia({ colorScheme: 'dark' })` re-themes without a reload. It saves
  the 14 dark guard loads, but not their walks.
- **Fewer boards per size where the code path is the same:** each phone layout check (matrix, [M-40], [M-43]) uses
  one board per size in turn, as `beta-coverage.e2e.js` does, and keeps the all-boards check at 390 and 360. This
  saves about 2/3 of the matrix's 9 min, but it is a coverage trade (board × size pairs). I propose it for a quick
  local run (`PHONE_MATRIX_BOARDS` already allows it), not for the gate.

## 9. Red-by-design tests, stale assertions, vacuous passes
### 9.1 Red by design on the branch head (from the lead's gate on 5c0cda3)
Sources:
- the lead's gate on 5c0cda3, which has 8898566's code (`<scratch>/qa-suite-beta/gate-8898566/`, copied before the
  next gate archives it): npm test 0 fail; e2e 858/864, 1 failed, 5 skipped, 2 h 6 min, the browser never relaunched;
- 433aa59's diff from 5c0cda3: fix-qa4 round 2 makes MR-35 a real test.

**e2e: no red-by-design test is left.** Every reviewer's `[ID]` test passes on 5c0cda3. The one failure is T21, a
flake (§6) that passed alone in 24.7 s. `docs/process/e2e-expected-red.txt` lists only T21, marked `flaky`, until
`qa-suite-beta-flake-t21-cpu.diff` lands.

**e2e tests that skip on every run** (T-19): a skip passes, so these test nothing. D-11, P-2 and BP-2 skipped in
every full log that reached them: E2, E3, the lead's gate, and the cut-short logs of qa-desktop-beta-4 and fd3.
[V-18] passed in E2 and in qa-desktop-beta-4 (before D-44). It has skipped in every run since: E3 and the gate.

| Test | Skip reason | Why it can never run | What to do |
|---|---|---|---|
| Beta viz review [V-18] (Google, Group by Location, London) | "no London row" | Stale since D-44 (fix-viz-5): Group by Location folds the small places into "189 more places", and London (151 postings) is folded. The test reads only the visible rows | `qa-suite-beta-t19-v18-fold.diff`: open the fold first, as fix-pay-at-place's [V-36] does. It passes on 5c0cda3 (2.7 s) |
| Fix viz 3 [BP-2] NVIDIA, Munich, Senior and Staff+, from €110,000 | "0 of 2,711 roles" | Stale since BP-2's own fix. NVIDIA posts no German pay. Its 31 Munich postings carry only 3 pay ranges, all Polish (PLN, Senior). BP-2 made pay for another country count as no pay under a Location filter, so the €110,000 minimum leaves 0 roles (`tools/probe-bp2-csv.mjs`) | `qa-suite-beta-t19-bp2-munich.diff`: drop the minimum. That leaves 13 roles, and the test checks that the chart plots none of the Polish pay and counts it as left out, as the Zurich test above it does. The minimum on cards stays covered by fix3-app's [BP-2] test, which passes |
| Fix app [P-2] the drawer estimate at low confidence | "no estimate for this role" | The test opens only the first of its 12 candidate roles without pay (`noPay[0]`), and that role gets no estimate. It needs a role that has one | try the 12 candidates in turn (or pick one in the page with `compstimateForJob`). The low-confidence wording is also covered by fix-estimates' three [P-2] tests, which pass |
| Desktop QA [D-11] "Newest" with no listing dates | "this data has listing dates" | It needs a board with no listing dates. Every crawl since 2026-10 has dates | a fixture, through fix-app's `openFx` patch hook (strip `age` and `postedAt`) |
| Methodology: screenshots | "set E2E_SHOTS=1" | by design: it writes screenshots only when asked | none |

Also silent: fix-touch-tips' notes say the pay strip is not checked at the Razr cover or in the landscape sizes
("no room"). They are notes, not skips, so the run reports nothing.

**npm test: 9 red to-dos left on 433aa59** (10 on 5c0cda3; MR-35 became a real test in fix-qa4 round 2, 52ae20d).
Each waits on fix-mr-3:

| ID | Test | Waits on |
|---|---|---|
| MR-21 | registry.js usage header lists every mode (--docs) | fix-mr-3 |
| MR-22 | market.json fx.source names the rate source | fix-mr-3 |
| MR-26 | the sources table does not call the postings overdue on the build day | fix-mr-3 |
| MR-29 | the chart or stats line says departments come from titles | fix-mr-3 |
| MR-33 | the drawer's converted line for fixed-term pay | fix-mr-3 |
| MR-37 | the drawer explains a stated annual figure (Austria, 14 payments) | fix-mr-3 |
| MR-38 | a monthly internship with no stated length is fixed-term pay | fix-mr-3 (norm-13) |
| MR-40 | NYC-metro towns in Microsoft's NYC pay area | fix-mr-3 |
| MR-41 | the "Mid" chip's example vs Amazon's ladder | fix-mr-3 |

Plus this pass's own: [T-17] waits on fix-mr-3 (norm-13); [T-1], [T-4], [T-5], [T-9] and [T-10] pass once the
runner and T-1 patches are in. `qa-suite-beta-todo-fixed.diff` then makes them real tests.

**npm test: 35 to-dos that already pass** (T-20). A to-do never fails, so these guard nothing:
- beta-methodology.test.js: 29 tests (MR-4, MR-5 ×16, MR-6 ×2, MR-7 ×2, MR-8 ×3, MR-15 ×2, MR-16, MR-19, MR-20). The
  file's `todo()` has no FIXED set, so a fixed ID stays a to-do;
- beta-methodology-2.test.js: 5 tests (MR-23, MR-34, the two passing halves of MR-29 and one of MR-41). The file
  keeps an ID a to-do while any of its tests fails, so the fixed halves of MR-29 and MR-41 guard nothing;
- beta-data-check-3.test.js: DQ-6 residue.

Fix: a FIXED set in beta-methodology.test.js, as -2 has. In -2, put MR-23 and MR-34 into FIXED and mark the passing
halves of MR-29 and MR-41 per test. fix-mr-3 edits these files now, so this goes to that lane rather than into a patch
here.

**Can never pass as written:** no unit to-do. Two of the passing ones are pinned to a day: MR-4 ("on the review day")
and MR-23 ("on the 2026-10-16 review day"). They pass because they read a fixed date.

### 9.2 Stale assertions and names (T-15)
- **Names that pin a crawl:**
  - "Apple (6,105 roles)" in beta-desktop-qa and beta-mobile-qa, and "1 of 6,105" in [M-23]: Apple has 4,851;
  - "Amazon (22,179 roles)" in beta-mobile-qa-3, and "Loading 22,179 roles…" in beta-desktop-qa-3 and
    beta-mobile-qa-3;
  - "paused and absent companies (Meta, Amazon, Tesla)": both are resumed (renamed in the T-1 patch).
  Their assertions read the data (they count from the list), so only the names mislead. Rename them at the next edit.
- **Docs-reading tests:** 32 unit test files read docs/ or README.md. Most check structure (a link exists, a
  template is named), which is fine. The fragile ones:
  - the methodology to-dos that match exact prose (beta-methodology, beta-methodology-2: 31 to-dos);
  - refresh-jobs' rule that a quoted "±N% (tested on …)" line in a product doc is a claim (PLAYBOOK "Known traps"
    lists it).
  A wording change in the docs turns these red with no product change.
- **Fixed counts in unit fixtures:** fix-qa4.test.js has 22179, 2711 and 2435 in synthetic fixtures. They are
  fixtures, not the crawl, so they are fine.

### 9.3 Vacuous passes
- **e2e skips:** every beta group calls `skip(...)` when a board's list is missing, so a build without a board passes
  with skips (T-5). The new build test fails instead, and the runner patch adds `--max-skips`.
- **npm test in CI:** the 8 tests that need data skip there, loudly, with a reason:
  - families coverage on Google;
  - BUG-5 on real snapshots;
  - market.json ≤ 150 KB;
  - PERF-1, stores persist, V15;
  - the gate on real snapshots;
  - the big board cache.

  All 8 pass with data (`runs/unit-data-1`, 14:22–14:27, load 11–17: 1,262 tests, 1,210 pass, 1 fail, my own guard,
  fixed). `tools/vacuity.mjs` compares U2 with that run, looking for tests that pass in both but finish in under 5 ms
  without data while taking 20× longer with it. It found 4 candidates, and all are fixture tests with import-time
  noise (juice guardrails, "a US range listed in Sydney", the Juice name, "companies left out are named"). **No
  vacuous unit test was found.** The data-gated tests skip; they do not pass empty.
- **With data, npm test takes 4.5 min instead of 2:** fix3-compare.test.js "market.json stays under 150 KB … Google
  entry software in the US is not $89K" took **200 s** at load 13 (it builds the market from the real boards). It is
  the slowest unit test by far and runs only locally. It is a candidate for sharing one market build across that
  file's tests.

## 10. CI parity (T-14)
| | CI (ci.yml, every push and PR) | A contributor or the lead in the sandbox |
|---|---|---|
| `npm test` | Node 20 and 22, `npm ci`, pdftotext installed, **no data**: every check that needs `data/snapshots` or `data/beta/snapshots` skips (8 skipped), so PERF-1, V15, the stores test and the real-data checks never run in CI | Node 22.22, data linked: those tests run, and the timing ones fail under load |
| Static build | `npm run build` on no data (demo lists) + jq + `.github/scripts/check-lists.mjs` | the real crawl (local-data.js) |
| Server smoke | `npm start` + curl /api/companies, /api/jobs?company=anthropic | — |
| e2e (`node scripts/e2e.js`) | **nowhere** | by hand, about 2 h, Chromium at /opt/pw-browsers |
| WebKit | webkit-phone.yml, manual (workflow_dispatch): builds on the archived crawl; phone smoke on WebKit and Chromium; 6 groups on WebKit (Beta mobile QA 2, fix-company-scroll, fix-touch-tips, fix-phone-controls, fix-phone-text; Beta mobile QA 2 also on Chromium) | Chromium only |
| External links | ci.yml `links` job (the runner can reach the internet; advisory) | not reachable |

**Tools the sandbox has and the runner lacks, or the reverse:**
- pdftotext: ci.yml installs it;
- Playwright: not a dependency. The sandbox has 1.56.1 in `<scratch>/pw` and 1.63.0 in webkit-phone.yml; CI needs
  `npm i --no-save playwright@1.63.0` and `npx playwright install --with-deps chromium`;
- the archived crawl: `scripts/cycle/local-data.js` works on GitHub (webkit-phone.yml uses it);
- `process.threadCpuUsage`: Node 22.19+ only. On Node 20 the flake patches fall back to process or wall time, and
  the tests that use it only run with data anyway.

**Proposal** (`qa-suite-beta-ci-e2e.diff`, the YAML parses, and workflows.test.js, beta-security-review V12,
archive-workflows and ci-lists all pass with it, 28/28):
- `.github/workflows/e2e.yml`, run manually, nightly at 03:41, and on PRs that touch public/, server/, scripts/,
  test/e2e/ or the workflow;
- a build job: local-data.js, then build-static, then dist and both snapshot folders as one artifact;
- 4 shard jobs on ubuntu-latest: `node scripts/e2e.js --shard=${{ matrix.shard }}/4 [--timings=test/e2e/timings.log]
  --max-skips=20`, with `continue-on-error`, and each log as an artifact;
- a summary job: `.github/scripts/e2e-summary.mjs` merges the logs and fails on any of:
  - a failure that is not in `docs/process/e2e-expected-red.txt` (one `<ID> <lane or decision>` per line: the
    red-by-design list of §9, kept by the lead);
  - a shard that did not finish;
  - an expected-red test that now passes (its entry is stale).
- Shard times, from fps/e2e-full3.log's durations:
  - with `--timings`: 4 × about 31 min;
  - without timings, by test count: 28, 21, 29 and 45 min.

## 11. Patches (`docs/process/patches/`)
Each was made in `<scratch>/qa-suite-beta/patchwt`, or in `pshard/` against 5c0cda3's files (which carry 9fa0ab2).
Each dry-runs clean (`patch --dry-run -p1`) against 5c0cda3's files.

| Patch | Files | Finding | Verified |
|---|---|---|---|
| `qa-suite-beta-e2e-runner.diff` | scripts/e2e.js, test/e2e/harness.js | T-12 (signals), T-10 (`--shard`, `--list`), T-5 (`--max-skips`, skip reasons), T-9 (failure durations), T-4 (links.e2e.js registered) | SIGTERM → exit 143 in 1 s, "3 tests ran, 5 not run"; SIGHUP → exit 129; `--list` gives 864 tests; 4 time-balanced shards of about 31 min |
| `qa-suite-beta-t1-board-list.diff` | new test/e2e/beta-boards.mjs; beta-desktop-qa, beta-desktop-qa-2, beta-mobile-qa | T-1, T-15 (one name), T-17 (the CSV record count) | the three groups on all 7 boards: everything passes |
| `qa-suite-beta-t4-link-check.diff` | docs/process/scripts/link-check.mjs | T-4 | 2,012 links, 0 broken; both Links tests pass |
| `qa-suite-beta-flake-s6-cpu.diff` | test/beta-security-review.test.js | T-13 | stress: original fails 5/5, patched 0 |
| `qa-suite-beta-flake-s3-cpu.diff` | test/beta-security-review.test.js | T-13 | the same |
| `qa-suite-beta-flake-perf1-v15-cpu.diff` | test/perf.test.js | T-13 | stress: original 4/4 fail, patched 0/8 fail. Sensitivity: a 300 ms busy loop reads 295 ms |
| `qa-suite-beta-flake-polite-clock.diff` | test/bigtech-polite.test.js, test/amazon-meta-adapters.test.js | T-13 | 20/20 in both files; gaps exact on the virtual clock |
| `qa-suite-beta-flake-t21-cpu.diff` | test/e2e/harness.js (pid), test/e2e/ui.e2e.js | T-13 | T21 passes (28 s) where it failed in the same group run |
| `qa-suite-beta-flake-ui-map-order.diff` | test/e2e/ui.e2e.js | T-18 | syntax and dry run |
| `qa-suite-beta-t11-state-waits.diff` | test/e2e/fix-phone-text.e2e.js, test/e2e/phone-matrix.e2e.js | T-11 | 8 tests × 2 runs each way on the same load: the same results, 44% less time; the same problems on a build with known cuts |
| `qa-suite-beta-ci-e2e.diff` | new .github/workflows/e2e.yml, .github/scripts/e2e-summary.mjs | T-14 | the YAML parses; workflows, V12, archive-workflows and ci-lists tests pass with it (28/28); the summary script read E2 |

## 12. Decisions
1. **Counts from the data, never pinned.** Every new e2e check compares the screen with numbers it computes in the
   page from the build's own lists (`api.getJobs`) and the page's own `toUSD`. This is the suite's rule (qa.md
   decision 6). The pay filter rule it checks is the documented one: approx-USD top pay ≥ the minimum, lowest ≤ the
   maximum.
2. **One test per board for filters and sorts, one per phone size for the phone flow.** A failure names its board
   or size, and each test loads one board once (21 phone tests at 9–13 s each, 7 board tests at 11–24 s).
3. **A different board at each phone size, in turn**, so the seven boards are all exercised on phones without 7 ×
   21 loads (the runtime finding).
4. **Suite gaps as `todo` unit tests** (the reviewers' convention: shown in `npm test`, never red in CI). A test of
   the tests fails only for gaps another owner must fix: T-1, T-4, T-5, T-9, T-10, T-17.
5. **The new e2e build test fails rather than skips** when a registry board is missing. It is the one place that
   turns T-5's skips into a failure today.
6. **CPU time over wall time** for the timing tests: process.threadCpuUsage on Node 22.19+, with a fall-back.
   Rejected alternatives:
   - a load-scaled limit (os.loadavg): too coarse;
   - a ratio between input sizes: needs two runs per test and is still noisy.
   CPU time also keeps each test's meaning: "does not re-render" and "is not quadratic" are costs, not latencies.
7. **A virtual clock for the spacing tests** (node:test mock timers): gaps are measured on the clock the code reads, so
   no load can shrink them.
8. **The signal fix stops the run instead of relaunching**, as the lead asked: a time limit or a stopped session must
   end the run with an honest summary and exit code.

## 13. Replayable steps
```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad; Q=$S/qa-suite-beta
cd <worktree>
ln -s $S/wt-data2/data/snapshots data/snapshots; mkdir -p data/beta; ln -s $S/wt-data2/data/beta/snapshots data/beta/snapshots
ln -s /home/user/melon-seek/node_modules node_modules
node scripts/build-static.js --out $Q/dist && ln -s $Q/dist dist             # 51 s at load 9; 7/7 beta companies
# npm test CI-like, 3 runs (clean checkout, no links):
git worktree add --detach $Q/clean HEAD && ln -s /home/user/melon-seek/node_modules $Q/clean/node_modules
$Q/tools/unit-runs.sh $Q/clean $Q/runs 1 3 && node $Q/tools/tap-sum.mjs $Q/runs/unit-1.tap --src=$Q/clean/test
# this pass's groups:
node --test test/beta-coverage.test.js                                       # E2E_DIST=<build> for the data check
$Q/tools/e2e-run.sh $PWD $Q/cov.log 2400 '--grep=^Beta coverage'
# the signal repro:
$Q/tools/sigterm-repro.sh <checkout> $Q/sigterm-repro.log 45 TERM
# the stress runs (8 busy loops and the tests at nice 19):
$Q/tools/stress.sh <checkout> 8 5 <label> test/beta-security-review.test.js test/bigtech-polite.test.js test/perf.test.js
# memory and test counts during a run:
node $Q/tools/memwatch.mjs --out $Q/mem.jsonl --every 30 --for 14400 --log run=<e2e log>
# per-test contexts, fixed waits and memory (one JSON line per test):
INSTRUMENT_OUT=$Q/instr.jsonl NODE_OPTIONS=--import=$Q/tools/instrument.mjs node scripts/e2e.js
node $Q/tools/e2e-log.mjs <e2e log> --fails     # groups, slowest, failures, the first "browser has been closed"
node $Q/tools/list-tests.mjs <checkout> --groups
```

## 14. Known gaps
- No WebKit or iOS Safari here. The new phone test runs on Chromium; it uses standard Playwright APIs and should run
  under webkit-phone.yml.
- Live boards, map tiles and careers hosts are unreachable, so Apply is checked by its href only.
- Search ranking uses a whole-word-prefix approximation of the app's matcher (word endings and spelling variants are
  not modelled). It checks the order on the first 60 cards only.
- The sort check reads the first 30 cards; the last cards' "no pay last" rule is checked only where those 30 reach
  them.
- Keyboard shortcuts, recent pills and Add board are still checked on the main site only (§4.1). They are low risk on
  beta: the same code, and no board-specific data.

## 15. Change log
- 13:13 Brief read; worktree on 05263e8; links; brief committed (f06c2f8).
- 13:2x The gate logs were gone (the lead: deleted by the gate script). I used five other crash logs; started memory
  sampling of the lead's gate.
- 13:28–13:33 npm test CI-like ×3 (U1 S-6 fail; U2 and U3 green). Build of my dist.
- 13:3x–13:5x Coverage map; the unit file; the e2e group (3 development runs).
- 13:4x Findings T-1 and T-4 sent; runner patch v1 (shard, list, max-skips, durations).
- 14:0x T-12: Playwright's SIGTERM and SIGHUP handlers found and the cascade reproduced, with and without 9fa0ab2;
  sent to the lead. The lead confirmed both gate runs ended at their own `timeout 5400`.
- 14:0x–14:2x Patches: the runner (signals), T-1, T-4, T21, S-6, S-3, PERF-1/V15, polite, the UI map/order pair and CI;
  the stress runs (original fails every run, patched 0 failures after the V15 warm fix).

