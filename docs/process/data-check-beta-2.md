# Process log: data-check-beta-2

## 1. Brief
Prompt: [`docs/process/prompts/data-check-beta-2.md`](prompts/data-check-beta-2.md) (verbatim).
Goal: the second data check of `/beta/`. Re-check every finding of the first pass
([data-check-beta.md](data-check-beta.md)) against today's data, then check, company by company, that the
numbers a job seeker sees are right for Apple (4,875 postings), Google (3,417), NVIDIA (2,663), Microsoft
(2,279) and Netflix (457), with Anduril (2,491) for comparison.
- **Data:** every board observed 2026-10-11 06:38 to 08:00 UTC: beta crawl `snapshot.yml` run 38118242488 and
  the 08:00 stable boards, rebuilt from the data-archive branch.
- **Code:** worktree `wt-s1` at 6f69079 (fix wave 3: data, compare and app lanes).
- **No product code was changed.**

Files owned:
- this log;
- the prompt copy;
- `test/beta-data-check-2.test.js` (new, 11 tests, all failing as to-dos);
- `docs/process/patches/data-check-beta-2-data-sources.diff`.

**Numbering.** The brief says the first pass ran "DQ-1 to DQ-26". Its log files 17 findings (DQ-1 to DQ-17)
with 26 tests. All 17 are re-checked below. New findings start at **DQ-27**, as asked, so DQ-18 to DQ-26 are
unused. A residue of a first-pass finding keeps that finding's id and is marked "residue".

## Verdicts

| Company | Verdict | Why, in one line |
|---|---|---|
| Apple | **usable with caveats** | Pay parsing is right (40/40, 20/20) and the per-location copies are gone (DQ-2). But 367 paid postings (13.0%) put their headline Juice in a place Apple posted no pay for: 317 of the 621 Austin postings show California pay (DQ-27). 395 merged requisitions show and score the span across places (DQ-28). |
| Google | **usable with caveats** | Pay is right (40/40, 20/20), and the dropped ranges are back: 2,032 → 2,217 with pay (DQ-5, DQ-6, DQ-15, DQ-16 fixed). Its numeral ladder files "Product Manager II" and "Leadership TPM I" as Entry and "FDE IV" as Senior (DQ-29), which breaks 3 Compare-companies cells. 215 paid postings (9.7%) have no Juice city. |
| NVIDIA | **trustworthy** | DQ-1 is fixed: the US filter holds exactly the 1,402 true-US postings. Pay is 40/40 and 20/20, and the drawer names both levels of a two-level range. Notes: 45 sales "cash compensation" ranges are null by rule; Westford MA has no Juice city. |
| Microsoft | **trustworthy** | DQ-1, DQ-3 and DQ-13 are fixed (IC levels read, SF/NYC-only roles use their own range), and pay is 40/40 and 20/20. Notes: 12 Romanian "lei" ranges are not shown (DQ-6 residue). 25% of paid postings have no Juice: 257 name only a country or state (mostly "United States"), and 108 name a city with no record. |
| Netflix | **trustworthy** | Pay is 40/40 and 20/20; union floors, Canada "$" and the $1.43M L7 range follow §7a. The "Mid" default fell from 53.9% to 23.9%, and L4 < L5 < L6. Notes: 3 titles that state L5 still default (DQ-3 residue). Compstimate's Product Manager ladder reads Mid $583K above Senior $430K. |
| Anduril (comparison) | **trustworthy** | 94.1% with pay, 40/40 and 20/20, 3 critical flags (all quarantined). 301 paid postings have no Juice city (Ashville OH 146 entries, Broomfield, Quincy, Fort Collins). |

## Findings, ordered by how many job seekers they mislead

Severity:
- **High:** a wrong fact on many postings in a main view.
- **Medium:** wrong or missing figures on a meaningful share.
- **Low:** few postings, a label, or a latent problem.

Every test is in `test/beta-data-check-2.test.js` and runs as a to-do (the project's convention, see
`test/beta-data-check.test.js`).

| ID | Sev. | Company | Postings affected | Owner (file, function) | Test |
|---|---|---|---:|---|---|
| DQ-27 | Med-High | Apple | Headline Juice in a place with no posted pay: 367 of 2,818 paid (13.0%). Location filter "Austin": 317 of 621 postings show pay posted for other cities | `server/sources/apple.js` `mapCopies`; `server/juice.js` `attachJuice`; `public/features/shared.js` `payLocations` | 2 |
| DQ-28 | Medium | Apple | 395 merged requisitions (14.0% of paid) show and score the span across places | `server/juice.js` `attachJuice`; `public/app.js` `payPill`/`payHere`; `scripts/build-market.js` `usdMid`; `public/features/compstimate.js` | 1 |
| DQ-29 | Low-Med | Google | Directly mislabelled: 18 Entry postings plus 14 "IV" postings filed Senior at Staff pay. Visible in 3 Compare-companies cells (product Entry, solutions, sales) | `server/keywords.js` `jobSeniority` (Google ladder) | 2 |
| DQ-4 (residue) | Low-Med | all | Paid postings with no Juice because their city has no record: Google 215, Microsoft 108, Apple 38, NVIDIA 11 (Anduril 301) | `data/cities.json` (`nearby`, new records) | none (first-pass test passes) |
| DQ-6 (residue) | Low | Microsoft, Google | 16 postings state a lei (RON) range and show "Salary not listed" (Microsoft 12, Google 4) | `public/viz/palette.js` `FX_PER_USD` and its copies | 1 |
| DQ-3 (residue) | Low | Netflix, Microsoft | 3 Netflix titles that state L5 default to "Mid". 56 Microsoft postings whose pay names an ATR level are "Level not stated" | `server/keywords.js` `jobSeniority` | 1 |
| DQ-30 | Low (latent) | Apple | 3,311 of 4,875 postings (67.9%) carry a reqId with a location suffix; the other 1,564 carry the bare requisition | `server/sources/apple.js` `mapCopies` (`reqId`) | 1 |
| DQ-31 | Low | Google | 9 location entries in 7 postings with a ZIP code lose their state and are pinned at the US centroid | `server/geo.js` (`splitLocations` / `geocodeMany`) | 1 |
| DQ-11 (residue) | Low | Apple | 1 talent pool not recognized ("Expression of Interests") | `server/sources/pool.js` `isTalentPool` | 1 |
| DQ-32 | Low (process) | Apple | 63 false `structured_text_disagree` vet flags (all merged requisitions) | `scripts/vet-salaries.js` `scanJob` | 1 |

### DQ-27 (Medium-High) Apple: one state's pay is applied to places Apple posted no pay for
- **What Apple publishes:**
  - Apple prices each listing with a "Pay & Benefits" footer for that listing's own place.
  - It posts **no footer at all** for Texas, Oregon, Florida, North Carolina, Pennsylvania, Tennessee, Nevada, Arizona and a few more states.
  - Counts from single-place US postings, with pay out of total: CA 1,858/1,870, WA 136/136, TX **0/299**, OR **0/53**, FL 0/21, NC 0/17, PA 0/15, TN 0/9.
