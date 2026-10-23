# Process log: fix-mr-3 (methodology and data engineer, fix wave 5)

## State
- 2026-10-23 15:00 UTC: **done and sent to the lead.** All ten IDs and T-17 fixed and tested. npm test CI-like at ebc00e0:
  1,261 tests, 1,220 pass, 0 fail, 8 skipped, 33 to-dos. e2e on the rebuilt dist with data: my 30 (11 ID tests, 19 phone sizes),
  the related groups (Methodology, fix-data-3, fix-pay-at-place, fix-pay-data, fix3-data, Fix3 app, Fix app, every "drawer"
  test: 174/177, 2 skipped, BP-13 updated to the MR-39 rule and then passing) and fix-phone-text's desktop guard (21/21). On a
  build of 05263e8, 13 of 13 of my tests tried fail.
- **Next:** rebase onto fix wave 5's last batch when the lead says (origin has only WIP checkpoints since 05263e8), re-run npm
  test and the e2e, and resend the SHAs.
- Base: origin/claude/stoic-ride-54ddxp at 05263e8 (detached). Not yet rebased onto fix wave 5's last batch (the lead says when).
- Commits (worktree only, never pushed), oldest first: d8818ca brief, 7bded6c log, 7297ce7 red tests, 62899e8 MR-21/MR-22,
  055fa0f MR-26, c59177f MR-41, ff2b272 MR-40 (norm-13), 99d5640 MR-38/MR-33/MR-37/MR-29/MR-39, e598d8a refresh fixtures at norm-13,
  9054eae e2e, docs and the chart patch, 89c88b1 review logs and this log, 2f51186 the Juice headline's fit, ee08a5a T-17,
  23f8f21 log, 3a109a0 the BP-13 e2e on the MR-39 rule, ebc00e0 "base pay median (US)", then this log.
- Not committed: the data links data/snapshots and data/beta/snapshots, and the node_modules link.
- For the lead: `docs/process/patches/fix-mr-3-chart-caption.diff` (MR-39's chart caption, fix-viz-5's file). Two one-token edits
  in other lanes' code: `postedTerm(s, job)` in `payPill` (fix-qa4's pill) and `isTermUnstated` passed to
  test/fix-pay-at-place.test.js's lifted app functions.

- **T-17** (the coordinator, mid-task, from the test-suite review): titles held line breaks as posted (Meta 1, Amazon 2).
  Folded into the same norm-13 bump with one golden re-baseline (ee08a5a).

## 1. Brief
- **Prompt:** [prompts/fix-mr-3.md](prompts/fix-mr-3.md), verbatim.
- **Goal:** fix MR-21, MR-22 ([methodology-review-beta](methodology-review-beta.md)) and MR-26, MR-29 (the UI half), MR-33, MR-37,
  MR-38, MR-39, MR-40 and MR-41 ([methodology-review-beta-2](methodology-review-beta-2.md)), a red test per ID first, keeping every
  posting and pay row ("we must present them as they are and not cut anything"), pay as posted, every line one line at every
  phone size.
- **Files owned:** server/salary.js and server/normalize.js (fixed-term pay), server/geo.js (gazetteer), scripts/build-market.js
  (fx.source), scripts/refresh/registry.js, the freshness rule for MR-26, in public/app.js the drawer's converted-pay and "As
  posted" lines, the stats line's median basis and the Mid chip's tip, public/features/insights.js (the tiles' basis),
  test/fix-mr-3.test.js, test/e2e/fix-mr-3.e2e.js, this log and the prompt file.

## 2. Inputs and sources
- **Docs read:** docs/CONTRACT.md (all sections from fix wave 4 on), docs/DATA_SOURCES.md §7 and §7a, the two review logs (MR-21,
  MR-22, MR-23 to MR-42), PLAYBOOK "Checkpoints" (step 6) and "Known traps", TEMPLATE.md, METHODOLOGY_GUIDE.md §1, §5, §7, §8,
  LIVABILITY.md's attachJuice rules, lead.md "Fix wave 5 integrated".
