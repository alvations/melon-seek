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
- 2026-10-03: user: "run a proper QA test on all the functionality on the
  desktop site and also the mobile and fix all the issues; check the timing
  and resource use on mobile and optimize". Launched three agents in
  parallel:
  - desktop QA (prompts/qa-desktop.md): every feature in static and server
    mode, bugs D-n;
  - mobile QA (prompts/qa-mobile.md): every feature with touch emulation at 4
    sizes, bugs M-n;
  - mobile perf engineer (prompts/perf-mobile.md): timing, heap, requests,
    idle CPU and leaks; optimize the Anduril load long task (it owns
    api.js and build-static.js).
  The QA agents don't edit product code; the lead routes fixes by file owner
  afterwards to avoid collisions.

### Full QA pass, desktop and mobile, plus mobile perf (2026-10-03)
- Request: "Run a proper QA test on all the functionality on the desktop site and also the mobile and fix all the issues. Check the timing and resource use on the mobile."
- Agents, run in parallel:
  - desktop QA: [qa-desktop.md](qa-desktop.md), D-1..D-16;
  - mobile QA: [qa-mobile.md](qa-mobile.md), M-1..M-18;
  - mobile perf: [perf-mobile.md](perf-mobile.md);
  - frontend fixer: [fix-frontend.md](fix-frontend.md).
- Lead fixed M-5 and M-6 (methodology page, `scripts/md.js`, `scripts/methodology.js`, `test/md.test.js`).
- M-2 and D-1 were routed to perf, which owns `build-static.js`. The perf agent's two patches in `patches/` were applied by the lead.
- The fixer hit the account session limit during the desktop batch. Its code was complete, so the lead verified it, wrote the batch section of fix-frontend.md, and committed.
- Final: `npm test` 303/303, `node scripts/e2e.js` 86/86.
- Open user decisions:
  - live-first loading of huge boards (Anduril live is about 16 s to first chart on Fast 4G);
  - self-hosting the Inter font.

### User decisions: "fetch both at once" and "self-host the Inter font" (2026-10-03)
- **Parallel live + bundled fetch.**
  - `public/api.js` `staticJobs`: for built-in boards (not on refresh), the live board and `api/jobs/<slug>.json` are fetched together. Whichever arrives first is shown.
  - When the bundle wins, the live result is vetted and juiced the same way, then handed to `getJobs(…, { onUpdate })`.
  - `public/app.js`: `loadJobs` → `applyJobs(res, seq, { upgrade: true })` swaps the live jobs in with the same filters and view. The swap is skipped if the user switched company, or live is already showing.
  - A live failure after the bundle leaves the snapshot in place, with no error banner, since the user already has data. Refresh keeps the old order: live first, bundle only as fallback.
  - Tests in `test/static-build.test.js`:
    - bundle first, then live via onUpdate, with history and meta merged;
    - live first returns directly, with no onUpdate;
    - live fails after the bundle, with no onUpdate.
  - Browser check (static build, 390px, live board delayed 2.5 s): "Snapshot" badge at 0.36 s, then "Live", no console errors.
- **Self-hosted Inter.**
  - Files: `public/fonts/inter-latin-wght-normal.woff2` (48 KB, preloaded) and `inter-latin-ext-wght-normal.woff2` (85 KB, loaded only when needed), from `npm pack @fontsource-variable/inter@5.3.0`, plus `Inter-LICENSE.txt` (OFL 1.1).
  - `@font-face` is in `public/styles.css`, so the methodology page shares it. `public/og/card.html` uses the local file, and `scripts/build-og.mjs` no longer routes Google Fonts.
  - Google Fonts was removed from the CSP (`style-src`, `font-src 'self'`) and from `scripts/links-policy.js` ALLOWED_HOSTS. Tests in `test/server.test.js` and `test/links-policy.test.js` now fail if it comes back.
- Final: `npm test` 304/304, `node scripts/e2e.js` 86/86.

### User request: no unexplained abbreviations ("RS/RE"), 2026-10-03
- **Source.** "RE / RS" is OpenAI's own posted title ("RE / RS - Foundations, Search", "RE/RS, Data Understanding (MM)"), copied as posted. A scan of every visible string in both modes also found the site's own unexplained codes:
  - "Remote (CA)", which could mean Canada or California;
  - bare country codes in the Insights location tags ("GB", "KR", "IE");
  - map labels "Singapore, SG", "Tokyo, JP", "Sydney, NSW".
- **Display titles.** `public/features/roles.js` `readableTitle()` writes out role abbreviations:
  - RE/RS, SWE, SW Eng., MLE, TPM, MTS, GTM, FDE, BD, Sr./Jr.;
  - and drops a parenthesis that repeats earlier initials ("Forward Deployed Engineer (FDE)").

  Domain terms that belong to the company (EW, GNC, SOX, RL…) stay as posted. `app.js` `prepare()` keeps `_postedTitle`; search matches both forms, and the drawer shows "Posted as …" when the title differs. Tests: `test/readable-title.test.js`.
- **Locations.**
  - `server/geo.js` `canonicalName`: "Remote (Canada)" / "Remote (Australia)". US stays "US" and GB stays "UK". `NORMALIZER_VERSION` is now norm-5, so snapshots are relocated on load, and the golden hashes were re-baselined.
  - `viz/map.js` uses the canonical name outside the US ("Tokyo, Japan").
  - `features/insights.js` shows country names via `Intl.DisplayNames`.
- **Results.** `npm test` 306/306 and `node scripts/e2e.js` 86/86. The desktop QA search test now compares against the displayed titles. A browser re-scan of server and static modes found no RE/RS, SWE, TPM, GTM, MLE or FDE, and no bare country codes.

### Big-tech boards on /beta/ and Juice household + tax verification (2026-10-10)
- **Requests.**
  1. "Take a look at the big tech companies, Google, Microsoft, Meta, Apple, Netflix, Amazon, Nvidia, Tesla … pull the job posts … put them under https://alvations.github.io/melon-seek/beta", not on the main page.
  2. Juice: rent "seems kind of fix and a bit on the low side". Add 2-bedroom and 3-bedroom city-centre options for a small family, "make sure the taxes paid are correctly pulled", and "Don't just assume, verify with some data".
- **Lead checks before launching.**
  - The sandbox reaches no careers site; curl returns 000 for amazon.jobs, Netflix/Microsoft Eightfold, Nvidia Workday, jobs.apple.com, metacareers, Google, Tesla and even Greenhouse. Real data therefore comes from GitHub Actions runs, read through job logs (artifact download is blocked).
  - pages.yml deploys `dist/` on every push to this branch. So /beta/ is `dist/beta/`, a second copy of the app inside the same Pages deployment. Beta work must never change stable output or block the stable deploy.
- **Contract:** docs/CONTRACT.md "v3 additions". Beta entries carry `channel: 'beta'` and `live: false`. `listCompanies()` stays stable-only by default; `snapshot.js --channel beta`; and the stable vetting gate stays hard.
- **Agents.** Each one's prompt is saved verbatim in prompts/.
  - Data engineer, [bigtech-data.md](bigtech-data.md). Owns: adapters, the registry, snapshot.js and a probe workflow. May push its own files only.
  - Deploy engineer, [beta-deploy.md](beta-deploy.md). Owns: build-static.js, the workflows, api.js, server/index.js, the links policy and the Beta pill. Does not push.
  - Juice household, [juice-household.md](juice-household.md). Owns: cities.json, and the rent, living and household parts of juice.js plus their UI. Its job is to verify rents against official data, without adding new Numbeo inputs (§4.1). Does not push product code.
  - Juice tax, [juice-tax.md](juice-tax.md). Owns: the tax section of juice.js and golden vectors from official schedules, starting with the user's SF $675K case. Adds a household filing status where it can be verified. Does not push product code.

### Data freshness: monthly refresh of every number (2026-10-10)
- **Request:** "make sure that all the numbers we're citing and comparing the juice, the compensation, the levels etc. there's a way to pull in new data to update all of them … monthly … be VERY VERY thorough … list down all the numbers and comparison and places … auto-updating of EACH of those numbers. Launch any amount of sub-agents."
- **Agent:** freshness lead, [freshness-lead.md](freshness-lead.md); its prompt is in prompts/. It may launch its own sub-agents: inventory auditors, updater builders per data family, and a reviewer. If it can't, it asks the lead to launch them.
- **Deliverables:**
  - `data/freshness.json` (registry) and `docs/DATA_FRESHNESS.md` (inventory and runbook);
  - `scripts/refresh/**` with `monthly-refresh.yml`, which reviews changes through a bot branch and PR or issue, never by pushing directly;
  - `test/freshness.test.js` as a staleness gate (warn-only on deploy);
  - a finding on whether scheduled workflows fire from the default branch.
- **Coordination.** It reads, but doesn't edit, the files of the 4 running agents (big-tech data, beta deploy, Juice household, Juice tax). Changes it needs in their files go to `docs/process/patches/freshness-*.diff`, which the lead applies after those agents finish.

### Historical archive: never lose data, annual reviews (2026-10-10)
- **Request:** "ALSO include all the company and job related numbers esp. when we compare them across the levels … make sure we dont lose ANY of the old data … historical data analysis … annual review … per job / per company and also the non-job / non-company numbers … backend database … automatically updated and kept in the repo!"
- **Lead findings.**
  - `origin/HEAD` is claude/stoic-ride-54ddxp, the only remote branch, so schedules and `workflow_run` fire from it.
  - Raw snapshots exist only as artifacts with 14-day retention, and the ledger as a 90-day artifact. The first real data (about 2026-10-02) expires around 2026-10-16, so the rescue backfill is priority 1.
- **Freshness lead:** scope extended by message. Its inventory now also covers per-job pay, per-company stats, market cells across levels, Compstimate levels and backtest, Juice per job, ledger fields and share-page counts. Its monthly refresh records each reference version through the archive CLI.
- **New agent: archive engineer,** [archive.md](archive.md); its prompt is in prompts/.
  - It owns an orphan data branch, append-only plain-text partitions and a manifest. The data branch keeps bot commits from racing pushes on the deploy branch and keeps code history small.
  - Job versions are slowly-changing rows. It keeps daily company aggregates and monthly cross-company × level cells, plus dated reference-data versions and vetting audit records.
  - Pipeline:
    - `archive-backfill.yml` rescues the existing artifacts;
    - `archive.yml` ingests on `workflow_run`;
    - `scripts/archive/verify.js` checks integrity;
    - `scripts/archive/report.js` writes the monthly and annual reviews.

