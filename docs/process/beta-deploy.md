# Process log: beta deploy (big-tech boards at /melon-seek/beta/)

## 1. Brief

Prompt: [prompts/beta-deploy.md](prompts/beta-deploy.md) (verbatim, plus the
lead's follow-up message, also verbatim).

**Follow-up (2026-10-10, revision 2).** Two problems with the first version:

- A push now briefly shows the lead's branch-build holding page, and beta
  steps inside `pages.yml` could hold the deploy (and so the holding page) for
  about an hour.
- The user wants the big-tech posts as fresh as possible.

So the big-tech crawl moved out of `pages.yml` into a 6-hourly, per-company
parallel crawl in `snapshot.yml`. That crawl then dispatches `pages.yml`. A
push deploy now only restores the beta artifact and builds `/beta/` from it.
Decisions 3, 15, 16 and 19 cover the new design.

The user asked for Google, Microsoft, Meta, Apple, Netflix, Amazon, Nvidia and
Tesla job posts, but "under https://alvations.github.io/melon-seek/beta", not
on the main page. The data engineer (log: `docs/process/bigtech-data.md`) wrote
the adapters and the registry. This workstream is the deploy side of
[docs/CONTRACT.md](../CONTRACT.md) "v3 additions":

- `/melon-seek/beta/` is a full copy of the app with the stable companies plus
  the beta ones;
- `/melon-seek/` stays as it is;
- a beta problem never fails or holds up the stable deploy.

Files owned: `scripts/build-static.js`, `public/api.js`, `server/index.js`
(channel filter), `scripts/links-policy.js`, one CSS rule in
`public/styles.css`, `.github/workflows/{pages,snapshot,site-watchdog}.yml`,
`.github/scripts/*` (new: `beta-gate.sh`, `beta-snapshots.mjs`),
`test/beta-build.test.js` (new), additions to `test/server.test.js` and
`test/links-policy.test.js`, README "Beta site", this log.

## 2. Inputs and sources

- `docs/CONTRACT.md`, mainly "v3 additions (2026-10-10)". It covers the registry
  shape (`channel: 'beta'`, `live: false`, `listCompanies({ channel })`), what the
  static build and the client must do, and the server's `MELON_CHANNEL`.
- `docs/process/TEMPLATE.md`, `devops.md` (decisions 32, 42–44, 53, 57–65: the
  Pages workflow, the hard vetting gate, the artifact trust rules, the build
  marker and the watchdog), `perf-mobile.md` (load hints, packed lists, the
  bundled-list cache).
- `docs/strategy/ROADMAP.md` §8, the UI simplicity budget. It allows no new
  main-view control and no new palette colours, and says labels and tags are
  monochrome. So the Beta pill is outlined and muted.
- `scripts/build-static.js`, `public/api.js`, `server/index.js`,
  `scripts/links-policy.js`, `scripts/vet-salaries.js` (its blocking rule is
  reused as the beta gate), `.github/scripts/ledger.sh` (trust rules for
  restoring artifacts), `test/static-build.test.js`, `test/workflows.test.js`.
- The data engineer's commit `7289530` ("Big-tech beta: adapters, beta
  registry, snapshot --channel beta"). From it:
  - `--channel beta` fetches the beta companies only and honours
    `MELON_SNAPSHOT_DIR`;
  - Tesla is left out (Akamai 403);
  - NVIDIA comes from `jobs.nvidia.com` (Eightfold);
  - there is a 40 MB guard per beta snapshot.
  I read the posting hosts from the adapters' `url:` fields
  (`server/sources/{amazon,apple,eightfold,google,meta}.js`).
- No skills were loaded and no external docs were needed. GitHub Actions
  semantics I relied on:
  - a step that hits `timeout-minutes` while it has `continue-on-error: true`
    doesn't fail the job;
  - `upload-artifact` with a single directory `path` stores paths relative to
    that directory;
  - an `if:` without a status function implies `success()`.

## 3. Decisions and rationale

1. **One code path for both sites.** `main()` became `buildSite(ctx, site)`,
   which runs once for `dist/` (channel `stable`) and once for `dist/beta/`
   (channel `beta`). It uses the same steps: copy, lib, data, market, CSV,
   config, hints, methodology, social, CSP and links. Every helper that used
   the global `OUT` now takes `out` (`writeSplit`, `staticGraph`, `loadHints`,
   `writeSocial`). The alternative was to post-process a copy of `dist/` into
   `dist/beta/`. I rejected it: it would need its own rewrite of preloads,
   social URLs and market data, and those could drift from the stable code.
2. **The stable site is built first and completely, then the beta copy.** All
   of the stable site's `walk(out)` passes (social URLs, CSP, link policy) run
   before `dist/beta/` exists, so nothing from beta can leak into them.
3. **Stable companies in the beta copy are copied, not rebuilt.** A
   per-process cache holds each company's result (`companyData`), and the beta
   site copies the stable site's files for it:
   - `api/jobs|demo|history|meta/<slug>.json`;
   - `api/desc/<slug>/`;
   - `data/<slug>.csv`.
   This guarantees identical data and costs about 4 s instead of a second 37 s
   build. With `--beta-only`, which `pages.yml` uses in its own step after the
   stable build, the process has no cache. Instead `reuseStable` takes each
   stable company from the main site already in `<out>/`:
   - the files are copied;
   - the market comps and share-page numbers come from the packed list
     (lossless; descriptions aren't used).
   This applies only when that site's `api/companies.json` lists exactly the
   stable companies; otherwise they are rebuilt. With real data the beta step
   went from about 43 s to 5 s. A test checks that it gives the same bytes as
   the one-process build, and that every stable company was reused
   (decision 18).
4. **Channel resolution guards against a missing or wrong registry
   (`channelCompanies`).**
   - Stable is `listCompanies()` minus anything with a `channel` other than
     `stable`. That's belt and braces against a registry bug.
   - Beta is the `channel: 'beta'` entries of `listCompanies({ channel: 'beta' })`
     whose slug isn't a stable one, plus the `MELON_BETA_COMPANIES` extras.
   - A registry that ignores the argument returns the stable list again, which
     means "no beta companies", as the prompt asked.
   - Invalid slugs (outside `[a-z0-9_-]`, and so also unsafe as paths) and
     duplicate slugs are skipped with a warning.
5. **Beta companies come from their snapshot only, never demo data.** The
   snapshot is looked for in `MELON_BETA_SNAPSHOT_DIR` (default
   `data/beta/snapshots/`), then in `MELON_SNAPSHOT_DIR`; the ledger likewise.
   If a beta company has no snapshot, an empty or unreadable one, a gate
   failure or a build error, it is left out of `dist/beta/`. Nothing is
   written for it, and the summary says why. A missing snapshot is reported
   as a note, not a warning, so local builds without beta data stay quiet.
6. **The build has its own beta gate (`betaGate`).** It uses the blocking rule
   of `scripts/vet-salaries.js`: a job that would be published with a critical
   flag (`scanCompany` gives `critical`, and the salary isn't quarantined).
   The workflow runs the same scan earlier (decision 9). Running it in the
   build as well means implausible pay can't reach `/beta/` even if that step
   is skipped or someone builds locally. The fixture regression check isn't
   repeated: it tests the parser, and the hard stable gate already ran it.
7. **`betaLeaks(out, slugs)` makes the stable build fail if beta data appears
   in the stable site.** It checks:
   - `api/companies.json` and `api/market.json` (`companies[]` and `cells`);
   - per-company paths for every beta slug;
   - posting URLs on beta hosts in `api/jobs` and `api/demo` lists.
   It is structural on purpose. Real beta slugs are ordinary words ("meta" is
   also a directory name, "apple" appears in prose), so a byte scan for them
   can't work. The tests add a byte scan with a fake slug (decision 17).
8. **`lib/` holds only what the browser can import.** That is `LIB_MODULES`
   plus the adapters of `LIVE_SOURCES` (greenhouse, ashby, lever) and their
   relative imports. The build used to copy every `server/sources/*.js`, which
   would have put the big-tech adapters, and their hosts such as
   `www.amazon.jobs`, into the stable site. It would also have let a Node-only
   beta adapter fail the stable build. The browser never loads those adapters
   (`live: false`), so neither site ships them. The server's `/lib/` route
   still serves every source, unchanged.
9. **The stable site's `lib/companies.js` has no beta entries
   (`stableRegistry`).** The `COMPANIES` literal is rewritten to the module's
   own stable entries, which also drops the comments in that array; one of
   them names `jobs.nvidia.com`. The result is imported from a `data:` URL and
   checked: the same stable list and lookups, and no beta slug resolves. If
   any check fails, the original is shipped with a warning, and the leak test
   then fails. With no beta entries in the registry, the file is unchanged
   byte for byte. The beta copy ships the original.
10. **Beta markup is written by the build, with no JavaScript:**
    - `<meta name="robots" content="noindex">` on every beta page (index,
      methodology, share pages);
    - on `index.html` only, `<html … data-channel="beta">`, plus
      `<meta name="melon-channel" content="beta">` right after
      `<meta name="melon-seek-build" content="<sha>">`.
    The marker keeps the commit sha, so `check-site.sh` stays one rule; the
    channel meta says which copy is being served. There's no robots.txt: a
    project site can't place one at the domain root, and `Disallow` would hide
    the `noindex` from crawlers anyway.
11. **The Beta pill is one CSS block in `public/styles.css`:**
    `html[data-channel="beta"] .brand::after, html[data-channel="beta"]
    .company-bar::before`, with the `::before` switched off above 860px.
    - Phones (≤ 860px) hide `.brand` entirely, so there the pill leads the
      company menu on row 1.
    - Monochrome per ROADMAP §8: `--ms-muted` text, a `--ms-border-strong`
      outline and the 12px phone floor. Tokens only, so dark mode follows.
    - At 360px the company menu shrinks (ellipsis) and the badge still fits.
    The stable site carries the rule, but it is inert there because nothing
    sets `data-channel`.
12. **`public/api.js` serves `live: false` companies from the bundle only.** A
    built-in whose `api/companies.json` entry has `live: false` is never
    fetched from the browser. Its snapshot is returned with `error: null`, so
    the badge shows "Snapshot · <date>". The "Live fetch skipped" text is kept
    only for the no-bundle fallback, so demo data still always carries an
    explanation. The build writes `live: false` only when it is set, so the
    stable `companies.json` keeps its 5-field entries byte for byte.
13. **Server mode.** `serverChannel()` reads `MELON_CHANNEL` on every call, so
    tests can switch it. `channelCompanies()` feeds `/api/companies`, the
    market comps, the warm-up and the `/c/<slug>/` share pages. Unless the
    variable is `beta`, the list is stable only. `/api/jobs?company=<beta slug>`
    still resolves through `resolveCompany` on any channel, as the contract
    says.
14. **Link policy.**
    - `BETA_POSTING_HOSTS` are career-only hosts, allowed whole. They are
      `apply.careers.microsoft.com`, `jobs.careers.microsoft.com`,
      `careers.microsoft.com`, `www.metacareers.com`, `jobs.apple.com`,
      `explore.jobs.netflix.net`, `jobs.netflix.com`, `www.amazon.jobs`,
      `jobs.nvidia.com`, `nvidia.wd5.myworkdayjobs.com` and the former
      `careers.google.com`.
    - Google posts under the shared host `www.google.com`, so it is allowed
      only through `BETA_POSTING_PREFIXES`: `https://www.google.com/about/careers/`.
    - Prefixes are compared on the parsed URL (protocol, host and normalised
      path), so `…/careers/../maps`, `careersx` and `http:` don't pass.
    - Tesla is not listed because it isn't on the site. I added
      `jobs.nvidia.com`, which the starting list in the prompt didn't have.
    - `SKIP_DIST` now skips `beta/vendor/` and `beta/api/desc/` too. Leaflet's
      own `leafletjs.com` link would otherwise fail a whole-`dist/` scan.
15. **The big-tech crawl runs only in `snapshot.yml`, every 6 hours, one job
    per company (revision 2).**
    - Two schedules on odd minutes: `17 6 * * *` for the stable job
      (unchanged) and `47 0,6,12,18 * * *` for beta. Each job's `if:` matches
      `github.event.schedule`. `workflow_dispatch` takes
      `channel: both|stable|beta`.
    - The jobs, in order:
      1. `beta-companies` prints the matrix (`beta-snapshots.mjs slugs`, via
         `channelCompanies`).
      2. `beta-crawl` runs one job per company with `fail-fast: false`, so
         each host is crawled from its own job at its own 1 request/s. It runs
         `MELON_SNAPSHOT_DIR=data/beta-fresh node scripts/snapshot.js <slug>`
         under `timeout 140m`, inside `timeout-minutes: 150`. The inner cap
         fires first, so a slow crawl is a warning, not a red job. The ledger
         goes to a scratch dir. Then `beta-gate.sh` vets that one snapshot,
         and only a passing one is uploaded, as `beta-crawl-<slug>`
         (1-day retention).
      3. `beta-merge` (`if: !cancelled()`) restores the previous
         `job-board-snapshots-beta` (trusted runs only), downloads
         `beta-crawl-*` and runs `beta-snapshots.mjs merge`:
         - a fresh snapshot replaces the previous one and is recorded in that
           company's ledger (`scripts/history.js#recordRun`, so the ledger is
           updated once, against the real previous ledger);
         - a company with no fresh file keeps its previous snapshot and ledger;
         - non-beta files are removed;
         - it writes a summary table and `fresh=` / `kept=` outputs.
         It uploads one artifact, `path: data/beta/` (snapshots + history,
         14 days). Re-uploading when nothing is fresh keeps the chain alive
         past the 14-day retention.
      4. `beta-deploy` runs only when something is fresh. With
         `permissions: actions: write` and nothing else, it runs
         `gh workflow run pages.yml` on the branch of the last successful
         deploy, if that branch is the default or in `TRUSTED_BRANCHES`;
         otherwise on the default branch. A `GITHUB_TOKEN` dispatch does start
         a run (the documented exception). Dispatched runs make no
         branch-based Pages build, so the holding page never shows.
    - Because a failed company keeps its previous file, gating at crawl time
      also closed the earlier gap where a rejected fresh snapshot had already
      replaced a good one.
    - `persist-ledger` (stable branch store) is now also skipped when the
      stable job is skipped. Workflow-level concurrency stays `snapshot`
      (serialised runs). The two schedules don't overlap: a beta run that
      starts at 00:47 is done long before 06:17.
    - The beta data stays in `data/beta/`, never in `data/snapshots/`, which
      the hard stable gate scans. `ledger.sh count()` is recursive, so the
      nested artifact reports its file count.
16. **`pages.yml` never crawls a big-tech board (revision 2).**
    - Steps, in order:
      1. restore `job-board-snapshots-beta` (`continue-on-error`,
         `timeout-minutes: 5`);
      2. the stable fetch (unchanged);
      3. the stable gate (unchanged, hard);
      4. the beta gate, which re-checks the restored data with today's rules
         (about 3 s per 40 MB; `timeout-minutes: 5`, 120 s per company);
      5. `npm run build -- --no-beta` (hard);
      6. `Build beta site` (`--beta-only`, `continue-on-error`,
         `timeout-minutes: 10`).
    - If that last step doesn't succeed, a follow-up step removes `dist/beta`
      and warns, so a half-written copy is never deployed.
    - A push deploy costs what it did before plus about 1–2 minutes. The caps
      only matter if something hangs: 20 minutes in total, down from about 60
      in the first version.
    - The beta gate (`beta-gate.sh`) runs `vet-salaries.js --no-fixtures
      --no-write-flags <file>` per company. Exit 1 means a critical salary,
      124 or 137 a timeout, anything else a gate error. Each failure moves
      only that snapshot aside, with a `::warning::` and a summary row, and the
      script always exits 0.
    - The build's `--beta-summary` lists every beta company as included or
      left out, with the reason.
17. **Post-deploy and watchdog checks.** `check-site.sh` gained
    `EXPECT_CHANNEL` (default `stable`: the main site must have no channel
    meta, which catches a beta page served at the root) and `CHECK_LEVEL`
    (`warning` prints `::warning::`). The deploy job's last step and a watchdog
    step check `${SITE%/}/beta/` with `CHECK_LEVEL=warning` and append a
    summary note. They never re-deploy and never fail the run.
18. **Tests use a fake beta company, injected with `MELON_BETA_COMPANIES`, a
    test-only registry override** (`server/companies.js` is untouched).
    - `zzbeta` is a demo-generated board run through the real normalizer, with
      every URL on `careers.zzbeta.example` and a 2-run ledger.
    - `zzgone` (no snapshot), `zzempty` (empty) and `zzbroken` (`jobs: [null]`)
      must all be left out.
    - A fake `anthropic` must be ignored because the slug is taken.
    - The builds pin `MELON_BUILT_AT` and `GITHUB_SHA`, so they are
      reproducible. That allows two byte comparisons: stable vs `--no-beta`,
      and `--beta-only` on top of a stable build vs the one-process build.
19. **Least privilege and pins.**
    - Every action is pinned by the SHAs already in the repo.
    - `snapshot.yml` keeps `contents: read, actions: read` at the top. Only
      `beta-deploy` has `actions: write`, which it needs to dispatch.
    - No beta job can write to the repo.
    - `site-watchdog.yml` checks `/beta/` as a warning and never re-deploys
      for it.

## 4. Replayable steps

```sh
# 0. baseline (before any edit): npm test -> 305/306 (perf.test.js V15 event-loop timing flake under load)
# 1. build the real tree (local data/snapshots, no beta snapshots): 37 s stable + 4 s beta copy
npm run build
# 2. stable output vs the original build-static.js, same tree (copy of the tree, my 5 source files reverted):
#    6,289 of 6,299 files identical after normalising each build's own builtAt; the rest: api.js, styles.css
#    (inert changes), lib/companies.js (beta entries removed), and the 6 big-tech adapter files the original
#    shipped in lib/sources/ (now left out); lib/salary.js differed only from a concurrent salary.js edit.
#    Script: compare file by file, replacing builtAt (ISO and epoch ms) with a placeholder.
# 3. tests
node --test test/beta-build.test.js            # 19/19
npm test                                        # see §5
NODE_PATH=$SCRATCH/pw/node_modules node scripts/e2e.js
# 4. browser check of both sites with fake beta data (scratch only):
node make-verify-data.mjs $V                    # zzbeta (MELON_BETA_COMPANIES) + a demo "amazon" snapshot
GITHUB_SHA=verify-sha MELON_SNAPSHOT_DIR=data/snapshots MELON_HISTORY_DIR=$V/hist \
  MELON_BETA_SNAPSHOT_DIR=$V/beta-snaps MELON_BETA_HISTORY_DIR=$V/hist MELON_BETA_COMPANIES=$V/extra.json \
  node scripts/build-static.js --out $V/dist --beta-summary $V/beta-summary.md
DIST=$V/dist PORT=5391 node static-server.mjs & echo $! > $SCRATCH/beta-deploy/static.pid   # 301 /beta -> /beta/, like Pages
BASE=http://127.0.0.1:5391/melon-seek/ SHOTS=$SCRATCH/beta-deploy/shots DIST=$V/dist PW_DIR=$SCRATCH/pw node verify-beta.mjs
kill "$(cat $SCRATCH/beta-deploy/static.pid)"
# 5. workflow YAML
python3 -c "import yaml; [yaml.safe_load(open(f'.github/workflows/{f}.yml')) for f in ('pages','snapshot','site-watchdog')]"
bash -n .github/scripts/*.sh
```

The scratch scripts (`static-server.mjs`, `make-verify-data.mjs`,
`verify-beta.mjs`) live in the session scratchpad. They are short. Their logic
is described in §5, and the committed tests cover the same assertions without a
browser.

## 5. Verification

- **`node --test test/beta-build.test.js`: 19/19.**
  - The stable `dist/` has no fake slug or name and no beta posting host in any
    file outside `beta/` (byte scan), and `betaLeaks` is clean for the fake and
    registry slugs.
  - The stable `lib/companies.js` resolves no beta slug, and `lib/sources/` is
    exactly greenhouse, ashby, lever and util.
  - The stable site has no `data-channel`, `melon-channel` or robots meta, and
    no link to `beta/`.
  - The stable site is byte-for-byte the `--no-beta` build.
  - The beta copy has every stable file. Its `companies.json` is stable +
    `zzbeta` with `live: false`, and the left-out companies leave no trace.
  - Stable companies' files are identical in both sites.
  - Beta pages:
    - noindex (once each), the server CSP and no inline script;
    - the channel tag, channel meta and build marker on the index;
    - every preload hint resolves inside `dist/beta/`;
    - the index equals the stable one apart from the beta markup.
  - Market comps include `zzbeta` (companies and cells) and stable companies;
    the share page's `og:url` is under `SITE/beta/`; the link policy is clean.
  - `--beta-only` leaves the stable files untouched and gives the same bytes as
    the one-process build.
  - `api.js` serves `zzbeta` as a snapshot with `error: null`, without fetching
    off-site, even when its source is listed as live; descriptions load.
  - Unit tests: `channelCompanies`, `betaGate` (an unquarantined $4.6M blocks,
    a quarantined one doesn't) and `betaLeaks`.
  - `beta-gate.sh` with a stubbed gate: good, bad, slow (1 s limit) and crash,
    plus an empty dir. It also runs once with the real `vet-salaries.js`.
  - `check-site.sh`: channel and warning level, against a local HTTP server.
  - Line-based checks of `pages.yml`, `snapshot.yml` and `site-watchdog.yml`:
    `continue-on-error`, `timeout-minutes` and order; the stable gate's command
    and the stable build are unchanged.
- **`test/server.test.js`: 33/33**, including the new channel test, which runs
  against the real registry (google, …): default stable list, stable + beta
  with `MELON_CHANNEL=beta`, `/c/<beta>/` 404 on stable and 200 on beta,
  `HEAD /api/jobs?company=<beta>` 200. **`test/links-policy.test.js`: 5/5**,
  including the new host and prefix test.
- **`npm test`, final run: 370/372.** The 2 failures are the `perf.test.js`
  event-loop timing tests (PERF-1 and V15: 188 and 221 ms against a 100 ms
  goal). Three other agents were running on the machine (load average 5.6).
  V15 failed in my baseline before any edit too. `node --test
  test/perf.test.js` alone passes 3/3, twice. Every file this work touches is
  green (86/86 across beta-build, links-policy, static-build, og, perf-mobile,
  workflows and server).
- **e2e (`scripts/e2e.js`, Chromium 141): 86/86 passed.**
- **Browser check (Playwright, Chromium 1194; desktop 1440x900, phone 390x844
  with `isMobile`; also 360x780 light and dark, and desktop dark): every check
  passed.**
  - `/melon-seek/`:
    - no pill (`::after`/`::before` content `none`, no `data-channel`);
    - the company menu lists the 8 stable companies only, and
      `api/companies.json` has no beta slug;
    - no `a[href*=beta]`, and no horizontal scroll.
  - `/melon-seek/beta` (no slash) 301s to `/melon-seek/beta/`.
  - The beta app:
    - shows the pill (`"Beta"`, by the logo on desktop, leading row 1 on
      phones), and the menu lists 10 companies;
    - the chart for `#c=zzbeta` draws bars, and the badge reads "Snapshot ·
      Oct 9" with no "skipped/failed" text;
    - there is no banner;
    - the drawer opens through `#job=`, Apply goes to
      `https://careers.zzbeta.example/…`, and "Same role elsewhere" shows 9
      rows (stable companies);
    - the map shows pins (tiles aborted, fallback background), and Insights
      fills;
    - `#c=amazon` (registry entry, `live: false`) also shows "Snapshot", and
      Apply goes to `https://www.amazon.jobs/…`;
    - the drawer's "How it's calculated" link goes to
      `beta/methodology/#1-the-formula`; that page is noindex, and its back
      link returns to `/melon-seek/beta/`.
  - At 360px the company menu (153px) ends before the badge.
  - On every page: zero page errors, zero CSP violations, zero same-origin
    failed requests, and zero console errors apart from the aborted external
    tiles.
  - Screenshots (scratchpad `beta-deploy/shots/`, not committed):
    `desktop-stable.png`, `desktop-beta-zzbeta-chart.png`,
    `phone-beta-zzbeta-drawer.png`, `phone360-dark-beta.png`, and the map,
    insights and home views.
- **Real big-tech shapes (scratch check, not committed).** Snapshots were made
  from the data engineer's trimmed real probe records
  (`test/fixtures/bigtech-*.json`, through each adapter's `map*Job` and
  `normalizeJobs`), then the real build was run.
  - All 7 companies were included (google, microsoft, meta, apple, netflix,
    amazon, nvidia; 15 companies in the beta copy).
  - Every posting URL passes `isAllowedLink`. The hosts are
    `www.google.com/about/careers/…`, `apply.careers.microsoft.com`,
    `www.metacareers.com`, `jobs.apple.com`, `explore.jobs.netflix.net`,
    `www.amazon.jobs` and `jobs.nvidia.com`.
  - The stable `dist/` has `betaLeaks` clean and no beta posting host in any
    file.
  - `beta-gate.sh` passed all 7 with the real `vet-salaries.js`.
  - In Chromium at 1440 and 390px, every company's drawer opened, Apply went to
    its career site, and the badge read "Saved snapshot of … from Oct 10" with
    no banner. There were 0 page, CSP or console errors.
  The commit isn't included so the deploy tests don't depend on the adapters'
  internal API; the data engineer's `test/bigtech-sources.test.js` covers the
  mappers.
- **Workflow YAML:** all three files parse with PyYAML 6.0.1 (actionlint isn't
  installed), and `bash -n` passes on every script. `test/workflows.test.js`
  passes (SHA pins, least privilege).

## 6. Known gaps and follow-ups

- **Not run on Actions yet.** The first real crawl comes from the next
  6-hourly `snapshot.yml` schedule, or a manual dispatch with
  `channel: beta`. Check:
  - the matrix cells (one per company), the "Beta snapshots" merge summary and
    the `beta-deploy` dispatch;
  - in the dispatched `pages.yml` run, the "Beta salary vetting gate" and
    "Beta site" summaries.
  Until that first crawl, `/beta/` has the stable companies only.
- **Site size.** The stable site is 87 MB with real data. The beta copy repeats
  it (+87 MB) and adds up to 7 beta snapshots (the data engineer caps each at
  about 40 MB), so 400–500 MB is possible. The GitHub Pages limit is 1 GB.
  Two ways to shrink it later:
  - have the beta copy reuse `../api/desc/` for stable companies, which needs a
    path base in `api.js#descPath`;
  - trim beta descriptions harder.
- **`api/market.json` cap.** With 15 companies, the beta `api/market.json` may
  pass the 150 kB contract cap. That's a warning, not an error. Check the
  size after the first real run.
- **Freshness ceiling.** Posts are at most about 6 hours old, plus the crawl
  time (up to about 1.5 h for the biggest boards). Career sites without CORS
  headers can't be fetched live from the browser. Going faster means crawling
  more often, but a full crawl at 1 request/s per host already takes over an
  hour; incremental crawls (only new posting ids) would be the next step, in
  the adapters.
- **The beta artifact chain.** If every merge failed for 14 days, the artifact
  would expire and `/beta/` would show stable companies only. The merge
  re-uploads the previous data even when nothing is fresh, so this needs 14
  days of failed merges, not of failed crawls.
- **For the lead, changes in files I don't own:**
  - `public/app.js` `LINK_HOSTS` (a mirror of `ALLOWED_HOSTS`, used for links
    inside descriptions) doesn't include the big-tech hosts, so links in a
    big-tech description show as text. The Apply button is unaffected.
  - `SOURCE_LABEL` has no names for the new sources, so the button says "Apply
    on job board".
  - The refresh toast for a `live: false` company says "Live board unreachable
    — showing fallback data". The diff isn't needed for correctness.
  - `docs/process/scripts/link-check.mjs` only knows greenhouse, ashby and
    lever (`ATS_HOSTS`). It doesn't crawl `/beta/` today.
  - `docs/process/README.md`'s workstream table could list this log.
- **`ALLOWED_PREFIXES` and other tools.** `isAllowedLink` is exported for
  tools that need the prefix-aware rule. Anything that reads only
  `ALLOWED_HOSTS` treats `www.google.com/about/careers/` links as off-policy.

## 7. Change log

- 2026-10-10 07:05: Saved the prompt. Ran the baseline: the build took 2.9 s on
  demo data, and `npm test` gave 305/306 (the perf V15 timing flake).
- 2026-10-10 07:20: First two-site build. The data engineer's registry was
  already in the working tree, and all 8 beta companies were left out (no
  snapshots). Stable output was identical to the original script apart from
  the inert `api.js`/`styles.css` changes.
- 2026-10-10 07:25: The leak test caught big-tech adapters, and the beta
  registry, in the stable `lib/`. Limited `lib/` to browser-reachable modules
  and added the stable-channel `lib/companies.js`.
- 2026-10-10 07:33: The data engineer committed `7289530`. Aligned the link
  allowlist (added `jobs.nvidia.com`, removed Tesla). The leak test then caught
  `jobs.nvidia.com` in a registry comment, so the stable registry copy now
  rewrites the whole `COMPANIES` literal.
- 2026-10-10 07:40: Browser check passed on desktop, phone, 360px and dark.
  Wrote the README section and this log.
- 2026-10-10 07:45: `scripts/e2e.js` passed 86/86. The link checker CLI
  (`docs/process/scripts/link-check.mjs`) found 5,571 links OK. Its only broken
  links are 3 in `lead.md`, to logs other agents haven't written yet. My link
  to `bigtech-data.md` became a code reference so it doesn't depend on that log.
- 2026-10-10 07:50: The data engineer's fixtures landed. Ran the scratch check
  of all 7 real-shaped beta companies through the build, the gate and the
  browser; all passed.
- 2026-10-10 08:10 (revision 2, lead's follow-up): moved the big-tech crawl out
  of `pages.yml`.
  - `snapshot.yml` runs it every 6 hours, one job per company: crawl, gate,
    hand-off, then merge (`beta-snapshots.mjs`), then dispatch `pages.yml`.
  - `pages.yml` restores, gates and builds only.
  - `--beta-only` reuses the main site's stable companies.
  - `beta-prune.mjs` was replaced by `beta-snapshots.mjs`.
  - `check-site.sh` now builds on the lead's `holding` branch (header
    updated).
  - Tests: 21/21 in `beta-build.test.js` (new: no beta crawl in `pages.yml`,
    the matrix, merge and dispatch layout, the merge script, and `--beta-only`
    reuse). A local dry run of gate, merge (two rounds; two failed crawls kept
    their previous files) and `--beta-only` worked on the real fixtures.
