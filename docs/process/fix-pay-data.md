# Process log: fix-pay-data

## 1. Brief
- **Prompt:** [`docs/process/prompts/fix-pay-data.md`](prompts/fix-pay-data.md) (verbatim).
- **Goal:** fix the persona-review pay-data findings P-1 (on-target earnings, server side), P-3 (level rules),
  P-8 (fixed-term pay), P-9 (geocoding) and P-17 (keyword tags) for target `stable`, and make sure the fixes
  reach users on the live browser path and in the static build before the next crawl. Two follow-ups from the
  lead came in during the work and are done here too: **P-9b** (Anduril "Alexandria, New South Wales", plus a
  count of centroid fallbacks) and **DQ-1** (Eightfold "City, Region, CC" strings filed in US states;
  `docs/process/data-check-beta.md`).
- **Files owned and changed:** `server/salary.js`, `server/keywords.js`, `server/geo.js`, `server/normalize.js`,
  `server/vet.js`, `scripts/vet-salaries.js`, `scripts/build-static.js` (a comment only; see "Delivery" in section 3),
  `docs/CONTRACT.md`, `docs/VETTING.md`, `docs/DATA_SOURCES.md`; new tests `test/fix-pay-data.test.js`,
  `test/e2e/fix-pay-data.e2e.js` (registered in `scripts/e2e.js`), `test/fixtures/keyword-labels.json`;
  re-baselined fixtures `test/fixtures/golden-normalize.json` and `test/fixtures/refresh/jobs/*`.
