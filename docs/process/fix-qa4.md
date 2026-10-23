# Process log: fix-qa4

## State
- **Done, round 1 (2026-10-17):** D-52, D-49, D-50, D-48 and D-47, with numbers before and after (§5); unit tests
  (test/fix-qa4.test.js), the e2e group (test/e2e/fix-qa4.e2e.js), the CONTRACT section, screenshots. Series
  11a107a..dcebc6a, gated at 6a9ddc0, sent to the lead and in its integration branch.
- **Done, round 2 (2026-10-23, after the weekly limit):** UX-51 (shift pay labelled on the card, its tip, the drawer
  heading and the CSV), MR-35 (the stated base keeps its cents) and UX-50 (the company beside its dot under Group by
  Company). Commits 6185ba3 (fixes and tests), 40a11f2 (MR-35 marked fixed), 15edb5c (salary-audit's lifted helpers).
  - Red first: 4 unit tests and 21 e2e checks fail on dcebc6a, and MR-35's test fails there once it is a plain test.
  - Gate at 15edb5c: clean `npm test` 1,204 pass, 0 fail. The e2e and the phone smoke on 6185ba3's build: §5.
- **In progress:** the e2e groups (fix-qa4 per size, the card, the drawer, fix-phone-text, google-grouping) and the
  phone smoke, one at a time, while the lead's gate also runs.
- **Next step:** send the lead the SHAs. At integration: test/beta-methodology-2.test.js `FIXED` gains MR-35, and the
  methodology lane starting now edits the same line; test/salary-audit.test.js `CARD_IF_PRESENT` gains the shift helpers.

## 1. Brief
- **Prompt:** [prompts/fix-qa4.md](prompts/fix-qa4.md), verbatim.
- **Goal:** fix desktop QA round 4's D-52, D-49, D-50, D-48 and D-47 on the beta site
  ([qa-desktop-beta-4.md](qa-desktop-beta-4.md); red tests in test/e2e/beta-desktop-qa-4.e2e.js, copied from the QA
  worktree and registered in scripts/e2e.js), without cutting or hiding any posting or posted pay row, and with pay
  presented as posted (big-tech figures are base pay only, and say so).
- **Owned:** public/features/compstimate.js; `payRank` in public/features/shared.js; server/export.js and the CSV/README
  step of scripts/build-static.js; in public/app.js renderViz's unknown and error states, the drawer's rank line and the
  no-pay estimate line; test/fix-qa4.test.js, test/e2e/fix-qa4.e2e.js; this log and its prompt.
- **Not owned, not touched:** the drawer footer and meta line (fix-phone-sizes), chart and map drawing (fix-viz-5),
  `payAt` itself (used as it is), features.css.

## 2. Inputs and sources
- docs/CONTRACT.md: the fix-data-3 and fix-pay-at-place sections (`payAt`, V-40, the lead decision of 2026-10-16), the
  F7 CSV row.
- docs/process/PLAYBOOK.md ("Checkpoints", "Known traps"), TEMPLATE.md, fix-pay-at-place.md (its V-40 decision and
  `measure.mjs`, whose approach `<scratch>/fqa4/d52.mjs` follows).
- docs/DATA_SOURCES.md §7 (the big-tech systems table, which the beta README names) and §7a (pay rules: OTE, minimums,
  shift pay, part-time, fixed-term, ranges by place and level).
- The QA lane's test file and checkpoint (wip/qa-desktop-beta-4/STATUS.md): the IDs and postings named in the brief.
- Code read: compstimate.js (`buildIndex`, `estimateComp`, `payAtQuery`, `describeComparables`, `compstimateForJob`,
  `backtest`, the widget's comparables list), shared.js (`payAt`, `payCovers`, `payRank`, `salaryUSD`), app.js
  (`renderViz`, `drawerContent`'s rank and pay block, `compstimateBlock`, `payUnclearBlock`, `payPill`, `payHeadline`,
  `payRanges`), server/vet.js (`salaryChecks` codes), server/export.js, scripts/build-static.js (the CSV step,
  `pubCompany`, `buildSite`), test/beta-build.test.js (no beta host in the main site's files).
- Data: the 2026-10-16 crawl (wt-data2), through the static build's lists (`public/api.js unpackJobs`).

## 3. Decisions and rationale
1. **D-52, the local rule.** A comparable is local when `payAt` prices one of its places in the city: its one range covers
   the place (`basis: 'posting'`, checked with `payCovers`), or it has a row of its own there (`basis: 'place'`, and it
   is priced at that row, as V-40 did).
   - **When the city-only cut applies.** V-40 used only local comparables once there were `LOCAL_MIN` (5). With
     one-range postings counted as local, that cut would reach every board. Measured on the 2026-10-16 crawl, the cut on
     every board made the backtest worse where a company posts one range for many places: Google 12.4% to 14.2%,
     Palantir 8.6% to 10.7%, Meta 14.8% to 15.4%, Netflix 15.0% to 15.7% (median error). Their other cities' postings
     carry the same national range, so leaving them out only shrinks the sample.
   - So the cut applies when at least one comparable has a row of its own for the city, which says the company prices
     that city separately. Then every local comparable is kept, one-range ones included. Boards without per-place rows
     are unchanged, as V-40 promised.
   - Considered: a trigger only when the city's row differs from the posting's headline (so Microsoft's U.S. row in
     Redmond would not trigger). Same backtest figures (Microsoft 8.4% either way); more to explain. Not taken.
   - The local test runs on the comparables only (at most 500, after the weight cut), not over the board, so the
     board-wide pass costs what it did. Amazon's 500-posting backtest: 24.4 s before, 19.5 s after in Node (load 6 to 10).
2. **D-52, the list.** `estimateComp` returns `comparablePay`: the pay each listed comparable was used at, and the place
   when it is one place's row (the city's row, or the headline row of a comparable used at its headline, Amazon's search
   city). The widget's "Most comparable roles" shows that range; its line starts "Posted for <place>" (the drawer's
   words) and the accessible name says "the range posted for <place>". No new control and no CSS change: the meta line
   already wraps.
3. **D-49, the CSV.**
   - Two columns, `salary_kind` and `salary_ranges`, before `data_mode`. `data_mode` stays last (rows of demo data end
     in ",demo", which test/server.test.js and test/static-build.test.js read), and every other column keeps its place.
     Considered: after `salary_currency` (moves four columns), or after `data_mode` (breaks the ",demo" ending).
   - `salary_min/max` are the card's range: the span of the posting's same-currency rows for a range per place (as
     `payHeadline`), the minimum alone with an empty `salary_max` for a stated minimum, else the salary's min and max.
   - `salary_kind` follows the drawer caption's order (OTE, minimum, shift, part-time, fixed-term), then hourly or salary.
     Two that both hold are joined with "+": 69 Amazon reduced-time roles are part-time and include shift pay, and 2 are
     a stated minimum paid by the month for a fixed term. A single value would drop one of the two facts.
   - `salary_ranges` lists every posted row: levels (two or more) and every `salary.ranges` row, each in its own currency
     (Cohere's CAD and USD rows), "<level or place>: <min>-<max> <currency>", " | " between them. Rows tied to no listed
     place are listed too (the lead decision: every posted row is presented).
   - **README per site.** The main site's README keeps its sentence (Greenhouse, Ashby or Lever). The beta one says a
     big-tech file comes from the company's own careers site, names that site per file, and says big-tech pay is base
     pay only, with on-target earnings marked. Both explain `salary_kind` and say what changed on 2026-10-17.
   - The careers-site names live in scripts/build-static.js (`CAREERS_SITES`), not in server/export.js: export.js ships
     in the main site's `lib/`, and test/beta-build.test.js checks that no main-site file names a beta posting host (the
     first version failed it: "lib/export.js mentions the beta posting host apply.careers.microsoft.com").
4. **D-50, the cap.** `statedMax(job)`: a "Pay unclear" posting whose `salaryFlag.codes` are only `below_min` and
   `range_ratio` keeps its stated maximum (server/vet.js: those two checks say nothing about the top). Any other code
   (`above_max`, `hourly_high`, `junior_high`, `senior_low`, `min_gt_max`, `stat_outlier`) questions the top too, so no cap.
   `compstimateForJob` caps low, mid and high at it, rounded down to $1K, and keeps the figures before the cap.
   - The drawer's line reads "An estimate, capped at the posted maximum" (short forms "Capped at the posted maximum" and,
     at 280 px where that took two lines, "Capped at its maximum");
     Details: "Similar roles suggest about $473K ($330K–602K). The posting itself states up to $464K, a figure that passed
     our checks, so the estimate stops there."
   - Considered: only saying "the posting states up to $464K" beside an uncapped figure. Rejected: the drawer would still
     show a figure above what the employer says it pays at most, right under its "As parsed" line.
   - The backtest uses postings with pay only, so it never meets a cap.
