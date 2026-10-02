# QA report: melon-seek end-to-end suite (v2 UI)

Run on 2026-10-02 against the real server, `node server/index.js`, with the local
`data/snapshots/*.json`. Every company is served as `mode: "snapshot"` (Anthropic 638 roles,
Anduril 2418, OpenAI 833). Live boards, map tiles and Google Fonts are blocked in the sandbox.

## How to run

```sh
# Playwright is not a repo dependency. Use any install that resolves (see docs/process/qa.md):
npm i playwright --no-save            # or NODE_PATH=/path/to/node_modules, or PLAYWRIGHT_MODULE=...
node scripts/e2e.js                    # full suite: API, then Chromium UI
node scripts/e2e.js --api-only         # no browser needed
node scripts/e2e.js --grep=juice       # subset by test name
E2E_TEST_TIMEOUT=60000 node scripts/e2e.js   # per-test hard timeout (default 120s)
```

The script spawns `node server/index.js` on a free port. It uses the preinstalled Chromium
(`$PLAYWRIGHT_BROWSERS_PATH`, `/opt/pw-browsers`, or `$CHROMIUM_PATH`) and never downloads one.
Requests to external hosts are aborted. Screenshots go to `docs/screenshots/`. The exit code is 0 only
when every test passes, and `npm test` (249/249) does not pick these files up.

**Harness robustness (v2).** Each test has a hard timeout. An unhandled rejection or uncaught
exception during a test fails that test and the run moves on. This was the original crash: a
pending `waitForResponse` for a company pill that no longer exists. Every wait is registered right
before its action and wrapped in `guarded()`, so it rejects inside the awaiting test. A test whose
data is absent (for example, no quarantined salaries in demo mode) reports *skipped*, not failed.
Contexts left open by a failed test are closed through `ctx.cleanup`.

## Result: 32 of 33 passed, 1 failed

The results were identical across 3 full runs with Playwright 1.63 (scratchpad) and 1.56 (`/opt/node-tools`).
Demo mode (`MELON_SNAPSHOT_DIR=<empty dir>`) gives 31 passed, 1 failed and 1 skipped: "Pay unclear" is
skipped because demo data has no quarantined salaries.

