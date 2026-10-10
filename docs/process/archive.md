# Process log: archive (historical data archive engineer)

## 1. Brief
- **Prompt:** [prompts/archive.md](prompts/archive.md), saved verbatim. The lead added three requirements by message (2026-10-10), recorded in §7.
- **Goal:** a permanent, append-only, lossless historical database in the repo for every job, company, comparison, reference and audit number. It is fed automatically and checked for integrity, with annual and monthly reviews. Priority 1 is rescuing the artifacts before they expire (from 2026-10-16).
- **Files owned:**
  - scripts/archive/**;
  - .github/workflows/archive.yml and archive-backfill.yml;
  - docs/DATA_ARCHIVE.md;
  - test/archive*.test.js and test/fixtures/archive/**;
  - this log;
  - docs/process/patches/archive-*.diff;
  - the `data-archive` branch.

## 2. Inputs and sources
- **Docs:**
  - docs/CONTRACT.md (Job shape, v2 and v3 fields);
  - ARCHITECTURE.md;
  - VETTING.md (gate semantics, flags.jsonl and verdict schemas);
  - README "History ledger";
  - process/TEMPLATE.md;
  - process/lead.md (latest sections);
  - DATA_FRESHNESS.md (registry ids, the `archive` result field).
- **Code:**
  - scripts/history.js and server/history.js: ledger format, `PRUNE_CLOSED_DAYS` = 400, `serializeLedger`, `updateLedger`;
  - scripts/snapshot.js: payload shape, `fitSnapshot` trimming and capping, `jobsCapped`;
  - scripts/build-market.js: `buildMarket` and the percentile method;
  - scripts/build-static.js `readSnapshot`: the upgrade-then-vet path the archive copies;
  - public/features/compstimate.js `backtest`, and server/index.js `BACKTEST_OPTS`;
  - server/juice.js `attachJuiceAll` and `taxFor`;
  - .github/scripts/ledger.sh: the trust rules;
  - scripts/refresh/run.js: the `exportReference` / `writeArchivePayloads` hand-off layout.
- **Workflows:** pages.yml, snapshot.yml (including the matrix `beta-crawl-<slug>` artifacts), col-refresh.yml, monthly-refresh.yml (untracked when read), ci.yml, test/workflows.test.js (the contents: write rule).
- **GitHub API, read from the sandbox:**
  - 8 job-board-snapshots artifacts (2026-10-02 12:48Z to 2026-10-09 13:26Z; first expiry 2026-10-16T12:48Z);
  - 85+ history-ledger and 79+ salary-vetting artifacts;
  - no beta or refresh artifacts yet.
  - Paginated listings beyond page 1 fail through the sandbox proxy (numeric repository paths). Inside Actions they work.
- **Local data:** data/snapshots/*.json, the real 2026-10-02 05:54Z set (5,413 postings; the data the 2026-10-02 vetting review used). Used for size and speed measurements only. Never published.

## 3. Decisions and rationale
1. **One orphan data branch, `data-archive`.** The data-history ledger branch is folded in at `history/<slug>.json`, the layout ledger.sh branch mode reads.
   - Alternatives: the deploy branch, which would race with bot commits, bloat code history and trigger the README Pages build; a separate repo, which needs extra credentials.
   - Single writer: archive.yml and archive-backfill.yml, through branch.sh, in the `archive` concurrency group.
2. **Partition by write month, not by data date.** A partition is closed when its month is over, so the "closed partitions never change" rule has a clock. Rows carry their own dates. Past 40 MB, a partition rolls over to `.2.jsonl` instead of gzipping, so closed files are never rewritten.
3. **Job versions as an SCD with mutable open state.**
   - `open.jsonl` holds open versions, and `validTo: null` means "seen in the latest observation". A daily ingest then rewrites only the rows that changed, instead of every row.
   - Closed versions are appended in the month they close.
   - Alternative rejected: daily rows per job, about 2M rows a year stable and 20M with beta.
4. **Lossless rows (lead requirement 2).**
   - `src` is the posting exactly as observed. Large fields are content-addressed blobs (`blobs/`, sha256 of canonical JSON), so each distinct text is stored once.
   - Analytic fields (vetted pay, USD with rate and date, family, readable title, descHash) sit beside `src`. `up` holds what the normalizer upgrade changed for old snapshots.
   - The first design stored only a description hash and trimmed unknown salary and location fields. It was rejected before any real data was written: the dry run was the only Actions run, and the real backfill was held until v1 was lossless.
5. **What counts as a new version.** Any change in `src`, or in the vet verdict.
   - `cause` tells source edits (`source`) from parser or normalizer effects (`derived`) and timestamp-only updates (`touched`).
   - Reports use `cause` to separate company edits from re-derivation.
6. **Volatile:** only the order of `jobs`. The board's listing order carries no data. The ingest-time deep-equal check sorts both sides by id.
7. **Every artifact file is accounted for.** Snapshot and ledger files are archived structurally. Everything else (vetting reports, refresh reports, older ledgers, unknown files) is stored whole as blobs. The ingest log lists each file with its sha256 and where it went.
8. **Partial observations and late data.**
   - Capped boards, and suspicious drops below 50% of ≥ 40 open postings, never close what they did not see. Returns are `gap` → `resumed` versions; 30 days unseen means `unseen`.
   - A snapshot older than the latest is stored whole in `late/`.
   - A carried-forward copy of an already-folded snapshot is a duplicate and is skipped.
9. **Trust = ledger.sh's rules**, reimplemented in sweep.js with a parity test that runs ledger.sh against a stub `gh`.
   - Run lookups are lazy and cached on disk, to stay inside GITHUB_TOKEN's ~1000 requests/hour.
   - A single full artifact listing also catches the `beta-crawl-*` prefix.
10. **Batches and failure.**
    - `--max` counts only snapshot artifacts. The workflow commits after each batch, verified against the previous commit.
    - A download failure skips that artifact.
    - An ingest or reconstruct failure aborts the batch, so nothing is committed and the next run retries.
11. **The workflow job is named `archive-ingest`.** The lead allowed it by name in test/workflows.test.js, as commit ed7d127. My first commit used `persist-ledger` to pass the old rule.
12. **Reference data:**
    - `record.js` per version, idempotent by canonical content;
    - `--from-repo` captures the code-defined datasets on every run (ids `repo.*`, kept apart from registry ids);
    - the freshness `monthly-refresh-report` artifact is imported by archive.yml on workflow_run;
    - `repo.tax-probe` records `taxFor` on an income grid for every jurisdiction and household. That is how tax tables are tracked, since the RULES object is not exported.
13. **Monthly comparisons are frozen when the month is complete**, as of each company's last observation in the month.
    - `market.jsonl` keeps every cell with n ≥ 1. Readers apply minN.
    - `market-doc.json` is exactly the published `buildMarket` document.
14. **No change to history.js.** The archive captures every ledger entry change within a day. The prune is a cache policy. ledger.sh gets a read-only fallback to the archive mirror (patch).
15. **Size plan proposed, not implemented:** gzip multi-member blob partitions, partial checkout, and a dedicated repo in the long term. The git-compressed growth is about 0.6 GB a year with beta, under 2 GB. The raw tree would pass 2 GB a year once beta lands (DATA_ARCHIVE.md §14).

## 4. Replayable steps
```sh
# Local lossless ingest of a snapshot directory, then integrity and a rebuild
node scripts/archive/ingest.js --archive /tmp/a --name job-board-snapshots --dir data/snapshots --artifact-id 1
node scripts/archive/verify.js --archive /tmp/a
node scripts/archive/reconstruct.js --archive /tmp/a --company anthropic --date 2026-10-02 --out /tmp/anthropic.json
node scripts/archive/record.js --archive /tmp/a --from-repo
node scripts/archive/monthly.js --archive /tmp/a --now 2026-11-02T00:00:00Z
node scripts/archive/report.js --archive /tmp/a --year 2026
# Sweep against the live API from a sandbox (listing only; downloads need Actions)
GITHUB_REPOSITORY=alvations/melon-seek TRUSTED_BRANCHES=claude/stoic-ride-54ddxp node scripts/archive/sweep.js --archive /tmp/a --dry-run
# In Actions: workflow_dispatch archive-backfill.yml (mode ingest | raw | dry-run)
npm test
```

## 5. Verification
- **Real data, 2026-10-02 set (8 companies, 5,413 postings):**
  - lossless ingest: 8/8 snapshots rebuilt deep-equal;
  - 72 MB raw (8.7 MB gzip), 9,161 blobs;
  - verify OK in 3.6 s; ingest 33 s.
  - The first version took 12 minutes because of a quadratic `appendRows`, since fixed.
- **Synthetic 3-day variant of the real data:**
  - the annual report showed opened, closed, range changes with sizes, cross-level ladders, Juice by city and reference datasets;
  - the replayed ledger matched the archive's counts.
- **Tests:** test/archive*.test.js, 40 tests across archive, archive-sweep, archive-workflows, archive-reference, archive-lossless and archive-report. All pass.
- **Full suite:** in an isolated worktree with HEAD plus only my files, `npm test` gives 409 tests, 402 pass, 0 fail, 7 skipped. In the shared working tree, other agents' uncommitted build-static/api.js changes and concurrent dist/ builds fail unrelated tests.
- **Patches:** the three apply to HEAD. test/workflows.test.js passes with them. The ledger.sh mirror fallback was simulated against a local bare remote.
- **Actions:** dry run 38038097817 failed at `migrate.js`. ed7d127 had picked up my working-tree workflow edits before migrate.js was committed. That is harmless: it failed before writing. Commit 2 fixes it.

## 6. Known gaps and follow-ups
- The real backfill runs after commit 2 is pushed. Results go in §7 and the final report.
- Beta size is a projection until the first beta artifacts exist. Measure 7 days, then decide on the §14 plan.
- `github-pages` (the built site) is not archived. It is derived and reproducible from the archive plus the code commit.
- If archive.yml ever stops for longer than 90 days, artifacts from that window are lost. The daily schedule plus workflow_run make this unlikely. A raw-mode dispatch is the manual fallback.
- verify reads every partition, which is fine for years at this scale. Partial checkout is part of the size plan.

## 7. Change log
- 2026-10-10 08:00Z: prompt saved; read inputs; listed artifacts through the API.
- 2026-10-10 08:10Z: commit d894b23 (stage 1: lib, jobs, ingest, sweep, verify, branch.sh, workflows, tests). The lead pushed it with bef4cd0 (level-only cells, yearly partitions) and ed7d127 (job renamed to archive-ingest).
- 2026-10-10 08:30Z: lead message: retention-days 90 everywhere; keep everything forever; lossless with the full description; reconstruct.js with deep-equal; never delete; size report; ingest monthly-refresh-report. I held the real backfill until v1 was lossless, and the lead agreed, on two conditions: a raw-rescue mode, run by 2026-10-14T00:00Z if v1 was not on the branch; and the real backfill run immediately after the push.
- 2026-10-10 09:30Z: commit 2: lossless v1 (blobs, src rows, reconstruct.js, raw.js, late/ copies, gap versions, every ledger entry, whole-file blobs); reference.js/record.js; monthly.js; report.js; restore.js; migrate.js; docs; patches.
