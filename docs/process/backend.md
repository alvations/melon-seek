# Process log: backend

## 1. Brief
Prompt: [`docs/process/prompts/backend.md`](prompts/backend.md) (verbatim, plus two coordinator follow-ups).
Goal: Node (no deps) HTTP server + job-board adapters (Greenhouse, Ashby, Lever), salary parsing,
normalization to the contract `Job` shape, cache, fallbacks (cache -> live -> stale -> snapshot -> demo),
and a snapshot script.

Files owned: `server/index.js`, `server/companies.js`, `server/sources/{greenhouse,ashby,lever,util}.js`,
`server/salary.js`, `server/normalize.js`, `server/cache.js`, `scripts/snapshot.js`,
`test/{salary,sources,server}.test.js`, `test/fixtures/{greenhouse-jobs,greenhouse-pay-ranges,ashby-board,lever-postings}.json`.

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
9. **Review fixes (docs/REVIEW.md, server side).**
   - *H1 cache bounds and throttling:* custom boards are kept in an in-memory LRU of at most `MELON_CACHE_MAX`
     entries (default 50). Built-ins are never evicted. Their disk files go in `data/cache/custom/`, pruned to the
     `MELON_DISK_CACHE_MAX` (default 100) most recently used files by mtime; a read hit touches the mtime.
     There is at most one live upstream attempt per slug per `MIN_REFRESH_MS` (60 s, env `MELON_MIN_REFRESH_MS`),
     whether or not `refresh=1` is set. A throttled request is served from cache, snapshot or demo, with the last
     attempt's error. The one exception: if the last attempt succeeded but its cache entry has since been evicted,
     a new attempt is allowed. A custom board that fell back to demo is negative-cached for 10 min (bounded to 200).
     Normalized demo jobs are memoized per slug, so repeat requests do not regenerate them.
   - *M2 security headers:* `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
     `COOP: same-origin` and `Permissions-Policy` are set on every response, including streamed files.
     The CSP is `default-src 'self'; script-src 'self'; style-src(-elem) 'self' fonts.googleapis.com;
     style-src-attr 'unsafe-inline'` (needed because app.js uses `setAttribute('style')`); `font-src 'self'
     fonts.gstatic.com; img-src 'self' data: *.basemaps.cartocdn.com tile.openstreetmap.org *.tile.openstreetmap.org;
     connect-src 'self' boards-api.greenhouse.io api.ashbyhq.com api.lever.co; object-src 'none'; base-uri 'none';
     form-action 'self'; frame-ancestors 'none'`. Hosts were taken from `public/viz/map.js`, `public/index.html`
     and `public/api.js`.
   - *L1:* the slug regex is now `/^[a-z0-9](?:[a-z0-9_.-]{0,98}[a-z0-9])?$/i` and slugs containing `..` are
     rejected, so `.`, `..`, leading or trailing punctuation and more than 100 chars all fail.
   - *L2:* `fetch(..., { redirect: 'error' })`. The body is read through a stream reader and capped at 25 MB, using
     both `content-length` and a running count (Palantir's list is over 5 MB). Decoding uses `TextDecoder`, not
     `Buffer`, so the module stays browser-safe. A global semaphore allows at most 4 concurrent upstream fetches
     (`withUpstreamSlot`).
   - *L3:* jobs are normalized and cached under a name-independent identity: `defaultName(board)` for custom boards.
     The caller's `?name=` is stamped onto `companyName` only in the response.
   - *L7:* adapters throw `UpstreamError {code: http|timeout|network|too_large|invalid_json|bad_shape, status}`.
     The detailed message goes to the server log (`[live] slug: ...`) and is still used by the snapshot CLI.
     Clients get `publicError()` text, for example `Live fetch failed: upstream returned HTTP 403` or
     `... board not found upstream (HTTP 404)`. A 500 returns `{"error":"Internal error"}`.
     The invalid-source 400 no longer echoes the input.
   - *L8:* `send()` is async and uses `promisify(zlib.gzip)`.
   - *C2:* a leading `//+` in the request target collapses to `/` before URL parsing. A target that does not start
     with `/` (absolute-form) gets 400. `HEAD /api/jobs` calls `getJobs(..., {offline: true})`, which never fetches
     upstream and does not touch the throttle or negative cache.
   - *Browser safety:* `server/normalize.js` reads `globalThis.process?.env?.DEBUG`, because the Pages build bundles
     normalize, salary, companies and sources into `dist/lib/`. A test checks that these files have no `node:`
     imports and no `process.`, `Buffer` or `__dirname`.
