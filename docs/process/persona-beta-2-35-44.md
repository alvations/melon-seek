# Persona review, wave 2: job seekers aged 35–44 (beta site)

## State

- 2026-10-23 21:45 UTC: **done.** All five people ran on the lead's build. Wave 1's B1 to B5 were re-checked, and
  all five are fixed. Two new "Broken, fix now" items (PB-1, PB-2) went to the lead by SendMessage at 21:38. The log,
  the prompt and 121 shrunk screenshots are committed. The server is stopped.
- Nothing is left to do in this lane.

## 1. Brief

Prompt: [prompts/persona-beta-2-35-44.md](prompts/persona-beta-2-35-44.md). This is the second persona wave on
`/melon-seek/beta/`. It comes after fix waves 3 to 5 and QA round 4.
- **Build:** the lead's `cycle-beta7-dist`, made from e800c43, the deployed head. This worktree's base is 2474fc4, so
  product files are cited from e800c43.
- **Data:** the 2026-10-16 crawl. Amazon 22,179, Apple 4,851, Google 3,821, Meta 1,208, Microsoft 2,435, NVIDIA 2,711,
  Netflix 414.
- **Method:** five people aged 35 to 44, one per career level, each did a real job hunt in Chromium (Playwright). The
  phones and postures are spread over test/e2e/phone-sizes.mjs.
- **Files owned:** this file, the prompt copy and `docs/screenshots/persona-beta-2-35-44/` (121 PNGs, 6.7 MB after
  shrinking). No product code was edited.

| # | Person | Level | City, country | Household | Field | Device (CSS px) | Goal reached? |
|---|---|---|---|---|---|---|---|
| 1 | Tomasz Kowalczyk, 39 | New graduate (career changer) | Warsaw, Poland | Family of 4 (wife is a nurse) | Engineering | Pixel 8, 412×915, pl-PL | **Partly**: roles yes, money no |
| 2 | Giulia Romano, 36 | Early career (3 yrs), returning parent | Milan, Italy | Single mother, son of 8 | Operations | iPhone 13 mini, 375×812, then landscape 812×375, it-IT | **Partly**: roles yes, money no, no part-time |
| 3 | Lauren Kim, 38 | Mid-career (7 yrs) | Seattle, US | Couple (husband retraining, no income) | Research (UX) | Desktop 1440×900 | **Yes**, levels only partly |
| 4 | Rahul Mehta, 44 | Staff / principal (18 yrs) | Toronto, Canada | Family of 4 (wife works part-time) | Engineering (ML / software) | Laptop 1280×800, then Surface Duo spanned 1114×720 | **Partly** |
| 5 | Siân Davies, 43 | Director (19 yrs) | London, UK | Family of 4 (husband freelance) | Sales / partnerships | Motorola razr inner 412×1005, then the cover screen 352×355 | **Partly** |

The step tables give person time: clicks plus reading, estimated per step. Machine times were measured, with no
fixed waits inside the timed span. Other reviewers shared the 4-CPU machine, so the load average (`uptime`) was
3.2–11.8 during these runs. Times measured under that load:

| What | Time |
|---|---|
| Cold first real card | 0.9–2.3 s |
| Amazon's 22,179 roles, first-page preview cards | 1.1 s |
| Amazon's 22,179 roles, full list | 3.5 s at load 3.2; 3.9–9.4 s at load 8–11 |
| Another big-tech board | 1.2–2.8 s |
| Opening a job | 0.58–1.27 s |
| Insights | 0.9 s |
| Map | 0.9–1.0 s |
| Reopening with saved state | 1.3–5.1 s |

Nothing felt slow, given the load.

## 2. Inputs and sources

- README.md, and docs/strategy/ROADMAP.md §8 (the UI simplicity budget).
- docs/process/lead.md from "Fix wave 5" on, at e800c43.
- Wave 1's findings, [persona-beta-35-44.md](persona-beta-35-44.md), which section 4 re-checks.
- The build's own lists, unpacked with the build's `api.js#unpackJobs`. They were used read-only, for goals and
  counts. Role families came from the build's `features/roles.js#roleFamily`, and posted text from
  `api/desc/<board>/<id>.json`.

## 3. Decisions

1. **Personas.** Five countries: Poland, Italy, the US, Canada and the UK. Three people are on phones (P1, P2, P5),
   plus P4's Duo leg.
   - The sizes are the Pixel 8, the iPhone 13 mini portrait and landscape, the razr inner and cover screens, and the
     Duo spanned. None is 390×844, as the lead's note asked.
   - Locale and time zone match each person (pl-PL, it-IT, en-US, en-CA, en-GB), so dates and numbers read as on
     their own phone.
   - Goals were set from the data before the runs: a city and field each board really hires in, with posted pay.
2. **Coming back later** is simulated with Playwright `storageState`. For P3 (a week later) and P5 (two weeks later,
   on the cover screen), the saved search's `lastSeenAt` was moved back, and 1 or 2 ids were dropped from its
   `seen` list and from `melon.seenIds.<board>`.
3. **Severity.** "Broken" means one of three things: a number or label is wrong or misleading, one of the user's
   stated rules is broken (here "pay is shown as posted"), or a task dead-ends. Counts come from the build's own
   lists.

## 4. Wave 1's findings now

