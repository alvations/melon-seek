# Data freshness: every number, where it lives, and how it is refreshed

melon-seek shows, cites and compares many numbers that go out of date as time
passes, for example:
- exchange rates, Big Mac prices, rents and living costs;
- tax brackets and social-insurance caps;
- market comps, Compstimate levels and the vetting bounds;
- the counts in the README and on the share card.

This page has three parts:
1. **What is refreshed and how:** the registry plus the monthly pipeline.
2. **The operator runbook.**
3. **The inventory**, generated from `data/freshness.json`. It covers every dataset and constant group, where it is defined, where users see it, its source, its as-of date, its cadence and its update mechanism.

Job postings themselves are refreshed every day by the job-board pipeline (`snapshot.yml`, `pages.yml`). Their history is kept forever by the archive ([DATA_ARCHIVE.md](DATA_ARCHIVE.md)). This page covers everything those numbers are measured, converted, taxed and compared with.

## 1. How it works

```
data/freshness.json  ──>  scripts/refresh/run.js (monthly, .github/workflows/monthly-refresh.yml, 3rd of the month)
   (registry: id,          │  one updater module per data family, run in this order on an in-memory overlay:
    owners, consumers,     │    bigmac -> fx -> rents -> living -> tax -> jobs -> policy -> derived
    source, asOf,          │  each returns one Result per registry id: ok | changed | drift | flag | stale | error | skipped
    cadence, mode)         │
                           ├─ auto    (fetch + validate + diff)   -> validated file changes -> bot/monthly-refresh branch + review PR
                           ├─ detect  (official page vs encoded)  -> drift / new tax year     -> one "data-freshness" issue, with evidence
                           └─ manual  (checklist + due date)      -> past due                 -> the same issue, with the checklist
                           then: npm test against the refreshed data (advisory, printed in the PR),
                                 report + archive hand-off uploaded as the monthly-refresh-report artifact
CI and Pages: node scripts/refresh/run.js --staleness   -> warn-only table of every dataset's age (never fails)
UI: dist/api/freshness.json (client subset of the registry) -> "as of" labels next to the numbers
```

**Safety model** (REVIEW.md V12):
- Nothing is pushed to the default or deploy branch. Every data change is a commit on `bot/monthly-refresh`, opened as a pull request for a human.
- Merging that PR deploys the change, because the default branch is the deploy branch.
- Two jobs. `refresh` fetches and parses the remote pages and PDFs, and runs `npm ci` and the tests, with a **read-only** token. `publish` holds the write token. It checks out without persisted credentials and never runs npm or parses remote content. It re-applies exactly the files `refresh` reported (from a 7-day `monthly-refresh-changes` artifact), refuses any path outside the data and code copies (`.github/`, dotfiles, `..`, `package*.json`), and passes the token to the one `git push` through environment config, never `.git/config`.
- Only the scheduled run (GitHub runs schedules on the default branch only) or a dispatch on the default branch or `TRUSTED_BRANCHES` publishes. A dispatch from any other branch is report-only.
- A PR opens only when reference data changed (`outcome.dataFiles`). A month where only `lastChecked` / `dueDate` / line references moved opens none; the next data PR carries that bookkeeping, and the archive keeps the report.
- A refresh that crashes is reported on the data-freshness issue, with the run link.
- A validator that doubts new data returns `flag`. Nothing is written in that case, and the evidence goes to the issue.
- Tax rules are never auto-written. A drift means a person updates `server/juice.js`, the golden tests and `TAX_SOURCES` together.
- LLM-assisted reading of official pages is optional. It runs only when the `ANTHROPIC_API_KEY` secret is set, and it is always advisory. It is never the only check.

**Modes**:

| Mode | Used for | What a run does |
|---|---|---|
| `auto` | machine-readable official/open feeds (ECB/Fed FX, Big Mac CSV, HUD/ONS/StatCan/CSO/... rent tables) | fetch, parse, validate, diff; `changed` → files in the review PR |
| `detect` | sources without a feed (tax schedules as web pages or PDFs, statistical releases) | fetch the official page, extract the key figures, compare with the encoded ones; `drift` (mismatch or a newer year published) → issue with excerpts and URLs |
| `manual` | product policy and data with no usable source (score anchors, grade cut-offs, vetting bounds, Numbeo quotes) | due-date check; `stale` → issue with the entry's checklist |

### Scheduled workflows: do they fire?

GitHub runs `schedule:` triggers only from the repository's **default branch**.
- On 2026-10-10, `git remote show origin` reported `HEAD branch: claude/stoic-ride-54ddxp`. That is also the only remote branch.
- So the default branch is `claude/stoic-ride-54ddxp`, and the schedules on it are live:
  - `snapshot.yml` at 06:17 UTC daily;
  - `pages.yml` at 07:41 UTC daily;
  - `site-watchdog.yml`;
  - `monthly-refresh.yml` at 05:17 UTC on the 3rd.
- `col-refresh.yml` is now manual-only, so it doesn't race the monthly refresh.
- If the default branch later becomes `main`, every schedule moves with it. The workflows take the PR base from `github.event.repository.default_branch` and, on `schedule` events (which carry no repository payload), from `gh repo view --json defaultBranchRef`, so nothing needs to change. Add the new branch to `TRUSTED_BRANCHES` only if it is not the default.

### First live run (2026-10-10)

`monthly-refresh.yml` ran with `dry_run: true` on a GitHub runner: runs 38040981168, 38041238228 and 38041463639. It used the live hosts and needed about one minute.
- **Restored:** 8 job snapshots and the history ledger.
- **Exported for the archive:** 109 reference datasets, before anything changed.
- **Checked:** all 131 registry entries.
- **Would change:** the FX table, now ECB September 2026 monthly averages. That touches cities.json and four code copies, plus the registry and this page.
- **Real alerts:**
  - HUD FY2027 FMRs are published, but HUD's eGIS still serves FY2026; it needs `HUD_API_TOKEN`.
  - 8 Numbeo rents and 5 cost-index values are past due.
  - Next-year tax figures are out for Ireland (Budget 2027), Canada (EI 2027) and Portland (Metro SHS 2027).
  - Columbus is still encoded at tax year 2024.
  - Node 18 and 20 are past end of life.
  - Some LIVABILITY tables and counts have drifted.
- **Transient errors:** gov.scot and gov.bc.ca failed once. Both checked fine on a re-run, which led to the retry above.

### What the repository owner must enable

| Setting | Why | Without it |
|---|---|---|
| Settings → Actions → General → Workflow permissions → **"Allow GitHub Actions to create and approve pull requests"** | the monthly refresh opens its review PR with `GITHUB_TOKEN` | the `bot/monthly-refresh` branch is still pushed; the run warns "open the PR by hand" |
| Issues enabled (default) | drift / stale / flag / error items go to one `data-freshness` issue | the issue step fails (the PR still opens) |
| Optional secret `ANTHROPIC_API_KEY` | advisory LLM read of tax pages that have no stable structure | skipped; regex extractors only |
| Optional secret `HUD_API_TOKEN` (free, huduser.gov) | HUD USER FMR API for US rents | the updater uses HUD's public eGIS feature service |
| Optional secret `BLS_API_KEY` (free) | BLS API v2 (higher limits) for CPI / CE checks | BLS API v1 without a key |
| CI on bot PRs | PRs opened with `GITHUB_TOKEN` don't trigger `ci.yml` | re-run CI from the PR page (or push an empty commit to the branch) |

## 2. Registry: `data/freshness.json`

`data/freshness.json` is the single machine-readable list of every dataset and constant group that the product shows, cites, compares or computes from. Each entry's `id` is stable. It is the dataset key used by:
- the monthly refresh;
- the staleness gate (`test/freshness.test.js`, `run.js --staleness`);
- the site's published `api/freshness.json`;
- the permanent archive (`scripts/archive/*`, [DATA_ARCHIVE.md](DATA_ARCHIVE.md)).

**Never rename an id.** To retire a dataset, set `"retired": "YYYY-MM-DD"` and keep the entry.

```jsonc
{
  "format": "melon-freshness-1",
  "updated": "YYYY-MM-DD",           // last time any entry changed
  "graceDefaults": { "daily": 2, "weekly": 3, "monthly": 14, "quarterly": 30, "semiannual": 45, "yearly": 60 },
  "entries": [
    {
      "id": "fx-per-usd",                       // kebab-case, stable forever (archive dataset key)
      "group": "juice-fx",                      // family, for the tables below
      "description": "Local currency units per USD used to convert salaries, rents and taxes",
      "type": "fetched | derived-at-build | static-data | static-constant-from-a-source | product-policy",
      "owners": ["server/juice.js:45 FX_PER_USD", "data/cities.json fx.perUSD"],   // where the value is defined (file:line + symbol)
      "values": "short human summary of the value(s)",
      "consumers": [{ "at": "public/app.js:1234", "surface": "drawer Juice block" }],
      "source": { "name": "...", "url": "https://...", "licence": "..." },
      "asOf": "YYYY-MM-DD",                     // as-of date of the data itself (what the UI shows)
      "taxYear": "2026/27",                     // tax entries only (the label TAX_SOURCES uses)
      "cadence": "daily | weekly | monthly | quarterly | semiannual | yearly | ad-hoc",   // how often the SOURCE really changes
      "graceDays": 14,                          // allowed lateness before "stale"
      "mode": "auto | detect | manual",
      "updater": "scripts/refresh/fx.js",       // or "manual", or "pipeline: snapshot.yml ..." for job data
      "checklist": ["exact steps for a human (detect + manual)"],
      "validator": "what is checked, and where",
      "before": "the update mechanism before this work, or 'none'",
      "lastChecked": "YYYY-MM-DD",              // last refresh run or human review that confirmed it
      "lastReviewed": "YYYY-MM-DD",             // product policy: last human review (never set by automation)
      "reviewCadence": "yearly",                // product policy checked by data monthly but reviewed by a human on this clock
      "archive": true,                          // record each new version in the archive
      "extract": [{ "file": "data/cities.json", "path": "fx" }, { "file": "server/juice.js", "const": "FX_PER_USD" }],
      "notes": "caveats, unverified items"
    }
  ]
}
```

### Field rules
- `asOf` is when the source data is valid, not when we copied it. `lastChecked` is the last time someone or the refresh confirmed nothing newer exists.
  - The refresh never moves `lastChecked` for a `manual` result; that result is only a reminder.
  - `lastReviewed` and `reviewCadence` give product policy a human-review clock, separate from the monthly data check. That clock counts from `lastReviewed`, or from `asOf` if there is no review yet, plus `reviewCadence` plus the default grace.
  - An entry is **stale** when today is later than `min(age(asOf), age(lastChecked)) + cadence + graceDays`.
  - Two ceilings no `lastChecked` can extend:
    - `dueDate`: an item-level due date a module stores (`rents-1br-quoted` and `cost-index`: the oldest Numbeo page month + 92 + 30 days), so the gate, the UI's "update due" and the monthly report agree;
    - a tax year two or more years old (`taxYear` with `asOf` + 2 years past): stale whatever the last review said.
  - `lastChecked` is set only by an automatic check that confirmed the data (an `ok` or `changed` result), or by a person after a review. The first registry build stamped every entry; on 2026-10-10 it was reset to the live run's results (null for `fx-per-usd`, `rents-us-hud-fmr`, the two Numbeo entries, and every manual entry; policy entries take `lastReviewed` from `scripts/refresh/policy.js` POLICY).
  - `daily` entries belong to the job pipeline and show as "pipeline".
  - `ad-hoc` entries are never stale unless they have a `reviewCadence` or a `dueDate` (every ad-hoc entry has a yearly review since 2026-10-10).
- `type`:
  - `fetched`: pulled from a feed by code, e.g. job boards daily, FX monthly, Big Mac twice a year.
  - `derived-at-build`: computed from other entries at build or run time, e.g. market comps cells, Juice per job, README counts.
  - `static-data`: a committed data file, edited by hand or by a refresh, e.g. city rents.
  - `static-constant-from-a-source`: a constant in code copied from an official source, e.g. tax brackets, the FX pegs.
  - `product-policy`: our own choice, e.g. score anchors, grade cut-offs, vetting bounds. It is never auto-updated, but it has a review cadence and, where possible, a data check.
- `extract` tells the archive export which values make up a version of this dataset. Each item takes one of these forms:
  - `{ file, const }`: a JS literal constant;
  - `{ file, path }`: a JSON path, either `"a.b"` or `["a", "key.with.dots"]`;
  - `{ file, const, path }`: one key of a constant, e.g. `TAX_SOURCES['US-CA']` (each tax entry archives its own `TAX_SOURCES` and `TAX_HOUSEHOLD` record, so a change in one jurisdiction versions only its dataset);
  - optionally `keyPrefix` and `pick` (fields of an array of objects).
- Tax entries are generated from `TAX_SOURCES` in `server/juice.js`: one `tax-<key lowercased>` entry per jurisdiction. `node scripts/refresh/registry.js --sync-tax --write` keeps their `asOf`, `taxYear`, `source.url` and `lastChecked` (from `TAX_SOURCES.reviewed`) equal to the code, adds `TAX_HOUSEHOLD['<key>']` (joint or individual filing, child credits) to the owners and the archive extract, and writes one generated checklist (6 steps; 3 for a household-neutral jurisdiction with no wage income tax). `test/freshness.test.js` fails when they drift.

## 3. Updater interface (`scripts/refresh/<module>.js`)

```js
export const MODULE = { name: 'tax', ids: ['tax-us', /* ... */] };
export async function check(ctx) { return [/* Result per id */]; }
```

`ctx` is built by `scripts/refresh/lib.js` `makeContext()`. It provides:
- `fetchText`, `fetchBuffer` and `fetchJson`:
  - online, they use a 30 s deadline, one retry and the User-Agent `melon-seek-refresh/1`;
  - offline (tests, `--offline`), they read from `test/fixtures/refresh/<module>/urls.json`.
- `readText`, `readJson` and `exists`. These read through the overlay, so a module sees what earlier modules staged.
- `entry(id)`, `now`, `today`, `offline`, `dryRun` and `log`.
- `llm(prompt)`, which returns null without `ANTHROPIC_API_KEY`. It is advisory only.

lib.js also provides these helpers:
- `htmlToLines` and `pdfToText` (the latter needs pdftotext);
- `parseMoney`, `parsePercent`, `findFigure` and `sameNumber`;
- `extractConst` and `constLine` (they read non-exported constants from source text);
- `staleness`.

`check()` returns a Result:

| field | meaning |
|---|---|
| `id`, `mode` | registry id and mode |
| `status` | `ok` (matches) · `changed` (auto: validated new data in `writes`) · `drift` (detect: the official source differs, or a newer year is out) · `flag` (a validator doubts new data; nothing written) · `stale` (manual entry past due) · `error` (could not check; never reported as ok) · `skipped` (offline, no fixture) |
| `summary` | one line |
| `sourceAsOf` | as-of of the data the module saw |
| `findings[]` | `{ key, encoded, official, unit, url, note }` |
| `evidence[]` | `{ url, fetchedAt, excerpt }` (excerpt ≤ 400 chars) |
| `writes[]` | `{ file, content }`, the full new file text (auto only); applied by the orchestrator |
| `checklist[]` | the human steps (detect / manual) |
| `archive` | optional `{ dataset, asOf, json }`: a measurement to record in the archive |

**Rules:**
- Modules never write files and never throw.
- The orchestrator validates every staged file:
  - `data/cities.json` through `scripts/update-col.js` `validateDoc()`;
  - JSON files must parse;
  - JS files must pass `node --check`.
  A failure turns the result into `flag`, and nothing is written.
- Online runs give every result that came back `error` one more try, about 20 s later. A host that blips once doesn't land in the issue; a host that is really down still does.
- After a run, `lastChecked` moves for every `ok` or `changed` result of an `auto` or `detect` check. `asOf` moves to the source's as-of on `changed`. On `ok`, it moves for fetched or derived data when the module saw newer data. A result's `dueDate` is stored for every mode (`null` clears it).
- The registry `mode` must equal what the module reports for an `ok` result; a mismatch is a registry problem in the report (a drift may fall back to `detect`, e.g. a release that cannot be read).
- Every run re-resolves the `file:line SYMBOL` references in owners and consumers (`registry.js --lines`): a reference follows a top-level definition of its symbol, or a code identifier; a prose word is left alone.

## 4. Operator runbook

### Every month (about 30 minutes)
1. The run on the 3rd opens or updates:
   - the PR **"chore(data): monthly data refresh (date)"**, when something changed;
   - the issue **"Data freshness: N item(s) need review"**, when something needs a person.
   The full report is in both, and in the `monthly-refresh-report` artifact (90 days).
2. **Review the PR.**
   - The report lists every changed figure, with the old value, the new value and the percentage move.
   - The test block at the top says whether `npm test` passed against the new data.
   - A failing test usually pins an old value, such as a worked example at the old FX. Re-baseline it in the PR (see "Pinned values" below), or close the PR if the data looks wrong.
   - Merging deploys the change.
3. **Work the issue.** Each item has the evidence and a checklist:
   - **drift** (e.g. "IRS published the 2027 brackets"): update the constants and their `TAX_SOURCES` entry, plus the golden tests, LIVABILITY §3 and `registry.js --sync-tax`, in one PR.
   - **flag** (e.g. "GBP moved 26%"): check the source. If the move is real, re-run with the validator bound raised for that run, or apply the change by hand. If it is a bad download, do nothing; next month retries.
   - **stale** (a manual entry past its due date): follow the checklist, then set `lastChecked` (and `asOf`, if the data changed) in `data/freshness.json`. For `rents-1br-quoted` and `cost-index`, update the page months in `data/cities.json` instead and run `node scripts/refresh/rents.js --reconcile`; the next refresh moves their `dueDate`.
   - **error** (a page moved, an extractor no longer matches): fix the URL or extractor in the module. Verify it with the probe (below) and refresh the fixture.
   The issue closes itself on the first month with no alerts.

### Commands

```sh
node scripts/refresh/run.js --dry-run --offline       # every updater against test fixtures; writes nothing
node scripts/refresh/run.js --dry-run                 # against the real sources (needs network)
node scripts/refresh/run.js --only fx,bigmac          # some modules (or registry ids); writes validated changes
node scripts/refresh/run.js --staleness               # the warn-only age table (what CI and Pages print)
node scripts/refresh/run.js --list                    # registry entries and their updaters
node scripts/refresh/run.js --export-reference DIR    # current value of every dataset -> DIR/<id>.json (archive hand-off)
node scripts/refresh/registry.js --check              # validate the registry
node scripts/refresh/registry.js --sync-tax --write   # tax entries <- TAX_SOURCES
node scripts/refresh/registry.js --lines --write      # re-resolve moved file:line references
node scripts/refresh/registry.js --docs --write       # regenerate the inventory section of this page
node scripts/refresh/rents.js --reconcile [--dry-run]  # after a hand edit: 2/3-bedroom and USD rents from their inputs (no network)
node --test test/freshness*.test.js test/refresh-*.test.js
```

Reports go to `tmp/refresh/`:
- `report.json` and `report.md`;
- `outcome.json` (files, alerts);
- `archive/` (measurement hand-offs);
- `reference/`, from `--export-reference`.

### Reading a source the sandbox can't reach

Most official hosts are unreachable from the agent sandbox, but reachable from GitHub runners.

`freshness-probe.yml` is read-only and runs only on `workflow_dispatch`. It downloads a list of URLs on a runner and prints each response gzip+base64 to the log. To use it:
1. Trigger it with the input `requests`, for example `[{"url":"https://...","name":"x.csv","maxBytes":400000,"ua":"curl/8.5.0"}]`.
2. Save the job log.
3. Run `node .github/scripts/freshness-probe.mjs --decode <log> <dir>`. It rebuilds the exact bytes and checks their sha256.
4. Trim the result and save it as `test/fixtures/refresh/<module>/` plus its `urls.json`.

`juice-tax-probe.yml` greps pages and PDFs, which is useful for finding the figures in long tax documents.

Tip: FRED times out with a browser User-Agent but answers `curl/8.5.0`.

### Adding a dataset or constant
1. Add an entry to `data/freshness.json`, following the schema in §2. Every number the UI shows needs a source and an as-of.
2. Pick the mechanism:
   - `auto` when there is a machine-readable official or open feed;
   - `detect` when there is an official page;
   - otherwise `manual`, with a checklist and a cadence.
3. If it is `auto` or `detect`, add the id to a module's `MODULE.ids`, or write a module. Then add fixtures and a test under `test/refresh-*.test.js`.
4. Run `node scripts/refresh/registry.js --docs --write` and `npm test`.

`test/freshness.test.js` fails when:
- a module reports an unregistered id;
- a module-updated entry has no module;
- a `file:line` reference points past the end of a file.

### A new tax year
Each module result says which tax year it saw. The `checklist` on every tax entry has the exact steps. In summary:
1. Update the jurisdiction's constants in `server/juice.js`.
2. Update `TAX_SOURCES[key]`: `asOf`, `url`, `reviewed`, and `verified` only after checking the official schedule.
3. Update the golden vectors in the tax tests.
4. Update docs/LIVABILITY.md §3.
5. Run `node scripts/refresh/registry.js --sync-tax --write`.
6. Regenerate the worked examples.

Typical publication dates:
- US: IRS inflation adjustments in October–November; the SSA wage base in mid-October.
- UK: at the Budget, effective 6 April.
- Australia and India: in the budget, effective 1 July and 1 April respectively.
- Canada: CRA indexation in November.

### FX policy
- **Source.** One table: ECB monthly reference-rate averages crossed through USD, Federal Reserve G.5 for TWD, and the official AED, SAR and QAR pegs. It is written together into:
  - `data/cities.json` (`fx.perUSD`, every `fxPerUSD`, the USD rents);
  - `server/juice.js`, `public/viz/palette.js` and `server/salary.js` (`FX_PER_USD`, `FX_AS_OF`, and `FX_SOURCE`, the label `computeJuice` cites, once docs/process/patches/freshness-lead-fx-source.diff lands);
  - `public/features/shared.js` (`FX_FALLBACK.CNY`).
  `test/fx-consistency.test.js` and `test/freshness.test.js` fail if the copies disagree (including `FX_SOURCE` vs `data/cities.json` `fx.source.name`).
- **Nothing else writes FX.** `scripts/update-col.js` refreshes Big Mac prices only and keeps the FX table (with docs/process/patches/freshness-lead-update-col-fx.diff; `--fx-from-bigmac` restores the old Big Mac `dollar_ex` behaviour). Derived rents are re-derived at the current FX by `rents.js` on every run, or by `node scripts/refresh/rents.js --reconcile`.
- **Bounds.** A move above 20% in a month is a `flag`. Above 10%, it is a warning in the PR.
- **Before 2026-10.** The table was the Big Mac `dollar_ex` column. It was refreshed only twice a year, and the code copies were updated by hand.

### Pinned values
Some tests and docs pin numbers that move when the data refreshes:
- worked examples at a given FX;
- `DOC.bigMac.asOf === '2026-07-01'`;
- README counts.

`scripts/refresh/derived.js` regenerates the generated blocks (`<!-- freshness:... -->` markers) in each refresh PR. Hand-written figures are checked and reported as drift.

Intentional golden vectors, such as the tax tests, change only together with a verified rule change. The list of pins and their owners is in [process/freshness-derived.md](process/freshness-derived.md) and [process/freshness-audit-surface.md](process/freshness-audit-surface.md).

### History and the archive
- Every version of every dataset is kept forever on the `data-archive` branch. It is never overwritten.
- Each month, before changing anything, the refresh exports the live value of every dataset with `extract` to `tmp/refresh/reference/`, and it writes measurements (e.g. `jobs-aggregates`) to `tmp/refresh/archive/`.
- `archive.yml` imports both from the `monthly-refresh-report` artifact.
- Values a refresh PR changes are archived once the PR is merged, from the code branch.
- The annual review reports ("how did the numbers change within and across years") are produced by `scripts/archive/report.js`. See [DATA_ARCHIVE.md](DATA_ARCHIVE.md).

## 5. Validators

| Dataset family | Validator |
|---|---|
| FX | every currency in use present and > 0; \|move\| > 20% → flag, > 10% → warning; pegs within 0.5%; period not older than encoded, not in the future; USD rents = local ÷ FX (`validateDoc`); code copies equal (`test/fx-consistency.test.js`, `test/freshness.test.js`) |
| Big Mac | ≥ 20 countries; dollar price 1–12 USD; \|move\| > 40% between releases → flag; release not older than encoded, not in the future |
| Rents | 1 < 2 < 3 bedrooms, outside ≤ centre; month-over-month bounds per source; every quote has class, https url, asOf; city set unchanged (scripts/refresh/rents.js, `validateDoc`) |
| Cost index, NYC basket, living scale | `scripts/refresh/living.js` (CPI-indexed drift check for the NYC basket, scale sum checks) |
| Tax | thresholds strictly increasing; rates in [0, 0.7) and non-decreasing unless the source says otherwise; caps and wage bases rise year over year unless the source says otherwise; encoded tax year is current or last; every RULES jurisdiction has a watch entry (scripts/refresh/tax.js, test/refresh-tax.test.js) |
| Job data and models | market comps recomputed; Compstimate backtest against the claimed accuracy; level ratios against `LEVEL_INDEX`; vetting quarantine share month over month; lexicon coverage; ledger health (scripts/refresh/jobs.js) |
| Policy constants | duplicates agree (test/freshness-policy.test.js); review due dates (scripts/refresh/policy.js) |
| Generated docs | marker blocks regenerate deterministically; hand-written counts compared with the code (scripts/refresh/derived.js) |
| Registry | schema, ids, coverage, as-of consistency with the data, file:line references, extracts (test/freshness.test.js) |

## 6. Inventory

The tables below are generated: edit `data/freshness.json`, then run `node scripts/refresh/registry.js --docs --write`.

<!-- freshness:inventory:begin (generated by node scripts/refresh/registry.js --docs --write; do not edit by hand) -->

Generated from `data/freshness.json` (updated 2026-10-10). 133 entries.

- **By type:** static-constant-from-a-source 74 · product-policy 21 · derived-at-build 17 · fetched 14 · static-data 7
- **By cadence (how often the source really changes):** yearly 90 · monthly 14 · daily 13 · quarterly 10 · ad-hoc 4 · semiannual 2
- **By mechanism:** manual 76 · detect 43 · auto 14 (auto = fetch + validate + review PR; detect = compare with the official source and open an issue; manual = checklist with a due date)
- **Entries that had no update mechanism before this work:** 31

### By cadence

#### daily (13)

| Id | What | Type | Mechanism | Updater | As of | Source |
|---|---|---|---|---|---|---|
| `job-postings` | Per-company posting counts as the UI shows them (topbar count, stats line, Insights heade… | fetched | detect | pipeline: scripts/snapshot.js via snapshot.yml + … | 2026-10-02 | [Company job boards (Greenhouse, Ashby, Lever; big-tech care…](https://alvations.github.io/melon-seek/) |
| `job-salary-usd` | Per-job annual pay converted to approx USD (client side, palette FX) and every statistic … | derived-at-build | detect | pipeline: converted at build and in the browser w… | 2026-10-02 | [derived: posted pay x public/viz/palette.js FX_PER_USD (reg…](https://alvations.github.io/melon-seek/) |
| `job-salary-parsed` | Per-job posted pay in its native currency and the honest-number labels around it. | fetched | detect | pipeline: server/salary.js + adapters inside the … | 2026-10-02 | [Company job boards (Greenhouse, Ashby, Lever; big-tech care…](https://alvations.github.io/melon-seek/) |
| `salary-vetting-flags` | Per-job vetting outcome shown in the UI ("Pay unclear"). | fetched | detect | pipeline: server/vet.js gate + scripts/vet-salari… | 2026-10-02 | [Company job boards (Greenhouse, Ashby, Lever; big-tech care…](https://alvations.github.io/melon-seek/) |
| `company-aggregates` | Per-company and per-group aggregates the UI computes (median, p25/p75, pay share, remote … | derived-at-build | detect | pipeline: computed at build / in the browser from… | 2026-10-02 | [derived from the vetted job snapshots (daily build)](https://alvations.github.io/melon-seek/api/market.json) |
| `market-comps` | Market comps (company × family × seniority: n, p25/median/p75 USD) in "Same role elsewher… | derived-at-build | detect | pipeline: scripts/build-static.js -> buildMarket … | 2026-10-02 | [derived from the vetted job snapshots (daily build)](https://alvations.github.io/melon-seek/api/market.json) |
| `compstimate-backtest` | Published Compstimate accuracy: seeded leave-one-out backtest per company → "Typically wi… | derived-at-build | detect | pipeline: scripts/build-static.js ctx.enrich back… | 2026-10-02 | [derived from the vetted job snapshots (daily build)](https://alvations.github.io/melon-seek/api/market.json) |
| `history-ledger` | Ledger-derived job fields as shown in the UI (listed date, first seen, reposts, "New sinc… | fetched | detect | pipeline: scripts/snapshot.js recordRun + .github… | - | [melon-seek listing ledger (observations of the job boards)](https://github.com/alvations/melon-seek/blob/claude/stoic-ride-54ddxp/server/history.js) |
| `share-pages` | dist/c/<slug>/ share pages: og:title '<Company> jobs by salary · N roles · median $X' and… | derived-at-build | auto | pages.yml (daily build: scripts/build-static.js s… | 2026-10-02 | [Company job boards (Greenhouse, Ashby, Lever; big-tech care…](https://alvations.github.io/melon-seek/c/anthropic/) |
| `methodology-page` | The site's Juice methodology pages: methodology/ (being redesigned into a guide whose num… | derived-at-build | detect | pipeline: scripts/build-static.js renders methodo… | 2026-10-10 | [docs/LIVABILITY.md (with its generated blocks, juice-worked…](https://alvations.github.io/melon-seek/methodology/) |
| `job-juice` | Juice Score per salaried job (best location: net, score, grade, confidence), computed wit… | derived-at-build | detect | pipeline: public/api.js attachJuiceAll in the bro… | 2026-10-02 | [derived: vetted pay x data/cities.json (rents, cost index, …](https://alvations.github.io/melon-seek/api/cities.json) |
| `insights-distributions` | Insights panel statistics computed in the browser for the jobs in view: headline tiles (r… | derived-at-build | manual | pipeline: computed in the browser from the daily … | 2026-10-02 | [derived from the vetted job snapshots (daily build)](https://alvations.github.io/melon-seek/api/market.json) |
| `archive-reports` | The archive's review reports on the data-archive branch: per company and month medianUSD,… | derived-at-build | auto | pipeline: .github/workflows/archive.yml (scripts/… | - | [derived from the archive (jobs table and the reference data…](https://github.com/alvations/melon-seek/tree/data-archive) |

#### monthly (14)

| Id | What | Type | Mechanism | Updater | As of | Source |
|---|---|---|---|---|---|---|
| `fx-per-usd` | Exchange rates, local currency units per USD: every "approx USD" figure (chart, map, Insi… | fetched | auto | scripts/refresh/fx.js | 2026-07-01 | [ECB euro reference rates, monthly averages (crossed through…](https://data.ecb.europa.eu/data/datasets/EXR) |
| `cities-dataset` | data/cities.json as a whole: schema, the 89 cities and their tax jurisdictions, aliases/n… | static-data | manual | composite: scripts/refresh/fx.js, bigmac.js, rent… | 2026-10-02 | [composite: see rents-*, cost-index, nyc-basket, bigmac-pric…](https://alvations.github.io/melon-seek/api/cities.json) |
| `rents-bedroom-ratios` | The bedroomRatios table as a whole and the derived 2- and 3-bedroom city-centre rents of … | derived-at-build | auto | scripts/refresh/rents.js | 2026-10-01 | [Derived: 1-bedroom quote × official bedroom ratio (sources …](https://github.com/alvations/melon-seek/blob/main/docs/LIVABILITY.md#42-rent-by-number-of-bedrooms) |
| `nyc-basket` | NYC single-person living-cost baseline excluding rent ($1,665.2 a month × 12 = $19,982 a … | static-constant-from-a-source | detect | scripts/refresh/living.js | 2026-09-01 | [Numbeo, Cost of Living in New York (single person, excludin…](https://www.bls.gov/cpi/regional-resources.htm) |
| `compstimate-model` | Compstimate similarity model and thresholds (LEVEL_INDEX, seniority/location/department/t… | product-policy | detect | scripts/refresh/jobs.js | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `seniority-ladder` | Seniority ladder and its copies (7 levels + Unspecified) used for filters, chart grouping… | product-policy | detect | scripts/refresh/jobs.js | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `role-families` | Role-family taxonomy (26 families) and its label copies. | product-policy | detect | scripts/refresh/jobs.js | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `keyword-lexicons` | Skills / responsibilities / fit keywords as aggregated in Insights and the keyword filter… | product-policy | detect | scripts/refresh/jobs.js | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `juice-worked-examples` | Generated Juice tables in docs/LIVABILITY.md: the one-person worked examples, the by-hous… | derived-at-build | auto | scripts/refresh/derived.js | 2026-10-10 | [server/juice.js computeJuice/taxFor/netForScore/TAX_SOURCES…](https://alvations.github.io/melon-seek/methodology/#1-the-formula) |
| `readme-counts` | Figures README.md states as current: built-in companies (intro and API reference), beta b… | derived-at-build | detect | scripts/refresh/derived.js | 2026-10-10 | [The repo's own code and data: server/companies.js listCompa…](https://alvations.github.io/melon-seek/) |
| `docs-counts` | Counts and constants quoted in prose in docs/LIVABILITY.md and docs/CONTRACT.md: city cou… | derived-at-build | detect | scripts/refresh/derived.js | 2026-10-10 | [The repo's own code and data: data/cities.json, server/juic…](https://alvations.github.io/melon-seek/methodology/) |
| `e2e-pinned-values` | Tests that pin a DATA value (not a code constant), so a data refresh breaks them: the rea… | derived-at-build | detect | scripts/refresh/derived.js | 2026-10-10 | [data/cities.json and data/snapshots/<slug>.json (the job-bo…](https://alvations.github.io/melon-seek/) |
| `rents-gb-ons` | ONS Price Index of Private Rents, Table 1: mean monthly private rent by bedrooms for Lond… | fetched | auto | scripts/refresh/rents.js | 2026-08-01 | [ONS Price Index of Private Rents, UK: monthly price statist…](https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics) |
| `jobs-aggregates` | Monthly dated aggregate of every job and company number (per company counts, medians, vet… | derived-at-build | detect | scripts/refresh/jobs.js | 2026-10-02 | [derived from the vetted job snapshots (daily build)](https://alvations.github.io/melon-seek/api/market.json) |

#### quarterly (10)

| Id | What | Type | Mechanism | Updater | As of | Source |
|---|---|---|---|---|---|---|
| `rents-1br-quoted` | 1-bedroom rent quotes, city centre and outside the centre, for 88 cities (Sydney's centre… | static-data | manual | scripts/refresh/rents.js | 2026-05-01 | [Numbeo city pages (crowd-sourced aggregator), read by hand](https://www.numbeo.com/cost-of-living/) |
| `rents-nsw-official` | NSW Rent and Sales Report: median weekly rent for new bonds, City of Sydney LGA, flats/un… | fetched | auto | scripts/refresh/rents.js | 2026-06-01 | [NSW Department of Communities and Justice, Rent and Sales R…](https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html) |
| `cost-index` | Per-city cost index (living costs excluding rent, New York = 100): 100 × the city's Numbe… | static-data | manual | scripts/refresh/living.js | 2026-06-01 | [Numbeo city pages: "estimated monthly costs for a single pe…](https://www.numbeo.com/cost-of-living/) |
| `salary-vetting-bounds` | Vetting bounds as restated in docs and mock copy (owner server/vet.js). | product-policy | manual | scripts/refresh/policy.js | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `llm-vet-config` | Advisory LLM salary review settings: model id, API version, fallback beta, limits | product-policy | detect | scripts/refresh/policy.js | 2026-10-06 | [Anthropic Models API (GET /v1/models/{id}) and the model de…](https://docs.anthropic.com/en/docs/about-claude/model-deprecations) |
| `juice-calibration-doc` | The score-curve calibration paragraph and percentile table in docs/LIVABILITY.md §1 (real… | derived-at-build | manual | scripts/refresh/derived.js | 2026-10-02 | [Real job-board snapshots (job-board-snapshots artifact) sco…](https://alvations.github.io/melon-seek/methodology/#score-curve-and-grades) |
| `docs-screenshots` | docs/screenshots/*.png: README's chart.png and map.png and the other captures (drawer, dr… | derived-at-build | manual | manual | 2026-10-10 | [Company job boards via the real app (node scripts/e2e.js, h…](https://alvations.github.io/melon-seek/) |
| `rents-ie-rtb` | RTB Rent Index via CSO PxStat RIQ02: new-tenancy average monthly rent by bedrooms, Dublin… | fetched | auto | scripts/refresh/rents.js | 2025-12-01 | [Residential Tenancies Board Rent Index, CSO PxStat table RI…](https://data.cso.ie/table/RIQ02) |
| `rents-ca-statcan` | Statistics Canada table 46-10-0092-01 (with CMHC): average asking rent for apartments by … | fetched | auto | scripts/refresh/rents.js | 2026-04-01 | [Statistics Canada, Quarterly rent statistics, table 46-10-0…](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610009201) |
| `rents-sg-hdb` | HDB median rent by town and flat type (data.gov.sg), Central Area: the 4-room ÷ 3-room st… | fetched | auto | scripts/refresh/rents.js | 2026-06-01 | [Housing & Development Board, Median Rent by Town and Flat T…](https://data.gov.sg/datasets/d_23000a00c52996c55106084ed0339566/view) |

#### semiannual (2)

| Id | What | Type | Mechanism | Updater | As of | Source |
|---|---|---|---|---|---|---|
| `bigmac-prices` | The Economist's Big Mac prices per country (USD), shown as 'Big Macs a year of juice buys… | fetched | auto | scripts/refresh/bigmac.js | 2026-07-01 | [The Economist Big Mac index, source-data/big-mac-source-dat…](https://github.com/TheEconomist/big-mac-data) |
| `runtime-versions` | PROPOSED NEW ID. Runtime and dependency versions that age: Node engines and CI matrix, wo… | static-constant-from-a-source | manual | scripts/refresh/policy.js | 2026-10-10 | [Node.js release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) |

#### yearly (90)

| Id | What | Type | Mechanism | Updater | As of | Source |
|---|---|---|---|---|---|---|
| `fx-usd-pegs` | Official US-dollar pegs used for currencies the ECB does not publish (AED, SAR, QAR) | static-constant-from-a-source | manual | manual | 2026-10-10 | [Central Bank of the UAE (AED 3.6725); Saudi Central Bank, S…](https://www.centralbank.ae/en/) |
| `juice-score-anchors` | Juice Score curve (score = 100·(1−e^(−net/K)), K = $80,000; fullGlassUSD $423,866) as mir… | product-policy | manual | scripts/refresh/policy.js | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `juice-grades` | Juice grade cut-offs (Dry < 45 ≤ Ripe < 70 ≤ Juicy; Rind when net ≤ 0) as duplicated in U… | product-policy | manual | scripts/refresh/policy.js | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `juice-confidence-rules` | Confidence rules and the resulting counts quoted in docs (US 30 medium / 10 low; 49 non-U… | product-policy | manual | scripts/refresh/policy.js | 2026-10-10 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `tax-us` | Tax rules for US: IRS Rev. Proc. 2025-32 (2026 brackets, standard deduction $16,100 / $32… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [IRS Rev. Proc. 2025-32 (2026 brackets, standard deduction $…](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) |
| `tax-us-ca` | Tax rules for US-CA: California FTB 2025 tax rate schedules X / Y (latest published; EDD … | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2025-01-01 (tax year 2025 (brackets) / 2026 (SDI)) | [California FTB 2025 tax rate schedules X / Y (latest publis…](https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf) |
| `tax-us-ny` | Tax rules for US-NY: New York State 2026 (IT-2105-I): rates, tax-benefit recapture worksh… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [New York State 2026 (IT-2105-I): rates, tax-benefit recaptu…](https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf) |
| `tax-us-wa` | Tax rules for US-WA: No income tax on wages; WA Cares 0.58% of all wages; Paid Family and… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [No income tax on wages; WA Cares 0.58% of all wages; Paid F…](https://wacaresfund.wa.gov/employers/) |
| `tax-us-tx` | Tax rules for US-TX: No state income tax on wages (Texas Constitution art. 8 §24-a) | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [No state income tax on wages (Texas Constitution art. 8 §24…](https://statutes.capitol.texas.gov/Docs/CN/htm/CN.8.htm) |
| `tax-us-fl` | Tax rules for US-FL: No state income tax on wages (Florida Constitution art. VII §5(a)) | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [No state income tax on wages (Florida Constitution art. VII…](https://www.leg.state.fl.us/statutes/index.cfm?submenu=3) |
| `tax-us-tn` | Tax rules for US-TN: No state income tax on wages (Hall tax repealed from 2021; Tennessee… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [No state income tax on wages (Hall tax repealed from 2021; …](https://www.capitol.tn.gov/about/docs/TN-Constitution.pdf) |
| `tax-us-nv` | Tax rules for US-NV: No state income tax on wages (Nevada Constitution art. 10 §1(9)) | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [No state income tax on wages (Nevada Constitution art. 10 §…](https://www.leg.state.nv.us/const/nvconst.html) |
| `tax-us-ma` | Tax rules for US-MA: Massachusetts Form 1 (2025): 5% after the personal exemption $4,400 … | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2025-01-01 (tax year 2025 / 2026 (surtax)) | [Massachusetts Form 1 (2025): 5% after the personal exemptio…](https://www.mass.gov/doc/2025-form-1-instructions/download) |
| `tax-us-ga` | Tax rules for US-GA: Georgia HB 463: 4.99% for 2026, standard deduction $15,000 / $30,000… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Georgia HB 463: 4.99% for 2026, standard deduction $15,000 …](https://www.legis.ga.gov/api/legislation/document/20252026/249080) |
| `tax-us-dc` | Tax rules for US-DC: District of Columbia 4%-10.75% (tax years after 2021, all filing sta… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [District of Columbia 4%-10.75% (tax years after 2021, all f…](https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates) |
| `tax-us-al` | Tax rules for US-AL: Alabama Form 40 (2025): 2% / 4% / 5%, federal income tax deduction, … | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [Alabama Form 40 (2025): 2% / 4% / 5%, federal income tax de…](https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40bk.pdf) |
| `tax-us-oh` | Tax rules for US-OH: Ohio ORC 5747.02(A)(3)(c): $332 + 2.75% over $26,050 (2026 on); ORC … | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Ohio ORC 5747.02(A)(3)(c): $332 + 2.75% over $26,050 (2026 …](https://codes.ohio.gov/ohio-revised-code/section-5747.02) |
| `tax-us-va` | Tax rules for US-VA: Virginia Form 760 (2025): 2%-5.75%, standard deduction $8,750 / $17,… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Virginia Form 760 (2025): 2%-5.75%, standard deduction $8,7…](https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf) |
| `tax-us-il` | Tax rules for US-IL: Illinois 4.95%, exemption $2,925 per person for 2026 (IL-700-T), non… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Illinois 4.95%, exemption $2,925 per person for 2026 (IL-70…](https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/currentyear/il-700-t.pdf) |
| `tax-us-co` | Tax rules for US-CO: Colorado 4.4% of federal taxable income (2025 rate); state income ta… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025 (rate) / 2026 (addback)) | [Colorado 4.4% of federal taxable income (2025 rate); state …](https://tax.colorado.gov/individual-income-tax-guide) |
| `tax-us-pa` | Tax rules for US-PA: Pennsylvania 3.07% of compensation; unemployment compensation employ… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Pennsylvania 3.07% of compensation; unemployment compensati…](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) |
| `tax-us-nc` | Tax rules for US-NC: North Carolina 3.99% (2026), standard deduction $12,750 / $25,500, c… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [North Carolina 3.99% (2026), standard deduction $12,750 / $…](https://www.ncdor.gov/taxes-forms/individual-income-tax) |
| `tax-us-or` | Tax rules for US-OR: Oregon 2026 withholding formulas: 4.75%-9.9%, standard deduction $2,… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Oregon 2026 withholding formulas: 4.75%-9.9%, standard dedu…](https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf) |
| `tax-us-ut` | Tax rules for US-UT: Utah TC-40 (2025): 4.5% less the taxpayer tax credit (6% of the fede… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [Utah TC-40 (2025): 4.5% less the taxpayer tax credit (6% of…](https://tax.utah.gov/forms/current/tc-40inst.pdf) |
| `tax-us-az` | Tax rules for US-AZ: Arizona Form 140 (2025): 2.5%, standard deduction $15,750 / $31,500,… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [Arizona Form 140 (2025): 2.5%, standard deduction $15,750 /…](https://azdor.gov/sites/default/files/document/FORMS_INDIVIDUAL_2025_140i.pdf) |
| `tax-us-mn` | Tax rules for US-MN: Minnesota 2026: 5.35%-9.85%, standard deduction $15,300 / $30,600, d… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Minnesota 2026: 5.35%-9.85%, standard deduction $15,300 / $…](https://www.revenue.state.mn.us/mndor-pp/21641) |
| `tax-us-mi` | Tax rules for US-MI: Michigan 4.25%, personal exemption $5,900 per person (2026 withholdi… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Michigan 4.25%, personal exemption $5,900 per person (2026 …](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Tax-Interest-Calculator/2026WithholdingtaxinfoJson.json) |
| `tax-us-md` | Tax rules for US-MD: Maryland 2025 (Budget Reconciliation and Financing Act 2025): 2%-6.5… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [Maryland 2025 (Budget Reconciliation and Financing Act 2025…](https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php) |
| `tax-us-local-nyc` | Tax rules for US-LOCAL-NYC: New York City resident tax 3.078%-3.876% on NYS taxable incom… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [New York City resident tax 3.078%-3.876% on NYS taxable inc…](https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf) |
| `tax-us-local-columbus` | Tax rules for US-LOCAL-COLUMBUS: Columbus, OH city income tax 2.5% (IR-25 instructions) | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2024-01-01 (tax year 2024) | [Columbus, OH city income tax 2.5% (IR-25 instructions)](https://www.columbus.gov/files/sharedassets/city/v/4/city-auditor/tax-forms/individuals/2024-ir-25-instructions.pdf) |
| `tax-us-local-philadelphia` | Tax rules for US-LOCAL-PHILADELPHIA: Philadelphia resident wage tax 3.74% to 30 June 2026… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Philadelphia resident wage tax 3.74% to 30 June 2026, 3.735…](https://www.phila.gov/services/payments-assistance-taxes/business-taxes/wage-tax-employers/) |
| `tax-us-local-pittsburgh` | Tax rules for US-LOCAL-PITTSBURGH: Pittsburgh earned income tax 3% (city 1% + school dist… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Pittsburgh earned income tax 3% (city 1% + school district …](https://www.pittsburghpa.gov/finance/tax-descriptions) |
| `tax-us-local-detroit` | Tax rules for US-LOCAL-DETROIT: Detroit resident city income tax 2.4%, $600 exemption per… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Detroit resident city income tax 2.4%, $600 exemption per p…](https://detroitmi.gov/departments/office-chief-financial-officer/ocfo-divisions/office-treasury/income-tax) |
| `tax-us-local-portland` | Tax rules for US-LOCAL-PORTLAND: Portland area 2026: Metro supportive housing 1% over $12… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Portland area 2026: Metro supportive housing 1% over $128,0…](https://www.portland.gov/revenue/personal-tax) |
| `tax-us-local-md-county` | Tax rules for US-LOCAL-MD-COUNTY: Maryland local income tax, Baltimore City 3.2% of Maryl… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [Maryland local income tax, Baltimore City 3.2% of Maryland …](https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php) |
| `tax-gb` | Tax rules for GB: HMRC 2026/27: personal allowance £12,570 (tapered over £100,000), 20% /… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-04-06 (tax year 2026/27) | [HMRC 2026/27: personal allowance £12,570 (tapered over £100…](https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past) |
| `tax-gb-sct` | Tax rules for GB-SCT: Scottish income tax 2026/27: 19% / 20% / 21% / 42% / 45% / 48% (ban… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-04-06 (tax year 2026/27) | [Scottish income tax 2026/27: 19% / 20% / 21% / 42% / 45% / …](https://www.gov.uk/scottish-income-tax) |
| `tax-ie` | Tax rules for IE: Revenue 2026: 20% to €44,000 (married, one income: €53,000) then 40%, p… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Revenue 2026: 20% to €44,000 (married, one income: €53,000)…](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/tax-relief-charts/index.aspx) |
| `tax-ch` | Tax rules for CH: Direct federal tax 2026 (ESTV tariffs, single and married, CHF 263 per … | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Direct federal tax 2026 (ESTV tariffs, single and married, …](https://www.estv.admin.ch/dam/de/sd-web/vFK3ntWLQ4s4/2-215-D-2025-d.pdf) |
| `tax-ch-zh` | Tax rules for CH-ZH: Canton of Zurich 2026 (Kantonsblatt ZH): Grundtarif / Verheiratetent… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Canton of Zurich 2026 (Kantonsblatt ZH): Grundtarif / Verhe…](https://www.estv2.admin.ch/stp/kb/zh-de.pdf) |
| `tax-ch-ge` | Tax rules for CH-GE: Geneva (canton GE): approximation, one combined federal + cantonal +… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [Geneva (canton GE): approximation, one combined federal + c…](https://www.estv2.admin.ch/stp/kb/ge-fr.pdf) |
| `tax-de` | Tax rules for DE: § 32a EStG 2026 tariff (Grundfreibetrag €12,348) with splitting for mar… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [§ 32a EStG 2026 tariff (Grundfreibetrag €12,348) with split…](https://dejure.org/gesetze/EStG/32a.html) |
| `tax-fr` | Tax rules for FR: Barème on 2025 income (latest enacted): 0/11/30/41/45%, quotient famili… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2025-01-01 (tax year 2025 income (barème) / 2026 (contributions)) | [Barème on 2025 income (latest enacted): 0/11/30/41/45%, quo…](https://www.service-public.fr/particuliers/vosdroits/F1419) |
| `tax-nl` | Tax rules for NL: Box 1 2026: 35.75% to €38,883, 37.56% to €78,426, 49.50% above (incl. n… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Box 1 2026: 35.75% to €38,883, 37.56% to €78,426, 49.50% ab…](https://www.belastingdienst.nl/wps/wcm/connect/nl/voorlopige-aanslag/content/voorlopige-aanslag-tarieven-en-heffingskortingen) |
| `tax-es` | Tax rules for ES: IRPF state scale (art. 63 LIRPF) 9.5%-24.5%, personal minimum €5,550, €… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [IRPF state scale (art. 63 LIRPF) 9.5%-24.5%, personal minim…](https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764) |
| `tax-es-md` | Tax rules for ES-MD: Comunidad de Madrid regional scale: five tranches 8.5% to 20.5% (to … | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Comunidad de Madrid regional scale: five tranches 8.5% to 2…](https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-i-tributacion-autonomica-2026.pdf) |
| `tax-es-ct` | Tax rules for ES-CT: Catalonia regional scale 9.5%-25.5% (to €12,500 / 22,000 / 33,000 / … | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [Catalonia regional scale 9.5%-25.5% (to €12,500 / 22,000 / …](https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-ii-tributacion-autonomica-2025.pdf) |
| `tax-pt` | Tax rules for PT: IRS 2026 scale 12.5%-48% (Lei 73-A/2025, CIRS art. 68), solidarity surc… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [IRS 2026 scale 12.5%-48% (Lei 73-A/2025, CIRS art. 68), sol…](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs68.aspx) |
| `tax-it` | Tax rules for IT: IRPEF 2026 23/33/43%; Lombardy regional surcharge up to 1.73% + Milan m… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [IRPEF 2026 23/33/43%; Lombardy regional surcharge up to 1.7…](https://www.agenziaentrate.gov.it/) |
| `tax-at` | Tax rules for AT: Einkommensteuertarif 2026 0%-55% (€13,539 / 21,992 / 36,458 / 70,365 / … | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Einkommensteuertarif 2026 0%-55% (€13,539 / 21,992 / 36,458…](https://www.usp.gv.at/steuern-finanzen/einkommensteuer-ueberblick/weitere-informationen-est/tarifstufen.html) |
| `tax-be` | Tax rules for BE: Federal rates 25/40/45/50%, basic allowance €10,910, flat professional … | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [Federal rates 25/40/45/50%, basic allowance €10,910, flat p…](https://finance.belgium.be/en/private-individuals/tax-return/rates) |
| `tax-se` | Tax rules for SE: State tax 20% above SEK 643,000 taxable (brytpunkt 660,400), basic allo… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [State tax 20% above SEK 643,000 taxable (brytpunkt 660,400)…](https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html) |
| `tax-dk` | Tax rules for DK: AM contribution 8%, bottom tax 12.01%, Copenhagen municipal 23.39%, 202… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [AM contribution 8%, bottom tax 12.01%, Copenhagen municipal…](https://skat.dk/) |
| `tax-no` | Tax rules for NO: Skatteetaten 2026: tax on general income 22%, bracket tax 1.7% / 4.0% /… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Skatteetaten 2026: tax on general income 22%, bracket tax 1…](https://www.skatteetaten.no/en/rates/bracket-tax/) |
| `tax-fi` | Tax rules for FI: Approximation: state progressive tax + Helsinki municipal 5.3% as one s… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [Approximation: state progressive tax + Helsinki municipal 5…](https://vero.fi/en/individuals/tax-cards-and-tax-returns/tax_card/tax-rate-and-income-ceiling/tax-bases/) |
| `tax-pl` | Tax rules for PL: PIT 12%/32% (PLN 120,000), PLN 3,600 tax-reducing amount, PLN 3,000 cos… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [PIT 12%/32% (PLN 120,000), PLN 3,600 tax-reducing amount, P…](https://www.podatki.gov.pl/) |
| `tax-cz` | Tax rules for CZ: PIT 15%/23% (36x average wage), CZK 30,840 credit; social 7.1% (capped)… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [PIT 15%/23% (36x average wage), CZK 30,840 credit; social 7…](https://www.financnisprava.cz/cs/dane/dane/dan-z-prijmu/fyzicke-osoby) |
| `tax-ee` | Tax rules for EE: Income tax 22%, basic exemption €8,400; unemployment insurance 1.6% (2n… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Income tax 22%, basic exemption €8,400; unemployment insura…](https://www.emta.ee/en/private-client/taxes-and-payment/income-tax) |
| `tax-il` | Tax rules for IL: Income tax 10%-47% + 3% surtax (2025 thresholds, frozen), 2.25 credit p… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Income tax 10%-47% + 3% surtax (2025 thresholds, frozen), 2…](https://www.btl.gov.il/English%20Homepage/Insurance/Ratesandamount/Pages/forSalaried.aspx) |
| `tax-ae` | Tax rules for AE: No personal income tax; no social security for expatriates | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [No personal income tax; no social security for expatriates](https://tax.gov.ae/) |
| `tax-sa` | Tax rules for SA: No personal income tax on employment income; GOSI annuities apply to Sa… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [No personal income tax on employment income; GOSI annuities…](https://zatca.gov.sa/) |
| `tax-jp` | Tax rules for JP: NTA 2026: income tax 5%-45% x 1.021, employment income deduction (min ¥… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [NTA 2026: income tax 5%-45% x 1.021, employment income dedu…](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm) |
| `tax-kr` | Tax rules for KR: Income tax 6%-45% + 10% local income tax, employment income deduction, … | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Income tax 6%-45% + 10% local income tax, employment income…](https://www.nts.go.kr/english/) |
| `tax-sg` | Tax rules for SG: IRAS resident rates YA2024 onward 0%-24%, earned income relief S$1,000 … | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2025-01-01 (tax year YA2026) | [IRAS resident rates YA2024 onward 0%-24%, earned income rel…](https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates) |
| `tax-hk` | Tax rules for HK: Salaries tax 2026/27: progressive 2%-17% after allowances (basic HK$145… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-04-01 (tax year 2026/27) | [Salaries tax 2026/27: progressive 2%-17% after allowances (…](https://www.gov.hk/en/residents/taxes/taxfiling/taxrates/salariesrates.htm) |
| `tax-tw` | Tax rules for TW: Income tax 5%-40%, exemption + standard + salary deductions NT$446,000;… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [Income tax 5%-40%, exemption + standard + salary deductions…](https://www.etax.nat.gov.tw/) |
| `tax-in` | Tax rules for IN: New regime FY2026-27: 0/5/10/15/20/25/30% slabs, ₹75,000 standard deduc… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-04-01 (tax year FY2026-27) | [New regime FY2026-27: 0/5/10/15/20/25/30% slabs, ₹75,000 st…](https://incometaxindia.gov.in/) |
| `tax-au` | Tax rules for AU: Resident rates 2026-27: 0/15/30/37/45% ($18,200 / $45,000 / $135,000 / … | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-07-01 (tax year 2026-27) | [Resident rates 2026-27: 0/15/30/37/45% ($18,200 / $45,000 /…](https://treasury.gov.au/tax-cuts) |
| `tax-nz` | Tax rules for NZ: IRD rates from 1 Apr 2025: 10.5/17.5/30/33/39% ($15,600 / $53,500 / $78… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-04-01 (tax year 2026/27) | [IRD rates from 1 Apr 2025: 10.5/17.5/30/33/39% ($15,600 / $…](https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals) |
| `tax-ca` | Tax rules for CA: CRA T4127 (January 2026): federal 14/20.5/26/29/33% ($58,523 / $117,045… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [CRA T4127 (January 2026): federal 14/20.5/26/29/33% ($58,52…](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html) |
| `tax-ca-on` | Tax rules for CA-ON: Ontario 2026 (T4127 Table 8.1): 5.05/9.15/11.16/12.16/13.16% ($53,89… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Ontario 2026 (T4127 Table 8.1): 5.05/9.15/11.16/12.16/13.16…](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html) |
| `tax-ca-bc` | Tax rules for CA-BC: British Columbia 2026: 5.60/7.70/10.50/12.29/14.70/16.80/20.50% ($50… | static-constant-from-a-source | detect | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [British Columbia 2026: 5.60/7.70/10.50/12.29/14.70/16.80/20…](https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates) |
| `tax-ca-qc` | Tax rules for CA-QC: Quebec 2025 brackets 14/19/24/25.75%, federal abatement 16.5%; QPP 6… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [Quebec 2025 brackets 14/19/24/25.75%, federal abatement 16.…](https://www.revenuquebec.ca/en/citizens/income-tax-return/) |
| `tax-mx` | Tax rules for MX: ISR annual table (Art. 152 LISR, 2025 values) 1.92%-35%; IMSS employee … | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2025-01-01 (tax year 2025) | [ISR annual table (Art. 152 LISR, 2025 values) 1.92%-35%; IM…](https://www.sat.gob.mx/) |
| `tax-br` | Tax rules for BR: Receita Federal 2026 monthly IRPF table 0%-27.5%, R$189.59 per dependen… | static-constant-from-a-source | manual | scripts/refresh/tax.js | 2026-01-01 (tax year 2026) | [Receita Federal 2026 monthly IRPF table 0%-27.5%, R$189.59 …](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026) |
| `living-scale` | Household living-cost scale LIVING_SCALE: after-housing-costs modified OECD equivalence s… | product-policy | detect | scripts/refresh/living.js | 2024-01-01 | [UK DWP Households Below Average Income, modified OECD scale…](https://www.gov.scot/publications/poverty-in-scotland-methodology/pages/income-equivalisation/) |
| `salary-interval-factors` | Annualization factors used client-side and stated in docs (hourly × 2080, monthly × 12, w… | product-policy | manual | scripts/refresh/policy.js | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `salary-parser-bounds` | Salary parser plausibility bounds (annual USD) and tier/range heuristics | product-policy | manual | scripts/refresh/policy.js | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `listing-freshness-buckets` | Listing-age buckets and copy in the UI (filter options, card age, 180+ day notes). | product-policy | manual | scripts/refresh/policy.js | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `geo-gazetteer` | Gazetteer size and coordinates as cited in docs and copied into mock/demo data. | static-data | manual | manual | 2026-10-02 | [hand-built gazetteer](https://github.com/alvations/melon-seek/blob/main/server/geo.js) |
| `country-currency` | Currency symbols and lists in the UI. | static-data | manual | manual | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `demo-data` | Synthetic data in public/: features/demo-data.js (demo page + tests) and mock-api.js (?mo… | product-policy | manual | manual | 2026-09-30 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `og-card` | Social share card public/og/melon-seek-og.png (1200x630, og:image/twitter:image for every… | product-policy | manual | scripts/refresh/derived.js | 2026-10-02 | [melon-seek design (illustrative figures, no company names)](https://alvations.github.io/melon-seek/og/melon-seek-og.png) |
| `strategy-market-figures` | Third-party market statistics cited in docs/strategy/*.md (competitive analysis and roadm… | static-data | manual | manual | 2026-10-02 | [cited sources S1..S70 in docs/strategy/COMPETITIVE_ANALYSIS…](https://www.hiringlab.org/) |
| `ui-stat-thresholds` | PROPOSED NEW ID. Product-policy thresholds that decide what the UI shows (top-N, minimum … | product-policy | manual | manual | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `rents-us-hud-fmr` | HUD Fair Market Rents by bedroom count for the 30 HUD areas of the 40 US cities: the 2- a… | fetched | auto | scripts/refresh/rents.js | 2025-10-01 | [HUD Fair Market Rents (40th-percentile gross rent incl. uti…](https://www.huduser.gov/portal/datasets/fmr.html) |
| `rents-ch-zurich` | Statistik Stadt Zürich Mietpreiserhebung: median net rent of private flats let in the las… | fetched | auto | scripts/refresh/rents.js | 2026-04-01 | [Stadt Zürich open data, bau_whg_mpe_mietpreis_raum_zizahl_g…](https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161) |
| `rents-fr-olap` | Observatoires locaux des loyers (OLAP), national results on data.gouv.fr: Paris intra-mur… | fetched | auto | scripts/refresh/rents.js | 2025-01-01 | [Résultats nationaux des observatoires locaux des loyers (Ba…](https://www.data.gouv.fr/fr/datasets/resultats-nationaux-des-observatoires-locaux-des-loyers/) |
| `market-comps-policy` | Market comps policy: minimum postings per cell (minN 3), $100 rounding of p25/median/p75,… | product-policy | manual | scripts/refresh/policy.js | 2026-10-02 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `archive-policy` | Archive thresholds behind the opened / closed counts and the report cells: unseen-close d… | product-policy | manual | manual | 2026-10-10 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |

#### ad-hoc (4)

| Id | What | Type | Mechanism | Updater | As of | Source |
|---|---|---|---|---|---|---|
| `households` | Household presets for the Juice Score (Just me = 1 bed, Couple = 2 bed, Family = 2 adults… | product-policy | manual | manual | 2026-10-10 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `company-registry` | Built-in companies (slug, name, board, colour, channel) as duplicated in UI fallbacks, mo… | static-data | detect | scripts/refresh/jobs.js | 2026-10-10 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `ops-constants` | Client-side ops constants (surface contribution). | product-policy | manual | manual | 2026-10-10 | [melon-seek (our own choice)](https://github.com/alvations/melon-seek) |
| `workflow-schedules` | Workflow cron schedules, artifact retention and timeouts: when data is refreshed and how … | product-policy | manual | manual | 2026-10-10 | [GitHub Actions configuration](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule) |

### By surface (where users see it)

Each dataset is listed under every surface that shows it or computes from it.

<details><summary><strong>drawer Juice block</strong> (101 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `bigmac-prices` | `server/juice.js computeJuice() bigMacs, inputs.bigMac`, `server/juice.js:1277`, `server/juice.js:1266` |
| `cities-dataset` | `server/juice.js findCity() / matchCity()` |
| `cost-index` | `server/juice.js:1231`, `server/juice.js:1257`, `public/app.js:2125`, `public/app.js:2163`, `public/app.js:2157`, `public/features/freshness.js:137` |
| `fx-per-usd` | `server/juice.js computeJuice() inputs.fx / usdPerUnit()`, `data/cities.json cities[].rent*USD`, `server/juice.js:1107`, `server/juice.js:1265`, `public/app.js:2052`, `server/juice.js computeJuice inputs.fx.source / asOf` |
| `fx-usd-pegs` | `server/juice.js:1107` |
| `geo-gazetteer` | `server/juice.js:1367` |
| `history-ledger` | `public/app.js:2380`, `public/app.js:2373` |
| `households` | `public/app.js:2125`, `server/juice.js:112`, `public/app.js:2172`, `public/app.js:2152`, `public/app.js:2163` |
| `job-juice` | `public/app.js:2125` |
| `job-salary-parsed` | `server/juice.js:1411`, `public/app.js:2322`, `public/app.js:2215`, `public/app.js:2279`, `server/juice.js:1407`, `public/app.js:2315` +2 |
| `job-salary-usd` | `server/juice.js:1411`, `public/app.js:2008-2013`, `public/app.js:2024`, `server/juice.js:1407` |
| `juice-confidence-rules` | `server/juice.js computeJuice() confidence`, `server/juice.js:1279`, `server/juice.js:1275` |
| `juice-grades` | `public/app.js:1329`, `public/viz/map.js:24`, `public/app.js:2139` |
| `juice-score-anchors` | `server/juice.js scoreFromNet() / netForScore()`, `public/viz/palette.js:256`, `server/juice.js:156`, `public/app.js:2139` |
| `listing-freshness-buckets` | `public/app.js:2391`, `public/app.js:2384` |
| `living-scale` | `server/juice.js:1230`, `public/app.js:2157`, `public/features/freshness.js:137` |
| `methodology-page` | `public/app.js:2058` |
| `nyc-basket` | `server/juice.js:1229`, `public/app.js:2157` |
| `rents-1br-quoted` | `server/juice.js:1295`, `public/app.js:2125`, `public/app.js:2162`, `public/app.js:2185`, `server/juice.js:1291`, `public/app.js:2156` +2 |
| `rents-bedroom-ratios` | `server/juice.js:1295`, `public/app.js:2065`, `public/app.js:2152`, `server/juice.js:1291`, `public/app.js:2156`, `public/app.js:2178` +1 |
| `rents-ca-statcan` | `server/juice.js:1291`, `public/app.js:2156`, `public/app.js:2178`, `public/features/freshness.js:105` |
| `rents-ch-zurich` | `server/juice.js:1291`, `public/app.js:2156`, `public/app.js:2178`, `public/features/freshness.js:105` |
| `rents-fr-olap` | `server/juice.js:1291`, `public/app.js:2156`, `public/app.js:2178`, `public/features/freshness.js:105` |
| `rents-gb-ons` | `server/juice.js:1291`, `public/app.js:2156`, `public/app.js:2178`, `public/features/freshness.js:105` |
| `rents-ie-rtb` | `server/juice.js:1291`, `public/app.js:2156`, `public/app.js:2178`, `public/features/freshness.js:105` |
| `rents-nsw-official` | `server/juice.js:1295`, `server/juice.js:1291`, `public/app.js:2156`, `public/app.js:2178`, `public/features/freshness.js:105` |
| `rents-sg-hdb` | `server/juice.js:1291`, `public/app.js:2156`, `public/app.js:2178`, `public/features/freshness.js:105` |
| `rents-us-hud-fmr` | `server/juice.js:1291`, `public/app.js:2156`, `public/app.js:2178`, `public/features/freshness.js:105` |
| `salary-vetting-flags` | `public/app.js:1161`, `public/app.js:2201`, `public/app.js:2194` |
| `tax-ae` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-at` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-au` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-be` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-br` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-ca` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-ca-bc` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-ca-on` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-ca-qc` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-ch` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-ch-ge` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-ch-zh` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-cz` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-de` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-dk` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-ee` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-es` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-es-ct` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-es-md` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-fi` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-fr` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-gb` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-gb-sct` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-hk` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-ie` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-il` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-in` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-it` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-jp` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-kr` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-mx` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-nl` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-no` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-nz` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-pl` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-pt` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-sa` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-se` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-sg` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-tw` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-al` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-az` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-ca` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-co` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-dc` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-fl` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-ga` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-il` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-local-columbus` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-local-detroit` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-local-md-county` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-local-nyc` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-local-philadelphia` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-local-pittsburgh` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-local-portland` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-ma` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-md` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-mi` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-mn` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-nc` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-nv` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-ny` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-oh` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-or` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-pa` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-tn` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-tx` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-ut` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-va` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `tax-us-wa` | `server/juice.js taxFor()`, `public/viz/map.js juiceAt()`, `public/app.js:2151`, `server/juice.js:1248`, `public/app.js:2161`, `public/app.js:2155` +1 |
| `ui-stat-thresholds` | `public/app.js:2215` |

</details>

<details><summary><strong>chart</strong> (23 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `company-aggregates` | `public/viz/chart.js:414` |
| `cost-index` | `public/app.js:520` |
| `country-currency` | `server/salary.js:117`, `server/normalize.js:82`, `server/sources/greenhouse.js:56`, `public/viz/chart.js:332` |
| `fx-per-usd` | `public/viz/chart.js:193`, `public/app.js:383`, `public/viz/chart.js:332`, `public/viz/chart.js:982` |
| `job-postings` | `public/app.js`, `public/app.js:383`, `public/viz/chart.js:325` |
| `job-salary-parsed` | `public/app.js:383`, `public/viz/chart.js:981` |
| `job-salary-usd` | `public/viz/chart.js`, `public/app.js:383`, `public/viz/chart.js:101`, `public/viz/chart.js:442` |
| `keyword-lexicons` | `server/normalize.js:128` |
| `rents-1br-quoted` | `public/app.js:520` |
| `rents-bedroom-ratios` | `public/app.js:520` |
| `rents-ca-statcan` | `public/app.js:520` |
| `rents-ch-zurich` | `public/app.js:520` |
| `rents-fr-olap` | `public/app.js:520` |
| `rents-gb-ons` | `public/app.js:520` |
| `rents-ie-rtb` | `public/app.js:520` |
| `rents-nsw-official` | `public/app.js:520` |
| `rents-sg-hdb` | `public/app.js:520` |
| `rents-us-hud-fmr` | `public/app.js:520` |
| `salary-interval-factors` | `server/salary.js:36` |
| `salary-parser-bounds` | `server/normalize.js:76` |
| `salary-vetting-bounds` | `server/vet.js:239` |
| `seniority-ladder` | `server/normalize.js:132` |
| `ui-stat-thresholds` | `public/viz/chart.js:101` |

</details>

<details><summary><strong>map</strong> (90 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `company-aggregates` | `public/viz/map.js:410` |
| `cost-index` | `public/viz/map.js:290`, `public/viz/map.js:114` |
| `fx-per-usd` | `public/viz/map.js:52` |
| `geo-gazetteer` | `server/normalize.js:53`, `public/viz/map.js:52`, `public/viz/map.js:74` |
| `job-juice` | `public/viz/map.js` |
| `job-salary-usd` | `public/viz/map.js`, `public/viz/map.js:52`, `public/viz/map.js:47` |
| `juice-grades` | `public/viz/map.js:137`, `public/viz/map.js:268`, `public/viz/palette.js:246` |
| `juice-score-anchors` | `server/juice.js:172`, `public/viz/map.js:126`, `public/viz/map.js:260`, `public/viz/map.js:364` |
| `nyc-basket` | `public/viz/map.js:114` |
| `rents-1br-quoted` | `public/viz/map.js:290`, `public/viz/map.js:114` |
| `rents-bedroom-ratios` | `public/viz/map.js:114` |
| `rents-ca-statcan` | `public/viz/map.js:114` |
| `rents-ch-zurich` | `public/viz/map.js:114` |
| `rents-fr-olap` | `public/viz/map.js:114` |
| `rents-gb-ons` | `public/viz/map.js:114` |
| `rents-ie-rtb` | `public/viz/map.js:114` |
| `rents-nsw-official` | `public/viz/map.js:114` |
| `rents-sg-hdb` | `public/viz/map.js:114` |
| `rents-us-hud-fmr` | `public/viz/map.js:114` |
| `tax-ae` | `public/viz/map.js:102` |
| `tax-at` | `public/viz/map.js:102` |
| `tax-au` | `public/viz/map.js:102` |
| `tax-be` | `public/viz/map.js:102` |
| `tax-br` | `public/viz/map.js:102` |
| `tax-ca` | `public/viz/map.js:102` |
| `tax-ca-bc` | `public/viz/map.js:102` |
| `tax-ca-on` | `public/viz/map.js:102` |
| `tax-ca-qc` | `public/viz/map.js:102` |
| `tax-ch` | `public/viz/map.js:102` |
| `tax-ch-ge` | `public/viz/map.js:102` |
| `tax-ch-zh` | `public/viz/map.js:102` |
| `tax-cz` | `public/viz/map.js:102` |
| `tax-de` | `public/viz/map.js:102` |
| `tax-dk` | `public/viz/map.js:102` |
| `tax-ee` | `public/viz/map.js:102` |
| `tax-es` | `public/viz/map.js:102` |
| `tax-es-ct` | `public/viz/map.js:102` |
| `tax-es-md` | `public/viz/map.js:102` |
| `tax-fi` | `public/viz/map.js:102` |
| `tax-fr` | `public/viz/map.js:102` |
| `tax-gb` | `public/viz/map.js:102` |
| `tax-gb-sct` | `public/viz/map.js:102` |
| `tax-hk` | `public/viz/map.js:102` |
| `tax-ie` | `public/viz/map.js:102` |
| `tax-il` | `public/viz/map.js:102` |
| `tax-in` | `public/viz/map.js:102` |
| `tax-it` | `public/viz/map.js:102` |
| `tax-jp` | `public/viz/map.js:102` |
| `tax-kr` | `public/viz/map.js:102` |
| `tax-mx` | `public/viz/map.js:102` |
| `tax-nl` | `public/viz/map.js:102` |
| `tax-no` | `public/viz/map.js:102` |
| `tax-nz` | `public/viz/map.js:102` |
| `tax-pl` | `public/viz/map.js:102` |
| `tax-pt` | `public/viz/map.js:102` |
| `tax-sa` | `public/viz/map.js:102` |
| `tax-se` | `public/viz/map.js:102` |
| `tax-sg` | `public/viz/map.js:102` |
| `tax-tw` | `public/viz/map.js:102` |
| `tax-us` | `public/viz/map.js:102` |
| `tax-us-al` | `public/viz/map.js:102` |
| `tax-us-az` | `public/viz/map.js:102` |
| `tax-us-ca` | `public/viz/map.js:102` |
| `tax-us-co` | `public/viz/map.js:102` |
| `tax-us-dc` | `public/viz/map.js:102` |
| `tax-us-fl` | `public/viz/map.js:102` |
| `tax-us-ga` | `public/viz/map.js:102` |
| `tax-us-il` | `public/viz/map.js:102` |
| `tax-us-local-columbus` | `public/viz/map.js:102` |
| `tax-us-local-detroit` | `public/viz/map.js:102` |
| `tax-us-local-md-county` | `public/viz/map.js:102` |
| `tax-us-local-nyc` | `public/viz/map.js:102` |
| `tax-us-local-philadelphia` | `public/viz/map.js:102` |
| `tax-us-local-pittsburgh` | `public/viz/map.js:102` |
| `tax-us-local-portland` | `public/viz/map.js:102` |
| `tax-us-ma` | `public/viz/map.js:102` |
| `tax-us-md` | `public/viz/map.js:102` |
| `tax-us-mi` | `public/viz/map.js:102` |
| `tax-us-mn` | `public/viz/map.js:102` |
| `tax-us-nc` | `public/viz/map.js:102` |
| `tax-us-nv` | `public/viz/map.js:102` |
| `tax-us-ny` | `public/viz/map.js:102` |
| `tax-us-oh` | `public/viz/map.js:102` |
| `tax-us-or` | `public/viz/map.js:102` |
| `tax-us-pa` | `public/viz/map.js:102` |
| `tax-us-tn` | `public/viz/map.js:102` |
| `tax-us-tx` | `public/viz/map.js:102` |
| `tax-us-ut` | `public/viz/map.js:102` |
| `tax-us-va` | `public/viz/map.js:102` |
| `tax-us-wa` | `public/viz/map.js:102` |

</details>

<details><summary><strong>Same role elsewhere</strong> (9 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `company-aggregates` | `public/features/comps.js:207` |
| `compstimate-model` | `scripts/build-market.js:30` |
| `fx-per-usd` | `scripts/build-market.js:112`, `scripts/build-market.js:51` |
| `job-salary-parsed` | `scripts/build-market.js:51` |
| `job-salary-usd` | `scripts/build-market.js:79` |
| `market-comps` | `public/features/comps.js:207`, `public/app.js:2433`, `public/app.js:2450`, `public/viz/comps.js:41`, `public/app.js:2426`, `public/app.js:2443` |
| `market-comps-policy` | `public/app.js:2426` |
| `role-families` | `scripts/build-market.js:82`, `public/features/comps.js:73` |
| `seniority-ladder` | `scripts/build-market.js:84`, `public/features/comps.js:58` |

</details>

<details><summary><strong>Compare companies</strong> (15 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `cost-index` | `public/app.js:2180` |
| `fx-per-usd` | `public/features/shared.js:25`, `public/features/comps.js:206` |
| `market-comps` | `public/features/comps.js:172`, `public/features/comps.js:207` |
| `market-comps-policy` | `public/app.js:1655`, `public/features/comps.js:207` |
| `rents-1br-quoted` | `public/app.js:2180` |
| `rents-bedroom-ratios` | `public/app.js:2180` |
| `rents-ca-statcan` | `public/app.js:2180` |
| `rents-ch-zurich` | `public/app.js:2180` |
| `rents-fr-olap` | `public/app.js:2180` |
| `rents-gb-ons` | `public/app.js:2180` |
| `rents-ie-rtb` | `public/app.js:2180` |
| `rents-nsw-official` | `public/app.js:2180` |
| `rents-sg-hdb` | `public/app.js:2180` |
| `rents-us-hud-fmr` | `public/app.js:2180` |
| `role-families` | `public/features/comps.js:143` |

</details>

<details><summary><strong>Compstimate</strong> (7 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `compstimate-backtest` | `server/index.js:304`, `scripts/build-static.js:759`, `public/app.js:2276`, `public/features/compstimate.js:387`, `public/features/compstimate.js:735`, `public/app.js:2269` |
| `compstimate-model` | `server/index.js:324`, `public/app.js:2264`, `public/features/compstimate.js:726`, `public/features/compstimate.js:716`, `public/app.js:2257`, `public/features/compstimate.js:735 "past estimates at X missed by more than 25%"` |
| `fx-per-usd` | `public/features/shared.js:25`, `public/features/shared.js:56` |
| `job-salary-parsed` | `public/features/compstimate.js:565` |
| `job-salary-usd` | `public/features/compstimate.js` |
| `salary-vetting-bounds` | `server/vet.js:266` |
| `seniority-ladder` | `public/features/compstimate.js:34`, `public/features/compstimate.js:668` |

</details>

<details><summary><strong>Insights</strong> (7 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `company-aggregates` | `public/app.js:1345`, `public/features/insights.js:333` |
| `fx-per-usd` | `public/features/insights.js:30`, `public/features/insights.js:349` |
| `insights-distributions` | `public/app.js:1646` |
| `job-postings` | `public/features/insights.js:349` |
| `job-salary-usd` | `public/features/insights.js`, `public/features/insights.js:30` |
| `keyword-lexicons` | `public/features/insights.js:58`, `public/features/insights.js:137` |
| `ui-stat-thresholds` | `public/features/insights.js:239` |

</details>

<details><summary><strong>list, badges, filters</strong> (99 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `company-aggregates` | `public/app.js:1537` |
| `cost-index` | `public/app.js:363`, `public/app.js:364` |
| `country-currency` | `public/app.js:91` |
| `demo-data` | `public/app.js:743` |
| `fx-per-usd` | `public/app.js:383` |
| `history-ledger` | `public/app.js:2379`, `public/app.js:1902`, `public/app.js:1271`, `public/app.js:2372` |
| `job-juice` | `public/app.js:364`, `public/app.js:1345` |
| `job-postings` | `public/app.js:691`, `public/app.js:1537`, `public/app.js:747`, `public/app.js:770` |
| `job-salary-parsed` | `public/app.js:1920` |
| `job-salary-usd` | `public/app.js:495-510` |
| `juice-confidence-rules` | `public/app.js:1873` |
| `juice-grades` | `public/app.js:364`, `server/juice.js:162`, `public/app.js:363`, `public/app.js:1329`, `public/app.js:1346` |
| `juice-score-anchors` | `public/app.js:1870` |
| `keyword-lexicons` | `public/app.js:1884`, `public/app.js:1294` |
| `listing-freshness-buckets` | `server/history.js:255`, `public/app.js:2379`, `public/app.js:1270`, `public/app.js:2372` |
| `rents-1br-quoted` | `public/app.js:363`, `public/app.js:364` |
| `rents-bedroom-ratios` | `public/app.js:364` |
| `rents-ca-statcan` | `public/app.js:364` |
| `rents-ch-zurich` | `public/app.js:364` |
| `rents-fr-olap` | `public/app.js:364` |
| `rents-gb-ons` | `public/app.js:364` |
| `rents-ie-rtb` | `public/app.js:364` |
| `rents-nsw-official` | `public/app.js:364` |
| `rents-sg-hdb` | `public/app.js:364` |
| `rents-us-hud-fmr` | `public/app.js:364` |
| `role-families` | `public/app.js:399` |
| `salary-vetting-flags` | `public/app.js:1921` |
| `seniority-ladder` | `public/app.js:429` |
| `tax-ae` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-at` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-au` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-be` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-br` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-ca` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-ca-bc` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-ca-on` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-ca-qc` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-ch` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-ch-ge` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-ch-zh` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-cz` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-de` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-dk` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-ee` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-es` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-es-ct` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-es-md` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-fi` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-fr` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-gb` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-gb-sct` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-hk` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-ie` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-il` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-in` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-it` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-jp` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-kr` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-mx` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-nl` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-no` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-nz` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-pl` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-pt` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-sa` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-se` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-sg` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-tw` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-al` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-az` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-ca` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-co` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-dc` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-fl` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-ga` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-il` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-local-columbus` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-local-detroit` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-local-md-county` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-local-nyc` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-local-philadelphia` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-local-pittsburgh` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-local-portland` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-ma` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-md` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-mi` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-mn` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-nc` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-nv` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-ny` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-oh` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-or` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-pa` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-tn` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-tx` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-ut` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-va` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |
| `tax-us-wa` | `public/app.js juice badge, Juice filter and sort`, `public/app.js:1870` |

</details>

<details><summary><strong>drawer (pay, dates, labels)</strong> (1 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `keyword-lexicons` | `public/app.js "+ equity mentioned / + bonus mentioned" drawer notes` |

</details>

<details><summary><strong>methodology page</strong> (96 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `bigmac-prices` | `docs/LIVABILITY.md §1 (bigMacs field), §4 sources`, `docs/LIVABILITY.md:44`, `docs/LIVABILITY.md:735`, `docs/LIVABILITY.md:698` |
| `cities-dataset` | `docs/LIVABILITY.md §4 ("89 cities")`, `docs/LIVABILITY.md:11` |
| `cost-index` | `docs/LIVABILITY.md:17`, `docs/LIVABILITY.md:726`, `docs/LIVABILITY.md:857-862`, `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:394`, `docs/LIVABILITY.md:552` |
| `docs-counts` | `docs/LIVABILITY.md:11`, `docs/LIVABILITY.md:29`, `docs/LIVABILITY.md:110`, `docs/LIVABILITY.md:127`, `docs/LIVABILITY.md:213`, `docs/LIVABILITY.md:399` +7 |
| `fx-per-usd` | `docs/LIVABILITY.md §2, §5`, `docs/LIVABILITY.md:894`, `docs/LIVABILITY.md:251`, `docs/LIVABILITY.md §5 sources table (fxPerUSD row)` |
| `households` | `docs/LIVABILITY.md §1 Households`, `docs/LIVABILITY.md:51-103` |
| `juice-calibration-doc` | `docs/LIVABILITY.md:149`, `docs/LIVABILITY.md:144` |
| `juice-confidence-rules` | `docs/LIVABILITY.md "Guardrails"`, `docs/LIVABILITY.md:103`, `docs/LIVABILITY.md:115`, `docs/LIVABILITY.md:98`, `docs/LIVABILITY.md:110` |
| `juice-grades` | `docs/LIVABILITY.md grade table`, `docs/LIVABILITY.md:137`, `docs/LIVABILITY.md:132` |
| `juice-score-anchors` | `docs/LIVABILITY.md "Score curve and grades" + calibration table`, `docs/LIVABILITY.md:126`, `docs/LIVABILITY.md:31`, `docs/LIVABILITY.md:126-146`, `docs/LIVABILITY.md:121`, `docs/LIVABILITY.md:121-141` |
| `juice-worked-examples` | `docs/LIVABILITY.md:173`, `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:181`, `docs/LIVABILITY.md:130`, `docs/LIVABILITY.md:295`, `dist/methodology/index.html` |
| `living-scale` | `docs/LIVABILITY.md:70`, `docs/LIVABILITY.md:29`, `docs/LIVABILITY.md:76-83`, `docs/LIVABILITY.md:51` |
| `methodology-page` | `docs/LIVABILITY.md:173`, `scripts/methodology.js:88`, `dist/methodology/index.html`, `server/index.js:874` |
| `nyc-basket` | `docs/LIVABILITY.md:29`, `docs/LIVABILITY.md:701`, `docs/LIVABILITY.md:394`, `docs/LIVABILITY.md:168` |
| `rents-1br-quoted` | `docs/LIVABILITY.md:17`, `docs/LIVABILITY.md:791-807`, `docs/LIVABILITY.md:699`, `docs/LIVABILITY.md:809`, `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:394` +2 |
| `rents-bedroom-ratios` | `docs/LIVABILITY.md:739`, `docs/LIVABILITY.md:758-777`, `docs/LIVABILITY.md:705`, `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:394`, `docs/LIVABILITY.md:439` |
| `rents-ca-statcan` | `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:394`, `docs/LIVABILITY.md:439` |
| `rents-ch-zurich` | `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:394`, `docs/LIVABILITY.md:439` |
| `rents-fr-olap` | `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:394`, `docs/LIVABILITY.md:439` |
| `rents-gb-ons` | `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:394`, `docs/LIVABILITY.md:439` |
| `rents-ie-rtb` | `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:394`, `docs/LIVABILITY.md:439` |
| `rents-nsw-official` | `docs/LIVABILITY.md:706`, `docs/LIVABILITY.md:749`, `docs/LIVABILITY.md:222`, `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:394`, `docs/LIVABILITY.md:439` +1 |
| `rents-sg-hdb` | `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:394`, `docs/LIVABILITY.md:439` |
| `rents-us-hud-fmr` | `docs/LIVABILITY.md:168`, `docs/LIVABILITY.md:394`, `docs/LIVABILITY.md:439` |
| `salary-interval-factors` | `docs/LIVABILITY.md:249`, `docs/LIVABILITY.md:236` |
| `tax-ae` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:627`, `docs/LIVABILITY.md:265` |
| `tax-at` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:617`, `docs/LIVABILITY.md:265` |
| `tax-au` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:635`, `docs/LIVABILITY.md:210`, `docs/LIVABILITY.md:265` |
| `tax-be` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:618`, `docs/LIVABILITY.md:265` |
| `tax-br` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:642`, `docs/LIVABILITY.md:265` |
| `tax-ca` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:637`, `docs/LIVABILITY.md:265` |
| `tax-ca-bc` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:639`, `docs/LIVABILITY.md:265` |
| `tax-ca-on` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:638`, `docs/LIVABILITY.md:265` |
| `tax-ca-qc` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:640`, `docs/LIVABILITY.md:265` |
| `tax-ch` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:606`, `docs/LIVABILITY.md:182`, `docs/LIVABILITY.md:265` |
| `tax-ch-ge` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:608`, `docs/LIVABILITY.md:265` |
| `tax-ch-zh` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:607`, `docs/LIVABILITY.md:182`, `docs/LIVABILITY.md:265` |
| `tax-cz` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:624`, `docs/LIVABILITY.md:265` |
| `tax-de` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:609`, `docs/LIVABILITY.md:183`, `docs/LIVABILITY.md:265` |
| `tax-dk` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:620`, `docs/LIVABILITY.md:265` |
| `tax-ee` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:625`, `docs/LIVABILITY.md:265` |
| `tax-es` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:612`, `docs/LIVABILITY.md:265` |
| `tax-es-ct` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:614`, `docs/LIVABILITY.md:265` |
| `tax-es-md` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:613`, `docs/LIVABILITY.md:265` |
| `tax-fi` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:622`, `docs/LIVABILITY.md:265` |
| `tax-fr` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:610`, `docs/LIVABILITY.md:265` |
| `tax-gb` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:603`, `docs/LIVABILITY.md:181`, `docs/LIVABILITY.md:265` |
| `tax-gb-sct` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:604`, `docs/LIVABILITY.md:265` |
| `tax-hk` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:632`, `docs/LIVABILITY.md:265` |
| `tax-ie` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:605`, `docs/LIVABILITY.md:265` |
| `tax-il` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:626`, `docs/LIVABILITY.md:265` |
| `tax-in` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:634`, `docs/LIVABILITY.md:184`, `docs/LIVABILITY.md:265` |
| `tax-it` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:616`, `docs/LIVABILITY.md:265` |
| `tax-jp` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:629`, `docs/LIVABILITY.md:265` |
| `tax-kr` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:630`, `docs/LIVABILITY.md:265` |
| `tax-mx` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:641`, `docs/LIVABILITY.md:265` |
| `tax-nl` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:611`, `docs/LIVABILITY.md:265` |
| `tax-no` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:621`, `docs/LIVABILITY.md:265` |
| `tax-nz` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:636`, `docs/LIVABILITY.md:265` |
| `tax-pl` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:623`, `docs/LIVABILITY.md:265` |
| `tax-pt` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:615`, `docs/LIVABILITY.md:265` |
| `tax-sa` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:628`, `docs/LIVABILITY.md:265` |
| `tax-se` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:619`, `docs/LIVABILITY.md:265` |
| `tax-sg` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:631`, `docs/LIVABILITY.md:265` |
| `tax-tw` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:633`, `docs/LIVABILITY.md:265` |
| `tax-us` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:572`, `docs/LIVABILITY.md:177`, `docs/LIVABILITY.md:192`, `docs/LIVABILITY.md:265` |
| `tax-us-al` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:583`, `docs/LIVABILITY.md:265` |
| `tax-us-az` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:592`, `docs/LIVABILITY.md:265` |
| `tax-us-ca` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:573`, `docs/LIVABILITY.md:177`, `docs/LIVABILITY.md:192`, `docs/LIVABILITY.md:265` |
| `tax-us-co` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:587`, `docs/LIVABILITY.md:265` |
| `tax-us-dc` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:582`, `docs/LIVABILITY.md:265` |
| `tax-us-fl` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:577`, `docs/LIVABILITY.md:265` |
| `tax-us-ga` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:581`, `docs/LIVABILITY.md:265` |
| `tax-us-il` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:586`, `docs/LIVABILITY.md:265` |
| `tax-us-local-columbus` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:597`, `docs/LIVABILITY.md:265` |
| `tax-us-local-detroit` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:600`, `docs/LIVABILITY.md:265` |
| `tax-us-local-md-county` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:602`, `docs/LIVABILITY.md:265` |
| `tax-us-local-nyc` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:596`, `docs/LIVABILITY.md:178`, `docs/LIVABILITY.md:265` |
| `tax-us-local-philadelphia` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:598`, `docs/LIVABILITY.md:265` |
| `tax-us-local-pittsburgh` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:599`, `docs/LIVABILITY.md:265` |
| `tax-us-local-portland` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:601`, `docs/LIVABILITY.md:265` |
| `tax-us-ma` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:580`, `docs/LIVABILITY.md:265` |
| `tax-us-md` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:595`, `docs/LIVABILITY.md:265` |
| `tax-us-mi` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:594`, `docs/LIVABILITY.md:265` |
| `tax-us-mn` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:593`, `docs/LIVABILITY.md:265` |
| `tax-us-nc` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:589`, `docs/LIVABILITY.md:265` |
| `tax-us-nv` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:579`, `docs/LIVABILITY.md:265` |
| `tax-us-ny` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:574`, `docs/LIVABILITY.md:178`, `docs/LIVABILITY.md:265` |
| `tax-us-oh` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:584`, `docs/LIVABILITY.md:265` |
| `tax-us-or` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:590`, `docs/LIVABILITY.md:265` |
| `tax-us-pa` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:588`, `docs/LIVABILITY.md:265` |
| `tax-us-tn` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:578`, `docs/LIVABILITY.md:265` |
| `tax-us-tx` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:576`, `docs/LIVABILITY.md:179`, `docs/LIVABILITY.md:265` |
| `tax-us-ut` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:591`, `docs/LIVABILITY.md:265` |
| `tax-us-va` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:585`, `docs/LIVABILITY.md:265` |
| `tax-us-wa` | `docs/LIVABILITY.md §3 tax table`, `docs/LIVABILITY.md:278`, `docs/LIVABILITY.md:575`, `docs/LIVABILITY.md:265` |

</details>

<details><summary><strong>README</strong> (83 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `cities-dataset` | `README.md`, `README.md:175` |
| `company-registry` | `README.md:558`, `README.md:16`, `README.md:369` |
| `compstimate-backtest` | `README.md:187` |
| `docs-screenshots` | `README.md:27` |
| `history-ledger` | `README.md:115` |
| `job-postings` | `README.md / docs counts` |
| `ops-constants` | `README.md:574` |
| `readme-counts` | `README.md:16`, `README.md:78`, `README.md:175`, `README.md:219`, `README.md:346`, `README.md:187` +10 |
| `runtime-versions` | `README.md:154 "runs the tests on Node 20 and 22"` |
| `salary-interval-factors` | `README.md:501` |
| `share-pages` | `README.md:346` |
| `tax-ae` | `README.md:222` |
| `tax-at` | `README.md:222` |
| `tax-au` | `README.md:222` |
| `tax-be` | `README.md:222` |
| `tax-br` | `README.md:222` |
| `tax-ca` | `README.md:222` |
| `tax-ca-bc` | `README.md:222` |
| `tax-ca-on` | `README.md:222` |
| `tax-ca-qc` | `README.md:222` |
| `tax-ch` | `README.md:222` |
| `tax-ch-ge` | `README.md:222` |
| `tax-ch-zh` | `README.md:222` |
| `tax-cz` | `README.md:222` |
| `tax-de` | `README.md:222` |
| `tax-dk` | `README.md:222` |
| `tax-ee` | `README.md:222` |
| `tax-es` | `README.md:222` |
| `tax-es-ct` | `README.md:222` |
| `tax-es-md` | `README.md:222` |
| `tax-fi` | `README.md:222` |
| `tax-fr` | `README.md:222` |
| `tax-gb` | `README.md:222` |
| `tax-gb-sct` | `README.md:222` |
| `tax-hk` | `README.md:222` |
| `tax-ie` | `README.md:222` |
| `tax-il` | `README.md:222` |
| `tax-in` | `README.md:222` |
| `tax-it` | `README.md:222` |
| `tax-jp` | `README.md:222` |
| `tax-kr` | `README.md:222` |
| `tax-mx` | `README.md:222` |
| `tax-nl` | `README.md:222` |
| `tax-no` | `README.md:222` |
| `tax-nz` | `README.md:222` |
| `tax-pl` | `README.md:222` |
| `tax-pt` | `README.md:222` |
| `tax-sa` | `README.md:222` |
| `tax-se` | `README.md:222` |
| `tax-sg` | `README.md:222` |
| `tax-tw` | `README.md:222` |
| `tax-us` | `README.md:222` |
| `tax-us-al` | `README.md:222` |
| `tax-us-az` | `README.md:222` |
| `tax-us-ca` | `README.md:222` |
| `tax-us-co` | `README.md:222` |
| `tax-us-dc` | `README.md:222` |
| `tax-us-fl` | `README.md:222` |
| `tax-us-ga` | `README.md:222` |
| `tax-us-il` | `README.md:222` |
| `tax-us-local-columbus` | `README.md:222` |
| `tax-us-local-detroit` | `README.md:222` |
| `tax-us-local-md-county` | `README.md:222` |
| `tax-us-local-nyc` | `README.md:222` |
| `tax-us-local-philadelphia` | `README.md:222` |
| `tax-us-local-pittsburgh` | `README.md:222` |
| `tax-us-local-portland` | `README.md:222` |
| `tax-us-ma` | `README.md:222` |
| `tax-us-md` | `README.md:222` |
| `tax-us-mi` | `README.md:222` |
| `tax-us-mn` | `README.md:222` |
| `tax-us-nc` | `README.md:222` |
| `tax-us-nv` | `README.md:222` |
| `tax-us-ny` | `README.md:222` |
| `tax-us-oh` | `README.md:222` |
| `tax-us-or` | `README.md:222` |
| `tax-us-pa` | `README.md:222` |
| `tax-us-tn` | `README.md:222` |
| `tax-us-tx` | `README.md:222` |
| `tax-us-ut` | `README.md:222` |
| `tax-us-va` | `README.md:222` |
| `tax-us-wa` | `README.md:222` |
| `workflow-schedules` | `README.md:156` |

</details>

<details><summary><strong>OG image, share pages</strong> (7 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `company-aggregates` | `scripts/build-static.js:451`, `scripts/build-static.js:434` |
| `fx-per-usd` | `scripts/build-static.js:434` |
| `job-postings` | `scripts/build-static.js` |
| `job-salary-parsed` | `scripts/build-static.js:434` |
| `job-salary-usd` | `scripts/build-static.js:434` |
| `og-card` | `scripts/build-static.js:496`, `public/index.html:16`, `public/index.html:20`, `scripts/build-static.js:451` |
| `share-pages` | `scripts/build-static.js:496`, `scripts/build-static.js:458`, `scripts/build-static.js:450` |

</details>

<details><summary><strong>docs</strong> (90 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `archive-policy` | `docs/DATA_ARCHIVE.md` |
| `archive-reports` | `docs/DATA_ARCHIVE.md` |
| `company-registry` | `docs/strategy/COMPETITIVE_ANALYSIS.md:300` |
| `docs-counts` | `docs/CONTRACT.md:80`, `docs/CONTRACT.md:144`, `docs/ARCHITECTURE.md:82`, `docs/QA.md:4`, `docs/QA.md:21`, `docs/DATA_SOURCES.md:23` +8 |
| `docs-screenshots` | `docs/QA.md:71` |
| `fx-per-usd` | `server/vet.js:54` |
| `geo-gazetteer` | `docs/CONTRACT.md:80` |
| `juice-calibration-doc` | `server/juice.js:131` |
| `juice-worked-examples` | `docs/QA.md:338` |
| `listing-freshness-buckets` | `docs/CONTRACT.md:144` |
| `market-comps-policy` | `docs/CONTRACT.md` |
| `runtime-versions` | `docs/ARCHITECTURE.md:76 "Node 20/22 matrix"` |
| `salary-interval-factors` | `docs/VETTING.md:199`, `docs/VETTING.md:198` |
| `salary-parser-bounds` | `docs/VETTING.md:38` |
| `salary-vetting-bounds` | `docs/VETTING.md:84`, `docs/VETTING.md:93-99`, `docs/VETTING.md:109` |
| `salary-vetting-flags` | `docs/VETTING.md:278` |
| `seniority-ladder` | `docs/strategy/CORPORATE_LADDER_PLAN.md:78` |
| `strategy-market-figures` | `docs/strategy/COMPETITIVE_ANALYSIS.md:31`, `docs/strategy/COMPETITIVE_ANALYSIS.md:26` |
| `tax-ae` | `docs/LIVABILITY.md:168` |
| `tax-at` | `docs/LIVABILITY.md:168` |
| `tax-au` | `docs/LIVABILITY.md:168` |
| `tax-be` | `docs/LIVABILITY.md:168` |
| `tax-br` | `docs/LIVABILITY.md:168` |
| `tax-ca` | `docs/LIVABILITY.md:168` |
| `tax-ca-bc` | `docs/LIVABILITY.md:168` |
| `tax-ca-on` | `docs/LIVABILITY.md:168` |
| `tax-ca-qc` | `docs/LIVABILITY.md:168` |
| `tax-ch` | `docs/LIVABILITY.md:168` |
| `tax-ch-ge` | `docs/LIVABILITY.md:168` |
| `tax-ch-zh` | `docs/LIVABILITY.md:168` |
| `tax-cz` | `docs/LIVABILITY.md:168` |
| `tax-de` | `docs/LIVABILITY.md:168` |
| `tax-dk` | `docs/LIVABILITY.md:168` |
| `tax-ee` | `docs/LIVABILITY.md:168` |
| `tax-es` | `docs/LIVABILITY.md:168` |
| `tax-es-ct` | `docs/LIVABILITY.md:168` |
| `tax-es-md` | `docs/LIVABILITY.md:168` |
| `tax-fi` | `docs/LIVABILITY.md:168` |
| `tax-fr` | `docs/LIVABILITY.md:168` |
| `tax-gb` | `docs/LIVABILITY.md:168` |
| `tax-gb-sct` | `docs/LIVABILITY.md:168` |
| `tax-hk` | `docs/LIVABILITY.md:168` |
| `tax-ie` | `docs/LIVABILITY.md:168` |
| `tax-il` | `docs/LIVABILITY.md:168` |
| `tax-in` | `docs/LIVABILITY.md:168` |
| `tax-it` | `docs/LIVABILITY.md:168` |
| `tax-jp` | `docs/LIVABILITY.md:168` |
| `tax-kr` | `docs/LIVABILITY.md:168` |
| `tax-mx` | `docs/LIVABILITY.md:168` |
| `tax-nl` | `docs/LIVABILITY.md:168` |
| `tax-no` | `docs/LIVABILITY.md:168` |
| `tax-nz` | `docs/LIVABILITY.md:168` |
| `tax-pl` | `docs/LIVABILITY.md:168` |
| `tax-pt` | `docs/LIVABILITY.md:168` |
| `tax-sa` | `docs/LIVABILITY.md:168` |
| `tax-se` | `docs/LIVABILITY.md:168` |
| `tax-sg` | `docs/LIVABILITY.md:168` |
| `tax-tw` | `docs/LIVABILITY.md:168` |
| `tax-us` | `docs/LIVABILITY.md:168` |
| `tax-us-al` | `docs/LIVABILITY.md:168` |
| `tax-us-az` | `docs/LIVABILITY.md:168` |
| `tax-us-ca` | `docs/LIVABILITY.md:168` |
| `tax-us-co` | `docs/LIVABILITY.md:168` |
| `tax-us-dc` | `docs/LIVABILITY.md:168` |
| `tax-us-fl` | `docs/LIVABILITY.md:168` |
| `tax-us-ga` | `docs/LIVABILITY.md:168` |
| `tax-us-il` | `docs/LIVABILITY.md:168` |
| `tax-us-local-columbus` | `docs/LIVABILITY.md:168` |
| `tax-us-local-detroit` | `docs/LIVABILITY.md:168` |
| `tax-us-local-md-county` | `docs/LIVABILITY.md:168` |
| `tax-us-local-nyc` | `docs/LIVABILITY.md:168` |
| `tax-us-local-philadelphia` | `docs/LIVABILITY.md:168` |
| `tax-us-local-pittsburgh` | `docs/LIVABILITY.md:168` |
| `tax-us-local-portland` | `docs/LIVABILITY.md:168` |
| `tax-us-ma` | `docs/LIVABILITY.md:168` |
| `tax-us-md` | `docs/LIVABILITY.md:168` |
| `tax-us-mi` | `docs/LIVABILITY.md:168` |
| `tax-us-mn` | `docs/LIVABILITY.md:168` |
| `tax-us-nc` | `docs/LIVABILITY.md:168` |
| `tax-us-nv` | `docs/LIVABILITY.md:168` |
| `tax-us-ny` | `docs/LIVABILITY.md:168` |
| `tax-us-oh` | `docs/LIVABILITY.md:168` |
| `tax-us-or` | `docs/LIVABILITY.md:168` |
| `tax-us-pa` | `docs/LIVABILITY.md:168` |
| `tax-us-tn` | `docs/LIVABILITY.md:168` |
| `tax-us-tx` | `docs/LIVABILITY.md:168` |
| `tax-us-ut` | `docs/LIVABILITY.md:168` |
| `tax-us-va` | `docs/LIVABILITY.md:168` |
| `tax-us-wa` | `docs/LIVABILITY.md:168` |
| `ui-stat-thresholds` | `docs/VETTING.md:30` |

</details>

<details><summary><strong>API / data files</strong> (111 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `archive-policy` | `data-archive branch reports/ (monthly and annual review)` |
| `archive-reports` | `data-archive branch reports/ (monthly and annual review)` |
| `bigmac-prices` | `public/mock-api.js:50` |
| `cities-dataset` | `server/index.js:822`, `public/api.js:658`, `scripts/build-static.js:722` |
| `company-aggregates` | `archive reference/jobs-aggregates/<date>.json companies[]` |
| `company-registry` | `server/index.js:792`, `scripts/build-static.js:590` |
| `compstimate-backtest` | `public/mock-api.js:248`, `https://alvations.github.io/melon-seek/api/meta/<slug>.json` |
| `cost-index` | `server/juice.js:1254`, `server/index.js:822` |
| `demo-data` | `server/pipeline.js:84`, `scripts/build-static.js:14`, `server/export.js:84`, `public/features/demo.html:45` |
| `fx-per-usd` | `server/vet.js:124`, `server/salary.js:94`, `scripts/update-col.js:113`, `scripts/archive/jobs.js:47` |
| `fx-usd-pegs` | `server/salary.js:86` |
| `geo-gazetteer` | `public/mock-api.js:16`, `public/features/demo-data.js:8` |
| `history-ledger` | `server/index.js:301`, `scripts/build-static.js:349`, `server/export.js:13`, `public/api.js:337`, `public/mock-api.js:248`, `public/api.js:330` |
| `job-juice` | `public/api.js:697` |
| `job-postings` | `server/index.js:297`, `scripts/build-static.js:913`, `public/api.js:174`, `server/export.js:40`, `scripts/archive/jobs.js:?`, `scripts/refresh/jobs.js companyStats` +2 |
| `job-salary-parsed` | `server/export.js:48` |
| `jobs-aggregates` | `data-archive branch reference/jobs-aggregates/<asOf>.json`, `scripts/refresh/jobs.js readPreviousAggregate` |
| `juice-grades` | `public/mock-api.js:48` |
| `juice-score-anchors` | `public/mock-api.js:47` |
| `keyword-lexicons` | `archive jobs table extras column` |
| `listing-freshness-buckets` | `public/mock-api.js:220` |
| `llm-vet-config` | `.github/workflows/pages.yml:120` |
| `market-comps` | `server/index.js:823`, `public/api.js:677`, `public/mock-api.js:275`, `public/features/demo-data.js:128`, `public/api.js:661` |
| `nyc-basket` | `server/juice.js:1428`, `public/mock-api.js:31`, `server/juice.js:1424`, `public/mock-api.js:30` |
| `ops-constants` | `server/index.js:297`, `scripts/snapshot.js:54` |
| `rents-1br-quoted` | `public/api.js:713`, `public/mock-api.js:31`, `server/juice.js:1187`, `server/index.js:822`, `scripts/build-static.js:717`, `public/mock-api.js:30` |
| `rents-bedroom-ratios` | `server/juice.js:1187`, `server/index.js:822`, `scripts/build-static.js:717` |
| `rents-ca-statcan` | `server/juice.js:1187`, `server/index.js:822`, `scripts/build-static.js:717` |
| `rents-ch-zurich` | `server/juice.js:1187`, `server/index.js:822`, `scripts/build-static.js:717` |
| `rents-fr-olap` | `server/juice.js:1187`, `server/index.js:822`, `scripts/build-static.js:717` |
| `rents-gb-ons` | `server/juice.js:1187`, `server/index.js:822`, `scripts/build-static.js:717` |
| `rents-ie-rtb` | `server/juice.js:1187`, `server/index.js:822`, `scripts/build-static.js:717` |
| `rents-nsw-official` | `server/juice.js:1187`, `server/index.js:822`, `scripts/build-static.js:717` |
| `rents-sg-hdb` | `server/juice.js:1187`, `server/index.js:822`, `scripts/build-static.js:717` |
| `rents-us-hud-fmr` | `server/juice.js:1187`, `server/index.js:822`, `scripts/build-static.js:717` |
| `role-families` | `server/vet.js:205` |
| `salary-vetting-bounds` | `.github/workflows/pages.yml:112`, `public/mock-api.js:180` |
| `salary-vetting-flags` | `scripts/vet-salaries.js:203`, `public/api.js:747`, `public/api.js:727` |
| `seniority-ladder` | `server/export.js:12` |
| `tax-ae` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-at` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-au` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-be` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-br` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-ca` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-ca-bc` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-ca-on` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-ca-qc` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-ch` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-ch-ge` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-ch-zh` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-cz` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-de` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-dk` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-ee` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-es` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-es-ct` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-es-md` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-fi` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-fr` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-gb` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-gb-sct` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-hk` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-ie` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-il` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-in` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-it` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-jp` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-kr` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-mx` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-nl` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-no` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-nz` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-pl` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-pt` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-sa` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-se` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-sg` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-tw` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-al` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-az` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-ca` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-co` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-dc` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-fl` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-ga` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-il` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-local-columbus` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-local-detroit` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-local-md-county` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-local-nyc` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-local-philadelphia` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-local-pittsburgh` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-local-portland` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-ma` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-md` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-mi` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-mn` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-nc` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-nv` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-ny` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-oh` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-or` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-pa` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-tn` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-tx` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-ut` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-va` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `tax-us-wa` | `server/juice.js:1086`, `server/juice.js:1197`, `server/juice.js:1278`, `public/api.js:713`, `public/api.js:697` |
| `workflow-schedules` | `.github/workflows/snapshot.yml:1`, `.github/workflows/pages.yml:1` |

</details>

<details><summary><strong>tests</strong> (103 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `compstimate-backtest` | `test/features.test.js:459` |
| `compstimate-model` | `test/features.test.js:153`, `test/features.test.js:614` |
| `cost-index` | `test/juice.test.js:151` |
| `demo-data` | `test/features.test.js:20` |
| `e2e-pinned-values` | `test/juice.test.js:145`, `test/market.test.js:87`, `test/demo.test.js:80`, `test/demo.test.js:27`, `test/features.test.js:524`, `test/server.test.js:603` +7 |
| `fx-per-usd` | `test/fx-consistency.test.js`, `test/fx-consistency.test.js:11`, `test/features.test.js:91`, `test/features.test.js:720`, `test/juice.test.js:79`, `test/market.test.js:27` |
| `households` | `test/juice-household.test.js:28` |
| `juice-calibration-doc` | `test/juice.test.js:145` |
| `juice-confidence-rules` | `test/juice.test.js:295` |
| `juice-grades` | `test/juice.test.js:131` |
| `juice-score-anchors` | `test/juice.test.js:116` |
| `listing-freshness-buckets` | `test/e2e/ui.e2e.js:448` |
| `living-scale` | `test/juice-household.test.js:40`, `test/juice-household.test.js:88` |
| `market-comps` | `test/features.test.js:547`, `test/market.test.js:87` |
| `nyc-basket` | `test/juice.test.js:394` |
| `og-card` | `test/og.test.js:80` |
| `rents-1br-quoted` | `test/juice.test.js:60`, `test/juice-household.test.js` |
| `rents-bedroom-ratios` | `test/juice-household.test.js` |
| `rents-ca-statcan` | `test/juice-household.test.js` |
| `rents-ch-zurich` | `test/juice-household.test.js` |
| `rents-fr-olap` | `test/juice-household.test.js` |
| `rents-gb-ons` | `test/juice-household.test.js` |
| `rents-ie-rtb` | `test/juice-household.test.js` |
| `rents-nsw-official` | `test/juice-household.test.js` |
| `rents-sg-hdb` | `test/juice-household.test.js` |
| `rents-us-hud-fmr` | `test/juice-household.test.js` |
| `role-families` | `test/features.test.js:412` |
| `runtime-versions` | `.github/workflows/ci.yml:17` |
| `salary-interval-factors` | `test/features.test.js:104` |
| `salary-vetting-bounds` | `test/vet-gate.test.js:39`, `test/salary.test.js:298` |
| `seniority-ladder` | `test/features.test.js:157` |
| `share-pages` | `test/og.test.js:180` |
| `tax-ae` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-at` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-au` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-be` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-br` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-ca` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-ca-bc` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-ca-on` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-ca-qc` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-ch` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-ch-ge` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-ch-zh` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-cz` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-de` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-dk` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-ee` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-es` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-es-ct` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-es-md` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-fi` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-fr` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-gb` | `test/juice*.test.js`, `test/juice.test.js:79`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-gb-sct` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-hk` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-ie` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-il` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-in` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-it` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-jp` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-kr` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-mx` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-nl` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-no` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-nz` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-pl` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-pt` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-sa` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-se` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-sg` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-tw` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us` | `test/juice*.test.js`, `test/juice.test.js:45`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-al` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-az` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-ca` | `test/juice*.test.js`, `test/juice.test.js:45`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-co` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-dc` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-fl` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-ga` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-il` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-local-columbus` | `test/juice*.test.js`, `test/juice.test.js:65`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-local-detroit` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-local-md-county` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-local-nyc` | `test/juice*.test.js`, `test/juice.test.js:65`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-local-philadelphia` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-local-pittsburgh` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-local-portland` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-ma` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-md` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-mi` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-mn` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-nc` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-nv` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-ny` | `test/juice*.test.js`, `test/juice.test.js:68`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-oh` | `test/juice*.test.js`, `test/juice.test.js:65`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-or` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-pa` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-tn` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-tx` | `test/juice*.test.js`, `test/juice.test.js:67`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-ut` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-va` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |
| `tax-us-wa` | `test/juice*.test.js`, `test/juice.test.js:90`, `test/juice.test.js:46`, `test/fixtures/tax-golden.json` |

</details>

<details><summary><strong>other</strong> (2 datasets)</summary>

| Id | Where (file:line) |
|---|---|
| `fx-usd-pegs` | `scripts/refresh/fx.js buildTable()` |
| `job-salary-usd` | `scripts/build-market.js` |

</details>

### No update mechanism before (and what each has now)

| Id | Before | Now |
|---|---|---|
| `fx-usd-pegs` | none (AED/SAR came from Big Mac dollar_ex market rates; QAR 3.64 hard… | manual: manual |
| `juice-score-anchors` | none (hand-tuned 2026-10-02) | manual: scripts/refresh/policy.js |
| `juice-grades` | none | manual: scripts/refresh/policy.js |
| `juice-confidence-rules` | none | manual: scripts/refresh/policy.js |
| `households` | none | manual: manual |
| `living-scale` | none | detect: scripts/refresh/living.js |
| `salary-interval-factors` | none | manual: scripts/refresh/policy.js |
| `salary-parser-bounds` | none | manual: scripts/refresh/policy.js |
| `salary-vetting-bounds` | none | manual: scripts/refresh/policy.js |
| `llm-vet-config` | none | detect: scripts/refresh/policy.js |
| `company-registry` | none | detect: scripts/refresh/jobs.js |
| `compstimate-model` | none (hand-set 2026-10-02) | detect: scripts/refresh/jobs.js |
| `seniority-ladder` | none | detect: scripts/refresh/jobs.js |
| `keyword-lexicons` | none | detect: scripts/refresh/jobs.js |
| `listing-freshness-buckets` | none | manual: scripts/refresh/policy.js |
| `geo-gazetteer` | none | manual: manual |
| `country-currency` | none | manual: manual |
| `demo-data` | none | manual: manual |
| `ops-constants` | none | manual: manual |
| `workflow-schedules` | none | manual: manual |
| `runtime-versions` | none | manual: scripts/refresh/policy.js |
| `og-card` | none (rendered by hand once, 2026-10-02; nothing noticed when card.ht… | manual: scripts/refresh/derived.js |
| `readme-counts` | none (hand-written; nothing checked it) | detect: scripts/refresh/derived.js |
| `docs-counts` | none (hand-written) | detect: scripts/refresh/derived.js |
| `e2e-pinned-values` | none | detect: scripts/refresh/derived.js |
| `strategy-market-figures` | none | manual: manual |
| `ui-stat-thresholds` | none | manual: manual |
| `jobs-aggregates` | none (no monthly job/company history existed) | detect: scripts/refresh/jobs.js |
| `market-comps-policy` | none | manual: scripts/refresh/policy.js |
| `archive-reports` | none | auto: pipeline: .github/workflows/archive.yml (scripts/archive/re… |
| `archive-policy` | none | manual: manual |

### Every entry

<details><summary><code>fx-per-usd</code>: Exchange rates, local currency units per USD: every "approx USD" figure (chart, map, Insights, comps, Compstimate, Juic…</summary>

- **Type / cadence / mechanism:** fetched · monthly (+14 days grace) · auto via `scripts/refresh/fx.js`
- **Values:** 22 currencies + USD, e.g. GBP 0.74187, EUR 0.87439, JPY 162.135, INR 96.26375, KRW 1485.9 (identical in palette.js, server/juice.js and data/cities.json fx.perUSD as of 2026-10-10); shared.js adds CNY 0.14 USD per CNY
- **As of:** 2026-07-01 · last checked -
- **Source:** [ECB euro reference rates, monthly averages (crossed through…](https://data.ecb.europa.eu/data/datasets/EXR) (ECB statistics: reuse with source acknowledgement; Federal Reserve: public domain)
- **Defined in:** `data/cities.json fx.perUSD + cities[].fxPerUSD`, `server/juice.js:44 FX_AS_OF`, `server/juice.js:48 FX_PER_USD`, `public/viz/palette.js:128 FX_AS_OF`, `public/viz/palette.js:130 FX_PER_USD`, `server/salary.js:75 FX_PER_USD`, `server/salary.js:101 EXTRA_FX_PER_USD`, `public/features/shared.js:18 FX_FALLBACK.CNY`, `data/cities.json fx.perUSD (+ fx.asOf, fx.source)`, `data/cities.json cities[].fxPerUSD (89) + sources.fxPerUSD.asOf`, `public/viz/palette.js:128 FX_AS_OF '2026-07-01'`, `public/viz/palette.js:130 FX_PER_USD (23 currencies)`, `public/viz/palette.js:157 FX_TO_USD = 1/FX_PER_USD`, `public/features/shared.js:18 FX_FALLBACK = palette FX_TO_USD + CNY 0.14 (4th copy; CNY not in the palette)`, `server/juice.js FX_SOURCE (with freshness-lead-fx-source.diff; fx.js rewrites it)`, `public/viz/palette.js FX_SOURCE (with freshness-lead-fx-source.diff; fx.js rewrites it)`
- **Used in:** `public/viz/chart.js:193` (chart (approx USD axis, non-USD ranges)); `public/viz/map.js:52` (map (pay pins)); `public/app.js:383` (list, salary filter, drawer "≈ approx USD" note); `public/features/shared.js:25` (Insights, Compare companies, Compstimate (approx USD)); `scripts/build-market.js:112` (market comps doc (api/market.json fx.asOf), Same role elsewhere); `server/juice.js computeJuice() inputs.fx / usdPerUnit()` (drawer Juice block (gross USD, tax converted back), map Juice colours); `server/vet.js:54` (salary vetting gate (plausibility bounds in USD)); `data/cities.json cities[].rent*USD` (drawer Juice block rent line (USD)); `docs/LIVABILITY.md §2, §5` (methodology page); `test/fx-consistency.test.js` (tests (copies agree)); `public/app.js:383` (chart); `public/viz/chart.js:193` (chart); `public/viz/map.js:52` (map); `scripts/build-market.js:51` (Same role elsewhere); `public/features/shared.js:25` (Compstimate); `public/features/insights.js:30` (Insights); `server/juice.js:1107` (drawer Juice block); `server/juice.js:1265` (drawer Juice block); `server/vet.js:124` (API); `server/salary.js:94` (API); `scripts/build-static.js:434` (OG image); `scripts/update-col.js:113` (API); `scripts/archive/jobs.js:47` (API); `public/viz/chart.js:332` (chart); `public/viz/chart.js:982` (chart); `public/app.js:383` (badge); `public/app.js:2052` (drawer Juice block); `public/features/shared.js:56` (Compstimate); `public/features/insights.js:349` (Insights); `public/features/comps.js:206` (Compare); `scripts/build-market.js:112` (Same role elsewhere); `docs/LIVABILITY.md:894` (methodology page); `docs/LIVABILITY.md:251` (methodology page); `test/fx-consistency.test.js:11` (tests); `test/features.test.js:91` (tests); `test/features.test.js:720` (tests); `test/juice.test.js:79` (tests); `test/market.test.js:27` (tests); `server/juice.js computeJuice inputs.fx.source / asOf` (drawer Juice block); `docs/LIVABILITY.md §5 sources table (fxPerUSD row)` (methodology page)
- **Validator:** fx.js validateFx(): every currency in use present and > 0, \|move\| > 20% vs encoded = flag (not written), > 10% warns, pegs within 0.5%, period not older than encoded / not in future; update-col.js validateDoc() on cities.json (USD rents = local ÷ FX); test/fx-consistency.test.js; node --check on rewritten JS
- **Before:** Big Mac dollar_ex, refreshed into data/cities.json only by scripts/update-col.js (col-refresh.yml); the code copies (juice.js, palette.js, salary.js, shared.js) by hand, so they drifted (LIVABILITY §5)
- **Checklist:**
  - [ ] If the auto refresh flags a move > 20%: confirm against https://data.ecb.europa.eu/data/datasets/EXR before merging the PR.
- **Notes:** The first monthly run moves the table from Big Mac dollar_ex (2026-07-01) to ECB monthly averages (fixture: Sep 2026, KRW -8.6%, JPY -3.5%). Every USD-converted number on the site shifts with it; the review PR lists each move. All copies equal today (checked 2026-10-10: palette, juice, salary, cities.json fx.perUSD, 89 city fxPerUSD, 33 bigMac dollarEx). Gaps: (1) no test ties data/cities.json fx.perUSD to the code tables (fx-consistency only compares palette/juice/salary), so a col-refresh PR alone would split them; (2) EXTRA_FX_PER_USD (QAR, CNY, ZAR) has no source or as-of; (3) server/demo…

</details>

<details><summary><code>fx-usd-pegs</code>: Official US-dollar pegs used for currencies the ECB does not publish (AED, SAR, QAR)</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `manual`
- **Values:** encoded AED 3.67285, SAR 3.755 (Big Mac dollar_ex, market quotes), QAR 3.64; official pegs AED 3.6725 (CBUAE), SAR 3.75 (SAMA), QAR 3.64 (QCB)
- **As of:** 2026-10-10 · last checked -
- **Source:** [Central Bank of the UAE (AED 3.6725); Saudi Central Bank, S…](https://www.centralbank.ae/en/) (official publication)
- **Defined in:** `scripts/refresh/fx.js:39 PEGS`, `server/juice.js:48 FX_PER_USD.AED`, `server/juice.js:48 FX_PER_USD.SAR`, `server/salary.js:101 EXTRA_FX_PER_USD.QAR`, `scripts/refresh/fx.js:39 PEGS (fx.js reference values)`
- **Used in:** `scripts/refresh/fx.js buildTable()` (fx-per-usd (all approx USD figures for Dubai, Abu Dhabi, Riyadh, Doha roles)); `server/juice.js:1107` (drawer Juice block); `server/salary.js:86` (API)
- **Validator:** fx.js validateFx(): the table value must stay within 0.5% of the peg
- **Before:** none (AED/SAR came from Big Mac dollar_ex market rates; QAR 3.64 hard-coded in server/salary.js)
- **Checklist:**
  - [ ] Confirm on the three central banks' sites that each peg is unchanged (AED 3.6725, SAR 3.75, QAR 3.64).
  - [ ] If a peg changed, update PEGS in scripts/refresh/fx.js and run the fx updater.
  - [ ] Set lastChecked in data/freshness.json.
- **Notes:** Peg values confirmed via secondary sources (news coverage of the CBUAE peg) on 2026-10-10; re-read the central banks' own pages at the first yearly review. AED 3.67285 is 0.010% off the 3.6725 peg; SAR 3.755 is 0.13% off 3.75. Used by 3 cities (2 AE, 1 SA). QAR has no city; it only feeds vetting bounds.

</details>

<details><summary><code>bigmac-prices</code>: The Economist's Big Mac prices per country (USD), shown as 'Big Macs a year of juice buys' and kept in the Juice inputs</summary>

- **Type / cadence / mechanism:** fetched · semiannual (+45 days grace) · auto via `scripts/refresh/bigmac.js`
- **Values:** 33 countries, release 2026-07-01; mock uses a flat $5.69
- **As of:** 2026-07-01 · last checked 2026-10-10
- **Source:** [The Economist Big Mac index, source-data/big-mac-source-dat…](https://github.com/TheEconomist/big-mac-data) (data CC BY 4.0, code MIT)
- **Defined in:** `data/cities.json bigMac.byCountry + cities[].bigMacUSD + sources.bigMacUSD`, `data/cities.json bigMac.byCountry (33 countries: localPrice, currency, dollarEx, dollarPrice)`, `data/cities.json cities[].bigMacUSD (89) + sources.bigMacUSD`, `scripts/update-col.js:133 applyBigMac`, `scripts/update-col.js:48 BIG_MAC_CSV_URL`, `data/cities.json bigMac.byCountry (33 countries, release 2026-07-01) [core]`
- **Used in:** `server/juice.js computeJuice() bigMacs, inputs.bigMac` (Juice result (API/json); not printed in the drawer today); `public/mock-api.js:50` (mock data (hard-coded $5.69)); `docs/LIVABILITY.md §1 (bigMacs field), §4 sources` (methodology page); `server/juice.js:1277` (drawer Juice block); `server/juice.js:1266` (drawer Juice block); `docs/LIVABILITY.md:44` (methodology page); `docs/LIVABILITY.md:735` (methodology page); `docs/LIVABILITY.md:698` (methodology page); `public/mock-api.js:50` (API)
- **Validator:** bigmac.js validateBigMac(): >= 20 countries, dollar price 1-12 USD, \|move\| > 40% between releases = flag, release not older than encoded / not in future; test/juice.test.js (cities[].bigMacUSD = bigMac.byCountry dollarPrice)
- **Before:** col-refresh.yml monthly via scripts/update-col.js (with FX)
- **Checklist:**
  - [ ] If the release has fewer than 20 countries the refresh refuses (applyBigMac minCountries); check the upstream repo.
- **Notes:** Releases are January and July. The mock API hard-codes a $5.69 Big Mac (demo-data). The Economist publishes about twice a year (January and July), so a monthly check is mostly "ok". bigMacs = round(net / bigMacUSD) per job. bigMacs is computed by computeJuice but not displayed anywhere in public/app.js (grep: no bigMacs in the drawer). The Economist publishes twice a year (Jan/Jul), so "monthly" is the check cadence, not the change cadence.

</details>

<details><summary><code>juice-score-anchors</code>: Juice Score curve (score = 100·(1−e^(−net/K)), K = $80,000; fullGlassUSD $423,866) as mirrored in the browser and state…</summary>

- **Type / cadence / mechanism:** product-policy · yearly (+60 days grace) · manual via `scripts/refresh/policy.js`
- **Values:** K = 80000, fullGlassUSD = 423866; legend points 25=$23,015, 45=$47,827, 70=$96,318, 80=$128,755, 90=$184,207, 95=$239,659, 99=$368,414, 100=$423,866 (all re-verified against server/juice.js netForScore 2026-10-10)
- **As of:** 2026-10-02 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/juice.js:139 K_USD`, `server/juice.js:140 SCORE_ANCHORS`, `public/viz/palette.js:249 JUICE_ANCHORS (copy)`, `public/viz/palette.js:249 JUICE_ANCHORS (fallback copy)`, `public/viz/palette.js:249 JUICE_ANCHORS {K: 80000, fullGlassUSD: 423866} (fallback copy of server/juice.js SCORE_ANCHORS)`, `public/viz/palette.js:268 juiceNetForScore (fallback mirror of netForScore)`
- **Used in:** `server/juice.js scoreFromNet() / netForScore()` (every Juice score: list badge, drawer, map, sort, filter); `public/viz/palette.js:256` (map Juice legend); `docs/LIVABILITY.md "Score curve and grades" + calibration table` (methodology page); `server/juice.js:156` (drawer Juice block); `server/juice.js:172` (map); `public/viz/map.js:126` (map); `docs/LIVABILITY.md:126` (methodology page); `public/viz/map.js:260` (map); `public/viz/map.js:364` (map); `public/app.js:1870` (badge); `public/app.js:2139` (drawer Juice block); `docs/LIVABILITY.md:31` (methodology page); `docs/LIVABILITY.md:126-146` (methodology page); `test/juice.test.js:116` (tests); `public/mock-api.js:47` (API); `docs/LIVABILITY.md:121` (methodology page); `docs/LIVABILITY.md:121-141` (methodology page)
- **Validator:** scripts/refresh/policy.js juice-score-anchors (copies + distribution); test/juice.test.js
- **Before:** none (hand-tuned 2026-10-02)
- **Checklist:**
  - [ ] Re-run node docs/process/scripts/livability-juice-distribution.mjs on the latest snapshots.
  - [ ] Check the 90th-percentile net still scores 85-90 and no posting rounds to 100; if not, propose a new K to the user (never auto-tuned).
  - [ ] If K changes: update SCORE_ANCHORS, palette.js JUICE_ANCHORS, LIVABILITY tables, tests.
  - [ ] Once a year (or after a big tax/rent/FX refresh): recompute the net distribution over all scored jobs; if p90 no longer scores ~85-90, propose a new K in a PR (never auto).
  - [ ] Update palette.js JUICE_ANCHORS and the calibration text in juice.js and docs/LIVABILITY.md together.
  - [ ] Re-run docs/process/scripts/livability-juice-distribution.mjs on fresh snapshots and compare the score percentiles with LIVABILITY.md "Calibration".
  - [ ] If K changes: update server/juice.js SCORE_ANCHORS, public/viz/palette.js JUICE_ANCHORS (and its stale comment "A = $10K, B = $250K"), public/mock-api.js mockJuice, LIVABILITY.md tables and test/juice.test.js pins together.
  - [ ] Monthly data check (policy.js): share of scored jobs that round to 100 (<= 1%), Rind share (<= 5%), 90th-percentile score in 80-95; copies in public/viz/palette.js JUICE_ANCHORS and docs/LIVABILITY.md (K, rounded-100 net) must equal server/juice.js SCORE_ANCHORS.
- **Notes:** 2026-10-02 snapshots: 4,034 scored, 0 at 100, 37 Rind (0.9%), p90 score 89 (net $175,198) vs the calibration table's 88 ($172,580). \| Duplicate: public/viz/palette.js JUICE_ANCHORS {K 80000, fullGlassUSD 423866}; its juiceNetForScore comment still says "A = $10K, B = $250K" (the old log curve): stale comment. The calibration numbers in the comment (4,034 jobs, $172.6K, $277K) are derived from 2026-10-02 data and go stale with every snapshot (juice-calibration-doc). Duplicate copies: server/juice.js SCORE_ANCHORS (owner), palette.js JUICE_ANCHORS (unguarded), mock-api.js (old formula). Stale …

</details>

<details><summary><code>juice-grades</code>: Juice grade cut-offs (Dry < 45 ≤ Ripe < 70 ≤ Juicy; Rind when net ≤ 0) as duplicated in UI code and copy.</summary>

- **Type / cadence / mechanism:** product-policy · yearly (+60 days grace) · manual via `scripts/refresh/policy.js`
- **Values:** breaks 45 / 70; labels Dry, Ripe, Juicy, Rind
- **As of:** 2026-10-02 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/juice.js:147 GRADES`, `server/juice.js:152 RIND`, `public/viz/palette.js:244 JUICE_BREAKS (copy)`, `public/app.js:1910 JUICE_GRADES (UI copy "70+", "45–69", "under 45")`, `public/viz/palette.js:244 JUICE_BREAKS [45, 70] (copy)`, `public/viz/palette.js:244 JUICE_BREAKS [45, 70]`, `public/app.js:1910 JUICE_GRADES chip tooltips "(score 70+)", "(45–69)", "(under 45)" (hard-coded copy)`, `public/app.js:433 gradeKey: Rind is filtered as Dry`
- **Used in:** `public/app.js:1329` (Juice grade filter chips); `public/app.js:364` (list badge, sort); `public/viz/map.js:24` (map Juice colours); `docs/LIVABILITY.md grade table` (methodology page); `server/juice.js:162` (badge); `public/viz/map.js:137` (map); `public/app.js:2139` (drawer Juice block); `public/app.js:363` (badge); `public/viz/map.js:268` (map); `public/viz/palette.js:246` (map); `public/app.js:1329` (badge); `public/app.js:1346` (badge); `docs/LIVABILITY.md:137` (methodology page); `test/juice.test.js:131` (tests); `public/mock-api.js:48` (API); `docs/LIVABILITY.md:132` (methodology page)
- **Validator:** scripts/refresh/policy.js juice-grades; test/juice.test.js
- **Before:** none
- **Checklist:**
  - [ ] Review the grade mix on the latest snapshots (LIVABILITY calibration).
  - [ ] Any change: server/juice.js GRADES, palette.js JUICE_BREAKS, app.js JUICE_GRADES copy, LIVABILITY tables, tests, together.
  - [ ] Review with juice-score-anchors; keep palette.js JUICE_BREAKS equal to GRADES mins.
  - [ ] Review together with juice-score-anchors; change server/juice.js GRADES, palette.js JUICE_BREAKS, app.js JUICE_GRADES copy, mock-api.js and LIVABILITY.md in one commit.
  - [ ] Monthly data check (policy.js): no grade holds more than 60% of scored jobs; palette.js JUICE_BREAKS, app.js JUICE_GRADES tooltips and the LIVABILITY grade table ($ net per grade from netForScore) match GRADES.
- **Notes:** 2026-10-02 mix: Juicy 46.1%, Ripe 39%, Dry 14%, Rind 0.9%. \| Duplicated in public/viz/palette.js JUICE_BREAKS and map.js comments.

</details>

<details><summary><code>juice-confidence-rules</code>: Confidence rules and the resulting counts quoted in docs (US 30 medium / 10 low; 49 non-US low).</summary>

- **Type / cadence / mechanism:** product-policy · yearly (+60 days grace) · manual via `scripts/refresh/policy.js`
- **Values:** US medium 30, US low 10, non-US low 49 (re-computed 2026-10-10: matches)
- **As of:** 2026-10-10 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/juice.js:1163 SOURCE_CLASSES`, `server/juice.js:1165 CLASS_CONFIDENCE`, `server/juice.js:1196 confidenceFor`, `scripts/update-col.js:46 SOURCE_CLASSES (copy)`, `server/juice.js:1168 sourceClass (numbeo.com -> aggregator)`, `server/juice.js:1181 taxConfidence`, `server/juice.js confidenceFor / SOURCE_CLASSES [core]`
- **Used in:** `server/juice.js computeJuice() confidence` (Juice result (estimated "≈" marker in the drawer and badge)); `docs/LIVABILITY.md "Guardrails"` (methodology page); `server/juice.js:1279` (drawer Juice block); `docs/LIVABILITY.md:103` (methodology page); `docs/LIVABILITY.md:115` (methodology page); `public/app.js:1873` (badge); `test/juice.test.js:295` (tests); `server/juice.js:1275` (drawer Juice block); `docs/LIVABILITY.md:98` (methodology page); `docs/LIVABILITY.md:110` (methodology page)
- **Validator:** scripts/refresh/policy.js juice-confidence-rules; test/juice.test.js
- **Before:** none
- **Checklist:**
  - [ ] Re-read the rule against the current data sources (e.g. after the D6 Numbeo decision).
  - [ ] Keep scripts/update-col.js SOURCE_CLASSES equal to server/juice.js.
  - [ ] Review when a source class changes (e.g. Numbeo replaced by official data); keep update-col.js SOURCE_CLASSES equal.
  - [ ] After any cities.json source-class change, recompute the counts (computeJuice(150000, city).confidence over all cities) and update LIVABILITY.md §1 Guardrails.
  - [ ] Monthly data check (policy.js): scripts/update-col.js SOURCE_CLASSES equals server/juice.js; every cities.json source class is known; computeJuice(150000, city).confidence counts match docs/LIVABILITY.md "Guardrails" (US medium 30 / low 10, non-US low 49).
- **Notes:** Counts re-computed 2026-10-10: match the doc. Scored jobs by confidence: medium 2,344, low 1,690. \| Effectively data-driven: every TAX_SOURCES verified flag and every cities.json source class changes the displayed confidence. Tax "verified" flags age: a 2025 rule stays "verified" after the 2026 schedule is out.

</details>

<details><summary><code>households</code>: Household presets for the Juice Score (Just me = 1 bed, Couple = 2 bed, Family = 2 adults + 2 children, 3 bed) as label…</summary>

- **Type / cadence / mechanism:** product-policy · ad-hoc (+60 days grace) · manual via `manual`
- **Values:** single 1 bedroom / couple 2 / family 3; "two adults and two children"
- **As of:** 2026-10-10 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/juice.js:106 HOUSEHOLDS`, `public/app.js:3012 HOUSEHOLDS (UI labels)`, `server/juice.js:112 DEFAULT_HOUSEHOLD`, `public/app.js:3012 HOUSEHOLDS (UI copy: labels, tooltips, bedrooms)`, `public/app.js:3012 HOUSEHOLDS labels/bedrooms/people (UI copy of server/juice.js HOUSEHOLDS)`
- **Used in:** `public/app.js:2125` (drawer Juice block household switch); `docs/LIVABILITY.md §1 Households` (methodology page); `server/juice.js:112` (drawer Juice block); `public/app.js:2172` (drawer Juice block); `public/app.js:2152` (drawer Juice block); `public/app.js:2163` (drawer Juice block); `docs/LIVABILITY.md:51-103` (methodology page); `test/juice-household.test.js:28` (tests)
- **Validator:** test/juice-household.test.js (server presets); test/freshness-policy.test.js (public/app.js HOUSEHOLDS bedrooms and people equal server/juice.js HOUSEHOLDS)
- **Before:** none
- **Checklist:**
  - [ ] Change only with a product decision; keep app.js labels and juice.js presets equal.
  - [ ] Keep public/app.js HOUSEHOLDS bedrooms/people in step with server/juice.js HOUSEHOLDS.
  - [ ] If server/juice.js HOUSEHOLDS changes, update public/app.js HOUSEHOLDS (bedrooms, people text) and LIVABILITY.md §1.
- **Notes:** Duplicated in public/app.js (no test ties the UI copy to juice.js).

</details>

<details><summary><code>cities-dataset</code>: data/cities.json as a whole: schema, the 89 cities and their tax jurisdictions, aliases/nearby, licence and data-status…</summary>

- **Type / cadence / mechanism:** static-data · monthly (+14 days grace) · manual via `composite: scripts/refresh/fx.js, bigmac.js, rents.js, living.js write its parts; run.js validates every staged copy with update-col.js validateDoc`
- **Values:** version 1, updated 2026-10-02; 89 cities in 33 countries (US 40, GB 5, IN 4, CA 4, ...); 61 distinct tax jurisdictions; dataStatus numbeo "UNDER REVIEW"
- **As of:** 2026-10-02 · last checked -
- **Source:** [composite: see rents-*, cost-index, nyc-basket, bigmac-pric…](https://alvations.github.io/melon-seek/api/cities.json) (Numbeo figures (class aggregator/estimate, terms numbeo-terms) are NOT cleared for redistribution under the Numbeo term…)
- **Defined in:** `data/cities.json cities[] (key, name, city, region, country, currency, aliases, nearby, tax)`, `data/cities.json name/description/version/updated/license/sourceNotes/dataStatus`, `data/cities.json cities[] key, name, city, region, country, currency, aliases, nearby, tax{country, region, local}`, `scripts/update-col.js:226 validateDoc`
- **Used in:** `server/juice.js findCity() / matchCity()` (which job locations get Juice); `docs/LIVABILITY.md §4 ("89 cities")` (methodology page); `README.md` (README); `server/index.js:822` (API); `public/api.js:658` (API); `scripts/build-static.js:722` (API); `README.md:175` (README); `docs/LIVABILITY.md:11` (methodology page)
- **Validator:** scripts/update-col.js validateDoc; test/juice.test.js (every city scores, fx consistent, sources dated)
- **Before:** col-refresh.yml monthly (Big Mac + FX only); everything else manual
- **Checklist:**
  - [ ] When boards add hubs without Juice (scripts/refresh/jobs.js reports the top unmatched locations), add the city with sourced rents and cost index.
  - [ ] Update the "89 cities" counts (docs-counts).
  - [ ] Adding a city: every numeric field needs a dated, classed source; a tax jurisdiction must exist in RULES (taxFor throws otherwise).
- **Notes:** "updated" is set by update-col.js to the run date, not the data as-of. City count (89) is quoted in README and LIVABILITY.md (readme-counts, docs-counts). Format still changing (Juice household agent).

</details>

<details><summary><code>job-postings</code>: Per-company posting counts as the UI shows them (topbar count, stats line, Insights header, filters' facet counts, badg…</summary>

- **Type / cadence / mechanism:** fetched · daily (+2 days grace) · detect via `pipeline: scripts/snapshot.js via snapshot.yml + pages.yml (daily); monthly check scripts/refresh/jobs.js`
- **Values:** stable snapshots 2026-10-02T05:54Z: anduril 2,418, anthropic 638, openai 833, shieldai 581, palantir 320, xai 297, scaleai 194, cohere 132 (total 5,413)
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [Company job boards (Greenhouse, Ashby, Lever; big-tech care…](https://alvations.github.io/melon-seek/) (public job postings; facts only, links to the original postings)
- **Defined in:** `data/snapshots/<slug>.json (artifact job-board-snapshots)`, `server/sources/*.js adapters`, `server/companies.js COMPANIES`, `server/normalize.js:209 normalizeJob`, `server/normalize.js:28 NORMALIZER_VERSION`, `scripts/snapshot.js:28 MAX_BETA_SNAPSHOT_BYTES (beta cap)`, `data/snapshots/<slug>.json { company, mode, fetchedAt, error, normalizerVersion, jobs[], jobsCapped? } (gitignored)`, `data/cache/store/*.list.json + *.desc.ndjson (melon-store-1, gitignored)`, `server/cache.js:17 FRESH_TTL_MS (30 min live cache)`, `data/snapshots/<slug>.json (daily, artifact) [jobs]`, `data/snapshots/<slug>.json (gitignored; artifact job-board-snapshots)`, `data/beta/snapshots/<slug>.json (artifact job-board-snapshots-beta)`
- **Used in:** `public/app.js` (list, chart, map, drawer, every count); `scripts/build-static.js` (dist/api/jobs/*.json, share pages); `README.md / docs counts` (README, docs); `server/index.js:297` (API); `scripts/build-static.js:913` (API); `public/api.js:174` (API); `public/app.js:383` (chart); `server/export.js:40` (API); `scripts/archive/jobs.js:?` (API); `public/app.js:691` (badge); `public/app.js:1537` (badge); `public/app.js:747` (badge); `public/app.js:770` (badge); `public/features/insights.js:349` (Insights); `public/viz/chart.js:325` (chart); `scripts/refresh/jobs.js companyStats` (API); `public/api.js:167` (API); `scripts/archive/jobs.js:26` (API)
- **Validator:** scripts/refresh/jobs.js job-postings (snapshot age <= 3 days, count drop < 50% month over month, mode not demo); the vetting gate and build checks daily
- **Before:** daily job-board pipeline (snapshot.yml, pages.yml); no age or drop check
- **Checklist:**
  - [ ] If stale: check the latest snapshot.yml / pages.yml runs and the vetting gate.
  - [ ] Monthly (jobs.js job-postings): every board has a snapshot no older than 3 days, a non-zero job count, and did not lose more than half its postings since last month.
  - [ ] If flagged: open the latest snapshot.yml / pages.yml runs; a failed board keeps its last good snapshot, so an old fetchedAt means the board has been failing.
- **Notes:** Monthly aggregate per company archived as jobs-aggregates. sourceAsOf = newest snapshot fetchedAt. \| Versioned forever by the archive agent (docs/DATA_ARCHIVE.md), not by the monthly refresh. DATA LOSS RISK: job snapshots older than 14 days exist nowhere (artifact retention 14; data/snapshots gitignored) until the archive (scripts/archive/jobs.js) records versions. Local snapshots predate normalizerVersion (server re-derives them). Beta boards over 40 MB are trimmed or capped (jobsCapped), which changes per-company counts.

</details>

<details><summary><code>job-salary-usd</code>: Per-job annual pay converted to approx USD (client side, palette FX) and every statistic derived from it in the UI.</summary>

- **Type / cadence / mechanism:** derived-at-build · daily (+2 days grace) · detect via `pipeline: converted at build and in the browser with public/viz/palette.js FX; monthly check scripts/refresh/jobs.js`
- **Values:** USD min/mid/max per salaried job at palette.js FX (FX_AS_OF 2026-07-01); currencies without a palette rate are excluded from comps (build-market.js usdMid / hasFx)
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [derived: posted pay x public/viz/palette.js FX_PER_USD (reg…](https://alvations.github.io/melon-seek/) (derived)
- **Defined in:** `public/app.js:472 _usd`, `public/features/shared.js:25 toUSD`, `public/viz/palette.js:1 palette toUSD (chart/map/comps)`, `public/features/shared.js:1 shared toUSD (Compstimate/Insights: palette then FX_FALLBACK)`, `server/salary.js:1 salary.js toUSD (vetting, share pages via vet.js)`, `server/juice.js:6 juice.js toUSD (Juice)`, `scripts/build-market.js:65 usdMid (market comps; drops currencies without palette FX)`, `public/app.js:383`, `public/features/shared.js:45 salaryUSD (also annualizes)`
- **Used in:** `public/viz/chart.js` (chart); `public/viz/map.js` (map); `public/features/insights.js` (Insights); `scripts/build-market.js` (market comps); `public/features/compstimate.js` (Compstimate); `public/app.js:383` (chart); `public/viz/map.js:52` (map); `public/features/insights.js:30` (Insights); `scripts/build-market.js:79` (Same role elsewhere); `scripts/build-static.js:434` (OG image); `server/juice.js:1411` (drawer Juice block); `public/app.js:495-510` (badge); `public/app.js:2008-2013` (drawer Juice block); `public/app.js:2024` (drawer Juice block); `public/viz/chart.js:101` (chart); `public/viz/chart.js:442` (chart); `public/viz/map.js:47` (map); `server/juice.js:1407` (drawer Juice block)
- **Validator:** scripts/refresh/jobs.js job-salary-usd (currencies without FX = 0); test/fx-consistency.test.js; test/features.test.js (salaryUSD)
- **Before:** computed per build / page load; no check that every currency has a rate
- **Checklist:**
  - [ ] None: re-derived on every build and page load from fx-per-usd.
  - [ ] Monthly (jobs.js job-salary-usd): no salaried currency may lack an FX rate (those postings drop out of market comps and Compstimate); the FX as-of comes from fx-per-usd.
- **Notes:** Changes whenever fx-per-usd changes; the archive keeps the FX rate and as-of used per job version. Four code paths convert to USD with tables that are equal today; after an FX refresh every USD job number, comps cell, Compstimate estimate, share-page median and Juice score changes. Demo data converts with its own FX (demo-data). Currencies outside FX_PER_USD (e.g. CNY, ZAR, QAR) are bounded by vetting but excluded from market comps (hasFx). Changes whenever fx-per-usd changes: a monthly FX refresh moves every non-USD job's USD figure, slider, percentile, Insights, Compare and Compstimate resu…

</details>

<details><summary><code>tax-us</code>: Tax rules for US: IRS Rev. Proc. 2025-32 (2026 brackets, standard deduction $16,100 / $32,200, child tax credit $2,200)…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+45 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** 7 brackets 10%..37% (single top threshold $640,600), standard deduction $16,100 single / $32,200 joint, Social Security 6.2% to $184,500, Medicare 1.45% + 0.9% over $200,000 single (tax year 2026)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [IRS Rev. Proc. 2025-32 (2026 brackets, standard deduction $…](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) (US federal government work (public domain))
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US']`, `server/juice.js RULES.US`, `server/juice.js:499 usTax`, `server/juice.js:229 US_SS_BASE_2026`, `server/juice.js:230 US_ADDL_MEDICARE`, `server/juice.js:228 US_STD_2026`, `server/juice.js:238 usFederalIncomeTax`, `server/juice.js:234 usSaltCap`, `server/juice.js:224 US_FED_2026`, `server/juice.js:232 US_CTC_PHASE`, `server/juice.js:231 US_CTC_2026`, `server/juice.js TAX_SOURCES['US'] + its RULES entry [tax agent]`, `server/juice.js:496 fn:usTax`, `server/juice.js TAX_HOUSEHOLD['US']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:572` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `docs/LIVABILITY.md:177` (methodology page); `docs/LIVABILITY.md:192` (methodology page); `test/juice.test.js:45` (tests); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 14 figure(s) compared with the official page, plu…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.irs.gov/pub/irs-drop/rp-25-32.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:888: asOf '2026', reviewed 2026-10-10, verified true, 5 supporting page(s). Not modeled: refundable part of the child tax credit; itemized deductions other than state and local income taxes; alternative minimum tax. Cities using it: 40 (san-francisco-ca-us, new-york-ny-us, seattle-wa-us, boston-ma-us, austin-tx-us, washington-dc-us, los-angeles-ca-us, chicago-il-us, denver-co-us, atlanta-ga-us, ...). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at …

</details>

<details><summary><code>tax-us-ca</code>: Tax rules for US-CA: California FTB 2025 tax rate schedules X / Y (latest published; EDD 2026 withholding uses the same…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** Schedule X 1%..12.3% (top threshold $742,953), +1% over $1M (Behavioral Health Services Tax), standard deduction $5,706, exemption credit $153; SDI 1.3% (2026)
- **As of:** 2025-01-01 · tax year 2025 (brackets) / 2026 (SDI) · last checked 2026-10-10
- **Source:** [California FTB 2025 tax rate schedules X / Y (latest publis…](https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf) (State of California public information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-CA']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.CA`, `server/juice.js:255 CA_Y_2025`, `server/juice.js:254 CA_X_2025`, `server/juice.js TAX_SOURCES['US-CA'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-CA']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:573` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `docs/LIVABILITY.md:177` (methodology page); `docs/LIVABILITY.md:192` (methodology page); `test/juice.test.js:45` (tests); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 4 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-CA).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-CA'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-CA']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:889: asOf '2025 (brackets) / 2026 (SDI)', reviewed 2026-10-10, verified false, 3 supporting page(s). Unverified: personal exemption credit amount $153 (printed on Form 540, not in the booklet text). Not modeled: dependent exemption credit (amount not verified); alternative minimum tax. Cities using it: 10 (san-francisco-ca-us, los-angeles-ca-us, costa-mesa-ca-us, san-diego-ca-us, palo-alto-ca-us, san-jose-ca-us, sunnyvale-ca-us, mountain-view-ca-us, menlo-park-ca-us, irvine-ca-us). Encoded tax year 2025 (asOf '2025 (bracke…

</details>

<details><summary><code>tax-us-ny</code>: Tax rules for US-NY: New York State 2026 (IT-2105-I): rates, tax-benefit recapture worksheets, standard deduction $8,00…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** New York State 2026 (IT-2105-I): rates, tax-benefit recapture worksheets, standard deduction $8,000 / $16,050, $1,000 per dependent; Paid Family Leave 0.432% to $411.91; disability benefits $0.60 a week
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [New York State 2026 (IT-2105-I): rates, tax-benefit recaptu…](https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf) (New York State public information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-NY']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.NY`, `server/juice.js:271 nysTax`, `server/juice.js:257 NYS_2026`, `server/juice.js:264 NYS_RECAPTURE_2026`, `server/juice.js:268 nyPhase`, `server/juice.js TAX_SOURCES['US-NY'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-NY']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:574` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `docs/LIVABILITY.md:178` (methodology page); `test/juice.test.js:68` (tests); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 3 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-NY).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-NY'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-NY']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:890: asOf '2026', reviewed 2026-10-10, verified false, 1 supporting page(s). Unverified: Paid Family Leave 0.432% / $411.91 (secondary source; DFS page blocked); disability benefits 0.5% up to $0.60 a week. Not modeled: Empire State child credit. Cities using it: 1 (new-york-ny-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never …

</details>

<details><summary><code>tax-us-wa</code>: Tax rules for US-WA: No income tax on wages; WA Cares 0.58% of all wages; Paid Family and Medical Leave 1.13% (employee…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** No income tax on wages; WA Cares 0.58% of all wages; Paid Family and Medical Leave 1.13% (employee 71.43%)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [No income tax on wages; WA Cares 0.58% of all wages; Paid F…](https://wacaresfund.wa.gov/employers/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-WA']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.WA`, `server/juice.js:229 US_SS_BASE_2026`, `server/juice.js TAX_SOURCES['US-WA'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-WA']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:575` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Check whether anything changed for the NEW tax year: the sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-WA); start from https://wacaresfund.wa.gov/employers/. Confirm there is still no wage income tax and re-read the premium / levy rates and caps.
  - [ ] If anything changed: update the constants in server/juice.js and TAX_SOURCES['US-WA'] (name, url, asOf = the new tax year, reviewed, verified: true only after reading the official source), the golden vectors in test/juice*.test.js, and docs/LIVABILITY.md §3; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:891: asOf '2026', reviewed 2026-10-10, verified false, 2 supporting page(s). Unverified: PFML wage cap taken as the Social Security wage base. Cities using it: 3 (seattle-wa-us, bellevue-wa-us, redmond-wa-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: wacaresfund.wa.gov renders its rate client-sid…

</details>

<details><summary><code>tax-us-tx</code>: Tax rules for US-TX: No state income tax on wages (Texas Constitution art. 8 §24-a)</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** No state income tax on wages (Texas Constitution art. 8 §24-a)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [No state income tax on wages (Texas Constitution art. 8 §24…](https://statutes.capitol.texas.gov/Docs/CN/htm/CN.8.htm) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-TX']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.TX`, `server/juice.js TAX_SOURCES['US-TX'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-TX']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:576` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `docs/LIVABILITY.md:179` (methodology page); `test/juice.test.js:67` (tests); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Check whether anything changed for the NEW tax year: the sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-TX); start from https://statutes.capitol.texas.gov/Docs/CN/htm/CN.8.htm. Confirm there is still no wage income tax and re-read the premium / levy rates and caps.
  - [ ] If anything changed: update the constants in server/juice.js and TAX_SOURCES['US-TX'] (name, url, asOf = the new tax year, reviewed, verified: true only after reading the official source), the golden vectors in test/juice*.test.js, and docs/LIVABILITY.md §3; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:892: asOf '2026', reviewed 2026-10-10, verified false. Unverified: constitution text did not render for the probe. Cities using it: 3 (austin-tx-us, dallas-tx-us, houston-tx-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by h…

</details>

<details><summary><code>tax-us-fl</code>: Tax rules for US-FL: No state income tax on wages (Florida Constitution art. VII §5(a))</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** No state income tax on wages (Florida Constitution art. VII §5(a))
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [No state income tax on wages (Florida Constitution art. VII…](https://www.leg.state.fl.us/statutes/index.cfm?submenu=3) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-FL']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.FL`, `server/juice.js TAX_SOURCES['US-FL'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-FL']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:577` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Check whether anything changed for the NEW tax year: the sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-FL); start from https://www.leg.state.fl.us/statutes/index.cfm?submenu=3. Confirm there is still no wage income tax and re-read the premium / levy rates and caps.
  - [ ] If anything changed: update the constants in server/juice.js and TAX_SOURCES['US-FL'] (name, url, asOf = the new tax year, reviewed, verified: true only after reading the official source), the golden vectors in test/juice*.test.js, and docs/LIVABILITY.md §3; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
- **Notes:** TAX_SOURCES server/juice.js:893: asOf '2026', reviewed 2026-10-10, verified true. Cities using it: 1 (miami-fl-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source

</details>

<details><summary><code>tax-us-tn</code>: Tax rules for US-TN: No state income tax on wages (Hall tax repealed from 2021; Tennessee Constitution art. II §28)</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** No state income tax on wages (Hall tax repealed from 2021; Tennessee Constitution art. II §28)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [No state income tax on wages (Hall tax repealed from 2021; …](https://www.capitol.tn.gov/about/docs/TN-Constitution.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-TN']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.TN`, `server/juice.js TAX_SOURCES['US-TN'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-TN']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:578` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Check whether anything changed for the NEW tax year: the sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-TN); start from https://www.capitol.tn.gov/about/docs/TN-Constitution.pdf. Confirm there is still no wage income tax and re-read the premium / levy rates and caps.
  - [ ] If anything changed: update the constants in server/juice.js and TAX_SOURCES['US-TN'] (name, url, asOf = the new tax year, reviewed, verified: true only after reading the official source), the golden vectors in test/juice*.test.js, and docs/LIVABILITY.md §3; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:894: asOf '2026', reviewed 2026-10-10, verified false. Unverified: tn.gov and the constitution PDF were not readable from the probe. Cities using it: 1 (nashville-tn-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand agai…

</details>

<details><summary><code>tax-us-nv</code>: Tax rules for US-NV: No state income tax on wages (Nevada Constitution art. 10 §1(9))</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** No state income tax on wages (Nevada Constitution art. 10 §1(9))
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [No state income tax on wages (Nevada Constitution art. 10 §…](https://www.leg.state.nv.us/const/nvconst.html) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-NV']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.NV`, `server/juice.js TAX_SOURCES['US-NV'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-NV']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:579` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Check whether anything changed for the NEW tax year: the sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-NV); start from https://www.leg.state.nv.us/const/nvconst.html. Confirm there is still no wage income tax and re-read the premium / levy rates and caps.
  - [ ] If anything changed: update the constants in server/juice.js and TAX_SOURCES['US-NV'] (name, url, asOf = the new tax year, reviewed, verified: true only after reading the official source), the golden vectors in test/juice*.test.js, and docs/LIVABILITY.md §3; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
- **Notes:** TAX_SOURCES server/juice.js:895: asOf '2026', reviewed 2026-10-10, verified true. Cities using it: 0 (no city in data/cities.json uses this rule today). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source

</details>

<details><summary><code>tax-us-ma</code>: Tax rules for US-MA: Massachusetts Form 1 (2025): 5% after the personal exemption $4,400 / $8,800, $1,000 per dependent…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** Massachusetts Form 1 (2025): 5% after the personal exemption $4,400 / $8,800, $1,000 per dependent and up to $2,000 of FICA; 4% surtax over $1,107,750 (2026 Form 1-ES); PFML employee 0.46% to the Social Security wage base
- **As of:** 2025-01-01 · tax year 2025 / 2026 (surtax) · last checked 2026-10-10
- **Source:** [Massachusetts Form 1 (2025): 5% after the personal exemptio…](https://www.mass.gov/doc/2025-form-1-instructions/download) (Commonwealth of Massachusetts public information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-MA']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.MA`, `server/juice.js:229 US_SS_BASE_2026`, `server/juice.js TAX_SOURCES['US-MA'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-MA']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:580` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 3 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.mass.gov/doc/2025-form-1-instructions/download): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-MA).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-MA'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-MA']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:896: asOf '2025 / 2026 (surtax)', reviewed 2026-10-10, verified false, 1 supporting page(s). Unverified: PFML employee share 0.46% (secondary source; mass.gov rate page blocked). Cities using it: 2 (boston-ma-us, cambridge-ma-us). Encoded tax year 2025 (asOf '2025 / 2026 (surtax)') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the w…

</details>

<details><summary><code>tax-us-ga</code>: Tax rules for US-GA: Georgia HB 463: 4.99% for 2026, standard deduction $15,000 / $30,000, $5,000 per dependent</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Georgia HB 463: 4.99% for 2026, standard deduction $15,000 / $30,000, $5,000 per dependent
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Georgia HB 463: 4.99% for 2026, standard deduction $15,000 …](https://www.legis.ga.gov/api/legislation/document/20252026/249080) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-GA']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.GA`, `server/juice.js TAX_SOURCES['US-GA'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-GA']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:581` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.legis.ga.gov/api/legislation/document/20252026/249080): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-GA).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-GA'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-GA']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:897: asOf '2026', reviewed 2026-10-10, verified true. Cities using it: 1 (atlanta-ga-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source

</details>

<details><summary><code>tax-us-dc</code>: Tax rules for US-DC: District of Columbia 4%-10.75% (tax years after 2021, all filing statuses); standard deduction $15…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** District of Columbia 4%-10.75% (tax years after 2021, all filing statuses); standard deduction $15,000 / $30,000
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [District of Columbia 4%-10.75% (tax years after 2021, all f…](https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates) (District of Columbia public information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-DC']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.DC`, `server/juice.js TAX_SOURCES['US-DC'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-DC']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:582` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 2 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-DC).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-DC'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-DC']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:898: asOf '2025', reviewed 2026-10-10, verified false. Unverified: standard deduction $15,000 / $30,000 (secondary source). Cities using it: 1 (washington-dc-us). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The U…

</details>

<details><summary><code>tax-us-al</code>: Tax rules for US-AL: Alabama Form 40 (2025): 2% / 4% / 5%, federal income tax deduction, standard deduction chart ($2,5…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Alabama Form 40 (2025): 2% / 4% / 5%, federal income tax deduction, standard deduction chart ($2,500 / $5,000 from $35,500 AGI), personal exemption $1,500 / $3,000, dependents $1,000 / $500 / $300 (Huntsville: no occupational tax)
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [Alabama Form 40 (2025): 2% / 4% / 5%, federal income tax de…](https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40bk.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-AL']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.AL`, `server/juice.js:308 alStd`, `server/juice.js:306 AL_2025`, `server/juice.js TAX_SOURCES['US-AL'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-AL']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:583` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25f40bk.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-AL).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-AL'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-AL']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:899: asOf '2025', reviewed 2026-10-10, verified false. Unverified: rate brackets ($500 / $3,000 single, $1,000 / $6,000 joint) not re-read. Cities using it: 1 (huntsville-al-us). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Subtracts the federal income tax computed by tax-us (usTax passes fedTax). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys i…

</details>

<details><summary><code>tax-us-oh</code>: Tax rules for US-OH: Ohio ORC 5747.02(A)(3)(c): $332 + 2.75% over $26,050 (2026 on); ORC 5747.025 personal exemptions, …</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Ohio ORC 5747.02(A)(3)(c): $332 + 2.75% over $26,050 (2026 on); ORC 5747.025 personal exemptions, none from $500,000 MAGI in 2026
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Ohio ORC 5747.02(A)(3)(c): $332 + 2.75% over $26,050 (2026 …](https://codes.ohio.gov/ohio-revised-code/section-5747.02) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-OH']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.OH`, `server/juice.js TAX_SOURCES['US-OH'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-OH']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:584` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:65` (tests); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://codes.ohio.gov/ohio-revised-code/section-5747.02): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-OH).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-OH'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-OH']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:900: asOf '2026', reviewed 2026-10-10, verified false, 2 supporting page(s). Unverified: 2026 indexed exemption amounts (2025 values $2,400 / $2,150 / $1,900 used). Cities using it: 1 (columbus-oh-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table …

</details>

<details><summary><code>tax-us-va</code>: Tax rules for US-VA: Virginia Form 760 (2025): 2%-5.75%, standard deduction $8,750 / $17,500 (2025 and 2026), $930 per …</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Virginia Form 760 (2025): 2%-5.75%, standard deduction $8,750 / $17,500 (2025 and 2026), $930 per exemption
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Virginia Form 760 (2025): 2%-5.75%, standard deduction $8,7…](https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-VA']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.VA`, `server/juice.js TAX_SOURCES['US-VA'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-VA']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:585` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-VA).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-VA'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-VA']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:901: asOf '2026', reviewed 2026-10-10, verified true. Cities using it: 2 (reston-va-us, arlington-va-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source

</details>

<details><summary><code>tax-us-il</code>: Tax rules for US-IL: Illinois 4.95%, exemption $2,925 per person for 2026 (IL-700-T), none above $250,000 / $500,000 AGI</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Illinois 4.95%, exemption $2,925 per person for 2026 (IL-700-T), none above $250,000 / $500,000 AGI
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Illinois 4.95%, exemption $2,925 per person for 2026 (IL-70…](https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/currentyear/il-700-t.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-IL']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.IL`, `server/juice.js TAX_SOURCES['US-IL'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-IL']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:586` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/currentyear/il-700-t.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-IL).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-IL'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-IL']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:902: asOf '2026', reviewed 2026-10-10, verified true, 1 supporting page(s). Cities using it: 1 (chicago-il-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source

</details>

<details><summary><code>tax-us-co</code>: Tax rules for US-CO: Colorado 4.4% of federal taxable income (2025 rate); state income tax addback (an itemizer keeps t…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Colorado 4.4% of federal taxable income (2025 rate); state income tax addback (an itemizer keeps the standard deduction); deduction capped at $1,000 / $2,000 above $300,000 AGI from 2026
- **As of:** 2025-01-01 · tax year 2025 (rate) / 2026 (addback) · last checked 2026-10-10
- **Source:** [Colorado 4.4% of federal taxable income (2025 rate); state …](https://tax.colorado.gov/individual-income-tax-guide) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-CO']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.CO`, `server/juice.js:228 US_STD_2026`, `server/juice.js TAX_SOURCES['US-CO'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-CO']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:587` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://tax.colorado.gov/individual-income-tax-guide): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-CO).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-CO'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-CO']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:903: asOf '2025 (rate) / 2026 (addback)', reviewed 2026-10-10, verified true, 2 supporting page(s). Not modeled: FAMLI paid-leave premium (0.45% employee, page blocked); Denver occupational privilege tax. Cities using it: 3 (denver-co-us, colorado-springs-co-us, boulder-co-us). Encoded tax year 2025 (asOf '2025 (rate) / 2026 (addback)') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Builds on the federal taxable income/deduction (tax-us): a tax-us refresh changes it. Line numbers are as of the 2026-10-10 working tree; t…

</details>

<details><summary><code>tax-us-pa</code>: Tax rules for US-PA: Pennsylvania 3.07% of compensation; unemployment compensation employee withholding 0.07%</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Pennsylvania 3.07% of compensation; unemployment compensation employee withholding 0.07%
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Pennsylvania 3.07% of compensation; unemployment compensati…](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-PA']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.PA`, `server/juice.js TAX_SOURCES['US-PA'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-PA']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:588` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Check whether anything changed for the NEW tax year: the sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-PA); start from https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax. Confirm there is still no wage income tax and re-read the premium / levy rates and caps.
  - [ ] If anything changed: update the constants in server/juice.js and TAX_SOURCES['US-PA'] (name, url, asOf = the new tax year, reviewed, verified: true only after reading the official source), the golden vectors in test/juice*.test.js, and docs/LIVABILITY.md §3; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:904: asOf '2026', reviewed 2026-10-10, verified false. Unverified: UC employee rate 0.07%. Cities using it: 2 (philadelphia-pa-us, pittsburgh-pa-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official sour…

</details>

<details><summary><code>tax-us-nc</code>: Tax rules for US-NC: North Carolina 3.99% (2026), standard deduction $12,750 / $25,500, child deduction table (D-401)</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** North Carolina 3.99% (2026), standard deduction $12,750 / $25,500, child deduction table (D-401)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [North Carolina 3.99% (2026), standard deduction $12,750 / $…](https://www.ncdor.gov/taxes-forms/individual-income-tax) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-NC']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.NC`, `server/juice.js:322 ncChildDeduction`, `server/juice.js TAX_SOURCES['US-NC'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-NC']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:589` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.ncdor.gov/taxes-forms/individual-income-tax): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-NC).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-NC'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-NC']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:905: asOf '2026', reviewed 2026-10-10, verified true, 1 supporting page(s). Cities using it: 1 (raleigh-nc-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source

</details>

<details><summary><code>tax-us-or</code>: Tax rules for US-OR: Oregon 2026 withholding formulas: 4.75%-9.9%, standard deduction $2,910 / $5,820, federal tax subt…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Oregon 2026 withholding formulas: 4.75%-9.9%, standard deduction $2,910 / $5,820, federal tax subtraction (max $8,750, phased out from $125,000 / $250,000), exemption credit $263; statewide transit tax 0.1%; Paid Leave Oregon 1% (employee 60%)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Oregon 2026 withholding formulas: 4.75%-9.9%, standard dedu…](https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-OR']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.OR`, `server/juice.js:298 orFederalSubtraction`, `server/juice.js:229 US_SS_BASE_2026`, `server/juice.js:294 OR_2026`, `server/juice.js TAX_SOURCES['US-OR'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-OR']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:590` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-OR).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-OR'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-OR']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:906: asOf '2026', reviewed 2026-10-10, verified false, 2 supporting page(s). Unverified: Paid Leave employee share 60% (secondary source). Cities using it: 1 (portland-or-us). Subtracts the federal income tax computed by tax-us (usTax passes fedTax). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no of…

</details>

<details><summary><code>tax-us-ut</code>: Tax rules for US-UT: Utah TC-40 (2025): 4.5% less the taxpayer tax credit (6% of the federal standard deduction + $2,11…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** Utah TC-40 (2025): 4.5% less the taxpayer tax credit (6% of the federal standard deduction + $2,111 per dependent, cut 1.3% over $18,213 / $36,426)
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [Utah TC-40 (2025): 4.5% less the taxpayer tax credit (6% of…](https://tax.utah.gov/forms/current/tc-40inst.pdf) (State of Utah public information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-UT']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.UT`, `server/juice.js:228 US_STD_2026`, `server/juice.js TAX_SOURCES['US-UT'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-UT']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:591` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 1 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://tax.utah.gov/forms/current/tc-40inst.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-UT).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-UT'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-UT']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:907: asOf '2025', reviewed 2026-10-10, verified true. Not modeled: any 2026 rate change. Cities using it: 1 (salt-lake-city-ut-us). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year.

</details>

<details><summary><code>tax-us-az</code>: Tax rules for US-AZ: Arizona Form 140 (2025): 2.5%, standard deduction $15,750 / $31,500, $100 dependent credit</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Arizona Form 140 (2025): 2.5%, standard deduction $15,750 / $31,500, $100 dependent credit
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [Arizona Form 140 (2025): 2.5%, standard deduction $15,750 /…](https://azdor.gov/sites/default/files/document/FORMS_INDIVIDUAL_2025_140i.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-AZ']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.AZ`, `server/juice.js TAX_SOURCES['US-AZ'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-AZ']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:592` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://azdor.gov/sites/default/files/document/FORMS_INDIVIDUAL_2025_140i.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-AZ).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-AZ'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-AZ']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:908: asOf '2025', reviewed 2026-10-10, verified true. Cities using it: 1 (phoenix-az-us). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Builds on the federal taxable income/deduction (tax-us): a tax-us refresh changes it. Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. ma…

</details>

<details><summary><code>tax-us-mn</code>: Tax rules for US-MN: Minnesota 2026: 5.35%-9.85%, standard deduction $15,300 / $30,600, dependent exemption $5,300; Pai…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** Minnesota 2026: 5.35%-9.85%, standard deduction $15,300 / $30,600, dependent exemption $5,300; Paid Leave 0.88% (half from the employee)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Minnesota 2026: 5.35%-9.85%, standard deduction $15,300 / $…](https://www.revenue.state.mn.us/mndor-pp/21641) (State of Minnesota public information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-MN']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.MN`, `server/juice.js:229 US_SS_BASE_2026`, `server/juice.js TAX_SOURCES['US-MN'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-MN']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:593` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 3 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.revenue.state.mn.us/mndor-pp/21641): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-MN).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-MN'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-MN']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:909: asOf '2026', reviewed 2026-10-10, verified false, 1 supporting page(s). Unverified: Paid Leave employee share 0.44%. Not modeled: standard deduction phase-out at high income. Cities using it: 1 (minneapolis-mn-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. TAX_SOURCES marks this rule unverified; TAX_…

</details>

<details><summary><code>tax-us-mi</code>: Tax rules for US-MI: Michigan 4.25%, personal exemption $5,900 per person (2026 withholding data)</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Michigan 4.25%, personal exemption $5,900 per person (2026 withholding data)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Michigan 4.25%, personal exemption $5,900 per person (2026 …](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Tax-Interest-Calculator/2026WithholdingtaxinfoJson.json) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-MI']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.MI`, `server/juice.js TAX_SOURCES['US-MI'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-MI']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:594` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Tax-Interest-Calculator/2026WithholdingtaxinfoJson.json): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-MI).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-MI'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-MI']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:910: asOf '2026', reviewed 2026-10-10, verified true. Cities using it: 1 (detroit-mi-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source

</details>

<details><summary><code>tax-us-md</code>: Tax rules for US-MD: Maryland 2025 (Budget Reconciliation and Financing Act 2025): 2%-6.5% with 6.25% / 6.5% top bracke…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Maryland 2025 (Budget Reconciliation and Financing Act 2025): 2%-6.5% with 6.25% / 6.5% top brackets, standard deduction $3,350 / $6,700
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [Maryland 2025 (Budget Reconciliation and Financing Act 2025…](https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-MD']`, `server/juice.js RULES.US`, `server/juice.js:326 US_STATE.MD`, `server/juice.js:319 mdTaxable`, `server/juice.js:315 MD_2025`, `server/juice.js TAX_SOURCES['US-MD'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-MD']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:595` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-MD).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-MD'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-MD']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:911: asOf '2025', reviewed 2026-10-10, verified false. Unverified: brackets below $500,000 / $600,000 (assumed unchanged). Not modeled: personal exemptions ($3,200 phased out above $100,000, not verified). Cities using it: 1 (baltimore-md-us). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the work…

</details>

<details><summary><code>tax-us-local-nyc</code>: Tax rules for US-LOCAL-NYC: New York City resident tax 3.078%-3.876% on NYS taxable income, NYC school tax credit (IT-2…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** New York City resident tax 3.078%-3.876% on NYS taxable income, NYC school tax credit (IT-2105-I 2026)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [New York City resident tax 3.078%-3.876% on NYS taxable inc…](https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf) (New York State public information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-LOCAL-NYC']`, `server/juice.js RULES.US`, `server/juice.js:469 US_LOCAL.NYC`, `server/juice.js:286 NYC_2026`, `server/juice.js TAX_SOURCES['US-LOCAL-NYC'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-LOCAL-NYC']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:596` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `docs/LIVABILITY.md:178` (methodology page); `test/juice.test.js:65` (tests); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 2 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-LOCAL-NYC).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-LOCAL-NYC'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-LOCAL-NYC']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:912: asOf '2026', reviewed 2026-10-10, verified true. Cities using it: 1 (new-york-ny-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year.

</details>

<details><summary><code>tax-us-local-columbus</code>: Tax rules for US-LOCAL-COLUMBUS: Columbus, OH city income tax 2.5% (IR-25 instructions)</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Columbus, OH city income tax 2.5% (IR-25 instructions)
- **As of:** 2024-01-01 · tax year 2024 · last checked 2026-10-10
- **Source:** [Columbus, OH city income tax 2.5% (IR-25 instructions)](https://www.columbus.gov/files/sharedassets/city/v/4/city-auditor/tax-forms/individuals/2024-ir-25-instructions.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-LOCAL-COLUMBUS']`, `server/juice.js RULES.US`, `server/juice.js:469 US_LOCAL.COLUMBUS`, `server/juice.js TAX_SOURCES['US-LOCAL-COLUMBUS'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-LOCAL-COLUMBUS']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:597` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:65` (tests); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Check whether anything changed for the NEW tax year: the sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-LOCAL-COLUMBUS); start from https://www.columbus.gov/files/sharedassets/city/v/4/city-auditor/tax-forms/individuals/2024-ir-25-instructions.pdf. Confirm there is still no wage income tax and re-read the premium / levy rates and caps.
  - [ ] If anything changed: update the constants in server/juice.js and TAX_SOURCES['US-LOCAL-COLUMBUS'] (name, url, asOf = the new tax year, reviewed, verified: true only after reading the official source), the golden vectors in test/juice*.test.js, and docs/LIVABILITY.md §3; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
- **Notes:** TAX_SOURCES server/juice.js:913: asOf '2024', reviewed 2026-10-10, verified true. Cities using it: 1 (columbus-oh-us). Encoded tax year 2024 (asOf '2024') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by han…

</details>

<details><summary><code>tax-us-local-philadelphia</code>: Tax rules for US-LOCAL-PHILADELPHIA: Philadelphia resident wage tax 3.74% to 30 June 2026, 3.735% from 1 July 2026 (cal…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Philadelphia resident wage tax 3.74% to 30 June 2026, 3.735% from 1 July 2026 (calendar-year average)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Philadelphia resident wage tax 3.74% to 30 June 2026, 3.735…](https://www.phila.gov/services/payments-assistance-taxes/business-taxes/wage-tax-employers/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-LOCAL-PHILADELPHIA']`, `server/juice.js RULES.US`, `server/juice.js:469 US_LOCAL.PHILADELPHIA`, `server/juice.js TAX_SOURCES['US-LOCAL-PHILADELPHIA'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-LOCAL-PHILADELPHIA']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:598` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Check whether anything changed for the NEW tax year: the sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-LOCAL-PHILADELPHIA); start from https://www.phila.gov/services/payments-assistance-taxes/business-taxes/wage-tax-employers/. Confirm there is still no wage income tax and re-read the premium / levy rates and caps.
  - [ ] If anything changed: update the constants in server/juice.js and TAX_SOURCES['US-LOCAL-PHILADELPHIA'] (name, url, asOf = the new tax year, reviewed, verified: true only after reading the official source), the golden vectors in test/juice*.test.js, and docs/LIVABILITY.md §3; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
- **Notes:** TAX_SOURCES server/juice.js:914: asOf '2026', reviewed 2026-10-10, verified true. Cities using it: 1 (philadelphia-pa-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source

</details>

<details><summary><code>tax-us-local-pittsburgh</code>: Tax rules for US-LOCAL-PITTSBURGH: Pittsburgh earned income tax 3% (city 1% + school district 2%) and $52 Local Service…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Pittsburgh earned income tax 3% (city 1% + school district 2%) and $52 Local Services Tax
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Pittsburgh earned income tax 3% (city 1% + school district …](https://www.pittsburghpa.gov/finance/tax-descriptions) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-LOCAL-PITTSBURGH']`, `server/juice.js RULES.US`, `server/juice.js:469 US_LOCAL.PITTSBURGH`, `server/juice.js TAX_SOURCES['US-LOCAL-PITTSBURGH'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-LOCAL-PITTSBURGH']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:599` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Check whether anything changed for the NEW tax year: the sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-LOCAL-PITTSBURGH); start from https://www.pittsburghpa.gov/finance/tax-descriptions. Confirm there is still no wage income tax and re-read the premium / levy rates and caps.
  - [ ] If anything changed: update the constants in server/juice.js and TAX_SOURCES['US-LOCAL-PITTSBURGH'] (name, url, asOf = the new tax year, reviewed, verified: true only after reading the official source), the golden vectors in test/juice*.test.js, and docs/LIVABILITY.md §3; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
- **Notes:** TAX_SOURCES server/juice.js:915: asOf '2026', reviewed 2026-10-10, verified true. Cities using it: 1 (pittsburgh-pa-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source

</details>

<details><summary><code>tax-us-local-detroit</code>: Tax rules for US-LOCAL-DETROIT: Detroit resident city income tax 2.4%, $600 exemption per person</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Detroit resident city income tax 2.4%, $600 exemption per person
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Detroit resident city income tax 2.4%, $600 exemption per p…](https://detroitmi.gov/departments/office-chief-financial-officer/ocfo-divisions/office-treasury/income-tax) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-LOCAL-DETROIT']`, `server/juice.js RULES.US`, `server/juice.js:469 US_LOCAL.DETROIT`, `server/juice.js TAX_SOURCES['US-LOCAL-DETROIT'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-LOCAL-DETROIT']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:600` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://detroitmi.gov/departments/office-chief-financial-officer/ocfo-divisions/office-treasury/income-tax): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-LOCAL-DETROIT).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-LOCAL-DETROIT'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-LOCAL-DETROIT']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:916: asOf '2026', reviewed 2026-10-10, verified false, 1 supporting page(s). Unverified: rate and exemption from a university payroll guide (detroitmi.gov blocked). Cities using it: 1 (detroit-mi-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: detroitmi.gov refuses GitHub-hosted runners (HTTP 403 o…

</details>

<details><summary><code>tax-us-local-portland</code>: Tax rules for US-LOCAL-PORTLAND: Portland area 2026: Metro supportive housing 1% over $128,000 / $205,000, Multnomah pr…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** Portland area 2026: Metro supportive housing 1% over $128,000 / $205,000, Multnomah preschool 1.5% over $125,000 / $200,000 + 1.5% over $250,000 / $400,000 (Oregon taxable income), arts tax $50
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Portland area 2026: Metro supportive housing 1% over $128,0…](https://www.portland.gov/revenue/personal-tax) (City of Portland public information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-LOCAL-PORTLAND']`, `server/juice.js RULES.US`, `server/juice.js:469 US_LOCAL.PORTLAND`, `server/juice.js TAX_SOURCES['US-LOCAL-PORTLAND'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-LOCAL-PORTLAND']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:601` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 5 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.portland.gov/revenue/personal-tax): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-LOCAL-PORTLAND).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-LOCAL-PORTLAND'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-LOCAL-PORTLAND']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:917: asOf '2026', reviewed 2026-10-10, verified true, 1 supporting page(s). Cities using it: 1 (portland-or-us). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. The Portland arts tax ($50) is listed in TAX_SOURCES but not compared. The PFA rate rises 0.8 pt in 2028 (stated on the page).

</details>

<details><summary><code>tax-us-local-md-county</code>: Tax rules for US-LOCAL-MD-COUNTY: Maryland local income tax, Baltimore City 3.2% of Maryland taxable income</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Maryland local income tax, Baltimore City 3.2% of Maryland taxable income
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [Maryland local income tax, Baltimore City 3.2% of Maryland …](https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['US-LOCAL-MD-COUNTY']`, `server/juice.js RULES.US`, `server/juice.js:469 US_LOCAL.MD-COUNTY`, `server/juice.js:319 mdTaxable`, `server/juice.js TAX_SOURCES['US-LOCAL-MD-COUNTY'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['US-LOCAL-MD-COUNTY']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:602` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.marylandtaxes.gov/individual/income/tax-info/tax-rates.php): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for US-LOCAL-MD-COUNTY).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['US-LOCAL-MD-COUNTY'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['US-LOCAL-MD-COUNTY']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:918: asOf '2025', reviewed 2026-10-10, verified false. Unverified: Baltimore City rate 3.20% (Comptroller page renders client-side). Cities using it: 1 (baltimore-md-us). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new…

</details>

<details><summary><code>tax-gb</code>: Tax rules for GB: HMRC 2026/27: personal allowance £12,570 (tapered over £100,000), 20% / 40% / 45% (£37,700 / £125,140…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+30 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** HMRC 2026/27: personal allowance £12,570 (tapered over £100,000), 20% / 40% / 45% (£37,700 / £125,140); employee Class 1 NICs 8% from £12,570 to £50,270, 2% above
- **As of:** 2026-04-06 · tax year 2026/27 · last checked 2026-10-10
- **Source:** [HMRC 2026/27: personal allowance £12,570 (tapered over £100…](https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past) (Crown copyright, Open Government Licence v3.0)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['GB']`, `server/juice.js:644 RULES.GB`, `server/juice.js:531 GB_RUK`, `server/juice.js TAX_SOURCES['GB'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['GB']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:603` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `docs/LIVABILITY.md:181` (methodology page); `test/juice.test.js:79` (tests); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 9 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for GB).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['GB'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['GB']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:919: asOf '2026/27', reviewed 2026-10-10, verified true, 1 supporting page(s). Cities using it: 5 (london-gb, cambridge-gb, oxford-gb, manchester-gb, edinburgh-gb). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year.

</details>

<details><summary><code>tax-gb-sct</code>: Tax rules for GB-SCT: Scottish income tax 2026/27: 19% / 20% / 21% / 42% / 45% / 48% (bands to £16,537 / £29,526 / £43,…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+30 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** Scottish income tax 2026/27: 19% / 20% / 21% / 42% / 45% / 48% (bands to £16,537 / £29,526 / £43,662 / £75,000 / £125,140)
- **As of:** 2026-04-06 · tax year 2026/27 · last checked 2026-10-10
- **Source:** [Scottish income tax 2026/27: 19% / 20% / 21% / 42% / 45% / …](https://www.gov.uk/scottish-income-tax) (Crown copyright, Open Government Licence v3.0)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['GB-SCT']`, `server/juice.js:644 RULES.GB`, `server/juice.js:532 GB_SCT`, `server/juice.js TAX_SOURCES['GB-SCT'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['GB-SCT']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:604` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 2 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.gov.uk/scottish-income-tax): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for GB-SCT).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['GB-SCT'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['GB-SCT']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:920: asOf '2026/27', reviewed 2026-10-10, verified true. Cities using it: 1 (edinburgh-gb). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year.

</details>

<details><summary><code>tax-ie</code>: Tax rules for IE: Revenue 2026: 20% to €44,000 (married, one income: €53,000) then 40%, personal credit €2,000 (married…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+30 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** Revenue 2026: 20% to €44,000 (married, one income: €53,000) then 40%, personal credit €2,000 (married €4,000) + employee credit €2,000; USC 0.5% / 2% / 3% / 8%; PRSI Class A 4.2% to 30 Sep 2026, 4.35% from 1 Oct
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Revenue 2026: 20% to €44,000 (married, one income: €53,000)…](https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/tax-relief-charts/index.aspx) (Revenue (Ireland) public sector information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['IE']`, `server/juice.js:644 RULES.IE`, `server/juice.js TAX_SOURCES['IE'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['IE']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:605` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 5 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.revenue.ie/en/personal-tax-credits-reliefs-and-exemptions/tax-relief-charts/index.aspx): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for IE).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['IE'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['IE']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:921: asOf '2026', reviewed 2026-10-10, verified true, 2 supporting page(s). Cities using it: 1 (dublin-ie). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year.

</details>

<details><summary><code>tax-ch</code>: Tax rules for CH: Direct federal tax 2026 (ESTV tariffs, single and married, CHF 263 per child), deductions: work expen…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Direct federal tax 2026 (ESTV tariffs, single and married, CHF 263 per child), deductions: work expenses 3% (CHF 2,000-4,000), insurance CHF 1,800 / 3,700 + 700 per child, child CHF 6,800, married CHF 2,800; employee AHV/IV/EO 5.3%, ALV 1.1% to CHF 148,200, non-occupational accident ~1% (2nd pillar excluded and not deducted)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Direct federal tax 2026 (ESTV tariffs, single and married, …](https://www.estv.admin.ch/dam/de/sd-web/vFK3ntWLQ4s4/2-215-D-2025-d.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['CH']`, `server/juice.js:644 RULES.CH`, `server/juice.js:538 chFederalTax`, `server/juice.js:536 CH_FED_SINGLE`, `server/juice.js:537 CH_FED_MARRIED`, `server/juice.js TAX_SOURCES['CH'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['CH']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:606` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `docs/LIVABILITY.md:182` (methodology page); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.estv.admin.ch/dam/de/sd-web/vFK3ntWLQ4s4/2-215-D-2025-d.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for CH).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['CH'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['CH']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:922: asOf '2026', reviewed 2026-10-10, verified false, approximate, 1 supporting page(s). Unverified: ALV 1.1% to CHF 148,200; non-occupational accident premium ~1% (insurer-specific). Not modeled: deduction of 2nd-pillar contributions; commuting and meal deductions; church tax. Cities using it: 2 (zurich-ch, geneva-ch). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; …

</details>

<details><summary><code>tax-ch-zh</code>: Tax rules for CH-ZH: Canton of Zurich 2026 (Kantonsblatt ZH): Grundtarif / Verheiratetentarif 0%-13%, insurance deducti…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Canton of Zurich 2026 (Kantonsblatt ZH): Grundtarif / Verheiratetentarif 0%-13%, insurance deduction CHF 2,900 / 5,800 + 1,300 per child, child deduction CHF 9,400; cantonal Steuerfuss 95% (Kantonsrat, 15 Dec 2025) + City of Zurich 119%
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Canton of Zurich 2026 (Kantonsblatt ZH): Grundtarif / Verhe…](https://www.estv2.admin.ch/stp/kb/zh-de.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['CH-ZH']`, `server/juice.js:644 RULES.CH`, `server/juice.js:552 ZH_VERH`, `server/juice.js:551 ZH_GRUND`, `server/juice.js:538 chFederalTax`, `server/juice.js:553 ZH_STEUERFUSS`, `server/juice.js:536 CH_FED_SINGLE`, `server/juice.js:537 CH_FED_MARRIED`, `server/juice.js TAX_SOURCES['CH-ZH'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['CH-ZH']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:607` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `docs/LIVABILITY.md:182` (methodology page); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.estv2.admin.ch/stp/kb/zh-de.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for CH-ZH).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['CH-ZH'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['CH-ZH']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:923: asOf '2026', reviewed 2026-10-10, verified false, 1 supporting page(s). Unverified: City of Zurich Steuerfuss 119% (city pages not reachable). Cities using it: 1 (zurich-ch). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: the Kantonsblatt / ESTV tax booklet is a PDF; checked by hand; TAX_SOURCES m…

</details>

<details><summary><code>tax-ch-ge</code>: Tax rules for CH-GE: Geneva (canton GE): approximation, one combined federal + cantonal + communal marginal schedule ca…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Geneva (canton GE): approximation, one combined federal + cantonal + communal marginal schedule calibrated to the cantonal calculator (not re-derived)
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [Geneva (canton GE): approximation, one combined federal + c…](https://www.estv2.admin.ch/stp/kb/ge-fr.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['CH-GE']`, `server/juice.js:644 RULES.CH`, `server/juice.js:556 CH_GE_COMBINED`, `server/juice.js:538 chFederalTax`, `server/juice.js:536 CH_FED_SINGLE`, `server/juice.js:537 CH_FED_MARRIED`, `server/juice.js TAX_SOURCES['CH-GE'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['CH-GE']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:608` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.estv2.admin.ch/stp/kb/ge-fr.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for CH-GE).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['CH-GE'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['CH-GE']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:924: asOf '2025', reviewed 2026-10-10, verified false, approximate, estimated. Cities using it: 1 (geneva-ch). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: approximation ca…

</details>

<details><summary><code>tax-de</code>: Tax rules for DE: § 32a EStG 2026 tariff (Grundfreibetrag €12,348) with splitting for married couples; Soli 5.5% with F…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** § 32a EStG 2026 tariff (Grundfreibetrag €12,348) with splitting for married couples; Soli 5.5% with Freigrenze €20,350 / €40,700; children: Kinderfreibetrag €6,828 + €2,928 or Kindergeld €259/month; social: pension 9.3% + unemployment 1.3% to €101,400, health 7.3% + 1.45% (half the 2.9% average Zusatzbeitrag) + care 1.8% (+0.6% childless) to €69,750
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [§ 32a EStG 2026 tariff (Grundfreibetrag €12,348) with split…](https://dejure.org/gesetze/EStG/32a.html) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['DE']`, `server/juice.js:644 RULES.DE`, `server/juice.js:559 DE_2026`, `server/juice.js TAX_SOURCES['DE'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['DE']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:609` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `docs/LIVABILITY.md:183` (methodology page); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://dejure.org/gesetze/EStG/32a.html): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for DE).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['DE'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['DE']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:925: asOf '2026', reviewed 2026-10-10, verified false, 4 supporting page(s). Unverified: contribution rates 9.3% / 1.3% / 7.3% / care 1.8% (statutory rates not re-read). Not modeled: care-insurance reduction of 0.25 points from the second child. Cities using it: 2 (berlin-de, munich-de). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI n…

</details>

<details><summary><code>tax-fr</code>: Tax rules for FR: Barème on 2025 income (latest enacted): 0/11/30/41/45%, quotient familial with the €1,807 cap per hal…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** Barème on 2025 income (latest enacted): 0/11/30/41/45%, quotient familial with the €1,807 cap per half-part, 10% deduction (cap €14,555), CEHR 3% / 4%; employee contributions 2026: old age 6.90% to the PASS (€48,060) + 0.40%, AGIRC-ARRCO 3.15% / 8.64%, CEG 0.86% / 1.08%, CET 0.14%, APEC 0.024%, CSG 9.2% + CRDS 0.5% on 98.25% to 4 PASS
- **As of:** 2025-01-01 · tax year 2025 income (barème) / 2026 (contributions) · last checked 2026-10-10
- **Source:** [Barème on 2025 income (latest enacted): 0/11/30/41/45%, quo…](https://www.service-public.fr/particuliers/vosdroits/F1419) (Service-Public.fr (DILA) public information (licence not reviewed))
- **Defined in:** `server/juice.js:890 TAX_SOURCES['FR']`, `server/juice.js:644 RULES.FR`, `server/juice.js:563 FR_PASS_2026`, `server/juice.js:562 FR_BAREME`, `server/juice.js TAX_SOURCES['FR'] + its RULES entry [tax agent]`, `server/juice.js:? FR_PASS_2025`, `server/juice.js TAX_HOUSEHOLD['FR']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:610` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 2 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.service-public.fr/particuliers/vosdroits/F1419): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for FR).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['FR'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['FR']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:926: asOf '2025 income (barème) / 2026 (contributions)', reviewed 2026-10-10, verified false, 6 supporting page(s). Unverified: AGIRC-ARRCO employee shares 3.15% / 8.64% (derived from the contractual rates); APEC 0.024%. Not modeled: décote (low incomes only); company health and provident plans. Cities using it: 1 (paris-fr). Encoded tax year 2025 (asOf '2025 income (barème) / 2026 (contributions)') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-…

</details>

<details><summary><code>tax-nl</code>: Tax rules for NL: Box 1 2026: 35.75% to €38,883, 37.56% to €78,426, 49.50% above (incl. national insurance); general cr…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Box 1 2026: 35.75% to €38,883, 37.56% to €78,426, 49.50% above (incl. national insurance); general credit €3,115 (cut 6.398% over €29,736); labour credit table 2026. 30% ruling not modeled
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Box 1 2026: 35.75% to €38,883, 37.56% to €78,426, 49.50% ab…](https://www.belastingdienst.nl/wps/wcm/connect/nl/voorlopige-aanslag/content/voorlopige-aanslag-tarieven-en-heffingskortingen) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['NL']`, `server/juice.js:644 RULES.NL`, `server/juice.js:636 nlLabourCredit`, `server/juice.js TAX_SOURCES['NL'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['NL']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:611` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.belastingdienst.nl/wps/wcm/connect/nl/voorlopige-aanslag/content/voorlopige-aanslag-tarieven-en-heffingskortingen): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for NL).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['NL'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['NL']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:927: asOf '2026', reviewed 2026-10-10, verified true. Cities using it: 1 (amsterdam-nl). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source

</details>

<details><summary><code>tax-es</code>: Tax rules for ES: IRPF state scale (art. 63 LIRPF) 9.5%-24.5%, personal minimum €5,550, €2,000 work deduction; employee…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** IRPF state scale (art. 63 LIRPF) 9.5%-24.5%, personal minimum €5,550, €2,000 work deduction; employee social security 2026 6.50% (4.70 + 1.55 + 0.10 + MEI 0.15) to €61,214.40. Regional part: the region's scale (state scale where none is set)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [IRPF state scale (art. 63 LIRPF) 9.5%-24.5%, personal minim…](https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['ES']`, `server/juice.js:644 RULES.ES`, `server/juice.js:567 ES_STATE`, `server/juice.js:568 ES_REGIONAL`, `server/juice.js TAX_SOURCES['ES'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['ES']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:612` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for ES).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['ES'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['ES']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:928: asOf '2026', reviewed 2026-10-10, verified true, 1 supporting page(s). Not modeled: solidarity contribution on pay above the maximum base. Cities using it: 2 (madrid-es, barcelona-es). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source

</details>

<details><summary><code>tax-es-md</code>: Tax rules for ES-MD: Comunidad de Madrid regional scale: five tranches 8.5% to 20.5% (to €13,362.22 / €19,004.63 / €35,…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Comunidad de Madrid regional scale: five tranches 8.5% to 20.5% (to €13,362.22 / €19,004.63 / €35,425.68 / €57,320.40)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Comunidad de Madrid regional scale: five tranches 8.5% to 2…](https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-i-tributacion-autonomica-2026.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['ES-MD']`, `server/juice.js:644 RULES.ES`, `server/juice.js:567 ES_STATE`, `server/juice.js:568 ES_REGIONAL`, `server/juice.js TAX_SOURCES['ES-MD'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['ES-MD']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:613` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-i-tributacion-autonomica-2026.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for ES-MD).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['ES-MD'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['ES-MD']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:929: asOf '2026', reviewed 2026-10-10, verified false. Unverified: tranche thresholds (the 2026 summary confirms five tranches from 8.50% to 20.50%). Not modeled: Madrid's higher regional minimums. Cities using it: 1 (madrid-es). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a st…

</details>

<details><summary><code>tax-es-ct</code>: Tax rules for ES-CT: Catalonia regional scale 9.5%-25.5% (to €12,500 / 22,000 / 33,000 / 53,000 / 90,000 / 120,000 / 17…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Catalonia regional scale 9.5%-25.5% (to €12,500 / 22,000 / 33,000 / 53,000 / 90,000 / 120,000 / 175,000)
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [Catalonia regional scale 9.5%-25.5% (to €12,500 / 22,000 / …](https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-ii-tributacion-autonomica-2025.pdf) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['ES-CT']`, `server/juice.js:644 RULES.ES`, `server/juice.js:567 ES_STATE`, `server/juice.js:568 ES_REGIONAL`, `server/juice.js TAX_SOURCES['ES-CT'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['ES-CT']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:614` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.hacienda.gob.es/sgfal/financiacionterritorial/autonomica/capitulo-ii-tributacion-autonomica-2025.pdf): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for ES-CT).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['ES-CT'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['ES-CT']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:930: asOf '2025', reviewed 2026-10-10, verified true. Not modeled: Catalonia's own personal minimum. Cities using it: 1 (barcelona-es). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable mac…

</details>

<details><summary><code>tax-pt</code>: Tax rules for PT: IRS 2026 scale 12.5%-48% (Lei 73-A/2025, CIRS art. 68), solidarity surcharge 2.5% / 5% over €80,000 /…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** IRS 2026 scale 12.5%-48% (Lei 73-A/2025, CIRS art. 68), solidarity surcharge 2.5% / 5% over €80,000 / €250,000; specific deduction €4,462.15 or contributions; social security 11%. IFICI regime not modeled
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [IRS 2026 scale 12.5%-48% (Lei 73-A/2025, CIRS art. 68), sol…](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs68.aspx) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['PT']`, `server/juice.js:644 RULES.PT`, `server/juice.js TAX_SOURCES['PT'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['PT']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:615` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs68.aspx): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for PT).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['PT'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['PT']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:931: asOf '2026', reviewed 2026-10-10, verified false, 1 supporting page(s). Unverified: specific deduction €4,462.15 (2026 IAS not read); employee social security 11%. Cities using it: 1 (lisbon-pt). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table w…

</details>

<details><summary><code>tax-it</code>: Tax rules for IT: IRPEF 2026 23/33/43%; Lombardy regional surcharge up to 1.73% + Milan municipal 0.8%; INPS 9.19% to €…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** IRPEF 2026 23/33/43%; Lombardy regional surcharge up to 1.73% + Milan municipal 0.8%; INPS 9.19% to €120,607
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [IRPEF 2026 23/33/43%; Lombardy regional surcharge up to 1.7…](https://www.agenziaentrate.gov.it/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['IT']`, `server/juice.js:644 RULES.IT`, `server/juice.js TAX_SOURCES['IT'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['IT']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:616` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.agenziaentrate.gov.it/): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for IT).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['IT'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['IT']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:932: asOf '2026', reviewed 2026-10-10, verified false, approximate. Unverified: all values (agenziaentrate page did not list the scale). Cities using it: 1 (milan-it). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against…

</details>

<details><summary><code>tax-at</code>: Tax rules for AT: Einkommensteuertarif 2026 0%-55% (€13,539 / 21,992 / 36,458 / 70,365 / 104,859 / 1M) on 12 regular sa…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Einkommensteuertarif 2026 0%-55% (€13,539 / 21,992 / 36,458 / 70,365 / 104,859 / 1M) on 12 regular salaries, 13th/14th at 6%; social insurance 18.07% to €90,300
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Einkommensteuertarif 2026 0%-55% (€13,539 / 21,992 / 36,458…](https://www.usp.gv.at/steuern-finanzen/einkommensteuer-ueberblick/weitere-informationen-est/tarifstufen.html) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['AT']`, `server/juice.js:644 RULES.AT`, `server/juice.js TAX_SOURCES['AT'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['AT']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:617` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.usp.gv.at/steuern-finanzen/einkommensteuer-ueberblick/weitere-informationen-est/tarifstufen.html): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for AT).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['AT'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['AT']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:933: asOf '2026', reviewed 2026-10-10, verified false, approximate. Unverified: social insurance 18.07% and the 2025 cap €90,300 (2026 cap not read); flat 6% on all special payments (higher rates above €25,000 not modeled). Cities using it: 1 (vienna-at). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: …

</details>

<details><summary><code>tax-be</code>: Tax rules for BE: Federal rates 25/40/45/50%, basic allowance €10,910, flat professional expenses (30%, cap €5,930), co…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Federal rates 25/40/45/50%, basic allowance €10,910, flat professional expenses (30%, cap €5,930), communal surcharge ~7%; social 13.07%
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [Federal rates 25/40/45/50%, basic allowance €10,910, flat p…](https://finance.belgium.be/en/private-individuals/tax-return/rates) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['BE']`, `server/juice.js:644 RULES.BE`, `server/juice.js TAX_SOURCES['BE'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['BE']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:618` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://finance.belgium.be/en/private-individuals/tax-return/rates): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for BE).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['BE'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['BE']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:934: asOf '2025', reviewed 2026-10-10, verified false, approximate. Unverified: all values (FPS Finance pages blocked). Cities using it: 1 (brussels-be). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never s…

</details>

<details><summary><code>tax-se</code>: Tax rules for SE: State tax 20% above SEK 643,000 taxable (brytpunkt 660,400), basic allowance SEK 17,400 at high incom…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** State tax 20% above SEK 643,000 taxable (brytpunkt 660,400), basic allowance SEK 17,400 at high income; Stockholm municipal tax 30.55%; job tax credit approximated
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [State tax 20% above SEK 643,000 taxable (brytpunkt 660,400)…](https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['SE']`, `server/juice.js:644 RULES.SE`, `server/juice.js TAX_SOURCES['SE'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['SE']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:619` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for SE).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['SE'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['SE']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:935: asOf '2026', reviewed 2026-10-10, verified false, approximate. Unverified: Stockholm municipal rate 30.55%; job tax credit formula. Cities using it: 1 (stockholm-se). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand aga…

</details>

<details><summary><code>tax-dk</code>: Tax rules for DK: AM contribution 8%, bottom tax 12.01%, Copenhagen municipal 23.39%, 2026 middle/top/top-top tax 7.5%/…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** AM contribution 8%, bottom tax 12.01%, Copenhagen municipal 23.39%, 2026 middle/top/top-top tax 7.5%/7.5%/5%, personal allowance DKK 54,100, employment deduction 12.75%
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [AM contribution 8%, bottom tax 12.01%, Copenhagen municipal…](https://skat.dk/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['DK']`, `server/juice.js:644 RULES.DK`, `server/juice.js TAX_SOURCES['DK'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['DK']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:620` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://skat.dk/): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for DK).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['DK'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['DK']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:936: asOf '2026', reviewed 2026-10-10, verified false, approximate. Unverified: all values (skat.dk not readable). Cities using it: 1 (copenhagen-dk). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official sou…

</details>

<details><summary><code>tax-no</code>: Tax rules for NO: Skatteetaten 2026: tax on general income 22%, bracket tax 1.7% / 4.0% / 13.7% / 16.8% / 17.8% from NO…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** Skatteetaten 2026: tax on general income 22%, bracket tax 1.7% / 4.0% / 13.7% / 16.8% / 17.8% from NOK 226,100 / 318,300 / 725,050 / 980,100 / 1,467,200, minimum standard deduction 46% (max NOK 92,000), personal allowance NOK 108,550; national insurance 7.6%
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Skatteetaten 2026: tax on general income 22%, bracket tax 1…](https://www.skatteetaten.no/en/rates/bracket-tax/) (Skatteetaten public information (licence not reviewed))
- **Defined in:** `server/juice.js:890 TAX_SOURCES['NO']`, `server/juice.js:644 RULES.NO`, `server/juice.js TAX_SOURCES['NO'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['NO']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:621` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 2 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.skatteetaten.no/en/rates/bracket-tax/): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for NO).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['NO'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['NO']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:937: asOf '2026', reviewed 2026-10-10, verified true, 4 supporting page(s). Cities using it: 1 (oslo-no). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year.

</details>

<details><summary><code>tax-fi</code>: Tax rules for FI: Approximation: state progressive tax + Helsinki municipal 5.3% as one schedule; employee contribution…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Approximation: state progressive tax + Helsinki municipal 5.3% as one schedule; employee contributions ~9% (pension, unemployment, health)
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [Approximation: state progressive tax + Helsinki municipal 5…](https://vero.fi/en/individuals/tax-cards-and-tax-returns/tax_card/tax-rate-and-income-ceiling/tax-bases/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['FI']`, `server/juice.js:644 RULES.FI`, `server/juice.js TAX_SOURCES['FI'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['FI']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:622` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://vero.fi/en/individuals/tax-cards-and-tax-returns/tax_card/tax-rate-and-income-ceiling/tax-bases/): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for FI).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['FI'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['FI']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:938: asOf '2025', reviewed 2026-10-10, verified false, approximate, estimated. Cities using it: 1 (helsinki-fi). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: approximation …

</details>

<details><summary><code>tax-pl</code>: Tax rules for PL: PIT 12%/32% (PLN 120,000), PLN 3,600 tax-reducing amount, PLN 3,000 costs; ZUS 11.26% to 30x cap + si…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** PIT 12%/32% (PLN 120,000), PLN 3,600 tax-reducing amount, PLN 3,000 costs; ZUS 11.26% to 30x cap + sickness 2.45%; health 9%
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [PIT 12%/32% (PLN 120,000), PLN 3,600 tax-reducing amount, P…](https://www.podatki.gov.pl/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['PL']`, `server/juice.js:644 RULES.PL`, `server/juice.js TAX_SOURCES['PL'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['PL']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:623` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.podatki.gov.pl/): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for PL).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['PL'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['PL']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:939: asOf '2026', reviewed 2026-10-10, verified false. Unverified: all values. Not modeled: solidarity levy 4% on income over PLN 1M. Cities using it: 2 (warsaw-pl, krakow-pl). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by han…

</details>

<details><summary><code>tax-cz</code>: Tax rules for CZ: PIT 15%/23% (36x average wage), CZK 30,840 credit; social 7.1% (capped), health 4.5%</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** PIT 15%/23% (36x average wage), CZK 30,840 credit; social 7.1% (capped), health 4.5%
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [PIT 15%/23% (36x average wage), CZK 30,840 credit; social 7…](https://www.financnisprava.cz/cs/dane/dane/dan-z-prijmu/fyzicke-osoby) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['CZ']`, `server/juice.js:644 RULES.CZ`, `server/juice.js TAX_SOURCES['CZ'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['CZ']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:624` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.financnisprava.cz/cs/dane/dane/dan-z-prijmu/fyzicke-osoby): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for CZ).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['CZ'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['CZ']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:940: asOf '2026', reviewed 2026-10-10, verified false, approximate. Unverified: all values. Cities using it: 1 (prague-cz). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source; TAX_SOURCES marks this…

</details>

<details><summary><code>tax-ee</code>: Tax rules for EE: Income tax 22%, basic exemption €8,400; unemployment insurance 1.6% (2nd pillar excluded)</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Income tax 22%, basic exemption €8,400; unemployment insurance 1.6% (2nd pillar excluded)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Income tax 22%, basic exemption €8,400; unemployment insura…](https://www.emta.ee/en/private-client/taxes-and-payment/income-tax) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['EE']`, `server/juice.js:644 RULES.EE`, `server/juice.js TAX_SOURCES['EE'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['EE']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:625` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.emta.ee/en/private-client/taxes-and-payment/income-tax): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for EE).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['EE'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['EE']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:941: asOf '2026', reviewed 2026-10-10, verified false. Unverified: all values (EMTA pages moved). Cities using it: 1 (tallinn-ee). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: the EMTA income-tax pages returned 404 from the runner (2026-10-10); checked by hand; TAX_SOURCES marks this rule unverified;…

</details>

<details><summary><code>tax-il</code>: Tax rules for IL: Income tax 10%-47% + 3% surtax (2025 thresholds, frozen), 2.25 credit points; Bituach Leumi + health …</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Income tax 10%-47% + 3% surtax (2025 thresholds, frozen), 2.25 credit points; Bituach Leumi + health 2026: 4.27% to NIS 7,703/month, 12.17% to NIS 51,910/month (pension fund excluded)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Income tax 10%-47% + 3% surtax (2025 thresholds, frozen), 2…](https://www.btl.gov.il/English%20Homepage/Insurance/Ratesandamount/Pages/forSalaried.aspx) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['IL']`, `server/juice.js:644 RULES.IL`, `server/juice.js TAX_SOURCES['IL'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['IL']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:626` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.btl.gov.il/English%20Homepage/Insurance/Ratesandamount/Pages/forSalaried.aspx): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for IL).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['IL'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['IL']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:942: asOf '2026', reviewed 2026-10-10, verified false. Unverified: income tax brackets and credit point value. Cities using it: 1 (tel-aviv-il). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source; T…

</details>

<details><summary><code>tax-ae</code>: Tax rules for AE: No personal income tax; no social security for expatriates</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** No personal income tax; no social security for expatriates
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [No personal income tax; no social security for expatriates](https://tax.gov.ae/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['AE']`, `server/juice.js:644 RULES.AE`, `server/juice.js TAX_SOURCES['AE'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['AE']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:627` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Check whether anything changed for the NEW tax year: the sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for AE); start from https://tax.gov.ae/. Confirm there is still no wage income tax and re-read the premium / levy rates and caps.
  - [ ] If anything changed: update the constants in server/juice.js and TAX_SOURCES['AE'] (name, url, asOf = the new tax year, reviewed, verified: true only after reading the official source), the golden vectors in test/juice*.test.js, and docs/LIVABILITY.md §3; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:943: asOf '2026', reviewed 2026-10-10, verified false. Cities using it: 2 (dubai-ae, abu-dhabi-ae). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source; TAX_SOURCES marks this rule unverified; TAX_SO…

</details>

<details><summary><code>tax-sa</code>: Tax rules for SA: No personal income tax on employment income; GOSI annuities apply to Saudi nationals only</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** No personal income tax on employment income; GOSI annuities apply to Saudi nationals only
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [No personal income tax on employment income; GOSI annuities…](https://zatca.gov.sa/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['SA']`, `server/juice.js:644 RULES.SA`, `server/juice.js TAX_SOURCES['SA'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['SA']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:628` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Check whether anything changed for the NEW tax year: the sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for SA); start from https://zatca.gov.sa/. Confirm there is still no wage income tax and re-read the premium / levy rates and caps.
  - [ ] If anything changed: update the constants in server/juice.js and TAX_SOURCES['SA'] (name, url, asOf = the new tax year, reviewed, verified: true only after reading the official source), the golden vectors in test/juice*.test.js, and docs/LIVABILITY.md §3; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:944: asOf '2026', reviewed 2026-10-10, verified false. Cities using it: 1 (riyadh-sa). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source; TAX_SOURCES marks this rule unverified; TAX_SOURCES marks t…

</details>

<details><summary><code>tax-jp</code>: Tax rules for JP: NTA 2026: income tax 5%-45% x 1.021, employment income deduction (min ¥740,000, max ¥1.95M), basic de…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** NTA 2026: income tax 5%-45% x 1.021, employment income deduction (min ¥740,000, max ¥1.95M), basic deduction ¥620,000 (tapering above ¥23.5M); resident tax 10% + ¥5,000 (Tokyo, basic deduction ¥430,000); health ~4.96%, pension 9.15% (capped), employment insurance 0.55%
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [NTA 2026: income tax 5%-45% x 1.021, employment income dedu…](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm) (National Tax Agency (Japan) public information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['JP']`, `server/juice.js:644 RULES.JP`, `server/juice.js:615 jpEmploymentDeduction`, `server/juice.js TAX_SOURCES['JP'] + its RULES entry [tax agent]`, `server/juice.js:612 fn:jpEmploymentDeduction`, `server/juice.js TAX_HOUSEHOLD['JP']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:629` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 3 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for JP).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['JP'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['JP']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:945: asOf '2026', reviewed 2026-10-10, verified false, approximate, 3 supporting page(s). Unverified: social insurance rates and caps. Cities using it: 2 (tokyo-jp, osaka-jp). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. TAX_SOURCES marks this rule unverified; approximate model; TAX_SOURCES marks this schedu…

</details>

<details><summary><code>tax-kr</code>: Tax rules for KR: Income tax 6%-45% + 10% local income tax, employment income deduction, ₩500,000 wage-earner credit (a…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Income tax 6%-45% + 10% local income tax, employment income deduction, ₩500,000 wage-earner credit (approx); NPS 4.75% (capped), NHI 3.595% + LTC, EI 0.9%
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Income tax 6%-45% + 10% local income tax, employment income…](https://www.nts.go.kr/english/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['KR']`, `server/juice.js:644 RULES.KR`, `server/juice.js:622 krEmploymentDeduction`, `server/juice.js TAX_SOURCES['KR'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['KR']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:630` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.nts.go.kr/english/): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for KR).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['KR'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['KR']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:946: asOf '2026', reviewed 2026-10-10, verified false, approximate. Unverified: all values. Cities using it: 1 (seoul-kr). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source; TAX_SOURCES marks this …

</details>

<details><summary><code>tax-sg</code>: Tax rules for SG: IRAS resident rates YA2024 onward 0%-24%, earned income relief S$1,000 (below 55); CPF not applied (E…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** IRAS resident rates YA2024 onward 0%-24%, earned income relief S$1,000 (below 55); CPF not applied (Employment Pass holders do not contribute)
- **As of:** 2025-01-01 · tax year YA2026 · last checked 2026-10-10
- **Source:** [IRAS resident rates YA2024 onward 0%-24%, earned income rel…](https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates) (IRAS (Singapore Government) public information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['SG']`, `server/juice.js:644 RULES.SG`, `server/juice.js TAX_SOURCES['SG'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['SG']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:631` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 1 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for SG).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['SG'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['SG']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:947: asOf 'YA2026', reviewed 2026-10-10, verified true, 1 supporting page(s). Cities using it: 1 (singapore-sg). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year.

</details>

<details><summary><code>tax-hk</code>: Tax rules for HK: Salaries tax 2026/27: progressive 2%-17% after allowances (basic HK$145,000, married HK$290,000, HK$1…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** Salaries tax 2026/27: progressive 2%-17% after allowances (basic HK$145,000, married HK$290,000, HK$140,000 per child; derived from the gov.hk standard-rate zone table), capped at the standard rate 15% (16% over HK$5M); MPF 5% to HK$18,000 deducted (funded, not counted as tax)
- **As of:** 2026-04-01 · tax year 2026/27 · last checked 2026-10-10
- **Source:** [Salaries tax 2026/27: progressive 2%-17% after allowances (…](https://www.gov.hk/en/residents/taxes/taxfiling/taxrates/salariesrates.htm) (GovHK public information)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['HK']`, `server/juice.js:644 RULES.HK`, `server/juice.js TAX_SOURCES['HK'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['HK']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:632` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 5 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.gov.hk/en/residents/taxes/taxfiling/taxrates/salariesrates.htm): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for HK).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['HK'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['HK']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:948: asOf '2026/27', reviewed 2026-10-10, verified false. Unverified: MPF cap HK$18,000. Cities using it: 1 (hong-kong-hk). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. TAX_SOURCES marks this rule unverified; TAX_SOURCES marks this schedule unverified; TAX_SOURCES marks this schedule unverified; TAX_SOURCES …

</details>

<details><summary><code>tax-tw</code>: Tax rules for TW: Income tax 5%-40%, exemption + standard + salary deductions NT$446,000; labour and health insurance (…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Income tax 5%-40%, exemption + standard + salary deductions NT$446,000; labour and health insurance (capped)
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [Income tax 5%-40%, exemption + standard + salary deductions…](https://www.etax.nat.gov.tw/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['TW']`, `server/juice.js:644 RULES.TW`, `server/juice.js TAX_SOURCES['TW'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['TW']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:633` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.etax.nat.gov.tw/): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for TW).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['TW'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['TW']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:949: asOf '2025', reviewed 2026-10-10, verified false, approximate. Unverified: all values. Cities using it: 1 (taipei-tw). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no …

</details>

<details><summary><code>tax-in</code>: Tax rules for IN: New regime FY2026-27: 0/5/10/15/20/25/30% slabs, ₹75,000 standard deduction, section 87A rebate to ₹1…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** New regime FY2026-27: 0/5/10/15/20/25/30% slabs, ₹75,000 standard deduction, section 87A rebate to ₹12 lakh, surcharge to 25%, 4% cess; professional tax ₹2,500 (KA/MH/TS). EPF (funded) excluded
- **As of:** 2026-04-01 · tax year FY2026-27 · last checked 2026-10-10
- **Source:** [New regime FY2026-27: 0/5/10/15/20/25/30% slabs, ₹75,000 st…](https://incometaxindia.gov.in/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['IN']`, `server/juice.js:644 RULES.IN`, `server/juice.js TAX_SOURCES['IN'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['IN']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:634` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `docs/LIVABILITY.md:184` (methodology page); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://incometaxindia.gov.in/): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for IN).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['IN'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['IN']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:950: asOf 'FY2026-27', reviewed 2026-10-10, verified false. Unverified: all values (secondary sources only). Cities using it: 4 (bengaluru-in, hyderabad-in, mumbai-in, new-delhi-in). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked …

</details>

<details><summary><code>tax-au</code>: Tax rules for AU: Resident rates 2026-27: 0/15/30/37/45% ($18,200 / $45,000 / $135,000 / $190,000), LITO, Medicare levy…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Resident rates 2026-27: 0/15/30/37/45% ($18,200 / $45,000 / $135,000 / $190,000), LITO, Medicare levy 2%. Super is employer-paid on top, excluded
- **As of:** 2026-07-01 · tax year 2026-27 · last checked 2026-10-10
- **Source:** [Resident rates 2026-27: 0/15/30/37/45% ($18,200 / $45,000 /…](https://treasury.gov.au/tax-cuts) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['AU']`, `server/juice.js:644 RULES.AU`, `server/juice.js:629 auLito`, `server/juice.js TAX_SOURCES['AU'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['AU']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:635` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `docs/LIVABILITY.md:210` (methodology page); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://treasury.gov.au/tax-cuts): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for AU).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['AU'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['AU']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:951: asOf '2026-27', reviewed 2026-10-10, verified false. Unverified: 15% rate from 1 July 2026; LITO and Medicare levy (ATO blocks the probe). Cities using it: 2 (sydney-nsw-au, melbourne-vic-au). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: ato.gov.au refuses GitHub-hosted runners (HTTP 403 or conn…

</details>

<details><summary><code>tax-nz</code>: Tax rules for NZ: IRD rates from 1 Apr 2025: 10.5/17.5/30/33/39% ($15,600 / $53,500 / $78,100 / $180,000); ACC earners …</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** IRD rates from 1 Apr 2025: 10.5/17.5/30/33/39% ($15,600 / $53,500 / $78,100 / $180,000); ACC earners levy 1.67% (capped)
- **As of:** 2026-04-01 · tax year 2026/27 · last checked 2026-10-10
- **Source:** [IRD rates from 1 Apr 2025: 10.5/17.5/30/33/39% ($15,600 / $…](https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals) (Inland Revenue (NZ) public information (licence not reviewed))
- **Defined in:** `server/juice.js:890 TAX_SOURCES['NZ']`, `server/juice.js:644 RULES.NZ`, `server/juice.js TAX_SOURCES['NZ'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['NZ']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:636` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 2 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for NZ).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['NZ'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['NZ']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:952: asOf '2026/27', reviewed 2026-10-10, verified false. Unverified: ACC earners levy 1.67% to $152,790 (2025/26 values). Cities using it: 1 (auckland-nz). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. TAX_SOURCES marks this rule unverified; TAX_SOURCES marks this schedule unverified; TAX_SOURCES marks this …

</details>

<details><summary><code>tax-ca</code>: Tax rules for CA: CRA T4127 (January 2026): federal 14/20.5/26/29/33% ($58,523 / $117,045 / $181,440 / $258,482), basic…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+30 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** CRA T4127 (January 2026): federal 14/20.5/26/29/33% ($58,523 / $117,045 / $181,440 / $258,482), basic personal amount $16,452 falling to $14,829, Canada employment amount $1,501; CPP 5.95% to $74,600 (enhanced part deducted) + CPP2 4% to $85,000; EI 1.63% to $68,900
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [CRA T4127 (January 2026): federal 14/20.5/26/29/33% ($58,52…](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html) (Government of Canada (Crown copyright; reproduction for non-commercial use permitted))
- **Defined in:** `server/juice.js:890 TAX_SOURCES['CA']`, `server/juice.js:644 RULES.CA`, `server/juice.js:581 caPayroll`, `server/juice.js:574 CA_FED_2026`, `server/juice.js:576 caBpaf`, `server/juice.js TAX_SOURCES['CA'] + its RULES entry [tax agent]`, `server/juice.js:578 fn:caPayroll`, `server/juice.js:573 fn:caBpaf`, `server/juice.js TAX_HOUSEHOLD['CA']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:637` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 7 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for CA).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['CA'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['CA']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:953: asOf '2026', reviewed 2026-10-10, verified false, 2 supporting page(s). Unverified: CPP2 ceiling $85,000; deduction of the enhanced CPP contributions from income (not re-read in T4127). Cities using it: 4 (toronto-on-ca, ottawa-on-ca, montreal-qc-ca, vancouver-bc-ca). CPP/QPP/EI bases and rates (caPayroll) feed the federal and provincial credits: one CRA/RQ refresh updates both. Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 ke…

</details>

<details><summary><code>tax-ca-on</code>: Tax rules for CA-ON: Ontario 2026 (T4127 Table 8.1): 5.05/9.15/11.16/12.16/13.16% ($53,891 / $107,785 / $150,000 / $220…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+30 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** Ontario 2026 (T4127 Table 8.1): 5.05/9.15/11.16/12.16/13.16% ($53,891 / $107,785 / $150,000 / $220,000), basic personal amount $12,989, surtax 20% over $5,818 + 36% over $7,446, Ontario Health Premium
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Ontario 2026 (T4127 Table 8.1): 5.05/9.15/11.16/12.16/13.16…](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html) (Government of Canada (Crown copyright; reproduction for non-commercial use permitted))
- **Defined in:** `server/juice.js:890 TAX_SOURCES['CA-ON']`, `server/juice.js RULES.CA`, `server/juice.js:602 CA_PROV.ON`, `server/juice.js:594 onHealthPremium`, `server/juice.js TAX_SOURCES['CA-ON'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['CA-ON']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:638` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 2 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for CA-ON).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['CA-ON'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['CA-ON']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:954: asOf '2026', reviewed 2026-10-10, verified true. Cities using it: 2 (toronto-on-ca, ottawa-on-ca). CPP/QPP/EI bases and rates (caPayroll) feed the federal and provincial credits: one CRA/RQ refresh updates both. Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year.

</details>

<details><summary><code>tax-ca-bc</code>: Tax rules for CA-BC: British Columbia 2026: 5.60/7.70/10.50/12.29/14.70/16.80/20.50% ($50,363 / $100,728 / $115,648 / $…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+30 days grace) · detect via `scripts/refresh/tax.js`
- **Values:** British Columbia 2026: 5.60/7.70/10.50/12.29/14.70/16.80/20.50% ($50,363 / $100,728 / $115,648 / $140,430 / $190,405 / $265,545; lowest rate raised by Budget 2026), basic personal amount $13,216
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [British Columbia 2026: 5.60/7.70/10.50/12.29/14.70/16.80/20…](https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates) (Province of British Columbia (Crown copyright))
- **Defined in:** `server/juice.js:890 TAX_SOURCES['CA-BC']`, `server/juice.js RULES.CA`, `server/juice.js:602 CA_PROV.BC`, `server/juice.js TAX_SOURCES['CA-BC'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['CA-BC']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:639` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry. 2 figure(s) compared with the official page, plus…
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www2.gov.bc.ca/gov/content/taxes/income-taxes/personal/tax-rates): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for CA-BC).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['CA-BC'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['CA-BC']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:955: asOf '2026', reviewed 2026-10-10, verified true, 1 supporting page(s). Cities using it: 1 (vancouver-bc-ca). CPP/QPP/EI bases and rates (caPayroll) feed the federal and provincial credits: one CRA/RQ refresh updates both. Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year.

</details>

<details><summary><code>tax-ca-qc</code>: Tax rules for CA-QC: Quebec 2025 brackets 14/19/24/25.75%, federal abatement 16.5%; QPP 6.3%, QPIP 0.43%, EI 1.30%</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Quebec 2025 brackets 14/19/24/25.75%, federal abatement 16.5%; QPP 6.3%, QPIP 0.43%, EI 1.30%
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [Quebec 2025 brackets 14/19/24/25.75%, federal abatement 16.…](https://www.revenuquebec.ca/en/citizens/income-tax-return/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['CA-QC']`, `server/juice.js RULES.CA`, `server/juice.js:602 CA_PROV.QC`, `server/juice.js TAX_SOURCES['CA-QC'] + its RULES entry [tax agent]`, `server/juice.js:578 fn:caPayroll`, `server/juice.js TAX_HOUSEHOLD['CA-QC']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:640` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.revenuquebec.ca/en/citizens/income-tax-return/): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for CA-QC).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['CA-QC'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['CA-QC']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:956: asOf '2025', reviewed 2026-10-10, verified false, approximate. Unverified: Quebec brackets, basic amount and QPP/QPIP (Revenu Québec blocks the probe); abatement 16.5% and EI 1.30% are from CRA. Cities using it: 1 (montreal-qc-ca). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). CPP/QPP/EI bases and rates (caPayroll) feed the federal and provincial credits: one CRA/RQ refresh updates both. Line numbers are as of the 2026-10-10 working tre…

</details>

<details><summary><code>tax-mx</code>: Tax rules for MX: ISR annual table (Art. 152 LISR, 2025 values) 1.92%-35%; IMSS employee ~2.775% (capped at 25 UMA)</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** ISR annual table (Art. 152 LISR, 2025 values) 1.92%-35%; IMSS employee ~2.775% (capped at 25 UMA)
- **As of:** 2025-01-01 · tax year 2025 · last checked 2026-10-10
- **Source:** [ISR annual table (Art. 152 LISR, 2025 values) 1.92%-35%; IM…](https://www.sat.gob.mx/) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['MX']`, `server/juice.js:644 RULES.MX`, `server/juice.js TAX_SOURCES['MX'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['MX']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:641` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.sat.gob.mx/): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for MX).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['MX'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['MX']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES marks this schedule unverified TAX_SOURCES server/juice.js:957: asOf '2025', reviewed 2026-10-10, verified false, approximate. Unverified: all values (2026 table update not read). Cities using it: 1 (mexico-city-mx). Encoded tax year 2025 (asOf '2025') while 2026 is in force on 2026-10-10: check whether the 2026 schedule is published (detect). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI nev…

</details>

<details><summary><code>tax-br</code>: Tax rules for BR: Receita Federal 2026 monthly IRPF table 0%-27.5%, R$189.59 per dependent; INSS 2026 7.5%-14% to R$8,4…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · yearly (+60 days grace) · manual via `scripts/refresh/tax.js`
- **Values:** Receita Federal 2026 monthly IRPF table 0%-27.5%, R$189.59 per dependent; INSS 2026 7.5%-14% to R$8,475.55; x12 (13th salary not modeled)
- **As of:** 2026-01-01 · tax year 2026 · last checked 2026-10-10
- **Source:** [Receita Federal 2026 monthly IRPF table 0%-27.5%, R$189.59 …](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026) (official publication; tax rates and thresholds are statutory facts)
- **Defined in:** `server/juice.js:890 TAX_SOURCES['BR']`, `server/juice.js:644 RULES.BR`, `server/juice.js TAX_SOURCES['BR'] + its RULES entry [tax agent]`, `server/juice.js TAX_HOUSEHOLD['BR']`
- **Used in:** `server/juice.js taxFor()` (drawer Juice block (Tax line: income / regional / social)); `public/viz/map.js juiceAt()` (map (Juice colour mode)); `public/app.js juice badge, Juice filter and sort` (list badge, filters); `docs/LIVABILITY.md §3 tax table` (methodology page); `test/juice*.test.js` (tests (tax golden vectors)); `server/juice.js:1086` (API); `server/juice.js:1197` (API); `server/juice.js:1278` (API); `public/app.js:2151` (drawer Juice block); `public/api.js:713` (API); `docs/LIVABILITY.md:278` (methodology page); `server/juice.js:1248` (drawer Juice block); `docs/LIVABILITY.md:642` (methodology page); `public/app.js:2161` (drawer Juice block); `public/app.js:1870` (badge); `public/viz/map.js:102` (map); `test/juice.test.js:90` (tests); `public/app.js:2155` (drawer Juice block); `public/api.js:697` (API); `server/juice.js computeJuice inputs.tax.sources` (drawer Juice block); `docs/LIVABILITY.md:265` (methodology page); `docs/LIVABILITY.md:168` (docs); `README.md:222` (README); `test/juice.test.js:46` (tests); `test/fixtures/tax-golden.json` (tests)
- **Validator:** scripts/refresh/tax.js (tested in test/refresh-tax.test.js): encoded schedules have strictly increasing thresholds and rates in [0, 0.7) that never decrease; caps and wage bases do not fall year over year; the encoded tax year is the current or previous one; every RULES jurisdiction, state, locality, province and TAX_SOURCES key has a watch entry.
- **Before:** manual: docs/LIVABILITY.md §6 step 3 (each January / April, update the brackets and TAX_SOURCES by hand); no automated check
- **Checklist:**
  - [ ] Find the schedule for the NEW tax year (a new document, not the current https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026): the official sources and the usual publication month are in scripts/refresh/tax-watch.js (detectSources and expectedPublication for BR).
  - [ ] Update the brackets, allowances, credits, caps and rates in server/juice.js (the RULES entry and the constants it uses), and TAX_HOUSEHOLD['BR'] if the household basis (joint / individual filing) or the child credits changed.
  - [ ] Update TAX_SOURCES['BR']: name, url, asOf (the new tax year), reviewed, verified: true only after reading the official schedule; then the docs/LIVABILITY.md §3 row.
  - [ ] Recompute the golden vectors in test/juice*.test.js (and test/fixtures/tax-golden.json) by hand from the official schedule, in the same change; run npm test.
  - [ ] Run node scripts/refresh/registry.js --sync-tax --write: it sets lastChecked from TAX_SOURCES.reviewed (never edit data/freshness.json by hand).
  - [ ] Regenerate the worked examples (node scripts/refresh/run.js --only derived). If a constant name, rule block or official URL changed, update scripts/refresh/tax-watch.js, re-capture its fixtures (freshness-probe.yml) and run node --test test/refresh-tax.test.js.
- **Notes:** TAX_SOURCES server/juice.js:958: asOf '2026', reviewed 2026-10-10, verified true, approximate, 1 supporting page(s). Cities using it: 1 (sao-paulo-br). Line numbers are as of the 2026-10-10 working tree; the Juice tax agent is still editing this section (re-run gen.mjs). TAX_SOURCES has 71 keys in the working tree at build time (69 when the lead counted; ES-MD and ES-CT are new). The UI never shows the tax year. manual: no official page with a stable machine-readable table was found; checked by hand against the official source; approximate model

</details>

<details><summary><code>rents-1br-quoted</code>: 1-bedroom rent quotes, city centre and outside the centre, for 88 cities (Sydney's centre figure is official): Numbeo p…</summary>

- **Type / cadence / mechanism:** static-data · quarterly (+30 days grace) · manual via `scripts/refresh/rents.js`
- **Values:** e.g. San Francisco $3,678.75 / $2,618.75, New York $4,371, London £2,150, Zurich CHF 2,513; page months 2026-05 to 2026-10 (64 of 89 are 2026-09)
- **As of:** 2026-05-01 · last checked -
- **Source:** [Numbeo city pages (crowd-sourced aggregator), read by hand](https://www.numbeo.com/cost-of-living/) (Numbeo terms: reuse not cleared, automated collection prohibited (docs/LIVABILITY.md §4.1))
- **Defined in:** `data/cities.json cities[].rent1brCenterLocal / rent1brOutsideLocal (89 each) + sources.*`, `data/cities.json cities[].rent1brCenterUSD / rent1brOutsideUSD (89 each, = round(local / fxPerUSD))`, `server/juice.js:127 RENT_FIELDS`, `scripts/update-col.js:40 RENT_PAIRS`, `data/cities.json rent1brCenterLocal / rent1brOutsideLocal [col]`, `data/cities.json cities[].rent1brCenterLocal / rent1brOutsideLocal + sources.* (class aggregator, terms numbeo-terms)`, `data/cities.json cities[].rent1brCenterUSD / rent1brOutsideUSD (= round(local ÷ fxPerUSD), re-derived by update-col / fx)`
- **Used in:** `server/juice.js:1295` (drawer Juice block); `public/api.js:713` (API); `public/app.js:2125` (drawer Juice block); `public/app.js:520` (chart); `public/app.js:363` (badge); `public/viz/map.js:290` (map); `docs/LIVABILITY.md:17` (methodology page); `public/app.js:2162` (drawer Juice block); `public/app.js:2185` (drawer Juice block); `docs/LIVABILITY.md:791-807` (methodology page); `docs/LIVABILITY.md:699` (methodology page); `docs/LIVABILITY.md:809` (methodology page); `public/mock-api.js:31` (API); `test/juice.test.js:60` (tests); `server/juice.js:1291` (drawer Juice block); `server/juice.js:1187` (API); `public/app.js:2156` (drawer Juice block); `public/app.js:2178` (drawer Juice block); `public/app.js:2180` (Compare); `public/app.js:364` (badge); `public/viz/map.js:114` (map); `public/features/freshness.js:105` (drawer Juice block); `server/index.js:822` (API); `scripts/build-static.js:717` (API); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:439` (methodology page); `test/juice-household.test.js` (tests); `public/mock-api.js:30` (API); `docs/LIVABILITY.md:491` (methodology page)
- **Validator:** scripts/refresh/rents.js quoteStaleness() (per city and field) and validateRentDoc() (> 25% move of any quote between versions = flag; outside < centre unless already so: Mountain View is the one existing exception); update-col validateDoc on every write
- **Before:** manual (LIVABILITY.md §6 step 2)
- **Checklist:**
  - [ ] Numbeo terms forbid automated collection and do not clear reuse (docs/LIVABILITY.md §4.1); the replacement plan and decision D6 are in §7. Until D6 is decided, re-read the figures by hand only.
  - [ ] For each city below, open sources.rent1brCenterLocal.url and read "1 bedroom apartment in city centre" and "... outside of centre" (local currency).
  - [ ] Update rent1brCenterLocal / rent1brOutsideLocal and set sources.*.asOf to the page month and retrieved to today; keep class "aggregator" and terms "numbeo-terms".
  - [ ] Re-derive the 2- and 3-bedroom rents (1-bedroom × the city's encoded ratio) and the USD fields (local ÷ the city's current fxPerUSD): run `node scripts/refresh/rents.js --reconcile` (no network; `--dry-run` to preview). The monthly refresh does the same on every run. Never use a Big Mac FX rate for this: data/cities.json fx.perUSD is owned by scripts/refresh/fx.js.
  - [ ] Run `node --test test/juice.test.js test/juice-household.test.js test/refresh-col.test.js`. The next refresh recomputes the entry's dueDate in data/freshness.json from the page months; there is no lastChecked to set by hand.
- **Notes:** 15 cities carry audit rows (HUD SAFMR FY2026, Zillow ZORI, Zumper) for cross-checks only. Licence is the open risk (ROADMAP D6). Duplicate of cities.json figures in docs (audit table) and mock-api.js; neither is regenerated. asOf here is the OLDEST page month (2026-05, Reston and Menlo Park); on 2026-10-10, 8 cities are past due (May-June page months). Audit rows (HUD SAFMR, ZORI, Zumper) for 15 cities are cross-checks only. SF is ~16% below 2026 listings (LIVABILITY §4.2). For a manual entry the refresh's "ok" means "not yet due", not "re-read".

</details>

<details><summary><code>rents-bedroom-ratios</code>: The bedroomRatios table as a whole and the derived 2- and 3-bedroom city-centre rents of all 89 cities, incl. the poole…</summary>

- **Type / cadence / mechanism:** derived-at-build · monthly (+14 days grace) · auto via `scripts/refresh/rents.js`
- **Values:** 45 ratio entries; pooled 1.281 / 1.533 (33 cities); 88 cities estimated (1-bedroom × ratio), Sydney official
- **As of:** 2026-10-01 · last checked 2026-10-10
- **Source:** [Derived: 1-bedroom quote × official bedroom ratio (sources …](https://github.com/alvations/melon-seek/blob/main/docs/LIVABILITY.md#42-rent-by-number-of-bedrooms) (derived; inherits terms "numbeo-terms" of the 1-bedroom figure)
- **Defined in:** `data/cities.json bedroomRatios (r2, r3 per key)`, `data/cities.json cities[].rent2brCenterLocal/USD, rent3brCenterLocal/USD (89 each; sources.*.ratio, ratioKey, method)`, `data/cities.json bedroomRatios [col]`, `data/cities.json bedroomRatios (45 entries incl. pooled)`, `data/cities.json cities[].rent2brCenterLocal/USD, rent3brCenterLocal/USD (89 each) + sources.*.ratio, ratioKey, method`, `scripts/update-col.js:40 RENT_PAIRS, validateDoc`, `server/juice.js:127 RENT_FIELDS`
- **Used in:** `server/juice.js:1295` (drawer Juice block); `public/app.js:2065` (drawer Juice block); `docs/LIVABILITY.md:739` (methodology page); `docs/LIVABILITY.md:758-777` (methodology page); `docs/LIVABILITY.md:705` (methodology page); `public/app.js:2152` (drawer Juice block); `server/juice.js:1291` (drawer Juice block); `server/juice.js:1187` (API); `public/app.js:2156` (drawer Juice block); `public/app.js:2178` (drawer Juice block); `public/app.js:2180` (Compare); `public/app.js:364` (badge); `public/app.js:520` (chart); `public/viz/map.js:114` (map); `public/features/freshness.js:105` (drawer Juice block); `server/index.js:822` (API); `scripts/build-static.js:717` (API); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:439` (methodology page); `test/juice-household.test.js` (tests)
- **Validator:** scripts/refresh/rents.js validateFamily() (1 < 2 < 3 bedroom levels; ratio move > 15% or level move > 25% between releases = flag; release not in the future or older than encoded) and validateRentDoc() (update-col validateDoc: 1 < 2 < 3 rents, dated classed https sources, USD = local / FX; city count and keys unchanged; outside < centre unless already so; no asOf in the future; every source has c…
- **Before:** manual (docs/process/scripts/juice-household-rents.mjs)
- **Checklist:**
  - [ ] HUD publishes FY FMRs each August/September (FY2027 FMRs effective 2026-10-01): re-derive the 30 US ratios.
  - [ ] Quarterly sources (ONS, StatCan, NSW, SG): re-derive on each release.
  - [ ] freshness-col owns it; after a change regenerate LIVABILITY.md §4.2 list (hand-written) and juice-worked-examples.
  - [ ] Recomputed by scripts/refresh/rents.js whenever a family changes and reconciled on every run (2/3-bedroom = 1-bedroom × the encoded ratio, USD at the city's FX). By hand: edit the bedroomRatios entry in data/cities.json, then node scripts/refresh/rents.js --reconcile and node --test test/juice-household.test.js test/refresh-col.test.js. docs/process/scripts/juice-household-rents.mjs is the historical one-time builder; do not re-run it.
- **Notes:** HUD FY2027 FMRs take effect 2026-10-01, so the US ratios (asOf 2025-10, FY2026) are likely due now (unverified). One city (Sydney) has official 2/3-bedroom figures and no ratioKey. Field format still being changed by the household agent. The pooled ratio is recomputed only when one of its six members changes (from the unrounded ratios read in the same run, else the stored 3-decimal ones), so an unrelated run never moves 33 cities by a cent. Its asOf is the month it was last recomputed. The derived rents inherit the Numbeo terms flag of the 1-bedroom quote (D6).

</details>

<details><summary><code>rents-nsw-official</code>: NSW Rent and Sales Report: median weekly rent for new bonds, City of Sydney LGA, flats/units, 1/2/3 bedrooms: Sydney's …</summary>

- **Type / cadence / mechanism:** fetched · quarterly (+60 days grace) · auto via `scripts/refresh/rents.js`
- **Values:** June quarter 2026: A$819 / A$1,150 / A$1,550 a week = A$3,549 / A$4,983.33 / A$6,716.67 a month; ratio 1.404 / 1.893
- **As of:** 2026-06-01 · last checked 2026-10-10
- **Source:** [NSW Department of Communities and Justice, Rent and Sales R…](https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html) (CC BY 4.0 per the data.nsw.gov.au listing (unverified: the DCJ report PDFs say © Crown Copyright with LPI-licensed sale…)
- **Defined in:** `data/cities.json cities[key=sydney-nsw-au].rent1brCenterLocal/rent2brCenterLocal/rent3brCenterLocal (class official)`, `data/cities.json bedroomRatios["AU-sydney"]`, `data/cities.json sydney-nsw-au rent*CenterLocal [col]`, `data/cities.json cities[key=sydney-nsw-au].rent1brCenterLocal/rent2brCenterLocal/rent3brCenterLocal + USD + sources (class official)`, `data/cities.json cities melbourne-vic-au rent2br/3br (ratioKey AU-sydney)`
- **Used in:** `server/juice.js:1295` (drawer Juice block); `docs/LIVABILITY.md:706` (methodology page); `docs/LIVABILITY.md:749` (methodology page); `docs/LIVABILITY.md:222` (methodology page); `server/juice.js:1291` (drawer Juice block); `server/juice.js:1187` (API); `public/app.js:2156` (drawer Juice block); `public/app.js:2178` (drawer Juice block); `public/app.js:2180` (Compare); `public/app.js:364` (badge); `public/app.js:520` (chart); `public/viz/map.js:114` (map); `public/features/freshness.js:105` (drawer Juice block); `server/index.js:822` (API); `scripts/build-static.js:717` (API); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:439` (methodology page); `test/juice-household.test.js` (tests); `docs/LIVABILITY.md:213` (methodology page)
- **Validator:** scripts/refresh/rents.js validateFamily() (1 < 2 < 3 bedroom levels; ratio move > 15% or level move > 25% between releases = flag; release not in the future or older than encoded) and validateRentDoc() (update-col validateDoc: 1 < 2 < 3 rents, dated classed https sources, USD = local / FX; city count and keys unchanged; outside < centre unless already so; no asOf in the future; every source has c…
- **Before:** manual (docs/process/scripts/juice-household-rents.mjs DIRECT table)
- **Checklist:**
  - [ ] Download the quarter's rent tables xlsx, Sydney LGA, flats and units, new bonds, 1/2/3 bedrooms.
  - [ ] freshness-col owns it; hand-written doc figures follow.
  - [ ] Open the NSW Rent and Sales Report page and download the newest "Rent tables <month> <year> quarter" xlsx.
  - [ ] Sheet LGA, Local Government Area "Sydney", Dwelling Types Flat/Unit: median weekly rent for new bonds, 1/2/3 bedrooms (and Postcode 2000 for the cross-check).
  - [ ] Monthly = weekly × 52 ÷ 12: update Sydney's rent1/2/3brCenterLocal + sources (name, asOf, file, note), bedroomRatios AU-sydney; re-derive Melbourne, the pooled ratio and the USD fields; run the Juice tests.
- **Notes:** Only official-class rent in the dataset. Released about 7 weeks after each quarter (June 2026 tables: file dated 2026-08-17); September 2026 tables expected mid-November 2026. Auto when the xlsx (3.4 MB) parses (reader verified on the real file, fixture trimmed to the Sydney and postcode 2000 rows); otherwise drift with this checklist.

</details>

<details><summary><code>cost-index</code>: Per-city cost index (living costs excluding rent, New York = 100): 100 × the city's Numbeo single-person estimate exclu…</summary>

- **Type / cadence / mechanism:** static-data · quarterly (+30 days grace) · manual via `scripts/refresh/living.js`
- **Values:** e.g. SF 91.0, London 86.3, Columbus 73.2, Zurich 111.7; 78 aggregator + 11 estimate (9 metro proxies, Boulder and Hyderabad comparison-derived); page months 2026-06 to 2026-10
- **As of:** 2026-06-01 · last checked -
- **Source:** [Numbeo city pages: "estimated monthly costs for a single pe…](https://www.numbeo.com/cost-of-living/) (Numbeo terms: reuse not cleared, automated collection prohibited (docs/LIVABILITY.md §4.1))
- **Defined in:** `data/cities.json cities[].costIndex (89) + sources.costIndex (method, crossCheck)`, `data/cities.json costIndex [col]`, `data/cities.json cities[].costIndex (89) + sources.costIndex (method, crossCheck, class aggregator / estimate, terms numbeo-terms)`
- **Used in:** `server/juice.js:1231` (drawer Juice block); `server/juice.js:1257` (drawer Juice block); `public/app.js:2125` (drawer Juice block); `public/app.js:520` (chart); `public/app.js:363` (badge); `public/viz/map.js:290` (map); `docs/LIVABILITY.md:17` (methodology page); `public/app.js:2163` (drawer Juice block); `docs/LIVABILITY.md:726` (methodology page); `docs/LIVABILITY.md:857-862` (methodology page); `server/juice.js:1254` (API); `public/app.js:2157` (drawer Juice block); `public/app.js:2180` (Compare); `public/app.js:364` (badge); `public/viz/map.js:114` (map); `public/features/freshness.js:137` (drawer Juice block); `server/index.js:822` (API); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:552` (methodology page); `test/juice.test.js:151` (tests)
- **Validator:** scripts/refresh/living.js costIndexStaleness() (per city); test/juice.test.js (every city has a dated, classed costIndex source); test/juice-household.test.js
- **Before:** manual (LIVABILITY.md §6 step 2)
- **Checklist:**
  - [ ] costIndex is an aggregator figure (Numbeo single-person estimate excluding rent ÷ New York's); the terms forbid automated collection and do not clear reuse (docs/LIVABILITY.md §4.1). Decision D6 (§7) is open: until then re-read by hand only.
  - [ ] For each city below, open sources.costIndex.url, read "Estimated monthly costs for a single person (without rent)" (USD if shown, else EUR ÷ New York's EUR figure, else local ÷ fxPerUSD), and set costIndex = 100 × city ÷ New York (one decimal is enough); update sources.costIndex.method, asOf (page month) and retrieved.
  - [ ] Re-read New York first: if its basket changed, update baseline.nycBasketUSD in data/cities.json AND NYC_BASKET_USD in server/juice.js (test/juice.test.js keeps them equal), then every city's costIndex.
  - [ ] Metro proxies (Costa Mesa, Reston, Palo Alto, Sunnyvale, Mountain View, Menlo Park, Bellevue, Redmond, Cambridge MA) copy their metro's index; Boulder and Hyderabad are comparison-derived (docs/LIVABILITY.md §4 "Estimates").
  - [ ] Official replacement (D6, not automatic yet): US metros from BEA Regional Price Parities (goods + other services, i.e. excluding housing; needs BEA_API_KEY), rescaled to New York MSA = 100; EU/EFTA from Eurostat price level indices (prc_ppp_ind, household consumption excluding housing); elsewhere World Bank ICP 2021 price levels extrapolated with CPI.
  - [ ] Run `node --test test/juice.test.js test/juice-household.test.js`. The next refresh (or `node scripts/refresh/run.js --only living --offline`) recomputes the entry's dueDate in data/freshness.json from the page months; there is no lastChecked to set by hand.
- **Notes:** 11 estimated values (suburbs proxied from a nearby city: costa-mesa-ca-us, reston-va-us, palo-alto-ca-us, sunnyvale-ca-us, mountain-view-ca-us, menlo-park-ca-us, bellevue-wa-us, redmond-wa-us, cambridge-ma-us, boulder-co-us, hyderabad-in). A move in nyc-basket changes every city's living cost even with costIndex unchanged. asOf is the OLDEST page month (2026-06: 5 cities, the metro proxies for Irvine and Arlington among them, are past due on 2026-10-10). A move in nyc-basket changes every city's living cost with costIndex unchanged. No official proxy is wired yet: that is the D6 decision, plu…

</details>

<details><summary><code>nyc-basket</code>: NYC single-person living-cost baseline excluding rent ($1,665.2 a month × 12 = $19,982 a year, Numbeo New York, page mo…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · monthly (+21 days grace) · detect via `scripts/refresh/living.js`
- **Values:** $19,982 a year ($1,665.2 a month), Numbeo 2026-09; CPI-U NY less shelter Aug 2026 307.227
- **As of:** 2026-09-01 · last checked 2026-10-10
- **Source:** [Numbeo, Cost of Living in New York (single person, excludin…](https://www.bls.gov/cpi/regional-resources.htm) (Numbeo terms (not cleared); BLS data public domain)
- **Defined in:** `server/juice.js:79 NYC_BASKET_USD`, `data/cities.json baseline.nycBasketUSD / monthlyUSD / sources.nycBasketUSD`, `data/cities.json baseline.nycBasketUSD; server/juice.js NYC_BASKET_USD [core/col]`, `data/cities.json baseline.nycBasketUSD / monthlyUSD / sources.nycBasketUSD (and the BLS CE crossCheck)`
- **Used in:** `server/juice.js:1229` (drawer Juice block); `server/juice.js:1428` (API); `docs/LIVABILITY.md:29` (methodology page); `docs/LIVABILITY.md:701` (methodology page); `public/mock-api.js:31` (API); `server/juice.js:1424` (API); `public/app.js:2157` (drawer Juice block); `public/viz/map.js:114` (map); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:168` (methodology page); `public/mock-api.js:30` (API); `test/juice.test.js:394` (tests)
- **Validator:** scripts/refresh/living.js: extractConst(server/juice.js, NYC_BASKET_USD) === baseline.nycBasketUSD; cpiChange() between the page month and the latest CPI month, \|change\| >= BASKET_DRIFT (3%) = drift; test/juice.test.js:394; test/refresh-col.test.js
- **Before:** manual (LIVABILITY.md §6 step 2)
- **Checklist:**
  - [ ] See freshness-col (living.js); keep server/juice.js NYC_BASKET_USD = data/cities.json baseline.nycBasketUSD.
  - [ ] See freshness-col; when it changes, the worked examples (juice-worked-examples) and mock LIVING table drift.
  - [ ] Drift means NY CPI-U less shelter moved 3% or more since the basket's page month, or the two copies disagree. The finding carries the CPI-indexed figure.
  - [ ] Either re-read Numbeo New York by hand, or adopt the CPI-indexed figure as an interim (say so in sources.nycBasketUSD.method).
  - [ ] Change BOTH data/cities.json baseline.nycBasketUSD (+ monthlyUSD, sources.nycBasketUSD) and server/juice.js NYC_BASKET_USD (test/juice.test.js:394 keeps them equal); regenerate the LIVABILITY §1 worked examples; npm test.
- **Notes:** Duplicated in code and data (a test keeps them equal). Changing it re-scores every job (Juice per job). Series CUURS12ASA0L2 = CPI-U (CU), not seasonally adjusted (U), monthly (R), area S12A New York-Newark-Jersey City NY-NJ-PA, item SA0L2 all items less shelter; the BLS v1 API returned it on 2026-10-10 (Aug 2026 307.227) but v1 has no catalog, so the title is from the series-id convention (unverified on the BLS page). v1 allows 25 series and about 25 requests a day per IP; the refresh makes one request. The baseline already lives in data/cities.json; NYC_BASKET_USD in server/juice.js is only…

</details>

<details><summary><code>living-scale</code>: Household living-cost scale LIVING_SCALE: after-housing-costs modified OECD equivalence scale (DWP HBAI: first adult 0.…</summary>

- **Type / cadence / mechanism:** product-policy · yearly (+60 days grace) · detect via `scripts/refresh/living.js`
- **Values:** weights 0.58 / 0.42 / 0.20; couple 1.724, family 2.414; BLS CE 2024 cross-check 1.80 / 2.41 (one $23,261, two $41,922, four $56,160)
- **As of:** 2024-01-01 · last checked 2026-10-10
- **Source:** [UK DWP Households Below Average Income, modified OECD scale…](https://www.gov.scot/publications/poverty-in-scotland-methodology/pages/income-equivalisation/) (OGL v3; BLS public domain)
- **Defined in:** `server/juice.js:97 LIVING_SCALE`, `server/juice.js:120 livingScaleFor`, `server/juice.js:16 inputs.household.source.asOf '2026' (hard-coded)`, `server/juice.js LIVING_SCALE [core/col]`, `server/juice.js:16 inputs.household.source.asOf "2026" (literal)`
- **Used in:** `server/juice.js:1230` (drawer Juice block); `docs/LIVABILITY.md:70` (methodology page); `docs/LIVABILITY.md:29` (methodology page); `docs/LIVABILITY.md:76-83` (methodology page); `test/juice-household.test.js:40` (tests); `test/juice-household.test.js:88` (tests); `public/app.js:2157` (drawer Juice block); `public/features/freshness.js:137` (drawer Juice block); `docs/LIVABILITY.md:51` (methodology page)
- **Validator:** scripts/refresh/living.js parseEquivalenceTable() (HBAI AHC weights on the gov.scot page must equal LIVING_SCALE) and ceRatios() (newer CE year than the one cited in server/juice.js = drift); test/juice-household.test.js
- **Before:** none
- **Checklist:**
  - [ ] Review yearly against the DWP HBAI methodology; cross-checks in the LIVING_SCALE comment (BLS CE 2024, MIT Living Wage).
  - [ ] Yearly (BLS CE release, ~September): re-read CXU*LB05* series and update the LIVABILITY.md §1 cross-check table; the scale itself only changes if DWP changes the equivalence scale.
  - [ ] Product policy: never auto-updated. Review yearly, when BLS publishes a new CE year (usually September) or DWP changes the scale; the refresh alerts on either.
  - [ ] Compare the CE ratios in the finding with the scale (couple 1.72, family 2.41); a gap of more than ~15% is a reason to discuss the scale.
  - [ ] If it changes: LIVING_SCALE + comment (server/juice.js), LIVABILITY §1 households table, test/juice-household.test.js, then set lastChecked here.
- **Notes:** A convention, not a time series: changes only if DWP changes the scale. The asOf shown to users is the literal string "2026" (not a date). BLS CE 2025 annual tables were not in the API on 2026-10-10 ("No Data Available ... Year: 2025"), so the cross-check year stays 2024. The CE ratios carry an income effect (an upper check). The asOf shown to users is the literal "2026" in computeJuice inputs.household.source. HOUSEHOLDS (presets) is the separate policy entry "households". asOf is the BLS Consumer Expenditure Survey year the scale is cross-checked against (2024), not the check date; the HBAI…

</details>

<details><summary><code>job-salary-parsed</code>: Per-job posted pay in its native currency and the honest-number labels around it.</summary>

- **Type / cadence / mechanism:** fetched · daily (+2 days grace) · detect via `pipeline: server/salary.js + adapters inside the daily snapshot; monthly check scripts/refresh/jobs.js`
- **Values:** salary { min, max, mid (annualized), currency, interval: "year", text, originalInterval, kind, source, spread, zones, ranges? }; 4,551 of 5,413 postings salaried after the gate on 2026-10-02
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [Company job boards (Greenhouse, Ashby, Lever; big-tech care…](https://alvations.github.io/melon-seek/) (public job postings; facts only, links to the original postings)
- **Defined in:** `server/normalize.js:84 deriveSalary (structured vs text, ranges.slice(0,12), tier span <= 3x)`, `server/salary.js:794 parseSalary`, `server/salary.js:928 toJobSalary (mid = round((min+max)/2), spread = max/min)`, `server/sources/greenhouse.js:50 payRanges (cents / ZERO_DECIMAL)`, `server/sources/amazon.js:37 Amazon PAY_LINE_RE`, `server/sources/ashby.js:1 Ashby compensation`, `server/sources/lever.js:1 Lever salaryRange`, `server/sources/meta.js:1 Meta currency map`, `server/salary.js + adapters [jobs/core]`
- **Used in:** `public/app.js:383` (chart); `scripts/build-market.js:51` (Same role elsewhere); `scripts/build-static.js:434` (OG image); `server/export.js:48` (API); `server/juice.js:1411` (drawer Juice block); `public/app.js:1920` (badge); `public/app.js:2322` (drawer Juice block); `public/app.js:2215` (drawer Juice block); `public/app.js:2279` (drawer Juice block); `public/viz/chart.js:981` (chart); `public/features/compstimate.js:565` (Compstimate); `server/juice.js:1407` (drawer Juice block); `public/app.js:2315` (drawer Juice block); `public/app.js:2208` (drawer Juice block); `public/app.js:2272` (drawer Juice block)
- **Validator:** scripts/refresh/jobs.js job-salary-parsed (pay share drop <= 15 points); test/salary.test.js; test/fixtures/real-salary-cases.json
- **Before:** daily job-board pipeline
- **Checklist:**
  - [ ] Covered by the vetting gate; see salary-vetting-flags.
  - [ ] Monthly (jobs.js job-salary-parsed): a company's share of postings with pay must not fall more than 15 points month over month (parser or adapter regression); read the interval and source mix in the findings.
- **Notes:** Depends on salary-interval-factors (annualizing), salary-parser-bounds and fx-per-usd (bounds compared in USD). The parsed salary is in the posting currency; USD is derived per consumer (job-salary-usd).

</details>

<details><summary><code>salary-interval-factors</code>: Annualization factors used client-side and stated in docs (hourly × 2080, monthly × 12, weekly × 52).</summary>

- **Type / cadence / mechanism:** product-policy · yearly (+60 days grace) · manual via `scripts/refresh/policy.js`
- **Values:** 2080 hours/yr, 12 months, 52 weeks
- **As of:** 2026-10-02 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/salary.js:51 FACTORS`, `server/vet.js:18 hourly rate /2080`, `scripts/vet-salaries.js:120 FACT (copy)`, `scripts/vet-salaries.js:294 UNFACT (copy)`, `data/vetting/2026-10-02/review-rules.mjs:18 F (copy, audit trail)`, `server/export.js:62 csvReadme text`, `public/features/shared.js:45 salaryUSD defensive annualization (2080 h if mid < 1000, ×12 if mid < 30000): duplicate of server/salary.js annualize`, `public/viz/chart.js:52 INTERVAL_ADJ labels`, `public/app.js:3002 INTERVAL_ADJ labels`
- **Used in:** `server/salary.js:36` (chart); `README.md:501` (README); `docs/VETTING.md:199` (docs); `docs/LIVABILITY.md:249` (methodology page); `docs/VETTING.md:198` (docs); `test/features.test.js:104` (tests); `docs/LIVABILITY.md:236` (methodology page)
- **Validator:** scripts/refresh/policy.js salary-interval-factors; test/salary.test.js
- **Before:** none
- **Checklist:**
  - [ ] Change all copies together (salary.js, vet.js, vet-salaries.js x2, export.js README text, README, VETTING.md).
  - [ ] Change server/salary.js and public/features/shared.js together.
  - [ ] Monthly consistency check (policy.js): scripts/vet-salaries.js FACT and UNFACT, data/vetting/2026-10-02/review-rules.mjs F, server/vet.js "/ 2080" and public/features/shared.js salaryUSD use server/salary.js FACTORS.
- **Notes:** Proposed cadence yearly (was ad-hoc): conventions rarely change, but a yearly look keeps the copies honest. 2026-10-02: 310 of 4,551 published salaries annualized (hour 272, month 38). \| 6 copies in code/data plus 2 docs; no test ties them together.

</details>

<details><summary><code>salary-parser-bounds</code>: Salary parser plausibility bounds (annual USD) and tier/range heuristics</summary>

- **Type / cadence / mechanism:** product-policy · yearly (+60 days grace) · manual via `scripts/refresh/policy.js`
- **Values:** MIN_ANNUAL 10000, MAX_ANNUAL 1200000, HARD_MAX_ANNUAL 5000000, PLAUSIBLE_ANNUAL_MIN 15000, TIER_GAP 130 chars, TIER_MAX_RATIO 3, national span 4x, hi < 1000 -> hourly, hi < 10000 with a range -> monthly, Greenhouse MAX_TIER_SPAN 3
- **As of:** 2026-10-02 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/salary.js:44 MIN_ANNUAL`, `server/salary.js:45 MAX_ANNUAL`, `server/salary.js:46 HARD_MAX_ANNUAL`, `server/salary.js:47 PLAUSIBLE_ANNUAL_MIN`, `server/salary.js:48 TIER_GAP`, `server/salary.js:49 TIER_MAX_RATIO`, `server/salary.js:397 national-range span <= 4x`, `server/salary.js:365 unstated interval heuristics`, `server/normalize.js:80 payRanges currency pick <= 3x`, `server/sources/greenhouse.js:37 MAX_TIER_SPAN`
- **Used in:** `server/normalize.js:76` (chart); `docs/VETTING.md:38` (docs)
- **Validator:** scripts/refresh/policy.js salary-parser-bounds; test/salary.test.js
- **Before:** none
- **Checklist:**
  - [ ] Yearly: check the bounds still sit outside the real salaried distribution (min/max of vetted USD mids per company); nominal USD bounds erode with wage inflation.
  - [ ] Monthly data check (policy.js): salary.js MAX_ANNUAL = vet.js VET.MAX_ANNUAL, PLAUSIBLE_ANNUAL_MIN = VET.MIN_ANNUAL_FULLTIME, TIER_MAX_RATIO = greenhouse.js MAX_TIER_SPAN; docs/VETTING.md §2 figures; published pay within 10% of MIN_ANNUAL / MAX_ANNUAL under 1%.
- **Notes:** Compared in USD via salary.js USD_PER, so they move with fx-per-usd.

</details>

<details><summary><code>salary-vetting-bounds</code>: Vetting bounds as restated in docs and mock copy (owner server/vet.js).</summary>

- **Type / cadence / mechanism:** product-policy · quarterly (+30 days grace) · manual via `scripts/refresh/policy.js`
- **Values:** above_max $1.2M, below_min $15K full-time, hourly_high $250/hr ($200/hr full-time), range_ratio 4×, junior_high $300K, senior_low $60K, robust z 3.5 / −4.5, σ floor 0.4; text candidates $10K–$1.2M; toJobSalary $10K–$5M
- **As of:** 2026-10-02 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/vet.js:30 VET`, `server/vet.js:51 CRITICAL_CODES`, `server/vet.js:66 JUNIOR_RE / SENIOR_RE`, `server/vet.js:57 PART_TIME_RE`, `scripts/vet-salaries.js:178 CRITICAL_FLAGS (scan)`, `scripts/vet-salaries.js:216 ratio_over_3 etc.`, `server/vet.js, server/salary.js [jobs/core]`
- **Used in:** `server/vet.js:239` (chart); `server/vet.js:266` (Compstimate); `.github/workflows/pages.yml:112` (API); `docs/VETTING.md:84` (docs); `docs/VETTING.md:93-99` (docs); `docs/VETTING.md:109` (docs); `public/mock-api.js:180` (API); `test/vet-gate.test.js:39` (tests); `test/salary.test.js:298` (tests)
- **Validator:** scripts/refresh/policy.js salary-vetting-bounds; test/vet-gate.test.js; test/salary.test.js
- **Before:** none
- **Checklist:**
  - [ ] Yearly (or after a new reviewed sample): rerun node scripts/vet-salaries.js --sample 25 --seed 20261002, review, and re-justify each threshold in docs/VETTING.md.
  - [ ] MAX_ANNUAL must equal salary.js MAX_ANNUAL.
  - [ ] Monthly data check (policy.js): published pay within 10% of each quarantine bound (above_max, below_min, range_ratio, hourly_high) stays under 1% of salaried postings; the highest published max and widest range vs the figures docs/VETTING.md cites; docs/VETTING.md §3 figures equal server/vet.js VET (11 figures).
- **Notes:** 2026-10-02: no published pay within 10% of a bound; highest published max $862,685 (doc says $850K), widest range 3.4x. \| Nominal USD thresholds ($1.2M, $15K, $300K junior, $60K senior, $200/$250 per hour) need a yearly inflation/market review. MAX_ANNUAL duplicated in salary.js and vet.js.

</details>

<details><summary><code>salary-vetting-flags</code>: Per-job vetting outcome shown in the UI ("Pay unclear").</summary>

- **Type / cadence / mechanism:** fetched · daily (+2 days grace) · detect via `pipeline: server/vet.js gate + scripts/vet-salaries.js scan in snapshot.yml / pages.yml; monthly check scripts/refresh/jobs.js`
- **Values:** per job: salaryFlag { codes, reason } and salary null when quarantined; per company per tier: critical / quarantined / statistical / review shares (2026-10-02 local snapshots: 51 quarantined; Cohere 39/132 = 29.5%, hourly_high)
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [Company job boards (Greenhouse, Ashby, Lever; big-tech care…](https://alvations.github.io/melon-seek/) (public job postings; facts only, links to the original postings)
- **Defined in:** `server/vet.js:9 salaryFlag / salaryRaw`, `data/vetting/2026-10-02/flags.jsonl (505), sample.jsonl (176), verdicts.jsonl (681), tier-spans.json (59), flags.counts.json, flags.renormalized.*, review-rules.mjs, summary.md`, `scripts/llm-vet.js:38 VERDICT_SCHEMA`, `server/vet.js vetSalaries (job.salaryFlag, salaryRaw) [jobs]`, `scripts/vet-salaries.js:267 scanCompany (flags reused by jobs.js)`, `data/vetting/2026-10-02/tier-spans.json (reviewer tier decisions, 59 jobs)`
- **Used in:** `public/app.js:1161` (drawer Juice block); `scripts/vet-salaries.js:203` (API); `docs/VETTING.md:278` (docs); `public/app.js:1921` (badge); `public/app.js:2201` (drawer Juice block); `public/api.js:747` (API); `public/app.js:2194` (drawer Juice block); `public/api.js:727` (API)
- **Validator:** scripts/refresh/jobs.js salary-vetting-flags (tier shares vs the archived previous month); scripts/vet-salaries.js gate (daily); test/vet-gate.test.js
- **Before:** daily gate and scan; nothing compared months
- **Checklist:**
  - [ ] Quarterly: run a fresh reviewed sample into data/vetting/<date>/ (docs/VETTING.md §6).
  - [ ] Monthly (jobs.js salary-vetting-flags): per company and tier (critical, quarantined, statistical, review) the share of pay-bearing postings vs last month; flag when a share rises 2+ points AND at least doubles (review flags: 10+ points), when more than 10% of a company's pay is quarantined, or when any critical salary is unquarantined (the Pages gate would fail).
  - [ ] For a flagged company: run `node scripts/vet-salaries.js --sample 25` on the latest snapshots and review per docs/VETTING.md §5.
- **Notes:** Tiers: critical = vet-salaries CRITICAL_FLAGS; quarantined = the gate set salaryFlag; statistical = stat_outlier; review = flagged by the scan but neither critical nor quarantined. Local 2026-10-02 snapshots flag Cohere at 29.5% quarantined (the "$500 home office stipend as $500/hr" cluster from before the parser fix); CI snapshots are re-parsed daily. \| DATA LOSS RISK: daily flags/llm-verdicts live only in the salary-vetting artifact (30 days). Only the 2026-10-02 review is in git.

</details>

<details><summary><code>llm-vet-config</code>: Advisory LLM salary review settings: model id, API version, fallback beta, limits</summary>

- **Type / cadence / mechanism:** product-policy · quarterly (+30 days grace) · detect via `scripts/refresh/policy.js`
- **Values:** claude-sonnet-5-5 (VET_LLM_MODEL overrides), anthropic-version 2023-06-01, beta server-side-fallback-2026-07-01 with fallbacks "default", effort medium, max_tokens 4000, 4 retries, concurrency 4, 100 jobs per Pages run
- **As of:** 2026-10-06 · last checked 2026-10-10
- **Source:** [Anthropic Models API (GET /v1/models/{id}) and the model de…](https://docs.anthropic.com/en/docs/about-claude/model-deprecations) (n/a)
- **Defined in:** `scripts/llm-vet.js:33 DEFAULT_MODEL`, `scripts/llm-vet.js:34 API_VERSION`, `scripts/llm-vet.js:35 FALLBACK_BETA`, `scripts/llm-vet.js:151 max_tokens`, `scripts/llm-vet.js:173 retries/backoff`, `.github/workflows/pages.yml:126 --limit 100 per run`
- **Used in:** `.github/workflows/pages.yml:120` (API)
- **Validator:** scripts/refresh/policy.js llm-vet-config
- **Before:** none
- **Checklist:**
  - [ ] With ANTHROPIC_API_KEY: GET https://api.anthropic.com/v1/models and confirm DEFAULT_MODEL is listed and not deprecated; else update the default.
  - [ ] Monthly (policy.js): pages.yml VET_LLM_MODEL default, docs/VETTING.md and scripts/refresh/lib.js REFRESH_LLM_MODEL name the same model as scripts/llm-vet.js DEFAULT_MODEL; with ANTHROPIC_API_KEY the Models API must still list it (404 = drift).
- **Notes:** Checked 2026-10-10 against the claude-api skill model table (cached 2026-10-06): claude-sonnet-5-5 is the current Sonnet; server-side-fallback-2026-07-01 with fallbacks "default" is the current scalar form. Model ids retire on a schedule, so this goes stale.

</details>

<details><summary><code>company-registry</code>: Built-in companies (slug, name, board, colour, channel) as duplicated in UI fallbacks, mock data and docs.</summary>

- **Type / cadence / mechanism:** static-data · ad-hoc (+90 days grace) · detect via `scripts/refresh/jobs.js`
- **Values:** 8 stable (anthropic, anduril, openai, scaleai, xai, cohere, palantir, shieldai) + 7 beta (google, microsoft, meta, apple, netflix, amazon, nvidia)
- **As of:** 2026-10-10 · last checked 2026-10-10
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/companies.js:8 COMPANIES`, `server/companies.js:3 SOURCES`, `server/companies.js:46 CHANNELS`, `server/sources/eightfold.js:25 EIGHTFOLD_BOARDS`, `scripts/probe-bigtech.js:3 probe SLUGS`, `server/companies.js [core]`, `public/app.js:98 FALLBACK_COMPANIES (3 of 8 stable: anthropic, anduril, openai with colours)`, `public/mock-api.js:1 mock COMPANIES (same 3)`
- **Used in:** `server/index.js:792` (API); `scripts/build-static.js:590` (API); `README.md:558` (README); `README.md:16` (README); `docs/strategy/COMPETITIVE_ANALYSIS.md:300` (docs); `README.md:369` (README)
- **Validator:** scripts/refresh/jobs.js company-registry (registry vs snapshots vs live site)
- **Before:** none
- **Checklist:**
  - [ ] Monthly: a board that returns 0 jobs for a week (snapshot.yml logs) is a candidate for removal; README/docs company counts follow.
  - [ ] When server/companies.js changes: README company sentence, app.js FALLBACK_COMPANIES (offline fallback) and mock COMPANIES.
  - [ ] Monthly (jobs.js company-registry): every stable built-in company has a snapshot; the live api/companies.json lists the same stable companies as server/companies.js; snapshots of companies not in the registry are reported.
  - [ ] Adding or removing a company: server/companies.js, then docs/ADDING_A_BOARD.md; README company counts are derived (readme-counts).
- **Notes:** Company count appears in README/docs/OG copy (readme-counts, og-card). Finding 1: README names 3 built-ins, server/companies.js has 8 stable + 7 beta (fix in readme-counts). app.js FALLBACK_COMPANIES (used only when /api/companies fails) also lists 3; PROPOSED test: FALLBACK_COMPANIES slugs/colours ⊆ listCompanies().

</details>

<details><summary><code>company-aggregates</code>: Per-company and per-group aggregates the UI computes (median, p25/p75, pay share, remote share, top department, cluster…</summary>

- **Type / cadence / mechanism:** derived-at-build · daily (+2 days grace) · detect via `pipeline: computed at build / in the browser from the vetted list; monthly check scripts/refresh/jobs.js`
- **Values:** per company: postings, salaried, quarantined, pay share, remote share, USD midpoint p10/p25/p50/p75/p90, currency, interval and level mix (2026-10-02: Anthropic median $352,500, OpenAI $307,500, Anduril $170,000, ...)
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [derived from the vetted job snapshots (daily build)](https://alvations.github.io/melon-seek/api/market.json) (derived; facts from public job postings)
- **Defined in:** `scripts/build-market.js:4 market companies[] {jobs, salaried, used}`, `scripts/build-static.js:441 shareStats {roles, withPay, median}`, `server/export.js:62 csvReadme rows`, `data/vetting/2026-10-02/flags.counts.json {jobs, salaried, quarantined, flagged, critical, blocking}`, `server/history.js:279 ledgerMeta {since, runs}`, `public/app.js:537`, `public/features/insights.js:38`, `public/viz/chart.js:10 cluster rows`, `public/viz/map.js:390 pin summaries`, `scripts/refresh/jobs.js companyStats (monthly aggregate)`
- **Used in:** `scripts/build-static.js:451` (OG image); `public/features/comps.js:207` (Same role elsewhere); `public/app.js:1345` (Insights); `public/app.js:1537` (badge); `public/features/insights.js:333` (Insights); `public/viz/chart.js:414` (chart); `public/viz/map.js:410` (map); `scripts/build-static.js:434` (OG image); `archive reference/jobs-aggregates/<date>.json companies[]` (API)
- **Validator:** scripts/refresh/jobs.js company-aggregates (median move <= 15% month over month)
- **Before:** computed per build; no month-over-month view
- **Checklist:**
  - [ ] None; regenerated each build. Static copies in README/docs are readme-counts / docs-counts.
  - [ ] Monthly (jobs.js company-aggregates): a company median moving 15%+ in a month (with 30+ salaried) is flagged; check FX, the parser and the vetting gate before trusting it.
- **Notes:** Share-page medians use salary.js FX (vet.js toUSD); market comps use palette FX: equal today. Only the latest values exist; history needs the archive (per-company monthly aggregates). No as-of next to any aggregate except the data badge ("Snapshot · <date>").

</details>

<details><summary><code>market-comps</code>: Market comps (company × family × seniority: n, p25/median/p75 USD) in "Same role elsewhere" (drawer) and "Compare compa…</summary>

- **Type / cadence / mechanism:** derived-at-build · daily (+2 days grace) · detect via `pipeline: scripts/build-static.js -> buildMarket (daily Pages build), GET /api/market; monthly check scripts/refresh/jobs.js`
- **Values:** company x family x seniority cells with n >= 3 (plus "*" family roll-ups): n, p25, median, p75 of USD midpoints rounded to $100; 391 cells over 8 companies and 26 families on 2026-10-02 (live site 2026-10-10: 379 cells)
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [derived from the vetted job snapshots (daily build)](https://alvations.github.io/melon-seek/api/market.json) (derived; facts from public job postings)
- **Defined in:** `scripts/build-market.js:47 MIN_N`, `scripts/build-market.js:62 round100`, `scripts/build-market.js:54 percentileSorted (linear)`, `scripts/build-market.js:75 buildMarket`, `scripts/build-static.js:124 MARKET_MAX_BYTES`, `scripts/build-market.js MIN_N 3, round100 [jobs]`, `public/features/comps.js:101 compsForJob: family+seniority, falls back to the family across levels`, `public/features/comps.js:208 defaultFamily: families covered by ≥ 2 companies`
- **Used in:** `server/index.js:823` (API); `public/api.js:677` (API); `public/features/comps.js:207` (Same role elsewhere); `public/app.js:2433` (Same role elsewhere); `public/app.js:2450` (Same role elsewhere); `public/viz/comps.js:41` (Same role elsewhere); `public/features/comps.js:172` (Compare); `public/features/comps.js:207` (Compare); `public/mock-api.js:275` (API); `public/features/demo-data.js:128` (API); `test/features.test.js:547` (tests); `test/market.test.js:87` (tests); `public/api.js:661` (API); `public/app.js:2426` (Same role elsewhere); `public/app.js:2443` (Same role elsewhere)
- **Validator:** scripts/refresh/jobs.js market-comps (live generatedAt <= 3 days, agreement); test/market.test.js
- **Before:** rebuilt by every Pages build; no staleness or agreement check
- **Checklist:**
  - [ ] None; regenerated each build.
  - [ ] Monthly (jobs.js market-comps): buildMarket() recomputed from the newest snapshots; the live api/market.json (and beta/api/market.json) must be generated within 3 days; shared cells and medians within 5% are reported.
  - [ ] Policy constants (minN, rounding, fallback) are reviewed under market-comps-policy.
- **Notes:** The monthly cells are archived inside jobs-aggregates (market.stable / market.all). \| Cross-level comparisons depend on seniority-ladder and role-families; a lexicon change re-buckets every cell. No history of cells is kept (archive). Cross-level caveat: server/keywords.js inferSeniority returns "Mid" for unlevelled titles (41% of postings, CORPORATE_LADDER_PLAN.md), so the "Mid" cells mix real Mid roles with unlevelled ones; roles.js inferSeniority returns null instead. Depends on fx-per-usd (USD cells) and role-families. Cross-level caveat (review, 2026-10-10): big-tech postings often stat…

</details>

<details><summary><code>compstimate-backtest</code>: Published Compstimate accuracy: seeded leave-one-out backtest per company → "Typically within ±X% (tested on N listed s…</summary>

- **Type / cadence / mechanism:** derived-at-build · daily (+2 days grace) · detect via `pipeline: scripts/build-static.js ctx.enrich backtest() per company (daily), server/index.js worker; monthly check scripts/refresh/jobs.js`
- **Values:** per company { medianAbsPctError, within10Pct, n, seed 20261002, maxN 500, dedupe "role" } shown as "Typically within ±N% (tested on N listed salaries)"; live 2026-10-10: Anduril 11.9% (499), Anthropic 14.2% (498), Cohere 8.1% (80), OpenAI 9.8% (499), Palantir 6.7% (232), Scale AI 11.1% (123), Shield AI 15.9% (485), xAI 20.5% (126)
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [derived from the vetted job snapshots (daily build)](https://alvations.github.io/melon-seek/api/market.json) (derived; facts from public job postings)
- **Defined in:** `server/index.js:315 BACKTEST_OPTS`, `scripts/build-static.js:122 BACKTEST_FALLBACK`, `server/index.js:345 BACKTEST_TIMEOUT_MS`, `server/index.js:317 BACKTEST_WAIT_MS`, `server/index.js:66 worker memory`, `public/features/compstimate.js:448 backtest() defaults`, `public/features/compstimate.js:409 ACCURACY_LOW_THRESHOLD`, `public/features/compstimate.js:407 BACKTEST_SEED`, `public/features/compstimate.js:409 ACCURACY_LOW_THRESHOLD 25%`, `public/features/compstimate.js:8 maxN 500, dedupe 'title' default`, `server/index.js:315 BACKTEST_OPTS {seed 20261002, maxN 500, dedupe "role"}`, `scripts/build-static.js:122 BACKTEST_FALLBACK {seed, maxN} (no dedupe → "title")`, `public/features/compstimate.js:448 backtest`
- **Used in:** `server/index.js:304` (Compstimate); `scripts/build-static.js:759` (Compstimate); `public/app.js:2276` (Compstimate); `README.md:187` (README); `public/features/compstimate.js:387` (Compstimate); `public/features/compstimate.js:735` (Compstimate); `public/mock-api.js:248` (API); `test/features.test.js:459` (tests); `public/app.js:2269` (Compstimate); `https://alvations.github.io/melon-seek/api/meta/<slug>.json` (API)
- **Validator:** scripts/refresh/jobs.js compstimate-backtest (live claim, previous month, threshold, doc claims); test/features.test.js backtest tests
- **Before:** recomputed every build; hand-written figures in docs/process/*.md are dated logs and never checked
- **Checklist:**
  - [ ] Keep BACKTEST_FALLBACK equal to BACKTEST_OPTS (patch docs/process/patches/freshness-audit-core-backtest-fallback.diff adds dedupe: "role").
  - [ ] Monthly (jobs.js compstimate-backtest): backtest() re-run with server/index.js BACKTEST_OPTS on the newest snapshots; drift when it differs from the live api/meta/<slug>.json figure or from last month by more than max(3, 3 x SE) points (SE ~ 1.166 m / sqrt(n)), or when a company crosses the 25% Low-confidence threshold; hand-written "±N% (tested on N ...)" figures in README.md and docs/*.md must match a company.
  - [ ] On drift: check whether the data (new postings, parser) or the code (compstimate.js, roles.js) moved it; a code change that worsens most companies needs the product owner's OK (docs/process/compstimate-taskforce.md).
- **Notes:** The UI figure is computed at build from the same function, so it cannot disagree with the data it was built on; the monthly check catches a stale deploy, month-over-month swings and doc figures. docs/QA.md:730 quotes "±14% (tested on 500 listed salaries)" as an example of the format (reported, not checked). \| INCONSISTENCY: scripts/build-static.js BACKTEST_FALLBACK lacks dedupe "role", so if server/index.js BACKTEST_OPTS failed to import, the static site would publish the less cautious "title"-dedupe error. Seed 20261002 also used by vet-salaries --seed default. The published accuracy change…

</details>

<details><summary><code>compstimate-model</code>: Compstimate similarity model and thresholds (LEVEL_INDEX, seniority/location/department/title weights, selection cut-of…</summary>

- **Type / cadence / mechanism:** product-policy · monthly (+14 days grace) · detect via `scripts/refresh/jobs.js`
- **Values:** LEVEL_INDEX { Intern 0, Entry 1, Mid 2, Senior 3, Manager 3.5, Staff+ 4, Director+ 5 } -> senioritySim weights 1 / 0.55 / 0.35 / 0.2 / 0.1 / 0.03 by distance; MIN_WEIGHT 0.02, REL_WEIGHT 0.12, LOW_P 0.15, HIGH_P 0.85, confidence High nEff>=5 topSim>=0.5 spread<=0.6 / Medium nEff>=2 topSim>=0.25 spread<=1, ACCURACY_LOW_THRESHOLD 25, MIN_COMPARABLES 3, BACKTEST_SEED 20261002
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `public/features/compstimate.js:39 LEVEL_INDEX`, `public/features/compstimate.js:176 MIN_WEIGHT / REL_WEIGHT / MAX_COMPARABLES / LOW_P, HIGH_P`, `public/features/compstimate.js:671 MIN_COMPARABLES`, `server/compstimate-worker.js:8 compstimate worker (server)`, `public/features/compstimate.js:39 LEVEL_INDEX Intern 0, Entry 1, Mid 2, Senior 3, Manager 3.5, Staff+ 4, Director+ 5`, `public/features/compstimate.js:46 senioritySim: same 1, ≤0.5 0.55, ≤1 0.35, ≤1.5 0.2, ≤2 0.1, else 0.03; no level asked: Intern 0.25, Director+ 0.5; unknown 0.5`, `public/features/compstimate.js:55 deptSim 1 / 0.7 (no dept) / 0.5`, `public/features/compstimate.js:97 locationSim 1 / 0.75 / 0.6 / 0.4 / 0.3 / 0.25`, `public/features/compstimate.js:168 tokenSim 0.7 coverage + 0.3 precision; title = 0.7 token + 0.3 family`, `public/features/compstimate.js:176 MIN_WEIGHT 0.02, REL_WEIGHT 0.12, MAX_COMPARABLES 500, LOW_P 0.15, HIGH_P 0.85`, `public/features/compstimate.js:218 band weights 0.25/0.5/0.25; rounding to $1K`, `public/features/compstimate.js:233 confidence High (nEff ≥ 5, topSim ≥ 0.5, spread ≤ 0.6) / Medium (≥ 2, ≥ 0.25, ≤ 1)`, `public/features/compstimate.js:671 MIN_COMPARABLES 3`, `public/features/compstimate.js:568 FAMILY_TITLES (26 representative titles)`, `public/features/roles.js:296 FAMILY_AFFINITY (24 pairs, unknown family 0.35)`, `public/features/compstimate.js:46 senioritySim`, `public/features/compstimate.js:176 MIN_WEIGHT / REL_WEIGHT / LOW_P / HIGH_P`, `public/features/compstimate.js:409 ACCURACY_LOW_THRESHOLD`
- **Used in:** `server/index.js:324` (Compstimate); `scripts/build-market.js:30` (Same role elsewhere); `public/app.js:2264` (Compstimate); `public/features/compstimate.js:726` (Compstimate); `public/features/compstimate.js:716` (Compstimate); `test/features.test.js:153` (tests); `test/features.test.js:614` (tests); `public/app.js:2257` (Compstimate); `public/features/compstimate.js:735 "past estimates at X missed by more than 25%"` (drawer Compstimate)
- **Validator:** scripts/refresh/jobs.js ladderCheck (test/refresh-jobs.test.js); test/features.test.js
- **Before:** none (hand-set 2026-10-02)
- **Checklist:**
  - [ ] Owned by freshness-jobs; core side: review when seniority-ladder changes.
  - [ ] Quarterly: re-run the backtest per company (compstimate-backtest); if median error moves > 3 points, review weights with docs/process/compstimate-taskforce.md.
  - [ ] Monthly (jobs.js compstimate-model): LEVEL_INDEX read as a geometric pay ladder (one step = s, fitted as e^median(ln r / Δindex) over company x family level/Mid median ratios with n >= minN); drift when a level's implied multiplier s^(index - 2) is outside the data's IQR band (>= 3 pairs; band at least median ±5%) or two levels' bands contradict the encoded order. Never auto-written.
  - [ ] Yearly human review of every threshold above with docs/process/compstimate-taskforce.md; set lastReviewed.
- **Notes:** LEVEL_INDEX holds ladder POSITIONS, not multipliers; the geometric reading is our interpretation (docs/process/freshness-jobs.md §3). On the 2026-10-02 snapshots: step 1.147x, every banded level inside its band (Intern 0.76 in 0.56-0.77, Entry 0.87 in 0.67-0.88, Senior 1.15 in 0.99-1.23, Manager 1.23 in 1.00-1.30, Staff+ 1.32 in 1.10-1.46, Director+ 1.51 in 1.43-1.96); the data places Manager at index ~2.8 (between Mid and Senior), the code at 3.5. \| INCONSISTENCY: LEVEL_INDEX orders Manager (3.5) before Staff+ (4); public/features/roles.js SENIORITY_LADDER orders Staff+ before Manager. Deta…

</details>

<details><summary><code>seniority-ladder</code>: Seniority ladder and its copies (7 levels + Unspecified) used for filters, chart grouping, Compstimate and market cells.</summary>

- **Type / cadence / mechanism:** product-policy · monthly (+14 days grace) · detect via `scripts/refresh/jobs.js`
- **Values:** buckets Intern, Entry, Mid, Senior, Staff+, Manager, Director+ (server/keywords.js inferSeniority; "Mid" is the default when the title has no level word); display order SENIORITY_LADDER = app.js / chart.js SENIORITY_ORDER; 2026-10-02: 48.8% of postings Mid by default (xAI 73%, OpenAI 69%, Shield AI 18%)
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/keywords.js:857 inferSeniority`, `server/keywords.js:839 MTS_ABBREV (SMTS/LMTS/PMTS)`, `server/keywords.js:830 NON_PEOPLE_MANAGER`, `server/keywords.js:782 yearsBucket`, `server/keywords.js:687 years range 1..30`, `server/vet.js:1 vet.js titleClass (junior/senior, separate ladder)`, `server/demo.js:1 demo IC_LEVELS`, `public/features/roles.js:316 SENIORITY_LADDER (UI order)`, `public/features/roles.js:316 SENIORITY_LADDER`, `public/viz/chart.js:1 chart SENIORITY_ORDER (+ Unspecified)`, `public/app.js:1 app SENIORITY_ORDER (+ Unspecified)`, `public/features/roles.js:321 roles.js inferSeniority (null when no level word)`, `public/features/compstimate.js:39 LEVEL_INDEX`, `public/app.js:75 SENIORITY_ORDER`, `public/viz/chart.js:49 SENIORITY_ORDER`, `public/features/roles.js inferSeniority (query side; null without a level word)`, `scripts/archive/report.js:33 LADDER (archive reports; jobs.js seniority-ladder compares it with roles.js)`
- **Used in:** `server/normalize.js:132` (chart); `scripts/build-market.js:84` (Same role elsewhere); `server/export.js:12` (API); `public/features/compstimate.js:34` (Compstimate); `public/features/compstimate.js:668` (Compstimate); `public/app.js:429` (badge); `public/features/comps.js:58` (Same role elsewhere); `test/features.test.js:157` (tests); `docs/strategy/CORPORATE_LADDER_PLAN.md:78` (docs)
- **Validator:** scripts/refresh/jobs.js seniority-ladder; test/keywords.test.js inferSeniority; patch docs/process/patches/freshness-jobs-seniority-default.diff adds seniorityBasis()
- **Before:** none
- **Checklist:**
  - [ ] Yearly: sample titles per bucket from the snapshots; new ladder titles (e.g. a company adopting new level names) go in a PR with NORMALIZER_VERSION bumped.
  - [ ] Monthly (jobs.js seniority-ladder): share of postings whose level is a default (pooled over stable boards; drift above 50%, i.e. default "Mid" outnumbers every explicitly levelled posting, or a 5+ point rise month over month), per company a 10+ point rise, unread level tokens (L5, IC4, Level 3) on more than 1% of a company's postings, and the three display ladders identical.
  - [ ] Demo-data level multipliers are compared with the real IQR bands (informational; registry demo-data).
- **Notes:** USER DECISION PENDING (seniority default): ~half the postings are "Mid" only because the title has no level word, so market-comps Mid cells and Compstimate's Mid weighting are mostly defaults. Options in docs/process/freshness-jobs.md §3: (A) keep, watched monthly (current); (B) expose seniorityBasis on each Job and label default levels "Mid (no level in title)"; (C) infer the level from the years-of-experience ask (CORPORATE_LADDER_PLAN). The patch only adds seniorityBasis() (no behaviour change). The ladder plan's "41% Mid by default" uses a broader level-word list than inferSeniority; jobs…

</details>

<details><summary><code>role-families</code>: Role-family taxonomy (26 families) and its label copies.</summary>

- **Type / cadence / mechanism:** product-policy · monthly (+14 days grace) · detect via `scripts/refresh/jobs.js`
- **Values:** 26 families (public/features/roles.js FAMILY_LABELS), FAMILIES / DEPT_HINTS / PRIORITY lexicons, FAMILY_AFFINITY partial credits; 2026-10-02: 6 of 5,413 postings without a family (0.1%)
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/vet.js:1 vet.js FAMILIES (10 + other)`, `server/vet.js:1 vet.js roleFamily`, `public/features/roles.js:321 roles.js FAMILIES`, `public/features/roles.js:139 FAMILY_LABELS`, `public/features/roles.js:139 FAMILY_LABELS (26)`, `public/features/roles.js:174 FAMILIES regex lexicon`, `public/features/roles.js:208 DEPT_HINTS`, `public/features/roles.js:21 ABBREV / SYNONYM / LEVEL_WORDS / STOPWORDS`, `public/app.js:1 app FAMILY_LABEL (15 older labels, overridden by FAMILY_LABELS)`
- **Used in:** `server/vet.js:205` (API); `scripts/build-market.js:82` (Same role elsewhere); `public/app.js:399` (badge); `public/features/comps.js:73` (Same role elsewhere); `public/features/comps.js:143` (Compare); `test/features.test.js:412` (tests)
- **Validator:** scripts/refresh/jobs.js role-families; test/features.test.js roleFamily; yearly 100-title hand check (docs/process/product.md)
- **Before:** one-off hand checks (92/100 on 2026-10-02)
- **Checklist:**
  - [ ] Yearly: share of jobs per family and the "other"/null share; a rising null share means new titles the lexicon misses.
  - [ ] Monthly (jobs.js role-families): drift when more than 2% of a company's postings (50+ postings) have no family, or the share rises more than 1 point month over month; every family id needs a FAMILY_LABELS label and a FAMILY_TITLES title.
- **Notes:** INCONSISTENCY: two unrelated taxonomies with the same function name roleFamily (server/vet.js vs public/features/roles.js). Lexicon was hand-checked on 300 real titles (docs/process/product.md §5); new companies (beta big tech) were not part of that check.

</details>

<details><summary><code>keyword-lexicons</code>: Skills / responsibilities / fit keywords as aggregated in Insights and the keyword filters.</summary>

- **Type / cadence / mechanism:** product-policy · monthly (+14 days grace) · detect via `scripts/refresh/jobs.js`
- **Values:** server/keywords.js SKILL_LEXICON, RESPONSIBILITY_LEXICON, FIT_LEXICON, FIT_GLOBAL_LEXICON, years buckets 1+/3+/5+/8+/10+; 2026-10-02: 1.5%-8.4% of postings per company without a skill keyword
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/keywords.js:386 SKILL_LEXICON`, `server/keywords.js:577 RESPONSIBILITY_LEXICON`, `server/keywords.js:630 FIT_LEXICON`, `server/keywords.js:664 FIT_GLOBAL_LEXICON`, `server/keywords.js:273 boilerplate minShare 0.5 / minJobs 5`, `server/keywords.js:1 facet guard maxShare 0.9 / minJobs 20`, `server/normalize.js:28 NORMALIZER_VERSION`, `server/keywords.js [core]`, `server/keywords.js:1040 EQUITY_NOISE_RE`, `server/keywords.js:1053 BONUS_NOISE_RE`, `server/keywords.js:1056 COMP_DUTY_RE`, `server/keywords.js:1059 COMP_NEGATION_RE`, `server/keywords.js:3 SALES_CONDITIONAL_RE`, `server/keywords.js:1063 SALES_TITLE_RE`, `server/keywords.js:1083 EQUITY_STRONG`, `server/keywords.js:1099 BONUS_STRONG`
- **Used in:** `server/normalize.js:128` (chart); `public/app.js:1884` (badge); `public/features/insights.js:58` (Insights); `public/features/insights.js:137` (Insights); `public/app.js:1294` (badge); `public/app.js "+ equity mentioned / + bonus mentioned" drawer notes` (drawer); `archive jobs table extras column` (archive)
- **Validator:** scripts/refresh/jobs.js keyword-lexicons; test/keywords.test.js
- **Before:** none
- **Checklist:**
  - [ ] Quarterly: list the most frequent unmatched tech terms in descriptions; add lexicon entries in a PR and bump NORMALIZER_VERSION + golden hashes.
  - [ ] Monthly (jobs.js keyword-lexicons): drift when more than 15% of a company's postings carry no skill keyword or the share rises 5+ points month over month (older snapshots are re-keyed first, as the build does).
- **Notes:** New frameworks and AI terms appear every quarter; nothing detects misses today. The equity and bonus "extras" lexicons (EQUITY_* / BONUS_* / COMP_* / SALES_*) are not exported, so the archive versions them through the code capture only; no coverage check yet (proposed: per-company extras.equity / extras.bonus share month over month, drift at ±10 points, test/fixtures/extras-labels.json as the regression set).

</details>

<details><summary><code>listing-freshness-buckets</code>: Listing-age buckets and copy in the UI (filter options, card age, 180+ day notes).</summary>

- **Type / cadence / mechanism:** product-policy · yearly (+60 days grace) · manual via `scripts/refresh/policy.js`
- **Values:** filter 7/30/90; 180+ days; contract freshness new ≤ 7, active 8–59, stale 60–179, evergreen ≥ 180 (server/history.js FRESHNESS)
- **As of:** 2026-10-02 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/history.js:43 FRESHNESS`, `server/history.js:41 REPOST_WINDOW_DAYS`, `server/demo.js:1 demo AGE_BUCKETS (copy)`, `public/app.js:1 app.js 180 (copy)`, `public/app.js:227 Listed filter 7 / 30 / 90 days`, `public/app.js:1268 hide roles open ≥ 180 days`, `public/app.js:2568 card age: < 60 → "Nd", < 730 → months (÷30.44), else years; "+" when a lower bound`
- **Used in:** `server/history.js:255` (badge); `public/app.js:2379` (badge); `public/app.js:1270` (badge); `public/app.js:2391` (drawer Juice block); `public/mock-api.js:220` (API); `docs/CONTRACT.md:144` (docs); `test/e2e/ui.e2e.js:448` (tests); `public/app.js:2372` (badge); `public/app.js:2384` (drawer Juice block)
- **Validator:** scripts/refresh/policy.js listing-freshness-buckets; test/history.test.js
- **Before:** none
- **Checklist:**
  - [ ] Keep demo.js AGE_BUCKETS and app.js 180 in step with FRESHNESS.
  - [ ] Monthly data check (policy.js): public/app.js 180-day filter / drawer note = FRESHNESS.STALE_MAX + 1, server/demo.js AGE_BUCKETS straddle the buckets; no bucket holds more than 80% of dated postings.
- **Notes:** The 2026-10-02 local snapshots carry no postedAt and no ledger was restored, so their ages are unknown; CI snapshots and the ledger supply them. \| Per-job ageDays/freshness are derived at every request/build from postedAt or firstSeenAt (history-ledger). The 180-day UI threshold duplicates server/history.js FRESHNESS.STALE_MAX + 1 by hand.

</details>

<details><summary><code>history-ledger</code>: Ledger-derived job fields as shown in the UI (listed date, first seen, reposts, "New since your last visit", "Pay ↑/↓").</summary>

- **Type / cadence / mechanism:** fetched · daily (+2 days grace) · detect via `pipeline: scripts/snapshot.js recordRun + .github/scripts/ledger.sh (artifact history-ledger or data-history branch); monthly check scripts/refresh/jobs.js`
- **Values:** per company ledger { since, lastRunAt, runs, jobs: { id: { f, l, p, k, r?, c?, n?, o?, s? } } }; REPOST_WINDOW_DAYS 30, PRUNE_CLOSED_DAYS 400; live 2026-10-10: since 2026-10-02, 90 runs
- **As of:** - · last checked 2026-10-10
- **Source:** [melon-seek listing ledger (observations of the job boards)](https://github.com/alvations/melon-seek/blob/claude/stoic-ride-54ddxp/server/history.js) (derived; facts from public job postings)
- **Defined in:** `server/history.js:40 HISTORY_FORMAT`, `server/history.js:42 PRUNE_CLOSED_DAYS`, `server/history.js:100 updateLedger`, `server/history.js:192 compactLedger (api/history/<slug>.json)`, `scripts/history.js:72 recordRun`, `.github/scripts/ledger.sh:2 ledger.sh store (artifact \| branch)`, `server/history.js, scripts/history.js, .github/scripts/ledger.sh [core]`
- **Used in:** `server/index.js:301` (API); `scripts/build-static.js:349` (API); `public/app.js:2379` (badge); `server/export.js:13` (API); `README.md:115` (README); `public/app.js:2380` (drawer Juice block); `public/app.js:1902` (badge); `public/app.js:1271` (badge); `public/api.js:337` (API); `public/mock-api.js:248` (API); `public/app.js:2372` (badge); `public/app.js:2373` (drawer Juice block); `public/api.js:330` (API)
- **Validator:** scripts/refresh/jobs.js history-ledger (age, run rate, gaps); test/history.test.js
- **Before:** daily ledger update; no health check
- **Checklist:**
  - [ ] Set the repository variable HISTORY_STORE=branch so the ledger lives in git (data-history), not only in a 90-day artifact.
  - [ ] Monthly (jobs.js history-ledger): each ledger's lastRunAt within 3 days, at least 0.5 runs per day since `since`, and no pooled gap over 7 days between observation dates; row counts (entries, open, closed, reposts) and closed entries about to be pruned are reported.
  - [ ] If flagged: check the snapshot.yml / pages.yml runs and the history-ledger artifact (90-day retention) or the data-history branch.
- **Notes:** PRUNE_CLOSED_DAYS drops closed entries after 400 days; the archive (ledger/closed) keeps them. \| DATA LOSS RISKS: (1) closed entries are DELETED after 400 days (PRUNE_CLOSED_DAYS), against the user's "don't lose ANY old data"; (2) the default store is a 90-day artifact: 90 days without a successful run loses the whole ledger. The archive agent must mirror the ledger before pruning. No local ledger exists (data/history gitignored), so asOf is unknown here. meta.history.since/runs is published but not displayed. Finding 5: app.js statusTag reads job.payChange {dir, pct}, but no producer exists…

</details>

<details><summary><code>geo-gazetteer</code>: Gazetteer size and coordinates as cited in docs and copied into mock/demo data.</summary>

- **Type / cadence / mechanism:** static-data · yearly (+365 days grace) · manual via `manual`
- **Values:** GAZETTEER_SIZE 246 cities, 52 states, 60 countries (2026-10-10)
- **As of:** 2026-10-02 · last checked -
- **Source:** [hand-built gazetteer](https://github.com/alvations/melon-seek/blob/main/server/geo.js) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/geo.js:25 US_STATES_RAW`, `server/geo.js:81 OTHER_REGIONS_RAW`, `server/geo.js:112 COUNTRIES_RAW`, `server/geo.js:189 CITIES_RAW`, `server/geo.js:570 GAZETTEER_SIZE`, `server/geo.js:975 COUNTRY_LABEL`, `server/juice.js:6 juice.js REGION_COUNTRIES (US, CA, AU)`, `data/cities.json cities[].aliases / nearby`, `server/geo.js [core]`
- **Used in:** `server/normalize.js:53` (map); `server/juice.js:1367` (drawer Juice block); `public/viz/map.js:52` (map); `docs/CONTRACT.md:80` (docs); `public/mock-api.js:16` (API); `public/features/demo-data.js:8` (API); `public/viz/map.js:74` (map)
- **Validator:** test/geo.test.js
- **Before:** none
- **Checklist:**
  - [ ] When a new board brings unknown locations (geo unknown share in the snapshot log), add cities with coordinates from GeoNames and a source note.
  - [ ] Bump NORMALIZER_VERSION (location names are part of the normalized output).
- **Notes:** NO SOURCE recorded for any coordinate. Coordinates do not age, but the alias coverage does (new office cities). Changes re-geocode every job (relocateJobs). Coverage is watched monthly through jobs.js job-juice (the top unmatched location strings per company) as the big-tech boards with worldwide offices arrive; a missing city drops its pins from the map and the Juice from the drawer.

</details>

<details><summary><code>country-currency</code>: Currency symbols and lists in the UI.</summary>

- **Type / cadence / mechanism:** static-data · yearly (+365 days grace) · manual via `manual`
- **Values:** USD $, GBP £, EUR €, CAD CA$, AUD A$, NZD NZ$, JPY ¥, SGD S$, HKD HK$, CHF, INR ₹, KRW ₩, ILS ₪
- **As of:** 2026-10-02 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/salary.js:114 COUNTRY_CURRENCY`, `server/salary.js:144 CODES`, `server/salary.js:148 SYM_CUR`, `server/salary.js:312 NATION_CODE`, `scripts/vet-salaries.js:55 COUNTRY_CURRENCY (copy)`, `scripts/vet-salaries.js:50 CODES (copy)`, `server/sources/meta.js:1 Meta COUNTRY_CUR (subset copy)`, `server/sources/greenhouse.js:36 ZERO_DECIMAL`, `scripts/update-col.js:53 ISO3_TO_ISO2`, `data/cities.json cities[].currency`, `public/viz/palette.js:111 SYMBOLS (13 currencies)`, `public/app.js:116 CUR_SYM (9, a subset copy)`
- **Used in:** `server/salary.js:117` (chart); `server/normalize.js:82` (chart); `server/sources/greenhouse.js:56` (chart); `public/viz/chart.js:332` (chart); `public/app.js:91` (badge)
- **Validator:** test/freshness-policy.test.js: server/salary.js and scripts/vet-salaries.js COUNTRY_CURRENCY are equal, and server/sources/meta.js COUNTRY_CUR agrees wherever it overlaps; yearly manual review against the ISO 4217 list (SIX "list one"; URL not verified from the sandbox)
- **Before:** none
- **Checklist:**
  - [ ] Yearly: compare the euro-area list and the zero-decimal list with the ISO 4217 list (SIX publishes "list one"), and check for euro adoptions (Bulgaria joined on 2026-01-01; in the copies since 3361c90).
  - [ ] Change server/salary.js and scripts/vet-salaries.js together (test/freshness-policy.test.js fails if they differ); server/sources/meta.js COUNTRY_CUR covers only 10 countries and falls back to USD for "$" amounts elsewhere (HK, MX, NZ, TW): extend it with the same values when a board in those countries arrives.
- **Notes:** STALE: Bulgaria (BG) adopted the euro on 2026-01-01 (21st euro-area member; EU Council decision 2025-07-08, verified 2026-10-10 via europarl.europa.eu EPRS_ATA(2025)775850 and the EU Learning Corner) but is not in COUNTRY_CURRENCY (BG is in NATION_CODE and geo COUNTRIES_RAW); a BG location gets no default currency (xai has Sofia postings). Patch: docs/process/patches/freshness-audit-core-bg-euro.diff (salary.js + vet-salaries.js). Duplicated in 3 places; no test ties the copies. Target: detect, by diffing the ISO 4217 list_one.xml (SIX) against COUNTRY_CURRENCY / ZERO_DECIMAL (no module yet).…

</details>

<details><summary><code>demo-data</code>: Synthetic data in public/: features/demo-data.js (demo page + tests) and mock-api.js (?mock=1, localhost). Surface cont…</summary>

- **Type / cadence / mechanism:** product-policy · yearly (+365 days grace) · manual via `manual`
- **Values:** synthetic; FX copies are 5–9% off the palette (GBP 1.27 vs 1.348, EUR 1.09 vs 1.144, CHF 1.13 vs 1.239)
- **As of:** 2026-09-30 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/demo.js:539 CATALOGS (anthropic, anduril, openai, generic)`, `server/demo.js:531 IC_LEVELS`, `server/demo.js:691 FIXED_LEVELS`, `server/demo.js:697 FX`, `server/demo.js:763 salaryFor (6% no salary, intern $45-70/h, 15% two zones at 0.85)`, `server/demo.js:815 AGE_BUCKETS`, `server/demo.js:844 baseTime 2026-09-30`, `public/features/demo-data.js:1 demo city pay factors SF 1, NYC 0.98, Seattle 0.95, Austin 0.86, DC 0.9, London 0.62 GBP, Dublin 0.6 EUR, Zurich 0.78 CHF; remote 0.92`, `public/features/demo-data.js:1 demo department base pay $330K/265K/250K/185K/160K/220K`, `public/features/demo-data.js:1 demo level pay multipliers Intern 0.35, Entry 0.68, Mid 0.86, Senior 1.0, Staff+ 1.3, Manager 1.15, Director+ 1.55`, `public/features/demo-data.js:21 skill boosts CUDA 1.12, Rust 1.06, Excel 0.9; PhD 1.1`, `public/features/demo-data.js:1 demo FX (USD per unit) GBP 1.27, EUR 1.09, CHF 1.13`, `public/features/demo-data.js:129 fakeMarket FX copy`, `public/mock-api.js:1 mock rents/living/tax bands for 11 cities`, `public/mock-api.js:1 mock FX`, `public/mock-api.js:1 mock department bases $330K/260K/250K/190K/160K/220K/210K`, `public/mock-api.js:1 mock level multipliers Intern 0.35, Entry 0.62, Mid 0.85, Senior 1.0, Staff+ 1.3, Manager 1.15, Director+ 1.55`, `public/mock-api.js:94 non-US 0.72 factor; 86% have pay; spread 12–28%`, `public/mock-api.js:1 mock backtest meta (0.14: wrong unit, contract is percent) and history {since 2025-08-28, runs 400}`, `public/viz/demo.html:8 viz demo department bases $340K..; public/viz/demo.html:130 DEMO_COST rent/tax per city + flat $19,000 living; fake comps rows with REAL company names and invented medians (Anthropic $340K, OpenAI $360K, Google DeepMind $285K ...) at public/viz/demo.html:180 (dev page only, excluded from dist)`
- **Used in:** `server/pipeline.js:84` (API); `scripts/build-static.js:14` (API); `server/export.js:84` (API); `public/features/demo.html:45` (API); `test/features.test.js:20` (tests); `public/app.js:743` (badge)
- **Validator:** test/features.test.js, test/demo.test.js (server/demo.js)
- **Before:** none
- **Checklist:**
  - [ ] Yearly: compare each catalog salaryRange with the real market comps p25/p75 for that company; keep demo FX equal to fx-per-usd (or derive it from palette.js).
  - [ ] Optional: derive demo/mock FX from palette FX_TO_USD and mock juice from server/juice.js so demo numbers stop drifting (patch candidates, low priority).
- **Notes:** INCONSISTENT FX: demo GBP 0.78 / EUR 0.9 per USD vs fx-per-usd GBP 0.74187 / EUR 0.87439 (fx.js does not rewrite demo.js). baseTime is fixed, so demo listing ages never change. Demo rows are labelled synthetic; share pages never quote demo pay. scripts/refresh/fx.js does not touch these copies (lead confirmed). Mock juice uses the old log score curve and stale London rent; mock compstimate medianAbsPctError 0.14 has the wrong unit. FIX (finding 6): mock-api.js and demo-data.js should import FX_TO_USD from ../viz/palette.js instead of their own {GBP 1.27, EUR 1.09, CHF 1.13}; mockJuice should …

</details>

<details><summary><code>ops-constants</code>: Client-side ops constants (surface contribution).</summary>

- **Type / cadence / mechanism:** product-policy · ad-hoc (+365 days grace) · manual via `manual`
- **Values:** see owners
- **As of:** 2026-10-10 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/cache.js:17 FRESH_TTL_MS 30 min`, `server/cache.js:1 cache 50 memory / 100 disk`, `server/index.js:59 MIN_REFRESH_MS 60 s`, `server/index.js:61 NEGATIVE_TTL_MS 10 min`, `server/index.js:63 MAX_UPSTREAM 4`, `server/index.js:423 LIST_GZIP_BUDGET 400 KB`, `server/index.js:660 cities max-age 3600`, `server/index.js:82 CSP hosts`, `server/pipeline.js:39 BUILTIN_TIMEOUT_MS 45 s`, `server/pipeline.js:118 POOL_SIZE <= 2`, `server/sources/util.js:4 TIMEOUT_MS 15 s`, `server/sources/util.js:7 MAX_BYTES 25 MB`, `server/sources/util.js:9 MAX_BYTES_BUILTIN 120 MB`, `server/sources/util.js:3 USER_AGENT melon-seek/0.1`, `server/sources/polite.js:20 BOT_USER_AGENT melon-seek/0.2`, `server/sources/polite.js:21 MIN_INTERVAL_MS 1000`, `server/sources/polite.js:22 30 s`, `server/sources/polite.js:23 30 MB`, `server/sources/polite.js:24 BACKOFF 2/4/8/16 s`, `server/sources/amazon.js:37 Amazon PAGE 100 / CAP 10000`, `server/sources/apple.js:14 Apple PAGE 20 / MAX_PAGES 800 / EMPTY_RETRIES 3`, `server/sources/eightfold.js:1 Eightfold PAGE 10 / MAX_PAGES 1500`, `scripts/snapshot.js:29 TRIM_STEPS`, `scripts/build-static.js:132 LIST_BUDGET 1.5 MB`, `scripts/build-static.js:384 OG_IMAGE_MAX_BYTES 5 MB`, `scripts/build-og.mjs:31 OG 1200x630`, `scripts/external-links.js:1 link check timeout 15 s, concurrency 8, 20 per company`, `scripts/links-policy.js:47 ALLOWED_HOSTS`, `server/keywords.js:65 BLOCK_MEMO_MAX 3000`, `.github/scripts/beta-gate.sh:2 beta gate 300 s`, `.github/scripts/check-site.sh:5 check-site 180 s / 15 s`, `.github/scripts/wait-pages-build.sh:9 wait-pages 300 s`, `public/api.js:74 FRESH_TTL_MS 30 min`, `public/api.js:75 LIVE_TIMEOUT_MS 12 s`, `public/api.js:248 WORKER_READY_MS 10 s`, `public/api.js:701 JUICE_CHUNK 400`, `public/app.js:789 PREPARE_CHUNK 300`, `public/app.js:107 PAGE 24/60`, `public/app.js:10 compstimate meta retry 5 s`, `public/viz/map.js:154 map offline 4 s`
- **Used in:** `server/index.js:297` (API); `scripts/snapshot.js:54` (API); `README.md:574` (README)
- **Validator:** test/perf*.test.js
- **Before:** none
- **Checklist:**
  - [ ] No refresh: change with code review. Re-check size caps when a board grows (snapshot log sizes, the Pages bundle summary).
- **Notes:** Two user agents with different versions (melon-seek/0.1 in util.js, 0.2 in polite.js; package.json 0.1.0). Size caps interact with data growth (Amazon is capped by MAX_BETA_SNAPSHOT_BYTES).

</details>

<details><summary><code>workflow-schedules</code>: Workflow cron schedules, artifact retention and timeouts: when data is refreshed and how long the copies live</summary>

- **Type / cadence / mechanism:** product-policy · ad-hoc (+0 days grace) · manual via `manual`
- **Values:** stable snapshots daily 06:17 UTC; beta snapshots every 6 h at :47; pages daily 07:41 UTC; monthly refresh 05:17 UTC on the 3rd; archive daily 09:37 UTC; site-watchdog every 30 min; col-refresh manual only; retention: history-ledger 90 d, job-board-snapshots 14 d, beta-crawl-<slug> 1 d, job-board-snapshots-beta 14 d, salary-vetting 30 d, refresh report 90 d; probes workflow_dispatch only
- **As of:** 2026-10-10 · last checked -
- **Source:** [GitHub Actions configuration](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule) (n/a)
- **Defined in:** `.github/workflows/snapshot.yml:4 snapshot.yml cron "17 6 * * *" (stable boards daily)`, `.github/workflows/snapshot.yml:4 snapshot.yml cron "47 0,6,12,18 * * *" (beta boards every 6 h)`, `.github/workflows/pages.yml:23 pages.yml cron "41 7 * * *"`, `.github/workflows/monthly-refresh.yml:28 monthly-refresh.yml cron "17 5 3 * *"`, `.github/workflows/archive.yml:6 archive.yml cron "37 9 * * *"`, `.github/workflows/site-watchdog.yml:9 site-watchdog.yml cron "11,41 * * * *"`, `.github/workflows/col-refresh.yml:17 col-refresh.yml (now workflow_dispatch only; was "23 5 3 * *")`, `.github/workflows/snapshot.yml:6 history-ledger 90 d`, `.github/workflows/snapshot.yml:? job-board-snapshots 14 d`, `.github/workflows/snapshot.yml:? beta-crawl-<slug> 1 d`, `.github/workflows/snapshot.yml:? job-board-snapshots-beta 14 d`, `.github/workflows/pages.yml:71 history-ledger 90 d (pages)`, `.github/workflows/pages.yml:? salary-vetting 30 d`, `.github/workflows/monthly-refresh.yml:16 monthly refresh report 90 d`, `.github/workflows/snapshot.yml:9 beta crawl 140 min per board (job 150 min)`, `.github/workflows/monthly-refresh.yml:16 monthly-refresh 45 min`, `.github/workflows/archive.yml:5 archive 90 min`, `.github/workflows/bigtech-probe.yml:4 bigtech-probe 180 min`, `.github/workflows/ci.yml:1 CI Node matrix`
- **Used in:** `.github/workflows/snapshot.yml:1` (API); `.github/workflows/pages.yml:1` (API); `README.md:156` (README)
- **Validator:** test/workflows.test.js
- **Before:** none
- **Checklist:**
  - [ ] Schedules fire only from the default branch (origin/HEAD = claude/stoic-ride-54ddxp per the lead); if the default branch changes, the crons move with it.
  - [ ] Before shortening any retention, make sure the archive records that data.
- **Notes:** DATA LOSS: before the archive, retention 14/30/90 days was the only copy of daily job snapshots, vetting reports and (by default) the ledger. These workflows are being edited by the deploy engineer, the lead and the archive agent: re-run gen.mjs for current lines.

</details>

<details><summary><code>runtime-versions</code>: PROPOSED NEW ID. Runtime and dependency versions that age: Node engines and CI matrix, workflow Node version, pinned ac…</summary>

- **Type / cadence / mechanism:** static-constant-from-a-source · semiannual (+45 days grace) · manual via `scripts/refresh/policy.js`
- **Values:** engines >= 18; CI Node 20 and 22; workflows Node 22; leaflet ^1.9.4
- **As of:** 2026-10-10 · last checked -
- **Source:** [Node.js release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) (MIT (nodejs/Release))
- **Defined in:** `package.json engines.node ">=18"`, `package.json dependencies.leaflet "^1.9.4"`, `.github/workflows/ci.yml:1 CI matrix [20, 22]`, `.github/workflows/*.yml node-version: 22`, `.github/workflows/*.yml actions/checkout@3d3c42e5 (v7.0.1), setup-node@82076278 (v7.0.0), upload-artifact@043fb46d (v7.0.1), download-artifact@3e5f45b2 (v8.0.1)`, `Dockerfile:2 FROM node:22-alpine`
- **Used in:** `.github/workflows/ci.yml:17` (tests); `docs/ARCHITECTURE.md:76 "Node 20/22 matrix"` (docs); `README.md:154 "runs the tests on Node 20 and 22"` (README)
- **Validator:** scripts/refresh/policy.js runtime-versions: every Node major in package.json engines, the workflows (node-version, CI matrix) and the Dockerfile FROM line against nodejs/Release schedule.json (past end of life = flag); test/refresh-jobs.test.js
- **Before:** none
- **Checklist:**
  - [ ] Fetch schedule.json; any Node line in engines/CI past its "end" date -> issue.
  - [ ] Check https://registry.npmjs.org/leaflet for a new major.
- **Notes:** Verified 2026-10-10 against nodejs/Release schedule.json: v18 end 2025-04-30, v20 end 2026-04-30, v22 end 2027-04-30, v24 LTS since 2025-10-28 (end 2028-04-30). engines ">=18" and the CI matrix [20, 22] therefore include two EOL runtimes; Node 24 is not tested. Not a product number; propose to the lead, fold into ops-constants if declined.

</details>

<details><summary><code>share-pages</code>: dist/c/<slug>/ share pages: og:title '<Company> jobs by salary · N roles · median $X' and og:description 'M of N roles …</summary>

- **Type / cadence / mechanism:** derived-at-build · daily (+2 days grace) · auto via `pages.yml (daily build: scripts/build-static.js shareStats/sharePage)`
- **Values:** per company from the day's snapshot; demo data gets no numbers; the description carries the data date
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [Company job boards (Greenhouse, Ashby, Lever; big-tech care…](https://alvations.github.io/melon-seek/c/anthropic/) (public job postings; facts only, links to the original postings)
- **Defined in:** `scripts/build-static.js:441 shareStats`, `scripts/build-static.js:458 sharePage`, `scripts/build-static.js:431 money (K/M formatting)`, `server/index.js:1 server sharePage (no counts)`, `scripts/build-static.js:434-447`, `scripts/build-static.js:451`, `scripts/build-static.js shareStats (roles, withPay, median of annualized USD midpoints)`, `scripts/build-static.js money ($K/$M)`, `server/index.js sharePage (server mode, no counts)`
- **Used in:** `scripts/build-static.js:496` (OG image); `scripts/build-static.js:458` (OG image); `README.md:346` (README); `test/og.test.js:180` (tests); `scripts/build-static.js:450` (OG image)
- **Validator:** test/og.test.js (tags, counts and date from a fixture snapshot; demo pages carry no pay); scripts/links-policy.js at build time; readme-counts checks the README example's format.
- **Before:** daily Pages build
- **Checklist:**
  - [ ] None; regenerated each build.
  - [ ] None: every Pages build regenerates them from that day's snapshots. After a change to their wording, re-scrape previews (docs/process/social.md).
- **Notes:** Social crawlers cache og tags for days, so a share preview can show older counts than the site. Median uses salary.js annualize + vet.js toUSD (server FX copy), not palette.js; after fx.js both are rewritten together, so they agree. Already fresh by construction (dated in their own description). Crawlers cache og tags for days, so a preview can show older counts than the site. Median uses salary.js annualize + vet.js toUSD (server FX copy); fx.js rewrites the FX copies together. The postings these counts come from are kept by the archive's jobs datasets.

</details>

<details><summary><code>og-card</code>: Social share card public/og/melon-seek-og.png (1200x630, og:image/twitter:image for every page and share page), rendere…</summary>

- **Type / cadence / mechanism:** product-policy · yearly (+30 days grace) · manual via `scripts/refresh/derived.js`
- **Values:** Median $318K · 214 roles; rows Research 64, Engineering 88, Security 27, Sales 35 (sum 214); pins $436K·8, $368K·12, $290K·5; Remote · 9 roles; PNG 1200x630, 164 KiB
- **As of:** 2026-10-02 · last checked -
- **Source:** [melon-seek design (illustrative figures, no company names)](https://alvations.github.io/melon-seek/og/melon-seek-og.png) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `scripts/build-og.mjs:31 WIDTH/HEIGHT 1200x630`, `scripts/build-og.mjs:33 MAX_BYTES 5 MB`, `public/og/card.html (content: freshness-audit-surface)`, `public/og/card.html:125`, `public/og/card.html:219`, `public/og/card.html (illustrative figures: headline :125, pins :219)`, `public/og/melon-seek-og.png`, `scripts/build-og.mjs WIDTH/HEIGHT 1200x630, MAX_BYTES 5 MB`, `test/fixtures/refresh/derived/og-render.json (sha256 of the card source and PNG it was rendered from)`
- **Used in:** `scripts/build-static.js:496` (OG image); `public/index.html:16` (OG image); `public/index.html:20` (OG image); `scripts/build-static.js:451` (OG image); `test/og.test.js:80` (tests)
- **Validator:** scripts/refresh/derived.js ogCard(): 'illustrative, not data' disclaimer present; headline count = sum of rows; PNG IHDR 1200x630 and < 5 MB; card.html and PNG sha256 equal the render manifest (else 'drift': re-render or re-record); 'stale' past yearly + 30 days. test/og.test.js (format), test/refresh-derived.test.js.
- **Before:** none (rendered by hand once, 2026-10-02; nothing noticed when card.html changed)
- **Checklist:**
  - [ ] If card.html quotes counts (companies, jobs), re-render with node scripts/build-og.mjs after a change (freshness-derived).
  - [ ] Numbers are illustrative by design ("no real company names; salaries and counts are illustrative"): keep plausible versus the real market median (stable boards ~$140K–$352K per company today).
  - [ ] Design drift: the card still uses the old blue sequential pin ramp (--seq-*), the app switched to rind green (palette.js SEQ_LIGHT, DES-1).
  - [ ] Review public/og/card.html: the figures are illustrative (no company); keep them plausible against current medians (Insights, market comps) and keep the headline count equal to the sum of the rows.
  - [ ] If card.html changed: npm i --prefix "$RUNNER_TEMP/pw" playwright-core (outside the repo), then PW_DIR="$RUNNER_TEMP/pw" CHROMIUM_PATH=/usr/local/share/chromium/chrome-linux/chrome node scripts/build-og.mjs (ubuntu-latest has Chromium; locally CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome).
  - [ ] Record the hashes: node scripts/refresh/derived.js --og-hashes > test/fixtures/refresh/derived/og-render.json; commit card.html, the PNG and the manifest together.
  - [ ] After the deploy, re-scrape link previews (LinkedIn Post Inspector, Facebook Sharing Debugger; docs/process/social.md).
  - [ ] Design drift to decide on (audit-surface): the card still uses the old blue sequential pin ramp; the app moved to rind green (palette.js SEQ_LIGHT).
  - [ ] Set asOf (render date) and lastChecked for og-card in data/freshness.json.
- **Notes:** Not regenerated by any workflow. Chromium on GitHub runners: ubuntu-latest (Ubuntu 24.04 image 20261004) ships Chromium 154 at /usr/local/share/chromium/chrome-linux/chrome (also /usr/bin/chromium) and Google Chrome at /usr/bin/google-chrome (runner-images Ubuntu2404-Readme and install-google-chrome.sh, read 2026-10-10; not executed on a runner), so the monthly workflow could render the PNG with playwright-core installed outside the repo. Not automated on purpose: the figures are illustrative, so a monthly re-render would change nothing visible, and Chromium renders are not byte-stable (every…

</details>

<details><summary><code>methodology-page</code>: The site's Juice methodology pages: methodology/ (being redesigned into a guide whose numbers are computed at build tim…</summary>

- **Type / cadence / mechanism:** derived-at-build · daily (+14 days grace) · detect via `pipeline: scripts/build-static.js renders methodology/ on every Pages build (scripts/methodology.js + scripts/methodology-figures.js)`
- **Values:** reference page: 14 tables, TOC from the ## headings, anchors such as #1-the-formula, the 4 generated LIVABILITY blocks; guide: every number from the live code at build time
- **As of:** 2026-10-10 · last checked 2026-10-10
- **Source:** [docs/LIVABILITY.md (with its generated blocks, juice-worked…](https://alvations.github.io/melon-seek/methodology/) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `server/index.js:1 server route /methodology/`, `scripts/build-static.js:27`, `scripts/methodology.js (render; UI/UX engineer, redesign in progress)`, `scripts/md.js mdToHtml (UI/UX engineer)`, `scripts/methodology-figures.js (guide figures, new)`, `docs/METHODOLOGY_GUIDE.md ({{figure:…}} / {{value:…}} placeholders, new)`, `scripts/build-static.js step 5b`, `server/index.js /methodology/`, `scripts/methodology.js:83 renderReferencePage`, `scripts/methodology.js:219 renderGuidePage`, `scripts/methodology.js:289 methodologyPages`, `scripts/methodology-figures.js:26 EXAMPLE (salaryUSD 200000, described as "about the median posted salary": a data claim, unchecked)`, `scripts/methodology-figures.js:28 TAX_SPLIT_CITIES`, `scripts/methodology-figures.js:99 CADENCE_DEFAULTS (fallback copy of registry cadences)`
- **Used in:** `docs/LIVABILITY.md:173` (methodology page); `public/app.js:2058` (drawer Juice block); `scripts/methodology.js:88` (methodology page); `dist/methodology/index.html` (methodology page); `server/index.js:874` (methodology page)
- **Validator:** scripts/refresh/derived.js methodologyPage(): renders the overlay's docs/LIVABILITY.md; 'flag' when 'freshness:' marker text shows, #1-the-formula is missing, a table did not render, or a generated block is absent. test/refresh-derived.test.js ('the methodology page never shows marker comments'); test/md.test.js (with the md.js patch); scripts/links-policy.js at build time.
- **Before:** rebuilt by every Pages build (pages.yml); nobody checked the content
- **Checklist:**
  - [ ] Regenerate the worked examples after any juice input refresh (freshness-derived).
  - [ ] If the check says marker comments are visible: the md.js owner adds HTML-comment dropping (reference: docs/process/patches/freshness-derived-md-comments.diff) before or with the LIVABILITY marker insertion.
  - [ ] If #1-the-formula is missing: the '## 1. The formula' heading was renamed; restore it or change JUICE_DOC in public/app.js.
  - [ ] npm run build, then open dist/methodology/ and check the generated tables render.
- **Notes:** Redesign in progress (lead, 2026-10-10): docs/METHODOLOGY_GUIDE.md is a human guide whose {{figure:...}} / {{value:...}} placeholders are computed at build time from server/juice.js and data/cities.json, so its numbers cannot go stale; methodology/reference/ renders docs/LIVABILITY.md unchanged, and the LIVABILITY tables there are checked/regenerated by scripts/refresh/derived.js + examples.js (juice-worked-examples, docs-counts).

</details>

<details><summary><code>juice-worked-examples</code>: Generated Juice tables in docs/LIVABILITY.md: the one-person worked examples, the by-household table (the user's San Fr…</summary>

- **Type / cadence / mechanism:** derived-at-build · monthly (+14 days grace) · auto via `scripts/refresh/derived.js`
- **Values:** 8 one-person examples, 8 x 3 household examples, 4-row grade table + 6 legend points, 69 tax-source rows (2026-10-10). E.g. San Francisco $675K, Just me: tax $297,923, rent $44,145, living $18,184, juice $314,748, score 98 (tax agent's working tree, 2026-10-10; the hand-written table still said $298,112 / $314,559)
- **As of:** 2026-10-10 · last checked 2026-10-10
- **Source:** [server/juice.js computeJuice/taxFor/netForScore/TAX_SOURCES…](https://alvations.github.io/melon-seek/methodology/#1-the-formula) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `docs/LIVABILITY.md:173-220`, `scripts/refresh/examples.js WORKED_EXAMPLES, HOUSEHOLD_EXAMPLES, LEGEND_POINTS (the cases)`, `docs/LIVABILITY.md marker blocks juice-worked-examples/{single,household,score-legend,tax-sources}`
- **Used in:** `docs/LIVABILITY.md:173` (methodology page); `docs/QA.md:338` (docs); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:181` (methodology page); `docs/LIVABILITY.md:130` (methodology page); `docs/LIVABILITY.md:295` (methodology page); `dist/methodology/index.html` (methodology page)
- **Validator:** scripts/refresh/derived.js workedExamples(): unknown or unbalanced markers are 'error'; without markers the hand-written tables must equal the generated rows (detect, 'drift'); with markers a difference is 'changed' + writes (orchestrator stages docs/LIVABILITY.md). Tests: test/refresh-derived.test.js (deterministic regeneration, idempotent insertMarkers, header kept, doctored row is drift, archi…
- **Before:** hand-written from the code (docs/process/scripts/livability-*.mjs at the time); nothing re-ran it
- **Checklist:**
  - [ ] Regenerate after any FX, rent, cost-index, NYC basket or tax change.
  - [ ] One time: once the household and tax agents have finished docs/LIVABILITY.md, run `node scripts/refresh/derived.js --insert-markers docs/LIVABILITY.md > /tmp/L.md && mv /tmp/L.md docs/LIVABILITY.md` (idempotent; equivalent to docs/process/patches/freshness-derived-livability-markers.diff), together with the md.js patch.
  - [ ] Monthly (automatic): review the regenerated tables in the bot PR; a large jump means an input moved (check the fx, rents and tax entries of the same report).
  - [ ] To add or change an example, edit WORKED_EXAMPLES / HOUSEHOLD_EXAMPLES in scripts/refresh/examples.js, never the tables.
- **Notes:** First table header says "data as of 2026-10-02" but its figures are today's (London rent $34,777 is post-2026-10-10 data): the header date is stale. Main + household tables duplicate each other for single rows. The Result carries archive = { dataset: 'juice-worked-examples', asOf: <run date>, json: examplesSnapshot() } (run.js writeArchivePayloads), so the archive keeps a monthly series of the same jobs (the SF $675K case per household, net, score, tax parts and every input's as-of): the annual review can show how Juice moved for an unchanged salary. Drift on 2026-10-10: 91 row differences, a…

</details>

<details><summary><code>juice-calibration-doc</code>: The score-curve calibration paragraph and percentile table in docs/LIVABILITY.md §1 (real snapshots of 2026-10-02: 5,41…</summary>

- **Type / cadence / mechanism:** derived-at-build · quarterly (+30 days grace) · manual via `scripts/refresh/derived.js`
- **Values:** 8 snapshots, 5,413 jobs, 4,551 salaried, 4,034 with juice; 90th percentile salary $362,500, net $172,580, score 88; jobs at 100: 0 (K $80K)
- **As of:** 2026-10-02 · last checked -
- **Source:** [Real job-board snapshots (job-board-snapshots artifact) sco…](https://alvations.github.io/melon-seek/methodology/#score-curve-and-grades) (public job postings; facts only)
- **Defined in:** `docs/LIVABILITY.md:149-171`, `docs/LIVABILITY.md:149 Calibration (real snapshots, 2026-10-02)`, `docs/process/scripts/livability-juice-distribution.mjs (generator; needs data/snapshots/)`
- **Used in:** `docs/LIVABILITY.md:149` (methodology page); `test/juice.test.js:145` (tests); `docs/LIVABILITY.md:144` (methodology page); `server/juice.js:131` (docs)
- **Validator:** scripts/refresh/derived.js calibrationDoc(): the paragraph exists and its 'New (K $NK)' column equals SCORE_ANCHORS.K (else 'flag'); 'stale' past quarterly + 30 days.
- **Before:** manual (re-run the script by hand); nothing reminded anyone
- **Checklist:**
  - [ ] On a runner with snapshots: node docs/process/scripts/livability-juice-distribution.mjs; update the table, grade shares and test/juice.test.js Q quantiles together.
  - [ ] Restore real snapshots: gh run download --repo alvations/melon-seek --name job-board-snapshots --dir data/snapshots.
  - [ ] Run node docs/process/scripts/livability-juice-distribution.mjs (and --old for the comparison column); update the 'Calibration (real snapshots, <date>)' paragraph and table in docs/LIVABILITY.md §1.
  - [ ] If the 90th-percentile score leaves 85-90 or postings reach 100 again, raise it with the product owner before re-tuning K (juice-score-anchors is product policy).
  - [ ] Set asOf (snapshot date) and lastChecked for juice-calibration-doc in data/freshness.json.
- **Notes:** Needs data/snapshots/ (not in the repo, so not in the monthly runner unless the snapshot artifact is restored). A dated record of a tuning decision: refresh it, do not rewrite its date without re-running.

</details>

<details><summary><code>readme-counts</code>: Figures README.md states as current: built-in companies (intro and API reference), beta big-tech list, city count, Comp…</summary>

- **Type / cadence / mechanism:** derived-at-build · monthly (+14 days grace) · detect via `scripts/refresh/derived.js`
- **Values:** 14 checked figures on 2026-10-10: 89 cities; built-ins 'Anthropic, Anduril and OpenAI' (code: 8 stable) twice; beta Google, Microsoft, Meta, Apple, Netflix, Amazon, NVIDIA; seed 20261002 / 500 jobs; lists < 1.5 MB; market.json <= 150 kB; cache 30 min (twice); job-board-snapshots kept 14 days (snapshot.yml now 90); history-ledger 90-day retention; Node >= 18; share title format '<Company> jobs by …
- **As of:** 2026-10-10 · last checked 2026-10-10
- **Source:** [The repo's own code and data: server/companies.js listCompa…](https://alvations.github.io/melon-seek/) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `README.md`, `README.md (hand-written prose)`, `scripts/refresh/derived.js README_RULES (what each figure must equal)`
- **Used in:** `README.md:16` (README); `README.md:78` (README); `README.md:175` (README); `README.md:219` (README); `README.md:346` (README); `README.md:187` (README); `README.md:11` (README); `README.md:463` (README); `README.md:368` (README); `README.md:174` (README); `README.md:180` (README); `README.md:53` (README); `README.md:574` (README); `README.md:84` (README); `README.md:130` (README); `README.md:19` (README)
- **Validator:** scripts/refresh/derived.js README_RULES + runRules(): each rule's captured figure must equal the value computed from code/data; a missing anchor is 'error'. Tests: test/refresh-derived.test.js ('detect mode flags a doctored README count', 'rules compare lists, numbers and anchors').
- **Before:** none (hand-written; nothing checked it)
- **Checklist:**
  - [ ] Replace hand-written counts with generated ones (or mark them "e.g., as of <date>").
  - [ ] Open the refresh report's readme-counts section: each finding names the README figure, what it says and what the code/data say.
  - [ ] Edit README.md to the computed value (for the built-ins, apply docs/process/patches/freshness-derived-readme-builtins.diff or write the list from server/companies.js).
  - [ ] If you reworded a checked sentence, update its rule in scripts/refresh/derived.js README_RULES so the figure stays checked (a rule without an anchor reports 'error').
  - [ ] Run node --test test/refresh-derived.test.js and node scripts/refresh/run.js --offline --dry-run --only derived.
- **Notes:** Finding 1 FIX: README line "built-in Anthropic, Anduril and OpenAI" -> "eight built-in boards (Anthropic, Anduril, OpenAI, Scale AI, xAI, Cohere, Palantir, Shield AI; big-tech boards on /beta)", ideally generated by derived.js from listCompanies(). Size/count sentences ("~74 MB", "2,418 jobs in 1.3 MB", "638 roles · median $352K") should carry "(as of 2 Oct 2026)" or be regenerated from the last Pages build summary. Not checked on purpose (dated observations, each says when): '~74 MB; anduril.json alone is ~38 MB' (README:78), '(Oct 2026) ... 2,418 jobs in 1.3 MB' (README:219, the size cap in…

</details>

<details><summary><code>docs-counts</code>: Counts and constants quoted in prose in docs/LIVABILITY.md and docs/CONTRACT.md: city counts, US/non-US splits, confide…</summary>

- **Type / cadence / mechanism:** derived-at-build · monthly (+14 days grace) · detect via `scripts/refresh/derived.js`
- **Values:** 32 checked figures on 2026-10-10, e.g. 89 cities (x4), NYC basket $19,982 and scales 1 / 1.72 / 2.41, K $80,000, full glass $423,866, grades 45 / 70, US medium 30 / low 10 / non-US low 49, Big Mac 33 countries release 2026-07-01, ratio 88 / direct 1 / pooled 33, US 40, Numbeo months 2026-05..2026-10 (64 of 88 at 2026-09), proxies 9, comparison-derived 2, Numbeo figures 266 (+1 baseline), FX July …
- **As of:** 2026-10-10 · last checked 2026-10-10
- **Source:** [The repo's own code and data: data/cities.json, server/juic…](https://alvations.github.io/melon-seek/methodology/) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `docs/**`, `docs/LIVABILITY.md (hand-written prose)`, `docs/CONTRACT.md (hand-written prose)`, `scripts/refresh/derived.js DOCS_RULES`
- **Used in:** `docs/CONTRACT.md:80` (docs); `docs/CONTRACT.md:144` (docs); `docs/ARCHITECTURE.md:82` (docs); `docs/QA.md:4` (docs); `docs/QA.md:21` (docs); `docs/DATA_SOURCES.md:23` (docs); `docs/DATA_SOURCES.md` (docs); `docs/VETTING.md:93` (docs); `docs/VETTING.md:116` (docs); `docs/strategy/CORPORATE_LADDER_PLAN.md:17` (docs); `docs/strategy/COMPETITIVE_ANALYSIS.md:15` (docs); `docs/strategy/COMPETITIVE_ANALYSIS.md:241` (docs); `docs/strategy/COMPETITIVE_ANALYSIS.md:300` (docs); `docs/LIVABILITY.md:11` (methodology page); `docs/LIVABILITY.md:29` (methodology page); `docs/LIVABILITY.md:110` (methodology page); `docs/LIVABILITY.md:127` (methodology page); `docs/LIVABILITY.md:213` (methodology page); `docs/LIVABILITY.md:399` (methodology page); `docs/LIVABILITY.md:401` (methodology page); `docs/LIVABILITY.md:403` (methodology page); `docs/LIVABILITY.md:435` (methodology page); `docs/LIVABILITY.md:446` (methodology page); `docs/LIVABILITY.md:557` (methodology page); `docs/LIVABILITY.md:587` (methodology page); `docs/LIVABILITY.md:639` (methodology page); `docs/CONTRACT.md:160` (docs)
- **Validator:** scripts/refresh/derived.js DOCS_RULES + runRules() (exact string match of each captured figure with the computed one); test/refresh-derived.test.js ('docs-counts reads its figures from the docs, and every rule finds its anchor').
- **Before:** none (hand-written)
- **Checklist:**
  - [ ] Dated reports (QA.md, DATA_SOURCES observations, strategy [L] figures) stay as history; add "as of <date>" where missing.
  - [ ] Current-state claims (CONTRACT gazetteer size, VETTING bounds) should be generated or checked by derived.js.
  - [ ] For each docs-counts finding, change the figure in docs/LIVABILITY.md or docs/CONTRACT.md to the computed value (for 2026-10-10: apply docs/process/patches/freshness-derived-docs-counts.diff).
  - [ ] If a sentence was reworded, update its rule in scripts/refresh/derived.js DOCS_RULES.
  - [ ] Never edit dated historical records to match today (docs/QA.md, docs/REVIEW.md, docs/VETTING.md tuning notes, docs/DATA_SOURCES.md observations, docs/process/*): they are not checked on purpose.
  - [ ] Run node --test test/refresh-derived.test.js.
- **Notes:** Dated records are deliberately out of scope: docs/QA.md and docs/REVIEW.md (QA rounds with their own dates), docs/VETTING.md tuning counts (5,413 jobs, 8 companies), docs/DATA_SOURCES.md observations (each carries its date), docs/strategy/*, docs/process/*. The calibration paragraph in LIVABILITY §1 is juice-calibration-doc. The tax rows in LIVABILITY §3 are generated (juice-worked-examples/tax-sources). Drift on 2026-10-10: Numbeo page months '64 of 89' -> '64 of 88' and '267 figures' -> '266' (both because Sydney's centre rent is NSW official now; patch freshness-derived-docs-counts.diff).

</details>

<details><summary><code>e2e-pinned-values</code>: Tests that pin a DATA value (not a code constant), so a data refresh breaks them: the real job id the Compstimate e2e t…</summary>

- **Type / cadence / mechanism:** derived-at-build · monthly (+14 days grace) · detect via `scripts/refresh/derived.js`
- **Values:** anthropic:5391376008 (present in the 2026-10-02 snapshot); Big Mac release 2026-07-01 (= data/cities.json bigMac.asOf today)
- **As of:** 2026-10-10 · last checked 2026-10-10
- **Source:** [data/cities.json and data/snapshots/<slug>.json (the job-bo…](https://alvations.github.io/melon-seek/) (repository licence; public job postings)
- **Defined in:** `test/**`, `test/e2e/ui.e2e.js:1327, :1383, :1510 'anthropic:5391376008' (AE - DNB, Senior, London, no posted pay)`, `test/juice.test.js:2 assert.equal(DOC.bigMac.asOf, '2026-07-01')`, `scripts/refresh/derived.js TEST_PINS + pinnedJobIds()`
- **Used in:** `test/juice.test.js:145` (tests); `test/market.test.js:87` (tests); `test/demo.test.js:80` (tests); `test/demo.test.js:27` (tests); `test/features.test.js:524` (tests); `test/server.test.js:603` (tests); `test/golden-normalize.test.js:40` (tests); `test/e2e/ui.e2e.js:448` (tests); `test/beta-build.test.js:160` (tests); `test/e2e/ui.e2e.js:1327` (tests); `test/e2e/ui.e2e.js:1383` (tests); `test/e2e/ui.e2e.js:1510` (tests); `test/juice.test.js:448` (tests)
- **Validator:** scripts/refresh/derived.js e2ePins(): pinned e2e job ids must exist in data/snapshots/<slug>.json ('skipped' when the checkout has no snapshots); TEST_PINS rules ('drift' when a unit test pins a value the data no longer has). test/refresh-derived.test.js.
- **Before:** none
- **Checklist:**
  - [ ] After a monthly refresh PR: run npm test; incidental pins that fail are re-baselined in the same PR; golden tax vectors change only with a verified rule change.
  - [ ] Apply docs/process/patches/freshness-derived-test-pins.diff: the Big Mac assertion compares with the value read before the call, and the e2e tests fall back to a current Anthropic job without pay (Senior, London, else any) when the pinned posting has closed.
  - [ ] When the check reports the pinned job id gone: optionally re-pin PINNED_NO_SALARY in test/e2e/ui.e2e.js to a current job with the same properties.
  - [ ] Keep intentional golden vectors as they are (see notes).
- **Notes:** test/e2e/*.e2e.js compare UI vs API values (relational): no hard-coded data values found (grep for 638/833/2418/$NNNK/89 cities returned none). Intentional golden vectors (kept, not regenerated): tax golden tests (test/juice.test.js, test/juice-tax-golden.test.js: official calculators, change only with tax-* entries); test/juice-household.test.js BLS CE / MIT ratios (cross-checks of living-scale); fixture-based dates and amounts in test/sources.test.js, test/bigtech-*.test.js, test/export.test.js, test/og.test.js, test/server.test.js, test/beta-build.test.js, test/golden-normalize.test.js + t…

</details>

<details><summary><code>docs-screenshots</code>: docs/screenshots/*.png: README's chart.png and map.png and the other captures (drawer, drawer-juice, insights, map-juic…</summary>

- **Type / cadence / mechanism:** derived-at-build · quarterly (+30 days grace) · manual via `manual`
- **Values:** chart.png, map.png (README), drawer.png, drawer-juice.png, insights.png, map-juice.png, dark.png, dark-drawer.png, mobile.png: figures from the snapshots of the last e2e run
- **As of:** 2026-10-10 · last checked -
- **Source:** [Company job boards via the real app (node scripts/e2e.js, h…](https://alvations.github.io/melon-seek/) (public job postings; facts only)
- **Defined in:** `docs/screenshots/*.png (written by node scripts/e2e.js and docs/process/scripts/*screenshots*.mjs)`, `docs/screenshots/*.png (top level: written by test/e2e/ui.e2e.js through node scripts/e2e.js)`, `docs/screenshots/<workstream>/ (dated QA and audit captures: historical, not refreshed)`
- **Used in:** `README.md:27` (README); `docs/QA.md:71` (docs)
- **Validator:** none automatic (images); README image paths are checked by readers. The e2e run that writes them asserts the UI invariants (test/e2e/ui.e2e.js).
- **Before:** manual (re-captured whenever someone ran the e2e suite)
- **Checklist:**
  - [ ] Re-capture after a visible data/UI change; README screenshots are illustrative, so a quarterly refresh is enough.
  - [ ] With real snapshots (gh run download --repo alvations/melon-seek --name job-board-snapshots --dir data/snapshots) and Playwright outside the repo (npm i playwright --no-save, or NODE_PATH to an install), run node scripts/e2e.js; it rewrites docs/screenshots/{chart,map,drawer,drawer-juice,insights,map-juice,dark,dark-drawer,mobile}.png.
  - [ ] Look at chart.png and map.png (README): no demo badge, numbers plausible; commit only the top-level images.
  - [ ] Never re-capture the dated folders (qa-desktop, qa-mobile, audit, fix-frontend, juice-household, ux-layout, mobile): they illustrate dated reports.
  - [ ] Set asOf and lastChecked for docs-screenshots in data/freshness.json.
- **Notes:** Illustrative, so a quarterly refresh is enough; the working tree on 2026-10-10 already had re-captured chart/drawer/insights/map-juice images from another agent's run (uncommitted). Not regenerated in the monthly workflow: it needs the real snapshots plus a browser (ubuntu-latest has Chromium; see og-card), and images are not byte-stable, so every run would open a PR.

</details>

<details><summary><code>strategy-market-figures</code>: Third-party market statistics cited in docs/strategy/*.md (competitive analysis and roadmap): not shown in the product.</summary>

- **Type / cadence / mechanism:** static-data · yearly (+90 days grace) · manual via `manual`
- **Values:** Zestimate median error 1.78% on / 7.20% off market; Indeed 50.4% of US postings with pay (Jul 2026, 48.5% a year earlier); Glassdoor 67% of ranges contain reported pay (22% below, 11% above); Greenhouse 18–22% ghost postings (2024); Zillow residential revenue $417M Q1 2025; LinkedIn ~$17.8B FY2025; Premium Career $39.99/mo; OpenAI median base ~$300–310K vs ~$870K total (blog-grade)
- **As of:** 2026-10-02 · last checked -
- **Source:** [cited sources S1..S70 in docs/strategy/COMPETITIVE_ANALYSIS…](https://www.hiringlab.org/) (third-party publications (quoted facts))
- **Defined in:** `docs/strategy/COMPETITIVE_ANALYSIS.md`, `docs/strategy/ROADMAP.md`, `docs/strategy/CORPORATE_LADDER_PLAN.md (lines 17 and 78-85: cross-level figures from the 2026-10-02 snapshots: 41% Mid by default, OpenAI unlevelled $338K vs Senior $247K, years-vs-level 88/91/82-90%)`
- **Used in:** `docs/strategy/COMPETITIVE_ANALYSIS.md:31` (docs); `docs/strategy/COMPETITIVE_ANALYSIS.md:26` (docs)
- **Validator:** none (prose)
- **Before:** none
- **Checklist:**
  - [ ] Yearly strategy review: re-check Indeed Hiring Lab pay-transparency share and Zillow Zestimate accuracy pages; add the new figure with its date, keep the old one (history).
  - [ ] Yearly strategy review: re-check the Indeed Hiring Lab pay-transparency share and the Zillow Zestimate accuracy page (and any figure a decision relies on).
  - [ ] Add the new figure next to the old one with both dates (history, never overwrite); keep its source id.
  - [ ] Set asOf and lastChecked for strategy-market-figures in data/freshness.json.
- **Notes:** Not product numbers and not machine-checkable (third-party pages); the product never shows them, so no as-of label is needed. Values copied from freshness-audit-surface's proposal; source.url points at Indeed Hiring Lab (the most-cited series) because a GitHub URL is not a source. CORPORATE_LADDER_PLAN.md figures are dated snapshot figures (2026-10-02); jobs.js seniority-ladder computes the current Mid-by-default share with a different word list (48.8% on 2026-10-02), so re-check them at the yearly review.

</details>

<details><summary><code>ui-stat-thresholds</code>: PROPOSED NEW ID. Product-policy thresholds that decide what the UI shows (top-N, minimum counts, labels, axis caps).</summary>

- **Type / cadence / mechanism:** product-policy · yearly (+60 days grace) · manual via `manual`
- **Values:** see owners
- **As of:** 2026-10-02 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `public/features/insights.js:58 skill premium top 12, n ≥ 3`, `public/features/insights.js:240 departments with ≥ 3 salaried roles, top 10`, `public/features/insights.js:272 copy "fewer than 3" (hard-coded)`, `public/features/insights.js:278 hot locations top 8`, `public/features/insights.js:137 fit top 8, premium n ≥ 3; responsibilities top 10`, `public/features/insights.js:1 department axis P2–P98`, `public/app.js:2221 "Wide range" label at max/min ≥ 2.0×`, `public/app.js:3 salary slider cap`, `public/app.js:1953 drawer distribution 32 bins`, `public/viz/chart.js:1 chart bin widths $10K..$500K`, `public/viz/chart.js:101 robust axis: P1–P99 + 3·IQR fence`, `public/features/shared.js:155 deltas under $500 read ±$0; formatPct "<1%"`, `public/features/compstimate.js:712 accuracy floor ±1%`, `public/app.js:121 "just now" < 90 s, minutes < 1 h, hours < 1 d, days < 45 d, then a date (badge "Cached · N min ago")`, `public/app.js:3 salary-filter histogram 26/30 bins`, `public/app.js:374 keyword clouds show 14 (10 in popovers); checklists 10–14`, `public/features/comps.js:1 Compare default family needs ≥ 2 companies`
- **Used in:** `public/features/insights.js:239` (Insights); `public/app.js:2215` (drawer Juice block); `public/viz/chart.js:101` (chart); `docs/VETTING.md:30` (docs)
- **Validator:** test/features.test.js insights tests
- **Before:** none
- **Checklist:**
  - [ ] Yearly UX review; none of these follow the data automatically, but minimum-count thresholds (3) should be revisited as boards grow.

</details>

<details><summary><code>rents-us-hud-fmr</code>: HUD Fair Market Rents by bedroom count for the 30 HUD areas of the 40 US cities: the 2- and 3-bedroom ÷ 1-bedroom ratio…</summary>

- **Type / cadence / mechanism:** fetched · yearly (+60 days grace) · auto via `scripts/refresh/rents.js`
- **Values:** FY2026 FMRs: r2 1.096-1.258, r3 1.314-1.648 (San Francisco 1.211 / 1.547: $2,977 / $3,604 / $4,604)
- **As of:** 2025-10-01 · last checked -
- **Source:** [HUD Fair Market Rents (40th-percentile gross rent incl. uti…](https://www.huduser.gov/portal/datasets/fmr.html) (US government work (public domain))
- **Defined in:** `data/cities.json bedroomRatios["US:<HUD area>"] (30 entries: label, name, url, asOf, via, license, r2, r3)`, `data/cities.json cities[country=US].rent2brCenterLocal/USD, rent3brCenterLocal/USD + sources (ratioKey "US:...")`, `docs/process/scripts/juice-household-hud.mjs FMR (the figures as first read)`
- **Used in:** `server/juice.js:1291` (drawer Juice block); `server/juice.js:1187` (API); `public/app.js:2156` (drawer Juice block); `public/app.js:2178` (drawer Juice block); `public/app.js:2180` (Compare); `public/app.js:364` (badge); `public/app.js:520` (chart); `public/viz/map.js:114` (map); `public/features/freshness.js:105` (drawer Juice block); `server/index.js:822` (API); `scripts/build-static.js:717` (API); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:439` (methodology page); `test/juice-household.test.js` (tests)
- **Validator:** scripts/refresh/rents.js validateFamily() (1 < 2 < 3 bedroom levels; ratio move > 15% or level move > 25% between releases = flag; release not in the future or older than encoded) and validateRentDoc() (update-col validateDoc: 1 < 2 < 3 rents, dated classed https sources, USD = local / FX; city count and keys unchanged; outside < centre unless already so; no asOf in the future; every source has c…
- **Before:** manual (docs/process/scripts/juice-household-rents.mjs + juice-data-probe.yml, LIVABILITY.md §6)
- **Checklist:**
  - [ ] HUD publishes the next fiscal year's FMRs in August/September (Federal Register), effective 1 October; the refresh alerts (drift) when the Federal Register shows a newer FY than the eGIS service.
  - [ ] Preferred: add the free HUD USER API token as repository secret HUD_API_TOKEN; the monthly refresh then reads the new FY for each area (FMR_CODE) and writes it through the review PR.
  - [ ] By hand: read each area's new 1/2/3-bedroom FMRs, update bedroomRatios["US:<area>"] (label, name, asOf "<FY-1>-10", r2, r3) and re-derive the US cities' 2- and 3-bedroom rents (1-bedroom × ratio, cents) and USD fields; run node --test test/juice.test.js test/juice-household.test.js test/refresh-col.test.js.
- **Notes:** Live finding on 2026-10-10: FY2027 FMRs are published (Federal Register 2026-17891, 2026-09-01, effective 2026-10-01) but the eGIS service still has FY2026 (data edited 2025-09-30), so the result is drift until HUD_API_TOKEN is set or HUD updates eGIS. The FY2026 FMRs were also revised (Federal Register 2026-07741, 2026-04-21); whether any of the 30 areas changed is unverified (eGIS was not re-edited after 2025-09-30). huduser.gov xlsx downloads answer scripts with HTTP 202 (bot challenge), not used. HUD USER API response shape is coded from the documentation; not verified live (no token).

</details>

<details><summary><code>rents-gb-ons</code>: ONS Price Index of Private Rents, Table 1: mean monthly private rent by bedrooms for London, Cambridge, Oxford, Manches…</summary>

- **Type / cadence / mechanism:** fetched · monthly (+21 days grace) · auto via `scripts/refresh/rents.js`
- **Values:** london 1.268/1.502, cambridge 1.284/1.518, oxford 1.234/1.506, manchester 1.229/1.429, scotland 1.298/1.67 (August 2026)
- **As of:** 2026-08-01 · last checked 2026-10-10
- **Source:** [ONS Price Index of Private Rents, UK: monthly price statist…](https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics) (Open Government Licence v3.0)
- **Defined in:** `data/cities.json bedroomRatios GB-london, GB-cambridge, GB-oxford, GB-manchester, GB-scotland`, `data/cities.json cities london-gb, cambridge-gb, oxford-gb, manchester-gb, edinburgh-gb rent2br/3br + sources`
- **Used in:** `server/juice.js:1291` (drawer Juice block); `server/juice.js:1187` (API); `public/app.js:2156` (drawer Juice block); `public/app.js:2178` (drawer Juice block); `public/app.js:2180` (Compare); `public/app.js:364` (badge); `public/app.js:520` (chart); `public/viz/map.js:114` (map); `public/features/freshness.js:105` (drawer Juice block); `server/index.js:822` (API); `scripts/build-static.js:717` (API); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:439` (methodology page); `test/juice-household.test.js` (tests)
- **Validator:** scripts/refresh/rents.js validateFamily() (1 < 2 < 3 bedroom levels; ratio move > 15% or level move > 25% between releases = flag; release not in the future or older than encoded) and validateRentDoc() (update-col validateDoc: 1 < 2 < 3 rents, dated classed https sources, USD = local / FX; city count and keys unchanged; outside < centre unless already so; no asOf in the future; every source has c…
- **Before:** manual (docs/process/scripts/juice-household-rents.mjs + juice-data-probe.yml, LIVABILITY.md §6)
- **Checklist:**
  - [ ] Open the ONS dataset page; the newest edition is the first xlsx link (the URL carries the release date).
  - [ ] Table 1: latest "Time period" rows for London, Cambridge, Oxford, Manchester and Scotland; "Rental price one bed / two bed / three bed".
  - [ ] Update bedroomRatios GB-* (label, name, asOf, file, note, r2, r3) and re-derive the five cities' 2- and 3-bedroom rents; London feeds the pooled ratio (rents-bedroom-ratios).
- **Notes:** The refresh reads the landing page every month (real fixture) and only downloads the xlsx (18.6 MB, 16 September 2026 edition) when a newer edition is linked; Table 1 is parsed by the dependency-free xlsx reader in rents.js. That reader is verified on the real NSW workbook; on the ONS workbook only the header and values are verified (from juice-data-probe logs), because the full file could not be brought into the sandbox as a fixture. If parsing fails the result is drift with this checklist, never a guess.

</details>

<details><summary><code>rents-ie-rtb</code>: RTB Rent Index via CSO PxStat RIQ02: new-tenancy average monthly rent by bedrooms, Dublin, all property types (bedroom …</summary>

- **Type / cadence / mechanism:** fetched · quarterly (+120 days grace) · auto via `scripts/refresh/rents.js`
- **Values:** Dublin 1.294/1.486 (2025 Q4: €1,740.68 / €2,253.28 / €2,585.87)
- **As of:** 2025-12-01 · last checked 2026-10-10
- **Source:** [Residential Tenancies Board Rent Index, CSO PxStat table RI…](https://data.cso.ie/table/RIQ02) (CC BY 4.0 (CSO))
- **Defined in:** `data/cities.json bedroomRatios.IE`, `data/cities.json cities dublin-ie rent2br/3br + sources`
- **Used in:** `server/juice.js:1291` (drawer Juice block); `server/juice.js:1187` (API); `public/app.js:2156` (drawer Juice block); `public/app.js:2178` (drawer Juice block); `public/app.js:2180` (Compare); `public/app.js:364` (badge); `public/app.js:520` (chart); `public/viz/map.js:114` (map); `public/features/freshness.js:105` (drawer Juice block); `server/index.js:822` (API); `scripts/build-static.js:717` (API); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:439` (methodology page); `test/juice-household.test.js` (tests)
- **Validator:** scripts/refresh/rents.js validateFamily() (1 < 2 < 3 bedroom levels; ratio move > 15% or level move > 25% between releases = flag; release not in the future or older than encoded) and validateRentDoc() (update-col validateDoc: 1 < 2 < 3 rents, dated classed https sources, USD = local / FX; city count and keys unchanged; outside < centre unless already so; no asOf in the future; every source has c…
- **Before:** manual (docs/process/scripts/juice-household-rents.mjs + juice-data-probe.yml, LIVABILITY.md §6)
- **Checklist:**
  - [ ] data.cso.ie/table/RIQ02: latest quarter, Dublin, all property types, one/two/three bed; update bedroomRatios.IE and re-derive Dublin (and the pooled ratio).
- **Notes:** RIQ02 is published with a long lag (2025 Q4 appeared 2026-05-14), hence 120 days grace on a quarterly cadence. Dublin postal districts are empty in RIQ02, so the county figure is used. The full cube is 7.7 MB; the refresh asks the JSON-RPC API for 219 values (falls back to the full cube if the query fails).

</details>

<details><summary><code>rents-ch-zurich</code>: Statistik Stadt Zürich Mietpreiserhebung: median net rent of private flats let in the last 2 years, whole city, by room…</summary>

- **Type / cadence / mechanism:** fetched · yearly (+400 days grace) · auto via `scripts/refresh/rents.js`
- **Values:** CH 1.227/1.467 (April 2026: 2 / 3 / 4 rooms CHF 1,834 / 2,250 / 2,690)
- **As of:** 2026-04-01 · last checked 2026-10-10
- **Source:** [Stadt Zürich open data, bau_whg_mpe_mietpreis_raum_zizahl_g…](https://data.stadt-zuerich.ch/dataset/bau_whg_mpe_mietpreis_raum_zizahl_gn_jahr_od5161) (CC0 (Creative Commons Zero, per the dataset metadata, read 2026-10-10))
- **Defined in:** `data/cities.json bedroomRatios.CH`, `data/cities.json cities zurich-ch, geneva-ch rent2br/3br + sources`
- **Used in:** `server/juice.js:1291` (drawer Juice block); `server/juice.js:1187` (API); `public/app.js:2156` (drawer Juice block); `public/app.js:2178` (drawer Juice block); `public/app.js:2180` (Compare); `public/app.js:364` (badge); `public/app.js:520` (chart); `public/viz/map.js:114` (map); `public/features/freshness.js:105` (drawer Juice block); `server/index.js:822` (API); `scripts/build-static.js:717` (API); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:439` (methodology page); `test/juice-household.test.js` (tests)
- **Validator:** scripts/refresh/rents.js validateFamily() (1 < 2 < 3 bedroom levels; ratio move > 15% or level move > 25% between releases = flag; release not in the future or older than encoded) and validateRentDoc() (update-col validateDoc: 1 < 2 < 3 rents, dated classed https sources, USD = local / FX; city count and keys unchanged; outside < centre unless already so; no asOf in the future; every source has c…
- **Before:** manual (docs/process/scripts/juice-household-rents.mjs + juice-data-probe.yml, LIVABILITY.md §6)
- **Checklist:**
  - [ ] Download BAU516OD5161.csv; rows Ganze Stadt / Neubezug bis 2 Jahre / Nicht gemeinnützig / Wohnung / netto, latest StichtagDatJahr, 2/3/4 Zimmer qu50; update bedroomRatios.CH and re-derive Zurich and Geneva (and the pooled ratio).
- **Notes:** The survey is biennial (2022, 2024, 2026; reference month April), so the next release is expected in 2028: yearly cadence with ~13 months grace. Licence: the CKAN metadata says CC0 (license_id cc-zero); data/cities.json still says "licence as stated on the dataset page" (cosmetic, not changed by the refresh). Geneva uses the Zurich ratio (no Geneva source).

</details>

<details><summary><code>rents-fr-olap</code>: Observatoires locaux des loyers (OLAP), national results on data.gouv.fr: Paris intra-muros median rent by rooms for te…</summary>

- **Type / cadence / mechanism:** fetched · yearly (+120 days grace) · auto via `scripts/refresh/rents.js`
- **Values:** Paris 1.483/2.159 (loyers 2025: 2 / 3 / 4+ rooms €1,180 / €1,750 / €2,548)
- **As of:** 2025-01-01 · last checked 2026-10-10
- **Source:** [Résultats nationaux des observatoires locaux des loyers (Ba…](https://www.data.gouv.fr/fr/datasets/resultats-nationaux-des-observatoires-locaux-des-loyers/) (Licence Ouverte / Open Licence 2.0)
- **Defined in:** `data/cities.json bedroomRatios.FR`, `data/cities.json cities paris-fr rent2br/3br + sources`
- **Used in:** `server/juice.js:1291` (drawer Juice block); `server/juice.js:1187` (API); `public/app.js:2156` (drawer Juice block); `public/app.js:2178` (drawer Juice block); `public/app.js:2180` (Compare); `public/app.js:364` (badge); `public/app.js:520` (chart); `public/viz/map.js:114` (map); `public/features/freshness.js:105` (drawer Juice block); `server/index.js:822` (API); `scripts/build-static.js:717` (API); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:439` (methodology page); `test/juice-household.test.js` (tests)
- **Validator:** scripts/refresh/rents.js validateFamily() (1 < 2 < 3 bedroom levels; ratio move > 15% or level move > 25% between releases = flag; release not in the future or older than encoded) and validateRentDoc() (update-col validateDoc: 1 < 2 < 3 rents, dated classed https sources, USD = local / FX; city count and keys unchanged; outside < centre unless already so; no asOf in the future; every source has c…
- **Before:** manual (docs/process/scripts/juice-household-rents.mjs + juice-data-probe.yml, LIVABILITY.md §6)
- **Checklist:**
  - [ ] data.gouv.fr dataset: newest Base_OP_<year>_Nationale.csv; rows agglomeration "Paris intra-muros", anciennete "1. Moins de 1 an", nombre_pieces Ensemble 2P/3P/4P+, loyer_mensuel_median; update bedroomRatios.FR and re-derive Paris (and the pooled ratio).
- **Notes:** Data year Y = rents at 1 January Y; files appear during Y (the 2025 file was created 2026-01-13 and re-issued 2026-10-06). The CSV is Latin-1 and semicolon-separated. The "4 rooms or more" class (≈99 m²) overstates a 3-bedroom flat (documented in the entry note).

</details>

<details><summary><code>rents-ca-statcan</code>: Statistics Canada table 46-10-0092-01 (with CMHC): average asking rent for apartments by bedrooms, Toronto, Vancouver, …</summary>

- **Type / cadence / mechanism:** fetched · quarterly (+45 days grace) · auto via `scripts/refresh/rents.js`
- **Values:** toronto 1.268/1.565, vancouver 1.329/1.82, montreal 1.23/1.527, ottawa 1.242/1.442 (2026 Q2)
- **As of:** 2026-04-01 · last checked 2026-10-10
- **Source:** [Statistics Canada, Quarterly rent statistics, table 46-10-0…](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=4610009201) (Statistics Canada Open Licence)
- **Defined in:** `data/cities.json bedroomRatios CA-toronto, CA-vancouver, CA-montreal, CA-ottawa`, `data/cities.json cities toronto-on-ca, vancouver-bc-ca, montreal-qc-ca, ottawa-on-ca rent2br/3br + sources`
- **Used in:** `server/juice.js:1291` (drawer Juice block); `server/juice.js:1187` (API); `public/app.js:2156` (drawer Juice block); `public/app.js:2178` (drawer Juice block); `public/app.js:2180` (Compare); `public/app.js:364` (badge); `public/app.js:520` (chart); `public/viz/map.js:114` (map); `public/features/freshness.js:105` (drawer Juice block); `server/index.js:822` (API); `scripts/build-static.js:717` (API); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:439` (methodology page); `test/juice-household.test.js` (tests)
- **Validator:** scripts/refresh/rents.js validateFamily() (1 < 2 < 3 bedroom levels; ratio move > 15% or level move > 25% between releases = flag; release not in the future or older than encoded) and validateRentDoc() (update-col validateDoc: 1 < 2 < 3 rents, dated classed https sources, USD = local / FX; city count and keys unchanged; outside < centre unless already so; no asOf in the future; every source has c…
- **Before:** manual (docs/process/scripts/juice-household-rents.mjs + juice-data-probe.yml, LIVABILITY.md §6)
- **Checklist:**
  - [ ] Download 46100092-eng.zip; Average asking rent, Apartment - 1 bedroom / 2 bedrooms / 3 or more bedrooms, latest REF_DATE per CMA; update bedroomRatios CA-* and re-derive the four cities (Toronto also moves the pooled ratio).
- **Notes:** Same measure as the 1-bedroom quote (asking rents of listed units), so LIVABILITY §7 calls it a candidate direct replacement for the Numbeo 1-bedroom figures (not done: needs D6). The zip is 129 KB.

</details>

<details><summary><code>rents-sg-hdb</code>: HDB median rent by town and flat type (data.gov.sg), Central Area: the 4-room ÷ 3-room step that gives Singapore's 3-be…</summary>

- **Type / cadence / mechanism:** fetched · quarterly (+45 days grace) · auto via `scripts/refresh/rents.js`
- **Values:** SG 1.281/1.786 (2026 Q2 Central Area 3-room S$3,300, 4-room S$4,600; step 1.394)
- **As of:** 2026-06-01 · last checked 2026-10-10
- **Source:** [Housing & Development Board, Median Rent by Town and Flat T…](https://data.gov.sg/datasets/d_23000a00c52996c55106084ed0339566/view) (Singapore Open Data Licence)
- **Defined in:** `data/cities.json bedroomRatios.SG`, `data/cities.json cities singapore-sg rent2br/3br + sources`
- **Used in:** `server/juice.js:1291` (drawer Juice block); `server/juice.js:1187` (API); `public/app.js:2156` (drawer Juice block); `public/app.js:2178` (drawer Juice block); `public/app.js:2180` (Compare); `public/app.js:364` (badge); `public/app.js:520` (chart); `public/viz/map.js:114` (map); `public/features/freshness.js:105` (drawer Juice block); `server/index.js:822` (API); `scripts/build-static.js:717` (API); `docs/LIVABILITY.md:168` (methodology page); `docs/LIVABILITY.md:394` (methodology page); `docs/LIVABILITY.md:439` (methodology page); `test/juice-household.test.js` (tests)
- **Validator:** scripts/refresh/rents.js validateFamily() (1 < 2 < 3 bedroom levels; ratio move > 15% or level move > 25% between releases = flag; release not in the future or older than encoded) and validateRentDoc() (update-col validateDoc: 1 < 2 < 3 rents, dated classed https sources, USD = local / FX; city count and keys unchanged; outside < centre unless already so; no asOf in the future; every source has c…
- **Before:** manual (docs/process/scripts/juice-household-rents.mjs + juice-data-probe.yml, LIVABILITY.md §6)
- **Checklist:**
  - [ ] data.gov.sg HDB median rent: latest quarter, town CENTRAL, 3-RM and 4-RM; SG r3 = pooled r2 × (4-RM ÷ 3-RM); update bedroomRatios.SG and re-derive Singapore.
- **Notes:** Public housing only; URA private-rent data needs an API key. data.gov.sg ignores the sort parameter, so the refresh reads all CENTRAL records (509 today, limit 1000).

</details>

<details><summary><code>job-juice</code>: Juice Score per salaried job (best location: net, score, grade, confidence), computed with data/cities.json in the brow…</summary>

- **Type / cadence / mechanism:** derived-at-build · daily (+2 days grace) · detect via `pipeline: public/api.js attachJuiceAll in the browser; scripts/build-static.js share pages; monthly check scripts/refresh/jobs.js`
- **Values:** job.juice { best { net, score, grade, confidence, ... }, byLocation, salaryUSD, household }; 2026-10-02: 4,034 of 4,551 salaried postings scored (median score 67; Anthropic 87, Palantir 38); coverage 69% (xAI) to 98% (Scale AI)
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [derived: vetted pay x data/cities.json (rents, cost index, …](https://alvations.github.io/melon-seek/api/cities.json) (derived)
- **Defined in:** `server/juice.js:1442 attachJuice`, `server/juice.js:1496 attachJuiceAll`, `server/juice.js:1219 computeJuice`, `data/cities.json (registry cities-dataset)`
- **Used in:** `public/api.js:697` (API); `public/app.js:2125` (drawer Juice block); `public/app.js:364` (badge); `public/app.js:1345` (badge); `public/viz/map.js` (map)
- **Validator:** scripts/refresh/jobs.js job-juice; test/juice.test.js; test/juice-household.test.js
- **Before:** computed per page load; no coverage check
- **Checklist:**
  - [ ] Monthly (jobs.js job-juice): share of salaried postings with a Juice Score per company; drift when it falls 10+ points month over month or is under 50% (30+ salaried). The findings list the top unscored locations: add those cities to data/cities.json (cities-dataset).
  - [ ] The score curve and grades are reviewed under juice-score-anchors / juice-grades (policy.js), the inputs under rents-*, cost-index, tax-*, fx-per-usd.
- **Notes:** Changes whenever any Juice input changes (FX, rents, cost index, tax rules, households). The per-company score distribution is archived in jobs-aggregates.

</details>

<details><summary><code>jobs-aggregates</code>: Monthly dated aggregate of every job and company number (per company counts, medians, vetting tiers, lexicon coverage, …</summary>

- **Type / cadence / mechanism:** derived-at-build · monthly (+14 days grace) · detect via `scripts/refresh/jobs.js`
- **Values:** format melon-jobs-aggregates-1 (docs/process/freshness-jobs.md §3); ~125 KB for the 8 stable boards
- **As of:** 2026-10-02 · last checked 2026-10-10
- **Source:** [derived from the vetted job snapshots (daily build)](https://alvations.github.io/melon-seek/api/market.json) (derived; facts from public job postings)
- **Defined in:** `scripts/refresh/jobs.js buildAggregate`, `Result.archive { dataset: "jobs-aggregates", asOf, json } -> run.js <out>/archive/jobs-aggregates/<asOf>.json -> scripts/archive/record.js`
- **Used in:** `data-archive branch reference/jobs-aggregates/<asOf>.json` (API); `scripts/refresh/jobs.js readPreviousAggregate` (API)
- **Validator:** scripts/refresh/jobs.js buildAggregate; test/refresh-jobs.test.js (format, round trip through readPreviousAggregate)
- **Before:** none (no monthly job/company history existed)
- **Checklist:**
  - [ ] Produced on every monthly run; nothing to do unless the run errors. To compare months: read reference/jobs-aggregates/*.json on the data-archive branch.
- **Notes:** Month-over-month checks fall back to absolute bounds when no archived version is available (MELON_ARCHIVE_DIR).

</details>

<details><summary><code>insights-distributions</code>: Insights panel statistics computed in the browser for the jobs in view: headline tiles (roles, % with pay, median, midd…</summary>

- **Type / cadence / mechanism:** derived-at-build · daily (+2 days grace) · manual via `pipeline: computed in the browser from the daily list (public/features/insights.js)`
- **Values:** skill premium: 12 most frequent skills with >= 3 salaried postings, premium = skill median - all median; departments: boxes p10/p25/median/p75/p90, departments with < 3 salaried hidden; hot locations top 8; fit requirements top 8 (premium needs >= 3); responsibilities top 10-12
- **As of:** 2026-10-02 · last checked -
- **Source:** [derived from the vetted job snapshots (daily build)](https://alvations.github.io/melon-seek/api/market.json) (derived; facts from public job postings)
- **Defined in:** `public/features/insights.js:74 summaryStats`, `public/features/insights.js:97 skillPremiums (limit 12, minCount 3)`, `public/features/insights.js:134 deptBoxes`, `public/features/insights.js:159 hotLocations (limit 8)`, `public/features/insights.js:188 fitRequirements (limit 8, minPremiumN 3)`, `public/features/insights.js:219 topResponsibilities (limit 12)`
- **Used in:** `public/app.js:1646` (Insights)
- **Validator:** test/features.test.js (insights pure helpers)
- **Before:** computed per page load
- **Checklist:**
  - [ ] No monthly module: the numbers follow the daily list. Review the minimum counts (3) and limits with ui-stat-thresholds when the Insights design changes.
- **Notes:** Not archived separately: its inputs (per job pay, keywords, departments) are versioned in the archive jobs table and summarized in jobs-aggregates.

</details>

<details><summary><code>market-comps-policy</code>: Market comps policy: minimum postings per cell (minN 3), $100 rounding of p25/median/p75, the "Same role elsewhere" fal…</summary>

- **Type / cadence / mechanism:** product-policy · yearly (+60 days grace) · manual via `scripts/refresh/policy.js`
- **Values:** MIN_N 3; round100; compsForJob exact family+seniority, else family "*", else none; comps.js copy "companies need ${minN \|\| 3}+ salaried postings"
- **As of:** 2026-10-02 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `scripts/build-market.js:47 MIN_N`, `scripts/build-market.js:62 round100`, `public/features/comps.js:101 compsForJob`, `public/features/comps.js:172 / :207 minN \|\| 3 fallback copy`, `scripts/archive/report.js:32 MIN_N (copy; test/freshness-policy.test.js keeps it equal)`
- **Used in:** `public/app.js:2426` (Same role elsewhere); `public/app.js:1655` (Compare); `public/features/comps.js:207` (Compare); `docs/CONTRACT.md` (docs)
- **Validator:** scripts/refresh/policy.js market-comps-policy; test/market.test.js
- **Before:** none
- **Checklist:**
  - [ ] Monthly data check (policy.js): share of salaried, family-assigned postings whose exact company x family x level cell is suppressed by minN (<= 50%); comps.js fallback copy equals MIN_N; build-market.js still rounds to $100.
  - [ ] Any change: build-market.js, comps.js copy, docs/CONTRACT.md, test/market.test.js together; set lastReviewed.
- **Notes:** 2026-10-02: 5.3% of salaried postings fall back from their exact cell; 191 of 446 company x family x level groups are under minN.

</details>

<details><summary><code>archive-reports</code>: The archive's review reports on the data-archive branch: per company and month medianUSD, withinYearPct, yoyPct, crossL…</summary>

- **Type / cadence / mechanism:** derived-at-build · daily · auto via `pipeline: .github/workflows/archive.yml (scripts/archive/report.js) after every snapshot, Pages and monthly-refresh run`
- **Values:** reports/<YYYY-MM>.md and the annual report, regenerated by every archive ingest
- **As of:** - · last checked -
- **Source:** [derived from the archive (jobs table and the reference data…](https://github.com/alvations/melon-seek/tree/data-archive) (derived; facts from public job postings)
- **Defined in:** `scripts/archive/report.js`, `scripts/archive/monthly.js computeMonth`, `scripts/archive/report.js:38 money() (half-up: $352,500 reads $353K; the site and share pages read $352K)`
- **Used in:** `data-archive branch reports/ (monthly and annual review)` (archive reports); `docs/DATA_ARCHIVE.md` (docs)
- **Validator:** test/archive*.test.js; scripts/archive/verify.js before every archive commit
- **Before:** none
- **Checklist:**
  - [ ] Read the monthly report after each monthly refresh PR merges: a pay change that equals the FX move of the month is a conversion effect, not a pay change (see notes).
- **Notes:** yoyPct and vsPrevious compare USD medians converted at each version's FX, so the first FX refresh (Big Mac -> ECB; KRW -8.6%, JPY -3.5% on the Sep 2026 table) reads as a pay change for non-USD postings until the archive adds a native-currency or constant-FX column (archive agent). report.js money() rounds half-up while palette formatMoney / build-static money truncate, so the same median can read $1K apart. report.js MIN_N and LADDER are copies (archive-policy, seniority-ladder).

</details>

<details><summary><code>archive-policy</code>: Archive thresholds behind the opened / closed counts and the report cells: unseen-close days, partial-observation guard…</summary>

- **Type / cadence / mechanism:** product-policy · yearly · manual via `manual`
- **Values:** UNSEEN_CLOSE_DAYS 30; SUSPECT_DROP_SHARE 0.5; SUSPECT_DROP_MIN_OPEN 40; MIN_N 3
- **As of:** 2026-10-10 · last checked -
- **Source:** [melon-seek (our own choice)](https://github.com/alvations/melon-seek) (no licence file; owner decision pending (the repo has no LICENSE and package.json no "license" field, so the code and o…)
- **Defined in:** `scripts/archive/jobs.js:24 UNSEEN_CLOSE_DAYS`, `scripts/archive/jobs.js:26 SUSPECT_DROP_SHARE`, `scripts/archive/jobs.js:27 SUSPECT_DROP_MIN_OPEN`, `scripts/archive/jobs.js:368 CELL_COLUMNS (p10 / p90 level cells, minN 1)`, `scripts/archive/report.js:32 MIN_N (copy of scripts/build-market.js MIN_N)`
- **Used in:** `data-archive branch reports/ (monthly and annual review)` (archive reports); `docs/DATA_ARCHIVE.md` (docs)
- **Validator:** test/freshness-policy.test.js (report.js MIN_N and LADDER equal their sources); test/archive*.test.js
- **Before:** none
- **Checklist:**
  - [ ] Yearly, or when a board changes how it lists postings: compare the archive report's opened / closed / unseen counts with the boards; a board that hides postings for weeks needs a longer UNSEEN_CLOSE_DAYS.
  - [ ] Keep scripts/archive/report.js MIN_N equal to scripts/build-market.js MIN_N and LADDER equal to public/features/roles.js SENIORITY_LADDER (test/freshness-policy.test.js; better: import them).
  - [ ] A change of any value changes every later report: note it in docs/DATA_ARCHIVE.md with the date.

</details>

<!-- freshness:inventory:end -->
