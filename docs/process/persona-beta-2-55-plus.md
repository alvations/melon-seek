# Process log: persona review, beta site, wave 2, job seekers aged 55 and over

## State

- 2026-10-23 21:57 UTC: **done.** Five people run end to end, wave 1 re-checked, throttled phone timings taken,
  log written, 109 screenshots shrunk and committed. Broken 1 and 2 were sent to the lead by SendMessage as
  they were confirmed. The shared server this review started was stopped by its pid file.

## 1. Brief

Prompt: [`prompts/persona-beta-2-55-plus.md`](prompts/persona-beta-2-55-plus.md) (verbatim, with the lead's
note for this run at its top).

Goal: play five job seekers aged 55 and over, one per career level, on `/melon-seek/beta/`. The build is the
lead's `cycle-beta7-dist`, made from e800c43 (the deployed head), with the 2026-10-16 crawl of the seven
big-tech boards. Each person does a real task in the browser. Then the group gets three lists (Good,
Improve, Broken), and wave 1's findings ([persona-beta-55-plus.md](persona-beta-55-plus.md)) are
re-checked. Owned files: this log, the prompt copy, and `docs/screenshots/persona-beta-2-55-plus/`.
No product code was edited and nothing was pushed.

## 2. Inputs and sources

- `README.md` and `docs/strategy/ROADMAP.md` §8 (the UI simplicity budget), read at e800c43. Every
  suggestion below stays inside it: nothing new on the main view. New options go in the drawer, an existing
  popover or select, or inside existing filter sections (§8 already allows "Location → within N km").
- `docs/process/lead.md` at e800c43, from "Fix wave 5, data lane" to "Batch 3 integrated". It covers
  BP-1 to BP-17, fix wave 5 (phone text and sizes, pay at a place), fix-mr-3, the preview, and the
  phone-size matrix `test/e2e/phone-sizes.mjs`.
- Wave 1 of this group: `docs/process/persona-beta-55-plus.md` (3 Broken, 14 Improve).
- The served CSVs `cycle-beta7-dist/beta/data/*.csv`. I used them to pick goals that real postings can
  test, and to count (for example Microsoft "Director" titles by level).
- Read only to name owners and confirm causes: `public/app.js` (`settleKeep`, `emptyState`, `juiceBlock`,
  `SEN_NOTE`), `public/features/compstimate.js` (thresholds), `public/features/comps.js`,
  `server/keywords.js` (`jobSeniority`, VT-8), `public/styles.css` (the Duo segment rules).
- No skills loaded; no external sites.

## 3. Method and decisions

1. **Personas fitted to 55+.** P1 is a laid-off steelworker who is now a mature student. P2 is a retired
   teacher who moved into UX research. P3 is a former pharmacy owner who now works in software sales. P4 is
   a 61-year-old firmware engineer who would like a 4-day week. P5 is a former county official who wants an
   executive role.
   - **Four countries:** Canada, the US (two people), the UK and Poland.
   - **Households:** all three types (single, couple, family).
   - **Fields:** operations, research, sales, engineering and policy.
   - **Boards:** each person uses at least two of the seven big-tech boards, and Amazon or Meta is in every
     person's path.
2. **Devices, spread over `test/e2e/phone-sizes.mjs`:**
   - P1: Pixel 8, 412×915.
   - P2: iPhone 13 mini, 375×812, turned to landscape (812×375) for the Juice breakdown.
   - P3: Motorola razr inner screen, 412×1005, then the cover screen (352×355) on the train.
   - P4: a 1366×768 laptop at 150% browser zoom (911×512 CSS px, scale 1.5), with the Polish locale.
   - P5: Surface Duo spanned, 1114×720, with touch.
   - All phones and the Duo use `isMobile` and `hasTouch`, the matrix's user agents, and real taps.
3. **Goals picked from the data first**, so each one can succeed or fail on roles that exist today.
4. **Timing.** "App" is the script's wall-clock time for a step. It includes fixed settle waits of
   0.4–1.5 s, so the app itself is faster. A step where my script waited on a failed locator is shown as
   "—". "Person" is my estimate of reading and deciding time; it is not measured.
   - The machine was busy: the load average was **3.4–12.3** during the runs (other reviewers share the 4
     CPUs).
   - Throttled phone numbers (4× CPU, Fast 4G) come from a separate run, at load 4.5–8.2.
5. **What counts as Broken:** a number, label or promise that is wrong or misleading, or a dead end.
   Friction, jargon or a missing affordance counts as Improve.
6. **Each Broken item was reproduced in a clean, minimal script and traced to the code** before it was sent
   (§8).

## 4. Replayable steps

```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
W=$S/persona-beta-2-55-plus
bash $W/start-serve.sh        # serve.mjs --dist $S/cycle-beta7-dist --pid $W/serve.pid, detached, 5 h limit
cd $W && export NODE_PATH=$S/pw/node_modules
node p1.mjs; node p1b.mjs; node p1c.mjs   # Gord, Hamilton (Pixel 8)
node p2.mjs; node p2b.mjs                 # Linda, Renton (iPhone 13 mini, landscape)
node p3.mjs; node p3b.mjs                 # Deepa, Reading (razr inner, then cover)
node p4.mjs; node p4b.mjs                 # Krzysztof, Kraków (laptop at 150%)
node p5.mjs; node p5b.mjs; node p5c.mjs   # Gloria, Atlanta (Duo spanned)
node repro-held.mjs                       # Broken 1, minimal repro
node recheck.mjs; node meth.mjs           # wave 1's findings
node est.mjs; node peek.mjs; node throttle.mjs
python3 -I survey.py [title-regex place-regex slugs paid]   # goal picking from the CSVs
kill "$(cat $W/serve.pid)"
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/persona-beta-2-55-plus
```

- `h.mjs` loads Playwright through `createRequire(NODE_PATH)`, launches
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, defines the device contexts and a step timer.
  `app.mjs` holds the app actions: switch company, search, open a filter section, type in its box, tick,
  set the salary, open a card, open Juice with a household and a period, and the phone sheet. Taps use
  `locator.tap()` on touch devices.
- "Coming back later" is a fresh browser context restored from `storageState`, so it keeps the same
  localStorage.
- One browser at a time, every command under `timeout`.

---

## 5. The five people

### P1. Gord MacLeod, 58, Hamilton, Ontario, Canada: new graduate, operations (Pixel 8)

- **Who:** couple. His wife Donna is a school secretary, but Juice counts one earner. He spent 31 years at
  a steel mill as a millwright, then a shift supervisor, and was laid off in 2023. He finishes a two-year
  Supply Chain Management diploma at Mohawk College in spring 2027.
- **Goal:** a paid operations internship or first job in southern Ontario at Amazon or Microsoft. It must
  pay at least C$25 an hour (C$52,000 a year) and leave the two of them at least C$800 a month after tax,
  rent and living costs.
- **Reached? Partly.**
  - **Pay: yes.** Amazon's "Area Manager Intern – Summer 2027 (Canada)" pays CA$30.57 an hour and lists
    Hamilton. Microsoft's Toronto data-centre internships pay CA$43,800–50,000 a year for 26 weeks.
  - **Juice: no.** Hamilton has no cost data, so the intern's Juice uses Ottawa: −$760 a month for a couple.
    The Toronto internship leaves −$1,540 a month. Both are in US dollars and assume a city-centre
    2-bedroom flat. He can't enter his own rent.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | first card in the page 3.2 s (load 6.8) | 40 s | Opens on Google: the stats line "$199K base pay median (US)" and the line "Beta: adds 7 big-tech careers sites". The chart fills the screen. The sheet reads "3,821 roles" with **no job card in view**. One tap on the handle shows cards. [p1-01](../screenshots/persona-beta-2-55-plus/p1-01-arrive.png), [p1-02](../screenshots/persona-beta-2-55-plus/p1-02-sheet-half.png) |
