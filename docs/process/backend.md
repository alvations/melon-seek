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
    - `GET /api/cities`, and its alias `/api/cities.json` (the static build's `dist/api/cities.json` path, so
      `api.js` can use one relative URL), serves the parsed and re-serialized document with `Cache-Control: public, max-age=3600`,
      an ETag (from mtime and size; `If-None-Match` gets a 304) and a gzip copy computed once per version.
    - Each request stats the file, and a change in mtime or size triggers a reload. If the new file fails to
      parse, the last good copy is kept and a warning is logged. If no copy was ever loaded, the route returns 503.
    - In server mode, `api.js` resolves `import('./lib/<module>.js')` to `/lib/...`. The server maps `/lib/<path>`
      to `server/<path>` only for the allowlist in **`server/lib-modules.js`**: `LIB_MODULES` (companies,
      normalize, salary, vet, geo, keywords, demo, juice) plus any `sources/<name>.js` matching
      `^sources/[a-z0-9][a-z0-9_-]*\.js$`. Anything else under `/lib/` is a 404: index.js, cache.js,
      lib-modules.js itself, other extensions, nested paths and case variants. Every encoded or raw traversal form
      is a 403/404, with `safeJoin` as a second check. Responses are `text/javascript` with the security headers.
      Server mode therefore uses the same relative paths as `dist/lib/`.
    - `scripts/build-static.js` can import `LIB_MODULES` from the same module so the two lists cannot drift. I did
      not edit it because devops was changing it at the time. Its current list matches.
    - A test checks that the allowlist is closed under relative imports (juice → geo, normalize → vet → salary, ...)
      and has no Node imports. `normalizeJobs` already calls `vetSalaries`, so live data fetched through
      `lib/normalize.js` is vetted; vetting twice is idempotent.
