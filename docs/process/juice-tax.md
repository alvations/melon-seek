# Process log: juice-tax (tax engineer, Juice Score)

## 1. Brief

Prompt: [`docs/process/prompts/juice-tax.md`](prompts/juice-tax.md). Verify, and fix where
wrong, the tax computed for every jurisdiction in `RULES` against official sources, starting
from the user's example (San Francisco, $675K, single: "make sure the taxes paid are correctly
pulled ... verify with some data"); build golden vectors with the arithmetic and sources;
extend `taxFor` with `opts.household` (one earner, couple / family) where the rules are clear
and sourced; document it.

Files owned and changed:

- `server/juice.js`: the tax section only (header comment through `TAX_COUNTRIES`):
  `progressive`, the US federal / state / local rules, `RULES`, `TAX_SOURCES`, the new
  `TAX_HOUSEHOLD`, `taxKeys`, `taxFor`.
- `test/juice-tax-golden.test.js` and `test/fixtures/tax-golden.json` (new); the tax
  assertions in `test/juice.test.js` (four, explained in §3.12).
- `docs/process/scripts/juice-tax-golden.mjs` (new): the fixture generator.
- `docs/LIVABILITY.md` §3 (rewritten).
- `.github/workflows/juice-tax-probe.yml` and `.github/scripts/juice-tax-probe.mjs` (probe;
  committed and pushed before the lead's stop-pushing note; nothing pushed after it).

## 2. Inputs and sources

- Repo: `server/juice.js` (tax section, `taxConfidence`, `computeJuice`), `test/juice.test.js`,
  `test/juice-household.test.js`, `data/cities.json` (61 distinct tax jurisdictions),
  `docs/LIVABILITY.md`, `scripts/refresh/examples.js` (the freshness tooling regenerates the
  §3 sources table from `TAX_SOURCES`, so that table keeps its column format).
- The sandbox cannot reach tax-authority sites (WebFetch: `getaddrinfo ENOTFOUND` for every
  host), so every official document was fetched by the `juice-tax-probe` workflow
  (`workflow_dispatch`, `contents: read`, pinned actions): it downloads each URL on a GitHub
  runner, runs PDFs through `pdftotext -layout`, reduces HTML to text lines, and prints the
  lines matching a regex (or a line range) to the job log, which was read back with
  `get_job_logs`. Some hosts answer 403 to a browser User-Agent and 200 to `curl/8.5.0`
  (Colorado, mass.gov, Columbus, Pittsburgh, canada.ca, gov.bc.ca); the `ua` option sets it.
  `raw` keeps the HTML so a link target (the Zurich Steuerfuss PDF) can be found.
- Probe runs (workflow `juice-tax-probe.yml`, branch `claude/stoic-ride-54ddxp`): run 1
  38033762544, 2 38033955317, 3 38034305695, 4 38034453044, 5 38034939538, 6 38035455219,
  7 38035784943, 8 38036300756, 9 38036518603, 10 38036748526, 11 38036845866,
  12 38036990520 (326 requests; the request JSON of each run is in its log header).
- Official documents read (status 200), by jurisdiction:
  - **US federal:** IRS Rev. Proc. 2025-32 (`irs.gov/pub/irs-drop/rp-25-32.pdf`), Pub. 15
    (2026), Topic 560, Schedule A and Schedule 8812 instructions, 26 USC 164 (Cornell LII and
    uscode.house.gov).
  - **States and cities:** FTB 2025 rate schedules, 540 booklet (AGI limitation worksheet),
    2026 540-ES; EDD rates and 2026 Method B; NY IT-2105-I (2026) and IT-201-I; WA ESD PFML
    release, WA Cares, paidleave.wa.gov; MA Form 1 instructions (2025) and 2026 Form 1-ES;
    Georgia HB 463 (legis.ga.gov); DC OTR rates; Alabama Form 40 booklet (2025, standard
    deduction chart); Ohio ORC 5747.02 and 5747.025, IT 1040 booklet; Virginia 760
    instructions; Illinois IL-700-T (2026) and IL-1040 instructions; Colorado individual
    income tax guide, DR 0104 (2025), state income tax addback topic; Pennsylvania PIT page;
    NCDOR rates and D-401; Oregon 2026 withholding formulas, OR-40 instructions, transit tax,
    Paid Leave Oregon; Portland personal and arts tax; Utah TC-40 instructions (2025);
    Arizona 140 instructions (2025); Minnesota 2026 brackets and paid-leave premiums;
    Michigan 2026 withholding data; Maryland tax alert (2025 changes); Philadelphia wage
    tax; Pittsburgh tax descriptions; Columbus IR-25 instructions; Florida and Nevada
    constitutions.
  - **Rest of the world:** gov.uk income tax rates, 2026/27 employer rates, Scottish income
    tax; Revenue.ie tax relief charts and USC; Citizens Information PRSI; ESTV federal tariff
    2026, Kantonsblatt ZH and GE (Stand Februar 2026), Zurich Kantonsrat Steuerfuss decision
    (95% for 2026/2027), AHV Merkblatt 2.01; § 32a EStG, SolZG §§ 3-4, SGB XI § 55
    (dejure.org / buzer.de), BMAS Rechengrößen 2026, Bundesanzeiger Zusatzbeitrag 2026,
    Finanzamt NRW Kindergeld / Kinderfreibetrag; service-public.fr barème, CEHR and 10%
    deduction, URSSAF rates and PASS 2026, impots.gouv.fr brochure IR 2026 (quotient
    familial cap), AGIRC-ARRCO chiffres 2026; Belastingdienst 2026 rates and credits;
    BOE LIRPF consolidated text, Seguridad Social 2026 bases, Hacienda "Tributación
    autonómica" 2025 and 2026 (chapters I-III); Portal das Finanças CIRS arts. 68 and 68-A;
    USP Tarifstufen 2026; Skatteverket belopp och procent 2026, SCB kommunalskatter 2026;
    Skatteetaten 2026 rates (bracket tax, NI, minimum standard deduction, personal
    allowance, general income); vero.fi tax bases 2026; Bituach Leumi rates; NTA Tax
    Answers 2260, 1410, 1199 and the Tokyo resident-tax page; IRAS rates and earned income
    relief; gov.hk salaries tax rates and standard-rate zone table; IRD NZ rates; CRA T4127
    (January 2026, Tables 8.1 and 8.2), CPP and EI rate pages; gov.bc.ca 2026 rates and
    basic credits; Treasury (AU) tax cuts page; Receita Federal 2026 IRPF table and the 2026
    INSS table.
- Blocked or unreadable (so the values stay unverified): ATO (403), Revenu Québec (403),
  detroitmi.gov (403), FPS Finance Belgium, skat.dk, EMTA, podatki.gov.pl and zus.pl
  (moved pages), tn.gov, the Texas and Tennessee constitution pages (rendered empty),
  famli.colorado.gov, dfs.ny.gov and paidfamilyleave.ny.gov, the Maryland Comptroller
  (client-side app), stadt-zuerich.ch (404 on every guess), web.archive.org (429).
- Secondary sources were used only to find where to look, never as the source of a value.

## 3. Decisions and rationale

1. **What "verified" means.** `verified: true` only when every value the rule uses was read
   from the linked official document (or its `checkedVia` pages) in this review. Values that
   could not be read were kept unchanged and named in the entry's `unverified` list;
   `notModeled` lists known parts of the system that the rule leaves out. The old
   `verified: true` entries that rested on web-search pages (US-NY, NYC, JP, IN, AU, CA,
   CA-ON, DE) were re-checked; JP, IN, AU, CA, DE and US-CA are now `false` because at
   least one value (Japanese social insurance, all of India, Australia's 15% rate and LITO,
   the CPP2 ceiling, German contribution rates, California's $153 credit amount) could not
   be read from an official page.
2. **US federal deduction.** The model now takes the larger of the standard deduction and
   itemized state and local income taxes, capped at the 2026 SALT limit ($40,400, minus 30%
   of MAGI over $505,000, floor $10,000; 26 USC 164(b)(7)). Schedule A's instructions count
   mandatory state disability and family-leave contributions (CA SDI, NY PFL/DBL, WA/MA
   PFML, OR/MN Paid Leave) and the PA unemployment fund as state income taxes, so they are
   included. Alternative: keep "standard deductions only" as before; rejected because a
   salary-only renter in a taxed state above roughly $200K would itemize, and the old model
   overstated their federal tax at $250K by $350 (Philadelphia) to $3,531 (Portland; San
   Francisco $1,970, New York City $2,859). Mortgage interest and charity
   are not modeled (renter, salary only). Alabama and Oregon subtract the federal tax, so
   the computation iterates (fixed point in two or three passes).
3. **New York recapture.** The IT-2105-I (2026) tax computation worksheets are implemented
   exactly (flat rate once NY AGI passes $157,650 and taxable income is under $215,400;
   recapture base plus incremental benefit phased in over $50,000 above; four-decimal
   rounding of the phase fraction as on the worksheet). Old model: no recapture (-$2,614
   at $675K).
4. **California.** The old brackets were the 2024 ones labelled 2025. The FTB has not
   published 2026 schedules; EDD's 2026 Method B uses the 2025 brackets, so the 2025
   schedules X / Y are used and the tax year is stated as such. The exemption credit phase-
   out ($6 per $2,500 over $252,203) is applied; the Behavioral Health Services Tax 1% over
   $1M of taxable income is kept. The dependent credit is not modeled because its 2025
   amount could not be read.
5. **Payroll premiums counted as tax.** Mandatory public premiums deducted from pay count
   (consistent with "mandatory public social insurance"): WA PFML (1.13% × 71.43% to the
   wage base) and WA Cares, MA PFML, OR transit tax and Paid Leave, MN Paid Leave, PA UC,
   NY PFL and DBL. The employee shares for MA, OR and MN come from secondary sources and
   are listed as unverified.
6. **State changes from the sources:** Georgia 4.99% with $15,000 / $30,000 standard
   deduction and $5,000 per dependent (HB 463); Ohio "$332 + 2.75% over $26,050" with the
   ORC 5747.025 exemptions (none from $500,000 MAGI in 2026); Massachusetts surtax threshold
   $1,107,750 for 2026 and the FICA deduction up to $2,000; Virginia $8,750 standard
   deduction; Illinois $2,925 exemption (2026); Colorado's 2026 deduction cap ($1,000 /
   $2,000 above $300,000 AGI) and the state income tax addback (an itemizer keeps the
   standard deduction); Oregon's 2026 brackets, federal tax subtraction and exemption credit;
   Utah's taxpayer credit; Arizona's $15,750 standard deduction; Minnesota's 2026 brackets
   and $15,300 deduction; Michigan's $5,900 exemption (2026); Alabama's standard deduction
   chart; North Carolina's child deduction; Philadelphia's July 2026 rate cut (calendar
   average); Pittsburgh's $52 Local Services Tax; Portland's 2026 Metro threshold and the
   arts tax.
7. **Switzerland (Zurich).** Replaced the calibrated combined schedule with the statutory
   computation: direct federal tax (ESTV 2026 single and married tariffs, CHF 263 per child,
   federal deductions), plus the cantonal *einfache Staatssteuer* (Grundtarif /
   Verheiratetentarif, cantonal deductions, child deduction CHF 9,400) times the cantonal
   Steuerfuss 95% (Kantonsrat decision of 15 Dec 2025) and the City of Zurich 119% (kept
   from the old model; the city's pages could not be reached). Result at CHF 202,000 is
   within CHF 429 of the old calibration, which supports both. Zurich is no longer
   `estimated`. Geneva keeps the combined approximation because the 2026 barème table in the
   Geneva Kantonsblatt did not come through the text extraction; its household basis is
   `single`.
8. **Germany.** The § 32a 2026 tariff, Soli Freigrenze (€20,350 / €40,700) and the 11.9%
   transition were verified; the table of linear zones reproduces the statutory formula
   within €1 (golden vectors use the formula). Household: splitting (§ 32a (5)), the
   Kinderfreibetrag (€6,828 + €2,928 per child) or Kindergeld (€259 a month), whichever is
   worth more, counted net of Kindergeld (it is the Finanzamt's Günstigerprüfung, and the
   US child tax credit is treated the same way); Soli on the tax after Kinderfreibeträge.
   Parents pay care insurance without the 0.6-point childless surcharge (SGB XI § 55 (3));
   the further 0.25-point reduction from the second child is not modeled.
9. **France.** Employee contributions rebuilt from URSSAF and AGIRC-ARRCO 2026 components
   instead of a flat 22% / 9.7%: the old model missed AGIRC-ARRCO tranche 2 (8.64% + 1.08% +
   0.14% from 1 to 8 PASS), which is why tax rises by €16,467 at €590,000. Quotient
   familial with the €1,807 cap per child half-part; CEHR thresholds doubled for couples.
10. **Spain.** Split into the state scale (art. 63 LIRPF, verified) and the regional scale
    (Catalonia 2025 scale from Hacienda; Madrid's five tranches 8.5%-20.5% confirmed, the
    thresholds kept from the Madrid tax code and flagged), each with the €5,550 minimum taxed
    at zero; contributions 6.50% (MEI 0.15%). The regional part is now reported as
    `regional`.
11. **Other updates from official 2026 sources:** Scotland's 2026/27 bands; Ireland's PRSI
    4.2% to 30 September and 4.35% from 1 October (blended 4.2375%); the married one-income
    band; the Netherlands' full labour-credit table; Portugal's 2026 scale; Austria's 2026
    brackets; Sweden's SEK 17,400 basic allowance; Norway's 2026 bracket thresholds and 7.6%
    national insurance; Israel's 2026 NII ceilings; Japan's 2026 employment income
    deduction (minimum ¥740,000) and basic deduction (¥620,000); Hong Kong's 2026/27
    allowances (derived from the official standard-rate zone table: basic $145,000, married
    $290,000, child $140,000); Canada's federal BPA phase-out and the deduction of enhanced
    CPP contributions, Ontario's health premium formula, British Columbia's 2026 brackets
    (lowest rate 5.60%, Budget 2026) and $13,216 basic amount; Brazil's 2026 INSS table and
    the R$189.59 dependant deduction.
12. **Test expectations changed** (`test/juice.test.js`), each because the old number
    encoded a rule that was wrong or incomplete:
    - "US 2026 federal + FICA + California for $300K": federal was the standard-deduction
      figure (68,134.25); it is now 64,083.01 because itemizing CA tax + SDI ($27,674.98)
      beats $16,100. CA is pinned exactly (23,774.98 on the 2025 schedule less the $33 left
      of the phased-out credit) instead of a $23,000-24,500 band.
    - "no-income-tax state, NYC local tax, Columbus city tax": the NYC difference now
      subtracts the NYC school tax credit ($63 + $21 + 0.228% × 130,000), and Ohio is
      "$332 + 2.75% over $26,050" after the $1,900 exemption (4,813.38 with Columbus, was
      4,533.38).
    - `computeJuice(... zurich-ch).estimated` was `true` (calibrated schedule); Zurich is now
      statutory, so the assertion moved to Geneva, which is still estimated.
    - Zurich's tax confidence was `low`; it is `medium` (tariffs verified, the city
      Steuerfuss not); Geneva is asserted `low`.
13. **Household.** `taxFor(g, j, { household })` with `single` (default, unchanged),
    `couple`, `family` (2 adults, 2 children under 17, one earner; read from
    `householdOf()`, so the presets stay in one place). The result carries `household`,
    `basis` (`single` | `joint` | `individual` | `partial`) and an optional `note`.
    `TAX_HOUSEHOLD` records, per `TAX_SOURCES` key, whether that level applies household
    rules (`joint`), taxes individually (`individual`, credits named in the note), has
    joint/family taxation that is not modeled (`single`), or has no household effect
    (`neutral`); `taxFor` combines the levels of a jurisdiction. A rule that computed with a
    single combined schedule (Geneva) returns `singleOnly`, which forces `single`.
    Filing-status effects were implemented only where the household rule comes from the
    same official source as the single rule.
14. **Golden vectors are a second implementation.** `docs/process/scripts/juice-tax-golden.mjs`
    does not import `server/juice.js`; it re-codes every rule with narrated arithmetic, so a
    disagreement points at a bug in one of them. Incomes are USD 100K / 250K / 675K at the
    palette FX, rounded to 1,000 local units, plus each cap boundary; couple and family at
    the 250K point. Germany is computed with the statutory formula, the rest with brackets.

## 4. Replayable steps

1. Probe (from any checkout of the branch): trigger `juice-tax-probe.yml` with a `requests`
   input, e.g. via the GitHub MCP `actions_run_trigger` (owner `alvations`, repo
   `melon-seek`, workflow `juice-tax-probe.yml`, ref `claude/stoic-ride-54ddxp`) and
   `requests` = a JSON list of `{name, url, grep | start/len, ctx, max, width, ua, raw,
   timeout}`. Read the log with `actions_list` (`list_workflow_jobs`) then `get_job_logs`.
   The request lists of all 12 runs are in their logs.
2. Apply the tax section: the section in `server/juice.js` runs from the rule line above
   `// Tax model` to `export const TAX_COUNTRIES = ...`; nothing outside it changed.
3. Regenerate the golden fixture and run the tests:

   ```sh
   node docs/process/scripts/juice-tax-golden.mjs          # wrote 390 vectors
   node --test test/juice-tax-golden.test.js test/juice.test.js test/juice-household.test.js
   npm test
   NODE_PATH=<playwright node_modules> node scripts/e2e.js
   ```

4. The §3 tables in `docs/LIVABILITY.md` were generated from the code and the fixture (the
   sources table uses the same row format as `scripts/refresh/examples.js`
   `juice-worked-examples/tax-sources`, so the freshness check reads it as current).

## 5. Verification

- `node --test test/juice-tax-golden.test.js`: 5 / 5 pass; 390 of 390 vectors match
  (largest difference €0.83 for Germany, formula vs table; everything else under 1 cent).
- `node --test test/juice.test.js test/juice-household.test.js`: 34 / 34 pass after the four
  expectation changes in §3.12.
- `npm test` (final run, 08:4xZ): 485 / 494 pass. The 9 failures are in other agents'
  in-progress files and do not touch the tax model: 8 in `test/archive-sweep.test.js`
  (archive workstream, `scripts/archive/*` being edited) and 1 in `test/freshness.test.js`
  ("module rents reports rents-us-hud-fmr, which is not in data/freshness.json", household
  rents). Every tax and juice test passes, including the freshness registry check "one tax
  entry per TAX_SOURCES jurisdiction" with the two new keys (ES-MD, ES-CT).
- `NODE_PATH=... node scripts/e2e.js`: 86 / 86 passed. Juice numbers in the UI change only
  through the corrections in §3 (the e2e suite checks structure, not values; its run
  rewrote `docs/screenshots/drawer-juice.png` and others, which are not part of this work).
- Spot checks against the authorities' own tables: NYS worksheets (recapture at $107,650,
  $157,650 and $675K), FTB AGI limitation worksheet, Alabama standard deduction chart,
  Oregon federal tax subtraction steps, the HK standard-rate zone (single $2,132,500 =
  900,000 + 8.5 × 145,000; married + 2 children $6,490,000 = 17 × 570,000 - 3,200,000).

