# Prompt: devops (DevOps + technical writer)

Verbatim task prompt given to the DevOps/docs agent by the coordinator.

---

You are the DevOps + technical writer on "melon-seek" at /home/user/melon-seek — a "Zillow for job postings" web app (Node >=18, zero-build, only dep leaflet; see docs/CONTRACT.md for architecture). Other engineers are concurrently writing server/, public/, and test/*.test.js — do NOT edit those. You own only: README.md, Dockerfile, .dockerignore, .github/workflows/ci.yml, .github/workflows/snapshot.yml, .editorconfig, LICENSE is NOT needed (skip), docs/ARCHITECTURE.md, docs/ADDING_A_BOARD.md. Don't commit/push git.

1. README.md: what it is (chart mode default, map mode, Zillow-like filters on salary / responsibilities / fit / skills keywords / department / location / seniority; company switcher Anthropic, Anduril, OpenAI; custom Greenhouse/Ashby/Lever boards), quick start (`npm install && npm start` → http://localhost:5173), data modes (live/cache/snapshot/demo — demo is synthetic data clearly labeled, used when boards are unreachable), `npm run snapshot` to save real data into data/snapshots/, `npm test`, API reference (copy from contract), project layout, and data sources: Greenhouse boards-api (https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true), Ashby posting API (https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true; openai.com/careers/search is backed by Ashby board "openai"), Lever (https://api.lever.co/v0/postings/{board}?mode=json). Note responsible use: public endpoints, cached 30 min. Leave a placeholder section "## Screenshots" referencing docs/screenshots/chart.png and docs/screenshots/map.png (the lead will add the images).
2. Dockerfile (node:22-alpine, npm ci --omit=dev, non-root, EXPOSE 5173, CMD npm start, HEALTHCHECK hitting /api/companies via wget) + .dockerignore.
3. .github/workflows/ci.yml: on push/PR, Node 20 & 22 matrix, npm ci, npm test, and a smoke step that starts the server and curls /api/companies and /api/jobs?company=anthropic and checks JSON has a jobs array (use jq).
4. .github/workflows/snapshot.yml: scheduled daily + workflow_dispatch: npm ci, npm run snapshot (anthropic anduril openai), commit data/snapshots/*.json if changed using github-actions bot with permissions contents: write. (GitHub runners can reach the job boards, so this is how real data gets into the repo.)
5. docs/ARCHITECTURE.md (data flow diagram in mermaid: adapters → normalize (salary/geo/keywords) → cache → API → app.js → chart/map), docs/ADDING_A_BOARD.md (how to add a company to server/companies.js or via the UI "Add board", and how to write a new adapter).
6. .editorconfig.
Validate YAML syntax (e.g. `python3 -c "import yaml..."` if pyyaml exists, otherwise careful review). Report back concisely.

---

Follow-up (from the user, relayed by the coordinator):

Follow-up task from the user: document how you produced your work so another agent can replicate it. (1) Copy your original task prompt verbatim into docs/process/prompts/devops.md; (2) write docs/process/devops.md following docs/process/TEMPLATE.md (brief, inputs, decisions + rationale for Dockerfile/CI/snapshot workflow choices, exact commands you ran incl. YAML validation, known gaps, change log).

---

Second task (GitHub Pages), from the coordinator:

New task from the user: deploy the app on GitHub Pages (repo alvations/melon-seek, served at https://alvations.github.io/melon-seek/ — note the sub-path). Pages is static, so:
1. public/api.js (you own it): `getCompanies()` and `getJobs(params, {refresh})` returning the HTTP API shapes from docs/CONTRACT.md. Mode detection: if `window.MELON_STATIC` (set by the static build via a small inline script or a generated `config.js`), use static mode; otherwise call the server API (`api/companies`, `api/jobs?...` — relative URLs). Static mode: companies from `api/companies.json`; for a company, first try a LIVE browser fetch through the same adapters + normalize pipeline (Greenhouse, Ashby, and Lever public APIs generally allow cross-origin GETs — verify from docs if you can, and handle CORS failure gracefully), then fall back to the bundled `api/jobs/<slug>.json` (snapshot, mode "snapshot"), then the bundled demo JSON (mode "demo"). Custom boards in static mode: live only, else demo generated in-browser.
2. scripts/build-static.js → dist/: copy public/, copy node_modules/leaflet/dist to dist/vendor/leaflet/, copy browser-safe server modules (normalize, salary, geo, keywords, demo, sources/*) to dist/lib/ (check they have no node: imports; if one does, report it to me rather than editing it — the backend and features agents own those), write dist/api/companies.json and dist/api/jobs/<slug>.json for each built-in (from data/snapshots/<slug>.json when present, else demo with mode "demo"), write dist/config.js setting window.MELON_STATIC = true, and add a .nojekyll. Add an `npm run build` script to package.json.
3. .github/workflows/pages.yml: on push to main and claude/stoic-ride-54ddxp, workflow_dispatch, and daily schedule: checkout, setup-node 22, npm ci, `npm run snapshot -- anthropic anduril openai || true` (real data — runners can reach the boards), npm run build, actions/configure-pages, actions/upload-pages-artifact (path dist), actions/deploy-pages; permissions pages: write, id-token: write, contents: read; concurrency group pages.
4. Test locally: `npm run build`, serve dist/ under a /melon-seek/ prefix with a tiny node server in the scratchpad, and load it with Playwright (Chromium at /opt/pw-browsers; install playwright only in the scratchpad) to confirm it renders and switches companies with no console errors. External hosts are blocked here, so expect the fallback.
5. Update README (Deploying to GitHub Pages section, including the one-time setting: Settings → Pages → Source: "GitHub Actions", and that the github-pages environment may need the branch allowed), and add to docs/process/devops.md (decisions, commands, verification, change log). Don't commit; the lead does. Report back concisely.

---

Follow-up to the second task, from the coordinator:

The backend is adding six more built-in companies (scaleai, xai, cohere, palantir, shieldai, mistral). In snapshot.yml and pages.yml, call `npm run snapshot` with no arguments (= all built-ins) instead of listing slugs, and make build-static.js write dist/api/jobs/<slug>.json for every company returned by server/companies.js, not a hardcoded list. Research also found that Lever's docs say it doesn't support cross-origin requests from other sites, even though `*` is returned today. So in static mode, Lever boards should fall back to the bundled snapshot quietly, without an error banner, when a CORS fetch fails. Update README and docs/process/devops.md.

---

Third request (bundle size), from the coordinator:

The first real Pages build on GitHub worked up to configure-pages, which failed only because Pages isn't enabled yet (the user will do that). Problem: the bundles are huge (anthropic 8.5 MB, openai 10 MB, shieldai 7.2 MB) because of descriptionHtml. Please:
1. In build-static.js, write dist/api/jobs/<slug>.json without descriptionHtml (keep sections and keywords), and write each description to dist/api/desc/<slug>/<sanitized-id>.json. Target under 1.5 MB per company list file.
2. In api.js, export `getJobDetail(job) -> Promise<job with descriptionHtml>`. Server mode returns the job unchanged when it already has descriptionHtml; static mode fetches the desc file, and live-fetched jobs already have it. Cache results.
3. Print the per-company list and desc sizes in the build summary.
4. Also update `actions/*` to versions that run on Node 24 if available (the runner warns that Node 20 actions are deprecated).
I'll tell UX to call getJobDetail when the drawer opens. Update docs/process/devops.md.

---

Fourth request (snapshots as artifacts), from the coordinator:

Lead decision: the snapshot workflow committed 74 MB of raw JSON (anduril.json alone is 38 MB), and committing that daily would bloat the repo. I've untracked data/snapshots/*.json and added it to .gitignore. Please change snapshot.yml to upload data/snapshots/ as a workflow artifact (retention about 14 days) instead of committing, and remove `contents: write`. Then:
- Make sure pages.yml still fetches fresh data each run, which it already does.
- The vetting agent will add `node scripts/vet-salaries.js` to the pipeline. Leave room for a step after the snapshot that runs it and fails the build if it reports critical salary anomalies; add the step once that script exists.
- Update the README "snapshot" section and docs/process/devops.md (decision + change log) to explain why snapshots are not committed.
Noted on getJobDetail and fillDescription; I'm relaying the re-render to UX.

---

Fifth request (Juice Score integration), from the coordinator:

Juice Score integration. Lead decision: juice is computed client-side in api.js in BOTH modes, and never stored in the packed lists.
1. build-static.js: add 'juice.js' to LIB_MODULES (it only imports ./geo.js), copy data/cities.json to dist/api/cities.json, and also run the salary vetting gate's CI step: `node scripts/vet-salaries.js` after the snapshot. Ask the vetting agent's docs/VETTING.md for the exact command and failure semantics; if the script isn't final yet, add the step with `continue-on-error: false` behind a check that the script exists.
2. api.js:
   - Export `getCities()`: `api/cities.json` in static mode, `api/cities` in server mode, cached.
   - After every getJobs result (live, snapshot, demo, server), call `attachJuiceAll(jobs, cities)` from juice.js, after vetSalaries. In server mode, load juice.js from the same place you load the other lib modules.
   - If cities fail to load, jobs keep `juice: null`, with no error banner.
3. Tests: the build output includes cities.json and juice.js; in a static build, an unpacked job gets `juice.best.score` when its city matches.
4. Update docs/process/devops.md. Don't commit; report back.

---

Sixth request (v2 "1-up" features), from the coordinator:

New work: the 1-up features (docs/strategy/ROADMAP.md §7, docs/CONTRACT.md "v2 additions"). Your part, static, build and workflows:
1. F4 ledger persistence. Interim decision (the user hasn't chosen a data branch yet): in snapshot.yml and pages.yml, restore the latest `history-ledger` artifact, run the snapshot (which updates data/history/*.json through backend's scripts/history.js), and upload the ledger as a new `history-ledger` artifact with 90-day retention. A missing artifact means start fresh. Design it so switching to an orphan data branch later is a one-step change; document both in the README.
2. build-static.js:
   - Write `api/history/<slug>.json` (compact `id → [firstSeenAt, postedAt, repostCount]`).
   - Write `api/market.json` (via backend's scripts/build-market.js).
   - Write `meta.compstimate` per company (product's backtest).
   - Write `data/<slug>.csv` plus `data/README.txt`.
   - Bump to `melon-packed-2` with the new fields (postedAt, firstSeenAt, ageDays, ageIsMinimum, freshness, repost, salary.spread/zones/kind/source, extras), with the round-trip check extended.
   - Import LIB_MODULES from server/lib-modules.js instead of keeping your own copy.
3. api.js: merge `api/history/<slug>.json` into live-fetched jobs through history.annotate. Add `getMarket()`.
4. Make vet-salaries a hard gate in pages.yml (exit non-zero blocks the deploy), and add the Compstimate backtest summary to the step summary.
Wait for backend's exported functions where needed (I've asked it to report as soon as ledger capture works). Tests; log it in docs/process/devops.md. Don't commit.

---

Seventh request (server-mode lazy descriptions), from the coordinator:

Backend's speed fix has landed: server-mode /api/jobs lists no longer include descriptionHtml (meta.lazy says so), and a new `GET /api/job?id=<job.id>` returns `{ id, descriptionHtml, sections }` (the company comes from the id prefix). Two urgent fixes, since server mode currently shows no description in the drawer:
1. In public/api.js getJobDetail, server branch: fetch `api/job?id=${encodeURIComponent(job.id)}`, merge descriptionHtml, merge sections when the list's are empty, and cache it like the static path.
2. test/e2e/api.e2e.js (QA's file; you may edit it for this): stop requiring descriptionHtml on list jobs, and add a check that /api/job returns it. `node scripts/e2e.js --api-only` must be 8/8 again.
Build functions to wire if you haven't already:
- `buildMarket(payloads)` (scripts/build-market.js; the input must already be vetted);
- `jobsToCsv`, `csvFileName`, `csvReadme` and `CSV_COLUMNS` (server/export.js);
- `backtest(jobs, BACKTEST_OPTS)`, with BACKTEST_OPTS exported from server/index.js (seed 20261002, maxN 500), adding computedAt;
- `compactLedger` (server/history.js).
Then confirm the full `npm test` is green 3 runs in a row, and report.

---

Eighth request (Wave 2 security fixes), from the coordinator:

Wave 2 security fixes for devops, from docs/REVIEW.md "v2 review":
- V2 (medium): ledger.sh and pages.yml restore the newest `history-ledger` / snapshot artifacts from ANY run, and a fork PR could upload poisoned data that Pages then publishes. Filter artifacts to runs on this repo's own branches (head_repository == this repo) with event in (push, schedule, workflow_dispatch), never pull_request, and only from the default or deploy branch.
- V3 (medium): the static Pages build has no CSP. Inject a `<meta http-equiv="Content-Security-Policy">` matching the server's policy (tile hosts, ATS API hosts for live fetches, Google Fonts) plus `<meta name="referrer" content="strict-origin-when-cross-origin">` into every built HTML page. Move the share page's inline redirect into a small external file so script-src stays 'self'.
- V12 (low): move `pages: write` and `id-token: write` to the deploy job only, pin third-party actions by full SHA (with the version as a comment), and make col-refresh open its own branch for review instead of pushing to main directly (or document why not).
Tests or CI checks where possible; log it in devops.md.

---

Ninth request (URGENT: live site shows the GitHub README / links to GitHub), from the coordinator:

URGENT, user-facing and live. Drop everything else. The user reports the live site links to or shows the GitHub page instead of the deployed app. Root causes: (A) Pages is still in "Deploy from a branch" mode, so GitHub's `pages build and deployment` publishes the README on every push and races our pages.yml (e.g. runs 37015077791 vs 37015077526). The real fix is the user flipping Settings → Pages → Source to "GitHub Actions". GITHUB_TOKEN can't change it (it needs admin), so I'll tell the user. Until then, and as a permanent guard: 1. In pages.yml's deploy job, before deploy-pages, wait until no "pages build and deployment" run for this commit is queued or in progress (poll the Actions API with gh, timeout about 5 min), so our app deploy always lands last. Keep the job's permissions minimal; reading actions is enough. 2. After deploy, add a hard post-deploy check that fetches https://alvations.github.io/melon-seek/ (retrying for up to about 3 min for the CDN) and asserts it is the app: it contains a unique marker such as `<meta name="melon-seek-build" content="<sha>">`, which you inject at build time, and it is NOT the README (no rendered "melon-seek" README heading markup). If that fails, re-deploy once, then fail the job loudly with a clear message saying to set the Pages source to GitHub Actions. 3. New .github/workflows/site-watchdog.yml: runs every 30 min plus on demand, performs the same live check, and if the README (or a wrong build) is being served, triggers pages.yml through workflow_dispatch and writes the problem to the job summary. Minimal permissions (actions: write, contents: read); no secrets beyond GITHUB_TOKEN. (B) public/app.js:1828 JUICE_DOC hard-links to github.com/…/blob/main/docs/LIVABILITY.md, which takes users off-site, and the file isn't on main. Fix: the build renders docs/LIVABILITY.md into the site as `methodology/index.html`. Use a tiny dependency-free markdown→HTML converter in scripts/ (headings with stable ids matching the anchors, paragraphs, lists, tables, code, links, escaping) and the site's styles.css, with a link back to the app. JUICE_DOC becomes the relative `methodology/#1-the-formula` (in server mode, serve the same page at /methodology/). You may edit that single line in app.js; I'm telling UX. (C) Never again, enforced by tests: test/links-policy.test.js scans public/**/*.{js,html} and the built dist (excluding vendor/ and api/desc/): no absolute link to github.com, raw.githubusercontent.com or the repo, and no link to a non-allowlisted host. The allowlist is the ATS job hosts (job-boards.greenhouse.io, boards.greenhouse.io, jobs.ashbyhq.com, jobs.lever.co), the OSM attribution and Google Fonts. Every relative link in dist must resolve to a file in dist. The build fails on any violation. Also add an `<a>` click test to the e2e suite (QA owns it; send QA the snippet) checking every in-app link stays on the site origin unless it's on the allowlist. Run npm test and the build, and verify in Chromium that the Juice "How it's calculated" link opens the methodology page on the site. Log it in devops.md (root cause, the fix and the guards). Don't commit; report as soon as it's done. This is the top priority.
