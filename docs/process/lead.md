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
- 2026-10-02: backend finished (29 tests). Fixed `npm test` for Node 22
  (`node --test test/` treats the directory as a file; now
  `node --test test/*.test.js`). Full suite: 61/61 passing.
- 2026-10-02: review agent stopped on an API error after writing most of
  docs/REVIEW.md; the lead wrote docs/process/review.md from it. Findings
  routed by file owner: backend H1 M2 L1 L2 L3 L7 L8 C2; viz M3 L4 L6;
  ux M1 M4 M5 L5 L9 L10 L11 C1; product L9 (features/shared.js).
- 2026-10-02: features finished (172 skills, 48 responsibility themes, 28+4
  fit facets, 246-city gazetteer; 32 tests). Its contract deviations are
  accepted: ISO alpha-2 country codes (GB not UK), optional 3rd arg to
  demoJobs, structured salary in OpenAI demo, fit fallback sentences.
- 2026-10-02: lead integration check: `PORT=5199 node server/index.js`, then
  `node docs/process/scripts/lead-integration-shot.mjs <outdir>` (chart
  default and `#c=anduril&m=map`). Chart mode renders correctly. The only
  console errors were blocked basemap tile requests. Bugs sent to UX: map
  not fitting bounds on deep link, map too short, company pills
  overflowing, KPI text truncated.
- 2026-10-02: research finished (docs/DATA_SOURCES.md). The three built-in
  slugs are confirmed. Greenhouse pay_input_ranges use cents and have no
  interval. Greenhouse and Ashby send `access-control-allow-origin: *`;
  Lever's docs say no cross-origin support. Six more boards confirmed
  (Scale AI, xAI, Cohere, Palantir, Shield AI, Mistral). Sent to backend
  (pay ranges, new built-ins) and devops (snapshot all built-ins; quiet
  Lever fallback in static mode).
- 2026-10-02: user feedback: "the chart mode is still too noisy, similar more
  sleek like how one would view or cluster postings". Spec sent to viz and UX:
  - viz: new default "clusters" view (per-group rows, postings binned by
    salary into count-sized circles, P25–P75 band, median tick), current bars
    kept as "ranges", new onClusterSelect callback.
  - UX: Clusters|Ranges toggle, cluster selection filters the list via a
    chip, compact demo notice, KPI tiles collapsed to one stats row, lighter
    cards, view stored in the URL hash.
- 2026-10-02: user asked for a cost-of-living / livability score with a melon
  pun ("Juice Score" by default). Launched the livability agent
  (prompts/livability.md). It owns data/cities.json, server/juice.js,
  scripts/update-col.js and the col-refresh workflow.
- 2026-10-02: backend review fixes landed (43 backend tests). CI red only
  because of 2 failing tests in test/features.test.js; sent to product.
- 2026-10-02: first GitHub Actions Pages run (run 36970453911). Snapshot step
  fetched REAL data from the runners: anthropic 638 jobs (558 with salary),
  openai 833 (674), scaleai 194, xai 297, cohere 132, palantir 320, shieldai
  581. anduril failed (body > 25 MB cap); mistral returned 0 jobs. The deploy
  failed at configure-pages: "Get Pages site failed ... Not Found", so Pages
  isn't enabled on the repo yet (a user setting). Follow-ups: raise the
  built-in body cap and drop mistral (backend); lazy-load descriptions so
  bundles stay small (devops, ux).
