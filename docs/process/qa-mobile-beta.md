# Process log: qa-mobile-beta

## 1. Brief
- **Prompt:** [prompts/qa-mobile-beta.md](prompts/qa-mobile-beta.md), verbatim.
- **Goal:** a functional QA pass of the phone site for target `beta` (`/melon-seek/beta/` in a local build), on Apple
  (6,105 postings), Google (3,417), NVIDIA (2,664), Microsoft (2,320) and Netflix (456), with Anduril (2,491) for
  comparison. Spend the time on what is new or specific to the beta boards and their size. No product code changed.
- **Files owned:**
  - the "Full QA pass (mobile, beta) 2026-10-10" section at the end of `docs/QA.md`;
  - this log and the prompt file;
  - `test/e2e/beta-mobile-qa.e2e.js`, plus two lines in `scripts/e2e.js` (one import, one `registerBetaMobileQaTests(suite)`);
  - `docs/screenshots/qa-mobile-beta/`.

## 2. Inputs and sources
- `README.md` "Beta site" and `docs/CONTRACT.md` "v3 additions": `live: false` boards are served from their bundle
  with `error: null`, the badge reads "Snapshot · <date>", and no live request is made. Checked directly (M-22 is the
  paused-board case).
- `docs/QA.md` "Full QA pass (mobile) 2026-10-03" (M-1 to M-18): new IDs start at M-19, and each old item was
  re-checked on the beta build (QA.md, "Earlier mobile bugs on the beta build").
- `docs/process/mobile.md`: the phone design (sheet snaps, keyboard insets, lazy card pages). The lazy append of 4 cards
  per frame with no recycling is the cause of M-20.
- `docs/process/PLAYBOOK.md` and `TEMPLATE.md`: stage-1 rules, pid files, at most one browser.
- `docs/process/lead.md` "Persona review of the main site" and the fix-lane prompts in the scratchpad
  (`prompt-fix-app.md`, `prompt-fix-viz.md`, `prompt-fix-estimates.md`, `prompt-fix-pay-data.md`): the P-1 to P-18 and
  I-1 to I-10 items, so they are referenced as known instead of re-filed.
- Parallel stage-1 reports, read before filing to avoid duplicates:
  - `docs/QA.md` "Full QA pass (desktop, beta) 2026-10-10" (D-17 to D-30). D-18 (saved search "N new") and D-24 (Google
    has no departments) reproduce identically on phones, so they are referenced, not re-filed. M-21 adds the phone
    parts of D-25's company-menu finding.
  - `docs/process/data-check-beta.md` (DQ-1 to DQ-17). The phantom "Republic of" location is DQ-10. I had first filed it
    as a mobile bug, then dropped it as a duplicate.
- Source read, read-only: `public/app.js` (state and history, `derive`/`failures`, `renderResults`, `toggleSave`/
  `savedNewCount`, `makeCompanyMenu`, `badgeInfo`, the mobile section, `bindKeyboardInsets`, `setFiltersOpen`),
  `public/styles.css` (phone block, beta pill), `public/viz/map.js` (pins, the 999+ cap), `public/viz/chart.js`
  (bins), `public/viz/palette.js` (FX), `server/companies.js`, `test/e2e/harness.js`, `badge.e2e.js` and `mobile-qa.e2e.js`.
- No skills or external docs were needed.

## 3. Decisions and rationale
1. **The system under test is my own static build**, served by `scripts/cycle/serve.mjs`. The shared `dist/` was not
   written.
   - At first: `node scripts/build-static.js --out <scratch>/qa-mobile-beta/dist` at HEAD `48f913c`.
   - Midway the lead integrated persona fix wave batch 1 (`ea7cd0b`, `be5691c`) into the shared checkout. So I rebuilt
     at `be5691c` (`<scratch>/qa-mobile-beta/dist-head`), re-ran the probes behind every finding (s2, s3, s3b, s10, s12,
     s14, s20) and the e2e group (`BETA_QA_DIST=<dist-head>`), and recorded what batch 1 changed.
   - The e2e tests read the shared `dist/` by default, because that is what the suite uses. That build predates batch 1.
