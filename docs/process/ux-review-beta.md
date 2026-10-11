# Process log: UX and frontend design review, beta site

## 1. Brief

Prompt: [prompts/ux-review-beta.md](prompts/ux-review-beta.md) (verbatim).

Goal: the first design review of `/melon-seek/beta/`, judged as a senior product designer: is it clear,
consistent, calm and honest, and does it hold up with the big-tech boards' real data? No product code
was changed.

Files owned:
- `docs/process/ux-review-beta.md` (this log and the findings);
- `docs/process/prompts/ux-review-beta.md`;
- `docs/screenshots/ux-review-beta/` (63 screenshots, shrunk with `scripts/cycle/shrink-screenshots.sh`);
- `test/e2e/beta-ux-review.e2e.js` (new), registered in `scripts/e2e.js` (2 lines: the import and
  `registerBetaUxReviewTests(suite)`, after the beta desktop QA 2 group).

Findings are **UX-15 to UX-36**, numbered after UX-14, the highest UX ID in `docs/process/`.

## 2. Inputs and sources

- README.md, docs/strategy/ROADMAP.md §8 (the UI simplicity budget), docs/CONTRACT.md,
  docs/METHODOLOGY_GUIDE.md, docs/process/ux.md (the original design decisions), PLAYBOOK.md, TEMPLATE.md.
- docs/process/lead.md: beta stage 1, beta fix batches 1 and 2, beta perf (1b), the beta persona review
  (1c), fix wave 3, Amazon and Meta, the security and accessibility review, the second mobile and desktop
  QA passes. These give the known open items, so this review does not re-file them as new bugs:
  DQ-27/DQ-28/VT-4 (Apple pay at places with no posted pay), D-31 to D-37, BP-15/D-32 (store names as
  places), BP-16/D-33 (two ages in one drawer), D-35 (no link from the main site to /beta/), A-1 to A-7.
  Where a known data issue has a design side, the finding below names the design fix and points to the
  data ID.
- docs/QA.md "Full QA pass (desktop, beta) 2026-10-10" and "Full QA pass (mobile, beta) 2026-10-10".
- Code read to find owners: `public/index.html`, `public/app.js` (`renderKpis`, `renderTagline`,
  `card`, `payPill`, `payLabels`, `drawerContent`, `badgeInfo`, `makeBadgeDetails`, `renderResults`,
  `juiceScaleNote`, `markChannel`), `public/styles.css`, `public/viz/chart.js` (`renderClusters`,
  `overflowMarker`), `public/viz/palette.js`, `public/viz/viz.css`, `public/features/features.css`,
  `public/features/freshness.js` (`formatAsOf`).
- The build under review: the lead's `cycle-beta5/dist` (head 8259b1b, today's crawl: Apple 4,875,
  Google 3,417, NVIDIA 2,663, Microsoft 2,279, Netflix 457, Anduril 2,491). Amazon and Meta are not in it.

## 3. Decisions and rationale

1. **What gets a test.** Only objective, measurable problems: clipped or overlapping text, controls off
   the screen, contrast under 4.5:1, text under 12 px, tap targets under 44 px on the phone. Each is
   measured in the page (bounding boxes, `scrollWidth > clientWidth`, WCAG relative luminance with
   alpha-blended backgrounds, canvas `measureText` for the placeholder), not judged from a screenshot.
   Everything else (words, hierarchy, honesty, consistency) is in the findings table with a fix.
2. **Contrast method.** The ratio uses the element's computed colour, alpha-blended onto the stack of
   its ancestors' backgrounds down to the first opaque one (the body's otherwise). Threshold 4.5:1, or
   3:1 for text 24 px and up or 18.66 px bold. Inline SVG text and map tiles are left out (the map
   runs without its basemap here).
3. **Severity.** High: the design misleads (a number that does not apply where it is shown) or blocks.
   Medium: confuses, or looks broken (clipped numbers). Low: polish.
4. **Known data issues are not re-filed.** UX-22 is the design side of DQ-28/VT-4: whatever the data
   lane decides, the card and drawer must not present one span next to a place it does not cover.
5. **The phone viewport.** 390x844 with `isMobile`, `hasTouch` and DPR 2, the same as the QA passes. The
   short-visible-height lesson of M-28 was covered by the mobile QA; this review did not repeat it.
6. **Tests point at the same build as the QA tests.** `BETA_QA_DIST=<dir>` or `dist/`, served under
   `/melon-seek/`, other hosts aborted, and each test skips when the build or the board is missing.

