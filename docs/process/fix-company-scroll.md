# Process log: fix-company-scroll

## 1. Brief
Prompt: [docs/process/prompts/fix-company-scroll.md](prompts/fix-company-scroll.md).
The user, on their phone (2026-10-11, /beta/): "I'm still not able to scroll down from the list of company
drop down!!". Goal: on every phone browser (iPhone Safari first), the company bottom sheet scrolls to its
last company, robustly, without changing desktop.
Files owned: `public/styles.css`, the company-menu / popover / keyboard-inset code in `public/app.js`,
`test/e2e/fix-company-scroll.e2e.js` (registered in `scripts/e2e.js`), `.github/workflows/webkit-phone.yml` (the QA lane's workflow, applied from
`docs/process/patches/qa-mobile-beta-2-webkit.diff`, plus a step for this file),
this log, `docs/screenshots/fix-company-scroll/`.

## 2. Inputs and sources
- `public/app.js`: `makeCompanyMenu()` (builds search + `.company-list` + "Add another company's board"),
  `togglePopover()` / `syncPopover()` (sync runs on every `render()` and when a beta live check settles),
  `bindKeyboardInsets()` (`body.kb-open`, `--vvh`), `revealField()`, `bindSheetDrag()` (pointer handlers on
  `#results` only; `#popover` is a sibling at body level, so the drag never sees sheet touches).
- `public/styles.css`: base `.popover` (flex column, max-height), `.pop-body { overflow-y: auto }`,
  `.company-list { max-height: 340px; overflow-y: auto }`, phone rules (82dvh sheet, `kb-open`, overscroll).
  `touch-action` appears only on `#mapHost`, `.results`, `.cards`: none on `#popover` or its ancestors.
- Measurements in headless Chromium 141 with an iPhone profile (probe in the scratchpad), before the fix:

  | viewport | scroll boxes in the sheet (client/scroll px) | list bottom vs. screen |
  |---|---|---|
  | 390x844 | `.pop-body` (no overflow), `.company-list` 340/615 | 773 of 844 |
  | 320x568 | `.pop-body` 404/472, `.company-list` 340/615 | Add button clipped |
  | 844x390 | `.pop-body` 258/472, `.company-list` 340/615 | **533 of 390** |
  | keyboard (vv 260 at 320x568) | `.pop-body`, `.company-list` | **471 of 260** |

## 3. Decisions and rationale
1. **Root cause: two nested scroll boxes, both `overscroll-behavior: contain`.** The list's own 340 px box sits
   inside the scrolling `.pop-body`. Whenever the sheet is shorter than head + search + 340 + button (small
   phones, landscape, the keyboard up, and on iPhone Safari any time its toolbars shrink the layout viewport),
   the list's lower part is below the sheet's visible edge. A swipe on the list scrolls only the list; it never
   chains to `.pop-body` (contain), so the last companies stay off screen: the list says it is at its end
   while they are invisible. Only a swipe that starts on the search box or title moves `.pop-body`, which
   nobody discovers. On iOS < 16 (no `overscroll-behavior`) the chain goes to the page instead. Beta shows
   it most: 13 companies under two headings (615 px) vs. the old main list. Chromium's CDP touch test at
   390x844 passed before (the list fits there), which is why it looked engine-specific; at 844x390 the same
   touch test fails in Chromium too (the last company ends at y=533 on a 390 px screen).
2. **One scroller per bottom sheet (phones only, inside `@media (max-width: 860px)`).** Company sheet:
   `.pop-body` becomes a non-scrolling flex column (`overflow: hidden`), `.company-menu` `flex: 1; min-height: 0`,
   the search and the Add button `flex: none` (pinned), `.company-list` `flex: 1 1 auto; min-height: 0;
   max-height: none; overflow-y: auto; padding-bottom: 6px`. The sheet's own max-height (82dvh, or
   `--vvh - 16px` with the keyboard) now sizes the list. Every `.pop-body` gets `min-height: 0` (old WebKit
   flex min-size quirk) and the popover `overscroll-behavior: contain`. Badge and More already had one
   scroller (`.pop-body`), now asserted by tests. Alternative rejected: keep the nested box and lower its
   max-height per breakpoint; it stays fragile with every toolbar/keyboard height.
