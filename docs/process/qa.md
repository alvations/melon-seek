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
