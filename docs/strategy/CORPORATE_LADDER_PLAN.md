# Plan: reusing melon-corporate-ladder in melon-seek

**Status: proposal only. Nothing here is implemented.** Written 2026-10-02 by
the corporate-ladder brainstorm agent. Process log:
[../process/ladder-brainstorm.md](../process/ladder-brainstorm.md). Prompt:
[../process/prompts/ladder-brainstorm.md](../process/prompts/ladder-brainstorm.md).
Source read: `alvations/melon-corporate-ladder` at commit `4a7ab3a`.

## TL;DR

- **Build one thing: "Level check" in the job drawer.** It places a posting on
  a simple ladder (Entry, Mid, Senior, Staff+) and shows what that rung usually
  expects, using the generic leveling rubrics in corporate-ladder's
  `src/lib/rubricTemplates.ts`. When the title states no level, it says so and
  falls back to the posting's years-of-experience ask ("asks for 8+ yrs, which
  on these boards usually means Senior or Staff+").
- **Why it's worth doing:** 41% of the 5,413 real postings are tagged "Mid"
  only because the title has no level word (58% at OpenAI, 69% at xAI). Today
  the drawer shows "Mid" on an OpenAI role that asks for 10+ years. Level
  check makes that honest and explains the rung, with **no new control in the
  main view and no new Job fields**.
- **Optional second: "Prepare for the interview"**, a collapsed drawer
  section. It maps the role's responsibility bullets onto corporate-ladder's
  five impact categories and suggests three stories to bring.
- **Sync by copying.** The ladder text (about 3 KB) is copied into one new
  module, `public/features/ladder.js`, with a provenance header. No fetching
  and no build step.
- **Don't reuse** the knowledge base: it paraphrases CareerClimb, which
  corporate-ladder's own BUSINESS.md lists as a launch blocker, and its company
  guides cover none of our eight companies. Also leave out the AI layer, which
  needs an API key or a paid proxy, and the GitHub, sync and Pro code.

## 1. What melon-corporate-ladder is

My Corporate Ladder is a local-first "career evidence system" for people who
want promotion at their **current** employer. Users log wins as quantified
impact statements, tagged with one of five impact categories. They map them to
a leveling rubric: a generic SWE L3–L6 ladder, a generic PM ladder, or their
own pasted leveling doc, parsed by Claude. They then get per-dimension gap
analysis. The app also has:

- a 10-question promotion-readiness quiz;
- a 30/60/90-day review-prep checklist;
- GitHub evidence harvesting;
- a PIP tracker with a Recovery Score;
- a coach grounded in a small knowledge base.

**Stack:** Vite, React 18, TypeScript, Dexie (IndexedDB), Zod, the Anthropic
SDK (bring your own key, or a Pro proxy) and a PWA. A Node 22 server with
SQLite and Stripe runs the paid Pro tier. Tests use vitest and Playwright.

**Data:** a sitemap plus paraphrased summaries of CareerClimb's public blog.
There are **no jobs, salaries or company level datasets** in the repo.

