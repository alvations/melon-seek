# Process log: viz-review-beta (data-visualisation review of target `beta`, 2026-10-11)

## 1. Brief

Prompt: [prompts/viz-review-beta.md](prompts/viz-review-beta.md) (verbatim). Check that every chart and map
on `/melon-seek/beta/` encodes the data honestly and readably, with today's crawl for Apple, Google, NVIDIA,
Microsoft and Netflix, plus Anduril from the main site; check fix wave 3's chart and map lane
([fix3-viz.md](fix3-viz.md)). No product code edited.

Files owned: this log, the prompt file, `docs/screenshots/viz-review-beta/` (76 files, shrunk to 3.8 MB) and
the new `test/e2e/beta-viz-review.e2e.js` (16 tests, each `[V-n]`), registered in `scripts/e2e.js`.

## 2. Inputs and sources

- `docs/CONTRACT.md` (Frontend interfaces; v4 `salary.kind: 'ote'`; v5 `salary.levels`; "Fix wave 3 additions"
  for the chart and map), [viz.md](viz.md), [fix-viz.md](fix-viz.md), [fix3-viz.md](fix3-viz.md),
  `docs/LIVABILITY.md`, `docs/METHODOLOGY_GUIDE.md`, [PLAYBOOK.md](PLAYBOOK.md), [TEMPLATE.md](TEMPLATE.md),
  the beta sections of [lead.md](lead.md) and the 2026-10-10 beta QA passes in `docs/QA.md`.
- Code read: `public/viz/chart.js`, `map.js`, `palette.js`, `comps.js`, `viz.css`; `public/features/shared.js`
  (`payLocations`), `comps.js`, `compstimate.js`, `insights.js`; `public/app.js` (`renderViz`, `stats`,
  `juiceBlock`, the part-time rule "shared decision 4"); `scripts/build-market.js`; `server/geo.js`
  (`locationPrecision`).
