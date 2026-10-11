# Process log: amazon-meta-backend

## 1. Brief

Prompt: [prompts/amazon-meta-backend.md](prompts/amazon-meta-backend.md) (verbatim).

The user (2026-10-11): "Why are the Meta and Amazon ones missing?! … We must have these in the big tech
list!" Goal: find every reason Amazon and Meta are missing from the beta site, make resuming them one
documented switch, get both adapters ready to work the first time, and fit Amazon (22,415 postings) into
the beta budget. **No Amazon or Meta listing, search endpoint or job page was requested**, from the
sandbox or a runner: whether to collect against their terms is the user's decision (the data engineer,
role amazon-meta-data, owns that question and docs/AMAZON_META.md). Everything here runs on the recorded
formats (docs/DATA_SOURCES.md §7e, §7g), the fixtures, and synthetic boards built from them.

Files owned: `server/sources/{amazon,meta}.js`; in `server/companies.js` the amazon and meta entries and
the `paused` mechanics; `.github/scripts/beta-snapshots.mjs`; the beta size fitting in
`scripts/snapshot.js`; `scripts/probe-bigtech.js`; `test/bigtech-*.test.js`, `test/amazon-meta-*.test.js`
(new: `-synth.js` helper, `-resume`, `-adapters`, `-fit`); this log and the prompt. Everything else is a
patch in `docs/process/patches/amazon-meta-backend-*.diff`.

Worktree `.claude/worktrees/agent-a1c62b6a147fed3b9`, from 790fa13, rebased onto 3cf226e (wave 3).

## 2. Inputs and sources

- Docs: DATA_SOURCES.md §7 (7a pay rules, 7e Amazon, 7g Meta), process/bigtech-data.md (decisions 8, 11,
  12), beta-deploy.md (the crawl/merge/deploy design), perf-mobile-beta.md (the phone method and the
  Apple baseline), ARCHITECTURE.md, PLAYBOOK.md, TEMPLATE.md, DATA_ARCHIVE.md (partial observations).
- Code: companies.js, sources/{amazon,meta,polite}.js, pipeline.js, normalize.js#deriveSalary,
  scripts/snapshot.js, history.js and server/history.js (the ledger), build-static.js (beta channel,
  `readSnapshot`, `packList`, `enrich`), public/api.js (`fromBundle`), public/app.js (badge, count line),
  .github/workflows/{snapshot,pages,archive,bigtech-probe}.yml, .github/scripts/{beta-snapshots.mjs,
  beta-gate.sh}, scripts/archive/ingest.js, scripts/cycle/local-data.js, scripts/refresh/derived.js
  (README rule), and every test that names amazon or meta.
- Fixtures: test/fixtures/bigtech-amazon.json (5 real search rows), bigtech-meta.json (3 real pages).
- GitHub Actions: the list of bigtech-probe.yml runs, and two aggregate lines of run 7's log (the
  whole-board probe of 2026-10-10, before the pause): "[amazon] hits 10000 (capped); 58 countries
  totalling 22415 postings", "[amazon] listed 22415 postings in 301 pages" (07:50:54 to 07:55:56), and
  "[meta] sitemap: 1143 postings" with "pages 1000/1143 (1120 s)". Reading further into that log was
  refused by the session's permission check; I took that as "stay with the recorded docs and
  fixtures", deleted my local copy, and used only those timing lines.
- Tools: Playwright from the scratchpad, Chromium 1194, `scripts/cycle/serve.mjs`, a copy of
  docs/process/scripts/perf-mobile-beta.mjs with switch targets for the new boards.

## 3. Findings and decisions

### 3.1 Why they are missing (every place)

`paused: 'terms'` is the only cause. It acts through `listCompanies()`, and every stage reads that:

