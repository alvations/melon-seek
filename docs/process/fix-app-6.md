# Process log: fix-app-6 (front-end engineer, fix wave 6)

## State
- 2026-10-24 00:45 UTC: **all eight IDs fixed and unit-tested; e2e running.** Resumed after the container restart at about 00:23 UTC
  (every background process was lost; the worktree and commits were intact). Base: db38a30 (detached; later than e800c43).
- Findings (persona reviews, wave 2, on e800c43's build; BN-3 to BN-8 and BN-1's country-wide counts from the lead by message):
  - BN-1 (High) false Location counts under a pay minimum (27bb06c), and a town's own count hidden in its country's (80a676b).
  - BN-2 (Medium) a bare "$" median over pay in one foreign currency (27bb06c).
  - BN-3 (Medium) the count twice in de-DE, de-CH, fr-FR, pl-PL (27bb06c).
  - BN-4 (Medium) part-time hourly pay led with a full-time year called "posted pay" (27bb06c).
  - BN-5 (Medium) a place set aside "for now" lost once another tick changed (27bb06c).
  - BN-6 (High) posted minimums hidden by a pay floor; the Salary note and the empty state didn't count them (27bb06c).
  - BN-7 (Medium) Seniority words, the level chip, two-level postings (27bb06c; the chip from the loaded posting, 80a676b).
  - BN-8 (Medium) the typed currency kept in the chip, the link and the saved name; zł and grouped thousands (5ceb621).