- Build: the lead's `scratchpad/cycle-beta5/dist` (8259b1b, today's crawl), served with
  `scripts/cycle/serve.mjs`. Data: the app's own unpacked lists, read through `api.js getJobs()` in the page and
  saved to the scratchpad (Apple 4,875 postings / 2,818 with pay, Google 3,417 / 2,217, NVIDIA 2,663 / 1,396,
  Microsoft 2,279 / 1,490, Netflix 457 / 290, Anduril 2,491 / 2,345: the counts in the lead's note), and
  `dist/beta/api/market.json`, `dist/beta/api/cities.json`.
- Highest earlier V ID: V15 (viz.md, fix-viz.md, lead.md, QA.md and the review logs), so findings start at
  V-16. D-31 (a pin click folds off-screen pins) is the desktop QA's and not re-filed; V-24 is its sibling.

## 3. Findings

Severity: High = a wrong or misleading number; Medium = hard to read or inconsistent; Low = polish.
Every finding except V-31 has a red test in `test/e2e/beta-viz-review.e2e.js` with its ID in the name.
Screenshots are in `docs/screenshots/viz-review-beta/`.

### V-16 (Medium) Map: the Pay colour is relative to the pins on screen and has no legend
- View: Map, Pay. Repro: `#c=netflix&m=map&l=Los%20Gatos` and `#c=google&m=map&l=Warsaw`; or any board at
  world zoom.
- Expected: one green means one pay level everywhere, with a legend (like the Juice legend).
- Actual: `drawMarkers()` maps each pin to `t = (median − lo) / (hi − lo)` over the clusters drawn now, and a
  lone pin gets `t = 0.6`. Los Gatos "$473K · 98" and Warsaw "$75K · 62" are both `#13805b`; at world zoom
  Netflix's "$292K" (Warsaw, London …) is the palest pin, the same `#77c1a2` as Google's "$88K"; Anduril's
  range runs from $158K (palest) to $198K (darkest). The same pin changes colour on zoom ("Chicago, Ann Arbor
  and 11 more $169K": `#117b57` at one zoom, `#29946e` at the next). There is no Pay legend at all.
- Screenshots: `v-pay-colour-netflix-LosGatos.png`, `v-pay-colour-google-Warsaw.png`, `netflix-map-1440.png`.
- Owner: `public/viz/map.js` `drawMarkers()` (the `lo`/`hi` scale), `palette.js salaryColor()`; a fixed $ scale
  and a Pay legend in `renderJuiceLegend()`'s box.

### V-17 (High) Map: a pin's price can be the pay of one posting out of dozens, and the pill doesn't say so
- View: Map, Pay, world zoom. Repro: `#c=netflix&m=map`, hover "Warsaw, London and 6 more".
- Expected: a pin whose median rests on very few of its postings says how many ("$292K · 1 of 48 with pay"),
  or shows no price.
- Actual: the pill reads "$292K · 48", which reads as the median of 48 postings; the tooltip says "1 with salary
  for here" (one €220K–290K Rome/Amsterdam role). Same on Microsoft "Sao Paulo, Brasília and 7 more $122K"
  (1 of 25), Anduril "Abu Dhabi $171K" (1 of 16; and that one is a "US Salary Range" on a UAE-only posting that
  `payLocations()` falls back to, the VT-1 kind), "Taipei and Tokyo $158K" (1 of 3), NVIDIA "Yokneam, Bengaluru
  and 38 more $101K" (28 of 800).
- Screenshot: `v-netflix-pin-n1.png`. Owner: `map.js pinElement()`, `pinName()` (and `summarize()`'s
  `salaried`); the fallback is `public/features/shared.js payLocations()`.

### V-18 (High) Chart, Group by Location: a place's row shows a median of other countries' pay
- View: Chart, Clusters, Group by Location, no filter. Repro: `#c=google&g=location`, the London row;
  `#c=nvidia&g=location`, Germany.
- Expected: a row named for a place uses only pay posted for that place (as the map, the stats line and the
  filtered chart do since fix wave 3), else "no salary posted for here".
- Actual: "London · 101 roles · median $195K": its 6 salaried postings list US dollars (3) or euros (3) for
  other places, none for London. "Zurich · median $84K" is 4 euro ranges; NVIDIA "Germany $125K", "France
  $125K", "Munich $96K", "Berlin $106K", "Zurich $125K" are Warsaw PLN ranges (26 postings on 2 boards).
  Under a Location filter the same keying puts NVIDIA's one Munich-paid role in a row named "Italy" (fix3-viz
  §6 known gap).
- Screenshots: `v-google-location-london.png`, `v-nvidia-location-germany.png`,
  `loc-c_nvidia_l_Munich_g_location-chart.png`. Owner: `chart.js keyOf()` / `primaryLocation()` (rows by the first
  location) and `renderClusters()`.

### V-19 (High) Chart: part-time hourly pay is plotted as a full-time year without saying so
- View: Chart, Ranges (and every median). Repro: `#c=apple&v=ranges&q=Genius`, hover a "Part-time" row.
- Expected: shared decision 4 (app.js): `salary.min/max` are a full-time year, "so any yearly figure says so"
  ("a year if full-time").
- Actual: "US-Genius, Lake Grove, NY: $65K – $89K / A yearly figure worked out from hourly pay / … Part-time":
  the posted hourly rate × 2,080 hours. 52 Apple postings are part-time hourly.
- Screenshot: `v-apple-parttime-tooltip.png`. Owner: `chart.js showJobTip()` (and `optionName()`).

### V-20 (Medium) Chart, Ranges: two-level spans, merged multi-city spans and on-target earnings look like one posted base range
- View: Chart, Ranges. Repro: `#c=nvidia&v=ranges&q=Senior%20CPU%20Design%20Engineer`, hover.
- Expected: a bar that spans several levels or places, or is on-target earnings, is drawn differently and the
  legend says how.
- Actual: one plain bar $168K–$310K; the tooltip says nothing of "Level 4 $168,000–264,500, Level 5
  $196,000–310,500". 867 of NVIDIA's 1,396 plotted ranges (62%) and 164 of Microsoft's are two-level spans
  (`salary.levels`); their midpoints feed the Clusters bins and every median. Apple's 395 merged requisitions
  plot the span of two cities' ranges (DQ-28 is the data side). On-target earnings (Anthropic, main site, 46) are
  told apart only in the tooltip and the notes line. Estimates are never plotted (correct).
- Screenshot: `v-nvidia-two-level-tooltip.png`. Owner: `chart.js renderRanges()` / `buildRow()`,
  `showJobTip()`, `renderLegend()`.

### V-21 (Medium) Chart, Group by rows pool several countries' pay without saying so (levels out of order)
- View: Chart, Clusters, Group by Seniority (also Department; Insights "Pay by department" does the same).
- Repro: `#c=microsoft&g=seniority`; `#c=netflix&g=seniority`.
- Expected: either one country per row, as Compare companies, "Same role elsewhere" and Compstimate do since
  BP-3, or the row says it mixes countries.
- Actual: Microsoft "Entry · median $90K" sits below "Intern · $101K": the 29 salaried Entry roles are 14 USD,
  5 GBP, 4 EUR, 3 CZK, 1 each PLN, CAD, CHF (US-only median $127K vs Intern $122K). Netflix "Director+ $330K" sits
  far below "Senior $473K" (US-only $611K; 4 of 9 not US). The medians themselves match a hand calculation.
- Screenshots: `microsoft-seniority-1440.png`, `netflix-seniority-1440.png`. Owner: `chart.js
  renderClusters()` / `groups()` (row stats), `insights.js deptBoxes()`.

### V-22 (Medium) Chart and map marks are below 3:1 against their background
- Measured in Chromium, marks composited over the actual background (both themes):

  | Mark | Light | Dark |
  |---|---|---|
  | Clusters circles (Apple, 45 drawn) | 1.26–1.68:1 | 1.82–2.70:1 |
  | Ranges bars (NVIDIA, by department) | 1.50–2.52:1 | 2.28:1 |
  | Ranges midpoint dot | 2.44:1 | 3.22:1 |
  | Distribution strip bins | 1.45:1 | 2.58:1 |
  | Clusters median tick | 2.40:1 | 3.20:1 |
  | Map Pay pins, low end of the ramp | 2.02–2.94:1 | 2.22–2.96:1 |
  | Map Juice "Ripe" fill (ring is 7.06:1) | 1.46:1 | 1.68:1 |

  Text passes everywhere (axis ticks, notes and subtitles 5.95:1 light, 7.9:1 dark; counts on circles 11.7–14.5).
  A single-posting circle carries no count, so it is only the pale fill (`v-apple-pale-circles.png`).
- Owner: `public/viz/viz.css` (`--_bin-mix` 30%, `--_bar-o` .5, `--_hist-o` .42, `.ms-crow__median`
  opacity .38), `palette.js SEQ_LIGHT/SEQ_DARK`.

### V-23 (Medium) Dark mode: three companies are invisible in "Same role elsewhere"
- View: Drawer, "Same role elsewhere", dark. Repro: a Google Senior Software Engineer drawer in dark mode.
- Actual: Anduril (`#1f2a37`) bar 1.09:1, tick 1.13:1; Palantir (`#101113`) 1.12:1 / 1.15:1; Scale AI 2.03 /
  2.80. Close company colours as well: Shield AI `#1c6dd0` vs Google `#4285f4` ΔE 11; Anduril, xAI `#3b3b3b`
  and Palantir ΔE 12.9–14.5 with normal vision.
- Screenshot: `v-comps-dark.png`. Owner: `public/viz/comps.js` (row `--c` from `companies.json` colours, no dark
  variant) and `viz.css .ms-comps__bar/.ms-comps__median`.

### V-24 (Medium) Offline map: names of off-screen pins are drawn on the map with no pin
- View: Map, no basemap. Repro: `#c=google&m=map`, zoom in twice.
- Expected: a pin that is off the map has no name on it.
- Actual: 20 names float along the edges with their pins off screen ("Mountain View, Los Angeles and 23 more",
  "Chicago, Madison and 16 more" over the Atlantic; "Beijing, China" on the right); 25 at the next zoom, 34 when
  2 pins are on screen. `layoutLabels()` slides each name inside the map's edges whether or not its pin is
  there. Same root as D-31 (off-screen pins treated as on the map), a different symptom; skipping off-screen
  pins in `placeLabels()` should close both.
- Screenshots: `v-google-map-floating-names.png`, `google-map-pay-light.png`. Owner: `map.js placeLabels()`,
  `layoutLabels()`.

### V-25 (Medium) Category colours collapse for colour-blind readers
- View: Chart, Ranges legend (and Clusters rows, card dots). Repro: `#c=apple&v=ranges`, legend.
- Actual (Machado 2009 simulation, CIELAB ΔE): light slot 5 pink `#e87ba4` vs "Other" gray `#a8a69f` ΔE 1.9 for
  deuteranopia (Apple: "Operations and Supply Chain" vs "Other (4)"); slot 3 green vs slot 5 pink 12.9; slot 2
  orange vs slot 6 green 11.2 for protanopia. Dark: slot 1 blue `#3987e5` vs slot 7 purple `#9085e9` ΔE 2.5
  (protanopia) and only 20.7 with normal vision; slot 3 vs slot 5 4.7 (deuteranopia). The palette was checked
  for adjacent slots only.
- Screenshots: `v-apple-legend-normal.png`, `v-apple-legend-deuteranopia.png`, `v-apple-ranges-deuteranopia.png`.
  Owner: `palette.js CAT_LIGHT/CAT_DARK/OTHER_*`.

### V-26 (Medium) Map: 537 postings' cities are pinned at their state's or country's centre as if exact
- View: Map. Repro: `#c=google&m=map&l=Haskell` (with a basemap the pin sits in the middle of Texas).
- Expected: a place the gazetteer only knows by its region (`locationPrecision() === 'centroid'`) is pinned and
  named as approximate.
- Actual: "Haskell, TX" at (31.05, −97.56), 310 km from Haskell; "Vancouver, WA" at the Washington centre in the
  Cascades, 241 km from Vancouver; "Issy-les-Moulineaux, France" (a Paris suburb) at the centre of France. Per
  board: Google 192 postings, Apple 160, Microsoft 129, NVIDIA 28, Anduril 27, Netflix 1. 63 of 64 sampled
  city coordinates (Cupertino, Austin, Dublin, Zurich, Munich, Warsaw, Tel Aviv, Bengaluru, Hyderabad, Tokyo,
  Shanghai, Sydney, Toronto, Taipei, Singapore, local names such as "Tel Aviv-Yafo", "Bengaluru, KA, IN",
  "Yokne'am Illit") are within 4 km.
- Screenshot: `v-google-haskell-centroid.png`. Owner: `server/geo.js` (gazetteer) and `map.js aggregate()` /
  `pinName()` (no precision shown).

### V-27 (Medium) Axis tick labels round $1.25M to "$1.3M"
- View: Chart, Ranges. Repro: `#c=netflix&v=ranges`.
- Actual: ticks "$0 $250K $500K $750K $1M $1.3M"; the last gridline is $1,250,000, so a bar ending there reads
  $50K high. `formatMoney()` keeps one decimal of millions (1.25M → "1.3M", 1.75M → "1.8M", 1.15M → "1.1M").
- Screenshot: `v-netflix-axis-1-3M.png`. Owner: `chart.js renderAxis()` / `palette.js formatMoney()`.

### V-28 (Low) The Juice legend says "Gray: no Juice data", but those pins are white
- View: Map, Juice. Repro: `#c=google&m=map&mc=juice`.
- Actual: no-data pins are `rgb(255,255,255)` with a hairline (1.05:1 against the map), the same white as a
  "Dry" pin (which has a dashed ring). Screenshot: `google-map-juice-light.png`.
  Owner: `map.js renderJuiceLegend()`, `viz.css .ms-pin--nosalary`.

### V-29 (Low) Clusters: the edge bin reaches past the axis and sits on the "›" marker
- Repro: `#c=microsoft&g=location`, Mountain View row. "6 roles, $240K to $260K" is drawn at the $250K edge
  (it holds only midpoints up to $250K), on top of "›4" ("4 roles above $250K"): dot 981–990 px, chip
  988–1010 px. Screenshot: `v-microsoft-mv-circles.png`. Owner: `chart.js renderClusters()` (bins aligned to
  multiples of the bin width, not the domain).

### V-30 (Low) Juice drawer: two figures for the place shown
- Repro: `#c=microsoft&job=microsoft:1970393556995383`, Couple: "Juice left $57,500/yr" and, under Compare
  locations, "Reston, VA · best $57,400/yr"; Family $42,300 vs $42,200; also Redmond $60,800 vs $60,900 and
  Atlanta $63,300 vs $63,200 on other roles. The waterfall rounds each row and subtracts (P-18); the list rounds
  the net on its own. Screenshot: `v-reston-juice-rounding.png`. Owner: `public/app.js juiceBlock()`
  (`jc-net` should show the headline figure for the shown place).

### V-31 (Low) Apple: a department filter takes 177–346 ms from click to the last chart change
- Measured 3× per run at load 2–6: 264, 265, 346 ms; 177, 207, 239 ms; 261, 285, 345 ms. The chart's own draw
  (timed inside its idle callback) is 16–33 ms; the rest is the app's filtering and list (one 136–198 ms long
  task) and the idle wait before the chart draws. No test: it passes or fails with the machine's load.
  Owner: `public/app.js` (filter, list render, `scheduleViz()`).

