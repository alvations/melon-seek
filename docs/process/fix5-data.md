# Process log: fix5-data

## 0. Message to the lead (DQ-38, sent first)

Sent with SendMessage to the main conversation as soon as DQ-38 was committed (98bb213, integrated by the
lead as e951e91):

> **To: lead. From: fix5-data. DQ-38 is fixed; the uncapped Amazon crawl can start once this commit is integrated.**
> - `server/history.js` `updateLedger`:
>   1. A listed id the ledger has never seen gets an entry on the run that lists it (`u: 1`, not served by
>      `compactLedger`), so a posting the cap left out keeps that first-seen date.
>   2. After a partial run, a new id whose `postedAt` is not after that run takes its `postedAt` as
>      `firstSeenAt`, clamped to the ledger's first and previous runs (`b: 1`). "Partial" comes from the
>      ledger's new `partial` flag, or from `opts.previousPartial` for today's ledgers, which predate the flag.
>   3. A posting posted after the capped run is still new. A posting with no `postedAt` is first seen now.
> - `.github/scripts/beta-snapshots.mjs` `merge` reads the snapshot it is about to replace before
>   overwriting it (`previousRunOf`: capped or a short list counts as partial). It passes the result as
>   `crawl.previous`, which `closureOptions` turns into `previousPartial`.
> - `scripts/snapshot.js` `recordPublished` is unchanged because it already forwards `crawl`, so the
>   performance lane needs no patch.
> - Proof:
>   - 4 tests in `test/beta-data-check-3.test.js`: the old to-do (now a plain test), the legacy-ledger case,
>     the real `merge` command on a capped artifact, and the compact form.
>   - On today's Amazon snapshot I simulated a capped run of the newest 2,000 of 5,000, then a full run.
>     Before the fix, 3,000 of the 3,000 hidden postings show as "New". After it, 0 do, with a legacy
>     ledger or a fixed one.

The lead then removed the cap (0b8413d) and rebased the closures test onto the uncapped world (e48fd32). I
rebased the rest of this lane onto e48fd32.

## 1. Brief
- **Prompt:** [`docs/process/prompts/fix5-data.md`](prompts/fix5-data.md) (verbatim).
- **Goal:** fix wave 5, data lane. The findings are:
  - DQ-33 to DQ-43 and the DQ-6 residue, from [data-check-beta-3.md](data-check-beta-3.md);
  - VT-7, VT-8, VT-10 and VT-14 to VT-25, from [vetting-beta-2.md](vetting-beta-2.md) and
    [the summary](../../data/vetting/2026-10-11-beta-2/summary.md).
- **Rule:** the user's "we must present them as they are and not cut anything", with the lead's decisions in
  [lead.md](lead.md) "Beta round 3".
- **Owned:**
  - `server/**` (except `server/index.js`), `public/features/shared.js`;
  - `scripts/vet-salaries.js`, `scripts/llm-vet.js`, `.github/scripts/beta-snapshots.mjs`;
  - `data/cities.json`;
  - the finding tests and `test/fixtures/**`;
  - the CONTRACT, VETTING, DATA_SOURCES and LIVABILITY docs.

## 2. Inputs and sources
- **Findings:**
  - `docs/process/data-check-beta-3.md`, `test/beta-data-check-3.test.js`;
  - `docs/process/vetting-beta-2.md`, `data/vetting/2026-10-11-beta-2/summary.md` (with gate-study.mjs),
    `test/beta-vetting-2.test.js`, `test/beta-vetting.test.js` (VT-8);
  - `docs/process/lead.md` "Beta round 3" (the decisions).
- **Code read:**
  - `server/history.js`, `.github/scripts/beta-snapshots.mjs`, `scripts/snapshot.js` (`recordPublished`,
    `trimDescription`), `scripts/history.js`;
  - `server/sources/amazon.js`, `server/sources/apple.js` (`mapCopies`, `spanPay`: the model for per-place
    ranges), `server/sources/meta.js`, `server/sources/upgrade.js`;
  - `server/normalize.js`, `server/salary.js`, `server/vet.js`, `server/keywords.js`, `server/geo.js`,
    `server/juice.js` (`attachJuice`, `matchCity`);
  - `public/features/shared.js` (`payLocations`), `public/app.js` (`payPill`, `payRanges`, `payLabels`,
    the drawer pay block);
  - `scripts/vet-salaries.js`, `scripts/llm-vet.js`;
  - `docs/LIVABILITY.md`, `docs/process/scripts/livability-build-cities.mjs`.
