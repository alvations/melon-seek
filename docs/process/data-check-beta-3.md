# Process log: data-check-beta-3

## 1. Brief
Prompt: [`docs/process/prompts/data-check-beta-3.md`](prompts/data-check-beta-3.md) (verbatim).
Goal: the third data check of `/beta/` and the **first check of Amazon and Meta**. It re-checks every finding
of the second pass ([data-check-beta-2.md](data-check-beta-2.md)) and of the beta salary vetting
([vetting-beta.md](vetting-beta.md)) after fix wave 4, then checks, company by company, that the numbers a job
seeker sees are right: Amazon (5,000 of 22,352), Meta (1,139), Apple (4,874), Google (3,415), NVIDIA (2,662),
Microsoft (2,285) and Netflix (457), with Anduril (2,491) for comparison.
- **Data:** `snapshot.yml` run 38143991379 (2026-10-11, crawls 14:57 to 16:27 UTC, the first with Amazon and
  Meta) and the 17:27 stable boards, rebuilt from the data-archive branch (9409913).
- **Code:** worktree `wt-s3` at 94cb54c (fix wave 4). The snapshots are norm-8 and the code is norm-9, so the
  build re-derives them; every count below is what the build serves.
- **No product code was changed.**

Files owned:
- this log;
- the prompt copy;
- `test/beta-data-check-3.test.js` (new, 10 tests, all failing as to-dos);
- `docs/process/patches/data-check-beta-3-data-sources.diff` (applies with `git apply --check`).

New findings are **DQ-33 to DQ-43**. A residue of an earlier finding keeps that finding's id.

## Verdicts

| Company | Verdict | Why, in one line |
|---|---|---|
| Amazon | **usable with caveats** | Every sampled range is read right (40/40), but the per-location pay table is not tied to places: 14.0% of postings score Juice on another city's range and 13.9% show a "span" that is one city's row (DQ-33); 31.2% have no Juice because their city has no record (DQ-34); a Mexico peso salary reads as $150,828 a year (DQ-35). |
| Meta | **usable with caveats** | Pay is right (40/40, 20/20; 79.3% with pay, 99.9% of US postings), but 75.1% of postings are "Level not stated", including the 43 "(Technical Leadership)" bands that pay above Senior (DQ-37); one Italy range is scored in Madrid and Paris (DQ-42). |
| Apple | **trustworthy** | DQ-27, DQ-28, DQ-30 and DQ-32 are fixed on the real data (0 headline Juice in a state without posted pay; 870 of 870 per-place Juice entries use their own range). Pay 40/40 and 20/20. |
| Google | **trustworthy** | DQ-29 and DQ-31 are fixed; the 4 lei ranges show (DQ-6). Pay 40/40 and 20/20. 219 paid postings still have no Juice city (DQ-4 residue). |
| NVIDIA | **trustworthy** | Pay 40/40 and 20/20; no new finding. 45 sales "cash compensation" ranges are null by rule (VT-7, a decision). |
| Microsoft | **trustworthy** | Pay 40/40 and 20/20; 10 lei ranges show. Notes: 2 posted Romania ranges are quarantined as outliers (DQ-6 residue); 25.5% of paid postings have no Juice (country-only places, DQ-4 residue). |
| Netflix | **trustworthy** | Pay 40/40 and 20/20; DQ-3 residue fixed (L5 titles read). Known: Product Manager Compstimate Mid > Senior (P-3). |
| Anduril (comparison) | **trustworthy** | 94.1% with pay, 40/40 and 20/20, 3 critical flags (all quarantined, as before). |

## Findings, ordered by how many job seekers they mislead

Severity:
- **High:** a wrong fact on many postings in a main view.
- **Medium:** wrong or missing figures on a meaningful share.
- **Low:** few postings, a label, or a latent problem.

Every test is in `test/beta-data-check-3.test.js` and runs as a to-do.

| ID | Sev. | Company | Postings affected | Owner (file, function) | Test |
|---|---|---|---:|---|---|
| DQ-33 | Med-High | Amazon | Juice on another city's range: 699 of 5,000 (14.0%), 286 of them the headline (5.7%). Card "span" that is one row: 696 (13.9%). Identical rows counted as zones: 506 (10.1%) | `server/sources/amazon.js` `amazonSalary`; `server/normalize.js` `deriveSalary` (`zonesOf`); `server/juice.js` `attachJuice` (`placeUSD`); `public/app.js` `payPill`, `payRanges` | 2 |
| DQ-34 | Medium | Amazon, Meta | Paid postings with no Juice because the city has no record: Amazon 1,561 (31.2%), Meta 62 (6.9%) | `data/cities.json` (records, `nearby`) | none (data) |
| DQ-35 | Medium (per posting) | Amazon | A bare "$" in Mexico read as USD: 1 posting here ($12,569 a month shown as $150,828 a year); more on the whole board | `server/salary.js` (currency of a bare "$" by country) | 1 |
| DQ-36 | Low-Med | Amazon | "III" titles (L6, Senior pay) filed Mid: 79 (1.6%) | `server/keywords.js` `ladderRung` | 1 |
| DQ-37 | Low-Med | Meta | "(Technical Leadership)" titles on the default "Mid": 43 (3.8%), median $260K | `server/keywords.js` `seniorityOf` | 1 |
| DQ-38 | Medium (latent, next crawl) | Amazon | The ledger knows only the 5,000 kept postings: about 17,350 will read "New since your last visit" on the first uncapped crawl | `server/history.js` `updateLedger`; `scripts/snapshot.js` `recordPublished` | 1 |
| DQ-39 | Low | Amazon | Identical postings (title, text, place and pay): 249 groups, 472 extra cards (9.4%) | `server/sources/amazon.js` (or a grouping in the list) | none (decision) |
| DQ-40 | Low | Amazon | Places with an ISO-3 code ("…, SVK", "…, AUT") have no country: 16 entries in 15 postings | `server/geo.js` `geocode` | 1 |
| DQ-41 | Low | Amazon | Card range from a "Virtual Location" row for none of the posting's places: 24 (0.5%) | `server/sources/amazon.js` `amazonSalary` | 1 |
| DQ-42 | Low | Meta | A country's range scored in other countries that use its currency: 1 posting (salary.country is never set for Meta) | `server/sources/meta.js` `mapMetaJob` | 1 |
| DQ-6 (residue) | Low | Microsoft | 2 posted Romania IC1 ranges quarantined as company-wide outliers ("Pay unclear") | `server/vet.js` `statOutliers` | 1 |
| DQ-43 | Low (process) | all | `vet-salaries.js` scans the stored norm-8 salaries, not what the build serves: 16 false `missed_salary` (Google 4, Microsoft 12) and 2 quarantines unseen | `scripts/vet-salaries.js` (CLI loader) | none (CLI) |
| DQ-4 (residue) | Low-Med | Google, Microsoft, Anduril | Paid postings with no Juice city: Google 219, Microsoft 118 (+257 country-only), NVIDIA 11, Apple 39, Anduril 301 | `data/cities.json` | none (first-pass test passes) |

