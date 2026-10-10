# Process log: freshness-review (reviewer)

## 1. Brief
- Prompt: [prompts/freshness-review.md](prompts/freshness-review.md), written by the freshness lead. The lead note at launch overrides it: never push or commit; send findings to the freshness lead.
- Goal: cross-check `data/freshness.json` and `docs/DATA_FRESHNESS.md` against a fresh grep of the whole repo. Then, for each registry entry, check:
  - the updater, the validator and the checklist;
  - the source and its licence, and the as-of date;
  - the job and company numbers, especially comparisons across levels;
  - the safety model of the refresh workflows.
  Report the findings as `[{ severity, id?, file, problem, fix }]`.
- Files owned:
  - this log;
  - the prompt file;
  - the hand-off file `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/freshness/review-findings.json` (20 findings: 1 high, 7 medium, 12 low).
  Everything else was read-only.

## 2. Inputs and sources
- **Repo state:** working tree on 2026-10-10. HEAD is a9b5e7b; the freshness system is commit f68efe7; the registry has 131 entries.
  - Other agents were editing these files at the time: public/app.js (+101 lines against HEAD), public/api.js, scripts/build-static.js, scripts/md.js, scripts/methodology.js and docs/DATA_SOURCES.md.
- **Read:** the freshness-lead brief and log, docs/process/TEMPLATE.md, test/freshness.test.js and test/workflows.test.js.
  - scripts/refresh/{run,lib,registry,fx,bigmac,rents,jobs,policy}.js, the relevant parts.
  - scripts/update-col.js, docs/process/scripts/juice-household-rents.mjs, scripts/archive/{report,jobs,monthly}.js and scripts/methodology-figures.js.
  - server/juice.js (constants, TAX_HOUSEHOLD, computeJuice inputs), server/keywords.js (seniority, years, extras), server/salary.js:463 and server/sources/meta.js.
  - public/features/{compstimate,comps,insights}.js, public/viz/palette.js and every .github/workflows/*.yml.
  - The patches in docs/process/patches/freshness-*.diff (applied or held).
- **Live run:** monthly-refresh.yml dry run, run 38040981168, job 114181004341, read with the GitHub MCP get_job_logs tool.
  - The job ran with Contents: write, Issues: write and PullRequests: write.
  - It restored 8 stable snapshots (run 37936740568) and 8 ledgers (run 38040118354), but **no beta snapshots**.
  - It found no data-archive branch.
  - It exported 109 reference datasets.
  - The log prints only `tail -n 40`; its summary is "files changed: 7, alerts: 10, problems: 0".
- **snapshot.yml runs** (GitHub MCP actions_list): the 2026-10-04 to 2026-10-09 scheduled runs used commit a5326176, which predates the beta channel. That explains why there is no beta artifact.
- **Web:**
  - Whether `github.event.repository.default_branch` is empty on `schedule` events: [dorny/paths-filter](https://cremin.dev/actions/paths-filter/commit/9beb6f218461c133e5123a348daac81bb0c7fea6) notes that schedule events have no webhook payload.
  - The NSW Rent and Sales licence: the [Australian data catalogue](https://catalogue.data.infrastructure.gov.au/dataset/rdh-rent-and-sales-report-interactive-dashboard-nsw/resource/7717f49c-3dac-4d8d-909f-5138a20abaf0) and [data.nsw.gov.au](https://data.nsw.gov.au/data/dataset/housing-nsw-rent-and-sales-tables) list CC BY, while the DCJ report PDFs say © Crown Copyright. I could not resolve it: dcj.nsw.gov.au doesn't resolve from the sandbox.
- **Skills:** none were loaded. This is analysis only; no artifact was produced.

## 3. Decisions and rationale
1. **Grep strategy.** Four sweeps, because a plain grep of every numeric literal returns thousands of layout constants:
   - every `const UPPER_CASE = <number|object|array|freeze|Map|Set>` in non-test code whose name is absent from the registry (148 hits, triaged by hand);
   - lowercase numeric constants (8 hits, all layout);
   - years 2023–2027 outside juice.js;
   - number-bearing lines near no registry `file:line` in the feature and model files.
   I also listed the files the registry never mentions, and checked the coverage of every doc and of the data/cities.json schema (top level, per city, sources, audit and crossCheck rows, bedroomRatios).
2. **Verify behaviour, not text.** For the rent and FX paths I ran the orchestrator and update-col.js on scratch copies of the tree, outside the repo (`scratchpad/freshness/wt*`). Two findings rest on those runs, not on reading the code: the high one, and lastChecked-only PRs.
3. **Severity.**
   - high: a documented procedure produces wrong or contradictory user-facing numbers;
   - medium: a gap in coverage or safety that will bite on a normal monthly cycle;
   - low: misattribution, stale text, or hygiene.
4. **No patches written.** My ownership is limited to the three files above. Every fix is a precise description in the `fix` field, so the owners (household agent, archive agent, lead, col, jobs) can write it against their in-flight trees.
5. **The registry's coverage is genuinely broad.** Most job and company figures are present with checks:
   - comps cells (`market-comps`, `market-comps-policy`, `jobs-aggregates`);
   - `LEVEL_INDEX` (`compstimate-model`, via the geometric ladder check);
   - the backtest;
   - vetting tiers;
   - listing age;
   - the ledger;
   - Juice per job;
   - the share pages and OG card.
   So the findings concentrate on paths where two writers or two clocks disagree.

## 4. Replayable steps
```sh
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/freshness
node scripts/refresh/run.js --dry-run --offline --out $S/dry        # 131 results: ok 117, changed 1, drift 6, stale 2, flag 4, skipped 1; 0 problems
node scripts/refresh/run.js --staleness                              # "0 stale" (vs 2 stale in the dry run)
node scripts/refresh/registry.js --lines                             # 25 refs would move; 45 symbol-not-near-line refs found by $S/tools/check-lines.mjs
node scripts/refresh/run.js --export-reference $S/ref                # 109 datasets (og-card, strategy-market-figures are archive:false)
for p in docs/process/patches/freshness-*.diff; do git apply --check $p || git apply --check -R $p; done
# manual-rent simulation (scratch copy, outside the repo): oxford-gb rent1brCenterLocal 1710 -> 1900, then
node scripts/refresh/run.js --offline --only rents,living --out tmp/r1        # writes nothing; USD and 2br stay stale
node scripts/refresh/run.js --offline --only rents,fx,bigmac --out tmp/r1     # USD re-derived, 2br still 2109.97
node scripts/update-col.js --csv test/fixtures/refresh/bigmac/big-mac-source-data-v2.csv   # after the FX refresh: reverts fx to Big Mac 2026-07-01
node --test test/freshness.test.js test/fx-consistency.test.js                # 1 fail (freshness #4), fx-consistency passes
# lastChecked-only PR: set bigmac-prices.lastChecked=2026-09-01, run --only bigmac -> outcome.files=[data/freshness.json], dataFiles=[]
```

## 5. Verification
- `node --test test/freshness*.test.js test/refresh-*.test.js test/fx-consistency.test.js test/workflows.test.js`: 142/142 pass.
- `npm test` (whole suite, 2026-10-10): 579/580. The one failure, "review V15: cold /api/market does not block the event loop", is a timing test under load and not mine.
- **Patch state**, checked against the working tree and against HEAD:
  - applied: workflows-test, ci/pages-staleness, backtest-fallback, chart-fx-footnote, demo-mock-fx, zurich-licence, readme-builtins, test-pins, seniority-default, retention-docs, and derived-api-freshness (in HEAD; the working tree has since moved);
  - held, and still applying cleanly: bg-euro, ui-asof, jobs-backtest-asof, col-ui-rent-ids, col-livability-refreshing, derived-docs-counts, livability-markers, tax-export;
  - md-comments applies to HEAD only.
- **Safety model, checked:**
  - no workflow pushes to main or to claude/*; the refresh workflows push only to `bot/*`, and archive pushes only to `data-archive`;
  - the staleness steps are `continue-on-error`;
  - build-static guards a broken registry with try/catch;
  - every secret is optional and guarded by truthiness (`''` is treated as unset);
  - the LLM is advisory only;
  - no workflow triggers on pull_request, except ci.yml.
  Weak points are in findings 3, 9 and 10 of review-findings.json.

## 6. Known gaps and follow-ups
- The 10 alerts of the live run can't be enumerated: the pushed workflow keeps only the last 40 log lines, and artifact download is blocked. The working-tree workflow fixes that once it is pushed.
- Beta (big-tech) checks are unverified on real data until a beta snapshot.yml run completes. Re-dispatch the monthly dry run after that.
- The empty PR base on schedule events is inferred from third-party documentation. gh most likely falls back to the default branch, but I did not verify it on a runner.
- The SIX ISO 4217 list URL suggested in finding 6 was not fetched from the sandbox.
- No tax schedule was re-verified. That is the juice-tax agent's and freshness-tax's work.

## 7. Change log
- 2026-10-10 09:20–10:40: read the briefs and the registry, ran the dry runs, the greps and the scratch-copy simulations, and read the live job log.
- 10:40: wrote review-findings.json (20 findings) and this log, and sent the summary to the freshness lead.
