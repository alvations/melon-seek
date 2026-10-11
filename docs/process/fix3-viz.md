# Process log: fix3-viz (chart and map lane, fix wave 3, target `beta` and the main site)

## 1. Brief

Prompt: [prompts/fix3-viz.md](prompts/fix3-viz.md) (verbatim). Fix the beta persona review's findings that
live in the chart and the map: BP-2 (chart side: under a Location filter the chart plotted pay that isn't
for the filtered place), BP-13 (chart side: the chart's median included on-target earnings, the stats
line's didn't) and the map's pin names (pins with no place name, and co-listed cities pinned under a
Location filter). Both builds share the code, so every fix applies to `/melon-seek/` and
`/melon-seek/beta/`.

Files owned: `public/viz/chart.js`, `public/viz/map.js`, `public/viz/viz.css`, and the new tests
`test/fix3-viz.test.js` and `test/e2e/fix3-viz.e2e.js` (registered in `scripts/e2e.js`). `public/app.js`
(app lane) and `docs/CONTRACT.md` (shared) change only through patches (§3.8).

Worktree: `/home/user/melon-seek/.claude/worktrees/agent-af4177b7c583f3bb2`, from 790fa13. Never pushed.

## 2. Inputs and sources

- `docs/CONTRACT.md` (the chart and map interfaces; v4 `salary.kind: 'ote'`: "leave it out of base-pay
  medians"), `docs/strategy/ROADMAP.md` §8 (no new main-view control, monochrome labels, no new
  colours), `docs/process/PLAYBOOK.md`, `docs/process/TEMPLATE.md`.
- `docs/process/lead.md` "Beta, stage 1c" (BP-1 to BP-17) and the five reviews
  `docs/process/persona-beta-*.md`, with their screenshots:
  - BP-2: persona-beta-18-24 BF-1 and P4 step 2 (`p4-01-google-rs-zurich.png`), persona-beta-25-34 B5
    (`p4-hana-05-google-zurich-research.png`: "0% show pay for Zurich" beside "Median $122K / DeepMind
    median $227K"), persona-beta-55-plus B3 (`p4-04-results.png`: NVIDIA, Munich, "13 postings with
    salary", 12 of them PLN).
  - BP-13: persona-beta-35-44 #16 (`p2-01-cold-desktop.png`: "$347K median" and "Median $352K"),
    persona-beta-45-54 #6, persona-beta-55-plus.
  - Pin names: persona-beta-45-54 #10 (`p3-16-apple-map-phone.png`: "1.117 jobs" and "2 jobs" with no
    place, de-DE), persona-beta-25-34 I16 (`p3-maya-12-map-juice-columbus.png`: the Columbus pin
    unnamed), persona-beta-35-44 #15 (`p3-09-map-austin.png`: "Cupertino, Culver City and 2 more · 16"
    beside "Austin · 16"), persona-beta-45-54 step 15 (`p1-22-map-dublin.png`: a "Mountain View, New
    York and 3 more" pin under a Dublin filter).
- Shared helpers in the base commit, imported and not edited: `payLocations(job)` and `OTE_LABEL`
  (`public/features/shared.js`), `shortCount` (chart.js, M-23).
- `public/app.js` (read only): `stats()` (the stats line: base pay, on-target earnings only when nothing
  else is left, pay counted only when `locMatches(j, F, payLocations(j))`), `locMatches`, `coverLoc` and
  `coveredBy` (I-6: a city pick also finds roles that list only its country or state), `renderViz`.
- The app lane's prompt (scratchpad `prompt-fix3-app.md`) for the shared BP-13 rule: exclude
  `kind === 'ote'` from base-pay medians and say "base pay".
- Data: the beta build (`dist/beta/`, 22:00 beta crawl of 2026-10-10) and `data/snapshots/` (Anthropic: 46
  on-target ranges, all in Sales; no other board has any).

## 3. Decisions and rationale

1. **BP-2 chart: plot only pay posted for the filtered places.** Root cause: `prepare()` in chart.js
   plotted every posted range of the filtered list; it had no notion of the Location filter, while the
   stats line counted pay only where `payLocations` covers a picked place. Fix: a pure
   `chartPay(jobs, { places, placeTest })` (chart.js:144) plots a posting only when one of its
   `payLocations` passes the filter test, and returns `elsewhere` (the salaried postings left out) and
   their ids. `prepare()` (chart.js:315) uses it. `places` is the filter's keys (app.js `S.l`, the same
   shape Insights already takes); `placeTest(job, location)` is the app's own `locMatches`, so its
   disambiguated keys ("Cambridge, MA") and country-wide postings count exactly as in the list and the
   stats line. Without `placeTest` a location matches by its key or name (`placeMatcher`, chart.js:123).
   - Words (chart.js:449): the notes line reads "1 posting with pay for Munich · 12 with pay for another
     country only, left out", and with nothing left the chart says "No pay posted for Zurich / 58
     postings match; 10 list pay for another country only, so the chart leaves them out." (chart.js:418).
     A row whose ranges are all for another country reads "no salary posted for here", the map's words.
   - Alternative considered: reading the filter from `location.hash` inside the chart. Rejected: it ties
     the chart to the app's hash format and repeats `locMatches`.