### V-32 (Medium) The Juice waterfall's Tax, Rent and Living costs bars barely show
- View: Drawer, Juice breakdown. Tax, Rent and Living costs bars are 1.08:1 against their track in light mode,
  1.16:1 in dark, and the same colour as each other (Gross 2.23:1, Juice left 4.74:1). Screenshot:
  `v-waterfall-light.png`, `v-reston-juice-rounding.png`. Owner: `public/styles.css` `.wf--tax/.wf--rent/.wf--living
  .wf-bar` (lines 999–1000 override the amber rent bar of line 904).

## 4. What works (checked with numbers)

- **Bars:** 84 range bars (14 per board, across the whole list) match the posting's min and max to the pixel
  (USD and converted EUR, GBP, CAD, PLN; hourly × 2,080, monthly × 12). Axis caption "Yearly pay, US$
  (converted)"; tooltips say "A yearly figure worked out from hourly / monthly pay"; foreign pay shows the
  posted currency and "about $X – $Y in US dollars". BP-1 yearly-rate internships plot as a yearly rate.
- **Counts and medians:** Clusters rows add up to the result count and circles to the salaried count
  (Apple 4,875 / 2,818). Every department row on 6 boards and every seniority row match a hand calculation of
  base pay (0 mismatches); the caption equals the stats line on all 6 (Apple $214K, Google $183K, NVIDIA $239K,
  Microsoft $168K, Netflix $427K, Anduril $170K). Seniority rows follow the ladder, "Level not stated" last.
