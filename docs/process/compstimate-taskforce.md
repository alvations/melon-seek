# Process log: Compstimate task force (investigation, spec, test matrix)

## 1. Brief

Prompt: [prompts/compstimate-taskforce.md](prompts/compstimate-taskforce.md).

The user reported that Compstimate "looks incoherent when the user clicks and
selects the filters". This document records what is incoherent and why, then
defines the correct behaviour (§3.2) and the Playwright scenarios QA automates
(§3.3). Product fixes the code to this spec (`public/features/compstimate.js`
and the Compstimate parts of `public/app.js`). QA writes the tests.

This workstream owns only this file and the prompt file. No product code was
changed and nothing was committed.

## 2. Inputs and sources

- `public/features/compstimate.js`: `estimateComp`, `compstimateForJob`,
  `queryFromState`, `titleSuggestions`, `createCompstimateWidget` (`update`,
  `setQuery`, `fillOptions`, `render`).
- `public/app.js`: state and hash (`S`, `set`, `onHashChange`), `failures` and
  `derive` (the board filters), `renderInsights`, `openDrawer`/`closeDrawer`,
  `compstimateBlock`, `pickCompany` ("Same role elsewhere"), and the search
  debounce.
- `public/features/shared.js` (`salaryUSD`, `toUSD`, `FX_FALLBACK`,
  `locationKey`) and `public/viz/palette.js` (`toUSD`, `FX_PER_USD`).
- `server/index.js` `compstimateMeta`: the backtest runs in a worker and the
  request waits `BACKTEST_WAIT_MS` = 400 ms.
- `docs/QA.md` UX-9 (the original prefill request), `docs/process/product.md`
  wave 2 (the UX-9 implementation), `docs/process/lead.md` (the task-force
  entry), and `docs/strategy/ROADMAP.md` §8 (UI budget: no new main-view
  controls, Insights cards fixed).
- Git history. Commit `1505f25` (2026-10-02 13:45, "Chart windowing …")
  removed the UX-9 prefill wiring from `app.js` while this investigation was
  running. See I1.
- Data: `data/snapshots/*.json`, served by the real server. Anthropic has 638
  jobs: 558 with pay (498 USD, 46 GBP, 13 EUR, 1 CAD) and 82 without. Cohere
  has 48 CAD bands. xAI and Palantir copy one band across many titles.

## 3. Decisions and rationale

### 3.1 Findings: what is incoherent, and why

Two builds were tested against the same server and data:

- **HEAD** is `f0e78f8`, the current tree. It contains `1505f25`.
- **PRE** is `app.js` from `e2e6fd5`, the commit just before the prefill
  wiring was removed. Playwright served it in place of `/app.js`; the other
  files are identical.

The user has probably seen both builds. The step numbers below refer to the
logs in §4.

