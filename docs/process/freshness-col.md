# Process log: freshness-col (rents, cost index, NYC basket, household scale)

## 1. Brief

Prompt: [prompts/freshness-col.md](prompts/freshness-col.md) (written by the freshness lead). Goal: give
every rent and living-cost input of the Juice Score a monthly update path in the refresh mechanism
(`scripts/refresh/run.js`, docs/DATA_FRESHNESS.md): automatic where an official machine-readable
feed exists, detect-and-alert where only a release can be seen, a dated manual checklist otherwise.

Files owned and written: `scripts/refresh/rents.js`, `scripts/refresh/living.js`,
`test/refresh-col.test.js`, `test/fixtures/refresh/rents/**`, `test/fixtures/refresh/living/**`,
`docs/process/freshness-col.md` (this log), `docs/process/patches/freshness-col-*.diff`, and the
hand-off `<scratchpad>/freshness/registry-col.json` (13 registry entries). The prompt file
`docs/process/prompts/freshness-col.md` was already saved by the lead. No probe workflow was added
and nothing was committed or pushed (lead's no-push rule): every runner read used the existing
`freshness-probe.yml`.

## 2. Inputs and sources

Repo files read: `data/cities.json` (schema, all 89 cities' sources and classes, `bedroomRatios`,
`baseline`), `scripts/update-col.js` (`validateDoc`, `RENT_PAIRS`, `toUsdAt`, `parseCsv`),
`server/juice.js` (`NYC_BASKET_USD`, `LIVING_SCALE`, `HOUSEHOLDS`, `RENT_FIELDS`, `computeJuice`,
`rentFor`, `attachJuice`), `docs/LIVABILITY.md` (§1, §4, §4.1, §4.2, §5, §6, §7),
`docs/process/juice-household.md` + prompt, `docs/process/scripts/juice-household-{rents,hud}.mjs`
(the exact text formats the updater must reproduce), `.github/scripts/juice-data-probe.py` and the
logs of its runs 38034075871, 38034389341 and 38034570824 (headers of ONS Table 1, RTB, StatCan,
NSW), `scripts/refresh/{lib,run,bigmac}.js`, `docs/DATA_FRESHNESS.md`, `data/freshness.json`,
`public/features/freshness.js`, `public/app.js` (juiceBlock), `public/viz/map.js`.

What each source is, what the data file cites, cadence and the machine-readable form used:

| Registry id | Source (as cited in data/cities.json) | Machine-readable form used | Cadence | Encoded as of |
|---|---|---|---|---|
| rents-us-hud-fmr | HUD Fair Market Rents FY2026, 30 HUD areas (40 cities) | HUD eGIS `Fair_Market_Rents/FeatureServer/0` query (JSON) + layer metadata (edit date gives the FY) + Federal Register API (newest FY notice); HUD USER API `fmr/data/{FMR_CODE}?year=` with `HUD_API_TOKEN` | yearly (Aug/Sep, effective 1 Oct) | 2025-10 (FY2026) |
| rents-gb-ons | ONS Price Index of Private Rents, Table 1, 16 Sep 2026 edition | dataset landing page (edition links) + xlsx Table 1 (18.6 MB) via the built-in xlsx reader | monthly | 2026-08 |
| rents-ie-rtb | RTB via CSO PxStat RIQ02, 2025 Q4 | PxStat JSON-RPC `ReadDataset` query (Dublin 120500, beds 01/02/03, all types) returning JSON-stat 2.0; full cube (7.7 MB) as fallback | quarterly, long lag | 2025-12 |
| rents-ch-zurich | Stadt Zürich Mietpreiserhebung 2026 | `BAU516OD5161.csv` (762 KB) | biennial (2022, 2024, 2026) | 2026-04 |
| rents-fr-olap | OLAP loyers 2025, Paris | data.gouv.fr dataset API (resources by year) + `Base_OP_<year>_Nationale.csv` (Latin-1, `;`) | yearly | 2025-01 |
| rents-ca-statcan | Statistics Canada 46-10-0092-01, 2026 Q2 | full-table CSV zip `46100092-eng.zip` (129 KB) | quarterly | 2026-04 |
| rents-sg-hdb | HDB median rent by town and flat type, 2026 Q2 | data.gov.sg `datastore_search` filtered to town CENTRAL (JSON) | quarterly | 2026-06 |
| rents-nsw-official | NSW Rent and Sales Report, June quarter 2026 | landing page (xlsx links) + rent tables xlsx (3.4 MB), sheets LGA and Postcode | quarterly | 2026-06 |
| rents-bedroom-ratios | derived (pooled = median of GB-london, IE, CH, FR, AU-sydney, CA-toronto) | recomputed in rents.js | with its members | 2026-10 |
| rents-1br-quoted | Numbeo city pages (aggregator, terms not cleared) | none allowed (terms forbid automated collection) | page months 2026-05..10 | oldest 2026-05 |
| cost-index | Numbeo single-person estimate ÷ New York's (aggregator / estimate) | none allowed | page months 2026-06..10 | oldest 2026-06 |
| nyc-basket | Numbeo New York basket × 12 = $19,982 (2026-09) | drift check: BLS public API v1, CPI-U New York-Newark-Jersey City, all items less shelter (CUURS12ASA0L2) | monthly CPI | 2026-09 |
| living-scale | DWP HBAI after-housing-costs modified OECD scale (gov.scot page); BLS CE 2024 cross-check | gov.scot HTML table; BLS v1 CE series `CXU{TOTALEXP,HOUSING,INSPENSN,CASHCONT}LB05{02,04,06}M` | yearly review | 2026 / CE 2024 |

Live facts found while verifying (2026-10-10):
- **HUD FY2027 FMRs are published** (Federal Register 2026-17891, 2026-09-01, effective 2026-10-01)
  but HUD's eGIS service still serves FY2026 (data last edited 2025-09-30). The US ratios are
  therefore one fiscal year behind; the refresh reports `drift` until `HUD_API_TOKEN` is set or
  HUD updates eGIS. FY2026 FMRs were also revised (Federal Register 2026-07741, 2026-04-21); the
  eGIS layer was not edited after 2025-09-30, so whether any of our 30 areas changed is unverified.
- **Stadt Zürich dataset licence is CC0** (CKAN `license_id: cc-zero`); cities.json says
  "licence as stated on the dataset page" (patch below).
- **BLS CE 2025** annual tables are not in the API yet ("No Data Available ... Year: 2025").
- NY CPI-U less shelter, Aug 2026 = 307.227 (all items 362.328); the basket's page month (Sep
  2026) CPI is not out yet, so the drift is 0.00% today.