- **Code read:** public/app.js (postedTerm, payPill, cardTerm, payUnit, annualNote, drawerContent, juiceBlock, salaryDistribution,
  stats, renderKpis, SEN_TIP), public/features/shared.js (isFixedTerm, isInternLike, payCountry), public/features/insights.js
  (summaryStats, the tiles, update), public/viz/chart.js (payBasis, mainBasis, basisStats, the caption), public/viz/note.js,
  server/salary.js (payTerms, isFixedTermRole, PAY_AREAS, payAreaOf), server/geo.js (CITIES_RAW, splitCommaGroups, pickCity,
  resolvePlaceIn, resolvePlaceTokens, locationPrecision), server/keywords.js (the ladders), server/juice.js (attachJuice,
  matchCity), scripts/methodology-figures.js, scripts/refresh/{lib,run,derived,registry}.js, test/e2e/fix-phone-text.e2e.js
  (scanText, CAPTION_SEL), test/e2e/phone-sizes.mjs.
- **Data:** the 2026-10-16 crawl (Amazon 22,179, Apple 4,851, Google 3,821, NVIDIA 2,711, Microsoft 2,435, Meta 1,208, Netflix 414;
  stable 5,522), linked from `scratchpad/wt-data2/data`.
- **Skills:** none loaded (no artifact or chart made).
- **External:** none. Town coordinates are the towns' centres (the usual gazetteer form), each checked against its distance from
  Manhattan; the four borderline ones (Darien 59 km, East Northport 58 km, Freehold 57 km, Bridgewater 54 km) are kept in the area
  by about 1 km or more.

## 3. Decisions and rationale
1. **MR-38 is a client rule, not a normalizer field.** The review's own test asks `isFixedTerm(job)` to know an internship from its
   level and posted interval, with no new field. One rule in `shared.js` (`isTermUnstated`: level Intern, paid per hour, day, week
   or month, no `termWeeks`, no stipend, not part-time) keeps the server's salary unchanged (still annualized), so the market
   cells, Compstimate's Intern pools, the chart and the CSVs are unchanged, and no golden hash moves for it. A server flag would be
   a second rule that could disagree with this one.
   - Part-time hourly interns (Amazon 2) keep the part-time rule, which already shows the hourly rate.
   - Fixed-term pay of unstated length is out of the drawer's rank and strip pools, as any fixed-term pay is (`isTerm`).
   - Juice: the score is the same as before (as for a known term, worked out as if the pay lasted a year); the drawer shows it per
     month "while it lasts", with no Yearly or Whole-term view, since there is no whole term. The card's Juice tip already says
     "(while the internship lasts)" for any term.
   - The card has no term tag for it ("Internship, length not stated" would crowd the card; the pill says "/month" and the level
     chip "Intern").
2. **MR-33's line.** "≈ $6,025 a month in US dollars at Sep 2026 rates" for €5,233 a month; hourly keeps cents, a week or month
   whole dollars, a yearly rate for a term says "a year", whole-term pay "for the whole term". Where the line would wrap,
   "in US dollars" is hidden (`dropWhenWrapped`, a ResizeObserver like note.js `fitLine`) and stays in the tip, so it is one line
   on every phone from 320 px up.
