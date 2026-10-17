# Process log: fix-pay-at-place

## State
- **Done:**
  - `payAt(job, place)` in public/features/shared.js, used by every view that prices a place.
  - V-35, V-36, V-37, V-39, V-40, UX-37 (= M-42, D-45), MR-34, the lead decision of 2026-10-16, and the QA round-3
    findings the lead added: D-39 (place counts, Remote states), D-40 (internships' Pay by place) and UX-52 (the
    count as a muted line).
  - Tests:
    - test/fix-pay-at-place.test.js: 20 tests, 19 red on ff6a3d0; the 20th is the Juice patch's, a to-do until the
      patch lands.
    - test/e2e/fix-pay-at-place.e2e.js: 10 checks, 10 red on ff6a3d0's build, including every phone size from 280 px to
      the Duo spanned.
  - The CONTRACT note, the DATA_SOURCES §7a line, the prompt copy, and this log.
- **In progress:** the gate (CI-like `npm test`, the full e2e), timings, screenshots.
- **Next step:** send the lead the gated SHA. Then one patch for another lane: docs/process/patches/fix-pay-at-place-juice.diff
  (server/juice.js, no Juice at a place with no row of its own).

## 1. Brief
- **Prompt:** [prompts/fix-pay-at-place.md](prompts/fix-pay-at-place.md), verbatim, with the lead's four follow-ups.
- **Goal:**
  - Since the salary audit, Amazon, Apple and Microsoft postings carry one posted range per place
    (`salary.ranges[].locations`), and the headline `salary.min/max/mid` is one of them (Amazon's search city,
    Microsoft's U.S. range) or their span (Apple).
  - The cards, Juice and the chart under a Location filter (SA-5) priced a place at its own row. Every other view priced
    it at the headline, often another city's row.
  - The fix: one helper used by every view, so the views agree under the same filter.
- **Owned:**
  - the pay computation in public/viz/chart.js, public/viz/map.js and public/app.js (stats line, filter, sort, card
    pill, drawer pay block, payLabels);
  - public/features/compstimate.js and public/features/insights.js;
  - the helper in public/features/shared.js;
  - the Amazon row labels in server/sources/amazon.js (D-39, given by the lead);
  - test/fix-pay-at-place.test.js and test/e2e/fix-pay-at-place.e2e.js;
  - this log, its prompt, docs/screenshots/fix-pay-at-place/.
- **Not owned, coordinated:** the tooltip open, close and position code (fix-touch-tips, ab71eae8dc63a1104). We agreed by
  message on every block we both touched (§3.9).

## 2. Inputs and sources
- docs/CONTRACT.md: Job `salary`, fix waves 3 to 5 (`payLocations`, `salary.places`, `ranges[].locations`).
- docs/DATA_SOURCES.md §7a: the pay rules, "Several ranges by location", "Every posted row is kept", and the lead decision.
- docs/process/PLAYBOOK.md (Checkpoints, Known traps), TEMPLATE.md.
- docs/process/salary-audit-backend.md (SB-1 to SB-7) and salary-audit-data.md (SA-5).
- docs/process/lead.md, the 2026-10-16 sections.
- Code read:
  - shared.js (`payLocations`, `payCountry`, `payRank`);
  - chart.js (`chartPay`, `spanTiers`, `locationRowKey`, `payCoversRow`, renderClusters, groups, renderRanges, buildRow,
    showJobTip, renderNotes);
  - map.js (`aggregate`, `summarize`, `midUSD`, cluster);
  - app.js (`payHere`, `failures`, `derive`, `sortJobs`, `stats`, `payPill`, `pickedRange`, `payRanges`, `payLabels`,
    `drawerContent`, `percentile`, `salaryDistribution`);
  - compstimate.js (`buildIndex`, `estimateComp`, `backtest`), insights.js (`hotLocations`, `update`);
  - server/sources/amazon.js (`amazonSalary`), server/sources/upgrade.js, server/juice.js (`attachJuice`).
- Data: the 2026-10-16 crawl (wt-data2), through the static build's served lists (`public/api.js unpackJobs`).
  - Amazon: 2,260 postings with ranges; every headline is one row. 108 postings list a place in no row (178 places).
  - Apple: 391; the headline is the span.
  - Microsoft: 255; the headline is the U.S. row, and every place is in a row.
  - No posting mixes currencies across its rows.

## 3. Decisions and rationale
1. **One helper, `payAt(job, place)`** (CONTRACT "fix-pay-at-place additions").
   - **A posting with `salary.ranges`:** each place is priced on the rows whose `locations` name it. A place in no row
     has no posted pay (the lead decision).
     - Every range is a per-place row by contract, so a row with no places (Amazon's "Ridgeland" row on a Canton and
       Wink posting) prices nothing.
     - This also covers amazon:10513831: rows for Sunnyvale and Austin only, listed in Seattle. `payLocations` used to
       fall back to every place for it.
   - **A posting with one range:** it covers the places in `payLocations`, in a country that uses its currency (V-18's
     `payCoversRow` rule, now part of the helper).
   - **Several places picked:** the span of their rows, with `span: true`.
   - **`place = null`:** the headline. It is named for its place when it is one row (`basis: 'place'`, label "Bellevue").
   - **US dollars:** palette.js rates, as the chart, the map and the stats line convert. A currency without a rate stays
     unconverted, as `toUSD` does there.
   - **Considered:** extending `payLocations` itself. Rejected: it returns places, not pay, and Juice, `payCountry`,
     `payRank` and the comparisons depend on its fallbacks.
2. **Cost.** A per-job table (Location -> rows, or "the posting's range") is built once and cached in a WeakMap. It is
   checked against the salary, locations and ranges objects, so a changed salary is read again. Results per Location
   are cached too, and `label` is worked out on first read.
   - A posting with one range keeps a list of the places it covers, not a Map. Such a posting is its own figure at every
     place, so the chart and the map make no result or item copy for it (`payCovers`, `placeRowCount`).
   - Amazon's whole board in Node, cold: about 50 ms for the tables (`payLocations` alone: 25 to 40 ms). Warm: 5 to 10 ms.
   - Used only where a place is priced: Group by Location, a Location filter, the map's aggregate, Insights' hot
     locations, and the index of Compstimate comparables that have ranges.
   - The default chart (Clusters by department) and the unfiltered stats line make no new pass. `barSpan` and `barPlace`
     skip postings with one range.
3. **Rows: Clusters and Ranges by Location (V-36, V-37).**
   - A row is the posting's first place (`locationRowKey`; under a filter, the first place the filter takes in), as V-18
     made it.
   - Its pay is `payAt` at that place (`locationRowItem`).
   - A posting with no pay posted there stays counted in the row's roles and is left out of its pay. The notes line
     counts these.
   - Ranges now uses the same rows, so Google's London-first postings with US pay are not a London bar.
   - Considered: moving such a bar to a place its pay covers. Rejected: the two views would disagree on row membership.
4. **Under a Location filter (V-39).**
   - `chartPay` is `payAt` over the places the filter takes in (SA-5 kept). The notes line names the postings left out
     because they price other places only.
   - The app's `placePay(j, F)` gives the same pay to the stats line, the pay filter, the sort, the filter histogram,
     the card (`pickedRange`) and the drawer. `payHere` keeps its name and signature (test/fix3-app.test.js pins them).
   - Insights' `update(..., { places })` prices each role at the places picked.
   - The map prices each pin's postings at the Locations aggregated into it (`priceOf`). A pin of several places takes
     the span of their rows.
5. **Compstimate (V-40).**
   - A comparable that posts a range per place is priced at its range for the city asked.
   - Pricing alone left the estimate dominated by roles elsewhere in the country: Microsoft "Software Engineer" in New
     York had 356 comparables, 16 of them posting a New York range. Its mid stayed at $177K.
   - So with `LOCAL_MIN` (5) or more comparables that post a range of their own for the city, only those are used. The
     basis line then says "New York".
   - Boards without per-place ranges, every main-site board among them, are unchanged, so their backtest figures do not
     move.
   - A posting's place with no row of its own is not one of its pay places.
6. **Striped bars (V-35).**
   - `barSpan(p)` stripes a bar that spans several levels (`salary.levels`), or several places' ranges: Apple's headline,
     or several places picked with different rows.
   - One place's row (Amazon's headline, Microsoft's U.S. range) is one posted range and is not striped.
   - The accessible name says "the range posted for Bellevue". The tooltip says "Posted for Bellevue; the posting lists
     other places' ranges too".
   - A Microsoft level span priced at its SF Bay Area / NYC row does not list the U.S. levels.
7. **The card and the drawer (UX-37, UX-52, D-39, D-40).** `payHeadline(job)` is shared by the card pill and the drawer
   heading.
   - **The figure:** the span of the posting's ranges, or, under a Location filter, the place's own range.
   - **Units:** in the unit the pay was posted in (`payUnit`): an internship's "$40K–44K/year", part-time "/hour",
     fixed-term "/week" or "total". The term and part-time branches used to return before the ranges were read.
   - **The count line:** the pill holds the range alone. "5 places", "2 levels" or "2 ranges" is a muted line under it,
     on the card and in the drawer's line under the heading ("5 places · USD · per year"). Under a filter that line reads
     "Posted for Bellevue · USD · per year".
   - **Counting places:**
     - "· N places" counts distinct places (`placeCount`): a row's location strings, and each state of a "Remote
       (IL, NJ, VA)" row.
     - When rows share a place it reads "· N ranges": amazon:10420739 posts two rows for Seattle; some Remote rows
       stored with no state.
     - Considered: "1 place". Rejected: the figure is still two posted ranges.
   - **Details:** they name whose range the rank and strip use: "the range posted for Bellevue", the place picked, or
     "the middle of its span" for Apple. `percentile` and `salaryDistribution` use that range (`drawerUSD`). The pool
     keeps every role at its own headline.
   - **Pay by place:**
     - shown for fixed-term and part-time pay too;
     - one line per range, and no name is cut. A row for more than two places reads "Fort Worth, Jacksonville and 4
       more", and Details list every place (the lead: wrap it or put the rest behind Details, never an ellipsis);
     - `.d-tier-name` wraps instead of an ellipsis.
   - **The chips:** payLabels' "Top is N× the bottom" and "One number" describe the figure shown, not the headline row.
8. **Amazon row labels (D-39; the lead chose to keep DQ-33).**
   - A virtual-location row's label keeps its state: "Remote (CA)", and identical rows "Remote (IL, NJ, VA)".
   - Labels are no longer cut at 60 characters.
   - Identical rows stay one range that lists every place.
   - It shows on a build from the stored snapshots. `upgradeAmazonJobs` re-reads each row's line at read time, and the
     rows SB-1 restores come from stored ranges whose labels keep the line. amazon:10568868 reads Remote (CA), Remote
     (IL, NJ, VA), Remote (NY) and Remote (WA): 6 places in 4 ranges, as posted.
9. **"Several pay ranges" (MR-34).**
   - The posting states more ranges than the figure (`salary.zones`). The tip says the figure is "one of them, as
     posted" when the posted text holds one range.
   - It says "runs from the lowest to the highest of them" when the text holds several (a ";", more than two amounts, or
     Amazon's "lowest geographic market … highest").
   - The line in app.js no longer says "this is the span of all of them" (test/beta-methodology-2.test.js MR-34 now
     passes; it is still marked to-do there).
10. **Coordination with fix-touch-tips:**
    - chart.js: I changed only the pay lines of showJobTip (the range and the span lines) and two lines of the renderNotes
      details. They added `mixedRowsNote()` after the V-21 line and changed the legend's striped title.
    - app.js: I changed the drawer's `salaryNotes` and rank items. Their chip-meanings item sits before `d-pay-doc`.
    - styles.css: I added `.sal-sub` after `.card-age-top` and changed `.d-tier-name`.
    - Imports: theirs are on separate lines.
11. **Juice (server/juice.js, another lane's file):**
    - `placeUSD` falls back to the headline for a place with no row when a range has no places (the 7 postings of the
      lead decision).
    - [patches/fix-pay-at-place-juice.diff](patches/fix-pay-at-place-juice.diff) skips such a place: no Juice there.
    - Its test is in test/fix-pay-at-place.test.js, a to-do until the patch is applied. With the patch it passes.

## 4. Replayable steps
1. `git checkout --detach origin/claude/stoic-ride-54ddxp` (ff6a3d0). Symlink `node_modules`, `data/snapshots` and
   `data/beta/snapshots` (wt-data2).
2. Base build: `node scripts/build-static.js --out <scratch>/fpp/dist-before` (at ff6a3d0). Base copy:
   `git archive ff6a3d0` into `<scratch>/fpp/base`.
3. Data scans (`<scratch>/fpp/`):
   - `scan.mjs`: ranges per board, and places with no row;
   - `chip.mjs`: MR-34's chip postings and their text;
   - `places.mjs`: D-39 place counts;
   - `raw2.mjs`: a stored posting's fields;
   - `comp.mjs`: a Compstimate query's comparables.
4. Unit tests:
   - `node --test test/fix-pay-at-place.test.js`;
   - red on the base: copy the file into `<scratch>/fpp/base/test/` and run it there (19 of 19 fail).
5. Build: `node scripts/build-static.js` (dist/).
6. Browser checks:
   - `NODE_PATH=<scratch>/pw/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/e2e.js --grep=fix-pay-at-place`;
   - with `BETA_QA_DIST=<scratch>/fpp/dist-before`, the same checks on the base build: 10 of 10 fail.
7. Numbers: `node <scratch>/fpp/measure.mjs <base> . <dist-before> dist` (§5).
8. Timings: `NODE_PATH=… node <scratch>/fpp/perf.cjs <dist> <label> [cpu rate]`, run on both builds in turn.
9. Gate:
   - `rm data/snapshots data/beta/snapshots`, then `MELON_BETA_SNAPSHOT_DIR= npm test`, then re-link the data;
   - the full `node scripts/e2e.js` with the data linked;
   - `git checkout -- docs/screenshots` for files it rewrote outside docs/screenshots/fix-pay-at-place/.

## 5. Verification
Numbers below are from `measure.mjs` on the 2026-10-16 crawl. "Before" runs ff6a3d0's modules on its build; "after"
runs this lane's.

| Finding | Before | After |
|---|---|---|
| V-36 Amazon postings drawn at another place's range (Clusters by Location) | 936 | 0 |
| V-36 Amazon Nashville row | 339 with pay · median $129K | median $116K (its own rows) |
| V-36 Amazon Jersey City | median $181K | $199K |
| V-36 Microsoft Mountain View / New York | $209K / $191K | $246K / $219K |
| V-37 Google London (Ranges by Location) | 13 bars, median $253K (US ranges) | no London bar: none posts London pay; the notes count them |
| V-37 Google Zurich / NVIDIA Munich | $84K (EUR) / $96K (PLN, Warsaw) | none: no pay posted for Zurich or Munich |
| V-39 Microsoft `l=Mountain View`: caption / stats line / map pin (browser) | $197K / $177K / $177K | $197K / $197K / $197K |
| V-39 unfiltered pins: Microsoft Mountain View, New York, SF | $191K, $191K, $180K | $219K, $219K, $211K |
| V-39 unfiltered pins: Amazon SF, Cupertino | $181K, $194K | $191K, $208K |
| V-40 Compstimate Microsoft "Software Engineer", New York | $120K–235K, mid $177K (356 comparables) | $188K–275K, mid $231K (16 posting New York ranges) |
| V-40 Compstimate Amazon "Software Development Engineer", New York | mid $169K | mid $186K |
| V-40 Insights hot locations: Microsoft Mountain View, New York | $191K, $191K | $219K, $219K |
| V-40 Insights: Amazon New York, Arlington, Bellevue | $181K, $160K, $147K | $186K, $158K, $144K |
| V-35 striped bars: Amazon / Microsoft / Apple / NVIDIA | 2,260 / 394 / 391 / 887 | 0 / 158 (level spans) / 391 / 887 |
| UX-37 drawer heading ≠ card figure: Amazon / Microsoft | 2,201 / 255 | 0 / 0 |
| D-39 Amazon "· N places" ≠ distinct places | 1,437 (28 with fewer places than ranges) | 0 |
| D-39 Amazon "Remote" rows with no state | 12 postings | 0 |
| Posted ranges per posting, base build against this build (figures, currency, places) | | identical for all 22,179 Amazon, 4,851 Apple and 2,435 Microsoft postings; only 146 Amazon labels changed (states, no cut) |
| D-40 internships or part-time pay with a range per place, no Pay by place | 1 (amazon:10502807) | 0 |
| MR-34 "Several pay ranges" says "span of all of them": Microsoft / Amazon / Google | 923 / 86 / 36 | 920 / 66 / 32 now say "one of them"; 3 / 20 / 4 (real spans) say "lowest to the highest" |
| Lead decision: Amazon places priced on another place's row (payLocations) | 14 places in 12 postings | 0 |

**Timings on Amazon (22,179 postings).** The machine was at load 15 to 19 throughout (other lanes), so only large
differences mean anything. Each figure is a median of 5 to 9 runs, interleaved base and head.

Chromium, 4x CPU, `chart.update` and the app (`<scratch>/fpp/perf.cjs`, two rounds each):

| | Base | Head |
|---|---:|---:|
| Clusters by department (the default) | 285–369 ms | 263–311 ms |
| Ranges, no groups | 231–265 ms | 216–294 ms |
| Clusters, Location = Seattle | 105–171 ms | 117–122 ms |
| Clusters by Location (each posting priced at its row) | 581–629 ms | 721–778 ms (before the per-place fast path) |
| Ranges by Location | 271–368 ms | 488–498 ms (before the fast path) |
| App: Location filter on and off, to the stats line and chart | 642–692 ms | 670–728 ms |

Node, Amazon's whole board, cold (fresh jobs) and warm (`<scratch>/fpp/bench.mjs`, `bench2.mjs`), after the fast path:

| | Base | Head |
|---|---|---|
| Location rows (Clusters and Ranges by Location) | 36–56 ms, warm 20–45 | 62–92 ms, warm 25–38 |
| `chartPay` under a Location filter, all 22,179 (the app passes only the filter's matches) | 47–100 ms, warm 28–41 | 72–183 ms, warm 33–47 |
| Map: `aggregate` alone, cold | 231–286 ms | 194–223 ms |
| Map: `aggregate` and every pin summarized | 216–235 ms cold, 161–175 warm | 333–365 ms cold, 167–182 warm |

- No view does a new pass over the board: the default chart, Ranges, the stats line and the cards are unchanged.
- The views that price a place (Group by Location, the map's first draw) do per-place work inside their existing pass.
  On a cold board that costs tens of milliseconds, about 0.1 s for the map. Warm, they are the same as before.

Tests:
- test/fix-pay-at-place.test.js: 20 tests. 19 pass and 1 is a to-do (the Juice patch; it passes with the patch). All 19 fail
  on ff6a3d0.
- test/e2e/fix-pay-at-place.e2e.js: 25 checks (9, plus one per phone size, 16 sizes). All pass on this build; all of them
  fail on ff6a3d0's build (the phone sizes as one check there).
- The full e2e (`node scripts/e2e.js`, data linked) at 37a6971's build: 374 of 379 passed, 4 skipped, 1 failed. The failure
  was this lane's phone check, which ran 16 sizes in one 120 s check and timed out. It is now one check per size (all pass).
  The groups that could move with c54e297 and 6fb7f11 were run again and pass: fix-pay-at-place, Fix app, Fix beta app,
  Fix3 app, Beta UX review, viz-even, fix-pay-data, Fix viz, Fix viz 3, Beta viz review.
  - At 280 px, the 1st-generation iPhone SE and the Z Fold cover, the pill took 154 px and the title wrapped to 7 lines.
    Now the pill is the range alone and the title takes at most 5 lines at 280 px.
  - The Razr cover screen (352x355) lays the page out 495 px wide on the base build too. That is a page-layout finding for
    the phone-sizes lane, noted by the check, not this card's.
- Updated other lanes' tests for the new behaviour, same intent:
  - test/salary-audit.test.js lifts the card's new helpers (payHeadline, payUnit, placeCount, rangePlaceKeys).
  - test/e2e/viz-even.e2e.js counts the band's postings with `barSpan`: Microsoft's per-place postings are no longer
    striped, so they stack with the band.

## 6. Known gaps and follow-ups
- **Juice:** apply [patches/fix-pay-at-place-juice.diff](patches/fix-pay-at-place-juice.diff) (server/juice.js) so no place
  is scored on another place's row. Then the to-do test in test/fix-pay-at-place.test.js becomes a real test.
- **MR-34's test** in test/beta-methodology-2.test.js passes now. The methodology lane or the lead can drop its to-do mark.
- **The card's location order** (`locSummary`) still uses `payLocations`. The places it puts first are the ones with
  pay; it does not price anything.
- **The Razr cover screen's 495 px layout** belongs to the phone-sizes lane.

## 7. Change log
- 2026-10-16:
  - 3374a45: the helper.
  - 0ff4484: the views, the tests (19 red on the base).
  - 05e5c24: the chart notes.
  - ea3a2b6: UX-52, the drawer heading, labels no longer cut.
  - 37a6971: Compstimate's local comparables, the e2e file.
- 2026-10-17: the gate, the numbers, screenshots, this log.
