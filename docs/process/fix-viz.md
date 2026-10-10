# Process log: fix-viz (charts, map and freshness lane, target `stable`)

## 1. Brief

Prompt: [prompts/fix-viz.md](prompts/fix-viz.md) (verbatim). Fix the persona-review findings that live in
the chart, the map and the "as of" lines of the main site: P-3 (chart), P-6 (map), P-13, P-14, P-16
(chart.js), and the improvements I-3 (chart and map words) and I-10 (Juice grades). Sources:
`docs/process/persona-stable-*.md` and the consolidation in `docs/process/lead.md` ("Persona review of
the main site").

Files owned: `public/viz/chart.js`, `public/viz/map.js`, `public/viz/viz.css`, `public/viz/palette.js`
(unchanged), `public/features/freshness.js`, `public/features/features.css` (unchanged),
`scripts/methodology.js`, `scripts/methodology-figures.js`, `docs/METHODOLOGY_GUIDE.md`,
`docs/LIVABILITY.md` (rent dates only; shipped as a patch, see §3.9), and the new tests
`test/fix-viz.test.js` and `test/e2e/fix-viz.e2e.js` (registered in `scripts/e2e.js`).

Worktree: `/home/user/melon-seek/.claude/worktrees/agent-aa1faa5dc9a09f9c4`, from a9a46a7. Never pushed.

## 2. Inputs and sources

- `docs/CONTRACT.md` (chart and map interfaces: `createChart().update(jobs, opts)`, `createMap()`),
  `docs/strategy/ROADMAP.md` §8 (no new main-view controls, labels monochrome, no new palette colours),
  `docs/process/PLAYBOOK.md`, `docs/process/TEMPLATE.md`.
- The five persona reports' "Broken, fix now" and "Improve" lists and their screenshots
  (`docs/screenshots/persona-stable-*/p3-09-map-juice.png`, `p3-05-map-tap-us.png`, `p4-08-map-sydney.png`,
  `p1-03b-empty-overlap.png`, `p4-07-drawer.png`, `p3-12-map-juice.png`).
- Shared helpers already in the base commit: `payLocations(job)` (`public/features/shared.js`) and
  `levelLabel(level)` / `LEVEL_NOT_STATED` (`public/features/roles.js`). Imported, not edited.
- Data checked: `data/cities.json` rent sources (`rent1brCenterLocal` as of 2026-05…2026-10;
  `rent2brCenterLocal`/`rent3brCenterLocal` carry the bedroom ratio's date: 2025-10 for all 40 US cities
  (HUD FY2026), 2025-01…2026-10 elsewhere), `data/freshness.json` (stale entries on 2026-10-10:
  fx-per-usd, rents-1br-quoted, cost-index, several tax rules), `data/snapshots/*.json`.
- Other lanes' prompts (scratchpad `prompt-fix-app.md`, `prompt-fix-estimates.md`), to keep to my side:
  the app lane owns the stats line ("list pay", "middle 50%"), the Clusters/Ranges switch
  (`public/index.html`), the app's empty-state card and the Juice-left bar colour (P-18).

## 3. Decisions and rationale

1. **P-6 cluster label.** Root cause: `cluster()` in `map.js` merged every place within one pill's
   footprint of the biggest place (76×34 px) and always printed "<biggest> + N nearby"; at a phone's
   world zoom that box spans the US, so New York and Washington were "near" San Francisco.
   Merging is still needed (the pins would overlap), so the label changed, not the clustering:
   `clusterLabel(members)` says "+ N nearby" only when every member is within `NEAR_KM` = 150 km of the
   biggest place (a metro area: SF–San Jose 68 km, NYC–Princeton 70, DC–Baltimore 56, LA–Costa Mesa 60);
   otherwise it names the two biggest areas, "San Francisco, New York and 2 more" (or "Washington and
   Boston" for two). Only city places are named; a region or country-wide place ("United States") is
   counted in "more". The area chip and the list title use the same label, so tapping it is honest.
   Alternatives: split far places into separate pins (they overlap at world zoom), or name the
   region/continent (no continent data in the locations).
2. **P-6 pay at each pin.** Root cause: `summarize(jobs)` took every salaried job at a place, so a US
   contractor posting that also lists Sydney priced the Sydney pin ("Sydney · $61K · 55 roles", 50 of
   the 55 with no pay) and USD Fellows pay priced London and Ontario. Now `aggregate()` keeps, per place,
   the ids of jobs whose pay applies there (`payLocations`), `summarize(jobs, paid)` medians only those,
   and counts the rest as `elsewhere`. Every listed place still counts the role. The pin, tooltip and
   accessible name say "no salary posted for here" and "N list pay for another country only, so not in
   the median". Remote: pay counts when it covers a remote location (or the posting names none).
3. **P-6 overlapping names (offline).** Root cause: names under the pins are wider than the clustering
   box. `placeLabels()` reads every pin and name box once per draw, biggest cluster first, keeps a name
   below its pin when free, else moves it above (`.ms-pin__label--above`), else hides it (tooltip and
   accessible name keep it); a name near the left or right edge slides inward. Pins never move, so
   clustering and the pinch test are unchanged.
4. **P-6 legend on phones.** It was 380×158 px, 28% of a 390×541 map, and covered the zoom buttons.
   In the phone media query only: the three grades side by side (grade and score over the dollars), the
   "Gray: no Juice data" line dropped (the gray pin's tooltip says it), the as-of line on one line with
   its full text in `title`, and the box capped at 300 px: now 300×97 px, 14%. Desktop keeps rows, capped
   at 340 px so the longer as-of line wraps instead of widening the box.
5. **I-10 Juice grades.** Root cause: three steps of one red (`#ee9893 / #d9534f / #a51f35`) were the only
   difference between grades. No colour is added (ROADMAP §8); instead one melon hue (the Juicy step of
   `palette.js juiceColor`) and a fill pattern: Juicy pins solid, Ripe tinted with a solid ring, Dry an
   outline with a dashed ring, Rind dotted (`GRADE_FILL`, `data-fill`, `data-grade`). The legend swatches
   match and each grade keeps its dollar threshold ("under $48K left a year"). The card and drawer
   badges live in `public/styles.css` (app lane), so the same idea is a patch (§3.9). The Juice-left bar
   colour is the app lane's P-18.
6. **P-3 level.** `keyOf(job, 'seniority')` keeps the stored level as the key (so colours stay keyed the
   same way the app's filter dots are) and treats a missing level as `LEVEL_NOT_STATED`; `groupName()`
   shows it through `levelLabel` in row names, group heads, the legend and the tooltip.
   `SENIORITY_ORDER` puts it last (lead decision).
7. **P-16 chart text.** (a) With zero postings the chart stayed visible under the app's card, both
   messages blaming filters. The chart now says nothing when there are no postings (the host knows the
   cause and says it once); `update(jobs, { empty })` lets a host hand it the words. Postings that list
   no salary still get the chart's own "N postings match, but none list a salary range." (b) In Ranges
   the pay label went left of a bar that ran past the right edge, into the title column
   ("…Discove$350K–$850K"). `rowValPlacement()` measures the label and puts it right of the bar, else
   left of it if that stays in the plot, else on the bar on a surface chip (`.ms-row__val--in`).
8. **I-3 plain words, 12 px.** Axis: "Yearly pay, US$" / "Yearly pay, US$ (converted)" (phones: "US$ a
   year"), with a title explaining the conversion; notes line: "N with no salary posted", "N converted
   from another currency", "past the edge of the chart"; tooltips: "about $X – $Y in US
   dollars", "A yearly figure worked out from weekly pay"; map: "Colour pins by median Juice: the money
   left a year after tax, rent and living costs", legend "left a year". `freshness.js` says "exchange
   rates", not "FX". Every 10–11.5 px size in `viz.css` is now 12 px (bin counts, notes, overflow chips,
   pin counts and names, attribution, offline note, legend notes, comps ticks/counts/notes). "Clusters"
   and "Ranges" are in `public/index.html` and "list pay"/"middle 50%" in `app.js`: the app lane's.
9. **P-14 "(update due)".** Root cause: every as-of helper appended the registry's stale flag, and on the
   snapshot's day rents, living costs and FX are past due, so nearly every Juice line, comparison and the
   map legend said "(update due)". The helpers now give the date only; `status: true` adds the flag for
   maintenance pages (`asOfLabel`, `juiceAsOfText`, `juiceSpanText`, `marketAsOfText`,
   `compstimateAsOfText`; signatures kept, one option added). The methodology page's sources table shows
   the status in its "Refreshed" column ("Quarterly · update due"), from the registry's staleness at the
   build time (`MELON_BUILT_AT` pins it, same rule as `api/freshness.json`).
10. **P-13 rent dates.** Root cause: a 2- or 3-bedroom rent is the 1-bedroom rent × an official bedroom
    ratio, and its source date is the ratio's (HUD FY2026: October 2025), while `rentAsOf` counted only
    1-bedroom dates. Now: the hero says "1-bedroom rents May–October 2026" and "2- and 3-bedroom rents
    October 2025 in US cities" (method sentence in its title); the sources table gives "October 2025 in US
    cities; January 2025–October 2026 elsewhere"; the guide's Rent bullet says they carry two dates and
    which; new values `rent.bedrooms.us`, `rent.bedrooms.other`, `rent.dates`, `rent.method`. The drawer's
    line reads "rent Sep 2026 (sized for 2 bedrooms with Oct 2025 figures)". The 1-bedroom date of an
    estimated rent is not in the juice inputs, so `server/juice.js` needs a one-field patch (§3.9); without
    it the line says "rent sized for 2 bedrooms with Oct 2025 figures", never "rent Oct 2025".
11. **Patches for files I don't own** (`docs/process/patches/`, apply in this order; each applies cleanly
    to a9a46a7 plus this lane's commit):
    - `fix-viz-juice-rent-base.diff` (`server/juice.js`, pay-data lane): `inputs.rent.base = { asOf }`, the
      1-bedroom rent's date, on an estimated city-centre 2- or 3-bedroom rent. Date only, to keep the
      payload small (about 5,000 jobs carry `inputs` on `best`).
    - `fix-viz-examples-rent-dates.diff` (`scripts/refresh/examples.js` and the regenerated block of
      `docs/LIVABILITY.md`): the technical reference's household table said "rent 2025-10 to 2026-10";
      now "rent 2026-06 to 2026-09 (2- and 3-bedroom ratios 2025-10 to 2026-10)". The two files must land
      together (`test/refresh-derived.test.js` checks the block matches the generator), so neither is in
      my commit.
    - `fix-viz-d9-level-not-stated.diff` (`test/e2e/desktop-qa.e2e.js`): D-9's ladder had 'Mid' in the
      middle; P-3 makes it "Level not stated", last.
    - `fix-viz-juice-badges.diff` (`public/styles.css`, app lane): I-10 for the card and drawer badges,
      one melon hue, Juicy a tint with a solid ring, Ripe a solid ring, Dry dashed, Rind dotted, drawn as
      outlines so badge sizes do not change. (A solid Juicy badge was tried first and was louder than the
      green pay pill, so it was dropped.)
12. **Existing tests changed** (`test/refresh-derived.test.js`, the freshness.js assertions only): the
    default is now no "update due" and "exchange rates"; the old due-marker assertions pass `status: true`.

## 4. Replayable steps

```sh
cd <worktree>
ln -s /home/user/melon-seek/node_modules node_modules
mkdir -p data && ln -s /home/user/melon-seek/data/snapshots data/snapshots
SP=<scratchpad>/fix-viz
# before: build and serve the base commit
node scripts/build-static.js --out $SP/dist-before
node scripts/cycle/serve.mjs --dist $SP/dist-before --pid $SP/serve-before.pid &
NODE_PATH=<scratchpad>/pw/node_modules node $SP/shots.mjs http://127.0.0.1:<port>/melon-seek/ $SP/shots before
# red tests first
node --test test/fix-viz.test.js                                  # 9 red (missing exports)
NODE_PATH=<scratchpad>/pw/node_modules node scripts/e2e.js --grep='Fix viz'   # 11/11 red
# fix, then
node --test test/fix-viz.test.js test/methodology.test.js test/refresh-derived.test.js
npm test
npm run build && node scripts/cycle/serve.mjs --dist dist --pid $SP/serve.pid &
NODE_PATH=<scratchpad>/pw/node_modules node $SP/shots.mjs http://127.0.0.1:<port>/melon-seek/ $SP/shots after
NODE_PATH=<scratchpad>/pw/node_modules node scripts/e2e.js       # full suite
# patches: written with the change applied, then `git diff <file> > docs/process/patches/<name>.diff`
# and `git checkout <file>`; `git apply --check` each one on the lane's tree.
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-viz
```

`shots.mjs` (scratchpad) opens each repro with tiles blocked (the sandbox has none) at 390×844 (DPR 2) and
1440×900 and writes the pins' accessible names, the legend size and the as-of lines to a notes JSON.

## 5. Verification

- `npm test`: 610 tests, 608 pass, 2 fail, neither from this lane: `cycle.test.js` "local beta data is
  gitignored" (the worktree's `data/snapshots` symlink, see §6) and `refresh-tax.test.js` "LLM second
  opinion is advisory", which failed once under the parallel run and passes alone and as a file
  (26/26), i.e. load-dependent.
- Full e2e (`NODE_PATH=… node scripts/e2e.js`, committed state, no patches): 111/115 passed, 2 failed,
  2 skipped. Failures: "API: /api/jobs?company=anduril returns valid Job[]" (a 20.4M–30.7M salary in the
  data; fails the same way on the base commit, checked with `--api-only` on an export of a9a46a7) and
  "[D-9] Clusters grouped by Seniority follow the seniority ladder" (expected: its ladder has 'Mid' in
  the middle; `fix-viz-d9-level-not-stated.diff` updates it). Timing tests (PERF-1, V15, T21) passed.
- With the four patches applied: the six related unit files 86/86, and 31/31 e2e (`--grep='Fix
  viz|D-9|Juice badge|map mode|drawer'`, D-9 included).

- Unit: `test/fix-viz.test.js` 9 tests (pay per place, remote pay, cluster labels, level label and
  order, pay-label placement, as-of without status, 2-bedroom dates, methodology dates, sources status).
- e2e: `test/e2e/fix-viz.e2e.js` 11 tests, red before (each reproduced the finding), green after.
- Before/after notes (`shots.mjs`): Anthropic "account executive" phone map: "San Francisco, CA + 3
  nearby (24)" with 15 New York/DC roles → "San Francisco, New York and 2 more (24)"; Anduril Sydney
  "median $61K" → "no salary posted for here"; Fellows London and Ontario "$200K" → no pay for there;
  phone Juice legend 28% → 14% of the map; Ranges pay over the title (overlap: true) → false; drawer
  "rent Sep 2026 (update due) · living costs Sep 2026 (update due) · FX Jul 2026 (update due)" →
  "rent Sep 2026 · living costs Sep 2026 · exchange rates Jul 2026"; methodology hero "Rents as of
  May–October 2026" → "1-bedroom rents May–October 2026 / 2- and 3-bedroom rents October 2025 in US
  cities".
- Screenshots (`docs/screenshots/fix-viz/`, shrunk 10.2 MB → 2.6 MB): `before-*.png` (base build) and
  `after-*.png` (this commit) at 1440×900 and 390×844; `after-beta-*.png` (the `/melon-seek/beta/` build:
  same results); `after-patches-*.png` with the patches applied (card and drawer badges, the drawer's
  2-bedroom rent line). No regressions seen on desktop or phone (chart default, Ranges, dark map).

## 6. Known gaps and follow-ups

- The app lane's side: the stats line ("list pay", "middle 50%"), the Clusters/Ranges labels, the app's
  empty-state card text, cards' "Mid" badges and the Juice-left bar colour (P-18).
- `cycle.test.js` "local beta data is gitignored" fails in this worktree because `data/snapshots` is a
  symlink (git: "pathspec is beyond a symbolic link"); an environment artifact, not a code change.
- Anduril has "Alexandria, Australia" geocoded to the Australian centroid, which shows up as a named
  area in a Sydney cluster ("Sydney, Alexandria and 3 more"); `server/geo.js` (other lane).
- The map's as-of line for Couple/Family spans every bedroom ratio of the jobs shown (for example
  "Jan 2025–Oct 2026"); it is correct but long. A per-country breakdown would need more room.
- The 150 km "nearby" radius is a judgement call; it is one constant (`NEAR_KM`).

## 7. Change log

- 2026-10-10: red tests (9 unit, 11 e2e), fixes for P-3, P-6, P-13, P-14, P-16, I-3, I-10, four patches,
  screenshots, this log.