14. **F4 listing history (ROADMAP §6.2 Top 3, §7.1).**
    - *Adapters:* `postedAt` comes from Greenhouse `first_published`, Ashby `publishedAt` and Lever `createdAt`,
      normalized to a UTC ISO string by `isoOrNull` in `sources/util.js`. `reqId` is Greenhouse `internal_job_id`
      as a string and `null` elsewhere. `updatedAt` is unchanged. normalize copies both onto the Job.
      Age is never derived from `updatedAt`, because Greenhouse bulk edits reset it.
    - *`server/history.js`* is pure and browser-safe, and is in `lib-modules.js`. The locked exports are
      `updateLedger(prev, jobs, fetchedAt)`, `annotate(jobs, ledger, fetchedAt)`, `fromCompact(compact)` and
      `ledgerMeta(ledger)`. It also exports `compactLedger`, `diffLedger`, `fingerprint` and `freshnessFor`.
    - *Ledger format `melon-history-1`:* one small plain-JSON file per company, `data/history/<slug>.json`. The
      header holds `since`, `lastRunAt` and `runs`. Each job id maps to `{f: firstSeenAt, l: lastSeenAt,
      p: postedAt, k: fingerprint, r?: reqId, c?: closedAt, n?: repostCount, o?: chain firstSeenAt,
      s?: successor id}`. The fingerprint is an FNV-1a hash (base36) of the normalized title, department and
      primary location, so it stays short. `scripts/history.js` writes one entry per line with sorted ids, which
      keeps diffs readable if a data branch is chosen later. Measured size: 72 KB for anthropic's 638 jobs
      (about 113 B/job, so roughly 0.6 MB for 5.4k postings). The test caps 5,413 synthetic jobs at 1.5 MB.
    - *Rules:*
      - An id missing from a run gets `closedAt` set to that run.
      - An id that comes back is **reopened**: firstSeenAt is kept and it is not a repost.
      - A **repost** is a new id matching a closed, unconsumed entry, either by fingerprint within 30 days of the
        close, or by the same Greenhouse `internal_job_id` at any time. Two open postings that share a reqId
        (one requisition posted in several places) are **not** reposts.
      - Repost chains carry the count and the original firstSeenAt.
      - Closed entries are pruned after 400 days.
      - Replayed or out-of-order runs (`fetchedAt` not newer than `lastRunAt`) and empty job lists return
        `prev` unchanged.
    - *annotate:*
      - `postedAt` is the job's own, else the ledger's. `firstSeenAt` comes only from the ledger.
      - `ageDays` comes from postedAt, else firstSeenAt.
      - `ageIsMinimum` is true when the age comes from a firstSeenAt that equals the ledger's first run
        (the posting may be older).
      - `freshness` is new ≤7, active 8–59, stale 60–179 and evergreen ≥180 days. For a minimum age only
        `evergreen` is certain, so lower buckets become `null`.
      - `repost` is `{count, firstSeenAt}` or `null`.
      - The server computes ages as of **now**, not the data's fetchedAt, so a 3-day-old snapshot still shows
        current ages.
    - *Compact (static) form:* `compactLedger()` emits the contract's
      `{id: [firstSeenAt, postedAt, repostCount]}` for open entries only. Reposts carry an optional 4th element,
      the chain's first firstSeenAt, so the drawer can say since when; 3-element readers are unaffected.
      `fromCompact()` rebuilds a ledger: `since` is the earliest firstSeenAt and `runs` is null, because the
      compact map has no header.
    - *Capture:* `scripts/snapshot.js` is now an exported `runSnapshot(targets, {fetchLive, outDir, historyDir,
      now, log, error})` with a thin CLI. After writing a snapshot it calls `recordRun(slug, jobs, fetchedAt)`
      from `scripts/history.js`. A failed or empty fetch writes neither a snapshot nor the ledger. A ledger write
      error is logged and leaves the snapshot in place. A corrupt ledger throws and is never overwritten.
      CLI: `node scripts/history.js [stats [slug...]]` prints a summary, and
      `node scripts/history.js record [slug...]` replays `data/snapshots/<slug>.json` into the ledger, which can
      seed it from downloaded snapshot artifacts; older runs are ignored. `MELON_HISTORY_DIR` overrides the folder.
    - *Server:* `/api/jobs` annotates every mode (live, cache, snapshot, demo) from `data/history/<slug>.json`,
      reloaded when its mtime or size changes. Results are memoized per jobs array, ledger version and hour. It
      adds `meta: { compstimate: null, history: ledgerMeta(ledger) }`; F3 fills `compstimate` later.
      The server does not write ledgers itself; only snapshot runs do.
    - *Persistence:* the interim decision is workflow artifacts, owned by devops (`.github/scripts/ledger.sh`).
15. **F1 market comps.** `scripts/build-market.js` exports a pure `buildMarket(payloads, {minN, generatedAt})`.
    It also exports `percentileSorted`, `usdMid`, `MARKET_FORMAT`, `MIN_N`, `BASIS` and `COLUMNS`, plus a CLI:
    `node scripts/build-market.js [--out file] [--snapshots dir]` reads `data/snapshots/*.json`, vets them, and
    writes JSON.
    - *Inputs:* only vetted salaries (`salary !== null`), converted to USD with the shared FX
      (`public/viz/palette.js` `toUSD`/`hasFx`). Unknown currencies are skipped.
    - *Grouping:* by product's `roleFamily(title, job)` (the job is passed as ctx for department hints) and the
      job's `seniority` (`inferSeniority` buckets, as ROADMAP says).
    - *Stat:* the midpoint of each posted range. A cell is company × family × seniority, plus a family-only
      roll-up with seniority `"*"` for the drawer's fallback. Cells need n ≥ 3. p25, median and p75 use linear
      interpolation, rounded to $100.
    - *Doc `melon-market-1`:* `{format, basis: "posted base pay ranges", currency: "USD", stat, fx {asOf, source},
      generatedAt, minN, mode: "real"|"demo", companies[{slug,name,color,mode,fetchedAt,jobs,salaried,used}],
      families, columns, cells: [[company, family, seniority, n, p25, median, p75]]}`. Tuples keep it small: the
      real 8-company snapshots give **16.4 KB**, 295 cells. Cells are sorted, so output is deterministic.
    - *Demo data* is used only when no company has real data, and the doc then says `mode: "demo"`.
    - *Server:* `GET /api/market` (alias `/api/market.json`) builds over the built-ins from data already on hand:
      cache, snapshot or demo through `getJobsBase(..., {offline: true})`. It never triggers live fetches, and the
      doc is memoized until one of the job lists changes.
