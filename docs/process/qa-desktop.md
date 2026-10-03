# Process log: desktop QA

## 1. Brief
- **Prompt:** [`docs/process/prompts/qa-desktop.md`](prompts/qa-desktop.md), pasted verbatim.
- **Goal:** a thorough functional QA pass of the desktop site, in static (GitHub Pages) and server mode, on real
  snapshot data. Every feature in the brief was in scope, at 1440x900 and 1280x800, in light and dark.
- **Rules:** no product code changes.
- **Files owned:**
  - `docs/QA.md`: the "Full QA pass (desktop) 2026-10-03" section;
  - this log;
  - `docs/screenshots/qa-desktop/`;
  - `test/e2e/desktop-qa.e2e.js`, plus a two-line registration in `scripts/e2e.js`.

## 2. Inputs and sources
- **Docs read:**
  - `README.md`: data modes, static build layout, share pages, link policy and the methodology page.
  - `docs/CONTRACT.md`: Job shape, the v2 additions, and UX-3 canonical location names.
  - `docs/QA.md`: earlier bugs, so they weren't re-reported. UX-1/2/4/5 and BUG-1…6 were re-verified as fixed
    or not.
  - `docs/process/TEMPLATE.md`, and the mobile QA section and log for format.
- **Code read** (for selectors, hash keys and likely owners; read only):
  - `public/app.js` (all of it);
  - `public/viz/chart.js` (cluster selection, keyboard, overflow, `keyOf`);
  - `public/viz/map.js` (pins, the Remote control, Pay|Juice);
  - `public/features/compstimate.js` (`reset` / `fillForm` / `refresh`);
  - `public/features/comps.js` and `insights.js` (DOM classes);
  - `server/geo.js` (`canonicalName`), `server/normalize.js` (`relocateJobs`) and `server/pipeline.js`;
  - `scripts/build-static.js` (the snapshot load);
  - `server/sources/ashby.js` (the remote flag);
  - `test/e2e/harness.js`, `ui.e2e.js` and `mobile-qa.e2e.js` (conventions).
- **Tools:**
  - Playwright 1.63, from the session scratchpad's `pw/node_modules`;
  - Chromium 141 at `/opt/pw-browsers/chromium-1194`;
  - axe-core 4.13, from the same `node_modules`.
- No skills were needed. No external URLs, since the sandbox blocks them.

## 3. Decisions and rationale
1. **Freeze the code under test.** Mid-pass, server mode started throwing
   `ReferenceError: Cannot access 'binPx' before initialization`.
   - Cause: other agents (fix-frontend, perf-mobile) were editing `public/` in the shared working tree, and the
     server serves that tree live.
   - Fix: export `git archive HEAD` (15ac5fc) to the scratchpad and run both modes from it. Every finding was
     re-run on that export.
   - The WIP crash is reported as a note, not a D-bug.
2. **Truth source for counts and order:** the app's own `public/api.js` `getJobs()` and `viz/palette.js`
   `toUSD`, imported in the page.
   - These give the same jobs the UI sees, after vetting, juice and unpacking.
   - Raw `/api/jobs` would miss the static unpack and the browser-side vetting.
3. **Faceted-count consistency checks:**
   - after selecting a value, the result count equals its facet count;
   - single-valued facets (seniority) sum to the filtered count;
   - a facet's counts don't change when its own value is selected.
   - Location is multi-valued, so it is only checked against the data.
4. **History features** (Listed, Newest, Listing block, New, Reposted): the snapshots have no ledger
   (`ageDays: null` everywhere). In server mode, `/api/jobs?company=cohere` was intercepted with `page.route`, and
   job `i` got:
   - `ageDays = 3i`;
   - `ageIsMinimum` when `i % 7 = 6`;
   - `repost` when `i % 10 = 5`.

   Expected counts came from that formula.
5. **"N new" for saved searches:** simulated by dropping ids from `melon.saved[0].seen` and backdating
   `lastSeenAt`, the fallback path when there is no ledger. A new `browser.newContext({ storageState })` stands in
   for a new browser session.
6. **Slider drag:** a real mouse drag that starts on the thumb centre (`x + 8`). A first probe at `x + 2` missed
   the 16px thumb, which was a test artifact and not a bug. The lock-up (D-3) reproduces from the thumb centre.
7. **Severity:**
   - **High:** wrong or misleading data in the main view, for most users. D-1 is what Pages serves.
   - **Medium:** a filter or count that misleads, a control that can lock, or a documented shortcut that doesn't
     work in its default state.
   - **Low:** consistency, polish or edge paths.
8. **Not filed** (by design or a test artifact):
   - only one recent pill below 1600px (CSS);
   - focus returns to the opening card, not the last stepped one (WAI-ARIA dialog practice);
   - Title A–Z ignores the `[London]` tag (`_titleTag`);
   - the CSS-uppercased group labels;
   - map pins outside the view after a user pan or zoom.
9. **e2e convention**, copied from mobile QA: guard tests plus `[D-n]` tests that fail until the bug is fixed.
   - `[D-1]` serves `dist/` itself, on a free port under `/melon-seek/`, and skips when there's no build.
   - Data-dependent tests skip on demo data.