### DQ-33 (Medium-High) Amazon: the per-location pay table is not tied to places
- **What Amazon publishes:** after "The base salary range for this position is listed below.", one line per
  location: "USA, NY, New York - 144,500.00 - 195,400.00 USD annually", "USA, VA, Herndon - 131,300.00 -
  177,600.00 USD annually" (USD, yearly, base; the paragraph names "sign-on payments and restricted stock units
  (RSUs)", which are never added).
- **What we do:** `amazonSalary` uses the row of the posting's primary city as the salary and keeps every row
  in `salary.ranges` with a text `label` only, no `locations`. Then:
  1. `attachJuice` (`placeUSD`) finds a range for a place only through `ranges[].locations`, so **every place is
     scored on the primary city's range**. Example: amazon:10535213 "Principal Technical Account Manager, AWS
     Enterprise Support" (https://www.amazon.jobs/en/jobs/10535213): the headline Juice is Dallas, scored on New
     York's $201,000–$272,000; Dallas's own row is $182,800–$247,300. amazon:10558923 "Cloud Hardware
     Development Engineer I, Annapurna Labs, Early Career - 2027" (https://www.amazon.jobs/en/jobs/10558923):
     Austin 116,100 USD, Cupertino 133,600 USD ("one number" each); Cupertino is scored on 116,100.
  2. `payPill` reads `payRanges` and writes "$131K–178K · 2 places" with the tip "runs from the lowest to the
     highest of 2 ranges", but the range is the primary row, not the span (amazon:10534259 "Cloud Technical
     Account Manager", https://www.amazon.jobs/en/jobs/10534259: New York $144.5K–195.4K is the top of the span).
  3. `pickedRange` needs `ranges[].locations` too, so a Location filter never picks the city's own range.
  4. `deriveSalary` counts zones as `ranges.length`, so three identical rows are three zones:
     amazon:10534302 "Sr. Energy Strategy Manager, AWS Energy Team" (https://www.amazon.jobs/en/jobs/10534302)
     reads "· 3 places" and "Pay by place: USA, TX, Austin $155K–210K · USA, VA, Arlington $155K–210K · USA, WA,
     Seattle $155K–210K" for one range.
- **Share:** 1,226 postings have 2+ rows (24.5%): 720 with different rows, 506 with identical ones. Juice at some
  place uses another place's row on 699 (14.0%), the headline on 286 (5.7%). Card range not the span: 696.
  Hourly rows (44 postings) are listed in their hourly numbers ("$33–58") under an annual card figure.
- **Expected:** each row's places (`ranges[].locations`, as Apple's merged requisitions have since DQ-28),
  distinct rows only as zones, and the card's "· N places" only when the rows differ, with the span.
