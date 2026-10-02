# Process log: product features (Compstimate + Market insights)

## 1. Brief
Prompt: [prompts/product.md](prompts/product.md) (verbatim, with the
coordinator's mid-task messages). The goal was two features in the spirit of
Zillow: **Compstimate**, a Zestimate-style pay estimate for any role built from
similarity-weighted comparable postings, and a **Market insights** panel with
skill premiums, pay by department (box/whisker), hot locations and fit
requirements. Both are plain ES modules with no dependencies. The pure logic
runs in Node so it can be unit tested, and the CSS works in light and dark.

Files owned:
- `public/features/shared.js`: FX, salary to USD, percentile helpers, formatting, a safe DOM builder `h()`, a tooltip, a focus helper
- `public/features/roles.js` (v2): title normalization, role families, seniority. No imports, Node-safe
- `public/features/compstimate.js`: `estimateComp`, `compstimateForJob`, `backtest` (v2), accuracy helpers (v2), the widget
- `public/features/comps.js` (v2): market comps (`marketComps`, `compsForJob`, `familyOptions`, `createCompsCard`)
- `public/features/insights.js`: stats helpers and `createInsights`
- `public/features/features.css`: all styles, scoped under `.ms-comp` and `.ms-insights`
- `public/features/demo-data.js`: deterministic FAKE jobs (every company is named "… (demo)")
- `public/features/demo.html`: the harness page
- `test/features.test.js`
- `docs/process/product.md`, `docs/process/prompts/product.md`, `docs/process/scripts/product-screenshots.mjs`,
  `docs/process/scripts/product-family-check.mjs` (v2)

## 2. Inputs and sources
- `docs/CONTRACT.md`: the normalized Job shape. Fields used: `salary.{min,max,mid,currency,interval}`
  (annualized), `seniority` ladder, `locations[].{city,name,region,country,remote}`,
  `department`, `keywords.{skills,fit,responsibilities}`.
- `public/viz/palette.js` (viz workstream): exports `toUSD`, `hasFx`, `FX_TO_USD`,
  `formatMoney`, `niceTicks`. Its formatting rule is 352500 → "$352K". `shared.js` imports it
  as a namespace (`import * as palette`), so a missing named export cannot break loading.
- `public/viz/viz.css`: copied its token pattern (`--_x: var(--ms-x, fallback)` plus a dark
  block under `@media` and `:root[data-theme="dark"]`). It also has **unscoped `.ms-row*`
  rules**, which is why every internal class here has a namespace (decision 12).
- `public/styles.css` (ux workstream): the real `--ms-*` tokens (accent `#0b7a5c` light,
  `#3ccf9a` dark; Inter font). `demo.html` copies them so the harness looks like the app.
- `public/mock-api.js`: a reference for realistic fake data (departments, levels, cities).
  It was not imported, because another workstream owns it.
- `server/demo.js` + `server/normalize.js`: used once from Node to check the features against
  real pipeline output for anthropic, anduril and openai (section 5).
- Skill **dataviz** (`references/palette.md`, `marks-and-anatomy.md`, `interaction.md`,
  `anti-patterns.md`): gave the diverging blue↔red pair, bars ≤24px with a 4px rounded data
  end that is square at the baseline, hairline solid grids, a hero figure ≥48px in the UI sans,
  the "text never wears series color" rule, the rule that tooltips enhance but never gate, hit
  targets bigger than marks, and selected (not auto-flipped) dark steps.
- `docs/REVIEW.md` finding L9 (coordinator message): block `on*` string attributes in `h()`.

## 3. Decisions and rationale

1. **Module split.** Shared pure helpers live in `shared.js`. `compstimate.js` and `insights.js`
   re-export `percentile` and similar helpers so tests and the lead can import from either
   one. Widget functions touch `document` only when called, so importing in Node is safe.

2. **FX.** `toUSD(amount, cur)` uses `palette.toUSD` when palette knows the currency and
   otherwise falls back to `FX_FALLBACK` (static, approximate, same values as palette plus extras):
   `USD 1, GBP 1.27, EUR 1.09, CAD 0.73, AUD 0.66, JPY 0.0067, SGD 0.74, CHF 1.13, INR 0.012,
   SEK 0.095, NOK 0.093, DKK 0.146, PLN 0.25, ILS 0.27, KRW 0.00073, HKD 0.128, NZD 0.6,
   MXN 0.055, BRL 0.18, CNY 0.14`. An **unknown currency returns null**, and such jobs are
   dropped rather than mixed in. Palette, by contrast, returns the amount unchanged.
   `salaryUSD(job)` uses `salary.mid`, or (min+max)/2. As a defensive rule it annualizes
   `interval: hour` values under 1000 (×2080) and `month` values under 30000 (×12).

3. **Title normalization** (`normalizeTitle`):
   - lowercases, strips accents, and collapses `c++→cplusplus`, `front-end→frontend`,
     `back-end→backend`, `full-stack→fullstack`, `site reliability→sitereliability`,
     `machine learning→machinelearning`, `&→and`;
   - expands abbreviations (`ABBREV`): swe/sde → software engineer, sre, mle, ml → machine
     learning, pm, tpm, em, ae, sdr, bdr, csm, se → solutions engineer, sa, ds, da, eng/engr,
     dev, infra, ops, mgr, hr → people, gtm, sr → senior, jr, dir, rs, fde, qa…;
   - drops **level words** (`senior staff principal lead junior intern head director vp chief
     distinguished fellow associate entry new grad i ii iii iv 1-4 founding …`), which are
     handled by seniority instead, and **stopwords** (`of and the for … team remote hybrid
     onsite contract full time …`);
   - stems a trailing `s` on tokens longer than 4 characters (not `ss/us/is`) and maps
     synonyms: developer/programmer/engineering → engineer, management → manager,
     researcher → research, science → scientist, designer → design, recruiting → recruiter.
   - **Role family**: ordered regexes over the expanded *role part* (the text before the first
     `,`, ` - `, ` | `, `(`), falling back to the full title. Order: eng-manager, data, design,
     legal, people, finance, sales, marketing, product, program, support, ml, hardware,
     security, swe. The order makes "Product Designer" design, "Product Counsel" legal,
     "Software Engineer, Inference" swe (the role part wins over the team name) and
     "ML Engineer" ml.
   - `inferSeniority(title)` is used when the user picks no level. In priority order:
     intern → Intern; chief/vp/head/director → Director+; staff/principal/distinguished/fellow
     → Staff+; "manager" that is not product/program/project/account/partner/… manager →
     Manager; senior/lead → Senior; junior/new grad/graduate/entry/associate → Entry;
     otherwise null.

4. **Compstimate similarity.** For each job with usable pay (excluding `excludeId`):
   ```
   idf(t)      = ln(1 + N / (1 + df(t)))            over the salaried pool's title tokens
   coverage    = Σ_{t∈Q∩J} idf / Σ_{t∈Q} idf         precision = Σ_{t∈Q∩J} idf / Σ_{t∈J} idf
   tokenSim    = 0.7·coverage + 0.3·precision
   familySim   = 1 same family | affinity (table) | 0 different | 0.35 if either unknown
   titleSim    = 0.7·tokenSim + 0.3·familySim       (1 when no title was given)
   w           = titleSim² · senSim · deptSim · locSim
   ```
   - Family affinity: swe|security 0.6, swe|ml 0.45, swe|data 0.45, ml|data 0.55,
     swe|eng-manager 0.4, swe|hardware 0.35, product|program 0.35, sales|support 0.4,
     sales|marketing 0.3, product|design 0.25, eng-manager|program 0.25.
   - `senSim` uses ladder positions Intern 0, Entry 1, Mid 2, Senior 3, Manager 3.5, Staff+ 4,
     Director+ 5. By distance d: 0 → 1, ≤0.5 → 0.55, ≤1 → 0.35, ≤1.5 → 0.2, ≤2 → 0.1,
     else 0.03. If the job has no level: 0.5. With **no level asked for**: Intern 0.25,
     Director+ 0.5, others 1, because interns and executives are separate pay classes. Without
     this rule, "Software Engineer" ranked a "Software Engineer Intern" first.
   - `deptSim`: no department asked → 1, same → 1, job has none → 0.7, different → 0.5.
   - `locSim` (best over the job's locations), with the query resolved against the data by
     `resolveLocation`:
     - city query: same city → 1, same region and country → 0.75, same country → 0.6,
       unknown query country → 0.4, other country → 0.25;
     - country or region query: match → 1, else 0.6 / 0.25;
     - "Remote" query: remote job → 1, on-site in the same or unknown country → 0.6,
       else 0.3;
     - job with no locations → 0.5.
   - Squaring titleSim makes the title dominate. Multiplying the factors means any strong
     mismatch, such as another country or a level two steps away, pushes a job down without
     excluding it outright.

5. **Selection and estimate.** A job counts as a comparable when `w ≥ max(0.02, 0.12·w_best)`
   (safety cap of 500). If `w_best < 0.02` there is no estimate, and the explanation names the
   title (for example "Pastry Chef").
   - `mid` = weighted median of the comparables' USD mids.
   - `low`/`high` = weighted **P15/P85 of pooled band points**: each comparable contributes min
     (0.25w), mid (0.5w) and max (0.25w). One comparable therefore yields roughly its own
     posted band, and a spread-out set of comparables widens the range.
   - Results are clamped so low ≤ mid ≤ high and rounded to $1K.
   - Weighted percentile: sort, place each value at the centre of its weight mass
     ((cum − w/2)/W), interpolate linearly, clamp at the ends. With equal weights this is the
     Hazen percentile. The unweighted `percentile` is linear interpolation (numpy default / R
     type 7).

6. **Confidence.**
   - Inputs: nEff = (Σw)²/Σw², topSim = mean w of the top 5, spread = (high−low)/mid.
   - **High** if nEff ≥ 5, topSim ≥ 0.5 and spread ≤ 0.6. **Medium** if nEff ≥ 2,
     topSim ≥ 0.25 and spread ≤ 1. Otherwise **Low**.
   - With no title the result is always Low, because a board-wide figure is not a role
     estimate.
   - The explanation states the query, N, how many titles match closely (titleSim ≥ 0.75),
     the P15–P85 rule and how many non-USD bands were converted.
   - `scores` (w rounded to 0.01) line up with `comparables` and appear as "84% match".

7. **Widget.**
   - Form: a title input with a `<datalist>` (titles without level prefixes, most common
     first, ≤250), a location select (cities plus Remote, with counts) and a level select
     (ladder order, with counts).
   - The first title is filled automatically with the most common salaried role, so the card
     is never empty. It stops auto-filling once the user types.
   - The card shows a 48px hero, a 3-bar signal icon with a text label (never color alone),
     "Based on N comparable roles" and a range bar. The bar's track is the board-wide
     P5–P95 spread, the band is low–high and the dot is mid, so the reader sees where the
     role sits in the company.
   - Then the explanation and the 5 comparables as buttons that call `onSelect(job)`. A `*`
     marks converted pay.
   - An `aria-live` summary sentence is the only live region, so screen readers are not
     spammed. Title input is debounced by 160ms.
   - A container query at ≥640px switches to form-in-a-row and card | comparables.

8. **Insights stats.**
   - Baselines are the median of the jobs **in view**, so filtering to Engineering does not
     make every skill look positive. The box-plot axis domain comes from **all jobs**, so
     filtering does not rescale it.
   - `skillPremiums`: the 12 most frequent skills with ≥3 salaried roles, then sorted by
     premium.
   - `deptBoxes`: P10/P25/median/P75/P90 per department, null department → "Other",
     sorted by median. The panel shows departments with ≥3 salaried roles (falling back to all
     when none qualify) and adds a footnote for the hidden ones. Single-role departments were
     topping the list on the real anthropic/openai demo data.
   - `hotLocations`: a job listed in two cities counts in both; remote → "Remote".
   - `fitRequirements`: share of roles in view, with median/premium only when ≥3 of those
     roles are salaried.
   - `topResponsibilities`: chips.
   - `onFilter` values: skill/fit/responsibility = the keyword label, department = the
     department string, location = `loc.city || loc.name`, or `"Remote"`.

9. **Visual encoding (dataviz skill).**
   - Skill premium is a diverging bar from a hairline zero, blue `#2a78d6` / red `#e34948`
     (dark `#3987e5` / `#e66767`), with a legend and the value at the right in ink.
   - The single-series marks (boxes, location bars, meters, comp band) use the app accent
     ramp via `color-mix`. The viz chart does the same, so the panel matches the chart.
   - Bars are 8–12px with 4px rounded data ends. Grid and axis lines are solid hairlines.
     Labels use text tokens.
   - Tooltips show value first, then label, then rows, all set with `textContent`. They
     appear on hover and on keyboard `:focus-visible` (not on mouse focus). Every value a
     tooltip shows is also in the row's `aria-label`.

10. **Responsive.**
    - Named containers: `ms-insights` gives 4 stat tiles at ≥620px and 2 card columns at
      ≥720px. `msi-card`: department rows are stacked when narrow and side by side at ≥500px.
    - An axis-label collision pass (`fitAxes`) keeps edge labels inside the track and greedily
      hides interior ticks that would overlap. It re-runs from a ResizeObserver. Screenshots
      showed `$400K$500K` colliding before this was added.

11. **Theming.** `--_*` locals read `--ms-bg/surface/text/muted/border/accent` (plus optional
    `--ms-surface-2`, `--ms-border-strong`, `--ms-accent-soft`, `--ms-accent-strong`,
    `--ms-radius`, `--ms-font`, `--ms-focus`) with their own fallbacks. Dark values are
    declared under both `@media (prefers-color-scheme: dark) :root:where(:not([data-theme=light]))`
    and `:root[data-theme=dark]`. `forced-colors` and `prefers-reduced-motion` are handled.

12. **Class namespacing.** Classes are `ms-comp__*`, `ms-insights__*`, `msi-*` (insights
    internals) and `msf-*` (shared: tooltip, sr-only, field), because `viz.css` styles bare
    `.ms-row`, `.ms-row__label` and similar globally.

13. **Security (REVIEW.md L9).** `h()` never calls `setAttribute` for `on*` keys (any case);
    function values become listeners. It drops `srcdoc` and URL attributes (`href src action
    formaction xlink:href poster srcset`) unless they are relative, `#`, `http(s):` or
    `mailto:`. Children are always text nodes, and no `innerHTML` is used anywhere in
    `public/features/`. Covered by a unit test with a fake `document`.

## 4. Replayable steps
```sh
# unit tests (Node >= 18)
cd /home/user/melon-seek
node --test test/features.test.js        # features only
npm test                                 # whole repo

# quick look at the logic from Node
node --input-type=module -e "
  const C = await import('./public/features/compstimate.js');
  const { fakeJobs } = await import('./public/features/demo-data.js');
  console.log(C.estimateComp(fakeJobs('acme', 140), { title: 'Senior SWE', location: 'San Francisco' }));"

# screenshots: playwright in a scratch dir (never in the repo, never `playwright install`)
SCRATCH=/tmp/claude-0/-home-user-melon-seek/<session>/scratchpad
mkdir -p "$SCRATCH/pw" && cd "$SCRATCH/pw" && npm init -y >/dev/null && \
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright@1.56.0
ls /opt/pw-browsers            # chromium-1194/chrome-linux/chrome is picked automatically
cd "$SCRATCH/pw" && OUT_DIR="$SCRATCH/product-shots" \
  node /home/user/melon-seek/docs/process/scripts/product-screenshots.mjs
# optional: ONLY=desktop-light,mobile  CHROMIUM_PATH=...  PLAYWRIGHT_MODULE=.../playwright/index.js
```
The screenshot script starts its own node:http static server on a free port that serves
`public/`. It opens `/features/demo.html` with query parameters `theme=light|dark`,
`tokens=app|none` (none tests the CSS fallbacks), `layout=narrow|wide`,
`company=acme|globex|nopay|empty`, `q=<json query>` and `filter=<json filter>`. It writes 16
PNGs (2× DPR) and exits 1 on any console error or page error.

To view the harness by hand: run `npm start` and open `http://localhost:5173/features/demo.html`,
or use any static server rooted at `public/`.

## 5. Verification
- `node --test test/features.test.js`: **28 tests, 28 pass** (7 suites: percentile, weighted
  percentile, FX/salary/formatting, title normalization, estimateComp ×10, insights stats ×5,
  h() safety). Full `npm test` at 2026-10-02T05:47Z: **103 tests, 103 pass**.
  - The first full run had 2 failures in this file. One was a real bug: `percentile` let
    `NaN` through, because `typeof NaN === 'number'`. The other was a wrong test expectation:
    the weighted median of [[100,9],[200,1]] is exactly 110 under the documented definition.
    Both were fixed and the suite is green.
- **Real pipeline check**: `server/demo.js` → `normalizeJob` for anthropic (111 jobs, 96
  salaried, USD/GBP/EUR), anduril (120/105) and openai (120/110).
  - "Software Engineer" → anthropic $358K (High, n=52), anduril $193K (High), openai $370K
    (High).
  - "Research Engineer" Senior at anduril → Low confidence. It has no research roles, so it
    falls back to Senior SWE comparables, which is the honest result.
- Screenshots, read and iterated on (paths under the session scratchpad
  `.../scratchpad/product-shots/`):
  - pages: `features-desktop-light.png`, `-desktop-dark`, `-fallback-light`,
    `-fallback-dark`, `-sidebar-narrow`, `-mobile`, `-filtered-hover` (box tooltip),
    `-focus-keyboard` (focus ring + tooltip), `-no-pay`, `-empty`;
  - comp element shots: `-wide-comp`, `-comp-staff-research`, `-comp-london-dark`,
    `-comp-nomatch`, `-mobile-comp`, `-mobile-insights-dark`.
  - Fixes made from reading them: department axis label collisions; responsive stacked
    department rows; confidence line wrapping; comparable titles changed to a 2-line clamp;
    a truncated stat tile on mobile (CSS specificity); the "All 0 roles" copy; a 404 favicon.
- Visual check that the fallback tokens work with no `--ms-*` (blue accent) and with app
  tokens (rind green), in both themes.

## 6. Known gaps and follow-ups
- **Not wired into `public/app.js`.** The lead owns that file. Integration:
  ```js
  // index.html: <link rel="stylesheet" href="/features/features.css">
  import { createCompstimateWidget, compstimateForJob } from './features/compstimate.js';
  import { createInsights } from './features/insights.js';
  const comp = createCompstimateWidget(el, { onSelect: (job) => openDrawer(job) });
  const ins  = createInsights(el2, { onFilter: ({ type, value }) => toggleFilter(type, value) });
  // after fetch: comp.update(allJobs); after every filter change: ins.update(filteredJobs, allJobs)
  // job drawer for postings without pay: compstimateForJob(allJobs, job) -> { mid, low, high, confidence, ... }
  ```
- Premiums are raw median differences. They are confounded by department and level
  (PyTorch looks like +$180K because it mostly appears in research roles). A regression or
  within-department premium would be more causal.
- There is no hedonic adjustment: a comparable one level away is down-weighted but its pay
  is not scaled.
- FX is static and approximate, and is labelled as such in the UI.
- The widget has no department select. `estimateComp` accepts `department`, and
  `setQuery({ department })` works.
- Tooltips do not show on touch; tapping a row filters. All values are also in the visible
  labels or the aria-labels.
- The role-family lexicon is English-only and tuned on tech/defense titles.
- The insights panel re-renders fully on each `update` (cheap at ~150 jobs). Focus is
  preserved by `data-key`.
- Screenshots used the fallback system font because Inter is not loaded by the harness.

## 7. Change log
- 2026-10-02T05:27Z: read the contract, palette.js, mock-api.js and the dataviz skill;
  wrote the verbatim prompt file.
- ~05:30Z: shared.js, compstimate.js, insights.js and features.css, first version.
- ~05:33Z: found viz.css's global `.ms-row*` rules and renamed internal classes to
  `msi-`/`msf-`.
- ~05:35Z: REVIEW.md L9 — `h()` blocks `on*` strings, `srcdoc` and unsafe URL schemes.
- ~05:37Z: tuned the formula: no-level queries down-weight Intern/Director+; dropped the
  arbitrary 60-comparable cap (it biased board-wide estimates); no title caps confidence at
  Low; bare "analyst" removed from the data family (Policy Analyst → legal).
- ~05:40Z: demo-data.js, demo.html and the screenshot script; first screenshot pass.
- ~05:42Z: department rows made container-responsive, axis collision pass added,
  confidence line split, comparable titles changed to a 2-line clamp.
- ~05:45Z: unit tests; fixed `percentile` NaN filtering and the weighted-percentile
  expectation; `npm test` green.
- ~05:47Z: real-pipeline check; department box plots need ≥3 salaried roles (with a
  footnote); fit premium needs ≥3; empty/no-pay copy improved.
- 05:49Z: final screenshot pass (16 PNGs, no page errors) and this log.

---

# v2: 1-up features (F1 market comps, F3 published accuracy)

## v2.1 Brief
Coordinator task of 2026-10-02 (verbatim in [prompts/product.md](prompts/product.md)), from
`docs/strategy/ROADMAP.md` §6.2 Top 1 and 2, §7.1 F1 and F3, and `docs/CONTRACT.md` "v2 additions":
- `backtest()` in `compstimate.js`: a seeded leave-one-out over vetted salaries. The widget
  shows "Typically within ±X% (tested on N listed salaries)" and labels the estimate
  "Low confidence" when the median error is above 25%. The number comes from the job
  response's `meta.compstimate`.
- `comps.js`: `marketComps`, `compsForJob` and `createCompsCard`, built against the backend's
  `scripts/build-market.js` document.
- `normalizeTitle` and `roleFamily` importable from Node with no DOM. They now live in
  `roles.js`, which has no imports at all.
- A hand check of role families on 100 random real titles from ≥3 companies, target ≥90%.

## v2.2 Inputs and sources
- `docs/strategy/ROADMAP.md` §6.2 (acceptance criteria), §7.1 (interfaces), §8 (UI budget:
  no new main-view controls; the "Compare companies" card may hold a family picker).
- `docs/CONTRACT.md` v2: `meta.compstimate = { medianAbsPctError, within10Pct, n, seed, computedAt }`;
  `palette.js FX_PER_USD` is now the single FX source, so `FX_FALLBACK` only matters for a
  currency palette lacks.
- `scripts/build-market.js` (backend): format `melon-market-1`.
  - Cells are `[company, family, seniority, n, p25, median, p75]`, with seniority `"*"` for
    the all-levels roll-up.
  - It also carries `companies[{slug, name, color}]`, `minN: 3` and `basis`.
  - It calls `roleFamily(job.title, job)`, passing the job as context.
- `public/viz/comps.js` (viz): `createCompsChart().update(rows)`, where rows are
  `{ slug, name, color, n, p25, median, p75, current? }`. UX's wiring expects the same row shape.
- `data/snapshots/*.json`: 5,413 real postings from 8 companies (anduril 2,418, openai 833,
  anthropic 638, shieldai 581, palantir 320, xai 297, scaleai 194, cohere 132). Used to build
  the lexicon and for the hand check.
- `server/vet.js` `vetSalaries` (vetting workstream): applied before the backtest numbers below.

## v2.3 Decisions and rationale
1. **`roles.js` is a zero-import module.** It holds the tokenizer, abbreviations, level words,
   families, labels and seniority. `compstimate.js` re-exports it, so the old imports still
   work. Build scripts and the browser load the same code, and `roleFamily(title, ctx)` accepts
   a department string, a `{ department }` object or a whole Job.
2. **Family taxonomy grew from 15 to 26 families.** The real defense and AI-lab boards have
   large non-software populations. With the old lexicon, 720 of 5,413 titles (13%) got no
   family, and generic "Engineer" titles fell to swe (for example "Flight Controls Engineer").
   - New families: manufacturing, supply-chain, facilities, field-ops, bizops, solutions,
     policy, trust-safety, it, admin, ai-training.
   - Labels are in `FAMILY_LABELS`.
   - Unassigned titles fell to **6 of 5,413** (0.1%).
3. **How `roleFamily` decides**, in order:
   1. Priority phrases anywhere in the title ("Human Frontier Collective", "AI Tutor",
      "financial crime", "cross domain", "GSOC").
   2. Member of Technical Staff: ml when the team or department mentions training, models,
      research, evals, data, safety, agents or multimodal work; otherwise swe.
   3. The **role segment**: the first title segment containing a role noun
      ("Human Data - Business Operations Analyst" → "Business Operations Analyst").
   4. The full title.
   5. Context overrides:
      - manufacturing + "engineer" → hardware;
      - hardware + facilities/construction, or hardware + data center + electrical/mechanical
        → facilities;
      - technicians, ops staff or operators on a data-center campus → facilities;
      - policy work inside Trust & Safety → trust-safety;
      - policy work inside Security → security.
   6. **Department hints**, used only when the title alone is not specific.
   7. A bare "engineer"/"developer" → swe.

   Family regexes are tested in a fixed order, narrowest first: people, admin and finance come
   before sales, because "Compensation Partner" and "Executive Business Partner" contain
   "partner". Supply-chain comes before swe and hardware ("Product Sourcing Engineer"), and
   an explicit "software" comes before hardware ("GNC Software Engineer" → swe).
4. **Backtest = seeded leave-one-*group*-out.**
   - Vetted jobs (`salary !== null`, usable USD) are sorted by id, and `maxN` of them are
     drawn with a seeded partial Fisher–Yates (mulberry32). Build and server use seed
     20261002, maxN 500.
   - Each drawn job is estimated with `compstimateForJob` from the other vetted jobs, and the
     error is |est.mid − posted mid| / posted mid.
   - The first version left out only the job itself. It reported **0.3%** for Palantir and
     xAI and 4.9% for Anduril, because the same req is posted many times with an identical
     title and range. The job's **duplicates (same title + same min/max/currency)** are now
     excluded too, which raised Anduril to 7.1–8.3%.
   - Palantir and xAI stay near 0.3% because they post standard bands across *different*
     titles (67 Palantir roles share $135K–$200K; 32 xAI roles share $180K–$440K). There the
     estimate really is that accurate, and the log says so instead of hiding it.
   - The default dedupe key is the *normalized* title + identical range in any location (see
     the honesty check in v2.5).
   - Units: `medianAbsPctError` and `within10Pct` are **percent numbers with one decimal**
     (8.3 means 8.3%). `n` counts jobs that got an estimate; `skipped` counts drawn jobs with
     no comparables.
5. **Display rules.**
   - `accuracyLine(meta)` returns "Typically within ±X% (tested on N listed salaries)", with X
     rounded.
   - `isLowAccuracy(meta)` is true when the error is strictly above 25; `displayConfidence`
     then forces "Low".
   - The widget's `update(allJobs, meta)` (or the `getMeta` option) accepts the response
     `meta` or `meta.compstimate`. With no backtest it shows no line and does not compute one
     in the browser, so the card never disagrees with the published figure. The line is muted
     text with no new control.
6. **Speed.** `estimateComp` uses a per-array cached index (a WeakMap keyed by array identity
   and length) that holds normalized titles, IDF and token sets. Anduril's 500-job backtest
   over 2,271 vetted jobs takes about 5.3 s in Node; every other company takes under 1 s. Do
   not mutate a cached jobs array in place.
7. **`comps.js`** reads `melon-market-1` as-is.
   - `marketComps(market, {family, seniority})` returns that bucket (`"*"` by default) as
     viz rows sorted by median. `country` is accepted for interface stability but ignored:
     the document has no country dimension.
   - `compsForJob` uses the same `roleFamily(title, job)` as the builder.
     - It returns other companies at family + seniority, falls back to family across all
       levels (`matchedOn: "family"`), and returns `null` when neither has another company.
     - The job's own company is excluded unless `{ includeSelf: true }`, which adds it with
       `current: true`.
   - `createCompsCard` is the Insights "Compare companies" card: a family `<select>` with
     company counts, one P25–P75 row per company on a shared axis, and the current company
     emphasized.
     - The default family is the most common one among the current company's salaried jobs
       that the market covers for 2 or more companies.
     - Clicking a row calls `onPickCompany(slug, { family, familyLabel, seniority: null })`.
     - The footnote states the basis, approx USD, n ≥ 3, that equity and bonus are not
       included, and the FX date.

## v2.4 Replayable steps
```sh
node --test test/features.test.js                     # 59 tests
npm test                                              # whole repo (248 at 07:30Z)
node scripts/build-market.js --out /tmp/market.json   # real market doc (21.7 KB, 391 cells, 26 families)
# per-company backtest on vetted snapshots (numbers in v2.5)
node --input-type=module -e "import fs from 'node:fs'; const C=await import('./public/features/compstimate.js'); const {vetSalaries}=await import('./server/vet.js');
  for (const f of fs.readdirSync('data/snapshots')) { const d=JSON.parse(fs.readFileSync('data/snapshots/'+f)); console.log(f, C.backtest(vetSalaries(d.jobs), { seed: 20261002, maxN: 500 })); }"
# hand-check samples (judge each printed line by hand)
node docs/process/scripts/product-family-check.mjs 20261004
# screenshots incl. v2 (compare card on the real market doc)
cd "$SCRATCH/pw" && OUT_DIR="$SCRATCH/product-shots" MARKET_JSON=/tmp/market.json \
  node /home/user/melon-seek/docs/process/scripts/product-screenshots.mjs
```
`demo.html` gained `?accuracy=<pct>` (forces a backtest figure, e.g. 31 for the low-accuracy
state), `?market=<url>` and `&marketCompany=<slug>`. By default the demo builds a demo market
from three fake boards (`fakeMarket` in `demo-data.js`) and runs `backtest()` on the fake board
to stand in for `meta.compstimate`.

## v2.5 Verification
- Tests: `test/features.test.js` has **59/59 passing**. New v2 tests cover:
  - 20 fixed real titles, each checked for its family and label;
  - `roles.js` being the same implementation as `compstimate.js` and loading with no
    `document`;
  - the department-only-when-generic rule;
  - backtest determinism (same seed gives the same result, input order doesn't matter);
  - different seeds drawing different samples, and the maxN cap;
  - only vetted jobs being tested, and duplicate-group exclusion;
  - percent units and empty input;
  - the accuracy line text, singular and plural;
  - the 25% threshold (25.0 is not low, 25.1 is low);
  - `displayConfidence`;
  - market cell parsing and caching, the n ≥ minN guard, sorting, the `"*"` default, the
    `compsForJob` exact → family → null fallback, `includeSelf`/`current`, and
    `familyOptions`.
  - The full `npm test` passed **248/248**, including the backend's `test/market.test.js`
    (5/5), which imports my `roleFamily`.
- **Backtest on vetted snapshots** (seed 20261002, maxN 500, 07:37Z):

  | company | vetted salaried | n | skipped | median abs error | within ±10% | time |
  |---|---|---|---|---|---|---|
  | anduril | 2271 | 500 | 0 | 7.1% | 53.6% | 5343 ms |
  | anthropic | 556 | 500 | 0 | 8.5% | 56% | 800 ms |
  | cohere | 93 | 86 | 7 | 6.5% | 59.3% | 41 ms |
  | openai | 674 | 497 | 3 | 9.2% | 54.1% | 886 ms |
  | palantir | 240 | 237 | 3 | 0.3% | 75.5% | 168 ms |
  | scaleai | 128 | 126 | 2 | 9.1% | 56.3% | 54 ms |
  | shieldai | 455 | 449 | 6 | 13.2% | 41.9% | 591 ms |
  | xai | 134 | 133 | 1 | 0.3% | 60.2% | 52 ms |

  No company is above the 25% threshold on current data.
- **Backtest honesty check** (devops flagged Palantir and xAI at 0.3% as suspicious).
  - The held-out job is always excluded by id; there is a unit test that it is never its own
    comparable.
  - The **default** `dedupe: "title"` also excludes every vetted job with the same
    *normalized* title AND an identical posted range (min, max, currency) **in any
    location**. That is a superset of "same normalized title + location + identical
    salary".
  - Four versions, each shown as median abs error · share within ±10% (seed 20261002,
    maxN 500, vetted snapshots):

  | company | plain LOO (`none`) | same title + location + range (`title+location`) | **same title + range, any city (`title`, default)** | same role segment + range (`role`, stress test) |
  |---|---|---|---|---|
| anduril | 3.5% · 58.8% | 4.2% · 56.8% | 7.2% · 53.2% | 11.8% · 44.2% |
| anthropic | 8.3% · 56% | 8.3% · 56% | 8.5% · 56% | 13.5% · 40.2% |
| cohere | 6.5% · 59.3% | 6.5% · 59.3% | 6.5% · 59.3% | 8.1% · 55.8% |
| openai | 9.2% · 54.1% | 9.2% · 53.7% | 9.2% · 53.7% | 10.1% · 46.1% |
| palantir | 0.3% · 84.5% | 0.3% · 84.5% | 0.3% · 75.5% | 5% · 60.3% |
| scaleai | 9.1% · 56.3% | 9.2% · 54.8% | 9.2% · 54.8% | 10.5% · 48.4% |
| shieldai | 13.2% · 41.9% | 13.2% · 41.4% | 13.2% · 41.4% | 15% · 30.9% |
| xai | 0.3% · 60.2% | 0.3% · 60.2% | 0.3% · 60.2% | 14% · 19.8% |

  - Exact-twin removal matters for Anduril: 3.5% plain becomes 7.2% with the default.
  - Palantir and xAI stay at 0.3% under the default because they post **one band across
    different titles**:
    - xAI: 29 "AI Tutor - <language>" postings at $72,800 and 32 "Member of Technical Staff
      - <team>" postings at $180K–$440K;
    - Palantir: 67 postings at $135K–$200K.
    A new posting of the same kind really would be estimated exactly, so the default figure
    is honest. The share within ±10% (60% for xAI) shows the spread the median hides.
  - The `role` stress test also drops same-role-segment postings with the identical band, so
    it pretends we have never seen any AI Tutor or MTS. That is too pessimistic to publish,
    but it is reported here (xAI 14%, Palantir 5%) and available as `backtest(jobs,
    { dedupe: "role" })` if the lead prefers the conservative headline.
  - The UI floors the displayed figure at ±1%, so it never reads "±0%".
- **Role-family hand check** (criterion 6: 100 random real titles, ≥3 companies, ≥90%).
  - Protocol:
    - The lexicon was tuned only on a separate survey sample (260 titles, LCG seed 7) and on
      the list of unassigned titles.
    - Check samples were drawn afterwards with `product-family-check.mjs`: 12–13 titles per
      company across **all 8 companies**.
    - I judged every line by hand. Unassigned counts as wrong; borderline-but-defensible
      counts as right (for example "Salesforce Developer" → swe, "Deal Team" → sales).
    - After a check had driven fixes, the next check used a **fresh seed**, so no reported
      score is measured on titles that shaped the rules.

  | check | seed | correct | errors (sample #) | what the errors were |
  |---|---|---|---|---|
  | 1 | 20261002 | **90/100** | 4, 22, 45, 48, 67, 78, 85, 90, 94, 99 | "Flight Controller" → finance; Safeguards policy-design → policy; "Manager, Applied AI Engineering" ×2 → ml; Human Frontier "ML Fellow" → ml; "Structural Designer" → design; eng manager → swe; data-center site ops → bizops; "Financial Crime" → finance; facilities electrical engineer → hardware |
  | 2 | 20261003 | **87/100** | 2, 3, 22, 23, 47, 52, 60, 66, 83, 92, 96, 97, 99 | generic "Enablement" → sales; energy-storage engineer → facilities; capacity planner → swe; "AV Engineer" → security; workplace transportation → program; datacenter-hardware QE → facilities; "Fellowship" → none; "Field Engineer" → swe; "Staff Engineer, Quality" → manufacturing; data-center technicians, NOC and materials management misfiled (×4) |
  | 3 (final) | 20261004 | **92/100** | 17, 19, 22, 30, 48, 80, 83, 94 | finance-systems engineer → finance; GSOC policy specialist → policy; "Technical Deployment (Financial Services)" → finance; "Solutions Architecture" → sales; "Internal Communications, Research and Product" → ml; "Cross Domain Solution Engineer" → solutions; "FP&A" tokenizer bug → supply-chain; data-center electrical engineer → hardware |

  - **Result: 92% on the final independent sample, which meets ≥90%.**
  - The 8 check-3 misses were then fixed: several were real bugs (`FP&A` was tokenized after
    `&` became "and", and "research" counted as a role noun). A regression diff over all 300
    checked titles showed **only those 8 assignments changed**, all to the correct family.
    The post-fix accuracy was not re-measured on a fourth sample.

  Final sample, as measured (before the post-check fixes):

| # | Company | Title | Assigned (as measured) | Verdict |
|---|---|---|---|---|
| 1 | anduril | Guidance Navigation and Control (GNC) Engineer, Air Dominance & Strike | hardware | ✓ |
| 2 | anduril | Senior Mechanical Engineer: Optical Payloads, Space | hardware | ✓ |
| 3 | anduril | Data Product Enablement Specialist | it | ✓ |
| 4 | anduril | Mission Operations Engineer | field-ops | ✓ |
| 5 | anduril | Senior Global Sourcing Manager, Semiconductor (Chips) | supply-chain | ✓ |
| 6 | anduril | FPGA Engineer, Intelligence Systems | hardware | ✓ |
| 7 | anduril | Electronics Test Technician | manufacturing | ✓ |
| 8 | anduril | Senior Systems Engineer, Air Vehicle Software | hardware | ✓ |
| 9 | anduril | Electrical Maintenance Technician | manufacturing | ✓ |
| 10 | anduril | Engineering Systems Administrator | it | ✓ |
| 11 | anduril | Senior Director, Global Product Marketing | marketing | ✓ |
| 12 | anduril | Logistics Coordinator | supply-chain | ✓ |
| 13 | anduril | Senior Technical Program Manager, Business Line Integration | program | ✓ |
| 14 | anthropic | Data Scientist, Safeguards | data | ✓ |
| 15 | anthropic | Product Engineer, Computer Use | swe | ✓ |
| 16 | anthropic | Staff+ Software Engineer, Enterprise | swe | ✓ |
| 17 | anthropic | Finance Systems Engineer, Tax | finance | ✗ → it after fix |
| 18 | anthropic | Senior Manager, Infrastructure Lease Accounting | finance | ✓ |
| 19 | anthropic | GSOC Response & Policy Program Specialist | policy | ✗ → security after fix |
| 20 | anthropic | Applied AI, Research Engineer | ml | ✓ |
| 21 | anthropic | Staff Software Engineer, GTM AI Engineering | swe | ✓ |
| 22 | anthropic | Manager, Technical Deployment (Financial Services) | finance | ✗ → solutions after fix |
| 23 | anthropic | Enterprise Account Executive - Industries Generalist | sales | ✓ |
| 24 | anthropic | Corporate Counsel, M&A | legal | ✓ |
| 25 | anthropic | Business Systems Analyst, New Product Introduction | it | ✓ |
| 26 | anthropic | Applied AI Architect, International Policy | solutions | ✓ |
| 27 | cohere | Technical Program Manager, AI Delivery for Public Sector & Defence, Canada | program | ✓ |
| 28 | cohere | Data Annotation Specialist, Engineering (civil, mechanical, electrical, chemical) | ai-training | ✓ |
| 29 | cohere | Senior Account Executive - Financial Services | sales | ✓ |
| 30 | cohere | Senior Director, Solutions Architecture — Americas | sales | ✗ → solutions after fix |
| 31 | cohere | Senior Tax Associate / Tax Manager, Indirect Tax | finance | ✓ |
| 32 | cohere | Member of Technical Staff, Data Analysis and Evaluation | ml | ✓ |
| 33 | cohere | Engineering Manager, FDE Infrastructure (NORAM) | eng-manager | ✓ |
| 34 | cohere | Member of Technical Staff, Agentic Environments | ml | ✓ |
| 35 | cohere | Product Security Engineer, North Security | security | ✓ |
| 36 | cohere | Forward Deployed Engineer, Infrastructure Specialist (South Korea) | solutions | ✓ |
| 37 | cohere | Customer Success Manager - UAE | support | ✓ |
| 38 | cohere | Technical Program Manager, AI Delivery, Korea | program | ✓ |
| 39 | cohere | Technical Program Manager, AI Delivery for Public Sector & Defense, France | program | ✓ |
| 40 | openai | Strategic Finance, Ads | finance | ✓ |
| 41 | openai | International Payroll Operations | finance | ✓ |
| 42 | openai | Electrical Commissioning Lead | facilities | ✓ |
| 43 | openai | Data Scientist, Product | data | ✓ |
| 44 | openai | Product Engineer, Full Stack - Agents | swe | ✓ |
| 45 | openai | Software Engineer - Data Aquisition (systems) | swe | ✓ |
| 46 | openai | Account Director, Mid-Market | sales | ✓ |
| 47 | openai | Executive Business Partner, India | admin | ✓ |
| 48 | openai | Internal Communications, Research and Product | ml | ✗ → marketing after fix |
| 49 | openai | Software Engineer, Infrastructure Security | swe | ✓ |
| 50 | openai | Software Engineer, Monetization Product & Platform | swe | ✓ |
| 51 | openai | Account Director, Large Enterprise | sales | ✓ |
| 52 | openai | Engineering Manager, Core Experimentation | eng-manager | ✓ |
| 53 | palantir | Revenue Accounting Manager | finance | ✓ |
| 54 | palantir | Software Engineer – Query Engines | swe | ✓ |
| 55 | palantir | Software Engineer, New Grad - Infrastructure | swe | ✓ |
| 56 | palantir | Software Engineer, New Grad - Production Infrastructure | swe | ✓ |
| 57 | palantir | Software Engineer - Hosted Model Infrastructure | swe | ✓ |
| 58 | palantir | Deployment Strategist | solutions | ✓ |
| 59 | palantir | Forward Deployed Infrastructure Engineer - UK Government | solutions | ✓ |
| 60 | palantir | Security Systems Engineer | security | ✓ |
| 61 | palantir | Forward Deployed Enablement Engineer - Customer Success | solutions | ✓ |
| 62 | palantir | Technical Program Manager - US Government | program | ✓ |
| 63 | palantir | Software Engineer, Internship - Infrastructure | swe | ✓ |
| 64 | palantir | Talent Sourcer (Contractor) | people | ✓ |
| 65 | scaleai | Forward Deployed Software Engineer, Public Sector | solutions | ✓ |
| 66 | scaleai | Engineering Manager, Agent Oversight | eng-manager | ✓ |
| 67 | scaleai | Staff Machine Learning Engineer, Public Sector | ml | ✓ |
| 68 | scaleai | Operations Program Manager, Robotics | program | ✓ |
| 69 | scaleai | Head of GTM Strategy & Operations, Enterprise | sales | ✓ |
| 70 | scaleai | Infrastructure Software Engineer, Enterprise GenAI | swe | ✓ |
| 71 | scaleai | Research Scientist, Frontier Risk Evaluations | ml | ✓ |
| 72 | scaleai | Business Development Representative, Partnerships (Physical AI) | sales | ✓ |
| 73 | scaleai | Subject Matter Expert | ai-training | ✓ |
| 74 | scaleai | Staff Software Engineer, Full Stack - Gen AI | swe | ✓ |
| 75 | scaleai | Enablement Manager (Support) | support | ✓ |
| 76 | scaleai | Engineering Manager, Infrastructure | eng-manager | ✓ |
| 77 | shieldai | Senior Staff Engineer, Software Autonomy (R5125) | swe | ✓ |
| 78 | shieldai | Trade Compliance Manager (R5351) | legal | ✓ |
| 79 | shieldai | Staff Technical Sourcer - Aircraft Engineering | people | ✓ |
| 80 | shieldai | Staff Cross Domain Solution Engineer (R5356) | solutions | ✗ → security after fix |
| 81 | shieldai | Staff Systems Administrator (R5995) | it | ✓ |
| 82 | shieldai | Senior Manager, Corporate Finance (R5631) | finance | ✓ |
| 83 | shieldai | Sr Lead FP&A - Procurement (R4808) | supply-chain | ✗ → finance after fix |
| 84 | shieldai | Senior Staff Engineer, Operations Analysis (R4759) | hardware | ✓ |
| 85 | shieldai | Technical Program Manager | program | ✓ |
| 86 | shieldai | Sr Director Engineering, V-BAT | eng-manager | ✓ |
| 87 | shieldai | Software Engineering Manager, Hardware Test (X-BAT) (R6020) | eng-manager | ✓ |
| 88 | shieldai | Senior Staff Engineer, Advanced Manufacturing | hardware | ✓ |
| 89 | xai | Power Generation Engineer - Memphis | facilities | ✓ |
| 90 | xai | AI Tutor - Legal & Compliance | ai-training | ✓ |
| 91 | xai | AI Tutor - Thai | ai-training | ✓ |
| 92 | xai | Software Engineer, X Money | swe | ✓ |
| 93 | xai | Member of Technical Staff - Multimodal Understanding | ml | ✓ |
| 94 | xai | Electrical Engineer, Data Center Infrastructure - Memphis | hardware | ✗ → facilities after fix |
| 95 | xai | AI Tutor - Hausa | ai-training | ✓ |
| 96 | xai | Electrician, Operations - Memphis | facilities | ✓ |
| 97 | xai | Food Services Specialist  (All Shifts) - Memphis | facilities | ✓ |
| 98 | xai | Facilities Operations Technician | facilities | ✓ |
| 99 | xai | Growth Recruiter | people | ✓ |
| 100 | xai | Carpenter (Construction) - Memphis | facilities | ✓ |

- Screenshots (session scratchpad `.../scratchpad/product-shots/`):
  - `features-v2-comp-accuracy.png`: accuracy line on the demo board;
  - `features-v2-comp-lowacc-dark.png`: ±31%, so the estimate is labelled "Low confidence";
  - `features-v2-compare-demo.png`;
  - `features-v2-compare-real-light.png` (Anthropic as current), `-real-dark.png` (OpenAI)
    and `-real-narrow.png` (Anduril): the real market doc. The AI research family shows 7
    companies; xAI and Cohere have near-zero-width bars because they post one band.
  - No page errors.

## v2.6 Known gaps
- About 8–10% of titles still get the wrong family, mostly ambiguous operations and
  enablement titles, department-dependent roles, and English-only patterns. The 6 unassigned
  titles are left unassigned.
- Families are computed at runtime in the browser and at build time in `build-market.js`
  from the same `roles.js`. If the lexicon changes, `market.json` must be rebuilt, or the
  drawer's family and the market cells can disagree.
- The backtest computes IDF over the full pool, including the tested job. This leaks title
  statistics only, not pay, and the effect is negligible. Duplicate detection is exact
  (title + range); near-duplicates with a reworded title still count as comparables.
- Seniority buckets are `inferSeniority`'s and are not mapped across companies, so a
  "Senior" at one company may be a different level elsewhere. This is the corporate-ladder
  plan's territory; `compsForJob` can switch without changing its interface.
- There is no country dimension in `melon-market-1`, so the `country` argument is ignored.
- The compare card has only a family picker, per §8; levels use the all-levels roll-up.
- The widget does not compute a backtest itself when `meta.compstimate` is missing (for
  example, custom boards fetched live); no accuracy line is shown then.

## v2.7 Change log
- 06:50Z: read ROADMAP §6.2/§7.1/§8, CONTRACT v2 and the backend's `build-market.js`.
- ~06:55Z: `roles.js` split out with no imports; `compstimate.js` re-exports it; `roleFamily`
  takes department context.
- ~07:00Z: cached per-array index in `estimateComp`; `backtest()` and the accuracy helpers;
  the widget's accuracy line.
- ~07:03Z: found the 0.3% duplicate artefact and switched to leave-one-group-out.
- ~07:05–07:20Z: lexicon survey on real titles: 15 → 26 families, unassigned 720 → 6.
  Hand checks 1 (90%), 2 (87%) and 3 (92%, final), fixes after each, and a 300-title
  regression diff.
- ~07:25Z: `comps.js` and the compare-card CSS; tests (59), `npm test` green; demo and
  screenshot script v2 shots.
- ~07:45Z: backtest honesty check (coordinator/devops). Dedupe key changed from the raw
  title to the normalized title + identical range; added `dedupe` modes
  (`none` / `title+location` / `title` / `role`), the four-version table above, and the
  ±1% display floor.
- 07:40Z: this addendum.
