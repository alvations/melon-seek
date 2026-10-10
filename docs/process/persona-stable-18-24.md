# Process log: persona review, stable site, ages 18–24

## 1. Brief

- Prompt (verbatim): [prompts/persona-stable-18-24.md](prompts/persona-stable-18-24.md).
- Goal: play five job seekers aged 18–24, one per career level, on the stable site (`/melon-seek/`, today's real snapshot of the 8 boards). Each one does a real task in the browser. Then list what to keep, what to improve and what is broken.
- Files owned: this log, the prompt copy, and `docs/screenshots/persona-stable-18-24/` (86 screenshots). No product code was edited, nothing was committed and nothing was pushed.
- Sandbox caveats from the lead, not reported as bugs: the badge falls back to the bundled snapshot ("Snapshot · Oct 10"), and map tiles are grey ("Basemap unavailable · pins still work").

## 2. Inputs and sources

- `README.md` (what the product says it does) and `docs/strategy/ROADMAP.md` §8 (the UI simplicity budget, used to keep the suggestions small).
- The lead's build, `scratchpad/cycle-stable/dist`, served by `scripts/cycle/serve.mjs` on a free port.
- I read the code only to name the owning file for a finding, or to check a number: `public/app.js`, `public/features/compstimate.js`, `public/features/roles.js`, `public/features/freshness.js`, `scripts/methodology-figures.js`, `server/geo.js`, `dist/api/cities.json`, `dist/api/freshness.json`.
- I dumped the unpacked jobs in the browser (`api.getJobs` for each company) so I could check the numbers the personas saw: 5,482 jobs; seniority split Mid 2,653, Senior 1,362, Staff+ 566, Manager 409, Director+ 269, Entry 130, Intern 93.

## 3. The five people

Times are what a real person would take: reading time plus my estimate of how long they would spend thinking. App response times measured in the run are in brackets. Every page change finished in under 2 s on a fast machine, and in under 4 s with the phone CPU slowed 4× (§5).

### P1. Priya Nair, 21, student, Toronto (Canada), phone

- **Who:** third-year Computer Engineering student at Waterloo. Single, shares a flat with two students. Field: engineering.
- **Goal:** "Find a paid software or ML internship or co-op for 2027, in Toronto, remote or in the US, paying at least US$40 an hour, and see how much I'd keep each month after rent."
- **Reached?** **Partly.** Anduril's *2027 Software Engineer Intern* pays $40–55 an hour in 9 US cities and leaves about $3K a month in Colorado Springs. Nothing in Toronto has published pay. Cohere's three Canada-eligible internships list no pay, and the site estimates **≈ $215K a year** for one of them. Her first search for "intern" returned 12 wrong roles.

| # | Step | What she saw | Time |
|---|---|---|---|
| 1 | Arrives cold | Anthropic is preselected, an "Oct 10" pill and a dot chart. On the phone the name melon·seek is not shown, and nothing says what the site is or what "Juice" means. ([p1-01](../screenshots/persona-stable-18-24/p1-01-cold.png)) | 15 s (ready in 0.6–0.8 s) |
| 2 | Types "intern" | "12 roles · 9 in title". The top results are *Warehouse and Logistics Manager – International*, *Internal Communications Manager*, *Director, US International Tax*… none is an internship. ([p1-02](../screenshots/persona-stable-18-24/p1-02-anthropic-intern.png)) | 20 s, confused |
| 3 | Switches to Cohere (Toronto) | The search box is now empty, so she retypes it. 3 internships plus *Senior Full-Stack Engineer, Internal Applications*. All three internships say "No salary". ([p1-03](../screenshots/persona-stable-18-24/p1-03-cohere-intern.png)) | 40 s (1.0 s) |
| 4 | Opens *Software Engineer Intern (Winter 2027)* | "Salary not listed", then "COMPSTIMATE ≈ $215K ($159K–283K, low confidence). Based on 4 similar roles at Cohere, Intern · Canada… Typically within ±8%". She doesn't believe it. ([p1-04](../screenshots/persona-stable-18-24/p1-04-cohere-intern-drawer.png)) | 30 s |
| 5 | Checks Anthropic's Intern level | 3 Fellows programmes at "$200K", "Annualized from weekly pay (3,850 USD / 2,310 GBP / 4,300 CAD)", Juice for San Francisco. "Same role elsewhere" compares them with all ML roles ($221K–441K). ([p1-16](../screenshots/persona-stable-18-24/p1-16-anthropic-fellows-list.png), [p1-17](../screenshots/persona-stable-18-24/p1-17-fellows-drawer.png)) | 45 s |
| 6 | Anduril, Seniority = Intern, search "software" | On the phone the chip opens the whole Filters sheet ([p1-05a](../screenshots/persona-stable-18-24/p1-05a-seniority-sheet.png)). 27 interns, then 5 software ones. The cards say "$83K–114K", with no sign it is hourly. ([p1-06](../screenshots/persona-stable-18-24/p1-06-anduril-intern-list.png)) | 45 s (1.3 s switch) |
| 7 | Opens *2027 Software Engineer Intern* | "Annualized from hourly pay ($40 — $55 USD)" explains the card. "7% percentile" is odd wording. Same role elsewhere: Palantir $126K, Anduril $102K. ([p1-07](../screenshots/persona-stable-18-24/p1-07-intern-drawer-pay.png)) | 40 s (1.8 s) |
| 8 | Juice, then Monthly | "38 · Dry, $39K/yr left in Colorado Springs". Monthly: gross $8K, tax −$2K ("income $1K · regional $303 · social $630"), rent −$2K, living −$1K, **$3K left**. Compare locations: Boston $1K/mo. A 12-week internship is scored as a whole year and graded "Dry". ([p1-08](../screenshots/persona-stable-18-24/p1-08-intern-juice-month.png), [p1-09](../screenshots/persona-stable-18-24/p1-09-intern-juice-compare.png)) | 60 s |
| 9 | Apply | Opens boards.greenhouse.io in a new tab. | 5 s |
| 10 | Map, then Insights | Map: "Costa Mesa, CA + 8 nearby $106K" (the 8 "nearby" cities include Atlanta, Boston and Seattle), plus "1 job" pins in London and Sydney. Insights: Compstimate $87K at Intern level. ([p1-10](../screenshots/persona-stable-18-24/p1-10-map.png), [p1-11](../screenshots/persona-stable-18-24/p1-11-insights.png)) | 40 s |
| 11 | Saves | The save control is an unlabelled bookmark icon between clipped chips ("ıtion", "Inte"). The toast says "Saved — find it in the company menu". ([p1-12](../screenshots/persona-stable-18-24/p1-12-saved.png)) | 10 s |
| 12 | Comes back later | Lands on Anthropic, not Anduril. The company menu shows "SAVED SEARCHES · Anduril · "software" · Intern", which restores the 5 roles. ([p1-13](../screenshots/persona-stable-18-24/p1-13-return.png), [p1-14](../screenshots/persona-stable-18-24/p1-14-return-menu.png), [p1-15](../screenshots/persona-stable-18-24/p1-15-return-saved.png)) | 20 s |

About 6 minutes. Also seen: Cohere's Canada-only annotation roles list "Victoria, Australia" ([p1-18](../screenshots/persona-stable-18-24/p1-18-cohere-victoria-australia.png)).

### P2. Callum Brooks, 23, early career (3.5 years), London (UK), desktop

- **Who:** left school after A-levels. SDR, then BDR, now junior Account Executive at a London SaaS start-up. Single, rents a room in a flatshare. Field: sales.
- **Goal:** "Find an Account Executive role in London at an AI company with a published base of at least £80K, and see what's left each month after London tax and rent."
- **Reached?** **Yes, with friction.** Anthropic has 7 London sales roles, all with published pay (£135K–330K). An Enterprise AE leaves $15K a month, but the site shows it in dollars. On the way, the salary box silently ignored "£80,000" and "80k". Every role is "Mid", so he can't tell whether 3.5 years qualifies. The other companies' London sales roles have no pay. Switching company wiped his filters twice.

| # | Step | What he saw | Time |
|---|---|---|---|
| 1 | Arrives cold | Stats line "645 roles · 87% list pay · $352K median · middle 50% $287–411K · mostly Sales", plus "Clusters / Ranges", "🍉 98 · Juicy" and "16mo". He has to hover to learn what "list pay" means, and "mostly Sales" is only 19%. ([p2-01](../screenshots/persona-stable-18-24/p2-01-cold.png)) | 20 s (0.6 s) |
| 2 | Location → London, Department → Sales | 47, then 7 roles. The cards show £ but the chart and stats line show $ ("$411K median" next to "£280K–330K"). ([p2-02](../screenshots/persona-stable-18-24/p2-02-london-sales.png)) | 30 s |
| 3 | Salary min "£80,000", then "80k" | Both times the box snaps back to "Any" with no message. "107000" works. The box is in USD, and any value below the board's lowest pay ($100K) is dropped. ([p2-03b](../screenshots/persona-stable-18-24/p2-03b-salary-80k.png)) | 45 s, confused |
| 4 | Sort Most juice, open *Enterprise Account Executive – Retail* | £280K–330K, "≈ $377K–445K in approx USD", "+ bonus mentioned", "Posted base pay". The description doesn't say whether this is base or OTE (on-target earnings), which is the first thing a salesperson asks. ([p2-04](../screenshots/persona-stable-18-24/p2-04-ae-drawer.png)) | 60 s (1.5 s) |
| 5 | Same role elsewhere | Sales & partnerships at Mid level: Anthropic $335K, OpenAI $257K, Scale AI $220K, Cohere $207K, Palantir $167K, xAI $105K. These are worldwide, not London. ([p2-05](../screenshots/persona-stable-18-24/p2-05-ae-same-role.png)) | 20 s |
| 6 | Juice, Monthly | Gross $34K, tax −$15K ("income $14K · regional $0 · social $911"), rent −$3K, living −$1K, **$15K/mo left**. I checked this against UK 2026/27 bands on a £305K midpoint and it is correct. But it is in dollars, and a 1-bedroom city-centre flat isn't his room in a flatshare. ([p2-06](../screenshots/persona-stable-18-24/p2-06-ae-juice-month.png)) | 40 s |
| 7 | Switches to OpenAI | London and Sales are gone. He re-adds London: 34 roles, "41% list pay". *Account Director, Large Enterprise* shows "Compstimate ≈ $215K (low confidence)… Typically within ±10%". ([p2-07](../screenshots/persona-stable-18-24/p2-07-openai-london.png), [p2-08](../screenshots/persona-stable-18-24/p2-08-openai-ad-drawer.png)) | 60 s (1.2 s) |
| 8 | Insights, Map | Compstimate defaults to "Software Engineer". The London pin. ([p2-09](../screenshots/persona-stable-18-24/p2-09-insights.png), [p2-11](../screenshots/persona-stable-18-24/p2-11-map.png)) | 40 s |
| 9 | Back to Anthropic, saves | Filters are gone again, but the sort stayed on "Most juice". He rebuilds Sales + London and saves it. He saves OpenAI · London as well. ([p2-12](../screenshots/persona-stable-18-24/p2-12-saved.png)) | 45 s |
| 10 | Comes back later | Lands on Anthropic with no filters. The company menu lists both saved searches, and one click restores the 7 roles. ([p2-13](../screenshots/persona-stable-18-24/p2-13-return-menu.png), [p2-14](../screenshots/persona-stable-18-24/p2-14-return-saved.png)) | 15 s |

About 6.5 minutes.

### P3. Jordan Reyes, 24, mid-career (6 years, Army), San Diego (US), phone

- **Who:** enlisted at 18. Six years in the US Army as a UAS (drone) operator, then a logistics NCO. No degree, holds a Secret clearance. Lives with his partner and their 2-year-old daughter. Field: operations.
- **Goal:** "Find a flight-test or field-operations role at a defence-tech company near San Diego, with no degree needed, paying at least $95K, that leaves at least $1,500 a month after rent for my family."
- **Reached?** **No, not in San Diego.** He found a near-perfect job title: Shield AI's *Staff UAS Flight Test Operator* ($35.60–54.30 an hour, so $74K–113K a year). For "Family" it leaves **−$2K a month**: a 3-bedroom city-centre rent of $5K is 81% of take-home pay. Anduril's *UAV Operator, Bolt* in Costa Mesa ($113K–155K) leaves about $1.75K a month, but means moving about 90 miles. The "Family" preset is two children in a 3-bedroom city-centre home. He has one child and would rent a 2-bedroom outside the centre, so the real answer stays unknown.

| # | Step | What he saw | Time |
|---|---|---|---|
| 1 | Arrives cold | Same as P1. ([p3-01](../screenshots/persona-stable-18-24/p3-01-cold.png)) | 15 s |
| 2 | Company menu, types "shield" | Shield AI appears at once. The menu headings are "GREENHOUSE / ASHBY / LEVER" next to slugs such as "andurilindustries". ([p3-02](../screenshots/persona-stable-18-24/p3-02-company-search.png)) | 15 s (0.6 s) |
| 3 | Location → "San Diego" | Typing in the Location search works well: 162 roles. ([p3-03](../screenshots/persona-stable-18-24/p3-03-location-sheet.png)) | 25 s |
| 4 | More: anything for "no degree"? | Fit offers "Bachelor's 102", "Degree or equivalent 78", "Security clearance 79" and "Defense / aerospace 104". He can only include roles with a keyword, not exclude degree-only ones. The Juice counts there are for San Diego, but the note under them ("445 of 615 roles") is for the whole board. ([p3-03b](../screenshots/persona-stable-18-24/p3-03b-more-popover.png)) | 45 s |
| 5 | Search "operator", then "flight test" | 1 role, then "32 roles · 4 in title". ([p3-04](../screenshots/persona-stable-18-24/p3-04-flight-test-list.png)) | 30 s |
| 6 | Salary "95k" | The chip reads "$95K+", but $74K–110K jobs still show, because a range only has to overlap. ([p3-05](../screenshots/persona-stable-18-24/p3-05-operator-95k.png)) | 30 s, confused |
| 7 | Opens *Staff UAS Flight Test Operator* | "Annualized from hourly pay (35.6–54.3 USD per-hour-wage)" (raw board text), "5% percentile", "+ equity / + bonus mentioned". Same role elsewhere: "No other company lists this level, so this compares all Field operations & test roles: **Anthropic $310K**, Anduril $168K, Shield AI $125K". ([p3-06](../screenshots/persona-stable-18-24/p3-06-operator-drawer.png)) | 60 s (1.8 s) |
| 8 | Juice: Family, Monthly | "≈0 · Rind, −$25K/yr left". Gross $8K, tax −$1K, rent −$5K ("3-bedroom, city centre"), living −$3K ("two adults and two children"), **−$2K/mo**. Footnote: "rent Oct 2025 (update due)". ([p3-07](../screenshots/persona-stable-18-24/p3-07-operator-juice-family.png)) | 60 s |
| 9 | Apply | jobs.lever.co in a new tab. | 5 s |
| 10 | Map, Pay and then Juice | The legend turns grades into dollars ("Juicy 70+ ≥ $96K/yr"). Pin labels overlap: "San Diego, CA + 2 nearby" is printed through "Dallas, TX + 1 nearby", and "Washington" is cut off. ([p3-08](../screenshots/persona-stable-18-24/p3-08-map.png), [p3-09](../screenshots/persona-stable-18-24/p3-09-map-juice.png)) | 30 s |
| 11 | Anduril, "operator" | Location and search are cleared again. 7 roles: *UAV Operator, Bolt* $113K–155K, "≈23 · Dry, $21K/yr left in Costa Mesa", "Open 180+ days". The department names are raw ("Programs : Deployments : Technical Operations"). ([p3-10](../screenshots/persona-stable-18-24/p3-10-anduril-operator.png), [p3-11](../screenshots/persona-stable-18-24/p3-11-anduril-operator-drawer.png)) | 60 s (1.3 s) |
| 12 | Back to Shield AI, saves, returns | He rebuilds San Diego + "test" and saves. On return he lands on Anthropic, and every card now shows "≈" scores for a family with nothing saying so. The saved search restores 92 roles. ([p3-12](../screenshots/persona-stable-18-24/p3-12-saved.png), [p3-13](../screenshots/persona-stable-18-24/p3-13-return-saved.png)) | 45 s |

About 7 minutes.

### P4. Mei Lin Tan, 24, senior (8 years), Singapore, desktop

- **Who:** paid freelance UI work since 16, a design diploma at 19, now Senior Product Designer at a Singapore fintech. Married; her husband is a nurse, so they have two incomes. Field: design.
- **Goal:** "Find a Senior or Staff product designer role paying at least US$200K, in Singapore, remote, or in a city we would move to (New York, London, SF). Compare what each company calls Senior or Staff, and see what's left for us as a couple."
- **Reached?** **Partly.** There are no design roles in Singapore, and Anthropic's 12 Singapore roles have 0% published pay. She found Scale AI's *Staff Product Designer* in New York ($234K–292K, $8K a month left as a couple) and Shield AI's *Principal Product Designer* (remote, US only, $230K–340K). She could not compare levels. Every Anthropic and OpenAI "Product Designer" ($305K–460K) is labelled "Mid", so Senior and Staff filters hide them, and "Same role elsewhere" for Staff design shows one company.

| # | Step | What she saw | Time |
|---|---|---|---|
| 1 | Arrives cold | Desktop chart. ([p4-01](../screenshots/persona-stable-18-24/p4-01-cold.png)) | 15 s (0.7 s) |
| 2 | Location → Singapore | 12 roles, all "No salary", "0% list pay". ([p4-02](../screenshots/persona-stable-18-24/p4-02-anthropic-singapore.png)) | 30 s |
| 3 | Clear all, search "product designer" | 4 roles at $305K–460K, all "Mid". The Seniority list offers only "Mid 4". ([p4-03](../screenshots/persona-stable-18-24/p4-03-anthropic-designer-seniority.png)) | 40 s, puzzled |
| 4 | OpenAI, "design", group by Seniority | "276 roles · 39 in title": chip-design engineers and a *Powered Land Developer* are mixed in with product design. Only *Product Design Lead* is Senior. ([p4-04](../screenshots/persona-stable-18-24/p4-04-openai-design-by-level.png)) | 60 s (1.9 s) |
| 5 | Scale AI, "designer", opens *Staff Product Designer, Enterprise* | $234K–292K, "78% percentile". Same role elsewhere, Design at Staff+: **only Shield AI ($143K)**, and Scale itself isn't shown. ([p4-05](../screenshots/persona-stable-18-24/p4-05-scale-staff-designer.png)) | 60 s |
| 6 | Juice: Couple, Monthly | Gross $22K, tax −$7K, rent −$5K ("2-bedroom, city centre"), living −$3K, **$8K left**. It assumes one income supports two adults, and doesn't say so. ([p4-06](../screenshots/persona-stable-18-24/p4-06-scale-juice-couple.png)) | 45 s |
| 7 | Insights: Compstimate "Senior Product Designer" | No Singapore option. "$251K, Low confidence… Typically within ±11%". ([p4-07](../screenshots/persona-stable-18-24/p4-07-compstimate-designer.png)) | 45 s |
| 8 | Insights: Compare companies (at the very bottom) | She has to pick "Design" from a 26-item list: Anthropic $345K, OpenAI $277K, Anduril $193K, Shield AI $143K, Palantir $132K. Scale AI, the company she has open, isn't listed. There's no per-level view. ([p4-08c](../screenshots/persona-stable-18-24/p4-08c-compare-design.png), [p4-09](../screenshots/persona-stable-18-24/p4-09-market-insights.png)) | 60 s |
| 9 | Shield AI, "designer" + Remote | 1 role: *Principal Product Designer*, tagged "Remote", "United States +4". Nothing on the card says the remote role is US-only. Juice uses "best in Washington", not where she'd live. ([p4-10](../screenshots/persona-stable-18-24/p4-10-remote-designer.png)) | 60 s |
| 10 | Saves and returns | The saved search restores 1 role. ([p4-11](../screenshots/persona-stable-18-24/p4-11-return-saved.png)) | 20 s |

About 7 minutes.

### P5. Tomás Herrera, 24, executive director, Washington DC (US), phone

- **Who:** co-founded a youth tech-policy nonprofit at 19 and has run it for 5 years (12 staff, two city-council testimonies). Lives with his fiancée; they are not married. Field: policy.
- **Goal:** "Find a policy lead or manager role at an AI lab in Washington DC paying at least $220K base. Compare Anthropic, OpenAI and Cohere on policy pay, and keep at least $6,000 a month after tax and rent for the two of us."
- **Reached?** **Yes, with doubts.** Anthropic's *National Security Partnerships Lead* (DC, $295K–345K) leaves $13K a month as a couple. Cohere's *Lead – US Government Affairs & Public Policy* (DC, $175K–330K) is the other option. Compare companies → Policy: OpenAI $266K, Anthropic $247K, and Cohere isn't shown. The doubts: "Same role elsewhere" compares the Anthropic role with security engineers. Couple Juice is taxed as a married couple filing jointly without saying so, and "Couple" shows more left than "Just me".

| # | Step | What he saw | Time |
|---|---|---|---|
| 1 | Arrives cold | ([p5-01](../screenshots/persona-stable-18-24/p5-01-cold.png)) | 15 s |
| 2 | Department: types "policy" → Public Policy; Location: "Washington" → DC | 2 roles. ([p5-02](../screenshots/persona-stable-18-24/p5-02-dept-policy.png), [p5-03](../screenshots/persona-stable-18-24/p5-03-policy-dc-juice-sort.png)) | 40 s |
| 3 | Opens *National Security Partnerships Lead* | $295K–345K, Senior, "37% percentile". Same role elsewhere: "**Security roles** at Senior level: Anthropic $345K, Anduril $193K, Palantir $167K". Those are security engineers, not policy staff. ([p5-04](../screenshots/persona-stable-18-24/p5-04-natsec-drawer.png), [p5-05](../screenshots/persona-stable-18-24/p5-05-natsec-same-role.png)) | 60 s, confused |
| 4 | Juice: Couple, Monthly, Compare locations | Gross $27K, tax −$8K, rent −$3K (2-bedroom centre), living −$3K, **$13K left**. DC $13K/mo against SF $12K/mo. "Just me" said $155K/yr; "Couple" says ≈$157K/yr, more money for two people, with no note about joint filing. ([p5-06](../screenshots/persona-stable-18-24/p5-06-natsec-juice-couple.png)) | 60 s |
| 5 | Copy link, Apply | "Link copied"; Greenhouse opens in a new tab. | 10 s |
| 6 | Seniority | "Mid 1, Senior 1". Nothing helps a 5-year executive director of a 12-person team see where he fits. | 15 s |
| 7 | OpenAI "policy", Cohere "policy" | Filters are gone again. OpenAI: "158 roles · 7 in title", all in SF. Cohere: 27 roles (3 in title); *Lead – US Government Affairs* $175K–330K, "Multiple pay zones". Same role elsewhere shows only OpenAI ($266K). ([p5-07](../screenshots/persona-stable-18-24/p5-07-openai-policy.png), [p5-08](../screenshots/persona-stable-18-24/p5-08-cohere-gov-affairs.png)) | 90 s (1.9 s) |
| 8 | Insights → Compare companies → Policy & government affairs | OpenAI 9 roles, $266K; Anthropic 6, $247K. ([p5-09](../screenshots/persona-stable-18-24/p5-09-compare-policy.png)) | 45 s |
| 9 | Back to Anthropic, rebuilds, saves, returns | The bookmark icon toggles to "Saved". On return he lands on Anthropic, and the saved search restores 2 roles with "Most juice". ([p5-10](../screenshots/persona-stable-18-24/p5-10-saved.png), [p5-11](../screenshots/persona-stable-18-24/p5-11-return-menu.png), [p5-12](../screenshots/persona-stable-18-24/p5-12-return-saved.png)) | 45 s |

About 6.5 minutes.

## 4. Findings for the group

Each item gives the persona, the screen, a screenshot and the owning file where I could tell.

### Broken, fix now (wrong, misleading or blocking)

| # | What is wrong | Who, screen | Screenshot | Owner |
|---|---|---|---|---|
| B1 | **Search matches inside words.** "intern" matches "International" and "Internal": 9 of Anthropic's 12 results, and *Internal Applications* at Cohere, are not internships. A student's first search fails. Match whole words, or word prefixes, at least for the title ranking and the count. | P1, search and results | [p1-02](../screenshots/persona-stable-18-24/p1-02-anthropic-intern.png), [p1-03](../screenshots/persona-stable-18-24/p1-03-cohere-intern.png) | `public/app.js` (`titleMatch`, about line 533, uses `includes`; the query filter too) |
| B2 | **Compstimate gives an unpaid intern ≈ $215K a year.** It says "Based on 4 similar roles at Cohere, Intern · Canada", but none of those 4 is an internship (Cohere posts no intern pay). "low confidence" also sits next to "Typically within ±8%". The same contradiction appears on OpenAI's London Account Director ("low confidence" with "±10%"). When there are no same-level comparisons, show no number. Never print the accuracy figure next to "low confidence". | P1, P2, drawer | [p1-04](../screenshots/persona-stable-18-24/p1-04-cohere-intern-drawer.png), [p2-08](../screenshots/persona-stable-18-24/p2-08-openai-ad-drawer.png) | `public/features/compstimate.js` (`senioritySim`, label near line 540), `compstimateBlock` in `public/app.js` |
| B3 | **"Same role elsewhere" compares the wrong jobs.** A drone operator is shown against "Field operations & test: Anthropic $310K". Those roles are *Life Sciences Operator, Lead*, *AI Deployment Specialist* and *Lead Technical Instructor*. Anthropic's *National Security Partnerships Lead, … International Security* (a policy role) is compared with "Security roles" at Anduril and Palantir. An intern fellowship is compared with all ML roles ($221K–441K). | P3, P5, P1, drawer | [p3-06](../screenshots/persona-stable-18-24/p3-06-operator-drawer.png), [p5-05](../screenshots/persona-stable-18-24/p5-05-natsec-same-role.png), [p1-17](../screenshots/persona-stable-18-24/p1-17-fellows-drawer.png) | `public/features/roles.js` (the `field-ops` patterns near line 195 match "operator" and "instructor"; "security" wins over the Public Policy department) |
| B4 | **"No other company lists this level" is false.** It appears for Shield AI's Staff+ designer, but Scale AI lists two Staff Product Designers with pay. It appears for Anthropic's interns, but Anduril, Palantir and Cohere list interns. It really means "too few salaried postings to compare". | P4, P1, drawer | [p4-10](../screenshots/persona-stable-18-24/p4-10-remote-designer.png), [p1-17](../screenshots/persona-stable-18-24/p1-17-fellows-drawer.png) | `public/app.js` line 2567 |
| B5 | **The salary box silently throws away what you type.** On Anthropic London, "£80,000", "80k" and "80,000" all snap back to "Any"; "107000" works. "£" isn't accepted, and any value below the board's lowest pay is treated as "no filter". There is no message and no hint that the box is in USD. | P2, Salary popover | [p2-03b](../screenshots/persona-stable-18-24/p2-03b-salary-80k.png) | `public/app.js` (`parseBound` and `typed`, about lines 1194–1210) |
| B6 | **The rent dates contradict each other.** The methodology page says "Rents as of May–October 2026". Every Couple or Family Juice in a US city uses 2- and 3-bedroom rents from **Oct 2025**, and the drawer says "rent Oct 2025 (update due)". The headline only counts 1-bedroom dates. | P3, P4, P5, methodology and drawer | [misc-methodology-phone](../screenshots/persona-stable-18-24/misc-methodology-phone.png), [p3-07](../screenshots/persona-stable-18-24/p3-07-operator-juice-family.png) | `scripts/methodology-figures.js` (`rentAsOf`, line 161) |
| B7 | **"Couple" quietly assumes a married couple filing jointly.** For the DC role, "Couple" leaves ≈$157K a year and "Just me" $155K, so adding a person adds money, with no explanation. Tomás isn't married and can't file jointly. The tax note appears for "single" and "individual" bases, but not for joint filing. | P5 (and P4), Juice | [p5-06](../screenshots/persona-stable-18-24/p5-06-natsec-juice-couple.png) | `public/app.js` `juiceBlock` (`taxHow`, about line 2270); `server/juice.js` |
| B8 | **A Canada-only job is pinned in Australia.** Cohere's two *Data Annotation Specialist* roles list "Victoria, Australia" among nine Canadian cities, and "Winnipeg" and "Halifax" get no country, so they have no pin and no Juice. The gazetteer has `VIC|Victoria|AU`; check whether the board or the geocoder adds "Australia". | P1, drawer and map | [p1-18](../screenshots/persona-stable-18-24/p1-18-cohere-victoria-australia.png) | `server/geo.js` (or the board data) |
| B9 | **Map labels overlap on the phone.** "San Diego, CA + 2 nearby" is printed through "Dallas, TX + 1 nearby", and "Washington, DC" is cut off by a pin. (The grey tiles are expected in this sandbox; the label collision is not.) | P3, Map | [p3-09](../screenshots/persona-stable-18-24/p3-09-map-juice.png) | `public/viz/map.js` |

### Improve (ranked by how many of the 5 it helps)

| # | Change | Helps | Screen, screenshot | Owner |
|---|---|---|---|---|
| I1 | **Keep the search and filters when switching company**, or offer "All companies". Today a switch clears the query, location, department, seniority and salary, but keeps the sort and map colouring. Every persona rebuilt their search on each company. | 5/5 | Company menu → results ([p2-07](../screenshots/persona-stable-18-24/p2-07-openai-london.png), [p1-03](../screenshots/persona-stable-18-24/p1-03-cohere-intern.png)) | `public/app.js` (company switch, `resetFiltersPatch`) |
| I2 | **Say what the site is on first arrival.** On the phone the name is hidden and the first screen is "Anthropic", "Oct 10" and dots. One line ("Every job at 8 AI and defence companies, by pay. 🍉 Juice = what's left after tax, rent and living costs") would do. It's text, not a new control, so it fits §8. | 5/5 | Cold arrival ([p1-01](../screenshots/persona-stable-18-24/p1-01-cold.png), [p2-01](../screenshots/persona-stable-18-24/p2-01-cold.png)) | `public/index.html`, `public/app.js` |
| I3 | **Explain the jargon where it appears.** Juicy / Ripe / Dry / Rind and the "≈" are never explained on a card; the pill tooltip says "livability $". Other unexplained terms: "7% percentile", "Compstimate", "Clusters / Ranges", "list pay", "middle 50%", "Staff+", "Director+", "FX", "regional / social" tax, "Updated 43 d ago" against "Listed 109 days ago" against "4mo", and "16mo" and "3y+". | 5/5 | Cards, drawer, stats line ([explore-desk-ready](../screenshots/persona-stable-18-24/explore-desk-ready.png), [p1-07](../screenshots/persona-stable-18-24/p1-07-intern-drawer-pay.png), [p1-08](../screenshots/persona-stable-18-24/p1-08-intern-juice-month.png)) | `public/app.js`, `public/viz/chart.js` |
| I4 | **Make "(update due)" trustworthy.** On the snapshot's own day, almost every drawer says rent, living costs and FX are "(update due)", and "FX as of Jul 2026 (update due)" is under every comparison. Either refresh the data or say when the next update is due. | 5/5 | Drawer footers ([p1-08](../screenshots/persona-stable-18-24/p1-08-intern-juice-month.png), [p2-06](../screenshots/persona-stable-18-24/p2-06-ae-juice-month.png)) | `public/features/freshness.js`, `data/freshness.json` |
| I5 | **Return visitors should land where they left**, on the last company or a saved search, not always on Anthropic. Make the saved searches findable: on the phone, Save is an unlabelled bookmark icon squeezed between clipped chips ("ıtion", "Inte", "Rem"). | 5/5 | Return visit ([p1-13](../screenshots/persona-stable-18-24/p1-13-return.png), [p1-06](../screenshots/persona-stable-18-24/p1-06-anduril-intern-list.png)) | `public/app.js`, `public/styles.css` |
| I6 | **Show the board's raw labels as plain words.** The company menu groups by "GREENHOUSE / ASHBY / LEVER" with slugs ("andurilindustries"), and Add board asks for a "Board slug". Departments show as "Templates : Intern" or "Maritime & Maneuver Dominance : Undersea Reconnaissance & Strike – Engineering & Operations : Software Engineering". Lever's "per-hour-wage" text appears as is. The drawer repeats "Internships · Internships · Intern [Intern]". Cards say "London, England" where the drawer says "London, UK". | 5/5 | Menu, cards, drawer ([explore-company-menu](../screenshots/persona-stable-18-24/explore-company-menu.png), [misc-add-board](../screenshots/persona-stable-18-24/misc-add-board.png), [p1-04](../screenshots/persona-stable-18-24/p1-04-cohere-intern-drawer.png)) | `public/app.js`, `server/normalize.js` |
| I7 | **Let the household fit real life.** "Family" means 2 children in a 3-bedroom city-centre home, "Couple" assumes one income, and there is no "room in a shared flat", no "outside the centre", and no "my rent" (the code already has a "your rent" basis). Also show which household the cards and sort use. After choosing Family, every card shows "≈" with no label. | 5/5 | Juice block ([p3-07](../screenshots/persona-stable-18-24/p3-07-operator-juice-family.png), [p4-06](../screenshots/persona-stable-18-24/p4-06-scale-juice-couple.png)) | `public/app.js` (`HOUSEHOLDS`, `juiceBlock`), `server/juice.js` |
| I8 | **Don't call unlevelled roles "Mid".** Any title without a level becomes "Mid": $305K–460K product designers, £280K London AEs, a £375K–640K research engineer. Senior and Staff filters then hide them, and level comparisons fall apart. Say "Level not stated". | 4/5 (P1, P2, P4, P5) | Seniority filter, cards ([p4-03](../screenshots/persona-stable-18-24/p4-03-anthropic-designer-seniority.png), [p2-02](../screenshots/persona-stable-18-24/p2-02-london-sales.png)) | `public/features/roles.js` (`inferSeniority`), `server/keywords.js` |
| I9 | **Show pay the way it was posted, in the right period.** Hourly roles show "$83K–114K" on the card. A weekly stipend becomes "$200K". A 12-week internship gets a full-year Juice graded "Dry". London and Singapore Juice is shown in USD only. Show "$40–55/hr" on hourly cards, open Juice on Monthly for intern and hourly roles, and add the local currency. | 3/5 (P1, P2, P3) | Cards, Juice ([p1-06](../screenshots/persona-stable-18-24/p1-06-anduril-intern-list.png), [p2-06](../screenshots/persona-stable-18-24/p2-06-ae-juice-month.png)) | `public/app.js` (card pay pill, `juiceBlock`) |
| I10 | **Remote and "your city".** The "Remote" tag doesn't say where: Shield AI's remote roles are US-only, Cohere's cover CA, US, UK and Dubai. Juice for a multi-city or remote job uses the "best" listed city (Dallas for a San Diego job, Washington for Mei Lin), and "Remote (US)" roles get no Juice at all. | 3/5 (P1, P3, P4) | Cards, drawer ([p4-10](../screenshots/persona-stable-18-24/p4-10-remote-designer.png)) | `public/app.js` (card tag), `server/juice.js` (best location) |
| I11 | **Make search results about titles.** "policy" matches 158 of 815 OpenAI roles, "design" 276 (chip design, *Powered Land Developer*), "flight test" 32. Title matches do come first, but the count, chart and stats include every match. Lead with the title count, or offer "titles only". | 3/5 (P3, P4, P5) | Results ([p5-07](../screenshots/persona-stable-18-24/p5-07-openai-policy.png), [p4-04](../screenshots/persona-stable-18-24/p4-04-openai-design-by-level.png)) | `public/app.js` |
| I12 | **Bring "Compare companies" forward.** It's the best company comparison on the site, but it sits at the bottom of Insights, defaults to Software engineering whatever the search, and drops the current company when it has fewer than 3 salaried postings (Scale AI vanished from Design, Cohere from Policy). Preselect the family of the open search or job, and show "too few to compare" rows. | 3/5 (P2, P4, P5) | Insights ([p4-08c](../screenshots/persona-stable-18-24/p4-08c-compare-design.png), [p5-09](../screenshots/persona-stable-18-24/p5-09-compare-policy.png)) | `public/features/insights.js`, `public/viz/comps.js` |
| I13 | **Explain missing pay outside the US.** Singapore shows 0% published pay at Anthropic, OpenAI London 41%, and every London sales role at OpenAI, Scale, Palantir and Shield AI says "No salary". One line saying that UK and Singapore employers don't have to publish ranges would stop people blaming the site. | 3/5 (P1, P2, P4) | Stats line, cards ([p4-02](../screenshots/persona-stable-18-24/p4-02-anthropic-singapore.png)) | `public/app.js` |
| I14 | **Fix the Juice colours and rounding.** The "Juice left" bar and the Juicy badge are red or pink, and red reads as "bad". Monthly amounts are rounded to whole thousands ("living −$1K", "rent −$2K"), which is too coarse for a student or family budget. | 3/5 (P1, P2, P3) | Juice ([p2-06](../screenshots/persona-stable-18-24/p2-06-ae-juice-month.png), [p1-08](../screenshots/persona-stable-18-24/p1-08-intern-juice-month.png)) | `public/features/features.css`, `public/app.js` (`money`) |
| I15 | **Make the salary floor mean "at least".** With "$95K+", $74K–110K jobs still show, because a range only has to overlap. Offer "minimum pay at least $X", or say "can reach $95K". | 2/5 (P2, P3) | Salary filter ([p3-05](../screenshots/persona-stable-18-24/p3-05-operator-95k.png)) | `public/app.js` (filter spec) |
| I16 | **Fix "mostly Sales".** It appears when Sales is 19% of roles. Say "largest team: Sales (19%)". | 1/5 (P2) | Stats line ([p2-01](../screenshots/persona-stable-18-24/p2-01-cold.png)) | `public/app.js` line 1657 |
| I17 | **Let people exclude a Fit keyword**, for example "no degree required". Fit can only include. | 1/5 (P3) | More ([p3-03b](../screenshots/persona-stable-18-24/p3-03b-more-popover.png)) | `public/app.js` |

### Good (keep)

| # | What works | Who | Screenshot |
|---|---|---|---|
| G1 | **It's fast.** The full chart and list are ready in 0.6–0.8 s on desktop and phone (1.6 s with the CPU slowed 4×). Company switches take 0.6–1.9 s, and the map opens in 2.5 s throttled. | All 5 | [explore-phone-0800ms](../screenshots/persona-stable-18-24/explore-phone-0800ms.png) |
| G2 | **Pay is on every card**, in the posted currency (£, CA$), with "No salary" when it's missing. Everyone could scan pay at a glance. | All 5 | [p2-02](../screenshots/persona-stable-18-24/p2-02-london-sales.png) |
| G3 | **Honest pay labels:** "Annualized from hourly pay ($40 — $55 USD)", "Single figure", "+ bonus / + equity mentioned", "Posted base pay. Equity and bonus aren't included.", "Salary not listed", and "Open 180+ days. Some companies keep a posting open…". | P1, P2, P3 | [p1-07](../screenshots/persona-stable-18-24/p1-07-intern-drawer-pay.png), [p3-11](../screenshots/persona-stable-18-24/p3-11-anduril-operator-drawer.png) |
| G4 | **The Juice waterfall:** gross, tax (with its parts), rent, living costs, what's left, plus Monthly/Yearly, the household switch, "Rent takes 28% of take-home", and Compare locations. The UK tax for Callum's role matched the 2026/27 bands when I checked it. | All 5 | [p1-08](../screenshots/persona-stable-18-24/p1-08-intern-juice-month.png), [p2-06](../screenshots/persona-stable-18-24/p2-06-ae-juice-month.png) |
| G5 | **"Same role elsewhere", when it picks the right family:** intern software engineers, Palantir $126K against Anduril $102K; Mid sales, Anthropic $335K against OpenAI $257K. It is instant context for a pay conversation. | P1, P2 | [p1-07](../screenshots/persona-stable-18-24/p1-07-intern-drawer-pay.png), [p2-05](../screenshots/persona-stable-18-24/p2-05-ae-same-role.png) |
| G6 | **Saved searches restore exactly** (filters and sort) in a new session; the toast says where to find them; × removes one. | All 5 | [p2-13](../screenshots/persona-stable-18-24/p2-13-return-menu.png) |
| G7 | **Apply goes straight to the official posting** in a new tab and names the host ("Apply on Greenhouse · job-boards.greenhouse.io"). Copy link works. | All 5 | [p5-06](../screenshots/persona-stable-18-24/p5-06-natsec-juice-couple.png) |
| G8 | **Type-ahead in the company menu and in the Location and Department lists** ("shield", "San Diego", "policy"). Filter counts next to every option, and "Show 162 roles" on the phone button before you apply. | P3, P5, all | [p3-02](../screenshots/persona-stable-18-24/p3-02-company-search.png), [p3-03](../screenshots/persona-stable-18-24/p3-03-location-sheet.png) |
| G9 | **The map's Pay/Juice switch**, with a legend that turns grades into dollars ("Juicy 70+ ≥ $96K/yr"), and a separate Remote badge. | P3 | [p3-09](../screenshots/persona-stable-18-24/p3-09-map-juice.png) |
| G10 | **Fit keywords that matter to people without a standard background:** "Security clearance", "Degree or equivalent", "Defense / aerospace". | P3 | [p3-03b](../screenshots/persona-stable-18-24/p3-03b-more-popover.png) |
| G11 | **Honest empty states:** a "No published salaries" row in the chart, "0% list pay" for Singapore. | P1, P4 | [p1-03](../screenshots/persona-stable-18-24/p1-03-cohere-intern.png), [p4-02](../screenshots/persona-stable-18-24/p4-02-anthropic-singapore.png) |
| G12 | **The Compare companies card** with its role-family picker is the clearest way to compare companies, once found. | P4, P5 | [p4-08c](../screenshots/persona-stable-18-24/p4-08c-compare-design.png) |
| G13 | **The Ranges view** (one bar per job) is the README's "Zillow" picture and easier to read than Clusters for a newcomer. | P2, P4 | [misc-ranges-view](../screenshots/persona-stable-18-24/misc-ranges-view.png) |

## 5. Replayable steps

1. `mkdir -p <scratch>/persona-stable-18-24 docs/screenshots/persona-stable-18-24`, then copy the prompt to `docs/process/prompts/persona-stable-18-24.md`.
2. Serve the lead's build in the background: `node scripts/cycle/serve.mjs --dist <scratch>/cycle-stable/dist --pid <scratch>/persona-stable-18-24/serve.pid > <scratch>/persona-stable-18-24/serve.log`. The log prints the port (34217 in this run). Stop it with `kill "$(cat <scratch>/persona-stable-18-24/serve.pid)"`.
3. The scripts live in `<scratch>/persona-stable-18-24/`. They are not committed, because this role only owns the log, the prompt and the screenshots.
   - `lib.mjs` handles launch, actions and screenshots. It uses Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, desktop at 1440×900 and phone at 390×844 (isMobile, hasTouch, DPR 2), and aborts every request that isn't to 127.0.0.1.
   - `cold.mjs`, `explore.mjs` and `explore-phone.mjs` were the first look at the site.
   - `dump.mjs` writes `jobs.json` with every unpacked job, used to check numbers.
   - `p1.mjs`, `p1b.mjs`, `p1c.mjs`, `p2.mjs`, `p2b.mjs`, `p3.mjs`, `p4.mjs` and `p5.mjs` are the persona journeys. Each writes `pN-steps.json` with timings.
   - `misc.mjs`, `dbg3.mjs` and `dbg5.mjs` cover tooltips, the methodology page, Add board, Insights scrolling, and timings with 4× CPU throttling.
4. Run each script with `NODE_PATH=<scratch>/pw/node_modules node <script>`. Never run `playwright install`.
5. Phone mechanics worth knowing for a replay: the Salary, Department, Location, Seniority and Remote chips open the full Filters sheet at their section (confirm with "Show N roles"); "More" opens its own bottom popover ("See N roles"); the results list is a bottom sheet (`#sheetHandle`, `aria-expanded`).

## 6. Verification

- All five journeys ran end to end in Playwright, with screenshots at every step (86 PNGs, 16 MB, about the same as the other persona folders).
- Measured times (fast container): landing 0.5–0.8 s; company switch 0.6 s (Shield AI) to 1.9 s (OpenAI); drawer 1.5–1.8 s.
- With the phone CPU slowed 4×: landing 1.6 s; Anduril switch about 2.9 s (3.7 s measured, including 0.8 s of script waits); search 0.4 s; first map pins 2.5 s; Insights 2.3 s.
- Numbers checked by hand:
  - The UK tax on a £305K midpoint: income tax about £123K a year, about $13.9K a month; NI £676 a month, $911. Both match the drawer.
  - The intern's monthly gross: a $98.8K midpoint ÷ 12 = $8.2K.
  - Couple ($157K) against single ($155K) for the DC role.
  - The rent `asOf` dates in `cities.json`: 1-bedroom rents are Sep 2026; 2- and 3-bedroom rents for US cities are Oct 2025.
- The page console logged only `net::ERR_FAILED` for the blocked board and tile requests, which is expected in this sandbox.

## 7. Known gaps and follow-ups

- I didn't write failing tests (the playbook asks for them "where it can"), because this role owns only the log, the prompt and the screenshots. B1, B4, B5 and B6 are easy to encode for whoever fixes them:
  - B1: `q=intern` on Anthropic must not rank "International" as a title match.
  - B4: the comps note must not say "No other company lists this level" when another company has postings at that level.
  - B5: `parseBound('£80,000')` should give 80000, and a below-domain value should say so.
  - B6: `rentAsOf` should include `rent2br` and `rent3br`.
- For B8, I couldn't see the raw Ashby location string (only the normalised one), so it's unconfirmed whether "Australia" comes from the board or from `server/geo.js`.
- Time per step is my estimate of how long a real person would take; only the app's own response times were measured.
- One screenshot built from a hand-written URL (`s=Senior,Staff%2B`) was discarded: that isn't the app's own URL format, so its empty state isn't evidence.
- Scrolling Insights with `scrollIntoView` scrolled the whole page and left a blank lower half. A real mouse wheel doesn't do that (the inner panel scrolls), so it's not reported.

## 8. Change log

- 2026-10-10: served the lead's stable build; ran the cold-arrival and exploration probes; ran the five journeys (P1 and P2 twice after script fixes for the phone filter sheet and the company switch clearing the search); ran the throttled timings; checked the owning code; wrote this log.
