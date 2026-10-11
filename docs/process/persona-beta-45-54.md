# Process log: persona-beta-45-54

Usability review of the **beta** site (`/melon-seek/beta/`) by five job seekers aged 45–54, one per
career level, done in a real browser on today's real snapshot (big-tech boards 10 Oct, the AI boards
11 Oct 2026). This is the second persona review; the first one, on the main site, is
[persona-stable-45-54.md](persona-stable-45-54.md). §4.4 says which of its Broken items are now fixed.

## 1. Brief

- Prompt: [`docs/process/prompts/persona-beta-45-54.md`](prompts/persona-beta-45-54.md) (verbatim).
- Goal: judge the beta site as a job seeker would, not as an engineer. Each person arrives cold, looks
  for roles that fit, judges pay and Juice for their own city and household, compares companies and
  levels, opens a job, applies, saves a search and comes back.
- Files owned: this file, the prompt file, and `docs/screenshots/persona-beta-45-54/` (93 PNGs).
  No product code was edited. Nothing was committed or pushed.

## 2. Inputs and sources

- `README.md`; `docs/strategy/ROADMAP.md` §8 (the UI simplicity budget). Every Improve item below
  fits the budget: none adds a top-level mode, a main-view control or a card row.
- `docs/process/persona-stable-*.md` (the first review) and `docs/process/lead.md` (the two persona fix
  waves and the two beta fix waves since).
- `docs/process/perf-mobile-beta.md` for the clean timings.
- The lead's build at `<scratchpad>/cycle-beta/dist` (commit 83023f5, built 2026-10-11T03:03Z), served
  with `scripts/cycle/serve.mjs`. 13 boards, 19,198 postings, 12,851 with pay.
- To check what I saw on screen against the data, I read `dist/beta/data/*.csv`, `dist/beta/api/jobs/*.json`
  (packed lists), `dist/beta/api/desc/**` and `dist/beta/api/cities.json`. I also ran
  `roleFamily()` from `public/features/roles.js` over the CSVs, and read the code paths named under
  "owner".

