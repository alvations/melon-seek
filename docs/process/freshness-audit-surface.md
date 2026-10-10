# Process log: freshness-audit-surface

## 1. Brief

Prompt: [prompts/freshness-audit-surface.md](prompts/freshness-audit-surface.md) (written by the freshness lead).

Inventory auditor #2 for the data-freshness work. Scope: `public/*` (UI, viz, features, demo and mock data, OG and share), `README.md`, `docs/**`, and the tests' expected values. The job is to list every number, rate, threshold, constant, dataset, comparison and number-bearing UI string that users see or docs cite, where each comes from, and how it can be refreshed. This includes every job, company and cross-level number (user follow-up).

Files owned:
- this log;
- the prompt file;
- the hand-off `scratchpad/freshness/registry-audit-surface.json` (114 registry entries);
- the two patches in §8.

Everything else was read-only. Nothing was committed or pushed, and no probe was run: this role needed no external source.

## 2. Inputs and sources

- **Read in full:**
  - `docs/process/prompts/freshness-lead.md`, `docs/CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/LIVABILITY.md` (all 696 lines), `docs/DATA_FRESHNESS.md`, `docs/process/TEMPLATE.md`;
  - `public/viz/palette.js`, `public/features/{compstimate,roles,shared,insights,comps,demo-data}.js`, `public/mock-api.js`, `public/og/card.html`;
  - `scripts/methodology.js`, `test/fx-consistency.test.js`, `test/golden-normalize.test.js`.
- **Read by section (grep for numerics, then the surrounding code):**
  - `public/app.js` (2,922 lines: constants, `prepare`, `failures`, `derive`, `salaryDomain`, `stats`, the badge, Posted, Juice chips, KPIs, cards, `ageText`, `statusTag`, percentile, distribution, `juiceBlock`, `payLabels`, `compstimateBlock`, the drawer, `listingSection`, `sameRoleSection`);
  - `public/viz/{chart,map,comps}.js`, `public/api.js`, `public/index.html`, `public/viz/demo.html`, `public/features/demo.html`;
  - `scripts/build-static.js` (share pages, backtest, outputs), `scripts/build-market.js`, `scripts/build-og.mjs`;
  - `README.md`, `docs/{DATA_SOURCES,VETTING,QA,REVIEW,ADDING_A_BOARD}.md`, `docs/strategy/*.md`;
  - the tests: `juice`, `juice-household`, `og`, `market`, `static-build`, `features`, `demo`, `server`, `salary`, `vet-gate`, `beta-build`, `e2e/*`.
- **PNG:** `public/og/melon-seek-og.png`, read as an image. Every figure on it matches `card.html`.
- **Working-tree state of other agents, read only:** `server/juice.js`, which the tax agent was editing during the audit (see §6); `server/companies.js`, `server/geo.js`, `server/history.js`, `server/index.js`; `scripts/refresh/{fx,lib,run}.js`; `public/features/freshness.js` (new, freshness-derived); `scripts/archive/*`.
- **Local data:** `data/cities.json` (89 cities, 33 countries), and `data/snapshots/*.json` (8 stable boards, fetched 2026-10-02T05:54Z, 5,413 jobs, gitignored).
- **Lead messages:**
  - the registry-id list, which I used verbatim;
  - fx.js rewrites the palette, juice and salary tables and shared.js CNY, but not demo.js;
  - three new ids accepted: `ui-stat-thresholds`, `docs-screenshots`, `strategy-market-figures`;
  - the lead is adding `test/freshness-policy.test.js` (finding 2).

No external URL was fetched. Every figure here comes from the repo, or from recomputing it with the repo's own code.

## 3. Decisions and rationale

1. **Registry ids:** exactly the lead's list, plus the three ids above. Where an id belongs to another auditor (`fx-per-usd`, `demo-data`, `ops-constants`, `cities-dataset`, the `tax-*` ids, ...), my entry is a *surface contribution*: the public, docs and test owners and consumers for the lead to union with the code-side entry. Each such entry says so in `description` or `notes`.
2. **Tax:** one entry per `TAX_SOURCES` key, generated from the live module, so the ids track the tax agent's keys. That gives 71 today; the lead counted 69, and ES-MD and ES-CT are new. Each entry carries:
   - only the surface consumers: its LIVABILITY.md §3 row, the drawer Tax line, worked-example rows and golden tests;
   - the doc-row status (equal / differs / no row).
3. **`file:line` resolved by search:** the hand-off is built by `scratchpad/freshness/audit-surface/build-registry.mjs`. It resolves every reference with a string or regex anchor against the working tree and fails if an anchor is missing. Other agents keep moving lines, so re-running it refreshes the numbers. The run that produced the hand-off had 0 missing anchors.
4. **Classification of numeric literals:**
   - UI layout (px, ms, SVG geometry, colours, ids) is not listed.
   - Data, product-policy and copy numbers are listed.
   - The OG card is listed as `product-policy`: its numbers are illustrative by design, and its header says so.
5. **Tests:** an *intentional golden vector* is a pin that must change only with a verified rule change: tax, score anchors, grades, the living scale, ladders, lexicons and vetting bounds. An *incidental pin* is a value that is only true for today's data. Relational assertions are neither and are noted as robust.
6. **"Level multipliers":** Compstimate has no pay multiplier by level. `LEVEL_INDEX` is a ladder position, and `senioritySim` turns ladder distance into a similarity weight (1 / 0.55 / 0.35 / 0.2 / 0.1 / 0.03). The only pay-by-level multipliers in the repo are synthetic: `public/mock-api.js` SENIORITY, `public/features/demo-data.js` LEVELS, `server/demo.js`. The entries record both kinds.

## 4. Replayable steps

```sh
# raw hit counts (§5.1) and per-file numeric-literal counts
rg -o -e '\b[0-9][0-9_,.]*\b' public -g '*.js' -g '*.html' -c
node scratchpad/freshness/audit-surface/classify.mjs        # heuristic ui / data / other split per file
# FX copies side by side (palette, juice, cities.json, salary.js)
node --input-type=module -e "import {FX_PER_USD as P} from './public/viz/palette.js'; ..."   # see §5.3
# recompute every LIVABILITY.md worked-example row with the current code
node scratchpad/freshness/audit-surface/check-examples.mjs
# share-page numbers from the local snapshots
node --input-type=module -e "... shareStats over data/snapshots ..."   # §5.3
# build the hand-off and the appendix
node scratchpad/freshness/audit-surface/build-registry.mjs   # -> scratchpad/freshness/registry-audit-surface.json
node scratchpad/freshness/audit-surface/appendix.mjs > appendix.md
# patches: written from an edited scratch copy (scratchpad/freshness/audit-surface/tree), then
git apply --check docs/process/patches/freshness-audit-surface-*.diff
```

## 5. Inventory

### 5.1 Raw grep hit counts (2026-10-10, working tree)

The numeric literals counted are matches of `\b[0-9][0-9_,.]*\b` in public JS and HTML:

| Measure | Count |
|---|---:|
| All matches | 3,401 |
| Excluding single digits | 1,686 |

Heuristic split per line (`classify.mjs`): **729 UI layout** (px, SVG, colours, timers), **519 data or policy**, **390 other** (indices, regexes, PRNG constants). Every "data" and "other" line was reviewed by reading the files. The biggest files:

| File | Matches |
|---|---:|
| `app.js` | 767 |
| `og/card.html` | 506 (mostly SVG geometry) |
| `viz/chart.js` | 385 |
| `mock-api.js` | 256 |
| `features/compstimate.js` | 255 |
| `viz/demo.html` | 222 |
| `viz/palette.js` | 160 |
| `features/demo-data.js` | 153 |
| `viz/map.js` | 124 |
| `features/shared.js` | 104 |
| `index.html` | 84 |
| `viz/comps.js` | 82 |
| `features/insights.js` | 78 |
| `features/freshness.js` | 54 (new) |
| `api.js` | 49 |
| `features/roles.js` | 46 |
| `features/comps.js` | 42 |
| `features/demo.html` | 33 |
| `unpack-worker.js` | 1 |

Pattern hits (`rg -o`):

| pattern | public js/html | README | docs (excl. process) | docs/process | tests |
|---|---:|---:|---:|---:|---:|
| `asOf` | 29 | 0 | 7 | 33 | 33 |
| `as of` | 17 | 0 | 6 | 19 | 0 |
| years 2023–2027 | 32 | 1 | 314 | 368 | 224 |
| `$ € £ ¥ ₩ ₹ CHF` | 1,055 | 4 | 636 | 727 | 1,447 |
| `%` | 87 | 1 | 315 | 407 | 115 |
| `/yr` | 7 | 0 | 10 | 35 | 2 |
| `K/yr` | 0 | 0 | 4 | 24 | 0 |
| `per year` | 4 | 0 | 6 | 4 | 19 |
| `perUSD`/`PER_USD` | 4 | 0 | 6 | 22 | 21 |
| `LEVEL` | 13 | 0 | 0 | 23 | 11 |
| `multiplier` | 0 | 0 | 1 | 22 | 0 |
| `minN`/`MIN_N` | 7 | 0 | 0 | 10 | 7 |
| `p25` | 41 | 0 | 0 | 20 | 6 |
| `median` | 213 | 1 | 47 | 150 | 53 |
| `p75` | 38 | 0 | 0 | 20 | 6 |
| `backtest` | 16 | 2 | 15 | 85 | 29 |
| `MAPE`/`medianAbsPctError` | 11 | 0 | 4 | 9 | 24 |
| `error` | 139 | 7 | 69 | 222 | 345 |

(`$` in public JS is dominated by template literals; the money figures are in the tables below.)

### 5.2 Hand-off totals

`registry-audit-surface.json`: **114 entries, 581 consumer references.**

| | Count |
|---|---|
| By type | static-constant-from-a-source 73 (71 tax), product-policy 15, derived-at-build 12, static-data 8, fetched 6 |
| By cadence | yearly 79, quarterly 11, ad-hoc 10, daily 9, monthly 5 |
| By mode | detect 72, manual 28, auto 14 |

Consumer references by surface:

| Surface | References |
|---|---:|
| methodology page | 172 |
| drawer Juice block | 89 (incl. drawer pay/listing sections) |
| badge (cards, stats line, filters) | 87 |
| tests | 87 |
| map | 77 |
| docs | 16 |
| API (mock, demo, api.js) | 15 |
| Compstimate | 11 |
| README | 11 |
| chart | 9 |
| Insights | 5 |
| Same role elsewhere | 5 |
| Compare | 4 |
| OG image | 4 |

Ids:

- **Ids from the lead's list:**
  - reference data: fx-per-usd, bigmac-prices;
  - Juice: juice-score-anchors, juice-grades, households, living-scale, nyc-basket, rents-1br-quoted, rents-bedroom-ratios, rents-nsw-official, cost-index, juice-confidence-rules;
  - derived docs and pages: juice-worked-examples, juice-calibration-doc, methodology-page, readme-counts, docs-counts, og-card, share-pages, e2e-pinned-values;
  - jobs and companies: job-postings, job-salary-parsed, job-salary-usd, salary-interval-factors, salary-vetting-bounds, salary-vetting-flags, company-registry, company-aggregates, market-comps;
  - comparisons: compstimate-model, compstimate-backtest, seniority-ladder, role-families, keyword-lexicons, listing-freshness-buckets, history-ledger;
  - reference: geo-gazetteer, country-currency, demo-data, ops-constants;
  - tax: 71 tax-* ids.
- **New ids, accepted by the lead:** ui-stat-thresholds, docs-screenshots, strategy-market-figures.

### 5.3 Item-level inventory by surface

The columns are: value(s) | defined at | shown where | source and as-of | real change rate | type | update before → target. Appendix A lists every `file:line`.

#### A. FX and currency in the UI

| Item | Value | Defined | Shown | Source, as-of | Changes | Type | Before → target |
|---|---|---|---|---|---|---|---|
| FX_PER_USD / FX_TO_USD (browser) | 22 currencies + USD (GBP 0.74187, EUR 0.87439, JPY 162.135, INR 96.26375, KRW 1485.9 …) | `palette.js:129`, `:156` | every "approx USD": chart bars and tooltip, map pins, list `_usd` (filter, sort, stats, percentile, distribution), Insights, Compstimate, market cells | Big Mac `dollar_ex`, 2026-07-01 | daily (published monthly) | fetched | hand copy → `scripts/refresh/fx.js` (auto, ECB monthly) |
| FX_AS_OF | `'2026-07-01'` | `palette.js:128` | **nowhere in the UI**; only via `market.fx.asOf` in the Compare footer | same | with FX | fetched | → fx.js rewrites it |
| FX_FALLBACK CNY | 0.14 USD/CNY | `shared.js:18` | Compstimate and Insights for CNY postings | salary.js copy | monthly | fetched | none → fx.js (rewriteSharedFallback) |
| demo FXD | GBP 1.348, EUR 1.144, CHF 1.239, JPY 0.006168, SGD 0.7752, CAD 0.7117, AUD 0.6999 | `viz/demo.html:133` | dev demo page only (not in dist) | hand-rounded palette | n/a | demo | none → leave (dev only) or import the palette |
| mock and demo FX | GBP 1.27, EUR 1.09, (CHF 1.13) | `mock-api.js:38`, `demo-data.js:96`, `:129` | ?mock=1, features demo page, features tests | stale guess (−6% to −9% vs the palette) | n/a | demo | none → patch §8 (import the palette) |
| chart FX footnote | "(GBP, EUR, CAD, AUD, JPY, SGD, CHF)" | `chart.js:332` | chart foot tooltip | stale copy (22 in the table) | n/a | UI copy | none → patch §8 (list from FX_PER_USD + as-of) |
| currency symbols | 13 in SYMBOLS, 9 in CUR_SYM | `palette.js:111`, `app.js:90` | money everywhere | ISO 4217 | ad hoc | static | none (two tables disagree on KRW, ILS, NZD, HKD) |

