# Process log: qa-mobile

## 1. Brief
- **Prompt:** [prompts/qa-mobile.md](prompts/qa-mobile.md), verbatim.
- **Goal:** a thorough functional QA pass of the phone site, mainly against the static Pages build, with a
  server-mode spot check. Every bug gets an ID, severity, device, repro, expected vs actual, a screenshot and an
  owner. No product code was changed.
- **Files owned:**
  - the "Full QA pass (mobile) 2026-10-03" section at the end of `docs/QA.md`;
  - this log;
  - the prompt file;
  - `test/e2e/mobile-qa.e2e.js`, plus two lines in `scripts/e2e.js` that import and register it;
  - `docs/screenshots/qa-mobile/`.

## 2. Inputs and sources
- `README.md` and `docs/CONTRACT.md`:
  - data modes;
  - the frontend interfaces;
  - UX-3 canonical location names, which led to M-2.
- `docs/QA.md`, so findings aren't repeated:
  - the earlier suite and the BUG-n/L-n items;
  - the wave-1 audit (UX-*, A11Y-*, PERF-*);
  - the Compstimate section.
- `docs/process/mobile.md`: the phone design and its routed follow-ups (§6). Items 3 and 4 there are still open and
  appear as M-8 and M-13. The "Back with the filter sheet" gap is M-3.
- Source read (read-only):
  - `public/index.html`;
  - `public/app.js`: the mobile section, `setFiltersOpen`, `togglePopover`, `openDrawer`/`closeDrawer`/`stepDrawer`,
    `failures`, `renderFilterPanel`, `makeSalary`/`makeChecklist`/`makeCloud`;
  - the `public/styles.css` phone block;
  - `public/viz/chart.js` click handling and `public/viz/viz.css` `.ms-map`;
  - `scripts/build-static.js` snapshot branch, `server/normalize.js` `relocateJobs`, `server/geo.js` `canonicalName`;
  - `scripts/md.js` `inline()`, `scripts/methodology.js`;
  - `test/e2e/harness.js`, `test/e2e/ui.e2e.js`, `scripts/e2e.js`.
- No skills or external docs were needed.

## 3. Decisions and rationale
1. **The static build is the system under test.** It is what Pages users get. Server mode was spot-checked for the
   same flows, and that comparison exposed M-2: the static path skips `relocateJobs`.
2. **The build went to a private copy.** `npm run build` writes `dist/`, which the desktop QA agent was building at
   the same time; my first build failed with ENOENT on `dist/index.html` in the middle of a parallel rebuild. I ran
   `npm run build` (exit 0), then built an identical private copy with
   `node scripts/build-static.js --out <scratch>/qam/dist`. That copy was served with `DIST=<that dir>` through the
   same `qa-audit-static-server.mjs`, so a rebuild by another agent couldn't change the site mid-run.
3. **Real touch input.**
   - Taps: `page.touchscreen.tap` at element centres.
   - Drags, flicks and pinch: CDP `Input.dispatchTouchEvent` (two touch points for the pinch).
   - Flick speed: CDP adds about 30 ms per event, so a "flick" needs 40–60 px per event to exceed the app's
     0.6 px/ms threshold. Slower synthetic flicks were correctly treated as drags. That is not a bug: real flicks
     are 1–3 px/ms.
4. **Safe areas:** CDP `Emulation.setSafeAreaInsetsOverride` works in Chromium 141. I verified it by measuring an
   `env()`-positioned probe at 47/34. Portrait insets were top 47 and bottom 34 (iPhone 14); landscape were left
   and right 47, bottom 21.
5. **Keyboard:** an init script overrides `VisualViewport.prototype.height` to `innerHeight − 336` while a text
   field has focus and fires `visualViewport` `resize`. This drives the app's own `bindKeyboardInsets()` path
   (`kb-open`, `--vvh`). It does not shrink the layout viewport, which matches iOS and Chrome Android's default
   resize mode.
6. **Audit thresholds** (from the prompt and mobile.md):
   - Tap targets: under 44 px in either dimension, counted only if the element is visible and hit-tests to itself
     at its centre. Labels wrapping inputs are skipped.
   - Text: under 12 px, from computed font-size on text-node parents.
   - Inputs: under 16 px (the iOS zoom trigger).
   - Horizontal scroll: `scrollWidth − innerWidth`.
7. **Independent count check:** for one stacked filter set I recomputed the count in Node from `/api/jobs` with
   `palette.toUSD`, using the app's rules: salary overlap and "on-site" = any non-remote location. Every step
   matched.
8. **Severity scale** (the same as the wave-1 audit): High means a core task is hidden or blocked; Medium means
   friction, wrong output or an a11y failure; Low means polish. Already-known items (UX-7, L1, BUG-5) are not
   re-filed.
9. **The e2e file has passing guards and failing bug tests.** Tests named `[M-n]` encode open bugs and fail today,
   following the suite's existing practice of keeping a failing test for an open bug (BUG-5). The others guard
   flows that work. They run against server mode because `scripts/e2e.js` starts the server, so static-only M-2
   has no e2e test.
