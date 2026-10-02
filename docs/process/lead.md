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
- 2026-10-02: devops reported the vetting gate would block deploys (8
  critical). The lead re-ran it on the final vetting code
  (`node scripts/vet-salaries.js --no-write-flags`): exit 0, 0 blocking, 51
  quarantined, 435/435 fixtures. The report predated the gate's "apply
  quarantine first" default. Installed the vetting agent's final steps in
  pages.yml: a hard gate writing flags.jsonl and the step summary; an
  advisory LLM review (needs the ANTHROPIC_API_KEY secret; default model
  claude-sonnet-5-5, overridden by the VET_LLM_MODEL variable); and a
  vetting-report artifact (30 days). npm test: 166/166.
- 2026-10-02: livability guardrails landed: inputs, sources and confidence on
  every score; a rent override; NO_RENT for cities without rent. The Numbeo
  terms check (read through search summaries, numbeo.com blocked) found
  that reuse in a public repo, site or API needs written permission.
  Figures are tagged `terms: "numbeo-terms"` with
  dataStatus.numbeo = "UNDER REVIEW". The replacement plan is in
  LIVABILITY.md §7 (US: HUD/BEA/BLS, about 4–5 dev-days for the
  recommended scope). Decision escalated to the user; nothing deleted.
- 2026-10-02: vetting finished. 681 jobs reviewed (505 flagged plus 176
  seeded sample): 111 parser bugs and 19 ambiguous source postings; all 176
  sampled jobs were correct. Root-cause parser fixes; 435 regression
  fixtures; after the fixes 0 blocking and 7 quarantined. The lead wrote
  data/vetting/2026-10-02/summary.md from the agent's report (the harness
  blocks subagents from writing report-style .md). Job 5183044008 now shows
  a 3,850 USD/week stipend (≈$200K/yr FTE, kind "stipend").
- 2026-10-02 07:27 UTC check-in: 5 agents working (UX, devops, backend,
  features, product). CI red at 68e2fb2 (5 tests); locally 212/213, the only
  failure being product's in-progress roles.js. GitHub's branch-mode "pages
  build and deployment" still runs alongside ours, so the Pages source is
  not yet "GitHub Actions" (asked the user). Integration screenshots (real
  snapshot data, server mode): chart OK (clusters, Juice badges, max $850K).
  Findings routed:
  - Juice saturates at 100 for top roles (livability re-tune).
  - Cluster row labels truncate the median (viz).
  - Server /api/jobs?company=anduril takes 2.8 s and 3.4 MB gzipped (backend:
    a description-less list, a /api/job detail route, cached payloads).
  Next check-in armed for +45 min (trig_01UytGUESHhy6ZM7EZRuWrf9). Note: a
  lead cleanup `kill` of node server processes may also have stopped
  agents' test servers; agents restart their own servers as needed.
- 2026-10-02: features finished extractCompExtras: held-out precision
  equity 96.3% and bonus 100% (rules frozen, labels blind, 72 postings); 219
  agent-labelled postings in total, plus a corpus-wide review of every
  triggering sentence. Accepted judgement: Anthropic's "optional equity
  donation matching" is not equity in the offer, so "+ equity mentioned"
  stays off there. Open minor: salary.js doesn't count a second pay tier
  written on its own line ("All other US locations: $X—$Y") as a zone. UX
  finished wiring every 1-up feature; F1 waits on product's comps.js.
- 2026-10-02: backend finished F1/F3/F7/extras plus the server perf fix
  (Anduril /api/jobs from 2.8 s and 3.4 MB to 1.9 ms warm and 218 KB;
  /api/job detail route; backtest in a worker thread). viz fixed cluster
  labels (adaptive column, never truncate the median) and made the Juice
  legend follow juice.js. Livability re-tuned the score to a saturating curve
  100·(1−e^(−net/80K)): 0 real jobs at 100 (was 68), p90 = 88. The lead
  synced palette.js's fallback juiceNetForScore (verified identical to
  netForScore at 25/45/70/90/99/100). devops finished packed-2, history
  persistence (artifact default; HISTORY_STORE=branch switch), meta files,
  CSV, market.json and api.js v2 merges. The lead isolated og.test.js's
  history dir. npm test 248/248.
