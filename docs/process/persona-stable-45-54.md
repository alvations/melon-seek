# Process log: persona-stable-45-54

Usability review of the **stable** site (`/melon-seek/`) by five job seekers aged 45–54, one per
career level, done in a real browser on today's real snapshot (2026-10-10, fetched 09:54 UTC).

## 1. Brief

- Prompt: [`docs/process/prompts/persona-stable-45-54.md`](prompts/persona-stable-45-54.md) (verbatim).
- Goal: judge the site as a job seeker would, not as an engineer. Each person arrives cold, looks
  for roles that fit, judges pay and Juice for their own city and household, compares companies
  and levels, opens a job, applies, saves a search and comes back.
- Files owned: this file, the prompt file, and `docs/screenshots/persona-stable-45-54/` (76 PNGs).
  No product code was edited. Nothing was committed or pushed.

## 2. Inputs and sources

- `README.md` (what the site claims to do, data modes, Juice, Compstimate, saved searches).
- `docs/strategy/ROADMAP.md` §8, the UI simplicity budget. Every Improve item below fits inside it:
  none adds a top-level mode, a main-view control or a card row.
- The lead's build at `<scratchpad>/cycle-stable/dist` (build marker `local-20261010T105630`), served
  with `scripts/cycle/serve.mjs`. 8 boards, 5,482 postings.
- To check what I saw on screen against the source, I read `dist/data/*.csv` (the open-data export),
  `dist/api/desc/**` (job descriptions), `dist/api/cities.json`, and the code paths named under
  "owning file" (`server/keywords.js`, `public/features/compstimate.js`, `public/app.js`,
  `public/viz/map.js`, `public/viz/chart.js`).

Not reported as bugs, as the lead asked: the badge falling back to the bundled snapshot
("Live fetch failed … CORS") and the grey map tiles ("Basemap unavailable"). Both are sandbox
effects.

## 3. The five people

| # | Person | Age, city | Household | Field, level | Device |
|---|---|---|---|---|---|
| 1 | **Daniel Okafor** | 47, Toronto, Canada | Family: wife and two children (11, 14) | Engineering. A maths teacher for 20 years, retraining with a part-time CS diploma and a bootcamp. New graduate. | Laptop, 1440×900 |
| 2 | **Priya Raman** | 50, London, UK | Single (divorced, children at university) | Design. Came back to work 3 years ago as a junior product designer after 15 years at home. Early career. | **Phone**, 390×844 |
| 3 | **Carlos Mendoza** | 46, Austin, TX, US | Family: wife and three children | Sales. 8 years as an enterprise account executive. Mid-career. | **Phone**, 390×844 |
| 4 | **Hiroko Tanaka** | 53, Sydney, Australia | Couple (husband semi-retired) | Engineering. 25 years in embedded and defence software. Staff level. | Desktop, 1440×900 |
| 5 | **Fiona MacLeod** | 52, Washington, DC, US | Family: husband and two teenagers | Policy. Former congressional staffer and think-tank director. Director level. | Desktop, 1440×900 |

Four countries (Canada, UK, US, Australia). Two people on a phone. Browser locale and time zone match
each person's city (en-CA, en-GB, en-US, en-AU).

How to read the timings: **page** is measured in the browser (time until the screen had
settled). **≈ human** is my estimate of how long a 45–54-year-old would take to read, decide and act.
Nothing on the site was slow: every page wait was under 2.5 s (§5).

### 3.1 Daniel Okafor: new graduate, Toronto, laptop

**Goal:** "A new-grad or intern software engineering job in Toronto or remote in Canada, paying at
least CA$85K, that leaves our family of four at least CA$1,500 a month after tax, rent and living
costs."

