# Data archive: the permanent, lossless history of every number

melon-seek re-fetches job boards every day and refreshes its reference numbers monthly.
The **data archive** keeps everything it has ever seen, so nothing is lost and any day
can be rebuilt or compared later. It covers:
- every version of every posting, full text included;
- per-company daily aggregates;
- monthly cross-company and cross-level comparisons;
- every version of every reference dataset (FX, Big Mac, rents, cost index, NYC baseline, tax tables, policy constants);
- every salary-vetting flag and LLM verdict;
- every F4 ledger entry.

**The archive is the system of record.** Workflow artifacts are only transport: they expire after 90 days at most. The F4 ledger
(`data/history/*.json`) is a working cache: it prunes closed entries after
`PRUNE_CLOSED_DAYS` = 400 days (server/history.js). The archive holds every ledger entry
within a day of the entry changing, long before that prune can drop it.

Code: `scripts/archive/` on the code branch. Data: the orphan branch **`data-archive`**.
Schema version: **1** (`MANIFEST.json` `schemaVersion`, `scripts/archive/lib.js` `SCHEMA_VERSION`).

## 1. Where it lives and who writes it

- **Branch `data-archive`**: an orphan branch of this repository.
  - It is never merged into the code branch and never force-pushed.
  - Commits only ever add or extend data.
- **Why not the deploy branch:**
  - the bot commits several times a day, so agent and lead pushes would race with bot commits;
  - code history would grow by hundreds of MB a year;
  - every push to the deploy branch also starts GitHub's branch-mode Pages build.
- **Writers:** only `.github/workflows/archive.yml` and `archive-backfill.yml`. Both use the
  `scripts/archive/branch.sh` worktree helper. It refuses `main`, `master`, `gh-pages` and
  `claude/*`, and pushes with plain `git push` only.
- **The `data-history` ledger branch** (`ledger.sh` `HISTORY_STORE=branch`, never enabled) is
  merged into this design. The archive keeps the newest ledger at `history/<slug>.json`, the
  exact layout `ledger.sh` restores in branch mode. One data branch serves both. See §9.
- **Readers:** anyone, read-only:
  - `git fetch origin data-archive`, then `git worktree add`;
  - or the monthly refresh's read-only checkout into `tmp/archive` (`MELON_ARCHIVE_DIR`).

## 2. Layout

| Path | Kind | Contents |
| --- | --- | --- |
| `MANIFEST.json` | meta | schema version, every file with kind, bytes, sha256 and row count, totals per table, migrations applied |
| `README.md` | meta | short pointer to this document |
| `jobs/<slug>/open.jsonl` | mutable | the open version of every posting of the company |
| `jobs/<slug>/ids.json` | mutable | `{ id: lastSeq }` for every id ever seen |
| `jobs/<slug>/YYYY-MM.jsonl` | append | versions closed during that month |
| `blobs/YYYY-MM.jsonl` | append | content-addressed values: description HTML, sections, whole artifact files |
| `observations/YYYY-MM.jsonl` | append | one row per snapshot observed (company + fetchedAt), with its top-level fields |
| `late/YYYY-MM.jsonl` | append | a snapshot older than the company's latest observation, kept whole |
| `daily/YYYY-MM.jsonl` | append | one aggregate row per company per UTC date |
| `monthly/YYYY-MM/*.jsonl, *.json` | immutable | the month's comparisons, frozen when the month is complete (§6) |
| `reference/<dataset>/<asOf>[~rev].json` | immutable | one version of one reference dataset |
| `reference/index/YYYY.jsonl` | append | one row per recorded version or confirmation |
| `audit/flags/YYYY-MM.jsonl` | append | every distinct salary-vetting flag record |
| `audit/verdicts/YYYY-MM.jsonl` | append | every distinct LLM or reviewed verdict |
| `audit/runs/YYYY-MM.jsonl` | append | each vetting run: counts and the records it had |
| `audit/refresh/YYYY-MM.jsonl` | append | each monthly-refresh result |
| `ledger/entries/YYYY-MM.jsonl` | append | every new or changed F4 ledger entry |
| `history/<slug>.json`, `beta/history/<slug>.json` | mutable | the newest F4 ledger, the mirror (§9) |
| `ingests/YYYY-MM.jsonl` | append | every artifact considered, with every file and where it went |
| `state/companies.json`, `state/blob-index.json` | mutable | per-company state, and blob hash → partition |
| `raw-rescue/<artifact>/<run>-<id>/` | immutable | as-is gzipped artifact copies (§12) |
| `reports/annual/YYYY.md, .json`, `reports/monthly/YYYY-MM.*` | derived | the reviews (§7) |

