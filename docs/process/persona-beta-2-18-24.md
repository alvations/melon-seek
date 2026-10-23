# Process log: persona review wave 2, beta site, ages 18–24

## State

- 2026-10-23 21:58 UTC: **done.** The five journeys, the wave-1 re-checks and the three lists are below.
- Sent to the lead, one message per batch: BN-1 and BN-2 (21:27), BN-3 (21:37), BN-4 (21:53).
- The server on 127.0.0.1:45603 (pid file `scratchpad/persona-beta-2-18-24/serve.pid`) is stopped at the end of the run.

## 1. Brief

- Prompt, verbatim: [prompts/persona-beta-2-18-24.md](prompts/persona-beta-2-18-24.md).
- Goal: the second persona wave on `/melon-seek/beta/`, after fix waves 3 to 5 and QA round 4. Five job seekers aged 18–24, one per career level, each doing a real task in the browser. Wave 1's findings for this group ([persona-beta-18-24.md](persona-beta-18-24.md), BF-1 to BF-7 and IM-1 to IM-10) are checked again.
- Build: the lead's `scratchpad/cycle-beta7-dist`, made from e800c43, the deployed head. Data: the 2026-10-16 crawl of the seven big-tech boards. Amazon has 22,179 postings, Apple 4,851, Google 3,821, Meta 1,208, Microsoft 2,435, NVIDIA 2,711 and Netflix 414. The eight AI boards are also in the beta menu.
- Files owned: this log, the prompt copy and `docs/screenshots/persona-beta-2-18-24/` (shrunk with `scripts/cycle/shrink-screenshots.sh`). No product code was edited and nothing was pushed. Commits are in this worktree only.
- Expected in this sandbox and not reported: map tiles are grey ("Basemap unavailable · pins still work"), and the badge reads "Snapshot · Oct 16".

## 2. Inputs

- README.md and docs/strategy/ROADMAP.md §8, the UI simplicity budget. Every Improve item below fits inside it: no new main-view controls. New options go inside existing selects, popovers, the Location search or the drawer.
- docs/process/lead.md from "Fix wave 5" on, read at e800c43. This worktree's own checkout is older (2474fc4), so every doc and code reference here is to e800c43 or to the built files in `cycle-beta7-dist`.
- Wave 1 for this group, [persona-beta-18-24.md](persona-beta-18-24.md).
- Phone sizes come from test/e2e/phone-sizes.mjs (at e800c43). The people used the iPhone 13 mini (375x812) and the same phone in landscape (812x375), the iPhone 13/14 (390x844), the Pixel 8 (412x915), the Motorola razr cover screen (352x355) and its inner screen (412x1005), and the Surface Duo spanned (1114x720). Desktops were 1440x900 and a 1280x800 laptop.
- Code was read only to name an owner or check a number: `public/app.js` (`stats`, the stats line, `derive`, `failures`, `HOUSEHOLDS`, `shiftRange`/`shiftText`, `placeMatcher`, `salaryDistribution`), `public/features/roles.js` (`roleFamily`) and `public/features/comps.js` (`compsForJob`, `compsNote`), from the built `beta/` folder.
- Every big-tech posting was dumped in the browser (`api.getJobs`: 37,619 postings), to check the numbers the people saw.

## 3. The five people

The step times are what a real person would take, reading and thinking (my estimate). The app's own times, measured in the run, are in brackets. Search times include a fixed 0.8 s wait in my script, so the real search is faster. The load average was 3.5 to 14.5 during the runs: other reviewers share the 4 CPUs.

### P1. Mei Lin Tan, 21, student, Waterloo (Canada): iPhone 13 mini 375x812, later turned sideways (812x375)

- **Who:** in her third year of Computer Engineering at the University of Waterloo, doing co-op terms. Single; she lives with her parents in Markham between terms and sublets a room in the city where she works. Field: engineering.
- **Goal:** "A summer 2027 software internship at Amazon, Google or Microsoft in Canada. What does it pay a month, and does a summer in Vancouver leave me at least CA$1,500 a month after tax and rent?"
- **Reached?** **Yes, with three doubts.** Amazon's *Software Development Engineer Intern – Summer 2027 (CAN)* in Vancouver posts CA$100,810 a year. Juice leaves **$1,740 a month** in US dollars, about CA$2,430, for one person. The doubts:
  - the rent is a 1-bedroom flat in the city centre, not the room she would sublet;
  - Juice is in US dollars only;
  - the stats line says "$72K base pay median" over cards in CA$ (BN-2).
- Google's Canadian internships are all for PhD students. Microsoft's are data-centre internships at CA$44K–50K a year (26 weeks), which Juice grades "0 · Rind" in Toronto.

| # | Step | What she saw | Time |
|---|---|---|---|
| 1 | Arrives cold | Google opens, with "melon·seek · Beta: adds 7 big-tech careers sites" and "$199K base pay median (US)". The company menu shows BIG TECH first. She gets "big tech, pay" at once. ([p1-01](../screenshots/persona-beta-2-18-24/p1-01-cold.png), [p1-02](../screenshots/persona-beta-2-18-24/p1-02-company-menu.png)) | 10 s (1.3 s) |
| 2 | Amazon | 22,179 roles, "$152K base pay median (US)". ([p1-03](../screenshots/persona-beta-2-18-24/p1-03-amazon.png)) | 10 s (2.7 s; menu 0.6 s) |
| 3 | Searches "intern" | "487 roles · 428 in title". The top cards are US applied-science internships at "$143K–222K" with no "/year". ([p1-04](../screenshots/persona-beta-2-18-24/p1-04-amazon-intern.png)) | 20 s |
| 4 | Location chip → "Vancouver" | The sheet opens with the Department section's search box at the top. She types "Vancouver" there and gets "No matches". The Location box is below it. ([p1-05a](../screenshots/persona-beta-2-18-24/p1-05a-location-sheet-other-search.png), [p1-05](../screenshots/persona-beta-2-18-24/p1-05-location-vancouver.png)) | 30 s, confused |
| 5 | "Show 3 roles" | Cards at CA$161K, CA$101K and CA$92K. The stats line says **"$72K base pay median"**, with no "US". The chart caption says "US dollars a year, converted · Median base pay $72K" in small type. ([p1-06](../screenshots/persona-beta-2-18-24/p1-06-vancouver-interns.png)) | 20 s, puzzled |
| 6 | Opens the SDE intern | "CA$101K · CAD · per year · ≈ $72K in US dollars at Sep 2026 rates", "One number, not a range", "This one among 6 internships at Amazon" and "Pays more than 40% of Amazon's internships" (the 6 are Canada's; the line doesn't say so). The department reads "Administrative Support · Software Development", which is Amazon's own category. Same role elsewhere: "Nothing to compare yet in Canada". The "Reopened where you left off" toast covers the Juice line. ([p1-07](../screenshots/persona-beta-2-18-24/p1-07-sde-intern-drawer.png)) | 40 s (0.2 s) |
| 7 | Juice, Monthly | Gross $6,020; tax −$1,480 (income tax $800 · **state or local tax** $340 · social security $340, for British Columbia); rent −$1,800 for a 1-bedroom in the city centre; living −$1,000; **$1,740 left**; "Rent takes 40% of take-home pay". The tax is checked by hand in §5. ([p1-10](../screenshots/persona-beta-2-18-24/p1-10-juice-open.png), [p1-11](../screenshots/persona-beta-2-18-24/p1-11-juice-monthly.png)) | 45 s |
| 8 | Google | Toast "Kept 'intern', Vancouver". 0 roles, then "Without the location filter: 92 roles · Remove the location filter". ([p1-12](../screenshots/persona-beta-2-18-24/p1-12-google-kept.png)) | 15 s (menu 0.4 s) |
| 9 | Location "Canada" | Montreal 10, Toronto 8, Waterloo 8. She ticks all three: 14 roles. The cards read "CA$120K/year · 12–14-week internship". All of them are PhD roles. ([p1-13](../screenshots/persona-beta-2-18-24/p1-13-location-canada.png), [p1-14](../screenshots/persona-beta-2-18-24/p1-14-google-canada-interns.png), [p1-15](../screenshots/persona-beta-2-18-24/p1-15-google-intern-drawer.png)) | 40 s |
| 10 | Microsoft | "Kept 'intern', Montreal, Toronto · dropped Waterloo (not at Microsoft) for now". Cards: "CA$9,150–10,170/month · 12-week internship" and "CA$44K–50K/year · 26-week internship". The second reads "0 · Rind", which is −$380 a month in Toronto. ([p1-16](../screenshots/persona-beta-2-18-24/p1-16-microsoft-canada-interns.png), [p1-17](../screenshots/persona-beta-2-18-24/p1-17-ms-intern-drawer.png)) | 40 s (0.8 s) |
| 11 | Back to Amazon, Insights | Pay estimate "$88K US dollars a year", low confidence, "Based on 4 similar roles". The Location select lists about 300 places. ([p1-19](../screenshots/persona-beta-2-18-24/p1-19-insights.png)) | 45 s (1.5 s) |
| 12 | Save | "Saved in this browser. Find it in the company menu, with its new roles". ([p1-21](../screenshots/persona-beta-2-18-24/p1-21-saved.png)) | 5 s |
| 13 | Comes back with the phone sideways | It reopens on "Amazon · 'intern' · Montreal · Toronto", and the saved search is in the menu. The map is a 175 px strip between the chips and the sheet. Its only pin reads "**$72K** · 5 · Toronto, Canada". ([p1-22](../screenshots/persona-beta-2-18-24/p1-22-return-landscape.png), [p1-23](../screenshots/persona-beta-2-18-24/p1-23-return-menu.png), [p1-24](../screenshots/persona-beta-2-18-24/p1-24-map-landscape.png)) | 20 s (0.5 s; map 2.1 s) |

