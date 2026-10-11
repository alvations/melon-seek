# Process log: persona review, beta site, job seekers aged 55 and over

## 1. Brief

Prompt: [`prompts/persona-beta-55-plus.md`](prompts/persona-beta-55-plus.md) (verbatim).
Goal: play five job seekers aged 55+, one per career level, on the local `beta` build (commit
83023f5: the 8 AI boards plus Google, Microsoft, Apple, Netflix and NVIDIA, today's real snapshot).
Each person does their real task in the browser. Then, for the group, list what is good, what to
improve and what is broken, and say which of the first review's "broken" items are now fixed.
Files owned: this file, the prompt copy, and `docs/screenshots/persona-beta-55-plus/` (114 PNGs,
5.9 MB after `scripts/cycle/shrink-screenshots.sh`). No product code was edited and nothing was
committed.

**Not reported, as the lead asked:** the badge falling back to the bundled snapshot and grey map
tiles ("Basemap unavailable").

## 2. Inputs and sources

- `README.md` (beta site, data modes, Juice, saved searches) and `docs/strategy/ROADMAP.md` §8, the UI
  simplicity budget. Every suggestion below stays inside it: no new modes, no new main-view controls;
  new options go in the drawer, an existing popover or "More".
- The first persona review: `docs/process/persona-stable-55-plus.md` (and the Broken lists of the
  other four `persona-stable-*.md`), and the two fix waves in `docs/process/lead.md`.
- `docs/process/perf-mobile-beta.md` for the clean phone timings, `docs/LIVABILITY.md` §1 for the
  Juice households.
- Read only to name owners and confirm findings: `public/app.js`, `public/features/shared.js`,
  `public/viz/chart.js`, `server/juice.js`, `server/salary.js`, `server/keywords.js`, the stored
  snapshots in `data/beta/snapshots/`, and `dist/beta/data/*.csv` / `api/cities.json` from the
  lead's build.
- No skills loaded; no external sites.

## 3. Method and decisions

1. **Personas fitted to 55+:** an electrician retrained for data centres, a returning carer turned UX
   designer, an immigrant who restarted his sales career, a widowed staff engineer who wants a
   4-day week, and an ex-civil-servant policy executive. They live in **5 countries** (Ireland, US,
   Canada, Germany, Belgium), cover all three household types and five fields (operations, design,
   sales, research/engineering, policy). **All 5 have a reason to use the big-tech boards** (data
   centres, Apple's Austin campus, Google/Microsoft sales in Toronto, NVIDIA and Google in Munich,
   Microsoft and Google in Brussels).
2. **Devices:** P2 on an iPhone and P3 on an Android phone (390×844, `isMobile`, `hasTouch`, DPR 2).
   P1 on a 1366×768 laptop, P4 on a 1440 laptop at 125% zoom (1152×720 at scale 1.25), P5 on a
   1440×900 desktop.
3. **Goals picked from the real data first** (`dist/beta/data/*.csv`), so each can be tested against
   roles that exist today. Some could be met and some could not.
4. **Timing.** "App" is the script's wall-clock time per step. It includes fixed settle waits of
   0.3–1.2 s after each action, so the app's own response is shorter. "Person" is my estimate of
   reading and deciding time for this age group; it is not measured. The load average was 0.9–2.2
   during the runs (five reviewers on 4 CPUs).
5. **What counts as broken:** a number or label that is wrong or misleading, or a dead end. Friction,
   jargon or a missing affordance is "Improve".
6. **Every Broken item was confirmed against the raw posting or the code**, not only on screen (§9).

## 4. Replayable steps

```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
node scripts/cycle/serve.mjs --dist $S/cycle-beta/dist --pid $S/persona-beta-55-plus/serve.pid &
# -> serve: http://127.0.0.1:38565/melon-seek/   (stopped at the end: kill "$(cat …/serve.pid)")
cd $S/persona-beta-55-plus
export NODE_PATH=$S/pw/node_modules
node p1.mjs; node p1b.mjs                      # Declan, Dublin (laptop)
node p2.mjs; node p2b.mjs; node p2c.mjs        # Carmen, Austin (iPhone)
node p3.mjs; node p3b.mjs                      # Rajiv, Toronto (Android)
node p4.mjs; node p4b.mjs                      # Renate, Munich (125% zoom)
node p5.mjs; node p5b.mjs; node p5c.mjs        # Henrik, Brussels (desktop)
node recheck.mjs                               # the first review's Broken items, on beta
node spell.mjs; node drop.mjs; node sort.mjs; node intern.mjs; node extra.mjs; node extra2.mjs
node throttle.mjs                              # 4x CPU + Fast 4G phone loads (Apple, Google)
python3 survey.py <dist>/beta/data             # goal picking from the CSVs (used via python3 -c)
cd /home/user/melon-seek && bash scripts/cycle/shrink-screenshots.sh docs/screenshots/persona-beta-55-plus
```

- `h.mjs` is a small helper. It loads Playwright through `createRequire(NODE_PATH)` (ESM ignores
  NODE_PATH), launches `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, and provides `open`,
  `stepper`, `cards`, `panel()` (the filter panel, which is the same `#filterBody` on desktop, in
  the 125% overlay and in the phone sheet), `switchCompany`, `search`, `openCard` and `juice`.
- "Coming back later" is a fresh browser context restored from `storageState` (same localStorage).
- One browser at a time; each script closes it.

---

## 5. The five people

### P1. Declan Byrne, 57, Dublin, Ireland: new graduate, operations (laptop 1366×768)

- **Who:** couple (wife Maura works part-time in a pharmacy; they rent in Tallaght). 35 years as an
  electrician, then a one-year Springboard+ Higher Certificate in Data Centre Facilities, finished in
  June 2026.
- **Goal:** a paid data-centre technician internship or first job near Dublin at Google, Microsoft or
  Apple, paying at least €40,000, that leaves the two of them at least €800 a month after tax, rent
  and living costs.
- **Reached? No.** The only Dublin data-centre entry role is Google's technician internship at
  €34,800, scored "0 · Rind" for a couple. The site also tells him that €34,800 is paid for 13
  weeks, which the posting doesn't say and its own Juice contradicts. Microsoft's "CE Industrial
  Controls Systems Engineer" (€63–106K) leaves $410 a month at city-centre rent; he can't enter
  his own, lower rent.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | 1.6 s (ready 0.5 s) | 30 s | "Anthropic 645", the tagline "Pay, and what's left after tax and rent, for 13 companies' open roles", "$347K median" over a chart whose header says "Median $352K", and a one-line Juice explainer above the list. He thinks the $500K jobs aren't for him. [p1-01](../screenshots/persona-beta-55-plus/p1-01-arrive.png) |
