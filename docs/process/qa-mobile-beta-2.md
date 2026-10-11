# Process log: qa-mobile-beta-2 (second mobile QA pass on beta)

## 1. Brief
Prompt: [prompts/qa-mobile-beta-2.md](prompts/qa-mobile-beta-2.md). A functional QA pass of the phone beta site
(`/melon-seek/beta/`) after fix wave 3, with the user's report ("the list of companies don't scroll properly when
we're in the beta mode") as the top item: reproduce it, then audit every scrolling area on the phone. No product code
is edited. Files owned: this log, the prompt, the "Full QA pass (mobile, beta) 2026-10-11" section of docs/QA.md,
test/e2e/beta-mobile-qa-2.e2e.js (and its registration in scripts/e2e.js), docs/screenshots/qa-mobile-beta-2/,
docs/process/patches/qa-mobile-beta-2-webkit.diff.

## 2. Inputs and sources
- README.md, docs/CONTRACT.md, docs/process/{PLAYBOOK,TEMPLATE,mobile}.md; lead.md beta sections (stage 1, fix batches
  1 and 2, perf, persona review, fix wave 3); docs/QA.md "Full QA pass (desktop, beta) 2026-10-10" and "Full QA pass
  (mobile, beta) 2026-10-10" (highest mobile ID M-27, so new bugs start at M-28).
- Code read for the user's report: public/styles.css (popover 499-517, company menu 830-860, the phone block
  1040-1215, the tablet bottom-sheet rule 665-668), public/app.js `makeCompanyMenu()` (1494-1548), `togglePopover()` /
  `syncPopover()` / `closePopover()` (2316-2380), `prefetchSaved()` (1715), `render()` (1150), `bindSheetDrag()`
  (4121), `bindKeyboardInsets()` / `revealField()` (4196-4232), the outside-tap close (4426).
- Build: the lead's `<scratch>/cycle-beta4/dist` (built 2026-10-11T12:09:34Z from 3cf226e with today's crawl), served
  by `scripts/cycle/serve.mjs` with a pid file.

## 3. Decisions and rationale
1. **Real phone viewports, not only the emulated ones.** Chromium's device emulation has no browser toolbars, so a
   "390x844" phone shows 844 CSS px; Safari on that phone shows about 390x664, an iPhone SE about 375x548. The trap is
   a height problem, so the probes add those sizes plus 360x640, 320x568, 844x340 and 568x320.
2. **"Last company fully visible" as the pass criterion**, measured as the visible fraction of the last row clipped by
   the list, the sheet body and the visual viewport (`menuGeom`). Scroll offsets alone pass the broken case: the list
   reaches its end while its end is off screen.
3. **M-28 to M-30 are three bugs, not one,** because each has its own cause and fix (CSS nesting; JS focus on open; JS
   rebuild in `sync()`). M-29 and M-30 make M-28 more likely on real phones.
4. **The WebKit fallback is a wheel, not synthetic TouchEvents.** Dispatched TouchEvents don't scroll in any engine;
   a wheel scrolls the innermost scroller and chains by the same overscroll-behavior rules. `BETA_QA2_WHEEL=1`
   proved the fallback gives the same numbers as CDP touch in Chromium.
5. **The simulator job injects a probe instead of using safaridriver.** A WebDriver session in Safari blocks real user
   input, and real touch (idb) is the point of the job. The probe is same-origin (the CSP is `script-src 'self';
   connect-src 'self' …`), added by the job's own server to `beta/index.html` only.
6. **M-30's test delays the other boards' lists by 1.5 s** (route), since on a quiet machine they finish before a test
   can open the menu; on a phone's 4G they take seconds. The cause (rows replaced while the menu is open) is what the
   test checks; the tap loss itself is iOS-only.
7. **Dropped as not bugs:** the logo's hit area is 34x44 via `::before` (styles.css:1355), so a draft "M-31" on the
   26x26 logo box was withdrawn and the ID reused for the half-sheet message; a pull-down at the top of the full
   results list doesn't collapse the sheet, by design (mobile.md:42).

## 4. Replayable steps
All probes are scratch scripts in `<scratch>/qa-mobile-beta-2/` (lib.mjs: open a phone context with isMobile, hasTouch,
DPR 3, iPhone UA, all other hosts aborted; `touchDrag` = CDP `Input.dispatchTouchEvent` start, 8-12 moves, end).
1. `node scripts/cycle/serve.mjs --dist <scratch>/cycle-beta4/dist --pid <scratch>/qa-mobile-beta-2/serve.pid &`
2. `node p1-menu.mjs <WxH,...> [beta/|main] [hash]`: open the company menu, swipe up on the visible rows 6 times
   (85% -> 15% of the visible part of the list), report the sheet, the sheet body and the list geometry, both scroll
   offsets and how much of the last company is visible.
3. `node p2-menu.mjs`: start points (search box, heading, sheet header), 3 fast flings, rows-to-end then the search
   box; 5 saved searches injected into `melon.saved`; the simulated keyboard (visualViewport.height = innerHeight - kb
   while a text field has focus, the method of the first pass) at 390x844/336, 360x640/300, 320x568/260 and
   844x390/190; typing "n"; a pull-down at the top.