About 6 minutes.

### P2. Kacper Nowak, 23, early career (3½ years), Warsaw (Poland): 1280x800 laptop, later an iPhone 13/14 (390x844)

- **Who:** customer support at a Warsaw e-commerce firm from 19, then an inside-sales rep. Single, rents a room. Field: sales. His browser is in Polish (pl-PL).
- **Goal:** "A sales role at Google or Microsoft in Warsaw with a posted base of at least PLN 150,000, or in Dublin with at least €40,000. Which one leaves me more each month after tax and rent?"
- **Reached?** **Yes, with friction.**
  - **Warsaw:** Google has 4 sales-type roles. *Enterprise Account Executive, Google Cloud* (PLN 460K–471K) leaves **$3,960 a month**. The Polish tax checks out by hand (§5).
  - **Dublin:** Google has 84 sales roles at €40K or more. *Account Executive, Mid-Market Sales (Polish, English)* (€98K–100K) leaves **$2,375 a month**. Microsoft's Dublin account roles pay €60K–103K.
  - **Friction:**
    - the Location list lied about Dublin while his PLN minimum was on: "Dublin 2" when there are 137 (BN-1);
    - his PLN and euro minimums became "$40K+" and "$46K+";
    - his saved search didn't follow him to his phone.

| # | Step | What he saw | Time |
|---|---|---|---|
| 1 | Arrives cold | "3821 roles · 66% show pay · $199K base pay median (US)" (Polish formats 4-digit numbers without a separator). ([p2-01](../screenshots/persona-beta-2-18-24/p2-01-cold-laptop.png)) | 10 s (1.2 s) |
| 2 | Location "Poland", then "Polska" | Both list Warsaw 66, Krakow 14 and Wrocław 8, and "Warszawa" finds Warsaw. ([p2-02](../screenshots/persona-beta-2-18-24/p2-02-location-poland.png)) | 15 s |
| 3 | Warsaw | "66 of 3821 roles · 92% show pay for Warsaw · **$75K** base pay median" over PLN cards. ([p2-03](../screenshots/persona-beta-2-18-24/p2-03-google-warsaw.png)) | 15 s |
| 4 | Department | COMPANY: Google 62, YouTube 4. DEPARTMENT: Software Engineering 39 … Sales 1. ([p2-04](../screenshots/persona-beta-2-18-24/p2-04-department.png)) | 15 s |
| 5 | "sales", then "account" | 4 roles, then 2: *Enterprise Account Executive, Google Cloud* (PLN 460K–471K) and a 13-week intern at PLN 102K/year. | 30 s |
| 6 | Salary "PLN 150,000" | "Min: PLN 150,000 ≈ $40K a year", 60 roles. The chip now reads "$40K+". ([p2-05](../screenshots/persona-beta-2-18-24/p2-05-salary-pln.png), [p2-06](../screenshots/persona-beta-2-18-24/p2-06-warsaw-150k.png)) | 20 s |
| 7 | Opens the Enterprise AE | "PLN 460K–471K · ≈ $122K–125K", "Pays more than 74% of Google's roles in Poland". Same role elsewhere: "Nothing to compare yet in Poland". Juice, monthly: gross $10,280; tax −$4,150; rent −$1,240; **$3,960 left**. ([p2-07](../screenshots/persona-beta-2-18-24/p2-07-warsaw-ae-drawer.png), [p2-09](../screenshots/persona-beta-2-18-24/p2-09-warsaw-ae-juice.png)) | 60 s (0.2 s) |
| 8 | Location → wants Dublin | The list shows only **Warsaw 60, Krakow 7, Wrocław 4, Dublin 2, London 1**, with no search box. He thinks Google has 2 roles in Dublin. Ticking Dublin anyway gives "Dublin 139". (BN-1: [p2-10](../screenshots/persona-beta-2-18-24/p2-10-location-with-salary.png), [p2-11](../screenshots/persona-beta-2-18-24/p2-11-warsaw-plus-dublin.png)) | 40 s, misled |
| 9 | Dublin, €40,000, Sales | "€40,000 ≈ $46K a year". 84 roles from €96K to €172K. Seniority: Level not stated 72, Entry 4, Senior 4. ([p2-12](../screenshots/persona-beta-2-18-24/p2-12-google-dublin-sales.png), [p2-13](../screenshots/persona-beta-2-18-24/p2-13-seniority.png)) | 40 s |
| 10 | Opens *Account Executive, Mid-Market (Polish, English)* | "€98K–100K · ≈ $113K–115K", "Pays more than 71% of Google's roles in Ireland". Same role elsewhere: "Sales & partnerships, every full-time level in Ireland: Microsoft 17 $89K, Google 82 $88K". Juice: **$28,500 a year** ($2,375 a month), "Rent takes 41% of take-home pay". ([p2-14](../screenshots/persona-beta-2-18-24/p2-14-dublin-ae-drawer.png), [p2-15](../screenshots/persona-beta-2-18-24/p2-15-dublin-ae-same-role.png), [p2-16](../screenshots/persona-beta-2-18-24/p2-16-dublin-ae-juice.png)) | 60 s (0.3 s) |
| 11 | Microsoft | "Kept $46K+, Dublin · dropped Sales (not at Microsoft) for now". "account" gives 6 roles: Senior Account Manager €60K–103K and Digital Account Executive €62K–92K. ([p2-17](../screenshots/persona-beta-2-18-24/p2-17-microsoft-dublin.png), [p2-18](../screenshots/persona-beta-2-18-24/p2-18-microsoft-dublin-account.png)) | 40 s (0.8 s) |
| 12 | Insights → Compare companies | "Posted pay in Ireland, by company": Microsoft 17 $89K, Google 82 $88K. "Microsoft" breaks mid-word as "Micros / oft" in the 1280 px label column. ([p2-19](../screenshots/persona-beta-2-18-24/p2-19-insights.png), [p2-20](../screenshots/persona-beta-2-18-24/p2-20-compare-companies.png)) | 45 s (0.3 s) |
| 13 | Save, then opens the site on his phone | The phone (a new browser) opens on plain Google with no saved search. He pastes the link he copied, and it opens exactly ("$91K base pay median", 6 roles). The phone drawer reads well. ([p2-21](../screenshots/persona-beta-2-18-24/p2-21-phone-no-saved.png), [p2-22](../screenshots/persona-beta-2-18-24/p2-22-phone-pasted-link.png), [p2-24](../screenshots/persona-beta-2-18-24/p2-24-phone-drawer.png)) | 40 s (2.0 s) |
| 14 | Back on the laptop | It reopens on the view. The menu shows "Microsoft · 'account' · $46K+ · Dublin": his €40,000 is now "$46K+". ([p2-25](../screenshots/persona-beta-2-18-24/p2-25-laptop-return-menu.png)) | 10 s (0.9 s) |

