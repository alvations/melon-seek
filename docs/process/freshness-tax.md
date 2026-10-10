# Process log: freshness-tax

## 1. Brief

Prompt: [docs/process/prompts/freshness-tax.md](prompts/freshness-tax.md) (written by the freshness lead).

The task is a detect-and-alert updater for every Juice Score tax rule. Each month the refresh:
1. fetches the official pages;
2. compares each encoded threshold, rate, allowance and cap with the published figure;
3. reports **drift** when a figure differs or a newer tax year has been published;
4. reports **error** when a page moved, and **stale** when a manual entry is past its review date.

It never writes `server/juice.js`. A human, or the juice-tax process, updates the code, the golden tests, LIVABILITY §3 and `TAX_SOURCES` together.

Files owned:
- `scripts/refresh/tax.js`, the updater;
- `scripts/refresh/tax-watch.js`, the watch list (data only);
- `test/refresh-tax.test.js`;
- `test/fixtures/refresh/tax/**`;
- this log;
- `docs/process/patches/freshness-tax-export.diff`;
- the hand-off `scratchpad/freshness/registry-tax.json`.

## 2. Inputs and sources

**Repo files read:**
- `server/juice.js`, the tax section. The juice-tax agent restructured it while this work ran:
  - `US_FED_2026` became `{ single, mfj }`;
  - new `usTax`, `US_ADDL_MEDICARE` and `US_CTC_2026`;
  - `CA_X_2025` / `CA_Y_2025`, `NYS_2026`, `NYC_2026`, `OR_2026` / `AL_2025` / `MD_2025`;
  - `ES_STATE` / `ES_REGIONAL`, `ZH_GRUND`, `DE_2026`, `FR_BAREME`;
  - `TAX_SOURCES` gained `reviewed`, `unverified` and `notModeled`, and grew from 69 to 71 keys (ES-MD and ES-CT).
- `test/juice.test.js`, `docs/LIVABILITY.md` §3 and §6, `docs/process/prompts/juice-tax.md`, `.github/scripts/juice-tax-probe.mjs`.
- The freshness lead's `scripts/refresh/lib.js` and `run.js`, `docs/DATA_FRESHNESS.md`, and `bigmac.js` (as a model).

**External sources:** WebSearch on 2026-10-10.
- The IRS tax year 2027 inflation-adjustment release was not found. The IRS "news releases for the current month" page captured that day ends at IR-2026-120 of 7 Oct, with no 2027 release.
- The SSA 2027 wage base had not been announced. Press reports expect it with the COLA around 14 October; that date is unverified. The SSA Trustees projection of $190,200 is a projection only and is not used anywhere.

### Probe runs

Every page was read from a GitHub runner with `.github/workflows/freshness-probe.yml` (`workflow_dispatch`, read-only, already on the branch). Most requests used the refresh's own User-Agent, `melon-seek-refresh/1`, so the probe shows what the monthly job will see.

| Run | Job | What it captured |
|---|---|---|
| 38036911378 | 114169139614 | US federal (IRS), US states, gov.uk Content API, Ireland |
| 38036930704 | 114169201788 | CRA, NZ, SG, HK, JP, NO, FR, BC; ATO, gesetze-im-internet and Revenu Québec failed |
| 38037181487 | 114169954509 | SSA and ATO with browser and curl UAs (both 403), CRA current year, FTB 2025/2026 PDFs, gov.uk 2025-26, NY 2026 (404), NO 2025, IRS Rev. Proc. 2025-32 PDF |
| 38037585519 | 114171151859 | Federal Register API (SSA determinations), CRA last year, Utah, Portland, plus several 404s |
| 38038791926 | 114174722578 | NO 2026 and 2027 (2027 silently serves 2026), gov.uk 2027-28 recheck (404), CRA CPP full page |

To decode a run: fetch the logs with `get_job_logs return_content=true` (saved to a file), extract `logs_content`, then `node .github/scripts/freshness-probe.mjs --decode <log> <dir>`. The sha256 of every document was checked.

### Hosts that refuse GitHub runners

These were checked on 2026-10-10, and the affected entries are manual or read another official page:
- `ssa.gov`: 403 to the refresh UA, a browser UA and curl. The wage base comes from IRS Topic 751; the SSA notice is detected through the Federal Register API.
- `ato.gov.au`: 403.
- `gesetze-im-internet.de`: the connection fails.
- `revenuquebec.ca`: 403.
- `detroitmi.gov`: 403.

### Fixtures