10. **Greenhouse `pay_input_ranges`** (docs/DATA_SOURCES.md §1). The `pay_transparency=true` flag stays on the
    list URL. Each item is `{min_cents, max_cents, currency_type, title, blurb}`: the amount is cents ÷ 100 and the
    currency comes from `currency_type`. The interval is `hour` if title or blurb mentions "hour", `month` if it
    mentions "month", and otherwise `year`. **With several ranges (location tiers), the salary spans the overall min
    and max** of the ranges that share the first range's currency and interval. The text is suffixed
    "(N ranges)". Other currencies are never mixed in. With no usable range, `salary` is null and normalize falls
    back to parsing the description text. The same fallback applies when the structured value fails the
    10k–5M annual bounds.
11. **More built-ins** (confirmed in docs/DATA_SOURCES.md §4): Scale AI `greenhouse/scaleai` #6e3cf2,
    xAI `greenhouse/xai` #3b3b3b, Cohere `ashby/cohere` #39594d, Palantir `lever/palantir` #101113,
    Shield AI `lever/shieldai` #1c6dd0. Colours are approximate brand colours.
    demo.js serves its generic catalog for these. Mistral AI (`lever/mistral`) was added and then removed: the
    first real-data run returned 0 jobs, so the slug is probably stale. See DATA_SOURCES.md "Could not confirm".
12. **Body cap and timeout per company.** The first real-data run failed for Anduril with "response exceeded
    26214400 bytes". `maxBytesFor(company)` now returns the company's own `maxBytes` if set, else **120 MB for
    built-ins** (`MAX_BYTES_BUILTIN`) and **25 MB for custom boards** (`MAX_BYTES`). Adapters take
    `(board, { maxBytes, timeoutMs })`. Built-ins also get a 45 s timeout (`BUILTIN_TIMEOUT_MS`), because a body
    that large may not finish within 15 s; custom boards keep 15 s.
13. **Juice Score data for the browser.** The lead decided juice is computed in `public/api.js` in both server
    and static mode, so the server only serves the inputs.
    - `data/cities.json` is loaded once when `createServer()` runs (path override: `MELON_CITIES_FILE`).
    - `GET /api/cities` serves the parsed and re-serialized document with `Cache-Control: public, max-age=3600`,
      an ETag (from mtime and size; `If-None-Match` gets a 304) and a gzip copy computed once per version.
    - Each request stats the file, and a change in mtime or size triggers a reload. If the new file fails to
      parse, the last good copy is kept and a warning is logged. If no copy was ever loaded, the route returns 503.
    - In server mode, `api.js` resolves `import('./lib/<module>.js')` to `/lib/...`. The server maps `/lib/<path>`
      to `server/<path>` for an explicit allowlist (`BROWSER_LIB`): companies, normalize, salary, geo, keywords,
      demo, juice, vet, and sources/{greenhouse,ashby,lever,util}. Anything else under `/lib/` is a 404, so
      `index.js` and `cache.js` are never served. Server mode therefore uses the same relative paths as `dist/lib/`.
      A test checks that the allowlist is closed under relative imports (juice → geo, normalize → vet → salary, ...).
14. **snapshot script.** `npm run snapshot -- anthropic anduril openai` runs the given slugs; with no args it runs
   every built-in. A `source:board` argument selects a custom board. It writes only live results; a failed or
   empty fetch is logged and skipped, so it never writes demo data. It exits 1 only if every slug failed.