| # | Symptom (evidence) | Root cause |
|---|---|---|
| **I1** | **HEAD: the widget ignores every filter.** Department, location, seniority, remote, chips, search, drawer and "Same role elsewhere" all leave its fields and output unchanged. It re-renders 0 times per change (HEAD steps 02–30). For example, Department = Sales lists 122 roles but still estimates "Staff+ Software Engineer" at $445K. | `1505f25` deleted the `queryFromState`/`setQuery` block from `renderInsights`. It was `e2e6fd5` `app.js:1434-1438`, and the import at `app.js:10`. Now `app.js:1433` calls only `comp.update(data.jobs, …)`, and only when `dataSeq` changes, i.e. on a company switch. This is an unflagged regression of UX-9. |
| **I2** | **HEAD: stale fields carry across companies.** After the user types "Research Engineer" and picks London on Anthropic, switching to OpenAI, Cohere and xAI keeps "Research Engineer · London" (HEAD 31–33). Nothing marks these fields as user-set, and there is no way back to the defaults except a reload. | `update()` replaces the title only while `autoTitle` (`compstimate.js:638-642`) and keeps `query.location` and `query.seniority`. `fillOptions` clears the location only when the new board lacks it (`compstimate.js:536`). The widget has no per-field "edited" state and no reset. |
| **I3** | **PRE: the widget fights the filters.** One filter change overwrites all three fields, including the user's edits. The user types "Research Engineer" and picks London. Unticking Seniority then resets them to "Software Engineer · Any" (PRE 16–19). Clearing the search resets the title to the auto title (PRE 20). | `setQuery` merges a whole query rebuilt from the filters (`compstimate.js:648-657`) whenever the `qsig` of `q`, `rf`, `s`, `l` or the drawer changes (`e2e6fd5 app.js:1434`). Only the title tracks whether it was edited (`autoTitle`, `compstimate.js:496, 524, 651`). Location and level don't. |
| **I4** | **Filters are applied partly and inconsistently.** Department (PRE 02–03), Remote (PRE 08), two seniorities (PRE 07), two locations, chips and employment type change nothing. One seniority or one location changes the estimate, but only as a soft weight over the whole board. The results list says 122 roles; the estimate still uses all 556 salaried roles. | `queryFromState` always sets `department: ''`, ignores `r`, and `one()` drops multi-selects (`compstimate.js:437-451`, `:438`). The widget is given `data.jobs`, not the filtered set (`app.js:1433`), and `estimateComp` applies no hard filter: everything is a multiplicative weight (`compstimate.js:196`). |
| **I5** | **The comparables don't match the filters.** With Level = Senior, all 5 comparables are Mid (PRE 16). With OpenAI, Senior and London, the top comparables read "San Francisco · Mid" (PRE C1). | The soft weights let off-level roles through: `senioritySim(Senior, Mid)` = 0.35 (`compstimate.js:47`), and the cut is only 12% of the best weight (`compstimate.js:161, 207`). `jobMeta` shows only the first location (`compstimate.js:471-476`), so a matching London location is hidden behind "+2". |
| **I6** | **The "Remote (US)" location filter becomes "Any location" in the widget** (HEAD and PRE 05). | The app's location key is `l.name` for remote locations (`app.js:276` `locKey` gives "Remote (US)"). The widget's options use `shared.locationKey`, which gives "Remote" (`shared.js:173-177`). `fillOptions` drops a value that isn't in its options (`compstimate.js:536`). |
| **I7** | **Search text is used verbatim as the role title.** "python" gives "No estimate yet"; "London" gives $407K from 4 roles at Low confidence (PRE 12–13). Typing "Product Manager" re-renders 14 times and flashes "No estimate yet" 6 times ("P", "Pr" …) (PRE A). | `queryFromState`: `title: text \|\| …` (`compstimate.js:446-448`). The search is committed every 120 ms (`app.js:2375`), and each commit calls `setQuery`. |
| **I8** | **The auto title carries a level that contradicts the Level field.** The default is "Staff+ Software Engineer" while Level shows "Any level", yet the text says "at Staff+ level" (HEAD and PRE 01). With Seniority = Senior it reads "“Staff+ Software Engineer” at Senior level", and the comparables are mostly Staff+ (PRE 06, 30). | `LEVEL_PREFIX` doesn't strip "Staff+" or "Senior+" (`compstimate.js:389`), so `titleSuggestions` and `defaultTitle` keep the level word. `estimateComp` infers the level from the title when the field is empty (`compstimate.js:180`). |
| **I9** | **Copy contradicts the behaviour.** The auto line says "Showing the most common role on this board … or filter the board", but filtering doesn't change it (`compstimate.js:554`). The subtitle "similar roles on this board" ignores the filters (`:515`). "Based on N comparable roles" (`:592`) and the drawer's "An estimate from N comparable roles at X" (`app.js:1933`; PRE said "Estimated pay from N similar roles") are two phrasings of the same thing. Level counts such as "Senior (64)" include roles without pay (`:542`). The "typical range on this board" scale always uses every job (`:577, :603`). | Copy written for a widget that ignores the filters, inside an app where everything else follows them. |
| **I10** | **The drawer and Insights disagree, and PRE goes stale.** HEAD: for "Account Director, Large Enterprise - Tokyo" the drawer says ≈ $242K (17 roles, Low) while Insights says $356K (C2). PRE: opening a job replaces the Insights query with the job's, even when Senior and London are set (title becomes the job's, Tokyo, Director+). After Esc the widget still shows the closed job (C3). It snaps back only on the next unrelated render, such as a Sort change (C4). Opening a salaried comparable makes Insights estimate that job including itself: $348K from n=7 for a role posted at $320K (D1). | `queryFromState` gives the open job priority (`compstimate.js:439-445`). `openDrawer` and `closeDrawer` don't schedule a render (`app.js:1717-1771`), so `renderInsights` re-evaluates later. The Insights query has no `excludeId`, while `compstimateForJob` excludes the job and also passes `department` (`compstimate.js:260-267`), which the widget never does. Even with the same title, level and location, the two differ (Anthropic AE - DNB: $400K/n=48 with department vs $386K/n=53 without). |
| **I11** | **The accuracy line is missing on a cold first visit and doesn't appear later.** On a fresh server, Anduril shows no "Typically within ±…" line even 8 s later. It shows ±12% only after switching away and back. Confidence also isn't capped meanwhile. The line does change correctly on company switches when the backtest is ready (HEAD 31–33). | The server answers `meta.compstimate: null` when the worker takes more than 400 ms (`server/index.js:291`, `compstimateMeta`). The client fetches once per load (`loadJobs`) and the widget reads only `data.meta` (`app.js:1433`). |
| **I12** | **PRE: double estimate on a company switch.** 2 result renders per switch (PRE 31–33, `renders: 2`), against 1 in HEAD. It isn't visible (same task), but the work is doubled and the first render combines the new board with the old query. | `update()` runs `run()` (`compstimate.js:644`), then `setQuery` runs `run()` again (`:656`). |

