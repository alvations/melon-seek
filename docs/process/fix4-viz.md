# Process log: fix4-viz (chart and map lane, fix wave 4, target `beta` and the main site)

## 1. Brief

Prompt: [prompts/fix4-viz.md](prompts/fix4-viz.md) (verbatim). Fix the chart, map and comps findings of the beta
data-visualisation review (V-16 to V-29, V-31 log only), the desktop QA's D-31, the UX review's UX-17, UX-19
(map part), UX-24 and UX-36, the methodology review's MR-2 (chart and map part) and MR-13, and the mobile QA's
open M-8 items. Both builds share the code, so every fix applies to `/melon-seek/` and `/melon-seek/beta/`.

Files owned and changed: `public/viz/chart.js`, `public/viz/map.js`, `public/viz/comps.js`, `public/viz/viz.css`,
the colour parts of `public/viz/palette.js` (`FX_PER_USD`, `FX_AS_OF`, `COUNTRY_CURRENCY` untouched). No test file
needed a change. Patch for a file this lane does not own: `docs/process/patches/fix4-viz-mr2-chart-todo.diff`.

Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a428d3af6a12ca8f6`, detached from b4d4c0f. Never pushed.

## 2. Inputs and sources

- [viz-review-beta.md](viz-review-beta.md) (V-16 to V-32: cause, numbers, owner), its tests
  `test/e2e/beta-viz-review.e2e.js`; `docs/QA.md` "Full QA pass (desktop, beta) 2026-10-11" D-31 and
  `test/e2e/beta-desktop-qa-2.e2e.js`; [ux-review-beta.md](ux-review-beta.md) UX-17, UX-19, UX-24, UX-36 and
  `test/e2e/beta-ux-review.e2e.js`; [methodology-review-beta.md](methodology-review-beta.md) MR-2, MR-13 and
  `test/beta-methodology.test.js`; `docs/QA.md` M-8 (zoom 30x30, Pay|Juice 52x26, Remote 32 tall).
- [lead.md](lead.md) shared decision 4 (part-time hourly pay: `salary.min/max` are a full-time year, so a yearly
  figure says "a year if full-time"), and app.js `isPartTimeHourly` (`salary.partTime && originalInterval === 'hour'`).
- `docs/CONTRACT.md` v5: `salary.levels` (`[{ label, min, max }]`, two or more levels priced in one posting);
  `server/sources/apple.js spanPay` (`salary.ranges`, one requisition's ranges with their places, DQ-28).
- `server/geo.js locationPrecision()` ('centroid': a place the gazetteer knows only by its state or country),
  shipped to the browser as `lib/geo.js` (`server/lib-modules.js`).
- `docs/strategy/ROADMAP.md` §8: no new main-view control, labels monochrome, no new palette colours.
- The dataviz skill (method, `references/palette.md`: an 8-slot palette cannot clear all-pairs CVD floors at the
  reference steps, so the slots were re-searched under the 3:1 constraint; see decision 9).

## 3. Decisions and rationale

1. **V-16 / MR-13, map Pay colour on one fixed scale, with a Pay legend.** Cause: `drawMarkers()` scaled each pin
   by `(median − lo) / (hi − lo)` over the pins on screen (a lone pin was always `t = 0.6`). Fix: `palette.js
   payColor(usd)` maps the pin's median to five fixed approx-USD steps, `PAY_BREAKS = [100K, 150K, 200K, 300K]`
   (Netflix Los Gatos $473K is step 5, Google Warsaw $75K step 1). The Pay legend (`map.js renderPayLegend`, in
   the existing Pay|Juice box, shown in Pay mode) draws the five chips with the breaks under their edges and one
   line: "Median posted base pay a year, approx US dollars (Jul 2026 exchange rates) · small number: postings"
   (MR-13's wording; the rates' month links to `methodology/#7-how-often-its-updated`, MR-2). The legend is not a
   control. Alternative considered: a continuous ramp over a fixed range; rejected, because a stepped scale can be
   read off a legend and keeps each step's contrast checkable.