Not reported, as the lead asked: the badge falling back to the bundled snapshot ("Live fetch failed …
CORS") and the grey map tiles ("Basemap unavailable · pins still work").

## 3. The five people

| # | Person | Age, city | Household | Field, level | Device, locale | Why big tech |
|---|---|---|---|---|---|---|
| 1 | **Maggie Byrne** | 49, Dublin, Ireland | Family: husband (self-employed carpenter, irregular income) and two teenagers | Research (data). A nurse for 22 years; has just finished an MSc in Data Analytics. **New graduate.** | **Phone** 390×844, en-IE | Google, Microsoft and Apple are Dublin's big employers |
| 2 | **Darnell Brooks** | 51, Seattle, WA, US | Couple (wife teaches part-time) | Operations. 24 years of US Army logistics, then 3 years as a supply-chain analyst at a regional retailer. **Early career** in industry. | Desktop at **125% browser zoom** (reading glasses), en-US | Microsoft in Redmond |
| 3 | **Sabine Wolff** | 47, Munich, Germany | Single parent of two (12 and 15) | Design. 8 years as a UX designer at an automotive supplier. **Mid-career.** Wants 4 days a week if possible. | **Phone** 390×844, **de-DE** | Google, Apple and NVIDIA have Munich offices |
| 4 | **Anil Mehta** | 53, San Jose, CA, US | Family: wife and two children in high school | Engineering. 25 years in ASIC design verification; laid off from a chip company. **Staff level.** | Desktop 1440×900, en-US | NVIDIA and Apple in Santa Clara and Cupertino |
| 5 | **Kate Ashworth** | 54, London, UK | Couple (husband semi-retired, children grown) | Policy. 25 years in the UK civil service, latterly Deputy Director for AI policy. **Director level.** | Desktop 1440×900, en-GB | Google and Microsoft government affairs, against the AI labs |

Four countries (Ireland, US, Germany, UK). Two people on a phone, one at 125% zoom. Browser locale and
time zone match each person's city.

How to read the timings: **page** is the measured wall time in the browser until the screen settled
(localhost, no throttling), with the load average at the time; "no wait" means a step I did not time
because nothing visibly waited. **≈ human** is my estimate of how
long a 45–54-year-old would take to read, decide and act. Nothing was slow: every page wait was under
1 s, well inside the clean figures in perf-mobile-beta.md.

### 3.1 Maggie Byrne: new graduate, Dublin, phone

**Goal:** "A graduate, intern or entry-level data or research analyst job in Dublin paying at least
€50,000 that leaves our family at least €500 a month after tax, rent and living costs."

**Reached it? Partly, and not on numbers she can trust.** Google's *Business Data Scientist, gTech*
and *Engineering Analyst, AI Answers* (both €90–92K, Dublin) clear her pay floor, but neither states a
level, and the drawer lists "3 years of experience" and "4 years of experience" one after the other
because Google's minimum and preferred lists are merged. The entry-level Google roles pay €47–78K. For
€91K the site says **−$630 a month** for a family of four in Dublin, in US dollars, assuming one earner
and a city-centre 3-bedroom ($3,740/mo). She can't add her husband's income or her real rent
(€2,400 in Swords), so she can't check her €500 test.

| Step | What she did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Arrives cold. Reads "melon·seek · Pay, and what's left after tax and rent, for 13 companies' open roles", sees "Anthro…" and "$347K median". Understands it's about pay; doesn't see that big tech is here. [p1-01](../screenshots/persona-beta-45-54/p1-01-arrive-phone.png) | first chart row 0.60 s, first card 0.67 s (load 0.96) | 15 s |
| 2 | Opens the company menu: **Big tech** listed first (Google, Microsoft, Apple, Netflix, NVIDIA). [p1-02](../screenshots/persona-beta-45-54/p1-02-company-menu-phone.png) | no wait | 10 s |
| 3 | Closes it and searches "data scientist Dublin" on Anthropic: **0 roles**, "Check the spelling". Nothing says Google has 137 roles in Dublin. Dead end. [p1-03](../screenshots/persona-beta-45-54/p1-03-search-data-dublin-anthropic.png) | 0.9 s | 30 s |
| 4 | Tries "Dublin" (9 at Anthropic), then switches to Google; the search is kept: 137 roles. The chart groups them as "Google 134 · YouTube 3" and the median is in US dollars while every card is in euros. [p1-05](../screenshots/persona-beta-45-54/p1-05-google-dublin-list.png) | switch 0.4 s | 1 min |
| 5 | Filters sheet → Seniority, with plain definitions. Intern + Entry: 16 roles, €34.8K–86K. "Student Researcher Program Manager" is filed as Intern. [p1-06](../screenshots/persona-beta-45-54/p1-06-seniority-popover.png), [p1-07](../screenshots/persona-beta-45-54/p1-07-intern-entry-dublin.png) | no wait | 2 min |
| 6 | Resets, sets Location → Dublin (typing "Dubl" also offers "Dublinas", a Google typo) and searches "data": 13 roles, "6 in title". [p1-09](../screenshots/persona-beta-45-54/p1-09-location-search-dublin.png), [p1-10](../screenshots/persona-beta-45-54/p1-10-dublin-data.png) | no wait | 1 min |
| 7 | Opens *Business Data Scientist*: €90K–92K, "Pays more than 10% of Google's roles that show pay", and "Same role elsewhere" ranks Netflix $448K and OpenAI $365K above it, all US pay. [p1-11](../screenshots/persona-beta-45-54/p1-11-bds-drawer.png) | drawer 0.21 s | 2 min |
| 8 | Juice → Family → Monthly: **−$630/mo**, "one earner, married and filing jointly". [p1-13](../screenshots/persona-beta-45-54/p1-13-juice-family-monthly.png) | no wait | 2 min |
| 9 | "About the role": the merged qualifications list. [p1-15](../screenshots/persona-beta-45-54/p1-15-about-role.png) | no wait | 2 min |
| 10 | Switches to Microsoft (search and Dublin kept): 4 roles, €63–106K, all "Rind" for her family. [p1-14](../screenshots/persona-beta-45-54/p1-14-microsoft-dublin.png) | 0.44 s | 1 min |
| 11 | Back on Google, taps **Apply on Google's careers site**: a new tab opens the posting. | no wait | 10 s |
| 12 | Taps **Save**: "Saved in this browser. Find it in the company menu, with its new roles". [p1-16](../screenshots/persona-beta-45-54/p1-16-save-dialog.png) | no wait | 10 s |
| 13 | Insights → Pay estimate for "Data Scientist", Entry, Dublin: "Not enough comparable roles" (honest), in USD. [p1-18](../screenshots/persona-beta-45-54/p1-18-estimate-entry-ds.png) | 0.37 s | 1 min |
| 14 | Comes back the next day: "Reopened where you left off: Google · "data" · Dublin"; the saved search is at the top of the company menu. The toast covers the menu. [p1-21](../screenshots/persona-beta-45-54/p1-21-return-menu.png) | 0.78 s | 20 s |
| 15 | Map: one pin "Dublin, London and 12 more · $88K · 137" and one "Mountain View, New York and 3 more · $209K". [p1-22](../screenshots/persona-beta-45-54/p1-22-map-dublin.png) | — | 30 s |

About 15 minutes of her time; none of it waiting.

### 3.2 Darnell Brooks: early career, Seattle, desktop at 125% zoom

**Goal:** "A supply-chain, logistics or operations program role at Microsoft or another big employer
near Seattle, paying at least $120K base, that leaves my wife and me at least $3,000 a month."

**Reached it? Yes, on paper.** Microsoft's *Supply Chain Program Manager* in Redmond posts
$97.6K–188.4K; at the midpoint ($143K) the site leaves a couple **$3,610 a month**. He can't see what is
left at the bottom of the range, where a new hire with 3 years in industry is likely to start, and the
drawer doesn't say which of Microsoft's "pay zones" Redmond is in. Compare companies led him to
Anthropic's Seattle procurement roles ($190–230K), which he would not have found otherwise.

| Step | What he did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Arrives cold at 125% zoom: the layout holds (filters sidebar folds away, cards readable). The stats line says "$347K median"; the chart right under it says "Median $352K". [p2-01](../screenshots/persona-beta-45-54/p2-01-arrive-125zoom.png) | first card 0.61 s (load 1.6) | 20 s |
| 2 | Company menu → Microsoft (2,298 roles). [p2-03](../screenshots/persona-beta-45-54/p2-03-microsoft.png) | 0.47 s | 15 s |
| 3 | Location → Redmond (974), Seattle. "Bell" for Bellevue: "No matches" (Microsoft lists none). [p2-05](../screenshots/persona-beta-45-54/p2-05-location-picked.png) | — | 1 min |
| 4 | Searches "supply chain": **170 roles · 8 in title**. After the 8, the list and chart are other roles that mention supply chain somewhere (*Director of Creative Production*, *Principal AI Systems Architect*). "Evals" is a tag on *Senior Program Manager - Field Repair*. [p2-07](../screenshots/persona-beta-45-54/p2-07-supply-chain-redmond.png) | 0.62 s | 2 min |
| 5 | Opens *Supply Chain Program Manager*: "Senior" (from "IC4" in the posting, which the drawer doesn't say), "Multiple pay zones" (tooltip only; the posting has a separate SF/NYC range). [p2-08](../screenshots/persona-beta-45-54/p2-08-scpm-drawer.png) | drawer 0.22 s | 2 min |
| 6 | Juice → Couple → Monthly: **$3,610/mo left**, graded "42 · Dry" although it meets his goal. [p2-09](../screenshots/persona-beta-45-54/p2-09-juice-couple-redmond.png) | no wait | 2 min |
| 7 | Insights: the Pay estimate opens on "Software Engineer" ("the most common role in your filters", because of the description matches). He types "Supply Chain Program Manager": $143K, high confidence, Low $117K, High $188K. [p2-10](../screenshots/persona-beta-45-54/p2-10-insights.png), [p2-11](../screenshots/persona-beta-45-54/p2-11-estimate-scpm.png) | 0.35 s | 3 min |
| 8 | Compare companies → Supply chain & procurement: Anthropic $362K first, Microsoft $143K. Clicks Anthropic: it switches with the search, places and family kept; 4 Seattle roles at $190–230K. [p2-12](../screenshots/persona-beta-45-54/p2-12-compare-supply-chain.png), [p2-14](../screenshots/persona-beta-45-54/p2-14-anthropic-supply-redmond.png) | under 1 s | 3 min |
| 9 | Back on Microsoft, Group: Seniority: Mid $152K, Senior $160K, Staff+ $209K. [p2-16](../screenshots/persona-beta-45-54/p2-16-group-seniority.png) | no wait | 1 min |
| 10 | Saves the Microsoft search and an Apple "program manager · Seattle" search (15 roles). Comes back: last view reopened, both saved searches in the menu. [p2-19](../screenshots/persona-beta-45-54/p2-19-return-menu.png) | return 0.50 s | 1 min |

About 16 minutes.

### 3.3 Sabine Wolff: mid-career, Munich, phone (German locale)

**Goal:** "A product or UX design role in Munich or remote in Germany, ideally 4 days a week, at Google,
Apple or an AI company, paying at least €80,000 and leaving me and my two children at least €800 a
month."

**Reached it? Partly.** One full-time role fits: Google's *Senior UX Designer, Chrome* in Munich,
€112K–114K. The site gives **$2,200 a month** left, but for "two adults and two children, one earner,
married", not a single parent, and in US dollars. No part-time design role exists on any board, and the
filters have no part-time option.

| Step | What she did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Arrives cold (dates read "11. Okt."). Opens the data badge: "Saved snapshot of Greenhouse / anthropic from 11. Okt.." (two full stops). [p3-02](../screenshots/persona-beta-45-54/p3-02-badge-popover.png) | first card 0.60 s (load 1.9) | 30 s |
| 2 | Searches "UX designer": Anthropic 0; switches to Google: 21 roles, 20 in title, almost all in the US. [p3-03](../screenshots/persona-beta-45-54/p3-03-google-ux-designer.png) | under 1 s | 1 min |
| 3 | Location search: "München" → **No matches**; "Germany" → **No matches**, although the list has a GERMANY heading; "Mun" → Munich. [p3-05](../screenshots/persona-beta-45-54/p3-05-location-muenchen.png), [p3-04](../screenshots/persona-beta-45-54/p3-04-location-germany.png) | — | 2 min |
| 4 | Employment type offers only "Not stated". No part-time option. [p3-06](../screenshots/persona-beta-45-54/p3-06-employment-type.png) | — | 30 s |
| 5 | One role: *Senior UX Designer, Chrome*, €112–114K. "Updated 2 d ago" and, lower down, "Listed 1 day ago (9. Okt. 2026)". "Same role elsewhere" compares it with Apple $242K and Google $194K (US pay). [p3-07](../screenshots/persona-beta-45-54/p3-07-chrome-ux-drawer.png) | no wait | 2 min |
| 6 | Juice → Family → Monthly: $2,200/mo, tax "income tax $1,250 · social security $1,730". [p3-08](../screenshots/persona-beta-45-54/p3-08-juice-family-munich.png) | no wait | 2 min |
| 7 | Tries the other boards with the same search. Apple: "No roles match every filter. Without the search "UX designer" there would be 67 roles" (helpful). Microsoft: toast "Kept "UX designer" · dropped Munich (not at Microsoft)". After that, OpenAI shows 3 San Francisco designers and Netflix one in Helsinki: Munich is never put back, although OpenAI has 9 Munich roles and Anthropic 10. [p3-09](../screenshots/persona-beta-45-54/p3-09-apple-ux-munich.png), [p3-11](../screenshots/persona-beta-45-54/p3-11-switch-ms-drops-munich.png), [p3-10](../screenshots/persona-beta-45-54/p3-10-openai-ux-munich.png) | 0.58–0.79 s each | 4 min |
| 8 | Searches "part-time" on Apple: 148 roles, 29 in title (retail); "Teilzeit": 0. | no wait | 1 min |
| 9 | Insights → Pay estimate "UX Designer" · Munich: "Not enough comparable roles" (honest). Saves the search; next visit reopens it. [p3-14](../screenshots/persona-beta-45-54/p3-14-estimate-ux-munich.png), [p3-15](../screenshots/persona-beta-45-54/p3-15-return.png) | Insights 0.43 s (Apple, load 0.4) | 2 min |
| 10 | Map on Apple: "1.117 jobs" and "2 jobs" pins with no place name, beside "$214K 3.4K". [p3-16](../screenshots/persona-beta-45-54/p3-16-apple-map-phone.png) | Map 0.28 s | 30 s |

About 16 minutes.

### 3.4 Anil Mehta: staff level, San Jose, desktop

**Goal:** "A staff or principal ASIC design-verification role at NVIDIA or Apple in Santa Clara or
Cupertino, paying at least $250K base, that leaves my family of four at least $6,000 a month."

**Reached it? Yes for NVIDIA, no for the comparison.** NVIDIA's *SoC Verification Lead* and *Principal
Chip Lead* ($232–368K, Santa Clara) fit, and a $196–368K role leaves **$8,640 a month** for his family.
But that midpoint mixes two of NVIDIA's levels, "Same role elsewhere" compares his verification job
with software engineers, and Apple states no level on 56 of its 57 verification roles, so "NVIDIA staff
vs Apple staff" can't be answered.

| Step | What he did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Opens a link to NVIDIA from a former colleague. Departments are NVIDIA's codes ("Engineer, Sys SW", "Mgmt, Legal (Legal)"). [p4-01](../screenshots/persona-beta-45-54/p4-01-nvidia-cold.png) | first card 0.57 s (load 1.8) | 30 s |
| 2 | Department "Engineer, Verification" + "Engineer, ASIC", Location Santa Clara, Senior + Staff+: 104 roles. "$239K median · half between $200K and $239K". [p4-02](../screenshots/persona-beta-45-54/p4-02-nvidia-asic-verif-sc.png) | no wait | 2 min |
| 3 | Opens *Senior Formal Verification Engineer - LPU*: "Same role elsewhere: **Software engineering** roles at Senior level", Netflix $473K first. [p4-15](../screenshots/persona-beta-45-54/p4-15-formal-verif-same-role-swe.png) | drawer 0.20 s | 2 min |
| 4 | Opens *Senior ASIC Floorplan Design Engineer*: "Pay by level: Level 5: $196K–310.5K · Level 6: $232K–368K" (no word on what Level 6 is). Juice → Family → Monthly: $8,640/mo from a $23,500/mo gross, the midpoint of both levels together. Compare locations: Austin $13,050/mo. [p4-04](../screenshots/persona-beta-45-54/p4-04-floorplan-levels.png), [p4-05](../screenshots/persona-beta-45-54/p4-05-juice-family-sanjose.png), [p4-06](../screenshots/persona-beta-45-54/p4-06-compare-locations.png) | no wait | 4 min |
| 5 | Switches to Apple: "Kept Santa Clara, Staff+, Senior · dropped Engineer, Verification, Engineer, ASIC (not at Apple)". Searches "verification": 0, and the empty state offers "Remove the level filter" (38 roles). With Cupertino and San Jose: 57 roles, **56 "Level not stated"**, several listed twice. [p4-08](../screenshots/persona-beta-45-54/p4-08-apple-verification.png), [p4-09](../screenshots/persona-beta-45-54/p4-09-apple-verif-cupertino.png) | switch 0.09 s | 3 min |
| 6 | Insights → Compare companies → Hardware & systems engineering, Staff+: **Netflix $699K** first (its "Distributed Systems Engineer" roles), NVIDIA $326K; "Not shown: Anthropic, OpenAI and Apple (don't state levels for most of these roles)". [p4-10](../screenshots/persona-beta-45-54/p4-10-compare-hardware-staff.png) | no wait | 2 min |
| 7 | Pay estimate "Principal Verification Engineer", Staff+, Santa Clara: $261K, "470 similar roles at NVIDIA, mixed levels", medium confidence, ±13%. [p4-11](../screenshots/persona-beta-45-54/p4-11-estimate-principal-verif.png) | no wait | 2 min |
| 8 | Saves the search, tries Ranges (clear), comes back: the Ranges view reopens. [p4-13](../screenshots/persona-beta-45-54/p4-13-ranges.png), [p4-14](../screenshots/persona-beta-45-54/p4-14-return.png) | under 1 s | 1 min |

About 16 minutes.

### 3.5 Kate Ashworth: director, London, desktop

**Goal:** "Head of, or Director of, Public Policy or Government Affairs for the UK or Europe, at an AI
lab or big tech in London, paying at least £150K base and leaving the two of us at least £4,000 a
month."

**Reached it? No.** No company lists a policy leadership role in London with pay. The nearest are
Shield AI's *Government Relations Manager - UK, Nordics and Benelux* (no pay; the drawer says why
there's no estimate) and Anthropic's *Regional Research Economist* (£195–245K, $8,260/mo left for a
couple), which isn't policy leadership. Compare companies has no Director+ level for policy, and the
pay estimate for "Head of Public Policy · Director+ · London" says, correctly, that there isn't enough.

| Step | What she did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Arrives cold, searches "policy": **188 of 645 · 13 in title**; after the 13 come Staff+ software engineers. The Fellows card now reads "$3,850/week". [p5-01](../screenshots/persona-beta-45-54/p5-01-anthropic-policy.png) | first card 0.54 s (load 1.7); search under 1 s | 1 min |
| 2 | Location → London: 14 roles; the only "policy" title is the Fellows programme. [p5-02](../screenshots/persona-beta-45-54/p5-02-anthropic-policy-london.png) | no wait | 1 min |
| 3 | Switches OpenAI → Google → Microsoft → Apple → Cohere, each with "Kept "policy", London". Google's London list shows €148K–151K and €116K–118K on cards whose first place is "London, England" (the euro pay is for Dublin). Cohere's *Head of Corporate Development* (CA$375K–465K) is graded "🍉 78 · Juicy" for London. [p5-03](../screenshots/persona-beta-45-54/p5-03-google-policy-london.png), [p5-04](../screenshots/persona-beta-45-54/p5-04-cohere-cad-london-juice.png) | 0.66–0.77 s each | 5 min |
| 4 | Insights: Compare companies opens on "AI research & ML engineering". She picks Policy & government affairs: OpenAI $266K, Anthropic $247K, Google $183K; the Level menu offers only Senior and Manager. [p5-05](../screenshots/persona-beta-45-54/p5-05-compare-policy.png) | under 1 s | 2 min |
| 5 | Pay estimate "Head of Public Policy" · Director+ · London: not enough at Anthropic; at Google, "No similar role at Google in the UK lists pay … Pay from other countries isn't used". [p5-07](../screenshots/persona-beta-45-54/p5-07-google-estimate-policy-london.png) | no wait | 2 min |
| 6 | Opens *Regional Research Economist* (£195–245K): "Same role elsewhere" compares it with AI research & ML engineering (Netflix $608K). Juice → Couple → Monthly: $8,260/mo; "Couple here means one earner; each person is taxed separately here." [p5-22](../screenshots/persona-beta-45-54/p5-22-economist-same-role-ml.png), [p5-08](../screenshots/persona-beta-45-54/p5-08-economist-juice-couple-london.png) | no wait | 3 min |
| 7 | Opens a London sales role: "On-target earnings (base plus commission at target)". [p5-09](../screenshots/persona-beta-45-54/p5-09-ote-drawer.png) | no wait | 30 s |
| 8 | Shield AI *Government Relations Manager - UK*: "Salary not listed", and why there is no estimate. [p5-10](../screenshots/persona-beta-45-54/p5-10-shieldai-gov-relations.png) | no wait | 1 min |
| 9 | Types "£150,000" in the salary box: "Min: £150,000 ≈ $202K a year". [p5-14](../screenshots/persona-beta-45-54/p5-14-salary-box-gbp.png) | no wait | 30 s |
| 10 | Saves three searches (Anthropic, OpenAI, Shield AI). Next visit, one OpenAI role is new: "1 new" in the menu, and the card has a "New" tag. [p5-11](../screenshots/persona-beta-45-54/p5-11-return-menu-3-saved.png), [p5-12](../screenshots/persona-beta-45-54/p5-12-return-1-new.png), [p5-13](../screenshots/persona-beta-45-54/p5-13-saved-opened-new.png) | under 1 s | 1 min |

About 18 minutes.

## 4. Findings for the group

Persona letters: M = Maggie, D = Darnell, S = Sabine, A = Anil, K = Kate. Owners are the files I could
trace the behaviour to.

### 4.1 Broken, fix now (wrong, misleading or blocking)

1. **A yearly internship salary is labelled as a lump sum for a few weeks.** Google's "Ireland:
   €47000 (EUR)" becomes "€47,000 · EUR · for about 13 weeks · Fixed-term pay, not a yearly
   salary"; a US undergraduate intern's $58,000–77,000 is "for about 12 weeks". Microsoft's reads
   "CA$43,800–50,000 … for about 26 weeks · Fixed-term pay, not a yearly salary (as posted: CAD $43,800 -
   CAD $50,000 per year)", contradicting itself. The Juice line below it treats the same figure as
   yearly ("−$1,520/mo … while it lasts"). That's 27 postings (Google 23, Microsoft 4). Hourly and weekly
   internships (NVIDIA, Anduril, Anthropic Fellows) are labelled correctly.
   — M, K · drawer · [p5-17](../screenshots/persona-beta-45-54/p5-17-google-intern-single-figure.png), [p5-18](../screenshots/persona-beta-45-54/p5-18-google-us-intern-term.png), [p5-19](../screenshots/persona-beta-45-54/p5-19-ms-intern-per-year-term.png) · `server/salary.js` (`payTerms` sets `termWeeks` whatever the interval), `public/app.js` line 3380 (`d-annual`) and 2875 (term tooltip).
2. **"Same role elsewhere" and "Pays more than N%" compare a non-US job with mostly US pay, and the
   drawer doesn't say so.** A Dublin data scientist on €90–92K is ranked against Netflix $448K and OpenAI
   $365K, and told it "pays more than 10% of Google's roles". A Munich designer on €112–114K is
   compared with Apple $242K. The market data has no country (`marketComps`: "melon-market-1 has no
   country dimension"). The Insights card's footnote says "Pay is from every location"; the drawer
   doesn't. The beta has 924 paid postings outside US dollars (Google 417, Microsoft 322), so this is now
   common.
   — M, S, K · drawer · [p1-11](../screenshots/persona-beta-45-54/p1-11-bds-drawer.png), [p3-07](../screenshots/persona-beta-45-54/p3-07-chrome-ux-drawer.png) · `public/features/comps.js` (`marketComps`), `public/app.js` ~3444 (percentile line) and ~3577 (drawer comps).
3. **Wrong role families on the big-tech boards, so comparisons pair the wrong jobs.**
   - 193 NVIDIA chip-design postings (design verification, mixed-signal, physical design, DFT, mask
     layout, circuit design) fall through to **Software engineering**: "Senior Formal Verification
     Engineer" is compared with Netflix's $473K software engineers.
   - Netflix's 12 *Distributed Systems Engineer* postings ($388K–900K) are **Hardware & systems
     engineering**, so Compare companies → Hardware, Staff+ is led by "Netflix $699K".
   - Anthropic's *Regional Research Economist* is **AI research & ML engineering**.

   — A, K · drawer and Insights · [p4-15](../screenshots/persona-beta-45-54/p4-15-formal-verif-same-role-swe.png), [p4-10](../screenshots/persona-beta-45-54/p4-10-compare-hardware-staff.png), [p5-22](../screenshots/persona-beta-45-54/p5-22-economist-same-role-ml.png) · `public/features/roles.js` `FAMILIES`. The hardware regex lacks verification, physical design, DFT, circuit, layout, mixed signal and SoC. Its "systems engineer" is tested before swe's "distributed systems". ml's `research\w*` catches economists.
4. **"What they look for" merges required and preferred qualifications.** Google's *Business Data
   Scientist* shows "3 years of experience…" and then "4 years of experience…": the first is the
   minimum, the second preferred, and the heading between them is lost. 3,282 of 3,417 Google postings
   have both lists. Apple (3,331) and Microsoft (1,862) also post a "Preferred Qualifications" list;
   I did not check that theirs is merged the same way. A career changer reads the preferred list as
   required.
   — M (also D, S, A reading big-tech postings) · drawer, "About the role" · [p1-15](../screenshots/persona-beta-45-54/p1-15-about-role.png) · section extraction for `job.sections.fit` (`server/keywords.js`), `public/app.js` line 3416.
5. **Location search says "No matches" for a country or a local spelling.** "Germany" finds nothing
   although the list shows a GERMANY heading, and "München" finds nothing. Sabine found Munich only by
   typing "Mun". The same will happen with "Köln", "Wien", "Zürich" or "Ireland".
   — S · Filters → Location (phone) · [p3-04](../screenshots/persona-beta-45-54/p3-04-location-germany.png), [p3-05](../screenshots/persona-beta-45-54/p3-05-location-muenchen.png) · `public/app.js` ~1799 (option search matches only the city key or label).
6. **Two different medians on the same screen.** The stats line says "$347K median" and the chart
   just below says "Median $352K" (Anthropic, desktop). The stats line leaves out on-target earnings;
   the chart's histogram doesn't.
   — D · Chart (desktop) · [p2-01](../screenshots/persona-beta-45-54/p2-01-arrive-125zoom.png) · `public/app.js` `renderKpis` vs `public/viz/chart.js` `renderHist`.
7. **Juice for London computed from Canadian or Danish pay, with no warning on the card.** Cohere's
   *Head of Corporate Development* (CA$375K–465K, listed in the US, Canada, London and Remote) shows
   "🍉 78 · Juicy" and "$122,300/yr left … in London". A Microsoft role paid in DKK 727K–1.3M
   ("Denmark | London") shows "🍉 46" for London. By design this is the `currencyMismatch` fallback, but
   the only note is inside the folded waterfall. It's 3 London postings in this snapshot.
   — K · cards, drawer · [p5-04](../screenshots/persona-beta-45-54/p5-04-cohere-cad-london-juice.png) · `server/juice.js` `attachJuice`, `public/app.js` `shownJuice`/`juiceBadge`.
8. **One drawer gives two ages.** "Updated 2 d ago" at the top and "Listed 1 day ago (9. Okt. 2026)"
   below, for a posting first seen 1.6 days earlier: the top one rounds and the bottom one floors.
   — S · drawer · [p3-07](../screenshots/persona-beta-45-54/p3-07-chrome-ux-drawer.png) · `public/app.js` line 188 (`Math.round`) vs the listing age (~2849, 3526).

### 4.2 Improve (ranked by how many of the 5 it would help)

| Rank | Change | Helps | Screen · screenshot · owner |
|---|---|---|---|
| 1 | **Search across all companies, or at least say where the matches are.** Everyone used 2–6 boards one at a time. Maggie's "data scientist Dublin" ended at 0 on Anthropic with no hint that Google has 137 Dublin roles. Sabine's Munich filter, dropped at Microsoft, was never put back at OpenAI (9 Munich roles) or Anthropic (10). Kate needs three saved searches for one question. A line in the empty state ("Google 137 · Microsoft 52 · OpenAI 19 in Dublin") and keeping a dropped filter pending until a board has it would fit the budget. | 5/5 | Empty state, company menu, saved searches · [p1-03](../screenshots/persona-beta-45-54/p1-03-search-data-dublin-anthropic.png), [p3-10](../screenshots/persona-beta-45-54/p3-10-openai-ux-munich.png), [p5-11](../screenshots/persona-beta-45-54/p5-11-return-menu-3-saved.png) · `public/app.js` (`switchCompany`, empty state, F5) |
| 2 | **Juice for real households, in the posting's currency.** None of the five could check their own target: Maggie (two incomes, her own €2,400 rent outside the centre), Sabine (single parent), Darnell (the bottom of a $98–188K range, not the midpoint), Anil (one NVIDIA level, not the midpoint of two), Kate and Maggie (pounds and euros, not dollars). `server/juice.js` already accepts `rentOverrideUSD`. A "my rent" box, "outside the centre", "second income", a single-parent household and "at the low end of the range" all fit in the drawer's Juice block. | 5/5 | Juice · [p1-13](../screenshots/persona-beta-45-54/p1-13-juice-family-monthly.png), [p2-09](../screenshots/persona-beta-45-54/p2-09-juice-couple-redmond.png), [p3-08](../screenshots/persona-beta-45-54/p3-08-juice-family-munich.png), [p4-05](../screenshots/persona-beta-45-54/p4-05-juice-family-sanjose.png) · `public/app.js` (`juiceBlock`), `server/juice.js` |
| 3 | **Plain words for what's left:** "Multiple pay zones" (say which range applies to the city: Microsoft's posting has one for SF/NYC and one for the rest of the US); "Level 5 / Level 6" (NVIDIA's ladder, give the word); "Senior" with no hint that it comes from "IC4"; "6 in title"; "Clusters / Ranges"; the Juice score "72" and grades: Darnell's $3,610/mo, which meets his goal, is "Dry"; "filing jointly" on an Irish tax line. | 5/5 | Drawer, cards · [p2-08](../screenshots/persona-beta-45-54/p2-08-scpm-drawer.png), [p4-04](../screenshots/persona-beta-45-54/p4-04-floorplan-levels.png) · `public/app.js` |
| 4 | **Separate title matches from description matches, and drive Insights from the title matches.** "supply chain" gave 170 roles with 8 in the title; "policy" 188 with 13. A divider ("162 more mention it in the description") would explain the rest. The Pay estimate's default ("Software Engineer" for a supply-chain search) and Compare companies' default family ("AI research" for a policy search) come from the description matches. | 3/5 (M, D, K) | Results, Insights · [p2-07](../screenshots/persona-beta-45-54/p2-07-supply-chain-redmond.png), [p2-10](../screenshots/persona-beta-45-54/p2-10-insights.png), [p5-05](../screenshots/persona-beta-45-54/p5-05-compare-policy.png) · `public/app.js` (search ranking), `public/features/insights.js`, `public/features/compstimate.js` |
| 5 | **Use each company's ladder, and say so.** Apple states no level on 56 of 57 verification roles, and on "Manager, Engineering Program Manager…". Microsoft's "IC4", NVIDIA's "Level 5/6" and Google's "II/III" are used but never shown. "Senior (IC4 on Microsoft's ladder)" in the drawer would let Darnell and Anil compare. | 3/5 (D, A, M) | Drawer, Seniority · [p4-09](../screenshots/persona-beta-45-54/p4-09-apple-verif-cupertino.png) · `server/keywords.js`, `public/features/roles.js` (`displayLevel`) |
| 6 | **Department names that mean something on the big-tech boards.** Google's departments are brands ("Google 134 · YouTube 3"), and NVIDIA's are codes ("Mgmt, Legal (Legal)", "Engineer, Sys SW"). The role families Insights already uses would make a better first level. | 3/5 (M, S, A) | Chart, Department filter · [p1-05](../screenshots/persona-beta-45-54/p1-05-google-dublin-list.png), [p4-01](../screenshots/persona-beta-45-54/p4-01-nvidia-cold.png) · `public/app.js`, `public/features/roles.js` |
| 7 | **Clean up keyword tags on the big-tech boards.** "Evals" appears on 91 Microsoft and 157 Apple postings, including *Senior Program Manager - Field Repair* and *CPU Processor Performance Verification Engineer*. Other misfires: "Agents" on a YouTube UX designer, "Mission / defense" on a nonprofit sales manager, "Transformers" on a power-and-cooling sourcing role. | 3/5 (D, S, K) | Cards, drawer · [p2-07](../screenshots/persona-beta-45-54/p2-07-supply-chain-redmond.png) · `server/keywords.js` |
| 8 | **Show on the card the place the pay is for.** Google's "London, England +3 · €148K–151K" is Dublin pay. "Student Researcher Program Manager · London +1 · €84K–86K" is the same. | 2/5 (M, K) | Cards · [p5-03](../screenshots/persona-beta-45-54/p5-03-google-policy-london.png) · `public/app.js` `locSummary`, `payLocations` in `public/features/shared.js` |
| 9 | **Part-time and flexible work.** Employment type is empty on the big-tech boards; the text search already finds "part-time" (Apple 148). A "Mentions part-time" option under More fits the budget. Common for returning parents and people easing toward retirement in this age group. | 2/5 (S, M) | Filters · [p3-06](../screenshots/persona-beta-45-54/p3-06-employment-type.png) · `public/app.js`, `server/keywords.js` |
| 10 | **Map labels for every pin**, and one number format: "1.117 jobs" and "2 jobs" have no place, next to "3.4K" (de-DE). With a Dublin filter, a "Mountain View, New York and 3 more · $209K" pin also appears. | 2/5 (S, M) | Map · [p3-16](../screenshots/persona-beta-45-54/p3-16-apple-map-phone.png), [p1-22](../screenshots/persona-beta-45-54/p1-22-map-dublin.png) · `public/viz/map.js` |
| 11 | **Group repeated postings**: Apple's *CPU Design Verification Engineer* twice at the same pay; Microsoft's *Technical Program Manager II* three times. | 2/5 (A, D) | List · [p4-09](../screenshots/persona-beta-45-54/p4-09-apple-verif-cupertino.png) · `public/app.js` |
| 12 | **"My city or remote in my country."** With Seattle picked, Anthropic's Remote (US) logistics managers ($405–485K) are hidden, because they also list SF and NY. | 1/5 (D) | Location filter · `public/app.js` `locMatches` |
| 13 | Small things: "$20–71 a hour"; "from 11. Okt.." and a stray "· titles, teams…" in the badge popover (de-DE); the return toast covers the company menu on the phone; the desktop stats line is clipped ("· m") at 1440 px; "$239K median · half between $200K and $239K" reads oddly; Apple puts Santa Clara under "Other places · 0"; "Dublinas, Ireland" (1 Google posting); "Bachelor's 95% · +$895"; *Student Researcher Program Manager* filed as Intern; "Juice … in San Jose" for a Santa Clara job, while Compare locations says "Santa Clara · shown above". | 1–2/5 | Various · [p3-02](../screenshots/persona-beta-45-54/p3-02-badge-popover.png), [p5-20](../screenshots/persona-beta-45-54/p5-20-nvidia-intern-hourly-term.png), [p1-21](../screenshots/persona-beta-45-54/p1-21-return-menu.png), [p4-13](../screenshots/persona-beta-45-54/p4-13-ranges.png) · `public/app.js`, `public/viz/chart.js`, `server/keywords.js` |

### 4.3 Good: keep

1. **Everything is quick.** Cold loads: first card in 0.54–0.67 s. Company switches take 0.09–0.79 s,
   a drawer 0.20–0.22 s, Insights 0.35–0.43 s, and the first Map on Apple on a phone 0.28 s. Load
   average was 0.4–1.9 throughout. — all · §3.
2. **Filters are kept when switching company, and a toast says what was dropped:** "Kept Santa Clara,
   Staff+, Senior · dropped Engineer, Verification, Engineer, ASIC (not at Apple)". — M, S, A, K ·
   [p3-11](../screenshots/persona-beta-45-54/p3-11-switch-ms-drops-munich.png), [p4-08](../screenshots/persona-beta-45-54/p4-08-apple-verification.png) · `public/app.js`.
3. **Empty states that offer the way out:** "Without the level filter there would be 38 roles ·
   Remove the level filter". — S, A · [p3-09](../screenshots/persona-beta-45-54/p3-09-apple-ux-munich.png), [p4-08](../screenshots/persona-beta-45-54/p4-08-apple-verification.png).
4. **Saving and coming back now work as people expect.** Save is a labelled chip and says "Saved in this
   browser". A return visit "Reopened where you left off". Saved searches sit at the top of the menu,
   with "1 new" and a New tag on the right card. — all ·
   [p1-16](../screenshots/persona-beta-45-54/p1-16-save-dialog.png), [p1-21](../screenshots/persona-beta-45-54/p1-21-return-menu.png), [p5-12](../screenshots/persona-beta-45-54/p5-12-return-1-new.png), [p5-13](../screenshots/persona-beta-45-54/p5-13-saved-opened-new.png) · `public/app.js` (F5).
5. **Honest estimates:** "No similar role at Google in the UK lists pay, so there is no pay estimate.
   Pay from other countries isn't used"; "470 similar roles at NVIDIA, mixed levels"; "Not enough
   comparable roles". — M, S, A, K · [p5-07](../screenshots/persona-beta-45-54/p5-07-google-estimate-policy-london.png), [p4-11](../screenshots/persona-beta-45-54/p4-11-estimate-principal-verif.png) · `public/features/compstimate.js`.
6. **Honest pay labels:**
   - "On-target earnings (base plus commission at target)";
   - "$3,850 a week · for about 17 weeks (as posted: 3,850 USD / 2,310 GBP / 4,300 CAD)";
   - "Salary not listed — this posting doesn't include a pay range";
   - NVIDIA's "Pay by level";
   - the salary box's "Min: £150,000 ≈ $202K a year".

   — A, K · [p5-09](../screenshots/persona-beta-45-54/p5-09-ote-drawer.png), [p5-15](../screenshots/persona-beta-45-54/p5-15-fellows-drawer.png), [p4-04](../screenshots/persona-beta-45-54/p4-04-floorplan-levels.png), [p5-14](../screenshots/persona-beta-45-54/p5-14-salary-box-gbp.png).
7. **The Juice breakdown.** It gives a plain sentence for each country's tax ("Couple here means one
   earner; each person is taxed separately here"), "Rent takes 35% of take-home pay", and Compare
   locations (Santa Clara $8,640 vs Austin $13,050 a month). The household choice is remembered on every
   card, and rent dates are explained ("sized for 3 bedrooms with Oct 2025 figures"). — all ·
   [p2-09](../screenshots/persona-beta-45-54/p2-09-juice-couple-redmond.png), [p4-06](../screenshots/persona-beta-45-54/p4-06-compare-locations.png) · `public/app.js` (`juiceBlock`).
8. **Big tech is listed first in the company menu,** and one line says what the site is. — M, D ·
   [p1-02](../screenshots/persona-beta-45-54/p1-02-company-menu-phone.png).
9. **Compare companies is a way in, not a dead end.** Clicking a company opens it with the role
   family and filters kept. It says who is left out and why ("don't state levels for most of these
   roles"). — D, A · [p2-12](../screenshots/persona-beta-45-54/p2-12-compare-supply-chain.png), [p2-14](../screenshots/persona-beta-45-54/p2-14-anthropic-supply-redmond.png), [p4-10](../screenshots/persona-beta-45-54/p4-10-compare-hardware-staff.png).
10. **Phone and zoom basics hold:**
    - the phone has the active filter as a chip ("Dublin"), a labelled Save, "‹ Back" in the drawer, and a full-screen Filters sheet with Seniority definitions;
    - Apply stays pinned at the bottom;
    - at 125% zoom the desktop layout reflows without overlap.

    — M, S, D · [p1-06](../screenshots/persona-beta-45-54/p1-06-seniority-popover.png), [p1-10](../screenshots/persona-beta-45-54/p1-10-dublin-data.png), [p2-01](../screenshots/persona-beta-45-54/p2-01-arrive-125zoom.png).
11. **Group: Seniority and the Ranges view** are the clearest way to compare levels. — D, A ·
    [p2-16](../screenshots/persona-beta-45-54/p2-16-group-seniority.png), [p4-13](../screenshots/persona-beta-45-54/p4-13-ranges.png) · `public/viz/chart.js`.
12. **Apply names the destination** ("Apply on Google's careers site · google.com") and opens the
    original posting in a new tab. — all.
13. **Search now reads descriptions:** "part-time" finds Apple's 148 roles (the first review asked for
    this). — S.

### 4.4 The first review's Broken items: fixed or not

From [persona-stable-45-54.md](persona-stable-45-54.md) §4.1, checked on this build:

| # | First review said | Now |
|---|---|---|
| 1 | Anthropic sales OTE labelled as base pay | **Fixed.** "On-target earnings (base plus commission at target)" in the drawer, an "On-target earnings" card tag, and OTE left out of Compare companies and the median ([p5-09](../screenshots/persona-beta-45-54/p5-09-ote-drawer.png)). |
| 2 | Compstimate names a level or city its comparables don't have | **Fixed.** "Pay from other countries isn't used" and "mixed levels · Santa Clara"; no "±%" at low confidence ([p5-07](../screenshots/persona-beta-45-54/p5-07-google-estimate-policy-london.png), [p4-11](../screenshots/persona-beta-45-54/p4-11-estimate-principal-verif.png)). |
| 3 | Drawer and Insights disagree | **Fixed as far as tested.** For UK roles both said there is no estimate; I didn't repeat the Anduril Sydney case. |
| 4 | "Mid" shown as fact on 48% of postings | **Fixed.** "Level not stated" on cards, filters and the drawer. The remaining level gaps are big-tech ladders (Improve #5). |
| 5 | "San Francisco + 3 nearby" containing New York and DC | **Fixed.** Pins now read "Mountain View, New York and 3 more", with no "nearby" claim ([p1-22](../screenshots/persona-beta-45-54/p1-22-map-dublin.png)). |
| 6 | Fellowship stipend shown as $200K a year | **Fixed** for weekly and hourly pay ("$3,850/week", "while it lasts"). **New:** the same fixed-term label is now put on yearly intern salaries (Broken #1). |
| 7 | Salary box silently changes "£250,000" or "60000" | **Fixed.** "Min: £150,000 ≈ $202K a year"; "$80K a year, below the lowest pay listed here ($110K)". |
| 8 | "Sydney median $61K" from US contractor roles | **Fixed per the lane.** Market insights now says "39 roles whose pay is for another country left out". I did not re-test Sydney. |
| 9 | "CAD" skill tag on Canadian-dollar pay | **Fixed.** No CAD tag on Cohere's CA$ cards. |
| 10 | Two overlapping empty-chart messages | **Fixed.** One message per pane ([p4-08](../screenshots/persona-beta-45-54/p4-08-apple-verification.png)). |
| 11 | Rent dates contradict each other | **Fixed.** The drawer says "sized for 3 bedrooms with Oct 2025 figures", and the methodology page says "2- and 3-bedroom rents October 2025 in US cities" ([p5-21](../screenshots/persona-beta-45-54/p5-21-methodology.png)). |

Also from the other groups' reviews:
- "intern" matching International or Internal: **fixed** (Microsoft "intern": 80 roles, 65 in title, internships first).
- "4 new" with nothing marked New: **fixed** ([p5-13](../screenshots/persona-beta-45-54/p5-13-saved-opened-new.png)).
- The sort ignored while a search is active: **fixed**; "Best match" is its own option, and "Newest" with a search sorts by age ([p5-16](../screenshots/persona-beta-45-54/p5-16-ms-intern-newest.png)).
- "≈ $44K–44K" for a single figure: **fixed** ("≈ $54K · Single figure").
- "Couple" silently meaning married and filing jointly: **now explained** in the drawer, but still the only model (Improve #2).
- Two "<" icons in the phone drawer: **fixed** ("‹ Back").
- The phone Save icon unlabelled, and active filters scrolling out of sight: **fixed**.

Still open from the first review's Improve list:
- matches per company (Improve #1 here);
- "my city / my rent" and Juice in my currency (Improve #2);
- part of the jargon (Improve #3);
- department names (Improve #6);
- keyword tags (Improve #7);
- grouping repeated postings (Improve #11);
- a part-time option (Improve #9).

## 5. Replayable steps

1. Serve the lead's build (shared, not rebuilt):
   `node scripts/cycle/serve.mjs --dist <scratch>/cycle-beta/dist --pid <scratch>/persona-beta-45-54/serve.pid`
   It printed `serve: http://127.0.0.1:44693/melon-seek/`; the site is `/melon-seek/beta/`.
2. Drive Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) with Playwright from
   `<scratch>/pw/node_modules`, loaded with `createRequire(NODE_PATH + '/')`. A small REPL daemon
   (`<scratch>/persona-beta-45-54/work/daemon.mjs`, pid in `daemon.pid`) held one browser with one
   context per person, so each person kept their own localStorage:
   - phone: 390×844, `isMobile`, `hasTouch`, DPR 2;
   - desktop: 1440×900;
   - 125% zoom: a 1152×720 viewport at DPR 1.25 (what a 1440×900 screen shows at 125%);
   - `timezoneId` and `locale` set to each person's city.

   Each step was a short script (tap or click, fill, wait for a selector, screenshot, read
   `innerText`). Its wall time is the "page" column. The browser and the server were stopped by pid
   when the run finished.
3. "Coming back later" was a fresh `goto` to `/melon-seek/beta/` in the same context. For Kate's
   "1 new", I removed one OpenAI id from her saved search's `seen` list and from `melon.seenIds.openai`
   in localStorage, then reloaded.
4. Facts checked against the data:
   - term labels: `salary.termWeeks` with no hour, week or month in `salary.text`, decoded from `api/jobs/*.json`: Google 23, Microsoft 4;
   - role families: `roleFamily()` over `data/*.csv`, giving 193 NVIDIA chip-design titles as swe and 12 Netflix "Distributed Systems Engineer" titles as hardware;
   - qualifications: "Minimum/Preferred qualifications" in `api/desc/google/*.json` (3,282 of 3,417);
   - non-USD pay: 924 of 12,851 paid postings in `data/*.csv`;
   - "Evals" tags: decoded keywords in `api/jobs/*.json`;
   - the Microsoft IC4 and pay-zone sentence, the Cohere CAD range and the Google "Ireland: €47000 (EUR)" line: `api/desc/**`.
5. Screenshots shrunk with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/persona-beta-45-54`.

## 6. Known gaps and follow-ups

- **Not tested:**
  - live board fetches and real map tiles (sandbox);
  - dark mode;
  - screen readers;
  - zoom above 125%;
  - the Add board flow.
- **Timings are unthrottled localhost runs** under a shared load of 0.4–1.9. They show that nothing
  stalls, not what a phone on 4G sees; perf-mobile-beta.md has the throttled figures.
- **Human times are estimates.**
- **Assumed from the posting format, not confirmed with Google:** that Google's intern pay line
  ("Ireland: €47000 (EUR)", "$58000 - $77000 (USD)") is a yearly rate. Microsoft's says "per year"
  explicitly. Either way the drawer contradicts its own Juice line.
- **The role-family counts** come from `roleFamily(title, {department})` run in Node. The app may pass
  more context, so treat 193 as an upper bound; the drawer showed the wrong family on every case I
  opened.
- **The "1 new" return visit was simulated** by editing localStorage.

## 7. Change log

- 2026-10-11: five personas run on the beta build of commit 83023f5 (built 03:03 UTC); 93 screenshots;
  8 Broken, 13 Improve, 13 Good; first review's 11 Broken items re-checked (10 fixed, 1 fixed with a
  new related bug).