- 2026-10-02: USER-REPORTED BUG: anthropic job 5183044008 ("Anthropic
  Fellows Program, AI Safety & Security") plotted at $4.6M. Root cause, found
  from the real snapshot: no salary in the posting (only "Weekly stipend of
  3,850 USD / 2,310 GBP / 4,300 CAD"); parseSalary matched "$4.6M" in the
  sentence "AI agents find $4.6M in blockchain smart contract exploits". The
  parser accepted money amounts with no pay context and has no stipend or
  weekly interval support.
  How the real data was obtained: the sandbox can't reach the boards, the
  Pages site, or the artifact blob host, so the snapshot workflow
  (snapshot.yml) was dispatched on this branch; its bot commit (acfeaa9) was
  pulled. The 74 MB of snapshots were then untracked (gitignored); the
  workflow uploads an artifact instead (devops).
  User asked for LLM vetting with an audit trail, that it "NEVER happen
  again", and outlier detection. Launched the data-vetting agent
  (prompts/vetting.md): deterministic flag scan, review of every flagged job
  plus a seeded stratified sample, verdicts.jsonl audit trail, parser fixes
  with real-case regression fixtures, a runtime robust-z/Tukey outlier
  quarantine shared by server and static modes, a CI gate in the Pages
  workflow, and an optional Claude API vetting step for CI.
- 2026-10-02: lead quick scan of real snapshots (node one-liner: max > $1.2M,
  min < $15K, M/B suffix in text). Found 4 bug classes, sent to vetting:
  prose money read as pay (anthropic Fellows x2 "$4.6M"; scaleai "Strategist,
  Qatar" "$500K to $5M"); merged pay tiers with an implausible min (anduril
  x3, e.g. "12,600–167,000 USD"); wrong interval label (shieldai
  "88,000–130,000 USD per-month-salary" → $1.56M/yr); possible missed
  salaries (xai 134/297 and scaleai 131/194 salaried).
- 2026-10-02: USER-REPORTED BUG: map mode shows "API key required" on every
  tile on the live site. Cause: CARTO basemaps
  (basemaps.cartocdn.com/light_all, dark_all) now require a key. Sent to
  viz: switch to keyless OSM standard tiles, CSS-filter dark mode on the
  tile pane, configurable tile provider. The server CSP already allows
  tile.openstreetmap.org (server/index.js img-src).
- 2026-10-02: user asked for a dark mode feature. Sent to UX: a
  System/Light/Dark toggle stored in localStorage and applied as
  html[data-theme] before first paint; tokens overridden under both the
  media query and data-theme; chart, map and map tile filter re-render on
  change.
- 2026-10-02: devops finished: packed list format (largest list Anduril 1.30
  MB of 2,418 jobs), lazy per-job descriptions, snapshots as artifacts
  (`job-board-snapshots`, 14 days) restored by pages.yml before fetching,
  Node 24 actions. Observed two Pages deployments per push: our
  pages.yml and GitHub's "pages build and deployment" (branch mode). They
  race (run 36971600567 finished after 36971601630). Asked the user to set
  Settings → Pages → Source to "GitHub Actions".
- 2026-10-02 ~06:05–06:40 UTC: UX, viz, vetting and livability agents
  stopped on a session limit (HTTP 429, reset 06:40 UTC). At 06:40 all four
  were resumed with "resume where you left off" notes. A send_later check-in
  (45 min) is armed so work resumes on its own after any further limits.
- 2026-10-02: user reported no preview image when the link is shared on
  LinkedIn and other social sites. Launched the social-sharing agent
  (prompts/social.md): OG/Twitter meta tags, a 1200x630 card generated from
  an HTML template with Playwright, absolute og URLs via SITE_URL in the
  static build, optional per-company share pages, and a test.
- 2026-10-02: viz finished the clusters view (default) and the ranges detail
  view; wiring notes sent to UX (default groupBy 'department' in clusters,
  onClusterSelect chip, view stored as `v` in the hash).
- 2026-10-02: user asked for competitor analysis, our differentiators, and
  how to 1-up Zillow and the job boards. Launched the strategy agent
  (prompts/strategy.md). Outputs: docs/strategy/COMPETITIVE_ANALYSIS.md
  and ROADMAP.md.
- 2026-10-02: user: "after the research is done, ask the respective agents to
  implement all the one-up features; keep the frontend UI/UX intuitive and
  simple". Asked strategy for an implementation plan per owner, with a UI
  simplicity budget (at most one new main-view control per feature,
  progressive disclosure). The check-in trigger now includes the fan-out
  step.
- 2026-10-02: USER ESCALATION: "$4.5–5M outlier still not solved". Cause:
  server/vet.js (vetting agent) existed but nothing called it. Lead hotfix:
  - vetSalaries runs in normalizeJobs (server/normalize.js), in getJobs'
    stamp (server/index.js, so cached and snapshot data is gated at serve
    time), and on loaded snapshots in scripts/build-static.js; vet.js is now
    bundled into dist/lib for the browser.
  - New check: hourly_high (text-parsed hourly rate above $250/hr). This
    catches Cohere's "$500 home office stipend" read as $500/hr, which is
    $1.04M/yr in 39 postings: below the $1.2M cap and repeated so often that
    the statistical check saw it as normal.
  - Verified on the real snapshots after `npm run build`: 4,551 salaried, 51
    quarantined, 0 remaining above $900K/yr or above $250/hr. Top remaining
    salaries are plausible ($850K max for Anthropic and OpenAI).
  - Added test/vet-gate.test.js with the 5 real cases (110/110 passing).
- 2026-10-02: viz: robust P1–P99 axis bounds with an IQR cutoff, plus edge
  markers for out-of-range postings, so one bad salary can't stretch the
  chart; map fitToData owns the initial fit. UX finished its queue
  (clusters/ranges toggle, dark mode toggle via public/theme-init.js
  because the CSP blocks inline scripts, Insights tab, company menu, QA and
  review fixes). Asked UX to remove its map-fit workaround and show
  "Pay unclear" for quarantined salaries.
- 2026-10-02: social finished. Root cause of the missing link preview:
  index.html had no og:/twitter: tags, and the only image was an SVG
  favicon. Added the tags, a 1200x630 PNG card, absolute URLs via SITE_URL
  in the build, per-company share pages at /c/<slug>/, and a live-preview
  check after deploy.
- 2026-10-02: user asked for a plan only (no implementation) on reusing
  alvations/melon-corporate-ladder (cloned to /home/user/melon-corporate-
  ladder). Launched the ladder-brainstorm agent.
- 2026-10-02: livability finished: Juice Score with 89 cities, a 33-country
  tax model, sourced and dated figures, a monthly refresh. Lead decision:
  compute juice client-side in api.js in both modes (one code path; packed
  lists stay small); the server only serves /api/cities. Integration sent
  to backend (/api/cities), devops (build plus api.js attachJuiceAll, and
  the vet-salaries CI step), UX (card badge, "Most juice" sort, grade chips
  in More, drawer waterfall) and viz (Pay | Juice map pin coloring, FX
  table refresh to match cities.json).
- 2026-10-02: ladder-brainstorm finished (plan only, nothing implemented):
  docs/strategy/CORPORATE_LADDER_PLAN.md. It recommends "Level check" (a
  drawer section using corporate-ladder's two generic IC ladders, honest
  about titles with no level) and optionally an "interview prep" card.
  Questions went to the user. Bug sent to features: "Member of Technical
  Staff" titles were classed as Staff+.
- 2026-10-02: the FX refresh in palette.js (viz) broke four tests that
  pinned the old rates, and juice.js and salary.js carried stale copies.
  Lead fix: palette.js FX_PER_USD is the single source; juice.js now holds
  a verbatim copy; the features tests read the live palette rate; new
  test/fx-consistency.test.js guards drift (salary.js sync sent to
  vetting).
- 2026-10-02: backend added /api/cities (ETag, mtime reload) and a /lib/*.js
  allowlist route (server/lib-modules.js), so api.js loads juice.js the same
  way in both modes. Features fixed the "Member of Technical Staff" →
  Staff+ misclassification (25-title test).
- 2026-10-02: strategy finished (COMPETITIVE_ANALYSIS.md, ROADMAP.md with an
  implementation plan and UI budget). Top 3 to build: Market comps ("same
  role elsewhere"), Honest numbers (base-only caption, wide-range and
  equity labels, published Compstimate error), Listing history and
  freshness (real posted dates, days open, repost detection). Several
  roadmap items need user decisions (history storage, republishing full
  descriptions, company list); see the user summary.
- 2026-10-02: fanned out the 1-up features ("Now" horizon, ROADMAP §7)
  after writing CONTRACT.md "v2 additions":
  - backend: F4 adapters, history.js and ledger capture; F1
    build-market.js and /api/market; F3 backtest into meta; F7
    /api/export; extras in normalize.
  - devops: ledger persistence via artifacts (interim), static
    history/market/CSV, packed-2, hard vet gate, api.js merges.
  - features: extractCompExtras (DEI-safe, ≥95% precision on 100 hand
    labels) and demo fields.
  - vetting: salary.spread and zones, vetted-only inputs.
  - product: backtest(), comps.js, Node-importable role families, 100-title
    hand check.
  - viz: comps range chart.
  - UX: F4 card age, "Listed" filter, Listing drawer block; F2/F3 labels and
    caption; F1 drawer section and Insights card; F5 conditional Save
    button (the only new main-view control); F7 CSV link.
  - livability: guardrails, plus a check of Numbeo's terms (strategy says
    reuse is forbidden), with a replacement plan prepared.
  Interim default for D1: artifacts, because pushing a new data branch needs
  the user's permission. D2 (full descriptions), D3 (companies) and the
  Numbeo question went to the user. D7 (neutral wording) and D8 (drop commute
  and draw-a-boundary) use the roadmap's recommendations.