About 7.5 minutes.

### P3. Desiree "Dee" Washington, 24, mid-career (7 years), Chicago (US): Pixel 8 412x915

- **Who:** at Apple Retail since 17, from Specialist to Technical Specialist to Operations Expert. No degree. A single mother of a 3-year-old daughter. Field: operations.
- **Goal:** "A store-leader or operations-manager job at Apple, Amazon or Meta in or near Chicago, paying at least $70K, that leaves at least $1,000 a month after rent for me and my daughter."
- **Reached?** **Partly.** The jobs exist:
  - Amazon *Area Manager*, $70K–91K, in Chicago, Romeoville, Crest Hill and Joliet;
  - Meta's data-centre *Logistics / Warehouse / Asset Management Operations Manager* roles in Aurora, IL, $89K–163K.

  The money question can't be answered. Juice has no household of one adult and one child. "Family" (two adults, two children) leaves **−$720 a month**, "Couple" +$550 and "Just me" +$1,470, and none of them counts childcare. Three of the four suburbs have no Juice at all. Apple has no store-leader role in Chicago: 4 roles, plus 22 internship pools listed for "United States".

| # | Step | What she saw | Time |
|---|---|---|---|
| 1 | Cold, then Apple, then Location "Chicago" | 28 roles, "$158K base pay median". 22 are "General application (no specific opening)" internship pools. *US-Lead Genius*, her own job, is "$65K–97K", Senior, "Apple Retail · Students". ([p3-01](../screenshots/persona-beta-2-18-24/p3-01-cold-pixel8.png), [p3-02](../screenshots/persona-beta-2-18-24/p3-02-apple-chicago.png), [p3-03](../screenshots/persona-beta-2-18-24/p3-03-apple-chicago-list.png)) | 40 s (1.2 s) |
| 2 | Opens *US-Lead Genius* | "$65K–97K · USD · per year · Annualized from hourly pay", "Pays more than 2% of Apple's roles in the US". The posted rate is only under Details: "As posted: $31.21 and $46.87/hr." ([p3-04](../screenshots/persona-beta-2-18-24/p3-04-lead-genius-drawer.png), [p3-04b](../screenshots/persona-beta-2-18-24/p3-04b-lead-genius-pay-details.png)) | 40 s |
| 3 | Amazon (Chicago kept), "area manager" | "Kept Chicago". 2 roles: *Area Manager* $70K–91K and *Area Manager, Early Career (2027) – Illinois* $71K, both labelled "Manager". ([p3-05](../screenshots/persona-beta-2-18-24/p3-05-amazon-chicago-area-manager.png)) | 30 s (2.4 s) |
| 4 | Location "Illinois", then "IL" | "Illinois" gives no matches. "IL" lists Shepherdsville, Jacksonville FL, Philadelphia… (any place with "il" in its name, plus Israel's code). She types the suburbs one by one: Romeoville, Aurora (Aurora, CO is listed above Aurora, IL), Crest Hill, Joliet. ([p3-06](../screenshots/persona-beta-2-18-24/p3-06-location-illinois.png), [p3-09](../screenshots/persona-beta-2-18-24/p3-09-suburbs-list.png)) | 90 s, frustrated |
| 5 | *Area Manager*, Chicago: Juice | Just me $17,600/yr. **Family −$720/mo**: "2 adults, 2 children, 1 earner, 3 bedrooms"; tax −$870 (income tax $70 · state $280 · social security $510), checked by hand in §5; rent −$3,480; living −$3,070. Couple +$550/mo. ([p3-07](../screenshots/persona-beta-2-18-24/p3-07-area-manager-drawer.png), [p3-08](../screenshots/persona-beta-2-18-24/p3-08-area-manager-family.png)) | 60 s |
| 6 | *Area Manager*, Romeoville | "No Juice: no cost data here yet · Details". The same for Crest Hill and Joliet. ([p3-10](../screenshots/persona-beta-2-18-24/p3-10-suburb-no-juice.png)) | 20 s |
| 7 | Meta, "operations", Chicago + Aurora | Data-centre ops managers in Aurora, IL, $89K–196K. *Asset Management Operations Manager* ($115K–163K): Juice **$34,900 a year for a family of four in Aurora**. Same role elsewhere: "**IT & enterprise systems**, every full-time level in the US: Anthropic $292K, OpenAI $287K, Apple $208K…" (BN-4). ([p3-11b](../screenshots/persona-beta-2-18-24/p3-11b-meta-operations.png), [p3-12](../screenshots/persona-beta-2-18-24/p3-12-meta-logistics-juice.png), [p3-13](../screenshots/persona-beta-2-18-24/p3-13-meta-logistics-same-role.png)) | 60 s, distrust |
| 8 | Google, "data center technician", then "datacenter technician" | 125 roles, then 127. Both are led by *Data Center Facilities Technician III* ($122K–173K, Clarksville TN, "Mid"). Same role elsewhere: "Data center technicians, every full-time level in the US: Google $102K, Amazon $87K, Microsoft $83K". No Juice for Clarksville. ([p3-14](../screenshots/persona-beta-2-18-24/p3-14-google-datacenter-one-word.png), [p3-15](../screenshots/persona-beta-2-18-24/p3-15-dc-tech-drawer.png), [p3-16](../screenshots/persona-beta-2-18-24/p3-16-dc-tech-same-role.png)) | 45 s (0.3 s) |
| 9 | Map (Juice) on the Amazon search | Two pins, "Chicago 2" and "Crest Hill 6". The legend card covers the Chicago pin. The legend reads "Dry < 45 under $47K · Ripe $47K–$95K · Juicy $95K or more" without saying these are yearly amounts left over. ([p3-17](../screenshots/persona-beta-2-18-24/p3-17-map-pay.png), [p3-18](../screenshots/persona-beta-2-18-24/p3-18-map-juice.png)) | 30 s (2.8 s) |
| 10 | Save, come back | It reopens on the view, and the saved search reads "Amazon · 'area manager' · Chicago · Romeoville +3". ([p3-19](../screenshots/persona-beta-2-18-24/p3-19-saved.png), [p3-20](../screenshots/persona-beta-2-18-24/p3-20-return-menu.png)) | 15 s (0.8 s) |

About 7.5 minutes.

### P4. Arjun Mehta, 24, senior (7 years), Zurich (Switzerland): desktop 1440x900, and a Surface Duo spanned (1114x720)

- **Who:** an open-source ML contributor from 17, a research engineer at an ETH spin-off from 19, and now its senior research engineer. Lives with his partner, a full-time master's student, so they have one income. Field: research. His browser is in Swiss German (de-CH).
- **Goal:** "A Senior or Staff research-scientist or research-engineer role in Zurich at Google DeepMind, Apple, NVIDIA, Meta or Microsoft paying at least CHF 180K, or in the US at $250K or more. Compare Senior against Staff across the companies, and see what the two of us would keep in Zurich against Mountain View."
- **Reached?** **Partly.**
  - **Zurich:** of about 140 Zurich-listed roles across the five companies, one has Zurich pay: Microsoft's *AI Workforce Reinvention Architect*, CHF 154K–262K, which leaves a couple **$9,140 a month**. Every other Zurich card is honest: "Pay posted for the US only", "No pay listed".
  - **US:** Google's *Senior Staff Research Scientist, Gemini Research* ($262K–364K, Mountain View) leaves a couple **$12,300 a month**.
  - **Compare companies:** it answers Senior against Staff, US only. For AI research, Senior runs from Netflix $608K to Microsoft $177K, and Staff+ from Netflix $833K and Anthropic $675K to Microsoft $209K.
  - His stats line read "3’821 3’821 roles" all along (BN-3).

| # | Step | What he saw | Time |
|---|---|---|---|
| 1 | Cold | "**3’821 3’821 roles** · 66% show pay · $199K base pay median (US)". ([chk-locale-de-ch-stats](../screenshots/persona-beta-2-18-24/chk-locale-de-ch-stats.png)) | 10 s (1.0 s), puzzled |
| 2 | "research", Location "Zürich" | "Zürich" finds Zurich. "18 of 3’821 roles · 0% show pay for Zurich". The chart says "No pay posted for Zurich · 18 postings match; 4 list pay for another country only, so the chart leaves them out". The cards say "Pay posted for the US only", "…for Germany only", "…for France only", "No pay listed". ([p4-01](../screenshots/persona-beta-2-18-24/p4-01-google-research-zurich.png), [p4-02](../screenshots/persona-beta-2-18-24/p4-02-google-zurich-all.png)) | 30 s, trusts it |
| 3 | *Research Scientist, Gemini Vision, DeepMind* | "$174K–252K · USD", with the label "**Posted for the US, not Zurich**". Same role elsewhere: "AI research & ML engineering, every full-time level in the US". Juice is named for its city, "$92,300/yr left for one person in Los Angeles". ([p4-03](../screenshots/persona-beta-2-18-24/p4-03-gemini-vision-drawer.png), [p4-04](../screenshots/persona-beta-2-18-24/p4-04-gemini-vision-juice.png)) | 45 s (0.3 s) |
| 4 | NVIDIA, Microsoft, Apple, Meta (Zurich kept) | NVIDIA 41 roles, 0% with Zurich pay, cards "Pay posted for Poland only". Microsoft 8, one in CHF, with "13% show pay for Zurich · **$254K** base pay median" over "CHF 154K–262K" (BN-2). Apple 22 and Meta 2, both no pay. ([p4-05](../screenshots/persona-beta-2-18-24/p4-05-nvidia-zurich.png), [p4-08](../screenshots/persona-beta-2-18-24/p4-08-microsoft-zurich.png)) | 60 s (0.6–1.0 s each) |
| 5 | Microsoft's CHF role, Couple, Monthly | "CHF 154K–262K · ≈ $188K–320K", "Too few roles in Switzerland show pay to rank this one". Juice 75 · Juicy, **$9,140/mo for a couple in Zurich**; tax −$5,070 (income tax $990 · state or local tax $2,640 · social security $1,440). ([p4-15](../screenshots/persona-beta-2-18-24/p4-15-ms-zurich-couple.png)) | 45 s |
| 6 | On the Duo, spanned: Google "research scientist", Insights | 87 roles. Compare companies "Posted pay in the US, by company", AI research & ML engineering. Senior (8 companies): Netflix 13 $608K, OpenAI 3 $366K, NVIDIA 87 $270K, Apple 70 $255K, Anduril $222K, Google 23 $213K, Amazon 190 $197K, Microsoft 15 $177K. Staff+ (10): Netflix $833K, Anthropic $675K … Microsoft $209K. ([p4-09](../screenshots/persona-beta-2-18-24/p4-09-duo-google-rs.png), [p4-10](../screenshots/persona-beta-2-18-24/p4-10-duo-insights.png), [p4-11 Senior](../screenshots/persona-beta-2-18-24/p4-11-duo-compare-senior.png), [p4-11 Staff](../screenshots/persona-beta-2-18-24/p4-11-duo-compare-staff.png)) | 90 s (0.6 s) |
| 7 | *Senior Staff Research Scientist, Gemini Research*, Couple | $262K–364K, "Pays more than 94% of Google's roles in the US". Same role elsewhere at Staff+ in the US. **$12,300/mo for a couple in Mountain View**. ([p4-16](../screenshots/persona-beta-2-18-24/p4-16-google-mv-couple.png)) | 45 s |
| 8 | Save, come back | It reopens on "Google · 'research scientist'". ([p4-17](../screenshots/persona-beta-2-18-24/p4-17-return-menu.png)) | 15 s (0.6 s) |

About 6 minutes.

### P5. Amara Osei, 24, director (6 years running a non-profit), London (UK): razr cover screen 352x355, then the inner screen 412x1005

- **Who:** founded a youth-voice policy non-profit at 18. It now has 12 staff, and she is its Director of Policy. She lives with her partner. They are not married, and both work. Field: policy.
- **Goal:** "A public-policy or government-affairs manager role at Meta, Google, Microsoft or Amazon in London, paying at least £80K posted. If there's none, what do these companies pay policy managers?"
- **Reached?** **No for London, yes for the comparison.**
  - **London:** none of the seven companies posts pay for a London policy role. UK postings rarely carry pay. Meta's *Privacy and Data Policy Manager* lists London, but its €89K–114K is "Posted for Italy, not London", and the site says so.
  - **Comparison:** at Manager level in the US, Google pays a median $214K, Meta $188K and Amazon $163K. Google's *Manager, Government Affairs and Public Policy* roles are $181K–247K in Washington DC and San Francisco.
  - **Juice:** the Couple preset is one married earner, which isn't her couple.

| # | Step | What she saw | Time |
|---|---|---|---|
| 1 | Cover screen, cold | The top bar, the chips, the chart caption and the "3,821 roles" sheet fit 352x355 with no sideways scroll. ([p5-01](../screenshots/persona-beta-2-18-24/p5-01-razr-cover-cold.png)) | 10 s (1.6 s) |
| 2 | Cover: Meta, "policy", a card | "226 roles · 32 in title". The sheet opens to readable cards, and the drawer has its pay and Apply in view. ([p5-02](../screenshots/persona-beta-2-18-24/p5-02-razr-cover-meta.png), [p5-03](../screenshots/persona-beta-2-18-24/p5-03-razr-cover-policy-list.png), [p5-04](../screenshots/persona-beta-2-18-24/p5-04-razr-cover-drawer.png)) | 40 s (0.7 s) |
| 3 | Opens the phone: inner screen, Location London | "13 roles · 3 in title", "No pay listed" on 12 of them. *Privacy and Data Policy Manager*: "Pay posted for Italy only" on the card, "Posted for Italy, not London" in the drawer, and Juice for Milan. ([p5-05](../screenshots/persona-beta-2-18-24/p5-05-razr-meta-policy-london.png), [p5-06](../screenshots/persona-beta-2-18-24/p5-06-razr-privacy-manager.png)) | 45 s (4.3 s to reopen) |
| 4 | Google, Microsoft, Amazon in London | The toasts keep the search and London each time. Google 1 role (US pay only), Microsoft 0, Amazon 8 with no pay. ([p5-07 Google](../screenshots/persona-beta-2-18-24/p5-07-google-london-policy.png), [Microsoft](../screenshots/persona-beta-2-18-24/p5-07-microsoft-london-policy.png), [Amazon](../screenshots/persona-beta-2-18-24/p5-07-amazon-london-policy.png)) | 60 s (0.8–1.0 s each) |
| 5 | Drops London: "public policy" anywhere | Amazon: 93 roles, *Principal, Public Policy* $165K–245K and *Manager, Public Policy* $138K–187K. Google: 92 roles, led by eight "Manager, Government Affairs and Public Policy" roles at $181K–247K. ([p5-08](../screenshots/persona-beta-2-18-24/p5-08-google-policy-anywhere.png)) | 40 s |
| 6 | Opens a Google GAPP manager | "Pays more than 64% of Google's roles in the US". Same role elsewhere: "Policy & government affairs, Manager level in the US: Google $214K, Meta $188K, Amazon $163K". ([p5-09](../screenshots/persona-beta-2-18-24/p5-09-google-policy-drawer.png), [p5-10](../screenshots/persona-beta-2-18-24/p5-10-google-policy-same-role.png)) | 40 s (0.2 s) |
| 7 | Insights → Compare companies, Policy, Manager | "Posted pay in the US, by company": the same three. The level list says "Senior (2 companies) · Staff+ (1) · Manager (3)". ([p5-11](../screenshots/persona-beta-2-18-24/p5-11-insights.png), [p5-12](../screenshots/persona-beta-2-18-24/p5-12-compare-policy-manager.png)) | 45 s (0.4 s) |
| 8 | Save, come back next morning, Couple Juice | It reopens on "Google · 'public policy'". San Francisco GAPP manager, Couple: **$5,920 a month**, with "Couple here means one earner, married and filing jointly". After the switch to Couple, the cards' scores change (69 → 66), and nothing on the list says they are now a couple's. ([p5-13](../screenshots/persona-beta-2-18-24/p5-13-return-menu.png), [p5-14](../screenshots/persona-beta-2-18-24/p5-14-sf-couple-juice.png), [p5-15](../screenshots/persona-beta-2-18-24/p5-15-cards-after-couple.png)) | 45 s (0.6 s) |

About 5.5 minutes.

## 4. Findings for the group

### Wave 1's findings, checked again

| Wave 1 | Now | Evidence |
|---|---|---|
| BF-1, a filtered city showed another country's pay | **Fixed.** The cards say "Pay posted for the US only" or "…for Poland only". The chart says "No pay posted for Zurich · 18 postings match; 4 list pay for another country only". The drawer says "Posted for the US, not Zurich", and NVIDIA's PLN pay no longer gets a Zurich Juice. | [p4-01](../screenshots/persona-beta-2-18-24/p4-01-google-research-zurich.png), [p4-03](../screenshots/persona-beta-2-18-24/p4-03-gemini-vision-drawer.png), [p4-05](../screenshots/persona-beta-2-18-24/p4-05-nvidia-zurich.png) |
| BF-2, yearly intern pay read as the whole term's pay | **Fixed.** "CA$120K/year · 12–14-week internship", "CA$43,800–50,000 a year · 26-week internship", "CA$9,150–10,170/month · 12-week internship". | [p1-14](../screenshots/persona-beta-2-18-24/p1-14-google-canada-interns.png), [p1-16](../screenshots/persona-beta-2-18-24/p1-16-microsoft-canada-interns.png) |
| BF-3, Same role elsewhere and Compare companies mixed countries | **Fixed.** Both now compare one country: "Sales & partnerships, every full-time level in Ireland", "Posted pay in the US, by company", "Nothing to compare yet in Canada/Poland/Switzerland". | [p2-15](../screenshots/persona-beta-2-18-24/p2-15-dublin-ae-same-role.png), [p2-20](../screenshots/persona-beta-2-18-24/p2-20-compare-companies.png) |
| BF-4, a "Mid" posting was told it "doesn't state a level" | **Fixed.** Google's Data Center Technician III reads "Data center technicians, every full-time level in the US". The note "doesn't state a level" now appears only on postings badged "Level not stated". | [p3-16](../screenshots/persona-beta-2-18-24/p3-16-dc-tech-same-role.png) |
| BF-5, role families misfiled jobs | **Mostly fixed.** Apple's and Google's design managers are Design. Google's French field-sales role is Sales. Data-centre technicians have their own family. **Still wrong:** Meta's data-centre subject-matter experts are filed as AI tutors, and an asset-management ops manager as IT (BN-4). 2,332 Amazon postings, led by Area Manager, have no family (IM-6). | [p3-13](../screenshots/persona-beta-2-18-24/p3-13-meta-logistics-same-role.png) |
| BF-6, a "CAD" skill tag from the currency | **Fixed.** 0 of the 599 CAD-paid big-tech postings carry a "CAD" tag (Google 0 of 72, Microsoft 0 of 54, Amazon 0 of 432). The CAD tags left are computer-aided design. | §5 |
| BF-7, place names that aren't cities | **Fixed.** Apple's store names now map to their cities: Piazza Liberty → Milan, Via del Corso → Rome, Shinsaibashi → Osaka, Rosny 2 → Paris, Campania → Naples, Eldon Square → Newcastle. Google's "Dublinas" is gone. | §5 |
| IM-1, households | **Open.** It is still Just me, Couple (one married earner) or Family (two adults, two children). After a household change, nothing on the list says which household the badges use. | IM-1 below |
| IM-2, say that big tech is here | **Fixed.** The beta opens on Google, the tagline says "Beta: adds 7 big-tech careers sites", and BIG TECH comes first in the menu. | [p1-01](../screenshots/persona-beta-2-18-24/p1-01-cold.png) |
| IM-3, board jargon | **Partly open.** "Apple Retail · Students" is still there. New on Amazon: an SDE intern under "Administrative Support". The site's own "state or local tax" is used for British Columbia and Zurich. | IM-4 below |
| IM-4, phrase and compound search | **Better.** "datacenter technician" now finds the data-centre technicians (127 roles). | [p3-14](../screenshots/persona-beta-2-18-24/p3-14-google-datacenter-one-word.png) |
| IM-5, group by role on the big-tech boards | **Fixed for Google.** It has job families (Software Engineering 946, Sales 461…) and a Company list (Google, YouTube, DeepMind, Waymo, Wing). | [cold-desktop](../screenshots/persona-beta-2-18-24/cold-desktop.png), [p2-04](../screenshots/persona-beta-2-18-24/p2-04-department.png) |
| IM-6, the posting's currency in Juice and the estimate | **Open.** Juice and the pay estimate are in US dollars. The salary chip and the saved-search name turn "PLN 150,000" into "$40K+" and "€40,000" into "$46K+". | [p2-06](../screenshots/persona-beta-2-18-24/p2-06-warsaw-150k.png), [p2-25](../screenshots/persona-beta-2-18-24/p2-25-laptop-return-menu.png) |
| IM-7, Juice gaps | **Better:** the drawer now says "No Juice: no cost data here yet · Details". The gaps remain in Romeoville, Crest Hill, Joliet and Clarksville TN, while Aurora IL has Juice. | [p3-10](../screenshots/persona-beta-2-18-24/p3-10-suburb-no-juice.png) |
| IM-8, small fixes | **Partly.** The Insights Location select still lists about 300 places. The toast still covers drawer content on a 375 px phone. The phone Save chip no longer covers a chip. | [p1-07](../screenshots/persona-beta-2-18-24/p1-07-sde-intern-drawer.png) |
| IM-9, a country in the Location search | **Fixed.** "Canada", "Poland", "Polska", "Ireland" and "Zürich" all work. Still open: each city must be ticked one by one, and a US state isn't understood. | [p1-13](../screenshots/persona-beta-2-18-24/p1-13-location-canada.png), [p3-06](../screenshots/persona-beta-2-18-24/p3-06-location-illinois.png) |
| IM-10, hourly pay as posted on the card | **Open for full-time hourly roles.** The card shows "$65K–97K"; the posted "$31.21 and $46.87/hr" is only under Details, still missing a word. Shift pay and part-time pay are fixed (UX-51). | [p3-04b](../screenshots/persona-beta-2-18-24/p3-04b-lead-genius-pay-details.png) |

### Broken, fix now (wrong, misleading or blocking)

| # | What is wrong | Who, screen | Screenshot | Owner |
|---|---|---|---|---|
| BN-1 | **With a salary minimum and one place picked, the Location list shows false counts for every other place.** Google + Warsaw + "PLN 150,000" lists only Warsaw 60, Krakow 7, Wrocław 4, **Dublin 2** and London 1, and the search box disappears. Dublin really has 137. Amazon + Toronto + $50K shows Vancouver 22 (really 178) and no Seattle (really 3,668). Apple + Cupertino + $100K shows Sunnyvale 32 (really 421). `derive()` skips a posting that fails two filters, and with a place picked, 'sal' is judged at that place (`payHere`). So a posting in any other place fails both 'l' and 'sal' and is never counted, which breaks "each facet's counts ignore that facet's own selection". | P2; Location popover and sheet | [p2-10](../screenshots/persona-beta-2-18-24/p2-10-location-with-salary.png), [p2-11](../screenshots/persona-beta-2-18-24/p2-11-warsaw-plus-dublin.png), [chk-facet](../screenshots/persona-beta-2-18-24/chk-facet-microsoft-redmond-100k.png) | `public/app.js` (`derive`, `failures`: for the 'l' counts, judge 'sal' without the location selection, or at the counted place) |
| BN-2 | **The headline median is in US dollars with a bare "$" when every posting in view is in one other currency.** Vancouver interns read "$72K base pay median" over CA$161K, CA$101K and CA$92K. Microsoft Canada reads "$34K", Google Canada "$86K", Google Warsaw "$75K" over PLN cards, Dublin "$88K" over € cards, and Microsoft Zurich "$254K" over "CHF 154K–262K". The Toronto map pin reads "$72K · 5". MR-39's "(US)" or "(euro area)" label appears only with two or more currencies in view. Only the tooltip, which phones never show, says "in US dollars". A Canadian reads "$72K" as CA$72K. | P1, P2, P4; stats line, map pin | [p1-06](../screenshots/persona-beta-2-18-24/p1-06-vancouver-interns.png), [p1-24](../screenshots/persona-beta-2-18-24/p1-24-map-landscape.png), [p2-03](../screenshots/persona-beta-2-18-24/p2-03-google-warsaw.png), [p4-08](../screenshots/persona-beta-2-18-24/p4-08-microsoft-zurich.png) | `public/app.js` (stats line: give "US$72K" or "≈ $72K US", or the median in the posted currency), `public/viz/map.js` (pin label) |
| BN-3 | **The role count appears twice in any browser that groups thousands with something other than a comma.** de-CH shows "3’821 3’821 roles · 66% show pay…", de-DE "22.179 22.179 roles", pl-PL "22 179 22 179 roles". The line builds `plural(n, 'role').replace(/^[\d,]+ /, '')`, which only strips a comma-grouped number, then puts the formatted count in front again. This is the desktop and laptop stats line; phones show only the median. | P4 (de-CH), P2 (pl-PL); stats line | [chk-locale-de-ch](../screenshots/persona-beta-2-18-24/chk-locale-de-ch-stats.png), [chk-locale-de-de](../screenshots/persona-beta-2-18-24/chk-locale-de-de-stats.png) | `public/app.js` (stats line, first item: build "role/roles" without the number) |
| BN-4 | **Misfiled role families make "Same role elsewhere" compare unrelated jobs.** Meta's data-centre Electrical, Mechanical, Controls and Generator Subject Matter Experts (8, department "Data Center Operations") are filed as "AI tutors & expert contributors" and compared with xAI's AI tutors at $83K. Meta's *Asset Management Operations Manager* ($115K–163K) is filed as "IT & enterprise systems" and set against Anthropic $292K, OpenAI $287K and Apple $208K. | P3; drawer | [p3-13](../screenshots/persona-beta-2-18-24/p3-13-meta-logistics-same-role.png) | `public/features/roles.js` (`roleFamily`: a data-centre-operations department should win over "subject matter expert" and "asset management") |

### Improve (ranked by how many of the 5 it would help)

| # | Change | Helps | Screen, screenshot | Owner |
|---|---|---|---|---|
| IM-1 | **Households that fit real life, and say which one the scores use.** Mei rents a room. Dee is one adult with one child and pays for childcare. Amara and Arjun are couples who aren't married filing jointly (two earners, and a student partner abroad). Kacper rents a room. Add "a room in a shared flat", "1 adult + 1 child", "two earners" and "my rent" inside the Juice block, which is an existing control. After a household change, show "Scores for: Couple" in the Juice explainer row above the cards. | 5/5 | Juice block, cards ([p3-08](../screenshots/persona-beta-2-18-24/p3-08-area-manager-family.png), [p5-14](../screenshots/persona-beta-2-18-24/p5-14-sf-couple-juice.png), [p5-15](../screenshots/persona-beta-2-18-24/p5-15-cards-after-couple.png)) | `public/app.js` (`HOUSEHOLDS`, `juiceScaleNote`), `server/juice.js` |
| IM-2 | **Show Juice, the pay estimate, the salary chip and saved-search names in the posting's or the typed currency too.** "PLN 150,000" becomes "$40K+" and "€40,000" becomes "$46K+". Juice for Vancouver, Warsaw, Dublin and Zurich is only in US dollars, and so is "$88K US dollars a year" for Canadian interns. | 4/5 (P1, P2, P4, P5) | [p2-06](../screenshots/persona-beta-2-18-24/p2-06-warsaw-150k.png), [p2-25](../screenshots/persona-beta-2-18-24/p2-25-laptop-return-menu.png), [p1-11](../screenshots/persona-beta-2-18-24/p1-11-juice-monthly.png) | `public/app.js` (`juiceBlock`, salary chip, saved-search label), `public/features/compstimate.js` |
| IM-3 | **Pick an area, not one city at a time.** A country lists its cities, but each one must be ticked: Mei needed 3 taps for Canada. A US state isn't understood: "Illinois" gives no matches, and "IL" lists Shepherdsville, Jacksonville FL and Israel's places. Dee typed four suburbs and nearly picked Aurora, CO. Add "Select all in Canada" in the country's group header, a state as a search term, and the roadmap's "within N km". | 3/5 (P1, P3, P5) | Location section ([p3-06](../screenshots/persona-beta-2-18-24/p3-06-location-illinois.png), [p1-13](../screenshots/persona-beta-2-18-24/p1-13-location-canada.png)) | `public/app.js` (`placeMatcher`, `makeChecklist`) |
| IM-4 | **Plain words where the site and boards use jargon.** "state or local tax" for a Canadian province or a Swiss canton. "Apple Retail · Students" on a Lead Genius. Amazon's "Administrative Support" on an SDE intern. "Manager" on Amazon's entry-level *Area Manager, Early Career*. The map's Juice legend dollars ("under $47K") don't say they are yearly amounts left over. "This one among 6 internships at Amazon" and "Pays more than 40% of Amazon's internships" don't say "in Canada" on a 375 px phone. | 4/5 (P1, P3, P4, P5) | [p1-07](../screenshots/persona-beta-2-18-24/p1-07-sde-intern-drawer.png), [p1-11](../screenshots/persona-beta-2-18-24/p1-11-juice-monthly.png), [p3-04](../screenshots/persona-beta-2-18-24/p3-04-lead-genius-drawer.png), [p3-18](../screenshots/persona-beta-2-18-24/p3-18-map-juice.png) | `public/app.js` (tax row labels per country, drawer meta, the rank line's fallback), `public/viz/map.js` (legend) |
| IM-5 | **Fill Juice gaps near big cities with a nearby proxy, or offer the nearest city.** Amazon's Romeoville, Crest Hill and Joliet warehouses, 30–40 miles from Chicago, have "No Juice", while Aurora, IL has it. The same holds for Clarksville TN, Wood Dale IL and Channahon IL. These jobs are open to people without a degree. | 2/5 (P3, P1) | [p3-10](../screenshots/persona-beta-2-18-24/p3-10-suburb-no-juice.png) | `data/cities.json` and the livability proxies (DQ-34) |
| IM-6 | **Give Amazon's ops jobs a role family.** 2,332 Amazon postings (1,310 with pay) have none: Area Manager (306), Area Manager II (275), Process Assistant (88), Onsite Medical Representative (76). They get no "Same role elsewhere" and don't appear in Compare companies. | 1/5 (P3) | [p3-07](../screenshots/persona-beta-2-18-24/p3-07-area-manager-drawer.png) | `public/features/roles.js` |
| IM-7 | **Show the posted hourly rate on full-time hourly cards**, for example "$31.21–46.87/hour", with the yearly figure under it. 2,965 big-tech postings are posted hourly. The card shows only the annualized "$65K–97K", and the rate sits under Details as "$31.21 and $46.87/hr", still missing a word. | 1/5 (P3) | [p3-04b](../screenshots/persona-beta-2-18-24/p3-04b-lead-genius-pay-details.png) | `public/app.js` (`payPill`, the "As posted" line) |
| IM-8 | **Faster Amazon on a phone.** At 4× CPU on the iPhone 13 mini (no network throttle, load 4–5): first cards 1.7 s, but the full list takes 7.1 s, a switch from Google 6.8 s, Insights 7.0 s, and a tap on Chart while Insights renders 1.4 s. | 2/5 (P1, P3) | §5 | `public/features/insights.js`, `public/app.js` (prepare), as in the lead log's perf gaps |
| IM-9 | **Small fixes:** | 4/5 | | `public/app.js`, `public/styles.css`, `public/features/compstimate.js`, `public/features/comps.js` |
| | - The Location chip opens the phone sheet with the Department section's search box on top; typing a city there gives "No matches" (P1). | | [p1-05a](../screenshots/persona-beta-2-18-24/p1-05a-location-sheet-other-search.png) | |
| | - The "Reopened where you left off" toast covers the Juice line in the drawer at 375 px (P1). | | [p1-07](../screenshots/persona-beta-2-18-24/p1-07-sde-intern-drawer.png) | |
| | - "Microsoft" breaks as "Micros / oft" in Compare companies at 1280 px (P2). | | [p2-20](../screenshots/persona-beta-2-18-24/p2-20-compare-companies.png) | |
| | - On the Pixel 8, the map's legend card covers the Chicago pin (P3). | | [p3-18](../screenshots/persona-beta-2-18-24/p3-18-map-juice.png) | |
| | - The Insights Location select lists about 300 places (P1, P4). | | | |
| | - A saved search lives "in this browser" only. Kacper's phone had nothing, but the copied link worked, so the toast could offer "Copy link" (P2). | | [p2-21](../screenshots/persona-beta-2-18-24/p2-21-phone-no-saved.png) | |