**Partition rules.**
- **Append partitions.**
  - Partitioned by the month the rows were written (UTC); the reference index by year.
  - A partition is never rewritten: rows are only appended. Once its month is over it is **closed**, and its bytes never change again.
  - A partition that would pass 40 MB rolls over to `YYYY-MM.2.jsonl` and so on. That keeps every file plain text and under GitHub's 50 MB warning and 100 MB limit, with no gzip.
- **Mutable files** keep current state and are rewritten in place.
  - Every earlier version stays in git history.
  - verify.js proves that no row ever leaves a mutable file without landing in an append partition.
  - A mutable file over 40 MB is stored gzipped (`open.jsonl.gz`). Readers accept both forms.
- **Plain text everywhere.** JSONL is one JSON object per line, keys in a fixed order, so diffs read line by line.

## 3. Schema v1

### 3.1 Job versions (`jobs/<slug>/…`): a slowly-changing dimension, lossless

A posting has one row per distinct version. Field order:

| Field | Meaning |
| --- | --- |
| `id`, `company`, `seq` | posting id (`<slug>:<source id>`), company slug, version number 1..n per id |
| `validFrom` | first observation (snapshot `fetchedAt`) with this version |
| `validTo` | last observation with it. `null` in `open.jsonl` means "seen in the company's latest observation" (`state/companies.json` `lastObservedAt`); a posting missing from a partial observation keeps its last-seen time there, plus `missedAt` |
| `end`, `endAt` | why and when the version ended: `changed` (a new version replaced it), `closed` (missing from a full observation), `gap` (missing from a partial observation, back unchanged later), `unseen` (missing for 30 days from partial observations). `endAt` is the first observation without it |
| `cause`, `changed` | why this version started: `new`, `reopened` (the id came back), `resumed` (after a gap), `source` (the company edited the posting), `derived` (only parsed/derived values changed, e.g. a parser or normalizer update), `touched` (only `updatedAt`). `changed` lists the top-level fields that differ from the previous version (`vet` for a new gate verdict) |
| `titleReadable`, `family` | analytic: readable title (`public/features/roles.js`), role family (`roleFamily`) at ingest |
| `vet`, `vetCodes`, `vetReason` | the vetting gate's verdict at ingest (`server/vet.js` `vetSalaries`, the same gate as the site): `ok`, `quarantined` (codes and reason kept), `none` (no pay) |
| `usd` | `{ min, max, mid, fxPerUSD, fxAsOf }`: the vetted pay in USD with the exact rate and FX table date used; `null` when quarantined or no pay |
| `descHash`, `descLen` | hash and length of the description's plain text (an archive-owned, frozen normalization), to tell text edits from markup edits |
| `norm` | normalizer version the analytic fields were derived with |
| `up` | only for snapshots from an older normalizer: the fields the build's upgrade changed (`locations`, `remote`, `sections`, `keywords`), as the site showed them |
| `src` | **the posting exactly as the snapshot had it**: every field (`title`, `department`, `team`, `employmentType`, `seniority`, `locations` canonical + `rawName`, `remote`, `salary` with min/max/mid/currency/interval/text/kind/source/spread/zones/ranges, `salaryRaw`/`salaryFlag` when the snapshot carried them, `url`, `updatedAt`, `postedAt`, `reqId`, `extras`, `keywords`, `sections`, `descriptionHtml`, and any field added later). A top-level value of 1 KB or more (always `descriptionHtml`) is a blob reference `{ "$blob": "<hash>" }` |
| `key` | hash of `src` + the vet verdict: a new version starts exactly when it changes |