- **Long lists:** Apple Ranges (2,818 bars, 62,004 px) keeps 51–53 rows in the DOM (349 nodes); scrolling
  reaches row 2,817; End selects it and keeps it on screen, desktop and phone. No horizontal scroll at 390 px;
  the notes line wraps to 3–4 lines on phones.
- **Fix wave 3 (fix3-viz) holds:** Google Zurich "No pay posted for Zurich: 58 postings match; 10 list pay for
  another country only"; NVIDIA Munich "1 posting with pay for Munich · 12 … left out", $123K = the stats line;
  Apple Austin one pin of 645 = the list; Google Dublin one pin of 138; Dublin + London pins 138 + 125 for 252
  roles (11 list both, counted in each, as map.js says). Map refits on a Location change; area chips and Remote
  equal their pins (517, 61, 48, 116).
- **Map:** 63 of 64 sampled cities within 4 km (see V-26 for the exception); pins at world zoom count each
  posting once (Apple 4,875); the map keeps its size after a resize with the drawer open (702×728 → 638×596,
  8 of 8 pins inside). Juice grades read without colour (solid, tinted, dashed) and stay distinct under
  simulated deuteranopia and protanopia (`google-map-juice-light-deuteranopia.png`, `-protanopia.png`).
- **Drawer:** on 20 roles in 6 boards the waterfall adds up exactly, the headline equals "Juice left", Monthly ×
  12 matches Yearly within rounding, and the household switch moves score, rent, living costs and tax together.
  Rent and living costs match `cities.json` (San Jose rent $3,085.56 × 12 = $37,000; living cost index 89.6 →
  $17,900). The comps rows equal `compsForJob(market.json)` on all 20, and `market.json` equals
  `buildMarket()` re-run on the boards' data (407 home cells and 123 by-country cells identical).
