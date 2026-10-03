# Process log: mobile

## 1. Brief

Prompt: [prompts/mobile.md](prompts/mobile.md) (verbatim). The coordinator added four mid-task messages: the acceptance bar ("totally mobile compatible, smooth"), iOS Safari quirks, frame-time targets (no frame over 50 ms at 4x CPU after load), QA findings UX-10, UX-13, A11Y-5, PERF-2, PERF-3 and PERF-4, and two UX layout findings (a dangling "·" in the stats line, colliding map pin labels).

Goal: phones should feel like the Zillow app. The chart or map comes first. Results sit in a bottom sheet you can drag, filters open as one full-screen sheet, and a job opens as a full-screen page with Back. No new features.

Files owned (mobile paths only):
- `public/styles.css`: one phone block at the end of the file, plus the `.ico-back`/`.ico-close` rule.
- `public/app.js`: the mobile section (sheet, chip-to-filter-sheet, keyboard insets), lazy Leaflet and lazy Insights, lazy card pages, and the viz skip under the filter sheet.
- `public/index.html`: removed the render-blocking Leaflet tags. The viewport meta already had `viewport-fit=cover`.
- `docs/process/mobile.md` and `docs/process/prompts/mobile.md`.
- `docs/process/scripts/mobile-*.mjs` and `docs/screenshots/mobile/`.

## 2. Inputs and sources

- `docs/CONTRACT.md`: the frontend interfaces. `createMap` needs the global `L` only when it is called, which made lazy Leaflet possible.
- `docs/strategy/ROADMAP.md` §8 (UI simplicity budget): no new controls, modes or filter sections. Nothing was added. The phone top bar loses the logo, and the stats line gets shorter.
- `docs/process/ux.md`: the previous phone layout (an 82vh sheet toggled by tap, a 118px peek, and the top-bar regroup with `display: contents`).
- `docs/QA.md` "Improvement audit (wave 1)": UX-10, UX-13, A11Y-5, PERF-2, PERF-3 and PERF-4.
- `node_modules/leaflet/dist/leaflet.css`: Leaflet already sets `touch-action: none` on `.leaflet-container`.
- Tooling: Playwright 1.63 from the scratchpad. Chromium 141 is in `/opt/pw-browsers/chromium-1194`. There is no WebKit, so iOS Safari is emulated with an iPhone UA, `isMobile`, `hasTouch` and `deviceScaleFactor: 3`. The Safari quirks are handled in CSS: dvh fallbacks, safe-area insets, 16px inputs, the tap highlight, `(hover: none)` and visualViewport.

## 3. Decisions and rationale

1. **One phone layout (≤ 860px), appended at the end of styles.css.** Desktop rules are untouched; the block wins by cascade order. Its rows:
   - Top bar row 1: company menu, data badge, theme.
   - Top bar row 2: search, then Chart · Map · Insights as text labels (UX-13; the icons are hidden).
   - Quick chips row.
   - Full-bleed viz.
   - The sheet.

   The logo is hidden on phones; the company menu carries identity. Every row is 44px.
2. **Landscape (≤ 860 × ≤ 500).** The top bar folds into one row, the stats line hides, peek is 64px and half is 45%. The chart had 23px of visible height before and has 165px now.
3. **Bottom sheet.**
   - State lives in `body[data-sheet] = peek | half | full`, and `sheet-open` stays set for compatibility.
   - CSS owns the snap transforms. Peek is `--sheet-peek: 84px` plus the safe area, half is `--sheet-half × 100dvh`, full is `none`. app.js reads both variables, so there is one source of truth.
   - Gestures use pointer events with no library. Layout is read once, at pointerdown. Each frame writes one inline `transform` in a rAF. `.is-dragging` sets `will-change: transform` and disables the transition only while dragging.
   - Release velocity counts only the last 100 ms. A finger that rested before lifting has v = 0. Without that, a slow drag snapped one state too far.
   - A flick faster than 0.6 px/ms goes one snap further; otherwise the sheet snaps to the nearest state.
   - `touch-action: none` applies to the sheet and its list until the sheet is full. A full sheet's list scrolls natively (`pan-y`), and you drag it down by the handle or header.
   - Tapping the handle cycles peek, half, full. Tapping the header toggles peek and half. Esc collapses. The sheet overlays the viz, so the chart and map never re-lay out during a drag. map.js has its own ResizeObserver; no second resize path was added.