- Tests: test/fix-app-6.test.js 20 tests, 18 fail on 4ebe24f (2 guards pass), 20 pass at 5ceb621. npm test CI-like at 30fc159:
  1,326 tests, 1,316 pass, 0 fail, 10 skipped. The e2e of 27bb06c's build: 18 of 21 BN tests passed; the 3 failures were the test's
  own (an empty list's ready state, a narrow no-break space), fixed in 4a0265d.
- In progress: the rebuilt dist at 5ceb621 (build3.log); my e2e on the base build (`scratchpad/fa6/dist-base`, e2e-red.log).
- Next: my e2e on the rebuilt dist, the related groups (fix-mr-3, fix-pay-at-place, Fix3 app, Fix app, fix-viz-5, Beta mobile QA 4, Beta
  desktop QA 4, the Location filter's tests), CI-like npm test at the last SHA, screenshots, send the SHA to the lead.
- Not committed: the data links data/snapshots and data/beta/snapshots, and the node_modules link.

## 1. Brief
- **Prompt:** [prompts/fix-app-6.md](prompts/fix-app-6.md), verbatim. BN-3 to BN-7 and BN-1's country-wide counts came from the lead by
  message (persona-beta-2-45-54, -25-34, -55-plus, -35-44, -18-24).
- **Goal:** fix the wave-2 persona findings in the filters, the facet counts and the headline medians, a red test per ID first, every
  posting and pay row kept, pay as posted, every changed line one line at every phone size.
- **Owned:** public/app.js derive() and the facet counts, the stats line's median and its basis, settleKeep() (BN-5), the pay
  filter (BN-6); public/features/insights.js' tiles' basis; the label text of the map pins and the chart caption;
  test/fix-app-6.test.js, test/e2e/fix-app-6.e2e.js, this log and the prompt file.
- **Not owned:** the map's fit and the layout over 860 px (fix-ui-6); server/geo.js, keywords.js, Compstimate's comparables
  and payPlaceText (fix-data-6).

## 2. Inputs and sources
- **Docs read:** docs/CONTRACT.md (fix wave 3 on: fix3-compare, fix3-viz, fix-pay-at-place, fix-qa4, fix-mr-3), docs/DATA_SOURCES.md §7, §7a,
  PLAYBOOK "Checkpoints" (step 6) and "Known traps", TEMPLATE.md, fix-mr-3.md (MR-39), fix-pay-at-place.md (`payAt`), fix-app.md (I-6),
  lead.md from "Fix wave 5" on, METHODOLOGY_GUIDE.md §8.
- **Code read:** public/app.js (failures, derive, coverIndex, placeCover, coveredBy, coverLoc, locMatches, placePay, payHere, usdHere, shownJuice,
  stats, renderKpis, makeChecklist, makeSalary's sync, emptyState, stateCard, switchCompany, settleKeep, dropHeld, clearFilters,
  clearPopoverFacet, SEN_NOTE, SEN_TIP, the drawer's d-meta, fillDescription), public/features/shared.js (payAt, mainPayCurrency, notBasePay,
  percentile), public/features/insights.js (summaryStats, the tiles), public/features/roles.js (displayLevel), public/viz/chart.js (basePayStats,
  basisStats, headPay, medianCaption, renderHist, renderAxis), public/viz/map.js (aggregate, summarize, pinCountText, pinElement, pinName,
  the pay legend), public/viz/palette.js (FX_PER_USD, formatCurrency), server/keywords.js (MICROSOFT_IC, MICROSOFT_M, NVIDIA_LEVEL,
  seniorityFromPay), test/e2e/fix-mr-3.e2e.js and fix-phone-text.e2e.js (scanText), test/e2e/fix3-app.e2e.js (BP-10), phone-sizes.mjs.
- **Data:** the 2026-10-16 crawl, linked from `scratchpad/wt-data2/data` (Amazon 22,179, Apple 4,851, Google 3,821, NVIDIA 2,711,
  Microsoft 2,435, Meta 1,208, Netflix 414).
- **Skills:** none loaded (no artifact or chart made). **External:** none.

## 3. Decisions and rationale
1. **BN-1: judge the place-dependent filters at each counted place.** Only two filters read the Location filter: the pay filter (`payHere`,
   `usdHere` through `placePay`) and the Juice grade (`shownJuice`). For the Location counts they are now judged with a spec whose `l` is the
   one place counted (`judgeAtPlace`), so a place's count is exactly what picking it alone shows, with any other place picked or none
   (with no place picked a pay floor was judged at the headline row, and picking a place judges it there: Amazon's Seattle-and-Vancouver
   postings counted for Vancouver at Seattle's pay). The same `salWhy`/`jgFails` the filter uses, so the two can't drift. A posting's
   answer is memoised by which of its locations the place takes in (a country-only posting covers many cities the same way). Every other
   facet was checked with every other filter (unit test 4 and the e2e): their filters don't read another facet, so they were right.
2. **BN-1, the search box.** `searchable: 'auto'` counted the items the filters left (5 under a pay floor), so the box went. It now also
   counts the board's own options (`boardOptions`), so a board with more than 8 places always has it.
3. **BN-1, country- and state-wide postings (the lead's addition).** CONTRACT and fix-app's I-6 say a city pick finds postings listed only
   for its country or region, and that its count includes them so a pick gives its count; test/e2e/fix-app.e2e.js [I-6] checks the pick.
   Both stay. What changes is how the number is shown: the town's own postings, then the wide ones beside them ("Palmetto 3 +294", the
   row's title says what the second number is), and the list sorts by the own count, so US towns are no longer ranked by Microsoft's
   294 "United States" postings. The map's pins under a Location filter say the same ("83+294"; `pinCount`), and `aggregate`'s `wide`
   no longer counts a posting that also names the place.
4. **BN-2: one rule, `headlineMedian(pool)`, for the four surfaces.** MR-39's basis is kept; the change is the currency the figure is
   written in: the currency of the postings it is of (one currency in view, or the main one of several), as the cards write pay. So a
   view in Canadian dollars reads CA$101K, and the euro area's median in a mixed view reads €81K (euro area) rather than a converted dollar
   figure under a basis label. The approx-USD value stays for the chart's positions and the map's colours (the map legend's Details say
   the figure is in the postings' currency and the colour compares in US dollars). One formatter (`medianText`, palette's
   `formatCurrency`) for the four, so they agree to the character.
5. **BN-3.** The count's word is built without the number. Every other `toLocaleString()` in public/ was checked for a strip or a parse
   with a comma-only pattern: none (the salary box's parser reads typed text with both separators; `severalRangesTip` reads posted text).
   A unit test scans for the pattern.
6. **BN-4.** A pool that is all part-time hourly pay gives the hourly median as posted ("$X/hour posted pay median"); a pool that only
   partly is (with minimums or shift pay) says "median, a year if full-time" (fitted to "median if full-time"), and never "posted pay".
   Full-time hourly base pay keeps its yearly figure (a full-time year is its real pay). "The median is base pay" is now "of posted pay" /
   "of part-time pay" when none is base pay. The chart's caption follows ("Median posted pay $X/hour", "Median if full-time $56K").
7. **BN-5.** A list facet keeps what it set aside while the person changes it (adding or removing other values); only Clear all, the
   facet's Reset, a saved search or Compare companies drop it, and the first two say so in a toast. A one-value filter (role family,
   Remote, listing date) still drops it once another value replaces it: a new value there is a choice over the old one. The pay minimum
   was never set aside (it is kept on every board). The old BP-10 e2e asserted the opposite ("not put back after the person picked
   another place"); it now asserts the BN-5 rule.
8. **BN-6.** A posted minimum has no stated top, so `u.max < smin` read its minimum as the most it pays. It is kept under any floor (and
   still hidden by a ceiling under its minimum: it pays at least that). The mirror case is pay stated "up to" one figure with no base
   (top shift pay, `shiftRange().upTo`): never hidden by a ceiling. Every role the pay filter alone hides is now counted by reason
   (`fc.salWhy`), in the Salary note and the empty state; the empty state names every filter whose removal alone brings roles back.
9. **BN-7.** VT-8 stands: no posting's level changes. A client copy of keywords.js's ladders (`POSTED_LADDERS`, checked rung by rung
   against `seniorityFromPay`) reads the levels a posting's pay names; a posting at two of our levels is found and counted under both.
   The chip shows the posted level ("Manager · Microsoft M5–M6"); the served lists keep only the pay range for one-level postings, so for
   those the chip reads the level once the posting's text loads ("Staff+ · Microsoft IC5"); the filter never reads the text, so it finds a
   posting the same way before and after.

## 4. Replayable steps
```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp     # db38a30
ln -s $S/wt-data2/data/snapshots data/snapshots; mkdir -p data/beta; ln -s $S/wt-data2/data/beta/snapshots data/beta/snapshots
ln -s /home/user/melon-seek/node_modules node_modules
node scripts/build-static.js && cp -r dist $S/fa6/dist-base                 # the base build, 7 min at load 10-13
PORT=0 node scripts/cycle/serve.mjs --dist $S/fa6/dist-base --pid $S/fa6/serve-base.pid
EXTRA='Dublin' NODE_PATH=$S/pw/node_modules node $S/fa6/tools/probe-bn1.mjs http://127.0.0.1:<port> 'c=google&smin=40000&l=Warsaw' 4
node --test test/fix-app-6.test.js                                           # red on 4ebe24f (copied into the clean checkout)
# fixes (see the commits), then:
node scripts/build-static.js
node $S/fa6/tools/two-levels.mjs dist        # BN-7: postings on two of our levels, per board
node $S/fa6/tools/minimums.mjs dist          # BN-6: Amazon in Milan and the EU under a €35,000 floor
git worktree add --detach $S/fa6/clean HEAD; ln -s /home/user/melon-seek/node_modules $S/fa6/clean/node_modules
(cd $S/fa6/clean && MELON_BETA_SNAPSHOT_DIR= timeout 1500 npm test)
BETA_QA_DIST=$S/fa6/dist-base NODE_PATH=$S/pw/node_modules node scripts/e2e.js --grep="fix-app-6"     # red
NODE_PATH=$S/pw/node_modules node scripts/e2e.js --grep="fix-app-6"                                   # green
FIX_APP_6_SHOTS=1 NODE_PATH=$S/pw/node_modules node scripts/e2e.js --grep="fix-app-6: \[BN"           # screenshots
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-app-6
```

## 5. Verification
- **Unit tests:** test/fix-app-6.test.js, 20 tests: on 4ebe24f 18 fail (the two that pass are guards: the other facets' counts were already
  right, and nothing is dropped); at 5ceb621 20 pass. Three tests of other lanes pinned the old rules' source or behaviour and were updated
  to the new rules: fix-mr-3 MR-39 (`headlineMedian(` now holds `mainPayCurrency(`), fix3-app's shared decisions (the pay filter's test is
  `salWhy`), and the e2e BP-10 and P-5 (below).
- **npm test, CI-like** (clean checkout, no data links): at 30fc159 1,326 tests, 1,316 pass, 0 fail, 10 skipped.
- **Before → after on the 2026-10-16 crawl** (`scratchpad/fa6/dist-base` vs the rebuilt dist; probes `tools/probe-bn1.mjs`,
  `tools/probe-lines.mjs`, `tools/minimums.mjs`, `tools/two-levels.mjs`):
  - **BN-1**, the count listed for a place vs the roles shown after picking it alone, the pay floor kept:
    - Google + Warsaw + $40K: before 5 places listed and no search box; Dublin 2 (alone 137), Krakow 7 (14), Wrocław 4 (6), London 1 (0).
      After 191 places and the box; Dublin 137 = 137, London 0 = 0, Mountain View 634 = 634.
    - Amazon + Toronto + $50K: before 7 places; Vancouver 22 (178), Montreal 10 (29), Ottawa 6 (17), Seattle not listed (3,668). After
      895 places; Vancouver 178 = 178, Seattle 3,668 = 3,668.
    - Apple + Cupertino + $100K: before Sunnyvale 32 (421), San Diego 103 (361), Austin 164 (0). After Sunnyvale 421 = 421, San Diego
      361 = 361, Austin not listed (no Austin pay passes).
    - Country-wide postings: Microsoft, no filter: before Atlanta 377, Austin 370, Palmetto 297 (3 name it); after Atlanta 108 +269,
      Austin 86 +284, Palmetto 3 +294, "United States" 294 its own row; a Palmetto pick still shows 297, and its map pin reads "3+294"
      (was "297").
  - **BN-2:** Amazon interns in Vancouver "$72K base pay median" → "CA$101K base pay median", chart "Median base pay CA$101K"; the
    Toronto pin "$72K · 5" → "CA$101K · 5"; Google Warsaw "$75K" → "PLN 283K"; Google Dublin "$88K" → "€77K"; Microsoft Canada "$114K"
    → "CA$159K". Mixed boards keep MR-39: Amazon "$152K base pay median (US)" before and after.
  - **BN-3:** de-DE 1114x720, Google: "3.821 3.821 roles · …" → "3.821 roles · …".
  - **BN-4:** Apple, Part-time, Arlington + Washington DC + Fairfax + Tysons + McLean (12 roles): "$56K posted pay median" → "$26.80/hour
    posted pay median"; chart "Median posted pay $56K" → "Median posted pay $26.80/hour".
  - **BN-6:** Amazon has 285 posted minimums. Under a €35,000 floor ($40K): Milan (89 postings that name it) 54 shown → 84 (the 30 posted
    minimums under the floor are kept; 1 no pay, 3 paid elsewhere and 1 range under the floor stay hidden); the EU (2,113 postings) 185 →
    313 (128 minimums kept). The Salary note now counts every role the floor hides ("N roles hidden by the pay filter" = before − after).
  - **BN-7:** postings whose posted levels are two of ours, now found and counted under both: Microsoft 102 (Mid+Senior 40, Senior+Staff+
    59, Manager+Director+ 3), NVIDIA 51 (Mid+Senior 39, Senior+Staff+ 12); Amazon, Apple, Google, Meta and Netflix 0 (no posted ladder
    in the pay: Amazon's and Google's levels come from title numerals, one level each). Microsoft "Director" titles: Director+ 52, Staff+
    45, Manager 21, Senior 1, Not stated 1, unchanged (VT-8); 0 postings whose shown level is outside their posted levels.
  - **BN-8:** "PLN 150,000" → chip "PLN 150K+" (was "$40K+"), link `smin=150000&sc=PLN` (was `smin=40000`), the same 60 Warsaw roles as the
    dollar link; "360 000 zł" read (was refused); a bare "150000" in Warsaw → PLN 150K (was $150K); "£75,000" at Microsoft London saved
    as "Microsoft · £75K+ · London" (was "$101K+").

## 6. Known gaps and follow-ups
- **The chart's rows** (V-21, fix-viz-5's) still write a row's median in US dollars with its basis ("median $127K in Canada"); only the
  caption follows BN-2. Insights' other cards (Pay by department, the places' medians) are on a US-dollar axis and say so in their Details.
- **One-level Microsoft postings** carry only the pay range in the served lists, so the chip names their posted level ("Staff+ · Microsoft
  IC5") once the posting's text loads; a server field with the posted label (fix-data-6's keywords.js/normalize.js) would let the card say
  it too.
- **BN-4's mixed case** (part-time hourly with yearly figures) is unit-tested and fitted ("median, a year if full-time" / "median if
  full-time"), but no board in the 2026-10-16 crawl gives it at the phone sizes, so the phone test measures the all-hourly line.
- **BN-8**: the slider moves a bound in the typed currency's round thousands (it snaps to $5K in dollars), and a bound typed in another
  currency re-expresses the other one in it (rounded to a thousand, so its dollar figure can move by under $1K).

## 7. Change log
- 2026-10-23 21:28: checked out db38a30, saved the brief, linked the 2026-10-16 crawl, built the base (7 min at load 10-13).
- 21:40: BN-1 reproduced on the base build.
