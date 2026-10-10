# Persona review: job seekers aged 35–44 (stable site)

## 1. Brief

Prompt: [prompts/persona-stable-35-44.md](prompts/persona-stable-35-44.md). Five people aged 35–44, one per
career level, each did a real job hunt on the local build of the stable site (`/melon-seek/`, today's
snapshot of the 8 boards, fetched 2026-10-10 09:54 UTC). We judged the site as job seekers, not engineers.

Files owned: this file, the prompt file, and `docs/screenshots/persona-stable-35-44/` (86 PNGs). No
product code was edited, nothing was committed.

Not reported, as the lead asked: the badge falling back to the bundled snapshot, and grey map tiles
("Basemap unavailable · pins still work").

| # | Person | Level | City, country | Household | Field | Device | Goal reached? |
|---|---|---|---|---|---|---|---|
| 1 | Grace Mensah, 38 | New graduate, returning parent | Toronto, Canada | Family of 4 | Research | Phone | **No** |
| 2 | Tom Hargreaves, 42 | Early career (3 yrs), career changer | London, UK | Couple | Design | Desktop | **No** |
| 3 | Daniela Ruiz, 37 | Mid-career (7 yrs) | Dallas, US | Single parent, 1 child | Operations | Phone | **Yes, roughly** |
| 4 | Arjun Mehta, 41 | Staff (15 yrs) | Sydney, Australia | Family of 4 | Engineering (ML) | Laptop | **No** for Sydney, partly for a move |
| 5 | Helen Kowalski, 44 | Director (18 yrs) | Arlington VA (Washington DC) | Family of 4 | Sales | Phone, then desktop | **Partly**, and misled on pay |

Times are what a person would spend: our clicks and reading, estimated step by step. Measured machine
times are given where they matter. The site itself is fast: first cards appear in 0.5–1.1 s, a company
switch takes 0.1–0.3 s, opening a job 0.3–0.5 s, the map 0.7 s and Insights 1.2 s on desktop. On a
throttled phone (4× CPU, ~16 Mbit/s, 150 ms) it's 1.4 s for the map, 2.0 s for Insights, 0.7 s to open a
job, and **5.0 s for Anduril's first cards**.

## 2. The five people

### 2.1 Grace Mensah, 38, Toronto: student / new graduate (phone)

**Who.** Spent nine years at home with her children (7 and 10). She has just finished a part-time MSc in
computer science, with a thesis on AI evaluation. Her partner works full time. Field: research.

**Goal.** "An internship, fellowship or first research job I can do from Toronto (remote or a Toronto
office), paying at least C$70K, that on its own would leave my family of four at least C$1,000 a month
after tax, rent and living costs."

**Reached? No.** She found three Cohere internships with no pay listed, and the Anthropic Fellows Program,
which lists Ontario and pays C$4,300 a week. The site couldn't tell her what that leaves in Toronto: the
only Juice it offered was for San Francisco (family: $3K/mo). The one Canadian-paid role that does score
Toronto, a C$83K data-annotation contract, leaves her family −$1K a month.