| Wave 1 finding | Now | Evidence |
|---|---|---|
| **B1** Yearly intern pay labelled "Fixed-term pay, not a yearly salary … for about N weeks" | **Fixed.** Microsoft's Toronto intern reads "CA$43,800–50,000 a year · CAD · 26-week internship". Google's MBA intern reads "$96,000–125,000 a year · 12-week internship". Cards read "PLN 156K–159K/year · 13–17-week internship". Juice says "while it lasts" and explains the term | [r-01](../screenshots/persona-beta-2-35-44/r-01-microsoft-intern-drawer.png), [r-02](../screenshots/persona-beta-2-35-44/r-02-google-mba-intern-drawer.png), [p1-10](../screenshots/persona-beta-2-35-44/p1-10-intern-drawer.png) |
| **B2** "CAD" skill tag on Canadian-dollar pay | **Fixed.** 0 of 599 CAD-paid postings carry it. P4's Toronto cards show "Machine learning", "AWS" and "Security" | [p4-04](../screenshots/persona-beta-2-35-44/p4-04-amazon-toronto-staff.png) |
| **B3** Netflix distributed-systems engineers filed as hardware | **Fixed.** All 11 are software engineering | (count) |
| **B4** NVIDIA and Microsoft department abbreviations ("Mgmt, Sys SW") | **Fixed.** No abbreviated department names are left among NVIDIA's 142, Microsoft's 142, Amazon's 37 or Netflix's 31 | (count) |
| **B5** A country search in Location hides its cities | **Fixed.** "Poland" and "Polska" list Warsaw 66, Krakow 14 and Wrocław 8. "Italia" lists Milan 90 and 30 more. "Canada" lists Vancouver 182 and Toronto 175. "United Kingdom" lists London 45 and the rest. A city also finds the roles listed only for its country. A region ("Lombardia") still finds nothing | [p1-03](../screenshots/persona-beta-2-35-44/p1-03-location-poland.png), [p2-05](../screenshots/persona-beta-2-35-44/p2-05-location-italy.png), [p4-02](../screenshots/persona-beta-2-35-44/p4-02-location-canada.png) |
| I-2 Open the beta on big tech | **Fixed.** The beta opens on Google, with "Big tech" first in the menu. But the tagline no longer says what the site does (see Improve 6) | [p1-01](../screenshots/persona-beta-2-35-44/p1-01-cold-pixel8.png) |
| I-4 Role families instead of raw departments | **Fixed** for Google (27 job families) and NVIDIA (readable names) | [p3-01](../screenshots/persona-beta-2-35-44/p3-01-cold-desktop.png) |
| I-6 "Same role elsewhere" pools every location | **Fixed.** It reads "in Poland", "in Canada" and "in the US", or "Nothing to compare yet in Italy" | [p1-10](../screenshots/persona-beta-2-35-44/p1-10-intern-drawer.png), [p2-13](../screenshots/persona-beta-2-35-44/p2-13-account-drawer.png) |
| I-11 Name the stand-in city | **Fixed.** "Santa Clara uses San Jose's rent and living costs, the nearest city with cost data." | [r-03](../screenshots/persona-beta-2-35-44/r-03-nvidia-santa-clara-juice.png) |
| I-13 The Pay estimate ignores the search | **Fixed.** "It follows your filters …"; "Showing the most common role in your filters: “UX Researcher”" | [p3-10](../screenshots/persona-beta-2-35-44/p3-10-insights.png) |
| I-14 A card paid for another country doesn't say so | **Fixed.** "Pay posted for the US only" | [p5-10](../screenshots/persona-beta-2-35-44/p5-10-google-london-director.png) |
| I-15 The map pins co-listed cities under a Location filter | **Fixed.** Apple under an Austin filter shows only the Austin pin | [r-04](../screenshots/persona-beta-2-35-44/r-04-map-apple-austin.png) |
| I-16 Two different medians on the landing screen | **Fixed.** Both read $199K | [p3-01](../screenshots/persona-beta-2-35-44/p3-01-cold-desktop.png) |
| I-17 "On-site" counted the same as "Any" | **Fixed.** On-site 3,753, Any 3,821 | [p1-03](../screenshots/persona-beta-2-35-44/p1-03-location-poland.png) |
| I-19 "Dublinas"; pills mixing two number formats | "Dublinas" is **fixed** (0 left). The formats: the drawer is exact for fixed-term pay but rounded for yearly salaries, which is now **PB-2** | [r-05](../screenshots/persona-beta-2-35-44/r-05-posted-amazon-10448661.png) |
| I-7 Explain levels | **Partly.** "What the levels mean" gives one line ("Staff+ means staff, principal and above"). Microsoft shows Pay by place. There is still no map between companies' levels, and Meta's postings are "Level not stated" | [p4-08](../screenshots/persona-beta-2-35-44/p4-08-levels-explained.png) |
| I-9 Rank pay against the same level | **Partly.** The rank is now within the person's country ("Pays more than 14% of Google's roles in Poland" on an entry role), but not within the level | [p1-13](../screenshots/persona-beta-2-35-44/p1-13-tse-drawer.png) |
| I-18 Part-time | **Partly.** Amazon (128) and Apple (103) now have Part-time in Employment type. None is in Milan | [p2-06](../screenshots/persona-beta-2-35-44/p2-06-employment-type.png) |
| I-1 One search across all companies | **Open** | Improve 3 |
| I-3 More households | **Open** | Improve 2 |
| I-5 Local currency | **Open** | Improve 1 |
| I-8 Juice for roles listed by country only | **Open** | Improve 5 |
| I-10 Phone chart half empty | **Open** | Improve 6 |
| I-12 Tax wording outside the US | **Open** | Improve 4 |

## 5. The five people

### 5.1 Tomasz Kowalczyk, 39, Warsaw: new graduate (Pixel 8, Polish phone)

**Who.** Twelve years as a logistics coordinator. He has just finished a part-time master's in computer science.
He is married with two children; his wife is a nurse. Field: software engineering.

**Goal.** "An internship, graduate or entry-level software role in Warsaw at Google, NVIDIA, Microsoft or Amazon,
paying at least PLN 150,000 a year, that leaves my family of four at least PLN 3,000 a month."

**Reached? Partly.** He found roles: 9 Google roles in Warsaw at PLN 156K–287K and 5 NVIDIA internships at
PLN 118K–204K. The money doesn't work:
- The best entry role he qualifies for (no PhD) is Technical Solutions Engineer I at PLN 252K–258K. It leaves a
  one-earner family of four **−$650 a month**, about −PLN 2,400.
- His wife's pay can't be added.
- Every Juice figure is in US dollars.
- Microsoft and Amazon have nothing at intern or entry level in Warsaw.

| Step | What he did and saw | Time |
|---|---|---|
| 1 | Cold arrival on his phone. The first real card is in 1.98 s at load 5.0. He sees "Google", "16 paź", "melon·seek · Beta: adds 7 big-tech careers sites", "$199K base pay median (US)" and Google's job families as dots. The roles sit in a closed sheet, so no job shows above the fold. He taps "16 paź" and gets "Where this data comes from": "Snapshot · 16 paź" next to "Fetched Oct 16, 2026, 12:04 UTC", two date formats in one box. ([p1-01](../screenshots/persona-beta-2-35-44/p1-01-cold-pixel8.png), [p1-02](../screenshots/persona-beta-2-35-44/p1-02-badge.png)) | 0:00–0:40 |
| 2 | He taps the Location chip and the filter sheet opens there. He types "Poland" and sees POLAND: Warsaw 66, Krakow 14, Wrocław 8. "Polska" and "Warszawa" work too. He ticks Warsaw. ([p1-03](../screenshots/persona-beta-2-35-44/p1-03-location-poland.png), [p1-04](../screenshots/persona-beta-2-35-44/p1-04-location-warsaw.png)) | 0:40–1:20 |
| 3 | Under Seniority he ticks Intern 4 and Entry 6, then "Show 10 roles". The chart has five rows, the axis is $0–100K, and the stats line says "$69K base pay median". The bottom half of the screen is blank above the closed list. ([p1-05](../screenshots/persona-beta-2-35-44/p1-05-seniority.png), [p1-06](../screenshots/persona-beta-2-35-44/p1-06-google-warsaw-chart.png)) | 1:20–2:10 |
| 4 | In Salary, he types "150 000 zł" the Polish way and is told "“150 000 zł” isn't a pay figure. Try 80k, $120,000 or £80,000." "150000 zł", "150.000 zł" and "150k zł" fail too. "PLN 150000" works: "Min: PLN 150,000 ≈ $40K a year". The box and chip then read "$40K" and "$40K+", so his own figure is gone. A bare "150000" is read as $150,000 and leaves 4 roles of 60. ([p1-07](../screenshots/persona-beta-2-35-44/p1-07-salary-zloty.png), [p1-08](../screenshots/persona-beta-2-35-44/p1-08-salary-pln.png), [r-09](../screenshots/persona-beta-2-35-44/r-09-salary-bare-number-warsaw.png)) | 2:10–3:30 |
| 5 | He taps the handle twice (half, then full). Of 9 cards, four "Early Careers, PhD" roles are at PLN 280K–287K. Next are Product Manager I and TSE I at PLN 252K–258K, and the internships "PLN 210K/year · 13–17-week internship". Every card is "Dry" or "Rind". One intern card has no "/year" ("Data Science PhD Intern PLN 192K"). The Media Account Specialist intern is filed under "No department". ([p1-09](../screenshots/persona-beta-2-35-44/p1-09-sheet-open.png)) | 3:30–4:30 |
| 6 | He opens the SRE BS/MS intern (0.64 s). The pay reads "PLN 156,000–159,000 a year · 13–17-week internship ≈ $41K–42K". "Same role elsewhere: Software engineering internships in Poland" shows NVIDIA $43K. Juice for Family, Monthly: **−$1,750/mo** while it lasts, with "Tax is worked out as if the pay lasted a year". ([p1-10](../screenshots/persona-beta-2-35-44/p1-10-intern-drawer.png), [p1-11](../screenshots/persona-beta-2-35-44/p1-11-juice-family.png)) | 4:30–6:00 |
| 7 | He opens TSE I at PLN 252K–258K. It says "Pays more than 14% of Google's roles in Poland". The Family figure is **−$650/mo**, and rent is a 3-bedroom in the city centre at $1,900. The note reads "Family here means one earner, taxed as a single filer". He can't add his wife's salary or choose a cheaper area. ([p1-13](../screenshots/persona-beta-2-35-44/p1-13-tse-drawer.png), [p1-14](../screenshots/persona-beta-2-35-44/p1-14-tse-juice-family.png)) | 6:00–7:30 |
| 8 | Apply reads "Apply on Google's careers site · google.com" and opens a new tab. ([p1-12](../screenshots/persona-beta-2-35-44/p1-12-apply.png)) | 7:30–7:45 |
| 9 | Switching to NVIDIA takes 1.43 s, with the toast "Kept $40K+, Warsaw, Intern +1". There are 5 interns at PLN 118K–204K, all "0 · Rind". The drawer says "Nothing to compare yet in Poland": Google has only 2 such internships there, and a comparison needs 3. Microsoft and Amazon have 0 roles; the empty states offer "Without the level filter: 3 roles" and "17 roles". ([p1-16](../screenshots/persona-beta-2-35-44/p1-16-nvidia.png), [p1-18](../screenshots/persona-beta-2-35-44/p1-18-nvidia-intern-drawer.png), [p1-17](../screenshots/persona-beta-2-35-44/p1-17-amazon-list.png)) | 7:45–9:00 |
| 10 | Back on Google, Insights takes 0.88 s. The Pay estimate for "Software Engineer · Warsaw · Intern or Entry" is "$75K US dollars a year, Medium confidence, 5 similar roles". All five are PhD Early Careers roles, and he has a master's. ([p1-19](../screenshots/persona-beta-2-35-44/p1-19-insights.png)) | 9:00–10:00 |
| 11 | He saves, and the toast reads "Saved in this browser. Find it in the company menu…". The name is "Google · $40K+ · Intern · Entry +1", with Warsaw hidden under "+1". Next day the bare address reopens his Warsaw view. ([p1-21](../screenshots/persona-beta-2-35-44/p1-21-saved.png)) | 10:00–10:30 |