| 2 | Company → Amazon | 6.4 s | 20 s | 22,179 roles, "$152K base pay median (US)". [p1-03](../screenshots/persona-beta-2-55-plus/p1-03-amazon.png) |
| 3 | Search "area manager intern" | 1.7 s | 1 min | 17 roles. The cards are US regional internships ("$61K", "$28.17–34.95/hour · 10 places"). [p1-04](../screenshots/persona-beta-2-55-plus/p1-04-search-ami.png) |
| 4 | Location: "Hamilton", then "Ontario" | 2.0 + 0.8 s | 1 min | "CANADA · Hamilton 1". "Ontario" gives "No matches" (his province isn't a place in the list). Ticking Hamilton leaves 1 role, "CA$30.57/hour · Hamilton, ON +6". [p1-05](../screenshots/persona-beta-2-55-plus/p1-05-location-hamilton.png), [p1-05b](../screenshots/persona-beta-2-55-plus/p1-05b-location-ontario.png), [p1-06](../screenshots/persona-beta-2-55-plus/p1-06-hamilton-results.png) |
| 5 | Open the intern | 1.1 s | 2 min | "CA$30.57 an hour · CAD · internship, length not stated · Paid by the hour · ≈ $21.90 an hour in US dollars at Sep 2026 rates". [p1-07](../screenshots/persona-beta-2-55-plus/p1-07-drawer-ami.png) |
| 6 | Juice → Couple, Monthly | 2.3 s | 2 min | "0 · Rind · **−$760/mo left for a couple in Ottawa** while it lasts". The note says "There is no rent and living-cost data for Hamilton yet. This is Ottawa, the best other place the posting lists". Ottawa is 480 km away; Cambridge and Whitby are also listed. The tax row reads "income tax $360 · **state or local tax** $200 · social security $280" for Ontario. No "Whole term", because the length isn't stated. [p1-08](../screenshots/persona-beta-2-55-plus/p1-08-juice-couple.png), [p1-09](../screenshots/persona-beta-2-55-plus/p1-09-juice-term.png) |
| 7 | Switch to Microsoft | 1.5 s | 20 s | Toast "Kept “area manager intern” · dropped Hamilton (not at Microsoft) for now"; 0 roles. [p1-10](../screenshots/persona-beta-2-55-plus/p1-10-microsoft-kept.png) |
| 8 | Search "data centre", then "data centre intern" | — + 0.9 s | 1 min | His spelling works: 129 roles, all titled "Data Center…". The intern search gives 4 roles: "CA$44K–50K/year · 26-week internship". [p1-11](../screenshots/persona-beta-2-55-plus/p1-11-ms-data-centre.png), [p1-12](../screenshots/persona-beta-2-55-plus/p1-12-ms-data-centre-intern.png) |
| 9 | Open the Toronto technician internship; Juice Couple, Monthly and Whole term | 2.5 + 2.9 + 0.7 s | 3 min | "CA$43,800–50,000 a year · CAD · 26-week internship". Juice **−$1,540/mo** (2-bedroom city-centre rent $2,070). Whole term: gross $16,800, −$9,280. "Critical Environment Ops INTERN" reads the same. [p1-20](../screenshots/persona-beta-2-55-plus/p1-20-drawer-tech-intern.png), [p1-21](../screenshots/persona-beta-2-55-plus/p1-21-juice-tech-couple.png), [p1-22](../screenshots/persona-beta-2-55-plus/p1-22-juice-tech-term.png), [p1-23](../screenshots/persona-beta-2-55-plus/p1-23-drawer-ce-intern.png) |
| 10 | Insights (Microsoft) | — | 1 min | Pay estimate "Data Center Technicians": $75K, "Based on 69 similar roles at Microsoft", Any location. The matches are in Gävle and Milan. [p1-16](../screenshots/persona-beta-2-55-plus/p1-16-insights.png) |
| 11 | Amazon Insights: estimate "Area Manager", Hamilton | — | 2 min | $64K US dollars a year, medium confidence, 22 similar roles. The first matches are "Area Manager II, YHM1 · Hamilton · **Manager** · $54K–$75K*". He learns there is a first job in Hamilton, but it is labelled "Manager", and he would never have ticked that for a first job. [p1-24](../screenshots/persona-beta-2-55-plus/p1-24-estimate-area-manager.png) |
| 12 | Compare companies: Business operations & strategy, Entry | 2.5 + 1.0 s | 1 min | "Posted pay **in the US**". He is Canadian and there is no way to pick Canada. Entry: Google 3 · $143K, Anduril 5 · $130K. [p1-25](../screenshots/persona-beta-2-55-plus/p1-25-compare-ops-intern.png), [p1-26](../screenshots/persona-beta-2-55-plus/p1-26-compare-ops-entry.png) |
| 13 | Save | 2.4 s | 20 s | Toast "Saved in this browser. Find it in the company menu, with its new roles". [p1-17](../screenshots/persona-beta-2-55-plus/p1-17-saved.png) |
| 14 | Come back the next day | 2.6 s | 30 s | Reopens on Microsoft · "data centre intern" (4 roles). The menu opens with "SAVED SEARCHES · Microsoft · “data centre intern”". [p1-18](../screenshots/persona-beta-2-55-plus/p1-18-return.png), [p1-19](../screenshots/persona-beta-2-55-plus/p1-19-return-menu.png) |

Total: app about 30 s for the steps timed; person about 20 minutes.

### P2. Linda Okafor, 59, Renton (Seattle area), Washington, US: early career (3 years), research (iPhone 13 mini)

- **Who:** single, divorced; her children have left home and she rents a 1-bedroom. She taught high-school
  biology for 28 years, then did a UX bootcamp. She has been a UX researcher at a regional health insurer
  for 3 years.
- **Goal:** a UX researcher role that is not senior, at Meta, Amazon, Microsoft or Google, in the Seattle
  area (Seattle, Bellevue, Redmond) or remote in the US. Base pay of at least $130,000, leaving at least
  $3,000 a month.
- **Reached? Yes, if you know to type "UX".**
  - Meta's "UX Researcher, Quantitative" (Bellevue, Seattle or remote US, $193K–266K, "Level not stated")
    leaves **$9,890 a month** in Seattle.
  - Google's "UX Quantitative Researcher, Tech for Social Impact" (Seattle, $132K–189K) also fits.
  - Amazon has only Senior roles, and Microsoft only a Principal in Redmond.
  - "user researcher" finds 0 roles at Meta.
  - Her saved search lost Bellevue (Broken 1).

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | first card in the page 1.1 s | 40 s | Google; chart; the sheet reads "3,821 roles" with no card in view. The search box says "Search roles". [p2-01](../screenshots/persona-beta-2-55-plus/p2-01-arrive.png) |
| 2 | Company → Meta | 1.4 s | 20 s | 1,208 roles, "$194K base pay median (US)". [p2-02](../screenshots/persona-beta-2-55-plus/p2-02-meta.png) |
| 3 | Search "UX researcher", "user researcher", "user experience researcher", "UX research" | 4.9 s for all four | 2 min | 5 (4 in title), **0**, **0**, then 51 with 4 in title. The 5th result for "UX research" is "Director, Product Management". [p2-03](../screenshots/persona-beta-2-55-plus/p2-03-meta-ux-researcher.png) |
| 4 | Filters: tick Seattle and Bellevue; look at Remote | 1.1 + 1.7 s | 1 min | The list is short, so it has no search box. Remote reads "Any 2 · Remote 1 · On-site 1". After the ticks: 2 roles, "$213K base pay median". [p2-04](../screenshots/persona-beta-2-55-plus/p2-04-location-seattle.png), [p2-05](../screenshots/persona-beta-2-55-plus/p2-05-filters.png), [p2-06](../screenshots/persona-beta-2-55-plus/p2-06-results.png) |
| 5 | Open "UX Researcher, Quantitative" | 1.9 s | 2 min | $193K–266K, "Level not stated", "Pays more than 76% of Meta’s roles in the US". Same role elsewhere: "Design, every full-time level in the US" (Netflix $365K … Palantir $127K). [p2-07](../screenshots/persona-beta-2-55-plus/p2-07-drawer.png) |
| 6 | Juice: Just me, Monthly; turn the phone | 2.9 + 1.3 s | 2 min | **$9,890/mo**: gross $19,130, tax −$5,220 ("income tax $3,730 · social security $1,490"), rent −$2,450 (1-bedroom, city centre), living −$1,570. In landscape (812×375) it fits with no sideways scroll, but the Apply bar takes a fifth of the height. [p2-08](../screenshots/persona-beta-2-55-plus/p2-08-juice-single.png), [p2-09](../screenshots/persona-beta-2-55-plus/p2-09-landscape-juice.png) |
| 7 | Switch to Amazon | — | 1 min | "Kept “UX researcher”, Seattle, Bellevue": 3 roles, all Senior, $152K–206K. [p2-10](../screenshots/persona-beta-2-55-plus/p2-10-amazon.png) |
| 8 | Microsoft, then add Redmond | 6.6 + 2.9 s | 2 min | Toast "Kept “UX researcher”, Seattle · dropped Bellevue (not at Microsoft) for now"; 0 roles. The empty state says "**Without the search “UX researcher”: 305 roles** · Remove the search". It never mentions the place, and for 4.5 s the toast covers the button. After she adds Redmond: "Principal UX Researcher", Staff+, $143K–275K, "Pay by place: Redmond $143K–275K · Mountain View, New York $188K–304K". [p2-12](../screenshots/persona-beta-2-55-plus/p2-12-ms-empty.png), [p2-13](../screenshots/persona-beta-2-55-plus/p2-13-ms-redmond.png), [p2-15](../screenshots/persona-beta-2-55-plus/p2-15-ms-drawer.png) |
| 9 | "user researcher" at Microsoft | 0.9 s | 30 s | 0 roles; "Without the search “user researcher”: 1,032 roles". [p2-14](../screenshots/persona-beta-2-55-plus/p2-14-user-researcher-empty.png) |
| 10 | Google (first pass) | — | 1 min | "Kept “UX researcher”, Seattle · put back Bellevue": 2 roles, "UX Quantitative Researcher, Tech for Social Impact" $132K–189K and "…, Geo Makers" $109K–155K, both "Level not stated". [p2-11](../screenshots/persona-beta-2-55-plus/p2-11-google.png) |
| 11 | Compare companies: Design, Mid | 6.0 s | 1 min | "Design, Mid in the US: 1 company compared" (Amazon $141K). "Not shown: Microsoft (fewer than 3 postings with pay); Anthropic, OpenAI, Shield AI, Meta and Apple (don’t state levels for most of these roles)". [p2-16](../screenshots/persona-beta-2-55-plus/p2-16-compare-design-mid.png) |
| 12 | Pay estimate "UX Researcher", Seattle or Redmond | 2.7 s | 30 s | "Not enough comparable roles with posted pay at Meta". [p2-17](../screenshots/persona-beta-2-55-plus/p2-17-estimate.png) |
| 13 | Save on Google | 3.6 s | 20 s | Saved as "Google · “UX researcher” · Seattle · Redmond". **Bellevue is gone**, because she added Redmond at Microsoft (Broken 1). [p2-18](../screenshots/persona-beta-2-55-plus/p2-18-saved.png) |
| 14 | A week later: opens Apple first, then the menu | 3.7 + 2.3 s | 30 s | "SAVED SEARCHES" heads the menu, and the saved search restores 2 roles. [p2-19](../screenshots/persona-beta-2-55-plus/p2-19-return-menu.png), [p2-20](../screenshots/persona-beta-2-55-plus/p2-20-return-saved.png) |

Total: app about 45 s; person about 20 minutes.

### P3. Deepa Sharma-Hughes, 56, Reading, Berkshire, UK: mid-career (8 years), sales (Motorola razr)

- **Who:** family. Her husband Tom is semi-retired and they have two teenagers. She ran the family pharmacy
  for 20 years, then moved into B2B software sales 8 years ago.
- **Goal:** an account executive or solution specialist role at Microsoft or Google, in Reading, London or
  anywhere in the UK. Base pay of at least £75,000, leaving the family at least £1,500 a month.
- **Reached? Partly.**
  - **Pay: yes.** Microsoft's "Security Solution Area Specialists" (Reading, £74K–106K) and "Account
    Executive, Central Government" (London, £95K–136K) both fit.
  - **Juice: no.** Reading has no cost data. In London the AE leaves **$540 a month** for a family of four,
    in US dollars, at a city-centre 3-bedroom rent of $4,330. She owns a house in Reading and can't say so.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive on the inner screen; company → Microsoft | first card 1.4 s | 30 s | [p3-01](../screenshots/persona-beta-2-55-plus/p3-01-arrive.png) |
| 2 | Salary Min "£75,000" | 4.4 s | 30 s | "Min: £75,000 ≈ $101K a year". The chip says "**$101K+**". [p3-02](../screenshots/persona-beta-2-55-plus/p3-02-salary-gbp.png) |
| 3 | Location: "United Kingdom", "England", "Berkshire", then tick Reading and London | 1.1 + 5.2 s | 2 min | "United Kingdom" and "England" list London 36, Cambridge, England 16, Romsey 13, Reading 12 and more. "Berkshire" gives "No matches". After the ticks: 37 roles, "$155K base pay median". [p3-03](../screenshots/persona-beta-2-55-plus/p3-03-location-uk.png), [p3-04](../screenshots/persona-beta-2-55-plus/p3-04-location-picked.png), [p3-05](../screenshots/persona-beta-2-55-plus/p3-05-results.png) |
| 4 | Search "account executive", "solution specialist", "programme manager", "organisation", "specialist" | 5.0 s for all | 2 min | 2, 3, 3 ("programme" works), 0 and 4 roles. [p3-06](../screenshots/persona-beta-2-55-plus/p3-06-search-specialist.png) |
| 5 | Open "Security Solution Area Specialists" (Reading) | 1.9 s | 2 min | £74K–106K, "Pays more than 32% of Microsoft’s roles in the UK", "Same role elsewhere: Nothing to compare yet in the UK", "**🍉 No Juice: no cost data here yet**". [p3-07](../screenshots/persona-beta-2-55-plus/p3-07-drawer.png) |
| 6 | Open "Cloud & AI Solution Area Specialists" (United Kingdom only) | 1.6 s | 1 min | "Pay by level: IC4 £74.4K–105.9K · IC5 £95.3K–136.1K" ("IC" is explained only behind Details). "🍉 No Juice: the posting names no city". [p3-09](../screenshots/persona-beta-2-55-plus/p3-09-country-only.png) |
| 7 | Open "Account Executive, Central Government" (London); Juice Family, Monthly | 8.1 + 2.9 s (load 7.2) | 2 min | **$540/mo** left: gross $12,940, tax −$4,600 ("income tax $4,120 · **social security** $480"; the UK calls this National Insurance), rent −$4,330 (3-bedroom, city centre), living −$3,470. [p3-11](../screenshots/persona-beta-2-55-plus/p3-11-ae-drawer.png), [p3-12](../screenshots/persona-beta-2-55-plus/p3-12-ae-juice-family.png) |
| 8 | Google with "account" | 3.9 s | 30 s | "Kept “account”, $101K+, London · dropped Reading (not at Google) for now"; 0 roles. [p3-15](../screenshots/persona-beta-2-55-plus/p3-15-google.png) |
| 9 | Compare companies: Sales & partnerships, in the UK | 6.1 s | 1 min | Only Microsoft (8 · $155K). "Entry, Mid, Senior, Manager and Director+ aren’t in the Level list: no company lists pay for 3 or more Sales & partnerships roles at those levels in the UK". [p3-16](../screenshots/persona-beta-2-55-plus/p3-16-compare-sales-senior.png) |
| 10 | Save | 3.3 s | 20 s | Saved as "Microsoft · “account” · $101K+ · London **+1**". Reading, her home town, is the "+1", and the pay is in dollars. [p3-17](../screenshots/persona-beta-2-55-plus/p3-17-saved.png) |
| 11 | On the train: the cover screen (352×355) | 2.8 + 0.6 + 1.7 + 1.2 s | 2 min | Toast "Reopened where you left off: Microsoft · “account” · $101K+ · London +1". The page is 352 px wide with no sideways scroll. The menu works, the list shows one card at a time, and the job page is readable; the Apply bar takes a fifth of the screen. [p3-18](../screenshots/persona-beta-2-55-plus/p3-18-cover-return.png), [p3-19](../screenshots/persona-beta-2-55-plus/p3-19-cover-menu.png), [p3-20](../screenshots/persona-beta-2-55-plus/p3-20-cover-list.png), [p3-21](../screenshots/persona-beta-2-55-plus/p3-21-cover-drawer.png) |

Total: app about 50 s (the drawer at load 7); person about 20 minutes.

### P4. Krzysztof Wiśniewski, 61, Kraków, Poland: staff level, engineering (laptop at 150% zoom)

- **Who:** family: his wife Ewa and two teenagers from his second marriage. He has 34 years in embedded and
  firmware engineering (ABB, Motorola Solutions Kraków, Aptiv). He reads at 150% zoom, with the Polish
  locale.
- **Goal:** a senior or staff embedded or firmware role in Kraków (or remote from Poland) at Google, NVIDIA,
  Amazon or Microsoft. At least PLN 360,000 a year base, leaving the family at least PLN 6,000 a month.
  Ideally a 4-day week.
- **Reached? Partly.**
  - **Pay: yes.** Google's "Senior Software Engineer, Embedded Systems/Firmware" (Kraków and Warsaw,
    PLN 364K–373K) meets it.
  - **Juice: no.** It leaves **$1,330 a month** (about PLN 4,850) for a family of four at Kraków city-centre
    rent.
  - Reduced hours can't be found.
  - His Kraków filter was lost on the way and his saved search names Warsaw (Broken 1).

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive at 150% | first card 1.8 s | 30 s | The filters move behind "Filters", the words Chart, Map and Insights stay, and 3 cards are in view. "3821 roles" follows the Polish number style. [p4-01](../screenshots/persona-beta-2-55-plus/p4-01-arrive.png) |
| 2 | Location: "Kraków", "Krakow", "Cracow", "Poland", "Polska" | 7.4 s for all | 1 min | Each spelling finds "Krakow 14". "Poland" and "Polska" list Warsaw 66, Krakow 14 and Wrocław 8. He ticks Kraków: 14 roles, "100% show pay for Krakow · $86K base pay median". [p4-02](../screenshots/persona-beta-2-55-plus/p4-02-location-krakow.png) |
| 3 | Salary Min "360 000 zł", then "PLN 360,000" | 4.4 s | 1.5 min | "**“360 000 zł” isn’t a pay figure.** Try 80k, $120,000 or £80,000." This is how he writes a salary. "PLN 360,000" works: "Min: PLN 360,000 ≈ $95K a year", but the chip says "$95K+". 7 roles. [p4-03](../screenshots/persona-beta-2-55-plus/p4-03-salary-pln.png) |
| 4 | Seniority | — | 30 s | Only Senior (5) and Manager (2) are offered: there is no Staff+ role in Kraków at this pay. He ticks Senior. |
| 5 | Search "embedded", "firmware", "part-time", "part time", "4-day", "80%" | about 1 s each | 2 min | 2, 2, then 0, 0, 0, 0. Each empty state says "Without the search “part-time”: 5 roles". [p4-05](../screenshots/persona-beta-2-55-plus/p4-05-part-time.png), [p4-06](../screenshots/persona-beta-2-55-plus/p4-06-embedded.png) |
| 6 | Open "Senior Software Engineer, Embedded Systems/Firmware"; Juice Family, Monthly | 1.2 + 3.5 s | 3 min | PLN 364K–373K, "≈ $96K–99K", "Pays more than 57% of Google’s roles in Poland". Same role elsewhere in Poland: NVIDIA 6 · $125K, Google 8 · $98K. Juice **$1,330/mo** for the family, with "Family here means one earner, taxed as a single filer (household tax rules aren’t modeled here)". [p4-07](../screenshots/persona-beta-2-55-plus/p4-07-drawer.png), [p4-08](../screenshots/persona-beta-2-55-plus/p4-08-juice-family.png) |
| 7 | Switch to NVIDIA; Location "Poland"; tick Warsaw and Poland | 2.0 + 2.1 + 2.9 s | 2 min | "Kept $95K+, Senior · dropped Krakow (not at NVIDIA) for now". Ticking leaves 18 roles, "100% show pay for these places", cards such as "PLN 375K–650K · Poland +4 Remote". [p4-09](../screenshots/persona-beta-2-55-plus/p4-09-nvidia.png), [p4-10](../screenshots/persona-beta-2-55-plus/p4-10-nvidia-location-poland.png), [p4-11](../screenshots/persona-beta-2-55-plus/p4-11-nvidia-poland.png) |
| 8 | Open the top NVIDIA card; Juice | 1.4 + 3.4 s | 1 min | A sales role: "PLN 435K–949K", "Pay by level: Level 4 PLN 435K–754K · Level 5 PLN 547.5K–949K", "On-target earnings". Juice $4,860/mo, noting that it "assumes commission at target". [p4-12](../screenshots/persona-beta-2-55-plus/p4-12-nvidia-drawer.png), [p4-13](../screenshots/persona-beta-2-55-plus/p4-13-nvidia-juice.png) |
| 9 | Switch to Amazon | 6.7 s (load 12) | 1 min | "Kept $95K+, Warsaw, Senior · dropped Poland (not at Amazon) for now". 1 role, "**from PLN 426K** · Minimum · Annualized from monthly pay". [p4-14](../screenshots/persona-beta-2-55-plus/p4-14-amazon-poland.png), [p4-15](../screenshots/persona-beta-2-55-plus/p4-15-amazon-minimum.png) |
| 10 | Compare companies: Software engineering, Staff+, Poland | 6.9 s | 1 min | "Software engineering, Staff+ in Poland: 1 company compared" (Google 8 · $129K), and "Manager and Director+ aren’t in the Level list…". [p4-16](../screenshots/persona-beta-2-55-plus/p4-16-compare-swe-poland.png) |
| 11 | Back to Google; save; come back next week | 4.0 + 4.9 s | 1 min | "Kept $95K+, Warsaw, Senior". **Kraków never comes back**, and the save is "Google · $95K+ · Senior · Warsaw" (Broken 1). [p4-17](../screenshots/persona-beta-2-55-plus/p4-17-saved.png), [p4-18](../screenshots/persona-beta-2-55-plus/p4-18-return-menu.png) |