10. **Screenshots** are DPR 3. To keep the repo small I kept 39 evidence and overview shots (8.4 MB) and deleted
    the rest.

## 4. Replayable steps
```sh
SP=/tmp/claude-0/-home-user-melon-seek/<session>/scratchpad; mkdir -p $SP/qam
npm run build                                                       # exit 0 (retry if a parallel build races)
node scripts/build-static.js --out $SP/qam/dist                     # private identical copy
DIST=$SP/qam/dist PORT=5471 nohup node docs/process/scripts/qa-audit-static-server.mjs > $SP/qam/static.log 2>&1 & echo $! > $SP/qam/static.pid
PORT=5472 nohup node server/index.js > $SP/qam/server.log 2>&1 & echo $! > $SP/qam/server.pid
# probes: node $SP/qam/s1.mjs … s18.mjs (Playwright from $SP/pw/node_modules, Chromium 1194)
NODE_PATH=$SP/pw/node_modules node scripts/e2e.js --grep='^Mobile QA'
kill $(cat $SP/qam/static.pid) $(cat $SP/qam/server.pid)
```

The probe scripts are scratch files and are not committed. Each one covers one feature group:

| Script | Covers |
|---|---|
| s1 | Landing audit at 4 devices × 2 themes |
| s2 | Top bar |
| s3 | Quick chips |
| s4 | Filter sheet: slider drag, every section, Show N, Back, Reset, ✕ |
| s5 / s5b | Sheet drags, flicks, lazy list |
| s6 | Sort, card, job page: next/prev, Apply, Juice, comps, Back |
| s7 / s7b / s7c | Chart: bins, labels, Ranges |
| s8 / s8b / s8c | Map: pan, pinch, pins, Pay\|Juice, Remote, landscape geometry |
| s9 / s10 | Safe-area override, inset checks |
| s11 | Insights, Compare, keyboard simulation |
| s13 | Save, "N new", CSV |
| s14 | Focus, Back with popovers, rotation |
| s15 | Server vs static |
| s16 / s17 | More/Juice, empty state, methodology, landscape and dark screens |
| s18 | Comps row tap |

The shared helpers they use:

```js
// context
browser.newContext({ viewport, userAgent: IOS, isMobile: true, hasTouch: true, deviceScaleFactor: 3, colorScheme })
// drag / flick
cdp.send('Input.dispatchTouchEvent', { type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: [{ x, y, id: 1 }] })
// pinch: two touchPoints (id 1 and 2) moving apart
// safe area
cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } })
```

## 5. Verification
- **`node scripts/e2e.js --grep='^Mobile QA'` gives 5/8 passed.** The 3 failures are the bug tests: [M-3] Back
  with the filter sheet, [M-4] focus after close, and [M-1] landscape map ("pins under the sheet … 379,326").
- **Probes:** no console or page errors on any device or theme, static or server. No horizontal scroll anywhere
  in the app. All 18 bugs are in the `docs/QA.md` section with repro steps.
- **Screenshots** in `docs/screenshots/qa-mobile/` were reviewed by eye:
  - landing at 360/390/landscape, light and dark;
  - the filter sheet with a chip section;
  - the job page, comps and Juice;
  - the map in portrait, landscape and dark;
  - Insights;
  - the methodology page;
  - the safe-area landscape screens.
- `npm test` was not run. No product code changed, and other agents were editing the tree.

## 6. Known gaps and follow-ups
- No WebKit, so real iOS Safari behaviour (dvh with a collapsing toolbar, a real keyboard, rubber-banding, edge
  swipe-back) is untested. M-3 should be re-checked on a real iPhone, where swipe-back is the common gesture.
- Live boards and map tiles are blocked in the sandbox; the offline basemap was used. Pin label collisions are
  out of scope here, since mobile.md already covers them.
- Pinch on the page itself (outside the map) is allowed by the viewport meta and was not measured.
- Add board on phones was reached through the company menu ("Add a board…") but not submitted. In static mode a
  custom board falls back to demo.
- Next: re-run `--grep='^Mobile QA'` after the fixes. The [M-1]/[M-3]/[M-4] tests should turn green. Add a static
  e2e for M-2, for example by serving `dist/` inside the harness.

## 7. Change log
- 2026-10-03 ~01:28 Built dist (plus the private copy) and started the static and server processes with pid files.
- ~01:30–01:55 Probes s1–s8: layout, top bar, chips, filter sheet, results sheet, job page, chart, map.
- ~01:55–02:10 Safe-area and keyboard simulation, Insights, Save/CSV, focus, Back, rotation, server vs static,
  methodology.
- ~02:10 Wrote `test/e2e/mobile-qa.e2e.js` and registered it in `scripts/e2e.js`. Ran it: 5/8, with the 3 bug tests
  failing as expected.
- ~02:15 Pruned the screenshots. Appended the `docs/QA.md` section (re-read just before the write). Wrote this log
  and the prompt file.