2. **BP-13 chart: base-pay medians.** Root cause: `renderHist` took `median()` of every plotted midpoint,
   and the rows and groups did the same, on-target earnings included. Fix: `basePayStats(items)`
   (chart.js:171) is the stats line's rule: medians and quartiles of the ranges that are not
   `salary.kind: 'ote'`, and of the on-target ones only when nothing else is left (`oteOnly`). It drives
   the caption, every Clusters row (median, quartile band, median tick; chart.js:566) and every Ranges
   group (chart.js:960). The caption says "Median base pay $347K" (or "Median on-target earnings" when
   that is all), the notes line "46 with on-target earnings (base plus commission), not in the medians"
   (phones: "46 on-target earnings, not in the medians", so the line stays two lines), and a Ranges
   tooltip on an on-target range says `OTE_LABEL` "…, not in the medians" (chart.js:1151). On-target
   ranges stay plotted: hiding them would hide postings. Anthropic: "$347K median" and "Median base pay
   $347K"; Sales median $327K -> $287K.
3. **Map: only the filtered places.** Root cause: `aggregate()` pinned every location of every filtered
   role, so a role listing Austin and Cupertino pinned both. Fix: `aggregate(jobs, { places, placeTest })`
   (map.js:125) skips the locations the filter leaves out and marks the role (`also`); the tooltip says
   "327 of these are also listed in other places, not shown with this location filter". The Remote
   button holds only roles whose remote location is a filtered place.
4. **Map: country- and state-wide roles count at the filtered city.** The app's filter also finds roles
   that list only "United States" or "Ohio, US" (I-6). Pinned where they are, they became a "United
   States · 24" pin in Kansas next to "Austin · 622", the same confusion as the co-listed cities. Now such
   a location counts at the filtered cities it covers (same country, and same state when it names one),
   and the tooltip says "24 list only a country or state, not a city". It keeps its own pin only when the
   filter names it, or covers no pinned city. Austin: one pin, "Austin, TX · 646", the list's 646;
   Columbus: one pin of 15, the list's 15. US pay on a US-wide role counts at Austin, as in the stats line.
5. **Map refits when the filtered places change** (map.js:896): the viewport otherwise stays on a world
   view with one small pin, or on a city the filter no longer shows. Company changes refit as before.
6. **Every pin keeps its name** (offline, when place names show under the pins). Root cause:
   `placeLabels` hid a name when below and above both collided ("1.117 jobs", "2 jobs", the Columbus
   pin). Fix: `layoutLabels(items, host)` (map.js:253), pure, tries below, above, the short form
   (`shortLabel`, map.js:235: "Shanghai and 52 more", "Columbus", "Mountain View + 1 nearby"; never
   "nearby" for far places) below and above, then beside the pin (right, left; full, then short; viz.css
   `.ms-pin__label--right/--left`). When nothing fits, `draw()` (map.js:702) merges that pin into its
   nearest pin on screen (`mergeInto`, map.js:725) and draws again, at most `MERGE_PASSES` (6) times;
   the merged pin's name counts it ("Cupertino, Austin and 119 more"). Summaries of unchanged clusters
   are reused across passes. Online (basemap tiles load) names are not shown, so nothing changes there.
   - Alternative considered: show names inside the pills. Rejected: wider pills cluster more and the
     pin's price would compete with the name.
7. **No-pay pins count like the others**: "1.1K jobs", not "1.117 jobs" (de-DE) or "1,117 jobs"
   (`jobsText`, map.js:98), the "4.5K" rule of M-23. The exact count stays in the accessible name.
8. **Patches for files this lane doesn't own** (`docs/process/patches/`, each applies to 790fa13 plus
   this lane's commits):
   - `fix3-viz-app-places.diff` (`public/app.js`, app lane): `renderViz` passes `places: S.l` and
     `placeTest: (j, l) => locMatches(j, viewSpec, [l])` to `chart.update` and `map.update`, and adds
     `S.l` to the viz signature (two filters can give the same roles but different places). Needed for
     BP-2 and the map's filtered places: the chart and map cannot know the filter otherwise. Without it
     both behave as before, apart from the base-pay medians and the pin names.
   - `fix3-viz-contract.diff` (`docs/CONTRACT.md`): a "Fix wave 3 additions" section for the new
     options and exports.
