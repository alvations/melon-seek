# Process log: persona-stable-25-34

Persona review of the main site (target `stable`) by five job seekers aged 25 to 34, one per
career level. Written 2026-10-10 by the persona reviewer for this age group.

## 1. Brief

- Prompt (verbatim): [prompts/persona-stable-25-34.md](prompts/persona-stable-25-34.md). Template:
  [prompts/cycle/persona-review.md](prompts/cycle/persona-review.md).
- Goal: use the site the way five real people in this age group would, from arriving cold to saving a
  search, and report what to keep, what to improve and what is broken.
- Files owned: this file, the prompt file and `docs/screenshots/persona-stable-25-34/` (87
  screenshots). No product code was touched. Nothing was committed or pushed.

## 2. Inputs and sources

| Source | What it gave |
|---|---|
| `README.md` | What the site promises (chart, map, filters, company switcher, Juice, Compstimate), and the data modes |
| `docs/strategy/ROADMAP.md` §8 | The UI simplicity budget. Every suggestion below fits inside it: no new main-view controls, no new modes; changes go into existing popovers, selects, the drawer or wording |
| `docs/process/PLAYBOOK.md`, `TEMPLATE.md` | Cycle rules and the log format |
| The lead's build `<scratch>/cycle-stable/dist` | The site under test, served by `scripts/cycle/serve.mjs` on a free port |
| `data/snapshots/*.json` | The raw postings the build was made from. Used only to check whether a strange number on screen comes from the posting or from our code |
| `public/app.js`, `public/features/compstimate.js`, `server/keywords.js`, `server/juice.js`, `docs/LIVABILITY.md` | Read only after something looked wrong on screen, to name the owning file |

## 3. Decisions and rationale

1. **The five people.** They are spread across 4 countries (Canada, UK, US, Australia), all 3
   household types and 5 fields. Two use a phone and three use laptops of different sizes, one of
   them in dark mode. Each goal is concrete enough to score as reached or not.
2. **Times.** Each step has two times. "App" is what the script measured on this machine with no
   throttling: navigation start to the element appearing. "Person" is my estimate of how long a
   person spends on the step, reading and deciding included. A separate throttled run (4× CPU,
   150 ms latency, 1.6 Mbit/s) is in §7.
3. **"Coming back later".** I re-opened the site in a new browser context that keeps the same
   localStorage, with no link. To test "N new" honestly I back-dated the saved search and removed
   3 ids from the ids it remembered. The local build has an empty history ledger
   (`api/history/*.json` is `{}`), so "new" falls back to those remembered ids.