### Good (keep)

| # | What works | Who | Screenshot |
|---|---|---|---|
| GD-1 | **Honest about where pay is posted.** "Pay posted for the US only" and "No pay listed" on cards; "No pay posted for Zurich · 18 postings match; 4 list pay for another country only"; "Posted for the US, not Zurich" and "Posted for Italy, not London" in the drawer; "0% show pay for Zurich". | P4, P5 | [p4-01](../screenshots/persona-beta-2-18-24/p4-01-google-research-zurich.png), [p5-06](../screenshots/persona-beta-2-18-24/p5-06-razr-privacy-manager.png) |
| GD-2 | **Internship pay reads as posted, with its term:** "CA$120K/year · 12–14-week internship", "CA$9,150–10,170/month · 12-week internship". | P1, P2 | [p1-14](../screenshots/persona-beta-2-18-24/p1-14-google-canada-interns.png), [p1-16](../screenshots/persona-beta-2-18-24/p1-16-microsoft-canada-interns.png) |
| GD-3 | **Comparisons stay inside one country** and say so: "Sales & partnerships, every full-time level in Ireland"; "Posted pay in the US, by company"; "Nothing to compare yet in Canada". | P1, P2, P3, P4, P5 | [p2-15](../screenshots/persona-beta-2-18-24/p2-15-dublin-ae-same-role.png), [p4-11](../screenshots/persona-beta-2-18-24/p4-11-duo-compare-senior.png), [p5-12](../screenshots/persona-beta-2-18-24/p5-12-compare-policy-manager.png) |
| GD-4 | **Filters survive a company switch, and the toast says exactly what happened:** "Kept 'intern', Montreal, Toronto · dropped Waterloo (not at Microsoft) for now". An empty result offers "Remove the location filter" with the count it brings back. | All 5 | [p1-12](../screenshots/persona-beta-2-18-24/p1-12-google-kept.png), [p1-16](../screenshots/persona-beta-2-18-24/p1-16-microsoft-canada-interns.png) |
| GD-5 | **The Location search knows countries and local names:** Canada, Poland, Polska, Warszawa, Ireland, Zürich. | P1, P2, P4 | [p1-13](../screenshots/persona-beta-2-18-24/p1-13-location-canada.png), [p2-02](../screenshots/persona-beta-2-18-24/p2-02-location-poland.png) |
| GD-6 | **The salary box reads another currency and says what it understood:** "Min: PLN 150,000 ≈ $40K a year", "€40,000 ≈ $46K a year". | P2 | [p2-05](../screenshots/persona-beta-2-18-24/p2-05-salary-pln.png) |
| GD-7 | **Juice tax is right**, checked by hand for British Columbia (single), Poland (single), Ireland (single) and Illinois (married filing jointly, two child credits) (§5). The couple and family notes and the rent dates are where people read them. | P1, P2, P3 | [p1-11](../screenshots/persona-beta-2-18-24/p1-11-juice-monthly.png), [p2-09](../screenshots/persona-beta-2-18-24/p2-09-warsaw-ae-juice.png), [p3-08](../screenshots/persona-beta-2-18-24/p3-08-area-manager-family.png) |
| GD-8 | **It opens on big tech, and a cold visitor gets it in seconds:** Google first, "Beta: adds 7 big-tech careers sites", BIG TECH at the top of the menu. | All 5 | [cold-desktop](../screenshots/persona-beta-2-18-24/cold-desktop.png), [p1-02](../screenshots/persona-beta-2-18-24/p1-02-company-menu.png) |
| GD-9 | **Coming back works on every device it was saved on.** It reopens the last view at once (0.5–0.9 s), saved searches sit at the top of the menu, and a pasted link opens the exact view on another phone. | All 5 | [p1-23](../screenshots/persona-beta-2-18-24/p1-23-return-menu.png), [p2-22](../screenshots/persona-beta-2-18-24/p2-22-phone-pasted-link.png) |
| GD-10 | **Phones of every size work.** The razr cover screen (352x355) shows the search, chips, sheet, cards and a drawer with Apply. The iPhone 13 mini, the Pixel 8, the razr inner screen and the 812x375 landscape have no sideways scroll. Drawers open in 0.1–0.3 s. | P1, P3, P5 | [p5-03](../screenshots/persona-beta-2-18-24/p5-03-razr-cover-policy-list.png), [p5-04](../screenshots/persona-beta-2-18-24/p5-04-razr-cover-drawer.png) |
| GD-11 | **Google's job families and the Company list** make Google look like the other boards (Sales 461, Software Engineering 946; Google, YouTube, DeepMind). | P2, P4 | [p2-04](../screenshots/persona-beta-2-18-24/p2-04-department.png), [cold-desktop](../screenshots/persona-beta-2-18-24/cold-desktop.png) |
| GD-12 | **Apply goes to the official careers site** (amazon.jobs, google.com, metacareers.com, apply.careers.microsoft.com, jobs.apple.com), with Copy link beside it. | All 5 | [p1-07](../screenshots/persona-beta-2-18-24/p1-07-sde-intern-drawer.png) |

