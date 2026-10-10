# Process log: persona review, stable site, job seekers aged 55 and over

## 1. Brief

Prompt: [`prompts/persona-stable-55-plus.md`](prompts/persona-stable-55-plus.md) (verbatim).
Goal: play five job seekers aged 55+, one per career level, on the local `stable` build
(today's real snapshot of the 8 boards, fetched 09:54 UTC on 2026-10-10). Each person does
their real task in the browser. Then list for the group what is good, what to improve and
what is broken.
Files owned: this file, the prompt file, and `docs/screenshots/persona-stable-55-plus/`
(91 PNGs, 6.8 MB after 256-colour quantization). No product code was edited, nothing was
committed.

**Not reported, as the lead asked:** the badge falling back to the bundled snapshot ("Live fetch
failed … blocked by CORS or the network") and grey map tiles ("Basemap unavailable").

## 2. Inputs and sources

- `README.md` (data modes, Juice, Compstimate, saved searches, static build).
- `docs/strategy/ROADMAP.md` §8, the UI simplicity budget. The suggestions below stay
  inside it: no new modes, no new main-view controls, and new options go in existing
  popovers, the drawer or "More".
- Read only to name the files that own each finding: `public/app.js`, `public/index.html`,
  `public/features/compstimate.js`, `public/features/roles.js`, `public/viz/*`, and
  `dist/api/cities.json` / `dist/data/*.csv` from the lead's build.
- No skills loaded; no external sites.

## 3. Method and decisions

1. **Personas fitted to 55+**: two career changers, a returning-to-work retiree, a long-tenure
   specialist and a laid-off executive. They live in 4 countries (Canada, UK, US, Australia), cover
   all three household types, and have 5 different fields (policy, sales, operations, research,
   engineering). Two use a phone (390×844, `isMobile`, `hasTouch`, scale factor 2). One uses a
   1440 laptop at 125% browser zoom, emulated as a 1152×720 viewport at scale factor 1.25,
   because older users often zoom.
2. **Goals picked from the real data first** (`dist/data/*.csv`), so each goal can be tested
   against roles that really exist today. Some goals could be met and some could not.
3. **Timing**: "app" is wall-clock time measured by the script for each step (load, render,
   wait). "Person" is my estimate of the reading and deciding time for someone in this group;
   it is not measured.
4. **What counts as broken**: a number or label that is wrong or misleading, input that is
   silently dropped, or a dead end. "Improve" is friction, jargon or a missing affordance.

## 4. Replayable steps

```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
node scripts/cycle/serve.mjs --dist $S/cycle-stable/dist --pid $S/persona-stable-55-plus/serve.pid &
# -> serve: http://127.0.0.1:34877/melon-seek/   (stopped at the end with kill "$(cat …/serve.pid)")
cd $S/persona-stable-55-plus
NODE_PATH=$S/pw/node_modules node p1.mjs   # likewise p2.mjs p2c.mjs p3.mjs p3b.mjs p4.mjs chart.mjs p5.mjs p5c.mjs cross.mjs back.mjs biz.mjs
for f in /home/user/melon-seek/docs/screenshots/persona-stable-55-plus/*.png; do convert "$f" -colors 256 "PNG8:$f.tmp" && mv "$f.tmp" "$f"; done
```

- `h.mjs` is a small helper module. It loads Playwright through `createRequire(NODE_PATH)`, because ESM
  ignores NODE_PATH. It launches Chromium from `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
  and provides `open`, `stepper`, `cards`, `desk()` (desktop popovers) and `phone()` (phone filter
  sheet). Default timeout is 8 s.
- "Coming back later" = a fresh browser context restored from `storageState` (same localStorage).
- On phones the quick chips open the full Filters sheet, not a popover. Map pins have a 0×0 outer
  element, so the scripts click them through the keyboard (focus + Enter); a person's mouse click
  works.

---

## 5. The five people

### P1. Dorothy "Dot" Mensah, 58, Toronto, Canada: new graduate, policy

- **Who:** single (divorced, two grown children). 28 years as a high-school civics teacher, then
  a part-time Master of Public Policy finished in May 2026. Uses a 13" laptop (1280×800).
- **Goal:** a paid policy internship, fellowship or first policy job she can do from Toronto (or
  remotely from Canada), paying at least C$60K, that leaves her at least C$1,000 a month after
  tax, rent and living costs.
- **Reached? Partly.** She found one real candidate: the Anthropic Fellows Program (Economics &
  Policy), which lists Ontario, Canada and pays C$4,300 a week. But the site only shows its Juice for San
  Francisco, so she could not check Toronto. Cohere, the Toronto company, had no entry-level policy
  role, and the pay estimate for "Policy Analyst · Toronto" was a dead end.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | 1.0 s to ready | 30 s | Saw "Anthropic 645", a chart and "$352K median". Took it to be "Anthropic salaries", and missed that the Anthropic button switches companies. Did not understand "87% list pay", "Clusters / Ranges", "🍉 98 · Juicy", "Mid" or "4mo". [p1-01](../screenshots/persona-stable-55-plus/p1-01-arrive.png) |
| 2 | Search "policy" | 1.1 s | 1 min | "188 roles · 13 in title". Top: "Head of Accounting Policy" (Director+). [p1-02](../screenshots/persona-stable-55-plus/p1-02-search-policy.png) |
| 3 | Seniority → Intern | 1.7 s | 30 s | 3 roles, all "Anthropic Fellows Program", each "$200K". Anthropic has no "Entry" level. [p1-03](../screenshots/persona-stable-55-plus/p1-03-seniority.png) |
| 4 | Location | 0.7 s | 30 s | No Toronto; "Ontario, Canada" and "British Columbia, Canada". [p1-04](../screenshots/persona-stable-55-plus/p1-04-location.png) |
| 5 | Open Fellows (Economics & Policy) | 1.8 s | 2 min | Good: "Annualized from weekly pay (3,850 USD / 2,310 GBP / 4,300 CAD)". Odd: listed under "AI Research & Engineering" with a "Python" tag. [p1-06](../screenshots/persona-stable-55-plus/p1-06-drawer-fellows.png) |
| 6 | Juice | 0.7 s | 1 min | "58 · Ripe · $70K/yr left in San Francisco". No Toronto row and no "Compare locations"; she can't set her own city. [p1-07](../screenshots/persona-stable-55-plus/p1-07-juice.png) |
| 7 | Apply | 0.4 s | — | "Apply on Greenhouse" opened a new tab. She asked: "What is Greenhouse?" |
| 8 | Switch to Cohere | 1.9 s | 30 s | Search box emptied and Intern filter gone. [p1-10](../screenshots/persona-stable-55-plus/p1-10-cohere.png) |
| 9 | Search "policy" again | 1.0 s | 1 min | 27 roles, 3 in title: Senior, Manager and Senior; none entry-level. [p1-11](../screenshots/persona-stable-55-plus/p1-11-cohere-policy.png) |
| 10 | Open "Lead - US Government Affairs" | 2.2 s | 1 min | Meta reads "Government & Public Policy · Government & Public Policy". [p1-12](../screenshots/persona-stable-55-plus/p1-12-cohere-drawer.png) |
| 11 | Insights → Compstimate "Policy Analyst", Toronto | 3.4 s | 1 min | "Not enough comparable roles": a dead end. [p1-13](../screenshots/persona-stable-55-plus/p1-13-compstimate.png) |
| 12 | Search "annotation" (Cohere contract work) | 3.1 s | 2 min | CA$62K contract, Toronto Juice "4 Dry · $3K/yr". The locations include "Victoria, Australia" on a Canada-wide posting, and the pay shows as "≈ $44K–44K". [p1-18](../screenshots/persona-stable-55-plus/p1-18-cohere-annotation.png) |
| 13 | Save | 1.3 s | 20 s | Toast "Saved — find it in the company menu". [p1-14](../screenshots/persona-stable-55-plus/p1-14-saved.png) |
| 14 | Come back | 4.6 s | 1 min | Landed on Anthropic with an empty search. Found "Cohere · “policy”" under a menu titled "Job boards", and it restored 27 roles. [p1-15](../screenshots/persona-stable-55-plus/p1-15-return.png), [p1-16](../screenshots/persona-stable-55-plus/p1-16-return-menu.png), [p1-17](../screenshots/persona-stable-55-plus/p1-17-return-saved.png) |

Total: app about 26 s; person about 20–25 min.

### P2. Graham Pryce, 61, London, UK: early career (3 years), sales, iPhone

- **Who:** couple (wife Sue, a retired NHS nurse). Ran the family hardware shop for 30 years,
  then spent 3 years as an account executive at a payroll-software firm.
- **Goal:** a London account-executive role paying at least £70K base that leaves the two of them
  at least £2,000 a month after tax, rent and living costs.
- **Reached? On paper, yes, but he doesn't trust it.** Anthropic has four London "Enterprise Account Executive"
  roles at £280–330K, with $13K a month left for a couple (about £9.7K). He could not tell
  whether £280–330K is base or on-target earnings (OTE: base plus expected commission), the Juice is in dollars, and every role is "Mid" with no
  explanation. At Cohere and OpenAI no London sales role lists pay.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | 1.7 s | 30 s | "Anthropic", an "Oct 10" pill and "$352K median · middle 50% $287–411K"; the job list starts below the fold. [p2-01](../screenshots/persona-stable-55-plus/p2-01-arrive.png) |
| 2 | Tap "Oct 10" | 1.1 s | 30 s | "Where this data comes from … Greenhouse / anthropic". The badge itself is expected here; "Greenhouse" means nothing to him. [p2-02](../screenshots/persona-stable-55-plus/p2-02-badge.png) |
| 3 | Filters → Location → London, Department → Sales | 3.7 s | 1.5 min | The list shows only Remote and US cities, Austin (3 roles) included; London (47) appears only after "Show all 27". [p2-03a](../screenshots/persona-stable-55-plus/p2-03a-location-default.png), [p2-03b](../screenshots/persona-stable-55-plus/p2-03b-location-london.png) |
| 4 | Results | 0.9 s | 1 min | 7 roles: 4 × Enterprise AE at £280–330K, all "Mid". [p2-04](../screenshots/persona-stable-55-plus/p2-04-results.png) |
| 5 | Salary Min "£70,000", then "70000" | 3.4 s | 1 min | Both snapped back to "Any" with no message. He thought the box was broken. [p2-05](../screenshots/persona-stable-55-plus/p2-05-salary-pound.png), [p2-06](../screenshots/persona-stable-55-plus/p2-06-salary-70000.png) |
| 6 | Look at the quickbar | — | 20 s | His "Sales" and "London" chips are squeezed out of sight; Save is a bare bookmark icon. [p2-07](../screenshots/persona-stable-55-plus/p2-07-quickbar.png) |
| 7 | Open "Enterprise AE – Energy & Utilities" | 2.4 s | 2 min | "£280K–330K … + bonus mentioned · Posted base pay". He asked: is that base or OTE? [p2-08](../screenshots/persona-stable-55-plus/p2-08-drawer.png) |
| 8 | Juice → Couple → Monthly | 2.7 s | 1 min | "≈86 · Juicy", "$13K/mo" left (rent −$4K/mo for a 2-bedroom flat). He wanted pounds; "regional $0 · social $911" puzzled him. [p2-09](../screenshots/persona-stable-55-plus/p2-09-juice-couple-month.png) |
| 9 | Apply | — | — | Big button, shows `job-boards.greenhouse.io`, opens a new tab. |
| 10 | Save | 1.4 s | 20 s | Toast only. [p2-11](../screenshots/persona-stable-55-plus/p2-11-saved.png) |
| 11 | Cohere: re-filter London ("Show all 52") | 1.5 + 3.3 s | 1.5 min | Filters had reset. London shows 30 mostly engineering roles priced in CA$; Cohere's "Senior Account Executive" for the UK sits under "United Kingdom", not London. [p2-13b](../screenshots/persona-stable-55-plus/p2-13b-cohere-location-all.png), [p2-13](../screenshots/persona-stable-55-plus/p2-13-cohere-london.png), [p2-14](../screenshots/persona-stable-55-plus/p2-14-cohere-ae.png) ("Revenue · Revenue") |
| 12 | OpenAI → Insights → Compstimate "Account Executive", London | 3.2 s | 1 min | "$245K, low confidence, based on 36 similar roles at OpenAI, London". The comparable roles are in SF and NY at 4–9% match, and the results sheet covers the estimate. [p2-17](../screenshots/persona-stable-55-plus/p2-17-phone-compstimate.png) |
| 13 | Come back | 4.8 s | 30 s | "Anthropic · Sales · London" restored 7 roles. [p2-16](../screenshots/persona-stable-55-plus/p2-16-return-menu.png) |

Total: app about 33 s; person about 15–20 min.

### P3. Linda Okafor, 56, Arlington VA (Washington, DC), mid-career (6 years), operations, Android phone

- **Who:** family of four (husband, two teenagers). 22 years as a US Army logistics officer,
  then 6 years as an operations/program manager at a defence contractor.
- **Goal:** an operations or technical program manager (TPM) role in the DC area at a defence-tech company,
  paying at least $170K, that leaves her family at least $3,000 a month after tax, rent and
  living costs.
- **Reached? Yes.** One example: Anduril "Staff Technical Program Manager, Intelligence Systems", Reston,
  $191–253K, with about $7K a month left for a family of four. But the "Most juice" sort put a
  Huntsville-scored job on top of her DC list, and Palantir meant starting over.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Company menu → Anduril | 3.0 s | 1 min | The menu is grouped "GREENHOUSE / ASHBY / LEVER" with slugs like "andurilindustries". [p3-01](../screenshots/persona-stable-55-plus/p3-01-company-menu.png), [p3-02](../screenshots/persona-stable-55-plus/p3-02-anduril.png) |
| 2 | Search "program manager" | 1.9 s | 30 s | 257 roles, 114 in title. Departments like "AFS : Strategic Defense Engineering : …" and titles with "T&E". [p3-03](../screenshots/persona-stable-55-plus/p3-03-search.png) |
| 3 | Filters: Washington DC + Reston, Min "170k" | 5.0 s | 2 min | 32 roles. "170k" was accepted. [p3-04](../screenshots/persona-stable-55-plus/p3-04-filters.png), [p3-05](../screenshots/persona-stable-55-plus/p3-05-results.png) |
| 4 | Sort "Most juice" | 0.9 s | 20 s | Fine until step 6. [p3-06](../screenshots/persona-stable-55-plus/p3-06-sort-juice.png) |
| 5 | Open top job → Juice → Family → Monthly | 4.6 s | 1.5 min | Gross $18K/mo, tax −$4K, rent −$3K (3-bedroom), living −$3K: **$7K/mo left**, so the goal is met. "rent Oct 2025 (update due)". [p3-07](../screenshots/persona-stable-55-plus/p3-07-drawer.png), [p3-08](../screenshots/persona-stable-55-plus/p3-08-juice-family.png) |
| 6 | Back to the list | 0.9 s | 30 s | Re-scored for her family, the list now leads with "Staff T&E TPM, Strategic Defense". Its score is for **Huntsville** ($94K/yr); its DC figure is $53K/yr. [p3-10](../screenshots/persona-stable-55-plus/p3-10-cards-family.png), [p3-20](../screenshots/persona-stable-55-plus/p3-20-huntsville-juice.png) |
| 7 | Map, then Juice colouring | 2.9 + 1.6 s | 1 min | "Washington, DC + 3 nearby · 🍉 49 · 32". The legend explains the grades but covers a third of the phone map, and the three grades are three reds. [p3-11](../screenshots/persona-stable-55-plus/p3-11-map.png), [p3-12](../screenshots/persona-stable-55-plus/p3-12-map-juice.png) |
| 8 | Search "skillbridge" | 2.4 s | 30 s | "0 roles": her $170K minimum hides all 8 SkillBridge roles, which list no pay. [p3-13](../screenshots/persona-stable-55-plus/p3-13-skillbridge.png), [p3-21](../screenshots/persona-stable-55-plus/p3-21-skillbridge-nofilter.png) |
| 9 | Save | 2.3 s | 20 s | [p3-14](../screenshots/persona-stable-55-plus/p3-14-saved.png) |
| 10 | Insights → Compare companies | 3.6 s | 1.5 min | Program & project management: Anthropic $327K … Anduril $174K … Palantir $126K, which is clear. Business operations: "xAI 3 · $52K", made of two internships and one analyst. [p3-16](../screenshots/persona-stable-55-plus/p3-16-insights-compare-pm.png), [p3-15](../screenshots/persona-stable-55-plus/p3-15-compare-bizops-xai.png) |
| 11 | Switch to Palantir | 2.2 s | 30 s | Search and all 4 filters gone. [p3-17](../screenshots/persona-stable-55-plus/p3-17-palantir.png) |
| 12 | Come back next day | 6.4 s | 30 s | "Anduril · “program manager” · $170K+ · Washington, DC +1" restored 32 roles. [p3-18](../screenshots/persona-stable-55-plus/p3-18-return-menu.png), [p3-19](../screenshots/persona-stable-55-plus/p3-19-return-saved.png) |

Total: app about 40 s; person about 15 min.

### P4. Dr. Ingrid Haugen, 59, Seattle, US: senior/staff, research, laptop at 125% zoom

- **Who:** couple (husband retired; they own their home). PhD, 25 years in industrial research,
  most recently a principal applied scientist.
- **Goal:** a staff-level research role in Seattle or remote, at least $350K base, ideally with
  reduced hours or a 4-day week.
- **Reached? Partly.** Two good matches: Anthropic "Staff Research Engineer, Discovery Team"
  ($350–850K, Seattle) and Scale AI "Senior / Staff ML Research Scientist, Agents" ($302–378K,
  Seattle). There is no way to find reduced hours: only reading the full description turned up
  "at least 25% of the time" in the office and "flexible working hours".

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive cold | 1.5 s | 30 s | At 125% zoom the Chart/Map/Insights switch shows icons only, and "Add board" is a bare "+". [p4-01](../screenshots/persona-stable-55-plus/p4-01-arrive.png) |
| 2 | Staff+, Seattle + Remote + Remote (US), Min 350k | 1.6 + 2.7 + 1.6 s | 2 min | 54 roles, but every card says "San Francisco, CA +2", so she doubted the Seattle filter. [p4-02](../screenshots/persona-stable-55-plus/p4-02-staff.png), [p4-03](../screenshots/persona-stable-55-plus/p4-03-salary.png) |
| 3 | Ranges, Group: Seniority, hover | 1.7 s | 1 min | Tooltip with range, title and locations; clicking a cluster filters with a chip. [p4-04](../screenshots/persona-stable-55-plus/p4-04-ranges.png), [p4-05c](../screenshots/persona-stable-55-plus/p4-05c-cluster-click.png) |
| 4 | More → Employment type; search "part-time" | 2.5 s | 1 min | "Unspecified 54" is the only option; "part-time" returns 0 roles. [p4-06](../screenshots/persona-stable-55-plus/p4-06-more.png) |
| 5 | Open "Staff Research Engineer, Discovery Team" | 1.8 s | 3 min | "Wide range (2.4×)", "Listed 535 days ago … Open 180+ days", and "Same role elsewhere" at Staff+. In the chart, the title runs into the pay text. [p4-07](../screenshots/persona-stable-55-plus/p4-07-drawer.png) |
| 6 | Juice → Couple | 2.5 s | 1 min | "$369K/yr left in Seattle", computed from the $600K midpoint of a $350–850K range. It also assumes they rent a 2-bedroom flat, but they own their home. [p4-08](../screenshots/persona-stable-55-plus/p4-08-juice.png) |
| 7 | Read the full description | 1.8 s | 4 min | Found the hybrid policy and "flexible working hours"; nothing on part-time. |
| 8 | Compstimate "Staff Research Scientist", Seattle, Staff+ | 3.5 s | 1 min | "$546K, medium confidence, based on 12 similar roles at Anthropic, Staff+": the location dropped out of the label. [p4-10](../screenshots/persona-stable-55-plus/p4-10-compstimate.png) |
| 9 | Compare companies: AI research | 1.1 s | 1 min | [p4-11](../screenshots/persona-stable-55-plus/p4-11-compare.png) |
| 10 | Switch to Scale AI; re-apply Staff+ and Seattle | 1.5 + 3.1 s | 1 min | Filters had reset. 3 roles. [p4-12](../screenshots/persona-stable-55-plus/p4-12-scale.png), [p4-13](../screenshots/persona-stable-55-plus/p4-13-scale-drawer.png) |
| 11 | Apply, then copy link | 0.6 s | 20 s | "Link copied". |
| 12 | Save, then come back a week later | 1.0 + 4.8 s | 1 min | A recent pill "Scale AI"; the saved search restored 3 roles. [p4-14](../screenshots/persona-stable-55-plus/p4-14-saved.png), [p4-15](../screenshots/persona-stable-55-plus/p4-15-return.png) |

Total: app about 38 s; person about 25 min.

### P5. Peter Nakamura, 63, Sydney, Australia: executive, engineering, 27" monitor (1920×1080)

- **Who:** couple (wife is a part-time GP). Former VP of Engineering at an Australian telco, made
  redundant in a restructure; wants "one last big job".
- **Goal:** a Director or Head of Engineering role in Sydney at an AI or defence company paying
  at least A$350K, and to compare which of the 8 companies hire senior leaders in Australia and
  what they pay.
- **Reached? No.** Anduril has two Sydney engineering-manager roles but no Director of Engineering. No Australian posting
  at any company lists pay. The estimates he was shown are US pay labelled "Sydney", and the
  map told him Anduril's Sydney median is $61K.

| # | Step | App | Person | What happened |
|---|---|---|---|---|
| 1 | Arrive, then Anduril, then Map | 1.6 + 3.8 s | 1.5 min | Pin "$61K · 61 · Sydney, Australia + 3 nearby". [p5-02](../screenshots/persona-stable-55-plus/p5-02-map.png) |
| 2 | Click the Sydney pin | 4.9 s | 30 s | 61 roles. The top 5 are US "Recruiting Coordinator (Contractor)" roles at $46–70K; the stats line reads "$61K median · middle 50% $61–61K". The tooltip does say "55 postings · 5 with salary". [p5-03](../screenshots/persona-stable-55-plus/p5-03-sydney.png) |
| 3 | Seniority → Manager + Director+ | 2.8 s | 30 s | 7 roles, all "No salary". [p5-04](../screenshots/persona-stable-55-plus/p5-04-leaders.png) |
| 4 | Open "Senior Manager, Software Engineering" (Sydney) | 2.3 s | 2 min | "Compstimate ≈ $222K … based on 226 similar roles at Anduril, Manager · Sydney", in USD. [p5-05](../screenshots/persona-stable-55-plus/p5-05-drawer-nopay.png) |
| 5 | Salary Min "A$350k", then "AUD 350000" | 2.2 s | 1 min | Both snapped back to "Any" silently. [p5-06](../screenshots/persona-stable-55-plus/p5-06-salary-aud.png) |
| 6 | Insights → Compstimate "Director of Engineering", Sydney | 2.4 + 1.6 s | 2 min | "$241K, low confidence … Sydney". The best match is Bellevue at 18%. [p5-07](../screenshots/persona-stable-55-plus/p5-07-insights.png), [p5-08](../screenshots/persona-stable-55-plus/p5-08-compstimate-sydney.png) |
| 7 | Compare companies: Engineering management | 1.0 s | 1 min | Clear, but global (US-dominated). [p5-09](../screenshots/persona-stable-55-plus/p5-09-compare-eng-mgmt.png) |
| 8 | Each of the 7 other companies, with Australia picked again each time | 15.7 s | 8 min | Anthropic 9 Sydney roles, OpenAI 9 and Shield AI 36 (Melbourne), all with no pay. Palantir has 2, with no pay. xAI has 2 marked "Australia", both remote. Cohere's 2 "Victoria, Australia" roles are Canadian contracts. Scale AI has none. [p5-10](../screenshots/persona-stable-55-plus/p5-10-cohere-au.png) |
| 9 | OpenAI Sydney "B2B Marketing Lead, ANZ" | 3.6 s | 1 min | "≈ $301K … OpenAI, Senior · Sydney", though no OpenAI Sydney role lists pay. "Apply on Ashby". [p5-11](../screenshots/persona-stable-55-plus/p5-11-openai-sydney.png) |
| 10 | Save, check the Juice filter, come back | 1.5 + 4.0 s | 1 min | Juice filter "Juicy 0 · Ripe 0 · Dry 0" (no pay means no Juice); the saved search "OpenAI · Sydney" restored 9 roles. [p5-12](../screenshots/persona-stable-55-plus/p5-12-return-menu.png) |

Total: app about 47 s; person about 30 min.

---

## 6. Findings for the group

P1 Dot, P2 Graham, P3 Linda, P4 Ingrid, P5 Peter. Screenshot paths are under
`docs/screenshots/persona-stable-55-plus/`.

### Broken, fix now

1. **Compstimate presents US pay as local pay where no local role lists pay.** On a Sydney role
   the drawer says "≈ $301K … based on 13 similar roles at OpenAI, Senior · Sydney", but none of
   OpenAI's 9 Sydney roles lists pay. Anduril shows "≈ $222K … Manager · Sydney". In Insights,
   "Director of Engineering · Sydney" has Bellevue as its best match (18%). London has the same problem:
   "$245K … OpenAI, London", whose comparables are SF and NY roles at 4–9% match. "Typically within ±10%" sits beside
   "low confidence". P5, P2 · drawer pay block, Insights → Compstimate · `p5-11-openai-sydney.png`,
   `p5-05-drawer-nopay.png`, `p5-08-compstimate-sydney.png`, `p2-17-phone-compstimate.png` ·
   `public/features/compstimate.js`: `locationSim` gives other countries a weight of 0.25 instead of
   excluding them, and the basis line names the city anyway. `public/app.js`: `compstimateBlock`.
2. **Map pin and stats line say Anduril's Sydney median is "$61K".** The figure comes from 5 US
   "Recruiting Coordinator (Contractor)" postings that list Sydney among 5–6 cities; the other 50 of
   the 55 Sydney postings have no pay. P5 · Map, Sydney cluster · `p5-03-sydney.png` ·
   `public/viz/map.js` (cluster price), `public/app.js` (stats line).
3. **"Most juice" sort and card scores use the job's best city, not the city you filtered on.**
   Linda's DC + Reston list leads with a job scored for Huntsville ($94K/yr; its DC figure is
   $53K/yr). Dot's Fellows card and drawer show San Francisco only, though the role lists Ontario.
   P3, P1 · results list, drawer Juice · `p3-10-cards-family.png`, `p3-20-huntsville-juice.png`,
   `p1-07-juice.png` · `public/app.js` (sort `juice`, `juiceBadge`), `public/lib/juice.js`
   (choice of `best`).
4. **The salary box silently drops what people type.** "£70,000", "A$350k" and "AUD 350000" snap
   back to "Any", and so does "70000", because it is below the slider's floor. No message
   appears. P2, P5 · Salary filter · `p2-05-salary-pound.png`, `p2-06-salary-70000.png`,
   `p5-06-salary-aud.png` · `public/app.js` `makeSalary` (`parseBound`, `typed`).
5. **"Victoria" (British Columbia) is placed in Australia.** Cohere's two Canada-wide data-annotation
   contracts list "Victoria, Australia", so they are the only Cohere results for Peter's
   Australia filter and appear as "Victoria, Australia (2)" in Compstimate. P5, P1 · Location
   filter, drawer Locations · `p5-10-cohere-au.png`, `p1-18-cohere-annotation.png` ·
   `server/geo.js`.
6. **Compare companies mixes levels.** "Business operations & strategy" shows "xAI 3 · $52K",
   which is two internships ($51–54K) and one analyst ($122–180K), set beside full-time
   medians. P3 · Insights → Compare companies · `p3-15-compare-bizops-xai.png` ·
   `public/features/comps.js` (no level filter), `public/features/roles.js`.
7. **The methodology headline overstates rent freshness.** "Rents as of May–October 2026" is
   true for 1-bedroom rents only. The US 2- and 3-bedroom rents used for Couple and Family date
   from October 2025; the drawer does say "rent Oct 2025 (update due)". P3, P4 · Methodology,
   drawer Juice · `x-methodology.png`, `p3-08-juice-family.png` · `scripts/methodology.js`,
   `data/cities.json`.
8. **In Ranges view the highlighted row's title runs into its pay:** "Staff Research Engineer,
   Discove$350K–$850K". P4 · Chart → Ranges · `p4-07-drawer.png` · `public/viz/chart.js`.
9. **Small errors in the drawer text.** A single figure is shown as a range ("≈ $44K–44K in approx USD"). The
   percentile reads "0% percentile / Pays more than 0% of roles". When team equals department it is printed
   twice ("Government & Public Policy · Government & Public Policy", "Revenue · Revenue"). P1, P2
   · drawer head and pay block · `p1-18-cohere-annotation.png`, `p1-12-cohere-drawer.png`,
   `p2-14-cohere-ae.png` · `public/app.js`.

### Improve (ranked by how many of the 5 it helps)

1. **(5/5) Keep the search and filters when switching company, or offer an "all companies"
   search.** Every person lost their setup at every switch; Peter picked Australia again 7 times.
   `p1-10-cohere.png`, `p3-17-palantir.png`, `p4-12-scale.png` · `public/app.js` `switchCompany`
   (`resetFiltersPatch`).
2. **(5/5) Make Juice about the person.** Let them choose their own city (including "remote from
   home"), say "I own my home" or "my rent is …", and pick more household shapes (one earner,
   single parent, couple with an adult child). Show Juice in the posting's or the person's
   currency (£, C$, A$), not only USD. Many people over 55 own their home outright. Dot,
   Graham, Linda, Ingrid and Peter each hit this. `p1-07-juice.png`, `p2-09-juice-couple-month.png`,
   `p4-08-juice.png` · `public/app.js` `juiceBlock` / `HOUSEHOLDS`, `public/lib/juice.js`.
3. **(5/5) Plain words.** Each of these stopped at least one person:
   - **Stats and chart:** "87% list pay", "middle 50%", "Clusters / Ranges".
   - **Juice:** "Juicy / Ripe / Dry" and the bare score (the scale is explained only in the map
     legend), "≈86", "regional / social" tax, "(update due)" three times, "FX".
   - **Level and age:** "Mid / Staff+ / Director+", never defined; "Mid" appears on £280–330K
     and $500–850K roles. Ages like "4mo", "16mo", "2y+", "10d".
   - **Names:** "Compstimate", "Add board", "Apply on Greenhouse / Ashby".
   - **Company menu:** headed "Job boards · GREENHOUSE · ASHBY · LEVER", with slugs like
     "andurilindustries".
   - **Anduril departments:** "AFS : Strategic Defense Engineering : …", "Templates : Early
     Career/New Grad".

   `cold-desktop.png`, `probe-company.png`, `p3-07-drawer.png` · `public/index.html`,
   `public/app.js`, `server/keywords.js` (seniority), `server/normalize.js` (department).
4. **(5/5) Bigger text and labelled controls.** Filter counts, chart axes, bubble numbers, the
   Min/Max labels and keyword counts are 10–12px. At 1152px (a 1440 laptop at 125%) the
   Chart/Map/Insights switch loses its words and "Add board" becomes "+". `p4-01-arrive.png`,
   `p1-02-search-policy.png` · `public/styles.css`, `public/viz/viz.css`.
5. **(5/5) Make saved searches findable.** On phones Save is a bare bookmark icon. The only
   pointer is a toast that disappears. The searches live in a menu titled "Job boards". Coming
   back lands on Anthropic, not on the saved search or the last company. `p2-07-quickbar.png`,
   `p1-15-return.png`, `p1-16-return-menu.png` · `public/app.js` (`toggleSave`,
   `renderQuickbar`, `makeCompanyMenu`).
6. **(4/5) Make the location list work outside the US.** London (47 roles) is hidden behind
   "Show all 27", while Austin (3) is shown. Picking a city misses country-wide postings ("United
   Kingdom", "Ontario, Canada", "Remote (Canada)"); Ingrid had to pick "Remote" and
   "Remote (US)" separately. Dot, Graham, Ingrid, Peter. `p2-03a-location-default.png`,
   `p2-13b-cohere-location-all.png` · `public/app.js` `makeChecklist` (grouped by country, limit
   8).
7. **(3/5) On cards, show the location that matched.** Ingrid filtered on Seattle but every card
   said "San Francisco, CA +2". Linda's DC list led with "Huntsville, AL +1". Dot, Linda, Ingrid.
   `p4-04-ranges.png`, `p3-10-cards-family.png` · `public/app.js` `locSummary`.
8. **(3/5) Help people find part-time, flexible and contract work.** Employment type is
   "Unspecified" for all 645 Anthropic roles, and "part-time" returns 0. Flexibility is found only
   by reading the full description. Dot, Graham, Ingrid. `p4-06-more.png` · `server/normalize.js`
   (`employmentType`), the "More" filters in `public/app.js`.
9. **(3/5) Fix the Juice colours.** Dry, Ripe and Juicy are three shades of red on cards and pins, and
   the "Juice left" bar is red like a warning. Colour vision declines with age. Graham, Linda,
   Peter. `p3-12-map-juice.png`, `p2-09-juice-couple-month.png` · `public/viz/palette.js`,
   `public/styles.css`. Within §8 this means labels or patterns, not new colours.
10. **(2/5) Say when a pay filter hides roles with no pay.** "skillbridge" plus $170K+ gave
    "0 roles" with no reason. Linda, Peter. `p3-13-skillbridge.png`,
    `p3-21-skillbridge-nofilter.png` · `public/app.js` (empty state, salary note).
11. **(2/5) Phone layout.** Active filter chips are squeezed into a strip about 109px wide beside
    Save and "Clear all". A results sheet raised in Chart stays up in Insights and covers the
    Compstimate answer. The map legend covers a third of the map. The close arrow "‹" sits next
    to the "previous" arrow "‹". Graham, Linda. `p2-04-results.png`, `p2-17-phone-compstimate.png`,
    `p3-12-map-juice.png` · `public/styles.css`, `public/app.js`.
12. **(1/5) Don't show time-limited programmes as a salary.** The Fellows card says "$200K"; only the
    drawer says it is annualized weekly pay. Dot. `p1-06-drawer-fellows.png` · `public/app.js`
    (card pay pill).
13. **(1/5) Make clear whether sales pay is base or OTE.** "Posted base pay" on a £280–330K AE role with "+ bonus mentioned":
    say "as posted" or flag that sales ranges may be OTE. Graham. `p2-08-drawer.png` ·
    `public/app.js` `payLabels`.
14. **(1/5) Show Juice at both ends of wide ranges.** For a 2.4× range, show Juice at the low end
    as well as the midpoint. Ingrid. `p4-08-juice.png` · `public/app.js` `juiceBlock`.

### Good (keep)

1. **The Juice breakdown.** Just me / Couple / Family, Monthly / Yearly, "Rent takes 19% of
   take-home pay" and "Compare locations" gave Linda "$7K/mo for a family of four" in under 10 s.
   P2, P3, P4 · `p3-08-juice-family.png`, `p2-09-juice-couple-month.png`.
2. **Honest pay labels.** For example "Annualized from weekly pay (3,850 USD / 2,310 GBP / 4,300 CAD)",
   "Annualized from hourly pay (CAD $30/hour)", "Wide range (2.4×)" and "Equity and bonus aren't
   included". Also "Salary not listed — this posting doesn't include a pay range" and "Open 180+ days. Some
   companies keep a posting open…". P1, P4, P5 · `p1-06-drawer-fellows.png`, `p4-07-drawer.png`,
   `p5-05-drawer-nopay.png`.
3. **"Same role elsewhere" (level-matched) and "Compare companies".** One glance across companies, with counts.
   P2, P3, P4, P5 · `p4-11-compare.png`, `p3-16-insights-compare-pm.png`.
4. **Compstimate when local data exists.** "$177K, high confidence, based on 19 similar roles at Anduril,
   Washington, DC". P3 · `p3-24-phone-insights-sheet.png`.
5. **Saved searches.** They restore company, filters and sort exactly after the browser is closed,
   with plain names ("Anduril · “program manager” · $170K+ · Washington, DC +1"). 5/5 ·
   `p3-18-return-menu.png`, `p3-19-return-saved.png`.
6. **The Apply button.** It is big, names the destination host and opens the original posting in a new tab;
   copy link says "Link copied". 5/5 · `p2-09-juice-couple-month.png`.
7. **Speed.** Ready in 1–2 s. Anduril (2,491 roles) loads in 3.6 s on a throttled phone (4× CPU, about 2 Mbps,
   150 ms). Filters and search respond in about 1 s, and the drawer opens in 0.5 s. 5/5.
8. **The methodology page.** Plain English, a worked example, and the melon metaphor lands. P1, P4 ·
   `x-methodology.png`.
9. **Chart and map interactions.** The chart tooltip lists the roles in a bubble, and clicking a bubble or pin filters
   with a removable chip ("Sydney, Australia + 3 nearby (61)"). P4, P5 · `p4-05c-cluster-click.png`,
   `p5-03-sydney.png`.
10. **The map Juice legend.** It gives dollar thresholds ("Juicy 70+ ≥ $96K/yr"), the only place the grades are
    explained. P3 · `p3-12-map-juice.png`.
11. **The phone Filters sheet.** Big tap targets, a live "Show 7 roles" button and a clear "No roles match …
    Clear filters" empty state. P2, P3 · `p2-03b-location-london.png`, `p3-13-skillbridge.png`.

## 7. Verification

- 5 personas, each run end to end in Chromium: P1 and P4 on laptops (P4 at 125%), P2 and P3 on
  phones, P5 on a 27" monitor. Each saved a search, and each return in a fresh context restored it.
- Findings checked against the data: the Huntsville vs DC Juice (`p3-20`); the Sydney "$61K" postings
  (`dist/data/anduril.csv`); the "Victoria, Australia" rows (`dist/data/cohere.csv`); the xAI
  business-ops roles (`roleFamily` run on `dist/data/xai.csv`); and the rent as-of dates
  (`dist/api/cities.json`: Reston 1-bedroom 2026-05, 2- and 3-bedroom 2025-10).
- Throttled-phone timing: `cross.mjs` (CDP CPU ×4, 150 ms latency).

## 8. Known gaps and follow-ups

- "N new since your last visit" could not be shown: this build's history ledger is empty (`{}`),
  and a backdated return found no new roles. Re-test on a build with a ledger.
- Live fetch, Refresh and map tiles are unreachable in this sandbox and were not judged.
- The person-time column is an estimate, not a measurement.
- Not tested: dark mode, a screen reader, or a real touch-and-drag on the salary slider.

## 9. Change log

- 2026-10-10: First run on the lead's `cycle-stable/dist`. 91 screenshots, quantized to 256 colours.