4. **What is not reported** (per the lead): the badge falling back to the bundled snapshot ("Live
   fetch failed … CORS") and the grey map tiles.
5. **Severity.** "Broken, fix now" means a number or label is wrong or misleading, or a task is
   blocked. Everything else is "Improve", ranked by how many of the five it would help.

## 4. The five people

### 4.1 Priya Raman, 25, new graduate, Toronto (Canada), single, research. Phone

**Goal:** a research internship or first research job in Toronto or remote in Canada, paying at
least CA$100K a year (or a stipend she can live on), that leaves her CA$2,000 a month after rent for
a one-bedroom.

**Reached? No.** She found the Anthropic Fellows Program (open to people in Ontario and BC) and
Cohere's Research Internship (Winter 2027, Toronto). The Fellows stipend is shown honestly as
annualised weekly pay, but its Juice is only for San Francisco. Cohere's internship has no pay and no
estimate. She never got a Toronto, CA$, per-month figure.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | first card 0.9 s | 10 s | On a phone there is no brand, tagline or explanation above the fold: just "Anthropic", an "Oct 10" pill, a monitor icon, a chart with numbers in bubbles, and a collapsed sheet saying "645 roles". She guesses it's "Anthropic salaries". [p1-priya-02-cold-2s](../screenshots/persona-stable-25-34/p1-priya-02-cold-2s.png) |
| 2 | Tap "Oct 10" | 0.3 s | 15 s | "Where this data comes from": Greenhouse / anthropic, "Snapshot". She doesn't know what Greenhouse or a snapshot is. [p1-priya-a-01](../screenshots/persona-stable-25-34/p1-priya-a-01-badge-popover.png) |
| 3 | Search "intern" | 1.0 s | 30 s | 12 roles, "9 in title". The first 9 are "Warehouse and Logistics Manager - International", "Internal Communications Manager", "Director, US International Tax"… The real internships are 10th to 12th. [p1-priya-a-03](../screenshots/persona-stable-25-34/p1-priya-a-03-sheet-intern.png) |
| 4 | Seniority → Intern | 0.8 s | 20 s | The chip opens the full filter sheet at Seniority, with big tap targets and a live "Show 3 roles" count. There is no "Entry" level at Anthropic; every unlabelled role is "Mid". [p1-priya-b-01](../screenshots/persona-stable-25-34/p1-priya-b-01-seniority-intern-checked.png) |
| 5 | Open "Anthropic Fellows Program, AI Safety & Security" | 1.2 s | 60 s | "$200K USD per year. Annualized from weekly pay (3,850 USD / 2,310 GBP / 4,300 CAD)": good. But it says "2% percentile" in large green type; "Same role elsewhere" compares the fellowship with all full-time Security roles (OpenAI $299K); Juice is "$70K/yr left in San Francisco" only, because "Ontario, Canada" is not a city. [p1-priya-b-04](../screenshots/persona-stable-25-34/p1-priya-b-04-fellows-drawer-top.png), [p1-priya-b-05](../screenshots/persona-stable-25-34/p1-priya-b-05-fellows-juice.png) |
| 6 | Company menu → Cohere → Location Toronto → Lowest pay | 0.17 s switch | 40 s | The menu lists "GREENHOUSE / ASHBY / LEVER" and board slugs ("andurilindustries"), which mean nothing to her. Cohere Toronto has 51 roles; the cheapest are contract annotators at CA$62K, "9 · Dry". [p1-priya-c-01](../screenshots/persona-stable-25-34/p1-priya-c-01-company-menu.png), [p1-priya-c-05](../screenshots/persona-stable-25-34/p1-priya-c-05-cohere-toronto-lowest.png) |
| 7 | Search "intern" at Cohere, open "Research Internship (Winter 2027)" | 1.5 s | 30 s | "Salary not listed", and no estimate. The meta line reads "Internships · Internships · Intern [Intern]"; locations read "Canada · Canada", "United States · United States". Apply on Ashby goes to the right posting. [p1-priya-d-02](../screenshots/persona-stable-25-34/p1-priya-d-02-internship-drawer.png) |
| 8 | Open a Toronto role with pay (Software Engineer, Adoption, CA$215–310K), Juice → Monthly | 1.3 s | 60 s | She filtered Toronto, but the Juice headline and breakdown are for **Montreal** ("best" location). Amounts are in US dollars ("$16K/mo", "−$1K/mo" rent for US$1,239) while the card says CA$. Toronto is hidden in "Compare locations (2)". [p1-priya-e-01](../screenshots/persona-stable-25-34/p1-priya-e-01-toronto-juice-monthly.png), [p1-priya-e-02](../screenshots/persona-stable-25-34/p1-priya-e-02-toronto-juice-compare.png) |
| 9 | Insights | 1.5 s | 45 s | Compstimate: "$279K USD/yr · Low confidence", then "Typically within ±8%". The range bar is labelled "$78K … typical range … $279K" while its High is $381K, drawn inside that bar. Compare companies has no level choice, so she can't compare internships. [p1-priya-f-01](../screenshots/persona-stable-25-34/p1-priya-f-01-insights-top.png) |
| 10 | Save, come back later | 0.2 s save, 1.2 s reopen | 40 s | On a phone, Save is an unlabelled bookmark icon at the end of a scrolling chip row. The toast says "find it in the company menu". Coming back with no link opens **Anthropic**, not Cohere; the search is under "Saved searches" in the company menu and reopens correctly. [p1-priya-g-01](../screenshots/persona-stable-25-34/p1-priya-g-01-saved-toast.png), [p1-priya-h-02](../screenshots/persona-stable-25-34/p1-priya-h-02-return-company-menu.png) |

Total: about 6 minutes.

### 4.2 Marcus Okafor, 28, early career (3 years in software sales), London (UK), couple, sales. Laptop 1366×768

**Goal:** move into AI sales: an Account Executive role in London with a base of at least £80K
(on-target earnings, OTE, of £150K or more), leaving the two of them £2,500 a month after tax and a
two-bedroom rent. His partner earns £38K, which he would like counted.

**Reached? Partly, and with a wrong number.** He found four Anthropic Enterprise AE roles at
"£280K–330K". The site calls that "Posted base pay", but the posting says it is the OTE range
(commission included). He would walk into an interview thinking the base is £280K. Juice is in US
dollars and can't count his partner's income. Scale AI and Shield AI list no London pay, and their
estimates come from US engineering roles.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | first card 0.5 s | 10 s | He reads "melon·seek", "Anthropic 645", a salary chart by department. No tagline says it covers 8 companies. "Add board" and "Snapshot · Oct 10" are unclear. [p2-marcus-01](../screenshots/persona-stable-25-34/p2-marcus-01-cold.png) |
| 2 | Department → Sales, Location → London | 1.4 s each | 25 s | 7 roles, all with pay. The chips turn green with the chosen value, and Save appears. [p2-marcus-04](../screenshots/persona-stable-25-34/p2-marcus-04-sales-london.png) |
| 3 | Open "Enterprise Account Executive - Retail" | 1.2 s | 90 s | "£280K–330K · + bonus mentioned · Posted base pay. Equity and bonus aren't included." The description says: "For sales roles, the range provided is the role's On Target Earnings ("OTE") range… includes both the sales commissions/sales bonuses target and annual base salary." [p2-marcus-b-01](../screenshots/persona-stable-25-34/p2-marcus-b-01-ae-drawer.png) |
| 4 | Juice → Couple → Monthly | 0.9 s | 45 s | "≈86 · Juicy, $13K/mo left", in US dollars. "income $14K · regional $0 · social $911": he doesn't know what "regional" or "social" mean in the UK. The partner's income can't be added. [p2-marcus-b-02](../screenshots/persona-stable-25-34/p2-marcus-b-02-ae-juice-couple-monthly.png) |
| 5 | Map | 2.5 s | 10 s | One pin, "$411K · 7 · London". [p2-marcus-c-01](../screenshots/persona-stable-25-34/p2-marcus-c-01-map-sales-london.png) |
| 6 | Insights → Compare companies | 1.5 s | 60 s | With Sales selected, the card opens on **Software engineering**. He picks "Sales & partnerships": Anthropic $334K (OTE) beside OpenAI $258K (base). Clicking Scale AI jumps there and keeps London and the role family: 2 roles, no pay. [p2-marcus-c-03](../screenshots/persona-stable-25-34/p2-marcus-c-03-insights-compare.png), [p2-marcus-d-01](../screenshots/persona-stable-25-34/p2-marcus-d-01-compare-sales.png), [p2-marcus-d-02](../screenshots/persona-stable-25-34/p2-marcus-d-02-scale-from-compare.png) |
| 7 | Open "Public Sector Lead, Central Government" (Scale AI, London, no pay) | 1.5 s | 40 s | "Compstimate ≈ $225K ($184K–248K, low confidence). Based on 7 similar roles at Scale AI, Senior · London." Scale AI has no London postings with pay; the comparables are US software, ML and data engineers in DC, SF and Denver. [p2-marcus-e-01](../screenshots/persona-stable-25-34/p2-marcus-e-01-nopay-drawer.png) |
| 8 | Switch to Scale AI from the company menu | 0.14 s | 20 s | Sales and London are wiped, so he starts again on 183 roles. [p2-marcus-c-04](../screenshots/persona-stable-25-34/p2-marcus-c-04-scale-after-switch.png) |
| 9 | Save; come back a week later | 0.4 s; 1.2 s | 30 s | The saved search "Anthropic · Sales · London" is in the company menu, and the Couple choice is remembered. No new matches, which is correct. [p2-marcus-g-02](../screenshots/persona-stable-25-34/p2-marcus-g-02-return-menu.png) |

Total: about 5.5 minutes.

### 4.3 Sofia Martínez, 31, mid-career product designer (7 years), Denver (US), family of four, design. Phone

Sofia is going back to work after 18 months of parental leave.

**Goal:** a remote (US) or Denver product design role paying at least $170K base that leaves at least
$3,000 a month after tax, a three-bedroom rent and living costs for two adults and two small
children. Part-time or flexible hours would be a bonus.

**Reached? Partly.** Roles above $170K exist: Anthropic's remote Product Designer at $305K–385K, and
Anduril's Seattle and Costa Mesa designers at $166K–220K. But the site can't tell her what is left
**in Denver**: for the remote role it computes Seattle, San Francisco and New York only. Childcare
is not in the living costs, and the drawer doesn't say so. No part-time roles exist, and the filter
doesn't say that either.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | first card 0.5 s | 10 s | Same phone first screen as Priya. |
| 2 | Search "designer" → Remote | 0.8 s + 1.4 s | 30 s | 1 role: Product Designer, Claude Developer Platform, $305K–385K, "San Francisco, CA +3 · Remote". [p3-sofia-03](../screenshots/persona-stable-25-34/p3-sofia-03-designer-remote-sheet.png) |
| 3 | Juice → Family → Monthly | 1.5 s | 60 s | "≈89 · Juicy, $178K/yr left in Seattle", or $15K/mo. "everyday costs for two adults and two children, excluding rent". Childcare isn't mentioned, and Denver isn't offered; Compare locations lists only Seattle, SF and NY. The rent is "Oct 2025 (update due)". [p3-sofia-b-02](../screenshots/persona-stable-25-34/p3-sofia-b-02-juice-family-monthly.png), [p3-sofia-b-03](../screenshots/persona-stable-25-34/p3-sofia-b-03-juice-compare.png) |
| 4 | Insights → Compare companies → Design | 1.5 s | 45 s | It opens on Software engineering, even though she searched "designer". The Design view is clear on a phone: Anthropic $345K, OpenAI $277K, Anduril $193K, Shield AI $143K, Palantir $132K. Tapping Anduril jumps there with the design family and a helpful toast ("No "designer" / remote roles at Anduril — showing all matches"). [p3-sofia-c-01](../screenshots/persona-stable-25-34/p3-sofia-c-01-compare-design.png), [p3-sofia-c-02](../screenshots/persona-stable-25-34/p3-sofia-c-02-anduril-from-compare.png) |
| 5 | Map | 2.5 s | 15 s | Design pins in Seattle, Costa Mesa and Waltham; nothing in Colorado. [p3-sofia-c-03](../screenshots/persona-stable-25-34/p3-sofia-c-03-map.png) |
| 6 | Look for part-time (Shield AI → More → Employment type) | 0.7 s | 30 s | The options are raw board values: "Full Time Employee, International Office Entity, International EOR, Unspecified, Intern". No part-time anywhere (none of the 5,482 postings is part-time), and nothing says so. [p3-sofia-d-01](../screenshots/persona-stable-25-34/p3-sofia-d-01-employment-type.png) |
| 7 | Anduril "product designer" → Senior Product Designer, Design Systems (Seattle, $166K–220K) | 1.3 s | 60 s | "Same role elsewhere: No other company lists this level", yet OpenAI and Scale AI do post Senior designers. The Family Juice is $66K/yr in Seattle. The card tags say "Autonomy" and "Multimodal" on design roles. [p3-sofia-e-01](../screenshots/persona-stable-25-34/p3-sofia-e-01-anduril-designer-drawer.png) |
| 8 | Copy link → partner opens it | 0.5 s; 0.9 s | 20 s | The link opens the role directly: good. But the partner sees "69 · Ripe, $93K/yr" (one person) where Sofia saw "≈56, $66K/yr" (family), and the headline doesn't say who it's for. [p3-sofia-f-01](../screenshots/persona-stable-25-34/p3-sofia-f-01-shared-link-partner.png) |

Total: about 5 minutes.

### 4.4 Daniel Kim, 33, Staff software engineer (10 years, infrastructure), Seattle (US), couple, engineering. Desktop 1440×900

**Goal:** a Staff-level infrastructure role with a base of at least $400K. He wants to compare
Anthropic, OpenAI and xAI at the same level, and to know whether moving to San Francisco would leave
the two of them more each month than staying in Seattle.

**Reached? Mostly.** Anthropic has dozens of Staff+ infrastructure roles at $320K–485K (some
$405K–485K). The drawer's "Same role elsewhere" compares Staff+ software engineering across five
companies, and a click jumps to OpenAI's 5 matches. Compare locations answers the move question:
Seattle leaves $22K a month, SF $18K, NY $17K. xAI can't be compared: none of its 305 roles carries a
Staff level, so all of them read "Mid".

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive, "/" then type "infrastructure" | 0.7 s | 15 s | The "/" shortcut works from a fresh page. |
| 2 | Seniority → Staff+; Salary Min | 0.5 s | 45 s | He types "400" in Min and presses Enter: it silently goes back to "Any". "400k" works: 68 roles. "A role matches if its range overlaps yours" explains why $320K–485K counts. [p4-daniel-01](../screenshots/persona-stable-25-34/p4-daniel-01-salary-typed-400.png), [p4-daniel-03](../screenshots/persona-stable-25-34/p4-daniel-03-staff-infra-400k.png) |
| 3 | Ranges view, hover, click | 0.8 s | 30 s | The tooltip gives "£325K – £485K GBP ≈ $438K – $654K USD (approx)", title, team and level; a click opens the role. Clear. [p4-daniel-c-01](../screenshots/persona-stable-25-34/p4-daniel-c-01-ranges-hover.png) |
| 4 | Open "Staff+ Software Engineer, Data Infrastructure" ($405K–485K) | 1.3 s | 90 s | Same role elsewhere, Staff+ software engineering: Anthropic $425K, OpenAI $355K, Scale AI $283K, Anduril $256K, Shield AI $244K. Juice for a couple: Seattle $22K/mo, SF $18K/mo, NY $17K/mo. But it's two collapsed sections deep. The couple keeps **more** than a single person ($270K vs $254K a year); joint filing explains it, but nothing on screen says so. [p4-daniel-d-01](../screenshots/persona-stable-25-34/p4-daniel-d-01-drawer-top.png), [p4-daniel-d-02](../screenshots/persona-stable-25-34/p4-daniel-d-02-juice-couple-compare.png) |
| 5 | Click the OpenAI row | 1.4 s | 30 s | It switches to OpenAI with search, Staff+ and the software family kept: 5 roles from $257K to $510K. The rows are clickable, but only a hover tooltip says so. [p4-daniel-e-01](../screenshots/persona-stable-25-34/p4-daniel-e-01-openai-staff.png) |
| 6 | xAI via company menu | 0.15 s | 45 s | The filters reset. Seniority offers Intern, Mid, Senior, Manager and Director+, with no Staff. "Member of Technical Staff – $180K–440K" is "Mid", and its Same role elsewhere compares it with Anthropic's "Mid" research roles at a $600K median. The "/" shortcut does nothing after closing the Seniority popover. [p4-daniel-e-02](../screenshots/persona-stable-25-34/p4-daniel-e-02-xai-seniority.png), [p4-daniel-f-01](../screenshots/persona-stable-25-34/p4-daniel-f-01-xai-mts-drawer.png) |
| 7 | Save; come back weeks later (3 roles marked unseen) | 0.4 s; 1.2 s | 40 s | The company menu shows "Anthropic · "infrastructure" · $400K+ · Staff+ · 3 new", and the 3 cards carry a New tag. Good. But sorting by **Newest** lists a 59-day-old role first and a 2-day-old one 10th: title matches always come first, and only a tooltip on "· 9 in title" says so. [p4-daniel-i-01](../screenshots/persona-stable-25-34/p4-daniel-i-01-menu-3-new.png), [p4-daniel-j-01](../screenshots/persona-stable-25-34/p4-daniel-j-01-newest-order.png) |

Total: about 5 minutes.

### 4.5 Aisha Rahman, 34, Director of Operations, Sydney (Australia), family of four, operations. Laptop 1280×800, dark mode

**Goal:** a manager- or director-level operations, programme or business-operations role in
Sydney (or remote from Australia), paying at least A$250K base and leaving at least A$4,000 a month
for a family of four. If Sydney has nothing with pay, she wants to know whether London or Singapore is
worth the move.

**Reached? No.** Anthropic's 9 Sydney roles and Anduril's 55 list no pay, apart from 5 US-dollar
contractor recruiting roles. The drawer gives a confident-looking "≈ $349K … Director+ · Sydney"
built only from San Francisco, New York and Boston postings. The Insights estimate says the
opposite: "Not enough comparable roles … Sydney". London works as a fallback: an Engineering Manager at
£255K–325K leaves the family about $11K a month, in US dollars.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold (dark mode) | first card 1.7 s | 10 s | Dark mode is clean and legible. [p5-aisha-01](../screenshots/persona-stable-25-34/p5-aisha-01-cold-dark.png) |
| 2 | Location search "Sydney" in the left panel | 0.6 s | 30 s | 9 roles, "0% list pay". The chart says "No published salaries — 9 postings match, but none list a salary range" and offers no next step. [p5-aisha-03](../screenshots/persona-stable-25-34/p5-aisha-03-anthropic-sydney.png) |
| 3 | Open "Head of Customer Success, APAC" | 1.3 s | 45 s | "Compstimate ≈ $349K ($293K–411K, low confidence). Based on 5 similar roles at Anthropic, Director+ · Sydney… Typically within ±14%… level model Oct 2026". All 5 comparables are US. [p5-aisha-b-01](../screenshots/persona-stable-25-34/p5-aisha-b-01-head-cs-drawer.png) |
| 4 | Insights, Sydney filter on, title "Head of Operations" | 1.5 s | 45 s | "Not enough comparable roles with posted pay at Anthropic for "Head of Operations" · Sydney." Honest, but it contradicts step 3. [p5-aisha-b-03](../screenshots/persona-stable-25-34/p5-aisha-b-03-insights-head-ops.png) |
| 5 | Manager + Director+ → Map → Juice colouring → London pin | 2.5 s; 1.2 s | 90 s | The map legend explains the grades with thresholds ("Dry < 45 · < $48K/yr …"). Clicking the London pin filters to 4 roles. Engineering Manager, Connectivity, £255K–325K, Family, Monthly: $11K/mo left in US dollars, "Each person is taxed separately here". [p5-aisha-c-01](../screenshots/persona-stable-25-34/p5-aisha-c-01-map-juice-managers.png), [p5-aisha-d-02](../screenshots/persona-stable-25-34/p5-aisha-d-02-london-family-juice.png) |
| 6 | Anduril, Sydney, sort Most juice | 0.6 s | 45 s | The top card is a "Recruiting Coordinator (Contractor)" whose Juice is for **Huntsville, AL**, not Sydney, graded "≈0 · Rind", a grade the Juice filter doesn't offer. [p5-aisha-e-01](../screenshots/persona-stable-25-34/p5-aisha-e-01-anduril-sydney-most-juice.png), [p5-aisha-e-02](../screenshots/persona-stable-25-34/p5-aisha-e-02-anduril-sydney-top-juice.png) |
| 7 | "How it's calculated" | 1.2 s | 20 s | The methodology page opens on the site, readable. [p5-aisha-e-03](../screenshots/persona-stable-25-34/p5-aisha-e-03-methodology.png) |
| 8 | Compare companies → Business operations & strategy; Save | 0.6 s | 40 s | "xAI · 3 · $52K": two of the three are Spring and Summer 2027 internships at $24.50–26 an hour, annualised. There's no level control. [p5-aisha-f-01](../screenshots/persona-stable-25-34/p5-aisha-f-01-compare-bizops.png) |

Total: about 5.5 minutes.

## 5. Findings for the group

The owning files are my best reading of the code; the lead assigns the lanes.

### 5.1 Broken, fix now

| # | Problem | Who | Screen | Screenshot | Owning file |
|---|---|---|---|---|---|
| B1 | **Anthropic's sales pay is OTE but is labelled base.** 102 Anthropic sales postings with pay say the range is "On Target Earnings… includes both the sales commissions… and annual base salary". The drawer says "Posted base pay. Equity and bonus aren't included." Juice treats it as base pay, and Compare companies / Same role elsewhere compare it with other companies' base pay (Sales & partnerships: Anthropic $334K vs OpenAI $258K) | Marcus (also Aisha: Head of CS is in Sales) | Drawer pay block; Juice; Insights → Compare companies | [p2-marcus-b-01](../screenshots/persona-stable-25-34/p2-marcus-b-01-ae-drawer.png), [p2-marcus-d-01](../screenshots/persona-stable-25-34/p2-marcus-d-01-compare-sales.png) | Detection: `server/keywords.js` (comp extras) or `server/salary.js`; label: `public/app.js` (`payLabels`, pay note); comps: `scripts/build-market.js`, `public/features/comps.js` |
| B2 | **Estimates for non-US roles come from US roles but carry the non-US city.** "≈ $225K … 7 similar roles at Scale AI, Senior · London" uses US software, ML and data engineers for a London public-sector sales lead. "≈ $349K … Director+ · Sydney" uses only SF, NY and Boston postings. Insights says "Not enough comparable roles … Sydney" for the same thing | Marcus, Aisha | Drawer Compstimate (no-pay roles) | [p2-marcus-e-01](../screenshots/persona-stable-25-34/p2-marcus-e-01-nopay-drawer.png), [p5-aisha-b-01](../screenshots/persona-stable-25-34/p5-aisha-b-01-head-cs-drawer.png) vs [p5-aisha-b-03](../screenshots/persona-stable-25-34/p5-aisha-b-03-insights-head-ops.png) | `public/app.js#compstimateBlock` (the basis line uses the job's own location and level, not the comparables'); `public/features/compstimate.js#compstimateForJob` (no country rule; engineers used for a sales role) |
| B3 | **Searching "intern" finds "International" and "Internal" first.** The title match is a plain substring and title matches are listed first, so 9 of 12 results are directors, managers and tax roles; the 3 real internships come last | Priya | Search, results list | [p1-priya-a-03](../screenshots/persona-stable-25-34/p1-priya-a-03-sheet-intern.png) | `public/app.js` (`titleMatch` at line 533 and the `q` filter): match at word starts; treat intern / internship / co-op as one term |
| B4 | **"Mid" is shown as a fact when the title has no level.** About half of all postings get "Mid" by default (`server/keywords.js`). All 305 xAI roles are Mid/Senior/Manager/Director/Intern with no Staff; a $500K–850K Anthropic research role reads "Mid"; Same role elsewhere compares xAI's "Member of Technical Staff" with Anthropic "Mid" research roles at a $600K median | Daniel, Priya, Marcus, Sofia | Cards, drawer badge, Seniority filter, Same role elsewhere | [p4-daniel-e-02](../screenshots/persona-stable-25-34/p4-daniel-e-02-xai-seniority.png), [p4-daniel-f-01](../screenshots/persona-stable-25-34/p4-daniel-f-01-xai-mts-drawer.png) | `server/keywords.js#seniorityOf` (`BY_DEFAULT`, `seniorityBasis`); `public/app.js` (badge); `public/features/comps.js` (level cells). Show "Level not stated" and keep defaults out of level matches |
| B5 | **Compare companies mixes internships with full-time pay.** "Business operations & strategy · xAI · 3 · $52K": two of the three are hourly 2027 internships. The card says "the same kind of role" and has no level control | Aisha (and anyone comparing xAI or Palantir, which have many interns) | Insights → Compare companies | [p5-aisha-f-01](../screenshots/persona-stable-25-34/p5-aisha-f-01-compare-bizops.png) | `scripts/build-market.js`, `public/features/comps.js` (family cells: leave interns out, or split by level); `public/viz/comps.js` |
| B6 | **Same role elsewhere's fallback is wrong and apples to oranges.** "No other company lists this level, so this compares all Security roles" puts an intern fellowship beside full-time security engineers (OpenAI $299K). "No other company lists this level" for a Senior Product Designer is untrue: OpenAI and Scale AI post Senior designers, just fewer than 3 with pay | Priya, Sofia | Drawer → Same role elsewhere | [p1-priya-b-04](../screenshots/persona-stable-25-34/p1-priya-b-04-fellows-drawer-top.png), [p3-sofia-e-01](../screenshots/persona-stable-25-34/p3-sofia-e-01-anduril-designer-drawer.png) | `public/features/comps.js#compsForJob` (fallback), `public/app.js` (comps block around lines 2513–2575). Say "Too few postings at this level elsewhere", and never fall back from Intern to all levels |
| B7 | **The Compstimate range bar's end labels don't match the bar.** It reads "$78K · typical range for these filters · $279K", but the bar runs from min(5th percentile, Low) to max(95th, High), and its High of $381K is drawn inside it. The estimate dot ($279K) sits at about 65% of the bar under a right-hand label that also says $279K | Priya (any filtered estimate) | Insights → Compstimate | [p1-priya-f-01](../screenshots/persona-stable-25-34/p1-priya-f-01-insights-top.png) | `public/features/compstimate.js` around lines 730–760 (label the ends `lo` and `hi`, or clamp the band) |
| B8 | **The sort isn't honoured while a search is active.** With "infrastructure" searched, "Newest" shows 59d, 3mo, 4mo … 11mo, then 2d, 4d, 7d; "Highest pay" puts $500K–850K roles 10th. Title matches always come first, and only a hover tooltip on "· 9 in title" says so | Daniel (and Priya, step 3) | Results list sort | [p4-daniel-j-01](../screenshots/persona-stable-25-34/p4-daniel-j-01-newest-order.png) | `public/app.js` (lines 525–530). Sort within groups and show a visible "Other matches" divider, or let the chosen sort win |

### 5.2 Improve (ranked by how many of the 5 it helps)

| # | Change | Helps | Screen | Screenshot | Owning file |
|---|---|---|---|---|---|
| I1 | **Let people search across companies, or keep filters when switching.** `switchCompany` resets every filter; there is no "All companies". Each person re-applied the same filters 2 to 5 times. The Compare-companies jump already carries filters; the company menu should too, or offer "All 8 companies" as a list option, inside the existing menu | 5/5 | Company menu | [p2-marcus-c-04](../screenshots/persona-stable-25-34/p2-marcus-c-04-scale-after-switch.png) | `public/app.js#switchCompany` (line 891), `makeCompanyMenu` |
| I2 | **Say what the site is in the first 10 seconds.** The phone shows no brand or tagline at all, and the desktop shows the logo only. Nobody learns it covers 8 companies, that pay is posted base pay, or what the numbers in the bubbles mean (on a phone they can only be tapped, not hovered). One line of muted text under the stats line, or in the empty sheet, would do. That adds no control | 5/5 | Top of page | [p1-priya-02-cold-2s](../screenshots/persona-stable-25-34/p1-priya-02-cold-2s.png), [p2-marcus-01](../screenshots/persona-stable-25-34/p2-marcus-01-cold.png) | `public/index.html`, `public/styles.css` |
| I3 | **Replace jargon on job-seeker screens:** Compstimate; Juicy / Ripe / Dry / Rind (Rind is missing from the filter); Staff+, Director+; Clusters / Ranges; "middle 50%"; "87% list pay"; "2% percentile"; Snapshot; "Add board", "Job boards", GREENHOUSE / ASHBY / LEVER and board slugs; "Apply on Ashby"; "level model Oct 2026"; tax "regional" and "social"; "≈" before a Juice score; "International EOR"; "2y+" | 5/5 | Everywhere | [p1-priya-c-01](../screenshots/persona-stable-25-34/p1-priya-c-01-company-menu.png), [p3-sofia-d-01](../screenshots/persona-stable-25-34/p3-sofia-d-01-employment-type.png) | `public/app.js`, `public/features/*.js`, `public/viz/*.js` |
| I4 | **Stop showing "(update due)" to job seekers.** "rent Sep 2026 (update due) · living costs Sep 2026 (update due) · FX Jul 2026 (update due)" sits under every Juice and comparison; Seattle's rent is "Oct 2025 (update due)". Show the date only, warn only when data is really old, and refresh Seattle | 5/5 | Drawer Juice, Same role elsewhere | [p1-priya-b-05](../screenshots/persona-stable-25-34/p1-priya-b-05-fellows-juice.png), [p3-sofia-b-02](../screenshots/persona-stable-25-34/p3-sofia-b-02-juice-family-monthly.png) | `public/features/freshness.js`, `data/cities.json` (Seattle rent) |
| I5 | **Make saved searches easier to find and return to.** On a phone, Save is an unlabelled bookmark at the end of a scrolling chip row. Saved searches live inside the company menu. Coming back with no link opens Anthropic, not the last company or the saved search | 5/5 | Quickbar, company menu, return visit | [p1-priya-g-01](../screenshots/persona-stable-25-34/p1-priya-g-01-saved-toast.png), [p1-priya-h-01](../screenshots/persona-stable-25-34/p1-priya-h-01-return-cold.png) | `public/app.js` (`renderQuickbar`, start-up company choice), `public/styles.css` |
| I6 | **Juice should follow the place you chose.** With a location filter, show that location's Juice (Toronto, not Montreal; Sydney, not Huntsville, AL) and sort "Most juice" by it. For remote roles, let the person pick the city they'd live in (Denver), inside the existing Juice section | 4/5 (Priya, Sofia, Aisha, Daniel) | Drawer Juice, Most juice sort | [p1-priya-e-01](../screenshots/persona-stable-25-34/p1-priya-e-01-toronto-juice-monthly.png), [p5-aisha-e-02](../screenshots/persona-stable-25-34/p5-aisha-e-02-anduril-sydney-top-juice.png), [p3-sofia-b-03](../screenshots/persona-stable-25-34/p3-sofia-b-03-juice-compare.png) | `public/app.js#juiceBlock`, sort `juice`, `server/juice.js` (best location) |
| I7 | **Compare companies should start from your filters and offer a level.** With Sales or "designer" active it opened on Software engineering. There's no Intern / Staff+ / Director+ choice, which Priya, Daniel and Aisha needed. It could go in the existing select | 4/5 (Marcus, Sofia, Daniel, Aisha) | Insights → Compare companies | [p2-marcus-c-03](../screenshots/persona-stable-25-34/p2-marcus-c-03-insights-compare.png) | `public/viz/comps.js`, `public/app.js` (around line 1751) |
| I8 | **Bring "Compare locations" up.** The answer to "Seattle or SF?" is two collapsed sections deep (Juice, then Compare locations). Show the 2 or 3 cities on the Juice headline line | 4/5 (Daniel, Priya, Sofia, Aisha) | Drawer Juice | [p4-daniel-d-02](../screenshots/persona-stable-25-34/p4-daniel-d-02-juice-couple-compare.png) | `public/app.js#juiceBlock` |
| I9 | **Make households real.** Add a family of three or a single parent; allow a second earner's income (Marcus's partner); say "childcare not included" next to Family living costs; explain why a US couple keeps more than a single person (joint filing) | 4/5 (Sofia, Marcus, Aisha, Daniel) | Drawer Juice | [p3-sofia-b-02](../screenshots/persona-stable-25-34/p3-sofia-b-02-juice-family-monthly.png), [p4-daniel-d-02](../screenshots/persona-stable-25-34/p4-daniel-d-02-juice-couple-compare.png) | `public/app.js` (`HOUSEHOLDS`, waterfall notes), `server/juice.js` |
| I10 | **Show pay and Juice in the local currency** (CA$, £, A$) as well as US dollars; let the salary box take the local currency | 3/5 (Priya, Marcus, Aisha) | Drawer Juice, salary filter | [p2-marcus-b-02](../screenshots/persona-stable-25-34/p2-marcus-b-02-ae-juice-couple-monthly.png) | `public/app.js` (`juiceBlock`, `money`, `makeSalary`) |
| I11 | **Give exact monthly figures.** Monthly view rounds to thousands: rent "−$1K/mo" is US$1,239 and "$7K/mo" left is $7,000 ± $500. Monthly budgets need dollars | 3/5 (Priya, Sofia, Marcus) | Drawer Juice → Monthly | [p1-priya-e-01](../screenshots/persona-stable-25-34/p1-priya-e-01-toronto-juice-monthly.png) | `public/app.js#juiceBlock` (`amt`) |
| I12 | **Fix keyword tags people can see.** "CAD" comes from "4,300 CAD" (Canadian dollars) on the Fellows role; "Mechanical design" from "mechanisms" on a VAT tax role; "Autonomy" on sales and design roles. Cards have only 2 tag slots, so a wrong tag costs a lot | 3/5 (Priya, Marcus, Sofia) | Cards, drawer keywords | [p1-priya-a-03](../screenshots/persona-stable-25-34/p1-priya-a-03-sheet-intern.png) | `server/keywords.js` (lines 513, 520, 521) |
| I13 | **Make the pay and estimate wording plain.** "2% percentile" in large green should read "Pays more than 2% of roles" in muted text. "Low confidence" next to "Typically within ±8%" contradicts itself: say the ±8% is for the whole company | 3/5 (Priya, Marcus, Aisha) | Drawer pay block, Compstimate | [p1-priya-b-04](../screenshots/persona-stable-25-34/p1-priya-b-04-fellows-drawer-top.png) | `public/app.js`, `public/features/compstimate.js` |
| I14 | **Make the card age unambiguous.** "6mo" on a fellowship reads as its length; add "listed" (the drawer already says "Listed 183 days ago") | 2/5 (Priya, Daniel) | Cards | [p1-priya-b-03](../screenshots/persona-stable-25-34/p1-priya-b-03-intern-anthropic-sheet.png) | `public/app.js` (card age slot) |
| I15 | **Give no-pay screens a next step.** The empty Sydney chart should point to the estimate in Insights; an internship with no pay and no estimate could show the company's other intern pay | 2/5 (Aisha, Priya) | Chart empty state, drawer | [p5-aisha-03](../screenshots/persona-stable-25-34/p5-aisha-03-anthropic-sydney.png) | `public/viz/chart.js`, `public/app.js` |
| I16 | **Say which household a Juice figure is for.** A shared link shows a different number from the sender's, and nothing says why | 2/5 (Sofia, Marcus) | Drawer Juice headline | [p3-sofia-f-01](../screenshots/persona-stable-25-34/p3-sofia-f-01-shared-link-partner.png) | `public/app.js#juiceBlock` |
| I17 | **Speed up big boards on phones.** At 4× CPU and 1.6 Mbit/s: first card 2.5 s, switching to Anduril (2,491 roles) 3.3 s, Insights 2.7 s | 2/5 (Priya, Sofia) | Company switch, Insights | (timings in §7) | `public/app.js` (`prepare`), `public/api.js` |
| I18 | **Read "400" in the salary box as $400K, or say it wasn't understood.** Right now it silently becomes "Any" | 1/5 (Daniel) | Salary popover | [p4-daniel-01](../screenshots/persona-stable-25-34/p4-daniel-01-salary-typed-400.png) | `public/app.js#makeSalary` (`parseBound`) |
| I19 | **Use plain words for employment types, and say "No part-time roles"** instead of showing raw values ("International EOR", "Unspecified 645") | 1/5 (Sofia) | More → Employment type | [p3-sofia-d-01](../screenshots/persona-stable-25-34/p3-sofia-d-01-employment-type.png) | `public/app.js` (filter panel), `server/normalize.js` |
| I20 | **Remove repeats in the drawer header.** "Internships · Internships · Intern [Intern]"; "Canada · Canada" | 1/5 (Priya) | Drawer header, Locations | [p1-priya-d-02](../screenshots/persona-stable-25-34/p1-priya-d-02-internship-drawer.png) | `public/app.js#drawerContent` |
| I21 | **Show that Same role elsewhere rows are clickable without hover** (a chevron or "See roles"), and make "/" focus search even when a chip has focus | 1/5 (Daniel) | Drawer, keyboard | [p4-daniel-d-01](../screenshots/persona-stable-25-34/p4-daniel-d-01-drawer-top.png) | `public/viz/comps.js`, `public/app.js` (key handler) |