- data.gov.sg ignores `sort`; the HDB query reads all 509 CENTRAL records.
- ONS and NSW serve full files only (HTTP Range is ignored by ONS).

Fixtures (all captured by `freshness-probe.yml` on 2026-10-10, decoded with
`node .github/scripts/freshness-probe.mjs --decode`, sha256 verified):

| Fixture (test/fixtures/refresh/...) | Source URL | Probe run | Trim |
|---|---|---|---|
| rents/hud-fmr-layer.json | `.../Fair_Market_Rents/FeatureServer/0?f=json` | 38037021201 | none (11 KB) |
| rents/hud-fmr-areas.json | eGIS query for the 30 areas (exact URL in urls.json) | 38037021201 | none |
| rents/fedreg-fmr.json | Federal Register API (exact URL in urls.json) | 38037021201 | none |
| rents/ons-pipr-page.html | ONS PIPR dataset page | 38037021201 | none (89 KB) |
| rents/cso-riq02-dublin.json | `ws.cso.ie/public/api.jsonrpc?data=...` (GET; POST gave identical bytes) | 38037264618 | none (5.8 KB) |
| rents/zurich-rents-whole-city.csv | `.../download/BAU516OD5161.csv` | 38037021201 | header + the 504 "Ganze Stadt" rows, bytes unchanged |
| rents/olap-dataset.json | `www.data.gouv.fr/api/1/datasets/resultats-nationaux-des-observatoires-locaux-des-loyers/` | 38037021201 | none |
| rents/olap-2025-paris.csv | `observatoires-des-loyers.org/datagouv/2025/Base_OP_2025_Nationale.csv` | 38037021201 | header + the 78 "Paris intra-muros" lines, Latin-1 bytes unchanged |
| rents/statcan-46100092.zip | `www150.statcan.gc.ca/n1/tbl/csv/46100092-eng.zip` | 38037021201 | none (129 KB) |
| rents/hdb-central-all.json | data.gov.sg datastore_search, filters town CENTRAL, limit 1000 | 38037264618 | none |
| rents/nsw-page.html | NSW Rent and Sales Report page | 38037021201 | the `<main>` element only (6 KB of 358 KB) |
| rents/nsw-rent-tables-june-2026-trimmed.xlsx | `.../rent-tables-june-2026-quarter.xlsx` (3.4 MB) | 38037454839 | rebuilt with only the title/header rows, the City of Sydney LGA rows and the postcode 2000 rows; images, thumbnail and printer settings dropped; cells and shared strings unchanged (53 KB) |
| living/bls-v1-cpi-ce.json | POST `api.bls.gov/publicAPI/v1/timeseries/data/` (CPI + 12 CE series, 2024-2026) | 38037021201 | none |
| living/govscot-equivalisation.html | gov.scot HBAI income equivalisation page | 38037264618 | none |

