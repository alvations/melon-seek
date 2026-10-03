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

---

## Full QA pass (desktop) 2026-10-03

A functional pass of the desktop site by the desktop QA agent. The process log, with every replayable command, is in
[`docs/process/qa-desktop.md`](process/qa-desktop.md). No product code was changed.

**Setup**
- **Code under test: commit `15ac5fc`.** Other agents were editing `public/` in the shared working tree during
  the pass, so `git archive HEAD` was exported to a scratch directory and both modes ran from that export.
- **Static build** (what Pages users get): `node scripts/build-static.js` in the export. Its `dist/` was served
  under `/melon-seek/` by `docs/process/scripts/qa-audit-static-server.mjs`.
- **Server mode:** `node server/index.js` from the same export.
- **Data:** the local `data/snapshots/*.json`, so every board is `mode: "snapshot"`. That covers 8 boards:
  - Anthropic 638, Anduril 2,418, OpenAI 833 and Cohere 132;
  - xAI 297, Scale AI 194, Palantir 320 and Shield AI 581.
- **Browser:** Playwright 1.63 with Chromium 141. External hosts were blocked.
- **Viewports and themes:** 1440x900 and 1280x800, each in light and dark.
- **Method:**
  - Every count and order was checked against the app's own data. The test pulled jobs through `public/api.js`
    `getJobs()` and computed approx USD with `palette.toUSD`.
  - The listing-age features have no ledger data in the snapshots. They were exercised in server mode by
    injecting `ageDays`, `postedAt`, `firstSeenAt` and `repost` into `/api/jobs` with `page.route`.
  - Colour contrast was checked with axe-core 4.13.

**New e2e tests:** [`test/e2e/desktop-qa.e2e.js`](../test/e2e/desktop-qa.e2e.js), registered in `scripts/e2e.js`.
Run them with `node scripts/e2e.js --grep='^Desktop QA'`.
- On `15ac5fc`: **10/22 pass**. The 12 failures are the tests tagged `[D-1]`…`[D-12]`. They encode the bugs
  below and should pass once those are fixed.
