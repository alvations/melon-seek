# Process log: fix-beta-pay

## 1. Brief
- **Prompt:** [`docs/process/prompts/fix-beta-pay.md`](prompts/fix-beta-pay.md) (verbatim).
- **Goal:** fix the big-tech pay and level findings of the beta data check and the beta desktop QA for target
  `beta`: DQ-3 (board levels, `job.seniorityBasis`), DQ-5 (bonus-target %), DQ-6 (zł, kr, kr., lei), DQ-8 / D-21
  data side (`salary.levels`), DQ-13 (SF Bay Area / NYC range), DQ-14 (Netflix edge cases), DQ-15 and D-22
  (country lines, Canadian dollars), D-30 (a starting figure is not a zone) and DQ-17 (the vetting scan agrees
  with the parser). Shared decisions 1 and 2 of the wave are implemented on the data side.
- **Files owned and changed:** `server/salary.js`, `server/keywords.js`, `server/normalize.js`,
  `scripts/vet-salaries.js`, `docs/CONTRACT.md` (v5), `docs/VETTING.md`, `docs/DATA_SOURCES.md` §7a; new test
  `test/fix-beta-pay.test.js`; re-baselined `test/fixtures/golden-normalize.json` and
  `test/fixtures/refresh/jobs/*`; small edits to the tests the changes touch (section 3, "Tests changed").
- **Not changed:** `server/vet.js` (its rules were already right; the $1.2M bound stays), `scripts/llm-vet.js`
  (the flag lines keep their shape), `server/sources/**`, `server/geo.js`, `public/**`, `server/index.js`,
  `scripts/build-static.js`, `docs/QA.md`. Two patches for other owners are in `docs/process/patches/` (section 6).

## 2. Inputs and sources
- `docs/CONTRACT.md` (v2 to v4), `docs/strategy/ROADMAP.md` §8, `docs/process/PLAYBOOK.md`, `docs/process/TEMPLATE.md`.
- `docs/process/data-check-beta.md` (DQ-3, 5, 6, 8, 13, 14, 15, 17 with posting ids) and its red tests in
  `test/beta-data-check.test.js`; `docs/QA.md` "Full QA pass (desktop, beta) 2026-10-10" (D-21, D-22, D-30) and
  `test/e2e/beta-desktop-qa.e2e.js`. The mobile beta section (M-19 to M-27) has no pay or level finding.
- The 5 beta snapshots (`data/beta/snapshots/*.json`, crawl of 2026-10-10, norm-5) and the 8 stable ones, through
  symlinks to the shared checkout (gitignored, not committed).
- `test/fix-pay-data.test.js` and `docs/process/fix-pay-data.md` (batch 2: `salary.kind 'ote'`, `termWeeks`,
  `relabelJobs`), which this lane builds on.
- Ladder evidence came only from this data (the boards' own titles and pay at each rung, section 3, DQ-3). No
  external documentation and no skills were used.

## 3. Decisions and rationale

### Before and after, the whole data set
Every stored posting was run through the build's upgrade path (`relocateJobs(rekeyBoardJobs(jobs).jobs)`, then
`vetSalaries`) with the code at `8c598c2` and with this lane's code, and compared posting by posting
(`<scratch>/fix-beta-pay/scripts/dump.mjs` and `diff.mjs`, section 4):

| Company | Pay changed | Pay gained | Pay lost | Currency changed | Zones changed | `levels` added | Level changed |
|---|---:|---:|---:|---:|---:|---:|---:|
| Google | 10 | 185 | 0 | 59 | 3 | 0 | 391 |
| Microsoft | 35 | 28 | 0 | 5 | 3 | 160 | 303 |
| NVIDIA | 0 | 3 | 0 | 0 | 0 | 866 | 142 |
| Netflix | 0 | 0 | 5 (+1 quarantined) | 3 | 0 | 0 | 122 |
| Apple | 0 | 0 | 0 | 0 | 44 | 0 | 9 |
| Stable boards (8) | **0** | **0** | **0** | **0** | **0** | **0** | 7 (Anduril 2, Shield AI 3, OpenAI 1, xAI 1) |

