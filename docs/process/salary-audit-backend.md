# Process log: salary-audit-backend

## State
- **Done:**
  - SB-1, SB-3, SB-4, SB-5 and SB-6, plus SA-3, SA-4 and SA-7 from salary-audit-data; norm-11. Commits 193205a..594109d,
    which the lead has integrated.
  - The SB-7 client patch.
  - The before/after trace on the 2026-10-16 crawl.
- **Done too:** the before/after screenshots in `docs/screenshots/salary-audit-backend/`: 42 files, shrunk to 756 KB.
- **Next step:** none in this lane. The follow-ups in §6 belong to other lanes or need a lead decision.

## 1. Brief
- **Prompt:** [prompts/salary-audit-backend.md](prompts/salary-audit-backend.md) (verbatim).
- **The user (2026-10-11):** "Are you sure the salary range of the big tech are correct?! They don't look correct and
  kinda all span too evenly."
- **Goal:**
  - trace every beta salary (Amazon, Apple, Google, Meta, Microsoft, NVIDIA, Netflix) from the source adapter to the
    pixel;
  - find every place where the range a user sees can differ from what the company posted;
  - fix the backend.
- **Split with salary-audit-data:** it owns the statistical audit and the comparison with live postings, so its numbers
  on band shapes are not repeated here.
