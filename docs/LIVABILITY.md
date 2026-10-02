# Juice Score: livability $

> **Juice Score**, *livability $: what's left after living costs.*
> The salary is the melon. Rent, taxes and living costs are the rind. The Juice is
> what's left once the rind is peeled off.
>
> **An estimate, not financial advice.** It compares postings with one consistent,
> simplified model. It is not a payslip calculator.

Code: [`server/juice.js`](../server/juice.js) (pure ES module, also loaded in the
browser). Data: [`data/cities.json`](../data/cities.json) (89 cities). Refresh:
[`scripts/update-col.js`](../scripts/update-col.js) and
[`.github/workflows/col-refresh.yml`](../.github/workflows/col-refresh.yml). Tests:
[`test/juice.test.js`](../test/juice.test.js).

## 1. The formula

For one salary in one city (all amounts annual, in approximate USD):

```
gross   = salary.mid converted to USD          (salary.mid is already annualized)
tax     = national income tax + state/provincial/city income tax
          + employee social contributions      (local currency, then back to USD)
rent    = 1-bedroom city-centre rent × 12      (option: outside-centre rent)
living  = costIndex / 100 × NYC basket         (NYC basket = $19,982 / year)
juice   = net = gross − tax − rent − living
score   = 100 × (1 − e^(−net / $80,000)), 0 when net ≤ 0  (saturating; never clamps)
```

`computeJuice(salaryUSD, city)` returns
`{ gross, tax, rent, living, net, score, grade, rentBurden, bigMacs, taxParts }`:

| Field | Meaning |
|---|---|
| `gross, tax, rent, living, net` | Whole dollars. The parts are rounded before `net` is taken, so `net = gross − tax − rent − living` exactly (the drawer waterfall adds up). |
| `taxParts` | `{ income, regional, social }`: national income tax (incl. surtaxes), state/province/canton/city income tax, employee social contributions. |
| `score` | 0..100 integer on the fixed saturating curve below (K = $80K). |
| `grade` | `Juicy` / `Ripe` / `Dry` / `Rind` (see below). |
| `rentBurden` | rent ÷ after-tax pay (0.30 = 30% of take-home goes to rent). |
| `bigMacs` | net ÷ the country's Big Mac price: how many Big Macs a year of juice buys. |
| `estimated` | `true` when an input is an estimate (cost-index proxy, approximate tax schedule). Show a "≈" or "est." marker. |
| `rentBasis` | `'outside'` with `{ rent: 'outside' }`; `'override'` with `{ rentOverrideUSD }`. |
| `confidence` | `"high"`, `"medium"` or `"low"`; see [Guardrails](#guardrails-inputs-confidence-rent-override). |
| `inputs` | every input with its source and as-of date: `rent` (monthly USD/local, basis, class, source), `tax` (jurisdiction keys, effective rate, sources), `costIndex` (value, NYC baseline, class, source, method), `fx` (rate and where it came from), `bigMac`. |

### Guardrails: inputs, confidence, rent override

Required by the strategy review (ROADMAP §7.1 F8, D6). Every `computeJuice` result
carries `inputs` and a `confidence`:

- **Source class** of each dataset value (`sources.*.class` in cities.json):
  `official` and `open` (and a user-entered rent, `user`) count as **high**, `aggregator`
  (Numbeo, Zumper) as **medium**, `estimate` (proxies, derived) as **low**.
- **Tax confidence:** a verified schedule is high; an unverified or approximate one is
  medium; an estimated schedule (Switzerland, Finland) is low.
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

| Score | Net juice needed (`netForScore`) | Grade | Reading |
|---:|---:|---|---|
| 70-100 | ≥ $96,318 | **Juicy** | plenty left after rent, tax and living costs |
| 45-69 | ≥ $47,827 | **Ripe** | comfortable margin |
| 1-44 | > $0 | **Dry** | thin margin |
| 0 | ≤ $0 | **Rind** | costs exceed take-home pay |

Other legend points: 25 = $23,015, 80 = $128,755, 90 = $184,207, 95 = $239,659,
99 = $368,414, 100 = $423,866. `SCORE_ANCHORS = { curve: 'exponential', K: 80000,
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

### Worked examples (generated from the code, data as of 2026-10-02)

| Job | Salary | Gross (USD) | Tax | Rent | Living | Juice (net) | Score | Grade | Confidence |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Software engineer, San Francisco | 300,000 USD | $300,000 | $112,482 | $44,145 | $18,184 | $125,189 | 79 | Juicy | medium |
| Software engineer, New York | 250,000 USD | $250,000 | $90,036 | $52,446 | $19,982 | $87,536 | 67 | Ripe | medium |
| Software engineer, Austin | 150,000 USD | $150,000 | $36,209 | $23,088 | $14,127 | $76,576 | 62 | Ripe | medium |
| Manufacturing engineer, Costa Mesa | 100,000 USD | $100,000 | $27,279 | $32,388 | $15,626 | $24,707 | 27 | Dry (est.) | low |
| Research engineer, London | 120,000 GBP | $161,753 | $59,097 | $34,777 | $17,244 | $50,635 | 47 | Ripe | low |
| Engineer, Zurich | 150,000 CHF | $185,793 | $45,438 | $37,350 | $22,320 | $80,685 | 64 | Ripe (est.) | low |
| Engineer, Berlin | 90,000 EUR | $102,929 | $42,102 | $18,063 | $14,287 | $28,477 | 30 | Dry | low |
| Engineer, Bengaluru | 4,000,000 INR | $41,553 | $8,210 | $3,753 | $4,216 | $25,374 | 27 | Dry | low |

### The name

Kept the default, **Juice Score**: "juice" is what's left after the rind is peeled
off, and *juicy* already means lucrative. Considered and rejected: *Melon-aire Index*
(funny, but reads as "how rich", not "what's left"), *Rind Ratio* (names the costs
instead of the money left), *Take-Home Melon* (clear, but long and loses the 0-100
score idea). Always pair it with the subtitle **"livability $: what's left after
living costs"** so the money meaning is explicit.

## 2. Jobs: `attachJuice(job, cities)`

Sets `job.juice = { best: { city, cityName, locationName, ...computeJuice }, byLocation: [{ locationName, city, cityName, ...computeJuice }], salaryUSD }`,
or `null` when:

- `job.salary` is `null`: no published pay, **or a salary the vetting gate quarantined**
  (`salary: null` plus `salaryFlag`, see `server/vet.js`). Quarantined `salaryRaw` is never used;
- the salary currency has no FX rate;
- no non-remote location matches a city in the dataset (remote-only jobs get `null`).

Rules:

- **Salary:** `salary.mid` (annualized by `server/salary.js`; hourly × 2080). `salary.kind`
  is not used to filter; interns and hourly roles get a score like anyone else.
- **FX:** `FX_TO_USD` is copied verbatim from `public/viz/palette.js`, so juice is in the same
  "approx USD" unit the salary chart plots. Currencies the palette lacks (INR, SEK, ILS, ...)
  use the city's `fxPerUSD` (Big Mac data, refreshed monthly). Tax is computed in the
  city's currency at the same rate, so a £100K salary in London is taxed on exactly £100K.
- **Currency scoping:** if some matched locations use the salary's currency, only those are
  scored (a USD range posted for "San Francisco | London" is not applied to London). If none
  do (a USD salary for a London-only role), all are scored and marked `currencyMismatch: true`.
- **Best:** the location with the highest score (ties: higher net).
- **Proxies:** some suburbs use their metro's record (`nearby` in cities.json, e.g. Brooklyn
  uses New York, Herndon uses Reston). Those entries carry `proxy: true`.
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

Single filer, no dependants, salary only, standard deductions and allowances,
employee-side contributions. Brackets live in `server/juice.js` with a source per
jurisdiction (`TAX_SOURCES`). Principles:

- **Counted as tax:** income taxes at every level (national, state/province/canton,
  city: NYC, Columbus, Philadelphia, Pittsburgh, Detroit, Portland area, Baltimore City),
  surtaxes (German Soli, Ontario surtax, Japanese reconstruction tax, Indian cess), and
  mandatory **public** social insurance (US FICA, CA SDI, UK NICs, Irish PRSI/USC, German
  social insurance, CPP/EI, Swiss AHV/ALV, Medicare levy, ...).
- **Not counted:** funded individual retirement accounts that stay the employee's savings
  (401(k), Swiss 2nd pillar, Singapore CPF, India EPF, Australian super, Hong Kong MPF,
  Israeli pension funds, KiwiSaver, Estonian 2nd pillar), equity, bonuses, employer costs.
- **Not modeled:** expat regimes (Dutch 30% ruling, Portuguese IFICI, Swiss
  quellensteuer specifics), church taxes, joint filing, itemized deductions, NY
  tax-benefit recapture, Utah's taxpayer credit, WA PFML, the 13th salary in Brazil,
  Singapore CPF for citizens/PRs (Employment Pass holders don't pay it).
- **German tariff zones** use linearly rising marginal rates (`[[upTo, r0, r1]]`), which
  reproduces the §32a formula.
- **Switzerland and Finland** are approximations: one combined marginal schedule
  (federal + cantonal + municipal for Zurich city / Geneva; state + Helsinki municipal),
  calibrated to the official calculators. They are flagged `estimated`, so Zurich and
  Geneva juice carries `estimated: true`.

"Verified" below means the figures were re-checked by web search on 2026-10-02 (the pages
the search surfaced are in each entry's `checkedVia`; the
build sandbox blocks direct fetches of tax-authority sites). Unverified rows use the
cited official schedule for the stated tax year; refresh them first (§6).

| Key | Rule | As of | Verified 2026-10-02 | Source |
|---|---|---|---|---|
| US | IRS Rev. Proc. 2025-32 (2026 brackets, $16,100 standard deduction); SSA 2026 wage base $184,500; Medicare 1.45% + 0.9% over $200K | 2026 | yes | [link](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) |
| US-CA | California FTB 2025 tax rate schedule X (single), $5,706 standard deduction, personal credit; EDD SDI 1.3% (2026, no wage cap) | 2025 (brackets) / 2026 (SDI) | yes | [link](https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf) |
| US-NY | New York State 2026 rates (lowest five brackets cut 0.1 pt), $8,000 standard deduction; tax-benefit recapture not modeled | 2026 | yes | [link](https://www.tax.ny.gov/pit/file/tax-tables/) |
| US-WA | No wage income tax; WA Cares long-term care premium 0.58% (PFML premium not modeled) | 2026 | no | [link](https://wacaresfund.wa.gov/) |
| US-TX | No state income tax on wages | 2026 | no | [link](https://comptroller.texas.gov/taxes/) |
| US-FL | No state income tax on wages | 2026 | no | [link](https://floridarevenue.com/taxes/) |
| US-TN | No state income tax on wages | 2026 | no | [link](https://www.tn.gov/revenue.html) |
| US-NV | No state income tax on wages | 2026 | no | [link](https://tax.nv.gov/) |
| US-MA | Massachusetts 5% flat + 4% surtax over $1,083,150, $4,400 exemption | 2025 | no | [link](https://www.mass.gov/info-details/massachusetts-tax-rates) |
| US-GA | Georgia 5.19% flat (HB 111), $12,000 standard exemption | 2025 | no | [link](https://dor.georgia.gov/) |
| US-DC | District of Columbia 4%-10.75% brackets, federal-conforming standard deduction ($15,000) | 2025 | no | [link](https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates) |
| US-AL | Alabama 2%/4%/5% with federal income tax deduction, $2,500 standard deduction, $1,500 exemption (Huntsville: no occupational tax) | 2025 | no | [link](https://www.revenue.alabama.gov/) |
| US-OH | Ohio flat 2.75% above $26,050 (HB 96, from 2026) | 2026 | no | [link](https://tax.ohio.gov/) |
| US-VA | Virginia 2%-5.75%, $8,500 standard deduction, $930 exemption | 2025 | no | [link](https://www.tax.virginia.gov/) |
| US-IL | Illinois 4.95% flat, $2,850 exemption | 2025 | no | [link](https://tax.illinois.gov/) |
| US-CO | Colorado 4.4% of federal taxable income | 2025 | no | [link](https://tax.colorado.gov/) |
| US-PA | Pennsylvania 3.07% flat on compensation | 2026 | no | [link](https://www.revenue.pa.gov/) |
| US-NC | North Carolina 3.99% flat (scheduled 2026 rate), $12,750 standard deduction | 2026 | no | [link](https://www.ncdor.gov/) |
| US-OR | Oregon 4.75%-9.9%, standard deduction ~$2,835 (federal tax subtraction not modeled) | 2025 | no | [link](https://www.oregon.gov/dor/) |
| US-UT | Utah 4.5% flat (taxpayer credit not modeled) | 2025 | no | [link](https://tax.utah.gov/) |
| US-AZ | Arizona 2.5% flat of federal-conforming taxable income | 2025 | no | [link](https://azdor.gov/) |
| US-MN | Minnesota 5.35%-9.85%, $14,950 standard deduction | 2025 | no | [link](https://www.revenue.state.mn.us/minnesota-income-tax-rates-and-brackets) |
| US-MI | Michigan 4.25% flat, $5,800 exemption | 2025 | no | [link](https://www.michigan.gov/taxes) |
| US-MD | Maryland 2%-6.5% (2025 law adds 6.25%/6.5% top brackets), $3,350 standard deduction | 2025 | no | [link](https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php) |
| US-LOCAL-NYC | New York City resident income tax 3.078%-3.876% | 2026 | yes | [link](https://www.tax.ny.gov/pit/file/tax-tables/) |
| US-LOCAL-COLUMBUS | Columbus, OH city income tax 2.5% | 2025 | no | [link](https://www.columbus.gov/Services/Income-Tax) |
| US-LOCAL-PHILADELPHIA | Philadelphia resident wage tax 3.74% | 2025 | no | [link](https://www.phila.gov/services/payments-assistance-taxes/taxes/income-taxes/) |
| US-LOCAL-PITTSBURGH | Pittsburgh earned income tax 3% (city 1% + school district 2%) | 2025 | no | [link](https://pittsburghpa.gov/finance/tax-descriptions) |
| US-LOCAL-DETROIT | Detroit resident city income tax 2.4% | 2025 | no | [link](https://detroitmi.gov/departments/office-chief-financial-officer/ocfo-divisions/office-treasury/income-tax) |
| US-LOCAL-PORTLAND | Portland area: Metro supportive housing 1% + Multnomah preschool 1.5% over $125K, +1.5% over $250K | 2025 | no | [link](https://www.portland.gov/revenue/personal-tax) |
| US-LOCAL-MD-COUNTY | Maryland local income tax, Baltimore City 3.2% | 2025 | no | [link](https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php) |
| GB | HMRC 2026/27: personal allowance £12,570 (tapered over £100K), 20/40/45%; employee NICs 8% to £50,270, 2% above | 2026/27 | yes | [link](https://www.gov.uk/government/publications/rates-and-allowances-income-tax) |
| GB-SCT | Scottish income tax bands 19/20/21/42/45/48% (2025/26 band widths) | 2025/26 | no | [link](https://www.gov.scot/publications/scottish-income-tax-2025-2026-factsheet/) |
| IE | Revenue 2026: 20% to €44,000 then 40%, €4,000 personal + employee credits; USC 0.5/2/3/8%; PRSI 4.35% from 1 Oct 2026 | 2026 | yes | [link](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/tax-relief-charts/index.aspx) |
| CH | Approximation: combined federal + cantonal + municipal marginal schedule for a single person in Zurich city (Geneva: separate schedule), calibrated to the cantonal tax calculators; AHV/IV/EO 5.3%, ALV 1.1%, NBU ~1% (2nd-pillar pension excluded) *(approximation)* | 2025 | no | [link](https://www.zh.ch/de/steuern-finanzen/steuern/steuern-natuerliche-personen/steuerrechner.html) |
| CH-ZH | Zurich city (canton ZH, municipal multiplier ~119%), see CH *(approximation)* | 2025 | no | [link](https://www.zh.ch/de/steuern-finanzen/steuern/steuern-natuerliche-personen/steuerrechner.html) |
| CH-GE | Geneva (canton GE), see CH *(approximation)* | 2025 | no | [link](https://www.ge.ch/calculer-mes-impots) |
| DE | §32a EStG 2026 tariff (Grundfreibetrag €12,348, 42% from €69,879, 45% from €277,826), Soli with Freigrenze; social: pension 9.3% + unemployment 1.3% to €101,400, health 7.3% + 1.45% (half of 2.9% avg Zusatzbeitrag) + care 2.4% (childless) to €69,750 | 2026 | yes | [link](https://www.bundesfinanzministerium.de/) |
| FR | Barème 2025 (1 part): 0/11/30/41/45%, 10% professional deduction (cap €14,426); employee contributions ~22% (cadre) to 4 PASS, CSG/CRDS above *(approximation)* | 2025 | no | [link](https://www.service-public.fr/particuliers/vosdroits/F1419) |
| NL | Box 1 2026: 35.75% to €38,883, 37.56% to €78,426, 49.50% above (incl. national insurance); general credit €3,115, labour credit €5,685 with phase-outs. 30% ruling not modeled | 2026 | yes | [link](https://www.belastingdienst.nl/) |
| ES | IRPF state + regional scales (general; Madrid and Catalonia approximated), €5,550 personal minimum, €2,000 work deduction; social security 6.47% to €61,214 *(approximation)* | 2025 | no | [link](https://sede.agenciatributaria.gob.es/) |
| PT | IRS 2025 scale 13%-48%, solidarity surcharge 2.5%/5%, specific deduction €4,462.15; social security 11%. IFICI regime not modeled | 2025 | no | [link](https://info.portaldasfinancas.gov.pt/) |
| IT | IRPEF 2026 23/33/43%; Lombardy regional surcharge up to 1.73% + Milan municipal 0.8%; INPS 9.19% to €120,607 *(approximation)* | 2026 | no | [link](https://www.agenziaentrate.gov.it/) |
| AT | Einkommensteuertarif 2025 0-55% on 12 regular salaries, 13th/14th at 6%; social insurance 18.07% to €90,300 *(approximation)* | 2025 | no | [link](https://www.bmf.gv.at/themen/steuern/arbeitnehmerinnen/einkommensteuer/einkommensteuertarif.html) |
| BE | Federal rates 25/40/45/50%, basic allowance €10,910, flat professional expenses (30%, cap €5,930), communal surcharge ~7%; social 13.07% *(approximation)* | 2025 | no | [link](https://finance.belgium.be/en/private-individuals/tax-return/rates) |
| SE | Stockholm municipal tax 30.55% + state tax 20% above SEK 643,000; job tax credit approximated (pension fee is credited, net zero) *(approximation)* | 2026 | no | [link](https://www.skatteverket.se/) |
| DK | AM contribution 8%, bottom tax 12.01%, Copenhagen municipal 23.39%, 2026 middle/top/top-top tax 7.5%/7.5%/5%, personal allowance DKK 54,100, employment deduction 12.75% *(approximation)* | 2026 | no | [link](https://skat.dk/) |
| NO | Tax on ordinary income 22%, bracket tax 1.7%-17.7% (2025 thresholds), minimum standard deduction 46% (cap NOK 92,000), personal allowance NOK 108,550; national insurance 7.7% | 2025 | no | [link](https://www.skatteetaten.no/en/rates/) |
| FI | Approximation: state progressive tax + Helsinki municipal 5.3% as one schedule; employee contributions ~9% (pension, unemployment, health) *(approximation)* | 2025 | no | [link](https://www.vero.fi/en/individuals/) |
| PL | PIT 12%/32% (PLN 120,000), PLN 3,600 tax-reducing amount, PLN 3,000 costs; ZUS 11.26% to 30x cap + sickness 2.45%; health 9% | 2026 | no | [link](https://www.podatki.gov.pl/) |
| CZ | PIT 15%/23% (36x average wage), CZK 30,840 credit; social 7.1% (capped), health 4.5% *(approximation)* | 2026 | no | [link](https://www.financnisprava.cz/) |
| EE | Income tax 22%, basic exemption €8,400; unemployment insurance 1.6% (2nd pillar excluded) | 2026 | no | [link](https://www.emta.ee/en/private-client/taxes-and-payment/income-tax) |
| IL | Income tax 10%-47% + 3% surtax (2025 thresholds, frozen), 2.25 credit points; Bituach Leumi + health 4.27% / 12.17% (pension fund excluded) | 2025 | no | [link](https://www.gov.il/en/departments/israel_tax_authority) |
| AE | No personal income tax; no social security for expatriates | 2026 | no | [link](https://tax.gov.ae/) |
| SA | No personal income tax on employment income; GOSI annuities apply to Saudi nationals only | 2026 | no | [link](https://zatca.gov.sa/) |
| JP | Income tax 5%-45% x 1.021 reconstruction surtax, employment income deduction (min ¥650,000), basic deduction ¥580,000 (2025 reform); resident tax 10% + ¥5,000; health ~4.96%, pension 9.15% (capped), employment insurance 0.55% *(approximation)* | 2025/2026 | yes | [link](https://www.nta.go.jp/english/taxes/individual/12012.htm) |
| KR | Income tax 6%-45% + 10% local income tax, employment income deduction, ₩500,000 wage-earner credit (approx); NPS 4.75% (capped), NHI 3.595% + LTC, EI 0.9% *(approximation)* | 2026 | no | [link](https://www.nts.go.kr/english/) |
| SG | IRAS resident rates YA2024 onward 0%-24%, S$1,000 earned income relief; CPF not applied (Employment Pass holders do not contribute) | YA2026 | no | [link](https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates) |
| HK | Salaries tax: progressive 2%-17% after HK$132,000 basic allowance, capped at the standard rate 15% (16% over HK$5M); MPF (funded) deducted, not counted as tax | 2025/26 | no | [link](https://www.ird.gov.hk/eng/tax/sal.htm) |
| TW | Income tax 5%-40%, exemption + standard + salary deductions NT$446,000; labour and health insurance (capped) *(approximation)* | 2025 | no | [link](https://www.etax.nat.gov.tw/) |
| IN | New regime FY2026-27: 0/5/10/15/20/25/30% slabs, ₹75,000 standard deduction, section 87A rebate to ₹12 lakh, surcharge to 25%, 4% cess; professional tax ₹2,500 (KA/MH/TS). EPF (funded) excluded | FY2026-27 | yes | [link](https://incometaxindia.gov.in/) |
| AU | ATO resident rates 2026-27: 0/15/30/37/45% ($18,200/$45,000/$135,000/$190,000), LITO, Medicare levy 2%. Super is employer-paid on top, excluded | 2026-27 | yes | [link](https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents) |
| NZ | IRD rates from 1 Apr 2025: 10.5/17.5/30/33/39%; ACC earners levy 1.67% (capped). KiwiSaver excluded | 2025/26 | no | [link](https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals) |
| CA | CRA 2026 federal 14/20.5/26/29/33%, BPA $16,452, Canada employment amount; CPP 5.95% to $74,600 + CPP2 4% to $85,000; EI 1.63% to $68,900 | 2026 | yes | [link](https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html) |
| CA-ON | Ontario 2026 5.05/9.15/11.16/12.16/13.16%, surtax (thresholds indexed from 2025, approx), Ontario Health Premium *(approximation)* | 2026 | yes | [link](https://data.ontario.ca/dataset/personal-income-tax-rates-and-credits) |
| CA-BC | British Columbia 2025 brackets 5.06%-20.5% | 2025 | no | [link](https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates) |
| CA-QC | Quebec 2025 brackets 14/19/24/25.75%, federal abatement 16.5%; QPP 6.3%, QPIP 0.43%, EI 1.30% *(approximation)* | 2025 | no | [link](https://www.revenuquebec.ca/en/citizens/income-tax-return/) |
| MX | ISR annual table (Art. 152 LISR, 2025 values) 1.92%-35%; IMSS employee ~2.775% (capped at 25 UMA) *(approximation)* | 2025 | no | [link](https://www.sat.gob.mx/) |
| BR | IRPF monthly table (2025) 0%-27.5% and INSS 7.5%-14% to the ceiling, x12 (13th salary not modeled; 2026 low-income exemption irrelevant at these salaries) *(approximation)* | 2025 | no | [link](https://www.gov.br/receitafederal/) |

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
| `costIndex` | living costs excluding rent, New York = 100 |
| `bigMacUSD` | the country's Big Mac price in USD |
| `fxPerUSD` | local currency units per USD |
| `sources` | one entry per numeric field: `name`, `url`, `asOf` (+ `estimated`, `method`, `crossCheck`, `note`, `via`) |

Top level: `baseline` (NYC basket), `fx` (`perUSD` table), `bigMac` (`byCountry`
table), `sourceNotes` (shared notes referenced by `via` / `note`).

### Sources

| Field | Source | As of | License / terms | Refresh |
|---|---|---|---|---|
| `bigMacUSD`, `fxPerUSD`, `*USD` conversions | [The Economist Big Mac index](https://github.com/TheEconomist/big-mac-data), `source-data/big-mac-source-data-v2.csv` (per-country prices incl. each euro member; `dollar_ex` exchange rates from Refinitiv/LSEG) | release 2026-07-01 | data CC BY 4.0, code MIT | automatic, monthly |
| `rent1brCenterLocal`, `rent1brOutsideLocal` | [Numbeo](https://www.numbeo.com/cost-of-living/) city pages ("1 bedroom apartment in city centre / outside of centre") | page month, 2026-05 to 2026-10 (64 of 89 are 2026-09) | crowd-sourced, commercial; **terms restrict reuse, not cleared (§4.1)** | manual; replacement plan §7 |
| `costIndex` | derived: `100 × Numbeo "estimated monthly costs for a single person, excluding rent" ÷ New York's` | same pages | as above | manual; replacement plan §7 |
| `baseline.nycBasketUSD` | Numbeo New York single-person estimate excluding rent, $1,665.2/month × 12 = **$19,982** | 2026-09 | as above | manual; replacement plan §7 |
| cross-checks (not used in the formula) | [Zumper National Rent Report](https://www.zumper.com/rent-research/national-rent-report) Sep 2026 (SF $4,400, NYC $4,580, Seattle $1,960, Austin $1,520, DC $2,250 in Jul); Numbeo's published index (SF 90.32, London 85.9, Zurich 118.5-123.1); [BLS CE 2024](https://fred.stlouisfed.org/series/CXUTOTALEXPLB0502M) one-person households $48,794/yr all-in | 2024-2026 | public reports | n/a |
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
- **Tax schedules.** Switzerland (Zurich, Geneva) and Finland are flagged `estimated` (combined
  marginal schedules); others marked *approximation* in the table simplify credits or caps.
- **Low-confidence quotes.** Paris rents (two snippets disagreed; see the record's `note`),
  Mountain View (outside-centre above centre, few submissions), Sydney (first snippet mixed
  in Sydney, Nova Scotia; re-queried).

## 5. Limitations

- **An estimate, not financial advice.** One person, one model, rough FX, crowd-sourced prices.
- Rent is a 1-bedroom for one person; families, shared flats and owners differ a lot.
- The NYC basket is Numbeo's lean single-person basket (groceries, transport, utilities,
  eating out, leisure). It excludes health-insurance premiums, travel, savings and
  childcare, so "juice" includes the money for those.
- Tax ignores equity, bonuses, expat regimes, deductions people actually claim and
  year-end credits; effective rates are within a few points for typical salaries,
  worse for edge cases (very high or very low pay, mid-year moves).
- FX is one static table, `FX_PER_USD` in `server/juice.js` and `public/viz/palette.js`, set to the
  Big Mac data's July 2026 `dollar_ex` (test/fx-consistency.test.js keeps the copies equal). The
  monthly refresh updates `cities.json` `fx` but not those two tables, so they can drift by a month or more.
- Cost-index proxies treat a suburb like its metro; quoted rents for small cities rest on
  few Numbeo submissions.
- Job locations outside the 89 cities get no juice (a job still shows if any location matches).

## 6. Refreshing

**Automatic (monthly):** `.github/workflows/col-refresh.yml` runs on the 3rd of each month
(and on demand): `node scripts/update-col.js` fetches the Big Mac CSV from GitHub raw,
updates `bigMac`, `fx`, each city's `bigMacUSD` / `fxPerUSD`, re-converts the quoted rents
to USD, updates the as-of dates, runs `node --test test/juice.test.js`, and commits
`data/cities.json` if anything changed.

```sh
node scripts/update-col.js                 # live
node scripts/update-col.js --dry-run       # show changes only
node scripts/update-col.js --csv file.csv  # offline, from a downloaded copy
```

**Manual (quarterly is plenty):**

1. Rents and cost index: for each city, open its Numbeo page (`sources.rent1brCenterLocal.url`),
   update `rent1brCenterLocal`, `rent1brOutsideLocal` and the single-person figure in
   `sources.costIndex.method`, recompute `costIndex = 100 × city ÷ New York`, and set each
   `asOf` to the page month. Then run `node scripts/update-col.js` (re-derives the USD fields)
   and `node --test test/juice.test.js` (fails if a numeric field lacks a source or date).
2. Tax: each January (April for UK/AU/IN/NZ fiscal years), update the brackets in
   `server/juice.js` and the matching `TAX_SOURCES` entry (`asOf`, `verified`).
3. Upgrading to official feeds (if a runner can reach them): HUD Fair Market Rents API
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
267 figures plus 1. Big Mac, FX and tax are already open or official.

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
