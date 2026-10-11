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
`<MELON_SNAPSHOT_DIR>/<slug>.json` (the workflows set it to `data/beta/snapshots/`), and only
the `/beta/` site shows them. They are re-crawled every 6 hours; only new or changed postings'
detail pages are read (§8). None of the
hosts sends CORS headers (`access-control-allow-origin` absent on every response),
so the browser never fetches them.


**Terms of use: Amazon and Meta were paused on 2026-10-10 and resumed on 2026-10-11 by the
user's decision ([AMAZON_META.md](AMAZON_META.md), "Decision").** Both were `paused: 'terms'` in
`server/companies.js`; deleting that field resumed them, and each appears on `/beta/` after its
first crawl. Amazon keeps a 5,000-posting budget (`maxPostings`: postings with a published pay
range first, then the newest), and the page says "of 22,415 posted".

Why they were paused (re-checked on the live pages on 2026-10-11, freshness-probe runs
38136448486 and 38136777427; quotes, URLs and hashes in
[data/alt/terms-2026-10-11.json](../data/alt/terms-2026-10-11.json)):
- amazon.jobs has no terms of its own; its footer's "Conditions of use" link goes to amazon.com's
  Conditions of Use (last updated August 14, 2026), whose licence "does not include [...] any
  use of data mining, robots, or similar data gathering and extraction tools". Its robots.txt
  allows the job pages and the search the adapter uses.
- metacareers.com's robots.txt opens with "Collection of data on Facebook through automated
  means is prohibited unless you have express written permission from Facebook", linking to
  Meta's Automated Data Collection Terms (effective October 7, 2024): "You will not engage in
  Automated Data Collection without first obtaining Meta's express written permission". Meta's
  Terms of Service (effective January 1, 2025) add, in 3.2, "regardless of whether such
  automated access or collection is undertaken while logged-in".
- The same kind of clause is in Apple's site terms ("You may not use any [...] "robot", "spider"
  or other automatic device [...] to access, acquire, copy or monitor any portion of the Site")
  and in Netflix's consumer terms of use (for "the Netflix service"; the careers site is an
  Eightfold tenant): probe run 38036154904. Google's terms tie automated access to robots.txt,
  and Microsoft's to information "intentionally made available".

The user was shown these and chose to resume both, accepting the risk; Apple stays as it is. Pay
that Amazon and Meta file with the US Department of Labor (public domain) is a separate route:
`scripts/alt-data/dol-disclosure.js`. Should `paused` be set again, neither site is requested by
anything: the adapter refuses to start before its first request (`crawlBlock`, code `paused`),
whoever calls it, and `scripts/probe-bigtech.js` skips both and refuses their career hosts. The
switch is that one field; the crawl, merge, archive, build and list follow on the next 6-hourly
run ([process/amazon-meta-backend.md](process/amazon-meta-backend.md), "The resume switch").

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

