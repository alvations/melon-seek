# Process log: perf-mobile-beta

## 1. Brief

Prompt: [prompts/perf-mobile-beta.md](prompts/perf-mobile-beta.md), verbatim, with the lead's notes of 2026-10-11.

Goal: measure load time, main-thread blocking and memory on a mid-range phone for the beta site
(`/melon-seek/beta/`, the big-tech boards, about 20k roles), then fix the biggest costs. The app
stays simple, and what `getJobs` returns stays exactly the same.

Files owned:
- `public/api.js`, `public/unpack-worker.js` (unchanged) and `scripts/build-static.js`;
- `public/app.js` and `public/viz/map.js`: the lead allowed edits where the measurements put the cost
  (no other lane running);
- `test/perf-mobile-beta.test.js` (new);
- `docs/process/scripts/perf-mobile-beta.mjs` (new harness) and `perf-mobile-beta-*.mjs` (tables,
  identity checks);
- `docs/process/patches/perf-mobile-beta-*.diff`: changes proposed for `public/features/*`, not applied;
- this log and the prompt.

Worktree `/home/user/melon-seek/.claude/worktrees/agent-a3f17b73fb82e36c1`, from 0ce5280.

## 2. Inputs and sources

- `docs/process/perf-mobile.md`: the main site's pass (trace-based long tasks, the bundled-list LRU,
  chunked vet and Juice, the unpack worker for live boards, load hints) and its harness
  `docs/process/scripts/perf-mobile.mjs`, which the beta harness extends.
- `docs/process/mobile.md`, `docs/process/qa-mobile-beta.md` (Apple's first card at 3.75 s on a busy
  machine, M-20 windowed list), `docs/CONTRACT.md` (packed list format, `shared`, lazy descriptions,
  `live: false` boards), `docs/process/PLAYBOOK.md`, `docs/process/TEMPLATE.md`.
- Code read: `scripts/build-static.js`, `public/api.js`, `public/unpack-worker.js`, `public/app.js`
  (`prepare`, `derive`, `render`, the list window, `renderInsights`), `public/viz/map.js`,
  `public/features/roles.js`, `compstimate.js`, `comps.js`, `insights.js`, `server/vet.js`,
  `server/juice.js`, `scripts/links-policy.js`.
- Tooling: Playwright from the scratchpad, Chromium 141 at `/opt/pw-browsers/chromium-1194`; DevTools
  network presets (Fast 4G: 165 ms RTT, 1.01 MB/s down; Slow 4G: 562.5 ms, 180 kB/s).

## 3. Findings and decisions

### Findings (baseline at 0ce5280)

1. **Apple's first card (Fast 4G, 6.1 s) is mostly main-thread work after the list lands**, plus a
   late request. From the trace and the CPU profile at 4x CPU:

   | Step | Cost |
   |---|---|
   | List request starts (after app.js, its imports and `getCompanies`) | at 1.86 s; 340 kB gzip, done 2.38 s |
   | `JSON.parse` of 2.19 MB | 0.30 s |
   | `unpackJobs` | 0.19 s |
   | `vetSalaries` (second pass; the build already vetted the list) | 0.19 s |
   | Juice (`attachJuiceAll`, chunked) | 0.50 s |
   | app.js `prepare` (chunked), of which `roleFamily` 1.2 s | 2.0 s |
   | First render: cards window, `derive`, sort, layout | 0.78 s |
   | Chart (idle) | 0.3 s |

   Google, NVIDIA and Microsoft follow the same pattern, scaled by their size.
2. **On Slow 4G the bytes are the limit.** The 26 startup requests (328 kB of JS, 38 kB CSS, a 48 kB
   font, 30 kB of cities) and the list (Apple 340 kB) share 180 kB/s. The list request started at
   4.1 s and ended at 6.5 s.
3. **Some lists carry their sections in the list.** Lists under the 1.5 MB budget keep
   `sections` (bullet lists only the drawer shows). gzip share of the list: Netflix 278 of 310 kB,
   xAI 205 of 225, Scale AI 73 of 89, Cohere 63 of 81, Palantir 57 of 82. The big boards are over
   budget, so theirs already move to the description files.
4. **Every bundled list is a fixed point of `vetSalaries`**: a second pass flags nothing and returns
   the same array (13 of 13 lists, both sites). The browser still ran it on every load (0.19 s on Apple).
5. **Interactions** (Fast 4G, max task): drawer 0.26-0.36 s, a filter tap 0.4-0.5 s, a sort
   0.24-0.45 s, the map's first open 0.6-1.2 s, **Insights 0.85-2.6 s** (Apple and Google 2.6 s).
   - Map: `summarizeJuice` looked every cluster job up in every member place: 0.47 s for Apple.
   - Insights: Compstimate's `normalizeTitle` for every board job runs `expandTitle` about 8 times per
     title (0.55 s self for Apple), and the axis-fitting loops read layout after each write.
