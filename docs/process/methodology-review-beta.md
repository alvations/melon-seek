# Process log: methodology-review-beta (methodology and sources reviewer)

## 1. Brief
- Prompt: [prompts/methodology-review-beta.md](prompts/methodology-review-beta.md) (verbatim, with the lead's note for 2026-10-11).
- Goal: check that `/melon-seek/beta/` says where every number comes from and how fresh it is, for Apple, Microsoft, Google, NVIDIA and Netflix (Anduril on the main site for comparison); check that the freshness registry covers what the beta added; quote the docs that drifted.
- Files owned:
  - this log and the prompt file;
  - `test/beta-methodology.test.js` (43 to-do tests, one finding ID each);
  - `docs/screenshots/methodology-review-beta/` (24 PNG, shrunk);
  - `docs/process/patches/methodology-review-beta-{registry,data-sources,readme,guide,amazon-meta}.diff`.
- No product code, no doc and no registry file was edited in the shared checkout. Nothing was committed or pushed.

## 2. Inputs and sources
- **Build:** the lead's `cycle-beta5/dist` (HEAD 8259b1b, today's crawl), served by `scripts/cycle/serve.mjs` on 127.0.0.1:45313. Beta `api/companies.json` lists 13 companies: the 8 stable ones plus Google, Microsoft, Apple, Netflix and NVIDIA. Amazon and Meta are not in this build.
- **Crawl dates in the build:** each board's `fetchedAt`. Netflix 06:38:35, Microsoft 07:12:22, NVIDIA 07:19:09, Google 07:27:28, Apple 07:59:15 and Anduril 08:00:16 UTC, all on 2026-10-11. The counts agree with the lead's note.
- **Docs read:**
  - docs/METHODOLOGY_GUIDE.md, LIVABILITY.md, DATA_SOURCES.md (all of §7 and §8), DATA_FRESHNESS.md (inventory and beta rows), AMAZON_META.md and README.md "Beta site";
  - docs/process/{methodology-ux, methodology-copy, freshness-review, PLAYBOOK, TEMPLATE, lead (fix wave 3 to the desktop QA 2)}.md.
- **Code read:**
  - public/app.js (pay block 3380–3440, the Juice tooltip 3108–3118, badge `sourceText`/`cappedNote` 1307–1317, results title 2885–2898, JUICE_DOC 3437);
  - public/viz/chart.js `renderNotes` 448–470 and public/viz/palette.js FX table 118–160;
  - public/features/{freshness,insights,comps,compstimate,roles}.js;
  - server/{juice,salary,keywords,history,companies}.js, server/sources/{incremental,meta}.js;
  - scripts/{snapshot,build-market}.js and scripts/refresh/{registry,run,lib,fx,examples}.js.
- **Skills:** none were loaded. This is a review with screenshots, and no artifact or chart was made.

## 3. Decisions and rationale
1. **Walk the real UI, read the numbers from the app's own API.** A Playwright script opens each drawer by `#c=<slug>&job=<id>`, expands its sections and saves `innerText`, links and `title` attributes. Job ids were picked from `public/api.js getJobs()` in the page, so the cases are what the UI loads: part-time, fixed-term, by level, several ranges, non-USD, no city, no Juice, lei. Other hosts are aborted, as in the desktop QA, so the map has no basemap.
2. **What counts as "reachable in one click or tap".** A `title` tooltip doesn't count, because phones can't show it. Text next to the number, or one link away, does.
3. **Severity, as the prompt defines it.** High: a number on screen with a wrong or missing source. The lei postings say "doesn't include a pay range" when they do, and converted pay has no rate source or date next to it. Medium: stale, unclear or hard to find; registry and docs drift go here too. Low: wording.
4. **Registry gaps.** I listed every `const UPPER = …` added between a9b5e7b (the freshness review) and HEAD, about 300 names. I kept only those that decide a number, label or count a user sees: 17 constants plus Amazon's `maxPostings`. Regexes, layout values and file formats were left out. Each one has its own to-do test, which looks up the line in the code, so a rename fails loudly.
5. **Patches.**
   - The registry patch is a fragment merged with `mergeEntries` (owners unioned, notes appended, never blanked), followed by `registry.js --docs --write`. I validated it with `validateRegistry` and `--check`. It doesn't invent values: each one is copied from the code or from today's build.
   - The doc patches don't touch the guide's anchors: no new `##` section, only bullets, sentences and two FAQ entries.
   - With all five patches applied in a scratch worktree, `npm test` is 1,009 tests, 924 pass, 0 fail, 78 to-dos. 29 of this file's 43 to-dos pass, and the 14 left need product code.