- **Not touched:** `public/**`, `scripts/build-market.js`, `scripts/methodology*.js`, `docs/QA.md`,
  `test/beta-data-check.test.js` (the data-check-beta lane's file). Two patches for other owners are in
  `docs/process/patches/` (section 6).

## 2. Inputs and sources
- `docs/CONTRACT.md` (Job and salary shape, module layout, the v3 seniority rules), `docs/strategy/ROADMAP.md` §8,
  `docs/process/PLAYBOOK.md`, `docs/process/TEMPLATE.md`.
- `docs/process/lead.md` ("Persona review of the main site") and `docs/process/persona-stable-*.md` with their
  screenshots: the repro for each finding.
- `docs/process/data-check-beta.md` DQ-1 and the red tests in `test/beta-data-check.test.js` (shared checkout,
  uncommitted, read only; the four DQ-1 tests were run against this worktree from a scratch copy).
- The 8 stable snapshots (`data/snapshots/*.json`, crawl of 2026-10-10) and the 5 beta snapshots
  (`data/beta/snapshots/*.json`), read through symlinks to the shared checkout (gitignored, not committed).
- `server/pipeline.js`, `scripts/build-static.js#readSnapshot`, `scripts/refresh/jobs.js`,
  `scripts/archive/ingest.js`: where stored snapshots are upgraded (`relocateJobs(rekeyBoardJobs(jobs).jobs)`
  when `normalizerVersion` differs).
- `server/lib-modules.js`: which server modules are copied to `dist/lib/` for the browser.
- No skills and no external documentation were used.

## 3. Decisions and rationale

### P-1 On-target earnings shown as base pay
- **Root cause:** `server/salary.js` had no notion of OTE. A range was `kind: 'salary'` (or `'hourly'`,
  `'stipend'`) whatever the posting said about commission, so the drawer said "Posted base pay" and the range was
  pooled with base pay.
- **Fix:**
  1. In the clause that holds the range: `evaluate()` sets `kind: 'ote'` when "OTE", "on-target earnings",
     "on target compensation/pay", "base + commission at target" or "commissions at target" stands right before
     the amount or after it on the same line (`server/salary.js:560`, the `OTE_BEFORE_RE` / `OTE_AFTER_RE` pair;
     the phrases also joined `PAY_RE`, so "On target compensation: $X–$Y" is a pay statement). "Base salary:
     $150,000 – $180,000. OTE: $300,000" keeps the base range as `'salary'`: the OTE word belongs to the other
     amount.
  2. About the range, elsewhere in the posting: `oteStatement(text, { salesRole })` (`server/salary.js:336`)
     finds a sentence that says the range is OTE ("The figure above represents On-Target Earnings (OTE)",
     Cohere). A conditional boilerplate ("For sales roles, the range provided is the role's On Target Earnings
     ("OTE") range", Anthropic) counts only when `salesRole` is true. `SALES_CONDITIONAL_RE` moved from
     keywords.js to salary.js (`server/salary.js:42`) and keywords.js imports it, because salary.js is in the
     static startup module graph and must not import keywords.js (the perf-mobile test keeps keywords lazy).
  3. A structured range's own label ("OTE" in a Greenhouse pay range title) counts too (`hasOte`,
     `server/salary.js:312`). `payTerms()` (`server/salary.js:440`) applies 2 and 3 to structured and text pay
     alike; `deriveSalary` and the snapshot relabel call it (`server/normalize.js:102`, `:137`).
  4. Sales titles: `isSalesTitle(title)` (`server/keywords.js:940`), from the existing `SALES_TITLE_RE`: Account
     Executive, Account Director/Manager, Sales …, BDR/SDR, Partner Sales. Not enablement, strategy,
     operations or Customer Success.
  5. A stipend is never OTE. An hourly sales range can be OTE (`originalInterval` stays `'hour'`).
- **Vetting:** `payKind` returns `'ote'`; the gate groups OTE with full-time salary for the low-side outlier
  rule (`server/vet.js:223`), so OTE is never quarantined for its kind.
- **Contract:** `docs/CONTRACT.md` "v4 additions"; `docs/VETTING.md` (kind row, OTE rule);
  `docs/DATA_SOURCES.md` §7a (On-target earnings row).
- **Count per company (stable, after the upgrade path):** Anthropic 46, Cohere 1, all others 0 (47 of 5,480
  postings). Beta: 0 (Google, Apple, Microsoft, NVIDIA and Netflix never say OTE).
- **Five real examples:**
  - anthropic:4423394008 "Growth Account Executive, AI Native", 222,800–290,000 USD.
  - anthropic:5077996008 "Mid-Market Account Executive, Tech", 290,000–380,000 USD.
  - anthropic:5237973008 "Enterprise Account Executive, Manufacturing", 280,000–330,000 GBP.
  - anthropic:5391504008 "Head of National Security Sales (DoW/IC)", 550,000–700,000 USD.
  - cohere:277827a9-02b7-49ca-8590-458e93cab0e6 "SVP Sales, EMEA", $285,000–$350,000 USD ("The figure above
    represents On-Target Earnings (OTE)").
- **Not labelled OTE, on purpose:** the other 46 paid postings in Anthropic's Sales department (Customer Success
  Manager, AI Outcomes Manager, Partnerships Lead, …). Their title is not a sales title, so the "for sales roles"
  sentence does not apply to them. Anthropic posts the same sentence on 565 postings, including research and
  engineering roles. Open question in section 6.

### P-3 Level rules
- **Root cause:** the Director+ rule matched any "director" in a title ("Account Director", "Federal Account
  Director", "Partner Director"), and the Staff+ rule read any "Fellow" as a distinguished/technical fellow.
- **Fix (`server/keywords.js`):**
  1. `NON_EXEC_DIRECTOR_RE` (`server/keywords.js:875`): "account(s) director", "partner director" (not "business
     partner director"), "client director" and "test director" are not Director+. A separate executive word in
     the title still decides ("VP, Account Directors" stays Director+).
  2. `SENIOR_FELLOW_RE` (`:879`): only "distinguished / technical / senior / principal / corporate / chief
     fellow" is Staff+.
  3. `FELLOW_RE` (`:880`): any other "Fellow" is a fixed-term fellowship and is filed Intern (with the
     internships, the closest existing level: fixed-term, programme pay, early career).
  4. 'Mid' stays the default for titles that name no level. No 'Mid' title rule was added.
- **Level counts, 8 stable snapshots (5,480 postings), before → after:** see section 5.
- **Every moved title** (64 postings, all checked by hand): 47 "Account Director …" / "Partner Director …"
  Director+ → Mid (OpenAI 45 incl. "Federal Account Director, National Security", Anduril 2 "Account Director,
  Maritime"); "Flight Test Director" (Anduril) Director+ → Mid; "Senior Staff Engineer, Test Director (R5446)"
  (Shield AI) Director+ → Staff+; "Conceptual Reasoning Fellow" (Anthropic) Staff+ → Intern; 14 Scale AI "…
  Fellow - Human Frontier Collective" postings (Legal, Finance, STEM, Medical, Machine Learning, SWE; US, UK,
  Canada) Staff+ → Intern. No title moved that should not have; "People Business Partner Director" and "VP,
  Account Directors" stay Director+.

### P-8 Fixed-term pay
- **Root cause:** the parser knew hour/day/week/month/year only. "$100,000–$167,000 USD for the four-month
  fellowship" was read as a yearly range, and nothing recorded how long a weekly stipend or an internship lasts,
  so Juice scored both as a full year.
- **Fix (`server/salary.js`):**
  1. Term pay: an amount followed by "for the four-month fellowship" / "over the 12-week internship"
     (`TERM_AMOUNT_AFTER_RE`, `server/salary.js:365`) is `interval: 'term'`, annualized × 52 ÷ the term's exact
     weeks (here × 3, 300,000–501,000 a year, matching the posting's own "equivalent to $300,000–$500,000 USD
     annualized"). `toJobSalary` keeps `originalInterval: 'term'`, `termWeeks` and the posted text
     (`server/salary.js:689`). A term without a stated length is not annualized (null).
  2. Programme length: `programTerm(text)` (`server/salary.js:412`) reads "12-week internship", "The program
     runs for 4 months", "16 to 24-week co-op", "for N months" in the pay sentence; months × 52 ÷ 12, rounded
     ("4 months" → 17). Never "within two weeks of your offer" or "6 weeks of paid vacation".
     `isFixedTermRole` (`:400`) limits it to internship, co-op, fellowship, residency and apprenticeship titles
     or employment types. `salary.termWeeks` (1–104) and `termWeeksMax` (a stated range) are set.
  3. The Fellows stipend keeps its weekly pay (3,850 USD a week) and gets `termWeeks: 17`.
- **Vetting:** term pay is not flagged `junior_high` (`server/vet.js:145`); `scripts/vet-salaries.js:247` divides
  by 52 ÷ termWeeks for `interval_suspect`.
- **Counts (stable):** termWeeks on 28 postings (Anduril 19, Anthropic 4, Shield AI 4, Palantir 1); term pay on 1
  (Conceptual Reasoning Fellow). Juice and the card label are frontend work (lead decision 4); the drawer label
  for 'term' needs a frontend patch (section 6).

### P-9 Locations (Victoria BC, Winnipeg, Halifax; lead follow-up: Alexandria NSW; DQ-1)
- **Root cause, Victoria:** a bare "Victoria" resolved to the Australian state before the city in British
  Columbia, and the job's other locations were never consulted. Winnipeg and Halifax were not in the gazetteer.
- **Fix, Victoria:** `geocodeMany(inputs)` (`server/geo.js:966`) geocodes all of a job's location strings together;
  a bare name with readings in several countries (`bareReadings`, `:754`) takes the reading in a country the
  other locations name ("Canada | Calgary | Toronto | Victoria" → Victoria, BC), else its default.
  `normalizeLocations` calls it. Winnipeg (MB), Halifax (NS), Victoria (BC) and the MB/SK/NS/NB/TAS regions are
  in the gazetteer.
- **Root cause, Alexandria:** the gazetteer had no Sydney suburbs, so "Alexandria, New South Wales, Australia"
  fell back to the NSW centroid (-31.84, 145.61) and the map showed it as a separate place.
- **Fix, Alexandria:** Alexandria, Penrith, North Sydney and Parramatta are aliases of Sydney (`server/geo.js:462`);
  "Alexandria, VA" and a bare "Alexandria" stay in Virginia (`pickCity` prefers the stated region).
  `locationPrecision(loc)` (`:943`) reports 'city', 'centroid', 'region', 'country', 'remote' or 'unknown' for the
  count below.
- **Root cause, DQ-1:** `regionInfo()` read any two-letter capital token as a US state first, so the final ISO
  country code of Eightfold's "City, Region, CC" (Microsoft, NVIDIA) became Indiana, Illinois, Delaware, Idaho or
  California, and codes with no alias (NO, BR, SA, BE, ES as a bare string) were nothing.
- **Fix, DQ-1 (`server/geo.js`):**
  1. `finalCountry()` (`:797`) reads the last token as the ISO country when the shape says so: a gazetteer city in
     that country ("Bengaluru, KA, IN", "Jakarta, ID", "San José, San José Province, CR"), a non-US subdivision
     before it ("Tel Aviv District", "KA"), a third part ("Stavanger, Rogaland, NO"), or a region of that country
     as the first part ("ON, CA"). A US "City, ST" keeps its state ("Boise, ID", "Columbus, IN", "Aliso Viejo, CA"),
     and so does a city the gazetteer knows elsewhere ("Adelaide, SA" stays in Australia).
  2. A stated non-US country drops the US-state readings before it ("Middenmeer, NH, NL" is North Holland).
  3. A bare ISO code is a country (`:821`): "DE", "IN", "IL", "CA" are Germany, India, Israel and Canada. Only
     Eightfold writes bare codes in the 13 snapshots (Microsoft, NVIDIA; xAI writes "US").
  4. "Barcelona, CT", "Madrid, MD", "Zaragoza, AR": a city known only outside the US whose own region's ISO
     3166-2 code is also a US state's (Catalonia, Madrid, Aragon; `:847`, regions at `:101`). "Dublin, CA" and
     "Vienna, VA" stay in the US.
  5. "BG, RS" is Serbia, not Bulgaria: a first token naming another country does not win over the stated one.
  6. Gazetteer: Costa Rica, Armenia, Kuwait and Croatia; San José (CR, not the default), Brasília, Yerevan, Jeddah,
     Dammam (Dhahran, Khobar), Kuwait City, Stavanger, Zagreb, Cologne, Zaragoza; Zaventem → Brussels; São Paulo
     State.
- **Also fixed on the way:** "Springfield, IL, US" went to Springfield, VA (`pickCity` matched the country while a
  state was stated, `:730`); "Bengaluru, KA, IN" style strings (fixed in the first P-9 pass, finished by DQ-1).

### P-17 Keyword tags
- **Root cause:** the skill lexicon matched words in other senses: "CAD" in "4,300 CAD per week", "mechanisms" in
  "VAT mechanisms", "autonomy" in "ownership and autonomy", "AI/ML" in "AI/ML companies", "embedded" in
  "embedded within our legal team", and TypeScript led a designer's card because it was mentioned as a
  nice-to-have.
- **Fix (`server/keywords.js`):**
  - CAD (`:536`): not after an amount or a currency, not before an amount, rate or "per".
  - Mechanical design (`:534`, title rule `:711`): "mechanical design", or "mechanical engineering" outside a
    degree list and not "mechanical engineering teams"; "mechanisms" counts only in a title.
  - Autonomy (`:524`, list items `:707`): only technical uses ("autonomy software/stack/systems", "drone
    autonomy", "autonomous systems/vehicles"); a list item ("networking, autonomy, robotics") only on a technical
    title (`isTechnicalTitle`, `:699`).
  - Machine learning (`:437`, `:706`): "AI/ML" counts only on a technical title and not as an adjective of a
    business noun ("AI/ML companies", "AI/ML concepts"), nor after "interest in" / "passion for".
  - Embedded (`:509`): "embedded" followed by a technical noun (systems, software, Linux, firmware, C, …) or
    "edge/firmware/real-time … embedded"; the title rule (`:712`) keeps "Embedded Engineer".
  - TypeScript (`:391`) stays a tag; `orderSkills` (`:738`) moves skills mentioned only in a nice-to-have sentence
    to the end, so a designer's card leads with Figma and UX research. Otherwise the lexicon order is unchanged
    (an existing test expects Python before PyTorch).
- **Labelled sample:** `test/fixtures/keyword-labels.json`: for each label, the postings that carried it with the
  norm-5 lexicon, split into "removed" (the new patterns drop it) and "kept"; 25 removed (all 6 for CAD) and 15
  kept per label, spread deterministically, judged by hand from the matched contexts. Precision is estimated per stratum and
  weighted by stratum size. Table in section 5.

### Delivery
- **Live browser path:** `server/salary.js`, `keywords.js`, `geo.js`, `normalize.js` are copied to `dist/lib/` and
  the browser normalizes live boards with them (e2e `[browser]` test checks `dist/lib/normalize.js`).
- **Static build and server:** both read stored snapshots through `relocateJobs(rekeyBoardJobs(jobs).jobs)` when a
  snapshot's `normalizerVersion` differs from `NORMALIZER_VERSION`. Before this lane that upgrade re-geocoded
  locations and re-keyed tags but kept the stored salary and seniority. Now `NORMALIZER_VERSION` is `'norm-6'`
  (`server/normalize.js:24`) and `relocateJobs` ends with `relabelJobs()` (`:147`, `:232`), which re-derives
  `salary.kind`, `termWeeks`/term pay and the level from the stored text and title. So the deployed bundle shows
  the fixes before the next crawl, with no change to `scripts/build-static.js` beyond a comment (`:878`).
  `relabelSalary` re-parses a stored text salary only when `mayRelabelPay(text)` (`server/salary.js:373`) finds
  term-pay or OTE wording, so the upgrade stays cheap for the thousands of beta postings that have neither.
- **Cost:** a cold server (no stores yet) now upgrades every norm-5 snapshot once on first load, as after any
  normalizer bump: about 15 s of worker CPU for Anduril, 13 s of it the existing `rekeyBoardJobs` (needed for
  the P-17 tags). Stores persist, and the next crawl writes norm-6 snapshots.
- **Archive:** the next crawl writes norm-6 snapshots, so the archive will store new versions of the affected
  postings (append-only; expected).

## 4. Replayable steps
1. `ln -s /home/user/melon-seek/node_modules node_modules`; `mkdir -p data && ln -s /home/user/melon-seek/data/snapshots data/snapshots`;
   for beta checks `mkdir -p data/beta && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots`
   (remove this link before `npm test`: with 5 big beta snapshots present, the static-build unit tests time out).
2. Base copies for before/after, made before any edit: `git archive HEAD | tar -x -C <scratchpad>/fix-pay-data/base-tree`
   (HEAD = a9a46a7; with the node_modules and data/snapshots links, built there with `node scripts/build-static.js`)
   and a copy of `server/` and `scripts/` in `<scratchpad>/fix-pay-data/base` for the measurement scripts.
3. Tests first: `node --test test/fix-pay-data.test.js` on the base code (a copy in `base-tree/test/`): 15 of the
   16 tests then in the file were red; the vet-gate test ("never quarantines OTE for its kind") was already green,
   it guards the new kind. `node scripts/e2e.js --grep=fix-pay-data` on the base build: 0/4. The three location
   tests added for the lead's follow-ups (Alexandria, ISO final codes, DQ-1) encode strings the base geocoder
   misplaces (section 5, country counts).
4. Fixes as in section 3. Golden re-baseline after checking that only the intended fields moved:
   `UPDATE_GOLDEN=1 GOLDEN_REASON="norm-6: pay labels, levels, locations, tags (fix-pay-data)" node --test test/golden-normalize.test.js`.
   Refresh fixtures regenerated with `node test/fixtures/refresh/jobs/make-fixtures.mjs` (version norm-6).
5. Measurements (scratch scripts in the scratchpad `fix-pay-data/scripts/`): `compare.mjs` (stable before/after of
   the upgrade path: OTE, term, levels, locations, tags), `beta-ote.mjs`, `beta-term.mjs`, `kwstrata.mjs` and
   `build-labels.mjs` (labelled sample), `centroids.mjs` (centroid count), `countries.mjs` (DQ-1 country counts),
   `countrymoves.mjs`, `moves-by.mjs`, `shapes.mjs` (location string shapes), `dq1.test.mjs` (the four DQ-1 tests
   of `test/beta-data-check.test.js`, imports pointed at this worktree).
6. `npm test`; `NODE_PATH=<scratchpad>/pw/node_modules node scripts/e2e.js`; timing tests again alone.
7. Screenshots: `node scripts/build-static.js` (worktree `dist/`), base build in `base-tree/dist`; serve both with
   `PORT=5411 node base-tree/scripts/cycle/serve.mjs --dist base-tree/dist --pid <scratchpad>/fix-pay-data/serve-before.pid`
   and `PORT=5412 node scripts/cycle/serve.mjs --dist dist --pid <scratchpad>/fix-pay-data/serve.pid`;
   `NODE_PATH=… node shots2.mjs docs/screenshots/fix-pay-data`; stop with `kill "$(cat <pid file>)"`;
   `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-pay-data`.

## 5. Verification

**Tests**
- `npm test`: 620 tests, 619 pass, 1 fail. The failure is "local beta data is gitignored" (`test/cycle.test.js`):
  `git check-ignore` refuses `data/snapshots/anthropic.json` as "beyond a symbolic link", because this worktree's
  `data/snapshots` is the symlink the wave setup asks for. It fails the same way on the base commit (base: 601
  tests, 599 pass, the same failure plus V15). In an earlier full run under load (load average 10 on 4 cores),
  PERF-1 and V15 also failed; both pass when run alone (`node --test test/perf.test.js`, V15 alone).
- `test/fix-pay-data.test.js`: 19/19.
- The four DQ-1 tests of `test/beta-data-check.test.js`, run against this worktree from a scratch copy: 4/4
  pass; 4/4 fail against the base code. The other DQ tests in that file are not this lane's (DQ-3, DQ-5/6, DQ-17
  left for the next wave).
- Full e2e (`NODE_PATH=… node scripts/e2e.js`), final code (commit 1ee82da): **105/108 passed, 1 failed, 2
  skipped**.
  - "API: /api/jobs?company=anduril returns valid Job[]" fails on the base too (anduril:5243013007, a JPY range
    20,454,000–30,680,000 read as implausible).
  - Compstimate T21 (cold server, a timing test) passed in this run (28.6 s). In an earlier full run on a busy
    machine it failed, and alone it took 31.4 s; the base takes 11.1 s, because on a cold cache the server now
    upgrades each stored norm-5 snapshot once (rekey + relocate + relabel: about 15 s of CPU for Anduril's 2,491
    postings, 13 s of it the existing `rekeyBoardJobs`). Stores persist after the first load, and the next crawl
    writes norm-6 snapshots, which need no upgrade.
  - Base e2e: 101/104 passed, 1 failed (the same Anduril test), 2 skipped.
  - The 4 lane e2e tests (`test/e2e/fix-pay-data.e2e.js`): 4/4 after, 0/4 on the base build. They cover the
    server (upgraded snapshots), the static main and beta bundles (re-derived from stored snapshots, including
    DQ-1: no "City, Region, CC" or bare "CC" with a non-US code is filed in the US), and the browser's
    `dist/lib/normalize.js` on a live-board fixture.

**Measurements (stable: 8 snapshots, 5,480 postings, through the upgrade path the build and server run)**

| Level | Before | After |
|---|---|---|
| Intern | 93 | 108 |
| Entry | 129 | 129 |
| Mid (level not stated) | 2,653 | 2,701 |
| Senior | 1,362 | 1,362 |
| Staff+ | 565 | 551 |
| Manager | 409 | 409 |
| Director+ | 269 | 220 |

- OTE: 47 postings (Anthropic 46, Cohere 1). Term: `termWeeks` on 28 (Anduril 19, Anthropic 4, Shield AI 4,
  Palantir 1); term pay on 1 (Conceptual Reasoning Fellow: 100,000–167,000 USD for the term, 300,000–501,000 a
  year). No posting changes quarantine state; the only salary numbers that change are the Conceptual Reasoning
  Fellow's.
- Beta (same path): OTE 0 everywhere; `termWeeks` Google 20, Microsoft 11, NVIDIA 14, Netflix 1, Apple 0; level
  moves 6 (Microsoft: 5 "… Account Director …" Director+ → Mid, "Research Fellow" Staff+ → Intern).

**P-17 labelled sample** (`test/fixtures/keyword-labels.json`; 40 postings judged per label)

| Label | Postings before → after | Sample: removed FP / TP | Sample: kept FP / TP | Est. precision before → after |
|---|---|---|---|---|
| Machine learning | 885 → 762 | 25 / 0 | 5 / 10 | 57% → 67% |
| Mechanical design | 847 → 264 | 24 / 1 | 3 / 12 | 25% → 80% |
| Embedded | 594 → 437 | 25 / 0 | 1 / 14 | 69% → 93% |
| Autonomy | 1,224 → 948 | 24 / 1 | 4 / 11 | 57% → 73% |
| CAD | 517 → 511 | 6 / 0 (all 6 removed) | 0 / 15 | 99% → 100% |

TypeScript stays on 333 postings; it moves behind the other skills when the posting mentions it only as a
nice-to-have. The existing keyword tests stay green.

**Locations, across the 8 stable and 5 beta snapshots (33,240 location entries on 20,442 postings)**
- Region or country centroid fallbacks: **5,241 locations on 4,054 postings before, 1,153 on 799 after**; unknown
  (no coordinates): 180 → 71.
- Top 10 before, by posting count: Beaverton, Oregon (Apple) 341; San Francisco Bay Area (Apple) 332;
  Bengaluru, KA, IN 315 (filed in Indiana); Yokne'am Illit, North District, IL 313 (Illinois); Tel Aviv-Yafo, Tel
  Aviv District, IL 237 (Illinois); Memphis, TN (xAI) 165; Ashville, Ohio (Anduril) 148; Culver City (Apple) 147;
  Southaven, MS (xAI) 126; Taipei City, TW 108.
- Top 10 after: ב"ש, South District, IL 31; Klang Valley-MY 21; Beaumont, California 18; Vancouver, Washington
  17; Xi’an-CN 13; ק"א, Haifa District, IL 13; Beaufort NC, Bourbonnais IL, Bridgewater NJ, Clermont FL 10 each.
- Anduril "Alexandria, New South Wales, Australia" (13 postings): Sydney (-33.87, 151.21), one place with Sydney.
- Country changes: 1,669 location entries on 1,107 postings change country (US → Israel 730, US → India 672, US
  → Germany 107, unknown → Spain 34, US → Spain 22, …). In the 8 stable snapshots only Cohere (Victoria, Winnipeg,
  Halifax), Scale AI (Saudi Arabia, Uruguay) and Shield AI (Wichita, Lviv, The Hague) move.

**DQ-1: NVIDIA and Microsoft, postings per country** (a posting counts once per country among its locations)

| Country | NVIDIA before | NVIDIA after | Microsoft before | Microsoft after |
|---|---|---|---|---|
| United States | 2,123 | 1,403 | 1,518 | 1,188 |
| Israel | 0 | 420 | 0 | 23 |
| India | 0 | 239 | 0 | 227 |
| Germany | 4 | 56 | 0 | 26 |
| Spain | 0 | 12 | 0 | 22 |
| Canada | 6 | 9 | 46 | 47 |
| Netherlands | 7 | 7 | 11 | 21 |
| Indonesia | – | – | 16 | 21 |
| Brazil | 1 | 1 | 17 | 24 |
| Mexico | 0 | 4 | 19 | 22 |
| Belgium | – | – | 9 | 13 |
| Norway | 0 | 1 | 3 | 8 |
| Saudi Arabia | – | – | 2 | 5 |
| Costa Rica | – | – | 0 | 3 |
| Kuwait | – | – | 0 | 3 |
| Armenia | 0 | 3 | – | – |
| Italy | 0 | 3 | 7 | 7 |
| No country | 26 | 3 | 53 | 0 |

NVIDIA: 734 postings have a location whose country changes, 719 of them had it in the US (the data check counted
735 and 720). Microsoft: 349 and 313 (the data check: 365 and 318; postings whose wrong copy now merges with an
identical right one, such as "Jakarta" plus "Jakarta, ID", are counted once). NVIDIA's US count, 1,403, is the
data check's corrected figure; Microsoft's, 1,188, is three above its 1,185. Smaller Microsoft moves: Chile 3 → 1
("Santiago de Querétaro, Qro., MX" was Santiago, Chile), Bulgaria 2 → 0 ("BG, RS" is Serbia), and Portugal,
Latvia, Lithuania, Croatia and Serbia placed for the first time.

**Screenshots** (`docs/screenshots/fix-pay-data/`, each `-desktop-` 1440x900 and `-phone-` 390x844, `-before`
from the base build and `-after` from this worktree's build; main site and `/melon-seek/beta/`):
- `p8-p3-anthropic-fellow-cards`, `p8-p3-conceptual-reasoning-fellow-drawer`: the Conceptual Reasoning Fellow
  reads $300K–501K annualized "from term pay ($100,000–$167,000 USD for the four-month fellowship)", level Intern
  (was $100K–167K a year, Staff+).
- `p3-openai-account-director-cards`: Account Directors no longer Director+.
- `p17-palantir-designer-cards`: designer cards lead with Figma / UX research, not TypeScript.
- `p9-cohere-annotation-drawer-locations`: Victoria and Halifax under Canada.
- `p9-anduril-alexandria-drawer-locations`: Alexandria is Sydney.
- `p9-beta-nvidia-israel-drawer-locations`, `p9-beta-microsoft-india-drawer-locations`: Israel and India, not
  "Hyderabad, IN · United States".
- `dq1-beta-microsoft-barcelona-drawer-locations` ("Barcelona, CT · United States" and "ES" become Barcelona,
  Spain and Spain; Juice now finds Barcelona), `dq1-beta-nvidia-bare-de-drawer-locations` ("DE": Germany, not
  Delaware), `dq1-beta-microsoft-costa-rica-drawer-locations` (San José, Costa Rica, not San Jose, CA).
- No layout change on either site at either size; the only visible changes are the values above.

## 6. Known gaps and follow-ups
- **Anthropic Sales department, non-sales titles** (46 paid postings: Customer Success Manager, AI Outcomes
  Manager, Partnerships, …) are not labelled OTE, following the "for sales roles" rule and the lead's sales-title
  list. If Anthropic means its Sales department, `isSalesTitle` could take the department too. Lead decision.
- **Frontend patch** `docs/process/patches/fix-pay-data-term-label.diff` (public/app.js, public/viz/chart.js): the
  drawer says "Annualized from term pay (…)" for `originalInterval: 'term'` and never shows `termWeeks`. The
  patch says "Annualized from pay for a 17-week programme (…)", and "…; the programme lasts about 17 weeks" for a
  weekly or hourly programme. Cards and Juice for OTE and fixed-term pay are the frontend lanes' work (lead
  decisions 3 and 4).
- **Patch** `docs/process/patches/fix-pay-data-llm-vet-ote.diff` (scripts/llm-vet.js): its verdict schema allows
  only 'salary' | 'stipend' | 'hourly'; it adds 'ote'.
- **Remaining centroid fallbacks** (section 5): Hebrew abbreviations (ב"ש Beersheba 31, ק"א Kiryat Ata 13),
  "Klang Valley-MY" 21, "Xi’an-CN" 13 (Apple's "City-CC" form), small US towns (Beaumont CA, Bourbonnais IL, …).
  "Vancouver, Washington" (17) is not in the gazetteer on purpose: a bare "Vancouver" must stay in BC.
- **Keyword tags:** about 25 true "Mechanical design" tags were lost with the degree-list rule (sample: 1 of 25
  removed was a TP); some Autonomy and ML tags still come from company about-text on technical titles.
- **NVIDIA "cash compensation"** ranges stay null by the existing rule (45 postings; data-check-beta notes it).
- **Not taken on (lead):** DQ-3 levels, DQ-5/6 Google pay, DQ-17 vet-salaries.
- **Cold-server upgrade time:** until the next crawl writes norm-6 snapshots, a server with an empty cache spends
  about 15 s of worker CPU upgrading Anduril's snapshot on first load (section 3, Delivery). Compstimate T21 took
  28.6 to 31.4 s (base 11.1 s) and failed once in a full run on a busy machine. If T21 is flaky in the integrated
  run before the next crawl, re-crawl first or speed up `rekeyBoardJobs` (an existing cost, 11.8 s on the base
  code too).
- **Suburbs shown under their metro:** "Dhahran" and "Khobar" show as Dammam, "Zaventem" as Brussels, "Alexandria,
  NSW" as Sydney (`rawName` keeps the posting's words).
- **Country-only locations** read "Spain · Spain" in the drawer (the frontend prints the name and the country);
  unchanged behaviour, now visible for Eightfold's bare codes.
- **Environment:** `npm test` "local beta data is gitignored" fails in this worktree and on the base commit alike
  (the worktree's `data/snapshots` is a symlink); PERF-1 and V15 are timing tests that pass alone.

## 7. Change log
- 2026-10-10 11:45 Prompt saved; base build and base tests recorded; red unit and e2e tests written.
- 2026-10-10 12:30 P-1, P-3, P-8 in salary.js/keywords.js; vet gate and vet-salaries updated; norm-6 relabel on
  the upgrade path; golden and refresh fixtures re-baselined.
- 2026-10-10 12:50 P-17 lexicon fixes and labelled sample; P-9 geocodeMany, gazetteer additions.
- 2026-10-10 13:05 Lead follow-up: Alexandria NSW → Sydney; centroid count across 13 snapshots; country fixes for
  "City, Region, CC" (Bengaluru, Yokne'am, Tel Aviv).
- 2026-10-10 13:20 Before/after screenshots (desktop 1440x900, phone 390x844, main and beta).
- 2026-10-10 13:35 Lead follow-up DQ-1: finalCountry, bare ISO codes, Spanish region codes, stated country beats
  US states; DQ-1 tests green; NVIDIA/Microsoft country counts; npm test and full e2e re-run.
- 2026-10-10 14:00 `mayRelabelPay` pre-check for the stored-snapshot relabel (same results, compare re-run);
  DQ-1 check added to the lane e2e beta test (red on base); screenshots re-taken for both builds and shrunk;
  term-label and llm-vet patches written; final npm test; commit 1ee82da.
- 2026-10-10 14:30 Final full e2e on 1ee82da: 105/108 passed (only the pre-existing Anduril JPY test fails).
