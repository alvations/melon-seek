# Prompt: freshness-lead (data freshness lead)

Verbatim task prompt given to the freshness-lead agent:

---

You are the DATA FRESHNESS LEAD for melon-seek, a "Zillow of job postings" with salary charts, a map, a Juice Score (take-home pay after tax, rent and living costs), market comps, Compstimate and Insights.
- Repo: /home/user/melon-seek. Branch: claude/stoic-ride-54ddxp.
- Stack: zero-build vanilla ES modules, Node >= 18, no new npm dependencies.
- Read first: docs/CONTRACT.md, docs/ARCHITECTURE.md, docs/LIVABILITY.md, docs/VETTING.md, docs/DATA_SOURCES.md, README.md, docs/process/README.md, docs/process/TEMPLATE.md and docs/process/lead.md (the latest sections), plus every workflow in .github/workflows/.

The user's request, verbatim: "These numbers and our data will shift as time pass, launch an agent that take cares of the data engineering to make sure that all the numbers we're citing and comparing the juice, the compensation, the levels etc. there's a way to pull in new data to update all of them and have a similar mechanism like how we do the job board but we don't have to do this live every day, we can do something like a monthly update for all these numbers, but be VERY VERY thorough, we need to list down all the numebrs and comparision and places where we put them and make sure we have a way to update them and also all the mechanism to setup auto-updating of EACH of those numbers. Launch any amount of sub-agents to assist this agent in this feature!"

What exists today:
- Job boards are fetched daily: scripts/snapshot.js, snapshot.yml and pages.yml, with artifacts, a history ledger and a salary-vetting gate.
- col-refresh.yml refreshes Big Mac prices and FX monthly via scripts/update-col.js. It pushes a bot/col-refresh branch and opens a review PR; PR creation needs a repo setting the user hasn't enabled yet.
- Quoted rents, the cost index, the NYC living-cost baseline and tax rules are refreshed by hand.

