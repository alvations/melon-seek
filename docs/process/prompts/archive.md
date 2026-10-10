# Prompt: archive (historical data archive engineer)

Verbatim task prompt given to the archive agent:

---

You are the HISTORICAL DATA ARCHIVE engineer for melon-seek, a "Zillow of job postings" with salary charts, a map, a Juice Score, market comps across companies and levels, Compstimate and Insights.
- Repo: /home/user/melon-seek. Branch: claude/stoic-ride-54ddxp, which is also the repo's default branch and the only remote branch, so scheduled and workflow_run triggers fire from it.
- Stack: zero-build vanilla ES modules, Node >= 18, no new npm dependencies.
- Read first:
  - docs/CONTRACT.md, docs/ARCHITECTURE.md, docs/VETTING.md, README "History ledger", docs/process/TEMPLATE.md and docs/process/lead.md (the latest sections);
  - scripts/history.js, scripts/snapshot.js, scripts/build-market.js and .github/scripts/ledger.sh;
  - the workflows: pages.yml, snapshot.yml and col-refresh.yml.

The user's requests, verbatim:
(1) "These numbers and our data will shift as time pass … a way to pull in new data to update all of them … monthly update for all these numbers, but be VERY VERY thorough …"
(2) "not just the ones un-related to the job positings, ALSO include all the company and job related numbers esp. when we compare them across the levels etc. And make sure we dont lose ANY of the old data, at some point maybe we have some sort of historical data anlaysis of those numbers too so that we can have some sort of annual review of how the numbers changed within the years and across the years per job / per company and also the non-job / non-company numbers, make sure this backend database is well established properly maintained and autonmatically updated and kept in the repo!"

A freshness lead agent is building the monthly refresh for reference numbers: FX, Big Mac, rents, cost index, tax tables and so on. Its registry is data/freshness.json; read docs/DATA_FRESHNESS.md for the dataset ids. YOU build the permanent, append-only historical database that it and the daily job pipeline write into.

TODAY'S RISK. Job-board snapshots exist only as workflow artifacts: `job-board-snapshots` (14-day retention) and `job-board-snapshots-beta`. The history ledger is the `history-ledger` artifact (90 days). Salary-vetting reports, including LLM verdicts, are kept 30 days. The first real data, from about 2026-10-02, starts expiring around 2026-10-16. Snapshots are gitignored because they are large: anduril alone is about 38 MB.

PRIORITY 1 — RESCUE: within your first steps, build and run a backfill.
1. Write a workflow_dispatch workflow, .github/workflows/archive-backfill.yml. It:
   - lists every non-expired artifact of those names from TRUSTED runs, reusing ledger.sh's trust rules: push, schedule or workflow_dispatch runs of this repo on trusted branches only;
   - downloads them in date order with GH_TOKEN, run by run;
   - folds each into the archive;
   - commits the archive to the data branch.
2. Push the workflow and scripts, trigger the workflow with the GitHub MCP tools (ToolSearch "select:mcp__github__actions_run_trigger,mcp__github__actions_list,mcp__github__actions_get,mcp__github__get_job_logs"; repo alvations/melon-seek, ref claude/stoic-ride-54ddxp) and read the job logs. Iterate until every available artifact is archived, then report the date range rescued. Artifact download is blocked inside this sandbox but works inside Actions.

STORE (kept in the repo)
- Use an orphan branch in this repo, e.g. `data-archive`. Do not put it in the deploy branch's tree. The bot commits daily, and committing to the deploy branch would (a) make every agent's and the lead's pushes on claude/stoic-ride-54ddxp race with bot commits and (b) bloat the code history.
- Decide whether the existing `data-history` ledger branch (ledger.sh HISTORY_STORE=branch, never enabled) should become part of the same branch. Prefer one data branch with a clear layout, and make the F4 ledger restorable from it.
- Never force-push the data branch. Commits are append-only, with a manifest.
- Use plain text (JSONL/CSV) partitioned by year or month, so diffs are readable. Gzip only a partition that would exceed about 40 MB; GitHub's hard limit is 100 MB per file.
- Estimate the size per year and include it in the docs. The beta big-tech boards may add 50k+ postings.

DATA MODEL (design it properly and document it in docs/DATA_ARCHIVE.md with a schema version and migrations)
- Jobs, as versioned rows (slowly-changing dimension) per company:
  - one row per distinct version of a posting: validFrom and validTo dates (first and last seen), id, company, title (posted and readable), department, team, family, seniority/level, locations (canonical + raw), remote;
  - salary min/max/mid, currency, interval and text, the USD conversion with the FX rate and FX asOf used, and the vet flag;
  - url, a description hash, and keywords.
  - A new row only when something changes; disappearance closes validTo.
  - Decide whether full description text is stored (size, third-party text). Every number and structured field MUST be kept forever. Justify the call.