**Checked and coherent** (keep as regression tests):

- Salary min, max and "listed only" never change the estimate (HEAD and PRE
  10–11). The widget and drawer use all jobs, never `derived.filtered`.
- No FX mixing in today's data: the drawer and widget both use `salaryUSD`,
  and every snapshot currency is in the palette table. Converted bands carry
  "*" and the explanation counts them. One latent risk:
  - `palette.toUSD` returns an unknown currency's amount unchanged, so it is
    treated as USD (`palette.js:163`);
  - `shared.toUSD` instead falls back to `FX_FALLBACK`, whose rates differ
    (GBP 1.27 vs palette 1.348, `shared.js:15-19, 37`).
  A currency that only one table knows would therefore be filtered and
  ranked on different numbers than Compstimate uses.
- The accuracy line follows the company when the backtest is ready (it was
  not stale after a switch).

### 3.2 Behaviour spec

Keep it simple: no new main-view controls, one link at most (ROADMAP §8).
Product deletes `queryFromState`'s job branch and replaces the rest of it with
a pure helper. The suggested name is `compstimateInputs(state, edits, jobs) →
{ pool, query, basis, autoTitle }`, exported from `compstimate.js` and
unit-testable.

**Terms**

- *Board*: all jobs of the current company.
- *Salaried*: `salaryUSD(job)` is non-null, i.e. a known currency and positive
  pay. Unknown currencies are excluded (never treated as USD).
- *Role-defining filters*, grouped by the widget field that owns them:

  | Widget field | Owns filters |
  |---|---|
  | Title | Department `d`, Role family `rf` |
  | Location | Location `l`, Remote `r` |
  | Level | Seniority `s` |

- *Other filters*: search `q`, chips `kr`, `kf` and `ks`, employment type `e`,
  Listed `p` and `ho`, Juice `jg`, and the map or cluster area.
- *Salary filters* (`smin`, `smax`, `so`): **never read by Compstimate**.

**Rule 1: field state.** Each of the three fields is either *following* (the
default) or *edited*:

- Typing in Title, or choosing any option in Location or Level, marks that
  field edited. Choosing "Any" counts as an edit.
- Emptying the Title text returns Title to following.
- An edited field keeps its value through every filter change, search, chip,
  drawer open or close, Back/Forward, Clear all and company switch.
- Edits are widget state. They are not in the URL hash.

**Rule 2: one reset link.** When at least one field is edited, show a single
"Reset to filters" link under the form. It returns all three fields to
following. When nothing is edited, it is hidden.

**Rule 3: pool.** The pool is the salaried board jobs that pass the
role-defining filters of every *following* field, with the same matching as
`failures()` in `app.js`:

- An edited field's filters are ignored; the edited value replaces them.
- Other filters and salary filters never narrow the pool.

**Rule 4: query** (passed to `estimateComp` over the pool, `department: ''`).

- **Title**:
  - Edited: the typed text.
  - Following: the auto title, i.e. the most common role among the salaried
    board jobs that pass all filters except salary. If none, the most common
    role in the pool.
  - The auto title never contains a level word: `LEVEL_PREFIX` must also strip
    "Staff+" and "Senior+". It is never the raw search text.
