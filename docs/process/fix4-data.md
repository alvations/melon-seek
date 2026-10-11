# Process log: fix4-data

## 1. Brief
Prompt: [`docs/process/prompts/fix4-data.md`](prompts/fix4-data.md) (verbatim), plus one follow-up from the
lead mid-run: rebase onto 7990c18 (the methodology review's doc patches) and fix **MR-1** (Romanian lei:
add RON to every FX table and to the ECB refresh, so lei pay shows).

Goal: fix wave 4's data lane on `/beta/`: the pay places and per-place ranges of Apple requisitions, the
Google manager ladder, ZIP-code and store-name places, five pay-parser findings from the salary vetting,
the vetting tools, two security findings (quadratic parsers, unchecked posting links) and the lei rate.

Files owned: `server/**`, `public/features/shared.js` (`payLocations` only), `scripts/vet-salaries.js`,
`scripts/llm-vet.js`, `test/fixtures/**`, the named test files, `docs/VETTING.md`, `docs/DATA_SOURCES.md`,
`docs/CONTRACT.md`; for MR-1 also `scripts/refresh/fx.js`, the FX tables in `public/viz/palette.js`,
`server/juice.js`, `data/cities.json`, and the registry (`data/freshness.json`, `docs/DATA_FRESHNESS.md`
inventory, both rewritten by `scripts/refresh/registry.js`).

Worktree: `/home/user/melon-seek/.claude/worktrees/agent-ae3756c84e2231a7c`, based on 8259b1b, rebased onto
7990c18. Commits: see §7.

## 2. Inputs and sources
- Findings: `docs/process/data-check-beta-2.md` (DQ-27 to DQ-32, DQ-3/DQ-6/DQ-11 residues),
  `data/vetting/2026-10-11-beta/summary.md` and `docs/process/vetting-beta.md` (VT-1 to VT-13), docs/QA.md
  "Full QA pass (desktop, beta) 2026-10-11" (D-32, D-34, D-36), docs/REVIEW.md "beta review 2026-10-11"
  (S-3, S-4, with the reviewer's patch sketches), `docs/process/methodology-review-beta.md` (MR-1).
- Tests that encode them: `test/beta-data-check-2.test.js`, `test/beta-vetting.test.js`,
  `test/beta-security-review.test.js` (S-3, S-4), `test/beta-methodology.test.js` (MR-1),
  `test/e2e/beta-desktop-qa-2.e2e.js` (`[D-32]`, `[D-34]`, `[D-36]`).
- Process: `docs/process/PLAYBOOK.md`, `docs/process/TEMPLATE.md`, `docs/process/prompts/cycle/fix-lane.md`.
- Code read: `server/sources/apple.js` (`mapCopies`, `mergeStored`, `upgradeAppleJobs`), `server/normalize.js`,
  `server/juice.js#attachJuice`, `public/features/shared.js#payLocations`, `server/keywords.js`
  (`seniorityOf`, `ladderRung`, `htmlToText`, `tokenizeBlocks`), `server/geo.js`, `server/salary.js`
  (`clauseSpan`, `contextOf`, `evaluate`, `parseSalary`), `server/sources/eightfold.js`, `server/sources/util.js`,
  `server/sources/pool.js`, `server/pipeline.js`, `server/history.js` (reqId use), `scripts/vet-salaries.js`,
  `scripts/llm-vet.js`, `scripts/refresh/fx.js` and `test/refresh-fx.test.js`.
- Data: today's archive rebuild in `/home/user/melon-seek/data/{snapshots,beta/snapshots}` (norm-7, observed
  2026-10-11 06:38–08:00 UTC), linked into the worktree.
- RON rate: `big-mac-source-data-v2.csv` (The Economist, release 2026-07-01; the same file the FX tests use
  in `test/fixtures/refresh/bigmac/`): "Romania,ROU,RON,…,4.58165,…,2026-07-01". Cross-check: the ECB daily
  reference rates of 2026-10-09 captured in `test/fixtures/refresh/fx/ecb-daily-2026-10-09.xml` give RON 5.3406
  and USD 1.1206 per EUR, i.e. 4.766 RON per USD (4% above July, a normal three-month move).
- The sandbox cannot reach the ECB (`CONNECT tunnel failed, response 403`), so no live rate was fetched.