| Asset | Where | What it is | Reuse in melon-seek? | Terms |
|---|---|---|---|---|
| Generic leveling rubrics | `src/lib/rubricTemplates.ts` | SWE ladder L3–L6 × 5 dimensions (Impact & scope, Technical excellence, Leadership & influence, Cross-team collaboration, Mentorship). PM ladder PM / Senior PM / Lead PM × 5 dimensions. One or two sentences per cell | **Yes.** The core of idea 1 | Written in-repo as "generic industry ladders, not any specific company's leveling doc". The repo has **no LICENSE file**; it is the user's own work, so reuse is the user's call |
| Impact categories | `src/db/schema.ts` `CATEGORIES` | technical, leadership, mentorship, crossteam, business | Yes (idea 3) | Generic labels |
| Gap thresholds | `src/lib/scoring.ts` `rubricGaps` | count per dimension → none / thin / ok / strong | Pattern only | Own code |
| Readiness quiz | `scoring.ts` `READINESS_QUESTIONS` | 10 statements about promotion readiness | No. It's about your current job, and it follows CareerClimb's frameworks | Derived from third-party content |
| Knowledge base | `knowledge-base/*.md` (7 files), `data/sitemap.json`, `data/provenance.md` | Paraphrase-level summaries of about 35 CareerClimb pages, collected via web search | **No** | Third-party paraphrase. BUSINESS.md blocker 1: "rewrite or license" before commercial use. melon-seek is a public site |
| Company guides | `knowledge-base/company-guides.md` | Promotion mechanics for Google, Amazon, Meta, Microsoft, LinkedIn, Stripe, Shopify, Airbnb, Oracle, Instacart, Citi, Uber | No. Zero overlap with our 8 companies | As above |
| TF-IDF retrieval | `src/lib/knowledge.ts` | About 70 lines; chunks markdown by heading | Not needed (our search is substring plus facets) | Own code |
| Impact-statement format | `knowledge-base/frameworks.md` §2 | "did X → measurable outcome Y → at scope Z" | The idea only, in our own words (idea 3) | General idea, not the text |
| AI layer | `src/lib/ai.ts` | Win rewriter, rubric parser, drafts, coach, PIP parser | No. Needs a key or the paid proxy; melon-seek is keyless and static | |
| Export / share | `src/lib/export.ts` | Markdown self-review, self-contained HTML snapshot | Pattern only | Own code |
| GitHub harvest, AES-GCM gist sync, Pro server (Stripe, licenses, metered proxy) | `src/lib/github.ts`, `crypto.ts`, `sync.ts`, `server/` | | No | |

## 2. What the real data says

These numbers come from the 8 local snapshots (`data/snapshots/*.json`,
2026-10-02, 5,413 postings), read without modification. The script is in the
process log. The snapshot files are raw, so they predate the salary vetting
gate; only the pay-by-level row uses salaries.

| Finding | Number | So what |
|---|---|---|
| Postings tagged "Mid" only because the title has no level word | **2,234 of 5,413 (41%)**: xAI 69%, Palantir 61%, OpenAI 58%, Anthropic 47%, Cohere 39%, Anduril 36%, Scale AI 29%, Shield AI 11% | At the labs, the "Mid" chip and the Seniority filter are mostly a default |
| …of those, with a years-of-experience keyword already extracted (`keywords.fit`, e.g. `8+ yrs`) | 1,507 (67%); 226 ask for 8+ or 10+ yrs | We already have a level signal and don't use it |
| Level signal available for individual-contributor (IC) postings | Of 4,661 IC postings: title 51%, years 33%, none 16%. OpenAI 32 / 32 / 35, xAI 15 / 55 / 30 | Level check has something honest to say for 84% of them |
| Years ask vs. the level the title states (titled IC roles, n = 1,924) | 1+ → Entry or Mid 88%. 3+ → Mid or Senior 91%. 5+, 8+, 10+ → Senior or Staff+ 82–90%. Without Anduril, which dominates the sample: 85%, 81%, 77–81% | Use a **two-rung window**, never a single level or a percentage |
| Pay by level, engineering titles, per company | OpenAI: unlevelled median $338K vs "Senior" $247K (n = 4). Anthropic: unlevelled $363K vs "Senior" $328K (n = 4) | A "what the next rung pays" view would be inverted at the labs (idea 5 is rejected for now) |
| "Member of Technical Staff" titles | 33 (Cohere 19, xAI 14), all classified **Staff+** | A bug in `server/keywords.js#inferSeniority`: MTS is a flat IC title. Route to the features workstream |
| Ladder coverage by role family | Engineering/research about 60% of postings, product 1–6%, managers/directors 12%, other ICs (sales, ops, G&A) about 26% | The engineering ladder covers most postings; other ICs need a fallback |
| Responsibility bullets spanning ≥ 3 of the 5 impact categories | 72% of postings (86% span ≥ 2). 402 postings (7%) have no bullets | Idea 3 has material for most roles |