4. `node p3-rebuild.mjs`: a MutationObserver on `.company-list` while a slow 60-step swipe runs right after load.
5. `node p4-audit.mjs <WxH> <beta/|main> <hash> [kb]` (STATES=... to pick): every visible element with scrollable
   overflow and more content than room, in each state (peek, half, full, filters, company menu, badge, More, drawer,
   Insights, chart Ranges); each is swiped to its end with real touch, and the probe reports what moved (itself, other
   scroll boxes, the page, the sheet) and how much of its box stays hidden below a clipping ancestor.

5. `node p6-smoke.mjs <slug> <WxH> <light|dark> [main]`: per-board feature smoke, each step on a fresh page.
6. `node p12-wave3.mjs`, `node p13.mjs`: fix wave 3 on a 360x740 Android phone (Zurich, Ireland, data centre,
   Austin across a switch, On-site, Required/Nice to have, intern and part-time pills).
7. `node p14-fix.mjs`: the recommended M-28 fix injected with CSSOM `insertRule` (the CSP blocks a style tag);
   every failing case passes.
8. Tests: `BETA_QA2_DIST=<scratch>/cycle-beta4/dist NODE_PATH=<scratch>/pw/node_modules
   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/e2e.js --grep='^Beta mobile QA 2'`.
9. `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/qa-mobile-beta-2` (35.7 MB to 9.2 MB).
10. Patch: the three files written under `<scratch>/qa-mobile-beta-2/patch/`, `git diff --no-index /dev/null <f>`
    each, concatenated into docs/process/patches/qa-mobile-beta-2-webkit.diff; `git apply --check` passes and the
    YAML parses.

## 5. Verification
- New group: 2/6 pass, the 4 failures are exactly [M-28] to [M-31]. With `BETA_QA2_WHEEL=1`, the portrait guard
  passes and [M-28] fails with the same numbers.
- First pass's group: 14/14 pass (M-19 to M-27 fixed).
- npm test: 941 tests, 904 pass, 2 fail (PERF-1 and V15, the load-sensitive timing tests; they fail alone too at load 13-14), 35 todo.
- Screenshots: docs/screenshots/qa-mobile-beta-2/ (e2e-M-28-*, e2e-M-29-*, e2e-M-30-*, e2e-M-31-*, menu-*, audit-*,
  land-*, map-*, drawer-*, insights-*, w3-*).

## 6. Known gaps and follow-ups
- WebKit and the iOS Simulator job have not run (no WebKit, no macOS here); the lead pushes and runs the workflow.
  The simulator driver's coordinates come from the probe's touch calibration; if Safari's layout differs, the first
  tap retries with the measured offset and, failing that, opens the menu from the page (logged in result.txt).
- M-29's keyboard is inferred from Chromium's virtual-keyboard rule (focus during a user activation); confirm on an
  Android phone.
- After the fix lane: re-run this group (must be 6/6), the first pass's group, and the workflow.
- The lead should restore docs/screenshots/qa-mobile-beta/ (5 files rewritten by the first pass's tests).

## 7. Change log
- 2026-10-11 13:55: [M-31] (empty chart message under the half sheet) replaces a withdrawn draft; fix wave 3 checked
  on the phone; the M-28 fix verified by injection; WebKit patch written; QA.md section appended.
- 2026-10-11 13:40: M-29 (the menu focuses its search box on open: on Android Chrome the keyboard opens over the list
  each time, which on most phones puts the list into M-28's trap), M-30 (the open list is rebuilt each time a saved
  search's board finishes loading: all 17 row nodes replaced, 4 rebuilds in 6 s with 4 saved searches and 1.5 s list
  latency), M-31 (logo 26x26 and Beta link 43x21 in the phone top bar). test/e2e/beta-mobile-qa-2.e2e.js written and
  registered: 2 guards pass, [M-28] [M-29] [M-30] [M-31] fail. Running the first pass's group rewrote 5 of its
  committed screenshots in docs/screenshots/qa-mobile-beta/ (its tests save evidence on every run); restoring them
  with git checkout was refused by the sandbox's permission check, so the lead should restore them.
- 2026-10-11 13:20: per-board smoke (p6-smoke.mjs) on Apple, Google, Microsoft (360 dark, 844 landscape), NVIDIA (430
  dark), Netflix (dark): top bar, theme, badge and CSV, chips, chart row label to chip, Ranges, map pins, pin tap,
  Pay|Juice, Remote, Insights fields (16 px, 44 px, no zoom), job page next/prev, Juice household, Same role
  elsewhere, Apply link, methodology link, hardware Back, Save. Three runs hit "Target crashed" at load average 8;
  re-run alone they pass (environment, not the app).
- 2026-10-11 13:05: the user's report reproduced in Chromium: the company list is a 340 px scroll box nested in the
  sheet body; where the sheet is shorter than the box (landscape, iPhone SE-sized Safari viewport, any phone with the
  keyboard up) a swipe on the list never scrolls the sheet body (`overscroll-behavior: contain` on the list), so the
  last companies stay below the screen edge (M-28). The first pass's 14 tests all pass on the lead's build.
- 2026-10-11: started; prompt saved; read the beta sections of lead.md and the 2026-10-10 mobile beta QA section.
