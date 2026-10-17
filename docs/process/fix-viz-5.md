# Process log: fix-viz-5

## State
- **Done; integrated by the lead.** The lead cherry-picks 1ef0646..HEAD onto the branch head with fix-phone-sizes'
  series and runs the full gate there; **the gate is pending on the lead's head**. This lane's own full e2e was stopped
  at the lead's ask (two full suites at once would double the load), after 43 checks passed and none failed (§5.5).
  - On 1ef0646. Commits: ece9af7 (prompt), 849ad9f (log skeleton), 3449222 (the fixes), 85dbec8 (V-47 and the map's
    controls), dd1c522 (e2e checks, allow-list), 22b705a (measurement script, V-45 test), 97cd2b8 (UX-45, two patches),
    2c5444c (V-35 runs again), 3e06304 (screenshots, log), 724550a (landscape caption), ed6f124 (mobile QA 3's stacked
    row), 6349a51 (D-51, M-50), c82b33b (the Insights tile note), 0e22fd2 and 36b7118 (the two [V-36] checks), then
    this log.
  - Every finding in the brief, plus UX-45, V-35's precondition, M-50 and D-51 (added by the lead). UX-36 is a patch
    (index.html is not this lane's).
  - Tests: test/fix-viz-5.test.js (15, all red on fbdad58), test/e2e/fix-viz-5.e2e.js (24 checks, all pass), the
    reviewers' and QA round 4's red tests for these IDs all green.
  - CI-like `npm test` (a clean worktree with no data links) at c82b33b: 1,253 tests, 1,200 pass, 0 fail.
- **Next step:** none unless the lead's gate finds something in this lane.

## 1. Brief
Prompt: [prompts/fix-viz-5.md](prompts/fix-viz-5.md) (verbatim), plus the lead's follow-ups (UX-45; rebase onto 164874a,
then 1ef0646; a clean worktree for `npm test`). The user, 2026-10-11: "Are you sure the salary range of the big tech are
correct?! They don't look correct and kinda all span too evenly." viz-even fixed the bin-centred circles and the stacked
identical bars; this lane does the rest of it (V-33, V-34, V-38), marks pay as it was posted in the drawing (V-41, V-48,
MR-28's client medians, D-43), fixes axes, legends and words (V-42, V-46, UX-36 to UX-61, A-8, D-44, the phone cuts), the
map's words and controls (V-43 to V-45, the Razr cover, UX-45), and the chart's share of a filter or view switch (V-47).

Files owned: public/viz/chart.js, map.js, viz.css (note.js unchanged), public/features/insights.js (its medians),
one helper in public/features/shared.js (`notBasePay`), and in public/app.js the stats line's median pooling; the tests
above; the viz-lane entries of test/e2e/fix-phone-text.e2e.js's allow-list; this log, the prompt copy,
docs/screenshots/fix-viz-5/ and docs/process/scripts/viz-even-measure.mjs.

## 2. Inputs and sources
- docs/CONTRACT.md (fix wave 5, fix-data-3 and fix-pay-at-place sections), docs/strategy/ROADMAP.md §8,
  docs/process/PLAYBOOK.md (Checkpoints, Known traps), TEMPLATE.md.
- Findings: viz-review-beta-2.md (V-33 to V-48, §3 and §5 for the numbers and the contrast floors), ux-review-beta-2.md
  (UX-36, UX-38, UX-40 to UX-43, UX-45, UX-59, UX-61), docs/QA.md "Full QA pass (desktop, beta) 2026-10-16" (D-43, D-44),
  docs/REVIEW.md (A-8), methodology-review-beta-2.md MR-28 and fix-data-3.md (`notBasePay` in scripts/build-market.js),
  fix-phone-text.md and fix-phone-sizes.md (the viz-lane cuts and the Razr map), viz-even.md, fix-pay-at-place.md.
- Code: chart.js (chartPay, placeCircles, renderClusters' planning loop, buildCRow, renderRanges, groups, buildRow,
  showJobTip, renderLegend, renderAxis, renderHist), map.js (aggregate, summarize, pinElement, pinName, isApprox,
  renderJuiceLegend, fitToData), insights.js (midOf, summaryStats), app.js (stats, renderKpis, juiceScaleText,
  rangeEnd), palette.js (juiceNetForScore), server/juice.js (netForScore), server/geo.js (locationPrecision).
- The reviewer's scratch scripts (`<scratch>/viz-review-beta-2/`: clusters.mjs, passes.mjs, perfchart.mjs, perf.mjs,
  cvdshots.mjs) and viz-even's `<scratch>/viz-even/measure.mjs`. The brief names
  `docs/process/scripts/viz-even-measure.mjs`, which viz-even never committed; it is now committed, written from
  viz-even's copy with the reviewer's numbers added (§4).
- Data: the 2026-10-16 crawl (`<scratch>/wt-data2`), through the build's own lists.