- **Location**:
  - Edited: the chosen value.
  - Following: the single `l` value when exactly one is selected; "Remote"
    when `r` = remote and `l` is empty; otherwise "".
  - Option values use the app's location keys (`app.js` `locKey`, so "Remote
    (US)" stays "Remote (US)"). A value missing from the board stays selected
    with "(0)".
- **Level**:
  - Edited: the chosen value.
  - Following: the single `s` value when exactly one is selected and it isn't
    "Unspecified"; otherwise "".
- **Showing a following field with several or no filter values.** The
  select's empty option reads:
  - "Any location" or "Any level" when no filter is set;
  - "London or Seattle (filters)", "Remote (filters)", "On-site (filters)" or
    "Senior or Staff+ (filters)" when the pool is narrowed by more than one
    value.

**Rule 5: output.**

- Hero, range and confidence come from `estimateComp(pool, query)`, with
  confidence via `displayConfidence(result, meta)`.
- The comparables are its top 5. Each row's meta shows the location that
  matched the query (else the first) and the level.
- The scale is "typical range for these filters", computed over the pool.
- All amounts are approx USD from `salaryUSD`. Show the "*" footnote when any
  comparable was converted. Use one FX table: drop `FX_FALLBACK` rates that
  disagree with the palette.

**Rule 6: not enough comparable roles.** Show a "Not enough comparable roles"
card, with no figure and no confidence, when any of these holds: the pool has
fewer than 3 salaried roles, `estimateComp` returns `mid: null`, or `n < 3`.

- Text: "Not enough comparable roles with posted pay at <Company> for
  <basis>. Remove a filter or try a broader title."
- Add the reset link if anything is edited.
- In the drawer, show no Compstimate block in this case.

**Rule 7: basis text.** This one line replaces "Based on N comparable roles"
and the explanation's opening clause:

- Format: `Based on N similar roles at <Company>` + (`, ` + parts joined with
  ` · ` when there are any).
- Parts, in this order:
  - the Department and Role-family filter values in effect;
  - Level (the edited value, or the seniority filter values in effect);
  - Location (the edited value, or the location/remote filter values in
    effect).
- N is `result.n`, and the same N appears in the live-region text.
- Example: "Based on 37 similar roles at Anthropic, Sales".
- Example: "Based on 28 similar roles at Anthropic, London".
- Auto line:
  - "Showing the most common role in your filters: “<title>”. Type any
    title."
  - With no filters: "… on this board …".

**Rule 8: drawer.** Only for postings with no usable salary: no salary, or pay
unclear.

- Compute `estimateComp(all salaried board jobs, { title: job.title,
  seniority: job.seniority || '', location: <first on-site key> or "Remote",
  department: '' })`, excluding the job.
- No filters and no widget state. Drop `department` from `compstimateForJob`;
  product re-runs the backtest and reports the new published figure.
- Copy:
  - figure line: "≈ $X ($L–H, <confidence> confidence)";
  - "Based on N similar roles at <Company>, <level> · <location>. An estimate,
    not a figure from the posting (approx USD / year).";
  - then the accuracy line.
- Opening or closing a job **never changes the Insights widget**.
- **Equality guarantee:** Insights with Title, Location and Level all
  *edited* to the job's values ignores every role-defining filter, so its
  pool is the whole salaried board. It therefore shows exactly the drawer's
  mid, low, high, n and confidence, whatever filters are set.

**Rule 9: accuracy line.**

- It is the current company's backtest. It is the same in Insights and the
  drawer, and is never carried over from another company.
- If the jobs response has `meta.compstimate: null`, the app re-requests
  `meta` once after about 5 s. If that returns a figure, it updates the line
  and the confidence cap in place, without touching the other fields.

**Rule 10: renders.**

- Exactly one estimate per committed state change: company load, filter
  commit, field edit or reset.
- No re-render when the signature (company, pool ids, query) is unchanged:
  salary, sort, mode or view changes, or the drawer opening or closing.
- A company switch computes once, with the new board and re-derived fields.

#### State table

"Following" means the field follows the filters (no user edit). In the Output
column, n and the mid compare against the "no filters" row.

