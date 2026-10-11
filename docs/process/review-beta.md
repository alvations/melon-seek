# Process log: security and accessibility review, beta (2026-10-11)

## 1. Brief
Prompt: [prompts/review-beta.md](prompts/review-beta.md). This is the first security and accessibility review of the beta
channel: the big-tech crawlers, the `/beta/` build and the client changes up to fix wave 3. It also re-checks
the findings from the v2 review that were still open. Output: the "beta review 2026-10-11" section of
[../REVIEW.md](../REVIEW.md), with new findings S-1 to S-7 and A-1 to A-7 and a re-check of V1 to V15.
Files written: `docs/REVIEW.md` (appended), this log, the prompt file, `test/beta-security-review.test.js`,
`test/e2e/beta-a11y.e2e.js`, and two lines in `scripts/e2e.js` that register the new e2e file. No
product code was changed and nothing was committed.

## 2. Inputs and sources
- Code at commit `3cf226e` ("Fix wave 3", 2026-10-11 12:36 UTC), the shared checkout. Commits since the
  v2 review: `git log --since=2026-10-02 --stat` (134 commits). Code diff: `git diff --stat 3b1e242 HEAD --
  server scripts public .github` (111 files).
- Read first: `docs/REVIEW.md` (every section), `docs/CONTRACT.md` (v3 to fix wave 3 additions),
  `docs/ARCHITECTURE.md`, `docs/DATA_SOURCES.md` §7, `docs/process/review.md`, `PLAYBOOK.md`,
  `TEMPLATE.md`, and `lead.md` (which V findings were fixed, and when).
- Files reviewed:
  - crawlers: `server/sources/{polite,eightfold,google,apple,amazon,meta,pool,upgrade,util}.js`,
    `server/companies.js`, `server/pipeline.js`, `scripts/snapshot.js`, `scripts/probe-bigtech.js`;
  - parsers: `server/salary.js` (`clauseSpan`, `contextOf`, `parseSalary`, `findMoneyTokens`),
    `server/keywords.js#htmlToText`, `server/geo.js` (paren stripping), `server/normalize.js`;
  - server: `server/index.js` (beta paths, `/c/<slug>/`, `/methodology/`, `/lib/`, `/api/freshness`);
  - build and CI: `scripts/build-static.js` (beta copy, preload script, share pages, CSP),
    `scripts/cycle/serve.mjs`, `.github/workflows/{snapshot,pages,archive,bigtech-probe,site-watchdog,
    monthly-refresh,col-refresh,ci}.yml`, `.github/scripts/{beta-gate.sh,beta-snapshots.mjs,ledger.sh,
    check-site.sh}`, `scripts/archive/ingest.js` (artifact names), the repo-root holding page;
  - client: `public/app.js` (`h()`, sanitizer, cards, popovers, drawer, Juice waterfall, hash, storage),
    `public/viz/map.js` (pins, tooltips, Remote control), `public/features/shared.js` (`h()`),
    `public/index.html`, `public/styles.css` (tokens, header queries, focus styles).
- Data: today's crawl (`data/snapshots/`, `data/beta/snapshots/`) and the lead's build of it at
  `<scratchpad>/cycle-beta4/dist` (marker `local-20261011T120934`). The shared `dist/` is from
  2026-10-10 (marker `local-20261010T123230`), so it was not used.
- Tools: Playwright 1.63.0 and axe-core **4.13.0** from `<scratchpad>/pw/node_modules`, Chromium
  141.0.7390.37 (`/opt/pw-browsers/chromium-1194`), Node 22.22.0, and `curl`.

## 3. Decisions and rationale
1. Each finding gets a failing test. The unit tests are marked `todo`, so CI stays green until the fixes land. Tests for workflow and policy findings read the files line by line, as
   `test/workflows.test.js` does (zero dependencies, no YAML parser).
2. The S-3 tests run the parser in a `worker_thread` that is terminated at 2 s. The suite then fails in
   about 2 s instead of the 6 to 17 s each input takes today. Linear code does these inputs in tens of ms,
   so a loaded machine stays far inside the budget.
3. S-3 is Medium, not High. The public deployment is the static Pages site. There, a hostile custom-board
   link only burns the visitor's own CPU. Server mode (Docker) is where the unauthenticated DoS lives.
4. A-3 uses 640×450 CSS px for "200% zoom". That is a 1280×900 window at 200%, and it hits the "short
   screen" one-row header query (`max-width: 860px and max-height: 500px`). The proposed patch was tried in
   Chromium with `addStyleTag` (bypassCSP) before it was written down.