## 4. Replayable steps
`SP` is the session scratchpad. Ports 5481 and 5482 were free.
```sh
npm test                                     # 294/294 at start (19 s)
NODE_PATH=$SP/pw/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/e2e.js   # baseline 56/56
npm run build                                # first attempt: ENOTEMPTY (another agent building at the same time); retry OK

# frozen copy of HEAD (other agents edit public/ live)
git archive HEAD | tar -x -C $SP/head
ln -s $PWD/node_modules $SP/head/node_modules
mkdir -p $SP/head/data && cp -r data/snapshots $SP/head/data/
(cd $SP/head && node scripts/build-static.js)    # 8 companies, all snapshot

# servers, with pid files
# 'exec' keeps $! equal to the node pid (a 'cd && node &' list records a subshell pid instead)
DIST=$SP/head/dist PORT=5481 nohup node docs/process/scripts/qa-audit-static-server.mjs > $SP/qa/static.log 2>&1 & echo $! > $SP/qa/static.pid
PORT=5482 nohup bash -c "cd $SP/head && exec node server/index.js" > $SP/qa/server.log 2>&1 & echo $! > $SP/qa/server.pid
```

**Exploratory scripts** (scratchpad `qa/*.mjs`, using `lib.mjs` and `jobs.mjs`). Each runs both modes:
- `a`: company menu, recents, Add board, search ranking, every sort.
- `b`: every filter on Anthropic, OpenAI and Anduril.
- `c`: chart.
- `d`: map on Anthropic, Anduril, OpenAI and Shield AI.
- `e`: Insights on Anthropic, OpenAI and Cohere.
- `f` / `f2`: drawer on Anthropic, OpenAI, Anduril, Palantir and Cohere.
- `g`: save, CSV, theme, shortcuts, hash, share pages.
- `h`: 2 viewports × 2 themes × 5 views, 6 popovers and the drawer, with axe.
- `i`: injected history.
- `drag2` / `e-probe*`: isolate D-3 and D-5.
- `evidence.mjs`: writes `docs/screenshots/qa-desktop/D-*.png`.

On 15ac5fc the exploratory scripts had **1,087 PASS and 50 FAIL**. Every FAIL is either one of the D-bugs, in
both modes, or one of the test artifacts in §3.8.

```sh
# the e2e group, against the HEAD export (my file + registration copied there)
node scripts/e2e.js --grep='^Desktop QA'     # 10/22 pass; the 12 fails are [D-1]..[D-12]
# final full suites on the shared working tree
npm test && node scripts/e2e.js
# stop servers
kill $(cat $SP/qa/static.pid) $(cat $SP/qa/server.pid)
```

## 5. Verification
- **`npm test`:** 294/294 at the start and 301/301 at the end. The working tree had gained other agents' tests.
- **`node scripts/e2e.js`:**
  - Baseline: 56/56, before the mobile and desktop groups were registered.
  - Final run on the working tree (HEAD `3eb353d` plus this pass's files): **75/86**. The only failures are the
    11 tests `[D-2]`…`[D-12]`. `[D-1]` passes because `db18658` fixed it (the same bug as mobile M-2).
- **Desktop QA group on 15ac5fc:** 10/22. The 10 guard tests pass, and the 12 `[D-n]` tests fail as expected.
- **Screenshots:** `docs/screenshots/qa-desktop/D-1` … `D-16`, static and server variants where both apply.
- **Manual review** of the screenshots, light and dark, at 1440 and 1280:
  - landing; Group by Location; cluster chip; map (pay and dark);
  - the Insights scroll; the dark drawer with the waterfall; the Location popover (D-1); the facet popover (D-2).

## 6. Known gaps and follow-ups
- **Live fetches** weren't exercised, because outbound traffic is blocked. Every mode is snapshot, plus demo for
  custom boards.
- **Map tiles** were offline (fallback only).
- **Ledger:** Listing, New and Reposted, and "N new" with `firstSeenAt`, were tested with injected data only.
  Re-run `i-history` once a real ledger exists.
- **D-4:** the raw Ashby payload isn't in the snapshot, so whether `isRemote` really is true for 502 on-site
  OpenAI roles can't be checked here. Verify with a live fetch on CI.
- **The `binPx` working-tree regression** was transient: the committed `3eb353d` declares `binPx` first, and
  the cluster tests pass.
- Running `node scripts/e2e.js` rewrites `docs/screenshots/*.png`, as the existing UI suite does. Those
  modifications come from the suite, not from a deliberate change.
- **Not covered:**
  - Firefox and Safari;
  - real screen readers (only axe contrast and ARIA attributes were checked);
  - performance (see the wave 1 audit).

## 7. Change log
- 2026-10-03 01:10: read the docs and code, then ran `npm test` (294/294) and e2e (56/56). Built, and started the
  servers on the working tree.
- 2026-10-03 01:30–02:00: ran exploratory scripts a–g. Found D-1 … D-12.
- 2026-10-03 ~02:00: the working tree changed under the server (the `binPx` crash). Froze HEAD 15ac5fc in the
  scratchpad, rebuilt, restarted the servers and re-ran every script (same findings).
- 2026-10-03 02:20: visual and axe pass (clean). Injected-history pass (clean). Evidence screenshots D-1 … D-16.
- 2026-10-03 02:40: `test/e2e/desktop-qa.e2e.js` (22 tests), registered in `scripts/e2e.js`. Ran it on HEAD
  (10/22, as expected). docs/QA.md section and this log.
- 2026-10-03 02:50: final suites on the working tree. `npm test` 301/301. e2e 75/86, the failures being
  `[D-2]`…`[D-12]`. D-1 was fixed upstream in `db18658` (M-2), and D-13…D-16 were re-checked on the final tree.
  Servers stopped. The pid files had recorded the wrapper subshells, so the node pids were found through
  `/proc/*/cmdline` and cwd, and stopped with `kill <pid>`. §4 now uses `exec`.
