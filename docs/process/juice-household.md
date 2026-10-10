# Process log: juice-household (Juice Score households and bedroom rents)

## 1. Brief

Prompt: [prompts/juice-household.md](prompts/juice-household.md). The user saw "Rent −$44K/yr,
1-bedroom, city centre" for a $675K San Francisco role and asked whether rent was low, and for a
flexible home size (2 or 3 bedrooms for a small family). Goal: audit the 1-bedroom figures against
official data, add a household choice (Just me / Couple / Family) that scales rent and living
costs, pass the household to the tax agent's `taxFor`, and show it in the drawer. A separate tax
agent owns the tax model.

Files owned and changed: `data/cities.json`, `scripts/update-col.js`, the household / rent /
living parts of `server/juice.js` (`HOUSEHOLDS`, `LIVING_SCALE`, `RENT_FIELDS`, `householdOf`,
`livingScaleFor`, `computeJuice`, `rentFor`, `attachJuice`), `public/app.js` (household state,
re-juice, `juiceBlock`), one rule in `public/styles.css`, `test/juice-household.test.js` (new),
`test/juice.test.js` (numeric field list), `docs/LIVABILITY.md` §1, §2, §4, §4.2, §5, §6 step 1
and §7. Also `.github/workflows/juice-data-probe.yml` + `.github/scripts/juice-data-probe.py`
(committed and pushed, as allowed), `docs/process/scripts/juice-household-{rents,hud,shots}.mjs`
and `docs/screenshots/juice-household/*.png`.

## 2. Inputs and sources

Repo files read: `docs/LIVABILITY.md` (all), `server/juice.js`, `data/cities.json`,
`scripts/update-col.js`, `public/app.js` (state, `prepare`, `applyJobs`, `render`, `renderViz`,
`juiceBlock`, `lsGet`/`lsSet`), `public/api.js` (juice attachment, read only), `public/viz/map.js`
(juice colouring reads `job.juice.byLocation`), `docs/CONTRACT.md`, `docs/strategy/ROADMAP.md` §8-9,
`docs/process/TEMPLATE.md`, `docs/process/livability.md`, `test/juice.test.js`,
`test/workflows.test.js`, `test/e2e/harness.js`.

Network: the sandbox and WebFetch reach none of the statistics hosts (curl `000`, WebFetch
`ENOTFOUND`); WebSearch works for summaries. Every figure below came from a GitHub Actions run of
`juice-data-probe.yml` (6 runs, 2026-10-10 07:14-07:36 UTC, runs 38033743738, 38034075871,
38034389341, 38034570824, 38034907230, 38034992390), which downloads the dataset on the runner
and prints the values to the job log.

| Source | Result | Used for |
|---|---|---|
| HUD eGIS `Fair_Market_Rents` feature service (last edited 2025-09-30 = FY2026) | FMR 0-4BR for the 30 HUD areas of the 40 US cities | US bedroom ratios; 1-bed audit |
| HUD eGIS `HUD_PDR_Small_Area_Fair_Market_Rents` table 1 (ID = ZIP) | SAFMR 0-4BR for ~100 central ZIPs | 1-bed audit (city-centre medians); ratios match the metro ratios |
| huduser.gov xlsx (FY2026, FY2027) | HTTP 202, 0 bytes (bot challenge) on every URL | not used; not circumvented |
| Census ACS API (B25031) | "Missing Key" HTML page | not used (needs a key) |
| ONS Price Index of Private Rents, 16 Sep 2026 release, Table 1 | mean rent by bedrooms, Aug 2026, every LA (London, Westminster, Camden, ...) | UK ratios; London audit |
| CSO PxStat RIQ02 (RTB) | 2025 Q4 new-tenancy rents by bedrooms and property type; Dublin postal districts empty | Dublin ratio; audit |
| Stadt Zürich `bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161` | 2026 median net rents by rooms, private/non-profit, new tenancies, districts | Swiss ratio; Zurich audit |
| OLAP via data.gouv.fr (`Base_OP_2025_Nationale.csv`) | Paris 2025 medians by rooms and tenant tenure | Paris ratio; audit |
| Statistics Canada 34-10-0133-01 (CMHC RMS) and 46-10-0092-01 (asking rents) | Oct 2025 averages; 2026 Q2 asking rents by bedrooms, 4 CMAs | Canada ratios (asking rents); audit |
| NSW DCJ Rent and Sales Report, June quarter 2026 | new-bond medians by LGA, postcode, dwelling type, bedrooms | Sydney rents (direct); Melbourne ratio; audit |
| Victoria DFFH Rental Report / data.vic | timed out on 4 runs | not used |
| data.gov.sg HDB median rent by town and flat type | 2026 Q2 Central Area 3/4/5-room | Singapore third-bedroom step; audit |
| BLS public API v1, CE series `CXU<item>LB05<nn>M` | 2024 means by consumer-unit size | living-cost scale check |
| MIT Living Wage county pages (SF, New York, King, Travis) | typical expenses by family type | scale cross-check only |
| Zillow ZORI city CSV | Aug 2026 all-homes index | cross-check only (aggregator) |
| WebSearch | Zumper SF 2026 1/2-bed medians (KTVU, NBC Bay Area, Zumper page); IBB Berlin asking rents 2025, Berliner Mietspiegel 2024; Tokyo 2023 survey average (MUFG); OECD / DWP equivalence scales (Scottish Government page); FY2027 FMR Federal Register notice | cross-checks, scale choice |

