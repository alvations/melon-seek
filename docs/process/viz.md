# Process log: viz

## 1. Brief
Prompt: [`docs/process/prompts/viz.md`](prompts/viz.md).
Goal: the two "Zillow for job postings" views. A salary landscape chart (one
min–max range bar per posting, sorted and grouped, with a sticky distribution
strip and axis) and a Leaflet map of price-tag pins, both plain ES modules that
`public/app.js` drives through the interfaces in `docs/CONTRACT.md`.
Files owned: `public/viz/palette.js`, `public/viz/chart.js`, `public/viz/map.js`,
`public/viz/viz.css`, `public/viz/demo.html`, plus this log,
`docs/process/prompts/viz.md` and `docs/process/scripts/viz-screenshots.mjs`.

## 2. Inputs and sources
- `docs/CONTRACT.md`: the Job shape (`salary.{min,max,mid,currency,interval}`, already annualized; `locations[]` with `lat/lng/remote`; `seniority` values) and the frontend interfaces for `palette.js`, `chart.js` and `map.js`.
- **dataviz skill** (`SKILL.md`, `references/palette.md`, `marks-and-anatomy.md`, `interaction.md`). Guidance applied:
  - Categorical colors use the validated 8-slot reference palette in its fixed order. A 9th or later key folds into "Other" (gray) and never gets a generated hue.
  - The sequential scale uses one hue (blue) running light to dark. It is never a rainbow.
  - Marks are thin: 8px range bars with 4px rounded ends and a 10px midpoint dot (r ≥ 4) with a 2px surface ring. Gridlines are 1px solid hairlines and never dashed.
  - Text uses text tokens and never takes the series color. Identity comes from a swatch or the mark itself.
  - A legend always appears when there are 2 or more series (colorBy ≠ none). Direct labels are selective: the range label shows only on the hovered or highlighted row.
  - There is a hover tooltip on every mark. The hit target is the whole 22px row, wider than the 8px bar. The value in the tooltip is shown first and bold, with the labels after it. All DOM text is set with `textContent`.
  - Dark mode uses its own selected steps. It is not an automatic inversion. Tokens are defined under `@media (prefers-color-scheme: dark)` with a `:root:where(:not([data-theme=light]))` guard, and again under `:root[data-theme=dark]`.
  - Validator: `scripts/validate_palette.js` from the skill.
- Leaflet 1.9.4 docs (divIcon `html` accepts an HTMLElement; tooltips accept a function as content; `createPane`).
- CARTO basemap URL pattern and attribution, as given in the prompt.

## 3. Decisions and rationale
1. **Categorical palette.** The skill's reference palette, used unchanged.
   Light: `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300 #4a3aa7 #e34948`.
   Dark: `#3987e5 #d95926 #199e70 #c98500 #d55181 #008300 #9085e9 #e66767`.
   Other: `#a8a69f` (light) and `#6b6a65` (dark).
   Validator results:
   - Light: all checks pass. Worst adjacent CVD ΔE is 9.1 and worst normal-vision ΔE is 19.6. There is a contrast WARN for aqua, yellow and magenta, all below 3:1. The relief for that WARN is visible text labels: legend text, row labels and tooltips.
   - Dark: all checks pass, including contrast ≥ 3:1.

   The prompt asked for about 10 hues. **Deviation:** I used 8 plus Other, because the skill forbids adding hues that have not been validated.
2. **Slot assignment.** `assignColors(keysByCountDesc)` keeps sticky slots: a key that already has a slot keeps it, and new keys take the lowest free slot in the fixed order. The first dataset therefore gets the CVD-checked ordering, and colors follow the entity when filters change. `colorFor(key)` reads the registry and falls back to a hash slot, so it is deterministic per key and `app.js` gets the same colors as the chart. `resetColors()` clears the registry.
   - Alternative rejected: pure hash. It put red next to orange or pink in the first test screenshot.
   - With 8 or fewer keys all are shown. With 9 or more, the top 7 are shown plus "Other (n)", so Other takes the 8th legend item.
