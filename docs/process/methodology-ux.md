# Process log: methodology-ux (UI/UX engineer, methodology page)

## 1. Brief

Prompt: [docs/process/prompts/methodology-ux.md](prompts/methodology-ux.md).

The user found `methodology/#1-the-formula` a wall of text. `methodology/` is now a designed,
human-readable guide (the copywriter's `docs/METHODOLOGY_GUIDE.md`) with infographics computed
at build time from the live code and data. `methodology/reference/` is `docs/LIVABILITY.md`,
rendered as before, for agents and for detail. Every old anchor still lands.

Files owned and changed:
- `scripts/md.js`: comments, `{#id}`, placeholders, GitHub alerts, `blocks` output.
- `scripts/methodology.js`: guide and reference renderers, `methodologyPages`, `METHODOLOGY_CSS`.
- `scripts/methodology-figures.js` (new): the eight figures and all `{{value:…}}`s.
- The methodology routes in `server/index.js`.
- The methodology wiring and header comment in `scripts/build-static.js`.
- `scripts/links-policy.js`: rule 4, `checkMethodology`.
- Tests: `test/md.test.js` (extended), `test/methodology.test.js` (new), `test/e2e/methodology.e2e.js` (new, registered in `scripts/e2e.js`).
- `docs/screenshots/methodology/`.

## 2. Inputs and sources

- `docs/strategy/ROADMAP.md` §8 (simplicity budget). It sets "no new palette colours" and
  monochrome labels. The guide reuses the site tokens. The only new values are three dark-mode
  steps for the tax-split slots (decision 6).
- `docs/CONTRACT.md`. The beta copy (`dist/beta/`) gets the methodology pages too, through the same
  `buildSite` step.
- `scripts/methodology.js` and `scripts/md.js` as they were: one page, from LIVABILITY.md.
- `docs/process/TEMPLATE.md`.
- `docs/process/prompts/methodology-copy.md`, the copywriter's contract: the placeholders, the
  anchors and the `<!-- description: … -->` comment.
- `docs/process/methodology-copy.md`, the copywriter's "Values requested" list.
- `docs/METHODOLOGY_GUIDE.md`, the guide. It appeared during the work, so no stub was needed in
  the repo. `test/methodology.test.js` builds a stub with every placeholder from `FIGURES` and
  `VALUES`.
- `docs/process/patches/freshness-derived-md-comments.diff`: the md.js comment patch and test
  from the freshness agent, folded in here.
- `scripts/refresh/derived.js#methodologyPage`, which uses `renderReferencePage({ md })` when it
  exists. The renderer keeps the bare `<table>` tags it counts.
- `server/juice.js`: computeJuice, `scoreFromNet` / `netForScore`, GRADES / RIND, HOUSEHOLDS,
  `livingScaleFor`, LIVING_SCALE, TAX_SOURCES, FX_AS_OF and SCORE_ANCHORS.
- `data/cities.json`: cities, sources and as-of dates, `bedroomRatios`, `baseline` and `fx`.
- `data/freshness.json` (the freshness agent, untracked): refresh cadence per dataset.
- `public/styles.css`. This supplied the `--ms-*` tokens, the juice ramp
  `--ms-juice-dry/ripe/juicy` (DES-5) and the drawer waterfall colours (DES-8). It also has a
  global `svg:not(…)` icon rule that sizes every bare `<svg>` at 18 px; see decision 4.
- The `dataviz` skill (loaded before designing). It set the form choices, mark specs and
  anti-patterns. Its `scripts/validate_palette.js` was run on every palette.

## 3. Decisions and rationale

1. **Two pages, one renderer module.** `renderGuidePage` and `renderReferencePage` share the head,
   site bar and CSS file. `methodologyPages({ root })` reads the repo once, for the build and the
   server.
   - Without a guide file, `methodology/` falls back to the reference at depth 1, with a build
     warning, so the drawer link never breaks.
   - A guide error fails the build: an unknown placeholder, or no `#1-the-formula`
     (`REQUIRED_GUIDE_IDS`).
2. **Placeholders live in md.js** (`opts.figure` and `opts.value`), active only for the guide.
   - Values are substituted line by line, so they work in headings, tables and lists.
   - Any `{{` left over throws `MD_PLACEHOLDER`. So does a figure inside a paragraph, or a value
     that contains Markdown syntax.
   - The reference page has no callbacks, so LIVABILITY.md renders byte-identically to the old
     md.js (checked against every file in `docs/*.md`).
3. **Anchors: no old link breaks.** For every heading id in LIVABILITY.md, the guide has one of:
   - the same id on its own heading (`1-the-formula`, `3-tax-model`, `5-limitations`);
   - an **alias anchor** at the top of the guide section that links to `reference/#<id>`.
     These come from the copywriter's "More detail" links, with no hand-kept map. For example,
     `#score-curve-and-grades` goes to §2;
   - an `id` on that heading's entry in the "Every section of the technical reference" index in
     §9, which links on to `reference/#<id>`.

   `scripts/links-policy.js` rule 4 (`checkMethodology`) fails the build if any reference heading
   id is missing on `methodology/`. The existing rule 3 checks every `reference/#…` link.
4. **Charts are SVG with no viewBox.**
   - x positions are percentages, y positions and text are pixels. A chart reflows from 360 px
     to desktop without shrinking its labels: text is 12.5 to 14 px at every width, and an e2e
     check fails if any figure text is under 12 px.
   - The curve is a nested SVG with a stretched viewBox and a `non-scaling-stroke`.
   - Every SVG has an inline `style="height:…"` or `width:100%`. `public/styles.css` sizes
     every bare `svg` at 18 px, and this first hid the score curve as a stub.
   - No `<style>` element (the CSP and the build's inline-hazard check). All colour comes from
     classes in `methodology.css`.
5. **Forms (dataviz skill).**
   - The worked example is a horizontal waterfall. Each row has its label above the bar, the
     amount and share at the right, and step connectors.
   - The formula is a five-step flow on wide figures (container query ≥ 700 px). On phones it
     becomes a receipt: one line per term with − and = markers.
   - Households are three cards: people and bed glyphs, rent, living costs × scale, tax, Juice
     left with its grade chip, and a part-to-whole bar.
   - The score curve shows the grade bands as washes, labelled with their ranges. Dots mark
     where Ripe and Juicy start. The worked example is in the legend, not on the plot, so its
     label can never collide as the data moves. A short tick marks "100 needs $…".
   - Grades are a 0–100 ruler plus a list.
   - The tax split is a stacked bar for six cities on the same salary: San Francisco, Austin,
     London, Berlin, Zurich and Singapore. These are six different tax systems. Bars are sorted
     by total and labelled with the total and the share of pay.
   - Sources is a table. Under 600 px it becomes stacked cards with `data-label` captions, so it
     never scrolls sideways.
   - Confidence is three cards with a three-step monochrome meter and today's city counts.
   - No JavaScript. Hover tooltips are native SVG `<title>` children. Every chart has a
     "Show the numbers" table.
6. **Colour.** Each colour is validated with `validate_palette.js`:
   - Grades use the site's juice ramp (`--ms-juice-dry/ripe/juicy`), which is ordinal. Ordinal
     checks pass in light (white surface) and dark (`#161a21` surface).
   - Costs use one neutral, gross is muted, and Juice left is `--ms-juice-juicy`, as the drawer
     does (DES-8).
   - Tax split, light: `--ms-blue #2563eb`, `--ms-amber #9a5b00`, `--ms-accent #0b7a5c`. All
     checks pass. Worst adjacent CVD ΔE is 8.8; the normal-vision floor is 17.4.
   - Tax split, dark: the site's dark tokens are text tokens, too light for marks. Mixing them
     with the surface failed the chroma check. I used `#3987e5 / #c98500 / #199e70`, all
     passing (CVD 8.4, normal-vision 19.8). These are the only new colour values, scoped to
     `--mf-tax-*` on these pages.
   - Identity never relies on colour alone: legends, a fixed order, direct totals and the
     tables.
7. **Example.** San Francisco, $200,000, one person: about the median posted salary in the
   LIVABILITY.md calibration ($199,267). `EXAMPLE` is a model input, not data. Every number
   shown is computed from it on each build.
8. **Grade thresholds are rounding-aware** (lead's decision). `netForShownScore(juice, min)`
   returns the smallest whole-dollar net whose `Math.round(scoreFromNet(net))` reaches `min`.
   - Today Juicy starts at $94,996 and Ripe at $47,103, not `netForScore(70/45)` ($96,318 /
     $47,827).
   - The same function feeds the grades figure, the score-curve dots, its table and
     `grade.*.net`. For 100 it equals `SCORE_ANCHORS.fullGlassUSD`.
9. **Plain words in the sources table** (lead's review). `PUBLISHERS` maps the data's source names
   to plain names, e.g. "US Department of Housing and Urban Development (HUD) Fair Market Rents".
   OECD and DWP are explained. Unknown names fall back to the short name, with known
   abbreviations expanded (`ABBR`). There is no "Big Macs a year" row: the drawer doesn't show
   it. The Big Mac data appears only as the exchange-rate source.
10. **Page design.**
    - Hero: eyebrow, H1, the one-line definition (the guide's first paragraph), an equation of
      chips, a facts row (cities, countries, tax rules and when they were checked, rents as of),
      and two buttons: "See the formula" and "Full technical reference".
    - On desktop (≥ 1040 px) a sticky "On this page" side nav. On phones it is a `<details>`.
    - Measure: 70ch in a 760 px column at 16 px / 1.65.
    - Sections get numbered badges. Bold-title-plus-list pairs become cards: §5 "Limitations"
      uses amber-topped callout cards, the "what it doesn't include" callout.
    - The FAQ is a card grid. "More detail" links are muted rows. Blockquotes and `> [!NOTE]`
      alerts are callouts.
    - The site bar and brand match the old page, with "← Back to the jobs" (`../`).
      `theme-init.js` gives dark-mode parity with the app's saved theme.
    - No smooth scrolling: it animated the drawer's deep link for about 800 ms on phones.
    - No new fonts.
    - Sizes: the guide is 59 KB of HTML, about 12 KB gzipped. The CSS is 21 KB. The reference
      is 140 KB, as before.
11. **Server mode**:
    - `/methodology/` renders the guide per request, so doc and data edits show on reload.
    - `/methodology/reference/` renders the reference only, so a guide error can't take it down.
    - `/methodology/methodology.css` returns the stylesheet.
    - `/methodology` and `/methodology/reference` return 301 to the paths with a trailing slash.

### Values implemented (`VALUES` in scripts/methodology-figures.js)

Contract: `example.city/gross/tax/rent/living/net/score/grade`, `cities.count`, `countries.count`,
`fx.asOf`, `tax.asOf` (latest `TAX_SOURCES[*].reviewed`, as a date), `rent.asOf` (range of the
1-bedroom quotes' months).

Requested by the copywriter: `score.k`, `score.fullGlass`, `grade.juicy.net`, `grade.ripe.net`
(rounding-aware), `household.couple.scale`, `household.family.scale`, `confidence.high/medium/low`.

Extra, for future copy: `example.salary`, `example.taxRate`, `example.household`, `tax.years`,
`tax.rules`, `living.asOf`, `nyc.basket`, `grade.juicy.min`, `grade.ripe.min`.

### Anchor map (old link on methodology/ → where it lands now)

| Old `methodology/#…` | Lands on |
|---|---|
| `1-the-formula` (the drawer, `public/app.js` JUICE_DOC) | guide §1 heading (own id) |
| `3-tax-model`, `5-limitations` | guide §3, §5 headings (own ids) |
| `score-curve-and-grades` (data/freshness.json, docs/DATA_FRESHNESS.md) | guide §2 (alias) |
| `tax-sources` | guide §3 (alias) |
| `households-just-me-couple-family` | guide §4 (alias) |
| `guardrails-inputs-confidence-rent-override`, `estimates` | guide §6 (alias) |
| `sources`, `6-refreshing` | guide §7 (alias) |
| `juice-score-livability-`, `worked-examples-…`, `the-name`, `2-jobs-attachjuicejob-cities`, `verification-…`, `known-gaps-tax`, `4-data-datacitiesjson`, `42-rent-by-number-of-bedrooms`, `41-numbeo-terms-of-use-reuse-is-not-cleared`, `7-plan-replacing-numbeo-with-official-and-open-sources` | their entry in the §9 reference index, linking on to `reference/#<id>` |

Every id is unchanged at `methodology/reference/#<id>`. The map is recomputed on every build, so
LIVABILITY.md edits move with it.

## 4. Replayable steps

1. Save the prompt: `docs/process/prompts/methodology-ux.md`.
2. Load the dataviz skill. Validate the palettes with:
   ```sh
   node <skill>/scripts/validate_palette.js "#2563eb,#9a5b00,#0b7a5c" --mode light --surface "#ffffff"
   node <skill>/scripts/validate_palette.js "#3987e5,#c98500,#199e70" --mode dark --surface "#161a21"
   node <skill>/scripts/validate_palette.js "#ee9893,#d9534f,#a51f35" --ordinal --mode light --surface "#ffffff"
   node <skill>/scripts/validate_palette.js "#8a363c,#c9505a,#f59a95" --ordinal --mode dark --surface "#161a21"
   ```
   Each reports "ALL CHECKS PASS".
3. Unit tests: `node --test test/md.test.js test/methodology.test.js` gives 7 + 13 passes.
4. Build: `npm run build`. It writes `dist/methodology/{index.html, methodology.css, reference/index.html}`
   and the same under `dist/beta/`. The link policy, including rule 4, and the CSP check pass.
5. Fast visual loop, without a full build. In the scratchpad,
   `node methodology-ux/render.mjs <dist>` re-renders only `methodology/`, then
   `NODE_PATH=…/pw/node_modules node methodology-ux/shot.mjs <dist> <out> --segments=20 --dpr=1`.
6. E2E:
   ```sh
   NODE_PATH=…/scratchpad/pw/node_modules node scripts/e2e.js --grep=^Methodology
   ```
   For the screenshots:
   ```sh
   E2E_SHOTS=1 NODE_PATH=… node scripts/e2e.js --grep="^Methodology: screenshots"
   ```

## 5. Verification

- `test/md.test.js`: 7/7. The comment patch is folded in: whole-line, multi-line, and the
  `<!-- melon:generated … -->` markers. Also covered: `{#id}`, placeholders and their errors,
  alerts, and a LIVABILITY round trip.
- `test/methodology.test.js`: 13/13. It covers:
  - the stub guide with every figure and value;
  - CSP cleanliness and tokens;
  - **the score-curve path spans x 0–1000 and y 100→<2, with inline sizing**;
  - live values;
  - rounding-aware thresholds, in the grades and score-curve figures too;
  - the figures following the data (a doubled rent changes the waterfall; the freshness cadence
    is read);
  - plain-word sources;
  - the real guide, and every reference id landing on it;
  - the anchor map;
  - the reference with all headings and tables;
  - loud failures;
  - the fallback with no guide;
  - server routes and the 301s.
- `npm test`, first run: 576/577. The one failure, `static live vs bundle race`, is in
  `test/static-build.test.js` and comes from another agent's uncommitted `public/api.js`. In a
  scratch copy of the repo with HEAD's `public/api.js` and all of my changes, that test passes.
- `npm test` on HEAD a9b5e7b+, after the lead's freshness merge: 577/579. The race test now passes.
  Two tests failed only under full-suite load and pass when run alone:
  - `first company loads do not block the event loop (PERF-1)` in `test/perf.test.js`, a timing test;
  - `doctored living sources …` in `test/refresh-col.test.js`.

  Neither touches the methodology files.
- `npm run build`: OK, stable and beta.
- E2E, methodology: 8 checks + 1 screenshot task. All pass:
  - no horizontal overflow at 1440, 390 and 360 px on both pages, and no figure spills its card;
  - every figure renders, and every chart has a title, a desc and aria-labelledby;
  - the curve's bounding box is ≥ 90 % of the plot, wide and tall;
  - no figure text under 12 px on phones;
  - no `{{`, `undefined` or `NaN`;
  - `#1-the-formula` lands just under the sticky bar at 1440 and 390, and the old anchors
    scroll into view;
  - the reference has every heading;
  - the drawer's "How it's calculated" opens `/methodology/#1-the-formula` with the charts;
  - dark mode follows both the system setting and the saved theme;
  - no console errors, HTTP failures or CSP violations.
- Full e2e suite (`node scripts/e2e.js`): 103/104 passed, 0 failed, 1 skipped (the screenshot task,
  gated by `E2E_SHOTS`). After the lead's merge, the methodology e2e run with `E2E_SHOTS=1` passed
  9/9.
- Screenshots in `docs/screenshots/methodology/`:
  - `guide-{1440,390}-{light,dark}.png`;
  - `reference-{1440,390}-{light,dark}.png`;
  - figure close-ups `figure-{score-curve,tax-split,households,formula}-1440-light.png` and
    `-390-dark.png`.

## 6. Known gaps and follow-ups

- **The figures depend on the in-progress `server/juice.js` and `data/cities.json`.** These are
  the tax and household agents' uncommitted work. Couple and Family tax (joint filing, "taxed
  jointly" on the household cards) and every tax number come from that code at build time. If
  it is reverted, the numbers change and nothing breaks.
- `README.md` (about l. 296–300) still says `docs/LIVABILITY.md` is rendered as
  `methodology/index.html`. It should now say the guide is at `methodology/` and the reference at
  `methodology/reference/`. That file isn't mine.
- `docs/LIVABILITY.md` l.137–138: the lead is changing the grade thresholds to the
  rounding-aware $94,996 / $47,103 to match the guide.
- The heading id of LIVABILITY's "Worked examples (generated from the code, data as of …)"
  changes when its date changes. The index follows it, but an external link to the old id
  would land at the top. Consider a `{#worked-examples}` id there (md.js supports it).
- The guide has no theme toggle of its own. It follows the app's saved theme (`theme-init.js`)
  and the system setting. A toggle would need a script, which ROADMAP §8 does not budget for.
- `test/e2e/links.e2e.js` is still not registered in `scripts/e2e.js` (it wasn't before either).

## 7. Change log

- 2026-10-10 08:40: prompt saved, inputs read, dataviz skill loaded, palettes validated.
- 08:50: md.js: comments, `{#id}`, placeholders, alerts, blocks. The LIVABILITY output is
  unchanged.
- 09:00: `methodology-figures.js`, the guide and reference renderers, the build and server
  wiring. The first build passed.
- 09:05: visual review fixes:
  - the curve was hidden by the site's 18 px svg rule;
  - the formula became a receipt layout on phones;
  - the household cards were redesigned;
  - sources columns and wording;
  - anchor wrapping and list padding.
- 09:10: lead review: rounding-aware thresholds, plain-word sources (no Big Mac row), and a
  test that the curve spans the plot. Rule 4 added to `links-policy.js`.
- 09:15: removed smooth scrolling, so the `#1-the-formula` deep link lands at once. Added the
  e2e suite and the screenshots.
- 09:20: in server mode the guide charts the server's `CITIES_FILE` (`MELON_CITIES_FILE`).
  Re-verified after the lead's freshness merge into `build-static.js` and `server/index.js`
  (HEAD a9b5e7b): build OK, unit and e2e tests as in §5, screenshots regenerated.
