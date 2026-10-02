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
- Basemap: originally CARTO, as given in the prompt. It was replaced by OpenStreetMap standard tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) after CARTO began requiring an API key on the live site. I followed the OSM tile usage policy: attribution stays visible, there is no prefetching, and a valid Referer is sent.

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

16. **Keyboard map pins (REVIEW M3).**
    - Each pin's click handler is now a named `activate()` that also runs on the marker's `keydown` for Enter and Space. Leaflet sends DOM key events to the focused marker, but on its own it maps Enter only to bound popups.
    - Each pin icon (`role=button`, `tabindex=0`, set by Leaflet) gets an `aria-label` such as "San Francisco, CA: 114 postings, median $235K". The visual pill is `aria-hidden`.
    - `draw()` notes the place keys of the focused cluster before it rebuilds. Afterwards it refocuses the new cluster that contains the old lead place (`members[0]`), or else any cluster sharing a member, using `focus({preventScroll:true})`. Focus therefore survives zooming and the fly-to after activation.
    - `.ms-pin-icon:focus-visible .ms-pin` draws a 2px accent ring.
17. **Chart listbox semantics (REVIEW L4).**
    - Grouped rows are wrapped in `role=group` with `aria-label` set to "Director+, 32 postings, median $420K".
    - The visual band header is `aria-hidden`, the gridline layer is `aria-hidden` and the rows container is `role=none`, so the listbox contains only groups and options.
    - Each option has `aria-selected` and an `aria-label` of the form title, range ("$285K to $515K", plus " approx USD" for converted rows), department and location. The salary used to be missing because `.ms-row__val` is hidden until hover.
    - `render()` saves the active job id, resets `activeIdx` and `aria-activedescendant`, then restores the active row on the same job, or nowhere if that job was filtered out. A stale index can no longer open a different job.
    - Added Home, End, PageUp and PageDown.
    - The active-row indicator is now a 2px `--_accent` inset ring (4.3:1 light, 4.8:1 dark). It was a 1px `--_axis` ring at 2.0:1.
    - The legend has `role=group`.
18. **Reduced motion (REVIEW L6).** `prefersReducedMotion()` is exported from `palette.js`. When it is true:
    - `scrollToRow` uses `behavior:'auto'` instead of `'smooth'`.
    - The map uses `fitBounds({animate:false})` and `setView({animate:false})` instead of `flyToBounds` and `flyTo`.
    - The CSS already stopped the pin pulse under `prefers-reduced-motion`.
19. **Annualization note (REVIEW C1, in chart.js).** The tooltip reads `salary.originalInterval`, falling back to a non-year `interval`. It maps hour, day, week and month to hourly, daily, weekly and monthly, which fixes the "dayly" text and the note that never showed.

20. **Basemap is now OSM, and the provider is configurable** (urgent fix: CARTO showed "API key required" on every tile of the live site).
    - Default: `OSM_TILES` is exported from `map.js` as `{ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19, attribution: '© OpenStreetMap contributors' (linked), dark: 'filter' }`.
    - Override it with `createMap(container, { tiles: { url, attribution, maxZoom, subdomains, dark: 'filter' | url } })`.
    - Tile layer options: `referrerPolicy: 'strict-origin-when-cross-origin'` (OSM requires a Referer), `crossOrigin: true` and `keepBuffer: 1`. No prefetching is configured.
    - **Dark mode:** with `dark: 'filter'`, the class `.ms-map--dark` is toggled on theme change. It applies `filter: invert(1) hue-rotate(180deg) brightness(.9) contrast(.9)` to `.leaflet-tile-pane` only, so pins, controls and tooltips are never filtered. With `dark: <url>`, the layer swaps URLs with `setUrl` instead.
    - **Error images:** a provider error can arrive as an image that "loads" with a 4xx status (for example "API key required"). On the first `tileload`, the map re-reads that tile once with `fetch(src, {cache: 'force-cache', mode: 'cors'})` and checks `response.ok`.
      - If the check fails, the map adds `.ms-map--tiles-bad`, which hides the tile pane, and `.ms-map--offline`, which shows the styled fallback: graticule, place labels and a note.
      - A fetch or CORS exception counts as OK, because the image did load.
      - `tileerror` and the 4 s no-tile timer still trigger offline as before.
    - The CSP in `server/index.js` already allows `https://tile.openstreetmap.org` in `img-src`. I left it unchanged.