## 4. Replayable steps
```sh
cd /home/user/melon-seek
# fixtures were generated with a one-off python3 script (html.escape on hand-written descriptions;
# Anduril job is double-escaped). Files: test/fixtures/*.json
npm test   # node --test test/*.test.js; my 3 files: 43 pass
node scripts/e2e.js --api-only   # 8/8
NODE_PATH=$(npm root -g) node scripts/e2e.js   # full UI e2e with Playwright, see §5
PORT=5999 node server/index.js &   # then:
curl -s 'localhost:5999/api/jobs?company=openai' | head -c 300   # mode "demo", error "Live fetch failed: upstream returned HTTP 403" (details in the server log)
node scripts/snapshot.js anthropic  # sandbox: ✗ 403, "1/1 snapshot(s) failed", exit 1, nothing written
```
Note: on Node 22, `node --test test/` fails with "Cannot find module .../test", because a directory argument is
treated as a file. The `npm test` script is now `node --test test/*.test.js`.

## 5. Verification
- `node --test test/salary.test.js test/sources.test.js test/server.test.js`: **29 pass, 0 fail, 0 skip**
  (with the real geo/keywords/demo in place). Before demo.js existed, the server tests skipped cleanly (7 skipped).
- Server tests mock global `fetch`: the Lever "example" board returns the fixture and every other host throws.
  Covered: `/api/companies`, demo fallback with an error string, snapshot used before demo,
  live then fresh cache for a custom Lever board, 400/404 validation, static MIME types and `/vendor/leaflet/`,
  4 traversal attempts returning 403/404, and gzip.
- After the review fixes: `npm test` gave **75 pass, 0 fail**. A later run gave 101 tests with 2 failing, both in the newly added `test/features.test.js` (weightedPercentile, not a backend file); my 3 files give 43 pass, 0 fail. My new tests cover: security headers and CSP hosts on
  API, static and streamed responses; `refresh=1` throttled to 1 upstream call in 4 requests; an unknown custom
  board making 1 upstream call in 4 requests (negative cache); generic client errors; caller name kept out of the
  memory and disk cache; HEAD making 0 upstream calls; `//api/companies` as a path and absolute-form getting 400;
  a 500 body without details (the details reach the log); a concurrency peak of 4 for 12 tasks; slug edge cases;
  `redirect: 'error'`; the body cap (content-length and streamed); typed errors; UTF-8 split across chunks;
  LRU eviction in memory and on disk; no Node APIs in the browser-bundled modules; pay_input_ranges tiers,
  hourly, empty with text fallback, and mixed currency; built-in list (9 at the time, now 8).
- `node scripts/e2e.js --api-only`: 8/8. Full e2e with CSP on (`NODE_PATH=$(npm root -g) node scripts/e2e.js`):
  18/21. The 3 failures (map pin area chip, salary-min filter cards, mobile Map button) are identical with the
  CSP header removed, tested in a scratch copy, so they are frontend issues, not caused by these changes. The
  "no console errors" UI check passes with the CSP on, so there are no CSP violations.
- First real-data run (GitHub Actions snapshot step, reported by the coordinator): anthropic 638 jobs (558 with
  salary), openai 833 (674), scaleai 194 (131), xai 297 (134), cohere 132 (132), palantir 320 (240),
  shieldai 581 (456). anduril failed on the 25 MB cap, which is now fixed (decision 12). mistral returned 0 jobs and was removed.
- Body-cap tests: `maxBytesFor` values; each adapter honours `maxBytes`; `fetchLive` passes 120 MB and 45 s to
  built-in adapters and 25 MB and the default timeout to custom ones; a per-company override rejects the Lever
  fixture; a streamed 26 MB body fails at the custom cap and parses at the built-in cap.
  `npm test`: 106 pass, 0 fail. My 3 files: 46 pass.