2. **Real touch input:** `page.touchscreen.tap` for taps, and CDP `Input.dispatchTouchEvent` for sheet drags, flicks,
   list swipes, map pans and the two-finger pinch. A flick needs 40-60 px per event to beat the app's 0.6 px/ms
   threshold (each CDP event takes about 30 ms), as noted in the 2026-10-03 pass.
3. **Emulation:** `isMobile`, `hasTouch`, DPR 3 at 360x740 (Android UA), 390x844 and 430x932 (iPhone UA) and 844x390
   landscape (iPhone UA), light and dark. Every request to another host was aborted and recorded, which is how "no live
   request for `live: false` boards" was checked (0 for each big-tech board; Anduril makes its one expected Greenhouse
   attempt).
4. **Simulations:**
   - Safe areas: CDP `Emulation.setSafeAreaInsetsOverride`, portrait top 47 / bottom 34, landscape left and right 47 /
     bottom 21.
   - On-screen keyboard: an init script makes `visualViewport.height` return `innerHeight − 336` while a text field has
     focus and fires `resize`, which drives the app's own `bindKeyboardInsets()`. The layout viewport does not shrink,
     as on iOS Safari and Chrome Android's default. The M-24 screenshot draws a grey box where the keyboard would be.
5. **Counts were checked independently.** `count-check.mjs` unpacks `dist/beta/api/jobs/apple.json` with
   `public/api.js` `unpackJobs` and `palette.toUSD`, then recomputes the app's rules: salary overlap, department and
   seniority. "smax 300k + has salary" gives 3,835, "+ Hardware" gives 1,799, "smin 250k" gives 2,774. Each equals the
   app's "Show N roles" and results title.
6. **Timing method** ("filters and sort answer within a second"):
   - Filter taps: Event Timing (`PerformanceObserver` type `event`), max duration of the pointer/click entries.
   - Sort: in-page, from setting `#sortBy` and dispatching `change` to the next frame (rAF + setTimeout 0), then to idle.
   - Load: a MutationObserver marks the first card and the first chart row.
   - The CPU was 1x, or 4x with `Emulation.setCPUThrottlingRate`. The network was not throttled.

   The machine's load average was 4 to 10 throughout (other agents), so timings are about ±30%. The performance agent
   will measure on a quiet machine.
7. **Memory:** `HeapProfiler.collectGarbage` twice, then `Runtime.getHeapUsage`, after each company switch.
   `performance.memory` is quantised in Chromium, so it was not used.
8. **Severity scale** (the same as the 2026-10-03 pass): **High** blocks or hides a core task; **Medium** is friction,
   wrong output or an accessibility failure; **Low** is polish. Nothing reached High.
9. **Duplicates and renumbering:** an item another stage-1 report already filed with the same cause and the same symptom on phones is
   referenced (D-18, D-24, DQ-10), not re-numbered. Where the phone adds a symptom (the company menu below the fold, and
   the current board not shown), it got its own ID with a pointer (M-21 → D-25). The desktop section quotes my first
   draft numbering; the QA.md section maps it to the final IDs.
10. **E2E encoding:** each `[M-n]` test asserts the expected behaviour, so it fails today. The guards cover the beta
    flows that work: no live request, filter and sort timing, sheet and lazy list, bounded heap, and map gestures. The
    360 px pill check started as a guard and became `[M-27]` when batch 1 broke it. M-20 is encoded as "cards in the page stay bounded (≤ 600) after scrolling past 1,500 roles",
    not as a frame-time threshold, which would be flaky on a loaded machine.
11. **Screenshots** are DPR 3. 62 were kept (14 MB) and the redundant ones deleted. Run
    `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/qa-mobile-beta` before committing (PLAYBOOK stage 3).

