# Process log: persona-beta-2-45-54

## State

- 2026-10-23 21:10 UTC: brief saved; server and browser daemon up on the lead's build
  (`cycle-beta7-dist`, e800c43). Personas defined; starting person 1.
- Next: run the five people in the browser, then the re-check of wave 1, then the three lists.

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
