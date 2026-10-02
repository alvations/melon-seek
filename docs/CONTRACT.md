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
