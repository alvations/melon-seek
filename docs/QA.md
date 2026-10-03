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

---

## Improvement audit (wave 1)

This is a read-only audit of the product code at commit `2e6e4cf`. The viz and styles files were being edited
in the working tree while it ran, so a finding may already be fixed by the time you read it.

**Setup:**
- Real server: `node server/index.js` on :5311 with local snapshots.
- Static build: `npm run build`, then `dist/` served under `/melon-seek/` with gzip by
  `docs/process/scripts/qa-audit-static-server.mjs` on :5310.
- Browser: Playwright Chromium 141 with external hosts blocked.
- Desktop is 1440x900. The "phone" is 390x844 at DPR 2 with touch and 4x CPU throttling (CDP
  `Emulation.setCPUThrottlingRate`).
- Scripts are in `docs/process/scripts/qa-audit-*.mjs`. Screenshots are in `docs/screenshots/audit/`.

### Performance numbers

Each row is a cold browser context opened at `#c=<company>`. The columns are:
- **Chart paint:** the first `.ms-crow__band` appears, in ms from navigation start (via MutationObserver).
  Cards and filter chips appear in the same frame.
- **Filter:** click a Skills chip until the results title repaints.
- **Drawer:** click a card until the drawer title paints.
- **Switch:** change to the next company (by hash, the same code path as the menu) until its chart and cards paint.
- **Long tasks:** count, maximum and total, from PerformanceObserver `longtask` over 50 ms.
- **JS / JSON:** encoded bytes on the wire (gzip) for the initial load.

| Mode | Device | Company (jobs) | FCP | Chart paint | Filter | Drawer | Switch → | Long tasks (n / max / Σ) | JS / JSON KB | Requests | DOM nodes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| server | desktop | Anthropic (638) | 232 | 880 | 49 | 51 | Anduril **16 504** (cold) | 5 / 687 / 1025 | 196 / 77 | 26 | 10.6k |
| server | desktop | Anduril (2418) | 4028 (server busy) | 4812 | 332 | 96 | OpenAI 967 | 8 / 429 / 1576 | 196 / 233 | 26 | 14.3k |
| server | desktop | OpenAI (833) | 244 | 883 | 74 | 68 | Anthropic 235 | 5 / 156 / 475 | 196 / 120 | 26 | 7.0k |
| server | phone | Anthropic | 588 | 1968 | 494 | 293 | Anduril 3229 | 14 / **2162** / 5076 | 196 / 77 | 26 | 14.5k |
| server | phone | Anduril | 428 | 2948 | **753** | 352 | OpenAI 1241 | 14 / 1820 / **6016** | 196 / 233 | 26 | 29.7k |
| server | phone | OpenAI | 432 | 1908 | 177 | 194 | Anthropic 692 | 15 / 771 / 2610 | 196 / 120 | 26 | 10.1k |
| static | desktop | Anthropic | 136 | 462 | 57 | 45 | Anduril 455 | 4 / 336 / 585 | 250 / 55 | 38 | 11.7k |
| static | desktop | Anduril | 144 | 794 | 185 | 102 | OpenAI 237 | 7 / 372 / 1223 | 250 / 149 | 38 | **36.6k** |
| static | desktop | OpenAI | 188 | 876 | 60 | 45 | Anthropic 196 | 4 / 196 / 449 | 250 / 89 | 38 | 12.9k |
| static | phone | Anthropic | 288 | 1440 | 214 | 234 | Anduril 2317 | 12 / 1844 / 3730 | 250 / 55 | 38 | 16.9k |
| static | phone | Anduril | 324 | 2730 | 554 | 402 | OpenAI 930 | 15 / 1440 / 5311 | 250 / 149 | 38 | 13.2k |
| static | phone | OpenAI | 376 | 1579 | 236 | 188 | Anthropic 619 | 12 / 577 / 2209 | 250 / 89 | 38 | 13.4k |

Server cold start, measured with `curl` on a fresh `node server/index.js`:
- `/api/jobs`: Anduril 5.4–11.5 s, Anthropic 3.2 s, OpenAI 4.0 s on the first request; 1–2 ms after that.
- `/api/market` takes 8.2 s on its first request.
- In Node, `rekeyBoardJobs()` takes Anthropic 3036 ms, Anduril 10 198 ms and OpenAI 3255 ms. JSON parse is
  only 109–459 ms.

Desktop CPU profile (`qa-audit-prof.mjs`), self time during load: `viz/chart.js render()` 49 ms
(Anthropic) and 231 ms (Anduril), `features/roles.js expandTitle` 11–36 ms, `lib/juice.js` 29–45 ms.

### Findings

Severity scale: **High** means it blocks or misleads the core task. **Medium** means friction or a wrong
impression. **Low** means polish. All fixes stay within ROADMAP §8: no new main-view controls, no new
modes, and changes go in existing selects, popovers or the drawer.

