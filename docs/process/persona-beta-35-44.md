# Persona review: job seekers aged 35–44 (beta site)

## 1. Brief

Prompt: [prompts/persona-beta-35-44.md](prompts/persona-beta-35-44.md). Five people aged 35–44, one per
career level, each did a real job hunt on the local build of the beta site (`/melon-seek/beta/`, build
`local-20261011T030306` of commit 83023f5, today's real snapshot: the 8 AI and defence boards plus Google,
Microsoft, Apple, Netflix and NVIDIA). We judged it as job seekers, not engineers. This is the second
persona review; section 4 checks what the first one ([persona-stable-35-44.md](persona-stable-35-44.md)
and the other four stable groups) called broken.

Files owned: this file, the prompt copy, and `docs/screenshots/persona-beta-35-44/` (86 PNGs, shrunk). No
product code was edited and nothing was committed.

Not reported, as the lead asked: the badge falling back to the bundled snapshot, and grey map tiles.

| # | Person | Level | City, country | Household | Field | Device | Big-tech reason | Goal reached? |
|---|---|---|---|---|---|---|---|---|
| 1 | Siobhán Byrne, 38 | New graduate, returning parent | Dublin, Ireland | Family of 4 (partner works) | Research / analytics | Phone | Google, Microsoft and Apple have their EMEA bases in Dublin | **Partly**: roles yes, money no |
| 2 | Daniel Okoye, 40 | Early career (3 yrs), ex-teacher | Toronto, Canada | Couple (partner part-time) | Sales | Desktop 1440×900 | Google and Microsoft post Toronto pay | **Yes**, after converting from US dollars |
| 3 | Rosa Delgado, 36 | Mid-career (8 yrs) | Austin, Texas, US | Single parent, 1 child | Operations | Phone | Apple's second-largest campus is in Austin | **Yes**, with "Couple" standing in for her household |
| 4 | Yael Ben-David, 43 | Staff/principal (17 yrs) | Tel Aviv, Israel | Family of 4 (one earner) | Engineering (GPU systems) | Laptop 1280×800 | NVIDIA's Israel sites; Staff pay across NVIDIA, Google, Microsoft, Apple | **Partly** |
| 5 | Hanna Vermeulen, 44 | Director (19 yrs) | Brussels, Belgium | Family of 4 (husband works) | Policy | Desktop, then phone | EU government-affairs teams at Microsoft, Google, Apple | **Partly** |

