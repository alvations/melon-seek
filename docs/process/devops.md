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
14. **`permissions: contents: write`** so the default `GITHUB_TOKEN` can push.
    No PAT is needed.
15. **`concurrency: group: snapshot, cancel-in-progress: false`**, so a manual
    run and the scheduled run can't race their pushes.
16. **Node 22 only.** This is a data job and doesn't need the matrix.
17. **`npm run snapshot -- anthropic anduril openai`.** The `--` passes the
    slugs to `scripts/snapshot.js`. That script exits non-zero only when every
    slug fails, so a single flaky board doesn't block the others.
18. **Commit only on change:**
    - `git add -A data/snapshots/*.json || true` means an unmatched glob
      doesn't kill the `set -e` script.
    - `git diff --cached --quiet` then exits 0 when nothing changed.
    - The bot identity is `github-actions[bot]` /
      `41898282+github-actions[bot]@users.noreply.github.com`, the standard
      Actions bot id, so commits show the bot avatar.
    - The message is `chore(data): refresh job board snapshots (YYYY-MM-DD)`.
    - The commit is pushed with a plain `git push`.

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
25. **Live sources in static mode: `["greenhouse", "ashby"]`, set in
    `config.js` as `MELON_LIVE_SOURCES`.** Lever is excluded because its
    official docs say cross-origin requests from third-party sites are refused,
    so every attempt would only add a guaranteed console error. Ashby is
    uncertain (one secondary source), so it's attempted, and a failure falls
    back cleanly. To change the list, edit `LIVE_SOURCES` in the build script.
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
    `__dirname`) only produce a warning. The one hit is `normalize.js:12`
    (`process.env.DEBUG` in a catch path), which api.js covers with a
    `globalThis.process = { env: {} }` stub. This was reported to the
    coordinator.
31. **`dist/api/jobs/<slug>.json` is always written.** It holds the snapshot if
    `data/snapshots/<slug>.json` has jobs, otherwise build-time demo data with
    an explicit "Synthetic demo data" note in `error`, so the UI's demo banner
    explains why.
32. **`pages.yml`:**
    - Builds on push to `main` and `claude/stoic-ride-54ddxp`, on
      `workflow_dispatch`, and daily at `41 7 * * *` (an off-the-hour minute,
      after snapshot.yml's 06:17 run).
    - Permissions are `contents: read`, `pages: write`, `id-token: write`.
    - `concurrency: pages` with no cancel-in-progress, so a deploy is never cut
      off partway.
    - `npm run snapshot ... || true` means a board outage doesn't block the
      deploy; committed snapshots, then demo data, cover it.
    - A step summary table lists each company's bundled mode, job count and
      `fetchedAt`, so a demo-only deploy is visible in the run.
    - Separate build and deploy jobs follow GitHub's starter workflow, with
      `environment: github-pages` and the page URL output.
    - Action versions: `configure-pages@v5`, `upload-pages-artifact@v3`,
      `deploy-pages@v4`.
33. **CI also runs `npm run build`** and checks `dist/` with `jq` (companies
    array, every `jobs/*.json` has a `jobs` array, `config.js`, `.nojekyll` and
    Leaflet present). A broken Pages bundle now fails PRs, not just the
    deploy.
34. **`dist/` is gitignored and dockerignored.** It's a build output; Pages
    gets it as an artifact, not from the repo.

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
| Screenshots | None. Placeholders only, and the lead adds the images. |

## 6. Known gaps and follow-ups

- **Smoke test, `npm test` and `docker build` need a re-run** once
  `server/demo.js` and the rest of the server exist. Then do step 9 and
  step 10.
- **Snapshot pushes don't trigger CI.** GitHub doesn't start workflows from
  pushes made with `GITHUB_TOKEN`. That's fine for data-only commits. If CI on
  snapshot commits is wanted, push with a PAT or GitHub App token, or add
  `workflow_run`.
- **The snapshot workflow pushes straight to the default branch.** With branch
  protection on, switch to opening a PR (e.g. `peter-evans/create-pull-request`)
  or allow the Actions bot.
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
- **Actions are pinned to major tags (`@v4`).** For supply-chain hardening, pin
  to commit SHAs and add Dependabot for `github-actions`.

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