All fixtures are in `test/fixtures/refresh/tax/`, captured 2026-10-10 08:09-08:42 UTC from the probe runs above, and mapped by `urls.json`.

HTML is trimmed: script, style, head, nav, header, footer and attributes are removed, and the IT-201 page is cut to its three schedules. gov.uk JSON keeps `details`. PDFs are kept whole. Every fixture is under 200 KB.

| Fixture | Source |
|---|---|
| `irs-news-ty2026.html` | IRS newsroom, tax year 2026 inflation adjustments |
| `irs-tc751.html` | IRS Topic 751 |
| `irs-news-current-month.html` | IRS news releases, current month |
| `fedreg-ssa-cola.json` | Federal Register API, SSA determinations (latest: "for 2026", published 2025-11-03) |
| `ftb-2025-540-tax-rate-schedules.pdf` | FTB 2025 schedules X / Y / Z |
| `ftb-2026-540-tax-rate-schedules.404.html` | FTB 2026 schedules: 404 (not yet published) |
| `edd-rates-and-withholding.html` | EDD SDI 2026: 1.3% |
| `ftb-tax-calculator-tables-rates.html` | FTB tables and rates index |
| `ny-it201i-2025.html` | NY IT-201 instructions 2025: standard deduction table, NYS and NYC schedules |
| `ny-it201i-2026.404.html` | NY 2026 instructions: 404 |
| `mass-tax-rates.html` | MA DOR rates (2026 surtax threshold $1,107,750) |
| `mn-income-tax-rates-and-brackets.html` | MN 2026 / 2025 / 2024 |
| `dc-income-tax-rates.html` | DC OTR |
| `govuk-employers-2026-to-2027.json`, `govuk-employers-2025-to-2026.json` | GOV.UK Content API |
| `govuk-employers-2027-to-2028.404.html` | GOV.UK 2027-28: 404 |
| `govuk-income-tax-rates.json` | GOV.UK income tax rates |
| `revenue-ie-tax-relief-charts.html`, `revenue-ie-usc.html` | Irish Revenue (Budget 2027 note of 6 Oct 2026) |
| `cra-tax-rates-current-year.html`, `cra-tax-rates-last-year.html`, `cra-tax-rates-index.html` | CRA federal and provincial brackets |
| `cra-cpp-rates.html` | CRA CPP |
| `cra-ei-rates.html` | CRA EI (the "New 2027" row: $70,800, 1.64%) |
| `bc-tax-rates.html` | gov.bc.ca |
| `ird-nz-tax-rates.html` | NZ IRD |
| `iras-income-tax-rates.html` | Singapore IRAS |
| `govhk-salaries-tax-rates.html` | GovHK |
| `nta-2260.html` | Japan NTA Tax Answer 2260 |
| `skatteetaten-bracket-tax.html`, `-2025.html`, `-2026.html` | Norway Skatteetaten |
| `service-public-f1419.html` | Service-Public F1419 |
| `utah-tax-rates.html` | Utah Tax Commission |
| `portland-personal-tax.html` | Portland Metro SHS / PFA (2027 row: $132,000) |
| `juice-snapshot.js.txt` | Pinned copy of `server/juice.js` (sha256 f6b8b6b0…), so the tests do not move when the tax rules change |

## 3. Decisions and rationale

1. **One watch entry per TAX_SOURCES key**, with id `tax-<key lowercased>`, as the lead asked: 71 ids. Coverage is checked against:
   - RULES keys, US_STATE as US-x, US_LOCAL as US-LOCAL-x, CA_PROV as CA-x;
   - every TAX_SOURCES key.

   A new jurisdiction without an entry fails `test/refresh-tax.test.js` ("live" tests). At run time it also flags `tax-us` with a coverage finding.

2. **Encoded values come from the source text, never from running taxFor.** Each figure has a list of locators, and the first that resolves wins:
   - `params` (TAX_PARAMS, after the patch);
   - a named constant via lib `extractConst`. `{year}` comes from `TAX_SOURCES[key].asOf`, so `US_FED_{year}` follows a rename to `US_FED_2027` automatically;
   - a regex inside a rule block (`US_STATE.CA`, `RULES.IE`, `fn:caPayroll`).

   Named constants are preferred, as the lead asked; blocks are only for inline literals. If `TAX_SOURCES` is not a plain literal, the module falls back to importing `server/juice.js`.

