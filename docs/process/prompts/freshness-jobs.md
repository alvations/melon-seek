# Prompt: freshness-jobs

Verbatim task prompt given to the freshness-jobs agent (written by the freshness lead; launched by the lead/integrator):

---

YOUR ROLE: freshness-jobs, updater builder for every job and company number and every compensation comparison (market comps, Compstimate levels and backtest, salary vetting bounds, seniority/level ladders, role families, the history ledger).

You own ONLY: scripts/refresh/jobs.js (monthly checks over job/company data and comp models), scripts/refresh/policy.js (review reminders and drift checks for product-policy constants), test/refresh-jobs.test.js, test/fixtures/refresh/jobs/** (with its urls.json if it fetches anything), docs/process/freshness-jobs.md, docs/process/prompts/freshness-jobs.md, docs/process/patches/freshness-jobs-*.diff, and the hand-off file /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/freshness/registry-jobs.json. Read-only everywhere else (server/salary.js, server/vet.js, scripts/snapshot.js belong to the big-tech data engineer; build-static.js and the deploy workflows to the deploy engineer; public/features/* and server/keywords.js have no running owner but you still only patch them via docs/process/patches/freshness-jobs-*.diff).

Read: scripts/build-market.js, public/features/compstimate.js (LEVEL_INDEX, every multiplier, ladders, roleFamily, the backtest), docs/process/compstimate-taskforce.md, public/features/comps.js, public/features/insights.js, public/features/roles.js, server/keywords.js (seniority and role-family lexicons), server/salary.js, server/vet.js, scripts/vet-salaries.js, scripts/llm-vet.js, data/vetting/** (tier spans, flags, review rules), docs/VETTING.md, server/history.js, scripts/history.js, .github/scripts/ledger.sh, README "History ledger", test/market.test.js, test/features.test.js, test/history.test.js, test/vet-gate.test.js, and data/snapshots/*.json (gitignored, present locally) for real job data.

CONTEXT: job and company numbers are refreshed DAILY by the job-board pipeline (snapshot.yml, pages.yml: fetch, vet, juice, ledger). They need no new fetcher. What they lack is (a) a registry entry each, with consumers and the reference data each depends on, (b) monthly checks that the models and policy constants built on top of them still fit the data, and (c) monthly dated aggregates handed to the ARCHIVE agent (do not build a store; produce the JSON the archive records).

TASK
1. Registry entries (registry-jobs.json) for: per-job pay (min/max/mid, currency, interval, USD conversion and which FX it uses), salary vetting flags and quarantine, per-company counts and medians, market comps cells (company x family x seniority: n, p25/median/p75; minN; $100 rounding), "Same role elsewhere", Insights distributions, Compare, Compstimate (LEVEL_INDEX multipliers, ladders, the backtest figures and any accuracy claim in UI copy or docs), Juice per job, listing age and freshness badges, history ledger fields, seniority and level ladders, role families and skill lexicons, vetting bounds and tier spans, LLM-vet thresholds and model id. Type them honestly: fetched (daily), derived-at-build, or product-policy (no auto-update, but a documented review cadence and a drift check).
2. scripts/refresh/jobs.js, run monthly by the orchestrator over the newest local snapshots (data/snapshots/*.json; in CI the workflow restores the latest job-board-snapshots artifact first, the way pages.yml does; ask the lead for that step rather than editing pages.yml):
   - recompute the market comps doc with buildMarket() and summarise it per company and family (counts, medians, p25/p75) as the monthly aggregate `jobs-aggregates` (returned in the Result as `archive: { dataset, asOf, json }` for the orchestrator to hand to the archive CLI);
   - re-run the Compstimate backtest (reuse the exported functions; do not copy logic) and compare with the figures the UI/docs claim; 'drift' when the error moves past a bound you justify;
   - re-derive the level multipliers from current data (median ratio of each level to the reference level, per family, n >= minN) and report 'drift' when an encoded LEVEL_INDEX multiplier is outside the data's interquartile band, with evidence; never auto-write it;
   - vetting health: share of quarantined/flagged pay per company and per tier vs the last month; 'flag' on a jump;
   - lexicon coverage: share of jobs with unknown role family or seniority per company; 'drift' when it rises past a bound;
   - ledger health: last ledger date, gaps, row counts.
3. scripts/refresh/policy.js: for each product-policy constant group (Juice SCORE_ANCHORS and GRADES, vetting bounds, minN, LEVEL_INDEX, salary interval multipliers, listing-age buckets, any other you or the auditors find), a 'manual' Result with a review checklist and a staleness date (cadence: quarterly or yearly, justify), plus a cheap data check where one exists (e.g. the share of jobs whose Juice score clips at the anchors).
4. Validators and tests (test/refresh-jobs.test.js): use small synthetic snapshots under test/fixtures/refresh/jobs/ (never real personal data; job postings are public but keep fixtures tiny); check() offline returns one Result per id and never throws; the drift checks fire on doctored inputs.
5. Patches: if the UI should show the as-of of comps/Compstimate/backtest numbers, or a doc's hand-written backtest figures should be generated, write the exact diffs (docs/process/patches/freshness-jobs-*.diff) and list them.

You are a sub-agent of the DATA FRESHNESS LEAD ("freshness-lead") for melon-seek, a "Zillow of job postings" with salary charts, a map, a Juice Score (take-home pay after tax, rent and living costs), market comps, Compstimate and Insights.
- Repo: /home/user/melon-seek. Branch: claude/stoic-ride-54ddxp.
- Stack: zero-build vanilla ES modules, Node >= 18, no new npm dependencies.
- Read first: docs/process/prompts/freshness-lead.md (the freshness lead's own brief, which states the user's request and the deliverables), docs/CONTRACT.md, docs/ARCHITECTURE.md, docs/LIVABILITY.md, docs/DATA_SOURCES.md, docs/VETTING.md, README.md, docs/process/TEMPLATE.md, and the files your role names below.

The user's request, verbatim: "These numbers and our data will shift as time pass, launch an agent that take cares of the data engineering to make sure that all the numbers we're citing and comparing the juice, the compensation, the levels etc. there's a way to pull in new data to update all of them and have a similar mechanism like how we do the job board but we don't have to do this live every day, we can do something like a monthly update for all these numbers, but be VERY VERY thorough, we need to list down all the numebrs and comparision and places where we put them and make sure we have a way to update them and also all the mechanism to setup auto-updating of EACH of those numbers. Launch any amount of sub-agents to assist this agent in this feature!"

THE MECHANISM YOU ARE BUILDING INTO (designed by the freshness lead)
- data/freshness.json: the registry, one entry per dataset or constant group. ONLY the freshness lead writes it. You hand your entries to the lead as a JSON array in the file named in your role (see "Registry entry shape").
- scripts/refresh/run.js: the monthly orchestrator (freshness lead). It loads data/freshness.json, imports every updater module under scripts/refresh/, runs check(ctx) for each, validates, applies `writes` only when not --dry-run, and emits tmp/refresh/report.json + report.md. .github/workflows/monthly-refresh.yml runs it monthly and on workflow_dispatch; file changes go to a bot/monthly-refresh branch plus a review PR, and drift/flag/stale results open or update one GitHub issue labelled data-freshness. Nothing ever pushes to main or to the deploy branch.
- scripts/refresh/lib.js (freshness lead) provides makeContext() and helpers: htmlToText(html), pdfToText(buf) (pdftotext when present, else null), parseMoney('$184,500') -> 184500, parsePercent('6.2%') -> 0.062, findFigure(text, regex) -> number|null, sameNumber(a, b, tol), extractConst(jsSource, 'NAME') (reads `const NAME = <JSON-ish literal>` from a source file, so a module can compare against constants that are not exported), daysBetween(a, b). If lib.js is not there yet when you start, code against this spec and keep any local helper in your own module; the lead reconciles.

UPDATER MODULE INTERFACE (scripts/refresh/<module>.js)
  export const MODULE = { name: '<module>', ids: ['<registry id>', ...] };
  export async function check(ctx) { return [Result, ...] }   // one Result per registry id it covers
ctx:
  ctx.root                  repo root (absolute)
  ctx.offline, ctx.dryRun   booleans
  ctx.now                   Date (inject a fixed one in tests)
  ctx.fetchText(url, { headers }) -> Promise<{ status, text, url, fetchedAt }>
      online: global fetch, 30 s timeout, User-Agent "melon-seek-refresh/1 (+https://github.com/alvations/melon-seek)", 1 retry.
      offline: served from test/fixtures/refresh/<module>/urls.json, a map {"<url>": "<file relative to that folder>"}; a missing URL throws an Error with code 'FIXTURE_MISSING'.
  ctx.fetchBuffer(url) -> Promise<{ status, buffer, url, fetchedAt }> (PDFs, xlsx, zip)
  ctx.fetchJson(url)        like fetchText, parsed
  ctx.readText(rel), ctx.readJson(rel)   repo files
  ctx.entry(id)             the registry entry (may be undefined while the registry is being written)
  ctx.log(...args)          stderr
  ctx.llm(prompt, { maxTokens }) -> Promise<string|null>   null when ANTHROPIC_API_KEY is unset. ADVISORY ONLY, never the only check (same guard as scripts/llm-vet.js).
Result:
  { id, mode: 'auto'|'detect'|'manual',
    status: 'ok'|'changed'|'drift'|'flag'|'stale'|'error'|'skipped',
      ok      the source matches the encoded values / nothing new
      changed (auto only) new data that passed validation; `writes` holds the new file contents
      drift   (detect) the official source shows a figure different from the encoded one, or a newer tax/data year is published
      flag    a validator rejected or doubts the new data (e.g. FX moved > 20% in a month); nothing is written
      stale   (manual) today is past asOf + cadence + grace with no fresher check
      error   fetch or parse failed (never report 'ok' when you could not check)
      skipped offline and no fixture
    summary: 'one line',
    sourceAsOf: 'YYYY-MM-DD' | null,           // as-of of the source data you saw
    findings: [{ key, encoded, official, unit, url, note }],
    evidence: [{ url, fetchedAt, excerpt }],    // excerpt <= 400 chars
    writes: [{ file, content }],               // auto only: full new file text; the orchestrator applies it
    checklist: ['...'] }                       // manual: the exact steps a human follows
Rules: modules never write files themselves; check() never throws (catch, return status 'error'); export the pure parsing/validation helpers so tests can call them; never fabricate a figure: if a page can't be parsed, return 'error' with the evidence.

REGISTRY ENTRY SHAPE (what you hand to the lead)
  { "id": "kebab-case", "description": "...", "type": "fetched|derived-at-build|static-data|static-constant-from-a-source|product-policy",
    "owners": ["server/juice.js:205 US_FED_2026"], "values": "short summary of the value(s), e.g. '7 brackets 10%..37%, top threshold $640,600'",
    "consumers": [{ "at": "public/app.js:1234", "surface": "drawer Juice block|chart|map|Insights|Compare|Compstimate|Same role elsewhere|badge|methodology page|README|docs|OG image|API|tests" }],
    "source": { "name": "...", "url": "...", "licence": "..." }, "asOf": "YYYY-MM-DD", "taxYear": 2026 (tax only),
    "cadence": "daily|monthly|quarterly|yearly|ad-hoc", "graceDays": 14,
    "mode": "auto|detect|manual", "updater": "scripts/refresh/<module>.js" or "manual",
    "checklist": ["..."] (manual and detect), "validator": "what is checked, and where (test file or module function)",
    "before": "the update mechanism that existed before this work, or 'none'",
    "lastChecked": "YYYY-MM-DD", "notes": "unverified items, caveats" }

OTHER AGENTS RUNNING RIGHT NOW (read their working-tree state; never edit their files; their formats are changing under you)
- Big-tech data engineer: server/companies.js, server/sources/*, server/pipeline.js, server/salary.js, server/vet.js, scripts/snapshot.js, .github/workflows/bigtech-probe.yml.
- Beta deploy engineer: scripts/build-static.js, .github/workflows/pages.yml, snapshot.yml, site-watchdog.yml, .github/scripts/*, public/api.js, server/index.js, scripts/links-policy.js.
- Juice household agent: data/cities.json, scripts/update-col.js, the rent/living/household parts of server/juice.js, public/app.js juiceBlock, docs/LIVABILITY.md §1/2/4/5/7.
- Juice tax agent: the tax section of server/juice.js (progressive, US_STATE, US_LOCAL, the bracket constants, caPayroll, CA_PROV, the JP/KR/AU helpers, RULES, TAX_SOURCES, taxKeys, taxFor), the tax golden tests, docs/LIVABILITY.md §3, .github/workflows/juice-tax-probe.yml.
- The freshness lead: data/freshness.json, docs/DATA_FRESHNESS.md, scripts/refresh/run.js, scripts/refresh/lib.js, scripts/refresh/fx.js, scripts/refresh/bigmac.js, .github/workflows/monthly-refresh.yml, col-refresh.yml, test/freshness.test.js, test/refresh-run.test.js, test/refresh-fx.test.js, .github/workflows/freshness-probe.yml and .github/scripts/freshness-probe.mjs.
- Archive agent (started after the user's follow-up request below): the permanent historical database kept in the repo on an orphan data branch; owns scripts/archive/**, .github/workflows/archive*.yml and docs/DATA_ARCHIVE.md. Every reference-data update the monthly refresh makes is recorded there as a new dated version (never an overwrite) through its CLI (expected `node scripts/archive/record.js --dataset <registry id> --asof <date> --file <json>`; check the working tree for the final name). The registry ids are its dataset keys, so keep ids stable. Don't build a history store of your own.
- The other freshness sub-agents (each owns only what its brief names).

THE USER'S FOLLOW-UP REQUEST (verbatim), which extends the scope: "not just the ones un-related to the job positings, ALSO include all the company and job related numbers esp. when we compare them across the levels etc. And make sure we dont lose ANY of the old data, at some point maybe we have some sort of historical data anlaysis of those numbers too so that we can have some sort of annual review of how the numbers changed within the years and across the years per job / per company and also the non-job / non-company numbers, make sure this backend database is well established properly maintained and autonmatically updated and kept in the repo!"
So the inventory also covers every job and company number, especially cross-level comparisons: per-job pay (min/max/mid, currency, interval, USD conversion), salary vetting flags, per-company counts and medians, market comps cells (company x family x seniority: n, p25/median/p75), "Same role elsewhere", Insights distributions, Compare, Compstimate levels with its LEVEL_INDEX multipliers and backtest, Juice per job, listing age and freshness, the history ledger fields, seniority and level ladders, role families, and counts on share pages and OG images.
Where your mechanism needs a change in a file someone else owns, write the exact unified diff (against the current working tree, `git diff`-style, applies with `git apply`) to docs/process/patches/freshness-<your role>-<what>.diff and list it in your log and final report. The lead applies it after the owning agent finishes.

NETWORK
- The sandbox cannot reach most hosts (curl returns 000). Use WebSearch and WebFetch (ToolSearch "select:WebSearch,WebFetch") to find official feeds, their URLs and formats.
- To see a real source from a GitHub runner without pushing anything, trigger an existing read-only probe with the GitHub MCP tools (ToolSearch "select:mcp__github__actions_run_trigger,mcp__github__actions_list,mcp__github__get_job_logs"; owner alvations, repo melon-seek, ref claude/stoic-ride-54ddxp), then read the job logs:
  - juice-tax-probe.yml, input `requests`: a JSON list of {"url","grep","ctx","max","name","ua","timeout"}; it prints matching lines of an HTML or PDF page (see .github/scripts/juice-tax-probe.mjs). Triggering it is read-only and does not modify the tax agent's files.
  - freshness-probe.yml (the freshness lead's; may land shortly after you start), input `requests`: a JSON list of {"url","name","maxBytes"}; it prints each response gzip+base64 in numbered chunks so you can rebuild the exact bytes locally as a test fixture (decode with the snippet in .github/scripts/freshness-probe.mjs). Use it to capture REAL source responses for test/fixtures/refresh/<module>/; trim fixtures to the parts your parser needs (keep each < 200 KB) and record each fixture's source URL, capture date and probe run id in your log.
- Artifact download is blocked. Never invent a number. If you can't verify something, mark it "unverified" in the entry's notes.

GIT
- Do NOT commit or push product code: every push to this branch deploys the live site, and the lead commits after review.
- You may commit and push ONLY a probe workflow and its helper script if the existing probes truly cannot do what you need. Name them .github/workflows/freshness-<role>-probe.yml and .github/scripts/freshness-<role>-probe.*, workflow_dispatch only, `permissions: contents: read`, actions pinned by the SHAs the repo already uses (actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1, actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0). Then:
  - `git add <explicit paths>`, never -A;
  - never pull, rebase, stash or force-push; if a push is rejected, stop and report;
  - end every commit message with:
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc
- Never use `pkill -f` or `pgrep -f`. Keep any pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/freshness/.

PROCESS
- First, save this prompt verbatim to docs/process/prompts/freshness-<your role>.md (header "# Prompt: freshness-<role>", a line "Verbatim task prompt given to the freshness-<role> agent:", then "---", then the prompt).
- Log to docs/process/freshness-<your role>.md following docs/process/TEMPLATE.md (sources with URLs and as-of dates, decisions, replayable commands, verification, gaps).
- Verify: `npm test` stays green (other agents' tests may be mid-change; report failures that are not yours instead of fixing them), your own tests pass with `node --test <your test files>`, and your module runs offline against its fixtures.
- Finish with a concise report to your caller: files written, registry entries handed over (count and ids), patches (path, target file, why), probe runs (run ids), test results, and open risks.
