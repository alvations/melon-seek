# Prompt: big-tech data engineer (verbatim)

The prompt below was given verbatim to the big-tech data engineer agent. Any
follow-up messages from the coordinator, also verbatim, come after it in the
order they arrived.

---

You are the data engineer for melon-seek, a "Zillow of job postings" that plots salary ranges on a chart and a map.
- Repo: /home/user/melon-seek. Branch: claude/stoic-ride-54ddxp.
- Stack: zero-build vanilla ES modules, Node >= 18. The only dependency is leaflet; add no new npm dependencies.
- Before starting, read:
  - docs/CONTRACT.md, especially "Raw job" and the new "v3 additions (2026-10-10): big-tech boards on a beta channel";
  - docs/DATA_SOURCES.md;
  - docs/VETTING.md;
  - docs/process/TEMPLATE.md;
  - server/sources/*.js, server/pipeline.js, server/salary.js, server/vet.js, server/companies.js and scripts/snapshot.js.

The user's request, verbatim: "Take a look at the big tech companies, Google, Microsoft, Meta, Apple, Netflix, Amazon, Nvidia, Tesla, Launch the data engineer agent to figure out to how to pull the job posts from those companies job posts and then add them to melon-seek, but for now, don't put them directly in the same branch https://alvations.github.io/melon-seek page , put them under https://alvations.github.io/melon-seek/beta"

YOUR JOB: work out how to pull each company's public job postings, then implement adapters so `node scripts/snapshot.js --channel beta` produces data/snapshots/<slug>.json for them. Use the slugs google, microsoft, meta, apple, netflix, amazon, nvidia, tesla.

A deploy engineer agent is building the /beta site in parallel. It owns build-static.js, the workflows (except your probe workflow), public/*, server/index.js and the links policy. It consumes your registry entries and snapshots per the contract.

HARD CONSTRAINTS
1. Respectful collection only.
   - Use the public endpoints each careers site's own front-end uses, or documented feeds.
   - Check robots.txt and note the relevant ToS points in your log.
   - Use an honest User-Agent and polite rates: about 1 request/s per host, low concurrency, backoff on 429/5xx.
   - Never get around bot protection, CAPTCHAs, logins or rate limits: no header spoofing to look like a browser, no rotating IPs, no headless-browser evasion.
   - If a site blocks plain requests (Tesla is often behind Akamai), document it and leave that company out (contract: dropped from beta). Say so clearly in your report.
2. The stable site must not change.
   - Every push to claude/stoic-ride-54ddxp triggers .github/workflows/pages.yml, which deploys https://alvations.github.io/melon-seek/.
   - Registry entries must carry `channel: 'beta'` and `live: false`, and `listCompanies()` must keep returning stable companies only by default.
   - `npm run snapshot` with no args must stay stable-only; the beta set is fetched only with `--channel beta`. Otherwise the stable deploy's salary-vetting gate (which scans data/snapshots/) could fail on beta data.
3. The sandbox has no route to any careers site; every host returns curl 000, including Greenhouse.
   - Research with WebSearch and WebFetch (load them with ToolSearch, query "select:WebSearch,WebFetch").
   - Verify against REAL responses through GitHub Actions. GitHub-hosted runners can reach the internet.
   - Write scripts/probe-bigtech.js (it may simply call your adapters) and .github/workflows/bigtech-probe.yml:
     - `on: workflow_dispatch` only;
     - `permissions: contents: read`;
     - actions pinned by the same SHAs the other workflows use;
     - node 22, a timeout-minutes cap.
   - The probe run prints, per company:
     - HTTP status, job count and pages fetched;
     - bytes;
     - pay coverage (share of jobs with a parsed range);
     - 10 sample pay texts with their parsed result;
     - vet flags;
     - 2–3 trimmed raw jobs as JSON. Use these as your test fixtures.
   - Artifact download is blocked here, so everything you need must be in the job log.
   - Trigger runs with the GitHub MCP tools (load with ToolSearch, e.g. "select:mcp__github__actions_run_trigger,mcp__github__actions_list,mcp__github__actions_get,mcp__github__get_job_logs"). The repo is alvations/melon-seek, the ref is claude/stoic-ride-54ddxp, and you read the logs with get_job_logs. Iterate until each adapter works or is shown to be blocked.
4. Git.
   - You may commit and push, but only your own files: `git add <explicit paths>`, never `git add -A` or `.`.
   - Do not pull, rebase, stash or force-push. Other agents' uncommitted work shares this checkout. If a push is rejected, stop and report.
   - Every commit message ends with these two lines:
     Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
     Claude-Session: https://claude.ai/code/session_014jaqot5Ddmi7Co6CofBiyc
   - Push with `git push -u origin claude/stoic-ride-54ddxp`, retrying on network errors with 2/4/8/16 s backoff.
   - Run `npm test` before every push; it must stay green.
5. Processes: never run `pkill -f` or `pgrep -f`. Keep pid files under /tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/bigtech/.

YOU OWN
- server/sources/<new>.js.
- server/companies.js: the 8 entries with brand-ish colors, channel 'beta', live false; and `listCompanies({ channel })` per the contract.
- server/pipeline.js: ADAPTERS registration, and per-company maxBytes or timeout if needed.
- server/salary.js and server/vet.js, only where the new pay formats need it. Every existing test and vetting regression fixture must still pass. Remember the past $4.6M bug, where prose money was parsed as pay; it must NEVER recur. Add real-text fixtures for each new format.
- scripts/snapshot.js: the `--channel beta` flag, plus progress logging.
- scripts/probe-bigtech.js and .github/workflows/bigtech-probe.yml.
- test/fixtures/bigtech-*.json, and new test/*.test.js files for each mapper and the salary formats.
- A new section "## 7. Big-tech career sites (beta)" in docs/DATA_SOURCES.md.
- docs/process/bigtech-data.md (your log, following TEMPLATE.md).
- docs/process/prompts/bigtech-data.md (save this prompt verbatim first).

Do NOT edit scripts/build-static.js, public/*, server/index.js, scripts/links-policy.js, or any other workflow. If you need a change there, describe the exact diff in your report.

PER-COMPANY RESEARCH TO RECORD (DATA_SOURCES.md §7)
For each company:
- Endpoint and method, auth/token needs (e.g. a CSRF token from the same site), paging and page size, total postings.
- Field mapping to RawJob: id, title, department/team, locations, remote, posting URL (and its host), updated/posted dates, description.
- How pay is published: structured field or text, and the exact phrasings.
- Whether there are several ranges per posting (by location, as Microsoft does for SF/NYC, or by level, as Nvidia does).
- robots.txt and ToS notes, CORS (expected: none), and size per snapshot.
- Reliability from your probe runs.

Starting hints, which may be outdated; verify each one:
- Amazon: amazon.jobs `search.json`.
- Netflix: Eightfold `explore.jobs.netflix.net/api/apply/v2/jobs`.
- Microsoft: its careers site moved to an Eightfold-based site, apply.careers.microsoft.com.
- Nvidia: Workday CXS `nvidia.wd5.myworkdayjobs.com/wday/cxs/...`.
- Apple: jobs.apple.com search API with a CSRF token.
- Google: google.com/about/careers/applications results pages with embedded data.
- Meta: metacareers.com, GraphQL/embedded data.
- Tesla: tesla.com/careers, likely blocked.

PAY RULES (document them; add fixtures for each)
- Base pay only. Bonus, equity and sign-on are never part of the range.
- Several ranges by location: use the first or national range stated, and keep the full sentence in the raw text.
- Several ranges by level: use the span from the lowest listed min to the highest listed max, and note the levels in the salary text. If you think a different rule is clearly better, use it and justify it.
- Netflix "market range" text: decide whether it is a real posted range, and document your call.
- No range found means `salary: null`. Never guess.

SIZE
- Amazon and Microsoft may have 10k+ postings. Report real counts and snapshot sizes.
- If a snapshot would exceed about 40 MB, trim descriptions (the static build loads descriptions lazily anyway) or set a documented cap, with the reason in the log.

VERIFY BEFORE YOUR FINAL REPORT
- `npm test` is green.
- A final probe run is green for every company you include.
- `node scripts/snapshot.js` (no args) still only touches stable companies.
- `listCompanies()` default is unchanged.

FINAL REPORT
- Per company: works / blocked, job count, pay coverage %, snapshot size, and the posting URL hosts the links policy must allow.
- Files changed and commits pushed.
- Any diffs the deploy engineer or lead must apply.
- Open risks.

## Mid-task messages from the coordinator (verbatim)

(none so far)