| Step | What she did and saw | Time |
|---|---|---|
| 1 | Cold arrival on the phone: "Anthropic", an "Oct 10" pill, a monitor icon, a chart of bubbles with numbers. No site name and no job card above the fold; the 645 roles sit in a closed bottom sheet. She guesses it's "Anthropic's jobs by salary". ([p1-01](../screenshots/persona-stable-35-44/p1-01-cold-phone.png)) | 0:00–0:20 |
| 2 | Opens the company menu. It's titled "Job boards", with group headings GREENHOUSE / ASHBY / LEVER and slugs like `andurilindustries`. She knows Cohere is a Toronto company and picks it (loads in 0.1 s). ([p1-02](../screenshots/persona-stable-35-44/p1-02-company-menu.png), [p1-03](../screenshots/persona-stable-35-44/p1-03-cohere.png)) | 0:20–0:50 |
| 3 | Seniority opens the full filter sheet. She ticks Intern and taps "Show 3 roles". She notices that Remote reads "Any 119 · Remote 82 · On-site 119". ([p1-04](../screenshots/persona-stable-35-44/p1-04-seniority-pop.png)) | 0:50–1:30 |
| 4 | The chart is a blank screen saying "No published salaries". She drags the sheet up: 3 Winter 2027 internships, all "No salary", all "5mo" old. The quickbar now shows clipped chips ("ition", "Inte") and a bookmark icon. ([p1-05](../screenshots/persona-stable-35-44/p1-05-cohere-interns.png), [p1-06](../screenshots/persona-stable-35-44/p1-06-cohere-interns-list.png)) | 1:30–2:00 |
| 5 | Opens the ML Intern/Co-op posting. "Salary not listed", no estimate, "Internships · Internships", the locations "Canada · Canada" and "United States · United States", and the button "Apply on Ashby". ([p1-07](../screenshots/persona-stable-35-44/p1-07-intern-drawer.png)) | 2:00–2:40 |
| 6 | Tries Insights. "Compstimate" (a word she doesn't know) says "Not enough comparable roles… for Intern", and says it twice. ([p1-18](../screenshots/persona-stable-35-44/p1-18-insights-cohere-intern.png)) | 2:40–3:20 |
| 7 | Switches to Anthropic. Her Intern filter is gone. She types "fellow" and gets 4 roles. ([p1-09](../screenshots/persona-stable-35-44/p1-09-anthropic-fellows-search.png)) | 3:20–4:00 |
| 8 | Opens "Anthropic Fellows Program, AI Safety & Security". **$200K**, "Annualized from weekly pay (3,850 USD / 2,310 GBP / 4,300 CAD)", which is clear and honest. Then a big green "2% percentile" and "Pays more than 2% of roles at Anthropic". "Same role elsewhere" compares the fellowship with *Security* roles. ([p1-10](../screenshots/persona-stable-35-44/p1-10-fellows-drawer.png)) | 4:00–5:00 |
| 9 | Juice: "58 · Ripe, $70K/yr left in San Francisco". She has to open the collapsed section to find Family; that gives "≈39 · Dry, $3K/mo left in San Francisco". There's no Toronto, and no "my city". ([p1-11](../screenshots/persona-stable-35-44/p1-11-juice-single.png), [p1-12](../screenshots/persona-stable-35-44/p1-12-juice-family-monthly.png)) | 5:00–6:30 |
| 10 | Map: pins for London, Ontario and British Columbia all say "$200K", although the posting pays C$4,300 a week (≈$160K) in Canada and £2,310 a week in London. ([p1-16](../screenshots/persona-stable-35-44/p1-16-map-interns.png)) | 6:30–7:00 |
| 11 | Back on Cohere, she searches "annotation": a C$83K contract (40 CAD/hour), remote in Canada. The Juice for Family *does* list Toronto: −$1K/mo. But the rounded rows don't add up ($5K − $1K − $2K − $2K shown as −$603). The location list also offers "Victoria, Australia" for a job listed only in Canadian cities. ([p1-22](../screenshots/persona-stable-35-44/p1-22-annotation-juice-family-toronto.png), [p1-21](../screenshots/persona-stable-35-44/p1-21-victoria-bc-as-australia.png)) | 7:00–8:00 |
| 12 | Saves "Anthropic · Intern" with the bookmark icon. The toast says "Saved — find it in the company menu". She comes back in a new session and finds it under SAVED SEARCHES. ([p1-14](../screenshots/persona-stable-35-44/p1-14-quickbar-with-save.png), [p1-15](../screenshots/persona-stable-35-44/p1-15-saved-toast.png), [p1-17](../screenshots/persona-stable-35-44/p1-17-return-saved-searches.png)) | 8:00–8:45 |

Total: about 9 minutes. Words she didn't know: Compstimate, Juice/Ripe/Dry/Rind, Clusters/Ranges,
percentile, Ashby, Greenhouse, "regional"/"social" tax, "(update due)", the "≈" before scores.

### 2.2 Tom Hargreaves, 42, London: early career (desktop 1440×900)

**Who.** He taught secondary-school art for 12 years, then retrained and has been a product designer for
3 years. He lives with his partner, who works part time. Field: design.

**Goal.** "A product-design role in London (hybrid is fine) paying at least £75K that leaves the two of us
at least £1,500 a month after tax, rent and living costs."

**Reached? No.** Across the 8 companies there are 6 product-design postings in London (3 at Palantir,
3 at Scale AI), and none lists pay. The one estimate he got, ≈$133K for Palantir London, says it is
"based on 6 similar roles … · London", but Palantir has no London role with pay at all. Insights, for the
same search, says "Not enough comparable roles … for London".

| Step | What he did and saw | Time |
|---|---|---|
| 1 | Cold arrival. Logo, "Anthropic 645", a salary chart and cards. He gets "jobs plotted by pay" quickly, but nothing says the site covers 8 companies. ([p2-01](../screenshots/persona-stable-35-44/p2-01-cold-desktop.png)) | 0:00–0:15 |
| 2 | Searches "designer": 4 Anthropic roles, all in San Francisco at $305K+. The Location popover has no London. ([p2-02](../screenshots/persona-stable-35-44/p2-02-anthropic-designer.png), [p2-03](../screenshots/persona-stable-35-44/p2-03-location-popover.png)) | 0:15–1:00 |
| 3 | Company menu, types "pala", presses Enter. His search box is now **empty**, so he retypes "designer". 13 roles, every one "No department"; ages "7y+", "9y+", "13y+". ([p2-04](../screenshots/persona-stable-35-44/p2-04-palantir-search-cleared.png), [p2-05](../screenshots/persona-stable-35-44/p2-05-palantir-designer.png)) | 1:00–1:40 |
| 4 | Opens a US posting to see the layout: "Product Designer – US Government", $105–175K, "Updated 14 May 2019". Same role elsewhere has rows like "Anthropic 5", with no label on the 5. ([p2-06](../screenshots/persona-stable-35-44/p2-06-palantir-designer-drawer.png)) | 1:40–2:20 |
| 5 | Ticks London: 3 roles, all "No salary". He opens "Product Designer" (London): COMPSTIMATE "≈ $133K ($130K–140K, low confidence). Based on 6 similar roles at Palantir, Mid · London. Typically within ±7%". The posting is "Listed 5,000 days ago (31 Jan 2013)". ([p2-07](../screenshots/persona-stable-35-44/p2-07-palantir-london-designer.png), [p2-08](../screenshots/persona-stable-35-44/p2-08-london-designer-drawer-compstimate.png)) | 2:20–3:20 |
| 6 | Insights. Compstimate now says "Not enough comparable roles … for London", which contradicts step 5. Compare companies opens on "Software engineering"; he finds "Design (5 companies)" in a 26-item list, and it shows only US pay. ([p2-09](../screenshots/persona-stable-35-44/p2-09-insights-london-designer.png), [p2-10](../screenshots/persona-stable-35-44/p2-10-compare-companies-design.png)) | 3:20–4:50 |
| 7 | Scale AI: retypes "designer". "Staff Product Designer, Enterprise", London, no salary. ([p2-17](../screenshots/persona-stable-35-44/p2-17-scale-designer.png)) | 4:50–5:30 |
| 8 | Anthropic + London, sorted by "Most juice". The Salary popover only takes USD ("non-USD ranges are compared in approx USD"), so he'd have to convert £75K himself. ([p2-11](../screenshots/persona-stable-35-44/p2-11-anthropic-london.png), [p2-12](../screenshots/persona-stable-35-44/p2-12-anthropic-london-most-juice.png), [p2-13](../screenshots/persona-stable-35-44/p2-13-salary-popover.png)) | 5:30–6:15 |
| 9 | To learn what a London salary leaves a couple, he opens "AV Engineer, Builds and Design" (£210–250K; the word "Design" drew him in). The breakdown is in dollars ("$26K/mo", "−$11K/mo"), with "regional $0", "Each person is taxed separately here" and "(update due)" three times. The header still says "/yr" after he switched to Monthly. ([p2-14](../screenshots/persona-stable-35-44/p2-14-juice-london-couple.png), [p2-15](../screenshots/persona-stable-35-44/p2-15-juice-london-couple-block.png)) | 6:15–7:45 |
| 10 | Saves "Palantir · "designer" · London"; on return it's under SAVED SEARCHES. ([p2-16](../screenshots/persona-stable-35-44/p2-16-saved.png), [p2-18](../screenshots/persona-stable-35-44/p2-18-return-menu.png)) | 7:45–8:30 |
| 11 | Reads "How it's calculated". It's clear and friendly ("Think of the salary as a melon"), with a worked example. ([p2-19](../screenshots/persona-stable-35-44/p2-19-methodology.png)) | 8:30–9:15 |

Total: about 9 minutes. Numbers he wouldn't trust: the ≈$133K London estimate, ages of 9 and 13 years,
and Juice in dollars for London.

### 2.3 Daniela Ruiz, 37, Dallas: mid-career (phone)

**Who.** Five years as an Army logistics officer, then two as a civilian supply-chain analyst. She is a
single mother of an 8-year-old. Field: operations.

**Goal.** "An on-site or hybrid operations or program-management role in Dallas paying at least $130K
base that leaves me at least $2,500 a month after tax, rent and living costs for me and my daughter."

**Reached? Yes, roughly.** She found Shield AI "Senior Program Manager (R4932)", $140–210K, Dallas.
The site has no single-parent household, so she used Couple (two adults, a 2-bedroom home); that leaves
≈$7K/mo. She saved the search, and it showed "4 new" when she came back.

| Step | What she did and saw | Time |
|---|---|---|
| 1 | Cold arrival (as 2.1). She wants defence companies. In the company menu, Shield AI sits under "LEVER", below the fold. ([p3-01](../screenshots/persona-stable-35-44/p3-01-menu-scrolled.png), [p3-02](../screenshots/persona-stable-35-44/p3-02-shieldai-phone.png)) | 0:00–0:45 |
| 2 | Location → Dallas (201 of 615). ([p3-03](../screenshots/persona-stable-35-44/p3-03-location-sheet.png)) | 0:45–1:10 |
| 3 | Types 130000 in the salary Min box (the phone shows a numeric keypad); it becomes "$130K" and the button reads "Show 180 roles". The chart groups by "X-BAT Division", "RaptorX", "Hivemind Solutions Division". Some rows still show medians under $130K (Legal $119K) because a role matches if its range *overlaps* hers. The active chips are scrolled out of sight. ([p3-04](../screenshots/persona-stable-35-44/p3-04-salary-min-keyboard.png), [p3-05](../screenshots/persona-stable-35-44/p3-05-salary-min-set.png), [p3-06](../screenshots/persona-stable-35-44/p3-06-shield-dallas-130k-chart.png)) | 1:10–2:10 |
| 4 | Searches "program manager": "22 roles · 12 in title". Under "Highest pay", a $110K role sits above a $190K one (title matches come first). The card tags are odd: "Mechanical design" on a talent-acquisition program manager, "Azure", "On-call / reliability". The first card says "San Diego, CA +2" although she filtered Dallas. ([p3-08](../screenshots/persona-stable-35-44/p3-08-program-manager-chart.png), [p3-09](../screenshots/persona-stable-35-44/p3-09-program-manager-list.png), [p3-22](../screenshots/persona-stable-35-44/p3-22-talent-pm-mechanical-design-tag.png)) | 2:10–2:50 |
| 5 | Opens Senior Program Manager (R4932), $140–210K, "+ equity mentioned · + bonus mentioned". ([p3-10](../screenshots/persona-stable-35-44/p3-10-drawer-top.png)) | 2:50–3:20 |
| 6 | Juice: she looks for "me + 1 child" and finds Just me / Couple / Family (2 + 2). She picks Couple and Monthly: $15K − $3K − $2K − $2K = **$7K/mo**, rounded to the nearest $1K. "Rent takes 18% of take-home pay" helps. ([p3-11](../screenshots/persona-stable-35-44/p3-11-juice-dallas-couple-monthly.png)) | 3:20–4:30 |
| 7 | Same role elsewhere → taps Anduril. The toast says "No "program manager" / Dallas roles at Anduril — showing all matches"; her $130K filter was dropped without a word. The departments read "Hardware Platform : Hardware Engineering Services : Lethality". ([p3-12](../screenshots/persona-stable-35-44/p3-12-same-role-elsewhere.png), [p3-13](../screenshots/persona-stable-35-44/p3-13-after-pick-anduril.png), [p3-14](../screenshots/persona-stable-35-44/p3-14-anduril-program-list.png)) | 4:30–5:15 |
| 8 | Map with the Dallas filter: pins also for Seattle, San Diego and DC, and labels overlap ("San Diego, CA + 1 nea Dallas, TX"). The Juice legend ("Ripe 45–69 = $48K–$96K/yr") is the first place the grades make sense. ([p3-19](../screenshots/persona-stable-35-44/p3-19-map-dallas.png), [p3-20](../screenshots/persona-stable-35-44/p3-20-map-juice.png)) | 5:15–6:00 |
| 9 | Reads the description and taps "Apply on Lever · jobs.lever.co", which opens a new tab (0.3 s). ([p3-21](../screenshots/persona-stable-35-44/p3-21-description.png)) | 6:00–6:30 |
| 10 | Saves with the bookmark icon ("Save this search"), then comes back three weeks later (simulated). The company menu says "4 new", and the saved search shows 4 "New" tags. If she had browsed Shield AI in between without the saved search, the menu still says "4 new" but **no card is marked New**. ([p3-15](../screenshots/persona-stable-35-44/p3-15-saved-toast-phone.png), [p3-16](../screenshots/persona-stable-35-44/p3-16-return-menu-new-count.png), [p3-17](../screenshots/persona-stable-35-44/p3-17-saved-search-new-tags.png), [p3-18](../screenshots/persona-stable-35-44/p3-18-between-visit-no-new-tags.png)) | 6:30–7:30 |

Total: about 7.5 minutes. Words she didn't know: Juice grades, "Staff+", "middle 50%", "Full Time Employee"
next to "International EOR" in the employment filter.

### 2.4 Arjun Mehta, 41, Sydney: senior / staff (laptop 1280×800)

**Who.** Staff ML engineer with 15 years' experience. Married with two children; his wife is
re-training. Field: engineering (ML).

**Goal.** "A staff-level ML or research-engineering role I can do from Sydney (office or remote) paying at
least A$400K (≈US$265K) base, and a fair comparison of Staff pay across Anthropic, OpenAI, Cohere and
Anduril. If there's nothing in Sydney: what a move to the US would leave my family of four."

**Reached? No for Sydney; partly for a move.** None of the 121 postings that mention Australia lists
Australian pay. The 9 that show a figure are global or US roles that also list an Australian place. Yet
the site shows "Sydney · $61K · 55 roles" on the map, and estimates ≈$237K for a Sydney ML engineer from
US roles. The comparison of levels is distorted: "Mid" means "no level word in the title". The move
question did work: an OpenAI ML Engineer in Seattle ($437–485K) leaves ≈$258K/yr for a family.

| Step | What he did and saw | Time |
|---|---|---|
| 1 | Cold arrival on a 1280-px laptop; "Add board" shrinks to a "+". He gets the idea at once. ([p4-01](../screenshots/persona-stable-35-44/p4-01-cold-laptop.png)) | 0:00–0:10 |
| 2 | Anthropic: ticks Staff+ and types "Syd" in the location search: 1 Sydney role, no pay. Remote has 11, but he can't tell which ones allow Australia. ([p4-02](../screenshots/persona-stable-35-44/p4-02-sydney-search-in-location.png)) | 0:10–1:15 |
| 3 | Searches "machine learning": "270 roles · 6 in title". He groups by Seniority: **Mid 168, Senior 12, Staff+ 50**. $500–850K research engineers are tagged "Mid". In Ranges view the legend counts differ (Mid 140). ([p4-03](../screenshots/persona-stable-35-44/p4-03-ml-grouped-by-seniority.png), [p4-04](../screenshots/persona-stable-35-44/p4-04-ml-ranges-view.png)) | 1:15–3:00 |
| 4 | Anduril → Location popover → Sydney: "55 of 2,491 roles · 9% list pay · $61K median". The top cards under "Highest pay" are "Recruiting Coordinator (Contractor)" roles based in Costa Mesa. ([p4-05](../screenshots/persona-stable-35-44/p4-05-anduril-location-popover-sydney.png), [p4-06](../screenshots/persona-stable-35-44/p4-06-anduril-sydney.png)) | 3:00–3:45 |
| 5 | Opens "Senior Machine Learning Engineer", Sydney: COMPSTIMATE "≈ $237K ($193K–274K, low confidence). Based on 14 similar roles at Anduril, Senior · Sydney". None of those roles is in Sydney. ([p4-07](../screenshots/persona-stable-35-44/p4-07-sydney-ml-drawer-compstimate.png)) | 3:45–4:45 |
| 6 | Map: "Sydney, Australia + 4 nearby · $61K · 55", next to Costa Mesa and Abu Dhabi pins. ([p4-08](../screenshots/persona-stable-35-44/p4-08-map-sydney.png)) | 4:45–5:15 |
| 7 | Insights at OpenAI with Staff+: Compstimate gives $369K, "High confidence, based on 9 similar roles at OpenAI, Staff+", which is useful. But its Level box reads "Any level". Compare companies ignores Staff+, so he compares all ML roles. ([p4-10](../screenshots/persona-stable-35-44/p4-10-insights-openai-staff.png), [p4-09](../screenshots/persona-stable-35-44/p4-09-compare-companies-ml.png)) | 5:15–6:45 |
| 8 | OpenAI, "machine learning engineer", Most juice. He opens "ML Engineer, Core Experimentation" (Seattle, $437–485K) and picks Family: "≈96 · Juicy, $258K/yr left in Seattle". The cards re-score for Family (0.6 s). Same role elsewhere: "AI research & ML engineering at Mid level: Anthropic $600K". ([p4-11](../screenshots/persona-stable-35-44/p4-11-openai-ml-juice-family.png), [p4-12](../screenshots/persona-stable-35-44/p4-12-list-after-family.png)) | 6:45–8:00 |
| 9 | Hovers a chart bubble: "10 roles · $400K–$500K midpoint", with the titles listed. Clicking it filters the list and adds a chip. ([p4-13](../screenshots/persona-stable-35-44/p4-13-chart-bubble-hover.png), [p4-14](../screenshots/persona-stable-35-44/p4-14-chart-bubble-clicked.png)) | 8:00–8:30 |
| 10 | Saves "Anduril · "engineer" · Sydney" for when pay appears. On return the site opens on Anthropic; the search is in the company menu. ([p4-15](../screenshots/persona-stable-35-44/p4-15-return-saved.png)) | 8:30–9:00 |

Total: about 9 minutes. Numbers he wouldn't trust: Sydney $61K, the ≈$237K estimate, and "Mid" on
$850K roles.

### 2.5 Helen Kowalski, 44, Arlington VA: director (phone on the Metro, then desktop)

**Who.** Eighteen years in federal and defence sales, now a regional sales director. Married with two
teenagers. Field: sales.

**Goal.** "A Director or Head-level public-sector sales or business-development role in the DC area with
base pay of at least $250K, compared across all 8 companies, that leaves my family at least $8K a month."

**Reached? Partly, and misled on pay.** She shortlisted OpenAI's Federal Account Director ($261–335K), Shield AI
directors (median $262K in DC) and Anthropic's Head of National Security Sales at $550–700K. But that
Anthropic figure is OTE (base plus commission target), as the posting itself says, while the site
labels it "Posted base pay". The site then compares it with other companies' base pay (Anthropic $625K vs
OpenAI $262K) and with *Security* roles. Comparing 5 companies by hand took 23 clicks and typed filters.