Total: app about 55 s (load 8–12); person about 25 minutes.

### P5. Gloria Whitfield, 64, Decatur (Atlanta), Georgia, US: executive, policy (Surface Duo, spanned)

- **Who:** couple; her husband Raymond is retired. She spent 22 years in county government, the last as
  economic development director, then 8 years as VP of external affairs at a utility.
- **Goal:** a director-level community, public affairs or government affairs role for data centres in
  metro Atlanta, at Microsoft, Google, Meta or Amazon, with base pay of at least $200,000. She also wants to
  see who hires for this kind of role and what they pay at her level.
- **Reached? Partly, after a detour.**
  - **The best match is hard to reach.** Microsoft's "Regional Managing Director, Data Center Community,
    Atlanta Metro" ($132K–284K, posted at M5 and M6) has three problems:
    - it doesn't appear under the Atlanta filter, because it is posted for Palmetto and East Point;
    - it shows "Manager", so Director+ hides it;
    - it has no Juice.
  - Google's "Public Affairs Manager, New Market Development" (Atlanta, $176K–256K, Manager) leaves $109,400
    a year for one person.
  - No company lists pay for Director+ policy roles in the US.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold, spanned | first card 1.7 s | 40 s | Desktop layout, 1114 px wide, no sideways scroll. This Chromium reports one screen segment, so the hinge rules in styles.css (`horizontal-viewport-segments: 2`) don't apply here. The tagline and a chart tick cross the middle. **Not judged**: it needs a real Duo, or WebKit's segments. [p5-01](../screenshots/persona-beta-2-55-plus/p5-01-arrive.png) |
