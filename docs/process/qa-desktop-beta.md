# Process log: desktop QA, beta (2026-10-10)

## 1. Brief
- **Prompt:** [`docs/process/prompts/qa-desktop-beta.md`](prompts/qa-desktop-beta.md), pasted verbatim.
- **Goal:** a thorough functional QA pass of the desktop site for target `beta` (`/melon-seek/beta/` in a local
  build). Every feature in the brief was tested on Apple (6,105 postings), Google (3,417), NVIDIA (2,664),
  Microsoft (2,320) and Netflix (456), with Anduril (2,491) for comparison, at 1440x900, 1280x800 and 1024x768, light
  and dark. Server mode was checked with `MELON_CHANNEL=beta`.
- **Rules:** no product code changes, no commit, no push. Other QA agents were appending to `docs/QA.md` at the same
  time, so only my own section was written, after re-reading the file.
- **Files owned:**
  - `docs/QA.md`: the "Full QA pass (desktop, beta) 2026-10-10" section;
  - this log;
  - `docs/process/prompts/qa-desktop-beta.md`;
  - `docs/screenshots/qa-desktop-beta/`;
  - `test/e2e/beta-desktop-qa.e2e.js`, plus a two-line registration in `scripts/e2e.js`.

## 2. Inputs and sources
- **Docs read:**
  - `README.md`: the beta site section (bundle-only big-tech boards, `live: false`, the "Beta" pill, `noindex`,
    the crawl cadence, server mode with `MELON_CHANNEL=beta`) and the static build layout.
  - `docs/CONTRACT.md`: Job shape, the v2 fields and the "v3 additions" (beta channel, `live: false`, badge text).
  - `docs/QA.md` "Full QA pass (desktop) 2026-10-03" (D-1 to D-16), so nothing was re-filed. The D-2, D-3, D-4,
    D-6, D-7, D-10 to D-16 fixes were re-checked on beta and hold.
  - `docs/process/PLAYBOOK.md`, `docs/process/TEMPLATE.md`, and `docs/process/lead.md` "Persona review of the main
    site" with the P-1 to P-18 list in the fix-lane prompts, so those are referenced as "known (P-n)".
  - `docs/process/data-check-beta.md` (the beta data check, written at the same time): its DQ-1, DQ-8 and DQ-10 have
    the same root causes as D-17, D-21 and part of D-23. Those are cross-referenced instead of argued twice.
- **Code read** (read only, for selectors and owners): `public/app.js` (all of it), `public/api.js` (`staticJobs`,
  `bundled`), `public/viz/map.js` (aggregate, clusters, pins), `public/viz/chart.js` (bins, tooltips, `showJobTip`),
  `public/viz/palette.js` (`formatCurrency`), `server/companies.js`, `server/geo.js` (`regionInfo`, `resolvePlace`,
  `splitCommaGroups`), `server/salary.js` (zones), `server/sources/eightfold.js`, `google.js`, `apple.js`,
  `server/index.js` (`SNAPSHOT_DIR`, `readSnapshot`, `publicError`), `server/pipeline.js`, `test/e2e/harness.js`,
  `test/e2e/desktop-qa.e2e.js`.