16. **F3 `meta.compstimate`.**
    - The server calls product's `backtest(jobs, { seed: 20261002, maxN: 500 })`, feature-detected from
      `public/features/compstimate.js`, and adds `computedAt`.
    - It returns `null` for demo data (an accuracy figure for synthetic pay is meaningless), when `backtest` is
      missing, or when it fails.
    - The backtest takes about 5 s for Anduril's 2.4k jobs, so it runs in a **worker thread**
      (`server/compstimate-worker.js`, Node-only). Only the fields compstimate reads are cloned. The worker is
      started with `execArgv: []` so parent flags such as `--watch` are not inherited.
    - A request waits at most `BACKTEST_WAIT_MS` (800 ms, env `MELON_BACKTEST_WAIT_MS`) and otherwise answers
      `compstimate: null`; later requests get the memoized result, kept per company until its job list changes.
    - Measured on the real snapshots: anthropic 8.6%, anduril 7.3–8.2% (product was still tuning), openai 9.2%,
      shieldai 13.5%. With anduril's 5 s backtest running, the event loop ran 155 of 160 possible 50 ms ticks.
    - The static build should call `backtest` directly with `BACKTEST_OPTS` (exported from `server/index.js`).
17. **F7 CSV.** `server/export.js` is pure, browser-safe and in `lib-modules.js`. It exports `jobsToCsv(jobs, {mode})`,
    `csvCell`, `csvFileName(slug, {mode, date})`, `csvReadme({generatedAt, companies})` and `CSV_COLUMNS`.
    - *Columns:* `id, title, department, team, seniority, locations (" | "), remote, salary_min, salary_max,
      salary_currency, posted_at, first_seen_at, url, data_mode`. These are the ROADMAP columns plus `data_mode`,
      so demo rows are always labelled.
    - Salary is the vetted, annualized base range; it is empty when missing or quarantined. No descriptions.
    - *Format:* RFC 4180 with CRLF; cells are quoted when they contain `,`, `"` or a newline. Text cells starting
      with `= + - @ tab CR` get an apostrophe prefix, against spreadsheet formula injection. No BOM.
    - *Route:* `GET /api/export?company=` (or `source&board`) returns `text/csv; charset=utf-8` with
      `Content-Disposition: attachment; filename="melon-seek-<slug>-<date>[-demo].csv"` and an `X-Melon-Mode`
      header. It uses the same fallbacks as `/api/jobs`; HEAD never fetches upstream.
18. **F2 `job.extras`.** `normalize.js` calls `keywords.extractCompExtras(text, {title})` through a namespace import,
    so a missing export degrades to `{equity: false, bonus: false}`. The text is the description plus the source's
    compensation summary (Ashby "… • Offers Equity") and the structured salary text.
19. **Perf fixes found along the way** (all in `server/index.js`):
    - Vetting in `stamp()` is memoized per job array, so array identity stays stable and repeat requests do not
      re-run `vetSalaries`.
    - Snapshot files are parsed once per mtime/size (bounded to 20) instead of on every request. The 38 MB Anduril
      snapshot was being re-parsed on every snapshot-mode request.
