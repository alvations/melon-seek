# Process log: QA (end-to-end suite)

## 1. Brief
- Prompt (verbatim, with both coordinator follow-ups): [`docs/process/prompts/qa.md`](prompts/qa.md).
- Goal: a browser e2e suite, `node scripts/e2e.js`, kept out of `npm test`. It starts the real server,
  checks the API against the Job contract, drives the UI in headless Chromium, saves screenshots and
  records bugs in `docs/QA.md`. In v2 the suite was refreshed for the redesigned UI (company menu,
  Clusters/Ranges, Insights, theme, Listed, Save, drawer folds), extended to the v2 features
  (pay gate, Juice, honest numbers, comps, CSV, lazy description, Pay|Juice map), and the harness
  was hardened so one failing wait cannot kill the run.
- Files owned: `scripts/e2e.js`, `test/e2e/harness.js`, `test/e2e/api.e2e.js`, `test/e2e/ui.e2e.js`,
  `docs/QA.md`, `docs/screenshots/*.png`, `docs/process/qa.md`, `docs/process/prompts/qa.md`.
  No other team's files were edited. The backend agent's earlier additions to `api.e2e.js`
  (`meta.lazy` and `/api/job` checks) were kept.

## 2. Inputs and sources
- `docs/CONTRACT.md`: Job shape, HTTP API, and the v2 additions (`salaryFlag`, `extras`, `ageDays`, `juice`
  attached in `public/api.js`, `/api/job`, `/api/market`, `/api/export`, the ROADMAP §8 drawer order).
- `docs/process/ux.md` (UX log), decisions 13 and 17-26: company menu and recents (`melon-seek.recent.v1`),
  theme cycle and `t`, Insights, Pay unclear, Juice (badge, `sort=juice`, waterfall, Monthly/Yearly), F1 comps
  (`pickCompany` → `c`, `rf`, `s`), F4 Listed (`p`, `ho`), F5 Save (`melon.saved`), F7 CSV, drawer folds with a
  3-open budget.
- `public/index.html` and `public/app.js` (read-only): `#companyMenuBtn`, `#popover.popover--company`
  (`.company-item[role=option]`, "Search companies"), `#companyPills` (recent only), `[data-view]` in the
  "Chart view" group, `#themeBtn`, `.topbar .seg button[data-mode=chart|map|insights]`, `#saveSearch`,
  `#clearAll`, `#dataBadge` → `.popover--badge` "Download CSV", `.sal-pill--unclear`, `.d-sal-unclear` and
  `details.d-unclear`, `.juice-badge`, `.d-juice .waterfall .wf-row`, `.d-pay-caption`, `.pay-label`,
  `.drawer-scroll > .d-fold` (`.d-comps`, `.d-desc`), `#insightsHost`/`#compHost`/`#insightsPanel`/`#compsCardHost`,
  `.area-chip` "Role: …". Filter logic (`failures()`, `prepare()`): approx-USD salary, `_age`, `_family`.
- `public/viz/map.js`: `.ms-modes__btn[data-mode=pay|juice]` (role radio, `aria-checked`), `.ms-modes--juice`.
  `public/viz/comps.js`: `.ms-comps__row` (`.is-current`, `.ms-comps__label`). `public/features/comps.js`:
  `button.msi-row[data-key="company:<slug>"]`.
- `public/features/roles.js` (`roleFamily`) and `public/viz/palette.js` (`toUSD`): both pure modules, imported
  in Node so the suite's expected counts use the same functions as the app.
- Live probing: small Playwright scripts in the scratchpad dumped section titles, folds, badges and request
  order. Running `curl` against a local server gave the data facts (snapshot mode, 0 jobs with `juice` on the
  server because it is attached client-side, 0 with `ageDays`, 2 Anthropic `salaryFlag` jobs).

## 3. Decisions and rationale
1. **Hand-rolled runner (`createSuite`)** instead of `@playwright/test` or `node --test`. The only allowed dependency
   is `leaflet`, and e2e must stay out of `npm test`. Files are `*.e2e.js` and only export `register*()`.
   `npm test` reports 249/249 and runs none of them.