| 2 | Microsoft; Location "Georgia", "Atlanta", "Palmetto" | 4.8 s | 1 min | "Georgia" gives "No matches". "Atlanta 377", but only 109 Microsoft postings name Atlanta; the rest list just "United States". "Palmetto 297", from 3 postings. [p5-02](../screenshots/persona-beta-2-55-plus/p5-02-location-atlanta.png) |
| 3 | Search "community", then "director", with Atlanta | 3.6 + 0.8 s | 2 min | "community": 1 role, a remote sales "Community Lead". "director": 32 roles, 31 in title. [p5-03](../screenshots/persona-beta-2-55-plus/p5-03-ms-community-atlanta.png), [p5-04](../screenshots/persona-beta-2-55-plus/p5-04-ms-director-atlanta.png) |
| 4 | Seniority → Director+ | — | 1 min | 8 of the 32 are left. "What the levels mean" says "Director+ means director, head of, vice president and above" (Broken 2). [p5-15](../screenshots/persona-beta-2-55-plus/p5-15-director-plus.png) |
| 5 | Search "data center community" with Atlanta | 6.7 s | 1 min | 0 roles. "No roles match every filter · **Without the search “data center community”: 377 roles** · Remove the search". Pressing it gives 377 unrelated roles; nothing says the place hides the role she wants. [p5-11](../screenshots/persona-beta-2-55-plus/p5-11-ms-dcc-atlanta-empty.png), [p5-12](../screenshots/persona-beta-2-55-plus/p5-12-ms-dcc-all.png) |
| 6 | Same search without the location; open "…Atlanta Metro" | 6.1 + 1.3 s | 3 min | 4 roles: "$132K–284K · 2 levels · Palmetto, GA +1 Remote · **Manager**". The drawer shows "Pay by level: M5 $132.2K–258K · M6 $160.7K–284.4K", and compares her role with "**Facilities**, construction & data centers, Manager level" (Amazon 309 · $137K). "🍉 No Juice: no cost data here yet", for a suburb of Atlanta. [p5-20](../screenshots/persona-beta-2-55-plus/p5-20-ms-dcc-no-location.png), [p5-21](../screenshots/persona-beta-2-55-plus/p5-21-drawer-rmd.png) |
| 7 | Google: "public affairs", Atlanta | — | 2 min | "Kept “public affairs”, Atlanta": 4 roles, $150K–256K (Manager or "Level not stated"). "Public Affairs Manager, New Market Development" leaves $109,400/yr for one person. [p5-08](../screenshots/persona-beta-2-55-plus/p5-08-google-public-affairs.png), [p5-09](../screenshots/persona-beta-2-55-plus/p5-09-google-drawer.png) |
| 8 | Meta, Amazon | 2.2 + 3.3 s | 1 min | 0 and 0 ("No roles match. See the message by the chart."). [p5-10-meta](../screenshots/persona-beta-2-55-plus/p5-10-meta.png), [p5-10-amazon](../screenshots/persona-beta-2-55-plus/p5-10-amazon.png) |
| 9 | Compare companies: Policy & government affairs | 7.7 s | 2 min | The Level list offers Senior, Staff+ and Manager: "Entry, Mid and Director+ aren’t in the Level list…". Manager: Google 19 · $214K, Meta 7 · $188K, Amazon 12 · $163K. [p5-16](../screenshots/persona-beta-2-55-plus/p5-16-compare-policy.png) |
| 10 | Pay estimate "Director of Community Affairs", Atlanta | 2.0 s | 1 min | **$191K**, "Low confidence · Based on 4 similar roles · Treat this as a rough guide". All four are product-marketing roles at "**3% match**". [p5-17](../screenshots/persona-beta-2-55-plus/p5-17-estimate.png) |
| 11 | Map | 4.3 s | 30 s | One pin, "Atlanta, GA · 377 · $177K"; the 268 "United States" postings are counted at Atlanta. [p5-18](../screenshots/persona-beta-2-55-plus/p5-18-map.png) |
| 12 | Save; come back a month later | 6.7 s | 30 s | "Microsoft · “director” · Atlanta" reopens and is listed in the menu. [p5-19](../screenshots/persona-beta-2-55-plus/p5-19-return-menu.png) |