| 2 | Company menu → Google | 1.8 s | 20 s | "Big tech" is the first group; easy. [p1-02](../screenshots/persona-beta-55-plus/p1-02-menu.png), [p1-03](../screenshots/persona-beta-55-plus/p1-03-google.png) |
| 3 | Search "data centre technician" | 1.3 s | 1 min | **"0 roles … Check the spelling."** His spelling is right. [p1-04](../screenshots/persona-beta-55-plus/p1-04-search-centre.png) |
| 4 | Search "data center technician" | 1.4 s | 30 s | 102 roles. Electrical technician cards are tagged "Transformers", "TPUs", "GCP". [p1-05](../screenshots/persona-beta-55-plus/p1-05-search-center.png) |
| 5 | Location: type "Ireland", then "Dublin" | 1.8 + 2.3 s | 1 min | "Ireland" → "No matches" (though the list has an IRELAND heading); "Dublin" → 1 role, the technician intern at €34,800 · "0 · Rind". [p1-06](../screenshots/persona-beta-55-plus/p1-06-dublin.png) |
| 6 | Open the intern | 1.2 s | 2 min | "**€34,800 · EUR · for about 13 weeks · Fixed-term pay, not a yearly salary**". He reads it as €2,700 a week, more than he ever earned. [p1-07](../screenshots/persona-beta-55-plus/p1-07-drawer-intern.png) |
| 7 | Juice → Couple, Monthly, then Whole term | 2.5 + 6.9 s | 2 min | Gross **$3,320/mo**; rent −$3,260 (2-bedroom, city centre); −$2,370/mo. "Whole term" shows gross **$9,950 total**: the same drawer that says €34,800 for the term. [p1-08](../screenshots/persona-beta-55-plus/p1-08-juice-couple.png), [p1-25](../screenshots/persona-beta-55-plus/p1-25-intern-wholeterm.png) |
| 8 | Clear search, keep Dublin | 1.9 s | 1 min | 137 Google roles in Dublin; no technician besides the intern. [p1-09](../screenshots/persona-beta-55-plus/p1-09-google-dublin-all.png) |
| 9 | Switch to Microsoft | 1.6 s | 20 s | Dublin kept: 61 roles. [p1-10](../screenshots/persona-beta-55-plus/p1-10-microsoft.png) |
| 10 | Microsoft: "data centre", "data center", "datacenter", "critical environment", "controls" | 1.2–1.3 s each | 3 min | With Dublin on: 0, 0, 8 (description matches such as "Principal Cloud Networking Engineer"), 1 ("Critical Environment Senior Mechanical Engineer"), and "controls" finds "CE Industrial Controls Systems Engineer" (CE = critical environment, never spelled out). [p1-11](../screenshots/persona-beta-55-plus/p1-11-ms-critical.png), [p1-22](../screenshots/persona-beta-55-plus/p1-22-ms-controls.png) |
| 11 | Open "CE Industrial Controls Systems Engineer" | 1.3 s | 2 min | €63–106K, chip "Mid". "Same role elsewhere" says "This posting doesn't state a level" and compares Hardware & systems engineering at every level, led by Netflix $601K. [p1-23](../screenshots/persona-beta-55-plus/p1-23-ms-drawer.png) |
| 12 | Juice → Couple, Monthly | 2.4 s | 1 min | $8,060 gross, −$2,250 tax, −$3,260 rent, −$2,140 living: **$410/mo left**. Their real rent is about €1,900; there is no way to say so. [p1-24](../screenshots/persona-beta-55-plus/p1-24-ms-juice.png) |
| 13 | Apply | 0.5 s | — | "Apply on Microsoft's careers site · apply.careers.microsoft.com", new tab. |
| 14 | Save | 1.3 s | 20 s | Toast: "Saved in this browser. Find it in the company menu, with its new roles". [p1-15](../screenshots/persona-beta-55-plus/p1-15-saved.png) |
| 15 | Insights → Compare companies: Facilities, construction & data centers, Entry | 3.0 + 2.7 s | 1.5 min | Google 33 · $102K, Shield AI 3 · $59K; "Not shown: Anduril, OpenAI, xAI and Apple (don't state levels…)". [p1-17](../screenshots/persona-beta-55-plus/p1-17-compare-facilities.png), [p1-18](../screenshots/persona-beta-55-plus/p1-18-compare-entry.png) |
| 16 | Come back next day | 1.9 s | 30 s | Opens where he left off (Microsoft · Dublin, 61 roles). The menu starts with "SAVED SEARCHES · Microsoft · Dublin". [p1-19](../screenshots/persona-beta-55-plus/p1-19-return.png), [p1-20](../screenshots/persona-beta-55-plus/p1-20-return-menu.png), [p1-21](../screenshots/persona-beta-55-plus/p1-21-return-saved.png) |

Total: app about 48 s; person about 20 minutes.

### P2. Carmen Ruiz, 59, Austin, Texas, US: early career (3 years), design (iPhone)

- **Who:** family (husband Luis, retired; they are raising two grandchildren). She spent 25 years
  raising four children and caring for her mother, took a UX certificate at 55, and has worked 3
  years as a UX designer at a regional credit union.
- **Goal:** a UX or product design role (not intern, not senior) at Google, Apple, Microsoft or
  Netflix, in Austin or remote, paying at least $120K and leaving her family of four at least $2,500
  a month.
- **Reached? Yes, after a detour.** Apple's "Learning Experience Designer, WW Sales Learning &
  Development" in Austin pays $141–211K and leaves **$6,430 a month** for a family of four. Google has
  no non-senior UX role in Austin, and Microsoft's one remote US design role gets no Juice at all.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | 1.6 s (ready 0.55 s) | 40 s | "Anthro…" (truncated), the tagline, a chart, and a collapsed sheet reading "645 roles". **No job card on the screen**; scrolling moves nothing. [p2-01](../screenshots/persona-beta-55-plus/p2-01-arrive.png), [p2-02](../screenshots/persona-beta-55-plus/p2-02-scroll.png) |