## 3. Decisions and rationale
1. **Where the pay was posted (DQ-27) is a salary field, `salary.places`**: the location strings
   (`Location.rawName`) the range was posted for, set only when that is some of the posting's places.
   Alternatives: dropping the unposted places from `locations` (loses real places from search and the map)
   or a one-range `salary.ranges` (would read as "Multiple pay zones"). A field on the salary keeps both.
   - Fresh crawl: `mapCopies` knows every footer's place; with one footer group it returns `payPlaces`
     (RawJob), and `normalizeJob` keeps the ones the job lists (`withPayPlaces`).
   - Stored snapshots carry no per-listing footers. Apple posts pay only in pay-transparency states, and
     today's data splits cleanly: single-place US postings with pay, CA 1,858/1,870, WA 136/136, MA 38/38,
     NY 38/38, VA 18/18, OH 11/11, MD, MN 5/5, DC, IL 4/4, CT, NJ, CO 3/3, ME 2/2; every other state 0 (TX 0/299,
     OR 0/53, FL 0/21, NC 0/17, PA 0/15, TN 0/9, NV 0/5, AZ 0/5 and 17 more). `APPLE_PAY_STATES` is that list;
     `applePayPlaces` leaves out US places in other states (non-US, remote and state-less places stay).
   - Old merged copies (`mergeStored`): one range from some copies only gives `places` = those copies' places.
   - A text salary re-derived from a stored posting keeps its `places` (adapter knowledge, not text).
2. **Consumers.** `payLocations` narrows to the posted places (or the places of `salary.ranges` when every
   range has some), then to `salary.country` (VT-5), then by currency, each step skipped if it would leave
   nothing. `attachJuice` scores only posted places, and none when no posted place has a city record
   (Sacramento: never fall back to Austin); a place in a range is scored on that range's midpoint (DQ-28).