3. **MR-37.** One visible line, "Stated as a yearly figure"; the Details quote the posting and the payments ("paid as 14 monthly
   payments of €3,358.33, not 12"; a row that doesn't divide evenly, 13.69 payments, says "about 13.7").
4. **MR-39: compute per main currency, as the rows do.** The review offered "say it pools countries" or "use one country". The rows
   (V-21), the drawer's strip (BP-3) and the market cells already compare one country, so the headline does too: with pay in two
   or more currencies in view, the median is the most common currency's (`mainPayCurrency`, USD on a tie), and the line says where
   ("in the US"). With one currency nothing changes. The pay share still counts every country. The chart caption is fix-viz-5's:
   a patch, not a change.
5. **MR-29.** The one sentence goes in the stats line's Details, which are also the chart notes' Details (UX-57): one place, no new
   control, on boards whose departments are read from titles (Google).
6. **MR-41.** No numeral is Mid on every board (Amazon III Senior, Google II Entry), so the tip uses the board's own example; "L4"
   alone would hold everywhere but is not what Google or Amazon titles say. The test reads each example through `jobSeniority`
   and refuses the "Level not stated" default.
7. **MR-40: the towns, and how they are read.** All 43 NY, NJ and CT towns of the crawl within about 80 km of Manhattan that sat at
   their state's centre, not only Microsoft's 4 (the area rule is distance, so every listed town should be at its place). Towns
   beyond 80 km (Trenton, Philadelphia's suburbs, Poughkeepsie) are left: they are outside the area either way. A plain gazetteer
   entry would have changed other strings ("Greenwich, London, United Kingdom" split into Greenwich, CT and London; a bare
   "Oceanside"; "Edison, United States"), so these are `?` entries, read only with their own state named. Over every location
   string of the crawl (67,372 in 43,141 postings) the change is exactly 43 results in 101 postings, latitude and longitude only.
   The Bay Area has the same kind of gap (East Palo Alto 80 Amazon postings, Burlingame 71 Meta, Brisbane, Hayward, Newark CA, …)
   but no Microsoft posting there, so it is a follow-up, not done here.
8. **norm-13, once.** The gazetteer change and T-17 are normalizer output changes, so stored norm-12 snapshots are re-derived
   once. The golden file was re-baselined once for both, from its norm-12 state, with `UPDATE_GOLDEN=1`: **3 of the 300 hashes
   changed**, all for T-17 (scaleai:4722811005 "Sr. Director, (Applied AI)  Forward Deployed Engineering",
   shieldai:9e5b2887 "… Integration –  Emerging Domains (R5401)", xai:5215034007 "Receiving Specialist, Supercomputer  Operations
   - Memphis": a double space is one space); the MR-40 towns change none (the sample is the stable boards). The refresh fixtures were regenerated with their own
   make-fixtures.mjs (test/refresh-jobs.test.js failed at norm-12: an older version re-derives the doctored keywords).
9. **MR-26: one rule in lib.js.** run.js already treated daily entries as pipeline data; the sources table and api/freshness.json
   did not. `shownOverdue` is that rule for every surface.
10. **T-17: what "a space left before a comma" means.** Only the line break (and the spaces around it) before a comma or
    period goes: "Manager\n, Benelux" is "Manager, Benelux". A space the posting itself writes before a comma ("Engineering
    Operation Technician , AWS Opportunity", 1,141 Amazon titles) is kept as posted; the rule is one regex if the lead wants those
    too. Every other run of whitespace (340 double spaces, 19 non-breaking spaces) is one space. 362 titles change on the
    2026-10-16 crawl, none in its words or their order. Fresh crawls get it in `normalizeJob`, stored snapshots in `relabelJobs`
    (run by `relocateJobs` on the version change). The ledger's fingerprints use `normText`, which already reads any whitespace as
    one space, so no posting's history changes.
11. **Registry.** Only the values my fixes move: geo-gazetteer is 384 cities (and its note). The 47 pending `--lines` moves of other
    lanes are left to the lead's batch resync (PLAYBOOK Stage 3).

## 4. Replayable steps
```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp     # 05263e8
ln -s $S/wt-data2/data/snapshots data/snapshots; mkdir -p data/beta; ln -s $S/wt-data2/data/beta/snapshots data/beta/snapshots
ln -s /home/user/melon-seek/node_modules node_modules
node scripts/build-static.js                                   # 7 min at load 6-19; beta 7/7
node $S/fmr3/tools/count.mjs $S/fmr3/before-counts.json         # per board, from the served lists with Juice attached
node $S/fmr3/tools/centroids.mjs NY,NJ,CT,PA                    # towns at their state's centre (MR-40); CA for the Bay Area
# fixes (see the commits), then:
node $S/fmr3/tools/geodiff.mjs                                  # every location string, base geo.js vs new: 43 results, 101 jobs
UPDATE_GOLDEN=1 GOLDEN_REASON="norm-13 fix-mr-3 (MR-40 ...)" node --test test/golden-normalize.test.js
node test/fixtures/refresh/jobs/make-fixtures.mjs
node $S/fmr3/tools/registry-edit.mjs mr40 && node scripts/refresh/registry.js --check && node scripts/refresh/registry.js --docs --write
node scripts/build-static.js && node $S/fmr3/tools/count.mjs $S/fmr3/after-counts.json && node $S/fmr3/tools/compare.mjs $S/fmr3/before-counts.json $S/fmr3/after-counts.json
node $S/fmr3/tools/count38.mjs                                  # MR-38 after, per board
git worktree add --detach $S/fmr3/clean HEAD; ln -s /home/user/melon-seek/node_modules $S/fmr3/clean/node_modules
(cd $S/fmr3/clean && MELON_BETA_SNAPSHOT_DIR= timeout 1200 npm test)
NODE_PATH=$S/pw/node_modules node scripts/e2e.js --grep="fix-mr-3"
```

## 5. Verification
- **Node tests:** test/fix-mr-3.test.js 17 tests; the reviewers' to-dos for my IDs are plain tests (beta-methodology-2: MR-26,
  MR-29 ×3, MR-33, MR-37, MR-38, MR-40, MR-41 ×2; beta-methodology: MR-21, MR-22). On 05263e8 these fail: 10 failures in the
  three files (7297ce7).
- **npm test, CI-like** (clean checkout, no data links): at 99d5640 1,259 tests, 1 fail (test/refresh-jobs.test.js, fixtures at
  norm-12: fixed in e598d8a, 14/14 pass); **at ee08a5a 1,261 tests, 1,220 pass, 0 fail, 8 skipped, 33 to-dos**.
- **Before and after, per board** (served lists, Juice attached; the beta site, which includes the stable boards):

  | Board | Postings | With pay | Pay rows | Places | With Juice | Internships of unstated length (Juice) |
  |---|---:|---:|---:|---:|---:|---|
  | Amazon | 22,179 | 13,980 | 16,831 | 34,138 | 9,819 | 0 → 91 (26), and 2 part-time hourly left as they were |
  | Meta | 1,208 | 948 | 948 | 2,937 | 897 | 0 → 35 (35) |
  | NVIDIA | 2,711 | 1,462 | 1,462 | 4,640 | 1,383 | 0 → 34 (34) |
  | Microsoft | 2,435 | 1,566 | **1,821 → 1,822** | 3,973 | 1,166 | 0 → 14 (12) |
  | Apple | 4,851 | 2,781 | 3,197 | 6,080 | 2,703 | 0 → 1 (1) |
  | Anduril | 2,537 | 2,388 | 2,388 | 3,430 | 2,070 | 0 → 5 (3) |
  | Palantir | 309 | 241 | 241 | 309 | 223 | 0 → 35 (33) |
  | Shield AI | 619 | 492 | 492 | 980 | 452 | 0 → 6 (6) |
  | xAI | 304 | 123 | 123 | 537 | 95 | 0 → 4 (4) |
  | Google, Netflix, Anthropic, OpenAI, Scale AI, Cohere | unchanged | unchanged | unchanged | unchanged | unchanged | 0 |

  **Nothing dropped:** every board's postings, postings with pay, places and Juice counts are equal before and after. The one
  pay-row change is a row added: microsoft:1970393556978017 (Philadelphia and Bridgewater) now keeps its posted NYC-metro range
  for Bridgewater beside the U.S. range (SB-5). Fixed-term postings by `isFixedTerm`: Amazon 3 → 94, Meta 10 → 45, NVIDIA 14 → 48,
  Microsoft 18 → 32, Anduril 22 → 27, Apple 0 → 1, Palantir 1 → 36, Shield AI 0 → 6, xAI 0 → 4.
- **MR-39 numbers:** Amazon's headline median $141K of 13,980 (803 converted) → $149K of the 13,177 paid in the US; the middle half
  $93K–175K → $96K–175K. Boards whose pay is in one currency keep their line.
- **MR-40:** Microsoft's Garden City (3), Fort Lee (1), Paramus (1) and Bridgewater (4) places move from the U.S. row to the
  NYC-metro row; e.g. microsoft:1970393556650765 "Pay by place: Redmond, Boston $102K–235K · Garden City, Mountain View, San
  Francisco $134K–261K".
- **e2e (test/e2e/fix-mr-3.e2e.js):** 30/30 on the fixed build (11 ID tests, 19 phone sizes: phone-sizes.mjs has 14 portrait
  phones and 5 postures today). On a build of 05263e8 (`scratchpad/fmr3/dist-base`) the 11 ID tests and the two phone sizes tried
  fail (13/13), e.g. "Amazon stats line median: expected "$149K base pay median in the US" (the long form it had then), got "$141K base pay median"",
  "Garden City at 42.17,-74.95 … priced at 102100–234700", "Daily · update due".
- **Phone lines** (fix-phone-text's scanText): every line I added or changed is one line from 344 px up. Below that the guard allows
  two, and these take two: at 280 px the converted line "≈ $6,025 a month at Sep 2026 rates" (the yearly one, "≈ $72K in US dollars
  at Sep 2026 rates", took two there before), and at 280 and 320 px the Insights tile notes ("of 12,529 in the US" as "of 13,980
  with pay" did) and the Juice headline ("$1,650/mo left for one person in Menlo Park"). The first phone run found the Juice
  headline at 2 lines from 360 to 393 px with " while it lasts"; that part now moves to the text below when it would wrap (2f51186).
- **T-17 on the rebuilt dist:** no title with a line break is left; the three read "Research Scientist, Machine Learning for
  Monetization (PhD)", "Partner Development Manager, Benelux Partner Team" and "Payroll Analyst - BENELUX, 12 months fixed
  contract, EMEA Payroll Operations". Per-board counts are unchanged (the same table as above).

## 6. Known gaps and follow-ups
- The chart caption (fix-viz-5's file) still pools countries until the lead applies `patches/fix-mr-3-chart-caption.diff`.
- Bay Area towns at California's centre (East Palo Alto 80, Burlingame 71, Brisbane 8, Hayward 7, Newark 7, …): the same kind of
  gap as MR-40, with no Microsoft posting there today.
- MR-35 (the shift tip's cents) is fix-qa4's and stays a to-do.

## 7. Change log
- 2026-10-23 13:13: checked out 05263e8, saved the brief, linked the 2026-10-16 crawl, built the base, counted the cases.
- 13:25–13:30: red tests (10 failures), then MR-21/MR-22, MR-26, MR-41.
- 13:30–13:40: MR-40 (43 towns, `?` entries after "Greenwich, London" split), norm-13, golden re-baselined (0 of 300 changed).
- 13:40–13:46: MR-38/MR-33, MR-37, MR-29, MR-39 in the app and Insights; CI-like npm test; the refresh fixtures at norm-13.
- 13:46–14:00: rebuilt, counted after, wrote the e2e file, the docs, the chart patch and the review-log statuses.
- 14:00–14:05: every phone size: the Juice headline wrapped at 360–393 px; fixed (2f51186) and re-run.
- 14:05–14:10: T-17 from the coordinator: cleanTitle, one golden re-baseline for norm-13 (3 of 300), unit tests.
- 14:10–14:30: CI-like npm test (0 fail), a build of the base for the before e2e (13/13 fail), the rebuilt dist (T-17), the
  related e2e groups: BP-13 expected the pooled median; updated to the MR-39 rule.
- 14:30–15:00: the stats line's basis words shortened to "(US)" (a filtered desktop line was 14 words with "in the US", over
  fix-density's 12); my e2e, BP-13 and the desktop guard 52/52; npm test 0 fail; the base worktree and its build removed.