Read rows with `view(row)` (`scripts/archive/jobs.js`). It merges `src` and `up` and applies
the vet verdict:
- `salary` is the vetted pay, so a quarantined row gives `salary: null` and `salaryRaw` holds the pay;
- `rawLocations` lists the source location strings.

Quarantined pay is never treated as valid. Aggregates, comparisons and reports read only `view(row).salary`.

### 3.2 Description text: kept, once per distinct text

The full description HTML is archived. Every number and structured field is a direct field
of `src`. The text is kept too, for re-parsing with future parsers and for reconstruction.

- **Deduplication.** Postings share boilerplate-heavy text, and a posting keeps its text
  across versions. Each distinct value is stored once in `blobs/` under
  `h = sha256(canonical JSON)[0:32]`. On the real 2026-10-02 set, 5,413 postings needed 9,161
  blobs (descriptions plus extracted sections).
- **Third-party text.** The site already publishes these descriptions
  (`dist/api/desc/<slug>/<id>.json`), and the postings are public. The archive keeps what the
  site published and adds no new exposure. The repository is public; if that changes, nothing
  here needs to change.

### 3.3 Other tables

| Table | One row per | Main fields |
| --- | --- | --- |
| `observations` | snapshot file seen | `company, channel, observedAt, status` (`folded`, `late`, `rejected` + `detail`), `payload` (every top-level snapshot field except `jobs`, e.g. `company`, `mode`, `normalizerVersion`, `descriptionsTrimmedTo`, `jobsCapped`), `extraJobs` (repeated ids or malformed entries, verbatim), `artifact`, `file {sha256, bytes}`, `partial`, `suspectDrop`, counts (`jobs, postings, salaried, quarantined, opened, reopened, resumed, closed, unseen, changed, payChanged, sourceChanged`) |
| `daily` | company per UTC date | `date, observedAt, since, postings, salaried, quarantined`, counters since the previous daily row, `usd` (n, p10, p25, p50, p75, p90 of USD midpoints), `cells`: `[family, level, n, p10, p25, p50, p75, p90]` for family x level, family x `*` and `*` x level |
| `ledger/entries` | new or changed F4 entry | `company, channel, id`, the entry (`f l p k r c n o s`, server/history.js), `ledgerRunAt, ledgerRuns` |
| `audit/flags` | distinct flag record | `key`, `firstSeenAt`, the full flags.jsonl line (`id, company, title, url, parsed, excerpt, pay_snippets, flags, critical, quarantined, salaryFlag`) |
| `audit/verdicts` | distinct verdict | `key, source` (`artifact` or `repo`), the full verdict line (`verdict, corrected, evidence, reviewer, model, usage, …`) |
| `audit/runs` | vetting run | `at`, `counts` (flags.counts.json), `blocking`, `flagKeys`, `verdictKeys` (which records the run had) |
| `audit/refresh` | monthly-refresh result | `ranAt, id, mode, status, module, summary, findings, evidence, writes` |
| `reference/index` | dataset version | `dataset, asOf, kind` (`version` or `confirm`), `rev, sha256, identity, bytes, file, source, by, recordedAt, taxYear?` |
| `ingests` | artifact | `key` (`artifact:<id>`), `status` (`ingested`, `empty`, `untrusted`), `name, id, runId, workflow, event, branch, headSha, createdAt, via?`, `files: [{ path, bytes, sha256, stored }]`, where `stored` is `snapshot`, `ledger`, `late`, or `blob` + `blob` hash |
| `blobs` | distinct value | `h, bytes, v` (a string, a JSON value, or for whole files `{ encoding: utf8 / base64 / gzip+base64, bytes, sha256, data }`) |

## 4. Reconstruction: lossless, checked on every ingest

`node scripts/archive/reconstruct.js --company <slug> --date YYYY-MM-DD [--out file]` rebuilds
the company's snapshot of that day: its last observation of that date, or `--at ISO` for an
exact observation. It is assembled from:
- the observation row (`payload` and `extraJobs`);
- the versions valid at that time;
- the blobs, with every reference resolved.