**Reached it? No.** No company here lists a paid new-grad software role in Canada. The only
entry-level software role (Cohere's Winter 2027 intern) lists no pay, and the site's estimate for it
(≈ $215K) is wrong by a long way. The roles in Toronto that list low pay (CA$62–83K data-annotation
contracts) leave his family **−$603 to −$1K a month**. A CA$215–310K "Mid" software role would leave
about $5K a month (shown in US dollars), but nothing on the screen tells him whether a new graduate
could get it.

| Step | What he did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | **Arrives cold.** Anthropic's chart: "645 roles · 87% list pay · $352K median · middle 50% $287–411K". He understands "one company's jobs, plotted by salary". He does not know what "list pay" means, that 7 other companies exist, or why the first card is in pounds. [p1-01](../screenshots/persona-stable-45-54/p1-01-arrive.png) | 0.7 s | 20 s |
| 2 | Types **"Toronto"** in the search box. **0 roles.** The search covers titles, teams and skills, not places. The empty chart shows two messages on top of each other, and both blame the salary range, which he never set. [p1-03](../screenshots/persona-stable-45-54/p1-03-search-toronto.png), [p1-03b](../screenshots/persona-stable-45-54/p1-03b-empty-overlap.png) | 0.8 s | 30 s |
| 3 | Clears it. Opens **Location** and clicks "Show all 27". There is no Toronto, only "Ontario, Canada" and "Remote (Canada)". With both ticked, he gets 7 roles. Three are "Anthropic Fellows Program" at **$200K · Intern · 🍉 58 Ripe**. That is a 4-month stipend of $3,850 a week, annualized. The other card has a **"CAD"** skill tag, which comes from the currency code. [p1-05](../screenshots/persona-stable-45-54/p1-05-location-canada.png) | 1.6 s | 70 s |
| 4 | Opens the company menu. Its headings are **"GREENHOUSE / ASHBY / LEVER"**, with board slugs such as `andurilindustries` in monospace. He picks Cohere, the Canadian company. His location filter is gone. [p1-06](../screenshots/persona-stable-45-54/p1-06-company-menu.png), [p1-07](../screenshots/persona-stable-45-54/p1-07-cohere.png) | 0.2 s | 30 s |
| 5 | Seniority shows Intern 3, Mid 67, Senior 28 … and no "Entry". He picks **Intern** and gets 3 roles, all "No salary", "0% list pay". [p1-08](../screenshots/persona-stable-45-54/p1-08-seniority.png), [p1-09](../screenshots/persona-stable-45-54/p1-09-cohere-interns.png) | 0.6 s | 30 s |
| 6 | Opens **Software Engineer Intern (Winter 2027)**. It shows "COMPSTIMATE **≈ $215K** ($159K–283K, low confidence). Based on 4 similar roles at Cohere, **Intern · Canada**", and under it "Typically within ±8%". None of Cohere's 3 interns lists pay, so those "4 similar roles" are full-time engineers. He nearly believes the number. The meta line repeats itself: "Internships · Internships · Intern **Intern**". [p1-10](../screenshots/persona-stable-45-54/p1-10-intern-drawer.png) | 0.15 s | 60 s |
| 7 | Clears the filters, searches Location for "Toronto" in the side panel (51 roles) and sorts by **Lowest pay**. First come data-annotation contracts at CA$62K and CA$83K ("Annualized from hourly pay (40 CAD/hour)", which is honest). A US$150K role sorts below CA$215K roles because the sort uses US dollars. [p1-11](../screenshots/persona-stable-45-54/p1-11-toronto-lowest.png) | 1.4 s | 90 s |
| 8 | Opens **Software Engineer, Adoption** (CA$215–310K, Mid). He sees "17% percentile", the histogram, and "Same role elsewhere", which is clear. Juice says "65 · Ripe, $84K/yr left in **Montreal**", the cheapest city on the posting, not his. He switches to **Family** and **Monthly**, and opens "Compare locations": Toronto ≈50 · Ripe, **$5K/mo**. Every line is rounded to $1K a month and given in US dollars, so he cannot check his CA$1,500 line. The "Juice left" bar is red although the amount is positive. [p1-12](../screenshots/persona-stable-45-54/p1-12-swe-drawer.png), [p1-13](../screenshots/persona-stable-45-54/p1-13-juice-family.png) | 1.0 s + 1.5 s | 2 min |
| 9 | Opens the CA$83K contract role. With Family, the cards switch to **"≈0 · Rind"**. The drawer says −$603/mo in Montreal and −$1K/mo in Toronto. "Rind" is a word he has to guess. The converted figure reads "≈ $59K–59K". [p1-14](../screenshots/persona-stable-45-54/p1-14-annotation-juice.png) | 0.9 s | 60 s |
| 10 | **Apply on Ashby** opens jobs.ashbyhq.com in a new tab. The button works, but he doesn't know what "Ashby" is. | — | 10 s |
| 11 | Clicks **Save**, then the toast "Saved — find it in the company menu" appears. [p1-15](../screenshots/persona-stable-45-54/p1-15-saved.png) | 0.4 s | 10 s |
| 12 | **Comes back later.** He lands on Anthropic, not his search. He finds "Cohere · Toronto" at the top of the company menu, which is still headed "Job boards". It restores his filters and sort. [p1-16](../screenshots/persona-stable-45-54/p1-16-return.png), [p1-17](../screenshots/persona-stable-45-54/p1-17-return-menu.png) | 1.2 s | 40 s |
| 13 | **Insights**: he types "New grad software engineer" into Compstimate and gets **$212K USD/yr**, low confidence, "Typically within ±8%". The best comparable is a "29% match". The skill premium shows **+$38K** for eight different skills, which looks made up. "Strong communication −$34K" reads as advice not to communicate. [p1-19](../screenshots/persona-stable-45-54/p1-19-compstimate-newgrad.png), [p1-20](../screenshots/persona-stable-45-54/p1-20-market-insights.png) | 1.5 s | 2 min |

Total ≈ 12 min.

### 3.2 Priya Raman: early career, London, phone

**Goal:** "A product design job in London, ideally 4 days a week or part-time, paying at least
£60K, that leaves me at least £1,200 a month after tax, rent and living costs."

**Reached it? No.** None of the 8 companies has a London design role that lists pay. Palantir's
London Product Designer shows a "≈ $133K" estimate taken from US roles. There is no way to find
part-time or 4-day work. Juice works for London, but only in US dollars, and only for roles that
list pay (the cheapest London role at Anthropic is £135K).

| Step | What she did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | **Arrives cold on her phone.** She sees a company button, a blue "10 Oct" pill, a search box cut off at "Search titles, t", Chart/Map/Insights, and a chart of coloured dots with numbers. Nothing on the first screen says what the site is or that it shows one company. Pay is in US dollars. [p2-01](../screenshots/persona-stable-45-54/p2-01-arrive-phone.png) | 0.6 s | 20 s |
| 2 | Searches **"designer"**. She gets "4 roles · 4 in title" ("in title"?), all in San Francisco at $305K+. [p2-03](../screenshots/persona-stable-45-54/p2-03-sheet.png) | 0.9 s | 30 s |
| 3 | Switches to **Palantir**, and her search is wiped. She types it again: 13 roles. Every card says **"No department"**. The ages read **"13y+"**, "9y+" and "7y+", and every designer card has a "TypeScript" tag. [p2-05](../screenshots/persona-stable-45-54/p2-05-palantir.png), [p2-06](../screenshots/persona-stable-45-54/p2-06-palantir-designer.png) | 0.2 s | 60 s |
| 4 | Opens **Product Designer, London**. "Salary not listed", then "COMPSTIMATE ≈ $133K … Based on 6 similar roles at Palantir, **Mid · London**". Those 6 are the New York and DC postings; no London one lists pay. "Listed **5,000 days ago** (31 Jan 2013)" sits next to "Open **180+** days". The button reads **"Apply on Lever"**. [p2-07](../screenshots/persona-stable-45-54/p2-07-palantir-london-drawer.png) | 1.3 s | 60 s |
| 5 | Filters, then **Employment type**: only "Full-time 8" and "Internship 5". No part-time anywhere on the site. The search does not look inside descriptions, although 524 of them mention part-time work. [p2-09](../screenshots/persona-stable-45-54/p2-09-employment-type.png) | 0.8 s | 60 s |
| 6 | Tries **Scale AI**: its London design roles (Staff Product Designer, Senior Product Design Manager) list no pay. | 1.0 s | 40 s |
| 7 | Back to **Anthropic**. The Location chip opens the full filter sheet, where London is not in the first list. She types "London" into its search box: 47 roles. Sorted by lowest pay, the first are the $200K "Intern" fellowships, then Customer Success Manager at **£135K–165K**, which is way above a junior designer. [p2-10](../screenshots/persona-stable-45-54/p2-10-location-phone.png), [p2-11](../screenshots/persona-stable-45-54/p2-11-london-lowest.png) | 2.7 s | 90 s |
| 8 | **Salary minimum**, typed in pounds: "60000" turns into "Any", "£80,000" turns into "Any", and **"£250,000" becomes "$250K"**, silently treated as dollars. [p2-16](../screenshots/persona-stable-45-54/p2-16-salary-min.png) | 0.6 s | 60 s |
| 9 | Opens Customer Success Manager. Juice for Just me, Monthly: gross $17K, tax −$7K, rent −$3K ("1-bedroom, city centre"), living −$1K, **left $6K/mo**, all in US dollars. Each data line ends in "(update due)". She can't enter her own rent. [p2-13](../screenshots/persona-stable-45-54/p2-13-london-juice-single.png) | 2.8 s | 90 s |
| 10 | Closes the job. The drawer header has two "<" icons side by side: the left one closes, the one next to "4 of 47" goes to the previous role. She taps the wrong one first. | — | 20 s |
| 11 | **Saves** with a bookmark icon that has no label (her London filter chip is scrolled out of sight). The toast says to look in the company menu. **Comes back:** she lands on Anthropic with no filters. The saved search is in the company menu. [p2-14](../screenshots/persona-stable-45-54/p2-14-save-phone.png), [p2-15](../screenshots/persona-stable-45-54/p2-15-return-menu-phone.png) | 1.2 s | 60 s |

Total ≈ 11 min.

### 3.3 Carlos Mendoza: mid-career, Austin, phone

**Goal:** "An enterprise account executive job, remote in the US or in Austin, with a **base** of at
least $160K, that leaves my family of five at least $4,000 a month after tax, rent and living costs."

**Reached it? On paper, yes.** Cohere's Senior Account Executive, SLED (East) (US remote, Austin
listed, $230–430K, which Cohere says is base) leaves **≈ $16K a month** in Austin for a family of
four. The household options stop at four people, and he has five. But the site tells him
Anthropic's AE roles ($380–450K) are base pay and ranks Anthropic first for sales. Those figures are
on-target earnings that include commission, so the comparison he cares most about is wrong.