Skills: none loaded (no artifact or chart produced).

## 3. Decisions and rationale

1. **Household presets, not free inputs.** Just me (1 adult, 1 bedroom), Couple (2 adults, 2
   bedrooms), Family (2 adults, 2 children under 14, 3 bedrooms), as the prompt specified. Keys
   `single | couple | family`; unknown keys fall back to `single`, so old callers are unchanged.
2. **Wording "Just me · Couple · Family"** rather than "1 bed · 2 bed · 3 bed": the switch changes
   both rent and living costs, and "bed" is an abbreviation. The bedroom count is in each button's
   tooltip and in the rent row ("3-bedroom, city centre"); the living row names the people
   ("everyday costs for two adults and two children, excluding rent").
3. **Living-cost scale: DWP after-housing-costs modified OECD scale** (0.58 / 0.42 / 0.20 →
   1, 1.72, 2.41). Considered the OECD-modified scale the prompt suggested (1.5 / 2.1) and the
   square-root scale (1.41 / 2.0). Our basket excludes rent, and the data fits the
   after-housing-costs version: BLS CE 2024 non-housing spending 1.80 / 2.33-2.41, MIT Living
   Wage 1.65-1.72 / 2.38-2.40. The CE ratios include an income effect, so they are an upper check.
4. **Rent: one basis per city.** Using HUD's 2- and 3-bedroom FMR levels next to a Numbeo
   1-bedroom figure would make SF's 2-bedroom ($3,604) cheaper than its 1-bedroom ($3,679). So
   each city keeps its 1-bedroom figure and gets 2/3-bedroom = 1-bedroom × an official bedroom
   ratio for that city, metro or country (`class: estimate`, method and ratio recorded, Numbeo
   `terms` inherited so a D6 removal takes them too). Where an official new-letting source covers
   all three counts on the same basis (Sydney), all three are official and the 1-bedroom figure is
   replaced.
5. **Which ratio.** US: HUD FY2026 FMR area ratios (HUD applies them to SAFMRs too, so central ZIPs
   give the same). UK: ONS Table 1 by LA (Scotland for Edinburgh, which Table 1 does not list).
   Ireland: RTB Dublin all property types (3-bed apartments are rare in Dublin). Switzerland:
   Stadt Zürich new private tenancies (Geneva too). France: OLAP new tenants. Canada: StatCan
   asking rents (same measure as the 1-bed quote; CMHC averages are sitting tenants).
   Melbourne: NSW Sydney LGA (Victoria unreachable). Singapore: pooled 2-bed ratio, then HDB
   4-room ÷ 3-room. Everyone else (33 cities): pooled median of the six non-US official ratios
   (1.281 / 1.533). No Numbeo figure was added (§4.1).
