# Process log: UX and frontend design review, beta site, round 3

## State

- **Done:** every review question; the density inventory (8 boards x 390x844, 360x740, 1440x900); the
  layout and contrast audit (5 viewports x 2 themes); the hover-only and mouse-wording list (sent to the lead
  for fix-touch-tips); findings UX-37 to UX-62 (sent to the lead in three batches); the red e2e group
  `test/e2e/beta-ux-review-2.e2e.js` (16 tests, all red), registered in `scripts/e2e.js`; the scripts in
  `docs/process/scripts/ux-review-beta-2/`.
- **In progress:** nothing.
- **Next step:** none for this lane; the lead integrates (the commits are listed in section 7).

## 1. Brief

Prompt: [prompts/ux-review-beta-2.md](prompts/ux-review-beta-2.md) (verbatim).

Goal: the round-3 design and frontend review of `/melon-seek/beta/`, on the 2026-10-16 crawl with every
board whole (Amazon 22,179 postings, Apple 4,851, Google 3,821, NVIDIA 2,711, Microsoft 2,435, Meta 1,208,
Netflix 414; main-site Anduril 2,537). It checks what changed since round 2: Amazon's whole board and Meta,
the first-page preview, Google's job families with the Company group-by and filter, fix-density's one-line
notes, the salary audit's card labels ("· 2 levels", "· N places", "from €X", shift pay), and viz-even's
clusters and stacked Ranges rows. No product code was changed.

Files owned:
- `docs/process/ux-review-beta-2.md` (this log and the findings);
- `docs/process/prompts/ux-review-beta-2.md`;
- `docs/screenshots/ux-review-beta-2/` (shrunk with `scripts/cycle/shrink-screenshots.sh`);
- `test/e2e/beta-ux-review-2.e2e.js` (new), registered in `scripts/e2e.js` (the import and
  `registerBetaUxReview2Tests(suite)`, after viz-even);
- `docs/process/scripts/ux-review-beta-2/` (the measurement scripts, so the review can be replayed).

Findings are **UX-37 to UX-62**, numbered after UX-36, the highest UX ID in `docs/process/`.

## 2. Inputs and sources

- README.md, docs/strategy/ROADMAP.md §8, docs/CONTRACT.md, docs/METHODOLOGY_GUIDE.md, docs/process/ux.md,
  PLAYBOOK.md, TEMPLATE.md.
- docs/process/lead.md from "Beta round 3" on: fix wave 5, fix-density, the salary audit, google-grouping,
  perf-mobile-beta-2 (parts 1 and 2), fix6-fresh-data, the round-3 methodology review, viz-even.
- docs/process/fix-density.md (the one-line rule, `public/viz/note.js`), google-grouping.md, viz-even.md,
  methodology-review-beta-2.md (the known MR-23 to MR-42), ux-review-beta.md (round 2, UX-15 to UX-36),
  viz-review-beta.md, and the 2026-10-11 beta sections of docs/QA.md.
- Code read to find owners: `public/app.js` (`payPill`, `payLabels`, `drawerContent`, `juiceScaleNote`,
  `juiceScaleText`, `setFiltersModal`, `makeChecklist`, the drawer keyword fold), `public/viz/chart.js`
  (`renderClusters`, `overflowMarker`, `buildCRow`, the circle-count rule at 1108, the Ranges legend at 1553),
  `public/viz/map.js` (`renderJuiceLegend`), `public/viz/comps.js` (the "Click to see these roles" tip),
  `public/viz/palette.js` (`formatMoney`), `public/styles.css` (`.d-juice`, `.sheet-handle`),
  `public/viz/viz.css` (`.ms-bin__dot`, `.ms-bin__chip`), `public/features/compstimate.js`.
- The build under review: the lead's `cycle-beta6-dist` (the d98a9f0 code; `app.js`, `chart.js`, `map.js`,
  `styles.css`, `note.js` and `insights.js` are byte-identical to the worktree's), served on port 5482.
- Known open items, not re-filed (evidence added where seen): MR-23, MR-26, MR-28, MR-29, MR-33 to MR-35,
  MR-37 to MR-42, and the Amazon Insights long task.

## 3. Decisions and rationale

1. **What gets a test.** An objective, measurable problem gets a red test. That means text cut off or wider
   than its box, labels that can't be told apart once cut, the same number shown two ways in one view, a
   control that takes focus while it is off screen, and every secondary line over the density rule. The rule
   is the one fix-density set: one line on a phone, at most 12 words, nothing cut off. Words, hierarchy,
   colour meaning and the like go in the table with a fix.
2. **Density measurement.** Every visible "leaf block" of text under the chart, map, Insights, filter and
   drawer roots is measured: words, the line boxes from `Range.getClientRects()` grouped by vertical middle,
   and whether it is cut. Card titles, row names, pin labels, descriptions and bullets are left out, because
   they are content, not secondary text. The facts count splits on " · ", "; " and sentence ends. Boards:
   all 7 big-tech boards plus Anduril. Views: Clusters, the phone sheet, Ranges, Map Pay and Juice,
   Insights, the filter sheet, 12 kinds of drawer, and the empty search.
3. **Contrast method.** As in round 2: the computed colour, alpha-blended down the ancestors' backgrounds.
   This round it also reads `color(srgb …)`, the form a `color-mix()` fill resolves to. Without that, every
   circle count read 1:1.
4. **Visible text of an ellipsized label.** The canvas `measureText` gives the longest prefix that fits next
   to "…" in the element's own font (UX-38's test).
5. **The preview on a phone.** UX-39's test holds the whole list's request so the preview state lasts, then
   asks whether any preview card is on the first screen and not covered (`elementFromPoint`).
