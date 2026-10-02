# Process log: security + accessibility review

Sections 1-7 cover both passes. The first pass (05:30 UTC) was written up by
the lead from the review's own output, because that agent stopped on an API
error. The second pass (re-check plus v2 review, ~13:30 UTC) was written by
the review agent itself.

## 1. Brief
Prompts: [prompts/review.md](prompts/review.md), which has the original prompt
and, under "Re-check prompt", the second one. This is a read-only review of the
server, the frontend, the build and CI for security, accessibility and
correctness issues. Output: [../REVIEW.md](../REVIEW.md). No code was edited.
Files written: `docs/REVIEW.md`, this file, and an append to
`prompts/review.md`. Nothing was committed.

## 2. Inputs and sources
- **Pass 1:** working tree at about 05:30 UTC on 2026-10-02 (commit `1d23290`
  plus uncommitted work in progress). In scope: `server/**`, `public/app.js`,
  `public/index.html`, `public/viz/{chart,map,palette}.js`,
  `public/viz/viz.css`, `public/features/shared.js`. Also
  `node_modules/leaflet/dist/leaflet-src.js` (how `divIcon` and tooltips insert
  content) and [../CONTRACT.md](../CONTRACT.md).
- **Pass 2:** started at commit `2e6e4cf`, line numbers taken at `6a42334`
  (other agents committed during the pass). Read first:
  `docs/REVIEW.md`, `docs/CONTRACT.md` (including "v2 additions"),
  `docs/process/README.md`, `docs/process/TEMPLATE.md`. Files reviewed:
  - server: `server/index.js` (all routes: `/api/jobs`, `/api/job`,
    `/api/market`, `/api/export`, `/api/cities`, `/lib/*`, static),
    `server/cache.js`, `server/companies.js`, `server/sources/util.js`,
    `server/sources/greenhouse.js`, `server/lib-modules.js`,
    `server/compstimate-worker.js`, `server/history.js`, `server/export.js`,
    and `server/salary.js` / `server/vet.js` (bounds and FX only);
  - browser: `public/api.js`, `public/app.js` (helpers, storage, hash,
    saved searches, company menu, quickbar and Save chip, Listed filter,
    drawer with juice, comps and listing sections, sanitizer, keyboard,
    theme), `public/index.html`, `public/theme-init.js`,
    `public/features/shared.js` (`h()`), `public/features/*.js` (grepped for
    DOM sinks), `public/viz/comps.js`, `public/viz/map.js` (Pay|Juice control,
    pins), `public/viz/chart.js` (listbox), `public/styles.css`,
    `public/viz/viz.css`, `public/features/features.css` (focus, contrast,
    motion);
  - build and CI: `scripts/build-static.js` (packing, share pages, redirect
    script), `scripts/llm-vet.js`, `scripts/vet-salaries.js` (excerpt
    origin), `scripts/update-col.js` (fetch source), `.github/workflows/{ci,
    pages,snapshot,col-refresh}.yml`, `.github/scripts/ledger.sh`,
    `package.json`, `package-lock.json`.
- Tools: Playwright (scratchpad copy, Chromium at
  `/opt/pw-browsers/chromium-1194`, never `playwright install`), axe-core
  4.x from the same scratchpad `node_modules`, `curl`, `node`.

## 3. Checklist applied
- **Security:** SSRF through the custom board source/slug; static and `/lib/`
  path traversal; XSS sinks (description HTML, `innerHTML`, attribute sinks in
  both `h()` helpers, features/viz modules, share pages); open redirect
  (share-page redirect script); response headers on server and static;
  injection (CSV formulas, `${{ }}` in workflow `run:`, prompt injection
  into `llm-vet.js`); DoS and resource limits (cache bounds in entries and
  bytes, throttles, demo generation, worker threads, event-loop blocking,
  listener and DOM leaks); localStorage parsing and hash state; artifact and
  token trust in CI; supply chain (lockfile, action pinning, third-party data
  committed by CI).
- **Accessibility (new controls):** Save chip, company menu, Pay|Juice
  toggle, Juice waterfall, comps chart, Listed filter, theme toggle. For each:
  keyboard operation, focus after activation, name/role/state (axe plus a
  manual check of the accessibility attributes), contrast (axe plus computed
  ratios), reduced motion.
- **Re-check:** for every finding H1, M1-M5, L1-L11, C1-C3, read the cited
  code at `6a42334` and, where possible, reproduce the original issue.