3. **The tax year comes from `TAX_SOURCES.asOf`:**
   - the first 4-digit year by default;
   - `yearFrom: 'last'` per figure for mixed values, e.g. US-CA "2025 (brackets) / 2026 (SDI)" and US-MA "2025 / 2026 (surtax)";
   - `yearStart` for fiscal years: GB 04-06, AU 07-01, IN, NZ and HK 04-01.

   URLs and regexes use `{year}`, `{year1}`, `{prev}`, `{later}` and similar placeholders. The GB source is `rates-and-thresholds-for-employers-{year}-to-{year1}`, and its next-year probe is `{year1}-to-{year2}`.

4. **Official extraction:**
   - documents are reduced to normalized text lines (HTML through lib `htmlToLines`, the gov.uk Content API JSON `details`, PDFs through pdftotext);
   - zero-width characters, odd spaces, full-width ％, dashes and edge pipes are normalized;
   - the text is cut to a `section` (start regex or a sequence of them, end regex);
   - figures are extracted with a one-group regex, or `all` matches with `sort`, `slice` or `cumulative` (USC and HK "First / Next" bands).

   Comparison is exact, with a 1e-9 float epsilon. A per-figure `tolerance` is supported, but no current source rounds.

5. **Newer tax year = drift with evidence, even when every number matches.** Signals:
   - IRS "inflation adjustments for tax year {year1}" on the current-month news page;
   - Topic 751 "For earnings in {year1}";
   - the Federal Register "Determinations for {year1}";
   - FTB `{year1}` schedules PDF;
   - EDD SDI `{year1}`;
   - HMRC `{year1}-to-{year2}` (404 means not yet);
   - CRA EI / CPP "New {year1}" rows and the brackets index;
   - Revenue "Budget {year1}";
   - MN "Income Tax Rates for {year1}";
   - Skatteetaten year selector;
   - Service-Public barème;
   - Portland `{year1}` threshold row;
   - BC `{year1}` table;
   - NZ / SG / HK "onwards" headers.

   When a signal carries a value (wage base, EI MIE, MA surtax, Portland threshold), it is reported encoded vs new, and a decrease adds a validator finding. Offline, a 404 is represented by a fixture named `*.404.html`.

6. **Status precedence for detect entries:** drift (mismatch or newer year), then flag (a validator rejects the encoded data), then error (a page or extractor failed, or an encoded figure is missing), then skipped (offline with no fixture), then ok. Never `changed`.

7. **Manual entries** (no parseable official page, or a host that blocks runners) return mode `manual` with status ok, stale or flag, and never error:
   - The due date is the start of the next tax year plus `graceDays`.
   - A registry `lastChecked` made after the current tax year started counts as a review and keeps the entry ok until the following year's due date.
   - flag means the encoded tax year is older than the previous one, or a schedule fails the validator.
   - Locators that do not resolve become a note in the summary.

   This follows the lead's correction: 'error' opens an alert every month.

8. **Validators** (exported and tested):
   - `validateSchedule`: thresholds strictly increasing, Infinity last, rates in [0, 0.7) and non-decreasing unless `allowRateDecrease`, linear German zones included;
   - `validateRising`: caps and wage bases must not fall unless `allowDecrease`;
   - `validateTaxYear`: the encoded year must be the current or previous one, by tax-year start;
   - `coverage`.

9. **LLM step:** `llmSecondOpinion` runs only online with `ANTHROPIC_API_KEY`. It asks `ctx.llm` for the entry's figures from the primary page and lists disagreements as findings with an `advisory:` note. It never changes the status.

10. **TAX_PARAMS patch:** the export references only constants that already exist, so it can never disagree with taxFor. With it applied, the module resolves through the `params` locators and gives identical results (checked: 54 ok / 3 drift / 13 stale / 1 flag offline before Utah moved to detect). Inline literals still use block locators.

11. **Detect vs manual.** 21 entries are detect:
    - US, US-CA, US-NY, US-LOCAL-NYC, US-MA, US-MN, US-DC, US-UT, US-LOCAL-PORTLAND;
    - GB, GB-SCT, IE;
    - CA, CA-ON, CA-BC;
    - NZ, SG, HK, JP, NO, FR.

    50 are manual, each with its reason (`manualReason`) and the key encoded figures listed in the checklist.

## 4. Replayable steps

```sh
# offline check, one line per id (scratch helper; same as the orchestrator's --only tax)
node scripts/refresh/run.js --dry-run --offline --only tax --now 2026-10-10 --out tmp/refresh
node --test test/refresh-tax.test.js
npm test
git apply --check docs/process/patches/freshness-tax-export.diff
```