## 5. Replayable steps and checks

1. Copy the brief to `docs/process/prompts/persona-beta-2-18-24.md` (first commit, 22cf58c).
2. Serve the lead's build in the background with a timeout: `timeout 14400 node scripts/cycle/serve.mjs --dist <scratch>/cycle-beta7-dist --pid <scratch>/persona-beta-2-18-24/serve.pid`. It used port 45603. Stop it with `kill "$(cat <scratch>/persona-beta-2-18-24/serve.pid)"`.
3. The scripts are in `<scratch>/persona-beta-2-18-24/` and are not committed. Run each with `NODE_PATH=<scratch>/pw/node_modules node <script>`; Playwright is loaded through `createRequire`, since ESM ignores NODE_PATH.
   - `lib.mjs`: launch with Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; every non-local request is aborted. It holds the device sizes from phone-sizes.mjs and the screenshots.
   - `act.mjs`: switch company, search, open a chip, pick an option in a named filter section, Show N roles, set the phone sheet, open a card, read the drawer.
   - `dump.mjs`: writes `jobs.json`, all 37,619 big-tech postings.
   - The journeys are `p1a`–`p1e`, `p2a`–`p2e`, `p3a`–`p3d`, `p4a`–`p4d` and `p5a`–`p5c`. Each saves the browser storage so the next phase continues the same person, and writes `pN-steps.json` with timings.
   - Checks:
     - `chk-facet.mjs`, `chk2.mjs`: BN-1, counts against the true numbers;
     - `chk-locale.mjs`: BN-3;
     - `regress.mjs`, `famcount.mjs`: BF-4, BF-5 and BN-4, through `roleFamily`, `compsForJob` and `compsNote` in the page;
     - `chk3.mjs`, `chk4.mjs`: hourly pay;
     - `perf.mjs`: 4× CPU timings;
     - `duo.mjs`: the Duo hinge emulation, which isn't available (§6).