| Company | Slug | Status | Endpoint (front-end's own) | Postings (run 38118242488) | With pay | Snapshot | Posting URL host |
|---|---|---|---|---:|---:|---:|---|
| Google | `google` | works | jobs sitemap + `batchexecute` `sf9Qmf` | 3,417 | 2,217 (64.9%) | 23.6 MB | `www.google.com` |
| Microsoft | `microsoft` | works | Eightfold PCSX `apply.careers.microsoft.com/api/pcsx/*` | 2,279 | 1,490 (65.4%) | 29.7 MB | `apply.careers.microsoft.com` |
| Meta | `meta` | works (resumed; counts after the first crawl) | jobs sitemap + job pages (`public_compensation`) | — | — | — | `www.metacareers.com` |
| Apple | `apple` | works | `jobs.apple.com/api/v1/search` + `jobDetails` | 4,875 | 2,818 (57.8%) | 25.4 MB | `jobs.apple.com` |
| Netflix | `netflix` | works | Eightfold classic `explore.jobs.netflix.net/api/apply/v2/jobs` | 457 | 290 (63.5%) | 4.7 MB | `explore.jobs.netflix.net` |
| Amazon | `amazon` | works (resumed; capped at 5,000 on /beta/; counts after the first crawl) | `www.amazon.jobs/en/search.json` | — | — | — | `www.amazon.jobs` |
| NVIDIA | `nvidia` | works | Eightfold PCSX `jobs.nvidia.com/api/pcsx/*` | 2,663 | 1,396 (52.4%) | 18.4 MB | `jobs.nvidia.com` |
| Tesla | — | **blocked, left out** | `www.tesla.com/cua-api/apps/careers/state` | — | — | — | — |

Counts are from `snapshot.yml` run 38118242488 (2026-10-11, crawls 06:30-07:59 UTC; the job logs, the
beta gate lines and `data/beta/snapshots/<slug>.json` agree exactly; docs/process/data-check-beta-2.md). "With pay" is
postings with a published base range after the vetting gate (Netflix: 2 more quarantined, "Pay unclear"). "Snapshot"
is the crawl's JSON file. Crawl cost per board: Netflix 505 s (504 requests), Microsoft 2,533 s (2,510), NVIDIA
2,940 s (2,931), Google 3,430 s (3,421), Apple 5,343 s (4,704 requests, 4,396 detail pages). Apple's search listed
6,094 of the 6,098 postings it counts, and those 6,094 listings are 4,875 requisitions: Apple lists one posting per
location (`<req>-<location id>`, docs/process/data-check-beta.md DQ-2), and the adapter returns one posting per
requisition (7f). Microsoft's search listed 2,279 of the 2,285 postings its count reports. The first full crawl,
run 38044091555 (2026-10-10), read Google 3,417 (2,032 with pay), Microsoft 2,320 (1,482), Apple 6,105 listings
(3,848; 4,882 requisitions), Netflix 456 (294) and NVIDIA 2,664 (1,394). Google's rise from 2,032 to 2,217
postings with pay is the norm-7 parser ("zł", "kr", "kr." and "+ 42.86% bonus target" lines), not new postings;
its 4 Romanian "lei" ranges, and Microsoft's 12, are still not shown (RON has no exchange rate).

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
| **Several ranges by location** | The first or national range. Microsoft states the U.S. range first and the SF Bay Area / NYC range second: the U.S. one is used, except for a job whose US locations are **all** in the SF Bay Area (75 km around the bay) or the New York City metro (60 km around Manhattan), which uses the SF Bay Area / NYC range (norm-7, decided by the lead for DQ-13: 31 postings, median 18% higher). Amazon has no national figure, only a per-location table, so the row for the posting's own primary city is used (city and state compared whole, so "York, PA" is not "New York, NY"), else the first row in the posting's country, else the first row. Every row is kept in `salary.ranges` and counted in `zones` |
| **Several ranges by level** | Lowest listed min to highest listed max, with the levels named in `salary.text`: NVIDIA "168,000 USD - 264,500 USD for Level 4, and 196,000 USD - 310,500 USD for Level 5"; Microsoft "IC4: USD $119,800 - $234,700 per year; IC5: USD $142,800 - $274,800 per year". Each level's own range is kept in `salary.levels` (`[{ label: "Level 4", min, max }, …]`, annual, norm-7). The span is capped at 4× (the gate's ratio bound). Microsoft also prices one level per **country** ("across Ireland is €…", "across Germany is €…"). Those are not levels: the job's own country is used, and countries are never mixed |
| **One line per country** (Google) | "US: $171000 - $247000 (USD) + 20% bonus target + equity + benefits", "Ireland: €142000 - €145000 (EUR) …": the line for the job's country, the US one when the job has a US location, else the line for its first location's country. Lines for different countries are never spanned; one country's degree lines are ("[Bachelor's degree] Poland: zł156000 (PLN)", "[Master's degree] …"). The code in parentheses is the currency, so a Canadian line is CAD (norm-7, DQ-15, D-22) |
| **Fixed-term pay** (norm-8) | The programme's length is `salary.termWeeks` (information only). How the pay was stated decides what it is: a yearly rate on an internship (Google "Ireland: €72000 (EUR)" with "a minimum 13 week full-time internship", Microsoft "CAD $43,800 - CAD $50,000 per year" for a 6-month one; 27 postings on 2026-10-11) gets `originalInterval: "year"`; week, month or whole-term pay keeps its own interval |
| **Part-time hourly pay** (norm-8) | Apple's part-time retail roles ("$22.00 and $28.88/hr", 52 postings) get `salary.partTime: true`; the yearly figure is the 2,080-hour equivalent, and Juice needs the posting's stated weekly hours ("work 16 hours per week", 1 posting) |
| **The pay line's country** (norm-8) | The country a Google line or a Microsoft national range names is `salary.country`; Juice is never worked out for another country's office from it |
| **"$" in Canada** | A bare "$" in a posting whose locations are all in Canada is CAD, unless the amount's own sentence, its heading or a "US:" line says USD (norm-7: Google's Canada-only roles, Netflix Toronto and Vancouver) |
| **Netflix** | "The range for this role is $210,000.00 - $360,000.00" is a **real posted range**. It is role-specific, and Netflix says pay "consists solely of an annual salary; we do not have bonuses" (options are carved out of that salary at the employee's choice). The sales-only "The overall market range for roles in this area of Netflix is typically $X - $Y. A portion of this compensation is variable." is **not** used: it is a band for an area, not this role, and it includes variable pay. Those postings get `salary: null`. Union-covered roles ("pay … governed by the … collective bargaining agreement and thus will be no less than $62.74 an hour") state a floor, not a range: `salary: null` (norm-7). The L7 range "$737,000.00 - $1,430,000.00" is above the gate's $1.2M bound: it is read and quarantined ("Pay unclear, see posting") |
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
- Norm-7 (beta fix wave, [fix-beta-pay log](process/fix-beta-pay.md)): `zł` (PLN), `kr` / `kr.` (SEK, NOK or DKK by country) and `lei` (RON) are read, and so is a code in parentheses ("(CAD)"). RON has no exchange rate on the site, so lei pay is not used yet.
- "+ 42.86% bonus target", "+ 100%", "+ 150%": any bonus-target percentage after a range keeps it base pay.
- "Le salaire de base … est de 99,000 CAD" ("salaire" is a pay word); "the annual range for our interns is …" (NVIDIA Poland).
- A single figure inside another range is not a second zone ("… and most new hires start at $23.00", Apple).

### 7b. Google (`server/sources/google.js`)

| Fact | Value |
|---|---|
| robots.txt (www.google.com) | **Disallows every paged results URL**: `/about/careers/applications/jobs/results?page=`, `…/results/?page=`, `…/results?*&page=`, `…/results/?*&page=`. Single postings (`…/jobs/results/<id>-<slug>`) and the RPC path are not disallowed. So the board is **not** read by paging search results (neither the HTML pages nor the `r06xKb` search RPC behind them) |
| List | `GET https://www.google.com/about/careers/applications/jobs/sitemap.xml`: the jobs sitemap (~620 KB, one `<loc>https://careers.google.com/jobs/results/<id>-<slug>/</loc>` per posting with `lastmod`). careers.google.com 301s to www.google.com |
| Detail | `POST https://www.google.com/about/careers/applications/_/HiringCportalFrontendUi/data/batchexecute`, form body `f.req=[[["sf9Qmf","[\"<id>\"]",null,"generic"]]]`, `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`. No cookie or token. The response is XSSI-guarded (`)]}'`): the `wrb.fr` row's JSON string holds `[record]`. About 5 KB per posting, against ~1.3 MB for the HTML job page |
| Record (positional) | 0 id, 1 title, 3 responsibilities `[_, html]`, 4 qualifications `[_, html]`, 7 brand (Google, DeepMind, YouTube, Verily…), 9 locations `[[display, addresses, city, zip, state, country]…]`, 10 about the job `[_, html]` (holds the pay line), 12 created `[s, ns]`, 13 updated, 16 remote flag |
| Mapping | sourceId = id; title = slot 1 with HTML entities decoded ("Databases &amp;amp; Analytics" was shown as written); department = team = brand (slot 7). **The record has no department, team or job-category field**, and the sitemap has only id, slug and lastmod, so the brand (Google 3,174, YouTube 144, DeepMind 95, Waymo, Wing, GFiber, Verily: 1 each) is the only grouping. Slot 11 is a list of small integers ([2] on both Technical Program Manager fixtures, null on a general application), probably a category code; it is not mapped until a probe run maps the codes; locations = slot 9 display names; url = `https://www.google.com/about/careers/applications/jobs/results/<id>-<slug>`; postedAt = slot 12; updatedAt = slot 13; html = about + responsibilities + qualifications |
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
| Departments (norm-8) | NVIDIA's `department` is a job-family code ("Mgmt, Sys SW", "Engineer, SW QA Test Dev", "Program Mgr, Technical"; 86 of 146 names, 1,287 postings) and five Microsoft disciplines are abbreviated ("Customer Success Account Mgmt", "Critical Environment Ops"). `departmentName` writes them in plain words from a tested word list (Mgmt Management, Mgr Manager, SW Software, Sys Systems, Eng Engineering, Ops Operations, Dev Development, Prod Production, QA Quality Assurance, …; "Dev Tech" Developer Technology and "Prod" Production from the titles filed under them) and drops a bracket that repeats the name ("Mgmt, Sales (Sales)"). ASIC, CAD, IT, HR and UX stay. Applied to fresh rows and, through `upgradeEightfoldJobs`, to stored ones |
| Mapping | sourceId = id; reqId = displayJobId; locations = standardizedLocations; remote = workLocationOption ~ remote, or a "Remote" location. NVIDIA's own work-mode tag in the description wins over `remote_local`: a posting tagged `#LI-Hybrid` or `#LI-Onsite` (also misspelt "#LI-Hybid") is not remote unless a location says "Remote" (52 of the 60 tagged remote postings in run 38044091555; the other 8 list "Remote, OR, US"); url = publicUrl (`https://<host>/careers/job/<id>`); postedAt = creationTs; updatedAt = postedTs |
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
| Partitioning | Country by country; a country at the cap (the US) is split by business category. Each partition stops on its own `hits`. Postings are deduped on `id_icims`. Facet total: **22,415 postings** (run 6); the whole-board probe (run 7) listed all 22,415 in 301 list pages, about 5 minutes at 1 request/s |
| Completeness | A crawl that lists under 95% of the facet total, or a capped board with no country facets, is refused (`code: 'incomplete'`): a partial board would make the history ledger close every posting it missed, so the previous snapshot stays. A capped country's coverage through its categories is noted ("USA: n of m postings listed through k business categories"), as is a category still at the cap |
| Size on /beta/ | `maxPostings: 5000` in `server/companies.js`: the snapshot keeps 5,000 of the board's postings (with a published pay range first, then the newest; `jobsCapped: { kept, total, by: 'postings', rule }`), and the page says "of 22,415 posted". The whole board would be the slowest on a phone (synthetic 22,415: first card 10.5 s on Fast 4G at 4x CPU against Apple's 4.6 s; 5,000: 4.9 s) and 86 MB at 800-character descriptions, over the 40 MB file budget. Postings the cap leaves out stay open in the history ledger for 14 days (`recordPublished`); the archive treats a capped run as partial. Measurements: [process/amazon-meta-backend.md](process/amazon-meta-backend.md) |
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
| Lists | Apple writes "Responsibilities", "Minimum Qualifications" and "Preferred Qualifications" as line-broken paragraphs (`<p>line<br>line</p>`) with lines wrapped mid-sentence. `server/keywords.js` reads each line under such a heading as an item and joins a wrapped line to the item before it (norm-8), so 2,633 postings have separate required and preferred lists |
| Mapping | url = `https://jobs.apple.com/en-us/details/<id without PIPE->/<transformedPostingTitle>`, each part encoded once (19 slugs arrive already percent-encoded); department = team; employmentType from `standardWeeklyHours`: ≥ 35 h = Full-time; under 35 h = Part-time only when the posting backs it (its words "part-time" or "28 hrs pw", retail and managed-pipeline roles, students, interns, seasonal roles, hourly pay), else not stated (`null`): about 40 salaried corporate roles carry a low figure; postedAt = `postingDateMeta`, except managed-pipeline (retail) rows, which are re-stamped on every request and get `null` |
| Requisitions | Row ids are `<requisition>-<location id>` (a bare `<requisition>` also occurs). Apple lists a requisition once per location, every listing names all of its places, and each listing's detail carries the "Pay & Benefits" footer of its own place (`postingFooters[].postLocationId`; a detail can carry several). `fetchApple` groups listings by requisition (`groupAppleCopies`) and returns one posting each (`mapAppleRequisition`): the lowest listing id gives id, link and text; every place is a location; when the footers' ranges differ, the salary is structured over the span with each range and its places in `salary.ranges`, and the description has one "Pay & Benefits (places)" section per range. Run 38044091555: 6,105 listings, 4,882 requisitions; 393 requisitions priced a city two ways, 0 after |
| Places | `selectedLocation` (the listing's own place) first, then the row's and the detail's locations. Store names given as places ("Bellevue Square, United States of America", 118 entries) are dropped when the posting names a city or state in that country; a city written the same way ("Seattle, United States of America") is kept. A store name given as the only place in its country is its city (norm-8, `server/geo.js` aliases): "Piazza Liberty" Milan, "Via del Corso" Rome, "Shinsaibashi" and "Umeda" Osaka, "Rosny 2" Paris, "Campania, Italy" Naples, "Polo Park" Winnipeg, "Coquitlam Centre" and "Guildford Town Centre" Vancouver, "Place Ste-Foy" Québec City, "Dubai Mall" Dubai, "Morumbi" São Paulo, "Jungfernstieg" Hamburg, "Eldon Square" Newcastle upon Tyne, "Akasya" Istanbul, "Emporia, Sweden" Malmö "Seoul, Korea, Republic of" is one place, and "City-CC" names ("Klang Valley-MY") lose the code (`server/geo.js`) |
| Pay | Footer: "The base pay range for this role is between $150,400 and $277,600, and your base pay will depend on your skills, qualifications, experience, and location." Hourly: "between $34.31 and $73.20/hr". Some US footers give no range (seasonal retail): null |

### 7g. Meta (`server/sources/meta.js`)

| Fact | Value |
|---|---|
| robots.txt | Opens with a notice: "Collection of data on Facebook through automated means is prohibited unless you have express written permission from Facebook and may only be conducted for the limited purpose contained in said permission" (its link redirects to the Automated Data Collection Terms; re-read 2026-10-11). `User-agent: *` disallows `/*cursor=`, `/*fb_comment_id=`, `/ajax/`, `/tealium/`, `/intern/`, `/internal/`, `/login/`, `/oidc/callback/`, `/*.php`, `/signup/`, `/resume/`; job pages are allowed. Lists `Sitemap: https://www.metacareers.com/jobsearch/sitemap.xml` |
| List | `GET https://www.metacareers.com/jobsearch/sitemap.xml` (~150 KB): `<loc>https://www.metacareers.com/profile/job_details/<id>/</loc>` per open posting (1,143 in run 6). `/jobs` 301s to `/jobsearch/` |
| Detail | The public job page (~480 KB HTML) carries a schema.org `JobPosting` (`title`, `description`, `datePosted`, `jobLocation[]`, `employmentType`) and the page's own data after `"apply_for_this_job_section"`: `title`, `locations[]`, `departments[]`, `internal_departments[]`, `description` (`{"__html": …}`), `responsibilities[]`, `minimum_qualifications[]`, `preferred_qualifications[]`, `public_compensation[]`. The GraphQL search (`/graphql` with an `LSD` token and a rotating persisted `doc_id`) is **not** used |
| Mapping | title = JSON-LD title; department = internal_departments[0]; team = departments[0]; locations = page locations ("Sunnyvale, CA", "Remote, US"); url = the sitemap URL; postedAt = datePosted. A page without the page-data anchor (neither `"apply_for_this_job_section"` nor `"requisition_id":"<id>"`) is read from its JSON-LD only (title, description, jobLocation names, datePosted), plus `public_compensation`; other keys are not read from the rest of the page, which has its own "title" and "locations" |
| Pay | Structured: `public_compensation: [{compensation_amount_minimum: "$173,000/year", compensation_amount_maximum: "$245,000/year", country_code: "US", has_bonus, has_equity}]`, also "$7,313/month" for interns. The range for the first location's country (JSON-LD `addressCountry`, as a code, a name or a Country object) is used, else the US one. Text reads "$173,000/year to $245,000/year + bonus + equity (US)" |
| Requests | robots.txt, the sitemap, then 1 page per posting at 1 request/s: about 20 minutes for 1,143 (run 7: 1,000 pages in 1,120 s), about 550 MB at ~480 KB a page. The crawl stops after 10 failed pages in a row (a 403 wall is not asked 1,000 more times) and fails when more than 5% of the pages failed; the previous snapshot stays. A 404/410 page is a posting closed since the sitemap was built |

### 7h. Tesla: blocked, left out

Every plain request to `www.tesla.com` returned HTTP 403 "Access Denied" from
Akamai (`server: AkamaiGHost`): `/robots.txt`, `/cua-api/apps/careers/state`
(the careers search API) and `/careers/search/` (runs 1 and 2). Getting past
that would mean impersonating a browser or evading bot protection, which this
project does not do. Tesla is therefore not in `server/companies.js`, has no
adapter, and is not on the beta site. `scripts/probe-bigtech.js --mode recon
--companies tesla` re-checks it.

## 8. How each board updates (incremental crawl)

The mechanism, the crawl state and the closure rules are in
[ARCHITECTURE.md](ARCHITECTURE.md) "Incremental crawl and closures"; measurements and decisions in
[process/incremental-crawl.md](process/incremental-crawl.md). Every run lists the whole board;
only detail requests are skipped. The request rate is unchanged (1 request/s per host).

| Board | List (every run) | Change signal (list row) | Detail when | Complete list when | Closure probe |
| --- | --- | --- | --- | --- | --- |
| Apple | search pages (20 rows) | `postingTitle`, `transformedPostingTitle`, `positionId`, `postingDate` (not for managed-pipeline rows, re-stamped on every request), `locations`, `team`, `homeOffice`, `standardWeeklyHours`, `jobSummary` | US listings only: new, signal moved, or past the refresh age | listed >= `totalRecords` | `GET /api/v1/jobDetails/<id>` |
| Microsoft, NVIDIA | PCSX search (10 rows) | `name`, `postedTs` (moves on edits and reposts), `creationTs`, `locations`, `standardizedLocations`, `department`, `workLocationOption`, `displayJobId` | new, signal moved, past the refresh age | listed >= `count` and no repeated page | `GET /api/pcsx/position_details` |
| Netflix | classic search (10 rows) | `name`, `posting_name`, `t_update`, `t_create`, `location(s)`, `department`, `business_unit`, `display_job_id` | as above | listed >= `count` | `GET /api/apply/v2/jobs/<id>` |
| Google | jobs sitemap (conditional GET) | the sitemap entry's slug (the title) and `<lastmod>` | as above | always (the sitemap is the board); a record that comes back empty is `gone` | not needed |
| Meta | jobs sitemap (conditional GET) | `<lastmod>` where the sitemap has one; otherwise none, so only new postings and pages past the refresh age are read (the URL set is the list). §7g did not record whether Meta's sitemap has `<lastmod>`: the crawl summary's `changed` count shows it | as above; the cached detail is the extracted page, not the ~480 KB HTML | always; a 404/410 page is `gone` | not needed |
| Amazon | search pages by country and category | list-only: the row is the whole posting | never (no detail requests) | listed >= the facet total (95% is still published, as before, but is partial) | `HEAD /en/jobs/<id>` (robots.txt checked) |
| Greenhouse, Ashby, Lever | one request | list-only | never | always (one response is the board) | not needed |

**Conditional requests.** No recorded response in this repository shows the headers (§7's
fixtures keep bodies only), so support is not known for any host. The adapters therefore send
`If-None-Match` / `If-Modified-Since` only when the previous response carried an `ETag` /
`Last-Modified`, and a 304 reuses the cached detail or sitemap; a host that ignores them answers
200 as before. The stable adapters report whether their single response carries validators
(`crawl.validators` in the snapshot), so the next daily run shows it.

**Stable boards (Greenhouse, Ashby, Lever): no updated-since filter exists.** Greenhouse's list
documents only `content` (§1), Lever's only `mode, skip, limit, location, commitment, team,
department, level, group` (§4), Ashby's only `includeCompensation` (§3b). Each board is one
request a day, so a 304 could save bandwidth (Anduril's list is ~38 MB) but not requests or
time; it is not used, because a 304 would have to be answered from a stored raw response the
stable job does not keep, and normalization depends on the whole board. Greenhouse's
`updated_at` moved on 43 of the 45 Anduril edits the archive recorded on 2026-10-10, so the
list already shows its changes.

**Expected crawl time per run** (6-hourly beta crawl; "before" = run 38118242488, 2026-10-11;
"after" = the steady state from the archive's churn, with a 4-day refresh age, i.e. about 1/12
of each board's details per run, plus the new and visibly changed postings; at about 1.0-1.1 s
per request):

| Board | Before: requests, time | After: requests per run | After: time | Saving |
| --- | --- | --- | --- | --- |
| Apple | 4,704 (305 search pages, 4,396 details), 89 min | ~305 + ~366 refresh + ~20 new/changed + ≤ 50 probes ≈ 700 | ~13 min | ~85% |
| NVIDIA | 2,931 (267 + 2,663), 49 min | ~267 + ~222 + ~10 ≈ 500 | ~9 min | ~83% |
| Microsoft | 2,510 (229 + 2,279), 42 min | ~229 + ~190 + ~10 + ≤ 6 probes ≈ 435 | ~8 min | ~83% |
| Google | 3,421 (1 + 3,417), 57 min | ~1 + ~285 + ~5 ≈ 290 | ~5 min | ~92% |
| Netflix | 504 (46 + 457), 8.4 min | ~46 + ~38 + ~2 ≈ 86 | ~1.5 min | ~83% |
| Meta | 1,145 (1 + 1,143 pages, ~550 MB), ~20 min | ~1 + ~95 + ~10 ≈ 106 (~50 MB) | ~2 min | ~90% |
| Amazon | ~301 list pages, ~5 min | the same (list-only) + ≤ 50 probes when the list is short | ~5 min | 0 |
| Greenhouse, Ashby, Lever | 1 each | 1 each | seconds | 0 |

The first run after a deploy, after an adapter-version bump, or with `full_crawl` is a full crawl.