| 2 | Company → Google | 1.7 s | 20 s | Big tech listed first in the sheet. [x-phone-company-menu](../screenshots/persona-beta-55-plus/x-phone-company-menu.png), [p2-03](../screenshots/persona-beta-55-plus/p2-03-google.png) |
| 3 | Search "UX designer", open the sheet | 2.8 s | 1 min | 21 roles, all Staff/Senior in Mountain View and New York. [p2-04](../screenshots/persona-beta-55-plus/p2-04-search.png) |
| 4 | Filters → Location, type "Austin" | 3.1 s | 1 min | "No matches", though Google has 187 roles in Austin; only the hint "A city also finds roles that list only its country…". She concludes Google has no Austin office. [p2-05](../screenshots/persona-beta-55-plus/p2-05-location-austin-none.png) |
| 5 | Search "user experience" | 2.1 s | 1 min | 7 roles: Google's five UX internships (Austin is one of 30 cities). "UX" never matched "User Experience". [p2-06](../screenshots/persona-beta-55-plus/p2-06-search-user-experience.png) |
| 6 | Search "designer", switch to Apple, Location → Austin | 2.0 + 2.5 + 4.9 s | 2 min | Search kept on switch: 45 roles, 9 in Austin. [p2-09](../screenshots/persona-beta-55-plus/p2-09-apple.png), [p2-10](../screenshots/persona-beta-55-plus/p2-10-apple-austin.png) |
| 7 | Open "Learning Experience Designer" | 1.3 s | 2 min | $141–211K, "Level not stated", "Pays more than 15% of Apple's roles". The "IC Designer – Power Management" (a chip designer) above it is compared with Design (UX) roles. [p2-11-lxd](../screenshots/persona-beta-55-plus/p2-11-apple-lxd.png), [p2-11-ic](../screenshots/persona-beta-55-plus/p2-11-apple-drawer.png) |
| 8 | Juice → Family, Monthly | 2.5 s | 1 min | $14,670 gross, −$2,510 tax, −$2,890 rent (3-bedroom), −$2,840 living: **$6,430/mo**, green bar, and "Family here means one earner, married and filing jointly, with two children". [p2-12](../screenshots/persona-beta-55-plus/p2-12-apple-juice-family.png) |
| 9 | Apply | 0.2 s | — | "Apply on Apple's careers site · jobs.apple.com". [p2-13](../screenshots/persona-beta-55-plus/p2-13-apply.png) |
| 10 | Back to the list | 0.8 s | 20 s | Cards are re-scored for her family ("62 · Ripe"). [p2-14](../screenshots/persona-beta-55-plus/p2-14-cards-family.png) |
| 11 | Save | 2.0 s | 20 s | "Save" has a word label in the chip row; the toast says where it lives. [p2-15](../screenshots/persona-beta-55-plus/p2-15-quickbar.png), [p2-16](../screenshots/persona-beta-55-plus/p2-16-saved.png) |
| 12 | Switch to Microsoft (designer + Austin kept) | 1.6 s | 1 min | 1 role, "Senior Product Designer · United States · Remote", $120–235K. It matches her Austin filter, but the drawer has **no Juice block and no reason**; it shows "Multiple pay zones". [p2-17](../screenshots/persona-beta-55-plus/p2-17-microsoft.png), [p2-18](../screenshots/persona-beta-55-plus/p2-18-ms-drawer.png) |
| 13 | Netflix | 3.0 s | 30 s | 4 designers: two remote US Senior roles at $210–420K. [p2-17-netflix](../screenshots/persona-beta-55-plus/p2-17-netflix.png) |
| 14 | Insights → Compare companies: Design | 4.5 s | 1 min | Netflix $365K … Palantir $132K. The Level list has no "Mid"; she can't compare at her level. [p2-20](../screenshots/persona-beta-55-plus/p2-20-compare-design.png) |
| 15 | Come back a week later | 1.9 + 1.7 + 1.2 s | 30 s | Opens on Microsoft · "designer"; the menu shows "Apple · “designer” · Austin", which restores 9 roles. [p2-21](../screenshots/persona-beta-55-plus/p2-21-return.png), [p2-22](../screenshots/persona-beta-55-plus/p2-22-return-menu.png), [p2-23](../screenshots/persona-beta-55-plus/p2-23-return-saved.png) |

Total: app about 48 s; person about 20 minutes.

### P3. Rajiv Mehta, 56, Mississauga (Toronto), Canada: mid-career (7 years), sales (Android)

- **Who:** family of four (wife and two university-age children). 20 years in banking in Mumbai,
  moved to Canada at 48, then 7 years as a B2B software account manager.
- **Goal:** an account executive or account manager role at Google, Microsoft or Netflix in Toronto,
  base at least C$120K, leaving the family at least C$2,000 a month.
- **Reached? Yes, but he has to convert the answer himself.** Google's "Account Executive, Financial
  Services" (C$172–176K base) leaves **$1,990 a month**, in US dollars. That is about C$2,750, but
  nothing on the page says so.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive, company → Google | 1.1 + 1.5 s | 40 s | As P2. |
| 2 | Filters → Location → Toronto | 3.4 s | 30 s | 32 roles. The Department list has one entry: "Google 32". |
| 3 | Salary Min "C$120,000", "CAD 120k", "120000 CAD", "C$120k" | 1.0 s each | 30 s | Every form works: "**Min: CA$120,000 ≈ $85K a year**". [p3-01](../screenshots/persona-beta-55-plus/p3-01-salary-cad.png) |
| 4 | Show roles; search "account" | 3.0 s | 1 min | 11 roles: AEs at C$156–202K, account managers at C$138–141K. [p3-02](../screenshots/persona-beta-55-plus/p3-02-results.png) |
| 5 | Open "Account Executive, Financial Services" | 1.3 s | 1.5 min | C$172–176K, "Posted base pay", "≈ $122K–125K in approx US dollars". Same role elsewhere: Google is last at $124K. [p3-03](../screenshots/persona-beta-55-plus/p3-03-drawer.png) |
| 6 | Juice → Family, Monthly | 2.6 s | 2 min | **$1,990/mo** (USD). The tax row reads "income tax $1,870 · **state or local tax** $1,140" for Ontario. [p3-04](../screenshots/persona-beta-55-plus/p3-04-juice-family.png) |
| 7 | Sort "Most juice"; Map | 1.0 + 3.5 s | 1 min | Re-scored for the family; one Toronto pin "$124K · 11". [p3-05](../screenshots/persona-beta-55-plus/p3-05-sort-juice.png), [p3-06](../screenshots/persona-beta-55-plus/p3-06-map.png) |
| 8 | Switch to Microsoft | 3.2 s | 30 s | Toast "Kept “account”, $85K+, Toronto"; 1 role. The chip reads "$85K+", not the C$120,000 he typed. [p3-07](../screenshots/persona-beta-55-plus/p3-07-microsoft.png) |
| 9 | Microsoft: "sales", "account manager", "customer success" | 3.8 + 3.2 s | 1.5 min | 6, 0, 0 (the Customer Success roles pay under his minimum). [p3-12](../screenshots/persona-beta-55-plus/p3-12-ms-sales.png) |
| 10 | Open "Senior Sales Specialist – Windows and Device Sales" | 2.7 + 2.4 s | 1.5 min | C$143–215K; Family Juice $2,150/mo. [p3-13](../screenshots/persona-beta-55-plus/p3-13-ms-drawer.png), [p3-14](../screenshots/persona-beta-55-plus/p3-14-ms-juice.png) |
| 11 | Netflix | — | 30 s | "Senior Account Manager (Canada)", C$135–185K. [p3-10](../screenshots/persona-beta-55-plus/p3-10-netflix.png) |
| 12 | Insights: Compare companies (Sales & partnerships, Senior); pay estimate "Account Executive", Toronto | 6.3 + 3.1 s | 2 min | Netflix $380K … Microsoft $148K, Google $131K. Estimate $119K, medium confidence, "**Based on 9 similar roles at Microsoft, Toronto and elsewhere in Canada**". [p3-15](../screenshots/persona-beta-55-plus/p3-15-compare-sales-senior.png), [p3-16](../screenshots/persona-beta-55-plus/p3-16-estimate.png) |
| 13 | Save on Google; come back two days later | 4.5 + 1.4 s | 30 s | Saved as "Google · “account” · **$85K+** · Toronto"; reopens there. [p3-17](../screenshots/persona-beta-55-plus/p3-17-quickbar.png), [p3-18](../screenshots/persona-beta-55-plus/p3-18-saved.png), [p3-19](../screenshots/persona-beta-55-plus/p3-19-return-menu.png) |