## 3. Candidate ideas

| # | Idea | User value (one sentence) | What is reused | Effort | Where it appears | Main risks |
|---|---|---|---|---|---|---|
| 1 | **Level check** | "What level is this role really, and what does that level expect?" answered honestly, even when the title doesn't say | `rubricTemplates.ts`: both ladders, text copied verbatim | S | Job drawer, one section. No main-view control; at most one "all dimensions" link | A generic ladder isn't the company's own; the years-to-level heuristic |
| 2 | **Seniority repair** | The Seniority filter, group-by and Compstimate stop treating 2,234 unlevelled roles as "Mid" | Idea 1's rung order and years windows | M | None (changes existing filter values) | Silently re-buckets about 1,500 jobs; contract change across 3 workstreams |
| 3 | **Prepare for the interview** | Turns a posting into the three stories to bring, each tied to a real line of the posting | `CATEGORIES`, plus the impact-statement idea in our own words | S–M | Job drawer, collapsed section with a "Copy checklist" button | Keyword misfires; lazily loaded sections on big static boards |
| 4 | **Role emphasis bar** | "What this role rewards": a 5-segment mix of impact categories | `CATEGORIES` | S–M | Drawer bar, or a 5th Group-by option | Looks precise but is a keyword count; overlaps idea 3 |
| 5 | **Pay by rung** | "What does the next rung pay here?" | Rung order | S–M | Drawer | Inverted at the labs today (§2); depends on idea 2 |
| 6 | **Bring your wins** | Import a corporate-ladder export; the drawer shows which of this role's responsibilities your logged wins already cover | `VaultSnapshot` JSON, `Win`, `CATEGORIES`, rubric dimensions | L | "Import my wins" in the More menu, plus a drawer section | Sensitive personal data (even though it stays local); couples to schema v1; adds file UI; match quality |
| 7 | **My level steps** | Pick your level once; every card shows "same rung / +1 / +2" | The current → target idea from the profile | S | One new main-view control | Duplicates the Seniority filter and rests on today's noisy seniority |
| 8 | **Company promotion notes** | "How promotion works at X" | `knowledge-base/company-guides.md` | S | More menu | None of our companies are covered; third-party paraphrase |

### How the ideas were scored

| # | Value ×2 | Simplicity ×2 | Effort ×1 (S=5, M=3, L=1) | Low risk ×1.5 | Reuse ×1 | **Total / 37.5** |
|---|---|---|---|---|---|---|
| 1 Level check | 4 | 5 | 5 | 4 | 5 | **34** |
| 3 Prepare for the interview | 3 | 5 | 4 | 4 | 4 | **30** |
| 2 Seniority repair | 4 | 5 | 3 | 3 | 2 | 27.5 |
| 5 Pay by rung | 4 | 5 | 4 | 1 | 3 | 26.5 |
| 4 Role emphasis bar | 2 | 4 | 4 | 3 | 4 | 24.5 |
| 6 Bring your wins | 4 | 3 | 1 | 2 | 5 | 23 |
| 7 My level steps | 3 | 2 | 5 | 3 | 3 | 22.5 |
| 8 Company promotion notes | 1 | 4 | 5 | 1 | 4 | 20.5 |

Simplicity: 5 = drawer only, 4 = drawer or More menu with light UI, 3 =
More-menu entry plus new UI, 2 = a new main-view control.

## 4. Recommendation 1: Level check

### 4.1 What the user sees

The section sits in the job drawer, after the salary block. These are the
three cases, with real text from the copied ladder:

```
Level check                                         generic ladder
  Entry ─ Mid ─ [Senior] ─ Staff+
  Senior, from the title.
  Impact & scope   Owns a product area or system; impact spans the team and
                   adjacent teams; sets direction for multi-quarter work.
  Technical        Designs systems; anticipates failure modes; is the go-to
                   for a domain.
  Leadership       Leads multi-person projects; aligns stakeholders; is
                   trusted to represent the team.
  Next rung (Staff+): Drives outcomes across an org; defines problems, not
                   just solutions; impact is measured in business results.
  A generic engineering ladder, not Anthropic's own levels.
```

