# Process log: fix-phone-sizes

## State

- **Done:**
  - prompt saved; baseline phone-smoke and phone-matrix runs;
  - test/e2e/phone-matrix.e2e.js written and registered;
  - CSS fixes in public/styles.css: their own rule blocks at the end, plus the two landscape media queries;
  - two small app.js changes: positionPopover per screen, fitSearchHint fallbacks;
  - the matrix goes from 17 of 34 failing before to 34 of 34 passing; the full e2e suite has no new failures (section 5);
  - before and after screenshots, shrunk;
  - `npm test` green without data links.
- **Integrated:** everything up to f8057c7 is in the lead's fbdad58. On a build of fbdad58 (with pay-at-place, data-3,
  sec-3 and phone-text) the matrix passes 34/34 and phone-smoke 140/140 (20 sizes x 7 boards). Nothing regressed.
- **Since then (rebased onto 1ef0646, fix wave 5 pushed):**
  - dd58b48: the Surface Duo stacked (720x1114, hinge across) is in phone-sizes.mjs, with its own CSS block and matrix
    test. The stray `=======` line the lead also removed (b815f2b) is gone either way.
  - 6c0ebab: Amazon's long department rows are never cut (decision 11). M-40 passes 26/26 at every size, the phone-text
    guards for Amazon 22/22 (360 and 390 light and dark, and every other size) and the matrix 36/36.
  - 93228f6: UX-39, the peeking sheet rises to show the preview's first card (decision 12), with a matrix test per
    phone size. 780e0ac (its screenshots) was cherry-picked by the lead; the full e2e on it: 745/766, no new failure
    (section 5).
