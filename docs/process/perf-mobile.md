# Process log: perf-mobile

## 1. Brief

Prompt: [prompts/perf-mobile.md](prompts/perf-mobile.md), verbatim, including the coordinator's mid-task message (QA M-2).

Goal: measure load time, main-thread blocking and memory on a mid-range phone, then fix the biggest costs. The app must stay simple, and getJobs must return exactly what it returned before.

Files owned:
- `public/api.js`;
- `scripts/build-static.js`;
- `public/unpack-worker.js` (new);
- `test/perf-mobile.test.js` (new) and the M-2 assertions in `test/static-build.test.js`;
- `docs/process/scripts/perf-mobile*.mjs` (new);
- `docs/process/patches/perf-mobile-*.diff`: proposed changes to files I don't own;
- this log.

## 2. Inputs and sources

- `docs/process/mobile.md`. Its lead pass says "Anduril still has one 0.5 s task while loading at 4x CPU (list parse and unpack); possible follow-up: unpack in a worker."
- `docs/CONTRACT.md`: Job shape, the packed list format and the v2 fields.
- `scripts/build-static.js` and `public/api.js`: the static fallback chain, which tries a live browser fetch first, then the bundled list, then the bundled demo, then the in-browser demo.
- `server/index.js` CSP:
  - `script-src 'self'`, with no `worker-src`, so workers fall back to `script-src`;
  - `connect-src` allows the board APIs only.
- `server/pipeline.js#runTask('snapshot')` and `server/normalize.js#relocateJobs`: needed for M-2.
- Tooling:
  - Playwright 1.63 from the scratchpad, and Chromium 141 at `/opt/pw-browsers/chromium-1194`;
  - Chrome DevTools network presets: Slow 4G (the preset formerly called "Fast 3G") is 562.5 ms RTT, 180 kB/s down and 84 kB/s up; Fast 4G is 165 ms, 1.01 MB/s down and 169 kB/s up.

## 3. Findings and decisions

### Findings (measured before any change)

1. **On Pages, Greenhouse boards load from the live API, not from the bundle.**
   - Static mode fetches `boards-api.greenhouse.io/...?content=true` first. That is 7.5 MB of JSON for Anthropic (0.9 MB gzip) and 33 MB for Anduril (3.0 MB gzip).
   - It then runs `normalizeJobs` on the main thread.
   - Measured with a faithful offline fixture (decision 9) at 4x CPU: one main-thread task of **10.3 s for Anthropic and 36.6 s for Anduril**, a first chart at 15 s and 46 s on Fast 4G, and a 248 MB heap for Anduril.
   - On Slow 4G, Anduril's download hits api.js's 12 s live timeout and falls back to the bundle, so the first chart lands at 21.8 s.
   - The sandbox can't reach Greenhouse, so the earlier audits all measured the fallback path. Only OpenAI (Ashby, CORS-blocked) really uses the bundle on Pages.
2. **The Long Tasks API misses this work.** Work that runs as a promise continuation of `fetch()` produces no `longtask` entry. A 3 s busy loop after `fetch().then()` reports nothing, while the same loop in `setTimeout` reports 3000 ms. That continuation is exactly where getJobs runs.
   - The live path's PerformanceObserver max was 538 ms, against 10.3 s in the trace.
   - The harness now reads main-thread `RunTask` events from a Chrome trace, the same data DevTools uses. Earlier TBT numbers in mobile.md are undercounts for getJobs work.
3. **The bundled-path "unpack" task is mostly app.js.** Warm Anduril load, 4x CPU, self plus callees, from the CPU profile:

   | Phase | ms |
   |---|---|
   | app `render` | 254 |
   | `roleFamily` (in app `prepare`) | 198 |
   | `attachJuiceAll` | 104 |
   | rest of `prepare` | 66 |
   | `vetSalaries` | 32 |
   | `unpackJobs` | 21 |
   | `JSON.parse` | about 10 |