- Daily company aggregates: postings, salaried postings, opened, closed, pay changes, median and percentiles overall and by family × level.
- Monthly cross-company comparisons: the market-comps doc, i.e. every company × family × level cell (n, p10/p25/median/p75/p90, USD and native), Compstimate backtest results, Juice distributions per company or city, and the inputs used.
- Reference data, the non-job numbers: every version of every freshness-registry dataset (FX, Big Mac, rents by bedrooms, cost index, NYC baseline, tax tables by jurisdiction and tax year, score anchors and policy constants), stored as dated versions and never overwritten. Publish a CLI for the freshness lead and for workflows: `node scripts/archive/record.js --dataset <id> --asof <YYYY-MM-DD> --file <json> [--source <url>]`, idempotent for identical content.
- Audit data: salary-vetting flags and LLM verdicts per run.

INGESTION (automatic)
- Daily: .github/workflows/archive.yml on `workflow_run` of "Snapshot job boards" and "Deploy to GitHub Pages", plus workflow_dispatch.
  - It downloads that run's artifacts, after the same trust check, and ingests them.
  - It validates; it never ingests pay that failed the vetting gate as valid, but keeps it as quarantined with the flag.
  - It commits to the data branch with permissions limited to what it needs, `contents: write`, and actions pinned by the SHAs the repo already uses.
  - It keeps a concurrency group, so two runs never interleave.
- Monthly: reference versions, via the freshness lead's orchestrator calling record.js. Coordinate through its files; don't edit them.
- If pages.yml, snapshot.yml, ledger.sh or scripts/history.js need changes, write the exact diffs to docs/process/patches/archive-<name>.diff and list them in your report. A deploy engineer agent owns those files right now.

MAINTENANCE
- An integrity validator, scripts/archive/verify.js, run in CI on every archive commit and before every ingest:
  - schema per row;
  - append-only: closed partitions' checksums unchanged, row counts never decrease;
  - every job version's validFrom ≤ validTo;
  - a manifest with counts and checksums.
- Idempotent re-ingest: the same artifact twice changes nothing.
- A schema version, a migration script pattern, and a restore path (rebuild data/history/*.json from the archive).
- Test coverage: test/archive*.test.js with fixtures, covering versioning, close-out, idempotency, integrity failures, the reference-data CLI and the report.

ANALYSIS (annual review)
- scripts/archive/report.js --year YYYY [--company X] produces Markdown + JSON for:
  - per company: postings over the year (monthly), opened and closed, median pay by family × level and its change within the year and year over year;
  - jobs whose posted range changed (count and size);
  - cross-company and cross-level comparisons over time;
  - Juice by city over time;
  - reference-data changes: FX, rents, tax thresholds by tax year.
- Also a monthly mini-report.
- Reports are written to the data branch's reports/ by the workflows (monthly, and an annual run in January).
- No new UI now (the UI simplicity budget applies). Note in the docs how a future Trends view could read it.

OWNERSHIP (yours)
- scripts/archive/**, .github/workflows/archive.yml and archive-backfill.yml;
- docs/DATA_ARCHIVE.md;
- test/archive*.test.js and test/fixtures/archive/**;
- docs/process/archive.md (your log, per TEMPLATE.md) and docs/process/prompts/archive.md (save this prompt verbatim first);
- docs/process/patches/archive-*.diff;
- the data branch's contents.
Do not edit other agents' files: the big-tech data engineer, the beta deploy engineer, the Juice household and tax agents, and the freshness lead.

GIT
- You may commit and push to claude/stoic-ride-54ddxp ONLY your own new files (scripts/archive/**, your workflows, tests, docs and your process files). These don't change the deployed site; still run `npm test` (green) before each push.
- `git add <explicit paths>`, never -A. Never pull, rebase, stash or force-push; if a push is rejected, stop and report.
- NEVER switch branches in /home/user/melon-seek: other agents share it. If you must work on the data branch locally, use `git worktree add` under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/archive/ and remove the worktree when done. Prefer letting the Actions workflow create and maintain the branch.
- End every commit message with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc
- Never use `pkill -f` or `pgrep -f`.

FINAL REPORT
- What was rescued: artifact date range, and row counts per table.
- The data branch layout and schema.
- Workflows, schedules and the permissions they need.
- Size projections.
- The report sample, e.g. the 2026 year-to-date annual review.
- Patches the lead must apply.
- Test results and open risks.