Google's 1,952 other changed postings differ only in `salary.text`, which now keeps the line's code ("$141000 -
$205000 (USD)").

### DQ-3 Board levels and `job.seniorityBasis` (shared decision 1)
- **Root cause:** `seniorityOf` read level words only. "III" was a Senior word (Google's III is one step below
  Senior); "II", "IV", "V", Netflix's "(L5)" and "Engineer 5" and NVIDIA's "New College Grad" were not read at all,
  and the pay sentence (Microsoft "Software Engineering IC6 - The typical base pay range …", NVIDIA "… for Level 4")
  was never consulted. "Associate … Counsel" counted as Entry.
- **Fix:**
  - Ladders (`server/keywords.js:902-950`): a numbered rung after the level words, read on the board's ladder
    (`inferSeniority(title, { company })`, `:857`; `ladderRung`, `:925`). Generic: I Entry, II Mid, III Mid, IV
    Senior, V+ Staff+. Google: I and II Entry, III Mid, IV Senior, V+ Staff+. L-levels (in parentheses or after a
    role word): L3 Entry, L4 Mid, L5 Senior, L6+ Staff+; Netflix's "Engineer N" is LN, and a two-level Netflix
    title takes its upper level. Rungs that are not levels are left alone: "III-V Photonics", "V-BAT", "V&V",
    "A/V", "UK&I", "I/O", "Senior Software Engineer, L4 - Autonomous Vehicles", "L11 System …", "Support Engineer L2".
  - Pay sentence (`seniorityFromPay`, `:968`; `jobSeniority`, `:881`): used only when the title states no level.
    Microsoft IC1/IC2 Entry, IC3 Mid, IC4 Senior, IC5+ Staff+, M1–M5 Manager, M6+ Director+; NVIDIA Level 1 Entry,
    2 Mid, 3–5 Senior, 6+ Staff+. A two-level posting takes its lower level.
  - Students (`STUDENT_RE`, `:1008`) are Intern ("Hardware Engineering Student", "Student Researcher", "Student
    Worker Opportunities", "Stagiaire", "Étudiant-chercheur"); "New College Grad", "University Graduate" and "Early
    Careers" are Entry; "Associate … Counsel" (`:1010`) states no level.
  - `job.seniorityBasis` (`server/normalize.js:225`, `:237`): `'title'`, `'pay'` or `'default'` on every job.
    `relabelJobs` sets it on stored jobs.
- **Evidence for each mapping** (2026-10-10 crawl; medians are US base pay, yearly):
  - **Google**, within a family: TPM I $141K < II $168K < III $200K < Senior $235K; Program Manager I $131K < II
    $161K < III $195K < Senior $231K; SWE III $179K < Senior $213K < Staff $254K; Forward Deployed Engineer II
    $152K–$221K, III $174K–$252K, IV $207K–$300K, V $262K–$364K. Google's II band is its university-graduate band:
    "Technical Program Manager II" $138K–$197K = "Silicon Engineer, PhD, University Graduate" $138K–$197K. So II is
    Entry, III (one step below Senior) Mid, IV Senior, V Staff+.
  - **Netflix:** Engineer 4 $250K–$413K, Engineer 5 $388K–$619K (ML $466K–$750K), Engineer 6 $499K–$900K; "4/5"
    postings post the L5 band ($466K–$750K) and "L5/L6" the L6 band ($600K–$1,066K), hence the upper level.
  - **Microsoft:** IC2 $127K (= its Entry median $128K), IC3 $152K (its "Software Engineer II" titles), IC4 $177K
    (305 of its titles say Senior), IC5 $209K (216 say Principal), IC6 $231K (42 Principal/Partner); M6 is a
    director band (28 of 47 M6 titles say Director).
  - **NVIDIA**, the level its own titles carry at each pair: 1/2 "New College Grad"; 2/3 no level word ($167K);
    3/4 193 Senior; 4/5 381 Senior; 5/6 64 Senior, 1 Principal; 6/7 3 Principal.
- **Counts per company and level** (all postings, before → after; last column: basis title / pay / default):

| Company | Intern | Entry | Mid | Senior | Staff+ | Manager | Director+ | Basis after |
|---|---|---|---|---|---|---|---|---|
| Google | 66 → 84 | 75 → 181 | 1,622 → 1,717 | 978 → 757 | 332 → 334 | 298 → 298 | 46 → 46 | 1,935 / 0 / 1,482 |
| Microsoft | 73 → 78 | 4 → 34 | 981 → 678 | 586 → 749 | 409 → 502 | 162 → 169 | 105 → 110 | 1,450 / 410 / 460 |
| Netflix | 2 → 2 | 7 → 6 | 246 → 128 | 49 → 137 | 7 → 38 | 121 → 121 | 24 → 24 | 348 / 0 / 108 |
| NVIDIA | 141 → 141 | 10 → 53 | 614 → 472 | 1,489 → 1,588 | 124 → 124 | 230 → 230 | 56 → 56 | 2,093 / 139 / 432 |
| Apple | 112 → 119 | 28 → 30 | 4,588 → 4,579 | 865 → 865 | 69 → 69 | 396 → 396 | 47 → 47 | 1,526 / 0 / 4,579 |
| Anduril | 27 → 27 | 54 → 54 | 1,032 → 1,034 | 923 → 921 | 186 → 186 | 141 → 141 | 128 → 128 | 1,468 / 0 / 1,023 |

  Before, every "Mid" was a default. After, the "Mid" defaults are Google 1,482 (was 1,622), Microsoft 460 (981),
  Netflix 108 (246), NVIDIA 432 (614), Apple 4,579 (4,588). Google's 235 Mid with basis title are its III titles.
- **Medians by level, USD base, before → after:** Netflix Mid $473K → $332K, Senior $315K → $473K, Staff+ $830K →
  $700K (the inversion is gone); Google Entry $168K → $156K, Mid $173K → $179K, Senior $200K → $213K; NVIDIA Entry
  $152K → $160K, Mid $197K → $183K; Microsoft unchanged at Mid $152K < Senior $177K < Staff+ $209K.

### DQ-5 Bonus-target percentages
- **Root cause:** `PLUS_EXTRAS_AFTER_RE` took `\d{1,2}(?:\.\d)?%` only, so "+ 42.86%", "+ 100%" and "+ 150% bonus
  target" lost the base-pay reading and the "bonus" right after the range rejected it.
- **Fix:** `\d{1,3}(?:\.\d{1,2})?%` (`server/salary.js:310`). Google gains these postings' base ranges.

### DQ-6 zł, kr, kr. and lei
- **Root cause:** the symbol list had no zł, kr or lei, and the code Google puts after the range is in parentheses
  ("(PLN)"), which the token reader did not take as a suffix.
- **Fix:** `zł`, `kr.`, `kr`, `lei` in `SYMS`/`SYM_CUR` (`server/salary.js:147`); "kr" and "kr." are shared symbols
  (`WEAK_SYMS`, `:150`) resolved by the job's country (SE SEK, NO NOK, DK DKK); a code in parentheses is a suffix
  (`SUF`, `:166`). "salaire" (French Canadian Google lines) and "range for our interns" (NVIDIA Poland) are pay
  words (`PAY_RE`, `:293`).
- **RON is not used:** the site has no exchange rate for it (`FX_PER_USD`, shared with `public/viz/palette.js`, whose
  `toUSD` returns an unknown currency's amount unchanged, so lei 162,000 would be plotted as $162K). A candidate in a
  currency with no rate is skipped (`:691`, `:806`), and if it was the job's own country's range, another country's
  range is not used instead (`unitCountry`, `:326`; `:823`; Microsoft's Bucharest-only posting
  1970393556950504 would otherwise show Poland's zł range). The scan flags these postings `missed_salary` (Google 4,
  Microsoft 11), so they stay visible to a reviewer. Adding RON needs a sourced rate in `data/cities.json` and
  `palette.js` (section 6).

### DQ-8 / D-21 (data side) `salary.levels` (shared decision 2)
- **Root cause:** `parseSalary` spanned the level tiers into one min and max and kept the level names only in the
  text.
- **Fix:** `parseSalary` returns `levels: [{ label, min, max }]` when each spanned tier carries a "for Level N"
  label (NVIDIA; `LEVEL_AFTER_RE`, `:365`) or each national range carries its level (Microsoft "IC4 - …"; labels
  shortened to the code by `levelName`, `:907`). `toJobSalary` annualizes each level like `min`/`max` (`:974`). The
  span, `zones` and `text` are unchanged. 866 NVIDIA and 160 Microsoft postings get `levels`. The drawer rendering
  is the app lane's (D-21's e2e test checks the pay block's words).

### DQ-13 SF Bay Area / NYC range (decided by the lead)
- **Root cause:** DATA_SOURCES §7a always used the U.S. range, and the parser had no notion of the job's metro.
- **Fix:** `payAreas(locations)` (`server/salary.js:395`) returns the areas every US location of the job is in
  (`PAY_AREAS`, `:372`: 75 km around the bay, 60 km around Manhattan, by the geocoded city; a centroid, a state, a
  remote or a country location is not in an area). `deriveSalary` passes it (`server/normalize.js:102`).
  `parseSalary` marks Microsoft's "… in those locations is …" ranges (`CITY_RANGE_RE`, `:350`), ties each to the
  national level before it, and uses the city ranges by level when the job is only in the areas they name
  (`:830`). 33 Microsoft postings change (the data check's 31 plus two hourly "ATR" ones). §7a is updated.

### DQ-14 Netflix edge cases (each checked against the vetting rules)
- **Union floors** ("… governed by the … collective bargaining agreement and thus will be no less than $62.74 an
  hour"): a floor is not the role's pay. A single figure after "no less than", "not less than", "at least" or "a
  minimum of" is rejected (`FLOOR_BEFORE_RE`, `:362`, in `contextOf`, `:624`). 5 postings now show no pay instead
  of $97K–$155K a year.
- **Canadian "$"** (Toronto, two Vancouver): see D-22. All 3 are CAD now.
- **The $1.43M L7 range:** checked against VETTING §3. The `above_max` bound ($1.2M) was set from the highest real
  posted base ($850K) and has caught three real errors ($4.6M, $5M, $1.56M). Netflix pays all cash, so the figure
  may be genuine, but one posting does not justify loosening the bound, so it stays quarantined. What changes: the
  parser used to drop it silently (the posting showed no pay). A range above $1.2M written out in full, with a pay
  word in its own clause, is now read with a penalty so it never beats a plausible amount (`over`, `:730`), and the
  gate quarantines it: the drawer says "Pay unclear, see posting".
- Netflix's sales "range for roles in this area" stays null by the §7a rule, which is now an explicit rejection
  (`AREA_BAND_RE`, `:363`) so the scan agrees.

### DQ-15 and D-22 Country lines and Canadian dollars
- **Root cause:** (1) "(CAD)" was not read, so Google's Canadian lines were "$" = USD and were spanned into the US
  range; (2) ties between country lines kept the first line in the text ("Ireland: €…" before "US: $…"); (3) lines of
  the same currency for different countries were spanned as tiers (Spain €84K with Ireland €112K); (4) a bare "$" was
  always USD.
- **Fix:**
  - Each amount knows its country: Microsoft's "across Germany is" or a "Germany:" line label (`lineLabel`, `:334`;
    `area`, `:764`). The job's own country scores highest, the US one first when the job has a US location (as
    `pickCurrency`), else its first location's country (`own`, `:760`).
  - Lines for different countries are never spanned; one country's lines are (degree tiers), at most 3× (`:852`
    onward; plain tiers exclude labelled lines, `tierOk`, `:868`). A label starts a new line even when the page has no
    line break ("… + benefits US: $147000 …", `contextOf`).
  - A bare "$" in a posting whose locations are all in Canada is CAD unless the amount's sentence, its heading or a
    "US:" line says USD (`resolveWeakCurrencies`, `:240`). A whole-text check was too broad: Netflix Animation's
    Vancouver postings mention "USD technology" (Pixar's scene format).
- **Result:** all 55 Canada-only Google postings with pay are CAD (were 53 USD); google:102246871434437318 uses the
  US line; google:106785017631253190 is $150,000–$217,000 (the CAD minimum is gone); EUR lines are no longer mixed
  (8 postings).

### D-30 A starting figure is not a pay zone
- **Root cause:** `zones` counted every distinct candidate, and "most new hires start at $23.00" is one.
- **Fix:** a single figure inside another range of the same currency and interval is not a zone (`inside`, `:897`).
  The 44 Apple postings have `zones: 1`; their text keeps the starting figure.

### DQ-17 The vetting scan uses the parser's rules
- **Root cause:** `scripts/vet-salaries.js` had its own clause splitter (it ended a clause at "U.S."), its own pay
  words (no "+ bonus target + equity") and its own money regex (no zł/kr, no code in parentheses).
- **Fix:** `server/salary.js` exports `findMoneyTokens` and `payContextAt` (`:663`, `:674`), and `evaluate` uses the
  same `contextOf`. The scan reads amounts, clauses and pay context with them (`scripts/vet-salaries.js:63-90`).
  `no_pay_context` is the parser's own test (`:227`). `missed_salary` (`payClauses`, `:151`) is an amount in the
  parser's pay context, or with a pay word in the parser's clause, that no parser rule rejects (`:166`), so a range
  the parser misses still shows up. A total or cash compensation range, a pay floor or an area band is not one.
  `multiple_ranges` counts only ranges beyond the salary's `zones` (`:247`), so level tiers and national + city
  pairs read by rule are not flagged.
- **Result** (Apple, Google, Microsoft, Netflix, NVIDIA and Anduril, gate applied):

| Scan | Lines | Google | Microsoft | NVIDIA | Netflix |
|---|---:|---|---|---|---|
| Old scan, stored salaries (the data check's numbers) | 4,643 | no_pay_context 2,015, missed 4 | no_pay_context 1,034, multiple 208 | multiple 879, missed 48 | missed 5 |
| New scan, stored salaries | 850 | **missed 189** (the DQ-5/DQ-6 misses), no_pay_context 0 | missed 40 (lei, kr), multiple 17 | missed 3 (Polish interns) | missed 5, no_pay_context 5 (the floors) |
| New scan, re-derived with this parser | 565 | missed 4 (lei) | missed 11 (lei) | 0 missed, 0 multiple | missed 0; 1 critical, quarantined (L7) |

### Delivery to stored snapshots (norm-7)
- `NORMALIZER_VERSION` is `norm-7` (`server/normalize.js:28`). `relabelJobs` (`:174`) now re-derives a text-sourced
  or missing salary from the stored posting text exactly as `deriveSalary` does (`rederiveTextSalary`, `:153`),
  keeps a structured salary's numbers (labels only, as before), re-derives the level and basis, and re-runs
  `vetSalaries` on the list (`:200`), so the server, the static build, the archive ingest and the refresh report show
  the fixes before the next crawl. One exception keeps quarantine records: when the parser no longer reads pay but the
  stored text figure fails the gate's hard checks anyway (an old misread such as "$4.6M"), the stored one is kept and
  stays quarantined ("Pay unclear"); a plausible stored figure the text no longer supports (a union floor) is dropped.
  `test/archive.test.js` relies on this. Cost: about 2.5 s for Google's 3,417 postings; the beta build went from 108 s to
  114 s here.
- Golden hashes re-baselined: the only change in the 300-job sample is the new `seniorityBasis` field
  (`<scratch>/fix-beta-pay/scripts/golden-diff.mjs`).

### Tests changed (re-baselined, not weakened)
- `test/beta-data-check.test.js`: `TODO` removed from the 14 tests this lane fixes (DQ-3 ×5, DQ-5, DQ-6, DQ-8,
  DQ-13, DQ-15 ×2, DQ-17 ×3). DQ-8 now reads `salary.levels`, the field shared decision 2 names (the test had
  guessed `salary.ranges`, which is the structured per-tier list); the assertion is otherwise the same.
- `test/keywords.test.js`: "Mid exactly when the level is a default" no longer holds by shared decision 1; the test
  now asserts that a default is always Mid and that "Research Scientist II" is Mid with basis 'title'.
- `test/fix-pay-data.test.js`: the version assertion says norm-7.
- `test/refresh-jobs.test.js`: the "unread level token" example is "E5" (Meta style), because "Software Engineer
  L5" is now read; `test/fixtures/refresh/jobs/*` regenerated as norm-7 snapshots with `seniorityBasis`.

## 4. Replayable steps
```bash
W=/home/user/melon-seek/.claude/worktrees/agent-a57b6831d7e79df6b; S=<scratch>/fix-beta-pay
cd $W && ln -s /home/user/melon-seek/node_modules node_modules
mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots
git archive --format=tar 8c598c2 -o $S/base.tar && mkdir -p $S/base && tar -xf $S/base.tar -C $S/base   # + the same symlinks
node $S/scripts/dump.mjs $S/before          # run from $S/base: every posting as the build shows it at 8c598c2
node $S/scripts/dump.mjs $S/after           # run from $W
node $S/scripts/diff.mjs $S/before $S/after all pay 10     # the table in section 3
node $S/scripts/sencounts.mjs $S/before $S/after           # levels per company
node scripts/vet-salaries.js --no-fixtures --out $S/vet-stored/flags.jsonl data/beta/snapshots/*.json data/snapshots/anduril.json
node scripts/vet-salaries.js --no-fixtures --renormalize --out $S/vet-renorm/flags.jsonl data/beta/snapshots/*.json data/snapshots/anduril.json
UPDATE_GOLDEN=1 GOLDEN_REASON="norm-7 …" node --test test/golden-normalize.test.js
node test/fixtures/refresh/jobs/make-fixtures.mjs
node --test test/fix-beta-pay.test.js test/beta-data-check.test.js
npm test
node scripts/build-static.js                # the worktree's own dist/, read by the e2e suite
NODE_PATH=<scratch>/pw/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/e2e.js
node scripts/cycle/serve.mjs --dist $W/dist --pid $S/serve-after.pid      # and $S/base-dist for "before"
NODE_PATH=<scratch>/pw/node_modules node $S/scripts/shots.cjs <before-url> <after-url> docs/screenshots/fix-beta-pay
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-beta-pay
```

## 5. Verification
- **Lane tests:** `test/fix-beta-pay.test.js` 18/18. `test/beta-data-check.test.js`: the 14 DQ tests of this lane
  pass with `TODO` removed; the 8 left as to-dos belong to other lanes (DQ-2, 4, 7, 9, 10, 16).
- **`npm test`** (727 tests):
  - With the real beta snapshots linked in (`data/beta/snapshots`, as this wave sets it up): 693 pass, 26 fail, 8
    to-do. The 26 are the build-based tests (links policy, static build, static `getJobs`, load hints) whose
    120-second build time-out is too short for a beta build of 20,000 postings on a loaded machine (108 s alone here),
    plus PERF-1 and V15. The baseline at `8c598c2` fails the same set the same way (659 pass, 28 fail).
  - With no beta snapshots, as in CI (`MELON_BETA_SNAPSHOT_DIR` pointed at an empty folder): **717 pass, 2 fail, 8
    to-do**. The 2 are the timing tests PERF-1 and V15; run alone they pass (and pass on the baseline too).
- **Full e2e suite** (`node scripts/e2e.js`, this worktree's `dist/`, load 7 to 11 from other lanes): **162/184
  passed, 19 failed, 3 skipped.**
  - This lane's red tests pass: `[D-22]` (Canada-only Google pay is CAD) and `[D-30]` (no "Multiple pay zones" on
    the Apple new-hire figure). `[D-17]` passes too (batch 2).
  - `[D-21]` still fails, as expected: it checks the drawer's words, which the app lane renders from `salary.levels`.
  - The other 17 failures are the other lanes' red tests (`[D-18]`, `[D-20]`, `[D-23]`, `[D-24]`, `[D-26]`–`[D-29]`,
    `[M-19]`–`[M-27]`) and the timing test T21, which passes alone (1/1, 34.6 s).
  - The 3 skips are the same on the baseline build (checked: `[P-2]` skips there too, "no estimate for this role").
  - The run rewrites some committed screenshots (`docs/screenshots/*.png`, `qa-mobile*/e2e-*.png`); they were
    restored with `git checkout` and are not part of this lane's commit.
- **Before and after screenshots** (`docs/screenshots/fix-beta-pay/`, 1440x900 and 390x844, beta site; "before" is a
  build of `8c598c2` with the same data, "after" this worktree's build). Each shows the drawer's pay block:
  - `D-22-google-canada-cad-{desktop,phone}-{before,after}.png`: "$99K–102K USD" → "CA$99K–102K CAD, ≈ $70K–73K".
  - `D-30-apple-new-hires-no-zones-desktop-*.png`: the "Multiple pay zones" label is gone.
  - `DQ-6-google-krakow-pln-desktop-*.png`: "Salary not listed" → "PLN 280K–287K, ≈ $74K–76K".
  - `DQ-5-google-bonus-target-desktop-*.png`: "Salary not listed" → "$152K–221K".
  - `DQ-13-microsoft-santa-clara-desktop-*.png`: "$120K–235K" → "$160K–261K".
  - `DQ-14-netflix-union-floor-desktop-*.png`: "$130K (from $62.74 an hour)" → "Salary not listed" with an estimate.
  - `DQ-14-netflix-l7-quarantined-desktop-*.png`: "Salary not listed" → "Pay unclear, see posting".
  - `DQ-15-google-us-line-desktop-*.png`: "€142K–145K EUR" → "$171K–247K USD" for the US posting.
  - `DQ-3-netflix-l5-level-{desktop,phone}-*.png`: "Level not stated" → "Senior".
  - `DQ-3-google-iii-level-desktop-*.png`: "Senior" → "Level not stated" (stored 'Mid', basis 'title'; it reads
    "Mid" once the app lane's `displayLevel` lands, shared decision 1).
  - The layout is unchanged at both sizes (no UI code was touched); NVIDIA's drawer shows no visible change until the
    app lane renders `salary.levels`, so it has no screenshot pair.
- **Data checks:** the before/after tables in section 3 (every stored posting), the scan counts (section 3, DQ-17),
  and hand checks of single postings with `<scratch>/fix-beta-pay/scripts/one.mjs` (for example microsoft:1970393556928287,
  New York only: $116,900–$203,600 → $148,400–$222,600).
- **Patches** were tested in a scratch copy: the packing patch builds the beta site with the round-trip check passing
  (Google list 1.45 MB); the refresh patch passes `test/refresh-jobs.test.js` test 6.

## 6. Known gaps and follow-ups
- **Patches for other owners** (`docs/process/patches/`):
  - `fix-beta-pay-pack-seniority-basis.diff` (`scripts/build-static.js`, platform lane): packs `seniorityBasis` as a
    dict column. Without it every job carries `"seniorityBasis":"default"` inline and Google's list grows from 1.41
    MB to 1.52 MB, over the 1.5 MB budget (a warning, not a failure). With it Google is 1.45 MB; the build's
    round-trip check passes (tested in a scratch copy).
  - `fix-beta-pay-refresh-seniority-basis.diff` (`scripts/refresh/jobs.js`): the monthly "level is a default" share
    leaves out Mid postings whose level the pay sentence names (`seniorityBasis: 'pay'`). Tested with
    `test/refresh-jobs.test.js`.
- **RON** (Google 4 Romanian intern postings, Microsoft 11): needs a sourced exchange rate in `data/cities.json`
  (`fx.perUSD`, Big Mac `dollar_ex`) and `public/viz/palette.js` / `server/salary.js` `FX_PER_USD`. Then the parser
  reads lei with no other change.
- **D-21's e2e test** needs the app lane's pay-block rendering of `salary.levels`; the data is in place.
- **Display of the new levels** needs the app lane's `displayLevel` (shared decision 1). Until it lands, the
  current app shows every 'Mid' as "Level not stated", so Google's III titles (now Mid with basis title) read
  "Level not stated" instead of "Senior" on a build without the app lane.
- **Bare "$" outside Canada** (Australia, New Zealand, Singapore) is still USD; the same rule could apply, but no
  finding asked for it and no posting in this crawl needs it.
- **"Technical Director" at Netflix Animation** is a craft role filed Director+; not in this lane's findings.

## 7. Change log
- 2026-10-10 14:20 Prompt saved; docs, findings and the red tests read; worktree set up at `8c598c2`.
- 14:40 Ladder evidence from the data (Google families, Netflix bands, Microsoft IC and NVIDIA level pairs).
- 15:00 Levels, parser and vetting-scan changes; DQ tests green; first full `npm test` (build tests time out on the
  real beta data, as on the baseline).
- 15:30 Before/after dump of every posting; fixes for the null re-derive (`safe()` turned a fresh null into "keep"),
  "USD technology", the US-first tie-break, RON fallback, country labels without line breaks.
- 16:00 Docs (CONTRACT v5, VETTING, DATA_SOURCES §7a), lane tests, patches, builds, e2e, screenshots.