5. **D-48, the words.** `payRank` also counts the same-country roles paid less and more (`below`, `above`). `rankText`
   says "The highest pay" / "The lowest pay" only when none pays more / less, "In the top 1%" / "In the lowest 1%" when
   the share rounds to 100% / 0% with roles still above / below, else "Pays more than N%". All roles paid the same: "The
   same pay as the rest of …". The line and its short form (fitOneLine) both use it; each is no longer than the "Pays
   more than 72% of …" line they replace.
6. **D-47.** renderViz hides `#chartHost` and `#mapHost` for `error`, `unknown` and a board with no roles. Both hosts are
   absolutely placed in `.viz`, so the message card keeps its size. The next board that loads unhides its host at the
   top of renderViz, and a changed list redraws it (`vizSig`); returning to the same board shows its chart as drawn.
   Loading keeps its opaque skeleton over the old chart, as before.
7. **UX-51 (added 2026-10-23), shift pay on the card.** `shiftRange(salary)` in app.js: a posting that states its base
   pay runs from that base to the posted rate ("$18.05–19.70/hour"), one posted figure with no base is "up to" it ("up
   to $19.70/hour"), and a posted range keeps both its ends.
   - The muted line under the pill (the `sal-sub` that "5 places" uses) reads "with top shift pay"; the tip is
     shiftTip's "The posted rate includes the highest shift differential." plus the stated base.
   - Considered: "up to" for a posted range too (Amazon's "26.90 - 28.90" rows). Rejected: it would drop the posted
     minimum ("present them as they are and not cut anything"), and the low end may be a shift rate as well.
   - Considered: the label in the pill ("$19.70/hour incl. shift"). Rejected: an abbreviation, and the pill must stay
     one short line at 280 px.
   - The drawer heading says the same figure, " an hour" for "/hour", as it already did for part-time pay.
   - The 5 shift postings with ranges per place keep the span and "N ranges" (D-39); their tip adds the shift note.
   - The CSV writes the same range (`salaryRange`): the stated base as `salary_min`, or `salary_min` empty for one
     figure. A unit test checks the CSV against app.js's own `shiftRange`, lifted from the source.
8. **MR-35 (added 2026-10-23).** `hourlyText` formats with `postedPair`, which keeps cents when a rate has them, so the
   tip and the pay block's Details read "Base pay starts at $18.05/hour" (it was "$18/hour"). Whole rates stay "$18/hour".
9. **UX-50 (added 2026-10-23).** Coloured by company (`colorBy() === 'brand'`), the card's `.card-dept` reads
   "YouTube · User Experience and Design", so the company-coloured dot sits beside the company's name.
   - In the same span, so the department still gives way first on a narrow card (UX-16) and no CSS changes.
   - Considered: the department colour for the dot under every grouping. Rejected: the dot is there to match the
     chart's legend, which colours by company in that grouping.
   - Location and Level colouring put the dot beside the department too. The review reported only Company; that is a
     follow-up (§6).

## 4. Replayable steps
1. `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp` (2c9f425: 1ef0646
   plus wip/ checkpoints only). Symlink `node_modules`, `data/snapshots` and `data/beta/snapshots` (wt-data2).
2. Copy test/e2e/beta-desktop-qa-4.e2e.js from the QA worktree and register it in scripts/e2e.js.
3. Base build: `node scripts/build-static.js --out <scratch>/fqa4/dist-before`; base copy:
   `git archive eccdca9 public server scripts test docs package.json` into `<scratch>/fqa4/base`.
4. Phone smoke before and after: `NODE_PATH=<scratch>/pw/node_modules node test/e2e/webkit/phone-smoke.mjs --dist <dist>
   --sizes all --engines chromium` (`<scratch>/fqa4/smoke.sh <dist> <label>`).
5. Numbers (`<scratch>/fqa4/`): `d52.mjs <base> . <dist> bt` (estimates and the 15 backtests, base modules vs head),
   `csvcount.mjs <dist-before> dist .` (D-49), `d50.mjs <base> . dist`, `d48.mjs . dist amazon`, `flags.mjs`, `survey.mjs`.
6. Unit tests: `node --test test/fix-qa4.test.js`; red on the base: copy it into `<scratch>/fqa4/base/test/` and run there.
7. Build `node scripts/build-static.js`; e2e: `NODE_PATH=… CHROMIUM_PATH=… node scripts/e2e.js --grep=<group>`
   (`<scratch>/fqa4/e2e.sh <label> <grep> [dist]`); `FQA4_SHOTS=after` (or `before` with `BETA_QA_DIST=<dist-before>`)
   saves screenshots to docs/screenshots/fix-qa4/.
8. Clean `npm test`: `git worktree add --detach <scratch>/fqa4/clean <sha>`, link `node_modules`, then
   `MELON_BETA_SNAPSHOT_DIR= timeout 1200 npm test` (`<scratch>/fqa4/npmtest.sh <label>`).

## 5. Verification
Numbers are from the 2026-10-16 crawl. "Before" is eccdca9 (1ef0646's code) on its build `<scratch>/fqa4/dist-before`;
"after" is this lane's code on its build `dist/`.

| Finding | Before | After |
|---|---|---|
| D-52 Apple "Software Engineer" in Cupertino (Insights, any level) | 37 comparables, mid $215K ($177K–278K), High | 274, all with Cupertino pay; mid $214K ($150K–278K), High |
| D-52 Microsoft "Software Engineer" in Redmond | 77 (multi-place postings only; the top 5 all Staff+), mid $188K ($143K–235K), High | 328, mid $177K ($120K–235K), Medium |
| D-52 Amazon "Software Development Engineer" in Seattle | 64, mid $169K ($144K–198K) | 438, mid $169K ($144K–198K) |
| D-52 Amazon SDE in New York | 39, mid $186K | 104, mid $186K ($158K–218K) |
| D-52 Microsoft "Software Engineer" in New York (V-40's case) | 16, mid $231K ($188K–275K) | the same 16, $231K; each listed at its New York row ("Posted for New York · …", $160K–261K, not the U.S. headline) |
| D-52 main-site boards and Google (one range for many places), e.g. Anthropic and OpenAI "Software Engineer" in San Francisco | 178 / 275 | 178 / 275 (unchanged) |
| D-49 Amazon minimums written as an exact figure (min = max) | 285 | 0: `salary_max` empty, `salary_kind` minimum (283 minimum, 2 minimum+fixed-term) |
| D-49 per-place postings whose CSV range was one place's row, unnamed | 2,201 Amazon + 255 Microsoft (min/max differ from the card's span) | 0: the card's span, and every row in `salary_ranges` (2,260 Amazon, 391 Apple, 394 Microsoft rows columns) |
| D-49 amazon:10371179 | 82700,117100 (Bellevue's row) | 60200,128800, "New York: 73600-128800 USD \| Nashville: 60200-105400 USD \| Irving, Arlington: 66900-117100 USD \| Bellevue: 82700-117100 USD" |
| D-49 on-target earnings read as base pay | 41 NVIDIA, 47 Anthropic | `salary_kind` ote (nvidia:893395123425 also lists its Level 5 and 6 ranges) |
| D-49 shift pay, part-time, two-level spans unmarked | 636 Amazon shift (69 part-time too), 876+ NVIDIA level spans | `shift` 567, `shift+part-time` 69, `part-time` 14 (Amazon) and 40 (Apple); levels in `salary_ranges` for 887 NVIDIA, 158 Microsoft, 8 Google |
| D-49 beta README | "(Greenhouse, Ashby or Lever)" for every row; "posted BASE pay … Equity and bonus excluded" | each file's source (e.g. "Amazon Jobs (amazon.jobs): the site's own search API (search.json)"); "Big-tech pay is base pay only"; on-target earnings marked |
| D-49 rows per CSV | 22,179 Amazon … (every posting) | the same, every posting and every column kept |
| D-50 "Pay unclear" estimates above the posting's own maximum | 2: netflix:790298021069 about $473K ($330K–602K) under "$71,040.00 - $464,000.00"; anduril:5078772007 about $193K ($166K–222K) under "12,600–167,000 USD" | 0: about $464K ($330K–464K), about $167K ($166K–167K), "An estimate, capped at the posted maximum"; Details give the figure before the cap |
| D-50 the other 6 "Pay unclear" postings | estimates under their maximum, or `hourly_high` (Scale AI, the maximum itself failed) | unchanged |
| D-48 Amazon base-pay roles the drawer would call "The highest pay" / "The lowest pay" (`d48.mjs`, the base-pay pool) | 67 / 80 | 8 / 10 (none paid more / less in their country); "In the top 1%" 63, "In the lowest 1%" 70 |
| D-48 amazon:10389713 ($229K–309K, 45 roles above) | "The highest pay of Amazon’s roles in the US" | "In the top 1% of Amazon’s roles in the US" |
| D-47 `#c=tesla` after Netflix; Apple failing after Google | the previous chart drawn, faded, behind the message, in the accessibility tree | `#chartHost` and `#mapHost` hidden; back on Netflix the chart is drawn again |

**UX-51, MR-35 and UX-50** (2026-10-23; before is dcebc6a's build, after is 6185ba3's):

| Finding | Before | After |
|---|---|---|
| UX-51 amazon:10409027 (posted $19.70 an hour including the top shift differential; "Pay starts at $18.05 per hour") | card "$19.70/hour", tip "Part-time, paid by the hour: $19.70 an hour (…)", no label | "$18.05–19.70/hour", "with top shift pay" under it; tip "Part-time, paid by the hour. The posted rate includes the highest shift differential. Base pay starts at $18.05/hour."; drawer heading "$18.05–19.70 an hour" |
| UX-51 amazon:10389108 (one posted rate, no base) | "$21.05/hour" | "up to $21.05/hour", "with top shift pay" |
| UX-51 Amazon's 636 shift-pay cards (`ux51count.mjs`) | no label on any card | 63 from the stated base, 191 "up to" one figure, 377 posted ranges as posted (all 631 with "with top shift pay"); the 5 with ranges per place keep their span and "N ranges", and their tip says it |
| UX-51 the CSV (Amazon) | 254 shift rows' `salary_min` not the card's (191 one figure written twice, 63 without the stated base) | the card's: `salary_min` empty for "up to", the stated base for the 63; rows whose numbers changed since 1ef0646: 2,486 to 2,740 |
| MR-35 the stated base in the tip and the pay block's Details | "Base pay starts at $18/hour" | "Base pay starts at $18.05/hour" |
| UX-50 Google, Group by Company: the dot's colour and the name beside it | YouTube orange beside "User Experience and Design"; Google blue beside "No department" | "YouTube · User Experience and Design", "Google · No department"; grouped by department, the card names the department alone, as before |

Tests (2026-10-23):
- test/fix-qa4.test.js: 4 new tests (UX-51 ×3, UX-50), all red on dcebc6a (`<scratch>/fqa4/base2`), green on 6185ba3. 18 of 18 pass.
- test/beta-methodology-2.test.js MR-35 is a plain test (`FIXED`): red on dcebc6a (the clean checkout), green on 6185ba3.
- test/e2e/fix-qa4.e2e.js: 21 new checks ([UX-51] on the desktop, [UX-50], and [UX-51] at each of the 19 sizes): 21 of 21
  red on dcebc6a's build, for the reasons in their titles (the pill read "$19.70/hour" and "$21.05/hour", no line under
  it, no shift note in the tip; Google's cards named the department beside the company's dot).
- test/salary-audit.test.js lifts payPill from app.js with its helpers; it now lifts `shiftRange` and the shift text too
  (15edb5c). The first clean `npm test` at 40a11f2 failed its SA-1 and SA-6 ("shiftRange is not defined").
- Clean `npm test` at 15edb5c: 1,256 tests, 1,204 pass, 0 fail.

- e2e on 6185ba3's build (load 6 to 21, the lead's gate running too): test/e2e/fix-qa4.e2e.js 63 of 63 (the first run's
  browser hung after 9 checks under load; the other 54 passed on a re-run). The card, drawer, fix-phone-text,
  google-grouping and fix-density groups: 191 of 195, 1 skip. The 3 failures fail on 1ef0646's build too and belong to
  the chart and phone lanes: Beta desktop QA 3 [D-43] (chart range ends in the millions), Beta viz review 2 [V-41] (the
  Ranges tooltip of a minimum and of shift pay) and Beta UX review 2 [UX-39] (the phone preview's first screen).
- Screenshots: before-/after-UX-51-amazon-shift-base-card, -280x653, -390x844 and before-/after-UX-50-google-company-cards.
  At 280 px the pill wraps under the title, as every card's does there, and the line under it keeps its right alignment.

**Compstimate backtest** (seeded, 500 postings, `dedupe: "role"`; median error, within 10%), from the build lines:

| Board | Before | After |
|---|---|---|
| Amazon | 10.0%, 50.1% | 9.6%, 52.5% |
| Apple | 13.4%, 41.5% | 12.9%, 41.7% |
| Microsoft | 7.7%, 57.2% | 8.4%, 56.8% |
| Google, Meta, Netflix, NVIDIA, and the 8 main-site boards | (Google 12.4%, Meta 14.8%, Netflix 15.0%, NVIDIA 12.5%, Anthropic 13.1%, Anduril 12.4%, OpenAI 10.1%, Scale AI 11.9%, xAI 18.3%, Cohere 9.9%, Palantir 8.6%, Shield AI 15.6%) | unchanged, to the decimal |

- The published lines do not move: "±10%" Amazon, "±13%" Apple, "±8%" Microsoft (accuracyLine rounds). No product doc
  quotes these figures as claims.
- Microsoft's rise is Redmond (38 of the 41 drawn postings that got worse): before, a Redmond estimate used only the
  multi-place postings with a Redmond row (13 to 27 of them, wide IC level spans); now every Redmond posting with pay.
  Not taking the cut in Redmond at all (the trigger considered in §3.1) gives the same 8.4%.
- With the cut on every board (rejected, §3.1): Google 14.2%, Palantir 10.7%, Meta 15.4%, Netflix 15.7%, Anthropic 12.3%,
  Anduril 11.9%.

**Tests.**
- test/fix-qa4.test.js: 14 tests; 12 fail on eccdca9 (copied into `<scratch>/fqa4/base/test/`), the 2 others are guards
  (one-range boards unchanged, V-40 still holds). All 14 pass.
- QA round 4's group (test/e2e/beta-desktop-qa-4.e2e.js): on the before build 3 of 9 pass (the guards), [D-47] to [D-52]
  fail; on this build 8 of 9 pass: [D-47], [D-48], [D-49], [D-50], [D-52] and the 3 guards. [D-51] (the Ranges legend)
  is fix-viz-5's, not this lane's.
- test/e2e/fix-qa4.e2e.js: 42 checks (4 desktop, then [D-48] and [D-50] at each of the 19 sizes of
  test/e2e/phone-sizes.mjs, 14 phones and 5 postures, landscape included). All pass on this build. The first run failed [D-50] at 280 px: "Capped
  at the posted maximum" took two lines, so the line has a third, shorter form ("Capped at its maximum").
- Updated other lanes' tests for the new columns, same intent: test/export.test.js (the header and a row) and
  test/server.test.js (the header).
- Clean `npm test` (no data links) at c43ff33: 1,252 tests, 1,199 pass, 0 fail (8 skipped, 45 to-do). At 1a04bf5 it failed
  test/beta-build.test.js ("lib/export.js mentions the beta posting host apply.careers.microsoft.com"), fixed in 196922d.

**Screenshots** (docs/screenshots/fix-qa4/, 8-bit, 496 KB): `before-*` on the base build, `after-*` on this one.
- D-52: the Microsoft New York comparables. Before, they showed the U.S. headline ($120K–235K) although the estimate used
  the New York rows; after, $160K–261K, "Posted for New York".
- D-48: the rank line at 280x653 and 1114x720 (amazon #11: "The highest pay of …", now "In the top 1% of Amazon’s roles").
- D-50: netflix:790298021069 at 280x653, 390x844 and 1114x720 (about $473K, now about $464K, capped).
- D-47: #c=tesla after Netflix, the chart behind the message before and gone after; after, the map case as well.
- The phone smoke's "text cut" notes, before against after, differ only in the Amazon chart's department labels at some
  sizes ("Technical Project, Program and Product M"). Those belong to chart drawing (fix-viz-5), which this lane does
  not touch, and they move from run to run.

## 6. Known gaps and follow-ups
- UX-50's pattern under Group by Location and by Level: the dot takes the place's or the level's colour beside the
  department's name. Not reported; same fix if wanted (name the coloured key first).
- The Pay estimate's top five comparables are ordered by weight, then by date; for a level-less query many weights tie,
  so Microsoft "Software Engineer" in Redmond still lists four Principal roles first, although the estimate now uses all
  328 Redmond comparables (confidence Medium, it was High on 77).
- `salary_kind` "salary" includes an internship's yearly rate (Google's 13-week internships): the card calls it a yearly
  rate, so the CSV does; the term's length is not a column.

## 7. Change log
- 2026-10-17:
  - 11a107a: the brief. eccdca9: QA round 4's tests copied and registered.
  - 463c5c9: the five fixes. 1a04bf5: unit tests, the e2e group, per-file sources. 03860dc: CONTRACT, this log.
  - 196922d: the careers-site names moved to the build script (the main site's lib/ names no beta host).
  - c43ff33: D-50's third, shorter line for 280 px. 6a9ddc0: the numbers in this log (sent to the lead).
  - dcebc6a: the screenshots and the State (sent to the lead; integrated in its batch).
- 2026-10-23 (after the weekly limit): UX-51, MR-35 and UX-50, from the lead.
  - 6185ba3: the fixes, their unit tests (4 red on dcebc6a) and e2e checks (21 red on its build), CONTRACT, this log.
  - Next commit: MR-35 marked fixed in methodology-review-beta-2.md; numbers and screenshots.