6. **Severity.** High misleads or blocks. Medium confuses, looks broken, or breaks the density rule (the
   brief's floor). Low is polish.
7. **Machine load.** Other agents ran on the same 4 CPUs (load average 7 to 15). Timings are given with the
   load, and only as a lower bound on what a person on a quiet laptop would see.

## 4. Replayable steps

The scripts are in `docs/process/scripts/ux-review-beta-2/` (`lib.mjs` holds the viewports; `BASE` and
`SHOTS_DIR` are set by environment). Run them from a folder whose `node_modules` links to Playwright, and use
Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

1. Worktree: `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach origin/claude/stoic-ride-54ddxp`
   (d98a9f0). Data links to `<scratch>/wt-data2/data/{snapshots,beta/snapshots}`; `node_modules` linked to the
   main checkout's (not committed).
2. Serve: `PORT=5482 node scripts/cycle/serve.mjs --dist <scratch>/cycle-beta6-dist --pid <scratch>/ux-review-beta-2/serve.pid`.
3. `node dump.mjs` writes each board's jobs through the app's own `api.js`. A Python step picks drawer samples
   per board into `picks.json`: two levels, places, minimum, shift pay, fixed term, foreign currency, hourly,
   no pay, no department, long title, many places.
4. First impression: `node first.mjs` (5 viewports x 2 themes). Preview: `node preview.mjs p390 light 4 amazon`
   and `d1440` (4x CPU, 9 Mbit/s, 150 ms RTT).
5. Density: `node density.mjs p390,p360,d1440` (about 35 minutes at load 10), then `python3 analyze.py <vp>`
   (lines over the rule) and `python3 table.py` (the section 5 tables).
6. Layout and contrast: `node audit.mjs d1440,d1280,d1024,t768,p390 amazon,google,meta chart,ranges,drawer,insights light,dark main`.
7. Focused checks: `dots.mjs` (circle counts), `ranges.mjs`, `google.mjs`, `carddrawer.mjs`, `cards.mjs`,
   `states.mjs`, `orphan.mjs`, `tiles.mjs`, `offcanvas.mjs`, `touch.mjs`, `kwclick.mjs`, `feedback.mjs`,
   `insightswait.mjs`, `count.mjs`, `motion.mjs`, `clip.mjs`.
8. The new tests alone:
   `BETA_QA_DIST=<scratch>/cycle-beta6-dist NODE_PATH=<scratch>/pw/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/e2e.js --grep='^Beta UX review 2'`
9. `npm test`; the full e2e: the same command without `--grep`.
10. `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/ux-review-beta-2`; stop the server with
    `kill "$(cat <scratch>/ux-review-beta-2/serve.pid)"`.

## 5. Verification

- **New e2e group** (`test/e2e/beta-ux-review-2.e2e.js`) on the lead's build: **0/16 pass, 16 fail**, each for
  the reason in its name (`[UX-35]`, `[UX-37]`, `[UX-38]`, `[UX-39]`, `[UX-42]`, `[UX-44]` to `[UX-46]`,
  `[UX-47, UX-48]`, `[UX-49, UX-53]`, `[UX-54]` to `[UX-56]`, `[UX-58]`, `[UX-60]`, `[UX-62]`).
- **`npm test`** and the **full e2e**: see "Suite results" at the end of this section.
- Screenshots: `docs/screenshots/ux-review-beta-2/`, named `<screen>-<viewport>-<theme>.png`. The density
  inventory's shots are `density-<board>-<viewport>-<view>.png`.

### Findings

Ordered by severity. "Owner" is the likely file and function. Every finding was confirmed in the page; the
ones marked "sent" went to the lead by message as they were confirmed.

| ID | Sev | Viewport, theme | Screen | Screenshot | What is wrong | Fix | Owner | Test |
|---|---|---|---|---|---|---|---|---|
| UX-37 | High | all; both | drawer headline, roles with a range per place | [Amazon drawer](../screenshots/ux-review-beta-2/amazon-places-drawer-d1440-light.png), [dark](../screenshots/ux-review-beta-2/amazon-places-drawer-d1440-dark.png), [Microsoft](../screenshots/ux-review-beta-2/microsoft-places-drawer-d1440-light.png) | The card and the drawer give one posting two different ranges. Amazon "Senior Financial Analyst, Engineering Capex Analytics & Planning": the card reads **"$60K–129K · 4 places"**, the drawer headline **"$83K–117K"**, which is Bellevue's row only and names no place. Under it: "Pay by place New York $74K–129K · Nashville $60K–105K · Irving, Arlington $67K–117K · Bellevue $83K–117K". The percentile ("Pays more than 25%") and the strip mark also use Bellevue's midpoint. Microsoft: card "$102K–261K · 2 places", drawer "$102K–235K". In the served lists, `salary.min/max` is narrower than the span on 2,201 of Amazon's 2,260 postings with 2+ place ranges and on all 255 such Microsoft postings. | Show the card's span in the headline with "· 4 places" (the "Pay by place" rows are right under it), or name the row: "Bellevue $83K–117K". Say in the pay Details which place the percentile and the strip use. | app.js `drawerContent` (`.d-sal-amt`), `percentile` | `[UX-37]` |
| UX-39 | Medium | 390, 360; both | Amazon's first load (first-page preview) | [preview state](../screenshots/ux-review-beta-2/preview-amazon-p390-light-1.png), [loaded](../screenshots/ux-review-beta-2/preview-amazon-p390-light-done.png) | The preview's 24 real cards are in the collapsed sheet, so a phone never shows them. At 4x CPU on Fast 4G (load 4.5) the first screen shows only the chart skeleton and "Loading 22,179 roles…" from 2.4 s to 7.2 s, and the chart arrives at 8.4 s. The "2.0 s to first cards" record holds only on desktop (cards at 2.7 s there, beside the skeleton chart). | While the preview shows, raise the sheet to a peek that shows the first card, or put three preview cards ("Top-paid roles") in the chart area until the chart is drawn. | app.js preview render and sheet state (`body.dataset.sheet`) | `[UX-39]` |
| UX-38 | Medium | 1440 to 390; both | Amazon filter list, phone chart rows, Ranges legend | [filter list](../screenshots/ux-review-beta-2/preview-amazon-d1440-light-done.png), [phone chart](../screenshots/ux-review-beta-2/preview-amazon-p390-light-done.png) | Amazon's "Project/Program/Product Management--Technical" (1,215) and "--Non-Tech" (1,174) are both in the top 8. Each is cut to the same visible text: **"Project/Program/Produ…"** twice in the filter list, **"Project/Program/Product Managem…"** twice in the phone chart, and the same in the Ranges legend keys. The part that tells them apart is the part cut off. | Cut in the middle so the tail stays ("Project/Program/… Technical"), or give display names ("Technical program and product management", "Non-technical …"), and keep the posted name in the tooltip. | app.js `makeChecklist` labels; chart.js row names and legend; or a display map in the data lane | `[UX-38]` |
| UX-55 | Medium | 1440 (both sites); both | Insights "Middle half" tile | [Apple](../screenshots/ux-review-beta-2/insights-tiles-apple-d1440-light.png), [Anduril, main](../screenshots/ux-review-beta-2/insights-tiles-anduril-d1440-light.png) | The tile cuts its number: **"$188K–$25…"** (Apple), "$141K–$231K" (Google), "$146K–$193K" (Anduril). Each needs 139 px and gets 135 (`white-space: nowrap; text-overflow: ellipsis`). This is UX-15's rule again: a number must never be ellipsized. | Write "$188K–252K", the cards' format; that also ends the "$X–$Y" (Insights, Compstimate) vs "$X–Y" (cards) difference. Or let the value shrink to fit. | features/insights.js stat tiles; features.css `.msi-stat__value` | `[UX-55]` |
| UX-56 | Medium | 1024 (861–1299); both | the closed filter side sheet | [1024](../screenshots/ux-review-beta-2/first-d1024-light.png) | At side-sheet widths the closed filter panel is moved off screen but stays focusable. Tab lands on "Reset" at x −108…−68, "Close filters" and "Show roles" at −351…−24, and focus disappears from view. `setFiltersModal` sets `inert` only on the phone. | Set `inert` (and `aria-hidden`) on `#filters` while it is closed at side-sheet widths, and lift it when it opens. | app.js `setFiltersOpen` / `setFiltersModal` | `[UX-56]` |
| UX-46 | Medium | 390, 360; both | drawer percentile line | [Google intern](../screenshots/ux-review-beta-2/pct-cut-google-intern-p390-light.png), [dark](../screenshots/ux-review-beta-2/pct-cut-google-intern-p390-dark.png) | The line is cut and loses its place name: **"Pays more than 20% of Google's internships in Ca…"** (346 px in 332). Also cut: "…NVIDIA's internships in the US" and "…Microsoft's internships in the US" at 390, and at 360 "Pays more than 40% of Microsoft's roles in the US", "…roles in Czechia" and "Too few roles in Poland show pay to rank this one". fix-density's test opens only the top-paid role, whose line is shorter. | Shorter: "Pays more than 20% of internships in Canada", with the company in Details, or let it wrap to a second line. Never ellipsize the place. | app.js `drawerContent` (`pctText`); styles.css `.d-pct-text` | `[UX-46]` |
| UX-45 | Medium | all; both | Juice grade cut-offs: list, drawer, map legend | [map Juice](../screenshots/ux-review-beta-2/density-amazon-p390-mapjuice.png), [list](../screenshots/ux-review-beta-2/first-d1440-light.png) | One board gives two sets of cut-offs. The explainer above the list and the drawer badge say **"Juicy: $95K or more · Ripe: $47K–95K · Dry: under $47K"**. The map legend says **"$96K or more", "$48K–$96K", "under $48K"**. The methodology says Ripe starts at $47,103 and Juicy at $94,996, so the map is $1K off. | One function for both: the legend should use the app's `juiceScaleText` numbers (or the same `netForScore` and rounding). | map.js `renderJuiceLegend` (`jScale.netForScore`) vs app.js `juiceScaleText` | `[UX-45]` |
| UX-44 | Medium | 390, 360; both | phone stats line when no role in view has pay | [map after a pin](../screenshots/ux-review-beta-2/orphan-details-map-p390-light.png) | The phone line keeps only the median. With 0 paid roles in view (a Google pin of 18 roles with no pay, or a search such as "Software Engineer, PhD, Early Career, 2026") the line is empty except a lone **"Details▾"**. | Phone line: "No pay posted" (or "18 roles · none show pay") when there is no median. | app.js `renderKpis` (phone branch) | `[UX-44]` |
| UX-51 | Medium | all; both | card pay pill, shift pay (Amazon) | [card](../screenshots/ux-review-beta-2/card-amazon-shift-d1440-light.png), [drawer](../screenshots/ux-review-beta-2/density-amazon-p390-drawer-shift.png) | Pay that includes the top shift differential has no label on the card. "Retail Lead Associate (Reduced-Time)" reads **"$19.70/hour"**; the posting says "Pay starts at $18.05 per hour". The pill's tip only says "Part-time, paid by the hour". The caveat ("Incl. top shift pay") is in the drawer only. 636 Amazon postings include shift pay; 77 have a stated base. | Card: "$18.05–19.70/hour" when a base is stated, otherwise "up to $19.70/hour". The tip: "includes the top shift differential". | app.js `payPill` | log |
| UX-40 | Medium | all; both | chart row sub-lines | [Amazon 1440](../screenshots/ux-review-beta-2/preview-amazon-d1440-light-done.png), [Google Company](../screenshots/ux-review-beta-2/google-company-group-d1440-light.png) | One chart mixes two forms, row by row: **"1,215 · $178K US"** next to **"759 roles · median $161K in the US"** (Amazon); "Google 3,546 · $199K US" next to "DeepMind 111 roles · median $229K in the US". The short form appears when the long one would not fit (`useShort`). On a phone every row is short, where the bare count and "US" are never explained. | One form per chart, short enough for every row: "1,215 roles · $178K". "Each row's median is US pay" is already in the notes' Details. | chart.js `renderClusters` (`subShort`, `useShort`) | log |
| UX-41 | Medium | all; both | Ranges stacked rows (viz-even) | [Microsoft](../screenshots/ux-review-beta-2/ranges-microsoft-d1440-light.png), [Amazon phone](../screenshots/ux-review-beta-2/density-amazon-p390-ranges.png) | A stacked row is labelled only **"14 roles"**, and its bar says **"×14"**, so the count is shown twice and no title is shown. The row's titles are only in a hover tooltip. Microsoft's $166K–296K band is still 9 rows (3, 6, 14, 5, 5, 2, 2, 2, 2 roles), split by colour and stripe, so the "same band over and over" look the user complained of remains. | Label with the most common title: "Software Engineer II +13". Keep "×14" by the bar. Consider stacking one band across colours, with the colours as a stacked swatch. | chart.js Ranges row label | log |
| UX-59 | Medium | all; both | Ranges first screen, Amazon | [1440](../screenshots/ux-review-beta-2/ranges-amazon-d1440-light.png), [phone](../screenshots/ux-review-beta-2/density-amazon-p390-ranges.png) | The list leads with the highest pay, and the axis ends at $300K (P1–P99 of midpoints), so every bar on the first screen runs off the right edge with a "›". On the phone, the eight bars are squeezed into the last 50 px. The first thing Ranges shows on Amazon is nothing a reader can compare. | Build the Ranges domain from range ends (P1 of minimums to P99.5 of maximums), not midpoints, or make sure the first screen's rows fit. | chart.js Ranges domain | log |
| UX-47 | Medium | 390, 360 (and 1440 by words); both | drawer "Same role elsewhere" | [phone](../screenshots/ux-review-beta-2/density-amazon-p390-drawer-places.png) | Four secondary lines sit above the bars, 12–31 words and 2–4 lines each: "Finance & accounting roles at Senior level in the US: median and middle half of posted base pay (approx USD)." (19 w); "Only postings that state a level count, so companies whose postings rarely state one may be missing. How pay is read" (21 w); "Posted base pay in approx. US dollars a year. Bar: the middle half of salaries. Tick: the median." (18 w, 4 facts); "Postings as of 16 Oct 2026 · exchange rates as of Jul 2026" (2 lines). The worst is "Too few Entry AI research & ML engineering roles elsewhere list pay in Canada, so this compares…" (31 w, 4 lines). The drawer's Listing has two more: "Open 180+ days. Some companies keep a posting open…" (16 w) and "General application (no specific opening). The company collects…" (22 w, 3 facts). | One line: "Senior finance roles in the US · base pay [Details]". Under Details go the level caveat, the bar/tick key, the dates and "How pay is read". Listing: "Open 180+ days [Details]". | app.js "Same role elsewhere" block, Listing; viz/note.js | `[UX-47, UX-48]` |
| UX-48 | Medium | 390, 360; both | drawer Juice line | [phone](../screenshots/ux-review-beta-2/density-amazon-p390-drawer-places.png) | UX-30's fix made the line too long: **"$36,500/yr left for one person in Irving (using Dallas's rent and living costs, the nearest city with cost data)"**, 19–24 words and 2–3 lines. NVIDIA's version adds "while it lasts" (24 w). "🍉 No Juice: there is no rent and living-cost data yet for Casirate d'Adda." is 2 lines. | "$36,500/yr left in Irving*", with "*Dallas's costs, the nearest city with data" under the Juice block's own details. "No Juice: no cost data for Lubbock yet." | app.js Juice block in `drawerContent` | `[UX-47, UX-48]` |
| UX-49 | Medium | 390, 360; both | Insights Pay estimate card | [Insights](../screenshots/ux-review-beta-2/density-amazon-p390-insights.png) | fix-density cut the caption only. The card still has four long lines: "Weighted by similarity to "Software Development Engineer". Low and High leave out the lowest and highest 15% of their posted pay; 45 ranges in other currencies converted at approximate rates." (30 w, 5 lines on a phone); "Typically within ±10% (tested on 497 listed salaries, Oct 2026)" (2 lines); "Postings as of 16 Oct 2026 · accuracy tested 16 Oct 2026" (2 lines); "Showing the most common role on this board: "Software Development Engineer". Type any title." (14 w, 2–3 lines). | "Based on 500 similar roles at Amazon [Details]" carries the weighting, the 15% trim, the conversions, the accuracy and the dates. The auto line becomes the input's placeholder. | features/compstimate.js | `[UX-49, UX-53]` |
| UX-60 | Medium | 390, 360 (1440: 3–4 lines); both | filter sheet notes | [filters](../screenshots/ux-review-beta-2/density-google-p390-filters.png) | Three notes break the rule. "A role matches if its range overlaps yours. You can type another currency (£80,000, A$350k); all pay is compared in approx US dollars. 1 with unclear pay is left out." is 30 words, 3 lines and 4 facts. The Location note is 18 w; the Seniority note ("Staff+ means …; Director+ means …; "Level not stated": …") is 23 w. Their content is good (round 2 kept them), but they are 2–4 lines each. | One line each, with Details: "Matches roles whose range overlaps yours [Details]", "Also finds roles listed for its country [Details]", "What the levels mean [Details]". | app.js filter panel notes (`fnote`) | `[UX-60]` |
| UX-35 | Medium (was Low) | all; both | Juice explainer above the list | [phone sheet](../screenshots/ux-review-beta-2/density-google-p390-sheet.png), [1440](../screenshots/ux-review-beta-2/first-d1440-light.png) | Still open, and now under the density rule: "🍉 Juice is the money left a year after tax, rent and living costs, for one person. Juicy: $95K or more a year · Ripe: $47K–95K · Dry: under $47K · Rind: nothing left." is 30 words, 3 lines and 5 facts on every board at every width. | "🍉 Juice: money left a year after tax, rent and living costs [Details]", with the scale under Details. | app.js `juiceScaleNote` | `[UX-35]` |
| UX-42 | Low | 1440, 390; both | chart circle counts | [Google zoom](../screenshots/ux-review-beta-2/zoom-google-clusters-d1440-light.png), [NVIDIA](../screenshots/ux-review-beta-2/density-nvidia-d1440-chart.png) | Counts are wider than their circles. Microsoft "118" is 22.2 px of text in a 21.5 px circle; NVIDIA "115" is 23.3 in 22.8; NVIDIA phone "191" is 23.3 in 23.2. In the same row, Google's "172" circle (23 px) is labelled while the larger 205-role neighbour (26 px) is not, so the label doesn't mark the biggest group. Cause: the canvas `textWidth` ignores `font-variant-numeric: tabular-nums`. | Measure with tabular digits (or drop `tabular-nums` on circle labels) and keep 2 px of inset; label the largest circle in a row first. | chart.js circle-count rule (line 1108), viz.css `.ms-bin__dot` | `[UX-42]` |
| UX-53 | Low | 360; both | Insights tile notes | [360](../screenshots/ux-review-beta-2/insights-stat-note-cut-p360-light.png) | "of 2,781 salaried ro…" is cut on Apple, Amazon, Google, Microsoft, NVIDIA and Anduril. The next tile says "of salaried roles", so the two disagree. | "of 2,781 with pay" (shorter, and UX-25's word). | features/insights.js tiles | `[UX-49, UX-53]` |
| UX-54 | Low | 360; both | search box | [360](../screenshots/ux-review-beta-2/insights-stat-note-cut-p360-light.png) | The short placeholder "Search roles" needs 95 px and gets 93, so it reads "Search rol". UX-21 was fixed at 390 and 1024. | "Search" below 380 px, or 2 px less padding. | index.html `#search`, styles.css | `[UX-54]` |
| UX-58 | Low | all; both | drawer "No Juice" box | [phone](../screenshots/ux-review-beta-2/density-amazon-p390-drawer-minimum.png) | The text touches its border (1 px from the left and the top). `.d-juice { padding: 0 }` (styles.css:1014) comes after `.d-juice--none { padding: 10px 14px }` (876) and overrides it. | `.d-juice.d-juice--none { padding: 10px 14px; }`. | styles.css | `[UX-58]` |
| UX-43 | Low | all; both | chart edge chips | [Amazon phone](../screenshots/ux-review-beta-2/preview-amazon-p390-light-done.png) | For one posting past the axis the chip is a bare **"›"** or **"‹"**. Down the right edge of the phone chart it reads as a column of "next" chevrons. | "›1". | chart.js `overflowMarker` (line 1155) | log |
| UX-50 | Low | all; both | Google Group: Company | [Company rows](../screenshots/ux-review-beta-2/google-company-group-d1440-light.png) | Under Company grouping, a card's dot takes the company's colour but sits next to the department name. "● User Experience and Design" is in YouTube orange, and "● No department" in Google blue. | Under Company colouring, put the company name first in the card's meta ("YouTube · User Experience and Design"), or keep the dot on the department colour. | app.js `card`, `computeColorKeys` | log |
| UX-52 | Low | 390 (and 1440); both | cards with "· 2 levels" / "· N places" | [phone](../screenshots/ux-review-beta-2/card-microsoft-places-p390-light.png) | The pill takes 154–179 of 366 px on a phone, so titles wrap to 4–5 lines (Microsoft "Applied Scientist II / Senior Applied Scientist - Responsible AI (CoreAI)": 5 lines). The suffix is in pay green and reads as part of the money. | The range alone in the pill, with "2 places" as a muted line under it. | app.js `card`, `payPill`; styles.css `.sal-pill` | log |
| UX-57 | Low | all; both | "Details" links | [1440](../screenshots/ux-review-beta-2/first-d1440-light.png), [Insights](../screenshots/ux-review-beta-2/density-apple-d1440-insights.png) | The chart view has two Details (stats line and chart notes) holding board-level caveats; Insights shows six. The stats line's Details is a new always-visible control in the viz toolbar: count 3 → 4, against ROADMAP §8's one new main-view control (already used by Save). | Move the stats line's facts into the chart notes' Details, so the main view has one; on Insights one per card is fine. | app.js `renderKpis`, viz/note.js | log |
| UX-61 | Low | all | words | [badge](../screenshots/ux-review-beta-2/state-badge-d1440-light.png), [Insights](../screenshots/ux-review-beta-2/density-apple-d1440-insights.png) | Strings to rewrite: the badge "(**GitHub** often starts it hours late)" → "(sometimes a few hours late)"; "Download **CSV**" → "Download a spreadsheet (CSV)"; "Incl. top shift pay" → "Includes top shift pay"; "**Estimated base salary**" (Compstimate) → "Estimated base pay"; "of 2,781 **salaried** roles", "# = salaried roles", "tested on 497 **listed salaries**" → "with pay", "posted pay ranges"; "(approx **USD**)" / "**US$** (converted)" / "approx US dollars" → one name, "US dollars"; chart rows "no published salary" → "no pay listed" (UX-25); straight apostrophes in the Same role notes ("isn't", "doesn't") among curly ones (UX-31). | As quoted. | app.js `badgeInfo`, comps notes; compstimate.js; insights.js; chart.js row text | log |
| UX-62 | Low | 1440 to 1024; both | search box key cap | [1440](../screenshots/ux-review-beta-2/first-d1440-light.png) | The "/" shortcut key cap is 11 px, the only text under 12 px on the site in this audit. | 12 px. | styles.css `kbd` | `[UX-62]` |

**Still open from round 2** (evidence on this build):
- UX-36: Ranges still reads "Group: **None**" (phone: just "None") beside "Colour: department"
  ([Ranges](../screenshots/ux-review-beta-2/ranges-microsoft-d1440-light.png)).
- UX-32: NVIDIA departments stay inverted ("Engineer, Systems Software", "Architect, Solutions", "Program
  Manager, Technical"), and "Intern" is a department; Amazon's "--Technical" / "--Non-Tech" are raw.
- UX-25 (partly): map pins read "371 jobs", and a pin tip "18 jobs … 18 postings"; chart rows "no published
  salary"; Insights "salaried roles".
- UX-27, UX-28 (left for the user): "16 Oct 2026" in Insights and the drawer's as-of lines vs "Oct 16, 2026" in
  the badge and drawer; one pay block shows "IC3 $102.1K–202.2K" over "Redmond, Garden City, Boston $102K–235K".
- UX-34 (partly): on a phone the empty state is still drawn twice, in the chart and in the sheet's list.
- UX-23 (partly): the phone badge is still a bare "Oct 16".
- Fixed since round 2: UX-22 (Pay by place), UX-24 (folded rows), UX-26 (one error message, "Couldn't load",
  "Filters appear when the roles load"), UX-29 ("€47K/year · 13-week internship"), UX-30 (now too long:
  UX-48), UX-31 (most strings), and UX-15 to UX-21, whose tests all pass (suite results).

### Hover-only information and mouse wording (for fix-touch-tips; sent to the lead)

The lead asked, after the user's sticky-tooltip report in "Same role elsewhere" ("Click to see these
roles"), for every other place where information appears only on hover or the wording assumes a mouse.
Checked at 390x844 with touch, or in the code where it is a `title`:
1. Drawer, visible text on phones: "Keywords  **click to filter**" (app.js:4376)
   ([shot](../screenshots/ux-review-beta-2/touch-drawer-keywords-click-p390-light.png)).
2. Drawer Juice household buttons: what each one means is only in a `title`. "Couple" means "Two adults,
   **one earner** (married, filing jointly), in a 2-bedroom home".
3. Drawer pay-label chips (`payLabels`): each meaning is a `title` on a non-focusable span. "Several pay
   ranges" is explained nowhere else.
4. Chart row labels: the `title` ends "Click to show all N roles" and holds the row's own basis caveat
   (`r.why`), which touch can't reach.
5. Ranges legend item `title`: "… hover a bar for each". The striped bar's per-level breakdown is a hover tip.
6. Save-search `title`: "Saved in this browser — click to remove."
7. Map pin tooltip on a phone: after a tap it sits at x 326–606 of 390 (216 px off screen), under the raised
   sheet ([shot](../screenshots/ux-review-beta-2/touch-google-pin-p390-light.png)).
8. Google's Group select `title` (MR-29, known).
Not affected: chart circles and edge chips filter the list on a tap and show no tip.

### By review question

1. **First impression.** The landing opens on Google. Its first screen is calm and reads at once: the
   coloured circle rows, the green pay pills, a one-line stats line ("3,821 roles · 66% show pay · $183K base
   pay median Details") and the one-line beta tagline. The eye goes first to the circles and the pills, which
   is right. Two things slow a newcomer: the Juice explainer, 3 lines above the list (UX-35), and on a phone
   the 2–8 s skeleton before anything real on Amazon (UX-39). Ready in 1.2–2.3 s on every viewport at
   load 1.5–6 ([1440](../screenshots/ux-review-beta-2/first-d1440-light.png),
   [phone](../screenshots/ux-review-beta-2/first-p390-light.png),
   [dark](../screenshots/ux-review-beta-2/first-d1440-dark.png)).
2. **Hierarchy and layout.** The layout holds at Amazon's 22,179 roles: no horizontal scroll at any viewport
   or theme, and the folded "30 more departments" row keeps the chart at 8 rows. It strains in three places:
   long department names that differ only at the end (UX-38), wide "· N places" pills (UX-52), and the Ranges
   first screen (UX-59). Empty filter results and errors are now one calm message.
3. **Consistency.** UX-37 (card vs drawer), UX-40 (two row forms), UX-45 (two Juice scales), UX-55/UX-61
   ("$X–$Y" vs "$X–Y"; salary/pay; USD/US$/US dollars), UX-50. Chips, popovers and the new Details buttons
   behave alike everywhere, with the same 2 px green focus ring
   ([Details](../screenshots/ux-review-beta-2/focus--statsLine-ms-note-more-d1440-light.png)). Against the
   main site (Anduril) the beta has the same layout, controls and copy. The intended differences are the
   Beta tag where the main site has Refresh, the beta tagline, and the Company group-by on Google only.
   UX-55 is on both sites.
4. **Words.** UX-61 lists the strings, with UX-40's "US" and UX-41's "14 roles". The new copy is good: "2,512
   with pay · 1,309 without", "Posted minimum base pay", "Posted pay, including shift pay", "≈ $53K in US
   dollars at Jul 2026 rates", "Not from the posting: an estimate", and Google's "Grouped by job title:
   Google doesn't publish departments".
5. **States.** Loading (skeletons, "Loading roles…", badge "Loading") and error ("Couldn't load this board
   · The saved list of Apple roles didn't load. Check your connection and try again. Retry", badge
   "Couldn't load", filters "Filters appear when the roles load.") are clear and agree
   ([error](../screenshots/ux-review-beta-2/state-error-d1440-light.png)). The empty search is one card on
   desktop ([empty](../screenshots/ux-review-beta-2/state-empty-p390-light.png)). The pay filter's hidden
   count is in the filter note ("155 roles that list no pay are hidden while a pay filter is on"). Estimates
   are labelled "Not from the posting: an estimate". The badge popover is complete and plain, apart from
   UX-61 ([badge](../screenshots/ux-review-beta-2/state-badge-d1440-light.png)). UX-44 is the one state
   that looks broken.
6. **Text density (hard check).** All 8 boards at 390x844, 360x740 and 1440x900, in every view (table below;
   each board's full text is in `density-<board>-<vp>.json` in the scratch folder). fix-density's lines
   all pass on every board, including Amazon's whole board: stats line, chart notes in Clusters and Ranges,
   tagline, map notes, Insights header and captions, Pay estimate caption, drawer pay caption, strip caption,
   converted pay, and the empty state. Lines over the rule: the Juice explainer (UX-35), the Pay estimate
   card's four lines (UX-49), the filter notes (UX-60), "Same role elsewhere" and the Listing (UX-47), the
   Juice line (UX-48), the percentile line where cut (UX-46), and the 360 tile notes (UX-53). None pushes the
   main content off the first screen (the Juice explainer comes closest: 90 px of a phone sheet), so all are
   Medium or lower.
7. **Simplicity budget.** Visible controls on first load (Google and Amazon on beta, Anduril on the main
   site):
   - top bar: 10 / 10 at 1440; 9 / 9 at 1280, 1024 and 768 (main 8 at 768); 9 / 8 at 390;
   - quickbar: 7 (4 visible in the phone scroll row);
   - viz toolbar: **4**, up from 3 in round 2 (the stats line's Details, UX-57);
   - results header: 1.

   Within §8 otherwise. Google's Company group-by and filter add no control: they are an option in the Group
   select and a list inside the Department menu, shown only on boards with more than one brand. viz-even's
   stacked rows and the preview add none.
8. **Responsive and themes.** Amazon, Google and Meta in chart, Ranges, drawer and Insights, at 5 viewports in
   both themes: no horizontal scroll; 0 contrast failures, except the decorative logo dot (3.61:1, light);
   circle counts all clear 4.5:1 (A11Y-1 holds, measured with the `color(srgb …)` fix); text under 12 px only
   the "/" key cap (UX-62). Phone tap targets: the logo's and the Beta tag's boxes are 26x26 and 43x21, but their hit areas pass
   round 2's `[UX-19]` (44 px); the sheet handle
   is 28 px tall but shares an 84 px drag zone with the header row, by design. Clipping: UX-38, UX-46, UX-53,
   UX-54, UX-55; long Ranges row titles are ellipsized with a tooltip, which is acceptable.
9. **Motion and feedback.** Reduced motion is honoured (every transition and animation drops to 0.00001 s).
   Focus rings show on the new Details buttons, the stacked Ranges rows and the Group select. Feedback on
   Amazon's 22,179 roles at 1440, no throttling, load 9–10 (4 CPUs shared):
   - department checkbox: first change at 260–322 ms, chart at 298–462 ms (the box ticks at once);
   - sort: 249 ms; search "data": 480 ms;
   - Ranges: 711 ms; back to Clusters: 370 ms;
   - a card's drawer: 163 ms; Map: 984 ms;
   - Insights: the page answers again only after 1.4 s, which is the known Amazon Insights long task (4.3 s on a
     phone). No step leaves the screen unchanged beyond that, but nothing shows progress during those 1.4 s.
10. **Honesty.** Strong where round 2 asked:
    - "from €46K" with "Posted minimum base pay";
    - "$184K–356K · 2 levels" and "PLN 345K–702K · 2 levels" with "Pay by level" rows;
    - "$60K–129K · 4 places" with "Pay by place";
    - "€47K/year · 13-week internship";
    - "≈ $53K in US dollars at Jul 2026 rates";
    - "Posted pay, including shift pay" in the drawer.

    Two gaps: the drawer headline that is one place's range (UX-37, High), and shift pay on the card (UX-51).
    MR-28's pooled medians show here too: the minimum "from €46K" is ranked "Pays more than 55% of Amazon's
    roles in Italy".
11. **Beta only.**
    - The beta notice is readable now: the tagline "Beta: adds 7 big-tech companies' own careers sites", and
      the badge popover's last line, "You're on the beta site … Go to the main site".
    - The Beta tag links to the main site, and the tab title says "melon·seek beta".
    - Big-tech postings look polished on Apple, Google (job families), Meta and Microsoft.
    - Amazon (UX-38, "--" names, "FC Operations") and NVIDIA (inverted names, UX-32) still look raw.
    - Non-US currencies are labelled well (CZK, PLN, CA$, €, CHF).

### Density inventory (8 boards; words / lines, the maximum over the boards)

| Line | 390x844 words / lines | 360x740 | 1440x900 | Phone rule | Worst text at 390 (board) |
|---|---|---|---|---|---|
| Stats line | 4 / 1 | 4 / 1 | 7 / 1 | ok | google: "$183K base pay median" |
| Tagline | 7 / 1 | 7 / 1 | 13 / 1 | ok | "melon·seek · Beta: adds 7 big-tech careers sites" (1440: Anduril's 13-word main-site line) |
| Results header | 2 / 1 | 2 / 1 | 2 / 1 | ok | "3,821 roles" |
| Badge label | 3 / 1 | 3 / 1 | 3 / 1 | ok | "Snapshot · Oct 16" (phone: "Oct 16") |
| Chart notes (Clusters) | 5 / 1 | 5 / 1 | 5 / 1 | ok | "2,512 with pay · 1,309 without" |
| Chart row sub-line | 3 / 1 | 3 / 1 | 7 / 1 | ok (UX-40) | "129 · $235K US" |
| Chart notes (Ranges) | 5 / 1 | 5 / 1 | 5 / 1 | ok | "2,512 with pay · 1,309 without" |
| Juice explainer above the list | 30 / 3 | 30 / 3 | 30 / 3 | **over** (UX-35) | "🍉 Juice is the money left a year after tax, rent and living costs, for one person. Juicy: $95K or more a year · Ripe: $47K–95K · Dry: under $47K · Rind: nothing left." |
| Map Pay legend note | 2 / 1 | 2 / 1 | 5 / 1 | ok | "Median pay" |
| Map Juice legend note | 4 / 1 | 4 / 1 | 4 / 1 | ok | "Gray: no Juice data" |
| Insights header | 6 / 1 | 6 / 1 | 6 / 1 | ok | "All 3,821 roles on this board" |
| Insights card captions | 7 / 1 | 7 / 1 | 7 / 1 | ok | "Average pay by skill, vs. all roles" |
| Insights tile notes | 4 / 1 | 4 / 1, **cut** | 4 / 1 | over at 360 (UX-53) | "of 2,781 salaried ro…" |
| Insights tile values | 1 / 1 | 1 / 1 | 1 / 1, **cut** | over at 1440 (UX-55) | "$188K–$25…" |
| Pay estimate caption | 5 / 1 | 5 / 1 | 5 / 1 | ok | "Estimated pay from similar roles" |
| Pay estimate auto line | 14 / 2 | 14 / 3 | 14 / 1 | **over** (UX-49) | amazon: "Showing the most common role on this board: "Software Development Engineer". Type any title." |
| Pay estimate accuracy | 10 / 2 | 10 / 2 | 10 / 1 | **over** (UX-49) | "Typically within ±12% (tested on 496 listed salaries, Oct 2026)" |
| Pay estimate explain | 30 / 5 | 30 / 5 | 30 / 2 | **over** (UX-49) | amazon: "Weighted by similarity to … Low and High leave out the lowest and highest 15% of their posted pay; 45 ranges in other currencies converted at approximate rates." |
| Pay estimate as-of | 11 / 2 | 11 / 2 | 11 / 1 | **over** (UX-49) | "Postings as of 16 Oct 2026 · accuracy tested 16 Oct 2026" |
| Filter notes | 30 / 3 | 30 / 4 | 30 / 4 | **over** (UX-60) | "A role matches if its range overlaps yours. You can type another currency (£80,000, A$350k); all pay is compared in approx US dollars. 1 with unclear pay is left out." |
| Drawer pay caption | 5 / 1 | 5 / 1 | 5 / 1 | ok | amazon: "Posted pay, including shift pay" |
| Drawer percentile line | 12 / 1 | 12 / 1, **cut** | 12 / 1 | cut on phones (UX-46) | "Pays more than 20% of Google's internships in Ca…" |
| Drawer strip caption | 7 / 1 | 7 / 1 | 7 / 1 | ok | "This one among 2,043 roles at Google" |
| Drawer converted pay | 8 / 1 | 8 / 1 | 8 / 1 | ok | "≈ $70K–73K in US dollars at Jul 2026 rates" |
| Drawer Same role elsewhere: comparison | 31 / 4 | 31 / 4 | 31 / 3 | **over** (UX-47) | meta: "Too few Entry AI research & ML engineering roles elsewhere list pay in Canada, so this compares AI research & ML engineering roles there at every full-time level (posted base pay, approx USD)." |
| Drawer Same role elsewhere: caveat | 21 / 2 | 21 / 3 | 21 / 2 | **over** (UX-47) | "Only postings that state a level count, so companies whose postings rarely state one may be missing. How pay is read" |
| Drawer Same role elsewhere: key | 18 / 2 | 18 / 2 | 18 / 2 | **over** (UX-47) | "Posted base pay in approx. US dollars a year. Bar: the middle half of salaries. Tick: the median." |
| Drawer Same role elsewhere: as of | 12 / 2 | 12 / 2 | 12 / 1 | **over** (UX-47) | "Postings as of 16 Oct 2026 · exchange rates as of Jul 2026" |
| Drawer Juice line | 24 / 3 | 24 / 3 | 24 / 2 | **over** (UX-48) | nvidia: "$1,230/mo left for one person in Santa Clara (using San Jose's rent and living costs, the nearest city with cost data) while it lasts" |
| Drawer no-pay estimate note | 6 / 1 | 6 / 1 | 6 / 1 | ok | "Not from the posting: an estimate" |
| Empty state body | 7 / 1 | 7 / 1 | 7 / 1 | ok | "Check the spelling, or try another word." |

fix-density's two headline lines, per board (words / lines: text):

| Board | Stats line, 390 | Chart notes, 390 | Stats line, 1440 | Chart notes, 1440 |
|---|---|---|---|---|
| amazon | 4 / 1: "$141K base pay median" | 5 / 1: "13,980 with pay · 8,199 without" | 7 / 1: "22,179 roles · 63% show pay · $141K base pay median" | 5 / 1: "13,980 with pay · 8,199 without" |
| apple | 4 / 1: "$214K base pay median" | 5 / 1: "2,781 with pay · 2,070 without" | 7 / 1: "4,851 roles · 57% show pay · $214K base pay median" | 5 / 1: "2,781 with pay · 2,070 without" |
| google | 4 / 1: "$183K base pay median" | 5 / 1: "2,512 with pay · 1,309 without" | 7 / 1: "3,821 roles · 66% show pay · $183K base pay median" | 5 / 1: "2,512 with pay · 1,309 without" |
| meta | 4 / 1: "$193K base pay median" | 5 / 1: "948 with pay · 260 without" | 7 / 1: "1,208 roles · 78% show pay · $193K base pay median" | 5 / 1: "948 with pay · 260 without" |
| microsoft | 4 / 1: "$168K base pay median" | 5 / 1: "1,566 with pay · 869 without" | 7 / 1: "2,435 roles · 64% show pay · $168K base pay median" | 5 / 1: "1,566 with pay · 869 without" |
| nvidia | 4 / 1: "$239K base pay median" | 5 / 1: "1,462 with pay · 1,249 without" | 7 / 1: "2,711 roles · 54% show pay · $239K base pay median" | 5 / 1: "1,462 with pay · 1,249 without" |
| netflix | 4 / 1: "$427K base pay median" | 5 / 1: "259 with pay · 155 without" | 7 / 1: "414 roles · 63% show pay · $427K base pay median" | 5 / 1: "259 with pay · 155 without" |
| anduril | 4 / 1: "$170K base pay median" | 5 / 1: "2,388 with pay · 149 without" | 7 / 1: "2,537 roles · 94% show pay · $170K base pay median" | 5 / 1: "2,388 with pay · 149 without" |

### What works well (keep)

1. **One line, one "Details", everywhere.** fix-density's pattern holds on every board and width, Amazon
   included. "2,512 with pay · 1,309 without Details" carries the two facts a seeker needs. Every caveat is
   one keyboard-reachable click away (Enter and Space, `aria-expanded`), the open state survives re-renders,
   and the button has the same focus ring as every other control. Extend it to the lines above (UX-35,
   UX-47 to UX-49, UX-60) rather than inventing another pattern.
2. **Honest pay labels where the number is.** "from €46K", "$184K–356K · 2 levels" and "$60K–129K · 4 places"
   show it on the card, and "Pay by level" / "Pay by place" rows read like a small table in the drawer. Also
   "€47K/year · 13-week internship", "≈ $53K in US dollars at Jul 2026 rates" and "Not from the posting: an
   estimate". UX-37 and UX-51 are the two places this standard isn't met yet.
3. **Google looks like the other boards without a new control.** Job families give Google Software
   Engineering, Sales and Technical Solutions rows like Amazon's and Microsoft's. The Company group-by and
   the Company list inside the Department menu keep YouTube, DeepMind, Waymo and Wing one click away. The
   label says how the families are made ("Grouped by job title: Google doesn't publish departments").

### Suite results

- **`npm test`** (data links in place, `node_modules` linked; 22:17–22:23 UTC, load 15 → 11): **1,168 tests,
  1,115 pass, 1 fail, 52 to-dos.** The one failure is `S-6: /methodology/ is not re-rendered on every request
  in server mode` (median 71 ms against its budget), the server-timing check the lead's log already records as
  load-sensitive. Re-run alone at load 9.7: passes (1/1).
- **Full e2e** (`BETA_QA_DIST=<scratch>/cycle-beta6-dist`, 22:24–23:05 UTC, load 10 → 23 → 18):
  **329/384 passed, 15 failed, 40 skipped.**
  - The 15 failures are exactly this review's tests (all but `[UX-62]`, added during the run; alone it fails
    as intended: `kbd "/" 11px`). No other test failed.
  - 37 of the skips were tests that read `dist/` in the worktree only. Re-run with `dist` linked to the lead's
    build (`run-skipped.sh`, 23:05–23:10): **36/37 passed, 0 failed, 1 skipped** (no NVIDIA role in Munich).
  - Together: **365 pass, 15 fail (this review's), 4 skip**. The skips: D-11 (this data has listing dates),
    the opt-in methodology screenshots, P-2 (no low-confidence estimate) and the NVIDIA Munich BP-2 case.
  - Round 2's `[UX-15]` to `[UX-21]` and its no-horizontal-scroll guard all pass now. `[UX-19]` reads the
    Beta tag's and the logo's hit areas, so it passes although their boxes are 43x21 and 26x26. fix-density
    (51), google-grouping and viz-even pass on this build.

## 6. Known gaps and follow-ups

- The map ran without its basemap (other hosts are blocked here), so pin labels on real tiles are unchecked.
- WebKit and a real iPhone were not available; phone results are Chromium emulation. The touch checks
  (hover-only list) use Playwright taps, which fire no `pointermove`. A real iPhone may still show sticky
  tips where Chromium shows none (the user's report). That is fix-touch-tips' job to verify.
- Timings are under load 7–15 on 4 shared CPUs; treat them as upper bounds.
- The density inventory reads one sample drawer per kind per board (12 kinds). Other postings may produce
  longer lines (a longer place name in the percentile line, say). The tests pick their postings from the data
  for that reason.
- UX-41 and UX-59 are drawing questions; the viz review may want to weigh in.

## 7. Change log

- 2026-10-16 21:30 UTC: worktree at d98a9f0; data links; the prompt; the server on port 5482.
- 21:33: first impression (5 viewports x 2 themes); circle-label check; Amazon preview at 4x CPU.
- 21:40–22:05: density inventory (8 boards x 3 viewports, background); touch and hover-only list (sent);
  Google grouping; Ranges; drawer and card checks; UX-37 (sent), UX-38 to UX-50 (sent).
- 22:00–22:15: layout and contrast audit; states; the e2e group (11, then 16 red tests); UX-51 to UX-56 (sent).
- 22:15: feedback timing, control count, reduced motion and focus; UX-58, UX-60; scripts committed.
- 22:17–23:10: `npm test` (1,168, 1 load-sensitive failure, passes alone); full e2e (329/384, the 15 failures
  this review's) and the 37 `dist/`-only tests (36/37); UX-62's test; screenshots pruned to the 38 the log
  links plus the first-impression, preview, state, touch and phone density sets, and shrunk.
- Commits (detached at d98a9f0): 8dc2d36 prompt; 459a4c2, eff99d9, e2b76c5, 67e0c64 and the last one log and
  screenshots; 25e79af, 7429f21, dcf1e33, 5ddcbed and the last one the e2e group; e9bc4ed scripts. eff99d9 and
  7429f21 carried about 190 screenshots that 67e0c64 removed: squash on integration to keep them out of
  history.