9. **UI budget.** No new control, colour or mode. New words only in existing places: the median
   caption, the notes line, the chart's empty message, row subtitles and the map tooltip.

## 4. Replayable steps

```sh
cd <worktree>
ln -s /home/user/melon-seek/node_modules node_modules
mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots
SP=<scratchpad>/fix3-viz
# before: build and serve the base commit
node scripts/build-static.js --out $SP/dist-before
PORT=5341 node scripts/cycle/serve.mjs --dist $SP/dist-before --pid $SP/serve-before.pid &
NODE_PATH=<scratchpad>/pw/node_modules node $SP/probe.mjs http://127.0.0.1:5341/melon-seek/beta/ $SP/shots before
# red tests first (dist -> the base build)
node --test test/fix3-viz.test.js                                       # red: missing exports
NODE_PATH=<scratchpad>/pw/node_modules node scripts/e2e.js --grep='Fix viz 3'   # 0/6 passed
# fix; the app patch is applied in the worktree only to verify, never committed:
git apply docs/process/patches/fix3-viz-app-places.diff
MELON_BETA_SNAPSHOT_DIR=$SP/empty-beta npm test
npm run build
NODE_PATH=<scratchpad>/pw/node_modules node scripts/e2e.js            # full suite
PORT=5343 node scripts/cycle/serve.mjs --dist dist --pid $SP/serve-after.pid &
NODE_PATH=<scratchpad>/pw/node_modules node $SP/probe.mjs http://127.0.0.1:5343/melon-seek/beta/ $SP/shots after
git checkout public/app.js
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix3-viz
```

`probe.mjs` (scratchpad) opens each repro with outside hosts blocked (the sandbox has no tiles) at
1440×900 and 390×844 (DPR 2, one case in de-DE), and writes the stats line, the chart's caption, notes,
empty message and rows, and every pin's accessible name, pill text and shown name to a notes JSON.
`perf.mjs` measures long tasks over four zooms of Apple's phone map at 4× CPU.

## 5. Verification

- Red first, on the base build: `node --test test/fix3-viz.test.js` failed (missing exports); `--grep='Fix
  viz 3'` 0/6 passed, each failure the finding itself: Zurich "expected 0, got 10" plotted; NVIDIA Munich
  "expected 1, got 13"; Anthropic "the stats line says $347K median, the chart Median $352K"; Apple
  Austin 6 pins outside the filter; Google Dublin 4 co-listed pins; Apple phone (de-DE) "2 jobs" and
  "1.117 jobs" with no name.
