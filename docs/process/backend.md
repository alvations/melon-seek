# Process log: backend

## 1. Brief
Prompt: [`docs/process/prompts/backend.md`](prompts/backend.md) (verbatim, plus two coordinator follow-ups).
Goal: Node (no deps) HTTP server + job-board adapters (Greenhouse, Ashby, Lever), salary parsing,
normalization to the contract `Job` shape, cache, fallbacks (cache -> live -> stale -> snapshot -> demo),
and a snapshot script.

Files owned: `server/index.js`, `server/companies.js`, `server/sources/{greenhouse,ashby,lever,util}.js`,
`server/salary.js`, `server/normalize.js`, `server/cache.js`, `scripts/snapshot.js`,
`test/{salary,sources,server}.test.js`, `test/fixtures/{greenhouse-jobs,ashby-board,lever-postings}.json`.

## 2. Inputs and sources
- `docs/CONTRACT.md`: RawJob/Job shapes, module interfaces, HTTP API, fallback order. This is the source of truth.
- `server/geo.js`, `server/keywords.js`, `server/demo.js` (written by the features engineer): imported through
  their contract interfaces only. I checked that `geocode()` returns `{name, city, region, country, lat, lng, remote}`.
- Public API shapes came from the field lists in the prompt plus what I already knew about the APIs. I could not
  reach the APIs live because the sandbox egress policy blocks them, so I made the fixtures by hand to match the
  documented shapes. Greenhouse `pay_input_ranges` (`min_cents`, `max_cents`, `currency_type`, `title`, `blurb`)
  needs `&pay_transparency=true`.
- No skills loaded; no dependencies added.

## 3. Decisions and rationale
1. **Shared adapter helpers** live in `server/sources/util.js`: `fetchJson`, `decodeHtmlContent`, `htmlToText`, `str`.
   This is one extra backend file that the contract does not list. It avoids writing the same code three times.
   `fetchJson` uses an AbortController with a 15 s timeout, sends `User-Agent: melon-seek/0.1 ...`, and puts the
   `source/board` label, URL, status and the first 200 chars of the body into its errors. A 404 adds a hint to check the slug.
2. **Greenhouse decoding.** Each pass decodes named, decimal and hex entities. Up to 3 passes run while the string
   still looks escaped (`/&lt;\/?[a-z!]/i` or `/&amp;(#?\w+);/i`). This handles double escaping
   (`&amp;lt;p&amp;gt;`) and leaves legitimate `&amp;` in real HTML alone.
   Greenhouse URL adds `&pay_transparency=true`, a small deviation from the prompt, so that `pay_input_ranges`
   is returned when the board has it. `offices[].location||name` go into `extraLocations` when they are not
   already in `location.name`. Metadata matching `/employment type|job type|commitment/i` sets `employmentType`,
   and `/remote|workplace/i` sets the remote flag. Raw `metadata` is passed through as an extra field.
3. **Ashby.** Skips `isListed === false`. The salary comes from the first `compensationType` matching `/salary/i` in
   `summaryComponents`, or else in `compensationTiers[].components`. Interval `"1 YEAR"`/`"1 HOUR"` maps to year/hour.
   The text comes from `compensationTierSummary`. `employmentType` `FullTime` becomes `Full-time`.
   `remote` is set from `isRemote` or a `workplaceType` containing "remote".
4. **Lever.** html = description + `<h3>{text}</h3><ul>{content}</ul>` for each list + additional.
   `createdAt` (ms) is converted to ISO. The `salaryRange.interval` string (e.g. `per-year-salary`) is mapped by
   substring. `workplaceType` remote sets true, onsite/hybrid sets false.
5. **Salary parser** (`server/salary.js`) works in three steps: tokenize amounts, pair them into ranges, then score.
   - Amount regex: `(?<![A-Za-z0-9])(CUR_PRE)?\s?(NUM)(MULT)?(CUR_SUF)?`, where
     `CUR_PRE = CA$|C$|CAD|US$|USD|AU$|A$|AUD|GBP|EUR|$|£|€`,
     `NUM = \d{1,3}(?:[,.  ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`
     (3-digit groups after `,` or `.` are thousands separators, so `€80.000` is 80000; a 1–2 digit tail is a decimal),
     `MULT = k|m|mm|b|bn|thousand|million|billion` (a letter suffix only when no letter follows, so `401(k)` never
     matches because of the parenthesis), and `CUR_SUF = USD|CAD|GBP|EUR|AUD|€|£`.
     A suffix code overrides a plain `$`, so `$150,000 - $180,000 CAD` is CAD.
   - Range separator between two adjacent amounts: `/^\s*(?:[-–—‒―~]|to|and|through|until)\s*$/i`.
     The multiplier carries over to the other side when that side is < 1000 (`$310-385K`).
   - Interval: the nearest marker in the 35 chars after the amount, else the latest one in the 60 chars before.
     Markers are hour (`/hr`, `per hour`, `hourly`), day, week, month (`/mo`, `monthly`, `pcm`) and
     year (`annual`, `per annum`, `p.a.`, `OTE`). With no marker, max < 1000 is treated as hourly,
     a range with max < 10000 as monthly, and anything else as yearly.
   - Score: range +3, currency +2, pay word in the 100 chars before
     (`salary|compensation|pay|paid|base|wage|rate|range|ote|earnings|remuneration|annual|hourly`) +3,
     and +1 more if it is within 35 chars. A negative word in the 60 chars before
     (`raised|funding|series [a-f]|valuation|revenue|backed|invest*|bonus|equity|stock|relocation|stipend|allowance|budget|grant|arr|customers|users|401`)
     scores −6, as does a funding-type word right after (`$5M in funding`). An explicit interval adds +1,
     a K/M multiplier +0.5, and a max/min ratio > 5 scores −2.
     Bare numbers with no currency need a pay word nearby and must form a range.
     A candidate needs score ≥ 2, and its annualized min ≥ 10,000 and max ≤ 5,000,000. The highest score wins,
     and ties go to the earliest.
   - `parseSalary` returns values in the **original interval** (`{min:60,max:75,interval:"hour"}`).
     `toJobSalary` then annualizes them (hour×2080, day×260, week×52, month×12) into the Job shape with `mid`
     and `interval:"year"`. When the source was not yearly it adds an extra `originalInterval` field so the UI can say "hourly".