Total: about 10.5 minutes.
- **Words he didn't know:** "Juice", "Rind" and "Dry"; "Clusters" and "Ranges"; the "‹2" and "›13" chips on the chart
  rows; "No department".
- **Numbers he wouldn't trust:** everything after the salary box is in dollars. A $75K estimate built from PhD roles.

### 5.2 Giulia Romano, 36, Milan: early career, returning parent (iPhone 13 mini)

**Who.** Three years as a logistics coordinator, then five years at home. She is a single mother of an 8-year-old.
Field: operations and account management.

**Goal.** "An operations or account role at Amazon in Milan, part-time if possible, paying at least €35,000, that
leaves me and my son at least €600 a month."

**Reached? Partly.** She found roles: 54 Amazon Milan roles at €35,000 or more, and 7 account roles, among them
"Account Manager, Amazon Vendor Services", posted at €46,400. The rest of her goal fails:
- Milan has no part-time roles.
- There is no "parent and one child" household. Even "Couple" (2 adults, one earner, 2 bedrooms) leaves
  **−$1,430/mo**.
- Her €35,000 floor quietly hid 35 roles posted as "from €X" (PB-1).

| Step | What she did and saw | Time |
|---|---|---|
| 1 | Cold arrival, with the first card in 1.27 s. On the 375 px screen only the "Beta" tag shows at top left, not the logo. The tagline reads "melon·seek · Beta: adds 7 big-tech careers sites". ([p2-01](../screenshots/persona-beta-2-35-44/p2-01-cold-mini.png)) | 0:00–0:20 |
| 2 | She opens the company menu and picks Amazon. The first-page preview shows real cards in 1.1 s under "Loading 22.179 roles…", and the full list arrives at 3.5 s (load 3.2). ([p2-02](../screenshots/persona-beta-2-35-44/p2-02-company-menu.png), [p2-03](../screenshots/persona-beta-2-35-44/p2-03-amazon-loading.png), [p2-04](../screenshots/persona-beta-2-35-44/p2-04-amazon.png)) | 0:20–0:50 |
| 3 | In Location, "Italia" gives ITALY: Milan 90, Torrazza Piemonte 18 and more. "Milano" works. "Lombardia" finds nothing. She ticks Milan. Employment type offers only "Full-time 90". ([p2-05](../screenshots/persona-beta-2-35-44/p2-05-location-italy.png), [p2-06](../screenshots/persona-beta-2-35-44/p2-06-employment-type.png)) | 0:50–1:50 |
| 4 | She types "35.000 €" the Italian way and gets "Min: €35,000 ≈ $40K a year". "Show 54 roles". The note says "4 roles hidden by the pay filter". 36 roles went, and 35 of them are "from €X" minimums under €35K, which the note doesn't count (PB-1). The chip reads "$40K+". ([p2-07](../screenshots/persona-beta-2-35-44/p2-07-salary-italian.png), [p2-11](../screenshots/persona-beta-2-35-44/p2-11-pay-filter-details.png)) | 1:50–3:00 |
| 5 | The stats line says "$61K base pay median". Insights later explains that only 9 of the 54 count: "45 roles posting a stated minimum … left out of pay figures". The cards read "from €89K", "from €76K" and "€71K" (posted €71,200). ([p2-09](../screenshots/persona-beta-2-35-44/p2-09-amazon-milan-chart.png), [p2-10](../screenshots/persona-beta-2-35-44/p2-10-amazon-milan-list.png)) | 3:00–4:00 |
| 6 | Search "account" gives 7 roles. She opens "Account Manager, Amazon Vendor Services" (0.84 s). The headline is "**€46K** · EUR · per year", with "One number, not a range" and "Posted base pay". The posting itself says "[Italy] - [46,400 EUR] gross annually" (PB-2). It also says "Pays more than 66% of Amazon's roles in Italy" and "Same role elsewhere: Nothing to compare yet in Italy". ([p2-12](../screenshots/persona-beta-2-35-44/p2-12-account-list.png), [p2-13](../screenshots/persona-beta-2-35-44/p2-13-account-drawer.png)) | 4:00–5:30 |
| 7 | Juice reads "0 · Rind, −$700/yr for one person". She picks Couple as the nearest to her household and gets **−$1,430/mo**. The rent is a 2-bedroom in the city centre at $2,250. The tax rows say "state or local tax $90" and "Couple here means one earner; each person is taxed separately here." All of it is in dollars. ([p2-14](../screenshots/persona-beta-2-35-44/p2-14-juice-couple.png)) | 5:30–7:00 |
| 8 | She turns the phone to landscape (812×375). The job page reflows, and Apply stays pinned at the bottom ("Apply on Amazon's careers site · amazon.jobs", new tab). ([p2-15](../screenshots/persona-beta-2-35-44/p2-15-landscape-drawer.png), [p2-16](../screenshots/persona-beta-2-35-44/p2-16-landscape-apply.png)) | 7:00–7:30 |
| 9 | The map shows one Milan pin at $61K (0.88 s). In Insights, the Pay estimate for "Account Manager · Milan (88)" is "$42K, Medium confidence, 12 similar roles, typically within ±10%". ([p2-17](../screenshots/persona-beta-2-35-44/p2-17-map.png), [p2-18](../screenshots/persona-beta-2-35-44/p2-18-insights.png)) | 7:30–8:30 |
| 10 | She saves. The next visit reopens Amazon · Milan in 3.1 s. ([p2-20](../screenshots/persona-beta-2-35-44/p2-20-saved.png)) | 8:30–9:00 |