- **Title states a level** (51% of IC postings): as above.
- **No level in the title, but a years ask** (33%): the strip outlines two
  rungs, for example `(Senior ─ Staff+)`, and the headline reads "No level in
  the title. It asks for 8+ yrs, which on these boards usually means Senior or
  Staff+." The lower rung's expectations are shown, and the upper rung appears
  as "Next rung".
- **Neither** (16%): one line only: "No level in the title and no years of
  experience asked, so the 'Mid' tag is a default." No expectations.
- **Intern, Manager, Director+:** the section is hidden. Both copied rubrics
  are IC ladders.

### 4.2 Data flow

```
melon-corporate-ladder/src/lib/rubricTemplates.ts
   │  one-time hand port; header names the repo, path and commit
   ▼
melon-seek/public/features/ladder.js   (LADDERS data + pure functions)
   ▲                                    │
Job: title, seniority,                  │ levelCheckFor(job) → view model
department, keywords.fit                ▼
                         public/app.js drawerContent(job) → levelBlock(view) → drawer DOM
```

Nothing extra is needed for the static build: `scripts/build-static.js`
already copies `public/` into `dist/`, and server mode serves `public/`
as-is. Every input field is in the packed list, not in the lazily loaded
description files, so the section renders at once in static mode.

### 4.3 Module: `public/features/ladder.js` (product workstream)

```js
export const LADDER_SOURCE = { repo: 'alvations/melon-corporate-ladder',
  path: 'src/lib/rubricTemplates.ts', commit: '4a7ab3a' };
export const LADDERS;               // { engineering, product, general }: copied text
export function ladderFamily(job);  // 'engineering' | 'product' | 'general' | null
export function titleStatesLevel(title); // false for "Member of Technical Staff"
export function yearsAsked(job);    // 1 | 3 | 5 | 8 | 10 | null, from keywords.fit "N+ yrs"
export function rungsForYears(n);   // ['Entry','Mid'] | ['Mid','Senior'] | ['Senior','Staff+'] | null
export function levelCheckFor(job); // view model below, or null to hide the section
```

```js
{ family: 'engineering', ladderName: 'Generic engineering ladder',
  source: 'title' | 'years' | 'none',
  rungs: ['Senior'] | ['Senior', 'Staff+'] | [],
  steps: ['Entry', 'Mid', 'Senior', 'Staff+'],   // product: ['PM', 'Senior PM', 'Lead PM']
  years: 8 | null,
  headline: 'No level in the title. It asks for 8+ yrs, which on these boards usually means Senior or Staff+.',
  expectations: [{ dimension: 'Impact & scope', text: '…' }, …], // 3 items; [] when source is 'none'
  next: { rung: 'Staff+', text: '…' } | null,                     // null at the top rung
  note: 'A generic engineering ladder, not Anthropic’s own levels.' }
```

**Rung mapping.** L-numbers are not shown, because each company numbers its
levels differently.

| melon-seek seniority | Engineering (corporate-ladder SWE) | Product (corporate-ladder PM) | General (other ICs) |
|---|---|---|---|
| Entry | L3 text | PM | L3 text |
| Mid | L4 | PM | L4 |
| Senior | L5 | Senior PM | L5 |
| Staff+ | L6 | Lead PM | L6 |
| Intern, Manager, Director+ | hidden | hidden | hidden |

**Families.**

- **Product:** the title matches product manager, product lead or technical
  program manager, and doesn't contain "product marketing".
- **Engineering:** the title or department matches engineer, software,
  research, scientist, technical staff, infrastructure, security, hardware,
  firmware, data or ML.
- **General:** everything else.

**Dimensions shown** (3 of 5, copied verbatim):

