# Process log: big-tech data engineer (beta channel)

## 1. Brief
Prompt: [`docs/process/prompts/bigtech-data.md`](prompts/bigtech-data.md) (verbatim).
Goal: work out how to pull the public job postings of Google, Microsoft, Meta,
Apple, Netflix, Amazon, NVIDIA and Tesla, and build adapters so that
`node scripts/snapshot.js --channel beta` writes `data/snapshots/<slug>.json` for
the `/beta/` site, without changing the stable site. Collection must be
respectful: the sites' own front-end endpoints or feeds, robots.txt honoured, an
honest User-Agent, about 1 request/s per host, and no getting around bot walls.

Files owned and written:
- `server/sources/{polite,eightfold,amazon,apple,google,meta}.js`
- `server/companies.js` (beta entries, `listCompanies({ channel })`)
- `server/pipeline.js` (ADAPTERS, `{ jobs }` results, the live guard)
- `server/salary.js` (new pay formats)
- `scripts/snapshot.js` (`--channel`, progress, size guard)
- `scripts/probe-bigtech.js`, `.github/workflows/bigtech-probe.yml`
- `test/bigtech-{polite,salary,sources}.test.js`, `test/fixtures/bigtech-*.json`
- `docs/DATA_SOURCES.md` §7, this log, and the prompt file

## 2. Inputs and sources
- Repo:
  - `docs/CONTRACT.md` (Raw job; v3 beta channel), `docs/DATA_SOURCES.md` §1–6,
    `docs/VETTING.md`, `docs/process/TEMPLATE.md`;
  - the existing adapters, `server/pipeline.js`, `salary.js`, `vet.js`, `normalize.js`
    (`deriveSalary`), `companies.js`, `lib-modules.js` (every `server/sources/*.js`
    is served to the browser, so the new adapters are pure ES with no `node:`
    imports);
  - `scripts/snapshot.js`, `scripts/vet-salaries.js` (scan flags reused by the probe);
  - `scripts/links-policy.js`: shipped code may not contain the GitHub repo URL, so
    the User-Agent names the Pages site instead;
  - the workflows, for the pinned action SHAs.
