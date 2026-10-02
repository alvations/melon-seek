# melon-seek

**Zillow for job postings.** Pick a company, and melon-seek pulls its public job
board and plots every posting the way a real-estate site plots listings: by
price (salary), by neighbourhood (location), and by features (skills,
responsibilities, fit).

- **Chart mode (default)** — every job is a horizontal min–max salary bar on a
  shared salary axis, sorted by midpoint and optionally grouped/coloured by
  department, location or seniority. Hover for details, click to open the job.
- **Map mode** — Zillow-style price-tag pins per city (`$352K · 12`), clustered
  by location, with remote roles collected in a separate "Remote" badge.
- **Zillow-like filters** — salary range, responsibilities, fit / requirements,
  skills keywords, department, location, seniority. Filter and view state lives
  in the URL hash, so any view is shareable.
- **Company switcher** — built-in Anthropic, Anduril and OpenAI, plus
  **Add board** for any custom Greenhouse, Ashby or Lever board slug.

Zero build step, Node >= 18, one runtime dependency (`leaflet`).

## Screenshots

<!-- Images to be added by the project lead. -->

| Chart mode | Map mode |
| --- | --- |
| ![Chart mode](docs/screenshots/chart.png) | ![Map mode](docs/screenshots/map.png) |

## Quick start

```sh
npm install && npm start
# open http://localhost:5173
```

`npm run dev` restarts the server on file changes (`node --watch`). Set `PORT`
to change the port (default `5173`).

With Docker:

```sh
docker build -t melon-seek .
docker run --rm -p 5173:5173 melon-seek
```

## Data modes

Every `/api/jobs` response carries a `mode` telling you where the data came from.
The server tries, in order:

| Mode | Source | When |
| --- | --- | --- |
| `cache` | In-memory / disk cache (`data/cache/`) | A fetch younger than 30 minutes exists. Stale disk cache is also used if the live fetch fails. |
| `live` | The company's public job board API | Cache missing or expired (or `?refresh=1`). |
| `snapshot` | `data/snapshots/<slug>.json` | Live fetch failed and no disk cache exists. |
| `demo` | Synthetic, deterministic jobs from `server/demo.js` | Nothing else is available (e.g. boards unreachable, offline sandbox). |

**Demo data is fake.** It exists so the whole pipeline (salary parsing, geo,
keywords, chart, map) can be exercised offline. The API marks it
`mode: "demo"` and the UI labels it clearly; it is never presented as a real
posting.

### Snapshots

```sh
npm run snapshot                              # built-in companies
npm run snapshot -- anthropic anduril openai  # explicit list
npm run snapshot -- lever:acme                # custom board as <source>:<board>
```

Only live data is ever written; if a fetch fails (or returns 0 jobs) the
existing snapshot is kept, and demo data never ends up in `data/snapshots/`.

This fetches live data and writes `data/snapshots/<slug>.json`, which is
committed to the repo so a fresh checkout has real data even without network
access. The [`snapshot` workflow](.github/workflows/snapshot.yml) runs this
daily on GitHub Actions (whose runners can reach the boards) and commits any
changes.

## Tests

```sh
npm test   # node --test test/
```

CI ([`ci.yml`](.github/workflows/ci.yml)) runs the tests on Node 20 and 22 and
smoke-tests the running server (`/api/companies`, `/api/jobs?company=anthropic`).

## API reference

### `GET /api/companies`

```json
[{ "slug": "anthropic", "name": "Anthropic", "source": "greenhouse", "board": "anthropic", "color": "#d97757" }]
```

Built-ins: `anthropic` (greenhouse/`anthropic`), `anduril`
(greenhouse/`andurilindustries`), `openai` (ashby/`openai`).

### `GET /api/jobs`

| Query | Meaning |
| --- | --- |
| `company=anthropic` | A built-in company. |
| `source=greenhouse\|ashby\|lever&board=<slug>[&name=Display]` | A custom board. |
| `refresh=1` | Bypass the fresh cache and fetch live. |

Response:

```js
{
  company: { slug, name, source, board, color },
  mode: "live" | "cache" | "snapshot" | "demo",
  fetchedAt,               // ISO timestamp
  error: string | null,    // why live failed, if it did
  jobs: Job[]
}
```

`Job`:

```js
{
  id: "anthropic:4012345",
  company: "anthropic", companyName: "Anthropic",
  title, department, team, employmentType,
  seniority: "Intern"|"Entry"|"Mid"|"Senior"|"Staff+"|"Manager"|"Director+",
  locations: [{ name: "San Francisco, CA", city: "San Francisco", region: "CA",
                country: "US", lat: 37.77, lng: -122.42, remote: false }],
  remote: boolean,
  salary: { min: 300000, max: 405000, mid: 352500, currency: "USD",
            interval: "year", text: "$300,000—$405,000 USD" } | null,
            // min/max are annualized (hourly × 2080, monthly × 12)
  url, updatedAt,
  descriptionHtml,
  sections: { responsibilities: [string], fit: [string] },
  keywords: { responsibilities: [string], fit: [string], skills: [string] }
}
```

Errors: `400` for a missing/invalid `company`, `source` or `board`; `404` for an
unknown built-in company.

### Static

- `/` → `public/`
- `/vendor/leaflet/*` → `node_modules/leaflet/dist/*`

## Project layout

```
server/index.js            HTTP server (static + API)
server/companies.js        company registry + custom-board validation
server/sources/            board adapters: greenhouse.js, ashby.js, lever.js (+ util.js)
server/normalize.js        raw job -> Job (salary, geo, keywords)
server/salary.js           salary text parsing + annualizing
server/geo.js              location strings -> coordinates (built-in gazetteer)
server/keywords.js         responsibilities/fit sections, keyword facets, seniority
server/cache.js            memory + disk cache (data/cache/, gitignored)
server/demo.js             synthetic offline demo jobs
scripts/snapshot.js        npm run snapshot -> data/snapshots/*.json
public/                    index.html, styles.css, app.js (state, filters, list, drawer)
public/viz/                palette.js, chart.js, map.js
test/*.test.js             node --test
docs/                      CONTRACT.md, ARCHITECTURE.md, ADDING_A_BOARD.md
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/ADDING_A_BOARD.md](docs/ADDING_A_BOARD.md) ·
[docs/CONTRACT.md](docs/CONTRACT.md).

## Data sources

All data comes from public, unauthenticated job-board APIs that the companies
themselves publish for embedding their careers pages:

| Source | Endpoint |
| --- | --- |
| Greenhouse boards API | `https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true` |
| Ashby posting API | `https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true` |
| Lever postings API | `https://api.lever.co/v0/postings/{board}?mode=json` |

`openai.com/careers/search` is backed by the Ashby board `openai`.

### Responsible use

melon-seek only reads public endpoints, sends an identifying `User-Agent`, and
caches each board for **30 minutes** (memory + disk) so normal browsing makes at
most one request per board per half hour. Please keep it that way: don't lower
the cache TTL or poll boards in a loop. Postings belong to the respective
companies; always apply via the original posting URL.