5. The crafted-posting XSS test used `bypassCSP: true`, so an injected handler would have run. That isolates
   the DOM sinks from the CSP, which would block inline handlers anyway.
6. The full e2e suite ran from a scratch copy of the repository. In it, `dist` is a symlink to the lead's
   build, `data/{snapshots,beta,…}` are symlinks to the shared checkout, and `data/cache` is a fresh
   directory. So it tests today's build without writing the shared `dist/` (PLAYBOOK: agents never write it)
   or `data/cache`. Screenshots went to the copy's `docs/screenshots/`.
7. Hash values have no length cap, but a 3,000-word `q=` took 715 ms and 200 KB `l=` values 3.3 s, both
   in the visitor's own tab. This is not reported as a finding (listed under "Checked and fine").

## 4. Replayable steps
`S` = `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad`, `R` = `$S/review-beta`.

1. `npm test` (full, with today's data linked): `(time npm test) > $R/npm-test.log 2>&1`.
2. Serve the lead's build:
   `node scripts/cycle/serve.mjs --dist $S/cycle-beta4/dist --pid $R/serve.pid` (port 39059). Stop it with `kill "$(cat $R/serve.pid)"`.
3. axe on the screens (`$R/a11y/axe-screens.mjs`; `SCHEME=light|dark BASE=http://127.0.0.1:39059/melon-seek/beta node axe-screens.mjs`).
   Context `{1440×900, bypassCSP}`, external hosts aborted. Tags `wcag2a, wcag2aa, wcag21a, wcag21aa,
   wcag22aa, best-practice`. Screens: first load (opens `#c=google`), company menu, filters with every
   `<details>` open, drawer (first card), map (`c=apple&m=map`), Insights with Compstimate and Compare
   companies (`c=nvidia&m=insights`), then at 390×844 (touch): first load (`c=microsoft`), sheet half
   open, filter sheet.
4. Screen-reader tree (`sr-probe.mjs`, `card-probe.mjs`, `kw-probe.mjs`): `locator.ariaSnapshot()`. In
   Playwright 1.63 `page.accessibility` is no longer available, so the tree is read with
   `ariaSnapshot`, which builds it from the same accessible names and roles. Checked: header, Beta
   tag, badge, drawer of an Apple part-time role (`apple:200639036-3253`), an Apple per-place range
   (`apple:200462446-0836`), NVIDIA levels (`nvidia:893375056870`) and PLN (`nvidia:893379202948`),
   Microsoft IC levels (`microsoft:1970393556627435`) and CZK (`microsoft:1970393556629151`), and a
   Google EUR internship (`google:100315940037501638`). Then card name against visible text for
   `apple&q=operations specialist`, `nvidia&q=deep learning algorithms manager`, `microsoft&q=compiler`
   and `google&q=financial analyst intern`.
5. Keyboard (`tab-probe.mjs`, 90 Tab stops with focus-style check; `kbd-probe.mjs`): `t` on a focused
   button, `t` typed in the search box, badge Enter/Esc, drawer open by Enter on a card, then 80 Tabs, the
   household and Monthly buttons, Esc. Also the map's Remote button, the first pin's name, and the phone
   sheet handle. Then `badge-probe.mjs` (popover tree, Tab after open, huge hash values), `v-probe.mjs` (V9,
   V13) and `lm-probe.mjs` (Insights landmarks).
6. Parsers on hostile input: `$R/redos/cases.mjs` holds 41 functions and 63 generators. `run.mjs` (1 MB
   each, worker watchdog) found the slow ones, then `scale.mjs` timed each pair at 4K/16K/64K/256K/1M
   and fitted the growth exponent: `for f in …; do timeout 300 node scale.mjs "^$f$" '' 1500; done > scale.log`.
   Hot spots came from `node --cpu-prof prof.mjs` and `prof2.mjs`. The comparison with `6a42334` is
   `oldcmp.mjs` (`git show 6a42334:server/salary.js > $R/redos/old/salary.js`).
7. Crafted postings through the real pipeline: `node $R/xss/make.mjs $R/xss/beta-snaps` runs
   `mapEightfoldJob` → `normalizeJobs` and writes a Netflix snapshot with 3 hostile and 40 real jobs. Then
   `MELON_SNAPSHOT_DIR=$R/xss/snaps MELON_HISTORY_DIR=$R/xss/hist MELON_BETA_SNAPSHOT_DIR=$R/xss/beta-snaps
   MELON_BETA_HISTORY_DIR=$R/xss/beta-hist node scripts/build-static.js --out $R/xss/dist` (9 s), served on its
   own port. `xss-probe.mjs` adds a MutationObserver (any added `img`, `script`, `iframe`, `on*` or
   `javascript:` attribute), visits chart, ranges, map, Insights, group by location, search, three drawers,
   filters, company menu and the share page, and hovers rows, pins and cards. CSV check:
   `head $R/xss/dist/beta/data/netflix.csv`.
8. Contrast (`contrast-probe.mjs`: computed colours composited over the real background, both themes),
   plus `node -e` with the WCAG formula for tokens and focus halos.
9. Reflow (`reflow-probe.mjs`): 320×640, 640×450 and 390×844, `reducedMotion: 'reduce'`, horizontal scroll,
   clipped text, screenshots in `$R/a11y/shots/`. Then `name-probe.mjs` (company-name width, main site
   against beta, 640 to 1024 px) and `fix-try.mjs` (the A-3 patch).
10. Server mode (step 7's data is not used here):
    `MELON_CHANNEL=beta MELON_CACHE_DIR=$R/srvcache PORT=5397 node server/index.js` (pid in `$R/server.pid`).
    Cold `/api/market` with `/api/health` polled every 1-2 s. Route probes: `/api/jobs?company=amazon`,
    `?company=meta&refresh=1`, `?source=amazon&board=amazon`, `?source=eightfold&board=microsoft`,
    `?source=greenhouse&board=google`, `/c/amazon/`, `/c/apple/`, `/c/apple`, `/api/export?company=amazon`,
    `/lib/sources/polite.js`, `/api/freshness`, `/methodology/`, `/c/..%2f/`, `/api/job?id=amazon:1`,
    `?source=lever&board=zzexample&name=Anthropic|Apple`. Time `methodologyPages()` with `node -e`.
11. `node --test test/perf.test.js` on its own (V15).
12. New tests: `node --test test/beta-security-review.test.js`, and
    `E2E_DIST=$S/cycle-beta4/dist NODE_PATH=$S/pw/node_modules node scripts/e2e.js --grep='beta a11y'`.
13. Full e2e from a scratch copy (decision 6):
    `tar --exclude=./.git --exclude=./dist --exclude=./node_modules --exclude=./data --exclude=./docs/screenshots -cf - . | tar -xf - -C $R/e2e-root`,
    then link `node_modules`, `dist` → `$S/cycle-beta4/dist` and `data/{beta,snapshots,cities.json,freshness.json,vetting}`, and run
    `cd $R/e2e-root && NODE_PATH=$S/pw/node_modules node scripts/e2e.js > $R/e2e-full.log`.
14. Stop everything with the pid files: `kill "$(cat $R/serve.pid)"`, `kill "$(cat $R/server.pid)"`, `kill "$(cat $R/xss/serve.pid)"`.

## 5. Verification and results
- **`npm test`** (before the new file, today's data linked, machine load 3 to 6): 891 tests, **870 pass, 2 fail,
  19 to-do** (the second data check's and the vetting's to-dos), 4 min 7 s. The two failures were
  `PERF-1` (441 ms of event-loop lag) and `review V15` (552 ms), both timing tests. Run alone
  (`node --test test/perf.test.js`, load 2.7), both passed 3 of 3: cold `/api/market` 2.4 s with 106 ms
  maximum lag. This is the known load effect (PLAYBOOK, Stage 3).
- **New unit tests**: `test/beta-security-review.test.js` has 16 tests and all 16 fail for the reason given
  in their finding (S-1 ×1, S-2 ×3, S-3 ×5, S-4 ×2, S-5, S-6, S-7, V14, V12). Each carries
  `{ todo: … }`, so node:test reports it as `not ok … # TODO` and `npm test` stays green (the precedent
  of `test/beta-data-check-2.test.js`). Run `node --test test/beta-security-review.test.js` to see them
  (`# todo 16`). A fix lane drops the option from a test when it fixes that finding.
- **New e2e tests**: `test/e2e/beta-a11y.e2e.js` has 8 tests and all 8 fail against today's build (A-1 to A-7,
  V8). The messages are quoted in the REVIEW.md findings.
- **Full e2e** (from the scratch copy against today's build, 25 min 55 s, machine load 10 to 15 from other
  agents): **222/238 passed, 12 failed, 4 skipped**. The 12 failures are the 8 new red tests (A-1 to A-7, V8)
  and 4 Compstimate server-mode tests: T13, T21, T22 and T23 ("app not ready after 30000ms", a cold
  server with an empty `data/cache` under load). Re-run alone at load 9: T13, T22 and T23 passed. T21
  (the cold-server timing test the PLAYBOOK lists as load-sensitive) failed again on the 30 s load timeout.
  Without the new file, the suite has 230 tests and no failure outside that load-sensitive group.
- **axe 4.13.0** (beta, light and dark, same results). `list` (serious) appears on every list view (A-5).
  `target-size` (serious) on the two range sliders (V8). `region` (moderate) on `#pageTitle` (A-7).
  `landmark-unique` (moderate) in Insights (A-7). `aria-allowed-role` (minor) on `article role=button` and
  `aside role=dialog` (not reported: the roles are right for the widgets, and axe flags them only for
  those elements). The company menu and the map had 0 violations, and there was no `color-contrast`
  violation anywhere. The Snapshot badge's generated text is outside axe's reach (A-4).
- **Contrast** (computed): Beta tag 5.95:1 / 7.90:1. Snapshot badge 4.48:1 (light) and 7.50:1 (dark).
  Level pill and tags 5.30:1 / 7.14:1. Listing age (`--ms-faint`) 4.83:1 / 5.64:1. `--ms-faint` on
  `#f0f2f5` 4.31:1. Accent on white 5.31:1, dark 8.79:1. Focus halo 35% accent 1.67:1 (light), 45% accent
  2.76:1 (dark); the halo is the only indicator on the range sliders (V8). Elsewhere the 2 px accent outline
  (5.31:1 / 8.79:1) or the accent border is.
- **Parsers**: 41 × 63 pairs at 1 MB. 41 pairs grow about quadratically (fitted exponent ≥ 1.5; S-3:
  `parseSalary` and `parseSalaryCA` 11 each, `normalizeJob` 12, `geocode` 4, both `htmlToText`s and
  `extractSections` 1 each). None is exponential. The other pairs that took over 1 s at 1 MB (45) grow
  linearly and finish in at most 3.7 s.
- **Crafted postings**: 0 injected elements or handlers, `window.__xss` never set, `Object.prototype` clean.
  The CSV escapes formulas. The `javascript:` posting URL was stored and published (S-4).
- **Server mode**: paused companies were never fetched (`[live]` lines in the log: 1, for the custom board
  `greenhouse/google`, which went to demo). Cold beta `/api/market` took 129.8 s while `/api/health` stayed
  at 1 to 74 ms. `/methodology/` took 155 ms over HTTP, and `methodologyPages()` 196 ms cold, 81 ms warm.

## 6. Known gaps and follow-ups
- There is no outbound network, so no live crawl was made. S-1 and S-5 are reasoned from the workflow
  files and GitHub's documented artifact-glob and concurrency behaviour, not reproduced on GitHub. S-2 was
  reproduced with a stubbed `fetch`: the requests were recorded, none was sent.
- There was no real screen reader (NVDA, VoiceOver). The names come from Chromium's accessibility tree via
  `ariaSnapshot`, because `page.accessibility.snapshot()` is gone in Playwright 1.63.
- Amazon and Meta are paused and were neither tested nor crawled. Their adapters (`amazon.js`, `meta.js`)
  were read only for host pinning.
- Machine load was 2 to 15 during the run, from other agents. The S-3 times were taken at load about 5, so
  on an idle machine they are lower but grow the same way (exponent ≈ 2).
- Routing suggestions: S-1, S-5 and V12 to devops (workflows); S-2 to the beta data lane (pipeline,
  snapshot, probe); S-3 and S-4 to backend and the sources lane; S-6 to backend; S-7 to the lead (cycle
  tooling); A-1, A-2, A-5 and A-6 to the app lane; A-3 and A-4 to UX (styles.css); A-7 to features; V8
  to UX; V14 to backend plus the app.

## 7. Change log
- 2026-10-11 12:40 UTC: started at `3cf226e`. `npm test` run.
- 2026-10-11 ~12:45-13:00: crawler, workflow and server reading; parser timing harness; axe and keyboard
  probes on the lead's build.
- 2026-10-11 ~12:58: crafted-posting build and XSS probe. Server-mode checks.
- 2026-10-11 ~13:15-13:41: full e2e (222/238), then the 4 Compstimate failures re-run alone (3 pass, T21 is timing).
- 2026-10-11 ~13:10: wrote `test/beta-security-review.test.js` and `test/e2e/beta-a11y.e2e.js` (all red as
  intended), and registered the e2e file in `scripts/e2e.js`. Appended "beta review 2026-10-11" to REVIEW.md.