- **Example:** apple:200578781-0157 "Thermal Engineer", https://jobs.apple.com/en-us/details/200578781-0157/thermal-engineer.
  - Places: Austin, TX and Cupertino, CA.
  - The only footer is Cupertino's: "The base pay range for this role is between $150,400 and $277,600, and your base pay will depend on your skills, qualifications, experience, and location." (USD, yearly, base pay only; no bonus or equity in the sentence.)
  - **Expected:** pay and Juice for Cupertino only. Austin shows no posted pay, as a Texas-only Apple posting does.
  - **Actual:** the card, the salary filter and an "Austin" location filter all treat $150,400–$277,600 as Austin pay.
  - **Actual (Juice):** the headline reads "78 · Austin, TX", because Texas has no state income tax. Cupertino, the place the pay is for, scores 66.
- **Share:**
  - 367 of Apple's 2,818 paid postings (13.0%) show their headline Juice in such a place, and 373 have at least one such Juice entry.
  - 317 of the 621 Apple postings that list Austin show pay; all of it was posted for another city.
  - More examples: apple:200579441-0157 Hardware Product Design Engineer; apple:200593548-0157 SoC Characterization Product Engineer (Austin 82 from San Diego/Cupertino ranges); apple:200687006-0157 Analog Layout Automation Engineer. The last lists Austin, Beaverton, Melbourne FL and Waltham, so its one range can only be Waltham's.
- **Cause:**
  - `mapCopies` knows which places each footer is for (`groups[].places`), but keeps them only when two or more ranges differ (`spanPay`, DQ-28).
  - With one footer group, the text salary applies to every place.
  - `payLocations` (`shared.js`) and `attachJuice` then accept any place in the pay's currency.
  - Fix wave 3's shared decision 1 ("Juice is never worked out from another country's pay") stops at the country. This is the same error within one country.
- **First pass:** its hand-checked Juice row "apple:200578781-0157 Thermal Engineer, Austin, $214,000, score 78" was this case. The arithmetic was right; the input was Cupertino's pay.
- **Tests:** `DQ-27 …` (2): Juice is not scored in Austin, and `payLocations` excludes Austin.

### DQ-28 (Medium) Apple: merged requisitions show and score the span, not the place's own range
- **What changed:** since the DQ-2 fix, a requisition whose listings post different ranges is one posting. Its `salary` spans the listings, and `salary.ranges` keeps each range with its places.
- **Problem:** nothing reads `salary.ranges` (`public/app.js`, `server/juice.js`, `scripts/build-market.js`, `public/features/compstimate.js`).
- **Example:** apple:200680778-0186 "Specialist, Emergency Services - Sensing & Connectivity", https://jobs.apple.com/en-us/details/200680778-0186/specialist-emergency-services-sensing-connectivity.
  - Text: "$119,800 and $222,000 (Alturas); $134,700 and $249,500 (Colton, Beaumont, Dixon); $142,300 and $263,300 (Carlsbad, Arleta); $150,400 and $277,600 (Antioch, Cupertino)".
  - **Expected** for a Cupertino seeker: $150,400–$277,600, with Juice on its midpoint of $214,000.
  - **Actual:** the card shows $119,800–$277,600 with a "Wide range (2.3×)" chip, and Juice for Cupertino is scored on $198,700 ("62 · Cupertino, CA").
  - The description does carry one "Pay & Benefits (places)" section per range, so the drawer text is right.
