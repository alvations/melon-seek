# Process log: devops

Written by the DevOps / technical-writer agent so this work can be redone on
another account or machine.

## 1. Brief

- Prompt (verbatim): [`prompts/devops.md`](prompts/devops.md).
- Goal: make melon-seek easy to run, ship and understand. That means a README,
  a container image, CI with a smoke test, a daily workflow that commits real
  job-board snapshots, and architecture and "add a board" docs. No application
  code is touched.
- Files owned: `README.md`, `Dockerfile`, `.dockerignore`, `.editorconfig`,
  `.github/workflows/ci.yml`, `.github/workflows/snapshot.yml`,
  `docs/ARCHITECTURE.md`, `docs/ADDING_A_BOARD.md`, plus this log and its
  prompt file. Off limits: `server/`, `public/`, `test/*.test.js`. No git
  commit or push.
- Second task (GitHub Pages): a static deploy served at
  `https://alvations.github.io/melon-seek/`. Added files owned: `public/api.js`,
  `scripts/build-static.js`, `.github/workflows/pages.yml`, plus the `build`
  script in `package.json` and `dist/` in `.gitignore` and `.dockerignore`.

## 2. Inputs and sources

| Input | What it contributed |
| --- | --- |
| `docs/CONTRACT.md` | Layout, RawJob/Job shapes, HTTP API, fallback order (cache → live → stale cache → snapshot → demo), `PORT` default 5173. The README API reference and the ARCHITECTURE lifecycle are copied or condensed from it. |
| `package.json` | Script names (`start`, `dev`, `test`, `snapshot`), `engines: node >=18`, `"type": "module"`, the single dependency `leaflet`. |
| `package-lock.json` | Confirmed a lockfile exists, so `npm ci` and `setup-node` `cache: npm` work. Noticed `version: 1.0.0` vs `0.1.0` in package.json. |
| `.gitignore` | `data/cache/` is ignored, so the Docker image also excludes it. `data/snapshots/` is tracked. |
| `server/companies.js` | Built-in companies and boards (anduril → `andurilindustries`), `SOURCES`, slug regex `/^[a-z0-9-_.]+$/i`, custom slug `<source>-<board>`, hashed HSL colour, 400/404 errors. Used in the README API section and ADDING_A_BOARD. |
| `server/sources/greenhouse.js`, `ashby.js`, `lever.js` (header comments + URL builders) | Exact endpoint URLs for "Data sources". Greenhouse also sends `&pay_transparency=true`. |
| `server/sources/util.js` | `fetchJson` helper, `User-Agent` string, `TIMEOUT_MS = 15000`. Sized the CI `--max-time 90` and supplied the adapter example in ADDING_A_BOARD. |
| `scripts/snapshot.js` (read later, once it existed) | Accepts slugs or `<source>:<board>` after `--`, writes only live data, keeps the old file if 0 jobs come back, and exits 1 only when every slug fails. The README snapshot section and workflow step match this. |
| `server/index.js` (grep only) | `PORT` env with 5173 fallback, `refresh` accepts `1/true/yes`. |
| Skills loaded | None. Nothing in this workstream is an artifact, chart or LLM task. |
| External docs / web | None fetched for the first task. Endpoint URLs came from the prompt and the adapter sources. GitHub Actions and Docker conventions came from general knowledge (see decisions). |
| `server/index.js` (`fetchLive`, `getJobs`, read for Pages) | The fallback chain that `public/api.js` reproduces in static mode, and the `ADAPTERS` map. |
| `server/sources/*.js` exports (Pages) | `greenhouseUrl`/`ashbyUrl`/`leverUrl` and `mapGreenhouseJob`/`mapAshbyJob`/`mapLeverJob`. api.js reuses these but does its own `fetch` (decision 24). |
| `public/app.js`, `public/index.html` (read only, Pages) | Absolute `/api/...`, `/favicon.svg`, `/vendor/...` URLs that break under a sub-path. Reported to the coordinator; app.js then switched to `import * as liveApi from './api.js'`. |
| Real snapshots (bundle-size work) | `data/snapshots/*.json` (74 MB, 8 companies) appeared locally at 05:55Z, from the lead's GitHub run. Used to measure per-field bytes and verify the 1.5 MB target; never committed (gitignored). |
| `actions/*` repos (shallow `git clone --depth 1 --branch vN`) | `runs.using` from each `action.yml`, the README "Breaking changes" sections, and the upload-pages-artifact v4→v5 diff (dotfile handling). |
| CORS research (Pages) | Lever's `github.com/lever/postings-api` README, fetched with WebFetch: "does not support cross-origin HTTP requests from sites outside of your company's domains". Web search: Greenhouse's job board API is meant to be called from client-side code, and Ashby's posting API is reported to lack CORS headers (secondary source, low confidence). Direct probes of the three APIs were blocked by the sandbox proxy (403). |

## 3. Decisions and rationale

### Dockerfile

1. **`node:22-alpine`** as the prompt asked. It's small and Node 22 is the
   current LTS. `ENV NODE_ENV=production PORT=5173`.
2. **Copy `package.json` + `package-lock.json` first, then
   `npm ci --omit=dev && npm cache clean --force`.** The dependency layer
   stays cached until the lockfile changes. Cleaning the cache keeps the image
   small. `npm install` was rejected because it isn't reproducible.
3. **`COPY . ./` filtered by `.dockerignore`** instead of copying named
   directories. The first draft used `COPY server/ public/ scripts/ data/`, but
   git doesn't track an empty `data/snapshots/`, so `COPY data` would fail the
   build on a fresh clone. Copying everything works whether or not `data/`
   exists, and still includes any committed snapshots.
4. **Non-root user: the built-in `node` user (uid 1000)**, not a new
   `adduser`. Only `/app/data` is `chown`ed, because the disk cache writes to
   `data/cache/`. Source files stay root-owned, so the app can't modify them.
5. **HEALTHCHECK uses `wget -q -O /dev/null http://127.0.0.1:${PORT}/api/companies`.**
   Alpine ships BusyBox `wget` but not `curl`. `127.0.0.1` avoids `localhost`
   resolving to `::1`. Shell form lets `${PORT}` follow a runtime override.
   Timing: interval 30s, timeout 5s, start period 10s, 3 retries.
6. **`CMD ["npm", "start"]`** in exec form, as the prompt asked. The
   alternative `node server/index.js` handles signals more directly (see gaps).
7. **`.dockerignore`** excludes `node_modules` (reinstalled inside the image),
   `.git`, `.github`, `test`, `docs`, `*.md`, `data/cache` (no baked-in local
   cache), `.env*` (secrets) and the Docker files themselves. `data/snapshots`
   is kept.

### CI (`.github/workflows/ci.yml`)

8. **Triggers `push` + `pull_request` on all branches**, with
   `permissions: contents: read` (least privilege).
9. **Matrix: Node `[20, 22]`, `fail-fast: false`**, so both versions always
   report. 18 is past end of life and was left out even though `engines` allows
   it.
10. **`actions/checkout@v4`, `actions/setup-node@v4` with `cache: npm`**, then
    `npm ci` and `npm test` (`node --test test/`).
11. **Smoke step:**
    - Start `npm start` in the background, logging to `server.log`.
    - `trap` kills it by PID on exit.
    - Poll `/api/companies` with `curl -f` for up to 30s.
    - Assert with `jq -e` that `/api/companies` is an array of 3 or more
      entries that includes `anthropic`.
    - Assert that `/api/jobs?company=anthropic` has an array `jobs` and a
      `mode` in `live|cache|snapshot|demo`. **Demo mode passes** on purpose: CI
      shouldn't go red because a third-party board is down. The test checks the
      pipeline, not the data.
    - `--max-time 90` covers the 15s adapter timeout plus fallbacks.
    - Uses `jq` `IN()`, which needs jq 1.6 or later. ubuntu-latest has 1.7, and
      it was checked locally with jq 1.7.
    - If the server never comes up, the loop ends quietly and the next
      `curl -f` fails the step. That's the intended failure signal.
12. **`Server log` step with `if: always()`**, so startup crashes show up in
    the job output.

### Snapshot workflow (`.github/workflows/snapshot.yml`)

13. **`schedule: cron "17 6 * * *"` + `workflow_dispatch`.** It runs daily at
    06:17 UTC. The odd minute avoids GitHub's top-of-hour scheduling
    congestion, where scheduled runs get delayed or dropped.
14. **`permissions: contents: read`** (was `contents: write`, removed with
    decision 18). The workflow no longer pushes anything.
15. **`concurrency: group: snapshot, cancel-in-progress: false`**, so a manual
    run and the scheduled run don't overlap.
16. **Node 22 only.** This is a data job and doesn't need the matrix.
17. **`npm run snapshot` with no arguments** (originally
    `-- anthropic anduril openai`; changed so new built-ins are picked up
    automatically). With no arguments, `scripts/snapshot.js` snapshots every
    built-in. It exits non-zero only when every slug fails, so a single flaky
    board doesn't block the others.
