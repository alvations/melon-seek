# Process log: persona-beta-25-34

Persona review of the beta site (target `beta`, `/melon-seek/beta/`) by five job seekers aged 25 to 34,
one per career level. Written 2026-10-11 by the persona reviewer for this age group. This is the
second persona review; the first one (main site) is [persona-stable-25-34.md](persona-stable-25-34.md).

## 1. Brief

- Prompt (verbatim): [prompts/persona-beta-25-34.md](prompts/persona-beta-25-34.md). Template:
  [prompts/cycle/persona-review.md](prompts/cycle/persona-review.md).
- Goal: use the beta site (8 AI companies plus Google, Microsoft, Apple, Netflix and NVIDIA) the way
  five real people in this age group would, from arriving cold to saving a search and coming back,
  and report what to keep, what to improve and what is broken. Check whether what the first review
  called broken is now fixed.
- Files owned: this file, the prompt copy and `docs/screenshots/persona-beta-25-34/` (87 screenshots).
  No product code was touched. Nothing was committed or pushed.

## 2. Inputs and sources

| Source | What it gave |
|---|---|
| `README.md` | What the site promises, data modes, the beta site section |
| `docs/strategy/ROADMAP.md` §8 | The UI simplicity budget. Every suggestion below fits inside it: wording, existing selects and popovers, the drawer, or "Location → within N km" |
| `docs/process/persona-stable-*.md` (all five) | The Broken lists to re-check (§6) |
| `docs/process/lead.md` (persona fix waves 1 and 2, beta fix waves 1 and 2, perf pass) | What was meant to be fixed, and the lead's level and pay decisions |
| `docs/process/perf-mobile-beta.md` | The clean timings (4× CPU, Fast 4G, quiet machine) |
| The lead's build `<scratch>/cycle-beta/dist` (commit 83023f5) | The site under test, served by `scripts/cycle/serve.mjs` |
| `<dist>/beta/api/jobs/*.json` unpacked with `unpackJobs` from `<dist>/beta/api.js`; `data/beta/snapshots/*.json` and `data/snapshots/*.json` | Picking personas the data can serve; checking strange numbers against the raw posting text |
| `public/app.js`, `server/keywords.js`, `server/salary.js` | Read only after something looked wrong on screen, to name the owning code |

## 3. Decisions and rationale

1. **The five people.** Four countries (Poland, Ireland, US, Switzerland), all three household types and
   five fields (engineering, sales, operations, research, design). All five have a reason to use the
   big-tech boards (the prompt asks for at least 3): Google and NVIDIA post pay in Poland, Google and
   Microsoft in Ireland, Apple has part-time retail roles, Google and Apple are the research employers in
   Zurich, and Netflix and Apple hire designers in Los Angeles. Two use a phone (390×844, isMobile,
   hasTouch); three use laptops of different sizes, one in dark mode. I chose them after counting what
   the data holds per country, level and employment type, so each goal can be scored.