| Step | What he did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Searches **"account executive"** on Anthropic: 50 roles, $380–450K, mostly SF, NY and DC. [p3-01](../screenshots/persona-stable-45-54/p3-01-search-ae.png) | 0.9 s | 40 s |
| 2 | The Remote chip opens the filter sheet: "Remote 73 · On-site 630", which adds up to more than 645. With Remote on, "Sales" is hidden under "Show all 13". Result: 3 roles, and none is an AE. [p3-02](../screenshots/persona-stable-45-54/p3-02-remote-chip.png), [p3-03](../screenshots/persona-stable-45-54/p3-03-remote-sales.png) | 1.0 s | 2 min |
| 3 | **Map.** At world zoom one pin says "$415K · 24, **San Francisco, CA + 3 nearby**". He taps it. The list chip says "San Francisco, CA + 3 nearby (24)", and the cards are in **New York and Washington, DC**. [p3-04](../screenshots/persona-stable-45-54/p3-04-map.png), [p3-05](../screenshots/persona-stable-45-54/p3-05-map-tap-us.png) | 2.2 s | 60 s |
| 4 | Opens **Strategic Account Executive, Healthcare** ($380–450K). The pay block says "**+ bonus mentioned** · Posted base pay. Equity and bonus aren't included." The posting itself says: *"For sales roles, the range provided is the role's On Target Earnings ("OTE") range … includes both the sales commissions/sales bonuses target and annual base salary."* As a sales veteran he knows the base could be half of that. [p3-08](../screenshots/persona-stable-45-54/p3-08-anthropic-ae-drawer.png) | 0.9 s | 60 s |
| 5 | Switches to **Cohere** (his search is wiped again) and types it again: 14 AEs. Cohere calls the department "Revenue", not "Sales". He finds **Senior Account Executive, SLED (East)**, $230–430K, with "United States +7" locations, Austin among them. [p3-06](../screenshots/persona-stable-45-54/p3-06-cohere-ae.png) | 0.2 s | 60 s |
| 6 | Juice with **Family** and **Monthly**: gross $27K, tax −$6K, rent −$3K, living −$3K, left **$16K/mo**. "Compare locations (5)" puts Austin first. Juice uses the middle of a $230–430K range. [p3-09](../screenshots/persona-stable-45-54/p3-09-juice-family-austin.png) | 0.24 s | 90 s |
| 7 | **Insights → Compare companies → Sales & partnerships**: Anthropic $334K, Cohere $310K, OpenAI $258K … Clear and quick. But it ranks Anthropic's commission-inclusive pay against other companies' base pay, under the line "Equity and bonus aren't included". [p3-11](../screenshots/persona-stable-45-54/p3-11-compare-companies-sales.png) | 1.7 s | 90 s |
| 8 | Saves with the bookmark icon, "Cohere · "account executive"". **Comes back:** he lands on Anthropic and opens the company menu to find it. [p3-12](../screenshots/persona-stable-45-54/p3-12-return-phone.png) | 1.0 s | 40 s |