4. **Mode change collapses the sheet to peek** (QA UX-10).
5. **Filters are one full-screen sheet.** It slides up, has a sticky "Show N roles" footer, and gets `visibility: hidden` when closed so it drops out of the tab order.
   - The Salary, Department, Location, Seniority and Remote chips open this sheet scrolled to their section (`openFiltersAt`).
   - **"More" keeps its own bottom sheet** because it carries the Juice chips, which the filter panel does not have. See section 6.
6. **Job page.** The drawer is `inset: 0`. `#drawerClose` renders both an X and a Back chevron; on phones CSS shows the chevron at the top left. Browser and hardware Back already close the page through the hash (verified).
7. **Touch targets of at least 44px** on every shell control:
   - Salary slider: a 44px rail with 28px thumbs (A11Y-5).
   - iOS-size 51×31 switch.
   - 44px rows for checks, keyword chips and the company list.

   **Inputs and selects are 16px** (no iOS focus zoom), including the Insights forms. **Shell text is at least 12px.**
8. **No hover-only information.**
   - `(hover: none)` cancels sticky hover looks and adds `:active` press feedback. `-webkit-tap-highlight-color: transparent`.
   - Chart bins and ranges, and map pins, already act on tap (cluster or area selection, or the drawer). Chart and map tooltips duplicate on-screen numbers.
9. **iOS 100vh and safe areas.**
   - `body` is `100vh` with a `100dvh` fallback chain. The sheet is `top/bottom`-anchored, so it needs no vh.
   - The half snap and popovers use dvh with a vh fallback.
   - `env(safe-area-inset-*)` applies to the top bar, the left and right gutters (landscape notch), the sheet, the filters footer and the drawer footer.
   - `html { overscroll-behavior: none }` stops pull-to-refresh and bounce while dragging. Every scroller (cards, filters, popovers, drawer, Insights) gets `overscroll-behavior: contain` plus `-webkit-overflow-scrolling: touch`.
10. **Keyboard.** iOS keeps the layout viewport when the keyboard opens, so fixed footers and bottom sheets end up under it. `visualViewport` sets `body.kb-open` and `--vvh`:
    - bottom-sheet popovers move to the top and are capped at `--vvh`;
    - the filters footer hides;
    - a focused input in the filters or a popover scrolls to center.
11. **Deferral.**
    - Leaflet's JS and CSS load on first Map open, or at idle after the first data render, whichever comes first (PERF-3). They are no longer render-blocking in `<head>`.
    - `features/insights.js` loads by dynamic import at idle, or on pointerdown on Insights. It re-renders only when Insights is showing; a prefetch that rebuilt the list stole focus, which made the keyboard e2e test flaky.
    - The first card page is 24 on phones (60 on desktop).
    - An IntersectionObserver appends 4 cards per frame while the list end is within 600px, so cards render lazily (PERF-4). "Show more" now appends in place instead of rebuilding the list.
    - While the full-screen filter sheet is open, the covered chart/map update is skipped and runs once on close. The covered results sheet gets `content-visibility: hidden`.