Total: about 9 minutes.
- **Words she didn't know:** "Juice" and its grades; "Clusters"; "state or local tax" (Italy has a regional
  surcharge); "One number, not a range".
- **Numbers she wouldn't trust:** "€46K" for €46,400. "4 roles hidden" when 36 went. A $61K median "of 9 ranges"
  over 54 roles.

### 5.3 Lauren Kim, 38, Seattle: mid-career (desktop)

**Who.** Seven years in UX research, the last three as a senior researcher at a retailer. She is married, and her
husband is retraining with no income, so "Couple" (one earner) fits her household.

**Goal.** "A senior UX research role in the Seattle area (Seattle, Bellevue, Redmond) at Meta, Amazon, Microsoft
or Google, base at least $165K, leaving the two of us at least $6,000 a month, and knowing how the companies'
levels compare."

**Reached? Yes**, with levels only partly. These roles meet her goal:

| Role | Pay | Left for a couple |
|---|---|---|
| Meta "UX Researcher, Quantitative" (Bellevue and Seattle) | $164K–227K, or $193K–266K | $9,370/mo |
| Amazon "Sr. UX Researcher" | $152K–206K | $6,200/mo |
| Microsoft "Principal UX Researcher", Redmond | $143K–275K | $7,530/mo |

The site can't tell her what level Meta's postings are ("Level not stated"). Its "Design" comparison mixes
researchers with creative and motion designers.

| Step | What she did and saw | Time |
|---|---|---|
| 1 | Cold arrival, with the first card in 0.92 s. Google's job families are on the chart. The stats line reads "3,821 roles · 66% show pay · $199K base pay median (US)". The list header reads "🍉 Juice: what's left after tax and rent". ([p3-01](../screenshots/persona-beta-2-35-44/p3-01-cold-desktop.png)) | 0:00–0:15 |
| 2 | She searches "UX researcher": 10 roles, $132K–329K. In the Location popover, only places with matches are listed (Seattle 2), so she ticks Seattle. ([p3-02](../screenshots/persona-beta-2-35-44/p3-02-google-ux-researcher.png), [p3-03a](../screenshots/persona-beta-2-35-44/p3-03a-location-popover.png), [p3-03](../screenshots/persona-beta-2-35-44/p3-03-google-seattle.png)) | 0:15–1:15 |
| 3 | She goes through the companies with her search kept ("Kept “UX researcher”, Seattle"). Meta has 2 (1.47 s) and Amazon 2 (2.76 s). Microsoft has 0, and the empty state says "Without the search “UX researcher”: 305 roles". The side panel shows her role is in Redmond. Apple has 0. ([p3-04 Meta](../screenshots/persona-beta-2-35-44/p3-04-meta-seattle.png), [p3-04 Microsoft](../screenshots/persona-beta-2-35-44/p3-04-microsoft-seattle.png)) | 1:15–3:00 |
| 4 | Meta "UX Researcher, Quantitative" is $193K–266K, "Level not stated", "Pays more than 76% of Meta's roles in the US". "Same role elsewhere: Design, every full-time level in the US" puts Netflix first at $365K. Those 3 Netflix postings are creative, motion and art-direction roles. Juice for Couple, Monthly: **$9,370/mo** in Seattle. Compare locations: Bellevue $9,040, New York $5,790. ([p3-05](../screenshots/persona-beta-2-35-44/p3-05-meta-drawer.png), [p3-06](../screenshots/persona-beta-2-35-44/p3-06-meta-juice-couple.png), [p3-07](../screenshots/persona-beta-2-35-44/p3-07-meta-compare-locations.png)) | 3:00–5:00 |
| 5 | Amazon "Senior UX Researcher Mixed Methods" says "Posted as “Sr. UX Researcher …”", $152K–206K, Senior, **$6,200/mo** for a couple. ([p3-08](../screenshots/persona-beta-2-35-44/p3-08-amazon-drawer.png)) | 5:00–6:00 |
| 6 | On Microsoft she adds Redmond. "Principal UX Researcher" is $143K–275K, "Posted for Redmond", with "Pay by place: Redmond $143K–275K · Mountain View, New York $188K–304K". Staff+. **$7,530/mo** for a couple in Redmond. ([p3-09](../screenshots/persona-beta-2-35-44/p3-09-microsoft-drawer.png)) | 6:00–7:00 |
| 7 | Insights → Compare companies → Design (12 companies), every level: Netflix $365K, Anthropic $345K … Meta $203K, Google $194K, Amazon $162K. The Level list offers Senior (6 companies) and Staff+ (3). Nothing maps Meta's or Google's levels to Microsoft's "Principal". ([p3-10](../screenshots/persona-beta-2-35-44/p3-10-insights.png), [p3-11](../screenshots/persona-beta-2-35-44/p3-11-compare-companies.png)) | 7:00–8:30 |
| 8 | Map (1.0 s): Bellevue 2 and Seattle 2. On Meta, "Apply on Meta's careers site · metacareers.com" opens a new tab (noopener). "Link copied". ([p3-12](../screenshots/persona-beta-2-35-44/p3-12-map-seattle-area.png), [p3-13](../screenshots/persona-beta-2-35-44/p3-13-meta-apply.png)) | 8:30–9:15 |
| 9 | She saves. A week later (simulated), the page reopens in 1.3 s with "Reopened where you left off: Meta · “UX researcher” · Seattle · Redmond +1". The menu says "1 new", and the card is marked New. ([p3-14](../screenshots/persona-beta-2-35-44/p3-14-saved.png), [p3-15](../screenshots/persona-beta-2-35-44/p3-15-return-menu.png), [p3-16](../screenshots/persona-beta-2-35-44/p3-16-return-list.png)) | 9:15–10:00 |

Total: about 10 minutes, about 2 of them switching companies.
- **Words she didn't know:** "Juice" grades, "Staff+".
- **Numbers she wouldn't trust:** Netflix $365K as "Design" next to UX research roles.

### 5.4 Rahul Mehta, 44, Toronto: staff / principal (laptop, then Surface Duo)

**Who.** Eighteen years in software and machine learning; now a staff engineer at a Canadian bank. He is married
with two children, and his wife works part-time. Field: engineering.

**Goal.** "A Staff or Principal software or ML role in Toronto or Vancouver at big tech, base at least C$220,000,
that leaves my family of four at least C$6,000 a month, and a fair comparison of Staff pay across the companies."

**Reached? Partly.**
- **The role:** Amazon "Principal Software Engineer, MADS" (CA$185K–310K, Toronto) leaves **$4,270/mo**, about
  C$5,900, just short. His wife's pay can't be added.
- **The comparison:** there is no Staff comparison across companies in Canada. Compare companies shows one company
  (Microsoft).
- **The other boards:** Google's Staff roles are in Waterloo. Meta, Netflix and NVIDIA have nothing at Staff+.
- **Coming back:** a reload silently dropped Vancouver from his search.

