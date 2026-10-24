# Process log: fix-data-6 (data and test engineer, fix wave 6)

## State
- 2026-10-24 08:45 UTC: **on top of f13ebd6** (the lead's integration: fix-salary-6, fix-ui-6, fix-juice-6, fix-app-6), detached,
  after rebasing onto e77cd41, then 942db8a, then f13ebd6 as the lead asked. Every ID is fixed and committed: G-1, T-19, C-1;
  K-1, P-1, P-2, P-3, P-4, R-1, R-2, R-3, G-2, G-3. Head: see the change log's last line.
- **Verified at 6963435 (P-4 head):** npm test CI-like in the clean checkout: 1,381 tests, 1,371 pass, 0 fail, 10 skipped. e2e
  on its build: the groups P-4 touches (fix-data-6, Fix3 app, Fix app, fix-juice-6, fix-salary-6, fix-pay-at-place, Compstimate,
  fix-estimates, fix-app-6, fix-qa4) 315 of 316; the one failure, fix-juice-6 [J-4] at 1280x800, is a race in that test (§3,
  19), fixed in the next commit; re-run alone on the same build, J-4 passes at both its sizes (2 of 2). T-19's pair with `--max-skips=0`: 2 of 2, no skip.
- Not committed: the data links (data/snapshots, data/beta/snapshots) and node_modules.
- norm-14 is shared with fix-salary-6 (one bump; the golden history has both lanes' norm-14 entries).

## 1. Brief
- **Prompt:** [prompts/fix-data-6.md](prompts/fix-data-6.md), verbatim.
- **Goal:** G-1 (towns at their state's or country's centre near the big-tech hubs, the Bay Area first), T-19 (two e2e tests that
  skipped on every run), C-1 (the Pay estimate's "Most comparable roles" on a tie). Added by the lead from the persona reviews of
  wave 2: K-1 ("+ bonus mentioned" on "+ 0% bonus target"; a stated target as posted), P-1 (pay posted for named places read as
  "the US only"), P-2 (the job page rounds the posted yearly figure), P-3 (full-time hourly pay shown annualized on the card), R-1
  (warehouse and store associates in customer support), R-2 (lead associates filed Senior), R-3 (a title word beats a data-center
  department; Amazon postings with no family).
- **Files owned:** server/geo.js and the normalizer version; server/keywords.js (K-1, R-2); public/features/roles.js (R-1, R-3);
  public/features/compstimate.js (the comparables' order, and FAMILY_TITLES for R-1); public/app.js payPlaceText, payPill, the
  drawer's pay heading, payUnit/payHeadline, payLabels' bonus chip and annualNote's hourly line (P-1, P-2, P-3, K-1);
  test/e2e/fix-app.e2e.js [P-2] and test/e2e/desktop-qa.e2e.js [D-11]; test/fix-data-6.test.js, test/e2e/fix-data-6.e2e.js,
  this log and the prompt.

## 2. Inputs and sources
- **Docs read:** CONTRACT.md (fix-qa4 and fix-mr-3 sections), DATA_SOURCES.md §7, §7a, §7e, PLAYBOOK "Checkpoints" and "Known
  traps", TEMPLATE.md, fix-mr-3.md (all), qa-suite-beta.md (T-19, §9.1), fix-qa4.md §6, lead.md from "Fix wave 5", METHODOLOGY_GUIDE §8.
- **Code read:** server/geo.js (CITIES_RAW, pickCity, resolvePlaceIn, resolvePlaceTokens, finalCountry, splitCommaGroups,
  locationPrecision), server/salary.js (PAY_AREAS, payAreaOf), server/normalize.js (compExtras, relabelJobs, relocateJobs),
  server/keywords.js (compExtrasEvidence, BONUS_STRONG, seniorityOf, jobSeniority), public/features/roles.js (FAMILIES, DEPT_HINTS,
  roleFamily, FAMILY_AFFINITY), public/features/compstimate.js (estimateComp, FAMILY_TITLES), public/features/shared.js (payTable,
  payLocations, postedPlaces, pricedPlaces, placeLabel), public/app.js (payPill, payPlaceText, payLabels, payUnit, payHeadline,
  payPlacesLine, annualNote, the drawer's pay block, hasListingDates), public/viz/note.js (fitLine), public/viz/map.js (pins),
  test/e2e/fix-phone-text.e2e.js (scanText), test/e2e/phone-sizes.mjs, fix-mr-3's tools.
- **Data:** the 2026-10-16 crawl (43,141 postings, 67,372 location strings), linked from `scratchpad/wt-data2/data`.
- **External:** GeoNames' cities over 1,000 people, from the npm package `cities.json` 1.1.65 (CC BY 4.0, downloaded to
  `scratchpad/fd6/gaz-dl`, read as data only, not a dependency). census.gov and download.geonames.org are blocked here. For 37
  places GeoNames lacks or names otherwise, the coordinates are the towns' usual ones (listed in `scratchpad/fd6/tools/manual.json`
  with their source; a county is at its seat).
- **Skills:** none loaded.

## 3. Decisions and rationale
1. **G-1: which places.** Every place `locationPrecision` calls `centroid` (1,469 places, 9,365 postings) was matched to GeoNames
   (state for US places; the posting's own province where a name repeats) and measured to the nearest hub: a gazetteer city with
   200 or more postings from the seven boards (47, Nashville, Menlo Park, Cupertino, Culver City, Kirkland and Yokneam included),
   or Washington, DC, which the brief names. Kept: within 85 km ("about 80 km": a town of a metro just past 80 km, such as Kenosha,
   Hagerstown or Rialto, is not left out by a few hundred metres). 359 places. Bangalore has none (its only centroid places are
   states). Left out: "Bogota, D.C." (Bogotá, Colombia: another country, not a town at its centre, 15 Amazon postings; reported),
   "Monroe Twp" and "Hamilton Twp", NJ (two townships of each name), "Jefferson, GA" (85.7 km, two of the name), and region names
   read as towns ("Kanagawa, JPN", "Uttar Pradesh, IND").
2. **G-1: read only where it can't move another string.** Every new entry is a `?` entry. One with no region (the gazetteer knows
   no state for "Thane, Maharashtra, IND") is read with its own country named, never as a later part of another place and never to
   split a list: a plain "Hsinchu City" split "Hsinchu, Hsinchu City, TW" into two places (72 NVIDIA postings) in the first
   geodiff. `finalCountry` ignores `?` entries: with `?Ontario|CA|US` the Google string "Ontario, CA" (Canada) read as Ontario,
   California. With both rules geodiff shows only latitude and longitude changes.
3. **G-1: names stay.** Each entry keeps the city and region the posting already produced ("Sagamihara-shi", "Yokohama-shi" at the
   gazetteer's Yokohama), so names, the Location filter's entries and their counts are unchanged; merging "Yokohama-shi" into
   "Yokohama" would be a name change, a follow-up if wanted.
4. **K-1: what is removed.** Only a figure that is zero ("0%", "0.0%", "0,00 %") before "bonus", "incentive" or "commission".
   Stored snapshots: `relabelJobs` clears `extras.bonus` only when `zeroBonusOnly` explains it (evidence with the zero reading and
   without), so no other stored extras change. The lead's sibling: `extras.bonusTarget` keeps one stated figure as posted; two
   different figures (none on the crawl) give none, since which is this job's is not said.
5. **R-2:** Mid, by title: a lead associate is one step above an associate (Entry by the title rule), and Mid keeps them apart from
   the associates in comparisons. Only where "associate" ends the role ("Lead Associate Scientist" stays Senior) and no "Senior" is
   named; professional leads (1,122 "lead" titles still Senior on the crawl) do not move.
6. **R-1/R-3: one operations family.** The lead's R-3 asked for Amazon's area and station managers in the same family as the
   associates, so the family is "Warehouse, delivery & store operations" (`site-ops`), not "associates"; levels keep associates and
   managers apart in every comparison. Associates by title; managers by Amazon's departments ("Fulfillment & Operations
   Management", "Fulfillment Associate"), never for a generic engineer title there (process and automation engineers keep the
   engineer fallback). "Area Manager" alone names no family (other companies use it in sales). Data-center rules: only where the
   department names the data center, except a subject matter expert, whose title alone may say it (Google's "Public Affairs Subject
   Matter Expert, Data Center Operations" is policy). The old title rule for operations staff stays as it was (a plural "Data
   Centers" in a strategy director's title would otherwise move it).
7. **P-1:** name the places when any of them is in a country of the places picked; the country otherwise, so Zurich's US pay still
   reads "for the US only" (Fix3 app [BP-2]). Places are named in the posting's order ("Seattle and Herndon").
8. **P-2:** the heading's sub line already says "per year", so the heading is the figure alone ("$119,800–234,700"), not "... a
   year". Where the exact figure would wrap (the heading's 26 px at 280 px), `fitOneLine` falls back to the card's figure. Levels'
   rows keep their D-21 form ("$287.5K").
9. **P-3:** the short form ("$31–55/hour") is for the full-time hourly pill only and at 340 px and under, as the lead asked;
   part-time and shift pills are unchanged (they already fit). The yearly figure is in the tip, the drawer's yearly line and the
   chart; `salary.min/max` do not change.
10. **C-1:** reorder only what is listed, never `comps`: the cut at MAX_COMPARABLES and the estimate use the sorted list, so a new
    tie-break there could change which roles the estimate uses. A tie group larger than the room left shows the members nearest the
    estimate's mid, low and high, then halfway between, sorted by pay; confidence (`topSim`) is over the same weights.
11. **norm-14, once** for G-1, K-1 and R-2. The golden file was re-baselined once from its norm-13 state with `UPDATE_GOLDEN=1`:
    **2 of the 300 hashes changed**, both G-1 towns (palantir:802add74 "Kitsap, WA", xai:5216075007 "Bastrop, TX"); K-1 and R-2
    change none (the sample is the stable boards). The refresh fixtures were regenerated with their make-fixtures.mjs (version only).
12. **G-2 (from the lead): a bare ISO code that is also a US state code is the country** (AL Albania, ME, MD, MT, PA, GA, MA,
    MN, SC, VA, NE, and LA, a Los Angeles alias), at its centre (`TWIN_CENTRES`, Google's countries.csv), as DQ-1 already reads
    DE, IN, IL and CA, unless another of the job's places is in the US ("Austin | TX | AL" stays Alabama); PR stays with the US.
    Done in `geocodeMany`, where the job's other places are known, not in `regionInfo`, which a single "AL" string also reaches.
13. **G-3 (from the lead):** "Bayshore Shopping Centre, Canada" is an Ottawa alias (Apple's store); a dotted two-letter
    abbreviation ("N.L.") is never a country code in `regionInfo` and `finalCountry` ("U.S." and "U.K." still are); Monterrey is a
    gazetteer city (GeoNames), so "Monterrey, N.L." is Monterrey, Mexico.
14. **T-19:** Fix app [P-2] now picks its role in the page with `compstimateForJob` (the first of the roles without pay that gets an
    estimate) and fails if the drawer then shows none. Desktop QA [D-11] gets an undated board from a fixture (openDesk has
    fix-app's `patch` hook now) and also checks a "Newest" link and the dated board. On the integrated code the drawer shows an
    estimate only where `estimateView` allows one (a role in another country than its comparables shows none), and the basis
    line sits behind Details: the test picks with `estimateView` and reads the folded text.
15. **Rebases (the lead's three integration heads).** Conflicts were only where both lanes wrote: `NORMALIZER_VERSION`'s comment,
    the e2e registrations, CONTRACT's new sections, one DATA_SOURCES row and one guide paragraph (both kept, mine added into
    theirs), and `payUnit`, which now takes S-1's `fmt(lo, hi, currency)` and P-2's `exact`. The golden file was re-baselined once
    on top of fix-salary-6's with the tooling (`UPDATE_GOLDEN=1`): its 2 G-1 hashes, both lanes' norm-14 entries in the history.
    Other lanes' tests changed only where P-2 changes what they read: fix-pay-at-place's and fix-salary-6's job-page figures are
    now the posted ones ("$60,200–128,800", "€124,000–127,000"; the cards keep "$60K–129K", "€124K–127K"), and fix-salary-6's
    unit harness stubs `isFullTimeHourly`.
16. **One line at 280 and 320 px.** The brief asks for one line at all 21 sizes, stricter than fix-phone-text's two below 360 px,
    so my phone tests now ask for one. Three lines needed shorter forms (`fitOneLine`): the hourly heading ("$27.98–48.99 an
    hour", then "/hour", then whole dollars as on the card), the yearly line ("About $58K–102K a year", the 2,080 hours in
    Details) and P-1's line ("For Seattle and 1 more only", then "Posted for other places"). The "Pay posted for … only" pill is
    not a caption: it wraps by design (`.sal-pill--elsewhere`, max-width 10.5em, fix3-app BP-2; "Pay posted for the US only"
    took two lines, a per-place posting's names three). Making it one line is a layout change (fix-ui-6's), so the test asks it
    never to be cut and to take no more lines than a per-place posting's pill (3).
17. **A programme's yearly rates by place** (amazon:10502807, an internship with one row per place) are exact on the job page too
    ("$39,695–44,115/year"), as its Pay by place rows are; 1 posting.
18. **P-4 (from the lead): `payLocations` follows the rows.** Every place a row prices has posted pay there, at its row and in its
    currency (`pricedPlaces`, as `payAt` reads it). The headline figure keeps its own places in a new `headlinePayLocations` (the
    old rule): `payCountry` reads it, so rankings and Compare stay in the headline's country, and the pay estimate imports it as
    its `payLocations`, since it prices a comparable at its headline unless it has a row at the city asked (a German place must
    never be priced at a US figure); the backtest does not move. The app's `_payLocs` follows the rows: Juice under a Location
    filter at a row-priced place (the server already scores it on that row), the card's place order, "No Juice" places, and the
    countries "Pay posted for … only" names ("the US and Germany"). Callers checked: app.js (`shownJuice`, `locSummary`,
    `juiceMissing`, `payPlaceText`), compstimate.js (six, all on the headline), shared.js (`payCountry` on the headline;
    `payTable`'s one-range path has no rows, so unchanged; `payAppliesIn` and `payLocationKeys` have no caller). Fix3 app [BP-2]
    reads its expectation from the rows; beta-vetting VT-5 now checks that Spain's places are priced at Spain's own line.
19. **fix-juice-6 [J-4] at 1280x800** failed on every run of my builds: a hash-only goto to Google keeps the previous board's
    chart (Microsoft's, from the step before) for a moment, so the first edge chip in the DOM was Microsoft's "›1" while the
    hover landed on Google's "‹2" (probe: `scratchpad/fd6/tools/j4probe.mjs` with PRE=microsoft). My data changes picked a
    Microsoft case for the step before; the race is the test's. The tip is now checked for the chip under the mouse (`:hover`).

## 4. Replayable steps
```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad; T=$S/fd6/tools
git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp     # 00bd52c
ln -s $S/wt-data2/data/snapshots data/snapshots; mkdir -p data/beta; ln -s $S/wt-data2/data/beta/snapshots data/beta/snapshots
ln -s /home/user/melon-seek/node_modules node_modules; cp server/geo.js $S/fd6/geo-base.js
node scripts/build-static.js --out $S/fd6/dist-base                        # the base build (7/7 beta)
node $T/scan.mjs --json $S/fd6/scan-base.json                              # 1,469 centroid places, 9,365 postings
curl -o $S/fd6/gaz-dl/cities.json-1.1.65.tgz https://registry.npmjs.org/cities.json/-/cities.json-1.1.65.tgz; tar -xzf ... -C $S/fd6/gaz
node $T/match.mjs $S/fd6/scan-base.json $S/fd6/match-base.json 95         # hubs, GeoNames + manual.json, distances
node $T/gen.mjs $S/fd6/match-base.json 85 > $S/fd6/g1-lines.txt            # 359 lines
python3 $T/block.py server/geo.js $S/fd6/g1-lines.txt                      # the block at the end of CITIES_RAW
WT=$PWD DIST=$S/fd6/dist-base node $T/geodiff.mjs                          # 359 results, 2,206 postings, lat/lng only
node $T/registry-edit.mjs g1 && node $T/registry-edit.mjs r1 && node scripts/refresh/registry.js --check && node scripts/refresh/registry.js --docs --write
UPDATE_GOLDEN=1 GOLDEN_REASON="norm-14 fix-data-6 (...)" node --test test/golden-normalize.test.js; node test/fixtures/refresh/jobs/make-fixtures.mjs
WT=$PWD node $T/k1count.mjs; WT=$PWD node $T/k1pct.mjs                    # K-1 counts and wordings
BEFORE=$S/fd6/clean AFTER=$PWD node $T/lvdiff.mjs; BEFORE=$S/fd6/clean AFTER=$PWD node $T/famdiff.mjs   # R-2, R-1/R-3
node scripts/build-static.js; DIST=dist node $T/count6.mjs $S/fd6/after6.json; node $T/compare6.mjs $S/fd6/before6.json $S/fd6/after6.json
DIST=dist node $T/p3count.mjs; DIST=dist node $T/c1.mjs microsoft "Software Engineer" Redmond
git worktree add --detach $S/fd6/clean HEAD; ln -s /home/user/melon-seek/node_modules $S/fd6/clean/node_modules
(cd $S/fd6/clean && MELON_BETA_SNAPSHOT_DIR= timeout 1500 npm test)
NODE_PATH=$S/pw/node_modules node scripts/e2e.js --grep="fix-data-6"
NODE_PATH=$S/pw/node_modules BETA_QA_DIST=$S/fd6/dist-base node scripts/e2e.js --grep="fix-data-6: \[(G-|K-|P-|R-|C-)"   # red
NODE_PATH=$S/pw/node_modules node scripts/e2e.js --grep="Fix app: \[P-2\]|Desktop QA: \[D-11\]" --max-skips=0
```

## 5. Verification
- **G-1, geodiff over every location string** (43,141 postings, 67,372 strings, base geo.js against the new one): **359 distinct
  results change, in 2,206 postings (2,547 strings: Amazon 2,254, Meta 129, Google 50, Microsoft 48, Apple 40, Anduril 15, xAI 6,
  Palantir 4, Netflix 1), latitude and longitude only.** 18 results move into the SF Bay Area (none into or out of NYC's).
- **G-1 before and after, per board** (served lists with Juice attached; beta site, which includes the stable boards):

  | Board | Postings | With pay | Pay rows | Places | Juice | Places at a centre | Postings with one | Places in SF Bay Area |
  |---|---:|---:|---:|---:|---:|---:|---:|---:|
  | Amazon | 22,179 | 13,980 | 16,831 | 34,138 | 9,819 | 8,263 → 6,009 | 6,465 → 4,671 | 1,644 → 1,804 |
  | Meta | 1,208 | 948 | 948 | 2,937 | 897 | 452 → 323 | 169 → 90 | 924 → 995 |
  | Google | 3,821 | 2,513 | 2,513 | 6,601 | 2,225 | 257 → 207 | 207 → 172 | 1,740 → 1,741 |
  | Microsoft | 2,435 | 1,566 | 1,822 | 3,973 | 1,166 | 170 → 122 | 145 → 112 | 285 |
  | Apple | 4,851 | 2,781 | 3,197 | 6,080 | 2,703 | 153 → 113 | 136 → 104 | 2,317 → 2,320 |
  | Anduril | 2,537 | 2,388 | 2,388 | 3,430 | 2,070 | 30 → 15 | 30 → 15 | 12 |
  | Palantir, xAI, Netflix | 309, 304, 414 | unchanged | unchanged | unchanged | unchanged | 9 → 5, 6 → 0, 1 → 0 | same | unchanged |
  | NVIDIA, Shield AI, Anthropic, OpenAI, Scale AI, Cohere | unchanged | unchanged | unchanged | unchanged | unchanged | unchanged | unchanged | unchanged |

  **Nothing dropped:** every posting id of every board is in the new build (0 lost); postings, pay, pay rows, places and Juice are
  equal before and after. What moves for a job seeker: the pins (and the map's "+ N nearby" clusters); the Location filter lists
  the same names with the same counts (it is by name, and no name changes); Juice is by city name, unchanged. Microsoft's SF Bay
  Area / NYC ranges (SB-5): no Microsoft place moves into or out of an area, so its pay rows stay 1,822.
- **K-1:** bonus mentions Google 2,512 → 2,462 (the 50 "+ 0% bonus target" postings), every other board unchanged. Stated targets
  kept as posted: 2,455 Google postings (2,499 "N% bonus target" and 80 "N.N%" lines, one figure each); "+ bonus mentioned" remains
  on 7 Google postings and every other board's. Other wordings: only Shield AI's "Interns/Military Fellows/Part-time not eligible
  for bonus, benefits or equity" (10×), already none for those roles.
- **R-2:** 126 postings Senior → Mid (Amazon 124: 70 "Retail Lead Associate", 43 "Lead Associate", 5 "Lead Associate, Amazon Now",
  3 Quick Commerce, 2 "Lead Fulfillment Associate"; Anduril 2 "Lead Materials Associate"); no other level changes on any board.
- **R-1/R-3, families per board:** 1,839 postings change family, 0 lose one. Amazon: no family 2,332 → 881, support 1,358 → 1,052,
  supply-chain 1,122 → 1,084, bizops 1,162 → 1,158, manufacturing 1,266 → 1,262, facilities 1,640 → 1,632, people 643 → 641,
  it 55 → 54, dc-tech 625 → 671, site-ops 0 → 1,768. Meta: ai-training 8 → 0, it 5 → 4, facilities 103 → 112. Microsoft: bizops
  45 → 38, facilities 133 → 138, dc-tech 109 → 111. xAI: hardware 16 → 9, facilities 94 → 101. Google: ai-training 2 → 1, policy
  50 → 51. Anduril: supply-chain 252 → 251, site-ops 0 → 1. Amazon's titles still without a family: "Onsite Medical
  Representative" 76, "Injury Prevention Specialist" 34, "シフトアシスタント" 24, "VRMO Senior Investigation Specialist" 17,
  "サイトメンテナンスシニアテクニシャン" 15, "プロセスアシスタント" 12, pharmacists (Staff 11, Overnight 8, Manager 8).
- **P-1:** the postings whose card line changes are those with `salary.places` and no per-place rows that list a place without
  pay (the reviewers' 537: Apple 253, Amazon 284), under a Location filter on such a place.
- **P-3:** cards whose headline changes: 2,442 full-time hourly postings (Amazon 1,950 plain + 122 with a range per place + 3
  minimums, Anduril 165, Apple 95 + 2, Microsoft 42 + 2, xAI 26, Shield AI 22, Cohere 3, Netflix 3, OpenAI 4, Scale AI 2, Palantir
  1). Unchanged: 123 part-time and 567 shift-pay hourly postings (already hourly), 93 internships with a term.
- **P-1 (counted on the build, `p1count.mjs`):** 532 postings have pay tied to some of their places by `salary.places` and list
  another place in the same country without pay (Amazon 284, Apple 248; the reviewers counted 537). Under a Location filter on
  such a place the line now names the places ("Posted for Tempe, not Atlanta"); nothing else on the card changes.
- **P-2 (`p2count.mjs`):** job pages whose heading now shows the posted yearly figure exactly (not whole thousands at one end):
  16,236 (Amazon 10,735, Apple 2,635, Microsoft 1,459, NVIDIA 1,186, Google 124, Meta 94, Netflix 3); Pay by place rows exact on
  every posting with them. Cards unchanged.
- **G-2/G-3, geodiff** (the G-1 geo.js against the final one): on the 2026-10-16 crawl 2 results in 9 postings ("Monterrey,
  NLE, MEX" and Apple's "Monterrey", 8 Amazon + 1 Apple, latitude and longitude only, from Mexico's centre to Monterrey); on the
  2026-10-23 crawl (`scratchpad/fd6/d1023`) 5 results in 11 postings: Monterrey 8, Apple's "Bayshore Shopping Centre, Canada" 1
  (Canada's centre to Ottawa), Microsoft's "AL" 1 (Alabama to Albania: microsoft:1970393557021098, "HR | RS | SI | AL") and
  Microsoft's "Monterrey, N.L." 1 (the Netherlands to Monterrey, Mexico). Nothing else changes; no posting or pay row is dropped.
- **C-1:** Microsoft "Software Engineer", Redmond, no level: the estimate (mid $177K, $120K–235K, 328 roles, Medium) is unchanged;
  the five listed were 4 Principal and 1 Senior (the newest of a tie at weight 1), now Software Engineer (Entry) $127K, Software
  Engineer II $152K, Senior $177K, Principal $209K and Principal $231K.
- **Unit tests:** test/fix-data-6.test.js 20 tests (G-2 and G-3 added, red on 7b3a06a): on 00bd52c the G-1 and K-1 tests fail (5 of 7; two are guards that hold both
  before and after); on cb71da7 the K-1 sibling, R-1 and R-2 tests fail (4); C-1 imports `shownComparables`, which 00bd52c lacks.
- **npm test, CI-like** (clean checkout, no data links): at cb71da7 1,315 tests, 1 fail (docs/DATA_FRESHNESS.md inventory; fixed
  in fa52f61); at 5440eba 1,324 tests, 1,314 pass, 0 fail, 10 skipped; **at 29250f0 1,328 tests, 1,318 pass, 0 fail, 10
  skipped**.
- **e2e, red first:** on the base build (00bd52c) all 10 ID tests fail, each on its finding: [G-1] the East Palo Alto pin at
  36.12, -119.68 (California's centre); [K-1] "+ bonus mentioned" on a "+ 0% bonus target" posting; [P-1] "Pay posted for the US
  only"; [P-2] "€46K" and rounded Pay by place rows; [P-3] "$58K–102K" on an hourly card; [C-1] 4 of the 5 listed Principal or
  Senior; [R-1] Amazon associates in support; [R-2] stored levels Senior; [R-3] AI-tutor family in a data center. On the build of
  7b3a06a all 10 pass.
- **e2e, related groups, before the rebases** (build of 29250f0): 308 of 311; the 3 were tests reading the old rounded heading or
  never run (T-19), fixed in 799a164. **After the rebase onto e77cd41** (build of 733f793, fix-salary-6's group added): 335 of 346;
  the 11 were fix-salary-6 tests reading the job page's rounded figure (P-2), updated in 6c0f2f1. **Onto 942db8a** (build of
  6c0f2f1, fix-ui-6 and fix-juice-6 added): 511 of 513, 1 skipped (a size with no line above the chart); the 1 was J-4. **Onto
  f13ebd6** (build of 6c8f4ca, the groups that rebase touches): 277 of 277. **P-4** (build of 6963435): 315 of 316 (J-4). T-19's pair
  with `--max-skips=0` passed on every build from 799a164 on.
- **Nothing dropped on top of fix-salary-6** (e77cd41's build against this lane's on the same crawl, per board, main and beta):
  postings, postings with pay, pay rows, places and Juice equal on every board (Amazon 22,179 / 13,980 / 16,831 / 34,138 / 9,819;
  Google 3,821 / 2,513 / 2,560 / 6,601 / 2,228; Microsoft 2,435 / 1,566 / 1,880 / 3,973 / 1,172); 0 postings lost. What moves:
  places at a centre (Amazon 8,263 → 6,001, Meta 452 → 323, Google 257 → 207, Microsoft 170 → 122, Apple 153 → 112, Anduril 30 → 15,
  Palantir 9 → 5, xAI 6 → 0, Netflix 1 → 0), SF Bay Area places (Amazon 1,644 → 1,804, Meta 924 → 995, Apple 2,317 → 2,320, Google
  1,740 → 1,741), Google's bonus mentions 2,512 → 2,462. On top of fix-salary-6: P-1 532 postings (Amazon 284, Apple 248), P-2
  16,414 job-page headings (big tech 16,240), P-3 2,442 full-time hourly cards (2,313 plain, 126 with a range per place, 3 minimums), as before the rebase.
- **P-4:** red first (the posting's shape against the old shared.js: payLocations San Jose, Kirkland, New York, disagreeing with
  payAt at Munich; after: San Jose, Munich, Kirkland, New York, agreeing at every place; payCountry US both). Unit tests in
  test/fix-data-6.test.js (22 now). On the 2026-10-16 crawl 112 postings gain the places their other countries' rows price
  (Cohere 47, Google 34, Microsoft 31; 197 places), none loses one.

## 6. Known gaps and follow-ups
- "Bogota, D.C." (15 Amazon postings) is read as Washington, DC: another country. A fix changes the country, not only the
  coordinates, so it is left for the lead to assign.
- Big cities written another way are still at their country's centre: "Buenos Aires City" (9), "Ho Chi Minh" (3), "Cracow",
  "Lodz", "Seville", "Hanover", "Brunswick"; and region names read as towns ("Kanagawa", "Hyogo", "Uttar Pradesh"). An alias would
  change their names, so they are not G-1.
- "Yokohama-shi" and "Chiba-shi" keep their own names beside "Yokohama" and "Chiba" in the Location filter.
- Apple's retail "US-Lead" and "US-Lead Genius" titles are still Senior by "lead" (not associate titles; not in R-2's scope).
- Japanese Amazon titles (シフトアシスタント, プロセスアシスタント) are not read by the family rules.
- "Monroe Twp" and "Hamilton Twp", NJ (two townships of each name) stay at New Jersey's centre.
- The "Pay posted for … only" pill wraps to two or three lines by design (§3, 16); one line would be a layout change (fix-ui-6).
- The pay estimate still prices a comparable at its headline outside the city asked; using another country's row as that
  country's pay (P-4's rows in the estimate) would move the backtest, so it is left for a lane that owns compstimate.js.
- fix-juice-6 [J-4]'s other hash-only gotos may race the same way (§3, 19); only the edge-chip check was changed.

## 7. Change log
- 2026-10-23 21:12: checked out 00bd52c, saved the brief, linked the crawl, built the base.
- 21:15–21:40: G-1 scan, GeoNames match, 359 entries, the two read rules after the first geodiff, norm-14, golden, fixtures.
- 21:40–22:00: K-1 (from the lead), counts, unit tests (red on the base), cb71da7; build; CI-like npm test (1 fail: inventory).
- 22:00–23:00: P-1, P-2, R-1, R-2, R-3, K-1's stated targets (from the lead); families renamed to the operations family; 5440eba.
- 2026-10-24 00:23: the container restarted; resumed at 00:30 with every commit intact (build and npm test of 5440eba had finished).
- 00:30–01:10: T-19 (5e29ff4); P-3 and C-1 (7b3a06a); docs (b2a684e); rebuild; e2e (red on the base, green on 7b3a06a).
- 01:10–01:15: G-2 and G-3 (from the lead), geodiff on both crawls, 29250f0; npm test at 29250f0; rebuild; docs.
- 01:15–02:30: related groups on 29250f0 (308 of 311), fixes (5a9ef58); the lead's first rebase onto e77cd41 (799a164); npm test.
- 02:30–03:05: one line at 280 and 320 px; rebuilds; the before build of e77cd41. 04:33: the container restarted; resumed 04:37.
- 04:37–05:30: 733f793; related groups (335 of 346: fix-salary-6's rounded figures); per-board counts against e77cd41.
- 05:30–06:45: rebase onto 942db8a; fix-salary-6's e2e figures (6c0f2f1); npm test (1,357, 0 fail); related groups 511 of 513.
- 06:45–07:45: rebase onto f13ebd6 (6c8f4ca); npm test 1,379, 0 fail; touched groups 277 of 277.
- 07:45–08:45: P-4 (bb3df83); J-4's race (6963435, then the hovered-chip check); npm test 1,381, 0 fail; touched groups 315 of 316.