Total ≈ 10 min.

### 3.4 Hiroko Tanaka: staff level, Sydney, desktop

**Goal:** "A staff or principal software engineering job in Sydney, no relocation, paying at least
A$250K. I want to know what Staff pays compared with Senior, and which company pays best."

**Reached it? Partly.** Grouping the chart by seniority answers "Staff vs Senior" well (Anduril
software engineers: Staff+ median $256K, Senior $222K, in US pay). For Sydney she can't judge pay
or Juice at all: all 9 of Anthropic's Sydney postings and all of Anduril's Sydney software roles
list no pay, and the two estimates the site gives for the same question disagree.

| Step | What she did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Goes straight to **Map** ("Zillow"): world pins, Sydney "9 jobs". [p4-01](../screenshots/persona-stable-45-54/p4-01-map-world.png) | 2.2 s | 30 s |
| 2 | Clicks Sydney. Popup: "9 postings · no published salary". An area chip "Sydney, Australia (9)" appears. The stats say "0% list pay". [p4-02](../screenshots/persona-stable-45-54/p4-02-map-sydney.png) | 1.7 s | 30 s |
| 3 | Opens **Staff Engineer, Datacenter Server Lifecycle**: "Salary not listed — this posting doesn't include a pay range." Then nothing, with no estimate and no reason why (the estimate is hidden when it has too few comparables). [p4-03](../screenshots/persona-stable-45-54/p4-03-staff-sydney-drawer.png) | 1.3 s | 40 s |
| 4 | Switches to **Anduril** (2,491 roles). The Sydney chip is gone. She searches Location for "Sydney" again: 55 roles. On top are US **"Recruiting Coordinator (Contractor)"** cards at $53–70K, because Sydney is one of their 5 locations. Department names look like "Maritime & Maneuver Dominance : Maneuver Dominance Engineering : Mission Software Engineering". The same title appears again and again, one card per city. [p4-05](../screenshots/persona-stable-45-54/p4-05-anduril-sydney.png) | 1.0 s + 2.2 s | 90 s |
| 5 | Opens **Staff Software Engineer** (Sydney, no pay): "COMPSTIMATE ≈ $222K … Based on **205 similar roles at Anduril, Staff+ · Sydney**." Anduril lists no pay for its Sydney engineers, so the estimate comes from US pay. [p4-06](../screenshots/persona-stable-45-54/p4-06-anduril-staff-drawer.png) | 1.6 s | 60 s |
| 6 | **Insights → Compstimate**, with "Staff Software Engineer", Sydney, Staff+ (the same three fields as the drawer): "**Not enough comparable roles** with posted pay at Anduril". It contradicts step 5. Market insights below it: "**Median base pay $61K** of 5 salaried roles" for Sydney, taken from those US contractor roles. [p4-07](../screenshots/persona-stable-45-54/p4-07-compstimate-staffplus.png) | 1.2 s | 90 s |
| 7 | Back to Chart. She searches "software engineer" and picks **Group: Seniority**: Intern $106K, Entry $130K, Mid $193K, Senior $222K, **Staff+ $256K**, Manager $256K, Director+ $275K. This is the clearest answer on the site. [p4-08](../screenshots/persona-stable-45-54/p4-08-group-seniority.png) | 0.9 s | 60 s |
| 8 | Hovers and then clicks a chart bubble. The tooltip lists titles, and the click turns them into a filter chip. Good. [p4-14](../screenshots/persona-stable-45-54/p4-14-chart-hover.png), [p4-15](../screenshots/persona-stable-45-54/p4-15-chart-click.png) | 0.7 s | 30 s |
| 9 | Opens a Principal SWE and sets Juice to **Couple**: Seattle $160K/yr left. The data line reads "rent **Oct 2025** (update due)". She clicks "How it's calculated": the methodology page is clear and has a worked example, but its header says "**Rents as of May–October 2026**". The 2-bedroom rent is a Sep 2026 one-bedroom rent times a 2025 ratio, and the drawer doesn't say so. [p4-10](../screenshots/persona-stable-45-54/p4-10-juice-couple.png), [p4-11](../screenshots/persona-stable-45-54/p4-11-methodology.png) | 1.5 s + 0.8 s | 3 min |
| 10 | Saves "Anduril · Staff+ · Sydney" and sends the page link to her husband. On his phone the link opens the same view, but the only sign of the two filters is "Filters 2". [p4-12](../screenshots/persona-stable-45-54/p4-12-saved-sydney-staff.png), [p4-13](../screenshots/persona-stable-45-54/p4-13-shared-link-phone.png) | 2.0 s | 60 s |

Total ≈ 13 min.

### 3.5 Fiona MacLeod: director, Washington DC, desktop

**Goal:** "A director-level public policy or government affairs role in DC with a base of at least
$300K. I want to compare the AI labs, and to save a search I can check every week."

**Reached it? No (the data has no such role), but she got further than anyone.** The closest is
Anthropic's National Security Partnerships Lead ($295–345K, DC, Senior). Compare companies shows
OpenAI ahead of Anthropic for policy pay. Her saved search came back with "1 new" and a "New" tag on
the right card, which works well. But it lives only in this browser, covers one company, and sends
no alert.

