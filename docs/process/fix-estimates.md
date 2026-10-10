# Process log: fix-estimates (pay estimate and company comparisons)

## 1. Brief

Prompt: [`prompts/fix-estimates.md`](prompts/fix-estimates.md) (verbatim). Target `stable`.

Goal: fix the estimate and comparison findings of the 2026-10-10 persona review of the main site
(P-1 on-target earnings in comparisons, P-2 the pay estimate, P-3 "Level not stated" on these
surfaces, P-6 Insights statistics by city and from tiny samples, P-10 Compare companies like with
like, P-11 "Same role elsewhere" families and fallbacks, I-8 Compare companies follows the view,
I-9 plain words), without adding a main-view control.

Files owned and changed: `public/features/compstimate.js`, `public/features/comps.js`,
`public/features/roles.js`, `public/features/insights.js`, `public/features/shared.js`,
`public/viz/comps.js`, `scripts/build-market.js`; new tests `test/fix-estimates.test.js` and
`test/e2e/fix-estimates.e2e.js` (registered in `scripts/e2e.js`).

Also changed, outside the owned list, because my changes broke their old expectations:
`test/e2e/ui.e2e.js` (five Compstimate checks, forward-compatible with and without the app.js
patch; see §3.12).

Patch for a file I don't own: [`patches/fix-estimates-app.diff`](patches/fix-estimates-app.diff)
(`public/app.js`, the app lane): the drawer estimate block, the "Same role elsewhere" note, and
the Insights wiring for the Compare card and Market insights. Why: the drawer copy and the
Insights wiring live in app.js; every rule is in my modules, and the patch only calls them.

## 2. Inputs and sources

- `docs/CONTRACT.md` (Job, market.json contract: `n ≥ 3 per cell`, `basis: "posted base pay ranges"`).
- `docs/strategy/ROADMAP.md` §8 (UI budget: no new main-view control; Insights cards; drawer order).
- `docs/process/PLAYBOOK.md`, `TEMPLATE.md`, `lead.md` ("Persona review of the main site").
- The five persona logs (`persona-stable-*.md`, "Broken, fix now" and "Improve"), and their
  screenshots, notably 45-54 `p1-20-market-insights.png` (the "+$38K" skills), 25-34
  `p1-priya-f-01-insights-top.png` (range bar ends), 35-44 `p4-08-map-sydney.png` ($61K Sydney).
- The shared decisions in the base commit: `levelLabel` (roles.js), `payLocations` (shared.js),
  `salary.kind === 'ote'` and `salary.termWeeks` from the pay-data lane.
- Real data: `data/snapshots/*.json` (8 boards, 2026-10-10), vetted with `server/vet.js`.
- No skills loaded, no external sites.

## 3. Decisions and rationale

1. **Pay from another country is never used for a place (P-2).** `estimateComp` restricts
   comparables to postings whose pay applies in the query's country (`payLocations`, cached per
   posting in the estimate index). With none, there is no figure and `reason: 'no-local-pay'`
   ("No similar role at Anduril in Australia lists pay, so there is no pay estimate. Pay from
   other countries isn't used."). Considered: a labelled fallback to US pay ("from US roles; no
   role in Sydney lists pay"). Rejected: the headline number would still read as local pay,
   which is what all five groups called broken. Within the country, a city with no pay of its own
   falls back to the rest of the country and the basis line says so ("elsewhere in the US (none in
   Seattle lists pay)"). `locationSim` and `jobLocationQuery` also use `payLocations`.
2. **Never across the intern / full-time line (P-2, P-11).** `isInternLike(job)` (shared.js) is
   seniority Intern, or fixed-term pay (`salary.termWeeks > 0`, or a stipend). An intern estimate
   uses only intern-like pay (`no-intern-pay` otherwise); a full-time estimate never uses it.
   The same split is in the market cells and in `compsForJob` (no fallback from Intern to "all
   levels"; there is no such fallback any more, because "*" is now full-time only).
3. **On-target earnings are a kind of pay, never pooled (P-1).** `isOTE(job)` reads
   `salary.kind === 'ote'` (set by the pay-data lane). build-market puts them in `oteCells`, never
   in `cells`; `compsForJob` compares an OTE posting only with OTE cells (`res.kind`); an estimate
   uses whichever kind carries more of the similarity weight among the selected comparables, and
   drops the other (`result.kind`); the labels say "Estimated on-target earnings (base plus
   commission at target)". Insights leaves OTE out of every base-pay figure and says how many.
   Today's snapshots carry no `kind: 'ote'` yet, so these paths are covered by unit tests only.
4. **"Level not stated" is never presented or matched as a level (P-3).** `levelStated()` and
   `SENIORITY_DISPLAY_ORDER` (roles.js; "Level not stated" last). `compsForJob` never matches a
   'Mid' cell: an unlevelled posting is compared with every full-time level, with
   `fallback: 'level-not-stated'`. The estimate's basis line never names 'Mid'. Estimate
   *weighting* keeps Mid close to Mid: tried treating it as "no level" and the backtest error
   rose (Anduril 10.7% → 13.3%, Scale AI 8.3% → 11.6%), so a missing level word is kept as a
   title feature, and is only never called a level. The Compare card's level choice never offers
   it, and names companies that mostly don't state levels instead of hiding them ("xAI (doesn't
   state levels for most of these roles)"; threshold: half or more of the family's full-time
   salaried postings are unlevelled).