| Change | Title | Location | Level | Pool (salaried, Anthropic snapshot) | Output |
|---|---|---|---|---|---|
| No filters | auto "Software Engineer" | Any location | Any level | all 556 | estimate; "Based on 200 similar roles at Anthropic" |
| + Department = Sales | auto "Enterprise Account Executive" | Any | Any | Sales, 93 | new estimate; basis "…, Sales"; comparables all Sales |
| + Department Sales + Finance | auto (most common of both) | Any | Any | both departments | basis "…, Sales · Finance" |
| Role family (rf) | auto (most common in family) | Any | Any | family | basis names the family |
| Seniority = Senior | auto (most common among Senior) | Any | Senior | Senior, 59 | comparables all Senior |
| Seniority Senior + Staff+ | auto | Any | "Senior or Staff+ (filters)" | both levels | comparables only those levels |
| Location = London | auto "Software Engineer" | London | Any | London, 49 | comparables all list London |
| Location = Remote (US) | auto | Remote (US) | Any | jobs keyed "Remote (US)" | not "Any location" (I6) |
| Remote = remote | auto | "Remote (filters)" | Any | remote jobs, 63 | comparables remote |
| London + Senior | auto | London | Senior | 4 | "Not enough comparable roles" (n=1) |
| Skill / responsibility / fit chip, employment type, Listed, Juice, map area | auto may change (it uses the filtered list) | unchanged | unchanged | **unchanged** | recompute only if the auto title changed |
| Salary min/max, "listed only" | unchanged | unchanged | unchanged | **unchanged** | **no re-render**; identical numbers |
| Search "python" / "London" | auto = most common role among the matches (never "python") | unchanged | unchanged | unchanged | a real estimate, never "No estimate yet" for a skill word |
| User types Title "Research Engineer" | **edited** | following | following | department/rf filters dropped | Reset link shown |
| User picks Location "London" | following | **edited** London | following | `l`/`r` filters dropped | comparables weighted to London |
| Any filter change while fields are edited | edited fields unchanged | edited fields unchanged | edited fields unchanged | only following groups narrow | edited values never overwritten |
| Reset to filters | following | following | following | all role-defining filters | same as with no edits; link hidden |
| Clear all filters | following fields → defaults; edited fields unchanged | | | all salaried, minus edited groups | |
| Open a job (drawer) | unchanged | unchanged | unchanged | unchanged | Insights unchanged; drawer = Rule 8 |
| Close the drawer | unchanged | unchanged | unchanged | unchanged | no re-render |
| Back / Forward | following fields re-derive from the restored hash; edited fields unchanged | | | per restored filters | one render |
| Company switch | auto re-derived; edited title kept | following re-derived; an edited value missing on the new board shows "(0)" | following re-derived | new board | one render; accuracy line for the new company (Rule 9) |
| "Same role elsewhere" → OpenAI (sets `c`, `rf`, `s`) | auto (most common in the family at OpenAI) | following | the job's level | OpenAI ∩ family ∩ level | basis "…at OpenAI, Software engineering · Senior" |

### 3.3 Test matrix (for QA, Playwright against `node server/index.js`)

Read the widget at `#compHost`:

| Element | Selector |
|---|---|
| Title field | `.ms-comp__input` |
| Location select | `select` nth 0 |
| Level select | `select` nth 1 |
| Estimate | `.ms-comp__hero` |
| Range | `.ms-comp__range-ends b` |
| Confidence | `.ms-comp__conf-label` |
| Basis | the basis line (currently `.ms-comp__conf-n`) |
| Accuracy line | `.ms-comp__accuracy` |
| Comparables | `.ms-comp__item` |
| Drawer estimate | `#drawer .d-comp` |

Count renders with a MutationObserver on `.ms-comp__result`, counting
`childList` records that add nodes. Expected pools come from `/api/jobs`
plus the matching rule (Rule 3), not from product's helper.

1. **Baseline.** At `#c=anthropic&m=insights`:
   - the Title has no level word;
   - Level is "Any level" and the explanation names no level;
   - the basis starts "Based on <n> similar roles at Anthropic".
2. **Department narrows.**
   - Tick Department = Sales: the Title changes to the most common Sales
     role, the basis ends ", Sales", and every comparable's meta contains
     "Sales".
   - Untick it: back to the T1 values.
3. **Two departments.** Sales + Finance: the basis lists both, and the
   comparables are only from those departments.
4. **Seniority.**
   - With one level (Senior): Level shows Senior and all comparables are
     Senior.
   - With two (Senior + Staff+): Level shows "Senior or Staff+ (filters)" and
     the comparables are only those levels.
