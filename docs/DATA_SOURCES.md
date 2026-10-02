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

Also confirmed but left out to stay within five: Mistral AI on Lever as `mistral`
([jobs.lever.co/mistral/5ee49b30-…](https://jobs.lever.co/mistral/5ee49b30-7757-4e24-aa54-080265ce1d15)).
