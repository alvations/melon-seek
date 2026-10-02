# Process log: QA (end-to-end suite)

## 1. Brief
- Prompt (verbatim): [`docs/process/prompts/qa.md`](prompts/qa.md).
- Goal: a browser e2e suite, `node scripts/e2e.js`, kept out of `npm test`. It starts the real server,
  checks the API against the Job contract, drives the UI in headless Chromium through the
  required flows, saves screenshots and records bugs in `docs/QA.md`.
- Files owned: `scripts/e2e.js`, `test/e2e/harness.js`, `test/e2e/api.e2e.js`, `test/e2e/ui.e2e.js`,
  `docs/QA.md`, `docs/screenshots/{chart,map,drawer,mobile,dark}.png`, `docs/process/qa.md`,
  `docs/process/prompts/qa.md`. No other team's files were edited.

## 2. Inputs and sources
- `docs/CONTRACT.md`: the Job and Raw job shapes, the HTTP API (modes, fallback order, custom
  boards), the frontend module interfaces. The API validator (`validateJob`) is a direct translation
  of the Job section.
- `server/companies.js`: built-in slugs and boards, custom-board validation (expected 400 and 404 codes).
- `server/index.js`: confirmed `PORT` env, static and `/vendor/leaflet` routes, demo fallback.
- `public/index.html` and `public/app.js` (read-only): ids and classes the suite relies on: `#resultsTitle strong`
  ("N roles"), `#resultsList .card[data-id]`, `#companyPills` buttons, `.topbar .seg button[data-mode]`,
  `#filterBody details.fsec` with `.fsec-title`, `label.check`/`.check-label`/`.check-count`,
  `button.kw[data-kw]`, `input.range--lo`, `#drawer`/`#drawerTitle`/`a.apply`, `#filtersToggle`, `#popover`.
  Hash keys: `c, m, smin, smax, d, l, ks, job`. Page size is `PAGE = 60`.
- `public/viz/chart.js` and `public/viz/map.js` (read-only): `.ms-row__bar` (Ranges view), `.ms-crow__band`
  (Clusters view), `.ms-pin` inside Leaflet `.leaflet-marker-icon[aria-label]`.
- `public/viz/palette.js`: `toUSD()`, imported by the salary test so its check matches the app's
  approximate-USD comparison.
- No skills or external docs were used. Playwright API knowledge only.

## 3. Decisions and rationale
1. **Hand-rolled runner (`createSuite`) instead of `@playwright/test` or `node --test`.** The repo is
   allowed only `leaflet` as a dependency, and the brief says e2e must stay out of `npm test`. A
   tiny sequential runner keeps going after failures, prints a summary, and exits 1 if any test fails.
   Test files are named `*.e2e.js` and only export `register*()`, so `node --test test/` finds
   nothing to run in them (verified: `npm test` still reports 103/103 and no e2e tests).
2. **Spawn `node server/index.js` with `PORT=<free port>`** (found by binding port 0 and closing it). Readiness is
   polling `/api/companies`. Spawning tests the real entry point, which an in-process import
   would not.
3. **Playwright resolution** (`loadPlaywright`): `$PLAYWRIGHT_MODULE`, then `playwright`, then
   `playwright-core`, via `createRequire` with `paths: [repo, ...NODE_PATH]`. ESM `import()` ignores
   NODE_PATH, which is why `createRequire` is used. If nothing resolves, the script prints install
   instructions and exits 2. `--api-only` needs no browser.
4. **Browser resolution** (`findChromium`): `$CHROMIUM_PATH`, then the newest
   `chromium-*/chrome-linux/chrome` under `$PLAYWRIGHT_BROWSERS_PATH` or `/opt/pw-browsers`, passed
   as `executablePath`. This avoids a revision mismatch between the installed Playwright (1.56 or 1.63)
   and the preinstalled Chromium 1194 (141.0.7390.37). `playwright install` is never run.
5. **All external hosts are aborted at the context level** (`context.route`). This makes runs
   deterministic and fast (no waiting on fonts, tiles or boards). Console "Failed to load resource" errors are
   ignored only when they come from an external URL. Same-origin request failures, HTTP 4xx/5xx and
   `pageerror` always count as errors.
6. **Correctness is checked against API data, not just "the count went down".** Salary, skills,
   department and location tests check every rendered card's job (by `data-id`) against
   `/api/jobs`. Counts are checked against an API-side recomputation or the facet count shown in the
   UI.
7. **Each UI test uses a fresh browser context**, so localStorage (saved boards, collapsed filters)
   cannot leak between tests.
