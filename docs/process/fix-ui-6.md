# Process log: fix-ui-6

## State

- **Done (in the worktree, not yet sent):**
  - prompt (814f6f1); baseline build of 00bd52c (e800c43 plus the checkpoint retirements) kept hard-linked at
    `<scratch>/fui6/dist-before`; baselines there: phone smoke 147/147 (21 sizes x 7 boards), phone matrix 60/60;
  - fixes for B-1 to B-12 in public/app.js, public/styles.css and public/viz/map.js (section 3), CONTRACT section;
  - test/e2e/fix-ui-6.e2e.js (127 tests), registered in scripts/e2e.js;
  - B-4 measured before/after (section 5).
- **In progress (2026-10-24 00:45, after the container restart at 00:23):** the red run of the group on the baseline build
  (`<scratch>/fui6/fui6-before.log`).
- **Next:** the green run on dist/, the B-12 first-card timing (`probes/firstcard.cjs`), phone smoke and the matrix after,
  the related groups, screenshots (FUI6_SHOTS=before|after), npm test in `<scratch>/fui6/clean`, then send the SHAs.

## 1. Brief

Prompt: [prompts/fix-ui-6.md](prompts/fix-ui-6.md) (verbatim). Round 4's backlog on e800c43: the card's dot under Group by
Location and by Level (B-1), the job page's level badge gap (B-2), the filter sheet's footer under the keyboard and its
slow start on touch screens over 860 px (B-3, B-4), the Razr inner landscape chart (B-5), the search box from 861 px
(B-6), the Razr cover screen's map (B-7). Later from the lead (persona wave 2): the Duo's hinge (B-8), the Razr cover
screen's saved searches and toast (B-9), a phone with few roles (B-10), the arrival line (B-11).

Owned: the card's dot and meta line, the filter sheet's footer and opening, the layout rules over 860 px, the map's fit
and padding (fitToData, clearOfControls in public/viz/map.js); test/e2e/fix-ui-6.e2e.js; this log; the prompt.
Not owned: pay parsing and Compstimate (fix-data-6), derive(), the stats line's median, the map pins' and the chart
caption's label text (fix-app-6), data files.

## 2. Inputs and sources