| Step | What he did and saw | Time |
|---|---|---|
| 1 | Cold laptop, with the first card in 2.28 s at load 8.4. He picks Amazon (3.9 s): "22,179 roles · 63% show pay · $152K base pay median (US)". ([p4-01](../screenshots/persona-beta-2-35-44/p4-01-cold-laptop.png)) | 0:00–0:30 |
| 2 | In Location, "Canada" lists Vancouver 182, Toronto 175, Montreal 30 and more. "Ontario" gives Ontario, California (84) and "Ontario, Canada 1". He ticks Toronto and Vancouver, then Staff+. ([p4-02](../screenshots/persona-beta-2-35-44/p4-02-location-canada.png)) | 0:30–1:30 |
| 3 | He types "C$220,000" in Salary and gets "Min: CA$220,000 ≈ $158K a year". The chip reads "$158K+". 10 roles. ([p4-03](../screenshots/persona-beta-2-35-44/p4-03-salary-cad.png), [p4-04](../screenshots/persona-beta-2-35-44/p4-04-amazon-toronto-staff.png)) | 1:30–2:30 |
| 4 | "Principal Software Engineer, MADS" is CA$185K–310K, "Pays more than 98% of Amazon's roles in Canada". "Same role elsewhere: Software engineering, Staff+ level in Canada" shows one bar: Microsoft 3, $143K, on a $137.5K–150K axis. ([p4-05](../screenshots/persona-beta-2-35-44/p4-05-amazon-principal-drawer.png)) | 2:30–3:45 |
| 5 | Juice for Family, Monthly: **$4,270/mo** in Toronto, in US dollars, so he converts it himself. The tax rows say "state or local tax $2,010" (it's Ontario's) and "Family here means one earner; each person is taxed separately here." ([p4-06](../screenshots/persona-beta-2-35-44/p4-06-juice-family-toronto.png)) | 3:45–5:15 |
| 6 | Microsoft (1.45 s): 15 roles, among them "Principal Software Engineer" CA$142K–258K in Vancouver ($29,400 a year for the family). "Enterprise Architect · Ontario, Canada" has no Juice. Google has 0 ("Without the level filter: 2 roles"). On Meta the toast says "dropped Vancouver (not at Meta) for now". The result is 0 roles and only "Clear filters", with no hint about which filter to drop. Meta's one Toronto engineering role, CA$160K–213K, is posted as Mid. Netflix "put back Vancouver" and has 0; NVIDIA has 0. ([p4-07 Microsoft](../screenshots/persona-beta-2-35-44/p4-07-microsoft.png), [p4-07 Meta](../screenshots/persona-beta-2-35-44/p4-07-meta.png), [p4-09](../screenshots/persona-beta-2-35-44/p4-09-msft-principal-drawer.png)) | 5:15–7:00 |
| 7 | The next morning the laptop reopens NVIDIA with **Toronto only**. Vancouver, dropped "for now", is gone for good, and Microsoft now says just "Kept $158K+, Toronto, Staff+". He adds it back. ([p4-07b](../screenshots/persona-beta-2-35-44/p4-07b-reopen-vancouver-lost.png)) | 7:00–7:40 |
| 8 | "What the levels mean": "Staff+ means staff, principal and above. Director+ means director, head of, vice president and above." That's all. Compare companies in Canada → Software engineering → Staff+ (1 company) shows only Microsoft, at $143K. "Not shown: Google and Amazon (fewer than 3 postings with pay)". ([p4-08](../screenshots/persona-beta-2-35-44/p4-08-levels-explained.png), [p4-12](../screenshots/persona-beta-2-35-44/p4-12-compare-swe-staff.png)) | 7:40–9:00 |
| 9 | Ranges view. The bars sit on "Yearly pay, US dollars (converted)" and the labels are cut ("Principal Software Engineer, M…"). ([p4-10](../screenshots/persona-beta-2-35-44/p4-10-ranges.png)) | 9:00–9:30 |
| 10 | He saves the Amazon search. Later, on his Surface Duo spanned (1114×720), it reopens in 5.1 s (load ~8) with no sideways scroll, and the saved search is first in the menu. The job page opens on the right screen (x 554–1114) with its content right of the hinge, the chart on the left. ([p4-13](../screenshots/persona-beta-2-35-44/p4-13-duo-spanned-return.png), [p4-14](../screenshots/persona-beta-2-35-44/p4-14-duo-menu.png), [p4-15](../screenshots/persona-beta-2-35-44/p4-15-duo-drawer.png)) | 9:30–10:30 |

Total: about 10.5 minutes.
- **Words he didn't know:** "MADS" (Amazon's own), "Juice" grades.
- **Numbers he wouldn't trust:** "state or local tax" in Ontario. A one-company "comparison". "$143K" as
  Microsoft's Staff+ median for Canada, against Amazon's CA$185K–310K, which isn't shown.

### 5.5 Siân Davies, 43, London: director (Motorola razr, inner then cover screen)

**Who.** Nineteen years in partnerships and enterprise sales, now director of partnerships at a UK software
company. She is married with two teenagers; her husband is a freelance photographer. Field: sales.

**Goal.** "A Director or Head of sales or partnerships role in London at Microsoft, Google, Amazon or Meta, base at
least £150,000, that leaves our family at least £4,000 a month, and what each company pays its directors."

**Reached? Partly.**
- **The roles:** Microsoft has 3 director roles at £100K–202K. The best, "EMEA Channel Partner Sales Director"
  (£120K–202K), leaves **$3,060/mo**, about £2,280, for a one-earner family of four.
- **No Juice for the other good lead:** "Sales Director- ISVs" (£120K–202K) is listed for "United Kingdom" only.
- **Other companies:** Google, Amazon, Meta and Apple post no director pay in London.
- **The comparison:** the UK comparison has one company.

| Step | What she did and saw | Time |
|---|---|---|
| 1 | Cold arrival on the inner screen, with the first card in 1.89 s at load 11. She picks Microsoft (1.88 s). ([p5-01](../screenshots/persona-beta-2-35-44/p5-01-cold-razr.png)) | 0:00–0:30 |
| 2 | In Location, "United Kingdom" and "England" list London 45, Cambridge 17, Reading 14 and more. "UK" lists UNITED STATES · Milwaukee 299 first. She ticks London; "A city also finds roles that list only its country or region". ([p5-02](../screenshots/persona-beta-2-35-44/p5-02-location-london.png)) | 0:30–1:30 |
| 3 | She ticks Director+ 3 and types "£150k": "Min: £150,000 ≈ $201K a year". The chip reads "$201K+". 3 roles. ([p5-03](../screenshots/persona-beta-2-35-44/p5-03-salary-gbp.png), [p5-04](../screenshots/persona-beta-2-35-44/p5-04-msft-london-director-chart.png), [p5-05](../screenshots/persona-beta-2-35-44/p5-05-msft-list.png)) | 1:30–2:30 |
| 4 | "Sales Director- ISVs" is £120K–202K, "The highest pay of Microsoft's roles in the UK". It shows "🍉 No Juice: the posting names no city", because it is listed for "United Kingdom" only. ([p5-06](../screenshots/persona-beta-2-35-44/p5-06-sales-director-uk-drawer.png)) | 2:30–3:30 |
| 5 | "EMEA Channel Partner Sales Director" is £120K–202K in London and Issy-les-Moulineaux. Family, Monthly: **$3,060/mo**, with "Family here means one earner; each person is taxed separately here." ([p5-07](../screenshots/persona-beta-2-35-44/p5-07-channel-director-drawer.png), [p5-08](../screenshots/persona-beta-2-35-44/p5-08-juice-family-london.png)) | 3:30–5:00 |
| 6 | With filters kept, Google, Amazon (9.4 s at load 11), Meta and Apple each show 0 roles. The empty states offer "Without the pay filter: 4 / 7 / 1 / 2 roles" and she takes Google's. Its cards say "No pay listed" or "Pay posted for the US only". "Head of Sales, Agentic Data Cloud" says "No pay listed · No pay estimate either". ([p5-09](../screenshots/persona-beta-2-35-44/p5-09-google.png), [p5-10](../screenshots/persona-beta-2-35-44/p5-10-google-london-director.png), [p5-11](../screenshots/persona-beta-2-35-44/p5-11-google-head-of-sales-drawer.png)) | 5:00–6:30 |
| 7 | Compare companies, UK, Sales & partnerships (1 company): only Microsoft, at $155K–200K. The Level list has only "Every full-time level" and "Staff+". ([p5-13](../screenshots/persona-beta-2-35-44/p5-13-compare-sales-uk.png)) | 6:30–7:15 |
| 8 | She saves the Microsoft search. ([p5-14](../screenshots/persona-beta-2-35-44/p5-14-saved.png)) | 7:15–7:30 |
| 9 | Two weeks later (simulated) she flips the phone shut and checks the cover screen (352×355). It opens in 2.0 s with no sideways scroll. The menu says "Microsoft · $201K+ · Director+ · London · 2 new". One tap shows "2 new roles since you last opened this search — listed first, marked New". That toast covers the first card's pay for a few seconds. One card fits per screen, and the job page is readable. ([p5-15](../screenshots/persona-beta-2-35-44/p5-15-cover-return.png), [p5-16](../screenshots/persona-beta-2-35-44/p5-16-cover-menu.png), [p5-18](../screenshots/persona-beta-2-35-44/p5-18-cover-list.png), [p5-19](../screenshots/persona-beta-2-35-44/p5-19-cover-drawer.png)) | 7:30–8:30 |