6. **No idle CPU** (6-10 ms of tasks in 10 s, no requests, no rAF). **No leak**: over 10 switches
   among the four biggest boards the heap after GC rises to 31 MB with the 3-list LRU full, then stays
   flat (30.6-31.2 MB); DOM nodes cycle 825-935; 96 listeners.
7. **The windowed list (M-20) holds**: 825-935 DOM nodes after load on every board, 2.4-3.6k with
   Insights or the map. Windowing, chart rows and map clusters need no more work at this size.
8. **Build: 105-120 s** (stable site 14-21 s, beta 91-101 s), see 5.6.

### Decisions

1. **Fetch the first job list early** (`scripts/build-static.js#listPreloadJs`, `api.js#bundled`).
   - config.js (a classic script in the head, written by the build) works out the company the app
     will open, exactly as `app.js#boot` does: the link's `c=` (lower-cased, as api.js looks it up),
     else this site's last view from localStorage, else the first company. A custom board or an
     unknown slug gets nothing.
   - It fetches `api/jobs/<slug>.json` with the headers api.js sends, reads the body into a Blob as it
     arrives (an unread body would stall the download) and leaves `window.MELON_FIRST_LIST = { path,
     response }`.
   - `bundled()` takes that response once, for that path only, never on `refresh`, through the same
     `getJson` (status, error body, abort as an `AbortError`).
   - The last-view keys are app.js's `LAST_KEY`; a test keeps them in step.
   - A `<link rel=preload as=fetch>` was tried first and dropped: Chromium decoded the preloaded 2 MB
     body as text twice more on the main thread (an extra 0.22 s task at 4x CPU).
2. **Skip the browser's second vetting pass when it is a no-op.** The build runs `vetSalaries` on
   exactly what the browser unpacks; when it hands back the same array, the list gets
   `shared.vetted: true`, and `getJobs` skips the pass for it. Same code (`lib/vet.js` is
   `server/vet.js`), same input, so the result is the same array as before.