**Guarantee:** the rebuilt snapshot deep-equals the ingested snapshot file. That covers
every top-level field and every field of every posting, description HTML included. One
difference is documented:

- **Volatile, not kept:** the order of `jobs`. Rebuilt snapshots list postings sorted by id. The board API's listing order carries no data and changes from fetch to fetch. Every comparison sorts both sides.

How it is enforced:
- **Before anything is written.** `ingest.js` assembles each observation from the archive's own rows and compares it with the snapshot. Any difference aborts the ingest, and the workflow commits nothing from that batch. Workflow logs report `reconstruct deep-equal checks passed: N`.
- **After every run.** `reconstruct.js --check-all` rebuilds every observation and checks its posting counts.
- **In tests.** `test/archive-lossless.test.js` rebuilds every fixture day, also after later days changed its postings. It covers repeated ids, non-object entries, reference-shaped values, late observations, partial (capped) boards, and raw-rescue copies.

`node scripts/archive/restore.js --snapshots-out data/snapshots` writes every company's latest
snapshot the same way. Use it to rebuild the site after the artifacts have expired.

## 5. Ingestion

### 5.1 Artifacts

| Artifact | From | Archived as |
| --- | --- | --- |
| `job-board-snapshots` | snapshot.yml | job versions + observations + daily rows (stable) |
| `job-board-snapshots-pages` | pages.yml (patch §13) | the same, for runs whose snapshot.yml failed |
| `job-board-snapshots-beta` | snapshot.yml beta-merge | job versions (beta channel) + the beta ledger |
| `beta-crawl-<slug>` (and `beta-crawl-rejected-<slug>`, patch §13) | snapshot.yml matrix jobs | the same snapshots, archived before the merge. The archive applies its own vetting gate, so a snapshot the beta gate rejected is archived with its pay quarantined |
| `history-ledger` | both | mirror + `ledger/entries`. Every artifact is read; one that is not newer than the mirror is kept as a blob |
| `salary-vetting` | pages.yml | `audit/*`, plus every file whole as a blob |
| `monthly-refresh-report` | monthly-refresh.yml | `report.json` → `audit/refresh`; `archive/manifest.json` and `reference/manifest.json` + files → reference versions. Every file is also kept whole |
| `archive-reference` | any workflow | a `record.js` spool directory |

The archive does **not** ingest `github-pages`, the built site. It is derived entirely from the
archived inputs and the code commit, and its retention is 1 day.

### 5.2 Rules

- **Trust.** The sweep uses the same rules as `.github/scripts/ledger.sh`:
  - a push, schedule or workflow_dispatch run of this repository;
  - on the default branch or a `TRUSTED_BRANCHES` branch;
  - never a fork, a pull_request or a workflow_run run.

  `test/archive-sweep.test.js` checks that ledger.sh and the sweep decide the same way, run by run. Artifact contents are untrusted data: JSON only, slug-checked names, 300 MB cap, nothing executed.
- **Order and idempotency.**
  - Artifacts are folded oldest first.
  - An artifact already in `ingests` is never downloaded again.
  - A snapshot whose company + fetchedAt is already archived is skipped. That covers the restored, carried-forward files inside later artifacts.
  - The same artifact twice changes nothing; this is tested byte for byte.
- **Late snapshots.** A snapshot older than the company's latest observation that was never seen is stored whole in `late/`. It is reconstructable but not folded.
- **Partial observations.** The following never close what they did not see:
  - a capped board (`jobsCapped`);
  - a "full" observation with under half the open postings (≥ 40 open; a likely truncated fetch);
  - a crawl whose list came back short (`crawl.list.complete: false`, docs/ARCHITECTURE.md
    "Incremental crawl and closures"), once patch §13 `incremental-crawl-archive-partial.diff` is
    applied. Until then such an observation closes the few postings it did not list (as `closed`);
    they resume as a new version when listed again.

  Missing postings keep their last-seen time. They resume as a new version (`gap` / `resumed`) or close as `unseen` after 30 days.