- Real responses: probe runs 1–7 on GitHub-hosted runners (Azure westus). The sandbox reaches no careers host.
- Third-party code found with GitHub code search, used as **hints only**, every one re-verified by the probe:
  - Averyy/fetchaller-mcp `docs/site-apis.md` and `src/fetchaller/google_jobs/api.py`
    (Eightfold page size 10, Apple's `format` quirk, the Google `sf9Qmf` envelope,
    Meta's sitemap and JSON-LD);
  - mpwilso/Project-Max-Q `adapters/apple.py` (Apple's empty pages, `postingFooters`)
    and `adapters/google.py` (the Google record layout);
  - capy-zhiao/Job_Monitor `jobmonitor/fetchers.py`;
  - felixkwasisarpong/hireoven and adityasingh2400/jobradar (the Microsoft PCSX
    shape, and session cookies vs. the cookieless rate bucket);
  - job-hunter-toolkit `docs/registry-audit.md` (the Workday total clamped at 2000).
- Terms of use: notes in §3 (decision 12).

## 3. Decisions and rationale
1. **Probe first, on real runners.** The workflow is `workflow_dispatch` only,
   `contents: read`, pinned SHAs, node 22, a 180-minute cap, and its inputs reach the
   script through `env`. A `raw` input takes ad-hoc requests (career and ToS hosts
   only), so shapes could be checked without a push per question; a push redeploys
   the stable site. Recon prints robots.txt verdicts for every path an adapter
   uses, then status, bytes, CORS/cookie/server headers and JSON shapes.
2. **One polite client** (`polite.js`) for every big-tech request:
   - per-host start spacing ≥ 1 s (slot reservation, so concurrency cannot exceed it);
   - backoff 2/4/8/16 s on 429/5xx (or `Retry-After`, ≤ 60 s); a 403 is never retried;
   - `redirect: 'manual'` and body/time caps;
   - a per-run jar of the site's own cookies;
   - a robots.txt check (RFC 9309 groups, longest match, Allow on ties, `*`/`$`,
     redirects followed; 4xx = no rules; 5xx/unreachable = don't crawl) at the start
     of every crawl, so a robots.txt change stops the crawl.
3. **Tesla dropped.** Akamai answers 403 to robots.txt, the careers API and the
   careers page. It is not in the registry, so no build can bundle demo data for it.
4. **NVIDIA via jobs.nvidia.com (Eightfold), not Workday.** It is NVIDIA's own
   careers front end and has an explicit `Allow: /api/pcsx`. Workday CXS was in a
   maintenance redirect, and its `total` is clamped at 2000.
5. **Google from the sitemap, not search pages.** robots.txt disallows every paged
   results form. Paging the `r06xKb` search RPC instead would get exactly what the
   rule withholds, so it is not used. The jobs sitemap (published for crawlers) plus
   the single-posting RPC (`sf9Qmf`, ~5 KB) gives the same records at a fraction of
   the HTML page weight (~1.3 MB).
6. **Meta from the sitemap plus public pages, not GraphQL.** robots.txt lists the
   jobs sitemap; the pages carry JSON-LD and structured pay. GraphQL needs a
   rotating `doc_id` taken from JS bundles, which is brittle.
7. **Apple details only for US postings.** Pay is published only there. The
   detail call is slow (~2 s server-side), and a detail for every posting would
   double a ~1.5 h crawl; elsewhere the row's summary is the description.
8. **Amazon partitions.** `hits` caps at 10,000. The plan uses the facets the
   search page itself requests: per country, and the US split by business category.
9. **Pay rules** (DATA_SOURCES.md §7a). Each was decided on real text and then
   checked as a regression: a parse diff over all 5,413 stable jobs is **0 changed**
   after every parser edit (old `salary.js` from `git show HEAD:server/salary.js`
   against the new one, run on `data/snapshots/*.json`).
   - **Location ranges:** first or national. For Amazon's table, the posting's own
     primary city is used rather than the alphabetical first row, because the table
     is sorted by state code, not by importance.
   - **Level ranges:** span min–max, capped at 4×. Microsoft per-country lists are
     *not* levels: run 6 caught a span across Ireland/Germany/Portugal
     (€59K–€181K) that was wrong, and grouping by country fixed it.
   - **Netflix:** the "range for this role" is a posted range; the area-wide
     "overall market range … typically", which is partly variable, is not.
   - **Total and cash compensation ranges** are not base pay.
10. **Structured vs text.** Meta `public_compensation` and Amazon's per-location table
    are machine-generated pay fields, so the adapters return them as `salary`
    (`source: 'structured'`), with every row in `payRanges`. All other pay is text,
    parsed in normalize.
11. **Size** (snapshot.js `fitSnapshot`, beta only).
    - Over 40 MB, descriptions are trimmed in steps (6000 → 800 characters, plus
      the pay paragraphs). Sections and keywords were derived from the full text
      first.
    - If the file is still over at 800 characters, postings are capped: salaried
      first, then the newest, as many as fit. The payload says so (`jobsCapped`,
      `descriptionsTrimmedTo`).
    - Amazon needs the cap: 22,415 postings × ~9 KB normalized ≈ 200 MB (results in §5).
    - The history ledger records only what is published.
12. **Terms of use (noted, not a legal opinion).** The sandbox could not resolve
    most ToS hosts; points are from search results and the probe:
    - Microsoft ToU (read via WebFetch): no obtaining information "through any
      means not intentionally made available", and no use that could "overburden, or
      impair any Microsoft server". The PCSX API is the site's intended public
      search; the crawl is 1 request/s.
    - Google ToS: no automated access "in violation of the machine-readable
      instructions on our web pages (for example, robots.txt files that disallow
      crawling…)". This is why decision 5 avoids paged results.
    - Amazon Conditions of Use (amazon.com): the licence excludes "any use of data
      mining, robots, or similar data gathering and extraction tools". **Risk:** if
      amazon.jobs falls under these conditions, the crawl conflicts with them even
      though robots.txt allows `/en/search.json`.
    - Meta: the Automated Data Collection Terms (2024) bar automated collection
      "without Meta's express written permission". **Risk:** whether that covers
      metacareers.com job pages that robots.txt and the sitemap expose to crawlers
      is for the lead or user to decide.
    - Apple and NVIDIA: not readable from the sandbox; to be checked on a runner (§6).
13. **Registry.** `listCompanies()` keeps returning exactly the 8 stable objects (no
    `channel` key added). `getCompany()` adds `channel`. The beta sources are not in
    `SOURCES`, so they are never custom boards. `runTask('live')` refuses
    `live: false` companies, so an HTTP request can never start an hour-long crawl.

## 4. Replayable steps
```bash
# Unit tests (no network): polite client, registry/channels, size guard, pay formats, mappers on real fixtures.
node --test test/bigtech-polite.test.js test/bigtech-salary.test.js test/bigtech-sources.test.js
npm test

# Probe (GitHub Actions, workflow_dispatch). Through the GitHub MCP tools or gh:
gh workflow run bigtech-probe.yml --repo alvations/melon-seek --ref claude/stoic-ride-54ddxp \
  -f mode=recon                                   # robots + one request per endpoint
gh workflow run bigtech-probe.yml … -f mode=full -f max_jobs=80     # quick adapter check
gh workflow run bigtech-probe.yml … -f mode=full -f max_jobs=0      # whole boards (~1.5 h)
gh workflow run bigtech-probe.yml … -f raw='[{"url":"https://jobs.nvidia.com/api/pcsx/search?domain=nvidia.com&start=0","show":["data.count"]}]'
# Logs: mcp__github__get_job_logs (gh's zip download is blocked from the sandbox).

# Snapshots (on a runner):
node scripts/snapshot.js                    # stable only (unchanged)
node scripts/snapshot.js --channel beta     # the 7 beta boards, in parallel, ~1.5 h
node scripts/snapshot.js microsoft          # one board
```

## 5. Verification
TBD (filled from the full run).

## 6. Known gaps and follow-ups
TBD.

## 7. Change log
- 2026-10-10 07:06 prompt saved (committed by the lead).
- 07:17 polite client + probe pushed; run 1 (recon): Tesla 403, Google paging disallowed, NVIDIA Workday in maintenance.
- 07:19–07:24 runs 2–4 (raw): sitemaps, pay sentences, Amazon cap, Google `sf9Qmf`, Meta `public_compensation`.
- 07:31 adapters, registry, snapshot `--channel` pushed; run 5 (30/company).
- 07:39 pay fixes (Amazon table, Google "+ bonus" line, Microsoft levels, NVIDIA cash comp, Meta title); run 6 (80/company), all green.
- 07:50 per-country national ranges, CZK, posting cap, fixtures and tests pushed; run 7 (whole boards).
- ~07:58 lead: stop pushing (each push triggers a branch-mode Pages build that briefly serves the README). From here on: local commits only; the lead batches pushes. workflow_dispatch probe runs continue.