- **External:** Mexico's 2026 minimum wage, MXN 315.04 a day in the general zone. CONASAMI approved it on
  2025-12-03, in force from 2026-01-01. Sources: [EY Law Flash "Incremento salarios mínimos 2026"](https://www.ey.com/content/dam/ey-unified-site/ey-com/es-mx/technical/tax/documents/ey-law-flash-incremento-salarios-minimos-2026.pdf),
  [México Cómo Vamos](https://mexicocomovamos.mx/wp-content/uploads/2025/12/InfografiaMCV_SalarioMinimo_2026.pdf),
  [El Financiero](https://www.elfinanciero.com.mx/economia/2025/11/18/salario-minimo-2026-de-cuanto-es-la-propuesta-para-el-incremento/).
  I also searched for Numbeo figures for Jersey City. No usable Numbeo figure came back (only secondary
  guides), so I wrote no new city record (§3, decision 9).

## 3. Decisions and rationale
1. **DQ-38: date hidden postings by `postedAt`, not by making the run a baseline.** A baseline (every new
   id treated as not new) would also hide the postings that really are new on the uncapped crawl. Amazon
   gives a posted date for every posting, so only postings posted before the capped run are dated back. The
   date is clamped to `[since, previous run]`, so the ledger never claims a posting it could not have seen.
   The browser's `fromCompact` takes `since` from the earliest `firstSeenAt`, so the clamp also keeps
   `since` right.
2. **DQ-38: listed-only entries are kept in the ledger file but not served** (`u: 1`). `api/history`
   therefore does not grow by the ids a cap leaves out.
3. **DQ-33 / VT-15: Amazon rows are tied to places the way Apple's are.**
   - Each table row is matched to the posting's location strings (city and state compared whole, through
     `geocode`).
   - `ranges[]` are yearly and carry `locations`, and identical rows are grouped into one range.
   - The salary stays the primary location's row, as in DATA_SOURCES §7a and the pinned test.
   - When one range covers only some of the posting's places, `payPlaces` is set (the DQ-27 rule): places
     with no row show no posted pay.
4. **DQ-41: virtual rows.** A "Virtual Location - <state>" row is dropped only when the posting lists
   places with a state and none in that state. A remote-only posting keeps every virtual row, so its pay is
   not cut.
5. **Stored snapshots: rebuilt from what is stored.** Snapshots keep jobs, not raw rows, so
   `upgradeAmazonJobs` reads the stored table again. The stored `salary.text` (the primary row) stays the
   salary. When trimming cut rows (VT-22), the table is rebuilt from the stored `salary.ranges` instead,
   because the adapter kept every row there. Meta gets `salary.country` from the "(IT)" tag.
6. **VT-17 / VT-19 / VT-18 / VT-7 / VT-10 / VT-8:** each follows the lead's decision exactly.
   - VT-17: `kind: 'minimum'`, never hidden.
   - VT-19: the stated annual figure when the monthly row is within 11.5–14.5 payments of it. Both Austria
     postings say it is the *minimum basic salary*, so they are `kind: 'minimum'` too.
   - VT-18: the posted figure stays, with `includesShiftDifferential` and `statedBase` ("Pay starts at $X
     per hour" or "starting pay … is up to $X/hour", when it is below the table's top).
   - VT-7: cash compensation split into base and variable is `kind: 'ote'`. A total-compensation range is
     still null.
   - VT-10: `MAX_ANNUAL` is $1.5M in both the parser and the gate.
   - VT-8: on Microsoft, the IC/M level in the pay sentence beats the title (not for interns).
7. **VT-14 / DQ-35: a legal-minimum floor.** A correct Mexican salary (MXN 12,569 a month, about US$8,700
   a year) is under the parser's US$10K floor and the gate's US$15K full-time floor. Without a change it
   would be cut or quarantined. `LEGAL_MIN_ANNUAL` holds Mexico's 2026 legal minimum, MXN 315.04 × 365 =
   114,990, and a salary at or above it passes both floors. No other currency needs one: the AUD, NZD, SGD
   and HKD minimum wages are above US$10K a year.
8. **VT-16 / DQ-6 residue: compare low pay within its currency.**
   - A `cur:<code>` group joins the comparison groups when it has at least `MIN_GROUP` (8) members, as the
     vetting recommended.
   - That alone does not protect a lone RON range: the DQ-6 test has 1 RON salary among 40 US ones. So a
     low-side flag in a minority currency also needs its own currency group.
   - Gross low errors are still caught by the $15K floor and the 4× ratio (tested).
9. **DQ-34: proxies only within the same state, and no invented figures.**
   - The tax model is per state, and `matchCity` already requires the region. A Jersey City → New York
     proxy would apply New York and NYC taxes, so it was not added.
   - The 20 proxies added are towns in a sourced record's metro area, in the same state (LIVABILITY.md
     "Proxies" lists them).
   - Towns without a same-state metro record, and cities without a record, are listed there as still
     without Juice. Each needs a sourced record (Numbeo plus HUD, §4 of LIVABILITY.md), which I could not
     source here.
10. **Level edits are narrow.**
    - An executive word counts only when it is not in the team name after the role (the part after the
        first comma or " - "), when the role part names its own role noun.
    - "Data Center Chief Engineer" is a facilities rung.
    - Meta "(Technical Leadership)" and "(Leadership)" are Staff+ on Meta only.
    - Off Amazon, Microsoft and Meta, 10 titles change on the real boards (Apple 2, Google 6, NVIDIA,
      Netflix and Anduril 0), all exec words in a team name: "Senior Information Security Engineer, Cloud
      CISO …" Director+ → Senior; "Staff Security Engineer, …, Cloud CISO" → Staff+.
11. **The VT-22 and display fixes are patches**, because the files belong to other lanes. The data is
    correct without them; the patches only change how the app shows it.

## 4. Replayable steps
1. `git checkout --detach 3f9385c`. Symlink `node_modules`, `data/snapshots` and `data/beta/snapshots` from
   /home/user/melon-seek. After the lead's message, rebase onto e48fd32.
2. Baseline: `MELON_BETA_SNAPSHOT_DIR=<empty> node --test test/*.test.js`. Result: 1,047 tests, 983 pass,
   2 fail (S-6, which lives in `server/index.js` and is not this lane's; PERF-1 timing), 62 to-do.
3. Before/after numbers: `node <scratch>/measure.mjs <code root> <worktree>`. It builds the served lists
   exactly as `scripts/build-static.js#readSnapshot` does, then runs `attachJuice`. It ran on `git archive
   e48fd32` (before) and on this worktree (after).
4. Vet scan: `node scripts/vet-salaries.js data/beta/snapshots/{amazon,meta,apple,google,nvidia,microsoft,netflix}.json data/snapshots/anduril.json --no-write-flags`.
5. Build: `node scripts/build-static.js --out <scratch>/fix5-data/dist`. The scratch build was deleted
   afterwards.
6. Patches: edit the file, `git diff <file> > docs/process/patches/<name>.diff`, then `git checkout <file>`.
   `git apply --check` passes for both.

## 5. Verification

### Findings, before → after (today's crawl, the lists the build serves)
| Finding | Status | Numbers |
|---|---|---|
| **DQ-38** | fixed | Simulation: 3,000 → 0 hidden postings "New". 4 tests |
| DQ-33 / VT-15 | fixed | Amazon postings with Juice at a place scored on another place's row: 635 → **0**. Ranges carrying places: 0 → 702. Identical rows counted as zones: 506 → **0**. Postings with "zones > 1": 1,256 → 732. Fixed in stored snapshots too (upgrade) |
| DQ-41 | fixed | Card range from a virtual row for a state the posting does not list (posting has stated places): 3 → **0** (the data check's 24 also counted remote-only postings, which keep their virtual rows) |
| DQ-35 / VT-14 | fixed | Mexico-only "$" read as USD: 1 → **0**; the posting shows MXN 12,569 a month (MXN 150,828 a year, about US$8,700), not quarantined. Amazon `currency_country_mismatch`: 1 → 0 |
| DQ-36 / VT-21 | fixed | Amazon "III" Mid → Senior: 80 postings. Director+ 33 → 29 (3 "Data Center Chief Engineer" and "Communications Specialist, CEO & Financial Comms" are no longer Director+) |
| DQ-37 | fixed | Meta "(Technical Leadership)" / "(Leadership)" on the default: 43 → **0** (Staff+ 6 → 49) |
| DQ-40 | fixed | Amazon places with no country: 16 → **0** (SVK and AUT) |
| DQ-42 / VT-20 | fixed | Meta salaries with `salary.country`: 0 → 903; Italy's range is not scored in Madrid or Paris (test) |
| DQ-6 residue / VT-16 | fixed | Microsoft quarantined: 2 → **0** (the two lei IC1 ranges show); RON salaries shown 10 → 12 |
| DQ-43 | fixed | The CLI scans what the build serves: Google 20 → 16 flags (the 4 false `missed_salary` are gone), Microsoft 95 → 80 (12 false `missed_salary` gone), Netflix 8 → 5 |
| DQ-34 | partly fixed (data) | Amazon paid postings with Juice: 3,391 → **3,567** (67.8% → 71.3%); Meta 827 → **851** (91.6% → 94.2%). 20 same-state proxies were added. Towns that still need sourced records are listed in LIVABILITY.md |
| VT-17 | fixed (decision) | `kind: 'minimum'`: 0 → **117** Amazon salaries (EU, Poland and Austria). The vetting counted 111 on the full text. In stored snapshots, about 11 more EU salaries lost the minimum sentence when their descriptions were trimmed (VT-22), so they stay `"salary"` until the next crawl, which reads the untrimmed text |
| VT-18 | fixed (decision) | `includesShiftDifferential`: 0 → **243**; `statedBase`: 0 → **33** |
| VT-19 | fixed (decision) | `statedAnnual`: 0 → **3** (Austria, €47,000 a year, not €40,300 or €41,200) |
| VT-7 | fixed (decision) | NVIDIA salaried 1,395 → **1,440** (45 `kind: 'ote'`, shown) |
| VT-10 | fixed (decision) | Netflix L7 $737K–$1.43M shown; Netflix quarantined 2 → 1 (the L4 range-ratio case remains) |
| VT-8 | fixed (decision) | Microsoft levels from the pay sentence: 402 → 1,400 postings (basis 'pay'). Director+ 102 → 66, Manager 167 → 118, Staff+ 489 → 561 |
| VT-23 | fixed | Amazon part-time hourly pay with weekly hours: 26 → 28 (the two "20h per week" working-student postings) |
| VT-25 | fixed | `REVIEW_DIR_RE` accepts `<date>-<channel>-<n>`, sorted numerically (test) |
| VT-22 | patch | `docs/process/patches/fix5-data-trim.diff`: keeps every pay-table row and the sentence above the table. The VT-22 test passes with it applied; the test stays a to-do until the performance lane applies the patch |
| Display | patch | `docs/process/patches/fix5-data-display.diff`, details below |

### Tests
- `test/beta-data-check-3.test.js`: 15 of 15 pass (10 to-dos now plain, plus 3 DQ-38 tests).
- `test/beta-vetting-2.test.js`: 22 pass, 1 to-do (VT-22, patch). 8 new decision tests were added (VT-17 ×2,
  VT-18, VT-19, VT-7, VT-10, VT-16 currency group, DQ-43 loader).
- `test/beta-vetting.test.js`: 17 of 17 pass (the 2 VT-8 to-dos are now plain; the Netflix L7 pinned test
  follows VT-10).
- Tests outside the listed files changed because a decision changed what they assert:
  - `test/bigtech-salary.test.js`, `test/fix-beta-pay.test.js`: VT-7 is now OTE, VT-10 bound $1.5M, VT-8
    level, norm-10;
  - `test/fix-pay-data.test.js`: norm-10;
  - `test/salary.test.js`: thresholds at $1.5M;
  - `test/refresh-jobs.test.js`: the VETTING.md copy now says $1.5M;
  - `test/incremental-closures.test.js`: DQ-38, already re-resolved by the lead;
  - `test/golden-normalize.test.js`: comment only.
- `npm test` with `MELON_BETA_SNAPSHOT_DIR` set to an empty folder and no data links: 1,051 tests, **1,004
  pass**, 39 to-do, 7 skipped (the data-dependent tests), **1 fail**. The failure is S-6, "/methodology/ is not
  re-rendered on every request in server mode". It belongs to `server/index.js`, which is not this lane's,
  and it already failed on the base (3f9385c) before any change here. PERF-1 and V15 are timing tests and
  passed in this run.
- `test/incremental-equivalence.test.js`: green.

### Regression fixtures updated (verdicts the decisions change)
- `test/fixtures/real-salary-cases.json`:
  - netflix:790312403200 (L7): was `quarantine: true`, is now shown (VT-10);
  - amazon:10551812 and amazon:10557624 (Austria): were EUR 3,358.33 and 3,433.33 a month, are now
    EUR 47,000 a year, `kind: 'minimum'` (VT-19, VT-17).
  - 563/563 pass.
- `test/fixtures/golden-normalize.json`: re-baselined at norm-10. 0 of the 300 hashes changed; only the
  version moved.
- `test/fixtures/refresh/jobs/snapshots/{acme,globex}.json` and `make-fixtures.mjs`: normalizerVersion
  norm-10, so they stay current-version fixtures.

### Gate runs
- vet-salaries on the 7 beta snapshots plus anduril: **exit 0**, 0 blocking, 563/563 fixtures. Per board,
  flagged: Amazon 1,085, Meta 25, Apple 145, Google 16, NVIDIA 44, Microsoft 80, Netflix 5, Anduril 203.
  Quarantined: Netflix 1, Anduril 5.
- Build with today's data: **exit 0**. 7/7 beta companies, 15 companies on the stable site. The 2 warnings
  are list-size budget warnings for Apple and Amazon (lists over 1.5 MB without descriptions), not new to
  this lane.

### Display patch (`docs/process/patches/fix5-data-display.diff`, public/app.js)
- **Card pill:**
  - a minimum reads "from €20.1K" (tip: "The posting states this as the minimum base pay; the offer can be
    higher");
  - a per-place range reads the span "$145K–195K · 2 places", no longer the primary row (DQ-33 card).
- **Labels** (one short chip each, the detail in its tip, still at most 2):
  - "Minimum";
  - "Incl. top shift pay", with the tip "The posted rate includes the highest shift differential. Base pay
    starts at $18.35/hour."
- **Drawer:**
  - the amount reads "from €X";
  - the one caption line says "Posted minimum base pay; the offer can be higher." or "Posted pay, including
    the highest shift differential. Base pay starts at $18.35/hour.";
  - "Pay by place" now gets grouped, short labels from the data ("Austin, Arlington, Seattle $155K–210K").

## 6. Known gaps and follow-ups
- **DQ-34:** these places need sourced city records (Numbeo rent and cost of living, HUD bedroom ratios) and
  are listed in LIVABILITY.md:
  - Jersey City and Newark, which also need a New Jersey tax record;
  - El Paso, Montgomery, Oklahoma City, Memphis and others;
  - the warehouse and data-centre towns.
- **DQ-39** (identical Amazon postings) stays separate by decision. **VT-24** (density) is handled by the
  display patch and the grouped labels; there is no test.
- **About 11 stored Amazon minimums** are labelled only after the next crawl, because their minimum sentence
  was trimmed away. With the trim patch applied, the stored text keeps that sentence.
- **Upgrade cost:** `upgradeAmazonJobs` re-reads every stored Amazon job on each build. The whole Amazon
  read path took 28.5 s for 5,000 postings here (29.0 s before the lane). I did not measure the upgrade on
  its own. It is idempotent on fresh crawls.
- **The DQ-38 inference** needs `postedAt`. A board without it would still mark the newly covered postings
  "New" after a partial run (none today: Amazon has posted dates).

## 7. Change log
- 2026-10-11: DQ-38 fixed, committed (98bb213) and reported (§0).
- 2026-10-11: rebased onto e48fd32 (lead: no cap). 8bada3d is the WIP commit; 5873a3c holds the remaining
  findings, the patches, the fixtures and VETTING. A docs commit follows with CONTRACT "Fix wave 5",
  DATA_SOURCES and LIVABILITY. This log is committed last.