Total: app about 55 s (load 8–10); person about 25 minutes.

### Throttled phone timings (Pixel 8, 4× CPU, Fast 4G; load 4.5–8.2)

| Board | First card | Full list | Other |
|---|---|---|---|
| Google (the /beta/ landing) | 3.7 s | 4.4 s | The card is in the page but **not on screen**: the sheet stays at "3,821 roles" for 15 s ([x-peek-google-pixel8-late](../screenshots/persona-beta-2-55-plus/x-peek-google-pixel8-late.png)). |
| Amazon (preview board) | 2.6 s (preview) | 8.4 s | **Insights: 8.9–9.9 s** from the tap to the cards ([x-throttled-amazon-insights](../screenshots/persona-beta-2-55-plus/x-throttled-amazon-insights.png)); search "area manager" 1.5 s. |

---

## 6. Wave 1's findings: status on this build

### 6.1 Wave 1's Broken items: all 3 fixed

| # | Then | Now | Evidence |
|---|---|---|---|
| 1 | Yearly intern pay shown as the whole term's pay ("€34,800 · for about 13 weeks"; Juice "Whole term" a quarter of it) | **Fixed.** "€34,800 a year · EUR · 13-week internship"; "Whole term" gross $10,020, a quarter of about $40K. Microsoft Toronto: "CA$43,800–50,000 a year · 26-week internship", whole term $16,800. | [re-01](../screenshots/persona-beta-2-55-plus/re-01-google-dc-intern.png), [re-02](../screenshots/persona-beta-2-55-plus/re-02-google-dc-intern-term.png), [p1-22](../screenshots/persona-beta-2-55-plus/p1-22-juice-tech-term.png) |
| 2 | British spellings gave 0 roles and blamed the spelling | **Fixed.** Both spellings give the same counts: "data centre"/"data center" 321/321 (Google), "defence"/"defense" 1,565/1,565 (Anduril), "programme"/"program manager" 469/469, "organisation" 44/44 and "labour" 13/13 (Amazon). One gap: "datacentre" 0 vs "datacenter" 487 (Microsoft). | `recheck.mjs` b2, [p1-11](../screenshots/persona-beta-2-55-plus/p1-11-ms-data-centre.png) |
| 3 | With a location filter, the chart, cards, pay filter and Juice used another country's pay (NVIDIA Munich: 12 of 13 Polish ranges) | **Fixed.** NVIDIA, Munich: "51 roles · 0% show pay for Munich"; the cards read "Pay posted for Poland only". With Senior + Staff+ and €110,000 there are 0 roles, not 13 Polish ones. In Poland, P4 saw PLN pay on Polish places only. | [re-03](../screenshots/persona-beta-2-55-plus/re-03-nvidia-munich.png), [p4-11](../screenshots/persona-beta-2-55-plus/p4-11-nvidia-poland.png) |

### 6.2 Wave 1's Improve items: 5 fixed, 5 partly, 4 open