| ID | Sev | Finding | Evidence | Owner | Suggested fix |
|---|---|---|---|---|---|
| **PERF-1** | High | The server's first request per company runs `rekeyBoardJobs()` synchronously for 3–10 s and blocks the event loop. Every other request waits, including static HTML: an unrelated page's FCP rose to 4.0 s and a company switch took 16.5 s. "Same role elsewhere" and Compare companies wait 8.2 s for `/api/market`, which needs all 8 boards. | Table above, plus the curl and Node timings | `server/index.js` `readSnapshot()`, `server/keywords.js` `rekeyBoardJobs` | Rekey once when the snapshot is written (`scripts/snapshot.js`), or cache the rekeyed result on disk keyed by snapshot mtime. At minimum, warm every company at startup in a `worker_thread`, so requests never pay for it. |
| **PERF-2** | Medium | On a mid-range phone the first chart takes 1.4–2.9 s, a single long task reaches 1.4–2.2 s (total main-thread blocking 2.2–6.0 s), and a filter tap on Anduril takes 554–753 ms, well past a 200 ms INP target. | Phone rows above | `public/viz/chart.js` `render()` (DOM rebuild), `public/app.js` `render()` | Render the cards and stats line first and the chart in the next idle callback. Make Clusters re-render only the rows that changed. Skip `renderFilterPanel()` sync while the filter sheet is closed on phones. |
| **PERF-3** | Low | JS sent to the browser is 196 KB gz in 26 requests (server) and 250 KB gz in 38 requests (static), all loaded up front. Leaflet (43 KB gz) is render-blocking in `<head>` although Chart is the default. The static build also loads `lib/demo.js`, `keywords.js`, `salary.js`, `vet.js` and `sources/*` (about 55 KB gz), which are needed only for the live or demo fallback. | `qa-audit-reqs.mjs` output | `public/index.html`, `public/api.js` | Load `leaflet.js`/`.css` on the first switch to Map, and load demo and normalizer libs only when the snapshot is missing. Optionally add `<link rel=modulepreload>` for app.js's direct imports. |
| **PERF-4** | Low | DOM is large: 36.6k nodes (static desktop Anduril) and 29.7k (server phone Anduril). | Table above | `public/viz/chart.js`, `public/app.js` filter checklists | Cap the rendered Location and Department options as the cloud already does, and virtualise Ranges rows. |
| **UX-1** | High | "Highest pay" sorts by the top of the range. For the task "best-paid ML role in SF", the top 5 are Engineering Manager postings at $405K–850K ("Wide range 2.1×"), not ML engineers. Wide bands always win. | `audit/04-location-sf.png`, `05-drawer.png` | `public/app.js` `sortJobs()` | Sort by approx-USD **midpoint** and keep the label "Highest pay", or relabel it "Highest top of range". This changes an existing option, so it stays within the sort-select budget. |
| **UX-2** | High | Search "machine learning" matches 270 of 638 roles (42%), including managers and sales, because it searches every keyword tag. There is no hint why a role matched. | `audit/02-search-ml.png` | `public/app.js` `prepare()` `_hay`, `failures()` | Rank title and team matches first (or match title and team only, and leave keywords to the chips). Add "· N in title" to the results title. |
| **UX-3** | High | Location options are noisy. Four "Remote-Friendly…" variants (US, Travel Required, United States, Travel-Required) are listed above San Francisco, and "Tokyo" and "Tokyo Prefecture" appear separately. | `audit/03-location-popover.png` | `server/geo.js` (canonical names), `public/app.js` `locKey` | Canonicalise remote variants to "Remote (US)" or "Remote" with the country, and collapse prefecture or region duplicates into the city. Sort cities before Remote, or keep Remote as its own group at the end. |
| **UX-4** | High | "Same role elsewhere", then OpenAI, drops the user's context. Location=San Francisco and the "machine learning" search are reset and replaced by `s=Manager&rf=eng-manager` (the family of the clicked job, not what the user searched). The comparison is no longer like-for-like. | `audit/06-drawer-scrolled.png` → `07-after-openai-pick.png` (hash `#c=openai&s=Manager&rf=eng-manager`) | `public/app.js` `pickCompany()` | Carry `l`, `r` and `q` over when the target board has matching roles; otherwise drop them and say so in the toast ("No SF roles at OpenAI, showing all locations"). |
| **UX-5** | Medium | In the drawer, "Same role elsewhere" sits below the fold at 1440x900 (under the pay block and the full Juice waterfall) and shows a skeleton for seconds on a cold server. | `audit/05-drawer.png`, `06-drawer-scrolled.png` | `public/app.js` `juiceBlock()` | Collapse the Juice block to its headline ("🍉 97 · $291K/yr left in SF") with the waterfall in a `<details>`. That keeps the §8 order but moves comps up. PERF-1 removes the wait. |
| **UX-6** | Medium | Jargon with no plain-language label where it first appears: "Compstimate" (Insights heading), "Juice Score / Juicy / Ripe / Dry", "P25 to P75", "P5–P95 board pay spread", "≈ 46,809 Big Macs/yr", and the unexplained "[DH]" title prefix (source data). | `audit/10-insights.png`, `05-drawer.png` | `features/compstimate.js`, `features/insights.js`, `public/app.js` | Use subtitles such as "Compstimate: estimated pay from similar roles" and "Juice: what's left after tax, rent and living". Replace P-notation with "middle 50%" or "typical range". Drop Big Macs or move it into the "How it's calculated" link. Naming stays as decided in ROADMAP D5. |
| **UX-7** | Medium | Juice barely discriminates at the pay levels this site is about. Every top card reads 91–99 "Juicy". OpenAI EM roles: Juicy 21, Ripe 0, Dry 0. As a sort or filter it then adds little beyond pay. | `audit/11-more-popover.png`, `phone-05-insights.png` | `server/juice.js` `SCORE_ANCHORS` / `scoreFromNet` | Move the anchors up (score 100 at a higher net, not about $250K), or score relative to the board's distribution. Show net $ on the badge tooltip as the primary figure. |
| **UX-8** | Medium | After Save, saved searches can only be found in the company menu (the toast says so once). Nothing on the main view lists them, and the "Saved" chip only un-saves on click. | `audit/08-save.png`, `09-company-menu.png` | `public/app.js` `toggleSave()` | Make the pressed "Saved" chip open a small popover (existing popover system) with this search's status ("Remove", "N new") and a link to all saved searches. No new control. |
| **UX-9** | Medium | Insights Compstimate ignores the active filters (Manager, Engineering management) and silently estimates for a default "Software Engineer" with an empty Role title field. | `audit/10-insights.png` ("Weighted by similarity to 'Software Engineer'") | `features/compstimate.js` widget, `public/app.js` `renderInsights()` | Prefill the role title and level from the search or role filter and seniority. When defaulting, say so in the field ("e.g. Software Engineer"). |
| **UX-10** | Medium | On phones, choosing Insights (or Map) leaves the results bottom sheet open, covering the view. The user sees cards, not the insights they tapped. | `audit/phone-05-insights.png` | `public/app.js` mode click → `setSheet(false)` | Collapse the sheet whenever the mode changes. |
| **UX-11** | Low | The "Role: Engineering management" chip is rendered twice (quickbar and above the results list), and so is the area chip. | `audit/07-after-openai-pick.png` | `public/app.js` `renderQuickbar()` | On desktop, render it in the quickbar only. Keep the list slot for phones, where the quickbar scrolls. |
| **UX-12** | Low | The Clusters chart (the default view) has no explanation of what the bubbles and numbers mean (count per pay band). First-time users read "8 · 8 · 11" without a key. | `audit/01-landing.png` | `public/viz/chart.js` header | One muted caption line in the existing chart header: "Bubbles = roles per pay band; bigger = more roles". |
| **UX-13** | Low | On phones the Chart, Map and Insights switch is icon-only (the labels are hidden). The Insights bar-chart icon is hard to tell apart from Chart. | `audit/phone-01-landing.png` | `public/styles.css` (`.topbar .seg button span` at ≤1020px) | Keep the labels at ≥360px with smaller type, or a two-letter label under each icon. |
| **UX-14** | Positive | Empty states are clear: Listed says "Listing dates appear after a few daily runs." Pay unclear explains itself with "Why?". | `audit/11-more-popover.png` | — | — |
| **A11Y-1** | High | Contrast fails WCAG AA (4.5:1) on the faint text token in light mode. `#8a91a0` is 3.16:1 on white (facet counts, Juice disclaimer) and 2.82:1 on surface-2 (the honest-pay caption, `.kw-count`). Others: Remote tag 4.48:1, Apply host 4.3:1, an insights subtitle 3.07:1, and in dark mode the chart bin-dot labels `#e9ecf2` on `#7f7e7a` at 3.43:1. axe reported 10–28 nodes per view. | `qa-audit-a11y.mjs` (axe-core 4.x) | `public/styles.css` `--ms-faint`, `.tag--remote`, `.apply-host`; `public/viz/viz.css` `.ms-bin__dot`; `features/features.css` | Darken `--ms-faint` to about `#6b7280` (4.8:1 on white, 4.3:1 on `#f0f2f5`; use `--ms-muted` on surface-2). Darken the bin-dot fill in dark mode, or use dark text on it. |
| **A11Y-2** | Medium | Keyboard: opening the Seniority quick-filter leaves focus on the chip. `togglePopover()` focuses the checklist's hidden search input (shown only above 8 options), so the focus call silently fails. Salary, Department, Location, Remote and More are fine. | `qa-audit-kbd2.mjs`: `sen -> BUTTON chip in-popover=false` | `public/app.js` `togglePopover()` | Use the first *visible* focusable (`:not([hidden] *)`, or check `offsetParent`). |
| **A11Y-3** | Medium | It takes 115 Tab stops to reach the first result card without the skip link (the whole filter column comes first). The page has no `<h1>` (axe `page-has-heading-one`). | `qa-audit-kbd.mjs` | `public/index.html` | Add a visually hidden `<h1>` ("Anthropic jobs by salary"). Add a second skip link "Skip to filters" or "Skip to chart", or put results before filters in DOM order on desktop. |
| **A11Y-4** | Low | axe `aria-allowed-role`: `article role=button` on every card (60 nodes) and `aside role=dialog` for the drawer. On Insights, `landmark-unique` for the three `<section aria-label>`, which collide with the inner card sections' labels. | `qa-audit-a11y.mjs` | `public/app.js` `card()`, `public/index.html` | Use `<div role=button>` (or a real `<button>` wrapping the title) and `<div role=dialog>`. Give the host sections distinct labels or drop the outer labels. |
| **A11Y-5** | Low | Small touch targets at 390px: the salary range inputs are 22 px tall and the "Only show jobs with salary" switch is 36×21 px (WCAG 2.5.8 asks for 24 px). | `qa-audit-phone.mjs` | `public/styles.css` `.range`, `.switch` | Give them a 24 px minimum hit area (padding or `::before` hit slop). |

