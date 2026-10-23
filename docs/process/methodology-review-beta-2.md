# Process log: methodology-review-beta-2 (methodology and sources reviewer, beta round 3)

## State
- 2026-10-16 20:55 UTC: **done**. 20 findings (MR-23 to MR-42): 1 High, 12 Medium, 7 Low.
  - test/beta-methodology-2.test.js: 45 to-dos, all failing for their stated reasons on HEAD.
  - 4 patches in docs/process/patches/methodology-review-beta-2-*.diff, all applying to 6178be7. With them, 34 of the 45 to-dos pass; the other 11 need product code.
  - 37 screenshots, shrunk to 1.6 MB.
  - Both findings batches were sent to the lead.
- Commits (worktree only, never pushed): 7457566, 1c3c45b, 32ede09, a2e6b0c, 78c0c37, 6ecb6aa, 92842bc, and the final log commit.
- Not committed: the data symlinks data/snapshots and data/beta/snapshots, and the node_modules link.

## 1. Brief
- **Prompt:** [prompts/methodology-review-beta-2.md](prompts/methodology-review-beta-2.md), verbatim, with the lead's note for beta round 3 (2026-10-16).
- **Goal:** check that `/melon-seek/beta/` says where every number comes from and how fresh it is.
  - Boards: all seven big-tech boards (Amazon, Apple, Google, Meta, Microsoft, NVIDIA, Netflix), plus Anduril on the main site for comparison.
  - The freshness registry must cover every number added since 2026-10-11.
  - Quote each doc line that drifted.
  - The lead's focus: the Amazon and Meta numbers (pay rows per place, minimums, shift pay, Austria's annual figures, Mexico peso pay and the MXN legal minimum), DATA_SOURCES §7a's norm-11 rules, Google's job families, and the registry for numbers added since 2026-10-11.
- **Files owned:**
  - this log and the prompt file;
  - `test/beta-methodology-2.test.js`;
  - `docs/screenshots/methodology-review-beta-2/`;
  - `docs/process/patches/methodology-review-beta-2-{guide,data-sources,readme,registry}.diff`.
- No product code, doc or registry file was changed in a commit. The docs and the registry were edited only temporarily in this worktree, to make and test the patches, and then restored with `git checkout`.

## 2. Inputs and sources
- **Build:** the lead's reviewer build `scratchpad/cycle-beta5-dist`, built 19:55 UTC from 6178be7 with the 2026-10-16 crawl.
  - Served by `scripts/cycle/serve.mjs` on 127.0.0.1:46201; the pid file is `scratchpad/methodology-review-beta-2/serve.pid`.
  - Beta `api/companies.json` lists 15 companies: the 8 stable ones and all 7 big-tech boards.