### Pages: the README must never be served again (2026-10-10)
- **User:** "Why is the https://alvations.github.io/melon-seek/ going to the github readme again?! Check the branches properly!" / "Never let that happen again!"
- **Finding.**
  - The repo has one branch, `claude/stoic-ride-54ddxp`, which is the default. Settings → Pages → Source is still "Deploy from a branch" (root).
  - So every push runs GitHub's "pages build and deployment", which published README.md, alongside our pages.yml.
  - pages.yml waited for that build and deployed the app last. That only shortened the window: from the branch deploy (about 40 s after a push) until the app deploy (about 1–2 min) the README was live.
  - Today's frequent probe pushes by agents made the window recur. CI's live-site link check at 07:59:32 caught it: methodology, OG and share pages were 404.
- **Fix, no settings change.**
  - A repo-root `index.html` + `404.html` holding page ("melon·seek is updating", meta refresh 10 s, noindex, no scripts or links). GitHub's branch build can now only publish that page, never the README. Deep links also reload until the app lands.
  - `check-site.sh` reports it as `result=holding`, so the existing post-deploy re-deploy path handles it.
  - Guarded by `test/pages-holding.test.js`.
  - CI's live-site link step is now advisory, because it races the deploy. The hard gate is pages.yml's post-deploy check.
- **Process.** All agents were told to stop pushing; the lead batches pushes, so there are fewer branch builds.
- **Permanent fix:** set Source to "GitHub Actions". Branch builds then stop entirely. It needs a repo admin, so it was offered to the user.

### Batch push: archive rescue + beta site + retention (2026-10-10)
- **User:** "what retention limits?! Keep them Forever and put them into the repo!"
  - Workflow artifacts can't be kept forever: 90 days is GitHub's maximum for a public repo. Every artifact is now set to 90 as a safety net.
  - The permanent store is the orphan `data-archive` branch in this repo (archive agent, docs/DATA_ARCHIVE.md). `archive-backfill.yml` rescues every artifact that still exists; the first expires 2026-10-16T12:48Z. `archive.yml` ingests after every snapshot and deploy run.
- **Archive commits:** d894b23 and bef4cd0, the archive agent's own files. The lead renamed its write jobs from `persist-ledger`, a name chosen only to pass the security test, to `archive-ingest`, and listed them explicitly in test/workflows.test.js. The test also checks that branch.sh refuses code and deploy branches and never force-pushes.
- **Beta site,** from the deploy engineer, revision 2:
  - `dist/beta/` is built from the restored `job-board-snapshots-beta` artifact; pages.yml never crawls.
  - snapshot.yml crawls the big-tech boards every 6 h, one matrix job per company. It gates each one, merges them into the previous artifact (a failed company keeps its last file), then dispatches a deploy. Dispatched deploys make no branch build, so the holding page never shows.
  - Also in this batch: api.js `live:false`, the Beta pill CSS hunk only (the `.juice-controls` hunk waits for the Juice batch), the server's `MELON_CHANNEL`, links-policy hosts, and beta-build tests.
- **Verified** on a clean worktree from HEAD plus exactly these files: `npm test` 381/381, build OK with real snapshots (stable unchanged; beta 0/7 until the first crawl), e2e 86/86, and all workflow YAML parses.

### Juice batch: household choice, verified rents and verified tax (2026-10-10)
- **Agents:** juice-household ([juice-household.md](juice-household.md)) and juice-tax ([juice-tax.md](juice-tax.md)). Both are finished.
- **Household.** Just me, Couple and Family (1, 2 and 3 bedrooms, city centre). Living costs use the UK DWP after-housing-costs equivalence scale (×1, ×1.72, ×2.41), checked against BLS CE 2024 and MIT Living Wage.
  - 2- and 3-bedroom rents come from official bedroom ratios: HUD FY2026, ONS, RTB, Stadt Zürich, OLAP, StatCan and HDB.
  - Sydney uses official NSW bond data for all three sizes. No new Numbeo inputs were added.
- **Rent audit.** SF's 1-bedroom rent ($3,679 a month) is 22% above HUD's central-ZIP small-area rent but 16% below listings (Zumper). It was kept and flagged for the Numbeo decision.
- **Tax.** Every rule was checked against official schedules, with 390 golden vectors. Fixes include:
  - California: it used the 2024 brackets labelled 2025;
  - New York State recapture;
  - Washington and Massachusetts paid-leave premiums;
  - Zurich's statutory tariff;
  - France's AGIRC-ARRCO second tranche;
  - Spain split into the state scale plus regional scales.
- **Household tax rules** where they can be verified: US joint filing, the Child Tax Credit, German splitting, the French family quotient and others. Elsewhere the drawer says "Taxed as a single filer here".
- **SF $675K:** Just me $314,748 left (98); Couple $339,270 (99); Family $311,902 (98).
- **Process fix (lead).** ed7d127 committed newer working-tree copies of archive.yml and archive-backfill.yml, edited by the archive agent between the lead's test and `git add`. CI went red: test/archive-workflows.test.js in HEAD expects the tested versions.
  - The pushed archive.yml run 38038140781 failed before any write (no migrate.js), so no data was written.
  - This batch restores the tested versions of both workflows.
  - From now on the lead commits INSIDE the tested worktree, pushes from it, then runs `git reset <sha>` (mixed) in the shared checkout, which leaves the working tree untouched. A file can no longer change between test and commit.
- **Verified** on a clean worktree from HEAD plus exactly these files: `npm test` 397/397 and build OK.
  - e2e 85/86. The one failure, Compstimate T21 "cold server accuracy within 10 s", also fails on the pre-batch baseline worktree at load average 8 (about ten agents running), so it's a timing failure, not a regression. It passed 86/86 at 08:20.

### Freshness batch: every number gets a monthly update path (2026-10-10)
- **Agents:** the freshness lead ([freshness-lead.md](freshness-lead.md)) and six helpers: audit-core, audit-surface, tax, col, jobs, derived. Each helper's prompt and log is in this folder. freshness-review runs next.
- **What landed:**
  - `data/freshness.json`: 131 registry entries, every number with its consumers, source, as-of date, cadence, updater and validator. `docs/DATA_FRESHNESS.md` holds the inventory and runbook.
  - `scripts/refresh/**`: run.js, the orchestrator, plus fx, bigmac, rents, living, tax, tax-watch, jobs, policy, derived and examples.
  - `monthly-refresh.yml`: reviewed through the bot/monthly-refresh branch and a single `data-freshness` issue; it never pushes main or the deploy branch. col-refresh.yml becomes a manual shim.
  - Staleness steps in CI and pages, warn-only.
  - `/api/freshness.json`.
- **Patches applied, in order:** ci-staleness, pages-staleness, derived-api-freshness, audit-core-backtest-fallback, lead-retention-docs, derived-readme-builtins, audit-surface-demo-mock-fx, audit-surface-chart-fx-footnote, derived-test-pins, col-zurich-licence, tax-export, jobs-seniority-default. Then `registry.js --sync-tax --lines --write` and `--docs --write`.
  - One registry reference, `docs/DATA_SOURCES.md:216`, points into the big-tech engineer's unpushed §7, so it was made line-less for now.
- **Patches held:**
  - bg-euro: waits for the big-tech engineer.
  - derived-ui-asof, jobs-backtest-asof, col-ui-rent-ids: wait for the badge agent, because they touch app.js.
  - The LIVABILITY patches (col-livability-refreshing, derived-docs-counts, the markers): wait for md.js comment support from the methodology engineer.
- **Offline dry run (fixtures):** 131 checks. 104 ok, 1 changed (FX: 22 rates moved to ECB 2026-09 monthly averages), 6 drift, 2 stale, 2 flag, 16 skipped.
  - The drifts: HUD FY2027 rents (needs a `HUD_API_TOKEN` secret); next-year tax figures for Canada EI, Ireland's Budget 2027 and Portland SHS.
- **Verified** on a clean worktree from c0df589 plus exactly these files and patches: `npm test` 531/531, build OK, `dist/api/freshness.json` present. e2e 85/86; the failure is the same T21 cold-server timing test, which also fails on the baseline under load.

### Batch: methodology guide + infographics, data badge fix, freshness retry fix (2026-10-10)
- **Methodology** (copywriter [methodology-copy.md](methodology-copy.md), UX [methodology-ux.md](methodology-ux.md)).
  - `methodology/` is the human guide, docs/METHODOLOGY_GUIDE.md: about 1,930 words, 13% of the reference. It has 8 build-time SVG/HTML figures from server/juice.js and data/cities.json: formula, waterfall, households, score curve, grades, tax split, sources, confidence.
  - `methodology/reference/` is docs/LIVABILITY.md, unchanged, with every old anchor kept or aliased.
  - links-policy fails the build if any reference heading id is missing from methodology/.
  - md.js drops whole-line HTML comments.
- **LIVABILITY** (lead):
  - applied freshness col-livability-refreshing, plus derived-docs-counts by hand (one row overlapped; "64 of 88", "266 figures");
  - inserted the freshness markers around the 4 generated tables;
  - grade thresholds are rounding-aware ($94,996 / $47,103), the same rule as the figures (examples.js and policy.js `netForShownScore`).
- **Badge** ([badge-ux.md](badge-ux.md)).
  - Cause: since 2666ae1 the snapshot shows first and live swaps in later, but the Live dot pulsed forever (from 93ec6dc), so a settled page looked like it was loading.
  - Fixes:
    - the Live dot is steady, with a pulse only while loading or "checking live…";
    - `pending` plus exactly one `onUpdate`, including on failure;
    - the swap keeps focus, scroll and open panels;
    - one polite announcement;
    - reduced motion is respected.
