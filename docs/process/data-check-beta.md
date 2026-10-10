# Process log: data-check-beta

## 1. Brief
Prompt: [`docs/process/prompts/data-check-beta.md`](prompts/data-check-beta.md) (verbatim).
Goal: check, company by company, that the numbers a job seeker sees on `/beta/` are right for Apple
(6,105 postings), Google (3,417), NVIDIA (2,664), Microsoft (2,320) and Netflix (456), with Anduril
(2,491) for comparison. Data: today's first full big-tech crawl (`snapshot.yml` run 38044091555),
rebuilt from the archive into `data/beta/snapshots/`, plus the stable boards (11:42 UTC). No product
code was changed.
Files owned: this log; the prompt copy; `test/beta-data-check.test.js` (new, 26 tests, all red on
purpose); `docs/process/patches/data-check-beta-data-sources.diff`.

## Verdicts

| Company | Verdict | Why, in one line |
|---|---|---|
| Apple | **usable with caveats** | Pay parsing is right (40/40, 20/20), but 20% of the list are per-location copies of one requisition showing different pay for the same cities (DQ-2), and 271 paid postings get no Juice (DQ-4). |
| Google | **usable with caveats** | Pay parsing is right where it parses (40/40), but 189 posted ranges (5.5% of the board, all of Poland, Sweden, Romania and 100 sales roles) are dropped (DQ-5, DQ-6), and "III" is filed Senior (DQ-3). |
| NVIDIA | **not ready** | 735 postings (27.6%) have a location in the wrong country; 720 of them (27.0%: Israel, India, Germany) are filed in the US (Illinois, Indiana, Delaware), so the country filter, map and Compstimate are wrong for them (DQ-1). Pay itself is right (40/40). |
| Microsoft | **not ready** | Same location bug for 365 postings (15.7%; 318 filed in the US: India, Israel, Germany, Indonesia, Spain, Costa Rica) (DQ-1); the IC level in the pay sentence is ignored for 522 postings (DQ-3). Pay itself is right (40/40). |
| Netflix | **usable with caveats** | Pay is right (40/40), but 30% of titles state a Netflix level (L4-L7) that becomes "Mid", so Netflix's Mid median ($473K) is above its Senior ($315K) (DQ-3); Los Gatos HQ has no Juice city (DQ-4). |
| Anduril (comparison) | **trustworthy** | 94.1% with pay, 40/40 and 20/20 right, 3 critical flags, all quarantined. It has the same Juice city gaps (Ashville OH, Waltham, Broomfield). |

## Findings, ordered by how many job seekers they mislead

Severity: **High** = a wrong fact on many postings in a main view; **Medium** = wrong or missing
figures on a meaningful share, or a wrong page in a plausible failure; **Low** = few postings, or a
label. "Known (P-n)" items from the persona review are not re-filed (see the end of this section).