Total: about 8.5 minutes.
- **Words she didn't know:** "Juice" grades, "Director+", "ISVs" (Microsoft's own).
- **Numbers she wouldn't trust:** a one-company "comparison". "$201K+" on the chip after she typed £150k.

## 6. Findings for the group

Each item gives the persona or personas, the screen, a screenshot and, where it could be told, the owning file.
Line numbers are in the built `app.js` of the lead's build (e800c43).

### 6.1 Broken, fix now (sent to the lead by SendMessage, 21:38 UTC)

1. **PB-1. The pay filter treats a posted minimum as the most a role pays.** The filter says "Matches roles whose
   range overlaps yours", and a minimum's drawer says "Posted minimum base pay; the offer can be higher". Even so, a
   "from €31,100" posting is dropped by a €35,000 floor.
   - **Milan:** the floor takes Amazon from 90 roles to 54, but the Salary note says only "4 roles hidden by the pay
     filter" (1 with no pay, 3 paid for another country). 35 of the 36 hidden roles are "from €X" minimums under
     €35K.
   - **Amazon overall:** 285 postings are minimum-kind.
   - **Empty state:** for one such role ("IT Support Eng I", from €31,100), the empty state blames the search and
     never names the pay filter.
   - **Who and where:** P2, Salary sheet and empty state.
     [r-07 without](../screenshots/persona-beta-2-35-44/r-07-milan-minimum-without-floor.png),
     [r-07 with](../screenshots/persona-beta-2-35-44/r-07-milan-minimum-with-floor.png),
     [r-07 drawer](../screenshots/persona-beta-2-35-44/r-07-milan-minimum-drawer.png),
     [p2-11](../screenshots/persona-beta-2-35-44/p2-11-pay-filter-details.png).
   - **Owner:** `public/app.js`: the filter test `usdHere(j, F).max < F.smin` (~line 970) should not apply to a
     minimum, and the `noPayHidden` note (~line 2390) should count what the floor hides.
2. **PB-2. The job page rounds the posted figure under "Posted base pay".** The exact number isn't anywhere in the
   pay block. Examples:
   - Amazon's "Account Manager, Amazon Vendor Services" is posted as "[Italy] - [46,400 EUR] gross annually" and
     shown as "**€46K**", with "One number, not a range".
   - Microsoft $119,800–234,700 shows as "$120K–235K"; Meta $100,610–144,602 as "$101K–145K".
   - Of the 20,261 yearly salaries shown on the 7 big-tech boards, 16,174 are not whole thousands. For those, the job
     page never shows the pay as posted, against the user's rule. Fixed-term and part-time pay already use
     `postedPair` and are exact ("CA$43,800–50,000 a year"), and the card can stay compact.
   - **Who and where:** P2, P3 and P4, job page.
     [p2-13](../screenshots/persona-beta-2-35-44/p2-13-account-drawer.png),
     [r-05](../screenshots/persona-beta-2-35-44/r-05-posted-amazon-10448661.png),
     [p4-09](../screenshots/persona-beta-2-35-44/p4-09-msft-principal-drawer.png).
   - **Owner:** `public/app.js`, drawer `amountText` (`salaryRange(sal)`, ~line 4939). `annualNote` (~line 4772)
     gives no "As posted" line for a yearly salary.

### 6.2 Improve, ranked by how many of the 5 it would help