- On the final tree (HEAD `3eb353d` plus this pass's files): **11/22 pass**. `[D-1]` now passes because
  `db18658` fixed it (see D-1).
- `[D-1]` serves `dist/` itself and skips when there's no build.

**Existing suites:** see "Suite results" at the end of this section.

### What works on desktop (both modes unless noted)

- **Company and boards:**
  - The company menu lists all 8 boards and focuses its search. "open" + Enter, ArrowDown + Enter, and a
    search by ATS ("lever") all work, and Esc closes it. Each switch loads the right count and clears filters.
  - Recent pills work. By design only one shows below 1600px and none below 1200px.
  - Add board:
    - An invalid slug gets `aria-invalid` and a hint.
    - A custom board, e.g. `lever:qa-fake-board`, falls back to labelled demo data: a banner, a "Demo" badge
      and "Open the real Lever board" on Apply.
    - The board survives a reload and is listed under "Your boards".
    - Removing it returns to a built-in. A custom name that matches a built-in becomes "Anthropic (custom)".
- **Search:** title and team matches always rank first, in every sort, and "· N in title" equals them. Tested
  with "engineer" (222 of 266), "safety", "machine learning", "python" and "sales manager". Esc clears.
- **Filters:**
  - Every count equalled the app's data on Anthropic, OpenAI and Anduril:
    - salary min, max and overlap;
    - "Only show jobs with salary";
    - Department, with OR within the facet;
    - Location, and its option search;
    - Seniority, in ladder order;
    - Remote and On-site;
    - the Responsibilities, Fit and Skills chips, with AND within each;
    - More: Employment type and the Juicy/Ripe/Dry grades.
  - The salary thumbs respond to arrow keys and to a mouse drag that starts on a thumb. They can't cross.
  - The quick-chip labels, Filters badge, "See N roles", Clear all, the panel Reset and the per-popover Reset
    are all correct.
  - Facet counts ignore their own facet. The exception is a cluster or map area (D-2).
  - "Listed" shows "Listing dates appear after a few daily runs." With injected history, its options, counts,
    `p=` and "Hide 180+ days" (`ho=1`) are all correct.
- **Sorting:**
  - Highest pay and Lowest pay follow the approx-USD **midpoint** on all 4 boards checked, and across the
    "Show more" page.
  - Most juice is descending with unscored roles last. Title A–Z ignores the `[London]` title tag.
  - With injected history, Newest gives 0d, 3d, 6d…, and "18d+" for lower-bound ages.
- **Chart:**
  - Clusters is the default.
  - Hover tooltips show "N roles", the band and the top titles.
  - A cluster click gives a chip, e.g. "AI Research & Engineering · $300K–$350K (8)", and the list, stats line
    and Clear all all follow it. Dismissing the chip restores everything. A row label selects the whole row.
  - Overflow markers ("1 role above $500K", OpenAI) have their own tooltip and chip.
  - Keyboard: arrows move `aria-activedescendant` with a tooltip, and Enter selects.
  - Group by Location, Seniority and None works, and so does Ranges:
    - `v=ranges` defaults to ungrouped;
    - hovering or clicking a row opens the job;
    - End reaches the last virtualised row;
    - group headers show when grouped;
    - card hover highlights the row.
- **Map:**
  - Pins (`$347K · 490`) all fit inside the initial view, with an offline basemap note.
  - Tooltips stay inside the map.
  - A pin click gives an area chip whose count follows the other filters. Enter on a focused pin works.
  - The Remote control count equals its list.
  - Pay|Juice switches the pins to 🍉 scores, checks the radio and shows the legend.
  - Zoom works with the buttons and the wheel.
  - The map refits after a resize with the drawer open, and after collapsing Filters.
- **Insights:**
  - Compstimate:
    - It gives an estimate and the accuracy line (e.g. "Typically within ±14% (tested on 500 listed salaries)").
    - The Seniority and department filters prefill it, and editing the title shows "Reset to filters".
    - An edited title sticks through filter changes, and Reset restores follow mode. The one exception is D-5.
  - Market insights: clicking a row adds its filter, and clicking again removes it.
  - Compare companies: the role-family select works. A row click switches company with `rf=`, the "Role:" chip
    shows and the view stays in Insights. Back returns.
- **Job drawer:**
  - Pay block: the range, "USD · per year", the percentile and the distribution.
    - At most 2 honest-number labels ("Single figure", "Wide range (2.1×)").
    - The caption "Posted base pay. Equity and bonus aren't included."
    - Non-USD shows "≈ $… in approx USD", and hourly roles show "Annualized from hourly pay".
    - "Salary not listed" comes with a labelled Compstimate. "Pay unclear" gives a reason under "Why?", the
      posting link and no caption.
  - Juice waterfall: Gross − Tax − Rent − Living = Juice left, within $2K. Monthly is Yearly / 12 and keeps
    focus. "How it's calculated" opens the on-site `methodology/#1-the-formula` in a new tab, in both modes, and
    the anchor exists.
  - Same role elsewhere: rows include the current company. A click switches company with `rf`, `s`, `l` and `q`
    (UX-4). Back reopens the original drawer, and Forward works.
  - Listing block (with injected data): "Listed 15 days ago (Sep 18, 2026)", "First seen…", "Reposted 2×…",
    "Open at least 18 days…" and the 180+ days note.
  - Keywords toggle filters while the drawer stays open.
  - The description loads lazily: `api/desc/<slug>/<id>.json` in static, `/api/job?id=` in server. It is
    sanitised: no img, script, iframe or style, and links only to ATS hosts.
  - Apply goes to the right ATS host (greenhouse.io, jobs.ashbyhq.com, jobs.lever.co), shows that host, and has
    `target=_blank rel=noopener`.
  - Copy link copies `location.href` with `job=`.
  - Prev and Next work, and Prev is disabled at 1. The drawer traps focus. Esc closes it and returns focus to
    the opening card. A backdrop click, Back and Forward all work.
- **Other:**
  - Save is hidden with no filter, and Save/Saved toggles. "N new" shows in the company menu once the saved
    company has loaded this session (D-10), and resets after opening. "New" card tags work.
  - Download CSV gives one row per job (834 lines for OpenAI) with the documented header: `data/<slug>.csv` in
    static, `api/export` in server.
  - Theme: System > Light > Dark. Dark persists across a reload and `t` cycles back.
  - The hash round-trips a full state through a reload. A deep link to an unrendered role (the last Anduril job)
    opens it. An unknown `job=` is dropped. Back and Forward walk mode, filter, sort and drawer states exactly,
    and junk hash values don't crash.
  - Share pages `/c/<slug>/` (static) have the right titles and OG tags, and pass extra state through, e.g.
    `#m=map&ks=Python`.
  - Shortcuts don't fire while typing: `/`, `t`, `j` and `k` are typed into the search, company search and Add
    board fields, and `t` on a focused select does nothing.
- **Layout and errors:**
  - 1440x900 and 1280x800, light and dark: no horizontal scroll, no top-bar overlap, and every popover and the
    drawer stay inside the viewport.
  - axe color-contrast: 0 violations in every view, popover and drawer (about 140 nodes checked per view).
  - No console or page errors in any flow. The only HTTP errors are the expected 404 for an unknown company, and
    `/c/<slug>/` in server mode (D-15).

### Bugs (ordered by severity)

Repro steps assume a fresh 1440x900 window on `#c=anthropic` unless stated. "Both" means static and server mode.

#### D-1 (High): the static build (GitHub Pages) shows raw source location names; the UX-3 fix only reaches server mode
- **Status:** **fixed in `db18658`**, committed at 02:32 during this pass. It is the same bug as mobile **M-2**.
  `scripts/build-static.js` now runs `relocateJobs()` on stale snapshots, and `[D-1]` passes on the final tree.
  Kept here for the record.
- **Repro (static):** open `/melon-seek/#c=anthropic`, then click **Location**.
- **Expected:** the canonical names server mode shows: "Remote (US)", "Remote", "Remote (AU)", "Remote (CA)",
  San Francisco, and so on (CONTRACT.md, "Location (2026-10-02, UX-3)").
- **Actual:** six raw remote variants, two of which differ only by a hyphen:
  - "Remote-Friendly US (Travel Required)" 48
  - "Remote-Friendly, United States" 25
  - "Remote-Friendly (Travel-Required)" 20
  - "Remote-Friendly (Travel Required)" 8
  - "Remote-Friendly, Australia"
  - "Remote-Friendly, Canada"
- **Same root cause elsewhere:**
  - Anthropic and Anduril list "Tokyo Prefecture" next to "Tokyo".
  - OpenAI shows "US - Remote", "Ontario - Remote", "Bangalore - Remote" and others.
  - Cards read "London, England". Map pins and chart rows read "Alberta, CAN" and "Ontario, CAN" (server mode
    says "Alberta, Canada").
  - Compstimate's Location select lists the raw variants.
  - The static jobs have no `rawName`.
- **Screenshots:** `docs/screenshots/qa-desktop/D-1-location-names-static.png`, with
  `D-1-location-names-server.png` for comparison.
- **Owner:** `scripts/build-static.js`, the snapshot load (around line 630). It runs
  `vetSalaries(rekeyBoardJobs(jobs).jobs)` but never `relocateJobs()`. `server/pipeline.js:55` runs
  `relocateJobs(rekeyBoardJobs(jobs).jobs)` for snapshots written by an older normalizer
  (`server/normalize.js#relocateJobs`).

#### D-2 (Medium): facet counts ignore an active chart cluster or map area
- **Repro (both):**
  1. Click a 3-role cluster, e.g. "AI Research & Engineering · $500K–$550K". The list shows 3 roles.
  2. Open **Seniority**.
- **Expected:** counts within the 3 roles. The checklist footer already says "See 3 roles".
- **Actual:** board-wide counts: Mid 377, Senior 64, Staff+ 93, Manager 68 and so on. Picking "Mid 377" gives 1 or 2
  roles. The same happens with a map pin: on Anduril, Seniority showed 18 and the result was 1.
- **Screenshot:** `D-2-facets-ignore-cluster-static.png` (also `-server`).
- **Owner:** `public/app.js` `derive()`. The faceted counts are computed before the `area` narrowing in
  `render()`, which only filters `listed`. `makeChecklist`, `makeCloud`, `makeRemote` and `makeJuiceChips` read
  `derived.fc`.

#### D-3 (Medium): the salary thumbs lock once the min thumb is dragged to the right end
- **Repro (both):**
  1. Drag the left (Min) thumb of the Salary slider past the right end. This gives `smin=870000` and 0 roles.
  2. Try to drag either thumb back to the left.
- **Expected:** the thumbs separate and the bound decreases.
- **Actual:** neither thumb moves. The Max input is on top, and `onInput('hi')` clamps it to the min value. Only
  the arrow keys, Reset or Clear all recover.
- **Screenshot:** `D-3-salary-thumbs-stuck-static.png` (also `-server`).
- **Owner:** `public/app.js` `makeSalary()` `onInput` (no z-index swap when the thumbs meet) and
  `public/styles.css` `.range` / `.range--lo`.

#### D-4 (Medium): OpenAI "Remote" disagrees between the filter, the cards and the map
- **Repro (both):** `#c=openai&m=map`, then Remote > **Remote**.
- **Expected:** the Remote filter and the map's Remote badge count the same roles.
- **Actual:** the filter gives **562 of 833**. The map badge says **Remote · 60**.
  - 502 roles have `remote: true` but only on-site locations. For example "Software Engineer, Financial
    Engineering" (San Francisco, CA) shows a "Remote" tag on its card.
  - The flag is already `true` in `data/snapshots/openai.json`. That file holds normalized jobs, so I could not
    tell whether Ashby sends `isRemote: true` for these roles.
- **Screenshots:** `D-4-openai-remote-card-static.png` and `D-4-openai-remote-map-static.png` (also `-server`).
- **Owner:**
  - data: `server/sources/ashby.js` line 76 (`j.isRemote === true` → `remote`);
  - UI: `public/app.js` `failures()` (`r` uses `job.remote`) and `card()`, versus `public/viz/map.js` (the
    Remote bucket uses `location.remote`).

#### D-5 (Medium): Compstimate's Role title goes stale after "Reset to filters"
- **Repro (both):**
  1. Go to `#c=anthropic&m=insights` and tick Department **Sales**.
  2. Type "Account Executive" in Role title and press Enter.
  3. Click **Reset to filters**. The title becomes "Enterprise Account Executive".
  4. Press the browser **Back** button (focus stays in the field).
- **Expected:** the title follows the filters again, showing "Software Engineer".
- **Actual:** the field still says "Enterprise Account Executive". The estimate, the auto line and the
  "Weighted by similarity to 'Software Engineer'" basis are all for Software Engineer. The field and the number
  disagree until the field loses focus and the filters change again.
- **Screenshot:** `D-5-compstimate-title-stale-static.png` (also `-server`).
- **Owner:** `public/features/compstimate.js`. `reset()` focuses `titleInput`, and `fillForm()` skips writing
  the value while it has focus (`if (document.activeElement !== titleInput)`).

#### D-6 (Medium): j/k and ←/→ don't step the drawer right after it opens
- **Repro (both):** click any card (or press Enter on it), then press `j` or `→`.
- **Expected:** the next role ("2 of 638").
- **Actual:** nothing happens. `openDrawer()` puts focus on `#drawerClose`, and the shortcut guard (V7) rejects
  buttons. The keys only work after clicking inside the drawer body or tabbing to `.drawer-scroll`.
- **Screenshot:** `D-6-drawer-jk-on-open-static.png` (also `-server`).
- **Owner:** `public/app.js` `bindEvents()` keydown `shortcutOk`, and `openDrawer()`'s initial focus. Arrow keys
  could be allowed on `#drawerClose`, or the initial focus moved to the drawer itself.

#### D-7 (Low): a cluster chip outlives its cluster when Group by or the view changes
- **Repro (both):**
  1. Click a cluster, e.g. "AI Research & Engineering · $400K–$450K (11)".
  2. Change **Group** to Seniority, or switch to Ranges.
- **Expected:** the selection is cleared, or kept visible in the chart.
- **Actual:** the chip stays and the list keeps showing the 11 roles. The chart now has no such cluster and no
  selection (`.is-selected` count 0).
- **Screenshot:** `D-7-cluster-chip-stale-static.png` (also `-server`).
- **Owner:** `public/app.js`, the `#groupBy` change and `[data-view]` click handlers in `bindEvents()`. They don't
  call `clearArea()` for `area.kind === 'cluster'`.

#### D-8 (Low): Esc never closes the drawer while focus is in "Same role elsewhere"
- **Repro (both):** open a role with comps rows (e.g. `#c=anthropic&job=anthropic%3A4461450008`), Tab into the
  comps list, then press Esc three times.
- **Expected:** the first Esc clears the list's own state, and the next one closes the drawer.
- **Actual:** the drawer stays open.
- **Screenshot:** `D-8-esc-in-comps-static.png` (also `-server`).
- **Owner:** `public/app.js` keydown (`if (e.key === 'Escape' && e.target.closest?.('.ms-comps')) return;`) and
  `public/viz/comps.js` (its Escape handling).

#### D-9 (Low): Clusters grouped by Seniority are ordered by median, not by the ladder
- **Repro (both):** `#c=anthropic&g=seniority`.
- **Expected:** Intern, Entry, Mid, Senior, Staff+, Manager, Director+. This is the order of Ranges view
  (`groups()`) and of the Seniority filter.
- **Actual:** Staff+, Manager, Director+, Mid, Senior, Entry, Intern. OpenAI and xAI are mixed the same way.
- **Screenshot:** `D-9-seniority-cluster-order-static.png`.
- **Owner:** `public/viz/chart.js`, the clusters row ordering. Ranges `groups()` has the seniority rank sort
  (around line 794).

#### D-10 (Low): a saved search's "N new" only appears once its company has loaded this session
- **Repro (both):**
  1. Save `#c=anthropic&ks=Python&s=Senior`.
  2. Later, after new roles appear (simulated by removing 2 ids from `melon.saved[0].seen`), open a new tab on
     `#c=openai` and open the company menu.
- **Expected:** "Anthropic · Senior · Python · 2 new". The Save tooltip says "the company menu will show new
  matches next time".
- **Actual:** no badge until Anthropic has been opened once in that tab.
- **Screenshot:** `D-10-saved-new-missing-static.png`.
- **Owner:** `public/app.js` `savedNewCount()`, which only uses `jobCache`. A cheap fix is to prefetch saved
  companies' lists when the menu opens.

#### D-11 (Low): "Newest" sort is offered while no role has a listing date
- **Repro (both):** choose Sort > **Newest** on any snapshot board.
- **Expected:** like the "Listed" filter, which hides itself with "Listing dates appear after a few daily runs",
  the option should be disabled or explained.
- **Actual:** it is selectable and silently keeps the board order. All 638 / 833 / 2,418 jobs have
  `ageDays: null`, and no card shows an age.
- **Screenshot:** `D-11-newest-no-dates-static.png`.
- **Owner:** `public/app.js` `sortJobs()` / `renderResults()` (`#sortBy` in `public/index.html`). The
  `makePosted()` "any age" check is the pattern to copy.

#### D-12 (Low): an unknown `sort=` leaves the Sort select blank
- **Repro (both):** open `#c=anthropic&sort=pay`, e.g. from a hand-edited or old link.
- **Expected:** "Highest pay" is shown, which is how the list is actually sorted.
- **Actual:** the select is empty (`value ""`).
- **Screenshot:** `D-12-sort-select-blank-static.png`.
- **Owner:** `public/app.js` `parseHash()`. It validates `m`, `r`, `v` and `g` but not `sort`.

#### D-13 (Low): the Salary "Min" and "Max" boxes look like inputs but are read-only
- **Repro:** click the Min or Max box under the salary slider and try to type a value.
- **Expected:** an exact bound can be entered (min/max inputs).
- **Actual:** they are `<output>` elements styled as bordered fields. Only the slider sets values, in $5K steps.
- **Screenshot:** `D-13-salary-min-max-readonly.png`.
- **Owner:** `public/app.js` `makeSalary()` (`output.range-val`) and `public/styles.css` `.range-vals > div`.

#### D-14 (Low): the map's Pay|Juice choice isn't kept
- **Repro:** on `#c=anthropic&m=map`, click **Juice**, then reload or share the URL.
- **Expected:** Juice stays selected, like every other view setting, which lives in the hash.
- **Actual:** the hash is unchanged (`c=anthropic&m=map`), and after a reload Pay is selected.
- **Screenshot:** `D-14-map-juice-not-kept.png`.
- **Owner:** `public/app.js` `ensureViz()`. `createMap` is called without `colorMode` or `onColorModeChange`, which
  `public/viz/map.js` supports.

#### D-15 (Low): server mode has no share pages
- **Repro (server):** open `/c/anthropic/`.
- **Expected:** a share page, or a redirect to `/#c=anthropic`. A link copied from Pages works on Pages only.
- **Actual:** HTTP 404 "Not found".
- **Screenshot:** `D-15-server-share-page-404.png`.
- **Owner:** `server/index.js` (the route table). The pages are generated only by `scripts/build-static.js`.

#### D-16 (Low): Location options use bare city keys
- **Repro (server):** open **Location**.
- **Expected:** the canonical names from the contract ("Washington, DC", "San Francisco, CA").
- **Actual:** "Washington", next to "Seattle", reads like Washington state but is Washington, DC (65 roles), as
  the cards show. All cities appear without their state or country, and only the group header disambiguates.
- **Screenshot:** `D-16-location-bare-city-keys.png`.
- **Owner:** `public/app.js` `locKey` (`l.city`).

### Notes
- **A transient working-tree regression, now gone (not counted above).** At about 02:00 an uncommitted
  `public/viz/chart.js` edit from another agent (tagged "M-8") used `binPx` before `const binPx` was declared.
  - Every Clusters render threw `ReferenceError: Cannot access 'binPx' before initialization`. I saw it in server
    mode, which serves the live tree.
  - In the committed version, HEAD `3eb353d`, the declaration comes first (chart.js:462–463), and the final suite
    run is clean.
- The documented PERF-1 cold start still applies in server mode: the first `/api/jobs` per company takes seconds.
  I didn't re-measure it.
- Already known and not repeated: UX-7 (Juice barely discriminates), L1 (no listing data), L3 (CSV filename).
- **Not testable here:**
  - live board fetches, since every mode is "snapshot";
  - real map tiles;
  - the real clipboard outside Chromium;
  - real ledger data. Listing, New and Reposted were exercised with injected data only.

### Suite results
| Suite | Tree | Result |
|---|---|---|
| `npm test` | start of the pass (HEAD `e567ca0`) | **294/294** pass |
| `npm test` | end of the pass (HEAD `3eb353d` + this pass's files) | **301/301** pass (other agents added tests in between) |
| `node scripts/e2e.js` | start (API + UI + Compstimate groups only) | **56/56** pass |
| `node scripts/e2e.js --grep='^Desktop QA'` | the `15ac5fc` export | **10/22**: the 10 guard tests pass; `[D-1]`…`[D-12]` fail |
| `node scripts/e2e.js` | end (adds the Mobile QA and Desktop QA groups) | **75/86**: every existing, mobile and desktop guard test passes. The 11 failures are exactly `[D-2]`…`[D-12]` (`[D-1]` is fixed). Exit code 1 by design until those bugs are fixed. |

All runs used `NODE_PATH=<scratchpad>/pw/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

On the final tree, D-13…D-16, which have no e2e test, were re-checked with a quick script in server mode. All four
still reproduce.
