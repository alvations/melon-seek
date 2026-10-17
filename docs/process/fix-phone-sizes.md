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
- **In progress:** nothing; the lead integrates.
- **Next, if resumed:** the follow-ups in section 6 (the Duo spanned in its other posture; WebKit results from
  webkit-phone.yml).

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
   - the "/" key hint covered the right end of a narrow search box: it takes no taps, and touch screens don't show it.
8. **Dual screens** (`@media (horizontal-viewport-segments: 2)`): the layout grid is the two screens with the hinge
   between them (`env(viewport-segment-width 0 0)`, the hinge, `env(viewport-segment-width 1 0)`): chart left, list
   right; the filter slide-over is the left screen's width and the job page the right screen's. The top bar's and the
   quick bar's right-hand groups start 8 px into the right screen, and their margin keeps the left group 8 px clear of
   the hinge (the quick chips scroll sideways inside the left screen, with the phone's fade). The toast is centred on
   the right screen and the tagline takes its own line. Popovers open on their control's screen: positionPopover clamps
   to the segment of the anchor (`window.viewport.segments`), which CSS can't do.
9. **The Fold open (690x829) and the Duo on one screen (540x720)** keep the phone layout, as the tablet (768x1024)
   does: the screenshots show a two-row top bar, a full-width chart and the sheet, and a job page with ~95-character
   lines. Nothing looked stretched, so no change.
10. **Not mine, left alone:** Amazon's long department names (M-40), the off-screen filter slide-over buttons at
    861–1199 px (UX-56; the matrix ignores the closed slide-over), and the desktop tagline at 1280x800, which ends in
    "…" beside the chart controls (fix-density's one line; the matrix checks the tagline on phones and dual screens).

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
| **Motorola razr cover 352x355** | **476–505 (zoomed out) → 352** | whole | **Chart under the search box → all on screen** | **no sheet → peek row with the count and Sort**; chart 82 px | |
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
light at every size, dark at 280, 320, 344 and the Duo spanned, and the Duo with the hinge (first screen, job page,
filters; taken over CDP).

## 6. Known gaps and follow-ups

- WebKit is not installed here: the lead's webkit-phone.yml runs `node test/e2e/phone-matrix.e2e.js --browser=webkit`
  and phone-smoke in WebKit; the fold test skips there (it needs Chromium's CDP).
- The Duo spanned the other way (720x1114, a horizontal hinge: `vertical-viewport-segments: 2`) is not handled: the
  sheet's half snap could be the lower screen. Not in the matrix.
- Custom boards with very long names still end in "…" at small widths (the built-in names are whole everywhere).

## 7. Change log

- 2026-10-16 23:50: started from a92a3c8; baseline smoke (7 failures, all the Razr cover screen) and matrix runs.
- 2026-10-17 00:40: CSS and app.js fixes; the matrix's extra checks (sides, tagline, all cards, map controls,
  placeholder, the hinge with clipping).