## 4. Replayable steps
Pass 1:
1. Wait for `server/index.js`, `public/app.js`, `public/viz/chart.js` and
   `public/viz/map.js` to exist.
2. Read every in-scope file and trace each user-controlled input (query
   params, hash, localStorage, upstream job data) to where it is used.
3. Probe `safeJoin` with `../`, `%2e%2e/`, `..%2f`, `..\`, `%5c..`, `%00`,
   invalid percent-encoding and `//`.
4. Compute contrast ratios for the viz tokens.
5. Write each finding with file:line, a reproduction and a suggested patch.

Pass 2 (`S` = the session scratchpad,
`/tmp/claude-0/-home-user-melon-seek/<session>/scratchpad`):
1. Start the server with a scratch cache, so nothing is written to `data/`:
   ```sh
   cd /home/user/melon-seek
   MELON_CACHE_DIR=$S/cache PORT=5391 nohup node server/index.js > $S/server.log 2>&1 & echo $! > $S/server.pid
   ```
   Do not use `pkill -f "node server/index.js"`: the pattern matches the
   calling shell and kills it (exit 144). Use the pid file. There is no
   outbound network, so live fetches return 403 from the proxy and the server
   serves the snapshots.
2. Route probes (status, size, time):
   ```sh
   for u in "/api/jobs?company=anthropic" "/api/job?id=anthropic:xyz" "/api/job?id=greenhouse-foo:1" \
            "/api/job?id=__proto__:1" "/api/export?company=anthropic" "/api/market" "/api/cities" \
            "/lib/juice.js" "/lib/index.js" "/lib/..%2fpackage.json" "/lib/%2e%2e/package.json" \
            "/api/jobs?source=greenhouse&board=.." "/api/jobs?source=greenhouse&board=a..b" "//api/health"; do
     curl -s -o /dev/null -w "$u %{http_code} %{size_download}B %{time_total}s\n" "localhost:5391$u"; done
   curl -sI "localhost:5391/api/export?company=anthropic"     # security headers + Content-Disposition
   ```
3. Throttle check (H1): 5 × `/api/jobs?company=scaleai&refresh=1`, then
   count `[live] scaleai` lines in `server.log` (result: 1). The same check on
   a custom board `greenhouse/zznonexist` with `refresh=1` × 3 also gave 1.
4. Event-loop probes (V1, V15):
   ```sh
   # restart the server first (cold)
   curl -s -o /dev/null -w "market cold %{time_total}s\n" localhost:5391/api/market &
   for i in $(seq 1 8); do curl -s -o /dev/null -w "health %{time_total}s\n" localhost:5391/api/health; sleep 1; done
   ( for i in $(seq 1 40); do curl -s -o /dev/null "localhost:5391/api/job?id=greenhouse-f$RANDOM$i:1" & done; wait ) &
   for i in 1 2 3 4; do curl -s -o /dev/null -w "health during flood %{time_total}s\n" localhost:5391/api/health; done
   ```
   Results: cold market 24.5 s, with health at 9.1/2.3/2.2/1.2/2.1/4.3 s
   during it; 40-request flood, health 7.0 s; single `/api/job` on a new
   custom slug 115-230 ms.
5. Market recompute cost (`$S/market-bench.mjs`, run with
   `MELON_CACHE_DIR=$S/cache2 node $S/market-bench.mjs`): imports
   `server/index.js` and `server/cache.js`, times `getMarket()` cold (26.2 s),
   warm (7 ms), then after replacing one company's cache array with
   `setCached` (98 ms for anthropic, 124 ms for anduril).
6. CSV escaping (V10):
   `node -e 'import("./server/export.js").then(({csvCell})=>{for (const s of ["=1+1","\r=1"," =1+1","a;=1+1","=cmd|\x27 /C calc\x27!A0"]) console.log(JSON.stringify(s), JSON.stringify(csvCell(s)))})'`
