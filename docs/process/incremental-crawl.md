# Process log: incremental-crawl

## 1. Brief

Prompt: [prompts/incremental-crawl.md](prompts/incremental-crawl.md), plus two mid-task notes from
the lead (2026-10-11): cover ALL boards through ONE shared mechanism with a small per-source change
signal, lose nothing (every posting accounted for each run, reused postings carry their
last-verified time, the archive and ledger record exactly what a full crawl would, a run that cannot
prove its list complete closes nothing), commit at milestones, document once (ARCHITECTURE,
DATA_SOURCES, a PLAYBOOK section); and rebase onto 859c8e0 (S-1: the merge downloads each
`beta-crawl-*` artifact into its own folder and keeps only accepted crawls).

Goal: stop re-reading every detail page on every 6-hourly crawl, and make closures right.

Files owned and changed: `server/sources/incremental.js` (new), `server/sources/{apple,eightfold,google,meta,amazon,polite,util,greenhouse,ashby,lever}.js`,
`server/history.js`, `scripts/history.js`, `scripts/snapshot.js`, `.github/scripts/beta-snapshots.mjs`,
`.github/scripts/ledger.sh`, `.github/workflows/snapshot.yml`, `docs/ARCHITECTURE.md`,
`docs/DATA_SOURCES.md` §8, `docs/DATA_ARCHIVE.md` §5.2/§9/§13, `docs/process/PLAYBOOK.md`,
`test/incremental-{boards.js,equivalence,closures,unit}.test.js`, the patch
`docs/process/patches/incremental-crawl-archive-partial.diff`. Not touched: `public/*`, `server/pipeline.js`, `scripts/archive/*`.

## 2. Inputs and sources

- What existed (confirmed by reading): `snapshot.yml` crawls stable boards daily (one list call each)
  and every beta board in full every 6 h (matrix job per company, merge, deploy); every detail page
  was fetched every run. The ledger (`server/history.js#updateLedger`) closed every id missing from
  a run's published list. `recordPublished` re-opened entries a capped run left out while last seen
  within 14 days. Amazon refused a list under 95% of the facet total, but a 95-99.9% list was
  published and its missing postings closed. Google dropped postings whose detail request failed
  (up to 20%), so the ledger closed them although they were in the sitemap. Eightfold and Apple map a
  failed detail from the row alone.
- `server/normalize.js#normalizeJobs` is board-wide: boilerplate paragraphs (≥ 50% of the board),
  team paragraphs, ubiquitous keywords (> 90%), `vetSalaries` outliers. Beta snapshots may also be
  description-trimmed. So reusing the previous snapshot's NORMALIZED job (the prompt's suggestion)
  cannot give a full crawl's output; the cache holds raw detail records instead (decision 1).
- `docs/DATA_SOURCES.md` §1, §3b, §4, §7: list fields per board; no recorded response headers
  anywhere (fixtures keep bodies), so ETag/Last-Modified support is unknown for every host.
- Archive (`scripts/archive/ingest.js`): every file in a known artifact that is not a snapshot or
  ledger is kept whole as a blob, and `beta-crawl-*` names are ingested. So the crawl state must be
  a differently named artifact (decision 6). Observation rows keep every top-level snapshot field,
  so the snapshot's `crawl` field is kept small.
- Churn: `git fetch origin data-archive`, `observations/2026-10.jsonl` and `jobs/<slug>/*.jsonl`
  read with `git show` (script: scratch `churn.mjs`, deleted). Per consecutive observation: new,
  reopened, `source` changes split into row-visible and detail-only, closed.

## 3. Decisions and rationale

1. **Raw-detail cache, whole-board normalization.** Each adapter maps (current row + cached raw
   detail) with its unchanged mapping code; `normalizeJobs` runs on the whole board each run.
   Result: identical snapshots whenever cached details are unchanged upstream. Alternative
   (normalized reuse) rejected: board-wide normalization and trimmed descriptions break identity.
2. **One module** (`server/sources/incremental.js`): `rowKey` (64-bit FNV over sorted JSON),
   `deltaPlan`, `runDetails` (the shared detail step and failure policy), `conditionalGet` /
   `conditionalList` (304 support), `probeAbsent` / `probeRequest` / `classifyProbe`,
   `accountPostings`, `planSummary`. Adapters contribute only a change-signal function and a request.
3. **Change signals** (lists of fields, docs/DATA_SOURCES.md §8): fields an edit or repost moves;
   volatile ones (`solrScore`, `stars`) excluded; Apple managed-pipeline rows exclude `postingDate`
   (re-stamped every request). The row is always re-mapped from the current list, so any row field
   change still reaches the snapshot.
4. **Refresh age = 4 days, spread over [2, 4] days per posting** (`MELON_DETAIL_REFRESH_DAYS`).
   Numbers: detail-only ("silent") edits seen in the archive were ≤ 0.3% of a board per 6-h run
   (Apple 18 of 6,102 on 2026-10-11 00:02; Microsoft 4 of 2,298 on 2026-10-10 22:43); row-visible
   edits and new postings 0.1-1%. With a mean refresh interval of ~3 days a run re-reads ~1/12 of a
   board (8%); a silent edit is shown at most 4 days late. 2 days would double the cost (17%/run)
   for ~1 day less staleness; 7 days would save 4 points but show pay edits up to a week late.
   The spread avoids the 2-hour spike an "every Nth run is full" rule would bring.
