# QA report: melon-seek end-to-end suite

Run on 2026-10-02 in the sandbox. Map tiles, Google Fonts and the live job boards
are unreachable here, so every company is served in `mode: "demo"`.

## How to run

```sh
# Playwright is not a repo dependency. Use any install that resolves (see docs/process/qa.md):
npm i playwright --no-save            # or: NODE_PATH=/path/to/node_modules
node scripts/e2e.js                    # full suite (API and Chromium UI)
node scripts/e2e.js --api-only         # no browser needed
node scripts/e2e.js --grep=salary      # run a subset by test name
```

The script spawns `node server/index.js` on a free port. It uses the Chromium
already installed under `$PLAYWRIGHT_BROWSERS_PATH` or `/opt/pw-browsers` (or
`$CHROMIUM_PATH`) and never downloads one. Requests to external hosts are
aborted so runs are deterministic. Screenshots are written to `docs/screenshots/`.
The exit code is 0 only when every test passes. `npm test` does not pick up
these files.

## Result: 22 of 25 passed, 3 failed

Three full runs in a row gave the same result once the other workstreams' files
stopped changing.

| # | Test | Result |
|---|------|--------|
| 1 | API: `/api/companies` lists anthropic, anduril, openai (fields, sources, boards) | pass |
| 2-4 | API: `/api/jobs?company=anthropic\|anduril\|openai`: every Job matches the CONTRACT shape (types, enums, salary min<=max, mid, annualized, lat/lng ranges, deduped skills, unique ids) and `mode` is set | pass |
| 5 | API: demo data is deterministic across requests | pass |
| 6 | API: custom board `?source=greenhouse&board=foo&name=Foo Corp` falls back to demo with a valid shape | pass |
| 7 | API: 404 for an unknown company, 400 for a bad source, a path-like board or missing params | pass |
| 8 | Static: `/`, leaflet js/css, 404 for missing files, no path traversal | pass |
| 9 | UI: loads with no console errors, chart is the default and shows bars, count equals the API count, demo is marked | pass |
| 10 | UI: map mode shows price pins, clicking a pin shows the area chip | pass |
| 11 | **UI: map initial fit keeps every pin inside the visible map** | **FAIL (BUG-1)** |
| 12 | UI: switching to Anduril, then OpenAI, updates the count to the API count, the hash, the pressed pill and the cards | pass |
| 13 | UI: salary min slider narrows the list, every card meets it (approx USD), count matches the API | pass |
| 14 | UI: a Skills chip narrows the list, every card's job has that skill (checked against API data), count matches | pass |
| 15 | UI: department filter (count equals facet count, all cards in that department) | pass |
| 16 | UI: location filter (count equals facet count, all cards in that city) | pass |
| 17 | UI: clicking a card opens the drawer with an Apply link (href = job.url, `_blank`, `noopener`), `job` in hash, Esc closes, no `<script>` | pass |
| 18 | UI: hash round-trip: reload keeps company, skill, department, map mode and card order; a `#job=` deep link opens the drawer; Back undoes the last change | pass |
| 19 | UI: 390x844 has no horizontal scroll (chart, map, filters open) | pass |
| 20 | **UI: 390x844 buttons keep visible text or accessible names** | **FAIL (BUG-2, BUG-3)** |
| 21 | UI: dark mode renders dark (background and text luminance) | pass |
| 22 | UI: "Add board" (greenhouse/foo) opens a custom board with demo jobs | pass |
| 23 | **UI: every company in `/api/companies` is reachable in the switcher at 1440px** | **FAIL (BUG-4)** |
| 24 | UI: keyboard: Enter on a card opens the drawer, Esc closes it and focus returns to the card | pass |
| 25 | UI: search box filters by text | pass |

Screenshots at 1440x900 (mobile at 390x844):
`docs/screenshots/chart.png`, `map.png`, `drawer.png`, `mobile.png`, `dark.png`.

## Bugs

### BUG-1 (major): the first map view clips the biggest pins
- **Owner:** `public/viz/map.js` (`fitToData()` / `update(..., {fit:true})`), possibly together with the
  `public/app.js` `renderViz()` call order (`map.update(jobs, {fit:true})` runs right after `#mapHost` is unhidden).
- **Repro:** open `/#c=anthropic&m=map` at 1440x900, or open `/` and click **Map**.
- **Expected:** after the first fit, every price pin is inside the map viewport.
- **Actual:** "San Francisco, CA + 1 nearby (69 postings, $340K)", the largest cluster, sits past the
  left edge of the map. It is drawn behind the filter column, and `elementFromPoint` at its centre
  returns `main`, so the pin cannot be clicked. "Tokyo, JP" is cut off at the right edge. You can
  see this in `docs/screenshots/map.png`.