- **Tools:** Playwright 1.63 from `<scratchpad>/pw/node_modules`, Chromium 141 at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, axe-core 4.13. No skills were needed; no external URLs
  (the sandbox blocks them; grey map tiles and the stable boards' failed live fetch are expected).

## 3. Decisions and rationale
1. **Build under test.** `node scripts/build-static.js --out <scratch>/qa-desktop-beta/dist` at HEAD `91fb7ae`
   (the shared checkout later moved to `125bf64`, which only touched two tests). The build printed
   `beta: 5/5 beta companies included` and the expected warning that Apple's list is 2.55 MB (budget 1.50 MB).
   It was served with `scripts/cycle/serve.mjs` (gzip, like Pages). The e2e file instead serves the lead's shared
   `dist/` (it never writes it), so a rebuild after a fix is what the tests see.
2. **Truth source for counts and order:** the app's own `public/api.js` `getJobs()` and `viz/palette.js` `toUSD`,
   imported in the page, as in the 2026-10-03 pass. The raw snapshots in `data/beta/snapshots/` were read only to
   find root causes (raw location strings, pay text).
3. **What counts as a beta bug.** Big-tech boards bring new data shapes (Eightfold "City, Region, CC" locations,
   per-level pay sentences, Google's record format) and sizes (four boards over 2,000 postings). Bugs that only
   these expose were filed even when the owning code is shared with the main site (D-18, D-29).
4. **Overlap with the data check.** The data-check agent found the location and per-level pay problems at the data
   level (DQ-1, DQ-8, DQ-10) with unit tests. I kept D-17, D-21 and D-23 for their user-visible effect on the
   desktop (filter groups, map pins, drawer) because the e2e tests check the built site, which also needs the build
   to re-geocode old snapshots. The lead should fix each once.
5. **Timing.** No CPU throttling (the mobile perf agent owns that). Times are wall clock around a Playwright
   action until the DOM changed, plus long tasks from a `PerformanceObserver`. The machine was shared (load 3 to 13),
   so the numbers are an upper bound, and the e2e guard uses a generous 4 s limit.
6. **Severity:**
   - **High:** wrong data in the main views for a large share of a board (D-17: about a quarter of NVIDIA).
   - **Medium:** misleading pay or counts, or a feature that breaks on one path (saved searches, server mode).
   - **Low:** copy, labelling, polish, or a product decision the contract left open (D-27, D-28).
7. **Not filed** (by design, expected in the sandbox, or already known):
   - grey map tiles and the stable boards' blocked live fetch (sandbox);
   - the `[London]`-style title tag handling, one recent pill below 1600 px (design, D-pass 2026-10-03);
   - every P-1 to P-18 symptom seen on beta: Compstimate "Senior · Tel Aviv-Yafo" from US pay (P-2), "Mid" (P-3),
     "0% percentile" (P-16), "(update due)" (P-14), intern hourly pay annualized (P-8), Juice "Juice left" bar red and
     monthly rounding (P-18), US pay on non-US pins (P-6), Compare mixing levels (P-10);
   - data-check items without a desktop-only angle: Apple per-location copies (DQ-2), Netflix L-levels as "Mid"
     (DQ-3), cities without Juice (DQ-4), NVIDIA "#LI-Hybrid" roles flagged remote (DQ-12), Apple store names pinned
     at the US centroid and double-encoded links (DQ-9).
8. **e2e convention**, as in `desktop-qa.e2e.js`: guard tests that pass today plus one `[D-n]` test per bug that fails
   until it is fixed. Every test skips when `dist/beta/` is missing; data-dependent tests skip when the needed job
   isn't in the data. Each test serves `dist/` itself on a free port under `/melon-seek/` and closes it in
   `ctx.cleanup`.

## 4. Replayable steps
`SP` is the session scratchpad, `Q=$SP/qa-desktop-beta`. Playwright: `NODE_PATH=$SP/pw/node_modules`.
```sh
mkdir -p $Q docs/screenshots/qa-desktop-beta
cp $SP/prompt-qa-desktop-beta.md docs/process/prompts/qa-desktop-beta.md
node scripts/build-static.js --out $Q/dist                    # 2m09s; "beta: 5/5", Apple 2.55 MB warning
nohup node scripts/cycle/serve.mjs --dist $Q/dist --pid $Q/serve.pid > $Q/serve.log 2>&1 &   # prints the port
MELON_CHANNEL=beta PORT=<free> nohup node server/index.js > $Q/server.log 2>&1 & echo $! > $Q/server.pid
```
**Exploratory scripts** (`$Q/qa/*.mjs`, helpers in `lib.mjs`; all at 1440x900 unless stated):
- `data.mjs`: per-company facts through the app's `getJobs` (counts, currencies, levels, zones, remote flags, hosts).
- `a.mjs`: company menu (search, Enter, Esc), recent pills, Add board (custom, invalid slug, reload, remove).
- `b.mjs`: search ranking ("engineer", "software engineer", "manager", "data") and every sort, on the 5 boards.
- `c.mjs`: every filter on the 6 boards: facet sums, pick = facet count, Remote, keyword chips (AND), salary
  switch and typed bounds, More (employment, Juice, Listed), Clear all. Writes `$Q/loc-<slug>.json`.
- `d.mjs`: map: pins in view, tooltips inside the map, area chip, Remote control, Pay|Juice legend, zoom, resize with
  the drawer open.
- `e.mjs`: chart: cluster tooltip, chip, facets inside the cluster, overflow markers, keyboard, Group by, Ranges.
- `f.mjs`, `f2.mjs`: drawer on 11 chosen postings (multi-level, wide, hourly, CZK, CAD, Pay unclear, no pay), the
  waterfall sum, Monthly, households, comps, listing, keywords, lazy description, Apply; copy link, j/k, Esc, Back;
  "Same role elsewhere" click and Back.
- `g.mjs`, `g2.mjs`: Save and "N new", CSV, Refresh, theme, the main site sharing storage, hash round trip, deep
  links, Back/Forward, shortcuts while typing, share pages.
- `i.mjs`: Insights: Compstimate prefill and "Reset to filters", Market insights clicks, Compare companies.
- `h.mjs`: 3 viewports x 2 themes x 3 views: horizontal scroll, top-bar overlap, popovers and drawer inside the
  viewport, axe color-contrast. `m.mjs`: methodology links. `beta.mjs`: bundle-only boards, paused companies.
- `p.mjs`: timings (table in docs/QA.md). `s.mjs`: server mode. `evidence.mjs`, `evidence-server.mjs`: the
  screenshots in `docs/screenshots/qa-desktop-beta/`.

Results, as PASS/FAIL lines:

| Script | Result | Notes |
|---|---|---|
| `a` | 15/15 | |
| `b` | 45/45 | |
| `c` | 150/150 | |
| `d` | 13/13 | |
| `e` | all pass | 5 checks per board |
| `f` | 10/12 | 2 test artifacts: `j` was pressed while focus was on the Copy link button, which V7 rightly ignores. `j` right after opening passes in `g`. |
| `f2` | 4/4 | |
| `g` | 15/17 | 1 is D-18. 1 is a test artifact: a default `m=chart` is normalised away on reload. |
| `h` | 92/92 | |
| `i` | 10/10 | |
| `m` | 2/2 | |
| `beta` | 17/22 | The 5 failures were my badge regex, which also read the screen-reader text; the badge label itself was right. |

The bugs themselves were found from the logged output (location keys, pay blocks, menu rows), not from FAIL lines.

```sh
node scripts/e2e.js --grep='^Beta desktop QA'      # 5/19: the 5 guards pass, the 14 [D-17]..[D-30] fail
npm test                                           # see docs/QA.md "Suite results"
node scripts/e2e.js                                # full suite
kill "$(cat $Q/serve.pid)"; kill "$(cat $Q/server.pid)"
```
The full e2e suite rewrites `docs/screenshots/*.png` (the UI suite's own shots). Those 9 files were copied to
`$Q/shots-backup/` before the run and restored after it, so this pass leaves them unchanged.

## 5. Verification
- `node scripts/e2e.js --grep='^Beta desktop QA'`: 5/19 pass; the 14 failures are exactly `[D-17]` to `[D-30]`.
- `npm test`: 601/627. The 26 failures are all the data check's `DQ-1`…`DQ-17` tests
  (`test/beta-data-check.test.js`), which fail by design until those are fixed.
- `node scripts/e2e.js` (full, with the beta mobile group registered by its agent): 112/140, 2 skipped.
  - The 26 failures are my 14 `[D-n]`, the beta mobile group's 11 `[M-19]`…`[M-29]`, and that group's guard
    "every big-tech board loads from its snapshot…", which fails on its own CSV-link check.
  - Every 2026-10-03 test passes.
- After my edits, `node --test test/cycle.test.js test/features.test.js test/freshness.test.js test/methodology.test.js`
  (the tests that read docs): 101/101.
- Screenshots: `docs/screenshots/qa-desktop-beta/D-17-*.png` to `D-30-*.png`, at 1440x900 unless the name says
  1280 or 1024, light unless it says dark. Each was looked at.
- Manual review of the exploratory screenshots (`$Q/shots/`): every view at the three widths in both themes, the
  NVIDIA map zoomed to the US, the Google chart, the drawers listed in `f.mjs`.

## 6. Known gaps and follow-ups
- Live fetches, map tiles and the careers hosts can't be reached from the sandbox. The Apply URLs look right but were
  not opened.
- The remote flag of NVIDIA and Microsoft can't be checked against the raw Eightfold field (not stored; DQ-12).
- Google Canada currency (D-22): the structured range has no currency. "(CAD)" in the text proves one case; the
  other 52 Canada-only ranges are very likely CAD but weren't checked against the live page.
- Timings were taken on a shared, loaded machine. The mobile perf agent should measure Apple's 2.55 MB list on a
  throttled phone.
- D-27 and D-28 depend on a product decision: CONTRACT v3 says the beta page shows "a small Beta tag by the logo and
  nothing else new".

## 7. Change log
- 2026-10-10 12:35 UTC: build and servers up; exploratory scripts a to i.
- 2026-10-10 13:25 UTC: `test/e2e/beta-desktop-qa.e2e.js` (19 tests) registered; group run 5/19 as designed.
- 2026-10-10 13:28-13:40 UTC: full e2e suite (112/140); `docs/screenshots/*.png` restored afterwards.
- 2026-10-10 13:41 UTC: timings re-run at load 10.7 (table in docs/QA.md), evidence screenshots, docs/QA.md
  section appended. Both servers stopped.