| Step | What she did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Searches **"policy"**: "188 roles · 13 in title". The top card is "Head of **Accounting** Policy". [p5-01](../screenshots/persona-stable-45-54/p5-01-search-policy.png) | 0.9 s | 40 s |
| 2 | Department **Public Policy** and Location **Washington, DC**, both from the quick chips: 2 roles. The top one is National Security Partnerships Lead, $295–345K, Senior. [p5-02](../screenshots/persona-stable-45-54/p5-02-anthropic-policy-dc.png) | 3.5 s | 60 s |
| 3 | **Insights → Compare companies.** It opens on "Software engineering", although her filter is Public Policy. She switches to "Policy & government affairs (2 companies)": OpenAI $266K, Anthropic $247K. Above it, "What roles ask for" shows 100% and 50% bars worked out from 2 roles. [p5-03](../screenshots/persona-stable-45-54/p5-03-compare-policy.png) | 1.2 s | 90 s |
| 4 | Switches to **OpenAI**, then DC, then Seniority **Director+ / Manager**. The "Director+" role is "**Federal Account Director**, National Security", a sales account role, not a director. [p5-04](../screenshots/persona-stable-45-54/p5-04-openai-dc-director.png) | 0.7 s + 1.3 s | 90 s |
| 5 | Searches "affairs" and opens **US Congressional Lead** ($252–280K, Senior). "Same role elsewhere: No other company lists this level …". Juice with **Family** and Monthly: $22K gross, **$9K/mo left** in DC. [p5-05](../screenshots/persona-stable-45-54/p5-05-congressional-drawer.png), [p5-06](../screenshots/persona-stable-45-54/p5-06-juice-family-dc.png) | 0.9 s + 1.5 s | 2 min |
| 6 | Clicks **Save**. She looks at **Add board**: "Source: Greenhouse / Ashby / Lever · Board slug · boards.greenhouse.io/<slug>". She closes it. [p5-09](../screenshots/persona-stable-45-54/p5-09-add-board.png) | 0.5 s | 40 s |
| 7 | **Comes back "two weeks later".** I simulated this by setting the saved search's last visit to 26 Sep and leaving out the 8-day-old Congressional Lead role. The company menu shows "OpenAI · "affairs" · Washington, DC · **1 new**". Opening it, the right card carries a **New** tag and the badge clears. [p5-07](../screenshots/persona-stable-45-54/p5-07-return-new.png), [p5-08](../screenshots/persona-stable-45-54/p5-08-saved-opened.png) | 1.7 s | 60 s |
| 8 | "Copy link to this role" copies a link that reopens the role. She would also want this search on her phone and an email each week. The saved search doesn't move to another device, and there are no alerts. | 0.4 s | 20 s |

Total ≈ 10 min.

## 4. Findings for the group

Each item gives the person (D = Daniel, P = Priya, C = Carlos, H = Hiroko, F = Fiona), the screen,
a screenshot and the owning file, where I could tell which file owns it.

### 4.1 Broken, fix now (wrong, misleading or blocking)