- **Owned:**
  - server/normalize.js, server/salary.js, server/vet.js, server/sources/*.js (not google.js);
  - the salary-carrying fields of scripts/snapshot.js and scripts/build-static.js;
  - test/salary-pipeline.test.js, this log and its prompt, docs/screenshots/salary-audit-backend/.

## 2. Inputs and sources
- **Docs read:**
  - README.md;
  - docs/CONTRACT.md: Raw job and Job; fix waves 3 to 5;
  - docs/DATA_SOURCES.md §7, §7a to §7g: the pay rules per board;
  - docs/METHODOLOGY_GUIDE.md;
  - docs/process/PLAYBOOK.md, docs/process/TEMPLATE.md;
  - docs/process/fix5-data.md (norm-10 and its patches), vetting-beta-2.md, data-check-beta-3.md.
- **Code traced, stage by stage (§3 says which fields carry pay at each stage):**
  - adapters: server/sources/amazon.js (`amazonPayTable`, `amazonSalary`, `rowNames`), apple.js (`spanPay`,
    `mapCopies`), meta.js, eightfold.js, upgrade.js (`upgradeAmazonJob`);
  - normalization: server/normalize.js (`deriveSalary`, `relabelJobs`, `rederiveTextSalary`) and server/salary.js
    (`parseSalary`, `toJobSalary`, `annualize`, the FX table);
  - the gate: server/vet.js (`salaryChecks`, `vetSalaries`) and scripts/build-static.js `betaGate`;
  - snapshot fitting and packing:
    - scripts/snapshot.js (`fitSnapshot`, `trimDescription`);
    - scripts/build-static.js (`readSnapshot`, `packList`, `splitPayload` and its round-trip guard);
    - public/api.js `unpackJobs`, public/unpack-worker.js;
  - client:
    - public/app.js (`money`, `moneyRange`, `salaryRange`, `payPill`, `payRanges`, `pickedRange`, `payLabels`, the
      drawer pay block);
    - public/features/shared.js `payLocations`;
    - public/viz/chart.js (`chartPay`, `spanTiers`, the clusters binning, `robustBounds`);
  - Juice: server/juice.js `attachJuice` (`placeUSD`, `postedPlaceSet`).
- **Data:** the 2026-10-16 crawl (wt-data2), with Amazon uncapped at 22,179 postings, all snapshots at norm-9. The
  2026-10-11 crawl was used for the first pass.
- **From salary-audit-data:** SA-3, SA-4 and SA-7, with evidence and patches. Its findings.json and
  test/salary-audit.test.js are in its lane.

## 3. Decisions and rationale

### The pipeline, and where pay can change
| Stage | Pay fields | Can it change the range? | Found |
|---|---|---|---|
| Adapter | Amazon per-place table rows; Apple footers per place (`spanPay`: span plus `ranges`); Meta `public_compensation`; Eightfold text | Amazon: row choice, rows tied to places, a cap of 12 rows, virtual rows dropped; Apple: span over places | SB-3, SB-4, SB-6 |
| `deriveSalary` / `parseSalary` | min, max (annualized: hour ×2080, month ×12), levels, ranges, zones, country | level and country-line spans (min of mins to max of maxes, ≤4×), the SF Bay Area / NYC choice, the currency pick, the 12-range cap | SB-3, SB-5, SA-4 |
| Stored-snapshot upgrade | relocateJobs (text pay re-derived), upgradeAmazonJobs (table re-read) | trimmed descriptions lose rows or the pay sentence | SB-1, SA-7 |
| Gate (vet.js, betaGate) | quarantine: salary null + salaryFlag | only quarantines, never changes numbers; 1 Google and 1 Netflix posting are quarantined and shown as "Pay unclear" | none |
| Snapshot fit | descriptionHtml trimmed to 800 to 6,000 characters | pay paragraphs after the first 4 were cut | SB-2 (perf lane) |
| Pack / unpack | salary tuple + dict refs | none: the round trip is exact (guarded at build time; 0 differences in the trace) | none |
| Card (app.js) | `payPill`: salaryRange, "· N places", term and hourly forms | K/M rounding; claims a span that isn't one; a minimum shown as a range; level spans not named | SB-7 and the client patches (§6) |
| Chart | `chartPay`: lo, hi, mid in approx USD; clusters bin midpoints | 0 differences from the served salary; under a Location filter it ignored the place's own range (salary-audit-data SA-5) | none of mine |
| Juice | salary.mid, or the place's own range (`placeUSD`) | a place whose range had no place key was scored on the primary row | fixed by SB-1, SB-4, SB-5 |

### Findings and fixes
1. **SB-1 (High), server/sources/upgrade.js `upgradeAmazonJob`.**
   - Problem: a stored description trimmed to fit the snapshot could keep the salary's own row and lose other rows.
     The upgrade re-read only the trimmed table, so it dropped those posted rows, and the places they priced were
     served with no posted pay.
   - Fix: every stored row (salary.ranges, kept whole by the adapter) that the trimmed table lacks is added back. A row
     matches when it has the same city and the same yearly figures; a range stored yearly matches its hourly row.
   - Alternative rejected: the VT-22 branch (a full rebuild from ranges) only when the primary row is missing. That
     was the old behaviour.
2. **SB-2 (High), scripts/snapshot.js `trimDescription`.** The root cause of SB-1 for new crawls: it kept 4 pay
   paragraphs. Fixed by docs/process/patches/fix5-data-trim.diff (VT-22), which perf-mobile-beta-2 owns and applied in
   161a472. Its SA-7 hunk (`£ € zł`, "pay rate", "per hour" in PAY_HINT_RE) is in 25efed6. I did not edit snapshot.js.
3. **SB-3 = SA-3 (Medium), `amazonSalary` and `deriveSalary`.** `slice(0, 12)` cut every range after the twelfth.
   Both caps are removed. A range is about 80 bytes and Amazon's most is 14 distinct rows, so the list size is not a
   reason to cut pay (user rule: never cut pay rows).
4. **SB-4 (Medium), amazon.js `rowNames` and the primary pick.** The table spells some places differently from the
   posting's locations: "New York City" for "New York", "N.Reading" for "North Reading", "Westboro" for "Westborough",
   "Hazle Township" for "Hazle Twp", and the typo "San Franscisco". Each pair was seen on the 2026-10-16 board. A
   whole-name alias table (`ROW_CITY_ALIAS`) is used, so no fuzzy match can tie "York, PA" to "New York".
5. **SB-5 (Medium), salary.js `parseSalary` (`cityRange`) and normalize.js `withAreaRanges`.**
   - Problem: Microsoft posts a national range and a second range for the SF Bay Area and NYC. DQ-13 uses the second
     range only when every US place is in those areas. For a job with places on both sides, the area range was
     dropped, so its New York or San Francisco place was scored, filtered and shown on the national range.
   - Fix: both posted ranges are kept as `salary.ranges`, each with its places, as Apple's and Amazon's are. The area
     range is spanned over the same levels as the national salary.
   - Unchanged: `salary.min`/`max` stay the national range (§7a), so the headline and the chart's point don't move.
     Only Juice, the Location filter and the drawer's "Pay by place" line gain the area range.
6. **SB-6 (Low), amazon.js `amazonSalary` (the DQ-41 rule).**
   - DQ-41 drops a "Virtual Location - <state>" row for a state the posting lists no place in.
   - Problem: a posting that also lists "Remote, United States" lost those rows, though they are the pay of its remote
     hires (amazon:10514229).
   - Fix: such a posting keeps them, tied to its Remote place. A posting with no Remote place still drops them, so
     DQ-41 holds where it was meant.
7. **SA-4 (Low), salary.js.**
   - Google degree lines: salary-audit-data's hunk (`lineBracket`) makes "[Bachelor's degree]" a level.
   - Microsoft: I added `NATIONAL_LEVEL_RE`. A level paragraph that follows a pay link has no sentence break before its
     "IC5 - The typical …", so it lost its level. Now the last level code before "- The typical" names it.
   - Left as it is: NVIDIA 893397830858's five unlabelled lines. Inventing labels would make the drawer say "These are
     NVIDIA's own level names".
8. **SA-7 (Low), normalize.js `rederiveTextSalary`.** salary-audit-data's hunk: when the stored text carries the trim
   marker and no pay is read from it, the stored salary is kept, never erased (amazon:SF240111667, £12.70 an hour).
9. **SB-7 (Low, client), app.js `moneyRange` / `salaryRange`. Patch: docs/process/patches/salary-audit-backend-client.diff.**
   - Problem: a range end in the millions had one decimal. Netflix's posted $600,000–$1,066,000 read "$600K–1.1M", and
     Google's SEK 1,000,000–1,030,000 read "SEK 1.0M", one number for a range.
   - Fix: two decimals between 1M and 10M (`rangeEnd`). The lead applied it, with its test un-todo'd.
10. **norm-11.**
    - Golden test: 0 of the 300 hashes changed; the version changed only. The sample comes from the stable boards,
        which have no Amazon pay tables, no Microsoft area ranges and no bracketed degree lines.
    - The version asserts in fix-beta-pay and fix-pay-data, and the refresh fixtures (acme, globex, make-fixtures), were
        moved to norm-11, as in fix wave 5.

### "Too even"
- **The pipeline does not flatten or synthesize ranges.** Every shown end is a figure from the posting (§5).
- **Companies post fixed-ratio bands, the same band for many roles at a level.** salary-audit-data measured the
  max/min ratio: Google 1.45× on about 66% of postings, Amazon 1.35×, Microsoft about 1.95×, NVIDIA 1.94×, Meta about
  1.40×. The ranges view therefore shows runs of identical bars. That is the posted data.
- **The clusters view draws one circle per fixed-width bin, at the bin's centre** ($50K at desktop width, `BIN_STEPS`
  and `MIN_BIN_PX`). The circles are evenly spaced whatever the data, and only their size carries the distribution.
  The real shape, with its spikes at the common bands, is the thin histogram strip above the axis (see the
  screenshots). This is a design choice of the viz lane, not a data error. A suggestion for that lane is in §6.

## 4. Replayable steps
1. `git checkout 2474fc4`. Symlink `data/beta/snapshots` and `data/snapshots` to wt-data2, and `node_modules`.
2. Baseline: `git archive 2474fc4 | tar -x -C <scratch>/sab/base`, with the same data links, then
   `node scripts/build-static.js --out <scratch>/sab/dist-before`. The build takes 3 minutes; Amazon's list is
   10.9 MB, with 22,179 desc files.
3. After: `git archive HEAD | tar -x -C <scratch>/sab/after`. Apply to public/ the client patches in order:
   fix5-data-display, salary-audit-data-card-levels, salary-audit-backend-client and salary-audit-data-chart. Then
   build to `<scratch>/sab/dist-after`.
4. Trace: `node <scratch>/sab/trace.mjs <code root> <dist> <out.json>`. It loads app.js's pay functions unchanged
   (source slices in a vm, `<scratch>/sab/appfns.mjs`) and imports api.js, chart.js and juice.js. Helper scripts:
   - `amzrows.mjs`: rows lost on serve;
   - `untied.mjs`: ranges tied to no place;
   - `virt.mjs`: virtual rows;
   - `msarea.mjs`: Microsoft area jobs;
   - `pills.mjs`: pills that don't say what the range is.
5. Tests: `node --test test/salary-pipeline.test.js`, and the full `MELON_BETA_SNAPSHOT_DIR= node --test test/*.test.js`
   with the data links removed.
6. Screenshots: `node scripts/cycle/serve.mjs --dist <dist> --pid <pid>`, then
   `NODE_PATH=<scratch>/pw/node_modules node <scratch>/sab/shots.cjs <url> <out> before|after`. Shrink them with
   `bash scripts/cycle/shrink-screenshots.sh`. Stop each server with `kill "$(cat <pid>)"`.

## 5. Verification

### Shown = posted, per board (2026-10-16 crawl, after)
Each served min and max (de-annualized to the posted unit) was matched to a money figure in the served description or
the salary's own quoted text.

| Board | With pay | Both ends posted | Spans over levels or places (labelled) | Card ≠ salary beyond rounding | Chart ≠ salary |
|---|---:|---:|---:|---:|---:|
| Amazon | 13,980 | 13,977 (3 Austria figures, by design) | 2,260 places | 0 | 0 |
| Apple | 2,781 | 2,781 | 391 places | 0 | 0 |
| Google | 2,512 | 2,512 | 8 levels (degree lines) | 0 | 0 |
| Meta | 948 | 948 | 0 | 0 | 0 |
| Microsoft | 1,566 | 1,566 | 158 levels, 236 places (SB-5) | 0 | 0 |
| NVIDIA | 1,462 | 1,462 | 887 levels | 0 | 0 |
| Netflix | 259 | 259 (2 missed only by the checker's regex) | 0 | 0 | 0 |

### Before → after (2026-10-16 crawl)
| Measure | Before | After |
|---|---:|---:|
| Amazon: stored posted rows lost on serve (SB-1) | 156 rows in 145 postings (69 with a place left unpriced) | 0 |
| Amazon: postings with exactly 12 stored ranges (SB-3; the stored loss stays until the next crawl) | 57 (19 without their own row) | the cap is gone |
| Amazon: ranges tied to no place (SB-4) | 35 | 17 (rows for places the posting doesn't list) |
| Amazon: a Juice place scored on another place's row | 36 | 7 |
| Amazon: virtual rows lost on postings with a Remote place (SB-6) | 10 ranges in 8 postings | 0 |
| Amazon: salary erased by trimming (SA-7) | 1 | 0 |
| Microsoft: postings keeping the SF Bay Area / NYC range per place (SB-5) | 0 of 258 | 236 (22 have no geocoded area place) |
| Google and Microsoft: degree or level lines kept as levels (SA-4) | 0 | 9 |
| Cards off by more than 2% from millions rounding (SB-7) | 27 | 0 |
| Amazon "· N places" pills that aren't the span (fix5-data-display) | 2,123 | 0 |
| Amazon minimums shown as a range (fix5-data-display) | 285 | 2 (fixed-term monthly) |
| Level spans not named on the card (card-levels) | 1,044 | 18 (11 NVIDIA OTE, 7 Google internships) |

### Tests
- `test/salary-pipeline.test.js`: 11 tests (SB-1, SB-3, SB-4 ×2, SB-5 ×2, SB-6, SA-4 Microsoft, SB-7, the chart
  reference, the version). On the base, 9 of them fail; the chart reference passes there. All pass on HEAD; SB-7
  passes with the client patch.
- salary-audit-data's test/salary-audit.test.js on my server/: SA-3, SA-4 and SA-7 pass.
- Full `MELON_BETA_SNAPSHOT_DIR= node --test test/*.test.js`, no data links, at 594109d: 1,062 tests, 1,015 pass,
  0 fail, 40 to-do, 7 skipped. The lead's integrated batch: 1,098 tests, 0 fail.

### Screenshots
`docs/screenshots/salary-audit-backend/{before,after}-<board>-{clusters,ranges}-desktop.png` (1440×900, the chart
area) and `…-clusters-phone.png` (390×844).

## 6. Known gaps and follow-ups
- **Client, small leftovers after the patches:**
  - 2 Amazon fixed-term monthly minimums, and 11 NVIDIA OTE and 7 Google internship level spans: payPill's term and
    OTE branches return before the minimum and levels branches;
  - "These are Google's own level names" reads oddly for degree lines.
- **Viz lane:** the clusters view's evenly spaced circles make any board look even. A suggestion: show the distribution
  strip larger, or size the bins by the data. Also, in the ranges view a range past the axis end is cut at the edge,
  with "›" (after-amazon-ranges-desktop.png: "Director, HW Engineering" $287K–350K is drawn from $290K to the $300K
  edge). The ranges view's stripes and notes line ("2,260 striped: one posting's range over several levels or places")
  also count Amazon postings, whose bar is the posting's own row, not a span. salary-audit-data's chart patch fixes the
  tip, not the stripe.
- **Amazon:**
  - 7 postings still score a place on the primary row: the posting lists a place with no row while other rows match
    no place. The honest answer would be "no posted pay here", but that needs a rule for untied rows. Lead decision.
  - A row rebuilt from stored ranges gets a synthesized `salary.text` ("USA, CA, Cupertino - 183000 - 247600 USD
    year"). It is shown only in the drawer's fixed-term and "Pay unclear" lines.
- **Stored losses:** the 2026-10-16 snapshots were crawled with the norm-9 adapter (12-range cap, 4 trimmed pay
  paragraphs). Rows lost at crawl time come back only with the next crawl run on norm-11 and 161a472.

## 7. Change log
- 2026-10-11: first trace on the 2026-10-11 crawl; the findings drafted.
- 2026-10-16: resumed after the usage limit on 2474fc4 and the 2026-10-16 crawl. Commits 193205a (SB-1, SB-3,
  SB-4, SB-5, norm-11), 8262aa3 (re-baseline), 9b8ab7a (SA-4, SA-7), 50de7fe (SB-4 spellings), e80a63e (SB-6),
  594109d (SB-7 patch). The lead integrated them. Then this log and the screenshots.