## 4. Replayable steps

Scripts are in the scratchpad folder `ux-review-beta/` (`lib.mjs` helper; `first.mjs`, `tour.mjs`,
`drawers.mjs`, `phone.mjs`, `boards.mjs`, `cards.mjs`, `states.mjs`, `main.mjs`, `long.mjs`,
`feedback.mjs`, `focus.mjs`, `count.mjs`, `chips.mjs`, `audit.mjs` + `audit-fn.js`, `audit2.mjs`). They
import Playwright through a `node_modules` symlink to the shared `pw/node_modules`.

1. Serve the lead's build (pid file, port printed):
   `node scripts/cycle/serve.mjs --dist <scratch>/cycle-beta5/dist --pid <scratch>/ux-review-beta/serve.pid`
   → `serve: http://127.0.0.1:37277/melon-seek/`.
2. First impression, every viewport and theme: `node first.mjs` (beta landing opens on Google; ready in
   1.5–1.8 s at load 0.1–1.2).
3. Screen tour at 1440 light: `node tour.mjs d1440 light` (company menu, badge, each quick chip, Ranges,
   Map, Insights, an empty search).
4. Drawers for representative postings (`pick.mjs` found them): `node drawers.mjs d1440 light` (Apple
   multi-zone pay, NVIDIA two-level and PLN pay, Microsoft CZK, Google EUR internship, Netflix Pay
   unclear, Netflix CAD, Apple Japan store without pay, NVIDIA 132-character title, Microsoft monthly
   and Netflix hourly internships).
5. Phone tour with a measurement at each step: `node phone.mjs light` and `dark`.
6. Layout and contrast audit: `node audit.mjs` (5 viewports × 2 themes × Google, Apple, NVIDIA) and
   `node audit2.mjs` (drawer, More popover and Insights).
7. Edge chips: `node chips.mjs` and `chip2.mjs`; card text: `node cards.mjs`; states: `node states.mjs`
   (a routed `abort` for the error, a 6 s delay for loading); controls: `node count.mjs`; feedback:
   `node feedback.mjs`; focus: `node focus.mjs`; main site: `node main.mjs`, `mainapple.mjs`.
8. The new tests, alone:
   `BETA_QA_DIST=<scratch>/cycle-beta5/dist NODE_PATH=<scratch>/pw/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/e2e.js --grep='^Beta UX review'`
9. `npm test`.
10. `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/ux-review-beta`; then stop the server with
    `kill "$(cat <scratch>/ux-review-beta/serve.pid)"`.

## 5. Verification

- **New e2e group** (`test/e2e/beta-ux-review.e2e.js`), on the lead's build: **1/8 pass, 7 fail.** The
  7 failures are exactly the tests tagged `[UX-15]` to `[UX-21]`; the 1 pass is the guard (no
  horizontal page scroll on 5 viewports × 2 themes × Apple and NVIDIA). About 4 minutes at load 1–3.
- **`npm test`:** 1,015 tests, 937 pass, **0 fail**, 0 skipped, 78 to-dos (188 s, load about 3).
- **Full e2e suite: not run**, as the lead's note says (three reviewers at once; the lead runs it after
  this report). The prompt's body asks for it; the lead's note for this run takes precedence.
- Screenshots: `docs/screenshots/ux-review-beta/`, named `<screen>-<viewport>-<theme>.png`.

### Findings

Ordered by severity. "Owner" is the likely file and function.