6. **Not re-filed:**
   - D-37 (the methodology and share pages don't say beta);
   - DQ-27/VT-4 (Apple pay at places with no posted pay);
   - DQ-28 (the span instead of a place's own range);
   - VT-1 (São Paulo shows US pay).

   Where they touch a source statement, the finding below points to them.

## 4. Replayable steps
```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
node scripts/cycle/serve.mjs --dist $S/cycle-beta5/dist --pid $S/methodology-review-beta/serve.pid &   # port 45313
node scripts/refresh/registry.js --check        # registry ok (133 entries)
node scripts/refresh/registry.js --lines        # no change
node scripts/refresh/registry.js --docs         # inventory up to date
node scripts/refresh/registry.js --sync-tax     # tax entries: 71 (dry run)
node scripts/refresh/registry.js --summary      # 76 manual, 43 detect, 14 auto; 31 with no mechanism before
node scripts/refresh/run.js --staleness         # 133 datasets: 116 fresh, 4 STALE (fx-per-usd, tax-us-local-columbus, rents-1br-quoted, cost-index)
node --test test/freshness*.test.js test/fx-consistency.test.js test/refresh-registry.test.js test/refresh-derived.test.js test/methodology.test.js   # 62/62
# UI walk (scripts in $S/methodology-review-beta/: walk1.mjs badge/cards, pick.mjs and cov.mjs job picks and Juice coverage,
# drawer.mjs drawers, views.mjs chart/map/Insights, comps2.mjs "Same role elsewhere"); Playwright imported by absolute path
PORT_=45313 node $S/methodology-review-beta/drawer.mjs 'beta|microsoft|microsoft:1970393556864608|drawer-microsoft-romania-lei'
# constants added since the freshness review
git diff a9b5e7b HEAD -U0 -- server public scripts | grep -E '^\+(export )?const [A-Z][A-Z0-9_]+ *='
# patches: edited in a scratch worktree (git worktree add --detach $S/methodology-review-beta/wt HEAD), diffed, checked with git apply --check
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/methodology-review-beta   # 5,140 KB -> 1,372 KB
kill "$(cat $S/methodology-review-beta/serve.pid)"
```

## 5. Verification
- `node --test test/beta-methodology.test.js`: 43 tests, 43 to-dos, 0 pass, 0 fail. Each to-do fails for its stated reason (messages checked one by one).
- With the five patches applied (scratch worktree):
  - 29 of the 43 to-dos pass: MR-3 (guide part), MR-5, MR-6, MR-7, MR-8, MR-15, MR-16, MR-19 and MR-20;
  - `registry.js --check` passes, and `--lines` shows no change;
  - freshness, md and methodology tests: 67/67;
  - full `npm test`: 1,009 tests, 924 pass, 0 fail, 7 skipped, 78 to-dos.
- Shared checkout `npm test` (local data present): 1,015 tests, 936 pass, 1 fail (the V15 timing test under load 7; it passes alone with 78 ms lag), 78 to-dos.
- Screenshots: `docs/screenshots/methodology-review-beta/` (24 files; named in each finding).

## Findings

Ordered by severity. "Screen" is the beta site at 1440x1000 unless it says otherwise.

### MR-1 (High): Romanian lei pay is shown as "Salary not listed"
- **Where:** the drawer of 16 Romania-only postings, Microsoft 12 and Google 4, for example `microsoft:1970393556864608` "Technical Support Engineer - Entry Level". Screenshot: `drawer-microsoft-romania-lei.png`.
- **Actual:** "Salary not listed — this posting doesn't include a pay range." and "No similar role at Microsoft in Romania lists pay, so there is no pay estimate." The posting says "The typical base pay range for this role across Romania is lei 90,500.00 - lei 135,700.00 per year".
- **Why:** RON has no rate in any FX table (`public/viz/palette.js:130`, `server/juice.js:48`, `data/cities.json fx.perUSD`). `server/salary.js:735` therefore drops lei pay on purpose. The monthly refresh would not add RON either, because `scripts/refresh/fx.js:33` `ECB_CURRENCIES` omits it, although the ECB publishes RON. The registry entry `fx-per-usd` doesn't mention RON.
- **Expected:** the drawer shows the posted lei range, converted with a sourced rate, or at least "Pay is posted in Romanian lei (lei 90,500–135,700 a year); we can't convert it to US dollars yet".
- **Fix:**
  1. Add RON to `ECB_CURRENCIES` and to the FX code copies, then dispatch the FX refresh.
  2. Until then, word the drawer as above.
  3. The registry patch adds the RON note to `fx-per-usd`.
- **Tests:** MR-1 ×3.

### MR-2 (High): pay converted to US dollars has no source or date next to it
- **Where:**
  - **Drawer:** "≈ $101K–103K in approx US dollars for comparison" (`public/app.js:3407`). Google Waterloo CAD, `drawer-google-waterloo-no-city.png`, and Microsoft PLN/CZK/EUR. The rate's date appears only at the bottom of the Juice block ("exchange rates Jul 2026"). That block is missing when there is no Juice: no city, remote, or another country's pay.
  - **Chart footnote:** "417 converted from another currency" (`public/viz/chart.js:461`). The date is only in `foot.title`, a hover tooltip that phones can't show. Screenshots: `beta-google-chart.png`, `beta-microsoft-ranges.png`.
  - **Market insights header:** "pay in approx. USD · postings as of 11 Oct 2026" (`public/features/insights.js:437`) gives no rate date, although Compare companies on the same page does. Screenshot: `beta-google-insights.png`.
  - **Map, Pay mode:** pins in Europe, Brazil and India show converted dollar figures with no legend at all. Screenshot: `beta-microsoft-map-pay.png`. See also MR-13.
  - **Everywhere:** the source of the rates ("The Economist Big Mac index source data v2, dollar_ex column", `FX_SOURCE`) is named nowhere in the app. It appears only in the methodology sources table.
- **Expected:** the date and source in one tap, next to the converted figure.
- **Fix:** add "at Jul 2026 exchange rates" (`asOfLabel('fx-per-usd')`), linked to `methodology/#7-how-often-its-updated`, to the drawer's ≈ line, the chart footnote text and the Insights header. Add a one-line Pay legend to the map.
- **Tests:** MR-2 ×3.

### MR-3 (Medium): pay, levels, estimates and comps have no on-site explanation
- **Where:** the whole app has one methodology link: the Juice disclaimer "How it's calculated" (`public/app.js:3437`, `:3624`). The pay block, "Pay by level", the part-time caption ("If full-time (2,080 hours): …"), the fixed-term caption, "Pays more than 38% of Apple's roles in the US", Compstimate ("Typically within ±12% (tested on 500 listed salaries)"), "Same role elsewhere", Market insights, Compare companies and the data badge link nowhere. The methodology pages explain the Juice Score only.
  - A drawer with no Juice has no methodology link at all. Screenshots: `drawer-apple-part-time.png`, `drawer-microsoft-us-only-levels.png`, `drawer-apple-compstimate.png`.
- **Expected:** one tap from any pay figure to how the pay is read.
- **Fix:**
  1. The guide patch adds "How is the posted pay read?" and "Where does a pay estimate come from?" to §8, plus §1 and §5 bullets.
  2. The app links "Posted base pay", the Compstimate note and the comps caption to them (product code, so not in these patches).
- **Tests:** MR-3 ×2 (the guide one passes with the patch).

### MR-4 (Medium): exchange rates are past due
- **Where:**
  - **Registry:** `fx-per-usd` is as of 2026-07-01 on a monthly cadence, 57 days past due, and `run.js --staleness` lists it as STALE.
  - **On screen:** every non-US Juice ("exchange rates Jul 2026") and every converted figure uses these rates. The methodology sources table says "Monthly · update due".
  - **The guide contradicts it:** `docs/METHODOLOGY_GUIDE.md:122` says "Exchange rates are fetched automatically".
  - **The code comment contradicts it:** `public/viz/palette.js:122-126` describes ECB monthly rates, while the table in use is still Big Mac `dollar_ex`.
  - **No refresh is due soon:** monthly-refresh.yml is first scheduled for 2026-11-03.
- **Fix:** dispatch monthly-refresh.yml with only the FX module now (mode auto: ECB, Fed G.5, pegs), plus RON (MR-1). The guide patch rewrites the sentence: "meant to be refreshed automatically each month; the table above gives their date and says when an update is due".
- **Tests:** MR-4.

### MR-5 (Medium): constants that decide beta numbers have no registry entry
None of these is named in `data/freshness.json`. Each is added by `methodology-review-beta-registry.diff`.

| file:line | Constant | What it decides on screen |
|---|---|---|
| server/keywords.js:1086 | `GENERIC_RUNG` | level of "Engineer III" style titles |
| server/keywords.js:1087 | `GOOGLE_RUNG` | Google numeral ladder (II Entry, III Mid, IV Senior) |
| server/keywords.js:1088 | `L_LADDER` | L-levels (L5 Senior) |
| server/keywords.js:1137 | `MICROSOFT_IC` | IC1–IC2 Entry, IC3 Mid, IC4 Senior, IC5+ Staff+ |
| server/keywords.js:1138 | `MICROSOFT_M` | M1–M5 Manager, M6+ Director+ |
| server/keywords.js:1144 | `NVIDIA_LEVEL` | NVIDIA "Level N" |
| server/salary.js:372 | `PAY_AREAS` | Microsoft's SF Bay Area (75 km) / NYC (60 km) range |
| scripts/build-market.js:70 | `COUNTRY_MIN_N` | comps outside a company's home country (10 roles) |
| public/features/insights.js:23 | `MIN_SAMPLE` | "Skills need 5+ roles with pay" |
| public/features/insights.js:29 | `TIE_SHARE` | "2 skills left out: most of their roles post the same range" |
| server/sources/incremental.js:46 | `DETAIL_REFRESH_DAYS` | how old a posting's details can be (2–4 days) |
| server/sources/incremental.js:48 | `CLOSE_PROBE_LIMIT` | closure probes per board per run (50) |
| server/history.js:54 | `UNSEEN_OPEN_DAYS` | a posting missing from a partial list stays open 14 days |
| scripts/snapshot.js:64 | `CAP_RULE` | which 5,000 Amazon postings are kept |
| server/companies.js:41 | `maxPostings` | Amazon's 5,000-posting budget ("of 22,415 posted") |
| server/sources/meta.js:24, :26 | `MAX_FAILED_IN_A_ROW`, `MAX_FAILED_SHARE` | Meta crawl stop and fail rules |
| public/features/roles.js:377 | `LEVEL_NOT_STATED` | "Level not stated" |

Tests: MR-5 ×18.

### MR-6 (Medium): the registry describes the beta boards wrongly or not at all
- **`job-postings`:**
  - its values list only the stable boards of 2026-10-02 (5,413 postings) and none of the beta counts;
  - its asOf is 2026-10-02 and its cadence "daily", while the beta boards are re-crawled every 6 hours.
- **`company-registry`:**
  - it says "7 beta" without saying that Amazon and Meta were resumed and are not yet in the build;
  - it has no budget.
- **Fix:** the registry patch writes today's counts (Apple 4,875 requisitions from 6,094 listings, Google 3,417, NVIDIA 2,663, Microsoft 2,279, Netflix 457), the resume, the budget and the 6-hourly cadence.
- **Tests:** MR-6 ×2.

### MR-7 (Medium): the registry's counts and defaults are stale
- `role-families` says "26 families". `FAMILY_LABELS` has 28, because BP-4 added `chip` and `dc-tech`.
- `seniority-ladder` says "Mid is the default when the title has no level word", and its note is still "USER DECISION PENDING". Since fix wave 3 (BP-7), the UI shows "Level not stated".
- **Fix:** the registry patch.
- **Tests:** MR-7 ×2.

### MR-8 (Medium): the methodology says nothing about fixed-term, part-time, spanned or one-country pay
- **Wrong today:**
  - `docs/METHODOLOGY_GUIDE.md:20`: "Every amount is for a full year". The beta drawers show internships "Monthly · Whole term", with "Juice covers only that term" (`drawer-google-ie-intern-term.png`, `drawer-microsoft-gb-intern-month.png`, `drawer-nvidia-intern-hourly.png`).
  - `:22`: "Gross pay is the middle of the job's posted base-pay range". For 395 Apple requisitions with several place ranges, and for 164 Microsoft and 867 NVIDIA postings with level ranges, it is the middle of the span. For example, Apple Product Design Engineer: Juice gross is $210,000, the span midpoint, while Cupertino's own range is $150,400–277,600 (`drawer-apple-two-ranges.png`; see also DQ-28).
  - Part-time hourly pay (52 Apple postings) is scored on stated hours or not at all.
  - Pay is never used for another country.
- **Missing from the reference:** `docs/LIVABILITY.md` covers part-time and one-country pay (l.268–273), but not `termWeeks`.
- **Fix:** the guide patch, which corrects the §1 Gross pay bullet, adds a §5 limitation and adds a LIVABILITY fixed-term rule.
- **Tests:** MR-8 ×3.

### MR-9 (Medium): the grade cut-offs in dollars differ between the app and the methodology
- **Where:** the list header, the card and drawer grade tooltips, and the map legend say "Juicy: $96K or more a year · Ripe: $48K–96K · Dry: under $48K" (`public/app.js:3115-3118`, from `juiceNetForScore`). Screenshot: `beta-microsoft-map-pay.png`, right column.
- **The methodology page says:** "Ripe starts at $47,103 left a year, Juicy at $94,996". That is the rounded score, which is what the grade actually uses (`scripts/refresh/examples.js netForShownScore`).
- **Effect:** a job with $95,500 left is shown as Juicy 70, while its tooltip says Juicy needs $96K.
- **Fix:** use the rounding-aware threshold in `juiceScaleText` and in the map legend ($95K and $47K).
- **Tests:** MR-9.

### MR-10 (Medium): the data badge popover has no link to the source, no crawl cadence and no time zone
- **Where:** `beta-apple-badge-popover.png`, and on the main site `main-anduril-badge-popover.png`. The popover reads "Source: Apple careers site · Fetched 10/11/2026, 7:59:15 AM (6 hours ago) · Roles 4,875".
- **Actual:**
  - The source is plain text, not a link to jobs.apple.com.
  - It doesn't say the board is re-read every 6 hours.
  - The time has no time zone.
  - Nothing links to how the data is collected (DATA_SOURCES §7 is off-site; no methodology section on-site).
- **Expected:** "Source: Apple careers site (link) · read every 6 hours; next update usually within 6 hours · How we collect this".
- **Fix:** app.js `sourceText` and the popover rows (product code).

### MR-11 (Medium): Apple's role count doesn't match Apple's site, and nothing says why
- **Where:** the top bar shows "Apple 4,875", and the title says "4,875 roles".
- **Why the numbers differ:** Apple's own search lists 6,094 of 6,098 postings, because it lists one per location. The site merges these into 4,875 requisitions (DATA_SOURCES.md §7f).
- **Actual:** no caption or popover row says so. A user who compares with jobs.apple.com sees about 1,200 roles "missing".
- **Fix:** add a popover row "Roles 4,875 (Apple lists each role once per location: 6,094 listings)".

### MR-12 (Medium): Juice names another city than the job's own, and doesn't say it is a stand-in
- **Where:**
  - Apple Product Design Engineer, located in Cupertino and San Diego: "$83,900/yr left for one person in San Jose", while "Compare locations" lists "Cupertino, CA · best".
  - Google Software Engineer III in Kirkland, WA: "left for one person in Bellevue".

  Screenshots: `drawer-apple-two-ranges.png`, `drawer-google-swe-comps.png`.
- **Expected:** "in Cupertino (using San Jose's rent and living costs)". The guide says only "Some suburbs use the nearest big city's figure", in §5.
- **Fix:** the drawer headline names the job's place and the stand-in (`juice.best.proxyOf` / `nearby`).

### MR-13 (Medium): the map's Pay mode has no legend
- **Where:** `beta-microsoft-map-pay.png`. The pins read "$177K 1.2K", "$113K 305", "$122K 25".
- **Actual:** nothing says that the dollar figure is the median base pay, the midpoint of posted ranges converted to approximate US dollars at July 2026 rates, or that the second number is postings. The Juice mode has a full legend with its as-of line.
- **Fix:** a Pay legend: "Median posted base pay, approx US dollars (exchange rates Jul 2026) · number of postings".

### MR-14 (Medium): Amazon's budget will make its "show pay" share read 100%
- **Where:** `scripts/snapshot.js:71` `fitSnapshot` keeps postings with pay first. 14,123 of Amazon's 22,415 have pay (AMAZON_META.md §1), so all 5,000 kept postings will have pay.
- **Effect:**
  - The stats line will say "100% show pay", and Insights "Pay published 100%". The board's real share is 63%.
  - `jobsCapped` records `{ kept, total, by, rule, limit }`, with no whole-board pay count the UI could show instead.
  - The rule ("with a published pay range first") is explained only in a hover title on "of 22,415 posted" (`public/app.js:1307-1312`).
- **Status:** predicted from the code (Amazon is not in this build). The test runs `fitSnapshot` on a synthetic board.
- **Fix:** record `salaried` (the whole board's) in `jobsCapped`, show "63% of all 22,415 postings show pay; the 5,000 here are the ones with pay first" in the stats line and the popover, and put the rule in the popover as text.
- **Tests:** MR-14.

### MR-15 (Medium): README "Beta site" doesn't match the code and today's build
Each fix below is in `methodology-review-beta-readme.diff`.

| README line | Wrong | Corrected |
|---|---|---|
| 372–374 | "the big-tech career sites (Google, Microsoft, Meta, Apple, Netflix, Amazon and NVIDIA; Amazon shows 5,000 of its roughly 22,000 postings …)" | "(Google, Microsoft, Apple, Netflix and NVIDIA; Amazon and Meta were resumed on 2026-10-11 and appear after their first crawl. Amazon will show 5,000 of its roughly 22,000 postings …)" |
| 381–383 | "only a small "Beta" pill by the logo … It's one CSS rule …; there's no JavaScript and no new control." | "… `public/app.js` makes it a link back to the main site and adds "beta" to the tab title (D-27, D-28). The site opens on a big-tech board (Google)." |
| 386–388 | "Market comps …, share pages `c/<slug>/`, CSV and the methodology page all cover the beta companies." | "… share pages and CSV cover the beta companies. The methodology page is the same as the main site's: it explains the Juice Score, not how the big-tech pay is read (DATA_SOURCES.md §7a)." |
| 399–403 | "(snapshot.yml, 00:47, 06:47, 12:47 and 18:47 UTC) … Apple alone takes about 2 hours for about 6,100 postings." | "(scheduled 00:47, …; GitHub often starts scheduled runs hours late) … Apple took 89 minutes on 2026-10-11 for 6,094 listings (4,875 requisitions, the roles the site shows). Since 2026-10-11 a run reads only new, changed or 2-4-day-old detail pages (about 13 minutes for Apple)." |
| PLAYBOOK.md:180–181 | "Apple's full crawl takes about 2 h 10 min." | "Apple's full crawl took 89 minutes on 2026-10-11 (4,704 requests); an incremental run takes about 13." |

Tests: MR-15 ×2.

### MR-16 (Medium): AMAZON_META.md's brief contradicts its own Decision
- **Where:**
  - `docs/AMAZON_META.md:7-17` says "Amazon and Meta are missing for one reason only", in the present tense.
  - `:20` says "`server/companies.js` gives both `paused: 'terms'`".
  - `:27-29` says "Run 7 showed the saved file would keep 8,485 of the 22,415 postings".
  - Option row `:149` says "with 8,485 kept under the file limit".
- **The Decision (l.296–309) and the code say otherwise:** both were resumed, and Amazon keeps 5,000 (`maxPostings`).
- **Fix:** `methodology-review-beta-amazon-meta.diff` adds a "Superseded by the Decision" note at the top. It names the 5,000 budget and keeps the brief as written.
- **Tests:** MR-16.

### MR-17 (Low): abbreviations and terms are not explained where they appear
- "Pay by level: IC4: $119.8K–234.7K · IC5: …": IC is "individual contributor level", Microsoft's own level names (`drawer-microsoft-us-only-levels.png`).
- NVIDIA "Level 3: PLN 345K–598K": this is NVIDIA's own level number (`drawer-nvidia-pln-levels.png`).
- "level model Oct 2026" in the Compstimate as-of line (`drawer-apple-compstimate.png`).
- "Typically within ±12%": half of tested estimates were within that much of the posted pay.
- "Wide range (2.3×)": on a two-level posting, the width comes from spanning two levels, and the chip doesn't say so.
- The drawer's pay strip "$40K · median $214K · $510K" has no label (what population, which median).
- The stats line ends "· mostly Google" (Google's brands).
- Main site badge: "blocked by CORS or the network": CORS is unexplained.
- "Posted as "… (DFT)"" keeps the abbreviation (Design for Test) in the original title, which is fine because it is the company's own title.

### MR-18 (Low): two caveats are missing next to the numbers they qualify
- "Same role elsewhere" at a level, for example "Software engineering roles at Mid level in the US", leaves Apple out. Only 686 of Apple's 2,695 used salaried postings state a level (`market.json companies[].levelled`), and the caption doesn't say that companies whose postings rarely state a level are missing (`drawer-google-swe-comps.png`).
- The methodology sources table says the gross pay row is "Refreshed: Daily". On the beta site the big-tech boards are re-read every 6 hours. The guide patch adds a sentence to §7.

### MR-19 (Low): LIVABILITY.md lists currencies the palette actually has
- `docs/LIVABILITY.md:263`: "Currencies the palette lacks (INR, SEK, ILS, ...) use the city's `fxPerUSD`". `public/viz/palette.js` has INR, SEK and ILS.
- **Fix:** the guide patch. The new text: "A currency the palette lacks would use the city's fxPerUSD; today the palette has every city currency. RON … has no rate anywhere".
- **Tests:** MR-19.

### MR-20 (Low): DATA_SOURCES.md §7 has a wrong path and a broken paragraph
- **Line 170–171:** "`node scripts/snapshot.js --channel beta` writes `data/snapshots/<slug>.json`". The workflows write `data/beta/snapshots/` through `MELON_SNAPSHOT_DIR`, and README agrees.
- **Lines 176–206:** the Amazon/Meta paragraph is broken. "Why they were paused:" runs into "Re-checked on the live pages…". "The same kind of clause\nis in …" is split mid-sentence. "While\n`paused` is set …" reads as if the pause were still on. The budget is missing.
- **Fix:** `methodology-review-beta-data-sources.diff` rewrites both, adds the 6-hourly incremental crawl, and keeps every quote and run number.
- **Tests:** MR-20.

### MR-21 (Low): registry.js's usage header leaves out a mode
- **Status: fixed** by [fix-mr-3](fix-mr-3.md) (2026-10-23, 62899e8): the header lists `--docs [--write]`; test/fix-mr-3.test.js checks every mode `main()` runs.
`scripts/refresh/registry.js:3-15` lists `--check`, `--sync-tax`, `--merge`, `--lines` and `--summary`, but not `--docs` (l.345), which the PLAYBOOK tells the lead to run. Tests: MR-21.

### MR-22 (Low): market.json names a code path as its FX source
- **Status: fixed** by [fix-mr-3](fix-mr-3.md) (2026-10-23, 62899e8): `fx.source` is `palette.js FX_SOURCE`, the rates' own source.
`scripts/build-market.js:200` writes `fx: { asOf, source: 'public/viz/palette.js FX_PER_USD' }` into `beta/api/market.json`. It should be `FX_SOURCE`, the rate's real source name. Tests: MR-22.

### Checked and fine
- **Every board's crawl date** is shown: badge "Snapshot · Oct 11", and the popover's fetched time equals the snapshot's `fetchedAt`.
- **Juice "Data as of"** lines name rent, living-cost, exchange-rate and tax dates per city. The map Juice legend names the spans.
- **"Same role elsewhere"** and Compare companies say "Postings as of 11 Oct 2026 · exchange rates as of Jul 2026", and that they compare one country only.
- **Compstimate** says "Postings as of … · accuracy tested …".
- **Part-time:** the copy is right ("If full-time (2,080 hours) … As posted …"), and so is the no-Juice reason ("this part-time posting gives an hourly rate but not the hours a week").
- **Fixed-term:** the captions are right ("€47,000 a year · 13-week internship"; "Fixed-term pay, not a yearly salary (as posted: £ 4,853.00 per month)"; "Tax is worked out as if the pay lasted a year, so it may be lower").
- **No-Juice reasons:** "pay-other-country" texts name both countries; "there is no rent and living-cost data yet for Waterloo"; "the posting names no city".
- **Currencies:** every currency in the beta pay (USD, EUR, GBP, CAD, PLN, SEK, DKK, NOK, CZK, CHF) and on Anduril (JPY) has a rate in `fx-per-usd`, with source, as-of and an `auto` updater. RON is the only gap (MR-1).
- **City coverage, from the app's own data:**
  - Juice on Apple 2,729 of 2,818 paid postings, Google 1,967/2,217, Microsoft 1,117/1,490, NVIDIA 1,318/1,396, Netflix 186/290 (104 remote US) and Anduril 2,039/2,345.
  - Uncovered places get the fallback wording above.
  - Microsoft's largest gap is 193 postings that name only "United States".
  - Google's top uncovered places are Waterloo (13), Haskell TX (10), Council Bluffs (8), Saint-Ghislain (8), Frankfurt (7) and Hamburg (7).
- **Registry:** `--check` ok (133 entries), `--lines` no change, `--docs` up to date; 62/62 freshness and methodology tests pass.

## 6. Known gaps and follow-ups
- **Amazon and Meta** are not in this build, so their on-screen copy is unchecked: the cap note, `jobsCapped` and the `public_compensation` pay. MR-14 is predicted from the code. Re-run this review after their first crawl.
- **Mobile:** the walk was desktop only, at 1440 px. The tap-reachability judgements (title tooltips) come from the code, not from a phone run.
- **Live hosts:** the sandbox can't reach the careers sites, so the popover's source link can't be tested against them.
- **Patches:** the registry patch changes `docs/DATA_FRESHNESS.md` too (regenerated with `--docs --write`). Apply it after any other registry patch, then run `registry.js --lines --write && registry.js --docs --write`, as the PLAYBOOK says.
- **Left for the product fix lane:** MR-1 (the app's wording and the FX tables), MR-2, MR-3 (the app's links), MR-9 to MR-14, MR-17, MR-18, MR-21 and MR-22.

## 7. Change log
- 2026-10-11 14:30–14:50: served the build; ran the registry modes, staleness and freshness tests; walked the badge, cards, chart, map, Insights and 14 drawers; listed the constants added since a9b5e7b.
- 14:50–15:00: wrote test/beta-methodology.test.js (43 to-dos) and five patches, and verified them in a scratch worktree (`npm test` 1,009 / 0 fail).
- 15:00: shrank the screenshots (5,140 → 1,372 KB) and wrote this log.
- 15:05: full `npm test` in the shared checkout, with the local snapshot data present: 1,015 tests, 936 pass, 1 fail, 78 to-dos (this file's 43 included). The one failure is the known load-sensitive timing test "review V15: cold /api/market does not block the event loop" (the load average was about 7, because other review agents were running). Run alone it passes: max lag 78 ms. This review changed no product code. In the patched scratch worktree without data (as CI runs it): 1,009 tests, 0 fail.
