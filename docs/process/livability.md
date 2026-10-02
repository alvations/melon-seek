# Process log: livability (Juice Score)

## 1. Brief

Prompt: [prompts/livability.md](prompts/livability.md). Goal: a sourced, refreshable
database of cities (rent, cost-of-living index, Big Mac price, FX, tax jurisdiction)
and a melon-named livability score that compares what a posting pays with what it
costs to live there: the **Juice Score**, *"livability $: what's left after living costs"*.

Files owned: `data/cities.json`, `server/juice.js`, `scripts/update-col.js`,
`test/juice.test.js`, `docs/LIVABILITY.md`, `.github/workflows/col-refresh.yml`, this log,
the prompt file, and the replay helper `docs/process/scripts/livability-build-cities.mjs`.

## 2. Inputs and sources

Repo files read: `docs/CONTRACT.md` (Job shape, module layout), `server/geo.js` (gazetteer
names, regions, ISO countries, `normKey`), `server/normalize.js`, `server/salary.js`
(annualized `salary.mid`), `server/demo.js` (demo locations and currencies per catalog),
`public/viz/palette.js` (`FX_TO_USD`), `server/vet.js` (vetting agent's quarantine shape:
`salary: null` + `salaryFlag` + `salaryRaw`, `salary.kind`), `scripts/build-static.js`
(`LIB_MODULES`, node-import check), `.github/workflows/snapshot.yml` (workflow model),
`docs/process/TEMPLATE.md`.

Network reality in this sandbox (recorded so a replay knows what to expect):

- Reachable: `raw.githubusercontent.com`, `github.com`, npm, PyPI. **WebSearch works** (returns
  result summaries with URLs).
- Blocked (curl `000`, WebFetch `EGRESS_BLOCKED`): numbeo.com, zumper.com, zillow.com,
  api.worldbank.org, sdmx.oecd.org, apps.bea.gov, huduser.gov, bls.gov, fred.stlouisfed.org,
  Eurostat, ONS, StatCan, CSO, ABS, SingStat, BFS, wikipedia, jsDelivr, taxfoundation.org.
- `gh api` on TheEconomist/big-mac-data refused (repo not attached to the session); read the
  license from `LICENCE` / `README.md` via raw.githubusercontent.com instead.
- A `curl $HTTPS_PROXY/__agentproxy/status` check was denied by the permission classifier; it was
  not retried or worked around.

External sources and what each contributed:

| Source | Used for |
|---|---|
| The Economist Big Mac data, `source-data/big-mac-source-data-v2.csv` (raw GitHub), `LICENCE` (MIT), README "Licence" (data CC BY 4.0) | `bigMacUSD`, `fxPerUSD`, `fx.perUSD`; latest release 2026-07-01, 33/33 countries present incl. each euro member |
| Numbeo city pages, read via ~70 WebSearch queries (`allowed_domains: numbeo.com`) | 1BR centre/outside rents and single-person monthly cost excl. rent for 89 cities (page months 2026-05..2026-10), NYC baseline $1,665.2/mo |
| Zumper National Rent Report Sep 2026 + city pages (WebSearch) | US rent cross-checks (SF $4,400, NYC $4,580, Seattle $1,960, Austin $1,520, DC $2,250) |
| FRED / BLS CE 2024 (WebSearch) | baseline cross-check: one-person total $48,794, insurance & pensions $4,329 |
| Tax verification searches (13) | US 2026 federal + SS base, CA 2025 + SDI 2026, NY 2026 + NYC, UK 2026/27, IE 2026, CA 2026 fed/CPP/EI/ON, AU 2026-27, DE 2026, NL 2026, JP 2025 reform, IN FY2026-27 (URLs in `TAX_SOURCES[*].checkedVia`) |

Skills: none loaded (no artifact or chart produced).