FOUR OTHER AGENTS ARE RUNNING RIGHT NOW. Coordinate; do not collide.
- Data engineer: big-tech boards (Google, Microsoft, Meta, Apple, Netflix, Amazon, Nvidia, Tesla) for a /beta site. It owns server/companies.js, server/sources/*, server/pipeline.js, server/salary.js, server/vet.js, scripts/snapshot.js and .github/workflows/bigtech-probe.yml.
- Deploy engineer: the /beta build. It owns scripts/build-static.js, pages.yml, snapshot.yml, site-watchdog.yml, .github/scripts/*, public/api.js, server/index.js and scripts/links-policy.js.
- Juice household agent: adding 2- and 3-bedroom rent and household scaling, verified against official data. It owns data/cities.json, scripts/update-col.js, the rent, living and household parts of server/juice.js, public/app.js juiceBlock and docs/LIVABILITY.md §1/2/4/5/7.
- Juice tax agent: verifying every tax rule against official schedules. It owns the tax section of server/juice.js, the tax golden tests and LIVABILITY.md §3.

Their formats are changing under you. Read their current working-tree state, but don't edit their files. Where your mechanism needs a change in a file someone else owns, write the exact diff into docs/process/patches/freshness-<name>.diff and list it in your report; the lead applies it after that agent finishes.

YOUR DELIVERABLES

1. A complete inventory. Be VERY thorough; this is the core of the request. Cover every number, rate, threshold, constant, dataset and comparison the product shows, cites or computes from, wherever it lives:
   - server/*, public/*, scripts/*, data/* and tests' expected values;
   - README and docs, including generated worked examples;
   - the OG/share images and share pages, demo and mock data, and UI copy that embeds numbers.
   Grep systematically: numeric literals in non-test code, `asOf`, `as of`, years such as 2024–2027, currency symbols, `%`, and "/yr". Read each data file's schema.
   For EACH item record:
   - id;
   - what it is;
   - value(s);
   - where it is defined (file:line);
   - every place it is used or displayed (file:line plus the UI surface: chart, map, drawer Juice block, Insights, Compare, Compstimate, Same role elsewhere, badge, docs page);
   - its source and licence;
   - its as-of date;
   - how often it really changes (daily, monthly, yearly, ad hoc);
   - its type: fetched / derived-at-build / static-data / static-constant-from-a-source / product-policy (e.g. score anchors, grade cut-offs, vetting bounds, which should not auto-update but need a documented review cadence);
   - its current update mechanism, or "none";
   - the target mechanism.
   Output:
   - data/freshness.json: a machine-readable registry, one entry per dataset or constant group, with `id, description, owner file(s), consumers[], source{name,url,licence}, asOf, cadence, updater (script or 'manual' + checklist), validator, lastChecked`;
   - docs/DATA_FRESHNESS.md: the human inventory tables grouped by surface and by cadence, plus the operator runbook.
   Things to catch include FX_PER_USD in BOTH server/juice.js and public/viz/palette.js, Big Mac data, rents (1/2/3 bed), costIndex, the NYC basket baseline, score anchors and grades, every tax bracket, allowance, cap and rate with its tax year, social-insurance wage bases, the market comps doc, Compstimate's level multipliers and backtest, seniority and role-family lexicons, salary vetting bounds, geo coordinates and country tables, the history ledger, the counts in README, docs and OG images, and the demo-data salary bases. Find everything else too.
2. A monthly refresh mechanism, like the job-board pipeline but monthly:
   - a single orchestrator, e.g. scripts/refresh/run.js plus one updater module per dataset under scripts/refresh/, and a .github/workflows/monthly-refresh.yml;
   - you may extend or replace col-refresh.yml, but keep its review-PR safety model: never push straight to main or to the deploy branch without review; use a bot branch plus a PR or an issue;
   - for EACH registry entry, one of these:
     (a) automatic fetch + validate + diff for machine-readable official or open sources;
     (b) "detect and alert" for sources with no feed, e.g. tax rules published as web pages or PDFs: fetch the official page, extract the key figures and compare them to the encoded values; on a mismatch or a new tax year, open an issue or PR with the evidence;
     (c) a documented manual checklist with a staleness date.
     LLM-assisted extraction may be an optional, advisory step, guarded by the ANTHROPIC_API_KEY secret like scripts/llm-vet.js does, and never the only check;
   - validators: bounds and sanity checks per dataset (e.g. FX moved more than 20% in a month means flag rather than auto-accept; rents keep 1 < 2 < 3 bedrooms; tax caps go up monotonically year over year unless the source says otherwise), plus the existing tests, plus the generated docs and examples being regenerated;
   - a staleness gate: test/freshness.test.js, plus a CI/Pages step that warns, never fails the deploy, when any entry is past its cadence plus a grace period, with a step-summary table of every dataset's age;
   - regenerated derived artifacts: docs worked examples, README counts, OG images where feasible, e2e fixtures that pin values;
   - an "as of" for every number the UI shows (Juice block, tax lines, comps) that comes from the registry, so users see dates that match.
3. Check whether scheduled workflows actually fire. GitHub runs `schedule:` only from the default branch. Find out which branch is the default (git remote show origin, or the GitHub MCP tools) and whether the schedules in snapshot.yml, pages.yml and col-refresh.yml are therefore live. Report it plainly. Don't change branches or repo settings: merging to main and the Actions PR permission are the user's decisions. Design the mechanism to work once they are made, and say exactly what the user must enable.

SUB-AGENTS
You are explicitly allowed, and encouraged, to launch sub-agents.
- If your tool list includes the Agent tool, fan out. For example:
  - (i) 2–3 inventory auditors splitting the repo: server+data, public UI, scripts+docs+tests;
  - (ii) updater builders per family: FX and Big Mac; rents and cost of living; tax rules detect-and-alert; compensation (market comps, Compstimate levels, vetting bounds review); docs, README and OG regeneration;
  - (iii) a reviewer who cross-checks the registry against a fresh grep and finds what was missed.
  Give each sub-agent explicit file ownership, these same constraints, and the instruction to save its prompt verbatim to docs/process/prompts/freshness-<role>.md and log to docs/process/freshness-<role>.md.
- If you do NOT have the Agent tool, immediately SendMessage to "main" with the list of sub-agents you want and their full prompts; the lead will launch them. Then continue with the inventory yourself.

OWNERSHIP (yours)
- data/freshness.json, docs/DATA_FRESHNESS.md, scripts/refresh/**, .github/workflows/monthly-refresh.yml, col-refresh.yml;
- test/freshness*.test.js and test/refresh-*.test.js, with fixtures under test/fixtures/refresh/;
- docs/process/freshness*.md and docs/process/prompts/freshness*.md (save this prompt verbatim first as docs/process/prompts/freshness-lead.md);
- docs/process/patches/freshness-*.diff.

NETWORK
- The sandbox cannot reach most hosts (curl returns 000).
- Use WebSearch and WebFetch (ToolSearch "select:WebSearch,WebFetch") to find official feeds and their formats, e.g. IRS Revenue Procedures, SSA wage base, FTB rate schedules, HMRC rates, CRA indexation, ATO rates, ECB/Fed FX, the Big Mac GitHub repo, HUD FMR, ONS, CMHC, BLS CES/CPI, Eurostat HICP.
- To prove an updater works against the real source, you may push a workflow_dispatch-only probe workflow: `permissions: contents: read`, actions pinned by the SHAs the repo already uses. Trigger it with the GitHub MCP tools (ToolSearch "select:mcp__github__actions_run_trigger,mcp__github__actions_list,mcp__github__get_job_logs"; repo alvations/melon-seek, ref claude/stoic-ride-54ddxp) and read the job logs. Artifact download is blocked.
- Never invent a number. If you can't verify something, mark it.

GIT
- Do NOT commit or push product code: every push to this branch deploys the live site, and the lead commits after review.
- You and your sub-agents may commit and push ONLY probe workflows and their helper scripts:
  - `git add <explicit paths>`, never -A;
  - never pull, rebase, stash or force-push; if a push is rejected, stop and report;
  - end every commit message with:
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc
- Never use `pkill -f` or `pgrep -f`. Keep pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/freshness/.

VERIFY
- `npm test` is green, including your new tests.
- Dry-run the orchestrator locally against fixtures (`node scripts/refresh/run.js --dry-run --offline`, or similar), and once against the real sources via a probe run.
- Validate the workflow YAML.

FINAL REPORT
- Inventory totals: items, and items by type and cadence.
- The list of items that had NO update mechanism before, and what each has now.
- Which updates are fully automatic, which detect-and-alert, and which manual with a checklist.
- The default-branch and schedule finding, and exactly what the user must enable.
- Patches the lead must apply, and in which order relative to the other agents.
- Test results and open risks.

---

## Course correction from the lead (verbatim, received mid-task)

The scope is extended by a new user request (verbatim): "not just the ones un-related to the job positings, ALSO include all the company and job related numbers esp. when we compare them across the levels etc. And make sure we dont lose ANY of the old data, at some point maybe we have some sort of historical data anlaysis of those numbers too so that we can have some sort of annual review of how the numbers changed within the years and across the years per job / per company and also the non-job / non-company numbers, make sure this backend database is well established properly maintained and autonmatically updated and kept in the repo!"

1. Your inventory and registry must ALSO cover every job and company number, especially cross-level comparisons. That includes:
   - per-job pay (min/max/mid, currency, interval, USD conversion);
   - salary vetting flags;
   - per-company counts and medians;
   - market comps cells (company × family × seniority: n, p25/median/p75);
   - "Same role elsewhere", Insights distributions, Compare, Compstimate levels, its LEVEL_INDEX multipliers and backtest;
   - Juice per job;
   - listing age and freshness;
   - the history ledger fields;
   - seniority and level ladders;
   - role families;
   - counts on share pages and OG images.
2. Default-branch finding, already established by the lead: `origin/HEAD` points to claude/stoic-ride-54ddxp, which is the only remote branch. Scheduled workflows on it DO fire. Verify and record this, but you don't need to investigate further.
3. A separate ARCHIVE agent is starting now. It owns the permanent historical database kept in the repo, on an orphan data branch: scripts/archive/**, .github/workflows/archive*.yml and docs/DATA_ARCHIVE.md.
   - Every reference-data update your monthly refresh makes must be recorded there as a new dated version, never an overwrite.
   - The archive agent will publish a CLI such as `node scripts/archive/record.js --dataset <registry id> --asof <date> --file <json>`. Check the working tree for its final name before you wire it, and call it from your orchestrator.
   - Your registry ids are the dataset keys it will use. Keep them stable, and put the registry schema in docs/DATA_FRESHNESS.md early so it can read it.
   - Don't build your own history store; link to its docs from yours.

Address this before completing your current task.