- **Share:** 395 postings (14.0% of Apple's paid).
  - Each place's own midpoint differs from the span's by a median 3.3%: p90 6.7%, max 16.3%.
  - The headline Juice uses a midpoint 3.4% off (median; range −7.1% to +14.9%).
  - 24 postings show "Wide range (2×)" although no range they post is 2× wide.
- **Test:** `DQ-28 …`: Cupertino's Juice gross is $214,000.

### DQ-29 (Low-Medium) Google: one numeral ladder for every job family
- **Contract rule (v5):** Google I and II Entry, III Mid, IV Senior, V+ Staff+. That fits Software Engineer (II = L3, III = L4). Other families sit on other bands; USD medians from this crawl:

  | Title family | I | II | III | IV |
  |---|---|---|---|---|
  | Technical Program Manager | $141K Entry (2) | $168K Entry (16) | $200K Mid (31) | – |
  | Product Manager | $168K Entry (4) | **$200K Entry (13)** | – | – |
  | Leadership Technical Program Manager | **$235K Entry (2)** | **$235K Entry (1)** | – | – |
  | Facilities Manager | Entry (1) | Entry (1) | – | – |
  | Forward Deployed Engineer (and other "IV" titles) | – | – | $213K Mid (1) | **$254K Senior (14 "IV" titles in all)** |

- **Examples:**
  - google:117492478474363590 "Product Manager II, Android XR Platform Hardware", US: $163000 - $236000 (USD) + 15% bonus target + equity + benefits. Entry. https://www.google.com/about/careers/applications/jobs/results/117492478474363590-product-manager-ii
  - google:72585552410354374 "Leadership Technical Program Manager I, Data Center Security, Cloud", $192,000–$278,000. Entry. https://www.google.com/about/careers/applications/jobs/results/72585552410354374-leadership-technical-program-manager-i
  - google:117549066815972038 "Facilities Manager II, Data Center Operations", $164,000–$237,000. Entry, while "Software Engineer Manager II" is Manager.
  - google:125981803457454790 "Forward Deployed Engineer IV, Applied AI, Google Cloud", $207,000–$300,000. That is exactly "Staff Software Engineer"'s band (google:119619612567315142), yet it is filed Senior.
- **Effect:**
  - 23 of Google's 106 USD Entry postings pay at or above the Software Engineer III median ($178.5K).
  - Compare companies shows:
    - "Google · Product · **Entry $200K (n17)**";
    - google·solutions **Senior $254K (n14) > Staff+ $228K (n5)**;
    - google·sales **Mid-level $169K (n7) > Senior $151K (n39)**. The sales "Senior Account Manager" titles ($108K–$154K) are a lower band than "Sales Specialist III" ($138K–$200K).
- **Expected:** a numbered PM, Leadership TPM or Manager title is not entry level, and a Manager title with a numeral is a Manager.
  - For "IV" at Staff pay the rule is a ladder decision, so there is no test.
- **Tests:** `DQ-29 …` (2).

### DQ-30 (Low, latent) Apple: reqId keeps the listing's location suffix
- `mapCopies` sets `reqId: str(x.jobNumber) || str(row.positionId)`.
  - US listings have a detail, so the reqId is "200578781-0157": 3,311 postings, 67.9%.
  - Non-US listings have none, so it is the bare "200237136": 1,564.
- The ledger links reposts by reqId (`server/history.js` `updateLedger`, field `r`).
- When a requisition's lowest listing changes (a place added with a lower location id, or the lowest closes), the posting's id and its reqId both change. It then gets no repost link and a fresh `firstSeenAt`, so the card says "New" on an old requisition.
- No such case in today's 4 runs. The CSV export's reqId column is also mixed.
- **Expected:** reqId "200578781".
- **Test:** `DQ-30 …`.

### DQ-31 (Low) Google: a ZIP code drops the state
- "Moncks Corner, SC 29461, USA" (6 entries), "Pryor Creek, OK 74361, USA" (2) and "Pryor, OK 74361, USA" (1): 9 entries in 7 postings.
- Each becomes a place named "Moncks Corner" with no region, at the US centroid (39.83, −98.58) in Kansas.
- For google:92006121065063110 "Data Center Technician III, Hardware Operations" ($105,000–$145,000, https://www.google.com/about/careers/applications/jobs/results/92006121065063110-data-center-technician-iii) and google:107462970702734022 it is the only place: a map pin in Kansas, and no Juice.
- **Test:** `DQ-31 …`.

### DQ-32 (Low, process) Vet scan: merged Apple requisitions are flagged structured_text_disagree
- 63 Apple flags, all on merged requisitions with `salary.ranges`, and 5 of the 10 sampled Apple flags.
- The structured salary spans the listings by design (DQ-2). The scan compares it with the first footer's text range ("$165,800 and $292,400" against a $165,800–$324,800 span) and calls that a disagreement.
- None is critical, so the gate passes. They are noise for a reviewer and for `llm-vet.js`.
- **Test:** `DQ-32 …`.

### Residues of first-pass findings
- **DQ-4 (partly fixed).** The suburbs it named now match (Los Gatos, San Bruno, Beaverton, Hillsboro, Culver City, Waltham, Thornton, Addison, Irving). Cities still missing (paid entries in the pay's country):
  - Google: Madison WI 35, Ann Arbor 27, Goleta 27, Waterloo (Canada) 23, Frankfurt 23, Hamburg 22, Santa Cruz 16, Council Bluffs 14, Saint-Ghislain 11, Haskell TX 10.
  - Microsoft: San Antonio 31, Charlotte 30, Fargo 18, Vaasa 9, Cheyenne 9, Milwaukee 9, Boydton 9, Calgary 8, Gävle 7.
  - NVIDIA: Westford MA 58.
  - Apple: Orlando 8, Sacramento 8, Elk Grove 8.
  - Anduril: Ashville OH 146, Broomfield 75, Quincy MA 67, Fort Collins 65.

  The full lists are in check 3 below. The first-pass test still passes, so no new test.
- **DQ-6 (partly fixed).**
  - "zł", "kr", "kr." and the French "salaire" sentence are read: 0 Google misses, against 189 before.
  - "lei" is read but has no exchange rate, so 16 postings show "Salary not listed" and the scan flags them `missed_salary`. Example: microsoft:1970393557006510 "Process Program Manager", Bucharest: "Process Management IC4 - The typical base pay range for this role across Romania is lei 199,400.00 - lei 347,800.00 per year." (RON, yearly, base.) https://apply.careers.microsoft.com/careers/job/1970393557006510
  - DATA_SOURCES §7a documents the gap; the fix is a RON rate in `FX_PER_USD` (ECB publishes one).
- **DQ-3 (partly fixed).**
  - Three Netflix titles state L5 and still default: netflix:790317701711 "Support Solutions Engineer (L5) - Security, Privacy and Assurance", netflix:790317630105 "Solutions Support Engineer (L5) - Eng Productivity" (both $270,000–$410,000), and netflix:790318143742 "Software Engineer (L5+L6)" ($499,000–$900,000).
  - Microsoft's ATR levels (data-centre and support roles: "Critical Environment Ops ATR-C - The typical base pay range …") are not on a ladder: 56 postings are "Level not stated" although their pay names a level. That ordering is a ladder decision, so there is no test.
- **DQ-11 (partly fixed).** Talent pools are flagged (`pool: true`: Apple 46, Google 7, Netflix 9, none with pay). "Expression of Interests | Career Fair Events Internship" (apple:200617354-4265, https://jobs.apple.com/en-us/details/200617354-4265/expression-of-interests-career-fair-events-internship) is missed because of the plural.

### Known items seen on beta, not re-filed
- **known (P-2):** Compstimate ladders are flat where a level has no comparables. Apple SWE Entry = Mid = $214K; Google PM Senior = Staff+ = $235K.
- **known (P-3):** "Level not stated" (the Mid default) still pools roles with no level stated. For Netflix Product Manager the unlevelled titles are Netflix's top PM band, so Compstimate reads Mid $583K (n22) > Senior $430K (n35). Compare companies' stored "Mid" cell is the same set (netflix·product $583K, n16).

## Re-check of the first pass (DQ-1 to DQ-17)

| ID | Status | Evidence on today's data |
|---|---|---|
| DQ-1 | **Fixed** | NVIDIA: the "United States" filter holds 1,402 postings = 1,402 whose raw location ends ", US" (was 2,123 vs 1,403). Microsoft 1,174 = 1,174 (was 1,518 vs 1,185). 0 unresolved Eightfold places. The only code-vs-country differences are correct readings of region codes ("Barcelona, CT" Spain 15, "São Paulo, SP" Brazil 15, "Madrid, MD" 4, "Zaragoza, AR" 3). Its 4 tests pass |
| DQ-2 | **Partly fixed** | 4,875 postings = 4,875 requisitions; 0 requisitions listed twice (was 827 with 1,223 extra copies); 0 cities priced twice inside a posting (was 393 requisitions). New problems from the merge: DQ-27, DQ-28 |
| DQ-3 | **Partly fixed** | "Mid" default share: Netflix 53.9% → 23.9%, Microsoft 42.1% → 19.7%, NVIDIA 23.0% → 16.2%, Google 47.5% → 43.4%, Apple 75.2% → 74.4%. Board levels are read and keep their order (check 2). Residue: 3 Netflix titles, Microsoft ATR, the Google ladder (DQ-29). Its 5 tests pass |
| DQ-4 | **Partly fixed** | Juice coverage of paid postings: Apple 93.0% → 96.8%, Google 86.3% → 88.7%, NVIDIA 94.0% → 94.4%, Microsoft 73.2% → 75.0%, Netflix 54.1% → 64.1%. Still no city record: residue list above |
| DQ-5 | **Fixed** | 0 Google postings without salary have a "+ N% bonus target" line (was 100) |
| DQ-6 | **Partly fixed** | zł 65, kr (SEK) 13, kr. (DKK) 6 Google postings now carry their own pay; French "salaire" read. Open: 16 lei (RON) postings |
| DQ-7 | **Fixed** | Its 2 tests (which build a tiny site with the list request failing) pass; CONTRACT v2 "Nothing to show: `unavailable: true`" documents the behaviour. No browser check in this pass |
| DQ-8 | **Fixed** | `salary.levels` on NVIDIA 867 and Microsoft 164 postings. The drawer shows "Pay by level: Level 4: $184K–287.5K · Level 5: $224K–356.5K" (`public/app.js` `payLevelsLine`). The "Multiple pay zones" chip is kept for location ranges only. Comparisons still use the span's midpoint (§7a, by design) |
| DQ-9 | **Fixed** | 0 store names pinned at the US centroid (the 23 "United States, United States" entries are country-level places). Part-time: 123, all retail or hourly; 22 salaried corporate roles are `employmentType: null`. 0 double-encoded links |
| DQ-10 | **Fixed** | 0 "Republic of" places; 35 "Seoul, Korea, Republic of" → Seoul, South Korea |
| DQ-11 | **Partly fixed** | `pool: true` on 62 postings. One missed (residue). Year-old postings are still listed by design (check 6) |
| DQ-12 | **Fixed (per rule)** | 532 NVIDIA postings remote (was 585). The 8 still tagged #LI-Hybrid list "Remote, OR, US" (DATA_SOURCES 7c rule); 329 hybrid-tagged postings are on-site. Hybrid is still not modelled |
| DQ-13 | **Fixed** | 34 Microsoft postings whose US places are all in the SF Bay Area / NYC: 34 use the area range |
| DQ-14 | **Fixed (per rule)** | 22 Canada-only Netflix postings, all CAD; 5 union floors null; the L7 $737,000–$1,430,000 range is read and quarantined ("Pay unclear"). The L4 "$71,040.00 - $464,000.00" source typo is quarantined |
| DQ-15 | **Fixed** | 24 Google postings carry lines in 2+ currencies; 0 US-located ones use a non-USD line; no cross-country span (the 8 ";" salaries are one country's degree tiers) |
| DQ-16 | **Fixed** | 0 titles with HTML entities on any board |
| DQ-17 | **Fixed** | Google 2,027 → 20 flags, Microsoft 1,282 → 95. `missed_salary` now fires on the 16 lei postings. New false-alarm class: DQ-32 |

`node --test test/beta-data-check.test.js`: 26 of 26 pass (all 26 were red on 2026-10-10).

## Checks per company, with numbers

### 1. Pay parsing
**Sample.** Seeded Fisher-Yates (mulberry32) over ids in sorted order: seed 20261012 for the 40 with pay, 20261013 for the 20 without. The sample is drawn from the jobs exactly as the build serves them (§3, decision 1).
- Each posting was read against the money sentences of its description HTML.
- Output: `<scratch>/data-check-beta-2/out/sample-<slug>.txt`.
- **Board-wide sweep:** every posting without a salary that has a pay-like money sentence (`misses.mjs`).

| Company | Postings | With pay | Share | US-located share with pay | 40 with pay: right | 20 without: right | Misses in the whole board |
|---|---:|---:|---:|---:|---:|---:|---|
| Apple | 4,875 | 2,818 | 57.8% | 84.5% (2,818/3,333) | 40/40 | 20/20 | 0. The 515 US postings without pay are in states Apple posts none for (TX 299 single-place, OR 53, FL 21, NC 17, PA 15 …) or are pools |
| Google | 3,417 | 2,217 | 64.9% | 99.6% (1,800/1,807) | 40/40 | 20/20 | 4 lei postings (DQ-6 residue) |
| NVIDIA | 2,663 | 1,396 | 52.4% | 97.0% (1,360/1,402) | 40/40 | 20/20 (all outside US/PL/CA) | 0. 45 sales "cash compensation range" null by rule (31 single, 11 two-level, 2 Poland, 1 Canada) |
| Microsoft | 2,279 | 1,490 | 65.4% | 99.6% (1,169/1,174) | 40/40 | 20/20 | 12 lei postings (DQ-6 residue) |
| Netflix | 457 | 290 | 63.5% | 95.0% (267/281) | 40/40 | 20/20 | 0. By rule: 5 union floors, 4 sales "roles in this area"; 2 quarantined |
| Anduril | 2,491 | 2,345 | 94.1% | 98.0% (2,336/2,383) | 40/40 (structured) | 20/20 | 0 |

**Pay sentences, by board** (what changed since the first pass):
- **Apple.** "The base pay range for this role is between $150,400 and $277,600, and your base pay will depend on your skills, qualifications, experience, and location."
  - USD, yearly, base only.
  - Hourly variants: "$36.52 and $54.77/hr"; "$24.92 and $33.36/hr, and most new hires start at $24.92" (the new-hire figure is not a second zone).
  - A merged requisition's text names each range's places: "$116,400 and $203,000 (Cambridge); $129,300 and $225,300 (Cupertino)".
  - No bonus or equity in the sentence.
- **Google.** "US: $307000 - $427000 (USD) + 30% bonus target + equity + benefits". Base, yearly; bonus target and equity named, never added.
  - Lines now read: "Poland: zł232000 - zł237000 (PLN)", "Sweden: kr1040000 - kr1060000 (SEK)", "Denmark: kr.670000 (DKK)", "Canada: $198000 - $202000 (CAD) + 75% bonus target", "Le salaire de base canadien pour ce poste à temps plein est de Canada: $124000 - $127000 (CAD) + 150% bon…".
  - Degree tiers: "[Bachelor's degree] Poland: zł156000 (PLN) + 0% bonus target" / "[Master's degree] … zł159000".
- **NVIDIA.** "The base salary range is 116,000 USD - 195,500 USD."
  - Two levels: "184,000 USD - 287,500 USD for Level 4, and 224,000 USD - 356,500 USD for Level 5".
  - Interns: "The hourly rate for our interns is 20 USD - 71 USD." / "38 USD - 94 USD" (PhD).
  - Sales "cash compensation range" (85% base, 15% variable): null by rule.
- **Microsoft.** "Software Engineering IC4 - The typical base pay range for this role across the U.S. is USD $119,800 - $234,700 per year. There is a different range … San Francisco Bay area and New York City … USD $160,200 - $261,000 per year."
  - Two levels: "IC4: USD $119,800 - $234,700 per year; IC5: USD $142,800 - $274,800 per year".
  - Hourly: "USD $40.96 - $80.96 per hour".
  - Outside the US: "… across Finland is € 65,000.00 - € 111,700.00 per year", "… across United Kingdom is £ 95,300.00 - £ 136,100.00 per year".
- **Netflix.** "The range for this role is $388,000.00 - $558,000.00." (USD, yearly, all cash.)
  - Hourly: "The hourly range for this role is $46.15 - $72.12".
  - Interns: "The overall market range for Netflix Internships is typically $40/hour - $110/hour."
  - Netflix Animation Studios: "… typically $124,000 - $179,000 CAD"; "$32,69- $40,38 an hour" (decimal commas, read right as $32.69–$40.38).
- **Anduril.** Structured Greenhouse ranges: "US Salary Range: 190,000–252,000 USD", "US Hourly Range: 40–50 USD per hour". The Tokyo director's range is labelled "US Salary Range" but is in JPY ¥20,454,000–30,680,000 (Greenhouse's title; the currency is right).

**Ranges over several levels and how the drawer labels them:**
- NVIDIA two-level postings: 878 state two levels; 865 of them have `salary.levels` (867 in all), and the other 13 are sales cash-compensation ranges (null by rule). Pairs: 1/2 19, 2/3 58, 3/4 272, 3/5 1, 4/5 440, 5/6 85, 6/7 3.
- Microsoft: 169 state two levels (IC3/IC4 46, IC4/IC5 61, IC5/IC6 20, M5/M6 3, ATR pairs 39). 164 have `salary.levels`; 4 show a salary without them (2 USD, 2 EUR) and 1 has none.
- The drawer shows the span plus "Pay by level: Level 4: $184K–287.5K · Level 5: $224K–356.5K". The level chip is the title's (or the pay's lower level).
- Apple's location ranges get "Multiple pay zones" (395) and the per-place sections in the description (DQ-28).

**Non-US currencies with pay:**
- Google: EUR 265, CAD 68, PLN 65, SEK 13, DKK 6 (lei 4 not shown).
- Microsoft: EUR 156, GBP 77, CAD 46, SEK 13, CZK 11, DKK 8, PLN 4, NOK 4, CHF 1 (lei 12 not shown).
- NVIDIA: PLN 26, CAD 8, EUR 2.
- Netflix: CAD 22, EUR 1.
- Anduril: GBP 2, EUR 2, JPY 1.
- Apple: none (Apple publishes pay only in the US).

### 2. Levels
**Board levels → our Seniority** (n, our level/basis, USD yearly median):
- **Netflix:**
  - L3 1 Entry; L4 20 Mid ($332K); L4/5 11 Senior ($608K);
  - L5 86: Senior 83, default 3 ($473K);
  - L6 33 Staff+ ($700K); L7 1 Staff+ (quarantined pay).
  - Order kept.
- **Microsoft** (from the pay sentence when the title states none):
  - IC1 9 and IC2 23 Entry ($127K); IC3 162 Mid ($152K);
  - IC4 510: Senior 456, Manager 51 ($177K);
  - IC5 396: Staff+ 285, Senior 65 by title, Director+ 29 ($209K);
  - IC6 68: Staff+ 55 ($231K);
  - M3 12 Manager ($122K); M5 43 mostly Staff+/Director+ ($209K); M6 46 mostly Director+ ($217K).
  - ATR-B to ATR-E: 74 postings, mostly default (residue).
- **NVIDIA** (pay "for Level N"; two-level takes the lower):
  - 1/2 Entry ($145K); 2/3 Mid 40, Entry 11 ($167K);
  - 3/4 Senior ($220K); 4/5 Senior ($270K); 5/6 Senior ($328K); 6/7 Staff+ ($380K);
  - "New College Grad" 23 Entry ($216K, PhD-heavy).
  - The Senior bucket spans three NVIDIA levels ($220K to $328K medians), by the contract's ladder.
- **Google:** I Entry 27 ($153K); II Entry 107 ($168K); III Mid 233 ($179K); IV Senior 14 ($254K, Staff pay: DQ-29); V Staff+ 2.
- **Apple:** no board level is exposed; 1 title says "ICT3" (default).
- **Anduril:** II Mid 9 ($90K, technicians), III Mid 2.

**"Mid" default share, and titles that say otherwise:**

| Company | Default "Mid" | Share | Default titles with a level-like word | Mostly |
|---|---:|---:|---:|---|
| Apple | 3,625 | 74.4% | 535 | "Program Manager" 448, "Architect" 79: not levels |
| Google | 1,482 | 43.4% | 481 | "… Manager" 440: not people managers |
| Anduril | 1,023 | 41.1% | 106 | "manager" 95 |
| Netflix | 109 | 23.9% | 47 | 40 "manager", 3 "L5" (residue) |
| Microsoft | 448 | 19.7% | 174 | 56 ATR (residue) |
| NVIDIA | 432 | 16.2% | 139 | "Architect" 84, "manager" 55 |

**Medians by our level** (USD, yearly salary, not OTE; "Mid(d)" is the default, "Mid-level" a stated mid level):

| Company | Intern | Entry | Mid(d) | Mid-level | Senior | Staff+ | Manager | Director+ |
|---|---|---|---|---|---|---|---|---|
| Apple | – | $169K (2) | $214K (1,986) | – | $244K (476) | $257K (45) | $281K (145) | $404K (19) |
| Google | $115K (23) | $158K (106) | $173K (597) | $179K (160) | $213K (457) | $254K (255) | $254K (166) | $313K (33) |
| NVIDIA | – | $160K (43) | $197K (70) | $167K (40) | $239K (902) | $352K (101) | $281K (123) | $349K (38) |
| Microsoft | – | $127K (14) | – | $152K (143) | $177K (451) | $209K (339) | $148K (84) | $204K (68) |
| Netflix | – | $223K (3) | $340K (44) | $332K (18) | $473K (99) | $700K (34) | $299K (58) | $611K (5) |
| Anduril | – | $101K (33) | $150K (844) | $90K (10) | $170K (834) | $222K (173) | $170K (134) | $256K (118) |

- Netflix's first-pass inversion (Mid $473K > Senior $315K) is gone.
- Microsoft "Manager" ($148K, n84) sits below its Senior because the bucket is mostly "Account Manager"-style and IC4 "Senior … Manager" titles. That is the same as the first pass, and not a ladder.
- Anduril Entry $101K (33) > Mid-level $90K (10): its "II" titles are technicians. Small cell.

**Inversions that users see:**
- **Compare companies** (market cells, home country, n ≥ 3, built with `scripts/build-market.js` `buildMarket` from the served jobs), real levels only:
  - google·sales Mid-level $169K (n7) > Senior $151K (n39) (DQ-29);
  - google·solutions Senior $254K (n14) > Staff+ $228K (n5) (DQ-29);
  - microsoft·design Senior $214K (n8) > Staff+ $209K (n3): "Creative Director" titles at IC5/IC6 pay are Senior by the fix3 title rule;
  - google·swe Entry $178.75K (n4: PhD early career, paid on the SWE III band) ≈ Mid-level $178.5K (n79), a tie.
  - Stored-"Mid" cells (Level not stated) above Senior: netflix·product $583K vs $428K; google·sales $166K vs $151K; anduril·facilities and anduril·solutions (small).
- **Compstimate** (`estimateComp`, 3 titles per company, any location and US): one inversion, Netflix Product Manager Mid $583K (22) > Senior $430K (35) (known P-3, above). The others rise or are flat (P-2).

### 3. Locations
- **Canonical names:** right on every Eightfold board now (DQ-1, DQ-10 fixed; no "-CC" suffixes).
  - Wrong: the 9 ZIP-code entries (DQ-31).
  - Places the gazetteer doesn't know are placed at their region's centre, by design (`locationPrecision` "centroid"): Apple 188 entries in 160 postings, Google 236 in 192, Microsoft 155, NVIDIA 29.
- **Multi-location postings:** the list counts each posting once; the map and the location filter count it in every city (`public/features/shared.js` `jobLocationKeys`).
  - Share with 2+ places: NVIDIA 38.5%, Google 31.0%, Microsoft 28.8%, Anduril 25.8%, Netflix 18.2%, Apple 17.0% (was 31.5%, and N×N before the merge).
- **Remote vs hybrid:** only a `remote` boolean; hybrid is not modelled.
  - remote = true: Apple 12 (0.2%), Google 61 (1.8%), Microsoft 310 (13.6%), NVIDIA 532 (20.0%), Netflix 116 (25.4%), Anduril 40 (1.6%).
  - NVIDIA's #LI-Hybrid tag: 329 on-site, 8 remote ("Remote, OR, US").
- **Cities with no living-cost or rent data:** Juice is `null` for those places (no fallback city). Paid postings with no Juice, and why:

  | Company | Paid | With Juice | No city record | Country/state only | Remote only | Other |
  |---|---:|---:|---:|---:|---:|---|
  | Apple | 2,818 | 2,729 (96.8%) | 38 | 0 | 0 | part-time, no hours stated 51 |
  | Google | 2,217 | 1,967 (88.7%) | 215 | 32 | 0 | pay for another country 3 |
  | NVIDIA | 1,396 | 1,318 (94.4%) | 11 | 65 | 0 | another country 2 |
  | Microsoft | 1,490 | 1,117 (75.0%) | 108 | 257 | 0 | another country 7, 1 |
  | Netflix | 290 | 186 (64.1%) | 0 | 0 | 104 | – |
  | Anduril | 2,345 | 2,039 (87.0%) | 301 | 0 | 3 | another country 2 |

  Cities (paid location entries in the pay's country with no record), most first:
  - Google (449 entries): Madison WI 35, Ann Arbor 27, Goleta 27, Waterloo 23, Frankfurt 23, Hamburg 22, Santa Cruz 16, Council Bluffs 14, Saint-Ghislain 11, Haskell TX 10, Midlothian TX 9, Kronstorf 9.
  - Microsoft (279): San Antonio 31, Charlotte 30, Fargo 18, Vaasa 9, Cheyenne 9, Milwaukee 9, Boydton 9, Calgary 8, Gävle 7, Fayetteville GA 6, Boise 6, Pecos 6, Des Moines 6, Manassas 6, Romsey 6.
  - Apple (130): Orlando 8, Sacramento 8, Elk Grove 8, Bethesda 4, Vancouver WA 4, Edina 3, Cincinnati 3, Richmond VA 3.
  - NVIDIA (68): Westford MA 58, Champaign 3, Madison AL 3, Holmdel 2.
  - Netflix: Rome 1.
  - Anduril (504): Ashville OH 146, Broomfield 75, Quincy MA 67, Fort Collins 65, Quonset 37, Lexington MA 34, McHenry MS 29.

  Proxies in use (`nearby`): Cupertino → San Jose 1,404 (Apple), Santa Clara → San Jose 1,253 (NVIDIA), Kirkland → Bellevue 167, San Bruno → San Francisco 80, Los Gatos → San Jose 92, Hillsboro → Portland 116.

### 4. Juice (10 postings by hand, single and couple)
Each was recomputed with the LIVABILITY.md §1 formula, independently of `computeJuice` (`juice10.mjs`):
- gross = mid × USD per unit (`palette.js` `FX_PER_USD`);
- tax = `taxFor(grossLocal, city.tax, { household })` × USD per unit;
- rent = the household's centre rent from the city record × 12;
- living = costIndex / 100 × $19,982 × scale (1, or 1 / 0.58 = 1.7241 for a couple; LIVABILITY rounds it to "1.72").

**All 20 results match `attachJuice` to the dollar** (gross, tax, rent, living, net and score).

| Posting | City | Salary mid | Gross | Tax (rate) | Rent | Living | Net | Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| microsoft:1970393557002211 Data Security Solutions Engineer | Copenhagen | kr1,023,350 | $156,557 | $63,639 (40.6%) | $24,438 | $16,465 | $52,015 | 48 Ripe |
| google:110895743715156678 Legal Trainee (Fixed-Term) | Stockholm | kr358,500 | $37,208 | $6,723 (18.1%) | $21,173 | $15,286 | −$5,974 | 0 Rind |
| microsoft:1970393556927538 Commissioning Manager | Helsinki | €87,700 | $100,298 | $29,121 (29.0%) | $15,031 | $13,848 | $42,298 | 41 Dry |
| google:100582066948580038 Senior Account Manager, LCS | Toronto | CA$139,500 | $99,278 | $29,265 (29.5%) | $19,496 | $12,109 | $38,408 | 38 Dry |
| google:107953542941024966 SWE Manager, Google Messages | Kraków | zł486,000 | $128,600 | $51,996 (40.4%) | $11,382 | $10,471 | $54,751 | 50 Ripe |
| microsoft:1970393557027022 Solution Area Specialist (Graduate) | Zurich | CHF104,200 | $129,064 | $26,339 (20.4%) | $37,350 | $22,320 | $43,055 | 42 Dry |
| netflix:790313310824 Principal Counsel, Film | Los Angeles | $452,500 | $452,500 | $177,913 (39.3%) | $30,598 | $17,824 | $226,165 | 94 Juicy |
| nvidia:893375056870 SWE Manager, GPU Communications | Santa Clara (San Jose) | $270,250 | $270,250 | $95,552 (35.4%) | $37,027 | $17,904 | $119,767 | 78 Juicy |
| apple:200440680-3337 Senior Linux System Engineer | Seattle | $241,750 | $241,750 | $66,875 (27.7%) | $29,449 | $18,783 | $126,643 | 79 Juicy |
| anduril:4164476007 Flight Software Engineer | Costa Mesa | $174,500 | $174,500 | $58,215 (33.4%) | $32,388 | $15,626 | $68,271 | 57 Ripe |

Couples change only rent (2 bedrooms), living (×1.7241) and the tax basis:
- joint in the US (Los Angeles $144,378, Santa Clara $78,024, Seattle $53,361, Costa Mesa $44,086) and Switzerland ($21,307);
- individual in Denmark, Sweden, Finland and Canada;
- single in Poland.

**Tax spot check (Toronto), independent of `taxFor`:**
- CPP + CPP2 + EI: 5.95% × (74,600 − 3,500) + 4% × (85,000 − 74,600) + 1.63% × 68,900 = CA$5,770, exact.
- Federal income tax by the 2026 brackets and credits: about CA$22,576, against `taxFor`'s 22,572.
- Ontario: about CA$12,980 with surtax and health premium, against 12,780 (−1.5%, within the precision of the thresholds used here).

**No arithmetic problem was found.** The input problems are DQ-27 (the Austin Juice uses Cupertino pay) and DQ-28 (the span's midpoint).

### 5. Vetting (`scripts/vet-salaries.js`, gate applied, as the build does)
- Run with `--no-fixtures --out <scratch>/data-check-beta-2/vet/flags-cli.jsonl`, so nothing was written to `data/vetting/`.
- The same scan (`scanCompany`) on the served norm-8 jobs gives identical flags.
- The crawl's beta-gate lines (run 38118242488) give the same counts.

| Company | Flagged | Critical | Blocking | Main flags | Sample of 10: false alarms |
|---|---:|---:|---:|---|---|
| Apple | 208 | 0 | 0 | non_year_interval 145, structured_text_disagree 63 | **5 false** (structured_text_disagree on merged requisitions, DQ-32); 5 informational (hourly, parsed right) |
| Google | 20 | 0 | 0 | multi_currency 16, missed_salary 4 | 0 false; 8 informational (one line per country, the right one used); 2 real (lei) |
| NVIDIA | 44 | 0 | 0 | non_year_interval 44, ratio_over_3 21 | **5 false** (ratio_over_3 on the posted intern range "20 USD - 71 USD"); 5 informational |
| Microsoft | 95 | 0 | 0 | non_year_interval 79, missed_salary 12, multiple_ranges 5 | 0 false; 7 informational (hourly), 1 informational (UK range used for a UK + Ireland + Romania + Latvia + Lithuania posting), 2 real (lei) |
| Netflix | 8 | 1 | 0 | non_year_interval 6, quarantined 2 | all 8 read: 0 false; 6 informational; the critical one is the L7 range above $1.2M, quarantined by rule; the L4 "$71,040 - $464,000" source typo, quarantined |
| Anduril | 203 | 3 | 0 | non_year_interval 196, ratio_over_3 5 | 0 false; 9 informational, 1 correct quarantine ("$22,000 — $292,000", a source typo) |

DQ-17's false flags are gone: Google 2,015 → 0 `no_pay_context`, Microsoft 1,034 → 0.

### 6. Duplicates and freshness
**The same requisition listed twice:**
- **Apple:** 0 (was 827 requisitions, 1,223 extra copies).
  - 251 title-and-description groups (657 postings) are separate requisitions, mostly retail roles per store or per year. Example: "NL-Manager" ×4 in Amsterdam and Haarlem, posted 2024-06-13, 2026-01-27, 2026-07-22 and 2026-10-07.
- **Google:** no reqId in the record; 8 title-and-description groups (18 postings), none listing the same places twice.
- **NVIDIA:** 23 groups (51 postings); 17 list the same places (22 extra) with distinct JR numbers. Example: "Senior Verification Engineer, PCIE" ×4 in Bengaluru and Hyderabad, JR1998099 to JR2025140, posted 2025-05 to 2026-09: one recurring opening.
- **Microsoft:** 3 groups (6), distinct req ids.
- **Netflix:** 0.
- **Anduril (comparison):** 452 internal_job_ids posted 2+ times (1,443 postings). 297 of them show different pay, mostly one requisition posted at several levels; 28 groups repeat title, description and places (36 extra).

**Older than a year and still listed:** these are real, open postings, and the "Listed N years ago" note shows on them.
- Apple 171 (3.5%, oldest 2021-04-07);
- NVIDIA 168 (6.3%, oldest 2023-05-01);
- Anduril 140 (5.6%);
- Google 37 (1.1%, oldest 2019-10-31);
- Netflix 20 (4.4%);
- Microsoft 0 (oldest 2025-11-03);
- Apple's 81 retail pipeline postings have no posted date by design.

**"New" badge against the history.** The badge is `firstSeenAt` (ledger) later than the viewer's last visit (`public/app.js` `isNewSince`). The beta ledgers (data-archive `beta/history/*.json`, read with `git show`) now hold 4 runs each, 2026-10-10 10:21 to 2026-10-11 07:59.
- **First seen after the first run:** Apple 4, Microsoft 3, NVIDIA 1, Netflix 1, Google 0.
  - Each is a genuinely new id on the board, so "New since your last visit" is right.
  - Two are re-listed older postings: microsoft:1970393556768751 Security Research Intern (posted 2026-02-20), nvidia:893397790070 (posted 2026-08-28).
- **Apple's merge did not reset the badge.** 1,231 per-location listing ids were closed at run 4, and every merged posting keeps its lowest listing id, first seen at run 1. The latent risk is DQ-30.
- **ID and date stability** (first-pass open question): Google's 3,417 ids are the same in all 4 runs, and 0 of 3,417 `postedAt` or `updatedAt` values changed between run 1 (rebuilt from the archive) and today. So Google does not re-stamp "created" between crawls. NVIDIA: 2,662 common ids, 0 `postedAt` changes.
- **Weekend caveat:** 10 and 11 October are a Saturday and Sunday. Google showed 0 opened and 0 closed postings over 20 hours, and its newest posting is 2026-10-09 23:39. Re-check on a weekday that the sitemap moves (Known gaps, §6).
- **Anduril (comparison):** 290 postings first seen after its ledger began (2026-10-02). 34 of them were posted more than 30 days before they were first seen (re-published postings), so they show "New" next to "Listed N days ago"; 8 are linked as reposts.

### 7. Counts (here vs the crawl log vs DATA_SOURCES §7)
Crawl log: `snapshot.yml` run 38118242488, jobs 114407471028 (apple), 114407471024 (google), 114407471031 (microsoft), 114407471053 (nvidia) and 114407471039 (netflix), read through the GitHub connector's `get_job_logs`.

| Company | Snapshot file (postings / with pay) | Crawl log | Archive observation | §7 today |
|---|---|---|---|---|
| Apple | 4,875 / 2,818 | 4,875 (2,818 with salary), 25.4 MB, 5,343 s, 4,704 requests, 4,396 details; "search listed 6094 of 6098 postings"; "6094 listings are 4875 requisitions" | 4,875 / 2,818 | 6,105 / 3,848 (run 38044091555, listings) |
| Google | 3,417 / 2,217 | 3,417 (2,217), 23.6 MB, 3,430 s, 3,421 requests | 3,417 / 2,217 | 3,417 / 2,032 |
| Microsoft | 2,279 / 1,490 | 2,279 (1,490), 29.7 MB, 2,533 s, 2,510 requests; "search listed 2279 of 2285 postings" | 2,279 / 1,490 | 2,320 / 1,482 |
| NVIDIA | 2,663 / 1,396 | 2,663 (1,396), 18.4 MB, 2,940 s, 2,931 requests | 2,663 / 1,396 | 2,664 / 1,394 |
| Netflix | 457 / 290 (2 quarantined) | 457 (290), 4.7 MB, 505 s, 504 requests | 457 / 290 | 456 / 294 |

- All three sources agree exactly.
- §7 has no TBD left, but its table is the first crawl's (Apple as 6,105 listings).
- Patch: [`patches/data-check-beta-2-data-sources.diff`](patches/data-check-beta-2-data-sources.diff) (applies with `git apply --check`). It moves the table to run 38118242488 and keeps the first crawl's numbers in the note. It also records the search shortfalls (Apple 4 of 6,098, Microsoft 6 of 2,285) and the lei gap.

## 2. Inputs and sources
- **Docs read:**
  - docs/DATA_SOURCES.md (§7, 7a to 7h);
  - docs/CONTRACT.md (v2 to v5, the beta fix wave, fix wave 3);
  - docs/LIVABILITY.md §1 and §2;
  - docs/DATA_FRESHNESS.md §1, the FX policy and "History and the archive";
  - docs/process/vetting.md, PLAYBOOK.md and TEMPLATE.md;
  - the first pass's log, prompt and test file.
- **Code read:**
  - `scripts/build-static.js` (`readSnapshot`, `ctx.enrich`, `betaGate`);
  - `server/normalize.js` (`relocateJobs`), `server/sources/upgrade.js`, `server/sources/apple.js` (`mapCopies`, `mapAppleRequisition`, footers);
  - `server/history.js` (`updateLedger`, `annotate`), `server/juice.js` (`attachJuice`, `computeJuice`);
  - `public/app.js` (`isNewSince`, `statusTag`, `payPill`, `payHere`, `payLevelsLine`), `public/features/shared.js` (`payLocations`, `jobLocationKeys`);
  - `scripts/build-market.js`, `scripts/vet-salaries.js` (CLI, `scanCompany`, `scanJob`).
- **Data:**
  - `data/beta/snapshots/*.json` and `data/snapshots/anduril.json` (norm-7, served as norm-8);
  - the ledgers `beta/history/*.json` and `history/anduril.json`, plus `observations/2026-10.jsonl`, from `origin/data-archive` (e20f6cc, 08:01Z) via `git show` into `<scratch>/data-check-beta-2/hist/`;
  - run 1 of Google and NVIDIA rebuilt with `scripts/archive/reconstruct.js --at` from the archive worktree `<scratch>/arch`.
- **Crawl logs:** GitHub connector `actions_list` (run 38118242488 jobs) and `get_job_logs`.
- **Skills:** none were needed. No browser was opened in this pass; the first-pass browser checks (DQ-7) are covered by its passing tests.

## 3. Decisions and rationale
1. **Check what the build serves, not the stored jobs.**
   - Today's snapshots are norm-7 and the code is norm-8, so the build re-derives them.
   - `served.mjs` applies exactly `readSnapshot`'s path, `vetSalaries(upgradeStoredJobs(relocateJobs(rekeyBoardJobs(jobs).jobs)))`. It then adds `history.annotate` with the archived ledger (now = the snapshot's `fetchedAt`) and one-person `attachJuiceAll`, as `public/api.js` does.
   - Every count in this log comes from that output. Stored and served counts agree on pay (re-derivation changed no salary count).
2. **"Right" for a pay parse** means the range, currency and period match the posting's own base-pay sentence under the rules of DATA_SOURCES §7a. A null is right when the text has no base range, or a rule says so.
3. **A place's pay (DQ-27, DQ-28)** is the footer Apple posted for that place's listing. A state with 0 of n single-place postings priced (n ≥ 3) counts as "Apple posts no pay there".
4. **Severity by job seekers misled:** postings affected × how visible the wrong fact is. The card, the Juice headline and the filters count more than drawer details. A missing figure that says it is missing (no Juice) misleads less than a wrong one.
5. **Inversions** are reported for real levels only (Intern < Entry < Mid-level < Senior < Staff+, Manager < Director+). The stored "Mid" default reads as "Level not stated" and is listed separately.
6. **Tests encode the behaviour a seeker needs, not a particular fix.**
   - DQ-27 asserts "no Juice and no pay-here for Austin", which the adapter, `payLocations` or `attachJuice` can satisfy.
   - DQ-29 asserts "not Entry" rather than a specific level.
   - Tests run as to-dos, the project's convention, so `npm test` stays green while the bugs are known.
   - The Apple fixtures are listing rows and details with only the fields the adapter reads, filled with the posting's own values. They reproduce the served numbers exactly (Austin 78 / San Jose 66; Cupertino scored on $198,700).
7. **The brief's "DQ-1 to DQ-26"** is read as the first pass's 26 tests; its findings stop at DQ-17. New findings start at DQ-27 as instructed.
8. **Seeds** differ from the first pass (20261012 and 20261013), so the samples are fresh.

## 4. Replayable steps
```bash
S=<scratch>/data-check-beta-2; WT=<scratch>/wt-s1; mkdir -p $S/{hist/beta,hist/stable,out/served,vet}
for s in apple google microsoft netflix nvidia; do git -C /home/user/melon-seek show refs/remotes/origin/data-archive:beta/history/$s.json > $S/hist/beta/$s.json; done
git -C /home/user/melon-seek show refs/remotes/origin/data-archive:history/anduril.json > $S/hist/stable/anduril.json
git -C /home/user/melon-seek show refs/remotes/origin/data-archive:observations/2026-10.jsonl > $S/out/observations.jsonl
cd $S/scripts
for s in netflix microsoft nvidia google apple anduril; do node served.mjs $s; done   # 3-25 s each: served jobs
node overview.mjs                 # counts, currencies, intervals, levels, countries, remote, ages, Juice
node locaudit.mjs                 # DQ-1: ISO code vs resolved country, US filter vs raw US
node applespan.mjs                # DQ-27/28: places without posted pay, span vs own range
for s in netflix microsoft nvidia google apple anduril; do node sample.mjs $s; done   # 40 + 20, seed 20261012/13
node misses.mjs                   # pay-like sentences on postings without salary
node recheck.mjs                  # DQ-9 .. DQ-16
node levels.mjs                   # board levels, defaults, medians, market-cell inversions (buildMarket)
node drill.mjs google sales Mid-level Senior   # postings behind a cell
node compst.mjs                   # Compstimate ladders
node juicecov.mjs; node juice10.mjs   # Juice coverage; 10 postings by hand (20 rows, all MATCH)
(cd $WT && node scripts/vet-salaries.js --no-fixtures --out $S/vet/flags-cli.jsonl data/beta/snapshots/*.json data/snapshots/anduril.json)
node vetserved.mjs                # same scan on served jobs + 10-flag samples (seed 20261014)
node dups.mjs                     # requisition and title+description groups
(cd $WT && node scripts/archive/reconstruct.js --company google --at 2026-10-10T11:09:51.834Z --archive <scratch>/arch --out $S/out/google-run1.json)
node proto.mjs                    # the Apple fixtures of the tests, against the real numbers
(cd $WT && node --test test/beta-data-check.test.js test/beta-data-check-2.test.js && npm test)
```
Crawl logs: GitHub connector `get_job_logs` (owner alvations, repo melon-seek), the job ids above, last ~95 lines.

## 5. Verification
- `node --test test/beta-data-check-2.test.js`: 11 tests, all `not ok … # TODO`, each failing for its stated reason (checked one by one). For example: "Juice is scored in Austin, TX, Cupertino, CA"; "scored on $198700"; "reqId 200578781-0157"; "Moncks Corner [null] (39.83, -98.58)". The reference assertions inside DQ-29 and DQ-11 pass. `node --check` is OK.
- `node --test test/beta-data-check.test.js`: 26 of 26 pass.
- `npm test` (load about 3): 868 tests, 857 pass, 0 fail, 11 to-dos (this file), 2 min 59 s. Re-run at 12:06 with this log in place, and with the salary-vetting agent's new `test/beta-vetting.test.js` in the worktree: 881 tests, 862 pass, 0 fail, 19 to-dos (11 here, 8 there).
- **Manual checks:**
  - the 360 sampled postings against their text;
  - the 10 Juice postings by hand, single and couple (20 of 20 match);
  - the Toronto tax by its 2026 rules;
  - the crawl logs, archive observations and snapshot files (identical counts);
  - the CLI scan against the served-jobs scan (identical);
  - the DATA_SOURCES patch with `git apply --check`.
- Nothing was written to `data/vetting/` (the salary-vetting agent's folder) or to the shared checkout. Its git metadata was only read (`git show`, `git log`).

## 6. Known gaps and follow-ups
- **Weekday re-check:** this crawl ran on a weekend. Re-run check 6 on Tuesday's crawl to confirm Google's sitemap opens and closes postings: 0 and 0 over 20 hours today, while Microsoft closed 44.
- **Not opened live:** Apple's Texas listings, to confirm their jobDetails carry no footer at all rather than one for another place. The sandbox can't reach jobs.apple.com, and the 0-of-299 count is the evidence. A `scripts/probe-bigtech.js` run with `keepRaw` would settle it.
- **No browser check this pass** (the drawer's "Pay by level" line and the Austin card were read from `public/app.js`). A QA agent could screenshot apple:200578781-0157 with an Austin filter.
- **Ladder decisions for the lead:** Google "IV" at Staff pay (DQ-29), Microsoft ATR-B…E (DQ-3 residue), and whether NVIDIA's sales "cash compensation" should become `kind: 'ote'` (open since the first pass).
- **Suggested fix order:**
  1. DQ-27 and DQ-28 together: the Apple adapter records each footer's places even for one range, and `attachJuice`, `payLocations` and `usdMid` use the place's own range.
  2. DQ-29 (keywords.js, small).
  3. RON in the FX table (DQ-6 residue).
  4. cities.json for Westford, Madison, Ann Arbor, Goleta, San Antonio, Charlotte, Fargo (DQ-4 residue).
  5. DQ-30, DQ-31, DQ-32, DQ-11 residue (each a line or two).

## 7. Change log
- 2026-10-11 11:30 Prompt saved; docs and the first pass read; snapshots found at norm-7 (code norm-8).
- 11:35 `served.mjs`: all six boards rebuilt as the build serves them; overview; ledger and observation history fetched from data-archive.
- 11:38 First-pass tests: 26/26 pass. Location audit (DQ-1 fixed); Apple merge audit (DQ-2: 0 duplicates; span and unposted-place pay found).
- 11:42 Samples (seed 20261012/13) read for six boards; board-wide miss sweep; DQ-9 to DQ-16 re-check.
- 11:46 Levels, market cells (`buildMarket`), Compstimate ladders; Google ladder finding.
- 11:49 Juice coverage; 10 postings by hand (20/20); vet scan (CLI and served, identical) and 10-flag samples.
- 11:52 Duplicates; run 1 rebuilt from the archive for Google and NVIDIA (no date re-stamping); crawl logs read.
- 11:55 `test/beta-data-check-2.test.js` (11 to-do tests) and the DATA_SOURCES patch.
- 12:00 `npm test` green (857 pass, 11 to-do); this log.