## 3. Decisions and rationale

1. **MR-28: one base-pay rule for every median the browser draws.** `notBasePay(job)` in public/features/shared.js is
   build-market's rule: 'minimum' (salary.kind), 'shiftPay' (includesShiftDifferential), 'partTime' (salary.partTime),
   in that order. It is used by the chart (`basePayStats`, so the caption, every row median and the Ranges group
   medians), the stats line (app.js `stats`), the map (`summarize`: pins and Remote) and Insights (`midOf`).
   - Every posting stays on the chart, at its posted pay, and in every count ("13,980 with pay"). Only medians leave
     them out. A median falls back to them only when nothing else is left (an EU-only filter: "Median posted pay"; a
     row of minimums reads "from $53K").
   - The chart's notes' Details count them ("285 stated minimums, 636 with top shift pay and 14 with part-time pay are
     on the chart as posted, not in the medians"); a row's name says what its median leaves out; the stats line says it
     in Map view (in Chart view its facts are listed in the chart's Details, so it is not said twice); Insights' header
     Details count them; its "Pay published" tile still counts them as published pay.
   - Effect on Amazon: the median moves from $141K to $149K (935 of 13,980 postings left out, most of them hourly
     warehouse pay). A world-view pin like "London, Bad Hersfeld and 63 more" now rests on 75 base-pay postings
     ("$32K · 75 of 2.9K") instead of 361 including EU minimums ($40K).
   - Patch for the build-market owner: docs/process/patches/fix-viz-5-market-notbasepay.diff (build-market re-exports the
     shared helper, so the cells and the medians cannot drift apart).
2. **V-34: sizes that tell one posting from a group** (`circleRadius`). viz-even sized by √(n / largest) with a 9 px
   floor, so on Amazon (largest 1,665) every circle under 123 postings was the same dot.
   - A group's area grows by the same amount per posting, from the 9 px floor to full size at the largest count (d3's
     scaleRadial): on Amazon desktop 2 postings 9 px, 20 about 9.6, 123 about 12, 1,665 full size.
   - One posting is a smaller dot (6 px), so a lone posting never looks like a group.
   - Considered: a log scale (rejected: it understates the big circles, the concentration the user asked about); per-row
     scales (rejected: rows would not compare); counts printed beside small circles (rejected: clutter).
3. **V-33: plan at the drawn sizes and stop on a settled plan** (`settleCircles`). Sizes depend on the count they are
   sized against, and that count on the merges. On Amazon desktop the old loop alternated (sized for 1,123 the circles
   merge into 1,665; sized for 1,665 they split into 1,123 and 542) and drew one plan at the other's sizes.
   - Now the plan is always placeCircles at the drawn sizes, and its largest circle is never above the count it is sized
     against. When following the largest count settles, that is the reference and the largest circle is full size; when
     it alternates, the reference is the smallest count found by bisection (at most 8 steps) at which the plan's largest
     circle is no bigger, so the largest circle is drawn a little under full size (Amazon desktop: sized for 1,454, the
     1,123 circle 28 px wide).
   - The circles keep inside the plot by the largest drawn circle's radius (`edge`). The chart writes its reference on
     the body (`data-plan-n`, `data-r-max`, `data-edge`).
   - The planner sorts each row once and works on runs of equal midpoints, so the bisection's extra plans cost less than
     the old loop's sorts.
   - **Test edit:** beta-viz-review-2's [V-33] replayed with the old √ formula and inferred the sizes from the drawing.
     It now uses the chart's exported `circleRadius` and the body's reference when they are there (old builds keep the
     old inference). Its assertion is unchanged: the drawn circles are the plan at the drawn sizes.
4. **V-38: busy Ranges rows read as busy** (`barThickness`). A bar is 3 px for one posting and grows with the square root
   of its row's count to 14 px for the busiest row (a 22 px row keeps 4 px above and below; on phones the bar sits in the
   24 px under the title). A patterned bar (striped, dashed, fading) keeps at least 6 px, so its pattern reads.
   - The height still follows distinct ranges (one row each, viz-even's choice): §5.1's ink figures show how far
     thickness alone moves the picture (Netflix's rows-vs-postings gap 30% to 17%, Amazon's unchanged). Square root,
     cube root, log and linear scales were compared on the real rows (`<scratch>/fv5/ink.mjs`): within 1 to 4 points of
     each other; the square root with a 3 px floor keeps a one-posting bar's colour visible.
5. **UX-41: a stacked row's name** (`stackTitle`): its most common title, and how many other postings it holds
   ("Software Engineer II +13"). The count is said once, by the bar ("×14"), now on phones too (it was hidden there
   because the title line said it). **Test edit:** viz-even's e2e asserted the title starts with "N roles"; it now asserts
   the title names the roles (UX-41 replaces that behaviour).
6. **V-41: pay as posted.** A stated minimum is drawn from its figure with a bar that fades out to the right (no top),
   reads "from $53K, the posted minimum base pay" in its name and "From €46,000 EUR / The posted minimum base pay; the
   offer can be higher" in its tip, and has a legend key ("Fading: a posted minimum"). Pay that includes the top shift
   differential says "Includes top shift pay; base pay starts at $18.35 an hour" (the card's words). `rangeKey` adds the
   kind, so neither stacks with a plain range of the same figures.
7. **V-48:** "Dashed: on-target earnings" legend key; an on-target range over two levels is dashed and striped (both
   patterns), no longer striped alone.
8. **D-43: the card's figures.** `formatEnd`/`formatRange` follow app.js `rangeEnd` (SB-7): two decimals of millions
   ("$600K–$1.07M"), in the bars' names, tips and Clusters' midpoint words. app.js is not imported (it is the app's entry);
   the rule is the same.
9. **UX-59: the Ranges axis** (`rangesDomain`) is the robust bounds of the range ends the rows show, each row once, with
   robustBounds' far-out fence still guarding against a mis-parsed figure; the tightest of a few tick steps. Amazon's
   axis ends at $350K (was $300K, with every first-screen bar past it); Google's first 10 rows go from 8 past the axis to 3.
10. **D-44:** Location rows fold like departments: the 7 places with the most postings with pay lead, the rest are in
    "N more places" (Enter or a tap opens it, every place reachable). Ranges grouped by Location orders its groups by size.
11. **A-8:** the fold row is an option without aria-expanded; its name says "folded into one row; Enter shows each
    department" or "shown one by one below; Enter folds them".
12. **UX-40:** one visible sub-line form for every row and width, "1,215 roles · $178K"; a row's pay country is named
    only when its median is another country's pay than the other rows' ("12 roles · $95K in Poland"). The long words
    ("median $178K in the US, middle half $87K to $142K") are in its accessible name and title.
13. **V-42:** the middle-half band has a 1 px edge in the row's own colour (3:1 or better, the palette's floor for every
    mark) over a slightly stronger fill, and its values are in the row's name and title ("middle half $X to $Y").
14. **UX-42, UX-43:** a circle's count is measured as tabular digits (every digit as wide as "0") with 2 px of air each
    side; an edge chip always says its count ("›1").
15. **V-46, UX-61:** one currency name, "US dollars". Desktop: the label column's caption is the longest form that fits
    ("Yearly pay, US dollars (converted)", "US dollars a year, converted", "US dollars a year"; it was cut at 540 px).
    Phones (no label column): one line above the strip, "US dollars a year, converted · Median base pay $149K", shorter
    forms when that does not fit (280 px: "… · median $149K"). Landscape phones hide the strip (styles.css), so there the
    axis caption carries the median, and the label column widens to fit it (up to 40% of the chart; the phone smoke found
    it cut on Apple and Microsoft at 667 and 812 px).
16. **Cuts from fix-phone-text's guard:** the legend keys show their whole names (the legend already scrolls sideways);
    the fold arrow sits beside the row's name, so a cut name keeps it; under 340 px the map's Pay scale and line sit under
    the Pay | Juice switch, as wide as the box. The four "viz lane" entries are removed from the guard's allow-lists.
17. **V-43:** a pin whose median rests on under a quarter of its postings (`MIN_PIN_SHARE`, beside `MIN_PIN_PAY`) says
    so on the pin: "$76K · 5 of 434"; its name and tip give the share ("median $76K from 5 with pay for here (1% of them)").
18. **V-44:** the map counts the postings that list no place, in one line above the Remote button ("9 postings list no
    place, so not on the map"; Meta only). A patch to read Meta's places from titles ("…, Ohio") was not written: it
    would be a guess, and the data lanes decide places.
19. **V-45:** a place pinned at a state's or country's centre is approximate too (`isApproxPrecision`: 'centroid',
    'region', 'country'), so NVIDIA's "United States" and "Texas, US" pins say so.
20. **The Razr cover screen (352x355):** after a fit, while a price pin sits under one of the map's controls, the map zooms
    out half a step (at most 4), then tries small pans; a pin still covered joins its nearest pin (whose name then counts
    it), as a pin whose name finds no room already does, until the user moves the map. On a short screen the offline note
    is hidden (the names under the pins say enough). Amazon's 123 px world map is then one pin, "Seattle, Arlington and
    321 more", which counts every place; Apple's two pins are both clear.
21. **UX-45:** the map's Juice legend starts each grade where the list's scale and the drawer's badge do: a shown score is
    rounded, so Ripe (45) starts at 44.5, $47,103, and Juicy (70) at 69.5, $94,996 (`juiceCutoff`, the live
    netForScore at score − 0.5, which equals palette.js juiceNetForScore). It read "$48K" and "$96K".
22. **V-35 runs again** (the lead's ask). Its precondition looked for the old accessible name "one of N places", which
    fix-pay-at-place replaced with "the range posted for <place>" (barPlace), so it skipped on fbdad58 and in desktop QA
    round 4. It now finds one posting's bar with that wording; its assertions are unchanged. They need the tip to list
    the posting's place ranges with the bar's own named as in its heading, so a one-place bar's tip now lists them
    ("Bellevue: $82,700.00 – $117,100.00", up to 4 and "+N more"). On fbdad58's build it fails ("Posted for Cupertino; …"
    with no ranges listed); after, it passes. The new legend keys (dashed, fading) have their own class
    (`.ms-legend__kind`): `.ms-legend__span` stays the striped key, which fix-pay-at-place's [V-35] counts.
23. **UX-36:** "Group: None" is index.html's option text, not this lane's file. Patch:
    docs/process/patches/fix-viz-5-group-none.diff ("No grouping").
24. **V-47: the chart's share of a filter or view switch, with no change to what is drawn.**
    - chartPay's items, the medians, the groups, the stacks, each bar's pattern and stack key, and the circle plan are
      kept for the same list and Location filter (the app re-derives its list on any change, so "the same list" is the
      same postings in the same order).
    - The container's font and surface are read once a draw, before any row changes (each later read forced a style pass).
    - Which row or circle holds a posting is indexed on first use (a highlight), not on every draw.
    - Checked: the chart's DOM (rows, circles, bars, labels, legend, notes) over 18 views on 3 boards is identical before
      and after these changes (`<scratch>/fv5/domdump.mjs`, `domcmp.mjs`). One difference found on the way (a priced copy
      inherited its original's pattern) was fixed before the check passed.
25. **D-51 (desktop QA round 4): the Ranges legend wraps from 861 px up.** It was one row that scrolls sideways (fix-density's
    phone rule) at every width, so at 1440 px NVIDIA's "Striped" key sat under the fade, out of reach of a vertical wheel.
    A desktop has the room: the legend wraps there, with no fade. Phones keep the one row, and at every width the pattern
    keys (Striped, Dashed, Fading) now come first, before "Colour:", so a phone's first screen of the legend shows them.
26. **M-50 (mobile QA round 4): pins under the map's legend or Remote control at 320x568, 280x653 and 352x355.** QA tested
    the integration head, which does not have this lane. The Razr step (decision 20: after each fit, zoom out, pan, then
    merge a pin still under a control, until the user moves the map) is general, so it covers these sizes too. One change
    on top: its "covered" test counted the offline note ("Basemap unavailable", shown only when the basemap fails, as in
    this sandbox) as a control, so it zoomed out and merged pins for a note, where the QA check looks through it. The note
    is left out now, and so is the no-place line (V-44), which takes no taps (`pointer-events: none`).
    The e2e [Razr, M-50] check reads what a tap at the centre and the edges of every pin's price would hit, on the QA's
    cases (Apple, Meta, Netflix at 320x568; Apple, Meta, Anduril at 280x653; Apple, Amazon, Google, Microsoft on the Razr
    cover; Anduril at 812x375), and QA's own M-50 test runs on this build too (§5.5).
27. **The Insights median tile says "of 13,045 ranges"** when some posted pay is not base pay (MR-28). "of 13,045 with base
    pay" took two lines at 360 px and at 1440 (UX-49, UX-53 and fix-phone-text's guard).
28. **fix-pay-at-place's [V-36] and Beta viz review 2's [V-36] open the "N more places" row** (D-44) before they look for a
    place's row. fix-pay-at-place's looked for Amazon's Nashville row, now folded, and failed; viz review 2's skipped
    any place it could not see, so it could pass on nothing. With the row in view, both found Nashville at $126K where
    their reference said $116K: the reference was every posting's own-place pay, and MR-28 (decision 1) leaves Nashville's
    5 top-shift-pay postings out of the median (334 base-pay postings, a gap at the middle; the row's name says so).
    Pricing at the row's place was right. Their references now leave out what `notBasePay` names, as the chart does; what
    they assert (the row's median is its own place's, not the headline) is unchanged. Both pass.

## 4. Replayable steps

```sh
W=<worktree>; SP=<scratchpad>; F=$SP/fv5
git checkout --detach fbdad58      # later: git rebase --onto 1ef0646 164874a
ln -s $SP/wt-data2/data/snapshots data/snapshots; ln -s $SP/wt-data2/data/beta/snapshots data/beta/snapshots
ln -s /home/user/melon-seek/node_modules node_modules
node scripts/build-static.js                       # 3m20s; dist/ (the build copies public/ files verbatim)
cp -al dist $F/dist-before                         # the before build (hard links; replace files with cp --remove-destination)
for f in viz/chart.js viz/map.js viz/viz.css features/shared.js features/insights.js app.js; do
  cp --remove-destination public/$f dist/$f; cp --remove-destination public/$f dist/beta/$f; done
PORT=5571 node scripts/cycle/serve.mjs --dist $F/dist-before --pid $F/serve-before.pid &
PORT=5572 node scripts/cycle/serve.mjs --dist dist --pid $F/serve-after.pid &
# the reviewers' red tests and this lane's, before and after
NODE_PATH=$SP/pw/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome BETA_QA_DIST=<dist> \
  node scripts/e2e.js '--grep=Beta viz review 2|\[A-8\]|\[D-43\]|\[D-44\]|\[UX-42\]|\[UX-38\]|\[UX-45\]|viz-even|^fix-viz-5'
node --test test/fix-viz-5.test.js test/viz-even.test.js
# measurement (§5.1), before and after
PLAYWRIGHT_MODULE=$SP/pw/node_modules/playwright/index.mjs node docs/process/scripts/viz-even-measure.mjs \
  http://127.0.0.1:5571 $F/orig/viz/chart.js $F/measure-before.json
PLAYWRIGHT_MODULE=... node docs/process/scripts/viz-even-measure.mjs http://127.0.0.1:5572 public/viz/chart.js $F/measure-after.json
node $F/table.mjs $F/measure-before.json $F/measure-after.json
node $F/settle.mjs; node $F/domain2.mjs; node $F/ink.mjs        # V-33, UX-59, V-38's scales
node $F/perfchart.mjs before 3; node $F/perfchart.mjs after 3   # V-47, the chart alone
node $F/perfapp.mjs before 3; node $F/perfapp.mjs after 3       # V-47, the app's steps
node $F/profile.mjs after clusters; node $F/profapp.mjs after seniority
node $F/domdump.mjs after $F/dom-a.json; node $F/domcmp.mjs ...  # same drawing
node $F/shots.mjs before docs/screenshots/fix-viz-5; node $F/shots.mjs after docs/screenshots/fix-viz-5
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-viz-5
# CI-like npm test in a clean worktree (no data links; moving the links hung the session twice)
git worktree add --detach $F/clean HEAD; ln -s /home/user/melon-seek/node_modules $F/clean/node_modules
(cd $F/clean && MELON_BETA_SNAPSHOT_DIR= timeout 1200 npm test > $F/npm.log 2>&1)
node test/e2e/webkit/phone-smoke.mjs --dist dist --sizes all --engines chromium --out $F/smoke-after
node scripts/e2e.js > $F/e2e-full.log     # full suite, data linked, in the background
node $F/capprobe.mjs after                 # the landscape axis caption (V-46), 4 boards x 4 sizes
# QA round 4's M-50 and D-51 against a build: copy beta-mobile-qa-4.e2e.js and beta-desktop-qa-4.e2e.js from the QA
# worktrees into test/e2e/ (untracked), run them through a short runner like scripts/e2e.js with BETA_QA_DIST=<dist>
# and --grep='\[M-50\]|\[D-51\]', then delete the copies.
```

## 5. Verification

### 5.1 Measured before and after (viz-even-measure.mjs, the 2026-10-16 crawl)

Clusters, default view (Group by department). "Drawn at the smallest size" is the reviewer's floor share (V-34; before,
a one-posting circle and every group up to 135 postings were the same 9 px dot).

| Board, width | Circles | Drawn at the smallest size | Groups (2+) drawn the size of one posting (largest such) | 20+ drawn the size of one posting | Posted bands sharing a circle |
|---|---|---|---|---|---|
| Amazon 1440 | 70 → 72 | 45 (64%) → 4 (6%) | 41 (135) → 0 | 21 → 0 | 19 → 18 of 30 |
| Amazon 390 | 61 → 61 | 47 (77%) → 3 (5%) | 44 (217) → 0 | 26 → 0 | 21 → 21 of 30 |
| Apple 1440 | 60 → 60 | 48 (80%) → 7 (12%) | 41 (37) → 0 | 12 → 0 | 23 → 23 of 36 |
| Apple 390 | 50 → 50 | 40 (80%) → 3 (6%) | 37 (63) → 0 | 11 → 0 | 25 → 25 of 36 |
| Google 1440 | 65 → 74 | 40 (62%) → 8 (11%) | 34 (28) → 0 | 10 → 0 | 6 → 6 of 29 |
| Google 390 | 60 → 60 | 44 (73%) → 5 (8%) | 39 (40) → 0 | 16 → 0 | 10 → 10 of 29 |
| Meta 1440 | 60 → 61 | 34 (57%) → 9 (15%) | 26 (9) → 0 | 0 → 0 | 21 → 21 of 41 |
| Meta 390 | 55 → 55 | 33 (60%) → 6 (11%) | 27 (12) → 0 | 0 → 0 | 21 → 21 of 41 |
| Microsoft 1440 | 46 → 54 | 32 (70%) → 9 (17%) | 25 (20) → 0 | 1 → 0 | 8 → 6 of 32 |
| Microsoft 390 | 44 → 44 | 34 (77%) → 7 (16%) | 27 (33) → 0 | 6 → 0 | 10 → 10 of 32 |
| NVIDIA 1440 | 39 → 43 | 22 (56%) → 3 (7%) | 20 (19) → 0 | 0 → 0 | 10 → 10 of 38 |
| NVIDIA 390 | 35 → 35 | 23 (66%) → 2 (6%) | 21 (27) → 0 | 5 → 0 | 16 → 16 of 38 |
| Netflix 1440 | 38 → 39 | 16 (42%) → 9 (23%) | 7 (2) → 0 | 0 → 0 | 10 → 10 of 19 |
| Netflix 390 | 35 → 35 | 18 (51%) → 7 (20%) | 11 (4) → 0 | 0 → 0 | 10 → 10 of 19 |
| Anthropic (main) 1440 | 51 → 57 | 30 (59%) → 11 (19%) | 22 (8) → 0 | 0 → 0 | 19 → 17 of 39 |
| Anthropic (main) 390 | 44 → 44 | 26 (59%) → 6 (14%) | 20 (12) → 0 | 0 → 0 | 25 → 25 of 39 |
| Anduril (main) 1440 | 51 → 52 | 45 (88%) → 8 (15%) | 37 (57) → 0 | 6 → 0 | 11 → 10 of 33 |
| Anduril (main) 390 | 39 → 41 | 36 (92%) → 6 (15%) | 30 (132) → 0 | 10 → 0 | 21 → 20 of 33 |

After, the circles at the smallest size are the one-posting dots only. Desktop boards gain circles where the settled
plan no longer merges at a larger circle's size (Google +9, Microsoft +8, Anthropic +6).

V-33, what the plan settled on (`<scratch>/fv5/settle.mjs`): Amazon 1440 sized for 1,454, largest circle 1,123 (28 px);
"Operations, IT, & Support Engineering" keeps its two peaks, 1,123 at $87.4K and 542 at $107.7K (one 1,665 circle
before). Google 1440 sized for 260, largest 205 (28.7 px); Anduril 1440 651, largest 649. Every other board and width
settles at once, largest circle full size (Amazon 390: 1,665, where the narrower plot merges the two peaks at full size,
as the rule says).

Ranges at 1440 (the reviewer's "rows vs postings by $25K band" is the total variation between the share of rows and the
share of postings by band; "ink" weights each row by its bar's thickness):

| Board (1440) | Rows | One-posting rows: share of rows / of postings | Their share of ink, before → after | Rows vs postings by $25K band (TV) | Ink vs postings by $25K band (TV), before → after |
|---|---:|---|---|---|---|
| Amazon | 1,926 | 50% / 7% | 49% → 43% | 17% → 17% | 17% → 18% |
| Apple | 424 | 47% / 7% | 47% → 40% | 24% → 24% | 24% → 21% |
| Google | 489 | 50% / 10% | 50% → 39% | 23% → 23% | 23% → 21% |
| Meta | 322 | 48% / 16% | 48% → 28% | 12% → 12% | 12% → 7% |
| Microsoft | 312 | 54% / 11% | 54% → 43% | 30% → 30% | 30% → 24% |
| NVIDIA | 249 | 42% / 7% | 42% → 39% | 24% → 24% | 24% → 21% |
| Netflix | 125 | 73% / 35% | 73% → 52% | 30% → 30% | 30% → 17% |
| Anthropic (main) | 186 | 51% / 16% | 51% → 32% | 17% → 17% | 17% → 11% |
| Anduril (main) | 348 | 53% / 8% | 53% → 44% | 25% → 25% | 25% → 23% |

Amazon's ink figure does not move: its 285 stated minimums keep 6 px fading bars (decision 4), which outweighs the
thicker busy rows by band. The rows-vs-postings gap is by design (one row per distinct range); thickness narrows the ink
gap by 2 to 13 points on 8 of 9 boards. The distribution strip above the chart remains the drawing of where postings are.

UX-59 (`<scratch>/fv5/domain2.mjs`, rows as stacked, 4 ticks): Amazon axis $0–300K → $0–350K, first 10 rows past it
10 → 0; Apple $0–500K → $0–600K, 1 → 0; Google $0–400K → $0–500K, 8 → 4 (3 at the e2e's width); Meta unchanged (4, its
$527K and three $403K rows are past the fence); Microsoft $0–400K → $0–350K, 0; NVIDIA and Netflix 0.

### 5.2 Tests
- **test/fix-viz-5.test.js:** 15 tests, all pass; 14 fail on fbdad58 (the 15th, `notBasePay` equal to build-market's,
  needs the new export, so it fails there too: 15 of 15 red).
- **test/e2e/fix-viz-5.e2e.js** (registered in scripts/e2e.js), 24 checks: all 24 pass on this build (at c82b33b, load
  8 to 12). The first 23, on fbdad58's build: 21 fail and 2 pass (V-33 at 390 px, which settled there already, and
  nothing else). The 24th, [D-51], and the M-50 cases added to [Razr, M-50] came later; QA round 4's own tests for them
  fail on fbdad58's build and pass on this one (below).
- **QA round 4's tests** (copied from the QA worktrees, run alone, not committed here): "Beta mobile QA 4: [M-50]" on
  fbdad58's build fails with 8 hidden pins (Apple's, Meta's and Netflix's Europe pin under the map legend's Details
  button at 320x568 and 280x653; Amazon's, Google's and Microsoft's South America pins under the Remote control on the Razr cover);
  on this build it passes. "Beta desktop QA 4: [D-51]": before, the 1440 px legend shows 670 of its 1,761 px, with
  "Striped" and five colour keys out of view; after, it passes. The V-45 check failed before once it
  read the pins of the state- and country-only places themselves.
- **The reviewers' red tests for these IDs**, on fbdad58's build: 13 of 27 pass (V-36, V-37, V-39, V-40, V-45, UX-38 and
  viz-even's 7; V-35 skips: it looks for the old "one of N places" wording), 13 fail (A-8, D-43, D-44, V-33, V-34, V-38,
  V-41, V-42, V-43, V-44, V-46, V-48, UX-42). After: 27 of 27 pass. V-35, with its precondition updated (decision 22),
  fails on fbdad58's build and passes after. UX-45 (beta-ux-review-2): fails before, passes after.
- **viz-even:** 7/7 unit tests; e2e 7/7 with the UX-41 edit (decision 5).
- **CI-like `npm test`** in a clean worktree with no data links (`MELON_BETA_SNAPSHOT_DIR=`): at 97cd2b8 (load 18) and
  at c82b33b (load 7 to 12), 1,253 tests, 1,200 pass, 0 fail, 8 skipped, 45 to-do. (At 724550a S-6 failed once at load
  24 and passed alone, 17/17.) After c82b33b only e2e files and this log changed.

### 5.3 Contrast and colour-blind views
- The band's edge is the row colour itself: 3:1 or better on the chart in light and dark (the e2e [V-42] check measures
  every row's edge, light and dark: all at or above 3:1; the palette's category colours are chosen for that, V-22). The
  fill is 13% (light) / 22% (dark) of the row colour, behind the circles.
- No new colours: the new keys (dashed, fading) are patterns on the existing muted swatch; a one-posting dot is the row
  colour (3:1); the map's new line is muted text on the surface (as the offline note).
- Screenshots under simulated deuteranopia and protanopia (Machado 2009, the reviewer's method):
  `after-clusters-amazon-d1440-deuteranopia.png`, `after-ranges-nvidia-ote-d1440-protanopia.png`,
  `after-ranges-amazon-min-d1440-deuteranopia.png`, with their before files. Patterns and sizes carry what changed, so
  they read the same without colour.

### 5.4 Phones
- **Phone smoke** (test/e2e/webkit/phone-smoke.mjs, Chromium, every size in phone-sizes.mjs, 7 beta boards, at
  2c5444c): 95/95 ok, before and after: every page loaded with cards, no page error, no sideways page scroll.
- **The landscape caption** (724550a, after that smoke): `<scratch>/fv5/capprobe.mjs` on Google, Apple, Microsoft and
  Amazon at 812x375, 667x375, 844x390 and 740x360: "US dollars a year · median $183K" and the rest are whole, with 14 px
  or more to spare (Google was cut by 0.22 px at 812 and 667 before it).
- **Phone matrix** (34 checks) in the full run of §5.5's first attempt: 34/34.
- **fix-phone-text's guard and checks** in that run: 84 pass, 16 fail. 10 held this lane's Insights tile note ("of
  13,045 with base pay" on two lines), fixed in c82b33b; 2 the Google landscape caption, fixed in 724550a; 7 cut
  department names in the filter sheet ("Program and Product Management" at 280 to 360 px), which this lane does not
  touch (3 held both the tile note and the filter sheet). So 7 should still fail, on the filter sheet only. Re-run after the fixes: [UX-53], [UX-49, UX-53], the
  desktop guard at 1440 and the Google 812x375 guard pass.

### 5.5 Full e2e
- **First run** (the whole suite, data linked, a build synced while it ran, before 724550a): 735/762 passed, 21 failed,
  6 skipped. Of the 21: T21 (cold server under load, passes alone), mobile QA 3's stacked-row tap (its precondition read
  the "N roles" title UX-41 replaced; fixed in ed6f124, passes), UX-39 (fix-phone-sizes' lane), UX-49/UX-53 and 16
  fix-phone-text checks (§5.4), and fix-pay-at-place's [V-36] (decision 28, passes).
- **Second run, at c82b33b, stopped at the lead's ask** after 43 checks passed and none failed (the lead runs the full
  gate on the integrated head; two suites at once would double the load). Every failure in its log after the stop is
  "browser has been closed".
- **Targeted, at 36b7118's build:** fix-viz-5 24/24; both [V-36]; Beta mobile QA 3's stacked-row tap; [UX-53],
  [UX-49, UX-53], the 1440 desktop guard, the Google 812x375 guard; QA round 4's [M-50] and [D-51]: all pass.

### 5.6 V-47 timings
The chart's own `update()` on Amazon (22,179 postings) in a 702 px host, the median of 3 rounds of 5 runs after a
warm-up, load about 2.5 (`<scratch>/fv5/perfchart.mjs`), before → after, ms:

| Case | Before | After |
|---|---:|---|
| Clusters, Group by department | 79 | 26 |
| Clusters, Group by seniority | 76 | 21 |
| Clusters, Group by location | 113 | 56 |
| Clusters, Seattle filter | 48 | 19 |
| Ranges, no grouping | 52 | 13 |
| Ranges, Group by department | 63 | 15 |
| Clusters, one department (Software Development) | 14 | 7 |

In the app (DevTools profiles, `<scratch>/fv5/profapp.mjs`), chart.js's own time on a Group by seniority switch goes from
130 to 51 ms, and on a switch to Ranges from 97 to 57 ms. The app's settled time is mostly app.js's derive and the
browser's layout, and swings with the load, so it is not a reliable before-and-after figure here. A new list (a filter
change) re-derives everything (§6); its timings were not taken at a quiet load.

### 5.7 Screenshots
docs/screenshots/fix-viz-5/, `before-<view>.png` and `after-<view>.png` for each visible change: Clusters (Amazon desktop
light and dark, Amazon 390 light and dark, Amazon 280, Google, Anduril, Google landscape 812x375), Group by Location
(Google desktop and 390), Ranges (Amazon desktop light and dark, 390 light and dark, 540 (Surface Duo); Google; Microsoft;
NVIDIA on-target earnings; Amazon minimums and shift pay with the tip open; Netflix's millions), the map (Amazon world
view, Meta's no-place line light and dark, Amazon 280 and 390 dark, the Razr cover for Apple and Amazon, Apple's Juice
legend desktop and 390 dark) and three colour-blind views.

## 6. Known gaps and follow-ups
- **Ranges' height still follows distinct ranges** (§5.1). Thickness shows busy rows; it cannot give a 775-posting row
  775 times the room. A per-row count bar, or one row per band across colours (UX-41's "consider"), are larger changes.
- **The Razr cover map** shows Amazon's world as one pin until the user moves the map (decision 20).
- **On a phone the median is said twice** on the chart's first screen: the stats line above the chart has it, and the
  chart's caption line now does too (V-46 asks for the latter).
- **V-44's places:** Meta's 9 postings name their place only in the title ("Local Partnerships Lead, Ohio"); placing them
  is the data lanes' call.
- **Under a Location filter** the app hands the chart a new place test each draw, so V-47's kept work applies only
  without one.
- **WebKit** is not installed here; the webkit-phone workflow runs it on GitHub.
- UX-36 and the build-market rule are patches for their owners (decisions 1 and 23).
- **The filter sheet's department names** are cut at 280 to 360 px ("Program and Product Management", fix-phone-text's
  guard); the filter sheet is not this lane's.

## 7. Change log
- 2026-10-17 10:30: started from fbdad58; baselines (reviewers' red tests 13/27, phone smoke 95/95 ok, phone matrix and
  phone-text guard 126/134 with 8 known failures outside this lane).
- 11:00–11:45: the fixes (3449222), V-47 (85dbec8), e2e checks (dd1c522), the measurement script (22b705a).
- 11:49 and 12:31: the session hung twice on the command that moved the data links out of data/; the lead restarted it.
  The links were never moved. `npm test` now runs in a clean worktree instead.
- 12:40: UX-45 (97cd2b8); rebased onto 164874a, then 1ef0646.
- 13:20: V-35 runs again (2c5444c), the lead's ask.
- 13:25–13:56: screenshots (3e06304); the phone smoke found the landscape caption cut on Apple and Microsoft (724550a);
  mobile QA 3's stacked-row test (ed6f124); D-51 and M-50 from QA round 4 (6349a51). Then an API session limit.
- 15:30: resumed. The Insights tile note (c82b33b); `npm test` at c82b33b clean; fix-viz-5 e2e 24/24; QA round 4's
  M-50 and D-51 red before, green after; the two [V-36] checks (0e22fd2, 36b7118). The second full e2e was stopped at
  the lead's ask: the lead gates the integrated head.
