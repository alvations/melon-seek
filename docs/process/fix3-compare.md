# Process log: fix3-compare (fix wave 3, comparisons within one country)

## 1. Brief
Prompt: [prompts/fix3-compare.md](prompts/fix3-compare.md). Target: beta and the main site (one
code base). Findings from the beta persona review ([lead.md](lead.md) "Beta, stage 1c"):

- **BP-3** comparisons mix countries ("Same role elsewhere", Compare companies, the market cells and
  "Pays more than N%");
- **BP-4** wrong role families (NVIDIA chip design as software, Netflix distributed systems as
  hardware, design managers, data-centre technicians, a French sales title, an economist, "IC Designer");
- **BP-7** a stated mid level ("Mid" badge) told it "doesn't state a level";
- **Compare companies says why a level is missing** (no Mid for Design, no Director+ for Policy).

Files owned: `public/features/{comps,roles,insights,compstimate,shared}.js`, `public/viz/comps.js`,
`scripts/build-market.js`, new tests. Patches, to apply in this order:
1. [patches/fix3-compare-same-country.diff](patches/fix3-compare-same-country.diff): `public/app.js` (the
   same-country "Pays more than N%" line and histogram, and the drawer's "nothing to compare" note) and
   the one wait in `test/e2e/ui.e2e.js` that assumed "Same role elsewhere" is either hidden or has rows;
2. [patches/fix3-compare-e2e-mid-level.diff](patches/fix3-compare-e2e-mid-level.diff):
   `test/e2e/fix-estimates.e2e.js` read any level option starting "Mid" as "Level not stated"; since
   shared decision 1 "Mid" is a stated level (BP-7), so it now checks for "Level not stated" and the
   stored value `Mid`;
3. [patches/fix3-compare-contract.diff](patches/fix3-compare-contract.diff): the `docs/CONTRACT.md` section.

## 2. Inputs and sources
- `docs/CONTRACT.md` (v2 market comps, v5 levels and `seniorityBasis`), ROADMAP §8 (UI budget: no new
  control; Compare companies is an existing Insights card), PLAYBOOK, TEMPLATE.
- The five beta persona reviews (`persona-beta-*.md`): 18–24 BF-3, BF-4, BF-5; 25–34 I5; 35–44 B3,
  improve 6 and 9; 45–54 broken 2 and 3; 55+ improve 11 and 12. Screenshots in
  `docs/screenshots/persona-beta-*/`.
- Code read: `public/features/comps.js`, `roles.js`, `shared.js` (`payLocations`), `compstimate.js`,
  `scripts/build-market.js`, `server/index.js#getMarket` (per-company docs merged by `mergeMarkets`),
  `scripts/build-static.js` (market cap, `betaLeaks`), `scripts/refresh/jobs.js` (reads `cells` and
  `columns`), `public/app.js` (`payPool`, `percentile`, `drawerContent`, `sameRoleSection`,
  `renderInsights`, `pickCompany`, the `s` filter holding `displayLevel()` values).
- Data: the archive snapshots symlinked from the shared checkout (`data/snapshots`, `data/beta/snapshots`,
  crawls of 2026-10-10/11), read through the build (`dist-before`, the base commit's build) with
  `public/api.js#unpackJobs`. Analysis scripts are in the lane scratchpad (`fix3-compare/scripts/`:
  `a1.mjs` pay countries, `fam*.mjs`/`moves.mjs` families, `msize.mjs` market size, `check.mjs` the
  persona cases, `bt.mjs` Compstimate backtests, `shots.mjs` screenshots).

## 3. Decisions and rationale
1. **`payCountry(job)`** (`public/features/shared.js:249`): the ISO code of the first of `payLocations(job)`
   *that names a country*, not literally `payLocations(job)[0]`: `payLocations` keeps country-less remote
   entries, and Anthropic and Anduril list "Remote" first on 85 paid postings. With no located place, the
   currency's only country (USD→US, CAD→CA, GBP→GB, PLN→PL; derived from palette `COUNTRY_CURRENCY`,
   "UK" read as GB); a missing currency reads as USD as everywhere else (`usdMid`, `salaryUSD`); a euro
   range on a remote-only posting is `null` (compared with nothing). On the beta data 11,841 paid postings
   are US pay, 192 Ireland, 189 Canada, 130 UK, 95 Poland, 89 Germany, then 20 more countries.
2. **Market doc: one country per cell, no duplication, same columns** (`scripts/build-market.js`).
   Alternatives: (a) a `country` column in `cells` breaks `test/refresh-jobs.test.js` (asserts the 7
   columns), `test/market.test.js` (deep-equals a cell) and `scripts/refresh/jobs.js`, which this lane
   does not own; (b) keeping the worldwide cells and adding country cells reached ~137 KB of the 150 KB
   cap on beta. Chosen: `cells`/`oteCells`/`counts` hold each company's **home country**
   (`companies[].country`, most salaried postings; Cohere's is Canada) with the old columns, and
   `byCountry[code]` holds every other country with the same three arrays. Each (company, country)
   pair appears once. Format stays `melon-market-1` (fields added only; `test/market.test.js` asserts it).
3. **"Only countries with enough postings"**: a non-home country enters for a company when the company
   has `COUNTRY_MIN_N` = 10 salaried postings used there (per company, so `mergeMarkets` of the server's
   per-company docs equals `buildMarket` of all; a cross-company threshold could not be applied to one
   company's doc). Kept on beta: US CA IE GB PL DE FI NL FR SE BE CZ; main site: US CA GB.
   **Size: beta 79 kB (was 57), main site 32 kB (was 29)** in the build log; 77.1 / 31.1 KiB measured.
4. **BP-7 bucket `"Mid-level"`** (`MID_STATED = levelKey('Mid')`, the app's own link key): a full-time
   posting whose `displayLevel()` is `'Mid'` also counts there. The stored `'Mid'` bucket is unchanged
   (defaults plus stated mids), so `scripts/refresh/jobs.js#levelRatios` (reference `'Mid'`) reads the
   same cells. `compsForJob` uses `displayLevel(job)` instead of `levelStated(job.seniority)`, returns
   `level: 'Mid'` (the value the app's Seniority filter holds, so `pickCompany` keeps working unpatched)
   and `bucket: 'Mid-level'`. `missingCompanies`' "doesn't state levels" counts `Mid − Mid-level`.
5. **Readers** (`public/features/comps.js`): every reader takes an optional `country` (default: the
   doc's main country, `countries[0]`); `compsForJob` compares within `payCountry(job)`. A document
   without countries (hand fixtures in `test/features.test.js`) is read as before. `compsNote` names the
   country ("… roles at Senior level in Poland: …") and with no rows says "No other company lists pay
   for <family> roles in <country>, so there is nothing to compare yet. Pay for other countries isn't
   used." (shared decision 2: say so, never fall back to another country).
6. **Compare companies' country follows the view** (`compareCountry`, no new control): the open job's
   pay country, else the location filter's country (the one most roles in view are paid in), else that
   of most salaried roles in view, then on the board, else the doc's main country. The subtitle reads
   "Posted pay in Ireland for the same kind of role …" and the footnote "Only pay for roles in Ireland
   is compared." (replacing "Pay is from every location each company lists"). A country picker was
   considered and rejected: ROADMAP §8, and the location filter already says where the person looks.
7. **"Why a level is missing"** (`missingLevelsNote`, `comps.js:267`): one line under the pickers, for
   the full-time ladder levels with no row in that country: "Mid and Manager aren't in the Level list:
   no company lists pay for 3 or more Design roles at those levels in the US." Nothing when no level is
   missing, or when the family has no row at all (the empty state says it). Internships are left out
   of the line (a different kind of pay, with its own choice).
8. **Role families** (`public/features/roles.js`), all checked on the beta snapshots:
   - new `chip` "Chip design & silicon engineering" (`CHIP`, `roles.js:201`): verification (design,
     formal, CPU/GPU/SoC/IP/FC), physical design and synthesis, DFT/DFX/ATPG, RTL and logic design,
     analog/mixed-signal and IC design, IC/analog/mask layout, standard cells, SerDes, SRAM, timing and
     STA, EDA, tape-out, UPF, sign-off, semiconductors, "Silicon" (not "Silicon Valley"), and NVIDIA's
     "Engineer, ASIC/Verification/Phys Design/Mask Design" and Microsoft's "Silicon Engineering"
     departments. A title naming software, firmware, a compiler or a driver is left to those families;
     tested after program, product, sales and business operations ("SoC Program Manager" stays program),
     before AI research ("RTL Design Engineer, Machine Learning Accelerators" is chip). The data supports
     the split: Apple 411, NVIDIA 195, Google 61, Microsoft 32 salaried US postings (`chip`, `*`).
   - new `dc-tech` "Data center technicians": a technician title with a data-centre word in the title
     or department (Google "Data Center Technician III", Microsoft "Critical Environment Technician").
     `facilities` keeps data-centre engineers, construction and real estate (Anthropic's $362K). Google 53
     and Microsoft 26 salaried US postings.
   - "distributed systems" joins the explicit software rule before hardware's "systems engineer"
     (Netflix); design managers and directors are design, chip ones chip (`CHIP_CONTEXT`), Microsoft's
     design managers in Technical Program Management are program; "IC/ASIC/analog/… designer" is not UX;
     economists are data science; signal/power integrity is hardware (was trust and safety); "FE
     implementation" is chip (was solutions); memory/cache/display controllers are not finance; board
     design is hardware; NVIDIA developer relations are sales and partnerships (was software);
     Canadian French words are read (`ABBREV`: logiciel, développeur, chercheur, ventes, représentant,
     stagiaire, étudiant; "responsable/gestionnaire de compte").
   - `FAMILY_AFFINITY` (Compstimate's partial credit) gets `hardware|chip` 0.85, `swe|chip` 0.5,
     `dc-tech|facilities` 0.7, `dc-tech|manufacturing` 0.5, `dc-tech|it` 0.4, `dc-tech|support` 0.3, tuned
     on the backtest (decision 9). `FAMILY_TITLES` gets "Design Verification Engineer" and "Data Center
     Technician" (scripts/refresh/jobs.js checks every label has one).
9. **Compstimate backtest** (`bt.mjs`, seed 20261002, the build's options), base → after: Microsoft
   MdAPE 5.9% → 6.1% (within 10%: 61.7% → 63.2%), NVIDIA 12.7% → 12.9%, Google 14.6% → 14.2%, Apple and
   Netflix unchanged. With the first affinities (0.55/0.3/0.4) Microsoft was 6.6% and NVIDIA 13.4%.
10. **"Pays more than N%"** (app.js, a patch): `payRank(job, pool, { mid })` (`shared.js:272`) ranks a role
    among the board's like-for-like roles paid in the same country and returns `{ pct, n, country, others }`;
    the line reads "Pays more than 21% of Google's roles in Poland that show pay", or "Too few of
    Google's roles in <country> show pay to rank this one. Pay for other countries isn't used." when
    there are fewer than 5. `payPool` (the distribution histogram) takes the same-country pool, so the
    histogram and the sentence agree.

## 4. Replayable steps
```
pwd; git log --oneline -1                     # worktree at 790fa13
ln -s /home/user/melon-seek/node_modules node_modules
mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots
S=<scratchpad>/fix3-compare
node scripts/build-static.js --out $S/dist-before          # the base build: "before" data and screenshots
node $S/scripts/a1.mjs; node $S/scripts/moves.mjs beta --sample 20; node $S/scripts/msize.mjs beta
node --test test/fix3-compare.test.js                       # 64 pass (red at 790fa13: new exports missing)
git apply docs/process/patches/fix3-compare-same-country.diff   # verification only; never committed
npm run build
NODE_PATH=<scratchpad>/pw/node_modules node scripts/e2e.js --grep="Fix3 compare"
node scripts/cycle/serve.mjs --dist $S/dist-before --pid $S/serve-before.pid   # and the new dist on another port
NODE_PATH=<scratchpad>/pw/node_modules node $S/scripts/shots.mjs http://127.0.0.1:<port> before docs/screenshots/fix3-compare
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix3-compare      # 7,488 KB -> 1,972 KB
git checkout public/app.js                                  # back to the committed state
```

## 5. Verification
- **Red first.** `test/fix3-compare.test.js` against the base tree (`git archive 790fa13`): fails at import
  (`COUNTRY_MIN_N`, `payCountry` … do not exist). `test/e2e/fix3-compare.e2e.js` against the base build
  (`BETA_QA_DIST=base/dist`): **1/9 passed, 8 failed** (the phone layout check is a guard and passes at
  base). Against the new build with the patch: **9/9 passed**.
- **Persona cases on the new market** (`check.mjs`):
  - Google entry software in the US: $179K (n 4), was "$89K" (n 9, Warsaw and Málaga pooled); Google Poland
    $75K is its own row.
  - Microsoft Senior AI research is $177K in the US, beside Netflix $608K, NVIDIA $270K, Apple $255K;
    the old "$142K" pooled Redmond, Vancouver, the UK and Oslo.
  - A Google Dublin data scientist: "No other company lists pay for Data science & analytics roles in
    Ireland …" (was ranked against Netflix $448K). Warsaw entry software: "Pays more than 21% of Google's
    roles in Poland" (was "more than 1% of Google's roles").
  - Hardware & systems, Staff+, US: NVIDIA, Google, Anduril, Microsoft, Shield AI; no Netflix (was
    "Netflix $699K"). NVIDIA "Senior Formal Verification Engineer" is compared with chip design at Senior
    in the US (NVIDIA $239K, Apple $239K, Google $200K, Microsoft $177K), not Netflix's $473K software.
  - Google "Software Engineer III": "Software engineering roles at Mid level in the US" (Netflix $332K,
    NVIDIA $183K, Google $179K, Microsoft $152K, Shield AI $121K). Google "Data Center Technician III":
    "Too few Mid Data center technicians roles elsewhere list pay in the US, so this compares …" with
    Google $102K and Microsoft $87K (was facilities with Anthropic's $362K).
  - Lines: "Mid and Manager aren't in the Level list: … Design roles … in the US."; Policy: "Entry,
    Mid, Staff+ and Director+ aren't in the Level list: …".
- **Families**: 1,668 beta postings (965 with pay) change family; main site 54 (20 with pay). Largest
  moves: hardware → chip 806 (Apple 567, NVIDIA 154, Google 65), software → chip 350 (NVIDIA 256),
  facilities → data center technicians 196, manufacturing → data center technicians 46 (Microsoft),
  software → sales 47 (NVIDIA developer relations), trust and safety → hardware 37 (signal integrity),
  hardware → software 12 (Netflix). Spot check of 20 (every 83rd moved posting, `moves.mjs --sample 20`):
  19 right; 1 debatable: Anduril "Circuit Designer, Space Special Programs" became chip (was program;
  hardware would fit best, Anduril designs boards). An earlier sample caught Anduril's "Staff Design
  Verification Test Engineer" (product test, not chip verification), fixed with `design verification(?! test)`.
- **Unit tests**: `node --test test/fix3-compare.test.js` 64/64. `test/fix-estimates.test.js`,
  `test/features.test.js`, `test/market.test.js`, `test/refresh-jobs.test.js`, `test/static-build.test.js`,
  `test/beta-build.test.js` pass unchanged.
- **Whole `npm test`** (`MELON_BETA_SNAPSHOT_DIR` = an empty folder, as CI):
  - final, with all three patches applied: **830/830 passed**;
  - committed state (no patches): 829/830; the one failure is the V15 timing test ("event loop blocked
    for 161 ms" at load average 5), which passes 3 of 3 runs alone;
  - an earlier patched run at load 6–7 had 4 timing failures (PERF-1, V15, "LLM second opinion",
    `politeRequest … per-host spacing`); all pass alone, and `politeRequest` also fails 1 run in 5 on
    the base tree.
- **Full e2e** (`NODE_PATH=… node scripts/e2e.js`):
  - base tree (790fa13 with its own build): **192/195 passed, 0 failed, 3 skipped**;
  - this lane (commits plus the three patches, `npm run build`): **201/204 passed, 0 failed, 3 skipped**
    (the same 3 skips; the 9 new `Fix3 compare` tests pass);
  - before the two e2e patches and the intern wording: 197/204, with `UI: "Same role elsewhere" rows`,
    `fix-estimates: [P-10, I-8]` and `[P-11]` failing (see §6), and one `Fix3 compare` test reading a
    build older than the wording change.
- **Screenshots** (`docs/screenshots/fix3-compare/`, each `-before`/`-after`, desktop 1440×900 and phone
  390×844): `bp3-warsaw-drawer-*`, `bp3-dublin-drawer-*`, `bp3-compare-google(-dublin)`,
  `bp4-compare-hardware-staff`, `bp4-compare-chip`, `bp4-formal-verification-drawer-*`,
  `bp4-dc-tech-drawer-*`, `bp7-google-iii-drawer-*`, `levels-compare-design`, `levels-compare-policy`,
  `main-compare-anthropic`, `main-anthropic-drawer-*`, `phone-compare-google`, `phone-warsaw-drawer-*`.
  No new control; the only new visible text is the country in existing sentences, the "Pays more than"
  line's country, the drawer's "nothing to compare" sentence and the one-line levels note.

## 6. Known gaps and follow-ups
- Without the e2e patches, three existing e2e tests fail on the integrated build: `UI: "Same role
  elsewhere" rows …` (waits 8 s for rows or a hidden section; a note-only section is now possible) and
  `fix-estimates: [P-10, I-8]` (any option starting "Mid"), both fixed by the patches above; and
  `fix-estimates: [P-11]` passed once the intern note says "internships" (comps.js wording).
- The app.js patch is needed for the "Pays more than N%" country and the drawer's "nothing to compare"
  sentence; without it the drawer still compares within one country (comps.js), but hides the section
  when no same-country peer exists, and the percentile still pools countries.
- A country where only one company has 10+ postings (Belgium: Google; Czechia: Microsoft) compares with
  nothing; the sentence says so. Lowering `COUNTRY_MIN_N` to 5 would add a few pairs (Anthropic in
  Ireland, 7 postings) for about 3 KB.
- `insights.js` (Market insights: pay by department, skill premiums) still pools a board's countries
  unless a location filter is on; not in this lane's findings.
- "Circuit Designer" at a defence company reads as chip design; a company-aware rule was not added.
- NVIDIA "Product Development Engineer" and "Product Engineer – Board/PCBA" stay software engineering
  (the generic "product engineer" rule); a follow-up could read NVIDIA's "Engineer, Product
  Development" department as hardware.
- The lead should apply `fix3-compare-contract.diff` (docs/CONTRACT.md) and run
  `node scripts/refresh/registry.js --lines --write && … --docs --write`.

## 7. Change log
- 2026-10-11 04:05 Worktree at 790fa13, base build into the scratchpad, data analysis.
- 2026-10-11 04:30 Families, `payCountry`/`payRank`, the market's country dimension and the readers
  (commit 92101db).
- 2026-10-11 04:45 Unit tests, e2e file, app.js and contract patches, screenshots, affinity tuning
  (commit d459871).
- 2026-10-11 05:20 Full e2e on the patched build: three older e2e tests assumed the old behaviour; the
  intern note now says "internships", and two e2e patches (ui.e2e.js wait, fix-estimates.e2e.js "Mid")
  were written. Rebuilt; full e2e 201/204, 0 failed; npm test 830/830.
