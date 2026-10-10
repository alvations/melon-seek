# Process log: methodology-copy (Juice Score guide copywriter)

## 1. Brief

Prompt: [prompts/methodology-copy.md](prompts/methodology-copy.md) (verbatim).

The user found `methodology/#1-the-formula` a wall of text. The plan agreed with the lead:
- docs/LIVABILITY.md stays the full technical reference and moves to `methodology/reference/`.
- A short, human guide, docs/METHODOLOGY_GUIDE.md, becomes `methodology/`. The UX engineer renders it with build-time infographics through `{{figure:…}}` and `{{value:…}}` placeholders.

This workstream writes that guide: plain, warm, precise and short, for a job seeker with no tax or statistics background. Every claim matches the code and the reference, and no number that comes from data or code is typed in by hand.

Files owned:
- docs/METHODOLOGY_GUIDE.md
- this log
- docs/process/prompts/methodology-copy.md

Not edited: docs/LIVABILITY.md, scripts/*, the app.

## 2. Inputs and sources

| Read | What it gave |
|---|---|
| docs/LIVABILITY.md (all of it; headings at §1 l.17, Households l.51, Guardrails l.103, Score curve l.126, §2 l.237, §3 l.278, §4 l.667, §5 l.872, §6 l.901, §7 l.942; line numbers as of 2026-10-10, the file is being edited by other agents) | The method; what counts as tax; household presets; confidence rules; limitations; refresh policy |
| server/juice.js: `HOUSEHOLDS` l.103-106, `LIVING_SCALE` l.94, `K_USD`/`SCORE_ANCHORS` l.136-140, `GRADES`/`RIND` l.144-149, `scoreFromNet` l.156, `gradeFor` l.162, `taxHousehold` l.212, `TAX_SOURCES` l.887+, `TAX_HOUSEHOLD` l.969+, `CLASS_CONFIDENCE` l.1133, `taxConfidence` l.1149, `confidenceFor` l.1164, `computeJuice` l.1187+ (tax l.1197, rent l.1227, living l.1231, net l.1234, rounded score l.1235, rentBurden l.1276, estimated l.1284), `attachJuice` l.1405+ (remote skip l.1417, currency scoping l.1424, best l.1442) | The ground truth for every sentence |
| server/salary.js l.34 (`FACTORS`), l.513 (`mid`) | Gross pay is the midpoint of the annualized range |
| public/app.js l.1869-1875 (badge, ≈), l.2058 (`JUICE_DOC`), l.2059-2069 (household switch, labels, scope, localStorage), l.2139 (≈ in the drawer), l.2150-2163 (waterfall rows and wording), l.2166 (Monthly/Yearly), l.2185 (rent share of take-home pay), l.2187 ("Compare locations"), l.2223-2224 and l.2328 (equity/bonus labels, "Posted base pay") | The words the UI uses, so the guide matches what people see |
| data/cities.json (89 cities, 33 countries; `fx`, `baseline`, `sources.*.class`, `dataStatus`) | Source classes and dates |
| data/freshness.json, docs/DATA_FRESHNESS.md §1, .github/workflows/{snapshot,pages,monthly-refresh,col-refresh}.yml | Refresh cadences: jobs daily, Pages daily, monthly refresh on the 3rd, Numbeo quarterly by hand, tax yearly |
| docs/strategy/ROADMAP.md F8 (l.182, l.653) | Why non-US results are rated low |
| scripts/md.js (the UX engineer's new version: `{#id}`, `{{figure}}`/`{{value}}`, `<!-- key: value -->`, `> [!NOTE]` callouts, value safety check) | What syntax the guide can use |
| docs/process/prompts/methodology-ux.md | The UX engineer's side of the placeholder contract |

No skills were loaded (copy only; the figures are the UX engineer's). No web sources: every fact comes from the repo.

## 3. Decisions and rationale

1. **Shape: answer, then how, then details.**
   - The intro (under the h1, no h2) gives the one-sentence definition, the melon metaphor, the worked example `{{figure:waterfall}}` with its values, and the disclaimer.
   - Then nine numbered sections: 1 formula, 2 score and grades, 3 tax, 4 households, 5 limitations, 6 confidence, 7 updates, 8 FAQ, 9 reference.
   - Alternative: households before the score. Rejected, because the score is what people look up first (it's on every card).
2. **Numbering chosen so the natural slugs hit the old anchors.**
   - "1. The formula" gives `1-the-formula`, "3. Tax model" gives `3-tax-model` and "5. Limitations" gives `5-limitations`.
   - No `{#id}` overrides are needed. That is robust even if the explicit-id syntax changes.
   - "Tax model" and "Limitations" are plain enough as headings. Each section's first line says it in everyday words.
3. **One figure per idea, and the text doesn't repeat the figure.** This was settled by proofreading the built page (§5). The figures turned out to carry more than the contract promised, so the prose was cut back to what they don't say:
   - **Grades**: `{{figure:grades}}` shows names, score ranges, dollar thresholds, meanings and the rounded-score note. The text keeps only that the same grades colour the map and drive the Juice filter, with Rind under Dry (app.js l.363-364, palette.js l.245).
   - **Confidence**: `{{figure:confidence}}` shows the level meanings, the per-level counts, the weakest-input rule, the non-US rule and the Couple/Family caveat. The text keeps why most results are medium or low (Numbeo), the replacement plan, and the ≈ callout with examples.
   - **Sources**: `{{figure:sources}}` shows every source, its as-of date and its cadence. The text keeps what the table can't: the page is rebuilt daily, exchange rates are fetched automatically while Numbeo is re-read by hand, and when tax years start.
   - **Intro**: the waterfall's own title repeats the example sentence, so the intro is one sentence (who, salary, city, Juice left, score) placed before the figure. It no longer repeats every line after it.
   - **Households**: the figure's cards show each preset's people and bedrooms, so the preset list went. The text keeps "children under 14", the scope of the switch, why the multipliers aren't 2 and 4, where they come from, and what stays the same.
   - All eight figures are used, each once, on its own line at the top of its section, except the waterfall, which sits in the intro.
4. **Grade thresholds should follow the code's behaviour, not netForScore(min).**
   - Grades come from the rounded score (juice.js l.1235), so Juicy starts at $94,996 of Juice left and Ripe at $47,103.
   - LIVABILITY's table (l.137-138) gives $96,318 and $47,827, which is the Juice left for an exact score of 70 and 45. The UX engineer's `grade.*.net` and the grades figure use the same `netForScore(min)` values.
   - I requested the rounding-aware value, consistent with how `fullGlassUSD` is already defined: the smallest net whose rounded score is 100 (juice.js l.140).
   - The final guide text no longer prints these values. The grades figure does. See §6.
5. **No hand-typed data numbers.**
   - Dollar amounts, the curve constant, household multipliers, counts and dates are all `{{value:…}}`.
   - Hand-written numbers are definitions only:
     - 0 to 100;
     - 63 and 86 (the curve's score at 1× and 2× its constant, a property of the exponential shape);
     - 1, 2 and 3 bedrooms (the presets);
     - "children under 14" (the preset definition);
     - "$100 a month = $1,200 a year" (arithmetic);
     - £100,000 (an illustration).
6. **Things left out on purpose.**
   - *Rent override.* computeJuice supports it, but the UI has no field, so the guide doesn't promise one. The FAQ gives the $100/month = $1,200/year rule instead.
   - *Confidence in the UI.* Only the ≈ marker is shown, so the guide says "we rate every result" and explains the ≈. It does not claim the rating is visible.
   - *FX source name.* It is in flux: Big Mac `dollar_ex` today, ECB monthly averages in the freshness agent's pending work. The guide says "a dated snapshot" and leaves the name to `{{figure:sources}}`.
   - *Numbeo licence status.* That is an internal decision (ROADMAP D6). The guide is open that the data is crowd-sourced, rates it medium, and mentions the replacement plan.
   - *Tax internals* (SALT cap amounts, recapture, Big Mac counts). The reference covers them, and section-end "More detail" links point there.
7. **Words.**
   - No unexplained abbreviations: "Social Security and Medicare", "US dollars", "National Insurance", "exchange rates" (not FX).
   - "401(k)" is kept: it is the everyday name. No OECD, HUD, FICA, SALT, NYC or RS/RE.
   - Numbeo is named once and explained as "a crowd-sourced cost-of-living website".
8. **Puns:** one, the melon/rind/juice metaphor in the intro, which is also the product's own definition (`JUICE.tagline`, juice.js l.31). The grade names are the product's own.
9. **Callouts:** the disclaimer is `> [!IMPORTANT]` and the ≈ explanation is `> [!NOTE]`. These are the GitHub-alert syntax md.js turns into `<aside class="callout">`. Limitations is a plain section with three bold sub-labels, so the UX engineer can style it by its id.
10. **FAQ** (7 questions): the ones the drawer raises.
    - Take-home versus Juice.
    - Why not 100.
    - Bonus, equity and 401(k).
    - Couple or Family drop.
    - Different rent.
    - No score.
    - Several cities.

    The ≈ question is answered in §6 and not repeated.
11. **Length:** about 1,930 words after the built-page trim, versus 14,700 in LIVABILITY (about 13%). That is under the quarter the brief aimed for, deliberately, given the "wall of text" complaint. Every must-cover item is in.
12. **Description comment:** 158 characters, so it fits a search snippet.

### Anchors provided (h1/h2/h3 ids in the guide)

| Id | Section | Old anchor it serves |
|---|---|---|
| `how-the-juice-score-works` | h1 | |
| `1-the-formula` | 1. The formula | **the app's JUICE_DOC link** (public/app.js l.2058); same id as LIVABILITY |
| `2-score-and-grades` | 2. Score and grades | (old `#score-curve-and-grades` is an h3 of the reference; linked from data/freshness.json l.13097 and docs/DATA_FRESHNESS.md l.364, l.3936, about the calibration paragraph, so it should resolve to `reference/#score-curve-and-grades` through the UX engineer's anchor index) |
| `3-tax-model` | 3. Tax model | LIVABILITY `#3-tax-model` |
| `4-households` | 4. Households | |
| `5-limitations` | 5. Limitations | LIVABILITY `#5-limitations` |
| `6-how-sure-we-are` | 6. How sure we are | |
| `7-how-often-its-updated` | 7. How often it's updated | |
| `8-questions` | 8. Questions | |
| `is-juice-left-the-same-as-take-home-pay`, `why-doesnt-a-big-salary-get-100`, `are-bonuses-equity-or-my-401k-included`, `why-does-the-score-drop-when-i-pick-couple-or-family`, `my-rent-will-be-different-how-much-does-that-matter`, `why-do-some-jobs-have-no-juice-score`, `the-job-lists-several-cities-which-one-is-scored` | FAQ h3s | |
| `9-the-full-technical-reference` | 9. The full technical reference | |

LIVABILITY anchors with no same-id section here, for the anchor index: `2-jobs-attachjuicejob-cities`, `4-data-datacitiesjson`, `6-refreshing`, `7-plan-replacing-numbeo-with-official-and-open-sources`, and every h3.

### Links out of the guide (all relative, to the reference page)

`reference/` and `reference/#` plus each of these:
- `1-the-formula`
- `score-curve-and-grades`
- `3-tax-model`
- `tax-sources`
- `households-just-me-couple-family`
- `5-limitations`
- `guardrails-inputs-confidence-rent-override`
- `estimates`
- `sources`
- `6-refreshing`

Every target exists in LIVABILITY's slug list (checked with `slugify`). The guide's link policy (`linkFor` in scripts/methodology.js) must keep `reference/…` hrefs as links.

### Placeholders used

- Figures: `waterfall` (intro), `formula` (§1), `score-curve` and `grades` (§2), `tax-split` (§3), `households` (§4), `confidence` (§6), `sources` (§7).
- Values in the final text:
  - `example.gross`, `example.city`, `example.net`, `example.score`, `example.grade`;
  - `score.k`, `score.fullGlass`;
  - `tax.asOf`;
  - `household.couple.scale`, `household.family.scale`;
  - `cities.count`, `countries.count`.
- Values no longer used in the text, because the figures show them: `example.tax`, `example.rent`, `example.living`, `fx.asOf`, `rent.asOf`, `grade.*.net`, `confidence.*`. They stay implemented for the figures and the hero.
- Values requested: see the list at the end.

## 4. Replayable steps

1. Save the prompt: docs/process/prompts/methodology-copy.md.
2. Read the inputs in §2. Then compute what the guide claims from the live code:
   ```sh
   node --input-type=module -e '
   const J = await import("./server/juice.js"); const fs = await import("node:fs");
   const doc = JSON.parse(fs.readFileSync("data/cities.json", "utf8"));
   console.log(J.SCORE_ANCHORS, J.GRADES, J.HOUSEHOLD_KEYS.map(k => J.livingScaleFor(k).toFixed(2)));
   const c = { high: 0, medium: 0, low: 0 }; for (const x of doc.cities) c[J.computeJuice(1e5, x).confidence]++; console.log(c);
   const first = (g) => { let lo = 0, hi = 1e6, o = ["Juicy","Ripe","Dry"]; while (hi - lo > 1) { const m = (lo + hi) >> 1, s = Math.round(J.scoreFromNet(m)); if (o.indexOf(J.gradeFor(s, m)) <= o.indexOf(g)) hi = m; else lo = m; } return hi; };
   console.log("Juicy from", first("Juicy"), "Ripe from", first("Ripe"), "vs netForScore", Math.round(J.netForScore(70)), Math.round(J.netForScore(45)));'
   ```
   Results (2026-10-10):
   - K $80,000; full glass $423,866.
   - Scales 1.00 / 1.72 / 2.41.
   - Confidence for one person: high 0, medium 30, low 59. For Couple and Family, all 89 are low.
   - Juicy from $94,996 and Ripe from $47,103, versus $96,318 and $47,827 from `netForScore`.
   - San Francisco at $300,000, one person: tax $108,447, rent $44,145, living $18,184, net $129,224, score 80, Juicy.
3. Write docs/METHODOLOGY_GUIDE.md.
4. Dry-render it with the UX engineer's md.js, using stub figures and values. This lists the headings and ids, the placeholders, the links and any broken in-page anchors:
   ```sh
   node --input-type=module -e '
   import fs from "node:fs"; import { mdToHtml, commentField } from "./scripts/md.js";
   const md = fs.readFileSync("docs/METHODOLOGY_GUIDE.md", "utf8"); const f = new Set(), v = new Set(), l = new Set();
   const { html, headings } = mdToHtml(md, { figure: n => (f.add(n), "<figure></figure>"), value: k => (v.add(k), "V-" + k.replace(/\W/g, "-")), link: h => (l.add(h), h) });
   const ids = new Set(headings.map(h => h.id));
   console.log(commentField(md, "description"), headings.map(h => h.id), [...f], [...v], [...l],
     [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1]).filter(a => !ids.has(a)), html.includes("{{"));'
   ```
   Stub values must avoid `_ * [ ] | \ { }`, because md.js rejects values that contain Markdown syntax.
5. Proofread the text with real numbers. Fill every value from the live code (formatted "$300,000", "July 2026"), render, strip the tags and read it end to end. This was done for San Francisco at $300,000.
6. Proofread the UX engineer's built page: `npm run build`, then open dist/methodology/index.html. See §5.

## 5. Verification

- **Dry render** (step 4):
  - 17 headings, with `1-the-formula`, `3-tax-model` and `5-limitations` present.
  - All 8 figures used.
  - 22 distinct values.
  - 11 reference links.
  - 0 broken in-page anchors, no literal `{{`.
  - Description 158 characters.
- **Text proofread with live values** (step 5). Fixed:
  - a repeated "Most … Most …";
  - "about $94,996", where a hedge sat on an exact figure;
  - "0 cities are rated high", now "high 0, medium 30, low 59";
  - "a family of four's are";
  - "Each rule is checked", which overstated verification (27 of 71 `TAX_SOURCES` are `verified: true`), now "We check each rule … Where part of a rule couldn't be confirmed…";
  - "small cities rest on few reports", moved from living costs to rent, where §5 l.897 puts it;
  - a currency-scoping sentence that was too absolute (only when *some* locations use the currency);
  - the ≈ cause "simplified tax schedule", where only `estimated` schedules trigger ≈ and not `approximate` ones.
- **Built-page proofread.**
  - `npm run build` (09:04) exited 0.
  - A first run at 08:59 failed with "renderMethodologyPage is not a function", because the UX engineer was mid-integration. That run left dist/methodology/ empty until the 09:04 build.
  - Checked in dist/methodology/index.html:
    - the meta description comes from the guide comment;
    - ids `1-the-formula`, `3-tax-model` and `5-limitations` are present, and so is `score-curve-and-grades` (the UX engineer's alias anchor);
    - no literal `{{`;
    - all 30 `reference/#…` links resolve in dist/methodology/reference/index.html;
    - every in-page link resolves.
  - Screenshots, from the same renderer (`methodologyPages`) written to the scratchpad with the site's CSS:
    - desktop 1280, phone 390 light, phone 390 dark;
    - no horizontal overflow, no console errors.
  - Trimmed the prose that repeated figures (§3 decision 3).
- **Proofread script for screenshots** (scratchpad, not committed): render with `methodologyPages({ root })`, copy public/styles.css, favicon.svg, theme-init.js and fonts next to it, and screenshot with Playwright from `NODE_PATH=<scratchpad>/pw/node_modules`, Chromium /opt/pw-browsers/chromium-1194.

## 6. Known gaps and follow-ups

1. **Grade thresholds in the reference ignore rounding.**
   - LIVABILITY l.137-138 says Juicy needs ≥ $96,318 and Ripe ≥ $47,827. The code grades $94,996 as Juicy and $47,103 as Ripe, because grades come from the rounded score.
   - For LIVABILITY's owner: fix it, or say the dollar figures are for an exact score.
   - For the UX engineer: draw the grade bands in `score-curve` and `grades` with the same definition as `grade.*.net`.
2. **Tax-year start in the reference.**
   - LIVABILITY §6 l.928 says "April for UK/AU/IN/NZ fiscal years". Australia's starts on 1 July (data/freshness.json `tax-au` asOf 2026-07-01).
   - The guide says "January in most countries and April or July where the tax year starts then".
3. **Confidence is not shown in the UI.** Only the ≈ marker is. ROADMAP F8 asked for the inputs and an editable rent field in the drawer. If that ships, update §6 and the rent FAQ ("enter your own rent").
4. **FX source.** If the freshness agent's switch to ECB monthly averages lands, the guide stays correct. It names no FX source or date; `{{figure:sources}}` and the hero do. §7 of the guide only says exchange rates are "fetched automatically", which holds for both the Big Mac and the ECB pipelines.
5. **`#score-curve-and-grades`** (linked from data/freshness.json and docs/DATA_FRESHNESS.md) is not a heading id in the guide. Resolved on the built page: the UX engineer's alias anchor puts that id on §2, the section that links to `reference/#score-curve-and-grades`.
6. **Figure issues found while proofreading** (UX engineer's files; reported, not edited):
   - `{{figure:score-curve}}`: the curve line is not drawn. Only a short stub shows at the top left of the plot, in both light and dark, at 1280 and 390.
   - `{{figure:grades}}` and the score-curve markers say Juicy is "$96,318 or more" and Ripe "$47,827 or more". With rounding, Juicy starts at $94,996 and Ripe at $47,103 (§3 decision 4).
   - `{{figure:sources}}` has two problems:
     - The "Household scale" row says "Modified OECD equivalence scale". The user rejected unexplained abbreviations; suggest "UK government household scale (modified OECD scale, after housing costs)".
     - The bedroom-ratio row lists agency acronyms (HUD, ONS, CSO PxStat RIQ02, NSW) with no plain-language lead.
   - `{{figure:sources}}` also says Big Mac prices feed "the drawer's 'Big Macs a year'". The drawer does not show Big Macs (public/app.js `juiceBlock` has no `bigMacs`; only public/mock-api.js computes it).
7. **Household tax examples** are typed in by hand: the US, Germany and France joint; the UK, Canada and Australia individual (juice.js `TAX_HOUSEHOLD` l.970, l.1007-1008, l.1001, l.1035, l.1033). If the tax agent changes a basis, re-check §3 of the guide.

## 7. Change log

- 2026-10-10 08:50: prompt saved; inputs read; guide drafted; dry render and live-value proofread; fixes listed in §5; log written.
- 2026-10-10 09:00-09:05: proofread against the UX engineer's rendered page; trimmed the prose that duplicated figures (intro, §2 grades, §4 presets, §6 confidence, §7 sources); `npm run build` green; built-page checks in §5; figure issues in §6.6.

## Values requested

Status at 09:05:
- The UX engineer implemented all of these (scripts/methodology-figures.js l.147-177).
- `grade.*.net` is implemented as `netForScore(min)`, which differs from the definition below.
- The final guide text uses `score.k`, `score.fullGlass`, `household.couple.scale` and `household.family.scale`. The others feed the figures.

Each is plain text with no Markdown characters (md.js rejects `` ` * _ [ ] | \ { } ``):

| Key | Meaning | Today |
|---|---|---|
| `score.k` | `SCORE_ANCHORS.K` as US dollars | `$80,000` |
| `score.fullGlass` | `SCORE_ANCHORS.fullGlassUSD` as US dollars | `$423,866` |
| `grade.juicy.net` | Smallest whole-dollar Juice left that computeJuice grades Juicy: `Math.ceil(netForScore(min − 0.5))` with min = the Juicy entry of `GRADES` (rounded score ≥ min). Not `netForScore(min)`; see §6.1 | `$94,996` |
| `grade.ripe.net` | Same for Ripe | `$47,103` |
| `household.couple.scale` | `livingScaleFor('couple')`, 2 decimals | `1.72` |
| `household.family.scale` | `livingScaleFor('family')`, 2 decimals | `2.41` |
| `confidence.high` | Number of cities in data/cities.json whose `computeJuice(any salary, city, { household: 'single' }).confidence` is `high` (it does not depend on salary) | `0` |
| `confidence.medium` | Same, `medium` | `30` |
| `confidence.low` | Same, `low` | `59` |

How the guide uses the contract's own values, so they can be formatted to read well:
- `example.*` is the **Just me** household: the intro says "one person on {{value:example.gross}} a year in {{value:example.city}}".
  - Money values are formatted like `$300,000`. A negative `example.net` uses a minus sign (`−$1,352`).
  - `example.grade` is the bare label (`Juicy`).
- `tax.asOf` is used as "(last checked {{value:tax.asOf}})" and "Checked as of {{value:tax.asOf}}", so the date of the latest `TAX_SOURCES[*].reviewed` reads best (`10 October 2026`). A bare year also reads acceptably.
- `fx.asOf` is used as "The rates in use are from {{value:fx.asOf}}", e.g. `July 2026`.
- `rent.asOf` is used as "Current rents are as of {{value:rent.asOf}}": the one-bedroom rents' as-of month (most common), or a range such as `May to October 2026`.
- `cities.count` and `countries.count` are bare integers.
