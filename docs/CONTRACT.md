# melon-seek — shared contract

"Zillow for job postings": pull a company's job board, plot every posting on a
salary-range chart (default) or a map, filter by salary / features / location.

Runtime: Node >= 18, ES modules, **no dependencies other than `leaflet`**
(served from `node_modules/leaflet/dist` at `/vendor/leaflet/`). Zero build step.
Frontend is plain ES modules loaded by the browser.

## Layout

```
server/index.js            HTTP server (static + API)                [backend]
server/companies.js        company registry                          [backend]
server/sources/greenhouse.js, ashby.js, lever.js   board adapters    [backend]
server/salary.js           salary text parsing                       [backend]
server/normalize.js        raw job -> Job (calls geo/keywords/salary)[backend]
server/cache.js            memory + disk cache (data/cache/)         [backend]
scripts/snapshot.js        `npm run snapshot` -> data/snapshots/*.json [backend]
server/keywords.js         sections + keyword facets + seniority     [features]
server/geo.js              location string -> coordinates            [features]
server/demo.js             offline demo jobs per company             [features]
public/index.html, styles.css, app.js   shell, filters, list, drawer [ux]
public/viz/palette.js, chart.js, map.js chart + map rendering        [viz]
test/*.test.js             node --test                               [each owner]
```

## Raw job (adapter output, also demo.js output)

```js
{
  sourceId: "4012345",            // string
  title: "Research Engineer, Interpretability",
  department: "AI Research & Engineering" | null,
  team: "Interpretability" | null,
  employmentType: "Full-time" | null,
  locationText: "San Francisco, CA | New York City, NY", // raw, possibly multi
  extraLocations: ["London, UK"],  // additional raw location strings (may be [])
  remote: false | true | null,     // explicit flag from source if any
  html: "<p>...</p>",              // decoded description HTML (not entity-escaped)
  text: "plain text ...",          // plain text of description
  url: "https://...",
  updatedAt: "2026-09-30T12:00:00Z" | null,
  salary: { min, max, currency, interval, text } | null // structured if source provides it
}
```

## Job (normalized, what the API returns)

```js
{
  id: "anthropic:4012345",
  company: "anthropic", companyName: "Anthropic",
  title, department, team, employmentType,
  seniority: "Intern"|"Entry"|"Mid"|"Senior"|"Staff+"|"Manager"|"Director+",
  locations: [ { name: "San Francisco, CA", city: "San Francisco", region: "CA",
                 country: "US", lat: 37.77, lng: -122.42, remote: false } ],
                 // remote-only entries: { name:"Remote (US)", remote:true, lat/lng of
                 //  country centroid or null, country:"US" }
  remote: boolean,
  salary: { min: 300000, max: 405000, mid: 352500, currency: "USD",
            interval: "year", text: "$300,000—$405,000 USD" } | null,
            // min/max ANNUALIZED (hourly*2080, monthly*12). If only one number, min=max.
  url, updatedAt,
  descriptionHtml,                    // keep as given (frontend renders in a sandboxed way)
  sections: { responsibilities: [string], fit: [string] }, // bullet texts
  keywords: { responsibilities: [string], fit: [string], skills: [string] }
            // short display labels, deduped, e.g. skills ["Python","PyTorch","Kubernetes"],
            // responsibilities ["Model training","Infrastructure","Cross-functional"],
            // fit ["PhD","5+ yrs","Startup experience"]
}
```

## Module interfaces

- `server/salary.js`: `parseSalary(text) -> salary|null` (finds ranges like
  `$320,000—$405,000 USD`, `$310K – $385K`, `£95k-£120k`, `€80.000 - €100.000`,
  `$60/hr`), `annualize(value, interval)`.
- `server/geo.js`: `splitLocations(str) -> string[]`; `geocode(str) -> Location[]`
  (built-in gazetteer of ~200 tech-hub cities + US states + countries; unknown -> lat/lng null).
- `server/keywords.js`: `extractSections(html) -> {responsibilities, fit}`;
  `extractKeywords({title, department, sections, text}) -> {responsibilities, fit, skills}`;
  `inferSeniority(title) -> string`.
- `server/demo.js`: `demoJobs(companySlug, companyName) -> RawJob[]` deterministic
  (seeded), realistic-looking, ~60–150 per company, with description HTML containing
  responsibilities/fit sections and salary text so the whole pipeline is exercised.
  Must be obviously marked demo in the API (`mode: "demo"`), never presented as real.
- `server/normalize.js`: `normalizeJob(raw, company) -> Job`.
- adapters: `fetchGreenhouse(board)`, `fetchAshby(board)`, `fetchLever(board)` ->
  `Promise<RawJob[]>` using global `fetch`.

## HTTP API

- `GET /api/companies` -> `[{ slug, name, source, board, color }]`
  Built-ins: anthropic (greenhouse/anthropic), anduril (greenhouse/andurilindustries),
  openai (ashby/openai). (openai.com/careers/search is backed by Ashby.)
- `GET /api/jobs?company=anthropic[&refresh=1]`
- `GET /api/jobs?source=greenhouse|ashby|lever&board=<slug>[&name=Display]` (custom board)
  -> `{ company:{slug,name,source,board,color}, mode:"live"|"cache"|"snapshot"|"demo",
        fetchedAt, error: string|null, jobs: Job[] }`
  Order of attempts: fresh cache (<30 min) -> live fetch -> stale disk cache ->
  data/snapshots/<slug>.json -> demo (built-in companies and custom boards alike).
