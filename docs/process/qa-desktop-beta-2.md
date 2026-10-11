# Process log: qa-desktop-beta-2

The second desktop QA pass of the beta site (`/melon-seek/beta/`), after fix wave 3 (2026-10-11).

## 1. Brief
- **Prompt:** [prompts/qa-desktop-beta-2.md](prompts/qa-desktop-beta-2.md), saved verbatim.
- **Goal:** a functional pass of every desktop feature on the five big-tech boards (Apple, Google, NVIDIA,
  Microsoft, Netflix) plus Anduril from the main site; re-check the first pass's D-17 to D-30; check every fix
  wave 3 change (BP-1 to BP-17, the beta landing, the fix3-viz chart and map changes) on desktop; file new bugs
  from D-31. No product code changed.
- **Files owned:** the "Full QA pass (desktop, beta) 2026-10-11" section of `docs/QA.md`; this log; the prompt
  file; `test/e2e/beta-desktop-qa-2.e2e.js` and its registration in `scripts/e2e.js`; the screenshots in
  `docs/screenshots/qa-desktop-beta-2/`.

## 2. Inputs and sources
- `README.md`, `docs/CONTRACT.md`, `docs/process/PLAYBOOK.md` (targets, known traps: pid files, load-sensitive
  timing tests), `docs/process/TEMPLATE.md`.
- `docs/process/lead.md`, the beta sections (stage 1, fix batches 1 and 2, stage 1b perf, stage 1c personas,
  fix wave 3), for what was fixed and what is known (DQ-27 to DQ-32, the vetting's VT items).
- `docs/QA.md` "Full QA pass (desktop, beta) 2026-10-10" (D-17 to D-30) and "Full QA pass (mobile, beta)
  2026-10-10" (M-19 to M-27), so no known bug is filed twice. The highest beta desktop ID was D-30.
- The fix wave 3 lane logs (`fix3-app.md`, `fix3-viz.md`, `fix3-compare.md`, `fix3-data.md`), for the exact
  behaviour each BP fix promises (e.g. fix3-viz decision 6, pin names and merging, offline only).
- Code read to find causes, never changed: `public/app.js` (`failures`, `queryMatchers`, the keydown handler,
  `copyLink`, the board removal in Add board), `public/viz/map.js` (`draw`, `mergeInto`, `layoutLabels`),
  `public/features/roles.js` (`levelKey`), `server/salary.js` (`parseSalary` level grouping, around line 909),
  `test/e2e/harness.js`.
- The built site itself: the app's own `api.js` `getJobs()` in the page (the same prepared jobs the UI uses:
  `_usd`, `_mid`, `ageDays`, `juice.best`) was the reference for every count and order; raw snapshots in
  `data/beta/snapshots/` were read only to find causes (the Microsoft pay texts).

## 3. Decisions and rationale
1. **The lead's build, not my own.** As the note says, I served `<scratch>/cycle-beta4/dist` (built
   2026-10-11T12:09Z from the fix wave 3 head, beta 5/5) with `scripts/cycle/serve.mjs` and a pid file. No
   server-mode check was needed beyond the first pass's `[D-20]` test, which starts its own
   `MELON_CHANNEL=beta` server and passed.
2. **Re-checking D-17 to D-30 with the first pass's own tests.** `test/e2e/beta-desktop-qa.e2e.js` reads only
   `ROOT/dist`, and the shared `dist/` is from 2026-10-10 12:32 (before both beta fix batches and fix wave 3).
   I did not edit that file or write `dist/`: I ran a scratch copy whose `serveDist()` reads `BETA_QA_DIST`
   (`<scratch>/qa-desktop-beta-2/old/`, a `sed` of two lines) with a 20-line runner that registers one file.
   Then I checked each bug by hand as well.
3. **Full e2e suite against today's build.** Seven suites (badge, desktop-qa, fix-app, fix-estimates,
   fix-pay-data, fix3-viz, beta-desktop-qa) read `ROOT/dist` only. A run in the shared checkout would test
   them against the stale build. So the full suite ran in a scratch mirror of the repository
   (`<scratch>/qa-desktop-beta-2/mirror/`): `test/`, `scripts/`, `server/`, `public/` and `docs/` copied,
   `data/` and `node_modules/` symlinked, and `dist` a symlink to the lead's build, with
   `BETA_QA_DIST` set too. `server/` has to be a copy: `server/index.js` only starts when it is the main
   module, which a symlinked path is not. `docs/` is a copy so the suite's screenshot rewrites stay out of
   the shared checkout.
4. **The offline map is the state under test.** Every host but the local server was aborted (as in the first
   pass), so the map ran with "Basemap unavailable · pins still work", where fix3-viz shows pin names and
   merges pins whose names don't fit. To see whether D-31 reaches users with a working basemap, I served a
   1x1 PNG for the OpenStreetMap tile URLs: the pins then have no names and are not merged, so D-31 is
   offline-only. That decided Medium rather than High.
5. **Severity.** High: wrong output on a core task for most users; Medium: wrong output in a supported state
   or an interaction that misleads; Low: labelling, consistency, polish. Known items from the data check and
   the vetting (DQ-27, DQ-28, DQ-29, the Netflix $1.2M bound) were seen on the desktop and noted, not re-filed.