18. **Upload snapshots as an artifact; don't commit them** (lead decision,
    2026-10-02). The original design committed changed snapshots as
    `github-actions[bot]`. The first real run showed why that doesn't scale:
    - One day's real snapshots are ~74 MB (`anduril.json` ~38 MB,
      `openai.json` ~11 MB, `anthropic.json` ~9 MB).
    - Daily commits would add that much to the git history every day, and
      every clone would carry it, for data that's stale within hours.

    So the lead untracked `data/snapshots/*.json` and gitignored it, and
    `snapshot.yml` now uploads `data/snapshots/*.json` with
    `actions/upload-artifact@v7`: name `job-board-snapshots`,
    `retention-days: 14`, `if-no-files-found: error`. JSON zips well, so
    artifact storage is a fraction of the raw size.
    - Considered: Git LFS (still grows LFS storage daily and adds a clone
      dependency); a separate data branch (still grows history); committing
      only a compact digest (loses the descriptions the static site needs).
      The artifact is simplest and expires on its own.
    - Cost: a fresh clone has no real data until `npm run snapshot` or
      `gh run download --name job-board-snapshots` is run. Demo data covers
      this and is clearly labelled.
    - A placeholder (`TODO(vetting)`) marks where `node scripts/vet-salaries.js`
      goes, between the fetch and the upload, so bad salary data fails the job
      before it is published. The script doesn't exist yet.

### Docs

19. **README order:** pitch and features, Screenshots placeholder, quick start
    (+ Docker), data modes table, snapshots, tests, API reference, layout, data
    sources, responsible use. The API section copies the contract's shapes so
    the README stands alone. Error codes come from `companies.js`. The
    Screenshots section is a two-column table pointing at
    `docs/screenshots/chart.png` and `map.png`.
20. **Mermaid in ARCHITECTURE:**
    - `flowchart LR` with subgraphs for the adapters and for normalize
      (salary/geo/keywords).
    - Dotted edges mark the snapshot and demo fallbacks.
    - The edge label is quoted (`|"RawJob[]"|`) because unquoted `[]` in a
      label can break the Mermaid parser.
    - `&lt;slug&gt;` is entity-escaped inside a node label.
21. **ADDING_A_BOARD** has three routes, least work first:
    - UI "Add board".
    - Adding to `COMPANIES`, which also means adding the slug to the snapshot
      workflow.
    - Writing a new adapter. This includes an example `map<Source>Job` that
      returns the full RawJob shape, the registration points (`SOURCES`, the
      server's adapter dispatch, the UI picker) and fixture-based tests with no
      network.
    - A slug lookup table covers the careers-page URL patterns for each ATS.
22. **`.editorconfig`:** utf-8, LF, final newline, trim trailing whitespace,
    2-space indent (matches the existing JS). Markdown keeps trailing
    whitespace for hard line breaks. Makefiles use tabs.

### GitHub Pages (static deploy)

23. **Mode switch is a global, `window.MELON_STATIC`, set by a generated
    `dist/config.js`.** The build injects it as a classic `<script>` before the
    first script in `dist/index.html`, so it's set before the `app.js` module
    runs. The alternative, detecting by hostname, was rejected: it's brittle,
    and a local preview of `dist/` should behave exactly like Pages.
24. **api.js reuses the adapters' URL builders and mappers but does its own
    `fetch`.** `server/sources/util.js#fetchJson` sends a `User-Agent` header.
    That header isn't CORS-safelisted, so Firefox would send a preflight that
    the boards may reject. So api.js calls `greenhouseUrl`/`mapGreenhouseJob`
    and the others with a plain GET (only `Accept`, `credentials: 'omit'`). It
    then runs the same `normalizeJobs`, so browser and server output are
    identical. It also repeats the adapters' two response checks (Greenhouse
    `jobs` array; Ashby `isListed !== false`).
25. **Live sources in static mode: all three (`MELON_LIVE_SOURCES` in
    `config.js`); Lever is also in `MELON_QUIET_CORS_SOURCES`.**
    - The first version excluded Lever, because its official docs say
      cross-origin requests from third-party sites are refused.
    - Research then found that Lever currently returns
      `Access-Control-Allow-Origin: *`. At the coordinator's request Lever is
      now attempted. A network/CORS failure for a quiet source that ends in the
      bundled snapshot returns `error: null`, so the UI shows a normal
      "Snapshot" badge and no error banner: the failure is expected and
      documented, not something the user can act on.
    - Demo fallbacks keep the error, so demo data is never shown without an
      explanation.
    - Ashby is uncertain (one secondary source), so it's attempted, and a
      failure falls back with the usual message.
    - To change either list, edit `LIVE_SOURCES` / `QUIET_CORS_SOURCES` in the
      build script; api.js has the same defaults.
26. **A network/CORS failure blocks that source for the rest of the session,
    and Refresh clears the block.** This avoids a failed request and console
    error on every company switch. HTTP errors (e.g. a 404 board slug) don't
    block the source, because they're specific to one board.
27. **The static fallback chain mirrors the server's:**
    1. In-memory cache (30-minute TTL, the same responsible-use limit as the
       server).
    2. Live fetch from the browser.
    3. Stale in-memory result.
    4. `api/jobs/<slug>.json`.
    5. `api/demo/<slug>.json`.
    6. Demo generated in the browser.

    Custom boards skip steps 4 and 5, as the brief asked. The mode returned is
    whatever the bundle says (`snapshot` or `demo`), so a build that had no
    snapshot is never shown as real data.
28. **`apiFetch(path)` drop-in.** app.js already built `/api/...` path strings,
    so the smallest change on its side was to route those strings through one
    function. app.js now imports `api.js` and prefers `getJobs`/`getCompanies`.
29. **Build rewrites absolute URLs in HTML (`href="/x"` becomes `href="./x"`,
    or `../x` one level down) instead of asking for changes to
    `public/index.html`.** The server works either way, and the build stays
    correct even if someone adds an absolute URL later. JS can't be rewritten
    safely, so the build *warns* about absolute `/api/` or asset URLs in
    `dist/*.js` (except `api.js` and `mock-api.js`, which only mention them
    in comments or for dev use).
30. **Browser-safety gate for `dist/lib/`.** The build fails if a copied module
    has a `node:` import or `require(`, naming the module so its owner can fix
    it; the build never patches it. Node globals (`process`, `Buffer`,
    `__dirname`) only produce a warning, and that scan skips comments.
    - The first hit was `normalize.js:12` (`process.env.DEBUG` in a catch
      path). api.js covers it with a `globalThis.process = { env: {} }` stub,
      and the backend has since removed it.
    - A later false positive was the word "Buffer" in a `util.js` comment.
      That's why the warning scan strips comments while the hard
      `node:`/`require` check still scans raw source, so an import can't be
      missed.
31. **`dist/api/jobs/<slug>.json` is always written.** It holds the snapshot if
    `data/snapshots/<slug>.json` has jobs, otherwise build-time demo data with
    an explicit "Synthetic demo data" note in `error`, so the UI's demo banner
    explains why.
