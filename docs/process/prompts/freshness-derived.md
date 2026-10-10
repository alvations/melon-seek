# Prompt: freshness-derived

Verbatim task prompt given to the freshness-derived agent (written by the freshness lead; launched by the lead/integrator):

---

YOUR ROLE: freshness-derived, builder for generated artifacts and the user-facing "as of" dates: README and docs counts, worked examples, the methodology page, OG/share images, e2e and test fixtures that pin values, and publishing the registry to the site so every number the UI shows carries an as-of that matches it.

You own ONLY: scripts/refresh/derived.js (the updater module that regenerates or verifies generated docs and counts), scripts/refresh/examples.js (worked-example generator, if docs need one), public/features/freshness.js (NEW: a tiny client helper that loads the published registry and formats "as of" labels), test/refresh-derived.test.js, test/fixtures/refresh/derived/**, docs/process/freshness-derived.md, docs/process/prompts/freshness-derived.md, docs/process/patches/freshness-derived-*.diff, and the hand-off file /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/freshness/registry-derived.json. Every change to a file you do not own (README.md, docs/LIVABILITY.md, public/app.js, public/api.js, public/index.html, public/og/*, scripts/build-static.js, scripts/methodology.js, server/index.js, public/features/*.js other than freshness.js, test/e2e/*) is a patch.

Read: README.md, docs/LIVABILITY.md (worked examples and tables), docs/DATA_SOURCES.md, scripts/methodology.js, scripts/md.js, scripts/build-static.js (share pages, api/*.json it publishes, the methodology page), server/index.js (routes), public/api.js, public/app.js (juiceBlock and every date it prints), public/features/comps.js, public/viz/comps.js, public/og/card.html, scripts/build-og.mjs, test/og.test.js, test/static-build.test.js, test/e2e/*.e2e.js, test/workflows.test.js.

TASK
1. Generated numbers. For every count and worked example in README.md and docs/** (companies, jobs, cities, countries, tests, the Juice worked examples such as the San Francisco $675K case, tables of rates), decide: generate it (a marker block such as `<!-- freshness:begin id -->...<!-- freshness:end -->` filled by scripts/refresh/derived.js from code: computeJuice/taxFor, cities.json, companies) or verify it (derived.js recomputes and reports 'drift' when the doc disagrees). Implement derived.js as an updater module (interface above): mode 'auto' for marker blocks it can regenerate (returns `writes`), 'detect' for hand-written figures it can only check. Put the marker insertions themselves in patches.
2. OG/share. Find every number on the OG card and share pages. If the card shows counts, make them generated (card.html template values) and decide whether the PNG can be regenerated in CI (scripts/build-og.mjs needs Chromium + playwright-core outside the repo: say whether ubuntu-latest has Chromium and whether the monthly workflow can run it; if not, a 'manual' entry with a checklist and a staleness date).
3. Pinned test values: list the tests and e2e checks that pin data values; for each, either make the refresh regenerate the expectation (fixture produced by a script) or keep it as an intentional golden vector, and say which.
4. "As of" in the UI. Design and patch: scripts/build-static.js publishes dist/api/freshness.json (a client-safe subset of data/freshness.json: id, description, asOf, taxYear, source name/url, cadence, lastChecked, stale flag) and server/index.js serves GET /api/freshness the same; public/features/freshness.js loads it once and exposes asOf(id) and a label formatter; public/app.js juiceBlock prints the as-of for rent, living costs, FX/Big Mac and each tax line from the registry (not from hard-coded strings), and comps/Compstimate show the as-of of the data they use. Keep the patches small and against the CURRENT working tree (the household agent is editing juiceBlock now: make the patch easy to re-apply, and say so).
5. Tests (test/refresh-derived.test.js): derived.js offline regenerates marker blocks deterministically; detect mode flags a doctored README count; public/features/freshness.js formats labels and degrades gracefully when the file is missing.
6. Registry entries (registry-derived.json) for every generated artifact: README counts, docs worked examples, methodology page, OG image, share pages, e2e pins, with consumers and the inputs each depends on.

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