21. **Clusters view is the new default chart; ranges becomes the detail view** (user feedback: "too noisy, should feel like browsing clustered listings").
    - API: `update(jobs, { view: 'clusters'|'ranges', groupBy, colorBy })`. `VIEWS` and `DEFAULT_VIEW` are exported from `chart.js`, and `chart.view` reads the current view.
    - In clusters, `groupBy` defaults to `department`; `'none'` gives one "All roles" row. In ranges it defaults to `'none'`, as before. `colorBy` applies to ranges only.
    - New callback `onClusterSelect(jobs, label)`. New method `clearSelection()`.
    - Rows: one per group, 52px tall (66px stacked on narrow screens), sorted by median with high values first. Rows without a published salary go last and show "No published salaries".
      - The label is a swatch, the group name and "N roles · median $XK". N counts every posting in the group; the median uses salaried postings only.
      - A lone row ("All roles") is 92px tall with circles up to r = 30, and uses at least 46px per bin.
    - Axis and bins: the x-axis is approx USD over posting midpoints, with ticks every $100K. The step drops to $50K when the span is under $300K and rises to $250K when it is over $1.5M.
      - The bin width is the smallest of 10K/20K/25K/50K/100K/200K/250K/500K that gives at least 34px per bin, so a circle can carry a readable count. In the demo at 1280px that is $50K. A narrower data range gives $25K, as the user suggested.
      - Each bin is one circle with r = max(4.5, rMax·√(n/maxN)). maxN is global so sizes compare across rows, and rMax = min(binPx/2 − 1.5, 16). The count is printed when n ≥ 2 and r ≥ 8.
      - Hit targets are at least 24px.
    - Behind the circles: a soft rounded P25–P75 band, 9% of the row color mixed into the surface (16% in dark), and a 2px median tick at 38% ink.
      - Circles inside the band take a ring of the band's tint. Outside it they take a surface ring. A surface-colored ring inside the band read as dark "sockets" in dark mode.
    - Color: one restrained palette. Circles are the row's category color mixed into the surface at 30% (52% in dark), with text-token counts.
      - On hover, selection or highlight a circle fills with the full row color, and its text color comes from `inkOn`.
      - Only the top 8 groups by count get category hues, in fixed slot order. Further groups fold into neutral gray, lifted in dark mode so they don't read as holes.
      - There is no legend: the row label names the color.
    - Interaction:
      - Hovering a circle shows a tooltip: "12 roles", "$300K–$325K midpoint (· approx USD)", the group, the top 4 titles with ×n, and "+N more titles".
      - Clicking a circle calls `onClusterSelect(binJobs, "Group · $300K–$350K")` and marks it `is-selected` (with ring). A single-job bin also calls `onSelect(job)`.
      - Clicking a row label calls `onClusterSelect(allGroupJobs, "Group")` and marks the row selected.
      - `highlight(jobId)` gives that job's circle a solid fill and an ink ring, and scrolls to its row. Reduced motion makes the scroll instant.
      - The selection persists across re-renders, keyed by group and bin start.
    - Keyboard and ARIA:
      - The body is `role=listbox`. Each row is `role=group`, labelled e.g. "AI Research & Engineering, 77 roles, median $382K".
      - The row label is the first option ("…: all 77 roles, median $382K"); each circle is an option ("12 roles, $300K to $350K, Group").
      - Left/Right move within a row, Home/End jump to the row ends, Up/Down (and PageUp/PageDown, 5 rows) move to the nearest circle by salary, and Enter/Space select.
      - The active option keeps `aria-activedescendant` and a 2px accent ring, and survives re-renders by key.
      - The plot layer has `pointer-events:none` (circles opt back in), so row labels stay clickable.