Total: app about 56 s; person about 20 minutes.

### P4. Dr. Renate Vogel, 61, Munich, Germany: senior/staff, research (1440 laptop at 125%)

- **Who:** single (widowed; she rents). PhD in computer architecture, 30 years in automotive embedded
  and GPU-compute research.
- **Goal:** a senior or staff research/engineering role in Munich or remote from Germany at NVIDIA
  or Google, at least €110,000, ideally part-time or a 4-day week, leaving at least €2,500 a month.
- **Reached? Partly.** Google's Munich Staff roles (€156–194K) leave **$7,360 a month**. But no
  research role in Munich lists pay, part-time can't be found, and 12 of the 13 NVIDIA "Munich" results
  show Polish pay. One of them is scored as Munich Juice from that Polish range.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | 1.5 s (ready 0.5 s) | 30 s | At 125% the Chart/Map/Insights words stay; the filter panel moves behind "Filters". Two medians next to each other: "$347K median" and "Median $352K". [p4-01](../screenshots/persona-beta-55-plus/p4-01-arrive.png) |
| 2 | Company → NVIDIA | 1.7 s | 1 min | Department rows "Engineer, Sys SW", "Mgmt, Test Eng", "Mgmt, Legal (Legal)". [p4-02](../screenshots/persona-beta-55-plus/p4-02-nvidia.png) |
| 3 | Filters: Munich, Senior + Staff+, Min "€110,000" | 1.2 + 2.4 + 1.9 + 1.2 s | 2 min | "Min: €110,000 ≈ $126K a year"; 13 roles. [p4-02b](../screenshots/persona-beta-55-plus/p4-02b-filters-open.png), [p4-03](../screenshots/persona-beta-55-plus/p4-03-filters.png) |
| 4 | Results | 0.9 s | 2 min | Stats: "13 of 2,665 roles · **8% show pay for Munich** · $123K median". The chart plots "**13 postings with salary**" (median $125K), and 12 of 13 cards show "PLN 293K–650K · Germany +4". [p4-04](../screenshots/persona-beta-55-plus/p4-04-results.png) |
| 5 | Ranges view | 1.4 s | 30 s | Titles are cut with an ellipsis; no overlap. [p4-05](../screenshots/persona-beta-55-plus/p4-05-ranges.png) |
| 6 | Open the top card; Juice monthly | 1.3 + 2.4 s | 2 min | PLN 375–650K for "Poland · Switzerland · Munich". Juice "41 · Dry · **$3,500/mo left for one person in Munich**", with "The posted salary currency differs from the local one, so it is applied as posted." [p4-06](../screenshots/persona-beta-55-plus/p4-06-drawer.png), [p4-07](../screenshots/persona-beta-55-plus/p4-07-juice.png) |
| 7 | More → Employment type; search "part-time", "part time", "Teilzeit", "flexible" | 1.4 + 8.0 s | 2 min | Employment type is "Not stated 13". All four searches give 0, with a clear "Without the search “part-time” there would be 13 roles". [p4-09](../screenshots/persona-beta-55-plus/p4-09-part-time.png) |
| 8 | Switch to Google (all filters kept) | 1.6 s | 1 min | 12 roles, "100% show pay for Munich". [p4-10](../screenshots/persona-beta-55-plus/p4-10-google.png) |
| 9 | Open "Senior Staff Software Engineer, Full Stack, CodeAI"; Juice | 1.3 + 2.4 s | 2 min | €190–194K; **$7,360/mo** left. [p4-11](../screenshots/persona-beta-55-plus/p4-11-google-drawer.png), [p4-12](../screenshots/persona-beta-55-plus/p4-12-google-juice.png) |
| 10 | Insights: estimate "Senior Research Scientist", Munich, Senior | 3.5 + 4.0 s | 1 min | "Not enough comparable roles … Remove a filter or try a broader title." Honest, but a dead end. [p4-14](../screenshots/persona-beta-55-plus/p4-14-estimate.png) |
| 11 | Compare companies: AI research & ML, Staff+ | 2.4 s | 1 min | Netflix $833K … Microsoft $209K. [p4-15](../screenshots/persona-beta-55-plus/p4-15-compare-ai-staff.png) |
| 12 | Save; come back next week | 1.7 + 1.4 + 1.8 s | 30 s | Saved as "Google · $126K+ · Senior · Staff+ **+1**": Munich, the thing she cares about, is the "+1". It reopens correctly. [p4-16](../screenshots/persona-beta-55-plus/p4-16-saved.png), [p4-17](../screenshots/persona-beta-55-plus/p4-17-return.png), [p4-18](../screenshots/persona-beta-55-plus/p4-18-return-menu.png) |

Total: app about 48 s; person about 25 minutes.

### P5. Henrik Janssens, 63, Brussels, Belgium: executive, policy (desktop 1440×900)

- **Who:** couple (wife Ann is a retired teacher). 22 years at the European Commission (last post:
  head of unit, digital policy), then 6 years as VP public affairs at a telecom trade association.
- **Goal:** a director or head of government affairs / public policy role in Brussels at a big-tech
  company or AI lab, at least €180,000 base, and to see which of the 13 companies hire policy leaders
  in Europe and what they pay.
- **Reached? Partly.** One real match: Microsoft's "Government Affairs Director" (posted for
  "Belgium", €131–221K), with no Juice because the posting names no city. Google's Brussels
  "Regulatory Counsel" (€200–205K, $5,220/mo for a couple) is a legal role. No AI lab lists a Brussels
  role, and Compare companies can't show policy at Director level.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold; search "policy" on Anthropic | 1.9 + 1.4 s | 1 min | "188 roles · 13 in title"; none in Europe. Location "Brussels", "Belgium", "Europe": No matches. [p5-01](../screenshots/persona-beta-55-plus/p5-01-arrive.png), [p5-02](../screenshots/persona-beta-55-plus/p5-02-anthropic-policy.png) |