| Stage | Where | Effect of `paused` |
|---|---|---|
| Registry | server/companies.js:32 (meta), :38 (amazon); filter at :62 (`includePaused \|\| !c.paused`) | left out of `listCompanies()` on every channel |
| Crawl matrix | .github/scripts/beta-snapshots.mjs:25-30 (`channelCompanies(listCompanies)`) → `slugs` :92; snapshot.yml:144 (beta-companies) → :159 (matrix) | no `beta crawl (amazon)` / `(meta)` job |
| Crawl | snapshot.yml:179 `node scripts/snapshot.js "$SLUG"`; `--channel beta` targets at scripts/snapshot.js:95 | never started (no matrix cell) |
| Gate | snapshot.yml:191 and pages.yml:159 (`beta-gate.sh`) | only gates files that exist; none for them |
| Merge | beta-snapshots.mjs:47 (loops beta companies), :74-81 | a paused company's old snapshot and ledger in the artifact are **deleted** |
| Archive | scripts/archive/ingest.js:47 (`isKnownArtifact`: any `beta-crawl-<slug>`) | registry-blind; it only sees what a crawl uploads, so nothing |
| Build | scripts/build-static.js:651 (`listCompanies({ channel: 'beta' })`), :759 | not built, not in `beta/api/companies.json`, market comps, CSV or share pages, even with a snapshot present |
| Server mode | server/index.js:53-57 (company list), :164 (the "paused" message) | not listed; a link gets "…roles are paused…" |
| Sandbox data | scripts/cycle/local-data.js:57 | not restored from the archive |
| README check | scripts/refresh/derived.js:304 (the "beta big-tech companies" rule) | the README must list the beta boards; drift is reported |

**Gaps found: two entry points ignored `paused`.** `node scripts/snapshot.js amazon` (explicit slug →
`resolveCompany` → `fetchLive`, scripts/snapshot.js:123-130) would have crawled, and so would
`scripts/probe-bigtech.js` with no companies named (its default is all eight slugs) in recon, full and
raw mode. The data engineer found the dispatch side of the same hole: a bigtech-probe.yml run with only
`raw` set also ran recon on every company. Fixed (3.2).

Tests and docs that encode today's paused state (they would break or lie on resume):
test/bigtech-polite.test.js:19 (fixed: reads the registry), test/fix-beta-platform.test.js:100-102,
test/e2e/beta-desktop-qa.e2e.js:132-142, test/e2e/beta-mobile-qa.e2e.js:324 (patch
`tests-registry.diff`, apply now); README.md:373, DATA_SOURCES.md §7 (the paused paragraph and the two
table rows), PLAYBOOK.md:171, prompts/cycle/README.md:36, .claude/skills/improvement-cycle/SKILL.md:44
(patch `resume.diff`, apply on resume).

### 3.2 The resume switch

1. **One switch: delete `paused` from the entry** and record the decision in the comment above it. The
   `PAUSING` block in server/companies.js documents what it governs.