- **Compstimate and Insights:** for 13 title-place pairs the estimate never falls with level (plateaus where a
  board states few levels, e.g. Apple Entry = Mid); other countries are never used (Google Zurich: no estimate);
  confidence is Low on 1–3 comparables. Insights department boxes and hot-location medians equal
  `deptBoxes()` / `hotLocations()` and hide samples under 5.
- **Drawing speed:** the chart draws in 16–57 ms (filter, Group by, Clusters → Ranges); map zooms add 58–101 ms
  of work after Leaflet's 250 ms animation.

## 5. Replayable steps

```sh
SP=<scratchpad>; V=$SP/viz-review-beta
node scripts/cycle/serve.mjs --dist $SP/cycle-beta5/dist --pid $V/serve.pid &   # port in the log line
# scratchpad scripts (import playwright by absolute path: ESM ignores NODE_PATH)
node $V/dump.mjs http://127.0.0.1:<port> $V/data         # the app's unpacked lists per board
node $V/chart1.mjs; node $V/ranges1.mjs; node $V/sen.mjs; node $V/locgroup.mjs     # chart numbers
node $V/geo.mjs; node $V/centroid2.mjs; node $V/map1.mjs; node $V/map2.mjs; node $V/map3.mjs   # map
node $V/mapcolor.mjs; node $V/contrast.mjs; node $V/colors.mjs; node $V/comps-contrast.mjs; node $V/wf.mjs
node $V/drawer.mjs; node $V/market-check.mjs; node $V/cstim.mjs; node $V/insights.mjs
node $V/perf.mjs; node $V/perf2.mjs; node $V/layout.mjs; node $V/long.mjs; node $V/locfilter.mjs
NODE_PATH=$SP/pw/node_modules BETA_QA_DIST=$SP/cycle-beta5/dist node scripts/e2e.js --grep='Beta viz review'
npm test
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/viz-review-beta
kill "$(cat $V/serve.pid)"
```