Not captured: the ONS xlsx (18.6 MB). The probe's `process.exit(0)` dropped most of a large
document's output (runs 38037270778, 38037264618; reported to the lead, fixed in its working tree,
not pushed yet); with a long trailing `sleep` the output survives, but the job log of a 25 MB
base64 stream comes back with its beginning cut (run 38037458028), and ONS ignores `Range`
(38038045236 / 38038049141 both returned the first 9.32 MB). The first half shows the structure
(sheet4.xml = Table 1, 49,983 rows, shared strings after it, rows in time order, time period as
Excel serials such as 44805 = 2022-09-01), but not the latest rows.

Web searches: PxStat JSON-RPC format (CSOIreland/PxStat wiki "API-Cube"); ONS PIPR download
formats (xlsx only). Skills: none.

## 3. Decisions and rationale

1. **One registry id per source family** (approved by the lead): rents-us-hud-fmr, rents-gb-ons,
   rents-ie-rtb, rents-ch-zurich, rents-fr-olap, rents-ca-statcan, rents-sg-hdb, next to the lead's
   rents-bedroom-ratios, rents-nsw-official, rents-1br-quoted, cost-index, nyc-basket, living-scale.
   Each family has its own release date, cadence and archive versions. `households` stays a policy
   entry (lead / freshness-jobs).