| # | Wave 1 Improve | Now |
|---|---|---|
| 1 | Juice in the person's own terms | **Open.** Only US dollars; no "my rent", "I own my home" or "outside the centre". Partly better: a country-only posting now says why it has none ("No Juice: the posting names no city"), and a stand-in city is named. |
| 2 | One median per screen | **Fixed.** "$199K base pay median (US)" in both the stats line and the chart. |
| 3 | The last jargon | **Partly.** NVIDIA departments are readable now ("Systems Software Engineering", "ASIC Engineering"). Google technicians are no longer tagged TPUs or GCP, though one controls technician is tagged "IAM". "Single figure" became "One number, not a range". Still there: "Rind", "Clusters / Ranges", "CE" in Microsoft titles, "state or local tax" for Ontario, "social security" for UK National Insurance, and "M5/M6" and "IC4/IC5" in Pay by level. |
| 4 | "On-site" counted the same as "Any" | **Fixed.** "Any 3,821 · Remote 68 · On-site 3,753". |
| 5 | Land beta visitors on big tech | **Fixed.** `/beta/` opens on Google. |
| 6 | Search that understands people's words | **Partly.** "user experience designer" now finds Google's UX Designers (42). But "user researcher" and "user experience researcher" find 0 at Meta and Microsoft, "policy" at Microsoft gives 643 roles with 1 in the title, and "datacentre" finds 0. |
| 7 | Typing a country in Location | **Fixed** for countries and local names: "Ireland", "United Kingdom", "Poland", "Polska", "Deutschland". Still not: states, provinces and counties ("Georgia", "Bavaria" and "Berkshire" give no matches; "Ontario" and "Texas" give only the postings labelled with that name). |
| 8 | Keep a place when the next board doesn't have it | **Fixed** ("dropped … for now", then "put back"), except Broken 1. |
| 9 | Keep the currency people typed | **Open.** The chip says "$101K+" after "£75,000" and "$95K+" after "PLN 360,000", and saved names do the same. New: "zł" isn't read at all. |
| 10 | The phone's first screen shows no job | **Open** on Google, the beta landing: no card on the Pixel 8, the iPhone 13 mini or the razr cover screen, even after 15 s. Only Amazon's preview briefly raises the sheet. |
| 11 | "Same role elsewhere": family and level | **Partly.** Apple's "IC Designer – Power Management" is now compared with chip design, which is right ([re-07](../screenshots/persona-beta-2-55-plus/re-07-apple-ic-designer.png)). But Microsoft's data-centre *community* director is compared with facilities managers. |
| 12 | Say why a level is missing in Compare companies | **Fixed.** "Entry, Mid and Director+ aren’t in the Level list: no company lists pay for 3 or more … roles at those levels in the US." |
| 13 | Part-time and reduced hours | **Open.** "part-time", "part time", "4-day" and "80%" all give 0. |
| 14 | Small honesty gaps | **Partly.** The stand-in city is named ("This is Ottawa, the best other place the posting lists"). The Location box still says a bare "No matches". The methodology page shows "update due" on 3 rows, 1 fewer than in wave 1. |

---

## 7. Findings for the group

P1 Gord (Hamilton, Pixel 8), P2 Linda (Seattle area, iPhone 13 mini), P3 Deepa (Reading, razr), P4 Krzysztof
(Kraków, 150% zoom), P5 Gloria (Atlanta, Duo spanned).

### 7.1 Broken, fix now

1. **A place "dropped … for now" on a company switch is lost for good once any Location tick changes on
   the next board, with no message. The saved search then lacks it.**
   - Repro: `#c=google&l=Krakow` (14 roles) → switch to NVIDIA: "Dropped Krakow (not at NVIDIA) for now"
     → tick Warsaw → switch back to Google: "Kept Warsaw". Kraków never returns, and Save names the search
     "Google · Warsaw".
   - P4 lost his home city: his saved search reads "Google · $95K+ · Senior · Warsaw". P2 lost Bellevue
     after adding Redmond at Microsoft.
   - Screen: company-switch toast and saved searches.
     [x-held-1](../screenshots/persona-beta-2-55-plus/x-held-1-nvidia-toast.png),
     [x-held-2](../screenshots/persona-beta-2-55-plus/x-held-2-google-no-krakow.png),
     [x-held-3](../screenshots/persona-beta-2-55-plus/x-held-3-saved-name.png),
     [p4-17](../screenshots/persona-beta-2-55-plus/p4-17-saved.png),
     [p2-18](../screenshots/persona-beta-2-55-plus/p2-18-saved.png).
   - Owner: `public/app.js` `settleKeep()`. Its first loop,
     `if (facetSnap(key) !== held[key].after) delete held[key];`, drops everything set aside as soon as
     the facet changes at all, although the toast promised "for now".
   - Fix idea: drop a set-aside place only on Clear all, the Location reset or unticking that place, or say
     "Krakow dropped" when it goes.
   - Sent to the lead.
2. **The Seniority filter says "Director+ means director, head of, vice president and above", but at
   Microsoft 66 of 120 postings titled "Director" are filed Staff+ (45) or Manager (21), and nothing says
   so.**
   - P5: "director" in Atlanta gives 32 roles; Director+ keeps 8.
   - Her best match, "Regional Managing Director, Data Center Community, Atlanta Metro", is posted at M5
     and M6 and reads "Manager".
   - Wave 1's Brussels match, "Government Affairs Director" (€131–221K), is now Staff+, so Director+ hides
     it too.
   - Screens: Seniority filter, card and drawer level chips.
     [p5-04](../screenshots/persona-beta-2-55-plus/p5-04-ms-director-atlanta.png),
     [p5-15](../screenshots/persona-beta-2-55-plus/p5-15-director-plus.png),
     [p5-21](../screenshots/persona-beta-2-55-plus/p5-21-drawer-rmd.png).
   - Owners: `server/keywords.js` `jobSeniority()`. VT-8 lets Microsoft's own level beat the title, and a
     two-level M5/M6 span takes the lower level. The text in `public/app.js` `SEN_NOTE` (line 99) and the
     chips still describe title words.
   - Fix idea (wording, no new control):
     - add a line to "What the levels mean": "Microsoft, Amazon and NVIDIA postings use the company's own
       level, so some ‘Director’ titles are Staff+ or Manager";
     - give the drawer's chip the posted level ("Manager · Microsoft M5–M6");
     - consider letting a two-level span match either level.
   - Sent to the lead.

### 7.2 Improve (ranked by how many of the 5 it helps)

1. **(5/5) Juice in the person's own terms.**
   - **The money in their own currency.** Show it beside the US dollars, in C$, £ or zł.
   - **Their own home.** Let them say "my rent is …", "I own my home" or "outside the centre"
     (`juice.js` already takes `rentOverrides` and `rent: 'outside'`).
   - **Suburbs use the metro's costs.** Hamilton could use Toronto or Cambridge, Palmetto and East Point
     Atlanta, and Reading London or a sourced record. Today Gord gets Ottawa (480 km away), and Deepa and
     Gloria get no Juice at all.
   - Inside §8 this all fits in the drawer's Juice block.
   - Evidence:
     - P1 −$760/mo at Ottawa's costs [p1-08](../screenshots/persona-beta-2-55-plus/p1-08-juice-couple.png);
     - P3 no Juice in Reading [p3-07](../screenshots/persona-beta-2-55-plus/p3-07-drawer.png);
     - P4 PLN goal vs a USD answer [p4-08](../screenshots/persona-beta-2-55-plus/p4-08-juice-family.png);
     - P5 no Juice in Palmetto [p5-21](../screenshots/persona-beta-2-55-plus/p5-21-drawer-rmd.png);
     - P2's renting in Renton is cheaper than city-centre Seattle.
   - Owners: `public/app.js` `juiceBlock()`, `server/juice.js` (proxies, overrides), `docs/LIVABILITY.md`.
2. **(5/5, small) The last jargon.**
   - **Grades and views:** "Rind" on cards, and "Clusters / Ranges".
   - **Tax rows:** "state or local tax" for Ontario (provincial) and "social security" for UK National
     Insurance and Polish ZUS.
   - **Level codes:** "M5/M6" and "IC4/IC5" in Pay by level. The explanation sits behind Details; put it on
     the line.
   - **Titles and tags:** "CE" in Microsoft titles ([re-05](../screenshots/persona-beta-2-55-plus/re-05-ms-ce.png)), and "IAM" on a controls technician.
   - Evidence: [p1-08](../screenshots/persona-beta-2-55-plus/p1-08-juice-couple.png),
     [p3-12](../screenshots/persona-beta-2-55-plus/p3-12-ae-juice-family.png),
     [p5-21](../screenshots/persona-beta-2-55-plus/p5-21-drawer-rmd.png).
   - Owners: `public/app.js` (`taxParts` labels, Pay by level), `server/keywords.js` (tags).