12. **content-visibility on cards was tried and removed.** It deferred card rendering to the first sheet drag, which produced a 50 ms frame at 4x. With `visible` every drag frame was 17 ms. The same property on filter sections was also removed: it made `innerText` empty (it broke the e2e accessible-name check) and gave no measurable tap gain.
13. **Stats line on phones:** "$352K median · middle 50% $287–411K", one line. The count and list pay are dropped (the sheet's peek shows the count). "mostly …" is hidden together with the separator *in front of it*. The old rule hid the separator after it, which caused the dangling "·".
14. **Reduced motion:** the global rule already zeroes transitions, so the sheet snaps without animation and drags still follow the finger. Verified with `reducedMotion: 'reduce'` (transition 1e-05s).

## 4. Replayable steps

```sh
SP=<scratch dir>; export NODE_PATH=<dir with playwright>/node_modules   # never `playwright install`
PORT=5391 node server/index.js &                                         # real server, data/snapshots
node scripts/build-static.js --out $SP/dist-before                       # snapshot BEFORE editing
node $SP/serve-subpath.mjs $SP/dist-before 5392 /melon-seek/ &           # Pages-like /melon-seek/
node docs/process/scripts/mobile-audit.mjs http://localhost:5391/ before --layout --shots=$SP/shots-before
node docs/process/scripts/mobile-audit.mjs http://localhost:5392/melon-seek/ before-static --perf
# ...edit...
node scripts/build-static.js --out $SP/dist-after && node $SP/serve-subpath.mjs $SP/dist-after 5393 /melon-seek/ &
node docs/process/scripts/mobile-audit.mjs <url> after --layout --shots=...   # 4 devices × light/dark
node docs/process/scripts/mobile-audit.mjs <url> after --perf                 # 360 Android + 390 iPhone × Anthropic/Anduril, 4x CPU
node docs/process/scripts/mobile-flows.mjs http://localhost:5391/ <shots dir>  # 15 functional checks
node docs/process/scripts/mobile-drag-bench.mjs 'http://localhost:5391/#c=anduril'
node docs/process/scripts/mobile-scroll-map-bench.mjs 'http://localhost:5391/#c=anduril'
node docs/process/scripts/mobile-tap-bench.mjs 'http://localhost:5391/#c=anduril'
npm test; node scripts/e2e.js
```

How `mobile-audit.mjs` measures:
- **Layout.** At each state (chart, sheet, filters, drawer, map, Insights) it records:
  - visible, actually hit-testable controls under 44px, split into shell, viz and features;
  - text under 12px;
  - inputs under 16px;
  - `scrollWidth` overflow;
  - fixed/sticky overlaps;
  - visible viz height;
  - whether Back closes the drawer;
  - map `touch-action`.
- **Perf.**
  - FCP comes from paint timing.
  - "Chart"/"cards" are the first viz DOM and the first card, from a MutationObserver.
  - TTI is the end of the last long task that ends after the UI is ready, with 2 s of quiet after it.
  - Long tasks come from a PerformanceObserver; TBT is the sum of (task − 50 ms).
  - Frame times are rAF deltas while CDP `Input.dispatchTouchEvent` drags the sheet, scrolls the list and pans the map.
  - CPU is throttled 4x with `Emulation.setCPUThrottlingRate`.

The servers were killed externally several times (parallel agents' cleanup), so later runs start their own server inside the same command.

## 5. Verification

**Tests**
- `npm test`: 290/290 pass. One earlier run had 1 failure that did not reproduce: a parallel server change.
- `node scripts/e2e.js` on real data: 52/56. Both **mobile tests pass** ("390x844 renders without horizontal scroll" and "buttons keep visible text / accessible names"), as do the map, drawer, filter, Insights and keyboard tests. The 4 failures are outside my files:
  - 3 are in the Compstimate task force's new tests: the widget location select has no "Singapore" / "Tokyo" / "Mumbai" option.
  - 1 is the keyboard-focus test, fixed on my side (decision 11). It then passed 3/3 in targeted runs.
- Earlier failures caused by UX's in-flight company-menu change (from `aria-selected` options to `aria-current` buttons) have since been fixed by their owners.

**Functional checks** (`mobile-flows.mjs`, iPhone UA at 390×844): 15/15 PASS, no page errors.
- No Leaflet in the startup HTML.
- The Location chip opens the full-screen filters at Location.
- "Show 53 roles" closes the sheet and the chart catches up.
- Slow drag: peek to half. Drag: half to full.
- A full sheet's list scrolls.
- A flick down from full goes to half.
- Handle taps cycle.
- A card opens a full-screen page with Back at x=4px.
- The Back arrow closes it, and browser Back closes it.
- A mode switch collapses to peek.
- The map loads Leaflet lazily.
- With the keyboard up, the company sheet sits at top=8, bottom=472 (under `--vvh` 480).
- Reduced motion snaps.

### Before/after: layout (390×844, light; dark is identical; 360, 430 and landscape in the JSON reports)

| Screen | Shell tap targets < 44px | Inputs < 16px (iOS zoom) | Shell text < 12px | Horizontal overflow | Visible chart/map height |
|---|---|---|---|---|---|
| Chart | 17 → **1** | 5 → **0** | 0 → 0 | 0 → 0 | 457 → **504** px |
| Sheet open | 14 → **1** | 5 → **0** | 1 → **0** | 0 → 0 | 0 → **166** px (half snap) |
| Filters | 13 → **0** | 5 → **0** | 3 → **0** | 0 → 0 | (full screen) |
| Job page | 5 → **0** | 5 → **0** | 1 → **0** | 0 → 0 | (full screen) |
| Map | 14 → **1** | 4 → **0** | 0 → 0 | 0 → 0 | 501 → **542** px |
| Insights | 14 → **1** | 8 → **0** | 0 → 0 | 0 → 0 | n/a |
| Landscape 844×390, chart | 20 → **1** | 5 → **0** | 0 → 0 | 0 → 0 | **23 → 165** px |

The remaining "1" is the sheet grip: 28px tall and full width, directly above the 56px header row, which is also a tap and drag zone (84px combined).

The data badge's 0px label is a deliberate `font-size: 0` with a `::before` label; the audit skips it. Remaining small text and targets are in viz and features files and are routed below.

### Before/after: throttled perf (4x CPU, DPR 3, touch)

Static Pages build under `/melon-seek/`, median of 2 runs per side. Times are in ms from navigation.

| Device · company | First paint (FCP) | First chart (cards) | Interactive | Long tasks: n / max / TBT | DOM nodes | Worst frame: sheet drag / list scroll / map pan |
|---|---|---|---|---|---|---|
| Android 360×740 · Anthropic | 594 → 490 | 1920 → 1750 (1575) | 2130 → 2120 | 6 / 515 / 637 → 8 / **298** / **370** | 1893 → 828 | 17\* / 117 / 17 → 17 / **33** / 33 |
| Android 360×740 · Anduril | 540 → 546 | 3032 → **2308** (2085) | 3885 → **2615** | 6 / 1508 / 2264 → 8 / **635** / **762** | 7244 → **780** | 150\* / 50 / 17 → **50** / **33** / 17 |
| iPhone 390×844 · Anthropic | 476 → 474 | 1744 → 1869 (1684) | 1969 → 2151 | 6 / 571 / 692 → 8 / **299** / **345** | 1897 → 863 | 17\* / 33 / 17 → 17 / **17** / 17 |
| iPhone 390×844 · Anduril | 510 → **384** | 2769 → 2671 (2418) | 3663 → **3022** | 6 / 1378 / 2162 → 9 / **921** / **1223** | 7250 → **796** | 33\* / 33 / 33 → **17** / **17** / **17** |

Real server: before is 1 run, after is the median of 2.

| Device · company | FCP | First chart (cards) | Interactive | Max task / TBT | Worst frame: drag / list / pan |
|---|---|---|---|---|---|
| Android · Anthropic | 612 → 646 | 2258 → 2275 (2030) | 2500 → 2574 | 972 / 1262 → **382 / 511** | 17\* / 50 / 17 → 17 / 33 / 67† |
| Android · Anduril | 668 → 532 | 3511 → **2207** (1989) | 4591 → **2526** | 1490 / 2504 → **833 / 1002** | 33\* / 67 / 17 → **17 / 33** / 17 |
| iPhone · Anthropic | 596 → 486 | 1718 → **1353** (1186) | 2079 → **1642** | 605 / 831 → **365 / 422** | 17\* / 33 / 17 → 17 / 33 / 17 |
| iPhone · Anduril | 536 → 440 | 2801 → **2209** (1977) | 3478 → **2551** | 1324 / 1992 → **778 / 926** | 50\* / 33 / 33 → **17 / 17 / 17** |

Notes on the two perf tables:
- \* Before, the sheet **did not move** on a drag (it was tap-only; its top stayed at 622 or 726). So the "before" drag frame measures an idle page. After, the drag moves the sheet to the half or full snap (top 422 or 162).
- † One 67 ms frame in one run: map pan right after the map was created. The other run's map pans were 17 ms.
- The count of long tasks went up (6 → 8) while the worst task and TBT fell 40-65%. Work is now split: cards first, then the chart at idle (UX), plus lazy pages.

Targeted benches (Anduril, iPhone 390, 4x CPU):

| Interaction | Before | After |
|---|---|---|
| Sheet drag, 9 drags × 3 runs, worst frame | sheet doesn't drag | **17 ms every drag** (50 ms on the first drag while cards used content-visibility, which was then removed) |
| Deep list scroll, 10 swipes, worst frame / frames > 50 ms | 33 ms / 0, but the list stops at 60 cards behind a "Show more" button | 33-50 ms / **0**, cards load lazily to 64-72 |
| Filter tap (Event Timing duration) | 200-944 ms | **144-304 ms** (144-184 on a quiet machine) |
| Map: first tap to first pin | 303 ms (Leaflet parsed at startup) | 727 ms lazy-only, **336-392 ms** with the idle prefetch |

**Attribution.** The after numbers also include parallel work in the same tree:
- viz's chart windowing ("worst task 1.36 s to 125 ms" on desktop): most of the Anduril DOM drop (7.2k → 0.8k nodes) and of the max-task drop;
- UX's "cards first, chart when idle" (`scheduleViz`, PERF-2).

Mine:
- render-blocking Leaflet removed (FCP);
- Insights deferred;
- the 24-card first page and chunked lazy append;
- the draggable sheet and its frame budget;
- the viz skip and `content-visibility: hidden` under the filter sheet (filter tap latency);
- all layout and touch numbers.

The machine's load average was 2-6 during the runs (other agents), so expect about ±20% noise.

Screenshots in `docs/screenshots/mobile/` (DPR 3):
- **Before/after pairs** (`before-*.png` / `after-*.png`):
  - iPhone 390: chart, sheet, filters, drawer and map (light), and chart (dark);
  - Android 360 chart;
  - iPhone 430 chart;
  - landscape 844×390 chart.
- **After only** (`after-390-*.png`): `sheet-half`, `sheet-full`, `filters-location` (a chip opens the sheet at its section) and `company-keyboard` (a bottom sheet lifted above the keyboard).

## 6. Known gaps and follow-ups

- **No real iOS/WebKit run.** WebKit isn't installed. The keyboard, the dvh toolbar behaviour and the notch insets are coded to spec and checked by forcing `kb-open` and `--vvh`. They should be checked once on a real iPhone (Safari 16+; `:has()` is used for the stats separator, so Safari 15.4+ is required for that rule).
- **Hardware Back with the filter sheet open** steps back through filter history; it does not close the sheet. Fixing that needs a history entry per open sheet. Left as is to keep it simple.
- **The Juice filter lives only in "More".** That is why "More" keeps its own sheet on phones. ROADMAP §8 allows "New options go inside existing sections", so the Juice chips could join the Salary section and "More" could then also open the one filter sheet. That is a desktop panel change for UX.
- **The sheet grip is 28px** tall, but the grip and header form one 84px zone.
- **Anduril's first chart is still about 2.2-2.6 s** at 4x. The remaining long task is chart work, which is routed to viz.
- **Viz/features changes to route** (I did not edit these files):
  1. **`public/viz/chart.js` `render()` line 242:** `if (scroll.scrollHeight <= scroll.clientHeight + 1) container.classList.add('ms-chart--flow')`. It reads `scrollHeight` right after building the DOM, which forces a synchronous layout of the whole chart. On Anduril before windowing that was the 916 ms self time. Compute it from the row count × row height, or defer it to a rAF.
  2. **`public/viz/map.js` `cluster()` (pin labels collide at 390px, offline/labelled mode):**
     - change `const ch = container.classList.contains('ms-map--offline') ? CLUSTER_H + 16 : CLUSTER_H;` to `const off = container.classList.contains('ms-map--offline'); const ch = off ? CLUSTER_H + 16 : CLUSTER_H; const cw = off ? Math.max(CLUSTER_W, 150) : CLUSTER_W;`;
     - use `cw` in place of `CLUSTER_W` in the overlap test;
     - in `viz.css` add `.ms-pin__label { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`.
  3. **`public/viz/viz.css`, touch sizes.** Add `@media (pointer: coarse) { .leaflet-touch .leaflet-bar a { width: 44px; height: 44px; line-height: 44px; } .ms-map .ms-modes__btn { min-height: 44px; } .ms-bin::before { content: ""; position: absolute; inset: -12px; } }`. The zoom buttons are 30px, the Pay/Juice toggle is 26px, and the small bins are hard to hit.
  4. **`public/viz/viz.css`, text under 12px on phones:**
     - `.ms-bin__dot--sm` is 10px and `.ms-bin__dot` is 11px (counts);
     - `.ms-pin__label` / `.ms-pin__count` are 10.5px;
     - `.ms-chart__foot` is 11.5px;
     - `.ms-map__offline-note` is 11px;
     - `.ms-comps__tick` is 10.5px (drawer "Same role elsewhere").

     Raise them to 12px under `@media (max-width: 860px)`, or under `(pointer: coarse)` for the counts.
  5. **`public/viz/map.js` options:** pass `zoomAnimation`/`fadeAnimation` as `!matchMedia('(prefers-reduced-motion: reduce)').matches`.
  6. **`public/features/*` (Insights).** Three controls are under 44px (Compstimate selects). Spans in the Compstimate distribution are 10.5px ("$216K", "typical range on this board"). I set the Insights input fonts to 16px from styles.css; the sizes belong in `features.css`.

## 7. Change log

- 2026-10-02 ~12:10 Prompt saved. Before snapshots taken: a static build in the scratchpad, plus a layout and perf audit on the real server and the static build.
- ~12:40 Lazy Leaflet and Insights. 24-card first page. Back icon on the job page.
- ~12:55 Phone CSS block: rows, sheet snaps, full-screen filters, job page, 44px targets, 16px inputs, safe areas, keyboard, hover:none, landscape.
- ~13:05 Sheet drag (pointer events + rAF), chip-to-filter-sheet, visualViewport keyboard insets, mode change collapses the sheet.
- ~13:30 Stats-line fix (dangling "·"). Full-width badge. Insights input fonts.
- ~13:45 Removed content-visibility on cards (a 50 ms first-drag frame). Viz skipped under the filter sheet.
- ~14:00 Lazy append in place, then chunked to 4 cards per frame. Idle prefetch of Insights and Leaflet. Fixed the Leaflet load chaining.
- ~14:15 Release velocity fixed (last 100 ms only). Full-width phone popovers (the company menu was 340px).
- ~14:40 Insights prefetch no longer re-renders outside Insights (the keyboard e2e flake). Final audits, screenshots and log.

## Lead mobile pass (2026-10-03)
Audit: `docs/process/scripts/mobile-audit.mjs` on the static build served under
/melon-seek/ (`qa-audit-static-server.mjs`, PORT=5410), at 360x740, 390x844,
430x932 and 844x390, light and dark, with 4x CPU for perf. Screenshots were
reviewed by eye.

Found and fixed:
- **360px:** the data badge covered the company name. Cause: a later
  `.company-menu-btn { flex: none }` rule overrode the phone shrink rule. Fix:
  phone rule `flex: 0 1 auto; min-width: 0; overflow: hidden`. At ≤400px
  the badge shows `● Oct 2` (new `data-micro` label) so "Anthropic" fits.
- **360px:** "Group: Department" ran off the screen edge (the select doesn't
  shrink inside its label). At ≤400px "Group:" is visually hidden but stays
  the accessible name, and the select gets max-width 40vw.
- **Landscape 844x390:** about 1.5 chart rows were visible. The distribution
  strip and notes line are hidden at max-height 500px; now about 2.5 rows.
- **Drawer copy:** "Mid ai research & ml engineering roles" now reads "AI
  research & ML engineering roles at Mid level" (label casing kept).

Checked and fine:
- no horizontal scroll, overlaps or inputs <16px on any device;
- sheet drag, list scroll and map pan worst frame 17 ms at 4x CPU;
- first paint 0.34–0.53 s, interactive 1.2–1.9 s;
- the sheet handle plus header form one 84px drag zone, so no change needed.

Known gaps:
- Anduril (2,418 jobs) still has one 0.5 s task while loading at 4x CPU
  (list parse and unpack). Gestures are unaffected. Possible follow-up:
  unpack in a worker.
- Offline-only map place labels can collide (no basemap); real users get
  OSM tiles and no labels.

Results: npm test 294/294, e2e 56/56. Before/after shots are in
docs/screenshots/mobile/.
