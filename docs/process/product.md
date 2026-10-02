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
- `public/features/compstimate.js`: `estimateComp`, `compstimateForJob`, title normalization, the widget
- `public/features/insights.js`: stats helpers and `createInsights`
- `public/features/features.css`: all styles, scoped under `.ms-comp` and `.ms-insights`
- `public/features/demo-data.js`: deterministic FAKE jobs (every company is named "… (demo)")
- `public/features/demo.html`: the harness page
- `test/features.test.js`
- `docs/process/product.md`, `docs/process/prompts/product.md`, `docs/process/scripts/product-screenshots.mjs`

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