1. **Sales pay that includes commission is labelled as base pay.** Every Anthropic posting carries
   the sentence "For sales roles, the range provided is the role's On Target Earnings ('OTE') range
   … includes both the sales commissions/sales bonuses target and annual base salary". For about
   123 Anthropic sales roles, the drawer instead says "+ bonus mentioned · Posted base pay. Equity
   and bonus aren't included." That figure then feeds Juice, "Same role elsewhere" and Compare
   companies, which ranks Anthropic first for sales against other companies' base pay.
   — C (also F's Sales Lead, Canada example) · drawer pay block, Insights · [p3-08](../screenshots/persona-stable-45-54/p3-08-anthropic-ae-drawer.png), [p3-11](../screenshots/persona-stable-45-54/p3-11-compare-companies-sales.png) · `server/keywords.js` (extras, `SALES_CONDITIONAL_RE`), pay-block copy in `public/app.js`, `public/features/comps.js`.
2. **The Compstimate basis line names a level or city that its comparables don't have.**
   - Cohere intern: "≈ $215K … Based on 4 similar roles at Cohere, Intern · Canada". No Cohere intern lists pay.
   - Palantir London designer: "≈ $133K … Mid · London", built from New York and DC pay.
   - Anduril Sydney Staff SWE: "≈ $222K … 205 similar roles … Staff+ · Sydney", all of them US roles.

   Each also shows "Typically within ±8%" (or ±7%, ±12%) next to "low confidence".
   — D, P, H · drawer · [p1-10](../screenshots/persona-stable-45-54/p1-10-intern-drawer.png), [p2-07](../screenshots/persona-stable-45-54/p2-07-palantir-london-drawer.png), [p4-06](../screenshots/persona-stable-45-54/p4-06-anduril-staff-drawer.png) · `public/features/compstimate.js` (`estimateComp`, `basisLine`), `compstimateBlock` in `public/app.js`.
3. **The drawer and Insights give opposite answers to the same estimate.** For Anduril, "Staff
   Software Engineer · Staff+ · Sydney", the drawer says ≈ $222K and Insights says "Not enough
   comparable roles". Insights limits the comparables to the filtered roles; the drawer uses the
   whole board.
   — H · drawer vs Insights · [p4-06](../screenshots/persona-stable-45-54/p4-06-anduril-staff-drawer.png), [p4-07](../screenshots/persona-stable-45-54/p4-07-compstimate-staffplus.png) · `public/features/compstimate.js` (`within`), `public/features/insights.js`.
4. **"Mid" is shown as a fact on 2,653 of 5,482 postings (48%) whose titles state no level at all.**
   Examples: "Research Engineer, RL Scaling Science £375K–640K · Mid", and "Software Engineer,
   Adoption · Mid" (D cannot tell if a new graduate qualifies). The opposite mistake happens too:
   "Federal Account Director", a sales role, is filed under Director+.
   — D, H, F · cards, Seniority filter · [p1-01](../screenshots/persona-stable-45-54/p1-01-arrive.png), [p5-04](../screenshots/persona-stable-45-54/p5-04-openai-dc-director.png) · `server/keywords.js` (`seniorityOf`, `BY_DEFAULT`), card badge in `public/app.js`.
5. **A map cluster called "San Francisco, CA + 3 nearby" contains New York and Washington, DC.**
   Tapping it filters the list to NY and DC roles under that label.
   — C · Map (phone) · [p3-05](../screenshots/persona-stable-45-54/p3-05-map-tap-us.png) · `public/viz/map.js` (cluster label, line ~355).
6. **A 4-month fellowship stipend is shown as "$200K" on the card and scored by Juice as a year's
   salary** ("Intern · 🍉 58 Ripe"; the posting says $3,850 a week for 4 months). The drawer does say
   "Annualized from weekly pay", but the card and Juice don't.
   — D, P · cards, Juice · [p1-05](../screenshots/persona-stable-45-54/p1-05-location-canada.png), [p1-21](../screenshots/persona-stable-45-54/p1-21-fellows-drawer.png) · `server/salary.js` (annualizing), `public/app.js`.
7. **The salary box silently changes what you type.** "£250,000" becomes "$250K"; "60000" and
   "£80,000" become "Any", because they are below the board's lowest pay. The visible label is just
   "Min"; that it means approx USD is only in the screen-reader label.
   — P · Salary filter (phone) · [p2-16](../screenshots/persona-stable-45-54/p2-16-salary-min.png) · salary input parsing in `public/app.js`.
8. **The "Sydney median $61K" in Market insights is not a Sydney figure.** It comes from 5 US
   contractor roles that list Sydney as one of 5 locations, and these also sort to the top of the
   Sydney list.
   — H · Insights, list · [p4-07](../screenshots/persona-stable-45-54/p4-07-compstimate-staffplus.png), [p4-05](../screenshots/persona-stable-45-54/p4-05-anduril-sydney.png) · `public/features/insights.js`, location filter in `public/app.js`.
9. **Wrong skill tag: "CAD" on postings paid in Canadian dollars.** The CAD skill regex matches the
   currency code, e.g. "Sales Lead, Canada Public Sector · Senior · Security · CAD".
   — D · card · [p1-05](../screenshots/persona-stable-45-54/p1-05-location-canada.png) · `server/keywords.js` line 521 (`['CAD', /\bCAD\b/]`).
10. **The chart's empty state has two messages on top of each other, and both blame the salary
    range.** "No postings to plot / Try widening the filters." shows through "No roles match / Try
    widening the salary range…", even when the only filter is a search word.
    — D · Chart · [p1-03b](../screenshots/persona-stable-45-54/p1-03b-empty-overlap.png) · `public/viz/chart.js` line ~292, `public/app.js` line ~1817.
11. **Rent dates contradict each other.** The methodology page says "Rents as of May–October 2026".
    The drawer says "rent Oct 2025 (update due)" for every couple or family, because the 2- and
    3-bedroom rents are a 2026 one-bedroom rent times a 2025 HUD ratio, and the drawer doesn't say
    so.
    — H, C, F · Juice data line, methodology · [p4-10](../screenshots/persona-stable-45-54/p4-10-juice-couple.png), [p4-11](../screenshots/persona-stable-45-54/p4-11-methodology.png) · `public/features/freshness.js`, `juiceAsOfText` in `public/app.js`, `scripts/methodology.js`.

### 4.2 Improve (ranked by how many of the 5 it would help)

| Rank | Change | Helps | Screen · screenshot · owner |
|---|---|---|---|
| 1 | **Keep the search and filters when switching company, and show matches per company** ("Toronto: Cohere 51 · Anthropic 6 · OpenAI 6"). All five switched companies and had to type their search or location again. Daniel's "Toronto" search died at 0 with no hint that Cohere has 51 roles there. | 5/5 | Company menu, search · [p1-03](../screenshots/persona-stable-45-54/p1-03-search-toronto.png), [p1-07](../screenshots/persona-stable-45-54/p1-07-cohere.png) · `public/app.js` (`switchCompany`, `makeCompanyMenu`) |
| 2 | **"My city" for Juice, plus my own rent.** Today Juice uses the posting's cheapest city (Montreal for a Toronto family), and nobody can enter their own rent, although `server/juice.js` already accepts `rentOverrideUSD` and `rentOverrides`. It fits in the drawer's Juice block. | 5/5 | Juice · [p1-13](../screenshots/persona-stable-45-54/p1-13-juice-family.png) · `public/app.js` (`juiceBlock`), `server/juice.js` |
| 3 | **Plain words instead of jargon:** "list pay", "middle 50%", "Clusters/Ranges", "Compstimate", "percentile", "4 in title", "≈", the Juice grades "Dry/Ripe/Juicy/Rind" (explain them in the drawer or show "$5K/mo left"), "update due", "Multiple pay zones", "Apply on Greenhouse/Ashby/Lever" ("Apply on Cohere's site"), and the company menu's "GREENHOUSE/ASHBY/LEVER" headings and slugs. | 5/5 | Everywhere · [p1-06](../screenshots/persona-stable-45-54/p1-06-company-menu.png), [p1-14](../screenshots/persona-stable-45-54/p1-14-annotation-juice.png) · `public/app.js`, `public/features/*` |
| 4 | **Saved searches that are easy to find and come back to.** Everyone landed back on Anthropic and had to find their search inside a menu headed "Job boards". Open the last view, or list saved searches on the first screen. Say plainly that a saved search lives in this browser only, and offer "copy link" for the phone. Allow one search across all companies. | 5/5 | Return visit · [p1-17](../screenshots/persona-stable-45-54/p1-17-return-menu.png), [p2-15](../screenshots/persona-stable-45-54/p2-15-return-menu-phone.png) · `public/app.js` (F5 block) |
| 5 | **Juice in my currency and to the nearest $100 a month.** Every line rounds to $1K/mo in USD, so Daniel's CA$1,500, Priya's £1,200 and Carlos's $4,000 thresholds can't be read. The "Juice left" bar is red even when the amount is positive. | 5/5 | Juice · [p1-13](../screenshots/persona-stable-45-54/p1-13-juice-family.png), [p2-13](../screenshots/persona-stable-45-54/p2-13-london-juice-single.png) · `public/app.js` (`juiceBlock`), `public/styles.css` |
| 6 | **Show "Level not stated" instead of guessing "Mid"** (fixes Broken #4), and let "Lead"/"Head of" policy titles reach the levels Fiona searches for. | 3/5 (D, H, F) | Cards, Seniority · `server/keywords.js` |
| 7 | **Compare companies should follow the current filter** (it opens on "Software engineering" while the filter is Public Policy) and offer a level. | 3/5 (C, H, F) | Insights · [p5-03](../screenshots/persona-stable-45-54/p5-03-compare-policy.png) · `public/app.js` (~1750), `public/viz/comps.js` |
| 8 | **Say why a role has no estimate, and give Juice from the estimate (clearly marked) when no pay is listed.** Sydney and London roles have neither, with no reason given. | 3/5 (D, P, H) | Drawer · [p4-03](../screenshots/persona-stable-45-54/p4-03-staff-sydney-drawer.png) · `compstimateBlock` in `public/app.js` |
| 9 | **Department names differ per company** (Sales, Revenue, Go To Market; Anduril's "A : B : C" chains; "No department" on every Palantir card). Use the role families Insights already has ("Sales & partnerships") as the department filter's top level, and drop the "No department" text. | 3/5 (C, H, F) | Filters, cards · [p2-06](../screenshots/persona-stable-45-54/p2-06-palantir-designer.png), [p4-05](../screenshots/persona-stable-45-54/p4-05-anduril-sydney.png) · `public/app.js`, `public/features/roles.js` |
| 10 | **Hide Insights statistics from tiny or tied samples:** 100% and 50% bars from 2 roles; "+$38K" for 8 skills; "Strong communication −$34K". Say "not enough roles". | 3/5 (D, H, F) | Market insights · [p1-20](../screenshots/persona-stable-45-54/p1-20-market-insights.png), [p5-03](../screenshots/persona-stable-45-54/p5-03-compare-policy.png) · `public/features/insights.js` |
| 11 | **Clean up keyword tags:** "TypeScript" on every Palantir designer, "Machine learning" on a Customer Success Manager, "Embedded" on a Contracts Manager. The two tags on a card should be the most telling ones. | 3/5 (D, P, C) | Cards · [p2-11](../screenshots/persona-stable-45-54/p2-11-london-lowest.png) · `server/keywords.js` |
| 12 | **Phone quickbar:** chips are cut off under the pinned Save icon and "Clear all" ("ority", "Re"); Save is an unlabelled bookmark; active filters (London, Sydney) scroll out of sight, so a shared link shows only "Filters 2". | 2/5 (P, C) + H's husband | Phone quickbar · [p2-14](../screenshots/persona-stable-45-54/p2-14-save-phone.png), [p4-13](../screenshots/persona-stable-45-54/p4-13-shared-link-phone.png) · `public/styles.css`, `renderQuickbar` in `public/app.js` |
| 13 | **Ages of always-open postings:** "13y+", "9y+", "Listed 5,000 days ago" next to "Open 180+ days". Say "Always-open posting (since 2013)". | 2/5 (P, H) | Cards, drawer · [p2-06](../screenshots/persona-stable-45-54/p2-06-palantir-designer.png), [p2-07](../screenshots/persona-stable-45-54/p2-07-palantir-london-drawer.png) · `public/features/freshness.js` |
| 14 | **Group repeated postings** (the same Anduril or Palantir title once per city) into one card with "+5 cities". | 2/5 (P, H) | List · [p4-08](../screenshots/persona-stable-45-54/p4-08-group-seniority.png) · `public/app.js` |
| 15 | **Phone drawer header:** two "<" icons side by side (Close and Previous role). Make Close an ×. | 2/5 (P, C) | Drawer (phone) · [p2-07](../screenshots/persona-stable-45-54/p2-07-palantir-london-drawer.png) · `public/app.js`, `public/styles.css` |
| 16 | **Flexible and part-time work:** no way to find part-time, 4-day or flexible roles, and search ignores descriptions (524 mention part-time). A "Mentions flexible/part-time" option under More would fit the budget. Common for returning parents in this age group. | 1/5 (P) | Filters · [p2-09](../screenshots/persona-stable-45-54/p2-09-employment-type.png) · `server/keywords.js`, `public/app.js` |
| 17 | Small things: "≈ $59K–59K" for a single figure; "Internships · Internships · Intern Intern"; "Remote 73 · On-site 630" adds up to more than 645; Lowest-pay sort mixes currencies (US$150K below CA$215K) with no hint; a chart-bubble filter isn't kept in the URL, so it can't be saved or shared. | 1–2/5 | Drawer, filters · [p1-10](../screenshots/persona-stable-45-54/p1-10-intern-drawer.png), [p1-14](../screenshots/persona-stable-45-54/p1-14-annotation-juice.png) · `public/app.js` |

### 4.3 Good: keep

1. **Every number is fast.** First cards in 0.6–1.3 s, a company switch in 0.2–1.0 s, a job in
   0.15 s, a household switch over 2,491 roles in 0.24 s on a phone, and Map in about 2 s the first
   time. No one waited. — all · §5.
2. **The Juice waterfall with Just me / Couple / Family and Monthly / Yearly**, plus "Compare
   locations". The household choice is remembered, and the cards' Juice changes with it. "Rent
   takes 21% of take-home pay" is a line every person understood. — D, P, C, H, F ·
   [p1-13](../screenshots/persona-stable-45-54/p1-13-juice-family.png), [p3-09](../screenshots/persona-stable-45-54/p3-09-juice-family-austin.png) · `public/app.js` (`juiceBlock`).
3. **"Same role elsewhere" in the drawer and the Compare companies card.** One look ranks 8
   companies for the same kind of role. — D, C, F ·
   [p1-12](../screenshots/persona-stable-45-54/p1-12-swe-drawer.png), [p3-11](../screenshots/persona-stable-45-54/p3-11-compare-companies-sales.png) · `public/features/comps.js`, `public/viz/comps.js`.
4. **Group: Seniority in the chart.** It is the clearest way to compare levels (Staff+ $256K
   vs Senior $222K). — H · [p4-08](../screenshots/persona-stable-45-54/p4-08-group-seniority.png) · `public/viz/chart.js`.
5. **Honest pay notes:** each posting's own currency on the card (CA$, £, €), "≈ $153K–221K in
   approx USD for comparison", "Annualized from hourly pay (40 CAD/hour)", "Salary not listed — this
   posting doesn't include a pay range", and "Open 180+ days. Some companies keep a posting open to
   collect applicants for a recurring role." — D, P ·
   [p1-12](../screenshots/persona-stable-45-54/p1-12-swe-drawer.png), [p1-14](../screenshots/persona-stable-45-54/p1-14-annotation-juice.png) · `public/app.js`.
6. **Map pin and chart bubble become a filter chip and a list.** Hovering a bubble lists its
   titles; a click narrows the list; the chip has an × to undo. — C, H ·
   [p4-02](../screenshots/persona-stable-45-54/p4-02-map-sydney.png), [p4-15](../screenshots/persona-stable-45-54/p4-15-chart-click.png) · `public/viz/map.js`, `public/viz/chart.js`.
7. **A saved search that says "1 new", with a "New" tag on the right card.** — F ·
   [p5-07](../screenshots/persona-stable-45-54/p5-07-return-new.png), [p5-08](../screenshots/persona-stable-45-54/p5-08-saved-opened.png) · `public/app.js` (F5).
8. **Links that restore the exact view** (the page URL and "Copy link to this role"), including on
   another device. — H, F · [p4-13](../screenshots/persona-stable-45-54/p4-13-shared-link-phone.png) · `public/app.js`.
9. **A big, clear Apply button** that opens the original posting in a new tab, on phone and
   desktop. — all · [p2-13](../screenshots/persona-stable-45-54/p2-13-london-juice-single.png).
10. **The methodology page:** plain words, a worked $200,000 example, and "Estimate, not financial
    advice". — H · [p4-11](../screenshots/persona-stable-45-54/p4-11-methodology.png) · `scripts/methodology.js`, `docs/METHODOLOGY_GUIDE.md`.
11. **The Location filter is grouped by country and searchable,** with counts. The search ranks
    title matches first ("13 in title"). — D, P, H · [p1-05](../screenshots/persona-stable-45-54/p1-05-location-canada.png).
12. **Phone layout basics:** results sheet, full-screen filter sheet with "Show N roles", drawer with
    a pinned Apply button. Text sizes are 12–16 px in dark grey on white, readable for this age
    group, though 12 px is the floor. — P, C · [p2-09](../screenshots/persona-stable-45-54/p2-09-employment-type.png).

## 5. Replayable steps

1. Serve the lead's build (shared, not rebuilt):
   `node scripts/cycle/serve.mjs --dist <scratch>/cycle-stable/dist --pid <scratch>/persona-stable-45-54/serve.pid`
   It printed `serve: http://127.0.0.1:43871/melon-seek/`.
2. Drive Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) with Playwright from
   `<scratch>/pw/node_modules`, loaded through `createRequire(NODE_PATH + '/')`, because ES modules
   ignore `NODE_PATH`. A small REPL daemon (`<scratch>/persona-stable-45-54/work/daemon.mjs`, pid in
   `daemon.pid`) kept one browser context per person, so each person's steps ran in order with
   their own localStorage:
   - desktop: 1440×900;
   - phone: 390×844, `isMobile`, `hasTouch`, DPR 2;
   - `timezoneId` and `locale` set to each person's city.

   Each step was sent as a short script (click or tap, fill, wait for selector, screenshot, read
   `innerText`). Its wall time is the "page" column.
3. "Coming back later" was a reload in the same context. For Fiona's "1 new" test, I edited
   `melon.saved`, `melon.seen.openai` and `melon.seenIds.openai` in localStorage so that the 8-day-old
   role had not been seen. This build has no history ledger (`meta.history.runs = 0`), so "new" uses
   the seen-ids fallback.
4. Facts checked against the data:
   - OTE wording: grep of `dist/api/desc/anthropic/*.json` (665 of 665 descriptions).
   - Fellows stipend: `desc/anthropic/5183044008.json`.
   - "Mid" share: `dist/data/*.csv`.
   - CAD tag: `server/keywords.js:521`.
   - Seattle rent dates: `dist/api/cities.json`.
   - Part-time mentions: grep of `desc/**`.

Measured page waits: first cards 0.6–1.3 s; company switch 0.2–1.0 s; drawer 0.15 s; household
switch 0.24 s (Anduril, phone); Insights 1.2–1.7 s; first Map open 2.2 s (Leaflet loads, tiles
blocked); Anduril cold load on phone 0.7 s.

## 6. Known gaps and follow-ups

- **Not tested:**
  - live board fetches and real map tiles (sandbox);
  - the beta site;
  - dark mode;
  - screen readers;
  - browser zoom above 100%. This age group often uses zoom, so it is worth a check.
- **Estimated, not measured:** the human times, and the claim that about 123 Anthropic sales roles
  are affected by the OTE issue (taken from the Sales department count). The exact count needs the
  extras detector run over the snapshot.
- **The "1 new" return visit was simulated** by editing localStorage. A real two-visit test needs
  two snapshots a few days apart.
- **The household options stop at four people** (Carlos has five), and the site doesn't model a
  single-earner couple. This is in the Juice model, not the UI.

## 7. Change log

- 2026-10-10: five personas run on the stable build `local-20261010T105630`; 76 screenshots;
  11 Broken, 17 Improve, 12 Good.