2. **What is automatic.** Only the official bedroom ratios (and Sydney's official rents) have open
   feeds. The 1-bedroom quotes, cost index and NYC basket are Numbeo figures: no feed and the terms
   forbid automated collection (LIVABILITY §4.1), so they stay manual with a per-city staleness
   list. Nothing scrapes Numbeo.
3. **Write path keeps the household agent's schema exactly.** Every text the updater writes
   (`bedroomRatios` label/name/note, the cities' `sources.rent2/3brCenterLocal` name/method/ratio)
   is regenerated with the same templates as `juice-household-rents.mjs`; tests prove that each
   real fixture applied to today's data is a byte-for-byte no-op. Rents = round2(1-bedroom × the
   unrounded ratio); USD via update-col's `toUsdAt` at the city's current `fxPerUSD` (so an FX change
   made earlier in the same run by fx.js is respected); USD source objects keep their name and get
   the new `url` / `asOf` / `fxAsOf`. 1-bedroom quotes, cost index, FX, Big Mac and every top-level
   key other than `bedroomRatios` are never touched (test).
4. **Pooled ratio** is recomputed only when one of its six members changed in this run (from the
   unrounded ratios just fetched, else the stored 3-decimal ones), so an unrelated run never moves
   33 cities by a cent; its `asOf` becomes the current month. Singapore = pooled r2, then HDB's
   4-room ÷ 3-room step.
5. **Bounds.** Ratio move > 15% between releases (`MAX_RATIO_MOVE`): official bedroom ratios range
   1.10-1.48 for r2; a 15% jump means the source changed definition, not the market. Rent quote move
   > 25% (`MAX_LEVEL_MOVE`, the prompt's bound) for any city/field and for the bedroom levels quoted
   in the source text. Either is `flag`: nothing written for that family. The whole new document must
   also pass `validateDoc`, keep the city count and keys, keep outside < centre (Mountain View is a
   pre-existing exception, reported as a warning), and have no `asOf`/`fxAsOf` in the future.
6. **Detect fallbacks.** ONS and NSW only download their xlsx when the landing page shows a newer
   edition than the encoded `file`; if that xlsx cannot be read the result is `drift` with the
   checklist, never `error`-and-silence and never a guessed figure. HUD: a newer FY on the Federal
   Register than on eGIS is `drift` unless `HUD_API_TOKEN` gets all 30 areas from the HUD USER API.
7. **No dependency xlsx/zip reader** (`readZip`, `readXlsx` in rents.js): central-directory zip
   reader with `zlib.inflateRawSync`; rows located with `Buffer.indexOf` so the 92 MB ONS sheet never
   becomes one string; a `keep` filter (`keepRowsWith`) skips rows before decoding them (header
   strings are shared strings, so the filter resolves shared-string indices). Verified on the real
   StatCan zip and the real NSW workbook.
8. **NYC basket stays where it is.** It already lives in `data/cities.json` (`baseline.nycBasketUSD`,
   used by `attachJuice`); `NYC_BASKET_USD` in server/juice.js is the default for callers passing a
   bare array, and `test/juice.test.js:394` keeps them equal. No move, so no basket patch. The detect
   check is CPI-U New York all items **less shelter** (the basket excludes rent), alert at 3% (about a
   year of non-shelter inflation; ~$600 a year on the living line). The finding carries the
   CPI-indexed figure; a person decides (it is a Numbeo number in code).
9. **Household scale is product policy on an official methodology**: the check re-reads the HBAI
   AHC weights (0.58 / 0.42 / 0.20) from the gov.scot page and recomputes the BLS CE cross-check
   (one $23,261, two $41,922, four $56,160 for 2024 → 1.80 / 2.41 vs the scale's 1.72 / 2.41); a CE
   year newer than the one cited in server/juice.js is a review alert. Yearly review cadence.
10. **One BLS request** (v1 allows 25 series and roughly 25 requests a day per IP) serves both
    living checks; with `BLS_API_KEY` the same body goes to v2.
11. **Cost index official proxy (proposal, not wired):** BEA Regional Price Parities excluding
    housing for US metros (needs `BEA_API_KEY`), rescaled to New York MSA = 100; Eurostat price
    level indices (`prc_ppp_ind`) for EU/EFTA; World Bank ICP 2021 elsewhere. It replaces a Numbeo
    figure, so it is decision D6, recorded in the cost-index checklist.

## 4. Replayable steps

```sh
# 1. Capture real sources on a runner (no push): workflow_dispatch freshness-probe.yml with
#    input `requests`, e.g. (batch 1, run 38037021201)
#    [{"name":"hud-fmr-layer.json","url":"https://services.arcgis.com/VTyQ9soqVukalItT/ArcGIS/rest/services/Fair_Market_Rents/FeatureServer/0?f=json"},
#     {"name":"hud-fmr-areas.json","url":"<hudQueryUrl(areas) from rents.js>"}, ... ]
#    Large files: append {"name":"flush-wait.json","url":"<any small URL>","sleep":120000} so the
#    log is complete (until the lead's probe fix is pushed). Then:
#    get_job_logs(job_id, return_content=true) -> JSON file -> logs_content; strip U+FEFF:
sed -i 's/\xEF\xBB\xBF//g' job.log
node .github/scripts/freshness-probe.mjs --decode job.log cap/
# 2. Trim: Zurich/OLAP keep header + needed lines (bytes unchanged); NSW page keeps <main>;
#    NSW xlsx rebuilt with python3 -I trim_xlsx.py (kept rows: <= 12, LGA = shared string
#    "Sydney", Postcode = 2000; parts dropped: thumbnail, image, drawings, printer settings).
# 3. Offline run of the two modules through the orchestrator:
node scripts/refresh/run.js --offline --dry-run --now 2026-10-10 --only rents,living --out tmp/refresh
# 4. Tests
node --test test/refresh-col.test.js        # 30/30
npm test                                    # see §5
```

`trim_xlsx.py` (kept outside the repo, reproduced here): read the zip; parse `xl/sharedStrings.xml`
into a list; for each listed sheet keep `<row>` elements whose number ≤ `head` or whose cell in
`col` is a shared string in `strings` or a number in `numbers`; remove `<drawing/>`; drop the listed
parts and their `[Content_Types].xml` overrides; write every other part unchanged (deflate).

## 5. Verification

- `node --test test/refresh-col.test.js`: **30 pass, 0 fail**. Covers: zip and xlsx readers on real
  files; every parser against its real fixture, reproducing the encoded values and source texts;
  each family applied to today's data is a no-op; validators (1 < 2 < 3, ratio/level moves, future
  dates, older releases, outside < centre, USD = local ÷ FX, city count/keys, sources need class /
  url / asOf); `check()` offline returns one Result per id in MODULE order, never throws (no
  fixtures → skipped; unreadable cities.json → error); doctored HUD fixture (SF 2-bed $5,000) →
  `flag`, nothing written; doctored RTB fixture (Dublin 2-bed €2,400) → `changed`, pooled ratio
  and the 33 pooled cities and Singapore re-derived, writes pass `validateDoc`, only rent fields and
  `bedroomRatios` change; a newer NSW quarter → `drift` without its xlsx, `changed` with it;
  doctored BLS (+4% CPI) and gov.scot (0.60) → `drift`; run.js `runRefresh` dry run with both
  modules: no problems, nothing written.
- Offline module results on the real fixtures (2026-10-10): rents-us-hud-fmr **drift** (FY2027),
  rents-gb-ons / -ie-rtb / -ch-zurich / -fr-olap / -ca-statcan / -sg-hdb / -nsw-official /
  rents-bedroom-ratios **ok**, rents-1br-quoted **stale** (8 cities, May-June page months),
  cost-index **stale** (5 cities), nyc-basket **ok** (0.00%), living-scale **ok**.
- `npm test`: 496 tests, failures only in other agents' in-progress files: test/archive.test.js
  (3), test/archive-sweep.test.js (1), test/perf.test.js (1, event-loop timing, flaky under load);
  test/freshness.test.js passes once the lead's registry has these ids (it does now).
- Registry hand-off validated with run.js `validateRegistry` (0 problems) and every `extract` spec
  read with `readExtract` (arrays and `keyPrefix` per the lead's update).

## 6. Known gaps and follow-ups

- **HUD FY2027**: the US 2/3-bedroom ratios are FY2026 while FY2027 is in effect. Fix: add the
  `HUD_API_TOKEN` secret (monthly-refresh.yml already passes it) or wait for HUD's eGIS update.
  The HUD USER API response parser follows the documented shape; not verified live (no token).
- **ONS xlsx** parse path is verified on the real header names and values (juice-data-probe logs)
  and on the real NSW workbook, not on the real 18.6 MB ONS file (see §2). First real test: the
  next ONS edition (expected ~21 October 2026); if it fails the result is drift with the checklist.
- Online runs use the lib's `melon-seek-refresh/1` user agent; fixtures were captured with a browser
  UA. The juice-data-probe (custom UA) reached all these hosts except Victoria; gov.scot with a
  custom UA is untested.
- Manual entries: run.js's `applyResultsToRegistry` sets `lastChecked` on any module `ok`, which
  for a manual entry means "not yet due", not "re-read" (told the lead).
- `public/features/freshness.js` maps a 2/3-bedroom rent only to rents-bedroom-ratios; patch
  `freshness-col-ui-rent-ids.diff` adds the source family id so the drawer's "update due" flag
  follows e.g. HUD's FY drift.
- Victoria Rental Report still unreachable (Melbourne uses the NSW ratio); 33 cities use the pooled
  ratio; Census ACS needs a key; URA private rents need a key.
- `docs/process/scripts/juice-household-rents.mjs` embeds the original figures; after an automatic
  update it is out of date (re-running it would restore the old ratios). It is the household agent's
  replay script; the refresh is now the update path.

Patches (for the lead to apply after the owners finish):
- `docs/process/patches/freshness-col-livability-refreshing.diff` → docs/LIVABILITY.md: sources
  table "Refresh" column and §6 "Refreshing" describe the monthly rents/living checks.
- `docs/process/patches/freshness-col-ui-rent-ids.diff` → public/features/freshness.js
  (freshness-derived): rent as-of ids include the bedroom-ratio source family.
- `docs/process/patches/freshness-col-zurich-licence.diff` → data/cities.json: bedroomRatios.CH
  licence = CC0 (verified on the dataset metadata).

## 7. Change log

- 2026-10-10 07:58 UTC: read the brief, the household agent's log, scripts and data; tallied every
  rent/cost source by class and URL.
- 08:11: probe batch 1 (run 38037021201): 15 sources; 08:15 batch 2 (38037264618).
- 08:16-08:36: large-file attempts (ONS 18.6 MB, NSW 3.4 MB); found the probe's stdout truncation
  and the log BOM issue; NSW captured complete (38037454839); ONS not obtainable.
- 08:20-08:45: rents.js (zip/xlsx readers, 8 parsers, validators, apply functions, check), living.js,
  fixtures and urls.json, tests (30), registry hand-off (13 entries), three patches.