Keyboard flow otherwise works:
- The skip link, company menu (Enter, type, Enter), card Enter and Esc with focus return all pass.
- The drawer traps focus.
- The salary slider responds to arrow keys (`smin` updates) and shows a focus halo on the thumb (`audit/kbd-slider-focus.png`).
- Map pins have `tabindex=0`.
- Dark-mode axe on the drawer reports no contrast issues.

---

## Compstimate task force: e2e group (spec: `docs/process/compstimate-taskforce.md` §3.3)

The suite has a "Compstimate:" group in `test/e2e/ui.e2e.js` (`registerCompstimateTests`). It has one test per matrix
scenario (T1–T23, with T14 checked inside T13) plus a drawer = Insights consistency test, all run against
the real server and snapshot data. Run it alone with `node scripts/e2e.js --grep='^Compstimate:'`.

| Stage | Tree | Compstimate group | Whole suite |
|---|---|---|---|
| 1. Matrix automated (product's fix partly in the working tree) | 14:05 | 11/23 pass. Failing: T1–T7 (basis text, filters not followed), T15, T19, T20, T23, consistency | not run |
| 2. After product's fix (compstimate.js 14:09, app.js 14:17) | 14:20–14:40 | **20/23 pass**. Failing: T15, T20, consistency | 52/56 (with intermittent BUG-6 and an Insights timing flake, since made robust) |

**Still failing (product bugs):**
- **CT-1 (T15 and consistency): the drawer can estimate for a location that Insights cannot select.**
  - Owner: `public/features/compstimate.js` `fillOptions` and `locationOptions(salaried)`.
  - The widget's Location options list only locations that have salaried roles. The drawer, under Rule 8, passes
    the job's own first on-site city.
  - Example: AE - DNB in Singapore. Anthropic has no salaried Singapore roles, so the widget has no "Singapore" option, while
    the drawer estimates "for Singapore". The same happens for 3 of 3 OpenAI no-salary jobs (Tokyo, Mumbai, …).
  - Result: the Rule 8 equality guarantee can't hold.
  - Fix: list every board location (salaried count, possibly "(0)"). Alternatively, have the drawer drop a location
    that has no salaried roles and say so.
- **CT-2 (T20): "Same role elsewhere" → OpenAI shows "Not enough comparable roles".**
  - Owner: `compstimate.js` auto-title selection.
  - The hash is correct: `c=openai&rf=swe&s=Senior`.
  - With rf=swe and s=Senior, the following auto title is "GPT Infrastructure Lead", and `estimateComp` finds n < 3 for it.
    The pool, however, holds dozens of salaried Senior SWE roles. So the widget says "Not enough" with no basis line, instead of
    "Based on N similar roles at OpenAI, Software engineering · Senior".
  - Fix: pick the auto title by role family (`FAMILY_TITLES`) or by the most common *normalized* title with n ≥ 3, not a
    raw title that happens to win a tie.

**Found along the way:**
- **BUG-6 (A11Y, intermittent in the full suite): any re-render drops keyboard focus to `<body>`.**
  - Owner: `public/app.js` `renderResults()`, which rebuilds every card.
  - Repro: Tab to a card, then change Group-by, or let any background render fire (for example after closing the drawer). Focus
    goes from the card to BODY (`qa-audit` probe; the keyboard e2e test fails about 1 run in 3 in the full suite).
  - Fix: reuse card nodes by id, or after `replaceChildren` re-focus the card with the same `data-id` when the old one had focus.
- **Test-side updates for intentional UI changes:**
  - Company menu rows are plain `.company-item` buttons with `aria-current`.
  - Save/Saved is a label plus `.is-saved` (review V9, no aria-pressed).
  - The Juice waterfall sits in `details.juice-details` (UX-5).
  - Insights cards now get up to 8 s to fill.

---

## Full QA pass (mobile) 2026-10-03

A functional pass of the phone site by the mobile QA agent. The process log, with every replayable command, is in
[`docs/process/qa-mobile.md`](process/qa-mobile.md). No product code was changed.

**Setup**
- **Static build** (what users get): `npm run build`, then `dist/` served under `/melon-seek/` by
  `docs/process/scripts/qa-audit-static-server.mjs`. Most testing used this build.
- **Server mode** (`node server/index.js`): spot-checked for chart, filters, job page, map, Insights and CSV.
- **Data:** local snapshots, so every board is `mode: "snapshot"`.
- **Browser:** Playwright Chromium 141 with `isMobile`, `hasTouch` and DPR 3, with external hosts blocked.
  - Devices: 360x740 Android, 390x844 and 430x932 iPhone UA, 844x390 landscape iPhone UA.
  - Each device ran in light and dark.
- **Gestures** are real touch input: `touchscreen.tap`, plus CDP `Input.dispatchTouchEvent` for drags, flicks and
  two-finger pinch.
- **Simulations:**
  - Safe areas: CDP `Emulation.setSafeAreaInsetsOverride` (portrait top 47 / bottom 34; landscape left and right 47 / bottom 21).
  - On-screen keyboard: `visualViewport.height` overridden to `innerHeight − 336` while a field has focus, with a
    `resize` event fired.

**New e2e tests:** [`test/e2e/mobile-qa.e2e.js`](../test/e2e/mobile-qa.e2e.js), registered in `scripts/e2e.js`.
Run them with `node scripts/e2e.js --grep='^Mobile QA'`. Result: **5/8 pass**. The 3 failures are tests tagged
`[M-1]`, `[M-3]` and `[M-4]`, which encode open bugs below and should pass once those are fixed.

### What works on phones

- **Every screen, device and theme:** no console or page errors, no horizontal page scroll, and no input under
  16px, so iOS doesn't zoom on focus. That includes the Compstimate fields, search, the company search and the
  filter searches.
- **Top bar:**
  - The company menu is a full-width bottom sheet. Typing "open" + Enter and tapping a row both switch company,
    with the right count and hash.
  - The data badge popover opens and closes on an outside tap.
  - Theme cycles System > Light > Dark.
  - Chart, Map and Insights switch views, and each switch collapses the sheet to peek.
- **Quick chips:**
  - The row scrolls sideways under a swipe and the page doesn't move.
  - Salary, Department, Location, Seniority and Remote open the filter sheet scrolled to their section. More
    opens its own sheet; Juicy gives 501, and "See 501 roles" is correct.
- **Filter sheet:**
  - The salary thumbs follow a touch drag ($410K–$695K).
  - The salary-only switch, checklists, the Remote segment and keyword chips all work.
  - "Show N roles" always equalled the results count. I checked one stack independently against `/api/jobs`:
    salary 202 → department 48 → Mid 37 → on-site 37 → LLMs 29, the same as the app.
  - Reset clears everything, including the slider and search. ✕ closes.
- **Results sheet:**
  - A slow drag snaps peek → half → full.
  - Flicks above 0.6 px/ms go one snap further: peek → half, and full → half.
  - The full list scrolls natively and lazy-loads (24 → 44 → 208 cards on Anduril).
  - A card tap opens the job page.
  - All five sort options reorder the list and update `sort=` in the hash.
- **Chart:**
  - Tapping a cluster bin gives an area chip, e.g. "AI Research & Engineering · $300K–$400K (16)", and the sheet
    shows the 16 roles.
  - Tapping a row label gives the whole row (69).
  - A Ranges row tap opens the job.
  - No information is hover-only on the main path.
- **Map:**
  - One-finger pan and pinch move only the map: `scrollY` 0, `visualViewport.scale` 1, and clustering went from
    4 to 8 pins.
  - A pin tap selects the area (Sydney, 10).
  - Pay|Juice recolours the pins.
  - The Remote badge gives "Remote (71)".
- **Insights:** Compstimate re-estimates as you type. A Compare companies row switches to OpenAI with `rf=swe`.
- **Job page:**
  - It is full screen.
  - The Back arrow and hardware Back both close it.
  - Next and prev step through the list (1 → 2 → 3 → 2 of 638).
  - Apply opens a new tab.
  - The Juice waterfall adds up: $675K − $229K − $29K − $19K = $398K.
  - "Same role elsewhere" rows switch company, and Back reopens the job.
- **Save and CSV:**
  - Save, then the toast, then "5 new" in the company menu (simulated by trimming `seen`), reopen and un-save
    all work.
  - CSV download: static gives `data/anthropic.csv` with 638 rows; the server gives `/api/export`.
- **Device behaviour:**
  - Rotating with the sheet at full or the job page open re-snaps correctly.
  - With the keyboard up, the company sheet moves to the top, the filters footer hides and the focused field stays
    inside the visual viewport.
  - Portrait safe areas are respected by the top bar, sheet, filter footer and job page footer.

### Bugs

Severity: **High** means a core task is blocked or hidden. **Medium** means friction, wrong output or an
accessibility failure. **Low** means polish. Screenshots are in `docs/screenshots/qa-mobile/`.

| ID | Sev | Device / orientation | Summary |
|---|---|---|---|
| M-1 | High | 844x390 landscape, all themes | Map pins and the Remote badge are hidden under the results sheet |
| M-2 | High | Static build (Pages), every device | Location filter shows raw "Remote-Friendly…" variants instead of canonical names (UX-3 not applied) |
| M-3 | Medium | All phones (Android Back, iOS swipe-back) | Back with the filter sheet or a popover open undoes a filter and leaves the sheet open |
| M-4 | Medium | All phones | Closing the filter sheet (✕ or "Show N roles") drops focus to `<body>` |
| M-5 | Medium | All phones | The methodology page ("How it's calculated") is laid out at 881px and clipped |
| M-6 | Medium | All devices | The methodology page shows "Code: undefined … Tests: undefined." |
| M-7 | Medium | All phones | The full-screen filter sheet isn't a modal: no dialog role, and the background stays focusable |
| M-8 | Medium | All phones | Touch targets under 44px with no hit slop (map controls, chart bins, Ranges rows, comps rows, Insights fields, CSV link) |
| M-9 | Medium | All phones | Job page next/prev push one history entry per role, so hardware Back walks back through every role |
| M-10 | Low | Landscape with a notch | Chart labels and map controls ignore the left/right safe-area insets |
| M-11 | Low | All phones | A quick chip scrolls the sheet to its section, but focus goes to "Salary" |
| M-12 | Low | All phones, keyboard up | While typing a search, the result count sits under the keyboard |
| M-13 | Low | All phones | Text under 12px in viz, features and the badge popover |
| M-14 | Low | All phones | The badge popover repeats the fetch-error sentence twice, once in an 11.5px monospace box |
| M-15 | Low | All phones | Chips that open the filter sheet never set `aria-expanded="true"` |
| M-16 | Low | All phones | After hardware Back closes the job page, focus is on `<body>` |
| M-17 | Low | 360–430 portrait | Ranges row labels are cut to about 12 characters ("Engineering …"), so rows can't be told apart without tapping |
| M-18 | Low | All | The empty search state reads "0 roles · 0 in title" |

#### M-1 (High): landscape map hides pins and the Remote badge under the results sheet
- **Device:** iPhone UA 844x390 landscape, light and dark, static and server.
- **Repro:**
  1. Open `#c=anthropic&m=map` in landscape.
  2. Wait for the pins.
- **Expected:** the map's fitted view and its bottom-left Remote badge sit inside the visible map area, above the
  peek sheet (sheet top y=326).
- **Actual:**
  - `#mapHost` is 320px tall, but `#vizArea` is only 191px (bottom 326). The map runs 130px under the sheet.
  - The initial fit centres on 320px. Sydney's pin (bottom 379) is fully hidden and Singapore (bottom 326) is cut in half.
  - The Remote badge (bottom-left) is hidden.
  - A tap on Sydney's position hits `.results-head` and opens the sheet instead.
- **Screenshots:** `map-land-initial.png`, `e2e-landscape-map.png`.
- **Owner:** `public/viz/viz.css` `.ms-map { min-height: 320px }`; it wins over the landscape block in
  `public/styles.css` (`@media (max-width: 860px) and (max-height: 500px)`), which needs `.ms-map { min-height: 0 }`.
- **Test:** `Mobile QA: [M-1] …` (fails today).

#### M-2 (High): the Pages build lists raw remote location names
- **Device:** every device; static build only. Server mode is correct.
- **Repro:**
  1. Open the static site.
  2. Tap the Location chip.
- **Expected** (server mode, CONTRACT UX-3): "Remote (US) 53", "Remote 28", "Remote (AU)", "Remote (CA)", then cities.
- **Actual:**
  - The list shows "Remote-Friendly US (Travel Required) 48", "Remote-Friendly, United States 25",
    "Remote-Friendly (Travel-Required) 20", "Remote-Friendly (Travel Required) 8", "Remote-Friendly, Australia" and
    "Remote-Friendly, Canada".
  - On a phone that is six long rows before any city.
  - The Compstimate Location select and the card meta show the same raw names.
- **Screenshot:** `chip-loc-390.png`.
- **Owner:** `scripts/build-static.js` snapshot branch (around line 630). It runs `vetSalaries(rekeyBoardJobs(jobs).jobs)` but
  never `relocateJobs()` from `server/normalize.js`, which `server/pipeline.js` applies to old snapshots.

#### M-3 (Medium): Back with the filter sheet or a popover open undoes a filter instead of closing it
- **Device:** all phones (390x844 tested); Android hardware Back, iOS edge swipe.
- **Repro:**
  1. Tap the Department chip; the filter sheet opens.
  2. Tick "Sales" (122 roles).
  3. Press Back.
- **Expected:** the sheet closes and the filter is kept.
- **Actual:**
  - The sheet stays open.
  - `d=Sales` is removed silently (hash `#c=anthropic&d=Sales` → `#c=anthropic`).
  - Every filter tap pushes a history entry, so each Back undoes one filter.
- **Also:**
  - With the company menu or More open, Back changes the filters underneath and leaves the popover open.
  - Pressing Back as the first action leaves the site.
- **Screenshot:** `filters-after-back-390.png`.
- **Owner:** `public/app.js`:
  - `setFiltersOpen()` and `togglePopover()` should push a history state when they open on phones;
  - `onHashChange()` (popstate) should close an open sheet or popover first.

  This was listed as a known gap in `docs/process/mobile.md` §6.
- **Test:** `Mobile QA: [M-3] …` (fails today).

#### M-4 (Medium): closing the filter sheet loses focus
- **Device:** all phones.
- **Repro:**
  1. Tap Filters.
  2. Tap ✕, or "Show N roles".
- **Expected:** focus returns to the Filters chip, or to the quick chip that opened the sheet.
- **Actual:** `document.activeElement` is `<body>`. The sheet gets `visibility: hidden` while it holds focus.
- **Screenshot:** `filters-open-390.png`.
- **Owner:** `public/app.js` `setFiltersOpen(false)`. Remember the opener in `setFiltersOpen(true)` / `openFiltersAt()` and refocus it.
- **Test:** `Mobile QA: [M-4] …` (fails today).

#### M-5 (Medium): the methodology page is unreadable on phones
- **Device:** 390x844 (all phones).
- **Repro:**
  1. Open a job page.
  2. Open 🍉 Juice.
  3. Tap "How it's calculated", which opens `methodology/#1-the-formula`.
- **Expected:** the text reflows to 390px; wide `<pre>` blocks and tables scroll inside their own box.
- **Actual:**
  - The layout viewport grows to 881px: the formula `<pre>` is 838px with `overflow: visible`, and the tables are 728–897px.
  - `body { overflow-x: hidden }` clips the right side.
  - Sentences, the formula's comments and table columns are cut off, and there is no way to scroll to them.
- **Screenshots:** `methodology-390.png`, `methodology-top-390.png`.
- **Owner:** `scripts/methodology.js` `METHODOLOGY_CSS` (emitted as `methodology/methodology.css`). Give `pre` `overflow-x: auto; max-width: 100%`
  and keep tables inside a scrolling wrapper, so no element widens the page.

#### M-6 (Medium): "undefined" in the methodology page
- **Device:** all.
- **Repro:** open `methodology/` and read the paragraph under the intro.
- **Expected:** "Code: `server/juice.js` (pure ES module…). Data: `data/cities.json` (89 cities). Refresh: … Tests: …".
- **Actual:** "Code: undefined (pure ES module, also loaded in the browser). Data: undefined (89 cities). Refresh:
  undefined and undefined. Tests: undefined."
- **Screenshot:** `methodology-top-390.png`.
- **Owner:** `scripts/md.js` `inline()`.
  - Cause: a link whose label is a code span (``[`server/juice.js`](../server/juice.js)``). The outer call has already
    swapped the code for a `\u0000N\u0000` placeholder. The recursive `inline(label)` then resolves it against its own,
    empty, `codes` array.
  - Fix: pass `codes` into the recursive call, or restore code placeholders in the label before recursing.

#### M-7 (Medium): the full-screen filter sheet is not a modal dialog
- **Device:** all phones (screen reader / switch / keyboard users).
- **Repro:**
  1. Tap Filters.
  2. Press Shift+Tab three times (an external keyboard, or VoiceOver's swipe-left).
- **Expected:** focus stays in the sheet. It has `role="dialog"` and `aria-modal="true"`, and the top bar, quick bar
  and results are `inert`, as the job page already does with `setBackgroundInert`.
- **Actual:**
  - `#filters` is an `<aside>` with no role.
  - `.topbar` and `#results` are not inert.
  - Focus goes from ✕ to Reset, then to the hidden "Clear all" and Save chip behind the sheet.
- **Screenshot:** `filters-open-390.png`.
- **Owner:** `public/app.js` `setFiltersOpen()`, plus `public/index.html` `#filters`.

#### M-8 (Medium): touch targets under 44px with no hit slop
- **Device:** 390x844, measured from bounding boxes and confirmed by hit testing.
- **Repro:** open each view and measure (`docs/process/qa-mobile.md` §4 has the audit script).
- **Expected:** at least a 44x44 hit area (WCAG 2.5.5, iOS HIG), or padding or a `::before` slop that gives one.
- **Actual:**

  | Control | Size (px) | Screenshot | Owner |
  |---|---|---|---|
  | Map zoom ± | 30x30 | `map-390.png` | `public/viz/viz.css` |
  | Pay\|Juice buttons | 52x26 | `map-390.png` | `public/viz/viz.css` |
  | Map Remote badge | 189x32 | `map-390.png` | `public/viz/viz.css` |
  | Cluster bins | 24x24 to 29x29 | `chart-bin-tap-390.png` | `public/viz/viz.css` `.ms-bin::before` |
  | Ranges rows | 390x22 | `chart-ranges-390.png` | `public/viz/chart.js` row height on coarse pointers |
  | "Same role elsewhere" rows | 28 tall | `job-comps-390.png` | `public/viz/comps.js` / `viz.css` |
  | Insights Compstimate title, Location and Level | 34 tall | `insights-390.png` | `public/features/features.css` `.ms-comp__input`, `.ms-comp__select` |
  | Compare companies select | 34 tall | — | `public/features/features.css` |
  | Badge popover "Download CSV" link | 106x15 | `badge-popover-390.png` | `public/app.js` `makeBadgeDetails` / `styles.css` |

  The touch sizes for viz were already routed in `docs/process/mobile.md` §6 item 3 and are still open.

#### M-9 (Medium): next/prev on the job page fill the history
- **Device:** all phones.
- **Repro:**
  1. Open a card.
  2. Tap Next twice and Prev once.
  3. Close with the Back arrow.
  4. Open another card.
  5. Press hardware Back twice.
- **Expected:** one Back closes the job page; a second leaves the job pages altogether.
- **Actual:**
  - `history.length` grows by one per Next/Prev (8 → 9 → 10 → 11).
  - The second Back reopens the job page on an earlier role ("Engineering Manager, GPU", 2 of 638).
  - After paging through N roles it takes N Backs to get out.
- **Screenshot:** `job-page-390.png`.
- **Owner:** `public/app.js` `stepDrawer()` → `openDrawer()` → `commit()`. Use `replace` when stepping within an open
  drawer.

#### M-10 (Low): landscape notch overlaps the chart labels and map controls
- **Device:** 844x390 with insets left/right 47 and bottom 21.
- **Repro:**
  1. Set the safe-area override in landscape.
  2. Open Chart, then Map.
- **Expected:** content and controls stay inside `env(safe-area-inset-left/right)`, as the top bar, quick bar and
  sheet already do.
- **Actual:**
  - Chart row swatches and labels start at x=0. The axis caption "Annual salary · approx USD" starts at 15.
  - Map zoom and Remote are at left 10. Pay|Juice, the offline note and the attribution reach 834–844.
- **Screenshots:** `safearea-land-chart.png`, `safearea-land-map.png`.
- **Owner:** `public/styles.css` phone block. Add `padding-left: var(--m-gutter-l); padding-right: var(--m-gutter-r)`
  to the chart's scroll host, and offset `.leaflet-control-container` by the insets. Alternatively, this belongs in
  `public/viz/viz.css`.

#### M-11 (Low): a quick chip opens the right section, but focus lands on "Salary"
- **Device:** all phones.
- **Repro:** tap the Department (or Location, Seniority, Remote) chip.
- **Expected:** focus is on the Department section's `<summary>`.
- **Actual:**
  - Focus is on the Salary `<summary>`.
  - `openFiltersAt()` focuses the section in a rAF, but `setFiltersOpen()`'s `setTimeout(…, 50)` then focuses the
    first summary.
  - A screen reader announces "Salary" while Department is on screen.
- **Screenshot:** `chip-dept-390.png`.
- **Owner:** `public/app.js` `setFiltersOpen()` / `openFiltersAt()`.

#### M-12 (Low): no result count while typing a search with the keyboard up
- **Device:** 390x844 with the simulated keyboard (visual viewport 508px).
- **Repro:** tap Search and type "python".
- **Expected:** some visible feedback, such as the count or the first cards.
- **Actual:**
  - The list filters to "186 roles · 0 in title", but that title sits at y=801, under the keyboard.
  - The chart above changes, but nothing says how many roles match until the keyboard closes.
- **Screenshot:** `kb-search-390.png`.
- **Owner:** `public/styles.css` phone block, for example lifting the sheet peek above `--vvh` under `body.kb-open`
  (the popovers already do this).

#### M-13 (Low): text under 12px on phones
- **Device:** all phones.
- **Actual:**

  | Text | Size (px) | Owner |
  |---|---|---|
  | Cluster bin counts `.ms-bin__dot--sm` / `.ms-bin__dot` | 10 / 11 | `public/viz/viz.css` |
  | Chart footnote `.ms-chart__foot` | 11.5 | `public/viz/viz.css` |
  | Map `.ms-pin__label` / `.ms-pin__count` | 10.5 | `public/viz/viz.css` |
  | Map offline note | 11 | `public/viz/viz.css` |
  | Leaflet attribution | 10 | `public/viz/viz.css` |
  | Comps ticks `.ms-comps__tick` / note | 10.5 / 11 | `public/viz/viz.css` |
  | Juice waterfall `.wf-detail` | 11.5 | `public/styles.css` |
  | Compare companies `.msi-row__n` / `.msi-row__tag` / axis | 11 / 10.5 | `public/features/features.css` |
  | Compstimate distribution labels | 10.5 | `public/features/features.css` |
  | Saved "5 new" `.saved-new` | 11 | `public/styles.css` |
  | Badge popover `.badge-error` | 11.5 | `public/styles.css` |

- **Screenshots:** `landing-s360-light.png`, `map-390.png`, `job-juice-390.png`.
- This was routed in `docs/process/mobile.md` §6 item 4 and is still open.

#### M-14 (Low): the badge popover repeats the error
- **Device:** all phones.
- **Repro:** open Anduril and tap the data badge.
- **Actual:**
  - The paragraph reads "Saved snapshot … Live fetch skipped: greenhouse was unreachable … use refresh to retry."
  - Then the same sentence appears again as a yellow 11.5px monospace `.badge-error` box.
- **Screenshot:** `badge-popover-390.png`.
- **Owner:** `public/app.js` `makeBadgeDetails()` / `badgeInfo()`. See also L2.

#### M-15 (Low): sheet-opening chips never report "expanded"
- **Device:** all phones.
- **Repro:** tap the Salary chip.
- **Expected:** `aria-expanded="true"` (and `aria-controls="filters"`) on the chip.
- **Actual:** it stays `false`. Only More gets `true`, because it uses a popover.
- **Screenshot:** `chip-salary-390.png`.
- **Owner:** `public/app.js` `togglePopover()` (the `openFiltersAt` branch) / `renderQuickbar()`.

#### M-16 (Low): focus is lost after hardware Back closes the job page
- **Device:** all phones.
- **Repro:**
  1. Tap a card.
  2. Press hardware Back.
- **Expected:** focus is on the card that opened the page.
- **Actual:** `<body>`. The ✕ / Back arrow path returns focus to the card correctly.
- **Owner:** `public/app.js` `onHashChange()` → `render()` → `closeDrawer({ fromHash: true })`: the card is re-rendered
  before focus is restored. Same family as BUG-6.

#### M-17 (Low): Ranges labels are truncated to uselessness at phone width
- **Device:** 360–430 portrait.
- **Repro:** Chart, then Ranges.
- **Actual:**
  - Labels read "Research Eng…", "Staff+ Resear…", "Engineering …" (three different roles look identical) and
    "Head of Strat…".
  - The full title is only in the hover `title`/tooltip.
  - A tap opens the job, so the information is reachable, but scanning the chart isn't possible.
- **Screenshot:** `chart-ranges-390.png`.
- **Owner:** `public/viz/chart.js` Ranges label width on narrow screens. For example, put the label above the bar
  on phones, as Clusters does with `narrow`.

#### M-18 (Low): odd empty-search copy
- **Device:** all.
- **Repro:** search "zzzzqqq".
- **Actual:** the title reads "0 roles · 0 in title". The "· N in title" suffix should be dropped when N = 0, or
  when the count is 0.
- **Screenshot:** `empty-390.png`.
- **Owner:** `public/app.js` results title (UX-2 suffix).

### Coverage notes
- **Not testable here:**
  - Real WebKit/iOS Safari: dvh with the toolbar, a real keyboard, rubber-banding.
  - Live boards and real map tiles: the offline basemap was used.
  - Real-device double-tap zoom.
- **Keyboard simulation:** a `visualViewport.height` override drives the app's own `kb-open` path. It does not move
  the layout the way iOS does.
- **Already-known items not repeated as new bugs:** Juice barely discriminates (Juicy on 501 of 638; UX-7), "Listed" has no data (L1),
  the BUG-5 keywords, and the 28px sheet grip (it is part of an 84px drag zone, so not a bug).