Follow-up inputs (strategy review): `docs/strategy/ROADMAP.md` §7.1 F8 ("every score carries its
inputs ... and a confidence; no Numbeo data (S67); non-US cities are low confidence unless
sourced"; drawer gets an editable rent), §9 D6 (US first, non-US low), and
`docs/strategy/COMPETITIVE_ANALYSIS.md` §4.3 + sources S67 (Numbeo terms), S68 (Big Mac, cited as
MIT), S69 (HUD FMR). Two WebSearch queries (`allowed_domains: numbeo.com`) on the terms of use,
data licence and API pages.

## 3. Decisions and rationale

1. **Name: kept "Juice Score".** Juice = what's left after the rind (rent, tax, living) is peeled;
   "juicy" already means lucrative. Rejected *Melon-aire Index* (reads as wealth, not what's left),
   *Rind Ratio* (names the costs), *Take-Home Melon* (long, no score). Subtitle fixed in
   `JUICE.subtitle`; grades Juicy / Ripe / Dry, plus **Rind** for net ≤ 0.
2. **Numbeo for rent and cost index, official data as cross-checks.** Wanted official/open
   (ZORI, HUD FMR, BEA RPP, ICP, ONS), but none defines centre vs outside 1BR or a cross-country
   non-rent index on one basis, and all of those hosts were blocked. One consistent definition
   matters more for a comparative score. Quoted individually (89 × 3 figures), attributed, page month
   recorded, never scraped; the refresh job never touches them. Every snippet-derived value carries
   `via: 'numbeo-snippets'` (explained in `sourceNotes`).
3. **costIndex derived, not Numbeo's published index:** `100 × city single-person cost ÷ NYC's`.
   It makes `living = costIndex/100 × NYC basket` equal Numbeo's own single-person estimate for the
   city (one quantity end to end). Checked against the published index: SF 91.0 vs 90.32, London
   86.3 vs 85.9, Columbus 73.2 vs 71.8; Zurich 111.7 vs 118.5-123.1 (documented). Currency precedence:
   page USD, else page EUR ÷ €1,466.0, else local at Big Mac FX.
4. **NYC basket = Numbeo NYC single-person excl. rent × 12 = $19,982.** Lean basket; BLS CE 2024
   one-person ($48,794 all-in) recorded as a cross-check. Considered building the basket from BLS CE
   components, but the one-person shelter series could not be retrieved, so it would have needed
   guessed inputs.
5. **Estimates flagged, never sourced-looking:** 9 metro proxies for cities without a Numbeo
   single-person figure (rents still city-specific), 2 comparison-derived (Boulder, Hyderabad),
   Swiss and Finnish tax schedules. `computeJuice` surfaces `estimated: true`.
6. **Score (superseded by 21):** `100 × ln(1 + net/$10K) / ln(1 + $250K/$10K)`, clamped. Fixed anchors (stable across
   companies), log so the first dollars of slack matter most. Thresholds: Juicy ≥ 70 (≥ $87.8K net),
   Ripe ≥ 45 (≥ $33.3K), Dry > $0, Rind ≤ $0. Grade is computed from the rounded score so the badge
   always matches the number.
7. **Waterfall exactness:** parts are rounded first and `net = gross − tax − rent − living` exactly.
8. **Tax model in code, not JSON:** small per-country functions over bracket tables (German zones as
   linear marginal rates) with `TAX_SOURCES` (name, url, asOf, verified, approximate, estimated,
   checkedVia). Mandatory public social insurance counts as tax; funded individual retirement
   accounts (401k, CH 2nd pillar, CPF, EPF, super, MPF) do not. City records carry only
   `tax: { country, region, local }`.
9. **FX:** palette `FX_TO_USD` copied verbatim (test asserts equality) so juice matches the chart's
   approx-USD; other currencies use Big Mac `dollar_ex`. Tax is computed in local currency at the same
   rate, so GBP/EUR salaries round-trip exactly. Rents are converted from the quoted local figure at
   that same rate. Known cost: the palette table is stale (GBP 1.27 vs 1.35).
10. **Currency scoping in attachJuice:** a USD range on "SF | London" is not applied to London;
    USD-for-London-only gets `currencyMismatch: true`.
11. **Matching:** city (normKey) + country, region required for US/CA/AU when both sides have one;
    `aliases` and `nearby` (suburb proxies, `proxy: true`). Keys `<city>[-<region>]-<country>`.
12. **Big Mac source file:** `source-data/big-mac-source-data-v2.csv` instead of the output index,
    because the output index only has a "Euro area" row.
13. **Refresh workflow commits** (unlike snapshot.yml, which now uploads artifacts): cities.json is
    ~250 KB (16 KB gzipped) and changes monthly. Runs `test/juice.test.js` before committing.
14. **Size:** per-field sources kept short; shared text moved to `sourceNotes` (376 KB to 256 KB).
15. **Numbeo terms (follow-up):** the terms allow free reuse only for personal use (incl. personal
    blogs/websites, with a link) and journalistic/academic works; everything else (copy, distribute,
    display, derivative works) needs written permission; scraping is prohibited; even paid licences
    exclude public-facing APIs/feeds. melon-seek's public dataset and `/api/cities` feed fall outside
    that, so the figures are treated as **not cleared**. Read via search summaries only (site blocked),
    so the wording should be confirmed on the page. Data was kept (coordinator: don't delete), but
    every Numbeo field is now `class: aggregator|estimate`, `terms: numbeo-terms`, and
    `dataStatus.numbeo` = "UNDER REVIEW". Decision 2 is superseded pending the user's call.
16. **Guardrails (ROADMAP F8):** source classes official/open/user (high), aggregator (medium),
    estimate (low); tax high/medium/low by verified/approximate/estimated; overall = lowest; non-US
    is "low" unless rent and cost index are both official/open/user. A user rent override counts as
    `user` for rent but cannot lift a non-US city above "low" while its cost index is an aggregator
    figure. That's deliberate: the override fixes one input, not the whole score.
17. **`rentOverrideUSD` is monthly USD** (matches the drawer's editable field); 0 is valid; null means
    none. A `null` dataset rent throws `NO_RENT` so the §7 plan (cities without open rent data) can
    still score with the user's rent.
18. **Payload:** a result with inputs is ~1.9 KB. computeJuice always returns inputs; attachJuice
    keeps them on `best` only by default (`inputs: 'all' | 'best' | 'none'`), so a 3-location job
    grows by ~1.5 KB, not ~6 KB.
19. **Replacement plan sizing:** each city sorted by what open/official source exists (tiers
    A/B/B−/C = 44/13/17/15). D6-recommended scope ≈ 4-5 dev-days; full global ≈ 10-14 days.
    Written in `docs/LIVABILITY.md` §7.
20. **S68 correction:** the Big Mac *data* is CC BY 4.0 (attribution required); MIT covers the code.
21. **Score re-tune (integration finding: Anthropic's top cards all "100 · Juicy"):** replaced the clamped
    log curve with a saturating exponential `100 × (1 − e^(−net/K))`, **K = $80,000**,
    `fullGlassUSD = $423,866` (smallest whole-dollar net whose rounded score is 100). Alternatives:
    (a) raise B in the log curve. Rejected: with B = $500K the 90th-percentile net ($172.6K) scores
    74-83 for any A, below the 85-90 target, because a log curve concentrates its resolution at the
    low end. (b) Log then saturate (`1 − e^(−ln(1+n/A)/τ)`): hits 87.5 at p90 but compresses the top
    decile into 87-93, worse than before. (c) Hyperbolic `1 − (1+n/A)^(−k)`: fitting p90 = 87.5 and
    $400K = 98 gives A ≈ $320K, k ≈ 4.8, i.e. practically the exponential with an extra parameter.
    Chose (d), the one-parameter exponential: invertible (`netForScore`), explainable ("each $80K
    closes 63% of the gap"), and K = $80K is a round number that puts p90 at 88 (target 85-90).
    Grade score boundaries kept (45 / 70); dollar equivalents moved: Ripe ≥ $47,827 (was $33,325),
    Juicy ≥ $96,318 (was $87,832). The low end is less generous (p10 48 → 38): accepted, since the
    app's population is high earners, and $38K a year left over is a thinner margin than "Ripe" suggested.

## 4. Replayable steps

```sh
# 0. Big Mac data (reachable from the sandbox)
curl -sS -o big-mac-source-data-v2.csv \
  https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/source-data/big-mac-source-data-v2.csv
curl -sS https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/LICENCE | head -3   # MIT
curl -sS https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/README.md | grep -A2 Licence  # CC BY 4.0

# 1. City figures: one WebSearch per city (or per pair), allowed_domains ["numbeo.com"], e.g.
#    'Cost of Living in Seattle numbeo Sep 2026 "1 Bedroom Apartment in City Centre"
#     "Outside of City Centre" single person excluding rent'
#    Re-query any outlier (Sydney, Paris, Miami/Philadelphia needed a second query).
#    The figures used are embedded in docs/process/scripts/livability-build-cities.mjs.

# 2. Assemble data/cities.json (overwrites it)
node docs/process/scripts/livability-build-cities.mjs --csv big-mac-source-data-v2.csv
#   -> wrote data/cities.json: 89 cities, Big Mac 2026-07-01

# 3. Refresh (idempotent on a fresh build)
node scripts/update-col.js --dry-run   # -> already up to date (Big Mac release 2026-07-01)
node scripts/update-col.js             # live fetch from GitHub raw

# 4. Tests
node --test test/juice.test.js         # 19/19 pass
npm test                               # 135/135 pass
```

## 5. Verification

- `node --test test/juice.test.js`: **19 pass, 0 fail**: formula (progressive incl. linear zones;
  US/CA $300K; TX/NYC/Columbus; UK 2026/27 with GBP round-trip), per-country sanity (tax monotonic and
  0 ≤ tax < gross at $30K-$600K for all 89 cities), score anchors/inverse/grades/Rind, output shape,
  outside-rent option, estimate flags, FX parity with palette.js, findCity for **every non-remote
  location in all demo catalogs** (anthropic, anduril, openai, generic: 20 cities, 0 unmatched),
  aliases/region disambiguation/proxies, attachJuice (best/byLocation, null for no salary,
  **vetting-quarantined salary**, remote-only, unknown currency, currency scoping), data integrity
  (every numeric field has name + https url + asOf; estimates have a method; keys match the gazetteer;
  USD = local ÷ FX; Big Mac/FX tables consistent; NYC = 100; baseline = code constant), every tax
  jurisdiction has a sourced rule, juice.js browser-safety, update-col (CSV quotes, apply, untouched
  quoted fields, refuses incomplete data).
- `npm test`: 135/135 (no regressions in other suites).
- Follow-up: `node --test test/juice.test.js` **23/23** (4 new guardrail tests: inputs with source
  and as-of on all 89 cities; confidence rules incl. an official-sourced clone of London reaching
  "high"; `rentOverrideUSD` and `NO_RENT`; attachJuice `inputs` modes; plus integrity checks that every
  source has a class and every Numbeo source is aggregator/estimate with `terms`). `npm test` 187/187.
  Confidence today: US 30 medium / 10 low, non-US 49 low.
- Re-tune: distribution over all 8 real snapshots (5,413 jobs; 4,551 salaried after vetting, 51
  quarantined; 4,034 with juice), from `docs/process/scripts/livability-juice-distribution.mjs --old`:

  | Percentile | Salary | Net | Before (log, A $10K / B $250K) | After (exp, K $80K) |
  |---:|---:|---:|---:|---:|
  | 10th | $128,500 | $38,426 | 48 | 38 |
  | 25th | $165,000 | $62,990 | 61 | 54 |
  | 50th | $199,267 | $88,665 | 70 | 67 |
  | 75th | $279,330 | $127,375 | 80 | 80 |
  | 90th | $362,500 | $172,580 | 89 | 88 |
  | 95th | $415,000 | $199,654 | 93 | 92 |
  | 99th | $545,918 | $277,388 | 100 | 97 |
  | max | $684,082 | $397,601 | 100 | 99 |

  Score 100: 68 jobs (1.7%; Anthropic 61, OpenAI 7) → 0. Score ≥ 90: 387 → 333. Grades before
  Juicy 2,073 / Ripe 1,686 / Dry 238 / Rind 37; after 1,845 / 1,592 / 560 / 37. Per company (median /
  90th): Anthropic 87/100 → 86/96 (top-decile distinct scores 1 → 4), OpenAI 82/93 → 81/92,
  Anduril 62/78 → 56/76, Palantir 48/61 → 38/55, Shield AI 71/84 → 68/83, Scale AI 71/83 → 68/82,
  xAI 72/81 → 70/81, Cohere 75/84 → 73/83. A 90th-percentile salary ($362.5K): SF 86, NYC 84, Seattle
  92, Costa Mesa 88. Tests: `test/juice.test.js` 24/24 (the score test rewritten for the curve; a
  calibration test pins the reference quantiles because snapshots are gitignored). Full `npm test`:
  248/248 (an intermediate run had 2 failures outside juice, in features.test.js and server.test.js,
  from other workstreams' in-progress edits; they pass now).
- Live `node scripts/update-col.js --dry-run` against GitHub raw: up to date, exit 0.
- Hand checks: SF $300K net $125,189 (hand $125,197 before rounding), Austin $150K $76,576,
  London £120K tax £43,843 (HMRC arithmetic), Germany €90K income tax €19,497 (§32a zone 4),
  Japan ¥12M total ¥3.46M, India ₹40L ₹7.88L, Singapore S$180K S$17,370.
- Demo coverage: 96/97 salaried Anthropic demo jobs get juice (the rest are remote-only);
  anduril 108/108, openai 108/110, generic 85/87.

## 6. Known gaps and follow-ups

- **Awaiting the user (ROADMAP D6):** keep or remove the Numbeo figures. If removed, remove them
  from `data/cities.json` *and* the builder script (both are in public git history), then follow
  `docs/LIVABILITY.md` §7. Needs free HUD and BEA API keys as repository secrets.
- The terms were read through search summaries; confirm the wording on numbeo.com before acting.

- **Integration not done (not my files):** normalize/server/static build/UX/viz wiring; see the
  integration notes handed to the lead. `docs/process/README.md` needs a livability row.
- Numbeo figures come from search snippets, not page fetches; Paris and Mountain View are
  low-confidence (notes in the records). A runner with egress should re-read the pages.
- 9 cost-index proxies and 2 comparison-derived estimates; Swiss/Finnish tax schedules are
  approximations; unverified tax rows (TAX_SOURCES `verified: false`) use 2025 schedules in places.
- Palette FX is stale relative to the Big Mac FX; suggest viz read `cities.json` `fx.perUSD`.
- Payload: ~1.1 KB juice per 3-location job; for the packed static format consider computing juice
  in the browser (juice.js + cities.json are browser-safe) instead of shipping it per job.
- Official feeds to add when reachable: HUD FMR API, ONS PIPR, CMHC, RTB, BEA RPP, Eurostat/ICP.

## 7. Change log

- 2026-10-02 05:50 UTC: read contract, gazetteer, normalize, palette, demo; probed egress; Big Mac
  data and license from GitHub raw.
- 06:00-06:35: Numbeo/Zumper/BLS searches for 89 cities; tax verification (session limit hit
  mid-way at DE/NL/JP/IN; resumed after reset per coordinator).
- 06:40: `scripts/update-col.js`, builder script, `data/cities.json` (89 cities).
- 06:45: `server/juice.js`; hand-checked outputs; grade-from-rounded-score fix; exact waterfall.
- 06:50: `test/juice.test.js` (19 tests; fixed a test that geocoded "Berlin, DE" as Delaware).
- 06:57: compacted sources (376 KB to 256 KB); workflow; LIVABILITY.md; `checkedVia` URLs for
  verified tax rows; Ontario source URL corrected to the one the search returned.
- 07:10: follow-up from the strategy review: guardrails (`inputs`, `confidence`, `rentOverrideUSD`,
  `NO_RENT`, attachJuice `inputs`/`rentOverrides` options), source classes + `terms` + `dataStatus`
  in cities.json, Numbeo terms check (not cleared), replacement plan and sizing (LIVABILITY.md §4.1,
  §7), licence wording corrected in the dataset, 4 new tests (23/23).
- 07:40: score re-tune after the integration finding (Anthropic saturating at 100): exponential curve
  K = $80K (`SCORE_ANCHORS = { curve, K, fullGlassUSD }`), netForScore inverse, before/after
  distribution recorded above, LIVABILITY.md curve/calibration/examples updated, distribution script
  saved as `docs/process/scripts/livability-juice-distribution.mjs`. Also: `inputs.fx` relabelled now
  that the shared FX table is the Big Mac July 2026 rates (updated in a WIP commit, not by me).