22. **Shared chrome, both views.**
    - The distribution strip is slimmer: 28px, captioned with one "Median $XK" line, in the accent at 26% opacity for clusters.
    - The notes moved into one muted line under the chart (`.ms-chart__foot`), e.g. "195 postings with salary · 45 postings without published salary · 32 non-USD shown as approx USD", with the FX caveat in its `title`.
    - The ranges legend stays on top. The clusters view has no head.
23. **Performance.** The clusters view renders 1000 jobs grouped by location (129 circles) in about 13–25 ms. Ranges takes about 110 ms for 819 rows.

24. **Robust salary axis (defense in depth for the $4.6M bug).** The data gate is the primary fix. The chart must still never let one bad value squash every other row.
    - `robustBounds(values)` is exported from `chart.js`. It takes P1–P99 and then tightens them with a Tukey far-out fence (Q1 − 3·IQR, Q3 + 3·IQR, IQR floored at 10% of Q3).
      - Reason: with few points, P99 interpolates toward the bad value. For example, with 10 values and one at $4.6M, P99 alone would give about $4.2M; the fence gives $400K.
    - Clusters domain: robust midpoints, padded 4% each side, snapped to $50K/$100K/$250K ticks, clamped at 0.
    - Ranges domain: robust midpoints widened to the robust bar ends (P1 of the minimums, P99 of the maximums) so that ordinary ranges are not clipped, padded 4% and snapped with `niceTicks`.
      - Deviation from "P1–P99 of mids" for this view only: mids alone would clip about half of the bars.
    - Nothing is dropped:
      - In clusters, postings beyond the domain become a per-row overflow marker at the axis edge: a neutral chip "›" (or "‹"), with the count when there is more than one.
        - The marker is a listbox option ("1 role above $700K: $4.6M, Group"), reachable with Home/End and the arrow keys.
        - Its tooltip lists the real values per posting.
        - Click or Enter calls `onClusterSelect(jobs, "Group · above $700K")`.
      - In ranges, a bar cut off by the axis gets a "›"/"‹" chevron at the edge. Its midpoint dot is hidden when the midpoint itself is out of range, and the tooltip says "Extends beyond the chart axis" next to the real values.
      - Out-of-domain midpoints are left out of the distribution strip rather than piled into its edge bin.
      - The notes line adds "N postings beyond the axis (›)".
    - Medians, the P25–P75 band and group median lines are clamped to the axis.
25. **Initial map fit lives in `map.js` `fitToData()`.** It replaces the `app.js` workaround that went through `map.leaflet`.
    - Padding: about half a pin horizontally (`min(90px, width/6)`). Vertically `min(48px, height/8)`, plus 32px on top for the pin height above its point, plus 18px at the bottom when offline labels show.
    - minZoom: `getBoundsZoom` is measured with minZoom 0, then minZoom is set to `min(2, floor(z·2)/2)`, so SF–London–Tokyo fits even a 390px column (zoom 0 there). It is restored to 2 on the next fit when the pins allow it.
    - `fitBounds` runs with `maxZoom: 11, animate: false`.
    - A hidden (0×0) container defers the fit: `pendingFit` runs it when the ResizeObserver or `invalidateSize()` sees a real size.

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
node docs/process/scripts/viz-screenshots.mjs /path/to/out   # PORT env (default 5199) if the port is taken

# 2b. keyboard / ARIA / reduced-motion checks (REVIEW M3, L4, L6); prints a JSON report
PORT=5288 node docs/process/scripts/viz-a11y-check.mjs /path/to/out

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
- After the review fixes (M3, L4, L6, C1), `viz-screenshots.mjs` was re-run with `PORT=5288` because another process held 5199. All 7 shots passed with no page errors, and their appearance was unchanged. Full render with 1000 jobs: 172 ms.
- `viz-a11y-check.mjs` was run with Chromium emulating `reducedMotion: 'reduce'`:
  - Listbox contents: 7 groups and 195 options, with 0 stray text nodes outside an option or `aria-hidden` element.
  - Accessible names: the first group is "Director+, 32 postings, median $420K". The first option is "Research Scientist, Alignment, $505K to $840K, AI Research & Engineering, San Francisco".
  - Re-render: after changing groupBy, the active row stayed on the same job, with `aria-selected=true` and a matching `aria-activedescendant`. End moves to the last row. The active ring is a 2px inset in `rgb(42,120,214)`.
  - Reduced-motion scroll: `highlight()` scrolled to 3011px synchronously, with no smooth animation.
  - Map with Enter: on the focused pin "Singapore, SG: 4 postings, median $111K" (`role=button`), Enter fired `onAreaSelect` and moved straight from zoom 2 to 9. Focus stayed on the same pin after the re-cluster.
  - Map with Space and zoom-out: Space fired it again (zoom 11). After zooming out 2 levels, focus was still on that pin.
  - There were no page errors.
