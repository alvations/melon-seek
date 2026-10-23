# Process log: persona-beta-2-45-54

## State

- 2026-10-23 21:55 UTC: **done.** Five people run on the lead's build (`cycle-beta7-dist`, e800c43),
  wave 1 re-checked (8 of 8 Broken fixed), lists written (§4). Four Broken items found and each sent
  to the lead by SendMessage when confirmed. Server and browser stopped by pid.
- Next: nothing; waiting for the lead.

## 1. Brief

- Prompt: [`docs/process/prompts/persona-beta-2-45-54.md`](prompts/persona-beta-2-45-54.md) (verbatim).
- Second persona wave on `/melon-seek/beta/`, after fix waves 3 to 5 and QA round 4. Wave 1 for this
  group: [persona-beta-45-54.md](persona-beta-45-54.md).
- Files owned: this file, the prompt file and `docs/screenshots/persona-beta-2-45-54/`. No product code
  edited; committed in my worktree only, never pushed.

## 2. Inputs and how I ran it

- `README.md`, `docs/strategy/ROADMAP.md` §8 (the UI simplicity budget), wave 1's
  [persona-beta-45-54.md](persona-beta-45-54.md), and `docs/process/lead.md` from "Fix wave 5" on
  (read from e800c43, the deployed head; my worktree branch sits on 2474fc4, so I read the deployed
  tree from a `git archive e800c43` copy in my scratchpad).
- The lead's build `cycle-beta7-dist` (e800c43, 2026-10-16 crawl of the seven big-tech boards; the
  eight AI boards are also listed), served with `scripts/cycle/serve.mjs` on a free port. Not rebuilt.
- Playwright from the shared `pw/node_modules`, Chromium 141 at `/opt/pw-browsers/chromium-1194`. A
  small daemon holds one browser with one context per person (own localStorage, locale and time zone),
  and each step is a short snippet: tap, fill, wait, screenshot, read `innerText`.
- Phone sizes from `test/e2e/phone-sizes.mjs`, each with its own user agent, `isMobile` and `hasTouch`.
- To check what I saw against the data I read `dist/beta/data/*.csv` and `dist/beta/api/desc/**`, and
  ran `compExtrasEvidence` from `server/keywords.js` (e800c43) over the descriptions.
- Timings: "page" is wall time in the browser until the screen settled, unthrottled, on a machine
  shared with four other reviewers; I note the load average (`uptime`) with each. "≈ human" is my
  estimate of how long a 45–54-year-old would take to read and act.

## 3. The five people

| # | Person | Age, city | Household | Field, level | Device, locale |
|---|---|---|---|---|---|
| 1 | **Grace Mensah** | 48, Toronto, Canada | Family: husband (bus driver), two teenagers | Research. 20 years a high-school science teacher; just finished a Master of Information (user and data research). **New graduate.** | **Pixel 8** 412×915 phone, en-CA |
| 2 | **Tomás Herrera** | 50, Austin, TX, US | Family: wife and one child | Sales. 22 years teaching, then 3 years as a SaaS account executive. **Early career** in tech sales. | **iPhone 13 mini** 375×812, en-US |
| 3 | **Petra Hoffmann** | 49, Munich, Germany | Single (divorced, children grown) | Design. 7 years as a product designer after a career in print. **Mid-career.** Would like 4 days a week. | **Surface Duo spanned** 1114×720 (touch), de-DE |
| 4 | **Deb Lindqvist** | 52, Austin, TX, US | Couple (husband retired early) | Engineering. 26 years in chip physical design; laid off. **Staff level.** | Desktop 1280×800, then **iPhone 13 mini landscape** 812×375, en-US |
| 5 | **Rosalind Achebe** | 54, London, UK | Couple (children grown) | Policy. 20 years at a regulator, now head of regulatory affairs at a telecoms firm. **Director.** | **Razr cover screen** 352×355 first, then desktop 1440×900, en-GB |

Three countries for the jobs (Canada, the US, Germany, the UK: four). Three people start on a phone;
two more use one for part of the task.

### 3.1 Grace Mensah: new graduate, Toronto, Pixel 8

**Goal:** "An internship, new-graduate or entry-level research or data job in Toronto, paying at least
CA$75,000, that leaves our family of four at least CA$1,000 a month."

**Reached it? Partly.** Amazon's *Data Engineer, Early Career - 2026 (CAN)* (CA$97,100, Toronto) clears
her pay floor, and Google's *Student Researcher, BS/MS* posts CA$99–102K a year for a term. For a
family of four the site says **−$690 a month** (Amazon) and **−$550 a month** (Google), in US dollars,
with one earner and a city-centre 3-bedroom. She can't add her husband's wage or her own rent, so
she can't test her CA$1,000 goal. She found the Amazon job only because she tried each big-tech board.

