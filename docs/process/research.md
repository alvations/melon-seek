# Process log: research (data sources)

## 1. Brief
Prompt: [`prompts/research.md`](prompts/research.md). This run follows the
"Restart prompt" at the end of that file. The original prompt and its addendum
sit above it.

Goal: confirm, with source URLs, the job-board API facts the adapters rely on:
- Greenhouse list endpoint, `content`, and `pay_input_ranges`
- the Anthropic and Anduril board slugs
- OpenAI on Ashby, and the Ashby compensation fields
- the Lever fields
- whether a static GitHub Pages build can call the three APIs from the browser (CORS)
- 3–5 more AI or defence boards

Files owned: `docs/DATA_SOURCES.md`, this log, and the appended section of
`docs/process/prompts/research.md`. Nothing is committed; the lead does that.

## 2. Inputs and sources

### Repo files read (context only, not edited)
`docs/process/TEMPLATE.md`, `docs/process/README.md`, `docs/process/prompts/research.md`,
`docs/process/viz.md` (for style), `docs/ADDING_A_BOARD.md`, `docs/CONTRACT.md`
(grep), `server/sources/{greenhouse,ashby,lever}.js` and `server/companies.js`.
The adapters show what is assumed: `pay_transparency=true` on the Greenhouse
list, `isListed` filtering and `summaryComponents`/`compensationTiers` parsing
for Ashby, and `lists` wrapped in `<ul>` for Lever.

### Hosts that were blocked
These returned `EGRESS_BLOCKED`, and no attempt was made to get around it:
- vendor docs: developers.greenhouse.io, support.greenhouse.io, developers.ashbyhq.com
- company sites: openai.com, www.anduril.com, scale.com, x.ai, cohere.com, www.palantir.com, shield.ai
- aggregators: apify.com, resumegeni.com, datahub.io

web.archive.org returned "unable to fetch". `gh api` against
`grnhse/greenhouse-api-docs` was refused because that repo is not enabled for
this session. Raw files on raw.githubusercontent.com were readable, so that
route was used instead.

### Web searches (WebSearch, standard mode)
| # | Query | What it gave |
|---|---|---|
| 1 | `Greenhouse Job Board API pay_input_ranges pay_transparency=true` | A snippet citing Greenhouse help articles (pages blocked) |
| 2 | `boards-api.greenhouse.io/v1/boards jobs "content=true" HTML escaped content field` | Snippets agreeing that `content` is entity-escaped |
| 3 | `"pay_input_ranges" greenhouse "jobs?content=true" list endpoint` | Harvest API v3 pay-input-ranges reference (a different API, not used) |
| 4 | `"pay_input_ranges" greenhouse github` | Nothing relevant |
| 5 | `Ashby public job posting API includeCompensation compensationTierSummary summaryComponents` | The official docs URL (blocked); snippets agreeing with the field names |
| 6 | `job-boards.greenhouse.io/anthropic jobs` | Job URLs under `job-boards.greenhouse.io/anthropic/jobs/…` |
| 7 | `boards.greenhouse.io/andurilindustries jobs Anduril` | Job URLs under `job-boards.greenhouse.io/andurilindustries/jobs/…` |
| 8 | `openai.com/careers/search jobs.ashbyhq.com/openai` | Snippets saying OpenAI uses Ashby for applications |
| 9 | `"jobs.ashbyhq.com/openai"` | Aggregator pages only (weak) |
| 10 | `jobs.lever.co/palantir` | `api.lever.co/v0/postings/palantir/<uuid>` URLs |
| 11 | `job-boards.greenhouse.io/scaleai` | `job-boards.greenhouse.io/scaleai/jobs/4605996005` |
| 12 | `jobs.ashbyhq.com/cohere` | Aggregators that cite the Cohere Ashby board |
| 13 | `jobs.lever.co/shieldai` | `jobs.lever.co/shieldai/e3125c80-…` |
| 14 | `job-boards.greenhouse.io/xai` | `job-boards.greenhouse.io/xai/jobs/4378347007`, `/4800099007` |
| 15 | `jobs.lever.co/mistral` | `jobs.lever.co/mistral/5ee49b30-…` and others |
| 16 | `Greenhouse pay transparency "Job Board API" pay range appears in content field job post` | A snippet saying pay text is put into `content` (support article, blocked). A conflicting "zero of 49,722 postings carry structured pay" claim (datahub.io, blocked) |