Colour-blind views use an SVG `feColorMatrix` filter on the map or chart host (Machado 2009 matrices); ΔE is
CIELAB 1976 on the simulated colours. Contrast is WCAG, marks composited with their opacity over the real
background.

## 6. Verification

- `test/e2e/beta-viz-review.e2e.js`: 16 tests; on the reviewed build 0/16 pass, 16 fail, each with its finding's
  numbers (run at load 3–6). V-31 has no test (load-dependent; it passed once and failed once at 200 ms).
- `npm test` (shared checkout, local data present): 1,015 tests, 937 pass, 0 fail, 78 to-do (the open data-check,
  vetting and review to-dos).
- Full e2e suite: not run, by the lead's note (three reviewers at once); the lead runs it.

## 7. Known gaps and follow-ups

- No basemap in the sandbox: pin placement was checked from coordinates and screen positions, not against
  tiles; V-26's offset is from the gazetteer's coordinates.
- OTE ranges exist only on the main site's Anthropic board; V-20's OTE part was read from the code and the
  notes line, not re-measured.
- Amazon and Meta are not in this build.
- V-17's Abu Dhabi pin and VT-1 (vetting) share `payLocations()`'s fallback to all locations.

## 8. Change log

- 2026-10-11: review on the lead's cycle-beta5 build; findings V-16 to V-32; 16 red tests; 76 screenshots.