| 2 | Switch to Microsoft (search kept) | 1.6 s | 1 min | "**627 roles · 1 in title**": the word is in boilerplate text, so after the one title match come five "Principal Product Manager" roles. |
| 3 | Search "government affairs" | 1.2 s | 1 min | 4 roles: "Government Affairs Germany – Head of Regulatory Affairs" €130–222K, "Government Affairs Director · Belgium" €131–221K, an intern and a Singapore director. |
| 4 | Open "Government Affairs Director" | 1.2 s | 2 min | Good pay block. **No Juice block and no reason** (location "Belgium" only). "Same role elsewhere": "Too few Director+ … list pay, so this compares … at every full-time level". [p5-05](../screenshots/persona-beta-55-plus/p5-05-drawer.png), [p5-06](../screenshots/persona-beta-55-plus/p5-06-no-juice.png) |
| 5 | Location → Brussels; Seniority → Director+ | 4.1 + 0.9 s | 1 min | 13 roles; the Belgium-only director is included ("A city also finds roles that list only its country"). Director+ → 1. [p5-08](../screenshots/persona-beta-55-plus/p5-08-ms-brussels.png), [p5-09](../screenshots/persona-beta-55-plus/p5-09-ms-brussels-director.png) |
| 6 | Switch to Google, OpenAI, Anthropic, Apple | 1.8–2.1 s each | 4 min | Google: "0 roles … Without the location filter there would be 46 roles". OpenAI: toast "**Dropped Brussels (not at OpenAI)**", 815 roles; Brussels then stays gone for Anthropic, Apple and Google, which do have Brussels roles. [p5-10-google](../screenshots/persona-beta-55-plus/p5-10-google.png), [p5-23](../screenshots/persona-beta-55-plus/p5-23-openai-dropped.png), [p5-10-openai](../screenshots/persona-beta-55-plus/p5-10-openai.png), [p5-10-apple](../screenshots/persona-beta-55-plus/p5-10-apple.png) |
| 7 | Google, Location → Brussels again; open "Regulatory Counsel, Content"; Juice couple monthly | 2.4 + 1.2 + 2.3 s | 2 min | 2 roles, "100% show pay for Brussels". €200–205K; **$5,220/mo**, with "Couple here means one earner, taxed as a single filer (household tax rules aren't modeled here)". [p5-19](../screenshots/persona-beta-55-plus/p5-19-google-brussels.png), [p5-20](../screenshots/persona-beta-55-plus/p5-20-google-drawer.png), [p5-21](../screenshots/persona-beta-55-plus/p5-21-google-juice.png) |
| 8 | Insights → Compare companies: Policy & government affairs | 4.8 s | 1.5 min | OpenAI 9 · $266K, Anthropic 7 · $247K, Google 37 · $183K; Microsoft left out (under 3 with pay). The Level list offers only Senior and Manager. [p5-14](../screenshots/persona-beta-55-plus/p5-14-compare-policy.png) |
| 9 | Pay estimate "Director of Public Policy" | 2.0 s | 1 min | $205K, low confidence, "mixed levels", "Few close matches, so treat this as a rough guide" (no ±%). The matches are Manager roles in SF, DC, Berlin and Paris at 15%. [p5-15](../screenshots/persona-beta-55-plus/p5-15-estimate.png) |
| 10 | Map | 3.0 s | 30 s | One Europe cluster "Dublin, London and 35 more · $98K"; he has to zoom to reach Brussels. [p5-16](../screenshots/persona-beta-55-plus/p5-16-map.png) |
| 11 | Save "Google · Brussels"; come back in a month | 1.1 + 1.5 + 1.7 + 0.8 s | 30 s | The menu lists it under "Saved searches"; it restores 2 roles. [p5-22](../screenshots/persona-beta-55-plus/p5-22-saved.png), [p5-24](../screenshots/persona-beta-55-plus/p5-24-return-menu.png), [p5-25](../screenshots/persona-beta-55-plus/p5-25-return-saved.png) |

Total: app about 46 s; person about 30 minutes.

---

## 6. What the first review called broken: status on this build

The first 55+ review (`persona-stable-55-plus.md`) listed 9 Broken items. All 9 are fixed on beta.
The re-checks were on the stable boards inside the beta build, plus the same patterns on the big-tech
boards.

| # | Then | Now | Evidence |
|---|---|---|---|
| 1 | Compstimate showed US pay as Sydney/London pay | **Fixed.** "No similar role at OpenAI in Australia lists pay, so there is no pay estimate. Pay from other countries isn't used." Toronto: "Toronto and elsewhere in Canada". | [re-01](../screenshots/persona-beta-55-plus/re-01-openai-sydney.png), [p3-16](../screenshots/persona-beta-55-plus/p3-16-estimate.png) |
| 2 | Anduril Sydney pin "$61K" from US contractor pay | **Fixed.** "56 of 2,491 roles · 0% show pay for Sydney"; the Sydney cluster has no price. | [re-02](../screenshots/persona-beta-55-plus/re-02-anduril-sydney-map.png) |
| 3 | "Most juice" and cards used the best city, not the filtered one | **Fixed.** DC + Reston, Family: the top card's Juice is "$9,450/mo … in Reston". Toronto, Austin, Munich and Brussels all scored for the filtered city. | [re-03](../screenshots/persona-beta-55-plus/re-03-anduril-dc-juice.png), [re-04](../screenshots/persona-beta-55-plus/re-04-anduril-dc-drawer.png) |
| 4 | Salary box silently dropped "£70,000", "A$350k", "70000" | **Fixed.** £, €, C$, CAD and "k" all convert, with a note ("Min: £70,000 ≈ $94K a year"); "70000" is kept. | [p3-01](../screenshots/persona-beta-55-plus/p3-01-salary-cad.png), [p4-03](../screenshots/persona-beta-55-plus/p4-03-filters.png) |
| 5 | Victoria, BC filed under Australia | **Fixed.** "Victoria" is under CANADA (36); "Australia" has no Cohere match. | `recheck.mjs` B5 |
| 6 | Compare companies mixed internships with full-time pay | **Fixed.** A Level choice, and "Internships, fixed-term programmes and on-target earnings … are left out". | [p1-18](../screenshots/persona-beta-55-plus/p1-18-compare-entry.png), [p3-15](../screenshots/persona-beta-55-plus/p3-15-compare-sales-senior.png) |
| 7 | Methodology headline overstated rent freshness | **Fixed.** Separate rows: 1-bedroom "May–October 2026"; 2–3 bedroom "October 2025 in US cities". But "update due" still appears on four rows (see Improve 14). | [re-07](../screenshots/persona-beta-55-plus/re-07-methodology.png) |
| 8 | Ranges: title ran into the pay | **Fixed.** Titles end with an ellipsis. | [p4-05](../screenshots/persona-beta-55-plus/p4-05-ranges.png) |
| 9 | "≈ $44K–44K", "Revenue · Revenue" | **Fixed.** "CA$83K · Annualized from hourly pay (40 CAD/hour) · Single figure · ≈ $59K"; the department is printed once. | [re-05](../screenshots/persona-beta-55-plus/re-05-cohere-annotation.png), [re-06](../screenshots/persona-beta-55-plus/re-06-cohere-ae.png) |

Also re-checked from the other four groups' Broken lists:
- **On-target earnings:** "On-target earnings" tag on Anthropic's sales heads, and left out of Compare companies. Fixed ([p5-10-anthropic](../screenshots/persona-beta-55-plus/p5-10-anthropic.png)).
- **"intern" matched "International"/"Internal":** fixed (Microsoft: 80 roles, 0 Internal/International titles in the first 80).
- **"Couple" assumed a married couple without saying so:** fixed (the tax row now says so in plain words).
- **"Same role elsewhere" fell back silently:** fixed (it says what it compares instead and why).
- **Sort ignored while searching:** fixed ("Newest" and "Highest pay" are honoured with a search on).
- **"Mid" shown as fact:** fixed ("Level not stated").