- Static: `/` -> public/, `/vendor/leaflet/*` -> node_modules/leaflet/dist/*.
- `PORT` env (default 5173).

## Frontend interfaces

- `public/viz/palette.js`: `colorFor(key: string) -> css color` (stable categorical
  palette, deterministic by key, works in light & dark), `formatMoney(n) -> "$352K"`.
- `public/viz/chart.js`:
  `createChart(container, { onSelect(job), onHover(job|null) }) ->
    { update(jobs, { groupBy: "none"|"department"|"location"|"seniority", colorBy: same }),
      highlight(jobId|null), destroy() }`
  Zillow-esque salary range chart: each job a horizontal min–max bar on a salary
  x-axis, sorted by midpoint, grouped into bands, hover tooltip, click selects.
  Jobs with no salary are not plotted (show count note).
- `public/viz/map.js` (uses global `L` from /vendor/leaflet/leaflet.js):
  `createMap(container, { onSelect(job), onAreaSelect(jobs, label) }) ->
    { update(jobs), highlight(jobId|null), invalidateSize(), destroy() }`
  Zillow-style price-tag pins per location ("$352K · 12"), clustering by city;
  remote jobs in a separate "Remote" badge control. Must not crash if tiles fail
  to load (offline) — show a light fallback background.
- `public/app.js` owns state (company, mode chart|map, filters) mirrored in
  `location.hash`, fetching, filter panel, results list, job detail drawer,
  company switcher (+ "Add board" for custom greenhouse/ashby/lever slugs).

---

## v2 additions (2026-10-02): 1-up features (docs/strategy/ROADMAP.md §7)

All existing fields keep their meaning. New fields are optional for readers;
writers must emit them once their owner lands the change.

**RawJob** adds:
- `postedAt: ISO|null`: Greenhouse `first_published`, Ashby `publishedAt`,
  Lever `createdAt`. (F4)
- `reqId: string|null`: Greenhouse `internal_job_id`, `null` elsewhere. (F4)
- `salary.zones?: number`: the count of structured pay tiers the adapter saw. (F2)

**Job** adds:
```js
postedAt: ISO|null, firstSeenAt: ISO|null,            // F4
ageDays: number|null, ageIsMinimum: boolean,          // F4
freshness: "new"|"active"|"stale"|"evergreen"|null,   // F4 (≤7, 8–59, 60–179, ≥180 days)
repost: { count, firstSeenAt } | null,                // F4
salary: { ...existing, spread, zones, kind, source } | null, // F2 (+ vetting)
salaryRaw?, salaryFlag?: { codes, reason },           // vetting quarantine (salary is then null)
extras: { equity: boolean, bonus: boolean },          // F2
juice: { best, byLocation, household } | null,        // livability, attached in public/api.js; household = 'single'|'couple'|'family' (default single; app.js re-attaches for the chosen household). best.taxBasis = 'single'|'joint'|'individual'|'partial' (server/juice.js taxFor)
```

**Static-mode `getJobs(…, { onUpdate })`** (public/api.js): the result carries `pending: true` when a bundled list is returned while the live board is still loading (only when `onUpdate` is passed). `onUpdate` is then called exactly once, never after an abort: with the live result, or with the same list, `pending: false` and the failure reason in `error` (`null` for quiet sources). `live: false` companies are never pending. The data badge reads "Snapshot · checking live…" while pending (docs/process/badge-ux.md).

**Nothing to show: `unavailable: true`** (2026-10-10, DQ-7 and D-20, fix-beta-platform lane). A real company's name never carries demo postings. When a built-in has nothing to show, `getJobs` resolves to `{ company, mode: "snapshot", fetchedAt: null, error: "<one plain sentence>", jobs: [], meta, unavailable: true }`:
- static mode: its bundled list `api/jobs/<slug>.json` fails to load (404, 5xx, a dropped connection, truncated JSON) and there is no live or earlier result this session. `error` reads "The saved list of Apple roles didn't load. Check your connection and try again." (or "Scale AI's live board couldn't be reached and the saved list of its roles didn't load. …" after a failed live fetch). Nothing is cached, so the next call tries again;
- server mode: a beta-channel or `live: false` company with no cache and no snapshot (`/api/jobs` answers 200, so the slug works on either channel). `error` reads "Netflix's roles are not available yet: there is no saved copy of its careers site. They appear after the next crawl." (a `paused` board: "… are paused: its careers site's terms don't allow automated collection."). `/api/export` answers 503 with that error, and the market comps leave the company out.

The app shows it as an error with Retry (the "Couldn't load this board" card), never as an empty board. Every other result keeps exactly its old keys. The build no longer bundles `api/demo/<slug>.json` or a description file per demo posting next to a real snapshot (773 files per site on 2026-10-10). Demo data stays only where it is labelled and nothing real exists: a stable company built without a snapshot (fresh clones, tests: its `api/jobs/<slug>.json` is `mode: "demo"`), stable companies in server mode without a snapshot, and custom boards ("Add board") whose live fetch fails.

**`/api/jobs` response** adds `meta: { compstimate: { medianAbsPctError,
within10Pct, n, seed, computedAt } | null, history: { since, runs } }`.

**New endpoints and static files:**

| Feature | Server | Static (Pages) |
|---|---|---|
| Cities (Juice) | `GET /api/cities` | `api/cities.json` |
| Market comps (F1) | `GET /api/market` | `api/market.json` (≤150 KB, vetted salaries only, n ≥ 3 per cell, USD, `basis: "posted base pay ranges"`; one pay country per cell since fix wave 3, below) |
| History (F4) | merged on the server | `api/history/<slug>.json`: `id → [firstSeenAt, postedAt, repostCount]` |
| CSV (F7) | `GET /api/export?company=` | `data/<slug>.csv` plus `data/README.txt` |
| Browser lib | `GET /lib/<allowlisted>.js` | `lib/*.js` (allowlist in `server/lib-modules.js`) |

**Packed list format:** `melon-packed-1` becomes `melon-packed-2` with the
fields above, and the build's round-trip check covers them. Since 2026-10-11 the build writes
`melon-packed-3` (row arrays, range tuples, url templates; `public/api.js#unpackJobs` header), which
unpacks to exactly the `melon-packed-2` result, key order included (checked at build time and in
`test/perf-mobile-beta-2.test.js`). Readers of list files use `unpackJobs`.

**Shared FX:** `public/viz/palette.js` `FX_PER_USD` is the single source.
Copies in `server/juice.js` and `server/salary.js` are guarded by
`test/fx-consistency.test.js`.

**UI simplicity budget:** ROADMAP §8 is binding. At most one new main-view
control across all of these features: the conditional "Save" button. Modes
stay Chart, Map and Insights. New drawer sections go in the fixed order.

**Location (2026-10-02, UX-3):** `name` is now a canonical display name (`Remote (US)`, `City, ST`, `City, Country`); the source string is kept in `rawName`. Use `rawName` for identity (e.g. history fingerprints) and `name` for display.

## v3 additions (2026-10-10): big-tech boards on a beta channel

User request: pull job posts from Google, Microsoft, Meta, Apple, Netflix, Amazon, Nvidia and Tesla.
They appear only at `https://alvations.github.io/melon-seek/beta/`. The main site
(`/melon-seek/`) stays exactly as it is.

**Company registry (`server/companies.js`, data engineer).**
- Each new entry carries `channel: 'beta'`. Existing entries have no `channel`, which means stable.
- Big-tech entries also carry `live: false`. These career sites send no CORS headers, so the browser
  never fetches them live. Static mode serves the bundled snapshot.
- `listCompanies({ channel = 'stable' } = {})`:
  - `'stable'` returns only the stable companies. Every existing caller keeps today's list.
  - `'beta'` returns the stable companies plus the beta ones.
  - `'all'` is the same as `'beta'`, for `scripts/snapshot.js`.
- `getCompany(slug)` resolves any built-in on any channel, and the result includes `channel`.
- **No posting is ever dropped (2026-10-11).** No entry has a posting budget (Amazon's `maxPostings: 5000`
  was removed; the user: "Why are you capping the no of posting we must present them as they are and not
  cut anything"). `scripts/snapshot.js#fitSnapshot` may trim descriptions toward the 40 MB target and the
  static build may move descriptions and sections into the lazy per-posting files, but every posting stays
  in the snapshot and in the list. A snapshot's `jobsCapped` record exists only in snapshots from before
  that day; readers keep treating such a run as partial.
- `SOURCES`, the list of sources a user may add as a custom board, stays `greenhouse | ashby | lever`.
  A new source is built-in only.

**Adapters (`server/sources/<source>.js`, data engineer).**
- Same shape as the existing adapters. Each exports `fetchX(company, { signal, maxBytes })`, which
  returns `{ jobs: RawJob[] }`, plus a pure `mapXJob(raw)`.
- Each is registered in `server/pipeline.js` `ADAPTERS`.
- RawJob is exactly the shape in "Raw job" above. The pay range comes from structured fields when the
  source has them, otherwise from `server/salary.js` parsing the posting text.
- Every result goes through the existing vet gate (`server/vet.js`, `scripts/vet-salaries.js`). Pay
  that is not plausible is never published.

**Static build (`scripts/build-static.js`, deploy engineer).**
- `npm run build` writes the stable site to `dist/` as today, with no beta company anywhere in it:
  companies list, jobs, market comps, share pages, history and descriptions.
- It also writes a full second copy of the app to `dist/beta/`, built from `listCompanies({ channel: 'beta' })`.
  Its market comps include the beta companies.
- `dist/beta/index.html` carries `<meta name="melon-channel" content="beta">`. The page shows a small
  "Beta" tag by the logo and nothing else new.
- The stable site does not link to the beta site.
- A failed fetch, or a vet-gate failure, for a beta company drops that company from `dist/beta/` and is
  reported in the step summary. It never blocks or changes the stable deploy.

**Client (`public/api.js`, deploy engineer).**
- A company with `live: false` is served from its bundle with `error: null`. The badge reads
  "Snapshot · <date>" and shows no "Live fetch skipped" message.

**Server mode (`server/index.js`, deploy engineer).**
- `/api/companies` lists stable companies only, unless the env var `MELON_CHANNEL=beta` is set.
- `/api/jobs?company=<beta slug>` works either way.
- (D-20, 2026-10-10) A beta company's snapshot is read from `MELON_BETA_SNAPSHOT_DIR` (default
  `data/beta/snapshots/`), then `MELON_SNAPSHOT_DIR`, and its ledger from `MELON_BETA_HISTORY_DIR`
  (default `data/beta/history/`), then `MELON_HISTORY_DIR`, as the static build does. A `live: false`
  company is never fetched live from a request and its snapshot is served with `error: null`. With no
  snapshot it is `unavailable: true` (see "Nothing to show" in v2), never demo data.

## v4 additions (2026-10-10): pay data fixes (fix-pay-data lane, persona review P-1, P-3, P-8, P-9, P-17)

All existing fields keep their meaning; every addition is optional for readers.
`NORMALIZER_VERSION` is `norm-6`: stored `norm-5` snapshots are upgraded once by
`relocateJobs(rekeyBoardJobs(jobs).jobs)` in the server, the static build, the archive ingest
and the refresh report, and `relocateJobs` now also re-derives the pay labels and the level
(`server/normalize.js#relabelJobs`). Log: [docs/process/fix-pay-data.md](process/fix-pay-data.md).

**Job `salary`:**

| Field | Meaning |
|---|---|
| `kind` | `'salary'` \| `'hourly'` \| `'stipend'` \| **`'ote'`**. `'ote'` = the posting says the range is on-target earnings (base pay plus commission at target), in its own words: in the clause that holds the range ("OTE: $X–$Y", "$X–$Y OTE", "On target compensation: …", "Base + commission at target: …"), in the pay range's own label (a Greenhouse range titled "OTE"), or in a sentence about the range ("The figure above represents On-Target Earnings (OTE)"). A conditional sentence ("For sales roles, the range provided is the role's On Target Earnings ("OTE") range") counts only for a sales title (`keywords.js#isSalesTitle`: Account Executive, Account Director/Manager, Sales …, BDR/SDR, Partner Sales; not enablement, strategy, operations, Customer Success). A stipend is never OTE. An hourly sales range can be OTE; `originalInterval` still says `'hour'`. Surfaces show it as "On-target earnings (base plus commission at target)", compare it only with other OTE ranges, and leave it out of base-pay medians |
| `termWeeks` | Integer, 1–104. The programme length the posting states, for an internship, co-op, fellowship, residency or apprenticeship (title or employment type): "12-week internship" → 12, "The program runs for 4 months" → 17 (months × 52 ÷ 12, rounded), "16 to 24-week internship" → 16. Only phrases tied to the programme or to the pay sentence count, never "within two weeks of your offer" or "6 weeks of paid vacation". Absent for every other role |
| `termWeeksMax` | Integer, only when the posting states a range ("16 to 24-week internship" → 24) |
| `originalInterval: 'term'` | New value. The posted amount covers the whole programme ("$100,000–$167,000 USD for the four-month fellowship"); `min`/`max` are annualized over the term (× 52 ÷ the term's exact weeks, here × 3), `termWeeks` is set, and `text` keeps the posting's words including "for the four-month fellowship". The term amount is `min × termWeeks ÷ 52` (approximately) |

`parseSalary(text, { countries })` returns `kind: 'ote'` for the in-clause case and, for term
pay, `interval: 'term'` with `termWeeks` and `termFactor` (the annualization factor;
`toJobSalary` uses it and does not copy it). New helpers in `server/salary.js` (all pure):
`hasOte(s)`, `oteStatement(text, { salesRole })`, `programTerm(text) -> { weeks, weeksMax? } | null`,
`isFixedTermRole({ title, employmentType })`, `payTerms(salary, { text, title, employmentType, salesRole })`
(used by `deriveSalary` and by `relabelJobs`), and `SALES_CONDITIONAL_RE` (moved here from
keywords.js; `salary.js` has no imports, because it is in the static site's startup module graph).

**Vetting (`server/vet.js`):** `payKind` can return `'ote'`; OTE counts as full-time salaried
pay for the low-side outlier test. `junior_high` does not apply to term pay (`originalInterval:
'term'`): its yearly equivalent is the posting's own statement.

**Seniority (`server/keywords.js#seniorityOf`):** "Account Director", "Partner Director"
(not "Business Partner Director"), "Client Director" and "Test Director" never make a title
Director+; with no other level word the title is `'Mid'` by default (shown as "Level not
stated"). A "Fellow" is a fixed-term fellowship (`'Intern'`, like "Fellows Program") unless it is
a Distinguished, Technical, Senior, Principal, Corporate or Chief Fellow (`'Staff+'`). `'Mid'`
is still never produced by a title rule. *(Superseded in v5: a ladder rung that means mid-level
is `'Mid'` with `seniorityBasis: 'title'`.)*

**Locations (`server/geo.js`):**
- `geocodeMany(inputs) -> Location[]` (new): one job's location strings geocoded together. A bare
  name with readings in several countries ("Victoria": British Columbia or Australia;
  "Melbourne": Australia or Florida; "Alexandria": Virginia or Sydney) takes the reading in a
  country that the job's other locations name. `geocode(str)` is `geocodeMany([str])`, so the
  parts of one string are each other's context. `normalizeLocations` uses it.
- A final ISO country code that is also a US state ("Bengaluru, KA, IN", "Tel Aviv-Yafo, Tel
  Aviv District, IL", "Munich, BY, DE", "Jakarta, ID") is read as the country when the city is
  in that country, or when another token is a non-US subdivision; "Chicago, IL" and "Fort Wayne,
  IN, USA" stay in the US. A country match never overrides a stated state ("Springfield, IL" is
  not Springfield, VA).
- Eightfold forms (Microsoft, NVIDIA; DQ-1 in docs/process/data-check-beta.md): a final ISO code
  with no other reading is the country in a three-part string ("Stavanger, Rogaland, NO") or
  after an unknown city ("SP, BR"), never after a city the gazetteer knows elsewhere ("Adelaide,
  SA" stays in Australia). A bare ISO code is a country ("DE" Germany, "IN" India, "CA" Canada).
  A stated non-US country drops US-state readings before it ("Middenmeer, NH, NL"). A city known
  only abroad followed by its own region's ISO 3166-2 code that is also a US state ("Barcelona,
  CT", "Madrid, MD", "Zaragoza, AR") is that city; "Dublin, CA" and "Vienna, VA" stay in the US.
- Suburbs are filed under their metro area when the gazetteer knows them (aliases: Alexandria,
  Penrith, North Sydney, Parramatta -> Sydney; Courbevoie, La Défense -> Paris; Schiphol ->
  Amsterdam; Minato -> Tokyo; …). `rawName` keeps the posting's words; `name` is the metro's.
- `locationPrecision(loc) -> 'city' | 'centroid' | 'region' | 'country' | 'remote' | 'unknown'`
  (new, diagnostics): `'centroid'` is a named place the gazetteer does not know, placed at its
  region's or country's centre.

**Keywords (`server/keywords.js`):** skills keep lexicon order, except skills named only in
nice-to-have sentences ("… is appreciated", "is a plus") come last, so a card's first two tags
are the most telling. New exports: `isSalesTitle(title)`, `isTechnicalTitle(title)`.

## v5 additions (2026-10-10): big-tech pay and levels (fix-beta-pay lane, beta fix wave)

All existing fields keep their meaning; every addition is optional for readers.
`NORMALIZER_VERSION` is `norm-7`. Stored older snapshots are upgraded once by
`relocateJobs(rekeyBoardJobs(jobs).jobs)`, which now re-derives a text-sourced (or missing)
salary from the stored posting text with the current parser, keeps a structured salary's
numbers (labels only), re-derives the level, and runs the vetting gate again
(`server/normalize.js#relabelJobs`). Log: [docs/process/fix-beta-pay.md](process/fix-beta-pay.md).

**Job** adds (shared decision 1):

| Field | Meaning |
|---|---|
| `seniorityBasis` | `'title'` \| `'pay'` \| `'default'`, on every job. `'title'`: the title states the level, by a level word or a rung on the board's ladder ("Software Engineer III" at Google, "(L5)" or "Engineer 5" at Netflix, "Engineer II"). `'pay'`: the title states none, and the pay sentence names the board's level (Microsoft "Software Engineering IC6 - The typical base pay range …", NVIDIA "… for Level 4, and … for Level 5"). `'default'`: neither, and the level is the `'Mid'` default. A rung that means mid-level (Google "III", Netflix "L4", "Engineer II") is `'Mid'` with basis `'title'`, so `'Mid'` is no longer always a default; a default is always `'Mid'`. Surfaces show `'Mid'` with basis `'default'` (or missing) as "Level not stated" (`public/features/roles.js#displayLevel`, app lane) |

**Job `salary`** adds (shared decision 2):

| Field | Meaning |
|---|---|
| `levels` | `[{ label, min, max }]` when one posting prices several levels: NVIDIA `"Level 4"`, `"Level 5"`; Microsoft `"IC4"`, `"IC5"` (or `"M5"`, `"ATR-C"`). `min`/`max` are annual, in the salary's currency, annualized like the salary's own `min`/`max` (an hourly tier × 2080). At least 2 entries, in the posting's order; the salary's `min`/`max` stay the overall span. Absent otherwise |

`salary.text` for a Google line now keeps its code: `"$141000 - $205000 (USD)"`.

**Levels (`server/keywords.js`):**
- `inferSeniority(title, { company } = {})` and `seniorityBasis(title, { company } = {})` take an
  optional company slug, which picks that board's ladder for numbered rungs. Without it the
  generic ladder applies. Both keep their return values.
- New: `jobSeniority({ title, text, company }) -> { level, basis }` (what `normalizeJob` and
  `relabelJobs` store) and `seniorityFromPay(text, { company }) -> { level, label } | null`.
- Ladders (evidence in the log): generic I Entry, II Mid, III Mid, IV Senior, V+ Staff+; Google
  I and II Entry, III Mid, IV Senior, V+ Staff+; L-levels (Netflix, also generic in parentheses or
  after a role word) L3 Entry, L4 Mid, L5 Senior, L6+ Staff+, and Netflix's "Engineer N" is LN
  (a two-level title takes its upper level); Microsoft IC1/IC2 Entry, IC3 Mid, IC4 Senior, IC5+
  Staff+, M1–M5 Manager, M6+ Director+; NVIDIA Level 1 Entry, 2 Mid, 3–5 Senior, 6+ Staff+ (a
  two-level posting takes its lower level).
- A student role is `'Intern'` ("Hardware Engineering Student", "Student Researcher",
  "Stagiaire", "Étudiant-chercheur"); "New College Grad", "University Graduate" and "Early
  Careers" are `'Entry'`; "Associate … Counsel" is not entry level (no level stated).

**Pay parsing (`server/salary.js`):**
- `parseSalary(text, { countries, areas })`: `areas` is `payAreas(locations)`. New pure exports:
  `payAreas(locations) -> ('sf-bay' | 'nyc')[]` (the areas every US location of the job is in,
  else `[]`), `payAreaOf(location)`, `PAY_AREAS`, `payContextAt(text, start, end, { unit, single })
  -> { pay, reason, clause, heading, start, end }` and `findMoneyTokens(text, { countries })` (the
  parser's own tokens and pay-context test, used by the vetting scan).
- Currency symbols `zł` (PLN), `kr` and `kr.` (SEK, NOK or DKK by the job's country), `lei` (RON),
  and a code in parentheses after the amount ("$99000 (CAD)") are read. Pay in a currency with no
  rate in `FX_PER_USD` (RON today) is not used, and then another country's range is not used for
  that country's job either.
- A bare "$" in a posting whose locations are all in Canada is CAD, unless the amount's own
  sentence, its heading or a "US:" line says USD.
- One pay line per country ("US: …", "Ireland: …"): the line for the job's country (the US one
  when the job has a US location, else its first location's country); lines for different
  countries are never spanned together; lines for one country are (degree tiers).
- Microsoft's SF Bay Area / NYC range is used for a job whose US locations are all in those areas.
- Any bonus-target percentage after a range ("+ 42.86% bonus target") keeps it base pay.
- A single figure stated as a floor ("no less than $62.74 an hour") is not pay; Netflix's sales
  "range for roles in this area" is not pay (unchanged rule, now explicit).
- A posted range above the bound ($1.2M; $1.5M since fix wave 5) written out in full with a pay word in its clause is read, so the
  gate quarantines it visibly; it never beats a plausible amount.
- `zones` does not count a single figure that lies inside another range ("… and most new hires
  start at $23.00").

**Vetting scan (`scripts/vet-salaries.js`):** amounts, clause ends and pay context come from
`server/salary.js` (`findMoneyTokens`, `payContextAt`). `missed_salary` is a posting with no
salary but an amount in the parser's pay context, or with a pay word in the parser's clause,
that no parser rule rejects. `multiple_ranges` counts only pay ranges beyond the salary's
`zones`. Flag definitions: [VETTING.md](VETTING.md) §4.

## Beta fix wave additions (2026-10-10): big-tech sources and locations (fix-beta-sources lane)

Findings DQ-2, DQ-4, DQ-9 to DQ-12, DQ-16 ([docs/process/data-check-beta.md](process/data-check-beta.md))
and D-23, D-24 ([docs/QA.md](QA.md)). Log: [docs/process/fix-beta-sources.md](process/fix-beta-sources.md).
Every addition is optional for readers; no export changed its signature or return shape.

**Job adds `pool: true`** (absent otherwise) on a talent pool or general application: a posting
that collects interest instead of hiring for one opening. `server/sources/pool.js#isTalentPool`
decides from the posting's own words: a title with "Expression of Interest", "Open … Career
Opportunities", "Join Our Talent Network/Community/Pool" or ending in "General Interest/Application",
or a description saying "This posting is not for a specific job opening". The app labels it.

**Apple: one Job per requisition** (DQ-2). Apple lists a requisition once per location
(`200680778-0836` is requisition 200680778 in Cupertino); `fetchApple` merges the listings:
- `id`, `url` and the description are the lowest listing id's; `locations` are every listing's
  place (each listing's own place first);
- when the listings' pay differs, `salary` is structured (`source: 'structured'`): `min`/`max`
  span the listings, `zones` is the number of distinct ranges, `text` names each range's places,
  and `salary.ranges` holds each range: `{ label, min, max, currency, interval: 'year', locations }`.
  `min`/`max` are annual, like `salary.min`/`max`; `label` is the places in the posting's words
  ("Antioch, Cupertino"); `locations` are those places' `rawName`s. A listed place with no
  listing of its own has no range. The description has one "Pay & Benefits (places)" section per
  range. When the listings agree, the salary is the plain text salary, as before;
- `mapAppleJob(row, detail)` maps one listing, which lists only the place its pay is for.

**Other mapping changes:** Apple drops store names given as places ("Bellevue Square, United States
of America") and encodes links once; Apple `employmentType` is `'Part-time'` only when the posting
backs Apple's weekly-hours figure (its words, retail, pipeline, student, intern, seasonal or hourly
pay), else `null` (DQ-9). NVIDIA: a description tagged `#LI-Hybrid` or `#LI-Onsite` makes
`workLocationOption: 'remote_local'` not remote; a "Remote" location still does (DQ-12). Google:
titles are entity-decoded (DQ-16) and `department` is the brand (Google, YouTube, DeepMind, …),
the only grouping its record has (D-24).

**Stored snapshots:** `server/sources/upgrade.js#upgradeStoredJobs(jobs)` applies these changes to
stored, normalized Jobs. The static build (`readSnapshot`) and the server (`pipeline.js` snapshot
task) call it on every snapshot after `relocateJobs`; it is idempotent, so a snapshot crawled with
the fixed adapters passes through. Unlike `relocateJobs` it can return fewer jobs (Apple merges),
so the archive ingest, which pairs jobs by index, does not use it.

**Locations (`server/geo.js`):** new export `countryCode(name) -> ISO2 | null`.
- "Seoul, Korea, Republic of" is one location; a stored dangling "Republic of" is dropped (DQ-10).
- Apple's "City-CC" ("Klang Valley-MY", "Xi’an-CN") drops the country-code suffix.
- Local-script names with an English name are read ("ב"ש" Be'er Sheva, "กทม" Bangkok); one the
  gazetteer cannot read is filed under the district the posting names ("Haifa District, Israel").
- "BG, RS" is Belgrade. New countries Macao, Maldives, Ghana and Palestine; new cities Macao,
  Belgrade, Rawabi and Accra; "BKC" is Mumbai (D-23).
- `data/cities.json` adds `nearby` proxies for big-tech suburbs (DQ-4): Los Gatos and Fremont (San
  Jose), San Bruno and South San Francisco (San Francisco), Culver City (Los Angeles), Waltham
  (Boston), Beaverton and Hillsboro (Portland), Cary and Morrisville (Raleigh), Thornton (Denver),
  Addison and Irving (Dallas), Springfield (Arlington, VA).

## Fix wave 3 additions (2026-10-11): pay and data parsing (fix3-data lane)

Findings BP-1, BP-2 (Juice side), BP-5, BP-8, BP-9 (data), BP-11, BP-14, BP-15 and keyword-tag noise
from the persona review of the beta site ([docs/process/lead.md](process/lead.md) "Beta, stage 1c").
Log: [docs/process/fix3-data.md](process/fix3-data.md). Every addition is optional for readers; no
export changed its signature or return shape. `NORMALIZER_VERSION` is `norm-8`: stored older
snapshots are re-derived once by `relocateJobs(rekeyBoardJobs(jobs).jobs)`, then
`upgradeStoredJobs`, as before.

**Job `salary`** (shared decisions 3 and 4):

| Field | Meaning |
|---|---|
| `originalInterval` | Now also `'year'`, on a salary with `termWeeks` whose pay was stated per year or with no interval (Google "Ireland: €72000 (EUR)" for a 13-week internship, Microsoft "CAD $43,800 - CAD $50,000 per year" for a 6-month one). A salary with `termWeeks` always carries `originalInterval`: `'year'` reads as a yearly rate ("€72,000 a year (13-week internship)"); only `'week'`, `'month'`, `'term'` (or `kind: 'stipend'`) is pay for the term. A salary without `termWeeks` still omits it for yearly pay. `termWeeks` is the programme's length, for information only |
| `partTime` | `true` when the role is part-time (`employmentType` says part-time and not also full-time, or else the title does: `salary.js#isPartTimeRole`) and the pay was posted per hour (`originalInterval: 'hour'`). `min`/`max`/`mid` stay the 2,080-hour (full-time) equivalent, so any yearly figure must say "if full-time (2,080 hours)". Absent otherwise |
| `country` | The ISO code of the country the posting's pay line names (Google "Ireland: €72000 (EUR)", Microsoft "… across the U.S. is USD …", "… across Germany is € …"). Absent when the pay names no country (most postings, and every structured range). Juice applies the pay only in that country |
| `hoursPerWeek`, `hoursPerWeekMax` | With `partTime` only: the weekly hours the posting states ("work 16 hours per week", "28 hrs pw", "20-25 hours a week"; 1–34, a range's upper end up to 40; `salary.js#statedWeeklyHours`). Absent when the posting states none |

New pure exports in `server/salary.js`: `isPartTimeRole({ title, employmentType })`,
`statedWeeklyHours(text) -> { hours, hoursMax? } | null`. `payTerms` sets the three fields above.

**Juice (`server/juice.js#attachJuice`)** (shared decisions 1 and 4):
- Only matched locations whose city uses the salary's currency are scored, and, with `salary.country`,
  only that country's. When none is, the pay is another country's: `job.juice` is `null` and `job.juiceMissing = { code: 'pay-other-country', text }`
  ("No Juice figure: the pay is posted in Canadian dollars (for Canada), and London, UK uses another
  currency. Juice is never worked out from another country’s pay."). The `currencyMismatch` flag on
  `byLocation` entries is retired (never set).
- Part-time hourly pay (`salary.partTime`) is scored on `mid ÷ 2080 × hoursPerWeek × 52`; with no stated
  hours `job.juice` is `null` and `job.juiceMissing = { code: 'part-time-hours', text }`.
- `job.juiceMissing` is absent whenever Juice is computed, and for the other no-Juice cases (no salary,
  unknown currency, no city record). Every `attachJuice` call resets it.

**Job `sections`** (BP-14): adds `preferred: string[]`, present only when the posting itself separates
a required list from a preferred one ("Minimum qualifications" / "Preferred qualifications": Google,
Apple, Microsoft, Anduril, Shield AI, xAI, Scale "Must haves" / "Nice to haves"). `fit` then holds the
required items only. A posting whose list is introduced softly ("You may be a good fit if you", "You
might thrive in this role if you", "About you") is not split: `fit` holds every item and `preferred` is
absent. Rules: `keywords.js#fitHeadingKind(text) -> 'preferred' | 'required' | 'soft' | 'neutral'`. Apple's
line-broken lists (`<h3>Minimum Qualifications</h3><p>line<br>line</p>`) are read as items, a wrapped
line joining the item before it. The "N+ yrs" fit tag is the required minimum when `preferred` exists;
skills named only in `preferred` sort last. A list that moves `sections` into the description files
(over `LIST_BUDGET`) moves `preferred` with them.

**Keywords (`server/keywords.js`):**
- `extractKeywords({ …, skillText })` (optional): for a posting with both responsibilities and fit
  lists, skills come from the title, the lists and `skillText`, the description without the board's
  team paragraphs. New export `teamParagraphs(items: [{ html, title }], { minPostings = 3, minTitles = 3,
  minChars = 60 }) -> Set<hash>`: a paragraph outside the lists that a board repeats on 3 or more
  postings with 3 or more different titles (Google's "Google's software engineers develop the
  next-generation technologies…", "Google Cloud accelerates…", Chrome's "available across all major
  platforms — iOS, Android…"). `rekeyBoardJobs` and `normalizeJobs` pass it; `normalizeJob` alone
  does not, and is unchanged. Also exported: `unionSets(a, b)`, `fitHeadingKind`.
- Lexicon: "CAD" is never the currency, in any format ("$120000 (CAD)", "112 000 $ CAD", "Canadian dollars
  (CAD)", "CAD $43,800"); "Evals" needs a model benchmark ("model benchmarks", "benchmark the models"), not
  "benchmark industry practices"; bare "agents" counts only in a posting about AI and not after another
  kind of agent (commissioning, change, support, routing…); "Transformers" not in a sentence about power
  equipment; "Google Cloud" not as the organization ("Google Cloud customers"); responsibility "Mission /
  defense" needs a military sense (no "Anthropic's mission is…", no "fraud defense").
- Levels: "Art Director", "Creative Director", "Technical Director" (also Associate, Senior, Group, Lead)
  are `'Senior'` with basis `'title'`, never Director+; "Principal …" is Staff+, "Executive Creative
  Director" stays Director+.

**Departments (`server/sources/eightfold.js#departmentName`, BP-8):** NVIDIA's and Microsoft's
department and team names are written in plain words ("Mgmt, Sys SW" → "Management, Systems Software",
"Program Mgr, Technical" → "Program Manager, Technical", "Customer Success Account Mgmt" → "… Management",
a bracket that repeats the name is dropped). Applied by `mapEightfoldJob` and, for stored jobs, by
`upgradeEightfoldJobs`. ASIC, CAD, IT, HR and UX stay.

**Locations (`server/geo.js`, BP-15):** Apple store names and Google's Lithuanian "Dublinas" are aliases
of their city: Piazza Liberty (Milan), Via del Corso (Rome), Shinsaibashi and Umeda (Osaka), Rosny 2
(Paris), "Campania, Italy" (Naples), Polo Park (Winnipeg), Coquitlam Centre and Guildford Town Centre
(Vancouver), Place Ste-Foy (Québec City), The Dubai Mall, Morumbi (São Paulo), Jungfernstieg (Hamburg),
Eldon Square (Newcastle upon Tyne), Akasya (Istanbul), "Emporia, Sweden" (Malmö), Dublinas (Dublin).
New gazetteer cities: Naples, Malmö, Newcastle upon Tyne. `rawName` keeps the posting's words.

## Fix wave 3 additions (2026-10-11): comparisons within one country (fix3-compare lane)

Findings BP-3, BP-4, BP-7 and "Compare companies says why a level is missing" ([lead.md](process/lead.md)
"Beta, stage 1c"). Log: [docs/process/fix3-compare.md](process/fix3-compare.md). Shared decision 2: a
comparison uses only pay for the posting's own country, and with too few such roles it says so instead
of falling back to another country. Every addition is optional for readers; no export changed its
signature or return shape, and `NORMALIZER_VERSION` is unchanged (no stored field changed).

**`payCountry(job) -> ISO2 | null`** (`public/features/shared.js`): the country of the first of
`payLocations(job)` that names one (a remote entry without a country, which Anthropic and Anduril list
first, is skipped); with no located place, the currency's only country (USD -> US, CAD -> CA, GBP -> GB;
a missing currency reads as USD); else `null` (a euro range on a remote-only posting). Also
`samePayCountry(job, jobs)` and `payRank(job, pool, { mid, minN = 5 }) -> { pct, n, country, others } | null`,
the rank behind "Pays more than N% of <company>'s roles in <country> that show pay".

**Market doc** (`scripts/build-market.js`, format still `melon-market-1`, columns unchanged):
- `cells`, `oteCells` and `counts` hold each company's **home country** (`companies[].country`, where
  most of its salaried postings are paid; Cohere: CA). `byCountry: { <ISO2>: { cells, oteCells, counts } }`
  holds every other country where the company has `countryMinN` (10) or more salaried postings. A
  (company, country) pair appears once; nothing pools two countries. `companies[].countries` counts the
  postings used per kept country and `countries: [{ code, companies, n }]` sums them, most first.
- Seniority bucket `"Mid-level"` (`MID_STATED`, `levelKey('Mid')`): full-time postings whose
  `displayLevel()` is `'Mid'` (a stated mid level, `seniorityBasis` `'title'` or `'pay'`). The stored
  `'Mid'` bucket is unchanged (defaults plus stated mid levels).
- Size on 2026-10-11 data: beta 77 KiB (was 57), main site 31 KiB (was 29).

**Readers** (`public/features/comps.js`): `marketComps`, `familyOptions`, `levelOptions` and
`missingCompanies` take `country` (default: the doc's main country); `compsForJob(market, job, { country })`
compares within `payCountry(job)` and adds `country` and `bucket` to its result (`level` reads `'Mid'`
for a stated mid level, the value the app's Seniority filter takes; `bucket` is `'Mid-level'`).
`compsNote` names the country and, with no rows, says there is nothing to compare (it returned `''`).
New: `compareCountry`, `marketCountries`, `defaultCountry`, `hasCountries`, `missingLevels`,
`missingLevelsNote`. A document without countries is read as before. Compare companies shows one
country (the open job's, else the location filter's, else that of most roles in view), names it in
its subtitle and footnote, and says in one line which levels are missing and why. No new control.

**Role families** (`public/features/roles.js`): new `chip` ("Chip design & silicon engineering":
verification, physical design, DFT, RTL, analog and mixed-signal IC, layout and mask design, timing,
EDA; NVIDIA's ASIC, Verification, Phys Design and Mask Design departments) and `dc-tech` ("Data
center technicians": a technician title on a data-center floor or in a data-center department).
"Distributed systems" is software before hardware's "systems engineer"; design managers and directors
are design (chip ones are chip); economists are data science; signal and power integrity are
hardware; NVIDIA developer relations are sales and partnerships; Canadian French titles ("Représentant
aux ventes", "Développeur de logiciels", "Étudiant-chercheur", "Responsable de compte") are read.

## Fix wave 3 additions (2026-10-11): the chart and map under a Location filter (fix3-viz lane)

Findings BP-2 (chart side), BP-13 (chart side) and the map's pin names ([docs/process/lead.md](process/lead.md)
"Beta, stage 1c"). Log: [docs/process/fix3-viz.md](process/fix3-viz.md). Every addition is optional;
no export changed its signature or return shape.

**Chart (`public/viz/chart.js`).** `update(jobs, { …, places, placeTest })`:
- `places` is the Location filter's keys (app.js `S.l`), `placeTest(job, location)` the host's own
  match (app.js passes `locMatches(job, viewSpec, [location])`; without it a location matches by its
  key or name). With `places`, a posting is plotted only when its pay applies to one of them
  (`payLocations`); the notes line counts the rest ("12 with pay for another country only, left
  out"), and with nothing left the chart says "No pay posted for <place>".
- Every median (the caption, each row's median, quartiles and band, each Ranges group) is base pay:
  `salary.kind: 'ote'` ranges are plotted but left out, as in the stats line, unless nothing else is
  left (then the caption reads "Median on-target earnings"). The caption reads "Median base pay".
- New pure exports: `chartPay(jobs, { places, placeTest }) -> { plotted, noSalary, elsewhere,
  elsewhereIds, fxCount, unknownFx, ote }`, `basePayStats(items) -> { median, p25, p75, n, oteOnly,
  oteLeftOut }`, `placeMatcher(places, placeTest)`, `placesPhrase(places)`.

**Map (`public/viz/map.js`).** `update(jobs, { fit, colorMode, places, placeTest })`:
- With `places`, only the filtered places are pinned. A location with no city that the filter takes
  in ("United States", "Ohio, US") counts at the filtered cities it covers (its own pin only when
  the filter names it); the Remote button holds only roles whose remote location the filter takes
  in. The tooltip counts the roles also listed elsewhere and the country- or state-wide ones. The
  map refits when the filtered places change.
- Offline (no basemap), every pin keeps its place name: below, above, a short form ("Shanghai and 52
  more") below or above, then beside the pin; with no room anywhere the pin is merged into its
  nearest neighbour. A no-pay pin reads "1.1K jobs" (`shortCount`).
- `aggregate(jobs, { places, placeTest })` adds `also` and `wide` (job id sets) per place. New pure
  exports: `shortLabel(members)`, `layoutLabels(items, host)`, `jobsText(n)`.

**App (`public/app.js`, patch `docs/process/patches/fix3-viz-app-places.diff`).** `renderViz` passes
`places` and `placeTest` to both and adds `S.l` to the viz signature.

## Fix wave 4 additions (2026-10-11): data, pay places and parser limits (fix4-data lane)

Findings DQ-27 to DQ-32, the DQ-3, DQ-6 and DQ-11 residues
([docs/process/data-check-beta-2.md](process/data-check-beta-2.md)), VT-1, VT-2, VT-3, VT-5, VT-6,
VT-9, VT-12 and VT-13 ([data/vetting/2026-10-11-beta/summary.md](../data/vetting/2026-10-11-beta/summary.md)),
D-32, D-34 and D-36 (docs/QA.md "Full QA pass (desktop, beta) 2026-10-11"), S-3 and S-4
(docs/REVIEW.md "beta review 2026-10-11") and MR-1 ([docs/process/methodology-review-beta.md](process/methodology-review-beta.md)).
Log: [docs/process/fix4-data.md](process/fix4-data.md). Every addition is optional for readers; no
export changed its signature or return shape. `NORMALIZER_VERSION` is `norm-9`: stored older snapshots
are re-derived once, as before.

**Job `salary`:**

| Field | Meaning |
|---|---|
| `places` | The location strings (`Location.rawName`) the pay was posted for, when that is only some of the posting's places. Absent means every place in the pay's country. Set by Apple: a requisition's range posted on its California listing only, none for Texas (DQ-27). Fresh crawls know each footer's place (RawJob `payPlaces`); stored snapshots get it from `server/sources/apple.js#applePayPlaces` (US places outside `APPLE_PAY_STATES` are left out). Kept when a stored text salary is re-derived |
| `ranges[].locations` | Unchanged shape (Apple's per-place ranges, since the beta fix wave), now read: a place listed in a range is that range's place; a place in no range has no posted pay |
| `country` | Also set from a "<Country>: The base salary range is …" sentence (NVIDIA "Italy:", "For Poland:", VT-6). A pay line for a country none of the job's places is in is not the job's pay: `salary: null` (VT-1) |
| `levels` | A level paragraph stated twice is one level; a level priced twice keeps its widest range, so the breakdown is kept (VT-12, D-34) |
| `currency: 'RON'` | Romanian lei are used: RON has a rate in every FX table (4.58165 per USD, Big Mac source data v2 `dollar_ex`, release 2026-07-01, the source of every other rate; `scripts/refresh/fx.js` requests RON from the ECB monthly). MR-1, DQ-6 residue, VT-2 |

**`payLocations(job)` (`public/features/shared.js`):** before the currency test, narrowed to the posted
places (`salary.places`, else the places of `salary.ranges` when every range has some), then to
`salary.country`'s places (VT-5: Ireland's euro range is not Spain's). Each step is skipped when it
would leave no place. `payCountry`, `payAppliesIn` and `payLocationKeys` follow it.

**Juice (`server/juice.js#attachJuice`):** only the posted places are scored (DQ-27), and a place with
its own range in `salary.ranges` is scored on that range's midpoint, not the span's (DQ-28: Cupertino
on $214,000, not $198,700). `juice.salaryUSD` stays the span's midpoint.

**Levels (`server/keywords.js#jobSeniority`):** Google numbered manager titles (DQ-29): "Product
Manager I/II" one rung up (II is Mid), "Leadership … Manager I/II" Senior (III+ Staff+), other "…
Manager <numeral>" families Manager; Program, Technical Program and Account Manager titles keep the
ladder. Netflix "(L5)" after a support word and "(L5+L6)" are levels (DQ-3 residue).

**Talent pools (`server/sources/pool.js`):** "Expression of Interests" (plural) is a pool (DQ-11 residue).

**Apple (`server/sources/apple.js`):** `reqId` is the requisition ("200578781"), for fresh and stored
postings (DQ-30). New exports `APPLE_PAY_STATES`, `applePayPlaces(job)`.

**Locations (`server/geo.js`):** a US state with a ZIP code ("SC 29461") is the state (DQ-31); new
gazetteer cities Moncks Corner SC, Pryor Creek OK ("Pryor" alias), Leicester, Solihull, Bordeaux,
Fukuoka; store aliases Champs Élysées, "Opéra, France", Parly 2 (Paris), "Sainte-Catherine, France"
(Bordeaux), Highcross, Touchwood Centre, Richmond Centre (Vancouver), Southgate Centre (Edmonton),
Grosse Bockenheimer Strasse (Frankfurt), Fukuoka Tenjin, "Antara, Mexico" (Mexico City), VillageMall
(Rio de Janeiro) (D-32, D-36).

**Eightfold (`server/sources/eightfold.js`):** twice-escaped numeric character references are decoded
(`undoubleCharRefs`, VT-13); posting links are https on the tenant host, else the canonical
`https://<host>/careers/job/<id>` (S-4). **`normalizeJob`** keeps a posting `url` only when it is an
absolute http(s) URL, else `null` (`postingUrl`, S-4). For a beta built-in it must also be https, with no
user name, password or port, on that company's own posting hosts (its registry entry's `postingHosts` /
`postingPrefixes`, `server/companies.js#postingRule`; `scripts/links-policy.js` `BETA_POSTING_HOSTS` /
`_PREFIXES` are built from them, and the stable site's `lib/companies.js` ships none); Amazon's `job_path` is
kept only when it stays on `www.amazon.jobs` (`amazonPostingUrl`), else the posting's `/en/jobs/<id>` page.
A posting with no link shows "No link to the posting" in the drawer instead of an Apply button (S-4 residual,
fix-sec-3).

**Parser limits (S-3):** `parseSalary` reads at most `MAX_PAY_TEXT` (40,000) characters and
`MAX_PAY_AMOUNTS` (1,000) amounts, finds clause ends once per text and reads at most 600 characters each
side of an amount; both `htmlToText`s, `geocode` and the block tokenizer never scan past the next
opening bracket. 1 MB of hostile text takes 40–110 ms in each (was quadratic: about an hour).
Pipeline tasks stop after `MELON_TASK_TIMEOUT_MS` (default 5 minutes; 0 turns the limit off) and their
worker is replaced.

**Parser limits (S-10, fix-sec-3):** `parseMetaAmount` reads the trimmed first 100 characters;
`familyOfTitle` the first 500 characters of a title, dropping brackets of at most 200 characters with no
bracket inside; `parseMetaSitemap` a `<loc>` of at most 2,048 characters; the Meta JSON-LD reader
(`metaJsonLd`) a `type="application/ld+json"` within the first 500 characters of a `<script>` tag. The DOL
tools read cells and text runs in one forward pass (`cellElements`, `textRuns`) and at most 300 characters of
an employer name. Each reads real pages and files exactly as before; 64–256 KB of hostile text takes
milliseconds (was quadratic: 2 to 59 minutes projected for 1 MB).

**Vetting (`scripts/vet-salaries.js#scanJob`, `scripts/llm-vet.js`):** a merged Apple requisition is not
`structured_text_disagree` when its text states one of its ranges (DQ-32). `reviewedFiles` reads
`<date>-beta` folders; `latestFlags(channel, dir)` is exported and the CLI takes `--channel beta` (VT-9).

## Fix wave 5 additions (2026-10-11): Amazon pay places, stated minimums, the gate and the ledger (fix5-data lane)

Findings DQ-33 to DQ-43 and the DQ-6 residue ([docs/process/data-check-beta-3.md](process/data-check-beta-3.md)),
VT-7, VT-8, VT-10 and VT-14 to VT-25 ([data/vetting/2026-10-11-beta-2/summary.md](../data/vetting/2026-10-11-beta-2/summary.md)),
under the user's rule "we must present them as they are and not cut anything" and the lead's decisions in
[docs/process/lead.md](process/lead.md) "Beta round 3". Log: [docs/process/fix5-data.md](process/fix5-data.md).
Every addition is optional for readers; no export changed its signature or return shape.
`NORMALIZER_VERSION` is `norm-10`: stored older snapshots are re-derived once, and stored Amazon and Meta
jobs are upgraded at read time (`server/sources/upgrade.js`).

**Job `salary`:**

| Field | Meaning |
|---|---|
| `kind: 'minimum'` | The posting states the figure as the minimum base pay (Amazon EU and Poland: "See below the minimum gross base salary for this position"; Austria's "minimum basic salary … gross annually"). Shown as "from €X", never hidden (VT-17). Never a low-side statistical outlier |
| `includesShiftDifferential` | `true` when the posted hourly figure includes the highest shift differential (Amazon: "including the base pay rate plus the highest available shift differential"). The figure is the posted one (VT-18) |
| `statedBase` | `{ min, max, currency, originalInterval?, text }`, annualized like `min`/`max`: a lower base the posting states in words ("Pay starts at $18.35 per hour"), beside the posted figure (VT-18) |
| `statedAnnual` | `{ amount, currency, monthly, paymentsPerYear }`: the salary is the annual figure the posting states ("EUR 47'000 gross annually"), not 12 × its monthly row (Austria pays 14; VT-19) |
| `ranges[].locations` | Now set for Amazon too: each pay-table row carries the posting's location strings it names (DQ-33, VT-15); identical rows are one range with all their places; `min`/`max` are yearly like the salary; `label` is the places' city names |
| `zones` | Counts distinct ranges: three identical rows are one zone (DQ-33) |
| `places` | Also set for Amazon when one range is posted for some of the posting's places only |
| `country` | Also set for Meta, from the range's `country_code` (DQ-42, VT-20) |
| `kind: 'ote'` | Also NVIDIA's sales "cash compensation range" split into base and variable pay (VT-7) |
| `currency` | A bare "$" in a posting whose places are all in Mexico is MXN; also AUD, NZD, SGD, HKD (`salary.js#DOLLAR_COUNTRY`; DQ-35, VT-14) |

**Amazon (`server/sources/amazon.js`):** `amazonSalary(j, table, { places, primary, text })` takes the
posting's places (strings or stored Locations), the row a stored salary was read from, and the text; a
"Virtual Location" row for a state the posting lists no place in is dropped (DQ-41); RawJob `payPlaces`
when one range covers some places only. New export `amazonPayWords(text)`. `amazonPlace` is unchanged.
**Upgrades (`server/sources/upgrade.js`):** `upgradeAmazonJobs`, `upgradeMetaJobs` (in `upgradeStoredJobs`).

**Salary bounds (`server/salary.js`, `server/vet.js`):** `MAX_ANNUAL` and `VET.MAX_ANNUAL` are $1.5M (VT-10).
New exports `LEGAL_MIN_ANNUAL` (`{ MXN: 114990 }`), `meetsAnnualFloor(annual, cur)`, `DOLLAR_COUNTRY`,
`CASH_COMP_SPLIT_RE`. The gate's statistics add a `cur:<code>` comparison group, used when it has at least
`MIN_GROUP` members; low pay in a minority currency without such a group is not a statistical outlier
(VT-16, DQ-6 residue). "20h per week" is weekly hours (VT-23).

**Levels (`server/keywords.js#jobSeniority`):** Amazon "III" is Senior (DQ-36, VT-21); Meta "(Technical
Leadership)" and "(Leadership)" are Staff+ (DQ-37); an executive word in the team name after the role
("Communications Specialist, CEO & Financial Comms") and a "Data Center Chief Engineer" are not Director+
(VT-21); on Microsoft the pay sentence's IC/M level beats the title (VT-8).

**Locations (`server/geo.js`):** ISO 3166 alpha-3 codes written in capitals are countries ("…, SVK",
"…, AUT"; DQ-40); new countries Slovakia, Slovenia; new gazetteer city Bratislava.

**History ledger (`server/history.js`, DQ-38):** `updateLedger` records a listed id it has never seen
(`u: 1`, left out of `compactLedger`), records `partial: true` on a partial run, and after a partial run
(or `opts.previousPartial`) dates a new id posted before that run by its `postedAt`, clamped to
`[since, previous run]` (`b: 1`). `closureOptions` takes `previous` (or `crawl.previous`) and returns
`previousPartial`; new export `previousRunOf(snapshot)`. `diffLedger` adds `inferred` and `unpublished`
when non-zero. `.github/scripts/beta-snapshots.mjs merge` passes the replaced snapshot's `previousRunOf`.

**Vetting (`scripts/vet-salaries.js`, `scripts/llm-vet.js`):** the default scan reads what the build
serves (`loadServedJobs(parsed)`, exported; DQ-43); `max_over_1_2m` keeps its name and means the $1.5M
bound. `REVIEW_DIR_RE` accepts `<date>-<channel>-<n>` folders (`2026-10-11-beta-2`, VT-25), sorted
numerically.

**Cities (`data/cities.json`, DQ-34):** same-state `nearby` proxies only (docs/LIVABILITY.md "Proxies").

## google-grouping additions (2026-10-16): job families and brands (google-grouping lane)

The user asked (2026-10-11) that Google's listing in chart mode be consistent with the other big-tech boards,
while still letting people zoom into, or group by, a Google subsidiary. Log: [docs/process/google-grouping.md](process/google-grouping.md).
Every addition is optional for readers; no export changed its signature or return shape. This supersedes
D-24's "the brand is the department" (Beta fix wave section above). `NORMALIZER_VERSION` is unchanged:
stored snapshots get the new fields at read time (`upgradeGoogleJobs`, in `upgradeStoredJobs`).

**Job adds:**

| Field | Meaning |
|---|---|
| `brand` | The company or subsidiary the board names on the posting. Google only today, from the record's brand slot: Google, YouTube, DeepMind, Waymo, Wing, GFiber, Verily Life Sciences. Absent on every other board, because none publishes one. Amazon's `business_category` search facet is a business line ("aws", "fulfillment-ops", "subsidiaries"), not a brand, and it is not stored on Jobs. Apple, Microsoft, Meta, NVIDIA and Netflix have no such field |
| `departmentBasis: 'title'` | `department` was read from the title by `server/families.js` because the board publishes no department (Google). Absent when the board publishes the department |

**Google (`server/sources/google.js`):**
- `department` is `familyOfTitle(title)`: one of 27 job families, or null when the title names no role. A null department shows as "No department", and there is never a guess.
- `team` and `brand` are the brand.
- The RawJob carries `brand` and `departmentBasis` too. `server/normalize.js` keeps only the fields it knows, so a fresh crawl's Jobs get them back from `team` when the snapshot is read.

**`server/families.js`** (new, browser-safe, in `LIB_MODULES`):
- `FAMILIES` is the family list, named after Google's careers categories plus Research, Data Science and Analytics, Security and Privacy, and Trust and Safety.
- `familyOfTitle(title) -> family | null` is pure and deterministic. It tries, in order:
  1. the role part of the title (before the first comma);
  2. team-only families (Trust and Safety, Data Center, Government Affairs) in the team part;
  3. the role rules on the team part;
  4. generic role words.
- Common Japanese, Chinese, Vietnamese and French role words are read too.
- Measured against hand labels (`test/fixtures/google-families-sample.json`):
  - coverage: 96.8% of the 2026-10-16 crawl;
  - held-out 92/100 and fresh 88/100 right;
  - precision on those 200: 180 right of 188 answered.

**Chart (`public/viz/chart.js`):**
- `keyOf(job, 'brand')` is `job.brand || job.companyName || 'No company'`.
- `groupBy` and `colorBy` accept `'brand'` (shown as "company").
- Company rows fold their small rows like department rows ("N more companies"), and compare one country's pay like department rows (V-21).

**App (`public/app.js`):**
- URL state:
  - `b=<brand>` (repeatable) is the Company filter. It is in `FILTER_KEYS`, so it counts for Clear all, saved searches and company switches.
  - `g=brand` groups by Company.
- The Group select's Company option, and the Company list at the top of the Department filter section and of the Department chip's menu, show only on a board with more than one brand. A `g=brand` link on another board groups by the default.
- When departments are read from titles, the Department option's tooltip and a one-line note under the department list say so: "Grouped by job title: Google doesn’t publish departments".

**Build (patch for the static-build owner):** [`docs/process/patches/google-grouping-pack.diff`](process/patches/google-grouping-pack.diff)
packs `departmentBasis` and `brand` as dict columns, like `seniorityBasis`. With it, the Google list is 1.62 MB, against 1.60 MB before; without it, 1.77 MB.

**History ledger (`server/history.js#fingerprint`):** the fingerprint hashes the department, so Google's fingerprints change once. A posting that closed before this change and is reposted within `REPOST_WINDOW_DAYS` (30) may not be linked as a repost. Nothing is hidden or dropped.

## fix-data-3 additions (2026-10-17): Fellow ranks, base pay in comparisons, pay at a place, places and department names (fix-data-3 lane)

Findings D-38, D-41, D-42 (docs/QA.md "Full QA pass (desktop, beta) 2026-10-16"), V-45 ([docs/process/viz-review-beta-2.md](process/viz-review-beta-2.md)),
MR-28 ([docs/process/methodology-review-beta-2.md](process/methodology-review-beta-2.md)), UX-32 and the lead's round-3 follow-ups
([docs/process/lead.md](process/lead.md): the no-row decision, Town and Country, old "Columbus, OH" links). Log:
[docs/process/fix-data-3.md](process/fix-data-3.md). Every addition is optional for readers; no export changed its signature or return
shape. `NORMALIZER_VERSION` is `norm-12`: stored older snapshots are re-derived once (relocateJobs re-geocodes, re-levels and re-vets).
Nothing is dropped: every posting, pay row and place string is kept (the only place count that changes is Town and Country, MO, two
halves of one name joined).

**Levels and the gate (D-38):** new pure exports in `server/salary.js`: `isFellowRank(title)` (a Fellow rank: "Fellow, Core AI
Foundations", "Fellow", "Google Fellow", a distinguished-type fellow; never a title with a programme word: fellowship, Fellows Program,
program, residency, student, graduate, PhD, postdoc, intern) and `programmeText(title)` / `NOT_PROGRAMME_RE` ("Data Residency" is not a
residency). A Fellow rank is `'Staff+'` (`keywords.js`), not `junior` for the gate (`vet.js#titleClass`, so no `junior_high`), not the
`intern` role family (`vet.js#roleFamily`), and not a fixed-term role (`isFixedTermRole`).

**Market doc (`scripts/build-market.js`, MR-28):** `notBasePay(job) -> 'minimum' | 'shiftPay' | 'partTime' | null` (exported, with
`NOT_BASE_KINDS`). A salaried posting whose figure is a stated minimum (`salary.kind: 'minimum'`), includes the highest shift differential
(`includesShiftDifferential`) or is part-time hourly pay (`partTime`) enters no cell (`cells`, `oteCells`, the Intern bucket) and is
counted on `companies[]` as `minimum`, `shiftPay` and `partTime` (`used = ote + internLike + fullTime` still holds). Format and columns
unchanged.

**Juice (`server/juice.js`, lead decision 2026-10-16):** when a salary prices places in rows of their own (`salary.ranges[].locations`),
only the places of those rows are scored; a place in no row gets no Juice and is never scored on another place's row, even when another
row is tied to no listed place. Before, one untied row made every place score on the headline. `public/features/shared.js` `payAt` (fix-pay-at-place)
applies the same rule to every other view; `postedPlaces` (behind `payLocations`) gets it from
[`docs/process/patches/fix-data-3-shared-posted-places.diff`](process/patches/fix-data-3-shared-posted-places.diff).

**Drawer (`public/app.js` `juiceBlock`):** one line, `.juice-gross`, "Gross pay is the posted minimum." or "Gross pay includes top shift
pay." (MR-28), one line from 280 px up.

**Locations (`server/geo.js`):**
- D-41: an unknown US town's "St", "St." or "Saint" is "St." ("St Louis, Michigan" -> city "St. Louis", region MI; "Saint George, SC" and
  "St George, SC" -> "St. George"), a Canadian "St" is "St.", and every other spelling is kept. Two towns of one name are then told apart
  by the app's `disambiguateLocations` ("St. Louis, MO" / "St. Louis, MI").
- D-42: `canonicalName` of a US state-only place is "<State> State" when the state's name is also a gazetteer city's ("New York State",
  "Washington State"), and "Washington, DC" for the District of Columbia; other states keep "<State>, US".
- V-45: "City, State, CCC" (ISO-3, Amazon) is one place even when the state shares a city's name. New gazetteer cities: Cajamar, Osasco,
  Barueri, Embu das Artes, Jundiaí, Paulínia, São João de Meriti, Belford Roxo (Brazil), Luxembourg (Luxembourg City; "Luxembourg, LUX"
  and a bare "Luxembourg" are the city, precision `'city'`, label unchanged), Town and Country (MO).
- `splitLocations` keeps a name with " and " in it whole (`AND_PLACES`: Town and Country, Trinidad and Tobago, Bosnia and Herzegovina, …),
  and `geocodeMany` joins a stored pair cut at one ("Town" | "Country, Missouri, USA").

**Department names (UX-32):** `server/families.js#departmentDisplayName(name)` (pure, browser-safe) writes NVIDIA's inverted job families
and "Intern", and Amazon's "--" qualifiers, as natural names ("ASIC Engineering", "Technical Program Management", "Internships",
"Technical Project, Program and Product Management"); other names pass through. `server/sources/upgrade.js#displayDepartments(jobs)`
(last step of `upgradeStoredJobs`, NVIDIA and Amazon) sets `department` to that name. Read time only: snapshots and the history ledger keep
the board's name, so fingerprints do not change. `departmentDisplayName` of a shown name is that name (idempotent). No new Job field: the
board's name on each job made the Amazon and NVIDIA lists 3% and 6% bigger (gzip).

**App (`public/app.js`):** `resolveOldFilterKeys()` runs once a board has loaded: a link's `l=` value that no posting uses is replaced by
the one current label for the same place (its canonical name, posted words, its city with the state or country tag ("Columbus, OH"), the old state label, compared
without case, accents, periods and "Saint"/"St"), and a `d=` value the board no longer uses by `departmentDisplayName(value)` when the board
has that department (`lib/families.js`, imported only then). The hash is rewritten (replace). A value that fits nothing or several labels is left as it is.

## fix-pay-at-place additions (2026-10-16): one rule for the pay posted at a place (fix-pay-at-place lane)

Findings V-35 to V-40 (viz-review-beta-2), UX-37 and UX-52 (ux-review-beta-2), MR-34 (methodology-review-beta-2), D-39,
D-40 and D-45 (qa-desktop-beta-3) and M-42 (qa-mobile-beta-3), plus the lead's decision of 2026-10-16 in
[DATA_SOURCES.md](DATA_SOURCES.md) §7a. Log: [docs/process/fix-pay-at-place.md](process/fix-pay-at-place.md). Every
addition is optional for readers. Job fields are unchanged, and `NORMALIZER_VERSION` is unchanged.

**`payAt(job, place = null)` (`public/features/shared.js`):** the pay a posting posted for a place. Every view that
prices a place uses it, so the views agree under the same filter:
- the chart's Clusters and Ranges, grouped by Location and under a Location filter;
- the map's pins and Remote button;
- the stats line, the pay filter and the salary sort;
- Compstimate's comparables, Insights' hot locations and its Location-filtered figures;
- the drawer's rank and strip.

`place` can be:
- one of the job's Locations, or several (an array or a Set);
- a location key ("Seattle", "Remote");
- a test `(location) => boolean` over `job.locations`;
- `null`, for the posting as a whole.

It returns `null`, or `{ min, max, mid, currency, usd: { min, max, mid } | null, rated, basis, places, label, span,
rows, ranges }`:
- `basis: 'place'`: the ranges in `salary.ranges` whose `locations` name the places. Several places with different
  rows give the span of their rows, with `span: true`. `label` names the places ("Nashville", "Seattle and Bellevue",
  "Seattle, Bellevue and 3 more") for captions that say "pay posted for <label>".
- `basis: 'posting'`: the posting's one range, which covers the place: the place is in `payLocations` and in a
  country that uses the pay's currency (chart.js `payCoversRow`, V-18).
- `null`: no pay is posted there. Either the posting has ranges per place and lists this place in none of them (the
  lead decision: it is never priced on another place's row), or its one range is another country's pay, or the place
  is not one of its places.
- `place = null`: the headline (`salary.min/max/mid`). It is `basis: 'place'`, named for its place, when it is one
  place's row (Amazon's search city, Microsoft's U.S. range). It has `span: true` when it is the span of the places'
  rows (Apple).
- `usd`: converted with palette.js rates, as the chart, the map and the stats line convert. A currency with no rate
  stays unconverted, with `rated: false`.
- `rows`: how many per-place ranges the posting has. `ranges`: the ones this figure is.

Results are cached per job and Location and shared, so callers never change them.

Also new in `shared.js`:
- `payMissAt(job, place)`: `'none' | 'unlisted' | 'place' | 'country' | null`, saying why `payAt` is null.
- `pricedPlaces(job)`: the Locations that have posted pay.
- `placeLabel(places, max = 2)`.

**Chart (`public/viz/chart.js`):**
- `chartPay(jobs, { places, placeTest })` items carry `at`, the `payAt` result under a Location filter. The result
  adds `otherPlaces`: the postings left out because they price other places but not these. The notes line names
  them apart from pay for another country.
- New pure exports:
  - `locationRowItem(p, key, test)`: an item priced for its Location row, or `null`. Clusters and Ranges, grouped by
    Location, use the same row (`locationRowKey`) and the same pay (V-36, V-37). `payCoversRow` is now `payAt`'s rule.
  - `barSpan(p)`: a bar is striped only when it spans several levels or several places' ranges (V-35).
  - `barPlace(p)`: the place a bar's range was posted for, named in its accessible name and tooltip.
- `spanTiers` is unchanged.

**Map (`public/viz/map.js`):**
- Each `aggregate()` place adds `locsAt` (job id -> its Locations there with posted pay) and `priceOf(job)`. The result
  adds `remotePriceOf`.
- `summarize(jobs, paid, priceOf)`: `priceOf` is optional. Without it, the headline midpoint is used, as before.

**Insights (`public/features/insights.js`):** `hotLocations` and `payPlaceKeys` use `payAt` and `pricedPlaces`.
`update(..., { places })` prices each role at the places picked.

**Compstimate (`public/features/compstimate.js`):**
- A comparable that posts a range per place is priced at its range for the city asked.
- With `LOCAL_MIN` (5) or more such comparables, only those are used (V-40). Boards without per-place ranges are
  unchanged. Since fix-qa4 (D-52, below), "such comparables" are all the comparables with pay posted for the city
  (`payAt`), one-range postings there included.
- A posting's places with no row of their own are not its pay places.

**App (`public/app.js`):**
- `placePay(j, F)` is the `payAt` of the places the Location filter takes in. `payHere` and the new `usdHere` use it
  for the pay filter, the sort, the stats line and the filter's histogram.
- `payPill` returns `range` and `sub` beside `text`. The pill shows the range alone, and `sub` ("5 places",
  "2 levels", "2 ranges") is a muted line under it (UX-52).
- `payHeadline(job)` is shared by the card and the drawer heading (UX-37):
  - the span of a posting's ranges, in the unit it was posted in (D-40: an internship's "/year", part-time "/hour");
  - or, under a Location filter, the place's own range with "Posted for <place>" under it.
  - "· N places" counts distinct places: Amazon's "Remote (IL, NJ, VA)" is three. It reads "· N ranges" when the
    ranges are not one per place (D-39).
- The drawer's rank and strip use `drawerUSD(job)`, and its Details say whose range that is.
- "Pay by place" is shown for fixed-term and part-time pay too, and never cuts a place name: a row for more than two
  places names two and counts the rest, and Details list every place.
- `severalRangesTip(s)` says whether the figure is one of the posted ranges or their span (MR-34).

**Amazon (`server/sources/amazon.js`):**
- A virtual-location row's label keeps its state ("Remote (CA)"; identical rows: "Remote (IL, NJ, VA)", D-39).
- Labels are no longer cut at 60 characters.
- Stored snapshots get both at read time (`upgradeAmazonJobs`).
- Identical rows stay one range that lists every place (DQ-33).

## fix-qa4 additions (2026-10-17): QA round 4's pay estimate, rank line, open data and empty states (fix-qa4 lane)

Findings D-47 to D-50 and D-52 ([docs/process/qa-desktop-beta-4.md](process/qa-desktop-beta-4.md), red tests in
`test/e2e/beta-desktop-qa-4.e2e.js`), and since 2026-10-23 UX-50 and UX-51
([docs/process/ux-review-beta-2.md](process/ux-review-beta-2.md)) and MR-35
([docs/process/methodology-review-beta-2.md](process/methodology-review-beta-2.md)). Log: [docs/process/fix-qa4.md](process/fix-qa4.md). Job fields and
`NORMALIZER_VERSION` are unchanged; every addition is optional for readers, except the CSV's two new columns (below).

**Compstimate (`public/features/compstimate.js`, D-52):**
- A comparable is local when `payAt` prices one of its places in the city asked: its one range covers the place
  (`basis: 'posting'`), or it has a row of its own for it (`basis: 'place'`, and it is priced at that row). Before,
  only the second counted, so the city's one-range postings were cut (Apple "Software Engineer" in Cupertino used 37
  of the 204 Cupertino postings with that title; now 274 comparables, Cupertino's only).
- The V-40 cut (`LOCAL_MIN` = 5 or more local comparables: only those are used) applies when at least one comparable
  has a row of its own for the city: the company prices that city separately. A company that posts one range for many
  places (Google's US range, every main-site board) keeps its other cities' postings, as before.
- `estimateComp` results add `comparablePay`: for each of `comparables`, `{ min, mid, max, converted, place }`, the
  pay the estimate used (US dollars a year), with `place` naming the place when it is one place's row (the city's row,
  or the headline row of a posting used at its headline: Amazon's search city). Insights' "Most comparable roles" shows
  that pay, and "Posted for <place>" on its line.
- New pure exports `statedMax(job)` and `capAtStatedMax(estimate, max)` (D-50): for a "Pay unclear" posting whose
  `salaryFlag.codes` are only `below_min` and `range_ratio` (its stated maximum passed the checks),
  `compstimateForJob` caps low, mid and high at `salaryRaw.max` in US dollars (rounded down to $1K) and adds
  `cap: { max, stated: { usd, amount, currency, text }, low, mid, high }` (the figures before the cap). The drawer's
  line then reads "An estimate, capped at the posted maximum" (shorter where that doesn't fit one line); Details give
  the figure before the cap.

**Rank (`public/features/shared.js`, D-48):** `payRank` adds `below` and `above` (same-country roles paid less and
more). New pure `rankText(rank, among)`: "The highest pay of <among>" / "The lowest pay of <among>" only when no role
pays more / less; a share that rounds to 100% or 0% reads "In the top 1% of <among>" / "In the lowest 1% of <among>";
otherwise "Pays more than N% of <among>"; null without a percentage. The drawer's line and its short form use it.

**Empty states (`public/app.js renderViz`, D-47):** a board that isn't on the site (`unknown`), fails to load
(`error`) or has no roles hides `#chartHost` and `#mapHost`; the previous board's chart or map is no longer drawn behind
the message or left in the accessibility tree. The next board that loads shows its own.

**Open data CSV (`server/export.js`, F7, D-49):**
- `CSV_COLUMNS` is `id, title, department, team, seniority, locations, remote, salary_min, salary_max,
  salary_currency, posted_at, first_seen_at, url, salary_kind, salary_ranges, data_mode`: two columns before
  `data_mode`, which stays last; every other column keeps its place.
- `salary_min` / `salary_max` are the range the job card shows (`salaryRange(salary)`): for a posting with a range
  per place, the lowest to the highest of its rows in the salary's currency (it was the headline, one place's row);
  for a stated minimum, `salary_max` is empty (it was the minimum twice); for pay that includes the top shift
  differential, as its card shows it (UX-51, below): the stated base to the posted rate, or an empty `salary_min` for
  one posted figure. Annualized as before.
- `salary_kind` (`salaryKind(salary)`, `SALARY_KINDS`): `salary`, `hourly`, `ote`, `minimum`, `shift`,
  `part-time` or `fixed-term`, as the card and the drawer caption say it; two that both hold are joined with "+"
  (`shift+part-time`).
- `salary_ranges` (`salaryRows(salary)`): every range the posting states for a level (`salary.levels`, two or more)
  or a place (`salary.ranges`, every row in its own currency): `"<level or place>: <min>-<max> <currency>"`,
  separated by `" | "`; empty for one range.
- `csvReadme({ generatedAt, companies, channel })`: written per site. The beta README says each big-tech file comes
  from the company's own careers site, names it per file, and says big-tech pay is base pay only; the main site's
  names Greenhouse, Ashby and Lever. Both explain `salary_kind` and what changed on 2026-10-17.
  `scripts/build-static.js` passes `channel: site.channel` and each file's `source`, `channel` and `sourceText`: the
  careers site, from `CAREERS_SITES` in the build script (as docs/DATA_SOURCES.md §7 names the systems), since
  server/export.js ships in the main site's `lib/`, which names no beta host. A job-board file's source is
  `JOB_BOARD_SOURCES[source]`.

**Shift pay on the card (`public/app.js`, UX-51, 2026-10-23):** pay that includes the highest shift differential
(`salary.includesShiftDifferential`) says so on its card. `shiftRange(salary)` gives `{ lo, hi, upTo }`:
- a posting that states its base pay (`salary.statedBase`, same currency, under the posted rate) runs from the base
  to the posted rate: "$18.05–19.70/hour" (part-time hourly pay) or a yearly range;
- one posted figure with no base is "up to" it: "up to $19.70/hour";
- a posted range keeps both its ends.

The pill shows that range, the muted line under it reads "with top shift pay", and the tip says "The posted rate
includes the highest shift differential." with the stated base. The drawer heading reads the same figure ("$18.05–19.70
an hour"). A posting with ranges per place keeps its span and place count, with the shift note in its tip. Stated
minimums and on-target earnings are unchanged. The CSV writes the same range (server/export.js `salaryRange`).
MR-35: hourly rates in these tips keep their posted cents (`hourlyText`: "$18.05/hour", it was "$18/hour").

**The card's dot under company colouring (`public/app.js card`, UX-50):** when the list is coloured by company (Group
by Company, `colorBy() === 'brand'`), the card's meta names the company first, beside its company-coloured dot:
"YouTube · User Experience and Design". The department still gives way first on a narrow card (UX-16); other
groupings are unchanged.

## fix-mr-3 additions (2026-10-23): fixed-term pay, headline medians, NYC-area towns and build-day freshness (fix-mr-3 lane)

Findings MR-21, MR-22 ([docs/process/methodology-review-beta.md](process/methodology-review-beta.md)) and MR-26, MR-29 (the UI
half), MR-33, MR-37, MR-38, MR-39, MR-40 and MR-41 ([docs/process/methodology-review-beta-2.md](process/methodology-review-beta-2.md)).
Log: [docs/process/fix-mr-3.md](process/fix-mr-3.md). Every addition is optional for readers; no export changed its return shape.
`NORMALIZER_VERSION` is `norm-13` (the gazetteer moved 43 towns, and titles are on one line, T-17): stored older snapshots
are re-derived once. Nothing is dropped:
every posting, pay row and place string is kept; one Microsoft posting gains the second range it posts (1,821 → 1,822 rows).

**Fixed-term pay of unstated length (MR-38, `public/features/shared.js`):** `isTermUnstated(job)` is true for a posting at level
`'Intern'` paid by the hour, day, week or month (`salary.originalInterval`) with no `termWeeks`, no stipend and no `partTime`.
`isFixedTerm(job)` includes it; `isInternLike` is unchanged (the market cells and Compstimate's pools are unchanged). Job fields are
unchanged: `salary.min/max` stay annualized.

**App (`public/app.js`):**
- `postedTerm(s, job = null)`: with `job`, a term of unstated length returns `{ amount, per, weeks: null, weeksMax: null, fixed,
  toTerm: null, unstated: true }`. Every caller passes the job (the card pill, `cardTerm`, `payUnit`, the drawer, the Juice block).
  `isTerm(j)` includes it, so such a posting is out of the drawer's rank and strip pools, like any fixed-term pay.
- The pay block shows it as posted ("$6,688–10,800 a month", "USD · length not stated", "Fixed-term pay, not a yearly salary";
  hourly: "Paid by the hour"); the card has no term tag for it; the Juice block shows Monthly only (no period toggle) and says why.
- `approxLine(job, own, fullTime)` (MR-33): the drawer's "≈ … in US dollars" line converts fixed-term pay at its posted interval
  ("≈ $6,025 a month" for amazon:10544548's €5,233 a month, "≈ $78K a year", "≈ $15K for the whole term"); "in US dollars" is hidden while the line would wrap
  (`dropWhenWrapped`), and the tip keeps it.
- `annualNote` (MR-37): a stated yearly figure (`salary.statedAnnual`) reads "Stated as a yearly figure"; its Details quote the
  posting and its payments a year ("paid as 14 monthly payments of €3,358.33, not 12").
- `stats(list, F)` (MR-39) adds `basis` (the main pay currency when the paid postings in view use two or more, else null), `basisN`
  and `basisLeft`; the median and quartiles are the basis currency's. The stats line reads "$152K base pay median (US)" (short, within fix-density's 12 words) and
  its Details say how many roles the median is of and how many are left out. `payBasisPlace` is imported from `viz/chart.js`.
- The stats line's Details (also the chart notes' Details) say, on a board whose departments are read from titles, "Google doesn't
  publish departments, so its roles are grouped by what their titles say." (MR-29).
- `MID_EXAMPLE` and `SEN_TIP.Mid` (MR-41): the Mid chip's tip gives the board's own example (Google "III", Amazon "II", Microsoft
  "IC3", NVIDIA "Level 2", Netflix "L4", else "II" or "L4").

**Shared and Insights (MR-39):** `mainPayCurrency(currencies) -> code | null` (`shared.js`): the most common currency when there are
two or more (USD on a tie), the chart rows' rule (`chart.js mainBasis`, V-21). `insights.js summaryStats(jobs)` adds `basis` and
`basisN`; `median`, `p25` and `p75` are the basis currency's, `salaried` and `payShare` still count every country. The tiles read
"of 12,529 in the US" and "of roles in the US" (Amazon, 2026-10-16: $152K of 12,529 US base-pay ranges, was $149K of all 13,045). The chart's caption (`public/viz/chart.js` `headPay`, `medianBasis`) uses the same basis: the strip's "Median base pay $152K US",
the phone's axis line "US dollars a year · median $152K US", and its tip says how many postings are paid elsewhere; the left-out
counts by kind (MR-28) stay the whole chart's.

**Locations (`server/geo.js`, MR-40):** 43 New York, New Jersey and Connecticut towns within about 80 km of Manhattan (the 2026-10-16
crawl's towns that were at their state's centre) are gazetteer cities. A `CITIES_RAW` name prefixed with `?` is read only with its
own state named: never bare, never by its country alone, never to split a comma list and never in the last-resort scan. On the
2026-10-16 crawl 101 postings change, latitude and longitude only. `GAZETTEER_SIZE` is 384 cities.

**Titles (`server/normalize.js`, T-17, from the test-suite review):** `cleanTitle(title)`: a line break and the spaces around it
before a comma or period go, every other run of whitespace (line breaks, non-breaking spaces, double spaces) is one space, and
the ends are trimmed; the words and their order are kept, and so is a space the posting itself puts before a comma ("Technician
, AWS"). `normalizeJob` writes it, and `relabelJobs` applies it to stored titles. On the 2026-10-16 crawl 362 titles change
(3 line breaks: meta:1747806499828365, amazon:10538351, amazon:10574668; 340 runs of spaces; 19 non-breaking spaces); the history
ledger's fingerprints do not change (`normText` already reads whitespace as one space). Golden: 3 of the 300 hashes changed, all
titles with a double space.

**Freshness (`scripts/refresh/lib.js`, MR-26):** `isPipelineEntry(entry)` (cadence `daily`) and `shownOverdue(entry, now)`. A daily
pipeline entry (the postings) is never "update due" on the page built from it: `run.js` `stalenessRows` and `genericResult`, the
methodology's sources table (`methodology-figures.js loadFigureInputs`) and `api/freshness.json` (`derived.js publicFreshness`:
`stale: false`, `staleAfter: null`).

**Market doc (`scripts/build-market.js`, MR-22):** `fx.source` is `palette.js FX_SOURCE` (the rates' own source), not a code path.
**Registry tool (`scripts/refresh/registry.js`, MR-21):** the usage header lists `--docs [--write]`.

## fix-salary-6 additions (2026-10-24): pay posted for several countries or places (fix-salary-6 lane)

Finding S-1 (persona review, persona-beta-2-45-54): pay posted for two or more countries kept one country's line, so under a
Location filter the site said the pay wasn't posted for a place the posting prices. Log: [docs/process/fix-salary-6.md](process/fix-salary-6.md).
Every addition is optional for readers; no export changed its signature. `NORMALIZER_VERSION` is `norm-14`: stored older snapshots
are re-derived once. Nothing is dropped: every posting, pay figure, quarantine flag and stored row is kept; the headline salary
(`min`, `max`, `mid`, `currency`, `country`) is unchanged for every posting of the 2026-10-16 crawl.

**Job `salary`:**

| Field | Meaning |
|---|---|
| `ranges[]` | Also set from a posting's pay lines for two or more countries or pay areas (Google "Germany: €150000 - €153000 (EUR)" and "Italy: €124000 - €127000 (EUR)", Microsoft "across Ireland" and "across Spain", NVIDIA "Italy: The base salary range is …"): one row per line with the job's places in its country or area (`locations`), yearly, in the line's own currency, named for the country as posted (`label`: "Germany", "US"), or for its places when the country also has an SF Bay Area / NYC line (SB-5). Rows are set only when two or more lines price places the job lists |
| `ranges[].country` | ISO code of the country the row's line names (new) |
| `ranges[].levels` | `[{ label, min, max }]`, yearly: the row's own levels or degrees (Microsoft's IC5 and IC6 of its SF Bay Area / NYC range, Google's "[Bachelor's degree]" lines for one country) (new) |
| `ranges[].currency` | May differ from `salary.currency` ("Canada: $150000 - $153000 (CAD)" beside the US line). A span is only taken over rows in one currency |
| `unlisted` | `[{ label, min, max, currency, interval: 'year', country?, areas?, outside?, levels? }]`: lines the posting states for a country or pay area none of the job's places is in (Microsoft's SF Bay Area / NYC range on a Redmond-only job, `areas: ['sf-bay', 'nyc']`; its U.S. range on a San Francisco-only job, `outside: ['sf-bay', 'nyc']`; "across Spain" on a Dublin-only job). Kept as posted and shown in the drawer's pay Details and the CSV; no figure, filter, comparison, payAt or Juice uses them (new) |
| `levels` | Also set when a "[Degree]" line of its own (or above bulleted country lines) heads the headline country's lines |
| `currency` | A "kr" or "$" with no code beside it is read by its own line's country ("across Denmark is kr …" is DKK), not the job's first such country |

Structured rows named for places but stored with none (Ashby's "Canada", "USA - All Other States", "Remote - US"; Scale AI's
Greenhouse rows, named from its text "in the locations of San Francisco, New York, Seattle is: …") get `locations` (the places
they name; DATA_SOURCES §7a). Amazon's rows are its adapter's (DQ-33) and are never tied by label.

**`server/salary.js`:** `parseSalary` adds `byPlace` when the text prices two or more places: `[{ country, label, areas?, min,
max, currency, interval, kind, text, levels?, head?, termWeeks?, termFactor?, intervalCorrected?, statedInterval? }]` in the posted
interval, in posted order; `head` marks the headline's line. New export `nationCode(name)`.

**`server/normalize.js`:** new exports `withPlaceRanges(salary, parsed, locations)` (the rows and `unlisted`; it also does SB-5's
split, which `withAreaRanges` still exports) and `tieRangePlaces(salary, locations, text)` (structured rows named for places).

**Juice (`server/juice.js#attachJuice`):** a place with its own row is matched to the row's currency and country (`ranges[].country`,
else `salary.country`) and scored on that row's midpoint in its currency: Milan on Italy's line, Toronto on the CAD line. When the
posting's priced places have no city record and every place that has one is in a country no row prices (Cohere's London beside its
"Canada" and "United States" rows), `juiceMissing` is `pay-other-country` again, as before the rows were tied.

**App (`public/app.js`):**
- `payRanges(s)` returns rows in any currency. `payHeadline` spans only the rows in `salary.currency`; with one such row the
  figure is that row and the tip says other places are paid in another currency. Pay by place writes each row in its currency.
- Under a Location filter `pickedRange` adds `rows` (the rows the figure is); the drawer's line under the figure names the picked
  row's currency ("Posted for Toronto · CAD · per year"), and Pay by level lists the picked row's own levels, none when it has none.
- The drawer's rank and strip (`percentile`, `payPool`) rank a picked row of another country among that country's roles
  (`rankSubject`): "Pays more than 88% of Google’s roles in Italy" under a Milan filter, never among the headline's country.
- The pay block's Details add one line per `salary.unlisted` entry: "The posting also gives pay for Spain: €38K–59.7K; this role
  isn’t listed there." (`unlistedNotes`).

**Open data CSV (`server/export.js#salaryRows`):** a row with its own levels lists them under its name ("Germany · Bachelor's
degree: 68500-68500 EUR"), and the salary's levels are then not listed again; `salary.unlisted` lines follow, marked "(not a
listed place)": "Spain (not a listed place): 38000-59700 EUR". `salary_min` / `salary_max` still span only rows in the salary's
currency.

## fix-ui-6 additions (2026-10-24): the card's dot, the job page's badge, the layout over 860 px, the Duo, the cover screen and the first screen (fix-ui-6 lane)

Round 4's backlog B-1 to B-7 ([docs/process/fix-phone-sizes.md](process/fix-phone-sizes.md) §6, [fix-qa4.md](process/fix-qa4.md) §6) and
persona wave 2's B-8 to B-12. Log: [docs/process/fix-ui-6.md](process/fix-ui-6.md). Job fields, `NORMALIZER_VERSION` and every export are
unchanged; no posting or pay row is hidden.

**The card (`public/app.js card`, B-1):** the meta line names first the key its dot is coloured for (`colorBy()`): the company
(UX-50), the level ("Senior · Software Engineering"), or, under Location colouring, the place ("Seattle, WA +2 · Software
Engineering": `locSummary(job, max, { coloured: true })` names the job's first on-site place, the chart's `keyOf` key, first).

**The job page (`public/app.js fitMetaLine`, B-2):** on the meta line the level badge sits 10 px after the text before it and the
tag 6 px after the badge (`.is-inline`); one that starts a line keeps M-51's 12 px. Run with `fitApplyLabel`.

**Keyboard and the filter sheet (B-3, B-4):** `body.kb-open` is also set over 860 px on a coarse pointer while a field is typed in,
and hides the sheet's "Show N roles" footer there. `setFiltersOpen` slides a sheet (below 1200 px) in first and renders a panel
that missed syncs while closed (PERF-2) just after the slide's first frame. `setRootVar(name, value)` writes a root custom
property only when it changes (`--vvh`, `--vvt`).

**Layout over 860 px (B-5, B-6):** a short touch screen over 860 px (max-height 500) has 16 px less space above and between the
chart toolbar's rows; from 861 to 1199 px the company menu has no role count and a saved snapshot's badge shows its date alone.

**The Surface Duo spanned (B-8):** a touch screen 1104–1124 px wide in landscape gets the dual-screen layout from the Duo's sizes
(540 | 34 | 540) when the browser reports no viewport segments; `screenSegments()` (`DUO_SPANNED`) gives `positionPopover` the
two screens. A browser that reports them gets the env() block, with the same numbers.

**Phones (B-9, B-10, B-12):** the results sheet's peek is measured (`fitSheet()`, a body-level `--sheet-peek`): down to the
first card's title and pay in chart mode (styles.css's 156 px until a card is there; the map keeps 84 px, landscape 64 px, the
Razr cover screen 104 px with the Juice line shown once the sheet is raised), and raised into the room a chart's rows leave,
never above half the screen. The chart's scroll box has its sticky axis's height as `scroll-padding-top`. The company menu
keeps the first saved search with new roles in view while it reveals the current company. On short portrait screens the
toast shows over the top bar.

**The arrival line (`renderTagline`, B-11):** the beta site's line says what the site is for: "Job postings, their posted pay, and
what's left after tax and rent" (12 words; short: "Job postings and their posted pay"; shortest: "Jobs and their posted pay"); its
title has the number of companies and the big-tech boards the beta adds. The main site's line is unchanged.

**The map's fit (`public/viz/map.js clearOfControls`, B-7):** a pin is its price tag and its pointer, down to the place
(`PIN_TIP`, 7 px), with `CONTROL_GAP` (2 px) of air from each control; a small pan is tried before zooming out, and a re-check
after a resize starts from unmerged pins.

## fix-app-6 additions (2026-10-23): facet counts per place, medians in the pay's currency, posted minimums, carried filters, posted levels and typed currencies (fix-app-6 lane)

Findings BN-1 to BN-8 from the persona reviews (wave 2) on e800c43. Log: [docs/process/fix-app-6.md](process/fix-app-6.md). Job fields and
`NORMALIZER_VERSION` are unchanged; every addition is optional for readers (URL state gains `sc`). Nothing is dropped: the filters only filter, and every posting and
pay row is kept.

**Facet counts (`public/app.js derive`, BN-1):** a facet's counts ignore its own selection, so a place's count is what picking that place alone
shows. The pay filter and the Juice grade are judged at the places the Location filter picks (`payHere`, `shownJuice`), so for the Location
counts they are judged at each counted place (`judgeAtPlace(F, jobs)`: a spec whose `l` is that one place; `countPlaces`). Before, a posting
listed elsewhere failed both the Location and the pay filter and was never counted (Google + Warsaw + $40K: Dublin 2, alone 137), and one listed
in Warsaw and Dublin counted for Dublin at Warsaw's pay. Every other facet (department, company, level, employment type, Remote, listing date,
Juice) was checked the same way and was already right. The Location list's search box shows by the board's own number of places
(`boardOptions(facet)`), not by how many the filters leave.

**Country- and state-wide postings in the place counts (BN-1, the lead's addition):** I-6 (fix-app) stands: a city pick finds postings listed
only for its country or region, and the count it shows is what the pick finds. `derive().fc.lWide` (key -> n) is that part, and the Location
list shows a place's own postings with it beside them, "Palmetto 3 +294" (`.check-count` is the own count, `.check-wide` the rest; the row's
title says what the second number is); the list sorts by the own count. Under a Location filter the map's pins do the same (`pinCount(c)`:
"83+294"; `aggregate`'s `wide` no longer holds a posting that also names the place, and a cluster drops one that names any of its places).

**Pay filter (`salWhy(j, F)`, BN-6):** `'none' | 'elsewhere' | 'under' | 'over' | null`, why the pay filter hides a posting. A posted minimum
(`salary.kind: 'minimum'`, "from €31,100") states no top, so a minimum never hides it; pay stated "up to" one figure (`shiftRange(s).upTo`) states
no bottom, so a maximum never hides it. `derive().fc.salWhy` counts the roles the pay filter alone hides, by reason; the Salary note's line counts
them all and its Details say why. The empty state names every filter whose removal alone brings roles back, the pay filter included
(`emptyState`, fitted to one line, each count in its Details).

**Headline medians (`public/features/shared.js headlineMedian(pool)`, `medianText(h, v)`, `currencyWords(cur)`, BN-2 and BN-4):** one rule for
the stats line (`stats()` adds `cur`, `local`, `perHour`, `fullTime`, `hm`), Insights' tiles (`summaryStats()` adds `cur`, `local`, `hm`), the
chart's caption (`headPay`, `capMedian`) and the map's pins (`summarize()` adds `price`, `cur`, `basis`, `onlyText`). MR-39's basis is kept
(two or more currencies: the main one's median). The median is written in the currency of the postings it is of, as the cards write pay
("CA$101K" over Canadian pay, "€81K (euro area)" when euros are the main currency of several), never a bare "$" for converted pay; the
approx-USD figure stays for positions and colours. When every figure is part-time hourly pay (a year if full-time), the median is per hour as
posted ("$28.41/hour posted pay median"); when only some are, the line says "median, a year if full-time" (shorter where it would wrap), and
its Details never call it base pay. `basePayStats` adds `pool` (the items its median is of).

**Typed currency (BN-8):** URL state `sc` (the currency the pay bounds were typed in) with `smin`/`smax` as typed ("smin=150000&sc=PLN");
`S.smin`/`S.smax` stay approx US dollars (`usdOf`, rounded to $1K, as before), so the filter is unchanged, and a link without `sc` is in
dollars and opens the same filter as before. `S.smn`/`S.smx` hold the typed amounts; `payNative(st)` returns `{ cur, min, max }` while they
still give the dollar bounds (a bound set since by the slider is moved in that currency; a reset falls back to dollars). The chip, the saved
search's name and the company switch's toast read `quickLabel('salary')` ("PLN 150K+", "£75K+"); the boxes, the Salary note and the empty
state read `boundText`. `parsePay` reads "zł" and thousands grouped by spaces, dots or apostrophes, and returns `given` (the text named a
currency); a bare number takes the currency of the pay in view when it is all in one (`viewPayCurrency`, BN-2's rule), else dollars.

**Locale (BN-3):** the stats line's count is the word alone ("roles"); it cut the number off `plural()` with a digits-and-commas pattern, so
any locale whose separator isn't a comma showed it twice ("3.821 3.821 roles" in de-DE, "3 821 3 821" in fr-FR, "3’821" in de-CH).

**Carried filters (`settleKeep`, BN-5):** a list facet (places, departments, levels, employment types, keywords, Juice) keeps the values it set
aside at a company switch while the person ticks or unticks others, as the toast's "for now" said; a one-value filter (role family, Remote,
listing date) drops them once another value replaces it. Clear all and a facet's Reset drop them and say so ("Also dropped Krakow, set aside
from an earlier company"). Held items carry `from`, the board where they were in force.

**Posted levels (`public/features/roles.js postedLevels(job)`, `POSTED_LADDERS`, BN-7):** for a posting whose level comes from the company's
own ladder in its pay (`seniorityBasis: 'pay'`: Microsoft IC/M, NVIDIA Level n), `{ labels, levels, text }`: "Microsoft M5–M6" is Manager and
Director+. The ladders are copies of server/keywords.js's (checked rung by rung by test/fix-app-6.test.js). The Seniority filter finds such a
posting under each of its levels (`senKeys(j)`) and counts it under each; its shown level stays the lower one (VT-8, keywords.js). The drawer's
level chip reads "Manager · Microsoft M5–M6", and "What the levels mean" says the company's own level comes first.