- Juice integration tests:
  - `/api/cities` returns 200 with max-age=3600 and the same 89 cities as the file.
  - A request with the ETag gets 304, and gzip works.
  - Rewriting the file with a newer mtime serves the new data under a new ETag.
  - A broken rewrite keeps the previous copy.
  - `/lib/` serves every allowlisted module byte-for-byte as `text/javascript`.
  - `/lib/index.js`, `/lib/cache.js` and traversal attempts return 403/404.
  - The allowlist is closed under imports.
  - `npm test`: 154 pass, 0 fail.
- Demo fallback works for all 8 built-ins (offline `getJobs`): 74–120 jobs each.
- Manual run against the real demo data: anthropic 111 jobs (96 with salary), anduril 120 (105), openai 120 (110).
  All jobs have locations. The demo jobs without a salary contain no currency amounts, so they are meant to have none.

## 6. Known gaps and follow-ups
- Adapters have not been checked against real live responses, because the hosts are blocked here.
  Run `npm run snapshot` where the network is open and spot-check the Greenhouse pay-range parsing on real Anthropic/Anduril postings.
- Text salary parsing picks a single range. When a posting lists different ranges per location in text, the
  first-scored one wins. Structured Greenhouse ranges use the overall min–max instead (decision 10).
- `scripts/build-static.js` `LIB_MODULES` does not yet include `juice.js`, and the build does not yet emit
  `api/cities` (devops/lead own that file). Static mode needs both for the browser-side juice path.
- Throttle, negative cache and LRU state is per process. It is not shared across replicas.
- `style-src-attr 'unsafe-inline'` stays until `public/app.js` `h()` uses CSSOM (the patch is in REVIEW.md M2).
- Pay ranges: only the overall span across tiers is kept. Per-tier ranges are not exposed.
- Contract deviations: extra file `server/sources/util.js`, extra `originalInterval` salary field, extra
  `metadata`/`compensationSummary` fields on raw jobs, `/api/health` route, `custom:true` on internal custom
  company objects (not exposed in the API), and `pay_transparency=true` on the Greenhouse URL. After the review:
  security headers, `UpstreamError`, `publicError`, `withUpstreamSlot` and `resetState` exports, the
  `data/cache/custom/` layout, and the `MELON_CACHE_MAX`, `MELON_DISK_CACHE_MAX` and `MELON_MIN_REFRESH_MS` env vars.

## 7. Change log
- 2026-10-02 05:05 UTC: companies, adapters, salary, normalize, cache, server, snapshot, tests written.
- 2026-10-02 05:25: snapshot script exits non-zero only if every slug fails, never writes fallback data, and treats 0 jobs as a failure.
- 2026-10-02 05:28: server test mock fixed (the mock now stays installed for the server; the test client uses the real fetch).
- 2026-10-02 05:30: location dedupe also by resolved city.
- 2026-10-02 05:34: full suite green with the real geo/keywords/demo modules; process docs written.
- 2026-10-02 05:45: REVIEW.md server fixes H1, M2, L1, L2, L3, L7, L8 and C2 (decision 9), each with tests.
  `normalize.js` reads DEBUG via `globalThis.process?.env`, and `sources/util.js` uses `TextDecoder` (browser-safe).
- 2026-10-02 05:50: Greenhouse `pay_input_ranges` take the overall min/max across tiers, with interval from
  title/blurb (decision 10, new fixture `test/fixtures/greenhouse-pay-ranges.json`). Added 6 built-ins (decision 11).
- 2026-10-02 (after the first real-data run): body cap is per company, 120 MB for built-ins and 25 MB for custom
  boards, plus a 45 s timeout for built-ins (decision 12). Mistral removed from the built-ins. Tests added.
- 2026-10-02 (Juice integration): `data/cities.json` is loaded at startup and served at `/api/cities` (max-age=3600,
  ETag, reload on mtime change). `/lib/` serves an allowlist of browser-safe server modules (decision 13). Tests added.