3. **Role families after the first paint** (`app.js`). `prepare()` keeps the `_family` slot where it
   was (same shape and key order) but leaves it `undefined`; `famOf(j)` computes it on first use (the
   role-family filter, `settleKeep`, the drawer's "Same role elsewhere"), `fillFamilies` fills the
   rest in idle slices of 25 jobs after the first render, and `renderInsights` completes it first.
   comps.js and compstimate.js already compute `roleFamily` the same way when `_family` is unset.
4. **One date formatter for every card** (`app.js#ageTitle`): `toLocaleDateString(undefined, opts)`
   built a new formatter per call, twice per card. The formatter is made at load, while the list
   downloads. Making `Intl.DisplayNames` lazy was tried and reverted: ICU's first-use cost then
   landed in the first render (+0.16 s on Anduril's longest task).
5. **Map Juice in one pass** (`viz/map.js#summarizeJuice`): each job's place names in a cluster are
   collected in one pass over the members' entries, the same sets as before (0.47 s → 0.08 s on
   Apple's world view, and every re-cluster on zoom).
6. **Proposed, not applied** (`public/features/*` is patch-only):
   - `perf-mobile-beta-roles-memo.diff`: memoize `expandTitle` (pure; bounded at 20k entries).
     Checked identical on all 24,680 bundled jobs (`expandTitle`, `roleFamily`, `normalizeTitle`,
     `inferSeniority`, `rolePart`, twice each).
   - `perf-mobile-beta-axes-layout.diff`: `insights.js` and `comps.js` `fitAxes` read every rect
     before writing (transforms and visibility move no other box, so the rects are the same).
   - Measured together on a scratch copy of the build, see 5.4.
7. **Measured and not done:**
   - *Moving sections out of lists under budget* (Netflix 310 → about 32 kB gzip, xAI 225 → about 20
     kB). It changes what `getJobs` returns (empty sections until `getJobDetail`), and the drawer's
     "About the role" would appear with the description instead of at once. A product call (section 6).
   - *Faster `unpackJobs`*: a rewrite without the double salary copy measured the same in V8
     (Apple 24 → 30 ms, Google 20 → 18 ms, unthrottled), so it stays.
   - *A cached `Intl.Collator` for sorts*: V8's `localeCompare` fast path is faster (18 vs 34 ms for
     Apple's titles at 4x).
   - *Lossless list tricks* (URLs from id + title slug, `updatedAt` as a copy of `postedAt`): gzip
     already finds most of it, and the URL slugs are board-specific.
   - *Unpack, vet and Juice in a worker for bundled lists*: the main site's pass measured that cloning
     juiced jobs back costs more than it saves; Juice is needed for the first cards.
8. **Measurement method** (`docs/process/scripts/perf-mobile-beta.mjs`, extending `perf-mobile.mjs`):
   - device 390×844, isMobile, touch, DPR 3, Android UA, 4x CPU, CDP `Network.emulateNetworkConditions`;
   - served by `scripts/cycle/serve.mjs` (HTTP/1.1, gzip, `max-age=600`), as the prompt asks;
     off-site hosts through CDP `Fetch` (tiles get a 1×1 PNG, fonts and board APIs fail, so Anduril
     uses its bundled list as on the CORS-failure path);
   - per company and network in one context: cold load, 10 s idle, warm load (new navigation, HTTP
     cache), drawer, a filter change (the first department in the filter sheet, then "Show N roles"),
     sorts by lowest pay and by title, Insights, the map, a switch away and back;
   - long tasks from trace `RunTask` events; each task over 100 ms is attributed by the CPU profile's
     samples inside it (phase = innermost listed function, plus self time and the trace's layout,
     style and GC events);
   - first card and first chart = the frame after their DOM appears; TTI = end of the last long task
     within 2 s of the later of the two; heap from `Performance.getMetrics` (after GC where marked);
   - leak check: 10 switches cycling Google, NVIDIA, Microsoft and Apple, GC twice before each reading.

## 4. Replayable steps

```sh
SP=<scratch>/perf-mobile-beta; export NODE_PATH=<scratch>/pw/node_modules   # never `playwright install`
ln -s /home/user/melon-seek/node_modules node_modules
mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots
# "before" = 0ce5280, built before any edit (or from a worktree of it with the same symlinks):
git worktree add --detach $SP/wt-before 0ce5280   # + the three symlinks above inside it
(cd $SP/wt-before && node scripts/build-static.js --out $SP/dist-before)   # 105 s
node scripts/build-static.js --out $SP/dist                                # this branch, 115-120 s
PORT=5481 node scripts/cycle/serve.mjs --dist $SP/dist-before --pid $SP/serve-before.pid &
PORT=5482 node scripts/cycle/serve.mjs --dist $SP/dist --pid $SP/serve.pid &
H=docs/process/scripts/perf-mobile-beta.mjs
(cd $SP && node $OLDPWD/$H http://127.0.0.1:5481/melon-seek/beta/ before --net=fast4g,slow4g --timeline)
(cd $SP && node $OLDPWD/$H http://127.0.0.1:5482/melon-seek/beta/ after2 --net=fast4g,slow4g --timeline)
# medians of 3 cold loads per cell, both builds:
(cd $SP && node $OLDPWD/$H http://127.0.0.1:5481/melon-seek/beta/ cold3-before --net=fast4g,slow4g --cold-only --runs=3 --no-leak)
(cd $SP && node $OLDPWD/$H http://127.0.0.1:5482/melon-seek/beta/ cold3-after --net=fast4g,slow4g --cold-only --runs=3 --no-leak)
# features patches, measured on a hard-linked copy of the build:
cp -al $SP/dist $SP/dist-patched; (apply docs/process/patches/perf-mobile-beta-*.diff to copies of the three files under dist-patched/beta/features/)
PORT=5483 node scripts/cycle/serve.mjs --dist $SP/dist-patched --pid $SP/serve-patched.pid &
(cd $SP && node $OLDPWD/$H http://127.0.0.1:5483/melon-seek/beta/ patched --co=apple,google,anduril --net=fast4g --no-leak)
S=docs/process/scripts
node $S/perf-mobile-beta-table.mjs $SP/perf-before.json $SP/perf-after2.json       # tables in 5.3, 5.4
node $S/perf-mobile-beta-coldtable.mjs $SP/perf-cold3-before.json $SP/perf-cold3-after.json
# identity: old api.js vs new on the same build; old vs new build script with a pinned time
git show 0ce5280:public/api.js > $SP/api-head.js && node $S/perf-mobile-beta-equal-check.mjs $SP/dist $SP/dist $SP/api-head.js
git show 0ce5280:scripts/build-static.js > scripts/zz-old-build.js     # temporary, deleted after
MELON_BUILT_AT=2026-10-11T00:00:00.000Z GITHUB_SHA=pinned node scripts/zz-old-build.js --out $SP/dist-old-pinned
MELON_BUILT_AT=2026-10-11T00:00:00.000Z GITHUB_SHA=pinned node scripts/build-static.js --out $SP/dist-new-pinned
node $S/perf-mobile-beta-distdiff.mjs $SP/dist-old-pinned $SP/dist-new-pinned; rm scripts/zz-old-build.js
node $S/perf-mobile-beta-roles-check.mjs public/features/roles.js <patched roles.js> $SP/dist
node --cpu-prof --cpu-prof-dir=$SP/prof scripts/build-static.js --out $SP/dist-prof  # 5.6
mkdir -p $SP/empty && MELON_BETA_SNAPSHOT_DIR=$SP/empty npm test
ln -s $SP/dist dist && node scripts/e2e.js     # e2e reads ./dist (both sites); revert docs/screenshots after
kill "$(cat $SP/serve.pid)" "$(cat $SP/serve-before.pid)" "$(cat $SP/serve-patched.pid)"
```

Each harness run writes `perf-<label>.json` (all timings, attributed tasks, waterfalls, requests and
the leak series) to its working directory. One-off probes stayed in the scratchpad: field gzip
shares (`gzfields.mjs`), parse and unpack timing (`parsebench.mjs`, `unpack2.mjs`), collator timing
(`collate.mjs`), trace events inside a task (`taskdig.mjs`), line-level self time (`lineticks.mjs`),
build profile summary (`profsum.mjs`), re-derivation timing (`rederive.mjs`), Juice input repeats
(`juicepairs.mjs`).

## 5. Verification

### 5.1 Tests

- `MELON_BETA_SNAPSHOT_DIR=<empty dir> npm test` (as CI): **765/765** pass, 60 s.
- `node scripts/e2e.js` with `dist` pointing at this branch's build (both sites, real data):
  **192/195 passed, 0 failed, 3 skipped** (data-dependent skips: D-11 needs a board without listing
  dates, the methodology screenshots need `E2E_SHOTS=1`, P-2 needs a low-confidence estimate). The
  run rewrites evidence screenshots under `docs/screenshots/`; those were reverted, not committed.
- `test/perf-mobile-beta.test.js` (7 tests, new; builds a temp site with the real Anthropic snapshot
  or the fixture, so it runs in CI):
  - config.js picks the company app.js#boot opens (link, uppercase link, link without `c=`, custom
    board, unknown slug, stored view, stored unknown, stored custom, no view, bad storage) and never
    throws; its Response reads like api.js's own fetch (status, `ok`, body, a network failure);
  - the last-view keys equal app.js's `LAST_KEY` on each site, and each site's config.js carries its
    own companies in `companies.json` order;
  - every list marked `shared.vetted` is one `vetSalaries` returns as the same array;
  - static `getJobs` on both sites equals the old pipeline (unpack → vet → juice) deeply and in key
    order, with the first list taken from `MELON_FIRST_LIST` (and not fetched again);
  - the early list is used only for its own path, never on refresh, and an abort still rejects with
    `AbortError`.

### 5.2 Same output

- **Full scale** (`$SP/equal-check.mjs`): HEAD's `api.js` (0ce5280) and the new one, on the real
  build, `getJobs` for all 13 companies of both sites (21 lists: 8 stable, 13 beta), plus switch-back
  from the LRU: deep-equal and identical `JSON.stringify` (key order). Every list is `shared.vetted`.
- **Build output**: pinned builds with the old and new build script differ only by `shared.vetted`
  in the 21 lists and by `config.js` (5.6).
- **roles.js memo patch** (`$SP/roles-check.mjs`): `expandTitle`, `roleFamily`, `normalizeTitle`,
  `inferSeniority` and `rolePart` equal the unpatched module for all 24,680 bundled jobs, twice
  (the second pass reads the memo).
- **app.js families**: `famOf` is `roleFamily(j.title, j)` of the prepared title, as `prepare()`
  computed it; comps.js and compstimate.js compute the same value when the slot is unset.
- In the browser runs: no page errors or console errors in any run (the harness records them).

### 5.3 Before → after: loads (4x CPU, 390×844)

**Medians of 3 cold loads per cell** (the record; spreads below). Times from navigation; "max task"
is the longest main-thread task, TBT the sum over 50 ms after FCP. Load average 0.9-2.0.

| Network · company | FCP | First card | First chart | TTI | Max task | TBT |
|---|---|---|---|---|---|---|
| Fast 4G · Apple | 856 ms → **856 ms** | 6.2 s → **4.1 s** | 6.7 s → **4.6 s** | 7.2 s → **5.1 s** | 754 ms → **799 ms** | 2.9 s → **1.8 s** |
| Fast 4G · Google | 836 ms → **832 ms** | 5.4 s → **3.9 s** | 5.8 s → **4.4 s** | 6.1 s → **4.8 s** | 696 ms → **702 ms** | 2.2 s → **1.5 s** |
| Fast 4G · NVIDIA | 800 ms → **836 ms** | 5.0 s → **3.6 s** | 5.4 s → **4.1 s** | 5.8 s → **4.4 s** | 764 ms → **648 ms** | 2.3 s → **1.4 s** |
| Fast 4G · Microsoft | 832 ms → **800 ms** | 4.8 s → **3.5 s** | 5.2 s → **4.0 s** | 5.6 s → **4.5 s** | 786 ms → **713 ms** | 2.2 s → **1.5 s** |
| Fast 4G · Netflix | 856 ms → **776 ms** | 3.8 s → **2.6 s** | 4.1 s → **2.9 s** | 4.5 s → **3.4 s** | 470 ms → **388 ms** | 1.4 s → **907 ms** |
| Fast 4G · Anduril | 828 ms → **844 ms** | 5.0 s → **3.5 s** | 5.4 s → **4.0 s** | 6.0 s → **4.6 s** | 642 ms → **677 ms** | 2.2 s → **1.5 s** |
| Slow 4G · Apple | 1.8 s → **1.8 s** | 10.7 s → **8.8 s** | 11.1 s → **9.2 s** | 12.3 s → **10.4 s** | 873 ms → **771 ms** | 3.0 s → **1.8 s** |
| Slow 4G · Google | 1.8 s → **1.8 s** | 9.8 s → **8.1 s** | 10.0 s → **8.5 s** | 11.2 s → **8.8 s** | 848 ms → **701 ms** | 2.6 s → **1.5 s** |
| Slow 4G · NVIDIA | 1.8 s → **1.8 s** | 8.5 s → **7.1 s** | 8.8 s → **7.5 s** | 9.9 s → **8.6 s** | 682 ms → **614 ms** | 2.1 s → **1.3 s** |
| Slow 4G · Microsoft | 1.7 s → **1.8 s** | 8.6 s → **7.1 s** | 9.1 s → **7.5 s** | 10.2 s → **8.7 s** | 725 ms → **681 ms** | 2.3 s → **1.5 s** |
| Slow 4G · Netflix | 1.8 s → **1.8 s** | 7.8 s → **7.0 s** | 8.1 s → **7.4 s** | 8.4 s → **8.5 s** | 434 ms → **381 ms** | 1.2 s → **894 ms** |
| Slow 4G · Anduril | 1.7 s → **1.8 s** | 8.6 s → **7.1 s** | 9.0 s → **7.5 s** | 10.1 s → **8.7 s** | 600 ms → **524 ms** | 2.0 s → **1.3 s** |

Spread of the first card (min-max of the 3 runs): before, Fast 4G Apple 5.9-6.3 s, Google 5.3-5.4,
NVIDIA 4.6-5.0, Microsoft 4.6-4.9, Netflix 3.5-3.9, Anduril 4.9-5.1; after 3.9-4.2, 3.7-3.9, 3.4-3.7,
3.3-3.8, 2.6-2.7, 3.4-3.8. Slow 4G before 10.6-10.9, 9.5-9.9, 8.3-8.8, 8.4-9.1, 7.7-8.0, 8.3-8.7;
after 8.7-8.9, 8.0-8.2, 7.1-7.3, 7.0-7.2, 7.0-7.1, 7.0-7.2. The ranges never overlap.

**Full runs** (one per cell: cold, warm, switch away and back; load 1.0-1.6):

| Network · company | FCP | First card | First chart | TTI | Max task | TBT | Heap | Warm first chart | Switch away / back |
|---|---|---|---|---|---|---|---|---|---|
| Fast 4G · Apple | 860 ms → 844 ms | 6.1 s → 4.5 s | 6.8 s → 4.9 s | 7.2 s → 5.3 s | 815 ms → 944 ms | 2.9 s → 2.1 s | 17.4 MB → 18.6 MB | 4.9 s → 3.2 s | 2.8 s → 2.0 s / 1.2 s → 1.1 s |
| Fast 4G · Google | 832 ms → 784 ms | 5.5 s → 3.7 s | 5.9 s → 4.1 s | 6.4 s → 4.4 s | 660 ms → 706 ms | 2.4 s → 1.4 s | 16 MB → 23.2 MB | 4.2 s → 2.8 s | 3.2 s → 1.8 s / 1.1 s → 968 ms |
| Fast 4G · NVIDIA | 744 ms → 812 ms | 4.7 s → 3.3 s | 5.1 s → 3.7 s | 5.5 s → 4.3 s | 613 ms → 572 ms | 2.0 s → 1.2 s | 14.6 MB → 18.4 MB | 3.3 s → 2.5 s | 3.4 s → 2.3 s / 991 ms → 1.0 s |
| Fast 4G · Microsoft | 828 ms → 804 ms | 4.3 s → 3.3 s | 4.7 s → 3.7 s | 4.9 s → 4.2 s | 601 ms → 640 ms | 1.8 s → 1.3 s | 14.9 MB → 16.2 MB | 3.3 s → 2.4 s | 4.0 s → 2.4 s / 985 ms → 876 ms |
| Fast 4G · Netflix | 808 ms → 836 ms | 3.4 s → 2.6 s | 3.6 s → 3.0 s | 3.8 s → 3.5 s | 415 ms → 373 ms | 1.1 s → 914 ms | 8.9 MB → 9.1 MB | 2.0 s → 1.7 s | 4.7 s → 3.0 s / 541 ms → 528 ms |
| Fast 4G · Anduril | 776 ms → 764 ms | 4.5 s → 3.6 s | 5.0 s → 4.1 s | 5.5 s → 4.4 s | 563 ms → 591 ms | 1.9 s → 1.6 s | 12.9 MB → 22.7 MB | 3.4 s → 2.7 s | 4.0 s → 2.9 s / 839 ms → 892 ms |
| Slow 4G · Apple | 1.7 s → 1.8 s | 10.2 s → 8.9 s | 10.5 s → 9.3 s | 10.7 s → 10.5 s | 797 ms → 882 ms | 2.5 s → 2.0 s | 17.4 MB → 30.1 MB | 4.9 s → 3.0 s | 3.9 s → 3.1 s / 1.1 s → 1.0 s |
| Slow 4G · Google | 1.7 s → 1.7 s | 9.4 s → 7.9 s | 9.7 s → 8.3 s | 9.8 s → 9.3 s | 726 ms → 570 ms | 2.2 s → 1.3 s | 14.7 MB → 23.4 MB | 4.3 s → 2.7 s | 3.9 s → 3.1 s / 1.1 s → 912 ms |
| Slow 4G · NVIDIA | 1.8 s → 1.8 s | 8.3 s → 7.2 s | 8.5 s → 7.6 s | 9.7 s → 7.9 s | 601 ms → 555 ms | 1.9 s → 1.4 s | 15.5 MB → 11.8 MB | 2.9 s → 2.4 s | 5.2 s → 4.0 s / 887 ms → 881 ms |
| Slow 4G · Microsoft | 1.8 s → 1.7 s | 8.3 s → 6.9 s | 8.6 s → 7.3 s | 9.8 s → 7.5 s | 722 ms → 558 ms | 2.1 s → 1.2 s | 13.7 MB → 16.3 MB | 3.1 s → 2.4 s | 6.4 s → 5.0 s / 970 ms → 989 ms |
| Slow 4G · Netflix | 1.8 s → 1.7 s | 7.9 s → 7.0 s | 8.3 s → 7.2 s | 9.4 s → 8.4 s | 563 ms → 363 ms | 1.4 s → 896 ms | 9 MB → 8.7 MB | 2.0 s → 1.5 s | 6.7 s → 4.9 s / 710 ms → 637 ms |
| Slow 4G · Anduril | 1.8 s → 1.8 s | 8.4 s → 7.2 s | 8.9 s → 7.6 s | 10.1 s → 8.8 s | 550 ms → 549 ms | 2.1 s → 1.3 s | 16.1 MB → 22.4 MB | 3.5 s → 2.6 s | 6.0 s → 5.1 s / 901 ms → 1.0 s |

Notes:
- "Heap" is right after the cold load, before any GC, so it moves with GC timing (12-30 MB either
  side). After GC at the end of each run it is unchanged: Apple 24.4 → 24.3 MB, Google 22.3 → 22.1,
  NVIDIA 21.2 → 21.1, Microsoft 23 → 22.8, Netflix 18.4 → 18.2, Anduril 24.8 → 24.6.
- Switch away = Apple → Microsoft, Microsoft → Apple, Google → NVIDIA, NVIDIA → Google, Netflix → Apple,
  Anduril → Apple; that list is not fetched early (only the first one is), but it skips the second
  vetting pass and the families. Switch back is the LRU (same job objects).
- Where Apple's first card goes now (Fast 4G, one traced run): the list arrives at 1.6 s (requested at
  0.43 s), parse 0.1-0.2 s, unpack 0.2 s, Juice 0.4 s, prepare 0.15 s, first render 0.8 s; the role
  families fill in 25-job idle slices from about 0.3 s after the chart (one 90 ms slice when
  `roleFamily`'s regexes first compile, the rest under 50 ms).

### 5.4 Interactions (Fast 4G; wall time / longest task; one run each, ±30% run to run)

| Company | List (gzip) | Drawer | Filter change (+ Show N) | Sort (lowest pay) | Insights | Map, first open | Idle 10 s | Heap after GC |
|---|---|---|---|---|---|---|---|---|
| Apple | 340 kB → 340 kB | 732 ms / 285 ms → 913 ms / 467 ms | 1.2 s / 421 ms → 1.2 s / 469 ms | 488 ms / 422 ms → 551 ms / 468 ms | 2.8 s / 2.6 s → 2.9 s / 2.8 s | 1.7 s / 1.2 s → 1.4 s / 1.1 s | 6 ms → 7 ms | 24.4 → 24.3 MB |
| Google | 273 kB → 273 kB | 724 ms / 363 ms → 623 ms / 293 ms | 1.2 s / 471 ms → 1.3 s / 610 ms | 385 ms / 332 ms → 429 ms / 363 ms | 2.8 s / 2.6 s → 2.4 s / 2.3 s | 1.6 s / 1.2 s → 1.5 s / 1.2 s | 10 ms → 9 ms | 22.3 → 22.1 MB |
| NVIDIA | 179 kB → 179 kB | 707 ms / 277 ms → 607 ms / 275 ms | 1.2 s / 428 ms → 1.1 s / 374 ms | 381 ms / 325 ms → 355 ms / 307 ms | 2.0 s / 1.9 s → 2.0 s / 1.8 s | 1.2 s / 867 ms → 1.1 s / 834 ms | 6 ms → 6 ms | 21.2 → 21.1 MB |
| Microsoft | 169 kB → 169 kB | 707 ms / 256 ms → 800 ms / 308 ms | 1.3 s / 451 ms → 1.4 s / 445 ms | 391 ms / 331 ms → 346 ms / 295 ms | 2.2 s / 2.0 s → 2.1 s / 1.9 s | 1.3 s / 1.0 s → 1.3 s / 980 ms | 8 ms → 7 ms | 23 → 22.8 MB |
| Netflix | 311 kB → 311 kB | 665 ms / 296 ms → 566 ms / 272 ms | 1.0 s / 403 ms → 1.1 s / 383 ms | 301 ms / 244 ms → 288 ms / 224 ms | 1.0 s / 847 ms → 1.3 s / 1.1 s | 759 ms / 588 ms → 733 ms / 548 ms | 7 ms → 10 ms | 18.4 → 18.2 MB |
| Anduril | 164 kB → 164 kB | 811 ms / 306 ms → 1.1 s / 389 ms | 1.2 s / 454 ms → 1.3 s / 458 ms | 496 ms / 447 ms → 375 ms / 294 ms | 2.7 s / 2.5 s → 2.9 s / 2.5 s | 1.3 s / 928 ms → 1.2 s / 946 ms | 7 ms → 5 ms | 24.8 → 24.6 MB |

- Drawer, filter and sort did not change (two reruns of Anduril each way: drawer 1.06/1.15/1.02/0.84 s
  before, 1.12/0.93/0.84/1.20 s after).
- **Map**: `summarizeJuice` 469 → 84 ms (Apple), 335 → 98 (Google), 164 → 58 (Anduril); the re-cluster
  task after the first open 351 → 147 ms (Apple). The first open's task stays about 1 s: Leaflet and
  markers, the list re-render on the mode switch (about 0.2 s), and `freshness.js#isoDay` (70 ms).
- **Insights with the two features patches** (scratch copy of the build): Apple 2.75 → 2.08 s
  longest task, Google 2.25 → 1.88 s, Anduril 2.54 → 1.98 s. `expandTitle` leaves the profile; one
  forced layout of the Insights DOM (about 0.3 s) stays.

### 5.5 Resources, idle, memory

| Item | Before | After |
|---|---|---|
| JS (cold) | 24 requests, 326 kB gzip (Anduril 26 / 331) | 24, 328 kB (config.js +0.7 kB) |
| CSS | 4, 38 kB | same |
| Fonts | 1, 48 kB (self-hosted Inter) | same |
| JSON (cold) | companies 0.6 kB + cities 29 kB + the list | same requests, the list starts at 0.4 s instead of 1.9 s (Fast 4G) |
| Job list, gzip / raw | Apple 340 kB / 2.19 MB, Google 273 / 1.43, NVIDIA 179 / 1.21, Microsoft 169 / 1.08, Netflix 311 / 1.09, Anduril 164 / 1.17 | same (+14 bytes for `"vetted":true`) |
| Tiles | none until the map | same |
| DOM after load | 825-935 nodes | same; 2.4-3.6k with Insights or the map |
| CPU in 10 s idle | 6-10 ms of tasks, 0 requests, 0 rAF, 0 layouts | 5-10 ms |
| Warm load | every file from the HTTP cache | same |

Leak check (heap MB after 2 GCs: start on Apple, then 10 switches cycling Google, NVIDIA, Microsoft,
Apple; the same on both networks):

| Build | Readings | DOM nodes | Listeners |
|---|---|---|---|
| Before | 14.4, 20.9, 25.8, 30.4, 31.0, 31.0, 30.8, 30.9, 31.2, 31.0, 30.9 | 825-935 | 96 |
| After | 14.2, 20.7, 25.7, 30.2, 30.8, 30.9, 30.6, 30.7, 31.0, 30.8, 30.7 | 825-935 | 96 |

The rise to 31 MB is the 3-list LRU filling (four boards in the cycle); after that it is flat, so no
leak. Switch times in that loop: 1.1-2.3 s after, 1.6-3.4 s before (Fast 4G).

### 5.6 Build time

Quiet machine (load 0.6-1.0), `MELON_BUILT_AT` and `GITHUB_SHA` pinned so the two outputs compare
file by file:

| Build script | Stable site | Beta copy | Total |
|---|---|---|---|
| 0ce5280 | 14.2 s | 85.5 s | 99.8 s |
| This branch | 14.3 s | 87.7 s | 102.2 s (the extra vetting check per list) |

The two outputs: 24,903 files, 24,880 byte-identical; the 21 job lists equal but for `shared.vetted`;
the two `config.js` differ by design (`$SP/distdiff.mjs`). Unpinned builds took 105-120 s (load 1-1.3).

Where the time goes (`node --cpu-prof`, 109 s under the profiler):

| Step | Time |
|---|---|
| `rekeyBoardJobs` (re-deriving sections and keywords of the norm-6 beta snapshots) | 48.4 s |
| `relocateJobs` (re-geocoding and relabelling them) | 6.6 s |
| Compstimate `backtest` (13 boards, up to 500 roles each) | 22.5 s |
| Beta vetting gate (`scanCompany`) | 4.9 s |
| Writing files (lists, 24k description files, CSV) | 3.5 s |
| GC 4.6 s, idle (I/O) 8.8 s, everything else | about 8 s |

Per beta board, timed alone: Apple 16.6 + 2.5 s, Google 10.0 + 1.4, Microsoft 11.4 + 1.6, NVIDIA
7.9 + 1.2, Netflix 1.8 + 0.3 (rekey + relocate). The stable boards are already norm-7, so they skip it.

**Caching the re-derivation is not worth it.** It is about 55 s of the 100 s, but only until the next
beta crawl writes norm-7 snapshots; then `readSnapshot` skips it and the build drops to about 45 s
with no code change. A cache would have to be keyed on the snapshot and on every module the
normalizer reads (normalize.js, keywords.js, geo.js, salary.js, sources/*), and a stale entry would
ship wrong data; it would only pay off if `NORMALIZER_VERSION` changed more often than the crawls run.
The steady-state cost to look at next is the Compstimate backtest (22.5 s; `estimateComp` 7.7 s self).

## 6. Known gaps and follow-ups

Measured but not fixed, biggest first:

1. **Product call: sections in lists under the budget.** Lists under 1.5 MB raw keep `sections`, which
   only the drawer shows: 90% of Netflix's list (310 kB gzip, 1.7 s on Slow 4G) and of xAI's (225 kB),
   70-80% of Scale AI, Cohere and Palantir. Moving them to the description files, as the big boards
   already do, would make Netflix's list about 32 kB. It changes what `getJobs` returns (empty
   sections until `getJobDetail`), and the drawer's "About the role" would arrive with the
   description, so it was not done. Simplest form: also move sections when they are most of the
   list's gzip size, or budget by gzip size.
2. **Insights opens with a 1.9-2.8 s task** on the big boards. The two patches
   (`docs/process/patches/perf-mobile-beta-roles-memo.diff`, `-axes-layout.diff`) cut it by 0.4-0.7 s.
   The rest: Compstimate's index (`normalizeTitle` for every board job), one forced layout of the
   Insights DOM, `percentile`. Next step for the features owner: build the Compstimate index in idle
   time after load, or for the filtered set first.
3. **The first render is now the longest load task** (0.4-0.95 s at 4x): `derive` (facet counts for
   every filter, including the hidden filter panel's keyword clouds), the 24-card window and the
   page's first layout. Counting the hidden panel's facets only when it opens would shorten it; that
   is app.js render logic, beyond this brief's "simple" bar.
4. **Slow 4G is bandwidth-bound.** The early fetch overlaps the list with the app's 328 kB of JS, but
   the bytes share 180 kB/s, so the list still finishes at about the same time (Apple 6.4 s); the
   gain there is the CPU work. Smaller startup JS would help: `viz/map.js` (13 kB), `features/compstimate.js`
   (19 kB), `comps.js` (8 kB) and `freshness.js` (6 kB) are in the static import graph but serve only
   the map, the drawer and Insights.
5. **Map first open about 1 s** (Leaflet, markers, the list re-render on the mode switch,
   `freshness.js#isoDay` 70 ms via the Juice "as of" note).
6. **Juice at load: 0.3-0.5 s** for Apple (`server/juice.js#computeJuice` per job and place). The
   inputs repeat: Apple computes 3,852 (salary, currency, place) cases of which 773 are distinct;
   NVIDIA 2,661 / 406, Anduril 3,141 / 638, Microsoft 2,713 / 785, Google 4,678 / 1,657. A memo
   inside juice.js (copying the result per job) would cut most of it. Not my file.
7. **Serving:** the record uses `scripts/cycle/serve.mjs` (HTTP/1.1) as the prompt asks; Pages serves
   HTTP/2, so the 26 startup requests queue less there (perf-mobile.md used an HTTP/2 server).
8. **Not measured:** WebKit (not installed), a real phone, Anduril's live Greenhouse path on the beta
   site (the harness fails board APIs, so Anduril is on its bundled list), real tile and font downloads.

Patches for other owners (in `docs/process/patches/`, not applied):
- `perf-mobile-beta-roles-memo.diff` (`public/features/roles.js`);
- `perf-mobile-beta-axes-layout.diff` (`public/features/insights.js`, `public/features/comps.js`).

## 7. Change log

- 2026-10-11 00:57 Prompt saved, worktree set up. 00:59 baseline build (105 s). Harness written.
- 01:03-01:20 Baseline matrix (load 0.2-1.6). Commit 370a905.
- 01:20-01:35 Early list (preload, then fetch + Blob after the decode finding), `shared.vetted`,
  deferred role families, date formatter, map Juice pass; features patches written. Identity check on
  all 13 boards. Commits 9dc8dc6, 49496a2.
- 01:41-02:00 After matrix; reruns of Anduril to separate noise; lazy `Intl.DisplayNames` reverted,
  `_family` slot kept in `prepare()`. Commit e2d57de.
- 02:08 Patched-features measurement; final after matrix (after2). Commit d1ee173 (patches, harness
  `--cold-only --runs`).
- 02:25 Medians of 3 cold loads per cell, both builds. 02:37 `npm test` 765/765. 02:38-02:50 e2e
  192/195 (3 skipped). 02:51-02:58 pinned builds compared file by file, re-derivation timed, build
  profiled. Log completed.