Times in the step tables are what a person would spend (clicks plus reading), estimated per step.
Machine times are measured and given where they matter. Five reviewers shared the 4-CPU machine; the
load average was 0.8–2.6 during our runs. Nothing was slow beyond the clean timings in
[perf-mobile-beta.md](perf-mobile-beta.md). Unthrottled, the cold first card took 0.47–0.74 s, a company
switch 0.14–0.54 s (Apple's 4,879 roles in 0.52 s), opening a job 0.13–0.19 s, a household re-score
0.25 s, Insights 0.3–0.5 s, the map 0.2–0.35 s and a shared link to its job 0.6 s on a phone. A cold Apple
load on a throttled phone (4× CPU, 9 Mbit/s, 150 ms) showed the first card in 3.15 s (load 2.3), against
4.1 s on Fast 4G in the perf log.

## 2. Inputs and sources

- README.md (beta site section) and docs/strategy/ROADMAP.md §8 (UI simplicity budget).
- The five stable persona reviews (`docs/process/persona-stable-*.md`) and the fix waves in
  docs/process/lead.md (persona fix wave batches 1–2, beta fix wave batches 1–2, the perf pass).
- The build's open data (`dist/beta/data/*.csv`) to pick realistic goals, and the build's own lists
  unpacked with `public/api.js#unpackJobs` to count what we saw (fixed-term labels, CAD tags, role
  families, abbreviated departments). Read-only.

## 3. Decisions

1. **Personas.** Five countries (Ireland, Canada, US, Israel, Belgium); two phones (P1, P3) and a phone
   leg for P5; all five had a reason to use the big-tech boards. Goals were set from the data before
   the runs (a city and field each board actually hires in), not to make anyone fail.
2. **"Coming back later"** is simulated with Playwright `storageState`. For P3's two-weeks-later visit
   we moved `melon.saved[].lastSeenAt` and `melon.seen.apple` back to 2026-09-27 and dropped 3 ids from
   both "seen" lists, then reopened directly and after an in-between visit to Apple.
3. **Severity.** "Broken" means a label or number is wrong or misleading, a stated rule is broken, or
   a task dead-ends. Counts in findings come from the build's own unpacked lists.

## 4. Status of what the first review called broken

| Earlier finding (stable reviews) | Now on beta | Evidence |
|---|---|---|
| Sales on-target earnings shown as base pay | **Fixed.** "On-target earnings (base plus commission at target)", percentile only against OTE roles, left out of Compare companies | [r-01](../screenshots/persona-beta-35-44/r-01-anthropic-ote-drawer.png) |
| Compstimate claims a city it never used (Sydney, London) | **Fixed.** "No similar role at NVIDIA in Israel lists pay, so there is no pay estimate. Pay from other countries isn't used." Same for Anduril Sydney | [p4-06](../screenshots/persona-beta-35-44/p4-06-principal-drawer.png) |
| "Mid" shown for every title without a level | **Fixed.** "Level not stated" with a tooltip; stated Google "III" shows Mid | [p3-04](../screenshots/persona-beta-35-44/p3-04-apple-austin-pm-list.png) |
| Wrong family in Same role elsewhere (sales head and fellowship as Security) | **Fixed** for those two (Fellows compare with AI research internships). **A new case:** Netflix distributed-systems engineers are filed as hardware (B3) | [r-02](../screenshots/persona-beta-35-44/r-02-fellows-drawer.png) |
| "4 new" in the menu but no card marked New | **Fixed**, both directly and after an in-between visit | [p3-13](../screenshots/persona-beta-35-44/p3-13-return-menu-between.png), [p3-14](../screenshots/persona-beta-35-44/p3-14-return-list-between.png) |
| US pay pinned on non-US cities (Sydney $61K) | **Fixed.** "Sydney, Melbourne and 2 more: 56 postings, no salary posted for here"; Israel pins "no published salary" | [r-03](../screenshots/persona-beta-35-44/r-03-anduril-sydney-map.png), [p4-07](../screenshots/persona-beta-35-44/p4-07-map-israel.png) |
| Victoria, BC under Australia | **Fixed.** Victoria is under CANADA | (regress run, text) |
| Search "intern" matching International/Internal | **Fixed.** Google's first 12 "intern" results are all internships | (regress run, text) |
| Salary box drops £, k, A$ | **Fixed.** "C$110,000" → "Min: CA$110,000 ≈ $78K a year" | [p2-04](../screenshots/persona-beta-35-44/p2-04-salary-cad.png) |
| Juice for the posting's best city, not the filtered one | **Fixed.** Cards and drawer use Austin, Toronto, Dublin | [p3-04](../screenshots/persona-beta-35-44/p3-04-apple-austin-pm-list.png) |
| Fellowship stipend shown as a $200K salary | **Fixed.** "$3,850 a week · for about 17 weeks". **But** the same label now goes on yearly intern pay (B1) | [r-02](../screenshots/persona-beta-35-44/r-02-fellows-drawer.png) |
| Compare companies mixes internships with full-time pay | **Fixed** (footnote says they are left out) and it has a Level choice | [p2-13](../screenshots/persona-beta-35-44/p2-13-compare-companies.png) |
| "(update due)" on every data line; contradicting rent dates | **Fixed.** One "Data as of" line per Juice block | [p1-13](../screenshots/persona-beta-35-44/p1-13-juice-family-monthly.png) |
| Monthly Juice rows that don't add up | **Fixed.** $7,310 − $1,860 − $3,740 − $2,990 = −$1,280 | [p1-13](../screenshots/persona-beta-35-44/p1-13-juice-family-monthly.png) |
| Two empty-chart messages; "≈ $44K–44K" | **Fixed** | [p4-05](../screenshots/persona-beta-35-44/p4-05-nvidia-israel-staff.png), [p1-14](../screenshots/persona-beta-35-44/p1-14-intern-drawer.png) |
| "CAD" skill tag on Canadian-dollar pay | **Still broken** on the big-tech boards (B2) | [p2-05](../screenshots/persona-beta-35-44/p2-05-after-salary.png) |

Improvements the first review asked for that have landed: filters and search kept on a company switch,
with a toast saying what was kept; a one-line tagline on arrival, phones included; no ATS headings or
slugs in the company menu; "Pay estimate" instead of "Compstimate"; a labelled Save button on phones;
saved searches at the top of the menu and the last view reopened on return; "Best match" when
searching; "Always-open posting" instead of "13y+"; the household remembered and applied to every card.
Still open: one search across all companies, Juice in local currency, more households (second earner,
single parent), role families instead of raw departments, the percentile on entry roles, "On-site"
counting the same as "Any", and part-time work.

## 5. The five people

### 5.1 Siobhán Byrne, 38, Dublin: student / new graduate (phone)

**Who.** Nine years at home with two children (6 and 9); she has just finished a part-time MSc in
business analytics. Her partner works full time as a nurse. Field: research and analytics.

**Goal.** "An internship, graduate or entry-level analyst role in Dublin at Google, Microsoft or Apple,
ideally part-time or school hours, paying at least €45,000, that leaves our family of four at least
€500 a month after tax, rent and living costs once my pay is added."

**Reached? Partly.** She found 14 Google roles in Dublin at €47K–86K (6 entry-level, 8 internships) and
2 at Microsoft. But even the best-paid entry role (€76K–78K) leaves her family −$1,280 a month, because
the site models one earner and she can't add her partner's pay. The figures are in US dollars. No board offers part-time work. And her best
lead, an MBA internship at €72,000, says "Fixed-term pay, not a yearly salary … for about 13 weeks",
which reads as €24,000 a month and contradicts the Juice line under it (B1).

| Step | What she did and saw | Time |
|---|---|---|
| 1 | Cold arrival on her phone (first card in 0.58 s). "melon·seek · Pay, and what's left after tax and rent, for 13 companies' open roles", then Anthropic's chart. The company button reads "Anthro…". The roles sit in a closed sheet, and the five big-tech boards she came for aren't visible. She taps "11 Oct": "Where this data comes from". ([p1-01](../screenshots/persona-beta-35-44/p1-01-cold-phone.png), [p1-02](../screenshots/persona-beta-35-44/p1-02-badge.png)) | 0:00–0:40 |
| 2 | The company menu has a clear "Big tech" group. She picks Google (0.48 s, 3,417 roles). The chart groups by Department: "Google 3,174", then YouTube and DeepMind, which is no help. ([p1-03](../screenshots/persona-beta-35-44/p1-03-company-menu.png), [p1-04](../screenshots/persona-beta-35-44/p1-04-google.png)) | 0:40–1:10 |
| 3 | The Location chip opens the filter sheet. She types "Dub": Dublin 137, plus "Dublinas 1" (Google's spelling, placed at the middle of Ireland). She ticks Dublin. In a later try, typing "Ireland" gives "No matches" (B5). ([p1-06](../screenshots/persona-beta-35-44/p1-06-location-dub.png), [p1-23](../screenshots/persona-beta-35-44/p1-23-location-search-ireland.png)) | 1:10–1:50 |
| 4 | Seniority: Intern 9 + Entry 7 → "Show 16 roles". Employment type offers only "Intern" and "Not stated", so there's no part-time option. ([p1-07](../screenshots/persona-beta-35-44/p1-07-seniority-intern-entry.png), [p1-08](../screenshots/persona-beta-35-44/p1-08-employment-type.png)) | 1:50–2:30 |
| 5 | The chart says "$69K median" in dollars, although all 16 roles pay in euros, and leaves half the screen blank. She drags the sheet up: €84K–86K down to €34,800, Juice 0–23 on every card. One Dublin card shows "PLN 252K–258K" (its pay is for Warsaw). ([p1-09](../screenshots/persona-beta-35-44/p1-09-google-dublin-intern-entry-chart.png), [p1-10](../screenshots/persona-beta-35-44/p1-10-list-sheet.png)) | 2:30–3:20 |
| 6 | Opens "Associate International Growth Consultant, EMEA": €76K–78K, "Posted base pay", and in bold "Pays more than 4% of Google's roles that show pay". Juice: "18 · Dry, $16,000/yr left for one person in Dublin". ([p1-11](../screenshots/persona-beta-35-44/p1-11-entry-drawer-top.png), [p1-12](../screenshots/persona-beta-35-44/p1-12-juice-single.png)) | 3:20–4:10 |
| 7 | Juice → Family → Monthly (0.25 s): **−$1,280/mo**. "Family here means one earner, married and filing jointly." Rent is a 3-bedroom in the city centre at $3,740/mo. Everything is in dollars, and there's no way to add her partner's pay or a cheaper area. ([p1-13](../screenshots/persona-beta-35-44/p1-13-juice-family-monthly.png)) | 4:10–5:40 |
| 8 | Opens "Business Analyst MBA Intern, 2027": "€72,000 · EUR · for about 13 weeks", and in orange "Fixed-term pay, not a yearly salary". She reads it as €72K for 13 weeks. The Juice line under it says "−$1,490/mo … while it lasts", which only makes sense if €72K is a yearly rate. The description just says "Ireland: €72000 (EUR)" and "a minimum 13 week full-time internship". ([p1-14](../screenshots/persona-beta-35-44/p1-14-intern-drawer.png)) | 5:40–7:10 |
| 9 | Insights (0.4 s): "Pay estimate" picks "Collections Associate" and says "Not enough comparable roles". Market insights: "1 role whose pay is for another country left out of pay figures". ([p1-15](../screenshots/persona-beta-35-44/p1-15-insights.png)) | 7:10–7:50 |
| 10 | Switches to Microsoft (0.33 s): the toast says "Kept Dublin, Intern, Entry"; 3 roles (€46K–69K, €44K–57K, no salary). One is "Ireland" only and gets no Juice. Apple: 0 roles, with "Without the location filter there would be 129 roles · Remove the location filter". ([p1-17](../screenshots/persona-beta-35-44/p1-17-microsoft-kept-filters.png), [p1-18](../screenshots/persona-beta-35-44/p1-18-microsoft-list.png), [p1-22](../screenshots/persona-beta-35-44/p1-22-apple-dublin-empty.png)) | 7:50–8:50 |
| 11 | Back on Google she taps Save: "Saved in this browser. Find it in the company menu, with its new roles". The next day the bare address reopens her Google · Dublin view, and the saved search is first in the menu. ([p1-19](../screenshots/persona-beta-35-44/p1-19-saved-toast.png), [p1-20](../screenshots/persona-beta-35-44/p1-20-return.png), [p1-21](../screenshots/persona-beta-35-44/p1-21-return-menu.png)) | 8:50–9:30 |

Total: about 9.5 minutes. Words she didn't know: Juice/Dry/Rind, Clusters/Ranges, "Fixed-term pay",
"approx US dollars", PLN. Numbers she wouldn't trust: €72,000 "for about 13 weeks"; "$69K median" over
euro roles; "Pays more than 4%".

### 5.2 Daniel Okoye, 40, Toronto: early career (desktop)

**Who.** A high-school chemistry teacher for 12 years, then 3 years as an account manager at a Canadian
software company. He lives with his partner, who works part time. Field: sales.

**Goal.** "An account manager or account executive role in Toronto at Google, Microsoft or Cohere with
a base of at least C$110,000 that leaves the two of us at least C$2,500 a month after tax, rent and living
costs."

**Reached? Yes.** Google has 14 Toronto account roles, all with pay (C$114K–202K base). "Senior Product
Account Executive, Automotive" (C$198K–202K) leaves a couple $3,980 a month, about C$5,500. He had to
convert the dollars himself, and four of his cards carried a "CAD" skill tag (B2).

| Step | What he did and saw | Time |
|---|---|---|
| 1 | Cold arrival (0.74 s). The tagline tells him what this is; he sees "13 companies", but Google and Microsoft are behind the company menu. ([p2-01](../screenshots/persona-beta-35-44/p2-01-cold-desktop.png)) | 0:00–0:15 |
| 2 | Company menu → Google; searches "account": "237 roles · 188 in title". | 0:15–0:45 |
| 3 | Location → "Toronto" → 14 roles, "100% show pay for Toronto". ([p2-02](../screenshots/persona-beta-35-44/p2-02-location-toronto.png), [p2-03](../screenshots/persona-beta-35-44/p2-03-google-account-toronto.png)) | 0:45–1:15 |
| 4 | Salary: he types "C$110,000" and it understands: "Min: CA$110,000 ≈ $78K a year". The chip then reads "$78K+", and the box "$78K", so his own number is gone. ([p2-04](../screenshots/persona-beta-35-44/p2-04-salary-cad.png)) | 1:15–2:00 |
| 5 | Cards CA$114K–202K, sorted by "Best match". Four "Senior …" cards carry a **"CAD"** tag in the skills slot. ([p2-05](../screenshots/persona-beta-35-44/p2-05-after-salary.png)) | 2:00–2:40 |
| 6 | Opens "Senior Product Account Executive, Automotive" (0.19 s): CA$198K–202K, "Posted base pay", "+ bonus mentioned". Same role elsewhere, Senior sales: Netflix $380K, Cohere $330K … Microsoft $148K, Google $131K. Nothing says which places these figures come from; Google's 50 postings are 39 US, 5 Canadian and 6 EU ones. ([p2-06](../screenshots/persona-beta-35-44/p2-06-ae-auto-drawer.png)) | 2:40–4:00 |
| 7 | Juice → Couple → Monthly: **$3,980/mo left for a couple in Toronto**, in US dollars. "state or local tax $1,430" (it's Ontario's provincial tax). "Couple here means one earner; each person is taxed separately here." He converts it: about C$5,500. ([p2-07](../screenshots/persona-beta-35-44/p2-07-juice-couple-monthly.png)) | 4:00–5:30 |
| 8 | Ranges view: dots on a US$ axis next to CA$ cards. ([p2-11](../screenshots/persona-beta-35-44/p2-11-ranges.png)) | 5:30–6:00 |
| 9 | Microsoft (0.30 s, "Kept "account", $78K+, Toronto"): 1 role, CA$128K–222K. Cohere (0.14 s): 1 role, "$135K–280K · Canada +2". Its stats line says "0% show pay for Toronto", but the card doesn't say the pay is for the US. ([p2-09 Microsoft](../screenshots/persona-beta-35-44/p2-09-microsoft-kept.png), [p2-09 Cohere](../screenshots/persona-beta-35-44/p2-09-cohere-kept.png)) | 6:00–7:00 |
| 10 | Insights on Cohere: the Pay estimate shows "Member of Technical Staff" $279K ("the most common role in your filters", 17% match), although his only role in view was a finance manager. Back on Google it is spot on: "$124K, High confidence, 14 similar roles at Google, Toronto, typically within ±15%". Skill premium lists "CAD 14". Compare companies, Sales: honest footnote "Pay is from every location each company lists". ([p2-10](../screenshots/persona-beta-35-44/p2-10-insights-cohere.png), [p2-12](../screenshots/persona-beta-35-44/p2-12-insights-google.png), [p2-13](../screenshots/persona-beta-35-44/p2-13-compare-companies.png)) | 7:00–9:00 |
| 11 | Saves the Google search. | 9:00–9:15 |

Total: about 9 minutes. Words he didn't know: Juice grades, "state or local tax" in Canada, Clusters/Ranges.
Numbers he wouldn't trust: "Google $131K" next to Netflix $380K, and the $279K Cohere estimate.

### 5.3 Rosa Delgado, 36, Austin: mid-career (phone)

**Who.** Eight years in supply-chain and operations program management at a hardware maker. Single mother
of a 10-year-old. Field: operations.

**Goal.** "An on-site or hybrid operations or program-manager role in Austin at Apple, Google or NVIDIA
paying at least $140K base that leaves me and my daughter at least $3,000 a month."

**Reached? Yes.** Apple's Manufacturing Design Program Manager ($175K–312K, Austin) leaves ≈ $11,750 a
month. But that is for "Couple" (two adults, married filing jointly), because there's no "me + one child"
household. All of Apple's paid Austin matches are co-listed in California; the 329 Austin roles with no
pay are hidden by her pay filter, which the site says.

| Step | What she did and saw | Time |
|---|---|---|
| 1 | Cold phone; company menu → Apple (0.52 s, 4,879 roles, "$214K median"). ([p3-01](../screenshots/persona-beta-35-44/p3-01-apple.png)) | 0:00–0:40 |
| 2 | Location sheet → "Austin" 646. Salary Min 140000 on the numeric keypad; the sheet says "329 roles that list no pay are hidden while a pay filter is on". "Show 316 roles". ([p3-02](../screenshots/persona-beta-35-44/p3-02-salary-keyboard.png)) | 0:40–1:40 |
| 3 | Search "program manager": "16 roles · 14 in title", Best match; the chart shows Hardware, Corporate Functions, Operations and Supply Chain. The labelled Save button is in view. ([p3-03](../screenshots/persona-beta-35-44/p3-03-apple-austin-pm-chart.png)) | 1:40–2:20 |
| 4 | Cards say "Austin, TX +1" and give Juice for Austin (66–85). Every card says "Level not stated", and the same title appears twice at two ranges ("3rd Party IP Engineering Program Manager" $175K–312K and $145K–264K) with nothing to tell them apart. ([p3-04](../screenshots/persona-beta-35-44/p3-04-apple-austin-pm-list.png)) | 2:20–3:10 |
| 5 | Opens "Manufacturing Design Program Manager" (0.13 s): "Posted as "… (MDPM)"", $175K–312K, "This posting doesn't state a level, so this compares Program & project management roles at every full-time level". Apple's text: "your base pay will depend on … location". ([p3-05](../screenshots/persona-beta-35-44/p3-05-mdpm-drawer.png)) | 3:10–4:10 |
| 6 | Juice: Just me / Couple / Family. She picks Couple → Monthly: **$11,750/mo left in Austin**; Compare locations: San Francisco $7,550. ([p3-06](../screenshots/persona-beta-35-44/p3-06-juice-couple-monthly.png), [p3-07](../screenshots/persona-beta-35-44/p3-07-compare-locations.png)) | 4:10–5:20 |
| 7 | "Apply on Apple's careers site · jobs.apple.com" opens a new tab. ([p3-08](../screenshots/persona-beta-35-44/p3-08-description-apply.png)) | 5:20–5:40 |
| 8 | Map: "Austin, TX $204K · 16", plus "Cupertino, Culver City and 2 more $204K · 16" (the same 16 roles) and "Beaverton and Seattle $244K · 3". ([p3-09](../screenshots/persona-beta-35-44/p3-09-map-austin.png)) | 5:40–6:20 |
| 9 | Google (0.54 s, filters kept): 41 roles. "Leadership Technical Program Manager I/II" are tagged **Entry** at $192K–278K, the same pay as "Senior Technical Program Manager". ([p3-10 Google](../screenshots/persona-beta-35-44/p3-10-google-austin-pm.png), [e-02](../screenshots/persona-beta-35-44/e-02-google-leadership-tpm-entry.png)) | 6:20–7:20 |
| 10 | NVIDIA (0.34 s): 15 roles. The department lines read "Program Mgr, Technical", "Mgmt, Accounting", "Account Mgr, Dev Relations" (B4). ([p3-10 NVIDIA](../screenshots/persona-beta-35-44/p3-10-nvidia-austin-pm.png)) | 7:20–8:00 |
| 11 | Back to Apple and Save. Two weeks later (simulated) the bare address reopens her search; the menu says "3 new" and the toast "3 new roles since you last opened this search — listed first, marked New". Three cards are marked New, also after an in-between visit to Apple. ([p3-11](../screenshots/persona-beta-35-44/p3-11-saved.png), [p3-13](../screenshots/persona-beta-35-44/p3-13-return-menu-direct.png), [p3-14](../screenshots/persona-beta-35-44/p3-14-return-list-direct.png)) | 8:00–9:00 |

Total: about 9 minutes. Words she didn't know: Juice grades, "Mgmt", "Sys SW", "BPR", "MDPM". Numbers she
wouldn't trust: the same Apple title at two ranges; "Entry" on a $192K–278K leadership role.

### 5.4 Yael Ben-David, 43, Tel Aviv: senior / staff (laptop)

**Who.** Seventeen years in GPU drivers and systems software; principal engineer at a chip start-up.
Married with two children; her husband stays home. Field: engineering.

**Goal.** "A principal or staff GPU or systems-software role at NVIDIA in Israel (Tel Aviv or Yokneam), a
fair comparison of Staff/Principal pay at NVIDIA, Google, Microsoft and Apple, and, if no Israeli role
lists pay, what a move to Santa Clara would leave my family of four (at least $8,000 a month)."

**Reached? Partly.** NVIDIA has 8 Staff+ roles in Israel and none lists pay. The site says so plainly
and refuses to guess from US pay, which is right. Compare companies at Staff+ works and is honest about
pooling locations. Santa Clara leaves ≈ $15,100 a month. But the site can't tell her which NVIDIA level
("Level 6 / Level 7") matches a Google Staff or Microsoft Principal role. Its top "hardware" comparison
(Netflix $699K) is built from software engineers (B3).

| Step | What she did and saw | Time |
|---|---|---|
| 1 | Cold laptop (0.66 s). Company menu, types "nvi", Enter → NVIDIA (0.39 s): 2,665 roles, 52% show pay, $239K median. ([p4-01](../screenshots/persona-beta-35-44/p4-01-cold-laptop.png), [p4-02](../screenshots/persona-beta-35-44/p4-02-nvidia.png)) | 0:00–0:30 |
| 2 | Location: types "Israel" → only "Haifa District, Israel 13" (B5). Tries "Tel" → Tel Aviv 234 and "Yok" → Yokneam 313; ticks both. Behind the popover the chart rows read "Mgmt, Legal (Legal)", "Mgmt, Corp Marketing" (B4). ([p4-03](../screenshots/persona-beta-35-44/p4-03-location-israel.png)) | 0:30–1:30 |
| 3 | Seniority: Senior 262, Staff+ 8, Manager 37, Director+ 2. Staff+ → 8 roles, "0% show pay for these places", and one clear chart message, "No published salaries". ([p4-04](../screenshots/persona-beta-35-44/p4-04-seniority-israel.png), [p4-05](../screenshots/persona-beta-35-44/p4-05-nvidia-israel-staff.png)) | 1:30–2:15 |
| 4 | Opens "Principal Verification Chip Design Engineer": "No similar role at NVIDIA in Israel lists pay, so there is no pay estimate. Pay from other countries isn't used." ([p4-06](../screenshots/persona-beta-35-44/p4-06-principal-drawer.png)) | 2:15–3:00 |
| 5 | Map: Tel Aviv 7, Yokneam 5, Ra'anana 1, all "no published salary". ([p4-07](../screenshots/persona-beta-35-44/p4-07-map-israel.png)) | 3:00–3:30 |
| 6 | Insights: not enough comparables. Compare companies → Software engineering, Staff+: Netflix $699K, Anthropic $425K, OpenAI $355K, NVIDIA $352K, Apple $270K, Google $253K, Microsoft $209K, "Pay is from every location each company lists". Hardware & systems, Staff+: Netflix $699K on top again. ([p4-08](../screenshots/persona-beta-35-44/p4-08-insights-israel.png), [p4-09](../screenshots/persona-beta-35-44/p4-09-compare-staff-swe.png), [p4-10](../screenshots/persona-beta-35-44/p4-10-compare-staff-hw.png)) | 3:30–5:30 |
| 7 | Santa Clara + Staff+ + "gpu": 78 roles, 97% with pay; Distinguished $320K–489K, Principal $272K–431K; an "Always-open posting" label. ([p4-11](../screenshots/persona-beta-35-44/p4-11-santa-clara-staff-gpu.png)) | 5:30–6:15 |
| 8 | Opens "Distinguished Resiliency and Safety Architect"; Family → Monthly: **$15,100/mo left for a family of four in San Jose**. The role is in Santa Clara, and nothing says San Jose's costs stand in for it. ([p4-12](../screenshots/persona-beta-35-44/p4-12-principal-santa-clara-drawer.png), [p4-13](../screenshots/persona-beta-35-44/p4-13-juice-family-santa-clara.png)) | 6:15–7:30 |
| 9 | "Principal Firmware Engineer": "Pay by level: Level 6: $272K–431.3K · Level 7: $320K–488.8K", NVIDIA's own numbers with no key. Same role elsewhere, Hardware Staff+: Netflix 4 roles at $699K, which are "Distributed Systems Engineer 6 – Ads …" software roles ([e-03](../screenshots/persona-beta-35-44/e-03-netflix-dse-hardware.png)). ([p4-14](../screenshots/persona-beta-35-44/p4-14-pay-by-level.png)) | 7:30–8:30 |
| 10 | Group by Seniority: NVIDIA "Senior" is 1,589 of 2,665 roles; Microsoft's Staff+ (its "Principal" titles) has a $209K median. ([p4-15](../screenshots/persona-beta-35-44/p4-15-nvidia-by-seniority.png), [p4-16](../screenshots/persona-beta-35-44/p4-16-microsoft-by-seniority.png)) | 8:30–9:15 |
| 11 | Saves "NVIDIA · Staff+ · Yokneam, Tel Aviv" for when pay appears. ([p4-17](../screenshots/persona-beta-35-44/p4-17-saved-israel.png)) | 9:15–9:30 |

Total: about 9.5 minutes. Words she didn't know: "Level 6 / Level 7", Juice grades, "Sys SW" (she guessed
it). Numbers she wouldn't trust: Netflix $699K as "hardware"; San Jose for Santa Clara.

### 5.5 Hanna Vermeulen, 44, Brussels: director (desktop, then phone)

**Who.** Nineteen years in EU public affairs, now director of EU affairs at a telecom group. Married with
two teenagers; her husband teaches. Field: policy.

**Goal.** "A Director or Head of government affairs or public policy role in Brussels (or elsewhere in
the EU) at Microsoft, Google, Apple, OpenAI or Anthropic, with a base of at least €150,000, that leaves
our family at least €4,000 a month, and a comparison of what each company pays its policy directors."