2. **Times.** "App" is measured by the script on this machine with no throttling: from the tap or
   navigation to the element appearing. "Person" is my estimate of the time a person spends on the
   step, reading included. Five reviewers shared the 4-CPU machine; the 1-minute load average was
   0.97–3.43 during my runs and is given next to the times in §4. Nothing was slow: every app time was
   under 1.4 s, so no slowness is reported (the clean, throttled numbers in perf-mobile-beta.md measure
   something else and aren't comparable).
3. **Driving the site.** Visible controls only: taps and CDP touch swipes on phones (to drag the
   results sheet), clicks and typing on desktop. Two shortcuts a person could also take: Zofia's
   "intern" search started from `#c=google` (the same as Clear all), and Tomás reopened Netflix with
   `#c=netflix&q=creative director` (the same as typing the search). Shared and bookmarked links were
   opened as links.
4. **"Coming back later".** A new browser context from the saved storage state, with no link. To
   test "N new" honestly I back-dated the saved search's `lastSeenAt` and removed 1–2 ids from its
   `seen` list. The build's history ledger is empty (`api/history/*.json` is `{}`), so "new" falls back
   to those remembered ids (as in the first review).
5. **Not reported** (per the lead): the badge falling back to the snapshot, and grey map tiles.
6. **Severity.** "Broken, fix now" means a number or label is wrong or misleading, or a task is
   blocked. Each Broken item was checked against the raw posting or the code (§7). Everything else
   is "Improve", ranked by how many of the five it would help.

## 4. The five people

### 4.1 Zofia Nowak, 25, finishing a CS master's, Warsaw (Poland), single, engineering. Phone

**Goal:** a software-engineering internship or first job in Warsaw or Kraków at Google, NVIDIA or
Microsoft, paying at least 12,000 zł gross a month and leaving at least 3,000 zł a month after tax,
rent and living costs.

**Reached? Partly.** Google's *Technical Solutions Engineer I* (Entry, PLN 252K–258K) leaves
$1,320 a month in Warsaw, about 4,900 zł, so it meets both numbers, but only after she converted the
dollars herself, and it is labelled "Dry". The internship she wanted most says "PLN 156,000–159,000 ·
for about 13 weeks · Fixed-term pay, not a yearly salary", which she reads as 48,000 zł a month; the
posting means a yearly rate (B1).

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | first card 0.53 s (load 1.0) | 10 s | One line under the chips: "melon·seek · Pay, and what's left after tax and rent, for 13 companies' open roles". The page opens on Anthropic ($347K median), which isn't for her; the name is cut to "Anthro…". [p1-zofia-01](../screenshots/persona-beta-25-34/p1-zofia-01-cold.png) |
| 2 | Company menu → Google | 0.41 s (load 2.6) | 10 s | A "Big tech" group at the top of the menu; easy. [p1-zofia-02](../screenshots/persona-beta-25-34/p1-zofia-02-company-menu.png), [p1-zofia-03](../screenshots/persona-beta-25-34/p1-zofia-03-google.png) |
| 3 | Location "wars" → Warsaw 62, "krak" → Krakow 13; Seniority Intern + Entry; "Show 9 roles" | 0.37 s (load 2.4) | 40 s | The phone sheet is clear, with live counts. [p1-zofia-04](../screenshots/persona-beta-25-34/p1-zofia-04-location-search-wars.png), [p1-zofia-05](../screenshots/persona-beta-25-34/p1-zofia-05-seniority-intern-entry.png) |
| 4 | Read the chart and list | — | 25 s | The chart says "$70K median" in US dollars only, with one row and half a screen of white space; the list is a collapsed sheet that needs two swipes to reach the internships. Every card reads "Dry". Pay formats differ: "PLN 280K–287K", "PLN 210,000", "PLN 156,000–159,000". [p1-zofia-06](../screenshots/persona-beta-25-34/p1-zofia-06-warsaw-chart.png), [p1-zofia-07](../screenshots/persona-beta-25-34/p1-zofia-07-sheet-list.png), [p1-zofia-08](../screenshots/persona-beta-25-34/p1-zofia-08-sheet-interns.png) |
| 5 | Open *Software Engineering, Site Reliability Engineering BS/MS Intern, 2027* | 0.22 s (load 1.4) | 60 s | "PLN 156,000–159,000 · PLN · for about 13 weeks · Fixed-term pay, not a yearly salary (as posted: zł156000 (PLN); zł159000 (PLN))". She reads 156,000 zł for 13 weeks. The same drawer's Juice uses $3,470 a month gross (156,000 zł a year), and "Same role elsewhere" calls it "a yearly rate". "Multiple pay zones" is really a Bachelor's/Master's split. [p1-zofia-09](../screenshots/persona-beta-25-34/p1-zofia-09-intern-drawer-top.png), [p1-zofia-10](../screenshots/persona-beta-25-34/p1-zofia-10-intern-juice.png) |
| 6 | Open *Technical Solutions Engineer I*; Juice → Monthly | 0.2 s | 45 s | Gross $5,620, tax $2,130 (income tax $920, social security $1,210), rent $1,240, living $930, left $1,320 a month in Warsaw. I checked the Polish tax by hand; it matches to the dollar. But it is in US dollars only, "18 · Dry", "Pays more than 1% of Google's roles", and "Same role elsewhere" compares it with US pay (Google $155K, Palantir $140K). [p1-zofia-11](../screenshots/persona-beta-25-34/p1-zofia-11-tse-juice-monthly.png), [p1-zofia-12](../screenshots/persona-beta-25-34/p1-zofia-12-tse-drawer-top.png) |
| 7 | Save the search | — | 5 s | "Saved in this browser. Find it in the company menu, with its new roles"; Save turns into Saved. [p1-zofia-13](../screenshots/persona-beta-25-34/p1-zofia-13-saved-toast.png), [p1-zofia-14](../screenshots/persona-beta-25-34/p1-zofia-14-menu-with-saved.png) |
| 8 | Company menu → NVIDIA | 0.56 s (load 1.2) | 20 s | "Kept Warsaw, Intern, Entry · dropped Krakow (not at NVIDIA)": 3 interns (PLN 118K–204K). [p1-zofia-15](../screenshots/persona-beta-25-34/p1-zofia-15-nvidia-carried.png) |
| 9 | Microsoft, then Insights | 0.26 s (load 1.1) | 30 s | 1 role (Customer Success, PLN 84K–116K, "0 · Rind"). Insights' Pay estimate honestly says "Not enough comparable roles … Warsaw". The name is cut to "Micros…". [p1-zofia-16](../screenshots/persona-beta-25-34/p1-zofia-16-microsoft-carried.png), [p1-zofia-17](../screenshots/persona-beta-25-34/p1-zofia-17-microsoft-insights.png) |
| 10 | Search "intern" on all of Google | 0.86 s incl. typing (load 1.8) | 15 s | "84 roles · 65 in title", all internships at the top: the first review's "International/Internal" problem is gone. [p1-zofia-22](../screenshots/persona-beta-25-34/p1-zofia-22-search-intern.png) |
| 11 | A week later, no link | 0.54 s (load 1.0); saved search 0.18 s | 20 s | Reopens Microsoft (her last view) with a toast; the menu shows "Google · Intern · Entry · War… 2 new"; the list says "2 new roles since you last opened this search — listed first, marked New". [p1-zofia-18](../screenshots/persona-beta-25-34/p1-zofia-18-return-cold.png), [p1-zofia-19](../screenshots/persona-beta-25-34/p1-zofia-19-return-menu.png), [p1-zofia-21](../screenshots/persona-beta-25-34/p1-zofia-21-return-new-tags.png) |

### 4.2 Ciarán Byrne, 28, three years in SaaS sales (SDR, then account executive), Dublin (Ireland), couple, sales. Laptop 1366×768

**Goal:** an account executive or account manager role at Google or Microsoft in Dublin with base pay
of at least €80,000 (and €100,000 at target), leaving the two of them at least €1,500 a month after
tax, rent for a 2-bed and living costs. His partner is a nurse and also earns.

**Reached? Partly.** Google's English-language AE roles in Dublin pay €76,000–77,500 base, under his
floor; the €98K–100K ones need German, Czech, Polish or Dutch. The posting's "+ 35% bonus target" (about
€103K at target) shows only as "+ bonus mentioned". Juice for a couple counts one earner and leaves
$50 a month. Anthropic's *Account Executive, Startups* (€155K–205K on-target earnings) meets his
numbers but asks for 5+ years.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | first card 0.61 s (load 1.7) | 10 s | Logo, Beta tag, Anthropic, and the one-line description on the right of the chart toolbar. [p2-ciaran-01](../screenshots/persona-beta-25-34/p2-ciaran-01-cold.png) |
| 2 | Google; Department chip | 0.47 s | 20 s | Department lists "Google 3,174, YouTube 144, DeepMind 95, GFiber, Verily, Waymo, Wing": no Sales. Dead end. [p2-ciaran-02](../screenshots/persona-beta-25-34/p2-ciaran-02-google.png), [p2-ciaran-03](../screenshots/persona-beta-25-34/p2-ciaran-03-google-department-pop.png) |
| 3 | Location "dubl" → Dublin 137 (and a separate "Dublinas 1"); search "account executive" | 1.17 s incl. typing (load 2.3) | 30 s | 9 roles, €76K–116K, all "Dry" for one person. [p2-ciaran-04](../screenshots/persona-beta-25-34/p2-ciaran-04-location-dublin.png), [p2-ciaran-05](../screenshots/persona-beta-25-34/p2-ciaran-05-dublin-ae-search.png) |
| 4 | Open *Account Executive, UKI, New Business (English)* | 0.23 s (load 2.2) | 60 s | "€76K–78K · + equity mentioned · + bonus mentioned · Posted base pay". The posting says "€76000 - €77500 (EUR) + 35% bonus target + equity". "Pays more than 4% of Google's roles"; "Same role elsewhere" ranks Netflix $380K first (US sales). [p2-ciaran-06](../screenshots/persona-beta-25-34/p2-ciaran-06-ae-drawer-top.png) |
| 5 | Juice → Couple, Monthly | — | 40 s | Rent (2-bed) $3,260, living $2,140, left $50 a month: "Couple here means one earner, married and filing jointly". No way to add his partner's pay. [p2-ciaran-07](../screenshots/persona-beta-25-34/p2-ciaran-07-ae-juice-couple-monthly.png) |
| 6 | Company menu → Microsoft | 0.32 s (load 1.6) | 30 s | "Kept 'account executive', Dublin": 3 Digital Account Executives €62K–92K; "account" gives 7. [p2-ciaran-08](../screenshots/persona-beta-25-34/p2-ciaran-08-microsoft-dublin-ae.png), [p2-ciaran-09](../screenshots/persona-beta-25-34/p2-ciaran-09-microsoft-dublin-account.png) |
| 7 | Insights | 0.50 s (load 1.6) | 45 s | Pay estimate "$88K · High confidence · Based on 19 similar roles at Microsoft, Dublin · Typically within ±6%": useful. Compare companies (Sales & partnerships) mixes every country: "Pay is from every location each company lists". [p2-ciaran-10](../screenshots/persona-beta-25-34/p2-ciaran-10-insights-top.png), [p2-ciaran-11](../screenshots/persona-beta-25-34/p2-ciaran-11-insights-compare.png) |
| 8 | Back to Google (recent pill); Min salary "€80,000" | — | 20 s | "Min: €80,000 ≈ $91K a year": the box now reads euros. 12 roles. The chip and the link then say "$91K+" (`smin=91000`). [p2-ciaran-12](../screenshots/persona-beta-25-34/p2-ciaran-12-salary-eur80k.png) |
| 9 | Map | 0.73 s (load 2.1) | 15 s | "$113K · 15 · Dublin, Munich and 2 more": honest group names. [p2-ciaran-13](../screenshots/persona-beta-25-34/p2-ciaran-13-map-account-80k.png) |
| 10 | Save; Apply; reopen the bookmarked URL next day in a clean browser | bookmark 0.69 s (load 2.1) | 20 s | Apply opens Google's careers page in a new tab; the bookmark restores the view. [p2-ciaran-14](../screenshots/persona-beta-25-34/p2-ciaran-14-saved.png), [p2-ciaran-15](../screenshots/persona-beta-25-34/p2-ciaran-15-bookmark-next-day.png) |
| 11 | Anthropic, Dublin, "account" | 0.23 s (load 1.6) | 30 s | *Account Executive, Startups* €155K–205K, "On-target earnings (base plus commission at target). Equity isn't included."; couple Juice $57,100 a year. [p2-ciaran-16](../screenshots/persona-beta-25-34/p2-ciaran-16-anthropic-dublin-account.png), [p2-ciaran-17](../screenshots/persona-beta-25-34/p2-ciaran-17-anthropic-dublin-ae-drawer.png) |

