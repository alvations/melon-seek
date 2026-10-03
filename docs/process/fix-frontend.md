# Process log: fix-frontend

## 1. Brief
- **Prompt:** [`docs/process/prompts/fix-frontend.md`](prompts/fix-frontend.md).
- **Goal:** fix the phone bugs from the mobile QA pass (`docs/QA.md`, "Full QA pass (mobile) 2026-10-03"):
  M-1, M-3, M-4 and M-7 to M-18. M-2, M-5 and M-6 were handled elsewhere. The rules were: no new visible controls,
  hit slop rather than bigger visuals, a 12px text floor on phones only, and no change to desktop density.
- **Files owned:** `public/app.js`, `public/styles.css`, `public/index.html` (not changed), `public/viz/*`,
  `public/features/*`.
- **Files not touched:** `public/api.js`, `scripts/build-static.js` and `public/unpack-worker.js` (the perf agent
  owns them), and `docs/QA.md`.

## 2. Inputs and sources
- `docs/CONTRACT.md`: the module layout and the owners.
- `docs/strategy/ROADMAP.md` §8 (UI simplicity budget). Nothing here adds a control, mode, sort option, card row
  or colour.
- `docs/QA.md`, mobile section: the repro, owner and expected behaviour for each bug.
- `test/e2e/mobile-qa.e2e.js`: the three failing tests, `[M-1]`, `[M-3]` and `[M-4]`.
- No skills or external documentation were used.

## 3. Decisions and rationale
1. **Overlay history (M-3).**
   - **How it works:** a phone overlay pushes one history entry, `{ msOverlay }`, when it opens. This covers the
     filter sheet whenever it is an overlay (up to 1199px), and the company, More, badge and board sheets on
     phones (up to 860px).
   - **While it is open:** `commit()` rewrites that entry with `replaceState`.
   - **Back with the overlay open:** `onPopState` closes the overlay. It then pushes the current state, so the
     filters stay.
   - **Closed from the UI** (✕, Done, a tap outside): the overlay calls `history.back()` to pop its own entry.
     Once the pop lands, everything changed inside the overlay is recorded as one ordinary entry, so a later Back
     undoes the whole visit in one step.
   - **One overlay replacing another** (a chip tap while More is open, or company menu → Add a board) keeps the
     single entry (`keepHist`, `reopen`).
   - **Alternatives rejected:** `replaceState` alone, without a pushed entry, still lets Back undo the earlier
     state or leave the site. Leaving the entry in place after a UI close makes the next Back look like it does
     nothing.
   - **Desktop is unchanged:** popovers above 860px and the docked filter column at 1200px and up never push an
     entry.
2. **`openSaved`** now applies the saved hash through `set()` rather than `pushState` + `onHashChange()`. The menu's
   history entry may still be popping when it runs, and `set()` avoids that race.
3. **Trailing hashchange (M-16).** A traversal fires `popstate` and then `hashchange`. The second call re-rendered
   the cards, and that dropped the focus `closeDrawer` had just restored. `onHashChange` now returns early when the
   URL already equals the current state.
4. **Drawer paging (M-9)** passes `step: true`, so the commit is `replaceState`.
5. **Filter sheet modal (M-7)** applies only at 860px and below, which is when the sheet is full screen.
   - It sets `role="dialog"` and `aria-modal="true"`; `aria-label="Filters"` was already on the `<aside>`.
   - `.topbar`, `.quickbar`, `#main`, `#results` and the skip links become `inert` and `aria-hidden`.
   - Tab is trapped with the existing `trapFocus`.
   - It is re-evaluated on resize, for rotation.
6. **Focus.**
   - **M-4:** the opener is passed in explicitly. iOS Safari doesn't focus a button on tap, so
     `document.activeElement` can't be trusted.
   - **M-11:** `openFiltersAt` hands its section's `<summary>` to `setFiltersOpen` as the focus target.