- Basemap fix: `viz-screenshots.mjs` now records every tile request and answers with a stub. All map shots requested only `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (for example `https://tile.openstreetmap.org/2/1/1.png`); any other host fails the run. Map states:
  - `map-tiles-ok-light`: 200 stub tile. offline=false, bad=false.
  - `map-tiles-ok-dark-filter`: 200 stub in dark mode. dark=true. The tile pane is inverted to a dark tone and the pins are unfiltered.
  - `map-tiles-error-image`: 403 PNG, the error-image case. bad=true and offline=true. Tiles are hidden and the fallback note shows. Chromium fired `tileload` for the 403 image, which confirms that the status probe is needed.
  - aborted tiles (`map-light-hover`, `map-dark`, `map-light-us`): offline=true, as before.
- Clusters view: `viz-screenshots.mjs` now runs 16 shots, all ok:
  - `clusters-light`, `clusters-light-hover` (tooltip on the largest circle, plus a highlighted circle), `clusters-dark` (by seniority), `clusters-dark-location-1000` (13 ms, 129 circles), `clusters-all-roles` and `clusters-mobile-light`.
  - The ranges shots now pass `view=ranges`.
- I compared the two views side by side. Clusters shows 12 calm rows with about 65 circles where ranges showed 195 bars, and the medians and spread can be read at a glance. Ranges keeps per-posting detail.
- `viz-a11y-check.mjs` now includes a clusters block, run with reduced motion and a 520px-tall viewport:
  - Structure: 12 groups and 77 options (12 row labels plus 65 circles), 0 stray text, minimum circle hit target 24px.
  - Keyboard: Right goes to the row label and then to the circles. Down goes to the nearest circle in the next row. `aria-activedescendant` matches the active option, and the tooltip shows on circles.
  - Enter selects: `is-selected` is set and `onClusterSelect`/`onSelect` fire.
  - The active ring is a 2px accent (`#2a78d6`).
  - After a theme re-render the active option and the selection are kept.
  - Clicking a row label logs "cluster: Product Engineering (75)" and selects the row.
  - `highlight()` marks the circle in the last row and scrolls synchronously (scrollTop 273).
  - The ranges and map results are unchanged from before. There were no page errors.
- Bug found and fixed during this check: the full-width plot layer covered the row labels, so clicking a label did nothing.
- Robust axis and map fit: `viz-screenshots.mjs` now runs 19 shots, all ok.
  - `clusters-outlier` (demo `?outlier=1` adds a $4.6M bad parse and a $7.5K stipend): the axis is $0..$700K instead of $0..$4.7M. The AI row shows one "›" marker, and hovering it shows "$4.4M–$4.8M". The notes say "1 posting beyond the axis (›)".
  - `ranges-outlier`: the axis is $0..$1M. The bad row shows only a "›" at the edge.
  - `map-mobile-fit` at 390×760: 4 of 4 pins are fully inside the container (zoom 0, minZoom 0).
  - The desktop map fit keeps all pins visible with about 90px margins.
- `viz-a11y-check.mjs` overflow block: Right then End reaches the marker ("1 role above $700K: $4.6M, AI Research & Engineering"), and the tooltip shows the real range. Enter logs "cluster: AI Research & Engineering · above $700K (1)" and `onSelect`. All earlier checks are unchanged. There were no page errors.
- `robustBounds` in Node:
  - 10 values plus $4.6M gives [$201.8K, $400K].
  - 100 values plus $4.6M gives [$154K, $546K].
  - A wide legitimate spread of $60K–$750K is kept as [$62K, $740K].
  - A single value and all-equal values give [v, v].

