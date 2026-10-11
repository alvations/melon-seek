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

## Full QA pass (desktop, beta) 2026-10-10

A functional pass of the desktop beta site (`/melon-seek/beta/`) by the beta desktop QA agent. The process log, with
every replayable command, is in [`docs/process/qa-desktop-beta.md`](process/qa-desktop-beta.md). No product code was
changed.

**Setup**
- **Code under test:** HEAD `91fb7ae`, built with `node scripts/build-static.js --out <scratch>/qa-desktop-beta/dist`
  (`beta: 5/5 beta companies included`; the expected warning that Apple's list is 2.55 MB, budget 1.50 MB). It was
  served under `/melon-seek/` by `scripts/cycle/serve.mjs`, with gzip like Pages.
- **Server mode:** `MELON_CHANNEL=beta node server/index.js`, its own pid file.
- **Data:** today's first full big-tech crawl (snapshot.yml run 38044091555) in `data/beta/snapshots/`, plus the stable
  boards from 11:42 UTC. All boards are `mode: "snapshot"`:
  - Apple 6,105, Google 3,417, NVIDIA 2,664, Microsoft 2,320, Netflix 456;
  - Anduril 2,491 for comparison, and the other 7 stable boards.
- **Browser:** Playwright 1.63, Chromium 141. External hosts were blocked, so grey tiles and the stable boards' failed
  live fetch are expected and not reported.
- **Viewports and themes:** 1440x900, 1280x800 and 1024x768, each in light and dark.
- **Method:** counts and order were checked against the app's own data (`public/api.js` `getJobs()`, `palette.toUSD`).
  Raw snapshots were read only to find causes.
- **Overlap:** the beta data check ([`docs/process/data-check-beta.md`](process/data-check-beta.md)) ran at the same
  time. D-17, D-21 and part of D-23 have the same causes as its DQ-1, DQ-8 and DQ-10. They are kept here for their
  desktop symptoms and because the e2e tests check the built site; fix each once.

**New e2e tests:** [`test/e2e/beta-desktop-qa.e2e.js`](../test/e2e/beta-desktop-qa.e2e.js), registered in
`scripts/e2e.js`. Run them with `node scripts/e2e.js --grep='^Beta desktop QA'`. They serve the shared `dist/`
(`npm run build`) under `/melon-seek/` and skip when `dist/beta/` is missing.
- **5/19 pass.** The 5 guards pass. The 14 failures are exactly the tests tagged `[D-17]`…`[D-30]`, which encode the
  bugs below and should pass once those are fixed.

### What works on desktop, beta (all six boards unless noted)

- **Beta only:**
  - The five big-tech boards load from the bundle only. Each makes one request, `api/jobs/<slug>.json`, and none
    to another host, also on Refresh. The badge reads "Snapshot · Oct 10" (no "checking live…", no demo banner). Its
    popover says "This board is collected by the site's crawler; your browser can't fetch it live", gives the
    source ("Apple careers site"), the fetch time and the count, and hides its own Refresh button.
  - Paused and absent companies are nowhere: Meta, Amazon and Tesla aren't in the menu or `api/companies.json`, and
    have no list, CSV or share page (404). The main site's `companies.json` has no beta company, and
    `/melon-seek/c/apple/` is 404.
  - Every beta page has `<meta name="robots" content="noindex">`, `<html data-channel="beta">` and the channel meta.
    The "Beta" pill is visible at all three widths in both themes (see D-27 for what it doesn't do).
  - Apple stays usable. Every filter, sort, search and chart change landed in 0.2 to 0.35 s, with long tasks of
    80 to 145 ms, close to Anduril, which has 2.5 times fewer roles (table below). The slow spots:
    - Insights takes 0.8 s to open (a 0.7 s task);
    - a salary-slider step costs up to 230 ms (10 arrow presses took 2.3 s), so a drag feels heavy;
    - the household switch re-scores all 6,105 roles in about 1 s, with a 0.44 s task (Anduril 0.1 s).
  - Big-tech pay text is shown faithfully:
    - hourly: "Annualized from hourly pay ($43.07 and $76.64/hr)";
    - CZK: "CZK 738K–1.2M", with "≈ $35K–59K in approx USD";
    - EUR and CAD;
    - wide ranges get "Wide range (2.1×)".

    D-21, D-22 and D-30 are the exceptions.
- **Company and boards:**
  - The menu lists 13 boards, focuses its search, and "nvid" + Enter opens NVIDIA (2,664). "eightfold" finds
    Microsoft, Netflix and NVIDIA, and Esc closes.
  - Recent pills switch boards.
  - Add board: an invalid slug is flagged; `lever:qa-fake-board` gives labelled demo data, survives a reload and
    can be removed.
- **Search:** title and team matches rank first on all five boards ("engineer", "software engineer", "manager",
  "data"), and "· N in title" is right. Apple "engineer" gives 4,087, with 4,057 in title.
- **Filters**, checked against the data on the six boards (150 checks):
  - Seniority and Department facets sum to the total, and a pick gives exactly its facet count. A facet's counts
    don't change with its own pick.
  - Location picks are exact, but see D-17 and D-23 for the names.
  - Remote and On-site counts are exact.
  - The Responsibilities, Fit and Skills chips are exact and AND together.
  - "Only show jobs with salary" is exact, and typed bounds (200k, 300000) give the expected overlap.
  - More is exact on all six: Employment type, Juicy/Ripe/Dry, and Listed ("Past week" 959 on Google, matching the
    data; the big-tech boards have real listing dates).
  - Clear all restores the board, and the cluster chip narrows the facets (D-2 fixed).
- **Sorting:** Highest pay, Lowest pay (approx-USD midpoint), Newest (0d, 0d, 1d…), Title A–Z and Most juice are
  correct on all five boards, and Show more pages 120 at a time ("Show 120 more of 6045").
- **Chart:**
  - Clusters is the default. Tooltips work ("11 roles · $200K–$225K midpoint · Design"), and a cluster click gives a
    chip with the list, the stats line and the facets following it. Dismissing the chip restores everything.
  - Overflow markers have their own tooltip and chip ("Machine Learning and AI · above $350K (5)").
  - The arrow keys move `aria-activedescendant`, and Enter selects.
  - Group by Location, Seniority (in ladder order, D-9 fixed) and None work, and so does Ranges, where End reaches
    the last of 6,105.
- **Map:**
  - All pins are inside the initial view, with tooltips inside the map.
  - A pin click gives an area chip whose count equals the list.
  - The Remote control equals the Remote filter (D-4 fixed: NVIDIA 585, Microsoft 313).
  - Pay|Juice switches the pins, the legend shows, and `mc=juice` is kept (D-14 fixed).
  - The zoom buttons and the wheel work, and the map keeps its size when the window shrinks to 1280 with the drawer open.
- **Insights:**
  - Compstimate prefills from Seniority ("Software Engineer · Senior", "$242K, high confidence, 264 similar roles at
    Apple"). Editing the title shows "Reset to filters", and Reset restores it. The accuracy line shows on every board
    (e.g. "Typically within ±12% (tested on 500 listed salaries, Oct 2026)").
  - A Market insights row click adds its filter, and a second click removes it.
  - Compare companies covers the beta companies, up to 13 per family ("Software engineering (13 companies)"). A row
    click switches company with `rf=` and stays in Insights, and Back returns.
- **Job drawer** (11 chosen postings: multi-level, wide, hourly, CZK, CAD, Pay unclear, no pay):
  - The pay block has at most two labels and the caption.
  - "Pay unclear" (Netflix L4, "$71K–$464K spans 6.5×") gives the reason under "Why?" and a labelled Compstimate.
  - The Juice waterfall adds up within $2K in all six. Monthly is Yearly / 12 and keeps focus. Just me, Couple and
    Family re-score, with the right bedrooms and the tax-basis notes. "How it's calculated" opens the beta's own
    `methodology/#1-the-formula` in a new tab, and the anchor exists.
  - Same role elsewhere lists the beta companies. A click (NVIDIA → Apple) switches with `s=Manager&rf=eng-manager`,
    Back reopens the NVIDIA drawer, and Forward works. Esc from the comps list closes the drawer (D-8 fixed).
  - The Listing block ("Listed 968 days ago (Feb 15, 2024)", "Open 180+ days…"), the locations, the keywords and the
    lazy description all work. The description loads one `api/desc/<slug>/<id>.json` and is sanitised, with offsite
    links as text.
  - Apply opens the right careers host in a new tab with `rel=noopener`: jobs.apple.com, google.com,
    jobs.nvidia.com, apply.careers.microsoft.com and explore.jobs.netflix.net. The wording is D-25.
  - Copy link copies the `/beta/` URL with `job=`. j right after opening steps (D-6 fixed), Prev is disabled at 1,
    and Esc closes with focus back on the card.
- **Other:**
  - Save and Saved toggle, and the toast says where saved searches are. "N new" is D-18.
  - Download CSV gives 6,105 rows for Apple with the documented header.
  - The theme persists across a reload.
  - A full hash (`q`, `smin`, `d`, `s`, `r`, `ks`, `v`, `g`, `sort`) round-trips, a deep link to the last Apple job
    opens it, and an unknown `job=` is dropped. Back and Forward walk the mode and the sort.
  - The share pages `/beta/c/<slug>/` have their own titles ("Apple jobs by salary · 6,105 roles · median $214K"),
    beta OG URLs and noindex, and pass extra state through to `/beta/#c=netflix&m=map&ks=Python`.
  - Shortcuts don't fire while typing, and `/` focuses the search.
  - The as-of dates show in the badge ("Snapshot · Oct 10", the fetch time in the popover), in Market insights
    ("postings as of 10 Oct 2026"), and in the Juice, Compstimate and comps footnotes.
- **Layout and errors:**
  - Both themes at 1440x900, 1280x800 and 1024x768 (92 checks):
    - no horizontal scroll, no top-bar overlap and no clipped control;
    - the company menu, badge, Add board, Salary, Location and More popovers, the 1024 filter sheet and the drawer
      all stay inside the viewport;
    - axe color-contrast finds 0 violations in Chart, Map, Insights, More and the drawer.
  - No console or page errors in any flow.

### Timings on Apple vs Anduril and Google (1440x900, no throttling)
Wall clock from the action until the DOM changed (polled every 50 to 100 ms), and the longest task in it. The 4-CPU
machine was shared (load average 10.7 during this run), so these are upper bounds. Each cell is one run; an earlier
run at load 7 gave the same picture.

| Action | Apple (6,105) | Anduril (2,491) | Google (3,417) |
|---|---|---|---|
| First cards / chart on load | 2181 / 2345 ms | 1614 / 1885 ms | 1339 / 1375 ms |
| Tick a department | 339 ms, longest task 115 ms | 435 ms, longest task 117 ms | n/a (one department, D-24) |
| Seniority Senior | 290 ms, longest task 142 ms | 200 ms, longest task 84 ms | 191 ms, longest task 75 ms |
| Sort Lowest pay | 232 ms, longest task 123 ms | 145 ms, longest task 83 ms | 188 ms, longest task 130 ms |
| Sort Most juice | 168 ms, longest task 113 ms | 251 ms, longest task 108 ms | 146 ms, longest task 102 ms |
| Search "engineer" | 334 ms, longest task 140 ms | 597 ms, longest task 197 ms | 284 ms, longest task 82 ms |
| Group by Location | 219 ms, longest task 83 ms | 260 ms, longest task 91 ms | 270 ms, longest task 134 ms |
| Ranges view | 288 ms, longest task 113 ms | 349 ms, longest task 109 ms | 208 ms, longest task 84 ms |
| 10 arrow steps on the salary slider | 2277 ms, longest task 230 ms | 1731 ms, longest task 168 ms | 1460 ms, longest task 149 ms |
| Open Map | 858 ms, longest task 344 ms | 506 ms, longest task 369 ms | 562 ms, longest task 418 ms |
| Open Insights | 793 ms, longest task 695 ms | 931 ms, longest task 791 ms | 594 ms, longest task 450 ms |
| Open a role | 375 ms, longest task 143 ms | 584 ms, longest task 165 ms | 267 ms, longest task 98 ms |
| Household Family (re-scores every role) | 989 ms, longest task 436 ms | 538 ms, longest task 99 ms | 920 ms, longest task 91 ms |

**What Apple's 2.55 MB list costs:** 356 kB gzip over the wire (2.49 MB decoded), unpacked on the main thread, then vetted,
juiced and prepared in chunks that yield. The first cards came about 0.8 s after Google's here (2.2 s against 1.3 s). The JS heap stayed at about 31 MB. The mobile
perf agent should measure it on a throttled phone.

### Bugs (ordered by severity)

Repro steps assume a fresh 1440x900 light window on the static beta build unless stated.

#### D-17 (High): NVIDIA and Microsoft cities in India, Israel, Germany and Indonesia are filed in US states
- **Same cause as DQ-1** in the data check, which has the per-country counts and unit tests: NVIDIA 720 postings
  (27%) and Microsoft 318 are filed in the US. It is filed here for what the desktop shows, with a test on the built
  site.
- **Viewport:** 1440x900, light.
- **Repro:**
  1. Open `/melon-seek/beta/#c=nvidia`.
  2. In the Filters column, open Location > "Show all 120" and scroll to "United States".
  3. Switch to Map and click the "Santa Clara, CA + 46 nearby" pin, which zooms to the US.
- **Expected:** Yokne'am Illit, Tel Aviv-Yafo and Ra'anana under Israel; Bengaluru, Pune and Hyderabad under India;
  Munich under Germany. The map has pins there.
- **Actual:**
  - Under "United States" in the Location filter:
    - NVIDIA: Yokne'am Illit 313, Tel Aviv-Yafo 234, Bengaluru 196, Ra'anana 103, Pune 65, Hyderabad 38, Munich 33,
      Gurugram 13 and Mumbai 13.
    - Microsoft: Bengaluru 119, Hyderabad 106, Noida 51, Mumbai 20, Herzliya 16, Jakarta 16 and Gurugram 15.
    - The bare codes "DE", "IN" and "CA" become "Delaware, US" (43), "Indiana, US" (16) and "California, US".
  - Map at the US zoom: a pin "Tel Aviv-Yafo, IL + 7 nearby · 705 postings · median $270K" sits in central Illinois,
    and Bengaluru sits on Indiana's centroid. At the default world view there is no pin in Israel or India at all;
    they are inside "Santa Clara, CA + 46 nearby (2,127)".
  - The drawer says "Tel Aviv-Yafo, IL · United States". Compstimate gives "Senior · Tel Aviv-Yafo" from US pay; that
    is the known P-2 symptom, made worse here.
  - Compstimate's Location select lists "California, US (240)", "Texas, US (98)" and "Delaware, US".
- **Screenshots:** `docs/screenshots/qa-desktop-beta/D-17-nvidia-location-filter.png`,
  `D-17-nvidia-map-israel-in-illinois.png`.
- **Owner:**
  - `server/geo.js`:
    - `regionInfo()` tries a two-letter capital token as a US state before a country code;
    - `resolvePlace()`: `pickCity()` then rejects the known city, and `fromRegion()` falls back to the state centroid.
  - The input comes from `server/sources/eightfold.js` `mapEightfoldJob`, which passes the PCSX
    `standardizedLocations` ("City, Region, CC").
  - The static build must re-geocode the stored snapshots (`relocateJobs()` in `scripts/build-static.js`, as for D-1).

#### D-18 (Medium): a search saved on a big board shows thousands of "new" roles at once
- **Viewport:** 1440x900, light.
- **Repro:**
  1. Open `/melon-seek/beta/#c=apple&r=onsite` (6,105 roles).
  2. Click **Save**.
  3. Open the company menu.
- **Expected:** "Apple · On-site", with no "new" count. Nothing is new a second after saving.
- **Actual:** "Apple · On-site · 4105 new". Opening it marks no card "New".
  - Any saved search with more than 2,000 matches does this: Google, NVIDIA and Microsoft, and Anduril (2,491) on
    the main site too.
- **Cause:**
  - `toggleSave()` stores `seen: matchingIds(…).slice(0, 2000)`.
  - With no ledger (`firstSeenAt` is null), `savedNewCount()` counts every match that isn't in `seen` as new.
  - `openSaved()` truncates the same way.
- **Related:** known P-12 (the menu's "N new" against the cards' "New") has a different cause.
- **Screenshot:** `D-18-apple-saved-search-4105-new.png`.
- **Owner:** `public/app.js` `toggleSave()` (around line 1011), `openSaved()` (around line 1052) and `savedNewCount()`.

#### D-19 (Medium): beta saved searches show up on the main site and open into an error
- **Viewport:** 1440x900, light.
- **Repro:**
  1. On `/melon-seek/beta/#c=apple&s=Senior`, click **Save**.
  2. In the same browser, open the main site at `/melon-seek/#c=anthropic`. On Pages both are alvations.github.io,
     one origin, so they share localStorage.
  3. Open the company menu and click "Apple · Senior".
- **Expected:** the main site lists only the searches it can open, or sends the user to `/beta/`.
- **Actual:**
  - The main site's menu lists "Apple · Senior" and every other beta search.
  - Clicking one shows "No data" and "Couldn't load this board · Unknown company "apple" · Retry", with the badge
    "Offline".
  - The recents are shared too, but the main site filters those out.
  - The same "Offline … Retry" state shows for a beta link opened on the main site, and for `/beta/#c=meta` (a paused
    company). There, "Offline" and "Retry" are wrong.
- **Screenshots:** `D-19-main-site-lists-beta-searches.png`, `D-19-main-site-opens-apple-no-data.png`.
- **Owner:** `public/app.js`:
  - `SAVED_KEY` / `loadSaved()` (not per channel);
  - the saved group in `makeCompanyMenu()`, and `openSaved()`;
  - `badgeInfo()` and the error state for an unknown company.

#### D-20 (Medium): server mode with `MELON_CHANNEL=beta` shows demo data for every big-tech board
- **Repro:**
  1. Run `MELON_CHANNEL=beta PORT=<free> node server/index.js`, with the data in `data/beta/snapshots/`, where the
     README's local steps leave it.
  2. Open `http://127.0.0.1:<port>/#c=apple`.
- **Expected:** Apple's 6,105 roles from the snapshot, with the badge "Snapshot". The README says "Beta companies never
  get demo data".
- **Actual:**
  - 80 generated roles, the banner "Demo data — the Apple board couldn't be reached", and "Try the live board again".
  - `/api/jobs?company=apple` returns mode "demo" with the error "Live fetch failed: upstream error". Google gets 76
    demo roles and NVIDIA 64.
- **Cause:**
  - The server reads snapshots only from `MELON_SNAPSHOT_DIR` (default `data/snapshots/`). It has no beta snapshot
    folder like the build's `MELON_BETA_SNAPSHOT_DIR`.
  - The pipeline's `live_disabled` error is reported as "upstream error".
- **Related:** DQ-7 (a failed list load in static mode shows generated postings) breaks the same "never demo" rule
  on another path.
- **Screenshot:** `D-20-server-mode-apple-demo.png`.
- **Owner:** `server/index.js` `SNAPSHOT_DIR` (line 25), `readSnapshot()` (line 184) and `publicError()` (line 130).

#### D-21 (Medium): one range for two levels, labelled only "Multiple pay zones"
- **Same cause as DQ-8** in the data check.
- **Viewport:** 1440x900, light.
- **Repro:** open `/melon-seek/beta/#c=nvidia&job=nvidia%3A893375056870`, "Software Engineering Manager - GPU
  Communications Libraries". The posting says "184,000 USD - 287,500 USD for Level 2, and 224,000 USD - 356,500 USD
  for Level 3".
- **Expected:** the pay block says the range covers two levels and shows each one ("Level 2: $184K–288K · Level 3:
  $224K–357K"), or it uses the posting's own level.
- **Actual:**
  - The pay block reads "$184K–356K · USD · per year · 62% percentile · Multiple pay zones · + equity mentioned ·
    Posted base pay".
  - The label's explanation ("different ranges for different locations or levels") is only a hover title.
  - The card, the chart, the percentile, the stats line, Same role elsewhere and Compare all use the merged
    midpoint ($270K).
  - **Scale:**
    - 840 NVIDIA postings, 60% of its paid ones.
    - Microsoft's "IC5: …; IC6: …" sentences: 169 have two levels, per DQ-8. Example: microsoft:1970393556627435,
      "$143K–296K", which is also labelled "Wide range (2.1×)".
- **Screenshot:** `D-21-nvidia-two-levels-one-range.png`.
- **Owner:**
  - `server/salary.js` `parseSalary`, which merges the level tiers into one min and max;
  - `public/app.js` `payLabels()` (line 2330).

#### D-22 (Medium): Google's pay for roles in Canada is shown in US dollars
- **Viewport:** 1280x800, dark.
- **Repro:** open `/melon-seek/beta/#c=google&job=google%3A104405499448828614`, "Student Researcher, BS/MS,
  Winter-Summer 2027" in Montreal. Its pay line is "$99000 (CAD) + 0% bonus target [Master's degree] Canada: $102000".
- **Expected:** "CA$99K–102K · CAD", with "≈ $70K–73K in approx USD".
- **Actual:** "$99K–102K · USD · per year", the 7th percentile, and Juice "40 · Dry · $40K/yr left in Montreal" from
  $100K gross. The pay is overstated by about 40%.
- **Scale:**
  - 53 of the 55 Google postings with pay and only Canadian locations are in USD, and only 2 in CAD. Example:
    "Software Developer III, Site Reliability Engineering" in Waterloo, "$150000 - $153000".
  - Google's record gives no currency, and the "(CAD)" in the text is ignored.
- **Related, not the same:** DQ-14 (Netflix's 3 Canada-only "$" ranges) and DQ-15 (Google's 4 multi-currency postings).
- **Screenshot:** `D-22-google-cad-shown-as-usd-1280-dark.png`.
- **Owner:**
  - `server/sources/google.js` `mapGoogleJob`, which passes pay without a currency;
  - the currency inference in `server/salary.js`: a posting located only in Canada should default to CAD.

#### D-23 (Medium): the Location filter shows raw codes, fragments and local-script names
- **Partly the same as DQ-1** (its "Unresolved" codes) and **DQ-10** ("Republic of").
- **Viewport:** 1280x800, light.
- **Repro:**
  1. Open `/melon-seek/beta/#c=microsoft`, click **Location** > "Show all" and scroll to the end.
  2. Open `#c=netflix`, click **Location** and search "rep".
- **Expected:** canonical names, per CONTRACT "Location (2026-10-02, UX-3)": "Spain", "Norway", "Seoul, South Korea",
  "Helsinki, Finland", "Bangkok, Thailand".
- **Actual:**
  - Bare ISO codes:
    - Microsoft: "ES" 22, "NO" 4, "KW" 3, "BE" 2, "LT" 2, "LV" 2, "PT" 2, "BR", "HR" and "MX";
    - NVIDIA: "ES" 12, "MX" 4, "IT" 3, "AM" 3, "NO" and "BR";
    - also "SP, BR" 5, "Brasília, DF, BR" and "Jeddah, Makkah Province, SA".

    "ES" reads like a word, and "NO" like "no".
  - "Republic of" is listed as a place: Apple 24 and Netflix 18, from "Seoul, Korea, Republic of".
  - Local abbreviations are kept as the city name:
    - "ב"ש" (Be'er Sheva) 28 + 3, and "ק"א" 13;
    - "HKI" (Helsinki) 10 + 1, "กทม" (Bangkok) 12, and "BKC" (Mumbai).
  - These names are grouped under the heading "Unknown Region" on Microsoft, NVIDIA, Netflix and Apple.
- **Screenshots:** `D-23-microsoft-location-codes-unknown-region.png`, `D-23-netflix-republic-of.png`.
- **Owner:**
  - `server/geo.js`:
    - `regionInfo()` and `COUNTRIES`: no lookup by ISO-2 code for ES, NO and the others;
    - `splitCommaGroups()` cuts off "Republic of";
    - the gazetteer aliases.
  - `public/app.js`: `derive()` groups a location with no country under 'ZZ', and `countryName('ZZ')` gives "Unknown
    Region". `countryName()` only turns a missing code into "Other".

#### D-24 (Low): Google has no departments, so its default chart is a single row
- **Viewport:** 1440x900, light.
- **Repro:** open `/melon-seek/beta/#c=google`.
- **Expected:** the default Clusters view splits the roles into several rows, as on the other boards, and the
  Department filter narrows the list.
- **Actual:**
  - Every role is "No department". The chart has one row, "No department · 3,417 roles".
  - The Department filter has one option (3,417). Ticking it changes nothing.
  - The stats line says "mostly No department", and so does every card.
- **What's available:** the adapter keeps Google's brand in `team` (Google 3,174, YouTube 144, DeepMind 95), and each
  role has a role family.
- **Screenshot:** `D-24-google-no-department.png`.
- **Owner:**
  - `server/sources/google.js` `mapGoogleJob`, which sets `department: null`;
  - the default grouping in `public/app.js` (`DEFAULTS.g`, `groupDefault`) for a board with one department.

#### D-25 (Low): the big-tech boards have no source name: "Apply on job board" and "Other"
- **Viewport:** 1440x900, light.
- **Repro:** on `/melon-seek/beta/#c=apple`, open any role and look at the Apply button. Then open the company menu.
- **Expected:**
  - The button reads "Apply on Apple careers". The host line under it already says jobs.apple.com.
  - The five beta companies, the reason for the beta, are under a heading like "Careers sites", visible without
    scrolling.
- **Actual:**
  - The button reads "Apply on job board" for Apple, Google, NVIDIA, Microsoft and Netflix.
  - The menu puts them under "OTHER", after the 8 ATS boards. At 1440x900 that heading is cut off at the bottom of
    the list, and the five need a scroll.
- **Screenshots:** `D-25-apply-on-job-board.png`, `D-25-company-menu-other-group.png`.
- **Owner:** `public/app.js`:
  - `SOURCE_LABEL` (line 72);
  - the Apply button in `drawerContent()` (around line 2453);
  - the groups in `makeCompanyMenu()` (around line 921).

  `sourceText()` already says "Apple careers site".

#### D-26 (Low): the top-bar Refresh offers a live refresh on boards that have none
- **Viewport:** 1440x900, light.
- **Repro:** on `/melon-seek/beta/#c=apple`, hover the ↻ button, then click it.
- **Expected:** no live refresh is offered. The badge popover already hides its "Refresh from the live board" for
  snapshot-only boards.
- **Actual:** the tooltip says "Refresh from the live board". Clicking reloads the bundled 2.55 MB list (no external
  request) and shows the toast "This board is only available as a saved snapshot".
- **Screenshot:** `D-26-refresh-on-snapshot-only-board.png`.
- **Owner:** `public/app.js`: `#refreshBtn` in `renderTopbar()` (line 798), against `bundleOnly` in
  `makeBadgeDetails()` (line 877).

#### D-27 (Low): "Beta" is only a CSS pill: not in the tab title and not read by screen readers
- **Repro:** open `/melon-seek/beta/` with a screen reader on, or look at the browser tab.
- **Expected:** the page tells every user that it is the beta.
- **Actual:**
  - The tab title is the main site's, "melon·seek — job boards, plotted by salary".
  - The pill is `.brand::after` content on a link whose aria-label, "melon·seek home", replaces it, so screen readers
    don't announce it.
  - Nothing says what the beta adds (the big-tech boards, crawled every 6 hours).
- **Decision needed:** CONTRACT v3 allows "a small Beta tag by the logo and nothing else new". A title suffix and an
  aria-label add no control.
- **Screenshot:** `D-27-D-28-beta-topbar.png`.
- **Owner:**
  - `public/styles.css`, the `html[data-channel="beta"] .brand::after` rule (line 1260);
  - the beta `index.html` title in `scripts/build-static.js`;
  - `#pageTitle` in `public/app.js` `renderTopbar()`.

#### D-28 (Low): the beta site has no link back to the main site
- **Repro:** on `/melon-seek/beta/`, look for a way to `/melon-seek/`.
- **Expected (per the QA brief):** a working link back to the main site.
- **Actual:** there is none.
  - The logo resets the filters inside `/beta/`.
  - The methodology page's "melon·seek" link and the share pages lead back to `/beta/`.
  - The page's only links are the two skip links and the logo.
- **Decision needed:** the same as D-27. The pill could be that link.
- **Screenshot:** `D-27-D-28-beta-topbar.png`.
- **Owner:** `.brand` in `public/index.html`, the beta rule in `public/styles.css`, and the beta copy in
  `scripts/build-static.js`.

#### D-29 (Low): the Ranges tooltip repeats a code-only currency: "PLN 345K – PLN 702K PLN"
- **Viewport:** 1024x768, light.
- **Repro:** open `/melon-seek/beta/#c=nvidia&v=ranges&l=Warsaw` and hover a row.
- **Expected:** "PLN 345K – 702K" or "PLN 345K – PLN 702K", reading as "€X – €Y EUR" does for currencies with a
  symbol.
- **Actual:** "PLN 345K – PLN 702K PLN". CHF and CZK do the same (Microsoft: "CHF 232K – CHF 470K CHF").
- **Screenshot:** `D-29-pln-twice-in-ranges-tooltip-1024.png`.
- **Owner:** `public/viz/chart.js` `showJobTip()`. Line 981 appends `` ` ${cur}` `` after `palette.js`
  `formatCurrency()` has already written "PLN ".

#### D-30 (Low): Apple's "most new hires start at $X" is labelled "Multiple pay zones"
- **Viewport:** 1440x900, light.
- **Repro:** open `/melon-seek/beta/#c=apple&job=apple%3A200639036-3253`, "US-Operations Specialist". Its pay text is
  "$23.00 and $30.59/hr, and most new hires start at $23.00".
- **Expected:** no zone label. This is one range plus a starting figure.
- **Actual:** "Multiple pay zones", with the tooltip "The posting lists different ranges for different locations or
  levels". All 44 Apple postings with that sentence have `salary.zones: 2`.
- **Screenshot:** `D-30-apple-new-hire-figure-as-pay-zones.png`.
- **Owner:** the zones count in `server/salary.js` `parseSalary` (around line 472), which counts every distinct
  candidate as a zone, including a single figure.

### Notes
- **Seen on beta, already known, not re-filed:**
  - known (P-2): Compstimate "Senior · Tel Aviv-Yafo" or "Mid · Japan" from US pay;
  - known (P-3): "Mid" defaults;
  - known (P-6): US pay on a non-US pin ("Bengaluru, India + 30 nearby · median $217K" on Google's world view);
  - known (P-8): hourly intern pay annualized ("$83K–229K" for a Netflix intern);
  - known (P-14): "(update due)" on every footnote;
  - known (P-16): "0% percentile" and "Pays more than 0% of roles" on an Apple retail role;
  - known (P-18): the red "Juice left" bar and the $1K monthly rounding.
- **Data-check items that also show on the desktop:**
  - DQ-2: Apple's per-location copies, e.g. "Community Specialist, Channel Retail" three times in Lowest pay;
  - DQ-3: Netflix's Mid median $473K is above Senior's $310K, because "(L5)" isn't read;
  - DQ-9: Apple store names pinned at the US centroid ("Fairfax Corner, US") and double-encoded Apply links;
  - DQ-12: 60 NVIDIA "#LI-Hybrid" roles carry the Remote tag.
- **Suggestion:** Market insights' "Skill premium" on Apple shows "+$17K" for five skills in a row (Microsoft "+$9K"
  ×5), because big-tech pay comes in shared bands. A note, or a bigger minimum difference, would read more honestly.
- **Not testable here:** live fetches, map tiles, and opening the careers hosts behind the Apply links.

### Suite results
| Suite | Tree | Result |
|---|---|---|
| `npm test` | shared checkout, HEAD `125bf64` plus the other agents' uncommitted files | **601/627** pass. The 26 failures are all the data check's new `DQ-1`…`DQ-17` tests in `test/beta-data-check.test.js`, which fail by design until those bugs are fixed. |
| `node scripts/e2e.js --grep='^Beta desktop QA'` | same, against the lead's `dist/` (build `local-20261010T123230`) | **5/19**: the 5 guards pass; `[D-17]`…`[D-30]` fail by design. |
| `node scripts/e2e.js` | same, with the beta mobile group registered too | **112/140** pass, 2 skipped. |

The skips are Desktop QA `[D-11]` (these boards have listing dates) and the methodology screenshots (they need
`E2E_SHOTS=1`).

The 26 failures:
- the 14 `[D-17]`…`[D-30]` above;
- the beta mobile group's 11 `[M-19]`…`[M-29]`;
- that group's guard "every big-tech board loads from its snapshot…". It fails on its own check: it expects the CSV
  link `data/google.csv` but reads the resolved URL. The beta mobile agent owns it.

Every 2026-10-03 desktop and mobile test now passes. That includes `[D-2]`…`[D-12]`, which are fixed, except
`[D-11]`, which skips on this data.

All runs used `NODE_PATH=<scratchpad>/pw/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. The full run
rewrites `docs/screenshots/*.png` and `qa-mobile/e2e-landscape-map.png` (the UI and mobile suites' own shots); those
were restored afterwards, so this pass leaves them unchanged.

The beta mobile QA found some of the same bugs on phones:
- `[M-20]` is D-18;
- `[M-21]` is D-24;
- `[M-24]` is part of D-23;
- `[M-25]` is the paused-company message in D-19;
- `[M-23]` is the menu scroll in D-25.

---

## Full QA pass (mobile, beta) 2026-10-10

A functional pass of the phone beta site (`/melon-seek/beta/`) by the beta mobile QA agent. The process log, with
every replayable command, is in [`docs/process/qa-mobile-beta.md`](process/qa-mobile-beta.md). No product code was
changed.

**Setup**
- **Builds:**
  - The pass ran on `node scripts/build-static.js --out <scratch>/qa-mobile-beta/dist` at HEAD `48f913c`.
  - The lead then integrated persona fix wave batch 1 (`ea7cd0b`, `be5691c`) into the shared checkout. I rebuilt at
    `be5691c` (`<scratch>/qa-mobile-beta/dist-head`) and re-checked every finding there.
  - All of M-19…M-26 still reproduce at `be5691c`. M-27 is new in batch 1. Where batch 1 changed what a phone shows, it
    is noted.
  - Both builds log `beta: 5/5 beta companies included` and the expected warning that Apple's list is 2.55 MB (budget
    1.50 MB). Each was served under `/melon-seek/` by `scripts/cycle/serve.mjs` (gzip, pid file).
- **Data:** the first full big-tech crawl (snapshot.yml run 38044091555) in `data/beta/snapshots/` and the stable boards
  from 11:42 UTC. Every board is `mode: "snapshot"`: Apple 6,105, Google 3,417, NVIDIA 2,664, Microsoft 2,320, Netflix
  456, and Anduril 2,491 for comparison.
- **Browser:** Playwright 1.63 and Chromium 141, with `isMobile`, `hasTouch` and DPR 3. Every request to another host
  was aborted and logged.
  - Devices: 360x740 Android UA, 390x844 and 430x932 iPhone UA, and 844x390 landscape with an iPhone UA.
  - Each device ran in light and dark.
- **Gestures:** real touch, using `touchscreen.tap` and CDP `Input.dispatchTouchEvent` for drags, flicks, swipes and
  the two-finger pinch.
- **Simulations:**
  - Safe areas: CDP `setSafeAreaInsetsOverride`, portrait 47/34, landscape 47/47/21.
  - The keyboard: `visualViewport.height = innerHeight − 336` while a field has focus.
  - CPU throttled 4x for the timings.
- **Load:** the machine's load average was 4 to 10 (other agents), so timings are about ±30%. The performance agent
  measures later on a quiet machine.
- **Overlap with the parallel reports:** these items reproduce the same way on phones and are not re-filed:
  - D-18: a saved search with more than 2,000 matches shows "392 new" right after saving. On phones: "Apple · Hardware ·
    392 new".
  - D-24: Google has no departments.
  - DQ-10: the phantom "Republic of" location. On phones it shows as "UNKNOWN REGION · Republic of 18" in Netflix's
    Location filter.

  M-21 adds the phone parts of D-25.

  The desktop section's closing list (for example "`[M-20]` is D-18") refers to my first draft numbering. In the final
  numbering:
  - draft M-20 (D-18), M-21 (D-24) and M-24 (DQ-10, part of D-23) were dropped as duplicates;
  - draft M-23 (company menu) is now **M-21**;
  - draft M-25 (paused board) is now **M-22**.

**New e2e tests:** [`test/e2e/beta-mobile-qa.e2e.js`](../test/e2e/beta-mobile-qa.e2e.js), registered in
`scripts/e2e.js`. Run them with `node scripts/e2e.js --grep='^Beta mobile QA'`.
- They serve the shared `dist/` (`npm run build`) under `/melon-seek/` and open `/beta/`. They skip when `dist/beta/` is
  missing, and `BETA_QA_DIST=<dir>` points them at another build.
- **On a build of HEAD `be5691c`, 5/14 pass:** the 5 guards. The 9 failures are exactly the tests tagged
  `[M-19]`…`[M-27]`.
- The shared `dist/` predates batch 1 (build `local-20261010T123230`), so `[M-27]` passes there. Rebuild `dist/` to see
  it.

### What works on phones (beta)

- **Beta only:**
  - **The Beta pill at 360 px:**
    - On the `48f913c` build it fits: the pill sits at x 12–55, the company menu starts at 61 and "Microsoft" is whole.
    - Batch 1 shows the logo on phones (I-2), and the pill moved beside it. Now the company name is cut off ("Mic…"):
      see M-27.
  - There is no horizontal scroll on any board, size or theme, and no console or page error anywhere, on either build.
  - **`live: false` boards make no live request.**
    - Apple, Google, Microsoft, NVIDIA and Netflix sent 0 requests to any other host. Anduril sends its one expected
      Greenhouse attempt.
    - The badge reads "Snapshot · Oct 10" (at ≤400 px, "Oct 10"), and its accessible name is "saved snapshot from Oct 10".
    - The popover says "This board is collected by the site's crawler; your browser can't fetch it live", with no
      "Refresh from the live board". The top-bar refresh is hidden on phones.
  - **The big boards on a phone, 4x CPU, iPhone 390:**

    | Board | First card | Chart | Sort, to next frame | Filter tap (Event Timing) | Heap |
    |---|---|---|---|---|---|
    | Apple | 3.75 s | 3.95 s | 248–305 ms | 272–312 ms | 30 MB |
    | Google | 3.20 s | 3.53 s | 112–326 ms | 440 ms | 14 MB |
    | NVIDIA | 3.16 s | 3.46 s | 193–288 ms | 240–320 ms | 13 MB |
    | Microsoft | 2.30 s | 2.52 s | 136–201 ms | 200–232 ms | 13 MB |
    | Netflix | 1.81 s | 2.06 s | 107–172 ms | 192–288 ms | 8 MB |
    | Anduril (stable) | 2.81 s | 3.17 s | 170–416 ms | 240–304 ms | 14 MB |

    - Everything answers well within a second. At 1x, Apple's sorts take 59–161 ms.
    - **What Apple's 2.55 MB list costs a user:**
      - 367 kB gzipped (Google 270 kB, Netflix 311 kB, Anduril 164 kB), about 1.8 s on Slow 4G before parsing;
      - about 1 s more to the first card than Anduril, and 1.5 s more than Microsoft, at 4x CPU;
      - a 258 ms long task while loading;
      - twice the heap of any other board.
  - **Memory stays bounded across the big boards.**
    - The heap goes from 6.7 MB (Netflix) to 34 MB after one round of Apple, Microsoft, Google and NVIDIA. It then stays
      at 34–35 MB over two more rounds, 36–37 MB in Map and 40 MB in Insights.
    - About 960 DOM nodes per board. The session cache keeps each visited board, so the ceiling is the number of boards.
  - **The company menu** is a full-width sheet (0–360) and lists the 5 big-tech boards. "micro" plus Enter switches to
    Microsoft (2,320), and focus returns to the menu button. At `be5691c` the headings are gone: there is one
    "Companies" list, with the big-tech boards still last (M-21).
  - **CSV:** the badge popover link is 44 px tall, and `data/microsoft.csv` has 2,321 lines (header plus 2,320 roles),
    and so on for each board.
- **Top bar:**
  - Theme cycles Light > Dark > System, and the body background follows.
  - Chart, Map and Insights each collapse the sheet to peek.
  - The badge popover closes on a tap outside.
- **Quick chips:**
  - A swipe scrolls the row 199 px while the page stays at 0,0.
  - Each chip opens the filter sheet at its section, with focus on that section, `aria-expanded="true"`, and focus back
    on the chip after ✕. M-4, M-11 and M-15 are fixed.
  - More: Juicy 2,071 gives "See 2,071 roles" and 2,071 results.
- **Filter sheet (Apple), counts checked against the bundle:**
  - Salary drag ($40K–$510K domain): smin 250K gives 2,774.
  - Typed max "300k" gives 3,835.
  - Salary-only switch, then Hardware, gives 1,799.
  - Seniority, On-site and keyword chips stack down to 1 role.
  - "Show N roles" always equals the results title.
  - Back closes the sheet and keeps the filters (M-3 is fixed).
  - Reset clears everything, including the slider and the Min box. The sheet is a modal dialog with the page behind it
    inert (M-7).
- **Results sheet (Apple):**
  - A slow drag snaps peek > half > full.
  - Flicks go full > half and half > full.
  - Handle taps cycle.
  - The list lazy-loads 24 > 80 > 552 cards over 30 swipes, with worst frames of 17–33 ms at 1x.
  - All 5 sorts reorder the list. A card tap opens the job page.
- **Chart:**
  - A bin tap gives the chip "Hardware · $200K–$250K (776)" and the 776 roles.
  - A row-label tap gives "Design (49)".
  - A single-role bin opens the job.
  - Ranges labels use the full width (M-17 is fixed), and a row tap opens the job.
  - No information is hover-only.
- **Map (Apple, Microsoft, Google, landscape):**
  - Pan and pinch move only the map: the page stays at 0,0 at scale 1, and pins go from 5 to 14, 18 or 19.
  - A pin tap gives "Anchorage, AK (3)".
  - Pay|Juice recolours the pins and sets `mc=juice`.
  - Remote gives "Remote (313)" on Microsoft.
  - In landscape, the Remote badge (bottom 316) sits above the sheet (326). M-1 is fixed.
- **Insights:**
  - Every Compstimate input and select is 16 px and 44 px tall, and focus doesn't zoom (scale 1).
  - Compstimate is ready in 0.87 s on Apple (2.8 s at 4x).
  - Compare companies lists all 13 companies. A row tap switches company with `rf=swe` (NVIDIA to Netflix, 78 roles).
- **Job page (each big board):**
  - It is full screen (390x844), with Back at x=4, 44 px, holding focus.
  - Next and prev step 1 > 2 > 3 > 2 of 6105 and add a single history entry (M-9 is fixed).
  - Apply opens the posting in a new tab on jobs.apple.com, google.com/about/careers, apply.careers.microsoft.com,
    jobs.nvidia.com or explore.jobs.netflix.net.
  - Juice → Family recomputes ($194K > $181K left for an Apple director in San Jose).
  - "How it's calculated" opens `/beta/methodology/` (200). It reflows at 390 with no "undefined" (M-5 and M-6 are
    fixed).
  - A "Same role elsewhere" row switches to Anthropic with `s=Mid&rf=sales`, and Back reopens the Microsoft job.
  - The Back arrow and hardware Back both close the page, with focus on the card (M-16 is fixed).
- **Save:**
  - The Save chip is 44x44, and saving shows a toast.
  - 5 simulated new roles on a Netflix search show "5 new".
  - Reopening applies the search, and un-saving works.
- **Device behaviour:**
  - Rotating with the sheet full or the job page open re-snaps.
  - Safe areas: the top bar starts at 53 with a 47 px notch in portrait, and in landscape the top bar and chart labels
    start at 47 (M-10 is fixed).
  - With the keyboard up:
    - the search count stays above the keyboard ("443 roles · 18 in title", ending at 487 of 508; M-12 is fixed);
    - the company menu lifts to 8–500;
    - the filters footer hides;
    - a focused Min or Max box stays visible.
  - No text under 12 px and no input under 16 px in any state at 360, 430 or landscape.

### Earlier mobile bugs on the beta build

| ID | Status |
|---|---|
| M-1, M-3, M-4, M-5, M-6, M-7, M-9, M-10 (chart), M-11, M-12, M-13, M-15, M-16, M-17 | Fixed |
| M-2, M-14, M-18 | Fixed in code. Canonical "Remote (US)" names are in the lists; the M-14 and M-18 paths were read, not driven |
| M-8 | Partly fixed. CSV link, comps rows (44 px) and Insights fields (44 px) are fixed. The map zoom (30x30), Pay\|Juice (52x26) and Remote badge (32 tall) are still open (`public/viz/viz.css`); M-25 lists new ones |

### Known items seen on the beta boards (not re-filed)

- **P-3 "Mid":** Apple 4,588 of 6,105 roles (75%) show "Mid", Google 1,622 and Netflix 246. The Seniority chip's
  biggest option is "Mid". DQ-3 has the board-level causes.
- **P-6:**
  - At world zoom, cluster labels group whole regions: "Shanghai, China + 45 nearby · 1,254 jobs" and "Cupertino, CA +
    109 nearby".
  - Labels overlap and get cut off at 360–390 ("Redmond, WA" cut at the left edge; "London, UK + 24 nea…" under
    Cupertino's pin).
  - `map-apple-390-light.png`, `map-microsoft-360-dark.png`.
- **P-11:** at `48f913c`, "No other company lists this level, so this compares all Data science & analytics roles" on
  an Apple director, and a Google "(Fixed-Term Contract)" role compared at Mid. At `be5691c` the note gives the real
  reason ("Too few Director+ … roles elsewhere list pay").
- **P-12:** a reopened saved search with "5 new" marks no card New (`48f913c`).
- **P-14:** "(update due)" on Juice and comps footnotes at `48f913c`; gone at `be5691c`.
- **I-3 / D-25:** "Apply on job board" on every big-tech posting, and the "Other" heading in the company menu, at
  `48f913c`. At `be5691c` the button reads "Apply on Apple's careers site" (and so on for each board), and the menu has
  one "Companies" list.
- **Data (`data-check-beta.md`):**
  - NVIDIA's departments are job-family codes: 146 values such as "Engineer, Sys SW", "Mgmt, Legal (Legal)" and
    "Intern" (140). Microsoft has 141 departments. So the default Department chart opens with 1- and 2-role rows
    ("Segment Management · 2 · $435K").
  - DQ-1 (NVIDIA and Microsoft locations), DQ-10 ("Republic of").

### Bugs (ordered by severity)

Severity: **High** blocks or hides a core task; **Medium** is friction, wrong output or an accessibility failure;
**Low** is polish. Screenshots are in `docs/screenshots/qa-mobile-beta/`.

| ID | Sev | Device / orientation | Summary |
|---|---|---|---|
| M-19 | Medium | All phones (390x844 iPhone tested) | Changing the sort or a filter while scrolled down keeps the scroll offset: the new top results are above the view |
| M-27 | Medium | 360x740 (and 430x932 for Netflix), `be5691c` only | With the logo now shown on phones, the Beta pill and logo push the company name to "Mic…" |
| M-20 | Medium | All phones; 1x and 4x CPU | The results list never recycles cards: a long scroll on Apple leaves 1,500–2,000 cards (23–31k nodes) in the page; the worst swipe frame goes from 34 to 83–133 ms (1x), and a sort from 0.48 to 0.8–0.9 s (4x) |
| M-21 | Low | 360–430 portrait | Company menu: the five big-tech boards are below the fold, and the menu opens without the current board (Apple ✓) in view |
| M-22 | Low | All | A link to a paused board (`#c=amazon`, `#c=meta`, `#c=tesla`) shows "Offline" and a Retry that can never work |
| M-23 | Low | All | Big counts: map pins cap at "999+" (Cupertino is 4,460), and the job page reads "1 of 6105" |
| M-24 | Low | 390x844, keyboard up | In the filter sheet, the Location/Department search scrolls to mid-screen, so its matches are under the keyboard |
| M-25 | Low | 360–430 portrait | Touch targets under 44 px: the filter-sheet Remote segment (32), Juice "How it's calculated" (15) and 38 Market insights rows (26) |
| M-26 | Low | All phones | The Filters button after a chip reopens the sheet at that chip's section, with focus on Salary, 1,800 px off-screen |

#### M-19 (Medium): a new sort or filter keeps the old scroll offset, so the top results are hidden
- **Device:** iPhone 390x844, light. The same code runs on every phone; it matters most on long lists.
- **Repro:**
  1. Open `/melon-seek/beta/#c=apple`.
  2. Tap the sheet handle twice to get the full sheet.
  3. Swipe the list up 8 times (scrollTop 12,384, 112 cards).
  4. In the sheet header, choose Sort → "Lowest pay".
- **Expected:** the list starts at the top of the new order, the $46K–60K "Community Specialist" role.
- **Actual:**
  - The list is rebuilt with 40 cards but keeps scrollTop 2,872. The first visible card is #27, "Seasonal Advisor,
    Channel Retail $51K–62K".
  - The 26 lowest-paid roles sit above the view, and nothing says so.
  - The e2e runs give #20 (scrollTop 2,110) and #31 (3,296); the number depends on how far you scrolled.
  - A filter change behaves the same: after `s=Senior`, the first visible card is #20.
- **Screenshots:** `sort-while-scrolled-apple-390.png`, `e2e-M-19-sort-while-scrolled.png`.
- **Owner:** `public/app.js` `renderResults()`.
  - `list.replaceChildren(...items)` keeps the old `scrollTop`.
  - When the list is rebuilt for a new order or filter (`set()` resets `resultsLimit = PAGE`), set `#resultsList.scrollTop = 0`.
  - `settleLive()` keeps its own scroll restore for the live-board swap.
- **Test:** `Beta mobile QA: [M-19] …` (fails today).

#### M-27 (Medium): at HEAD `be5691c` the company name no longer fits the phone top bar next to the Beta pill
- **New in persona fix wave batch 1.** On the `48f913c` build the same row fit.
- **Device:** 360x740 (Android UA), light and dark. Netflix is also cut at 430x932: above 400 px the badge shows the
  full "Snapshot · Oct 10" (153 px).
- **Repro:** on a build of `be5691c`, open `/melon-seek/beta/#c=microsoft` at 360x740.
- **Expected:** the Beta pill fits the 360 px top bar, as the brief requires, and the board's name stays whole
  ("Microsoft"), as it did before batch 1.
- **Actual:**
  - I-2 now shows the melon logo on phones, and the beta pill moved beside it (`.brand::after`). The row is:
    logo and pill 12–89, company menu 97–206, badge 214–296, theme 304–348.
  - The menu shows "Mic…": 44 of the name's 74 px.
  - Apple loses 2 px at 360. Netflix shows 43 of 51 px at 430.
  - The logo link is a 77x26 tap target, and in landscape the theme button shrinks to 40x44.
- **Screenshots:** `head-landing-microsoft-360-light.png`, `e2e-M-27-topbar-360.png`, `head-landing-netflix-430-dark.png`.
- **Owner:** `public/styles.css`. Two rules meet:
  - the I-2 phone rule in the "Persona review fixes" block (`.brand { display: flex; order: 1 }`);
  - the beta pill (`html[data-channel="beta"] .brand::after`, with `.company-bar::before { content: none }`).

  For example, in the beta channel show the pill instead of the logo image at ≤ 400 px, or switch the badge to its
  short label earlier. Both rules are the app lane's file.
- **Test:** `Beta mobile QA: [M-27] …` fails on a `be5691c` build. It passes on the older shared `dist/`.

#### M-20 (Medium): the results list grows without limit, so long scrolls on the big boards slow down
- **Device:** iPhone 390x844, at 1x and 4x CPU.
- **Repro:**
  1. Open `/melon-seek/beta/#c=apple` with the sheet full.
  2. Keep scrolling: each time the end comes near, 4 more cards are appended per frame.
- **Expected:** scrolling stays as smooth on a 6,105-role board as at the top of the list, and a sort answers as fast.
- **Actual:** cards are only ever appended, never recycled.

  Apple, the same machine and run, 6 swipes each:

  | Cards in the page | DOM nodes | Worst swipe frame, 1x | Worst swipe frame, 4x CPU | Sort to the next frame, 1x / 4x |
  |---|---|---|---|---|
  | 24 (top of the list) | 877 | 34 ms (0 of 251 frames over 50 ms) | 83 ms (6 of 247) | 144 / 481 ms |
  | 2,000 (one long scroll) | 30,585 | **83–133 ms (7–9 over 50 ms)** | **250 ms (9–13 over 50 ms)** | 204–240 / **798–913 ms** |

  - The e2e test stops at 1,504 cards and 23,084 nodes.
  - Two runs at load average 3 and 9 bracket the 2,000-card row.

  Scrolling through all of Apple would leave about 6,100 cards (≈ 95k nodes). Google (3,417) is next in size. The
  heap stays small (17 MB), so the cost is layout and style, not memory.
- **Screenshot:** `deep-list-apple-390.png`. A probe overlay prints the card and node counts; there is no other
  visible symptom.
- **Owner:** `public/app.js` `renderResults()`.
  - The lazy pages (`listIO`, `loadMore(4)`) never remove anything.
  - Fix: keep a window of cards with spacers of the known card height, as `public/viz/chart.js` already does for chart
    rows (`vItems`); or cap the in-page list (for example 300 cards) and replace it on "Show more".
  - For the performance agent to confirm on a quiet machine.
- **Test:** `Beta mobile QA: [M-20] …` asserts at most 600 cards in the page after scrolling past 1,500 roles. It fails
  today with 1,504.

#### M-21 (Low): company menu: the big-tech boards are below the fold, and the current one is not shown
- **Same cause as D-25** (the "Other" group in `makeCompanyMenu()`), which the desktop pass filed for the heading and
  order. Filed here for the phone symptoms.
- **Device:** 360x740, 390x844 and 430x932 portrait.
- **Repro:** on `/melon-seek/beta/#c=apple`, tap the company menu.
- **Expected:** the beta's five boards are visible without scrolling. The menu opens with the current board (✓) in
  view, so you can see where you are.
- **Actual:**
  - At `48f913c` the list shows the 8 stable boards first, under GREENHOUSE, ASHBY and LEVER, and the big-tech boards
    last under "Other". At 360x740 the list area is 329–669 while Google starts at 767 and Apple ✓ at 855. At 390x844
    Apple ✓ is at 959–1003 against a visible list of 433–773.
  - At `be5691c` there is one "Companies" list, with the five still last. At 360x740 Google starts at 702 against a list
    ending at 669. At 390x844 Apple ✓ is at 894–938 against 433–773.
  - On a phone you scroll past every stable board to reach the one you are on.
- **Screenshots:** `company-menu-360.png`, `e2e-M-21-company-menu.png`.
- **Owner:** `public/app.js` `makeCompanyMenu()` `sync()` (the groups), and `togglePopover('company')`, which should
  scroll the `aria-current` item into view when the menu opens.
- **Test:** `Beta mobile QA: [M-21] …` (fails today).

#### M-22 (Low): a link to a paused board says "Offline" and offers a Retry that can never work
- **Device:** all (390x844 iPhone tested).
- **Repro:** open `/melon-seek/beta/#c=amazon`. The same happens for `#c=meta` and `#c=tesla`. The user asked for these
  three, and the README says Amazon and Meta are paused because of their terms.
- **Expected:**
  - The page says the board isn't on melon-seek, and why (paused: the site's terms bar automated collection).
  - It offers the company menu.
  - There is no "Offline" state and no Retry.
- **Actual:**
  - The badge is a red "Offline" (aria "Data source: Offline").
  - The chart area reads "Couldn't load this board · Unknown company "amazon"" with a green **Retry**.
  - The sheet reads "No data".
  - The company button shows the slug, "amazon", in lower case.
- **Screenshots:** `deeplink-amazon-390.png`, `e2e-M-22-paused-board.png`.
- **Owner:**
  - `public/app.js`: `loadJobs()` (the error path), `badgeInfo()` (the `error` branch), and the error card in
    `renderViz()` and `renderResults()`;
  - `public/api.js` `getJobs()` for a slug missing from `api/companies.json`.

  Paused companies are in `server/companies.js` (`paused: 'terms'`). The build could list them as paused, so the app
  can say so. The desktop pass's D-19 (a beta saved search opened on the main site) ends on the same error card.
- **Test:** `Beta mobile QA: [M-22] …` (fails today).

#### M-23 (Low): big counts are capped or unformatted
- **Device:** all (390x844 and 360x740 tested).
- **Repro:**
  1. Open `/melon-seek/beta/#c=apple&m=map`.
  2. Tap the "$214K 999+ Cupertino, CA + 109 nearby" pin ("Cupertino, Austin and 108 more" at `be5691c`).
  3. Open any role.
- **Expected:** pins say how many roles they hold, as their neighbours do, and the job page counter is formatted like
  the rest of the app ("6,105 roles").
- **Actual:**
  - The pin says "999+", and its chip says "Cupertino, CA + 109 nearby (4,460)".
  - The next pin, without pay, prints "1,254 jobs".
  - Microsoft's Redmond pin is also "999+".
  - The job page reads "1 of 6105".
  - The big boards are the first where clusters pass 999.
- **Screenshots:** `map-apple-390-light.png`, `map-microsoft-360-dark.png`, `job-apple-390.png`.
- **Owner:**
  - `public/viz/map.js` `pinElement()` (lines 404 and 413, `c.n > 999 ? '999+'`). Use `formatMoney`-style short
    counts ("4.5K"), as the stats do.
  - `public/viz/chart.js` line 598 (the same cap on bins).
  - `public/app.js` `renderDrawerNav()` (`${idx + 1} of ${visible.length}` without `toLocaleString()`).
- **Test:** `Beta mobile QA: [M-23] …` (fails today).

#### M-24 (Low): with the keyboard up, filter-sheet search results are under the keyboard
- **Device:** iPhone 390x844 with the simulated keyboard (visible height 508 px).
- **Repro:**
  1. On `/melon-seek/beta/#c=apple`, tap Filters.
  2. Tap the Location search box. Apple has 444 locations, so the search is how you find a city.
  3. Type "sea" (or "san").
- **Expected:** the box moves near the top of the visible area, so its matches show above the keyboard.
- **Actual:**
  - The box is scrolled to the middle of the full 844 px screen (field 428–472), which is the keyboard's top edge.
  - The first match, "Seattle 82", ends at 544, under the keyboard (508). Further matches are hidden.
  - You have to close the keyboard to see what you typed for.
- **Screenshots:** `e2e-M-24-keyboard-location-search.png` (the grey box marks the keyboard),
  `kb-filter-location-apple-390.png`.
- **Owner:** `public/app.js` `bindKeyboardInsets()`. The focusin handler runs `e.target.scrollIntoView({ block: 'center' })`
  for `#filters input`. With `body.kb-open`, scroll to `block: 'start'`, or keep the field and a few rows inside `--vvh`.
- **Test:** `Beta mobile QA: [M-24] …` (fails today).

#### M-25 (Low): more touch targets under 44 px
- **Device:** 360–430 portrait.
- **Repro and actual:**

  | Control | Size (px) | Screenshot |
  |---|---|---|
  | Filter-sheet Remote segment (Any / Remote / On-site) | 109–132 x 32 | `filters-remote-segment-32px-390.png` |
  | Juice "How it's calculated" link | 106x15 | `juice-link-15px-390.png` |
  | Market insights rows (skills, departments, locations; 38 on Apple) | 318x26 | `insights-rows-26px-390.png` |

- **Expected:** at least a 44 px hit area, or padding that gives one. The salary Min and Max boxes are 23 px tall, but
  their labels are 172x55, which is an equivalent hit area, so they are fine.
- **Owner:**
  - `public/styles.css` phone block: `.seg--block button` and `.juice-disclaimer a`;
  - `public/features/features.css`: the Market insights row buttons.

  The open M-8 items (map zoom, Pay|Juice, Remote badge) are in `public/viz/viz.css`.
- **Test:** `Beta mobile QA: [M-25] …` (fails today).

#### M-26 (Low): the Filters button after a chip: focus lands on Salary, off-screen
- **Device:** all phones (390x844 tested).
- **Repro:**
  1. Tap the Remote chip; the sheet opens at Remote.
  2. Tap ✕.
  3. Tap Filters.
- **Expected:** the sheet opens at the top with focus on Salary, or keeps Remote with focus on Remote.
- **Actual:**
  - The sheet keeps scrollTop 1,855, with Remote at the top.
  - Focus goes to the Salary summary at y −1,798, off-screen.
  - A screen reader announces "Salary" while Remote is on screen (the M-11 family, by another path).
- **Screenshot:** `filters-button-after-chip-focus-390.png`.
- **Owner:** `public/app.js` `setFiltersOpen()`, `target = focus || $('#filters summary')`. When the sheet is opened
  from `#filtersToggle`, scroll `#filterBody` to the top.
- **Test:** `Beta mobile QA: [M-26] …` (fails today).

### Coverage notes
- **Not testable here:**
  - real WebKit/iOS Safari (toolbar dvh, a real keyboard, swipe-back);
  - live boards and map tiles (grey tiles are expected);
  - a beta ledger: this build has `history 0 open`, which is why D-18 shows. On Pages, once the beta ledger carries
    `firstSeenAt`, the cap is hidden.
- **No network throttling.** The performance agent will measure Apple's 367 kB (gzipped) list on Fast and Slow 4G, and
  M-20's frame times on a quiet machine.
- **Not re-checked:** pay parsing and per-board locations, which `data-check-beta.md` covers, and the desktop-only beta
  items D-19, D-20 and D-26 to D-30. On phones the top-bar Refresh of D-26 is hidden, so D-26 does not apply there.

### Suite results
| Suite | Tree | Result |
|---|---|---|
| `BETA_QA_DIST=<build of be5691c> node scripts/e2e.js --grep='^Beta mobile QA'` | HEAD `be5691c` (after batch 1) | **5/14**: the 5 guards pass; the 9 failures are exactly `[M-19]`…`[M-27]` |
| `node scripts/e2e.js --grep='^Beta mobile QA'` | shared `dist/` (build `local-20261010T123230`, from `48f913c`) | **6/14** with the earlier wording, in which the pill check was a guard; the 8 failures were `[M-19]`…`[M-26]`. `[M-27]` alone passes on this older build. |
| `node scripts/e2e.js` (full) | shared `dist/` and the server on the tree of 13:43 | **111/140 pass, 2 skipped, 27 failed.** Of the failures:<br>• 14 are the beta desktop agent's `[D-17]`…`[D-30]`;<br>• 11 were this group's bug tests, from a draft of this file loaded before I dropped the D-18, D-24 and DQ-10 duplicates and renumbered (all 6 guards passed);<br>• `Desktop QA: [D-9]` and `Compstimate: T21` both pass when re-run alone (`--grep='T21\|\[D-9\]'`: 2/2). T21 is a timing test the PLAYBOOK says can fail under load (load average 9 during the run).<br>Every other existing test passes. |
| `npm test` (`node --test test/*.test.js`) | HEAD `be5691c` plus this pass's files | **664/690 pass, 0 fail, 26 todo** (the data-check agent's `DQ-n` tests, todo until the beta fix wave). An earlier run during the integration, at load average 9–10, had 1–3 timing failures (PERF-1), which pass alone. |

All browser runs used `NODE_PATH=<scratchpad>/pw/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

## Full QA pass (mobile, beta) 2026-10-11

The second functional pass of the phone beta site (`/melon-seek/beta/`), after fix wave 3, by the second beta mobile QA
agent. The process log, with every replayable command, is in
[`docs/process/qa-mobile-beta-2.md`](process/qa-mobile-beta-2.md). No product code was changed.

**Setup**
- **Build:** the lead's reviewer build of HEAD `3cf226e` (fix wave 3) with today's crawl (`<scratch>/cycle-beta4/dist`,
  built 12:09 UTC): Apple 4,875 postings, Google 3,417, NVIDIA 2,663, Microsoft 2,279, Netflix 457, Anduril 2,491.
  Served under `/melon-seek/` by `scripts/cycle/serve.mjs` with a pid file.
- **Browser:** Playwright 1.63, Chromium 141, `isMobile`, `hasTouch`, DPR 3; iPhone UA (Android UA at 360 px). Every
  request to another host aborted.
- **Viewports:** 390x844, 360x740, 430x932 and 844x390, light and dark; plus the sizes a real phone browser shows,
  which emulation hides because it has no toolbars: 390x664 (Safari on an iPhone 14, bottom tab bar), 375x548 (Safari
  on an iPhone SE), 375x635, 414x715, 430x740, 360x640, 320x568, 844x340 and 568x320.
- **Gestures:** real touch, `touchscreen.tap` and CDP `Input.dispatchTouchEvent` (start, 4–12 moves, end) for swipes,
  flings and pinch. `Input.synthesizeScrollGesture` was not used (it scrolls nothing in this headless setup).
- **Keyboard:** simulated as in the first pass: `visualViewport.height = innerHeight − kb` while a text field has focus
  (kb 336 at 390x844, 300 at 360x640, 260 at 320x568, 190 in landscape).
- **Load:** other agents ran at the same time (load average 1–20). Three smoke runs crashed the renderer at load 8–20
  and passed when re-run alone; timings in this section are not a record.

**New e2e tests:** [`test/e2e/beta-mobile-qa-2.e2e.js`](../test/e2e/beta-mobile-qa-2.e2e.js), registered in
`scripts/e2e.js`. Run them with `node scripts/e2e.js --grep='^Beta mobile QA 2'`; `BETA_QA2_DIST=<dir>` points them
at another build (else `BETA_QA_DIST`, else `dist/`).
- They run under WebKit too: `BETA_QA2_ENGINE=webkit` launches Playwright's WebKit with the same phone profile. No test
  needs CDP. In WebKit a swipe becomes `mouse.wheel` at the same point (Playwright has no touch drag outside
  Chromium); the scroll-chaining rules are the same, and `BETA_QA2_WHEEL=1` runs that fallback in Chromium, where it
  gives the same results as touch.
- **On the lead's build: 2/6 pass.** The 2 guards pass; the 4 failures are exactly `[M-28]` to `[M-31]`.
- **WebKit workflow** for the lead: [`docs/process/patches/qa-mobile-beta-2-webkit.diff`](process/patches/qa-mobile-beta-2-webkit.diff)
  adds `.github/workflows/webkit-phone.yml` (manual):
  - a build job with the archived crawl (`scripts/cycle/local-data.js`);
  - a Playwright WebKit job (this file under WebKit, then under Chromium for comparison; screenshots uploaded);
  - a macOS job: Safari in the iOS Simulator (iPhone 16 and iPhone SE) driven by `idb ui tap|swipe` with real touch
    and the real keyboard (`test/e2e/webkit/ios-sim-menu.mjs`, plus an in-page probe the job's server adds to
    `beta/index.html` only). It saves screenshots before and after each swipe set and fails when the last company
    isn't fully visible.
  - It has not run: this sandbox has no WebKit and no macOS. `git apply --check` passes and the YAML parses.

### The user's report: "the list of companies don't scroll properly when we're in the beta mode"

**Reproduced in Chromium, as M-28, with two contributing bugs (M-29, M-30).** The lead's first check (390x844
portrait, one swipe scrolls 265 of 275 px) is right for that size; the failure is on the sizes real phones have.

- **How the menu is built.** On phones the company menu is a bottom sheet (`#popover`, `max-height: 82dvh`). Its body
  (`.pop-body`) scrolls, and inside it the list (`.company-list`) is a second scroll box with `max-height: 340px`
  (public/styles.css:841). Both have `overscroll-behavior: contain` (styles.css:1190, per docs/process/mobile.md:62,
  "every scroller gets contain"). The beta list holds 13 companies under two headings: 615 px of rows in the 340 px
  box. The main site's 8 rows are 373 px, so there the list barely scrolls.
- **The failure.** Where the sheet body is shorter than the 340 px box, the box's lower part is below the sheet's
  edge. A swipe on the rows scrolls only the inner list (contain stops the hand-off), so the inner list reaches its
  end while its last rows are still off screen, and the sheet body never moves. The only way to move the sheet body
  is to start a swipe on the search box, or on the 10 px strips beside the list.

Every case tested (swipe up on the rows from 85% to 15% of their visible part, 6 times; "last" = how much of Shield
AI, the last company, is visible afterwards):

| Case | Sheet body (visible) | List box | Result |
|---|---|---|---|
| 390x844, 360x740, 430x932, 414x715, 430x740, 390x664 (iPhone 14 Safari), 375x635 | 459–472 px | 340 | Pass: list scrolls 275 of 275 px, last 100% |
| 360x640 portrait | 463 (body scrolls 9 px) | 340 | Pass: last 100% |
| 320x568 portrait | 404 (body scrolls 68 px) | 340 | Pass for the companies; "Add another company's board" needs a swipe on the search box |
| **375x548 (iPhone SE Safari)** | 387 (body scrolls 85 px) | 340 | **Fail: Shield AI 65% visible**, cut by the sheet's edge |
| **844x390 landscape** | 258 | 340 | **Fail: last 0%**: Palantir and Shield AI never appear; 3 rows fully visible |
| **568x320 and 844x340 landscape** | 200, 217 | 340 | **Fail: last 0%** |
| Landscape, swipe on the search box after the rows | body scrolls 140 of 214 px | | Partial: then the search box is off screen and the next swipe starts on the rows again; Shield AI 91% at 844x390, 0% at 568x320 |
| Landscape, swipe on the "Big tech" heading / on the sheet title | | | Heading: scrolls the list (the heading is inside it). Title: nothing moves |
| Landscape, 3 fast flings on the rows | | | List to its end in 3 flings; last 0% |
| **5 saved searches**, 390x844 / 360x640 | | 340, 856 px of rows | Pass in portrait (list 516 of 516 px, last 100%); the current board (Apple ✓) opens in view |
| **5 saved searches, 844x390** | 258 | 340 | **Fail: last 0%** |
| **Keyboard up**, 390x844 (kb 336) | sheet 8–500, body 430 | 340 | Pass: last 100% |
| **Keyboard up, 360x640 (kb 300)** | sheet 8–332, body 262 | 340 | **Fail: last 0%**, 3 rows fully visible |
| **Keyboard up, 320x568 (kb 260)** | sheet 8–300 | 340 | **Fail: last 0%**, 3 rows |
| **Keyboard up, 844x390 (kb 190)** | sheet 8–192, body 123 | 340 | **Fail: no company row fully visible**; typing "n" leaves 1 |
| Search typed ("n", 8 rows), 390x844 keyboard | | 395 px of rows | Pass |
| Pull down at the top of the list, 390x844 | | | Nothing moves (no rubber band, the sheet doesn't drag, the page stays at 0,0) |
| Page or chart behind the sheet, every case | | | Never moved (page 0,0; chart scroll 0) |
| Main site (Anduril), 390x844 / 375x548 / 844x390 | | 340, 373 px of rows | Pass / Shield AI 66% / last 0%: the same trap, smaller |

- **Why the user may see it in portrait too:**
  - M-29: opening the menu focuses its search box. On Android Chrome a `focus()` during the tap's user activation
    opens the on-screen keyboard. The sheet then jumps to the top with `max-height: --vvh − 16px` and, on most
    phones, falls into the keyboard rows of the table above.
  - Safari's own viewport is about 180 px shorter than the emulated 844, and Safari's page zoom (aA, 115–125%) or
    Android's display size shrink it further: an iPhone 14 at 125% is about 312x531 CSS px, the iPhone SE row.
  - M-30: the list is rebuilt under the finger while saved searches load.
- **Verified fix (not applied):** one scroll box on phones. With
  `@media (max-width: 860px) { .company-list { max-height: none; overflow: visible } }` injected through the CSSOM,
  every failing case passes: Shield AI 100% visible and "Add another company's board" reachable at 844x390, 568x320,
  375x548, 360x640 with the keyboard, and 390x844.

### Scroll audit: every scrolling area on the phone

Method: `p4-audit.mjs` lists every visible element with scrollable overflow and more content than room, in each
state, swipes each to its end with real touch, and reports what moved (itself, any other scroll box, the page, the
sheet) and how much of its box stays below a clipping ancestor. Runs: beta Apple at 390x844, 375x548 and 844x390,
and main-site Anduril at 390x844.

| Area | How it scrolls | Tested | Result |
|---|---|---|---|
| Company menu (`#popover .pop-body` > `.company-list`) | **Two nested scroll boxes**, both `overscroll-behavior: contain`; list `max-height: 340px` | Above | **M-28** (also on the main site); M-29, M-30 |
| Data badge sheet (`.pop-body`) | One box; fits at every size tested (338 px tall; 400 px on Anduril with a live-fetch error) | Open, swipe, outside tap | Pass: nothing to scroll; an outside tap closes it |
| More sheet (`.pop-body`) | One box, contain | Swipe to end at 390x844, 375x548 and 844x390 | Pass: 1,373, 1,616 and 1,176 px scrolled to the end; page still |
| Filter sheet (`#filterBody`) | One box, contain; the sheet is a modal with the page inert | Swipe to end at all three sizes | Pass: 3,081 px at 390x844; page and sheet behind still |
| Results sheet at peek | `.results` and `.cards` `touch-action: none`; a drag moves the sheet | Swipe on the peek row | Pass: the sheet drags (first pass's guard) |
| Results sheet at half | `.cards` `touch-action: none`; a swipe on the list drags the sheet to full, then the list scrolls | Swipes on the cards | Pass: half → full on the first swipe, then the list scrolls 2,066 px |
| Results sheet at full | `.cards` `touch-action: pan-y`, contain; windowed list (M-20) | 8–12 swipes; sort and filter while scrolled | Pass: 2,750 px, page still. A pull-down at the top of the list does not collapse the sheet: by design (mobile.md:42, drag the handle or header) |
| Job page (`.drawer-scroll`) | One box, contain | Swipe to end at all three sizes | Pass: 876 / 1,209 / 1,223 px to the end |
| Drawer comps chart ("Same role elsewhere") | No scroll box of its own (in the drawer's flow) | Scan | Pass: nothing nested |
| Insights (`#insightsHost`), with Compstimate | One box, contain; Compstimate is in its flow | 12 swipes at all three sizes | Pass: 4,094 of 4,585 px in 12 swipes (long page), page still |
| Chart rows (`.ms-chart__scroll`), Clusters and Ranges | One box, contain, behind the sheet | Swipes at peek | Pass; Ranges on Apple is a 123,764 px virtual box that scrolls smoothly |
| Quick chips (`#quickChips`) | Horizontal, `overscroll-behavior-x: contain` | Sideways swipes | Pass: 439 px; the page stays at 0,0 |
| Map (`#mapHost`) | `touch-action: none`; Leaflet pans and pinches | First pass's guard re-run | Pass: page 0,0, scale 1 |
| The page itself | `body { overflow: hidden }`, `html { overscroll-behavior: none }` on phones | Every swipe above | Never moved in Chromium. On iOS see the WebKit review |

### WebKit (iPhone Safari): review against known behaviours

Not run here (no WebKit in the sandbox). The workflow in the patch runs these checks.

| Behaviour | What the code does | Risk on iOS Safari |
|---|---|---|
| Nested scroll boxes in a fixed sheet | `.company-list` inside `.pop-body`, both contain (styles.css:841, 1190) | **High: M-28.** iOS doesn't hand a pan from an inner scroller at its edge to the outer one in the same gesture; with contain (iOS 16+) it rubber-bands the inner list. Same trap as Chromium. |
| `overscroll-behavior` by iOS version | contain on every scroller, none on `html` (styles.css:1059) | Supported from Safari 16 (iOS 16). On iOS 15 and earlier, a swipe at the list's end chains to the sheet body, which helps M-28, then to the page, which rubber-bands, fixed sheet and all. `html { overscroll-behavior: none }` doesn't stop that bounce before iOS 16. |
| `body { overflow: hidden }` as the scroll lock | The page is exactly 100dvh, so there is nothing to scroll | iOS ignores `overflow: hidden` for touch: when the keyboard opens, Safari can still scroll the layout viewport. The app never undoes that (no `scrollTo(0, 0)` on focusout), so the page can stay shifted after the keyboard closes. Watch for it in the simulator job's "4-keyboard" screenshot. |
| dvh and `--vvh` with the keyboard | `body.kb-open .popover { top: 8px; max-height: --vvh − 16px }` (styles.css:1188); `--vvh` = `visualViewport.height` (app.js `bindKeyboardInsets`) | iOS pans the visual viewport to show the focused field (`visualViewport.offsetTop > 0`); `top: 8px` is on the layout viewport, so the sheet can start above the visible area. `offsetTop` is never used. The simulator job checks the sheet against `offsetTop`. |
| Programmatic focus and the keyboard | `togglePopover()` focuses the menu's search box in a `requestAnimationFrame` after the tap (app.js:2352) | iOS opens the keyboard only for a focus inside the touch handler, so it shows a focused field with no keyboard; a later tap on it opens the keyboard without a `focusin`, so `revealField()` doesn't run (`kb-open` still follows the resize). Android Chrome opens the keyboard at once: **M-29**. |
| A tap whose node leaves the page | `sync()` replaces every row on each `render()` and on each saved board that loads (app.js:1535, 1741) | iOS commits a tap to the node found at touchstart; a detached node cancels the tap. **M-30** (Chromium re-targets the tap, so there it works). |
| `-webkit-overflow-scrolling: touch` | Set on every scroller | No effect since iOS 13; harmless. |
| `touch-action` on the results sheet | none on `.results`, pan-y on `.cards` at full | WebKit computes touch-action up to the nearest scroll container, as Chromium does, so `.cards` gets pan-y. Low risk; the WebKit job's guard covers it. |

### Earlier mobile bugs (first beta pass, M-19 to M-27)

All 14 of `test/e2e/beta-mobile-qa.e2e.js` pass on the lead's build (5 guards and `[M-19]`…`[M-27]`), and each was
checked by hand on the phone:

| ID | Status |
|---|---|
| M-19 sort/filter while scrolled | **Fixed** (the list starts at the new top) |
| M-20 the list never recycles cards | **Fixed** (windowed list) |
| M-21 company menu: current board out of view | **Fixed** in portrait: "Big tech" first and the current board revealed. In landscape the reveal centres it in the 340 px box, of which 196 px show, so it lands at the sheet's lower edge: part of M-28 |
| M-22 paused board shows Offline and Retry | **Fixed** |
| M-23 "999+" pins, "1 of 6105" | **Fixed** ("3.4K", "1.1K jobs", "1 of 4,875") |
| M-24 keyboard covers filter-sheet search matches | **Fixed** |
| M-25 touch targets under 44 px | **Fixed** for the three listed. The first pass's open M-8 items remain: map zoom 30x30, Pay\|Juice 52x26, Remote badge 32 px tall (public/viz/viz.css) |
| M-26 Filters button focus | **Fixed** |
| M-27 Beta pill and the company name at 360 px | **Fixed**: "Microsoft" whole at 360; the pill is 43x21 with a 47x45 hit area, the logo 26x26 with a 34x44 hit area (`::before`, styles.css:1352–1356); hidden at ≤379 px |

### Fix wave 3 on the phone

| Change | On the phone (360x740 Android UA unless noted) |
|---|---|
| /beta/ opens on Google | Pass: Google, 3,417 roles |
| BP-1 yearly-rate internship labels | Pass: intern cards show plain ranges, and no pill is cut |
| BP-2 pay per place | Pass: Zurich on Google gives 58 roles, cards "No salary" / "Pay posted for the US only" (a 2-line pill, fits), the chart's "No pay posted for Zurich · 58 postings match; 10 list pay for another country only…", and the drawer's "Pay from other countries isn't used". At half sheet the chart message is under the sheet: **M-31** |
| BP-3 "Same role elsewhere" in one country | Pass on all six boards ("…roles at Staff+ level in the US…") |
| BP-6 country search in Location | Pass: "Ireland" finds Dublin 138 |
| BP-10 a place across a company switch | Pass: Austin on Apple → Google gives the toast "Dropped Austin, TX (not at Google) for now" |
| BP-12 British spellings | Pass: "data centre" on Microsoft gives 125 roles |
| BP-13 base pay median | Pass: "$214K base pay median · half between $188K and $255K" fits the stats line at 390 |
| BP-14 Required / Nice to have | Pass: both headings in a Google drawer, no horizontal scroll |
| BP-16 one age rule | Pass: "Updated 18 days ago" and "Listed 3 months ago (Jul 24, 2026)" are two facts, both in words |
| BP-17 On-site counts | Pass: Microsoft Any 2,279, Remote 310, On-site 1,969; each segment 44 px tall |
| Map: pin names, short counts ("1.1K jobs", "3.4K") | Pass on all six boards (the filtered-pins case was not re-run on the phone) |

### What works on phones (beta, today's crawl)

- **All six boards** (Apple, Google, Microsoft, NVIDIA, Netflix, and Anduril on the main site), at 390x844 light,
  Microsoft 360x740 dark and 844x390 dark, NVIDIA 430x932 dark, Netflix 390x844 dark, Apple 844x390:
  - no horizontal scroll and no page error anywhere; the big-tech boards make no request to another host;
  - theme cycles Light > Dark > System and the body background follows;
  - badge: "Snapshot · Oct 11", "your browser can't fetch it live", and a 44 px CSV link;
  - chips: all 44 px;
  - chart: a row-label tap gives a chip ("Machine Learning and AI (357)", "DeepMind (95)", "Distinguished
    Engineer (15)"); Ranges draws 16–30 rows;
  - map: a pin tap gives its area chip, Juice recolours the pins (`mc=juice`), and Remote gives "Remote (310)" on
    Microsoft;
  - Insights: every field 16 px and 44 px tall, no zoom on focus (scale 1);
  - job page: next and prev ("2 of 4,875" and back), Apply goes to the board's own careers site, and Juice →
    "Family" recomputes (Apple San Jose $198,500 → $185,400, Microsoft $125,400 → $103,400). "Same role elsewhere"
    and the methodology link (`/melon-seek/beta/methodology/`) work, and hardware Back closes the page with focus
    on the card;
  - Save: 44 px, with a toast.
- **Big boards:** the first pass's guards pass on today's data. Apple filter taps and sorts answer within a second,
  the sheet drags, the list lazy-loads, and the heap stays bounded across 3 rounds of the big boards.
- **Text:** nothing under 12 px on any screen scanned. (The only hit is the badge label's `font-size: 0`, which shows
  its text through `::before` at 13 px.)

### Bugs (ordered by severity)

Screenshots are in `docs/screenshots/qa-mobile-beta-2/`.

| ID | Sev | Device / orientation | Summary |
|---|---|---|---|
| M-28 | High | Landscape (844x390, 568x320), iPhone SE Safari (375x548), any phone with the keyboard up below about 400 px of visible height; main site too | The company list is a 340 px scroll box nested in a shorter sheet: a swipe on the rows never reveals the last companies |
| M-29 | Medium | Android phones (Chrome); a screen reader on any phone | Opening the company menu puts focus in its search box, so the keyboard opens over the list each time |
| M-30 | Low (iOS: Medium) | All phones with saved searches; the effect is WebKit only | The open company list is rebuilt each time a saved search's board loads (17 of 17 rows replaced); on iOS a tap that began on an old row is lost |
| M-31 | Low | All phones, results sheet at half | The chart's empty message ("No pay posted for Zurich") is centred in the whole chart area, under the half sheet: the visible chart is blank |

#### M-28 (High): the company list's last rows can't be reached where the sheet is shorter than the list
- **Device:** 844x390 and 568x320 landscape (iPhone UA); 375x548 (an iPhone SE's Safari viewport); 360x640 and 320x568
  with the keyboard up (Android UA). Light and dark are the same. The main site has the same trap with a 373 px list.
- **Repro (landscape):**
  1. Open `/melon-seek/beta/#c=apple` at 844x390.
  2. Tap the company menu.
  3. Swipe up on the company rows until they stop.
- **Expected:** every company can be brought fully into view by swiping the list, and so can "Add another company's
  board".
- **Actual:**
  - The rows scroll inside their 340 px box (list 275 of 275 px), but that box runs from 193 to 533 px under a sheet
    body that ends at 389 px. The sheet body never scrolls (0 of 214 px).
  - Palantir and Shield AI never appear, and "Add another company's board" is at 405–449 px, off the 390 px screen.
  - At 375x548 Shield AI stops 65% visible. With the keyboard up at 360x640, 3 rows show and Shield AI is never
    visible. At 844x390 with the keyboard, no row is fully visible.
  - The only escape is a swipe that starts on the search box. It scrolls the sheet body, but then the search box is
    off screen.
- **Screenshots:** `e2e-M-28-landscape-844x390.png`, `e2e-M-28-iPhone-SE-Safari-375x548.png`,
  `e2e-M-28-360x640-with-the-keyboard-up-300-px-.png` (grey box = the keyboard),
  `e2e-M-28-landscape-844x390-with-5-saved-searches.png`, `menu-landscape-end-844x390.png`, `menu-keyboard-844x390.png`.
- **Cause:**
  - `public/styles.css:841`: `.company-list { max-height: 340px; overflow-y: auto }` makes a second scroll box inside
    `.pop-body` (styles.css:510), which is itself capped by the sheet's `max-height: 82dvh` (styles.css:1186) or, with
    the keyboard, `--vvh − 16px` (styles.css:1188).
  - `styles.css:1190`: `.pop-body, .company-list { overscroll-behavior: contain }` stops the inner list from handing
    the swipe to the sheet body.
- **Recommended fix:** on phones, one scroll box. In the phone block, `.company-list { max-height: none; overflow:
  visible }`, so `.pop-body` is the only scroller and fills the sheet. Desktop keeps the 340 px list in its dropdown.
  Verified by injecting exactly that rule: every case above passes (Shield AI 100%, the add button reachable).
  `reveal()` (app.js:1555) then has to scroll `.pop-body` instead of the list.
- **Test:** `Beta mobile QA 2: [M-28] …` (4 cases, all fail today), plus the passing portrait guard. In the WebKit
  workflow the same test runs on WebKit, and the simulator job swipes the list for real.

#### M-29 (Medium): opening the company menu focuses its search box
- **Device:** all phones. The keyboard effect is Android Chrome; on iOS the field is focused with no keyboard.
- **Repro:** at 390x844 (Android UA), tap the company menu.
- **Expected:** on a phone the menu opens with the list in view and no keyboard. Focus goes to the current company
  (Apple ✓) or the sheet's title, and the search box opens the keyboard when tapped.
- **Actual:**
  - `document.activeElement` is `input.fsearch` ("Search companies").
  - Chromium opens the virtual keyboard for a `focus()` that runs within the tap's user activation. So on Android
    every open brings up the keyboard, the sheet jumps to the top (`body.kb-open`), and on phones under about 400 px of
    visible height the list falls into M-28.
  - A screen reader starts in the search box instead of at the current company.
  - The data badge and More sheets don't do this: they focus a button and a switch.
- **Screenshot:** `e2e-M-29-company-menu-focus.png`.
- **Cause:** `public/app.js:2352`, `togglePopover()`: after opening any popover, it focuses the first
  `input:not([type=range])` in `.pop-body`. For the company menu that is the search box.
- **Recommended fix:** when `isMobile()` and `id === 'company'`, focus the `aria-current` company item (with
  `preventScroll`), or the sheet's heading. Keep the search focus on desktop, where "micro" + Enter is the keyboard
  path.
- **Test:** `Beta mobile QA 2: [M-29] …` (fails today).

#### M-30 (Low; Medium on iOS): the open company list is rebuilt under the finger
- **Device:** all phones with saved searches. The tap loss is WebKit only.
- **Repro:**
  1. Have 4 saved searches on other boards (Google, NVIDIA, Microsoft, Netflix).
  2. Open `/melon-seek/beta/#c=apple` and open the company menu while those boards are still loading. On a phone's
     4G that takes seconds; the test delays their lists by 1.5 s.
- **Expected:** the rows stay the same nodes. Only the saved searches' "N new" counts update.
- **Actual:**
  - Each board that finishes loading calls `syncPopover()`, which rebuilds the whole list with `replaceChildren`.
    That is 4 rebuilds in 6 s, and all 17 rows replaced. `p3-rebuild.mjs` saw the same with no delay: 4 rebuilds
    0.3–1.3 s after the open, during a swipe.
  - In Chromium the scroll offset survives and a tap is re-targeted to the new row, so nothing visible happens.
  - iOS Safari commits a tap to the node it found at touchstart, and a node that left the page cancels the tap. So
    on an iPhone, a tap during a rebuild does nothing.
  - Every `render()` while the menu is open does the same (app.js:1162).
- **Screenshot:** `e2e-M-30-saved-searches-loaded.png`.
- **Cause:** `public/app.js:1741` (`prefetchSaved()` → `syncPopover()`), `app.js:1162` (`render()` →
  `syncPopover()`), and `makeCompanyMenu().sync()` at `app.js:1535`, which rebuilds every row.
- **Recommended fix:** make `sync()` idempotent. Rebuild only when the query, the current company or the list of
  companies changed, and otherwise update the `.saved-new` counts in place.
- **Test:** `Beta mobile QA 2: [M-30] …` (fails today). The tap loss itself needs real iOS input: the simulator job.

#### M-31 (Low): with the results sheet at half, the chart's empty message is under the sheet
- **Device:** all phones (390x844 tested; 360x740 in the screenshot).
- **Repro:**
  1. Open `/melon-seek/beta/#c=google&l=Zurich`. Or pick Zurich in Location: no role there lists pay.
  2. Tap the sheet handle once (half).
- **Expected:** the visible part of the chart says why it is empty.
- **Actual:**
  - "No pay posted for Zurich · 58 postings match…" is centred in the whole chart area: its title ends at 472 px,
    under the half sheet's top at 422 px.
  - The visible 260 px of chart are blank. At peek the message shows.
- **Screenshots:** `e2e-M-31-empty-message-half-sheet.png`, `w3-bp2-zurich-cards-360.png` (half) vs
  `w3-bp2-zurich-google-360.png` (peek).
- **Cause:**
  - `public/viz/viz.css:263`: `.ms-chart__empty { flex: 1; justify-content: center }` centres it in `#chartHost`;
  - the phone `.main` padding (styles.css, phone block, `padding: 0 0 calc(var(--sheet-peek) …)`) reserves only the
    peek height.
- **Recommended fix:** on phones, put the empty message at the top of the chart (`justify-content: flex-start`, with
  some top padding), or reserve the half-sheet height under `body[data-sheet="half"]`.
- **Test:** `Beta mobile QA 2: [M-31] …` (fails today).

### Coverage notes
- **Not testable here:**
  - real WebKit or iOS Safari: the workflow patch covers it;
  - a real on-screen keyboard;
  - Android Chrome's keyboard on programmatic focus (M-29 is from Chromium's documented behaviour, not observed);
  - map tiles;
  - live boards.
- **Not re-checked on the phone:**
  - the safe-area insets (the first pass verified them, and no CSS there changed in fix wave 3);
  - Slow 4G timings (the performance pass);
  - pay parsing (the data check and the vetting).
- **Not filed:**
  - the logo's 34x44 hit area (width under 44, height 44, 8 px from the Beta link);
  - the full sheet not collapsing on a pull-down at the list's top (by design, mobile.md:42).
- **Housekeeping for the lead:** running the first pass's `^Beta mobile QA` group rewrites its committed evidence
  screenshots. Five files in `docs/screenshots/qa-mobile-beta/` (`e2e-M-19…`, `M-21`, `M-22`, `M-24`, `M-27`) are now
  modified in the working tree. Restore them with
  `git checkout -- docs/screenshots/qa-mobile-beta/`; this agent's attempt was refused by the sandbox's permission check.

### Suite results
| Suite | Tree | Result |
|---|---|---|
| `BETA_QA2_DIST=<lead build> node scripts/e2e.js --grep='^Beta mobile QA 2'` | HEAD `3cf226e` + this pass's files | **2/6 pass**: the 2 guards; the 4 failures are exactly `[M-28]`…`[M-31]` |
| the same with `BETA_QA2_WHEEL=1` (the WebKit gesture path in Chromium) | same | portrait guard passes and `[M-28]` fails with the same numbers as touch |
| `BETA_QA_DIST=<lead build> node scripts/e2e.js --grep='^Beta mobile QA'` (first pass's group) | same | **14/14 pass** (M-19…M-27 fixed) |
| `npm test` | same | **941 tests: 904 pass, 2 fail, 35 todo** (the second data check's and the vetting's to-dos). The 2 failures are the load-sensitive timing tests PERF-1 (639 ms of event-loop lag) and V15 (408 ms), which run only with local data present; re-run alone at load average 13–14 they still fail (172 and 208 ms). The lead saw the same at load 4, and CI never runs them (PLAYBOOK stage 3). Nothing this pass touched is on those paths. |

All browser runs used `NODE_PATH=<scratchpad>/pw/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

## Full QA pass (desktop, beta) 2026-10-11

The second functional pass of the desktop beta site (`/melon-seek/beta/`), after fix wave 3, by the beta desktop
QA agent. The process log, with every replayable command, is in
[`docs/process/qa-desktop-beta-2.md`](process/qa-desktop-beta-2.md). No product code was changed.

**Setup**
- **Build under test:** the lead's reviewer build `<scratch>/cycle-beta4/dist` (built 2026-10-11T12:09Z from the
  fix wave 3 head 3cf226e, beta 5/5), served under `/melon-seek/` by `scripts/cycle/serve.mjs` with a pid file.
- **Data:** today's crawl, every board observed 2026-10-11 06:38–08:00 UTC: Apple 4,875, Google 3,417, NVIDIA
  2,663, Microsoft 2,279, Netflix 457, and Anduril 2,491 on the main site. All boards are `mode: "snapshot"`.
- **Browser:** Playwright 1.63, Chromium 141. Every other host was aborted, so the map runs without its basemap
  ("Basemap unavailable · pins still work"), which matters for D-31.
- **Viewports and themes:** 1440x900, 1280x800 and 1024x768, light and dark.
- **Method:** counts and order were checked against the app's own data (`api.js` `getJobs()` in the page: the
  prepared jobs the UI uses). Raw snapshots were read only to find causes.
- **Load:** other review agents ran at the same time; the load average was 1 to 15, so timings are upper bounds.
- **Overlap:** items the second data check and the beta vetting already filed (DQ-27, DQ-28, DQ-29, the $1.2M
  bound) are noted under "Notes", not re-filed.

**New e2e tests:** [`test/e2e/beta-desktop-qa-2.e2e.js`](../test/e2e/beta-desktop-qa-2.e2e.js), registered in
`scripts/e2e.js`. Run them with `node scripts/e2e.js --grep='^Beta desktop QA 2'`. They serve `BETA_QA_DIST`, else
the shared `dist/`, and skip without a beta build.
- **3/10 pass:** the 3 guards. The 7 failures are exactly `[D-31]` … `[D-37]`.

### The first pass's bugs (D-17 to D-30): all fixed
The first pass's own tests (`test/e2e/beta-desktop-qa.e2e.js`, run against today's build through a scratch copy
that reads `BETA_QA_DIST`; the file itself was not changed) pass **19/19**. Each was also checked by hand:

| ID | Status | What the desktop shows now |
|---|---|---|
| D-17 | Fixed | NVIDIA's Location filter has Israel (Yokneam 313, Tel Aviv 234, Ra'anana 103), India and Germany groups; nothing abroad is under United States |
| D-18 | Fixed | "Microsoft · Senior · Remote" right after Save, no "new"; after ageing the save by hand, "3 new" and 3 cards marked New |
| D-19 | Fixed | The main site does not list beta saved searches (but see D-35 for a beta link opened on the main site) |
| D-20 | Fixed | The test's own `MELON_CHANNEL=beta` server returns Apple's snapshot, not demo data |
| D-21 | Fixed | NVIDIA "Pay by level: Level 2: $184K–287.5K · Level 3: $224K–356.5K" (Microsoft's 3 exceptions are D-34) |
| D-22 | Fixed | Google Canada pay is CAD ("CA$…"); Netflix "CA$120K–180K · ≈ $85K–128K in approx US dollars" |
| D-23 | Fixed | No bare codes, "Republic of" or "Unknown Region" on the five boards |
| D-24 | Fixed | Google has 7 departments (Google, YouTube, DeepMind, GFiber, Verily, Waymo, Wing) and a 7-row chart |
| D-25 | Fixed | "Apply on NVIDIA's careers site · jobs.nvidia.com"; the menu's first group is "BIG TECH" |
| D-26 | Fixed | No top-bar Refresh on the five boards |
| D-27 | Fixed | Tab title "melon·seek beta — job boards, plotted by salary"; the logo's name is "melon·seek beta home" (see D-37 for the other beta pages) |
| D-28 | Fixed | The "Beta" tag links to `/melon-seek/`, named "Beta site. Go to the main melon·seek site" |
| D-29 | Fixed | The Warsaw Ranges tooltip names PLN once |
| D-30 | Fixed | Apple's "most new hires start at $23.00" posting has no "Multiple pay zones" label |

### Fix wave 3 on the desktop
| Item | Status | Checked |
|---|---|---|
| BP-1 | Fixed | Google "Financial Analyst BS/MS Intern": "€47,000 a year · EUR · 13-week internship", Juice "Monthly / Whole term". Microsoft "£4,853 a month · for about 12 weeks · Fixed-term pay, not a yearly salary" |
| BP-2 | Fixed | Google `l=Zurich`: "0% show pay for Zurich", the chart "No pay posted for Zurich / 58 postings match; 10 list pay for another country only…", the card "Pay posted for the US only" with the range in the tooltip. Munich, Austin, Dublin and Toronto agree between the stats line, the chart and the cards |
| BP-3 | Fixed | A Dublin role's "Same role elsewhere" compares "Software engineering roles … in Ireland"; Compare companies says "Posted pay in the US" |
| BP-4 | Fixed | Compare companies lists "Chip design & silicon engineering (6 companies)" and "Data center technicians (2 companies)" |
| BP-5 | Fixed | No posting with CAD pay carries a "CAD" skill; the 41 "CAD" tags left are computer-aided design roles ("Senior CAD Engineer, RTL Design") |
| BP-6 | Fixed | Location search: Google "Ireland" → Dublin 138, NVIDIA "Israel" → 5 places, "München" → Munich, "Bangalore" → Bengaluru, "Zürich" → Zurich, Microsoft "Deutschland" → 4 German places, Apple "UK" → 13 |
| BP-7 | Fixed | Google `s=Mid-level` 235 roles; the drawer says "Mid" |
| BP-8 | Fixed | NVIDIA's departments read "Management, Systems Software", "Engineer, Systems Software" |
| BP-9 | Fixed | Apple part-time "$23.00–30.59 an hour · part-time, paid by the hour · If full-time (2,080 hours): $47,840–63,627 a year"; no Juice, with the reason |
| BP-10 | Fixed | Apple "Columbus, OH" → Google "Kept Columbus" (15) → Netflix "Dropped Columbus (not at Netflix) for now" → Microsoft "Put back Columbus"; Munich the same way through NVIDIA and Apple |
| BP-11 | Fixed | Netflix "Technical Director Pre-Production" is Senior |
| BP-12 | Fixed | "data centre" = "data center" (281), "programme manager" = "program manager" (413), Microsoft "centre" = "center" (128), Anduril "defence" = "defense" (1,532) |
| BP-13 | Fixed | Apple "$214K base pay median" in the stats line and "Median base pay $214K" in the chart |
| BP-14 | Fixed | A Google drawer has "Required" and "Nice to have" sub-headings |
| BP-15 | **Partly** | 12 Apple store names are still places: D-32 |
| BP-16 | **Partly** | One drawer can still give two ages a day apart: D-33 |
| BP-17 | Fixed | Remote Any = Remote + On-site on all five (Apple 12 + 4,863 = 4,875) |
| Beta landing | Fixed | `/melon-seek/beta/` with no hash opens Google (3,417), from the early list fetch |
| fix3-viz map | **Bug** | Only the filtered places get pins, and the Remote control equals the filter, but the offline pin-name merge collapses the map after a pin click: D-31 |

### What works on desktop, beta (all five boards and Anduril unless noted)
- **Beta only:**
  - The five big-tech boards load from the bundle only: one `api/jobs/<slug>.json` each (Google's comes from the
    early fetch in config.js), 0 requests to any other host, no demo banner. The badge reads "Snapshot · Oct 11";
    its popover says "This board is collected by the site's crawler; your browser can't fetch it live", with the
    source, the fetch time ("10/11/2026, 6:38:35 AM (6 hours ago)") and the count, and Download CSV.
  - Paused and absent companies (Amazon, Meta, Tesla) are not in the menu; `#c=amazon` says "This board isn't on
    this site · melon·seek doesn't list Amazon's jobs here", with the badge hidden. (The shared checkout's newer
    head 3f47ddc resumes Amazon and Meta; this build predates it.)
  - The page says it is beta: the tab title, the logo's accessible name and the "Beta" tag, which links back to
    the main site. Anduril and the other stable boards are listed under "MORE COMPANIES".
  - Apple stays responsive in every view (table below): every filter, sort, search and chart change landed in
    0.18–0.6 s, Map in 0.7 s and Insights in 0.8 s, close to Anduril's, at load 7.
- **Company and boards:** the menu focuses its search; "nvid" + Enter opens NVIDIA; "eightfold" finds Microsoft,
  Netflix and NVIDIA; Esc closes; the current board has a ✓. Recent pills switch boards. Add board flags a bad
  slug, opens a Lever board with labelled demo data ("Demo data — the Qa-fake-board board couldn't be reached"),
  keeps it after a reload under "YOUR BOARDS", and removes it.
- **Search:** title or team matches rank first on all six boards ("engineer", "manager", "data", "software
  engineer"); "· N in title" counts title or team, as its tooltip says (Microsoft's "Software Engineering"
  profession counts as team).
- **Filters** (about 175 checks against the data):
  - Department, Seniority and Employment type sum to the total; a pick gives exactly its count; a facet's
    counts don't change with its own pick; unpicking restores the board.
  - The Responsibilities, Fit and Skills chips give exactly their counts, AND together, and their counts follow
    the other picks.
  - Salary: "Only show jobs with salary" equals the paid count (Apple 2,818, Google 2,217, Microsoft 1,490);
    typed "200k" and "300000" give the data's overlap counts exactly; "£80,000" becomes $108,000; ten slider
    steps take 1.5–1.8 s.
  - Listed: "Hide roles open 180+ days" hides exactly its count. Clear all restores the board.
  - The Location filter's canonical names are right apart from D-32 and D-36.
- **Sorting:** Highest pay, Lowest pay (approx-USD midpoint), Newest, Title A–Z and Most juice are in order for
  the first 120 cards on all six boards.
- **Chart:** Clusters, Ranges and Group by (Department, Location, Seniority in ladder order, None) work. A cluster
  gives a chip ("Machine Learning and AI · $300K–$350K (11)"), with the list, the stats line and the facets
  following it; dismissing it restores the board. A one-role bin opens the role. Overflow markers have their own
  tooltip and chip ("above $350K (4)"). Arrow keys move `aria-activedescendant` and Enter selects. Ranges'
  tooltip names the role, place and level.
- **Map:** pins and tooltips, area chips that equal the list, the Remote control equal to the Remote filter
  (Microsoft 310, NVIDIA 532), zoom buttons and the wheel, Pay|Juice with its legend and as-of line, and `mc=juice`
  kept in the hash. With the drawer open the map resizes from 702 to 582 to 638 px wide at 1440, 1280 and 1024.
  The exception is D-31.
- **Insights:**
  - Compstimate prefills from Seniority ("Software Engineer · Senior", Apple "$242K · High confidence · Based on
    198 similar roles"); typing a title shows "Reset to filters", which restores it. The accuracy line shows on
    every board (e.g. "Typically within ±12% (tested on 500 listed salaries, Oct 2026)").
  - Market insights' rows add and remove their filter; Compare companies covers 13 companies, a row switches
    company with `rf=` and stays in Insights, and Back returns.
- **Job drawer** (17 chosen postings: multi-level, part-time, internships by year and by month, hourly, CZK, CAD,
  EUR, PLN, Pay unclear, the lowest-paid):
  - Pay blocks are honest: "Pay by level", "Wide range (2.1×)", "Single figure", "≈ … in approx US dollars",
    "Posted base pay. Equity and bonus aren't included.", and the percentile within the posting's country.
  - Netflix's two "Pay unclear" postings give the reason under "Why?" and a labelled estimate.
  - The Juice waterfall adds up to the dollar in all six checked. Monthly is Yearly / 12 and keeps focus; Just
    me, Couple and Family re-score with 1, 2 and 3 bedrooms and the tax-basis note, in about 0.4–1 s, and focus
    stays on the button. "How it's calculated" opens `/beta/methodology/#1-the-formula` (the anchor exists).
    A missing Juice says why ("no rent and living-cost data yet for Hamburg or Milan", "the posting names no
    city", the part-time case).
  - Same role elsewhere: a row (NVIDIA → Apple) switches with `s=Manager&rf=eng-manager`, Back reopens the NVIDIA
    drawer and Forward works; its listbox takes the arrow keys, and Esc there leaves the drawer open.
  - The Listing block ("Listed 6 months ago (Mar 30, 2026) · Open 180+ days…"), the locations, the keywords and
    the lazy description (one `api/desc/<slug>/<id>.json` per role, no offsite links) work. Apply opens the right
    careers host in a new tab with `rel="noopener noreferrer"`.
  - Copy link copies the `/beta/` URL with `job=` ("Link copied"). Prev/Next work; j and k step from the close
    button and the page, but not from other buttons (the documented WCAG 2.1.4 rule). Esc closes, with focus back
    on the card and `job=` removed. "1 of 4,875"; a deep link to Apple's last role opens it ("4,875 of 4,875"); an
    unknown `job=` is dropped.
- **Other:** Save toggles to "Saved" with a toast; Download CSV gives 2,279 rows for Microsoft with the documented
  header; the theme persists across a reload; a full hash (`q`, `smin`, `so`, `d`, `l`, `s`, `r`, `ks`, `v`, `g`,
  `sort`) round-trips exactly and the controls show it; Back and Forward walk mode and sort; `/` focuses the search
  and `t` cycles the theme from a card, while typing "t/jk" in the search only types; the share pages
  `/beta/c/<slug>/` are 200 with their own titles and beta OG URLs.
- **Layout and errors:** 58 checks at the three widths in both themes: no horizontal scroll, no top-bar overlap,
  the menu, badge, Add board, Salary, Location and More popovers, the 1024 filter sheet and the drawer all inside
  the viewport; axe colour contrast finds 0 violations in Chart, Map, Insights, More and the drawer. No console or
  page error in any flow.

### Timings on Apple vs Anduril and Google (1440x900, no throttling, load 7)
Wall clock from the action until the DOM changed (polled every 50 ms), and the longest task in it.

| Action | Apple (4,875) | Anduril (2,491) | Google (3,417) |
|---|---|---|---|
| First cards / chart on load | 2276 / 2395 ms | 1461 / 2022 ms | 2576 / 2866 ms |
| Tick the first department | 593 ms, longest task 422 ms | 281 ms, longest task 147 ms | 467 ms, longest task 252 ms |
| Seniority Senior | 319 ms, longest task 119 ms | 252 ms, longest task 113 ms | 306 ms, longest task 173 ms |
| Location: first city | 409 ms, longest task 212 ms | 310 ms, longest task 162 ms | 359 ms, longest task 137 ms |
| Sort Lowest pay | 254 ms, longest task 208 ms | 224 ms, longest task 152 ms | 173 ms, longest task 137 ms |
| Sort Most juice | 217 ms, longest task 183 ms | 193 ms, longest task 153 ms | 266 ms, longest task 211 ms |
| Search "engineer" | 447 ms, longest task 251 ms | 389 ms, longest task 220 ms | 426 ms, longest task 241 ms |
| Group by Location | 213 ms, longest task 89 ms | 195 ms, longest task 106 ms | 221 ms, longest task 132 ms |
| Ranges view | 244 ms, longest task 121 ms | 325 ms, longest task 113 ms | 348 ms, longest task 157 ms |
| Skills chip Python | 176 ms, longest task 94 ms | 305 ms, longest task 174 ms | 331 ms, longest task 175 ms |
| Clear all | 353 ms, longest task 191 ms | 200 ms, longest task 98 ms | 366 ms, longest task 180 ms |
| Open Map | 677 ms, longest task 347 ms | 383 ms, longest task 207 ms | 780 ms, longest task 499 ms |
| Map Pay → Juice | 328 ms, longest task 125 ms | 337 ms, longest task 145 ms | 364 ms, longest task 159 ms |
| Open Insights | 799 ms, longest task 671 ms | 738 ms, longest task 547 ms | 909 ms, longest task 707 ms |
| Open a role | 584 ms, longest task 255 ms | 416 ms, longest task 219 ms | 508 ms, longest task 164 ms |
| Household Family (drawer) | 439 ms, longest task 153 ms | 358 ms, longest task 85 ms | 482 ms, longest task 149 ms |
| 10 salary-slider steps | 1833 ms | 2537 ms | 2420 ms |
| JS heap after the run | 56 MB | 40 MB | 38 MB |

Against the first pass (Apple 6,105 roles then, 4,875 now after the requisition merge, at load 10.7 then and 7
now), the numbers are about the same: every update stays under 0.6 s, Map and Insights under 1 s.

### Bugs (ordered by severity)
Repro steps assume a fresh 1440x900 light window on the static beta build, with other hosts blocked, unless
stated. Screenshots are in `docs/screenshots/qa-desktop-beta-2/`.

| ID | Sev | Viewport | Summary |
|---|---|---|---|
| D-31 | Medium | All (1440x900 tested) | Without the basemap, a pin click collapses the map: off-screen pins are merged into the visible one, which then claims the whole board ("Cupertino, Austin and 212 more · 4.9K" over Anchorage's 3 roles) |
| D-32 | Low | All | 12 Apple store and mall names are still places, pinned at country centroids (BP-15 partly open) |
| D-33 | Low | All | One drawer still gives two ages a day apart, "Updated 30 days ago" next to "Listed 31 days ago" (BP-16 partly open) |
| D-34 | Low | All | 3 Microsoft ranges that name two IC levels show only "Multiple pay zones", with no pay by level |
| D-35 | Low | All | A beta board linked on the main site says "melon·seek doesn't list Apple's jobs here", with no pointer to /beta/ |
| D-36 | Low | All | Google lists one place under several labels: Pryor ×4, Moncks Corner ×2 |
| D-37 | Low | All | The beta methodology and share pages don't say beta |

#### D-31 (Medium): without the basemap, a pin click merges off-screen pins into the one on screen
- **Viewport:** 1440x900, light; the same at every width. The main site does it too (shared code).
- **Repro:**
  1. Open `/melon-seek/beta/#c=apple&m=map` with the basemap unreachable (offline, or tiles blocked: the map says
     "Basemap unavailable · pins still work"). There are 7 pins; the biggest is "Cupertino, Austin and 114 more ·
     3.4K".
  2. Click the "3 jobs · Anchorage, AK" pin.
  3. Hover the pin left on screen; then clear the area chip.
- **Expected:** the map zooms to Anchorage, its pin says 3, and the other pins stay where they are (off-screen or
  at the edges), each with its own count. Zooming in only ever splits pins.
- **Actual:**
  - The list shows 3 roles and the chip says "Anchorage, AK (3)", but the map shows one pin, "$214K · 4.9K ·
    Cupertino, Austin and 212 more", over Anchorage. Its tooltip reads "4,875 postings · 2,818 with salary for
    here" and lists US-Technical Specialist ×38… : the whole board.
  - Clearing the chip leaves the same single pin; it takes two zoom-outs to get separate pins back, and then
    names are mixed ("1.5K jobs · Shanghai, Singapore and 88 more", "Miami Beach, Mexico City and 2 more").
  - Other boards: NVIDIA "Helsinki and 3 more" (9) leaves "Yokneam, Bengaluru and 36 more · 1.1K" and "Munich,
    Paris and 13 more" on screen; Microsoft "Tokyo, Osaka" (100) leaves "Sydney, Melbourne and 10 more"; Netflix
    "Sao Paulo and Buenos Aires" (2) leaves "Los Angeles, Los Gatos and 17 more · 257"; on the main site,
    Anthropic "Sydney" (9) leaves only "San Francisco, New York and 21 more · 630".
  - Plain zooming in from the world view does the same: at the 8th zoom-in Apple's 4,875 roles are in 3 pins
    named London, Shanghai and Cupertino.
  - With tiles loading (a 1x1 PNG served for the tile URLs) pins have no names and are not merged, so users with a
    working basemap don't see this.
- **Cause:** fix3-viz decision 6. `layoutLabels()` clamps every label box into the map's box, also for pins that
  are off-screen, so their names "don't fit"; `draw()` then calls `mergeInto()`, which folds each into the nearest
  cluster, for up to `MERGE_PASSES` (6) passes, until little is left.
- **Screenshots:** `D-31-apple-map-world-7-pins.png`, `D-31-apple-map-after-anchorage-click.png`,
  `D-31-main-site-anthropic-after-sydney-click.png`.
- **Owner:** `public/viz/map.js` `draw()` / `placeLabels()` and `mergeInto()` (lay out and merge only the pins
  inside the visible bounds), and `layoutLabels()`.
- **Test:** `[D-31]`: no pin after a pin click holds more postings than the biggest pin at the world view.

#### D-32 (Low): 12 Apple store and mall names are still listed as places (BP-15 partly open)
- **Viewport:** 1440x900, light.
- **Repro:** open `/melon-seek/beta/#c=apple`, and in the left column's Location search type "France", then "UK",
  "Canada", "Mexico".
- **Expected:** stores filed under their city, as BP-15 did for Piazza Liberty, Rosny 2, Polo Park and 12 others.
- **Actual:** "Champs Élysées", "Opéra", "Parly 2", "Sainte-Catherine" (France, 6 each through the country-wide
  rule), "Highcross", "Touchwood Centre" (UK), "Richmond Centre", "Southgate Centre" (Canada), "Grosse
  Bockenheimer Strasse" (Germany), "Fukuoka Tenjin" (Japan), "Antara" (Mexico) and "VillageMall" (Brazil). They
  come from 11 Apple retail postings and are pinned at the country centroids (France 46.2, 2.2; Canada 56.1,
  −106.4).
- **Screenshot:** `D-32-apple-location-france-store-names.png`.
- **Owner:** `server/geo.js` (the BP-15 store aliases, around line 186) and the gazetteer: Paris (Champs
  Élysées, Opéra, Parly 2), Bordeaux (Sainte-Catherine), Leicester (Highcross), Solihull (Touchwood), Richmond BC
  (Richmond Centre), Edmonton (Southgate Centre), Frankfurt (Grosse Bockenheimer Strasse), Fukuoka (Tenjin),
  Mexico City (Antara), Rio de Janeiro (VillageMall). The static build re-derives the stored snapshots.
- **Test:** `[D-32]`.

#### D-33 (Low): one drawer still gives two ages a day apart (BP-16 partly open)
- **Viewport:** 1440x900, light.
- **Repro:** some hours after a crawl (here 13:30 UTC, the Google crawl was at 07:27), open a Google role whose
  posting was updated on the day it was listed, e.g. "Campus Security Manager (English, Mandarin)" or
  "Software Engineer III, Infrastructure" in Dublin, and open its Listing block.
- **Expected:** one age: "Updated 18 days ago" with "Listed 18 days ago (Sep 23, 2026)".
- **Actual:** "Updated 18 days ago" at the top and "Listed 17 days ago (Sep 23, 2026)" in Listing. "Updated" counts
  whole days to now (`ago()`, BP-16's fix); "Listed" is `ageDays`, counted at the crawl. At 13:30 UTC this is 346
  of the 2,551 Google postings whose update and listing are the same day, and 25 of 130 at Microsoft (Apple,
  NVIDIA and Netflix 0). Later in the day it grows.
- **Screenshot:** `D-33-google-updated-30-listed-31.png` (the page clock set to 08:27 UTC: "Updated 30 days ago",
  "Listed 31 days ago (Sep 10, 2026)").
- **Owner:** `public/app.js` `ago()` and the Listing block in `drawerContent()` (count both from the same clock:
  the listing date to now, or both at the snapshot's time); `server/history.js#annotate` sets `ageDays`.
- **Test:** `[D-33]`, with the page clock fixed at a time within a day of the crawl where the two differ.

#### D-34 (Low): 3 Microsoft ranges that name two IC levels show only "Multiple pay zones"
- **Viewport:** 1440x900, light.
- **Repro:** open `/melon-seek/beta/#c=microsoft&job=microsoft%3A1970393556637088`, "Software Engineer II -CTJ -
  Poly". Its pay text: "Software Engineering IC3: USD $100,600 - $199,000 per year; Software Engineering IC3: USD
  $102,100 - $202,200 per year; Software Engineering IC4: USD $119,80…".
- **Expected:** like the other 122 Microsoft multi-level postings: "Pay by level: IC3: … · IC4: …".
- **Actual:** "$101K–235K · Multiple pay zones · Wide range (2.3×)"; the levels are only in a hover title. The same
  for "Senior Construction Project Manager" and "Contracts Manager" (IC5 and IC6, in euros, Finland).
- **Cause:** `parseSalary` keeps `levels` only when every group member has a different level name
  (`new Set(names).size === names.length`), so a level repeated for a second place, or a third truncated line,
  drops the breakdown.
- **Screenshot:** `D-34-microsoft-ic3-ic4-multiple-pay-zones.png`.
- **Owner:** `server/salary.js` `parseSalary`, the level grouping (around line 909): merge repeated level names
  (widest range per level) instead of dropping `levels`.
- **Test:** `[D-34]`.

#### D-35 (Low): a beta board linked on the main site says melon·seek doesn't list it
- **Viewport:** 1440x900, light.
- **Repro:** open `/melon-seek/#c=apple` (a beta link with `/beta/` dropped, or an old bookmark).
- **Expected:** "Apple is on the beta site", with a link to `/melon-seek/beta/#c=apple` (D-19's expected result,
  "or sends the user to /beta/").
- **Actual:** "This board isn't on this site · melon·seek doesn't list Apple's jobs here. Choose a company from the
  menu." There is no link to the beta, which lists Apple. The same for `#c=google&job=google%3A92335102675034822`
  (tested on Apple and Google).
- **Screenshot:** `D-35-main-site-apple-link-no-pointer-to-beta.png`.
- **Owner:** `public/app.js`, the "This board isn't on this site" state for an unknown company (the main site
  would need the beta's company list, or a small list of beta slugs from the build).
- **Test:** `[D-35]`.

#### D-36 (Low): Google lists one place under several Location labels
- **Viewport:** 1440x900, light.
- **Repro:** open `/melon-seek/beta/#c=google`; in the Location search type "Pryor", then "Moncks".
- **Expected:** one option per place: "Pryor Creek, OK" (Google's data center; "Pryor" is the same town) and
  "Moncks Corner, SC".
- **Actual:** "Pryor, OK" 15, "Pryor Creek, OK" 12, "Pryor Creek, US" 9 and "Pryor, US" 8; "Moncks Corner, US"
  13 and "Moncks Corner, SC" 12. A posting that names the city without its state gets a "City, US" key, and
  "Pryor" is not an alias of "Pryor Creek". Picking one of them misses the others' postings.
- **Screenshots:** `D-36-google-location-pryor-four-labels.png`, `D-36-google-location-moncks-corner-two-labels.png`.
- **Owner:** `server/geo.js` (a stateless US city that matches exactly one gazetteer city should take its state;
  a "Pryor" alias) and `public/app.js` `disambiguateLocations()`.
- **Test:** `[D-36]`.

#### D-37 (Low): the beta methodology and share pages don't say they are beta
- **Repro:** open `/melon-seek/beta/methodology/` and look at the tab; fetch `/melon-seek/beta/c/apple/`.
- **Expected:** like the app (D-27): "beta" in the title, or the beta channel mark.
- **Actual:** "How the Juice Score works — melon·seek" and "Apple jobs by salary · 4,875 roles · median $214K —
  melon·seek"; neither page has `data-channel="beta"`, and the methodology page has no link to the main site.
  The share page title is what a link preview shows.
- **Screenshot:** `D-37-beta-methodology-no-beta-mark.png`.
- **Owner:** `scripts/build-static.js` (the beta copy of the methodology page and the share pages) and
  `scripts/methodology.js`.
- **Test:** `[D-37]`.

### Notes
- **Seen on the desktop, already filed elsewhere, not re-filed:**
  - DQ-27 / VT-4: Apple `l=Austin` shows Cupertino-range cards ("IC Package Integration Lead $262K–394K · Austin,
    TX +1"), "49% show pay for Austin".
  - DQ-28: Apple "Senior Systems Engineer, Watch Software" scores Juice in Boulder on $294,400, the span's midpoint,
    not Boulder's own $194,700–354,700.
  - The $1.2M plausibility bound: Netflix "Software Engineer (L7)" is "Pay unclear" (max $1.4M), a decision for the
    user in the vetting.
- **Not bugs, for the record:** `s=senior` (lower case) matches nothing, because level keys are case-sensitive
  ("Senior"); the facet counts of a city include roles that list only its country ("Washington, DC" 306 at
  Microsoft, 44 of them in DC), as the filter's note says; an Insights row and the comps rows are buttons, not
  links.
- **Polish:** Market insights' skill premium "+$594" next to "+$10K" values; NVIDIA's title "8. Mixed Signal Design
  Engineer…" keeps a list number.
- **Not testable here:** live fetches, map tiles, and the careers hosts behind Apply.
- **One crash, not reproduced:** the renderer crashed once while zooming the Apple map out six times quickly after
  a pin click, at load average 14. Two re-runs of the same steps did not crash (heap 18–44 MB).

### Suite results
| Suite | Tree | Result |
|---|---|---|
| `npm test` | shared checkout, HEAD `859c8e0` plus the other agents' uncommitted files, with local data | 941 tests: **904 pass, 2 fail, 35 to-dos**. The 2 failures are the load-sensitive timing tests PERF-1 (543 ms of event-loop lag) and V15 (523 ms) at load 14; `node --test test/perf.test.js` alone passes 3/3, twice. The to-dos are the second data check's and the vetting's, as recorded. |
| First pass's `[D-17]`…`[D-30]` and guards | a scratch copy of `test/e2e/beta-desktop-qa.e2e.js` reading `BETA_QA_DIST` = the lead's build | **19/19 pass** |
| `node scripts/e2e.js --grep='^Beta desktop QA 2'` | the lead's build | **3/10**: the 3 guards pass; `[D-31]`…`[D-37]` fail by design |
| `node scripts/e2e.js` (full) | a scratch mirror of the checkout whose `dist` is the lead's build, `BETA_QA_DIST` set too (the shared `dist/` is from 2026-10-10 and 7 suites read only `dist/`) | **231/254 pass, 19 fail, 4 skipped** |

The 19 failures are all red tests that wait for their fixes: this pass's `[D-31]`…`[D-37]`, the second beta mobile
pass's `[M-28]`…`[M-31]`, and the beta accessibility review's `[A-1]`…`[A-7]` and `[V8]`. Every other test passes,
including all of fix wave 3's (fix3-app, fix3-compare, fix3-data, fix3-viz). The 4 skips: `[D-11]` (these boards
have listing dates), the methodology screenshots (need `E2E_SHOTS=1`), fix-app `[P-2]` (no estimate for its role)
and fix3-viz's NVIDIA Munich test (today's data has one such role).

All runs used `NODE_PATH=<scratch>/pw/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. The full run's
screenshot rewrites landed in the mirror's copy of `docs/`, so this pass leaves the shared screenshots unchanged.

---
