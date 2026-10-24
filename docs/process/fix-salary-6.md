# Process log: fix-salary-6

## State
- **Done:**
  - S-1 fixed and tested in the code: every pay line for a country or pay area is a `salary.ranges` row tied to the job's
    places there; lines for places the job doesn't list are `salary.unlisted` (drawer Details and CSV); "kr"/"$" read by
    the line's own country; "[Degree]" header lines; main-site rows named for places are tied to them; Juice, the card,
    the drawer and the CSV use each line. norm-14, golden re-baselined (0 of 300 hashes), refresh fixtures regenerated.
  - Commits: 545e28b prompt, 20287a1 log, 015d801 fix + 18 red tests, 93b8979 norm-14 + re-baselines, 6926984 bulleted
    degree lines + e2e file, 2b92966 Amazon guard, da401d7 docs (DATA_SOURCES §7a, CONTRACT, CSV README).
  - Unit tests: test/fix-salary-6.test.js 20 tests, all pass; the first 18 fail on the base (37f54e4) code.
  - Census before/after and the nothing-dropped proof (§5); Compstimate backtest before/after (§5).
  - The lead approved the plan (2026-10-24 00:3x) and asked for the unlisted lines in the drawer's Details: done.
  - 8a8fee6: the drawer's rank and strip rank the picked line among its own country's roles (found on the after screenshot:
    "Pays more than 76% of Google's roles in Germany" under a Milan filter). e78a6fd: screenshots.
  - e2e: test/e2e/fix-salary-6.e2e.js 35 checks, 35 pass on this build; on e800c43's build (the reviewer's) 12 fail, 1 skips
    (no Cohere row tied), and "nothing is dropped" passes on both. With the related groups (fix-pay-at-place, fix-data-3,
    D-48, D-49, UX-37): 95/95.
  - CI-like npm test at da401d7: 1,328 tests, 1,318 pass, 0 fail, 10 skipped.
  - CI-like npm test at 8a8fee6: 1,328 tests, 1,318 pass, 0 fail, 10 skipped; the doc-reading tests at 49e86ee pass.
  - 49e86ee sent to the lead (02:3x).
- **In progress:** none.
- **Next step:** any further finding the lead sends; the lead re-baselines norm-14 once more after fix-data-6.

## 1. Brief
- Prompt: [prompts/fix-salary-6.md](prompts/fix-salary-6.md). S-1 (persona-beta-2-45-54): pay posted for two or more
  countries keeps one country's line and drops the rest, so a Location filter says the pay isn't posted for a place the
  posting prices (google:111420466312159942 Milan, google:123907061523063494 Paris, google:111289074672640710 Dublin).