2. **V-17, a pin's pay figure.** `MIN_PIN_PAY = 3`: a pin shows a price only when at least three of its postings
   post pay for its places; with fewer it reads "48 jobs" and the tooltip gives the figures ("1 with salary for
   here ($292K), too few for a median"). A priced pin whose median rests on part of its postings says how many in
   its accessible name ("median $101K from 28 with pay for here") and its tooltip ("The median is of those 28, not
   of all 800"). Map medians are base pay (on-target earnings only when nothing else is left), the chart's and the
   stats line's rule (BP-13). The US-pay-on-a-UAE-role part is `payLocations`' fallback, the data lane's.
3. **V-18, Group by Location.** Cause: rows were keyed by the first location, and every plotted range went into
   that row. Fix: `chart.js payCoversRow(job, key)`: a range counts in its row only when one of its
   `payLocations` is the row's place and the pay is in that place's currency (so `payLocations`' fallback to all
   locations does not make US dollars London pay). Under a Location filter the row is the first location the
   filter takes in (`locationRowKey`), so NVIDIA's Munich-paid role is a Munich row, not "Italy". Rows with only
   other places' pay read "no salary posted for here"; the notes line counts the ranges left out of their rows.
4. **V-19, part-time hourly pay.** `isPartTimeHourly` (app.js's rule). The Ranges tooltip leads with the hourly
   rate ("$31.11 – $42.89 an hour", the card's figure) and says "Part-time. The bar is $65K – $89K a year if full-time (2,080 hours)";
   the option name and the notes line say "a year if full-time". Bars stay full-time years so they share the axis.
5. **V-20, spans.** `spanTiers(job)`: `salary.levels` (two or more levels) or `salary.ranges` (one requisition's
   ranges for several places). Such a bar is striped (surface stripes over the row's colour, so its 3:1 fill and
   its identity stay), on-target earnings dashed; the legend gets a "Striped: several levels or places" key (a
   texture, not a colour: §8) and the tooltip lists each tier ("Level 4: $168K – $264K, Level 5: $196K – $310K").
   Their midpoints still feed the bins and medians (see §6).
6. **V-21, rows that mix countries.** By department or seniority, when the plotted pay is in more than one
   currency, each row's median, band and tick use the board's main currency (most postings; USD on every big-tech
   board), or the row's one currency when it has none of it; a row of several other currencies says "several
   countries' pay". The subtitle says where: "34 roles · median $127K in the US" (short form "$127K US"); the
   label's title and the notes line count the postings in the circles but not in the median. The caption ("Median
   base pay $168K") stays the stats line's all-pay median. Ranges group medians follow the same rule. Currency, not
   `payCountry`, is the basis, because `payCountry` inherits `payLocations`' fallback.
7. **V-22, marks at 3:1.** Circles are the row colour itself (`--_bin-mix: 100%`), range bars at full opacity
   (`--_bar-o: 1`), the strip's bins at .74–.80 opacity, the Clusters median tick at .8; every categorical slot,
   Other and every pay step is chosen at ≥ 3:1 (decisions 9 and 1). Hover keeps a ring (no lighter-to-darker swap
   any more). Counts show only when they fit inside the solid circle (else they are in the aria-label and tooltip).
   The Juice "Ripe" pin keeps its 24% tint: its solid ring (7.06:1) is the mark's boundary.
8. **V-23, company colours in dark mode.** `palette.js readableOn(hex, bg, 3)` moves a colour toward white (dark
   background) or black (light) just far enough for 3:1; `comps.js` applies it against the actual backdrop (the
   first opaque background up the tree, the drawer). Anduril `#1f2a37` → `#6d757d`, Palantir `#101113` →
   `#707071` on `#1b2028`; colours that already pass are untouched. Close brand colours (Shield AI vs Google)
   stay close: the rows are named, and brand colours are companies.json's, not this lane's.
9. **V-25, colour-blind-safe categories.** New 8 slots plus Other, found by a search (scratchpad `search2.mjs`,
   seeded on the old hue order, OKLCH hue ±10°, chroma ≤ .18) under these constraints: every slot and Other
   ≥ 3.15:1 on its surface (light `#ffffff`; dark `#161a21` and the drawer's `#1b2028`), and every pair of the
   nine (a legend shows all at once, so not only neighbours) apart under deuteranopia, protanopia and tritanopia
   (Machado 2009, CIELAB ΔE, the review's own metric):

   | | Light | Dark |
   |---|---|---|
   | Slots 1–8 | `#4a7de8 #a33806 #17a478 #ba7f14 #903081 #296f16 #7d44b2 #e45d58` | `#698dfd #ef7926 #00d097 #efa30f #d765b6 #47ab4f #9654c1 #c44323` |
   | Other | `#706f6c` | `#807f7c` |
   | Contrast on surface | 3.17–7.18 | 3.47–8.70 |
   | Min ΔE normal / deut / prot / trit | 24.7 / 13.3 / 12.6 / 19.0 | 25.0 / 12.7 / 13.4 / 17.2 |
   | Old palette, same measure | contrast 2.17–8.56; deut 1.9 (pink vs Other) | prot 2.5 (blue vs violet); deut 3.5 |

   Same number of slots and hue families (§8: no new palette colours). Old hexes are gone from the CSS
   (`test/features.test.js` checks that the CSS never hard-codes them).
10. **V-26, approximate places.** `map.js` loads `lib/geo.js` with the map (like `lib/juice.js`) and marks a place
    whose `locationPrecision` is 'centroid'. Its pin's name says ", approximate place" and its tooltip "Approximate:
    pinned at the centre of its state or region, not at the town itself" (a cluster: "2 of these places are
    approximate"). No geo.js (the viz demo): nothing is marked.
11. **V-24 / D-31, pins off the map.** `placeLabels()` hides the names of pins outside the map and never returns
    them as "no room" (that is what merged them into the clicked pin: Anchorage → "Cupertino, Austin and 212 more"
    4.9K), and `mergeInto()` never merges into a pin off the map.
12. **V-27, axis labels.** `chart.js formatTick()`: up to two decimals, no trailing zeros ($1.25M, $1.5M, $12.5K);
    used by the chart axis and the comps axis. `formatMoney` is unchanged elsewhere.
13. **V-28, the gray no-data pin.** Juice-mode pins with no Juice data are filled `--_nodata` (40% muted into the
    surface: `rgb(189,…)` light, `rgb(83,…)` dark), and the legend line has a matching swatch.
14. **V-29 / UX-17, edge chips.** Bins are aligned to the axis: the bin width divides the tick step (or is a multiple
    of it) and the axis ends on a bin edge, so no circle is centred on the axis end. The "‹12" / "›19" chips sit in
    gutters reserved outside the plot, sized to the widest chip (6 px off the plot), so they never leave a 390 px
    screen or touch the label column.
15. **UX-24, many departments.** By department with more than 8 rows, the 7 with the most postings with pay keep
    their rows and colours (the same 7 the legend and the card dots colour) and the rest fold into one gray "N more
    departments ▾" row with its own circles and median. Its label opens it (aria-expanded; ▴ folds it again) instead
    of selecting 600 mixed roles; its circles select as usual. The review asked for "the 8 largest, then a fold";
    7 + the fold keeps the fold row equal to the "Other" colour and the card dots consistent. No new control: it is
    a row of the chart.
16. **UX-36.** The Ranges legend title reads "Colour: department", so "Group: None" and a department legend no longer
    read as a contradiction. Renaming the select is app.js/index.html (not this lane); not needed now.
17. **UX-19 / M-8, map tap targets on phones (≤ 860 px).** Zoom ± 44x44, Pay|Juice 44 tall (56 wide), Remote 44
    tall, as real boxes (the old hit-slop pseudo-elements measured 30x30 and 52x26). Desktop is unchanged. The Beta
    tag and logo of UX-19 are `public/styles.css` (fix4-app).
18. **MR-2 (chart and map).** The chart's notes line ends "417 converted from another currency at Jul 2026 exchange
    rates", the date a link to the methodology section naming the source; the map's Pay legend and pin tooltips name
    the rates' month too. The drawer and Insights header are fix4-app's. The MR-2 chart to-do in
    `test/beta-methodology.test.js` now passes; the patch drops its `todo`.
19. **The Pay legend on phones** sits beside the Pay|Juice switch (one row, the breaks without "$", the note
    ellipsised with its full text in its title). Stacked under the 44 px switch it pushed the box to about 118 px and
    the full suite's "Beta mobile QA: Apple map: one-finger pan" started its drag on the legend ("pan did not move
    the map"); a real thumb would have too. Side by side the box is one control tall and that test passes again.

## 4. Replayable steps

```sh
WT=/home/user/melon-seek/.claude/worktrees/agent-a428d3af6a12ca8f6; SP=<scratchpad>/fix4-viz
git checkout --detach b4d4c0f
ln -s /home/user/melon-seek/node_modules node_modules
ln -s /home/user/melon-seek/data/snapshots data/snapshots
mkdir -p data/beta && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots
node scripts/build-static.js --out $SP/dist-before            # base build, for "before"
# palette search (scratchpad): col.mjs (contrast, CIELAB, Machado CVD), search2.mjs, ramp.mjs
FLOOR=12 node $SP/search2.mjs light 300; FLOOR=12 node $SP/search2.mjs dark 300; node $SP/ramp.mjs
node $SP/before.mjs                                            # the old palette's numbers
node scripts/build-static.js --out $SP/dist
export NODE_PATH=<scratchpad>/pw/node_modules
BETA_QA_DIST=$SP/dist node scripts/e2e.js '--grep=Beta viz review|D-31|UX-17|UX-19'
BETA_QA_DIST=$SP/dist-before node scripts/e2e.js > $SP/e2e-full-before.log
BETA_QA_DIST=$SP/dist node scripts/e2e.js > $SP/e2e-full-after.log
node scripts/cycle/serve.mjs --dist $SP/dist-before --pid $SP/serve-before.pid &
node scripts/cycle/serve.mjs --dist $SP/dist --pid $SP/serve-after.pid &
node $SP/shoot.mjs http://127.0.0.1:<port>/melon-seek/beta $SP/shots before   # and "after"
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix4-viz
kill "$(cat $SP/serve-before.pid)" "$(cat $SP/serve-after.pid)"
mkdir -p $SP/empty-beta; mv data/snapshots data/beta/snapshots aside; MELON_BETA_SNAPSHOT_DIR=$SP/empty-beta npm test
```

## 5. Verification

**Gate tests** (`--grep='Beta viz review|D-31|UX-17|UX-19'`, desktop Chromium, offline basemap):
- Before (base build): 0/19 pass. After (final build): 16/19 pass. The 3 still red are not this lane's: V-30 and
  V-32 (app.js / styles.css, Juice drawer) and UX-19's Beta tag 43x21 and logo 26x26 (styles.css); the map part of
  UX-19 (Pay, Juice, + and − at 44x44 or more) no longer appears in its message.
- All 15 viz-review tests of this lane pass: V-16 to V-29 (V-31 has no test), D-31 and UX-17.

**Full e2e suite** (`node scripts/e2e.js`, BETA_QA_DIST = the build): before 220/301 passed, 41 failed, 40 skipped;
after 238/301 passed, 23 failed, 40 skipped. Fixed: the 16 above plus 3 load-dependent ones (Compstimate T21,
Desktop QA D-4, UI Insights). New failure in that run: "Beta mobile QA: Apple map: one-finger pan" (the phone Pay
legend, decision 19); after the fix it passes, in a rerun of every Beta mobile QA, Mobile QA, Beta UX review,
fix-viz, fix3-viz and map test on the final build (45/53 and 34/40, the failures all in the "before" list).

**npm test** with `MELON_BETA_SNAPSHOT_DIR` an empty folder and the `data/snapshots` and `data/beta/snapshots`
links removed: 1,009 tests, 924 pass, 0 fail, 7 skipped, 78 to-do (the open review to-dos). With the links: 1,015,
937 pass, 0 fail, 78 to-do (as at the base). The MR-2 chart to-do now passes (`ok … # TODO`).

**Contrast**, measured in Chromium on the built pages (WCAG, marks composited with their opacity over the real
background; `docs/screenshots/fix4-viz/before-numbers.json`, `after-numbers.json`):

| Mark | Light before | Light after | Dark before | Dark after |
|---|---|---|---|---|
| Clusters circles (Apple) | 1.26–1.68 | 3.17–7.18 | 1.82–2.70 | 3.60–8.70 |
| Clusters median tick | 2.40 | 9.40 | 3.20 | 9.77 |
| Distribution strip bins | 1.45 | 3.26 | 2.58 | 6.05 |
| Ranges bars (NVIDIA) | 1.50–2.52 | 3.17–6.28 | 2.28–3.52 | 3.60–8.70 |
| Ranges midpoint dots | 2.44–8.56 | 3.17–6.28 | 3.22–5.58 | 3.60–8.70 |
| Map Pay pins (the 5 steps, on the map background) | 2.02–9.46 | 3.33–13.6 | 2.22–14.0 | 3.06–13.4 |
| Map no-Juice pins (neutral, not a data mark) | 1.05 (white) | 1.73 (gray) | 1.04 | 2.43 |
| Same role elsewhere bars (dark, drawer) | 1.09–4.16 | 3.06–6.78 | | |
| Same role elsewhere median ticks (dark) | 1.13–6.78 | 3.06–6.78 | | |

Pay-step price text (inkOn) is 5.5–14.8:1 on its fill. Categorical palette numbers: decision 9.

**Colour-blind simulations** (Machado 2009 `feColorMatrix` on the chart): `before-/after-apple-ranges-legend-
deuteranopia.png`, `-protanopia.png`, `before-/after-apple-clusters-deuteranopia.png`, `-protanopia.png`.

**Screenshots** (`docs/screenshots/fix4-viz/`, `before-` and `after-` each, shrunk 13.8 MB → 3.6 MB): Apple
clusters light/dark, NVIDIA ranges light/dark, NVIDIA two-level tooltip, Apple part-time tooltip, Apple ranges
legend, Microsoft seniority, Google location, NVIDIA departments (fold), Microsoft location edge chips, Netflix axis,
Netflix map Pay light/dark (legend), Netflix Warsaw pin tooltip, Google map zoomed twice (floating names), Google
Haskell pin, Google map Juice light/dark, phone Google chart, phone Apple map, comps dark.

**Drawing time on Apple** (the chart regrouped department ↔ seniority 8 times, and Clusters ↔ Ranges 6 times, click
to two frames after, ms): regroup before 155 113 159 128 113 124 86 88 (median 118), after 194 215 141 91 101 113
101 99 (median 107; the first two at load, an earlier run gave 152 119 137 98 118 115 120 97, median 117); view
switch before 144 124 90 120 118 78 (median 119), after 83 90 97 91 92 87 (median 90). No worse.

**V-31** (log only): the regroup above is the app's filter, list and chart together: 86–215 ms on this machine
under load, the same range as the review's 177–346 ms department filter; the chart's own share did not grow.

`df -h /` before: 19 GB free; the scratch builds (296 MB each) are deleted at the end.

## 6. Known gaps and follow-ups

- Two-level and multi-place spans are drawn and labelled as such, but their overall midpoints still feed the
  Clusters bins and the medians (62% of NVIDIA's ranges). Using each tier, or the level the posting is filed at,
  is a data and methodology call for the lead.
- Under deuteranopia some pairs differ mostly in lightness (Apple: "Software and Services" rust vs "Apple Retail"
  green; "Hardware" blue vs "Marketing" violet). They clear ΔE 12.6, and every row and legend entry is named, but
  nine colours cannot be far apart in two simulated dimensions.
- Brand colours lifted to 3:1 can converge (Anduril and Palantir both become mid grays in dark mode). The rows
  are named; companies.json could carry dark variants.
- V-17: the pill of a priced pin still shows the posting count beside the median of fewer postings (the name,
  tooltip and legend say what each number is).
- V-21: Insights "Pay by department" (`public/features/insights.js deptBoxes`) still pools countries (fix4-app).
- V-31 (Apple filter 177–346 ms): not this lane's code; measured only (§5).
- UX-19's Beta tag (43x21) and logo (26x26), V-30 and V-32 remain for fix4-app; their tests stay red here.

## 7. Change log

- 2026-10-11: findings fixed in 192d8fa; phone Pay legend beside the switch (decision 19), counts only when they fit, log, screenshots and patch in 03489bf; this line in the last commit. Scratch builds deleted; df -h / after: 17 GB free.