6. **normalize.** Locations come from `geocode(locationText)` plus each `extraLocation`. They are deduped by name
   and by resolved `city|country`, so "San Francisco" and "San Francisco, CA" collapse into one.
   The salary is `toJobSalary(raw.salary) || toJobSalary(parseSalary(text))`. Each call into keywords/geo is wrapped
   in try/catch with an empty fallback, so a bug in another module cannot take down `/api/jobs`.
   `normalizeJobs` drops duplicate ids.
7. **cache.** `data/cache/<slug>.json = {fetchedAt, data: Job[]}` plus an in-memory Map. Writes are atomic
   (tmp file, then rename). The TTL is 30 min. The directory can be overridden with `MELON_CACHE_DIR` or `setCacheDir()`.
8. **server.** Uses `node:http` only. Concurrent live fetches for the same slug are deduped through an in-flight map.
   A stale cache is served with mode `"cache"` and a non-null `error`.
   `data/snapshots/<slug>.json` (directory overridable with `MELON_SNAPSHOT_DIR`) can be the full response or an
   array of jobs. Demo jobs go through the same `normalizeJobs`.
   Static path safety: the path is decoded, NULs are rejected, it goes through `posix.normalize('/'+p)` and
   `path.resolve`, and the result must start with the base dir. Responses over 1 KB of text or JSON are gzipped
   when the client accepts it. All responses send `Cache-Control: no-cache`, and each request logs one line
   (`GET /url 200 12ms`). `PORT` defaults to 5173. The server only listens when the file is run directly.
   Custom company slug = `<source>-<board>`. A custom source/board that matches a built-in resolves to the built-in.
   Extra route: `/api/health`.
9. **snapshot script.** `npm run snapshot -- anthropic anduril openai` runs the given slugs; with no args it runs
   every built-in. A `source:board` argument selects a custom board. It writes only live results; a failed or
   empty fetch is logged and skipped, so it never writes demo data. It exits 1 only if every slug failed.

## 4. Replayable steps
```sh
cd /home/user/melon-seek
# fixtures were generated with a one-off python3 script (html.escape on hand-written descriptions;
# Anduril job is double-escaped). Files: test/fixtures/*.json
node --test test/salary.test.js test/sources.test.js test/server.test.js   # 29 pass
PORT=5999 node server/index.js &   # then:
curl -s 'localhost:5999/api/jobs?company=openai' | head -c 300   # mode "demo", error "Live fetch failed: ashby/openai: HTTP 403 ... Host not in allowlist"
node scripts/snapshot.js anthropic  # sandbox: ✗ 403, "1/1 snapshot(s) failed", exit 1, nothing written
```
Note: on Node 22, `node --test test/` (the `npm test` script) fails with "Cannot find module .../test".
A directory argument is treated as a file. Use `node --test` (no args), or a glob such as `node --test test/*.test.js`.

## 5. Verification
- `node --test test/salary.test.js test/sources.test.js test/server.test.js`: **29 pass, 0 fail, 0 skip**
  (with the real geo/keywords/demo in place). Before demo.js existed, the server tests skipped cleanly (7 skipped).
- Server tests mock global `fetch`: the Lever "example" board returns the fixture and every other host throws.
  Covered: `/api/companies`, demo fallback with an error string, snapshot used before demo,
  live then fresh cache for a custom Lever board, 400/404 validation, static MIME types and `/vendor/leaflet/`,
  4 traversal attempts returning 403/404, and gzip.
- Manual run against the real demo data: anthropic 111 jobs (96 with salary), anduril 120 (105), openai 120 (110).
  All jobs have locations. The demo jobs without a salary contain no currency amounts, so they are meant to have none.

## 6. Known gaps and follow-ups
- Adapters have not been checked against real live responses, because the hosts are blocked here.
  Run `npm run snapshot` where the network is open and spot-check the Greenhouse pay-range parsing on real Anthropic/Anduril postings.
- Salary picks a single range. When a posting lists different ranges per location, the first-scored one wins.
- `npm test` script (`node --test test/`) is broken on Node 22; the lead owns `package.json`.
- Contract deviations: extra file `server/sources/util.js`, extra `originalInterval` salary field, extra
  `metadata`/`compensationSummary` fields on raw jobs, `/api/health` route, `custom:true` on internal custom
  company objects (not exposed in the API), and `pay_transparency=true` on the Greenhouse URL.

## 7. Change log
- 2026-10-02 05:05 UTC: companies, adapters, salary, normalize, cache, server, snapshot, tests written.
- 2026-10-02 05:25: snapshot script exits non-zero only if every slug fails, never writes fallback data, and treats 0 jobs as a failure.
- 2026-10-02 05:28: server test mock fixed (the mock now stays installed for the server; the test client uses the real fetch).
- 2026-10-02 05:30: location dedupe also by resolved city.
- 2026-10-02 05:34: full suite green with the real geo/keywords/demo modules; process docs written.