4. Phone mechanics: a quick chip opens the Filters sheet at its section, and "Show N roles" confirms it. The results are a bottom sheet, and a tap on `#sheetHandle` cycles peek, half and full.

Numbers checked by hand:
- **P1, British Columbia, single, CA$100,810** (1.396 CA$ per US$).
  - Federal tax: 14% to CA$58,523, then 20.5%, minus the basic amount credit, is about CA$13,700 (US$9,800). The drawer says $9,600.
  - BC tax: 5.06% and 7.7%, minus its credit, is about CA$5,800 (US$4,150). The drawer says $4,000.
  - CPP, CPP2 and EI: about CA$5,770 (US$4,130). The drawer says $4,100.
- **P2, Poland, single, PLN 465,500.**
  - ZUS: pension and disability capped at PLN 282,600, plus sickness, is about PLN 43,200.
  - PIT: 12% and 32%, minus the PLN 3,600 credit, is about PLN 106,600 (US$28.6K a year, $2,380 a month). The drawer says income tax $2,350 a month.
  - Health (9%) and ZUS together: about PLN 81,200 (about $1,815 a month). The drawer says social security $1,790.
- **P2, Ireland, single, €99,000.**
  - Income tax: 20% on €44,000 and 40% on the rest, minus €4,000 of credits, plus USC, is about €30,760 (US$35.4K). The drawer says $35,400.
  - PRSI: 4.2% is about €4,160 ($4,800), as shown.