### 4.3 Maya Johnson, 32, seven years in retail store operations, back after two years at home, Columbus, Ohio (US), family of four, operations. Phone

**Goal:** a part-time (20–30 hours a week) operations or retail role near Columbus paying at least $25
an hour; or else a full-time operations role paying at least $75K that leaves the family at least
$1,000 a month after rent and living costs. Her partner also works.

**Reached? Partly.** Full-time: yes. Google's *Program Manager, Maintenance Planner* in Columbus
($108K–153K) leaves the family $45,500 a year (about $3,790 a month), though it is labelled "Dry".
Part-time: no. The one part-time role in Columbus (Apple *US-Technical Specialist*, $22–28.88 an
hour) is shown as "$46K–60K per year" and its Juice uses full-time pay (B2).

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | first card 0.51–0.56 s (load 2.0–2.8) | 10 s | Anthropic's "$347K median" first; the one-line description helps, but nothing says it has retail or part-time roles. [p3-maya-00](../screenshots/persona-beta-25-34/p3-maya-00-cold.png) |
| 2 | Company menu → Apple | 0.59 s for 4,879 roles (load 2.6) | 10 s | [p3-maya-01](../screenshots/persona-beta-25-34/p3-maya-01-apple.png) |
| 3 | More → Employment type: Part-time (123); Location "colum" → "Columbus, OH" (1) | — | 45 s | Plain employment types ("Full-time / Part-time / Not stated"). 1 role. [p3-maya-02](../screenshots/persona-beta-25-34/p3-maya-02-more-sheet.png), [p3-maya-03](../screenshots/persona-beta-25-34/p3-maya-03-columbus-parttime-sheet.png), [p3-maya-04](../screenshots/persona-beta-25-34/p3-maya-04-columbus-parttime.png) |
| 4 | Open it; Juice → Family, Monthly | 0.15 s (load 2.2) | 60 s | Header "Apple Retail · Support and Service · Part-time", then "$46K–60K USD · per year · Annualized from hourly pay ($22.00 and $28.88/hr…)". Juice: gross $4,410 a month, left −$1,270 ("0 · Rind"). Both use 40 hours a week; at 25 hours she would gross about $2,750. [p3-maya-05](../screenshots/persona-beta-25-34/p3-maya-05-techspec-drawer-top.png), [p3-maya-06](../screenshots/persona-beta-25-34/p3-maya-06-techspec-juice-family.png) |
| 5 | Company menu → Google | 0.49 s (load 1.9) | 20 s | Toast "Dropped Columbus, OH, Part-time (not at Google)", and 3,417 roles. Google has 15 Columbus roles. [p3-maya-07](../screenshots/persona-beta-25-34/p3-maya-07-google-carried.png) |
| 6 | Add Columbus again by hand | — | 40 s | Google's list calls it "Columbus 15". The list includes remote roles across the US, which have no Juice. Maintenance Planner $108K–153K; Data Center Technician $86K–118K. [p3-maya-08](../screenshots/persona-beta-25-34/p3-maya-08-google-location-columbus.png), [p3-maya-09](../screenshots/persona-beta-25-34/p3-maya-09-google-columbus-list.png) |
| 7 | Open the Maintenance Planner | — | 40 s | Family (remembered) but Yearly again (Monthly wasn't remembered): $45,500 a year left, "43 · Dry". "Same role elsewhere" compares with Anthropic $327K and Netflix $315K in other cities. [p3-maya-10](../screenshots/persona-beta-25-34/p3-maya-10-planner-drawer-top.png), [p3-maya-11](../screenshots/persona-beta-25-34/p3-maya-11-planner-juice-family.png) |
| 8 | Map → Juice | 0.22 s (load 1.9) | 20 s | Pins in Seattle, Sunnyvale and New York (roles that also list Columbus); the main pin, presumably Columbus, has no label. Legend: Dry < 45 is "under $48K" for a family too. [p3-maya-12](../screenshots/persona-beta-25-34/p3-maya-12-map-juice-columbus.png) |
| 9 | Save; come back three days later | return 0.77 s (load 2.1) | 20 s | "Reopened where you left off: Google · Columbus"; "1 new role since you last opened this search". [p3-maya-13](../screenshots/persona-beta-25-34/p3-maya-13-saved.png), [p3-maya-14](../screenshots/persona-beta-25-34/p3-maya-14-return-cold.png), [p3-maya-15](../screenshots/persona-beta-25-34/p3-maya-15-return-new.png) |

### 4.4 Dr. Hana Yoon, 33, senior ML research scientist (8 years including her PhD), Zurich (Switzerland), couple, research. Desktop 1440×900

**Goal:** a staff-level research scientist role in Zurich or London paying at least CHF 220,000 or
£180,000 base, leaving the two of them at least CHF 5,000 a month; and to compare the level and pay
of Google DeepMind, Apple, NVIDIA, Anthropic and OpenAI.

**Reached? Yes for London, no for Zurich.** In London, Anthropic research engineer roles pay
£260K–630K and leave a couple $21,660 a month. In Zurich no posting at any company states Zurich pay,
and the site says so ("0% show pay for Zurich", "Pay from other countries isn't used"), but the chart
and cards still show US and German pay under the Zurich filter (B5). Anthropic's research titles state
no level, so "staff-level" can't be checked there.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | first card 0.72 s (load 1.4); 1.39 s on the first try (load 2.6) | 10 s | [p4-hana-01](../screenshots/persona-beta-25-34/p4-hana-01-cold.png) |
| 2 | Anthropic: search "research scientist", then "research"; Location Zurich | — | 30 s | No research scientist in Zurich; "research" gives 2 Zurich research engineers, no salary. [p4-hana-03](../screenshots/persona-beta-25-34/p4-hana-03-anthropic-research-scientist.png), [p4-hana-04](../screenshots/persona-beta-25-34/p4-hana-04-anthropic-zurich-research.png) |
| 3 | Company menu → Google | 0.50 s (load 1.4) | 60 s | "Kept 'research', Zurich": 20 roles. The stats line says "0% show pay for Zurich", but the chart reads "Median $122K", "DeepMind · 3 roles · median $227K", and the first card is "Research Scientist, Gemini Vision, DeepMind · $174K–252K · Zurich, Switzerland +3". The $ is US pay; "Software Engineer III, Information Security · €106K–108K · Zurich +1" is Munich pay. [p4-hana-05](../screenshots/persona-beta-25-34/p4-hana-05-google-zurich-research.png) |
| 4 | Open Gemini Vision | — | 30 s | "No Juice figure for Zurich; this is the best place the posting lists" (Los Angeles). It reads as if the site doesn't cover Zurich. [p4-hana-06](../screenshots/persona-beta-25-34/p4-hana-06-gemini-vision-drawer.png) |
| 5 | Apple, Zurich | 0.52 s (load 1.8) | 30 s | 11 research roles, none with pay: "No similar role at Apple in Switzerland lists pay, so there is no pay estimate. Pay from other countries isn't used." [p4-hana-07](../screenshots/persona-beta-25-34/p4-hana-07-apple-zurich-research.png), [p4-hana-08](../screenshots/persona-beta-25-34/p4-hana-08-apple-senior-rs-drawer.png) |
| 6 | Swap Zurich for London; Anthropic | 0.27 s (load 2.2) | 45 s | 22 roles. *Research Engineer, Pretraining Scaling* £260K–630K, "Level not stated", "Wide range (2.4×)"; couple Juice $21,660 a month ("each person is taxed separately here"). A talent pool says "General application (no specific opening)". [p4-hana-09](../screenshots/persona-beta-25-34/p4-hana-09-anthropic-london-research.png), [p4-hana-10](../screenshots/persona-beta-25-34/p4-hana-10-anthropic-pretraining-drawer.png), [p4-hana-11](../screenshots/persona-beta-25-34/p4-hana-11-anthropic-pretraining-juice-couple.png) |
| 7 | Insights | 0.28 s (load 2.1) | 60 s | Pay estimate "$600K · Medium confidence · 17 similar roles at Anthropic, London · ±14%". Compare companies, AI research at Staff+: Netflix $833K, Anthropic $675K, NVIDIA $352K … Google $254K, Microsoft $209K; "Not shown: OpenAI, xAI, Cohere and Shield AI (don't state levels for most of these roles)". [p4-hana-12](../screenshots/persona-beta-25-34/p4-hana-12-insights-pay-estimate.png), [p4-hana-15](../screenshots/persona-beta-25-34/p4-hana-15-insights-compare-all-levels.png), [p4-hana-14](../screenshots/persona-beta-25-34/p4-hana-14-compare-staff.png) |
| 8 | Save; Copy link; her partner opens it | 0.84 s to the open drawer | 20 s | [p4-hana-16](../screenshots/persona-beta-25-34/p4-hana-16-copied-link.png), [p4-hana-17](../screenshots/persona-beta-25-34/p4-hana-17-partner-opens-link.png) |

### 4.5 Tomás Herrera, 34, design manager (10 years in product design, 3 managing), Los Angeles (US), family of four, design. Laptop 1280×800, dark mode

**Goal:** a design manager or director role at Netflix, Apple, Google or an AI lab, in Los Angeles or
remote, base pay of at least $250K, leaving the family at least $6,000 a month in Los Angeles; and
to compare design leadership pay across companies.

**Reached? Partly.** Apple's *Creative Director, Visual Media Strategy* in Culver City ($206K–379K)
leaves the family $9,930 a month, but it is a marketing creative role, not product design management.
Netflix has no product design manager; its remote *Creative Director* ($260K–480K) has no Juice at all.
Director+ is padded with Art Directors at $143K–215K (B4), and after a trip to Google his Culver City
filter is gone for good, so he saved a 2-role search instead of 7.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold (dark mode); open the data badge | first card 0.74 s (load 1.3) | 15 s | Dark mode is clean. [p5-tomas-01](../screenshots/persona-beta-25-34/p5-tomas-01-cold-dark.png), [p5-tomas-02](../screenshots/persona-beta-25-34/p5-tomas-02-badge.png) |
| 2 | Netflix; search "design"; Seniority Manager + Director+ | 0.22 s (load 1.3) | 40 s | 12 roles, only 1 with "design" in the title (*Workplace Design Manager*, interiors). No product design leadership. [p5-tomas-03](../screenshots/persona-beta-25-34/p5-tomas-03-netflix.png), [p5-tomas-04](../screenshots/persona-beta-25-34/p5-tomas-04-netflix-design-managers.png) |
| 3 | Company menu → Apple | 0.47 s (load 1.4) | 45 s | "Kept 'design', Manager, Director+": 40 roles mixing chip design (ASIC, PCB) with creative roles; "Art Director, Design · $143K–215K · Director+". [p5-tomas-05](../screenshots/persona-beta-25-34/p5-tomas-05-apple-design-leaders.png) |
| 4 | Location Culver City + Los Angeles; sort Most juice | — | 30 s | 7 roles; the sort is honoured with a search active. [p5-tomas-06](../screenshots/persona-beta-25-34/p5-tomas-06-apple-la-design-mostjuice.png) |
| 5 | Open *Creative Director, Visual Media Strategy*; Juice → Family, Monthly | — | 45 s | $9,930 a month left in Los Angeles. "Same role elsewhere: Design roles at Director+ level: Apple 7 · $221K, Microsoft 5 · $220K"; Apple's 7 include the Art Directors. [p5-tomas-07](../screenshots/persona-beta-25-34/p5-tomas-07-creative-director-drawer.png) |
| 6 | Netflix *Creative Director, Creative Publishing* (Remote US) | — | 20 s | $260K–480K, no Juice section at all: he can't see what it leaves in LA. [p5-tomas-08](../screenshots/persona-beta-25-34/p5-tomas-08-netflix-remote-cd-drawer.png) |
| 7 | Company menu → Google; Insights → Compare companies, Design | 0.47 s; Insights 0.32 s (load 1.9) | 45 s | "dropped Culver City (not at Google)" (true); *Seed Studio Visual Design Manager* $188K–274K. Design has no Manager level to choose; Director+ shows only Apple and Microsoft. [p5-tomas-09](../screenshots/persona-beta-25-34/p5-tomas-09-google-carried.png), [p5-tomas-10](../screenshots/persona-beta-25-34/p5-tomas-10-compare-design-all-levels.png), [p5-tomas-11](../screenshots/persona-beta-25-34/p5-tomas-11-compare-design-director.png) |
| 8 | Back to Apple by the recent pill; Save | — | 30 s | "Kept 'design', Los Angeles, Manager +1": Culver City isn't restored, so 2 roles instead of 7, and that is what he saves. [p5-tomas-12](../screenshots/persona-beta-25-34/p5-tomas-12-apple-saved.png) |
| 9 | Two days later | 0.85 s (load 2.0) | 15 s | "Reopened where you left off: Apple · 'design' · Manager · Director+ +1". [p5-tomas-13](../screenshots/persona-beta-25-34/p5-tomas-13-return.png), [p5-tomas-14](../screenshots/persona-beta-25-34/p5-tomas-14-return-menu.png) |

## 5. Findings for the group

The owning files are my reading of the code; the lead assigns the lanes. Screenshots are in
`docs/screenshots/persona-beta-25-34/`.

### 5.1 Broken, fix now

| # | Problem | Who | Screen | Screenshot | Owning file |
|---|---|---|---|---|---|
| B1 | **Internship pay posted as a yearly rate is labelled pay "for about 13 weeks … not a yearly salary".** Google's "Poland: zł156000 (PLN)" (and Microsoft's CAD 43,800–50,000) are yearly rates; the internship lasts 13–17 weeks. The drawer reads "PLN 156,000–159,000 · for about 13 weeks · Fixed-term pay, not a yearly salary", so a student reads about 48,000 zł a month, 4× the truth. In the same drawer, Juice uses it as a yearly rate ($3,470 a month gross) and "Same role elsewhere" calls it "a yearly rate". 27 postings: 23 Google, 4 Microsoft | Zofia | Drawer pay block, card tooltip | [p1-zofia-09](../screenshots/persona-beta-25-34/p1-zofia-09-intern-drawer-top.png), [p1-zofia-10](../screenshots/persona-beta-25-34/p1-zofia-10-intern-juice.png) | `public/app.js` `postedTerm` (line 134: with no `originalInterval` it returns the yearly figure with `per: null`), the pay block (line 3451 "for ${termText}"), `annualNote` (line 3380); or `server/salary.js` (the term is set on a yearly figure). Say "PLN 156,000 a year (pro rata) · the internship lasts about 13 weeks" |
| B2 | **Part-time hourly pay is annualised as full-time.** Apple's part-time *US-Technical Specialist* ($22–28.88 an hour) shows "$46K–60K · per year" on the card and in the drawer, and Juice uses $4,410 a month gross. At 20–30 hours a week that is about $23K–45K. 52 of Apple's 123 part-time postings have hourly pay annualised at 2,080 hours | Maya | Card, drawer pay block, Juice | [p3-maya-05](../screenshots/persona-beta-25-34/p3-maya-05-techspec-drawer-top.png), [p3-maya-06](../screenshots/persona-beta-25-34/p3-maya-06-techspec-juice-family.png) | `server/salary.js` (`FACTORS.hour = 2080`), `public/app.js` (card pay, `annualNote`), `server/juice.js`. For part-time, lead with the hourly rate and say "full-time equivalent", or base Juice on stated or typical hours |
| B3 | **Switching company drops a city the new board has.** From Apple to Google: "Dropped Columbus, OH, Part-time (not at Google)", then 3,417 roles. Google lists 15 Columbus roles (5 in Columbus, OH). Apple's location key is "Columbus, OH" (it also has Columbus, GA) and Google's is "Columbus", so the carried value never matches | Maya | Company switch toast, Location filter | [p3-maya-07](../screenshots/persona-beta-25-34/p3-maya-07-google-carried.png), [p3-maya-08](../screenshots/persona-beta-25-34/p3-maya-08-google-location-columbus.png) | `public/app.js` `settleKeep` (line 1196) with `locKey`/`placeCover`: match carried places by city and region, not by each board's label |
| B4 | **"Art Director", "Creative Director" and "Technical Director" are filed as Director+.** 26 postings, e.g. Apple *Art Director, Design* $143K–215K and Netflix Animation *Technical Director Lighting* $120K–180K. The Director+ filter shows them, and "Same role elsewhere: Design roles at Director+" puts Apple at $221K with them included. These are craft titles, like the Account Directors the last fix took out | Tomás | Seniority filter, card badge, Same role elsewhere, Compare companies | [p5-tomas-06](../screenshots/persona-beta-25-34/p5-tomas-06-apple-la-design-mostjuice.png), [p5-tomas-07](../screenshots/persona-beta-25-34/p5-tomas-07-creative-director-drawer.png) | `server/keywords.js` `NON_EXEC_DIRECTOR_RE` (line 998: add art and technical director, and perhaps (associate) creative director) |
| B5 | **Under a non-US city filter, the chart and cards show pay that isn't for that city.** With Zurich selected, the stats line says "0% show pay for Zurich", but the chart says "Median $122K" and "DeepMind · 3 roles · median $227K" (US ranges), and cards read "$174K–252K · Zurich, Switzerland +3" and "€106K–108K · Zurich, Switzerland +1" (Munich pay). Same in Dublin: "£240K · Dublin, Ireland +1" is London pay. The map pins were fixed for this; the chart and cards weren't | Hana (also Ciarán) | Chart, stats, cards | [p4-hana-05](../screenshots/persona-beta-25-34/p4-hana-05-google-zurich-research.png), [p2-ciaran-16](../screenshots/persona-beta-25-34/p2-ciaran-16-anthropic-dublin-account.png) | `public/viz/chart.js` and `public/app.js` (card pay, stats median): use `payLocations` (`public/features/shared.js`) the way the map does; on cards, show the pay's own city or mark it "US pay" |