**Reached? Partly.** She found the right role: Microsoft "Government Affairs Director" in Brussels at
€131K–221K, Director+. But it gets no Juice at all, because its location is "Belgium" with no city. There
is no director-level policy comparison (only 3 companies post policy pay, and the Level menu stops at
Manager). Finding it took 7 company switches.

| Step | What she did and saw | Time |
|---|---|---|
| 1 | Cold desktop, lands on Anthropic; searches "government affairs": "No roles match "government affairs". Check the spelling, or try a shorter or different word." Google has 24 such roles. ([p5-01](../screenshots/persona-beta-35-44/p5-01-cold-desktop.png), [p5-09](../screenshots/persona-beta-35-44/p5-09-anthropic-empty-search.png)) | 0:00–0:40 |
| 2 | Goes through the menu one company at a time (each switch under 0.5 s, search kept): Microsoft 4, Google 24 (mostly US managers; the EU ones are Manager level, such as Berlin €132K–135K and Paris €144K–147K), Apple 2 (Brazil, China, no pay), OpenAI 0, Anthropic 0, NVIDIA 1 (Taipei), Netflix 0. About 21 clicks. ([p5-02](../screenshots/persona-beta-35-44/p5-02-microsoft-gov-affairs.png)) | 0:40–3:40 |
| 3 | Microsoft "Government Affairs Director": €131K–221K, Director+, "Posted base pay". Same role elsewhere: "Too few Director+ … so this compares … at every full-time level": OpenAI $266K, Anthropic $247K, Google $183K. **No Juice section**: the location is "Belgium", though the description says "The EGA team in Brussels". ([p5-03](../screenshots/persona-beta-35-44/p5-03-gad-drawer.png)) | 3:40–5:00 |
| 4 | Location search "Belgium" → only "Belgium 2"; "Brussels" → 13. ([p5-05](../screenshots/persona-beta-35-44/p5-05-location-belgium.png)) | 5:00–5:30 |
| 5 | Anthropic, "policy" + Director+: 12 roles, 2 in title (Head of Policy Design $330K–395K, San Francisco); the rest are description matches such as "Head of Accounting Policy". ([p5-10](../screenshots/persona-beta-35-44/p5-10-anthropic-policy-director.png)) | 5:30–6:30 |
| 6 | Insights → Compare companies → "Policy & government affairs (3 companies)": the Level menu offers only Senior and Manager. "Not shown: Cohere and Microsoft (fewer than 3 postings with pay)". ([p5-06](../screenshots/persona-beta-35-44/p5-06-compare-policy.png)) | 6:30–7:30 |
| 7 | "Copy link to this role" → "Link copied". On the tram she opens it on her phone (0.6 s): the same job; Back closes it and keeps "government affairs". ([p5-07](../screenshots/persona-beta-35-44/p5-07-phone-link.png), [p5-08](../screenshots/persona-beta-35-44/p5-08-phone-after-back.png)) | 7:30–8:30 |
| 8 | She had saved the search on the desktop; the phone's menu has no saved searches. The toast did say "in this browser". | 8:30–9:00 |