5. **The basis line describes the comparables (P-2).** `result.basis = { level, place, fallback }`
   from the comparables actually used: level = the asked level, "mostly Senior" (≥ half the
   weight) or "mixed levels"; place = the city when every comparable's pay is there, "X and
   elsewhere in the US", or the fallback text. `estimateBasisLine()` builds it for both surfaces;
   Insights adds only what its pool filters guarantee (departments, several levels, remote).
6. **One function for the drawer and Insights (P-2).** Both call `estimateComp`, and both show it
   through `estimateView()` (figure or not, label, confidence, basis, accuracy, reason). When the
   Insights pool is too small, `estimateInputsResult()` checks the company-wide reason, so
   Insights with Sydney + Staff+ gives the drawer's sentence word for word.
7. **No accuracy claim at low confidence (P-2).** `estimateView().accuracy` is null at Low; a
   caution takes its place ("Few close matches, so treat this as a rough guide."). Board-level
   low accuracy (> 25%) still forces Low.
8. **Range bar ends (P-2).** `rangeScale(low, high, mids)`: the ends are min/max of Low, High and
   the pool's 5th/95th percentile, rounded out to $10K; the labels print those ends. The pool for
   the scale is the same kind and intern-ness as the estimate. The middle label is now "pay of
   roles in these filters" (not "typical range", which the ends no longer are).
9. **Insights samples (P-6).** `MIN_SAMPLE = 5`: no median, box, share bar or pay difference from
   fewer than 5 roles (salaried roles for pay; roles in view for shares). `TIE_SHARE = 0.5`: a
   skill or requirement whose roles mostly post the identical range is "tied" and left out
   (`isTied`), with a note. The difference itself is now averages, not medians: with banded pay,
   medians of different groups land on the same band (Anduril: six skills all "+$23K"; Cohere
   Toronto: eight at "+$38K"); averages do not tie, and "average" is a plainer word. The pure
   functions keep their old defaults for existing callers; the panel passes the new options.
   Measured on real data with a z-test too: the "Strong communication −$34K" difference was
   statistically clear (z = −3.3), so significance gating would not have hidden it; with averages
   it reads −$12K.
10. **Places in Insights use payLocations (P-6).** Hot locations: a role counts in every city it
    lists, but its pay counts only where it applies; a median needs 5 such roles. With a location
    filter (`update(…, { places })`, from the app patch), the tiles, skills, departments and
    requirements use only pay posted for those places, and the header says how many were left out.
11. **Role families (P-11).** In `roleFamily`: "national/international/homeland security" is
    masked as a domain word (sales head → sales; policy lead → policy); a sales, security or
    solutions title in a public-policy department is policy; research fellowships are ml;
    "operator" counts as field operations only for vehicles, drones, flight test, ranges and
    sensors; plain "deployment engineer" is solutions (cloud or IT ones are swe / it); "technical
    instructor" is support. Real-data diff: 19 of 4,824 postings change family, all listed in
    §5. One unit test per real title.
12. **Tests owned by others.** `test/e2e/ui.e2e.js` encoded the old behaviour in five places:
    the pinned no-pay job (AE - DNB) moved to Singapore, where no Anthropic role lists pay, so it
    has no estimate now; T15 assumed every no-pay drawer has a figure; T19/T21 wanted an accuracy
    figure even at low confidence; the drawer parser read "≈". I changed them to the new rules,
    forward-compatible with and without the app.js patch: `noSalaryJob` picks a posting that has
    an estimate; T15 checks drawer = Insights both ways (same figure, or no figure and the same
    reason); T19/T21 accept the low-confidence caution and forbid "±" next to it; the parser
    accepts "about $X".
13. **UI budget.** One new control, inside the existing Compare companies card: a Level select
    beside Role family (I-8 asks for it; no main-view change). Everything else is text in existing
    places. Compare does not follow the location filter (market.json has no place dimension); the
    card says so when a location filter is on (§6).