- **Likely cause:** the fit runs before the container has its final size (it is `hidden` when the
  map is created), and `invalidateSize({pan:false})` afterwards does not refit. The 48px padding is
  also smaller than half a pin's width (pins are about 83px wide and centred on the point), so pins
  near an edge get clipped even when the fit itself is right.
- **Fix idea:** refit after the first `invalidateSize` once the container has a non-zero size, for
  example in the ResizeObserver callback while `first` is true. Use padding of at least
  `[60, 90]`, or `paddingTopLeft`/`paddingBottomRight` sized to the pin.

### BUG-2 (major on mobile): the Remote filter is blank at widths up to 1020px
- **Owner:** `public/styles.css`, around line 538 (`@media (max-width: 1020px) { .seg button span { display: none; } }`).
- **Repro:** use a 390x844 viewport, tap **Filters** and scroll to **Remote**.
- **Expected:** three buttons: Any / Remote / On-site with counts.
- **Actual:** an empty grey bar with one white knob and no labels or counts. The rule meant for
  the icon-only Chart/Map toggle in the top bar also matches the filter panel's `.seg.seg--block`,
  which `public/app.js` `makeRemote()` builds.
- **Fix idea:** narrow the selector to `.topbar .seg button span`, or exclude
  `.seg--block`.

### BUG-3 (a11y): Chart/Map toggle and Add board lose their accessible name at widths up to 1020px
- **Owner:** `public/index.html` (no `aria-label` on `button[data-mode]` or `#addBoardBtn`), `public/styles.css`
  (around lines 514, 530 and 538, where the label `<span>` gets `display:none`).
- **Repro:** use a 390x844 viewport and inspect the accessibility tree: the `button[data-mode="chart"]`,
  `button[data-mode="map"]` and `#addBoardBtn` buttons have no name. Their only text is in a span set to
  `display:none`, and their SVG is `aria-hidden`.
- **Fix idea:** add `aria-label="Chart view"`, `aria-label="Map view"` and `aria-label="Add board"` (or
  `title`), or hide the span with the `.sr-only` clip pattern instead of `display:none`.

### BUG-4 (minor UX): company pills are clipped at 1440px with no visible way to reach them
- **Owner:** `public/styles.css` (`.company-pills` overflow) and `public/app.js` `renderTopbar()`. The
  trigger is `server/companies.js`, which now registers 9 companies (Scale AI, xAI, Cohere,
  Palantir, Shield AI and Mistral AI on top of the 3 in the contract).
- **Repro:** open `/` at 1440x900. The pill strip `#companyPills` is 520px wide but its content is 965px, and the
  `#companySelect` fallback is `display:none`. xAI is half cut off, and Cohere, Palantir, Shield AI and
  Mistral AI can only be reached by scrolling the strip sideways, which nothing on screen hints at.
- **Fix idea:** show a "More ▾" overflow menu or the `<select>` when the pills overflow, or add
  edge fades and scroll buttons. Separately, the lead should decide whether docs/CONTRACT.md
  should list the extra built-ins.

### Low and informational
- **Google Fonts (`public/index.html`):** the page loads `fonts.googleapis.com`, an external runtime
  dependency that fails offline. The CSS falls back to system fonts, so nothing breaks, but it
  goes against the "zero external deps" spirit of the contract. The suite filters out these load
  errors as expected.
- **Demo Apply links (`server/demo.js`):** demo jobs set `url` to the real board index
  (`https://job-boards.greenhouse.io/anthropic`, `https://jobs.ashbyhq.com/openai`). That is not
  fabricated, but "Apply on Greenhouse" for a generated role lands on an unrelated real page. Consider
  relabelling it "Open real board" in demo mode (`public/app.js` drawer footer).
- **Drawer copy (`public/app.js` `drawerContent`):** the top-paid role reads "100% percentile ·
  Pays more than 100% of roles". That is technically true because the role excludes itself, but it reads
  oddly. Consider capping it at 99% or saying "Highest-paying role".
- **Flakiness seen during development, not a product bug:** while app.js and map.js were being
  rewritten, some early runs timed out waiting for the results header. The cause was half-written
  files. It did not reproduce in 3 consecutive full runs once the files were stable. `waitReady()`
  now reports the title, hash and card count when it times out, to make this easier to tell apart.

## Coverage notes and gaps
- Live, cache and snapshot modes are not covered end to end, because the sandbox can only produce
  demo mode. The API shape validator applies to every mode, though.
- Tile rendering is not tested (tiles are blocked by design). The tests only check that pins render
  and the map shows the offline fallback.
- Chart hover tooltips, group-by and colour-by controls, sort order, the seniority, employment and
  posted filters, the drawer's prev/next buttons and "Refresh" are not covered.