## 4. Replayable steps
```sh
SP=/tmp/claude-0/-home-user-melon-seek/<session>/scratchpad; mkdir -p $SP/qa-mobile-beta/probes
node scripts/build-static.js --out $SP/qa-mobile-beta/dist            # 2 min; "beta: 5/5", Apple 2.55 MB warning
node scripts/build-static.js --out $SP/qa-mobile-beta/dist-head       # again after HEAD moved to be5691c (batch 1)
nohup node scripts/cycle/serve.mjs --dist $SP/qa-mobile-beta/dist --pid $SP/qa-mobile-beta/serve.pid > $SP/qa-mobile-beta/serve.log 2>&1 &
export NODE_PATH=$SP/pw/node_modules                                   # Playwright 1.63; never `playwright install`
node $SP/qa-mobile-beta/probes/s1-landing.mjs                          # ... one probe at a time (one browser)
BETA_QA_DIST=$SP/qa-mobile-beta/dist-head NODE_PATH=$SP/pw/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/e2e.js --grep='^Beta mobile QA'
kill "$(cat $SP/qa-mobile-beta/serve.pid)"
```

The probes are scratch files in `<scratch>/qa-mobile-beta/probes/` and are not committed. `lib.mjs` holds the shared
helpers: `openPhone` (context, external-host recorder, error collector), `touchDrag`, `pinch`, `tapSel`, `switchTo`
(company menu with touch), and the `LAYOUT` audit copied from `docs/process/scripts/mobile-audit.mjs`. That audit checks
targets under 44 px that hit-test to themselves, text under 12 px, inputs under 16 px, `scrollWidth`, and fixed or sticky
overlaps.

| Probe | Covers |
|---|---|
| s1-landing | 6 boards × 4 devices (dark at 360 and for Apple): top bar geometry, Beta pill, badge label, layout audit, external requests |
| s2-topbar | Company menu (groups, positions, search + Enter), badge popover and CSV, theme cycle, mode switch collapsing the sheet |
| s3-filters, s3b-salary | Chip row swipe, each chip's section, focus and aria-expanded, More/Juicy, every filter-sheet control, Show N, Back, Reset |
| count-check | Independent counts from the bundle |
| s4-sheet (1x and 4x) | Drags, flicks, handle taps, deep swipes, lazy loading, sort timing, card tap, view-change collapse |
| s5-perf (4x) | Per board: load marks, long tasks, swipe frames, sort and filter-tap latency, search typing, heap |
| s6-memory | Heap and DOM across 12 company switches, then in Map and Insights |
| s7-map | Pins, overlap, pan, pinch, pin tap, Pay\|Juice, Remote at 390, 360 dark, 430 and landscape |
| s8-chart, s8b | Cluster rows per board, bin tap, row-label tap, Ranges labels and row tap |
| s9-insights | Compstimate field sizes and zoom, timings, Compare companies rows |
| s10-job | Job page per board: Back, next/prev and history, Apply, Juice households, methodology link, Same role elsewhere |
| s11-save | Save, "N new" right after saving, simulated new, reopen, un-save, localStorage size |
| s12-states | Layout audit per state (sheet, filters, popovers, drawer, map, Insights, Ranges) at 360, landscape dark, 430 dark |
| s13-device | Safe areas portrait and landscape; keyboard with search, company menu, filter boxes, Location search |
| s14-misc | `#c=amazon/meta/tesla`; sort and filter while scrolled; Filters after a chip; Google departments |
| s15-more, s15b | Comps row tap and Back; the 999+ pin's real count; rotation; Compare companies tap |
| s16-deep (1x and 4x) | 2,000 cards loaded: DOM, heap, swipe frames, sort latency |
| s17-misc2 | Filter dialog semantics, Min/Max label hit area, beta methodology page at 390 |
| s18-shots, s18b | Evidence screenshots |
| s19-modal | Filter sheet `role=dialog`, `aria-modal` and inert background (M-7) |
| s20-head-topbar | The top bar on the `be5691c` build: logo, pill, company name width, badge label (found M-27) |