### GitHub code searches (mcp__github__search_code)
| # | Query | What it gave |
|---|---|---|
| a | `"pay_input_ranges" "boards-api.greenhouse.io"` | areer (list plus flag works, Anduril counts), cs-migration-compass (empty without the flag), openings-mcp (detail only, per the docs) |
| b | `"jobs?content=true&pay_transparency=true"` | About 30 projects send the flag on the list. A careerkartos comment says that without it "the field is simply absent" |
| c | `"boards-api.greenhouse.io" CORS "Access-Control-Allow-Origin"` | 10xjobs spike 4 (header observations), pt-tracker (GitHub Pages) |
| d | `"scrapeableCompensationSalarySummary" "summaryComponents" "compensationTierSummary"` | framer/plugins Ashby types, openings-mcp Ashby design note |
| e | `"jobs.ashbyhq.com/openai/"` | Built In captures with `howToApply` set to `jobs.ashbyhq.com/openai/<uuid>` |
| f | `"openai.com/careers" "posting-api/job-board/openai"` | talotd 2026-09-15 note, ever-jobs ("OpenAI uses Ashby for their careers page") |
| g | `"salaryRange" "per-year-salary" lever` | ever-jobs spec 5010 (interval counts), freehire `lever.go` |
| h | `"api.lever.co" "access-control-allow-origin"` | pt-tracker, jobscraper_hourly `ats.ts`, trajector README (all report ACAO `*`); one project claims the opposite (applitrack proxy) |
| i | `"shieldai" "palantir" "scaleai" "cohere"` | 2027-internship-tracker (Scale AI, Palantir apply URLs with dates) |

### URLs read and what each confirmed
| URL | Confirmed |
|---|---|
| https://github.com/grnhse/greenhouse-api-docs/tree/master/source/includes/job-board | Lists the job-board doc files |
| https://raw.githubusercontent.com/grnhse/greenhouse-api-docs/master/source/includes/job-board/_jobs.md | List and single endpoints. `content` param. HTML converted to entities. `pay_transparency` documented only on the single-job endpoint. `pay_input_ranges` shape. Board intro/conclusion joined into `content` |
| …/_introduction.md | No auth for GETs. JSONP `callback`. No CORS statement |
| …/_departments.md, …/_offices.md, …/_boards.md | Departments and offices endpoints, `render_as=list|tree`, board endpoint |
| https://www.anthropic.com/jobs | Job links go to `job-boards.greenhouse.io/anthropic/jobs/{4980436008,4951814008,5429202008}` |
| https://raw.githubusercontent.com/rubbieKelvin/areer/9d89bde…/brainstorms/03-job-extraction.md | Verified live 2026-09-30: list with `pay_transparency=true` returns `pay_input_ranges` (Anduril 2,238 of 2,397). `content` entity-escaped. Ashby `isListed:false` skipped. Palantir Lever listing over 5 MB. 404 for missing boards on all three |
| …/areer/…/crates/crawler/src/extract/greenhouse.rs | List fields used live: `first_published`, `company_name`, `pay_input_ranges` (no interval) |
| https://raw.githubusercontent.com/Mojtaba-Alehosseini/cs-migration-compass/d2c8295…/scripts/src_postings_greenhouse.py | List called **without** the flag has empty ranges, so ranges were fetched per job with `?pay_transparency=true` |
| https://raw.githubusercontent.com/tydev-new/10xjobs-careercoach/2a4ae4f…/docs/spikes/spike-4-board-apis.md | 2026-09-28 curl with `Origin`: ACAO `*` on Greenhouse list and single, Lever list, Ashby list. Lever single echoes the Origin. Greenhouse `content` entity-encoded. Browser run never recorded |
| https://raw.githubusercontent.com/framer/plugins/6f9a02e…/plugins/ashby/src/api-types.ts | Ashby job and compensation schema (links the official docs page) |
| https://raw.githubusercontent.com/amikai/openings-mcp/f2f4b85…/docs/superpowers/specs/2026-07-06-ashby-openapi-design.md | Ashby endpoint, `apiVersion` "1", 404 text, enums, interval/type values, null quirks on `openai`/`cohere`, 46-board scan |
| https://raw.githubusercontent.com/MarcosRodrigoT/Job-Finder/84734ca…/src/jobfinder/adapters/openai.py | Scrapes openai.com/careers and falls back to `api.ashbyhq.com/posting-api/job-board/openai` (supports, does not prove) |
| https://raw.githubusercontent.com/lever/postings-api/master/README.md | Lever endpoints, params, the full field table including `salaryRange`, `categories` and `lists`. **Says no cross-origin support outside the company's domains** |
| https://raw.githubusercontent.com/Prathmesh-28/pt-tracker.github.io/61bad3b…/README.md | GitHub Pages site pulls all three from the browser; "all three send `Access-Control-Allow-Origin: *`". Lever `createdAt` in ms |
| https://raw.githubusercontent.com/smresponsibilities/jobscraper_hourly/3d6589c…/web/lib/ats.ts | Browser-only validator; says Greenhouse, Lever and Ashby send ACAO `*` |
| https://raw.githubusercontent.com/ever-jobs/ever-jobs/57399c8…/.specify/specs/5010-lever-field-mappings/spec.md | Lever live harvest: interval counts, `workplaceType` `onsite`, `categories.department`, `allLocations`, `country` |

