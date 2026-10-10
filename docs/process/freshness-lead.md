# Process log: freshness-lead (data freshness lead)

## 1. Brief
- Prompt: [prompts/freshness-lead.md](prompts/freshness-lead.md). It includes the lead's mid-task course correction, which extended the scope to job and company numbers and added the archive agent.
- Goal:
  - List every number, rate, threshold, constant, dataset and comparison that the product shows, cites or computes from.
  - Give each one a way to be refreshed. That can be automatic (fetch, validate, diff), "detect and alert" (compare with the official page), or a manual checklist with a due date.
  - Run it all monthly, like the daily job-board pipeline, behind a review PR or issue.
- Files owned:
  - data/freshness.json and docs/DATA_FRESHNESS.md;
  - scripts/refresh/** (run.js, lib.js, registry.js, fx.js and bigmac.js are mine; the other modules belong to sub-agents);
  - .github/workflows/monthly-refresh.yml and col-refresh.yml;
  - test/freshness*.test.js, test/refresh-run.test.js, test/refresh-fx.test.js, test/fixtures/refresh/{fx,bigmac};
  - docs/process/freshness*.md, docs/process/prompts/freshness*.md and docs/process/patches/freshness-*.diff;
  - the probe: .github/workflows/freshness-probe.yml and .github/scripts/freshness-probe.mjs.

## 2. Inputs and sources
- **Repo docs read:**
  - CONTRACT, ARCHITECTURE, LIVABILITY (all sections, including §4.2 rents by bedrooms, §6 Refreshing and §7 the Numbeo replacement plan), DATA_SOURCES, VETTING;
  - README sections, the latest lead.md sections, and every workflow;
  - scripts/update-col.js, scripts/llm-vet.js, scripts/build-market.js, scripts/methodology.js and scripts/build-og.mjs;
  - server/juice.js (constants, scores, tax section) and server/vet.js, plus the salary.js FX block;
  - public/viz/palette.js (its FX and Juice copies), public/app.js juiceBlock, public/features/compstimate.js and shared.js.
- **Live sources captured on a GitHub runner with freshness-probe.yml.** I decoded each locally from the job log with `--decode` and checked its sha256.
  - Run 38036442949, 2026-10-10:
    - `https://data-api.ecb.europa.eu/service/data/EXR/M..EUR.SP00.A?lastNObservations=2&format=csvdata`: every EXR monthly series, 19,444 bytes. Last-Modified 2026-09-30.
    - `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`: 2026-10-09, USD 1.1206.
    - `https://api.github.com/repos/TheEconomist/big-mac-data/commits?path=source-data/big-mac-source-data-v2.csv&per_page=1`: last commit 2026-08-04, "July 2026 update -- added Bulgaria to the Euro price".
    - FRED with a browser User-Agent timed out after 60 s.
  - Run 38036645890, 2026-10-10:
    - the ECB monthly series for the 21 currencies we use (`M.AUD+…+ZAR.EUR.SP00.A?lastNObservations=3`): Sep 2026 USD per EUR is 1.1513227272727276. This is fixture `test/fixtures/refresh/fx/ecb-monthly-2026-09.csv`.
    - `https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXTAUS` with UA `curl/8.5.0`: TWD 2026-09 is 31.7381. Fixture `fred-extaus.csv`, keeping the last 24 months.
    - `https://www.federalreserve.gov/releases/g5/current/default.htm`: G.5 dated 2026-10-01, TAIWAN DOLLAR Sep 2026 31.7381, the same as FRED. Trimmed fixture `fed-g5-2026-09.html`.
    - Fed H.10 and the CBC Taiwan site were captured but not used.
- **Read directly from the sandbox** (raw.githubusercontent.com is reachable): `https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/source-data/big-mac-source-data-v2.csv`, 151,598 bytes. The latest release is 2026-07-01 with 72 rows. Fixture `test/fixtures/refresh/bigmac/big-mac-source-data-v2.csv` keeps the 2026-01-01 and 2026-07-01 releases.
- **Web searches:**
  - The CBUAE dirham peg of 3.6725 has been in place since November 1997. This comes from Gulf News and The National coverage; I did not read the central bank's own page.
  - SAR 3.75 and QAR 3.64 are taken as encoded. QAR 3.64 was already in server/salary.js.
  - fx-usd-pegs therefore carries a "verify on the central banks' pages at the first yearly review" note.
- **Default branch:** `git remote show origin` on 2026-10-10 gave `HEAD branch: claude/stoic-ride-54ddxp`, and that is the only remote branch. This confirms the lead's finding.

## 3. Decisions and rationale
1. **One registry, stable ids.** `data/freshness.json` has one entry per dataset or constant group. The ids double as the archive's dataset keys, so they never change.
   - Tax entries are generated from `TAX_SOURCES`: `tax-<key lowercased>`, 71 of them today. Generating them avoids hand-maintaining 71 entries that the tax agent keeps editing. `test/freshness.test.js` fails on drift, and `registry.js --sync-tax` fixes it.
   - Alternative considered: hand-written tax entries. Rejected because they would drift at once; the tax agent changed TAX_SOURCES twice during this session, and the gate caught it both times.
2. **One orchestrator with module plugins.** `scripts/refresh/run.js` discovers modules (`MODULE` plus `check()`) and runs them in a fixed order over an in-memory overlay:
   - The order is bigmac, fx, rents, living, tax, jobs, policy, derived. Because of the overlay, FX changes reach the rents and the generated docs in the same run.
   - Only the orchestrator writes files, so validation sits in one place: `validateDoc` for cities.json, a JSON parse, and `node --check` for JS.
   - Alternatives considered: one workflow per family, like col-refresh, or each script writing its own files. Rejected: that means many PRs, no shared validation, and no single report.
3. **The review-PR safety model is kept.** monthly-refresh.yml grants `contents: write` at job level for the `bot/monthly-refresh` branch only. It stages exactly the files the orchestrator reports (`outcome.json`), never `git add -A`. Alerts go to one `data-freshness` issue that is updated each month and closes itself when clean.
   - col-refresh.yml becomes a manual-only shim (`run.js --only bigmac,fx`, branch `bot/col-refresh`). It has no schedule, so two workflows never open competing PRs.
   - test/workflows.test.js generalises the review-branch rule (patch `freshness-workflows-test.diff`).
4. **FX source change (needs the reviewer's eye).** The table was The Economist's Big Mac `dollar_ex` column. The Economist publishes it twice a year, and the code copies were only updated by hand, so it was already 3 months old. The new source is:
   - the ECB monthly reference-rate averages crossed through USD (official, machine-readable SDMX CSV, reuse permitted with acknowledgement);
   - TWD from the Federal Reserve G.5 via FRED EXTAUS, with the G.5 page as fallback, because the ECB does not publish TWD;
   - AED, SAR and QAR at their official pegs;
   - the ECB daily XML when the monthly API is down.
   All copies are rewritten together: cities.json, juice.js, palette.js, salary.js (including EXTRA_FX_PER_USD) and shared.js `FX_FALLBACK.CNY`.
   - Alternatives considered: keep Big Mac FX, which means six-month-old rates; or Fed H.10 alone, which lacks AED, CZK, ILS, PLN and SAR.
   - The Big Mac prices stay on their own updater, `bigmac.js`. It deliberately does not touch FX, so the two are refreshed and reviewed separately.
   - Validators: a move above 20% is flagged and nothing is written; above 10% is a warning; pegs must stay within 0.5%.
   - Effect on the first run (fixture, Sep 2026): 22 rates change and 239 USD rent fields are re-derived. The largest moves are KRW −8.6%, JPY −3.5% and NOK −3.1%.
5. **Staleness gate never blocks.**
   - test/freshness.test.js fails on structural problems only: schema, coverage, as-of consistency with the data, file:line references, extracts.
   - It reports stale entries as test diagnostics. `FRESHNESS_STRICT=1` makes them fail.
   - CI and Pages get a `run.js --staleness` step that is warn-only (`continue-on-error`) and writes a step-summary table (patches for ci.yml and pages.yml).
   - Daily-cadence entries, i.e. job data, show as "pipeline". The monthly job can't keep daily data fresh; snapshot.yml, pages.yml and site-watchdog do.
6. **lastChecked vs asOf.** Staleness counts from the later of the two dates. A source that hasn't published anything new stays fresh as long as someone checked it. This holds for 2026 tax rules in October, for example.
   - The refresh sets `lastChecked` for every ok or changed result. It moves `asOf` on `changed`, and on `ok` for fetched or derived data when the module saw newer data. That last case came from the freshness-jobs request.
7. **Archive integration without a store of our own.**
   - Before changing anything, the monthly run exports the live value of every dataset that has `extract` (`run.js --export-reference`).
   - It writes measurements, `Result.archive`, to `tmp/refresh/archive/` with a manifest.
   - It uploads both in the `monthly-refresh-report` artifact. The archive agent's `archive.yml` sweeps that artifact (`REFERENCE_ARTIFACTS` in scripts/archive/ingest.js).
   - Values changed by a refresh PR are archived once merged, by the archive's capture of the code branch.
   - Rejected: calling record.js from the monthly job. It would push to the data branch from a second workflow and would archive proposed, unreviewed values.
8. **Generated inventory.** The DATA_FRESHNESS.md tables, by cadence, by surface, no-mechanism-before and per entry, are rendered from the registry by `registry.js --docs`. They can't drift from the JSON.
9. **Sub-agents.** I have no Agent tool, so I sent their prompts to the lead, who launched them. Each prompt is a role block plus a shared COMMON block covering the interface, the ids, the other agents' ownership, the network and probe rules, and git.
   - Roster: audit-core, audit-surface, tax, col, jobs, derived, and review later.
   - Prompts: prompts/freshness-<role>.md. Logs: freshness-<role>.md.
10. **No-push rule.** Mid-task, the lead stopped every push to the deploy branch, because each push triggers GitHub's branch-mode Pages build, which publishes the README. Only the probe (commit b9b78db) went out before the rule. The probe's stdout fix is waiting in the lead's push batch.

## 4. Replayable steps
```sh
# probe a source from a runner (no push needed once freshness-probe.yml is on the branch)
#   GitHub MCP: actions_run_trigger run_workflow freshness-probe.yml ref=claude/stoic-ride-54ddxp
#     inputs.requests='[{"url":"https://...","name":"x.csv","ua":"curl/8.5.0"}]'
#   get_job_logs(job_id, return_content=true) -> saved JSON; take .logs_content into a file, then:
node .github/scripts/freshness-probe.mjs --decode run.log outdir/       # sha256-verified bytes
# build / maintain the registry
node <scratchpad>/freshness/build-registry.mjs --write      # first build (my entries + generated tax + fragments)
node scripts/refresh/registry.js --sync-tax --write
node scripts/refresh/registry.js --merge <fragment.json> --write
node scripts/refresh/registry.js --docs --write
# run
node scripts/refresh/run.js --dry-run --offline --out tmp/refresh
node scripts/refresh/run.js --staleness
node --test test/freshness*.test.js test/refresh-*.test.js
```

## 5. Verification

### Test files (all green in the main working tree on 2026-10-10)

| File | Tests |
|---|---|
| test/freshness.test.js | 8 |
| test/freshness-policy.test.js | 6 |
| test/refresh-run.test.js | 14 |
| test/refresh-fx.test.js | 10 |
| test/refresh-registry.test.js | 7 |
| test/refresh-col.test.js (sub-agent) | 30 |
| test/refresh-derived.test.js (sub-agent) | 19 |
| test/refresh-jobs.test.js (sub-agent) | 13 |
| test/refresh-tax.test.js (sub-agent) | 26 |

- I made test/refresh-derived.test.js independent of the current FX month, so it keeps passing after a refresh PR merges.
- test/refresh-fx.test.js runs against a fixed July 2026 baseline rebuilt from the Big Mac fixture, for the same reason.

### Full suite
- `npm test` in the main tree: green apart from other agents' in-flight work. Those failures vary minute to minute: the archive tests, the static-build "live vs bundle race" test (public/api.js mid-edit), and timing tests under load.

### "Refresh landed" simulation
- On a scratch copy I ran `run.js --offline --only fx,bigmac`, which writes. It changed data/cities.json, server/juice.js, public/viz/palette.js, server/salary.js, public/features/shared.js, data/freshness.json and the generated DATA_FRESHNESS.md inventory.
- Then I ran the whole suite on that copy. No freshness, juice, fx or derived test failed.
- This showed three pins, all fixed:
  - the derived test's "FX Jul 2026";
  - my own fx test's dependence on the repo state;
  - the registry/doc inventory equality. run.js now regenerates the inventory whenever it changes the registry.

### Patch application
- I applied all 17 freshness patches in the recommended order to a fresh copy of the tree. Every one applied.
- The full suite on that copy: 545/553 pass. The 1 failure is the pre-existing static race test.

### Dry runs
- Offline dry run (`node scripts/refresh/run.js --dry-run --offline`, with no local snapshots, as in CI): one result per registry entry, 0 registry problems, and no file changed. test/refresh-run.test.js checks this on a repo copy with content hashes.
- The live dry run on a runner (monthly-refresh.yml, `workflow_dispatch` with `dry_run: true`) waits for the lead's batch push (§6).

### Workflows
- `python3 yaml.safe_load` parses monthly-refresh.yml, col-refresh.yml and freshness-probe.yml.
- Every `run:` block passes `bash -n`.
- test/workflows.test.js passes with the review-branch patch: every action is pinned, contents: write is limited to the review branch, there is no pull_request trigger, and there is never a push to main or the deploy branch.

### Probe
- Decode self-tests: a 2 MB random body through a pipe gives 890/890 chunks with sha256 ok; with 127 BOM-prefixed chunk lines it still checks out.

## 6. Known gaps and follow-ups
- **Live run.** The orchestrator has not yet run on a GitHub runner end to end; the code is not on the branch. Every module was verified against real responses captured today on runners: the fixtures and the probe runs listed in each sub-agent log. After the lead's batch push, dispatch monthly-refresh.yml with dry_run=true.
- **FX source change.** The first real run will move every approx-USD figure; on the Sep 2026 fixture, KRW moves −8.6% and JPY −3.5%. A human should review the first PR.
- **Repo settings.** PR creation needs "Allow GitHub Actions to create and approve pull requests". Optional secrets: HUD_API_TOKEN (the HUD FY2027 FMRs are out, but eGIS still serves FY2026), ANTHROPIC_API_KEY and BLS_API_KEY.
- **Stale encoded data (2026-10-10), which the first run will report:**
  - 13 tax jurisdictions are still on tax year 2025, so their manual reviews are past due.
  - Columbus is on tax year 2024 (flag).
  - Next-year signals are published for IE (Budget 2027), CA EI 2027 and the Portland Metro SHS threshold.
  - 8 Numbeo rent quotes and 5 cost-index values are past due.
  - Node 18 and Node 20 are past end of life (engines, CI matrix).
- **Fragile locators.** Tax "detect" extractors read named constants and some inline literals in server/juice.js. When the juice-tax agent reshapes rules, they report `error`, which is never a false ok. freshness-tax-export.diff (TAX_PARAMS) is the durable fix.
- **Hosts that refuse runners.** ONS publishes its PIPR xlsx at 25 MB, which is too large for the probe log, so there is no fixture. ssa.gov, ato.gov.au, gesetze-im-internet.de, revenuquebec.ca and detroitmi.gov refuse runners, so those entries are manual or read another official page.
- **User decisions pending:**
  - D6, the Numbeo replacement plan;
  - the default "Mid" seniority, options A/B/C in the seniority-ladder notes;
  - keeping ECB FX instead of Big Mac dollar_ex.
- **Remaining work in other files:**
  - the methodology UX owner must make md.js drop whole-line HTML comments before the LIVABILITY markers land;
  - `app.js` "Pay ↑/↓" reads `job.payChange`, which nothing sets (audit-surface);
  - LEVEL_INDEX orders Manager before Staff+, while SENIORITY_LADDER orders them the other way round (audit-core).

## Batch for the lead (files, then patches in order)

**Files to commit.** All are new except where marked; none is in another running agent's ownership.
- `.github/workflows/monthly-refresh.yml`; `.github/workflows/col-refresh.yml` (modified);
- `.github/scripts/freshness-probe.mjs` (modified: the BOM-tolerant decode);
- `data/freshness.json`; `docs/DATA_FRESHNESS.md`;
- `scripts/refresh/`: bigmac, derived, examples, fx, jobs, lib, living, policy, registry, rents, run, tax-watch and tax (.js);
- `public/features/freshness.js`, from derived. It stays dormant until the ui-asof patch.
- tests:
  - `test/freshness.test.js`, `test/freshness-policy.test.js`;
  - `test/refresh-{run,fx,registry,col,derived,jobs,tax}.test.js`;
  - `test/fixtures/refresh/**` (about 1.7 MB of real captures and synthetic job fixtures);
  - `test/workflows.test.js`, modified, patch already applied by the lead;
- `docs/process/freshness-{lead,audit-core,audit-surface,col,derived,jobs,tax}.md` and `docs/process/prompts/freshness-*.md`;
- `docs/process/patches/freshness-*.diff`, the patch files themselves.

**Patches, in order.** Every one applies in this order to the 2026-10-10 tree; the suite was run on a patched copy.
1. `freshness-workflows-test.diff`: already applied.
2. `freshness-ci-staleness.diff`, `freshness-pages-staleness.diff`: the warn-only staleness steps.
3. `freshness-derived-api-freshness.diff`: build-static.js and server/index.js publish `api/freshness.json`.
4. `freshness-audit-core-backtest-fallback.diff`: build-static's BACKTEST_FALLBACK gets `dedupe: 'role'`. Apply only this one; audit-surface withdrew its duplicate.
5. `freshness-lead-retention-docs.diff`: README, ARCHITECTURE and VETTING now say artifacts are kept 90 days, not 14 or 30.
6. `freshness-derived-readme-builtins.diff`: the README built-in boards, 8 rather than 3.
7. `freshness-audit-surface-demo-mock-fx.diff`, `freshness-audit-surface-chart-fx-footnote.diff`.
8. After the Juice household and tax agents finish:
   - `freshness-derived-test-pins.diff` (test/juice.test.js, e2e);
   - `freshness-col-zurich-licence.diff` (cities.json);
   - `freshness-tax-export.diff` (juice.js TAX_PARAMS).
9. After the big-tech engineer finishes: `freshness-audit-core-bg-euro.diff` (salary.js, vet-salaries.js).
10. Last, because of app.js contention:
    - `freshness-derived-ui-asof.diff`, which needs step 3;
    - then `freshness-jobs-backtest-asof.diff`;
    - then `freshness-col-ui-rent-ids.diff`.
11. LIVABILITY, after the Juice batch:
    - first `freshness-col-livability-refreshing.diff`;
    - then `freshness-derived-docs-counts.diff`, resolving the one overlapping Numbeo row: keep col's text plus "88 of 89";
    - then md.js comment support, from the methodology owner;
    - then `node scripts/refresh/derived.js --insert-markers docs/LIVABILITY.md`.
12. `freshness-jobs-seniority-default.diff`: behaviour-neutral (it adds `seniorityBasis`). The label change is the user's decision.
13. After applying, run:
    - `node scripts/refresh/registry.js --sync-tax --lines --write`;
    - `node scripts/refresh/registry.js --docs --write`;
    - `npm test`.

## 7. Change log
- 2026-10-10 07:48: saved the prompt. I sent the 6 sub-agent prompts to the lead, since I have no Agent tool.
- 07:58: committed and pushed the freshness-probe workflow and helper (b9b78db). That was the only push.
- 08:01–08:05: two probe runs captured the ECB, FRED and G.5 sources, which became the FX fixtures.
- 08:05–08:20: wrote lib.js, run.js, bigmac.js, fx.js and registry.js, plus monthly-refresh.yml and the col-refresh.yml shim. Wrote test/refresh-fx (10 tests), refresh-run (13), freshness (8) and freshness-policy (5).
- 08:10: the lead's no-push rule arrived. From then on, everything is local.
- 08:20–08:30: merged the audit-core and audit-surface fragments (120 entries). Fixed probe stdout truncation (reported by freshness-col). Added keyPrefix and array paths to extracts, and the archive hand-off. Regenerated the workflows test patch after the archive agent's edit.
- 08:35–09:05:
  - merged the jobs and tax hand-offs, giving 131 entries;
  - added the review clock (`lastReviewed`, `reviewCadence`); manual results no longer stamp lastChecked;
  - added the compact PR/issue body (summary.md), year-rollover of extract constants, and regeneration of the inventory whenever the registry changes;
  - the FX updater now also converts the code-only currencies (CNY, ZAR, QAR);
  - unpinned the FX month in the tests;
  - simulated a landed FX refresh, and applied all 17 patches in order on fresh copies.