Total: about 9 minutes, 3 of them switching companies. Words she didn't know: Juice grades, "Director+",
"approx US dollars". Numbers she wouldn't trust: a policy "comparison" made of US manager roles.

## 6. Findings for the group

Each item: the persona(s), the screen, a screenshot, and the owning file where we could tell.

### 6.1 Broken, fix now

1. **B1. Yearly intern pay is labelled "Fixed-term pay, not a yearly salary … for about N weeks".**
   27 postings: Google 23 (internships in the US, Canada and Europe posted as a yearly amount, e.g.
   "Ireland: €72000 (EUR)", "$58000 - $77000 (USD)") and Microsoft 4 (Canada data-centre internships posted as "CAD $43,800 - CAD $50,000
   per year"). The drawer says the amount covers 13 or 26 weeks, while the chart, the card and Juice all
   treat it as yearly, so the label contradicts the numbers next to it. Microsoft's line contradicts
   itself: "Fixed-term pay, not a yearly salary (as posted: CAD $43,800 - CAD $50,000 per year)". The
   programme lengths are right (a 13-week and a 6-month internship); what's wrong is calling a yearly rate
   the pay for the whole term. — P1 · drawer pay block ·
   [p1-14](../screenshots/persona-beta-35-44/p1-14-intern-drawer.png),
   [e-01](../screenshots/persona-beta-35-44/e-01-microsoft-intern-per-year.png) · `server/salary.js`
   (`payTerms` sets `termWeeks` for any fixed-term title, whatever the posted interval), `public/app.js` (pay block, "Fixed-term pay, not a yearly salary", ~line
   3380, and the "for about N weeks" subline).
2. **B2. A "CAD" (computer-aided design) skill tag on 109 postings paid in Canadian dollars**: Google 64,
   Microsoft 43, Cohere 2. It shows on cards ("Senior · 38 Dry · CAD"), in the Skills filter, and in
   Insights' Skill premium ("CAD 14 ±$0"). The stable fix (P-17) misses Google's "$138000 - $141000 (CAD)"
   and Microsoft's formats. — P2 · cards, Insights ·
   [p2-05](../screenshots/persona-beta-35-44/p2-05-after-salary.png),
   [p2-12](../screenshots/persona-beta-35-44/p2-12-insights-google.png) · `server/keywords.js` (CAD rule,
   ~line 536).
3. **B3. Netflix "Distributed Systems Engineer" (12 software postings) is filed as Hardware & systems
   engineering.** So "Same role elsewhere" and Compare companies show Netflix $699K as the top Staff+
   hardware pay, and an NVIDIA firmware engineer is compared with Netflix ad-platform software engineers.
   The hardware rule's `systems (engineer|…)` matches before any software rule. — P4 · drawer, Insights ·
   [p4-14](../screenshots/persona-beta-35-44/p4-14-pay-by-level.png),
   [p4-10](../screenshots/persona-beta-35-44/p4-10-compare-staff-hw.png),
   [e-03](../screenshots/persona-beta-35-44/e-03-netflix-dse-hardware.png) · `public/features/roles.js`
   (`roleFamily`, the `hardware` rule ~line 218).
4. **B4. NVIDIA's and Microsoft's department names are unexplained abbreviations**: "Mgmt, Sys SW",
   "Engineer, Sys SW", "Program Mgr, Technical", "Mgmt, SW Eng", "Mgmt, Dev Tech SW", "Customer Success
   Account Mgmt". That's 69 of NVIDIA's 146 departments (1,198 postings, 45% of the board) and 5 of
   Microsoft's (118 postings). They show on every card, on the chart rows and in the Department filter,
   which breaks the user's 2026-10-03 rule of no unexplained abbreviations (lead.md). — P3, P4 · cards,
   chart, filter · [p4-03](../screenshots/persona-beta-35-44/p4-03-location-israel.png),
   [p3-10](../screenshots/persona-beta-35-44/p3-10-nvidia-austin-pm.png) · `server/sources/eightfold.js`
   (`department`, ~line 109), or a display expansion like `readableTitle` in `public/features/roles.js`.
5. **B5. Searching the Location filter for a country hides that country's cities.** "Ireland" at Google
   gives "No matches" (Dublin has 137). "Israel" at NVIDIA shows only "Haifa District, Israel 13" (Tel
   Aviv 234 and Yokneam 313 are hidden). "Canada" shows only the 6 province-only roles, "India" only
   "India 16" (Bengaluru 198), "Germany" only "Germany 1" (Munich 39), "Belgium" only "Belgium 2"
   (Brussels 13). A person reads the count as "this company barely hires here". — P1, P4, P5 · Location
   popover and sheet · [p1-23](../screenshots/persona-beta-35-44/p1-23-location-search-ireland.png),
   [p4-03](../screenshots/persona-beta-35-44/p4-03-location-israel.png),
   [p5-05](../screenshots/persona-beta-35-44/p5-05-location-belgium.png) · `public/app.js`
   (`makeChecklist` search matches the item label only, not its country group).

### 6.2 Improve, ranked by how many of the 5 it would help

| Rank | Change | Helps | Screen · screenshot · file |
|---|---|---|---|
| 1 | **Search all companies at once, or at least say where else a search matches.** Filters are now kept on a switch, but P5 still switched 7 companies (≈ 21 clicks, 3 min) to find government-affairs roles. The empty state on Anthropic only says "Check the spelling" while Google has 24. P1, P2 and P3 each switched 2–3 companies the same way. | 5/5 | empty state, company menu · [p5-09](../screenshots/persona-beta-35-44/p5-09-anthropic-empty-search.png), [p5-02](../screenshots/persona-beta-35-44/p5-02-microsoft-gov-affairs.png) · `public/app.js` (`emptyState` ~line 2488, `switchCompany`) |
| 2 | **Make the beta's first 10 seconds about big tech.** All five came for Google, Microsoft, Apple, NVIDIA or Netflix. The site opens on Anthropic, and the big-tech boards are behind the company menu. On phones the company name is cut ("Anthro…", "Micros…") and no card shows above the fold. | 5/5 | landing · [p1-01](../screenshots/persona-beta-35-44/p1-01-cold-phone.png), [p1-17](../screenshots/persona-beta-35-44/p1-17-microsoft-kept-filters.png), [p2-01](../screenshots/persona-beta-35-44/p2-01-cold-desktop.png) · `public/app.js` `boot`, `public/styles.css` |
| 3 | **More households: a second earner, a single parent with children, and "my rent" or "outside the centre".** The household is now remembered and applies to cards (good), but it's still set only inside a collapsed drawer section. P1's family is −$1,280/mo because her partner's pay can't be added. P3 had to pose as a married couple. P2's and P5's partners work too. The engine already accepts a rent override (`rentOverrideUSD`). | 4/5 (P1, P2, P3, P5) | drawer Juice · [p1-13](../screenshots/persona-beta-35-44/p1-13-juice-family-monthly.png), [p3-06](../screenshots/persona-beta-35-44/p3-06-juice-couple-monthly.png) · `public/app.js` (`HOUSEHOLDS` ~line 3070, `juiceBlock`), `server/juice.js` |
| 4 | **Group and filter big-tech boards by role family, not their raw departments.** Google's Department is "Google 3,174 · YouTube 144 · DeepMind 95" (93% in one bucket). NVIDIA's are job-family codes, Apple's are 11 broad divisions. The site already computes role families (Compare companies). | 4/5 (P1–P4) | chart, Department filter · [p1-04](../screenshots/persona-beta-35-44/p1-04-google.png), [p4-03](../screenshots/persona-beta-35-44/p4-03-location-israel.png) · `public/app.js` (`groupBy`/`deptKey`), `public/features/roles.js` |
| 5 | **Show Juice, the stats line and the chart axis in local currency too.** The salary box now reads C$ and €, but everything after it is US dollars: "$69K median" over 16 euro roles, "$3,980/mo" for a Toronto couple, "−$1,280/mo" for a Dublin family. After P2 typed "C$110,000" the chip and box show "$78K+". | 3/5 (P1, P2, P5) | stats line, Juice, Salary chip · [p1-09](../screenshots/persona-beta-35-44/p1-09-google-dublin-intern-entry-chart.png), [p2-07](../screenshots/persona-beta-35-44/p2-07-juice-couple-monthly.png), [p2-05](../screenshots/persona-beta-35-44/p2-05-after-salary.png) · `public/app.js` (`juiceBlock`, `stats`, `makeSalary`) |
| 6 | **"Same role elsewhere" should say it pools every location (as Compare companies now does), and offer the person's own country.** Google's "Senior sales $131K" pools 39 US, 5 Canadian and 6 EU postings; P2 couldn't tell, and P5's Brussels director was compared with US managers. | 3/5 (P2, P4, P5) | drawer · [p2-06](../screenshots/persona-beta-35-44/p2-06-ae-auto-drawer.png), [p5-03](../screenshots/persona-beta-35-44/p5-03-gad-drawer.png) · `public/app.js` `sameRoleSection` (~line 3573), `public/features/comps.js` |
| 7 | **Explain levels on big-tech boards.** "Pay by level: Level 6 … Level 7" uses NVIDIA's internal numbers with no key. Google "Leadership Technical Program Manager I/II" are tagged Entry at Senior pay ($192K–278K). Apple shows the same title twice at two ranges, both "Level not stated". Staff+ lumps Staff, Principal and Distinguished with no cross-company mapping. | 2/5 (P3, P4) | drawer, cards · [p4-14](../screenshots/persona-beta-35-44/p4-14-pay-by-level.png), [e-02](../screenshots/persona-beta-35-44/e-02-google-leadership-tpm-entry.png), [p3-04](../screenshots/persona-beta-35-44/p3-04-apple-austin-pm-list.png) · `public/app.js` `payLevelsLine` (~line 3297), the company ladders from fix-beta-pay, `public/features/roles.js` `displayLevel` |
| 8 | **Give Juice to roles listed by country only** (use the main city, e.g. Belgium → Brussels, Ireland → Dublin, or ask). Microsoft's "Government Affairs Director · Belgium" and "Digital Cloud Solution Architect · Ireland" have no Juice. | 2/5 (P5, P1) | drawer, cards · [p5-03](../screenshots/persona-beta-35-44/p5-03-gad-drawer.png), [p1-18](../screenshots/persona-beta-35-44/p1-18-microsoft-list.png) · `server/juice.js` / `public/api.js` (attaching Juice) |
| 9 | **Frame the percentile against the same level.** "Pays more than 4% of Google's roles" in bold on an entry role (25% on a senior AE) discourages and says little. | 2/5 (P1, P2) | drawer pay block · [p1-11](../screenshots/persona-beta-35-44/p1-11-entry-drawer-top.png) · `public/app.js` `percentile` (~line 3013) |
| 10 | **Phones: the chart leaves half the screen empty for one or two groups, while the cards stay in a closed sheet.** | 2/5 (P1, P3) | phone chart · [p1-09](../screenshots/persona-beta-35-44/p1-09-google-dublin-intern-entry-chart.png), [p3-03](../screenshots/persona-beta-35-44/p3-03-apple-austin-pm-chart.png) · `public/styles.css` |
| 11 | **Name the stand-in city.** Santa Clara and Los Gatos roles say "left … in San Jose" with no note that San Jose's costs are used. | 1/5 (P4) | drawer Juice · [p4-13](../screenshots/persona-beta-35-44/p4-13-juice-family-santa-clara.png) · `public/app.js` `juiceBlock` (`place`) |
| 12 | **Tax wording outside the US.** "state or local tax" for Ontario's provincial tax; "Couple here means one earner; each person is taxed separately here" reads as a contradiction. | 1/5 (P2) | drawer Juice · [p2-07](../screenshots/persona-beta-35-44/p2-07-juice-couple-monthly.png) · `public/app.js` (`taxHowText`, tax row labels) |
| 13 | **The Pay estimate ignores the search.** On Cohere it showed "Member of Technical Staff" ($279K, 17% match) as "the most common role in your filters" when the only role in view was a finance manager. | 1/5 (P2) | Insights · [p2-10](../screenshots/persona-beta-35-44/p2-10-insights-cohere.png) · `public/features/compstimate.js` |
| 14 | **A card whose pay is for another country should say so.** Cohere "Finance Systems and Automation Manager $135K–280K · Canada +2", while the stats line says "0% show pay for Toronto"; Google's "PLN 252K–258K" card under a Dublin filter. | 2/5 (P1, P2) | cards · [p2-09](../screenshots/persona-beta-35-44/p2-09-cohere-kept.png), [p1-10](../screenshots/persona-beta-35-44/p1-10-list-sheet.png) · `public/app.js` `card` |
| 15 | **With a location filter, the map still pins the co-listed cities** ("Cupertino, Culver City and 2 more · 16" beside "Austin · 16": the same roles). | 1/5 (P3) | map · [p3-09](../screenshots/persona-beta-35-44/p3-09-map-austin.png) · `public/viz/map.js` |
| 16 | **Two medians on the landing screen**: the stats line says "$347K median" and the chart header "Median $352K" (Anthropic). | 1/5 (P2) | desktop landing · [p2-01](../screenshots/persona-beta-35-44/p2-01-cold-desktop.png) · `public/app.js` `stats`, `public/viz/chart.js` |
| 17 | **The Remote filter's "On-site" count equals "Any"** (Google: Any 3,417 · On-site 3,417). | 1/5 (P1) | filter sheet · `public/app.js` `makeRemote` |
| 18 | **No part-time option.** Employment type offers only "Intern" and "Not stated" at Google Dublin; say that boards don't state it. | 1/5 (P1) | filter sheet · [p1-08](../screenshots/persona-beta-35-44/p1-08-employment-type.png) · `public/app.js` `renderFilterPanel` |
| 19 | **Small data oddities.** "Dublinas, Ireland" (Google's spelling) is placed at the middle of Ireland, so the Dublin filter misses it. Card pills mix "€68,500–71,000" with "€76K–78K". | 1/5 (P1) | Location filter, cards · [p1-06](../screenshots/persona-beta-35-44/p1-06-location-dub.png) · `server/geo.js`, `public/app.js` `salaryRange` |

### 6.3 Good: keep

| What | Who | Screen · screenshot · file |
|---|---|---|
| **Filters and search kept on a company switch, with a toast that says so** ("Kept Dublin, Intern, Entry"). It turned the first review's worst chore into one tap. | all 5 | company menu · [p1-17](../screenshots/persona-beta-35-44/p1-17-microsoft-kept-filters.png) · `public/app.js` `switchCompany` |
| **The company menu**: a "Big tech" group, plain names, saved searches first, type-ahead plus Enter. | all 5 | [p1-03](../screenshots/persona-beta-35-44/p1-03-company-menu.png), [p1-21](../screenshots/persona-beta-35-44/p1-21-return-menu.png) · `public/app.js` `makeCompanyMenu` |
| **Honest "no pay" handling**: "No similar role at NVIDIA in Israel lists pay … Pay from other countries isn't used"; "0% show pay for these places"; "329 roles that list no pay are hidden while a pay filter is on"; "1 role whose pay is for another country left out"; pins with "no published salary". | P1–P5 | [p4-06](../screenshots/persona-beta-35-44/p4-06-principal-drawer.png), [p3-02](../screenshots/persona-beta-35-44/p3-02-salary-keyboard.png), [p4-07](../screenshots/persona-beta-35-44/p4-07-map-israel.png) · `public/features/compstimate.js`, `public/app.js` `stats`, `public/viz/map.js` |
| **The Juice waterfall**: the rows add up monthly, there's a "Data as of" line, tax parts and how a household was taxed, "Compare locations". The household choice is remembered and re-scores every card in 0.25 s. | all 5 | [p1-13](../screenshots/persona-beta-35-44/p1-13-juice-family-monthly.png), [p3-07](../screenshots/persona-beta-35-44/p3-07-compare-locations.png) · `public/app.js` `juiceBlock`/`setHousehold` |
| **A salary box that reads other currencies** ("C$110,000 ≈ $78K a year"), with a numeric keypad on phones. | P2, P3 | [p2-04](../screenshots/persona-beta-35-44/p2-04-salary-cad.png), [p3-02](../screenshots/persona-beta-35-44/p3-02-salary-keyboard.png) · `public/app.js` `makeSalary` |
| **Saved searches and returning**: a labelled Save on phones, a toast that says where it went, the last view reopened, and "3 new" with matching New tags. | P1, P3, P4 | [p1-20](../screenshots/persona-beta-35-44/p1-20-return.png), [p3-14](../screenshots/persona-beta-35-44/p3-14-return-list-direct.png) · `public/app.js` `toggleSave`, `savedNewCount` |
| **The Pay estimate when it has real matches**: Google Toronto AE "$124K, High confidence, 14 similar roles, typically within ±15%", with the matching roles listed. | P2 | [p2-12](../screenshots/persona-beta-35-44/p2-12-insights-google.png) · `public/features/compstimate.js` |
| **Compare companies** with a Level choice and a footnote that says what's left out and that every location is pooled. | P2, P4 | [p2-13](../screenshots/persona-beta-35-44/p2-13-compare-companies.png), [p4-09](../screenshots/persona-beta-35-44/p4-09-compare-staff-swe.png) · `public/features/comps.js` |
| **Helpful empty states**: "No roles match every filter. Without the location filter there would be 129 roles · Remove the location filter". | P1 | [p1-22](../screenshots/persona-beta-35-44/p1-22-apple-dublin-empty.png) · `public/app.js` `emptyState` |
| **Plain labels for odd postings**: "Always-open posting", "Open 180+ days …", "General application (no specific opening)" on Netflix talent pools, "Posted as …" for expanded titles, "On-target earnings". | P3, P4 | [p4-11](../screenshots/persona-beta-35-44/p4-11-santa-clara-staff-gpu.png), [e-04](../screenshots/persona-beta-35-44/e-04-netflix-talent-pools.png), [p3-05](../screenshots/persona-beta-35-44/p3-05-mdpm-drawer.png) · `public/features/freshness.js`, `public/app.js` |
| **Apply and share**: the button names the site (google.com, jobs.apple.com, jobs.nvidia.com) and opens a new tab; "Link copied" reopens the same job on a phone, and Back closes it. | P3, P5 | [p3-08](../screenshots/persona-beta-35-44/p3-08-description-apply.png), [p5-07](../screenshots/persona-beta-35-44/p5-07-phone-link.png) · `public/app.js` `postingLink`/`copyLink` |
| **Speed on big boards**: Apple's 4,879 roles switch in 0.52 s, a job opens in 0.13–0.19 s, a throttled phone shows Apple's first card in 3.15 s. | all 5 | everywhere · `public/api.js`, `public/app.js` |

## 7. Replayable steps

1. `node scripts/cycle/serve.mjs --dist <scratch>/cycle-beta/dist --pid <scratch>/persona-beta-35-44/serve.pid`
   in the background. It printed `serve: http://127.0.0.1:43705/melon-seek/`; the site is `/melon-seek/beta/`.
2. Playwright from `<scratch>/pw/node_modules` via `createRequire` (ESM ignores `NODE_PATH`), Chromium at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, one browser at a time, closed after each script.
   - Phone: 390×844, `isMobile`, `hasTouch`, DPR 2. Desktop 1440×900; laptop 1280×800.
   - Locale and time zone per person: en-IE Dublin, en-CA Toronto, en-US Chicago, en-GB Jerusalem,
     en-GB Brussels.
3. Scripts in `<scratch>/persona-beta-35-44/`, with helpers in `lib.mjs`. Each one clicks or taps through
   the UI and writes PNGs to `docs/screenshots/persona-beta-35-44/`.
   - P1: `p1a`–`p1e`, `misc2`. P2: `p2a`–`p2d`. P3: `p3a`–`p3d`. P4: `p4a`–`p4d`. P5: `p5a`–`p5d`.
   - Earlier findings: `regress.mjs`; evidence shots `evid.mjs` and `evid2.mjs`; location search
     `locsearch.mjs`.
   - Between sessions `storageState` (`p1-state.json` …) keeps localStorage, which simulates coming back.
4. The two-weeks-later return (P3): `p3-return.json` is `p3-state.json` with the saved search's
   `lastSeenAt` and `melon.seen.apple` set to 2026-09-27 and 3 ids dropped from both "seen" lists. Then
   `p3d.mjs` opens it directly, and again after visiting `#c=apple`.
5. Data counts, read-only, from the build's own lists: `unpack.mjs` loads `dist/beta/api.js#unpackJobs`.
   - `terms.mjs` and `terms2.mjs`: fixed-term postings by posted interval.
   - `cad.mjs`: CAD tags on CAD pay. `fam.mjs` and `fam2.mjs`: role families via
     `dist/beta/features/roles.js#roleFamily`.
   - `abbr.mjs`: abbreviated departments. `levels.mjs`: Google levels. `lv.mjs`: NVIDIA pay by level.
   - `misc.mjs`: "Dublinas" and talent pools. `term3.mjs`: runs `server/salary.js#programTerm` on two
     internship descriptions (13 weeks; Microsoft's "6-month internship").
6. Machine timings: `timing.mjs` (Insights, map and job open on Apple and NVIDIA, phone and laptop; the
   shared link on a phone), with no fixed waits inside the timed span. Throttled phone timing (`misc2.mjs`): CDP `Emulation.setCPUThrottlingRate` 4, then
   `Network.emulateNetworkConditions` with 150 ms latency, 9 Mbit/s down and 750 kbit/s up; cold
   `#c=apple`.
7. `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/persona-beta-35-44` (15.2 MB → 4.0 MB).
8. Stop: `kill "$(cat <scratch>/persona-beta-35-44/serve.pid)"`.

## 8. Known gaps

- "Coming back later" is simulated by editing localStorage, not by waiting for a new crawl. The "New ·
  Listed 13 months ago" pairs in [p3-14](../screenshots/persona-beta-35-44/p3-14-return-list-direct.png)
  come from that simulation (we dropped old ids).
- No job board is reachable from the sandbox, so Apply was checked up to the link (name, host,
  `target=_blank`), not through to the company's form.
- B1's reading of Google's EU intern figures as yearly rates rests on the amounts: €47,000 for 13 weeks
  would be about €15,600 a month for a BS intern. The site's own chart and Juice already treat them as
  yearly. Microsoft's postings say "per year" outright.
- Dark mode, keyboard-only use and screen readers weren't tested; the QA reviewers cover them.
- Person times are estimates built from the steps; machine times are measured, under load 0.8–2.6.

## 9. Change log

- 2026-10-11: second persona review, the first on the beta site, of build `local-20261011T030306`
  (commit 83023f5): 5 personas, 86 screenshots, earlier findings re-checked.