- **Vetting.** Every snapshot goes through the site's own upgrade and gate (`relocateJobs`, `rekeyBoardJobs`, `vetSalaries`, as in `scripts/build-static.js`). Implausible pay is archived as `quarantined` with its codes and reason, never as valid pay.

### 5.3 Workflows

| Workflow | Trigger | What it runs | Permissions |
| --- | --- | --- | --- |
| `archive.yml` | `workflow_run` of "Snapshot job boards", "Deploy to GitHub Pages", "Monthly data refresh"; daily 09:37 UTC; 1st of the month 04:23 UTC; manual | migrate → verify → sweep in batches (verify against the previous commit, commit each) → `record.js --from-repo` → `monthly.js` → `report.js --auto` → `reconstruct.js --check-all` → verify → commit | job `archive-ingest`: `contents: write` (the data branch only) + `actions: read` (artifacts); workflow level `contents: read` |
| `archive-backfill.yml` | manual: `mode` = `ingest`, `raw` or `dry-run`; `names`; `batch`; `expiring_before` | the same sweep without limits, or raw copies (§12) | the same |

- Both workflows share the concurrency group `archive` with `cancel-in-progress: false`, so two runs never interleave.
- GitHub keeps one pending run per group. Each sweep picks up everything not yet ingested, including the artifacts of runs whose archive run was replaced while pending.
- Actions are pinned by the SHAs the repository already uses.
- Commits come from `github-actions[bot]`.
- Pushes made with `GITHUB_TOKEN` trigger no workflows, so no loops.

## 6. Monthly cross-company comparisons (`monthly/YYYY-MM/`)

These are written once a month is complete: on the first archive run of the next month, or by `monthly.js --month`.
Each company is read **as of its last observation in that month**. The files are immutable.

| File | Contents |
| --- | --- |
| `market.jsonl` | every cell with n ≥ 1, `{ month, scope, company, family, level, n, usd: {p10…p90}, native: { <currency>: {…} } }`. Scopes: `company` (company × family × level, family × `*`, `*` × level); `stable` and `all` (company `*`: cross-company cells, without and with the beta boards). Readers apply minN (the site uses 3) |
| `market-doc.json` (+ `market-doc-beta.json`) | the published market-comps document exactly as `scripts/build-market.js` builds it |
| `compstimate.jsonl` | the Compstimate backtest per company with `BACKTEST_OPTS` (seed, maxN, dedupe): `medianAbsPctError, within10Pct, n, skipped` |
| `juice.jsonl` | Juice Score distributions (single household, city-centre 1-bedroom) per company and per city: `n, score {p10…p90}, netUSD, grades` |
| `inputs.json` | what the month was computed from: each company's observation, code sha, normalizer, market format and minN, FX table date and hash, cities.json hash and date, backtest options |

## 7. Reports (`reports/`)

`node scripts/archive/report.js --year YYYY [--company X]` and `--month YYYY-MM` print Markdown (`--json` for JSON). `--write` stores both.
In the workflows, `--auto` writes:
- the monthly report of every complete month that has none;
- the annual review of each year touched, year to date while the year runs;
- in January, the final review of the year before.

The annual review covers:
- **Per company:**
  - postings by month, opened, closed and changed (the first observation is the baseline);
  - median pay by family × level, first vs latest in the year, and year over year;
  - posted ranges that changed: count, up/down, size distribution and the largest moves.
- **Cross-company:** each family × level with n ≥ 3 at two or more companies, by month.
- **Cross-level:** the level ladder per company, by month.
- **Juice:** Juice Score by city over time (frozen months, plus a provisional current month).
- **Reference data:** versions per dataset; FX per currency; rents per city and field; tax probe changes by jurisdiction; tax years recorded.

The monthly mini-report covers:
- postings, opened, closed, pay changes and the median vs the previous month per company;
- the biggest family × level moves (≥ 5%);
- the Compstimate backtest;
- reference versions recorded;
- audit counts.

**A future Trends view** stays out of scope now (UI simplicity budget, ROADMAP §8). It could read:
- `reports/annual/<year>.json` and `reports/monthly/*.json` (small, already aggregated);
- or `daily/*.jsonl` cells for per-company time series.