- **Freshness:** run.js retries an online 'error' once; the tax "LLM second opinion" test is deterministic.
- **Archive docs:** 928c17c, measured sizes after the rescue.
- **Verified** on a clean worktree from 8c20896 plus exactly these files: `npm test` 579/579, build OK, e2e 103/104 (1 opt-in skip, 0 failed).

### Freshness final batch: review findings fixed (2026-10-10)
- The freshness-review agent filed 20 findings (1 high, 7 medium, 12 low); [freshness-review.md](freshness-review.md).
- The freshness lead fixed the high and all mediums, plus most lows:
  - rents.js re-derives the 2- and 3-bedroom rents and USD fields on every run, with `--reconcile` as the offline command;
  - update-col.js keeps FX unless `--fx-from-bigmac` is passed;
  - the staleness gate shows real state (lastChecked reset to live-confirmed only; 2-year-old tax rules count as stale);
  - the monthly-refresh write token is isolated in a publish job (persist-credentials false, trusted-branch check, PR only when reference data changed);
  - TAX_HOUSEHOLD and the archive copies are registered;
  - every ad-hoc entry has a yearly review date;
  - fx.js rewrites the FX_SOURCE label;
  - jobs.js checks big-tech multi-level ranges.
- Held patches applied: derived-ui-asof (as-of dates in the drawer, comps, Compare, Compstimate, Insights and the map legend), jobs-backtest-asof and col-ui-rent-ids. Dropped: bg-euro (already in 3361c90) and tax-export (TAX_PARAMS already exists).
- Lead: README beta list is now the 5 crawled companies; Amazon and Meta are paused for their terms.
- Verified on a clean worktree from 3361c90 plus exactly these files and patches: npm test 584/584 (7 skipped), build OK, YAML OK, e2e 103/104 (1 opt-in skip).
- Registry: 133 entries.

### The improvement cycle, written down (2026-10-10)
- Request (verbatim): "After the beta page with big tech jobs is ready, make sure we run the optimization on the beta page with the big tech jobs afterwards like how we did it for the original site, go through the same flow and make sure we remember those flows / steps so that we can replicate and continue to improve them while we do the same for the beta page."
- [PLAYBOOK.md](PLAYBOOK.md) is the flow used on the main site on 2026-10-03 and 2026-10-10, stage by stage:
  0. data readiness;
  1. find problems: desktop QA, mobile QA, mobile perf, data check, persona review;
  2. fix lanes;
  3. integrate and ship;
  4. record and repeat.

  Stage 3 lists the lessons from 2026-10-10: the README on the live site, the untested workflow push, and the snapshot symlink.
- Prompt templates in [prompts/cycle/](prompts/cycle/), parameterized by target (`stable` or `beta`), with every placeholder documented.
- Helpers:
  - `scripts/cycle/local-data.js` rebuilds each company's latest snapshot from data-archive (the sandbox can't reach the boards);
  - `serve.mjs` serves dist under /melon-seek/ with a pid file;
  - `sync-shared.sh` is the 3-way checkout sync that used to be typed by hand.
- `.claude/skills/improvement-cycle/` is the short version, so a future session finds it.
- `test/cycle.test.js` checks the links and placeholders, local-data's observation choice, serve.mjs, and sync-shared.sh in a scratch repo.
- `data/beta/` is now gitignored.
- Next: run the cycle on beta once the first beta crawl (run 38044091555) is archived.

### Persona review of the main site, 5 age groups × 5 levels (2026-10-10)
- Request (verbatim): "emulate 5 different levels of 5 diff age groups of human job seeker looking at the site to look for jobs and review to see what we can improve, what is good, what is totally broken and should be fixed ASAP".
- Five agents, one per age group (18–24, 25–34, 35–44, 45–54, 55 and over), each playing a student, early-career, mid-career, senior and executive seeker in at least 3 countries. 2 or 3 per group used a phone, one a 125% zoom. They used [the persona-review template](prompts/cycle/persona-review.md) on today's real data from the archive.
- Outcome, tallied from the 5 reports: of 25 people, 6 reached their goal (2 of them only on paper, with a pay figure they could not trust), 9 partly and 10 not. Most of the misses are roles that list no pay outside the US, or no matching role at all.
- Broken items found by several groups (consolidated as P-1 to P-18 in the fix-lane prompts):
  - Anthropic sales on-target earnings (base plus commission) are shown and compared as base pay. All 5 groups found it.
  - Compstimate names a city or level that none of its comparables have (US pay labelled "Sydney" or "London"; an intern estimate built from full-time roles), and prints "within ±8%" next to "low confidence". All 5 groups.
  - "Mid" is shown as fact for every title that names no level (48%). 4 groups.
  - Search for "intern" matches International/Internal; the salary box drops "£80,000", "80k" and "A$350k"; Juice and "Most juice" use the posting's best city, not the filtered one.
  - The map's "San Francisco + 3 nearby" contains New York and DC; US pay is pinned on Sydney.
  - Victoria, BC is filed under Australia; Compare companies mixes internships with full-time pay; "Same role elsewhere" compares the wrong families and falls back to all levels.
  - Rent dates contradict each other; "(update due)" is on every footnote.
- Improvements every group asked for: keep the search and filters when switching company; plain words instead of jargon; saved searches that are easy to find, with a return visit opening where you left off; a one-line explanation on arrival.
- Good, keep: speed (first cards in about 1 s), the Juice breakdown with households, honest pay labels, "Same role elsewhere" when it matches, Apply and Copy link, the methodology page.
- Decision (lead): the stored level stays 'Mid' (no data or archive change), and every surface shows it as "Level not stated" (`levelLabel` in public/features/roles.js). Three groups called the label broken, so the open question to the user is answered this way. A pay range applies to the locations in its currency's countries (`payLocations` in public/features/shared.js). Both helpers landed before the fix lanes started.

