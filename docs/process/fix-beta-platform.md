# Process log: fix-beta-platform (data loading, server, chart and map lane, target `beta`)

> **Interrupted and resumed.** The first run of this lane was cut off by a container restart on
> 2026-10-10, after its code, tests, patches and screenshots were written but before its log and
> final checks. The lead saved that work as WIP commit `f3db92c`, on top of `8c598c2`. A second run
> resumed from `f3db92c`. It re-checked each change against its finding, aligned the chart with the
> names the app lane's `roles.js` exports, made the P-3 test exact for both states, wrote this log,
> re-ran every check and amended the commit. Nothing was restarted from scratch.
>
> While the second run worked, the lead integrated beta batch 1 (`0d3bbde`: the sources, pay and app
> lanes, the app lane's chart patch and both build-static.js patches). This lane's commit stays on
> `8c598c2`, as asked. §5.2 checks it on top of `0d3bbde` too, and §6 says how the two `chart.js`
> versions fit together.

## 1. Brief

Prompt: [prompts/fix-beta-platform.md](prompts/fix-beta-platform.md) (verbatim). Fix, for target `beta`:

- D-20: server mode ignores the beta snapshots;
- DQ-7: never show demo postings under a real company's name;
- D-29: the Ranges tooltip repeats a code-only currency;
- M-23: map pins cap at "999+" (the map and chart side);
- the chart side of shared decision 1 (Group by seniority uses `displayLevel(job)`);
- the isolation of `test/links-policy.test.js`.

Sources: `docs/QA.md` (beta desktop D-17 to D-30 and beta mobile M-19 to M-27) and
`docs/process/data-check-beta.md` (DQ-7).

Files owned:
- `public/api.js`, `public/unpack-worker.js` (unchanged);
- `scripts/build-static.js`, `server/index.js`;
- `public/viz/chart.js`, `public/viz/map.js`, `public/viz/viz.css` (unchanged);
- `test/links-policy.test.js` (isolation only), and the new `test/fix-beta-platform.test.js`.

Other files are changed only through patches in `docs/process/patches/` (§3.9). The TODO markers of
the two DQ-7 tests in `test/beta-data-check.test.js` come off, and the P-3 ladder assertion in
`test/fix-viz.test.js` is made exact for both `roles.js` states (§3.6).

Worktree: `/home/user/melon-seek/.claude/worktrees/agent-a8ac469befd1178f8`, from `8c598c2`. Never pushed.

## 2. Inputs and sources

- `docs/CONTRACT.md`:
  - the `getJobs` result shape and its static-mode notes (v2);
  - v3 "beta channel" (`live: false`, "never demo data", server mode);
  - shared decision 4: keep every export's signature and shape, adding fields is fine.
- `docs/strategy/ROADMAP.md` §8: no new main-view control; this lane adds none.
- `docs/process/PLAYBOOK.md` (Stage 2 gate, known traps) and `docs/process/TEMPLATE.md`.
- `docs/QA.md`: D-20 (cause: `SNAPSHOT_DIR`, `readSnapshot()`, `publicError()`), D-29 (`showJobTip()`) and
  M-23 (`pinElement()`, the chart's bin cap, and the drawer counter in `app.js`). Their e2e tests:
  - `test/e2e/beta-desktop-qa.e2e.js` `[D-20]`, `[D-29]`;
  - `test/e2e/beta-mobile-qa.e2e.js` `[M-23]`.
- `docs/process/data-check-beta.md` DQ-7: the two paths to demo postings, and the 773 demo files per
  site. Its tests are in `test/beta-data-check.test.js`.
- `scripts/build-static.js`: how the build reads beta inputs (`MELON_BETA_SNAPSHOT_DIR`, default
  `data/beta/snapshots/`, then `MELON_SNAPSHOT_DIR`; ledgers from `MELON_BETA_HISTORY_DIR`, then
  `MELON_HISTORY_DIR`). The server now does the same.
- `server/pipeline.js`: it already refuses a live task for a `live: false` company
  (`err.code = 'live_disabled'`). That code did not survive into `publicError()`, so the server said
  "upstream error".
- The other beta lanes, for fit only (their code was not copied):
  - **app lane** (`agent-a8679f7a12c6c6c9a`, `7be1f6f`, in batch 1 as `08e39cc`): `public/features/roles.js` exports `displayLevel(job)`,
    `NOT_STATED` ('Not stated'), `DISPLAY_LEVEL_ORDER`, `levelKey` and `levelFromKey`, and
    `levelLabel('Mid')` reads "Mid". Its patch `fix-beta-app-chart-displaylevel.diff` groups the chart by
    `displayLevel(job)` with `SENIORITY_ORDER = DISPLAY_LEVEL_ORDER`. It also fixed the M-23 drawer
    counter ("1 of 6,105") in `app.js`;
  - **pay lane** (`fix-beta-pay-pack-seniority-basis.diff`) and **sources lane**
    (`fix-beta-sources-build-static.diff`) each patch `scripts/build-static.js`. My build-static.js
    changes stay out of their hunks (§5.3).

## 3. Decisions and rationale

1. **DQ-7, the honest behaviour: a failed load is an error with Retry.**
   - Root cause: `staticJobs` (`public/api.js`) tried `api/jobs/<slug>.json`, then `api/demo/<slug>.json`,
     then generated demo postings in the browser. `bundled()` returns null on any failure (404, 5xx, a
     dropped connection, truncated JSON). So a stable company fell back to its shipped demo list with
     the false note "no real snapshot was bundled", and a beta company got 80 generated postings.
   - Decision: a built-in company never gets demo postings in the browser. With no live result, no
     earlier result and no bundled list, `getJobs` resolves to
     `{ company, mode: 'snapshot', fetchedAt: null, error, jobs: [], meta, unavailable: true }`
     (`public/api.js:607-615`).
   - `error` is one plain sentence:
     - "The saved list of Apple roles didn't load. Check your connection and try again.";
     - "Scale AI's live board couldn't be reached and the saved list of its roles didn't load. …"
       after a failed live fetch.
   - Nothing is cached, so the next call (Retry) tries again.
   - Alternatives:
     - throwing from `getJobs`. The app would show its error card with no app change, but the DQ-7 tests
       (and the contract's "resolves to a result") expect a result with `jobs`;
     - keeping the stable demo list with a corrected note. That still shows invented postings under a
       real name.
   - The new key `unavailable` is additive (decision 4); every other result keeps exactly its old keys.
   - `mode` stays one of the contract's four.
2. **DQ-7, the build: no second demo list.** `stableCompany()` and `writeCompany()`
   (`scripts/build-static.js:897`, `:941`) no longer write `api/demo/<slug>.json` or the
   `api/desc/<slug>/demo-<slug>-NNN.json` file per demo posting next to a real snapshot. That is
   773 files per site on 2026-10-10, and the beta copy shipped them again.
   - Nothing honest needs them. A stable company built with no snapshot at all (a fresh clone, the
     tests) still gets its build-time demo in `api/jobs/<slug>.json`, `mode: "demo"` with its "Synthetic
     demo data" error. That is labelled, and the README documents it.
   - `companyFiles()` drops the demo path. `betaLeaks()` still checks `api/demo/<beta slug>.json`, a
     free guard against a stale file.
   - "Add board" custom boards keep their in-browser demo, labelled "Live fetch skipped/failed …"
     (`public/api.js:617`).
   - Documented in `docs/CONTRACT.md`, v2, under "Nothing to show: `unavailable: true`", and in v3 server mode.
3. **D-20, server mode reads the beta snapshots.**
   - Root cause: `server/index.js` read snapshots and ledgers only from `MELON_SNAPSHOT_DIR` and
     `MELON_HISTORY_DIR`. It tried a live fetch for `live: false` boards, which the pipeline refuses
     (`live_disabled`). That error was reported as "upstream error", and the fallback was demo data.
   - Fix:
     - `BETA_SNAPSHOT_DIR` and `BETA_HISTORY_DIR` (`server/index.js:28`, `:290`) and `dataDirs()` (`:152`):
       a beta company is looked for in its own folder first, then the stable one, as the build does;
     - the store key includes the file path (`:220`);
     - a `live: false` board is never fetched from a request (`:653`), so its snapshot is served with
       `error: null`, as in static mode;
     - a beta or `live: false` company with nothing on hand is `unavailablePayload()` (`:162`, `:686`):
       "Netflix's roles are not available yet: there is no saved copy of its careers site. They appear
       after the next crawl." A paused board says it is paused. It is never demo data;
     - `/api/export` answers 503 for it (`:905`), and `getMarket()` skips it (`:589`);
     - `publicError()` names `live_disabled` (`:143`).
   - Stable companies keep the documented server-mode demo fallback (README "A fresh clone … shows demo
     data").
4. **D-29, a currency is named once.** Root cause: `showJobTip()` appended `` ` ${cur}` `` after
   `formatCurrency()` had already written a code-only currency ("PLN 345K – PLN 702K PLN").
   - `withCurrencyCode(text, currency)` (`public/viz/chart.js:93`, used at `:1060`) adds the code only
     when the text does not already contain it as a word, and never for USD.
   - So "€80K – €100K EUR" and "CA$90K – CA$120K CAD" keep their code, and "PLN 345K – PLN 702K",
     "CHF 232K – CHF 470K" and "CZK 1M – CZK 2M" get nothing more.
5. **M-23, short counts.** `shortCount(n)` (`public/viz/chart.js:103`):
   - 999, then "1K", "1.3K", "4.5K", "9.9K", "10K", "999K", "1M", "4.2M";
   - one decimal under 10, whole numbers above; it rounds to the nearest and moves to "M" at 999,500.
   - It replaces the "999+" caps on map pins (`public/viz/map.js:505`, `:514`) and on cluster circles
     (`chart.js:672`). The exact count stays in the accessible names: `pinName()` gives "Cupertino, CA
     …: 4,460 postings" and the circles give "4,460 roles, …".
   - `map.js` imports it from `chart.js`. `app.js` loads both statically, so this adds no request.
   - The drawer counter ("1 of 6105") is `app.js` `renderDrawerNav()`, which the app lane fixed in `7be1f6f`.
6. **Shared decision 1, the chart side.**
   - `chart.js` imports `roles.js` as a namespace (`chart.js:35`). A named import of a missing export
     would stop the module from loading, and the app lane's `roles.js` is not in this tree.
   - `levelOf(job)` (`:45`) is `displayLevel(job)` when `typeof roles.displayLevel === 'function'`, else
     `job.seniority`. The key of "Level not stated" is `roles.NOT_STATED` ('Not stated'), else the stored
     default 'Mid'.
   - `SENIORITY_ORDER` (`:65`) is `roles.DISPLAY_LEVEL_ORDER` when it exists: Intern, Entry, Mid, Senior,
     Staff+, Manager, Director+, Not stated. Otherwise it is today's ladder with the default 'Mid' last.
   - `keyOf(job, 'seniority')` and the tooltip's level line use `levelOf`.
   - So this `chart.js` behaves like the app lane's `fix-beta-app-chart-displaylevel.diff` once its
     `roles.js` lands. Batch 1 applied that patch, so either version is right after integration (§6).
   - `test/fix-viz.test.js` P-3 now asserts the exact ladder for each state: with displayLevel, also the
     'default' and 'title' rows.
7. **Links-policy test isolation.** Root cause: `test/links-policy.test.js` set the stable input folders
   but not the beta ones, so its build read the real `data/beta/snapshots/` (113 MB) through ROOT. That
   took over a minute and timed out under load: 5 of the 6 failures in the first run's baseline.
   - Fix: own empty `snaps`, `hist`, `beta-snaps` and `beta-hist` folders (and `MELON_BETA_COMPANIES=''`).
   - The beta copy carries one big-tech company from a one-posting Apple fixture, so the policy still
     checks a beta share page and a posting link on a career host.
   - The test also asserts that the fixture's share page exists. It now takes about 5 s.
8. **Keep `public/api.js` and `scripts/build-static.js` small** (the performance pass owns them next):
   - the api.js change is the bundle step and its header comment;
   - the build-static.js change is the demo-list removal only, with no change to `readSnapshot()` or
     `COLUMN_KEYS`, so the pay and sources patches still apply (§5.3).
9. **Patches** (files this lane does not own):
   - `docs/process/patches/fix-beta-platform-app-unavailable.diff` (`public/app.js`, app lane). It is
     needed for DQ-7 and D-20 to show as an error.
     - `loadJobs()` turns `res.unavailable` into the existing "Couldn't load this board" card with Retry;
     - `prefetchSaved()` skips such a result instead of counting it.
     - Without it, the app shows the empty result as "No open roles on this board", which is false
       (but not demo data); see `after-dq7-beta-apple-list-fails-1440.png`.
     - Applies to `8c598c2`, and to the app lane's `7be1f6f` and batch 1 `0d3bbde` (offsets 8 and 89 lines).
   - `docs/process/patches/fix-beta-platform-readme.diff` (`README.md`): drops the `dist/api/demo` row,
     rewrites the static fallback chain, and adds the server's beta snapshot folder.
   - `docs/process/patches/fix-beta-platform-test-isolation.diff` (`test/og.test.js`,
     `test/perf-mobile.test.js`, `test/static-build.test.js`). These builds also read the local beta
     snapshots when they exist. This gives them empty beta inputs, as in links-policy. It is optional:
     CI has no beta data, and `npm test` with `MELON_BETA_SNAPSHOT_DIR=<empty>` is fast without it.

## 4. Replayable steps

```sh
WT=/home/user/melon-seek/.claude/worktrees/agent-a8ac469befd1178f8
S=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fix-beta-platform
cd "$WT"
ln -s /home/user/melon-seek/node_modules node_modules
mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots \
  && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots
ln -s "$S/dist" dist                          # this lane's dist/, never the shared one

# Unit tests, as CI runs them (no beta data):
mkdir -p "$S/empty-beta" && MELON_BETA_SNAPSHOT_DIR="$S/empty-beta" npm test
node --test test/fix-beta-platform.test.js test/links-policy.test.js test/beta-data-check.test.js test/fix-viz.test.js

# Full build with the real snapshots, then the e2e suite:
npm run build
NODE_PATH=/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/pw/node_modules node scripts/e2e.js
# one finding: ... node scripts/e2e.js --grep='\[D-20\]|\[D-29\]|\[M-23\]'

# Server mode, by hand (D-20):
MELON_CHANNEL=beta PORT=8791 node server/index.js &  echo $! > "$S/server.pid"
curl -s 'http://127.0.0.1:8791/api/jobs?company=apple' | head -c 300   # mode "snapshot", error null
kill "$(cat "$S/server.pid")"

# Screenshots (before: a build of 8c598c2; after: this tree), then shrink:
node scripts/cycle/serve.mjs --dist "$S/dist" --pid "$S/serve.pid" &
node "$S/shots.mjs" http://127.0.0.1:<port> docs/screenshots/fix-beta-platform after [<server origin>]
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-beta-platform

# The other lanes' build-static.js patches still apply on this tree (their worktrees are gone,
# so take the files from the lane commits):
git show 3c7bdc0:docs/process/patches/fix-beta-pay-pack-seniority-basis.diff > "$S/pay.diff"
git show ea60cb3:docs/process/patches/fix-beta-sources-build-static.diff > "$S/sources.diff"
git apply --check "$S/pay.diff" "$S/sources.diff"

# This lane on top of batch 1 (scratch worktree; resolve chart.js and fix-viz.test.js as in §6):
git worktree add --detach "$S/wt-b2" 0d3bbde
git diff 8c598c2 -- . ':!docs/screenshots' > "$S/platform.diff"
cd "$S/wt-b2" && git apply -3 "$S/platform.diff"
git apply docs/process/patches/fix-beta-platform-app-unavailable.diff
# symlink node_modules and the two snapshot folders as above, then npm test, build, e2e
```

`shots.mjs` opens each page in Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). It
blocks external hosts, and answers 503 for the list it is told to fail (DQ-7). Pid files live in `$S`;
no `pkill -f`.

## 5. Verification

### 5.1 Tests on this tree (`8c598c2` + this lane)

- **`npm test`** with `MELON_BETA_SNAPSHOT_DIR=<empty folder>`, as in CI: 720 tests, 698 pass, 20 to-do, 2 fail, in 68 s.
  - The 20 to-dos are other lanes' DQ tests.
  - The 2 failures are timing tests on a busy machine: PERF-1 (226 ms) and V15 (245 ms). `test/perf.test.js`
    alone passes 3/3 (max lag 1 ms and 119 ms; the first run's baseline had 136 ms).
  - The first run's baseline on `8c598c2` took 7 min with 6 failures: 5 links-policy timeouts, and one
    git check run outside a repository.
- **`npm run build`** with the real snapshots: OK in 2 min 11 s, "beta: 5/5 beta companies included".
  - The one warning is Apple's 2.52 MB list, which the performance pass owns.
  - `dist/api/demo/` is gone on both sites.
- **Full e2e** (`node scripts/e2e.js`): 162/184 passed, 19 failed, 3 skipped.
  - `[D-20]` and `[D-29]` pass.
  - `[M-23]` fails only on its second half, the drawer counter "1 of 6105" (`app.js`, the app lane's). No
    pin reads "999+" ("4.5K").
  - 17 of the other 18 failures are the other beta lanes' red tests: D-18, D-21 to D-24, D-26 to D-28,
    D-30, M-19 to M-22 and M-24 to M-27.
  - The last one is the guard "Apple results sheet drags peek -> half -> full …". It failed under load and
    passes alone; it is a tap during a fling, which the app lane's log explains.
- `test/fix-beta-platform.test.js` (new, 11 tests, about 7 s):
  - D-20 (4): the beta folder with no live attempt and its ledger; "not available yet" (also a paused
    board, HEAD and the export's 503); the `MELON_CHANNEL=beta` listing and the market; the stable demo
    fallback is kept;
  - DQ-7 (4): no `api/demo` and no demo description files on either site; a failed list is
    `unavailable`, and Retry loads it; the stable message is accurate; "Add board" demo is labelled;
  - D-29 (1), M-23 (1);
  - decision 1 (1): both `roles.js` states, through a temp copy of `roles.js` with the app lane's export
    names.
- `test/beta-data-check.test.js`: the two DQ-7 tests pass and are no longer TODO.
- `test/links-policy.test.js`: 5/5 in about 5 s (it timed out before).

### 5.2 Integration checks (scratch worktrees, nothing committed there)

- **On the app lane's `7be1f6f`**, with this lane's diff and the app patch on top:
  - `test/fix-viz`, `fix-beta-platform`, `fix-beta-app`, `beta-data-check` and `links-policy`: 37 pass,
    20 to-do (other lanes'), 0 fail;
  - the guarded `chart.js` picks up the real `displayLevel` and `DISPLAY_LEVEL_ORDER`.
- **On the lead's batch 1, `0d3bbde`**: this lane's diff applies with `git apply -3`. Only
  `public/viz/chart.js` and `test/fix-viz.test.js` conflict, because batch 1 already applied the app
  lane's chart patch.
  - The resolution keeps `0d3bbde`'s `chart.js` and `fix-viz.test.js` and adds this lane's D-29 and
    M-23 hunks (`withCurrencyCode`, `shortCount`, the bin count and the tooltip value).
  - With `fix-beta-platform-app-unavailable.diff` applied:
    - `npm test`: 758/758 pass, 0 to-do (the DQ-7 to-dos are gone), in 58 s;
    - build OK (beta 5/5; Apple 2.19 MB after the sources lane's dedup);
    - **full e2e: 192/195 passed, 0 failed, 3 skipped**, `[D-20]`, `[D-29]` and `[M-23]` included.
  - The lead's batch 1 run was 188/195; its failures were this lane's three tests and one test it fixed.
  - Screenshots from that tree, in the table below:
    - `integrated-seniority-groups-google-1440.png`: "Mid" (235 roles whose title or pay names a mid
      level, such as Google "III") between Entry and Senior, "Level not stated" last;
    - `integrated-m23-map-apple-390.png`: "3.4K" on Apple's 4,882 roles;
    - `integrated-dq7-beta-apple-list-fails-1440.png`: the error with Retry, on the app lane's `app.js`.

### 5.3 Other lanes' patches

`git apply --check` on the final tree. The lane worktrees were removed after batch 1, so the patch
files came from their commits `3c7bdc0` and `ea60cb3`, byte-identical to the copies in `3ec8c7d`,
`ab36a75` and `0d3bbde`:
- `fix-beta-pay-pack-seniority-basis.diff` applies (hunk 1 at offset 1 line);
- `fix-beta-sources-build-static.diff` applies (both hunks at offset 1 line);
- both together, in that order, apply too.

On `0d3bbde`, where both are already applied, this lane's build-static.js hunks apply cleanly on top.

### 5.4 Screenshots (`docs/screenshots/fix-beta-platform/`, shrunk)

| Finding | Before | After |
|---|---|---|
| D-20 server mode, beta Apple | `before-d20-server-beta-apple-1440.png` (80 demo roles) | `after-d20-server-beta-apple-1440.png` (6,105 roles, Snapshot) |
| D-20 beta board with no snapshot (with the app patch) | | `after-with-app-patch-d20-server-beta-no-snapshot-1440.png` |
| DQ-7 beta Apple list fails, 1440 and 390 | `before-dq7-beta-apple-list-fails-*.png` (generated "Apple" roles) | `after-dq7-…` (no app patch: an empty board), `after-with-app-patch-dq7-…` (error with Retry), `after-with-app-patch-dq7-beta-apple-after-retry-1440.png` |
| DQ-7 stable Scale AI list fails | `before-dq7-stable-scaleai-list-fails-1440.png` (79 demo roles, false note) | `after-dq7-…`, `after-with-app-patch-dq7-…` |
| D-29 Ranges tooltip, PLN and CHF | `before-d29-ranges-*-tooltip-*.png` | `after-d29-ranges-*-tooltip-*.png` |
| M-23 map pins, Apple 390 and Microsoft 1440 | `before-m23-map-*.png` ("999+") | `after-m23-map-*.png` ("4.5K") |
| M-23 cluster circles, Apple 1440 | `before-m23-clusters-apple-1440.png` | `after-m23-clusters-apple-1440.png` ("1.7K") |
| Decision 1, Google by seniority | `before-seniority-groups-google-1440.png` | `after-seniority-groups-google-1440.png` (same: no displayLevel in this tree), `integrated-seniority-groups-google-1440.png` (on `0d3bbde`) |
| Integrated on `0d3bbde` | | `integrated-m23-map-apple-390.png`, `integrated-dq7-beta-apple-list-fails-1440.png` |
| No regression, stable Anthropic 1440 and map 390 | `before-stable-anthropic-*.png` | `after-stable-anthropic-*.png` (identical) |

## 6. Known gaps and follow-ups

- **Apply `fix-beta-platform-app-unavailable.diff`** (app lane's `public/app.js`). Without it, a failed
  list load or a beta board with no snapshot shows "No open roles on this board": no demo data, but
  not the honest error.
  - With it, the main area says "Couldn't load this board" with the reason and Retry. The results
    column keeps the app's generic "Board unavailable · We couldn't reach the API" card, which is
    `app.js` wording for the app lane to refine.
- **`chart.js` on top of batch 1.** `0d3bbde` already carries the app lane's chart patch: a direct
  `import { levelLabel, displayLevel, DISPLAY_LEVEL_ORDER }`. This lane's guarded version does the same
  thing with that `roles.js`, so either one is right after integration.
  - Cherry-picking this commit onto `0d3bbde` conflicts in `public/viz/chart.js` and
    `test/fix-viz.test.js`.
  - Resolve by keeping `0d3bbde`'s side of both. Add only this lane's D-29 and M-23 hunks to `chart.js`:
    `withCurrencyCode`, `shortCount`, `dot.textContent = shortCount(n)` and
    `withCurrencyCode(native, cur)`.
  - The scratch check in §5.2 did exactly that.
- M-23's drawer counter is the app lane's (`7be1f6f`, in batch 1). The `[M-23]` e2e test fails on this
  tree alone for that half only, and passes on `0d3bbde` with this lane.
- Server mode serves beta boards from their snapshots only. A request never starts the big-tech crawl,
  which takes up to hours; `node scripts/snapshot.js --channel beta` does.
- `public/api.js` and `scripts/build-static.js` are next owned by the performance pass (Apple's 2.52 MB
  list); nothing here changes the list format or the unpacking.

## 7. Change log

- 2026-10-10, first run (interrupted): D-20, DQ-7 (api.js, build-static.js, server/index.js,
  CONTRACT), D-29, M-23, decision 1 with a `typeof` guard, links-policy isolation, three patches,
  before and after screenshots. Saved by the lead as WIP `f3db92c`.
- 2026-10-10 to 10-11, resumed run:
  - `chart.js` uses `roles.NOT_STATED` and `roles.DISPLAY_LEVEL_ORDER` when `displayLevel` exists (the
    app lane's exact names);
  - the decision 1 test's temp `roles.js` carries those names, and the P-3 assertion is exact for both
    states;
  - found batch 1 (`0d3bbde`) integrated meanwhile. Checked this lane on top of it: `npm test`
    758/758, full e2e 192/195 with 0 failures. Checked the pay and sources build-static.js patches
    against this tree;
  - wrote this log; added the three `integrated-*` screenshots; shrank the folder (6.4 MB to 1.7 MB);
    amended the commit.