- **Text density:** the drawer's "Pay by place" line runs to a median 17 words, p90 35 and max 85 (up to 10
  rows), in Amazon's raw labels ("USA, WA, BELLEVUE", "USA, CA, Virtual Location - California"), repeating one
  range when the rows are identical. With places on the rows it can group places by range ("Austin, Arlington,
  Seattle $155K–210K").
- **Tests:** `DQ-33 …` (2): Cupertino is scored on 133,600; three identical rows are one zone.

### DQ-34 (Medium) Amazon and Meta: cities with no living-cost record
- Juice is `null` for a place with no city record; there is no fallback city. Amazon: 3,391 of 5,000 paid
  postings have Juice (67.8%); 1,561 have none because no place in the pay's country has a record (27 are
  remote only, 14 have no place in the pay's country, 6 are part-time without hours).
- Amazon cities (paid entries): Canton MS 103, North Reading MA 55, Jersey City NJ 51, Sparks NV 44, New Carlisle
  IN 43, Boardman OR 35, Westboro WI 33, Jeffersonville OH 30, Hamlet NC 27, Jessup MD 27, Umatilla OR 27,
  Frederick MD 25, Manassas VA 24, Hermiston OR 22, East Palo Alto CA 19 (1,956 entries in all).
- Meta (827 of 903 with Juice, 91.6%): Burlingame CA 72, New Albany OH 32, Rayville LA 26, Bowling Green OH 25,
  El Paso TX 25, Lebanon IN 24, Temple TX 23, Beaver Dam WI 21, Papillion NE 19, Montgomery AL 18.
- Jersey City, East Palo Alto and Burlingame sit next to cities that have records (New York, Palo Alto/San Jose,
  San Francisco), so `nearby` proxies would cover them; the warehouse and data-centre towns need records.
- Example: amazon:10497338 "Area Manager II", Arlington WA ($82,600–$90,900), no Juice.
- No test: the first-pass DQ-4 test covers the hubs; this is a data addition.

### DQ-35 (Medium per posting) Amazon: "$" in a Mexico posting read as US dollars
- amazon:SF260124856 "Asociado de Servicio al Cliente Bilingüe Español-Inglés Remoto", Remote (Mexico),
  https://www.amazon.jobs/en/jobs/SF260124856: "Monthly Salary: $12,569" (pesos, monthly, base).
- **Actual:** USD 150,828 a year, the top of a pay sort for a customer-service role. **Expected:** MXN 12,569 a
  month (about US$8,000 a year at the table's rate), or no salary.
- The vet scan flags it (`currency_country_mismatch`), but the flag is not blocking.
- 1 of 5,000 here (the cap kept it as "salaried"); the whole board (next crawl) has more Mexico postings.
- Owner: `server/salary.js`. The Canada rule ("$" in a Canada-only posting is CAD) has no Mexico twin.
- **Test:** `DQ-35 …`.

### DQ-36 (Low-Medium) Amazon: "III" is Senior on Amazon's ladder
- Amazon's numerals: I = L4, II = L5, III = L6. US base medians in this crawl:

  | Family | I | II | III | Sr. | Principal |
  |---|---|---|---|---|---|
  | Software Development Engineer | $148K (1) | $169K (100) | **$198K (10)** | $198K (86) | – |
  | Program Manager | $108K (4) | $106K (15) | **$175K (13)** | $175K (133) | $208K (13) |
  | Applied/Research Scientist | – | $168K (8) | **$216K (7)** | $197K (33) | $234K (6) |

- The generic ladder files III as Mid: 79 postings (plus 29 "Manager III" titles that are Manager by the word).
- Examples: amazon:10539128 "Software Dev Engineer III, Prime Air" ($168,100–$227,400),
  https://www.amazon.jobs/en/jobs/10539128; amazon:10536212 "SDE III, AWS Field Experience"; amazon:10539313
  "Program Manager III, Amazon Leo Government".
- **Test:** `DQ-36 …`.

### DQ-37 (Low-Medium) Meta: "(Technical Leadership)" titles default to "Level not stated"
- Meta's titles carry no level, so 855 of 1,139 (75.1%) are the default. The exception is the 43
  "(Technical Leadership)" / "(Leadership)" titles: median US base **$260K** (n33), above Meta's Senior $206K (n68)
  and Staff+ $238K (n5).
- Examples: meta:1061795906099278 "Software Engineer - iOS (Technical Leadership)" ($219,000/year to $301,000/year
  + bonus + equity, US), https://www.metacareers.com/profile/job_details/1061795906099278/; meta:1048284581217404
  "Data Scientist (Technical Leadership)" ($210,000–$281,000); meta:2193201618154538 "Product Manager
  (Leadership)" ($249,000–$323,000).
- Meta posts a different band per hidden level ("Software Engineer" ranges: $121,992–$181,000, $154,003–$217,000,
  $183,997–$257,000, $219,000–$301,000, $271,000–$347,000, $347,000–$403,000). Reading a level from the band is a
  ladder decision for the lead, so it has no test.
- **Test:** `DQ-37 …` (the leadership titles only).

### DQ-38 (Medium, latent until the next crawl) Amazon: the cap hides postings from the ledger
- `recordPublished` passes the listed ids to `updateLedger`, which keeps **existing** entries open but never
  creates one for a listed posting the cap left out. The Amazon ledger (data-archive `beta/history/amazon.json`)
  has 5,000 entries for a board of 22,352.
- When the next crawl publishes the whole board (the user's decision), about 17,350 postings get `firstSeenAt` =
  that crawl. A visitor who opened Amazon on 2026-10-11 sees them all as "New since your last visit"
  (`isNewSince`), although most were listed that day.
- **Expected:** a listed but unpublished posting is recorded as seen (so `firstSeenAt` is its first listing).
- **Test:** `DQ-38 …` (two runs of `updateLedger`).

### DQ-39 (Low) Amazon: identical postings
- 249 groups of postings with the same title, description, places and pay; 472 extra cards (9.4% of 5,000).
  Each is a separate requisition (`id_icims`), mostly volume hiring: amazon:10533795 to amazon:10533824, 7 ×
  "Data Center Logistics Specialist, DCC Communities", New Carlisle IN, $24.27–$42.54/hour, posted 2026-09-09.
- They take budget under the cap and count separately in Compare companies' n and medians.
- Meta 1 group (meta:1740938817139250, meta:1951742679122711 "Research Scientist, Server Demand"); Apple 181
  (retail per store), NVIDIA 17, Microsoft 2, Anduril 28; Google, Netflix 0. No requisition id is listed twice on
  any board.
- Whether to group them is a product decision, so no test.

### DQ-40 (Low) Amazon: ISO-3 country codes in places
- "Bratislava, Bratislavský kraj, SVK" 8, "Enns, Upper Austria, AUT" 4, "Großebersdorf, Lower Austria, AUT" 2,
  "Premstätten, Styria, AUT" 1, "Sereď, Trnavský kraj, SVK" 1: 16 entries in 15 postings with no country, so no
  map pin, no country filter and no Juice (the EUR pay shows).
- **Test:** `DQ-40 …`.

### DQ-41 (Low) Amazon: a virtual-location row used for an office posting
- With no primary city, the first row in the country is used, which can be a "Virtual Location" row for a state
  the posting does not list. amazon:10537027 "Technical Account Manager - Enterprise, Amazon Leo"
  (https://www.amazon.jobs/en/jobs/10537027): Bellevue WA, Arlington VA and Remote (US); the card shows
  "USA, SC, Virtual Location - S Carolina - 118,200.00 - 160,000.00 USD annually"; both offices pay
  $131,300–$177,600. 24 postings (0.5%); for 2 the posting's own places pay more, for 4 less.
- **Test:** `DQ-41 …`.

### DQ-42 (Low) Meta: a country's range scored in another country
- meta:902109179409028 "Privacy and Data Policy Manager" (Madrid, Paris, Milan, London),
  https://www.metacareers.com/profile/job_details/902109179409028/: "€89,000/year to €114,000/year + bonus +
  equity (IT)". Juice: Madrid 44, Paris 40, Milan 32, all on Italy's range.
- `mapMetaJob` knows the range's country (`pick.country`) but does not set `salary.country`, which
  `attachJuice` and `payLocations` use (VT-5). 1 posting; every Meta salary lacks `salary.country`.
- **Test:** `DQ-42 …`.

### DQ-43 (Low, process) The vet scan does not scan what the build serves
- `node scripts/vet-salaries.js … --no-write-flags` reports "as served: gate applied", but it applies the gate to
  the stored salaries without `readSnapshot`'s re-derivation. On today's norm-8 snapshots:
  - Google 20 flags (16 served), Microsoft 95 (82), Netflix 8 (6);
  - the 16 `missed_salary` (Google 4, Microsoft 12 lei ranges) are false: norm-9 reads them;
  - the 2 Romania quarantines (DQ-6 residue) are not seen.
- The crawl-time gate ran older code (3f47ddc) and reported Apple `structured_text_disagree=64`; today's scan has 0
  (DQ-32 fixed).
- This is vetting-beta's known gap ("an `--as-published` option"). No unit test: the CLI has no exported loader.

### Residues
- **DQ-6 (lei):** fixed for display: Google 4 and Microsoft 10 RON ranges show. Residue: microsoft:1970393557014754
  "Cloud Solution Architect" ("Cloud Solution Architecture IC1 - The typical base pay range for this role across
  Romania is lei 83,000.00 - lei 107,800.00 per year", RON, yearly, base) and microsoft:1970393556864608
  "Technical Support Engineer - Entry Level" (lei 90,500–135,700) are quarantined: "pay $20.8K/yr is a
  statistical outlier for this company (median $166K; company z=-5.2, low fence …)". `statOutliers` compares a
  Romanian salary with US ones. https://apply.careers.microsoft.com/careers/job/1970393557014754. Test: `DQ-6 residue …`.
- **DQ-4 (cities):** Google 219 paid postings without Juice (Waterloo 13, Saint-Ghislain 11, Haskell TX 10,
  Council Bluffs 9, Frankfurt 8 …), Microsoft 118 (Bucharest 10, now that lei shows; Gävle 7, Pecos 6, Cheyenne 6)
  plus 257 with only a country or state, NVIDIA 11 (Westford MA), Apple 39, Anduril 301 (Ashville OH 102).

### Known items seen, not re-filed
- **P-2 (flat Compstimate where a level has no comparables):** Meta's ladders are flat (Software Engineer Entry =
  Mid = Senior $220K) because 75% of Meta postings have no level; Amazon Area Manager reads Entry $114K > Mid $82K
  > Senior $80K (the Entry cell borrows other Entry roles).
- **P-3 (stored "Mid" pools unlevelled roles):** Netflix Product Manager Mid $583K > Senior $430K; Meta legal
  Mid $238K (n12) > Senior $204K (n3).
- **MR-14:** today's Amazon snapshot predates it, so its `jobsCapped` has no `salaried` count and the page cannot
  say "63% of all 22,352 postings show pay". The next crawl writes it.

## Re-check of the earlier findings

| ID | Status | Evidence on today's data |
|---|---|---|
| DQ-27 | **Fixed** | 0 of 2,818 Apple paid postings have their headline Juice in a state where Apple posts no pay (was 367). 317 Austin postings still carry a salary (Cupertino's), but `payLocations` includes Austin for 0 of them; 240 have `salary.places` |
| DQ-28 | **Fixed** | 395 merged requisitions with per-place ranges: 870 of 870 Juice entries use their own range (apple:200680778-0186: Cupertino 66 on $214,000, Carlsbad 62 on $202,800) |
| DQ-29 | **Fixed** | Google Product Manager II = Mid (16), I = Entry (7); Leadership TPM I/II = Senior (3); Facilities Manager I/II = Manager |
| DQ-30 | **Fixed** | 0 of 4,874 Apple reqIds carry a location suffix |
| DQ-31 | **Fixed** | The 9 ZIP entries keep their state (Moncks Corner, SC at 33.20; Pryor Creek, OK) |
| DQ-32 | **Fixed** | 0 Apple `structured_text_disagree` flags in the served scan (the crawl-time gate, on older code, still said 64) |
| DQ-3 residue | **Fixed** | netflix:790317701711 and netflix:790317630105 (L5) Senior; netflix:790318143742 (L5+L6) Staff+ |
| DQ-6 residue | **Partly fixed** | lei ranges show (Google 4, Microsoft 10); 2 quarantined (residue above) |
| DQ-11 residue | **Fixed** | apple:200617354-4265 is a pool; 47 Apple pools |
| DQ-4 residue | **Open** | lists above |
| VT-1 … VT-13 | **Fixed** (except VT-7, VT-8, VT-10: decisions) | `test/beta-vetting.test.js` 54 of 56 pass, the 2 VT-8 to-dos remain; microsoft:1970393556980229 (Brazil only) has no U.S. salary |

`node --test test/beta-data-check.test.js test/beta-data-check-2.test.js test/beta-vetting.test.js`: 54 pass,
2 to-dos (VT-8), 0 fail.

## Checks per company, with numbers

### 1. Pay parsing
**Sample.** Seeded Fisher-Yates (mulberry32) over ids in sorted order, seed 20261111 for 40 with pay and
20261112 for 20 without (`sample.mjs`). Each posting was read against the money sentences of its description;
`sverify.mjs` then checked mechanically that the posted min and max, the currency and the period are in the
posting's own sentence (Meta: in its `public_compensation` text, which the description does not carry).

| Company | Postings | With pay | Share | US-located with pay | 40 with pay | 20 without | Misses, whole board |
|---|---:|---:|---:|---:|---:|---:|---|
| Amazon | 5,000 (of 22,352) | 5,000 | 100% here; 63.0% of the board (14,092) | 4,670/4,670 | 40/40 | – (no unpaid posting kept) | 0; 1 wrong currency (DQ-35) |
| Meta | 1,139 | 903 | 79.3% | 889/890 (99.9%) | 40/40 | 20/20 (all outside the US/CA) | 0 |
| Apple | 4,874 | 2,818 | 57.8% | 2,818/3,331 (84.6%) | 40/40 | 20/20 | 0 |
| Google | 3,415 | 2,221 | 65.0% | 1,800/1,807 | 40/40 | 20/20 | 0 (the 4 lei lines are read now) |
| NVIDIA | 2,662 | 1,395 | 52.4% | 1,359/1,401 | 40/40 | 20/20 | 0; 45 sales "cash compensation" null by rule |
| Microsoft | 2,285 | 1,497 | 65.5% | 1,168/1,173 | 40/40 | 20/20 | 0; 2 quarantined (DQ-6 residue); 1 Brazil-only U.S. range null (VT-1) |
| Netflix | 457 | 288 | 63.0% | 265/281 | 40/40 | 20/20 (1 union floor, null by rule) | 0; by rule 5 union floors, 4 sales area bands, 2 internship bands; 2 quarantined |
| Anduril | 2,491 | 2,345 | 94.1% | 2,336/2,383 | 40/40 | 20/20 | 0 |

**Pay sentences, new boards:**
- **Amazon.** "The base salary range for this position is listed below. Your Amazon package will include sign-on
  payments and restricted stock units (RSUs)." then rows: "USA, WA, Seattle - 143,700.00 - 194,400.00 USD
  annually"; hourly "USA, MS, Canton - 25.19 - 44.08 USD hourly"; one figure "Austin, TX, USA - 116,100.00 USD
  Annually"; "CAN, ON, Toronto - 114,800.00 - 191,800.00 CAD annually". Base, yearly or hourly; sign-on and RSUs
  never added. Older postings: "(40 hours / week, 8:00am-5:00pm, Salary Range $137488 - $178400)", read as
  yearly (`interval_corrected`, 33, right). Interns are posted at a yearly rate ("PhD Economics Intern … 122,740.00
  USD Annually").
- **Meta.** Structured: "$184,000/year to $257,000/year + bonus + equity (US)"; interns "$7,313/month to
  $11,293/month (US)" (no bonus or equity); "CA$…/year (CA)", "PLN…/year (PL)", "€…/year (IT)". Base; bonus and
  equity named, never added.
- The other boards' sentences are as in data-check-beta-2 §1.

**Several levels in one posting:** none on Amazon or Meta (Amazon's rows are places, DQ-33). NVIDIA 867 and
Microsoft 168 salaries keep `salary.levels`; the drawer shows "Pay by level: Level 4: $184K–287.5K · Level 5:
$224K–356.5K" and the note "These are NVIDIA's own level names." (two short lines).

**Non-US currencies with pay:** Amazon CAD 192, EUR 102 (Italy 84, Austria 2, Germany 2 …), PLN 33, AUD 2 (and
the MXN posting read as USD). Meta CAD 9, PLN 1, EUR 1. Google EUR 265, CAD 68, PLN 65, SEK 13, DKK 6, RON 4.
Microsoft EUR 155, GBP 77, CAD 46, SEK 13, CZK 11, RON 10, DKK 8, PLN 4, NOK 4, CHF 1. NVIDIA PLN 26, CAD 8, EUR 2.
Netflix CAD 22, EUR 1. Anduril GBP 2, EUR 2, JPY 1. Apple none.

### 2. Levels
**Board levels to our Seniority** (n, our level/basis, US yearly median):
- **Amazon:** I 70 (Entry 53, Intern 13; $116K); II 421 (Mid 280, Manager 129; $152K); III 124 (Mid 79, Manager
  29, Senior 16; $181K, DQ-36); IV 4 Senior. "Sr." titles Senior, "Principal" Staff+. Default 2,306 (46.1%); of
  these 388 say "manager" (Account, Program, Product managers: not people managers) and 41 "architect".
- **Meta:** no level in titles; default 855 (75.1%): "manager" 208, "architect" 18, "associate" 12; the 43
  leadership titles (DQ-37).
- **Others** (unchanged since fix wave 4): Microsoft IC1/IC2 Entry, IC3 Mid ($152K), IC4 Senior ($177K), IC5 Staff+
  ($209K), IC6 Staff+ ($231K), M3/M4 Manager, M5/M6 Staff+/Director+; ATR-B to ATR-E (74) mostly default. NVIDIA
  Level 1/2 Entry ($145K), 2/3 Mid ($167K), 3/4 to 5/6 Senior ($220K to $328K), 6/7 Staff+ ($380K). Google I Entry
  ($153K), II Entry or by family ($168K), III Mid ($179K), IV Senior ($254K), V Staff+. Netflix L3 Entry, L4 Mid
  ($332K), L4/5 Senior ($608K), L5 Senior ($473K), L6 Staff+ ($700K).

**"Mid" default share:** Meta 75.1%, Apple 74.3%, Amazon 46.1%, Google 43.3%, Anduril 41.1%, Netflix 23.2%,
Microsoft 19.8%, NVIDIA 16.2%.

**Medians by our level** (USD, yearly salary; "Mid(d)" is the default):

| Company | Intern | Entry | Mid(d) | Mid-level | Senior | Staff+ | Manager | Director+ |
|---|---|---|---|---|---|---|---|---|
| Amazon | $129K (14) | $116K (49) | $152K (1,426) | $169K (323) | $175K (1,036) | $212K (140) | $129K (682) | $227K (32) |
| Meta | – | $133K (3) | $189K (656) | – | $206K (68) | $238K (5) | $196K (95) | $277K (40) |
| Apple | – | $169K (2) | $214K (1,986) | – | $244K (476) | $257K (45) | $281K (145) | $404K (19) |
| Google | $115K (23) | $146K (88) | $173K (597) | $179K (173) | $213K (460) | $254K (255) | $254K (168) | $313K (33) |
| NVIDIA | – | $160K (43) | $197K (70) | $167K (40) | $239K (902) | $352K (100) | $281K (123) | $349K (38) |
| Microsoft | – | $127K (14) | – | $152K (144) | $177K (450) | $209K (336) | $151K (85) | $204K (68) |
| Netflix | – | $223K (3) | $340K (41) | $332K (18) | $473K (101) | $700K (35) | $299K (58) | $611K (5) |
| Anduril | – | $101K (33) | $150K (844) | $90K (10) | $170K (834) | $222K (173) | $170K (134) | $256K (117) |

- Amazon Intern $129K (14) > Entry $116K (49): Amazon's interns here are mostly PhD and Masters roles posted at a
  yearly rate; the Entry cell is "I" titles. Real, not a parse error.
- Amazon Manager $129K (682) sits below Senior: "Area Manager" operations roles ($80K median, 190 postings).

**Inversions users see.** Compare companies (`buildMarket` over the served jobs; real levels only):
amazon·support Mid-level $156K (n10) > Senior $138K (n75); amazon·facilities Manager $143K (n106) > Director+
$131K (n7); amazon·hardware Manager $209K (n4) > Director+ $152K (n4); google·sales Mid-level $169K (n7) > Senior
$151K (n39); google·solutions Senior $254K (n14) > Staff+ $228K (n5) ("IV" at Staff pay, the open ladder
decision); microsoft·design Senior $214K (n8) > Staff+ $209K (n3); google·swe Entry ≈ Mid-level (a tie). Stored
"Mid" above Senior: meta·legal $238K (n12) vs $204K (n3), meta·people $204K (n4) vs $177K (n3),
netflix·product $583K vs $428K, google·sales $166K vs $151K. Compstimate (`compst.mjs`, 4 titles each for Amazon
and Meta): Amazon Area Manager Entry $114K > Mid $82K > Senior $80K; Netflix Product Manager Mid > Senior (known).

### 3. Locations
- **Canonical names:** Amazon's "City, State, USA" become "City, ST" and Meta's are already "City, ST". Wrong:
  16 Amazon ISO-3 entries (DQ-40). Places the gazetteer doesn't know are put at their region's centre by design:
  Amazon 1,685 entries in 1,499 postings (30.0%: warehouse and data-centre towns), Meta 436 in 172 (15.1%).
- **Multi-location postings:** each counted once in the list, in every city on the map and in the Location
  filter. Share with 2+ places: Meta 51.7%, Amazon 25.1% (others as in pass 2).
- **Remote vs hybrid:** only `remote`. Amazon 36 (0.7%, "Remote (US)" and virtual-location rows), Meta 95 (8.3%:
  "Remote, US" 92, Canada 2, UK 1). Hybrid is not modelled.
- **No living-cost record** (Juice is null, no fallback), paid postings without Juice:

  | Company | Paid | With Juice | No city record | Country/state only | Remote only | Other |
  |---|---:|---:|---:|---:|---:|---|
  | Amazon | 5,000 | 3,391 (67.8%) | 1,561 | 1 | 27 | no place in the pay's country 14; part-time without hours 6 |
  | Meta | 903 | 827 (91.6%) | 62 | 0 | 14 | – |
  | Apple | 2,818 | 2,728 (96.8%) | 39 | 0 | 0 | part-time without hours 51 |
  | Google | 2,221 | 1,967 (88.6%) | 219 | 32 | 0 | another country 3 |
  | NVIDIA | 1,395 | 1,317 (94.4%) | 11 | 65 | 0 | another country 2 |
  | Microsoft | 1,497 | 1,115 (74.5%) | 118 | 257 | 0 | another country 7 |
  | Netflix | 288 | 184 (63.9%) | 0 | 0 | 104 | – |
  | Anduril | 2,345 | 2,039 (87.0%) | 301 | 0 | 3 | another country 2 |

  Cities: DQ-34 and DQ-4 residue above. Proxies in use: Herndon → Reston 313 (Amazon), Santa Clara → San Jose 93,
  Culver City → Los Angeles 79, Cupertino → San Jose 59 (Amazon); Fremont → San Jose 30 (Meta).

### 4. Juice (10 postings by hand, single and couple)
Recomputed with the LIVABILITY.md §1 formula, independently of `computeJuice` (`juice10.mjs`): gross = mid ×
USD per unit (`FX_PER_USD`); tax = `taxFor(grossLocal, city.tax, { household })` × USD per unit; rent = the
household's centre rent × 12; living = costIndex / 100 × $19,982 × (1, or 1.7241 for a couple).
**All 20 results match `attachJuice` to the dollar.**

| Posting | City | Salary mid | Gross | Tax (rate) | Rent | Living | Net | Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| amazon:10535659 SDE II, Advertiser | Toronto | CA$153,300 | $109,099 | $33,553 (30.8%) | $19,496 | $12,109 | $43,941 | 42 Dry |
| amazon:10541906 Account Manager, WW Returns | Milan | €32,100 | $36,711 | $11,908 (32.4%) | $20,898 | $14,327 | −$10,422 | 0 Rind |
| amazon:10553334 Senior Solutions Architect | Warsaw | zł301,000 | $79,648 | $31,217 (39.2%) | $14,871 | $11,210 | $22,350 | 24 Dry |
| amazon:10552176 Teamleiter:in Servicetechnik | Vienna | €44,600 | $51,007 | $14,667 (28.8%) | $15,467 | $13,628 | $7,245 | 9 Dry |
| amazon:10533714 Sr. Supply Chain Manager | Seattle | $174,000 | $174,000 | $46,219 (26.6%) | $29,449 | $18,783 | $79,549 | 63 Ripe |
| meta:1014133444993510 Finance Manager, Infrastructure | Menlo Park | $229,000 | $229,000 | $78,376 (34.2%) | $38,000 | $17,904 | $94,720 | 69 Ripe |
| meta:1395718268613427 Research Engineer, AI (University Grad) | Montreal | CA$100,000 | $71,167 | $21,411 (30.1%) | $14,866 | $11,070 | $23,820 | 26 Dry |
| meta:2002869967264694 Creative Strategist, CEE | Warsaw | zł254,500 | $67,343 | $25,501 (37.9%) | $14,871 | $11,210 | $15,761 | 18 Dry |
| microsoft:1970393557002211 Data Security Solutions Engineer | Copenhagen | kr1,023,350 | $156,557 | $63,639 (40.6%) | $24,438 | $16,465 | $52,015 | 48 Ripe |
| netflix:790313310824 Principal Counsel, Film | Los Angeles | $452,500 | $452,500 | $177,913 (39.3%) | $30,598 | $17,824 | $226,165 | 94 Juicy |

Couples change only rent (2 bedrooms), living (×1.7241) and the tax basis (joint in the US; individual in Canada,
Italy, Austria and Denmark; single in Poland). **Tax spot check (Seattle, single), independent of `taxFor`:** 2026
federal, $174,000 − $16,100 standard deduction = $157,900 taxable: $1,240 + $4,560 + $12,166 + $12,528 = $30,494,
exact. Payroll: Social Security 6.2% + Medicare 1.45% = $13,311; WA Cares 0.58% ($1,009) and WA paid leave
(≈0.81%, $1,405) make $15,725, exact. **No arithmetic problem;** the input problems are DQ-33 (Amazon places scored
on another row) and DQ-42 (Meta's Italy range in Madrid and Paris).

### 5. Vetting
`node scripts/vet-salaries.js data/beta/snapshots/*.json data/snapshots/anduril.json --no-write-flags --no-fixtures`
(exit 0, nothing written; the CLI scans stored salaries, DQ-43) and the same `scanCompany` on the served jobs
(`vetserved.mjs`, 10-flag samples seed 20261113):

| Company | Flagged (CLI / served) | Critical | Blocking | Main flags | Sample of 10: false alarms |
|---|---:|---:|---:|---|---|
| Amazon | 1,089 / 1,089 | 0 | 0 | non_year_interval 1,055, interval_corrected 33, structured_text_disagree 19, currency_country_mismatch 1 | 0 false; 10 informational (hourly rows, read right). Of the rest: interval_corrected right; the 19 disagreements are the text's "starting pay … up to $32/hour" against the table's $32–$36 (the table is right); the 1 currency flag is real (DQ-35) |
| Meta | 25 / 25 | 0 | 0 | non_year_interval 25 | 0 false; 10 informational (monthly intern pay) |
| Apple | 145 / 145 | 0 | 0 | non_year_interval 145 | 0 false (was 5: DQ-32 fixed); 10 informational |
| Google | 20 / 16 | 0 | 0 | multi_currency 16 (served) | 0 false in the served sample; the CLI's 4 missed_salary are false (DQ-43) |
| NVIDIA | 44 / 44 | 0 | 0 | non_year_interval 44, ratio_over_3 21 | 3 of 10 ratio_over_3 on the posted intern ranges ("20 USD - 71 USD", "30 USD - 94 USD"): informational, under the 4× bound |
| Microsoft | 95 / 82 | 0 | 0 | non_year_interval 79, quarantined 2 (served) | 0 false in the served sample; the CLI's 12 missed_salary are false (DQ-43); the 2 quarantines are the DQ-6 residue |
| Netflix | 8 / 6 | 1 | 0 | non_year_interval 4, quarantined 2 | 0 false; the critical one is the L7 $737,000–$1,430,000 range (above $1.2M, quarantined by rule) |
| Anduril | 203 / 203 | 3 | 0 | non_year_interval 196, ratio_over_3 5, quarantined 5 | 0 false; as in pass 2 |

### 6. Duplicates and freshness
- **The same requisition listed twice:** 0 on every big-tech board (Amazon `id_icims`, Apple requisitions,
  Eightfold JR numbers). Identical postings with distinct ids: DQ-39.
- **Older than a year and still listed** (open postings; the card says "Listed N years ago"): NVIDIA 168 (6.3%),
  Anduril 140 (5.6%), Meta 58 (5.1%, oldest 2023-06-01: meta:816501496761265 "Product Management, Director"),
  Netflix 20 (4.4%), Apple 171 (3.5%), Google 37 (1.1%), Microsoft 0, Amazon 0 (the cap keeps the newest: its
  oldest posting here is 2026-09-09, so /beta/ never shows an Amazon posting older than a month).
- **"New" badge against the history:** the badge is `firstSeenAt` later than the viewer's last visit to that
  company. Amazon's and Meta's ledgers have 1 run each (2026-10-11 15:04 and 15:17), so no posting can be "New"
  yet and no returning visitor exists; the risk is the uncapped crawl (DQ-38). The other boards' ledgers have
  6 runs; first seen after the first run: Apple 8, Microsoft 9, NVIDIA 3, Netflix 1, Google 0 (weekend), all new
  ids on the board. The "new" freshness tag (posted in the last 7 days) is a separate label: Amazon 1,217 (24.3%,
  the cap keeps the newest), Meta 104.

### 7. Counts (here vs the crawl log vs DATA_SOURCES §7)
Crawl log: `snapshot.yml` run 38143991379 (workflow_dispatch, 13:38 to 16:28 UTC), jobs 114499068685 (amazon),
114499068614 (meta), 114499068650 (apple), 114499068697 (google), 114499068690 (nvidia), 114499068640
(microsoft) and 114499068671 (netflix), read with the GitHub connector's `get_job_logs`.

| Company | Snapshot file (postings / with pay, stored) | Served (norm-9) | Crawl log | §7 today |
|---|---|---|---|---|
| Amazon | 5,000 / 5,000 | 5,000 / 5,000 | 22,352 listed (14,092 with salary), capped to 5,000; 38.5 MB, 425 s, 302 requests, 301 list pages | — (TBD) |
| Meta | 1,139 / 903 | 1,139 / 903 | 1,139 (903), 10.5 MB, 1,220 s, 1,141 requests, 520 MB | — (TBD) |
| Apple | 4,874 / 2,818 | 4,874 / 2,818 | 4,874 (2,818), 29.9 MB, 5,415 s, 4,705 requests, 4,397 details; "6100 listings are 4874 requisitions" | 4,875 / 2,818 |
| Google | 3,415 / 2,217 | 3,415 / 2,221 | 3,415 (2,217), 23.7 MB, 3,434 s, 3,425 requests | 3,417 / 2,217 |
| Microsoft | 2,285 / 1,488 | 2,285 / 1,497 | 2,285 (1,488), 30.0 MB, 2,540 s, 2,515 requests; 1 detail 404 | 2,279 / 1,490 |
| NVIDIA | 2,662 / 1,395 | 2,662 / 1,395 | 2,662 (1,395), 18.4 MB, 2,938 s, 2,930 requests; "search listed 2662 of 2664"; 1 detail 404 | 2,663 / 1,396 |
| Netflix | 457 / 290 | 457 / 288 (2 quarantined) | 457 (290), 4.7 MB, 505 s, 504 requests | 457 / 290 |

- Snapshot files and crawl logs agree exactly. Served counts differ only by norm-9's re-derivation (lei, VT-1,
  VT-3).
- §7 had TBDs for Amazon and Meta ("counts after the first crawl") and the page note "of 22,415 posted" (probe run
  7); the page now says 22,352 (`jobsCapped.total`). Patch:
  [`patches/data-check-beta-3-data-sources.diff`](patches/data-check-beta-3-data-sources.diff) moves the table to
  run 38143991379, fills Amazon and Meta, and keeps the previous run's numbers in the note.

## 2. Inputs and sources
- **Docs read:** docs/DATA_SOURCES.md §7 (7a to 7h); docs/CONTRACT.md; docs/LIVABILITY.md §1; docs/DATA_FRESHNESS.md
  (FX and history); docs/process/vetting.md, PLAYBOOK.md, TEMPLATE.md; data-check-beta-2.md, vetting-beta.md,
  fix4-data.md, amazon-meta-data.md (probe run 7: Amazon 22,415 with 14,123 paid, Meta 1,143 with 906).
- **Code read:** `server/sources/amazon.js` (`amazonPayTable`, `amazonPlace`, `amazonSalary`, `mapAmazonJob`),
  `server/sources/meta.js` (`metaPayRanges`, `mapMetaJob`), `server/normalize.js` (`deriveSalary`, `withPayPlaces`),
  `server/juice.js` (`attachJuice`), `server/keywords.js` (`jobSeniority`, `seniorityOf`, `ladderRung`),
  `server/vet.js` (`statOutliers`), `server/history.js` (`updateLedger`, `annotate`), `scripts/snapshot.js`
  (`recordPublished`, `fitSnapshot`), `scripts/build-static.js` (`readSnapshot`, `ctx.enrich`), `public/app.js`
  (`payPill`, `payRanges`, `pickedRange`, `payLabels`, `cappedNote`, `isNewSince`).
- **Data:** `data/beta/snapshots/*.json`, `data/snapshots/anduril.json`; the ledgers `beta/history/*.json`,
  `history/anduril.json` and `observations/2026-10.jsonl` from `origin/data-archive` (9409913) via `git show`.
- **Crawl logs:** GitHub connector (`actions_list`, `get_job_logs`).
- **Scripts:** data-check-beta-2's tools, copied to `<scratch>/data-check-beta-3/scripts/` and pointed at wt-s3 with
  new seeds; new: `amz1`–`amz4.mjs`, `amzlv.mjs`, `meta1`–`meta2.mjs`, `loc2.mjs`, `recheck3.mjs`, `sverify.mjs`,
  `vetamz.mjs`, `show.mjs`. `vetserved.mjs` now scans the stored jobs in-process instead of reading a CLI flags file,
  so nothing is written under `data/vetting/`.

## 3. Decisions and rationale
1. **Check what the build serves** (`served.mjs`: `readSnapshot`'s steps, then `history.annotate` with the archived
   ledger and one-person `attachJuiceAll`). The snapshots are norm-8, the code norm-9.
2. **Amazon's pay share** is reported twice: 100% of the 5,000 kept (what /beta/ shows) and 63.0% of the board (the
   crawl log), because the budget keeps priced postings first. The 20-without sample is empty for Amazon.
3. **"Right" for a pay parse** is the posting's own base-pay sentence under DATA_SOURCES §7a. For Amazon it is the
   row the rule picks (primary city, else the country's first row); which row each place should use is DQ-33.
   Meta's pay is page data, so its sample is checked against the `public_compensation` text.
4. **A place's own range (DQ-33)** is the Amazon row whose city equals the place's city (state compared when both
   have one), the adapter's own matching.
5. **Severity by job seekers misled:** postings × visibility; the card, the Juice headline and the filters count more
   than the drawer. A missing figure that says so (no Juice) misleads less than a wrong one.
6. **Tests encode the behaviour a seeker needs**, not a fix: DQ-33 "Cupertino is scored on 133,600"; DQ-36 and
   DQ-37 "not Mid"/"not the default"; DQ-38 "first listed date kept". Fixtures are search.json rows and Meta page
   extracts with only the fields the adapters read, filled with the posting's own values.
7. **No test** for decisions (DQ-39 grouping; reading Meta levels from pay bands; Google "IV") or data additions
   (DQ-34), or for the CLI-only DQ-43.
8. **Seeds** differ from earlier passes (20261111 to 20261113), so the samples are fresh.

## 4. Replayable steps
```bash
S=<scratch>/data-check-beta-3; WT=<scratch>/wt-s3; mkdir -p $S/{hist/beta,hist/stable,out/served}
cp <scratch>/data-check-beta-2/scripts/*.mjs $S/scripts/   # then repoint lib.mjs (WT, D, SLUGS) and the seeds
R=refs/remotes/origin/data-archive
for s in amazon apple google meta microsoft netflix nvidia; do git -C /home/user/melon-seek show $R:beta/history/$s.json > $S/hist/beta/$s.json; done
git -C /home/user/melon-seek show $R:history/anduril.json > $S/hist/stable/anduril.json
cd $S/scripts
for s in netflix meta microsoft nvidia google apple amazon anduril; do node --max-old-space-size=4096 served.mjs $s; done   # one at a time
node overview.mjs; node loc2.mjs; node juicecov.mjs                  # counts, places, Juice coverage
node amz1.mjs; node amz2.mjs; node amz3.mjs; node amz4.mjs; node amzlv.mjs; node meta1.mjs; node meta2.mjs   # Amazon and Meta drills
for s in amazon meta apple google nvidia microsoft netflix anduril; do node sample.mjs $s; done; node sverify.mjs; node misses.mjs
node recheck3.mjs                                                    # DQ-27 .. DQ-32 and residues on the data
node levels.mjs; node compst.mjs                                     # levels, market cells, Compstimate
node juice10.mjs                                                     # 20 rows, all MATCH
(cd $WT && node scripts/vet-salaries.js data/beta/snapshots/*.json data/snapshots/anduril.json --no-write-flags --no-fixtures)
node vetserved.mjs; node vetamz.mjs; node dups.mjs
(cd $WT && node --test test/beta-data-check.test.js test/beta-data-check-2.test.js test/beta-vetting.test.js test/beta-data-check-3.test.js)
(cd $WT && git apply --check docs/process/patches/data-check-beta-3-data-sources.diff)
```
Crawl logs: GitHub connector `get_job_logs` (owner alvations, repo melon-seek), the job ids in check 7, the last
~110 lines.

## 5. Verification
- `node --test test/beta-data-check-3.test.js`: 10 tests, all `not ok … # TODO`, each for its stated reason
  (checked one by one): "Cupertino is scored on $116100"; "zones 3"; "read as USD 150828/yr"; "Mid" for SDE III;
  "Software Engineer (Technical Leadership) - Machine Learning: Mid/default"; "first seen 2026-10-12…"; country
  null for Bratislava; card range 118,200; "Juice in Madrid, Spain, Paris, France, Milan, Italy"; "quarantined: Pay
  unclear …". Their reference assertions pass.
- Earlier tests: `test/beta-data-check.test.js`, `test/beta-data-check-2.test.js` and `test/beta-vetting.test.js`:
  54 pass, 2 to-dos (VT-8), 0 fail.
- `npm test` with this file in place and the snapshot links present (load 3 to 8.5; the vetting and performance
  agents were running): 1,046 tests, 982 pass, 3 fail, 61 to-dos (10 here, the rest other agents' files), 5 min 8 s.
  The 3 failures are timing tests: PERF-1, V15 and S-6 ("median 26 ms per request"). All 3 pass when re-run alone
  (`node --test --test-name-pattern='S-6|PERF-1|V15' test/beta-security-review.test.js test/perf.test.js
  test/fix-viz.test.js`: 4 of 4), as PLAYBOOK Stage 3 expects with local data under load. None touches this file.
- Manual: the 480 sampled postings, the 10 Juice postings (20 of 20 match), the Seattle tax by the 2026 rules, the
  crawl logs against the snapshot files, the patch with `git apply --check`.
- Nothing was written to `data/vetting/` (the vetting reviewer's folder) or to the shared checkout.

## 6. Known gaps and follow-ups
- **The whole Amazon board** (about 22,400, next crawl) was not checked: re-run checks 1, 3 and 6 on it, in
  particular the Mexico and other Latin American "$" postings (DQ-35), Amazon's text-only national sentences, and
  the "New" badges (DQ-38). The cap kept only salaried, recent postings.
- **Not opened live:** the Amazon and Meta pages themselves (the sandbox cannot reach them); the snapshot rows are
  the evidence.
- **No browser check this pass:** the Amazon card and "Pay by place" line were read from `public/app.js`; a QA agent
  could screenshot amazon:10534302 and amazon:10535213.
- **Decisions for the lead:** Meta levels from its pay bands (DQ-37 note), grouping identical Amazon postings
  (DQ-39), Google "IV" at Staff pay, Microsoft ATR, NVIDIA cash compensation as on-target earnings (VT-7).
- **Suggested fix order:** DQ-33 with DQ-41 (one change in `amazonSalary`: places on each row, distinct zones,
  rows of the posting's own places); DQ-38 before the uncapped crawl; DQ-35; DQ-34 city records and `nearby`
  (Jersey City, East Palo Alto, Burlingame first); DQ-36, DQ-37, DQ-40, DQ-42 and the DQ-6 residue (a few lines
  each); DQ-43 (`--as-published`).

## 7. Change log
- 2026-10-11 21:10 Prompt read; docs and the earlier passes read; scripts copied from data-check-beta-2.
- 21:15 Ledgers fetched from data-archive; all eight boards rebuilt as served (one at a time); overview.
- 21:20 Amazon: Juice coverage, the per-location table (DQ-33, DQ-41), Meta pay by country (DQ-42).
- 21:30 Levels and market cells; the Amazon ladder (DQ-36) and Meta leadership titles (DQ-37).
- 21:35 Samples (seed 20261111/12) and the mechanical check; miss sweep; earlier findings re-checked on the data.
- 21:40 Juice by hand (20/20); vet scan (CLI and served; DQ-43, DQ-6 residue, DQ-35); duplicates (DQ-39); ledger (DQ-38).
- 21:50 Crawl logs of run 38143991379; DATA_SOURCES patch.
- 21:55 `test/beta-data-check-3.test.js` (10 to-dos); this log.
- 22:05 `npm test` (982 pass, 3 timing failures under load that pass alone, 61 to-dos).