| Step | What she did and saw | Time |
|---|---|---|
| 1 | Phone, cold. She taps the "Oct 10" pill: "Where this data comes from … Greenhouse / anthropic … Download CSV". ([p5-01](../screenshots/persona-stable-35-44/p5-01-badge-tapped-phone.png)) | 0:00–0:40 |
| 2 | Filters → Director+ → location search "Wash" → Washington, DC → "Show 2 roles". ([p5-02](../screenshots/persona-stable-35-44/p5-02-filters-sheet-director-dc.png), [p5-03](../screenshots/persona-stable-35-44/p5-03-anthropic-director-dc-list.png)) | 0:40–1:30 |
| 3 | Desktop that evening, from the same link. Opens "Head of National Security Sales (DoW/IC)", $550–700K, "+ bonus mentioned. Posted base pay. Equity and bonus aren't included." Same role elsewhere: "No other company lists this level, so this compares all Security roles." ([p5-04](../screenshots/persona-stable-35-44/p5-04-desktop-director-dc.png), [p5-05](../screenshots/persona-stable-35-44/p5-05-head-natsec-sales-drawer.png)) | 1:30–2:30 |
| 4 | Juice for Family, monthly: $52K − $18K − $4K − $4K = $26K/mo. ([p5-06](../screenshots/persona-stable-35-44/p5-06-juice-dc-family-monthly.png)) | 2:30–3:15 |
| 5 | Copies the link for her husband ("Link copied"); the link reopens the same job with her filters. | 3:15–3:30 |
| 6 | Compares OpenAI, Anduril, Palantir, Scale AI and Shield AI. Every switch clears her filters, so she re-ticks Director+ and Washington each time: 23 clicks and typed filters, about 4 minutes. Palantir has no Director+ level at all, and "No department" for every role. ([p5-07](../screenshots/persona-stable-35-44/p5-07-palantir-director-dc.png), [p5-08](../screenshots/persona-stable-35-44/p5-08-scale-director-dc.png)) | 3:30–7:30 |
| 7 | Insights → Compare companies → Sales & partnerships: Anthropic is at the top with $334K; the card ignores her Director+ filter. ([p5-09](../screenshots/persona-stable-35-44/p5-09-compare-companies-sales.png)) | 7:30–8:30 |
| 8 | Phone again: OpenAI "Federal Account Director, National Security", $261–335K. Same role elsewhere, "Sales & partnerships at Director+": **Anthropic $625K**, OpenAI $262K, Anduril $222K. The meta line reads "OpenAI for Gov · OpenAI for Gov". Back closes the panel. ([p5-10](../screenshots/persona-stable-35-44/p5-10-openai-federal-director-same-role.png)) | 8:30–9:30 |
| 9 | Saves "OpenAI · "federal"". ([p5-11](../screenshots/persona-stable-35-44/p5-11-phone-saved.png)) | 9:30–10:00 |
| 10 | Tries "Add board" for Booz Allen. It asks for a "Source" (Greenhouse/Ashby/Lever) and a "Board slug"; she guesses "boozallen" and gets 60 demo roles with Juice scores, under an amber "Demo data" banner. The sandbox can't reach any board, so this may differ live. ([p5-12](../screenshots/persona-stable-35-44/p5-12-add-board-dialog.png), [p5-13](../screenshots/persona-stable-35-44/p5-13-add-board-result.png)) | 10:00–11:00 |