20. **snapshot script.** `npm run snapshot -- anthropic anduril openai` runs the given slugs; with no args it runs
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
  - `/api/cities.json` alias matches.
  - `/lib/` serves every allowlisted module byte-for-byte as `text/javascript`.
  - 12 disallowed paths and 14 traversal forms (encoded, double-encoded, backslash, NUL, and raw targets
    that skip fetch's normalization) return 400/403/404 and leak nothing.
  - The allowlist is closed under imports.
  - My 3 files: 65 pass, 0 fail. The full `npm test` had 4 failures at the time, all FX expectations in
    `test/features.test.js` and `test/juice.test.js` (other workstreams' FX tables were changing concurrently).
- F4 tests:
  - `test/history.test.js` (14 tests): new, unchanged, closed and reopened entries; failed, empty and replayed
    runs; repost by fingerprint (chained, consumed once); no repost outside the window or with a different
    department or location; reqId reposts plus concurrent shared reqIds; pruning; freshness thresholds 7/8, 59/60
    and 179/180; annotate with postedAt, firstSeenAt, minimum ages and missing dates, ignoring `updatedAt`;
    the repost field; compact round-trip; fingerprint normalization; size; `recordRun` (an empty run leaves the
    file byte-identical with the same mtime; a corrupt file is not overwritten); `runSnapshot` (success records,
    and failed, empty and mixed runs leave the ledger alone).
  - Adapter fixture test for `postedAt` and `reqId` (Greenhouse `first_published` added to the fixture).
  - Server test: annotation and `meta.history` from a written ledger, reload on change, demo jobs carry the fields,
    and `/lib/history.js` is served. `npm test`: 187 pass, 0 fail.
  - CLI smoke test: `history.js record anthropic` on the real committed snapshot recorded 638 open jobs (72 KB);
    a second `record` of the same snapshot reported "unchanged".
- F1/F3/F7/extras tests:
  - `test/market.test.js` (5): percentiles; USD midpoint; n threshold; quarantined pay excluded; FX conversion;
    family roll-up; demo-only versus mixed; deterministic order; and real snapshots ≤ 150 KB with
    p25 ≤ median ≤ p75 and plausible medians.
  - `test/export.test.js` (3): escaping, formula injection, CRLF; columns and an RFC 4180 round-trip with no
    descriptions and quarantined pay empty; file name and README.
  - `test/sources.test.js`: extras, including Ashby "Offers Equity" true, DEI "pay equity" false, and bonus + RSUs.
  - `test/server.test.js`:
    - `/api/market` makes no upstream fetches and is memoized.
    - `/api/export` headers and rows, demo labelling, 400s, and HEAD with no fetch.
    - `meta.compstimate` is null when the module or `backtest` is missing and for demo data; otherwise it carries
      the right options, is memoized, and a failing backtest is harmless.
    - The real backtest runs in a worker on 40 synthetic jobs.
  - My test files: 100+ pass, 0 fail. The full `npm test` had 1 failure at the time, "title normalization" in
    `test/features.test.js`, while product was editing `roles.js`.
  - `node scripts/e2e.js --api-only`: 8/8.
- Demo fallback works for all 8 built-ins (offline `getJobs`): 74–120 jobs each.
- Manual run against the real demo data: anthropic 111 jobs (96 with salary), anduril 120 (105), openai 120 (110).
  All jobs have locations. The demo jobs without a salary contain no currency amounts, so they are meant to have none.

## 6. Known gaps and follow-ups
- Adapters have not been checked against real live responses, because the hosts are blocked here.
  Run `npm run snapshot` where the network is open and spot-check the Greenhouse pay-range parsing on real Anthropic/Anduril postings.
- Text salary parsing picks a single range. When a posting lists different ranges per location in text, the
  first-scored one wins. Structured Greenhouse ranges use the overall min–max instead (decision 10).
- `scripts/build-static.js` keeps its own copy of `LIB_MODULES` (it currently matches) until devops switches it
  to `import { LIB_MODULES } from '../server/lib-modules.js'`.
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
  ETag, reload on mtime change, plus a `/api/cities.json` alias). `/lib/` serves the browser-safe allowlist from the new
  shared `server/lib-modules.js` (decision 13). Tests cover allowed, disallowed and traversal requests.
- 2026-10-02 07:20 UTC: F4 ledger capture. Adapters emit `postedAt` and `reqId`. Added `server/history.js` (locked
  exports), `scripts/history.js`, and `runSnapshot` with ledger capture. The server annotates jobs and adds
  `meta.history` (decision 14). F1, F3, F7 and extras come next.
- 2026-10-02 07:35 UTC: F1 `buildMarket` + `/api/market`; F3 `meta.compstimate` through product's backtest in a
  worker thread; F7 `server/export.js` + `/api/export`; F2 `job.extras`. Vetting and snapshot parsing are now
  memoized (decisions 15–19).