### 5.2 Improve (ranked by how many of the 5 it helps)

| # | Change | Helps | Screen | Screenshot | Owning file |
|---|---|---|---|---|---|
| I1 | **Google's Department is one bucket.** "Google 3,174" of 3,417; nobody can find Sales, Operations or Design at Google, and the chart is one big row. Offer the role families Insights already has ("Sales & partnerships", "Design" …) as the Department fallback, or as a Group option in the existing select | 5/5 | Department chip, chart grouping | [p2-ciaran-03](../screenshots/persona-beta-25-34/p2-ciaran-03-google-department-pop.png), [p1-zofia-06](../screenshots/persona-beta-25-34/p1-zofia-06-warsaw-chart.png) | Google adapter's department mapping, `public/app.js` (group select), `public/features/roles.js` |
| I2 | **Grade Juice by household and place, not by fixed US-dollar steps.** $1,320 a month left in Warsaw is "Dry"; so is $3,790 a month left for a family in Columbus ("43 · Dry"). The same thresholds (Dry under $48K) apply to one person and to a family of four, in every country | 4/5 (Zofia, Ciarán, Maya, Tomás) | Cards, Juice headline, map legend | [p1-zofia-11](../screenshots/persona-beta-25-34/p1-zofia-11-tse-juice-monthly.png), [p3-maya-11](../screenshots/persona-beta-25-34/p3-maya-11-planner-juice-family.png), [p3-maya-12](../screenshots/persona-beta-25-34/p3-maya-12-map-juice-columbus.png) | `server/juice.js` (grade thresholds), `public/app.js` (`juiceScaleText`) |
| I3 | **Bring back filters a board dropped.** Krakow (dropped at NVIDIA), Culver City (dropped at Google) never return when you go back; Tomás saved a 2-role search instead of 7 without noticing | 3/5 (Zofia, Maya, Tomás) | Company switch | [p5-tomas-12](../screenshots/persona-beta-25-34/p5-tomas-12-apple-saved.png) | `public/app.js` `settleKeep` (keep the dropped values aside and re-apply them on a board that has them) |
| I4 | **Let a city include its suburbs.** "Los Angeles" misses Apple's Culver City campus; "Columbus" misses Google and Anduril sites nearby; "Dublinas, Ireland" (a typo in a Google posting) is its own city. The roadmap's "Location → within N km" fits here | 3/5 (Tomás, Maya, Ciarán) | Location filter | [p5-tomas-12](../screenshots/persona-beta-25-34/p5-tomas-12-apple-saved.png), [p2-ciaran-04](../screenshots/persona-beta-25-34/p2-ciaran-04-location-dublin.png) | `public/app.js` (`locMatches`, `placeCover`), `server/geo.js` (alias for "Dublinas") |
| I5 | **Compare with the same country.** A Warsaw entry role "Pays more than 1% of Google's roles"; a Dublin AE is set beside Netflix's US sales at $380K; Compare companies "is from every location each company lists". Use the job's (or the filter's) country, or say "mostly US pay" | 3/5 (Zofia, Ciarán, Hana) | Drawer percentile, Same role elsewhere, Compare companies | [p1-zofia-12](../screenshots/persona-beta-25-34/p1-zofia-12-tse-drawer-top.png), [p2-ciaran-06](../screenshots/persona-beta-25-34/p2-ciaran-06-ae-drawer-top.png) | `public/app.js` (percentile line), `public/features/comps.js`, `public/viz/comps.js` |
| I6 | **Show Juice and the chart in local money too.** Zofia thinks in zł, Ciarán in €, Hana in CHF and £; the drawer gives the posted currency, but Juice, the chart axis and the stats are US dollars only (first review I10, still open) | 3/5 (Zofia, Ciarán, Hana) | Juice, chart, stats | [p1-zofia-11](../screenshots/persona-beta-25-34/p1-zofia-11-tse-juice-monthly.png), [p1-zofia-06](../screenshots/persona-beta-25-34/p1-zofia-06-warsaw-chart.png) | `public/app.js` (`juiceBlock`, `money`), `public/viz/chart.js` |
| I7 | **Remember Monthly/Yearly like the household.** The household carries from job to job, the period resets to Yearly | 3/5 (Zofia, Ciarán, Maya) | Drawer Juice | [p3-maya-11](../screenshots/persona-beta-25-34/p3-maya-11-planner-juice-family.png) | `public/app.js#juiceBlock` |
| I8 | **Let a couple or family have two earners.** "Couple here means one earner" leaves Ciarán $50 a month; Maya's partner works too (first review I9, still open) | 2/5 (Ciarán, Maya) | Drawer Juice | [p2-ciaran-07](../screenshots/persona-beta-25-34/p2-ciaran-07-ae-juice-couple-monthly.png) | `public/app.js` (`HOUSEHOLDS`), `server/juice.js` |
| I9 | **Give remote roles a Juice for the city you live in.** Netflix's remote Creative Director has no Juice section at all; Maya's Columbus list mixes in remote roles with none (first review I6, still open) | 2/5 (Tomás, Maya) | Drawer, cards | [p5-tomas-08](../screenshots/persona-beta-25-34/p5-tomas-08-netflix-remote-cd-drawer.png) | `public/app.js#juiceBlock`, `server/juice.js` |
| I10 | **Keep the bonus-target percentage.** Google's sales roles say "+ 35% bonus target" (a sales manager "+ 75%"), but only "+ bonus mentioned" is stored and shown; for sales that is half the offer | 2/5 (Ciarán, Tomás) | Drawer pay block | [p2-ciaran-06](../screenshots/persona-beta-25-34/p2-ciaran-06-ae-drawer-top.png) | `server/salary.js` / `server/keywords.js` (extras: keep the %), `public/app.js` (pay labels) |
| I11 | **On a phone, open the results sheet further when the chart is small.** With 1–9 roles the chart is one row and half a screen of white, and the cards need two swipes | 2/5 (Zofia, Maya) | Phone chart and sheet | [p1-zofia-06](../screenshots/persona-beta-25-34/p1-zofia-06-warsaw-chart.png), [p1-zofia-07](../screenshots/persona-beta-25-34/p1-zofia-07-sheet-list.png) | `public/app.js` (sheet snap), `public/styles.css` |
| I12 | **Don't cut the company name on phones.** "Anthro…", "Micros…" at 390 px | 2/5 (Zofia, Maya) | Phone top bar | [p1-zofia-01](../screenshots/persona-beta-25-34/p1-zofia-01-cold.png), [p1-zofia-17](../screenshots/persona-beta-25-34/p1-zofia-17-microsoft-insights.png) | `public/styles.css` |
| I13 | **One pay format on cards.** "PLN 280K–287K" next to "PLN 210,000" and "PLN 156,000–159,000" (fixed-term pay is shown in full) | 1/5 (Zofia) | Cards | [p1-zofia-08](../screenshots/persona-beta-25-34/p1-zofia-08-sheet-interns.png) | `public/app.js` (card pay) |
| I14 | **"Multiple pay zones" for a Bachelor's/Master's split** reads as locations; say "Pay depends on degree" or list both | 1/5 (Zofia) | Drawer pay labels | [p1-zofia-09](../screenshots/persona-beta-25-34/p1-zofia-09-intern-drawer-top.png) | `public/app.js` (line 3313) |
| I15 | **"No Juice figure for Zurich"** sounds as if the site doesn't cover Zurich; say "This posting lists no pay for Zurich" | 1/5 (Hana) | Drawer Juice | [p4-hana-06](../screenshots/persona-beta-25-34/p4-hana-06-gemini-vision-drawer.png) | `public/app.js#juiceBlock` |
| I16 | **Label the filtered city's pin on the map.** The Columbus pin has no name while Seattle and Sunnyvale do | 1/5 (Maya) | Map | [p3-maya-12](../screenshots/persona-beta-25-34/p3-maya-12-map-juice-columbus.png) | `public/viz/map.js` (label collision) |
| I17 | **Keep the typed currency in the chip and link.** "€80,000" becomes "$91K+" and `smin=91000` | 1/5 (Ciarán) | Salary chip, URL | [p2-ciaran-13](../screenshots/persona-beta-25-34/p2-ciaran-13-map-account-80k.png) | `public/app.js` (`makeSalary`, URL state) |
| I18 | **Skill tags from boilerplate.** "iOS" on *Product Manager I, Chrome Web Store* comes from "Chrome is available across all major platforms — iOS, Android…" | 1/5 (Zofia) | Cards | [p1-zofia-08](../screenshots/persona-beta-25-34/p1-zofia-08-sheet-interns.png) | `server/keywords.js` |

### 5.3 Good: keep

| # | What works | Who | Screen | Screenshot | Owning file |
|---|---|---|---|---|---|
| G1 | Filters follow you to the next company, with a plain toast: "Kept Warsaw, Intern, Entry · dropped Krakow (not at NVIDIA)", "Kept 'research', Zurich" | All 5 | Company switch | [p1-zofia-15](../screenshots/persona-beta-25-34/p1-zofia-15-nvidia-carried.png), [p4-hana-05](../screenshots/persona-beta-25-34/p4-hana-05-google-zurich-research.png) | `public/app.js` `settleKeep` |
| G2 | The company menu's "Big tech" group, the role counts on desktop and the recent-company pills | All 5 | Company menu, top bar | [p1-zofia-02](../screenshots/persona-beta-25-34/p1-zofia-02-company-menu.png) | `public/app.js` (`makeCompanyMenu`) |
| G3 | One line on arrival: "Pay, and what's left after tax and rent, for 13 companies' open roles" | All 5 | Top of page | [p1-zofia-01](../screenshots/persona-beta-25-34/p1-zofia-01-cold.png) | `public/index.html`, `public/app.js` |
| G4 | The Juice breakdown: exact monthly dollars, real local tax (the Warsaw tax checked to the dollar), and plain household notes ("one earner, married and filing jointly", "each person is taxed separately here", "sized for 3 bedrooms with Oct 2025 figures") | All 5 | Drawer Juice | [p1-zofia-11](../screenshots/persona-beta-25-34/p1-zofia-11-tse-juice-monthly.png), [p4-hana-11](../screenshots/persona-beta-25-34/p4-hana-11-anthropic-pretraining-juice-couple.png) | `public/app.js#juiceBlock`, `server/juice.js` |
| G5 | Honest "no pay" outside the US: "0% show pay for Zurich", "No similar role at Apple in Switzerland lists pay … Pay from other countries isn't used", "Not enough comparable roles … Warsaw" | Hana, Zofia | Stats line, drawer, Insights | [p4-hana-08](../screenshots/persona-beta-25-34/p4-hana-08-apple-senior-rs-drawer.png), [p1-zofia-17](../screenshots/persona-beta-25-34/p1-zofia-17-microsoft-insights.png) | `public/features/compstimate.js`, `public/app.js` |
| G6 | Saved searches end to end: Save → "Find it in the company menu", "2 new" in the menu, "listed first, marked New", and a return visit that reopens where you left off | Zofia, Maya, Tomás | Quickbar, company menu, list | [p1-zofia-19](../screenshots/persona-beta-25-34/p1-zofia-19-return-menu.png), [p1-zofia-21](../screenshots/persona-beta-25-34/p1-zofia-21-return-new-tags.png), [p3-maya-14](../screenshots/persona-beta-25-34/p3-maya-14-return-cold.png) | `public/app.js` (saved searches, last view) |
| G7 | The salary box reads other currencies and says what it did: "Min: €80,000 ≈ $91K a year" | Ciarán | Salary filter | [p2-ciaran-12](../screenshots/persona-beta-25-34/p2-ciaran-12-salary-eur80k.png) | `public/app.js#makeSalary` |
| G8 | On-target earnings are labelled ("base plus commission at target") and kept out of Compare companies | Ciarán | Drawer pay block, Insights | [p2-ciaran-17](../screenshots/persona-beta-25-34/p2-ciaran-17-anthropic-dublin-ae-drawer.png) | `public/app.js`, `server/salary.js` |
| G9 | Compare companies with a Level choice and honest omissions ("Not shown: OpenAI, xAI, Cohere and Shield AI (don't state levels…)") | Hana, Tomás | Insights | [p4-hana-14](../screenshots/persona-beta-25-34/p4-hana-14-compare-staff.png) | `public/viz/comps.js`, `public/features/comps.js` |
| G10 | The Pay estimate in Insights: confidence, sample and tested accuracy ("High confidence · 19 similar roles at Microsoft, Dublin · ±6%") | Ciarán, Hana | Insights | [p2-ciaran-10](../screenshots/persona-beta-25-34/p2-ciaran-10-insights-top.png), [p4-hana-12](../screenshots/persona-beta-25-34/p4-hana-12-insights-pay-estimate.png) | `public/features/compstimate.js` |
| G11 | Whole-word search and "Best match": "intern" finds 84 internships; a chosen sort ("Most juice") is honoured while searching | Zofia, Tomás | Search, sort | [p1-zofia-22](../screenshots/persona-beta-25-34/p1-zofia-22-search-intern.png), [p5-tomas-06](../screenshots/persona-beta-25-34/p5-tomas-06-apple-la-design-mostjuice.png) | `public/app.js` |
| G12 | Plain labels: "Level not stated", "Full-time / Part-time / Not stated", "General application (no specific opening)", "Always-open posting", "Pay estimate" | Maya, Hana, all | Cards, filters | [p3-maya-02](../screenshots/persona-beta-25-34/p3-maya-02-more-sheet.png), [p4-hana-09](../screenshots/persona-beta-25-34/p4-hana-09-anthropic-london-research.png) | `public/app.js`, `public/features/roles.js` |
| G13 | Apply names the destination ("Apply on Google's careers site · google.com") and opens a new tab; a copied link opens the same role for someone else in under 1 s | All 5 | Drawer footer | [p4-hana-17](../screenshots/persona-beta-25-34/p4-hana-17-partner-opens-link.png) | `public/app.js#drawerContent` |
| G14 | Fast even with 4,879 Apple roles and 5 reviewers on 4 CPUs: first card 0.5–0.75 s, company switches 0.22–0.59 s, drawers 0.15–0.23 s, Insights 0.28–0.50 s (load 1.0–2.8) | All 5 | Everywhere | (times in §4) | — |
| G15 | Honest map groups ("Dublin, Munich and 2 more"), Juice legend with dates, and "Basemap unavailable · pins still work" | Ciarán, Maya | Map | [p2-ciaran-13](../screenshots/persona-beta-25-34/p2-ciaran-13-map-account-80k.png) | `public/viz/map.js` |
| G16 | Hourly pay keeps its hourly figures ("$22.00 and $28.88/hr, and most new hires start at $22.00") | Maya | Drawer pay block | [p3-maya-05](../screenshots/persona-beta-25-34/p3-maya-05-techspec-drawer-top.png) | `public/app.js#annualNote` |
| G17 | Dark mode is clean and readable | Tomás | Everywhere | [p5-tomas-01](../screenshots/persona-beta-25-34/p5-tomas-01-cold-dark.png) | `public/styles.css` |

## 6. The first review's Broken items: fixed or not

Checked on this build (beta), from the five `persona-stable-*.md` reviews.

| First review's Broken item | Now | Evidence |
|---|---|---|
| Anthropic sales on-target earnings shown and compared as base pay | **Fixed** | "On-target earnings (base plus commission at target)"; Compare companies leaves them out. [p2-ciaran-17](../screenshots/persona-beta-25-34/p2-ciaran-17-anthropic-dublin-ae-drawer.png) |
| Pay estimate built from another country's pay, labelled with the local city | **Fixed** | "No similar role at Apple in Switzerland lists pay … Pay from other countries isn't used." [p4-hana-08](../screenshots/persona-beta-25-34/p4-hana-08-apple-senior-rs-drawer.png) |
| "±8%" next to "low confidence"; drawer and Insights disagree | **Fixed** (not contradicted anywhere I looked) | [p2-ciaran-10](../screenshots/persona-beta-25-34/p2-ciaran-10-insights-top.png) |
| "Mid" shown as fact for titles with no level | **Fixed** ("Level not stated") | every card |
| "intern" matches International/Internal | **Fixed** | [p1-zofia-22](../screenshots/persona-beta-25-34/p1-zofia-22-search-intern.png) |
| Sort not honoured while searching | **Fixed** ("Best match" by default; Most juice honoured) | [p5-tomas-06](../screenshots/persona-beta-25-34/p5-tomas-06-apple-la-design-mostjuice.png) |
| Salary box drops "£80,000", "80k", "A$350k" | **Fixed** (€80,000 read) | [p2-ciaran-12](../screenshots/persona-beta-25-34/p2-ciaran-12-salary-eur80k.png) |
| Compare companies mixes internships with full-time pay; no level choice | **Fixed** | [p4-hana-14](../screenshots/persona-beta-25-34/p4-hana-14-compare-staff.png) |
| Same role elsewhere: wrong family, false "No other company lists this level" | **Fixed** (says "doesn't state a level, so this compares … every full-time level") | [p2-ciaran-06](../screenshots/persona-beta-25-34/p2-ciaran-06-ae-drawer-top.png) |
| Juice and "Most juice" use the best city, not the filtered one | **Fixed** (Warsaw for the Warsaw role; Krakow when both were filtered) | [p1-zofia-11](../screenshots/persona-beta-25-34/p1-zofia-11-tse-juice-monthly.png) |
| Map "San Francisco + 3 nearby" containing New York | **Fixed** ("Dublin, Munich and 2 more") | [p2-ciaran-13](../screenshots/persona-beta-25-34/p2-ciaran-13-map-account-80k.png) |
| US pay pinned on non-US cities (Sydney $61K) | **Partly fixed**: map pins and the stats line are right, but the chart and cards still show US or German pay under a Zurich filter (B5) | [p4-hana-05](../screenshots/persona-beta-25-34/p4-hana-05-google-zurich-research.png) |
| Victoria, BC filed under Australia | **Fixed** (data: "Victoria, Canada") | §7 |
| "4 new" in the menu but nothing marked New | **Fixed** | [p1-zofia-21](../screenshots/persona-beta-25-34/p1-zofia-21-return-new-tags.png) |
| Rent dates contradict; "(update due)" everywhere | **Fixed** ("rent Sep 2026 (sized for 3 bedrooms with Oct 2025 figures)") | [p3-maya-11](../screenshots/persona-beta-25-34/p3-maya-11-planner-juice-family.png) |
| "Couple" silently assumes married, filing jointly | **Fixed** (said in the breakdown); a second earner is still missing (I8) | [p2-ciaran-07](../screenshots/persona-beta-25-34/p2-ciaran-07-ae-juice-couple-monthly.png) |
| Account Director filed as Director+ | **Fixed**, but the same mistake remains for Art, Creative and Technical Director (B4) | [p5-tomas-06](../screenshots/persona-beta-25-34/p5-tomas-06-apple-la-design-mostjuice.png) |
| Fellowship stipend shown as a year's salary | **Fixed for weekly pay**; for yearly rates the new fixed-term label is now wrong the other way (B1) | [p1-zofia-09](../screenshots/persona-beta-25-34/p1-zofia-09-intern-drawer-top.png) |
| Chart empty state: two messages on top of each other | **Fixed** (one message: "No roles match … Clear the search") | [x-recheck-01](../screenshots/persona-beta-25-34/x-recheck-01-empty-state.png) |
| Ranges: highlighted title runs into its pay | **Fixed** | [x-recheck-02](../screenshots/persona-beta-25-34/x-recheck-02-ranges-hover.png) |
| "0% percentile", "$44K–44K" | **Fixed** ("The lowest pay of Apple's roles that show pay") | [p3-maya-05](../screenshots/persona-beta-25-34/p3-maya-05-techspec-drawer-top.png) |
| Map labels overlap on the phone | **Changed**: no overlap seen, but the main pin's label is dropped (I16) | [p3-maya-12](../screenshots/persona-beta-25-34/p3-maya-12-map-juice-columbus.png) |

From the first review's Improve list, still open: local currency (I6 here), second earner (I8),
Juice for remote roles (I9), "Clusters/Ranges" and "Wide range (2.4×)" wording.

## 7. Verification

- 87 screenshots in `docs/screenshots/persona-beta-25-34/`, shrunk with
  `bash scripts/cycle/shrink-screenshots.sh` (16.0 MB → 4.2 MB). One duplicate was deleted and two
  files renamed to match what they show.
- Every Broken item was checked against the raw posting or the code:
  - **B1:** the Google posting reads "[Bachelor's degree] Poland: zł156000 (PLN) + 0% bonus target … Ability to complete a
    13-17 week full-time internship". The packed list has `interval: 'year'`, no `originalInterval`
    and `termWeeks: 13`. 27 of the 77 term postings carry a yearly figure (23 Google, 4 Microsoft).
    The drawer's Juice uses $3,470/month (yearly).
  - **B2:** 123 Apple part-time postings, 52 with hourly pay; `FACTORS.hour = 2080` in `server/salary.js`.
  - **B3:** the dist lists contain "Columbus, OH" (Apple, plus "Columbus, GA") and "Columbus" (Google); Apple's
    Location facet shows "Columbus, OH", Google's "Columbus 15".
  - **B4:** 26 titles matching (art|creative|technical) director are `Director+`;
    `NON_EXEC_DIRECTOR_RE` covers only account, partner, client and test director.
  - **B5:** Gemini Vision's range is USD with locations Mountain View, Zurich, Los Angeles, New York;
    SWE III Information Security is EUR with Munich and Zurich; the stats line itself says 0%.
- Juice spot check by hand:
  - Warsaw: PLN 255K gross; ZUS 13.71% plus 9% health; tax 12%/32% with the 30K allowance. That gives about
    8,050 zł a month of deductions, which is $2,130 at the list's rate. The site says $2,130.
  - Dublin couple: about $1,820 a month by hand; the site says $1,860.
- Victoria check: Cohere's two annotation roles now read "Victoria, Canada".
- Console: no page errors. The only failed requests were the live board fetch and Chromium's own
  background requests (expected in this sandbox).
- Load average during the runs: 0.97–3.43 (1 minute).

## 8. Replayable steps

1. Serve the lead's build (shared, don't rebuild):

   ```sh
   S=/tmp/claude-0/-home-user-melon-seek/<session>/scratchpad
   P=$S/persona-beta-25-34; mkdir -p $P
   node scripts/cycle/serve.mjs --dist $S/cycle-beta/dist --pid $P/serve.pid > $P/serve.log 2>&1 &
   # serve: http://127.0.0.1:<port>/melon-seek/  → open /melon-seek/beta/
   ```