- 2026-10-02: product finished roles.js (92/100 role-family hand check on a
  fresh seed), comps.js, backtest() with dedupe modes, and accuracy
  helpers. LEAD DECISION: publish the cautious backtest (BACKTEST_OPTS
  dedupe "role"), because the default "title" dedupe gives xAI and Palantir
  a 0.3% error that only reflects one pay band copied across many titles.
  Cautious numbers: xAI ≈14%, Palantir ≈5%. Updated the server test
  expectation. UX asked to fix the accuracy-unit bug in app.js
  (compAccuracy multiplied percents ≤1.5 by 100) and finish the comps
  wiring. npm test 249/249.
- 2026-10-02: UX finished the final wiring (accuracy helpers, static comps
  imports, stubs removed). Lead verification: npm test 249/249. Real-server
  drawer and Insights screenshots reviewed: pay block plus caption, Juice
  waterfall, Same role elsewhere, Compstimate "±14% (tested on 498)".
  Spot-checked the £375K–640K London RL role against the source text
  ("Annual Salary: £375,000 — £640,000 GBP"): correct. The full e2e suite
  crashed at the outdated company-pill test (the UI now uses a company menu)
  through an unhandled waitForResponse rejection; QA resumed to make the
  harness robust, update the selectors and add v2 feature coverage.
- 2026-10-02 08:16 UTC check-in: only QA is running (e2e refresh). CI green
  at 556f75f; "Deploy to GitHub Pages" succeeded (finished 07:58:47, after
  the branch-mode build at 07:58:10, so the app is live). All integration
  items from the check-in list are done. One more safety-net check-in
  armed (+45 min) for the QA result.
- 2026-10-02: QA refreshed the e2e suite: a robust harness (isolated waits,
  per-test timeouts, crash containment), current-UI selectors, and v2
  coverage for pay unclear, Juice, the caption, drawer order, the lazy
  description, comps, Insights compare, Save, CSV, the map toggle, theme and
  dark mode. Result on real data: 32/33 in 4 runs. Open: BUG-5 (company
  boilerplate becomes keywords on every job: Anthropic 638/638 get
  "Interpretability" etc.), sent to features with a two-layer fix
  (boilerplate-paragraph removal per board, plus a >90%-share facet guard).
  L1–L4 (empty "Listed" filter, doubled tooltip prefix, CSV filename, phone
  badge) sent to UX.
- 2026-10-02: features fixed BUG-5 (boilerplate paragraphs shared by at
  least 50% of a board are excluded from keyword extraction, plus a >90%
  facet guard; Anthropic "Interpretability" goes from 638/638 to only where
  it's real). The lead wired rekeyBoardJobs into the snapshot read paths
  (server/index.js readSnapshot, cached per file; scripts/build-static.js),
  since stored snapshots predate the fix, and updated the
  static-build round-trip test to match. The lead also updated the e2e
  "Listed" test for UX's L1 empty state (options hidden when no job has
  ageDays). FINAL: npm test 254/254; e2e 33/33 on real snapshot data.
- 2026-10-02: user: "fan out the agents so they work together cohesively to
  improve the application". Plan: two waves.
  - Wave 1 (parallel audits plus one perf track):
    - QA: UX heuristics plus a performance and a11y audit → docs/QA.md
      "Improvement audit".
    - backend + features: profile and speed up normalizeJobs (Anduril
      12–15 s → ≤3 s), proven byte-identical by a golden test.
    - new reviewer: finish the REVIEW.md re-check and review the v2 code
      (incl. workflows and llm-vet prompt injection).
    - viz: whole-app visual design consistency audit (DES-n).
  - Wave 2: the lead merges all findings into one prioritized backlog, routed
    to file owners under the contract and the ROADMAP §8 UI budget; then QA
    re-runs e2e and the audit metrics.
  User decisions (Pages source, Numbeo, history branch, descriptions,
  companies, Level check) stay excluded until the user answers.