- Unit: `test/fix3-viz.test.js` 7 tests (pay per filtered place, the host's place test, base-pay medians,
  filtered pins and the Remote bucket, country-wide roles at the filtered city, label spots, "1.1K
  jobs"). `npm test` with `MELON_BETA_SNAPSHOT_DIR` an empty folder (as CI): 772/772, with the app patch
  applied and without it. `test/fix-viz.test.js` and `test/fix-beta-platform.test.js` unchanged and green.
- Full e2e after `npm run build`, with `fix3-viz-app-places.diff` applied (the integrated state):
  198/201 passed, 0 failed, 3 skipped (the same three as the lead's last run, 192/195: D-11 "this data
  has listing dates", the methodology screenshots, Fix app P-2 "no estimate for this role"). The 6 new
  checks pass; the timing test Compstimate T21 passed in both runs (no check named PERF-1 or V15 is in
  the suite today).
- Full e2e on the committed state alone (no app patch, `npm run build` again): 194/201 passed, 4 failed,
  3 skipped. The 4 failures are exactly the Location-filter checks that need the patch (BP-2 Zurich and
  NVIDIA Munich, Apple Austin and Google Dublin pins); BP-13 and the pin-name check pass without it.
  Nothing else failed.
- Before/after notes (`probe.mjs`, `docs/screenshots/fix3-viz/before-notes.json`, `after-notes.json`):

  | Repro | Before | After |
  |---|---|---|
  | Google, Zurich (beta) | stats "0% show pay for Zurich"; chart "Median $160K", "10 postings with salary", DeepMind "median $227K" | "No pay posted for Zurich: 58 postings match; 10 list pay for another country only, so the chart leaves them out." |
  | NVIDIA, Munich, Senior/Staff+, €110K+ (beta) | stats "8% … $123K median"; chart "13 postings with salary", "Median $125K" | "1 posting with pay for Munich · 12 with pay for another country only, left out", "Median base pay $123K"; the other rows "no salary posted for here" |
  | Anthropic (both sites) | "$347K median" and "Median $352K" | "$347K median" and "Median base pay $347K"; "46 with on-target earnings (base plus commission), not in the medians"; Sales row $327K -> $287K |
  | Anthropic, "account executive" | "Median $411K" | "Median on-target earnings $411K", as the stats line |
  | Anthropic, London (main) | "45 postings with salary", median $391K | "39 postings with pay for London · 6 with pay for another country only, left out · 5 with on-target earnings…", median $391K (the stats line's) |
  | Anduril, Sydney (main) | chart "Median $61K" from US pay; map pins Abu Dhabi, "Boston, Costa Mesa and 5 more $61K", "Sydney, Melbourne and 2 more" | chart "No pay posted for Sydney"; one pin "Sydney, Australia · 56", tooltip "13 of these are also listed in other places…" |
  | Apple, Austin (beta map) | 7 pins: "Cupertino, San Diego and 8 more · 314", "Beaverton and Seattle · 58", … beside "Austin, TX · 622" | one pin "Austin, TX · 646 · $224K" (the list's 646, the stats line's median); tooltip counts 327 also listed elsewhere and 24 that list only a country or state |
  | Google, Dublin (beta map) | "Dublin, London and 9 more · 137", "Warsaw, Madrid and 1 more", "Mountain View, Los Angeles and 1 more" (the last two unnamed) | one pin "Dublin, Ireland · 137" |
  | Google, Columbus, Juice (beta phone) | "Moncks Corner, Columbus and 27 more · 15" unnamed, plus Seattle, Sunnyvale, New York pins, "Remote 10" | one pin "Columbus, OH · 15", named |
  | Apple, world (beta phone, de-DE) | "1.117 jobs" and "2 jobs" with no name | "1.1K jobs" named "Shanghai and 52 more"; the two Chilean roles merged into "Cupertino, Austin and 119 more" |
  | Google and Microsoft, world (beta phone) | "Bengaluru, Singapore and 78 more" / "Bengaluru, Tokyo and 109 more" unnamed | "Bengaluru and 79 more" / "Bengaluru and 110 more" |
  | Anthropic and Anduril maps, no filter (main phone); Apple, world (desktop) | | unchanged |

- Screenshots (`docs/screenshots/fix3-viz/`, shrunk 13.1 MB -> 3.3 MB): `before-*.png` (base build) and
  `after-*.png` (this lane plus the app patch) for every row above, at 1440×900 and 390×844, one in dark
  mode. No regressions seen on desktop or phone: the default chart, Ranges, the unfiltered maps and the
  phone notes line (two lines, as before).
- Performance (offline look only; Apple's phone map, four zooms at 4× CPU). `perf.mjs` long tasks totalled
  496–681 ms before and 683–912 ms after (largest 122–188 ms before, 274–357 ms after). `perf2.mjs`, with
  per-pass timings (cluster, markers, names in ms): before 93, 143, 111 and 93 ms per zoom; after 66, 212,
  84 and 185 ms. The two slower zooms each merged one pin, and the second pass re-summarizes the pin it
  grew (12 and 61 ms). With basemap tiles the names are hidden and no pass runs.

## 6. Known gaps and follow-ups

- Cards, the pay filter, the pay sort, the stats line and Juice under a Location filter are the app and
  data lanes' side of BP-2 (the cards still show PLN ranges under Munich in the screenshots).
- Group by Location still names a row by the role's first place, so under a Zurich filter a row can be
  "Mountain View" (with "no salary posted for here"). Grouping by the filtered place would change the
  key app.js colours card dots by (`keyOf`), so it needs both lanes.
- A merge pass re-summarizes the pin it grew; on Apple's phone world view (4× CPU) the draw after a zoom
  takes 70 to 90 ms more when a pin is merged (§5). Only offline: with basemap tiles names are hidden and
  no pass runs. If it matters, estimate the pills' widths with canvas and merge before summarizing.
- At a world zoom on a phone a small far pin can merge into a big one ("La Serena and Santiago" into
  "Cupertino, Austin and 119 more"); zooming in splits it again.

## 7. Change log

- 2026-10-11: red tests (7 unit, 6 e2e), fixes for BP-2 (chart), BP-13 (chart) and the map's pin names,
  two patches (app.js, CONTRACT.md), before/after screenshots.