- **P3, Illinois, married filing jointly, $80,450.**
  - Federal: $48,250 taxable after the $32,200 deduction gives $5,294, minus $4,400 of child credits, so $894 a year or $75 a month. The drawer says $70.
  - Illinois: 4.95% after 4 exemptions is about $283 a month. The drawer says $280.
  - FICA: $513 a month. The drawer says $510.
- **BN-1:** the true counts are from loading the place alone with the same minimum: Dublin 137, Vancouver 178, Seattle 3,668, Sunnyvale 421.
- **BF-6:** CAD-paid postings with a "CAD" keyword: Google 0 of 72, Microsoft 0 of 54, Amazon 0 of 432, NVIDIA 0 of 10, Meta 0 of 7, Netflix 0 of 24.
- **BF-7:** every Apple Retail place outside the US was listed with its raw name. "Piazza Liberty, Italy" is now Milan, "Shinsaibashi, Japan" is Osaka, and so on. Google's Irish places are "Dublin, Ireland" only.
- **IM-6:** postings with no role family (`roleFamily` is null): Amazon 2,332, of which 1,310 have pay; Apple 359; Microsoft 167; Google 146; NVIDIA 89; Netflix 60; Meta 21.

Timings:
- At normal speed, with load averages of 3.5–14.5:
  - first cards on a cold load: 0.4–1.6 s;
  - switches: 0.6–1.2 s, Amazon 2.4–2.8 s;
  - drawers: 0.1–0.4 s;
  - Insights: 0.3–1.5 s;
  - a return visit: 0.5–0.9 s.