2. **Harness robustness (v2).** The v1 crash came from a `waitForResponse` promise created before
   `pill.click()` timed out. No pill existed, so it was never awaited, and Node aborted on the unhandled
   rejection. Fixes:
   - `guarded(promise)` attaches handlers immediately and rethrows only when the test calls `.done()`.
   - Every wait is registered right before its action.
   - The runner installs `unhandledRejection` and `uncaughtException` listeners for the duration of the run.
     A stray error fails the current test with "unhandled error(s) during test".
   - Each test races a hard timeout (`E2E_TEST_TIMEOUT`, default 120s).
   - `ctx.cleanup` closes any context a failed test left open.
   - `skip(reason)` (a `SkipTest` error) marks data-dependent tests as skipped, not failed.
   - A self-test in the scratchpad (stray rejection, guarded rejection, hang, then a passing test)
     confirmed that the first three fail individually and the fourth still runs.
3. **Spawn `node server/index.js`** with `PORT=<free port>`, ready once `/api/companies` answers. Locally that
   serves `data/snapshots` (mode `snapshot`). `MELON_SNAPSHOT_DIR=<empty dir>` forces demo mode.
4. **Playwright and Chromium resolution:** unchanged (`createRequire` with NODE_PATH, then
   `$PLAYWRIGHT_MODULE`; `executablePath` set to the newest `/opt/pw-browsers/chromium-*`). `playwright install`
   is never run.
5. **External hosts aborted** at the context level. "Failed to load resource" is ignored only for external URLs.
   `ERR_ABORTED` same-origin requests are ignored because the app aborts fetches itself on a company switch.
6. **Correctness is checked against data, not just "the count changed".**
   - Salary is checked with `toUSD`, and the rf count with `roleFamily()` from the app's own modules.
   - Skills, department, location and Listed counts must equal the facet count shown in the UI.
   - The CSV row count must equal the API job count, using a quote-aware record count.
   - The Juice waterfall must add up, and Monthly must equal Yearly divided by 12.
