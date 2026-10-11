# Process log: persona review, beta site, ages 18–24

## 1. Brief

- Prompt (verbatim): [prompts/persona-beta-18-24.md](prompts/persona-beta-18-24.md).
- Goal: play five job seekers aged 18–24, one per career level, on the beta site (`/melon-seek/beta/`: the 8 AI companies plus Apple, Google, Microsoft, NVIDIA and Netflix, today's real snapshot). Each one does a real task in the browser. Then list what to keep, what to improve and what is broken. Check what the first persona review (main site) called broken.
- Files owned: this log, the prompt copy, and `docs/screenshots/persona-beta-18-24/` (102 screenshots). No product code was edited, nothing was committed and nothing was pushed.
- Build: the lead's `scratchpad/cycle-beta/dist` (commit 83023f5). Expected in this sandbox and not reported: the badge falls back to the bundled snapshot ("Snapshot · Oct 10/11"), and map tiles are grey.

## 2. Inputs and sources

- `README.md` and `docs/strategy/ROADMAP.md` §8 (the UI simplicity budget). Every suggestion below fits it: no new main-view controls; new options go into existing selects, popovers or the drawer.
- The first review of this age group, [persona-stable-18-24.md](persona-stable-18-24.md), and the other four groups' broken lists; the fix waves in [lead.md](lead.md) (persona fix waves 1–2, beta fix waves 1–2, perf pass); the quiet-machine timings in [perf-mobile-beta.md](perf-mobile-beta.md).
- I read code only to name an owning file or check a number: `public/app.js` (`postedTerm`, `payPill`, `juiceBlock`, `juiceScaleNote`, `HOUSEHOLDS`, `parsePay`), `public/features/comps.js` (`compsForJob`, `compsNote`), `public/features/roles.js` (`roleFamily`, `levelStated`, `displayLevel`), `public/features/compstimate.js`.
- I dumped every unpacked job in the browser (`api.getJobs` for all 13 boards: 19,198 postings, 12,851 with pay) to check the numbers the personas saw, and read `api/market.json` (the "Same role elsewhere" cells) and the description files where a tag looked wrong.

## 3. The five people

Times are what a real person would take: reading plus thinking, my estimate. The app's own times, measured in the run, are in brackets. Load average during the runs was 1.4–2.7 (five reviewers on 4 CPUs). Nothing was slow beyond the quiet-machine figures (§5).

All five had a reason to use the big-tech boards: four looked only at them, and P1 compared NVIDIA with Palantir and Anduril.

### P1. Jaylen Carter, 22, new graduate, Austin (US), phone

- **Who:** graduating in December 2026 with a BS in Computer Science from UT Austin. Single, rents a room in a shared house. Field: engineering.
- **Goal:** "Find a new-grad software job at NVIDIA, Google or Microsoft paying at least $120K base, in Austin, that leaves me at least $3,000 a month after tax and rent."
- **Reached?** **Yes, on paper.** NVIDIA's *Software R&D Engineer, VLSI Physical Design – New College Grad 2026* (Austin, $116K–218K) leaves **$7,370 a month** for one person in a 1-bedroom flat. I checked the tax by hand and it is right. Three doubts:
  - Juice uses the midpoint ($167K), but a new grad is hired at "Level 2" ($116K–189.8K). At $116K he would keep about $4,400 a month (my estimate), so the goal still holds.
  - "Same role elsewhere" says Google pays entry-level software engineers **$89K**. That figure is mostly Warsaw and Málaga pay; Google's US early-career roles post $147K–211K.
  - In Austin, Google lists only one early-career software role, and it needs a PhD. Its intern card reads "$118,000–157,000 … for about 12 weeks".

| # | Step | What he saw | Time |
|---|---|---|---|
| 1 | Arrives cold | Anthropic's chart under "melon·seek · Pay, and what's left after tax and rent, for 13 companies' open roles". He gets "pay", but nothing says big tech is here. ([p1-01](../screenshots/persona-beta-18-24/p1-01-cold.png)) | 15 s (ready 0.6 s) |
| 2 | Company menu → NVIDIA | A "BIG TECH" group sits at the top of the menu. ([p1-02](../screenshots/persona-beta-18-24/p1-02-company-menu.png), [p1-03](../screenshots/persona-beta-18-24/p1-03-nvidia.png)) | 10 s (0.3 s; 1.3 s at 4× CPU) |
| 3 | Searches "new grad" | "43 roles · 43 in title": every result is a "New College Grad 2026" role. The chart rows are NVIDIA job codes ("Research Staff Member", "Engineer, CAD", "Engineer, Sys SW"). ([p1-04](../screenshots/persona-beta-18-24/p1-04-search-new-grad.png)) | 20 s |
| 4 | Location chip → Austin | The Filters sheet opens at Location. He types "Austin" and taps "Show 8 roles". ([p1-08](../screenshots/persona-beta-18-24/p1-08-location-austin.png), [p1-10](../screenshots/persona-beta-18-24/p1-10-austin-list.png)) | 25 s |
| 5 | Opens *Software R&D Engineer, VLSI* | $116K–218K, "Pay by level: Level 2: $116K–189.8K · Level 3: $136K–218.5K", "Pays more than 8% of NVIDIA's roles that show pay". ([p1-11](../screenshots/persona-beta-18-24/p1-11-drawer-top.png)) | 40 s |
| 6 | Same role elsewhere | "Software engineering roles at Entry level": NVIDIA $152K, Palantir $150K, Anduril $130K, Microsoft $127K, Shield AI $94K, **Google $89K**. ([p1-12](../screenshots/persona-beta-18-24/p1-12-same-role.png)) | 20 s, puzzled |
| 7 | Juice, Monthly | Gross $13,940; tax −$3,470 (income $2,410 · social security $1,070); rent −$1,920 (1-bedroom, city centre); living −$1,180; **$7,370 left**. Compare locations: Austin "$7,360/mo", Santa Clara $4,760. ([p1-13](../screenshots/persona-beta-18-24/p1-13-juice-month.png), [p1-14](../screenshots/persona-beta-18-24/p1-14-juice-compare.png)) | 45 s |
| 8 | Apply | jobs.nvidia.com opens in a new tab. | 5 s |
| 9 | Switches to Google | Toast "Kept 'new college grad', Austin". 0 roles, with "Without the search … there would be 187 roles" and a "Remove the search" button. ([p1-15](../screenshots/persona-beta-18-24/p1-15-google-kept-filters.png)) | 15 s (0.4 s) |
| 10 | "early career", then "software engineer" | 1 role (PhD only), then 4. One of them: *Software Engineering Intern, PhD* "$118,000–157,000", which the drawer calls "for about 12 weeks … not a yearly salary". ([p1-16](../screenshots/persona-beta-18-24/p1-16-google-early-career.png), [p1-26](../screenshots/persona-beta-18-24/p1-26-google-intern-term.png)) | 40 s, confused |
| 11 | Insights (phone) | Pay estimate "Software Engineer · Austin" $184K, medium confidence; at Entry level $172K "based on 17 similar roles". Compare companies: Software engineering at every level. ([p1-18](../screenshots/persona-beta-18-24/p1-18-insights.png), [p1-19](../screenshots/persona-beta-18-24/p1-19-insights-entry.png), [p1-20](../screenshots/persona-beta-18-24/p1-20-compare-companies.png)) | 60 s (1.8 s) |
| 12 | Map | Four pins; on the grey map, two have no city name. ([p1-21](../screenshots/persona-beta-18-24/p1-21-map.png)) | 15 s |
| 13 | Saves the NVIDIA search | A labelled "Save" chip; the toast says "Find it in the company menu, with its new roles". ([p1-22](../screenshots/persona-beta-18-24/p1-22-saved.png)) | 10 s |
| 14 | Comes back later | Opens on his last view (Google, Austin). The menu shows "SAVED SEARCHES · NVIDIA · 'new college grad' · Austin", and one tap restores the 8 roles. ([p1-23](../screenshots/persona-beta-18-24/p1-23-return.png), [p1-24](../screenshots/persona-beta-18-24/p1-24-return-menu.png), [p1-25](../screenshots/persona-beta-18-24/p1-25-return-saved.png)) | 15 s (0.9 s) |

About 5.5 minutes.

### P2. Siobhán Byrne, 23, early career (3.5 years), Dublin (Ireland), desktop

- **Who:** a year in retail after school, then SDR at a Dublin SaaS start-up from 19; now a junior Account Executive. Single, rents a room in a four-person flatshare. Field: sales.
- **Goal:** "Find an account executive or account manager role at Google or Microsoft in Dublin with a published base of at least €60,000, and see what I'd keep each month after Irish tax and rent."
- **Reached?** **Yes, with friction.** Google has 9 Dublin AE roles, all with pay (€76K–116K). *Account Executive, UKI, New Business* (€76K–78K) leaves **$1,330 a month**, and the Irish tax is right (§5). Microsoft's Dublin Digital Account Executives pay €62K–92K. The friction:
  - Google's Department filter offers "Google / YouTube / DeepMind", not Sales.
  - Juice and the pay estimate are only in US dollars.
  - The rent is a 1-bedroom city-centre flat, not her room.
  - "Same role elsewhere" sets her €77K job against Netflix's $380K US median.

| # | Step | What she saw | Time |
|---|---|---|---|
| 1 | Arrives cold | Anthropic: "645 roles · 87% show pay · $347K median · half between $287K and $402K", and the tagline. ([p2-01](../screenshots/persona-beta-18-24/p2-01-cold.png)) | 15 s (0.6 s) |
| 2 | Company menu → Google | "3,417 roles · 65% show pay · $183K median … · mostly Google". ([p2-02](../screenshots/persona-beta-18-24/p2-02-google.png)) | 15 s (0.4 s) |
| 3 | Department, looking for Sales | Google 3,174, YouTube 144, DeepMind 95, GFiber, Verily, Waymo, Wing. The chart, grouped by department, is one big "Google" row. ([p2-03](../screenshots/persona-beta-18-24/p2-03-google-department.png)) | 20 s, confused |
| 4 | Location → Dublin | 137 roles, "98% show pay for Dublin · $88K median". A second city, "Dublinas" (1), sits under Ireland. ([p2-04](../screenshots/persona-beta-18-24/p2-04-google-dublin.png), [p2-05](../screenshots/persona-beta-18-24/p2-05-dublin-account.png)) | 20 s |
| 5 | Searches "account" | "61 roles · 56 in title", including *International Technical Accounting Senior Analyst*. ([p2-05](../screenshots/persona-beta-18-24/p2-05-dublin-account.png)) | 20 s |
| 6 | Salary min "€60,000" | The box becomes "$69K" and says "Min: €60,000 ≈ $69K a year". 60 roles. ([p2-06](../screenshots/persona-beta-18-24/p2-06-salary-eur.png)) | 15 s |
| 7 | Most juice; opens *AE, UKI, New Business* | €76K–78K, "≈ $87K–89K in approx US dollars for comparison", "Level not stated", "+ equity / + bonus mentioned". ([p2-07](../screenshots/persona-beta-18-24/p2-07-ae-drawer.png)) | 40 s |
| 8 | Same role elsewhere | "This posting doesn't state a level, so this compares Sales & partnerships roles at every full-time level": Netflix $380K, Cohere $303K … Microsoft $148K, Google $124K. ([p2-08](../screenshots/persona-beta-18-24/p2-08-ae-same-role.png)) | 20 s |
| 9 | Juice, Monthly | Gross $7,310; tax −$2,220 (income $1,910 · social security $310); rent −$2,520 (1-bedroom, city centre); living −$1,240; **$1,330 left**; "Rent takes 50% of take-home pay". She converts to euros in her head. ([p2-09](../screenshots/persona-beta-18-24/p2-09-ae-juice-month.png)) | 45 s |
| 10 | Switches to Microsoft | "account", Dublin and €60K are kept: 7 roles (Senior Account Manager €60K–103K, Digital Account Executive €62K–92K). With "sales" there are 24, including a Dublin role paid in PLN with a Dublin Juice. ([p2-10](../screenshots/persona-beta-18-24/p2-10-microsoft-kept.png), [p2-11](../screenshots/persona-beta-18-24/p2-11-microsoft-sales.png)) | 45 s (0.3 s) |
| 11 | Insights | Pay estimate "Account Executive · Dublin": $88K, High confidence, 55 roles. Compare companies says "Pay is from every location each company lists, not only the location you filtered on". ([p2-12](../screenshots/persona-beta-18-24/p2-12-insights.png), [p2-13](../screenshots/persona-beta-18-24/p2-13-market-insights.png), [p2-14](../screenshots/persona-beta-18-24/p2-14-compare.png)) | 60 s (2.5 s) |
| 12 | Apply, Save | Google careers opens in a new tab. The saved search is named "Google · 'account executive' · $69K+ · Dublin": her €60,000 has become $69K+. ([p2-15](../screenshots/persona-beta-18-24/p2-15-saved.png)) | 10 s |
| 13 | Comes back later | Opens on the saved view; the search is in the menu. ([p2-16](../screenshots/persona-beta-18-24/p2-16-return-menu.png)) | 10 s (0.7 s) |

About 6 minutes.

### P3. Tyler Nguyen, 24, mid-career (7 years), Chicago (US), phone

- **Who:** started at Apple Retail as a Specialist at 17 and is now a Lead Genius who runs store operations. No degree. Lives with his partner and their 1-year-old son. Field: operations.
- **Goal:** "Move up to a store-manager or operations job at Apple, or a data-centre job at Google or Microsoft, paying at least $75K near Chicago, that leaves us at least $1,000 a month after rent for the three of us."
- **Reached?** **No.**
  - Of Apple's 28 Chicago listings, the only retail role is a *US-Lead Genius* ($65K–97K), his current job. The "Family" preset (two children, a 3-bedroom city-centre home) leaves **−$670 a month**, and he can't enter one child.
  - Apple's *US-Manager* roles are in other cities, and every one is Dry or Rind for a family. The Cincinnati one has no Juice at all.
  - Google's data-centre technician jobs ($86K–145K) are in small towns, and half of them have no Juice.
  - "Same role elsewhere" for a *Data Center Technician III* says "doesn't state a level" next to a "Mid" badge, then compares him with Anthropic's data-centre engineers at $362K.

| # | Step | What he saw | Time |
|---|---|---|---|
| 1 | Cold, then company menu → Apple | 4,879 roles, "$214K median". ([p3-01](../screenshots/persona-beta-18-24/p3-01-apple.png)) | 25 s (0.5 s; 2.1 s at 4× CPU) |
| 2 | Location → Chicago | "Show 28 roles". 22 of them are Apple's "…Internships" listed for "United States", each tagged "General application (no specific opening)". ([p3-02](../screenshots/persona-beta-18-24/p3-02-location-chicago.png), [p3-03](../screenshots/persona-beta-18-24/p3-03-apple-chicago.png)) | 30 s |
| 3 | Opens *US-Lead Genius* | "Apple Retail · Students · Full-time", Senior, $65K–97K, "Annualized from hourly pay ($31.21 and $46.87/hr)". The card shows only $65K–97K. ([p3-04](../screenshots/persona-beta-18-24/p3-04-lead-genius.png)) | 40 s |
| 4 | Juice → Family, Monthly | Gross $6,770; tax −$890 (income $80 · state $290 · social security $520), with "Family here means one earner, married and filing jointly, with two children…"; rent −$3,480 (3-bedroom, city centre); living −$3,070; **−$670**. ([p3-06](../screenshots/persona-beta-18-24/p3-06-lead-genius-juice-family.png)) | 60 s |
| 5 | "manager" + Department Apple Retail, Most juice | 100 roles; every US-Manager is "Dry" or "Rind", and nothing on the list says these scores are for a family of four. ([p3-07](../screenshots/persona-beta-18-24/p3-07-retail-managers-juice.png)) | 60 s |
| 6 | Map, Juice | The legend turns grades into dollars. ([p3-09](../screenshots/persona-beta-18-24/p3-09-map-juice.png)) | 20 s (map 1.0 s at 4× CPU) |
| 7 | Switches to Google | Toast "Kept 'manager' · dropped Apple Retail (not at Google)". "data center technician": 102 roles; 6 of the first 12 have no Juice (Clarksville, Council Bluffs, Horndal…). ([p3-10](../screenshots/persona-beta-18-24/p3-10-google-after-switch.png), [p3-11](../screenshots/persona-beta-18-24/p3-11-google-dc-tech.png)) | 40 s (0.4 s) |
| 8 | Opens *Data Center Technician III* | Council Bluffs, IA, $105K–145K, "Mid". No Juice section and no word on why. Same role elsewhere: "This posting doesn't state a level… Facilities, construction & data centers: **Anthropic $362K**, OpenAI $255K, NVIDIA $245K…". ([p3-12](../screenshots/persona-beta-18-24/p3-12-dc-tech-drawer.png)) | 45 s, distrust |
| 9 | Microsoft | The search is kept. "datacenter technician" (one word) gives "147 roles · 1 in title"; *Data Center Technician Manager* pays $75K–168K in Phoenix and Atlanta. ([p3-13](../screenshots/persona-beta-18-24/p3-13-ms-dc-tech.png)) | 40 s (0.3 s) |
| 10 | Saves, comes back | Opens on the Microsoft view, and the saved search is in the menu. ([p3-14](../screenshots/persona-beta-18-24/p3-14-return-menu.png)) | 15 s (0.6 s) |

About 6.5 minutes.

### P4. Lena Fischer, 24, senior (7 years), Zurich (Switzerland), desktop

- **Who:** a student research assistant in an ETH lab from 17, PhD at 23, now Senior Research Scientist at a Zurich robotics start-up. Married to a primary-school teacher, so they have two incomes. Field: research.
- **Goal:** "Find a Senior or Staff research-scientist role at Google DeepMind, NVIDIA or Apple in Zurich paying at least CHF 200K. Compare what the big-tech companies pay at Senior and at Staff, and see whether moving to the US for $250K or more would leave the two of us more each month."
- **Reached?** **Partly.**
  - Google, NVIDIA and Apple have Zurich research roles, but none lists Zurich pay. The cards still show US and Polish pay next to "Zurich", and NVIDIA's Polish pay gets a Zurich Juice figure.
  - Insights compares the levels well: Senior runs from Netflix $608K to Microsoft $142K, Staff+ from Netflix $833K to Microsoft $209K. But every median mixes countries.
  - In the US, Google's Senior Research Scientist roles pay $174K–252K, below her $250K. A couple keeps $9,180 a month in Mountain View, on a one-earner assumption.
  - She can't answer "Zurich or the US?".

| # | Step | What she saw | Time |
|---|---|---|---|
| 1 | Google, "research scientist" | 80 roles · 67 in title. | 20 s (0.4 s) |
| 2 | Location → Zurich | "5 of 3,417 roles · **0% show pay for Zurich**". Yet the cards show "$174K–252K" and "$232K–252K", and the chart shows "DeepMind · 2 roles · median $227K". ([p4-01](../screenshots/persona-beta-18-24/p4-01-google-rs-zurich.png)) | 30 s, confused |
| 3 | Opens *Research Scientist, Gemini Vision* | "Level not stated". Juice: "No Juice figure for Zurich; this is the best place the posting lists", so it shows Los Angeles, $92,300 a year. ([p4-02](../screenshots/persona-beta-18-24/p4-02-gemini-vision-drawer.png), [p4-03](../screenshots/persona-beta-18-24/p4-03-gemini-vision-juice.png)) | 45 s |
| 4 | All of Google in Zurich | 58 roles, 0% with Zurich pay; the top cards carry US-dollar and Munich-euro pay. ([p4-04](../screenshots/persona-beta-18-24/p4-04-google-zurich-all.png)) | 20 s |
| 5 | NVIDIA, Zurich kept | 48 roles; the cards say "PLN 293K–650K". *Senior GPU Networking Architect*: Couple Juice **$20,200 a year in Zurich**, worked out from Polish pay, with the note "The posted salary currency differs from the local one, so it is applied as posted". The page still says "0% show pay for Zurich". ([p4-05](../screenshots/persona-beta-18-24/p4-05-nvidia-zurich.png), [p4-06](../screenshots/persona-beta-18-24/p4-06-nvidia-pln-drawer.png), [p4-07](../screenshots/persona-beta-18-24/p4-07-nvidia-pln-juice.png)) | 60 s |
| 6 | Apple, Zurich | 20 roles, no pay. The drawer says "No similar role at Apple in Switzerland lists pay, so there is no pay estimate. Pay from other countries isn't used." She trusts this. ([p4-08](../screenshots/persona-beta-18-24/p4-08-apple-zurich-nopay.png)) | 30 s |
| 7 | Google research, all places, grouped by Seniority | Senior 11 (median $213K), Staff+ 23 ($253K), "Level not stated" 39. ([p4-09](../screenshots/persona-beta-18-24/p4-09-google-rs-by-level.png)) | 30 s |
| 8 | Insights → Compare companies | AI research & ML engineering. Senior: Netflix $608K, OpenAI $366K, Cohere $279K, NVIDIA $270K, Apple $255K, Anduril $222K, Google $213K, Microsoft $142K. Staff+: Netflix $833K, Anthropic $675K, NVIDIA $352K … Microsoft $209K. "Not shown: … (don't state levels for most of these roles)". ([p4-10](../screenshots/persona-beta-18-24/p4-10-compare-default.png), [p4-11 Senior](../screenshots/persona-beta-18-24/p4-11-compare-ai-senior.png), [p4-11 Staff](../screenshots/persona-beta-18-24/p4-11-compare-ai-staff.png)) | 60 s (1.9 s) |
| 9 | Seniority = Senior; Juice for a couple | *Lead Research Data Scientist* (Mountain View, $207K–300K): **$9,180 a month** for a couple; New York $7,100. "Couple here means one earner…", but they have two incomes. ([p4-12](../screenshots/persona-beta-18-24/p4-12-us-senior-rs-couple.png)) | 45 s |
| 10 | Saves, comes back | It works. ([p4-13](../screenshots/persona-beta-18-24/p4-13-return-menu.png)) | 15 s |

About 6 minutes.

### P5. Kofi Mensah, 24, design manager and founder, Toronto (Canada), desktop

- **Who:** founded a brand and product design studio at 18; it now has 9 people. Wants to move in-house as a design manager. Engaged and living with his fiancée, a nurse. Field: design.
- **Goal:** "Find a design-manager role at Apple, Google, Microsoft or Netflix, in Toronto, remote from Canada, or in a US city I could move to on a TN visa, paying at least US$200K. Compare what the five companies pay design managers, and keep at least US$6,000 a month for the two of us after tax and rent."
- **Reached?** **Partly.**
  - None of the five has a design role in Toronto, and "Canada" isn't accepted in the Location search.
  - Netflix's product-design roles are "Remote (US)", which he can't take from Canada, and none of them has Juice.
  - He found Google's *Senior UX Design Manager, Messages* (Mountain View, $236K–329K) and Apple's *Senior Design Manager, Design Studio* (Sunnyvale, $268K–402K), which leaves **$12,990 a month** for a couple.
  - He couldn't compare design managers across companies. Compare companies has no Manager level for Design, and Apple's design managers are filed under "Software engineering" and "Marketing".

| # | Step | What he saw | Time |
|---|---|---|---|
| 1 | Cold, then Netflix | 457 roles, $427K median. ([p5-01](../screenshots/persona-beta-18-24/p5-01-netflix.png)) | 20 s (0.2 s) |
| 2 | Location: "Toronto", then "Canada" | Toronto 1; Canada "No matches". | 20 s |
| 3 | Searches "design" | "63 roles · 8 in title", including *Member of Technical Staff, Agentic Systems*. The design roles are "Remote (US)" with no Juice badge. ([p5-02](../screenshots/persona-beta-18-24/p5-02-netflix-design.png)) | 30 s |
| 4 | Opens *Senior Motion Designer, Live* | $310K–420K, Remote (US). Same role elsewhere, Design at Senior: Apple $242K, Google $194K, Anduril $193K, Microsoft $177K. No Juice section. ([p5-03](../screenshots/persona-beta-18-24/p5-03-netflix-remote-us-drawer.png)) | 40 s |
| 5 | Remote popover | Any 63 · Remote 31 · On-site 32 (the counts are right now). ([p5-04](../screenshots/persona-beta-18-24/p5-04-remote-popover.png)) | 10 s |
| 6 | "design manager" at Apple, Google, Microsoft | The search is kept on each switch. Apple: 89 roles, 17 in title, including *ASIC Design Manager*. Google: 147. Microsoft: 38, whose "Design Manager" roles are data-centre jobs in Vaasa, Singapore and Tokyo. ([p5-05 Apple](../screenshots/persona-beta-18-24/p5-05-apple-design-manager.png), [Google](../screenshots/persona-beta-18-24/p5-05-google-design-manager.png), [Microsoft](../screenshots/persona-beta-18-24/p5-05-microsoft-design-manager.png)) | 60 s (0.3–0.5 s each) |
| 7 | Apple *Senior Design Manager, Design Studio* | Same role elsewhere: "**Software engineering** roles at Manager level". Couple Juice $12,990 a month in Sunnyvale. ([p5-06](../screenshots/persona-beta-18-24/p5-06-apple-design-manager-same-role.png), [p5-07](../screenshots/persona-beta-18-24/p5-07-apple-dm-juice-couple.png)) | 60 s |
| 8 | Apple *Design Manager, Content – Health* | "**Marketing, comms & content** roles at Manager level". ([p5-09](../screenshots/persona-beta-18-24/p5-09-apple-dm-health-marketing.png)) | 20 s |
| 9 | Insights | The pay estimate is for "Product Manager", and Compare companies opens on "Program & project management". Design levels on offer: Senior, Staff+, Director+, no Manager. Director+: Apple $221K, Microsoft $220K. ([p5-08](../screenshots/persona-beta-18-24/p5-08-compare-design-director.png)) | 60 s (1.9 s) |
| 10 | Google *Senior UX Design Manager* | "Too few Manager Design roles elsewhere list pay, so this compares Design roles at every full-time level". ([p5-10](../screenshots/persona-beta-18-24/p5-10-google-uxdm-same-role.png)) | 20 s |
| 11 | Google, Toronto | With "design manager" still in the search box, the Location list is empty ("No matches"). After clearing the search: 32 roles, "94% show pay for Toronto". *Research Scientist, Paradigms of Intelligence* shows US pay ($147K–210K) among CA$ cards, and a sales role carries a "CAD" skill tag. ([p5-11a](../screenshots/persona-beta-18-24/p5-11a-toronto-none-with-search.png), [p5-11b](../screenshots/persona-beta-18-24/p5-11b-google-toronto-us-pay.png), [p5-12](../screenshots/persona-beta-18-24/p5-12-map-toronto.png)) | 45 s |
| 12 | Saves "Google · 'ux design manager'", comes back | It works. ([p5-13](../screenshots/persona-beta-18-24/p5-13-return-menu.png)) | 15 s |

About 7 minutes.

## 4. Findings for the group

### What the first review called broken, checked again

| First review | Now | Evidence |
|---|---|---|
| B1 "intern" matched International and Internal | **Fixed.** Anthropic "intern" returns 4 fellowships; Cohere returns its 3 internships. | [regress-b1](../screenshots/persona-beta-18-24/regress-b1-anthropic-intern.png) |
| B2 Compstimate ≈ $215K for an unpaid intern | **Fixed.** "No internship or fixed-term role at Cohere lists pay, so there is no pay estimate. Full-time pay isn't used for internships." | [regress-b2](../screenshots/persona-beta-18-24/regress-b2-cohere-intern.png) |
| B3 Same role elsewhere compared the wrong jobs | **Fixed for those cases.** The drone operator is compared with Anduril and Shield AI only; Anthropic's National Security lead with Policy roles. Other families are still wrong (BF-5). | [regress-b3 operator](../screenshots/persona-beta-18-24/regress-b3-shield-operator.png), [natsec](../screenshots/persona-beta-18-24/regress-b3-natsec.png) |
| B4 "No other company lists this level" was false | **Fixed.** It now reads "Too few Staff+ … roles elsewhere list pay". | [regress-b3 operator](../screenshots/persona-beta-18-24/regress-b3-shield-operator.png) |
| B5 the salary box dropped "£80,000" | **Fixed.** "£80,000 ≈ $108K a year, below the lowest pay listed here ($110K)"; "€60,000" works too. | [regress-b5](../screenshots/persona-beta-18-24/regress-b5-salary-gbp.png), [p2-06](../screenshots/persona-beta-18-24/p2-06-salary-eur.png) |
| B6 the rent dates contradicted each other | **Fixed.** The methodology page gives both dates, and the drawer says "sized for 3 bedrooms with Oct 2025 figures". The methodology table still says "Quarterly · update due". | [regress-b6](../screenshots/persona-beta-18-24/regress-b6-methodology.png), [p3-06](../screenshots/persona-beta-18-24/p3-06-lead-genius-juice-family.png) |
| B7 Couple silently meant married filing jointly | **Fixed.** The note is in the tax row, and the button tooltip says it. | [p4-07](../screenshots/persona-beta-18-24/p4-07-nvidia-pln-juice.png) |
| B8 Victoria, BC was filed under Australia | **Fixed** ("Victoria, Canada"). | [regress-b8](../screenshots/persona-beta-18-24/regress-b8-annotation-locs.png) |
| B9 map labels overlapped on the phone | **Fixed at the default zoom.** | [regress-b9](../screenshots/persona-beta-18-24/regress-b9-phone-map-shield.png) |
| Other groups: on-target earnings shown as base pay | **Fixed.** Cards say "On-target earnings". | [regress-ote](../screenshots/persona-beta-18-24/regress-ote-anthropic-ae.png) |
| Other groups (45–54 B9): a "CAD" skill tag from the currency | **Not fixed on the beta boards** (BF-6). | [p5-11b](../screenshots/persona-beta-18-24/p5-11b-google-toronto-us-pay.png) |

Improvements the first review asked for, now done: filters kept across a company switch; a one-line tagline; the return visit opens the last view; a labelled Save chip; "Level not stated"; Compare companies with a Level choice; a green "Juice left" bar; correct On-site counts. Still open: households (IM-1), local currency (IM-6), Juice for Remote (US) (IM-7), phrase search (IM-4), hourly pay on cards (IM-10), excluding a Fit keyword.

### Broken, fix now (wrong, misleading or blocking)

| # | What is wrong | Who, screen | Screenshot | Owner |
|---|---|---|---|---|
| BF-1 | **A filtered city shows another country's pay.** With Location = Zurich, the stats line says "0% show pay for Zurich", but cards show "$174K–252K" (US) and "€156K–159K" (Munich). The chart plots "DeepMind median $227K", and Highest pay sorts by that pay. NVIDIA's Polish pay (PLN 293K–650K) gets a Zurich Juice of $20,200 a year, with only "applied as posted" to warn. Toronto works the same way ($147K–210K US pay on a Toronto card). 178 paid postings list a country their pay doesn't cover, and 16 get a Juice figure from another country's pay (Microsoft PLN→Dublin, NVIDIA PLN→Zurich and Munich, Google PLN→Hyderabad, Cohere CAD→London). The fix: when the filtered place isn't covered, show "No pay for Zurich (US pay $174K–252K)" and give no Juice. | P4, P5, P2; results, chart, drawer | [p4-01](../screenshots/persona-beta-18-24/p4-01-google-rs-zurich.png), [p4-07](../screenshots/persona-beta-18-24/p4-07-nvidia-pln-juice.png), [p5-11b](../screenshots/persona-beta-18-24/p5-11b-google-toronto-us-pay.png) | `public/app.js` (card pay pill, pay sort, `shownJuice`), `public/viz/chart.js`, `server/juice.js` (`currencyMismatch`); the rule already exists as `payLocations` in `public/features/shared.js` |
| BF-2 | **Intern pay posted as a yearly rate is labelled as the pay for the whole term.** Google's *Software Engineering Intern, PhD* reads "$118,000–157,000 · USD · for about 12 weeks — Fixed-term pay, not a yearly salary", and the card tooltip says the same, so a student reads about $10K a week. In the same drawer, Juice treats it as a yearly rate ($31,730 gross for the term), and so does "Same role elsewhere" ("as a yearly rate"). This affects all 23 Google internships and Microsoft's "per year" internships (CA$43,800–50,000 "for about 26 weeks"). `postedTerm()` only divides by hour, day, week or month, so a yearly figure comes out as the term amount. | P1; card, drawer pay block | [p1-26](../screenshots/persona-beta-18-24/p1-26-google-intern-term.png) | `public/app.js` (`postedTerm`, `payPill`, the drawer's term line) |
| BF-3 | **"Same role elsewhere" and Compare companies mix countries, so the big-tech medians mislead.** Google's Entry software-engineering median of "$89K" comes from 9 postings: 4 in Warsaw and Málaga, 1 Montreal field-sales role, and 4 US roles ($147K–221K; their median is about $179K). Microsoft's Senior AI research "$142K" mixes Redmond, Vancouver, the UK and Oslo. A Dublin AE on €77K is set against Netflix's $380K. The drawer never says these are worldwide medians (Insights does, but only when a location filter is on). On the main site most pay is US, so this was hidden; the global big-tech boards expose it. | P1, P2, P4, P5; drawer, Insights | [p1-12](../screenshots/persona-beta-18-24/p1-12-same-role.png), [p2-08](../screenshots/persona-beta-18-24/p2-08-ae-same-role.png), [p4-11](../screenshots/persona-beta-18-24/p4-11-compare-ai-senior.png) | `scripts/build-market.js` (cells have no country: "melon-market-1 has no country dimension" in `public/features/comps.js`), `compsNote` |
| BF-4 | **A posting that states a mid level is told it "doesn't state a level".** Google's *Data Center Technician III* shows a "Mid" badge, then "This posting doesn't state a level, so this compares … every full-time level". `compsForJob` uses `levelStated(job.seniority)`, which is false for every stored "Mid", instead of `displayLevel(job)`. 554 postings are affected (Google 235, Microsoft 216, NVIDIA 40, Shield AI 31, Netflix 20, Anduril 11, xAI 1). | P3; drawer | [p3-12](../screenshots/persona-beta-18-24/p3-12-dc-tech-drawer.png) | `public/features/comps.js` (`compsForJob`, `compsNote`), and the Mid cells in `scripts/build-market.js` |
| BF-5 | **Role families still misfile jobs, so whole comparisons are wrong.** Apple's *Senior Design Manager, Design Studio* is compared with software-engineering managers; *Design Manager, Content – Health* with marketing; *Product Design Director* and *Seed Studio Visual Design Manager* get no family. A Google data-centre technician is compared with Anthropic's data-centre engineers and real-estate managers ($362K). Google's French *Représentant aux ventes sur le terrain II* (a field-sales job) counts as software engineering. As a result, Compare companies → Design has no Manager level. | P5, P3, P1; drawer, Insights | [p5-06](../screenshots/persona-beta-18-24/p5-06-apple-design-manager-same-role.png), [p5-09](../screenshots/persona-beta-18-24/p5-09-apple-dm-health-marketing.png), [p3-12](../screenshots/persona-beta-18-24/p3-12-dc-tech-drawer.png), [p5-08](../screenshots/persona-beta-18-24/p5-08-compare-design-director.png) | `public/features/roles.js` (`roleFamily` patterns: "engineering" and "content" win over "design manager"; `facilities` is too broad) |
| BF-6 | **A "CAD" skill tag comes from the currency.** 64 of Google's 68 CAD-paid postings and 43 of Microsoft's 46 carry a "CAD" keyword. Google writes "$198000 - $202000 (CAD)", for example on *Senior Product Account Executive, Automotive*. The 45–54 group reported this on the main site. | P5; cards, More → Skills | [p5-11b](../screenshots/persona-beta-18-24/p5-11b-google-toronto-us-pay.png) | `server/keywords.js` (the CAD rule should skip pay sentences) |
| BF-7 | **Place names that aren't cities.** Apple Retail lists store names as cities: "Piazza Liberty, Italy" (Milan), "Via del Corso" (Rome), "Shinsaibashi" and "Umeda" (Osaka), "Rosny 2" (Paris), and "Campania" (a region). Google has "Dublinas, Ireland" next to Dublin. None of them gets Juice, and the cards read oddly. | P3, P2; cards, Location list | [p2-05](../screenshots/persona-beta-18-24/p2-05-dublin-account.png) (Dublinas); Apple examples in §5 | `server/geo.js` or the Apple and Google source adapters (the beta sources lane fixed the pins, not the labels) |

### Improve (ranked by how many of the 5 it helps)

| # | Change | Helps | Screen, screenshot | Owner |
|---|---|---|---|---|
| IM-1 | **Let the household fit real life, and say which one the scores use.** "Just me" is a 1-bedroom city-centre flat, but Jaylen and Siobhán rent rooms. "Couple" is one married earner, but Lena and Kofi have two incomes and Kofi isn't married. "Family" is two children in 3 bedrooms, but Tyler has one child. Add "room in a shared flat", "second earner", "one child" or "my rent" inside the Juice block, which is an existing control. After a household change, nothing on the list says the badges are for a family: the Juice explainer above the cards shows only on the first visit (`juiceScaleNote`). | 5/5 | Juice block, cards ([p3-06](../screenshots/persona-beta-18-24/p3-06-lead-genius-juice-family.png), [p3-07](../screenshots/persona-beta-18-24/p3-07-retail-managers-juice.png), [p2-09](../screenshots/persona-beta-18-24/p2-09-ae-juice-month.png)) | `public/app.js` (`HOUSEHOLDS`, `juiceScaleNote`), `server/juice.js` |
| IM-2 | **Say on arrival that big tech is here.** Everyone lands on Anthropic. The tagline says "for 13 companies' open roles" above a one-company chart, and nothing mentions Google, Apple, NVIDIA, Microsoft or Netflix until the menu opens. Open the beta on a big-tech board, or name the boards in the tagline (text, not a control). | 5/5 | Cold arrival ([p1-01](../screenshots/persona-beta-18-24/p1-01-cold.png), [p2-01](../screenshots/persona-beta-18-24/p2-01-cold.png)) | `public/index.html` (tagline), the beta's default company |
| IM-3 | **Explain board jargon where it appears:** NVIDIA's "Level 2 / Level 3" pay line and departments ("Engineer, Sys SW", "Account Mgr, Dev Relations", "Mgmt, Sys Design"); Apple's "Apple Retail · Students"; Shield AI's "per-hour-wage" and "Full Time Employee"; and the site's own "Staff+", "Director+", "Rind" and "Fixed-term". Titles ("CTJ - Poly", "GCS", "UKI", "III") can't be changed, but the department, meta and pay lines can. | 5/5 | Drawer, chart rows ([p1-11](../screenshots/persona-beta-18-24/p1-11-drawer-top.png), [p3-04](../screenshots/persona-beta-18-24/p3-04-lead-genius.png), [p4-07](../screenshots/persona-beta-18-24/p4-07-nvidia-pln-juice.png)) | `public/app.js` (drawer meta), `server/normalize.js` |
| IM-4 | **Make search match phrases and compound words.** "datacenter technician" gives 147 roles with 1 in title; "design manager" brings ASIC and product managers; Netflix "design" includes *Distributed Systems Engineer 6*. Insights then takes "Product Manager" as the most common title for a "design manager" search. Rank exact phrases first, treat "datacenter" as "data center", and let the pay estimate use the search words. | 4/5 (P1, P3, P4, P5) | Results, Insights ([p3-13](../screenshots/persona-beta-18-24/p3-13-ms-dc-tech.png), [p5-05](../screenshots/persona-beta-18-24/p5-05-apple-design-manager.png), [p5-08](../screenshots/persona-beta-18-24/p5-08-compare-design-director.png)) | `public/app.js` (search), `public/features/compstimate.js` (default title) |
| IM-5 | **Group and filter by role on the big-tech boards.** Google's department is "Google" for 3,174 of 3,417 postings, so the Department filter, the chart's department grouping and "mostly Google" tell her nothing. NVIDIA's departments are job codes. Role families already exist (the "Role:" chip, `FAMILY_LABELS`): add "Role" to the existing Group select and to the Department popover. | 4/5 (P2, P3, P4, P5) | Department popover, chart ([p2-03](../screenshots/persona-beta-18-24/p2-03-google-department.png), [p2-05](../screenshots/persona-beta-18-24/p2-05-dublin-account.png)) | `public/app.js` (group options, filter sections) |
| IM-6 | **Show Juice and the pay estimate in the posting's currency too.** Siobhán thinks in euros, Lena in francs and Kofi in Canadian dollars; the Juice waterfall and the estimate are US dollars only. The saved search turns "€60,000" into "$69K+". | 3/5 (P2, P4, P5) | Juice, Insights, saved search ([p2-09](../screenshots/persona-beta-18-24/p2-09-ae-juice-month.png), [p2-12](../screenshots/persona-beta-18-24/p2-12-insights.png)) | `public/app.js` (`juiceBlock`, saved-search label), `public/features/compstimate.js` |
| IM-7 | **Fill Juice gaps, or say why one is missing.** Netflix's 105 "Remote (US)" postings, Google's data-centre towns (Council Bluffs, Clarksville, Wichita Falls), Apple's Cincinnati and Edina stores and Microsoft's Vaasa have no Juice, and the drawer just leaves the section out. Say "No rent data for Council Bluffs" and offer the nearest city (Omaha). This is the known DQ-4 gap, and it hits the jobs open to people without a degree hardest. | 3/5 (P3, P4, P5) | Drawer, cards ([p3-11](../screenshots/persona-beta-18-24/p3-11-google-dc-tech.png), [p3-12](../screenshots/persona-beta-18-24/p3-12-dc-tech-drawer.png), [p5-03](../screenshots/persona-beta-18-24/p5-03-netflix-remote-us-drawer.png)) | `data/cities.json` (via the livability sources), `public/app.js` (`juiceBlock` empty state) |
| IM-8 | **Small fixes:** Compare locations says "$7,360/mo" for Austin while the headline above says "$7,370" (P1). The "Kept 'new college grad'" toast stays after a new search (P1). On the phone, Save covers the Department chip ("D") (P1, P3). Insights' Location select has about 300 entries, with "Dublinas" and "St George / St. George / Saint George" (P2). | 3/5 | [p1-14](../screenshots/persona-beta-18-24/p1-14-juice-compare.png), [p1-16](../screenshots/persona-beta-18-24/p1-16-google-early-career.png), [p1-15](../screenshots/persona-beta-18-24/p1-15-google-kept-filters.png) | `public/app.js`, `public/styles.css`, `public/features/compstimate.js` |
| IM-9 | **Accept a country in the Location search.** "Canada" gives "No matches", though NVIDIA lists 147 postings by country only (58 of them say just "Switzerland" or "Germany"). A city pick does include them, but a person who will move anywhere in a country has to guess a city. Also, the Location list goes empty when the search box has no match in that place ("design manager" + Toronto), with no hint that the search causes it. | 2/5 (P4, P5) | Location section ([p5-11a](../screenshots/persona-beta-18-24/p5-11a-toronto-none-with-search.png)) | `public/app.js` (location facet) |
| IM-10 | **Show hourly pay as posted on the card,** for example "$31–47/hr" for *US-Lead Genius*. The card shows only "$65K–97K", and the drawer line is missing a word: "($31.21 and $46.87/hr)". | 1/5 (P3) | Card, drawer ([p3-04](../screenshots/persona-beta-18-24/p3-04-lead-genius.png)) | `public/app.js` (`payPill`, hourly label) |

### Good (keep)

| # | What works | Who | Screenshot |
|---|---|---|---|
| GD-1 | **Filters survive a company switch, and the toast says what happened:** "Kept 'manager' · dropped Apple Retail (not at Google)". An empty result offers "Remove the search 'new college grad'" and says how many roles that would bring back (187). | All 5 | [p3-10](../screenshots/persona-beta-18-24/p3-10-google-after-switch.png), [p1-15](../screenshots/persona-beta-18-24/p1-15-google-kept-filters.png) |
| GD-2 | **Coming back works.** The site reopens the last view; Save is a labelled chip; the company menu lists saved searches and restores them exactly. | All 5 | [p1-24](../screenshots/persona-beta-18-24/p1-24-return-menu.png) |
| GD-3 | **Honest about missing pay:** "No similar role at Apple in Switzerland lists pay … Pay from other countries isn't used"; "0% show pay for Zurich"; "No Juice figure for Zurich; this is the best place the posting lists"; "General application (no specific opening)" on Apple's internship pools. | P4, P3, P1 | [p4-08](../screenshots/persona-beta-18-24/p4-08-apple-zurich-nopay.png), [p4-03](../screenshots/persona-beta-18-24/p4-03-gemini-vision-juice.png) |
| GD-4 | **Juice tax is right and explained.** Checked by hand for Texas single, Ireland single, and Illinois married filing jointly with two child credits (§5). The joint-filing sentence and the two rent dates are where people read them. | P1, P2, P3 | [p1-13](../screenshots/persona-beta-18-24/p1-13-juice-month.png), [p2-09](../screenshots/persona-beta-18-24/p2-09-ae-juice-month.png), [p3-06](../screenshots/persona-beta-18-24/p3-06-lead-genius-juice-family.png) |
| GD-5 | **Clear pay lines:** NVIDIA's "Pay by level", "≈ $87K–89K in approx US dollars for comparison", "Annualized from hourly pay", "On-target earnings", "Pays more than 8% of NVIDIA's roles that show pay". | P1, P2, P3 | [p1-11](../screenshots/persona-beta-18-24/p1-11-drawer-top.png), [p2-07](../screenshots/persona-beta-18-24/p2-07-ae-drawer.png) |
| GD-6 | **The salary box reads €60,000 and £80,000** and says what it understood. | P2 | [p2-06](../screenshots/persona-beta-18-24/p2-06-salary-eur.png) |
| GD-7 | **Compare companies with a Level choice** (Senior against Staff+) and an honest "Not shown: … (don't state levels for most of these roles)". | P4 | [p4-11](../screenshots/persona-beta-18-24/p4-11-compare-ai-senior.png) |
| GD-8 | **"Same role elsewhere" when the family and level are right**: NVIDIA's new-grad role against Palantir and Anduril; the drone operator now against field-operations roles only. | P1 | [p1-12](../screenshots/persona-beta-18-24/p1-12-same-role.png), [regress-b3](../screenshots/persona-beta-18-24/regress-b3-shield-operator.png) |
| GD-9 | **It's fast with 20,000 postings.** Company switches take 0.2–0.5 s on the phone, and Apple 2.1 s with the CPU slowed 4×. A cold first card takes 2.5–2.7 s at 4× CPU. Insights opens in 2.3 s, and the map's first pins in 1.0 s. | All 5 | [p1-03](../screenshots/persona-beta-18-24/p1-03-nvidia.png) |
| GD-10 | **The Big Tech group comes first in the company menu**, with type-ahead. The phone Filters sheet opens at the tapped section and shows "Show 8 roles" before you commit. | P1, P3 | [p1-02](../screenshots/persona-beta-18-24/p1-02-company-menu.png), [p1-08](../screenshots/persona-beta-18-24/p1-08-location-austin.png) |
| GD-11 | **Apply goes to the official careers site** (NVIDIA, Google, Apple) in a new tab, and Copy link sits next to it. | All 5 | [p1-11](../screenshots/persona-beta-18-24/p1-11-drawer-top.png) |

## 5. Replayable steps and checks

1. `mkdir -p <scratch>/persona-beta-18-24 docs/screenshots/persona-beta-18-24`, then copy the prompt to `docs/process/prompts/persona-beta-18-24.md` (`diff` confirms it is identical).
2. Serve the lead's build in the background: `node scripts/cycle/serve.mjs --dist <scratch>/cycle-beta/dist --pid <scratch>/persona-beta-18-24/serve.pid > <scratch>/persona-beta-18-24/serve.log`. It used port 40159. Stop it with `kill "$(cat <scratch>/persona-beta-18-24/serve.pid)"`.
3. Scripts, in `<scratch>/persona-beta-18-24/` and not committed (this role owns only the log, the prompt and the screenshots). Run each with `NODE_PATH=<scratch>/pw/node_modules node <script>`; never run `playwright install`.
   - `lib.mjs`: launch, actions and screenshots. Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; desktop is 1440×900; the phone is 390×844 with isMobile, hasTouch and DPR 2. Every non-local request is aborted. Cards are `#resultsList article.card`, because the first `li` is the Juice explainer.
   - `cold.mjs`, `explore.mjs` and `dump.mjs` (writes `jobs.json`, all 19,198 jobs); `q.mjs` for ad-hoc queries; `fam.mjs` lists the postings behind a "Same role elsewhere" cell.
   - The journeys are `p1a`–`p1f`, `p2a`–`p2c`, `p3a`/`p3a2`/`p3b`/`p3c`, `p4a`–`p4c` and `p5a`–`p5c`. Each saves the browser storage, so a later phase continues the same person, and writes `pNx-steps.json` with timings.
   - Checks: `regress.mjs` (earlier B1–B8), `misc2.mjs` (4× CPU timings), `switch.mjs` (switch times), `intern.mjs`/`intern2.mjs` and `term.mjs` (BF-2), `mism.js` and `multi.js` (BF-1 counts), `extra.mjs` (BF-6 count, Toronto screenshot), `ote.mjs`.
4. Phone mechanics: the Salary, Department, Location, Seniority and Remote chips open the Filters sheet at their section (confirm with "Show N roles"); the result list is a bottom sheet (`#sheetHandle`).

Numbers checked by hand:
- **P1, Texas, single, $167,250 midpoint.** Federal tax: taxable $151,150 after the $16,100 standard deduction, giving $28,874 a year ($2,406 a month; the drawer says $2,410). FICA: 7.65% is $12,795 ($1,066 a month; the drawer says $1,070).
- **P2, Ireland, €77,000.**
  - Income tax: 20% on €44,000 plus 40% on €33,000, minus €4,000 of credits, is €18,000. USC is €2,203. Together, €20,203 at 1.140 $/€ is $23,000 a year, as shown.
  - PRSI: 4.2% is €3,234, or $3,700, as shown.
- **P3, Illinois, married filing jointly, $81,204.**
  - Federal tax: taxable $49,004 after the $32,200 deduction is $5,384; minus $4,400 of child credits, $984 a year, or $82 a month. The drawer says $80.
  - Illinois: 4.95% after 4 exemptions is about $288 a month; the drawer says $290.
  - FICA: $518 a month; the drawer says $520.
- **BF-3, Google's Entry software-engineering cell** (`api/market.json`: n 9, p25 $75,000, median $89,300). The midpoints are 4 Warsaw and Málaga roles at about $65K–78K, a Montreal sales role at about $90K, and 4 US roles at $178.5K–186.5K.
- **Counts:** BF-1 (178 postings, and 16 Juice figures from another country's pay), BF-4 (554), BF-6 (Google 64 of 68, Microsoft 43 of 46). All came from the dump and the in-browser module calls above.
- **BF-7 examples, from the dump:** Apple *IT-Manager* "Piazza Liberty, Italy" and "Via del Corso, Italy"; *JP-Manager* "Shinsaibashi, Japan" and "Umeda, Japan"; *FR-Manager* "Rosny 2, France"; *IT-Manager* "Campania, Italy". All of them have juice: null.

Timings, with load averages of 1.4–2.7:
- At normal speed: landing 0.56–0.71 s; company switches on the phone 0.17–0.49 s (Apple is the slowest).
- At 4× CPU on the phone with no network throttle:
  - switches: Apple 2.1 s, Google 1.4 s, NVIDIA 1.3 s, Microsoft 1.1 s, Netflix 0.65 s;
  - cold first card: Apple 2.7 s, Google 2.6 s, NVIDIA 2.5 s;
  - Apple: Insights 2.3 s and the first map pins 1.0 s.
- These are in line with [perf-mobile-beta.md](perf-mobile-beta.md) (Fast 4G adds the network), so nothing is reported as slow.

The console logged only `net::ERR_FAILED` for the blocked board and tile requests.

## 6. Known gaps and follow-ups

- I wrote no failing tests, because this role owns only the log, the prompt and the screenshots. These are easy to encode:
  - BF-2: `postedTerm` for `{ min: 118000, max: 157000, interval: 'year', termWeeks: 12 }` must not present $118,000 as the term amount.
  - BF-4: `compsNote(compsForJob(market, { seniority: 'Mid', seniorityBasis: 'title', … }))` must not say "doesn't state a level".
  - BF-5: `roleFamily('Senior Design Manager, Design Studio - Employee Experience & Engineering')` should be `design`.
  - BF-6: a description with "$198000 - $202000 (CAD)" must not produce a CAD skill.
- Human step times are my estimates; only the app's own response times were measured.
- Scrolling Insights with `scrollIntoView` leaves a blank lower half in some desktop screenshots (p4-11). A real wheel scrolls the inner panel, so this is not reported (the first review saw the same).
- Not tested: whether a saved search's "new roles" count works (it needs two snapshot days), Add board, and keyboard-only use.

## 7. Change log

- 2026-10-11: served the 83023f5 beta build; ran cold-arrival and exploration probes on desktop and phone; dumped all 13 boards; ran the five journeys (P1 and P3 on the phone); rechecked the first review's B1–B9 and the cross-group items; measured 4× CPU timings; counted the BF-1, BF-4 and BF-6 cases; wrote this log; shrank the screenshots.