Total: about 11 minutes, 4 of them spent re-applying filters. Words she didn't know: slug, Ashby,
Greenhouse, Lever; and "DoW/IC" came from the posting itself.

## 3. Findings for the group

Each item gives the persona(s), the screen, a screenshot, and the owning file where we could tell.

### 3.1 Broken, fix now

1. **Sales pay that is OTE is shown as base pay.** Anthropic's postings say "For sales roles, the range
   provided is the role's On Target Earnings ("OTE") range… includes both the sales commissions/sales
   bonuses target and annual base salary". The site shows these 123 Sales roles as "Posted base pay.
   Equity and bonus aren't included". It then compares them with other companies' base pay (Same role
   elsewhere, Sales at Director+: Anthropic $625K vs OpenAI $262K; Compare companies: Anthropic tops
   Sales at $334K) and counts the commission target as salary in Juice. — P5 · drawer, Same role
   elsewhere, Insights · [p5-05](../screenshots/persona-stable-35-44/p5-05-head-natsec-sales-drawer.png),
   [p5-10](../screenshots/persona-stable-35-44/p5-10-openai-federal-director-same-role.png),
   [p5-09](../screenshots/persona-stable-35-44/p5-09-compare-companies-sales.png) · `server/salary.js`
   (no OTE flag), `public/app.js` (`payLabels`, pay-block note), `scripts/build-market.js`.