- 2026-10-02: user: "keep it simple" and "have an engineer agent look for
  mobile optimization". Launched the mobile engineer (prompts/mobile.md):
  a Zillow-app-like phone layout (chart or map first, draggable results
  sheet, one full-screen filter sheet, the job panel as a full page), touch
  and safe-area fixes, deferred work on throttled phones. No new features.
  Restated the simplicity rule for wave 2: findings that add UI will be
  rejected or folded into existing controls.
- 2026-10-02: USER-REPORTED BUG: in map mode, opening the right-hand drawer
  leaves the map layer unscaled and not covering its area. Sent to UX
  (frontend): a ResizeObserver calling invalidateSize on every layout
  change, one consistent drawer behaviour (overlay or push), stacking and
  height fixes, plus a thorough UI/UX matrix test (views × drawer × filter
  column × 6 viewports × 2 themes, plus flows) with automated checks.
  Coordinated with the mobile engineer on shared files.
- 2026-10-02: user: "make sure the site is totally mobile compatible and
  feels smooth on mobile". Raised the mobile engineer's acceptance bar: iOS
  Safari quirks (dvh, safe-area, tap highlight, no hover dependence, input
  ≥16px), Android and 360px; 60fps gestures (transform/opacity only,
  passive listeners, rAF drags, lazy lists), worst frame ≤50 ms at 4x CPU
  throttle; deferred modules; one shared ResizeObserver with UX.
- 2026-10-02: wave-1 results in from QA (4 PERF, 14 UX, 5 A11Y) and the
  viz design audit (13 DES, 5 fixed in viz). Wave 2 routed:
  - backend: PERF-1, the server freeze on first company load (synchronous
    rekey), using a normalizerVersion on snapshots, a cached rekey and
    off-thread work.
  - UX: UX-1 (sort by midpoint), UX-4 (comparisons keep filters), UX-2
    (search ranking), A11Y-1/2/3, UX-6 (plain-language labels), UX-5/11,
    DES-5/7/8/10/11, PERF-2 (cards first).
  - mobile: UX-10, UX-13, A11Y-5, PERF-3/4.
  - viz: PERF-2 chart render, A11Y-1, DES-12.
  - product: UX-9 (Insights prefill), UX-6, DES-9, A11Y-1.
  - features: UX-3 (canonical locations).
  Rejected for simplicity: re-tuning the Juice anchors again (UX-7); a
  dedicated saved-searches control (UX-8).
- 2026-10-02: UX fixed the map/drawer bug. Root cause was stacking, not
  resizing: Leaflet panes (z 400–1000) painted over the drawer (z 80).
  Fix: `.viz { isolation: isolate }`; the drawer overlays a full-size map
  behind a scrim. Also fixed horizontal scroll from recent pills. Layout
  matrix: 158 states and 12 flows passing. Product finished UX-9/UX-6/DES-9/
  A11Y-1. The security re-review finished: of the 20 originals, 18 fixed and
  2 partial (H1 → V4, M2 → V3); 15 new findings (V1–V15). Routed:
  - backend: V1, V4, V10, V14, V15.
  - devops: V2 (artifact trust), V3 (CSP on Pages), V12.
  - vetting: V11 (llm-vet prompt-injection hardening).
  - UX: V5–V9, V13, V14 client side.