5. **Closures**: absent from a complete list → `x: absent`; partial list (shorter than the board's
   own count, or capped) → open while seen within 14 days, then `x: unseen`; probe 404/410/redirect
   away or an empty record → `x: gone`; listed-but-unpublished (cap, failed detail) → open; failed
   crawl → nothing written. Probes: ≤ 50 per board and run, only on partial lists, only for ids the
   previous crawl listed, through the polite client; a 200/403/5xx never closes.
6. **Crawl state in CI**: `crawl-state-<slug>` (crawl job) → merged `job-board-crawl-state-beta`
   (30 days), `job-board-crawl-state` for the stable job; restored with `ledger.sh restore-artifact`
   (trusted runs only). Names chosen so the archive never ingests them (a cache, ~20-40 MB gz per
   run). Fallback: no state = full crawl (the archive holds normalized jobs only, which cannot be
   reused, decision 1). A crawl that did not finish keeps its previous state.
7. **Stable boards**: list-only, one request; no updated-since parameter exists (§1, §3b, §4). A 304
   would save bandwidth only, and would need a stored raw response; not used. Validators are
   reported (`crawl.validators`) so the next real run shows whether the hosts send them.
8. **"Last-verified time"**: kept per posting in the crawl state (`at`), and the snapshot carries
   `crawl.detailsVerifiedSince` (oldest). Not a per-job field: that would make incremental and
   full snapshots differ and add a new archive version for every posting on every refresh.
9. Request rate untouched: `polite.js` gains only `allowNotModified` (a 304 is returned, not thrown).

## 4. Replayable steps

```
git checkout --detach 3f47ddc; git rebase --onto 859c8e0 3f47ddc   # after the lead's S-1 push
ln -s /home/user/melon-seek/node_modules node_modules               # + data/snapshots, data/beta/snapshots
git fetch origin data-archive                                       # churn: observations + jobs via git show
node --test test/incremental-*.test.js                              # 31 tests
MELON_BETA_SNAPSHOT_DIR=<empty dir> npm test
# locally, an incremental crawl: MELON_CRAWL_STATE_DIR=data/crawl-state node scripts/snapshot.js microsoft
# force a full one: MELON_FULL_CRAWL=1 ...; CI: snapshot.yml workflow_dispatch full_crawl: true
```

## 5. Verification

- `test/incremental-equivalence.test.js` (18): for each of Apple, Google, Microsoft, NVIDIA,
  Netflix, Meta, Amazon, Greenhouse (anthropic), Ashby (openai), Lever (palantir): full run, then
  edits/new/closed, then incremental vs full on the same board: snapshots deep-equal (but
  `fetchedAt`, `crawl`), ledgers deep-equal, accounting exact, detail requests = new + changed only;
  silent edits caught after the refresh age, refresh spread; archive: both runs ingested give
  identical `jobs/nvidia/` files and lossless rebuilds; `full_crawl` and missing state are full.
- `test/incremental-closures.test.js` (7): ledger rules; probe classification; Microsoft short
  list (open vs probe-confirmed gone, unseen after 14 days); a 403 mid-list writes nothing (snapshot,
  ledger and state byte-identical); Google failed record kept open; Amazon capped: left-out postings
  stay open past 14 days, also through `beta-snapshots.mjs merge` with the crawl-state dir; Apple
  short list probe.
- `test/incremental-unit.test.js` (6): politeness constants unchanged, signals, spread, fallback
  limit, accounting, 304 for details and the sitemap.
- Full `npm test` (MELON_BETA_SNAPSHOT_DIR empty), final: 972 tests, 936 pass, 35 todo (open
  review findings), 1 fail: `perf.test.js` "review V15: cold /api/market does not block the event
  loop", a timing goal (< 100 ms) under full-suite load on 4 CPUs; `node --test test/perf.test.js`
  alone passes 3/3, and it does not touch any file changed here. An earlier full run had the same
  flake on the PERF-1 event-loop test, which also passes alone.

## 6. Known gaps and follow-ups

- Apply `docs/process/patches/incremental-crawl-archive-partial.diff` (archive owner): until then
  the archive closes the few postings a short list missed, then resumes them.
- Whether each host sends ETag/Last-Modified, and whether Meta's sitemap has `<lastmod>`, is
  unknown until the first real run; read `crawl.notModified`, `crawl.validators` and Meta's
  `postings.changed` in the run log.
- Whether Apple/Eightfold detail APIs answer 404 for closed postings is unknown; a probe that gets
  200 or an error leaves the posting open, so the cost of being wrong is a 14-day delay, never a
  false closure.
- The first run after merge is a full crawl (no state yet). Crawl times in DATA_SOURCES §8 are
  estimates from the archive's churn, to be checked against the second run.

## 7. Change log

- 2026-10-11 892e162 shared module; big-tech adapters use it.
- 2026-10-11 c5adb95 closure rules, crawl state, accounting, beta merge.
- 2026-10-11 b566c9e snapshot.yml crawl-state plumbing, `full_crawl` input (rebased onto 859c8e0, S-1 kept).
- 2026-10-11 8755373, ed271c0, 10b5dfb tests (equivalence for every adapter, closures, unit, archive) and the archive patch.
- 2026-10-11 4346889 merge wording; a7453ee docs.