### Persona fix wave, batch 1: estimates, app shell, charts and map (2026-10-10)
- Four fix lanes ran in their own worktrees from a9a46a7 ([PLAYBOOK](PLAYBOOK.md) Stage 2); this batch lands three of them. The pay-data lane (server) is still running and lands next.
  - **fix-viz** (2a152f2):
    - map groups say "nearby" only within 150 km;
    - pay on a pin only where it applies (Anduril's Sydney pin no longer shows $61K from US contractor pay);
    - "Level not stated" goes last;
    - one empty-chart message;
    - as-of dates without "(update due)";
    - both rent dates;
    - grade fills instead of three reds;
    - text of at least 12 px.
  - **fix-estimates** (c1dd915):
    - the pay estimate never uses another country's pay and says what it is based on;
    - interns only from interns;
    - no "±%" at low confidence;
    - the drawer and Insights give the same answer;
    - on-target earnings never pooled with base pay;
    - fixed family rules (19 of 4,824 postings move, all intended);
    - Compare companies follows the open job and has a Level choice;
    - Insights hides samples under 5.
  - **fix-app** (738b667 tests, 39967bb fixes):
    - pay labels for on-target and fixed-term pay;
    - whole-word search and "Best match";
    - the salary box reads £, k, A$ and AUD;
    - Juice for the filtered place, rounded so the rows add up;
    - "Level not stated" on cards and filters;
    - filters kept on company switch;
    - one line saying what the site is;
    - plain words, with no ATS headings or slugs;
    - saved searches reopen the last view;
    - phone quickbar and 125% zoom fixes.
- Integration, all by the lead:
  - two conflicting `scripts/e2e.js` registrations, both kept;
  - five cross-lane patches: juice.js rent base date, examples.js with the LIVABILITY block, the D-9 level order, the badge fills in styles.css, and the estimates lane's app.js wiring.
  - The estimates lane's app.js patch was written against a9a46a7, so it was applied to that version and 3-way merged with the app lane's app.js. Three conflicts (imports, compstimateBlock and the comps note) were all resolved to the estimates side; the app lane had marked its own text there as a stand-in.
  - Registry lines re-resolved.
  - The beta data check's 26 red tests were committed as to-dos (each turns green when its fix lands; CI stays green meanwhile).
  - Its DATA_SOURCES §7 counts were checked against the snapshots: Apple 6,105 postings with 3,848 paid, NVIDIA 2,664 with 1,394. Both match.
- Verified on the integrated tree (91fb7ae plus the lanes): npm test 654/654 (7 skipped); build OK (stable 8 companies, beta 5/5); full e2e 143/147. The 1 failure was the Anduril JPY test, already fixed in 125bf64, and the 3 skips are by design.
- Lesson: a lane's patch to a file another lane rewrote applies by 3-way merge against the patch's own base (`git show <base>:file`, patch, `git merge-file`), not by `git apply`.

### Persona fix wave, batch 2: pay data (2026-10-10)
- **fix-pay-data** (36b5300, 2be6d3e):
  - on-target earnings are `salary.kind: 'ote'` (Anthropic 46 postings, Cohere 1);
  - fixed-term pay carries `salary.termWeeks` (stable 28, beta 46; CONTRACT v4);
  - level rules: 47 Account/Partner Directors are no longer Director+, and a bare "Fellow" is a fixed-term fellowship;
  - Victoria, BC and Alexandria, NSW resolve correctly;
  - keyword-tag precision is up: Mechanical design 25% → 80%, Embedded 69% → 93%;
  - and, added mid-lane from the beta data check, DQ-1: Eightfold country codes are no longer read as US states. NVIDIA's postings in the US went from 2,123 to 1,403 (Israel 0 → 420, India 0 → 239), and Microsoft's from 1,518 to 1,188.
  - Locations that fell back to a region or country centroid went from 4,054 postings to 799.
  - NORMALIZER_VERSION is norm-6: stored snapshots are re-derived at build time until the next crawl writes norm-6. The local build took 154 s instead of about 80 s, and a cold server spends about 15 s on Anduril.
- Integration:
  - its term-label patch was 3-way merged into app.js and chart.js against its base a9a46a7, with no conflicts;
  - the llm-vet 'ote' patch applied cleanly;
  - the 4 DQ-1 to-do tests are now plain tests and pass;
  - the registry lines were re-resolved.
- An open question, answered conservatively: 46 more paid postings in Anthropic's Sales department (Customer Success, Partnerships) are not marked on-target. The "for sales roles" sentence applies only to sales titles, and Anthropic puts it on 565 postings.
- CI: be5691c (beta desktop QA docs) turned CI red for about 25 minutes. docs/QA.md quoted a hand-written accuracy figure, which scripts/refresh/jobs.js reports as drift, and I had run only the markdown tests. af368e9 fixed it; the lesson is in PLAYBOOK known traps: run the whole npm test before every push.
- Verified on the integrated tree (af368e9 plus the lane): npm test 676 passed with 1 failure, the refresh-jobs drift fixed by af368e9 before the final run. Build OK, beta 5/5. Full e2e 156/170: all 11 failures are the beta desktop [D-n] bug tests awaiting the beta fix wave, and D-17, D-19 and D-25 now pass.

### Beta, stage 1: data check, desktop QA and mobile QA (2026-10-10)
- Request (verbatim): "After the beta page with big tech jobs is ready, make sure we run the optimization on the beta page with the big tech jobs afterwards like how we did it for the original site, go through the same flow".
- Stage 0. The first full big-tech crawl (snapshot.yml run 38044091555) gave Apple 6,105 postings, Google 3,417, NVIDIA 2,664, Microsoft 2,320 and Netflix 456. It was archived at 12:21 UTC and rebuilt locally with `scripts/cycle/local-data.js`. The build gate passed with beta 5/5.
- Staggered for the 4-CPU sandbox: the data check, desktop QA and mobile QA ran alongside the persona fix lanes. Mobile perf and the persona review wait for the fixed build ([PLAYBOOK](PLAYBOOK.md) known traps).
- **Data check** ([data-check-beta.md](data-check-beta.md)): 17 findings with 26 tests, committed as to-dos.
  - DQ-1, Eightfold country codes read as US states: 735 NVIDIA and 365 Microsoft postings in the wrong country. Fixed in batch 2 by the pay-data lane.
  - Verdicts: NVIDIA and Microsoft "not ready" until DQ-1; Apple, Google and Netflix usable with caveats.
  - Juice was checked by hand on 20 cases in 7 countries, all matching to the dollar.
- **Desktop QA** (docs/QA.md, D-17 to D-30): 1 High (= DQ-1), 6 Medium and 7 Low. Every live: false board made no live request, and Apple filters and sorts in 0.2–0.35 s.
- **Mobile QA** (docs/QA.md, M-19 to M-27): 3 Medium, including M-20, a list of 30,585 DOM nodes after 2,000 cards, and M-27, batch 1's phone logo squeezing the company name; plus 6 Low. 14 of the 18 earlier mobile bugs were confirmed fixed.
- Lead decisions:
  - DQ-13: a Microsoft posting that is only in the SF Bay Area or NYC uses that area's range.
  - D-27/D-28: within CONTRACT v3's "small Beta tag" rule, the tag becomes the link back to the main site, and the title says beta.
  - Stated mid levels (Google "III", Netflix "L4") show as "Mid" through `displayLevel(job)` and `job.seniorityBasis`, while the default stays "Level not stated".

### Beta fix wave, batch 1: sources, pay and levels, app shell (2026-10-10)
- Four lanes ran in worktrees from 8c598c2. Three land here; the platform lane (server mode, demo data, chart and map) was cut off by a container restart, resumed from a WIP commit, and lands next.
  - **fix-beta-sources** (ab36a75):
    - Apple has one posting per requisition (6,105 → 4,882, and no city shows two ranges);
    - bad Location labels on the five boards went from 135 to 0;
    - store-name pins went from 118 to 0, and double-encoded links from 19 to 0;
    - `job.pool` marks 62 talent pools;
    - 52 hybrid NVIDIA postings are no longer remote;
    - Google brands become departments;
    - 195 more paid postings get Juice through nearby-city proxies.
  - **fix-beta-pay** (3ec8c7d):
    - company ladders, with `job.seniorityBasis`; Netflix's Mid < Senior < Staff+ order is restored;
    - bonus-target percentages, and the zł, kr and kr. currencies (Google gains 185 ranges);
    - `salary.levels` (866 NVIDIA, 160 Microsoft);
    - Canada-only "$" read as CAD;
    - one pay line per country;
    - false vetting flags down from 4,643 to 565. The vetting scan now shares salary.js's rules and flags the 189 missed Google ranges.
    - NORMALIZER_VERSION is norm-7.
    - Open: the Romanian lei have no exchange rate (15 postings), so the RON rate needs adding to the FX source.
  - **fix-beta-app** (08e39cc):
    - `displayLevel`;
    - pay by level in the drawer;
    - correct "N new" on boards of any size;
    - saved searches and the last view per site;
    - a plain "This board isn't on this site";
    - the Big tech menu group, with the current board in view;
    - no Refresh on snapshot boards;
    - the Beta tag links back, and the title says beta;
    - a windowed results list (about 3,500 DOM nodes instead of 30,585);
    - scroll to the top on a new result set;
    - keyboard and touch-target fixes;
    - fits at 360 px.
- Integration:
  - CONTRACT.md: both lanes appended a section, and both were kept.
  - Patches applied: the app lane's chart.js `displayLevel` grouping; build-static.js running the sources lane's `upgradeStoredJobs` and packing the pay lane's `seniorityBasis` (Google's list is 1.44 MB, under its budget); server/pipeline.js running the upgrade in server mode; the refresh jobs.js default-level share.
  - Registry lines were re-resolved.