3. **Google ladder (DQ-29)**, from this crawl's US medians: Product Manager I $168K and II $200K sit one rung
   above TPM I $141K, II $168K, III $200K, so a PM rung reads one step up (PM II Mid); Leadership TPM I/II
   ($235K, between Senior $213K and Staff+ $254K) is Senior; any other numbered "… Manager <numeral>" family is
   a people manager (Facilities Manager I $169K / II $201K, Land Development, Customer Engineering,
   Government Affairs; like Software Engineering Manager II $254K). Program/TPM/Account Manager keep the
   ladder (TPM II is Google's graduate band). "IV" at Staff pay was left alone: the data check calls it a
   ladder decision.
4. **Netflix (DQ-3 residue)**: a support word no longer hides an L-level on Netflix's ladder, and "(L5+L6)" is
   two levels (Netflix takes the upper one, as for "L5/L6").
5. **VT-1**: when the chosen pay line names a country none of the job's places is in, the job gets no
   salary (the existing `unreadableOwn` rule, generalised). A job with no known country keeps the line.
6. **VT-6**: a "<Country>: The base salary range is …" label anywhere earlier in the amount's clause sets
   `salary.country` (`sentenceCountry`); it does not change candidate scoring or grouping (smaller blast
   radius). Effect: 25 NVIDIA salaries gain a country (PL 23, IT 2).
7. **VT-3**: two narrow rules, both checked on all 457 Netflix postings (only the 2 internships match):
   "market range for … Internships" is an area band, and a range that the next sentence calls total
   compensation is rejected.
8. **VT-12 / D-34**: inside a national-level group, identical (level, range) members are one; a level named
   twice keeps its widest range; a level stated twice alone keeps its name in `salary.text`.
9. **VT-13**: decode a twice-escaped numeric character reference (`&amp;#xa;` → `&#xa;`) in Eightfold HTML,
   fresh (`mapEightfoldJob`) and stored (`upgradeEightfoldJobs`).
10. **S-3** (linear parsers, with numbers from the real boards so no salary changes):
    - `parseSalary` reads at most 40,000 characters (first 20,000, then ±600 around later pay words; the
      longest real description is 26,628, microsoft:1970393556868750) and 1,000 amounts (the most in a real
      posting is 65, xai:5017529007);
    - clause ends are found once per text (binary search), the pay-context patterns read ±600 characters,
      the heading look-back is bounded, `lineLabel` looks back 120 characters without `lastIndexOf` to the
      start;
    - an amount below the yearly floor even at an hourly rate ("$1") is rejected before any context work;
    - `/&nbsp;| /g` (which matched every space) is now `replaceAll('&nbsp;', ' ')`;
    - both `htmlToText`s and the block tokenizer: `<[^<>]…>` patterns, and script/style/comment blocks
      removed in one pass that stops searching for a closing tag once one kind has none;
    - `geocode`: `\([^()]*\)` and `\[[^[\]]*\]`; `pool.js`: `<[^<>]*>`;
    - pipeline tasks stop after `MELON_TASK_TIMEOUT_MS` (default 5 min, 0 = off) and their worker is replaced.
11. **S-4**: Eightfold links must be https on the tenant host (`publicUrl`, then `positionUrl` on the host,
    then `canonicalPositionUrl`), else `https://<host>/careers/job/<id>`; `normalizeJob` keeps http(s) only.
    Apple and Google build links from their own origin already. The beta host allow-list in
    `scripts/links-policy.js` was not wired into `server/` (server modules are browser-safe and do not import
    scripts).
12. **DQ-32**: the scan compares a merged requisition's text with each of its per-place ranges.
13. **VT-9**: review folders are `<date>` or `<date>-<channel>`; `latestFlags(channel, dir)` and `--channel beta`.
14. **MR-1 / RON**: every encoded rate today is the Big Mac source data's `dollar_ex` of 2026-07-01 (the
    tables' `FX_AS_OF` and `FX_SOURCE`), so RON is encoded from the same release (4.58165 per USD), with the
    same date and source; the monthly ECB refresh now requests RON, and replaces all rates together. The
    captured ECB monthly response (2026-10-10) predates RON in the request, so `fx.js` now accepts up to
    `MONTHLY_GAP_MAX` (2) currencies missing from the monthly response and takes them from the ECB daily
    reference rates, with a note; the fixture URL map points the new request URL at that capture, and the
    parser test says the capture has no RON row. `RO: 'RON'` joins the country-currency copies
    (`server/salary.js`, `public/viz/palette.js`, `scripts/vet-salaries.js`).
15. **`NORMALIZER_VERSION` norm-9**: derived fields changed (salary.places, levels, countries, nulls, RON).
    The golden 300-job hashes did not change (stable boards; version-only re-baseline). The version asserts
    in `test/fix-beta-pay.test.js`, `test/fix-pay-data.test.js` and `test/fix3-data.test.js` (the last now
    "norm-8 or later") and the refresh fixtures' `normalizerVersion` were updated with it.
16. **Not changed (open decisions for the user):** VT-7 (NVIDIA sales cash compensation as on-target
    earnings, 45 postings), VT-8 (Microsoft's own IC/M level over the title, 286 postings), VT-10 (raising the
    $1.2M bound; Netflix L7 stays quarantined). The lei exchange-rate question (DQ-6/VT-2) was settled by
    the lead's MR-1 instruction during the run and is done (decision 14).

## 4. Replayable steps
```bash
WT=/home/user/melon-seek/.claude/worktrees/agent-ae3756c84e2231a7c; S=<scratchpad>/fix4-data
git -C $WT checkout --detach 8259b1b            # later: git rebase 7990c18
ln -s /home/user/melon-seek/node_modules $WT/node_modules
ln -s /home/user/melon-seek/data/snapshots $WT/data/snapshots
mkdir -p $WT/data/beta && ln -s /home/user/melon-seek/data/beta/snapshots $WT/data/beta/snapshots
git -C $WT archive 8259b1b server scripts public data/cities.json package.json | tar -x -C $S/base   # baseline code
node $S/measure.mjs $S/base $S/before.json      # per-finding counts, as the build serves the boards
node $S/salary-dump.mjs $S/base $S/dump-base.jsonl   # every stored posting's re-derived salary, level, places
# ... edits ...
node $S/measure.mjs $WT $S/after.json
node $S/salary-dump.mjs $WT $S/dump-new.jsonl && node $S/dump-diff.mjs $S/dump-base.jsonl $S/dump-new.jsonl s
node $S/s3.mjs                                  # 1 MB hostile-input timings
node --test test/beta-data-check-2.test.js test/beta-vetting.test.js test/beta-security-review.test.js test/beta-methodology.test.js
UPDATE_GOLDEN=1 GOLDEN_REASON="norm-9 …" node --test test/golden-normalize.test.js
node test/fixtures/refresh/jobs/make-fixtures.mjs
node scripts/refresh/registry.js --lines --write && node scripts/refresh/registry.js --docs --write
rm $WT/data/snapshots $WT/data/beta/snapshots
MELON_BETA_SNAPSHOT_DIR=$S/emptybeta npm test   # gate run, no data links
# links back, then:
node scripts/vet-salaries.js data/beta/snapshots/*.json data/snapshots/anduril.json --no-write-flags
node scripts/build-static.js --out $S/dist
BETA_QA_DIST=$S/dist NODE_PATH=<scratchpad>/pw/node_modules node scripts/e2e.js --grep='D-3[246]'
rm -rf $S/dist
```

## 5. Verification

**Before and after, per finding** (the boards as the build serves them: `readSnapshot`'s steps, one-person
Juice; baseline = 8259b1b's code on the same data):

| Finding | Before | After |
|---|---|---|
| DQ-27 Apple paid postings with headline Juice in a state Apple posts no pay for | 364 of 2,818 (12.9%); 368 with any such Juice entry | 0; 0 |
| DQ-27 paid postings whose `payLocations` include such a place | 372 | 0 |
| DQ-27 Austin postings that show pay for Austin | 317 of 621 | 0 of 621 |
| DQ-28 merged requisitions scored on the span, not the place's own range | 393 of 395 (870 of 870 place entries) | 0 (0 of 870) |
| DQ-29 Google Entry postings titled "… Manager I/II" | 58 | 37 (all Program, TPM, Account Manager: kept by rule); Facilities Manager I/II Entry → Manager |
| DQ-30 Apple reqIds with a location suffix | 3,311 of 4,875 (67.9%) | 0 |
| DQ-31 ZIP-code entries that lose their state | 9 | 0 |
| DQ-32 Apple `structured_text_disagree` flags | 63 | 0 |
| DQ-3 residue: Netflix titles stating "(L5)" left at the default | 3 | 0 |
| DQ-11 residue: "Expression of Interests" not a pool | 1 (pools 46) | 0 (pools 47) |
| DQ-6 residue / VT-2 / MR-1: lei postings with pay shown | 0 of 16 | 16 of 16 (Google 2,217 → 2,221 with pay; Microsoft +12) |
| VT-1 salaries whose pay line is for a country the job is not in | 1 | 0 |
| VT-3 Netflix internship band shown as base pay | 2 | 0 (Netflix with pay 290 → 288) |
| VT-5 postings whose pay places span two countries | 37 (Google 12, Microsoft 23, NVIDIA 1, Netflix 1) | 1 (netflix:790318298442: one € range for Rome and Amsterdam, no country named: correct) |
| VT-6 NVIDIA non-USD salaries without `salary.country` | 36 (Italy 2 of them) | 11 (Italy: IT) |
| VT-12 / D-34 Microsoft pay texts naming 2+ IC levels without `levels` | 3 of 125 | 0 of 126 |
| VT-12 Microsoft `salary.text` naming one range twice | 8 | 0 |
| VT-13 NVIDIA descriptions with "&amp;#xa;" | 44 | 0 |
| D-32 store and mall names listed as places | 12 | 0 |
| D-36 Google labels for Pryor / Moncks Corner | 6 (Moncks Corner, Moncks Corner SC, Pryor, Pryor Creek, Pryor Creek OK, Pryor OK) | 2 (Moncks Corner SC, Pryor Creek OK) |
| S-3, 1 MB of hostile input | quadratic (64 KB: 17 s parseSalary, 6 s htmlToText, 17 s geocode) | parseSalary 45–111 ms, htmlToText 10–76 ms, geocode 98–171 ms, normalizeJob ~1.1 s |
| S-4 non-http(s) or off-host links (today's data) | 0 (latent) | 0; hostile cases rejected by test |

Juice counts: Apple 2,729 → 2,728 (apple:200686684-0240, pay posted for Sacramento, which has no city record,
no longer scored in Austin); Netflix 186 → 184 (the 2 internships).

**Salary regression check** (`dump-diff.mjs`, all 19,173 stored postings re-derived): 60 salaries differ, each
from a finding: RON 16, VT-1 1, VT-3 2, NVIDIA `country` 25, Microsoft level dedupe 12, Google duplicate
degree-line text 2, a single repeated level 2. The S-3 limits alone change none. Levels: 24 differ (Google 21,
Netflix 3), all DQ-29 and DQ-3. Places: 26 postings (11 Apple stores, 15 Google ZIP/Pryor).

**Tests:**
- Fixed to-dos (todo removed): data-check-2 DQ-27 ×2, DQ-28, DQ-29 ×2, DQ-30, DQ-31, DQ-32, DQ-3, DQ-6, DQ-11;
  vetting VT-1, VT-2, VT-3, VT-5, VT-6, VT-9; security S-3 ×5, S-4 ×2; methodology MR-1 ×2 (of 3).
- New tests: D-32, D-36 (geocoder); VT-9 `latestFlags`; VT-12 ×2 (incl. D-34); VT-13; S-3 1 MB in under 1 s.
- Still to-do in these files: VT-8 ×2 (decision), MR-1 "until a rate exists, the drawer says it can't convert"
  (needs app.js wording and a field for unconvertible pay; no posting needs it once RON has a rate).
- `MELON_BETA_SNAPSHOT_DIR=<empty> npm test`, no data links: 1,016 tests, 957 pass, 0 fail, 52 to-do, 7 skipped.
- With data links (first run, load 11): golden and refresh-jobs failures (fixed by the re-baselines above),
  plus PERF-1 and V15, the known load-dependent timing tests (PLAYBOOK).
- `test/incremental-equivalence.test.js`: green in every run.
- `node scripts/vet-salaries.js data/beta/snapshots/*.json data/snapshots/anduril.json --no-write-flags`:
  exit 0, 527 of 527 fixture cases pass, 0 blocking. No fixture was rebuilt. (The scan reads stored salaries,
  so its lei `missed_salary` 16 and Apple counts change only when the next crawl stores norm-9 salaries;
  `structured_text_disagree` already went 63 → 0.)
- `node scripts/build-static.js --out <scratch>/dist`: exit 0; `beta: 5/7 beta companies included` (meta and
  amazon have no snapshot), 1 warning (as before).
- e2e against that build (`BETA_QA_DIST`): `[D-32]`, `[D-34]`, `[D-36]` 3 of 3 pass. The whole
  `beta-desktop-qa-2` file: 6 of 10; the 4 failing are D-31, D-33, D-35, D-37 (map and app lanes, red before).
  The scratch build was deleted afterwards.

## 6. Known gaps and follow-ups
- **The card still shows the span** of a merged Apple requisition (DQ-28's "Wide range (2.3×)" chip, 24
  postings) and `scripts/build-market.js#usdMid` uses the span. Juice, `payLocations` (filter, map, comps)
  and the test are fixed; the card pill and market cells are `public/app.js` and `scripts/build-market.js`,
  outside this lane. No patch written: the right display (own range under a Location filter) is a UI call.
- **MR-1 third test**: wording for pay in a currency the site cannot convert needs a new Job field (the
  unconverted range) and `public/app.js` text; with RON added, no posting is in that state today.
- **RON's rate is July's** (Big Mac `dollar_ex` 2026-07-01), like every other rate. The first monthly ECB
  refresh (monthly-refresh.yml, FX module) moves all of them to the ECB September averages; the captured
  daily rate (2026-10-09) puts RON 4% higher.
- **Stored Apple snapshots** use the state rule (`APPLE_PAY_STATES`); the exact footer places arrive with the
  next crawl. If Apple starts posting pay in a new state, the list needs that state (a crawl fixes it anyway).
- **Open decisions** (unchanged, for the user): VT-7, VT-8, VT-10. VT-11 (CI flags report) was not in scope.
- Google "IV" titles at Staff pay (14 postings) stay Senior: a ladder decision (DQ-29 note).
- The `scripts/links-policy.js` beta host list is not enforced in `server/` (decision 11).

## 7. Change log
- 2026-10-11 14:05 Prompt saved; worktree at 8259b1b, links; findings and tests read.
- 14:25 Baseline numbers (`measure.mjs`, `salary-dump.mjs`) on 8259b1b's code.
- 14:40 Apple pay places, Juice per place, payLocations, vet scan, pool, Google ladder, Netflix L5, geo ZIP and
  aliases, linear htmlToText/geocode, parseSalary bounds; commit 1bd7053 (rebased: f646d11).
- 15:05 VT-1, VT-3, VT-6, VT-9, VT-12, VT-13, S-4, pipeline time limit, norm-9, golden and refresh fixture
  re-baselines; commit 4ddb519 (rebased: 0c611fa).
- 15:15 Lead: rebase onto 7990c18 and fix MR-1. Rebased; RON in every FX table, the ECB request and the
  country-currency copies; DQ-6/VT-2/MR-1 tests; commit 4b8b127.
- 15:30 ECB daily fallback for currencies missing from the monthly response, docs (CONTRACT "Fix wave 4",
  DATA_SOURCES, VETTING), registry rewritten; commit 480e557.
- 15:40 Juice: no fallback to an unposted place when no posted place has a city record; this log.
