# Data sources

The public job-board APIs melon-seek reads, as verified on 2026-10-02.

**How this was verified.** The build sandbox blocks direct requests to the
job-board hosts and to most vendor documentation sites (developers.greenhouse.io,
developers.ashbyhq.com, openai.com, the company careers sites). Facts therefore
come from three kinds of source, and each row says which one it is:

- **Docs**: the vendor's own documentation. Greenhouse and Lever publish theirs as
  GitHub repositories, which were readable.
- **Observed**: a third-party project that called the live API and wrote down
  what came back, with the date it gives.
- **Search**: a job URL or page that a web search returned. The page itself was
  not opened.

The full log of queries and URLs is in [process/research.md](process/research.md).

## Differences from what the adapters assume

1. **Greenhouse `pay_transparency` is documented only on the single-job endpoint.**
   `server/sources/greenhouse.js` sends it on the list endpoint. One observer
   reports that this works (2,238 of 2,397 Anduril jobs had `pay_input_ranges`,
   2026-09-30), but it is undocumented behaviour. Keep the text-parsing fallback.
2. **Lever's docs say cross-origin requests are not supported** from sites outside
   the company's own domains. The headers seen in practice say otherwise (see §5),
   but a static build must not depend on it.
3. **Lever `workplaceType` is documented as `on-site`** but has been observed as
   `onsite`. The adapter's `/on-?site|hybrid/` matches both.
4. **Ashby `isRemote` and `workplaceType` can be `null`**, for example on the
   `openai` board. The adapter already maps this to `remote: null`.

Everything else matched what was expected: Anthropic `greenhouse/anthropic`,
Anduril `greenhouse/andurilindustries`, OpenAI `ashby/openai`.

## 1. Greenhouse Job Board API

Docs repo: `grnhse/greenhouse-api-docs`, files under `source/includes/job-board/`.
Short names used below:
[jobs.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md),
[intro.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_introduction.md).

| Fact | Value | Kind | Source |
|---|---|---|---|
| List jobs | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs` | Docs | [jobs.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md) |
| List params | Only `content` is documented. There is no paging; the whole board comes back with `meta.total` | Docs | [jobs.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md) |
| Auth | "authentication is not required for any GET endpoints" | Docs | [intro.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_introduction.md) |
| `content=true` adds | "the full post description, department, and office of each job post": `content`, `departments[]` (`id, name, parent_id, child_ids`), `offices[]` (`id, name, location, parent_id, child_ids`) | Docs | [jobs.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md) |
| `content` is entity-escaped | **Yes.** "Any HTML included through the hosted job application editor will be automatically converted into corresponding HTML entities." Decode the entities once to get HTML | Docs | [jobs.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md) |
| Escaping as seen live | `&lt;div class=&quot;content-intro&quot;&gt;…` (gitlab board, 2026-09-28) | Observed | [10xjobs spike 4](https://github.com/tydev-new/10xjobs-careercoach/blob/2a4ae4f43ff3dea3ac1bd34a34561ec28bb3a270/docs/spikes/spike-4-board-apis.md) |
| Board intro and conclusion | If a board has default descriptions, `content` is the board introduction, the post description and the board conclusion joined into one string | Docs | [jobs.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md) |
| List job fields | `id` (job post), `internal_job_id` (job; null for prospect posts), `title`, `updated_at`, `requisition_id`, `location.name`, `absolute_url`, `language`, `metadata` (custom fields or `null`) | Docs | [jobs.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md) |
| Extra list fields seen live | `first_published`, `company_name` | Observed | [areer greenhouse.rs](https://github.com/rubbieKelvin/areer/blob/9d89bde69b7871d1b739aa82c28003851df42040/crates/crawler/src/extract/greenhouse.rs), [areer notes](https://github.com/rubbieKelvin/areer/blob/9d89bde69b7871d1b739aa82c28003851df42040/brainstorms/03-job-extraction.md) |
| Single job | `GET …/boards/{board_token}/jobs/{job_id}` with `questions=true` and `pay_transparency=true`. The response also has `first_published`, `company_name`, `application_deadline` and `data_compliance` | Docs | [jobs.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md) |
| `pay_input_ranges` | `pay_transparency=true`: "include an array of `pay_input_ranges` with the pay range information defined for this job post". Each item is `{min_cents, max_cents, currency_type, title, blurb}`, for example `5000000`/`7500000`/`"USD"`/`"NYC Salary Range"` | Docs | [jobs.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md) |
| …on the list endpoint | **Not documented.** Observed to work as `jobs?content=true&pay_transparency=true`, with 2,238 of 2,397 Anduril jobs carrying a range (2026-09-30) | Observed | [areer notes](https://github.com/rubbieKelvin/areer/blob/9d89bde69b7871d1b739aa82c28003851df42040/brainstorms/03-job-extraction.md) |
| …without the flag | The list returns no ranges. That project then made one detail call per job | Observed | [cs-migration-compass](https://github.com/Mojtaba-Alehosseini/cs-migration-compass/blob/d2c8295ffcef292d23a908d257351768f92932e5/scripts/src_postings_greenhouse.py) |
| Pay interval | No interval field. Amounts are in cents, and `title`/`blurb` text is the only hint (for example "Hourly Pay Range") | Docs + Observed | [jobs.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md), [areer greenhouse.rs](https://github.com/rubbieKelvin/areer/blob/9d89bde69b7871d1b739aa82c28003851df42040/crates/crawler/src/extract/greenhouse.rs) |
| Pay text inside `content` | Greenhouse's help centre reportedly says the pay description and range are also put into `content`. **Unverified:** only seen in a search snippet, because the page is blocked | Search | [support article 10027759675931](https://support.greenhouse.io/hc/en-us/articles/10027759675931) |
| Departments, offices | `GET …/{board_token}/departments[/{id}]`, `GET …/{board_token}/offices[/{id}]`, with `render_as=list` (default) or `tree` | Docs | [_departments.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_departments.md), [_offices.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_offices.md) |
| JSONP | Supported: `?callback=name`, where the name may contain only letters, digits, `_` and `.` | Docs | [intro.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_introduction.md) |

## 2. Greenhouse board slugs: Anthropic and Anduril

| Company | ATS | Slug | Evidence | Kind | Source |
|---|---|---|---|---|---|
| Anthropic | Greenhouse | `anthropic` | Anthropic's own jobs page links to `job-boards.greenhouse.io/anthropic/jobs/4980436008`, `…/4951814008` and `…/5429202008` (fetched 2026-10-02) | Docs (company site) | [anthropic.com/jobs](https://www.anthropic.com/jobs) |
| Anthropic | Greenhouse | `anthropic` | Job pages indexed under the board | Search | [job-boards.greenhouse.io/anthropic/jobs/4666141008](https://job-boards.greenhouse.io/anthropic/jobs/4666141008) |
| Anduril | Greenhouse | `andurilindustries` | Job pages indexed under the board (anduril.com is blocked) | Search | [job-boards.greenhouse.io/andurilindustries/jobs/4786587007](https://job-boards.greenhouse.io/andurilindustries/jobs/4786587007), [/5071345007](https://job-boards.greenhouse.io/andurilindustries/jobs/5071345007) |
| Anduril | Greenhouse | `andurilindustries` | A live crawl read 2,397 Anduril jobs from the Greenhouse API (2026-09-30) | Observed | [areer notes](https://github.com/rubbieKelvin/areer/blob/9d89bde69b7871d1b739aa82c28003851df42040/brainstorms/03-job-extraction.md) |

API URLs: `https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true`
and `https://boards-api.greenhouse.io/v1/boards/andurilindustries/jobs?content=true`.