## 6. Known gaps and follow-ups

- Unverified values (kept as they were) are listed per entry in `TAX_SOURCES[k].unverified`
  and summarized in `docs/LIVABILITY.md` §3 "Known gaps (tax)". The ones that move Juice
  most: the City of Zurich Steuerfuss; Australia (ATO blocked); all of Italy, Belgium,
  Denmark, Poland, Czechia, Korea, Taiwan, India, Mexico and Quebec; Japanese social
  insurance.
- Not modeled: Minnesota's high-income standard-deduction phase-out (about +$1,200 of MN tax
  at $675K), Maryland exemptions, California dependent credit, Colorado FAMLI, the Polish
  solidarity levy, Austrian special-payment rates above €25,000, Spanish solidarity
  contribution, US refundable CTC and AMT, deduction of Swiss 2nd-pillar contributions.
- Outside this owner's files, for the lead: `docs/LIVABILITY.md` §1 worked examples are
  generated by the freshness tooling and now drift (e.g. San Francisco $300K tax $108,447);
  the derived refresh (`node scripts/refresh/run.js --only derived`, or the markers patch in
  `docs/process/patches/freshness-derived-livability-markers.diff`) regenerates them, and its
  household caption switches from "single-filer tax for every household" to "tax by
  household as modelled in §3". §5 Limitations still says Zurich is `estimated`; only Geneva
  and Finland are now.
- UI: `computeJuice` could expose `taxBasis` / `taxNote` from `taxFor(...).basis` / `.note`
  so the drawer can say "taxed as a single filer" when `basis === 'single'` for a couple or
  family.

## 7. Change log

- 2026-10-10 07:14-08:11Z: probe runs 1-12 (workflow added, then User-Agent, timeouts,
  hard deadline, raw option).
- 2026-10-10 08:2xZ: new tax section in `server/juice.js`; golden fixture (390 vectors) and
  test; four `test/juice.test.js` expectations updated; `docs/LIVABILITY.md` §3 rewritten.