- **Crawl in the build** (each board's `fetchedAt` on 2026-10-16, UTC):

  | Board | Fetched | Postings |
  |---|---|---:|
  | Netflix | 11:58:01 | 414 |
  | Amazon | 12:03:12 | 22,179 |
  | Google | 12:04:20 | 3,821 |
  | Microsoft | 12:06:30 | 2,435 |
  | NVIDIA | 12:07:17 | 2,711 |
  | Apple | 12:14:13 | 4,851 |
  | Meta | 12:16:50 | 1,208 |
  | Anduril (main site) | 12:45:06 | 2,537 |

  The counts equal the lead's note.
  - The stored snapshots are norm-9; the build upgrades them to norm-11 at read time (server/sources/upgrade.js).
  - The build has no history ledger (local data), so `meta.history.runs` is 0. Listing ages therefore come from the posted dates.
- **Docs read:**
  - docs/METHODOLOGY_GUIDE.md and LIVABILITY.md (attachJuice rules, proxies, uncovered towns);
  - DATA_SOURCES.md §7, §7a–7h and §8;
  - DATA_FRESHNESS.md and data/freshness.json (all 133 entries);
  - AMAZON_META.md, README.md "Beta site" and VETTING.md §2;
  - docs/process: methodology-ux, methodology-copy, freshness-review, PLAYBOOK, TEMPLATE, methodology-review-beta (round 2), and lead.md from "Beta methodology and sources review" to "perf-mobile-beta-2 finished".
- **Code read:**
  - public/app.js: the badge popover at 1482–1506, the stats line at 2700–2733, payLabels at 4110–4125, salaryDistribution at 3733–3746, SEN_TIP at 82–87, deptTitleNote at 525–528, 2340–2353 and 2965–2977, and shiftTip and hourlyText at 205–210;
  - public/viz/chart.js renderNotes at 600–640 and the row basis at 741–775;
  - public/viz/note.js, public/viz/palette.js (the FX table), public/features/shared.js (payCountry, isFixedTerm, isInternLike);
  - server/juice.js attachJuice at 1500–1570; server/salary.js (MAX_ANNUAL, LEGAL_MIN_ANNUAL, PAY_AREAS, DOLLAR_COUNTRY); server/families.js; server/keywords.js (the ladders at 1170–1241, META_LEADERSHIP_RE, NEAR_COPY_*); server/geo.js (geocode, locationPrecision); server/sources/amazon.js (the pay-word regexes);
  - scripts/build-market.js companyPart; scripts/methodology-figures.js (sourcesFigure, figureContext, loadFigureInputs); scripts/refresh/{registry,run,lib}.js.
- **External:** none fetched; the sandbox cannot reach the careers sites.
  - Mexico's 2026 minimum wage (MXN 315.04 a day in the general zone, in force 2026-01-01) is as the code comment and fix5-data cite it: the CONASAMI resolution of 2025-12-03, read through an EY Law Flash.
  - The arithmetic checks out: 278.80 (2025) × 1.13 = 315.04, and 315.04 × 365 = 114,990.
- **Skills:** none loaded. This is a review with screenshots; no artifact or chart was made.

## 3. Decisions and rationale
1. **Read the numbers as the UI does.**
   - `tools/pick.mjs` and `tools/cov.mjs` call the page's own `getJobs` and record per-board counts, salary kinds, intervals, currencies and Juice coverage.
   - `tools/load.mjs` unpacks the served melon-packed-3 lists with `public/api.js unpackJobs`, for quick queries (`tools/find.mjs`).
   - Drawers are opened by `#c=<slug>&job=<id>` with every "Details" button and `<details>` open, and their text, links, titles and notes are saved.
   - Other hosts are aborted, as in round 2, so the map has no basemap.
2. **What counts as one click or tap away.** A `title` tooltip does not count, because a phone cannot show it. A "Details" disclosure next to the number counts, and so does a link to the right methodology section. Every methodology link in the app was resolved against the built page: `#1-the-formula`, `#7-how-often-its-updated`, `#how-is-the-posted-pay-read` and `#where-does-a-pay-estimate-come-from` all exist.
3. **Severity follows the prompt.**
   - High: a number shown with a wrong or missing source. MR-28 is High because the methodology and the comparison captions call Amazon's minimums and shift-inclusive rates "posted base pay", and Juice treats them as gross base pay.
   - Medium: stale, unclear or hard to find. Registry and doc drift go here.
   - Low: wording.
4. **Registry gaps.**
   - I listed every `const UPPER = …` added between 7990c18 (round 2's patches applied) and HEAD in server/, public/, scripts/ and .github/, about 90 names.
   - I kept the 17 that decide a number, label or count a user sees. Regexes that only parse were left out, unless they decide what a figure is (the four Amazon pay-word regexes), and so were layout and format constants.
   - Each of the 17 has a to-do test that finds its line first, so a rename fails loudly.
5. **Patches.**
   - The doc patches add no `##` sections, so the guide's anchors stay. They add two FAQ entries: "How are levels read?" and "How are Google's departments read?".
   - Every sentence describes today's behaviour. For example, a monthly-paid internship with no stated length "is turned into a yearly figure like a salary", which is true until MR-38 is fixed.
   - The registry patch is written by `tools/registry-edit.mjs`, not by `--merge`. `--merge` unions owners and appends notes, so it cannot correct a stale owner string such as "ranges.slice(0,12)".
   - Its values are copied from the code or from this build. Its new `google-job-families` source URL is the repo, not careers.google.com: `test/beta-build.test.js` fails a stable build whose `api/freshness.json` names a beta posting host, which I found when a first draft of the patch failed that test.
6. **Round-2 tests.** test/beta-methodology.test.js is not edited.
   - With my patches applied, its pass/to-do picture is unchanged: 11 pass, 31 to-dos, and the same 3 failing to-dos, MR-4, MR-21 and MR-22.
   - Round 2's MR-15 and MR-8 assertions ("resumed", "several places") were kept true on purpose.
7. **Not re-filed** (known to the lead, or another lane's):
   - "· N levels" missing on 11 NVIDIA OTE and 7 Google degree-line cards;
   - 2 Amazon fixed-term monthly minimums without "from €X" (this review's MR-33 screenshot shows one);
   - "These are Google's own level names" for degree lines;
   - the Town and Country, MO split;
   - the old "Columbus, OH" link;
   - the trimmed Amazon pay rows in stored norm-9 descriptions: 103 descriptions end at "See below the … salary for this position:" with no row. The drawer's "As posted" line in Details still shows the row, and scripts/snapshot.js keeps rows from the next crawl on (SB-2, VT-22).

## 4. Replayable steps
```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp   # 6178be7
ln -s $S/wt-data2/data/snapshots data/snapshots; mkdir -p data/beta; ln -s $S/wt-data2/data/beta/snapshots data/beta/snapshots
ln -s /home/user/melon-seek/node_modules node_modules
timeout 14400 node scripts/cycle/serve.mjs --dist $S/cycle-beta5-dist --pid $S/methodology-review-beta-2/serve.pid &   # port 46201
node scripts/refresh/registry.js --check      # registry ok (133 entries)
node scripts/refresh/registry.js --lines      # no change
node scripts/refresh/registry.js --docs       # inventory up to date
node scripts/refresh/registry.js --sync-tax   # tax entries: 71 (dry run)
node scripts/refresh/registry.js --summary    # 76 manual / 43 detect / 14 auto; noMechanismBefore 31
node scripts/refresh/run.js --staleness       # 133: 116 fresh, 4 STALE (tax-us-local-columbus, fx-per-usd, rents-1br-quoted, cost-index), 13 pipeline
T=$S/methodology-review-beta-2/tools
PORT_=46201 node $T/pick.mjs                  # per-board kinds, intervals, currencies, cases -> pick.json
PORT_=46201 node $T/walk.mjs beta amazon      # top bar, badge + popover, stats, chart notes, map, Insights, Compare (and apple ... nvidia; main anduril; beta google 390 844)
PORT_=46201 node $T/drawer.mjs 'beta|amazon|amazon:10544548|drawer-amazon-intern-monthly-minimum' ...   # 43 drawers in 5 batches
PORT_=46201 node $T/payshot.mjs '<same specs>'   # drawer tops with the pay block's Details open (the screenshots)
PORT_=46201 node $T/cov.mjs                   # Juice coverage, no-Juice reasons, top uncovered places -> cov.json
PORT_=46201 node $T/google-dept.mjs           # where "Grouped by job title" is visible
PORT_=46201 node $T/opening.mjs               # /beta/ opens on Google; methodology title says beta; sources table shot
node $T/find.mjs microsoft "j.salary && j.salary.zones>1 && !(j.salary.levels&&j.salary.levels.length>1) && !(j.salary.ranges&&j.salary.ranges.length>1)"
node $T/payarea.mjs microsoft                 # towns at a state centre (MR-40)
git diff 7990c18 HEAD -U0 -- server public scripts .github | grep -E '^\+(export )?(const|let) [A-Z][A-Z0-9_]+ *='
node --test test/beta-methodology-2.test.js   # 45 to-dos, 0 pass, 0 fail
# patches: docs edited in scratch copies ($S/methodology-review-beta-2/pw-a -> pw-b), diffed by tools/mkdiff.sh;
# registry: node $T/registry-edit.mjs; registry.js --check; --lines; --docs --write; git diff > ...-registry.diff; git checkout
git apply --check docs/process/patches/methodology-review-beta-2-{guide,data-sources,readme,registry}.diff
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/methodology-review-beta-2   # 3,584 -> 1,604 KB
kill "$(cat $S/methodology-review-beta-2/serve.pid)"
```

## 5. Verification
- **The new test file on HEAD:** `node --test test/beta-methodology-2.test.js` gives 45 tests, all to-dos: 0 pass, 0 fail. I checked each failure message one by one; each fails for the reason in its title.
- **With all four patches applied** (temporarily, in this worktree):
  - 34 of the 45 to-dos pass: MR-24 ×18, MR-25 ×5, MR-27 ×4, MR-29 ×2, MR-30, MR-31, MR-32, MR-36 and the guide half of MR-41.
  - The other 11 need product code: MR-23, MR-26, MR-28, MR-29 (app), MR-33, MR-34, MR-35, MR-37, MR-38, MR-40, and MR-41's chip tip.
  - `registry.js --check` passes (135 entries), `--lines` reports no change, and `--docs --write` regenerated DATA_FRESHNESS.md.
  - `npm test` CI-like (data links removed), load 1.1–2.7: **1,155 tests, 1,064 pass, 0 fail**, 8 skipped, 83 to-dos.
  - Round-2 file: 11 pass, 31 to-dos, the same 3 failing to-dos as before.
- **`npm test` on HEAD with the 2026-10-16 data present**, load 1.0–3.4:
  - 1,161 tests, 1,076 pass, 2 fail, 83 to-dos.
  - The 2 failures are the load-sensitive timing tests PERF-1 (220 ms) and V15 (262 ms). Both pass alone (`node --test --test-name-pattern="PERF-1|V15" test/perf.test.js`, at load 2.8).
- **Final tree** (this log, the test file, the patches, no data links), `npm test` CI-like at load 0.1–1.2: 1,155 tests, 1,064 pass, 0 fail, 8 skipped, 83 to-dos.
- **Screenshots:** 37 PNG files in `docs/screenshots/methodology-review-beta-2/`, each named in a finding or under "Checked and fine".

## Findings

Ordered by severity. "Screen" means the beta site at 1440×1000 unless it says otherwise. IDs continue after round 2 (MR-1 to MR-22).

### MR-28 (High): minimums and shift-inclusive pay are called "posted base pay" and counted as base pay
- **Status: fixed** by [fix-data-3](fix-data-3.md) (2026-10-17):
  - `scripts/build-market.js` `notBasePay` leaves stated minimums, shift-inclusive hourly figures and part-time hourly pay out of every market cell (base pay, on-target earnings and Intern) and counts them on the company's entry (`minimum`, `shiftPay`, `partTime`). On the 2026-10-16 crawl the boards post 285 minimums, 636 shift-inclusive figures (69 of Amazon's 83 part-time postings among them) and 14 more part-time hourly figures at Amazon, and 40 part-time hourly figures at Apple. Of those, the comparisons used 690 at Amazon (229 minimums, 447 shift-inclusive, 14 part-time) and 7 at Apple; the rest have no role family or pay country. Amazon's postings in the cells fell from 12,670 to 11,980 and Apple's from 2,666 to 2,659; 26 cells' medians moved (Amazon field operations, Mid: $49,100 to $152,000, once the shift-inclusive hourly figures are out).
  - The drawer's Juice block says "Gross pay is the posted minimum." or "Gross pay includes top shift pay." in one line (`.juice-gross`; one line from 280 px up), on the 98 minimums and 134 shift-inclusive figures that carry a Juice score.
  - The MR-28 test in test/beta-methodology-2.test.js is a real test now.
  - Not in this fix: the client medians (stats line, chart, Insights) and the Compare companies footnote, which still lists only internships, fixed-term programmes and on-target earnings as left out. Those are the app and viz lanes'.
- **Where:**
  - **Same role elsewhere** in every drawer, and **Compare companies** in Insights: "Posted base pay ranges of full-time roles in the US … Internships, fixed-term programmes and on-target earnings … are left out".
  - **The stats-line median, the chart medians and Insights.**
  - **Juice:** its methodology says "Gross pay is the middle of the job's posted base-pay range".
  - Code: `scripts/build-market.js` companyPart (l.109–143) leaves out only interns, fixed-term pay and on-target earnings.
- **Actual:**
  - Amazon's 285 stated **minimums** ("from €46K") are pooled as base pay. So are 636 hourly figures that, as the posting says, include "the base pay rate plus the highest available shift differential", and part-time hourly pay (Amazon 83, Apple 40) at 2,080 hours, all under "full-time roles".
  - Examples:
    - Gdansk "from PLN 230K" goes into "Software engineering roles in Poland … (posted base pay)" (`drawer-amazon-pln-monthly-minimum.png`).
    - Saginaw "Field operations & test … Amazon 38 · $50K" is all shift-inclusive (amazon:10376377, drawer text only).
    - Seattle Lead Associate: Juice "Gross pay $57,200/yr" is the shift-inclusive $27.50 × 2,080 (`drawer-amazon-shift-juice.png`).
    - Milan "from €53K": Juice gross is the minimum, with no word in the Juice block (`drawer-amazon-minimum-juice.png`).
  - 134 shift-inclusive figures and 98 minimums carry a Juice score.
  - Only the drawer's pay block says what each figure is ("Posted pay, including the highest shift differential", "Posted minimum base pay").
- **Expected:** a comparison labelled "posted base pay" holds base pay only, and Juice says when gross is a minimum or includes shift pay.
- **Fix:**
  1. In companyPart, put `kind: 'minimum'`, `includesShiftDifferential` and `partTime` postings in their own groups (like `oteCells`), or leave them out of `cells`, and count them on the card.
  2. In the Juice block, add one line: "Gross pay is the posted minimum" or "includes the highest shift differential".
  3. The guide patch already says both are scored as posted (§1 and §5).
- **Tests:** MR-28.

### MR-23 (Medium): exchange rates are still July's, 62 days past due
- **Where:** registry `fx-per-usd`, as of 2026-07-01 on a monthly cadence; `run.js --staleness` reports it STALE (107 days old).
- **On screen:**
  - every "≈ … at Jul 2026 rates" line;
  - the chart's "803 converted … at Jul 2026 exchange rates" (Amazon; Google 452, Microsoft 314, NVIDIA 39, Netflix 24, Meta 9);
  - all non-US Juice;
  - the methodology table: "Exchange rates … 1 July 2026 · Monthly · update due" (`beta-methodology-sources-table.png`).
- **History:** round 2's MR-4 asked for the FX refresh on 2026-10-11, and lead.md says "the FX refresh is dispatched", but the table is unchanged.
- **Currencies:** every currency posted on 2026-10-16 has a rate in the table: USD, EUR, CAD, PLN, GBP, SEK, RON, DKK, CZK, AUD, NOK, SGD, BRL, CHF, JPY and KRW. AUD and BRL are new with Amazon, and both are in `ECB_CURRENCIES`.
- **Fix:** re-dispatch monthly-refresh.yml with the FX module, read its job log, and merge the bot PR. The registry patch adds today's state to the notes.
- **Tests:** MR-23 (and round 2's MR-4).

### MR-24 (Medium): 17 constants added since 2026-10-11 have no registry entry
None of these is named in `data/freshness.json`:

| file:line | Constant | What it decides on screen |
|---|---|---|
| server/salary.js:56 | `LEGAL_MIN_ANNUAL` | Mexico's legal minimum, MXN 114,990 (CONASAMI MXN 315.04/day × 365): real peso pay passes both floors. It changes every 1 January |
| server/salary.js:261 | `DOLLAR_COUNTRY` | a bare "$" is MXN in Mexico (DQ-35), CAD in Canada, and AUD, NZD, SGD or HKD |
| server/sources/apple.js:353 | `APPLE_PAY_STATES` | the 14 pay-transparency states where Apple posts pay; Juice and the Location filter apply only there (DQ-27) |
| server/families.js:24 | `FAMILIES` | Google's 27 job families, read from titles (google-grouping) |
| server/keywords.js:1181 | `AMAZON_RUNG` | Amazon: I Entry, II Mid, III–IV Senior, V+ Staff+ (DQ-36) |
| server/keywords.js:1296 | `META_LEADERSHIP_RE` | Meta "(Technical Leadership)" is Staff+ (DQ-37) |
| server/keywords.js:1330 | `GOOGLE_NUMBERED_MANAGER_RE` | Google "Facilities Manager II" is a people manager (DQ-29) |
| server/keywords.js:446, :447 | `NEAR_COPY_SHARE`, `NEAR_COPY_MIN_ROLES` | team paragraphs that 10+ roles repeat are not skills (fix6) |
| server/sources/amazon.js:180, :184, :187, :190 | `MINIMUM_RE`, `SHIFT_RE`, `STATED_BASE_RE`, `STATED_ANNUAL_RE` | "from €X", "Incl. top shift pay", "Base pay starts at …", Austria's annual figure (VT-17 to VT-19) |
| scripts/build-static.js:387, :388 | `PREVIEW_MIN_JOBS`, `PREVIEW_SIZE` | boards of 10,000+ get the 100-posting first-page preview ("Loading 22,179 roles…") |
| public/viz/palette.js:197 | `PAY_BREAKS` | the map's Pay steps: $100K / $150K / $200K / $300K |
| public/viz/map.js:68 | `MIN_PIN_PAY` | a pin shows a median only from 3+ postings with pay there (V-17) |

- **Fix:** the registry patch.
  - New entry `mx-legal-minimum-wage`: source CONASAMI, yearly, asOf 2026-01-01, manual, with a December checklist, and LEGAL_MIN_ANNUAL extracted.
  - New entry `google-job-families`: monthly, with coverage 3,700/3,821 and accuracy 92/100, validated by test/google-grouping.test.js.
  - The other constants become owners of existing entries: job-salary-parsed, country-currency, seniority-ladder, keyword-lexicons, ui-stat-thresholds and ops-constants.
- **Tests:** MR-24 ×19.

### MR-25 (Medium): registry values the code has moved past
- `salary-parser-bounds` values: "MAX_ANNUAL 1200000". The code has 1,500,000 (fix wave 5, VT-10).
- `job-salary-parsed` owner: "deriveSalary (structured vs text, ranges.slice(0,12), …)". SB-3 removed the 12-row cap (server/normalize.js:136).
- `geo-gazetteer`: "GAZETTEER_SIZE 246 cities, 52 states, 60 countries". The code has 331, 52 and 73.
- `job-postings`:
  - its values are the 2026-10-11 06:38 counts (Apple 4,875 … Netflix 457), with "amazon … and meta … counts after their first crawl";
  - its notes say "Beta boards over 40 MB are trimmed or capped (jobsCapped)".
- `company-registry`: "each appears on /beta/ after its first crawl".
- `seniority-ladder` notes: "USER DECISION PENDING (seniority default)". Fix wave 3 decided it (BP-7, "Level not stated").
- `role-families` owner: "FAMILY_LABELS (26)". The code has 28.
- **Fix:** the registry patch, with the 2026-10-16 counts for both channels, the norm-11 pay counts and the decided default.
- **Tests:** MR-25 ×5.

### MR-26 (Medium): the methodology table says the job postings are "update due" on the day they were read
- **Status: fixed** by [fix-mr-3](fix-mr-3.md) (2026-10-23, 055fa0f): `scripts/refresh/lib.js` `isPipelineEntry`/`shownOverdue`. A daily entry (the postings) is never "update due" on the page built from it, in the sources table, in `api/freshness.json` and in `run.js` alike; a monthly entry past due still is. The built tables read "The latest postings · Daily" on both sites. Tests: MR-26 (here, a plain test now) and test/fix-mr-3.test.js MR-26.
- **Where:** the beta methodology §7 table: "Gross pay … The latest postings · Daily · update due" (`beta-methodology-sources-table.png`). The page was built 7 hours after every board was read.
- **Why:**
  - `scripts/methodology-figures.js:586` loadFigureInputs marks each entry `stale` from `staleness(e).overdue`, which uses the hand-set asOf (job-postings 2026-10-11 + 1 day + 2 days' grace).
  - `scripts/refresh/run.js:400` stalenessRows treats daily entries as 'pipeline' (refreshed by snapshot.yml and pages.yml) and never calls them stale.
- **Expected:** "Daily", or "Daily · last read 16 Oct 2026" from the snapshots' `fetchedAt`.
- **Fix:** in loadFigureInputs or figureContext's `due`, skip entries with `cadence: 'daily'` (the stalenessRows rule), or set the job-postings asOf from the build's newest `fetchedAt`. The registry patch moves the asOf to 2026-10-16, which clears it for two days only.
- **Tests:** MR-26 builds 10 days after asOf, so the hand-set date alone doesn't pass it.

### MR-27 (Medium): the guide and the technical reference describe pay rules the code replaced
Quoted lines and their corrections (all in `methodology-review-beta-2-guide.diff`):

| Line | Wrong | Corrected |
|---|---|---|
| METHODOLOGY_GUIDE.md:22 | "When one posting gives a range for each of several places or levels, the middle is taken across all of them, from the lowest to the highest" | "When one posting gives a range for each of several places, each place is scored on its own range (the drawer lists them under **Pay by place**); when it gives a range for each of several levels, the middle is taken across all of them …" plus minimums, shift pay and internships with no stated length |
| METHODOLOGY_GUIDE.md:102 | "**Pay ranges for several places or levels** are scored on their middle across all of them, not on the range for one place or one level." | "**Pay ranges for several levels** are scored on their middle across all of them … A place with its own posted range is scored on that range." plus a "**Minimums and shift pay**" limitation |
| METHODOLOGY_GUIDE.md:103 | "Pay in a currency we have no rate for (Romanian lei, for example) can't be converted" | "… can't be converted, so it gets no score; today every currency the postings use has a rate." |
| METHODOLOGY_GUIDE.md:151 | "How is the posted pay read?" covers levels and part-time only | adds "· 2 levels", Pay by place and "· N places", "from €46K" minimums, "Incl. top shift pay" with the stated base, and Austria's yearly figure |
| LIVABILITY.md:261–263 | "A range spanned over several places (`salary.ranges`, Apple requisitions) or levels … is scored on the span's midpoint." | levels: the span's midpoint; a place with its own range: that range (`placeUSD`, DQ-28/33, SB-5); only posted places (DQ-27); minimum, shift and statedAnnual rules; internships with no length |
| LIVABILITY.md:268–270 | "RON (Romanian lei) has no rate anywhere, so lei pay is not read" | "RON … has had a rate since fix wave 4 (MR-1: 4.58165 per USD …), so lei pay is read and converted." |

- **Evidence that the code works per place:** the Amazon Seattle drawer's Juice gross is $294,100, Seattle's own midpoint of $250K–338K, not the span's $300K (`drawer-amazon-two-places.png`). Apple's San Francisco gross comes from its own range (`drawer-apple-three-places.png`).
- **Tests:** MR-27 ×4.

### MR-29 (Medium): Google's departments are read from titles, and the screen barely says so
- **Status: fixed (UI half)** by [fix-mr-3](fix-mr-3.md) (2026-10-23, 99d5640): the stats line's Details, which are also the chart notes' Details (UX-57), say once on Google "Google doesn't publish departments, so its roles are grouped by what their titles say." No new visible control. The docs half was fixed by this review's patches. Tests: MR-29 ×3 (plain tests now), test/fix-mr-3.test.js MR-29, test/e2e/fix-mr-3.e2e.js [MR-29].
- **Where the note is shown:** "Grouped by job title: Google doesn't publish departments" (`public/app.js:528`) appears in two places only:
  - a `<p>` at the bottom of the Department filter list, below the Company list and the 28 family rows, so below the fold on desktop (`beta-google-chart-departments.png`) and inside the Filters sheet on a phone;
  - a hover `title` on the Group select (app.js:2974), which no tap reaches.
- **Where it is missing:**
  - the chart rows ("Software Engineering 946 roles · median $222K in the US", "20 more departments");
  - the cards ("Software Engineering · Mountain View", `beta-google-390-home.png`);
  - the drawer ("No department · YouTube" for 121 postings, with no reason given, `drawer-google-no-department.png`);
  - Insights "Pay by department" (`beta-google-insights-full.png`);
  - the methodology (the built page has no "job title");
  - coverage and accuracy (3,700/3,821; 92 of 100 held out) are never shown.
- **DATA_SOURCES.md:300** (§7b Mapping) still says: "department = team = brand (slot 7) … so the brand (Google 3,174, YouTube 144, …) is the only grouping."
- **Fix:**
  1. Put `deptTitleNote()` in the chart notes' Details and the Insights department card on boards with `departmentBasis: 'title'`.
  2. On "No department", say "this title matched no family".
  3. The guide patch adds the FAQ "How are Google's departments read?".
  4. The data-sources patch rewrites §7b: families from `server/families.js`, `departmentBasis`, the counts, and brand as its own field.
- **Tests:** MR-29 ×3.

### MR-30 (Medium): DATA_SOURCES §7 still describes the 2026-10-11 crawl, with Amazon at 5,000
| Line | Wrong | Corrected (`methodology-review-beta-2-data-sources.diff`) |
|---|---|---|
| 182 | "The 2026-10-11 crawl (run 38143991379) still kept 5,000 of 22,352; the next crawl publishes the whole board." | "… every crawl since publishes the whole board (2026-10-16: 22,179 postings, all of them on `/beta/`)." |
| 226 | "Postings (run 38143991379)" | "Postings (2026-10-16 crawl)" |
| 228–234 | Google 3,415 / 2,221 (65.0%) / 23.7 MB … Amazon "works (resumed 2026-10-11; whole board from the next crawl)", "22,352 listed, 5,000 kept", "5,000 of 5,000 kept", 38.5 MB | Google 3,821 / 2,512 (65.7%) / 27.7 MB; Microsoft 2,435 (search listed 2,435 of the 2,454 it counts) / 1,566 (64.3%) / 33.3 MB; Meta 1,208 / 948 (78.5%) / 11.6 MB; Apple 4,851 requisitions (6,093 listings) / 2,781 (57.3%) / 31.2 MB; Netflix 414 / 259 (62.6%) / 4.5 MB; Amazon "the whole board, no budget" 22,179 / 13,980 (63.0%) / 97.8 MB; NVIDIA 2,711 / 1,462 (53.9%) / 19.6 MB |
| 237 | "Counts are from `snapshot.yml` run 38143991379 …" | today's source sentence first; the run-38143991379 counts kept as the previous table |
| 266 | "one country's degree lines are [spanned]" | "… and since norm-11 each degree line is also kept as a level (`salary.levels`, SA-4 …)" |
| 300 | see MR-29 | see MR-29 |
| 340 | "every posting (about 22,415)" … "(Amazon about 80 MB)" | "(22,179 on 2026-10-16)" … "(Amazon 97.8 MB on 2026-10-16)" |
| 345 | the Mexico "$" rule, with no word on the legal minimum | adds `DOLLAR_COUNTRY`, `LEGAL_MIN_ANNUAL` (CONASAMI, MXN 315.04/day × 365 = 114,990, changes every 1 January), and that the 2026-10-16 crawl has 354 Mexico postings, none with pay |

- **§7a's norm-11 rules (l.264) match the code:**
  - SB-3: no row cap (normalize.js:136, amazon.js:283);
  - SB-1: restore rows from `salary.ranges` (upgrade.js:55);
  - SB-4: the row-city aliases (amazon.js:158);
  - SB-6: virtual rows kept for Remote postings (amazon.js:237);
  - SB-5: Microsoft's second range per place (salary.js:1131).
- **The lead's 2026-10-16 decision** (a listed place with no row of its own gets no Juice) is recorded there as pending code. It holds wherever every range names its places (`postedPlaceSet`); MR-40 is a geocoding gap in the same area.
- **Tests:** MR-30.

### MR-33 (Medium): converted fixed-term pay shows the 12-month annualization with no "a year"
- **Status: fixed** by [fix-mr-3](fix-mr-3.md) (2026-10-23, 99d5640): `public/app.js` `approxLine` converts fixed-term pay at its posted interval: amazon:10544548 "€5,233 a month · for about 10 weeks" over "≈ $72K in US dollars at Sep 2026 rates" now reads "≈ $6,025 a month in US dollars at Sep 2026 rates" (one line at 390 px; on a narrower phone "in US dollars" moves to the tip); a yearly rate for a term says "a year". Tests: MR-33 (plain), test/fix-mr-3.test.js MR-33, e2e [MR-33].
- **Where:** `public/app.js:3743`. The drawer's ≈ line prints `job._usd` (annualized) under pay shown per month for a term:
  - "€5,233 a month · for about 10 weeks · Fixed-term pay, not a yearly salary · **≈ $72K in US dollars** at Jul 2026 rates" (amazon:10544548, `drawer-amazon-intern-monthly-minimum.png`);
  - "€800 a month · for about 26 weeks · **≈ $11K**" (Microsoft Amsterdam intern, `drawer-microsoft-term-foreign.png`).
- **Expected:** "≈ $6,000 a month" (the posted interval), or "≈ $72K a year if it lasted 12 months".
- **Fix:** for fixed-term or monthly-posted foreign pay, convert at the posted interval (`postedTerm`) in the ≈ line.
- **Tests:** MR-33.

### MR-34 (Medium): the "Several pay ranges" chip says the figure is "the span of all of them" when it is one range
- **Where:** `public/app.js:4120`, the chip "Several pay ranges", whose title is "The posting lists different ranges for different locations or levels; this is the span of all of them". It shows whenever `salary.zones > 1` with no levels or per-place ranges: 1,075 postings.
- **When the claim is wrong:** for about 1,018 of them the figure is one range, not a span.
  - Microsoft 923: the national range is shown, and the SF Bay Area / NYC range is not used for these places. Example: Software Engineer II, Redmond, $102K–202K (`drawer-microsoft-several-ranges-one-shown.png`).
  - Amazon 63: a single row plus "Pay starts at $18.05" (`drawer-amazon-part-time-shift-base.png`).
  - Google 32: the US line of a US-and-Canada posting.
- **When it is right:** Anduril's T1–T3 tiers (29), Amazon's "lowest … highest geographic market" (20) and NVIDIA's list (1).
- **Fix:** say "the span of all of them" only when min and max come from different ranges. Otherwise say: "The posting also gives a range for other places or countries; this one is for this job's places."
- **Tests:** MR-34.

### MR-38 (Medium): internships with no stated length are shown and scored as a yearly salary
- **Status: fixed** by [fix-mr-3](fix-mr-3.md) (2026-10-23, 99d5640): `public/features/shared.js` `isTermUnstated` (part of `isFixedTerm`). 180 of the 182 (Amazon 91, Meta 35, NVIDIA 34, Microsoft 14, Anduril 5, Apple 1; Amazon's other 2 are part-time hourly pay, already shown hourly) and Palantir 35, Shield AI 6, xAI 4 are shown as posted ("$6,688–10,800 a month · USD · length not stated · Fixed-term pay, not a yearly salary"; hourly: "Paid by the hour"); the 111 with Juice show it per month only, "while it lasts". No posting, pay row or salary figure changed. Tests: MR-38 (plain), test/fix-mr-3.test.js MR-38 ×4, e2e [MR-38] ×3.
- **Scale:** 182 internships post monthly or hourly pay without a length: Amazon 93, Meta 35, NVIDIA 34, Microsoft 14, Anduril 5 and Apple 1.
- **Actual:** the drawer shows a salary and gives 111 of them a yearly Juice score.
  - "$80K–130K · USD · per year · Annualized from monthly pay … Gross pay $104,900/yr … Juice 22 · Dry" for "$6,688/month to $10,800/month" (meta:1054006261009917, `drawer-meta-intern-monthly-no-term.png`).
  - NVIDIA PhD intern: "$79K–196K per year · Annualized from hourly pay" with a yearly Juice (`drawer-nvidia-intern-hourly-no-term.png`).
  - Microsoft PhD intern: "$82K–162K per year" (`drawer-microsoft-intern-monthly-no-term.png`).
- **The same pay with a stated length** reads "$6,688–11,880 a month · for about 12 weeks · Fixed-term pay, not a yearly salary", with Juice for the term (`drawer-meta-intern-12-weeks.png`).
- **The guide** says "Pay for an internship … counts for that term only". The guide patch makes that true today ("when the posting says how long it lasts").
- **Fix:** treat an Intern posting paid by the month, week or hour with no `termWeeks` as fixed-term of unknown length (`public/features/shared.js:88` isFixedTerm). Show it as posted ("$6,688–10,800 a month"), and give Juice per month or say "if it lasted a year".
- **Tests:** MR-38.

### MR-40 (Medium): NYC-metro towns at a state's centre get Microsoft's national range
- **Status: fixed** by [fix-mr-3](fix-mr-3.md) (2026-10-23, ff2b272): 43 NY, NJ and CT towns within about 80 km of Manhattan are in the gazetteer (read only with their state named), norm-13. Garden City (3), Fort Lee (1), Paramus (1) and Bridgewater (4) Microsoft places are on the NYC-metro row now (microsoft:1970393556650765: "Garden City, Mountain View, San Francisco $134K–261K"). 101 postings' coordinates move; nothing else changes. Tests: MR-40 (plain), test/fix-mr-3.test.js MR-40 ×3, e2e [MR-40].
- **Why:** Microsoft's SF Bay Area / NYC range (SB-5) is assigned by distance (`server/salary.js:477` PAY_AREAS, 60 km from Manhattan). `server/geo.js` geocodes Garden City NY to 42.17,-74.95 (New York State's centre) and Fort Lee and Paramus NJ to 40.3,-74.52 (`locationPrecision`: 'centroid').
- **Effect:** 4 postings price those towns at the national range. Example: microsoft:1970393556650765, "Pay by place: Redmond, Garden City, Boston $102K–235K · Mountain View, San Francisco $134K–261K" (`drawer-microsoft-bay-nyc-range.png`). Its Garden City pay is the posting's NYC-metro range.
- **Fix:**
  - add the NYC-metro and Bay Area suburbs Microsoft lists to `CITIES_RAW`;
  - make `payAreaOf` return "unknown" for a centroid place, so the posting keeps both ranges for it rather than the national one.
  - The registry patch notes the centroid issue under geo-gazetteer.
- **Tests:** MR-40.

### MR-41 (Medium): neither methodology page explains the level buckets or each company's ladder
- **Status: fixed (the chip's tip)** by [fix-mr-3](fix-mr-3.md) (2026-10-23, c59177f): the Mid tip gives the board's own example (Google "III", Amazon "II", Microsoft "IC3", NVIDIA "Level 2", Netflix "L4", else "II" or "L4"), each read through `jobSeniority` in the test. The guide half was this review's patch. Tests: MR-41 ×2 (plain), test/fix-mr-3.test.js MR-41, e2e [MR-41].
- **Where the levels are used:** every card and drawer level chip, the Seniority filter, "Same role elsewhere … at Senior level", Compare companies' Level picker and Compstimate all use seven buckets. Each company's numbers map differently (server/keywords.js:1170–1241, 1296):
  - Amazon "III" is Senior, but Google "III" is Mid;
  - Microsoft IC4 is Senior, and M6 is Director+;
  - NVIDIA Level 3–5 is Senior;
  - Meta "(Technical Leadership)" is Staff+.
- **What is missing:** the built guide and reference never say "Staff+", "Level not stated" or how a ladder maps. The Seniority filter's note explains Staff+ and Director+ only.
- **Also:** the Mid chip's tip (`public/app.js:85`) says "A mid level the posting names (for example "III" or "L4")", but Amazon's III is Senior.
- **Fix:**
  - the guide patch adds the FAQ "How are levels read?", with each ladder from the code;
  - in the app, change the Mid tip to "(for example Google "III", Microsoft "IC3" or "L4")".
- **Tests:** MR-41 ×2.

### MR-31 (Low): README "Beta site" says Amazon and Meta are not in the build yet
| README line | Wrong | Corrected (`methodology-review-beta-2-readme.diff`) |
|---|---|---|
| 376–379 | "(Google, Microsoft, Apple, Netflix and NVIDIA; Amazon and Meta were resumed on 2026-10-11 and appear after their first crawl. Amazon shows all of its roughly 22,000 postings …)" | "seven big-tech career sites (Google, Microsoft, Apple, Netflix, NVIDIA, Amazon and Meta; Amazon and Meta were paused … and resumed on 2026-10-11 …). Amazon shows its whole board, 22,179 postings on 2026-10-16 …" |
| 394–395 | "The methodology page … explains the Juice Score, not how the big-tech pay is read" | "… and its questions say how the posted pay and levels are read ("How is the posted pay read?"); the full pay rules … are in DATA_SOURCES §7a." |
| AMAZON_META.md:9–10 | "each board appears on `/beta/` after its first crawl" | "both boards are on `/beta/` since their first crawl on 2026-10-11 (2026-10-16: Amazon 22,179 postings, Meta 1,208)" |

- **Checked and right:** the beta notice. The "Beta" tag by the logo links to the main site, the tab title says "melon·seek beta", the tagline says "Beta: adds 7 big-tech companies' own careers sites", and the popover says "You're on the beta site … Go to the main site".
- **Checked and right:** `/beta/` with no link state opens on `#c=google`, as README says.
- **Tests:** MR-31.

### MR-32 (Low): the PLAYBOOK says Amazon is capped
- **PLAYBOOK.md:229:** "Amazon is capped at 5,000 postings on /beta/ (`maxPostings`)."
- **Corrected:** "No board is capped: Amazon's 5,000-posting budget (`maxPostings`) was removed on 2026-10-11, and its whole board (22,179 postings on 2026-10-16) is the heavy case."
- **Tests:** MR-32.

### MR-35 (Low): the stated base pay loses its cents
- **Status: fixed** by [fix-qa4](fix-qa4.md) (2026-10-23, 6185ba3): `public/app.js` `hourlyText` formats with
  `postedPair`, which keeps the posted cents, so the shift-pay tip and the pay block's Details read "Base pay starts at
  $18.05/hour" (amazon:10409027). Whole rates still read "$18/hour". The MR-35 test in test/beta-methodology-2.test.js
  is a plain test now: it fails on dcebc6a and passes on 6185ba3.
- **Where:** the shift-pay tip and the pay block's Details read "Base pay starts at $18/hour" for the posting's "Pay starts at $18.05 per hour" (amazon:10409027, `drawer-amazon-part-time-shift-base.png`). `public/app.js:205` hourlyText uses `money()`, which rounds to whole dollars, so $19.50 can read "$20/hour".
- **Note:** the VT-18 comment's own example is "$18.35/hour".
- **Fix:** format hourly rates with two decimals.
- **Tests:** MR-35.

### MR-36 (Low): "How we collect this" opens a section that doesn't say how
- **Where:** the badge popover's Updates row: "Read by the site's crawler about every 6 hours (GitHub often starts it hours late). How we collect this", linked to `methodology/#7-how-often-its-updated` (`public/app.js:1506`, `beta-amazon-badge-popover.png`).
- **Actual:** guide §7 covers cadence only. Nothing on the site says that the crawler reads the careers sites' own public lists and pages, follows robots.txt and asks about once a second. That is all in DATA_SOURCES §7, which is off-site.
- **Fix:** the guide patch adds one sentence to §7. Alternatively, rename the link "How often it's updated".
- **Tests:** MR-36.

### MR-37 (Low): Austria's annual figure has no "As posted" line
- **Status: fixed** by [fix-mr-3](fix-mr-3.md) (2026-10-23, 99d5640): the pay block reads "Stated as a yearly figure", and its Details quote the posting and its payments ("… paid as 14 monthly payments of €3,358.33, not 12"; amazon:10557624's row is 13.69 payments and says so). Tests: MR-37 (plain), test/fix-mr-3.test.js MR-37, e2e [MR-37].
- **Where:** "from €47K · EUR · per year" for "The minimum basic salary for this position is EUR 47'000 gross annually", paid as 14 payments of €3,358.33 (amazon:10551812, `drawer-amazon-austria-annual.png`).
- **Actual:** the pay block's Details have no "As posted" line, though Poland's monthly minimum has one. The 14 payments are never mentioned, and `public/app.js` never reads `salary.statedAnnual`. The stored description lost its monthly row in trimming (a norm-9 snapshot).
- **Fix:** add "As posted: EUR 47'000 gross a year (14 monthly payments of €3,358.33)" from `statedAnnual`.
- **Tests:** MR-37.

### MR-39 (Low): the headline median mixes countries without saying so
- **Status: fixed** by [fix-mr-3](fix-mr-3.md) (2026-10-23, 99d5640): with pay in several currencies in view, the stats line's and Insights' median is the main currency's (the chart rows' rule) and says so: Amazon "$141K base pay median" (all 13,980, 803 converted) is "$149K base pay median (US)" (13,177; its Details: "It is the median of the 13,177 roles paid in the US; 803 roles paid in other currencies are left out"), and the tiles read "of 13,177 in the US". The chart's caption uses the same basis ("Median base pay $149K US"; `chart.js` `headPay`). Tests: test/fix-mr-3.test.js MR-39 ×3, e2e [MR-39] ×2.
- **Where:**
  - the stats line "$141K base pay median" (Amazon);
  - the chart caption "Median base pay $141K";
  - Insights "Median base pay $141K of 13,980 salaried roles".
- **Actual:**
  - All three count every country's pay, converted (803 postings for Amazon, 452 for Google).
  - The row medians say "in the US", and the drawer's strip ("median $149K" of 13,076 US roles) is US-only.
  - The stats Details say only "The median is base pay, in approx US dollars" (`beta-amazon-notes-open.png`).
- **Fix:** add "all countries, converted" to the stats Details and the Insights caption, or make the headline median US-only like the rows.

### MR-42 (Low): Microsoft's role count is 19 short of Microsoft's own, and nothing says so
- **Where:** the popover reads "Roles 2,435". The crawl listed 2,435 of the 2,454 postings Microsoft's search counts (`crawl.list.complete: false`).
- **Comparison:** Apple has a popover note for its own count difference; Microsoft has none.
- **Fix:** add a popover row when `crawl.list.listed < expected`: "2,435 of the 2,454 Microsoft's site counts (its search lists the rest inconsistently)".

### Still open from round 2 (not re-filed)
- MR-4: exchange rates (see MR-23).
- MR-21: registry.js's usage header still has no `--docs`. Fixed by [fix-mr-3](fix-mr-3.md) (62899e8).
- MR-22: `scripts/build-market.js:200` still writes `fx.source: 'public/viz/palette.js FX_PER_USD'`. Fixed by [fix-mr-3](fix-mr-3.md) (62899e8): `FX_SOURCE`.

Their to-dos in test/beta-methodology.test.js still fail.

### Checked and fine
- **Sources and dates one tap away:**
  - The badge popover names the source (a link to the careers site), the fetch time in UTC with its age, the 6-hourly cadence, the role count, and Apple's listing note ("Apple's site lists a role once for each place …"). Round 2's MR-10 and MR-11 are fixed (`beta-apple-badge-popover.png`; main site `main-anduril-badge-popover.png`).
  - Every converted figure names "Jul 2026 rates", linked to §7 (MR-2 fixed).
  - The map's Pay mode has a legend with Details (MR-13 fixed).
  - Juice "Data as of" lines name the rent, living-cost, exchange-rate and tax dates.
  - Compstimate says "Typically within ±10% (tested on 497 listed salaries …)", gives its dates, and links "How estimates work".
  - "Same role elsewhere" says only postings that state a level count (MR-18 fixed).
- **Per place and per level:**
  - Amazon's "· 2 places" card tip lists each place's range.
  - "Pay by place" in the drawer, with Juice on the place's own range. A stand-in city is named: "Irving (using Dallas's rent and living costs, the nearest city with cost data)" (MR-12 fixed, `drawer-amazon-four-places.png`).
  - Microsoft "Pay by level", "IC means individual contributor; these are Microsoft's own level names" and "Top is 2.3× the bottom (across levels)" (MR-17 fixed, `drawer-microsoft-levels.png`).
  - NVIDIA's own level names, and on-target earnings labelled throughout (`drawer-nvidia-ote-levels.png`).
- **Minimums:** "from €46K" with the "Minimum" chip and "Posted minimum base pay; the offer can be higher" (`drawer-amazon-eur-minimum.png`).
- **Part-time:** "If full-time (2,080 hours) … At the posted 30 hours a week: about $30,732 a year", and the no-hours reason (`drawer-amazon-part-time-shift-base.png`).
- **Lei:** "RON 91K–136K · ≈ $20K–30K" (MR-1 fixed, `drawer-microsoft-lei.png`).
- **Juice coverage** (paid postings with Juice; reasons from the UI's data):

  | Board | With Juice | No Juice |
  |---|---|---|
  | Amazon | 9,819 / 13,980 (70.2%) | no city record 4,076, remote or no place 70, part-time hours 15 |
  | Apple | 2,703 / 2,781 (97.2%) | |
  | Google | 2,224 / 2,512 (88.5%) | |
  | Meta | 897 / 948 (94.6%) | |
  | Microsoft | 1,166 / 1,566 (74.5%) | 273 remote or "United States" only |
  | Netflix | 168 / 259 (64.9%) | all 91 remote |
  | NVIDIA | 1,383 / 1,462 (94.6%) | |
  | Anduril | 2,070 / 2,388 (86.7%) | |

  - The top uncovered places are Amazon's Boardman OR 276, Hermiston OR 189, Wink TX 169, Umatilla OR 152, Canton MS 127 and Sparks NV 108 (all listed in LIVABILITY.md as needing records); Google's Eemshaven 15, Waterloo 14 and Haskell 11; Meta's Rayville LA 10 and El Paso 6; and Microsoft's Bucharest 12 and Cheyenne 9.
  - Each shows "No Juice: there is no rent and living-cost data yet for <place>".
  - New Amazon towns that LIVABILITY.md doesn't list yet: Fairless Hills PA 36, Fredericksburg VA 36, Westborough MA 35, Ridgeland MS 35 and Berwick PA 42. LIVABILITY's "Westboro WI" is probably Amazon's Westborough, MA ("Westboro" rows, SB-4); that is for the data lane.
- **Mexico:** the 2026-10-16 crawl has 354 Amazon Mexico postings and none states pay, so the MXN path (DQ-35) and the legal minimum are not exercised on today's data. Both are tested in test/beta-vetting-2.test.js.
- **Freshness:** the methodology page's title says "beta" (D-37 fixed). Every as-of date on screen matches the registry or the snapshot.

## 6. Known gaps and follow-ups
- **Live hosts:** the careers sites can't be reached from the sandbox, so no shown figure was compared with a live posting. They were compared with the stored text, which the drawer's "As posted" lines repeat.
- **Phone:** the walk was desktop, plus Google at 390×844 (cards, stats line and popover). The judgements about what a tap reaches come from the DOM (title attributes versus Details buttons).
- **The ledger:** the build has none (local data), so "New" badges, reposts and first-seen dates were not checked. The lead's checks after the pause cover them.
- **Patch order:** apply the registry patch after any other registry patch, then run `registry.js --lines --write` and `--docs --write` (PLAYBOOK Stage 3). The DATA_SOURCES patch's counts are this build's; a later crawl moves them.
- **Left for product lanes:**
  - MR-26: scripts/methodology-figures.js.
  - MR-28: scripts/build-market.js and the Juice block.
  - MR-29: chart notes and Insights.
  - MR-33, MR-34, MR-35, MR-37, MR-41 (the tip) and MR-42: public/app.js.
  - MR-38: public/features/shared.js and the drawer.
  - MR-39: the stats line and Insights.
  - MR-40: server/geo.js and server/salary.js.
  - MR-23: the FX refresh dispatch.

## 7. Change log
- 2026-10-16 19:56: checked out 6178be7, linked the data, pasted the prompt, and committed the log skeleton.
- 20:00–20:12: served the build; ran the registry modes and staleness; walked the 7 beta boards and Anduril; dumped 10 Amazon drawers.
- 20:12: sent batch 1 to the lead (MR-23 to MR-29, MR-33).
- 20:15–20:30: dumped 33 more drawers, ran a phone walk of Google, Juice coverage, the Google grouping visibility check and the methodology page shots; confirmed MR-34, MR-38, MR-40 and MR-41.
- 20:30–20:38: wrote test/beta-methodology-2.test.js (45 to-dos); wrote the four patches and tested them in place (`npm test` CI-like: 0 fail; 34 of 45 to-dos pass); restored the docs and registry.
- 20:38: sent batch 2 to the lead.
- 20:39–20:43: ran `npm test` on HEAD with data: 2 timing failures, which pass alone.
- 20:45–20:55: pruned the screenshots from 123 to 37, re-shot the drawers with the pay block in view, shrank them (3,584 → 1,604 KB), and wrote this log.