## 3. OpenAI careers and the Ashby posting API

### 3a. Which ATS backs openai.com/careers/search

| Fact | Value | Kind | Source |
|---|---|---|---|
| ATS | **Ashby**, board **`openai`** | — | rows below |
| Apply links | OpenAI postings on Built In apply at `jobs.ashbyhq.com/openai/<uuid>` (captured 2026-03-27 and 2026-06-25) | Observed | [captured page 1](https://github.com/alexeygrigorev/ai-engineering-field-guide/blob/ed590319553252e2b8275486597b144ac55a4f3c/job-market/_internal/jobs/raw/2026-06-25/Partner_AI_Deployment_Engineer_9559737.html), [captured page 2](https://github.com/alexeygrigorev/ai-engineering-field-guide/blob/ed590319553252e2b8275486597b144ac55a4f3c/job-market/_internal/jobs/raw/2026-03-27/AI_Deployment_Engineer_7761056.html) |
| Live board | `api.ashbyhq.com/posting-api/job-board/openai?includeCompensation=true` is cited as OpenAI's recruiting API, with records published 2026-09-14/15 that match `openai.com/careers/<slug>` pages | Observed | [talotd 2026-09-15](https://github.com/JordanFu/talotd/blob/c80205cc01318ce576208c315f20fff0ff8156c4/specials/ai-org-talent-mechanism/2026-09-15/information-candidates.md) |
| Live board | `openai` was among the 46 Ashby boards scanned live (2026-07-06) | Observed | [openings-mcp Ashby design](https://github.com/amikai/openings-mcp/blob/f2f4b8572070564a537ab570152739b60d18a589/docs/superpowers/specs/2026-07-06-ashby-openapi-design.md) |
| Caveat | openai.com is blocked here, so the page source of `/careers/search` was not inspected. OpenAI renders its own role pages; Ashby is the board behind them and the application form | — | — |

### 3b. Ashby posting API with `includeCompensation=true`

The official page, [developers.ashbyhq.com/docs/public-job-posting-api](https://developers.ashbyhq.com/docs/public-job-posting-api),
is blocked. The schema below comes from Framer's Ashby plugin, which links that
page, and from a design note written against the live API.

| Fact | Value | Kind | Source |
|---|---|---|---|
| Endpoint | `GET https://api.ashbyhq.com/posting-api/job-board/{jobBoardName}?includeCompensation=true` | Observed | [openings-mcp Ashby design](https://github.com/amikai/openings-mcp/blob/f2f4b8572070564a537ab570152739b60d18a589/docs/superpowers/specs/2026-07-06-ashby-openapi-design.md) |
| Shape | No auth, no paging, no detail endpoint. Returns `{apiVersion: "1" (a string), jobs: [...]}`. An unknown board gives `404` with the text `Not Found` | Observed | [openings-mcp Ashby design](https://github.com/amikai/openings-mcp/blob/f2f4b8572070564a537ab570152739b60d18a589/docs/superpowers/specs/2026-07-06-ashby-openapi-design.md) |
| Job fields | `id`, `title`, `location`, `secondaryLocations[] {location, address.postalAddress{addressLocality, addressRegion, addressCountry}}`, `department`, `team`, `isListed`, `isRemote`, `workplaceType`, `employmentType`, `descriptionHtml`, `descriptionPlain`, `publishedAt`, `address`, `jobUrl`, `applyUrl`, `shouldDisplayCompensationOnJobPostings`, `compensation` | Observed | [framer/plugins api-types.ts](https://github.com/framer/plugins/blob/6f9a02eb11675e9ace3c45e83f0ee1b776a89635/plugins/ashby/src/api-types.ts) |
| Enums | `workplaceType`: `OnSite` / `Remote` / `Hybrid`. `employmentType`: `FullTime` / `PartTime` / `Intern` / `Contract` / `Temporary` | Observed (from docs) | [openings-mcp Ashby design](https://github.com/amikai/openings-mcp/blob/f2f4b8572070564a537ab570152739b60d18a589/docs/superpowers/specs/2026-07-06-ashby-openapi-design.md) |
| `compensation` | `compensationTierSummary` (string or null), `scrapeableCompensationSalarySummary` (string or null), `compensationTiers[] {id, title, tierSummary, additionalInformation, components[]}`, `summaryComponents[]` | Observed | [framer/plugins api-types.ts](https://github.com/framer/plugins/blob/6f9a02eb11675e9ace3c45e83f0ee1b776a89635/plugins/ashby/src/api-types.ts) |
| Component | `{compensationType, interval, currencyCode, minValue, maxValue}`. Tier components also carry `id` and `summary` | Observed | [framer/plugins api-types.ts](https://github.com/framer/plugins/blob/6f9a02eb11675e9ace3c45e83f0ee1b776a89635/plugins/ashby/src/api-types.ts), [openings-mcp Ashby design](https://github.com/amikai/openings-mcp/blob/f2f4b8572070564a537ab570152739b60d18a589/docs/superpowers/specs/2026-07-06-ashby-openapi-design.md) |
| Values | `compensationType`: `Salary`, `EquityPercentage`, `Bonus`, and others. `interval`: `1 YEAR`, `1 HOUR`, `1 MONTH`, `NONE`, and others | Observed | [openings-mcp Ashby design](https://github.com/amikai/openings-mcp/blob/f2f4b8572070564a537ab570152739b60d18a589/docs/superpowers/specs/2026-07-06-ashby-openapi-design.md), [jobleft crawler README](https://github.com/Blueturboguy07/jobleft/blob/09f73deaa129259a107f5e46fa9a8bb9fce4ec48/packages/crawler/README.md) |
| Null quirks | `isRemote` and `workplaceType` are null on `openai`, `cohere` and other boards. With no pay published, both summaries are null and the arrays are empty | Observed | [openings-mcp Ashby design](https://github.com/amikai/openings-mcp/blob/f2f4b8572070564a537ab570152739b60d18a589/docs/superpowers/specs/2026-07-06-ashby-openapi-design.md) |
| Unlisted posts | Postings with `isListed: false` appear in the array and should be dropped | Observed | [areer notes](https://github.com/rubbieKelvin/areer/blob/9d89bde69b7871d1b739aa82c28003851df42040/brainstorms/03-job-extraction.md) |

## 4. Lever postings API

Docs: [lever/postings-api README](https://github.com/lever/postings-api/blob/master/README.md).

| Fact | Value | Kind | Source |
|---|---|---|---|
| List | `GET https://api.lever.co/v0/postings/{site}?mode=json` (EU: `api.eu.lever.co`). Returns a JSON array | Docs | [README](https://github.com/lever/postings-api/blob/master/README.md) |
| Single | `GET /v0/postings/{site}/{posting-id}`, with the same fields, JSON only | Docs | [README](https://github.com/lever/postings-api/blob/master/README.md) |
| Params | `mode`, `skip`, `limit`, `location`, `commitment`, `team`, `department`, `level`, `group` | Docs | [README](https://github.com/lever/postings-api/blob/master/README.md) |
| Core fields | `id`, `text` (the title), `country` (ISO alpha-2 or null), `hostedUrl`, `applyUrl`, `workplaceType` (`unspecified` / `on-site` / `remote` / `hybrid`) | Docs | [README](https://github.com/lever/postings-api/blob/master/README.md) |
| `categories` | `{location, commitment, team, department, allLocations[]}`. The primary `location` is also in `allLocations` | Docs | [README](https://github.com/lever/postings-api/blob/master/README.md) |
| Description | `opening`, `description` (opening plus body), `descriptionBody` and `additional`, each with a `…Plain` twin | Docs | [README](https://github.com/lever/postings-api/blob/master/README.md) |
| `lists` | `[{text: NAME, content: "unstyled HTML of list elements"}]`, i.e. `<li>`s with no wrapping `<ul>` | Docs | [README](https://github.com/lever/postings-api/blob/master/README.md) |
| `salaryRange` | Optional `{currency, interval, min, max}`, plus `salaryDescription` and `salaryDescriptionPlain` | Docs | [README](https://github.com/lever/postings-api/blob/master/README.md) |
| Interval values | `per-year-salary` (718), `per-hour-wage` (113), `per-month-salary` (1) across 1,116 jobs on 21 boards. 75% of those jobs had a `salaryRange` (2026-06-23) | Observed | [ever-jobs spec 5010](https://github.com/ever-jobs/ever-jobs/blob/57399c8500211e1ce57b5fbfc5e4d2b2de58b33d/.specify/specs/5010-lever-field-mappings/spec.md) |
| `workplaceType` seen live | `onsite` / `hybrid` / `remote` (not `on-site`) | Observed | [ever-jobs spec 5010](https://github.com/ever-jobs/ever-jobs/blob/57399c8500211e1ce57b5fbfc5e4d2b2de58b33d/.specify/specs/5010-lever-field-mappings/spec.md) |
| Undocumented field | `createdAt`, as epoch **milliseconds** | Observed | [pt-tracker README](https://github.com/Prathmesh-28/pt-tracker.github.io/blob/61bad3b391f25367f1eb30683400ced7a9bd76d5/README.md) |
| Size | Palantir's listing is over 5 MB | Observed | [areer notes](https://github.com/rubbieKelvin/areer/blob/9d89bde69b7871d1b739aa82c28003851df42040/brainstorms/03-job-extraction.md) |

## 5. Cross-origin (CORS) from a static GitHub Pages build

| API | What the vendor says | Headers seen live (curl with an `Origin` header, 2026-09-28) | Verdict |
|---|---|---|---|
| Greenhouse | Nothing on CORS. JSONP via `callback` is documented ([intro.md](https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_introduction.md)) | `access-control-allow-origin: *` on both list and single job ([10xjobs spike 4](https://github.com/tydev-new/10xjobs-careercoach/blob/2a4ae4f43ff3dea3ac1bd34a34561ec28bb3a270/docs/spikes/spike-4-board-apis.md)) | **Yes.** JSONP is a documented fallback |
| Ashby | Official page not readable from here | `access-control-allow-origin: *` on the list ([10xjobs spike 4](https://github.com/tydev-new/10xjobs-careercoach/blob/2a4ae4f43ff3dea3ac1bd34a34561ec28bb3a270/docs/spikes/spike-4-board-apis.md)) | **Yes in practice**, not documented |
| Lever | "The API does not … Support cross-origin HTTP requests from sites outside of your company's domains/subdomains" ([README](https://github.com/lever/postings-api/blob/master/README.md)) | `access-control-allow-origin: *` on the list. The single posting echoes the `Origin` sent ([10xjobs spike 4](https://github.com/tydev-new/10xjobs-careercoach/blob/2a4ae4f43ff3dea3ac1bd34a34561ec28bb3a270/docs/spikes/spike-4-board-apis.md)) | **Works today, against the docs.** It could stop without notice |

Supporting evidence: a GitHub Pages site re-pulls all three from the browser
because "all three send `Access-Control-Allow-Origin: *`"
([pt-tracker README](https://github.com/Prathmesh-28/pt-tracker.github.io/blob/61bad3b391f25367f1eb30683400ced7a9bd76d5/README.md)).
A browser-only board validator says the same
([jobscraper_hourly ats.ts](https://github.com/smresponsibilities/jobscraper_hourly/blob/3d6589c1dd615ac729584a8ebe55db175f4e0ee3/web/lib/ats.ts)).

**Limit:** no source records a real browser `fetch()` result; the spike's
browser section was never filled in. Curl shows the header but does not enforce
CORS. After deploying, load the Pages site and confirm one fetch per source
succeeds, and keep the snapshot fallback for Lever.

## 6. Other AI and defence companies

Each slug is backed by job URLs on the ATS's own domain. The company careers
sites were blocked, so none of these is confirmed from the company side.

| Company | Sector | ATS | Slug | Evidence | Source |
|---|---|---|---|---|---|
| Scale AI | AI data | Greenhouse | `scaleai` | Job pages on the board. An internship tracker lists job 4730845005 (2026-09-04) | [job-boards.greenhouse.io/scaleai/jobs/4605996005](https://job-boards.greenhouse.io/scaleai/jobs/4605996005), [tracker](https://github.com/SuryaHarikrishnan/2027-internship-tracker/blob/e7d3b93c64cefaeeb3d4ab5fa60486f2203d4f39/listings/software-engineering.md) |
| xAI | AI lab | Greenhouse | `xai` | Job pages on the board | [job-boards.greenhouse.io/xai/jobs/4378347007](https://job-boards.greenhouse.io/xai/jobs/4378347007), [/4800099007](https://job-boards.greenhouse.io/xai/jobs/4800099007) |
| Cohere | AI lab | Ashby | `cohere` | Among the Ashby boards scanned live (2026-07-06). Application URLs use `jobs.ashbyhq.com/cohere/…` | [openings-mcp Ashby design](https://github.com/amikai/openings-mcp/blob/f2f4b8572070564a537ab570152739b60d18a589/docs/superpowers/specs/2026-07-06-ashby-openapi-design.md), [junghan0611/apply](https://github.com/junghan0611/apply/blob/9b43d311f53162dc846faf1e005d7e23f21935b6/applications/SUBMIT-QUEUE.md) |
| Palantir | Defence software | Lever | `palantir` | Posting API URLs under `api.lever.co/v0/postings/palantir/…`. Apply links under `jobs.lever.co/palantir/…` (2026-06-29) | [api.lever.co/v0/postings/palantir/d1ac83d0-…](https://api.lever.co/v0/postings/palantir/d1ac83d0-e923-42a5-8e6d-58dd0cab25ca), [tracker](https://github.com/SuryaHarikrishnan/2027-internship-tracker/blob/e7d3b93c64cefaeeb3d4ab5fa60486f2203d4f39/listings/software-engineering.md) |
| Shield AI | Defence autonomy | Lever | `shieldai` | Job page on the board | [jobs.lever.co/shieldai/e3125c80-…](https://jobs.lever.co/shieldai/e3125c80-58a6-42ad-a1ae-341f5795f9e3) |

### Could not confirm

- **Mistral AI, Lever `mistral`**: a job page existed
  ([jobs.lever.co/mistral/5ee49b30-…](https://jobs.lever.co/mistral/5ee49b30-7757-4e24-aa54-080265ce1d15)),
  but the first real-data snapshot run on GitHub Actions (2026-10-02) got **0 jobs** from
  `api.lever.co/v0/postings/mistral`. The slug is probably stale, so Mistral was removed from the built-ins.

## 7. Big-tech career sites (beta)

Verified on 2026-10-10 against **real responses from GitHub-hosted runners**
(`.github/workflows/bigtech-probe.yml` → `scripts/probe-bigtech.js`; the build
sandbox has no route to these hosts). Run numbers refer to that workflow's runs;
the log is in [process/bigtech-data.md](process/bigtech-data.md). These boards are
on the **beta channel only** (`channel: 'beta'`, `live: false` in
`server/companies.js`): `node scripts/snapshot.js --channel beta` writes
`data/snapshots/<slug>.json`, and only the `/beta/` site shows them. None of the
hosts sends CORS headers (`access-control-allow-origin` absent on every response),
so the browser never fetches them.


**Terms of use: Amazon and Meta are paused (2026-10-10).** The adapters work, but two sites'
terms bar automated collection, so both are `paused: 'terms'` in `server/companies.js` and are
not crawled, built or listed. `listCompanies()` skips them unless `includePaused: true`.
- Amazon's Conditions of Use exclude "data mining, robots, or similar data gathering and
  extraction tools".
- Meta's Automated Data Collection Terms bar automated collection "without … express written
  permission", even though robots.txt and the sitemap expose the job pages.
These quotes come from search results and the live pages are being re-checked (probe run
38036154904). Resuming either needs the user's decision, or the company's permission. The other
boards' terms were not found to bar this kind of polite, robots.txt-respecting collection; that
check is also part of the probe run.

**How every adapter collects** (`server/sources/polite.js`):
- It uses only the JSON or HTML endpoints that the careers site's own front end
  calls, or the sitemap the site publishes for crawlers.
- It sends an honest User-Agent: `melon-seek/0.2 (+https://alvations.github.io/melon-seek/; open-source job-postings salary chart; about 1 request/s)`.
  There is no browser impersonation, and no spoofed Referer or Origin.
- Requests to one host start at least **1 s apart**, with at most 2 in flight.
- 429 and 5xx are retried after 2/4/8/16 s (or after `Retry-After`, up to 60 s).
  A 403 is never retried.
- Redirects are never followed off the fixed host.
- The site's own session cookies are kept in a per-run jar (Eightfold puts
  cookieless clients in a tiny shared rate bucket). Nothing needs a login, and no
  token is used except what the site itself serves.
- **robots.txt is fetched and checked at the start of every crawl**: a disallowed
  path aborts that company (`code: 'robots'`).

| Company | Slug | Status | Endpoint (front-end's own) | Postings (run 38044091555) | With pay | Snapshot | Posting URL host |
|---|---|---|---|---:|---:|---:|---|
| Google | `google` | works | jobs sitemap + `batchexecute` `sf9Qmf` | 3,417 | 2,032 (59.5%) | 23.5 MB | `www.google.com` |
| Microsoft | `microsoft` | works | Eightfold PCSX `apply.careers.microsoft.com/api/pcsx/*` | 2,320 | 1,482 (63.9%) | 30.1 MB | `apply.careers.microsoft.com` |
| Meta | `meta` | **paused (terms)** | jobs sitemap + job pages (`public_compensation`) | — (not crawled) | — | — | `www.metacareers.com` |
| Apple | `apple` | works | `jobs.apple.com/api/v1/search` + `jobDetails` | 6,105 | 3,848 (63.0%) | 32.0 MB | `jobs.apple.com` |
| Netflix | `netflix` | works | Eightfold classic `explore.jobs.netflix.net/api/apply/v2/jobs` | 456 | 294 (64.5%) | 4.7 MB | `explore.jobs.netflix.net` |
| Amazon | `amazon` | **paused (terms)** | `www.amazon.jobs/en/search.json` | — (not crawled) | — | — | `www.amazon.jobs` |
| NVIDIA | `nvidia` | works | Eightfold PCSX `jobs.nvidia.com/api/pcsx/*` | 2,664 | 1,394 (52.3%) | 18.2 MB | `jobs.nvidia.com` |
| Tesla | — | **blocked, left out** | `www.tesla.com/cua-api/apps/careers/state` | — | — | — | — |

Counts are from the first full big-tech crawl, `snapshot.yml` run 38044091555 (2026-10-10; job logs and
`data/beta/snapshots/<slug>.json` agree exactly). "With pay" is postings with a published base range after the
vetting gate (Netflix: 1 more quarantined). "Snapshot" is the crawl's JSON file. Crawl cost per board: Netflix 504 s
(503 requests), Microsoft 2,572 s (2,553), NVIDIA 2,939 s (2,932), Google 3,432 s (3,424), Apple 7,625 s (4,716
requests, 4,401 detail pages). Apple's 6,105 postings are 4,882 requisitions: Apple lists one posting per location
(`<req>-<location id>`), see docs/process/data-check-beta.md DQ-2.

### 7a. Pay rules (all companies)

Pay is read by `server/salary.js` from the posting text, or from the site's own
structured field where one exists (Meta `public_compensation`, Amazon's per-location
pay table). Every result then passes the vetting gate (`server/vet.js`); see
[VETTING.md](VETTING.md). Real-text fixtures for each format are in
`test/bigtech-salary.test.js`.

| Rule | Applied as |
|---|---|
| **On-target earnings** (norm-6) | A range the posting calls OTE / on-target earnings / on target compensation / base + commission at target keeps its numbers and gets `salary.kind: "ote"` (base plus commission at target), never shown or pooled as base pay. "For sales roles, the range provided is the role's On Target Earnings ("OTE") range" (Anthropic boilerplate) applies to sales titles only. See [VETTING.md](VETTING.md) §2. NVIDIA's sales "cash compensation range" (85% base, 15% variable) and Netflix's sales "market range" for an area are still `salary: null` under the rule below; norm-6 does not change them (whether NVIDIA's range should become `"ote"` is an open question in the fix-pay-data log) |
| **Base pay only** | "+ bonus + equity + benefits" after a range marks it as base pay, and the extras are never added. A **total** compensation range (Google DeepMind "Total Compensation Range: $550,000 – $1,100,000 (includes … sign-on bonus …)") and NVIDIA's sales **cash** compensation range ("85% paid through base salary and 15% variable compensation. The cash compensation range is …") are not base pay, so the posting gets `salary: null` |
| **Several ranges by location** | The first or national range. Microsoft states the U.S. range first and the SF Bay Area / NYC range second, so the U.S. one is used. Amazon has no national figure, only a per-location table, so the row for the posting's own primary city is used (else the first row). Every row is kept in `salary.ranges` and counted in `zones` |
| **Several ranges by level** | Lowest listed min to highest listed max, with the levels named in `salary.text`: NVIDIA "168,000 USD - 264,500 USD for Level 4, and 196,000 USD - 310,500 USD for Level 5"; Microsoft "IC4: USD $119,800 - $234,700 per year; IC5: USD $142,800 - $274,800 per year". The span is capped at 4× (the gate's ratio bound). Microsoft also prices one level per **country** ("across Ireland is €…", "across Germany is €…"). Those are not levels: the job's own country is used, and countries are never mixed |
| **Netflix** | "The range for this role is $210,000.00 - $360,000.00" is a **real posted range**. It is role-specific, and Netflix says pay "consists solely of an annual salary; we do not have bonuses" (options are carved out of that salary at the employee's choice). The sales-only "The overall market range for roles in this area of Netflix is typically $X - $Y. A portion of this compensation is variable." is **not** used: it is a band for an area, not this role, and it includes variable pay. Those postings get `salary: null` |
| **No range** | `salary: null`. Examples: Apple postings whose "Pay & Benefits" footer gives no numbers, NVIDIA outside the US/PL/CA, and most non-US postings at every company |
| **Prose money** | Never pay (the $4.6M rule): amounts need pay context, and million/billion amounts are never pay. The parser changes for these formats change **0 of 5,413** stable-board parses |

Parser changes made for these formats (`server/salary.js`):
- "U.S." no longer ends a clause, so "typical base pay range for this role across the U.S. is USD …" keeps its pay words.
- "range for this role/position" counts as pay context.
- "+ bonus + equity + benefits" (and "+ 25% bonus target + equity") after an amount is pay context, and is not read as "this amount is a bonus".
- A clause naming total or cash compensation before the amount rejects it, unless "base pay/salary" follows that phrase.
- Microsoft's national-range sentences are grouped by country and spanned by level (`NATIONAL_RE`, `NATION_CODE`).
- Level tiers keep a trailing "for Level N" label.
- `Kč` maps to CZK.

### 7b. Google (`server/sources/google.js`)

| Fact | Value |
|---|---|
| robots.txt (www.google.com) | **Disallows every paged results URL**: `/about/careers/applications/jobs/results?page=`, `…/results/?page=`, `…/results?*&page=`, `…/results/?*&page=`. Single postings (`…/jobs/results/<id>-<slug>`) and the RPC path are not disallowed. So the board is **not** read by paging search results (neither the HTML pages nor the `r06xKb` search RPC behind them) |
| List | `GET https://www.google.com/about/careers/applications/jobs/sitemap.xml`: the jobs sitemap (~620 KB, one `<loc>https://careers.google.com/jobs/results/<id>-<slug>/</loc>` per posting with `lastmod`). careers.google.com 301s to www.google.com |
| Detail | `POST https://www.google.com/about/careers/applications/_/HiringCportalFrontendUi/data/batchexecute`, form body `f.req=[[["sf9Qmf","[\"<id>\"]",null,"generic"]]]`, `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`. No cookie or token. The response is XSSI-guarded (`)]}'`): the `wrb.fr` row's JSON string holds `[record]`. About 5 KB per posting, against ~1.3 MB for the HTML job page |
| Record (positional) | 0 id, 1 title, 3 responsibilities `[_, html]`, 4 qualifications `[_, html]`, 7 brand (Google, DeepMind, YouTube, Verily…), 9 locations `[[display, addresses, city, zip, state, country]…]`, 10 about the job `[_, html]` (holds the pay line), 12 created `[s, ns]`, 13 updated, 16 remote flag |
| Mapping | sourceId = id; team = brand; locations = slot 9 display names; url = `https://www.google.com/about/careers/applications/jobs/results/<id>-<slug>`; postedAt = slot 12; updatedAt = slot 13; html = about + responsibilities + qualifications |
| Pay | Text, in two phrasings: "The US base salary range for this full-time position is $141,000-$202,000 + bonus + equity + benefits." and "US: $300000 - $333000 (USD) + 25% bonus target + equity + benefits". EU postings carry "€190000 - €194000" style lines. DeepMind lists "Base Salary Range" and "Total Compensation Range"; only base is used |
| Requests | 1 (sitemap) + 1 per posting. Run 6: 3 × HTTP 502, all recovered on retry |

### 7c. Microsoft and NVIDIA: Eightfold PCSX (`server/sources/eightfold.js`)

| Fact | Value |
|---|---|
| Hosts | Microsoft `apply.careers.microsoft.com` (domain `microsoft.com`). NVIDIA `jobs.nvidia.com` (domain `nvidia.com`), NVIDIA's own careers front end. Its Workday CXS API (`nvidia.wd5.myworkdayjobs.com/wday/cxs/…`) answered every POST with a 303 to `community.workday.com/maintenance-page` during run 1 (Saturday 07:18 UTC, Workday's maintenance window), and its Workday robots.txt is empty. Workday is therefore not used |
| robots.txt | Both: `User-agent: *`, `Disallow: /`, `Allow: /careers`, `Allow: /api/apply`, `Allow: /api/pcsx`, `Allow: /api/events`, `Allow: /careerhub/explore/jobs`, `Allow: /api/career_hub` |
| List | `GET /api/pcsx/search?domain=<d>&query=&location=&start=N&sort_by=timestamp` → `{ status, data: { count, positions[] } }`. Exactly **10 per page** (`num` is ignored). `count` is the true total |
| Position fields | `id`, `displayJobId`, `name`, `locations[]` ("United States, Washington, Redmond"), `standardizedLocations[]` ("Redmond, WA, US"; NVIDIA remote: "CA,US"), `postedTs`, `creationTs` (epoch s), `department`, `workLocationOption` (`onsite`, `remote_local`, …), `positionUrl` |
| Detail | `GET /api/pcsx/position_details?position_id=<id>&domain=<d>&hl=en` → `data.jobDescription` (HTML), `publicUrl`, Microsoft `efcustomTextEmploymentType[]`, `efcustomTextWorkSite[]`, `efcustomTextTaDisciplineName[]`; NVIDIA `efcustomTextTimeType[]`. The list has no description, so pay costs one detail request per posting |
| Mapping | sourceId = id; reqId = displayJobId; locations = standardizedLocations; remote = workLocationOption ~ remote, or a "Remote" location; url = publicUrl (`https://<host>/careers/job/<id>`); postedAt = creationTs; updatedAt = postedTs |
| Pay (Microsoft) | "Software Engineering IC2 - The typical base pay range for this role across the U.S. is USD $85,400 - $168,100 per year. There is a different range applicable to specific work locations, within the San Francisco Bay area and New York City metropolitan area, and the base pay range for this role in those locations is USD $111,100 - $183,700 per year." Hourly and monthly (interns: "USD $6,810 - $13,480 per month") versions exist. Outside the US: "…across Germany is € 130,200.00 - € 222,000.00 per year", "…across Czechia is Kč 1,338,000.00 - Kč 2,448,000". Several levels, or several countries, can be listed in one posting (rules in 7a) |
| Pay (NVIDIA) | "Your base salary will be determined based on your location, experience, and the pay of employees in similar positions. The base salary range is 272,000 USD - 431,250 USD." Levels: "… 168,000 USD - 264,500 USD for Level 4, and 196,000 USD - 310,500 USD for Level 5." Interns: "The hourly rate for our interns is 20 USD - 71 USD." Sales: "cash compensation range" (not base: null) |

### 7d. Netflix: Eightfold classic (`server/sources/eightfold.js`)

| Fact | Value |
|---|---|
| Host, robots.txt | `explore.jobs.netflix.net`. Same Eightfold robots.txt as 7c (`/api/apply` allowed). PCSX answers 403 `{"message": "PCSX is not enabled for this user."}`, so the classic API is the front end's |
| List | `GET /api/apply/v2/jobs?domain=netflix.com&start=N&num=10&sort_by=relevance` → `{ count, positions[] }`, 10 per page; `count` was the real total (456). `job_description` is empty in the list |
| Position fields | `id`, `name`, `posting_name`, `location`, `locations[]` ("Los Angeles,California,United States of America"), `department`, `business_unit`, `t_create`, `t_update`, `display_job_id` (JR…), `work_location_option` (always "onsite" in the list), `canonicalPositionUrl` |
| Detail | `GET /api/apply/v2/jobs/<id>?domain=netflix.com` → the position with `job_description` (HTML) and `custom_JD.data_fields` (`posting_date`, `team`, `work_type`) |
| Mapping | locations get spaces after commas; remote only from "Remote, United States" style locations (the list's "onsite" is not trusted); url = canonicalPositionUrl without `?microsite=`; team = business_unit; postedAt = t_create; updatedAt = t_update |
| Pay | "…to determine your compensation in the market range. The range for this role is $210,000.00 - $360,000.00." (see 7a for the market-range decision) |

### 7e. Amazon (`server/sources/amazon.js`)

| Fact | Value |
|---|---|
| robots.txt | `User-agent: AhrefsBot / Disallow: /`; `User-agent: *` disallows only `/internal` and `/<lang>/internal` |
| List | `GET https://www.amazon.jobs/en/search.json?offset=N&result_limit=100&sort=recent[&normalized_country_code[]=USA][&business_category[]=aws][&facets[]=normalized_country_code&facets[]=business_category]`. `result_limit` up to 100. **`hits` is capped at 10,000** per query (offset 9,900 works, beyond returns nothing). `facets[]=…` returns `normalized_country_code_facet: [{USA: n}, …]` (58 countries) and `business_category_facet` (62 categories). `job_schedule_type[]` is ignored |
| Partitioning | Country by country; a country at the cap (the US) is split by business category. Postings are deduped on `id_icims`. Facet total: **22,415 postings** (run 6) |
| Row fields | The whole posting is in the row: `id_icims`, `title`, `job_path`, `description`, `basic_qualifications`, `preferred_qualifications` (HTML with `<br/>` and "- " bullets), `job_category`, `job_family`, `business_category`, `job_schedule_type`, `city`, `state`, `country_code`, `normalized_location`, `locations[]` (JSON strings: `normalizedLocation`, `type: ONSITE`…), `posted_date` ("October 10, 2026"), `updated_time` ("about 5 hours"). No detail request |
| Mapping | sourceId = reqId = id_icims; department = job_category; team = job_family (when different); locations = each `locations[].normalizedLocation`; url = `https://www.amazon.jobs<job_path>`; postedAt = posted_date (UTC date); the "- " lines become `<ul>` lists |
| Pay | After "The base salary range for this position is listed below.", a **per-location table**, one line each: "USA, CA, East Palo Alto - 165,200.00 - 223,600.00 USD annually", "Seattle, WA, USA - 80,200.00 USD Annually", "USA, VA, Aldie - 27.98 - 48.99 USD hourly", "CAN, ON, Toronto - 84,600.00 - 126,800.00 CAD annually". Parsed by the adapter (`amazonPayTable`: structured). Older postings use the national sentence "ranges from $129,300/year in our lowest geographic market up to $223,600/year in our highest geographic market", which the text parser reads |

### 7f. Apple (`server/sources/apple.js`)

| Fact | Value |
|---|---|
| robots.txt | jobs.apple.com has none: `/robots.txt` 301s to `apple.com/pagenotfound`, a 404 (no rules, RFC 9309 §2.3.1.3) |
| List | `POST https://jobs.apple.com/api/v1/search`, JSON body `{query:"", filters:{}, page, locale:"en-us", sort:"newest", format:{longDate:"MMMM D, YYYY", mediumDate:"MMM D, YYYY"}}` → `{ res: { searchResults[], totalRecords } }`. 20 per page; 6,105 total, 4,401 US (run 1). **Without `format` the API answers 200 with zero results.** No CSRF token or cookie is needed (the `CSRFToken` endpoint is not used). Random empty pages mid-board are retried |
| Row fields | `id` (`200674386-0836` per location, `PIPE-…` for retail pipeline roles), `positionId`, `postingTitle`, `transformedPostingTitle`, `jobSummary`, `locations[]` (`name`, `city`, `stateProvince`, `countryName`), `team.teamName`, `homeOffice`, `standardWeeklyHours`, `postingDate`, `managedPipelineRole` |
| Detail | `GET /api/v1/jobDetails/<id>?locale=en-us` → `res.description`, `responsibilities`, `minimumQualifications`, `preferredQualifications`, `postingFooters[]` (`postLocationId`, `localizations.en_US[]` with `name: "Pay & Benefits"`), `selectedLocation`, `teamNames`, `postingDateMeta`. ~2 s per request server-side |
| Scope | **Detail requests only for US postings.** Apple publishes pay only there; elsewhere the search row's `jobSummary` is the description. This halves a ~2-hour crawl |
| Mapping | url = `https://jobs.apple.com/en-us/details/<id without PIPE->/<transformedPostingTitle>`; department = team; employmentType from `standardWeeklyHours` (≥ 35 h = Full-time); postedAt = `postingDateMeta`, except managed-pipeline (retail) rows, which are re-stamped on every request and get `null` |
| Pay | Footer: "The base pay range for this role is between $150,400 and $277,600, and your base pay will depend on your skills, qualifications, experience, and location." Hourly: "between $34.31 and $73.20/hr". Some US footers give no range (seasonal retail): null |

### 7g. Meta (`server/sources/meta.js`)

| Fact | Value |
|---|---|
| robots.txt | `User-agent: *` disallows `/ajax/`, `/tealium/`, `/intern/`, `/internal/`, `/login/`, `/oidc/callback/`, `/signup/`, `/resume/`, …; job pages are allowed. Lists `Sitemap: https://www.metacareers.com/jobsearch/sitemap.xml` |
| List | `GET https://www.metacareers.com/jobsearch/sitemap.xml` (~150 KB): `<loc>https://www.metacareers.com/profile/job_details/<id>/</loc>` per open posting (1,143 in run 6). `/jobs` 301s to `/jobsearch/` |
| Detail | The public job page (~480 KB HTML) carries a schema.org `JobPosting` (`title`, `description`, `datePosted`, `jobLocation[]`, `employmentType`) and the page's own data after `"apply_for_this_job_section"`: `title`, `locations[]`, `departments[]`, `internal_departments[]`, `description` (`{"__html": …}`), `responsibilities[]`, `minimum_qualifications[]`, `preferred_qualifications[]`, `public_compensation[]`. The GraphQL search (`/graphql` with an `LSD` token and a rotating persisted `doc_id`) is **not** used |
| Mapping | title = JSON-LD title; department = internal_departments[0]; team = departments[0]; locations = page locations ("Sunnyvale, CA", "Remote, US"); url = the sitemap URL; postedAt = datePosted |
| Pay | Structured: `public_compensation: [{compensation_amount_minimum: "$173,000/year", compensation_amount_maximum: "$245,000/year", country_code: "US", has_bonus, has_equity}]`, also "$7,313/month" for interns. The range for the first location's country is used, else the US one. Text reads "$173,000/year to $245,000/year + bonus + equity (US)" |

### 7h. Tesla: blocked, left out

Every plain request to `www.tesla.com` returned HTTP 403 "Access Denied" from
Akamai (`server: AkamaiGHost`): `/robots.txt`, `/cua-api/apps/careers/state`
(the careers search API) and `/careers/search/` (runs 1 and 2). Getting past
that would mean impersonating a browser or evading bot protection, which this
project does not do. Tesla is therefore not in `server/companies.js`, has no
adapter, and is not on the beta site. `scripts/probe-bigtech.js --mode recon
--companies tesla` re-checks it.