### 5.3 Good: keep

| # | What works | Who | Screen | Screenshot | Owning file |
|---|---|---|---|---|---|
| G1 | Honest annualising: "Annualized from weekly pay (3,850 USD / 2,310 GBP / 4,300 CAD)", "from hourly pay (22.12–32.69 USD per hour)", and the original text kept | Priya, Aisha | Drawer pay block | [p1-priya-b-04](../screenshots/persona-stable-25-34/p1-priya-b-04-fellows-drawer-top.png) | `public/app.js#annualNote` |
| G2 | Chart tooltips and clicks: a range bar gives local currency, ≈ USD, title, team and level, and a click opens the role; a cluster bubble says "13 roles · $300K–$400K" and a click filters to them | Daniel, Marcus | Chart | [p4-daniel-c-01](../screenshots/persona-stable-25-34/p4-daniel-c-01-ranges-hover.png), [p2-marcus-h-01](../screenshots/persona-stable-25-34/p2-marcus-h-01-cluster-bubble-hover.png) | `public/viz/chart.js` |
| G3 | The Juice waterfall (gross → tax → rent → living → left) with Just me / Couple / Family and Monthly / Yearly; the household is remembered between visits | Marcus, Sofia, Daniel, Aisha | Drawer Juice | [p3-sofia-b-02](../screenshots/persona-stable-25-34/p3-sofia-b-02-juice-family-monthly.png) | `public/app.js#juiceBlock` |
| G4 | Compare locations answers "should we move?" in one look (Seattle $22K, SF $18K, NY $17K a month) | Daniel | Drawer Juice | [p4-daniel-d-02](../screenshots/persona-stable-25-34/p4-daniel-d-02-juice-couple-compare.png) | `public/app.js#juiceBlock` |
| G5 | Same role elsewhere at the same level, with clickable rows that jump to the other company and keep location, search, level and role family; a toast when a carried filter leaves nothing | Daniel, Marcus, Sofia | Drawer, Insights | [p4-daniel-d-01](../screenshots/persona-stable-25-34/p4-daniel-d-01-drawer-top.png), [p3-sofia-c-02](../screenshots/persona-stable-25-34/p3-sofia-c-02-anduril-from-compare.png) | `public/app.js#pickCompany`, `public/viz/comps.js` |
| G6 | Saved searches work end to end: "Saved — find it in the company menu", a "3 new" badge on return, and New tags on the cards | Daniel, Marcus, Priya | Company menu | [p4-daniel-i-01](../screenshots/persona-stable-25-34/p4-daniel-i-01-menu-3-new.png) | `public/app.js` (saved searches) |
| G7 | Honest empty states: "Salary not listed — this posting doesn't include a pay range", "No published salaries — 9 postings match…", "Not enough comparable roles … Sydney" | Priya, Aisha | Drawer, chart, Insights | [p5-aisha-b-03](../screenshots/persona-stable-25-34/p5-aisha-b-03-insights-head-ops.png) | `public/app.js`, `public/viz/chart.js`, `public/features/compstimate.js` |
| G8 | Listing honesty: "Listed 183 days ago (Apr 10, 2026). Open 180+ days. Some companies keep a posting open…" | Priya, Daniel | Drawer → Listing | [p1-priya-b-04](../screenshots/persona-stable-25-34/p1-priya-b-04-fellows-drawer-top.png) | `public/features/freshness.js` |
| G9 | Apply is one clear button that names the destination, opens the right posting in a new tab and sits beside a working copy-link; a copied link reopens the role directly | All 5 | Drawer footer | [p3-sofia-e-01](../screenshots/persona-stable-25-34/p3-sofia-e-01-anduril-designer-drawer.png) | `public/app.js#drawerContent` |
| G10 | The phone filter sheet: big tap targets and a live "Show 3 roles" count | Priya, Sofia | Filter sheet | [p1-priya-b-01](../screenshots/persona-stable-25-34/p1-priya-b-01-seniority-intern-checked.png) | `public/app.js`, `public/styles.css` |
| G11 | Fast on this machine: first card 0.4–0.9 s, company switch 140–170 ms, search under 1 s | All 5 | Everywhere | (timings in §4) | — |
| G12 | Dark mode is clean; the map's Juice colouring has a legend with thresholds; clicking a pin filters the list | Aisha | Map | [p5-aisha-c-01](../screenshots/persona-stable-25-34/p5-aisha-c-01-map-juice-managers.png), [p5-aisha-d-01](../screenshots/persona-stable-25-34/p5-aisha-d-01-map-london-click.png) | `public/viz/map.js` |
| G13 | The methodology page opens on the site and reads like a guide | Aisha | Methodology | [p5-aisha-e-03](../screenshots/persona-stable-25-34/p5-aisha-e-03-methodology.png) | `scripts/methodology.js`, `docs/METHODOLOGY_GUIDE.md` |