| ID | Sev | Viewport, theme | Screen | Screenshot | What is wrong | Fix | Owner | Test |
|---|---|---|---|---|---|---|---|---|
| UX-22 | High | all | card and drawer, Apple "ESD Engineer" (395 merged Apple postings, DQ-28) | [card](../screenshots/ux-review-beta/card-zones-d1440-light.png), [drawer](../screenshots/ux-review-beta/drawer-multiloc-d1440-light.png) | The posting gives three ranges by place ("$165,800–292,400 (Waltham); $175,000–308,500 (Los Angeles, San Diego); $184,700–324,800 (San Francisco Bay Area)"). The card shows one span, **$166K–325K**, next to **"Austin, TX +5"**, a place with no posted pay, and a Juice of **83 · Juicy "in Austin"**. The drawer's only caveat is a "Multiple pay zones" chip whose meaning is in a `title` tooltip. A Waltham reader sees a top of $325K that applies only to the Bay Area. | Do for places what D-21 did for levels: a "Pay by place" line under the headline, `Waltham $166K–292K · Los Angeles, San Diego $175K–309K · SF Bay Area $185K–325K`, and replace the chip with it. On the card, lead with a place that has pay, or show `$166K–325K · 3 pay zones`. Never score Juice at a place without posted pay (DQ-27). | app.js `payPill`, `payLabels`, `drawerContent`; data lane for the zone list | log |
| UX-15 | Medium | 1440, 1280, 1024; both | chart toolbar stats line, NVIDIA, Apple, Google | [NVIDIA 1280](../screenshots/ux-review-beta/board-nvidia-d1280-light.png), [Google 1440](../screenshots/ux-review-beta/first-d1440-light.png) | `.stats-line { overflow: hidden; flex-wrap: nowrap }` cuts stats mid-number: NVIDIA 1280 reads **"half between $200K and $270"** (the K is gone, so the number is wrong); Apple 1280 cuts "$255K"; Google reads **"mostly Goo…"** at 1440 and **"m…"** at 1024. | Let the line wrap on desktop (`flex-wrap: wrap` at all widths, as ≤860 px already does), or drop whole stats from the end (`mostly …` first, then `half between`) instead of clipping. Never ellipsize a number. | styles.css `.stats-line` (lines 761, 802), app.js `renderKpis` | `[UX-15]` |
| UX-16 | Medium | 1440 to 390; both | result cards, NVIDIA and Microsoft | [NVIDIA 1280](../screenshots/ux-review-beta/board-nvidia-d1280-light.png), [phone](../screenshots/ux-review-beta/long-titles-p390-light.png) | The card meta row gives the department and the location equal claim, so long big-tech department names push the location into an ellipsis: **"Santa Clara, …"**, "Mountain View, C…", even on the phone. 39 truncated locations in the first 12 cards of two boards across 4 viewports. Location is what a seeker scans for; the department is in the chart and the drawer. | `.card-loc { flex: none }` and `.card-dept { flex: 1 1 0; min-width: 4ch }` so the department gives way first; or put the location first in the row. | styles.css `.card-dept`, `.card-loc` (484–485); app.js `card` | `[UX-16]` |
| UX-24 | Medium | all; both | chart, NVIDIA (146 departments), Microsoft (140), Google | [NVIDIA](../screenshots/ux-review-beta/board-nvidia-d1280-light.png), [Google](../screenshots/ux-review-beta/first-d1440-light.png) | Rows sort by median, so NVIDIA's first screen is ten grey "Other" rows of 1 to 15 roles ("Management, Legal · 1 role"), and the 8 coloured departments that hold most postings (Engineer, Systems Software 588) start below the fold. On Google 4 of 7 rows are 1-role "No published salaries" rows taking 40% of the chart. | When there are more groups than colour slots (8), show the 8 largest by count, then one folded row "138 more departments · 612 roles" that expands; fold rows with no pay into one line "4 departments with no published pay". Longer term, group big-tech boards by role family (the persona review asked for it). | chart.js `renderClusters` (the `cRows.sort` at line 643) | log |
| UX-23 | Medium | all; both | top bar, beta notice and badge | [1440](../screenshots/ux-review-beta/first-d1440-light.png), [phone](../screenshots/ux-review-beta/first-p390-light.png) | There is no beta notice a person can read: the only one is the 12 px "Beta" tag, whose meaning ("adds big-tech companies' own careers sites. Go to the main site") is a hover `title`, invisible on touch, and the tag doesn't look like a link. On the phone the data badge shrinks to **"Oct 11"**, a bare date with no noun. | Make the tag say where it goes: `Beta ↗` with the title as visible text in the badge popover; add one line to the tagline on beta: "Beta: adds Apple, Google, Microsoft, NVIDIA and Netflix from their own careers sites · Main site". On the phone keep a noun: "Saved Oct 11". | index.html `.beta-tag`, app.js `markChannel`, `renderTagline`, `badgeInfo`; styles.css `.beta-tag` | log |
| UX-25 | Medium | all | site-wide copy | [1440](../screenshots/ux-review-beta/first-d1440-light.png), [map](../screenshots/ux-review-beta/map-d1440-light.png), [error](../screenshots/ux-review-beta/state-error-d1440-light.png) | One thing, many names. Count of items: "roles" (results, stats), "postings" (chart footer), "jobs" (map pins "460 jobs", "Only show jobs with salary"). Missing pay: card "No salary", drawer "Salary not listed", chart "No published salaries" and "no published salary", footer "no salary posted", stats "show pay". The score: "Juice" and "Juice Score" ("2729 of 4875 roles have a Juice Score"). The estimate: "Compstimate" in docs, "Pay estimate" in Insights. | Pick: **role** for the item, **pay** for money (salary only inside "Salary" filter labels), **Juice** for the score. Rewrites: "Only show roles with pay", map "460 roles", card "No pay listed", drawer "No pay listed: this posting has no pay range", chart row "1 role · no pay listed", footer "2,217 with pay · 1,200 without". | app.js (strings above), chart.js footer, map.js pin label | log |
| UX-26 | Medium | 1440, 390; light | error state (a board list that fails to load) | [error](../screenshots/ux-review-beta/state-error-d1440-light.png) | Three messages disagree: the chart says "Couldn't load this board · The saved list of Apple roles didn't load. Check your connection", the list says **"Board unavailable · We couldn't reach the API."** (jargon, and there is no API on Pages), the title says "No data" and the badge says **"Offline"** (the person may well be online). The filter column keeps its loading skeleton forever. | One message, in the chart; the list shows only "No roles to show" and one Retry. Badge "Couldn't load" instead of "Offline". Replace the filter skeleton by nothing (or a muted "Filters appear when the roles load"). | app.js `renderResults` (line 2877), `badgeInfo` (1275), the filter render for `data.status === 'error'` | log |
| UX-27 | Medium | all | drawer, badge popover, Insights | [badge](../screenshots/ux-review-beta/badge-d1440-light.png), [drawer](../screenshots/ux-review-beta/drawer-pln-d1440-light.png) | Four date formats: "Oct 11" (badge), "11 Oct 2026" ("Postings as of 11 Oct 2026"), "May 12, 2026" (drawer "Updated"), "10/11/2026, 7:59:15 AM" (badge "Fetched"; the numeric one reads as 10 November in most of the world). | One format everywhere: "Oct 11, 2026" (short) and "Oct 11, 2026, 07:59 UTC" for a time. | freshness.js `formatAsOf`; app.js `makeBadgeDetails` (`toLocaleString()`) | log |
| UX-29 | Medium | all | card pay pill, internships | [card](../screenshots/ux-review-beta/card-eur-intern-d1440-light.png) | A 13-week internship's yearly rate shows on the card as a bare **"€47K"** (no "a year", no term), next to **"0 · Rind"**; the term is only in the pill's tooltip. An hourly one shows "$40–110/hour", so units are given for hours and not for years. | Pill "€47K/yr" and, for fixed-term roles, a muted second line or tag "13-week internship" in the keyword slot. | app.js `payPill`, `card` | log |
| UX-17 | Low | 390 (and 1440/1024 desktop collision); both | chart edge chips | [phone](../screenshots/ux-review-beta/first-p390-light.png), [1440](../screenshots/ux-review-beta/first-d1440-light.png) | The "‹12" and "›19" chips (postings past the axis) sit half off the phone screen ([-4, 20] and [370, 394] of 390 px). On desktop "‹12" butts into its row label ("median $178K‹12", gap −1 px). | Inset the chips by their own width (clamp `left` to `[plotL + 2, plotR − chipW − 2]`), and reserve 4 px between the label column and the plot. | chart.js `overflowMarker`, viz.css `.ms-bin__chip` | `[UX-17]` |
| UX-18 | Low | all; light | Snapshot badge | [1440](../screenshots/ux-review-beta/first-d1440-light.png) | "Snapshot · Oct 11" is #2563eb on its tint: **4.48:1**, just under 4.5:1, on every beta board (dark passes). | Darken the snapshot text one step (`--ms-blue` → #1d4ed8 gives about 6:1 on the same tint), or lighten the tint. | styles.css `.data-badge.is-snapshot`, `--ms-blue` | `[UX-18]` |
| UX-19 | Low | 390; both | top bar and map controls | [phone](../screenshots/ux-review-beta/phone-map-p390-light.png) | Tap targets under 44 px: Beta tag **43×21**, logo link **26×26**, map Pay/Juice **52×26** each, zoom **30×30**. | Pad the tag and logo to a 44 px hit area (`padding` plus negative `margin`, or a `::before` hit box); map controls 44 px tall on `pointer: coarse`. | styles.css `.beta-tag`, `.brand`; viz.css `.ms-modes__btn`, `.leaflet-control-zoom a` | `[UX-19]` |
| UX-20 | Low | 1440, 1024; both | Insights, pay estimate | [Insights](../screenshots/ux-review-beta/insights-d1440-light.png) | Text under 12 px: the scale "$140K · pay of roles at this company · $290K" **10.5 px**, comparable roles' meta **11.5 px**, "100% match" **11 px**. Phones already use 12 px. | Apply the phone rule (features.css line 467) at every width. | features.css `.ms-comp__scale`, `.ms-comp__item-meta`, `.ms-comp__match` | `[UX-20]` |
| UX-21 | Low | 1024, 390; both | search box | [1024](../screenshots/ux-review-beta/first-d1024-light.png), [phone](../screenshots/ux-review-beta/first-p390-light.png) | The placeholder "Search titles, teams, skills…" needs 183 px (1024) and 209 px (phone) and gets 126 and 123: it reads **"Search titles, t"**. | A shorter placeholder where the box is narrow: "Search roles" (it is the label already), via a `data-short` swap in JS or two spans. | index.html `#search`, app.js | `[UX-21]` |
| UX-28 | Low | all | drawer and filters, number formats | [drawer](../screenshots/ux-review-beta/drawer-pln-d1440-light.png), [Department](../screenshots/ux-review-beta/chip-Department-d1440-light.png) | The same number two ways: the headline "$184K–356K" rounds 356,500 down while "Pay by level: Level 3: $224K–356.5K" keeps the half; filter counts have no separators ("1652", "2729 of 4875 roles") while every other count does ("1,652 roles"). | One `money()` rounding for headline and levels (to the nearest K: "$357K"); `toLocaleString()` on facet counts and the Juice note. | app.js pay-by-level line, facet render, More popover note | log |
| UX-30 | Low | all | drawer Juice line | [hourly intern](../screenshots/ux-review-beta/drawer-hourly-intern-d1440-light.png) | Juice is worked out in a nearby city without saying so: a Los Gatos posting reads "$4,220/mo left for one person **in San Jose**". | "in San Jose (nearest city with cost data)". | app.js Juice block in `drawerContent` | log |
| UX-31 | Low | all | words (drawer, pay block, tooltips) | [PLN drawer](../screenshots/ux-review-beta/drawer-pln-d1440-light.png), [phone drawer](../screenshots/ux-review-beta/phone-drawer-p390-light.png) | Strings to rewrite: "**The top pay of** Apple's roles in the US that show pay" → "The highest pay of Apple's roles in the US that show pay"; "**Multiple pay zones**" (meaning only in a tooltip) → see UX-22; "**Wide range (2.0×)**" → "Top is 2× the bottom"; "**Single figure**" → "One number, not a range"; "accuracy tested 11 Oct 2026 · **level model** Oct 2026" → "estimate checked Oct 11, 2026"; Pay unclear tooltip "range $71K–$464K **spans 6.5x (more than 4x)**" → "the top is 6.5 times the bottom, too wide to be one job's pay"; badge "Saved snapshot of **Apple careers site**" → "of Apple's careers site"; "Pay **from** other countries isn't used" and "Pay **for** other countries isn't used" in sibling drawers → one wording; straight apostrophes ("doesn't", "isn't") among curly ones. | As quoted. | app.js `payLabels` (3708–3710), `drawerContent` (3862), `badgeInfo`; freshness.js line 280 | log |
| UX-32 | Low | all | big-tech polish | [NVIDIA filters](../screenshots/ux-review-beta/board-nvidia-d1280-light.png), [long title](../screenshots/ux-review-beta/drawer-longtitle-d1440-light.png), [Insights](../screenshots/ux-review-beta/insights-d1440-light.png) | Big-tech data still looks raw beside the main site: NVIDIA job families in inverted form ("Engineer, ASIC", "Architect, Solutions"), Apple titles with team prefixes ("AIML - Director, …"), an NVIDIA title starting "8. Mixed Signal…", and store names in the Insights location list ("Grosse Bockenheimer Strasse", "Champs Élysées", "Highcross"; BP-15/D-32). | Display-only clean-up: "ASIC Engineering", "Solutions Architecture"; strip a leading list number; leave the posted title in "Posted as …". | data lane (departments, `expandTitle`); app.js Compstimate location list | log |
| UX-33 | Low | 1280 vs 1440 | cards | [1440](../screenshots/ux-review-beta/apple-d1440-light.png), [1280](../screenshots/ux-review-beta/board-apple-d1280-light.png) | The age changes wording with the width ("Listed 10 days ago" at 1440, "10 days ago" at 1280 and 1024); remote cards say "Remote (US)" and then a "Remote" tag. | Keep "Listed" at every width; drop the Remote tag when the location already starts with "Remote". | app.js `card` (`card-age-top`) | log |
| UX-34 | Low | 1440; both | empty search | [empty](../screenshots/ux-review-beta/empty-d1440-light.png) | The empty state appears twice, in the chart and in the list, with two identical "Clear the search" buttons, and "Save" is offered for a search with 0 results. | One empty state in the chart; the list says "0 roles" only; hide Save at 0 results. | app.js `renderResults`, `renderQuickbar` (the Save button) | log |
| UX-35 | Low | all, most on 390 | results list | [phone sheet](../screenshots/ux-review-beta/long-titles-p390-light.png) | The Juice explainer ("🍉 Juice is the money left a year after tax…") sits above every list on every board: 3 lines (about 90 px) of the phone sheet. | Show it until the first card is opened or once per visit, then fold to a "What's Juice?" link. | app.js `juiceScaleNote` | log |
| UX-36 | Low | Ranges view | chart toolbar | [Ranges](../screenshots/ux-review-beta/ranges-d1440-light.png) | Ranges shows "Group: **None**" while its legend says "**By department**" and colours by department; the select also keeps the width of "Department", leaving a gap. | Label the select "Colour: Department" in Ranges, or show "Department" since that is what it does. | app.js view toggle (line 4395), `colorBy` | log |