| Rank | Change | Helps | Screen · screenshot · file |
|---|---|---|---|
| 1 | **Use the person's currency after the salary box.** Juice, the stats line, the chart axis, the Pay estimate and the Salary chip and box are all in US dollars. After P1 typed PLN 150,000 the chip read "$40K+"; P2's €35,000, P4's C$220,000 and P5's £150k became "$40K+", "$158K+" and "$201K+". Each had to convert "−$650/mo", "$4,270/mo" and "$3,060/mo" back by hand. The posting's currency is known; at least show both. (Wave 1 I-5, still open.) | 4/5 (P1, P2, P4, P5) | Juice, stats, chips · [p1-14](../screenshots/persona-beta-2-35-44/p1-14-tse-juice-family.png), [p4-03](../screenshots/persona-beta-2-35-44/p4-03-salary-cad.png), [p5-08](../screenshots/persona-beta-2-35-44/p5-08-juice-family-london.png) · `public/app.js` `juiceBlock`, `makeSalary` (`money(S.smin)` ~line 2150) |
| 2 | **More households: a second earner, a parent with children, "outside the centre".** All four with a working partner or a child read one-earner figures: P1 −$650/mo, P2 −$1,430/mo as "Couple", P4 $4,270/mo, P5 $3,060/mo. P2's rent is a 2-bedroom in the city centre with no cheaper choice. The engine already takes a rent override (`rentBasis === 'override'` / 'outside'). (Wave 1 I-3, still open.) | 4/5 (P1, P2, P4, P5) | job page Juice · [p2-14](../screenshots/persona-beta-2-35-44/p2-14-juice-couple.png) · `public/app.js` `HOUSEHOLDS` (~line 4229), `server/juice.js` |
| 3 | **Search all companies at once, or say where else a search matches.** Filters carry over well, but P3, P4 and P5 each switched 5–6 boards, and P1 4, to learn who hires. Several boards were empty, and an empty board only offers removing a filter there. (Wave 1 I-1, still open.) | 4/5 (P1, P3, P4, P5) | company menu, empty state · [p3-04](../screenshots/persona-beta-2-35-44/p3-04-microsoft-seattle.png), [p5-09](../screenshots/persona-beta-2-35-44/p5-09-amazon.png) · `public/app.js` `switchCompany`, `emptyState` |
| 4 | **Tax wording outside the US.** "state or local tax" is shown for Ontario's provincial tax and Italy's regional surcharge. "Couple (Family) here means one earner; each person is taxed separately here" reads as a contradiction in Toronto, Milan and London. (Wave 1 I-12, still open.) | 3/5 (P2, P4, P5) | job page Juice · [p4-06](../screenshots/persona-beta-2-35-44/p4-06-juice-family-toronto.png), [p2-14](../screenshots/persona-beta-2-35-44/p2-14-juice-couple.png) · `public/app.js` `taxParts` labels (~line 4392), `taxHowText` |
| 5 | **Fill in levels and comparisons.** Explain the levels across companies, and don't draw a comparison of one company. Compare companies in Canada (Software engineering, Staff+) and in the UK (Sales & partnerships) each show one company. "Same role elsewhere" for P4 is one bar on a $137.5K–150K axis. Meta's postings are all "Level not stated", so P3 can't tell an IC4 from an IC5. "What the levels mean" is one line, with no map between Microsoft "Principal", Amazon "Principal" (L7) and Google "Staff". (Wave 1 I-7.) | 3/5 (P3, P4, P5) | Insights, job page · [p4-12](../screenshots/persona-beta-2-35-44/p4-12-compare-swe-staff.png), [p5-13](../screenshots/persona-beta-2-35-44/p5-13-compare-sales-uk.png), [p4-05](../screenshots/persona-beta-2-35-44/p4-05-amazon-principal-drawer.png) · `public/features/comps.js`, `public/app.js` `sameRoleSection` |
| 6 | **Phones: say what the site does and show a role in the first screen.** The tagline is now "melon·seek · Beta: adds 7 big-tech careers sites", which tells a new visitor neither what Juice is nor that the cards are in the sheet. On the 375 px screen the logo is hidden. After filtering, the chart leaves half the screen blank above a closed list (wave 1 I-10). | 3/5 (P1, P2, P5) | landing, phone chart · [p1-01](../screenshots/persona-beta-2-35-44/p1-01-cold-pixel8.png), [p2-01](../screenshots/persona-beta-2-35-44/p2-01-cold-mini.png), [p1-06](../screenshots/persona-beta-2-35-44/p1-06-google-warsaw-chart.png) · `public/app.js` tagline, `public/styles.css` sheet |
| 7 | **Juice for roles listed by country or region only.** These postings have pay but no Juice: Microsoft 273 ("Sales Director- ISVs · United Kingdom", "Enterprise Architect · Ontario, Canada"), NVIDIA 63, Amazon 4. Use the country's main city with a stand-in note, as Santa Clara → San Jose already does. (Wave 1 I-8, still open.) | 2/5 (P4, P5) | job page · [p5-06](../screenshots/persona-beta-2-35-44/p5-06-sales-director-uk-drawer.png) · `public/app.js` `juiceMissing` (~line 4462), `server/juice.js` |
| 8 | **Empty states: suggest the filter that matters, everywhere.** On Microsoft, P3's role was one Redmond tick away, but the empty state suggested dropping her search ("305 roles"). On Meta, P4 got only "Clear filters", with no "Without the level filter" hint. | 2/5 (P3, P4) | empty state · [p3-04](../screenshots/persona-beta-2-35-44/p3-04-microsoft-seattle.png), [p4-07](../screenshots/persona-beta-2-35-44/p4-07-meta.png) · `public/app.js` `emptyState` |
| 9 | **Rank pay against the same level** (and say the level). An entry role "Pays more than 14% of Google's roles in Poland"; a Principal "more than 98%". (Wave 1 I-9.) | 2/5 (P1, P4) | job page pay block · [p1-13](../screenshots/persona-beta-2-35-44/p1-13-tse-drawer.png) · `public/app.js` percentile |
| 10 | **One locale per screen.** The badge pill says "16 paź" while its popover says "Fetched Oct 16, 2026". The job page says "Updated 15 giu 2026" and "Listed 50 days ago (3 wrz 2026)" in English sentences. | 2/5 (P1, P2) | badge, job page · [p1-02](../screenshots/persona-beta-2-35-44/p1-02-badge.png), [p2-13](../screenshots/persona-beta-2-35-44/p2-13-account-drawer.png) · `public/app.js` date formatting |
| 11 | **Saved-search names: put the place first.** "Google · $40K+ · Intern · Entry +1" hides Warsaw under "+1"; "Meta · “UX researcher” · Seattle · Redmond +1". | 2/5 (P1, P3) | company menu · [p1-21](../screenshots/persona-beta-2-35-44/p1-21-saved.png), [p3-15](../screenshots/persona-beta-2-35-44/p3-15-return-menu.png) · `public/app.js` saved-search naming |
| 12 | **Location search: whole words first.** "UK" lists UNITED STATES · Milwaukee 299 before London; regions ("Lombardia") find nothing. | 2/5 (P5, P2) | Location · [p5-02](../screenshots/persona-beta-2-35-44/p5-02-location-london.png) · `public/app.js` `makeChecklist` search |
| 13 | **Read the złoty and space-separated thousands, and don't take a bare number as dollars in a non-US view.** "150 000 zł", "150000 zł" and "150k zł" are "isn't a pay figure", while "35.000 €" and "£150k" work. A bare "150000" in a Warsaw view becomes $150,000 and leaves 4 roles of 60. | 1/5 (P1) | Salary · [p1-07](../screenshots/persona-beta-2-35-44/p1-07-salary-zloty.png), [r-09](../screenshots/persona-beta-2-35-44/r-09-salary-bare-number-warsaw.png) · `public/app.js` `makeSalary` parser |
| 14 | **Don't lose a location dropped "for now".** On Meta the toast said "dropped Vancouver (not at Meta) for now". After a reload the view kept Toronto only, and Microsoft never put Vancouver back. | 1/5 (P4) | company switch · [p4-07b](../screenshots/persona-beta-2-35-44/p4-07b-reopen-vancouver-lost.png) · `public/app.js` `switchCompany` (the held-back filter isn't in the saved last view) |
| 15 | **"Design" as P3's comparison family mixes UX research with creative, motion and art direction.** Netflix's "Senior Motion Designer" ($310K–420K) and "Creative Director" ($260K–480K) put Netflix first at $365K. | 1/5 (P3) | job page, Insights · [p3-05](../screenshots/persona-beta-2-35-44/p3-05-meta-drawer.png) · `public/features/roles.js` design family |
| 16 | **"No department" on Google cards reads like missing data.** 121 Google postings (the Media Account Specialist intern, "Fellow, Core AI Foundations", "Senior Director, AI-Ready Data"). Say "Not grouped" or "Google gives no department". | 1/5 (P1) | cards, chart rows · [p1-06](../screenshots/persona-beta-2-35-44/p1-06-google-warsaw-chart.png) · `server/families.js` label, `public/app.js` `deptKey` |
| 17 | **Cover screen: the "N new roles" toast covers the first card's pay** for several seconds on the 352×355 screen. | 1/5 (P5) | toast · [p5-18](../screenshots/persona-beta-2-35-44/p5-18-cover-list.png) · `public/styles.css` toast |

### 6.3 Good: keep

