# Process log: lead / integrator

## 1. Brief
Prompt: [prompts/lead.md](prompts/lead.md). Build "the Zillow of job postings":
pull a company's job board (Anthropic on Greenhouse first), plot every posting
on a salary-range chart (default) or a map, with a left filter column
(responsibilities / fit / skills keyword chips, department, location), and a
switcher for other companies (Anduril) and other boards (OpenAI). The lead
owns `docs/CONTRACT.md`, `docs/process/README.md`, this file, integration and
all git commits.

## 2. Inputs and sources
- The user's requests (verbatim in prompts/lead.md).
- Prior knowledge of public ATS APIs, later checked by the research workstream
  ([../DATA_SOURCES.md](../DATA_SOURCES.md)):
  - Greenhouse: `https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true`
  - Ashby (backs openai.com/careers/search): `https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true`
  - Lever: `https://api.lever.co/v0/postings/{board}?mode=json`
- Environment probes (section 4).

## 3. Decisions and rationale
1. **Zero-build Node + vanilla ES modules; only dependency `leaflet`.** Keeps
   the app runnable anywhere with `npm install && npm start`, makes parallel
   work simple (no shared bundler config), and avoids CDN dependence: Leaflet is
   served from `node_modules` at `/vendor/leaflet/`.
2. **A small backend (node:http) rather than calling boards from the browser.**
   It normalizes three ATS formats into one Job shape, does salary parsing,
   geocoding and keyword extraction once, caches results, and avoids CORS.
3. **Contract-first fan-out.** Before launching agents the lead wrote
   `docs/CONTRACT.md` (raw job shape, normalized Job shape, module function
   signatures, HTTP API, frontend module APIs, file ownership). Each agent
   prompt names the files it owns and forbids editing others, so agents work
   concurrently without merge conflicts.
4. **Fallback chain: fresh cache → live → stale cache → committed snapshot →
   demo.** The build sandbox cannot reach the job boards (section 4), so the app
   must still work, but synthetic data must never be mistaken for real data:
   the API returns `mode: "demo"` and the UI shows an amber "Demo data" badge.
   Real data gets in via `npm run snapshot` on any machine with internet, or the
   daily GitHub Action (GitHub runners can reach the boards).
5. **Built-in companies:** anthropic (greenhouse/anthropic), anduril
   (greenhouse/andurilindustries), openai (ashby/openai), plus a UI "Add board"
   for any Greenhouse/Ashby/Lever slug.
6. **Keyword facets from curated lexicons, not free n-grams.** Gives clean,
   human-readable chips ("PyTorch", "Cross-functional", "5+ yrs") that are
   consistent across companies.
7. **Roles, added in waves:**
   - Wave 1 (initial fan-out): backend, features, viz, ux.
   - Wave 2 (user asked for more roles): devops+docs, qa.
   - Wave 3: product features (Compstimate, insights), security+a11y review,
     data research.
   QA and review are told to wait until the code exists. Further fixes are
   routed back to the owning workstream rather than adding more parallel
   writers, to avoid file collisions.
8. **Audit trail (user request 6):** every agent copies its prompt verbatim to
   `docs/process/prompts/<role>.md` and writes `docs/process/<role>.md` using
   [TEMPLATE.md](TEMPLATE.md).

## 4. Replayable steps
Environment probes (2026-10-02, cloud sandbox):
```sh
curl -sS "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true"   # 403 from egress proxy
curl -sS "https://api.ashbyhq.com/posting-api/job-board/openai?includeCompensation=true"  # 403
curl -sS "$HTTPS_PROXY/__agentproxy/status"   # confirms connect_rejected for both hosts
```
WebFetch for `boards-api.greenhouse.io` and `job-boards.greenhouse.io` also
returned EGRESS_BLOCKED. The npm registry was reachable.

Scaffold:
```sh
npm init -y && npm i leaflet@1.9.4
# package.json: "type": "module", scripts start/dev/test/snapshot
# .gitignore: node_modules/, data/cache/
# write docs/CONTRACT.md
```
Then the agents were launched in parallel with the prompts in `prompts/`
(Agent tool, `general-purpose` type, background). Integration steps are logged
in the change log below as they happen.

Git: the first push returned 403 (the Claude GitHub App lacked access to the
repo). After the user granted access, `git push -u origin claude/stoic-ride-54ddxp`
succeeded. Commits end with the session's attribution trailer lines.

## 5. Verification
Filled in at integration: `npm test` results, `node scripts/e2e.js` results,
screenshots in `docs/screenshots/`.

## 6. Known gaps and follow-ups
- Live data was never fetched from this sandbox; first real data comes from
  `npm run snapshot` run elsewhere or the scheduled workflow.

## 7. Change log
- 2026-10-02: probed network; scaffolded package; wrote CONTRACT.md; launched
  backend, features, viz, ux agents.
- 2026-10-02: push access fixed by user; pushed scaffold and WIP commits.
- 2026-10-02: launched devops+docs, qa; then product, review, research.
- 2026-10-02: devops+docs finished (README, Dockerfile, CI, snapshot
  workflow); relayed its snapshot-script requirements to backend.
- 2026-10-02: user asked for audit trails; created docs/process/ (this
  folder) and asked every agent to log its process.
- 2026-10-02: first research agent stopped on an API error before writing
  any files; relaunched with a narrower brief (also covers CORS for the static
  build). Its restart prompt is appended to prompts/research.md.
- 2026-10-02: user asked for GitHub Pages deployment. Plan: the static build
  in dist/ (scripts/build-static.js), with public/api.js switching between
  server mode and static mode. Static mode tries a live browser fetch first,
  then the bundled snapshot, then demo data. Deployed by
  .github/workflows/pages.yml. Assigned to devops; UX asked to use relative
  URLs and route fetches through api.js.
- 2026-10-02: viz finished (chart, map, palette, process log, screenshot
  script). Relayed integration notes to UX: resetColors on company switch,
  map fit only on company change, fixed-height chart container.