7. **M-15:** a single `syncChipsExpanded()` owns `aria-expanded` and `aria-controls="filters"` on the chips.
8. **Touch targets (M-8)**, all inside `@media (max-width: 860px)`:
   - **Zoom ±:** `::after` slop, 44x44. It is asymmetric (up for +, down for −) so the two never overlap. The bar
     gets `overflow: visible` and the corner radii move to the buttons.
   - **Pay|Juice:** slop `-9px` vertical, giving 44 tall.
   - **Remote:** slop `-7px`, giving 44 tall.
   - **Cluster bins:** a `::before` slop 44 tall and `min(44, bin spacing)` wide (`--ms-bin-slop`), so a slop
     never reaches a neighbouring circle.
   - **Ranges rows and comps rows:** 44px rows. Slop isn't possible here, because the rows are stacked.
   - **Insights fields:** 44px tall.
   - **CSV link:** on its own 44px line. A slop failed hit-testing: the wrapped note after it covered the padding.
9. **Ranges on phones (M-17):** when the chart is narrow (container under 520px), the title moves to a
   full-width line above its bar (`ms-chart--stack`). It is the same pattern Clusters already uses when narrow.
   - **Result:** 3 of 21 visible titles are still ellipsised, against all of them before.
   - **Group header:** the median moves to the right edge, so it can't overlap the group name.
10. **Text floor (M-13):** one 12px floor block per stylesheet, inside the phone breakpoint. Desktop sizes are
    unchanged.
11. **M-12:** `body.kb-search` is set only while `#search` has focus with the keyboard up. With it, the peek sheet
    is translated to sit on `--vvh`. Fields in Insights don't trigger it, so the sheet never covers them.
12. **M-10:** with a notch, `#chartHost` is inset by `env(safe-area-inset-left/right)`. Leaflet's
    `.leaflet-left` and `.leaflet-right` corners are offset by the same insets. The map itself stays full-bleed.
13. **M-1:** in phone landscape, `.ms-map { min-height: 0 }` lets the map fit the strip above the sheet.

## 4. Replayable steps
```sh
npm test
NODE_PATH=<pw>/node_modules node scripts/e2e.js
PORT=8791 node server/index.js & echo $! > <scratchpad>/fix-fe/server.pid
NODE_PATH=<pw>/node_modules node docs/process/scripts/fix-frontend-check.mjs http://127.0.0.1:8791
kill "$(cat <scratchpad>/fix-fe/server.pid)"
```
`docs/process/scripts/fix-frontend-check.mjs` runs 45 checks:
- one or more per bug;
- desktop 1440x900 regression checks;
- hit areas measured with `elementFromPoint` extents;
- a text-size audit that walks every visible text node;
- the keyboard simulated as in the QA pass.

Screenshots go to `docs/screenshots/fix-frontend/`.

