# Juice Score: livability $

> **Juice Score**, *livability $: what's left after living costs.*
> The salary is the melon. Rent, taxes and living costs are the rind. The Juice is
> what's left once the rind is peeled off.
>
> **An estimate, not financial advice.** It compares postings with one consistent,
> simplified model. It is not a payslip calculator.

Code: [`server/juice.js`](../server/juice.js) (pure ES module, also loaded in the
browser). Data: [`data/cities.json`](../data/cities.json) (89 cities). Refresh: the monthly
data refresh, [`scripts/refresh/run.js`](../scripts/refresh/run.js) and
[`.github/workflows/monthly-refresh.yml`](../.github/workflows/monthly-refresh.yml)
([`docs/DATA_FRESHNESS.md`](DATA_FRESHNESS.md)); §6. Tests:
[`test/juice.test.js`](../test/juice.test.js) and
[`test/juice-household.test.js`](../test/juice-household.test.js) (households, bedroom rents).

## 1. The formula

For one salary in one city and one household (all amounts annual, in approximate USD):

```
gross   = salary.mid converted to USD          (salary.mid is already annualized)
tax     = national income tax + state/provincial/city income tax
          + employee social contributions      (local currency, then back to USD;
                                                taxFor(gross, jurisdiction, { household }))
rent    = city-centre rent for the household's bedrooms × 12
          (1 bedroom: Just me · 2 bedrooms: Couple · 3 bedrooms: Family; option: outside-centre rent)
living  = costIndex / 100 × NYC basket × household scale
          (NYC basket = $19,982 / year for one person; scale 1 · 1.72 · 2.41)
juice   = net = gross − tax − rent − living
score   = 100 × (1 − e^(−net / $80,000)), 0 when net ≤ 0  (saturating; never clamps)
```

`computeJuice(salaryUSD, city, { household })` returns
`{ gross, tax, rent, living, net, score, grade, household, rentBurden, bigMacs, taxParts }`:

| Field | Meaning |
|---|---|
| `gross, tax, rent, living, net` | Whole dollars. The parts are rounded before `net` is taken, so `net = gross − tax − rent − living` exactly (the drawer waterfall adds up). |
| `taxParts` | `{ income, regional, social }`: national income tax (incl. surtaxes), state/province/canton/city income tax, employee social contributions. |
| `score` | 0..100 integer on the fixed saturating curve below (K = $80K). |
| `grade` | `Juicy` / `Ripe` / `Dry` / `Rind` (see below). |
| `rentBurden` | rent ÷ after-tax pay (0.30 = 30% of take-home goes to rent). |
| `bigMacs` | net ÷ the country's Big Mac price: how many Big Macs a year of juice buys. |
| `estimated` | `true` when an input is an estimate (cost-index proxy, approximate tax schedule, a 2- or 3-bedroom rent derived from a bedroom ratio). Show a "≈" or "est." marker. |
| `household` | `'single'` (default), `'couple'` or `'family'`: the household the numbers are for. |
| `rentBasis` | `'outside'` with `{ rent: 'outside' }`; `'override'` with `{ rentOverrideUSD }`. |
| `confidence` | `"high"`, `"medium"` or `"low"`; see [Guardrails](#guardrails-inputs-confidence-rent-override). |
| `inputs` | every input with its source and as-of date: `household` (adults, children, bedrooms, living scale and its source), `rent` (monthly USD/local, basis, bedrooms, class, source, method), `tax` (jurisdiction keys, effective rate, sources), `costIndex` (value, NYC baseline, class, source, method), `fx` (rate and where it came from), `bigMac`. |

### Households: Just me, Couple, Family

The user asked for rent that fits more than one person ("2 bedroom, city centre or 3 bedroom
city centre ... people with a small family"). `computeJuice(..., { household })` and
`attachJuice(job, cities, { household })` take one of three presets (`HOUSEHOLDS` in
`server/juice.js`); the drawer's Juice block has a matching **Just me · Couple · Family** switch.

| Household | Key | People | Rent | Living-cost scale |
|---|---|---|---|---:|
| Just me (default, the original model) | `single` | 1 adult | 1-bedroom, city centre | 1 |
| Couple | `couple` | 2 adults | 2-bedroom, city centre | 1.72 |
| Family | `family` | 2 adults, 2 children under 14 | 3-bedroom, city centre | 2.41 |

- **Rent** uses `rent1brCenterLocal`, `rent2brCenterLocal` or `rent3brCenterLocal` (§4.2). With
  `{ rent: 'outside' }` the 2- and 3-bedroom rents apply the city's own centre bedroom ratio to
  the outside-centre 1-bedroom figure (marked an estimate). A user rent override replaces it as before.
- **Living costs** scale the one-person basket with the **after-housing-costs version of the
  modified OECD equivalence scale** (UK DWP *Households Below Average Income*; reproduced in the
  [Scottish Government's poverty methodology](https://www.gov.scot/publications/poverty-in-scotland-methodology/pages/income-equivalisation/)):
  first adult 0.58, each further adult 0.42, each child under 14 0.20, divided by the first
  adult's 0.58 (`LIVING_SCALE`, `livingScaleFor()`). The usual (before-housing-costs) OECD-modified
  scale, 1 + 0.5 per extra adult + 0.3 per child, gives 1.5 and 2.1, but it is built for total
  income including housing, where most economies of scale sit. Our basket excludes rent, and the
  data agrees with the after-housing version:

  | Source (all excluding rent) | Couple ÷ one person | 2 adults + 2 children ÷ one person |
  |---|---:|---:|
  | **Scale used** (DWP after-housing-costs, rescaled) | **1.72** | **2.41** |
  | OECD-modified (before housing costs), for comparison | 1.50 | 2.10 |
  | [BLS Consumer Expenditure Survey 2024](https://www.bls.gov/cex/tables.htm), by size of consumer unit: total − shelter − household operations − education − personal insurance and pensions − cash contributions (one person $27,388, two $49,272, four $63,724) | 1.80 | 2.33 (four persons) |
  | Same, total − all housing − insurance and pensions − cash contributions ($23,261 / $41,922 / $56,160) | 1.80 | 2.41 |
  | [MIT Living Wage Calculator](https://livingwage.mit.edu/) budgets, San Francisco County (food, medical, transport, civic, internet and mobile, other; childcare left out; both adults working) | 1.65 | 2.40 |
  | MIT Living Wage, New York County, same items | 1.72 | 2.38 |

  BLS series `CXU<item>LB05<nn>M`, 2024 annual means, read through the BLS public API on
  2026-10-10 (one person = LB0502, two = LB0504, four = LB0506). The CE ratios also carry an
  income effect (two-person units have twice the after-tax income of one-person units), so they
  are an upper check rather than an estimate of need. The MIT figures are a cross-check only.
  Childcare, school fees and health-insurance premiums are **not** in the basket for any household.
- **Tax**: the household is passed to `taxFor(grossLocal, jurisdiction, { household })`. What it
  changes (filing status, child credits) belongs to the tax model (§3); with `'single'` the
  result is the single-filer schedule. `computeJuice` reports how a household was taxed as
  `inputs.tax.basis` (`'joint'`: household rules applied; `'single'`: not modeled there, taxed as
  a single filer; `'individual'`: the country taxes each person separately; `'partial'`: some
  levels only) with `inputs.tax.note`, and as `taxBasis` on every location. For a couple or family
  the drawer's tax row adds one muted line: "Taxed as a single filer here (household rules not
  modeled)", "Each person is taxed separately here", or the partial note.
- **Score**: the curve and grade thresholds are unchanged. A family keeps less of the same salary,
  so its Juice is lower; that is the point of the switch, not a reason to re-tune.
- **Default**: `'single'` reproduces the original one-person numbers exactly (test
  `test/juice-household.test.js`).

### Guardrails: inputs, confidence, rent override

Required by the strategy review (ROADMAP §7.1 F8, D6). Every `computeJuice` result
carries `inputs` and a `confidence`:

- **Source class** of each dataset value (`sources.*.class` in cities.json):
  `official` and `open` (and a user-entered rent, `user`) count as **high**, `aggregator`
  (Numbeo, Zumper) as **medium**, `estimate` (proxies, derived) as **low**.
- **Tax confidence:** a verified schedule is high; an unverified or approximate one is
  medium; an estimated schedule (Geneva, Finland) is low.
- **Overall** = the lowest of rent, cost index and tax. **Outside the US it is "low"
  unless both rent and cost index come from an official, open or user source.**
- Today: US cities are medium (30) or low (10: cost-index proxies, approximate taxes);
  all 49 non-US cities are low. Replacing Numbeo per §7 lifts US cities to high.
- **Rent override:** `computeJuice(salaryUSD, city, { rentOverrideUSD })` takes the user's
  own **monthly** rent in USD (0 is allowed; `null`/`undefined` means no override). It
  replaces the dataset rent, sets `rentBasis: 'override'` and `inputs.rent.class: 'user'`.
  It does not change the cost-index confidence, so a non-US city stays "low".
  `attachJuice(job, cities, { rentOverrides: { [cityKey]: monthlyUSD } })` applies it per city.
- **No rent:** a city whose rent is `null` (the plan in §7 leaves cities without an open
  rent source that way) throws `err.code === 'NO_RENT'` unless an override is given;
  attachJuice skips such locations.

### Score curve and grades

The scale is fixed, not relative to a company's postings, so a score means the same thing
on every board. The curve is a **saturating exponential** with one anchor,
**K = $80,000** of annual juice: each extra $80K closes 63% of the remaining gap to a full
glass. It rises steadily through the range where most postings sit and keeps separating
high-paying roles instead of clamping at 100. A rounded **100 needs at least $423,866 net**
(`SCORE_ANCHORS.fullGlassUSD`), above every real posting in the snapshots.

<!-- freshness:begin juice-worked-examples/score-legend -->

| Score | Net juice needed (rounded score) | Grade | Reading |
|---:|---:|---|---|
| 70-100 | ≥ $94,996 | **Juicy** | plenty left after rent, tax and living costs |
| 45-69 | ≥ $47,103 | **Ripe** | comfortable margin |
| 1-44 | > $0 | **Dry** | thin margin |
| 0 | ≤ $0 | **Rind** | costs exceed take-home pay |

Other legend points: 25 = $22,484, 80 = $126,780, 90 = $180,304, 95 = $232,034, 99 = $335,977, 100 = $423,866.

<!-- freshness:end juice-worked-examples/score-legend -->

`SCORE_ANCHORS = { curve: 'exponential', K: 80000,
fullGlassUSD: 423866 }`; `netForScore(s)` inverts the curve (it returns `fullGlassUSD` for
s ≥ 99.5, since the curve itself never reaches 100). Grades come from the rounded score, so
the badge always matches the number shown. The score boundaries (45 / 70) are unchanged from
the first version; their dollar equivalents moved with the curve.

**Calibration (real snapshots, 2026-10-02).** All 8 snapshots, 5,413 jobs, 4,551 salaried after
the vetting gate, 4,034 with juice (the rest remote-only or outside the 89 cities). Score of the
best location's net, by percentile:

| Percentile | Salary (USD) | Net juice | Old log curve (A $10K, B $250K) | **New (K $80K)** |
|---:|---:|---:|---:|---:|
| 10th | $128,500 | $38,426 | 48 | **38** |
| 25th | $165,000 | $62,990 | 61 | **54** |
| 50th | $199,267 | $88,665 | 70 | **67** |
| 75th | $279,330 | $127,375 | 80 | **80** |
| 90th | $362,500 | $172,580 | 89 | **88** |
| 95th | $415,000 | $199,654 | 93 | **92** |
| 99th | $545,918 | $277,388 | 100 | **97** |
| max | $684,082 | $397,601 | 100 | **99** |
| jobs at 100 | | | 68 (1.7%; Anthropic 61) | **0** |

Anthropic, the most compressed board: median 87 → 86, 90th percentile 100 → 96, and its top
decile went from one score (all 100) to four distinct scores (96-99). Grades: Juicy 51% → 46%,
Ripe 42% → 39%, Dry 6% → 14%, Rind 1% → 1%. A 90th-percentile salary ($362,500) scores 86 in San
Francisco, 84 in New York, 92 in Seattle, 88 in Costa Mesa. Why not just raise B: with the log
curve and B = $500K the 90th percentile drops to 74-83 for any reasonable A, so a log curve can't
both hit 85-90 at the 90th percentile and leave headroom above it. Re-run with
`node docs/process/scripts/livability-juice-distribution.mjs --old` (needs `data/snapshots/`).

### Worked examples (generated from the code)

<!-- freshness:begin juice-worked-examples/single -->

_Data as of: rent 2026-08 to 2026-09 · living costs 2026-06 to 2026-09 · FX 2026-09-30 · tax years 2025 to 2026. Generated by `scripts/refresh/examples.js` from `server/juice.js` and `data/cities.json`; the monthly refresh regenerates it, so do not edit it by hand._

| Job | Salary | Gross (USD) | Tax | Rent | Living | Juice (net) | Score | Grade | Confidence |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Software engineer, San Francisco | 300,000 USD | $300,000 | $108,447 | $44,145 | $18,184 | $129,224 | 80 | Juicy | medium |
| Software engineer, New York | 250,000 USD | $250,000 | $88,994 | $52,446 | $19,982 | $88,578 | 67 | Ripe | medium |
| Software engineer, Austin | 150,000 USD | $150,000 | $36,209 | $23,088 | $14,127 | $76,576 | 62 | Ripe | medium |
| Manufacturing engineer, Costa Mesa | 100,000 USD | $100,000 | $27,175 | $32,388 | $15,626 | $24,811 | 27 | Dry (est.) | low |
| Research engineer, London | 120,000 GBP | $161,001 | $58,822 | $34,615 | $17,244 | $50,320 | 47 | Ripe | low |
| Engineer, Zurich | 150,000 CHF | $183,140 | $44,325 | $36,816 | $22,320 | $79,679 | 63 | Ripe | low |
| Engineer, Berlin | 90,000 EUR | $103,619 | $42,385 | $18,184 | $14,287 | $28,763 | 30 | Dry | low |
| Engineer, Bengaluru | 4,000,000 INR | $41,899 | $8,278 | $3,784 | $4,216 | $25,621 | 27 | Dry | low |

<!-- freshness:end juice-worked-examples/single -->

<!-- freshness:begin juice-worked-examples/household -->

**By household** (generated from the code, tax by household as modelled in §3). _Data as of: rent 2026-06 to 2026-09 (2- and 3-bedroom ratios 2025-10 to 2026-10) · living costs 2026-09 to 2026-10 · FX 2026-09-30 · tax years 2025 to 2026. Generated by `scripts/refresh/examples.js` from `server/juice.js` and `data/cities.json`; the monthly refresh regenerates it, so do not edit it by hand._

| Job | Salary | Household | Gross | Tax | Rent | Living | Juice (net) | Score | Grade | Confidence |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Research engineer, San Francisco (the user's example) | 675,000 USD | Just me (1 bed) | $675,000 | $297,923 | $44,145 | $18,184 | $314,748 | 98 | Juicy | medium |
|  |  | Couple (2 bed) | $675,000 | $250,936 | $53,443 | $31,351 | $339,270 | 99 | Juicy (est.) | low |
|  |  | Family (3 bed) | $675,000 | $250,936 | $68,271 | $43,891 | $311,902 | 98 | Juicy (est.) | low |
| Software engineer, San Francisco | 300,000 USD | Just me (1 bed) | $300,000 | $108,447 | $44,145 | $18,184 | $129,224 | 80 | Juicy | medium |
|  |  | Couple (2 bed) | $300,000 | $89,017 | $53,443 | $31,351 | $126,189 | 79 | Juicy (est.) | low |
|  |  | Family (3 bed) | $300,000 | $84,617 | $68,271 | $43,891 | $103,221 | 72 | Juicy (est.) | low |
| Software engineer, New York | 250,000 USD | Just me (1 bed) | $250,000 | $88,994 | $52,446 | $19,982 | $88,578 | 67 | Ripe | medium |
|  |  | Couple (2 bed) | $250,000 | $74,975 | $57,483 | $34,452 | $83,090 | 65 | Ripe (est.) | low |
|  |  | Family (3 bed) | $250,000 | $70,384 | $71,982 | $48,232 | $59,402 | 52 | Ripe (est.) | low |
| Software engineer, Austin | 150,000 USD | Just me (1 bed) | $150,000 | $36,209 | $23,088 | $14,127 | $76,576 | 62 | Ripe | medium |
|  |  | Couple (2 bed) | $150,000 | $26,815 | $27,375 | $24,357 | $71,453 | 59 | Ripe (est.) | low |
|  |  | Family (3 bed) | $150,000 | $22,415 | $34,691 | $34,100 | $58,794 | 52 | Ripe (est.) | low |
| Research engineer, London | 120,000 GBP | Just me (1 bed) | $161,001 | $58,822 | $34,615 | $17,244 | $50,320 | 47 | Ripe | low |
|  |  | Couple (2 bed) | $161,001 | $58,822 | $43,898 | $29,732 | $28,549 | 30 | Dry (est.) | low |
|  |  | Family (3 bed) | $161,001 | $58,822 | $51,982 | $41,625 | $8,572 | 10 | Dry (est.) | low |
| Engineer, Zurich | 150,000 CHF | Just me (1 bed) | $183,140 | $44,325 | $36,816 | $22,320 | $79,679 | 63 | Ripe | low |
|  |  | Couple (2 bed) | $183,140 | $36,291 | $45,167 | $38,483 | $63,199 | 55 | Ripe (est.) | low |
|  |  | Family (3 bed) | $183,140 | $29,969 | $54,000 | $53,876 | $45,295 | 43 | Dry (est.) | low |
| Engineer, Sydney | 200,000 AUD | Just me (1 bed) | $142,439 | $42,639 | $30,331 | $15,306 | $54,163 | 49 | Ripe | low |
|  |  | Couple (2 bed) | $142,439 | $42,639 | $42,589 | $26,390 | $30,821 | 32 | Dry | low |
|  |  | Family (3 bed) | $142,439 | $42,639 | $57,403 | $36,946 | $5,451 | 7 | Dry | low |
| Engineer, Berlin | 90,000 EUR | Just me (1 bed) | $103,619 | $42,385 | $18,184 | $14,287 | $28,763 | 30 | Dry | low |
|  |  | Couple (2 bed) | $103,619 | $34,013 | $23,300 | $24,633 | $21,673 | 24 | Dry (est.) | low |
|  |  | Family (3 bed) | $103,619 | $26,516 | $27,878 | $34,486 | $14,739 | 17 | Dry (est.) | low |

<!-- freshness:end juice-worked-examples/household -->

Couple and family rows are "low" confidence because their 2- and 3-bedroom rents are estimates
(the 1-bedroom figure × an official bedroom ratio), except Sydney, whose rents are official for
all three (its 1-bedroom figure is now the NSW official one, A$3,549 instead of A$3,645).
Where household rules are modeled the tax line can fall by more than the bigger home costs: a
one-earner couple on $675K in San Francisco keeps $339K against $315K for one person, because
joint brackets save $47K of tax. Where they are not (Madrid, single filer) or each person is
taxed separately (London, Sydney), the couple and family only add costs.

### The name

Kept the default, **Juice Score**: "juice" is what's left after the rind is peeled
off, and *juicy* already means lucrative. Considered and rejected: *Melon-aire Index*
(funny, but reads as "how rich", not "what's left"), *Rind Ratio* (names the costs
instead of the money left), *Take-Home Melon* (clear, but long and loses the 0-100
score idea). Always pair it with the subtitle **"livability $: what's left after
living costs"** so the money meaning is explicit.

## 2. Jobs: `attachJuice(job, cities)`

Sets `job.juice = { best: { city, cityName, locationName, ...computeJuice }, byLocation: [{ locationName, city, cityName, ...computeJuice }], salaryUSD, household }`,
or `null` when:

- `job.salary` is `null`: no published pay, **or a salary the vetting gate quarantined**
  (`salary: null` plus `salaryFlag`, see `server/vet.js`). Quarantined `salaryRaw` is never used;
- the salary currency has no FX rate;
- no non-remote location matches a city in the dataset (remote-only jobs get `null`).

Rules:

- **Salary:** `salary.mid` (annualized by `server/salary.js`; hourly × 2080). `salary.kind`
  is not used to filter; interns and hourly roles get a score like anyone else. A range spanned
  over several levels (`salary.levels`, NVIDIA and Microsoft) is scored on the span's midpoint. A
  place with its own posted range (`salary.ranges[].locations`: Apple requisitions, Amazon's pay
  table, Microsoft's SF Bay Area / NYC range) is scored on that range's midpoint (`attachJuice`
  `placeUSD`, DQ-28, DQ-33, SB-5), and only the places the pay was posted for are scored
  (`salary.places`, else the ranges' places; DQ-27). A stated minimum (`kind: 'minimum'`, VT-17) is
  scored on the minimum, and an hourly rate with `includesShiftDifferential` (VT-18) on the posted
  rate, which includes the highest shift differential; Austria's stated annual figure
  (`statedAnnual`, VT-19) is the salary. An internship whose posting gives no length (no
  `termWeeks`) is annualized and scored for a year like any salary.
- **Fixed-term pay:** with `salary.termWeeks` (an internship or programme length), the drawer shows
  Juice per month and for the whole term only ("Juice covers only that term"), and tax is worked
  out as if the pay lasted a year, so it may be lower (`public/app.js` `postedTerm`).
- **FX:** `FX_TO_USD` is copied verbatim from `public/viz/palette.js`, so juice is in the same
  "approx USD" unit the salary chart plots. A currency the palette lacks would use the city's
  `fxPerUSD`; today the palette has every city currency and every currency the postings use. RON
  (Romanian lei) has had a rate since fix wave 4 (MR-1: 4.58165 per USD, from the same Big Mac source
  data release as every other rate), so lei pay is read and converted. Tax is computed in the
  city's currency at the same rate, so a £100K salary in London is taxed on exactly £100K.
- **Currency scoping:** only matched locations that use the salary's currency are scored (a USD
  range posted for "San Francisco | London" is not applied to London), and when the pay line names
  its country (`salary.country`, Google "Ireland: €72000") only that country's. If none is (a USD
  salary for a London-only role), there is no Juice: `job.juice` is `null` and `job.juiceMissing =
  { code: 'pay-other-country', text }` says why. Juice is never worked out from another country's
  pay (fix wave 3, shared decision 1; the `currencyMismatch` fallback that scored them anyway is
  retired). Part-time hourly pay (`salary.partTime`) is scored on the weekly hours the posting
  states; with none stated, `job.juiceMissing` is `{ code: 'part-time-hours', text }`.
- **Household:** `opts.household` (`'single'` by default) goes to every `computeJuice` call and is
  recorded as `job.juice.household`. `public/api.js` attaches one-person juice; when the viewer picks
  Couple or Family, `public/app.js` re-attaches juice for every loaded job with the same `juice.js`
  (so cards, sort, the Juice filter, the map's Juice colouring and the drawer all follow) and
  remembers the choice in `localStorage` (`melon-seek.household.v1`).
- **Best:** the location with the highest score (ties: higher net).
- **Proxies:** some suburbs use their metro's record (`nearby` in cities.json, e.g. Brooklyn
  uses New York, Herndon uses Reston). Those entries carry `proxy: true`. A proxy is only ever in
  the same state or province as its record (the tax model is per state, and `findCity` requires the
  region), and only for a town in the record's metro area: its rent, living cost and taxes are the
  metro record's, which is an approximation the drawer marks as a proxy.
  - Fix wave 5 (DQ-34, 2026-10-11; [docs/process/fix5-data.md](process/fix5-data.md)): Burlingame →
    San Francisco; East Palo Alto → Palo Alto; Gilroy → San Jose; Northridge, Pasadena → Los Angeles;
    North Reading → Boston; Manassas, Ashburn, Aldie → Reston; Jessup → Baltimore; New Albany, Hilliard,
    Plain City → Columbus (the Columbus record's city income tax is applied; each suburb levies its own
    municipal rate, which is not modelled: a known approximation); Lithia Springs, Hampton → Atlanta; Garland → Dallas;
    Aurora, IL → Chicago (Aurora, CO still uses Denver: the region decides); Eagle Mountain → Salt Lake
    City; Goodyear → Phoenix.
  - No proxy where no record of the same state is in the town's metro area, and no new record without
    sourced figures. Still without Juice: Jersey City and Newark NJ (no New Jersey record; New York's
    would apply New York and NYC taxes), Frederick MD (outside the Baltimore area), the warehouse and
    data-centre towns (Canton MS, Sparks NV, New Carlisle IN, Boardman, Umatilla and Hermiston OR,
    Westboro WI, Jeffersonville OH, Hamlet NC, Rayville LA, Bowling Green OH, Lebanon IN, Temple TX,
    Beaver Dam WI, Papillion NE, Wink TX, New Florence MO, Los Lunas NM, Prineville OR, Cheyenne WY,
    Altoona IA) and cities with no record yet (El Paso, Montgomery, Oklahoma City, Cedar Rapids,
    Memphis, Charlotte, Kansas City, Tulsa, Tampa, Las Vegas, San Antonio, Sacramento, Baton Rouge,
    Shreveport, Bratislava). Each needs a sourced record (§4) before it shows Juice.
- **Payload:** full `inputs` (~1.5 KB) are kept on `best` only; `byLocation` entries keep
  `confidence` but drop `inputs` (`opts.inputs: 'all'` keeps them, `'none'` drops them
  everywhere). The drawer can recompute any location with `computeJuice` in the browser.

`findCity(location, cities)` returns the city record for a Job location object
(`{ city, region, country }`) or a raw string (geocoded with `server/geo.js`). It matches
the normalized city name (plus `aliases` and `nearby`) and the ISO country; for the US,
Canada and Australia it also requires the region when both sides have one (Arlington, VA
matches; Arlington, TX does not). `matchCity()` returns `{ city, via, location }`.

`cities` may be the parsed `data/cities.json` document or its `cities` array.

## 3. Tax model

`taxFor(grossLocal, jurisdiction, opts)` returns the year's tax for **one earner on salary
only**, in the city's currency: `{ income, regional, social, total, household, basis, note? }`
(national income tax with surtaxes; state / province / canton / city income tax; employee
social contributions). The rules and their sources live in `server/juice.js` (`RULES`,
`TAX_SOURCES`, `TAX_HOUSEHOLD`); every rule was re-checked against official sources on
2026-10-10 (log, probe runs and arithmetic: `docs/process/juice-tax.md`; worked cases:
`test/fixtures/tax-golden.json`).

**Principles**

- **Counted as tax:** income taxes at every level (national, state/province/canton, city:
  NYC, Columbus, Philadelphia, Pittsburgh, Detroit, Portland area, Baltimore City), surtaxes
  (German Soli, Ontario surtax and health premium, Japanese reconstruction tax, Indian cess,
  French CEHR, California BHST), and mandatory **public** social insurance (US FICA, state
  disability and paid-leave premiums, UK NICs, Irish PRSI/USC, German and French social
  contributions, CPP/EI, Swiss AHV/ALV, Medicare levy, ...).
- **Not counted:** funded individual retirement accounts that stay the employee's savings
  (401(k), Swiss 2nd pillar, Singapore CPF, India EPF, Australian super, Hong Kong MPF,
  Israeli pension funds, KiwiSaver, Estonian 2nd pillar), equity, bonuses, employer costs.
- **Deductions:** the standard deduction or allowance of each system, plus what a salaried
  renter can always claim (work-expense flat rates, deductible social contributions).
  The one itemized deduction modeled is the US SALT deduction (below), because for a
  high-earning renter in a taxed state it beats the standard deduction since the 2025 cap
  increase.
- **Not modeled:** expat regimes (Dutch 30% ruling, Portuguese IFICI, Swiss withholding-tax
  specifics), church taxes, alternative minimum taxes, the 13th salary in Brazil, Singapore
  CPF for citizens/PRs (Employment Pass holders don't pay it), and the items each
  `TAX_SOURCES` entry lists under `notModeled`.

**United States.** FICA (6.2% to the $184,500 wage base, 1.45%, 0.9% over $200,000 single /
$250,000 joint) plus the state rule plus the local rule. The federal deduction is the larger
of the standard deduction ($16,100 / $32,200) and itemized state and local income taxes,
including the state disability and family-leave premiums Schedule A counts as such (CA SDI,
NY PFL/DBL, WA PFML, MA PFML, OR and MN Paid Leave, PA unemployment), capped at the 2026 SALT
limit ($40,400, cut by 30% of MAGI over $505,000, never below $10,000). Alabama and Oregon
subtract the federal tax, so the federal and state computations iterate to a fixed point
(two or three passes). New York applies the IT-2105-I recapture worksheets (the lower
brackets are taken back from $107,650 of NY AGI); NYC adds the school tax credit;
California phases out the exemption credit from $252,203 and adds the 1% Behavioral Health
Services Tax over $1M; Colorado caps the deduction at $1,000 above $300,000 of AGI from 2026.

**Other systems.** Germany: § 32a tariff zones as linearly rising marginal rates
(`[[upTo, r0, r1]]`, equal to the statutory formula within €1). Switzerland (Zurich): the
direct federal tax tariff plus the cantonal *einfache Staatssteuer* times the cantonal (95%)
and City of Zurich (119%) multipliers; Geneva and Finland remain calibrated approximations
(`estimated`). Spain: the state scale and the region's own scale, each with the personal
minimum taxed at zero. France: the 2025-income barème (latest enacted) with the quotient
familial; contributions on the 2026 PASS bands. Canada: federal and provincial schedules on
income after the enhanced CPP deduction; the federal basic personal amount falls from
$16,452 to $14,829 between $181,440 and $258,482.

**Household (`opts.household`).** `'single'` (default) is unchanged; `'couple'` and
`'family'` (2 adults, 2 children under 17) assume **one earner**. Household rules are
applied only where they are implemented and sourced; the result says how:

| `basis` | Meaning |
|---|---|
| `single` | Computed as a single filer. For a couple or family: the jurisdiction has joint or family taxation that is not modeled (`note` says what). |
| `joint` | Household rules applied: joint brackets or splitting, spouse and child allowances or credits. |
| `individual` | The jurisdiction taxes each person separately, so the earner pays what a single person does; `note` names the household credits that exist but are not modeled. |
| `partial` | Some levels applied household rules and others are single; `note` lists the single ones. |

What each level does for a one-earner couple or family (`TAX_HOUSEHOLD`; `neutral` = no
household effect, no income tax or a flat tax without allowances):

- **Joint, modeled:** US federal (MFJ brackets and standard deduction, $2,200 child tax credit
  per child, non-refundable part), every taxed US state in the dataset (joint brackets or
  doubled deductions, dependant exemptions where the state has them; the California
  dependent credit and Maryland exemptions are not modeled), NYC, Detroit, Portland
  area, Baltimore City; Ireland (married one-income band €53,000, married credit); Zurich
  (federal married tariff less CHF 263 per child, Verheiratetentarif, child deductions);
  Germany (splitting; Kinderfreibetrag or Kindergeld, whichever is worth more, counted net
  of Kindergeld); France (quotient familial, €1,807 cap per child half-part); Hong Kong
  (married person's and child allowances); Brazil (spouse and children as dependants).
- **Individual:** UK (marriage allowance only for basic-rate taxpayers), Netherlands,
  Sweden, Norway, Finland, Denmark (spouse allowance transfer not modeled), Italy,
  Austria, Czechia, Estonia, Israel, Japan (spouse deduction ends at ¥10M of earnings;
  no deduction for children under 16), Korea, Singapore, India, Australia, New Zealand,
  Canada and its provinces (spouse amount not modeled), Mexico.
- **Single (not modeled):** Spain (joint return and child minimums), Portugal (joint
  taxation), Belgium (marital quotient), Poland (joint filing), Taiwan (household
  exemptions), Geneva.

`computeJuice` passes its household to `taxFor`, so couple and family Juice uses these
rules. The full matrix:

| Level | Couple / family basis | Note |
|---|---|---|
| US | joint | Federal: married filing jointly, $2,200 child tax credit per child (refundable part not modeled). |
| US-CA | joint | California dependent exemption credit not modeled. |
| US-NY | joint |  |
| US-WA | neutral |  |
| US-TX | neutral |  |
| US-FL | neutral |  |
| US-TN | neutral |  |
| US-NV | neutral |  |
| US-MA | joint |  |
| US-GA | joint |  |
| US-DC | joint |  |
| US-AL | joint |  |
| US-OH | joint |  |
| US-VA | joint |  |
| US-IL | joint |  |
| US-CO | joint |  |
| US-PA | neutral |  |
| US-NC | joint |  |
| US-OR | joint |  |
| US-UT | joint |  |
| US-AZ | joint |  |
| US-MN | joint |  |
| US-MI | joint |  |
| US-MD | joint | Maryland personal exemptions not modeled. |
| US-LOCAL-NYC | joint |  |
| US-LOCAL-COLUMBUS | neutral |  |
| US-LOCAL-PHILADELPHIA | neutral |  |
| US-LOCAL-PITTSBURGH | neutral |  |
| US-LOCAL-DETROIT | joint |  |
| US-LOCAL-PORTLAND | joint |  |
| US-LOCAL-MD-COUNTY | joint |  |
| GB | individual | The UK taxes each person separately; the marriage allowance only helps basic-rate taxpayers. |
| GB-SCT | individual |  |
| IE | joint | Ireland: married one-income band and credits; Home Carer Credit not modeled. |
| CH | joint |  |
| CH-ZH | joint |  |
| CH-GE | single | Geneva: married and child rules not modeled. |
| DE | joint | Germany: splitting; Kinderfreibetrag or Kindergeld, whichever is worth more, counted net of Kindergeld. |
| FR | joint | France: quotient familial (2 parts, +½ per child, €1,807 cap per half-part). |
| NL | individual | The Netherlands taxes each person separately. |
| ES | single | Spain: joint return (€3,400 reduction) and child minimums not modeled. |
| ES-MD | single |  |
| ES-CT | single |  |
| PT | single | Portugal: joint taxation and dependant deductions not modeled. |
| IT | individual | Italy taxes each person separately; dependant deductions (tapering to zero near €80,000-95,000) not modeled. |
| AT | individual | Austria taxes each person separately; Familienbonus Plus and sole-earner credit not modeled. |
| BE | single | Belgium: marital quotient and child allowances not modeled. |
| SE | individual | Sweden taxes each person separately. |
| DK | individual | Denmark: transfer of a non-earning spouse's personal allowance not modeled. |
| NO | individual | Norway taxes each person separately. |
| FI | individual | Finland taxes each person separately. |
| PL | single | Poland: joint filing with a spouse and the child relief not modeled. |
| CZ | individual | Czechia: child tax credits not modeled. |
| EE | individual | Estonia: using a spouse's basic exemption not modeled. |
| IL | individual | Israel: credit points for children not modeled. |
| AE | neutral |  |
| SA | neutral |  |
| JP | individual | Japan taxes each person separately; the spouse deduction ends at ¥10M of earnings and children under 16 have no deduction. |
| KR | individual | Korea: dependant deductions and the child tax credit not modeled. |
| SG | individual | Singapore: spouse and qualifying-child reliefs not modeled. |
| HK | joint | Hong Kong: married person's and child allowances. |
| TW | single | Taiwan: household filing exemptions for a spouse and children not modeled. |
| IN | individual | India taxes each person separately (no dependant deductions in the new regime). |
| AU | individual | Australia taxes each person separately. |
| NZ | individual | New Zealand taxes each person separately. |
| CA | individual | Canada taxes each person separately; the spouse amount credit is not modeled. |
| CA-ON | individual |  |
| CA-BC | individual |  |
| CA-QC | individual |  |
| MX | individual | Mexico taxes each person separately. |
| BR | joint | Brazil: spouse and children as dependants. |
### Verification (2026-10-10)

**Method.** Each parameter was read from the official publication (statute, tax authority
schedule, withholding formula or form instructions), fetched through the
`juice-tax-probe` workflow because the build sandbox cannot reach tax-authority sites.
Official calculators are browser apps the probe cannot drive, so the cross-checks are the
authorities' own worked tables: the NYS IT-2105-I worksheets, the FTB AGI limitation
worksheet, the German § 32a formula (computed independently of the tariff-zone table), and
the gov.hk standard-rate zone table (from which the 2026/27 allowances were derived). A
value that could not be read from an official source was kept as it was and is listed in
that entry's `unverified`; `verified: true` means every value the rule uses was read.

**Golden vectors.** `docs/process/scripts/juice-tax-golden.mjs` re-computes every rule
independently (it does not import `server/juice.js`) and writes 390 vectors with their
arithmetic to `test/fixtures/tax-golden.json`: every country, US state and local, and
Canadian province at about $100K, $250K and $675K (local-currency equivalents at the palette
FX, rounded to 1,000), each social-insurance cap boundary (US wage base, Additional Medicare,
SALT phase-down, NY recapture, CA credit phase-out, NIC UEL and the UK allowance taper, Irish
band and USC, ALV, German BBGs, PASS bands, Spanish maximum base, Norwegian bracket start,
Israeli NII ceilings, Japanese pension and health ceilings, CPP/EI/CPP2 and the federal BPA,
INSS), and couple and family at the $250K point. `test/juice-tax-golden.test.js` checks
`taxFor` against all of them: 390 of 390 match (Germany within €1 of the statutory formula,
everything else within 1 cent).

**The user's example: San Francisco, $675,000, single (2026).**

| Line | Before | After | Arithmetic and source |
|---|---:|---:|---|
| Federal income tax | $199,750 | $199,750 | 675,000 - 16,100 = 658,900 on the 2026 single schedule: 1,240 + 4,560 + 12,166 + 23,058 + 17,424 + 35% × 384,375 + 37% × 18,300 = 199,750.25. The SALT cap is $10,000 at this income, below the standard deduction. (Rev. Proc. 2025-32; IRC §164(b)(7)) |
| California income tax | $64,085 | $63,896 | 669,294 on the 2025 schedule X: 110.79 + 303.70 + 607.52 + 965.40 + 1,214.56 + 9.3% × 298,755 + 10.3% × 74,292 + 11.3% × 223,523 = 63,896.36; exemption credit phased out (FTB 2025 schedules and 540 booklet). The old code used the 2024 brackets labelled 2025 and kept the $153 credit. |
| Social | $34,277 | $34,277 | 6.2% × 184,500 = 11,439 + 1.45% × 675,000 = 9,787.50 + 0.9% × 475,000 = 4,275 + CA SDI 1.3% × 675,000 = 8,775 (Pub. 15 2026, Topic 560, EDD). |
| **Total** | **$298,112** | **$297,923** | -$189 |

At $250,000 the same filer pays $2,073 less than before: itemizing CA tax + SDI ($22,255)
beats the $16,100 standard deduction, and the 2025 brackets are slightly wider.

**Per jurisdiction.** Single filer, total tax in local currency; "before" is the model before
this review (2026-10-02 rules). Status: verified (every value read from an official source),
partly (named values in `unverified`), unverified (secondary sources only), estimate
(calibrated schedule).

| Jurisdiction | Gross (local) at ≈ $100K / $250K / $675K | Tax computed = golden (total) | Before at ≈ $250K | Change at ≈ $250K | Status |
|---|---|---|---:|---:|---|
| US-CA (USD) | 100,000 / 250,000 / 675,000 | 27,175 / 87,103 / 297,923 | 89,177 | -2,073 | partly |
| US-NY (USD) | 100,000 / 250,000 / 675,000 | 26,123 / 83,115 / 271,384 | 80,780 | +2,334 | partly |
| US-WA (USD) | 100,000 / 250,000 / 675,000 | 22,207 / 69,757 / 230,656 | 68,268 | +1,489 | partly |
| US-TX (USD) | 100,000 / 250,000 / 675,000 | 20,820 / 66,818 / 225,252 | 66,818 | +0 | partly |
| US-FL (USD) | 100,000 / 250,000 / 675,000 | 20,820 / 66,818 / 225,252 | 66,818 | +0 | verified |
| US-TN (USD) | 100,000 / 250,000 / 675,000 | 20,820 / 66,818 / 225,252 | 66,818 | +0 | partly |
| US-NV (USD) | 100,000 / 250,000 / 675,000 | 20,820 / 66,818 / 225,252 | 66,818 | +0 | verified |
| US-MA (USD) | 100,000 / 250,000 / 675,000 | 25,960 / 79,847 / 259,530 | 79,098 | +749 | partly |
| US-GA (USD) | 100,000 / 250,000 / 675,000 | 25,062 / 78,545 / 258,186 | 79,170 | -626 | verified |
| US-DC (USD) | 100,000 / 250,000 / 675,000 | 26,445 / 84,465 / 283,627 | 85,193 | -728 | partly |
| US-AL (USD) | 100,000 / 250,000 / 675,000 | 24,922 / 76,513 / 248,774 | 76,513 | +0 | partly |
| US-OH (USD) | 100,000 / 250,000 / 675,000 | 23,133 / 73,256 / 243,430 | 72,977 | +280 | partly |
| US-VA (USD) | 100,000 / 250,000 / 675,000 | 25,756 / 80,379 / 263,250 | 80,393 | -14 | verified |
| US-IL (USD) | 100,000 / 250,000 / 675,000 | 25,625 / 79,048 / 258,664 | 79,052 | -4 | verified |
| US-CO (USD) | 100,000 / 250,000 / 675,000 | 24,512 / 77,110 / 254,908 | 77,110 | +0 | verified |
| US-PA (USD) | 100,000 / 250,000 / 675,000 | 23,960 / 74,668 / 246,447 | 74,493 | +175 | partly |
| US-NC (USD) | 100,000 / 250,000 / 675,000 | 24,301 / 76,284 / 251,676 | 76,284 | +0 | verified |
| US-OR (USD) | 100,000 / 250,000 / 675,000 | 28,668 / 88,332 / 291,814 | 89,541 | -1,208 | partly |
| US-UT (USD) | 100,000 / 250,000 / 675,000 | 25,320 / 78,068 / 255,627 | 78,068 | +0 | verified |
| US-AZ (USD) | 100,000 / 250,000 / 675,000 | 22,926 / 72,674 / 241,733 | 72,666 | +9 | verified |
| US-MN (USD) | 100,000 / 250,000 / 675,000 | 26,537 / 84,370 / 285,349 | 84,402 | -33 | partly |
| US-MI (USD) | 100,000 / 250,000 / 675,000 | 24,819 / 77,192 / 253,689 | 77,197 | -4 | verified |
| US-MD (USD) | 100,000 / 250,000 / 675,000 | 25,358 / 79,394 / 263,115 | 79,394 | +0 | partly |
| US-NY-NYC (USD) | 100,000 / 250,000 / 675,000 | 29,298 / 88,994 / 297,112 | 90,036 | -1,041 | partly |
| US-OH-COLUMBUS (USD) | 100,000 / 250,000 / 675,000 | 25,633 / 79,506 / 260,305 | 79,227 | +280 | partly |
| US-PA-PHILADELPHIA (USD) | 100,000 / 250,000 / 675,000 | 27,698 / 83,662 / 271,675 | 83,843 | -181 | partly |
| US-PA-PITTSBURGH (USD) | 100,000 / 250,000 / 675,000 | 27,012 / 82,220 / 266,749 | 81,993 | +227 | partly |
| US-MI-DETROIT (USD) | 100,000 / 250,000 / 675,000 | 27,205 / 83,095 / 269,874 | 83,182 | -87 | partly |
| US-OR-PORTLAND (USD) | 100,000 / 250,000 / 675,000 | 28,718 / 90,422 / 311,843 | 92,666 | -2,244 | partly |
| US-MD-MD-COUNTY (USD) | 100,000 / 250,000 / 675,000 | 28,451 / 85,889 / 284,608 | 87,287 | -1,398 | partly |
| GB (GBP) | 74,000 / 185,000 / 501,000 | 20,523 / 75,164 / 223,684 | 75,164 | +0 | verified |
| GB-SCT (GBP) | 74,000 / 185,000 / 501,000 | 22,553 / 82,145 / 240,145 | 82,177 | -32 | verified |
| IE (EUR) | 87,000 / 219,000 / 590,000 | 28,677 / 97,631 / 291,432 | 97,877 | -246 | verified |
| CH-ZH (CHF) | 81,000 / 202,000 / 545,000 | 14,529 / 55,627 / 204,815 | 55,198 | +429 | partly |
| CH-GE (CHF) | 81,000 / 202,000 / 545,000 | 15,547 / 60,632 / 218,453 | 60,632 | +0 | estimate |
| DE (EUR) | 87,000 / 219,000 / 590,000 | 35,353 / 95,784 / 269,481 | 95,785 | -0 | partly |
| FR (EUR) | 87,000 / 219,000 / 590,000 | 30,265 / 96,149 / 304,255 | 96,863 | -714 | partly |
| NL (EUR) | 87,000 / 219,000 / 590,000 | 30,008 / 98,337 / 281,982 | 98,337 | -0 | verified |
| ES-MD (EUR) | 87,000 / 219,000 / 590,000 | 29,170 / 85,930 / 251,141 | 88,857 | -2,927 | partly |
| ES-CT (EUR) | 87,000 / 219,000 / 590,000 | 30,564 / 92,415 / 276,176 | 90,768 | +1,647 | verified |
| PT (EUR) | 87,000 / 219,000 / 590,000 | 35,662 / 109,132 / 323,566 | 109,980 | -848 | partly |
| IT (EUR) | 87,000 / 219,000 / 590,000 | 36,069 / 97,851 / 266,768 | 97,851 | -0 | unverified |
| AT (EUR) | 87,000 / 219,000 / 590,000 | 32,180 / 88,602 / 250,782 | 88,880 | -278 | partly |
| BE (EUR) | 87,000 / 219,000 / 590,000 | 38,915 / 117,557 / 338,590 | 117,557 | +0 | unverified |
| SE (SEK) | 963,000 / 2,409,000 / 6,504,000 | 293,401 / 1,024,354 / 3,094,376 | 1,024,556 | -202 | partly |
| DK (DKK) | 654,000 / 1,634,000 / 4,412,000 | 231,357 / 747,983 / 2,331,643 | 747,983 | +0 | unverified |
| NO (NOK) | 969,000 / 2,421,000 / 6,538,000 | 293,962 / 976,883 / 2,928,341 | 982,695 | -5,812 | verified |
| FI (EUR) | 87,000 / 219,000 / 590,000 | 25,173 / 86,325 / 269,277 | 86,325 | +0 | estimate |
| PL (PLN) | 378,000 / 945,000 / 2,551,000 | 150,658 / 391,324 / 1,072,999 | 391,324 | +0 | unverified |
| CZ (CZK) | 2,116,000 / 5,291,000 / 14,285,000 | 560,271 / 1,450,040 / 3,923,390 | 1,450,040 | +0 | unverified |
| EE (EUR) | 87,000 / 219,000 / 590,000 | 18,378 / 49,065 / 135,315 | 49,065 | +0 | unverified |
| IL (ILS) | 300,000 / 750,000 / 2,025,000 | 84,976 / 305,395 / 942,895 | 303,793 | +1,603 | partly |
| AE (AED) | 367,000 / 918,000 / 2,479,000 | 0 / 0 / 0 | 0 | +0 | unverified |
| SA (SAR) | 376,000 / 939,000 / 2,535,000 | 0 / 0 / 0 | 0 | +0 | unverified |
| JP (JPY) | 16,214,000 / 40,534,000 / 109,441,000 | 5,321,665 / 17,633,145 / 56,187,835 | 17,633,145 | +0 | partly |
| KR (KRW) | 148,590,000 / 371,475,000 / 1,002,983,000 | 39,815,097 / 137,271,752 / 442,118,810 | 137,271,752 | +0 | unverified |
| SG (SGD) | 129,000 / 323,000 / 871,000 | 9,150 / 44,990 / 169,250 | 44,990 | +0 | verified |
| HK (HKD) | 784,000 / 1,960,000 / 5,291,000 | 87,570 / 287,490 / 793,680 | 289,700 | -2,210 | partly |
| TW (TWD) | 3,219,000 / 8,047,000 / 21,727,000 | 472,767 / 2,183,267 / 7,655,267 | 2,183,267 | +0 | unverified |
| IN (INR) | 9,626,000 / 24,066,000 / 64,978,000 | 2,797,423 / 8,810,490 / 24,766,170 | 8,810,490 | +0 | unverified |
| IN-PROF-TAX (INR) | 9,626,000 / 24,066,000 / 64,978,000 | 2,799,923 / 8,812,990 / 24,768,670 | 8,812,990 | +0 | unverified |
| AU (AUD) | 143,000 / 357,000 / 964,000 | 36,840 / 133,660 / 418,950 | 133,660 | +0 | partly |
| NZ (NZD) | 171,000 / 428,000 / 1,157,000 | 48,859 / 148,549 / 432,859 | 148,549 | -0 | partly |
| CA-ON (CAD) | 141,000 / 351,000 / 948,000 | 41,773 / 147,163 / 466,735 | 147,539 | -376 | partly |
| CA-BC (CAD) | 141,000 / 351,000 / 948,000 | 38,974 / 139,835 / 459,230 | 140,554 | -719 | partly |
| CA-QC (CAD) | 141,000 / 351,000 / 948,000 | 47,800 / 154,928 / 473,158 | 155,339 | -411 | partly |
| MX (MXN) | 1,739,000 / 4,347,000 / 11,736,000 | 501,932 / 1,388,652 / 3,973,155 | 1,388,652 | +0 | unverified |
| BR (BRL) | 508,000 / 1,270,000 / 3,429,000 | 137,392 / 346,942 / 940,667 | 346,625 | +317 | verified |
**What changed at about $250,000 (single), and why.** Federal itemizing of state and local
income taxes (every taxed state whose tax plus premiums passes $16,100: CA -$2,073, NYC
-$1,041, Portland -$2,244, Baltimore -$1,398, DC -$728, Philadelphia); NY recapture
(+$2,334 state-only, +$3,057 NYC at $675K); paid-leave and long-term-care premiums now
counted (WA +$1,489, MA +$749, OR, MN, PA UC); Georgia's 4.99% rate and $15,000 deduction
(-$626); Ohio's $332 base and exemptions (+$280); Colorado's 2026 deduction cap above
$300,000 (+$664 at $675K); Zurich from the statutory tariffs (+CHF 429); Spain split into
state and regional scales (Madrid -€2,927, Catalonia's 2025 scale +€1,647); France with the
AGIRC-ARRCO second tranche to 8 PASS (-€714 here, +€16,467 at €590,000); Norway's 2026
thresholds and 7.6% national insurance (-NOK 5,812); Israel's 2026 NII ceilings (+NIS
1,603); Hong Kong's 2026/27 allowances (-HK$2,210); Canada's BPA phase-out and enhanced CPP
deduction, BC's 2026 brackets; Portugal's and Austria's 2026 scales; Ireland's PRSI rise
from October only; Scotland's 2026/27 bands; Brazil's 2026 INSS ceiling.

### Tax sources

One row per `TAX_SOURCES` entry. Verified = every value the rule uses was read from the
linked official source (or its `checkedVia` pages) on 2026-10-10; otherwise the entry's
`unverified` list names what was not, and those rows should be refreshed first (§6).

<!-- freshness:begin juice-worked-examples/tax-sources -->

| Key | Rule | As of | Verified 2026-10-10 | Source |
|---|---|---|---|---|
| US | IRS Rev. Proc. 2025-32 (2026 brackets, standard deduction $16,100 / $32,200, child tax credit $2,200); IRC §164(b)(7) SALT cap $40,400 phased down over $505,000 MAGI (floor $10,000); Pub. 15 (2026) Social Security 6.2% to $184,500, Medicare 1.45% + 0.9% over $200,000 / $250,000 | 2026 | yes | [link](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) |
| US-CA | California FTB 2025 tax rate schedules X / Y (latest published; EDD 2026 withholding uses the same brackets), standard deduction $5,706 / $11,412, exemption credit $153 cut $6 per $2,500 over $252,203 / $504,411 AGI, Behavioral Health Services Tax 1% over $1M; SDI 1.3% of all wages (2026) | 2025 (brackets) / 2026 (SDI) | no | [link](https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf) |
| US-NY | New York State 2026 (IT-2105-I): rates, tax-benefit recapture worksheets, standard deduction $8,000 / $16,050, $1,000 per dependent; Paid Family Leave 0.432% to $411.91; disability benefits $0.60 a week | 2026 | no | [link](https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf) |
| US-WA | No income tax on wages; WA Cares 0.58% of all wages; Paid Family and Medical Leave 1.13% (employee 71.43%) | 2026 | no | [link](https://wacaresfund.wa.gov/employers/) |
| US-TX | No state income tax on wages (Texas Constitution art. 8 §24-a) | 2026 | no | [link](https://statutes.capitol.texas.gov/Docs/CN/htm/CN.8.htm) |
| US-FL | No state income tax on wages (Florida Constitution art. VII §5(a)) | 2026 | yes | [link](https://www.leg.state.fl.us/statutes/index.cfm?submenu=3) |
| US-TN | No state income tax on wages (Hall tax repealed from 2021; Tennessee Constitution art. II §28) | 2026 | no | [link](https://www.capitol.tn.gov/about/docs/TN-Constitution.pdf) |
| US-NV | No state income tax on wages (Nevada Constitution art. 10 §1(9)) | 2026 | yes | [link](https://www.leg.state.nv.us/const/nvconst.html) |
| US-MA | Massachusetts Form 1 (2025): 5% after the personal exemption $4,400 / $8,800, $1,000 per dependent and up to $2,000 of FICA; 4% surtax over $1,107,750 (2026 Form 1-ES); PFML employee 0.46% to the Social Security wage base | 2025 / 2026 (surtax) | no | [link](https://www.mass.gov/doc/2025-form-1-instructions/download) |
| US-GA | Georgia HB 463: 4.99% for 2026, standard deduction $15,000 / $30,000, $5,000 per dependent | 2026 | yes | [link](https://www.legis.ga.gov/api/legislation/document/20252026/249080) |
| US-DC | District of Columbia 4%-10.75% (tax years after 2021, all filing statuses); standard deduction $15,000 / $30,000 | 2025 | no | [link](https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates) |
| US-AL | Alabama Form 40 (2025): 2% / 4% / 5%, federal income tax deduction, standard deduction chart ($2,500 / $5,000 from $35,500 AGI), personal exemption $1,500 / $3,000, dependents $1,000 / $500 / $300 (Huntsville: no occupational tax) | 2025 | no | [link](https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40bk.pdf) |
| US-OH | Ohio ORC 5747.02(A)(3)(c): $332 + 2.75% over $26,050 (2026 on); ORC 5747.025 personal exemptions, none from $500,000 MAGI in 2026 | 2026 | no | [link](https://codes.ohio.gov/ohio-revised-code/section-5747.02) |
| US-VA | Virginia Form 760 (2025): 2%-5.75%, standard deduction $8,750 / $17,500 (2025 and 2026), $930 per exemption | 2026 | yes | [link](https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf) |
| US-IL | Illinois 4.95%, exemption $2,925 per person for 2026 (IL-700-T), none above $250,000 / $500,000 AGI | 2026 | yes | [link](https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/currentyear/il-700-t.pdf) |
| US-CO | Colorado 4.4% of federal taxable income (2025 rate); state income tax addback (an itemizer keeps the standard deduction); deduction capped at $1,000 / $2,000 above $300,000 AGI from 2026 | 2025 (rate) / 2026 (addback) | yes | [link](https://tax.colorado.gov/individual-income-tax-guide) |
| US-PA | Pennsylvania 3.07% of compensation; unemployment compensation employee withholding 0.07% | 2026 | no | [link](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) |
| US-NC | North Carolina 3.99% (2026), standard deduction $12,750 / $25,500, child deduction table (D-401) | 2026 | yes | [link](https://www.ncdor.gov/taxes-forms/individual-income-tax) |
| US-OR | Oregon 2026 withholding formulas: 4.75%-9.9%, standard deduction $2,910 / $5,820, federal tax subtraction (max $8,750, phased out from $125,000 / $250,000), exemption credit $263; statewide transit tax 0.1%; Paid Leave Oregon 1% (employee 60%) | 2026 | no | [link](https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf) |
| US-UT | Utah TC-40 (2025): 4.5% less the taxpayer tax credit (6% of the federal standard deduction + $2,111 per dependent, cut 1.3% over $18,213 / $36,426) | 2025 | yes | [link](https://tax.utah.gov/forms/current/tc-40inst.pdf) |
| US-AZ | Arizona Form 140 (2025): 2.5%, standard deduction $15,750 / $31,500, $100 dependent credit | 2025 | yes | [link](https://azdor.gov/sites/default/files/document/FORMS_INDIVIDUAL_2025_140i.pdf) |
| US-MN | Minnesota 2026: 5.35%-9.85%, standard deduction $15,300 / $30,600, dependent exemption $5,300; Paid Leave 0.88% (half from the employee) | 2026 | no | [link](https://www.revenue.state.mn.us/mndor-pp/21641) |
| US-MI | Michigan 4.25%, personal exemption $5,900 per person (2026 withholding data) | 2026 | yes | [link](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Tax-Interest-Calculator/2026WithholdingtaxinfoJson.json) |
| US-MD | Maryland 2025 (Budget Reconciliation and Financing Act 2025): 2%-6.5% with 6.25% / 6.5% top brackets, standard deduction $3,350 / $6,700 | 2025 | no | [link](https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php) |
| US-LOCAL-NYC | New York City resident tax 3.078%-3.876% on NYS taxable income, NYC school tax credit (IT-2105-I 2026) | 2026 | yes | [link](https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf) |
| US-LOCAL-COLUMBUS | Columbus, OH city income tax 2.5% (IR-25 instructions) | 2024 | yes | [link](https://www.columbus.gov/files/sharedassets/city/v/4/city-auditor/tax-forms/individuals/2024-ir-25-instructions.pdf) |
| US-LOCAL-PHILADELPHIA | Philadelphia resident wage tax 3.74% to 30 June 2026, 3.735% from 1 July 2026 (calendar-year average) | 2026 | yes | [link](https://www.phila.gov/services/payments-assistance-taxes/business-taxes/wage-tax-employers/) |
| US-LOCAL-PITTSBURGH | Pittsburgh earned income tax 3% (city 1% + school district 2%) and $52 Local Services Tax | 2026 | yes | [link](https://www.pittsburghpa.gov/finance/tax-descriptions) |
| US-LOCAL-DETROIT | Detroit resident city income tax 2.4%, $600 exemption per person | 2026 | no | [link](https://detroitmi.gov/departments/office-chief-financial-officer/ocfo-divisions/office-treasury/income-tax) |
| US-LOCAL-PORTLAND | Portland area 2026: Metro supportive housing 1% over $128,000 / $205,000, Multnomah preschool 1.5% over $125,000 / $200,000 + 1.5% over $250,000 / $400,000 (Oregon taxable income), arts tax $50 | 2026 | yes | [link](https://www.portland.gov/revenue/personal-tax) |
| US-LOCAL-MD-COUNTY | Maryland local income tax, Baltimore City 3.2% of Maryland taxable income | 2025 | no | [link](https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php) |
| GB | HMRC 2026/27: personal allowance £12,570 (tapered over £100,000), 20% / 40% / 45% (£37,700 / £125,140); employee Class 1 NICs 8% from £12,570 to £50,270, 2% above | 2026/27 | yes | [link](https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past) |
| GB-SCT | Scottish income tax 2026/27: 19% / 20% / 21% / 42% / 45% / 48% (bands to £16,537 / £29,526 / £43,662 / £75,000 / £125,140) | 2026/27 | yes | [link](https://www.gov.uk/scottish-income-tax) |
| IE | Revenue 2026: 20% to €44,000 (married, one income: €53,000) then 40%, personal credit €2,000 (married €4,000) + employee credit €2,000; USC 0.5% / 2% / 3% / 8%; PRSI Class A 4.2% to 30 Sep 2026, 4.35% from 1 Oct | 2026 | yes | [link](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/tax-relief-charts/index.aspx) |
| CH | Direct federal tax 2026 (ESTV tariffs, single and married, CHF 263 per child), deductions: work expenses 3% (CHF 2,000-4,000), insurance CHF 1,800 / 3,700 + 700 per child, child CHF 6,800, married CHF 2,800; employee AHV/IV/EO 5.3%, ALV 1.1% to CHF 148,200, non-occupational accident ~1% (2nd pillar excluded and not deducted) *(approximation)* | 2026 | no | [link](https://www.estv.admin.ch/dam/de/sd-web/vFK3ntWLQ4s4/2-215-D-2025-d.pdf) |
| CH-ZH | Canton of Zurich 2026 (Kantonsblatt ZH): Grundtarif / Verheiratetentarif 0%-13%, insurance deduction CHF 2,900 / 5,800 + 1,300 per child, child deduction CHF 9,400; cantonal Steuerfuss 95% (Kantonsrat, 15 Dec 2025) + City of Zurich 119% | 2026 | no | [link](https://www.estv2.admin.ch/stp/kb/zh-de.pdf) |
| CH-GE | Geneva (canton GE): approximation, one combined federal + cantonal + communal marginal schedule calibrated to the cantonal calculator (not re-derived) *(approximation)* | 2025 | no | [link](https://www.estv2.admin.ch/stp/kb/ge-fr.pdf) |
| DE | § 32a EStG 2026 tariff (Grundfreibetrag €12,348) with splitting for married couples; Soli 5.5% with Freigrenze €20,350 / €40,700; children: Kinderfreibetrag €6,828 + €2,928 or Kindergeld €259/month; social: pension 9.3% + unemployment 1.3% to €101,400, health 7.3% + 1.45% (half the 2.9% average Zusatzbeitrag) + care 1.8% (+0.6% childless) to €69,750 | 2026 | no | [link](https://dejure.org/gesetze/EStG/32a.html) |
| FR | Barème on 2025 income (latest enacted): 0/11/30/41/45%, quotient familial with the €1,807 cap per half-part, 10% deduction (cap €14,555), CEHR 3% / 4%; employee contributions 2026: old age 6.90% to the PASS (€48,060) + 0.40%, AGIRC-ARRCO 3.15% / 8.64%, CEG 0.86% / 1.08%, CET 0.14%, APEC 0.024%, CSG 9.2% + CRDS 0.5% on 98.25% to 4 PASS | 2025 income (barème) / 2026 (contributions) | no | [link](https://www.service-public.fr/particuliers/vosdroits/F1419) |
| NL | Box 1 2026: 35.75% to €38,883, 37.56% to €78,426, 49.50% above (incl. national insurance); general credit €3,115 (cut 6.398% over €29,736); labour credit table 2026. 30% ruling not modeled | 2026 | yes | [link](https://www.belastingdienst.nl/wps/wcm/connect/nl/voorlopige-aanslag/content/voorlopige-aanslag-tarieven-en-heffingskortingen) |
| ES | IRPF state scale (art. 63 LIRPF) 9.5%-24.5%, personal minimum €5,550, €2,000 work deduction; employee social security 2026 6.50% (4.70 + 1.55 + 0.10 + MEI 0.15) to €61,214.40. Regional part: the region's scale (state scale where none is set) | 2026 | yes | [link](https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764) |
| ES-MD | Comunidad de Madrid regional scale: five tranches 8.5% to 20.5% (to €13,362.22 / €19,004.63 / €35,425.68 / €57,320.40) | 2026 | no | [link](https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-i-tributacion-autonomica-2026.pdf) |
| ES-CT | Catalonia regional scale 9.5%-25.5% (to €12,500 / 22,000 / 33,000 / 53,000 / 90,000 / 120,000 / 175,000) | 2025 | yes | [link](https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-ii-tributacion-autonomica-2025.pdf) |
| PT | IRS 2026 scale 12.5%-48% (Lei 73-A/2025, CIRS art. 68), solidarity surcharge 2.5% / 5% over €80,000 / €250,000; specific deduction €4,462.15 or contributions; social security 11%. IFICI regime not modeled | 2026 | no | [link](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs68.aspx) |
| IT | IRPEF 2026 23/33/43%; Lombardy regional surcharge up to 1.73% + Milan municipal 0.8%; INPS 9.19% to €120,607 *(approximation)* | 2026 | no | [link](https://www.agenziaentrate.gov.it/) |
| AT | Einkommensteuertarif 2026 0%-55% (€13,539 / 21,992 / 36,458 / 70,365 / 104,859 / 1M) on 12 regular salaries, 13th/14th at 6%; social insurance 18.07% to €90,300 *(approximation)* | 2026 | no | [link](https://www.usp.gv.at/steuern-finanzen/einkommensteuer-ueberblick/weitere-informationen-est/tarifstufen.html) |
| BE | Federal rates 25/40/45/50%, basic allowance €10,910, flat professional expenses (30%, cap €5,930), communal surcharge ~7%; social 13.07% *(approximation)* | 2025 | no | [link](https://finance.belgium.be/en/private-individuals/tax-return/rates) |
| SE | State tax 20% above SEK 643,000 taxable (brytpunkt 660,400), basic allowance SEK 17,400 at high income; Stockholm municipal tax 30.55%; job tax credit approximated *(approximation)* | 2026 | no | [link](https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html) |
| DK | AM contribution 8%, bottom tax 12.01%, Copenhagen municipal 23.39%, 2026 middle/top/top-top tax 7.5%/7.5%/5%, personal allowance DKK 54,100, employment deduction 12.75% *(approximation)* | 2026 | no | [link](https://skat.dk/) |
| NO | Skatteetaten 2026: tax on general income 22%, bracket tax 1.7% / 4.0% / 13.7% / 16.8% / 17.8% from NOK 226,100 / 318,300 / 725,050 / 980,100 / 1,467,200, minimum standard deduction 46% (max NOK 92,000), personal allowance NOK 108,550; national insurance 7.6% | 2026 | yes | [link](https://www.skatteetaten.no/en/rates/bracket-tax/) |
| FI | Approximation: state progressive tax + Helsinki municipal 5.3% as one schedule; employee contributions ~9% (pension, unemployment, health) *(approximation)* | 2025 | no | [link](https://vero.fi/en/individuals/tax-cards-and-tax-returns/tax_card/tax-rate-and-income-ceiling/tax-bases/) |
| PL | PIT 12%/32% (PLN 120,000), PLN 3,600 tax-reducing amount, PLN 3,000 costs; ZUS 11.26% to 30x cap + sickness 2.45%; health 9% | 2026 | no | [link](https://www.podatki.gov.pl/) |
| CZ | PIT 15%/23% (36x average wage), CZK 30,840 credit; social 7.1% (capped), health 4.5% *(approximation)* | 2026 | no | [link](https://www.financnisprava.cz/cs/dane/dane/dan-z-prijmu/fyzicke-osoby) |
| EE | Income tax 22%, basic exemption €8,400; unemployment insurance 1.6% (2nd pillar excluded) | 2026 | no | [link](https://www.emta.ee/en/private-client/taxes-and-payment/income-tax) |
| IL | Income tax 10%-47% + 3% surtax (2025 thresholds, frozen), 2.25 credit points; Bituach Leumi + health 2026: 4.27% to NIS 7,703/month, 12.17% to NIS 51,910/month (pension fund excluded) | 2026 | no | [link](https://www.btl.gov.il/English%20Homepage/Insurance/Ratesandamount/Pages/forSalaried.aspx) |
| AE | No personal income tax; no social security for expatriates | 2026 | no | [link](https://tax.gov.ae/) |
| SA | No personal income tax on employment income; GOSI annuities apply to Saudi nationals only | 2026 | no | [link](https://zatca.gov.sa/) |
| JP | NTA 2026: income tax 5%-45% x 1.021, employment income deduction (min ¥740,000, max ¥1.95M), basic deduction ¥620,000 (tapering above ¥23.5M); resident tax 10% + ¥5,000 (Tokyo, basic deduction ¥430,000); health ~4.96%, pension 9.15% (capped), employment insurance 0.55% *(approximation)* | 2026 | no | [link](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm) |
| KR | Income tax 6%-45% + 10% local income tax, employment income deduction, ₩500,000 wage-earner credit (approx); NPS 4.75% (capped), NHI 3.595% + LTC, EI 0.9% *(approximation)* | 2026 | no | [link](https://www.nts.go.kr/english/) |
| SG | IRAS resident rates YA2024 onward 0%-24%, earned income relief S$1,000 (below 55); CPF not applied (Employment Pass holders do not contribute) | YA2026 | yes | [link](https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates) |
| HK | Salaries tax 2026/27: progressive 2%-17% after allowances (basic HK$145,000, married HK$290,000, HK$140,000 per child; derived from the gov.hk standard-rate zone table), capped at the standard rate 15% (16% over HK$5M); MPF 5% to HK$18,000 deducted (funded, not counted as tax) | 2026/27 | no | [link](https://www.gov.hk/en/residents/taxes/taxfiling/taxrates/salariesrates.htm) |
| TW | Income tax 5%-40%, exemption + standard + salary deductions NT$446,000; labour and health insurance (capped) *(approximation)* | 2025 | no | [link](https://www.etax.nat.gov.tw/) |
| IN | New regime FY2026-27: 0/5/10/15/20/25/30% slabs, ₹75,000 standard deduction, section 87A rebate to ₹12 lakh, surcharge to 25%, 4% cess; professional tax ₹2,500 (KA/MH/TS). EPF (funded) excluded | FY2026-27 | no | [link](https://incometaxindia.gov.in/) |
| AU | Resident rates 2026-27: 0/15/30/37/45% ($18,200 / $45,000 / $135,000 / $190,000), LITO, Medicare levy 2%. Super is employer-paid on top, excluded | 2026-27 | no | [link](https://treasury.gov.au/tax-cuts) |
| NZ | IRD rates from 1 Apr 2025: 10.5/17.5/30/33/39% ($15,600 / $53,500 / $78,100 / $180,000); ACC earners levy 1.67% (capped) | 2026/27 | no | [link](https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals) |
| CA | CRA T4127 (January 2026): federal 14/20.5/26/29/33% ($58,523 / $117,045 / $181,440 / $258,482), basic personal amount $16,452 falling to $14,829, Canada employment amount $1,501; CPP 5.95% to $74,600 (enhanced part deducted) + CPP2 4% to $85,000; EI 1.63% to $68,900 | 2026 | no | [link](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html) |
| CA-ON | Ontario 2026 (T4127 Table 8.1): 5.05/9.15/11.16/12.16/13.16% ($53,891 / $107,785 / $150,000 / $220,000), basic personal amount $12,989, surtax 20% over $5,818 + 36% over $7,446, Ontario Health Premium | 2026 | yes | [link](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html) |
| CA-BC | British Columbia 2026: 5.60/7.70/10.50/12.29/14.70/16.80/20.50% ($50,363 / $100,728 / $115,648 / $140,430 / $190,405 / $265,545; lowest rate raised by Budget 2026), basic personal amount $13,216 | 2026 | yes | [link](https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates) |
| CA-QC | Quebec 2025 brackets 14/19/24/25.75%, federal abatement 16.5%; QPP 6.3%, QPIP 0.43%, EI 1.30% *(approximation)* | 2025 | no | [link](https://www.revenuquebec.ca/en/citizens/income-tax-return/) |
| MX | ISR annual table (Art. 152 LISR, 2025 values) 1.92%-35%; IMSS employee ~2.775% (capped at 25 UMA) *(approximation)* | 2025 | no | [link](https://www.sat.gob.mx/) |
| BR | Receita Federal 2026 monthly IRPF table 0%-27.5%, R$189.59 per dependent; INSS 2026 7.5%-14% to R$8,475.55; x12 (13th salary not modeled) *(approximation)* | 2026 | yes | [link](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026) |

<!-- freshness:end juice-worked-examples/tax-sources -->
### Known gaps (tax)

- **Not verified from an official source** (kept as they were): City of Zurich Steuerfuss
  119%, Swiss ALV and accident premiums; NY PFL/DBL; WA PFML wage cap; MA, OR and MN
  paid-leave employee shares; DC standard deduction; Alabama rate brackets; Ohio's 2026
  indexed exemptions; Maryland brackets below the 2025 top brackets and Baltimore's 3.20%;
  Detroit; Texas and Tennessee (constitution pages did not render); California's $153
  credit amount; German contribution rates; AGIRC-ARRCO employee shares and APEC; Madrid's
  tranche thresholds; Portugal's specific deduction and 11%; Japan's social insurance;
  Hong Kong's MPF cap; Australia's 15% rate, LITO and Medicare levy (the ATO blocks the
  probe); NZ ACC levy; CPP2 ceiling and the deduction of enhanced CPP contributions; and
  every value for Italy, Austria's social insurance,
  Belgium, Sweden's municipal rate and job credit, Denmark, Finland, Poland, Czechia,
  Estonia, Israel's income tax brackets, the UAE, Saudi Arabia, Korea, Taiwan, India,
  Quebec and Mexico.
- **Not modeled:** Minnesota's standard-deduction phase-out at high income, Maryland
  personal exemptions, the California dependent credit, Colorado FAMLI and the Denver
  occupational privilege tax, the Polish 4% solidarity levy over PLN 1M, Austrian
  special-payment rates above €25,000, Spanish solidarity contribution, the refundable US
  child tax credit, AMT, deductibility of Swiss 2nd-pillar contributions.
- **Tax years:** California still publishes only the 2025 schedules (2026 withholding uses the
  same brackets); France's barème is for 2025 income; Utah, Arizona and Colorado use their
  2025 rates.

## 4. Data: `data/cities.json`

89 cities: every gazetteer city the demo data uses, plus the main AI, tech and defense
hubs (Bay Area, Seattle, DC/NoVA, Boston, LA/Orange County, Texas, Colorado, Huntsville,
Columbus; London, Dublin, Zurich, Paris, Berlin, Munich, Amsterdam, Nordics, Tel Aviv,
Gulf; Tokyo, Seoul, Singapore, Bengaluru, Sydney; Toronto, Montreal, Vancouver; Mexico
City, São Paulo). Per city:

| Field | Meaning |
|---|---|
| `key` | `<city>-<country>` (US/CA/AU: `<city>-<region>-<country>`), city as in `server/geo.js`, e.g. `san-francisco-ca-us`, `london-gb` |
| `name, city, region, country, currency` | gazetteer city, region, ISO 3166 alpha-2 country, ISO 4217 currency |
| `aliases`, `nearby` | extra spellings; other gazetteer cities that use this record as a proxy |
| `tax` | `{ country, region, local }` jurisdiction for the tax model (e.g. `{US, NY, NYC}`, `{CH, ZH}`, `{GB, SCT}`) |
| `rent1brCenterLocal`, `rent1brOutsideLocal` | quoted monthly 1-bedroom rent, city centre / outside centre, local currency |
| `rent1brCenterUSD`, `rent1brOutsideUSD` | the same at the Big Mac data FX (refreshed monthly) |
| `rent2brCenterLocal`, `rent3brCenterLocal` | monthly 2- and 3-bedroom city-centre rent, local currency (§4.2) |
| `rent2brCenterUSD`, `rent3brCenterUSD` | the same at the Big Mac data FX (refreshed monthly) |
| `costIndex` | living costs excluding rent, New York = 100 |
| `bigMacUSD` | the country's Big Mac price in USD |
| `fxPerUSD` | local currency units per USD |
| `sources` | one entry per numeric field: `name`, `url`, `asOf`, `class` (+ `estimated`, `method`, `crossCheck`, `note`, `via`; bedroom rents add `ratio` and `ratioKey`; the audited 1-bedroom figures add `audit`, §4.2) |

Top level: `baseline` (NYC basket), `fx` (`perUSD` table), `bigMac` (`byCountry`
table), `bedroomRatios` (the official bedroom ratios behind the estimated 2- and 3-bedroom
rents, keyed by `ratioKey`), `sourceNotes` (shared notes referenced by `via` / `note`).

### Sources

| Field | Source | As of | License / terms | Refresh |
|---|---|---|---|---|
| `bigMacUSD` | [The Economist Big Mac index](https://github.com/TheEconomist/big-mac-data), `source-data/big-mac-source-data-v2.csv` (per-country prices incl. each euro member) | release 2026-07-01 | data CC BY 4.0, code MIT | automatic, monthly check (`bigmac-prices`; two releases a year) |
| `fxPerUSD`, `fx.perUSD`, `*USD` conversions | the table named by `fx.source.name` and dated `fx.asOf` in `data/cities.json`: from the first monthly refresh, [ECB euro reference rates](https://data.ecb.europa.eu/), monthly averages, crossed through USD; TWD [Federal Reserve G.5](https://www.federalreserve.gov/releases/g5/); AED/SAR/QAR official pegs. Before it, the Big Mac data's `dollar_ex` column (Refinitiv/LSEG), release 2026-07-01 | `fx.asOf` | ECB: reuse with source acknowledgement; Federal Reserve: public domain | automatic, monthly (`fx-per-usd`, `scripts/refresh/fx.js`; every copy together) |
| `rent1brCenterLocal`, `rent1brOutsideLocal` | [Numbeo](https://www.numbeo.com/cost-of-living/) city pages ("1 bedroom apartment in city centre / outside of centre") | page month, 2026-05 to 2026-10 (64 of 88 are 2026-09) | crowd-sourced, commercial; **terms restrict reuse, not cleared (§4.1)** | manual: the monthly refresh lists every city past page month + 92 + 30 days (`rents-1br-quoted`); replacement plan §7 |
| `costIndex` | derived: `100 × Numbeo "estimated monthly costs for a single person, excluding rent" ÷ New York's` | same pages | as above | manual: monthly staleness list (`cost-index`); replacement plan §7 |
| `baseline.nycBasketUSD` | Numbeo New York single-person estimate excluding rent, $1,665.2/month × 12 = **$19,982** | 2026-09 | as above | manual re-read; monthly drift check against the BLS CPI-U New York, all items less shelter (`nyc-basket`, alert at 3%) |
| cross-checks (not used in the formula) | [Zumper National Rent Report](https://www.zumper.com/rent-research/national-rent-report) Sep 2026 (SF $4,400, NYC $4,580, Seattle $1,960, Austin $1,520, DC $2,250 in Jul); Numbeo's published index (SF 90.32, London 85.9, Zurich 118.5-123.1); [BLS CE 2024](https://fred.stlouisfed.org/series/CXUTOTALEXPLB0502M) one-person households $48,794/yr all-in | 2024-2026 | public reports | n/a |
| `rent2brCenterLocal`, `rent3brCenterLocal` (US, 40 cities) | estimate: 1-bedroom × the HUD area's 2-bedroom ÷ 1-bedroom and 3-bedroom ÷ 1-bedroom [Fair Market Rent](https://www.huduser.gov/portal/datasets/fmr.html) ratios, FY2026 (read from HUD's [eGIS feature service](https://services.arcgis.com/VTyQ9soqVukalItT/ArcGIS/rest/services/Fair_Market_Rents/FeatureServer/0)) | 2025-10 | US government, public domain | automatic, checked monthly (`rents-us-hud-fmr`); a new fiscal year on the Federal Register is an alert until the HUD USER API (`HUD_API_TOKEN`) or eGIS has it |
| same (UK 5, Ireland, Switzerland 2, France, Canada 4, Melbourne, Singapore) | estimate: 1-bedroom × the ratio from [ONS Price Index of Private Rents](https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics) (Aug 2026, London / Cambridge / Oxford / Manchester / Scotland), [RTB via CSO RIQ02](https://data.cso.ie/table/RIQ02) (2025 Q4), [Stadt Zürich Mietpreiserhebung](https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161) (2026), [OLAP](https://www.data.gouv.fr/fr/datasets/resultats-nationaux-des-observatoires-locaux-des-loyers/) (2025), [Statistics Canada 46-10-0092-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610009201) asking rents (2026 Q2), NSW (Melbourne), [HDB median rents](https://data.gov.sg/datasets/d_23000a00c52996c55106084ed0339566/view) (Singapore's third bedroom) | 2025-01 to 2026-08 | OGL v3, CC BY 4.0, Stadt Zürich open data (CC0), Licence Ouverte 2.0, Statistics Canada Open Licence, Singapore Open Data Licence | automatic, checked monthly (`rents-gb-ons`, `rents-ie-rtb`, `rents-ch-zurich`, `rents-fr-olap`, `rents-ca-statcan`, `rents-sg-hdb`) |
| same (33 other cities) | estimate: 1-bedroom × the pooled ratio (median of the London, Dublin, Zurich, Paris, Sydney and Toronto ratios: 1.281 and 1.533) | 2026-10 | n/a | recomputed when a member ratio changes (`rents-bedroom-ratios`) |
| `rent1brCenterLocal`, `rent2brCenterLocal`, `rent3brCenterLocal` (Sydney) | **official**: [NSW Rent and Sales Report](https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html), June quarter 2026, median weekly rent for new bonds, Sydney LGA, flats and units ($819 / $1,150 / $1,550 a week) | 2026-06 | NSW Government open data | automatic, checked monthly (`rents-nsw-official`); alert if the new quarter's xlsx cannot be read |
| living-cost household scale | [DWP after-housing-costs modified OECD scale](https://www.gov.scot/publications/poverty-in-scotland-methodology/pages/income-equivalisation/) (`LIVING_SCALE`), checked against BLS CE 2024 and MIT Living Wage (§1) | 2026 | official methodology | n/a |
| tax rules | `TAX_SOURCES` in `server/juice.js` (table above) | per jurisdiction | official schedules | manual, yearly |

**Why Numbeo for rent and the cost index.** The brief prefers open/official data. No
official source covers "1-bedroom, city centre vs outside" or a non-rent price index
across 30+ countries on one definition, and mixing national sources (Zillow ZORI is
all-unit, HUD FMR is a metro 40th percentile, ONS is mean private rent) would make
cities incomparable, which matters more for a comparative score than any single
figure's provenance. The official hosts were also unreachable from the build sandbox
(HUD, BEA, BLS, ONS, Eurostat, World Bank and Zillow all failed with egress errors), so
each figure was read from search-result snippets of the Numbeo page and recorded with
its page month. Only these figures are used (89 cities × 3 values out of Numbeo's
~10,000 cities); nothing is scraped and the refresh job does not touch them. Official
cross-checks are stored where found. **Numbeo's terms do not allow this reuse without
permission (§4.1)**, so §7 lays out the replacement with official and open sources.

**Why costIndex is derived rather than Numbeo's published index.** The living-cost line
is `costIndex × NYC basket`. Taking the index as the ratio of Numbeo's own single-person
basket to New York's makes `living` equal Numbeo's single-person estimate for that city,
one consistent quantity. Where both exist it tracks the published index closely (SF 91.0
vs 90.32, London 86.3 vs 85.9, Columbus 73.2 vs ~71.8). Zurich is the outlier (111.7 vs
118.5-123.1): the published index weights restaurant and service prices more heavily than
the single-person basket does. Currency rule: Numbeo's USD figure if shown, else its EUR
figure ÷ New York's €1,466.0, else the local figure converted at the Big Mac FX.

**Big Mac data, license and countries.** The Economist publishes the data under CC BY 4.0
(code MIT; see the repo README "Licence"). The output index files only carry a single
"Euro area" row, so the refresh reads `source-data/big-mac-source-data-v2.csv`, which has
each euro member (Ireland, Germany, France, ...) separately. All 33 countries in the
dataset are in the 2026-07-01 release. Countries without a Big Mac price (e.g. Kenya,
Nigeria) were left out rather than estimated.

### 4.2 Rent by number of bedrooms

Every city has a 1-, 2- and 3-bedroom city-centre rent (`validateDoc` in `scripts/update-col.js`
refuses a document where they do not rise with the bedroom count or lack a dated, classed
source). Two methods, built by `docs/process/scripts/juice-household-rents.mjs` (figures and
sources embedded; HUD areas in `juice-household-hud.mjs`):

- **Direct (official, 1 city).** Where an official source publishes new-letting rents by bedroom
  count for the city centre on the same basis as a 1-bedroom figure, all three come from it and
  the old 1-bedroom quote is replaced (kept in `sources.rent1brCenterLocal.replaced`). Sydney:
  NSW new bonds, Sydney LGA, flats. A$3,549 / A$4,983 / A$6,717 a month (was A$3,645 from Numbeo
  for one bedroom, −2.6%).
- **Ratio (estimate, 88 cities).** Otherwise the city keeps its 1-bedroom figure and the 2- and
  3-bedroom rents are that figure × the official bedroom ratio for the same city, metro or
  country, so the three stay on one basis (`class: "estimate"`, `estimated: true`, `method`,
  `ratio`, `ratioKey` → `bedroomRatios`). Using official bedroom *levels* directly next to a
  Numbeo 1-bedroom figure would mix definitions (HUD's San Francisco 2-bedroom FMR, $3,604, is
  below the city-centre 1-bedroom quote). Derived figures keep the 1-bedroom figure's
  `terms: "numbeo-terms"` flag, so they leave with it if D6 removes the Numbeo data.
  - **US:** HUD FY2026 Fair Market Rent ratios for the city's HUD area (2 bedrooms 1.10-1.26×,
    3 bedrooms 1.31-1.65×; San Francisco 1.21 / 1.55). HUD sets Small Area FMRs with the metro
    ratios, so central ZIP codes give the same ratios.
  - **UK:** ONS mean rents by bedrooms, August 2026: London 1.27 / 1.50, Cambridge 1.28 / 1.52,
    Oxford 1.23 / 1.51, Manchester 1.23 / 1.43, Scotland (for Edinburgh, which Table 1 does not list) 1.30 / 1.67.
  - **Ireland:** RTB new tenancies, Dublin, all property types, 2025 Q4: 1.29 / 1.49.
  - **Switzerland:** Stadt Zürich, private flats let in the last 2 years, 2026 medians (2 / 3 / 4
    rooms = 1 / 2 / 3 bedrooms): 1.23 / 1.47; also used for Geneva.
  - **France:** OLAP, Paris, tenants of less than a year, 2025 medians: 1.48 / 2.16 (the
    "4 rooms or more" class averages 99 m², so the 3-bedroom ratio is on the high side).
  - **Canada:** Statistics Canada asking rents by bedrooms, 2026 Q2: Toronto 1.27 / 1.56,
    Vancouver 1.33 / 1.82, Montréal 1.23 / 1.53, Ottawa (Ontario part) 1.24 / 1.44.
  - **Australia:** Sydney is direct; Melbourne uses Sydney LGA's 1.40 / 1.89 (Victoria's Rental
    Report host timed out on every probe run).
  - **Singapore:** the pooled 2-bedroom ratio, then HDB's Central Area 4-room ÷ 3-room step
    (S$4,600 ÷ S$3,300 = 1.39): 1.28 / 1.79. HDB publishes no 2-room (1-bedroom) median there.
  - **Everyone else (33 cities: Germany, Netherlands, Spain, Portugal, Italy, Austria, Belgium,
    the Nordics, Poland, Czechia, Estonia, Israel, the Gulf, Japan, Korea, Hong Kong, Taiwan,
    India, New Zealand, Mexico, Brazil):** no official bedroom breakdown was found, so the pooled
    median of the six non-US official ratios is used, 1.281 / 1.533, and the source says so.

**Market cross-check (not used).** Listing data show a larger 2-bedroom premium in San
Francisco than HUD's ratio: Zumper's 2026 medians are about $4,060-4,400 for one bedroom and
$5,700-6,240 for two (1.4-1.45×; KTVU / NBC Bay Area coverage of the July 2026 report and
Zumper's city page, 18 Sep 2026). HUD's 1.21 is therefore conservative for San Francisco
couples and families; it is kept because it is the official figure and the policy is official
over aggregator.

**Audit of the 1-bedroom city-centre figures (2026-10-10).** Each figure was compared with at
least one official or open source per country (`sources.rent1brCenterLocal.audit`). Official
sources mostly measure something different (all tenancies, a 40th percentile, a whole metro), so
a gap is expected; the question is whether any figure is out of line with all of them.

| City | Our 1-bed (centre, monthly) | Official or open comparison | Difference | Verdict |
|---|---:|---|---:|---|
| San Francisco | $3,679 | HUD FY2026 Small Area FMR, median of 10 central ZIPs $3,025 (94102 $2,510 … 94105 $3,910); metro FMR $2,977 | +22% | Above HUD's 40th percentile, **below 2026 listings**: Zumper Sep 2026 1-bed $4,400 (−16%), Zillow ZORI Aug 2026 all units $4,682 (+25% a year). Kept (no official 2026 asking-rent source); see the note below |
| New York | $4,371 | HUD SAFMR, Manhattan central ZIPs $3,990 (3,270-3,990); FMR $2,655 | +10% | In line (Zumper $4,580, ZORI $4,154) |
| Seattle | $2,454 | HUD SAFMR, central ZIPs $2,920 (1,920-3,210); FMR $2,146 | −16% | Within the spread (ZORI $2,234, Zumper $1,960) |
| Boston | $3,401 | HUD SAFMR, central ZIPs $3,510 (3,090-3,710); FMR $2,476 | −3% | In line (ZORI $3,338) |
| Austin | $1,924 | HUD SAFMR, central ZIPs $2,165 (1,690-2,350); FMR $1,562 | −11% | In line (ZORI $1,586, Zumper $1,520) |
| Washington, DC | $2,688 | HUD SAFMR, central ZIPs $2,820 (2,330-3,020); FMR $2,015 | −5% | In line (ZORI $2,517) |
| London | £2,150 | ONS PIPR Aug 2026 mean 1-bed: London £1,760; Westminster £2,548, Kensington and Chelsea £2,640, Islington £2,178, Camden £2,054 | +22% vs London, −16% vs Westminster | In line with the central boroughs |
| Zurich | CHF 2,513 | Stadt Zürich 2026, private 2-room flats: Altstadt (Kreis 1) median CHF 2,194 (all tenancies); whole city, let in the last 2 years, CHF 1,834 | +15% / +37% | Plausible for the centre; high against the city-wide figure |
| Toronto | CA$2,283 | Statistics Canada asking rent, 1 bedroom, Toronto CMA, 2026 Q2: $2,090; CMHC average (sitting tenants) Oct 2025: $1,761 | +9% | In line |
| Sydney | A$3,645 → **A$3,549** | NSW new bonds, Sydney LGA flats, Jun Q 2026: $819 a week = A$3,549; postcode 2000 (CBD) $915 = A$3,965 | −2.6% | **Replaced by the official figure** (same measure) |
| Singapore | S$3,804 | HDB Central Area 2026 Q2: 3-room (2-bedroom) S$3,300; no 1-bedroom median | n/a | No official 1-bedroom figure; kept |
| Tokyo | ¥198,132 | 2023 Housing and Land Survey: average rent of all rented dwellings in Tokyo ¥87,118 (via MUFG Bank) | n/a | Not comparable (all sizes and wards); kept |
| Paris | €1,386 | OLAP 2025, Paris, 2-room flats, tenants of less than a year: median €1,180 | +17% | In line for the centre |
| Berlin | €1,316 | IBB Wohnungsmarktbericht 2025: median asking rent €15.78/m² (Mitte €20.00/m²) ≈ €1,200 for 60 m² in Mitte (size assumed); Mietspiegel 2024 average €7.21/m² (existing contracts) | +10% | In line |
| Dublin | €2,202 | RTB new tenancies 2025 Q4, county Dublin, 1 bed €1,741 (apartments €1,864) | +18% / +26% | High against the county figure; the RTB does not publish the city-centre districts |

**Is San Francisco's rent low?** Against official data, no: $3,679 is above HUD's FY2026
40th-percentile rents for central San Francisco ($3,025 median, $3,910 in 94105). Against
current listings, yes, by about 16%: San Francisco rents rose 20-25% in the year to
August-September 2026 (Zillow ZORI $3,739 → $4,682; Zumper 1-bedroom $4,400), and the Numbeo
figure (2026-09 page) has not caught up. No official source measures 2026 city-centre asking
rents, and replacing it with another aggregator would not fix the provenance problem (§4.1), so
the figure is unchanged; the audit is recorded for the D6 decision. For a $675K salary the
effect is small (16% more rent is $7K a year, score 98 either way).

### 4.1 Numbeo terms of use: reuse is not cleared

Checked 2026-10-02 because the strategy research (ROADMAP S67) says Numbeo forbids reuse.
The terms page ([numbeo.com/common/terms_of_use.jsp](https://www.numbeo.com/common/terms_of_use.jsp),
with [Data License](https://www.numbeo.com/premium/commercial-license) and
[API plans](https://www.numbeo.com/common/api.jsp)) was read through web-search summaries,
because numbeo.com is blocked in the build sandbox; re-read the page itself before
relying on the wording. What it says:

- **Allowed, with credit (a link to Numbeo.com):** personal use, including personal blogs,
  websites and social media; newspapers, journals, books, radio, TV and academic works.
- **Otherwise prohibited without prior written permission:** "use, copy, reproduce,
  distribute, display, modify, or create derivative works based on Numbeo's data".
- **Automated collection** (scraping, crawling) is prohibited without written permission.
- **Paid licences** (Data License, plans, API) are non-exclusive and time-limited, and do
  **not** allow republication "through other APIs or public-facing data feeds" without
  Numbeo's consent.

**Assessment:** melon-seek is a product, not a personal blog or a journalistic or academic
work. It republishes the figures in a public repository and (once wired) on GitHub Pages
and `/api/cities`, which is a public-facing data feed, and it derives an index from them.
That is outside the free uses and outside what even a paid licence allows without consent.
No scraping took place (figures were read from search-engine snippets), but the terms
restrict reuse regardless of how the figures were collected. **Treat the Numbeo figures as
not cleared.** They stay in the dataset only until the user decides (ROADMAP D6). Each one is
marked `class: "aggregator"` / `"estimate"` with `terms: "numbeo-terms"`, and
`dataStatus.numbeo` says "UNDER REVIEW". The figures are already in the public git history
(cities.json and the builder script), so a "remove" decision should also cover the builder's
embedded figures.

Also a correction to ROADMAP S68: the Big Mac **code** is MIT, but the **data** is CC BY 4.0
(repository README, "Licence"). It is free to reuse with attribution, which the dataset and
UI must keep.

### Estimates

Marked `estimated: true` with a `method` in `sources.costIndex`. `computeJuice` then
returns `estimated: true`.

- **Metro proxy (9 cities).** Numbeo shows no single-person estimate for these cities, so the
  metro's index is used: Costa Mesa ← Irvine; Reston ← Arlington, VA; Palo Alto, Sunnyvale,
  Mountain View, Menlo Park ← San Jose; Bellevue, Redmond ← Seattle; Cambridge, MA ← Boston.
  Their **rents are quoted for the city itself**, not proxied.
- **Comparison-derived (2 cities).** Boulder = Colorado Springs × 0.993 and Hyderabad =
  Mumbai × 0.839, from Numbeo's city-comparison statements ("0.7% / 16.1% cheaper
  excluding rent").
- **Tax schedules.** Geneva and Finland are flagged `estimated` (combined marginal schedules
  calibrated to the official calculators); Zurich now uses the statutory 2026 federal, cantonal
  and City of Zurich tariffs (§3) and is no longer an estimate. Others marked *approximation* in
  the table simplify credits or caps.
- **Low-confidence quotes.** Paris rents (two snippets disagreed; see the record's `note`),
  Mountain View (outside-centre above centre, few submissions), Sydney (first snippet mixed
  in Sydney, Nova Scotia; re-queried).

## 5. Limitations

- **An estimate, not financial advice.** One model, three household presets, rough FX,
  crowd-sourced prices.
- Rent is a city-centre flat sized by household (1, 2 or 3 bedrooms); shared flats, owners and
  larger families differ a lot. Outside Sydney, 2- and 3-bedroom rents are the 1-bedroom figure ×
  an official bedroom ratio, so they inherit that figure's age and source; for 33 cities the
  ratio is pooled from other countries.
- Households are presets (one adult; two adults; two adults and two children under 14). The
  living-cost scale covers everyday spending only: childcare, school fees and health insurance
  are not in the basket, which matters most for families in the US.
- The NYC basket is Numbeo's lean single-person basket (groceries, transport, utilities,
  eating out, leisure). It excludes health-insurance premiums, travel, savings and
  childcare, so "juice" includes the money for those.
- Tax ignores equity, bonuses, expat regimes, deductions people actually claim and
  year-end credits; effective rates are within a few points for typical salaries,
  worse for edge cases (very high or very low pay, mid-year moves). Geneva and Finland are
  calibrated approximations (`estimated`); Zurich uses the statutory 2026 tariffs.
- A couple or family is taxed as one earner. Household rules (joint brackets, allowances, child
  credits) are applied only where the tax model implements them (`TAX_HOUSEHOLD`, §3); elsewhere
  the household is taxed as a single filer or, where the country taxes each person separately,
  as one person, and the drawer says so.
- FX is one static table: `data/cities.json` `fx` and its copies `FX_PER_USD` in `server/juice.js`
  and `public/viz/palette.js` (`FX_AS_OF` and `FX_SOURCE` name the date and source;
  test/fx-consistency.test.js keeps the copies equal). The monthly refresh
  (`scripts/refresh/fx.js`) rewrites all of them together from the ECB monthly reference rates
  crossed through USD (TWD from the Federal Reserve G.5, AED/SAR/QAR at their official pegs), so
  amounts are converted at last month's average rate, not today's. Until the first monthly refresh
  is merged the table is the Big Mac data's `dollar_ex` column (release 2026-07-01).
- Cost-index proxies treat a suburb like its metro; quoted rents for small cities rest on
  few Numbeo submissions.
- Job locations outside the 89 cities get no juice (a job still shows if any location matches).

## 6. Refreshing

**Automatic (monthly), Big Mac and FX:** the monthly data refresh (`monthly-refresh.yml`,
`scripts/refresh/run.js`) owns both: `scripts/refresh/bigmac.js` updates `bigMac` and each
city's `bigMacUSD` when The Economist publishes a release, and `scripts/refresh/fx.js` writes the
FX table (`fx`, every city's `fxPerUSD`, the USD rents, and the code copies `FX_PER_USD` /
`FX_AS_OF` / `FX_SOURCE` in `server/juice.js`, `public/viz/palette.js`, `server/salary.js` and
`public/features/shared.js`) in one validated change. `.github/workflows/col-refresh.yml` is a
manual-only shim that runs just those two. `node scripts/update-col.js` still refreshes the Big
Mac prices by hand and leaves FX alone; only `--fx-from-bigmac` replaces the FX table with the
Big Mac `dollar_ex` column (the pre-2026-10 behaviour, which undoes the monthly FX refresh).

```sh
node scripts/refresh/run.js --only bigmac,fx --dry-run   # what the monthly run would change
node scripts/update-col.js --dry-run                     # Big Mac prices only, show changes
node scripts/refresh/rents.js --reconcile --dry-run      # derived rents vs their inputs
```

**Automatic (monthly), bedroom rents and living-cost checks:** the monthly data refresh
(`scripts/refresh/run.js`, docs/DATA_FRESHNESS.md) runs `scripts/refresh/rents.js` and
`scripts/refresh/living.js`. `rents.js` reads each official bedroom-ratio source in §4.2 (HUD
eGIS, ONS, CSO RIQ02, Stadt Zürich, OLAP, Statistics Canada, HDB, NSW) and, when a release
changed, rewrites the matching `bedroomRatios` entries, the 2- and 3-bedroom rents of the cities
that cite them (1-bedroom × ratio, USD at the city's FX), the pooled ratio when one of its members
moved, and Sydney's three official rents. A ratio that moves more than 15% or a rent more than 25%
between releases is held back (flag), and every write must pass `validateDoc`; changes are committed
only after the full test suite passes on them (monthly-refresh.yml; a review PR with `REFRESH_PUBLISH=pr`). `living.js` checks the NYC basket against the BLS CPI-U
for New York (alert at 3%) and the household scale against the HBAI weights and the latest BLS
Consumer Expenditure Survey year. The Numbeo figures (1-bedroom rents, cost index, NYC basket)
stay manual; the refresh lists the cities that are past due. Tests: `test/refresh-col.test.js`.

**Manual (quarterly is plenty):**

1. Bedroom rents, only when the refresh reports a drift it could not apply (for example a new
   HUD fiscal year without `HUD_API_TOKEN`): re-read the official source named in the alert,
   update the matching `bedroomRatios` entry in `data/cities.json` (`r2`, `r3`, `asOf`, `label`,
   `name`), then run `node scripts/refresh/rents.js --reconcile`: it re-derives the 2- and
   3-bedroom rents of every city that cites the entry (1-bedroom × ratio) and their USD fields,
   then validates. A read-only probe is `.github/workflows/juice-data-probe.yml`
   (`workflow_dispatch`; it prints the figures to the job log).
   `docs/process/scripts/juice-household-rents.mjs` / `juice-household-hud.mjs` are the
   historical one-time builders (2026-10-02); don't re-run them, they overwrite the refreshed
   ratios.
2. Rents and cost index: for each city the refresh lists as past due, open its Numbeo page (`sources.rent1brCenterLocal.url`),
   update `rent1brCenterLocal`, `rent1brOutsideLocal` and the single-person figure in
   `sources.costIndex.method`, recompute `costIndex = 100 × city ÷ New York`, and set each
   `asOf` to the page month. Then run `node scripts/refresh/rents.js --reconcile` (no network):
   it re-derives the city's 2- and 3-bedroom rents (1-bedroom × the encoded ratio) and every USD
   field at the city's current `fxPerUSD`, validates and writes; the monthly refresh does the
   same on every run. Then run `node --test test/juice.test.js test/freshness.test.js`, which
   fails if a numeric field lacks a source or date or if the FX copies disagree. The next
   refresh moves the `rents-1br-quoted` / `cost-index` due dates in `data/freshness.json` from
   the new page months.
3. Tax: each January (April for UK/AU/IN/NZ fiscal years), update the brackets in
   `server/juice.js`, `TAX_HOUSEHOLD` if the household basis or child credits changed, and the
   matching `TAX_SOURCES` entry (`asOf`, `reviewed`, `verified`); then
   `node scripts/refresh/registry.js --sync-tax --write`. The monthly refresh lists each
   jurisdiction whose new tax year is published (`tax-*`, docs/DATA_FRESHNESS.md), and marks
   rules two tax years old as stale.
4. Upgrading to official feeds (if a runner can reach them): HUD Fair Market Rents API
   (US 1-bedroom, needs a token) for `rent1brOutsideLocal`; ONS Price Index of Private Rents
   (UK); CMHC Rental Market Survey (Canada); RTB Rent Index (Ireland); BEA Regional Price
   Parities (US non-housing price levels) and Eurostat / World Bank ICP price levels as a
   cross-country cost index. Each would need its own `sources` entries and a
   comparability note.

The initial assembly is replayable with
`node docs/process/scripts/livability-build-cities.mjs --csv <big-mac-source-data-v2.csv>`
(it embeds every quoted figure with its page and month). After the first build, edit
`data/cities.json` directly instead; re-running the builder overwrites it.

## 7. Plan: replacing Numbeo with official and open sources

Prepared for the user's decision (ROADMAP D6, recommended "US first, non-US marked low
confidence"). Nothing has been deleted. Numbeo supplies 3 fields per city: centre rent,
outside rent and the cost index (via the single-person basket), plus the NYC baseline. That is
266 figures plus 1. Big Mac, FX and tax are already open or official.

| Replaces | Open / official source | License | Notes |
|---|---|---|---|
| US rent (40 cities) | [HUD Fair Market Rents](https://www.huduser.gov/portal/datasets/fmr.html) FY2026, 1-bedroom by FMR area (metro), and **Small Area FMRs** by ZIP for a downtown ZIP as "centre" | US government, public domain | API needs a free token (secret `HUD_API_TOKEN`). FMR = 40th-percentile gross rent incl. utilities, so lower than asking rents. Document as "typical", not "city centre" |
| US cost index | [BEA Regional Price Parities](https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area) by MSA (goods, utilities, other services; i.e. excluding housing), rescaled to New York MSA = 100 | public domain | MSA level: Palo Alto, Sunnyvale, etc. share the San Jose MSA value officially, which removes the 9 proxy estimates. API key `BEA_API_KEY` (free) |
| NYC baseline | [BLS Consumer Expenditure Survey](https://www.bls.gov/cex/) one-person units (total − shelter − insurance/pensions − cash contributions) × New York MSA non-housing RPP | public domain | Larger basket than Numbeo's (includes healthcare, vehicles); anchors would need re-tuning |
| Canada rent (4) | [CMHC Rental Market Survey](https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market) 1-bedroom average by CMA and downtown zone | Open Government Licence, Canada | Has a real centre/outside split |
| Canada cost index | [StatCan inter-city indexes of price differentials](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000301) × country price level | OGL Canada | official city factor |
| UK rent (5) | [ONS Price Index of Private Rents](https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/privaterentandhousepricesuk/latest), one-bed mean by local authority (incl. Edinburgh) | OGL v3 | mean of all tenancies, no centre split |
| Ireland (1) | [RTB Rent Index](https://www.rtb.ie/data-insights) / CSO PxStat RIQ02 by bedrooms, Dublin | CC BY 4.0 | new tenancies |
| Australia (2), NZ (1) | [NSW Rent and Sales Report](https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html), [Victoria Rental Report](https://www.dffh.vic.gov.au/publications/rental-report), [NZ Tenancy Services market rent](https://www.tenancy.govt.nz/rent-bond-and-bills/market-rent/) | CC BY 4.0 | bond data, by bedrooms and area |
| Norway, Israel, Switzerland (4) | [SSB rental market survey](https://www.ssb.no/en/priser-og-prisindekser/boligpriser-og-boligprisindekser/statistikk/leiemarkedsundersokelsen), [CBS Israel average rent by rooms](https://www.cbs.gov.il/en/), [BFS average rent by rooms and canton](https://www.bfs.admin.ch/bfs/en/home/statistics/construction-housing/dwellings/rented-dwellings.html) | open (NLOD / CBS / OGD) | by number of rooms |
| Rest of EU, JP, KR, SG, TW, HK, Dubai rent (17) | €/m² or local statistics: Destatis Census 2022, OLAP/OLL Paris, SERPAVI (ES), INE (PT), OMI (IT), Statistik Austria, SCB (SE), Statistics Finland, Japan Housing and Land Survey 2023, Korea REB, URA/HDB, MOI Taiwan, HK RVD, Dubai Pulse (DLD) | mostly open (CC BY / national open licences) | a size assumption (e.g. 45 m²) or dated survey turns them into **estimates (low)** |
| Non-US cost index | [World Bank ICP 2021](https://www.worldbank.org/en/programs/icp) price levels for household consumption excluding housing (extrapolated with CPI and Big Mac FX), [Eurostat price level indices](https://ec.europa.eu/eurostat/web/purchasing-power-parities) for EU/EFTA (annual, more recent); **Big Mac dollar price ÷ US price** as the fallback where neither applies | CC BY 4.0 | country level only (no city factor except Canada, Japan's regional difference index); class `open`, confidence medium at best |
| No open rent source (15) | Netherlands, Belgium, Denmark, Poland ×2, Czechia, Estonia, Abu Dhabi, Riyadh, India ×4, Mexico City, São Paulo | n/a | **rent `null`** (score only with the user's rent override) or drop the city; confidence low |

**Progress (2026-10-10, household work).** A manual, read-only workflow
(`.github/workflows/juice-data-probe.yml`) now reads these sources on a GitHub runner and prints
the figures to the job log, which removes the "sandbox cannot reach the hosts" blocker for most
rows:

| Source | Reachable from a runner | Used now | What it would take to replace the Numbeo rent |
|---|---|---|---|
| HUD FMR and Small Area FMR (FY2026), by bedrooms | **yes, without a token**, through HUD's eGIS feature services (`Fair_Market_Rents`, `HUD_PDR_Small_Area_Fair_Market_Rents` table 1, ID = ZIP). huduser.gov itself answers scripts with an HTTP 202 challenge, so FY2027 (effective 2026-10-01) is not available until the eGIS service is updated | bedroom ratios (40 cities); 1-bedroom audit | a fetcher in `update-col.js`; HUD's 40th percentile incl. utilities is 10-25% below centre asking rents, so label it "typical", not "city centre" |
| ONS Price Index of Private Rents, Table 1 (mean rent by bedrooms, every local authority, monthly) | yes | ratios (UK 4 + Scotland) | central-borough figure for London; all tenancies, not new lets |
| CSO PxStat RIQ02 (RTB new tenancies by bedrooms, quarterly) | yes (JSON-stat) | ratio (Dublin) | county figure only; Dublin postal districts are empty in RIQ02 |
| Stadt Zürich Mietpreiserhebung (open data CSV, by rooms, district, new tenancies) | yes | ratio (Zurich, Geneva) | Kreis 1 or new-tenancy figure |
| OLAP / ANIL observatoires des loyers (data.gouv.fr CSV) | yes | ratio (Paris) | new-tenant 2-room median |
| Statistics Canada 46-10-0092-01 (asking rents by bedrooms, quarterly) | yes | ratios (4 Canadian cities); audit | **direct replacement**: same measure as the Numbeo quote (asking rents), CMA level |
| NSW Rent and Sales Report (new bonds by bedrooms, LGA and postcode, quarterly) | yes | **Sydney rent, all three bedroom counts** | done for Sydney |
| Victoria Rental Report | no (host timed out on 4 runs; listed on data.vic.gov.au, CC BY 4.0) | none (Melbourne uses the NSW ratio) | retry, or the data.vic resource |
| HDB median rent by town and flat type (data.gov.sg) | yes | Singapore's 3-bedroom step | public housing only; URA private rents need an API key |
| BLS Consumer Expenditure Survey (public API v1, no key) | yes | household scale check (§1) | NYC baseline rebuild |
| Census ACS API | no key: "Missing Key" page | none | a free Census API key as a repository secret |

**Resulting coverage** (89 cities): 44 with official rent and cost index (US 40, Canada 4),
which can reach "high". 13 with official rent and a country-level open price index (UK 5,
IE, AU 2, NZ, NO, IL, CH 2), "low" by the non-US rule until a city-level index exists, but
much better sourced. 17 with official but size-assumed or dated rent (low). 15 without an
open rent source (rent override only, or drop).

**Effort** (developer-days, excluding review). The build sandbox cannot reach any of these
hosts, so fetchers would be written against the documented formats with fixture files and
first run in GitHub Actions:

| Scope | Work | Days |
|---|---|---:|
| US official | HUD FMR + SAFMR and BEA RPP fetchers in `update-col.js`, 40-city crosswalk (FMR area, CBSA, downtown ZIP), BLS CE baseline, tests, re-tuned anchors | 2.5-3 |
| Non-US minimum (D6 recommendation) | Drop Numbeo rents (set `null`, rent override only), country cost index from ICP/Eurostat with the Big Mac fallback, docs and UI labels | 1.5-2 |
| Non-US official rents | 9 sources for the 13 "B" cities (manual yearly quotes ~2 days; automated parsers ~5) | 2-5 |
| Non-US estimates | €/m²-based rents for the 17 "B−" cities, size assumptions documented | 3-4 |
| **Total** | D6 recommendation (US official + non-US minimum) | **≈ 4-5** |
| | Full global replacement | **≈ 10-14** |

User actions needed: decide D6; register free HUD and BEA API keys and add them as
repository secrets; decide whether the 15 cities without open rent data stay (override only)
or go.