2. **Compstimate claims a city it never used.** The drawer says "Based on 6 similar roles at Palantir,
   Mid · London" (≈$133K), but Palantir has 0 London roles with pay. It says "Based on 14 similar roles
   at Anduril, Senior · Sydney" (≈$237K), but no Sydney role has pay. Both figures are US pay presented
   as local, with "Typically within ±7%/±12%". On the same filters, Insights says "Not enough comparable
   roles … for London". — P2, P4 · drawer Compstimate ·
   [p2-08](../screenshots/persona-stable-35-44/p2-08-london-designer-drawer-compstimate.png),
   [p2-09](../screenshots/persona-stable-35-44/p2-09-insights-london-designer.png),
   [p4-07](../screenshots/persona-stable-35-44/p4-07-sydney-ml-drawer-compstimate.png) ·
   `public/features/compstimate.js` (`estimateComp` location fallback, `basisLine`), `public/app.js`
   `compstimateBlock`.
3. **"Mid" is shown for every title without a level word.** All 2,653 "Mid" roles (48% of the board: 70% at
   OpenAI, 74% at xAI, 59% at Anthropic) are the default, not a level the posting gives. So $500–850K
   research engineers read "Mid", "Group by Seniority" shows Mid 168 / Senior 12, and "Same role
   elsewhere at Mid level" and Compstimate's level are built on it. Separately, "Conceptual Reasoning
   Fellow" ($100–167K) is "Staff+" because "fellow" counts as Staff+. — P4, P1, P2 · cards, Seniority
   filter, chart · [p4-03](../screenshots/persona-stable-35-44/p4-03-ml-grouped-by-seniority.png),
   [p1-09](../screenshots/persona-stable-35-44/p1-09-anthropic-fellows-search.png) · `server/keywords.js`
   (`seniorityOf`, `BY_DEFAULT`), `public/app.js` `card`.
4. **Wrong role family in "Same role elsewhere".** "Head of National Security Sales" and "Anthropic Fellows
   Program, AI Safety & Security" are matched as *Security* roles, so a sales head and a fellowship stipend
   are compared with security engineers. The security rule is checked before the sales rule. — P5, P1 ·
   drawer · [p5-05](../screenshots/persona-stable-35-44/p5-05-head-natsec-sales-drawer.png),
   [p1-10](../screenshots/persona-stable-35-44/p1-10-fellows-drawer.png) · `public/features/roles.js`
   (`roleFamily` rule order).
5. **"4 new" in the menu, but nothing marked New.** A saved search counts new roles against its own last
   opening, while the cards count against the last visit to that company. If you visit the company in
   between, the menu says "4 new" and the list shows no New tag, so there's no way to find them. — P3 ·
   company menu → saved search ·
   [p3-16](../screenshots/persona-stable-35-44/p3-16-return-menu-new-count.png),
   [p3-18](../screenshots/persona-stable-35-44/p3-18-between-visit-no-new-tags.png) · `public/app.js`
   (`savedNewCount` vs `isNewJob`/`markVisit`).
6. **US-dollar pay is pinned on non-US cities.** Anduril shows "Sydney · $61K · 55" and "Sydney … 9% list
   pay · $61K median". Those numbers come from 5 US contractor roles that also list Sydney among
   5–6 cities; no Sydney-based role lists pay. Anthropic Fellows shows "London $200K" and "Ontario $200K",
   although the posting pays £2,310 or C$4,300 a week. Juice already refuses to apply USD pay to London;
   the pins and the stats line don't. — P4, P1 · map, stats line ·
   [p4-08](../screenshots/persona-stable-35-44/p4-08-map-sydney.png),
   [p1-16](../screenshots/persona-stable-35-44/p1-16-map-interns.png) · `public/viz/map.js`, `public/app.js`
   `stats`.
