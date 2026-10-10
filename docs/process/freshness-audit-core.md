# Process log: freshness-audit-core

Inventory auditor #1 for the data-freshness work. It covers `server/*`, `data/*`, `scripts/*` and `.github/*` (non-test code).

## 1. Brief

- Prompt: [docs/process/prompts/freshness-audit-core.md](prompts/freshness-audit-core.md). The freshness lead wrote it; it was given verbatim.
- Goal: list every number, rate, threshold, constant, dataset and comparison these directories define or compute from, so that each one can be refreshed. That includes every job and company number (the user's follow-up). For each item, record:
  - where it lives, and who consumes it;
  - its source and licence;
  - its as-of date and real change frequency;
  - its type;
  - its update mechanism today, and the target one.
- Hand the registry entries to the lead as a JSON array.
- Files I own:
  - this log;
  - the prompt file;
  - the hand-off `<scratchpad>/freshness/registry-audit-core.json`;
  - `docs/process/patches/freshness-audit-core-*.diff`.
- I am read-only everywhere else.
- The generator and its scratch outputs live in `<scratchpad>/freshness/audit-core/`:
  - `gen.mjs`;
  - `tables.md`;
  - `npm-test.log`;
  - the patch work tree.

`<scratchpad>` = `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad`.

## 2. Inputs and sources

Repo files read in full or in the relevant parts:

| Area | Files |
|---|---|
| Server | `server/juice.js` (twice: before and after the Juice tax agent's rewrite), `salary.js`, `vet.js`, `keywords.js` (thresholds, lexicons, seniority), `geo.js` (tables and indexes), `normalize.js`, `demo.js` (catalogs, salaryFor, ages), `history.js`, `export.js`, `companies.js`, `pipeline.js`, `index.js` (TTLs, rate limits, CSP, backtest, market), `cache.js`, `store.js`, `server/sources/*` (ops constants, pay mapping) |
| Scripts | `scripts/build-market.js`, `build-static.js` (header, constants, shareStats/sharePage, context), `update-col.js`, `snapshot.js`, `history.js`, `vet-salaries.js`, `llm-vet.js`, `links-policy.js`, `external-links.js`, `probe-bigtech.js`, `methodology.js`, `build-og.mjs`, `md.js`, `e2e.js`; `scripts/refresh/run.js`, `lib.js`, `fx.js` (lead); `scripts/archive/lib.js`, `jobs.js` (archive agent) |
| Workflows | `.github/workflows/*.yml` (all 12, including the new `monthly-refresh.yml`, `archive.yml` and `archive-backfill.yml`); `.github/scripts/*` |
| Data | `data/cities.json` (every key); `data/snapshots/*.json` (8 files, gitignored, local); `data/vetting/2026-10-02/*`; `data/cache/store/*` (format only) |
| Briefs and docs | `docs/process/prompts/freshness-lead.md` and the sibling freshness prompts (scope split); `docs/DATA_FRESHNESS.md` (registry schema); `docs/process/TEMPLATE.md` |
| Grep only (for consumer lines) | `public/*` |

External checks:

| What | Source | Result |
|---|---|---|
| Node.js EOL dates | https://raw.githubusercontent.com/nodejs/Release/main/schedule.json (WebFetch, 2026-10-10) | v18 end 2025-04-30, v20 end 2026-04-30, v22 end 2027-04-30, v24 LTS from 2025-10-28 (end 2028-04-30) |
| Bulgaria in the euro area | https://www.europarl.europa.eu/thinktank/en/document/EPRS_ATA(2025)775850 and https://learning-corner.learning.europa.eu/news-and-competitions/bulgaria-joins-euro-new-chapter-begins-2026-01-01_en (WebSearch, 2026-10-10) | Adopted the euro on 2026-01-01 as the 21st member (EU Council, 2025-07-08) |
| Claude model ids | the `claude-api` skill's model table (cached 2026-10-06) | `claude-sonnet-5-5` is the current Sonnet; `server-side-fallback-2026-07-01` with `fallbacks: "default"` is the current scalar form. `scripts/llm-vet.js` is up to date |

No probe workflow was run: the audit needed no remote fetch.

## 3. Raw grep counts (scope: `server scripts .github`, excluding `*.json` / `*.jsonl`)

Numeric literals, `rg -c '\b\d[\d_,.]*\b'`:
- First pass at start: **3,095 hits in 67 files**.
- Re-count at the end: **3,757 hits in 79 files**. Other agents grew the tree in between: the tax rewrite took `server/juice.js` from 344 to 562 hits, and `scripts/refresh/*`, `scripts/archive/*` and new workflows arrived.

Per-file hit counts (first pass):

| file | hits | file | hits |
|---|---:|---|---:|
| server/geo.js | 393 | server/sources/google.js | 45 |
| server/juice.js | 344 (562 at the end) | .github/workflows/pages.yml | 45 |
| .github/scripts/juice-data-probe.py | 246 | server/sources/amazon.js | 44 |
| server/demo.js | 189 | scripts/refresh/run.js | 42 |
| server/salary.js | 133 | scripts/llm-vet.js | 42 |
| scripts/probe-bigtech.js | 129 | data/vetting/2026-10-02/review-rules.mjs | 41 |
| scripts/vet-salaries.js | 100 | scripts/external-links.js | 39 |
| server/index.js | 91 | server/vet.js | 38 |
| scripts/build-static.js | 87 | server/sources/meta.js | 38 |
| scripts/refresh/fx.js | 78 | scripts/update-col.js | 37 |
| server/keywords.js | 67 | scripts/snapshot.js | 35 |
| scripts/refresh/lib.js | 67 | scripts/archive/verify.js | 33 |
| scripts/archive/lib.js | 60 | server/sources/apple.js | 32 |
| server/sources/polite.js | 50 | server/history.js | 32 |
| scripts/methodology.js, scripts/md.js, scripts/build-market.js | 27 each | server/sources/eightfold.js | 26 |
| .github/workflows/ci.yml, .github/scripts/ledger.sh, juice-tax-probe.mjs | 25 each | server/sources/util.js, scripts/archive/jobs.js | 24 each |
| scripts/links-policy.js | 23 | scripts/archive/sweep.js, ingest.js, .github/scripts/freshness-probe.mjs | 20 each |
| server/pipeline.js | 18 | .github/scripts/beta-gate.sh | 17 |
| server/companies.js | 16 | scripts/build-og.mjs, snapshot.yml, check-site.sh | 15 each |
| server/normalize.js | 14 | server/store.js, server/cache.js, scripts/refresh/bigmac.js, site-watchdog.yml | 12 each |
| scripts/history.js | 11 | server/sources/greenhouse.js, col-refresh.yml, wait-pages-build.sh | 10 each |
| other 11 files | 1-8 each | | |

Keyword greps (case-insensitive, hits / files):

| pattern | hits | files | pattern | hits | files |
|---|---:|---:|---|---:|---:|
| `asOf` | 149 | 9 | `\bcap\b` | 35 | 12 |
| `as of` | 8 | 5 | `\bbase\b` | 163 | 24 |
| `as_of` | 11 | 4 | `threshold` | 7 | 2 |
| `taxYear` | 1 | 1 | `\bmin\b` | 182 | 25 |
| `\b202[3-7]\b` | 99 | 13 | `\bmax\b` | 200 | 35 |
| currency symbols `[$€£¥₩₹]\|CHF\|\bkr\b` | 1,517 (mostly `$` in JS template literals and shell) | 64 | `bound` | 50 | 12 |
| `%` | 132 | 27 | `anchor` | 17 | 7 |
| `/yr` | 6 | 2 | `grade` | 15 | 6 |
| `per year` | 3 | 2 | `multiplier` | 3 | 2 |
| `perUSD` | 60 | 5 | `LEVEL` | 84 | 19 |
| `\brate` | 68 | 15 | `SENIORITY` | 25 | 8 |

Classification of the numeric hits:
- **Data, rates and thresholds that need refreshing**:
  - tax rules (juice.js);
  - FX (juice.js, salary.js);
  - Big Mac, rents, cost index and baseline (cities.json);
  - geo coordinates (geo.js);
  - currency tables (salary.js, vet-salaries.js, greenhouse.js).
- **Product policy**:
  - score anchors and grades;
  - households and living scale;
  - parser and vetting bounds;
  - interval factors;
  - market minN and rounding;
  - backtest options;
  - freshness bands and the repost window;
  - the ledger prune window;
  - lexicon sizes and thresholds;
  - demo catalogs;
  - the LLM model id.
- **Ops**: timeouts, TTLs, page sizes, retries, byte caps, user agents, CSP hosts, workflow crons, retention and timeouts. These go into the `ops-constants` and `workflow-schedules` entries; cadence ad-hoc.
- **Trivial, not listed**: 0/1/2, indices, CSS px in `scripts/methodology.js`, hash constants (FNV, cyrb53, mulberry32), regex quantifiers, HTTP status codes, the probe scripts' request plumbing (`juice-data-probe.py`, `probe-bigtech.js`, `freshness-probe.mjs`).
- **Excluded**: `scripts/refresh/*` and `scripts/archive/*` are freshness and archive infrastructure, not product numbers. The other agents own them.

## 4. Data-file schemas

### `data/cities.json`

Top-level keys:
- `name`, `description`, `version` (1), `updated` (2026-10-02; set to the run date by update-col.js), `license`;
- `baseline` {nycBasketUSD 19982, monthlyUSD 1665.2, sources.nycBasketUSD, sources.crossCheck (BLS CE 2024)};
- `sourceNotes` {numbeo-snippets, numbeo-terms, big-mac};
- `dataStatus.numbeo` ("UNDER REVIEW");
- `fx` {asOf 2026-07-01, note, source, perUSD (23 currencies)};
- `bigMac` {asOf 2026-07-01, source, byCountry: 33 ISO2 → {name, currency, localPrice, dollarEx, dollarPrice}};
- `bedroomRatios` (description + 45 keys, each with r2 and r3: 30 US HUD FY2026 metros (asOf 2025-10), 5 GB ONS (2026-08), 4 CA StatCan (2026-04), CH, FR, IE, SG, AU-sydney, and pooled r2 1.281 / r3 1.533 used by 33 cities);
- `cities`.

**89 cities in 33 countries**: US 40, GB 5, CA 4, IN 4, and so on. Each city has:
- `key`, `name`, `city`, `region`, `country`, `currency`, `aliases`, `nearby`;
- `tax` {country, region, local}: 61 distinct jurisdictions;
- `rent1brCenterLocal`, `rent1brOutsideLocal`, `rent1brCenterUSD`, `rent1brOutsideUSD`;
- `rent2brCenterLocal/USD`, `rent3brCenterLocal/USD`: the household agent's new fields, estimates from the bedroom ratios;
- `costIndex`, `bigMacUSD`, `fxPerUSD`;
- `sources.<field>` {name, url, asOf, retrieved, class, terms, via, method, ratio, ratioKey, fxAsOf, estimated, crossCheck, audit[]}. There are 25 audit rows in total (HUD SAFMR, ZORI, Zumper).

Source classes:
- rent1brCenterLocal: 88 aggregator + 1 official (Sydney);
- costIndex: 78 aggregator + 11 estimate;
- rent2br and rent3br: 88 estimate + 1 official;
- bigMacUSD and fxPerUSD: 89 open.

As-of ranges: rents 2026-05..2026-10, costIndex 2026-06..2026-10.

### `data/snapshots/*.json` (gitignored, local, fetched 2026-10-02T05:54Z)

- Fields: `company`, `mode`, `fetchedAt`, `error`, `jobs[]`. These files predate `normalizerVersion`.
- Job fields: `id`, `company`, `companyName`, `title`, `department`, `team`, `employmentType`, `seniority`, `locations[]` {name, city, region, country, lat, lng, remote}, `remote`, `salary` {min, max, mid, currency, interval, text}, `url`, `updatedAt`, `descriptionHtml`, `sections`, `keywords`.
- **5,413 jobs, 4,602 salaried**:

| company | jobs | salaried |
|---|---:|---:|
| anduril | 2,418 | 2,277 |
| anthropic | 638 | 558 |
| cohere | 132 | 132 |
| openai | 833 | 674 |
| palantir | 320 | 240 |
| scaleai | 194 | 131 |
| shieldai | 581 | 456 |
| xai | 297 | 134 |

- The current normalizer adds `postedAt`, `reqId`, `extras`, `salary.kind/spread/zones/source/originalInterval/intervalCorrected/statedInterval/ranges`, `structuredRejected`, `salaryRaw` and `salaryFlag`. The history annotation adds `firstSeenAt`, `ageDays`, `ageIsMinimum`, `freshness` and `repost`.

### `data/cache/store`

- `melon-store-1` `.list.json` {format, fetchedAt, normalizerVersion (norm-5), sourceKey, count, desc[[offset, length]], jobs (no descriptionHtml)} plus `.desc.ndjson`.
- The live cache is `melon-cache-2` {fetchedAt, store, data}, with FRESH_TTL 30 min.
- Gitignored.

### `data/vetting/2026-10-02/` (in git)

| file | content |
|---|---|
| flags.jsonl | 505 rows {id, company, title, url, employmentType, countries, source, parsed, excerpt, pay_snippets, flags, critical, quarantined} |
| sample.jsonl | 176 rows |
| verdicts.jsonl | 681 rows {id, url, company, title, review_set, flags, parsed, corrected, verdict, kind, evidence, reviewer, reviewed_at, parser_version}: 551 correct / 111 parser_bug / 19 source_ambiguous |
| tier-spans.json | 59 ids → {lo, hi} |
| flags.counts.json | per company {jobs, salaried, quarantined, flagged, critical, blocking, codes} |
| others | flags.renormalized.*, review-rules.mjs (its own copy of the interval factors), summary.md |

The LLM verdict schema is `scripts/llm-vet.js` VERDICT_SCHEMA {verdict, corrected, kind, quote, evidence}.

### History ledger (`server/history.js`)

- Format `melon-history-1`: {since, lastRunAt, runs, jobs{id: {f, l, p, k, r, c, n, o, s}}}.
- Compact form for `dist/api/history/<slug>.json`: `{id: [firstSeenAt, postedAt, repostCount, repostFirstSeenAt?]}`, open entries only.
- `meta.history` = {since, runs}.
- Persisted by `.github/scripts/ledger.sh`:
  - default: the `history-ledger` artifact (retention 90 days);
  - with the repository variable `HISTORY_STORE=branch`: the orphan branch `data-history`, `history/<slug>.json`.
- `data/history/` is gitignored and there is none locally.
- Closed entries older than **PRUNE_CLOSED_DAYS = 400** are deleted.

## 5. Decisions

1. **Ids.** I used exactly the lead's id list from the forwarded message:
   - tax: `tax-` + lower-cased TAX_SOURCES key;
   - fx, rents, living, juice policy, jobs, reference and derived ids as given.
   - One new id is proposed: `runtime-versions`. The lead accepted it.
   - TAX_SOURCES has **71** keys now, not 69: the tax agent added `ES-MD` and `ES-CT` during this audit. The generator emits one entry per key.
2. **Generated, not hand-typed.** Every `file:line` comes from `gen.mjs` at generation time, by regex lookup in the working tree, because four agents are editing these files. Re-run it for current lines:

   ```
   node <scratchpad>/freshness/audit-core/gen.mjs /home/user/melon-seek
   ```

   For tax entries, `values` is the rule's code text plus the text of every top-level tax constant it references. The references are found breadth-first, up to 3 levels, in the tax section only. This copies the numbers exactly; it never paraphrases them. Asserts at the end re-check the hand-copied figures:
   - fullGlassUSD 423866;
   - NYC basket code = data;
   - 89 cities;
   - MAX_ANNUAL salary.js = vet.js.
3. **Tax asOf** is the start of the tax year that TAX_SOURCES.asOf claims:
   - calendar year → YYYY-01-01;
   - GB → YYYY-04-06;
   - AU → YYYY-07-01;
   - IN, NZ, HK → YYYY-04-01.

   `taxYear` is the first 4-digit year in asOf. `lastChecked` is TAX_SOURCES.reviewed. The lead keeps TAX_SOURCES authoritative and unions my owners with its own registry.js output.
4. **Job and company numbers.**
   - `fetched` or `derived-at-build`, with updater "daily pipeline (...)" so that run.js treats them as pipeline entries.
   - The USD conversion is its own entry, `job-salary-usd`. It lists the four conversion paths, because a refreshed FX table moves every derived job number.
5. **Mode for product policy** is `manual` with updater `scripts/refresh/policy.js` (freshness-jobs) and a yearly or quarterly review checklist. Policy is never auto-updated.
6. **No-source items** are recorded with `source.name` "none cited" and a candidate source: geo coordinates, demo pay bases, EXTRA_FX_PER_USD.
7. **Patches.** I wrote two small patches; the other findings stay as notes:
   - **demo.js FX**: changing it changes demo outputs (test/demo.test.js). I suggest the lead add `server/demo.js` `FX` to fx.js FX_CODE_COPIES, which has the same per-USD shape, or derive it from salary.js.
   - **ledger prune**: belongs to the archive agent and the history owner.
   - **fx test (d)**: the lead is adding it to test/freshness.test.js.

## 6. Item-level inventory

The tables below are `tables.md` as generated on 2026-10-10. The registry entries in the hand-off carry the same data, plus checklist, validator, source, licence and notes.

**Totals: 112 entries (71 tax).**

| by type | count | by cadence | count | by mode | count |
|---|---:|---|---:|---|---:|
| static-constant-from-a-source | 75 | yearly | 83 | detect | 74 |
| product-policy | 17 | daily | 9 | manual | 23 |
| static-data | 7 | ad-hoc | 9 | auto | 15 |
| derived-at-build | 7 | monthly | 6 | | |
| fetched | 6 | quarterly | 3 | | |
| | | semiannual | 2 | | |

### 6.0 Which FX each derived number uses (job and company numbers)

| number | code that converts it | FX table |
|---|---|---|
| Chart, map, card pay | `public/app.js` `j._usd`, `viz/chart.js`, `viz/map.js` → `palette.toUSD` | `public/viz/palette.js` FX_PER_USD |
| Market comps cells (Same role elsewhere) | `scripts/build-market.js` `usdMid` (currencies without palette FX are dropped) | palette FX_PER_USD |
| Compstimate, Insights, Compare | `public/features/shared.js` `toUSD` | palette, then FX_FALLBACK (adds CNY 0.14) |
| Vetting bounds, stat outliers, share-page medians | `server/salary.js` `toUSD` / `USD_PER` (via vet.js) | salary.js FX_PER_USD + EXTRA_FX_PER_USD (QAR, CNY, ZAR) |
| Juice per job | `server/juice.js` `usdPerUnit` / `toUSD` | juice.js FX_PER_USD, then cities.json fx.perUSD, then city.fxPerUSD |
| Archive job rows | `scripts/archive/jobs.js` | palette FX_PER_USD |
| Demo jobs | `server/demo.js` `FX` | its own {USD 1, GBP 0.78, EUR 0.9} (inconsistent) |

The copies are all equal today, except demo. `scripts/refresh/fx.js` rewrites palette, juice, salary, shared.js and cities.json together.

### 6.1 Entries by group (generated by gen.mjs)

#### juice-fx

| id | type | cadence | mode | as-of | items (owner file:line and symbol) | values | before |
|---|---|---|---|---|---|---|---|
| `fx-per-usd` | fetched | monthly | auto | 2026-07-01 | `server/juice.js:45 FX_PER_USD`<br>`server/juice.js:42 FX_AS_OF`<br>`public/viz/palette.js:129 FX_PER_USD`<br>`public/viz/palette.js:128 FX_AS_OF`<br>`server/salary.js:57 FX_PER_USD`<br>`server/salary.js:83 EXTRA_FX_PER_USD`<br>`public/features/shared.js:18 FX_FALLBACK.CNY`<br>`data/cities.json fx.perUSD (+ fx.asOf, fx.source)`<br>`data/cities.json cities[].fxPerUSD (89) + sources.fxPerUSD.asOf`<br>`data/cities.json bigMac.byCountry[].dollarEx (33)` | 23 currencies, as of 2026-07-01: AED 3.67285, AUD 1.42867347667691, BRL 5.07935, CAD 1.40515, CHF 0.80735, CZK 21.1625, DKK 6.5366, EUR 0.87439, GBP 0.74187, HKD 7.83895, ILS 2.9993, INR 96.26375, JPY 162.135, KRW 1485.9, MXN 17.386, NOK 9.68565, NZD 1.71335560695622, PLN 3.77915, SAR 3.755, SEK 9.63495, SGD 1.29005, TWD 32.1875, USD 1; salary.js EXTRA_FX_PER_USD QAR 3.64, CNY 7.14, ZAR 18.2; shar | col-refresh.yml (monthly, scripts/update-col.js) refreshed ONLY data/cities.json fx.perUSD/fxPerUSD from the Big Mac file; the three code copies and FX_AS_OF were edited by hand |
| `fx-usd-pegs` | static-constant-from-a-source | yearly | auto | 2026-07-01 | `server/juice.js:46 FX_PER_USD.AED`<br>`server/juice.js:64 FX_PER_USD.SAR`<br>`server/salary.js:83 EXTRA_FX_PER_USD.QAR`<br>`scripts/refresh/fx.js:39 PEGS (fx.js reference values)` | encoded AED 3.67285, SAR 3.755 (Big Mac dollar_ex, market quotes), QAR 3.64; official pegs AED 3.6725 (CBUAE), SAR 3.75 (SAMA), QAR 3.64 (QCB) | none (market dollar_ex values, not the pegs) |
| `bigmac-prices` | fetched | semiannual | auto | 2026-07-01 | `data/cities.json bigMac.byCountry (33 countries: localPrice, currency, dollarEx, dollarPrice)`<br>`data/cities.json cities[].bigMacUSD (89) + sources.bigMacUSD`<br>`scripts/update-col.js:121 applyBigMac`<br>`scripts/update-col.js:39 BIG_MAC_CSV_URL` | release 2026-07-01; 33 countries, e.g. US 6.22 USD, CH 9.04 USD, JP 3.08 USD | col-refresh.yml monthly cron "23 5 3 * *" -> scripts/update-col.js -> bot/col-refresh branch + PR (PR creation needs the repo setting); col-refresh.yml is now dispatch-only and monthly-refresh.yml runs bigmac.js |

#### juice-rent

| id | type | cadence | mode | as-of | items (owner file:line and symbol) | values | before |
|---|---|---|---|---|---|---|---|
| `rents-1br-quoted` | static-data | monthly | manual | 2026-09-01 | `data/cities.json cities[].rent1brCenterLocal / rent1brOutsideLocal (89 each) + sources.*`<br>`data/cities.json cities[].rent1brCenterUSD / rent1brOutsideUSD (89 each, = round(local / fxPerUSD))`<br>`server/juice.js:124 RENT_FIELDS`<br>`scripts/update-col.js:31 RENT_PAIRS` | 89 cities; rent1brCenterLocal classes: 88 aggregator, 1 official; as-of 2026-05..2026-10; e.g. San Francisco 3678.75 USD centre / 2618.75 outside | manual (docs/LIVABILITY.md "Refreshing"); USD fields re-derived by update-col.js on each Big Mac refresh |
| `rents-bedroom-ratios` | static-data | yearly | detect | 2025-10-01 | `data/cities.json bedroomRatios (r2, r3 per key)`<br>`data/cities.json cities[].rent2brCenterLocal/USD, rent3brCenterLocal/USD (89 each; sources.*.ratio, ratioKey, method)` | 45 ratio keys: 30 US HUD FY2026 FMR metros (asOf 2025-10), 5 GB ONS PIPR (2026-08), 4 CA StatCan 46-10-0092-01 (2026-04), CH Zurich (2026-04), FR (2025-01), IE CSO RIQ02 (2025-12), SG (2026-06), AU-sydney NSW (2026-06), pooled r2 1.281 r3 1.533 (used by 33 cities); rent2br classes: 88 estimate(est), 1 official | none (one-off by the Juice household agent, 2026-10) |
| `rents-nsw-official` | static-data | quarterly | auto | 2026-06-01 | `data/cities.json cities[key=sydney-nsw-au].rent1brCenterLocal/rent2brCenterLocal/rent3brCenterLocal (class official)`<br>`data/cities.json bedroomRatios["AU-sydney"]` | weekly flats/units 1br $819, 2br $1,150, 3br $1,550 (June quarter 2026) x 52 / 12 per month; r2 1.404, r3 1.893 | none (one-off) |

#### juice-living

| id | type | cadence | mode | as-of | items (owner file:line and symbol) | values | before |
|---|---|---|---|---|---|---|---|
| `cost-index` | static-data | monthly | manual | 2026-09-01 | `data/cities.json cities[].costIndex (89) + sources.costIndex (method, crossCheck)` | 89 cities; classes: 78 aggregator, 11 estimate(est); as-of 2026-06..2026-10; e.g. San Francisco 91 | manual (docs/LIVABILITY.md "Refreshing") |
| `nyc-basket` | static-constant-from-a-source | monthly | manual | 2026-09-01 | `server/juice.js:76 NYC_BASKET_USD`<br>`data/cities.json baseline.nycBasketUSD / monthlyUSD / sources.nycBasketUSD` | NYC_BASKET_USD 19982 = $1665.2 x 12 (Numbeo 2026-09); cross-check BLS CE 2024 one-person total $48,794 (incl. shelter) | manual |
| `living-scale` | static-constant-from-a-source | ad-hoc | manual | 2026-01-01 | `server/juice.js:94 LIVING_SCALE`<br>`server/juice.js:117 livingScaleFor`<br>`server/juice.js:1245 inputs.household.source.asOf '2026' (hard-coded)` | firstAdult 0.58, extraAdult 0.42, child 0.2; couple x1.724, family x2.414 | none |

#### juice-policy

| id | type | cadence | mode | as-of | items (owner file:line and symbol) | values | before |
|---|---|---|---|---|---|---|---|
| `juice-score-anchors` | product-policy | yearly | manual | 2026-10-02 | `server/juice.js:136 K_USD`<br>`server/juice.js:137 SCORE_ANCHORS`<br>`public/viz/palette.js:237 JUICE_ANCHORS (fallback copy)` | K 80000, fullGlassUSD 423866 (= ceil(K ln 200)); tuned on the 2026-10-02 snapshots (4,034 scored jobs: p90 net $172.6K -> 88, p99 $277K -> 97) | none |
| `juice-grades` | product-policy | yearly | manual | 2026-10-02 | `server/juice.js:144 GRADES`<br>`server/juice.js:149 RIND`<br>`public/viz/palette.js:232 JUICE_BREAKS [45, 70] (copy)` | Juicy >= 70, Ripe >= 45, Dry >= 0, Rind when net <= 0 | none |
| `juice-confidence-rules` | product-policy | yearly | manual | 2026-10-02 | `server/juice.js:1131 SOURCE_CLASSES`<br>`server/juice.js:1133 CLASS_CONFIDENCE`<br>`server/juice.js:1136 sourceClass (numbeo.com -> aggregator)`<br>`server/juice.js:1149 taxConfidence`<br>`server/juice.js:1164 confidenceFor`<br>`scripts/update-col.js:37 SOURCE_CLASSES (copy)` | official/open/user -> high, aggregator -> medium, estimate -> low; tax: estimated -> low, approximate or unverified -> medium, verified -> high; non-US -> low unless rent AND costIndex are official/open/user | none |
| `households` | product-policy | ad-hoc | manual | 2026-10-10 | `server/juice.js:103 HOUSEHOLDS`<br>`server/juice.js:109 DEFAULT_HOUSEHOLD`<br>`public/app.js:2065 HOUSEHOLDS (UI copy: labels, tooltips, bedrooms)` | single: 1 adult(s), 0 children, 1-bed; couple: 2 adult(s), 0 children, 2-bed; family: 2 adult(s), 2 children, 3-bed | none |

#### tax

| id | type | cadence | mode | as-of | items (owner file:line and symbol) | values | before |
|---|---|---|---|---|---|---|---|
| `tax-us` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:496 usTax`<br>`server/juice.js:226 US_SS_BASE_2026`<br>`server/juice.js:227 US_ADDL_MEDICARE`<br>`server/juice.js:225 US_STD_2026`<br>`server/juice.js:235 usFederalIncomeTax`<br>`server/juice.js:231 usSaltCap`<br>`server/juice.js:221 US_FED_2026`<br>`server/juice.js:229 US_CTC_PHASE`<br>`server/juice.js:228 US_CTC_2026`<br>`server/juice.js:888 TAX_SOURCES['US']` | function usTax(g, j, hh) { const fs = usFs(hh); const fica = 0.062 * min(g, US_SS_BASE_2026) + 0.0145 * g + 0.009 * pos(g - US_ADDL_MEDICARE[fs]); if (j.region && !US_STATE[j.region]) throw new Error(`no US state tax rule for ${j.region}`); if (j.local && !US_LOCAL[j.local]) throw new Error(`no US local tax rule for ${j.local}`); const sub = (fedTax, fedDeduction) => { const st = j.region ? US_STA | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-ca` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:324 US_STATE.CA`<br>`server/juice.js:252 CA_Y_2025`<br>`server/juice.js:251 CA_X_2025`<br>`server/juice.js:889 TAX_SOURCES['US-CA']` | CA(g, { hh }) { const m = hh.married; const ti = pos(g - (m ? 11412 : 5706)); const steps = Math.ceil(pos(g - (m ? 504411 : 252203)) / 2500); const credits = (m ? 2 : 1) * pos(153 - 6 * steps); const sdi = 0.013 * g; return { regional: pos(progressive(ti, m ? CA_Y_2025 : CA_X_2025) - credits) + 0.01 * pos(ti - 1e6), social: sdi, deductible: sdi, taxable: ti }; }, \| const CA_Y_2025 = [[22158, 0.01] | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-ny` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:336 US_STATE.NY`<br>`server/juice.js:268 nysTax`<br>`server/juice.js:254 NYS_2026`<br>`server/juice.js:261 NYS_RECAPTURE_2026`<br>`server/juice.js:265 nyPhase`<br>`server/juice.js:890 TAX_SOURCES['US-NY']` | NY(g, { hh }) { const m = hh.married; const ti = pos(g - (m ? 16050 : 8000) - 1000 * hh.kids); const payroll = min(0.00432 * g, 411.91) + min(0.005 * g, 0.6 * 52); return { regional: nysTax(ti, g, m), social: payroll, deductible: payroll, taxable: ti }; }, \| const NYS_2026 = { single: [[8500, 0.039], [11700, 0.044], [13900, 0.0515], [80650, 0.054], [215400, 0.059], [1077550, 0.0685], [5e6, 0.0965] | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-wa` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:344 US_STATE.WA`<br>`server/juice.js:226 US_SS_BASE_2026`<br>`server/juice.js:891 TAX_SOURCES['US-WA']` | WA(g) { const pfml = 0.0113 * 0.7143 * min(g, US_SS_BASE_2026); return { regional: 0, social: 0.0058 * g + pfml, deductible: pfml }; }, \| const US_SS_BASE_2026 = 184500; | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-tx` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:350 US_STATE.TX`<br>`server/juice.js:892 TAX_SOURCES['US-TX']` | TX: () => ({ regional: 0 }), | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-fl` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:351 US_STATE.FL`<br>`server/juice.js:893 TAX_SOURCES['US-FL']` | FL: () => ({ regional: 0 }), | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-tn` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:352 US_STATE.TN`<br>`server/juice.js:894 TAX_SOURCES['US-TN']` | TN: () => ({ regional: 0 }), | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-nv` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:353 US_STATE.NV`<br>`server/juice.js:895 TAX_SOURCES['US-NV']` | NV: () => ({ regional: 0 }), | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-ma` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:354 US_STATE.MA`<br>`server/juice.js:226 US_SS_BASE_2026`<br>`server/juice.js:896 TAX_SOURCES['US-MA']` | MA(g, { hh }) { const fica = 0.062 * min(g, US_SS_BASE_2026) + 0.0145 * g; const ti = pos(g - (hh.married ? 8800 : 4400) - 1000 * hh.kids - min(2000, fica)); const pfml = 0.0046 * min(g, US_SS_BASE_2026); return { regional: 0.05 * ti + 0.04 * pos(ti - 1107750), social: pfml, deductible: pfml, taxable: ti }; }, \| const US_SS_BASE_2026 = 184500; | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-ga` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:363 US_STATE.GA`<br>`server/juice.js:897 TAX_SOURCES['US-GA']` | GA(g, { hh }) { const ti = pos(g - (hh.married ? 30000 : 15000) - 5000 * hh.kids); return { regional: 0.0499 * ti, taxable: ti }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-dc` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:368 US_STATE.DC`<br>`server/juice.js:898 TAX_SOURCES['US-DC']` | DC(g, { hh }) { const ti = pos(g - (hh.married ? 30000 : 15000)); return { regional: progressive(ti, [[10000, 0.04], [40000, 0.06], [60000, 0.065], [250000, 0.085], [500000, 0.0925], [1e6, 0.0975], [INF, 0.1075]]), taxable: ti }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-al` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:374 US_STATE.AL`<br>`server/juice.js:305 alStd`<br>`server/juice.js:303 AL_2025`<br>`server/juice.js:899 TAX_SOURCES['US-AL']` | AL(g, { hh, fedTax }) { const m = hh.married; const dep = (g <= 50000 ? 1000 : g <= 100000 ? 500 : 300) * hh.kids; const ti = pos(g - fedTax - alStd(g, m) - (m ? 3000 : 1500) - dep); return { regional: progressive(ti, m ? AL_2025.mfj : AL_2025.single), taxable: ti }; }, \| const AL_2025 = { single: [[500, 0.02], [3000, 0.04], [INF, 0.05]], mfj: [[1000, 0.02], [6000, 0.04], [INF, 0.05]] }; | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-oh` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:382 US_STATE.OH`<br>`server/juice.js:900 TAX_SOURCES['US-OH']` | OH(g, { hh }) { const ex = g >= 500000 ? 0 : g > 80000 ? 1900 : g > 40000 ? 2150 : 2400; const ti = pos(g - ex * usPersons(hh)); return { regional: ti > 26050 ? 332 + 0.0275 * (ti - 26050) : 0, taxable: ti }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-va` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:389 US_STATE.VA`<br>`server/juice.js:901 TAX_SOURCES['US-VA']` | VA(g, { hh }) { const ti = pos(g - (hh.married ? 17500 : 8750) - 930 * usPersons(hh)); return { regional: progressive(ti, [[3000, 0.02], [5000, 0.03], [17000, 0.05], [INF, 0.0575]]), taxable: ti }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-il` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:395 US_STATE.IL`<br>`server/juice.js:902 TAX_SOURCES['US-IL']` | IL(g, { hh }) { const ti = pos(g - (g > (hh.married ? 500000 : 250000) ? 0 : 2925 * usPersons(hh))); return { regional: 0.0495 * ti, taxable: ti }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-co` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:400 US_STATE.CO`<br>`server/juice.js:225 US_STD_2026`<br>`server/juice.js:903 TAX_SOURCES['US-CO']` | CO(g, { hh }) { const std = US_STD_2026[usFs(hh)]; const ti = pos(g - (g > 300000 ? min(std, hh.married ? 2000 : 1000) : std)); return { regional: 0.044 * ti, taxable: ti }; }, \| const US_STD_2026 = { single: 16100, mfj: 32200 }; | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-pa` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:409 US_STATE.PA`<br>`server/juice.js:904 TAX_SOURCES['US-PA']` | PA(g) { const uc = 0.0007 * g; return { regional: 0.0307 * g, social: uc, deductible: uc, taxable: g }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-nc` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:414 US_STATE.NC`<br>`server/juice.js:319 ncChildDeduction`<br>`server/juice.js:905 TAX_SOURCES['US-NC']` | NC(g, { hh }) { const ti = pos(g - (hh.married ? 25500 : 12750) - hh.kids * ncChildDeduction(g)); return { regional: 0.0399 * ti, taxable: ti }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-or` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:419 US_STATE.OR`<br>`server/juice.js:295 orFederalSubtraction`<br>`server/juice.js:226 US_SS_BASE_2026`<br>`server/juice.js:291 OR_2026`<br>`server/juice.js:906 TAX_SOURCES['US-OR']` | OR(g, { hh, fedTax }) { const m = hh.married; const ti = pos(g - (m ? 5820 : 2910) - orFederalSubtraction(g, fedTax, hh)); const exemption = g <= (m ? 200000 : 100000) ? 263 * usPersons(hh) : 0; const paidLeave = 0.006 * min(g, US_SS_BASE_2026); return { regional: pos(progressive(ti, m ? OR_2026.mfj : OR_2026.single) - exemption) + 0.001 * g, social: paidLeave, deductible: paidLeave, taxable: ti } | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-ut` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:429 US_STATE.UT`<br>`server/juice.js:225 US_STD_2026`<br>`server/juice.js:907 TAX_SOURCES['US-UT']` | UT(g, { hh }) { const credit = pos(0.06 * (US_STD_2026[usFs(hh)] + 2111 * hh.kids) - 0.013 * pos(g - (hh.married ? 36426 : 18213))); return { regional: pos(0.045 * g - credit), taxable: g }; }, \| const US_STD_2026 = { single: 16100, mfj: 32200 }; | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-az` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:435 US_STATE.AZ`<br>`server/juice.js:908 TAX_SOURCES['US-AZ']` | AZ(g, { hh }) { const ti = pos(g - (hh.married ? 31500 : 15750)); const over = pos(g - (hh.married ? 400000 : 200000)); const credit = 100 * hh.kids * pos(1 - 0.05 * Math.ceil(over / 1000)); return { regional: pos(0.025 * ti - credit), taxable: ti }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-mn` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:443 US_STATE.MN`<br>`server/juice.js:226 US_SS_BASE_2026`<br>`server/juice.js:909 TAX_SOURCES['US-MN']` | MN(g, { hh }) { const m = hh.married; const ti = pos(g - (m ? 30600 : 15300) - 5300 * hh.kids); const b = m ? [[48700, 0.0535], [193480, 0.068], [337930, 0.0785], [INF, 0.0985]] : [[33310, 0.0535], [109430, 0.068], [203150, 0.0785], [INF, 0.0985]]; const paidLeave = 0.0044 * min(g, US_SS_BASE_2026); return { regional: progressive(ti, b), social: paidLeave, deductible: paidLeave, taxable: ti }; },  | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-mi` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:453 US_STATE.MI`<br>`server/juice.js:910 TAX_SOURCES['US-MI']` | MI(g, { hh }) { const ti = pos(g - 5900 * usPersons(hh)); return { regional: 0.0425 * ti, taxable: ti }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-md` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:458 US_STATE.MD`<br>`server/juice.js:316 mdTaxable`<br>`server/juice.js:312 MD_2025`<br>`server/juice.js:911 TAX_SOURCES['US-MD']` | MD(g, { hh }) { const ti = mdTaxable(g, hh); return { regional: progressive(ti, hh.married ? MD_2025.mfj : MD_2025.single), taxable: ti }; }, \| const MD_2025 = { single: [[1000, 0.02], [2000, 0.03], [3000, 0.04], [100000, 0.0475], [125000, 0.05], [150000, 0.0525], [250000, 0.055], [500000, 0.0575], [1e6, 0.0625], [INF, 0.065]], mfj: [[1000, 0.02], [2000, 0.03], [3000, 0.04], [150000, 0.0475], [175 | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-local-nyc` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:467 US_LOCAL.NYC`<br>`server/juice.js:283 NYC_2026`<br>`server/juice.js:912 TAX_SOURCES['US-LOCAL-NYC']` | NYC(g, { hh, taxable }) { const m = hh.married; let tax = progressive(taxable, m ? NYC_2026.mfj : NYC_2026.single); if (g <= 250000) tax -= m ? 125 : 63; if (g <= 500000) { const t0 = m ? 21600 : 12000; tax -= taxable <= t0 ? 0.00171 * taxable : (m ? 37 : 21) + 0.00228 * (taxable - t0); } return pos(tax); }, \| const NYC_2026 = { single: [[12000, 0.03078], [25000, 0.03762], [50000, 0.03819], [INF,  | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-local-columbus` | static-constant-from-a-source | yearly | detect | 2024-01-01 (TY 2024) | `server/juice.js:479 US_LOCAL.COLUMBUS`<br>`server/juice.js:913 TAX_SOURCES['US-LOCAL-COLUMBUS']` | COLUMBUS: (g) => 0.025 * g, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-local-philadelphia` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:481 US_LOCAL.PHILADELPHIA`<br>`server/juice.js:914 TAX_SOURCES['US-LOCAL-PHILADELPHIA']` | PHILADELPHIA: (g) => ((0.0374 + 0.03735) / 2) * g, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-local-pittsburgh` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:483 US_LOCAL.PITTSBURGH`<br>`server/juice.js:915 TAX_SOURCES['US-LOCAL-PITTSBURGH']` | PITTSBURGH: (g) => 0.03 * g + 52, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-local-detroit` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:484 US_LOCAL.DETROIT`<br>`server/juice.js:916 TAX_SOURCES['US-LOCAL-DETROIT']` | DETROIT: (g, { hh }) => 0.024 * pos(g - 600 * usPersons(hh)), | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-local-portland` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:485 US_LOCAL.PORTLAND`<br>`server/juice.js:917 TAX_SOURCES['US-LOCAL-PORTLAND']` | PORTLAND(g, { hh, taxable }) { const m = hh.married; return 0.01 * pos(taxable - (m ? 205000 : 128000)) + 0.015 * pos(taxable - (m ? 200000 : 125000)) + 0.015 * pos(taxable - (m ? 400000 : 250000)) + (taxable > (m ? 40000 : 20000) ? (m ? 100 : 50) : 0); }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-us-local-md-county` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:493 US_LOCAL.MD-COUNTY`<br>`server/juice.js:316 mdTaxable`<br>`server/juice.js:918 TAX_SOURCES['US-LOCAL-MD-COUNTY']` | 'MD-COUNTY': (g, { hh }) => 0.032 * mdTaxable(g, hh), | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-gb` | static-constant-from-a-source | yearly | detect | 2026-04-06 (TY 2026) | `server/juice.js:643 RULES.GB`<br>`server/juice.js:528 GB_RUK`<br>`server/juice.js:919 TAX_SOURCES['GB']` | GB(g, j) { const allowance = pos(12570 - pos(g - 100000) / 2); const income = progressive(pos(g - allowance), j.region === 'SCT' ? GB_SCT : GB_RUK); const social = 0.08 * pos(min(g, 50270) - 12570) + 0.02 * pos(g - 50270); return { income, social }; }, \| const GB_RUK = [[37700, 0.20], [125140, 0.40], [INF, 0.45]]; | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-gb-sct` | static-constant-from-a-source | yearly | detect | 2026-04-06 (TY 2026) | `server/juice.js:643 RULES.GB`<br>`server/juice.js:529 GB_SCT`<br>`server/juice.js:920 TAX_SOURCES['GB-SCT']` | GB(g, j) { const allowance = pos(12570 - pos(g - 100000) / 2); const income = progressive(pos(g - allowance), j.region === 'SCT' ? GB_SCT : GB_RUK); const social = 0.08 * pos(min(g, 50270) - 12570) + 0.02 * pos(g - 50270); return { income, social }; }, \| const GB_SCT = [[3967, 0.19], [16956, 0.20], [31092, 0.21], [62430, 0.42], [125140, 0.45], [INF, 0.48]]; | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-ie` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:649 RULES.IE`<br>`server/juice.js:921 TAX_SOURCES['IE']` | IE(g, j, hh) { const band = hh.married ? 53000 : 44000; const paye = pos(0.2 * min(g, band) + 0.4 * pos(g - band) - (hh.married ? 4000 : 2000) - 2000); const usc = progressive(g, [[12012, 0.005], [28700, 0.02], [70044, 0.03], [INF, 0.08]]); return { income: paye + usc, social: ((0.042 * 9 + 0.0435 * 3) / 12) * g }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-ch` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:657 RULES.CH`<br>`server/juice.js:535 chFederalTax`<br>`server/juice.js:533 CH_FED_SINGLE`<br>`server/juice.js:534 CH_FED_MARRIED`<br>`server/juice.js:922 TAX_SOURCES['CH']` | CH(g, j, hh) { const social = 0.053 * g + 0.011 * min(g, 148200) + 0.01 * min(g, 148200); if (j.region === 'GE') { const taxable = pos(g - social - min(4000, 0.03 * g) - 2900); return { income: progressive(taxable, CH_GE_COMBINED), social, singleOnly: true }; } const net = g - social; const work = min(4000, Math.max(2000, 0.03 * net)); // Berufskosten flat rate (DBG and ZH) const m = hh.married; c | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-ch-zh` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:657 RULES.CH`<br>`server/juice.js:549 ZH_VERH`<br>`server/juice.js:548 ZH_GRUND`<br>`server/juice.js:535 chFederalTax`<br>`server/juice.js:550 ZH_STEUERFUSS`<br>`server/juice.js:533 CH_FED_SINGLE`<br>`server/juice.js:534 CH_FED_MARRIED`<br>`server/juice.js:923 TAX_SOURCES['CH-ZH']` | CH(g, j, hh) { const social = 0.053 * g + 0.011 * min(g, 148200) + 0.01 * min(g, 148200); if (j.region === 'GE') { const taxable = pos(g - social - min(4000, 0.03 * g) - 2900); return { income: progressive(taxable, CH_GE_COMBINED), social, singleOnly: true }; } const net = g - social; const work = min(4000, Math.max(2000, 0.03 * net)); // Berufskosten flat rate (DBG and ZH) const m = hh.married; c | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-ch-ge` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:657 RULES.CH`<br>`server/juice.js:553 CH_GE_COMBINED`<br>`server/juice.js:535 chFederalTax`<br>`server/juice.js:533 CH_FED_SINGLE`<br>`server/juice.js:534 CH_FED_MARRIED`<br>`server/juice.js:924 TAX_SOURCES['CH-GE']` | CH(g, j, hh) { const social = 0.053 * g + 0.011 * min(g, 148200) + 0.01 * min(g, 148200); if (j.region === 'GE') { const taxable = pos(g - social - min(4000, 0.03 * g) - 2900); return { income: progressive(taxable, CH_GE_COMBINED), social, singleOnly: true }; } const net = g - social; const work = min(4000, Math.max(2000, 0.03 * net)); // Berufskosten flat rate (DBG and ZH) const m = hh.married; c | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-de` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:673 RULES.DE`<br>`server/juice.js:556 DE_2026`<br>`server/juice.js:925 TAX_SOURCES['DE']` | DE(g, j, hh) { const pension = 0.093 * min(g, 101400); const unemployment = 0.013 * min(g, 101400); const health = 0.0875 * min(g, 69750); // 7.3% + half of the 2.9% average Zusatzbeitrag const care = (hh.kids ? 0.018 : 0.024) * min(g, 69750); // 0.6-point surcharge for the childless const zvE = pos(g - 1230 - pension - 0.96 * (health + care)); const split = hh.married ? 2 : 1; // § 32a (5) EStG s | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-fr` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:690 RULES.FR`<br>`server/juice.js:560 FR_PASS_2026`<br>`server/juice.js:559 FR_BAREME`<br>`server/juice.js:926 TAX_SOURCES['FR']` | FR(g, j, hh) { const P = FR_PASS_2026; const t1 = min(g, P); const t2 = pos(min(g, 8 * P) - P); const csgBase = 0.9825 * min(g, 4 * P) + pos(g - 4 * P); const social = 0.069 * t1 + 0.004 * g + 0.0315 * t1 + 0.0864 * t2 + 0.0086 * t1 + 0.0108 * t2 + (g > P ? 0.0014 * (t1 + t2) : 0) + 0.00024 * min(g, 4 * P) + 0.097 * csgBase; let taxable = g - social + 0.029 * csgBase; taxable = pos(taxable - min(0 | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-nl` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:716 RULES.NL`<br>`server/juice.js:633 nlLabourCredit`<br>`server/juice.js:927 TAX_SOURCES['NL']` | NL(g) { const box1 = progressive(g, [[38883, 0.3575], [78426, 0.3756], [INF, 0.495]]); const general = pos(3115 - 0.06398 * pos(g - 29736)); return { income: pos(box1 - general - nlLabourCredit(g)) }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-es` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:721 RULES.ES`<br>`server/juice.js:564 ES_STATE`<br>`server/juice.js:565 ES_REGIONAL`<br>`server/juice.js:928 TAX_SOURCES['ES']` | ES(g, j) { const social = 0.065 * min(g, 61214.4); const base = pos(g - social - 2000); const cuota = (sched) => pos(progressive(base, sched) - progressive(5550, sched)); return { income: cuota(ES_STATE), regional: cuota(ES_REGIONAL[j.region] \|\| ES_STATE), social }; }, \| const ES_STATE = [[12450, 0.095], [20200, 0.12], [35200, 0.15], [60000, 0.185], [300000, 0.225], [INF, 0.245]]; \| const ES_REGIO | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-es-md` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:721 RULES.ES`<br>`server/juice.js:564 ES_STATE`<br>`server/juice.js:565 ES_REGIONAL`<br>`server/juice.js:929 TAX_SOURCES['ES-MD']` | ES(g, j) { const social = 0.065 * min(g, 61214.4); const base = pos(g - social - 2000); const cuota = (sched) => pos(progressive(base, sched) - progressive(5550, sched)); return { income: cuota(ES_STATE), regional: cuota(ES_REGIONAL[j.region] \|\| ES_STATE), social }; }, \| const ES_STATE = [[12450, 0.095], [20200, 0.12], [35200, 0.15], [60000, 0.185], [300000, 0.225], [INF, 0.245]]; \| const ES_REGIO | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-es-ct` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:721 RULES.ES`<br>`server/juice.js:564 ES_STATE`<br>`server/juice.js:565 ES_REGIONAL`<br>`server/juice.js:930 TAX_SOURCES['ES-CT']` | ES(g, j) { const social = 0.065 * min(g, 61214.4); const base = pos(g - social - 2000); const cuota = (sched) => pos(progressive(base, sched) - progressive(5550, sched)); return { income: cuota(ES_STATE), regional: cuota(ES_REGIONAL[j.region] \|\| ES_STATE), social }; }, \| const ES_STATE = [[12450, 0.095], [20200, 0.12], [35200, 0.15], [60000, 0.185], [300000, 0.225], [INF, 0.245]]; \| const ES_REGIO | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-pt` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:729 RULES.PT`<br>`server/juice.js:931 TAX_SOURCES['PT']` | PT(g) { const social = 0.11 * g; const taxable = pos(g - Math.max(4462.15, social)); const irs = progressive(taxable, [[8342, 0.125], [12587, 0.157], [17838, 0.212], [23089, 0.241], [29397, 0.311], [43090, 0.349], [46566, 0.431], [86634, 0.446], [INF, 0.48]]); const solidarity = 0.025 * pos(min(taxable, 250000) - 80000) + 0.05 * pos(taxable - 250000); return { income: irs + solidarity, social }; } | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-it` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:736 RULES.IT`<br>`server/juice.js:932 TAX_SOURCES['IT']` | IT(g) { const social = 0.0919 * min(g, 120607); const taxable = pos(g - social); const irpef = progressive(taxable, [[28000, 0.23], [50000, 0.33], [INF, 0.43]]); const regional = progressive(taxable, [[15000, 0.0123], [28000, 0.0158], [50000, 0.0172], [INF, 0.0173]]) + 0.008 * taxable; return { income: irpef, regional, social }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-at` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:743 RULES.AT`<br>`server/juice.js:933 TAX_SOURCES['AT']` | AT(g) { const social = 0.1807 * min(g, 90300); const net = pos(g - social); const regular = progressive((net * 12) / 14, [[13539, 0], [21992, 0.2], [36458, 0.3], [70365, 0.4], [104859, 0.48], [1e6, 0.5], [INF, 0.55]]); const bonus = 0.06 * pos((net * 2) / 14 - 620); return { income: regular + bonus, social }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-be` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:750 RULES.BE`<br>`server/juice.js:934 TAX_SOURCES['BE']` | BE(g) { const social = 0.1307 * g; const net = g - social; const taxable = pos(net - min(0.3 * net, 5930)); const income = pos(progressive(taxable, [[16320, 0.25], [28800, 0.40], [49840, 0.45], [INF, 0.50]]) - 0.25 * 10910); return { income, regional: 0.07 * income, social }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-se` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:757 RULES.SE`<br>`server/juice.js:935 TAX_SOURCES['SE']` | SE(g) { const taxable = pos(g - 17400); const municipal = 0.3055 * taxable; const state = 0.2 * pos(taxable - 643000); const jobCredit = min(56000, 0.11 * g, municipal); return { income: state, regional: municipal - jobCredit }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-dk` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:764 RULES.DK`<br>`server/juice.js:936 TAX_SOURCES['DK']` | DK(g) { const am = 0.08 * g; const base = g - am; const allowance = 54100; const employment = min(0.1275 * base, 63300); const municipal = 0.2339 * pos(base - allowance - employment); const state = 0.1201 * pos(base - allowance) + 0.075 * pos(base - 641200) + 0.075 * pos(base - 777900) + 0.05 * pos(base - 2592700); return { income: state, regional: municipal, social: am }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-no` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:773 RULES.NO`<br>`server/juice.js:937 TAX_SOURCES['NO']` | NO(g) { const ordinary = pos(g - min(0.46 * g, 92000) - 108550); const bracket = progressive(g, [[226100, 0], [318300, 0.017], [725050, 0.04], [980100, 0.137], [1467200, 0.168], [INF, 0.178]]); return { income: 0.22 * ordinary + bracket, social: 0.076 * g }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-fi` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:778 RULES.FI`<br>`server/juice.js:938 TAX_SOURCES['FI']` | FI(g) { const social = 0.09 * g; const taxable = pos(g - social - 750); return { income: progressive(taxable, [[21200, 0.053], [31500, 0.179], [52100, 0.243], [88200, 0.356], [150000, 0.393], [INF, 0.443]]), social }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-pl` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:783 RULES.PL`<br>`server/juice.js:939 TAX_SOURCES['PL']` | PL(g) { const zus = 0.1126 * min(g, 282600) + 0.0245 * g; const health = 0.09 * pos(g - zus); const taxable = pos(g - zus - 3000); return { income: pos(progressive(taxable, [[120000, 0.12], [INF, 0.32]]) - 3600), social: zus + health }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-cz` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:789 RULES.CZ`<br>`server/juice.js:940 TAX_SOURCES['CZ']` | CZ(g) { const social = 0.071 * min(g, 2350416) + 0.045 * g; return { income: pos(progressive(g, [[1762812, 0.15], [INF, 0.23]]) - 30840), social }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-ee` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:793 RULES.EE`<br>`server/juice.js:941 TAX_SOURCES['EE']` | EE(g) { const social = 0.016 * g; return { income: 0.22 * pos(g - social - 8400), social }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-il` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:797 RULES.IL`<br>`server/juice.js:942 TAX_SOURCES['IL']` | IL(g) { const social = 0.0427 * min(g, 92436) + 0.1217 * pos(min(g, 622920) - 92436); const income = pos(progressive(g, [[84120, 0.10], [120720, 0.14], [193800, 0.20], [269280, 0.31], [560280, 0.35], [721560, 0.47], [INF, 0.50]]) - 6534); return { income, social }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-ae` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:803 RULES.AE`<br>`server/juice.js:943 TAX_SOURCES['AE']` | AE: () => ({}), | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-sa` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:804 RULES.SA`<br>`server/juice.js:944 TAX_SOURCES['SA']` | SA: () => ({}), | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-jp` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:805 RULES.JP`<br>`server/juice.js:612 jpEmploymentDeduction`<br>`server/juice.js:945 TAX_SOURCES['JP']` | JP(g) { const total = g - jpEmploymentDeduction(g); const social = 0.04955 * min(g, 16680000) + 0.0915 * min(g, 7800000) + 0.0055 * g; const basic = total <= 23.5e6 ? 620000 : total <= 24e6 ? 480000 : total <= 24.5e6 ? 320000 : total <= 25e6 ? 160000 : 0; const residentBasic = total <= 24e6 ? 430000 : total <= 24.5e6 ? 290000 : total <= 25e6 ? 150000 : 0; const income = 1.021 * progressive(pos(tot | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-kr` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:814 RULES.KR`<br>`server/juice.js:619 krEmploymentDeduction`<br>`server/juice.js:946 TAX_SOURCES['KR']` | KR(g) { const nps = 0.0475 * min(g, 76440000); const nhi = 0.03595 * g; const ltc = nhi * 0.1314; const ei = 0.009 * g; const taxable = pos(g - krEmploymentDeduction(g) - 1.5e6 - nps - nhi - ltc - ei); const income = pos(progressive(taxable, [[14e6, 0.06], [50e6, 0.15], [88e6, 0.24], [150e6, 0.35], [300e6, 0.38], [500e6, 0.40], [1e9, 0.42], [INF, 0.45]]) - 500000); return { income, regional: 0.1 * | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-sg` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:823 RULES.SG`<br>`server/juice.js:947 TAX_SOURCES['SG']` | SG(g) { return { income: progressive(pos(g - 1000), [[20000, 0], [30000, 0.02], [40000, 0.035], [80000, 0.07], [120000, 0.115], [160000, 0.15], [200000, 0.18], [240000, 0.19], [280000, 0.195], [320000, 0.20], [500000, 0.22], [1e6, 0.23], [INF, 0.24]]) }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-hk` | static-constant-from-a-source | yearly | detect | 2026-04-01 (TY 2026) | `server/juice.js:826 RULES.HK`<br>`server/juice.js:948 TAX_SOURCES['HK']` | HK(g, j, hh) { const net = pos(g - min(18000, 0.05 * g)); const allowances = (hh.married ? 290000 : 145000) + 140000 * hh.kids; const prog = progressive(pos(net - allowances), [[50000, 0.02], [100000, 0.06], [150000, 0.10], [200000, 0.14], [INF, 0.17]]); const standard = 0.15 * min(net, 5e6) + 0.16 * pos(net - 5e6); return { income: min(prog, standard) }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-tw` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:835 RULES.TW`<br>`server/juice.js:949 TAX_SOURCES['TW']` | TW(g) { const social = 0.025 * min(g, 549600) + 0.0155 * min(g, 2634000); return { income: progressive(pos(g - 446000), [[590000, 0.05], [1330000, 0.12], [2660000, 0.20], [4980000, 0.30], [INF, 0.40]]), social }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-in` | static-constant-from-a-source | yearly | detect | 2026-04-01 (TY 2026) | `server/juice.js:839 RULES.IN`<br>`server/juice.js:950 TAX_SOURCES['IN']` | IN(g, j) { const taxable = pos(g - 75000); let slab = taxable <= 1200000 ? 0 : progressive(taxable, [[400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15], [2000000, 0.20], [2400000, 0.25], [INF, 0.30]]); if (taxable > 1200000) slab = min(slab, taxable - 1200000); // marginal relief just above the rebate limit const surcharge = taxable > 2e7 ? 0.25 : taxable > 1e7 ? 0.15 : taxable > 5e6 ?  | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-au` | static-constant-from-a-source | yearly | detect | 2026-07-01 (TY 2026) | `server/juice.js:846 RULES.AU`<br>`server/juice.js:626 auLito`<br>`server/juice.js:951 TAX_SOURCES['AU']` | AU(g) { const income = pos(progressive(g, [[18200, 0], [45000, 0.15], [135000, 0.30], [190000, 0.37], [INF, 0.45]]) - auLito(g)); return { income, social: 0.02 * g }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-nz` | static-constant-from-a-source | yearly | detect | 2026-04-01 (TY 2026) | `server/juice.js:850 RULES.NZ`<br>`server/juice.js:952 TAX_SOURCES['NZ']` | NZ(g) { return { income: progressive(g, [[15600, 0.105], [53500, 0.175], [78100, 0.30], [180000, 0.33], [INF, 0.39]]), social: 0.0167 * min(g, 152790) }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-ca` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:853 RULES.CA`<br>`server/juice.js:578 caPayroll`<br>`server/juice.js:571 CA_FED_2026`<br>`server/juice.js:573 caBpaf`<br>`server/juice.js:953 TAX_SOURCES['CA']` | CA(g, j) { const qc = j.region === 'QC'; const { social, creditable, deductible } = caPayroll(g, qc); const ti = pos(g - deductible); // enhanced CPP/QPP contributions are deducted from income let income = pos(progressive(ti, CA_FED_2026) - 0.14 * (caBpaf(ti) + 1501 + creditable)); if (qc) income *= 1 - 0.165; // Quebec abatement const prov = CA_PROV[j.region]; if (j.region && !prov) throw new Err | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-ca-on` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:600 CA_PROV.ON`<br>`server/juice.js:591 onHealthPremium`<br>`server/juice.js:954 TAX_SOURCES['CA-ON']` | ON: (ti, credit) => { const basic = pos(progressive(ti, [[53891, 0.0505], [107785, 0.0915], [150000, 0.1116], [220000, 0.1216], [INF, 0.1316]]) - 0.0505 * (12989 + credit)); const surtax = 0.2 * pos(basic - 5818) + 0.36 * pos(basic - 7446); return basic + surtax + onHealthPremium(ti); }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-ca-bc` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:607 CA_PROV.BC`<br>`server/juice.js:955 TAX_SOURCES['CA-BC']` | BC: (ti, credit) => pos(progressive(ti, [[50363, 0.056], [100728, 0.077], [115648, 0.105], [140430, 0.1229], [190405, 0.147], [265545, 0.168], [INF, 0.205]]) - 0.056 * (13216 + credit)), | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-ca-qc` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:608 CA_PROV.QC`<br>`server/juice.js:956 TAX_SOURCES['CA-QC']` | QC: (ti, credit) => pos(progressive(ti, [[53255, 0.14], [106495, 0.19], [129590, 0.24], [INF, 0.2575]]) - 0.14 * (18571 + credit)), | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-mx` | static-constant-from-a-source | yearly | detect | 2025-01-01 (TY 2025) | `server/juice.js:863 RULES.MX`<br>`server/juice.js:957 TAX_SOURCES['MX']` | MX(g) { const income = progressive(g, [[8952.49, 0.0192], [75984.55, 0.064], [133536.07, 0.1088], [155229.80, 0.16], [185852.57, 0.1792], [374837.88, 0.2136], [590795.99, 0.2352], [1127926.84, 0.30], [1503902.46, 0.32], [4511707.37, 0.34], [INF, 0.35]]); return { income, social: 0.02775 * min(g, 1070454) }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |
| `tax-br` | static-constant-from-a-source | yearly | detect | 2026-01-01 (TY 2026) | `server/juice.js:867 RULES.BR`<br>`server/juice.js:958 TAX_SOURCES['BR']` | BR(g, j, hh) { const m = g / 12; const inss = progressive(min(m, 8475.55), [[1621, 0.075], [2902.84, 0.09], [4354.27, 0.12], [8475.55, 0.14]]); const dependents = (hh.married ? 1 : 0) + hh.kids; const irpf = progressive(pos(m - inss - 189.59 * dependents), [[2428.8, 0], [2826.65, 0.075], [3751.05, 0.15], [4664.68, 0.225], [INF, 0.275]]); return { income: irpf * 12, social: inss * 12 }; }, | manual: Juice tax agent review 2026-10-10 against the official schedules (juice-tax-probe.yml, manual dispatch); before that, web-search checks on 2026-10-02 for 11 keys only |

#### jobs

| id | type | cadence | mode | as-of | items (owner file:line and symbol) | values | before |
|---|---|---|---|---|---|---|---|
| `job-postings` | fetched | daily | auto | 2026-10-02 | `server/normalize.js:111 normalizeJob`<br>`server/normalize.js:20 NORMALIZER_VERSION`<br>`scripts/snapshot.js:28 MAX_BETA_SNAPSHOT_BYTES (beta cap)`<br>`data/snapshots/<slug>.json { company, mode, fetchedAt, error, normalizerVersion, jobs[], jobsCapped? } (gitignored)`<br>`data/cache/store/*.list.json + *.desc.ndjson (melon-store-1, gitignored)`<br>`server/cache.js:17 FRESH_TTL_MS (30 min live cache)` | NORMALIZER_VERSION norm-5; 8 stable + 7 beta boards; local snapshots (2026-10-02): 5413 jobs, 4602 with salary (anduril 2418/2277, anthropic 638/558, cohere 132/132, openai 833/674, palantir 320/240, scaleai 194/131, shieldai 581/456, xai 297/134) | daily: snapshot.yml + pages.yml; snapshots kept only as the job-board-snapshots artifact (retention 14 days) and in the deployed site |
| `job-salary-parsed` | fetched | daily | auto | 2026-10-02 | `server/normalize.js:76 deriveSalary (structured vs text, ranges.slice(0,12), tier span <= 3x)`<br>`server/salary.js:418 parseSalary`<br>`server/salary.js:489 toJobSalary (mid = round((min+max)/2), spread = max/min)`<br>`server/sources/greenhouse.js:50 payRanges (cents / ZERO_DECIMAL)`<br>`server/sources/amazon.js:83 Amazon PAY_LINE_RE`<br>`server/sources/ashby.js:30 Ashby compensation`<br>`server/sources/lever.js:46 Lever salaryRange`<br>`server/sources/meta.js:113 Meta currency map` | local snapshots (2026-10-02): 4602 of 5413 jobs salaried; all annualized (interval 'year'); currencies seen USD, GBP, EUR, CAD, SGD, JPY | daily pipeline |
| `job-salary-usd` | derived-at-build | daily | auto | 2026-07-01 | `public/viz/palette.js:160 palette toUSD (chart/map/comps)`<br>`public/features/shared.js:25 shared toUSD (Compstimate/Insights: palette then FX_FALLBACK)`<br>`server/salary.js:90 salary.js toUSD (vetting, share pages via vet.js)`<br>`server/juice.js:1120 juice.js toUSD (Juice)`<br>`scripts/build-market.js:51 usdMid (market comps; drops currencies without palette FX)` | USD = amount x 1 / FX_PER_USD[currency] at FX 2026-07-01; recomputed in the browser and at build from the stored local-currency salary | derived on every build / page load |
| `salary-interval-factors` | product-policy | ad-hoc | manual | 2026-10-02 | `server/salary.js:34 FACTORS`<br>`server/vet.js:136 hourly rate /2080`<br>`scripts/vet-salaries.js:159 FACT (copy)`<br>`scripts/vet-salaries.js:315 UNFACT (copy)`<br>`data/vetting/2026-10-02/review-rules.mjs:18 F (copy, audit trail)`<br>`server/export.js:78 csvReadme text` | hour 2080, day 260, week 52, month 12, year 1 | none |
| `salary-parser-bounds` | product-policy | yearly | manual | 2026-10-02 | `server/salary.js:27 MIN_ANNUAL`<br>`server/salary.js:28 MAX_ANNUAL`<br>`server/salary.js:29 HARD_MAX_ANNUAL`<br>`server/salary.js:30 PLAUSIBLE_ANNUAL_MIN`<br>`server/salary.js:31 TIER_GAP`<br>`server/salary.js:32 TIER_MAX_RATIO`<br>`server/salary.js:458 national-range span <= 4x`<br>`server/salary.js:365 unstated interval heuristics`<br>`server/normalize.js:89 payRanges currency pick <= 3x`<br>`server/sources/greenhouse.js:37 MAX_TIER_SPAN` | MIN_ANNUAL 10000, MAX_ANNUAL 1200000, HARD_MAX_ANNUAL 5000000, PLAUSIBLE_ANNUAL_MIN 15000, TIER_GAP 130 chars, TIER_MAX_RATIO 3, national span 4x, hi < 1000 -> hourly, hi < 10000 with a range -> monthly, Greenhouse MAX_TIER_SPAN 3 | none |
| `salary-vetting-bounds` | product-policy | yearly | manual | 2026-10-02 | `server/vet.js:30 VET`<br>`server/vet.js:51 CRITICAL_CODES`<br>`server/vet.js:66 JUNIOR_RE / SENIOR_RE`<br>`server/vet.js:57 PART_TIME_RE`<br>`scripts/vet-salaries.js:203 CRITICAL_FLAGS (scan)`<br>`scripts/vet-salaries.js:241 ratio_over_3 etc.` | MAX_ANNUAL 1200000, MIN_ANNUAL_FULLTIME 15000, RATIO_FLAG 3, RATIO_QUARANTINE 4, Z 3.5, Z_LOW 4.5, TUKEY_K 3, MIN_GROUP 8, MIN_SIGMA 0.4, JUNIOR_MAX_MID 300000, SENIOR_MIN_MAX 60000, HOURLY_MAX_FULLTIME 200, MAX_HOURLY_USD 250 | none |
| `salary-vetting-flags` | fetched | daily | auto | 2026-10-02 | `server/vet.js:256 salaryFlag / salaryRaw`<br>`data/vetting/2026-10-02/flags.jsonl (505), sample.jsonl (176), verdicts.jsonl (681), tier-spans.json (59), flags.counts.json, flags.renormalized.*, review-rules.mjs, summary.md`<br>`scripts/llm-vet.js:38 VERDICT_SCHEMA` | review 2026-10-02: 681 jobs reviewed (505 flagged + 176 sampled, seed 20261002): 551 correct, 111 parser_bug, 19 source_ambiguous; parser salary.js@b9cc2fb | daily gate; the per-run report is the salary-vetting artifact (retention 30 days) |
| `llm-vet-config` | product-policy | quarterly | detect | 2026-10-06 | `scripts/llm-vet.js:33 DEFAULT_MODEL`<br>`scripts/llm-vet.js:34 API_VERSION`<br>`scripts/llm-vet.js:35 FALLBACK_BETA`<br>`scripts/llm-vet.js:151 max_tokens`<br>`scripts/llm-vet.js:173 retries/backoff`<br>`.github/workflows/pages.yml:126 --limit 100 per run` | claude-sonnet-5-5 (VET_LLM_MODEL overrides), anthropic-version 2023-06-01, beta server-side-fallback-2026-07-01 with fallbacks "default", effort medium, max_tokens 4000, 4 retries, concurrency 4, 100 jobs per Pages run | none |
| `company-registry` | product-policy | ad-hoc | manual | 2026-10-10 | `server/companies.js:8 COMPANIES`<br>`server/companies.js:3 SOURCES`<br>`server/companies.js:41 CHANNELS`<br>`server/sources/eightfold.js:25 EIGHTFOLD_BOARDS`<br>`scripts/probe-bigtech.js:37 probe SLUGS` | 8 stable (anthropic, anduril, openai, scaleai, xai, cohere, palantir, shieldai); 7 beta (google, microsoft, meta, apple, netflix, amazon, nvidia); Tesla excluded (403), Mistral removed (0 jobs, 2026-10-02) | manual |
| `company-aggregates` | derived-at-build | daily | auto | 2026-10-02 | `scripts/build-market.js:90 market companies[] {jobs, salaried, used}`<br>`scripts/build-static.js:434 shareStats {roles, withPay, median}`<br>`server/export.js:90 csvReadme rows`<br>`data/vetting/2026-10-02/flags.counts.json {jobs, salaried, quarantined, flagged, critical, blocking}`<br>`server/history.js:279 ledgerMeta {since, runs}` | local snapshots 2026-10-02: anduril 2418/2277, anthropic 638/558, cohere 132/132, openai 833/674, palantir 320/240, scaleai 194/131, shieldai 581/456, xai 297/134 (jobs/salaried); market build 2026-10-10: 8 companies, used after vetting 4,546 | regenerated each build |
| `market-comps` | derived-at-build | daily | auto | 2026-10-02 | `scripts/build-market.js:34 MIN_N`<br>`scripts/build-market.js:48 round100`<br>`scripts/build-market.js:40 percentileSorted (linear)`<br>`scripts/build-market.js:61 buildMarket`<br>`scripts/build-static.js:118 MARKET_MAX_BYTES` | minN 3, amounts rounded to $100, fx 2026-07-01; built 2026-10-10 from local snapshots: 391 cells (136 roll-ups), 26 families, 8 companies, 21.7 KB (cap 150 KB) | regenerated each build |
| `compstimate-backtest` | derived-at-build | daily | auto | 2026-10-02 | `server/index.js:313 BACKTEST_OPTS`<br>`scripts/build-static.js:116 BACKTEST_FALLBACK`<br>`server/index.js:343 BACKTEST_TIMEOUT_MS`<br>`server/index.js:315 BACKTEST_WAIT_MS`<br>`server/index.js:353 worker memory`<br>`public/features/compstimate.js:337 backtest() defaults`<br>`public/features/compstimate.js:298 ACCURACY_LOW_THRESHOLD` | server: seed 20261002, maxN 500, dedupe "role"; build-static fallback: seed 20261002, maxN 500 (no dedupe -> backtest default "title"); timeout 60 s, wait 400 ms, 512 MB | regenerated each build |
| `compstimate-model` | product-policy | yearly | manual | 2026-10-02 | `public/features/compstimate.js:34 LEVEL_INDEX`<br>`public/features/compstimate.js:160 MIN_WEIGHT / REL_WEIGHT / MAX_COMPARABLES / LOW_P, HIGH_P`<br>`public/features/compstimate.js:530 MIN_COMPARABLES`<br>`server/compstimate-worker.js:1 compstimate worker (server)` | LEVEL_INDEX Intern 0, Entry 1, Mid 2, Senior 3, Manager 3.5, Staff+ 4, Director+ 5; MIN_WEIGHT 0.02, REL_WEIGHT 0.12, MAX_COMPARABLES 500, quantiles 0.15/0.85, MIN_COMPARABLES 3 | none |
| `seniority-ladder` | product-policy | yearly | manual | 2026-10-02 | `server/keywords.js:774 inferSeniority`<br>`server/keywords.js:761 MTS_ABBREV (SMTS/LMTS/PMTS)`<br>`server/keywords.js:752 NON_PEOPLE_MANAGER`<br>`server/keywords.js:705 yearsBucket`<br>`server/keywords.js:698 years range 1..30`<br>`server/vet.js:66 vet.js titleClass (junior/senior, separate ladder)`<br>`server/demo.js:531 demo IC_LEVELS`<br>`public/features/roles.js:301 SENIORITY_LADDER (UI order)` | 7 buckets; default Mid; yearsBucket 1+/3+/5+/8+/10+ yrs; demo IC_LEVELS mult 0.82/1/1.2/1.45/1.7 (years 1/3/5/8/10) | none |
| `role-families` | product-policy | yearly | manual | 2026-10-02 | `server/vet.js:78 vet.js FAMILIES (10 + other)`<br>`server/vet.js:92 vet.js roleFamily`<br>`public/features/roles.js:174 roles.js FAMILIES`<br>`public/features/roles.js:139 FAMILY_LABELS` | vet.js: intern, hourly-ops, annotation, executive, manager, research, engineering, sales, recruiting, ops, other; market comps families (roles.js) seen 2026-10-10: admin, ai-training, bizops, data, design, eng-manager, facilities, field-ops, finance, hardware, it, legal, manufacturing, marketing, ml, people, policy, product, program, sales, security, solutions, supply-chain, support, swe, trust-sa | none |
| `keyword-lexicons` | product-policy | quarterly | manual | 2026-10-02 | `server/keywords.js:378 SKILL_LEXICON`<br>`server/keywords.js:562 RESPONSIBILITY_LEXICON`<br>`server/keywords.js:615 FIT_LEXICON`<br>`server/keywords.js:649 FIT_GLOBAL_LEXICON`<br>`server/keywords.js:273 boilerplate minShare 0.5 / minJobs 5`<br>`server/keywords.js:317 facet guard maxShare 0.9 / minJobs 20`<br>`server/normalize.js:20 NORMALIZER_VERSION` | 167 skills, 44 responsibilities, 28 fit, 4 global fit (Security clearance, US citizenship, Travel, Visa sponsorship); no product version strings in the lexicons | none |
| `listing-freshness-buckets` | product-policy | ad-hoc | manual | 2026-10-02 | `server/history.js:43 FRESHNESS`<br>`server/history.js:41 REPOST_WINDOW_DAYS`<br>`server/demo.js:815 demo AGE_BUCKETS (copy)`<br>`public/app.js:2383 app.js 180 (copy)` | NEW_MAX 7, ACTIVE_MAX 59, STALE_MAX 179, evergreen >= 180; REPOST_WINDOW_DAYS 30; ages recomputed hourly (server annotateCached) | none |
| `history-ledger` | fetched | daily | auto | ? | `server/history.js:40 HISTORY_FORMAT`<br>`server/history.js:42 PRUNE_CLOSED_DAYS`<br>`server/history.js:100 updateLedger`<br>`server/history.js:192 compactLedger (api/history/<slug>.json)`<br>`scripts/history.js:72 recordRun`<br>`.github/scripts/ledger.sh:37 ledger.sh store (artifact \| branch)` | format melon-history-1; PRUNE_CLOSED_DAYS 400; REPOST_WINDOW_DAYS 30; persisted as the history-ledger artifact (90-day retention, default) or the data-history orphan branch (HISTORY_STORE=branch) | daily; artifact store by default |

#### reference

| id | type | cadence | mode | as-of | items (owner file:line and symbol) | values | before |
|---|---|---|---|---|---|---|---|
| `geo-gazetteer` | static-data | ad-hoc | manual | 2026-10-02 | `server/geo.js:25 US_STATES_RAW`<br>`server/geo.js:81 OTHER_REGIONS_RAW`<br>`server/geo.js:102 COUNTRIES_RAW`<br>`server/geo.js:170 CITIES_RAW`<br>`server/geo.js:474 GAZETTEER_SIZE`<br>`server/geo.js:734 COUNTRY_LABEL`<br>`server/juice.js:1329 juice.js REGION_COUNTRIES (US, CA, AU)`<br>`data/cities.json cities[].aliases / nearby` | 246 cities, 52 US states (+DC, PR), 60 countries, 14 non-US regions; coordinates to 2-4 decimals | manual |
| `country-currency` | static-data | yearly | manual | 2026-10-02 | `server/salary.js:96 COUNTRY_CURRENCY`<br>`server/salary.js:126 CODES`<br>`server/salary.js:128 SYM_CUR`<br>`server/salary.js:252 NATION_CODE`<br>`scripts/vet-salaries.js:56 COUNTRY_CURRENCY (copy)`<br>`scripts/vet-salaries.js:45 CODES (copy)`<br>`server/sources/meta.js:114 Meta COUNTRY_CUR (subset copy)`<br>`server/sources/greenhouse.js:36 ZERO_DECIMAL`<br>`scripts/update-col.js:44 ISO3_TO_ISO2`<br>`data/cities.json cities[].currency` | 46 country codes (20 euro-area: IE DE FR NL ES IT BE AT FI PT LU GR EE LV LT SK SI HR MT CY), 26 currency codes, 16 zero-decimal currencies | none |
| `cities-dataset` | static-data | monthly | auto | 2026-10-02 | `data/cities.json name/description/version/updated/license/sourceNotes/dataStatus`<br>`data/cities.json cities[] key, name, city, region, country, currency, aliases, nearby, tax{country, region, local}`<br>`scripts/update-col.js:20 validateDoc` | version 1, updated 2026-10-02; 89 cities in 33 countries (US 40, GB 5, IN 4, CA 4, ...); 61 distinct tax jurisdictions; dataStatus numbeo "UNDER REVIEW" | col-refresh.yml monthly (Big Mac + FX only); everything else manual |
| `demo-data` | product-policy | yearly | manual | 2026-09-30 | `server/demo.js:539 CATALOGS (anthropic, anduril, openai, generic)`<br>`server/demo.js:531 IC_LEVELS`<br>`server/demo.js:691 FIXED_LEVELS`<br>`server/demo.js:697 FX`<br>`server/demo.js:763 salaryFor (6% no salary, intern $45-70/h, 15% two zones at 0.85)`<br>`server/demo.js:815 AGE_BUCKETS`<br>`server/demo.js:844 baseTime 2026-09-30` | salaryRange $K: anthropic 150-690, anduril 90-350, openai 150-600, generic 70-320; counts anthropic 110-140, anduril 100-135, openai 105-140, generic 60-100; role base ranges per catalog; IC mult 0.82/1/1.2/1.45/1.7; FX USD 1, GBP 0.78, EUR 0.9; age buckets 1-7 (w15), 8-59 (45), 60-179 (27), 180-400 (13) | none |
| `ops-constants` | product-policy | ad-hoc | manual | 2026-10-10 | `server/cache.js:17 FRESH_TTL_MS 30 min`<br>`server/cache.js:22 cache 50 memory / 100 disk`<br>`server/index.js:57 MIN_REFRESH_MS 60 s`<br>`server/index.js:59 NEGATIVE_TTL_MS 10 min`<br>`server/index.js:61 MAX_UPSTREAM 4`<br>`server/index.js:421 LIST_GZIP_BUDGET 400 KB`<br>`server/index.js:696 cities max-age 3600`<br>`server/index.js:80 CSP hosts`<br>`server/pipeline.js:38 BUILTIN_TIMEOUT_MS 45 s`<br>`server/pipeline.js:115 POOL_SIZE <= 2`<br>`server/sources/util.js:4 TIMEOUT_MS 15 s`<br>`server/sources/util.js:7 MAX_BYTES 25 MB`<br>`server/sources/util.js:9 MAX_BYTES_BUILTIN 120 MB`<br>`server/sources/util.js:3 USER_AGENT melon-seek/0.1`<br>`server/sources/polite.js:20 BOT_USER_AGENT melon-seek/0.2`<br>`server/sources/polite.js:21 MIN_INTERVAL_MS 1000`<br>`server/sources/polite.js:22 30 s`<br>`server/sources/polite.js:23 30 MB`<br>`server/sources/polite.js:24 BACKOFF 2/4/8/16 s`<br>`server/sources/amazon.js:18 Amazon PAGE 100 / CAP 10000`<br>`server/sources/apple.js:21 Apple PAGE 20 / MAX_PAGES 800 / EMPTY_RETRIES 3`<br>`server/sources/eightfold.js:31 Eightfold PAGE 10 / MAX_PAGES 1500`<br>`scripts/snapshot.js:29 TRIM_STEPS`<br>`scripts/build-static.js:126 LIST_BUDGET 1.5 MB`<br>`scripts/build-static.js:377 OG_IMAGE_MAX_BYTES 5 MB`<br>`scripts/build-og.mjs:31 OG 1200x630`<br>`scripts/external-links.js:116 link check timeout 15 s, concurrency 8, 20 per company`<br>`scripts/links-policy.js:42 ALLOWED_HOSTS`<br>`server/keywords.js:64 BLOCK_MEMO_MAX 3000`<br>`.github/scripts/beta-gate.sh:24 beta gate 300 s`<br>`.github/scripts/check-site.sh:23 check-site 180 s / 15 s`<br>`.github/scripts/wait-pages-build.sh:9 wait-pages 300 s` | see owners (each item carries its value) | none |
| `workflow-schedules` | product-policy | ad-hoc | manual | 2026-10-10 | `.github/workflows/snapshot.yml:24 snapshot.yml cron "17 6 * * *" (stable boards daily)`<br>`.github/workflows/snapshot.yml:25 snapshot.yml cron "47 0,6,12,18 * * *" (beta boards every 6 h)`<br>`.github/workflows/pages.yml:29 pages.yml cron "41 7 * * *"`<br>`.github/workflows/monthly-refresh.yml:28 monthly-refresh.yml cron "17 5 3 * *"`<br>`.github/workflows/archive.yml:20 archive.yml cron "37 9 * * *"`<br>`.github/workflows/site-watchdog.yml:13 site-watchdog.yml cron "11,41 * * * *"`<br>`.github/workflows/col-refresh.yml:23 col-refresh.yml (now workflow_dispatch only; was "23 5 3 * *")`<br>`.github/workflows/snapshot.yml:84 history-ledger 90 d`<br>`.github/workflows/snapshot.yml:102 job-board-snapshots 14 d`<br>`.github/workflows/snapshot.yml:198 beta-crawl-<slug> 1 d`<br>`.github/workflows/snapshot.yml:244 job-board-snapshots-beta 14 d`<br>`.github/workflows/pages.yml:105 history-ledger 90 d (pages)`<br>`.github/workflows/pages.yml:134 salary-vetting 30 d`<br>`.github/workflows/monthly-refresh.yml:178 monthly refresh report 90 d`<br>`.github/workflows/snapshot.yml:179 beta crawl 140 min per board (job 150 min)`<br>`.github/workflows/monthly-refresh.yml:57 monthly-refresh 45 min`<br>`.github/workflows/archive.yml:46 archive 90 min`<br>`.github/workflows/bigtech-probe.yml:39 bigtech-probe 180 min`<br>`.github/workflows/ci.yml:17 CI Node matrix` | stable snapshots daily 06:17 UTC; beta snapshots every 6 h at :47; pages daily 07:41 UTC; monthly refresh 05:17 UTC on the 3rd; archive daily 09:37 UTC; site-watchdog every 30 min; col-refresh manual only; retention: history-ledger 90 d, job-board-snapshots 14 d, beta-crawl-<slug> 1 d, job-board-snapshots-beta 14 d, salary-vetting 30 d, refresh report 90 d; probes workflow_dispatch only | none |
| `runtime-versions` | static-constant-from-a-source | semiannual | detect | 2026-10-10 | `package.json engines.node ">=18"`<br>`package.json dependencies.leaflet "^1.9.4"`<br>`.github/workflows/ci.yml:17 CI matrix [20, 22]`<br>`.github/workflows/*.yml node-version: 22`<br>`.github/workflows/*.yml actions/checkout@3d3c42e5 (v7.0.1), setup-node@82076278 (v7.0.0), upload-artifact@043fb46d (v7.0.1), download-artifact@3e5f45b2 (v8.0.1)` | engines >= 18; CI Node 20 and 22; workflows Node 22; leaflet ^1.9.4 | none |

#### derived

| id | type | cadence | mode | as-of | items (owner file:line and symbol) | values | before |
|---|---|---|---|---|---|---|---|
| `share-pages` | derived-at-build | daily | auto | 2026-10-02 | `scripts/build-static.js:434 shareStats`<br>`scripts/build-static.js:451 sharePage`<br>`scripts/build-static.js:424 money (K/M formatting)`<br>`server/index.js:768 server sharePage (no counts)` | roles = payload.jobs.length, withPay = salaried mids, median = median of annualized USD midpoints (salary.js FX), fetchedAt date; none for demo data | regenerated each build |
| `og-card` | derived-at-build | ad-hoc | manual | ? | `scripts/build-og.mjs:31 WIDTH/HEIGHT 1200x630`<br>`scripts/build-og.mjs:33 MAX_BYTES 5 MB`<br>`public/og/card.html (content: freshness-audit-surface)` | 1200 x 630 PNG, <= 5 MB; rendered by hand with Playwright (not in CI) | manual |
| `methodology-page` | derived-at-build | monthly | auto | 2026-10-02 | `scripts/methodology.js:61 renderMethodologyPage`<br>`server/index.js:878 server route /methodology/` | renders the current docs/LIVABILITY.md at each build (worked examples "data as of 2026-10-02") | rendered each build from a hand-maintained doc |

#### Consumers per entry

| id | consumers (file:line, surface) |
|---|---|
| `fx-per-usd` | `public/app.js:383` chart<br>`public/viz/chart.js:193` chart<br>`public/viz/map.js:52` map<br>`scripts/build-market.js:51` Same role elsewhere<br>`public/features/shared.js:25` Compstimate<br>`public/features/insights.js:30` Insights<br>`server/juice.js:1107` drawer Juice block<br>`server/juice.js:1262` drawer Juice block<br>`server/vet.js:124` API<br>`server/salary.js:94` API<br>`scripts/build-static.js:434` OG image<br>`scripts/update-col.js:113` API<br>`scripts/archive/jobs.js:42` API |
| `fx-usd-pegs` | `server/juice.js:1107` drawer Juice block<br>`server/salary.js:86` API |
| `bigmac-prices` | `server/juice.js:1273` drawer Juice block<br>`server/juice.js:1263` drawer Juice block<br>`docs/LIVABILITY.md:44` methodology page |
| `rents-1br-quoted` | `server/juice.js:1291` drawer Juice block<br>`public/api.js:697` API<br>`public/app.js:2125` drawer Juice block<br>`public/app.js:520` chart<br>`public/app.js:363` badge<br>`public/viz/map.js:290` map<br>`docs/LIVABILITY.md:17` methodology page |
| `rents-bedroom-ratios` | `server/juice.js:1291` drawer Juice block<br>`public/app.js:2065` drawer Juice block<br>`docs/LIVABILITY.md:439` methodology page |
| `rents-nsw-official` | `server/juice.js:1291` drawer Juice block |
| `cost-index` | `server/juice.js:1231` drawer Juice block<br>`server/juice.js:1254` drawer Juice block<br>`public/app.js:2125` drawer Juice block<br>`public/app.js:520` chart<br>`public/app.js:363` badge<br>`public/viz/map.js:290` map<br>`docs/LIVABILITY.md:17` methodology page |
| `nyc-basket` | `server/juice.js:1229` drawer Juice block<br>`server/juice.js:1424` API<br>`docs/LIVABILITY.md:29` methodology page |
| `living-scale` | `server/juice.js:1230` drawer Juice block<br>`docs/LIVABILITY.md:70` methodology page |
| `juice-score-anchors` | `server/juice.js:156` drawer Juice block<br>`server/juice.js:172` map<br>`public/viz/map.js:126` map<br>`docs/LIVABILITY.md:121` methodology page |
| `juice-grades` | `server/juice.js:162` badge<br>`public/viz/map.js:137` map<br>`public/app.js:2139` drawer Juice block<br>`public/app.js:363` badge |
| `juice-confidence-rules` | `server/juice.js:1275` drawer Juice block<br>`docs/LIVABILITY.md:98` methodology page |
| `households` | `server/juice.js:112` drawer Juice block<br>`public/app.js:2166` drawer Juice block |
| `tax-us` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-ca` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-ny` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-wa` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-tx` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-fl` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-tn` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-nv` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-ma` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-ga` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-dc` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-al` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-oh` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-va` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-il` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-co` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-pa` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-nc` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-or` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-ut` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-az` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-mn` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-mi` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-md` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-local-nyc` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-local-columbus` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-local-philadelphia` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-local-pittsburgh` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-local-detroit` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-local-portland` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-us-local-md-county` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-gb` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-gb-sct` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-ie` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-ch` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-ch-zh` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-ch-ge` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-de` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-fr` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-nl` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-es` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-es-md` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-es-ct` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-pt` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-it` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-at` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-be` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-se` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-dk` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-no` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-fi` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-pl` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-cz` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-ee` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-il` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-ae` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-sa` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-jp` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-kr` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-sg` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-hk` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-tw` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-in` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-au` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-nz` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-ca` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-ca-on` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-ca-bc` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-ca-qc` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-mx` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `tax-br` | `server/juice.js:1086` API<br>`server/juice.js:1197` API<br>`server/juice.js:1274` API<br>`public/app.js:2151` drawer Juice block<br>`public/api.js:697` API<br>`docs/LIVABILITY.md:265` methodology page<br>`server/juice.js:1248` drawer Juice block |
| `job-postings` | `server/index.js:297` API<br>`scripts/build-static.js:913` API<br>`public/api.js:167` API<br>`public/app.js:383` chart<br>`server/export.js:40` API<br>`scripts/archive/jobs.js:26` API |
| `job-salary-parsed` | `public/app.js:383` chart<br>`scripts/build-market.js:51` Same role elsewhere<br>`scripts/build-static.js:434` OG image<br>`server/export.js:48` API<br>`server/juice.js:1407` drawer Juice block |
| `job-salary-usd` | `public/app.js:383` chart<br>`public/viz/map.js:52` map<br>`public/features/insights.js:30` Insights<br>`scripts/build-market.js:79` Same role elsewhere<br>`scripts/build-static.js:434` OG image<br>`server/juice.js:1407` drawer Juice block |
| `salary-interval-factors` | `server/salary.js:36` chart<br>`README.md:501` README<br>`docs/VETTING.md:199` docs |
| `salary-parser-bounds` | `server/normalize.js:76` chart<br>`docs/VETTING.md:38` docs |
| `salary-vetting-bounds` | `server/vet.js:239` chart<br>`server/vet.js:266` Compstimate<br>`.github/workflows/pages.yml:112` API<br>`docs/VETTING.md:84` docs |
| `salary-vetting-flags` | `public/app.js:1161` drawer Juice block<br>`scripts/vet-salaries.js:203` API<br>`docs/VETTING.md:278` docs |
| `llm-vet-config` | `.github/workflows/pages.yml:120` API |
| `company-registry` | `server/index.js:792` API<br>`scripts/build-static.js:590` API<br>`README.md:558` README |
| `company-aggregates` | `scripts/build-static.js:451` OG image<br>`public/features/comps.js:207` Same role elsewhere<br>`public/app.js:1345` Insights |
| `market-comps` | `server/index.js:823` API<br>`public/api.js:661` API<br>`public/features/comps.js:207` Same role elsewhere<br>`public/app.js:2426` Same role elsewhere |
| `compstimate-backtest` | `server/index.js:304` Compstimate<br>`scripts/build-static.js:759` Compstimate<br>`public/app.js:2269` Compstimate<br>`README.md:187` README |
| `compstimate-model` | `server/index.js:324` Compstimate<br>`scripts/build-market.js:30` Same role elsewhere |
| `seniority-ladder` | `server/normalize.js:132` chart<br>`scripts/build-market.js:84` Same role elsewhere<br>`server/export.js:12` API<br>`public/features/compstimate.js:34` Compstimate |
| `role-families` | `server/vet.js:205` API<br>`scripts/build-market.js:82` Same role elsewhere |
| `keyword-lexicons` | `server/normalize.js:128` chart<br>`public/app.js:1884` badge |
| `listing-freshness-buckets` | `server/history.js:255` badge<br>`public/app.js:2372` badge |
| `history-ledger` | `server/index.js:301` API<br>`scripts/build-static.js:349` API<br>`public/app.js:2372` badge<br>`server/export.js:13` API<br>`README.md:115` README |
| `geo-gazetteer` | `server/normalize.js:53` map<br>`server/juice.js:1363` drawer Juice block<br>`public/viz/map.js:52` map |
| `country-currency` | `server/salary.js:117` chart<br>`server/normalize.js:82` chart<br>`server/sources/greenhouse.js:56` chart |
| `cities-dataset` | `server/index.js:822` API<br>`public/api.js:642` API<br>`scripts/build-static.js:722` API<br>`README.md:175` README<br>`docs/LIVABILITY.md:11` methodology page |
| `demo-data` | `server/pipeline.js:84` API<br>`scripts/build-static.js:14` API<br>`server/export.js:84` API |
| `ops-constants` | `server/index.js:297` API<br>`scripts/snapshot.js:54` API |
| `workflow-schedules` | `.github/workflows/snapshot.yml:1` API<br>`.github/workflows/pages.yml:1` API<br>`README.md:156` README |
| `runtime-versions` | `.github/workflows/ci.yml:17` tests |
| `share-pages` | `scripts/build-static.js:496` OG image |
| `og-card` | `scripts/build-static.js:496` OG image |
| `methodology-page` | `docs/LIVABILITY.md:168` methodology page |

## 7. Duplicates and inconsistencies

| # | What | Where | Status |
|---|---|---|---|
| D1 | FX table, 6 copies | `server/juice.js` FX_PER_USD; `public/viz/palette.js` FX_PER_USD; `server/salary.js` FX_PER_USD; `data/cities.json` fx.perUSD; 89 × city.fxPerUSD; 33 × bigMac.dollarEx | Equal on 2026-10-10. No test ties cities.json to the code copies (test/fx-consistency.test.js only compares palette/juice/salary); the lead is adding one |
| D2 | FX as-of, 4 copies | juice.js FX_AS_OF, palette.js FX_AS_OF, cities.json fx.asOf and bigMac.asOf (all 2026-07-01); build-market writes fx.asOf from palette | Equal |
| D3 | Unsourced FX | salary.js EXTRA_FX_PER_USD {QAR 3.64, CNY 7.14, ZAR 18.2}; shared.js FX_FALLBACK CNY 0.14 | No source or as-of; fx.js now covers them |
| D4 | **Demo FX** | server/demo.js FX {GBP 0.78, EUR 0.9} | GBP is 5.1% and EUR 2.9% off fx-per-usd. Not refreshed by fx.js |
| D5 | Pegs | AED 3.67285 and SAR 3.755 (market) vs the official pegs 3.6725 and 3.75 | fx.js validates the pegs |
| D6 | NYC basket | juice.js NYC_BASKET_USD = cities.json baseline.nycBasketUSD (19982) | Test-guarded (juice.test.js) |
| D7 | Score anchors | juice.js SCORE_ANCHORS vs palette.js JUICE_ANCHORS {80000, 423866} | Equal. palette.js juiceNetForScore's comment still says "A = $10K, B = $250K" (the old curve) |
| D8 | Grades | juice.js GRADES (70/45) vs palette.js JUICE_BREAKS [45, 70] vs map.js comments | Equal; no test ties them |
| D9 | Households | juice.js HOUSEHOLDS vs public/app.js HOUSEHOLDS (labels, bedrooms) | Equal; no test |
| D10 | Source classes | juice.js SOURCE_CLASSES vs update-col.js SOURCE_CLASSES | Equal |
| D11 | Interval factors (2080/260/52/12) | salary.js FACTORS, vet.js `/2080`, vet-salaries.js FACT and UNFACT, review-rules.mjs F, export.js README text, README.md, VETTING.md | Equal; no test ties them |
| D12 | MAX_ANNUAL 1.2M | salary.js and vet.js | Equal (asserted by gen.mjs) |
| D13 | Country → currency | salary.js COUNTRY_CURRENCY/CODES/SYM_CUR vs vet-salaries.js copies vs meta.js COUNTRY_CUR (subset) | Equal. **BG missing in both main copies** (euro since 2026-01-01) |
| D14 | **Backtest options** | server/index.js BACKTEST_OPTS {seed 20261002, maxN 500, dedupe "role"} vs build-static.js BACKTEST_FALLBACK {seed, maxN}: no dedupe, so the backtest default "title" applies | **Inconsistent** (patch) |
| D15 | Seed 20261002 | BACKTEST_OPTS, BACKTEST_FALLBACK, compstimate BACKTEST_SEED, vet-salaries `--seed` default | Equal |
| D16 | **Two role-family taxonomies** | server/vet.js FAMILIES/roleFamily (10 + other, for stat-outlier groups) vs public/features/roles.js FAMILIES (26 families seen in market comps) | Same function name, different meaning |
| D17 | **Seniority order** | keywords.js buckets; roles.js SENIORITY_LADDER (Staff+ before Manager); compstimate LEVEL_INDEX (Manager 3.5 before Staff+ 4); vet.js junior/senior regexes; demo IC_LEVELS | Inconsistent order |
| D18 | Freshness bands | history.js FRESHNESS (7/59/179) vs demo.js AGE_BUCKETS vs public/app.js hard-coded 180 | Equal |
| D19 | User agents | server/sources/util.js `melon-seek/0.1` vs polite.js `melon-seek/0.2` (package.json 0.1.0) | Inconsistent (cosmetic) |
| D20 | Living-scale as-of | juice.js inputs.household.source.asOf is the literal `'2026'`, not a date | Format inconsistency |
| D21 | Seniority default | normalize.js `'Mid'` on error; build-market `job.seniority \|\| 'Mid'` | Equal |
| D22 | Market minN 3 | build-market MIN_N vs comps.js `market.minN \|\| 3` vs demo-data.js `minN: 3` | Equal |
| D23 | Tax as-of vs source | 18 TAX_SOURCES keys are encoded with a 2024/2025 tax year while 2026 is in force (listed in §8). "verified" stays true after a new schedule is out | Flagged per entry |
| D24 | cities.json `updated` | Set to the run date by update-col.js, not the data's as-of | Noted |

## 8. Items with no update mechanism before this work

`before: none` in the entries:
- fx-usd-pegs;
- rents-bedroom-ratios and rents-nsw-official (one-off by the household agent);
- living-scale;
- juice-score-anchors, juice-grades, juice-confidence-rules, households;
- salary-interval-factors, salary-parser-bounds, salary-vetting-bounds, llm-vet-config;
- compstimate-model, seniority-ladder, role-families, keyword-lexicons, listing-freshness-buckets;
- country-currency;
- demo-data;
- ops-constants and workflow-schedules (code review only);
- runtime-versions.

Manual only, with no automation:
- rents-1br-quoted, cost-index and nyc-basket (Numbeo, by hand);
- geo-gazetteer;
- company-registry;
- og-card (rendered by hand, in no workflow).

Tax: all 71 `tax-*` entries had no automated check. Before the Juice tax agent's 2026-10-10 review, they were web-search checks on 2026-10-02, for 11 keys only.

FX code copies (fx-per-usd): only `data/cities.json` was refreshed (col-refresh.yml); the three code tables were edited by hand.

Tax years older than the one in force (detect should confirm whether the 2026 schedules are out):
- **2024**: tax-us-local-columbus (TAX_SOURCES asOf '2024');
- **2025**:
  - US: tax-us-ca, tax-us-ma, tax-us-dc, tax-us-al, tax-us-co, tax-us-ut, tax-us-az, tax-us-md, tax-us-local-md-county;
  - Europe: tax-ch-ge, tax-fr (barème on 2025 income), tax-es-ct, tax-be, tax-fi;
  - Rest of world: tax-tw, tax-ca-qc, tax-mx.

## 9. Numbers with no source, and unverified items

No source cited:
- **geo coordinates**: 246 cities, 52 US states and territories, 60 countries, 14 regions. Candidate: GeoNames, CC BY 4.0.
- **demo pay bases**: all catalogs; synthetic.
- **demo FX**.
- **EXTRA_FX_PER_USD**: until fx.js.
- **the 2-adult/2-child household preset**: policy.
- **compstimate and demo level multipliers**: policy.

Unverified in this run:
- HUD FY2027 FMRs (effective 2026-10-01) are probably out, which would make the 30 US bedroom ratios (FY2026) due. I did not fetch them.
- The NSW licence line was not re-read.
- Every TAX_SOURCES `unverified[]` list is copied into its entry's notes. 40 keys have one.

Data-loss risks (relevant to the user's "don't lose ANY old data"):
1. Job snapshots exist only as 14-day artifacts (`job-board-snapshots`, `job-board-snapshots-beta`; `beta-crawl-<slug>` 1 day).
2. Vetting reports are 30-day artifacts (`salary-vetting`).
3. The ledger store defaults to a 90-day artifact.
4. `PRUNE_CLOSED_DAYS = 400` deletes closed ledger entries.
5. Market comps, share-page medians and backtest accuracy are regenerated each build, with no history.

The archive agent (`scripts/archive/*`, `archive.yml` daily 09:37 UTC) is the remedy. It must mirror the ledger before pruning.

## 10. Patches (for the lead to apply after the owning agents finish)

| Patch | Target | Owner | Why |
|---|---|---|---|
| `docs/process/patches/freshness-audit-core-bg-euro.diff` | `server/salary.js`, `scripts/vet-salaries.js` | big-tech data engineer | Adds BG to the euro list (euro since 2026-01-01). Affects xAI's Sofia postings: a EUR range is preferred for a BG location. `git apply --check` passed on 2026-10-10 |
| `docs/process/patches/freshness-audit-core-backtest-fallback.diff` | `scripts/build-static.js` | beta deploy engineer | BACKTEST_FALLBACK gets `dedupe: 'role'`, equal to server BACKTEST_OPTS. `git apply --check` passed on 2026-10-10 |

Note: `freshness-audit-surface-backtest-fallback.diff` makes the same one-line change; it differs only by a trailing `// = BACKTEST_OPTS` comment. Apply one of the two, not both.

Suggestions without a patch:
- add `server/demo.js` `FX` to `scripts/refresh/fx.js` FX_CODE_COPIES;
- let the archive mirror closed ledger entries before `PRUNE_CLOSED_DAYS`, or raise it;
- set `HISTORY_STORE=branch` (user setting);
- replace palette.js's stale "A = $10K, B = $250K" comment;
- add a test tying public/app.js HOUSEHOLDS and palette JUICE_BREAKS to juice.js.

## 11. Replayable steps

```bash
cd /home/user/melon-seek
# raw counts
rg -c '\b\d[\d_,.]*\b' server scripts .github --glob '!*.json' --glob '!*.jsonl' | sort -t: -k2 -nr
for p in asOf 'as of' as_of taxYear '\b202[3-7]\b' '%' '/yr' 'per year' perUSD '\brate' '\bcap\b' '\bbase\b' threshold '\bmin\b' '\bmax\b' bound anchor grade multiplier LEVEL SENIORITY; do
  rg -c -i -- "$p" server scripts .github --glob '!*.json' --glob '!*.jsonl' | awk -F: -v p="$p" '{s+=$2;n++} END {print p, s, n}'; done
# data schemas
node -e 'const d=require("./data/cities.json"); console.log(Object.keys(d), d.cities.length)'
# market comps from the local snapshots (391 cells on 2026-10-10)
node scripts/build-market.js --out <scratchpad>/freshness/audit-core-market.json
# hand-off + tables (re-run whenever the owners' files move)
node <scratchpad>/freshness/audit-core/gen.mjs /home/user/melon-seek
# shape check against the lead's validator
node --input-type=module -e 'import { validateRegistry } from "./scripts/refresh/run.js"; import fs from "node:fs";
  const e = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(validateRegistry({ format: "melon-freshness-1", entries: e }));' <scratchpad>/freshness/registry-audit-core.json
git apply --check docs/process/patches/freshness-audit-core-*.diff
```

## 12. Verification

- **`gen.mjs`**:
  - 112 entries, 0 unresolved `file:line` lookups;
  - its asserts pass: fullGlassUSD, NYC basket code = data, 89 cities, MAX_ANNUAL.
- **`validateRegistry` (scripts/refresh/run.js)**: the only problems are updaters that do not exist yet: tax.js (71), policy.js (14), rents.js (3), living.js (3), jobs.js (1). The sibling agents are writing these modules. There are no shape errors.
- **Patches**: both pass `git apply --check` against the 2026-10-10 working tree.
- **FX copies**: all equal (node check: 23 keys, 0 diffs; bigMac dollarEx and 89 city fxPerUSD = fx.perUSD).
- **`npm test`** (2026-10-10, full suite, 82 s): 435 tests, 432 pass, 3 fail. None of the failures is in my files:
  - `test/freshness.test.js:25` "registry: well formed" and `:30` "every updater module is registered": the lead's registry (`data/freshness.json`) is mid-merge and its updater modules are still being written.
  - `test/workflows.test.js:51` "contents: write only where needed": `.github/workflows/monthly-refresh.yml` job `refresh` has `contents: write`. That is the lead's workflow against the deploy-side workflow test.
  - Reported, not fixed.
- I own no test files. My only code is the generator, which is not product code.

## 13. Known gaps and follow-ups

- Consumers in `public/*` were traced by grep for the main surfaces only. freshness-audit-surface owns the full UI inventory.
- Line numbers move. The Juice tax agent, the deploy engineer, the lead and the archive agent edited `server/juice.js`, `scripts/build-static.js` and the workflows during this audit. Re-run `gen.mjs` before the final merge.
- I did not fetch the HUD FY2027 FMR, ISO 4217 list_one.xml or Numbeo pages. The notes mark these items unverified.
- The cities.json format is still changing (household agent).

## 14. Change log

- 2026-10-10:
  - Read the scope and data schemas.
  - Raw greps: 3,095 numeric hits in 67 files.
  - Wrote `gen.mjs` and the first-pass hand-off (110 entries).
  - Adapted to the lead's id list.
- 2026-10-10: The tax agent rewrote the tax section (71 TAX_SOURCES keys, household-aware rules, `reviewed` / `unverified` / `notModeled` fields). I made the tax extraction generic (rule + referenced constants, breadth-first). The hand-off went to 112 entries and was sent to the lead.
- 2026-10-10:
  - New workflows appeared (monthly-refresh, archive, archive-backfill; snapshot.yml split stable/beta crons; col-refresh dispatch-only). Updated `workflow-schedules`.
  - Verified the Node EOL dates and Bulgaria's euro adoption.
  - Wrote the two patches.
  - Final re-count: 3,757 numeric hits in 79 files.