3. **(4/5) Places near me.**
   - Linda's Seattle misses Redmond and Bellevue jobs at Microsoft. Gloria's Atlanta misses "…Atlanta
     Metro" (Palmetto, East Point).
   - Gord can't type "Ontario", Deepa can't type "Berkshire" and Gloria can't type "Georgia".
   - The roadmap already allows "Location → within N km". A state or province search that lists its cities
     would also help.
   - P1, P2, P3, P5 ·
     [p1-05b](../screenshots/persona-beta-2-55-plus/p1-05b-location-ontario.png),
     [p2-12](../screenshots/persona-beta-2-55-plus/p2-12-ms-empty.png),
     [p5-02](../screenshots/persona-beta-2-55-plus/p5-02-location-atlanta.png),
     [re-06](../screenshots/persona-beta-2-55-plus/re-06-location-ontario.png) · `public/app.js`
     (`makeChecklist` search, `locMatches`).
4. **(3/5) The phone's first screen shows no job.** On the /beta/ landing (Google), the Pixel 8, the iPhone
   13 mini and the razr cover all show a full chart and a sheet reading "3,821 roles", with no card, even
   after 15 s throttled. Peek the first card always, as Amazon's preview briefly does (UX-39). P1, P2, P3 ·
   [p1-01](../screenshots/persona-beta-2-55-plus/p1-01-arrive.png),
   [p2-01](../screenshots/persona-beta-2-55-plus/p2-01-arrive.png),
   [x-peek-google-pixel8-late](../screenshots/persona-beta-2-55-plus/x-peek-google-pixel8-late.png),
   [x-peek-google-razrCover-late](../screenshots/persona-beta-2-55-plus/x-peek-google-razrCover-late.png) ·
   `public/styles.css`, `public/app.js` (sheet, `body.is-previewing`).
5. **(3/5) Level labels that match the person's career stage.** This is beyond Broken 2.
   - Amazon's "Area Manager II" (the new-graduate job in Hamilton) reads "Manager", so Gord, a new graduate,
     would never tick it.
   - Microsoft's "Regional Managing Director" also reads "Manager".
   - Two-level spans show one chip.
   - Say "posted level" and the company's rung in the drawer. P1, P3, P5 ·
     [p1-24](../screenshots/persona-beta-2-55-plus/p1-24-estimate-area-manager.png),
     [p5-21](../screenshots/persona-beta-2-55-plus/p5-21-drawer-rmd.png) · `server/keywords.js`,
     `public/app.js`.
6. **(2/5) Empty states should name the filter that hides the role, not the broadest one.**
   - `emptyState()` always offers the facet whose removal gives the most roles, which is usually the
     search.
   - Linda got "Without the search “UX researcher”: 305 roles" when Seattle was the blocker. Gloria got
     "Without the search: 377 roles" when Atlanta hid the one role she wanted.
   - Show each blocking filter with its count ("Without Atlanta: 1 role · Without the search: 377").
   - The 4.5 s company toast also covers the empty-state button on the iPhone mini.
   - P2, P5 · [p2-12](../screenshots/persona-beta-2-55-plus/p2-12-ms-empty.png),
     [p5-11](../screenshots/persona-beta-2-55-plus/p5-11-ms-dcc-atlanta-empty.png) · `public/app.js`
     `emptyState()`, `toast()`.
7. **(2/5) Keep the currency people type.**
   - The chip and saved name say "$101K+" after "£75,000" and "$95K+" after "PLN 360,000".
   - "360 000 zł" and "zł360,000" are refused ("isn’t a pay figure"), although "75 000 €" and "€75.000"
     work.
   - Saved names hide the second place behind "+1" ("London +1" hides Reading).
   - P3, P4 · [p3-02](../screenshots/persona-beta-2-55-plus/p3-02-salary-gbp.png),
     [p4-03](../screenshots/persona-beta-2-55-plus/p4-03-salary-pln.png),
     [p3-17](../screenshots/persona-beta-2-55-plus/p3-17-saved.png) · `public/app.js` (salary parser,
     `quickLabel('salary')`, `searchName()`).
8. **(2/5) Search words.**
   - "user researcher" and "user experience researcher" find 0 at Meta and Microsoft, which both post
     "UX Researcher".
   - "datacentre" finds 0, while "datacenter" finds 487.
   - "policy" at Microsoft lists 643 roles with 1 in the title: description boilerplate.
   - P2, P5 · [p2-14](../screenshots/persona-beta-2-55-plus/p2-14-user-researcher-empty.png) ·
     `public/app.js` `queryMatchers()`.
9. **(2/5) Pay estimates from weak or far-away matches.**
   - "Director of Community Affairs" gives $191K from four product-marketing roles at 3% match. Without a
     place it is still $191K, from 5–10% matches, including a Vienna role. Google gives $279K, Meta $260K
     and Amazon $184K, from 9–37% matches.
   - With "Any location", Gord's "Data Center Technicians" estimate drew on Gävle and Milan.
   - Below a best match of about 20%, say "No close matches" and list them, as unrelated titles already do
     ([x-estimate-funeral-director](../screenshots/persona-beta-2-55-plus/x-estimate-funeral-director.png)).
     Default the location to the person's filter country.
   - P1, P5 · [p5-17](../screenshots/persona-beta-2-55-plus/p5-17-estimate.png),
     [p1-16](../screenshots/persona-beta-2-55-plus/p1-16-insights.png) · `public/features/compstimate.js`
     (`MIN_WEIGHT = 0.02`, `REL_WEIGHT`).
10. **(2/5) Place counts that include country-wide postings.**
    - At Microsoft, "Atlanta 377" and "Palmetto 297" count the 268 "United States" postings, while only
      109 and 3 postings name those places.
    - The map's Atlanta pin says 377.
    - Show "3 here + 294 country-wide", or count only the place. P3 (Reading 12 = 4 + 8), P5 ·
      [p5-02](../screenshots/persona-beta-2-55-plus/p5-02-location-atlanta.png),
      [p5-18](../screenshots/persona-beta-2-55-plus/p5-18-map.png) · `public/app.js` (Location counts),
      `public/viz/map.js`.
11. **(1/5) Part-time and reduced hours.** "part-time", "part time", "4-day" and "80%" all give 0. P4 ·
    [p4-05](../screenshots/persona-beta-2-55-plus/p4-05-part-time.png) · `server/normalize.js`
    (`employmentType`).
12. **(1/5) Amazon Insights on a phone.** It takes 8.9–9.9 s from the tap to the cards on a throttled
    Pixel 8. The lead's log already names this gap: the one 4.3 s task. P1 ·
    [x-throttled-amazon-insights](../screenshots/persona-beta-2-55-plus/x-throttled-amazon-insights.png) ·
    `public/features/insights.js`, `roleFamily`.
13. **(1/5) Compare companies for someone outside the US.**
    - With no location filter, it shows "Posted pay in the US", and a Canadian can't pick Canada.
    - The data-centre community director is compared with facilities managers.
    - P1, P5 · [p1-25](../screenshots/persona-beta-2-55-plus/p1-25-compare-ops-intern.png),
      [p5-21](../screenshots/persona-beta-2-55-plus/p5-21-drawer-rmd.png) · `public/features/comps.js`
      (`compareCountry`), `public/features/roles.js`.
14. **(1/5) The methodology page still says "update due".**
    - The Tax row reads "checked 10 October 2026 · Yearly · update due", 13 days after the check.
    - The 1-bedroom rent row reads "May–October 2026 · Quarterly · update due".
    - Readers ask "due for what?"
    - [re-09](../screenshots/persona-beta-2-55-plus/re-09-methodology-update-due.png) · `scripts/methodology.js`,
      `scripts/methodology-figures.js`.