| ID | Sev. | Company | Postings affected | Owner (file, function) | Test |
|---|---|---|---:|---|---|
| DQ-1 | High | NVIDIA, Microsoft | 1,100 with a wrong-country location (NVIDIA 735 = 27.6%, Microsoft 365 = 15.7%); 1,038 of them filed in the US | `server/geo.js` `regionInfo`/`resolvePlace`; `server/sources/eightfold.js` `mapEightfoldJob` | 4 |
| DQ-2 | High | Apple | 1,223 extra copies (20% of Apple); 1,092 postings in 393 requisitions show 2+ pay ranges for one city | `server/sources/apple.js` `mapAppleJob`/`fetchApple`; `server/normalize.js` `normalizeJobs` | 1 |
| DQ-3 | Med-High | Netflix, Microsoft, NVIDIA, Google | 1,010 "Mid" defaults whose title or pay text states a level, + 236 Google "III" filed Senior | `server/keywords.js` `seniorityOf` (and `normalizeJob`, which reads the title only) | 5 |
| DQ-4 | Medium | all | 670 paid big-tech postings with no Juice because their city has no record | `data/cities.json` (`nearby`, `aliases`); `server/geo.js` canonical name for "San Francisco Bay Area" | 1 |
| DQ-5 | Medium | Google | 100 (sales roles: "+ 42.86%", "+ 100%", "+ 150% bonus target") | `server/salary.js` `PLUS_EXTRAS_AFTER_RE` | 1 |
| DQ-6 | Medium | Google | 85 (every range in zł 63, kr 12, kr. 6, lei 4) | `server/salary.js` `SYMS`/`SYM_CUR`/`TOKEN_RE` | 1 |
| DQ-7 | Medium | all, on a failed list load | every viewer whose list request fails (Apple's list is 2.54 MB) | `public/api.js` `staticJobs` (steps 3-4); `scripts/build-static.js` `stableCompany`/`writeCompany` | 2 |
| DQ-8 | Low-Med | NVIDIA, Microsoft | 1,009 multi-level postings (NVIDIA 840 = 60% of its paid, Microsoft 169) | `server/salary.js` `parseSalary` (level tiers), `toJobSalary`; drawer `public/app.js` `payLabels` | 1 |
| DQ-9 | Low | Apple | 124 retail postings with a store pinned at the US centroid; ~49 corporate roles marked Part-time; 19 double-encoded links | `server/sources/apple.js` `locationName`, `mapAppleJob` | 2 |
| DQ-10 | Low | Apple, Netflix | 42 (Apple 24, Netflix 18) with a phantom location "Republic of" | `server/geo.js` `splitLocations` (or the adapters' country names) | 1 |
| DQ-11 | Low | Apple, Netflix, Google | 61 talent pools listed as openings; 579 postings older than a year | adapters / `server/normalize.js` (no field yet) | none |
| DQ-12 | Low | NVIDIA | 60 self-tagged "#LI-Hybrid" postings flagged remote | `server/sources/eightfold.js` `mapEightfoldJob` (`workLocationOption`) | none |
| DQ-13 | Low | Microsoft | 31 SF Bay Area / NYC-only postings show the lower national range (median 18% below) | `server/salary.js` `parseSalary` (`NATIONAL_RE`), `server/normalize.js` `deriveSalary` | 1 |
| DQ-14 | Low | Netflix | 9 (5 union floors read as pay, 3 Canada-only "$" read as USD, 1 real $1.43M range dropped) | `server/salary.js` `evaluate`, `MAX_ANNUAL` | none |
| DQ-15 | Low | Google | 4 of 17 multi-currency postings | `server/salary.js` `parseSalary` (candidate score, tier span) | 2 |
| DQ-16 | Low | Google | 4 titles show "&amp;" | `server/sources/google.js` `mapGoogleJob` | 1 |
| DQ-17 | Medium (process) | Google, Microsoft | 3,049 false vet flags (66% of all 4,643 flagged lines); ~185 real misses unseen | `scripts/vet-salaries.js` `isBoundary`/`clauseAround`/`PAY_WORDS_RE`/`moneyTokens` | 3 |

### DQ-1 (High) Eightfold "City, Region, CC" locations are filed in US states
- **Companies:** NVIDIA, Microsoft (both Eightfold PCSX `standardizedLocations`). Netflix, Google, Apple are not affected.
- **Example:** nvidia:893394752123 "Senior Performance Engineer - LLM Inference Frameworks",
  https://jobs.nvidia.com/careers/job/893394752123. Raw: `Yokne'am Illit, North District, IL`,
  `Ra'anana, Center District, IL`, `Tel Aviv-Yafo, Tel Aviv District, IL`.
  - **Expected:** four locations in Israel.
  - **Actual:** "Yokne'am Illit, IL · United States", pinned at Illinois (40.35, -88.99). The drawer's Compstimate says "≈ $239K … Senior · Yokne'am Illit" from US pay.
- **More examples:** microsoft:1970393557002143 (Bengaluru, Hyderabad) is placed in Indiana. microsoft:1970393557002475 (pay "across Germany is € 81,500 - € 139,200") is located at "Delaware, US".
- **The bad mappings, by count (location entries):**
  - Israel (`IL`) to Illinois: NVIDIA 313 + 234 + 103 + 28 + 13, Microsoft 16 + 13 (bare `IL`) + 3 + 3 + 2 + 2.
  - India (`IN`) to Indiana: NVIDIA 196 + 65 + 38 + 16 + 13 + 13, Microsoft 119 + 106 + 51 + 20 + 16 + 15 + 2. "Chennai, TN, IN" goes to Tennessee.
  - Germany (`DE`) to Delaware: NVIDIA 43 + 33 + 5 + 4, Microsoft 18 + 3 + 3 + 2.
  - Other countries: `Jakarta, ID` to Idaho (16); `Barcelona, CT` to Connecticut (15); `Madrid, MD` to Maryland (4); `Schiphol, NH, NL` to New Hampshire (8); `Bogota, CO` to Colorado; `Zaragoza, AR` to Arkansas.
  - Bare `CA` (Canada) to California (6). `San José, San José Province, CR` becomes San Jose, California, and it gets San Jose Juice.
  - Unresolved (no country): `ES` 34, `NO`, `KW`, `BE`, `LV`, `LT`, `PT`, `SP, BR`, `Brasília, DF, BR`, Saudi provinces.
- **Effect:**
  - The "United States" country/location filter holds 2,123 NVIDIA postings, but only 1,403 are in the US. For Microsoft it holds 1,518, but 1,185 are.
  - The map shows no Israel or India pin for NVIDIA at all: "999+ Santa Clara, CA + 46 nearby" swallows them.
  - "NVIDIA posts pay for 64% of US postings" reads as 97.0% once corrected (1,361/1,403). Microsoft reads 99.6% (1,180/1,185).
  - Mixed postings (Santa Clara + Yokne'am) have their USD pay applied to the false-US city (P-6's `payLocations` treats it as US).
- **Cause:** `regionInfo()` resolves any 2-letter uppercase token to a US state before a country code. In a 3-part "City, Region, CC" string the last token is always the ISO country. `pickCity()` rejects the known city (Bengaluru, Jakarta) because the context says "Indiana", then `fromRegion` falls back to the state centroid.
- **Related:** known P-9 (Victoria BC as Australia, same file, fixed in the pay-data lane) has a different cause. This one needs its own rule.
- **Test:** `DQ-1 …` (4 tests).

### DQ-2 (High) Apple lists one requisition once per location, each copy with every location
- **Company:** Apple. Example: requisition 200680778 "Specialist, Emergency Services - Sensing & Connectivity".
  - https://jobs.apple.com/en-us/details/200680778-5763/specialist-emergency-services-sensing-connectivity (Alturas copy, $119,800-$222,000)
  - https://jobs.apple.com/en-us/details/200680778-0836/specialist-emergency-services-sensing-connectivity (Cupertino copy, $150,400-$277,600)
  - The requisition has 8 copies in all. Each copy lists all 8 California cities, in its own order.
- **Expected:** one pay per city per requisition. Either each copy keeps only its own location, or the copies merge into one posting with per-location `salary.ranges`.
- **Actual:** 8 cards. A seeker filtering Cupertino sees $119,800-$222,000 (Alturas pay) and $150,400-$277,600 for the same role. The Alturas copy's Juice is "52 · Ripe, $59K/yr left in San Jose" (best city, P-7), built from Alturas pay.
- **Share:**
  - 827 requisitions appear 2-10 times: 2,050 postings, 1,223 extra copies, 20.0% of Apple's 6,105. Group sizes: 558×2, 190×3, 52×4, 19×5 … 2×10.
  - In 393 requisitions (1,092 postings) one city shows 2+ pay ranges (max 1.25× apart).
  - Map/location counts: 9,559 posting-city pins against 6,260 distinct requisition-city pairs (1.53×).
  - Market comps and Compstimate weight these roles 2-10×: `used` 3,724 Apple postings.
- **Cause:** `fetchApple` keys rows by `id` (`<req>-<location id>`). `mapAppleJob` merges `selectedLocation` + `row.locations` + `detail.locations`, but `applePayFooter` returns the selected location's footer only. `reqId` is `jobNumber`, which includes the suffix, so nothing dedupes.
- **Comparison:** Anduril (Greenhouse) has 454 internal_job_ids posted 2+ times (1,448 postings). 100 of these groups have the same title, and 293 show one city with two pay ranges. Same pattern, smaller; noted, not filed (stable board).
- **Test:** `DQ-2 …`.

### DQ-3 (Medium-High) The boards' own levels are ignored
- **What each board's levels become** (medians are USD base, salaried):
  - **Netflix** (title): "(L5)", "Engineer 5", "4/5", "L6".
    - L4: 31 postings, all Mid, $332K.
    - L5: 84; Mid 78, Senior 6; $486K.
    - L6: 31; Mid 27, Staff+ 4; $700K.
    - 138 of Netflix's 246 "Mid" defaults (56%) state a level. Netflix Mid median $473K (n165) > Senior $315K (n23): inversion. Compare companies shows "Netflix · Mid $601K" next to "Apple · Mid $214K" ("Same role elsewhere", netflix:790298020581, https://explore.jobs.netflix.net/careers/job/790298020581).
  - **Microsoft** (pay sentence "Software Engineering IC5 - The typical base pay range…", 64% of postings).
    - IC2 → Mid ($127K). IC3 (166) → Mid 156 ($152K).
    - IC4 (513) → Senior 305, Mid 153, Manager 51 ($177K).
    - IC5 (406) → Staff+ 216, **Mid 74**, Senior 65, Director+ 33 ($209K).
    - IC6 (68) → Staff+ 42, Mid 13 ($231K). M5 (44), M6 (47) → mostly Director+/Staff+.
    - 291 "Mid" defaults name IC4+/M5+; with titles "Software Engineer II", "Site Reliability Engineer 2" (117), 522 Microsoft defaults (22.5% of the board) state a level.
    - Example: microsoft:1970393556913038 "Member of Technical Staff, Microsoft Robotics", IC6 $165,600-$296,400, filed Mid. https://apply.careers.microsoft.com/careers/job/1970393556913038
  - **NVIDIA** (pay text "for Level 4, and … for Level 5").
    - 1/2 → Mid ($145K). 2/3 → Mid 51 ($167K). 3/4 → Senior 193, Mid 48 ($220K).
    - 4/5 → Senior 380, Mid 38 ($270K). 5/6 → Senior 64, Mid 12 ($328K).
    - 44 "PhD New College Grad" / student titles are Mid. Example: nvidia:893392513131, https://jobs.nvidia.com/careers/job/893392513131.
  - **Google** (title roman numerals).
    - I → Entry 27 ($163K). II → Mid 107 ($168K). **III → Senior 234** ($179K, against Senior titles $213K; Google's III is L4, one step below Senior).
    - **IV → Mid 14** ($254K = Staff pay; google:125981803457454790, https://www.google.com/about/careers/applications/jobs/results/125981803457454790-forward-deployed-engineer-iv).
    - "Associate … Counsel" → Entry (8; google:100183073076716230 $217K-$314K) makes the Compare-companies cell google·legal **Entry $266K (n5) > Mid $166K (n13)**.
  - **Apple:** no board level is exposed (ICT levels are not in titles); 75.2% default to Mid, and only 7 titles (students) say otherwise.
- **"Mid" default share:** Apple 75.2%, Netflix 53.9%, Google 47.5%, Microsoft 42.1%, Anduril 41.3%, NVIDIA 23.0%.
- **Effect:** known P-3 relabels the default "Level not stated", which is wrong for these 1,010 titles: they state a level. Compstimate's level weighting and Compare companies' level cells misplace them.
- **Expected:** the board's level is read (Netflix L-numbers and "Engineer N", "II/IV", Microsoft IC/M from the pay sentence, NVIDIA "New College Grad", "Student") and keeps its order.
- **Test:** `DQ-3 …` (5 tests).
- **Other inversions (market cells, n ≥ 3):** nvidia·sales Mid $328K (n5) > Senior $253K (n4); google·policy Mid $172K (n7) > Senior $167K (n7); microsoft·ml Intern $122K (n10) > Mid $110K (n26). The Microsoft one is known P-10 and P-11: the Mid cell is mostly hourly "AI … Solution Area Specialist" sales roles. Anduril's (facilities, solutions) are small cells.

### DQ-4 (Medium) Big-tech hubs have no Juice city
- **Paid postings with no Juice at all, because a named city in the pay's country has no record:** Apple 271, Google 237, Microsoft 114, Netflix 31, NVIDIA 17 (Anduril 376 for comparison).
- **Location entries in the pay country with no city record:**
  - Apple: "San Francisco Bay Area, California" 328 (canonicalised to "San Francisco Bay, CA"), Beaverton OR 294, Culver City 144, Waltham 130, Orlando 28, Cary NC 26.
  - Netflix: Los Gatos 97 (its HQ; netflix:790298020581 has no Juice section).
  - Google: San Bruno 82, Thornton CO 34, Madison WI 34, Addison TX 29, Goleta 27, Ann Arbor 26, Hamburg 20, Frankfurt 18.
  - Microsoft: Hillsboro OR 62, San Antonio 31, Charlotte 30, Fargo 19, Irving 17, Springfield VA 13.
  - NVIDIA: Westford MA 58, Hillsboro OR 54.
  - Country- or state-only locations (Microsoft "United States" 271, NVIDIA "California, US" 235) cannot get a city by design.
- **Juice coverage of paid postings:** Apple 93.0%, NVIDIA 94.0%, Google 86.3%, Microsoft 73.2%, Netflix 54.1% (most of the rest are Remote (US)).
- **Expected:** suburbs of covered metros match through `nearby`: Los Gatos and San Bruno to San Jose/SF, Beaverton and Hillsboro to Portland, Culver City to LA, Waltham to Boston. "San Francisco Bay Area" should not lose "Area".
- **Test:** `DQ-4 …`.

### DQ-5 (Medium) Google: a large or fractional bonus target drops the base range
- **Example:** google:100868290011636422, https://www.google.com/about/careers/applications/jobs/results/100868290011636422-ai-customer-engineer.
  - Text: "US: $152000 - $221000 (USD) + 42.86% bonus target + equity + benefits" (USD, yearly, base + bonus target + equity).
  - **Expected:** $152,000-$221,000 base. **Actual:** "Salary not listed", and Compstimate fills in.
- **Also:** google:102079530918650566 "+ 150% bonus target"; google:102966907669226182 "Germany: €120000 - €123000 (EUR) + 100% bonus target".
- **Share:** 100 postings, 2.9% of Google: US 75, DE 10, CA 7, FR 4, IT/NL/ES/IE 1 each. Bonus-% values: 42.86 (51), 150 (24), 100 (21), 66.67 (8), 53.85 (3).
- **Cause:** `PLUS_EXTRAS_AFTER_RE` accepts `\d{1,2}(?:\.\d)?%` only. The line has no pay word, and its heading is longer than 80 characters, so `NEG_AFTER_RE` ("bonus") rejects it.
- **Related:** not P-1. These are base ranges with a separate bonus, not on-target earnings.
- **Test:** `DQ-5 …`.

### DQ-6 (Medium) Google: "zł", "kr", "kr." and "lei" ranges are not read
- **Example:** google:143569415361700550 (Kraków), https://www.google.com/about/careers/applications/jobs/results/143569415361700550-software-engineer-iii.
  - Text: "Poland: zł280000 - zł287000 (PLN) + 15% bonus target + equity + benefits".
  - **Expected:** PLN 280,000-287,000. **Actual:** null.
- **Also:** google:101989064948753094 "Sweden: kr660000 - kr675000 (SEK)"; google:119282996652974790 "Denmark: kr.600000 - kr.615000 (DKK)".
- **Share:** 85 postings: every Google range written in zł (63), kr (12), kr. (6) or lei (4). No posting in Poland, Sweden, Denmark or Romania shows its local pay: the 6 Polish, 2 Danish and 3 Swedish postings that have pay show a euro line from another country they also list (Ireland, Finland, France, Germany). RON also has no FX rate in `FX_PER_USD`.
- **French Canadian:** "Le salaire de base canadien pour ce poste à temps plein est de 99,000 CAD" is missed in 4 more postings ("salaire" is not a pay word).
- **Together with DQ-5:** Google drops 189 posted ranges, 5.5% of the board and 8.5% of the Google postings that publish a range.
- **Test:** `DQ-6 …`.

### DQ-7 (Medium) A failed list load shows generated postings under the real company's name
- **Beta, Apple:** with `api/jobs/apple.json` failing (one request, 2.54 MB), the page shows **80 generated "Apple" roles**. Examples: "Principal Software Engineer, Growth $250K–320K", "Top-paid role at Apple", and "Same role elsewhere" bars against real companies.
  - The banner says "Demo data — the Apple board couldn't be reached". The badge says "Live fetch skipped: Apple is served from the bundled snapshot only".
  - This contradicts CONTRACT v3: a beta company is "never demo data". Cards carry no Demo tag; only the drawer does.
  - Cause: no `api/demo/<beta slug>.json` exists, so `staticJobs` falls through to step 4, the in-browser `demoJobs`.
- **Stable, Scale AI:** `api/demo/scaleai.json` (79 postings) is used, with the note "Synthetic demo data (no real snapshot was bundled for this company)". That is false, because a real one was bundled; it just failed to load.
- **Why every build ships 79 `demo-scaleai-*.json` files:**
  - `scripts/build-static.js` `stableCompany()` always builds a demo payload. When the real list exists, `writeCompany()` writes it as a second fallback list, `api/demo/<slug>.json`, with one description file per demo posting, `api/desc/<slug>/demo-<slug>-NNN.json`.
  - `demoJobs` is seeded by slug and gives Scale AI 79. It is not only Scale AI: all 8 stable companies ship 773 demo files (anduril 120, anthropic 111, cohere 97, openai 120, palantir 74, scaleai 79, shieldai 81, xai 91).
  - The beta copy re-ships the same 773; beta companies ship none.
  - `public/api.js` `bundled()` returns null on *any* error (404, 5xx, network drop, truncated JSON), and the next path tried is `api/demo/<slug>.json`.
- **Can a user see a demo posting for a real company?** Yes, whenever the real list request fails: stable companies from the shipped demo file, beta companies from the in-browser generator. Screenshots: `<scratch>/data-check-beta/shots/beta-apple-list-fails.png`, `stable-scaleai-list-fails.png`.
- **Expected:**
  - beta: no demo at all; show the error and offer a retry;
  - stable: an accurate message ("the saved list didn't load"), and demo postings never presented as the company's.
- **Test:** `DQ-7 …` (2 tests; they build a tiny site in about 5 s).

### DQ-8 (Low-Medium) Per-level ranges are spanned and the levels are never named
- **Example:** nvidia:893394206119 "Senior HPC Storage Engineer", https://jobs.nvidia.com/careers/job/893394206119.
  - Text: "The base salary range is 184,000 USD - 287,500 USD for Level 4, and 224,000 USD - 356,500 USD for Level 5."
  - Drawer: "$184K–356K USD · per year · Multiple pay zones · + equity mentioned"; level "Senior". Nothing says which part is Level 4.
  - The level text survives only in `salary.text`, which the drawer shows only for non-yearly pay (`annualNote`).
- **Share:**
  - NVIDIA 840 two-level postings (60% of its paid), by pair: 1/2 19, 2/3 58, 3/4 272, 4/5 439, 5/6 85.
  - Microsoft 169 (IC3/IC4 46, IC4/IC5 61, IC5/IC6 20, M5/M6 3, ATR-x/y 39).
  - Compare and Compstimate use the span's midpoint.
- **Expected:** `salary.ranges` with level labels, so the drawer can show them and comparisons can pick the posting's level.
- **Test:** `DQ-8 …`.

### DQ-9 (Low) Apple adapter details
- **Store names become places.** 124 of 184 US retail postings carry a store as a second location ("Bellevue Square", "Maine Mall", "Barton Creek", "Carnegie Library"). Each is pinned at the US centroid (39.83, -98.58) and added to the location filter.
  - Example: apple:200679746-2593 "US-Technical Expert", https://jobs.apple.com/en-us/details/200679746-2593/us-technical-expert.
- **"Part-time" on full-time roles.** About 49 corporate postings are marked Part-time from `standardWeeklyHours < 35`, among them "Staff ML Engineer - Ads ML Infrastructure" and "Sr. Software Engineering Manager, UI Rendering" ($267,800-$401,700). This was not verified against the raw field (not stored); 68 Apple part-time postings with pay are annualized at 2,080 h.
- **Double-encoded links.** 19 links have a double-encoded slug (`%25EC…`). Example: apple:200463726-3631, https://jobs.apple.com/en-us/details/200463726-3631/apple-diversity-program-%25EC%259E%25A5%25EC%2595%25A0%25EC%259D%25B8-%25EC%25B1%2584%25EC%259A%25A9. Apple may still resolve it by id; unverified, because the sandbox can't reach jobs.apple.com.
- **Tests:** `DQ-9 …` (store, link).

### DQ-10 (Low) "Korea, Republic of" adds a phantom location
- `locationName` writes "Seoul, Korea, Republic of". `splitLocations` then cuts it into "Seoul, South Korea" and "Republic of" (no country, no pin).
- **Share:** Apple 24, Netflix 18. Example: apple:200463726-3631.
- **Test:** `DQ-10 …`.

### DQ-11 (Low, no test) Talent pools and year-old postings are listed as openings
- **Talent pools.** 49 Apple postings say "This posting is not for a specific job opening…" (all US, no pay), for example apple:200353151-0836 "Speech Scientist / Engineer (Interspeech 2022)". Netflix has 9 "Expression of Interest", and Google has 3 "Open Career Opportunities, …" from 2019-2020 (google:96818331136205510).
  - They count as postings and get a Compstimate.
- **Year-old postings.** Postings older than a year: Apple 214 (3.5%, oldest 2021-04-07 apple:200237136-3435), NVIDIA 168 (6.3%), Google 37, Netflix 20, Microsoft 0, Anduril 140. The "Open 180+ days" note already shows on them. These are real, open postings, so I filed no bug.
- **Why no test:** marking talent pools needs a field (for example `kind: 'pool'`) that the contract doesn't have. That is a product decision first.

### DQ-12 (Low, no test) NVIDIA "remote" includes hybrid roles
- `remote` is true for 585 NVIDIA postings (22%). 60 of them carry NVIDIA's own "#LI-Hybrid" tag, for example nvidia:893379490239, https://jobs.nvidia.com/careers/job/893379490239, and 276 other "#LI-Hybrid" postings are on-site. Hybrid is not modelled anywhere.
- **Cause:** probably `/remote/.test(workLocationOption)` matching a value like "remote_local". The raw value is not stored in the snapshot, so a probe run with `keepRaw` is needed before writing a test.

### DQ-13 (Low) Microsoft SF Bay Area / NYC-only postings show the national range
- **Example:** microsoft:1970393556933263 "Senior Silicon Engineer", Santa Clara, CA, https://apply.careers.microsoft.com/careers/job/1970393556933263.
  - Text: "…across the U.S. is USD $119,800 - $234,700 per year. … within the San Francisco Bay area and New York City metropolitan area … USD $160,200 - $261,000 per year."
  - **Expected:** $160,200-$261,000 for a Santa Clara-only posting. **Actual:** $119,800-$234,700.
- **Share:** 31 postings whose only US locations are in those metros; the posted local midpoint is a median 18% higher (7%-26%).
- **Rule:** DATA_SOURCES §7a documents "the U.S. one is used", so the test encodes a **proposed** rule. Drop it if the lead keeps §7a.
- **Test:** `DQ-13 …`.

### DQ-14 (Low, no test) Netflix edge cases
- **Union floors read as pay.** 5 postings: "pay … governed by the … collective bargaining agreement and thus will be no less than $62.74 an hour" is parsed as a single figure ($130,499/yr). Example: netflix:790315702145, https://explore.jobs.netflix.net/careers/job/790315702145.
- **Canada-only "$" read as USD.** 3 postings with a bare "$" range are read as USD: "The range for this role is $135,000.00 -185,000.00" (Toronto; netflix:790318616118), and two in Vancouver. Netflix writes "CAD" on its other 19 Canadian ranges. The scan flags these as currency_country_mismatch.
- **A real range dropped.** netflix:790312403200 "Software Engineer (L7)" posts "$737,000.00 - $1,430,000.00". Netflix pays cash only, so the figure is plausible, but it exceeds `MAX_ANNUAL` ($1.2M) and is silently dropped.
- **Why no tests:** each one needs a policy call first: floor vs range, a bare "$" in Canada, and the cap for all-cash companies.

### DQ-15 (Low) Google postings with one pay line per country
- **4 of 17 postings with lines in 2+ currencies are wrong:**
  - google:102246871434437318 (5 US cities, London, Dublin): shows the Irish "€142000 - €145000" and ignores "US: $171000 - $247000". Juice "in Dublin". https://www.google.com/about/careers/applications/jobs/results/102246871434437318-principal-lead
  - google:106785017631253190 (Sunnyvale, Waterloo, Austin): USD $144,000-$217,000. The Canadian CAD minimum is merged into the US range ($150,000-$217,000).
  - google:142747733357142726 and google:86733690079453894: French, German and Irish EUR lines are spanned together (€53K-€71K, €53K-€86.5K). DATA_SOURCES §7a says countries are never mixed.
- **Cause:** a "(USD)"/"(CAD)" code in parentheses is not a currency suffix, and score ties keep the first line.
- **Test:** `DQ-15 …` (2 tests).

### DQ-16 (Low) Google titles keep HTML entities
- 4 titles, for example google:103168109170303686 "Senior Product Manager, Databases &amp; Analytics, Google Cloud".
- `mapGoogleJob` copies `rec[1]` without decoding it.
- **Test:** `DQ-16 …`.

### DQ-17 (Medium, process) The vetting scan disagrees with the parser on the big-tech sentences
- **"U.S." ends a clause.** `scripts/vet-salaries.js` `isBoundary` lacks salary.js's abbreviation rule, so "…for this role across the U.S. **|** is USD $142,800 - $274,800 per year." leaves the amount's clause with no pay word. Result: **1,034 Microsoft `no_pay_context`** flags, all with "across the U.S. is" in the excerpt.
- **"+ bonus + equity" after a range.** `PAY_WORDS_RE` has no pay word for Google's "US: $141000 - $205000 (USD) + 15% bonus target + equity + benefits", and the heading above it is longer than 80 characters. Result: **2,015 Google `no_pay_context`** flags, all with "+ … bonus" in the excerpt.
- **The same blind spot hides real misses.** `missed_salary` fires on 4 Google postings, not the ~185 of DQ-5 and DQ-6. The scan's `MONEY_RE` also has no "zł"/"kr" and needs the code adjacent to the number, not in parentheses.
- **Impact:** none of these flags is critical, so the beta gate passes. But 3,049 of 4,643 flagged lines (66%) are false, which buries real ones for a reviewer or `llm-vet.js` (cost).
- **Tests:** `DQ-17 …` (3 tests).

### Known items seen on beta, not re-filed
- **known (P-2):** Compstimate names a level or city its comparables lack.
  - NVIDIA's Israel posting gets "Senior · Yokne'am Illit" from US pay (the cause there is DQ-1).
  - Ladders are flat where a level has no comparables: Apple SWE Intern = Entry = Mid = $214K; Netflix SWE Intern…Senior = $473K; Netflix ML Engineer "Entry" $608K.
- **known (P-3):** "Mid" for titles with no level. See DQ-3 for the 1,010 titles that *do* state one.
- **known (P-7):** Juice uses the best city. The Apple Alturas copy is scored "in San Jose".
- **known (P-8):** fixed-term pay is annualized. Microsoft's 23 monthly intern ranges are ×12 ("USD $6,810.00 - $13,480.00 per month"), and the Google Dublin intern €47,000 gets a full-year Juice.
- **known (P-10, P-11):** microsoft·ml mixes hourly "AI … Solution Area Specialist" sales roles and interns.
- **known (P-14):** "(update due)" on the FX footnote in the drawer.

## Checks per company, with numbers

### 1. Pay parsing
Sample: seeded Fisher-Yates (mulberry32, seed 20261010 for the 40 with pay, 20261011 for the 20
without) over ids in sorted order. Each was compared with the description HTML. Script:
`<scratch>/data-check-beta/scripts/sample.mjs`; output: `<scratch>/data-check-beta/sample-<slug>.txt`.

| Company | Postings | With pay | Share | US-located share with pay | 40 with pay: right | 20 without: right | Misses in the whole board |
|---|---:|---:|---:|---:|---:|---:|---|
| Apple | 6,105 | 3,848 | 63.0% | 87.4% (3,848/4,401) | 40/40 | 20/20 | 0. The 553 US postings without pay: 504 have no pay footer (Apple posts none in TX 327, OR 75, NC 59, FL 24, NV 23…), 49 are talent pools |
| Google | 3,417 | 2,032 | 59.5% | 95.5% (1,726/1,808) | 40/40 | 18/20 (2 Polish "zł", DQ-6) | 189 dropped (DQ-5, DQ-6, French ×4); 4 wrong (DQ-15) |
| NVIDIA | 2,664 | 1,394 | 52.3% | 97.0% of true-US (1,361/1,403) | 40/40 | 20/20 (13 of the 20 "US" are Israel/India, DQ-1) | 0. 45 "cash compensation" ranges are null by rule; 3 Polish intern "annual range for our interns" missed |
| Microsoft | 2,320 | 1,482 | 63.9% | 99.6% of true-US (1,180/1,185) | 40/40 values (1 with a wrong location, DQ-1) | 20/20 | 0. 31 SF/NYC-only show the national range (DQ-13) |
| Netflix | 456 | 294 | 64.5% | 96.8% (271/280) | 40/40 | 20/20 | 1 quarantined (L4 "$71,040 - $464,000", 6.5×); 1 above cap; 4 sales "roles in this area" null by rule; DQ-14 |
| Anduril | 2,491 | 2,345 | 94.1% | 98.0% (2,336/2,383) | 40/40 | 20/20 (1 quarantined source typo "$11,200 — $149,000") | 5 quarantined |

**Pay sentences, by board** (currency, period, base or total, extras wording):
- **Apple.**
  - "The base pay range for this role is between $150,400 and $277,600, and your base pay will depend on your skills, qualifications, experience, and location." USD, yearly, base: 3,638.
  - "/hr": 107 + 44 with "most new hires start at $N"; "/yr": 38; "annualized": 21.
  - No bonus or equity in the sentence ("base pay is one part of our total compensation package").
- **Google.**
  - "US: $141000 - $205000 (USD) + 15% bonus target + equity + benefits". Base, yearly implied, bonus target and equity named after the range: 1,791 lines.
  - EUR lines for IE 133, DE 58, BE 15, NL 13, FI 12, FR 11, ES 10, AT 9, IT 5, and CAD 56.
  - The older "The US base salary range for this full-time position is $X-$Y + bonus + equity + benefits": 5.
  - DeepMind "Total Compensation Range" (1) is handled: base used.
- **NVIDIA.**
  - "The base salary range is 272,000 USD - 431,250 USD." USD, yearly, base: 477. The two-level form: 840.
  - Interns: "The hourly rate for our interns is 20 USD - 71 USD." (44).
  - "For Poland: The base salary range is N PLN - N PLN …": 23.
  - Sales "cash compensation range" (base 85% + variable 15%): null by rule, 45.
- **Microsoft.**
  - "Software Engineering IC5 - The typical base pay range for this role across the U.S. is USD $142,800 - $274,800 per year. There is a different range … San Francisco Bay area and New York City … USD $188,000 - $304,200 per year." Base, yearly: 1,107 with the city sentence.
  - "per hour": 58; interns "per month": 23.
  - Outside the US: "across Ireland is € N - € N per year", "across Czechia is Kč …", "across United Kingdom is £ …".
  - No "+ bonus + equity"; "Certain roles may be eligible for benefits and other compensation."
- **Netflix.**
  - "The range for this role is $210,000.00 - $360,000.00." USD, yearly, all cash: "consists solely of an annual salary; we do not have bonuses". 259 postings.
  - Netflix Animation Studios: "The overall market range for this role is typically $120,000 - $180,000 CAD. This reflects total compensation; we do not have stock options."
  - Sales "…for roles in this area … A portion of this compensation is variable": null by rule, 4.

**Ranges over several levels:** see DQ-8 for the counts by level pair. The drawer shows the span, the "Multiple pay zones" chip (tooltip "different ranges for different locations or levels") and the title-based level; it never shows the level names. Google has a few "[Bachelor's degree] / [Master's degree]" lines (intern postings).

**Non-US currencies with pay:**
- Google: EUR 251, CAD 2. Missing: PLN 63, SEK 12, DKK 6, RON 4.
- Microsoft: EUR 158, GBP 82, CAD 46, CZK 13, CHF 2.
- NVIDIA: PLN 23, CAD 8, EUR 2.
- Netflix: CAD 19 (+3 read as USD, DQ-14), EUR 1.
- Apple: none (Apple publishes pay only in the US).

### 2. Levels
See DQ-3 for each board's own levels mapped to Seniority, the "Mid" default share, and the inversions.
Medians by our Seniority, USD base, salaried, US-currency postings:

| Company | Intern | Entry | Mid | Senior | Staff+ | Manager | Director+ |
|---|---|---|---|---|---|---|---|
| Apple | – | $169K (2) | $214K (2,791) | $242K (636) | $271K (59) | $281K (176) | $293K (33) |
| Google | $112K (26) | $168K (29) | $173K (666) | $200K (606) | $254K (254) | $254K (165) | $313K (33) |
| NVIDIA | – | $152K (1) | $197K (242) | $239K (811) | $352K (102) | $281K (123) | $349K (39) |
| Microsoft | $122K (15) | $128K (1) | $152K (283) | $177K (363) | $209K (305) | **$147K (82)** | **$204K (74)** |
| Netflix | – | $188K (2) | **$473K (165)** | **$315K (23)** | $830K (6) | $299K (58) | $455K (9) |
| Anduril | – | $101K (33) | $150K (851) | $170K (836) | $222K (173) | $170K (134) | $256K (118) |

Bold marks an inversion. Microsoft's "Manager" includes non-people "Account Manager"-style roles; its Director+ includes IC5 "Dir Category" bands.

Compstimate ladders (Software Engineer, and two more titles per company; `scripts/compst.mjs`) show no
strict inversion. They are flat where a level has no comparables (P-2), and Netflix's ladder stays flat at $473K
from Intern to Senior because its levels are folded into Mid (DQ-3).

### 3. Locations
- **Canonical names:** mostly right ("Redmond, WA", "Tokyo, Japan"). Wrong:
  - DQ-1 (1,100 postings);
  - "San Francisco Bay Area, California" becomes "San Francisco Bay, CA" (Apple, 332 entries);
  - store names (DQ-9);
  - "Republic of" (DQ-10);
  - suffixes kept in names: "Klang Valley-MY, Malaysia" (21), "Xi'an-CN, China" (13);
  - Google "Remote" with no country (61).
- **Multi-location postings:** the list counts each posting once; the map and the location filter count it in every city (`jobLocationKeys`).
  - Share with 2+ locations: NVIDIA 38.6%, Apple 31.5%, Google 31.0%, Microsoft 29.1%, Netflix 21.7%.
  - Apple's per-location copies make it N×N: 9,559 pins against 6,260 requisition-city pairs (DQ-2).
- **Remote vs hybrid:** there is only a `remote` boolean; hybrid is not represented.
  - remote = true: Apple 29 (0.5%), Google 61 (1.8%), Microsoft 313 (13.5%), NVIDIA 585 (22.0%, with 60 self-tagged hybrid, DQ-12), Netflix 115 (25.2%, 108 remote-only).
  - Hybrid wording appears in Apple 88, Google 62, NVIDIA 427, Microsoft 179, Netflix 60 descriptions.
- **Cities with no living-cost or rent data:** see DQ-4 for the lists and counts. Juice is null for those postings (no fallback city), so it falls back to "no Juice".

### 4. Juice (10 postings by hand, single and couple)
Each was recomputed independently with the LIVABILITY.md §1 formula:
- gross = mid × FX;
- tax = `taxFor(grossLocal, city.tax, { household })` × usdPer;
- rent = the household's centre rent × 12;
- living = costIndex/100 × $19,982 × scale (1 or 1.72).

All 20 results match `attachJuice` to the dollar (`scripts/juice10.mjs`).

| Posting | City | Salary mid | Gross | Tax (rate) | Rent | Living | Net | Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| apple:200566862-3956 Product Design Engineer | Sunnyvale | $254,750 | $254,750 | $89,086 (35.0%) | $39,510 | $17,904 | $108,250 | 74 |
| google:100045041417757382 Head of Business, GCS | New York | $197,500 | $197,500 | $68,251 (34.6%) | $52,446 | $19,982 | $56,821 | 51 |
| microsoft:1970393556627435 Principal SWE, CoreAI | Redmond | $219,600 | $219,600 | $59,138 (26.9%) | $34,800 | $18,783 | $106,879 | 74 |
| apple:200578781-0157 Thermal Engineer | Austin | $214,000 | $214,000 | $54,762 (25.6%) | $23,088 | $14,127 | $122,023 | 78 |
| google:100315940037501638 Financial Analyst Intern | Dublin | €47,000 | $53,752 | $10,218 (19.0%) | $30,220 | $14,887 | −$1,573 | 0 Rind (P-8) |
| google:102152648441897670 Staff SWE, SRE | Munich | €157,500 | $180,126 | $78,379 (43.5%) | $20,761 | $14,687 | $66,299 | 56 |
| microsoft:1970393556927547 MTS Privacy Eng. | London | £127,650 | $172,065 | $64,983 (37.8%) | $34,777 | $17,244 | $55,061 | 50 |
| netflix:790301728220 TD Pre-Production (NAS) | Vancouver | CA$150,000 | $106,750 | $30,334 (28.4%) | $21,412 | $12,029 | $42,975 | 42 |
| nvidia:893379202948 Manager, DL Algorithms | Warsaw | zł523,500 | $138,523 | $56,207 (40.6%) | $14,871 | $11,210 | $56,235 | 50 |
| microsoft:1970393556941712 Senior SWE | Prague | Kč1,893,000 | $89,451 | $22,829 (25.5%) | $14,036 | $10,950 | $41,636 | 41 |

Tax spot checks against the published rules:
- **London:** income tax £43,646 with the personal allowance fully tapered; NI £4,564 (8% to £50,270, then 2%). Both exact.
- **Sunnyvale:** social $18,937 = Social Security to the cap + Medicare + 0.9% additional + CA SDI.
- **Munich:** social €18,526 = pension and unemployment capped at the 2026 limit, health and care at theirs.
- **Prague:** social 11.6%.
- **Vancouver:** CPP + CPP2 + EI CA$5,770.

The couple rows change only rent (2 bedrooms), living (×1.72) and the tax basis (joint in the US and Germany; individual in the UK and Czechia; single in Poland). No arithmetic problem was found.

### 5. Vetting (`scripts/vet-salaries.js`, gate applied, as the build does)

| Company | Flagged | Critical | Blocking | Main flags | Sample of 10: false alarms |
|---|---:|---:|---:|---|---|
| Apple | 151 | 0 | 0 | non_year_interval 151 | 0 false; 10 informational (hourly, parsed right) |
| Google | 2,027 | 0 | 0 | no_pay_context 2,015, currency_country_mismatch 54 | 10/10 false (DQ-17) |
| NVIDIA | 960 | 0 | 0 | multiple_ranges 879, missed_salary 48 | 1 false (cash comp, null by rule); 9 informational (level tiers) |
| Microsoft | 1,282 | 0 | 0 | no_pay_context 1,034, multiple_ranges 208 | 9/10 false (DQ-17); 1 informational |
| Netflix | 20 | 0 | 0 | non_year_interval 11, missed_salary 5, currency_country_mismatch 3 | 2 false (area ranges, null by rule); 6 point at DQ-14; 2 informational |
| Anduril | 203 | 3 | 0 | non_year_interval 196 | 0 false; the critical one in the sample is a quarantined source typo |

The crawl's own beta-gate lines (job logs, run 38044091555) give the same counts.

### 6. Duplicates and freshness
- **The same requisition listed twice:**
  - **Apple:** 827 requisitions, 1,223 extra copies (DQ-2).
  - **Google:** no requisition id in the data; 17 title-and-description groups (40 postings) that are separate requisitions per city ("Data Center Technician II" at 4 sites). Fine.
  - **NVIDIA:** 61 groups (131 postings, distinct JR numbers). **Microsoft:** 48 groups (116, distinct req ids). **Netflix:** 1 (Vancouver and Sydney "Head of Character Effects", 2 requisitions).
  - **Anduril:** 454 internal_job_ids with 2+ posts (comparison, DQ-2 note).
- **Older than a year and still listed:** Apple 214, NVIDIA 168, Anduril 140, Google 37, Netflix 20, Microsoft 0 (DQ-11). Apple's 81 retail pipeline (`PIPE-`) postings have no posted date by design and show "0d+".
- **"New" badge against the history:**
  - The badge is per viewer: `firstSeenAt` from the ledger, later than the viewer's last visit (`isNewSince`).
  - The beta ledgers (`beta/history/*.json` on data-archive) have exactly one run each, and every one of the 14,962 postings is first seen at its crawl time today. So today nobody can see a wrong "New", and from the second crawl on the badge is right by construction.
  - What can't be checked until a second crawl: whether Apple's per-location ids and Google's ids are stable (if they rotate, every posting reappears as New), and whether Google's "created" date (slot 12) is a re-stamp. Google has 926 postings (27.1%) "posted" in the last 7 days, against NVIDIA 1.7% and Microsoft 6.6%. If Google re-stamps on edit, "Newest" and "listed ≤ 7 d" over-report.

### 7. Counts (here vs the crawl log vs DATA_SOURCES §7)

| Company | Snapshot file | Crawl log (run 38044091555) | Build (`beta:` line) | §7 before |
|---|---|---|---|---|
| Apple | 6,105 / 3,848 pay | 6,105 (3,848 with salary), 32.0 MB, 7,625 s, 4,716 requests, 4,401 details | 6,105, list 2.54 MB | TBD |
| Google | 3,417 / 2,032 | 3,417 (2,032), 23.5 MB, 3,432 s, 3,424 requests | 3,417, 1.40 MB | TBD |
| Microsoft | 2,320 / 1,482 | 2,320 (1,482), 30.1 MB, 2,572 s, 2,553 requests | 2,320, 960 kB | TBD |
| NVIDIA | 2,664 / 1,394 | 2,664 (1,394), 18.2 MB, 2,939 s, 2,932 requests | 2,664, 1.08 MB | TBD |
| Netflix | 456 / 294 | 456 (294), 4.7 MB, 504 s, 503 requests | 456, 1.09 MB | TBD |

All three agree exactly. Patch: [`patches/data-check-beta-data-sources.diff`](patches/data-check-beta-data-sources.diff). It fills the TBD columns, marks Meta and Amazon "paused (terms)" (they still read "works"), and adds a note on the run and on Apple's requisitions.

### The lead's other questions
- **Badge for `live: false` boards:** Apple reads "Snapshot · Oct 10", tooltip "Saved snapshot of Apple careers site from Oct 10. This board is collected by the site's crawler; your browser can't fetch it live." No request left the page for a career host during the Apple load. The other four take the same `live: false` branch in `staticJobs`. OK.
- **The demo-scaleai files:** see DQ-7.
- **Apple's list size:**
  - `api/jobs/apple.json` is 2.54 MB raw, 367 kB gzip. For comparison: Google 270 kB, Netflix 311 kB, NVIDIA 171 kB, Microsoft 162 kB gzip.
  - On a 1.6 Mbps link the transfer alone is about 1.9 s; `JSON.parse` takes 25 ms on this machine before unpacking, normalising and attaching Juice to 6,105 jobs. First cards in 4.3 s on localhost under load 9.
  - 20% of the rows are DQ-2 copies, so deduping would also cut the list by about a fifth.
  - A failed load of this file is what triggers DQ-7. The performance agent will measure it properly.
- **The vetting script's clause splitting:** see DQ-17. It does not agree with salary.js on either point.

## 2. Inputs and sources
- **Docs read:** docs/DATA_SOURCES.md (§7 and 7a-7h), docs/CONTRACT.md (v2, v3), docs/LIVABILITY.md §1-3, docs/DATA_FRESHNESS.md §1 and "History and the archive", docs/process/vetting.md, PLAYBOOK.md, TEMPLATE.md, and lead.md ("Persona review of the main site", "Big-tech boards on /beta/").
- **P-n numbering:** from the fix-lane prompts in the scratchpad (`prompt-fix-*.md`).
- **Code read:**
  - the adapters `server/sources/{apple,google,eightfold}.js`;
  - `server/normalize.js`, `server/salary.js`, `server/geo.js`, `server/keywords.js` (`seniorityOf`), `server/juice.js` (`attachJuice`, `matchCity`, `taxFor`), `server/history.js`;
  - `scripts/vet-salaries.js`, `scripts/build-static.js` (`readSnapshot`, `stableCompany`, `betaCompany`, `writeCompany`);
  - `public/api.js` (`staticJobs`, `bundled`), and in `public/app.js` the drawer, `payLabels`, `isNewSince` and `statusTag`;
  - `public/features/{compstimate,shared,roles}.js`.
- **Data:**
  - `data/beta/snapshots/*.json` and `data/snapshots/anduril.json` (norm-5);
  - the data-archive worktree `<scratch>/arch` (lead's), for `beta/history/*.json` and `observations/2026-10.jsonl`;
  - the crawl job logs through the GitHub MCP `get_job_logs` (the `gh run view --log` download is blocked by the proxy: results-receiver 403).
- **Skills:** none were needed. The browser checks used Playwright from `<scratch>/pw/node_modules` with `/opt/pw-browsers/chromium-1194`, one browser at a time.

## 3. Decisions and rationale
1. **Compare against the stored, normalized postings.** `build-static.js` uses them as stored (it re-derives only for an older `normalizerVersion`; these are norm-5), so the snapshot is what users see. The current parser was also re-run where a finding depends on it (DQ-5, DQ-6, DQ-15); its output equals the stored values.
2. **"Right" for a pay parse** means: the range, currency and period match the posting's own base-pay sentence, and the board rules in DATA_SOURCES §7a are applied. A null is right when the text has no base range, or a rule says so (cash comp, "roles in this area").
3. **Severity by job seekers misled:** postings affected × how visible the wrong fact is (list, map and filters over drawer details).
4. **Tests encode the expected behaviour, not a particular fix.** For example, DQ-2 asserts "one pay per city per requisition", which either dedupe or per-copy locations satisfy. DQ-13 encodes a proposed rule and says so. No test for DQ-11, DQ-12 or DQ-14: each needs a product decision or a raw field the snapshot doesn't keep.
5. **Fixtures are excerpts:** single lines or sentences from the named posting. Apple and Eightfold raw objects carry only the fields the adapter reads, filled with that posting's values. DQ-7 builds a tiny site from one Apple copy and one Scale AI posting.
6. **"True US"** for the Eightfold boards means a raw location ending in ", US" or equal to "US". The Eightfold format puts the ISO country last, and US states appear as "CA, US".

## 4. Replayable steps
```bash
S=<scratch>/data-check-beta; mkdir -p $S
node scripts/build-static.js --out $S/dist                       # 2 min; beta: 5/5, Apple list warning
A=<scratch>/arch                                                  # data-archive worktree
MELON_HISTORY_DIR=$A/history MELON_BETA_HISTORY_DIR=$A/beta/history node scripts/build-static.js --out $S/dist-h
node $S/scripts/overview.mjs        # counts, currencies, intervals, seniority, countries per company
node $S/scripts/sample.mjs <slug>   # 40 + 20 seeded sample with pay sentences (sample-<slug>.txt)
node $S/scripts/patterns.mjs <slug> # pay sentence shapes;  misses.mjs <slug>: unparsed pay sentences
node $S/scripts/gcur.mjs; node $S/scripts/gbonus.mjs; node $S/scripts/gmulti.mjs   # Google DQ-5/6/15
node $S/scripts/dups.mjs            # requisition / title+description groups
node $S/scripts/levels.mjs; node $S/scripts/boardlevels.mjs; node $S/scripts/deflevels.mjs; node $S/scripts/counts2.mjs
node $S/scripts/compst.mjs          # Compstimate ladders
node $S/scripts/juicecov.mjs; node $S/scripts/juice10.mjs   # Juice coverage and the 10 hand checks
node scripts/vet-salaries.js --no-fixtures --out $S/vet/flags.jsonl data/beta/snapshots/*.json data/snapshots/anduril.json
node $S/scripts/vetsample.mjs       # 10 flags per company
PORT=0 node scripts/cycle/serve.mjs --dist $S/dist-h --pid $S/serve.pid &
NODE_PATH=<scratch>/pw/node_modules node $S/scripts/browse1.cjs http://127.0.0.1:<port>/melon-seek/ $S/shots   # badge, drawer, map
NODE_PATH=... node $S/scripts/browse2.cjs ...   # demo fallback with the list request blocked
NODE_PATH=... node $S/scripts/browse3.cjs ...   # Netflix Los Gatos, Apple copy, Google Ireland line
kill "$(cat $S/serve.pid)"
node --test test/beta-data-check.test.js        # 26 tests, all fail today (by design)
```
Crawl logs: GitHub MCP `get_job_logs` (owner alvations, repo melon-seek), jobs 114190030395 (apple),
114190030384 (google), 114190030370 (microsoft), 114190030360 (nvidia), 114190030365 (netflix), tail of about 90 lines.

## 5. Verification
- `node --test test/beta-data-check.test.js`: 26 tests, 26 fail, each for the stated reason (checked one by one; the messages name the posting and the wrong value). `node --check` is OK.
- `npm test` (load 8-12, other agents running): 627 tests, 599 pass, 28 fail. The 28 are this file's 26 plus two timing tests, PERF-1 and V15 ("event loop blocked for 241 ms / 153 ms"). Re-run alone, PERF-1 passes and V15 still fails at load 10; that is the PLAYBOOK's known timing trap, and no product code was changed here.
- **Screenshots** (scratchpad only, not committed), in `<scratch>/data-check-beta/shots/`:
  - apple-list.png; nvidia-multilevel-drawer.png; nvidia-israel-drawer.png; nvidia-map.png;
  - beta-apple-list-fails.png; stable-scaleai-list-fails.png;
  - netflix-losgatos.png; apple-copy-alturas.png; google-ireland-for-us.png.
- **Manual checks:**
  - the 10 Juice postings, single and couple;
  - the 360 sampled postings against their text;
  - the crawl log counts against the files;
  - every flagged count recomputed by a second script where possible. For example, DQ-1 was counted both by raw-suffix mismatch and by the country list, and Google misses both by line shape and by country.

## 6. Known gaps and follow-ups
- **Hybrid / "remote_local" (DQ-12) and Apple's `standardWeeklyHours` (DQ-9):** neither raw value is in the snapshot. A probe run with `keepRaw` is needed.
- **ID stability, Google's "created" date and "New" against real history:** these need the second crawl. Re-run check 6 tomorrow against `beta/history/*.json` (2 runs).
- **The sandbox can't reach the boards,** so the double-encoded Apple links (DQ-9) and the per-location Apple footers (DQ-2) were not opened live.
- **Not checked:** Meta and Amazon (paused); the mobile layout; the P-16 text bugs.
- **Suggested fix order:**
  1. DQ-1: geo.js, small, removes the "not ready" verdicts.
  2. DQ-2: the Apple adapter.
  3. DQ-5 and DQ-6: two regexes in salary.js. Also update the scan (DQ-17) so the gate sees parser misses.
  4. DQ-4: cities.json `nearby`.
  5. DQ-3: levels, after P-3 lands.
  6. DQ-7: the demo fallback.

## 7. Change log
- 2026-10-10 12:31 Prompt saved; docs read; first build into `<scratch>/data-check-beta/dist` (45 s stable, 71 s beta; Apple list 2.55 MB warning).
- 12:40 Overview, pay patterns, misses (Google bonus %, zł/kr), duplicate groups (Apple per-location copies).
- 12:45 Seeded samples (seed 20261010) for all six companies; location audit found DQ-1.
- 12:50 Levels, market cells, Compstimate ladders; Juice coverage and the 10 hand checks; vet scan and 10-flag samples.
- 12:53 Crawl job logs read; history build; browser checks (badge, drawer, map, demo fallback with the list request blocked).
- 13:01 DATA_SOURCES patch written (applies with `git apply --check`).
- 13:05 test/beta-data-check.test.js: 26 red tests; renumbered DQ-1 … DQ-17 by job seekers misled.
- 13:16 `npm test`: 599/627 pass; the failures are the 26 new red tests and the PERF-1/V15 timing tests under load.