- docs/CONTRACT.md (fix-qa4's UX-50 section; fix-pay-at-place; the frontend interfaces), docs/process/PLAYBOOK.md
  ("Checkpoints", "Known traps"), TEMPLATE.md, fix-phone-sizes.md (decisions 7, 14 and §6), fix-qa4.md (§3.9, §6),
  lead.md from "Fix wave 5".
- test/e2e/phone-sizes.mjs (21 sizes), phone-matrix.e2e.js (its M-52 keyboard stand-in and the meta-line check),
  beta-mobile-qa-4.e2e.js (M-51, M-52), fix-viz-5.e2e.js (the Razr map test), fix-qa4.e2e.js (UX-50's test).
- Chrome traces with invalidation tracking (scratch `probes/inval.cjs`) for B-4.

## 3. Decisions and rationale

1. **B-1, the card's dot.** The dot is coloured for the key the chart colours by (`keyOf(job, colorBy())`), so the meta
   line names that key first, beside it:
   - Company: "YouTube · User Experience and Design" (UX-50, unchanged);
   - Level: "Senior · Software Engineering" (the level's words, `levelLabel`, as the chart's rows and legend say them);
   - Location: the place first, "Seattle, WA +2 · Software Engineering". The place the dot stands for is the job's first
     on-site place (`primaryLocation`, the chart's key), so `locSummary(job, 1, { coloured: true })` names it first even
     where a Location filter or the pay's places would put another first. Naming it twice ("Seattle · … · Seattle, WA")
     was the other way; it costs a narrow card its department.
   - Department and No grouping: the department, as before.
   The department still gives way first on a narrow card (UX-16): `.card-dept` shrinks, `.card-loc` doesn't, whatever
   their order. No CSS change.
2. **B-2, the level badge's gap.** M-51's clip needs a badge that starts a line to step in by 12 px; with a flex gap of
   6 px that made every badge 18 px after the text before it. CSS cannot tell a line's first item from the others, and a
   negative margin on the item before the badge would let that item overflow the right edge by 8 px when the badge wraps.
   So app.js `fitMetaLine` (on the job page's open, and on resize with `fitApplyLabel`) tries each badge and tag on the
   line of the item before it (`.is-inline`: 4 px, so 10 px; the tag 0, so 6 px after the badge, as before M-51) and
   keeps 12 px only when it starts a line. Without JS a badge keeps 12 px: never cut.
3. **B-3, "Show N roles" under the keyboard over 860 px.** bindKeyboardInsets sets `body.kb-open` on a coarse pointer over
   860 px too, but only while a field is typed in (on phones a panned visual viewport counts as well). styles.css hides
   the sheet's footer then, as phones do (the M-52 block). Every other `kb-open` rule is inside a phone media query, so
   nothing else changes over 860 px. Considered: the sheet sized to the visual viewport with its footer above the
   keyboard; with 206 px left on the Razr landscape that leaves the list about 90 px.
4. **B-4, the sheet's late start.** Measured (section 5): the slide started 70–197 ms after the tap, on phones as over
   860 px (the "up to 300 ms" is the same delay at a higher load). Two causes, both ours:
   - the tap's task rendered the panel (PERF-2 skips its sync while it is closed and catches up on open: 60 ms for Apple,
     about 100 for Amazon at load 3), and the slide could start only after it;
   - the frame after the tap restyled the whole page twice: `measure()` (bindKeyboardInsets, run on every focus change
     and at three settle timers) wrote `--vvh` and `--vvt` on the root's inline style each time, and Chrome restyles every
     element on such a write even with the same value (trace: "Inline CSS style declaration was mutated", 1,789
     elements, 15–20 ms each).
   Fixes: setFiltersOpen toggles the sheet first and, when the panel is behind, renders it just after the slide's first
   frame (rAF, then a task), with focus after it; `setRootVar` writes a root property only when it changes. A docked
   column (1200 px and up) still renders first. No transition, font or style flush of ours was on the open path
   otherwise; the transition is on transform only.
5. **B-5, the Razr inner landscape chart.** M-52's 44 px chart controls made the toolbar 16 px taller. On a short touch
   screen over 860 px (max-height 500) the main column's top padding goes from 16 to 8 px, its gap from 10 to 6 and the
   toolbar's row gap from 12 to 8: 16 px back, so the chart is as tall as with a mouse (188.4 px at 1005x412). The list's
   header loses the same 8 px, so the Sort stays level with the stats line.
6. **B-6, the search box from 861 px.** From 861 to 1199 px the top bar takes the phone's shorter forms: the company menu
   without its role count (the list's header has it) and a saved snapshot's badge with its date alone ("● Oct 16"; its
   name, tip and sheet keep "saved snapshot"). The search box is then at least 215 px with "Search roles" or the full hint
   at every width, touch or mouse, with a Refresh button (it was 104 px reading "Search", and nothing at 1000–1020 px).
   A pending badge keeps "Checking live…" (badge.e2e checks it at 1020 px).
7. **B-7, the map's fit.** clearOfControls (fix-viz-5's after-fit check) measured a pin by its price tag, whose box does
   not hold its pointer (a pseudo-element 7 px under it, down to the place), and allowed 1 px of overlap. So the Razr
   cover screen's third pin pointed under the attribution. Now a pin is its tag plus its pointer, with 2 px of air from
   every control (`pinFootprint`, `nearHit`); a small pan (4 px steps up and down to 32, then sideways) is tried before
   zooming out, so no pin is merged away when a pan clears them all; a re-check after a resize starts from unmerged pins.
   Considered: a larger bottom padding in fitToData for the attribution; on the 123 px map it cost half a zoom step and
   merged two pins. The "N postings list no place" line (V-44) still lies over Meta's pins on the cover screen; it takes
   no taps (pointer-events none), and fitting around it merges the pins anyway. Reported (section 6).
8. **B-8, the Duo's hinge.** The dual-screen layout (fix-phone-sizes decision 8) needs the browser to report two
   viewport segments. A browser that reports one screen (the persona runs, or one without the Viewport Segments API) got
   the desktop layout across the hinge. A touch screen 1104–1124 px wide in landscape is the Duo spanned, so the same
   layout applies there from the Duo's own sizes (540 | 34 | 540), and app.js `screenSegments()` gives positionPopover
   the same two screens. A browser that reports the screens gets env()'s numbers, the same.
9. **B-9, the Razr cover screen.** The company menu scrolls the current company into view no further than keeps the
   first saved search whole (saved searches are listed first and carry "N new"). The toast shows over the top bar, full
   width, on short portrait screens, so a "2 new roles…" toast no longer covers the first card for 4.5 s.
10. **B-12 and B-10, a card on the first screen.** The phone's results sheet peeks at 156 px (was 84): the count and Sort,
    the Juice line and the first card's title and pay (149 px under the sheet's top at 390x844). The chart gives up that
    room; at 320x568 its rows keep 54 px. Landscape keeps 64. The Razr cover screen peeks at 104 px with the Juice line
    shown once the sheet is raised: the first card's title and pay show, and the chart keeps its caption and scale (it
    held half a row before). With few roles (B-10), app.js `fitSheetToChart` raises the peek into the room the chart's
    rows leave, as a body-level `--sheet-peek` (the chart's box shrinks to its rows, its notes line follows them), never
    above half the screen; it comes back down when the rows need it.
11. **B-11, the arrival line.** It said what the beta adds, not what the site is for. The beta line now reads "Job
    postings and their posted pay, and what's left after tax and rent, at 15 companies" (desktop), "Job postings and
    their posted pay" (phone) and "Jobs and their posted pay" (narrowest); its title adds "Beta: adds Amazon, Apple, …, NVIDIA
    from their own careers sites". The main site's line is unchanged. The line is built in public/app.js `renderTagline`.

## 4. Replayable steps

1. `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp`; link
   `node_modules`, `data/snapshots`, `data/beta/snapshots` (the 2026-10-16 crawl); `node scripts/build-static.js`.
2. Keep the baseline: `cp -al dist <scratch>/fui6/dist-before`; app.js, styles.css and viz/map.js are copied verbatim by
   the build, so edits go into dist/ with `cp --remove-destination` (the hard-linked baseline keeps its files).
3. Baselines: `node test/e2e/webkit/phone-smoke.mjs --dist <scratch>/fui6/dist-before --sizes all --engines chromium
   --boards apple,amazon,google,meta,microsoft,netflix,nvidia` and `PHONE_MATRIX_DIST=<scratch>/fui6/dist-before node
   test/e2e/phone-matrix.e2e.js` (NODE_PATH=<scratch>/pw/node_modules).
4. The new group: `FUI6_DIST=<dir> node test/e2e/fix-ui-6.e2e.js [--grep=re]`, or `node scripts/e2e.js --grep=fix-ui-6`.

## 5. Verification

All on the 2026-10-16 crawl, Chromium 141, the baseline build of 00bd52c (e800c43's code) against this lane's dist/.
Timings with `uptime`; any taken at a load over 8 is noise and marked so.

**test/e2e/fix-ui-6.e2e.js** (129 tests): on the baseline **84 of 127 failed** (load 7–23; the 2 newer ones, at
375x625, below), on this lane's build **129 of 129 pass** (the full run 125/129, then 53/53 for B-7, B-9, B-10 and B-12
after the last two fixes, and 19/19 for the screenshot subset). Per item, before → after:

| ID | Before (red) | After |
|---|---|---|
| B-1 | 384 of 400 cards read under Location or Level name the department beside the place's or level's dot | every card names its dot's key first; cards of one key share one colour (Google, Apple, Amazon; 1440 and 390) |
| B-2 | the level badge 18.0 px after the text at all 23 sizes (21 phone sizes, 1440, 1024) | 10 px (tag 6 px); a badge that starts a line is whole and level with the text; no "·" at a line's start or end |
| B-3 | "Show N roles" under the keyboard: 932x430 at y 382–418 (215 px left), 1005x412 at 364–400 (206 left), 1114x720 at 672–708 (360 left); phones already hid it | hidden while typing at all 21 sizes, back on screen when the keyboard closes |
| B-4 | slide start after the tap, Apple (medians of 5, load 6–10): 932x430 70 ms, 1005x412 122, 1114x720 145, phone 390x844 197 | 12, 56, 59 and 58 ms. The test (medians of 3): before 45–127 ms (load 5), after 14–44 ms (load 5) |
| B-5 | chart 172.4 px with touch, 188.4 with a mouse at 1005x412; 190.4 / 206.4 at 932x430 | 188.4 and 206.4 with touch too; no scroll; Sort level with the stats line |
| B-6 | the search box from 861 px with a Refresh button: 104 px reading "Search" (beta, touch), 104–124 px with no words at 1000–1020 | at least 215 px with "Search roles" or the full hint at every width from 861 to 1440, touch and mouse, four boards |
| B-7 | 5 of 21 sizes with a pin or its pointer under a control or out of the map (the cover screen: Apple's third pin under the attribution; 280x653, 320x568, 667x375, 932x430: under Pay \| Juice or out of the map) | 21 of 21 clear, with a basemap |
| B-8 | 127 things across the hinge with no hinge reported (the search box at x 405–684, chips, the chart's circles, the tagline) | none, with and without the hinge reported; the search box 291 px |
| B-9 | the first saved search out of the list's view (row at y −70 to −26 in a list at 187–288); no toast reached | the saved search and its "2 new" in view; the toast over the top bar, clear of the first card |
| B-10 | 56–217 px blank under the chart's rows at 8 of 14 portrait sizes (10 roles) | at most 48 px everywhere (412x915: 127 → 8 px) |
| B-11 | "Beta: adds 7 big-tech careers sites" at 22 sizes | "Job postings and their posted pay…", one line, never cut, at every size that shows it |
| B-12 | no card on the first screen at any of 15 portrait sizes (390x844: the title's first line at 908, the screen 844) | the first card's title and pay on the first screen at all 15 and at 375x625; the cover screen its title and pay, the chart its caption (34–37 px) |

**npm test** in a clean checkout with no data links (`MELON_BETA_SNAPSHOT_DIR=`): on 9d188a1 1297 pass and 1 fail
(fix-qa4's UX-50 source test pinned the old line; updated in 2f245aa to read cardMetaItems); on 9b86087 **1308 tests,
1298 pass, 0 fail**, 10 skipped.

Screenshots (shrunk 11.8 → 2.7 MB): docs/screenshots/fix-ui-6/before-*.png and after-*.png for each item at the sizes
that show it (B-1 Apple and Amazon at 1440, B-2 at 280, 390 and 1440, B-3 at 1005x412, B-5 at 932x430 and 1005x412, B-6
at 861, B-7 the cover screen, B-8 the Duo, B-9 the cover screen's menu and toast, B-10 at 412x915 and 375x625, B-11 at
390 and 1440, B-12 at 280, 352x355, 375x625 and 390).

## 6. Known gaps and follow-ups

(filled in at the end)

## 7. Change log

- 2026-10-23 21:12: started on 00bd52c; build, baselines (smoke 147/147, matrix 60/60).