7. Accessibility in Chromium (`$S/pw/review-a11y.mjs`,
   `review-a11y3.mjs`, `review-a11y4.mjs`; `cd $S/pw && BASE=http://localhost:5391 node review-a11y.mjs`):
   - context `{ viewport: 1400×900, bypassCSP: true }`. `bypassCSP` is
     needed to inject axe, because the server's CSP correctly refuses inline
     scripts. All non-localhost requests are aborted.
   - axe `runOnly: wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa,
     best-practice` on: the main view (`#c=anthropic&so=1`), the company menu
     (`#popover`), the drawer (`#c=anthropic&jg=Juicy`, first card), the map
     view (`#mapHost`), and the main view in dark mode with
     `reducedMotion: 'reduce'`;
   - keyboard: Enter on `#saveSearch` (state, name, focus, toast); Enter on
     `#companyMenuBtn`, ArrowDown ×2, Escape; `t` with focus on
     `#refreshBtn` (`data-theme` before and after); in the drawer, Enter on
     the inactive Monthly/Yearly button and then read `document.activeElement`;
     focus `.ms-comps__list`, ArrowDown, then Escape; on the map, focus the
     checked `.ms-modes__btn` and press ArrowRight; focus a
     `.ms-pin-icon[aria-label]` and press Enter (results title before and
     after); deep link `#c=anthropic&job=<first id>` (focused id,
     `#layout.inert`);
   - Listed filter on `?mock=1` (the real snapshots have no listing ages
     yet): open the section, focus the checked radio, ArrowDown, read the hash;
   - leak: count `body > .ms-viz-tip` before and after 5 × ArrowRight in the
     drawer;
   - computed styles: drawer `transitionDuration` under reduced motion, focus
     styles of `.range--lo`, `.company-item` and the radio dot.
8. Contrast ratios not covered by axe (focus halos), computed with the WCAG
   relative-luminance formula in `node -e` (alpha composited over the
   surface): the 35% accent halo on white is 1.67:1, 45% on the dark surface
   is 2.76:1, `--ms-faint` on white is 3.16:1 and on `#f0f2f5` is 2.82:1.
9. Share-page redirect (`$S/pw/review-share.mjs`): serve `dist/` with
   `python3 -m http.server 5417 --bind 127.0.0.1` (port 5392 was already
   taken), then open `/c/anthropic/` with hashes `''`, `#m=map`,
   `#c=openai`, `#//evil.example/x`, `#x/../../../evil` and
   `#%0d%0ajavascript:alert(1)`, and print the final URL. Every one stays
   same-origin (`/#c=anthropic[&m=map]`).
10. `npm test`: 255/255 pass.
11. Stop the servers: `kill $(cat $S/server.pid)` and kill the `http.server`.

## 5. Verification and results
- Re-check: 18 of 20 original findings are fixed. H1 and M2 are partially
  fixed (byte-unbounded memos, and no CSP on the Pages build). M1, M3, M4,
  L1, L6, C2 and C3 were confirmed by running them. The others were
  confirmed by reading the code at the cited lines.
- v2: 4 medium and 11 low findings (V1-V15), each with file:line, a
  reproduction and a patch in REVIEW.md "v2 review". Measured or reproduced:
  V1, V5, V6, V7, V8, V9, V10, V13, V15. Reasoned from code and docs, because
  they need GitHub or live boards: V2, V3 (`grep` of `dist/index.html`), V4,
  V11, V12, V14.
- Checked and fine: listed at the top of "v2 review".

## 6. Known gaps and follow-ups
- No outbound network, so live board fetches, the backtest worker on live
  custom boards (V4) and static-mode live fetches could not be exercised.
  V2 (fork-PR artifacts) was not reproduced on GitHub.
- The `dist/` used for the share-page test was the local build from 13:16
  UTC, which may lag `public/`. The redirect logic itself is in
  `scripts/build-static.js:377`.
- The Listed filter's real-data path is hidden until a history ledger exists
  (`Listing dates appear after a few daily runs.`). Only the mock data path
  was tested with the keyboard.
- Screen-reader output was inferred from the accessibility attributes and
  axe. No NVDA or VoiceOver run.
- Fixes go to the owning workstreams (see the README table): backend for
  V1, V4, V10, V15; devops for V2, V3 (build), V12; vetting for V11; ux for
  V5-V9, V13 (app side), V14; viz for V13 (comps.js).

## 7. Change log
- 2026-10-02 ~05:35 UTC: REVIEW.md written by the review agent.
- 2026-10-02: agent stopped on an API error; lead wrote this log from
  REVIEW.md.
- 2026-10-02 ~13:30 UTC: second pass by the review agent. "Re-check"
  table completed, "v2 review" (V1-V15) added to REVIEW.md, this log
  rewritten to cover both passes, re-check prompt appended to
  prompts/review.md.