- Owned: server/salary.js, the salary parts of server/normalize.js, the CSV's salary_ranges column, my tests and log. Also
  touched, because the brief asks that "the card, the drawer's Pay by place, the CSV and Juice use each country's own line":
  the pay helpers of public/app.js (payRanges, payUnit, payPlacesLine, pickedRange, payHeadline, the drawer pay block) and
  server/juice.js attachJuice (a row's own currency and country). Not touched: geo.js, keywords.js, roles.js, Compstimate,
  payPlaceText, derive(), the stats line, the filters, the layout.

## 2. Inputs and sources
- docs/CONTRACT.md (Job `salary`, `payAt`, the CSV), docs/DATA_SOURCES.md §7a (DQ-15, SA-4, SB-5, VT-1, VT-17 to VT-19),
  PLAYBOOK (Checkpoints, Known traps), TEMPLATE, fix-pay-at-place.md (`payAt`), fix-mr-3.md (norm-13 re-baseline), lead.md
  from Fix wave 5.
- Code read: server/salary.js (evaluate, parseSalary, lineLabel, lineBracket, unitCountry, resolveWeakCurrencies),
  server/normalize.js (deriveSalary, withAreaRanges, relabelJobs), server/juice.js (attachJuice), server/export.js,
  server/sources/upgrade.js (upgradeAmazonJobs), server/sources/meta.js (metaPayRanges), public/features/shared.js (payAt),
  public/app.js (payPill, payHeadline, payRanges, drawer pay block), public/viz/chart.js (spanTiers, barSpan, tooltip rows).
- Data: the 2026-10-16 crawl (wt-data2 links), through the build's own read path (`tools/served.mjs`: relocateJobs,
  upgradeStoredJobs, vetSalaries, as scripts/build-static.js#readSnapshot).

## 3. Decisions and rationale
1. **Every line is a row, the headline is unchanged.** parseSalary keeps its line choice (DQ-15, DQ-13, VT-1) and adds
   `byPlace`, every line by place (country, or Microsoft's SF Bay Area / NYC area), one entry per place, currency, interval
   and kind, with its levels. normalize.js#withPlaceRanges ties each entry to the job's places in its country (minus the
   area's places when the country also has an area line) as `salary.ranges` rows with `country` and `levels`. Rows are set
   only with two or more priced lines, so single-country postings are unchanged. SB-5's split is the same rule now; its
   rows gain `country` and `levels` (the SF Bay Area / NYC range by level was only a span).
   - Considered: a separate `byCountry` field. Rejected: payAt, Juice, the chart, the map, the card and the CSV already
     read `ranges[].locations`; a new field would need every view changed.
2. **Rows are named for the country as posted** ("Germany", "US", "U.S.", "Ireland"): "Pay by place: Germany €150K–153K ·
   Italy €124K–127K". Under a filter the place picked is named ("Posted for Milan"). A country that also has an area
   line keeps SB-5's place names, so the 256 SB-5 postings read as before.
3. **Lines for places the job doesn't list: `salary.unlisted`** (the lead approved, 2026-10-24). Putting them in `ranges`
   would make about 1,000 Microsoft cards read "$X–Y · 2 ranges", spanning into SF Bay Area / NYC pay for a Redmond role.
   They are in no figure, filter, payAt or Juice. The lead: a posted line can't be visible only in the CSV, so the drawer's
   pay Details say "The posting also gives pay for Spain: €38K–59.7K; this role isn’t listed there." (one Details item;
   Details are a disclosure, so the phone line guard is not concerned). A U.S. range beside an area range on an
   area-only job reads "the US outside the San Francisco Bay Area and the New York City area" (`outside`).
4. **"kr" and "$" with no code are read by their line's country** (`weakCurrencyFor`): Microsoft's "across Denmark is kr
   880,000.00 - kr 2,028,600.00" on a job listed in Oslo first was NOK. Applies to the headline too; no headline currency
   changed on the crawl (the headline line is the first country's).
5. **"[Degree]" headers.** Google writes "[Bachelor's degree]" on a line of its own, or before the first line, and the
   country lines under it share it; also as bullets with blank lines between. lineBracket looks back at most 16 lines and
   600 characters over country lines and blank lines (S-3: bounded). 3 Google headlines gain their degree levels.
6. **Main site: rows named for places are tied to them** (`tieRangePlaces`). The brief's "USD lines by US state or zone":
   Cohere's "USA - California, New York and Washington" / "USA - All Other States" / "Canada", OpenAI's "San Francisco,
   New York, Seattle" / "Remote - US" / "US" / "London", Scale AI's unnamed rows named by their text. Before, none was tied,
   so payAt priced no place of these postings. Rules in DATA_SOURCES §7a. "Zone A/B" (OpenAI) names no place and stays as
   it was. Amazon's stored rows ("USA, TX, Wink") are never tied here: upgradeAmazonJobs re-reads them (DQ-33). A first
   run tied them by label before that upgrade, which then skipped them (rows stayed hourly and duplicated): caught by the
   before/after compare (§5), fixed in 2b92966 with a test.
7. **The client.** `payRanges` returns rows in any currency; `payHeadline` spans only rows in the salary's currency; Pay by
   place writes each row in its currency; under a filter the drawer's line names the row's currency and Pay by level the
   row's own levels (pickedLevels). The helpers keep their names and signatures (other lanes' tests lift them by name), and
   the row-currency helper is local inside payHeadline and payPlacesLine for that reason.
8. **Juice.** A place with its own row is matched to the row's currency and `country` (else `salary.country`) and scored on
   the row's midpoint in its currency. Before, Milan was left out as another country's pay.
9. **CSV.** salary_ranges lists a row's levels under its name ("Germany · Bachelor's degree: 68500-68500 EUR") and the
   unlisted lines marked "(not a listed place)". salary_min/max still span rows in the salary's currency only.
10. **VT-1 kept.** Two Microsoft postings listed only in Brazil and India post only U.S. lines: `salary: null`, as before.
11. **The drawer's rank and strip follow the picked line** (`rankSubject`). Under a Milan filter the figure is Italy's line;
    ranking it among Google's roles in Germany (the headline's country) mixed countries (BP-3). The pool is now the picked
    line's country: "Pays more than 88% of Google's roles in Italy", 9 roles on the strip. With no filter, unchanged.
12. **Not changed: the card's thousands.** France's €41,500 reads "€42K" on the card, as every card writes pay in
    thousands; the drawer and Pay by place keep the hundreds where the posting states them (levelMoney). A follow-up for
    the UI lane if the lead wants hundreds on cards.

## 4. Replayable steps
```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp     # 37f54e4
ln -s $S/wt-data2/data/snapshots data/snapshots; mkdir -p data/beta; ln -s $S/wt-data2/data/beta/snapshots data/beta/snapshots
ln -s /home/user/melon-seek/node_modules node_modules
git archive -o $S/fs6/base.tar 37f54e4 && tar -xf $S/fs6/base.tar -C $S/fs6/base      # the base code, for before runs
node $S/fs6/tools/served.mjs <code> <worktree> <out.json> [slugs]   # served salaries, the build's read path
node $S/fs6/tools/census.mjs $S/fs6/base <worktree> <served.json> <census.json> google,microsoft,nvidia,scaleai,cohere,openai
node $S/fs6/tools/breakdown.mjs <census.json>                     # per kind: lines stored, priced, unlisted
node $S/fs6/tools/compare.mjs $S/fs6/served-before.json $S/fs6/served-after.json   # nothing dropped
node $S/fs6/tools/bt.mjs <code> <worktree> google,microsoft,cohere,openai,scaleai,nvidia,meta   # Compstimate backtest
node --test test/fix-salary-6.test.js                               # and in $S/fs6/base/test/: 18 of 18 fail
UPDATE_GOLDEN=1 GOLDEN_REASON="norm-14 fix-salary-6: ..." node --test test/golden-normalize.test.js
node test/fixtures/refresh/jobs/make-fixtures.mjs                   # after setting its NORMALIZER_VERSION to norm-14
bash $S/heavy.sh timeout 2400 node scripts/build-static.js
NODE_PATH=$S/pw/node_modules node scripts/e2e.js --grep=fix-salary-6
git worktree add --detach $S/fs6/clean HEAD; ln -s /home/user/melon-seek/node_modules $S/fs6/clean/node_modules
(cd $S/fs6/clean && MELON_BETA_SNAPSHOT_DIR= bash $S/heavy.sh timeout 1500 npm test)
```

## 5. Verification
**Census, 2026-10-16 crawl** (lines found by the census's own patterns: "<Country>: <money>" lines, "across <Country> is",
"in those locations is", "<Country>: The base salary …", "in the locations of … is:"; then looked up in the served salary):

| Board | Postings with pay for 2+ places | Lines | Before: lines for a listed place not stored / priced | After: stored / priced | Lines for an unlisted place: before kept / after kept |
|---|---:|---:|---|---|---|
| Google (country lines) | 35 | 97 | 62 not stored (34 postings) / 34 priced | 96 of 96 / 96 | 0 / 1 |
| Microsoft (2+ countries) | 35 | 97 | 58 not stored / 35 | 93 of 93 / 93 | 0 / 4 |
| Microsoft (U.S. + SF Bay Area / NYC) | 1,232 | 2,720 | 0 / 1,633 | 1,633 / 1,633 | 0 / 1,083 (4 more are the 2 VT-1 postings) |
| Scale AI (rows by place) | 16 | 42 | stored, 0 priced | 38 priced, 4 for places not listed | — |
| Cohere / OpenAI (structured rows) | 55 / 8 | 183 / 18 rows | stored, 0 tied | 122 / 11 tied | rows for places not listed stay as they were |
| NVIDIA, Meta, Netflix, Apple, Amazon, Anduril, Anthropic, Palantir, Shield AI, xAI | 0 | | | | |

Meta: the stored crawl has no posting with 2+ `public_compensation` entries (`zones` is 1 for all 948). Amazon (2,260
postings, 5,111 rows) and Apple (391, 807) already tie every row; unchanged.

**Nothing dropped** (`tools/compare.mjs`, every stored posting through the build's read path, base 37f54e4 vs this lane):
- postings 43,141 → 43,141 on 15 boards, none missing; paid 28,176 → 28,176; quarantined 8 → 8;
- headline min, max and currency: 0 changed; text changed on 3 Google postings (their degree levels named);
- rows 6,673 → 6,843, none lost: Google 0 → 81 rows (34 postings), Microsoft 512 → 601 (256 → 287 postings); Cohere 122,
  OpenAI 11 and Scale AI 38 rows newly tied;
- `salary.unlisted`: 979 postings (Google 1, Microsoft 978);
- the "kr" fix: 15 Microsoft rows read by their own country (Denmark 7, Norway 5, Sweden 3); Google's lines carry codes.

**Compstimate backtest** (seed 20261002, maxN 500, dedupe role; MdAPE, within 10%, n): Google ±12.4% unchanged, within
10% 44.6% → 43.8% (Dublin, Milan, Paris comparables now priced at their own line); Microsoft ±8.4% / 56.8% / 484
unchanged; Cohere ±9.9% on 59 → ±5.8% on 76 and Scale AI ±11.9% on 123 → ±9.7% on 124 (their rows now price the city
asked, so more postings are estimable); OpenAI ±10.1% unchanged (within 10% 49.2% → 49.6%); NVIDIA and Meta unchanged.
The backtest is seeded, so these moves are the data's, not load.

**Browser (e2e):** `--grep=fix-salary-6`: 35 checks (the Milan, Paris and Dublin cases on the card and in the drawer at
375x812, 352x355 and 1280x800; no filter; Toronto in CAD; Spain in the pay Details; Cohere's Toronto row on the main site;
nothing dropped; the changed lines at all 21 phone sizes). This build: 35/35. e800c43's build (BETA_QA_DIST, the reviewer's):
12 fail, 1 skip, 1 pass; e.g. Milan: "the posting's rows are [] … the card reads "Pay posted for Germany only" … the drawer
reads "€150K–153K" … the pay note says "Posted for Germany, not Milan" … "Several pay ranges" beside Pay by place". With
fix-pay-at-place, fix-data-3, D-48, D-49 and UX-37: 95/95 (load 5–7).
Screenshots (docs/screenshots/fix-salary-6/, shrunk to 456 KB): `<place>-card|drawer-<size>.png` after, `…-before.png` on
e800c43's build (Milan and Paris; Dublin's card is not on the first page under l=Dublin there).
**Payload:** Microsoft's list 768 KB → 1,013 KB (158 KB → 174 KB gzipped: the 978 unlisted lines and the rows' levels);
Google's 1,245 KB → 1,254 KB.