A build step would publish a subset to `dist/api/trends/`, from a read-only checkout of this branch. No change to the archive is needed.

## 8. Reference data (the non-job numbers)

```sh
node scripts/archive/record.js --dataset <id> --asof <YYYY-MM-DD> --file <json> [--source <url>] [--tax-year YYYY] [--confirm] [--archive DIR]
node scripts/archive/record.js --from-repo     # every dataset the code branch defines
node scripts/archive/record.js --import <dir>  # a spool or a monthly-refresh hand-off
node scripts/archive/record.js --list [--dataset <id>]
```

- **Ids** are the freshness registry ids (`data/freshness.json`, docs/DATA_FRESHNESS.md). `repo.*` is reserved for `--from-repo`.
- **Versions are never overwritten.**
  - Identity is the canonical content: key order and a top-level `exportedAt`/`generatedAt` are ignored.
  - The same content as the dataset's latest version is a no-op.
  - `--confirm` notes a new as-of date for unchanged content once.
  - Different content with an as-of date that already has a version becomes a revision, `<asOf>~2.json`.
  - A revert to older content is a new version.
- **`--from-repo`** captures these on every archive run, as a new version only when they change:
  - `repo.fx-palette` and `repo.fx-juice`: FX tables with their as-of;
  - `repo.cities`: the whole of data/cities.json, with rents by bedrooms, Big Mac, cost index, NYC baseline and sources;
  - `repo.juice-model`: every exported constant of server/juice.js;
  - `repo.tax-probe`: `taxFor` of every jurisdiction and household on a fixed income grid. A change there means a tax rule changed;
  - policy constants: `repo.salary-policy`, `repo.vet-policy`, `repo.market-policy`, `repo.compstimate-policy` (with `BACKTEST_OPTS`), `repo.roles`, `repo.keywords-lexicons`, `repo.history-policy`, `repo.normalizer`;
  - `repo.companies`: the board registry;
  - `repo.freshness-registry`;
  - and, into `audit/verdicts`, the reviewed `data/vetting/<date>/verdicts.jsonl`.
- **Monthly refresh hand-off** (freshness lead).
  - `scripts/refresh/run.js` writes `tmp/refresh/`:
    - `report.json`;
    - `archive/manifest.json` + `<dataset>/<asOf>.json`;
    - `reference/manifest.json` + `<id>.json`, exported before the refresh changes anything.
  - `monthly-refresh.yml` uploads that directory as `monthly-refresh-report`.
  - `archive.yml` runs on its completion and imports it (`importSpool`).
  - The freshness workflow only reads the archive (a read-only checkout into `tmp/archive`). It never writes it.

## 9. F4 ledger and restore

- The archive mirrors the newest ledger at `history/<slug>.json` and `beta/history/<slug>.json`.
  It also appends every new or changed entry to `ledger/entries` (lastSeen-only changes excluded), and keeps every ledger file that is not newer than the mirror as a blob.
- **Restore** (`node scripts/archive/restore.js`):
  - `--out data/history` uses the mirror. `--from replay` rebuilds the ledger with `updateLedger` over every archived observation.
  - `--channel beta` restores the beta ledger.
- **`ledger.sh` (patch §13).** When no trusted `history-ledger` artifact exists, `restore` falls back to the archive mirror (read-only), instead of starting fresh. Setting `HISTORY_STORE=branch` with `LEDGER_BRANCH=data-archive` also works for reads.
  - Do **not** enable `persist-ledger` against `data-archive`: `ledger.sh commit-branch` writes a tree of `history/` only. `archive.yml` already persists the ledger.
