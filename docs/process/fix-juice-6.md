# Process log: fix-juice-6 (Juice words, tax row names, Monthly memory, jargon tips)

## State

- **Done, sent to the lead.** Rebased onto e77cd41 (fix-salary-6). J-1 to J-5 fixed and tested: red then green (§5),
  after screenshots, npm test 0 fail, the related e2e groups green apart from one fix3-data test that is not this lane's (§6).
- **In progress:** none. **Next:** whatever the lead sends.
- Heavy jobs: `bash <scratch>/fj6/scripts/{e2e,build,npmtest}.sh <log name> ...` (each wraps `<scratch>/heavy.sh`).

## 1. Brief

[prompts/fix-juice-6.md](prompts/fix-juice-6.md). Fix the words of the drawer's Juice section found by persona wave 2 (J-1 to
J-4) and the card grade's place (J-5, from the lead), with a red test per ID first, keeping every tax number unchanged.
Files: `public/features/juice-drawer.js` (new, pure), the Juice parts of `public/app.js` (`juiceBlock`, `HOUSEHOLDS`,
`juicePeriod`, `juiceBadge`, `locSummary`, the Juice filter's grade tips), the view switch's tips in `public/index.html`,
the edge chips' words in `public/viz/chart.js` (text only), `test/fix-juice-6.test.js`, `test/e2e/fix-juice-6.e2e.js`
and its registration in `scripts/e2e.js`, one expectation in `test/e2e/fix-app.e2e.js` ([P-15], whose words J-2 replaces).

## 2. Inputs and sources

- docs/CONTRACT.md: `job.juice` (`best.taxParts`, `taxBasis`, `inputs.tax.jurisdiction`), the Juice and drawer sections.
- docs/METHODOLOGY_GUIDE.md §3 (tax model: income, regional, social; "For a Couple or a Family, we assume one person earns
  the whole salary") and §4 (households).
- server/juice.js: `RULES` (what each part holds per country), `TAX_HOUSEHOLD` (joint / individual / single per level),
  `taxKeys`, `computeJuice` (`taxParts`, `inputs.tax`), `attachJuice` (`byLocation`, the best place). Read only.
- data/cities.json: every city's `tax` jurisdiction (89 cities, 33 countries; the key's last part is the country).
- docs/process/PLAYBOOK.md (Checkpoints, Known traps), TEMPLATE.md, lead.md from "Fix wave 5" on.
- The persona wave-2 logs (35-44, 25-34, 55-plus; 45-54 for J-5) and their screenshots in the lead's integration worktree.
- test/e2e/fix-phone-text.e2e.js (`scanText`, `CAPTION_SEL`), test/e2e/phone-sizes.mjs, public/viz/note.js (`fitLine`).

## 3. Decisions and rationale

1. **The words live in one pure module, `public/features/juice-drawer.js`.** app.js renders them; the unit tests and the
   e2e test read the same module, so a test checks the rule rather than a copy of a string. server/juice.js is untouched
   (the tax arithmetic is not this lane's, and nothing there names a row).
2. **J-1, one line per tax part.** At 280 px the Tax row's detail column is 128 px (12 px text, about 24 characters), so
   three named parts can never share one line; at 1280 px it is 383 px. Each part is its own line ("federal income tax
   $3,150", "provincial tax $2,010", "CPP and EI $340"), and `fitLine` picks the first of its names that fits
   ("prov. tax", "NI", "FICA", "payroll tax"). Names, per server/juice.js `RULES`:
   - US: federal income tax; state or local tax (kept, as the brief says); Social Security and Medicare, plus the state's
     payroll contributions where the rule has them (CA SDI, NY paid leave and disability, WA Cares and paid leave, MA and
     MN paid leave, Paid Leave Oregon, PA unemployment);
   - Canada: federal income tax, provincial tax, CPP and EI (Quebec: Quebec income tax; QPP, QPIP and EI);
   - UK: income tax (Scottish income tax in Edinburgh), National Insurance (NI); Ireland: income tax and Universal Social
     Charge, PRSI; Germany: income tax and solidarity surcharge, social insurance; France: social contributions, CSG and
     CRDS; Netherlands: income tax and national insurance (Box 1 holds both); Spain: state and regional income tax,
     Social Security; Italy: income tax (IRPEF), regional and municipal surcharges, INPS social security; Switzerland:
     federal income tax, cantonal and communal tax, AHV, unemployment and accident insurance (Geneva's combined schedule:
     federal, cantonal and communal tax); Sweden: state income tax, municipal tax after the job tax credit; Denmark:
     state income tax, municipal tax, labour market contribution; Norway: income tax and bracket tax, national
     insurance; Japan: resident tax; Korea: local income tax; India: professional tax; Australia: Medicare levy; New
     Zealand: ACC earners' levy; Israel: National Insurance and health tax; Poland: PIT, ZUS and health insurance;
     Mexico ISR and IMSS; Brazil IRPF and INSS; Hong Kong salaries tax. Belgium's own term is social security.
   - The place: the best place's `inputs.tax.jurisdiction`, else the city record (`api.getCities`, already loaded for
     Juice), else the city key's last part.
3. **J-2, the household's tax line says what the country does, not "each person is taxed separately".** Per
   `TAX_HOUSEHOLD` basis: joint ("Germany splits the pay between the couple, which lowers the tax", "The US taxes a married
   couple jointly, which lowers the tax", "Joint filing and the child tax credit lower the US tax"); individual ("Canada
   taxes each person on their own pay, as if single"); not modelled ("Poland’s joint filing isn’t counted here, so taxed
   as if single"). Shorter forms down to "Taxed as if single" / "Taxed jointly" for 280 px. The household line under the
   buttons says the assumption plainly: "2 adults, 1 earner (the other not working), 2 bedrooms" (short "2 adults, 1
   working, 2 bedrooms"), and the buttons' tips no longer say "married, filing jointly" (true only in the US).
4. **J-3, Monthly/Yearly kept like the household:** `melon-seek.juicePeriod.v1` through app.js's `lsGet`/`lsSet` (the
   household's helpers, try/catch inside), and the same fallback: anything but year, month or term reads as Yearly.
   Fixed-term pay still never shows a year (`shownPeriod`).
5. **J-4, the grades say what they mean where they first show,** with no new control: the card badge's tip starts "42 ·
   Dry: a thin margin left (under $47K a year)", its accessible name says the meaning, the job page's score tip the
   same, and the Juice text adds "Dry means a thin margin is left". The Dry filter's tip says Rind is counted there. The
   view switch's tips are plainer ("Clusters: each bubble is a group of roles with about the same pay, and its number is
   how many roles it holds"). The edge chips' accessible name and hover tip say "2 roles paid below $50K, past the left
   edge of the chart". No native title on the chips: the chart's own tip already shows on hover, and a second one would
   cover it.
6. **J-5, the card names the graded place first.** The lead asked to prefer the card's place for the grade. The grade
   also drives the Juice sort, the Juice filter and the facet counts (`shownJuice`, owned by derive's lane), so grading
   the badge for another place than those use would show a "41 · Dry" card in a Ripe-filtered list sorted by its 63.
   Instead `locSummary` puts the graded place first among places of the same rank (pay places, the Location filter's
   places): Google's Key Account Executive now reads "Chicago, IL +1 · 63 · Ripe". Nothing is dropped or hidden. The
   badge's tip and accessible name lead with "63 · Ripe, for Chicago" on every posting with more than one place.
7. **Data notes for the lead (not changed):** Microsoft's "CE" in titles and Google's "IAM" tag on a controls technician
   are data (titles and keyword tags), left as posted.

## 4. Replayable steps

1. `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp` (fd9da2f).
2. Link the crawl: `ln -s <scratch>/wt-data2/data/snapshots data/snapshots`, the same for `data/beta/snapshots`, and
   `ln -s /home/user/melon-seek/node_modules node_modules`.
3. `node scripts/build-static.js` (about 7 minutes at load 7 to 19).
4. Red: `NODE_PATH=<scratch>/pw/node_modules node scripts/e2e.js --grep='fix-juice-6: \[J-'` on the base build: 0/16 pass.
   `node --test test/fix-juice-6.test.js` with the base app.js, index.html and chart.js: 4 of 9 fail.
5. Fix, rebuild, re-run.

## 5. Verification

- **Red, on the base (fd9da2f):**
  - test/fix-juice-6.test.js with the base app.js, index.html and chart.js: 4 of 9 fail (J-1's app wiring, J-2's
    household line, J-3, J-4); the 5 that pass test the new module alone.
  - e2e `fix-juice-6: [J-` on the base build: 0/16 pass. For example J-1 at 1280: "income tax $20,000 · state or local tax
    $11,800 · social security $4,100" for Toronto; J-2: "Family here means one earner; each person is taxed separately
    here." (2 lines at 1280); J-3: `melon-seek.juicePeriod.v1` never written; J-4: "the "🍉 42 · Dry" badge's tip doesn't
    start with what Dry means", Clusters/Ranges tips, the "‹2" chip "2 roles below $50K: …"; J-5: Netflix "Los Gatos, CA
    +3" graded for Seattle, Meta "Sunnyvale, CA +1" for Austin, NVIDIA "Santa Clara, CA +5" for Austin, Microsoft "United
    States +2" for Reston, Google "New York, NY +1" for Chicago.
- **Green, on 38fd2dd's build (rebased onto e77cd41):** e2e `fix-juice-6` 38/38 pass in 6 minutes (load 5.5 to 7.4): J-1, J-2
  and J-3 at 280x653, 375x812, 352x355 and 1280x800; J-4 and J-5 at 375x812 and 1280x800; "[phone]" at all 21 sizes of
  phone-sizes.mjs plus 1280x800, Ontario, New York and London, Monthly and Yearly.
- **Unit:** test/fix-juice-6.test.js 9/9; the Juice and tax tests (juice, juice-household, juice-tax-golden,
  refresh-tax) and freshness-policy: 84/84, unchanged by this lane.
- **npm test, CI-like** (clean checkout `<scratch>/fj6/clean` at a3a1cea, no data links, `MELON_BETA_SNAPSHOT_DIR=`):
  1,337 tests, 1,327 pass, 0 fail, 10 skipped, 85 s (load 5). On dfc3b4e before the rebase (load 24): 1 fail, the
  polite-spacing timing test, which passed alone.
- **Related e2e groups**, `^(?!fix-juice-6).*(juice|drawer|household|waterfall)` on a3a1cea's build: 135/137 pass, 1 skipped,
  1 fail: "fix3-data: [browser] lib/juice.js gives no Juice from another country's pay …", whose Cohere case "Head of
  Corporate Development" now has no `juiceMissing` (§6). The updated [P-15] (Fix app) and [BP-2] (Fix3 app) pass.
- **fix-phone-text's guard and Beta mobile QA 4**, `^(Fix phone text|Beta mobile QA 4)` on a3a1cea's build: 111/111 pass in 25
  minutes (load 1 to 8: timings are noise).
- None of S-3, S-6, PERF-1, V15 or T21 ran in these groups; the lead's batch gate runs them.
- **Screenshots** (docs/screenshots/fix-juice-6/, shrunk): `before-*` from the persona-wave build (cycle-beta7-dist,
  e800c43), `after-*` from this lane's build: Toronto and London families at 280x653, 375x812, 352x355 and 1280x800;
  Milan and Munich couples and a New York family at 280x653 and 1280x800; Google's Key Account Executive cards (J-5) at
  375x812 and 1280x800.

## 6. Known gaps and follow-ups

- **For the lead, not this lane's:** fix3-data's [browser] test fails on e77cd41's server/juice.js and salary rows, which this
  lane does not touch. Cohere's "Head of Corporate Development" (CA$ range tied to "Canada", US$ ranges tied to "United
  States", listed in United States / Canada / London, UK / Remote) gets no Juice and no `juiceMissing`: its posted places
  are country-only, with no city record, so attachJuice returns before saying why (DQ-27's rule), where the test expects
  `pay-other-country` for London. Owner: fix-salary-6 or fix-data-6 (attachJuice / the test).
- **Data, left as posted (J-4):** Microsoft's "CE" in titles and Google's "IAM" tag on a controls technician.

- The rent and living-cost lines under the waterfall ("everyday costs for two adults and two children, excluding rent")
  still wrap to 4 lines at 280 px; they are not this lane's IDs.
- The `TAX_HOUSEHOLD` notes in server/juice.js ("Canada taxes each person separately; …") still say "separately"; they
  show only in the tax line's hover tip after the new sentence.

## 7. Change log

- 2026-10-23 22:00 UTC: started on fd9da2f.
- 2026-10-24 00:30 UTC: resumed after the container restart; J-5 added by the lead.
- 2026-10-24 00:50 UTC: red tests (b60b702), fixes (dfc3b4e).
- 2026-10-24 01:05 UTC: paused by the lead (usage limit) after narrow forms for 280 px (c08bdc2).
- 2026-10-24 02:12 UTC: rebased onto e77cd41; rebuilt; e2e 38/38.
- 2026-10-24 04:37 UTC: resumed after a container restart; related groups and npm test done.