Verified 2026-10-10: palette = `server/juice.js` = `data/cities.json` `fx.perUSD` for all 23 codes. `server/salary.js` `USD_PER` adds CNY, QAR and ZAR.

#### B. Juice Score in the UI and on the methodology page

| Item | Value | Defined | Shown | Source, as-of | Changes | Type | Before → target |
|---|---|---|---|---|---|---|---|
| Score curve mirror | K 80,000, fullGlass $423,866 | `palette.js:237` (fallback of server SCORE_ANCHORS) | map Juice legend $ (fallback only), badges via server/juice.js | our tuning, 2026-10-02 | yearly review | policy | none → manual + lead's `test/freshness-policy.test.js` |
| Stale palette comment | "A = $10K, B = $250K" | `palette.js:253` | none (comment) | old log curve | — | — | fix the comment with the next edit |
| Grade breaks | 45 / 70 | `palette.js:232`; copy `app.js:1323-1327` ("70+", "45–69", "under 45"); `gradeKey` Rind→Dry `app.js:364` | map legend and pins, Juice filter chips | policy | yearly | policy | none → lead's policy test |
| Mock score | old log curve, ln 26 | `mock-api.js:47` | ?mock=1 | stale | — | demo | none → patch §8 |
| Households | 1 / 2 / 3 bedrooms; "two adults and two children" | `app.js:2065-2070` (copy of server HOUSEHOLDS) | drawer household switch, rent and living lines | policy | ad hoc | policy | none → manual |
| Juice waterfall lines | Gross, Tax (income · regional · social), Rent (N-bedroom, centre/outside), Living costs, Juice left; /mo = /yr ÷ 12; "Rent takes N% of take-home pay" | `app.js:2154-2178` | drawer Juice block | computeJuice | with inputs | derived | **no as-of on any line** (see §6.1) |
| Juice badge | "🍉 ≈score · grade"; "Best in X: $N/yr left" | `app.js:1870-1876` | cards | computeJuice | with inputs | derived | no as-of |
| Juice coverage note | "N of M roles have a Juice Score" | `app.js:1346` | filter panel | derived | daily | derived | — |
| Map Juice tooltip | "median $N/yr left after rent, tax and living costs" | `map.js:362-367` | map | derived | daily | derived | no as-of |
| LIVABILITY §1 constants | NYC basket $19,982; scale 1 · 1.72 · 2.41; K $80,000 | `LIVABILITY.md:27-30` | methodology page | Numbeo 2026-09; DWP | quarterly / yearly | static | hand-written → derived check |
| BLS / MIT cross-check table | 1.80 / 2.33 / 2.41; $27,388 / $49,272 / $63,724; MIT 1.65 / 2.40, 1.72 / 2.38 | `LIVABILITY.md:73-80` | methodology page | BLS CE 2024 (read 2026-10-10), MIT | yearly | static | hand-written → manual yearly |
| Confidence counts | US medium 30 / low 10; non-US low 49 | `LIVABILITY.md:110-111` | methodology page | computed | per data change | derived | hand-written → derived (recomputed 2026-10-10: equal) |
| Score table and legend points | ≥ $96,318 Juicy, ≥ $47,827 Ripe; 25 = $23,015 … 99 = $368,414 | `LIVABILITY.md:128-136` | methodology page | netForScore | with K | policy | hand-written (verified equal) → derived |
| Calibration | 5,413 jobs, 4,551 salaried, 4,034 with juice; percentile table; grade shares 46 / 39 / 14 / 1% | `LIVABILITY.md:145-166`; test pins `juice.test.js` Q | methodology page, tests | snapshots 2026-10-02 | quarterly | derived | manual script (needs snapshots) |
| Worked examples | 8-row table + 24 household rows (SF $675K etc.) | `LIVABILITY.md:168-213` | methodology page | code + data | monthly | derived | **hand-pasted** ("generated from the code", no generator committed) → `scripts/refresh/examples.js` |
| §3 tax table | 69 rows, one per TAX_SOURCES key (71 keys now) | `LIVABILITY.md:297-365` | methodology page | TAX_SOURCES | yearly | static-constant | hand-written copy → generate or check (Appendix B) |
| §4 sources table | Big Mac 2026-07-01; Numbeo 2026-05..10 (64 of 89 = 2026-09); HUD FY2026; ONS Aug 2026; NSW Jun Q 2026; pooled 1.281 / 1.533 | `LIVABILITY.md:396-410` | methodology page | various | monthly to yearly | static | hand-written |
| Cost-index checks | SF 91.0 vs 90.32, London 86.3 vs 85.9, Columbus 73.2, Zurich 111.7 vs 118.5–123.1 | `LIVABILITY.md:420-426` | methodology page | Numbeo | quarterly | static | hand-written |
| §4.2 ratios | HUD 1.10–1.26 / 1.31–1.65, SF 1.21 / 1.55, London 1.27 / 1.50, … Paris 1.48 / 2.16 | `LIVABILITY.md:451-474` | methodology page | official | yearly | static-constant | hand-written (col agent's script) |
| 1-bed audit table | 15 cities (SF $3,679 vs HUD $3,025 …) | `LIVABILITY.md:481-496` | methodology page | 2026-10-10 audit | yearly | static | hand-written |
| Estimates | 9 metro proxies, Boulder × 0.993, Hyderabad × 0.839 | `LIVABILITY.md:555-562` | methodology page | Numbeo | quarterly | static | hand-written |
| §7 plan | 267 + 1 Numbeo figures; coverage 44 / 13 / 17 / 15; effort 4–5 / 10–14 days | `LIVABILITY.md:636-696` | methodology page | plan, 2026-10-10 | ad hoc | docs | none |

#### C. Job and company numbers

| Item | Value or formula | Defined | Shown | Changes | Type | Mechanism |
|---|---|---|---|---|---|---|
| Company count in topbar | `data.jobs.length` | `app.js:691` | company menu | daily | fetched | daily pipeline |
| Stats line | "N roles · X% list pay · median $ · middle 50% $p25–p75 · mostly <dept> (k roles, y%)" | `app.js:1537-1560` (`stats` `:537`) | above the list | daily | derived | per load; **no as-of** (only the badge date) |
| Data badge | "Live", "Cached · N min ago", "Snapshot · Oct 2", "Demo data"; details: Fetched date, Roles | `app.js:735-781` | topbar | daily | fetched | the one job-data as-of in the UI |
| Card pay pill | native range, "Pay unclear", "No salary" | `app.js:1913-1916` | cards | daily | fetched | — |
| Card age | Nd < 60 d; months (÷ 30.44) < 730 d; years; "+" = lower bound | `app.js:1890-1895` | cards | daily | derived | — |
| Card status tag | "Pay ↑/↓" (job.payChange: **no producer**), "New" (firstSeenAt > last visit), "Reposted" | `app.js:1902-1907` | cards | daily | ledger | see finding 5 |
| Drawer pay block | native range + "USD · per year", "Annualized from hourly pay", percentile "Pays more than X% of roles at <Co>" / "Top-paid role" | `app.js:2311-2322` | drawer | daily | derived | — |
| Pay distribution | 32-bin histogram of company mids, this job's range, median | `app.js:2024-2070` | drawer | daily | derived | — |
| Pay labels | Multiple pay zones (zones > 1), Wide range (spread ≥ 2.0×), Single figure, + equity / + bonus mentioned | `app.js:2208-2222` | drawer | policy | policy | ui-stat-thresholds |
| Pay unclear | salaryFlag.reason + "As parsed" | `app.js:2194-2206` | drawer | daily | fetched (vet gate) | — |
| Listing section | "Listed N days ago (date)", "First seen by melon-seek on <date>", "Reposted N× since <Mon YYYY>", "Open 180+ days" | `app.js:2373-2390` | drawer | daily | ledger | dated by construction |
| Listed filter | 7 / 30 / 90 days, hide 180+, counts | `app.js:1258-1290`, `:433`, `:486-487` | filter panel | policy | policy | listing-freshness-buckets |
| Salary slider domain | P99 cap (hi > P99 × 1.3 → P99 × 1.15 when ≥ 20 jobs), $10K rounding, 26 / 30-bin histogram | `app.js:495-511`, `:1153` | filter | daily | derived + policy | — |
| Chart | P1–P99 + 3·IQR fence; ticks $50K / $100K / $250K (span > $300K / > $1.5M); bins $10K–$500K, min 34 / 46 px; "N roles · median $X"; P25–P75 band | `chart.js:35`, `:96-112`, `:404-415`, `:439-462` | chart | daily | derived | — |
| Map pins | "$median · count" per 0.1° cluster; Juice mode "🍉 score" | `map.js:74`, `:86-92`, `:388-412` | map | daily | derived | — |
| Insights tiles | Median base pay; Middle 50%; Pay published %; Remote-eligible % | `insights.js:326-338` | Insights | daily | derived | no as-of |
| Skill premium | median with skill − median of view; top 12 with n ≥ 3 | `insights.js:58-82`, `:208-236` | Insights | daily | derived | — |
| Pay by department | P10 / P25 / median / P75 / P90 boxes; ≥ 3 roles; top 10; axis P2–P98 | `insights.js:89-104`, `:239-274` | Insights | daily | derived | — |
| Hot locations | top 8 by count, median | `insights.js:111-129`, `:277-293` | Insights | daily | derived | — |
| Fit / responsibilities | share of roles, premium with n ≥ 3; top 8 / 10 | `insights.js:137-166`, `:296-324` | Insights | daily | derived | — |
| Share pages | "<Co> jobs by salary · N roles · median $X"; "M of N roles list pay …, <date>" | `build-static.js:433-490` | OG previews | daily | derived | daily build; dated |
| Snapshot facts (local) | anduril 2,418 (2,277 with pay, median $170K), anthropic 638 (558, $352.5K), openai 833 (674, $307.5K), shieldai 581, palantir 320, xai 297, scaleai 194, cohere 132 = **5,413** | data/snapshots, 2026-10-02 | README, QA, strategy, LIVABILITY | daily | fetched | — |

#### D. Comparisons across companies and levels

| Item | Value | Defined | Shown | Changes | Type | Mechanism, notes |
|---|---|---|---|---|---|---|
| Market cells | [company, family, seniority or *, n ≥ 3, p25, median, p75] at $100, USD at the palette FX | `scripts/build-market.js` MIN_N 3 | Same role elsewhere (`app.js:2426-2457`, `viz/comps.js`), Compare (`features/comps.js:125-230`) | daily | derived | daily build. **No generatedAt shown**; Compare shows "FX as of" only |
| compsForJob fallback | family + seniority, else family across levels ("No other company lists this level …") | `features/comps.js:72-87` | Same role elsewhere | policy | policy | — |
| Compare default family | most common family covered by ≥ 2 companies | `features/comps.js:103-114` | Compare | policy | policy | — |
| minN copy | "No company has 3+ salaried postings …"; footer "companies need 3+" (fallback 3) | `features/comps.js:172`, `:207` | Compare | policy | policy | reads market.minN |
| LEVEL_INDEX | Intern 0, Entry 1, Mid 2, Senior 3, **Manager 3.5**, Staff+ 4, Director+ 5 | `compstimate.js:34` | Compstimate weights | policy | policy | manual review |
| senioritySim | 1 / 0.55 / 0.35 / 0.2 / 0.1 / 0.03; no level asked: Intern 0.25, Director+ 0.5 | `compstimate.js:41-48` | Compstimate | policy | policy | manual |
| Other similarity | dept 1 / 0.7 / 0.5; location 1 / 0.75 / 0.6 / 0.4 / 0.3 / 0.25; token 0.7 / 0.3; title 0.7 token + 0.3 family; FAMILY_AFFINITY 24 pairs, unknown 0.35 | `compstimate.js:50-158`, `roles.js:281-295` | Compstimate | policy | policy | manual |
| Selection and range | MIN_WEIGHT 0.02, REL_WEIGHT 0.12, MAX 500, P15–P85 of bands (0.25 / 0.5 / 0.25), weighted-median mid, $1K rounding | `compstimate.js:160-226` | Compstimate hero, Low / High | policy | policy | manual |
| Confidence | High: nEff ≥ 5, topSim ≥ 0.5, spread ≤ 0.6; Medium: ≥ 2, ≥ 0.25, ≤ 1; no title → Low; board error > 25% → Low | `compstimate.js:232-235`, `:298`, `:387-404` | Compstimate | policy | policy | manual |
| MIN_COMPARABLES | 3 | `compstimate.js:530` | Compstimate (no figure below 3) | policy | policy | — |
| Typical range | P5–P95 of the pool | `compstimate.js:716` | Compstimate scale | daily | derived | — |
| Backtest | seed 20261002, maxN 500, dedupe 'title' (default) vs **'role'** (server BACKTEST_OPTS) vs fallback (no dedupe) | `compstimate.js:296-376`, `server/index.js:313`, `build-static.js:115` | "Typically within ±X% (tested on N listed salaries)", floor ±1%, "missed by more than 25%" | daily | derived | daily build; **computedAt never shown**; finding 4 |
| Seniority ladder | Intern, Entry, Mid, Senior, Staff+, Manager, Director+ (+ Unspecified) | `roles.js:301`; copies `chart.js:38`, `app.js:68` | filters, chart grouping, Compstimate Level select, market cells | policy | policy | three unguarded copies |
| inferSeniority | roles.js returns null without a level word; **server/keywords.js returns 'Mid'** | `roles.js:304-313`; `server/keywords.js:776-788` | job.seniority everywhere | policy | policy | cross-level caveat: 41% of postings are "Mid" only by default |
| Role families | 26 ids and labels; FAMILIES regex; DEPT_HINTS; PRIORITY; ABBREV and SYNONYM; FAMILY_TITLES (26 representative titles); app.js FAMILY_LABEL (15 old labels, overridden) | `roles.js:21-237`, `compstimate.js:442-451`, `app.js:62-67` | rf filter, Same role elsewhere, Compare picker, Compstimate auto title | quarterly | policy | manual + jobs.js coverage drift |
| Synthetic level multipliers | mock: Intern 0.35, Entry 0.62, Mid 0.85, Senior 1, Staff+ 1.3, Manager 1.15, Director+ 1.55; demo: 0.35 / 0.68 / 0.86 / 1 / 1.3 / 1.15 / 1.55 | `mock-api.js:68-71`, `demo-data.js:28-31` | ?mock=1, features demo and tests | — | demo | none needed (synthetic) |

#### E. README and docs figures

The README and docs figures are in `readme-counts` and `docs-counts` (Appendix A has every line). Current-state claims checked against the code on 2026-10-10:

| Claim | Where | Actual | Verdict |
|---|---|---|---|
| "built-in Anthropic, Anduril and OpenAI" | `README.md:16` | 8 stable + 7 beta | **stale** |
| "89 cities" | README:175, LIVABILITY ×7 | 89 | ok |
| "~74 MB", "anduril.json ~38 MB" | README:78, ARCHITECTURE | 37.9 MB local | ok (dated) |
| "Anduril, with 2,418 jobs in 1.3 MB" (Oct 2026) | README:219 | 2,418 | ok (dated) |
| "638 roles · median $352K" | README:346 | 638 / $352,500 | ok (2026-10-02) |
| "~200 tech-hub cities" | CONTRACT:80 | 246 cities, 52 states, 60 countries | **stale** |
| freshness ≤ 7 / 8–59 / 60–179 / ≥ 180 | CONTRACT | server/history.js FRESHNESS | ok |
| US 30 medium / 10 low, 49 non-US low | LIVABILITY:110 | 30 / 10 / 49 | ok |
| netForScore table | LIVABILITY:128-136 | equal | ok |
| §3 tax table vs TAX_SOURCES | LIVABILITY:297-365 | 69 / 69 equal at 08:10Z; 57 differ and 2 missing at 08:21Z (tax agent mid-edit) | in flux |
| Worked examples | LIVABILITY:168-213 | 32 / 32 equal at 08:10Z; **20 / 32 differ at 08:21Z** (tax agent's juice.js edit) | must be regenerated |
| `npm test` 249/249; e2e 32 of 33 | QA.md:21, :30 | historical (2026-10-02 run) | dated record |
| QA "$675K − $229K − $29K − $19K = $398K" | QA.md:338 | today $298K tax, $44K rent | historical, now wrong |
| VETTING bounds | VETTING.md:93-112 | equal to server/vet.js (per its own text) | hand-written copy |

`docs/strategy/*.md`:
- Third-party market figures (Zestimate 1.78% / 7.20%, Indeed 50.4%, Glassdoor 67%, Greenhouse 18–22%, Zillow $417M, LinkedIn $17.8B …) are under `strategy-market-figures` (manual, yearly).
- Locally computed "[L]" figures (5,413 postings, 85% with pay, 41% unlevelled) are under `docs-counts`, all from the 2026-10-02 snapshots.

`docs/screenshots/*.png` show real figures at capture time. They are under `docs-screenshots`, with no date on the image.

#### F. OG and share

- **`public/og/melon-seek-og.png`** (read as an image, identical to `public/og/card.html`). The figures are illustrative:
  - chart card: "Median $318K · 214 roles"; Research 64, Engineering 88, Security 27, Sales 35 (sum 214); bins 9 / 18 / 14 / 6, 5 / 16 / 24 / 19 / 8, 9 / 11 / 4, 4 / 14 / 12; axis $150K–$550K;
  - map card: pins $436K · 8, $368K · 12, $290K · 5; "Remote · 9 roles".
  - The card says the numbers are illustrative, not data, and names no company. Nothing to refresh. Note: its pin colours are the old blue ramp; the app moved to rind green (DES-1).
- **`public/index.html`:** OG and Twitter tags carry no numbers except the 1200×630 image size.
- **Share pages** (`c/<slug>/`): real role count, median and data date per company, rebuilt daily. They are the only per-company numbers with a date.

### 5.4 Tests: what pins data

**Intentional golden vectors** (change only with a verified rule or policy change):
- `test/juice.test.js`:
  - US federal + FICA + CA for $300K (re-baselined by the tax agent today for itemized SALT);
  - NYC and NY brackets; Ohio + Columbus; UK 2026/27 bands and NICs;
  - score K 80,000, fullGlass 423,866, $47,827 / $96,318, grades 45 / 70.
- `test/juice-household.test.js`: LIVING_SCALE 0.58 / 0.42 / 0.20, 2.414.
- `test/features.test.js`: SENIORITY_LADDER exact; 20 real titles → family; inferSeniority vectors; 50 × 2080 = 104,000.
- `test/vet-gate.test.js`, `test/salary.test.js`: $1.2M cap, $250/hr, above_max and range_ratio codes.
- `test/golden-normalize.test.js`: 300 normalized-job hashes; re-baseline only with a NORMALIZER_VERSION bump.

**Incidental pins** (true only for today's data; re-baseline in the refresh PR):
- `juice.test.js` calibration `Q` quantiles (2026-10-02 snapshots; bands, so stale-able rather than breakable);
- `market.test.js` real-snapshot test (> 50 cells, ≥ 5 companies, ≤ 150 KB);
- `demo.test.js` demo salary bands ($150K–$690K; London £90K–£350K) and counts 60–150 (pin server/demo.js);
- `server.test.js` seed 20261002;
- golden-normalize again, because vetting uses FX: a monthly FX change can flip a posting that sits near a $ bound (low risk, but real).

**Robust (relational):**
- `fx-consistency`, `features` FX tests, `og.test.js` (fixture: 4 roles, $250K), `static-build`, `beta-build`, `market` fixture tests;
- all of `test/e2e/*.e2e.js`: UI compared with API. A grep for 638 / 833 / 2,418 / $NNNK / 89 found no hard-coded data values.

## 6. Flags

### 6.1 UI numbers shown with no "as of" (targets for freshness-derived)

| Consumer | What lacks a date | Data available |
|---|---|---|
| `public/app.js:2125-2190` juiceBlock: summary `:2139-2140`; Gross `:2154`; Tax `:2155`; Rent `:2156`; Living `:2157`; Juice left `:2158`; "Rent takes N%" `:2178`; Compare locations `:2180-2185` | tax year, rent month, living-cost month, FX date | `b.inputs` (best only) has every source asOf; freshness.js `juiceAsOfText(best)` |
| `public/app.js:1870-1876` juiceBadge; `public/viz/map.js:358-367` map Juice tooltip and `:261-279` legend | same | — |
| `public/app.js:2426-2457` sameRoleSection (`comps-note` `:2441-2444`) and `public/viz/comps.js:41` note | postings date, FX date | market.generatedAt, market.fx.asOf; `marketAsOfText` |
| `public/features/comps.js:206-207` Compare footer | postings date (FX date is there) | market.generatedAt |
| `public/features/compstimate.js:387-392` accuracyLine (used by the widget at `:734-735` and the drawer at `app.js:2269`) | when the backtest ran | meta.compstimate.computedAt; `compstimateAsOfText` |
| `public/features/compstimate.js:725-745` widget card ("Estimated base salary", Low / High, P5–P95 scale) and `app.js:2257-2270` drawer Compstimate | postings date | data.fetchedAt |
| `public/viz/chart.js:332` foot tooltip and `:982` tooltip "USD (approx)"; `app.js:2052` "≈ … in approx USD" | FX date | palette FX_AS_OF (patch §8 does the chart footnote) |
| `public/features/insights.js:347-350` header "pay in approx. USD"; tiles `:326-338` | postings date, FX date | data.fetchedAt, FX_AS_OF |
| `public/app.js:1537-1560` stats line | postings date (the badge has it) | data.fetchedAt |
| `scripts/methodology.js:84-88` methodology page | no "data as of" line (build SHA only) | registry |

### 6.2 Duplicate copies of a reference number

| Number | Copies | Guarded? |
|---|---|---|
| FX table | palette.js, server/juice.js, server/salary.js, data/cities.json, shared.js (CNY) | yes (fx-consistency + fx.js rewrites all) |
| FX table, more copies | mock-api.js, demo-data.js (×2), viz/demo.html | **no** (patch §8 covers mock and demo-data) |
| Score anchors | server/juice.js SCORE_ANCHORS, palette.js JUICE_ANCHORS, mock-api.js (old curve), LIVABILITY.md | **no** → lead's freshness-policy test |
| Grade breaks | server GRADES, palette JUICE_BREAKS, app.js JUICE_GRADES text, mock-api.js, LIVABILITY.md | **no** → same test |
| Households | server HOUSEHOLDS, app.js HOUSEHOLDS | no |
| Seniority ladder | roles.js, chart.js, app.js (+ server/keywords.js) | no |
| Family labels | roles.js FAMILY_LABELS, app.js FAMILY_LABEL (overridden) | n/a |
| Backtest options | compstimate.js defaults, server/index.js BACKTEST_OPTS, build-static.js BACKTEST_FALLBACK | **no, and they disagree** (dedupe) |
| Annualization 2080 / 12 | server/salary.js, shared.js salaryUSD | no |
| Low-accuracy threshold | ACCURACY_LOW_THRESHOLD 25, and the copy "more than 25%" (`compstimate.js:735`) | no |
| 180-day threshold | server/history.js FRESHNESS, app.js (`:433`, `:487`, `:2383`, copy) | no |
| Company list | server/companies.js, app.js FALLBACK_COMPANIES (3), mock-api.js (3), README (3) | no |
| Currency symbols | palette SYMBOLS, app CUR_SYM | no |
| Tax schedule text | TAX_SOURCES, LIVABILITY.md §3 (all rows) | no |
| Vetting bounds | server/vet.js, VETTING.md, mock-api.js message | no |
| Rents and living | cities.json, mock-api.js LIVING, LIVABILITY audit table, worked examples | no |

### 6.3 Hand-written numbers in docs that should be generated or checked

- **Generate:**
  - LIVABILITY worked examples (claims "generated", but no generator exists, and they are already stale against the tax agent's edit);
  - LIVABILITY §3 tax table (from TAX_SOURCES);
  - confidence counts (30 / 10 / 49);
  - the score table and legend points;
  - README company sentence and counts;
  - CONTRACT gazetteer size.
- **Check against code** (derived.js):
  - VETTING.md bounds;
  - LIVABILITY §4 sources table dates (Big Mac release, Numbeo months, "64 of 89");
  - LIVABILITY §4.2 ratios (vs cities.json bedroomRatios);
  - the 1-bed audit table rents (vs cities.json).
- **Keep as dated history** (add "as of" where missing): QA.md results, DATA_SOURCES observations, strategy [L] figures, the calibration table (which states its date).

### 6.4 Items with no update mechanism before this work

Every docs and README figure; the worked examples; the confidence counts; the LIVABILITY §3 / §4 / §4.2 tables; the OG card; docs screenshots; strategy figures; the palette.js FX copy and FX_AS_OF; shared.js CNY; the palette Juice mirrors; app.js JUICE_GRADES text; HOUSEHOLDS copy; the Compstimate model weights and thresholds; seniority and family copies; the UI thresholds; mock and demo data. The fetched job data and its derived numbers already had the daily pipeline.

### 6.5 Unverified items

- The OG card's "illustrative" figures are not tied to anything (by design).
- Strategy third-party figures were not re-checked against their sources (no fetch).
- The Numbeo, HUD, ONS, BLS and other figures in LIVABILITY.md were checked only for consistency with `data/cities.json` and the code, not against the sources. That belongs to freshness-col and freshness-tax.
- Per-company backtest values (±14% Anthropic, ±5% Palantir) are quoted from docs/process/ux.md (2026-10-02) and were not recomputed: that would take minutes per board, and it is the jobs agent's area.

## 7. Findings and fixes (for routing)

1. **README company list is stale** (`README.md:16`: 3 named, 8 + 7 exist). Fix: `docs/process/patches/freshness-derived-readme-builtins.diff` (freshness-derived) already rewrites the sentence; long term, generate it (readme-counts).
2. **UI mirrors of the Juice policy are unguarded** (palette JUICE_ANCHORS / JUICE_BREAKS, app.js JUICE_GRADES text, HOUSEHOLDS). Fix: the lead's `test/freshness-policy.test.js`; also cover app.js HOUSEHOLDS bedrooms vs server HOUSEHOLDS.
3. **The Juice block, Same role elsewhere, Compstimate and Insights show no as-of.** Exact consumers are in §6.1. Fix: freshness-derived (freshness.js `juiceAsOfText`, `marketAsOfText`, `compstimateAsOfText`). Its `docs/process/patches/freshness-derived-ui-asof.diff` touches app.js, features/comps.js and features/compstimate.js. It does not touch the chart footnote (my patch), map.js, viz/comps.js, insights.js or the methodology page: check those rows of §6.1 against it.
4. **Backtest options disagree:** dedupe "role" via server BACKTEST_OPTS, but "title" via `build-static.js:115` BACKTEST_FALLBACK. Fix: `docs/process/patches/freshness-audit-core-backtest-fallback.diff` (audit-core found it too; I withdrew my identical patch to avoid a conflict). Also interpolate ACCURACY_LOW_THRESHOLD into the "more than 25%" copy.
5. **"Pay ↑/↓" card tag is dead:** `app.js:1903` reads `job.payChange`, and no producer exists. Fix: emit `payChange {dir, pct}` from the ledger in `server/history.js` annotate() (needs the previous salary per id), or from the archive (`scripts/archive/jobs.js` already counts payChanged); else remove the branch.
6. **Mock and demo numbers drift:** FX GBP 1.27 / EUR 1.09 (/ CHF 1.13), the old log score curve, mock `medianAbsPctError: 0.14` (wrong unit, shows "±1%"), mock London rent $32,766 vs $34,777. Fix: patch `freshness-audit-surface-demo-mock-fx.diff` (palette FX, current curve, percent units); the LIVING table stays approximate.
7. **Stale chart footnote:** lists 7 currencies of 22 and has no FX date. Fix: patch `freshness-audit-surface-chart-fx-footnote.diff`.
8. **Cross-level caveat:** server/keywords.js tags unlevelled titles "Mid" (41% of postings), while roles.js returns null. So market "Mid" cells and Compstimate seniority weights treat unlevelled roles as Mid. This is not a freshness bug, but it affects every cross-level comparison. Route to freshness-jobs and the ladder plan (CORPORATE_LADDER_PLAN "Seniority repair").
9. **Worked examples went stale during the audit:** 20 of 32 rows differ after the tax agent's 08:19Z edit of server/juice.js. Regenerate after the tax agent lands (juice-worked-examples, freshness-derived).

## 8. Patches (for the lead to apply after the owning agents finish)

| Patch | Target | Why | Checked |
|---|---|---|---|
| `docs/process/patches/freshness-audit-surface-chart-fx-footnote.diff` | `public/viz/chart.js` (no running owner) | the foot tooltip lists every FX_PER_USD currency and "rates as of FX_AS_OF" (finding 7; freshness-derived may fold this into its as-of work) | `git apply --check` ok; static-build and perf-mobile pass on the patched copy |
| `docs/process/patches/freshness-audit-surface-demo-mock-fx.diff` | `public/mock-api.js`, `public/features/demo-data.js` (no running owner) | one FX table (import the palette FX_TO_USD), current score curve, percent backtest units in the mock (finding 6) | `git apply --check` ok; `node --test test/features.test.js test/fx-consistency.test.js test/market.test.js test/demo.test.js` 95/95 on a patched copy |

Both were written against the working tree at 08:2xZ. Re-check with `git apply --check` before applying, because other agents are editing nearby.

## 9. Verification

- Hand-off: `node build-registry.mjs`. Every anchor resolved (0 missing), and ids are unique.
- Worked-example check: `check-examples.mjs` gave 32/32 at ~08:10Z and 20/32 mismatches at 08:21Z. The cause is the tax agent's edit, not the docs.
- LIVABILITY §3 vs TAX_SOURCES: 69/69 equal at ~08:10Z. At 08:21Z, 57 rows differ and 2 keys have no row (in flux).
- Patches: `git apply --check` ok for both; the tests named in §8 pass on a patched scratch copy.
- `npm test` (whole repo, nothing of mine in it; I changed no repo file except this log):
  - run 1: 440 tests, 433 pass, 7 fail;
  - run 2: one top-level failure.
  - The failures are all in other agents' in-progress work: the lead's registry tests ("every updater module is registered…", "every archive extract resolves"), and the timing-based perf tests PERF-1 and V15, which the beta-deploy log records as failing before its own edits too.
- Patch tests: features + fx-consistency + market + demo gave 95/95, and static-build + perf-mobile gave 18/18, on a patched scratch copy.

## 10. Known gaps and follow-ups

- Line numbers in `public/app.js` and `server/juice.js` move as other agents edit. Re-run `build-registry.mjs` and `appendix.mjs` right before the lead merges.
- The tax table, the tax golden tests and the worked examples are mid-change (tax agent). Re-check after it lands.
- I did not audit `server/*` or `data/*` values beyond what docs and UI cite (audit-core's scope), or `scripts/archive/*` (archive agent).

## 11. Change log

- 2026-10-10 ~07:55Z: started. The prompt file was already saved by the lead.
- ~08:10Z: read the scope; FX, Juice, examples and counts recomputed (examples 32/32 equal).
- ~08:15Z: first hand-off (112 entries); lead notified.
- 08:19Z: the tax agent changed server/juice.js and test/juice.test.js. Tax entries now come from the live TAX_SOURCES (71 keys); golden-test anchors switched to test names.
- ~08:25Z: findings 1–9, three patches, appendix; hand-off refined (114 entries).
- ~08:40Z: withdrew my backtest-fallback patch; it is identical to `freshness-audit-core-backtest-fallback.diff`. Finding 1 is covered by `freshness-derived-readme-builtins.diff`.
## Appendix A. Item index per registry entry (generated)

Generated by `node scratchpad/freshness/audit-surface/appendix.mjs` from the hand-off file. Every `file:line` was resolved against the working tree at generation time (2026-10-10).

### `fx-per-usd`

Exchange-rate table (local units per USD) as the UI uses it: the browser copy in public/viz/palette.js and the CNY fallback in features/shared.js; every "approx USD" figure in the chart, map, list, Insights, Compstimate and Compare is converted with it. Surface-audit contribution: merge these owners/consumers into the lead's fx-per-usd entry.

type **fetched** · cadence **monthly** (+14 d) · mode **auto** · updater `scripts/refresh/fx.js` · as-of 2026-07-01 · before: manual copy from data/cities.json fx.perUSD (scripts/update-col.js refreshed cities.json only; the palette and juice copies were hand-edited)

| Item (definition) |
|---|
| public/viz/palette.js:128 FX_AS_OF '2026-07-01' |
| public/viz/palette.js:129 FX_PER_USD (23 currencies) |
| public/viz/palette.js:156 FX_TO_USD = 1/FX_PER_USD |
| public/features/shared.js:18 FX_FALLBACK = palette FX_TO_USD + CNY 0.14 (4th copy; CNY not in the palette) |

| Consumer | Surface | Note |
|---|---|---|
| `public/viz/chart.js:193` | chart | every bar/bin plotted in approx USD |
| `public/viz/chart.js:332` | chart | footnote tooltip names only GBP, EUR, CAD, AUD, JPY, SGD, CHF (stale: the table has 22 currencies) and gives no FX date |
| `public/viz/chart.js:982` | chart | tooltip "≈ $X – $Y USD (approx)", no as-of |
| `public/viz/map.js:52` | map | pin medians in approx USD |
| `public/app.js:383` | badge | _usd drives the salary filter, stats line, sort, drawer percentile and distribution |
| `public/app.js:2052` | drawer Juice block | drawer pay block "≈ $X–Y in approx USD for comparison" (no FX date) |
| `public/features/shared.js:56` | Compstimate | salaryUSD() feeds Compstimate and Insights |
| `public/features/insights.js:349` | Insights | header "pay in approx. USD", no as-of |
| `public/features/comps.js:206` | Compare | the ONLY place the UI prints an FX as-of (market.fx.asOf = palette FX_AS_OF) |
| `scripts/build-market.js:112` | Same role elsewhere | market cells are USD at this table |
| `docs/LIVABILITY.md:586` | methodology page | says the monthly refresh does not update the code tables (true before scripts/refresh/fx.js) |
| `docs/LIVABILITY.md:238` | methodology page |  |
| `test/fx-consistency.test.js:11` | tests | guards juice.js and salary.js copies against the palette (1%) |
| `test/features.test.js:91` | tests | relational (uses FX_TO_USD), survives a refresh |
| `test/features.test.js:720` | tests | asserts FX_FALLBACK equals the palette for shared currencies |
| `test/juice.test.js:79` | tests | relational FX round-trip |
| `test/market.test.js:27` | tests | relational |

Notes: UI shows no FX date except the Compare footer. FX_AS_OF is exported by palette.js but no UI module imports it (grep public/: only the definition). Copies NOT rewritten by fx.js: public/mock-api.js FX {GBP 1.27, EUR 1.09} and public/features/demo-data.js FX {GBP 1.27, EUR 1.09, CHF 1.13} (listed under demo-data), public/viz/demo.html:133 FXD (USD per unit, hand-rounded copy of today's palette: GBP 1.348, EUR 1.144, CHF 1.239, JPY 0.006168, SGD 0.7752, CAD 0.7117, AUD 0.6999; dev page, not in dist: build-static DEV_PAGES), and the chart footnote currency list. Fix: chart.js footnote should list Object.keys(FX_PER_USD) or say "22 currencies" and append "as of <FX_AS_OF>". Verified 2026-10-10: palette = juice = cities.json perUSD for all 23 codes; salary.js USD_PER adds CNY/QAR/ZAR.

### `bigmac-prices`

Big Mac prices per country (bigMacUSD, used for the Juice "bigMacs" field) as cited in docs and mock data. Surface contribution.

type **fetched** · cadence **quarterly** (+30 d) · mode **auto** · updater `scripts/refresh/bigmac.js` · as-of 2026-07-01 · before: .github/workflows/col-refresh.yml + scripts/update-col.js (monthly)

| Item (definition) |
|---|
| data/cities.json bigMac.byCountry (33 countries, release 2026-07-01) [core] |

| Consumer | Surface | Note |
|---|---|---|
| `docs/LIVABILITY.md:435` | methodology page | "All 33 countries ... 2026-07-01 release" (hand-written count + date) |
| `docs/LIVABILITY.md:398` | methodology page | sources table: release 2026-07-01, refresh "automatic, monthly" |
| `public/mock-api.js:50` | API | mock only: hard-coded US Big Mac price $5.69 |

Notes: bigMacs is computed by computeJuice but not displayed anywhere in public/app.js (grep: no bigMacs in the drawer). The Economist publishes twice a year (Jan/Jul), so "monthly" is the check cadence, not the change cadence.

### `juice-score-anchors`

Juice Score curve (score = 100·(1−e^(−net/K)), K = $80,000; fullGlassUSD $423,866) as mirrored in the browser and stated in docs.

type **product-policy** · cadence **yearly** (+60 d) · mode **manual** · updater `manual` · as-of 2026-10-02 · before: none (hand-tuned 2026-10-02)

| Item (definition) |
|---|
| public/viz/palette.js:237 JUICE_ANCHORS {K: 80000, fullGlassUSD: 423866} (fallback copy of server/juice.js SCORE_ANCHORS) |
| public/viz/palette.js:256 juiceNetForScore (fallback mirror of netForScore) |

| Consumer | Surface | Note |
|---|---|---|
| `public/viz/map.js:260` | map | Juice legend $ ranges per grade; prefers the live lib/juice.js, falls back to the palette mirror |
| `public/viz/map.js:364` | map | tooltip median net |
| `public/app.js:1870` | badge | card badge "🍉 score · grade" (score from server/juice.js) |
| `public/app.js:2139` | drawer Juice block |  |
| `docs/LIVABILITY.md:31` | methodology page |  |
| `docs/LIVABILITY.md:121-141` | methodology page | curve, table of net needed per grade, legend points (hand-written, verified equal to code 2026-10-10) |
| `test/juice.test.js:116` | tests | intentional policy pin (K, fullGlassUSD, $47,827 / $96,318) |
| `public/mock-api.js:47` | API | mock ?mock=1 still scores with the OLD log curve (A $10K, B $250K) |

Notes: Duplicate copies: server/juice.js SCORE_ANCHORS (owner), palette.js JUICE_ANCHORS (unguarded), mock-api.js (old formula). Stale comment public/viz/palette.js:253.

### `juice-grades`

Juice grade cut-offs (Dry < 45 ≤ Ripe < 70 ≤ Juicy; Rind when net ≤ 0) as duplicated in UI code and copy.

type **product-policy** · cadence **yearly** (+60 d) · mode **manual** · updater `manual` · as-of 2026-10-02 · before: none

| Item (definition) |
|---|
| public/viz/palette.js:232 JUICE_BREAKS [45, 70] |
| public/app.js:1323 JUICE_GRADES chip tooltips "(score 70+)", "(45–69)", "(under 45)" (hard-coded copy) |
| public/app.js:364 gradeKey: Rind is filtered as Dry |

| Consumer | Surface | Note |
|---|---|---|
| `public/viz/map.js:268` | map | legend "Dry < 45 · Ripe 45–69 · Juicy 70+" |
| `public/viz/palette.js:246` | map | pin colours by grade step |
| `public/app.js:1329` | badge | Juice grade filter chips + counts |
| `public/app.js:1346` | badge | "N of M roles have a Juice Score" |
| `docs/LIVABILITY.md:132` | methodology page |  |
| `test/juice.test.js:131` | tests | intentional policy pin |
| `public/mock-api.js:48` | API | mock copy |

### `households`

Household presets for the Juice Score (Just me = 1 bed, Couple = 2 bed, Family = 2 adults + 2 children, 3 bed) as labelled in the UI.

type **product-policy** · cadence **ad-hoc** (+60 d) · mode **manual** · updater `manual` · as-of 2026-10-10 · before: none

| Item (definition) |
|---|
| public/app.js:2065 HOUSEHOLDS labels/bedrooms/people (UI copy of server/juice.js HOUSEHOLDS) |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:2152` | drawer Juice block | rent line "N-bedroom, city centre" |
| `public/app.js:2157` | drawer Juice block | "everyday costs for <people>, excluding rent" |
| `docs/LIVABILITY.md:51-98` | methodology page |  |
| `test/juice-household.test.js:28` | tests | intentional policy pin |

### `living-scale`

Living-cost household scale (DWP after-housing-costs modified OECD: 0.58 / 0.42 / 0.20 → 1, 1.72, 2.41) and the cross-check figures cited for it.

type **static-constant-from-a-source** · cadence **yearly** (+60 d) · mode **manual** · updater `manual` · as-of 2026-10-10 · before: none

| Item (definition) |
|---|
| server/juice.js LIVING_SCALE [core/col] |

| Consumer | Surface | Note |
|---|---|---|
| `docs/LIVABILITY.md:29` | methodology page |  |
| `docs/LIVABILITY.md:76-83` | methodology page | hand-written BLS/MIT cross-check table (read 2026-10-10) |
| `test/juice-household.test.js:40` | tests | intentional pin (source constant) |
| `test/juice-household.test.js:88` | tests |  |

### `nyc-basket`

NYC single-person living-cost baseline ($1,665.2/month × 12 = $19,982) as cited in docs/mock.

type **static-data** · cadence **quarterly** (+30 d) · mode **manual** · updater `manual` · as-of 2026-09-01 · before: manual (LIVABILITY.md §6)

| Item (definition) |
|---|
| data/cities.json baseline.nycBasketUSD; server/juice.js NYC_BASKET_USD [core/col] |

| Consumer | Surface | Note |
|---|---|---|
| `docs/LIVABILITY.md:29` | methodology page |  |
| `docs/LIVABILITY.md:401` | methodology page |  |
| `public/mock-api.js:31` | API | mock LIVING table copies NYC living $19,982 and other cities' living costs |

### `rents-1br-quoted`

1-bedroom city-centre/outside rents (quoted), as restated in the LIVABILITY.md audit table and the mock data.

type **static-data** · cadence **quarterly** (+30 d) · mode **manual** · updater `manual` · as-of 2026-09-01 · before: manual (LIVABILITY.md §6)

| Item (definition) |
|---|
| data/cities.json rent1brCenterLocal / rent1brOutsideLocal [col] |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:2156` | drawer Juice block | Rent line; no as-of shown (inputs.rent.source.asOf exists but is not displayed) |
| `public/app.js:2178` | drawer Juice block | "Rent takes N% of take-home pay" |
| `docs/LIVABILITY.md:491-507` | methodology page | hand-written audit table restating 15 cities' rents + official comparisons (2026-10-10) |
| `docs/LIVABILITY.md:399` | methodology page | hand-written count |
| `docs/LIVABILITY.md:509` | methodology page |  |
| `public/mock-api.js:31` | API | mock LIVING rents: SF 44145 = current; London 32766 is stale (current 1-bed ×12 = $34,777) |
| `test/juice.test.js:60` | tests | relational |

Notes: Duplicate of cities.json figures in docs (audit table) and mock-api.js; neither is regenerated.

### `rents-bedroom-ratios`

2- and 3-bedroom ratios (HUD FMR, ONS, RTB, Stadt Zürich, OLAP, StatCan, NSW, HDB, pooled 1.281/1.533) as cited in docs.

type **static-constant-from-a-source** · cadence **yearly** (+60 d) · mode **manual** · updater `manual` · as-of 2026-08-31 · before: manual (docs/process/scripts/juice-household-rents.mjs)

| Item (definition) |
|---|
| data/cities.json bedroomRatios [col] |

| Consumer | Surface | Note |
|---|---|---|
| `docs/LIVABILITY.md:458-477` | methodology page | hand-written ratio list |
| `docs/LIVABILITY.md:405` | methodology page |  |
| `public/app.js:2152` | drawer Juice block | Couple/Family rent lines |

### `rents-nsw-official`

Sydney official rents (NSW Rent and Sales Report, June quarter 2026) as cited in docs.

type **static-data** · cadence **quarterly** (+30 d) · mode **manual** · updater `manual` · as-of 2026-06-30 · before: manual

| Item (definition) |
|---|
| data/cities.json sydney-nsw-au rent*CenterLocal [col] |

| Consumer | Surface | Note |
|---|---|---|
| `docs/LIVABILITY.md:406` | methodology page |  |
| `docs/LIVABILITY.md:449` | methodology page |  |
| `docs/LIVABILITY.md:213` | methodology page |  |

### `cost-index`

Cost index (living costs excluding rent, NYC = 100) as cited in docs (published-index cross-checks, comparison-derived estimates).

type **static-data** · cadence **quarterly** (+30 d) · mode **manual** · updater `manual` · as-of 2026-09-01 · before: manual

| Item (definition) |
|---|
| data/cities.json costIndex [col] |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:2157` | drawer Juice block | no as-of shown |
| `docs/LIVABILITY.md:426` | methodology page |  |
| `docs/LIVABILITY.md:557-562` | methodology page |  |

### `juice-confidence-rules`

Confidence rules and the resulting counts quoted in docs (US 30 medium / 10 low; 49 non-US low).

type **product-policy** · cadence **ad-hoc** (+60 d) · mode **manual** · updater `manual` · as-of 2026-10-10 · before: none

| Item (definition) |
|---|
| server/juice.js confidenceFor / SOURCE_CLASSES [core] |

| Consumer | Surface | Note |
|---|---|---|
| `docs/LIVABILITY.md:110` | methodology page | hand-written counts; change whenever a source class changes |
| `public/app.js:1873` | badge | UI shows only the ≈ estimate marker; confidence itself is never displayed |
| `test/juice.test.js:295` | tests | intentional policy pin |

### `juice-worked-examples`

LIVABILITY.md worked examples: 8-row table ("data as of 2026-10-02") and 27-row by-household table ("data as of 2026-10-10"), incl. the user's SF $675K example.

type **derived-at-build** · cadence **monthly** (+14 d) · mode **auto** · updater `scripts/refresh/examples.js (freshness-derived)` · as-of 2026-10-10 · before: none: headed "generated from the code" but no generator is committed (pasted by hand)

| Item (definition) |
|---|
| docs/LIVABILITY.md:168-211 |

| Consumer | Surface | Note |
|---|---|---|
| `docs/LIVABILITY.md:168` | methodology page |  |
| `docs/QA.md:338` | docs | QA report 2026-10-02 quotes an older $675K waterfall ($229K tax, $29K rent): historical, now wrong |

Notes: First table header says "data as of 2026-10-02" but its figures are today's (London rent $34,777 is post-2026-10-10 data): the header date is stale. Main + household tables duplicate each other for single rows.

### `juice-calibration-doc`

Score calibration on the real snapshots (2026-10-02): percentile table, grade shares, per-city examples, plus the pinned quantiles in test/juice.test.js.

type **derived-at-build** · cadence **quarterly** (+30 d) · mode **manual** · updater `docs/process/scripts/livability-juice-distribution.mjs (manual, needs data/snapshots/)` · as-of 2026-10-02 · before: manual

| Item (definition) |
|---|
| docs/LIVABILITY.md:144-166 |

| Consumer | Surface | Note |
|---|---|---|
| `docs/LIVABILITY.md:144` | methodology page |  |
| `test/juice.test.js:145` | tests | incidental pin of snapshot-derived quantiles (snapshots are gitignored); goes stale but never breaks |

### `methodology-page`

dist/methodology/ (scripts/methodology.js renders all of docs/LIVABILITY.md): every number in LIVABILITY.md is user-facing here.

type **derived-at-build** · cadence **monthly** (+14 d) · mode **auto** · updater `scripts/build-static.js (every Pages build) + scripts/refresh/derived.js` · as-of n/a · before: rebuilt on every deploy, but the numbers inside are hand-written

| Item (definition) |
|---|
| scripts/methodology.js:61 |
| scripts/build-static.js:27 |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:2058` | drawer Juice block | "How it's calculated" link |
| `scripts/methodology.js:88` | methodology page | footer shows the build SHA but no "data as of" line |

Notes: Proposal (derived): add a "Data as of" line built from data/freshness.json (FX, rents, tax years) under the title.

### `readme-counts`

Numbers README.md states as current.

type **derived-at-build** · cadence **monthly** (+14 d) · mode **auto** · updater `scripts/refresh/derived.js (freshness-derived)` · as-of 2026-10-02 · before: none (hand-written)

| Item (definition) |
|---|
| README.md |

| Consumer | Surface | Note |
|---|---|---|
| `README.md:16` | README | STALE: server/companies.js lists 8 stable companies (anthropic, anduril, openai, scaleai, xai, cohere, palantir, shieldai) and 7 beta |
| `README.md:78` | README |  |
| `README.md:175` | README | matches (89) |
| `README.md:219` | README | matches the 2026-10-02 snapshot (2,418 jobs) |
| `README.md:346` | README | matches the 2026-10-02 snapshot (638 jobs, median $352,500 before vetting) |
| `README.md:187` | README |  |
| `README.md:11` | README | illustrative |

Notes: Finding 1 FIX: README line "built-in Anthropic, Anduril and OpenAI" -> "eight built-in boards (Anthropic, Anduril, OpenAI, Scale AI, xAI, Cohere, Palantir, Shield AI; big-tech boards on /beta)", ideally generated by derived.js from listCompanies(). Size/count sentences ("~74 MB", "2,418 jobs in 1.3 MB", "638 roles · median $352K") should carry "(as of 2 Oct 2026)" or be regenerated from the last Pages build summary.

### `docs-counts`

Counts and figures stated in docs/** other than README and LIVABILITY.md.

type **derived-at-build** · cadence **quarterly** (+30 d) · mode **manual** · updater `scripts/refresh/derived.js (counts it can recompute) + manual for dated reports` · as-of 2026-10-02 · before: none (hand-written)

| Item (definition) |
|---|
| docs/** |

| Consumer | Surface | Note |
|---|---|---|
| `docs/CONTRACT.md:80` | docs | STALE: GAZETTEER_SIZE = 246 cities, 52 states, 60 countries |
| `docs/CONTRACT.md:144` | docs | matches server/history.js FRESHNESS |
| `docs/ARCHITECTURE.md:82` | docs |  |
| `docs/QA.md:4` | docs | dated QA report (2026-10-02): historical record, keep but do not treat as current |
| `docs/QA.md:21` | docs | dated test count |
| `docs/DATA_SOURCES.md:23` | docs | dated observation |
| `docs/DATA_SOURCES.md:216` | docs | dated observation |
| `docs/VETTING.md:93` | docs | hand-written restatement of server/vet.js bounds (see salary-vetting-bounds) |
| `docs/VETTING.md:116` | docs |  |
| `docs/strategy/CORPORATE_LADDER_PLAN.md:17` | docs | snapshot-derived, 2026-10-02 |
| `docs/strategy/COMPETITIVE_ANALYSIS.md:15` | docs | [L] = computed locally from snapshots 2026-10-02 |
| `docs/strategy/COMPETITIVE_ANALYSIS.md:241` | docs |  |
| `docs/strategy/COMPETITIVE_ANALYSIS.md:300` | docs |  |

### `og-card`

Social share card public/og/melon-seek-og.png (rendered from public/og/card.html): illustrative numbers, not data.

type **product-policy** · cadence **ad-hoc** (+365 d) · mode **manual** · updater `manual (node scripts/build-og.mjs, Playwright outside the repo)` · as-of n/a · before: none

| Item (definition) |
|---|
| public/og/card.html:125 |
| public/og/card.html:219 |

| Consumer | Surface | Note |
|---|---|---|
| `public/index.html:16` | OG image |  |
| `public/index.html:20` | OG image | alt text, no numbers |
| `scripts/build-static.js:451` | OG image | every share page reuses the same image |
| `test/og.test.js:80` | tests | size/format only, no numbers |

### `share-pages`

dist/c/<slug>/ share pages: og:title "<Company> jobs by salary · N roles · median $X", og:description "M of N roles list pay ... Data from <Company>'s public job board, <date>".

type **derived-at-build** · cadence **daily** (+2 d) · mode **auto** · updater `scripts/build-static.js (pages.yml, daily)` · as-of n/a · before: daily Pages build

| Item (definition) |
|---|
| scripts/build-static.js:434-447 |
| scripts/build-static.js:451 |

| Consumer | Surface | Note |
|---|---|---|
| `scripts/build-static.js:458` | OG image | carries a data date (good) |
| `README.md:346` | README | example copied by hand |
| `test/og.test.js:180` | tests | fixture-based (4 roles, $250K): stable across data refreshes |

Notes: Median uses salary.js annualize + vet.js toUSD (server FX copy), not palette.js; after fx.js both are rewritten together, so they agree.

### `e2e-pinned-values`

Values pinned by tests that depend on reference or job data (audit result: very few; most assertions are relational).

type **derived-at-build** · cadence **monthly** (+14 d) · mode **detect** · updater `scripts/refresh/derived.js (freshness-derived)` · as-of 2026-10-10 · before: none

| Item (definition) |
|---|
| test/** |

| Consumer | Surface | Note |
|---|---|---|
| `test/juice.test.js:145` | tests | incidental: snapshot quantiles 2026-10-02 (stale-able, bands only) |
| `test/market.test.js:87` | tests | incidental: > 50 cells, ≥ 5 companies, ≤ 150 KB on real snapshots; can break as boards grow |
| `test/demo.test.js:80` | tests | incidental: pins server/demo.js salary bands |
| `test/demo.test.js:27` | tests | incidental: demo count |
| `test/features.test.js:524` | tests | fixture |
| `test/server.test.js:603` | tests | pins BACKTEST seed 20261002 |
| `test/golden-normalize.test.js:40` | tests | golden hashes of 300 real postings: break on lexicon/geo/salary-parser changes (bump NORMALIZER_VERSION); vetting uses FX, so an FX refresh can flip a job near a $ bound (low risk) |
| `test/e2e/ui.e2e.js:448` | tests | relational on the 180-day bucket |
| `test/beta-build.test.js:160` | tests | fixture date |

Notes: test/e2e/*.e2e.js compare UI vs API values (relational): no hard-coded data values found (grep for 638/833/2418/$NNNK/89 cities returned none).

### `docs-screenshots`

PROPOSED NEW ID. docs/screenshots/*.png (README chart.png/map.png, drawer-juice.png, insights.png, map-juice.png ...) show real figures from the snapshots at capture time.

type **derived-at-build** · cadence **ad-hoc** (+90 d) · mode **manual** · updater `manual (node scripts/e2e.js, Playwright)` · as-of 2026-10-10 · before: manual

| Item (definition) |
|---|
| docs/screenshots/*.png (written by node scripts/e2e.js and docs/process/scripts/*screenshots*.mjs) |

| Consumer | Surface | Note |
|---|---|---|
| `README.md:27` | README |  |

### `strategy-market-figures`

PROPOSED NEW ID. Third-party market statistics cited in docs/strategy/*.md (not shown in the product).

type **static-data** · cadence **yearly** (+90 d) · mode **manual** · updater `manual` · as-of 2026-10-02 · before: none

| Item (definition) |
|---|
| docs/strategy/COMPETITIVE_ANALYSIS.md |
| docs/strategy/ROADMAP.md |

| Consumer | Surface | Note |
|---|---|---|
| `docs/strategy/COMPETITIVE_ANALYSIS.md:31` | docs |  |
| `docs/strategy/COMPETITIVE_ANALYSIS.md:26` | docs |  |

### `job-postings`

Per-company posting counts as the UI shows them (topbar count, stats line, Insights header, filters' facet counts, badge date).

type **fetched** · cadence **daily** (+2 d) · mode **auto** · updater `scripts/snapshot.js (snapshot.yml/pages.yml daily)` · as-of 2026-10-02 · before: daily job-board pipeline

| Item (definition) |
|---|
| data/snapshots/<slug>.json (daily, artifact) [jobs] |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:691` | badge | topbar company count |
| `public/app.js:1537` | badge | stats line "N roles · X% list pay · median · middle 50% · mostly <dept>" |
| `public/app.js:747` | badge | "Snapshot · <date>" (the only job-data as-of) |
| `public/app.js:770` | badge | badge details: Fetched date + Roles |
| `public/features/insights.js:349` | Insights |  |
| `public/viz/chart.js:325` | chart | chart foot counts |

### `job-salary-parsed`

Per-job posted pay in its native currency and the honest-number labels around it.

type **fetched** · cadence **daily** (+2 d) · mode **auto** · updater `daily job-board pipeline` · as-of 2026-10-02 · before: daily job-board pipeline

| Item (definition) |
|---|
| server/salary.js + adapters [jobs/core] |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:1920` | badge | card salary pill (native currency) |
| `public/app.js:2315` | drawer Juice block | drawer pay block |
| `public/app.js:2208` | drawer Juice block | labels: Multiple pay zones, Wide range (≥ 2.0×), Single figure, + equity / + bonus mentioned |
| `public/app.js:2272` | drawer Juice block | "Annualized from hourly pay" |
| `public/viz/chart.js:981` | chart |  |
| `public/features/compstimate.js:565` | Compstimate | comparable rows pay |

### `job-salary-usd`

Per-job annual pay converted to approx USD (client side, palette FX) and every statistic derived from it in the UI.

type **derived-at-build** · cadence **daily** (+2 d) · mode **auto** · updater `computed in the browser on load` · as-of 2026-10-02 · before: computed per page load

| Item (definition) |
|---|
| public/app.js:383 |
| public/features/shared.js:45 salaryUSD (also annualizes) |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:495-510` | badge | salary slider domain: P99 cap (hi > P99×1.3 → P99×1.15, ≥ 20 jobs), $10K rounding |
| `public/app.js:2008-2013` | drawer Juice block | "Pays more than X% of roles at <Company>" / "Top-paid role" |
| `public/app.js:2024` | drawer Juice block | company pay histogram, 32 bins, median label |
| `public/viz/chart.js:101` | chart | axis P1..P99 + Tukey 3·IQR fence |
| `public/viz/chart.js:442` | chart | tick steps $50K/$100K/$250K |
| `public/viz/map.js:47` | map |  |
| `public/features/insights.js:30` | Insights |  |

Notes: Changes whenever fx-per-usd changes: a monthly FX refresh moves every non-USD job's USD figure, slider, percentile, Insights, Compare and Compstimate result.

### `salary-interval-factors`

Annualization factors used client-side and stated in docs (hourly × 2080, monthly × 12, weekly × 52).

type **product-policy** · cadence **ad-hoc** (+365 d) · mode **manual** · updater `manual` · as-of n/a · before: none

| Item (definition) |
|---|
| public/features/shared.js:54 salaryUSD defensive annualization (2080 h if mid < 1000, ×12 if mid < 30000): duplicate of server/salary.js annualize |
| public/viz/chart.js:41 INTERVAL_ADJ labels |
| public/app.js:2055 INTERVAL_ADJ labels |

| Consumer | Surface | Note |
|---|---|---|
| `README.md:501` | README |  |
| `docs/LIVABILITY.md:236` | methodology page |  |
| `docs/VETTING.md:198` | docs |  |
| `test/features.test.js:104` | tests | intentional pin (50 × 2080) |

### `salary-vetting-bounds`

Vetting bounds as restated in docs and mock copy (owner server/vet.js).

type **product-policy** · cadence **quarterly** (+30 d) · mode **manual** · updater `scripts/refresh/policy.js (freshness-jobs)` · as-of 2026-10-02 · before: none

| Item (definition) |
|---|
| server/vet.js, server/salary.js [jobs/core] |

| Consumer | Surface | Note |
|---|---|---|
| `docs/VETTING.md:93-99` | docs | hand-written |
| `docs/VETTING.md:109` | docs |  |
| `public/mock-api.js:180` | API | mock copy of the bound in text |
| `test/vet-gate.test.js:39` | tests | intentional policy pin |
| `test/salary.test.js:298` | tests | intentional |

### `salary-vetting-flags`

Per-job vetting outcome shown in the UI ("Pay unclear").

type **fetched** · cadence **daily** (+2 d) · mode **auto** · updater `daily job-board pipeline (vet gate)` · as-of 2026-10-02 · before: daily pipeline

| Item (definition) |
|---|
| server/vet.js vetSalaries (job.salaryFlag, salaryRaw) [jobs] |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:1921` | badge | card "Pay unclear" |
| `public/app.js:2194` | drawer Juice block | reason + "As parsed" raw figure |
| `public/api.js:727` | API | static mode vets in the browser |

### `company-registry`

Built-in companies (slug, name, board, colour, channel) as duplicated in UI fallbacks, mock data and docs.

type **static-data** · cadence **ad-hoc** (+90 d) · mode **manual** · updater `manual` · as-of 2026-10-10 · before: none

| Item (definition) |
|---|
| server/companies.js [core] |
| public/app.js:72 FALLBACK_COMPANIES (3 of 8 stable: anthropic, anduril, openai with colours) |
| public/mock-api.js:6 mock COMPANIES (same 3) |

| Consumer | Surface | Note |
|---|---|---|
| `README.md:16` | README | STALE (3 named, 8 exist) |
| `docs/strategy/COMPETITIVE_ANALYSIS.md:300` | docs |  |
| `README.md:369` | README | beta list matches |

Notes: Finding 1: README names 3 built-ins, server/companies.js has 8 stable + 7 beta (fix in readme-counts). app.js FALLBACK_COMPANIES (used only when /api/companies fails) also lists 3; PROPOSED test: FALLBACK_COMPANIES slugs/colours ⊆ listCompanies().

### `company-aggregates`

Per-company and per-group aggregates the UI computes (median, p25/p75, pay share, remote share, top department, cluster medians, pin medians).

type **derived-at-build** · cadence **daily** (+2 d) · mode **auto** · updater `computed in the browser / at build` · as-of 2026-10-02 · before: per load

| Item (definition) |
|---|
| public/app.js:537 |
| public/features/insights.js:38 |
| public/viz/chart.js:413 cluster rows |
| public/viz/map.js:91 pin summaries |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:1537` | badge | stats line |
| `public/features/insights.js:333` | Insights | tiles: Median base pay, Middle 50%, Pay published, Remote-eligible |
| `public/viz/chart.js:414` | chart | "N roles · median $X" |
| `public/viz/map.js:410` | map |  |
| `scripts/build-static.js:434` | OG image | share page median |

Notes: No as-of next to any aggregate except the data badge ("Snapshot · <date>").

### `market-comps`

Market comps (company × family × seniority: n, p25/median/p75 USD) in "Same role elsewhere" (drawer) and "Compare companies" (Insights).

type **derived-at-build** · cadence **daily** (+2 d) · mode **auto** · updater `scripts/build-static.js → buildMarket (daily Pages build)` · as-of n/a · before: daily build

| Item (definition) |
|---|
| scripts/build-market.js MIN_N 3, round100 [jobs] |
| public/features/comps.js:72 compsForJob: family+seniority, falls back to the family across levels |
| public/features/comps.js:105 defaultFamily: families covered by ≥ 2 companies |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:2426` | Same role elsewhere | no as-of shown (market.generatedAt / fx.asOf not printed) |
| `public/app.js:2443` | Same role elsewhere |  |
| `public/viz/comps.js:41` | Same role elsewhere |  |
| `public/features/comps.js:172` | Compare | minN fallback 3 hard-coded |
| `public/features/comps.js:207` | Compare | footer: basis, minN, "FX as of"; no generatedAt |
| `public/mock-api.js:275` | API | mock fixture (n ≥ 3, mock FX) |
| `public/features/demo-data.js:128` | API | demo fixture, fx.asOf "demo" |
| `test/features.test.js:547` | tests | fixture-based |
| `test/market.test.js:87` | tests | incidental real-data pin |

Notes: Cross-level caveat: server/keywords.js inferSeniority returns "Mid" for unlevelled titles (41% of postings, CORPORATE_LADDER_PLAN.md), so the "Mid" cells mix real Mid roles with unlevelled ones; roles.js inferSeniority returns null instead. Depends on fx-per-usd (USD cells) and role-families.

### `compstimate-model`

Compstimate similarity model and thresholds (LEVEL_INDEX, seniority/location/department/title weights, selection cut-offs, percentiles, confidence rules, minimum comparables).

type **product-policy** · cadence **quarterly** (+30 d) · mode **manual** · updater `scripts/refresh/policy.js (freshness-jobs)` · as-of 2026-10-02 · before: none

| Item (definition) |
|---|
| public/features/compstimate.js:34 LEVEL_INDEX Intern 0, Entry 1, Mid 2, Senior 3, Manager 3.5, Staff+ 4, Director+ 5 |
| public/features/compstimate.js:41 senioritySim: same 1, ≤0.5 0.55, ≤1 0.35, ≤1.5 0.2, ≤2 0.1, else 0.03; no level asked: Intern 0.25, Director+ 0.5; unknown 0.5 |
| public/features/compstimate.js:50 deptSim 1 / 0.7 (no dept) / 0.5 |
| public/features/compstimate.js:88 locationSim 1 / 0.75 / 0.6 / 0.4 / 0.3 / 0.25 |
| public/features/compstimate.js:156 tokenSim 0.7 coverage + 0.3 precision; title = 0.7 token + 0.3 family |
| public/features/compstimate.js:160 MIN_WEIGHT 0.02, REL_WEIGHT 0.12, MAX_COMPARABLES 500, LOW_P 0.15, HIGH_P 0.85 |
| public/features/compstimate.js:218 band weights 0.25/0.5/0.25; rounding to $1K |
| public/features/compstimate.js:234 confidence High (nEff ≥ 5, topSim ≥ 0.5, spread ≤ 0.6) / Medium (≥ 2, ≥ 0.25, ≤ 1) |
| public/features/compstimate.js:530 MIN_COMPARABLES 3 |
| public/features/compstimate.js:442 FAMILY_TITLES (26 representative titles) |
| public/features/roles.js:281 FAMILY_AFFINITY (24 pairs, unknown family 0.35) |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:2257` | Compstimate | drawer "≈ $X ($low–high, confidence)" for postings without pay |
| `public/features/compstimate.js:726` | Compstimate | Insights widget hero, Low/High, typical range P5–P95, comparables with "% match" |
| `public/features/compstimate.js:716` | Compstimate |  |
| `test/features.test.js:153` | tests | relational |
| `test/features.test.js:614` | tests |  |

Notes: LEVEL_INDEX order (Manager 3.5 between Senior and Staff+) differs from SENIORITY_LADDER display order (Manager after Staff+). The "level multipliers" are similarity weights, not pay multipliers: Compstimate has NO pay-by-level multiplier; the only pay multipliers by level are synthetic (public/mock-api.js SENIORITY, public/features/demo-data.js LEVELS, server/demo.js).

### `compstimate-backtest`

Published Compstimate accuracy: seeded leave-one-out backtest per company → "Typically within ±X% (tested on N listed salaries)", Low confidence above 25%.

type **derived-at-build** · cadence **daily** (+2 d) · mode **auto** · updater `scripts/build-static.js ctx.enrich (daily) / server/index.js worker` · as-of n/a · before: daily build

| Item (definition) |
|---|
| public/features/compstimate.js:296 BACKTEST_SEED |
| public/features/compstimate.js:298 ACCURACY_LOW_THRESHOLD 25% |
| public/features/compstimate.js:337 maxN 500, dedupe 'title' default |
| server/index.js:313 BACKTEST_OPTS {seed 20261002, maxN 500, dedupe "role"} |
| scripts/build-static.js:116 BACKTEST_FALLBACK {seed, maxN} (no dedupe → "title") |

| Consumer | Surface | Note |
|---|---|---|
| `public/features/compstimate.js:387` | Compstimate | accuracy line, no computedAt/as-of shown |
| `public/features/compstimate.js:735` | Compstimate | hard-coded "25%" copy duplicates ACCURACY_LOW_THRESHOLD |
| `public/app.js:2269` | Compstimate | drawer |
| `README.md:187` | README |  |
| `public/mock-api.js:248` | API | mock BUG: 0.14 is a fraction, the contract is percent (shows "±1%") |
| `test/features.test.js:459` | tests |  |

Notes: Inconsistency (finding 4): dedupe is "role" when build-static can import server/index.js BACKTEST_OPTS, but "title" with BACKTEST_FALLBACK, so the published ±X% can change with an import failure. FIX: docs/process/patches/freshness-audit-core-backtest-fallback.diff (BACKTEST_FALLBACK gets dedupe: "role"), or import one shared constant. Also the "missed by more than 25%" copy should interpolate ACCURACY_LOW_THRESHOLD. meta.compstimate.computedAt is published but never displayed (as-of gap: compstimate.js accuracyLine and app.js compstimateBlock).

### `seniority-ladder`

Seniority ladder and its copies (7 levels + Unspecified) used for filters, chart grouping, Compstimate and market cells.

type **product-policy** · cadence **yearly** (+60 d) · mode **manual** · updater `scripts/refresh/policy.js (freshness-jobs)` · as-of 2026-10-02 · before: none

| Item (definition) |
|---|
| public/features/roles.js:301 SENIORITY_LADDER |
| public/viz/chart.js:38 chart SENIORITY_ORDER (+ Unspecified) |
| public/app.js:68 app SENIORITY_ORDER (+ Unspecified) |
| public/features/roles.js:304 roles.js inferSeniority (null when no level word) |
| public/features/compstimate.js:34 LEVEL_INDEX |

| Consumer | Surface | Note |
|---|---|---|
| `public/features/compstimate.js:668` | Compstimate | Level select with counts |
| `public/app.js:429` | badge | Seniority filter |
| `public/features/comps.js:58` | Same role elsewhere | market cells by seniority |
| `test/features.test.js:157` | tests | intentional pin |
| `docs/strategy/CORPORATE_LADDER_PLAN.md:78` | docs | 2,234 of 5,413 (41%) unlevelled → "Mid" |

Notes: Three hand-kept copies of the order (roles.js, chart.js, app.js) with no test tying them together. server/keywords.js inferSeniority defaults unlevelled titles to "Mid" while roles.js returns null: cross-level comparisons (market "Mid" cells, Compstimate seniority weight) treat unlevelled roles as Mid.

### `role-families`

Role-family taxonomy (26 families) and its label copies.

type **product-policy** · cadence **quarterly** (+30 d) · mode **manual** · updater `scripts/refresh/jobs.js (freshness-jobs: coverage drift on new snapshots)` · as-of 2026-10-02 · before: none

| Item (definition) |
|---|
| public/features/roles.js:139 FAMILY_LABELS (26) |
| public/features/roles.js:174 FAMILIES regex lexicon |
| public/features/roles.js:205 DEPT_HINTS |
| public/features/roles.js:21 ABBREV / SYNONYM / LEVEL_WORDS / STOPWORDS |
| public/app.js:62 app FAMILY_LABEL (15 older labels, overridden by FAMILY_LABELS) |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:399` | badge | role-family filter |
| `public/features/comps.js:73` | Same role elsewhere |  |
| `public/features/comps.js:143` | Compare |  |
| `test/features.test.js:412` | tests | intentional lexicon vectors (20 real titles) |

Notes: Lexicon was hand-checked on 300 real titles (docs/process/product.md §5); new companies (beta big tech) were not part of that check.

### `keyword-lexicons`

Skills / responsibilities / fit keywords as aggregated in Insights and the keyword filters.

type **product-policy** · cadence **quarterly** (+30 d) · mode **manual** · updater `scripts/refresh/jobs.js` · as-of n/a · before: none

| Item (definition) |
|---|
| server/keywords.js [core] |

| Consumer | Surface | Note |
|---|---|---|
| `public/features/insights.js:58` | Insights | skill premium = median with skill − overall median (top 12, n ≥ 3) |
| `public/features/insights.js:137` | Insights | share of roles + premium (n ≥ 3) |
| `public/app.js:1294` | badge | keyword filter clouds, 14 shown |

### `listing-freshness-buckets`

Listing-age buckets and copy in the UI (filter options, card age, 180+ day notes).

type **product-policy** · cadence **yearly** (+60 d) · mode **manual** · updater `manual` · as-of 2026-10-02 · before: none

| Item (definition) |
|---|
| public/app.js:1259 Listed filter 7 / 30 / 90 days |
| public/app.js:433 hide roles open ≥ 180 days |
| public/app.js:1890 card age: < 60 → "Nd", < 730 → months (÷30.44), else years; "+" when a lower bound |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:1270` | badge |  |
| `public/app.js:2384` | drawer Juice block | Listing section |
| `public/mock-api.js:220` | API | mock copy |
| `docs/CONTRACT.md:144` | docs |  |
| `test/e2e/ui.e2e.js:448` | tests |  |

Notes: The 180-day UI threshold duplicates server/history.js FRESHNESS.STALE_MAX + 1 by hand.

### `history-ledger`

Ledger-derived job fields as shown in the UI (listed date, first seen, reposts, "New since your last visit", "Pay ↑/↓").

type **fetched** · cadence **daily** (+2 d) · mode **auto** · updater `scripts/snapshot.js + ledger.sh (daily); permanent copy: scripts/archive/**` · as-of n/a · before: daily pipeline (artifact or data-history branch)

| Item (definition) |
|---|
| server/history.js, scripts/history.js, .github/scripts/ledger.sh [core] |

| Consumer | Surface | Note |
|---|---|---|
| `public/app.js:2373` | drawer Juice block | "Listed N days ago (date)", "First seen by melon-seek on <date>", "Reposted N× since <month>" |
| `public/app.js:1902` | badge | "Pay ↑/↓" tag reads job.payChange, which NOTHING produces (dead UI); "New" = firstSeenAt after the last visit (localStorage); "Reposted" |
| `public/app.js:1271` | badge |  |
| `public/api.js:330` | API |  |
| `public/mock-api.js:248` | API | mock |

Notes: meta.history.since/runs is published but not displayed. Finding 5: app.js statusTag reads job.payChange {dir, pct}, but no producer exists anywhere (grep: only app.js and its dist copies); a pay-change signal exists only in the archive (scripts/archive/jobs.js counts payChanged). FIX: either have server/history.js annotate() emit payChange from the ledger (needs the previous salary per id in the ledger; history agent / big-tech data engineer) or the archive expose it; else delete the dead branch. Until then the "Pay ↑/↓" tag can never show.

### `geo-gazetteer`

Gazetteer size and coordinates as cited in docs and copied into mock/demo data.

type **static-data** · cadence **ad-hoc** (+365 d) · mode **manual** · updater `manual` · as-of n/a · before: none

| Item (definition) |
|---|
| server/geo.js [core] |

| Consumer | Surface | Note |
|---|---|---|
| `docs/CONTRACT.md:80` | docs | STALE (~200 vs 246) |
| `public/mock-api.js:16` | API | mock city coordinates (11 cities) |
| `public/features/demo-data.js:8` | API | demo coordinates (8 cities) |
| `public/viz/map.js:74` | map | pins aggregate at 0.1° |

### `country-currency`

Currency symbols and lists in the UI.

type **static-data** · cadence **ad-hoc** (+365 d) · mode **manual** · updater `manual` · as-of n/a · before: none

| Item (definition) |
|---|
| public/viz/palette.js:111 SYMBOLS (13 currencies) |
| public/app.js:90 CUR_SYM (9, a subset copy) |

| Consumer | Surface | Note |
|---|---|---|
| `public/viz/chart.js:332` | chart | stale list of 7 currencies |
| `public/app.js:91` | badge | card/drawer native-currency amounts |

Notes: Two symbol tables (palette SYMBOLS, app CUR_SYM) disagree on coverage (KRW, ILS, NZD, HKD missing from CUR_SYM).

### `demo-data`

Synthetic data in public/: features/demo-data.js (demo page + tests) and mock-api.js (?mock=1, localhost). Surface contribution to audit-core's demo-data entry.

type **product-policy** · cadence **ad-hoc** (+365 d) · mode **manual** · updater `manual` · as-of n/a · before: none

| Item (definition) |
|---|
| public/features/demo-data.js:7 demo city pay factors SF 1, NYC 0.98, Seattle 0.95, Austin 0.86, DC 0.9, London 0.62 GBP, Dublin 0.6 EUR, Zurich 0.78 CHF; remote 0.92 |
| public/features/demo-data.js:19 demo department base pay $330K/265K/250K/185K/160K/220K |
| public/features/demo-data.js:28 demo level pay multipliers Intern 0.35, Entry 0.68, Mid 0.86, Senior 1.0, Staff+ 1.3, Manager 1.15, Director+ 1.55 |
| public/features/demo-data.js:92 skill boosts CUDA 1.12, Rust 1.06, Excel 0.9; PhD 1.1 |
| public/features/demo-data.js:96 demo FX (USD per unit) GBP 1.27, EUR 1.09, CHF 1.13 |
| public/features/demo-data.js:129 fakeMarket FX copy |
| public/mock-api.js:30 mock rents/living/tax bands for 11 cities |
| public/mock-api.js:38 mock FX |
| public/mock-api.js:58 mock department bases $330K/260K/250K/190K/160K/220K/210K |
| public/mock-api.js:68 mock level multipliers Intern 0.35, Entry 0.62, Mid 0.85, Senior 1.0, Staff+ 1.3, Manager 1.15, Director+ 1.55 |
| public/mock-api.js:150 non-US 0.72 factor; 86% have pay; spread 12–28% |
| public/mock-api.js:248 mock backtest meta (0.14: wrong unit, contract is percent) and history {since 2025-08-28, runs 400} |
| public/viz/demo.html:91 viz demo department bases $340K..; public/viz/demo.html:130 DEMO_COST rent/tax per city + flat $19,000 living; fake comps rows with REAL company names and invented medians (Anthropic $340K, OpenAI $360K, Google DeepMind $285K ...) at public/viz/demo.html:180 (dev page only, excluded from dist) |

| Consumer | Surface | Note |
|---|---|---|
| `public/features/demo.html:45` | API | features demo page |
| `test/features.test.js:20` | tests | features tests run on fakeJobs: invariants only |
| `public/app.js:743` | badge | "Mock data" badge |

Notes: scripts/refresh/fx.js does not touch these copies (lead confirmed). Mock juice uses the old log score curve and stale London rent; mock compstimate medianAbsPctError 0.14 has the wrong unit. FIX (finding 6): mock-api.js and demo-data.js should import FX_TO_USD from ../viz/palette.js instead of their own {GBP 1.27, EUR 1.09, CHF 1.13}; mockJuice should call lib/juice.js computeJuice with api/cities.json (or at least use 100·(1−e^(−net/80000))); mock medianAbsPctError should be 14 (percent). Low priority: ?mock=1 is localhost-only and demo-data.js feeds tests and the dev demo page.

### `ops-constants`

Client-side ops constants (surface contribution).

type **product-policy** · cadence **ad-hoc** (+365 d) · mode **manual** · updater `manual` · as-of n/a · before: none

| Item (definition) |
|---|
| public/api.js:67 FRESH_TTL_MS 30 min |
| public/api.js:68 LIVE_TIMEOUT_MS 12 s |
| public/api.js:241 WORKER_READY_MS 10 s |
| public/api.js:685 JUICE_CHUNK 400 |
| public/app.js:550 PREPARE_CHUNK 300 |
| public/app.js:81 PAGE 24/60 |
| public/app.js:2249 compstimate meta retry 5 s |
| public/viz/map.js:207 map offline 4 s |

| Consumer | Surface | Note |
|---|---|---|
| `README.md:574` | README |  |

### `ui-stat-thresholds`

PROPOSED NEW ID. Product-policy thresholds that decide what the UI shows (top-N, minimum counts, labels, axis caps).

type **product-policy** · cadence **yearly** (+60 d) · mode **manual** · updater `scripts/refresh/policy.js (freshness-jobs) review reminder` · as-of 2026-10-02 · before: none

| Item (definition) |
|---|
| public/features/insights.js:58 skill premium top 12, n ≥ 3 |
| public/features/insights.js:242 departments with ≥ 3 salaried roles, top 10 |
| public/features/insights.js:272 copy "fewer than 3" (hard-coded) |
| public/features/insights.js:278 hot locations top 8 |
| public/features/insights.js:137 fit top 8, premium n ≥ 3; responsibilities top 10 |
| public/features/insights.js:249 department axis P2–P98 |
| public/app.js:2214 "Wide range" label at max/min ≥ 2.0× |
| public/app.js:505 salary slider cap |
| public/app.js:2029 drawer distribution 32 bins |
| public/viz/chart.js:35 chart bin widths $10K..$500K |
| public/viz/chart.js:107 robust axis: P1–P99 + 3·IQR fence |
| public/features/shared.js:155 deltas under $500 read ±$0; formatPct "<1%" |
| public/features/compstimate.js:391 accuracy floor ±1% |
| public/app.js:121 "just now" < 90 s, minutes < 1 h, hours < 1 d, days < 45 d, then a date (badge "Cached · N min ago") |
| public/app.js:1153 salary-filter histogram 26/30 bins |
| public/app.js:1294 keyword clouds show 14 (10 in popovers); checklists 10–14 |
| public/features/comps.js:105 Compare default family needs ≥ 2 companies |

| Consumer | Surface | Note |
|---|---|---|
| `public/features/insights.js:239` | Insights |  |
| `public/app.js:2208` | drawer Juice block |  |
| `public/viz/chart.js:101` | chart |  |
| `docs/VETTING.md:30` | docs |  |

## Appendix B. Tax entries (surface consumers only, generated)

71 ids (one per `TAX_SOURCES` key in the working tree). Every one is also consumed by the drawer Tax line (`public/app.js:2155`), the card badge and the map's Juice colouring. "Doc row" is its line in LIVABILITY.md §3 (the methodology page).

| id | tax year | doc row | doc row equals TAX_SOURCES now? | golden test |
|---|---:|---|---|---|
| `tax-us` | 2026 | `docs/LIVABILITY.md:297` | differs (tax agent mid-change) | `test/juice.test.js:45` intentional golden vector: 2026 federal brackets, SS wage base $184,500, Medicare 0.9% over $200K |
| `tax-us-ca` | 2025 | `docs/LIVABILITY.md:298` | differs (tax agent mid-change) | `test/juice.test.js:45` intentional golden vector (CA tax for $300K, SDI 1.3%; tax agent re-baselined it 2026-10-10 for itemized SALT) |
| `tax-us-ny` | 2026 | `docs/LIVABILITY.md:299` | differs (tax agent mid-change) | `test/juice.test.js:68` relational (NYC minus NY) |
| `tax-us-wa` | 2026 | `docs/LIVABILITY.md:300` | differs (tax agent mid-change) |  |
| `tax-us-tx` | 2026 | `docs/LIVABILITY.md:301` | differs (tax agent mid-change) | `test/juice.test.js:67` intentional (no state tax) |
| `tax-us-fl` | 2026 | `docs/LIVABILITY.md:302` | differs (tax agent mid-change) |  |
| `tax-us-tn` | 2026 | `docs/LIVABILITY.md:303` | differs (tax agent mid-change) |  |
| `tax-us-nv` | 2026 | `docs/LIVABILITY.md:304` | differs (tax agent mid-change) |  |
| `tax-us-ma` | 2025 | `docs/LIVABILITY.md:305` | differs (tax agent mid-change) |  |
| `tax-us-ga` | 2026 | `docs/LIVABILITY.md:306` | differs (tax agent mid-change) |  |
| `tax-us-dc` | 2025 | `docs/LIVABILITY.md:307` | differs (tax agent mid-change) |  |
| `tax-us-al` | 2025 | `docs/LIVABILITY.md:308` | differs (tax agent mid-change) |  |
| `tax-us-oh` | 2026 | `docs/LIVABILITY.md:309` | differs (tax agent mid-change) | `test/juice.test.js:65` intentional golden vector: Ohio 2.75% over $26,050 (+ credits) |
| `tax-us-va` | 2026 | `docs/LIVABILITY.md:310` | differs (tax agent mid-change) |  |
| `tax-us-il` | 2026 | `docs/LIVABILITY.md:311` | differs (tax agent mid-change) |  |
| `tax-us-co` | 2025 | `docs/LIVABILITY.md:312` | differs (tax agent mid-change) |  |
| `tax-us-pa` | 2026 | `docs/LIVABILITY.md:313` | differs (tax agent mid-change) |  |
| `tax-us-nc` | 2026 | `docs/LIVABILITY.md:314` | differs (tax agent mid-change) |  |
| `tax-us-or` | 2026 | `docs/LIVABILITY.md:315` | differs (tax agent mid-change) |  |
| `tax-us-ut` | 2025 | `docs/LIVABILITY.md:316` | differs (tax agent mid-change) |  |
| `tax-us-az` | 2025 | `docs/LIVABILITY.md:317` | differs (tax agent mid-change) |  |
| `tax-us-mn` | 2026 | `docs/LIVABILITY.md:318` | differs (tax agent mid-change) |  |
| `tax-us-mi` | 2026 | `docs/LIVABILITY.md:319` | differs (tax agent mid-change) |  |
| `tax-us-md` | 2025 | `docs/LIVABILITY.md:320` | differs (tax agent mid-change) |  |
| `tax-us-local-nyc` | 2026 | `docs/LIVABILITY.md:321` | differs (tax agent mid-change) | `test/juice.test.js:65` intentional golden vector: NYC 3.078/3.762/3.819/3.876% brackets (+ credits) |
| `tax-us-local-columbus` | 2024 | `docs/LIVABILITY.md:322` | differs (tax agent mid-change) | `test/juice.test.js:65` intentional golden vector: Columbus 2.5% |
| `tax-us-local-philadelphia` | 2026 | `docs/LIVABILITY.md:323` | differs (tax agent mid-change) |  |
| `tax-us-local-pittsburgh` | 2026 | `docs/LIVABILITY.md:324` | differs (tax agent mid-change) |  |
| `tax-us-local-detroit` | 2026 | `docs/LIVABILITY.md:325` | differs (tax agent mid-change) |  |
| `tax-us-local-portland` | 2026 | `docs/LIVABILITY.md:326` | differs (tax agent mid-change) |  |
| `tax-us-local-md-county` | 2025 | `docs/LIVABILITY.md:327` | differs (tax agent mid-change) |  |
| `tax-gb` | 2026 | `docs/LIVABILITY.md:328` | differs (tax agent mid-change) | `test/juice.test.js:79` intentional golden vector: £37,700 basic band, 40%, taper to £117,430, NICs 8%/2% |
| `tax-gb-sct` | 2026 | `docs/LIVABILITY.md:329` | differs (tax agent mid-change) |  |
| `tax-ie` | 2026 | `docs/LIVABILITY.md:330` | differs (tax agent mid-change) |  |
| `tax-ch` | 2026 | `docs/LIVABILITY.md:331` | differs (tax agent mid-change) |  |
| `tax-ch-zh` | 2026 | `docs/LIVABILITY.md:332` | differs (tax agent mid-change) |  |
| `tax-ch-ge` | 2025 | `docs/LIVABILITY.md:333` | differs (tax agent mid-change) |  |
| `tax-de` | 2026 | `docs/LIVABILITY.md:334` | differs (tax agent mid-change) |  |
| `tax-fr` | 2025 | `docs/LIVABILITY.md:335` | differs (tax agent mid-change) |  |
| `tax-nl` | 2026 | `docs/LIVABILITY.md:336` | differs (tax agent mid-change) |  |
| `tax-es` | 2026 | `docs/LIVABILITY.md:337` | differs (tax agent mid-change) |  |
| `tax-es-md` | 2026 | `docs/LIVABILITY.md §3` | no row (new key) |  |
| `tax-es-ct` | 2025 | `docs/LIVABILITY.md §3` | no row (new key) |  |
| `tax-pt` | 2026 | `docs/LIVABILITY.md:338` | differs (tax agent mid-change) |  |
| `tax-it` | 2026 | `docs/LIVABILITY.md:339` | yes |  |
| `tax-at` | 2026 | `docs/LIVABILITY.md:340` | differs (tax agent mid-change) |  |
| `tax-be` | 2025 | `docs/LIVABILITY.md:341` | yes |  |
| `tax-se` | 2026 | `docs/LIVABILITY.md:342` | differs (tax agent mid-change) |  |
| `tax-dk` | 2026 | `docs/LIVABILITY.md:343` | yes |  |
| `tax-no` | 2026 | `docs/LIVABILITY.md:344` | differs (tax agent mid-change) |  |
| `tax-fi` | 2025 | `docs/LIVABILITY.md:345` | yes |  |
| `tax-pl` | 2026 | `docs/LIVABILITY.md:346` | yes |  |
| `tax-cz` | 2026 | `docs/LIVABILITY.md:347` | yes |  |
| `tax-ee` | 2026 | `docs/LIVABILITY.md:348` | yes |  |
| `tax-il` | 2026 | `docs/LIVABILITY.md:349` | differs (tax agent mid-change) |  |
| `tax-ae` | 2026 | `docs/LIVABILITY.md:350` | yes |  |
| `tax-sa` | 2026 | `docs/LIVABILITY.md:351` | yes |  |
| `tax-jp` | 2026 | `docs/LIVABILITY.md:352` | differs (tax agent mid-change) |  |
| `tax-kr` | 2026 | `docs/LIVABILITY.md:353` | yes |  |
| `tax-sg` | 2026 | `docs/LIVABILITY.md:354` | differs (tax agent mid-change) |  |
| `tax-hk` | 2026 | `docs/LIVABILITY.md:355` | differs (tax agent mid-change) |  |
| `tax-tw` | 2025 | `docs/LIVABILITY.md:356` | yes |  |
| `tax-in` | 2026 | `docs/LIVABILITY.md:357` | yes |  |
| `tax-au` | 2026 | `docs/LIVABILITY.md:358` | differs (tax agent mid-change) |  |
| `tax-nz` | 2026 | `docs/LIVABILITY.md:359` | differs (tax agent mid-change) |  |
| `tax-ca` | 2026 | `docs/LIVABILITY.md:360` | differs (tax agent mid-change) |  |
| `tax-ca-on` | 2026 | `docs/LIVABILITY.md:361` | differs (tax agent mid-change) |  |
| `tax-ca-bc` | 2026 | `docs/LIVABILITY.md:362` | differs (tax agent mid-change) |  |
| `tax-ca-qc` | 2025 | `docs/LIVABILITY.md:363` | yes |  |
| `tax-mx` | 2025 | `docs/LIVABILITY.md:364` | yes |  |
| `tax-br` | 2026 | `docs/LIVABILITY.md:365` | differs (tax agent mid-change) |  |