- At 4× CPU on the iPhone 13 mini, with no network throttle (load 4.0–5.0):
  - Amazon cold: first cards 1.7 s, full list 7.1 s;
  - search "area manager": 2.4 s;
  - Insights: 7.0 s;
  - a tap on Chart while Insights renders: 1.4 s;
  - a switch from Google to Amazon: 6.8 s.

## 6. Known gaps and follow-ups

- I wrote no failing tests, because this role owns only the log, the prompt and the screenshots. These are easy to encode:
  - **BN-1:** with `l=Warsaw&smin=40000` on Google, the 'l' facet count for Dublin equals the count with `l=Dublin&smin=40000`.
  - **BN-2:** with one foreign currency in view, the stats line's median is not a bare "$" figure.
  - **BN-3:** under `de-CH` and `pl-PL` the stats line holds the count once.
  - **BN-4:** `roleFamily('Electrical Subject Matter Expert', { department: 'Data Center Operations' })` is not `ai-training`.
- **Surface Duo hinge:** the CSS splits the layout with `horizontal-viewport-segments`, but this Chromium has no `Emulation.setDisplayFeaturesForTesting`. So the 1114x720 run is the plain wide layout, not the hinge layout, and I couldn't check what falls on the hinge.
- Human step times are my estimates; only the app's own times were measured, on a shared machine (load up to 14.5).
- Not tested:
  - a saved search's "N new" count (it needs two snapshot days);
  - Add board;
  - keyboard-only use;
  - WebKit (every run here was Chromium).

## 7. Change log

- 2026-10-23, 21:07–21:58 UTC:
  - served the e800c43 beta build and dumped the 7 big-tech boards;
  - ran the five journeys on 8 screen sizes;
  - found and confirmed BN-1 to BN-4 and sent them to the lead as confirmed;
  - re-checked wave 1's BF-1 to BF-7 and IM-1 to IM-10;
  - measured 4× CPU phone timings;
  - wrote this log and shrank the screenshots.