| Step | What she did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Arrives cold: Google's board (3,821 roles), "melon·seek · Beta: adds 7 big-tech careers sites", "$199K base pay median (US)", a department chart. The cards sit under a bottom sheet; "‹2 ›13" chips on the rows mean nothing to her. [p1-01](../screenshots/persona-beta-2-45-54/p1-01-arrive-pixel8.png) | first card 2.2 s (load 3.4) | 20 s |
| 2 | Company menu: Big tech first, then "More companies". [p1-02](../screenshots/persona-beta-2-45-54/p1-02-company-menu.png) | no wait | 10 s |
| 3 | Types "research analyst Toronto": **0 roles**, "Check the spelling, or try another word". Google has 36 Toronto roles. Dead end. [p1-03](../screenshots/persona-beta-2-45-54/p1-03-search-research-toronto.png) | 1.3 s | 30 s |
| 4 | Clears it, opens Location: "Canada" now lists Toronto 36, Waterloo 30, Montreal 25… (wave 1's country search is fixed). Picks Toronto: "Show 36 roles". [p1-05](../screenshots/persona-beta-2-45-54/p1-05-location-canada.png) | no wait | 1 min |
| 5 | Toronto list: cards in CA$ ("CA$260K–266K"), chart in US dollars ("Median base pay $98K"). "No department" is a chart row. [p1-06](../screenshots/persona-beta-2-45-54/p1-06-toronto-google.png) | 1.4 s | 1 min |
| 6 | Searches "research": 9 roles · 6 in title, all Google internships and student researcher terms (CA$99–120K). One card says "CA$120K/year · 12–14-week internship", its neighbours just "CA$120K". *Research Scientist, Paradigms of Intelligence* says "Pay posted for the US only" (honest). [p1-07](../screenshots/persona-beta-2-45-54/p1-07-toronto-research-list.png) | 1.0 s | 2 min |
| 7 | Opens *Student Researcher, BS/MS*: "CA$99K–102K · CAD · per year", "Pays more than 20% of Google's internships in Canada", "Same role elsewhere: Nothing to compare yet in Canada", and a **"+ bonus mentioned"** chip. The posting says "+ 0% bonus target". The strip under "This one among 11 internships" runs "$20K · median $86K · $440K". [p1-08](../screenshots/persona-beta-2-45-54/p1-08-student-researcher-drawer.png) | drawer 0.9 s | 2 min |
| 8 | Juice → Family → Monthly: **−$550/mo**, "income tax $800 · state or local tax $400 · social security $340" (Ontario has a provincial tax, and CPP/EI, not "state" and "social security"). [p1-10](../screenshots/persona-beta-2-45-54/p1-10-juice-family-monthly.png) | no wait | 2 min |
| 9 | Switches to Microsoft (Toronto kept): 24 roles, mostly Staff+ sales architects. The interns read "CA$43,800–50,000 a year · CAD · 26-week internship" (wave 1's lump-sum label is fixed). [p1-13](../screenshots/persona-beta-2-45-54/p1-13-microsoft-intern-drawer.png) | — | 2 min |
| 10 | Switches to Amazon: toast "Kept Toronto"; 175 roles. Searches "data early career": *Data Engineer, Early Career* CA$97K, "One number, not a range", **0 · Rind** for her family (−$690/mo). "About the role" is one sentence; the rest is "Full description on the posting page". [p1-14](../screenshots/persona-beta-2-45-54/p1-14-amazon-toronto.png), [p1-15](../screenshots/persona-beta-2-45-54/p1-15-amazon-data-engineer-drawer.png) | switch 5.6 s (load 6.8); search 1.3 s | 3 min |
| 11 | Apply: opens amazon.jobs in a new tab (`noopener`). Save: "Saved in this browser. Find it in the company menu, with its new roles". [p1-17](../screenshots/persona-beta-2-45-54/p1-17-save.png) | no wait | 20 s |
| 12 | Insights → Pay estimate "Data Engineer · Toronto · Entry": **$73K US dollars**, "Medium confidence · Based on 7 similar roles · Typically within ±10%", next to "Low $70K · High $110K". Four of the seven are software engineers at a 14–15% match. [p1-19](../screenshots/persona-beta-2-45-54/p1-19-estimate-entry.png), [p1-20](../screenshots/persona-beta-2-45-54/p1-20-estimate-details.png) | 1.6 s | 2 min |
| 13 | Comes back: "Reopened where you left off: Amazon · "data early career" · Toronto"; the saved search tops the menu. The toast still covers the menu. [p1-22](../screenshots/persona-beta-2-45-54/p1-22-return-menu.png) | 4.4 s to cards (Amazon, load 5.5) | 20 s |
| 14 | Map: one pin, "Toronto, Canada · $110K · 175". [p1-23](../screenshots/persona-beta-2-45-54/p1-23-map-amazon-toronto.png) | under 3 s | 20 s |

About 17 minutes of her time. The waits she would notice are Amazon's: 4–6 s to switch or return
on an unthrottled phone at load 5–7.

### 3.2 Tomás Herrera: early career in sales, Austin, iPhone 13 mini

**Goal:** "An account executive or account manager role at a big-tech company in Austin or remote in
the US, paying at least $110K base, that leaves my wife, our son and me at least $3,000 a month."

**Reached it? Yes, on the midpoint.** Amazon's *Account Executive, AWS TMEGS, Telco* posts
$92K–160K for Austin and leaves **$3,450 a month** for "a family of four" at the midpoint, and
Microsoft's *Account Executive, Performance Solutions* ($108K–187K for Austin) leaves **$4,760**. He
can't see what is left at the bottom of the range, where a newcomer starts, and the site has no
household of three. Google, the board he lands on, has no account executive in Austin.

| Step | What he did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Arrives cold on Google: no sideways scroll at 375 px, chart and bottom sheet as on the Pixel. [p2-01](../screenshots/persona-beta-2-45-54/p2-01-arrive-iphone13mini.png) | first card 1.2 s (load 3.2) | 15 s |
| 2 | Searches "account executive": 52 roles · 52 in title, all outside Austin. Two near-identical Google cards: *Key Account Executive IV* ($147K–204K, New York) is "41 · Dry", *Key Account Executive, Strategic Accounts* ($147K–204K, "New York, NY +1") is "63 · Ripe". The card doesn't say which place the grade is for. [p2-02](../screenshots/persona-beta-2-45-54/p2-02-google-account-exec.png) | 1.1 s | 1 min |
| 3 | Location → "Austin": **No matches** (none of the 52 is in Austin; Google has 189 Austin roles). The panel doesn't say "none of these 52". [p2-03](../screenshots/persona-beta-2-45-54/p2-03-location-austin.png) | no wait | 1 min |
| 4 | Switches to Amazon: "Kept "account executive"", 172 roles; Location → Austin: 32 roles, Remote (US) roles included ("Also finds roles listed for its country"). Cards show Austin's own row ("$92K–160K", not the $92K–178K span). [p2-08](../screenshots/persona-beta-2-45-54/p2-08-amazon-ae-austin-chart.png), [p2-09](../screenshots/persona-beta-2-45-54/p2-09-amazon-ae-austin-list.png) | switch 2.3 s (load 8.0) | 2 min |
| 5 | Opens *Account Executive, AWS TMEGS, Telco*: "Posted for Austin · USD · per year", "Pay by place" (SF and NY $102K–178K; six others $92K–160K), "Pays more than 38% of Amazon's roles in the US". "Same role elsewhere" ranks Netflix $380K, Cohere $330K… for "Sales & partnerships, every full-time level", with no count per company (Netflix's figure is 7–8 postings, mostly Senior Client Partners and a Director in New York). [p2-10](../screenshots/persona-beta-2-45-54/p2-10-ae-telco-drawer.png), [p2-11](../screenshots/persona-beta-2-45-54/p2-11-same-role-elsewhere.png) | drawer 0.3 s | 3 min |
| 6 | Juice → Family → Monthly: **$3,450/mo**, "40 · Dry" although it meets his goal; "2 adults, 2 children" (he has one child). [p2-12](../screenshots/persona-beta-2-45-54/p2-12-juice-family-austin.png) | no wait | 2 min |
| 7 | Saves; Insights → Compare companies → Sales & partnerships: here each company has its count (Netflix 7, Amazon 503). [p2-13](../screenshots/persona-beta-2-45-54/p2-13-compare-companies.png) | 1.3 s | 2 min |
| 8 | Switches to Microsoft: "Kept "account executive", Austin", 8 roles; *Account Executive, Performance Solutions*: "Senior", $108K–187K for Austin, $4,760/mo for the family. "Senior Account Executive · $108K–223K · 2 levels" says what the span is. [p2-14](../screenshots/persona-beta-2-45-54/p2-14-microsoft-ae-austin.png), [p2-15](../screenshots/persona-beta-2-45-54/p2-15-microsoft-ae-drawer.png) | switch 0.8 s | 2 min |
| 9 | Comes back: "Reopened where you left off: Microsoft · "account executive" · Austin"; the saved Amazon search opens from the menu. [p2-16](../screenshots/persona-beta-2-45-54/p2-16-return-saved-amazon.png) | 0.6 s; saved search 0.5 s | 30 s |
| 10 | Looks at Amazon's *Associate Account Executive* (Entry): card and headline "$65K–114K · per year · Annualized from hourly pay". The posted "$31.39 - 54.90 USD hourly" is only under Details. [p2-17](../screenshots/persona-beta-2-45-54/p2-17-associate-ae-hourly-card.png), [p2-18](../screenshots/persona-beta-2-45-54/p2-18-associate-ae-drawer.png) | no wait | 1 min |

About 15 minutes. The base-pay rule held everywhere he looked: every sales drawer says "Posted base
pay. Equity and bonus aren't included."

### 3.3 Petra Hoffmann: mid-career designer, Munich, Surface Duo spanned (de-DE)

**Goal:** "A product or UX design role in Munich or Berlin, or remote in Germany, at a big-tech
company, paying at least €85,000 and leaving me at least €1,500 a month; ideally four days a week."

**Reached it? Partly.** One role fits, as in wave 1: Google's *Senior UX Designer, Chrome*, Munich,
€112K–114K (as posted: "€112000 - €114000 (EUR) + 15% bonus target"). It leaves **$3,250 a month**
for one person, which clears €1,500, but she has to convert it herself. No big-tech board has a
part-time design role, and Employment type offers only "Not stated", "Contract" and "Intern".

I ran her on the Duo first without the hinge (a 1114×720 touch screen, desktop layout) and then
with the hinge emulated over CDP (`displayFeature` at x 540, 34 px), as fix-phone-sizes does.

| Step | What she did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Arrives cold. With the hinge: chart on the left screen, cards on the right, nothing readable on the hinge; the quick chips end in a fade at the hinge. The stats line reads **"3.821 3.821 roles · 66% show pay · $199K base pay median (US)"**. Without the hinge, the tagline "Beta: adds 7 big-tech companies' own careers sites" runs across x 457–752. [p3-01 hinge](../screenshots/persona-beta-2-45-54/p3-01-arrive-duo-hinge.png), [p3-01 no hinge](../screenshots/persona-beta-2-45-54/p3-01-arrive-duo-spanned.png) | first card 1.4–1.7 s (load 8.3) | 30 s |
| 2 | Location: "München", "Muenchen", "Deutschland" and "Germany" all find Munich (35); "Deutschland" lists Munich, Hamburg, Frankfurt, Berlin… (wave 1's dead end is fixed). [p3-03](../screenshots/persona-beta-2-45-54/p3-03-location-muenchen.png), [p3-04](../screenshots/persona-beta-2-45-54/p3-04-location-deutschland.png) | no wait | 1 min |
| 3 | Searches "UX Designer" in Munich: 1 role, *Senior UX Designer, Chrome*, €112K–114K. The stats line says "$130K base pay median", the card says euros. [p3-05](../screenshots/persona-beta-2-45-54/p3-05-google-munich-ux.png) | 1.1 s | 1 min |
| 4 | Drawer (on the right screen): "€112K–114K · EUR · per year", "≈ $129K–131K in US dollars at Sep 2026 rates", "Pays more than 48% of Google's roles in Germany", "Same role elsewhere: Nothing to compare yet in Germany … Pay for other countries isn't used" (wave 1's US comparison is fixed). One age: "Updated 14 days ago" and "Listed 14 days ago (9. Okt. 2026)" (fixed). [p3-06](../screenshots/persona-beta-2-45-54/p3-06-chrome-ux-drawer.png) | drawer 0.2 s | 2 min |
| 5 | Juice → Monthly: **$3,250/mo** for one person; "Gross pay $10,840/mo". In de-DE, the money uses English separators ("$3,250") while counts use German ones ("3.821", "2.513 with pay"); to a German reader "$3,250" is three dollars. [p3-07](../screenshots/persona-beta-2-45-54/p3-07-juice-single-munich.png) | no wait | 2 min |
| 6 | Filters → Employment type: Not stated 31, Contract 2, Intern 2. "Teilzeit" and "part-time": 0, with "Without the search "Teilzeit": 35 roles · Remove the search" (good). [p3-08](../screenshots/persona-beta-2-45-54/p3-08-employment-type.png), [p3-09](../screenshots/persona-beta-2-45-54/p3-09-teilzeit-empty.png) | 0.9 s | 2 min |
| 7 | Tries Microsoft, Apple, Amazon and NVIDIA with "designer": Microsoft "Kept "designer" · dropped Munich (not at Microsoft) for now"; Apple "**put back Munich**" (wave 1's lost filter is fixed); Amazon one *Sr Mechanical Designer* with no pay; NVIDIA none. [p3-10 Microsoft](../screenshots/persona-beta-2-45-54/p3-10-switch-microsoft.png), [p3-10 Apple](../screenshots/persona-beta-2-45-54/p3-10-switch-apple.png) | 0.4–3.5 s each (load 13.8) | 4 min |
| 8 | Insights → Pay estimate "UX Designer · Munich": "Not enough comparable roles … Remove a filter or try a broader title" (honest). [p3-11](../screenshots/persona-beta-2-45-54/p3-11-insights-google-munich.png) | 1.2 s | 1 min |
| 9 | Saves; Map: one pin "Munich, Germany · $134K · 35", the legend in US dollars. Comes back: "Reopened where you left off: Google · Munich"; the saved search is in the menu. [p3-12](../screenshots/persona-beta-2-45-54/p3-12-map-google-munich.png), [p3-13](../screenshots/persona-beta-2-45-54/p3-13-return-menu.png) | map under 2.6 s; return 1.7 s | 1 min |

About 15 minutes. The dual-screen layout works well for her: chart on one screen, the job on the other.

### 3.4 Deb Lindqvist: staff engineer, Austin, desktop and a landscape phone

**Goal:** "A staff or principal physical-design role in Austin at NVIDIA, Apple, Google, Amazon or
Meta, paying at least $230K base, that leaves my husband and me at least $7,000 a month."

**Reached it? Yes for NVIDIA and Google; no for Apple.** NVIDIA's *Principal CPU Architect -
High-Performance and Physical Design* ($272K–431K) and Google's *Staff CPU Physical Design Engineer*
($192K–278K) fit, and NVIDIA's *Senior Physical Design Engineer* ($168K–310K, "2 levels") leaves a
couple **$11,470 a month** in Austin. That figure is the midpoint of Level 4 and Level 5 together, and
she can't pick her level. On Apple, all 34 Austin physical-design roles read "Pay posted for the US
only" or "No pay listed", and "0% show pay for Austin". Apple posts "$150,400 and $277,600" for a role
listed in Austin and San Jose; the site holds that pay for San Jose and says "the US".

| Step | What she did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | Arrives cold at 1280×800: "3,821 roles · 66% show pay · $199K base pay median (US)" (one count in en-US). Opens NVIDIA: the stats line and the chart both say $239K (wave 1's two medians are fixed); departments are spelled out ("Systems Software Engineering", "ASIC Engineering"), with "135 more departments". [p4-01](../screenshots/persona-beta-2-45-54/p4-01-arrive-desktop-1280.png), [p4-02](../screenshots/persona-beta-2-45-54/p4-02-nvidia.png) | first card 2.4 s (load 9.8); switch 0.7 s | 1 min |
| 2 | Location Austin, search "physical design": 13 roles · 12 in title, "100% show pay for Austin · $200K". Most cards read "$168K–310K · 2 levels". [p4-03](../screenshots/persona-beta-2-45-54/p4-03-nvidia-austin-pd.png) | 1.1 s | 2 min |
| 3 | Opens *Senior Physical Design Engineer*: "Pay by level · Level 4 $168K–264.5K · Level 5 $196K–310.5K", "These are NVIDIA's own level names" (no plain word for what Level 5 is). "Same role elsewhere: **Chip design & silicon engineering**, Senior level in the US" with a count per company (Meta 3, NVIDIA 152, Apple 8…): wave 1's "compared with software engineers" is fixed. "Open 180+ days" is explained. [p4-04](../screenshots/persona-beta-2-45-54/p4-04-nvidia-pd-drawer.png) | drawer 0.3 s | 3 min |
| 4 | Juice → Couple → Monthly: **$11,470/mo**, from a $19,940/mo gross (the two-level midpoint). Compare locations: Austin "best", Santa Clara $8,200. [p4-05](../screenshots/persona-beta-2-45-54/p4-05-juice-couple-austin.png), [p4-06](../screenshots/persona-beta-2-45-54/p4-06-compare-locations.png) | no wait | 2 min |
| 5 | Switches Apple → Amazon → Google → Meta → Microsoft, each "Kept "physical design", Austin". Apple: 34 roles, **"Pay posted for the US only"** on the cards, "Posted for the US, not Austin" in the drawer, chart "No pay posted for Austin". Amazon: 15 roles, Austin's own rows ($185K–250K for *Sr. Physical Design Engineer*). Google: 1 (Staff, $192K–278K). Meta: 1. Microsoft: 3. [p4-07](../screenshots/persona-beta-2-45-54/p4-07-apple-austin-pd.png), [p4-08](../screenshots/persona-beta-2-45-54/p4-08-apple-pd-drawer.png) | 0.3–0.5 s each | 4 min |
| 6 | Insights → Compare companies: the role family follows her search (Chip design & silicon engineering); at Staff+: NVIDIA 10 · $300K, Google 9 · $235K, Microsoft 14 · $209K, and "Not shown: Anduril (fewer than 3…); OpenAI, Meta and Apple (don't state levels for most of these roles)". [p4-10](../screenshots/persona-beta-2-45-54/p4-10-compare-chip-staff.png) | Insights 0.3 s | 2 min |
| 7 | Pay estimate "Staff Physical Design Engineer · Austin · Staff+": $239K, "Medium confidence · Based on 23 similar roles at NVIDIA, mixed levels · Austin", "Typically within ±13%", Low $168K, High $311K. [p4-11](../screenshots/persona-beta-2-45-54/p4-11-estimate-staff-pd-austin.png) | under 1 s | 2 min |
| 8 | Saves; opens the same link on her iPhone 13 mini in landscape (812×375): no sideways scroll, but only about two chart rows show above the collapsed list. After opening the sheet, the job page fills the screen with Apply pinned at the bottom. [p4-12](../screenshots/persona-beta-2-45-54/p4-12-landscape-shared-link.png), [p4-14](../screenshots/persona-beta-2-45-54/p4-14-landscape-drawer.png) | link 0.7 s; drawer 0.1 s | 1 min |
| 9 | Back on the desktop: "Reopened where you left off: NVIDIA · "physical design" · Austin", the saved search in the menu, and the Ranges view stacks identical bands ("×3") with stripes for "several levels or places". [p4-15](../screenshots/persona-beta-2-45-54/p4-15-return-menu.png), [p4-16](../screenshots/persona-beta-2-45-54/p4-16-ranges.png) | 0.7 s | 1 min |

About 18 minutes.

### 3.5 Rosalind Achebe: director, London, Razr cover screen then desktop (en-GB)

**Goal:** "Head of, or Director of, public policy, government affairs or regulatory affairs for the
UK or EMEA, at a big-tech company in London, paying at least £140,000 base and leaving the two of
us at least £4,000 a month."

**Reached it? No.** No big-tech board lists a policy or regulatory leadership role in London with pay.
In London, Microsoft posts pay on 36 of its 37 roles. The others post little: Google 37 of 151,
Amazon 2 of 528, Meta 1 of 70, Apple 0 of 89. The nearest she found:
- Meta's *Privacy and Data Policy Manager*: honestly "Pay posted for Italy only".
- Google's *Director, Corporate Communications, Google Cloud*: "Pay posted for the US only".
- Microsoft's *EMEA Channel Partner Sales Director* (£120K–202K): leaves a couple **$4,720 a month**,
  under her £4,000 (≈ $5,360), and it isn't policy.

The site says all of this plainly; the gap is in the data, not the screens.

| Step | What she did and saw | Page | ≈ human |
|---|---|---|---|
| 1 | On the train, opens a friend's link (`#c=meta&q=policy`) on her Razr's cover screen (352×355): the company, search, views, filters and Save all fit with no sideways scroll; the list is a sheet under one chart row: "226 roles · 32 in title". [p5-01](../screenshots/persona-beta-2-45-54/p5-01-razr-cover-meta-policy.png) | first card 0.6 s (load 5.4) | 30 s |
| 2 | Opens the sheet and the first card (*Communications Director, Enterprise Business*, $223K–287K): the job page fills the cover screen and Apply stays visible. "Same role elsewhere" says only "Director+ level in the US", with no counts; the family (Marketing, comms & content) is under Details. The card's place is Los Angeles; the Juice line is "for one person in Seattle". [p5-02](../screenshots/persona-beta-2-45-54/p5-02-razr-list.png), [p5-03](../screenshots/persona-beta-2-45-54/p5-03-razr-drawer.png), [p5-13](../screenshots/persona-beta-2-45-54/p5-13-razr-same-role-director.png) | drawer under 0.3 s | 1 min |
| 3 | At home on the desktop (1440×900): Meta "policy" + London: 13 roles · 3 in title, "0% show pay for London"; *Privacy and Data Policy Manager* "Pay posted for Italy only". [p5-04](../screenshots/persona-beta-2-45-54/p5-04-meta-policy-london.png) | 0.6 s | 2 min |
| 4 | Switches Google → Microsoft → Amazon → Apple, each "Kept "policy", London". Google: 18 roles and none with "policy" in the title (no "in title" count is shown at all); Microsoft: 13, all GBP, none policy; Amazon 40 · 2 in title, no pay; Apple 3, no pay. The place shows as "London" on four boards and "London, England" on Amazon. [p5-05 Google](../screenshots/persona-beta-2-45-54/p5-05-google-policy-london.png), [p5-05 Microsoft](../screenshots/persona-beta-2-45-54/p5-05-microsoft-policy-london.png) | 0.7–4.0 s (Amazon) | 4 min |
| 5 | Microsoft London without a search: a DKK posting listed "Denmark · London" now says "Pay posted for Denmark only" and has no Juice; EUR ones say "Pay posted for Spain only" / "Ireland only" (wave 1's Juice-from-another-currency is fixed). [p5-06](../screenshots/persona-beta-2-45-54/p5-06-microsoft-london-dkk-card.png) | no wait | 1 min |
| 6 | Insights → Compare companies: now "Posted pay in the UK, by company" (good), but Policy & government affairs isn't offered for the UK and nothing says why; it opens on "Software engineering" for a "public policy" search. [p5-08](../screenshots/persona-beta-2-45-54/p5-08-compare-policy.png) | 0.3 s | 2 min |
| 7 | Pay estimate "Head of Public Policy · London · Director+": "No similar role at Google in the UK lists pay, so there is no pay estimate. Pay from other countries isn't used" (honest). [p5-09](../screenshots/persona-beta-2-45-54/p5-09-estimate-head-policy-london.png) | no wait | 1 min |
| 8 | Types "£140,000" in the salary box: "Min: £140,000 ≈ $188K a year"; 16 Microsoft London roles. *EMEA Channel Partner Sales Director* (£120K–202K): Couple → Monthly **$4,720/mo**, "income tax $6,560 · social security $580 · Couple here means one earner; each person is taxed separately here". [p5-10](../screenshots/persona-beta-2-45-54/p5-10-salary-box-gbp.png), [p5-11](../screenshots/persona-beta-2-45-54/p5-11-juice-couple-london.png) | 0.9 s | 3 min |
| 9 | Saves two searches; comes back: "Reopened where you left off: Google · "policy" · London". The menu lists "Google · "policy" · London" and **"Microsoft · $188K+ · London"**: her £140,000 is renamed in dollars. [p5-12](../screenshots/persona-beta-2-45-54/p5-12-return-menu-2-saved.png) | 0.6 s | 30 s |

About 16 minutes.

## 4. Findings for the group

Persona letters: G = Grace, T = Tomás, P = Petra, D = Deb, R = Rosalind. Owners are the files I
traced the behaviour to on e800c43. Each Broken item was sent to the lead as soon as I had confirmed it.

### 4.1 Broken, fix now (wrong, misleading or blocking)

1. **"+ bonus mentioned" on postings that say the bonus is 0%.** Google's "Canada: $99000 (CAD) + 0%
   bonus target" gets the chip "+ bonus mentioned", and its Details say "The description mentions a bonus;
   it isn't in this figure". A new graduate reads that as money on top. This affects 50 postings: every
   one whose only bonus text is "+ 0% bonus target" (Ireland €47,000 interns, a US $192–278K role,
   Belgium). I checked this by running `compExtrasEvidence` over `dist/beta/api/desc`.
   — G · drawer · [p1-08](../screenshots/persona-beta-2-45-54/p1-08-student-researcher-drawer.png) · `server/keywords.js` (`compExtrasEvidence`, `BONUS_STRONG` matches "bonus target"), chip in `public/app.js` ~4694.
2. **The stats line repeats the count in non-English browsers: "3.821 3.821 roles".** Every board of
   1,000+ roles, unfiltered, in de-DE (Google "3.821 3.821", Apple "4.851 4.851", Amazon "22.179 22.179",
   Microsoft "2.435 2.435") and fr-FR ("3 821 3 821 roles"). The line is shown at tablet and desktop
   widths.
   — P · stats line · [p3-01](../screenshots/persona-beta-2-45-54/p3-01-arrive-duo-hinge.png) · `public/app.js:2972`: `plural(...).replace(/^[\d,]+ /, '')` only strips digits and commas, and `plural` uses `toLocaleString()`.
3. **"Pay posted for the US only" in a US city.** With Location Austin, Apple's *SoC Physical Design
   Engineer, Electrical Analysis* (listed "Austin, TX | San Jose, CA", posted "$150,400 and $277,600")
   reads:
   - card: "Pay posted for the US only";
   - tip: "$150K–278K is the pay posted for the US, not for Austin";
   - drawer: "Posted for the US, not Austin";
   - stats line: "0% show pay for Austin".

   The site holds that pay for San Jose (`salary.places`), and the Juice line says "in San Jose". The
   sentence names the country, not the place. This affects 253 Apple and 284 Amazon postings with pay
   (e.g. Amazon's *Mechanical BIM Designer*: "…pay posted for the US, not for Austin"). For Deb it
   wipes out Apple: all 34 Austin physical-design roles show no usable pay.
   — D · cards, drawer, stats line · [p4-07](../screenshots/persona-beta-2-45-54/p4-07-apple-austin-pd.png), [p4-08](../screenshots/persona-beta-2-45-54/p4-08-apple-pd-drawer.png), [p4-09](../screenshots/persona-beta-2-45-54/p4-09-amazon-pay-us-only-austin.png) · `public/app.js` `payPlaceText` (~3894). It names places only from `salary.ranges`, otherwise the country; used by `payPill` (~3840) and the drawer.
4. **A second country's posted pay is dropped.**
   - Google's *Customer Engineer, Migrations Specialist* posts "Germany: €150000 - €153000" and
     "Italy: €124000 - €127000". Only Germany's line is kept, so with Location Milan the card says
     "Pay posted for Germany only (… not for Milan)".
   - The Dublin intern posts Ireland €47,000, Germany €53,000 and France €41,500. It shows €47,000
     everywhere, with both "Several pay ranges" ("this figure is one of them") and "One number, not a
     range", and the other two figures appear nowhere.

   That is 13 of 13 Google postings with pay lines for 2+ countries (a lower bound from my regex).
   This goes against "present them as they are and not cut anything".
   — P, R (European places) · cards, drawer, CSV · [rc-04](../screenshots/persona-beta-2-45-54/rc-04-google-italy-pay-dropped.png), [rc-01](../screenshots/persona-beta-2-45-54/rc-01-google-intern-two-chips.png) · `server/salary.js` DQ-15 line choice (~394, `unitCountry` ~952): one country line is scored and kept; the others are never stored as ranges.

### 4.2 Improve (ranked by how many of the 5 it would help)

| Rank | Change | Helps | Screen · screenshot · owner |
|---|---|---|---|
| 1 | **Juice in the person's own terms.** None of the five could test their own target, as in wave 1. Each is missing something different: G a second earner and her own rent, T a household of three and the low end of the range, P euros, D one NVIDIA level (not the two-level midpoint), R pounds. Juice is still US dollars only, one earner, a city-centre flat and the range midpoint. | 5/5 | Juice · [p1-10](../screenshots/persona-beta-2-45-54/p1-10-juice-family-monthly.png), [p2-12](../screenshots/persona-beta-2-45-54/p2-12-juice-family-austin.png), [p3-07](../screenshots/persona-beta-2-45-54/p3-07-juice-single-munich.png), [p4-05](../screenshots/persona-beta-2-45-54/p4-05-juice-couple-austin.png), [p5-11](../screenshots/persona-beta-2-45-54/p5-11-juice-couple-london.png) · `public/app.js` (`juiceBlock`), `server/juice.js` |
| 2 | **Say where the matches are, across companies.** Everyone switched 3–5 boards by hand. "research analyst Toronto" ended at 0 with "Check the spelling" (place words in the search box match nothing). With a search on, Location "Austin" says "No matches" without "none of these 52". Kept and put-back filters (Good #2) made it bearable. | 5/5 | Empty state, Location filter, company menu · [p1-03](../screenshots/persona-beta-2-45-54/p1-03-search-research-toronto.png), [p2-03](../screenshots/persona-beta-2-45-54/p2-03-location-austin.png) · `public/app.js` (empty state, facet search, `switchCompany`) |
| 3 | **Plain words and grades.** Five examples:<br>- "40 · Dry" and "51 · Ripe" on jobs that meet the person's goal (T);<br>- "Level 4 / Level 5 · These are NVIDIA's own level names" with no plain word (D);<br>- "‹2 ›13" chips on chart rows (G);<br>- "Typically within ±10%" printed next to "Low $70K · High $110K" for a $73K estimate (G, D);<br>- "state or local tax" and "social security" on an Ontario tax line (G). | 4/5 (G, T, P, D) | Juice, drawer, chart, Pay estimate · [p2-12](../screenshots/persona-beta-2-45-54/p2-12-juice-family-austin.png), [p4-04](../screenshots/persona-beta-2-45-54/p4-04-nvidia-pd-drawer.png), [p1-01](../screenshots/persona-beta-2-45-54/p1-01-arrive-pixel8.png), [p1-19](../screenshots/persona-beta-2-45-54/p1-19-estimate-entry.png) · `public/app.js`, `public/features/compstimate.js`, `public/viz/chart.js` |
| 4 | **One currency and one number format per screen.** In Toronto, Munich and London the cards are in CA$, € and £, while the stats line, chart, map legend and Pay estimate are in US dollars ("Median base pay $98K" over CA$ cards). In de-DE, counts use German separators ("2.513 with pay") and money English ones ("$3,250/mo"). | 3/5 (G, P, R) | Stats line, chart, map, Insights · [p1-06](../screenshots/persona-beta-2-45-54/p1-06-toronto-google.png), [p3-05](../screenshots/persona-beta-2-45-54/p3-05-google-munich-ux.png), [p3-12](../screenshots/persona-beta-2-45-54/p3-12-map-google-munich.png) · `public/app.js` `renderKpis`, `public/viz/chart.js`, `public/viz/map.js`, `public/features/compstimate.js` |
| 5 | **Keyword tags that don't fit the job.** Examples:<br>- "FP&A" on a Google *Senior Account Executive*;<br>- "GPUs · Datacenters" on Microsoft's *ITIM Sub-regional lead*;<br>- "Agents" on a *Strategic Account Technology Strategist*;<br>- "Prototyping" on DeepMind's *Impact Portfolio Lead*;<br>- "GCP" on Google's French *Étudiant-chercheur* postings. | 3/5 (G, T, R) | Cards · [p2-02](../screenshots/persona-beta-2-45-54/p2-02-google-account-exec.png), [p5-06](../screenshots/persona-beta-2-45-54/p5-06-microsoft-london-dkk-card.png) · `server/keywords.js` |
| 6 | **Separate title matches from description matches.** Meta "policy": "226 roles · 32 in title". After *Public Policy Manager, Philippines* the list goes straight on to *VP Robotics* with no divider, and the chart leads with Engineering and Legal. Google "policy" in London: 18 roles, none in the title, and Compare companies opens on Software engineering. | 2/5 (G, R) | List, chart, Insights · [rc-05](../screenshots/persona-beta-2-45-54/rc-05-title-vs-description-divider.png), [p5-08](../screenshots/persona-beta-2-45-54/p5-08-compare-policy.png) · `public/app.js` (search ranking), `public/features/insights.js` |
| 7 | **A card's Juice grade should name its place.** Google's two *Key Account Executive* cards both post $147K–204K and both read "New York": one is "41 · Dry", the other ("New York, NY +1") "63 · Ripe", because it is graded for Chicago. Meta's *Communications Director* card reads "Los Angeles", and its Juice is "for one person in Seattle". | 2/5 (T, R) | Cards · [p2-02](../screenshots/persona-beta-2-45-54/p2-02-google-account-exec.png), [p5-03](../screenshots/persona-beta-2-45-54/p5-03-razr-drawer.png) · `public/app.js` (`juiceBadge`, `locSummary`) |
| 8 | **"Same role elsewhere" on phones: keep the counts and the family.** On the desktop it reads "Chip design & silicon engineering, Senior level · Meta 3 · NVIDIA 152…". On a phone it reads "Director+ level in the US · Apple $349K…", with no family and no counts. Netflix's "$380K" for sales is 7 postings. | 2/5 (T, R) | Drawer · [p2-11](../screenshots/persona-beta-2-45-54/p2-11-same-role-elsewhere.png), [p5-13](../screenshots/persona-beta-2-45-54/p5-13-razr-same-role-director.png) · `public/app.js` (drawer comps, phone density rule) |
| 9 | **Use each company's ladder.** Microsoft's "Senior" and "Staff+" come from its own levels but never say which (a *Partner Development Manager* is "Staff+"). NVIDIA gives "Level 4/5" with no plain word. Apple is "Level not stated" on all 34 Austin physical-design roles. | 2/5 (T, D) | Cards, drawer · [p2-15](../screenshots/persona-beta-2-45-54/p2-15-microsoft-ae-drawer.png), [p4-04](../screenshots/persona-beta-2-45-54/p4-04-nvidia-pd-drawer.png) · `server/keywords.js`, `public/features/roles.js` (`displayLevel`) |
| 10 | **Show posted hourly pay first.** Amazon's *Associate Account Executive* reads "$65K–114K · per year · Annualized from hourly pay". The posted "$31.39 - 54.90 USD hourly" is only under Details. Shift and part-time pay already show the hourly rate. | 1/5 (T) | Card, drawer · [p2-18](../screenshots/persona-beta-2-45-54/p2-18-associate-ae-drawer.png) · `public/app.js` `payPill` |
| 11 | **Name saved searches in the currency typed.** "£140,000" is saved as "Microsoft · $188K+ · London". | 1/5 (R) | Company menu · [p5-12](../screenshots/persona-beta-2-45-54/p5-12-return-menu-2-saved.png) · `public/app.js` (saved-search label) |
| 12 | **Say when a role family has no pay in this country.** Compare companies (UK) just leaves Policy & government affairs out of the list. | 1/5 (R) | Insights · [p5-08](../screenshots/persona-beta-2-45-54/p5-08-compare-policy.png) · `public/features/insights.js` |
| 13 | **Part-time and four-day weeks.** Employment type is "Not stated / Contract / Intern"; "Teilzeit" and "part-time" find nothing in Munich. | 1/5 (P) | Filters · [p3-08](../screenshots/persona-beta-2-45-54/p3-08-employment-type.png) · `public/app.js`, `server/keywords.js` |
| 14 | Small things:<br>- the return toast still covers the company menu on the phone (G);<br>- "London" on four boards, "London, England" on Amazon (R);<br>- in landscape at 812×375 only two chart rows show above the collapsed list (D);<br>- "No department" is a chart row and a card department on Google (G);<br>- the internship strip's axis runs to $440K for 11 Canadian internships (G). | 1/5 each | [p1-22](../screenshots/persona-beta-2-45-54/p1-22-return-menu.png), [p5-05](../screenshots/persona-beta-2-45-54/p5-05-amazon-policy-london.png), [p4-12](../screenshots/persona-beta-2-45-54/p4-12-landscape-shared-link.png), [p1-06](../screenshots/persona-beta-2-45-54/p1-06-toronto-google.png) · `public/app.js`, `public/viz/chart.js` |

All of these fit ROADMAP §8: they change words, the drawer's Juice block, existing selects or existing
popovers, and add no main-view control or mode.

### 4.3 Good: keep

1. **All eight of wave 1's Broken items are fixed** (§4.4). — all.
2. **Filters survive a company switch, and come back.** "Kept "designer" · dropped Munich (not at
   Microsoft) for now", then "Kept "designer" · put back Munich" on Apple. — G, T, P, D, R ·
   [p3-10 Microsoft](../screenshots/persona-beta-2-45-54/p3-10-switch-microsoft.png), [p3-10 Apple](../screenshots/persona-beta-2-45-54/p3-10-switch-apple.png) · `public/app.js`.
3. **Pay is priced at the place picked.**
   - Under Austin, Amazon cards show Austin's own row ("$92K–160K", "Posted for Austin").
   - The drawer's "Pay by place" lists every row.
   - Microsoft keeps its NYC row; NVIDIA's two-level spans say "· 2 levels".
   - Another country's pay is named, not used: "Pay posted for Denmark only", "Italy only", "Canada only", with no Juice.

   — T, D, R · [p2-10](../screenshots/persona-beta-2-45-54/p2-10-ae-telco-drawer.png), [p5-06](../screenshots/persona-beta-2-45-54/p5-06-microsoft-london-dkk-card.png), [rc-03](../screenshots/persona-beta-2-45-54/rc-03-cohere-cad-london.png).
4. **Honest estimates and empty states.** Examples:
   - "Not enough comparable roles … Remove a filter or try a broader title";
   - "No similar role at Google in the UK lists pay … Pay from other countries isn't used";
   - "Without the search "Teilzeit": 35 roles · Remove the search".

   — P, R, G · [p3-11](../screenshots/persona-beta-2-45-54/p3-11-insights-google-munich.png), [p5-09](../screenshots/persona-beta-2-45-54/p5-09-estimate-head-policy-london.png), [p3-09](../screenshots/persona-beta-2-45-54/p3-09-teilzeit-empty.png).
5. **Every phone size in the run works:**
   - Pixel 8, iPhone 13 mini, the Razr cover screen (352×355) and the iPhone 13 mini in landscape:
     no sideways scroll; on the Razr and in landscape the job page fills the screen with Apply
     pinned;
   - the Surface Duo with its hinge: chart on one screen, the job on the other, nothing readable on the hinge.

   — G, T, P, D, R · [p5-01](../screenshots/persona-beta-2-45-54/p5-01-razr-cover-meta-policy.png), [p5-03](../screenshots/persona-beta-2-45-54/p5-03-razr-drawer.png), [p3-06](../screenshots/persona-beta-2-45-54/p3-06-chrome-ux-drawer.png), [p4-14](../screenshots/persona-beta-2-45-54/p4-14-landscape-drawer.png).
6. **Saving and coming back:**
   - "Saved in this browser"; "Reopened where you left off: …";
   - saved searches at the top of the company menu;
   - a shared link opens the same view on another device in 0.7 s.

   — all · [p1-17](../screenshots/persona-beta-2-45-54/p1-17-save.png), [p1-22](../screenshots/persona-beta-2-45-54/p1-22-return-menu.png), [p4-12](../screenshots/persona-beta-2-45-54/p4-12-landscape-shared-link.png).
7. **Compare companies follows the person.** Its country follows the Location ("Posted pay in the UK,
   by company") and its family follows the search (Chip design & silicon engineering). It gives a count
   per company and says who is left out and why ("OpenAI, Meta and Apple (don't state levels…)"). —
   T, D, R · [p2-13](../screenshots/persona-beta-2-45-54/p2-13-compare-companies.png), [p4-10](../screenshots/persona-beta-2-45-54/p4-10-compare-chip-staff.png).
8. **The base-pay rule is visible wherever pay is.** "Posted base pay. Equity and bonus aren't
   included" in every drawer, and "As posted: USA, TX, Austin - 31.39 - 54.90 USD hourly" in Details.
   Every sales figure on the big-tech boards was base pay. — T, all.
9. **Place search speaks the person's language.** "Canada", "Deutschland", "München", "Muenchen" and
   "Germany" all work. Remote roles in the person's country come with a city filter ("Also finds roles
   listed for its country"). — G, P, T · [p1-05](../screenshots/persona-beta-2-45-54/p1-05-location-canada.png), [p3-04](../screenshots/persona-beta-2-45-54/p3-04-location-deutschland.png).
10. **Fast enough everywhere but Amazon on a phone.** Most switches, drawers and Insights took 0.1–1.3 s
    at load 3–14. Amazon took 2.3–5.6 s on an unthrottled phone and 4.0 s on the desktop. — all · §3.
11. **The Ranges view stacks identical bands ("×3") and stripes multi-level spans**, which answers the
    user's "too evenly". The Juice breakdown explains each country's tax and household, and Compare
    locations ranks Austin over Santa Clara. — D · [p4-16](../screenshots/persona-beta-2-45-54/p4-16-ranges.png), [p4-06](../screenshots/persona-beta-2-45-54/p4-06-compare-locations.png).

### 4.4 Wave 1's findings for this group: fixed or not

Broken items from [persona-beta-45-54.md](persona-beta-45-54.md) §4.1, re-checked on e800c43:

| # | Wave 1 said | Now |
|---|---|---|
| 1 | Yearly internship pay labelled as a lump sum ("€47,000 · for about 13 weeks") | **Fixed.** "€47,000 a year · EUR · 13-week internship", "CA$43,800–50,000 a year · 26-week internship" ([rc-01](../screenshots/persona-beta-2-45-54/rc-01-google-intern-dublin-drawer.png), [p1-13](../screenshots/persona-beta-2-45-54/p1-13-microsoft-intern-drawer.png)). Still uneven: some Google cards say "CA$120K/year" and their neighbours "CA$120K". **New:** the same Dublin posting drops its German and French pay (Broken #4). |
| 2 | "Same role elsewhere" and "Pays more than N%" compare non-US jobs with US pay | **Fixed.** "Pays more than 48% of Google's roles in Germany", "Nothing to compare yet in Germany … Pay for other countries isn't used" ([p3-06](../screenshots/persona-beta-2-45-54/p3-06-chrome-ux-drawer.png)). |
| 3 | Wrong role families (NVIDIA chip design as software, Netflix distributed systems as hardware) | **Fixed.** "Chip design & silicon engineering" in the drawer and Compare ([p4-04](../screenshots/persona-beta-2-45-54/p4-04-nvidia-pd-drawer.png)); `roleFamily` puts 137 NVIDIA verification titles in chip and every Netflix *Distributed Systems Engineer* in software. |
| 4 | Required and preferred qualifications merged | **Fixed.** "Required" and "Nice to have" ([rc-02](../screenshots/persona-beta-2-45-54/rc-02-google-about-role-required-nice.png)). |
| 5 | Location search says "No matches" for a country or a local name | **Fixed.** "Germany", "Deutschland", "München", "Muenchen", "Canada" ([p3-03](../screenshots/persona-beta-2-45-54/p3-03-location-muenchen.png), [p3-04](../screenshots/persona-beta-2-45-54/p3-04-location-deutschland.png)). |
| 6 | Two medians on one screen ($347K vs $352K) | **Fixed.** NVIDIA: stats line and chart both $239K ([p4-02](../screenshots/persona-beta-2-45-54/p4-02-nvidia.png)). |
| 7 | London Juice from Canadian or Danish pay | **Fixed.** "Pay posted for Denmark only", "Pay posted for Canada only", no Juice ([p5-06](../screenshots/persona-beta-2-45-54/p5-06-microsoft-london-dkk-card.png), [rc-03](../screenshots/persona-beta-2-45-54/rc-03-cohere-cad-london.png)). |
| 8 | Two ages in one drawer | **Fixed.** "Updated 14 days ago" and "Listed 14 days ago (9. Okt. 2026)" ([p3-06](../screenshots/persona-beta-2-45-54/p3-06-chrome-ux-drawer.png)). |

Wave 1's Improve list:
- **Fixed:**
  - #6 department names: NVIDIA's are spelled out; Google is "grouped by job title";
  - #8 the card shows the place the pay is for (under a Location filter);
  - #10 map labels: every pin named, "Munich, Germany · $134K · 35";
  - #12 "my city or remote in my country".
- **Partly fixed:**
  - #1: dropped filters are put back, but there is still no cross-company search;
  - #5: NVIDIA's ladder is named but not explained;
  - #11: Ranges stacks repeats; the list doesn't.
- **Still open:**
  - #2 Juice in the person's terms (Improve 1 here);
  - #3 part of the jargon (Improve 3);
  - #4 title vs description matches (Improve 6);
  - #7 keyword tags (Improve 5);
  - #9 part-time (Improve 13);
  - the phone toast over the menu (Improve 14).

## 5. Replayable steps

1. Serve the lead's build, shared and not rebuilt:
   `node scripts/cycle/serve.mjs --dist <scratch>/cycle-beta7-dist --pid <scratch>/persona-beta-2-45-54/serve.pid`
   (printed `serve: http://127.0.0.1:40931/melon-seek/`).
2. `<scratch>/persona-beta-2-45-54/work/daemon.mjs <base> 47345` holds one Chromium (pid in `daemon.pid`).
   Each step is a snippet POSTed by `run.sh`. Contexts per person:
   - G: Pixel 8 412×915 @2.625, en-CA, America/Toronto;
   - T: iPhone 13 mini 375×812 @3, en-US, America/Chicago;
   - P: Surface Duo 1114×720 @2.5, de-DE, Europe/Berlin, first without and then with the hinge
     (CDP `Emulation.setDeviceMetricsOverride`, `displayFeature` vertical at 540, 34 px, screenshots
     over `Page.captureScreenshot`);
   - D: 1280×800 desktop, then iPhone 13 mini landscape 812×375;
   - R: Razr cover 352×355 @3, then 1440×900, en-GB, Europe/London.

   All phones use `isMobile`, `hasTouch` and the user agent from `test/e2e/phone-sizes.mjs`.
3. Data checks, all on the build's files:
   - `csvq.mjs`: CSV filters by board, place, title and level;
   - `fam.mjs`: `roleFamily` from `public/features/roles.js` over the CSVs;
   - `bonus0.mjs`: `compExtrasEvidence` over `api/desc` (Broken #1);
   - `places.mjs`: `unpackJobs` over `api/jobs`, counting `salary.places` with other places in the same country (Broken #3);
   - `multicountry.mjs`: Google descriptions with pay lines for 2+ countries against the served `salary` (Broken #4).
4. Screenshots shrunk with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/persona-beta-2-45-54`.

## 6. Known gaps

- Timings are unthrottled localhost on a machine shared with four other reviewers (load 3–14). They show
  where people wait, not what a phone on 4G sees.
- Human times are estimates. Apply was checked up to the new tab (the careers sites were stubbed);
  no real application was made.
- Not tested:
  - live board fetches and map tiles (sandbox);
  - dark mode;
  - screen readers;
  - WebKit or real Safari;
  - "N new" on a return visit (wave 1 simulated it; no new postings arrive between my visits).
- Broken #4's count (13) comes from one regex for "<Country>: €X (EUR)" lines. Other formats may add more.

## 7. Change log

- 2026-10-23: five people on the beta build of e800c43 (2026-10-16 crawl), over five phone sizes and two
  desktops; 4 Broken (all sent to the lead), 14 Improve, 11 Good; wave 1's 8 Broken items re-checked
  (all fixed, one with a new related bug).
