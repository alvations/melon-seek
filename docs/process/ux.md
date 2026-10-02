# Process log: UX / frontend

## 1. Brief

Prompt: [prompts/ux.md](prompts/ux.md) (verbatim, plus a summary of the coordinator's mid-task messages).

Goal: a polished, Zillow-style search page for one company's job board. Every role is plotted on a salary chart (default) or a map, with faceted filters, a results list, and a detail drawer. State lives in the URL hash.

Files owned: `public/index.html`, `public/styles.css`, `public/app.js`, `public/favicon.svg`, `public/mock-api.js`, `public/theme-init.js` (added for the theme toggle), `docs/process/ux.md`, `docs/process/prompts/ux.md`, `docs/process/scripts/ux-screenshots.mjs`, `docs/process/scripts/ux-static-server.mjs`.

## 2. Inputs and sources

- `docs/CONTRACT.md`: Job shape, HTTP API shapes, the `createChart` / `createMap` / `palette` interfaces. app.js uses only these.
- `public/viz/palette.js` (viz agent): `colorFor`, `assignColors`, `resetColors`, `otherColor`, `SLOT_COUNT`, `formatMoney`, `toUSD`. `public/viz/chart.js`: `createChart`, `keyOf`, and later the `view: "clusters" | "ranges"` option and `onClusterSelect`. `public/viz/map.js`: `createMap`, and `update(jobs, {fit})`.
- `public/api.js` (devops agent): `getCompanies()`, `getJobs(query, {refresh, signal})`, and optionally `getJobDetail(job)`.
- `public/features/compstimate.js` and `insights.js` (product agent, see `docs/process/product.md`): `createCompstimateWidget`, `compstimateForJob`, `createInsights`. Styles come from `features/features.css`.
- `docs/QA.md` (QA agent): BUG-1 to BUG-4 plus the low items (Apply label in demo mode, "100% percentile").
- `docs/REVIEW.md` (review agent): findings M1, M4, M5, L5, L9, L10, L11 and C1 for my files, each fixed (section 3).
- Design reference: the Zillow search page (quick-filter chips over a map or list, price-tag pins, a results column, a detail overlay). Font is Inter from Google Fonts with a system-ui fallback. The sandbox blocks Google Fonts, so screenshots show the fallback.
- No skills loaded. No external code.

## 3. Decisions and rationale

1. **Static imports of viz and api.** The brief allowed guarded dynamic imports until viz existed. The viz modules landed during the work, so app.js imports them normally, as the lead asked for the final version. Before that, my scratchpad server served stub viz modules when `public/viz/*` was missing. `api.js` is a namespace import (`import * as api`), so a missing optional export such as `getJobDetail` cannot break module linking.
2. **Design tokens.** All `--ms-*` tokens are set on `:root`, with a dark set under `prefers-color-scheme: dark`. Light: bg/surface `#fff`, surface-2 `#f0f2f5`, text `#151821`, muted `#5c6474` (about 5.9:1 on white), border `#e9ebef`, accent `#0b7a5c` "rind green" (about 5.3:1 on white, usable for text). Dark: accent `#3ccf9a` on `#161a21`. The brand pink `#ec4c6c` is used only in the logo. Amber (`--ms-amber*`) is reserved for demo and mock warnings. Single accent: every interactive state, chip, salary pill and area chip uses the green accent. Data colours come only from the viz palette.
3. **Layout.** Desktop at 1200px and wider is a three-column grid: filters 292px, main fluid, results 400px (360px at 1360px and below). From 861px to 1199px, the filter column becomes a slide-over. At 860px and below, the top bar wraps into two rows, the company pills become a `<select>`, the results become a bottom sheet (118px peek, 82vh open, toggled by the handle or the header), and popovers become bottom sheets. Map mode uses the full main column: no KPI tiles and a one-line banner.
4. **Facets.** One pass per render. For each job, `failures()` returns the list of facets it fails. A job with no failures counts everywhere. A job with exactly one failure counts only for that facet's options. This gives Zillow-style counts that ignore the facet's own selection, in O(N). Keyword clouds are AND, so their counts use the fully filtered set. Options with zero count are hidden unless selected.
5. **Salary filter semantics.** A job matches when its range overlaps the selected range. Any salary bound, or "Only show jobs with salary", excludes jobs that list no pay. All comparisons use approximate USD (`toUSD` from the palette, fix M5). Display keeps the native currency (€460K–620K) and adds "≈ $501K–676K in approx USD" in the drawer. Slider step is $5K. The domain is the floor and ceiling (to $10K) of all approx-USD mins and maxes. The histogram has 26 bins (30 in the popover) of range midpoints and also ignores the salary facet itself.
6. **Components with persistent DOM.** Each filter control (salary, checklist, cloud, remote, posted, switch, board form, badge details) is built once and has a `sync()` method that updates it in place. Focus, a slider drag and a checklist search therefore survive re-renders. The same component factories are mounted in the left column and in the quick-filter popovers. Renders are coalesced with requestAnimationFrame.
7. **Hash state.** Keys: `c, cn, m, q, smin, smax, so, d*, l*, s*, e*, r, p, kr*, kf*, ks*, v, g, sort, job` (`*` means repeated). Only non-default values are written. Discrete changes use `pushState`, so Back and Forward work. Typing and slider drags use `replaceState`, with one push when the drag ends. `popstate` and `hashchange` both re-parse. Map-area and cluster selections are not shareable, so they are not in the hash.
8. **Colour consistency.** `colorBy = groupBy`, or department when ungrouped. Before rendering, app.js computes the same top keys as the chart (top 8, or top 7 plus Other) and calls `assignColors()`, which is sticky. The card dots and the checklist dots then match the chart legend. `resetColors()` runs on every company switch.
9. **Description safety.** `sanitizeHtml` parses with DOMParser, which is inert, and rebuilds only allowlisted tags (p, lists, headings, a, table, …) with no attributes. The only exception is `href` on links: it must resolve to http(s), it resolves against the posting URL (fix L11), and it gets `target=_blank rel="noopener noreferrer nofollow"`. script, style, iframe, img, form and similar tags are dropped entirely. Entity-escaped HTML is decoded once. The `h()` helper never sets `on*` attributes and routes every `href` and `src` through `safeUrl()` (fix L9). The drawer distribution SVG is built with `createElementNS`. The only `innerHTML` left in app.js is for static icon strings.
10. **Data-mode honesty.** The badge is a `<button>`. Its details open in a popover and are also exposed through `aria-describedby` (fix L5). Labels: Live (green), Cached · 12 min ago, Snapshot · Sep 30 (blue), and amber "Demo data — live board unreachable". The demo label shortens to "Demo data" below 1600px and "Demo" on phones, because the line under the top bar always carries the full message. `?mock=1` works only on localhost and is always labelled "Mock data", never "Live" (fix M1).
11. **Drawer.** Modal `role=dialog`. On open, including deep links and Back/Forward, focus moves to the close button, and `.topbar`, `.quickbar`, `#layout` and the skip link are set `inert` with `aria-hidden`. Tab is trapped, and pulled back in if focus was outside. Focus returns to the trigger, or to the job's card if the trigger was re-rendered away, or else to the list (fix M4). Esc closes it. ←/→ and j/k step through the visible list. The drawer shows: a salary block with percentile ("Pays more than 98% of roles at X"), a distribution histogram with the job's range and the median, an "Annualized from hourly/daily/weekly/monthly pay" note from `salary.originalInterval` (fix C1), locations, keyword chips that toggle filters, bullets, the sanitized description, and "Apply on Greenhouse" with the destination host shown underneath (L11).
12. **Lazy description.** If `job.descriptionHtml` is missing (static bundle), the drawer calls `getJobDetail(job)`, shows a skeleton while it loads, and on failure shows "Couldn’t load the full description. View the full posting".
13. **Calm v2 (user feedback).** The chart defaults to `v=clusters`, grouped by department. The toolbar has one small segmented control (Clusters | Ranges) and a quiet "Group: Department ▾" select. Color-by was dropped: colour follows the group. The five KPI tiles became one inline stats row ("111 roles · 86% list pay · $350K median · middle 50% $282–426K · mostly Engineering"). The demo banner became one thin muted line with an info icon and a "Details" disclosure that holds the full text, the error, and "Try the live board again". Borders are lighter (`#e9ebef`), the background is white, and the chart has no shadow. Cards are lighter: a group-colour dot instead of a stripe, seniority plus two tags, 12px meta text. `onClusterSelect(jobs, label)` narrows the list the same way as the map's `onAreaSelect`, with one dismissible chip ("AI Research & Engineering · $300K–$350K (1)") that replaces any previous selection.
14. **Map fit (QA BUG-1).** `map.update(jobs, {fit:true})` runs once per company load. `fitMapToPins()` then refits through the `map.leaflet` escape hatch, and runs again after two animation frames, because the banner, toolbar and fonts can still shift the layout. The refit pads by about half a pin (≤96px horizontally, ≤64px vertically, plus 20px on top for the pin tail). It also lowers `minZoom` when needed, down to 0.5. `getBoundsZoom` clamps to the current `minZoom`, so the refit measures with `minZoom` at 0 first. This is what lets a board spanning British Columbia to Sydney fit in a 700px column: at 1440×900 every pin is now between x = 475 and 864 inside a 315–1017 host. Mode switches call `invalidateSize()`.
15. **Sorting.** Highest pay sorts by approx-USD max descending, and Lowest pay by min ascending. Jobs without salary always sort last. The `nullsLast` comparator returns early when either side is null (regression fix: when both were null it called into `._usd.max` and render threw).
17. **Company switcher (QA BUG-4).** There are 8 or more built-in companies, so a dropdown button ("● Anthropic 638 ▾") opens a searchable list grouped by ATS (Your boards, Greenhouse, Ashby, Lever). The list supports arrow keys and Enter, marks the active board with a check, and has "Add a board…" at the bottom. Up to 3 recently opened companies are kept as pills (2 at 1360px and below, 1 at 1199px and below, none at 1020px and below); recents are saved in localStorage `melon-seek.recent.v1`. The old `<select>` fallback is gone. On phones the standalone "+" button is hidden because the menu holds Add board.
18. **Theme.** An icon button cycles System → Light → Dark; `t` is the shortcut, and `aria-label`/`title` read "Theme: Dark". The choice is stored in localStorage `melon-seek.theme` (absent means System) and applied as `<html data-theme>`. `public/theme-init.js` is a classic, render-blocking script loaded before the stylesheets, so there is no flash. It is a separate file, not the requested inline script, because the server's CSP is `script-src 'self'`, which would block an inline script. The same dark token set is written twice, under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and under `:root[data-theme="dark"]`. The dark surface hierarchy is bg `#0f1217` < surface `#161a21` < raised `#1b2028` (popovers, drawer) < surface-2 `#1e232c` < surface-3 `#282e39`. Contrast on the surface: text 14.9:1, muted 7.9:1, faint 5.4:1, accent `#3ccf9a` 9.6:1. The focus ring is stronger in dark (45% mix). On a theme change, app.js resets the viz signatures and re-renders. The palette's `onThemeChange` re-colors the chart and map, including the map's tile filter, so it follows the toggle and not only the OS. `viz/viz.css` and `features/features.css` already honor `data-theme`, so no routing was needed.
19. **Insights mode.** The view toggle is now Chart | Map | Insights (`m=insights`). Insights shows the Compstimate widget (`comp.update(allJobs)` once per fetch) above Market insights (`ins.update(filteredJobs, allJobs)` whenever the filtered set changes, keyed by a signature). `onFilter({type, value})` maps skill→`ks`, responsibility→`kr`, fit→`kf`, department→`d`, location→`l`, and "Remote" toggles `r=remote`. A toast confirms each change. In the drawer, postings without pay show "COMPSTIMATE ≈ $XK ($low–high, x confidence)" in a dashed box labelled "An estimate from N comparable roles … not a figure from the posting".
20. **Clusters wiring (final chart API).** The chart is called as `createChart(el, {onSelect, onHover, onClusterSelect})` and updated with `{view, groupBy, colorBy}`. `VIEWS` and `DEFAULT_VIEW` come from chart.js. The group default depends on the view: clusters default to `department` and ranges to `none`, and the hash omits `g` when it equals that default. Switching views keeps an explicit grouping and otherwise follows the new view's default. Dismissing a cluster chip, picking a map area, clearing filters or switching company all call `chart.clearSelection()`.
21. **Salary-domain outlier cap.** The real Anthropic data includes $4.6M "Fellows" rows. If the true max is more than 1.3× the 99th percentile, the slider and histogram domain is capped at P99 × 1.15. The max thumb at the cap means "no upper bound", so outliers still match. The drawer distribution widens its own domain to include the open job.
22. **Drawer details.** The top-paid role shows "Top · paid here" and "Top-paid role at X" instead of "100%". In demo mode, Apply reads "Open the real Greenhouse board", because demo jobs link to the real board index. Bullets that arrive lazily through `getJobDetail` re-render in place (`renderBullets`).
23. **Remaining small fixes.** `.seg button span{display:none}` is scoped to `.topbar` (QA BUG-2: the Remote filter labels had disappeared). The view buttons and Add board have `aria-label`s (BUG-3). `nn()` filters null children before `replaceChildren`, which would otherwise render them as the text "null" (seen in the popover footer and the results title).
24. **Mock API** (`public/mock-api.js`). A seeded PRNG generates contract-shaped jobs: Anthropic 142, OpenAI 900 for scale testing, Anduril about 110. The cities include lat/lng, there are remote-only roles, GBP and EUR salaries, keywords and sections. Modes per company exercise every badge state. The list omits `descriptionHtml` and `getJobDetail()` supplies it (Intern roles fail on purpose to exercise the error path). Descriptions include `<script>` and `onerror` / `onclick` payloads to prove sanitization.

## 4. Replayable steps

```bash
SP=/tmp/<scratch>                       # any scratch dir outside the repo
cd $SP && npm init -y >/dev/null && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core@1.56
# Chromium is preinstalled: /opt/pw-browsers/chromium-1194/chrome-linux/chrome (never `playwright install`)

# A) before the backend existed: static server plus mock data
REPO=/home/user/melon-seek STUB_DIR=$SP/viz-stub PORT=5180 node /home/user/melon-seek/docs/process/scripts/ux-static-server.mjs &
PW_DIR=$SP OUT=$SP/shots node /home/user/melon-seek/docs/process/scripts/ux-screenshots.mjs     # uses ?mock=1

# B) against the real server (demo mode in the sandbox; upstream returns 403)
cd /home/user/melon-seek && PORT=5198 node server/index.js &
BASE=http://localhost:5198 QS= PW_DIR=$SP OUT=$SP/shots-real node docs/process/scripts/ux-screenshots.mjs
```

The screenshot script prints JSON with `checks` and `errors`. It exits non-zero if any page error or console error occurs (tile errors are ignored). Syntax check: `node --check public/app.js public/mock-api.js`.

## 5. Verification

Final run (both A and B): `errors: []`, exit 0. Checks:

| Check | Result |
|---|---|
| All four sorts render cards | pass |
| Jobs with no salary render and sort last (142 jobs, 29 without salary, mock; 111 and 15, server) | pass |
| Deep link `#…&job=<id>`: focus inside the drawer, background `inert` | pass |
| Focus trap (Tab, Shift+Tab ×2) stays in the drawer | pass |
| Esc closes the drawer and focus returns to a real element | pass |
| `/` focuses search | pass |
| Description: lazy load via `getJobDetail` (mock), sanitized, `window.__pwned` never set | pass |
| Back after closing the drawer restores the `job=` hash | pass |
| Scale: 900-job board loads in about 1.3s including 250-500ms of mock latency; keyword toggle to painted frame takes 63ms | pass |
| Cluster bin click shows the chip "AI Research & Engineering · $0–$500K (28)"; list shows "28 roles"; dismissing the chip clears the chip and the chart selection | pass |
| View toggle hash: Ranges → `#c=anthropic&v=ranges` (no `g`), Clusters → `#c=anthropic` | pass |
| Theme cycle with `t`: light → dark → system, aria-label follows | pass |
| Insights mode renders the Compstimate widget and the insights panel | pass |
| Company menu: 8 companies grouped by ATS; typing "open" + Enter switches to OpenAI; Anthropic becomes a recent pill (desktop and mobile) | pass (`$SP/menu-check.mjs`) |
| Map first view at 1440×900: zoom 1, all pins within the host | pass (`$SP/mapdbg.mjs`) |
| Real server scale (snapshot data): Anthropic 638 roles, OpenAI 833 roles; OpenAI loads in 1.5s and a keyword toggle paints in 118ms | pass |

Screenshots: 1440×900 and 390×844 @2x, in `$SP/shots/` (mock) and `$SP/shots-real/` (server): `desktop-chart` (clusters), `desktop-ranges`, `desktop-banner-open`, `desktop-popover-salary`, `desktop-drawer`, `desktop-drawer-compstimate`, `desktop-insights`, `desktop-map`, `desktop-demo`, `desktop-empty`, `desktop-dark`, `desktop-dark-drawer`, `desktop-company-menu`, `mobile-company-menu`, `theme-{system,light,dark}-{chart,map,drawer}`, `theme-dark-mobile`, `mobile-chart`, `mobile-sheet`, `mobile-filters`, `mobile-map`, `desktop-cluster-selected`. I read each one and iterated: truncated KPI values, the results title wrapping, mobile top-bar wrapping, dark-mode near-black company dots, the global SVG icon rule leaking into viz SVGs, and the chart padding hidden under the mobile sheet were all fixed.

## 6. Known gaps and follow-ups

- **Map fit is handled from app.js** through `map.leaflet` (decision 14). It would be cleaner inside `viz/map.js` `fitToData()`: padding of at least half a pin, and a `minZoom` measured without the clamp.
- **Chart axis outliers (viz/backend).** The $4.6M Anthropic Fellows rows stretch the clusters and ranges x-axis to $4.5M, which compresses every other row into the left eighth. Either `server/salary.js` should catch the mis-annualization, or `viz/chart.js` should cap its axis domain the way the slider now does (decision 21).
- **Cluster row labels (viz).** Earlier, `.ms-crow__plot` covered `.ms-crow__label`, so row-label clicks did not register. Bins work. I have not rechecked the label against the final chart.js.
- Google Fonts is still an external stylesheet. It fails silently offline and the CSS falls back to system fonts.
- The OG/social meta tags another agent is adding to `<head>` are not touched by any of my edits.
- `api.getJobDetail` was not yet in `public/api.js` at the time of writing. app.js uses it when present and otherwise renders the description from the list payload (or hides that section).
- Inter is not loaded in the sandbox, so screenshots use the fallback font.
- No automated tests for app.js internals (DOM-heavy). Coverage is the Playwright checks above.

## 7. Change log

- 05:20 Read the contract. Scratchpad static server, viz stubs, playwright-core 1.56.
- 05:25 First full build: index.html, styles.css, app.js, mock-api.js, favicon.svg. First screenshots.
- 05:30 Coordinator: process docs requested. Saved `ux-screenshots.mjs`.
- 05:31 GitHub Pages: all URLs relative (`favicon.svg`, `vendor/leaflet/*`, `viz/viz.css`, `styles.css`, `./app.js`). All data goes through `./api.js` (`getCompanies`/`getJobs`). mock-api.js exposes the same interface.
- 05:32 Viz notes: `resetColors()` on company switch, `assignColors()` so card and filter dots match the chart, `map.update(jobs,{fit:true})` on company load, `invalidateSize()` on mode switch, fixed-height chart host. `deptKey` now uses `keyOf(job,'department')`.
- 05:34 Fixed the global icon `svg{…}` rule leaking into viz SVGs. KPI and results-title truncation fixed. Mobile top bar fixed. Sort labels shortened to "Highest pay", "Lowest pay", "Newest", "Title A–Z".
- 05:36 Review fixes: M1 (mock localhost-only and labelled Mock), M4 (drawer focus, inert background, trap, return focus), M5 (approx-USD filtering, domain, percentile, sort), L5 (badge button and details popover), L9 (no `on*` attributes or unvetted href/src in `h()`, DOM-built SVG), L10 (saved-board shape validation), L11 (Apply shows host, description links resolve against the posting URL), C1 (`originalInterval` note with correct adjectives).
- 05:38 Lead bugs: map refit after layout settles, full-height map mode (no KPIs, one-line banner), company pills no longer shrink (search shrinks, add-board text hides at 1360px and below, badge label shortens below 1600px), "Middle 50%" uses the `$282–426K` format.
- 05:39 Regression fix: `nullsLast` comparator threw when both jobs lacked salary, so the page stuck on "Loading roles…". Added no-salary and per-sort checks to the screenshot script.
- 05:41 Real-server run (demo mode): all checks pass. Mobile banner compacted. Dark-mode ring on company dots.
- 05:46 Calm v2: Clusters | Ranges control plus quiet Group select (`v` in hash, default clusters/department), Color-by removed, inline stats row instead of KPI tiles, thin banner with disclosure, lighter borders and cards, single accent, `onClusterSelect` chip.
- 05:50 Lazy description via `getJobDetail(job)` with skeleton and failure link. Mock OpenAI is now 900 jobs. Scale and description checks added to the script. Final runs A and B are green.
- ~06:00 Insights mode (`m=insights`): Compstimate widget plus Market insights, `onFilter` mapped to filters, `features/features.css` linked. Drawer Compstimate for postings without pay.
- ~06:05 QA fixes: BUG-1 map fit (`fitMapToPins`, unclamped `getBoundsZoom`, half-pin padding), BUG-2 `.topbar`-scoped label hiding, BUG-3 aria-labels, BUG-4 searchable company menu grouped by ATS plus recent pills. Top-paid copy and demo Apply label changed. Lazy bullets re-render.
- ~06:10 Dark mode toggle: System/Light/Dark, `t` shortcut, `theme-init.js` (CSP-safe, no flash), duplicated dark token blocks for media and `data-theme`, raised surface token, theme screenshots in all three modes.
- ~06:15 Salary-domain outlier cap (P99). `nn()` helper fixes the stray "null" text nodes.
- ~06:20 Final chart API: `VIEWS`/`DEFAULT_VIEW`, per-view group default (clusters→department, ranges→none), `clearSelection()` on chip dismiss, area replace, clear-all and company switch. Cluster, view-hash, theme and insights checks added to `ux-screenshots.mjs`. Final mock and real runs: exit 0, `errors: []`.