- **No change to server/history.js or scripts/history.js is needed.** The prune is a cache policy of the working ledger. The archive is the record.
- **Closures in the ledger (2026-10-11).** An entry's `c` (closedAt) now comes with `x`, the reason:
  `absent` (missing from a complete list), `gone` (a closure probe got 404/410/a redirect away, or
  the board returned no record for a listed posting), `unseen` (missing from partial lists for
  `UNSEEN_OPEN_DAYS` = 14). A partial list (capped, or shorter than the board's own count) closes
  nothing for being absent, and a posting the run listed but did not publish (the cap, a failed
  detail) stays open; a failed crawl records nothing. `ledger/entries` keeps `x` with the entry.
  Rules: docs/ARCHITECTURE.md "Incremental crawl and closures".
- **Incremental crawls do not change what is archived.** Snapshots from an incremental crawl are
  identical to a full crawl's except for the top-level `crawl` summary (kept in the observation's
  `payload` like `jobsCapped`), so job versions, `validFrom`/`validTo` and closures are the same
  (`test/incremental-equivalence.test.js` ingests both and compares `jobs/<slug>/`). The crawl
  state (`job-board-crawl-state[-beta]`, `crawl-state-<slug>`) is a cache and is never ingested.

## 10. Integrity (`scripts/archive/verify.js`)

Before every ingest, `verify.js` checks the tree on its own:
- `MANIFEST.json` lists every data file with the right sha256, bytes, rows and kind;
- no file sits outside the layout;
- every row of every table matches its schema;
- job versions:
  - validFrom ≤ validTo;
  - contiguous `seq` 1..n per id, matching `ids.json`;
  - at most one open version per id, and it is the latest;
  - closed versions carry `end` and an `endAt` after `validTo`;
  - `src.id` equals `id`;
- blobs:
  - each stored once under its content hash;
  - the index is exact;
  - every reference from versions, observations, late copies, ingests and refresh rows resolves.

Before every commit, with `--prev-rev HEAD`, it also checks the tree against the previous commit:
- closed partitions and immutable files are byte for byte unchanged;
- open append partitions only grew: the old bytes are a prefix of the new file;
- no table's row count went down, and no listed file disappeared;
- every previously open job version is still open, unchanged apart from validTo/missedAt, or was closed into an append partition unchanged apart from the close.

On manual dispatch, `--history N` re-checks each of the last N commits against its parent.

Tests: `test/archive.test.js` covers these failure cases:
- an edited row;
- validFrom after validTo;
- a dropped open version;
- a rewritten partition;
- a changed closed partition;
- a stray file;
- an unlisted file.

`test/archive-lossless.test.js` covers blob tampering and a missing blob.

## 11. Schema versions and migrations

- `MANIFEST.json` `schemaVersion` is checked on every run: verify fails when it differs from the code's `SCHEMA_VERSION`.
- To change the schema:
  1. bump `SCHEMA_VERSION`;
  2. add `scripts/archive/migrations/NNN-<name>.js` exporting `from`, `to = from + 1`, `description` and `async migrate(dir, { now, log, lib })`.
- `migrate.js` runs at the start of every archive run. It applies pending migrations in order, once each, and records them in the manifest (`migrations`).
- Rules:
  1. never rewrite a closed partition or an immutable file. To reshape old rows, write converted copies as new tables and keep the originals;
  2. never drop rows;
  3. be idempotent.
- Changing the version key or a stored row shape needs a migration that recomputes `key` for open rows, or every posting would look changed.
- `test/archive-report.test.js` runs a sample migration.

## 12. Raw rescue

`archive-backfill.yml` with `mode: raw` copies trusted artifacts as-is, gzipped, to `raw-rescue/<artifact>/<run>-<id>/` (`scripts/archive/raw.js`). With `expiring_before`, it copies only those expiring before that time.
- `meta.json` holds the artifact, run and trust, plus sha256 and size for each file.
- Files over 40 MB gzipped are split into `.gz.000`, `.001`, …
- The copies are immutable and outside the tables. The next sweep ingests them losslessly from the branch itself, even after the artifact expired. The ingest log shows `via: raw-rescue`.
- The fallback agreed with the lead: if lossless v1 were not on the branch by 2026-10-14T00:00Z, run `mode: raw` for everything.

## 13. Changes needed in files other agents own (patches)