- Verified on the integrated tree: npm test 735/735 with 2 to-dos (the platform lane's DQ-7); build OK (beta 5/5, Apple 4,882 postings, list 2.19 MB).
- Full e2e 188/195 passed, 3 skipped by design. Of the 4 failures, 3 are the platform lane's red tests (D-20, D-29, M-23). The 4th was the app lane's shared-decision-1 test: written before the pay lane's ladders, it assumed one stated-mid Netflix role, and 21 now state "L4". The test now injects onto a default role and expects exactly the stated set, which is stricter; the group passes 11/11.
- QA red tests that now pass: D-17 to D-19, D-21 to D-28 and D-30; M-19 to M-22 and M-24 to M-27; DQ-1 to DQ-6, DQ-8 to DQ-10, DQ-13 and DQ-15 to DQ-17.

### Beta fix wave, batch 2: loading, server, chart and map (2026-10-11)
- **fix-beta-platform** (e4a97ea, rebased by the lane itself onto 0d3bbde).
  - A container restart cut the first run off after it had edited 9 files without committing. The lead saved them as a WIP commit (f3db92c), and a new agent resumed from it, checked each change and finished the lane. The log says so at the top.
  - D-20: server mode reads the beta snapshots (`MELON_BETA_SNAPSHOT_DIR`, then `MELON_SNAPSHOT_DIR`) and never fetches a live: false board live. A beta board without a snapshot is "not available yet", never demo data.
  - DQ-7: a built-in company whose saved list fails to load is `unavailable` with a plain sentence and Retry, never demo postings. The build no longer ships `api/demo/<slug>.json` or demo description files (773 files per site). "Add board" keeps its labelled demo.
  - D-29: the Ranges tooltip names a currency once.
  - M-23: map pins and clusters say "4.5K", not "999+".
  - The chart groups by `displayLevel`.
  - test/links-policy.test.js uses its own empty inputs plus a one-posting fixture (about 5 s; it used to time out on local beta data). The same isolation was added to og, perf-mobile and static-build.
- Integration:
  - the lane's patches: app.js shows `unavailable` as "Couldn't load this board" with Retry; the README no longer mentions api/demo and describes the server's beta folder; the test-isolation patch;
  - registry lines re-resolved.
- One regression, found and fixed by the lead:
  - M-19 failed 1 in 3 even on a quiet machine. `toTop()` hid overflow for one frame to stop a fling, but Chromium's fling outlived it and the list landed about 271 px (two cards) down after a sort.
  - The top is now held for up to 600 ms and handed back at once on a touch or wheel. M-19 then passed 6 of 6, and the phone and app groups 54 of 55 (1 skipped by design).
- Verified on the integrated tree: npm test 748/748 with 0 to-dos (every beta data-check test is now a plain passing test); build OK (beta 5/5, no demo files); full e2e 191/195 before the M-19 fix (the 1 failure was M-19; 3 skipped by design).
- Beta fix wave totals:
  - all 30 of the beta QA bug tests pass: D-17 to D-30 and M-19 to M-27, one test for each of the 14 desktop and 9 mobile bugs, and a few cover two IDs;
  - all 26 data-check tests pass;
  - not fixed: DQ-4's remaining 370 postings in cities with no Juice record, Romanian lei pay (no RON rate), and hybrid work, which isn't modelled.

### Beta, stage 1b: mobile performance on a quiet machine (2026-10-11)
- Run alone, after the beta fix wave (0ce5280), on the 22:00 beta crawl. The load average was 0.9–2.0, which makes these timings the record. Median of 3 cold loads at 4x CPU on a 390x844 phone ([perf-mobile-beta.md](perf-mobile-beta.md)):
  - first card on Fast 4G: Apple 6.2 → 4.1 s, Google 5.4 → 3.9, NVIDIA 5.0 → 3.6, Microsoft 4.8 → 3.5, Netflix 3.8 → 2.6, Anduril 5.0 → 3.5;
  - on Slow 4G: Apple 10.7 → 8.8 s;
  - total blocking time is down about a third everywhere (Apple 2.9 → 1.8 s);
  - board switches are 0.7–1.8 s faster;
  - heap is unchanged at 18–25 MB, flat at 31 MB after 10 switches (no leak);
  - payload is unchanged.
- Changes (output proven identical: `getJobs` deep-equal on all 13 boards, and 24,880 of 24,903 built files byte-identical; the other 23 are the 21 lists, carrying `shared.vetted`, and the two config.js files):
  - the first job list is fetched from config.js at about 0.4 s instead of after the app's imports; `<link rel=preload>` was tried and dropped, because Chromium decoded the body twice more;
  - the browser skips the second vetting pass when the build proves it changes nothing;
  - role families are computed after the first paint, in idle slices;
  - one date formatter for all cards;
  - map Juice in one pass (Apple 469 → 84 ms);
  - its two feature patches, applied by the lead: an `expandTitle` memo (identical on all 24,680 jobs) and layout reads in phases. Insights' longest task went from 2.75 to 2.08 s on Apple.
- Not changed, with the reasons in the log:
  - list sections under budget (moving them is a product call: Netflix 310 → 32 kB gzip, but "About the role" would come later);
  - Insights' remaining 1.9 s task;
  - the first render's facet counting;
  - Slow 4G is bandwidth-bound (making map, comps and Compstimate load lazily would save about 40 kB);
  - a Juice memo in server/juice.js (3,852 cases, 773 distinct).
- Build time about 100 s, 55 s of it re-deriving the norm-6 beta snapshots. It is not cached: the next crawl writes norm-7, and the build drops to about 45 s.

### Beta, stage 1c: persona review on the fixed beta site, 5 age groups × 5 levels (2026-10-11)
- Five reviewers, one per age group, on build 83023f5: both beta fix batches plus the performance pass, with the 22:00 beta crawl as data.
  - At least 3 of each group's 5 people had a reason to use the big-tech boards. Cities included Dublin, Toronto, Zurich, Munich, Warsaw, Tel Aviv, Brussels, London, Austin, Chicago, Columbus, Seattle, San Jose and Los Angeles.
  - Each group also re-checked what the first review ([persona-stable-*.md](persona-stable-18-24.md)) called broken.
- Outcome: of 25 people, 9 reached their goal, 13 partly and 3 not (first review: 6, 9 and 10).
  - Nearly every first-review broken item is confirmed fixed: on-target earnings, foreign-pay estimates, "Level not stated", the "intern" search, the salary box, filtered-city Juice, map "nearby", Victoria BC, "N new", rent dates, and the drawer text bugs.
  - Speed was not an issue: the first card in 0.5–0.9 s on desktop and 2.5–3.5 s on a throttled phone, at load 1–3.
- Broken items several groups found (BP-n, for the next fix wave):
  - BP-1 (all 5): yearly-rate internship pay is labelled as whole-term pay ("€72,000 · for about 13 weeks"), 27 postings. `payTerms` sets termWeeks whatever the interval.
  - BP-2 (4): with a location filter, the chart, cards, pay filter, pay sort and Juice still use another country's pay ("0% show pay for Zurich", but US and Munich ranges are shown; Munich Juice from Polish pay).
  - BP-3 (3): "Same role elsewhere", Compare companies and the percentile mix countries (a Dublin role ranked against US pay; Google's entry software median of $89K is mostly Warsaw and Málaga).
  - BP-4 (3): role families: 193 NVIDIA chip-design roles as software; Netflix "Distributed Systems Engineer" as hardware; design managers; data-centre technicians.
  - BP-5 (2): the "CAD" skill tag on Canadian-dollar postings (109; Google "(CAD)" and Microsoft formats).
  - BP-6 (3): a Location search for a country or a local name ("Ireland", "Israel", "Germany", "München") hides its cities.
  - BP-7 (2): a stated mid level is told it "doesn't state a level" (554 postings).
  - BP-8 (3): NVIDIA and Microsoft department abbreviations ("Mgmt, Sys SW").
  - BP-9: part-time hourly pay is annualised as full-time (52 Apple postings).
  - BP-10: a company switch drops "Columbus, OH" because the boards key places differently, and a dropped filter is never restored.
  - BP-11: Art, Creative and Technical Director are filed as Director+ (26).
  - BP-12: British spellings ("data centre", "defence", "programme") return nothing.
  - BP-13: two medians on one screen ($347K vs $352K: the stats line leaves out on-target earnings, the chart doesn't).
  - BP-14: minimum and preferred qualifications are merged (Google 3,282 postings).
  - BP-15: Apple store names and "Dublinas" as places.
  - BP-16: two ages in one drawer.
  - BP-17: the Remote filter's "On-site" count equals "Any".
- Improvements every group asked for:
  - search across all companies, or say where the matches are;
  - Juice in the person's terms: the posting's currency, their own rent, a second earner, a single parent;
  - plain words for the remaining board jargon;
  - big-tech roles grouped by role family rather than raw departments;
  - /beta/ opening on big tech instead of Anthropic.
- Good, keep: filters kept across company switches with a toast; honest no-pay handling; the Juice breakdown; Save, the return visit and "N new"; the salary box; Compare companies' Level choice; plain labels; Apply.

### Fix wave 3: the beta persona findings BP-1 to BP-17 (2026-10-11)
- Four lanes in their own worktrees, one owner per file ([fix-lane.md](prompts/cycle/fix-lane.md)), started from 790fa13. Shared decisions the lead fixed first: pay covers only its own country (`payLocations`, `payCountry`); a stated mid level reads "Mid", the default reads "Level not stated"; `salary.originalInterval: 'year'` on a fixed-term role is a yearly rate; `salary.partTime`, `salary.hoursPerWeek`, `salary.country` and `sections.preferred` are the data lane's fields that the other lanes read.
- **fix3-data** ([log](fix3-data.md)), norm-8:
  - BP-1: a yearly-rate internship reads "€72,000 a year (13-week internship)", not whole-term pay; the Conceptual Reasoning Fellow keeps its posted $100,000–167,000 for the term.
  - BP-2 (Juice side): Juice is never worked out from another country's pay (`job.juiceMissing` says why); `salary.country` names the pay line's country.
  - BP-5: "CAD" is never a skill tag (109 postings). BP-8: department abbreviations spelled out. BP-9: part-time hourly pay is scored on the stated hours, or not at all. BP-11: Art, Creative and Technical Director are Senior, not Director+ (26). BP-14: required and preferred qualifications are kept apart (Google 3,282 postings). BP-15: Apple store names and "Dublinas" are not places. Keyword-tag noise cut (the P-17 method, with a labelled sample).
- **fix3-compare** ([log](fix3-compare.md)):
  - BP-3: "Same role elsewhere", Compare companies and the percentile compare within one country (market cells `byCountry`; beta market.json 79 kB). Google entry software in the US is $179K (n 4), not the "$89K" that pooled Warsaw and Málaga.
  - BP-4: new chip-design and data-center technician families; 1,668 beta postings (965 with pay) and 54 main-site postings changed family; 19 of a 20-posting spot check right.
  - BP-7: a stated mid level is "Mid"; a missing level is named in one line.
- **fix3-app** ([log](fix3-app.md)): BP-1 labels by the stated interval; BP-2 pay per place ("Pay posted for the US only"); BP-6 country and local-name Location search ("Ireland", "München"); BP-9 part-time display; BP-10 a place carried across a company switch and put back; BP-12 British and American spellings find the same roles; BP-13 "base pay median"; BP-14 Required and Nice to have; BP-16 one age per drawer; BP-17 On-site counts; /beta/ opens on Google. Its two patches (the early first-list fetch for the beta landing, Compstimate's On-site) were applied.
- **fix3-viz** ([log](fix3-viz.md)):
  - BP-2 (chart): under a Location filter the chart plots only pay for the filtered places and says how many it left out ("No pay posted for Zurich: 58 postings match; 10 list pay for another country only…").
  - BP-13: every chart median is base pay, the same as the stats line ($347K for both, was $352K vs $347K).
  - Map: only the filtered places get pins (Austin one pin of 646, Dublin 137, Columbus 15), every pin keeps its name where the basemap is missing, and "1.1K jobs" replaces "1.117 jobs". The map refits when the filtered places change.
  - Its app.js patch (`places`, `placeTest` and `S.l` in the viz signature) was applied by the lead.
- Integration (the lead): the three earlier lanes' commits and patches were 3-way merged (the compare lane's app.js patch against the app lane's rewritten pay block: the compare percentile wording plus the app lane's part-time, elsewhere and term captions); the batch was rebased onto eda6304; e2e registrations and CONTRACT.md sections kept from every lane; registry lines re-resolved.
- One bug found by the lead in the full run: two requests to one host could start at the same instant. `politeRequest` booked per-host slots but never checked the actual gap, so a timer firing late on a busy machine let the next caller go right after it (`gaps 27,40` at a 40 ms minimum; the new test/polite-spacing.test.js reproduces `gaps 82,0` with one late timer). `takeTurn` now also waits for `lastStart + gap`. In a real crawl that is two requests to a careers site well under the 1 s we promise.
- Also in this batch: the second data check of beta ([data-check-beta-2.md](data-check-beta-2.md)), run on the integrated tree with today's crawl. Of the first pass's 17 findings, 12 are fixed and 5 partly. New: DQ-27 (Apple: 13% of paid postings score Juice in a place Apple posted no pay for, such as Austin), DQ-28 (Apple: merged requisitions show the span, not the place's own range, 395 postings), DQ-29 (Google: one numeral ladder for every family, e.g. "Product Manager II" filed Entry), DQ-30 to DQ-32 (low). Its 11 tests are to-dos until the next fix wave. Verdicts: NVIDIA, Microsoft and Netflix trustworthy; Apple and Google usable with caveats.
- Also in this batch: the first salary vetting of the beta boards ([vetting-beta.md](vetting-beta.md), [summary](../../data/vetting/2026-10-11-beta/summary.md)), with the first vetting's method: 16,182 postings, 10,556 published salaries; every flagged job (578) and a seeded sample (150, seed 20261011) reviewed, 728 verdicts with evidence quotes checked against the full posting text. 701 correct, 19 parser bugs, 8 source problems; the sample was 150 of 150 correct. Every published number matches its posting; the problems are which range is shown, for which place, and on what basis: VT-1 a São Paulo job shows US pay; VT-3 two Netflix internship total-compensation bands shown as base pay; VT-4 Apple pay at places with no posted pay (the same as DQ-27); VT-5 `payLocations` ignores `salary.country` (35 postings show one euro country's pay at another's places); VT-6 an NVIDIA Italy line without `salary.country`. The gate's false positives: 1 of 701 (Netflix's real L7 range above $1.2M); its false negatives are plausible amounts on the wrong basis, which no threshold catches. The reviewed cases were added to the regression fixtures (527 of 527 pass). Decisions for the user: raise the $1.2M bound to $1.5M, NVIDIA's sales cash compensation as on-target earnings, a source for a Romanian lei rate, Microsoft's own level over the title. The vetting agent could not write its summary and log (the harness blocks report-style Markdown for subagents); the lead wrote both from its report, verbatim.
- Verified on the integrated tree (rebased onto eda6304): `npm test` as CI (no local data) 885 tests, 859 pass, 0 fail, 7 skipped, 19 to-dos (the second data check's 11 and the vetting's 8, until the next fix wave); build OK with today's crawl (beta 5/5); full e2e **226/230 passed, 0 failed, 4 skipped** (3 by design; fix3-viz's NVIDIA Munich test skips because today's data has one such role, not several). A run of `npm test` with the snapshot links still in place failed PERF-1 and V15 at load 4 (171 and 182 ms of event-loop lag); both passed 3 of 3 alone, and CI never runs them. The playbook now says to remove the links before the last `npm test`.

### Amazon and Meta on the beta big-tech list (2026-10-11)
- The user: "Why are the Meta and Amazon ones missing?! Launch a dedicated agents data and backend engineer to figure it out and get the data!!! We must have these in the big tech list!" Two agents: **amazon-meta-data** ([log](amazon-meta-data.md)) and **amazon-meta-backend** ([log](amazon-meta-backend.md)). Neither requested an Amazon or Meta job page while the decision was open.
- Why they were missing: only `paused: 'terms'` (3361c90, 2026-10-10), read through `listCompanies()` by every stage: crawl matrix, merge, gates, build, list, server, local data. The adapters worked (probe run 38035822525 crawled both whole boards on 2026-10-10). Two holes that would have crawled a paused company were closed: `snapshot.js amazon` and the probe with no companies named.
- The terms, read from the live pages on 2026-10-11 (`data/alt/terms-2026-10-11.json`): Amazon's Conditions of Use exclude "data mining, robots, or similar data gathering and extraction tools"; metacareers.com's robots.txt and Meta's Automated Data Collection Terms require express written permission. Apple's site terms have a similar clause.
- The lead put the quotes and four options to the user, recommending permission first. **The user chose "Resume both now", and "Keep as is" for Apple**, and later added: "there are many sites that already have them so it's not an issuer you're over thinking. We must be fair and provide all the big tech… don't change the request per second just finish the work." The decision is recorded in [AMAZON_META.md](../AMAZON_META.md) "Decision" and in `server/companies.js`.
- What changed: `paused` removed from both (the backend's resume switch); the crawl keeps the same politeness as every board (honest User-Agent, about 1 request/s, robots.txt first). Amazon had a 5,000-posting budget (postings with pay first, then the newest; the page said "5,000 roles · of 22,415 posted"): at 22,415 the first card on a 4x-throttled phone took 10.5 s against Apple's 4.6 s, at 5,000 it takes 4.9 s. (Removed later on 2026-10-11 at the user's word, "Why are you capping the no of posting we must present them as they are and not cut anything": every posting is published; see perf-mobile-beta-2.md.) A capped board's left-out postings stay open in the history ledger for 14 days instead of closing each run. Amazon's pay row now matches the whole city and state (a Toronto job had read Seattle's USD row); a listing under 95% of the facet total is refused rather than published. Meta's fallback reads only JSON-LD plus `public_compensation`, and its crawl stops after 10 failed pages in a row. The data engineer's DOL visa-filing pay route (`scripts/alt-data/`) is built and tested but has no data yet (needs a workflow).
- Tests: the resume tests hold in both states (paused guarantees on a paused copy, the resumed flow on this tree, and a check that the two differ by exactly the two fields). A Department of Labor test now expects "Economist" in data science, as fix wave 3 files it.
- Verified: `npm test` as CI 919 tests, 893 pass, 0 fail, 7 skipped, 19 to-dos. A first run failed 59 tests with ENOSPC: the scratchpad's finished-lane builds had filled the disk; about 10 GB of finished builds, stale test folders and merged worktrees were removed (PLAYBOOK "Known traps").

### Beta security and accessibility review (2026-10-11)
- The first since the beta channel landed ([review-beta.md](review-beta.md), [REVIEW.md](../REVIEW.md) "beta review 2026-10-11"), on 3cf226e with today's crawl; axe-core 4.13.0 in Chromium. 14 new findings (6 Medium, 8 Low), none Critical or High; V8, V12 and V14 still partly open; V1–V7, V9–V11, V13 and V15 fixed.
- Fixed at once by the lead, because the beta crawl started for Amazon and Meta depends on it: **S-1**, the merge's `beta-crawl-*` download also matched `beta-crawl-rejected-<slug>`, so a snapshot the vetting gate refused could replace the last good one. Each artifact now downloads into its own folder and rejected ones are skipped (the archive still receives them).
- **S-2** (the pause could be bypassed by `snapshot.js amazon` and the probe's default list) was closed by the Amazon and Meta batch (3f47ddc) before the review reported.
- Open for the next fix wave: S-3 (quadratic time in `parseSalary`, `htmlToText` and `geocode` on large input; reachable from server-mode custom boards), A-1 (card names omit team, level, Remote, Juice and age), A-2 (badge popover doesn't take focus), A-3 (company name 9 px wide at 200% zoom), S-4 to S-7 and A-4 to A-7. Its 16 unit tests are to-dos; its 8 e2e tests are red until fixed.

### Beta mobile QA, second pass: the user's company-list report (2026-10-11)
- The user: "I'm seeing that the list of companies don't scroll properly when we're in the beta mode. Don't just fix it adhoc. Do the QA and QC of the sites properly", then "I'm still not able to scroll down from the list of company drop down!!"
- The lead's first check (390x844 portrait, real touch) scrolled fine, and that was the trap: emulated phones have no browser toolbars, so a "390x844" phone shows 844 px where Safari shows about 664. The QA pass ([qa-mobile-beta-2.md](qa-mobile-beta-2.md)) tested 16 viewports with real touch and judged by how much of the last company is visible, not by scroll offsets. Findings:
  - **M-28 (High):** the company list is a 340 px scroll box inside the sheet body, which also scrolls, both with `overscroll-behavior: contain`. Where the sheet body is shorter than 340 px (landscape, an iPhone SE in Safari, any phone with the keyboard up), the inner list reaches its end with the last companies below the screen. Fix verified by injection: on phones the list stops being its own scroller.
  - **M-29:** the menu focuses its search box on open, which opens the keyboard on Android and leads into M-28.
  - **M-30:** loading saved searches rebuilds the whole list under the finger (iOS drops the tap).
  - **M-31:** the chart's empty message sits under the half sheet.
- All 14 first-pass mobile tests pass (M-19 to M-27 fixed); every other scroll area passed the audit; fix wave 3 works on the phone.
- The fix goes through a dedicated lane, fix-company-scroll, gated on these tests. Its WebKit workflow (Playwright WebKit plus Safari in the iOS Simulator with real swipes) is the QA's patch.
- Lesson for the playbook: phone emulation must include short visible heights (browser toolbars, keyboard, landscape), and scroll tests must check what is visible, not the scroll offset.

### Fix: the phone company list scrolls to its last company (2026-10-11)
- Lane **fix-company-scroll** ([log](fix-company-scroll.md)), gated on the mobile QA's red tests and 23 tests of its own (320x568, 390x844, 430x932, 844x390 with an iPhone profile; beta and main; saved searches; a typed search; a stand-in keyboard; the badge and More sheets; desktop unchanged; real touch swipes from a row, a heading and a gap).
- Root cause (M-28): two nested scrollers, both `overscroll-behavior: contain`, so a swipe never reached the sheet once the 340 px inner list hit its end; with a short sheet the end sat below the screen. Fix, phones only: one scroller per sheet. The search box and the "Add another company's board" button stay pinned, and the list fills the rest of the sheet (82dvh, or `--vvh` with the keyboard up; a new `--vvt` follows iOS's viewport panning). M-29: phones focus the current company row, not the search box, so the keyboard doesn't open. M-30: the rows rebuild only when the company, list, saved searches or query change; a loading saved search updates its "N new" badge in place. M-31: the chart's empty message sits near the top on phones.
- Results: the fix lane's 23 tests 4 → 23 passing; the QA's group 2/6 → 6/6. The mobile guidance (docs/process/mobile.md) now says a sheet has exactly one scroller.
- WebKit: `.github/workflows/webkit-phone.yml` (the QA's patch plus the lane's tests) runs the phone tests on Playwright WebKit with an iPhone profile, and swipes the list in Safari in the iOS Simulator on a macOS runner. The sandbox has no WebKit, so this workflow and a real iPhone after the deploy are the remaining checks.

### Incremental crawl and closures for every board (2026-10-11)
- The user: "Do we have the auto updates of the positions and delta code and backend setup? Also to check for posting that are already closed or no longer there? … Don't just recrawl everything and check the diffs", then "should be doing it for ALL posts and the mechanism and code up on the repo so that we doing lose anything! Don't just do things adhoc!!"
- Lane **incremental-crawl** ([log](incremental-crawl.md)). Before: every beta board re-read every detail page every 6 hours; a posting missing from any list was closed, including lists that were short, capped, or missing failed detail records.
- Now one module, `server/sources/incremental.js`, serves all 15 boards; each adapter adds only a change signal (a hash of the list fields an edit moves, or the sitemap's lastmod). Detail boards fetch a detail only when a posting is new, its signal moved, or its cached raw detail passed a 2-4 day refresh age spread per posting (`MELON_DETAIL_REFRESH_DAYS`), with conditional requests where the host sends validators. Raw details are cached, not normalized jobs, so each run maps and normalizes the whole board exactly as a full crawl does. No crawl state, an unreadable one, a changed adapter version, or `full_crawl` in the workflow means a full crawl, and the snapshot says why. The request rate is unchanged.
- Closures, with a reason in the ledger: absent from a complete list is `absent`; absent from a partial or capped list stays open while seen in the last 14 days, then `unseen`; a 404, 410 or redirect away on one cheap probe (at most 50 per board per run) is `gone`; a failed crawl changes nothing. The lead applied the lane's archive patch, so a short list is partial in the archive too.
- Proof: 31 new tests, including an incremental-vs-full equivalence test for all 10 adapters (snapshot, ledger and archive identical, details fetched only for new and changed postings). Expected saving per 6-hourly run, from the archive's churn: Apple 89 → about 13 min, NVIDIA 49 → 9, Microsoft 42 → 8, Google 57 → 5, Netflix 8.4 → 1.5, Meta 20 → 2 min; Amazon and the stable boards were already one list each. Not yet seen live: which hosts send validators, Meta's lastmod, and whether Apple's and Eightfold's detail APIs return 404 for closed postings (if not, a closure waits up to 14 days, never a false one). The first run after this push is a full crawl, because there is no crawl state yet.

### Beta desktop QA, second pass (2026-10-11)
- [qa-desktop-beta-2.md](qa-desktop-beta-2.md), on the lead's build of 3cf226e with today's crawl, at 1440, 1280 and 1024 in both themes. All 14 first-pass bugs (D-17 to D-30) are fixed, and fix wave 3 works on desktop except BP-15 and BP-16, now partly open.
- New: **D-31 (Medium)**: without a basemap, a pin click folds off-screen pins into the visible one (Apple: "Cupertino, Austin and 212 more · 4.9K"); `layoutLabels()` treats off-screen pins as labels that don't fit. Low: D-32, 12 Apple store names as places; D-33, two ages a day apart in one drawer; D-34, 3 Microsoft two-level ranges show no "Pay by level"; D-35, a beta board linked on the main site gives no link to /beta/; D-36, Google lists one place under several labels; D-37, the beta methodology and share pages don't say beta. 7 red e2e tests gate the next fix wave.
- Works: bundle-only big-tech boards, facet counts (about 175 checks) and sorts match the data, 58 layout checks clean, 0 contrast violations, and Apple answers filters and sorts in 0.18 to 0.6 s at load 7.

### Beta UX and frontend design review (2026-10-11)
- [ux-review-beta.md](ux-review-beta.md), on the fixed build (8259b1b code, today's crawl). 22 findings: 1 High, 8 Medium, 13 Low; 7 are red e2e tests (UX-15 to UX-21).
- High, UX-22: a requisition with several pay ranges by place shows one span next to places where no pay is posted, with only a tooltip caveat. This is the screen side of DQ-27/DQ-28/VT-4; fix wave 4's data lane fixes the data, and the app lane adds a "Pay by place" line.
- Medium: the stats line clipped mid-number (UX-15); card places truncated behind long department names (UX-16); no readable beta notice (UX-23); chart rows led by one-role departments (UX-24); one thing under many names (UX-25); three disagreeing error messages (UX-26); four date formats (UX-27); a term internship's yearly rate shown without "/yr" (UX-29).
- Within the simplicity budget. To keep: pay caveats next to the number, plain explanations at each filter, and one calm system at Apple's scale.

### Beta methodology and sources review (2026-10-11)
- [methodology-review-beta.md](methodology-review-beta.md): 22 findings, 2 High, 14 Medium, 6 Low, encoded as 43 to-do tests in `test/beta-methodology.test.js`.
- High: MR-1, 16 Romanian lei ranges show "Salary not listed" because no table has a RON rate, although the ECB (already our source) publishes one; MR-2, converted pay shows no rate date or source where it appears.
- The lead applied its five doc and registry patches (DATA_SOURCES, README, METHODOLOGY_GUIDE, AMAZON_META, the registry: 17 constants and Amazon's budget added; job-postings, company-registry and role-family entries corrected). Per the review, these clear 29 of the 43 to-dos; the rest need product code (fix wave 4).
- Exchange rates are 57 days past their monthly cadence (MR-4); the FX refresh is dispatched.

### Beta data-visualisation review (2026-10-11)
- [viz-review-beta.md](viz-review-beta.md): 17 findings (V-16 to V-32), 16 as red e2e tests. High: V-17, a map pin priced from one posting out of dozens; V-18, Group by Location shows other countries' pay; V-19, part-time hourly pay plotted as a full-time year. Medium: map Pay colours rescale to what is on screen, with no legend (V-16); most marks under 3:1 contrast (V-22); two-level spans drawn as one bar (V-20); level rows mixing countries (V-21); colour-blind collisions (V-25); 537 postings at a state or country centre named as exact (V-26); floating names without a basemap (V-24); and four more.
- Works: 84 range bars match their postings to the pixel; every median matches a hand calculation; 530 market cells match a rebuild; Compstimate never falls with level and never uses another country's pay.
- Lead fixes from the review, while fix wave 4 runs: **S-5**, snapshot.yml now has one concurrency queue per channel (stable, beta, or the dispatched channel), so a beta run can no longer replace the pending daily stable run or hold a manual crawl behind a scheduled one; **S-7**, scripts/cycle/serve.mjs answers 400 to a path with bad percent-encoding instead of crashing the reviewers' shared server. Both review tests are now plain passing tests.

### Fix wave 4, data lane (2026-10-11)
- **fix4-data** ([log](fix4-data.md)), norm-9. Measured on today's data:
  - Apple: headline Juice at a place with no posted pay 364 → 0, and "Austin pay" 317 → 0 (DQ-27, VT-4); merged requisitions scored on the span 393 → 0, so Cupertino is now scored on its own $214,000 (DQ-28); reqIds with a location suffix 3,311 → 0 (DQ-30); store and mall names as places 12 → 0 (D-32).
  - Google: Facilities Manager I/II is Manager, not Entry (DQ-29; 37 Program, TPM and Account Manager titles stay by rule); ZIP-code places keep their state (DQ-31); Pryor and Moncks Corner labels 6 → 2 (D-36).
  - Pay text: Romanian lei postings now show pay, 16 of 16, with RON added to every FX table and to the ECB request (MR-1, DQ-6, VT-2); the São Paulo job no longer shows US pay (VT-1); Netflix internship bands are no longer base pay (VT-3); pay across two countries 37 → 1, the remaining one correct (VT-5); NVIDIA Italy and Poland lines name their country (VT-6); Microsoft two-level texts get "Pay by level" (D-34, VT-12); the literal "&#xa;" is gone from 44 NVIDIA postings (VT-13).
  - Robustness: 1 MB of hostile input now parses in under 0.2 s, and pipeline tasks stop after 5 minutes (S-3); posting links must be https on the board's own host (S-4).
- Of 19,173 stored postings re-derived, 60 salaries change, each explained by a finding. Vetting: 0 blocking, 527 of 527 fixtures pass.
- The leu rate is July's like every other rate (the Big Mac data's dollar_ex); the ECB monthly refresh now requests RON and updates all rates together.
- Still open, waiting on the user: VT-7, VT-8, VT-10.

### Fix wave 4, chart and map lane (2026-10-11)
- **fix4-viz** ([log](fix4-viz.md)): every finding in its brief fixed; its gate tests 0/19 → 16/19 (the other 3 belong to fix4-app); full e2e 220 → 238 passing, no new failures; Apple drawing no slower (regroup 118 → 107 ms).
- Map: Pay pins on five fixed approx-USD steps with a Pay legend (V-16, MR-13); a median only from 3 or more postings with pay for that place, and the count is named (V-17); base pay as on the chart; approximate places say so (V-26); off-screen pins never named or merged (V-24, D-31); grey no-data pins match the legend (V-28); 44 px phone controls (UX-19, M-8).
- Chart: Location rows use only pay posted for that place (V-18); part-time hourly shown as hourly, the bar "a year if full-time (2,080 hours)" (V-19); multi-level and multi-place ranges striped, on-target earnings dashed, with legend keys (V-20); rows on a mixed-currency board use the main currency and say so (V-21); marks 3:1 or better (V-22); a colour-blind-safe palette, smallest pair ΔE 12.6 (V-25); ticks read $1.25M (V-27); bins and edge chips aligned (V-29, UX-17); departments past the 7 with the most pay fold into one row (UX-24); "Colour: department" (UX-36); converted pay names the rates' month next to the number (MR-2).
- Comps: company colours lifted to 3:1 on the real background (V-23).

### Fix wave 4, app lane, and the wave's totals (2026-10-11)
- **fix4-app** ([log](fix4-app.md)): accessibility A-1 to A-7 and V8; S-6 (methodology pages cached); D-33, D-35, D-37; UX-15 to UX-21 with tests, plus UX-22 ("Pay by place" in the drawer, "$166K–325K · 3 places" on cards, the picked place's own range under a Location filter), UX-23, 25 to 27, 29, 31 to 35; the display side of MR-1 to MR-3, MR-10 to MR-12, MR-14, MR-17 and MR-18; V-30 and V-32.
- **M-32, found in real Safari** (the iOS Simulator job, run 38150084751): on an iPhone SE with the keyboard up, the company sheet stayed 449 px tall while 321 px were visible, so the last companies were hidden. Cause: Safari shrinks `innerHeight` with the keyboard, so the keyboard check never fired. Now the keyboard is judged against the tallest height seen with no field focused, and the viewport is re-measured 120, 350 and 700 ms after the last viewport event; a Chromium test fakes the SE's numbers, and the simulator job is re-run.
- **M-32 verified in real Safari** (run 38170027791 on 31ad25b): iPhone SE (3rd generation) passes every check: swipes reach Shield AI fully visible, and with the keyboard up the sheet fits the 547 px visual viewport with 5 rows visible and swipes still reach the end. The iPhone 16 leg did not run: `simctl openurl` timed out on the cold first boot (NSPOSIXErrorDomain 60), a harness problem, not the app. The script now launches Safari first and retries the open up to three times; the job is re-run.
- The lead applied its three patches: MR-9 (the grade's dollar cut-offs now equal the methodology page's), MR-14 (a capped snapshot records how many of the whole board post pay), MR-17 ("CORS" explained).
- Left for the user to weigh, with the tests that pin today's text: UX-28 ("$287.5K" in "Pay by level", pinned by D-21; filter counts without thousands separators, read as numbers by ten e2e tests), UX-27 ("11 Oct 2026" in `formatAsOf`) and part of UX-31 (Compstimate and comps wording).
- Fix wave 4 verified on the integrated tree: `npm test` as CI 1,016 tests, 968 pass, 0 fail, 41 to-dos; build OK with today's crawl; full e2e **300/304 passed, 0 failed, 4 skipped**. Every red test from the round-2 reviews (desktop and mobile QA, security and accessibility, UX, data-viz, methodology) now passes, except the to-dos that wait on user decisions.

### The user: no caps, and less text on the phone (2026-10-11)
- "Why are you capping the no of posting we must present them as they are and not cut anything": Amazon's 5,000-posting budget is removed and `fitSnapshot` may never drop a posting on any board (it may only move descriptions to the files loaded on open). The optimization pass (perf-mobile-beta-2) now has to make the full board fast (about 22,400 Amazon postings), not smaller.
- "That footer and top notes esp on the mobile … way too busy … Make sure you UI/UX QC really do the job and not just gloss experiences like this over. Fix it!": lane fix-density inventories every secondary line (chart notes, stats line, map notes, drawer sub-lines, captions) per board and viewport, cuts each to one short line with one details disclosure, and adds tests that fail on any line over one line on a phone. The UX and mobile QA templates now make text density a measured check, and the playbook records why.

### Beta round 3: data check and salary vetting with Amazon and Meta (2026-10-11)
- Data from today's crawl of all 7 big-tech boards (Amazon still at its 5,000 budget; the next crawl has the whole board).
- [data-check-beta-3.md](data-check-beta-3.md): the five earlier boards are trustworthy (fix wave 4's DQ-27 to DQ-32 hold on the real data); Amazon and Meta usable with caveats. New: DQ-33 (Amazon's per-city pay rows carry no places: 14% of postings score some place on another city's pay), DQ-34 (cities without Juice records: Amazon 31%), DQ-35 (a Mexico peso salary shown as USD), DQ-36/37 (Amazon "III" and Meta "(Technical Leadership)" levels), DQ-38 (the history ledger only knows the 5,000 kept postings, so the first uncapped crawl would mark about 17,350 old postings "New": the uncapped crawl waits for this fix), DQ-39 to DQ-43.
- [vetting-beta-2.md](vetting-beta-2.md), [summary](../../data/vetting/2026-10-11-beta-2/summary.md): 1,810 salaries reviewed, 1,697 correct. Amazon **not ready**: VT-14 (the peso salary, 17x too high, Critical), VT-15 (= DQ-33), VT-17 (111 EU and Poland minimum salaries shown as the pay), VT-18 (hourly rows including the top shift differential), VT-19 (Austria x12 instead of the stated annual figure); Microsoft usable with caveats (VT-16, two correct lei ranges quarantined); the rest trustworthy. The vetting agent could not write its summary and log; the lead wrote both from its report. The lead applied its VETTING.md and fixtures patches and the data check's DATA_SOURCES patch.
- **Decisions the lead took under the user's rule "we must present them as they are and not cut anything"** (each reversible; recorded for the user): VT-17, show a stated minimum as "from €X" (a minimum kind), never hide it; VT-18, keep the posted figure and label that it includes the highest shift differential, and show a stated base beside it; VT-19, use the annual figure when the posting states one; the gate gets a per-currency comparison group and `MAX_ANNUAL` $1.5M, so real posted ranges such as Netflix's L7 are shown (VT-10, VT-16); VT-7, NVIDIA's sales cash compensation is shown as on-target earnings rather than hidden; VT-8, Microsoft's own level beats the title; DQ-39, identical Amazon postings stay separate, as posted; Meta levels are not inferred from pay.

### Fix wave 5, data lane (2026-10-11)
- Integrated [fix5-data.md](fix5-data.md) on e48fd32: the no-cap commit (0b8413d) and DQ-38 (e951e91) first, so the uncapped beta crawl was dispatched before the rest; then the remaining four commits. Normalizer is now norm-10.
- Before → after on today's data: DQ-33/VT-15 Juice on another place's pay row 635 → 0; identical rows as zones 506 → 0; DQ-41 3 → 0; DQ-35/VT-14 the peso salary now MXN 12,569/month; DQ-36 80 Amazon "III" titles Mid → Senior; DQ-37 43 → 0; DQ-40 16 → 0; DQ-42 Meta salaries with a country 0 → 903; VT-16 2 correct lei ranges shown; VT-17 117 minimums kept as "minimum"; VT-18 243 flagged as including shift pay, 33 with a stated base; VT-19 3 Austria annual figures; VT-7 +45 NVIDIA OTE salaries shown; VT-10 Netflix L7 shown; VT-8 Microsoft levels 402 → 1,400 postings; VT-25 `-beta-2` folders accepted.
- Calls the lane made, accepted by the lead: Mexico's 2026 legal minimum wage (CONASAMI, MXN 315.04/day) exempts a posting from the parser's and gate's low-pay floors, so a real Mexico salary is shown, not cut; low pay in a minority currency is only flagged once that currency has its own group of 8; stored snapshots get the per-place ranges at read time, before the next crawl.
- Partly fixed: DQ-34 (Juice coverage: Amazon 67.8% → 71.3%, Meta 91.6% → 94.2%, through 20 same-state nearby proxies; the remaining towns need sourced records, listed in LIVABILITY.md). Routed: VT-22 (`fix5-data-trim.diff`, scripts/snapshot.js) to perf-mobile-beta-2, and `fix5-data-display.diff` (public/app.js: "from €X", "Minimum" and "Incl. top shift pay" chips) to fix-density, so each file has one owner.
- Gate: `npm test` CI-like 1,051 tests, 1,005 pass, 0 fail; build with today's data 7/7 beta companies; full e2e 298/304 with 2 failures, both tests the wave's own decisions had outdated, fixed in the tests (now 300/304, 0 failed, 4 skipped as before):
  - `[D-19, M-22]` used Meta and Amazon as boards beta does not list; beta lists every board now, so the cases are the main site's big-tech slugs, and the test checks that the beta menu lists Meta and Amazon.
  - fix3-data `[static beta]` BP-11 flagged Microsoft's "Sr. Creative Director" and "Group Creative Director" as Director+. Microsoft posts both as "Art M6", its manager track, and VT-8 (the company's own level wins) makes them Director+; the BP-11 check now applies only to levels taken from the title.
- The lead's first e2e run built to a scratch folder, so 168 static tests skipped ("dist/ not built"); the gate counts only the run with `dist/` in the worktree.

### The user: big-tech salary ranges, and Google's chart rows (2026-10-11)
- "Are you sure the salary range of the big tech are correct?! They don't look correct and kinda all span too evenly." Two-person squad on d50d89b:
  - **salary-audit-data** (data engineer): the shape of the ranges over whole boards (widths, repeated pairs, provenance counts), a seeded sample against posted text and a few live pages, the served view against the snapshots. Findings SA-n, in test/salary-audit.test.js.
  - **salary-audit-backend** (backend engineer): traces every salary from adapter to card, drawer, chart and Juice, flags any stage that changes a range (zone collapse, basis or FX conversion, estimates, binning), and fixes the server side. Findings SB-n, in test/salary-pipeline.test.js; client fixes go as patches to the lanes that own those files.
- "for Google it's not split by the subsidiary companies … isn't consistent with the rest of the big tech … still allow users to just zoom into / group by Google subsidiary". Lane **google-grouping**: give Google postings a job family for the department, from Google's own published categories if a polite route exists, else a documented, measured title classifier labelled as such. The brand becomes its own field, with a "Company" group-by and a brand filter folded into the existing menus.
- Ownership changes: google-grouping takes chart.js row grouping and app.js group/filter controls from fix-density (which keeps the text lines and CSS); server/sources/google.js moves to google-grouping.

### Checks after the pause (2026-10-16)
- The agents stopped on 2026-10-11 at an API usage limit; they were resumed today on the new head, 2474fc4, with today's crawl.
- **Uncapped Amazon crawl landed.** Today's beta crawl has 22,179 Amazon postings, up from 5,000. In the ledger on `data-archive` (`beta/history/amazon.json`, since 2026-10-11, 18 runs) there are 22,179 open and 2,605 closed, and none are marked unpublished.
- **DQ-38 holds on real data.** 15,661 postings that first appeared in the uncapped run took their posted date as first-seen (`b: 1`). Only 2,249 count as "New" (posted within 7 days; every open Amazon posting has a posted date).
- **Company list in real Safari.** WebKit run 38178731040 on e48fd32 passed every job. In the iOS Simulator (Safari), both the iPhone 16 and the iPhone SE (3rd generation) pass all three company-list checks: swipes on the rows, keyboard up, and keyboard up with swipes (the last company, Shield AI, 100% visible). The harness retry fixed the iPhone 16 cold-boot timeout. On the iPhone 16, the real tap once missed the menu button, so the script opened the menu from the page instead; the swipes are real touches. M-28 to M-32 are closed.
- **Scheduled runs.** Snapshot, archive, Pages and the watchdog all ran green every day from 2026-10-11 to 2026-10-16.

### The user: resume without losing progress (2026-10-16)
- "Make sure that if we get stop again due to limits, we're able to resume without losing much progress. So push and compile often so that we don't lose that much."
- On 2026-10-11 the stop left three of the five lanes with only uncommitted edits in their worktrees. Those edits existed only in this container.
- New tooling:
  - `scripts/cycle/checkpoint.sh` pushes each lane's commits, uncommitted diff and new files to `wip/<lane>/` on the deploy branch. It leaves out data links and files over 5 MB, and lists them in STATUS.md.
  - `scripts/cycle/checkpoint-loop.sh` runs a checkpoint every 15 minutes while agents work.
  - `scripts/cycle/restore-wip.sh` rebuilds a lane in a new worktree.
  - CI and Pages now ignore pushes of only `wip/**`, so checkpoints never redeploy the site.
  - `test/checkpoint.test.js` round-trips a commit, an uncommitted edit and a new file, and checks the symlink and big-file exclusions and the `paths-ignore`.
- New process (PLAYBOOK "Checkpoints"; the cycle templates' shared facts): agents commit small and often, keep a `## State` section in their log, and hand finished, tested pieces to the lead as they go. The lead integrates and pushes them in increments with the full gate, rather than waiting for one big report.