The first review's Improve list: 9 of 14 are done or mostly done:
- filters kept on switch;
- plain level words;
- 125% zoom labels;
- findable saved searches, with the last view reopened;
- a city that also finds country-wide postings;
- cards that show the matched place first ("Munich, Bavaria +2");
- Juice pattern fills and a green "Juice left" bar;
- empty states that name the filter to remove;
- the on-target earnings label.

Still open: **Juice in the person's own terms** (their currency, their rent or home, a home city for
remote work), **part-time**, **Juice at both ends of a wide range**, and the **phone's first
screen**. The fixed-term label now exists, but it is wrong for yearly-quoted pay (Broken 1).

---

## 7. Findings for the group

P1 Declan (Dublin), P2 Carmen (Austin, iPhone), P3 Rajiv (Toronto, Android), P4 Renate (Munich, 125%),
P5 Henrik (Brussels). Screenshots are under `docs/screenshots/persona-beta-55-plus/`.

### 7.1 Broken, fix now

1. **Yearly intern pay is shown as the pay for the whole internship, and the drawer then
   contradicts itself.** Google's Dublin "Data Center Facilities Technician Intern" reads
   "€34,800 · EUR · for about 13 weeks · Fixed-term pay, not a yearly salary". The posting says only
   "Ireland: €34800 (EUR)", Google's usual yearly rate. The Juice in the same drawer treats it as
   yearly: gross $3,320 a month, and "Whole term" gross **$9,950 total**, a quarter of the €34,800
   "for 13 weeks" above it. Microsoft's Toronto "Critical Environment Ops INTERN" is worse. It says
   "CA$43,800–50,000 · for about 26 weeks · Fixed-term pay, not a yearly salary (as posted:
   CAD $43,800 - CAD $50,000 per year)": the quoted posting says "per year" in the same line. This
   affects every fixed-term posting whose pay was posted yearly: 24 in the stored snapshots (Google 20,
   Microsoft 4). Hourly and monthly ones ("$20–71/hour for about 12 weeks") are right.
   P1 · drawer pay block, card pay tooltip · [p1-07](../screenshots/persona-beta-55-plus/p1-07-drawer-intern.png),
   [p1-25](../screenshots/persona-beta-55-plus/p1-25-intern-wholeterm.png),
   [x-ms-intern-per-year](../screenshots/persona-beta-55-plus/x-ms-intern-per-year.png) ·
   `public/app.js` `postedTerm()` (line 134: with no `originalInterval` the factor is 1, so the yearly
   figure becomes the term's total), the "Fixed-term pay, not a yearly salary" line (line 3380), and the
   card tooltip (line 2875).
2. **British spellings are a dead end, and the site blames the spelling.** "data centre" gives 0 roles
   at Google, against 281 for "data center". "defence" gives 0 at Anduril, against 1,571 for "defense".
   "programme manager" 0 vs 413, "organisation" 0 vs 7, "colour" 0 vs 2. Each says "No roles match …
   Check the spelling". That is every English speaker outside the US: Declan concluded Google had no
   data-centre jobs. P1 (hit); P3, P4, P5 write British English · search box, empty state ·
   [p1-04](../screenshots/persona-beta-55-plus/p1-04-search-centre.png) · `public/app.js`
   `queryMatchers()` (line 541) and `titleMatch()`.
3. **With a location filter, the chart, the cards, the pay filter and Juice still use another
   country's pay, and so contradict the stats line.** NVIDIA, Munich, Senior/Staff+, Min €110,000:
   - the stats line says "13 of 2,665 roles · **8% show pay for Munich**";
   - the chart says "**13 postings with salary**", with median $125K;
   - 12 of the 13 cards show Polish ranges ("PLN 293K–650K · Germany +4"), and all of them passed the
     €110,000 minimum on that Polish pay;
   - the top card's Juice is computed for Munich from the Polish range ("$3,500/mo left for one
     person in Munich"), explained only by "The posted salary currency differs from the local one,
     so it is applied as posted".

   The P-6 rule (pay counts only where it applies, `payLocations`) reaches the stats line, Insights,
   the map and Compstimate, but not these four. The Juice part is narrow (about 10–20 postings whose
   only Juice city is in another currency's country). The chart, card and filter part affects every
   multi-country posting.
   P4 · results, chart, drawer · [p4-04](../screenshots/persona-beta-55-plus/p4-04-results.png),
   [p4-07](../screenshots/persona-beta-55-plus/p4-07-juice.png) · `public/viz/chart.js` (no
   `payLocations`), `public/app.js` `failures()` (salary test, line 621) and `juiceBadge()` /
   `shownJuice()`, `server/juice.js` `attachJuice()` (the `currencyMismatch` fallback, line 1475).

### 7.2 Improve (ranked by how many of the 5 it would help)

1. **(5/5) Juice in the person's own terms.** Show it in the posting's currency (€, C$) next to the
   USD. Let people say "my rent is …", "I own my home" or "outside the centre". `juice.js` already
   supports `rent: 'outside'` and `rentOverrides`, but the drawer has no way to set them. Give remote
   and country-only postings a city: "United States · Remote" and "Belgium" get no Juice block and no
   reason. Declan's $410/mo is based on a $3,260 city-centre flat he doesn't rent. Rajiv's goal is in
   C$. Carmen's remote role and Henrik's director role have no Juice. Inside §8 this all goes in the
   drawer's Juice block. [p1-24](../screenshots/persona-beta-55-plus/p1-24-ms-juice.png),
   [p3-04](../screenshots/persona-beta-55-plus/p3-04-juice-family.png),
   [p2-18](../screenshots/persona-beta-55-plus/p2-18-ms-drawer.png),
   [p5-06](../screenshots/persona-beta-55-plus/p5-06-no-juice.png) · `public/app.js` `juiceBlock()`,
   `server/juice.js` `attachJuice()` (country-only locations), `public/api.js`.
2. **(5/5) One median per screen, or say what each one covers.** On arrival, "$347K median" sits
   above a chart headed "Median $352K": the stats line leaves out on-target earnings and the chart
   doesn't. NVIDIA Munich shows $123K vs $125K. Nobody can tell which to trust.
   [p1-01](../screenshots/persona-beta-55-plus/p1-01-arrive.png),
   [p4-01](../screenshots/persona-beta-55-plus/p4-01-arrive.png) · `public/app.js` `stats()`,
   `public/viz/chart.js` (line 406).
3. **(5/5) The last jargon:**
   - **Departments:** the Eightfold department codes ("Engineer, Sys SW", "Mgmt, Test Eng",
     "Account Mgr, Dev Relations", "Solution Area Specialists"), and Google's Department filter,
     which only lists "Google / DeepMind / YouTube".
   - **Tags and labels:** "TPUs", "GCP" and "Transformers" tags on electrical-technician cards; the
     "CE" abbreviation in Microsoft titles; "Multiple pay zones" and "Single figure" (tooltips don't
     show on phones); "Clusters / Ranges"; "Rind".
   - **Tax rows:** "state or local tax" for Ontario and Brussels; "provincial" or "regional" would fit.

   [p4-02](../screenshots/persona-beta-55-plus/p4-02-nvidia.png),
   [p1-05](../screenshots/persona-beta-55-plus/p1-05-search-center.png),
   [p2-18](../screenshots/persona-beta-55-plus/p2-18-ms-drawer.png),
   [p3-04](../screenshots/persona-beta-55-plus/p3-04-juice-family.png) · `server/normalize.js`
   (department), `server/sources/` (Eightfold, Google), `server/keywords.js` (tags), `public/app.js`
   (`payLabels`, `taxParts` labels).
4. **(5/5, small) "On-site" counts the same as "Any".** Remote: "Any 2,298 · Remote 312 · On-site
   2,298" (Google: 3,417 / 61 / 3,417), because a remote-eligible role with an office counts as
   on-site. Label it "Has an office" or count the roles that aren't remote.
   [x-ms-remote-counts](../screenshots/persona-beta-55-plus/x-ms-remote-counts.png),
   [p5-14](../screenshots/persona-beta-55-plus/p5-14-compare-policy.png) · `public/app.js` (Remote
   segment, line 1854).
5. **(4/5) Land beta visitors on what the beta is for.** P1–P4 each wanted a big-tech board first.
   They landed on "Anthropic 645" (on phones "Anthro…") and had to discover the company button. On a
   first visit to `/beta/`, open the company menu (Big tech is already its first group) or start on a
   big-tech board. Return visits already reopen the last view.
   [p1-01](../screenshots/persona-beta-55-plus/p1-01-arrive.png),
   [p2-01](../screenshots/persona-beta-55-plus/p2-01-arrive.png) · `public/app.js` (`DEFAULTS.c`, first
   visit).
6. **(3/5) Search that understands people's words.** Beyond Broken 2:
   - "UX" never matches "User Experience" (Carmen).
   - "CE" is Microsoft's "critical environment" (Declan).
   - Description boilerplate floods results: "policy" matches 627 Microsoft roles with 1 in the
     title, then lists Principal PMs (Henrik).
   - "datacenter" and "data center" find different roles.

   Rank title matches and skip boilerplate sections. P1, P2, P5 ·
   [p2-06](../screenshots/persona-beta-55-plus/p2-06-search-user-experience.png),
   [p1-11b](../screenshots/persona-beta-55-plus/p1-11b-ms-data-center.png) · `public/app.js`
   `queryMatchers()`, `server/keywords.js`.
7. **(3/5) Typing a country in Location finds nothing.** "Ireland" and "Belgium" give "No matches"
   although the list groups Dublin under IRELAND and Brussels under BELGIUM. On NVIDIA, "Germany" finds
   only the 43 country-only postings, not Munich or Berlin. Let a country search list its cities.
   P1, P4, P5 · [p1-06](../screenshots/persona-beta-55-plus/p1-06-dublin.png) · `public/app.js`
   `makeChecklist()` (search).
8. **(3/5) Keep a place when the next board doesn't have it.** Switching to OpenAI dropped Brussels
   with a 4.5 s toast, and it stayed gone for Anthropic, Apple and Google, which have Brussels roles.
   Keep the filter and use the existing empty state ("Without the location filter there would be 46
   roles"), as Google already does. Anyone comparing a non-US city across boards hits this.
   P5 (hit); P1 and P4 would at OpenAI or Netflix ·
   [p5-23](../screenshots/persona-beta-55-plus/p5-23-openai-dropped.png),
   [p5-10-google](../screenshots/persona-beta-55-plus/p5-10-google.png) · `public/app.js`
   `settleKeep()` (line 1179).
9. **(2/5) Keep the currency people typed.** After "C$120,000" the chip and the saved name say
   "$85K+"; after "€110,000" they say "$126K+". Renate's saved search "Google · $126K+ · Senior ·
   Staff+ +1" hides Munich behind "+1": put the place first. P3, P4 ·
   [p3-17](../screenshots/persona-beta-55-plus/p3-17-quickbar.png),
   [p4-18](../screenshots/persona-beta-55-plus/p4-18-return-menu.png) · `public/app.js`
   `quickLabel('salary')`, `searchName()` (line 1402).
10. **(2/5) The phone's first screen shows no job.** The sheet is collapsed to "645 roles", the page
    doesn't scroll, the company name is "Anthro…" and the search hint is cut ("Search titles, t").
    Peek the first card above the sheet. P2, P3 ·
    [p2-01](../screenshots/persona-beta-55-plus/p2-01-arrive.png),
    [p2-02](../screenshots/persona-beta-55-plus/p2-02-scroll.png) · `public/styles.css`,
    `public/app.js` (sheet).
11. **(2/5) "Same role elsewhere" family and level.**
    - Apple's "IC Designer – Power Management" (chips) is compared with Design (UX) roles.
    - Microsoft's "CE Industrial Controls Systems Engineer" shows "Mid", yet the comparison says it
      "doesn't state a level" and compares Hardware & systems at every level, led by Netflix $601K.

    P1, P2 · [p2-11-ic](../screenshots/persona-beta-55-plus/p2-11-apple-drawer.png),
    [p1-23](../screenshots/persona-beta-55-plus/p1-23-ms-drawer.png) · `public/features/roles.js`,
    `public/features/comps.js`.
12. **(2/5) Say why a level is missing in Compare companies.** Design has no "Mid" (Carmen), and
    Policy has no "Director+" (Henrik); add a line like the existing "Not shown: …".
    [p2-20](../screenshots/persona-beta-55-plus/p2-20-compare-design.png),
    [p5-14](../screenshots/persona-beta-55-plus/p5-14-compare-policy.png) · `public/features/comps.js`.
13. **(1/5) Part-time and reduced hours.** Employment type is "Not stated" or "Full-time", and
    "part-time", "Teilzeit" and "flexible" give 0. The empty state is now good. P4 ·
    [p4-09](../screenshots/persona-beta-55-plus/p4-09-part-time.png) · `server/normalize.js`
    (`employmentType`).
14. **(1/5) Small honesty gaps.**
    - Location "No matches" for Austin should say "No UX roles in Austin; Google has 187 there" (P2,
      [p2-05](../screenshots/persona-beta-55-plus/p2-05-location-austin-none.png)).
    - A Santa Clara posting's Juice says "in San Jose" without saying it is the nearest city with
      data (`entry.proxy` is set but not shown).
    - The methodology page still shows "update due" on four rows
      ([re-07](../screenshots/persona-beta-55-plus/re-07-methodology.png)).

    `public/app.js` (`makeChecklist`, `juiceBlock`), `scripts/methodology.js`.

### 7.3 Good (keep)

1. **Filters, search and level carry across company switches, with a toast saying what was kept.**
   Dublin went from Google to Microsoft, "designer" + Austin from Apple to Microsoft, Munich + levels +
   €110K from NVIDIA to Google, and "Kept “account”, $85K+, Toronto". P1, P2, P3, P4 ·
   [p1-10](../screenshots/persona-beta-55-plus/p1-10-microsoft.png),
   [p4-10](../screenshots/persona-beta-55-plus/p4-10-google.png).
2. **The salary box reads people's money.** "C$120,000", "CAD 120k", "€110,000" and "£70,000" all
   work and say the conversion: "Min: CA$120,000 ≈ $85K a year". P3, P4 ·
   [p3-01](../screenshots/persona-beta-55-plus/p3-01-salary-cad.png).
3. **Juice for the filtered place and the chosen household.** The household is remembered and the cards
   re-score. Plain tax sentences ("one earner, taxed as a single filer"), a green "Juice left" bar, and
   rows that add up. Carmen got "$6,430/mo for a family of four in Austin" in one tap. P2, P3, P4, P5 ·
   [p2-12](../screenshots/persona-beta-55-plus/p2-12-apple-juice-family.png),
   [p5-21](../screenshots/persona-beta-55-plus/p5-21-google-juice.png).
4. **Estimates that admit their limits.** "No similar role at OpenAI in Australia lists pay … Pay from
   other countries isn't used"; "Toronto and elsewhere in Canada"; "Few close matches, so treat this
   as a rough guide", with no ±% at low confidence. P3, P5 ·
   [re-01](../screenshots/persona-beta-55-plus/re-01-openai-sydney.png),
   [p3-16](../screenshots/persona-beta-55-plus/p3-16-estimate.png),
   [p5-15](../screenshots/persona-beta-55-plus/p5-15-estimate.png).
5. **Coming back works.** It reopens the last company and filters. "Saved searches" heads the company
   menu with plain names ("Apple · “designer” · Austin"). Save has a word label on phones, and the toast
   says where saves live. 5/5 · [p1-20](../screenshots/persona-beta-55-plus/p1-20-return-menu.png),
   [p2-22](../screenshots/persona-beta-55-plus/p2-22-return-menu.png),
   [p5-24](../screenshots/persona-beta-55-plus/p5-24-return-menu.png).
6. **Empty states that name the fix.** "Without the search “part-time” there would be 13 roles ·
   Remove the search"; "Without the location filter there would be 46 roles". P4, P5 ·
   [p4-09](../screenshots/persona-beta-55-plus/p4-09-part-time.png),
   [p5-10-google](../screenshots/persona-beta-55-plus/p5-10-google.png).
7. **Plain words where it matters most:**
   - the one-line tagline, and the Juice explainer above the list ("Juicy: $96K or more a year …");
   - "87% show pay", "half between $287K and $402K", "Level not stated";
   - the Seniority definitions ("Staff+ means staff, principal and above…"), "Always-open posting";
   - "Big tech / More companies" in the menu, and "Apply on Apple's careers site · jobs.apple.com".

   5/5 · [p1-01](../screenshots/persona-beta-55-plus/p1-01-arrive.png),
   [p2-05](../screenshots/persona-beta-55-plus/p2-05-location-austin-none.png),
   [x-phone-company-menu](../screenshots/persona-beta-55-plus/x-phone-company-menu.png).
8. **A city finds country-wide postings.** Microsoft's "United States · Remote" designer appears under
   Austin, and its "Belgium" director under Brussels. P2, P5 ·
   [p2-17](../screenshots/persona-beta-55-plus/p2-17-microsoft.png),
   [p5-08](../screenshots/persona-beta-55-plus/p5-08-ms-brussels.png).
9. **Compare companies and "Same role elsewhere" with a level and honest exclusions.** "Not shown:
   OpenAI, xAI, Cohere and Shield AI (don't state levels for most of these roles)"; "Pay is from every
   location each company lists". P1, P3, P4, P5 ·
   [p3-15](../screenshots/persona-beta-55-plus/p3-15-compare-sales-senior.png),
   [p4-15](../screenshots/persona-beta-55-plus/p4-15-compare-ai-staff.png).
10. **Speed, even with 14,000 big-tech postings.** Ready in 0.5–0.9 s on desktop, and company switches
    in under 2 s. Throttled phone (4× CPU, Fast 4G): Apple's first card at 3.4 s, Google's at 3.5 s
    (load 1.2–1.9), against 4.1 / 3.9 s in perf-mobile-beta.md. Insights on Apple ready 2.0 s after
    the tap. 5/5 · [x-throttled-apple-insights](../screenshots/persona-beta-55-plus/x-throttled-apple-insights.png).
11. **The Apply button.** It is big, names the company's own careers site and host, and opens a new
    tab. 5/5 · [p2-13](../screenshots/persona-beta-55-plus/p2-13-apply.png).
12. **125% zoom keeps its words** (Chart, Map, Insights; Filters in an overlay). P4 ·
    [p4-01](../screenshots/persona-beta-55-plus/p4-01-arrive.png).

## 8. Verification

- 5 personas, each run end to end in Chromium (13 scripts). Each saved a search, and each return in a
  fresh context reopened the last view and listed the saved search.
- Broken 1: the raw Google posting text ("Ireland: €34800 (EUR) + 0% bonus target … a 13 week
  full-time internship"; `salary.interval: 'year'`, `termWeeks: 13`, no `originalInterval`). The
  Microsoft posting text says "per year". Count: 20 Google + 4 Microsoft fixed-term postings with no
  `originalInterval` in `data/beta/snapshots/` (Netflix and NVIDIA ones are hourly and display
  correctly). Code path: `postedTerm()` in `public/app.js`.
- Broken 2: `spell.mjs`, on 4 boards, both spellings each.
- Broken 3: the Munich screen, plus `server/juice.js` `attachJuice()` (it scores all matched cities
  with `currencyMismatch` when none uses the salary's currency) and `payLocations()` in
  `public/features/shared.js`. A CSV scan found about 18 paid postings whose only Juice cities are in
  another currency's country (a few are false positives, such as Melbourne, FL).
- Improve 2: `stats()` (on-target earnings left out) vs the chart's median; Improve 8: `drop.mjs`
  (Google → OpenAI → Google keeps Brussels dropped).
- Throttled timing: `throttle.mjs` (CDP CPU ×4, 165 ms RTT, 1.01 MB/s), one run each, load 1.2–1.9.
- Screenshots: 114 PNGs, shrunk 23.0 → 5.9 MB.

## 9. Known gaps and follow-ups

- "N new since your last visit" could not be shown again: this build's beta ledger is empty
  (`api/history/*.json` = `{}`, `meta.history.runs` 0), and a backdated saved search counted nothing
  new. Re-test on a build with a ledger.
- Live fetch and map tiles are unreachable in this sandbox, and were not judged.
- The person-time column is an estimate. App times include fixed settle waits and were taken under
  load (0.9–2.2).
- Not tested: dark mode, a screen reader, a real drag on the salary slider, Slow 4G.
- The fixed-term count (24) is from the stored norm-6 snapshots; the build re-derives norm-7, so the
  built count may differ slightly (the lead's batch-2 note says 46 beta postings have `termWeeks`).

## 10. Change log

- 2026-10-11: First run on the lead's `cycle-beta/dist` (commit 83023f5). 114 screenshots, shrunk with
  `scripts/cycle/shrink-screenshots.sh`.