14. **Plain words (I-9).** "Compstimate" → "Pay estimate" on screen (code names kept);
    "middle 50%" → "middle half"; "10th–90th percentile" → "most salaries"; "Range is the
    15th–85th percentile" → "Low and High leave out the lowest and highest 15%"; "≈" → "about"
    (drawer, in the patch). The I-9 unit test scans the shown strings of the four files.

## 4. Replayable steps

```bash
# worktree setup (the lead's wave instructions)
ln -s /home/user/melon-seek/node_modules node_modules
mkdir -p data && ln -s /home/user/melon-seek/data/snapshots data/snapshots

# unit tests (the three baseline failures are environment/timing; see §5)
npm test
node --test test/fix-estimates.test.js

# e2e in this worktree (no app.js patch) and in a scratch copy with the patch
npm run build
NODE_PATH=<scratch>/pw/node_modules node scripts/e2e.js
git apply docs/process/patches/fix-estimates-app.diff   # in a scratch copy only

# before/after screenshots: baseline copy on :5181, patched copy on :5182
node <scratch>/fix-estimates/shots.mjs http://127.0.0.1:5181 before <out>
node <scratch>/fix-estimates/shots.mjs http://127.0.0.1:5182 after <out>
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-estimates

# real-data checks used for the decisions (scratch scripts)
node an/famdump.mjs fam-after.json fam-before.json      # role-family diff
node an/bt.mjs                                          # backtest per company
```

## 5. Verification

**Where each finding is fixed** (file:line in this worktree):

| Finding | Root cause | Fix |
|---|---|---|
| P-1 OTE pooled with base pay | build-market and the estimate pooled every salary; no kind of pay | `shared.js:79` `isOTE`; `build-market.js:101` OTE into `oteCells`; `comps.js:101` `compsForJob` reads the cells of `res.kind`; `compstimate.js:261` one kind per estimate; `insights.js:44` OTE out of base-pay figures |
| P-2 other countries' pay | `locationSim` weighted other countries 0.25 | `compstimate.js:234` country restriction via `payLocations`; `:97` `locationSim` on pay locations; `:380` `jobLocationQuery` |
| P-2 intern from full-time pay | `senioritySim` only down-weighted interns | `compstimate.js:232`; `:398` `internLike` for the drawer and the backtest |
| P-2 basis line names the query | app.js built it from `est.query` | `compstimate.js:327` `describeComparables`, `estimateBasisLine`; patch: the drawer uses `estimateView` |
| P-2 "±8%" beside low confidence | the accuracy line was printed unconditionally | `compstimate.js:714` `estimateView` (no accuracy at Low); widget `:945`; patch for the drawer |
| P-2 drawer ≠ Insights | Insights pool keyed on every listed location; no shared reason | `compstimate.js:588` pool keys from `payLocations`; `:680` `estimateInputsResult`; `:697` `noEstimateText` |
| P-2 range bar ends | labels were p5/p95, the bar ran from min(p5, Low) to max(p95, High) | `compstimate.js:739` `rangeScale` |
| P-3 Level not stated | 'Mid' matched as a level and shown as "Mid" | `roles.js:328` `levelStated`, `:332` display order; `comps.js:101` never a 'Mid' match; `:176` `missingCompanies` ("doesn't state levels"); widget level options |
| P-6 Sydney median, tiny and tied samples | every listed place got the pay; boxes and bars from 2 roles; medians of banded pay tie | `insights.js:159` `hotLocations` on pay locations; `:23` `MIN_SAMPLE`, `:29` `TIE_SHARE`, `:49` `isTied`, `:97` averages; panel `:265`–`:416` (plus `places` from the patch) |
| P-10 interns in Compare | the "*" roll-up took every posting | `build-market.js:103` interns and fixed-term pay only in "Intern"; the card's foot says what is left out |
| P-11 wrong family | the security rule ran before sales; a bare "operator" | `roles.js:250` national-security mask, `:272` fellowships, `:275` policy departments, `:198` field operations, `:181`/`:182` support and solutions |
| P-11 fallback across the intern line, false message | fallback to all levels; app text "No other company lists this level" | `comps.js:101` `fallback` field; `:126` `compsNote`; the patch prints it |
| I-8 Compare ignores the view | the card got only the board, once per company | `comps.js:227` `compareDefaults`, `:254` card with a Level select (`:268`) and the left-out note; the patch passes `visible` and `filters` and refreshes on filter changes |
| I-9 jargon | "Compstimate", "middle 50%", "percentile", "≈" | `compstimate.js:826` "Pay estimate"; `viz/comps.js:19`; Insights and Compare copy; patch: "about $X" |

