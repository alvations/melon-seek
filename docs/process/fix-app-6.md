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

## 5. Verification

## 6. Known gaps and follow-ups

## 7. Change log
- 2026-10-23 21:28: checked out db38a30, saved the brief, linked the 2026-10-16 crawl, built the base (7 min at load 10-13).
- 21:40: BN-1 reproduced on the base build.
