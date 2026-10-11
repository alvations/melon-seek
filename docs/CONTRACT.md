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
| Market comps (F1) | `GET /api/market` | `api/market.json` (≤150 KB, vetted salaries only, n ≥ 3 per cell, USD, `basis: "posted base pay ranges"`) |
| History (F4) | merged on the server | `api/history/<slug>.json`: `id → [firstSeenAt, postedAt, repostCount]` |
| CSV (F7) | `GET /api/export?company=` | `data/<slug>.csv` plus `data/README.txt` |
| Browser lib | `GET /lib/<allowlisted>.js` | `lib/*.js` (allowlist in `server/lib-modules.js`) |

**Packed list format:** `melon-packed-1` becomes `melon-packed-2` with the
fields above, and the build's round-trip check covers them.

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
- A posted range above $1.2M written out in full with a pay word in its clause is read, so the
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