2. Playwright as ES modules ignores `NODE_PATH`, so link the shared install: `ln -sfn ../pw/node_modules $P/node_modules`.
   `$P/h.mjs` launches `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` with a phone context
   (390×844, isMobile, hasTouch, scale 2) or a desktop one (1366×768, 1440×900, 1280×800 with
   `colorScheme: 'dark'`). It numbers screenshots `<persona>-<nn>-<step>.png` and logs each timed step
   with the load average. `$P/touch.mjs` sends CDP `Input.dispatchTouchEvent` swipes to drag the
   phone results sheet.
3. One script per person and stage (`p1a…p1j`, `p2a…p2i`, `p3a…p3h`, `p4a…p4h`, `p5a…p5g`), each
   saving `context.storageState()` for the next.
4. "Come back later": copy the state, back-date `melon.saved[].lastSeenAt`, drop 1–2 ids from `seen`,
   open a new context with no link (`p1-later.json`, `p3-later.json`, `p5-later.json`).
5. Data checks: `$P/data.mjs` imports `unpackJobs` from `<dist>/beta/api.js` and unpacks
   `<dist>/beta/api/jobs/<slug>.json`. `explore*.mjs` picks the personas, `term.mjs` and `checks.mjs`
   count B1, B2 and B4, `col.mjs` lists Ohio roles, `vic.mjs` checks Victoria and "Dublinas".
   Raw posting text comes from `data/beta/snapshots/<slug>.json` (`descriptionHtml`).
6. `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/persona-beta-25-34`.
7. Stop the server: `kill "$(cat $P/serve.pid)"` (done).

## 9. Known gaps and follow-ups

- The ledger in this build is empty, so "new" was tested through remembered ids. With the
  production ledger, a "New" card can read "Listed 37 days ago" (the id was only removed by me); check
  once on the live beta site.
- The Apply pages and map tiles weren't reachable from the sandbox; Apply URLs were checked as
  strings and a new tab was seen to open.
- No throttled run: perf-mobile-beta.md already measured the throttled phone on a quiet machine, and
  nothing in this run was slow.
- Screen readers weren't tested.
- "Person" times are my judgement, not measured users.

## 10. Change log

- 2026-10-11 03:19 UTC: server started on the lead's build (83023f5); README, ROADMAP §8, the five
  first-review logs and the lead log read; personas chosen after counting the data per country,
  level and employment type.
- 2026-10-11 03:20–03:50 UTC: five runs, raw-data and code checks for B1 to B5, re-check of the first
  review's Broken items.
- 2026-10-11 03:51 UTC: server stopped, screenshots shrunk, this log written, prompt saved verbatim.