6. **1-bedroom audit verdict: no value changed except Sydney.** All 15 audited cities sit inside
   the spread of official and market data. San Francisco is above HUD's FY2026 central-ZIP 40th
   percentile ($3,025 median) and ~16% below 2026 listings (Zumper $4,400; ZORI +25% a year).
   No official source measures 2026 city-centre asking rents, and swapping in another aggregator
   would not fix provenance, so it stays and the evidence is recorded (`audit`, LIVABILITY §4.2)
   for the D6 decision. Sydney moved to NSW official (−2.6%, same measure).
7. **HUD ratios understate San Francisco's market 2-bed premium** (HUD 1.21 vs Zumper ~1.4).
   Kept the official ratio and documented the gap; a Couple in SF is therefore conservative.
8. **Tax interface.** `taxFor(grossLocal, jurisdiction, { household })`; my tests compare the
   default against the 2-argument call and never assert couple/family tax, so the tax agent's
   household rules can land without touching my tests.
9. **Front end without editing api.js.** api.js attaches one-person juice. app.js re-attaches
   juice (same `juice.js` + cached `getCities()`) for the chosen household in `applyJobs` when
   any job's `juice.household` differs, and on every switch, in 300-job chunks that yield; it
   then re-renders cards, filters, sort and the map (its signature includes the household) and
   swaps only the drawer's Juice section, keeping focus on the pressed button. `job.juice.household`
   records what the numbers are for, and the drawer labels follow it, so a failed re-juice can
   never show Couple labels on one-person numbers. Choice stored in localStorage
   (`melon-seek.household.v1`); not put in the URL hash (optional; it would add a hash key that
   other agents' URL tests would have to learn).
10. **Validation in update-col.js.** `validateDoc()` checks every city's 1/2/3-bedroom rents
    (all or none, rising, dated and classed sources, estimates with a method, USD = local ÷ FX);
    the refresh refuses to write a failing document. `RENT_PAIRS` re-converts the new USD fields.
11. **Dataset size.** cities.json grew from 292 KB to 527 KB (gzip 17 KB → 32 KB) after moving the
    long ratio-source text into one top-level `bedroomRatios` table referenced by `ratioKey`.

## 4. Replayable steps

```sh
# 0. Prompt saved verbatim: docs/process/prompts/juice-household.md
# 1. Probe official datasets on a runner (sandbox cannot reach them):
git add .github/workflows/juice-data-probe.yml .github/scripts/juice-data-probe.py && git commit && git push
#    then workflow_dispatch juice-data-probe.yml with sections, e.g. "hud3 hud5 ons2 cso2 zurich2 statcan misc3 nsw bls"
#    and read the job log (get_job_logs). Figures are embedded in the two scripts below.
# 2. Bedroom rents into data/cities.json (idempotent; validates before writing):
node docs/process/scripts/juice-household-rents.mjs            # --dry-run to preview
# 3. Tests
node --test test/juice.test.js test/juice-household.test.js    # 34/34
npm test                                                       # 356/356
NODE_PATH=<scratch>/pw/node_modules node scripts/e2e.js       # 86/86
# 4. Screenshots of the drawer's Juice block, each household, 1440 and 390 px, light and dark (+ 360 px check)
NODE_PATH=<scratch>/pw/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  node docs/process/scripts/juice-household-shots.mjs          # -> docs/screenshots/juice-household/
```

## 5. Verification

- `node --test test/juice.test.js test/juice-household.test.js`: 34 pass, 0 fail (10 new: presets,
  scale and its data checks, single = original for all 89 cities, couple/family rent and living,
  monotonic per city, outside-centre ratio, override + NO_RENT, attachJuice household, data
  integrity of the new fields incl. "no Numbeo, no aggregator", update-col FX re-conversion and
  `validateDoc`).
- `npm test`: 356/356 (one earlier run had `PERF-1` fail at an event-loop lag over 150 ms while
  other agents were building; it passes alone at 67-80 ms and in the next full run).
- `node scripts/e2e.js` (full): 86/86 passed.
- Screenshots: `docs/screenshots/juice-household/juice-{just-me,couple,family}-{1440,390}-{light,dark}.png`;
  the script also checks 360 px (no horizontal scroll, block inside the viewport), that the card
  badge behind the drawer changes with the household, and that the choice is stored. "no problems".
- San Francisco, $675K (the user's example), from the drawer: Just me 98 Juicy, $315K left
  (rent $44K, living $18K); Couple ≈97, $292K (rent $53K, living $31K); Family ≈96, $265K
  (rent $68K, living $44K). Tax $298K in all three until the tax agent's household rules land.
- Hand checks: SF 2-bed 3,678.75 × 3,604/2,977 = 4,453.6; family living 18,184 × 2.4138 = 43,891;
  Sydney 819 × 52/12 = 3,549.0.

## 6. Known gaps and follow-ups

- **Tax**: household rules now come from the tax model (`TAX_HOUSEHOLD`); the drawer says when a
  couple or family is taxed as a single filer or per person.
- **SF 1-bedroom** is ~16% below 2026 listings; decide with D6 whether a listings source (Zillow
  ZORI has attribution-only terms) or a re-read of the current figure should replace it.
- 2/3-bedroom figures are estimates for 88 cities and pooled for 33; country sources to add:
  Victoria (retry), Destatis Census 2022 by rooms (Germany), e-Stat (Japan, needs an appId),
  SSB (Norway), CBS (Israel), URA (Singapore private, needs a key).
- HUD FY2027 FMRs are not on the eGIS service yet; huduser.gov blocks scripted downloads.
- Census ACS needs an API key (repository secret) for city-level bedroom medians.
- No URL-hash parameter for the household (localStorage only); shared links open as "Just me".
- `docs/process/README.md` needs a row for this workstream (lead's file).
- The e2e run regenerates `docs/screenshots/*.png` (chart, drawer, map-juice, ...); those diffs
  are a side effect of the suite, not edits.
- Optional api.js change for the lead (avoids one extra pass when a non-default household is
  stored): accept `getJobs(params, { household })`, pass it to `withJuice(res, inputs, household)`
  and on to `attachJuiceAll(slice, cities, { household })`; app.js would then pass
  `household: juiceHousehold` in `loadJobs`. Not required: app.js works either way.

## 7. Change log

- 2026-10-10 07:05 UTC: read docs and code; saved the prompt; probed hosts (all blocked).
- 07:14: probe workflow pushed; run 1 (NSW, Zurich, BLS, MIT, ZORI ok; log overflowed).
- 07:17: household core in `server/juice.js`; SF single unchanged ($314,559, 98).
- 07:20-07:36: probe runs 2-6 (ONS, RTB, OLAP, StatCan, HDB, HUD via eGIS, SAFMR by ZIP).
- 07:25: app.js household state, re-juice, drawer control; CSS rule.
- 07:33: update-col `validateDoc` + `RENT_PAIRS`; tests; bedroom-rent builder; cities.json rebuilt.
- 07:38-07:50: screenshots, e2e 86/86, npm test 356/356, LIVABILITY.md §1/§2/§4.2/§5/§7, this log.
- Follow-up (lead), after the tax agent's household rules landed: `computeJuice` exposes
  `inputs.tax.basis` / `inputs.tax.note` and a top-level `taxBasis` (kept on every location when
  attachJuice drops `inputs`); the drawer's tax row adds one muted line for a couple or family
  ("Taxed as a single filer here (household rules not modeled)", "Each person is taxed separately
  here", or the partial note; nothing when household rules applied or the tax is zero, with the
  tax model's full note as the tooltip). LIVABILITY.md: worked examples regenerated with the new
  tax model (SF $675K: single $314,748; couple $339,270 with joint brackets; family $311,902),
  household tax text in §1, Zurich no longer listed as an estimated tax in §1, §4 and §5. New test
  "tax basis" (juice tests 40/40 with the tax golden file); e2e `--grep=juice|drawer` 19/19;
  `docs/process/scripts/juice-household-tax-shots.mjs` → `juice-tax-{couple,family}-{sf,madrid}-390.png`
  (Madrid is a screenshot fixture: no snapshot board has a salaried Madrid role, so the script adds
  one copy of a real role with a Madrid location and €90,000). No current city yields `partial`;
  its note would show jurisdiction keys such as `US-LOCAL-NYC` (the tax model's text).