| What | Who | Screen · screenshot · file |
|---|---|---|
| **A country search lists its cities.** "Poland", "Polska", "Italia", "Canada" and "United Kingdom" work, and a city also finds roles listed only for its country (wave 1 B5 fixed). | all 5 | Location · [p1-03](../screenshots/persona-beta-2-35-44/p1-03-location-poland.png), [p4-02](../screenshots/persona-beta-2-35-44/p4-02-location-canada.png) · `public/app.js` `makeChecklist` |
| **The beta opens on big tech, and filters survive a company switch.** It opens on Google, with "Big tech" first in the menu. The toasts say what was kept, dropped and put back ("Kept $158K+, Toronto, Staff+ · dropped Vancouver (not at Meta) for now"). | all 5 | landing, menu · [p2-02](../screenshots/persona-beta-2-35-44/p2-02-company-menu.png) · `public/app.js` `switchCompany` |
| **The salary box reads other currencies.** "35.000 €", "C$220,000", "£150k" and "PLN 150000" each read back as "≈ $X a year". | P1, P2, P4, P5 | Salary · [p2-07](../screenshots/persona-beta-2-35-44/p2-07-salary-italian.png), [p5-03](../screenshots/persona-beta-2-35-44/p5-03-salary-gbp.png) · `public/app.js` `makeSalary` |
| **Internship pay reads as posted** ("PLN 156,000–159,000 a year · 13–17-week internship"). Juice "while it lasts" explains the term and the tax (wave 1 B1 fixed). | P1 | job page · [p1-10](../screenshots/persona-beta-2-35-44/p1-10-intern-drawer.png), [r-01](../screenshots/persona-beta-2-35-44/r-01-microsoft-intern-drawer.png) · `public/app.js` `annualNote` |
| **Comparisons stay in the person's country** and say so ("Software engineering internships in Poland", "Nothing to compare yet in Italy", "Only pay for roles in Canada is compared"). | P1, P2, P4, P5 | job page, Insights · [p2-13](../screenshots/persona-beta-2-35-44/p2-13-account-drawer.png) · `public/features/comps.js` |
| **Honest no-pay handling.** "Pay posted for the US only", "No pay listed · No pay estimate either", "Without the pay filter: 4 roles", "45 roles posting a stated minimum … left out of pay figures". | P2, P5 | cards, job page, Insights · [p5-10](../screenshots/persona-beta-2-35-44/p5-10-google-london-director.png), [p5-11](../screenshots/persona-beta-2-35-44/p5-11-google-head-of-sales-drawer.png) · `public/app.js`, `public/features/insights.js` |
| **Plain pay labels.** "from €46K" with "Posted minimum base pay; the offer can be higher", "One number, not a range", "The highest pay of Microsoft's roles in the UK", Microsoft's "Pay by place" and "Posted for Redmond". | P2, P3, P5 | job page · [p3-09](../screenshots/persona-beta-2-35-44/p3-09-microsoft-drawer.png), [r-07 drawer](../screenshots/persona-beta-2-35-44/r-07-milan-minimum-drawer.png) · `public/app.js` |
| **The Juice waterfall.** The rows add up, Compare locations works, the stand-in city is named ("Santa Clara uses San Jose's rent …"), and the household is remembered and re-scores every card. | all 5 | job page · [p3-07](../screenshots/persona-beta-2-35-44/p3-07-meta-compare-locations.png), [r-03](../screenshots/persona-beta-2-35-44/r-03-nvidia-santa-clara-juice.png) · `public/app.js` `juiceBlock` |
| **Saved searches and returning.** A labelled Save and its toast, "Reopened where you left off", "N new" in the menu, a toast on opening and New tags, also on the razr's cover screen. | P1, P3, P4, P5 | menu, list · [p3-15](../screenshots/persona-beta-2-35-44/p3-15-return-menu.png), [p5-16](../screenshots/persona-beta-2-35-44/p5-16-cover-menu.png) · `public/app.js` `toggleSave`, `savedNewCount` |
| **Speed on the biggest board.** Amazon's 22,179 roles show real preview cards in 1.1 s and the full list in 3.5 s (load 3.2). A job opens in 0.6–0.8 s, Insights in 0.9 s. | all 5 | everywhere · [p2-03](../screenshots/persona-beta-2-35-44/p2-03-amazon-loading.png) · `public/api.js`, `public/app.js` |
| **Every posture used worked.** None had sideways scroll, on the list or an open job page (measured, `hs.mjs`): 375×812, 412×915, 412×1005, the 352×355 cover screen, 812×375 landscape (Apply pinned) and the 1114×720 Duo spanned (the job page on the right screen, clear of the hinge). | P1, P2, P4, P5 | [p2-15](../screenshots/persona-beta-2-35-44/p2-15-landscape-drawer.png), [p4-15](../screenshots/persona-beta-2-35-44/p4-15-duo-drawer.png), [p5-19](../screenshots/persona-beta-2-35-44/p5-19-cover-drawer.png) · `public/styles.css` |
| **Apply and share.** The button names the site (google.com, amazon.jobs, metacareers.com) and opens a new tab with noopener; "Link copied". | P1, P2, P3 | job page · [p3-13](../screenshots/persona-beta-2-35-44/p3-13-meta-apply.png) · `public/app.js` |

## 7. Replayable steps

The scripts are in `<scratch>/persona-beta-2-35-44/s/`; `<scratch>` is the session's scratchpad.

1. **Server.** Run `node scripts/cycle/serve.mjs --dist <scratch>/cycle-beta7-dist --pid
   <scratch>/persona-beta-2-35-44/serve.pid` in the background, with a 4-hour `timeout`. It printed
   `http://127.0.0.1:34871/melon-seek/`. The site is `/melon-seek/beta/`.
2. **Browser.** Playwright is loaded from `<scratch>/pw/node_modules` via `createRequire`, with Chromium at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. The browser is started with `--disable-background-networking`
   and closed after each script.
   - Phone sizes come from test/e2e/phone-sizes.mjs, with `isMobile`, `hasTouch`, the device's DPR and user agent.
   - The helpers are `lib.mjs` (devices, screenshots, waits) and `ui.mjs` (taps, filter sections, the sheet, the job
     page, Juice).
3. **People.** P1: `p1a`–`p1c`. P2: `p2a`, `p2b`. P3: `p3a`–`p3c`. P4: `p4a`, `p4b`. P5: `p5a`–`p5c`.
   - `storageState` files (`p1-state.json` …) carry localStorage between sessions.
   - `p3c` and `p5c` build the "a week / two weeks later" states (`p3-return.json`, `p5-return.json`).
4. **Re-checks.** `regress.mjs` counts B2 to B4, part-time, "Dublinas", country-only pay and minimums.
   `regress-ui.mjs` covers B1, the stand-in city and the map. `hs.mjs` measures sideways scroll on each posture.
5. **Broken items.** `posted.mjs`, `rounding.mjs` and `milan.mjs`, `minfilter.mjs` and `minfilter2.mjs` cover PB-1,
   PB-2 and the salary inputs.
6. **Data.** `unpack.mjs` loads the build's lists through its own `unpackJobs`. `q.mjs` and `countries.mjs` were used
   to set the goals.
7. **Screenshots.** `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/persona-beta-2-35-44`.
8. **Stop.** `kill "$(cat <scratch>/persona-beta-2-35-44/serve.pid)"`.

## 8. Known gaps

- Coming back later is simulated by editing localStorage, not by waiting for a new crawl. So the cover screen's
  "New · Listed 30 days ago" pair is the simulation's doing.
- No careers site can be reached from the sandbox. Apply was checked up to the new tab (its URL, `target=_blank`,
  `noopener`), not through to the company's form.
- Basemap tiles can't load here ("Basemap unavailable · pins still work"); only the pins were judged.
- WebKit, dark mode, keyboard-only use and screen readers weren't tested; the QA lanes cover them.
- Person times are estimates built from the steps. Machine times are measured under load 3.2–11.8.

## 9. Change log

- 2026-10-23: wave 2 of the beta persona review for ages 35–44, on the lead's `cycle-beta7-dist` (e800c43, the
  2026-10-16 crawl): 5 personas and 121 screenshots. Wave 1's B1 to B5 are fixed. PB-1 and PB-2 are new.