| Patch | Target | Why |
| --- | --- | --- |
| `docs/process/patches/archive-ledger.diff` | `.github/scripts/ledger.sh` | `restore` falls back to the archive's ledger mirror (read-only) when no trusted artifact exists, so the F4 ledger never restarts from zero. `restore-artifact` behaves as before |
| `docs/process/patches/archive-pages.diff` | `.github/workflows/pages.yml` | upload what each deploy fetched as `job-board-snapshots-pages` (14 days; transport only), so a day whose snapshot.yml run failed is still archived. Today those fetches exist nowhere |
| `docs/process/patches/incremental-crawl-archive-partial.diff` | `scripts/archive/ingest.js` | a snapshot whose `crawl.list.complete` is false (a list shorter than the board's own count) is a partial observation, like a capped one, so the archive does not close what it did not list (the ledger already does not) |
| `docs/process/patches/archive-snapshot.diff` | `.github/workflows/snapshot.yml` | upload a beta snapshot the gate rejected as `beta-crawl-rejected-<slug>`. It is never published, but today it is lost |

## 14. Size

**Measured after the rescue backfill.** This is `data-archive` at 41f4645: 2026-10-02 to 2026-10-10, 8 stable boards, 80 observations from 10 snapshot artifacts, plus 95 ledgers, 89 vetting reports and 3 refresh reports.

| Part | Raw on disk |
| --- | ---: |
| blobs (10,587 distinct values: descriptions, sections, whole report files) | 82.2 MB |
| job versions (14,532: 5,482 open, 9,050 closed) | 31.8 MB |
| ledger entries (14,629) and mirror | 6.2 MB |
| reference (129 versions) | 4.5 MB |
| audit (1,249 flags, 681 verdicts, 89 runs, 266 refresh results) | 3.0 MB |
| everything else (state, daily, observations, ingests, reports) | 1.7 MB |
| **total** (176 files) | **129 MB** |

In git, that full history (6 commits) is 30.4 MiB packed as served, and 14.2 MiB after `git repack -adf --window=250`.

**What drives growth.** In those 9 days:
- the first load of 5,413 postings took about 72 MB raw, roughly 8 MB compressed;
- on 2026-10-03 one normalizer change (snapshots from no version to norm-4) re-versioned about 5,300 postings, adding 25 MB raw of rows; blobs were reused;
- after that, the stable boards grew about **3.7 MB a day raw**.

About **75% of the new versions were `touched`**: only `updatedAt` changed. On 2026-10-06, Anduril re-stamped 2,326 postings at once. Next came new postings (about 80 a day) and real edits (about 50 a day).

**Projection per year**, from those rates:

| | Raw tree | In git (packed) |
| --- | ---: | ---: |
| stable boards (measured rate) | ~1.4 GB | ~0.3 GB |
| beta boards (about 10x the postings, if the churn is similar; not measured yet) | ~13 GB | ~2.5 to 3.5 GB |
| normalizer changes (one re-version of every posting each; about 25 MB stable, about 250 MB beta) | ~0.5 to 1.5 GB | ~0.1 to 0.2 GB |

The **stable** archive stays under the 2 GB a year line, both raw and in git. With **beta**, both would pass it.

**Plan.** Agreed with the lead: measure 7 days of beta first, then decide. Nothing is dropped meanwhile, and nothing below is implemented yet.
1. **Touch rows** (the biggest lever, about -70% of daily rows). A change to `updatedAt` alone becomes a compact row in `jobs/<slug>/touches/YYYY-MM.jsonl` (`{ id, seq, at, updatedAt }`, about 120 bytes) instead of a full 2.4 KB version.
   - `reconstruct.js` applies the latest touch at or before the requested time, so the archive stays lossless.
   - This needs schema v2 with a migration that recomputes `key` without `updatedAt` for the open rows.
2. **Gzipped blob partitions.** New blob partitions become append-only multi-member gzip (`blobs/YYYY-MM.jsonl.gz`), about 6x less raw tree. Closed plain partitions stay as they are, and readers already accept `.gz`.
3. **Partial checkout in the workflows.** `git fetch --filter=blob:none` plus a sparse checkout of state, open versions and the current month. The full verify moves to a weekly run.
4. **Long term**, past about 4 GB in git: mirror-push `data-archive` to a dedicated repository, rewriting nothing, and leave a pointer here. Git LFS is not recommended: its bandwidth is charged on every CI checkout.