2. **A paused company is never requested, whoever asks.** `crawlBlock(source, board)` (companies.js)
   is checked at the top of `fetchAmazon` / `fetchMeta`, before robots.txt, and throws `UpstreamError`
   code `paused`. That covers `snapshot.js <slug>`, `pipeline.js#fetchLive`, the probe's full mode and
   anything later. Chosen over a guard in `fetchLive` (not my file, and the probe's recon bypasses it)
   or in polite.js (host-based, not my file, and the lead had just changed it).
3. **The probe** (`probeTargets`, `pausedHost`): recon and full skip paused companies; raw refuses their
   career hosts (`www.amazon.jobs`, `amazon.jobs`, `www.metacareers.com`, `metacareers.com`) but still
   reads their terms pages; and `raw` with no companies named now runs the raw requests only.
4. **Proof** (test/amazon-meta-resume.test.js). On this tree: no request from `fetchLive`, `runSnapshot`,
   the snapshot CLI with explicit slugs, or the probe in recon, full and raw-only (child processes with
   a preload that logs every `fetch()`: zero); not in the matrix; a leftover file is deleted by the
   merge; a build with their snapshots present lists neither. On a copy of the tree with **only the two
   `paused` fields deleted**: the matrix lists both; the snapshot CLI crawls both (synthetic sites,
   robots.txt first and once); the real beta gate passes both; the merge writes both snapshots and
   starts their ledgers (`fresh=2`); the archive folds the `beta-crawl-<slug>` artifacts and rebuilds them
   deep-equal; the beta build lists both `live: false`, with job lists, share pages and market comps, and
   the main site has neither.

### 3.3 Adapter checks (against §7e, §7g and the fixtures)

Amazon:
- Pay table: both row orders ("USA, CA, East Palo Alto - …", "Seattle, WA, USA - …"), a single figure,
  hourly, monthly, CAD, and large-unit currencies (JPY, INR, GBP rows parse; the vetting gate passes
  them). The older national sentence gives `salary: null` from the adapter and is read by the text
  parser (129,300-223,600 USD, `source: 'text'`).
- **Fix: the row choice.** Cities were substring-matched ("York, PA" took the "New York" row when its
  state token check passed loosely) and the fallback was the table's first row, which can be another
  country: a Toronto job whose city is not listed got the Seattle USD row, and the normalizer then
  spanned all CAD rows (80,000-126,800 with joined text). Now: the city and state compared whole, else
  the first row in the job's country (`country_code`), else the first row (`amazonPlace`).
- **Fix: partitions.** Each partition stopped on the facet count (the hint) instead of its own `hits`;
  now its first page's `hits` decides. Search errors are checked before the shape.
- **New: completeness.** A crawl that lists under 95% of the facet total, or a capped board without
  country facets, is refused (`code: 'incomplete'`), so the previous snapshot stays. A partial board
  would make the merge's ledger close every posting it missed. A capped country's coverage through its
  categories and a category still at the cap are noted. Run 7 listed exactly the facet total.
- Unrecorded `job_schedule_type` values are kept as written (only full-time / part-time are mapped).

Meta:
- `public_compensation` annual, intern monthly ($7,313-$12,667/month → 87,756-152,004 a year), hourly,
  GBP; the first location's country is read from `addressCountry` as a code, a name or a Country
  object (`metaCountry`); before, only a bare code matched.
- **Fix: the JSON-LD fallback.** With no page-data anchor the extractor read keys from offset 0, so a
  navigation block's "locations" or "title" could be taken as the job's. Now only JSON-LD is read
  (title, description as paragraphs, or as is when it is HTML, jobLocation names, datePosted), plus
  `public_compensation`, which nothing else on the page carries. The synthetic pages include such a
  decoy block.
- **New: failure handling.** The crawl stops after 10 failed pages in a row (`MAX_FAILED_IN_A_ROW`; a
  403 wall is not asked 1,000 more times) and fails above 5% failed pages (it was 20%), for the same
  ledger reason. 404/410 stay "closed since the sitemap was built". The sitemap's `lastmod` is kept when
  present (for 3.4).

Politeness (polite.js, read only; the lead's 3cf226e spacing fix is in): the honest User-Agent on
every request, `redirect: 'manual'`, robots.txt first and once per crawl, request starts at least the
interval apart (tested at 25 ms on the Amazon crawl), 503 retried, 403 never retried.

### 3.4 Crawl time per run

| Board | Requests | At 1 request/s | CPU after the list (here, shared 4-CPU box) | Peak RSS | Fits? |
|---|---:|---|---|---|---|
| Amazon | 1 robots + 300 list pages (synthetic, same partition plan; run 7: 301) | ~5 min (run 7: 07:50:54 → 07:55:56) | ~150 s normalize + fit | 2.06 GB | yes: 140-min cap, 6-hour schedule |
| Meta | robots + sitemap + 1,143 pages | ~20 min (run 7: 1,000 pages in 1,120 s) | ~6 s | small | yes |

Downloads per run: Amazon about 145 MB (synthetic rows; real ones are longer), Meta about 550 MB
(1,143 × ~480 KB), so about 2.2 GB a day from metacareers.com at four runs a day. No incremental crawl
is needed for time. Proposed for Meta's bandwidth, not built: restore the previous beta artifact in the
crawl job (snapshot.yml change), fetch only sitemap ids that are new (or whose `lastmod` changed, if the
sitemap has one), reuse the previous record for the rest, and refetch a rolling quarter of the old ones
each run, so every page is refreshed at least daily: about 300 pages and 6 minutes a run. Amazon's list
rows already carry whole postings, so there is nothing to save there.

### 3.5 Amazon at scale

**Synthetic board** (test/amazon-meta-synth.js): 22,415 rows built from the five fixture rows' shape and
text pools, 58 countries (US 11,995, over the cap), 62 business categories (largest US category 4,618),
pay tables for US and most Canadian rows (5% of US rows use the national sentence; ~6% hourly), dates
over ~4 months. Recorded facts: the totals, cap, page size and formats. **Assumed: the split over
countries and categories** (only aws, fulfillment-ops, advertising and no-business-category are real
slugs). Calibration: 6.7 KB per normalized posting against the ~9 KB measured on real rows; at the
800-character trim the size is set by sections, keywords and locations (2.3 KB here, 1.6-4.2 KB on the
real boards), so the cap numbers below are within ±15% or so.

**Crawl and fit** (`node test/amazon-meta-synth.js --out DIR`, the real adapter, normalizer and
`runSnapshot`): 22,415 listed in 300 list pages; 12,588 with pay; untrimmed 143 MB; at 800 characters
80 MB. The 40 MB fit (before this work) keeps **9,098 of 22,415** at 800 characters, all of them
salaried: every posting without pay (India, Germany, the UK, …) drops out. 155 s, peak RSS 2.06 GB.

**Build** (one at a time; real stable and beta snapshots plus the synthetic boards):

| Build | Time | Load | Site | Files | Amazon list | Amazon descriptions |
|---|---|---|---|---:|---|---|
| Baseline (5 real beta boards) | 133.7 s | 2.0-3.9 | 238 MB | 24,903 | — | — |
| + Amazon (40 MB fit, 9,098) + Meta (1,143) | 172.0 s | 3.4-4.0 | 274 MB | 35,154 | 5.3 MB raw, 380 kB gzip | 9,098 files, 21.9 MB |
| Variants: Amazon 22,415 / 5,000 | — | — | — | — | 10.4 MB / 2.9 MB raw; 836 / 230 kB gzip | 22,415 / 5,000 files |

Apple's list is 2.1 MB raw, 331 kB gzip. Meta: 0.4 MB, 40 kB gzip. pages.yml's beta build step has a
10-minute cap and the beta gate 5 minutes (about 3 s per 40 MB): both fit. The site stays far under
Pages' 1 GB.

**Browser** (docs/process/perf-mobile-beta.md method: 390×844, 4x CPU, Fast and Slow 4G, served by
serve.mjs; interleaved passes so machine load hits every board alike; one build, so Apple is the
same-run reference):

Medians of 3 interleaved cold loads per cell (12:43-12:50, load 4.7-9.5: other agents were busy, so the
absolute times run high; compare within a column):

| Network · board | Load (1 min, per run) | FCP | First card (min-max) | First chart | TTI | Max task | TBT | Heap |
|---|---|---|---|---|---|---|---|---|
| Fast 4G · Apple 4,879 (reference) | 9.5, 7.9, 5.4 | 1.1 s | **4.6 s** (4.3-6.2) | 5.1 s | 8.0 s | 974 ms | 2.0 s | 19 MB |
| Fast 4G · Amazon 5,000 | 8.7, 7.3, 5.2 | 1.0 s | **4.9 s** (4.9-5.9) | 5.4 s | 6.1 s | 873 ms | 2.3 s | 32 MB |
| Fast 4G · Amazon 9,098 (40 MB fit) | 8.6, 6.9, 4.7 | 1.1 s | **6.6 s** (6.4-6.7) | 7.5 s | 8.2 s | 1,015 ms | 3.4 s | 51 MB |
| Fast 4G · Amazon 22,415 | 7.8, 6.1, 6.9 | 1.1 s | **10.5 s** (10.0-11.1) | 11.1 s | 11.9 s | 1,565 ms | 5.1 s | 62 MB |
| Fast 4G · Meta 1,143 | 7.0, 5.8, 7.1 | 0.8 s | **3.0 s** (3.0-3.2) | 3.2 s | 3.8 s | 484 ms | 1.1 s | 8 MB |
| Slow 4G · Apple 4,879 | 7.0, 7.4, 7.7 | 2.0 s | **9.0 s** (8.9-9.1) | 9.4 s | 10.6 s | 924 ms | 2.1 s | 26 MB |
| Slow 4G · Amazon 5,000 | 8.2, 7.9, 7.5 | 1.9 s | **9.2 s** (9.2-9.5) | 9.8 s | 10.9 s | 829 ms | 2.8 s | 23 MB |
| Slow 4G · Amazon 9,098 | 7.6, 7.9, 7.6 | 2.1 s | **11.9 s** (11.4-12.3) | 12.5 s | 13.9 s | 871 ms | 4.2 s | 43 MB |
| Slow 4G · Amazon 22,415 | 6.8, 8.0, 7.1 | 2.0 s | **17.3 s** (16.2-18.4) | 17.8 s | 19.2 s | 1,582 ms | 4.8 s | 74 MB |
| Slow 4G · Meta 1,143 | 7.6, 8.9, 6.8 | 1.8 s | **6.3 s** (6.2-7.4) | 6.6 s | 8.1 s | 567 ms | 1.7 s | 8 MB |

An earlier sequential attempt (boards one after another while the load rose from 1 to 11) was
discarded: later boards got a busier machine.

Full Fast 4G runs (one each, load 3-6): drawer, filter change, sort, Insights, map and switch.

| Board | Filter change (+ Show N) | Sort (lowest pay) | Insights wall / longest task | Map first open | Heap after load |
|---|---|---|---|---|---|
| Apple 4,879 | 1.8 s | 0.65 s | 3.3 s / 3.0 s | 1.9 s | 19 MB |
| Amazon 5,000 | 2.1 s | 0.39 s | 3.2 s / 2.9 s | 2.1 s | 33 MB |
| Amazon 9,098 | 1.8 s | 0.65 s | 4.3 s / 3.9 s | 3.2 s | 50 MB |
| Amazon 22,415 | 2.1 s | 0.73 s | 4.7 s / 4.2 s | 3.1 s | 60 MB |
| Meta 1,143 | 1.7 s | 0.62 s | 1.2 s / 1.1 s | 0.9 s | 8 MB |

Cost grows with the posting count: on Fast 4G about 0.33 s of first card per 1,000 Amazon postings
(4.9 s at 5,000, 6.6 s at 9,098, 10.5 s at 22,415); heap 32 → 51 → 62 MB.

### 3.6 The fit: options and the recommendation

| Option | Postings shown | Boards | Worst first card (Fast 4G) | Notes |
|---|---:|---:|---|---|
| Whole board | 22,415 | 1 | 10.5 s (Slow 4G 17.3 s); Apple 4.6 s (9.0 s) | 86 MB file at 800 characters, over the 40 MB budget |
| 40 MB fit (what the code did) | 9,098 | 1 | 6.6 s (11.9 s) | silent: the page said "9,098 roles"; no posting without pay survives |
| Split by business unit (AWS / Operations / the rest) | 22,415 | 3 | ~6.5-7 s, interpolated (AWS 8,573, rest 10,005) | each file fits 40 MB; two units heavier than Apple; one crawl must write three boards |
| Split by country (US / elsewhere) | 22,415 | 2 | > 6.6 s (US 12,135) | the "elsewhere" board is 94% without pay |
| **Posting budget of 5,000, said on screen** | **5,000** | **1** | **4.9 s (9.2 s)** | **recommended** |

**Recommendation: one Amazon board with a 5,000-posting budget** (`maxPostings: 5000` in
companies.js): those with a published pay range first, then the newest, the same ranking the size fit
already used. The page says "5,000 roles · of 22,415 posted", and the badge says what was kept and that
the rest are on Amazon's careers site. Why:
- it is the only option where no board is heavier than Apple on a phone, the beta budget's heaviest
  board after perf-mobile-beta;
- it is the smallest change that works on the first crawl: the size fit already caps and records
  `jobsCapped`; this adds a count budget in front of it. The splits need one crawl to write several
  boards (matrix, merge, archive and ledger per unit), and still leave AWS and the rest heavier than Apple;
- for a salary chart, the dropped postings are mostly ones without pay; 5,000 is 40% of the 12,588
  with pay (synthetic mix).
Cost: 77% of the board is not on the page, the map shows North America only, and Amazon's international
roles are missing. If the user wants more of Amazon, the next step is the business-unit split with the
same budget per unit (AWS 5,000 + the rest 5,000 = 10,000 shown in two Apple-sized boards).

Implemented (my files): the budget in `fitSnapshot(…, { maxPostings })`; `jobsCapped` now carries
`{ kept, total, by: 'postings' | 'bytes', rule, limit }`; the merge's summary shows the cap.
**Ledger fix:** a capped run's left-out postings used to be closed in the F4 ledger every run. A new
posting with the same title and place (common at Amazon) would then be linked to one as a repost.
`recordPublished` (snapshot.js, used by `runSnapshot` and the merge) keeps them open while last seen
within 14 days. The archive already treats a capped observation as partial.
Patches: `cap-on-screen.diff` (build-static.js carries `jobsCapped` into the list and its `meta`, which
api.js passes through; app.js shows it on the count line, the badge tip and the badge details).

### 3.7 Synthetic Meta

1,143 pages (70% US with pay: annual, intern monthly, 3% hourly; 30% abroad without; 2% JSON-LD only;
one closed posting in the sitemap): 1,143 jobs, 799 with pay, 7.7 MB snapshot, gate passes, list 0.4 MB
(40 kB gzip), first card 3.0 s on Fast 4G. No fit needed.

## 4. Replayable steps

```sh
W=.claude/worktrees/agent-a1c62b6a147fed3b9; S=<scratchpad>/amb
ln -s /home/user/melon-seek/node_modules node_modules; mkdir -p data/beta
ln -s /home/user/melon-seek/data/snapshots data/snapshots; ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots
node --test test/bigtech-*.test.js test/amazon-meta-*.test.js
# probe with every fetch() logged (paused companies: no FETCH lines)
PROBE_MODE=recon PROBE_COMPANIES=amazon,meta PROBE_RAW='[{"url":"https://www.amazon.jobs/en/search.json"}]' node --import $S/trap-fetch.mjs scripts/probe-bigtech.js
# synthetic crawl through the real pipeline (pause lifted in that process only)
node test/amazon-meta-synth.js --out $S/synth2                       # 155 s
node $S/variants.mjs $W $S/variants                                   # 22,415 / 5,000 / unit split
node $S/sizes.mjs $W                                                  # bytes per posting at each trim
# builds, one at a time (MELON_BETA_COMPANIES adds amazon/meta to the build without touching the registry)
GITHUB_SHA=amb-base MELON_BUILT_AT=2026-10-11T00:00:00.000Z node scripts/build-static.js --out $S/dist-base
GITHUB_SHA=amb-prod MELON_BUILT_AT=… MELON_BETA_SNAPSHOT_DIR=$S/snaps-prod MELON_BETA_COMPANIES=$S/extra-prod.json node scripts/build-static.js --out $S/dist-prod
GITHUB_SHA=amb-var  MELON_BUILT_AT=… MELON_BETA_SNAPSHOT_DIR=$S/snaps-var  MELON_BETA_COMPANIES=$S/extra-var.json  node scripts/build-static.js --out $S/dist-var
node $S/distsize.mjs $S/dist-prod apple amazon meta
PORT=5571 node scripts/cycle/serve.mjs --dist $S/dist-var --pid $S/serve-var.pid &
NODE_PATH=<scratchpad>/pw/node_modules node $S/perf-amb.mjs http://127.0.0.1:5571/melon-seek/beta/ var-fast --co=apple,amazon5k,amazon,amazonfull,meta --net=fast4g --no-leak
bash $S/interleave.sh && (cd $S && node medians.mjs)                 # 3 interleaved cold passes per network
kill "$(cat $S/serve-var.pid)"
bash $S/mkdiffs.sh                                                    # docs patches
npm test
```

## 5. Verification

- **My tests** (`node --test test/bigtech-*.test.js test/amazon-meta-*.test.js`): 54/54 on 3cf226e.
  - `amazon-meta-resume` (4): the paused half and the resumed half of 3.2 (25 s, builds two sites).
  - `amazon-meta-adapters` (10): the 3.3 cases.
  - `amazon-meta-fit` (4): the budget, `jobsCapped`, `recordPublished`, and the merge with a capped snapshot.
  - `bigtech-sources` and `bigtech-polite`: the fetch tests run with the pause lifted in-process, the
    Amazon partition test runs on a consistent synthetic site (the old mock's facets said 10,650
    postings and served 400, which the new completeness rule refuses), and the paused list is read
    from the registry.
- **`npm test`** (12:56-12:59, load 3.8-4.9): 909 tests, 889 pass, 19 TODO (other lanes' open items:
  data-check-beta-2, vetting-beta), **1 fail**: `bigtech-polite` "politeRequest: … per-host spacing"
  measured gaps of 14 and 40 ms at a 40 ms interval. It passes 3/3 when run alone (load 3). It is
  polite.js timing under load (the lead's file, changed in 3cf226e); reported, not changed.
- **Production path with the budget**: `node test/amazon-meta-synth.js --out $S/synth3 --meta 0`:
  22,415 listed, 5,000 kept with full descriptions, 38.3 MB, no trimming, 146 s, peak RSS 1.8 GB.
- **Cap on screen** (patch applied to a scratch copy of the tree, built with that snapshot, phone
  390×844): the count line reads "5,000 roles · of 22,415 posted"; the badge tip and details say
  "Showing 5,000 of the 22,415 roles posted: the ones with a published pay range first, newest first.
  The rest are on Amazon’s careers site."; the list and its `meta` carry `jobsCapped`; 0 page errors.
  Screenshot: scratchpad `amb/cap-amazon-390.png` (not committed).
- **Patches**: all five apply in order on 3cf226e (`patch -p1` on a scratch copy; `git apply --check`
  for the first two); bigtech-probe.yml with the workflow patch parses (PyYAML).
- **No request to either site**: every crawl here ran against the synthetic stand-ins
  (`installFetch` throws for any other URL), and the probe checks ran with `fetch()` trapped.

## 6. Known gaps and follow-ups

- Nothing here touched the real sites. On resume, watch the first crawl's notes: the partition
  coverage line, any category still at the cap, the 95% check, Meta's JSON-LD-only count, and the
  real per-posting size (it decides whether 5,000 also needs description trimming; synthetic: no).
- The country/category mix is assumed; the real facets decide the unit split if it is wanted.
- The browser numbers come from a shared machine (load in the table) and synthetic text; gzip will be
  less kind to real descriptions.
- Server mode (`/api/jobs`) does not carry `jobsCapped` into `meta` (server/index.js, not patched; the
  beta site is static).
- Incremental Meta crawl (3.4) and the business-unit split (3.6) are proposals only.
- `resume.diff` has "FILL IN" for the date and the decision's link, for whoever applies it.

Patches for the lead (docs/process/patches/), in this order:
1. `amazon-meta-backend-tests-registry.diff`: apply now. The three tests read the paused list from the
   registry, so resuming needs no test edit.
2. `amazon-meta-backend-cap-on-screen.diff`: apply now (inert until a board is capped).
3. `amazon-meta-backend-data-sources.diff`: apply now (§7 paused paragraph, 7a Amazon row rule, 7e
   completeness and size, 7g fallback, failures and requests).
4. `amazon-meta-backend-workflows.diff`: apply now (bigtech-probe.yml `none` mode; input text).
5. `amazon-meta-backend-resume.diff`: apply **only when the user decides** (after 3): companies.js
   (the switch), README, DATA_SOURCES §7 status, PLAYBOOK, cycle README, SKILL.

## 7. Change log

- 2026-10-11 11:35 Worktree, symlinks, prompt saved. Read the docs and code; traced the paused path.
- 11:45 Guards (crawlBlock, the probe), adapter fixes, synthetic boards. Commit 56f3fab (now 29770f2).
- 12:09 Resume test (both halves) and adapter edge-case tests. Commit 10d7d2b (now 49ba34a).
- 12:15-12:36 Synthetic crawl, variants, three builds, Fast 4G full runs.
- 12:38 Container restart; resumed, rebased onto 3cf226e. Interleaved cold passes; posting budget,
  ledger rule, patches, this log. Commit 2e4892c.
- 12:52-13:00 Budgeted synthetic crawl, cap-on-screen check in the browser, `npm test`.