Snippets read inside search results but not opened as pages: alexeygrigorev
Built In captures (OpenAI `howToApply`), JordanFu talotd (OpenAI Ashby API cited
2026-09-15), junghan0611/apply (Cohere Ashby URL), 2027-internship-tracker
(Scale AI and Palantir URLs with dates), Blueturboguy07/jobleft crawler README
(Ashby `interval` values).

## 3. Decisions and rationale
1. **Vendor docs on GitHub first.** Greenhouse (`grnhse/greenhouse-api-docs`) and
   Lever (`lever/postings-api`) publish their docs as repos, which counts as
   first-party and could be read. Mirrors of the blocked doc sites were not used.
2. **Ashby without its docs page.** The schema came from Framer's Ashby plugin
   (a vendor-built integration that links the official page) and a design note
   checked against live responses. The official page is marked as unread.
3. **Every fact is labelled Docs, Observed or Search**, and observations carry
   their own dates, so readers can weigh conflicting claims.
4. **Greenhouse pay ranges.** The flag on the list endpoint is undocumented but
   reported to work, and an ignored parameter does no harm. The recommendation is
   to keep it, keep the text parser, and not add per-job detail calls by default.
5. **CORS.** Greenhouse and Ashby count as browser-callable. Lever counts as
   working but against its docs. The page recommends a check after deploy and
   keeping snapshot data as the fallback for Lever.
6. **Extra boards.** A board needed at least one job URL on the ATS's own domain
   and preferably a second, dated source. Five were picked to cover all three ATS
   and both sectors. Mistral was confirmed but left out to stay within 3–5.
   Perplexity, Databricks and Stability AI appeared only in an unverified CSV and
   were not pursued. One project lists `palantir` as a Greenhouse token; this was
   discounted against the direct Lever URLs.

## 4. Replayable steps
1. Load the tools: `ToolSearch "select:WebSearch,WebFetch"`. GitHub code search is
   `mcp__github__search_code`.
2. Run the searches in §2 in that order.
3. Fetch the vendor docs as raw files:
   ```sh
   S=/tmp/research; mkdir -p $S && cd $S
   for f in _jobs _introduction _departments _offices _boards; do
     curl -sS -o $f.md https://raw.githubusercontent.com/grnhse/greenhouse-api-docs/master/source/includes/job-board/$f.md
   done
   curl -sS -o lever-README.md https://raw.githubusercontent.com/lever/postings-api/master/README.md
   ```
   All returned HTTP 200 on 2026-10-02.
4. Fetch the third-party files at the pinned commits listed in §2 the same way.
5. `WebFetch https://www.anthropic.com/jobs` and ask which ATS the job links use.

## 5. Verification
- Each fact in `DATA_SOURCES.md` has at least one URL. Where docs and observation
  disagree (Greenhouse list pay ranges, Lever CORS, Lever `workplaceType`), both
  are shown.
- **Not verified first-hand.** No job-board API was called from this sandbox. To
  check from a machine with network access:
  ```sh
  O='Origin: https://example.github.io'
  curl -sI -H "$O" 'https://boards-api.greenhouse.io/v1/boards/anthropic/jobs' | grep -i access-control
  curl -sI -H "$O" 'https://api.ashbyhq.com/posting-api/job-board/openai?includeCompensation=true' | grep -i access-control
  curl -sI -H "$O" 'https://api.lever.co/v0/postings/palantir?mode=json' | grep -i access-control
  curl -s 'https://boards-api.greenhouse.io/v1/boards/andurilindustries/jobs?content=true&pay_transparency=true' | jq '[.jobs[] | select((.pay_input_ranges // []) | length > 0)] | length'
  ```
  For the real CORS test, run `fetch()` for each URL from the deployed Pages origin.

## 6. Known gaps and follow-ups
- Ashby's official docs page was not read; the Framer types and the design note
  stand in for it.
- The openai.com/careers/search page source was not inspected (blocked). Ashby
  `openai` rests on apply links and live API notes.
- No source records a real browser test of CORS, only curl header checks.
- Only Anduril is known to fill `pay_input_ranges`. Anthropic's coverage is
  unknown, so the salary text parser is still needed.
- Not read, conflicting: Greenhouse support article 10027759675931 (pay text in
  `content`) and the datahub.io "zero of 49,722 postings carry structured pay"
  claim. The latter probably called the list without the flag.
- The extra five boards were not confirmed from the company side (sites blocked).

## 7. Change log
- 2026-10-02 (earlier): the first research attempt stopped on an API error before
  writing any file (see [lead.md](lead.md)).
- 2026-10-02T05:38Z: restart. Wrote `docs/DATA_SOURCES.md` and this log, and
  appended the restart prompt to `prompts/research.md`.