5. **Location.**
   - With London: the Location field shows London and every comparable meta
     shows London.
   - With "Remote (US)": the Location field shows "Remote (US)", not "Any
     location".
6. **Remote toggle.** Remote only: the Location field shows "Remote
   (filters)" and the comparables are all remote.
7. **Not enough.** London + Senior shows "Not enough comparable roles", with
   no `.ms-comp__hero` and no confidence label.
8. **Salary invariance.** Record mid, low, high, n and the comparable ids.
   Then:
   - drag the min salary thumb to $300K;
   - toggle "listed only";
   - set `smax`.
   After each, all values are identical and 0 renders occur.
9. **Chips don't narrow the pool.**
   - With the Title edited (so the auto title can't move), click the Python
     chip and a responsibility chip: the numbers are identical.
   - With the Title following: the Title becomes the most common role among
     the filtered list, and the basis has no chip names.
10. **Search.**
    - Search "python": the Title is not "python" and an estimate shows.
    - Search "London": the Title is not "London".
    - Type "Product Manager" with a 50 ms delay per key: "No estimate yet"
      never appears during typing, and there are no more renders than
      committed searches.
11. **Edit sticks.**
    - Set Senior + London.
    - Type the Title "Research Engineer": the reset link appears.
    - Then: add Department Sales, untick Senior, change the search, Clear all,
      Back, Forward.
    - After each step the Title is still "Research Engineer".
12. **Edited location and level stick.** Pick Location Seattle and Level
    Staff+ in the widget, then tick and untick Location and Seniority
    filters: the widget still shows Seattle / Staff+.
13. **Reset.** After T11, click "Reset to filters":
    - the fields equal the current filters;
    - the link is hidden;
    - the output equals a fresh load of the same hash.
14. **One link.** In any state there is at most one "Reset to filters" link
    on the page.
15. **Drawer equals Insights.**
    - Open no-salary job `anthropic:5391376008` (AE - DNB, Singapore, Mid)
      with filters Senior + London set: Insights is unchanged by the opening.
    - Close it, then edit Insights to Title "Account Executive - DNB",
      Location Singapore, Level Mid.
    - The mid, low, high, n and confidence equal the drawer's.
    - Repeat for 3 random no-salary jobs on OpenAI.
16. **Drawer doesn't hijack Insights, or go stale.**
    - Record Insights.
    - Open a salaried comparable from the widget list, press Esc, then change
      Sort.
    - Insights equals the record at every step, with 0 renders.
17. **Drawer chip.** In the drawer, click a keyword chip: the drawer
    estimate is unchanged, and Insights changes only if its Title is
    following.
18. **Back/Forward.**
    - Hash A = `s=Senior&l=London&q=Software Engineer`; B = Clear all.
    - Back restores A's following fields and output exactly; Forward restores
      B.
    - One render per step.
19. **Company switch.**
    - Anthropic → OpenAI → Cohere → xAI with no edits: the Title is the auto
      title of each board, the accuracy line names each board's backtest n,
      and there is 1 render per switch.
    - With the Title edited: it survives every switch.
20. **Same role elsewhere.**
    - Open a salaried Senior software engineer at Anthropic.
    - Click the OpenAI row in "Same role elsewhere": the hash has
      `c=openai&rf=swe&s=Senior`, Level shows Senior, and the basis is "…at
      OpenAI, …Senior".
    - Back returns to Anthropic with the drawer open.
21. **Cold accuracy.**
    - Start a fresh server with an empty cache dir (`MELON_CACHE_DIR`) and
      open `#c=anduril&m=insights`.
    - Within 10 s, with no user action, the accuracy line appears. The other
      fields don't change.
22. **FX.** On Cohere (CAD) and Anthropic + London:
    - the hero says USD and the "*" footnote is present;
    - the drawer copy says "approx USD".
    - Unit test: `salaryUSD` and the app's `_usd` agree for every currency in
      the snapshots.
23. **Copy.** No visible string in the widget says "on this board" while a
    role-defining filter is active.

## 4. Replayable steps

```bash
SP=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad
cd /home/user/melon-seek
PORT=5317 MELON_CACHE_DIR=$SP/cache MELON_HISTORY_DIR=$SP/hist node server/index.js &   # real snapshots
# PRE build = app.js before 1505f25, served in place of /app.js through page.route
git show e2e6fd5:public/app.js > $SP/app-e2e6fd5.js
cd $SP/pw
BASE_URL=http://localhost:5317 node comp-repro.mjs out/comp > out/head.txt              # HEAD, steps 01-36
OLD_APP=$SP/app-e2e6fd5.js BASE_URL=http://localhost:5317 node comp-repro.mjs out/comp-pre > out/pre.txt
BASE_URL=http://localhost:5317 node comp-repro2.mjs                                     # HEAD A-D
OLD_APP=$SP/app-e2e6fd5.js BASE_URL=http://localhost:5317 node comp-repro2.mjs          # PRE A-D
PORT=5319 MELON_CACHE_DIR=$SP/cache3 MELON_HISTORY_DIR=$SP/hist3 node server/index.js & # cold server
node cold.mjs                                                                           # I11
```

- **Browser.** Chromium is at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, with the scratchpad
  copy of playwright. `playwright install` was never run.
- **What `comp-repro.mjs` does.** It opens `#c=anthropic&m=insights` and
  walks through:
  - the filter panel's Department, Location, Seniority and Remote controls;
    these are real clicks, except where a value is hidden behind "more", in
    which case the hash is set;
  - a Python chip and salary through the hash (`smin`, `so`);
  - search typing, widget edits, Clear all and Back/Forward;
  - a drawer opened by hash on a no-salary job, a drawer chip, Esc, and a
    comparable click;
  - company switches (OpenAI, Cohere, xAI) and a reload.

  After each step it dumps the hash, the three fields, hero, range,
  confidence, basis, accuracy line, explanation, 5 comparables, drawer text
  and the render count.
- **What `comp-repro2.mjs` covers.** (A) search typed one key at a time, (B)
  renders on a company switch, (C) drawer vs Insights with filters set, then
  Esc, then a Sort change, (D) "Same role elsewhere" and Back.
- **Reference numbers.** The state table's pool sizes and auto titles came
  from Node: `estimateComp` over the Anthropic snapshot with the Rule 3 pool.

## 5. Verification

- HEAD run: 35 steps recorded. The widget re-rendered 0 times on every filter
  step and once per company switch (I1, I2). No page errors. The only
  console error is the blocked external font (`ERR_CERT_AUTHORITY_INVALID`).
- PRE run: 35 steps recorded, reproducing I3–I10 and I12.
- Cold-server run: the accuracy line was null on the first visit and still
  null 8 s later. It was present after a revisit (I11).
- Screenshots: `$SP/pw/out/comp/{01-initial,25-drawer}.png` (HEAD) and
  `$SP/pw/out/comp-pre/{01-initial,25-drawer}.png` (PRE). The raw step JSON
  is in `comp-repro.json` in each folder.
- No tests were added or run; QA owns the test matrix.

## 6. Known gaps and follow-ups

- **I1 is an unflagged regression in `1505f25`.**
  - Product: don't simply restore the old block. It brings I3–I10 back.
    Implement §3.2 instead.
  - Lead: check how a viz/devops commit came to remove product's lines.
- **Rule 8 drops `department` from `compstimateForJob`.** This changes the
  backtest (the published "±N%"). Product must report the before and after
  figures per board. If the error worsens by more than 1 point, raise it
  with lead before shipping. The alternative is a hidden department field in
  Insights.
- **Edits aren't in the URL**, so a shared link shows following fields only.
  This is intentional (simplicity), but means the URL is not a full
  reproduction.
- **Odd auto titles on small pools.** On narrow pools the auto title can be
  odd: Senior at Anthropic gives "AWS GTM Partnership Lead" because one band
  is copied across many titles. Acceptable for now. If users find it
  confusing, use the most common role family's representative title
  (`FAMILY_TITLES`) instead.
- **The Rule 9 refetch needs `meta` without the jobs.** Product or backend
  must pick the endpoint (`/api/jobs` again, or a small `/api/meta?company=`).
- **`Unspecified` seniority** was checked only by reading the code
  (`app.js:332`; `senioritySim` returns 0.5 for unknown labels,
  `compstimate.js:45`). No board with that value was exercised in the
  browser.

## 7. Change log

- 2026-10-02: investigation on HEAD `f0e78f8` and PRE (`e2e6fd5` `app.js`);
  12 incoherences with root causes; behaviour spec (10 rules and a state
  table); 23-scenario test matrix.