3. **`touch-action: pan-y pinch-zoom`** on the list: vertical pans and pinch zoom (low vision) stay native.
   Safari does not know `pinch-zoom`, drops the declaration and keeps `auto`, which also scrolls. No ancestor
   sets `touch-action`; no JS touch/pointer handler is attached to `#popover` (the results-sheet drag is
   bound to `#results`; the document `pointerdown` only closes the popover for taps outside it).
4. **Keyboard:** `body.kb-open` hides the Add button (as `.filters-foot` is hidden) so the list keeps the room;
   in phone landscape (`max-height: 500px`) it also hides the sheet title while typing. `--vvt`
   (`visualViewport.offsetTop`, also updated on the visual viewport's `scroll`) moves the lifted sheet with
   iOS's visual-viewport pan, so its top is never above the screen.
5. **No repaint of identical rows.** `sync()` rebuilt every row on each `syncPopover()` (every render, a beta
   live check settling, a saved board loading). It now keys the painted state (current company, companies,
   saved searches, query) and returns when unchanged, so rows under a finger are not replaced mid-swipe
   (M-30). A saved board loading only updates its "N new" badge in place (rows carry `data-saved`).
7. **M-29: no search focus on phones.** `togglePopover('company')` focused the search box on open, which on
   Android opens the keyboard over the list on every open. On phones the current company (else the first row)
   takes focus (`preventScroll`); desktop still focuses the search.
8. **M-31: the chart's empty message** sits near the chart's top on phones (`#chartHost .ms-chart__empty
   { justify-content: flex-start; padding-top: 28px }` in styles.css), not centred under the half sheet.
9. **M-28 alternative (QA's)** was `.company-list { max-height: none; overflow: visible }` with `.pop-body` as the
   scroller. Kept the list as the scroller instead (the lead's recommended direction): the search stays pinned
   while scrolling, and `reveal()` keeps working on the list unchanged. Both pass the QA's M-28 test.
10. **docs/process/mobile.md:62** ("every scroller gets contain") is not this lane's file: the clarification
   (a sheet has exactly one scroll box) is `docs/process/patches/fix-company-scroll-mobile-md.diff`.
6. **Desktop unchanged**: all new rules are inside the phone media query; desktop keeps the 340 px list box
   under the search (asserted by a test).

## 4. Replayable steps
```sh
ln -s /home/user/melon-seek/node_modules node_modules
ln -s /home/user/melon-seek/data/snapshots data/snapshots
mkdir -p data/beta && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots
node scripts/build-static.js --out $SCRATCH/dist-before          # ~4.5 min
# after the fix: the build copies public/app.js and styles.css verbatim (checked with cmp), so
cp -r $SCRATCH/dist-before $SCRATCH/dist-after
cp public/app.js public/styles.css $SCRATCH/dist-after/ && cp public/app.js public/styles.css $SCRATCH/dist-after/beta/
PW=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules
BETA_QA_DIST=$SCRATCH/dist-before NODE_PATH=$PW node test/e2e/fix-company-scroll.e2e.js   # before: 22 failed
BETA_QA_DIST=$SCRATCH/dist-after  NODE_PATH=$PW node test/e2e/fix-company-scroll.e2e.js   # after: 23 passed
MELON_BETA_SNAPSHOT_DIR=$SCRATCH/empty-beta npm test
BETA_QA_DIST=$SCRATCH/dist-after NODE_PATH=$PW node scripts/e2e.js
# WebKit (GitHub runner only): Actions > WebKit phone checks > Run workflow
#   node test/e2e/fix-company-scroll.e2e.js --browser=webkit
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-company-scroll
```

## 5. Verification
- New file `test/e2e/fix-company-scroll.e2e.js`, 23 tests: beta and main at 320x568, 390x844, 430x932 and
  844x390 (isMobile, hasTouch, iPhone UA); saved searches; a typed search; a stand-in keyboard (a replaced
  `window.visualViewport` of 260/460/200 px, which drives the app's real `kb-open`/`--vvh` path); the badge
  and More sheets; desktop unchanged; and a CDP touch-swipe test (Chromium only) at 390x844 and 844x390
  starting on a row, a heading and a gap, asserting the list scrolls, `.pop-body`, the page and the sheet do
  not move, and swiping alone brings the last company fully on screen. Geometry checks run in any engine:
  exactly one scroll box, nothing else clipping, no nested max-height, sheet inside the visual viewport,
  list at least 80 px, the end of the list and the last company fully visible when scrolled to the end.
- This file before the fix (dist-before): 4 passed, 19 failed (desktop, badge, More and the 390x844 touch
  case pass before, as expected: the list fits there). After (dist-after): **23 passed, 0 failed** (Chromium 141).
- QA's `test/e2e/beta-mobile-qa-2.e2e.js` (copied with its registration), group "^Beta mobile QA 2": before
  the follow-up, M-29 and M-31 failed (M-28 and M-30 already passed with the first fix); after,
  **6/6 passed**. Together with this file: `node scripts/e2e.js --grep="^Beta mobile QA 2|^Fix company scroll"`
  29/29 passed.
- `npm test` (MELON_BETA_SNAPSHOT_DIR empty): 870 pass, 19 todo, 2 fail: `test/perf.test.js` event-loop
  timing (231 ms and 251 ms vs. a 100 ms goal) while the full e2e suite ran alongside (load average 15);
  server code, untouched here. Re-run alone (`node --test test/perf.test.js`): 3 pass, 0 fail.
- Full e2e (`BETA_QA_DIST=dist-after node scripts/e2e.js`, after the first fix): 212/253 passed, 40 skipped
  (the suites that read `dist/` directly), 1 failed: "Compstimate: T21 cold server" (app not ready after 30 s
  on a cold server). It fails the same way with the base commit's app.js and styles.css, so it is not this lane.
- Screenshots (list scrolled to its end), `docs/screenshots/fix-company-scroll/`: `before-beta-844x390.png`
  (stops at xAI, three companies and the Add button unreachable) vs. `after-beta-844x390.png` (Shield AI and
  Add visible); same pairs at 320x568 and 390x844.

## 6. Known gaps and follow-ups
- **Not verified in real WebKit or on an iPhone here** (the sandbox has Chromium only; `playwright install`
  is not allowed). `.github/workflows/webkit-phone.yml` (workflow_dispatch; its webkit job) runs the same file under
  Playwright WebKit with the iPhone profile; the touch-swipe case skips there (no CDP; Playwright has no
  touch-move API, and `mouse.wheel` is unsupported on mobile WebKit). A CI build has demo lists, so the
  "saved searches overflow" case only notes when the list fits.
- Playwright WebKit on Linux is not iOS Safari: real toolbars, keyboard and the visual-viewport pan are
  covered by the geometry rules and the stand-in visual viewport, not by a device. A check on a real iPhone
  after deploy is the last step.
- Chromium crashed once ("Target crashed") late in a 23-context run before the fix; not reproduced after.

## 7. Change log
- 2026-10-11: prompt saved; failing tests committed first (e19d823).
- 2026-10-11: fix (0f1cb70): one scroller in phone sheets, `--vvt`, keyboard rules, no identical repaint.
- 2026-10-11: workflow, screenshots, this log (075da3d).
- 2026-10-11: lead follow-up (QA pass 2): M-29 focus, M-30 in-place "N new", M-31 empty message; QA's
  beta-mobile-qa-2 tests and webkit-phone.yml adopted (my mobile-webkit.yml removed); mobile.md patch.