**Unit tests:** test/fix-salary-6.test.js 20 (18 red on the base code); the whole suite with data linked at 6926984: 1,333
tests, 1,331 pass, 0 fail, 2 skipped (load 15–29, so its timings are noise).

## 6. Known gaps and follow-ups
- The card writes €41,500 as "€42K" (thousands, as every card); the drawer keeps the hundreds.
- Two Microsoft postings (Brazil, India) post only U.S. lines: `salary: null` under VT-1.
- OpenAI's "Zone A" / "Zone B" rows name no place; their Remote place has no row.
- fix-data-6 also bumps to norm-14; the lead re-baselines once more after integrating both.

## 7. Change log
- 2026-10-23 21:52: start; links, base copy, served dump, census before.
- 2026-10-24 00:30: resumed after the container restart; nothing was lost. Plan sent to the lead, approved.
- 00:44: the fix and 18 red tests (015d801); 00:46 norm-14 and re-baselines (93b8979).
- 00:55: bulleted degree lines; e2e file (6926984). 01:00: Amazon guard (2b92966). 01:05: docs (da401d7).
- 02:0x: the drawer's rank by the picked line's country (8a8fee6); screenshots; 49e86ee sent to the lead.
- Follow-up from the lead (fix-juice-6 found it on e77cd41): "fix3-data: [browser] lib/juice.js gives no Juice from another
  country's pay…" failed. Cohere's "Head of Corporate Development" has rows tied to "Canada" and "United States", places with no
  city record, so attachJuice returned with no `juiceMissing` for London. Fixed on the lead's head 942db8a (3462319): when every
  place with a city record is in a country no row (nor the headline) prices, `juiceMissing` is `pay-other-country`, with the old
  text ("the pay is posted in Canadian dollars (for Canada), and London, UK uses another currency"). The e2e test was right and is
  unchanged; a unit test in test/fix-salary-6.test.js fails on 942db8a and passes now. Cohere on the built list: 67 postings
  with Juice (65 on e800c43's), the 2 London postings say why, and the 13 with neither are the same as before.