## 6. Known gaps and follow-ups
- Not tested against real OSM tiles, because the sandbox blocks tile hosts. The screenshot script stubs tile responses with 200, 403 and abort, and checks the request URLs instead.
- The dark basemap is an inverted OSM tile pane. It is legible, but not as polished as a purpose-built dark style. To use one, pass `tiles.dark` as a URL, for example a keyed provider.
- The chart is not virtualized. Above roughly 3000 jobs, window the rows.
- In the chart, groupBy location uses only the first on-site location of a multi-location job.
- FX rates are static and approximate. Update `FX_TO_USD` in `palette.js` if they matter.
- There is no table view inside the chart, as the skill would want. The app's results list serves as the table equivalent.
- There is no texture or forced-colors fallback for CVD readers. Identity is still always available as text through the legend, the tooltip and the group headers.
- The chart's tooltip does not track touch drags. On touch, a tap selects.

- `public/app.js` (owned by UX) still passes `groupBy: S.g`, whose default is `'none'`. That gives a single "All roles" row in the clusters view. To get the department-rows default, the app should omit `groupBy` or default it to `'department'`, add a view toggle that passes `view`, and wire up `onClusterSelect`.
- In clusters, a multi-location job sits only in its first on-site location's row when grouping by location, the same as in ranges.

- UX can now delete `fitMapToPins()` in `public/app.js`, which refits through `map.leaflet`. Instead, call `map.update(jobs, { fit: true })` on company change; it defaults to that when the set of companies changes. Also call `map.invalidateSize()` when the map tab becomes visible, which runs a deferred fit.

## 7. Change log
- 2026-10-02: palette.js, chart.js, map.js, viz.css and demo.html created. Palette validated.
- 2026-10-02: Changed slot assignment from hash probing to sticky lowest-free-slot after a screenshot showed similar adjacent hues. Dark-mode bar and histogram opacity raised (.5 → .72, .42 → .62) because the bars looked muddy. Cluster footprint enlarged and recomputed when the offline state changes. Narrow-width captions shortened.
- 2026-10-02: Process docs and the replayable screenshot script added.
- 2026-10-02: Fixed REVIEW.md M3 (keyboard-activatable pins with focus kept across re-renders, plus pin aria-labels and a focus ring), L4 (listbox groups and options, `aria-selected`, salary in option names, stale `activeIdx` fixed, 3:1 active ring, Home/End/PageUp/PageDown) and L6 (reduced motion for `flyTo` and smooth scroll). Also fixed C1 (annualization note) in chart.js. Added `scripts/viz-a11y-check.mjs` and a `PORT` override in the screenshot script.
- 2026-10-02 (urgent): Switched the basemap from CARTO (now key-gated, showing "API key required" on the live site) to OSM standard tiles. Added a configurable `tiles` option and exported `OSM_TILES`. Dark mode is now a CSS filter on the tile pane only. Error-image tiles are detected with a one-off cached status probe. The screenshot script now stubs tiles (200, 403, abort) and asserts that only OSM tile URLs are requested.
- 2026-10-02: Added the clusters view as the default chart, with ranges kept as the detail view. New `onClusterSelect` callback, `clearSelection()`, and exported `VIEWS`/`DEFAULT_VIEW`. Slimmer 28px distribution strip and a notes footer. Added `slotColor()` to palette.js. demo.html has a View toggle. Iterated on the visuals: bins went from 22 to 34px minimum, a lone row gets taller, Other rows are lifted in dark mode, and rings take the band tint. Fixed the plot layer swallowing label clicks, and let the narrow-screen label line shrink the subtitle before the name. Extended the screenshot and a11y scripts.
- 2026-10-02: Robust x-axis in both chart views: `robustBounds` (P1–P99 plus a Tukey fence), padded and snapped. Out-of-range values get "›"/"‹" overflow markers with real-value tooltips and are counted in the notes. Moved the initial map fit into `map.js` `fitToData()`: about 90px padding plus pin height, minZoom lowered as needed, deferred while hidden. demo.html gained `?outlier=1`. Added outlier and mobile-fit screenshots and an overflow a11y check.