- Engineering: Impact & scope, Technical excellence, Leadership & influence.
- Product: Product outcomes, Strategy & judgment, Influence & communication.
- General: only Leadership & influence and Cross-team collaboration. These are
  the two SWE dimensions whose wording isn't engineering-specific. Mentorship
  mentions code review, and Impact mentions features.

The "Next rung" line uses the first dimension (Leadership for General). An
optional "Show all dimensions" link expands the rest; that link is the only
control.

**Rules.**

- When the title states a level, the title wins and years are ignored.
- Years windows, calibrated in §2: 1+ → Entry–Mid; 3+ → Mid–Senior; 5+, 8+ and
  10+ → Senior–Staff+.
- The wording is always "usually" with two rungs, never a single level and
  never a percentage.
- Size budget: ≤ 8 KB unminified, including about 3 KB of copied text.

### 4.4 Files and workstreams that change

| Workstream | Files | Change |
|---|---|---|
| product | `public/features/ladder.js` (new), `public/features/features.css`, `test/ladder.test.js` (new) | The module, an `.ms-ladder` style block using the existing `--ms-*` tokens (light and dark), unit tests |
| ux | `public/app.js` | Import `levelCheckFor`. Add a `levelBlock(job)` of about 30 lines to `drawerContent`, between `salaryBlock` and the locations. **Nothing in the main view** |
| qa | `test/e2e/ui.e2e.js` | The drawer test asserts the section. Main-view control counts stay unchanged |
| lead | `docs/CONTRACT.md` (Frontend interfaces), `README.md` feature list | Document `ladder.js` |
| features (separate small ticket) | `server/keywords.js`, `test/keywords.test.js` | Stop "Member of Technical Staff" matching Staff+. Not required for Level check, which treats MTS as unlevelled on its own |
| devops, backend, viz, vetting, livability | none | |

**New Job fields: none.** Phase 2 (idea 2) would add one; see 4.9.

### 4.5 Keeping the ladder in sync between the repos

| Option | How | Pros | Cons |
|---|---|---|---|
| **Copy (recommended)** | Port the strings from `rubricTemplates.ts` into `ladder.js`, with `LADDER_SOURCE` naming the commit | Zero-build; works offline, in static and in server mode; no CORS or CSP change; tiny | Drift is manual. Generic ladders change rarely (the clone I read was shallow, so I couldn't check the file's history) |
| Fetch at runtime | Load the file from GitHub raw or corporate-ladder's Pages | Always current | The source is TypeScript, not JSON. Needs a `connect-src` CSP change in `server/index.js` and a request on every load. Breaks if the repo is renamed or made private |
| Build step | A script reads `../melon-corporate-ladder/src/lib/rubricTemplates.ts` and writes JSON | One source of truth | Needs both repos checked out in `pages.yml`, plus a TS parse. Breaks the zero-build parity of server mode |
| Shared JSON (later) | Move the ladders to `data/ladders.json` in corporate-ladder, import it from `rubricTemplates.ts`, and copy it byte-for-byte here with a sha256 test | Best long-term | Needs an edit in corporate-ladder, so it's the user's call |

Drift guard for v1: `test/ladder.test.js` holds the copied strings as a
fixture. To re-port, update the strings and bump `LADDER_SOURCE.commit` in the
same PR.

### 4.6 Tests

**Unit tests** (`node --test`, `test/ladder.test.js`):

1. `ladderFamily` returns engineering for "Senior Software Engineer,
   Inference" and "Research Scientist"; product for "Product Manager, API" and
   "Technical Program Manager"; general for "Product Marketing Manager" and
   "Account Executive"; null for Intern, Manager and Director+.
2. `titleStatesLevel` is true for "Software Engineer II" and "Staff Engineer",
   and false for "Member of Technical Staff" and "Research Engineer,
   Pretraining".
3. `yearsAsked(['5+ yrs', 'PhD'])` returns 5. It returns null for `[]`, for a
   missing `keywords` and for a missing `fit`.