3. **Colors are hex values that follow the current mode.** `isDark()` checks `<html data-theme>` first, then `matchMedia`. The chart and map re-render through `onThemeChange` (a matchMedia listener plus a MutationObserver on `data-theme`). I used hex rather than `var()` so that values work in inline styles, Leaflet HTML and canvas.
4. **Sequential salary scale.** Blue ramp. Light steps 100→700: `#cde2fb #9ec5f4 #6da7ec #3987e5 #256abf #184f95 #0d366b`. Dark steps: `#184f95 … #9ec5f4`, so a higher median is brighter. Values are interpolated in RGB. Pill text color comes from `inkOn(bg)`, which picks white or ink by WCAG contrast.
5. **FX table (approximate, static).** USD 1, GBP 1.27, EUR 1.09, CAD 0.73, AUD 0.66, JPY 0.0067, SGD 0.74, CHF 1.13. These are rounded mid-market rates from 2024–2025 memory. No live source was used (the sandbox has no network), and the UI always labels them "approx USD". Unknown currencies are plotted unconverted and listed in a note. The tooltip shows the native currency first, then "≈ $X – $Y USD (approx)".
6. **`formatMoney`.** K values round half-down, so 352500 gives "$352K" to match the contract example. Values of 1M and up show one decimal below 10M ("$1.2M") and whole numbers from 10M.
7. **Chart rendering uses plain HTML/DOM, not SVG.** CSS ellipsis truncates titles without measuring, and hover only toggles a class (event delegation, no re-creation). I did not virtualize: 1000 jobs produce about 3.3k nodes and a full re-render takes about 90–180 ms in headless Chromium. Hover cost is zero.
   - Rows are sorted by midpoint, high to low.
   - Groups are sorted by median, high to low. Seniority groups are the exception and follow the ladder order Director+ → Intern.
   - In the chart, groupBy location uses the job's first on-site city (or "Remote"), because one row cannot sit in several groups.
8. **Sticky header.** The histogram (up to 60 bins aligned to the x-domain, with an overall median line) and the axis are `position: sticky` inside `.ms-chart__scroll`. If the container does not limit its height, the chart adds `.ms-chart--flow` (overflow visible), so the header sticks to the page viewport instead.
9. **X domain.** `niceTicks(lo, hi, plotW/90)` over approx-USD lo/hi. The domain is not forced to start at 0. That is acceptable here because the bars are ranges and do not encode length from a baseline.
10. **Map aggregation and clustering.**
    - Locations are keyed by lat/lng rounded to 0.1°. A job counts once at each of its distinct locations.
    - Pills are greedily clustered in screen space (76×34 px, plus 16 px of height when offline labels are shown) and re-clustered on `zoomend`. A cluster's label is "City + N nearby", and clicking it flies to the bounds of its members.
    - Pill color is `salaryColor` of the cluster median, normalized across the visible clusters.
11. **Remote.** Every location entry with `remote: true`, plus any `job.remote` job with no plotted coordinates, goes to the Remote control. **Deviation:** I did this even when a remote entry has country-centroid coordinates, because a pin at a country centroid would be misleading.
12. **Fit.** `update(jobs, {fit})`. If `fit` is omitted, the map refits on the first non-empty update and whenever the set of `job.company` values changes. Filter changes do not refit. Pass `fit: true` or `fit: false` to override.
13. **Offline fallback.**
    - The container has a tinted background (`--_map-bg`) and a 15° graticule in a pane below the tiles.
    - On `tileerror` with no successful tile, or 4 s with no tile loaded, the class `.ms-map--offline` is added. It shows place labels under the pins and a note: "Basemap unavailable · pins still work".