7. **The skill chip is chosen by data.** On real data the top three Anthropic skills sit on 638/638 jobs and
   cannot narrow anything (BUG-5), so the UI test picks the most common chip whose facet count is below the
   total. A separate API test asserts the data problem (no keyword on ≥95% of a company's jobs), so the bug
   stays visible without masking the UI check.
8. **Company switching goes through the UI as a user would.** The helper uses a recent pill if one exists,
   otherwise the menu (search, then the option). It then waits for that company's `/api/jobs` response
   and a card with the new slug prefix.
9. **Drawer order check** treats ROADMAP §8 as an ordered pattern list. The visible folds must be a
   subsequence of it, at most 3 may be open (none after the 3rd), and `.d-salary` must precede the first fold.
10. **Pay unclear** uses the API to find a quarantined job, then opens the app with `q=<title>` so its card is on
    the first page (quarantined jobs sort last among 638).
11. **Thresholds:** keyword ubiquity ≥95% (Cohere "Travel" 128/132 = 97% was the closest legitimate case
    considered). Dark mode needs background luminance below 0.3 and text above 0.6. Monthly gross must be
    within 6% (or $1K) of yearly/12, and the waterfall sum within 3% (or $5K), allowing for display rounding.
12. **Screenshots** are taken before interactions that move the view (the map before a pin click flies the
    map; the drawer before expanding the description scrolls it).

## 4. Replayable steps
```sh
cd /home/user/melon-seek
ls /opt/pw-browsers          # chromium-1194, chromium_headless_shell-1194, ffmpeg-1011

# Playwright option A: scratchpad install, never touching package.json
SP=/tmp/claude-0/<session>/scratchpad
mkdir -p $SP/pw && cd $SP/pw && npm init -y && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright   # 1.63.0
cd /home/user/melon-seek && NODE_PATH=$SP/pw/node_modules node scripts/e2e.js
# Option B: this sandbox already resolves playwright 1.56.1 at /opt/node-tools/node_modules
node scripts/e2e.js
# Elsewhere: npm i playwright --no-save && node scripts/e2e.js

node scripts/e2e.js --api-only                  # 9 API/static tests, no browser
node scripts/e2e.js --grep='juice|comps|Save'   # subset by name
MELON_SNAPSHOT_DIR=$SP/empty-snap node scripts/e2e.js   # demo-mode run (empty dir)
E2E_TEST_TIMEOUT=60000 E2E_SERVER_LOGS=1 node scripts/e2e.js
npm test                                        # unit tests; e2e not included

# data fact used in BUG-5:
PORT=5997 node server/index.js &
curl -s 'localhost:5997/api/jobs?company=anthropic' | node -e "const d=JSON.parse(require('fs').readFileSync(0));const m=new Map();for(const j of d.jobs)for(const k of j.keywords.skills)m.set(k,(m.get(k)||0)+1);console.log([...m].sort((a,b)=>b[1]-a[1]).slice(0,5))"
```

## 5. Verification
- **v2 final, real snapshot data: 32/33 passed, 1 failed.** The failure is BUG-5 (boilerplate keywords).
  The result was identical across 4 full runs, with Playwright 1.63 and 1.56.
- Demo mode (empty snapshot dir): 31 passed, 1 failed (BUG-5 in demo: Anduril "Autonomy" 120/120), 1 skipped (no
  quarantined salaries in demo).
- `--api-only`: 8/9 (BUG-5). `npm test`: 249/249.
- Harness self-test: stray rejection, guarded rejection and timeout each fail alone, and the next test runs.
- Bugs fixed since v1 and verified: BUG-1 (map fit), BUG-2 (Remote labels), BUG-3 (mobile names),
  BUG-4 (company switcher).
- Screenshots (real data): `chart.png`, `map.png`, `map-juice.png`, `drawer.png`, `drawer-juice.png`,
  `insights.png`, `dark.png`, `dark-drawer.png` (1440x900), and `mobile.png` (390x844). I read each one. The
  map shows all 5 clusters, the drawer shows the pay block, caption, Juice and comps, and dark mode is fine.
- v1 for the record: 22/25 (BUG-1 to BUG-4).

## 6. Known gaps and follow-ups
- Live mode is not reachable in the sandbox. Snapshot and demo modes are both exercised.
- Not covered: chart hover tooltips, the cluster-bin chip, group-by, the seniority, employment and
  remote filters, Juice grade chips, drawer prev/next, the "New", "Reposted" and "Pay ↑" tags (no history in the
  snapshots), saved-search "N new", and Refresh.
- The Listed test asserts only internal consistency while every `ageDays` is null (noted as L1 in QA.md).
  Once history lands it also checks the counts against API `ageDays`.
- Possible next steps: a screenshot diff, and a CI job (`npm i playwright --no-save`, preinstalled browser).

## 7. Change log
- 2026-10-02 05:2x: read the contract. Installed playwright 1.63.0 in the scratchpad, launching `/opt/pw-browsers/chromium-1194`.
- 05:3x: harness, runner and API tests. Waited for the other workstreams.
- 05:4x: selector fixes (`<html data-mode>` clash), `waitReady` diagnostics, approx-USD salary check. Pin
  clipping, mobile names, company switcher, keyboard and offline basemap checks. v1 result 22/25. Wrote QA.md and this log.
- ~08:00 (v2 refresh, coordinator): the suite crashed on a missing Anduril pill (unhandled `waitForResponse`).
  - Harness: `guarded()`, per-test timeout, stray-error capture, `ctx.cleanup`, `skip()`.
  - `ui.e2e.js` rewritten for the v2 UI: company menu helper, Clusters/Ranges, theme, Insights, Listed,
    Save, drawer folds.
  - New tests: Pay unclear; Juice (badge, sort, waterfall); honest caption; lazy `/api/job`; Same role
    elsewhere and Compare companies (`rf`); Save; CSV; Pay|Juice map; theme toggle; dark mode across modes.
  - Found BUG-5 and added the API keyword-ubiquity test. The skills UI test now picks a narrowing chip.
  - The CSV filename check accepts the server's Content-Disposition name (L3 note).
  - Screenshots retaken on real data. QA.md rewritten (32/33). Prompt file appended.

## 8. Improvement audit, wave 1 (read-only on product code)

**Brief:** this is a user-facing audit (performance, UX heuristics, accessibility) of the app at `2e6e4cf`, in both
modes: the real server with local snapshots, and the static build served under `/melon-seek/`. Findings are
in `docs/QA.md` § "Improvement audit (wave 1)": PERF-1 to 4, UX-1 to 14 and A11Y-1 to 5. Screenshots are in
`docs/screenshots/audit/`. The prompt is in `prompts/qa.md`.

**Inputs:** `docs/strategy/ROADMAP.md` §8 (the simplicity budget every fix had to respect), `public/app.js`
(sort, search haystack, `pickCompany`, `togglePopover`), `server/index.js` and `server/keywords.js` (snapshot rekey),
`server/juice.js` (score anchors), and axe-core 4.x (npm, scratchpad only).

**Decisions:**
1. **Cold contexts per measurement.** Each company and device gets a new browser context. Marks come
   from an init-script MutationObserver (first `.ms-crow__band`, card and filter chip) and a `longtask`
   PerformanceObserver. Bytes come from CDP `Network.loadingFinished.encodedDataLength`, which is gzip on the wire.
2. **Phone emulation:** 390x844 at DPR 2 with touch, and CDP `Emulation.setCPUThrottlingRate: 4`. Network is not
   throttled, because both servers are on localhost and the byte counts are reported separately.
3. **Company switch by hash.** `location.hash` with a new `c` is the same code path as the menu (`set({c})` →
   `loadJobs`). This avoids timing popover animations.
4. **Static server with gzip** and a 600 s cache header (my own small server, not a product file), so the
   transfer sizes are comparable to GitHub Pages.
5. **Cold server cost** was isolated with `curl` on a fresh process and `rekeyBoardJobs()` timed in plain Node.
   This separated server CPU from browser CPU.
6. **The walk-through is scripted** (`qa-audit-walk.mjs`), so its clicks, hashes and screenshots can be replayed.
   I read every screenshot and judged the heuristics by hand. Severity: High blocks or misleads the core task,
   Medium is friction, Low is polish.
7. **axe** was injected with `bypassCSP: true`, because the app's CSP (`script-src 'self'`) blocks `addScriptTag`.

**Replayable steps:**
```sh
cd /home/user/melon-seek && npm run build                       # dist/ (87 MB, 8 companies)
SP=<scratch>; (cd $SP/pw && npm i axe-core playwright)          # PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
PORT=5311 node server/index.js &                                # real server
PORT=5310 node docs/process/scripts/qa-audit-static-server.mjs &   # dist/ under /melon-seek/
export NODE_PATH=$SP/pw/node_modules AXE=$SP/pw/node_modules/axe-core/axe.min.js
node docs/process/scripts/qa-audit-perf.mjs     # perf table (PERF_OUT=perf.json)
node docs/process/scripts/qa-audit-reqs.mjs     # per-request bytes, both modes
node docs/process/scripts/qa-audit-prof.mjs     # CPU profile self time (desktop)
node docs/process/scripts/qa-audit-walk.mjs     # job-seeker walk-through, audit/01-11 screenshots
node docs/process/scripts/qa-audit-phone.mjs    # phone walk + tap targets, audit/phone-*.png
node docs/process/scripts/qa-audit-a11y.mjs     # axe on 8 views/themes (AXE_OUT=axe.json)
node docs/process/scripts/qa-audit-kbd.mjs && node docs/process/scripts/qa-audit-kbd2.mjs   # keyboard flow
node -e "import('./server/keywords.js').then(...)"  # rekeyBoardJobs timing (see QA.md)
```
Start the servers with the harness's background mode, not `( … &)` subshells. In this sandbox the subshell
servers were killed when the calling shell exited.

**Verification:**
- 12 perf rows: 2 modes × 2 devices × 3 companies.
- Cold server: rekey takes 3.0 s, 10.2 s and 3.3 s, and the first `/api/market` takes 8.2 s.
- axe: 8 views across light, dark and phone.
- Keyboard: 120-stop Tab sequence plus 6 popovers.
- 18 screenshots in `docs/screenshots/audit/`.
- No product files were edited. The working-tree edits to `public/viz/*` and `public/styles.css` during the audit
  belong to the viz and UX agents.

**Known gaps:** no network throttling (the localhost RTT is about 0). Live mode is unreachable. Real devices
were not used, so the CPU emulation only approximates a mid-range phone. INP was approximated by click → repaint
with rAF, not the Event Timing API. The walk-through covers desktop and phone in light mode; dark mode is covered
by axe only.

**Change log:**
- ~13:15 Built `dist/`, started both servers, installed axe-core in the scratchpad.
- Perf run, request breakdown, CPU profile, and the cold-server isolation (PERF-1).
- Scripted walk-through plus phone walk: UX-1 to UX-14.
- axe in both themes, the keyboard flow and tap targets: A11Y-1 to 5.
- Appended the audit to QA.md, copied the scripts to `docs/process/scripts/qa-audit-*.mjs`, and appended the prompt.

## 9. Compstimate task force (e2e for the spec's test matrix)

**Brief:** automate every scenario of `docs/process/compstimate-taskforce.md` §3.3 as a "Compstimate:" group in
`test/e2e/ui.e2e.js`, against real data. Run it before and after product's fix, and add a drawer = Insights consistency test.

**Decisions:**
1. **Pool and membership checks use `/api/jobs` data.** Comparable ids come from `.ms-comp__item[data-key]` and are
   checked for department, seniority, location keys (`locKey` rule) and `remote`. This follows the spec ("not from product's
   helper").
2. **Renders** are counted as MutationObserver callbacks on `.ms-comp__result` that add nodes, which is one per microtask
   batch, i.e. one per render. `settle()` waits for 450 ms without a render.
3. **Board filters are set through the hash.** That is the same commit path as the panel and avoids "Show all" truncation. T2
   clicks the real Department checkbox. Clear all, Back and Forward, the drawer, comparables and Sort use the real UI.
4. **The basis line is found by text** (the smallest visible element starting "Based on "), so product can rename classes.
   The reset link is matched by role and text "Reset to filters".
5. **Level-word check:** a level word as a title *prefix* (what LEVEL_PREFIX strips), or Staff+ / Senior+ anywhere.
   "Member of Technical Staff" is a title, not a level (the first draft of the regex was a false positive at Cohere).
6. **T21 starts its own cold server** (`startServer({env:{MELON_CACHE_DIR, MELON_HISTORY_DIR}})`, temp dirs). The harness
   gained an `env` option for this.
7. **T22's unit-level FX check** imports `features/shared.js` and `viz/palette.js` in Node and compares `salaryUSD`
   with palette `toUSD` for every salaried Anthropic, OpenAI and Cohere job.
8. **The consistency test** skips jobs whose drawer shows no estimate (Rule 6) until 3 jobs have been compared.

**Replay:** `node scripts/e2e.js --grep='^Compstimate:'` (about 2.5 min), then `node scripts/e2e.js` for the whole suite.

**Results:**
- Stage 1 (matrix automated, product's work in progress): 11/23.
- Stage 2 (product's fix): 20/23. Still failing: T15 and consistency (CT-1: no widget option for a location without
  salaried roles) and T20 (CT-2: auto title "GPT Infrastructure Lead" gives "Not enough" for OpenAI SWE Senior).
- Whole suite: 52/56. Two intermittent issues showed up:
  - The keyboard focus test fails because of BUG-6 (re-render drops focus to body; confirmed by a probe that changes Group-by).
  - The Insights test flaked on timing; it was made robust.
- Six UI tests were updated for intentional changes (company menu buttons, Save label, Juice disclosure).
- Details are in `docs/QA.md` § "Compstimate task force".

**Change log:**
- ~14:00 Spec landed. Wrote 24 tests. Stage 1 was 11/23.
- ~14:20 Product's fix landed. Stage 2 was 20/23.
- I updated 6 UI tests for the new UI and found BUG-6, CT-1 and CT-2. Nothing was committed.