4. `rungsForYears`: 1 → Entry–Mid; 3 → Mid–Senior; 5, 8 and 10 →
   Senior–Staff+; null → null.
5. `levelCheckFor` on:
   - a titled Senior → source `title`, rungs `['Senior']`, next Staff+;
   - Staff+ → next is null;
   - unlevelled with 8+ yrs → source `years`, rungs Senior and Staff+, and a
     headline containing "8+ yrs" and "usually";
   - unlevelled with no years → source `none` and empty expectations;
   - a Senior PM → the Senior PM text.
6. Copy rules: `note` always contains "generic" and the company name. A
   `years` headline never says "is a … role".
7. Copy fidelity: every expectation string in the ported ladders is identical
   to the fixture taken from `rubricTemplates.ts` at `4a7ab3a`.
8. Robustness: `{}`, `null` and a job without keywords don't throw.

**One-off real-data check** (not in CI): run `levelCheckFor` over every
snapshot. Expect a source split close to title 51 / years 33 / none 16 on IC
postings, and under 50 ms for 5,413 jobs.

**E2E** (`test/e2e/ui.e2e.js`, demo data, which has titled Senior and Staff+
roles and a years ask on 110 of 111 jobs):

- a "Senior Software Engineer …" drawer has a "Level check" heading and
  "Senior";
- an Intern drawer has no section;
- the topbar, quickbar and viz-toolbar control counts are unchanged.

**Manual:** light and dark screenshots of the three cases. Keyboard and
screen-reader check: the section has a heading, and the strip has an
aria-label such as "Level: Senior, on a ladder of Entry, Mid, Senior, Staff+".

### 4.7 Acceptance criteria

1. The main view is unchanged: no new control in the topbar, quickbar, viz
   toolbar or filter panel.
2. The drawer adds exactly one section, "Level check", for Entry, Mid, Senior
   and Staff+ postings, and nothing for Intern, Manager or Director+.
3. Titled postings show the title's rung, three expectation lines and the next
   rung (no next rung at the top).
4. Unlevelled postings with a years ask show a two-rung "usually X or Y" window
   that cites the years. They never claim a single level.
5. Unlevelled postings with no years ask say the level isn't stated and the
   "Mid" tag is a default. They show no expectations.
6. Every section says it is a generic ladder, not the company's own levels.
7. It works in server and static mode, with live, cache, snapshot and demo
   data, offline, and in light and dark themes. It adds no network requests.
8. `npm test` (with the new tests), `npm run build` and the e2e drawer test all
   pass.
9. `ladder.js` is ≤ 8 KB, and `levelCheckFor` over all 5,413 postings takes
   < 50 ms in Node.

### 4.8 Steps and effort

1. product: write `ladder.js`, the fixture and `test/ladder.test.js`, plus the
   styles (about half a day).
2. product: run the real-data check and paste the source split into the
   process log.
3. ux: add `levelBlock` to the drawer and take screenshots in light and dark
   (about half a day).
4. qa: extend the drawer e2e test (1–2 hours).
5. lead: update CONTRACT.md and README, review, and commit as one PR.
6. features (in parallel, optional): the MTS fix.

### 4.9 Out of scope: phase 2 (needs a decision)

**Seniority repair (idea 2)** would feed the same signal into the data: an
"Unstated" seniority bucket instead of the default "Mid", or "Senior
(inferred)". That changes the `seniority` values in the contract,
`server/keywords.js`, the packed-format dictionaries, Compstimate's
`senioritySim`, the filters and group-by. Only do it after Level check has
been seen on real data.

## 5. Recommendation 2 (optional): Prepare for the interview

- **What:** a collapsed drawer section below "What you'll do". When expanded,
  it lists the role's top 3 impact areas. Each comes with the responsibility
  bullet that triggered it and the line "Bring one story: what you did, the
  measurable result, and how far it reached (your team, several teams, the
  company)." A "Copy checklist" button copies the list as plain text.