4. **Cold loads on Slow 4G are bound by latency.**
   - The parser-blocking `config.js` and `theme-init.js` load one after the other, and Chromium's preload scanner did not fetch ahead of them.
   - After them come app.js, its imports, the third level of imports (shared.js), companies.json, lib/*, lib's own imports, the jobs JSON, and then cities.json plus juice.js.
   - That is about 10 round trips in a row, roughly 5.6 s of the 8.6 s to the first chart.
5. **No idle CPU.** In 10 s idle after load: 2-5 ms of tasks, no rAF, no layouts or style recalcs, no requests.
6. **No leak.** Over 10 company switches (anthropic → anduril → openai …, GC before each reading), the heap holds at 13-14 MB from switch 2 on, and DOM nodes cycle at 799/891/869. That holds both before and after.
7. **Interaction costs** (Anduril, 4x CPU, max task):
   - drawer 120-170 ms;
   - map 240-340 ms (first open, Leaflet prefetched);
   - Insights 0.9-1.1 s (`features/insights.js`; not my file).

### Decisions

1. **Live board parse and normalize in a module worker** (`public/unpack-worker.js`).
   - The main thread keeps the fetch, the 12 s timeout, the abort and every error message. It reads `arrayBuffer()` and posts a copy, so the bytes stay available for a fallback.
   - The worker returns the jobs `normalizeJobs` returns, re-attaching the non-enumerable `droppedKeywords`, or `null`.
   - On `null`, on any worker error, or if the worker isn't ready within 10 s, api.js runs the old main-thread code on the same bytes. Nodes without a web `Worker` take that path too.
   - CSP: a same-origin module worker passes `script-src 'self'`. On Pages the worker gets no CSP header (meta CSPs don't apply to workers). In server mode the worker response carries the same CSP, and its fetches don't matter because the main thread fetches.
   - The postMessage handoff of normalized jobs costs about 100-200 ms on the main thread, against 10-37 s before.
2. **No worker for the bundled list.**
   - Measured at 4x CPU: Anduril's `JSON.parse` plus `unpackJobs` is 10 + 21 ms.
   - Structured-cloning the finished, juiced jobs back would cost about 214 ms (the 1 MB list grows to 7.7 MB with Juice). The main thread would get slower.
   - Instead, `vetSalaries` and Juice are yielded and chunked: `scheduler.yield()`, else a MessageChannel task, then `attachJuiceAll` on 400-job slices. Juice is per job, so slices give exactly the same result.
3. **Early cities and juice.js.** `getJobs` now starts `getCities()` and `loadJuice()` alongside the list in both modes; before, they started after it. That saves one round trip per load.
4. **Lazy modules.** The bundled path loads only `STATIC_PRELOAD` (exported from api.js; the build modulepreloads it): companies, sources/*, vet and juice, plus their imports.
   - normalize.js, keywords.js and history.js load with the first live request, or never when the worker handles it.
   - demo.js loads only for the in-browser demo.
   - JS on a cold load: 27 → 25 requests, 266 → 231 kB gzip.
5. **Load hints in `dist/index.html`**, written by the build right after the CSP meta:
   - `preload` for the head's blocking scripts and stylesheets, Google Fonts CSS included;
   - `modulepreload` for app.js's static import graph plus `STATIC_PRELOAD` (19 files), computed by scanning static imports;
   - `preload as=fetch crossorigin` for `api/companies.json` and `api/cities.json`.

   Lazy modules (Insights, Leaflet, normalize, demo, mock-api) are excluded, and a test checks that. Preconnects to the board APIs were dropped: `scripts/links-policy.js` allows no off-site links to them.
6. **In-memory LRU of the last 3 bundled lists**, kept already vetted and juiced. Switching back returns the same job objects, like the existing live `memCache` does.
   - `refresh` bypasses it, and a list whose Juice failed is never cached (so a cities retry still works).
   - Anduril switch-back drops from 1.1-2.3 s to 0.2-0.4 s.
   - The leak test shows no growth from it (13.6 MB after 10 switches, against 14.1 before), because app.js keeps one list referenced anyway.
7. **Not done, with reasons:**
   - *Cache-busting names:* Pages sends `max-age=600` on every file, whatever its name, so hashed names gain nothing.
   - *Trimming the packed list:* lossless already, and parse plus unpack is 31 ms.
   - *Deferring Juice:* cards, the Juice sort and the map's Juice mode need it at first paint; it is chunked instead.
   - *Speculative bundled fetch in parallel with the live one:* saves a round trip when live fails, but costs bandwidth when it succeeds. That's a product call (section 6).
8. **QA M-2 (static build skipped `relocateJobs`).** The build now upgrades snapshots exactly as `server/pipeline.js` does: `normalizerVersion === NORMALIZER_VERSION ? jobs : relocateJobs(rekeyBoardJobs(jobs).jobs)`, then `vetSalaries` (the server's response-time gate).
   - Anthropic's Location filter goes from 38 raw names (for example "Remote-Friendly US (Travel Required)") to the 27 that server mode shows.
   - The location sets of Anthropic, Anduril and OpenAI now match server mode exactly.
9. **Measurement method** (`docs/process/scripts/perf-mobile.mjs`):
   - Device: 390×844, isMobile, touch, DPR 3, Android UA, 4x CPU, CDP network emulation.
   - Server: the static build behind an HTTP/2 + TLS server, like Pages (`perf-mobile-h2-server.mjs`: gzip, `max-age=600`, ETag). The HTTP/1.1 QA server's 6-connection cap would distort the module waterfall.
   - Off-site hosts go through CDP `Fetch`, because Playwright's `route()` disables the HTTP cache, which makes every warm load cold:
     - tiles get a 1×1 PNG;
     - fonts are aborted;
     - boards are aborted (the CORS-failure path), or with `--live` answered from `perf-mobile-gh-fixture.mjs`. The fixture rebuilds Greenhouse's response from `data/snapshots/<slug>.json` (same jobs, entity-escaped HTML, pay ranges), delayed by RTT×2 plus gzip size ÷ throughput.
   - Metrics:
     - FCP from paint timing;
     - first chart = the frame after the chart DOM appears;
     - TTI = end of the last long task within 2 s after the UI is ready;
     - long tasks, max and TBT from trace `RunTask` events;
     - per-phase attribution from a CDP CPU profile;
     - heap from `Performance.getMetrics`, with GC before the leak readings;
     - requests by kind from CDP `Network`.
   - Warm = a new navigation in the same context (HTTP cache).
   - Switch = setting the hash to another company, until its first card renders.

## 4. Replayable steps

```sh
SP=<scratch>; export NODE_PATH=$SP/pw/node_modules        # never `playwright install`
git worktree add $SP/wt-before 650971b && (cd $SP/wt-before && ln -s /home/user/melon-seek/node_modules node_modules && MELON_SNAPSHOT_DIR=/home/user/melon-seek/data/snapshots node scripts/build-static.js --out $SP/dist-before)   # "before" = commit 650971b
node scripts/build-static.js --out $SP/dist-after
(cd $SP/perf/cert && openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 7 -subj /CN=localhost)
DIST=$SP/dist-before PORT=5473 CERT_DIR=$SP/perf/cert node docs/process/scripts/perf-mobile-h2-server.mjs &
DIST=$SP/dist-after  PORT=5474 CERT_DIR=$SP/perf/cert node docs/process/scripts/perf-mobile-h2-server.mjs &
for s in anthropic anduril; do node docs/process/scripts/perf-mobile-gh-fixture.mjs $s $SP/perf/gh-$s.json; done
S=docs/process/scripts/perf-mobile.mjs
node $S https://localhost:5473/melon-seek/ before --net=slow4g,fast4g          # bundled path, 3 companies + leak
node $S https://localhost:5474/melon-seek/ after  --net=slow4g,fast4g
node $S https://localhost:5473/melon-seek/ before-live --co=anthropic,anduril --net=fast4g,slow4g --no-leak --no-extras --live=$SP/perf
node $S https://localhost:5474/melon-seek/ after-live  --co=anthropic,anduril --net=fast4g,slow4g --no-leak --no-extras --live=$SP/perf
git show HEAD:public/api.js > $SP/dist-after/api-old.js                       # reference for equality checks
node docs/process/scripts/perf-mobile-worker-check.mjs https://localhost:5474/melon-seek/ $SP/perf   # live path, in Chromium
npm test; node scripts/e2e.js
```

Each run writes `perf-<label>.json` (full results: waterfalls, top functions, phases and requests) to the working directory. One run per cell. The machine's load average was about 1-1.5 during the matrix.

## 5. Verification

**Tests**
- `npm test`: **301/301**. That includes the new `test/perf-mobile.test.js` (5 tests) and the M-2 assertions in `test/static-build.test.js`. The M-2 test fails against the old build code (checked).
- `node scripts/e2e.js`: **64/64**.

**Output identity**
- `test/perf-mobile.test.js` covers four things:
  - static `getJobs` deep-equals the old pipeline (`unpackJobs → vetSalaries → attachJuiceAll`) for every bundled list, real Anthropic snapshot included;
  - the LRU behaves: no refetch, equal results, refresh and eviction refetch, no caching without Juice;
  - the worker's `normalizeBoard` deep-equals main-thread `normalizeJobs` after a structured clone;
  - the `index.html` hints are present, and nothing lazy is preloaded.
- Full-scale check (`$SP/perf/equal-check.mjs`): HEAD `api.js` against the new one on the real build, `assert.deepStrictEqual` per company. All 8 companies are identical, Anduril's 2,418 jobs included, on first load and on switch-back.
- In Chromium (`perf-mobile-worker-check.mjs`): new `getJobs` through `unpack-worker.js` equals HEAD `api.js` for the live Anthropic (638 jobs) and Anduril (2,418 jobs) fixtures. The comparison is deep, key order included, and so is `droppedKeywords`. There were no CSP or worker errors.

### Before → after (4x CPU, 390×844; times from navigation; "max" is the longest main-thread task)

**Real Pages path for Greenhouse boards (live fetch; synthetic fixture):**

| Network · company | FCP | First chart | Max task | TBT | Heap | Switch away / back (max task) |
|---|---|---|---|---|---|---|
| Fast 4G · Anthropic | 0.97 → 0.70 s | **15.5 → 5.9 s** | **10.3 s → 364 ms** | 11.1 s → 0.62 s | 65 → 45 MB | 1.0 s → 0.64 s / 0.33 → 0.34 s |
| Fast 4G · Anduril | 0.96 → 0.72 s | **45.8 → 16.4 s** | **36.6 s → 447 ms** | 38.6 s → 1.2 s | **248 → 79 MB** | 11.8 → 4.9 s (9.3 s → 347 ms) / 0.54 → 0.60 s |
| Slow 4G · Anthropic | 2.7 → 2.5 s | **24.7 → 13.3 s** | **9.6 s → 365 ms** | 10.3 s → 0.69 s | 65 → 23 MB | 1.4 → 1.4 s / 0.26 → 0.31 s |
| Slow 4G · Anduril (live times out at 12 s → bundle) | 2.7 → 3.1 s | 21.8 → 17.8 s | 723 → 444 ms | 922 → 612 ms | 14 → 13 MB | 17.2 → 10.2 s (9.5 s → 346 ms) / 14.0 → 12.3 s |

**Bundled path (OpenAI on Pages; any board whose live fetch fails):**

| Network · company | FCP | First chart (cold) | Max task (cold) | TBT | First chart (warm) | Heap | Switch away / back |
|---|---|---|---|---|---|---|---|
| Slow 4G · Anthropic | 2.8 → 2.5 s | **8.6 → 4.3 s** | 332 → 211 ms | 367 → 251 | 3.3 → 2.6 s | 7.5 → 7.6 MB | 1.5 → 1.4 s / **1.2 s → 250 ms** |
| Slow 4G · Anduril | 2.7 → 2.5 s | **9.8 → 5.7 s** | 606 → 477 ms | 782 → 651 | 4.4 → 4.0 s | 25.7 → 18.2 MB | 1.1 → 1.4 s / **2.3 s → 415 ms** |
| Slow 4G · OpenAI | 2.7 → 2.4 s | **8.8 → 4.9 s** | 314 → 224 ms | 357 → 322 | 3.5 → 3.0 s | 8.4 → 11.2 MB | 2.1 → 2.0 s / **1.5 s → 247 ms** |
| Fast 4G · Anthropic | 0.88 → 0.74 s | **3.0 → 1.8 s** | 312 → 184 ms | 335 → 207 | 1.3 → 1.2 s | 10.8 → 7.6 MB | 0.64 → 0.65 s / 0.55 → 0.24 s |
| Fast 4G · Anduril | 0.88 → 0.69 s | **3.8 → 2.5 s** | 708 → 437 ms | 973 → 615 | 2.1 → 1.7 s | 25.7 → 18.9 MB | 0.58 → 0.61 s / **1.1 s → 209 ms** |
| Fast 4G · OpenAI | 0.92 → 0.77 s | **3.2 → 2.0 s** | 341 → 203 ms | 427 → 282 | 1.5 → 1.2 s | 9.8 → 11.2 MB | 1.1 → 1.2 s / 0.56 → 0.28 s |

Notes on the two tables:
- "Switch away" runs Anthropic → OpenAI, Anduril → Anthropic and OpenAI → Anduril.
- Heap is the main isolate only. The worker's heap is separate and is freed by GC after each board.
- Single runs; expect about ±10% noise.

**Resources** (cold, bundled, after):

| Item | Count / size |
|---|---|
| JS | 25 requests, 231 kB gzip (27 / 266 before) |
| CSS | 4 requests, 31 kB |
| JSON | 4 requests: 54 kB for Anthropic, 89 kB for OpenAI, 148 kB for Anduril |
| Fonts | 1 Google CSS request (blocked in the sandbox) |
| Tiles | none until Map |
| DOM after load | 823-912 nodes; about 2.3k after Insights or Map |
| Warm loads | everything from cache; 0 bytes |

**Interactions** (after, Fast 4G):

| Interaction | Anthropic | OpenAI | Anduril |
|---|---|---|---|
| Drawer (open to description) | 0.39 s, max 144 ms | 0.32 s, max 125 ms | 0.43 s, max 122 ms |
| Map, first open | 0.21 s, max 159 ms | 0.28 s, max 212 ms | 0.38 s, max 297 ms |
| Insights | 0.54 s, max 481 ms | 0.70 s, max 623 ms | 0.99 s, max 881 ms |

**Leak check** (heap in MB after GC, start then after each of 10 switches; the same pattern before):

| Build | Readings | Event listeners |
|---|---|---|
| Before | 6.2, 11.9, 13.2, 13.2, 13.9, 13.3, 13.3, 14.0, 13.5, 13.4, 14.1 | 94 |
| After | 5.9, 11.6, 12.9, 12.8, 13.5, 13.0, 13.0, 13.6, 13.1, 13.0, 13.6 | 96 |

It is flat, so there is no leak.

**Proposed app.js patch, measured on a scratch copy of dist** (Fast 4G, 4x CPU). It cuts the worst task on Anduril by 4x. First chart is unchanged.

| Company | Cold max task | Cold TBT | Warm max task |
|---|---|---|---|
| Anduril | 463 → **113 ms** | 617 → 362 | 382 → **101 ms** |
| Anthropic | 232 → 102 ms | 282 → 160 | 184 → 77 ms |

## 6. Known gaps and follow-ups

Routed to other owners. Patches are in `docs/process/patches/` and are not applied.

1. **`public/app.js`** (`perf-mobile-app-prepare-chunks.diff`): run `prepare()` in 300-job chunks that yield, so the remaining 0.4 s load task becomes about 0.1 s.
   - `prepare()` is per job and idempotent.
   - A company switch during the chunks returns early on the existing `loadSeq` check.
2. **`server/index.js` CSP** (`perf-mobile-csp-tile-probe.diff`): `viz/map.js` re-reads the first tile with `fetch()` to check its status, but `connect-src` doesn't allow tile hosts. Every Map open logs a CSP error, and the probe falls back to "trust the image". The patch adds the tile hosts to `connect-src`.
3. **Product decision: the live-first fetch of huge boards.**
   - Even off the main thread, Anduril's live board is 3 MB gzip and 33 MB parsed. That is 16 s to the first chart on Fast 4G (a 3 s download, the rest is worker CPU at 4x) and a 12 s timeout plus fallback on Slow 4G.
   - Options:
     - (a) show the bundled list first and swap in live data when it arrives;
     - (b) skip live for boards over N jobs on `navigator.connection.saveData` or a slow `effectiveType`;
     - (c) start the bundled fetch in parallel with live.
   - Each changes behaviour (mode badge, bandwidth), so none was done.
4. **Google Fonts CSS is render-blocking** and cross-origin, so FCP pays DNS, TLS and a round trip on real phones. The sandbox aborts it, so the FCP figures here are optimistic. Self-hosting Inter would fix it: `font-src 'self'` is already allowed. That needs `public/index.html` and the CSS.
5. **Insights opens with a 0.9 s task on Anduril** (`features/insights.js`; profile it next).
6. **The Long Tasks API undercounts getJobs work** (finding 2). The earlier `mobile-audit.mjs` TBT numbers should be read with that in mind. `perf-mobile.mjs` reads trace `RunTask` events.
7. Not measured:
   - WebKit (not installed);
   - real Greenhouse responses (the fixture is rebuilt from snapshots);
   - real tile and font downloads.

## 7. Change log

- 2026-10-03 ~01:30 Prompt saved. Built a "before" build. Wrote the harness.
- ~01:40 Found that the live Greenhouse path is the real Pages path (finding 1), and that the Long Tasks API misses getJobs work (finding 2). Harness moved to trace `RunTask`, an HTTP/2 server and CDP Fetch.
- ~01:45 api.js: early cities and Juice, lazy normalize/history/demo, yields and Juice chunks, bundled LRU. Measured and rejected a worker for the bundled list.
- ~01:50 build-static.js: load hints. M-2: `relocateJobs` in the static snapshot path, plus test assertions.
- ~01:57 `unpack-worker.js` for live boards, with main-thread fallback. In-browser equality check against HEAD api.js.
- ~02:00-02:20 Full before/after matrix. ~02:25 Measured the app.js patch on a scratch dist; wrote the patches. npm test 301/301, e2e 64/64.