## 5. Verification
- **`BETA_QA_DIST=<build of be5691c> node scripts/e2e.js --grep='^Beta mobile QA'` gives 5/14.** The 5 guards pass.
  The 9 failures are exactly `[M-19]`…`[M-27]`, the bugs in QA.md.
  - On the shared, older `dist/`, the earlier wording gave 6/14, and `[M-27]` alone passes there.
  - Details are in the QA.md "Suite results" table.
- **Full `node scripts/e2e.js`:** see the QA.md "Suite results" table. That run loaded an earlier draft of this file
  (IDs renumbered afterwards), so the group was re-run alone with the final names.
- **`npm test`** (`node --test test/*.test.js`) at `be5691c`: **664/690 pass, 0 fail, 26 todo**. The todo items are
  the data-check agent's `DQ-n` tests. Two earlier runs during the integration, at load average 9-10, had 1 to 3
  timing failures (PERF-1, which passes alone).
- **By eye:** landing at every size and theme; company menu; badge popover; filter sheet; map at 390, 360 dark,
  landscape; Apple and Microsoft chart; job page portrait and landscape; Juice; Insights; paused-board link; Location
  filter with "Republic of"; keyboard simulation.
- **Console and page errors:** none in any probe. **Horizontal scroll:** none in any state, size or theme.

## 6. Known gaps and follow-ups
- No WebKit, so real iOS Safari (dvh with a collapsing toolbar, a real keyboard, rubber-banding, edge swipe-back) is
  still untested.
- The network was not throttled. Apple's list is 367 kB gzipped (2.55 MB raw), about 1.8 s on Slow 4G (1.6 Mbit/s)
  before parsing. The performance agent should measure Fast/Slow 4G and the 2,000-card scroll (M-20) on a quiet machine.
- D-18 (saved-search "N new") shows here only because this local build has no beta ledger (`history 0 open`). On Pages,
  once the beta ledger carries `firstSeenAt`, `isNewSince` prefers it and hides the cap. It is still worth fixing, since
  the first deploy and an expired ledger artifact both have no ledger.
- Not re-checked here, because other reports already cover them: pay parsing and locations per board
  (`data-check-beta.md`) and the desktop-only beta items (D-19, D-20, D-26 to D-30).
- After the fixes, re-run `--grep='^Beta mobile QA'` on a fresh `npm run build`. Each `[M-n]` should turn green.
- The shared `dist/` is older than batch 1. Rebuild it before relying on the suite's static tests.

## 7. Change log
- 2026-10-10 12:33 Prompt saved; docs read; built into the scratch folder (2 min) and started the server with a pid file.
- 12:40–12:55 s1 to s5: landing, top bar, chips and filter sheet (independent counts), sheet and lazy list, 4x timings.
- 12:55–13:15 s6 to s11: memory across boards, map, chart, Insights, job page, Save (found the "N new" cap).
- 13:15–13:25 s12 to s16: per-state layout audit, safe areas and keyboard (found M-24), paused boards (M-22), sort while
  scrolled (M-19), deep list (M-20).
- 13:25–13:35 Wrote `test/e2e/beta-mobile-qa.e2e.js` and registered it next to the desktop agent's new line in
  `scripts/e2e.js`; first run 5/17 (one guard bug in my test, fixed).
- 13:40–13:50 Read `data-check-beta.md` and the desktop beta section, then dropped my duplicates of DQ-10, D-18 and
  D-24 and renumbered to M-19…M-26. Took the evidence screenshots, pruned the folder, and ran `npm test` and the full
  e2e suite (111/140; every failure is a known bug test, or a timing test that passes alone).
- ~14:05 Found that HEAD had moved to `be5691c` (batch 1 integrated). Rebuilt, re-ran the probes and the e2e group
  (5/14), and filed M-27 (company name cut by the logo and Beta pill at 360/430). Noted what batch 1 fixed: the Apply
  label, the menu headings, "(update due)" and the P-11 note.
- ~14:15 Appended the QA.md section after re-reading the file (only my section was added), and stopped the server.
