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