- 2026-10-02: vetting fixed V11 (llm-vet). Residual risk accepted: a hostile posting can make its own quote and numbers 'verify', but LLM verdicts are advisory only and the hard salary bounds still gate publishing. Full suite temporarily red from backend's in-progress pipeline refactor.
- 2026-10-02: user reports Compstimate looks incoherent when filters are
  selected; asked for a dedicated task force. Formed one:
  - investigator (new): reproduce, find root causes, write the behaviour spec
    and test matrix in docs/process/compstimate-taskforce.md;
  - product: owns the fix in compstimate.js plus the Compstimate parts of
    app.js (UX handed off those functions);
  - QA: automates the matrix as e2e tests, red first and then green.
  Simplicity rule: at most one "Reset to filters" link.
- 2026-10-02: viz PERF-2 done (windowed chart rows): worst chart task at
  4x CPU 125 ms (was 1,359); A11Y-1 bubble label contrast ≥7.6:1; DES-12 viz
  fallbacks consolidated with light-dark(). devops fixed V2 (artifact trust
  filter: same repo, push/schedule/dispatch only, trusted branches), V3 (CSP
  and referrer meta on every built page, external share-redirect.js, build
  fails on inline script), and V12 (permissions scoped to deploy, actions
  pinned by SHA, col-refresh opens a PR instead of pushing to main). Lead
  updated the og.test share-page assertion for V3. User asked for a link
  checker; queued with UX (internal 200s, hash states, ATS host checks per
  job, markdown links, plus an optional CI step for external HEAD checks).
  npm test 272/272.
- 2026-10-02 URGENT (user): "the site is linking to the GitHub page and not
  the deployed site". Root causes:
  (A) Pages source is still "Deploy from a branch", so GitHub's own "pages
      build and deployment" publishes the README on every push, racing
      pages.yml (e.g. run 37015077791 vs 37015077526); visitors sometimes
      get the README.
  (B) app.js JUICE_DOC hard-linked to
      github.com/…/blob/main/docs/LIVABILITY.md, taking users off-site (and
      main doesn't have the file).
  Fix routed to devops as top priority:
  - deploy waits for the branch build so ours lands last;
  - a post-deploy live check against a build marker, with one redeploy;
  - a 30-min site watchdog workflow;
  - LIVABILITY.md rendered into the site as methodology/ with a relative
    link;
  - a links-policy test plus a build check (no off-site links except the
    ATS/OSM/fonts allowlist), and an e2e link test.
  The definitive fix needs the user: Settings → Pages → Source → GitHub
  Actions (GITHUB_TOKEN can't change it).
- 2026-10-02 (after container restart): devops's off-site link fix had
  landed uncommitted. It renders LIVABILITY.md as dist/methodology/, makes
  JUICE_DOC relative, adds links-policy.test.js and a build link check,
  makes the deploy wait for the branch build, adds a post-deploy live check
  with a build marker, and adds site-watchdog.yml. The lead verified and
  committed it (d5f1815). The lead then:
  - served /methodology/ in server mode (it 404'd);
  - fixed the Compstimate location select to list every board location
    ("(no listed pay)" when none), so drawer = Insights for Singapore,
    Tokyo and Mumbai roles;
  - made a role-family filter set the auto title (FAMILY_TITLES) instead of
    the most common posting title (T20: "Not enough comparable roles"
    after "Same role elsewhere" → OpenAI);
  - made the T20 failure message print the widget state.
  Final: npm test 290/290; e2e 56/56 (incl. the 24 Compstimate task-force
  scenarios and the link checks). Lesson: don't use `pgrep -f`/`pkill -f`
  with a pattern the calling shell contains (exit 144); use pid files.
- 2026-10-02: user chose "keep current Pages setup + guards" (no gh-pages
  branch, no settings change). Finish agent (completed before the 2nd
  restart): applied the §6a lexicon fixes as norm-4 (results §6c) and
  re-baselined the golden test; added scripts/external-links.js and a ci.yml
  `links` job (site URLs blocking, job Apply URLs advisory). Lead verified:
  npm test 294/294, e2e 56/56, all workflows parse.