## 6. Replayable steps

1. Serve the lead's build (shared with other reviewers, so don't rebuild it):

   ```sh
   S=/tmp/claude-0/-home-user-melon-seek/<session>/scratchpad
   mkdir -p $S/persona-stable-25-34
   node scripts/cycle/serve.mjs --dist $S/cycle-stable/dist --pid $S/persona-stable-25-34/serve.pid &
   # serve: http://127.0.0.1:<port>/melon-seek/
   ```

2. Playwright as ES modules: ESM ignores `NODE_PATH`, so symlink the shared install next to the
   scripts: `ln -sfn ../pw/node_modules $S/persona-stable-25-34/node_modules`. A helper module
   (`h.mjs`) launches `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, with a phone context of
   `{ viewport: 390×844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }` or a desktop
   context of 1440×900, 1366×768 or 1280×800 (Aisha with `colorScheme: 'dark'`). It numbers
   screenshots `<persona>-<nn>-<step>.png` and logs elapsed time.
3. One script per person and stage (`p1a…p1h`, `p2a…p2f`, `p3a…p3f`, `p4a…p4i`, `p5a…p5f`),
   driving only visible controls: taps on phones, clicks and keys on desktop. Each saves
   `context.storageState()` so the next stage continues from it. Only deep links that a person would
   also have (a saved or shared URL) are used to resume.
4. "Come back later": a new context from the saved storage state; the saved search's `lastSeenAt`
   back-dated; 3 ids removed from its `seen` list (§3.3).
5. Throttled timing: CDP `Emulation.setCPUThrottlingRate {rate: 4}` and
   `Network.emulateNetworkConditions {latency: 150, download: 1.6 Mbit/s}` on the phone context.
6. Cross-checks against the raw data, run from Node:
   - OTE wording in Anthropic descriptions: 565 of 645 postings carry the boilerplate; 102 are
     sales roles with pay;
   - Compstimate comparables: `compstimateForJob` from `public/features/compstimate.js`, run on
     `data/snapshots/{scaleai,anthropic,anduril}.json`;
   - xAI business-operations cell: `roleFamily` from `public/features/roles.js`.
7. Shrink the screenshots: `convert f.png -colors 128 PNG8:f.png` (ImageMagick). This took the
   folder from 18 MB to 5.4 MB and the text stays readable.
8. Stop the server: `kill "$(cat $S/persona-stable-25-34/serve.pid)"`.

## 7. Verification

- 87 screenshots in `docs/screenshots/persona-stable-25-34/`, each linked from §4 or §5. Shots
  from failed first attempts that showed the wrong state were deleted.
- Every "Broken" item was confirmed against the raw data or the code, not only on screen:
  - B1: the OTE sentence quoted from the posting;
  - B2: the comparables listed (all US);
  - B3: `titleMatch` uses `includes`;
  - B5: the xAI cell's three postings;
  - B7: the scale labels use p5 and p95 while the bar spans `lo` and `hi`;
  - B8: the order dumped for all 68 cards.
- Throttled phone (4× CPU, 150 ms, 1.6 Mbit/s): DOMContentLoaded 1.85 s, first card 2.50 s,
  switch to Anduril 3.26 s, search "engineer" on Anduril 0.65 s, Map 1.33 s, Insights 2.68 s.
- Console errors: only `net::ERR_TUNNEL_CONNECTION_FAILED` (live board and tile fetches, expected in
  this sandbox). No page errors.
- No tests were written: this review's output is findings for the fix lanes. B3, B7 and B8 can each
  be written as a failing e2e test against the same build.

## 8. Known gaps and follow-ups

- The local build has no history ledger, so "New" and "N new" were tested through the remembered-ids
  fallback. With the ledger (production), "new" uses `firstSeenAt` and should be re-checked once.
- The real Apply pages and the map tiles couldn't be reached from the sandbox. The Apply URLs were
  checked as strings.
- Screen readers weren't tested; the accessibility checks belong to desktop and mobile QA.
- Only one network profile was used for the throttled run.
- The time estimates in "Person" are a reviewer's judgement, not measured users.

## 9. Change log

- 2026-10-10 11:00 UTC: server started; README and ROADMAP §8 read; personas chosen after checking
  the data for Toronto, London sales, US design, Staff infrastructure and Australia.
- 2026-10-10 11:05–11:25 UTC: five runs. Raw-data and code cross-checks for B1 to B8.
- 2026-10-10 11:30 UTC: screenshots shrunk, this log written, prompt saved verbatim.