| # | Test | Result |
|---|------|--------|
| 1 | API: `/api/companies` lists anthropic, anduril, openai | pass |
| 2-4 | API: `/api/jobs?company=…`: Job shape, `mode`, `meta.lazy`, `/api/job` detail (written by the backend agent, kept) | pass |
| 5 | **API: keyword facets are discriminative (no keyword on ≥95% of a company's jobs)** | **FAIL (BUG-5)** |
| 6 | API: demo deterministic (skipped internally when not demo) | pass |
| 7 | API: custom board `greenhouse/foo` falls back to demo | pass |
| 8 | API: 4xx errors, including `/api/job` 400/404 | pass |
| 9 | Static: `/`, leaflet, 404, no traversal | pass |
| 10 | UI: no console errors. Clusters is the default and shows bands; Ranges shows per-job bars (`v=ranges`, default omitted). Count equals the API count. Badge reflects the mode ("Snapshot · Oct 2") | pass |
| 11 | UI: map shows pins and the offline basemap note. **Pay\|Juice** toggle (Pay default; Juice checks the radio, enables the legend and recolours pins). Clicking a pin shows the area chip | pass |
| 12 | UI: map initial fit keeps every pin inside the map (was BUG-1) | pass |
| 13 | UI: **company menu** lists all 8 companies. Switching to Anduril, then OpenAI, gives counts equal to the API and the right hash. Earlier companies become recent pills. Search "open" + Enter switches | pass |
| 14 | UI: salary min slider. Every card meets the bound in approx USD (`palette.toUSD`), count equals the API count | pass |
| 15 | UI: a Skills chip narrows to exactly its facet count, and every card has the skill (checked against API data) | pass |
| 16 | UI: department filter (facet count, `.card-dept` on every card) | pass |
| 17 | UI: location filter (facet count, API locations) | pass |
| 18 | UI: **"Listed"** filter: options, Past 3 months equals its facet count (`p=90`), "Hide roles open 180+ days" (`ho=1`) | pass (see L1) |
| 19 | UI: **drawer**: Apply link. **Fixed section order** (Same role elsewhere > Listing > Location > Keywords > About the role > Full description) with at most 3 open, pay block first. **Honest-number caption** "Posted base pay. Equity and bonus aren't included." with at most 2 pay labels. **Lazy description through `/api/job`** (200, id echo, non-empty and sanitized text). Esc clears `job` | pass |
| 20 | UI: **salary gate "Pay unclear"**: the card pill tooltip and the drawer "Why?" both show the `salaryFlag.reason`; posting link present; no posted-pay caption | pass |
| 21 | UI: **Juice** badge format `🍉 ≈?NN · Grade`. **Most juice** sort (`sort=juice`) is descending with unscored roles last. **Waterfall**: Gross > Tax > Rent > Living > Juice left, adds up; Monthly is yearly/12; disclaimer link | pass |
| 22 | UI: **Same role elsewhere** rows include the current company. Clicking another company sets `c` and `rf` (and `s`), shows the "Role: …" chip, and the count equals the API jobs with that `roleFamily()`. Back restores `job=` | pass |
| 23 | UI: **Insights** mode: Compstimate and Market insights render; **Compare companies** row click sets `c` and `rf` | pass |
| 24 | UI: **Save** is hidden with no filter and shown with one. Saved state is stored in `melon.saved` and listed under "Saved searches" in the company menu; opening it restores the filter; a second click removes it | pass |
| 25 | UI: **Download CSV** (badge popover) gives `api/export?company=anthropic`: 200, `text/csv`, data rows = 638 (quote-aware count), and a download event | pass (see L3) |
| 26 | UI: hash round-trip: reload keeps company, skill, department, map mode and card order; deep link `#job=` opens the drawer; Back works | pass |
| 27 | UI: **theme toggle**: System > Light > Dark (`data-theme`, aria-label), dark persists across reload, `t` cycles back, and dark renders dark on a light OS | pass |
| 28 | UI: **dark mode** (OS dark): chart, ranges, map (Juice), insights and drawer have no page or console errors and dark luminance | pass |
| 29 | UI: 390x844 has no horizontal scroll (chart, map, filters sheet, company menu switch) | pass |
| 30 | UI: 390x844 visible buttons all have text or an accessible name (was BUG-2/BUG-3) | pass |
| 31 | UI: Add board (greenhouse/foo) opens a custom board | pass |
| 32 | UI: keyboard: Enter opens the drawer, Esc closes it and focus returns to the card | pass |
| 33 | UI: search box filters | pass |

Screenshots at 1440x900 (mobile at 390x844), all of real snapshot data:
`docs/screenshots/chart.png`, `map.png`, `drawer.png`, `mobile.png`, `dark.png`, plus
`map-juice.png`, `drawer-juice.png`, `insights.png` and `dark-drawer.png`.

## Status of earlier bugs
- **BUG-1, map initial fit clipped pins:** fixed and verified (test 12; `map.png` shows SF, London, Tokyo, Singapore and Sydney all in view).
- **BUG-2, Remote filter blank on mobile:** fixed (the rule is scoped to `.topbar`). Verified by test 30.
- **BUG-3, unnamed Chart/Map/Add board buttons on mobile:** fixed (`aria-label`s). Verified by test 30.
- **BUG-4, company pills clipped at 1440px:** fixed by the searchable company menu. Verified by test 13.
- Low items from last time (Apply label in demo mode, "100% percentile") are fixed: the drawer now reads "Top · paid here".

## Open bugs

### BUG-5 (major, data quality): company boilerplate becomes keywords on every posting
- **Owner:** `server/keywords.js` (`extractKeywords` scans the whole description `text`). The
  same effect shows in demo data from `server/demo.js` (Anduril "Autonomy" on 120/120 demo jobs).
- **Repro (API):** `curl -s localhost:5173/api/jobs?company=anthropic` and count `keywords.*` per job.
  Keywords on ≥95% of jobs:
  - anthropic: skills "Interpretability" 638/638, "Multimodal" 638/638, "Recruiting" 638/638; fit
    "Visa sponsorship" 638/638.
  - anduril: skills "Computer vision", "Networking", "Security", "Autonomy", "Sensor fusion" and
    "Recruiting", each 2418/2418.
  - openai: skills "Security" 833/833.
  - Outside the suite's three companies: cohere "LLMs" and "Security" 132/132, scaleai "Recruiting" 194/194,
    scaleai fit "US citizenship" 194/194.
- **Repro (UI):** open `/`. The first three Skills chips are "Interpretability 638", "Multimodal 638"
  and "Recruiting 638", and clicking one changes nothing (638 → 638). Every drawer lists them under
  Keywords, and they take card tag slots.
- **Cause:** the text comes from the shared "About Anthropic" blurb ("…reliable, interpretable, and
  steerable AI systems"), the "How we're different" paragraph ("…Multimodal Neurons…"), the
  recruiting-scam notice ("Anthropic recruiters only contact you from…") and the visa policy paragraph.
- **Fix idea:** before extracting, drop paragraphs that repeat across many postings on one board
  (board-level boilerplate detection in `server/normalize.js`). Or extract only from title, sections and
  bullets. Or drop any keyword present on ≥90% of a board's jobs.

### Low and informational
- **L1, "Listed" filter has no data (`public/app.js` `makePosted`; data: snapshots predate F4).**
  All 638/2418/833 snapshot jobs have `ageDays: null`, `postedAt: null` and `firstSeenAt: null`, and
  `meta.history` is `{since:null, runs:0}`. The Listed section still offers Past week, month and 3 months
  with counts of 0, and choosing one empties the list ("No roles match"). Suggested fix: hide or disable
  the section when no job has an age. Also re-run `npm run snapshot` once the F4 adapters are live
  (`scripts/snapshot.js`, `server/history.js`).
- **L2, doubled prefix in the data-badge tooltip (`public/app.js` `badgeInfo`, around line 574):** it reads
  "Live fetch failed: Live fetch failed: upstream returned HTTP 403". The server
  (`server/index.js` around lines 108-114) already prefixes the message, and the snapshot and cache
  branches add it again.
- **L3, CSV filename mismatch (`public/app.js` `csvLink` vs `server/export.js`):** the link sets
  `download="anthropic-jobs.csv"`, but the server's `Content-Disposition` wins
  ("melon-seek-anthropic-2026-10-02.csv"). Harmless, but one of them should be removed.
- **L4, data provenance on phones (`public/styles.css` around lines 599-602):** at 860px and below, a Snapshot,
  Live or Cached badge shrinks to a bare coloured dot (the label has opacity 0). Only demo keeps text. The
  snapshot date is then visible only after tapping. Consider a tiny label ("Snap") the way demo has one.
- **Google Fonts (`public/index.html`):** still an external stylesheet. It fails offline, falls back to
  system fonts and the suite ignores it.

## Coverage notes and gaps
- Live mode is not reachable here. Snapshot and demo modes are both exercised.
- Juice is attached client-side (`public/api.js` with `/api/cities` and `/lib/juice.js`). The suite
  checks its UI and arithmetic, not the cost-of-living inputs.
- Not covered: chart hover tooltips, cluster-bin selection chip, group-by, the
  seniority/employment/remote filters, the Juice grade chips in "More", drawer prev/next, the "New" and
  "Reposted" status tags (no history data), saved-search "N new" counts, and Refresh.