6. **Deterministic tests for time-of-day bugs.** D-33 (two ages) only shows some hours after the crawl. The
   test picks, from the build's own data, a Google posting and a time within 24 h of `fetchedAt` at which the
   two counts differ, fixes the page clock there (`page.clock.setFixedTime`) and compares the drawer's two
   numbers. It passes once both ages are counted the same way, whichever way the fix goes.
7. **Generic assertions over hard-coded IDs.** The D-31 test asserts that zooming into a pin never produces a
   pin holding more postings than any pin at the world view (merging can only add up; zooming in should only
   split). D-34 picks any Microsoft pay text with two distinct IC levels. D-36 flags a "City, US" label next
   to a "City, <state>" label in the same country. D-32 uses a list of store-name patterns.

## 4. Replayable steps
`<scratch>` is `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad`;
`Q=<scratch>/qa-desktop-beta-2`.
1. Serve: `node scripts/cycle/serve.mjs --dist <scratch>/cycle-beta4/dist --pid $Q/serve.pid` (printed port
   44935). Stop: `kill "$(cat $Q/serve.pid)"`.
2. Playwright for ad-hoc scripts: `ln -s <scratch>/pw/node_modules $Q/node_modules` and
   `echo '{"type":"module"}' > $Q/package.json` (ESM ignores `NODE_PATH`). `$Q/lib.mjs` holds the helpers
   (fresh context, other hosts aborted, console and page errors collected, `ready()`, `count()`).
3. Exploration scripts, one area each, run one at a time (`node $Q/sN.mjs`): s1 landing, badges, requests;
   s2/s2b company menu, recents, Add board; s3 search ranking; s5/s5b facet counts and chips; s6 department
   and location names; s7/s7b split places; s8b salary; s9b sorts; s10b/s11/s12 chart, Ranges, Group by,
   BP-2; s13/s13b map; s14/s14b/s15/s32/s32b Insights; s16-s21c drawer, Juice, comps, Copy link, j/k; s22
   save, CSV, theme, shortcuts, hash, history; s23/s24 links, methodology, share pages; s25 timings; s26
   layout and axe colour contrast at 3 widths × 2 themes; s27* the D-31 map collapse; s28-s31 BP checks;
   s33/s33b paused boards and beta links on the main site.
4. First pass's tests on today's build:
   `sed -e "s#path.join(ROOT, 'dist')#path.resolve(process.env.BETA_QA_DIST)#" -e "s#from './harness.js'#from '/home/user/melon-seek/test/e2e/harness.js'#" test/e2e/beta-desktop-qa.e2e.js > $Q/old/beta-desktop-qa.e2e.js`,
   then `BETA_QA_DIST=<scratch>/cycle-beta4/dist NODE_PATH=<scratch>/pw/node_modules node $Q/old/run.mjs $Q/old/beta-desktop-qa.e2e.js`.
5. This pass's tests: `BETA_QA_DIST=<scratch>/cycle-beta4/dist NODE_PATH=<scratch>/pw/node_modules node scripts/e2e.js --grep='^Beta desktop QA 2'`
   (or `node $Q/old/run.mjs /home/user/melon-seek/test/e2e/beta-desktop-qa-2.e2e.js`).
6. Screenshots: `node $Q/shots.mjs` writes the bug screenshots to `docs/screenshots/qa-desktop-beta-2/`.
7. `npm test` in the shared checkout (`$Q/npm-test.log`), then `node --test test/perf.test.js` twice alone.
8. Full e2e in the mirror (decision 3): `cd $Q/mirror && NODE_PATH=<scratch>/pw/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers BETA_QA_DIST=<scratch>/cycle-beta4/dist node scripts/e2e.js` (`$Q/e2e-full.log`).

## 5. Verification
- First pass's tests on today's build: **19/19 pass**, so D-17 to D-30 are fixed. Each was also checked by hand
  (see the QA section).
- This pass's tests: **3/10 pass** (the 3 guards); the 7 failures are exactly `[D-31]` … `[D-37]`.
- Exploration: about 175 facet checks on six boards, every sort on six boards (120 cards each), 58 layout
  checks with axe colour contrast (0 violations), 0 console or page errors in any flow.
- `npm test` and the full e2e results are in the QA section's "Suite results".
- Screenshots: `docs/screenshots/qa-desktop-beta-2/D-31-*.png` … `D-37-*.png` (10 files).

## 6. Known gaps and follow-ups
- One renderer crash ("Target crashed") happened once, while zooming the Apple map out six times quickly after
  a pin click, at load average about 14. Two re-runs of the same steps did not crash, and heap stayed at
  18–44 MB. Not filed; worth watching if D-31's merge loop is changed.
- Live fetches, map tiles and the careers hosts behind Apply cannot be reached from the sandbox.
- The shared checkout moved to 97bb154 during the pass ("Amazon and Meta resumed", 3f47ddc). The build under
  test predates it, so Amazon and Meta were absent, as the brief expects; a rebuild will list them, and the
  next pass should test them.
- Timings were taken at load averages of 1 to 14 (other agents), so they are upper bounds.

## 7. Change log
- 2026-10-11 12:40 UTC: served the lead's build; read the docs.
- 2026-10-11 12:45: first pass's tests 19/19 on today's build.
- 2026-10-11 12:50–13:45: exploration, area by area; D-31 to D-37 found.
- 2026-10-11 13:45: `test/e2e/beta-desktop-qa-2.e2e.js` written and registered; 7 red, 3 green.
- 2026-10-11 13:50: screenshots; `npm test`; full e2e in the mirror; QA section written.