7. **Victoria, BC is placed in Australia.** Cohere's Canadian annotation roles list "… Toronto | Victoria",
   and the site files "Victoria" under AUSTRALIA ("Victoria, Australia 2") with Australian coordinates. —
   P1 (and P4 when filtering Australia) · Location filter, Compstimate location list ·
   [p1-21](../screenshots/persona-stable-35-44/p1-21-victoria-bc-as-australia.png) · `server/geo.js`
   (Victoria, BC isn't in the city table, so the Australian region row `VIC|Victoria|AU` matches).

### 3.2 Improve, ranked by how many of the 5 it would help

| Rank | Change | Helps | Screen · screenshot · file |
|---|---|---|---|
| 1 | **Keep the search and filters when switching company, or search all 8 at once.** Today every switch clears them: P1 lost Intern, P2 retyped "designer" 3 times, P3's $130K vanished on the jump to Anduril, and P5 spent 23 clicks and ~4 min comparing 5 companies. | 5/5 | company menu · [p2-04](../screenshots/persona-stable-35-44/p2-04-palantir-search-cleared.png), [p5-07](../screenshots/persona-stable-35-44/p5-07-palantir-director-dc.png) · `public/app.js` `switchCompany`/`resetFiltersPatch` |
| 2 | **Make the household (and "where I'd live / my rent") a setting, not a button inside a collapsed drawer section.** Cards score "Just me" until you find it. There's no single parent with a child (P3) and no "my city" for remote or multi-city roles: P1 got San Francisco, not Toronto. The engine already accepts a rent override (`rentOverrideUSD`). The existing More → Juice section fits the budget. | 5/5 | drawer Juice, More · [p1-11](../screenshots/persona-stable-35-44/p1-11-juice-single.png), [p3-11](../screenshots/persona-stable-35-44/p3-11-juice-dallas-couple-monthly.png) · `public/app.js` `HOUSEHOLDS`/`juiceBlock`/`makeJuiceChips`, `server/juice.js` |
| 3 | **Plain words.** Explain or rename: Compstimate; Juicy/Ripe/Dry/Rind and the bare 0–100 score on cards (the dollar legend exists only on the map); "≈"; Clusters/Ranges; middle 50%; percentile; "regional"/"social" tax; Staff+/Director+; GREENHOUSE/ASHBY/LEVER headings and slugs (`andurilindustries`) in the company menu; "Apply on Ashby"; "Board slug"; "International EOR"; "Unspecified"; "(update due)" on every data line. | 5/5 | everywhere · [p1-02](../screenshots/persona-stable-35-44/p1-02-company-menu.png), [p2-15](../screenshots/persona-stable-35-44/p2-15-juice-london-couple-block.png), [p5-12](../screenshots/persona-stable-35-44/p5-12-add-board-dialog.png) · `public/app.js` (`makeCompanyMenu`, `juiceBlock`, `card`, `makeBoardForm`), `public/features/compstimate.js` |
| 4 | **The first 10 seconds.** Say in one line what this is ("every open role at 8 AI and defence companies, by pay"). On phones the logo is hidden, no job card shows above the fold (the list is a closed sheet), the theme icon looks like "desktop site", and "Oct 10" means nothing until tapped. | 5/5 | landing · [p1-01](../screenshots/persona-stable-35-44/p1-01-cold-phone.png), [p2-01](../screenshots/persona-stable-35-44/p2-01-cold-desktop.png) · `public/index.html`, `public/styles.css` |
| 5 | **Group and filter by role family, not raw department.** Palantir is "No department" for all 309 roles. Anduril uses "Sales and Marketing : Business Development : Maritime Capture" and Shield AI "X-BAT Division", "RaptorX". The site already computes role families (the "Role:" chip, Compare companies). | 4/5 (P2–P5) | chart, Department filter, stats line · [p2-05](../screenshots/persona-stable-35-44/p2-05-palantir-designer.png), [p3-06](../screenshots/persona-stable-35-44/p3-06-shield-dallas-130k-chart.png), [p4-06](../screenshots/persona-stable-35-44/p4-06-anduril-sydney.png) · `public/app.js` `deptKey`/`groupBy`, `public/features/roles.js` |
| 6 | **Show local currency.** Show C$/£/A$ next to approx USD in Juice, and accept a salary minimum in local currency. Tom's London breakdown was all in dollars, and Grace's fellowship pays differently by country. | 4/5 (P1, P2, P4, P5 for comparing) | Juice, Salary filter · [p2-13](../screenshots/persona-stable-35-44/p2-13-salary-popover.png), [p2-15](../screenshots/persona-stable-35-44/p2-15-juice-london-couple-block.png) · `public/app.js` `juiceBlock`/`makeSalary` |
| 7 | **Monthly Juice is rounded to $1K, so the rows don't add up** ($5K − $1K − $2K − $2K = "−$603"). That's too coarse for a monthly-budget goal. The header stays "/yr" after you pick Monthly, and the "Juice left" bar is dark red, which reads as a loss. | 4/5 (P1, P2, P3, P5) | drawer Juice · [p1-22](../screenshots/persona-stable-35-44/p1-22-annotation-juice-family-toronto.png), [p3-11](../screenshots/persona-stable-35-44/p3-11-juice-dallas-couple-monthly.png) · `public/app.js` `juiceBlock` (`money`) |
| 8 | **Make saved searches easy to find on return.** The site reopens on Anthropic, and saved searches live only inside the company menu, which the toast mentions once. Inside the budget: land on the latest saved search when there's no link, or open the menu's Saved section. | 4/5 (P1–P4) | return visit · [p4-15](../screenshots/persona-stable-35-44/p4-15-return-saved.png), [p1-17](../screenshots/persona-stable-35-44/p1-17-return-saved-searches.png) · `public/app.js` `boot`/`makeCompanyMenu` |
| 9 | **Fix the Remote filter.** "Remote" mixes "Remote (US)" with remote anywhere, so a Canadian or Australian can't tell which they can take. "On-site" has the same count as "Any" (it means "has any office location"). | 3/5 (P1, P3, P4) | Remote filter · [p1-04](../screenshots/persona-stable-35-44/p1-04-seniority-pop.png) · `public/app.js` `makeRemote`/`failures` |
| 10 | **Compare companies (Insights) should follow the search, level and location.** It opens on "Software engineering" whatever you searched, needs a 26-item dropdown, and ignores Staff+, Director+ and London. | 3/5 (P2, P4, P5) | Insights · [p2-10](../screenshots/persona-stable-35-44/p2-10-compare-companies-design.png), [p4-09](../screenshots/persona-stable-35-44/p4-09-compare-companies-ml.png) · `public/features/comps.js`, `public/app.js` `renderInsights` |
| 11 | **Fix the phone quickbar.** Active chips are clipped ("ition", "Inte") or scrolled out of view, and Save is an unlabelled bookmark icon. | 3/5 (P1, P3, P5) | phone quickbar · [p1-14](../screenshots/persona-stable-35-44/p1-14-quickbar-with-save.png), [p3-06](../screenshots/persona-stable-35-44/p3-06-shield-dallas-130k-chart.png) · `public/styles.css` (`.quickbar`), `public/app.js` `renderQuickbar` |
| 12 | **Offer "lowest pay at least $X".** Today a $130K minimum still shows $110–160K roles and $119K medians, because ranges only need to overlap. | 2/5 (P3, P5) | Salary filter · [p3-06](../screenshots/persona-stable-35-44/p3-06-shield-dallas-130k-chart.png) · `public/app.js` `failures`/`makeSalary` |
| 13 | **Show the place you filtered.** Cards show the posting's first location ("San Diego, CA +2" under a Dallas filter). With a location filter, the map still pins other cities, and labels overlap on phones. | 2/5 (P3, P4) | cards, map · [p3-09](../screenshots/persona-stable-35-44/p3-09-program-manager-list.png), [p3-19](../screenshots/persona-stable-35-44/p3-19-map-dallas.png) · `public/app.js` `locSummary`, `public/viz/map.js` |
| 14 | **Card keyword tags come from company boilerplate.** "Mechanical design" on a talent-acquisition program manager; one posting gets 22 "responsibilities", including Legal, Finance and Marketing. | 2/5 (P3, P5) | cards, drawer Keywords · [p3-22](../screenshots/persona-stable-35-44/p3-22-talent-pm-mechanical-design-tag.png) · `server/keywords.js` |
| 15 | **Say "always open" in words.** "13y+", "9y+" and "Listed 5,000 days ago (31 Jan 2013)" read as ghost jobs, and "5mo" on Winter 2027 internships reads as stale. Sort such roles last. | 2/5 (P1, P2) | cards, drawer Listing · [p2-05](../screenshots/persona-stable-35-44/p2-05-palantir-designer.png), [p2-08](../screenshots/persona-stable-35-44/p2-08-london-designer-drawer-compstimate.png) · `public/app.js` `ageText`, `public/features/freshness.js` |
| 16 | **"Highest pay" isn't highest pay when you search:** title matches come first. And "machine learning" returns 270 roles, only 6 of them with it in the title. | 2/5 (P3, P4) | results · [p3-09](../screenshots/persona-stable-35-44/p3-09-program-manager-list.png), [p4-03](../screenshots/persona-stable-35-44/p4-03-ml-grouped-by-seniority.png) · `public/app.js` `sortJobs`/`titleMatch` |
| 17 | **Remove repeated lines.** "Internships · Internships", "OpenAI for Gov · OpenAI for Gov", "Posted as "<the same title>"", "Canada · Canada", "≈ $59K–59K", and the duplicated "Not enough comparable roles" sentence. | 2/5 (P1, P5) | drawer, Insights · [p1-07](../screenshots/persona-stable-35-44/p1-07-intern-drawer.png), [p5-10](../screenshots/persona-stable-35-44/p5-10-openai-federal-director-same-role.png) · `public/app.js` `drawerContent`, `public/features/compstimate.js` |
| 18 | **Anduril's first load on a mid-range phone takes 5.0 s** (4× CPU, ~16 Mbit/s); everything else is under 2 s. | 2/5 (P3, P4) | landing on Anduril · `public/api.js` (unpack), `public/app.js` `prepare` |
| 19 | **Frame the percentile against the same level.** A big green "2% percentile" and "Pays more than 2% of roles" on an internship stipend is discouraging and says nothing useful. | 1/5 (P1) | drawer pay block · [p1-10](../screenshots/persona-stable-35-44/p1-10-fellows-drawer.png) · `public/app.js` `percentile`/`drawerContent` |
| 20 | **Add board should ask for a company, not a "Source" and "Board slug".** A board that can't be reached fills the page with 60 made-up roles with Juice scores (labelled Demo); an empty state would be safer. (Sandbox: no board is reachable here.) | 1/5 (P5) | Add board · [p5-12](../screenshots/persona-stable-35-44/p5-12-add-board-dialog.png), [p5-13](../screenshots/persona-stable-35-44/p5-13-add-board-result.png) · `public/app.js` `makeBoardForm` |
| 21 | **There's no part-time or flexible option.** No company lists Part-time; Anthropic, Scale AI and xAI are "Unspecified" only. If boards never say so, say that rather than offering an empty-looking filter. | 1/5 (P1) | More → Employment type · `public/app.js` `renderFilterPanel` |

### 3.3 Good: keep

| What | Who | Screen · screenshot · file |
|---|---|---|
| **Speed.** First cards in 0.5–1.1 s, company switch 0.1–0.3 s, a job opens in 0.3–0.7 s, the household re-score takes 0.6 s. Nobody waited, except on Anduril on a slow phone. | all 5 | everywhere · `public/api.js`, `public/app.js` |
| **Honest pay labels.** "No salary" pills, "Salary not listed", "Annualized from weekly/hourly pay (3,850 USD / 2,310 GBP / 4,300 CAD)", "Single figure", "+ equity mentioned", "≈ $283K–337K in approx USD for comparison". | P1, P2, P5 | cards, pay block · [p1-10](../screenshots/persona-stable-35-44/p1-10-fellows-drawer.png), [p2-14](../screenshots/persona-stable-35-44/p2-14-juice-london-couple.png) · `public/app.js` `payLabels` |
| **The Juice waterfall.** Gross → tax → rent → living → left, with Just me / Couple / Family, Monthly / Yearly, "Rent takes 18% of take-home pay" and "Compare locations (4)". It's the one screen that answers "what would I have left". | all 5 | drawer · [p3-11](../screenshots/persona-stable-35-44/p3-11-juice-dallas-couple-monthly.png), [p1-22](../screenshots/persona-stable-35-44/p1-22-annotation-juice-family-toronto.png) · `public/app.js` `juiceBlock`, `server/juice.js` |
| **The methodology page.** Plain language, a worked SF example and the melon-and-rind metaphor. | P2 | methodology · [p2-19](../screenshots/persona-stable-35-44/p2-19-methodology.png) · `docs/METHODOLOGY_GUIDE.md`, `scripts/methodology.js` |
| **The phone filter sheet.** A live "Show N roles" button, search inside Location, and a numeric keypad for salary. | P1, P3, P5 | filter sheet · [p3-03](../screenshots/persona-stable-35-44/p3-03-location-sheet.png), [p5-02](../screenshots/persona-stable-35-44/p5-02-filters-sheet-director-dc.png) · `public/app.js` `renderFilterPanel` |
| **Saved searches.** One Save control, a toast that says where to find it, a readable name ("Shield AI · "program manager" · $130K+ · Dallas"), and "4 new" plus New tags when consistent. | P1–P5 | quickbar, company menu · [p3-16](../screenshots/persona-stable-35-44/p3-16-return-menu-new-count.png), [p3-17](../screenshots/persona-stable-35-44/p3-17-saved-search-new-tags.png) · `public/app.js` `toggleSave`/`makeCompanyMenu` |
| **"Same role elsewhere" and the jump to another company,** with a toast that says which filters it dropped. | P3, P4 | drawer · [p3-12](../screenshots/persona-stable-35-44/p3-12-same-role-elsewhere.png), [p3-13](../screenshots/persona-stable-35-44/p3-13-after-pick-anduril.png) · `public/app.js` `sameRoleSection`/`pickCompany`/`settleCarry` |
| **Apply and share.** A big Apply button that names the site it goes to (jobs.lever.co) and opens a new tab; "Copy link to this role" → "Link copied", and the link reopens the same job and filters. | P3, P5 | drawer footer · [p3-10](../screenshots/persona-stable-35-44/p3-10-drawer-top.png), [p5-05](../screenshots/persona-stable-35-44/p5-05-head-natsec-sales-drawer.png) · `public/app.js` `postingLink`/`copyLink` |
| **Back closes the job panel** instead of leaving the site. | P5 | drawer · `public/app.js` (`overlayHistPush`) |
| **Chart bubbles.** The tooltip names the titles in a pay band, and a click filters the list with a removable chip. | P4 | chart · [p4-13](../screenshots/persona-stable-35-44/p4-13-chart-bubble-hover.png), [p4-14](../screenshots/persona-stable-35-44/p4-14-chart-bubble-clicked.png) · `public/viz/chart.js` |
| **The map Juice legend** puts grades in dollars ("Ripe 45–69 · $48K–$96K/yr"). | P3 | map · [p3-20](../screenshots/persona-stable-35-44/p3-20-map-juice.png) · `public/viz/map.js` |
| **Listing age, explained.** "Open 180+ days. Some companies keep a posting open…", plus the "Hide roles open 180+ days" filter. | P2 | drawer Listing, More · [p2-08](../screenshots/persona-stable-35-44/p2-08-london-designer-drawer-compstimate.png) · `public/features/freshness.js` |
| **Compstimate when it has real comparables** (OpenAI Staff+ software: $369K, "High confidence", 9 roles, low/high range). | P4 | Insights · [p4-10](../screenshots/persona-stable-35-44/p4-10-insights-openai-staff.png) · `public/features/compstimate.js` |
| **The data badge popover** answers "where is this from" and offers the CSV. | P5 | badge · [p5-01](../screenshots/persona-stable-35-44/p5-01-badge-tapped-phone.png) · `public/app.js` `makeBadgeDetails` |

## 4. Replayable steps

1. `node scripts/cycle/serve.mjs --dist <scratch>/cycle-stable/dist --pid <scratch>/persona-stable-35-44/serve.pid`
   (run in the background). It printed `serve: http://127.0.0.1:35919/melon-seek/`.
2. Playwright from `<scratch>/pw/node_modules`, loaded with `createRequire` (ESM ignores `NODE_PATH`),
   with Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
   - Desktop: 1440×900, or 1280×800 for P4.
   - Phone: 390×844, `isMobile`, `hasTouch`, DPR 2.
   - Locale and timezone per person (en-CA Toronto, en-GB London, en-US Chicago, en-AU Sydney,
     en-US New York).
3. One script per step group, in `<scratch>/persona-stable-35-44/`:
   - P1: `p1a`–`p1g`, `vic`. P2: `p2a`–`p2f`. P3: `p3a`–`p3g`, `p3save`, `kw`. P4: `p4a`–`p4e`,
     `bubble2`. P5: `p5a`–`p5d`, `addboard`.
   - Shared helpers in `lib.mjs`.
   - Each script clicks or taps through the UI and writes PNGs to `docs/screenshots/persona-stable-35-44/`.
     Between sessions, `storageState` keeps localStorage, which simulates "coming back later".
4. The 3-weeks-later return (P3, `p3f.mjs`):
   - Edit the saved state so `melon.saved[].lastSeenAt` and `melon.seen.shieldai` read 2026-09-19, and
     drop 4 ids from both `seen` lists.
   - Then re-open, either directly ("consistent") or after an extra visit to `#c=shieldai` ("between").
5. Timings: `timing.mjs` (desktop, and phone at 4× CPU) and `perf.mjs` (throttled network, Anduril cold).
6. Data checks against the build's open data (`dist/data/*.csv`) and `dist/api/desc/*`:
   - `q.py` (title/location search);
   - `basis.mjs` (how many "Mid" levels are the default; imports `server/keywords.js#seniorityBasis`);
   - grep for "OTE" in the descriptions.
7. Stop: `kill "$(cat <scratch>/persona-stable-35-44/serve.pid)"`.

## 5. Known gaps

- The "comes back later" visits are simulated by editing localStorage, not by waiting for a new snapshot.
- No live board or tile server is reachable, so we never ran Apply through to the ATS form. The Add board
  result (demo roles) may differ on the real site for a slug that exists.
- We didn't test dark mode, keyboard-only use or screen readers; the other cycle reviewers cover those.
- Times are estimates for a person, built from the steps; the machine times are measured.

## 6. Change log

- 2026-10-10: first review of build `local-20261010T105630` (stable), 5 personas, 86 screenshots.