- **Mobile QA 4, done (on the 780e0ac line):** M-48, M-49, M-51 and M-52 (with the 861–999 px top bar and its
  search box), and the iPhone 15 Pro Max in landscape (932x430) as the 21st size (decision 14). Commits 8606e3d,
  97a36d3, 0a00102, 13f0082, 8cb8fb0, b0abf24, 51364e1 and 5560635 are cherry-picked into the lead's integration
  branch. 11823ad (the matrix waits for the filter sheet's slide) and this log came after. Mobile QA 4's tests pass
  for all four items; its M-50 (map pins under the map's own note and Remote button) is fix-viz-5's and still fails.
  Results are in section 5: the matrix, phone smoke 147/147, the job-page tests, the phone-text guards 104/104, and
  npm test 1185/0 in a clean checkout.
- **Next, if resumed:** WebKit results from webkit-phone.yml when the lead sends them. npm test runs in a clean
  checkout (`git worktree add --detach <scratch>/fps/clean HEAD`, node_modules linked, no data links), not by moving
  data/snapshots. test/e2e/beta-mobile-qa-4.e2e.js and its registration are the QA lane's (on the branch already);
  they were copied here only to run them.

## 1. Brief

Prompt: [prompts/fix-phone-sizes.md](prompts/fix-phone-sizes.md) (verbatim). Goal: the phone layout works on every
size and posture in test/e2e/phone-sizes.mjs, from the folded Galaxy Fold (280 px) to the Surface Duo spanned
(1114 px), the Razr cover screen and landscape; the company name is always whole; dual screens keep the hinge clear.
Files owned: public/styles.css (layout rule blocks only), test/e2e/phone-matrix.e2e.js (new), scripts/e2e.js
(registration), this log, the prompt file, docs/screenshots/fix-phone-sizes/. public/app.js: two functions
(positionPopover, fitSearchHint), where CSS alone can't do it.

## 2. Inputs and sources

- docs/CONTRACT.md (layout and frontend interfaces), docs/strategy/ROADMAP.md §8 (no new visible control; anything
  else goes in an existing popover), docs/process/PLAYBOOK.md ("Checkpoints", "Known traps": phones come in more sizes,
  emulated phones have no toolbars), docs/process/TEMPLATE.md, docs/process/ux.md (the phone layout at 860 px and below).
- test/e2e/phone-sizes.mjs (the 19 sizes) and test/e2e/webkit/phone-smoke.mjs (its hard checks, which the new test
  repeats); test/e2e/fix-company-scroll.e2e.js (how a test runs standalone under `--browser=webkit`).
- docs/process/qa-mobile-beta-3.md (M-45: "Microsoft" as "Micros…" at 380–392 px) and its test.
- The lead's runs: the Razr cover screen laid out 476–505 px wide, the name gone at 280, the Group select to x 301;
  and, from fix-phone-controls' run, the 280 px tagline running to x 313.
- Chromium 141 (the sandbox's): `horizontal-viewport-segments` and `env(viewport-segment-*)` work, and
  `window.viewport.segments` lists the screens. The hinge emulates with CDP `Emulation.setDeviceMetricsOverride` and its
  `displayFeature` (`{ orientation: 'vertical', offset: 540, maskLength: 34 }`); `Emulation.setDisplayFeaturesOverride`
  alone changed nothing here (probe: `<scratch>/fps/probe-fold2.cjs`). Playwright's `page.screenshot` resets the device
  metrics and so the fold, so the fold screenshots go over CDP `Page.captureScreenshot`.

## 3. Decisions and rationale

1. **Landscape means landscape.** The one-row top bar (styles.css "Phone landscape" and A-3) now needs
   `(orientation: landscape) and (min-width: 560px)` as well as `(max-height: 500px)`. One row needs about 500 px
   (the Razr laid it out at 476–505 px). A short screen that is square or narrow keeps two rows.
2. **Short screens that are not landscape** (`max-width: 559px and max-height: 500px`, the Razr cover screen): two
   rows with 4 px gaps, the 52 px quick bar, the 64 px peek row and the half sheet at 45 %, no stats line, strip,
   notes line or tagline above the chart. The chart keeps about 80 px and the sheet shows.
3. **The name first.** Row 1 gives way in this order, each step at the width where the longest built-in name
   (Microsoft, 74.4 px; Anthropic 76.9 on the main site) stops fitting, with 4 px or more to spare:
   - 479 px and below: the badge's shortest label ("● Oct 16"; "Microsoft" was cut at 441–460 px by "Snapshot · Oct 16");
   - 399 px and below: 16 px of spacing (row gaps 8 → 6, the menu's padding 12/10 → 10/8, the badge's 12 → 10). This
     is M-45 (380–392 px). Hiding the logo there instead broke three tests that keep the logo beside the Beta tag at
     390 px (fix-beta-app M-27, fix-app I-2, UX-19), so the logo stays;
   - 379 px and below: the beta logo goes (as before);
   - 359 px and below: the main site's logo and the Beta tag go. The tagline above the chart still says
     "melon·seek · Beta: …", and the badge's sheet says it is the beta site with a link to the main site (UX-23);
   - 319 px and below: the badge shows only its dot (44 x 44; its sheet has the date and source). "Demo" stays.
   The theme button stays everywhere (it fits, so nothing moves behind More: ROADMAP §8 is untouched).
4. **Row 2** (search, Chart / Map / Insights) stays one row down to 320 px with 8 px tab padding and a 100 px search
   basis; at 319 px and below the view switch gets its own row of three equal tabs, and `--m-topbar` says three rows
   (the full sheet's top).
5. **The 280 px chart toolbar:** Clusters | Ranges at 13 px with 8 px padding, the Group select with 4/18 px padding
   and no 40vw cap: "Department" ends at x 268 on a 280 px screen (was 301).
6. **The tagline at 280 px:** 12 px text at 339 px and below; at 319 px and below the beta line drops its
   "melon·seek ·" so "Beta: adds 7 big-tech careers sites" is whole (it ran to x 313).
7. **Found by the matrix, not in the brief, and fixed because they are layout:**
   - the job page was wider than phones of 363 px and less: the Apply label ("Apply on Amazon's careers site") was one
     line of 346–363 px. Its label now wraps (`.drawer-foot .apply`);
   - cards with "$296K–497K · 2 places" pushed the results list sideways at 280 px: on phones the pay pill goes under
     the title when the title would get less than 8em (`.card-top` wraps);
   - the map's Pay scale (168 px) ran past its box and the screen at 344–360 px, and "Details" to x 322 at 320 px: at
     379 px and below the scale and its line go under the Pay | Juice switch;
   - the search placeholder was cut ("Search role" at 352 px): an empty search field kept 14 px for its hidden clear
     button. `.search input:placeholder-shown::-webkit-search-cancel-button { display: none }`, and fitSearchHint
     falls back to "Search", then to no placeholder (the one-row landscape bar at 560–639 px);
   - the main site's one-row landscape bar cut "Anthropic" at 560–600 px: A-3's treatment (shortest badge label, the
     search gives way first, 6 px tabs) now applies to both sites, and below 640 px the logo and Beta tag go;
   - the "/" key hint covered the right end of a narrow search box: it takes no taps, and touch screens don't show it;
   - from fix-touch-tips' run on the Razr cover screen (the lead, 2026-10-17): the results sheet's peek row sat below
     the screen (top 417–427 on 355 px), and on the map the Remote button and the legend covered all three pins. The
     first is the zoomed-out page (fixed by decision 2). For the second, on short screens that are not landscape the
     empty toolbar band above the map goes, the zoom buttons go (pinch, double-tap and the keyboard's + and − still
     zoom) and the Pay | Juice box keeps only its switch: 2 of the 3 pins show on the 124 px map (the third sits under
     the attribution, and in the sandbox under the "Basemap unavailable" note that real phones don't show).
8. **Dual screens** (`@media (horizontal-viewport-segments: 2)`): the layout grid is the two screens with the hinge
   between them (`env(viewport-segment-width 0 0)`, the hinge, `env(viewport-segment-width 1 0)`): chart left, list
   right; the filter slide-over is the left screen's width and the job page the right screen's. The top bar's and the
   quick bar's right-hand groups start 8 px into the right screen, and their margin keeps the left group 8 px clear of
   the hinge (the quick chips scroll sideways inside the left screen, with the phone's fade). The toast is centred on
   the right screen and the tagline takes its own line. Popovers open on their control's screen: positionPopover clamps
   to the segment of the anchor (`window.viewport.segments`), which CSS can't do.
8b. **Dual screens stacked** (`@media (vertical-viewport-segments: 2) and (max-width: 860px)`, the Duo turned a
   quarter: two 720x540 screens, the hinge across at y 540–574) keep the phone layout, split at the hinge:
   - the top screen has the top bar, the quick bar and the chart (`.main` padding ends it at
     `env(viewport-segment-bottom 0 0)`), and the filter sheet is the top screen's height;
   - the bottom screen has the results list, open there for good (its top is `env(viewport-segment-top 0 1)`, no
     transform, no handle, its cards scroll by touch), the job page, and the bottom-sheet popovers (at most the bottom
     screen's height);
   - in the matrix: a 20th entry in phone-sizes.mjs, and a fold test with CDP's horizontal `displayFeature`.
9. **The Fold open (690x829) and the Duo on one screen (540x720)** keep the phone layout, as the tablet (768x1024)
   does: the screenshots show a two-row top bar, a full-width chart and the sheet, and a job page with ~95-character
   lines. Nothing looked stretched, so no change.
11. **Amazon's long department rows** (the lead's gate on fbdad58: fix-data-3 named them "Technical Project, Program
    and Product Management" and "Non-Technical …"; M-40 splits a long name at its last separator and keeps each part on
    one line, so "Program and Product Management", 247 px at 15 px, was cut by 0.42 px at 360 and by 80 px at 280).
    app.js `fitCheckLabels` tries, per split row, after each render and when the list's width changes: the whole name
    flowing as one text (`.is-flow`); the same in 13 px with 6 px row gaps (`.is-snug`); then 12 px with 4 px gaps
    (`.is-snugger`). It keeps the first that is at most two lines with nothing cut sideways, else today's two
    one-line parts. Measured widths: "Non-Technical …" (413 px at 15 px) needs a 231 px label in 15 px, 207 in 13 px and
    185 in 12 px; the label is 167 px at 280, 207 at 320, 231 at 344, 247 at 360. So it is 15 px from 344 px up, 13 px at
    320 and 12 px at 280, and every other Amazon row stays at 15 or 13 px. The label's text, the checkbox's name and the
    row's title stay the whole name, and rows that start alike still differ in what they show (M-40's test).
12. **UX-39** (docs/process/ux-review-beta-2.md): on a phone, Amazon's first-page preview put its 24 real cards in the
    collapsed sheet. While the preview shows, app.js sets `body.is-previewing` (renderResults, from `previewing()`),
    and styles.css raises the sheet's `--sheet-peek` on `.results` to 220 px (156 px on screens 500 px tall or less),
    which shows the peek row, the Juice line and the first card's top. The value is plain px, as the drag's snap points
    read it (bindSheetDrag). Half and full are where the user put them, so they don't move. When the whole list lands
    the class goes and the sheet slides back to its 84 px peek.
13. **Not mine, left alone:** Amazon's long department names in chart rows (M-40, viz), the off-screen filter slide-over buttons at
    861–1199 px (UX-56; the matrix ignores the closed slide-over), and the desktop tagline at 1280x800, which ends in
    "…" beside the chart controls (fix-density's one line; the matrix checks the tagline on phones and dual screens).
14. **Mobile QA 4** (docs/process/qa-mobile-beta-4.md, its tests in test/e2e/beta-mobile-qa-4.e2e.js):
    - **M-52, touch screens wider than 860 px** keep the desktop layout, which had mouse-sized controls (28–38 px) and
      13–14 px fields that iOS zooms into. A `(pointer: coarse) and (min-width: 861px)` block makes the top bar, quick
      bar, chart toolbar and Sort 44 px tall and the theme button 44x44, puts every field at 16 px (search, selects,
      the filter search and pay fields, popover, board form and Insights fields), and gives check, radio and company
      rows 44 px. A mouse (`pointer: fine`) gets nothing new. The keyboard: bindKeyboardInsets moved a focused filter or
      popover field above the keyboard only when `isMobile()`; it now does so on any coarse pointer too (the Insights
      fields already did, M-47). At 1005x412 with a keyboard over half the screen the filter sheet's pay field went from
      218–238 px (the keyboard from 206) to 100–123. The cost: on the 412 px tall Razr landscape the chart is about
      16 px shorter.
    - **The top bar from 861 to 999 px** (found by the new 932x430 size): the desktop's one-row top bar needed 926 px
      for Amazon and 964 for a board with a Refresh button with a mouse (so a narrow window scrolled sideways), and
      935 and 981 with the touch sizes (so the phone zoomed the page out). In that range the wordmark goes (the logo
      and the Beta tag stay, as on phones; the link's name is unchanged), the top bar's gaps go from 16 to 10 px and
      the right group's from 10 to 6. Everything fits from 861 px, with touch and with a mouse. The search box is
      then ~100 px for a board with a Refresh button, which left only the magnifier (fitSearchHint had 28 px for
      words); in that range the "/" hint goes and the field's padding is 32/8 px instead of 36/34, so "Search" shows
      (5560635; "Search roles" by 900 px).
    - **The iPhone 15 Pro Max in landscape (932x430)** is in POSTURES, so the matrix, the phone-text guards and
      phone-smoke cover it: 21 sizes.
    - **M-48:** a card's "N places" / "2 levels" line is 12 px (was 11.5), still one line.
    - **M-49, the Apply label:** app.js `fitApplyLabel` (when the job page opens, and on resize or rotation) shows the
      first wording that is one line: "Apply on Amazon’s careers site", else "Apply on Amazon’s site", else "Apply" (the
      host stays under it). When the words are shorter, the link's name is still the long label and the host. At 390
      px Microsoft's reads "Apply on Microsoft’s site" and its footer is 69 px instead of 83; Meta at 360 gets the
      middle wording, and the 280 px Fold gets "Apply".
    - **M-51, the meta line:** each item carries its "·" before it, in one inline-flex `.d-meta-part`, so no "·" can
      end a line. The line's box reaches 12 px further left (`margin-left: -12px`) and is clipped there (`clip-path:
      inset(0 0 0 12px)`): the "·" before the first item on any line falls in the clipped strip. The level pill and the
      title tag get a 12 px margin so they too line up with the text when they start a line; between items the pill now
      sits 18 px after the text before it (was 10). The "·" is aria-hidden.
    - **M-50** (pins under the map's own note and Remote button) went to fix-viz-5 and is not changed here.

## 4. Replayable steps

1. `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp` (a92a3c8).
2. Link `node_modules`, `data/snapshots` and `data/beta/snapshots` (the 2026-10-16 crawl); `node scripts/build-static.js`.
3. Keep the baseline: `cp -al dist <scratch>/fps/dist-before`, then copy styles.css and app.js into it with
   `cp --remove-destination` (so later edits to dist/ never reach it). styles.css and app.js are copied verbatim by the
   build, so `<scratch>/fps/sync.sh` copies them into dist/ and dist/beta/ between builds.
4. Baseline smoke: `NODE_PATH=<scratch>/pw/node_modules node test/e2e/webkit/phone-smoke.mjs --dist dist --out <scratch>/fps/smoke-before --engines chromium --sizes all --boards apple,amazon,google,meta,microsoft,netflix,nvidia`.
5. The matrix: `NODE_PATH=<scratch>/pw/node_modules node test/e2e/phone-matrix.e2e.js [--browser=webkit]`
   (`PHONE_MATRIX_DIST=<dir>` for another build, `PHONE_MATRIX_SHOTS=before|after` for screenshots,
   `PHONE_MATRIX_BOARDS=` to change the boards). About 12 minutes in Chromium on the loaded sandbox.
6. Measuring helpers (scratch only): `measure-row1.cjs` (the top bar's item widths per width and board),
   `probe-wide.cjs` (what is wider than the screen: drawer, cards, map, filters), `probe-map.cjs` (the map's Pay box),
   `probe-duo.cjs` (the Duo with the hinge: placements and what lies on the hinge), `probe-ph.cjs` (the placeholder).

## 5. Verification

**test/e2e/phone-matrix.e2e.js** (Chromium 141, the 2026-10-16 crawl): **17 of 34 fail before** (on a copy of the
a92a3c8 build), **34 of 34 pass after**. Failing before: 280, 320, 344, 360x740, 360x880, the Razr cover screen, all
10 name sweeps and the Duo with the hinge. Log: `<scratch>/fps/matrix-before2.log`, `<scratch>/fps/matrix-after.log`.

**test/e2e/webkit/phone-smoke.mjs** (Chromium, 19 sizes x 7 boards): before 7 failing pages (the Razr cover screen on
every board) → after 133 of 133 ok. The only "controls cut at the sides" left are the closed filter slide-over's
buttons at 1005 and 1114 px (UX-56, fix-phone-controls); the only cut text left is long department names (M-40).

Size by size (Apple unless named; "name" is the company menu's text; controls are the eleven the matrix checks):

| Size | Page width | Name | Controls | Sheet / job page / filters | Duo hinge |
|---|---|---|---|---|---|
| Galaxy Fold folded 280x653 | 280 → 280 | gone (0 px box) → whole | Group to x 301 → in; tagline to x 313 → whole | cards and list scrolled sideways (299 px), job page 346–363 px with Apply off screen → fit | |
| iPhone SE 1st gen 320x568 | 320 → 320 | "Ap…" (38 of 46 px) → whole | three-row top bar → two rows (chart 149 → 200 px) | job page 346–363 px → fits | |
| Galaxy Z Fold 5 cover 344x882 | 344 | "Amazo…" → whole | placeholder cut → whole | job page → fits | |
| Galaxy S8, Z Flip 5 360x740/880 | 360 | whole | placeholder cut → whole | Amazon job page 363 px → fits | |
| iPhone 13 mini, SE 3rd gen, 15/16, 13/14 (375–393) | = | whole (M-45 380–392 px: "Micros…" → whole, sweep) | ok | ok | |
| Pixel 8, razr inner, 15 Pro Max (412–430) | = | whole | ok | ok | |
| Surface Duo one screen 540x720 | 540 | whole | ok | ok, phone layout as on the tablet | |
| Galaxy Z Fold 5 open 690x829 | 690 | whole | ok | ok, phone layout as on the tablet | |
| **Motorola razr cover 352x355** | **476–505 (zoomed out) → 352** | whole | **Chart under the search box → all on screen** | **peek row at 417 on a 355 px screen → on screen with the count and Sort**; chart 82 px; map: pins under its controls → 2 of 3 show | |
| Surface Duo spanned 1114x720, no hinge | 1114 | whole | ok | ok | |
| **Surface Duo spanned, hinge emulated** | 1114 | whole | search, 2 chips, tagline, chart on the hinge → none | job page 554–1114 → 574–1114; filters 0–540; popovers 222–562 → 188–528 | **8 kinds of content on it → nothing** |
| iPhone 13 mini / SE 3 landscape 812x375, 667x375 | = | whole | ok | ok | |
| razr inner landscape 1005x412 | 1005 | whole | ok | ok | |
| Name sweep 280–860 px, heights 740 and 360, 10 boards | 505 px at 280–559 x 360 → fits | 84 (Microsoft) to 162 (Anthropic) cut widths per board → 0 | | | |
| Desktop 1440x900, 1280x800, 1024x768, tablet 768x1024 | = | = | = | = | |

**The full e2e suite** (`node scripts/e2e.js`, data linked, load 10–30 from other lanes): 394 of 420 pass, 22 fail,
4 skipped. None of the 22 is new from this lane:
- 18 are reviewers' red tests, which fail by design until their lanes land: Beta mobile QA 3 [M-33] to [M-44], [M-46]
  and [M-47], and beta a11y 2 [A-8] to [A-11]. [M-45] **passes now** (it failed before);
- the old single name-sweep test hit the 120 s test limit under load. It is now one test per board, and all 10 pass;
- T21 (load-sensitive) and P-5 ("£80,000 … below the lowest pay listed here ($110K)", from today's data) fail the
  same way with a92a3c8's styles.css and app.js put back. D-20 timed out under load and passes alone.
The groups this lane must not break all pass: Beta mobile QA 14/14, Beta mobile QA 2 6/6, Fix company scroll 23/23,
fix-density 51/51, Desktop QA 21, Beta desktop QA 2 10/10, Beta UX review 9/9, Fix beta app 11/11 (M-25 and M-27: the
logo and the Beta tag at 360, 390 and 430 px). Afterwards `git checkout -- docs/screenshots` reverted the screenshots
the suite rewrote outside this lane's folder.

`MELON_BETA_SNAPSHOT_DIR= npm test` with the data links out of data/: on 2754e9d 1116 pass, 0 fail, 8 skipped, 56 todo;
on the final head (load 25) 1114 pass and 2 fail, S-3 ("one hostile 256 KB posting normalizes in under 2 s") and S-6,
both timing tests, and both pass alone (7/7 in test/beta-security-review.test.js).

The matrix through the suite runner (`node scripts/e2e.js --grep="^Phone matrix"`, the final CSS): 34/34.

Screenshots (shrunk 15.8 → 3.3 MB): docs/screenshots/fix-phone-sizes/before-*.png and after-*.png, the Apple board in
light at every size, dark at 280, 320, 344 and the Duo spanned, the Duo with the hinge (first screen, job page,
filters; taken over CDP), and the Razr cover screen's map.

**On 1ef0646 plus this lane's later commits (780e0ac):**
- Department rows (6c0ebab): M-40 26/26 at every size; the phone-text guards for Amazon 22/22 (360 and 390, light and
  dark, plus every other size); the matrix 36/36.
- UX-39 (93228f6): Beta UX review 2 [UX-39] passes (it was red), and so does the new matrix test at every phone size
  (18/18). Also passing: Beta mobile QA 3's throttled preview test; M-43 at every size plus its Back and Escape cases;
  A-11 in beta a11y 2 and fix-phone-controls; and the sheet drag and flick tests (Mobile QA, Beta mobile QA, Beta mobile
  QA 3). That run was 90/90.
- The stacked Duo (dd58b48): its matrix entry and its hinge test pass. Its "before" shows the chart, the job page, the
  filter sheet and the company sheet across the hinge.
- phone-smoke: 140/140 (20 sizes x 7 boards). npm test with the data links out: 1185 pass, 0 fail.

**The full e2e on 780e0ac** (data linked, one suite at a time): 745 of 766 pass, 16 fail, 5 skipped. 14 of the 16 are
other lanes' red tests (A-8, D-43, D-44, V-33, V-34, V-38, V-41 to V-44, V-46, V-48, UX-42, UX-45); the other two are
the UI map tests that race under load and pass alone. The matrix was 54/54 in it.

**Mobile QA 4 (decision 14), on 780e0ac plus 8606e3d to b0abf24:**
- Beta mobile QA 4: 6 of 7 pass, M-48, M-49, M-51 and M-52 among them (all four were red). M-50 still fails (fix-viz-5's:
  pins under the map's own note and Remote button).
- The matrix (58 tests, 21 sizes): 57 of 58 at first. The new 932x430 size failed for Amazon: its one-row top bar was
  935 px wide. A sweep found the same from 861 px up on the 780e0ac build, with a mouse too (926 px for Amazon, 964
  for a board with a Refresh button), so the 861–999 px block in decision 14 went in, and with it a matrix sweep of
  every 4 px from 861 to 1001, touch and mouse: 0 of 2 pass on the 780e0ac build (29 widths each), 2 of 2 after.
  After it the wide sizes (932x430, 1005x412, 1114x720 with and without the hinge, their M-52 tests), UX-56 at 900,
  1024, 1199, 1005 and 1114, and Mobile QA 4's M-52 pass: 16/16.
- The matrix's M-52 test at 932x430 on the 780e0ac build: 10 controls under 44 px (26–38 px tall), 4 fields under
  16 px (search, Sort, Group, the pay field), and the focused pay field at 218–238 px under a keyboard from 215.
- phone-smoke, 21 sizes x 7 boards: 147 of 147 pages ok. The only cut text left is long department names (M-40).
- Measured with scratch probes (probe-meta.cjs, probe-salsub.cjs, probe-wide-touch.cjs, probe-coarse-sweep.cjs):
  every "N places" / "2 levels" line at 280 px (Amazon 9, NVIDIA 1) is 12 px, one line, inside its card and clear of
  the title; the meta line of the first 6–10 roles of Amazon, Meta and Microsoft at 280, 360 and 390 px has no "·" at a
  line's edge and nothing clipped.
- The job-page tests (every e2e test whose name has "drawer", "job page" or "apply", outside the matrix and the
  phone-text guards), Beta mobile QA 3 and 4, and fix-pay-at-place: 158 of 160 pass, 1 skipped; the failure is M-50.
- The fix-phone-text suite (its guards at every size, light and dark, desktop, and M-33 to M-39): 104 of 104.
- After 5560635 (the search box keeps "Search" at 861–999 px): the top bar sweep (now also checking the search box
  has words), the 932x430 phone-text guards, the matrix's M-52 at 932x430, Mobile QA 4's M-52 and UX-56 at 900 px pass.
  The 932x430 matrix test then failed once and the 1005x412 one once, each time with the filter sheet still sliding in:
  after a mode switch the panel renders on open (PERF-2), and on a busy machine the slide started after the fixed
  450 ms wait. 11823ad waits for the slide to end, and then the 280, 352x355, 932, 1005 and 1114 px tests, the
  1440x900 desktop test and the 768x1024 tablet test pass (7/7).
- `MELON_BETA_SNAPSHOT_DIR= npm test` in a clean checkout of 5560635 (no data links): 1185 pass, 0 fail, 8 skipped,
  45 todo.

The matrix's later checks (from the lead's Razr findings): the results sheet's peek row shows at least 44 px of the
screen, "on screen" is judged against the screen's own size as well as the layout viewport (a zoomed-out page has a
larger one: the baseline Razr now fails on Sort, the sheet handle and the peek row at top 417), the visual viewport is
neither zoomed nor panned, and on the map not every price pin is covered by the map's controls.

## 6. Known gaps and follow-ups

- WebKit is not installed here: the lead's webkit-phone.yml runs `node test/e2e/phone-matrix.e2e.js --browser=webkit`
  and phone-smoke in WebKit; the fold test skips there (it needs Chromium's CDP).
- The Duo stacked (720x1114) is handled since fca80ac (decision 8b). Its list stays open on the bottom screen, so
  there is no sheet to drag there; a stacked dual screen wider than 860 px keeps the desktop layout as is.
- The Razr cover screen's third pin sits under the map's attribution. That is the viz lane's (fix-viz-5, map.js: the
  fit could leave room for the corners).
- Custom boards with very long names still end in "…" at small widths (the built-in names are whole everywhere).
- M-52's side effects: at 861 px the search box of a board with a Refresh button is ~100 px and says only "Search"
  (5560635; it was just the magnifier before that); on the 412 px tall Razr landscape the chart is ~16 px shorter; the
  filter sheet's "Show N roles" footer stays at the bottom with the keyboard up above 860 px (on phones kb-open hides
  it), so it waits under the keyboard until the field loses focus.
- M-51's level pill sits 18 px after the text before it (was 10), the price of clipping the "·" that starts a line.

## 7. Change log

- 2026-10-16 23:50: started from a92a3c8; baseline smoke (7 failures, all the Razr cover screen) and matrix runs.
- 2026-10-17 00:40: CSS and app.js fixes; the matrix's extra checks (sides, tagline, all cards, map controls,
  placeholder, the hinge with clipping).
- 2026-10-17 02:07: the lead's two Razr findings (the peek row, the map's pins); then a container restart.
- 2026-10-17 10:52–12:59: on fbdad58, then 1ef0646: the stacked Duo, Amazon's long department rows, UX-39.
- 2026-10-17 15:29: the full e2e on 780e0ac (745/766, no new failure); mobile QA 4 started.
- 2026-10-17 16:06: M-48, M-49, M-51, M-52 (with the 861–999 px top bar) and the iPhone 15 Pro Max landscape, one
  commit each, with the matrix's new checks and before/after screenshots.
- 2026-10-17 16:30: 5560635, the search box keeps "Search" at 861–999 px (the lead's request).
- 2026-10-23 13:10: resumed after the API limit; follow-up tests, 11823ad (the matrix waits for the filter sheet's
  slide), npm test in a clean checkout, this log.