### By review question

1. **First impression.** What draws the eye first is the coloured bubble row and the green pay pills,
   which is right. The page says what it is only in a 13 px muted tagline placed beside the Group
   select, where it reads as a chart caption ("Pay, and what's left after tax and rent, for 13
   companies' open roles"). The bubble number means "how many roles" only in the Clusters button's
   tooltip. Next step is implied (click a bubble or a card) but not said. Suggest: move the tagline
   above the stats line on desktop as on the phone, and add one muted line under the axis title:
   "Each bubble groups roles by pay; the number is how many."
2. **Hierarchy and layout.** The three-column layout holds at Apple's 4,875 roles (windowed list, no
   jank, no horizontal scroll at any viewport or theme). It breaks down with many departments (UX-24),
   long department names (UX-16) and at 1280 in the stats line (UX-15). Long titles wrap cleanly in
   cards and the drawer (NVIDIA's 132-character title included). Long place names fit the filters.
3. **Consistency.** UX-25 (names), UX-27 (dates), UX-28 (numbers), UX-33. Chips, popovers, toggles and
   focus rings behave alike everywhere: every chip opens the same popover pattern with Reset and "See N
   roles", and every control tested has a 2 px accent focus ring in both themes. Against the main site
   (Anduril): the same layout, controls and copy; intended differences only (the Beta tag in place of
   Refresh on snapshot boards, "13 companies" vs "8", "Apple careers site" vs "Greenhouse / …"). A
   beta-only board on the main site says "This board isn't on this site" with no link to /beta/ (D-35,
   known).
4. **Words.** UX-31, UX-25, UX-26 ("API"), UX-23. Most labels are plain and explained where they
   appear: "Staff+ means staff, principal and above…", "A role matches if its range overlaps yours",
   "Posted base pay. Equity and bonus aren't included." That is the best copy on the site.
5. **States.** Loading (skeleton bars, "Loading roles…", badge "Loading") is calm and clear. Empty
   search is clear (UX-34 is polish). Error is the weak one (UX-26). "Pay unclear" says what happened,
   why, and gives an estimate labelled "An estimate, not a figure from the posting" with "low
   confidence": honest. Estimate vs posted pay is always labelled. Snapshot vs Live: the popover is
   clear ("Saved snapshot of Apple careers site from Oct 11. This board is collected by the site's
   crawler…"), the badge itself needs UX-18 and, on phones, UX-23. Beta notice: UX-23.
6. **Simplicity budget.** Visible controls on first load (Apple on beta; Anduril on the main site in
   brackets): top bar 10 at 1440 (10), 9 at 1280 and 1024 ("Add board" folds away) (9), 9 at 768 (8),
   9 at 390 (8); quickbar 7 (Filters + 6 chips), 4 visible at 390 in a scroll row; viz toolbar 3
   (Clusters, Ranges, Group); results header 1 (sort). That is **within §8**: on a snapshot board the
   Beta tag takes the Refresh button's place, so the main view has not grown; the sort select has 5
   options plus "Best match" while searching, within the 3-option allowance. Not controls but new
   standing text since the beta batches: the tagline line and the Juice explainer (UX-35); fold the
   explainer away after first use.
7. **Responsive and themes.** No horizontal scroll at any of the 5 viewports in either theme (a guard
   test). Measured problems: UX-15 to UX-21. Contrast: every visible text node on the first screens,
   the drawer, the More popover and Insights passes 4.5:1 in both themes except the Snapshot badge
   (4.48:1, light) and the brand dot "·" (3.61:1, decorative, inside the logo). Dark mode is
   consistently good; cluster numbers on dark bubbles pass.
8. **Motion and feedback.** Reduced motion is honoured site-wide (`styles.css` line 677 plus the
   chart, map and Insights rules). Focus rings are visible on every control in both themes. After a
   click: a Department checkbox on Apple updates the count, stats and list in 120 ms and the chart in
   153 ms (load about 1); a company switch closes the menu and updates the button in 20 ms; the first
   Map open takes 226 ms (Leaflet loads then). No action leaves the screen unchanged for long; only the
   checkbox count is just over 100 ms on the biggest board.
9. **Honesty.** Level ranges: good, "Pay by level: Level 2: $184K–287.5K · Level 3: $224K–356.5K" sits
   under the number. Currency: good, "PLN 345K–702K · ≈ $91K–186K in approx US dollars for comparison",
   and the chart axis says "US$ (converted)" with a footer count of converted postings. Estimates:
   good. Weak: pay that covers only some places (UX-22, High), internship terms on the card (UX-29),
   Juice proxy cities (UX-30).
10. **Beta only.** UX-23 (notice and badge), UX-32 (polish), UX-24 (many departments). The link back to
    the main site works (the tag points at `../`), and the tab title says "melon·seek beta".

### What works well (keep)

1. **Honest pay labelling in the drawer.** "Posted base pay. Equity and bonus aren't included.", "Pay
   by level", "≈ $91K–186K in approx US dollars for comparison", "Paid by the hour (as posted:
   $40/hour - $110/hour.)" and the Pay unclear explanation plus a labelled low-confidence estimate.
   The caveat sits next to the number, which is the standard to extend to places (UX-22).
2. **Plain explanations where the control is.** The filter footnotes ("Staff+ means staff, principal
   and above…", "A city also finds roles that list only its country or region…", "A role matches if
   its range overlaps yours. You can type another currency (£80,000, A$350k)") and "Same role
   elsewhere" saying which comparison it made and why ("This posting doesn't state a level, so this
   compares … at every full-time level").
3. **A calm, consistent system that holds at scale.** One chip and popover pattern, one focus ring,
   skeleton loading, no horizontal scroll at any width or theme, dark mode that passes contrast
   throughout, and a windowed list that keeps Apple's 4,875 roles responsive (filters answer in about
   120 ms).

## 6. Known gaps and follow-ups

- The map was reviewed without its basemap (other hosts are blocked in the sandbox), so pin-label
  contrast on real tiles is untested; on the plain background a cluster label measured 3.60:1
  ("Cupertino, Austin and 121 more"), which may differ on tiles.
- Amazon and Meta are not in this build; their capped-board line ("5,000 roles · of 22,415 posted")
  is unreviewed.
- WebKit and a real iPhone were not available; phone results are Chromium emulation.
- Hover states were checked only by eye on the chart and cards.
- The full e2e suite was not run (lead's note); the lead runs it.
- Registry: `docs/process/README.md` lists logs; the lead adds this one when integrating.

## 7. Change log

- 2026-10-11 14:34 UTC: server started on the lead's cycle-beta5 build; first-impression screenshots.
- 2026-10-11 14:40: screen tour, drawers, phone tour, audits, states, main-site comparison.
- 2026-10-11 14:50: `test/e2e/beta-ux-review.e2e.js` written and registered; 1/8 pass (the 7 `[UX-n]`
  tests fail as intended).
- 2026-10-11 14:55: `npm test` 1,015 tests, 937 pass, 0 fail, 78 to-dos.
- 2026-10-11: this log and the verbatim prompt; screenshots shrunk.