- **Reuse:** corporate-ladder's five impact categories (`CATEGORIES` in
  `src/db/schema.ts`) and the idea behind its win → impact-statement format,
  written in our own words. No knowledge-base text is copied.
- **Logic:** `prepTopics(job) → [{ category, label, count, example }]` in
  `ladder.js`. One regex lexicon per category runs over
  `sections.responsibilities`. Categories are ranked by matching-bullet count,
  and the top 3 are kept. The section is hidden when fewer than 2 categories
  match (14% of postings).
- **Files:** `ladder.js` (about 60 more lines), `features.css`, `app.js` (the
  section and the copy button), `test/ladder.test.js`. On big boards the
  static build can move `sections` into the lazy description files. The
  section must re-render when they arrive, the same way `renderBullets` does
  through `fillDescription(…, onSections)`.
- **Tests:** a fixture per category, the ranking, the hidden case, and a
  re-render after lazy sections load (e2e on a static build).
- **Acceptance:**
  - collapsed by default;
  - one toggle and one copy button, both inside the drawer;
  - each topic quotes a real bullet from that posting;
  - on the real snapshots, at least 70% of postings get 3 topics (72%
    measured).
- **Effort:** S–M, about one day. Ship it only after Level check, as its own
  PR.

## 6. Why not the others (for now)

- **2 Seniority repair:** high value, but it changes shared data and three
  workstreams. Level check is its safe first step (phase 2).
- **4 Role emphasis bar:** a weaker, number-shaped version of idea 3.
- **5 Pay by rung:** today's level tags would produce inverted ladders at
  OpenAI and Anthropic (§2). Revisit after idea 2.
- **6 Bring your wins:** the best cross-product hook, but it needs a file
  import, handles sensitive personal data, couples to `VaultSnapshot` schema v1
  and adds UI. Revisit if the two apps are meant to work as a pair.
- **7 My level steps:** costs the one main-view control we have, duplicates
  the Seniority filter and inherits its noise.
- **8 Company promotion notes:** none of our companies are covered, and it is
  third-party paraphrase.

## 7. Side findings to route

- **features:** `inferSeniority` classifies "Member of Technical Staff" as
  Staff+ (33 postings at Cohere and xAI).
- **strategy / roadmap:** any level-based pay feature needs seniority repair
  first (the pay-by-level row in §2).
- **data caveat:** the raw snapshot files still contain values that the vetting
  gate quarantines at serve and build time. For example, two Cohere intern
  postings show about $1.04M/yr, from the "$500 stipend" read as $500/hr. None
  of the counts above depend on salary, except the pay-by-level row.

## 8. Open questions for the user

1. Approve **Level check** as the feature to build? And **Prepare for the
   interview**: now, later or never?
2. **Non-engineering ICs** (about 26% of postings): show the general ladder
   (two role-agnostic dimensions, copied verbatim), or hide the section?
3. **Managers and directors** (12%): hide the section (the default)? Or write
   a short manager-track ladder? corporate-ladder has none, so it would be new
   content.
4. **L-numbers:** never show "L3–L6" (the default), because each company
   numbers its levels differently?
5. **The "Mid" chip on unlevelled titles:** leave it as it is for now (the
   default)? Or relabel it "Unstated", which starts phase 2?
6. **Sync:** is copying the ladder text into `ladder.js`, with a provenance
   header, OK? Or should corporate-ladder own a shared `data/ladders.json`?
   That would need an edit in that repo.
7. **License:** corporate-ladder has no LICENSE file. Are you fine copying its
   rubric text into the public melon-seek repo? Should either repo get a
   license?
8. **Drawer order** with the Juice Score: Salary → Juice → Level check →
   Locations?
9. **Years windows:** keep them fixed (the default, re-checked when boards are
   added), or recompute them from snapshots on a schedule?
10. **Long term:** should the two apps be linked at all, for example idea 6
    ("Bring your wins") or a link from the drawer to corporate-ladder? That
    decides whether the shared-JSON route is worth it.