## 5. Verification
| Bug | Root cause | Fix (file:line) | Verified by |
|---|---|---|---|
| M-1 | `.ms-map { min-height: 320px }` (viz.css) beat the landscape layout, so the map ran 130px under the sheet | `public/styles.css:1216` | e2e `[M-1]` passes; check "M-1 pins and Remote above the sheet" |
| M-3 | Every filter tap pushed an entry; overlays had none, so Back undid a filter | `public/app.js:243` (commit), `:253-294` (overlayHist, onPopState), `:1284`, `:1302`, `:1336`, `:848`, `:2641` | e2e `[M-3]`; 4 checks: company menu (first action), More, ✕ keeps filters, one Back undoes a sheet visit |
| M-4 | The sheet hid with focus inside it, and the opener was never stored | `public/app.js:2448` (`setFiltersOpen`, opener refocus) | e2e `[M-4]`; checks after ✕ and after "Show N roles" (returns to the chip) |
| M-7 | `#filters` was a plain `<aside>` and the background stayed focusable | `public/app.js:2482` (`setFiltersModal`), `:2627` (Tab trap) | Checks: role and aria-modal, 4 regions inert, 10 Tab/Shift+Tab presses stay inside, cleared on close |
| M-8 | Small visuals with no slop | `public/viz/viz.css:684-698`, `public/viz/chart.js:29,463`, `public/viz/comps.js:17-18,69`, `public/features/features.css:463`, `public/styles.css:1204` | Hit areas: zoom 44x44, Pay 54x44, Remote 44 tall, bins 44 tall, Ranges, comps and Insights fields 44 |
| M-9 | `stepDrawer` → `openDrawer` → `commit()` pushed | `public/app.js:1803`, `:1856` | history +1 for open + Next, Next, Prev; one Back leaves the job page |
| M-10 | Chart host and Leaflet corners ignored the insets | `public/styles.css:1212`, `public/viz/viz.css:710` | Landscape 844x390 with insets 47/47/21: swatch, caption, zoom and Remote ≥ 47; right controls ≤ 797 |
| M-11 | `setFiltersOpen`'s 50ms timeout focused the first `<summary>` after the section focus | `public/app.js:2420` | Focus is on the Department `<summary>` |
| M-12 | The peek sheet stayed at the layout bottom, under the keyboard | `public/app.js:2437`, `public/styles.css:1200` | The count's bottom is 487 with a visual viewport of 508 |
| M-13 | Sizes under 12px in three stylesheets | `public/viz/viz.css:703`, `public/features/features.css:459`, `public/styles.css:1208` | Text audit across chart, map, drawer, Insights and the badge sheet: none under 12px |
| M-14 | The tip already held `data.error`, and the `<pre>` repeated it | `public/app.js:692` | Anduril badge: no `.badge-error`, and the sentence appears once |
| M-15 | `renderQuickbar` only reported popovers | `public/app.js:2495` | `aria-expanded="true"` and `aria-controls="filters"` while open, `false` after |
| M-16 | The trailing `hashchange` re-rendered the cards after the focus restore | `public/app.js:2659` | Focus is on the opening card after `goBack()` |
| M-17 | `labelW` was 92px on phones | `public/viz/chart.js:815-819`, `public/viz/viz.css:674` | 390px wide labels, 3 of 21 cut (`chart-ranges-390.png`) |
| M-18 | The suffix was printed even for 0 | `public/app.js:1680` | "zzzzqqq" gives "0 roles" |

**Test results**
- `npm test`: 301/301. One run during the perf agent's concurrent edits showed 300/301; the rerun was green.
- `node scripts/e2e.js`: 64/64, including all 8 Mobile QA tests (`[M-1]`, `[M-3]` and `[M-4]` now pass). The
  baseline before the fixes was 61/64.
- `fix-frontend-check.mjs`: 45/45.

**Desktop 1440x900 (no regressions)**
- The filters column has no dialog role and nothing is inert.
- A popover filter still pushes one entry, and Back undoes it.
- Ranges rows are still 22px with side labels; comps rows are still 28px.
- Drawer paging now uses `replaceState` here as well (intended).
- No page errors. Screenshots: `desktop-1440-*.png`.

## 6. Known gaps and follow-ups
- **Cluster bin slop width:** it is the bin spacing, which can be as little as 34px, rather than 44. A full 44px
  would overlap the neighbouring circles. The height is 44, and WCAG 2.5.8 (24px plus spacing) is met.
- **Landscape map, empty toolbar row:** there is an empty viz toolbar row (about 48px) above the map. It is
  visible in both the before and after screenshots and is out of scope here. Hiding `.viz-toolbar` in map mode in
  landscape would give the map that height back.
- **Not tested on a device:** real iOS Safari and real hardware Back. The history logic was checked with
  Chromium's `goBack()`.
- **Promote to the e2e suite:** `fix-frontend-check.mjs` could become e2e tests. It wasn't added to `scripts/e2e.js`
  because another agent had that file open.

## 7. Change log
- 2026-10-03: M-1, M-3, M-4, M-7 to M-18 fixed; process log and check script added.