32. **`pages.yml`:**
    - Builds on push to `main` and `claude/stoic-ride-54ddxp`, on
      `workflow_dispatch`, and daily at `41 7 * * *` (an off-the-hour minute,
      after snapshot.yml's 06:17 run).
    - Permissions are `contents: read`, `actions: read` (to download the
      snapshot artifact), `pages: write`, `id-token: write`.
    - `concurrency: pages` with no cancel-in-progress, so a deploy is never cut
      off partway.
    - **Restore, then refresh.** First, a `gh run download` step restores the
      newest `job-board-snapshots` artifact. It tries the last 5 successful
      `snapshot.yml` runs, because the newest one may predate artifacts or
      have expired, and it only warns if none has the artifact. Then
      `npm run snapshot || true` (no arguments, so every built-in in
      `server/companies.js`) fetches fresh data. `snapshot.js` leaves a file
      alone when its board fails, so a failing board keeps yesterday's real
      data instead of dropping to demo. That's the job committed snapshots
      used to do. The build loops over `listCompanies()`, so no slug list is
      hardcoded anywhere.
    - A second `TODO(vetting)` placeholder sits after the fetch, for
      `scripts/vet-salaries.js` to fail the build on critical salary anomalies
      before anything is bundled.
    - A step summary table lists each company's bundled mode, job count, list
      size, description file count and size, and `fetchedAt`, plus the site
      total against Pages' 1 GB limit. A demo-only or oversized deploy is
      visible in the run.
    - Separate build and deploy jobs follow GitHub's starter workflow, with
      `environment: github-pages` and the page URL output.
    - Action versions: see decision 38.
33. **CI also runs `npm run build`** and checks `dist/` with `jq` (companies
    array, every `jobs/*.json` has a `jobs` array, `config.js`, `.nojekyll` and
    Leaflet present). A broken Pages bundle now fails PRs, not just the
    deploy.
34. **`dist/` is gitignored and dockerignored.** It's a build output; Pages
    gets it as an artifact, not from the repo.

### Bundle size (lazy descriptions, packed lists)

The first real Pages build bundled 8.5 MB for Anthropic, 10 MB for OpenAI and
7.2 MB for Shield AI per list file. Target: under 1.5 MB per company list.
Measured on that real data, `descriptionHtml` was ~90% of a job's bytes.

35. **Descriptions are lazy-loaded, one file per job:**
    `dist/api/desc/<slug>/<id>.json` = `{ id, descriptionHtml, sections? }`.
    - List jobs omit the `descriptionHtml` key. `public/api.js#getJobDetail(job)`
      fetches the file when the drawer opens and caches it by job id (in-flight
      promises are shared; failures aren't cached, so a retry works).
    - Jobs that already have `descriptionHtml` are returned unchanged: server
      mode, live browser fetches, in-browser demo.
    - A job with an empty description keeps `descriptionHtml: ""` in the list
      and gets no file, so nothing is fetched for it.
    - Considered: one desc file per company (still multi-MB on first open), or
      chunks of N jobs (more complex, little gain). Per-job files are what the
      drawer needs, and Pages serves thousands of small files fine (~7,000
      today, 75 MB site total, against a 1 GB limit).
    - The file name comes from `api.js#descPath`, which the build imports, so
      writer and reader can't drift. `sanitizeJobId` drops the `<slug>:` prefix
      and writes any character outside `[A-Za-z0-9_-]` as `~` + 4 hex digits.
      That's injective (no collisions) and can't produce `..`. Real ids
      (Greenhouse digits, Ashby/Lever UUIDs, `demo-<slug>-NNN`) pass through
      unchanged. The build also throws on any path collision.
36. **Lists use a lossless packed format, `melon-packed-1`.**
    - It's needed because even without HTML, Anduril (2,418 jobs) was 2.94 MB,
      at ~1.27 KB per job, mostly repeated keyword labels (39%) and location
      objects (16%).
    - What it does:
      - `company`/`companyName` are stored once in `shared`.
      - ids drop the `<slug>:` prefix, and urls drop their longest common
        prefix.
      - locations, keyword labels, department, team, employmentType and
        seniority are indexes into one `dict` array.
      - empty `sections` are omitted.
    - `api.js#unpackJobs` restores plain contract-shaped Jobs; it's the only
      reader, since the UI never fetches list files directly. Plain lists still
      load unchanged.
    - Safety: the build unpacks every packed list with the browser's own
      `unpackJobs` and deep-compares each job with the unpacked original. Any
      mismatch fails the build.
    - Considered: shortening key names (unreadable, small gain); dropping
      fields (changes the contract).
    - Result on real data: Anduril went from 2.94 MB to 1.30 MB.
37. **If a packed list is still over 1.5 MB, that company's `sections` move into
    the desc files too.** The list keeps `{responsibilities: [], fit: []}` and
    `getJobDetail` returns the real sections. `keywords` always stay in the
    list, because the filters need them up front, and only the drawer uses
    `sections`.
    - On real data this happens for anthropic, anduril, openai and shieldai
      (real bullet lists are long). The build prints it for each company.
    - If a list is still over budget after that, the build warns (and fails
      under `--strict`).
    - UX follow-up (reported): in that case the open drawer shows the
      description but only redraws the bullets on reopen, because
      `fillDescription` copies `detail.sections` onto the job without
      re-rendering them.
    - Sizes are in decimal units (1 MB = 1,000,000 bytes) to match the target
      literally.
38. **Actions upgraded to Node 24 versions.** The runner had warned that
    Node 20 actions are deprecated. I checked each version's `action.yml` by
    shallow-cloning the action repo at the tag, since the GitHub MCP tool is
    scoped to this repo and I didn't add others.

    | Action | Version | Runtime |
    | --- | --- | --- |
    | `actions/checkout` | v7 | node24 |
    | `actions/setup-node` | v7 | node24 |
    | `actions/configure-pages` | v6 | node24 |
    | `actions/deploy-pages` | v5 | node24 |
    | `actions/upload-artifact` | v7 | node24 |
    | `actions/upload-pages-artifact` | v5 | composite, wraps upload-artifact v7 |

    Breaking changes reviewed:
    - checkout v7 refuses fork checkouts under `pull_request_target` and
      `workflow_run`; we use neither.
    - setup-node v6+ auto-caches when `packageManager` is set; we set
      `cache: npm` explicitly anyway.
    - upload-pages-artifact v4+ drops dotfiles by default, so
      `include-hidden-files: true` keeps `.nojekyll`.

### Juice Score and the salary vetting gate

39. **Juice is computed client-side in `public/api.js`, in both modes, and is
    never stored in the packed lists** (lead decision). Every `getJobs` result
    (live, cache, snapshot, demo, server) goes through:
    1. `vetSalaries` (static mode only, from `lib/vet.js`; the server vets its
       own responses).
    2. `juice.js#attachJuiceAll(jobs, cities)`.

    Notes:
    - Static-mode live browser fetches weren't vetted before; they are now.
      `vetSalaries` is idempotent, so the build-time-vetted bundles pass
      through unchanged.
    - Why client-side: juice depends on cities.json and the tax model, which
      change on their own schedule. Storing it in the lists would ship stale
      scores and add ~250 B per job.
    - The build also strips any `juice` field from jobs before packing, as a
      guarantee, and CI checks for it with `jq`.
    - Cost on the largest board (Anduril, 2,418 jobs, Chromium): vet 16 ms,
      juice 22 ms, out of a 191 ms warm `getJobs`.
40. **`getCities()`** reads `api/cities.json` in static mode and `api/cities`
    in server mode. It's cached per session.
    - A failure resolves to `null` and is remembered, so a missing server route
      costs one 404 per session, not one per company switch. `refresh` retries
      only after a failure.
    - `juice.js` is loaded with `import('./lib/juice.js')`, from the same place
      as the other lib modules.
    - If either the cities or juice.js is unavailable, every job gets
      `juice: null` and nothing is put in `error`, so there's no banner.
    - Server mode needs two backend routes, which I requested: `/api/cities`,
      and `/lib/*.js` for the browser-safe allowlist. Until they exist, server
      mode serves `juice: null`.
41. **The build bundles `lib/juice.js` (and `lib/vet.js`), plus `api/cities.json`**
    (re-serialized compactly: 256 kB → 190 kB, content identical; the test
    checks it).
    - `juice.js` is in `OPTIONAL_LIB`: if it's missing, the build warns and
      the site serves `juice: null` instead of failing.
    - `juice.js` imports only `./geo.js`, which the existing `node:`-import
      gate covers.
42. **Salary vetting gate in both workflows.** The command is
    `node scripts/vet-salaries.js --no-write-flags --summary "$GITHUB_STEP_SUMMARY"`,
    with `continue-on-error: false`, behind `[ -f scripts/vet-salaries.js ]`.
    - `docs/VETTING.md` doesn't exist yet, so the command and its failure
      semantics come from the script's header: exit 1 when an unquarantined
      job has a critical flag, or a regression fixture fails.
    - `--no-write-flags`: CI runs are ephemeral, and writing would touch the
      reviewed files in `data/vetting/<date>/`. The summary carries the table
      and the critical list.
    - `pages.yml`: the gate runs after the fetch and before the build, so a
      critical anomaly stops the deploy.
    - `snapshot.yml`: the gate fails the job, but the artifact upload still
      runs (`if: !cancelled()`), so reviewers can download the data that
      failed and pages.yml has a fallback. pages.yml re-runs the gate, so bad
      pay still can't be published.

### v2 "1-up" features (ROADMAP §7, CONTRACT "v2 additions")

Interfaces confirmed by the coordinator: `history.js` exports `fromCompact`
and `ledgerMeta`, and annotate stays strict; `buildMarket(payloads)` is pure;
the backtest uses seed 20261002 and maxN 500; the artifact store is the
default and the branch store comes later. Every v2 dependency is
feature-detected, so the build and site work before each owner lands it.

43. **The F4 ledger is persisted by `.github/scripts/ledger.sh`, one script for
    both stores.** The store comes from the repository variable
    `HISTORY_STORE` (`artifact` by default, or `branch`), so **switching to the
    orphan branch is one step**: set the variable. No workflow edit is needed.
    - `restore` (artifact): `gh api …/actions/artifacts?name=history-ledger`,
      non-expired only, sorted by `created_at` myself (the API's order isn't
      strictly newest-first; I saw it out of order), then `gh run download` of
      the newest that works. It warns per failed run, and starts fresh if none
      works.
    - `restore` (branch): `git fetch --depth 1` of `data-history` and
      `git archive history/`. **If the branch doesn't exist yet, it seeds
      from the newest artifact**, so the switch loses no history.
    - `commit-branch`: plumbing on a throwaway index (`hash-object`,
      `update-index --cacheinfo`, `write-tree`, `commit-tree`, push). It never
      touches the working tree or the checked-out branch, and it's a no-op
      when the tree is unchanged. Branch content is `history/<slug>.json` plus
      a README.
    - Rejected: a composite action (harder to test locally); committing from
      the main job (that would need `contents: write` on the whole workflow,
      which the lead removed).
44. **Workflow wiring (both snapshot.yml and pages.yml):**
    - Restore ledger, then `npm run snapshot` (which updates `data/history/`
      through `scripts/history.js`).
    - Upload the `history-ledger` artifact: 90-day retention, `if: !cancelled()`,
      so the ledger is kept even when the vetting gate fails, and
      `if-no-files-found: warn`.
    - The `persist-ledger` job (`needs`, `if: vars.HISTORY_STORE == 'branch' &&
      !cancelled()`) downloads this run's artifact with `download-artifact@v8`
      (node24) and runs `commit-branch`. It's the only job with
      `contents: write`, and it's skipped in artifact mode, so no write token
      is minted.
    - `snapshot.yml` gains `actions: read` for the artifact lookup.
    - Considered: a shared job-level concurrency group across both workflows
      to serialize ledger updates. Rejected, because GitHub keeps only one
      pending job per group: a burst of pushes would cancel the daily snapshot
      job. The race (last upload wins; at worst a posting's firstSeenAt is
      recorded one run later) is documented instead.
    - `data/history/` is gitignored: the ledger never lands on `main` in either
      store.
45. **The build imports `LIB_MODULES` / `LIB_SOURCES_DIR` from
    `server/lib-modules.js`**, the server's `/lib/` allowlist, instead of its
    own copy. Optional modules (missing means degrade, with a warning):
    `demo.js`, `juice.js`, `history.js`.
46. **F4 in the build:**
    - Every bundled payload goes through `history.annotate(jobs, ledger,
      builtAt)`. The ledger is `data/history/<slug>.json` (`MELON_HISTORY_DIR`
      overrides it), validated by its `format`, and ignored with a warning if
      it's corrupt or in another format. Ages are "as of build time", like the
      server's "as of now", and a deploy runs at least daily.
    - `meta.history = ledgerMeta(ledger)`, or `{ since: null, runs: 0 }`.
    - `api/history/<slug>.json = compactLedger(ledger)`. This is **backend's
      own writer**, chosen over deriving the map from annotated jobs: one
      source of truth, open postings only, and the optional 4th element for
      the repost chain's first-seen date. It's `{}` without a ledger, so the
      browser never gets a 404.
47. **`meta.compstimate`** is `backtest(jobs, { seed: 20261002, maxN: 500 })`
    from `public/features/compstimate.js`, plus `computedAt`. It's null for
    demo payloads, because an accuracy figure for fake data would mislead.
    `backtest` returns **percent numbers** (7.3 means 7.3%). The first summary
    draft multiplied by 100; that's fixed.
48. **`api/meta/<slug>.json`** (an addition to the contract's file table,
    internal to api.js) holds the list's `meta`, so **live** browser fetches
    keep the Compstimate accuracy line and the ledger meta without
    downloading a 1 MB list.
49. **F7 CSV** (`dist/data/<slug>.csv` + `README.txt`):
    - Columns are the ROADMAP's list. Salary is vetted and annualized; a
      quarantined salary is empty.
    - RFC 4180 quoting and CRLF line endings. Cells starting with `= + - @`,
      tab or CR get a leading `'` (formula injection).
    - Real snapshots only; demo companies get no CSV.
    - The README covers attribution, a link to the originals, column meanings
      and the base-pay caveat.
50. **F1 market:** `buildMarket(payloads, { generatedAt: builtAt })` gets **all**
    payloads, demo included, because backend's function uses demo payloads
    only when no company has real data and then labels the doc
    `mode: "demo"`. The build warns over 150 kB. On real data: 22 kB, 391
    cells.
51. **`melon-packed-2`:**
    - Top-level fields present on **every** job become columns: `postedAt`,
      `firstSeenAt`, `ageDays`, `ageIsMinimum`, `freshness`, `repost`,
      `extras`, `reqId`, `remote`, `updatedAt`. Encodings: `bool` as 0/1,
      `dict` (firstSeenAt has one value per run; freshness, repost and
      extras), `ts`, or `raw`.
    - `ts` stores an ISO string as epoch ms, only if
      `new Date(v).toISOString() === v`.
    - salary is a value tuple in `shared.salaryKeys` order when it has exactly
      that key set; `currency`, `interval`, `kind` and `source` are dict refs.
    - keywords are a `[r, f, s]` tuple when the key set is exactly those three.
    - Anything that doesn't fit stays inline, so key presence round-trips. The
      build's round-trip check, run with the browser's own `unpackJobs`,
      covers all of it.
    - `api.js` reads both `-1` and `-2`.
    - Measured on the v2 fixture (real Anduril, 2,419 jobs, with synthesized
      v2 fields and a 3-run ledger): plain columns gave 1.47 MB, too close to
      the 1.5 MB budget. The tuple and `ts` encodings brought it to
      **1.19 MB**.
52. **api.js v2:**
    - `loadLib` adds `lib/history.js`. Static live results, for built-ins, get
      `annotate(jobs, fromCompact(api/history/<slug>.json), fetchedAt)` and
      `meta` from `api/meta/<slug>.json`, both cached per session. Custom
      boards get `annotate(jobs, null, …)` and empty meta.
    - In-browser demo jobs are annotated too. Bundled lists pass `meta`
      through.
    - Bug fix: bundled results used to drop `meta`, and `bundled()` didn't
      strip the new `columns` key.
    - `getMarket()` reads `api/market.json` in static mode and `api/market`
      from the server. It's cached, and a failure resolves to null and is
      remembered.
53. **Vetting gate in pages.yml is hard.** The vetting agent's current step has
    no guard and no `continue-on-error`; I kept it, made
    `continue-on-error: false` explicit, and documented that a non-zero exit
    skips the build and deploy. `snapshot.yml` now runs the gate unguarded,
    since the script exists, and still uploads its artifacts. The step summary
    gains a "Compstimate backtest" table (n, MdAPE, within-10%, seed, ledger
    since and runs per company).

54. **Server-mode descriptions (urgent fix).** Backend's speed fix made
    `/api/jobs` lists lazy (no `descriptionHtml`; `meta.lazy`) and added
    `GET /api/job?id=`. `getJobDetail` returned `''` in server mode, so
    the drawer showed no description. It now has one path for both modes:
    `api/job?id=<encoded id>` (server) or `api/desc/…` (static), a single
    cache keyed by job id with concurrent calls sharing a request, and
    failures not cached. Sections from the detail are used only when the
    list's are empty.
55. **QA's `test/e2e/api.e2e.js`** (edited with the coordinator's OK):
    - `validateJob` accepts list jobs without `descriptionHtml`.
    - The per-company test asserts `meta.lazy.descriptionHtml` and that no list
      job carries `descriptionHtml`.
    - It checks `/api/job?id=` for 3 sampled jobs (id echo, string
      description, sections shape, at least one non-empty).
    - The invalid-input test covers `/api/job` with no id (400) and an
      unknown id (404).
    - Both changes are folded into existing tests, so the suite stays at 8.
56. **The build uses backend's shared functions:**
    - `server/export.js#jobsToCsv` and `#csvReadme`, replacing my CSV code.
      The header is `CSV_COLUMNS`, with a new `data_mode` column. The path
      stays `data/<slug>.csv` (contract); `csvFileName` is the server's
      download name and isn't needed for the static path.
    - `server/index.js#BACKTEST_OPTS` (a local copy is only the fallback).
      Importing index.js doesn't keep the build alive: it exits in about 4 s.
    - `compactLedger` and `buildMarket` were already in use.
    - **Demo payloads are now vetted** (`vetSalaries`) before
      `buildMarket`, CSV and bundling.
    - **CSVs are written for demo companies too** (rows `data_mode=demo`,
      explained in backend's README), matching `GET /api/export` and avoiding
      broken "Download CSV" links. This reverses decision 49's real-only
      choice.

### Wave 2 security fixes (docs/REVIEW.md "v2 review")

57. **V2, artifact trust.** `ledger.sh` has a single `restore_artifact`, also
    exposed as `restore-artifact`, which pages.yml now uses for
    `job-board-snapshots` instead of its own `gh run list` loop. It considers
    only non-expired artifacts whose `workflow_run.head_repository_id ==
    repository_id`, so fork runs are dropped at the listing. Then
    `GET /actions/runs/{id}` must show:
    - `event` in push, schedule or workflow_dispatch (not pull_request,
      pull_request_target or workflow_run);
    - `head_repository.full_name` equal to this repo;
    - `head_branch` equal to the default branch, from `GET /repos`, or a
      branch in `TRUSTED_BRANCHES` (workflow env; the deploy branch).

    Skipped runs are logged with the reason. The branch store is unaffected:
    the `data-history` branch can only be written by `persist-ledger`, which
    never runs on PRs.
58. **V3, CSP on Pages.**
    - The policy is generated from `server/index.js#CSP`, a single source,
      with `frame-ancestors`, `report-*` and `sandbox` stripped because meta
      tags ignore them. It's injected with the referrer policy after
      `<meta charset>` in **every** built page.
    - The share-page redirect is moved to an external `c/share-redirect.js`,
      which reads its target from `data-target`.
    - Dev harness pages with inline code (`viz/demo.html`,
      `features/demo.html`, not linked from the app) are removed from `dist/`
      rather than loosening the policy.
    - **Build gate:** any inline `<script>`, `<style>` element, `on*=`
      handler or `javascript:` URL in a shipped page fails the build.
      JSON-LD/JSON scripts are allowed.
    - The build refuses to run if the server has no `CSP` export.
59. **V12.**
    - pages.yml's workflow-level permissions are now `contents: read,
      actions: read`, and `pages: write` / `id-token: write` sit on the deploy
      job only. `persist-ledger` keeps its own gated `contents: write`.
    - All `actions/*` uses in all four workflows are pinned to the commit the
      major tag pointed to (resolved with `git ls-remote --tags`), with
      `# vX.Y.Z`: checkout v7.0.1, setup-node v7.0.0, upload-artifact v7.0.1,
      download-artifact v8.0.1, configure-pages v6.0.0,
      upload-pages-artifact v5.0.0, deploy-pages v5.0.1. Update them together
      (or let Dependabot do it).
    - col-refresh (livability's workflow, changed at the coordinator's
      request) commits to `bot/col-refresh`, force-pushes that branch only,
      and opens or updates a PR (`pull-requests: write`). If the repository
      doesn't allow Actions to create PRs, it warns and leaves the branch.
      Caveat: PRs opened with GITHUB_TOKEN don't trigger CI.
60. **Tests:**
    - `test/workflows.test.js` (new): SHA pins with version comments;
      pages/id-token only on deploy; `contents: write` only in
      `persist-ledger`, plus col-refresh pushing only its branch; no PR
      triggers on pages/snapshot/col-refresh; and the `ledger.sh` trust
      filter against a stub `gh` (fork, PR, other-branch and expired
      artifacts skipped; the trusted run restored).
    - `test/static-build.test.js` gains a CSP test: every page's meta equals
      the server CSP minus frame-ancestors, has the referrer meta and no
      inline code; the share page uses the external redirect; dev pages
      aren't deployed.

## 4. Replayable steps

Run from `/home/user/melon-seek`. File contents are the committed files
themselves. To reproduce, recreate them from this repo (they were written with
quoted `cat > FILE <<'EOF'` heredocs).

1. Explore:
   ```sh
   ls -la && find . -path ./node_modules -prune -o -path ./.git -prune -o -type f -print
   cat package.json docs/CONTRACT.md
   cat server/companies.js .gitignore; ls scripts data data/*
   head -60 server/sources/greenhouse.js; head -40 server/sources/util.js
   cat package-lock.json
   grep -n "https://" server/sources/ashby.js server/sources/lever.js
   python3 -c "import yaml; print('yaml ok')"      # -> yaml ok
   ```
2. Create directories:
   `mkdir -p .github/workflows docs/screenshots docs/process/prompts`
3. Write `Dockerfile`, `.dockerignore`, `.editorconfig`, `ci.yml` and
   `snapshot.yml`.
4. Validate the workflow YAML:
   ```sh
   python3 -c "
   import yaml
   for f in ['.github/workflows/ci.yml','.github/workflows/snapshot.yml']:
       d=yaml.safe_load(open(f)); print(f, 'ok', list(d.keys()))
   "
   ```
   Output:
   `ci.yml ok ['name', True, 'permissions', 'jobs']` and
   `snapshot.yml ok ['name', True, 'permissions', 'concurrency', 'jobs']`.
   The `True` key is PyYAML's YAML 1.1 reading of `on:`. It's harmless:
   GitHub's parser treats it as the `on` key.
5. Change the Dockerfile's per-directory `COPY` lines to `COPY . ./`
   (decision 3).
6. Write `README.md`, `docs/ARCHITECTURE.md` and `docs/ADDING_A_BOARD.md`.
7. Quote the Mermaid edge label:
   `sed -i 's/-->|RawJob\[\]| NORM/-->|"RawJob[]"| NORM/' docs/ARCHITECTURE.md`
8. Read `scripts/snapshot.js` once it existed, and add the
   `<source>:<board>` and "live data only" notes to the README snapshot
   section.
9. Run the CI smoke test locally. Use a free port, and kill the server by PID,
   not with `pkill -f "node server/index.js"`: that pattern also matches the
   calling shell's own command line and kills it, which is what happened
   here.
   ```sh
   PORT=5173 npm start > server.log 2>&1 & PID=$!
   for i in $(seq 1 30); do curl -fsS http://127.0.0.1:5173/api/companies >/dev/null 2>&1 && break; sleep 1; done
   curl -fsS http://127.0.0.1:5173/api/companies | jq -e 'type=="array" and length>=3 and (map(.slug)|index("anthropic")!=null)'
   curl -fsS --max-time 90 'http://127.0.0.1:5173/api/jobs?company=anthropic' \
     | jq -e '(.jobs|type=="array") and (.mode|IN("live","cache","snapshot","demo"))'
   kill $PID
   ```
10. Docker (not run here, see gaps):
    ```sh
    docker build -t melon-seek . && docker run --rm -p 5173:5173 melon-seek
    docker inspect --format '{{.State.Health.Status}}' <container>   # expect healthy
    ```

**GitHub Pages task:**

11. Survey the code, including the browser-safety scan of `dist/lib` candidates:
    ```sh
    sed -n 1,135p server/index.js
    grep -nE "^import|^export|from '" server/*.js server/sources/*.js scripts/*.js
    grep -nE "node:|process\.|Buffer|require\(|import\.meta|__dirname" \
      server/normalize.js server/salary.js server/geo.js server/keywords.js \
      server/sources/*.js server/companies.js server/demo.js
    grep -nE "['\"\`]/(api|vendor|viz|favicon|styles|app)" -r public
    ```
    Result: no `node:` imports, and only `normalize.js:12` uses `process.env`.
    app.js and index.html use absolute URLs, which was reported to the
    coordinator.
12. CORS research. Direct probes fail in this sandbox (proxy 403):
    `curl -sS -m 10 -D - -o /dev/null -H "Origin: https://alvations.github.io" <api url>`.
    Instead: WebFetch of `https://github.com/lever/postings-api`, plus web
    searches for the Greenhouse and Ashby CORS behaviour.
13. Write `public/api.js`, `scripts/build-static.js` and
    `.github/workflows/pages.yml`. Add `"build": "node scripts/build-static.js"`
    to `package.json`, and `dist/` to `.gitignore` and `.dockerignore`. Add the
    static-build step to `ci.yml`.
14. Build:
    ```sh
    npm run build
    # Built dist/ in ~800ms: 10 lib modules, leaflet, 3 companies
    #   anthropic: demo, 111 jobs ...  (no snapshots in this sandbox)
    # ! server/normalize.js references a Node global ...   (expected; 1 warning)
    ```
15. Run the CI build checks locally:
    ```sh
    jq -e 'type == "array" and length >= 3' dist/api/companies.json
    for f in dist/api/jobs/*.json; do jq -e '.jobs | type == "array"' "$f" >/dev/null; done
    test -f dist/config.js && test -f dist/.nojekyll && test -f dist/vendor/leaflet/leaflet.js
    ```
16. Serve `dist/` under the Pages sub-path and drive it with Chromium.
    Playwright is installed in the scratchpad only, and the browser comes from
    `/opt/pw-browsers`.
    ```sh
    S=<scratchpad>
    cd $S && npm install --no-audit --no-fund playwright-core@1.56
    node $S/serve-subpath.mjs /home/user/melon-seek/dist 4173 /melon-seek/ &
    node $S/pages-smoke.mjs http://127.0.0.1:4173/melon-seek/
    ```
    - `serve-subpath.mjs` is a ~25-line `node:http` static server. It serves
      only under the prefix and logs anything requested outside it, which
      catches absolute URLs.
    - `pages-smoke.mjs`:
      - Aborts every non-127.0.0.1 request (the external hosts are blocked
        anyway) and records which hosts were attempted.
      - Loads the page, waits for result cards, and clicks each company pill.
      - Switches to map mode.
      - Calls `api.js` directly for a custom Lever board and a bogus Greenhouse
        board.
      - Fails on any page error, any local 4xx, any failed local request, or
        any console error other than `net::ERR_INTERNET_DISCONNECTED` from the
        aborted external hosts.
      - Screenshots go to `$S/pages-chart.png` and `$S/pages-map.png`.
17. Check server mode (api.js against the real server):
    ```sh
    P=$(node -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
    PORT=$P node server/index.js & PID=$!
    node $S/server-mode-api.mjs http://127.0.0.1:$P/ ; kill $PID
    ```
    Use a free port picked by Node. Ports 5199 and 5288 were already taken in
    this sandbox (EADDRINUSE / an unrelated server answering 404).
18. Validate all three workflow files with the PyYAML loop from step 4, adding
    `pages.yml`.
19. Test the quiet Lever fallback. No built-in uses Lever yet, so this is a
    scratch-only build that points the quiet list at Greenhouse:
    ```sh
    # fixture: 40 normalized demo jobs saved as a "snapshot" for anthropic, in the scratchpad only
    MELON_SNAPSHOT_DIR=$S/fixture-snapshots node scripts/build-static.js --out $S/dist-quiet
    sed -i 's/MELON_QUIET_CORS_SOURCES = \["lever"\];/MELON_QUIET_CORS_SOURCES = ["greenhouse"];/' $S/dist-quiet/config.js
    node $S/serve-subpath.mjs $S/dist-quiet 4174 /melon-seek/ &
    node $S/quiet-test.mjs http://127.0.0.1:4174/melon-seek/
    ```
    Expect: anthropic → `snapshot` with `error: null` and the banner hidden;
    anduril → `demo` with the error kept; `PASS`.

**Bundle size and snapshot-artifact follow-ups:**

20. Find out where the bytes go (on real data in `data/snapshots/`, which
    appeared locally at 05:55Z):
    ```sh
    npm run build
    node -e "const d=require('./dist/api/jobs/anduril.json'); /* sum JSON bytes per field across d.jobs */"
    ```
    Result: without HTML, sections 47% and keywords 20% on demo data. On real
    Anduril, keywords 39% and locations 16%, at ~1.27 KB/job.
21. Check action runtimes (no GitHub MCP access to `actions/*`):
    ```sh
    for r in checkout setup-node configure-pages upload-pages-artifact deploy-pages upload-artifact; do
      git ls-remote --tags --refs https://github.com/actions/$r.git | sed 's#.*refs/tags/##' | grep -E '^v[0-9]+$' | sort -V | tail -1
    done
    git clone -q --depth 1 --branch v7 https://github.com/actions/checkout.git && grep using: checkout/action.yml   # node24
    ```
22. Stress-test the over-budget path with a real-sized fixture (scratchpad
    only): 833 jobs, 12 KB HTML and 16 bullets each, as openai. Then check the
    drawer:
    ```sh
    MELON_SNAPSHOT_DIR=$S/fixture-big node scripts/build-static.js --out $S/dist-big
    #   openai snapshot 833 jobs list 838 KB desc 833 files 11.51 MB (sections moved to desc ...)
    node $S/serve-subpath.mjs $S/dist-big 4175 /melon-seek/ &
    node $S/drawer-test.mjs http://127.0.0.1:4175/melon-seek/ openai "Real postings are long"
    ```
23. Real-data build, smoke test and drawer test:
    ```sh
    npm run build      # every list < 1.5 MB, 0 warnings
    node $S/pages-smoke.mjs http://127.0.0.1:4173/melon-seek/
    node $S/drawer-test.mjs http://127.0.0.1:4173/melon-seek/ anthropic
    ```
    The smoke test now switches companies through `#companyMenuBtn` →
    `.company-item`, since UX replaced the pill bar with a menu. The old loop
    found 0 pills and silently skipped switching, which is why it now also
    asserts that every company was visited.
24. Dry-run the Pages artifact-restore loop against the real repo (read-only):
    ```sh
    GITHUB_REPOSITORY=alvations/melon-seek bash -c '<the step body, with --dir pointed at a scratch dir>'
    #   ::warning::No snapshot artifact found ...   (expected: no artifact-producing run yet)
    ```
25. Validate all three workflows with the PyYAML loop. Confirm
    `grep -n "contents: write" .github/workflows/*.yml` matches nothing.

**Juice Score integration:**

26. Survey the code:
    ```sh
    grep -nE "^import|^export" server/juice.js server/vet.js
    sed -n 1,40p scripts/vet-salaries.js          # CLI + exit semantics (no docs/VETTING.md yet)
    grep -n "cities\|lib/" server/index.js         # no /api/cities or /lib route in server mode
    ```
27. Run the gate exactly as CI will, against the real snapshots:
    ```sh
    node scripts/vet-salaries.js --no-write-flags --summary $S/vet-summary.md; echo "exit=$?"
    #   exit=1, 8 unquarantined critical salaries (anduril 4, anthropic 2, scaleai 1, shieldai 1); fixtures 435/435
    ```
28. Build and run the new test:
    ```sh
    npm run build      #   12 lib modules ...  juice: api/cities.json 89 cities (190 kB), lib/juice.js bundled
    node --test test/static-build.test.js
    ```
    - `test/static-build.test.js` builds into a temp dir from demo data (an
      empty `MELON_SNAPSHOT_DIR`), so it's deterministic and offline.
    - It then imports the *built* `dist/api.js`, so `./lib/` resolves to the
      bundled copies, with `fetch` served from that dist.
    - Five tests:
      1. cities.json and lib/juice.js are bundled, and juice's imports exist;
      2. lists are packed with no `juice` key;
      3. static `getJobs` gives every matched, salaried job a
         `juice.best.score` in 0–100, and unmatched jobs get `null`;
      4. with cities missing, every job gets `juice: null` and no error;
      5. server mode attaches juice from `api/cities`, and a missing route is
         requested once per session.
29. Check in the browser on real data (scratchpad):
    `node $S/juice-browser.mjs http://127.0.0.1:4173/melon-seek/`,
    `node $S/juice-timing.mjs ...`, and `node $S/pages-smoke.mjs ...`.

**v2 "1-up" features:**

30. Ledger script, branch store, against a local bare remote. The whole
    sequence below is in `<scratchpad>/ledger-test*`:
    1. `git init --bare remote.git` and a work clone.
    2. `HISTORY_STORE=branch bash .github/scripts/ledger.sh restore`: no branch
       yet, so it seeds from the artifact. The artifact path is stubbed with a
       fake `gh` on `PATH`.
    3. `commit-branch`, then `commit-branch` again, which reports unchanged.
    4. Change a file, `commit-branch`, then `restore` in a fresh clone.
    5. Confirm the work tree and checked-out branch are untouched.
31. Artifact store against the real repo (read-only):
    `GITHUB_REPOSITORY=alvations/melon-seek bash .github/scripts/ledger.sh restore`.
    `history-ledger` doesn't exist yet, so it starts fresh. A probe with the
    existing `salary-vetting` name finds runs newest-first. The download
    itself is blocked here, because the sandbox proxy refuses GitHub's Azure
    blob host (403). On runners it isn't blocked.
32. v2 fixture build (scratchpad only):
    - Real snapshots plus synthesized `postedAt`, `reqId`, `extras` and
      salary spread/zones/kind/source.
    - A 3-run ledger recorded with `scripts/history.js#recordRun`: job A is
      present, then closed, then re-posted as B.
    - Then:
      ```sh
      MELON_SNAPSHOT_DIR=$S/v2snap MELON_HISTORY_DIR=$S/v2hist node scripts/build-static.js --out $S/dist-v2
      ```
33. Per-field byte breakdown of `dist-v2/api/jobs/anduril.json` (node one-liner)
    → added the tuple and `ts` encodings → rebuilt: 1.47 → 1.19 MB.
34. Tests and browser checks:
    ```sh
    node --test test/static-build.test.js            # 10/10
    npm test  (x3)                                    # see section 5
    node $S/v2-browser.mjs | pages-smoke.mjs | drawer-test.mjs  (real-data dist, /melon-seek/)
    ```

35. Server-mode fix:
    ```sh
    node scripts/e2e.js --api-only          # 8/8
    PORT=$P node server/index.js & node $S/server-drawer.mjs http://127.0.0.1:$P/
    #  drawer 8,930 chars, 1 request /api/job?id=anthropic%3A5264619008, cached on reopen, PASS
    ```

## 5. Verification

| Check | Result |
| --- | --- |
| PyYAML parse of `ci.yml` and `snapshot.yml` | Pass (2/2), run twice (after writing and before this log). |
| README relative link targets exist (`ci.yml`, `snapshot.yml`, `ARCHITECTURE.md`, `ADDING_A_BOARD.md`, `CONTRACT.md`) | Pass (5/5). |
| Endpoint URLs in README match the adapter source | Pass, checked by grep. |
| `scripts/snapshot.js` CLI matches the workflow invocation | Pass (`-- slug...`, live only). |
| Local smoke test (step 9) at 2026-10-02T05:29Z | **Not verifiable yet.** `npm start` crashed with `ERR_MODULE_NOT_FOUND: server/demo.js`, which the features engineer hadn't written yet. Port 5199 was also held by an unrelated process that answered 404. `jq` 1.7 is available. |
| `npm test` | Not run by this workstream. The tests belong to the other engineers and were still being written. |
| `docker build` | Not run (docker binary present, untested). |
| Mermaid render | Not rendered. Syntax was reviewed by hand. |
| Screenshots | None for the README. Placeholders only, and the lead adds the images. |
| PyYAML parse of `ci.yml`, `snapshot.yml`, `pages.yml` (Pages task) | Pass (3/3), re-run after every workflow edit. |
| `npm run build` | Pass. 10 lib modules, Leaflet, 3 companies (demo, because this sandbox has no snapshots). No warnings after the comment-aware scan. CI's `jq` checks of `dist/` pass locally. |
| Pages smoke (`pages-smoke.mjs`, Chromium 1194, `/melon-seek/` prefix) | **PASS** at 05:41Z and 05:44Z. The page renders 111 roles with the chart and the demo banner. Switching Anthropic → Anduril → OpenAI updates the title, active pill and `#c=` hash. Map mode shows price-tag pins and the "Basemap unavailable" fallback. 0 page errors, 0 local 404s, 0 failed local requests. 15 console errors, all `net::ERR_INTERNET_DISCONNECTED` from the deliberately aborted external hosts (fonts, boards, map tiles). An earlier run at 05:38Z failed on an app.js `sortJobs` null crash. That was reported, the UX agent fixed it, and the run passed. Screenshots: `<scratchpad>/pages-chart.png`, `pages-map.png`. |
| Custom boards in static mode (same run) | `lever:acme` → demo (100 jobs) with an error. A bogus Greenhouse board → demo with an error. |
| Quiet Lever fallback (`quiet-test.mjs`, scratch build with a fixture snapshot and a test-only `MELON_QUIET_CORS_SOURCES=["greenhouse"]`) | **PASS.** Snapshot fallback → `mode: "snapshot"`, `error: null`, demo banner hidden, badge "Snapshot · Oct 1". No-snapshot company → `mode: "demo"` and the error is kept. |
| api.js in server mode (`server-mode-api.mjs` against `node server/index.js`) | Pass. `isStatic()` is false, relative `api/companies` and `api/jobs` work, `apiFetch('/api/jobs?company=openai')` works, and an unknown company throws `Unknown company "nope"`. |
| Pages workflow on GitHub | Not run by me. The lead's run 36970453911 reached `configure-pages` and failed only because Pages wasn't enabled yet. |
| Real-data bundle sizes (8 companies, 06:00Z) | **All lists < 1.5 MB.** anduril 1.30 MB (2,418 jobs), xai 924 kB, openai 430 kB, palantir 391 kB, scaleai 378 kB, cohere 321 kB, shieldai 320 kB, anthropic 316 kB. Description files total ~66 MB; site total 75 MB. Before: anthropic 8.5 MB, openai 10 MB, shieldai 7.2 MB, anduril 2.94 MB even without HTML. The round-trip check passed for every company. |
| Real-sized fixture, over-budget path (`dist-big`) | Pass. openai list 838 KB with sections moved; the drawer loads the 12 KB description; `getJobDetail` returns 8 sections; the reopen is served from cache (no new request); 0 page errors or 4xx. |
| Drawer, real anthropic | Pass. Packed list, no `descriptionHtml` key, 14 KB of drawer text after the lazy load, cached on reopen. The bullets don't show in the same drawer when sections were moved (UX follow-up, decision 37). |
| Full smoke on real data (06:01Z) | **PASS.** All 8 companies switch via the company menu (hash `c=<slug>`, title shows the real count, e.g. "2,418 roles"). Snapshot badge on all of them; Lever boards (palantir, shieldai) have no live-fetch error (quiet), the others show it in the badge details. Map: 9 pins. 0 app or page errors, 0 local 404s. |
| Artifact restore dry-run | Pass (warns "No snapshot artifact found" and continues; the only successful snapshot run predates the artifact). |
| YAML (3 workflows) | Pass. No `contents: write` remains. |
| `test/static-build.test.js` (juice task) | **5/5 pass** (3.6 s). |
| Juice in Chromium, real data (07:0xZ) | **PASS.** Every job on all 8 companies has a `juice` field. Scored: anthropic 539/638, anduril 1,899/2,418, openai 660/833, shieldai 415/581, palantir 225/320, scaleai 126/194, xai 93/297, cohere 77/132. 0 page errors. Full smoke still passes (8 company switches, 0 app or page errors, 0 local 404s). |
| Salary vetting gate on real snapshots | **Exit 1.** 8 unquarantined critical salaries, e.g. Anthropic Fellows "$4.6M", Scale AI "Strategist, Qatar: $500K to $5M", Anduril "12,600–167,000 USD", Shield AI "88,000–130,000 USD per-month-salary". Fixtures 435/435. As wired, this blocks `pages.yml` deploys until the vetting agent fixes or quarantines them. |
| `test/static-build.test.js` v2 (07:30Z) | **10/10.** The five new tests: (a) the packed-2 list deep-equals an independent recomputation, `annotate(vetSalaries(snapshot), ledger, builtAt)`, using the real Greenhouse fixture through the real adapter and normalizer plus a 3-run ledger with a repost; (b) `api/history` = `compactLedger(ledger)`, closed postings left out, repost count kept, `api/meta` = list meta, `{}` without a ledger; (c) CSV header, rows, RFC 4180 quoting, formula prefix, README, none for demo; (d) market.json ≤ 150 kB and `getMarket()` (feature-detected); (e) a static **live** fetch, the board stubbed with the fixture, gets firstSeenAt from `api/history` and meta from `api/meta`. Every build in the test uses its own temp out, snapshot and history dirs. |
| Server-mode drawer and e2e (07:41Z) | `node scripts/e2e.js --api-only` **8/8**. Chromium against `node server/index.js`: the drawer description loads with one `/api/job?id=` request, the bullets show, it's cached on reopen, and there are 0 page errors and 0 local 4xx. `test/static-build.test.js` **11/11** (adds a server-mode `getJobDetail` unit test). |
| Wave 2 security (CSP, trust, permissions) | Chromium on the real-data dist under the injected CSP: **0 `securitypolicyviolation` events** across load, drawer and map mode; the share page `c/openai/#m=map` redirects to `#c=openai&m=map`; full smoke PASS. `test/workflows.test.js` 5/5; `test/static-build.test.js` 12/12. Real-repo dry-run of `restore-artifact`: push runs on the deploy branch pass the trust check (the download is blocked by the sandbox, as before). |
| Full `npm test` ×3 (07:26Z) and ×3 (07:28Z) | **My tests green in all 6 runs.** Run set 1 was 201/206: 4 `demo.test.js` (features was editing `server/demo.js`, uncommitted) and 1 `features.test.js`. Run set 2 was 212/213 ×3: only `features.test.js` "title normalization › role families" (product's in-progress `compstimate.js` / `roles.js`). The coordinator's intermittent "packed list doesn't round-trip (job 0)" was the window between my packer emitting `columns` and api.js decoding them (two edits a few minutes apart); not seen since. |
| Real-data build (8 companies, pre-v2 snapshots, no local ledger) | Pass, 0 warnings. Anduril list 1.29 MB, market.json 22 kB (real, 391 cells), 8 CSVs (Anduril 695 kB), backtest on every real company, e.g. Anduril n=500, MdAPE 7.1%, within 10% 53.6%. |
| Browser, real-data packed-2 dist (07:32Z) | **PASS.** Smoke switches all 8 companies with 0 app or page errors and 0 local 404s. `getJobs` returns v2 fields and `meta`; `getMarket` returns `melon-market-1`. The drawer description loads lazily, the bullets now show in over-budget companies (the UX re-render landed), and it's cached on reopen. One local 404, `features/comps.js`: app.js's guarded `import('./features/comps.js').catch(() => null)` for product's not-yet-landed F1 module. |
| Pages step summary (run locally against dist-v2) | The Compstimate table renders, e.g. anduril n=500 7.3% / 53%. palantir and xai show 0.3% MdAPE, suspiciously low; flagged to product. |
| `npm test` (full, 07:1xZ) | 165/166. The one failure is `test/fx-consistency.test.js` (CAD: `server/salary.js` 0.73 vs `public/viz/palette.js` 0.7117), from FX tables owned by backend/viz, not this change. Two transient `features.test.js` failures cleared on re-run while another agent was editing. |

## 6. Known gaps and follow-ups

- ~~Smoke test and `npm test` need a re-run~~: done (real-data smoke and full
  `npm test`, section 5). `docker build` is still not run.
- ~~Snapshot pushes don't trigger CI / push straight to the default branch~~:
  obsolete. Snapshots are no longer committed (decision 18).
- **`CMD ["npm","start"]`:** npm sits between Docker and node for signal
  handling. If `docker stop` hangs for 10s, switch to
  `CMD ["node","server/index.js"]` or add `--init` / `tini`.
- **The health check assumes the server listens on IPv4 `127.0.0.1`.**
  `listen(port)` with no host binds `::`, which is dual-stack on Alpine, so it
  should work. Unverified.
- **`docs/screenshots/` is empty and git doesn't track it** until the lead
  adds `chart.png` and `map.png`.
- **Assumptions in the docs that depend on other workstreams:**
  - Custom boards persist in the URL hash.
  - The UI labels demo data visibly.
  - The UI has an "Add board" source picker in `public/app.js`.
  - The server picks the adapter by `company.source`.

  Check these once `public/app.js` and `server/index.js` settle.
- **`package-lock.json` version mismatch** (`1.0.0` vs `0.1.0`). Harmless for
  `npm ci`. Regenerate with `npm install --package-lock-only`.
- **Actions are pinned to major tags** (now v5–v7, Node 24). For
  supply-chain hardening, pin to commit SHAs and add Dependabot for
  `github-actions`.
- **Browser CORS behaviour is unverified from here.** All three board APIs
  were blocked by the sandbox proxy. After the first Pages deploy, open the
  site and check the badge for each company. Greenhouse should read "Live".
  If Ashby reads "Snapshot" with an error, its CORS assumption was right. If
  Lever ever starts refusing, it reads "Snapshot" with no error, by design.
- ~~No real snapshots in this sandbox~~: real snapshots arrived at 05:55Z
  (gitignored); local builds now use them.
- **Bundle size grows with each company.** Lists are capped at 1.5 MB each
  (decisions 35–37), but description files add ~1–34 MB per company (site
  total 75 MB, against Pages' 1 GB limit).
- **Deploying from `claude/stoic-ride-54ddxp`** needs that branch allowed on
  the `github-pages` environment (documented in the README). Otherwise the
  deploy job fails with a protection-rule error.
- **Pages source setting.** A `pages-build-deployment` run appeared at
  ~06:00Z. That's GitHub's branch-based Pages builder, which suggests Pages
  may be set to "Deploy from a branch". It must be "GitHub Actions" for
  `pages.yml` to deploy the app; otherwise the repo root (README) gets served.
- **The salary vetting gate currently FAILS on real data** (8 critical jobs;
  section 5). As specified, it blocks every `pages.yml` deploy until the
  vetting agent quarantines or fixes those salaries. If the site must go out
  first, the lead could temporarily set `continue-on-error: true` on the
  pages.yml gate step; I haven't done that.
- **`docs/VETTING.md` is missing.** The gate's command and semantics come from
  the `vet-salaries.js` header. Re-check them when the doc lands.
- **Server-mode juice needs backend routes** `/api/cities` and `/lib/*.js`
  (requested). Until then, server mode serves `juice: null`.
- **`test/fx-consistency.test.js` fails** (CAD 0.73 vs 0.7117 between
  salary.js and palette.js). This is for backend/viz, not this workstream.
- **Artifact fallback starts empty.** The first new-style `snapshot.yml` run
  creates `job-board-snapshots`. Until then a board that fails during a Pages
  build falls back to demo data. Artifacts expire after 14 days, and the
  restore loop only looks at the last 5 successful runs.
- **Drawer bullets in over-budget companies** need the app.js re-render
  (decision 37). Reported, and being relayed to UX.
- **Desc files include the bundled demo's descriptions** (~110 extra per
  company when a real snapshot exists). Small, but they could be skipped by
  dropping `api/demo/<slug>.json`, which is only reached if the main list fails
  to load.
- **v2 data isn't real yet in this sandbox.** The local snapshots predate the
  v2 normalizer, so sizes were measured on a synthesized v2 fixture (Anduril
  1.19 MB). Check the first real Pages run's build log: per-company list,
  history, backtest and CSV sizes are printed, and the build warns over
  1.5 MB.
- **The artifact ledger chain breaks after 90 days with no runs**, and two
  overlapping runs mean the last upload wins. The branch store
  (`HISTORY_STORE=branch`) fixes both; it's waiting on the user's D1 decision.
- **Ages in bundled lists are as of build time** (≤ 1 day old with the daily
  deploy). Live browser fetches are annotated as of the fetch.
- **`features/comps.js` 404** until product lands F1's `public/features/comps.js`
  (app.js already imports it guardedly).
- **og.test.js doesn't pin `MELON_HISTORY_DIR`.** Harmless today, since there's
  no local `data/history`. Once a developer has a local ledger, its builds
  would read it; one env line would fix it (not my file; reported).

## 7. Change log

- 2026-10-02T05:24Z: Wrote `Dockerfile`, `.dockerignore`, `.editorconfig`,
  `ci.yml` and `snapshot.yml`. Validated the YAML with PyYAML.
- 2026-10-02T05:24Z: Changed the Dockerfile from per-directory `COPY` to
  `COPY . ./` so a missing `data/` doesn't break the build.
- 2026-10-02T05:25Z: Wrote `README.md`, `docs/ARCHITECTURE.md` and
  `docs/ADDING_A_BOARD.md`. Quoted the Mermaid `RawJob[]` edge label.
- 2026-10-02T05:28Z: Follow-up. Saved the verbatim prompt to
  `docs/process/prompts/devops.md`. Re-validated the YAML.
- 2026-10-02T05:29Z: Read `scripts/snapshot.js` and added the
  `<source>:<board>` and live-only notes to the README. Tried the local smoke
  test; it was blocked by the missing `server/demo.js`.
- 2026-10-02T05:31Z: Wrote this process log.
- 2026-10-02T05:33Z: Pages task. Surveyed `server/index.js`, the adapters and
  `app.js`. Scanned candidate `dist/lib` modules for Node-only code (no `node:`
  imports; `normalize.js` had `process.env`). Told the coordinator that
  app.js/index.html use absolute URLs, and proposed the `apiFetch` drop-in.
- 2026-10-02T05:35Z: CORS research (Lever docs via WebFetch; web search for
  Greenhouse and Ashby). Wrote `public/api.js` and `scripts/build-static.js`.
  Added `npm run build` and `dist/` ignores.
- 2026-10-02T05:37Z: First Pages smoke test passed. Fixed a misleading
  per-source "blocked" message that named the wrong board.
- 2026-10-02T05:38Z: Smoke test failed on an app.js `sortJobs` null crash.
  Reported it to the coordinator with a one-line fix.
- 2026-10-02T05:39Z: Wrote `pages.yml`. Added the static-build check to
  `ci.yml`. Validated the YAML. Checked api.js in server mode.
- 2026-10-02T05:41Z: Smoke test passed again after the UX fix. Reviewed the
  screenshots. Added the README "Deploying to GitHub Pages" section and the
  layout entries.
- 2026-10-02T05:43Z: Coordinator follow-up. `snapshot.yml` and `pages.yml` now
  call `npm run snapshot` with no arguments. Confirmed the build already loops
  over `listCompanies()`. Lever is now attempted live, with a quiet snapshot
  fallback (`MELON_QUIET_CORS_SOURCES`). The quiet-fallback test passed. Made
  the warning scan ignore comments. Updated the README, ADDING_A_BOARD and
  this log.
- 2026-10-02T05:50Z: Bundle-size follow-up. `descriptionHtml` is now
  lazy-loaded from `api/desc/<slug>/<id>.json`. Added
  `api.js#getJobDetail`, `descPath` and `sanitizeJobId` (shared with the
  build). Over-budget lists move sections into the desc files. The build
  summary prints list and desc sizes. Added desc checks to CI.
- 2026-10-02T05:52Z: Bumped actions to their Node 24 majors (checkout v7,
  setup-node v7, configure-pages v6, deploy-pages v5, upload-pages-artifact v5
  with `include-hidden-files: true`), checked from each `action.yml`.
- 2026-10-02T05:53Z: The fixture stress test passed. Found and reported that
  over-budget drawers need a bullet re-render (UX).
- 2026-10-02T05:56Z: Real snapshots appeared. Anduril's list was 2.94 MB even
  without HTML, so I added the lossless `melon-packed-1` list format with a
  build-time round-trip check. All 8 lists are now under 1.5 MB (largest
  1.30 MB).
- 2026-10-02T05:58Z: Lead decision: snapshots are no longer committed.
  `snapshot.yml` uploads the `job-board-snapshots` artifact (14 days) and drops
  `contents: write`. `pages.yml` restores the newest artifact before fetching
  fresh data (`actions: read`). Added `TODO(vetting)` placeholders. Updated the
  README, ARCHITECTURE, ADDING_A_BOARD and the Dockerfile comment.
- 2026-10-02T06:01Z: Updated the smoke test for the new company menu. Full
  real-data smoke (8 companies), drawer test and YAML checks all pass.
- 2026-10-02T07:05Z: Juice Score integration. Surveyed `juice.js`, `vet.js`,
  the `vet-salaries.js` CLI and the server routes. There is no `/api/cities`
  or `/lib/` route; I requested them from the backend via the coordinator.
- 2026-10-02T07:08Z: `api.js` gained `getCities()`, a lazy `lib/juice.js`
  loader, `vetSalaries` on static results, and `attachJuiceAll` on every
  `getJobs` result in both modes, with `juice: null` and no error when
  unavailable. The build bundles `lib/juice.js` (optional),
  `api/cities.json`, and strips `juice` before packing.
- 2026-10-02T07:10Z: Ran the vetting gate on real snapshots: exit 1, 8
  critical. Replaced both `TODO(vetting)` placeholders with the guarded,
  blocking gate step. snapshot.yml still uploads its artifact when the gate
  fails. CI checks the juice files are bundled and that lists carry no juice.
- 2026-10-02T07:14Z: Added `test/static-build.test.js` (5/5). Browser check on
  real data passes. Full smoke still passes. Full `npm test` is 165/166 (the
  fx-consistency failure is unrelated). Updated the README and this log.
- 2026-10-02T07:15Z: v2 "1-up" work. Proposed the history, market and
  backtest interfaces; the coordinator confirmed them (fromCompact,
  ledgerMeta, buildMarket(payloads), seed 20261002 / maxN 500).
- 2026-10-02T07:17Z: `.github/scripts/ledger.sh` (artifact and branch stores),
  with the branch store tested against a local bare remote. Artifact lookup
  dry-run against the real repo; the download is blocked by the sandbox
  proxy.
- 2026-10-02T07:19Z: Ledger restore, upload and the `persist-ledger` job in
  snapshot.yml and pages.yml. Explicit hard vetting gate. Compstimate summary
  table.
- 2026-10-02T07:21Z: The build uses `server/lib-modules.js`, annotates with
  `server/history.js`, and writes `api/history` (`compactLedger`), `api/meta`,
  `meta`, CSV + README, and `market.json` (feature-detected). melon-packed-2
  columns. `data/history/` gitignored.
- 2026-10-02T07:22Z: api.js: packed-2 unpack, live and demo history merge,
  `api/meta`, `getMarket()`, the bundled-meta bug fix.
- 2026-10-02T07:24Z: The v2 fixture build showed Anduril at 1.47 MB. Added the
  salary and keyword tuple and `ts` encodings, reaching 1.19 MB.
- 2026-10-02T07:26Z: Extended `test/static-build.test.js` to 10 tests. Fixed
  the backtest percent units in the build log and step summary.
- 2026-10-02T07:33Z: Branch store seeds from the newest artifact when the
  branch doesn't exist yet (lossless switch). Real-data browser regression
  passes. README ("History ledger", v2 files, packed-2) and this log updated.
- 2026-10-02T07:41Z: Urgent: server-mode `getJobDetail` fetches `/api/job?id=`
  (shared cache, sections merged only when empty). Updated QA's API e2e for
  lazy lists plus `/api/job` (8/8). The build now uses `server/export.js`
  (jobsToCsv/csvReadme/CSV_COLUMNS, demo CSVs marked `data_mode=demo`) and
  `BACKTEST_OPTS`, and vets demo payloads. README API reference updated
  (lazy lists, `/api/job`, other endpoints).
- 2026-10-02T07:55Z: Wave 2 security: V2 artifact trust filter in `ledger.sh`
  (pages.yml snapshot restore uses it too); V3 CSP + referrer meta in every
  page from `server/index.js#CSP`, an external share redirect, an inline-code
  build gate, dev pages excluded; V12 deploy-only pages/id-token, SHA-pinned
  actions, col-refresh opens a PR. Added `test/workflows.test.js` and a CSP
  test. README updated.