### 7.3 Good (keep)

1. **Search and filters carry across company switches, and the toast says what happened.** Examples:
   "Kept “UX researcher”, Seattle, Bellevue", "dropped Bellevue (not at Microsoft) for now", then
   "put back Bellevue"; "Kept $95K+, Warsaw, Senior". 5/5 ·
   [p2-10](../screenshots/persona-beta-2-55-plus/p2-10-amazon.png),
   [p4-09](../screenshots/persona-beta-2-55-plus/p4-09-nvidia.png).
2. **People's own words for places and spelling.**
   - Spellings: "data centre" (129 at Microsoft), "programme manager", "organisation".
   - Place names: "Kraków", "Cracow", "Polska", "Deutschland" and "United Kingdom" all work.
   - P1, P3, P4 · [p1-11](../screenshots/persona-beta-2-55-plus/p1-11-ms-data-centre.png),
     [p4-02](../screenshots/persona-beta-2-55-plus/p4-02-location-krakow.png),
     [p3-03](../screenshots/persona-beta-2-55-plus/p3-03-location-uk.png).
3. **Pay is shown where it was posted.**
   - Labels: "Pay posted for Poland only", "Posted for Redmond", "Pay by place: Redmond $143K–275K ·
     Mountain View, New York $188K–304K", and "100% show pay for these places".
   - NVIDIA Munich no longer borrows Polish pay.
   - P2, P4 · [p2-15](../screenshots/persona-beta-2-55-plus/p2-15-ms-drawer.png),
     [re-03](../screenshots/persona-beta-2-55-plus/re-03-nvidia-munich.png).
4. **Internship pay reads right.** "€34,800 a year · 13-week internship", "CA$43,800–50,000 a year ·
   26-week internship" and "internship, length not stated", with a whole-term Juice that matches. P1 ·
   [p1-20](../screenshots/persona-beta-2-55-plus/p1-20-drawer-tech-intern.png),
   [re-01](../screenshots/persona-beta-2-55-plus/re-01-google-dc-intern.png).
5. **Juice explains itself.**
   - Data it lacks: "There is no rent and living-cost data for Hamilton yet. This is Ottawa…", "No Juice:
     the posting names no city".
   - The household: "2 adults, 1 earner, 2 bedrooms", "taxed as a single filer (household tax rules aren’t
     modeled here)".
   - The pay basis: "assumes commission at target", "Gross pay is the posted minimum".
   - P1, P3, P4, P5 · [p1-08](../screenshots/persona-beta-2-55-plus/p1-08-juice-couple.png),
     [p4-13](../screenshots/persona-beta-2-55-plus/p4-13-nvidia-juice.png).
6. **Compare companies is honest.** It names one country, says which levels are missing and why, and names
   who is left out ("Not shown: Microsoft (fewer than 3 postings with pay); … Meta and Apple (don’t state
   levels…)"). P2, P3, P4, P5 ·
   [p2-16](../screenshots/persona-beta-2-55-plus/p2-16-compare-design-mid.png),
   [p3-16](../screenshots/persona-beta-2-55-plus/p3-16-compare-sales-senior.png).
7. **Odd screens work.**
   - The razr cover screen (352×355): the reopen toast, the menu, the list and the job page are all usable
     with no sideways scroll.
   - The iPhone mini in landscape fits.
   - At 150% zoom the words stay.
   - P2, P3, P4 · [p3-18](../screenshots/persona-beta-2-55-plus/p3-18-cover-return.png),
     [p3-21](../screenshots/persona-beta-2-55-plus/p3-21-cover-drawer.png),
     [p2-09](../screenshots/persona-beta-2-55-plus/p2-09-landscape-juice.png),
     [p4-01](../screenshots/persona-beta-2-55-plus/p4-01-arrive.png).
8. **Coming back works.**
   - It reopens where you left off, with a toast that says so.
   - "SAVED SEARCHES" heads the company menu, with plain names.
   - 5/5 · [p1-19](../screenshots/persona-beta-2-55-plus/p1-19-return-menu.png),
     [p2-19](../screenshots/persona-beta-2-55-plus/p2-19-return-menu.png),
     [p5-19](../screenshots/persona-beta-2-55-plus/p5-19-return-menu.png).
9. **The salary box reads money.** "£75,000", "PLN 360,000", "75 000 €" and "€75.000" all work and show the
   conversion: "Min: PLN 360,000 ≈ $95K a year". P3, P4 ·
   [p3-02](../screenshots/persona-beta-2-55-plus/p3-02-salary-gbp.png).
10. **Plain pay labels.** "One number, not a range", "from PLN 426K · Minimum", "Paid by the hour",
    "Level not stated", "Pays more than 32% of Microsoft’s roles in the UK", and one "base pay median
    (US)" per screen. 5/5 · [p4-15](../screenshots/persona-beta-2-55-plus/p4-15-amazon-minimum.png).
11. **Speed where it counts.**
    - On a throttled Pixel 8, Google's first card is in the page at 3.7 s and Amazon's preview card at
      2.6 s.
    - An Amazon search takes 1.5 s.
    - Most company switches take about 1.5–2 s even at load 7–12. Amazon is slower: 6.4 s on the Pixel 8 and
      6.7 s at 150% zoom.
12. **The Apply button** names the company's own site and host ("Apply on Meta’s careers site ·
    metacareers.com"). 5/5 · [p2-09](../screenshots/persona-beta-2-55-plus/p2-09-landscape-juice.png).

## 8. Verification

- **Personas:** 5 people, each run end to end in Chromium (13 scripts). Each person saved a search, and each
  return in a fresh context reopened the last view and listed the saved search.
- **Broken 1:**
  - A minimal repro on desktop (`repro-held.mjs`), with the three `x-held-*` screenshots. P4 and P2 hit it
    in their own runs.
  - The cause was read in `public/app.js` `settleKeep()` at e800c43.
- **Broken 2:**
  - Counts from `cycle-beta7-dist/beta/data/microsoft.csv`: titles matching `\bdirector\b` are Director+ 52,
    Staff+ 45, Manager 21, Senior 1, Mid 1.
  - The in-app count: 139 roles for "director", Director+ 71.
  - The rule is in `server/keywords.js` `jobSeniority()` (VT-8), and the wording in `SEN_NOTE`.
- **Wave 1 re-check:** `recheck.mjs` and `meth.mjs`, on the same build.
- **Estimates:** `est.mjs` (six titles). "Funeral Director" and "Chief Nursing Officer" give "Not enough
  comparable roles", so a floor exists. It is `MIN_WEIGHT = 0.02` in `compstimate.js`.
- **Throttled timings:** `throttle.mjs` and `peek.mjs` (CDP CPU ×4, 165 ms RTT, 1.01 MB/s), one run each, at
  load 2.6–8.2.
- **Screenshots:** 109 PNGs, 6.3 MB after `scripts/cycle/shrink-screenshots.sh` (22.5 → 7.2 MB for all 121 taken;
  12 duplicates or unused shots were then removed).

## 9. Known gaps and follow-ups

- **The Duo hinge was not judged.** This Chromium reports one viewport segment, so the
  `horizontal-viewport-segments: 2` rules never applied. It needs a real Duo, or Edge with segments.
- **Timings were taken under heavy load** (load 3.4–12.3), so they are high. The person-time column is an
  estimate.
- **Not seen:**
  - "N new since your last visit" (no backdated ledger in this test);
  - live board refresh and map tiles (the sandbox has no egress);
  - dark mode;
  - a screen reader;
  - WebKit (only Chromium was run).
- **Only partly covered:**
  - P5 never saw a couple's Juice in Atlanta: her Microsoft role has none, and the Google drawer was read
    for one person.
  - The Amazon Area Manager intern's length is "not stated" in the data; I didn't check the live posting.

## 10. Change log

- 2026-10-23: second wave on the lead's `cycle-beta7-dist` (e800c43, 2026-10-16 crawl). 109 screenshots.
  Broken 1 and 2 were sent to the lead by SendMessage when confirmed.