**Re-capturing fixtures:**
1. Dispatch `freshness-probe.yml` with `requests` = `[{"url": "...", "name": "...", "ua": "melon-seek-refresh/1 (+https://github.com/alvations/melon-seek)"}]`.
2. Decode the run (section 2).
3. Copy and trim the documents into `test/fixtures/refresh/tax/`, and add each URL to `urls.json`. Name a 404 response `*.404.html`.

The trim used here keeps the markup and drops script, style, head, nav, header, footer and attributes. It is in the scratchpad (`freshness/tax/bin/build-fixtures.mjs`) and is not part of the product.

## 5. Verification

**`node --test test/refresh-tax.test.js`: 26 / 26 pass.** The tests cover:
- extractors on every real fixture;
- doctored drift (wage base changed; IRS 2027 release and a 2027 wage base appearing; a falling cap; HMRC 2027-28 appearing);
- page moved;
- encoded constant renamed;
- every fetch failing (never throws);
- manual staleness;
- LLM advisory;
- registry entries passing `validateRegistry`;
- live coverage and live locator resolution against the current `server/juice.js`.

**`npm test`: 537 / 543 pass.** The 6 failures are not in tax files:
- 4 archive tests (sweep, versioning, vetting quarantine, ledger);
- `registry: every archive extract resolves` (`fx-per-usd: EXTRA_FX_PER_USD not found in server/salary.js`);
- `review V15: cold /api/market`.

**Orchestrator dry run, offline, 2026-10-10, with the lead's registry:** 71 results: 67 ok, 3 drift, 1 flag. The registry's `lastChecked` equals the juice-tax review date, so manual entries are ok.

Real findings on 2026-10-10:
- **drift `tax-ca`:** EI 2027 maximum insurable earnings $70,800, rate 1.64%. The encoded values are $68,900 and 1.63% (2026).
- **drift `tax-ie`:** Budget 2027 was announced on 6 October 2026, so the 2027 bands, credits and USC are coming.
- **drift `tax-us-local-portland`:** the Metro SHS threshold for 2027 is $132,000; the encoded 2026 value is $128,000.
- **flag `tax-us-local-columbus`:** `TAX_SOURCES` asOf 2024 is older than the previous tax year. The rate is unchanged in practice, but it needs a re-verification.
- **notice `tax-jp`:** from 1 January 2027 the reconstruction surtax falls to 1.1% and a 1% defence surtax is added. The combined rate is unchanged.

While the juice-tax agent was mid-change, the watch list's comparisons caught several encoded values that its rewrite has since corrected:
- CA Schedule X was 2024 values labelled 2025;
- Scottish bands were 2025/26;
- the MA surtax threshold was the 2025 figure;
- MN, NO, FR and BC used the previous year.

Everything that is now encoded matches the official pages above.

## 6. Known gaps and follow-ups

- The 50 manual entries rely on the yearly checklist. The next candidates for detect:
  - the AU Treasury page (ATO blocks runners);
  - Federal Register API rules for other agencies;
  - the IRS Rev. Proc. PDF, once the 2027 one exists (the irsNews source has `forYear: 2026`, so it reports an error until it points at the 2027 release).
- `CPP2` YAMPE, CRA BPA indexation, IE credits, PRSI and NZ ACC are listed as manual figures inside detect entries.
- Locators into rule blocks break when the juice-tax agent reshapes code. The live test names each one that no longer resolves. Applying the TAX_PARAMS patch, and extending TAX_PARAMS to the inline literals, removes this dependency.
- `docs/LIVABILITY.md` §6 step 3 still describes the manual-only process. Linking it to `scripts/refresh/tax.js` is for the owner of §3/§6.
- `juice-snapshot.js.txt` is a 105 KB copy of `server/juice.js`. Refresh it when the extractor tests need the new tax structure.

## 7. Change log

- 2026-10-10 08:00 UTC: brief read; captured the first two probe batches.
- 2026-10-10 08:20 UTC: module and watch list written; the first offline run found the 2024 CA brackets and the 2025/26 Scottish bands.
- 2026-10-10 08:40 UTC: the lead's corrections:
  - 71 ids;
  - manual entries return ok / stale, never error;
  - locators rewritten for the restructured tax section;
  - TAX_SOURCES fallback to the module export.
- 2026-10-10 08:55 UTC: Utah moved to detect; NY fixture trimmed to 6.6 KB; tests, TAX_PARAMS patch, registry hand-off and this log completed.