14. **Map `onSelect`.** Called in addition to `onAreaSelect` when a clicked pill contains exactly one job.
15. **CSS scoping.** Everything sits under `.ms-chart`, `.ms-map` or `.ms-viz-tip`. The chart tooltip is appended to `document.body` so it is never clipped. Private tokens (`--_*`) fall back from the `--ms-*` app tokens.

## 4. Replayable steps
```sh
# 0. palette validation (dataviz skill base dir)
node <skill>/scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948" --mode light
node <skill>/scripts/validate_palette.js "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767" --mode dark
#    -> ALL CHECKS PASS (light: contrast WARN for 3 slots, relieved by text labels)

# 1. unit sanity of palette helpers
cd public/viz && node -e "import('./palette.js').then(p=>console.log(p.formatMoney(352500), p.formatMoney(1234567), p.toUSD(100000,'GBP')))"
#    -> $352K $1.2M 127000

# 2. screenshots (built-in static server on :5199 + Playwright, tiles blocked)
#    playwright was already available globally at /opt/node-tools/node_modules/playwright (1.56.1);
#    browser binary /opt/pw-browsers/chromium-1194/chrome-linux/chrome. Never `playwright install`.
node docs/process/scripts/viz-screenshots.mjs /path/to/out

# 3. manual harness
#    serve public/ + /vendor/leaflet/ (the script above does it), open /viz/demo.html
#    query params: mode=chart|map, groupBy, colorBy, n=40|240|1000, minSal, theme=light|dark, hl=<index>
```

## 5. Verification
- `viz-screenshots.mjs` ran all 7 shots with no page errors. The only console errors were blocked tile requests (ERR_FAILED), which were expected and are filtered out.
  - chart-light: department colors, highlighted row.
  - chart-dark-grouped: seniority bands, group median line, hover tooltip.
  - chart-dark-1000-scrolled: header stays sticky after scrolling 3000px. 819 rows, full render 92 ms.
  - chart-mobile-dark: 390px wide.
  - map-light-hover: offline fallback, tooltip with top roles, pulse highlight on SF.
  - map-dark.
  - map-light-us: zoom 4 re-cluster, 10 pins.
- Interaction check (Playwright script in the scratchpad):
  - Clicking a row and pressing Enter (keyboard nav) both fire `onSelect`.
  - Switching to `data-theme=dark` recolors the legend (`#2a78d6` → `#3987e5`).
  - Clicking Remote fires `onAreaSelect(…, "Remote")`. Clicking a pin fires `onAreaSelect` plus `onSelect` for a single-job pin.
  - Filtering keeps sticky colors.
  - There were no page errors.
- Empty state: all salaries null shows "No published salaries · N postings match…".
- Screenshots from this run are in the agent scratchpad (`…/scratchpad/final/*.png`) and are not committed. Re-run step 2 to regenerate them.

## 6. Known gaps and follow-ups
- Not tested with real tiles: the sandbox blocks the CARTO hosts. Tile switching on theme change uses `setUrl`.
- The chart is not virtualized. Above roughly 3000 jobs, window the rows.
- In the chart, groupBy location uses only the first on-site location of a multi-location job.
- FX rates are static and approximate. Update `FX_TO_USD` in `palette.js` if they matter.
- There is no table view inside the chart, as the skill would want. The app's results list serves as the table equivalent.
- There is no texture or forced-colors fallback for CVD readers. Identity is still always available as text through the legend, the tooltip and the group headers.
- The chart's tooltip does not track touch drags. On touch, a tap selects.

## 7. Change log
- 2026-10-02: palette.js, chart.js, map.js, viz.css and demo.html created. Palette validated.
- 2026-10-02: Changed slot assignment from hash probing to sticky lowest-free-slot after a screenshot showed similar adjacent hues. Dark-mode bar and histogram opacity raised (.5 → .72, .42 → .62) because the bars looked muddy. Cluster footprint enlarged and recomputed when the offline state changes. Narrow-width captions shortened.
- 2026-10-02: Process docs and the replayable screenshot script added.