8. **Split fatal checks from the flows they observe.** Pin clipping and mobile accessible names are
   recorded during the map and mobile flows and asserted in their own tests. That way the main flow
   still reports pass or fail independently, and a regression in one does not hide the other.
9. **Selectors:** roles and text where they are stable (`getByRole('dialog', {name: title})`,
   `getByRole('link', {name:/apply/i})`, `getByLabel('Board slug')`, `getByRole('searchbox')`). Ids and classes
   elsewhere. The mode toggle uses `[data-mode]` because its accessible name disappears below 1020px
   (BUG-3). It is scoped to `.topbar .seg` because `<html data-mode>` also matches.
10. **Thresholds:** demo should return at least 40 jobs (contract says about 60-150). At least 30% of jobs need a salary,
    skills and geocodes. Salary must fall between 10k and 5M with `interval: "year"`. Dark mode needs background
    luminance below 0.3 and text above 0.6. "No horizontal scroll" means `scrollWidth <= clientWidth` for the
    document and the body.

## 4. Replayable steps
```sh
cd /home/user/melon-seek
ls /opt/pw-browsers          # chromium-1194, chromium_headless_shell-1194, ffmpeg-1011

# Option A, what was done first: scratchpad install, never touching package.json
SP=/tmp/claude-0/<session>/scratchpad
mkdir -p $SP/pw && cd $SP/pw && npm init -y && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright   # 1.63.0
cd /home/user/melon-seek && NODE_PATH=$SP/pw/node_modules node scripts/e2e.js

# Option B: this sandbox already has playwright 1.56.1 resolvable at
# /opt/node-tools/node_modules/playwright, so a plain run also works:
node scripts/e2e.js
# Elsewhere: npm i playwright --no-save && node scripts/e2e.js

node scripts/e2e.js --api-only          # 8 API/static tests, no browser
node scripts/e2e.js --grep=round-trip   # subset by name
E2E_SERVER_LOGS=1 node scripts/e2e.js   # also dump server stdout/stderr on failure
npm test                                # unit tests; e2e is not included
```
The script prints which Playwright module and Chromium binary it used.

## 5. Verification
- Final full run: **22/25 passed, 3 failed**, stable across 3 consecutive runs:
  map initial fit clips pins (BUG-1), mobile buttons without names or text (BUG-2 and BUG-3), company pills
  clipped at 1440px (BUG-4). Details and repro steps are in `docs/QA.md`.
- `--api-only`: 8/8 passed. `npm test`: 103/103 (e2e not picked up).
- Screenshots: `docs/screenshots/chart.png`, `map.png`, `drawer.png`, `dark.png` (1440x900),
  `mobile.png` (390x844).
- Manual checks behind the bugs: screenshots of the map (SF pin past the left edge) and of the
  mobile filter sheet (the Remote segmented control is blank). `elementFromPoint` at the SF pin's centre
  returns `main`.

## 6. Known gaps and follow-ups
- Only demo mode can be exercised here. Live, cache and snapshot paths are covered by the backend's unit tests,
  not e2e.
- Not covered: chart hover tooltips, group-by and colour-by, sort order, seniority, employment and
  posted filters, drawer prev/next, refresh, removing a saved board, the remote badge on the map.
- The app UI was still changing during QA (the default chart became Clusters, and the company list went
  9 → 8). Selectors that depend on those details (`.ms-crow__band`, Ranges/Clusters buttons) fall back
  where they can, but may need updating if the viz changes again.
- Possible next step: add an `--update-screenshots` / visual diff, and a CI job that installs
  Playwright with `--no-save`.

## 7. Change log
- 2026-10-02 05:2x: read the contract. Installed playwright 1.63.0 in the scratchpad and confirmed it
  launches `/opt/pw-browsers/chromium-1194`.
- 05:3x: wrote the harness, runner and API tests. Waited for `public/app.js`, `server/demo.js` and the rest to land.
- 05:4x: first runs showed readiness timeouts while the files were half-written, and a strict-mode clash
  between `<html data-mode>` and the `[data-mode]` toggle. Fixed the selectors, added diagnostics to `waitReady`.
- Salary check switched to approximate USD via `palette.toUSD` after the app started converting currencies.
- Added pin-clipping, mobile accessible-name, company-switcher, keyboard and offline-basemap checks
  after looking at the screenshots and DOM.
- Chart check accepts the new default Clusters view (`.ms-crow__band`) and switches to Ranges for per-job bars.
- Wrote `docs/QA.md`, this log and the verbatim prompt file.