**Tests.**

- `npm test` (worktree, no patch): 652/655. The 3 failures are the baseline ones: `cycle.test.js`
  "local beta data is gitignored" (git refuses a path behind the `data/snapshots` symlink the wave
  setup asks for) and the two timing tests PERF-1 and V15, which pass alone
  (`node --test test/perf.test.js`: 3/3, here and in the baseline copy).
- `node --test test/fix-estimates.test.js`: 54/54. Against the baseline copy it fails at import
  (the new exports do not exist), as red tests should.
- Full e2e, worktree without the patch: 109/114 passed, 1 failed, 4 skipped. The failure is the
  baseline one (API: anduril "salary range implausible 20454000-30680000", the pay-data lane's);
  2 skips are the baseline ones and 2 are my checks that need the app.js patch.
- Full e2e, scratch copy with the patch applied by `patch -p1`: 111/114 passed, the same 1
  failure, the 2 baseline skips.
- Baseline (scratch copy of a9a46a7): e2e 101/104 (the same failure, 2 skips).

**Backtest** (`backtest()` per company, median absolute % error, before → after): Anduril
11.0 → 10.7, Anthropic 9.4 → 9.4, Cohere 6.8 → 5.5, OpenAI 8.7 → 8.7, Palantir 0.3 → 2.2,
Scale AI 8.3 → 8.3, Shield AI 14.7 → 14.9, xAI 6.1 → 4.0. Palantir's rise comes from its 36
interns, now estimated only from interns.

**Market document:** 22 KB → 29 KB (380 base cells, 0 OTE cells until the pay-data lane lands,
224 below-minimum counts); the cap is 150 KB.

**Role families:** 19 of 4,824 postings change family (scratch `an/famdump.mjs`): Anduril's three
cloud deployment engineers (swe) and plate-rolling operator (manufacturing); Anthropic's AI
Deployment Specialist (solutions), Lead Technical Instructor (support), Life Sciences Operator
(ml), two Fellows Program roles (ml), Head of National Security Sales (sales), National Security
Partnerships Lead and three Community Engagement Managers in Public Policy (policy); OpenAI's
Early Access and Partner AI deployment engineers (solutions) and ITAV deployment engineer (IT);
Scale AI's "Head of International Security" and the National Security Hackathon now have no family.

**Screenshots** in `docs/screenshots/fix-estimates/` (shrunk, 42 files): `before-*` from the
baseline copy and `after-*` from the patched copy, desktop 1440×900 and phone 390×844. The
drawer for the Sydney Staff SWE, the Cohere intern and the Palantir London designer; Insights for
Sydney + Staff+, the Anthropic range bar, and Anduril Sydney and Cohere Toronto Market insights;
Compare for xAI business operations, Software engineering at Staff+, and the policy filter;
"Same role elsewhere" for the national-security sales head, the policy lead, the Fellows role
and a UAV operator; phone Insights and drawer; the static build at `/melon-seek/` and
`/melon-seek/beta/` (desktop and phone: title "Pay estimate", no horizontal scroll, no console
errors). No regression seen at either size.

## 6. Known gaps and follow-ups

- **OTE has no real data yet.** The pay-data lane sets `salary.kind = 'ote'`; until it lands,
  the OTE paths run only in unit tests. After it lands, Anthropic's sales postings drop out of
  base-pay comparisons and "Same role elsewhere" for them shows only other OTE posters (none
  today), so the section hides.
- **Compare companies has no place dimension.** market.json cells are company × family × level.
  A London view compares companies' pay from all their locations; the card says so. A country
  column would make London-to-London comparisons possible (about +10 KB).
- **Estimate coverage outside the US drops.** Many non-US no-pay roles now show a reason instead
  of a US-pay figure. That is the point of P-2, but people outside the US will see fewer numbers.
- **`data/freshness.json` line references** into my files moved; the lead's
  `node scripts/refresh/registry.js --lines --write` re-resolves them.
- The drawer's "percentile" in the pay block, card badges and the app's stats line belong to the
  app lane.

## 7. Change log

- 2026-10-10: baseline in a scratch copy of a9a46a7: npm test 598/601 (the 3 failures are the
  data/snapshots symlink in `cycle.test.js` and the two timing tests); e2e 101/104 (1 failed:
  API anduril "salary range implausible", pay-data lane; 2 skipped).
- 2026-10-10: fixes for P-1, P-2, P-3, P-6, P-10, P-11, I-8 and I-9 in the owned files; the app.js
  patch; five Compstimate checks in `ui.e2e.js` moved to the new rules; new unit and e2e tests;
  before and after screenshots.
