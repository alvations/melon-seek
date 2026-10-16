# Process log: fix-density

## State

- **Done:**
  - the rule and the shared disclosure (`public/viz/note.js`), applied on every surface;
  - fix5-data's display patch, folded in;
  - the new e2e test, 51/51 on today's crawl;
  - the existing tests that pinned the old text, updated;
  - rebased onto 2474fc4;
  - every line re-measured before and after on the fresh crawl (the table in section 5).
- **In progress:** the before and after screenshots, light and dark (`$F/measure-all.sh`, look step).
- **Next step:** shrink the screenshots and commit them, run the full e2e on the fresh build, re-run S-6 on an
  idle machine, delete the scratch build, and report.

## 1. Brief

Prompt: [docs/process/prompts/fix-density.md](prompts/fix-density.md), saved word for word.

On 2026-10-11 the user said the chart's footer and the top notes were "way too busy and too much on a mobile".
Their example was the chart's notes line: "564 postings with salary · row medians: pay in the US (55 paid
elsewhere left out) · 46 on-target earnings, not in the medians · 81 with no salary posted · yearly pay · 55
converted from another currency at Jul 2026 exchange rates". They also asked that UI/UX QC stop glossing over
lines like this. This lane took stock of every secondary line around the main views, on every board and at
three viewports. It then set one rule, applied it everywhere with one disclosure pattern, and added tests that
fail on the old lines.

**Files owned:**
- `public/viz/note.js` (new): the one shared disclosure.
- The notes, caption and legend code in `public/viz/chart.js`, `public/viz/map.js` and `public/viz/viz.css`.
- In `public/app.js`: the stats line, the tagline, the results header, the drawer's pay block sub-lines, the
  Pay estimate block and the empty states.
- `public/styles.css`.
- The caption text in `public/features/insights.js` and `public/features/compstimate.js`.

**Also touched**, each with a reason:
- `public/features/comps.js`: the Compare companies card is an Insights card. Its 61-word footnote was the
  longest line in the app (8 lines on a phone). Only its caption and footnote placement changed.
- `public/index.html`: the stats line changed from `<p>` to `<div role="group">`, because the Details list (a
  `<ul>`) can't sit inside a `<p>`.
- The new test and its registration (`test/e2e/fix-density.e2e.js`, `scripts/e2e.js`), plus the existing tests
  that pinned the old text (section 5).

**Not touched:** `public/api.js`, `public/unpack-worker.js`, `scripts/build-static.js`, `scripts/snapshot.js`
(the performance lane), and the row grouping code in chart.js and the group/filter controls in app.js (the
google-grouping lane, told of the nearby edits by message).

**Folded in:** the lead asked this lane to fold in fix5-data's display patch,
`docs/process/patches/fix5-data-display.diff` (VT-17 minimums, VT-18 shift differential). It is applied, and its
drawer caption follows the rule (decision 9).

## 2. Inputs and sources

- `docs/strategy/ROADMAP.md` §8 (the UI simplicity budget): at most 1 new main-view control, at most 2 labels
  in the pay block, monochrome labels, no new colours.
- `docs/process/prompts/cycle/fix-lane.md`: lane rules (plain words, desktop density, pid files, no
  `pkill -f`, before and after screenshots).
- `docs/process/TEMPLATE.md`: the shape of this log.
- `docs/CONTRACT.md` fix wave 5: `salary.kind 'minimum'`, `includesShiftDifferential`, `statedBase`.
- Code read: chart.js `renderNotes`, `renderLegend` and the median caption. map.js `renderPayLegend` and
  `renderJuiceLegend`. app.js `renderKpis`, `renderTagline`, `renderResults`, `emptyState`, `stateCard`,
  `notHereState`, `drawerContent`, `payLevelsLine`, `payPlacesLine`, `compstimateBlock`, `salaryDistribution`
  and `badgeInfo`. insights.js `card` and the panel header. compstimate.js header. comps.js caption and foot.
- Tests that pinned the old text (found by grepping for the selectors and phrases): `test/beta-methodology.test.js`
  MR-2, `test/e2e/fix3-viz.e2e.js`, `fix-beta-app.e2e.js` D-21, `fix3-compare.e2e.js` BP-3, the phone test and
  the Warsaw ranking, `ui.e2e.js` (`readDrawerComp`), `fix-estimates.e2e.js` P-10, and `beta-mobile-qa.e2e.js`
  M-25 (44px targets).
- Data: today's crawl. The first pass used the 2026-10-11 snapshots. The lead then sent fresh snapshots
  (`.../scratchpad/wt-data2/data/{snapshots,beta/snapshots}`, Amazon uncapped at 22,179 postings), and every
  number below was measured again on them.

## 3. Decisions and rationale

1. **The rule.** Every secondary line around the main views shows **one line**, on a phone and on a desktop.
   It carries the **one or two facts** a job seeker needs at a glance, in **at most 12 visible words**, with
   **nothing cut off**. Every other caveat stays available, in plain words, in a short list behind **one
   "Details" text button**. The button has `aria-expanded` and `aria-controls` and opens a bulleted list under
   the line. It is the same pattern on every surface (`public/viz/note.js` `renderNote` / `noteLine`). It is not
   a new kind of control: it is a text button, monochrome apart from the link colour, sitting at the end of the
   line it explains (ROADMAP §8).
2. **What stays on the line**, per surface:
   - **Chart notes:** "564 with pay · 81 without". Under a Location filter: "120 with pay for London · 81
     without".
   - **Stats line, desktop:** "N roles · X% show pay · $M base pay median". On a phone it is just "$M base pay
     median". The sheet's peek row already gives the count, and the chart's notes give the with/without
     counts, so the phone doesn't repeat them.
   - **Map Pay legend:** "Median base pay a year" on a desktop, "Median pay" on a phone.
   - **Juice legend:** "Gray: no Juice data". The data's dates are under Details.
   - **Market insights header:** "All N roles on this board", or "N of M roles match your filters".
   - **Insights card captions:** one short phrase each ("Average pay by skill, vs. all roles", "Middle half of
     pay, and the median", "Where the openings are", "Share of the N roles in view", "Posted pay in the US, by
     company").
   - **Pay estimate caption:** "Estimated pay from similar roles".
   - **Drawer:** "Posted base pay" (or on-target earnings, part-time, fixed-term, minimum, shift pay, or "Posted
     for Poland, not Munich" under a Location filter). Then "Pays more than 72% of Google's roles in Poland",
     and "This one among 1,154 roles at Microsoft" over the strip.
   - **Drawer estimate:** "Not from the posting: an estimate". When there's no estimate: "No pay estimate
     either".
   - **Empty states:** "Check the spelling, or try another word." and "Without the location filter: 120
     roles." The hidden-by-pay-filter counts are under Details.
   - **Tagline on a phone:** "Tech pay, after tax and rent", or on beta "Beta: adds 7 big-tech careers sites".
     The full line is the title, and the desktop's line.
3. **What moved under Details.** Every caveat the old lines carried is still there:
   - the left-out counts: pay for another country only, rows' other places, the row medians' country basis,
     on-target earnings left out of medians, and roles hidden by the pay filter;
   - the exchange-rate month, as a link to the methodology section that names the source (MR-2);
   - "yearly, in approx US dollars";
   - the striped and part-time bars, and the postings past the chart's edge;
   - the half-between range and the "mostly X" share;
   - the capped-board note;
   - the Insights footnotes (skills left out, small departments, what Compare compares, and the dates);
   - the estimate's basis, accuracy and dates, and the methodology links ("How pay is read", "How estimates
     work").

   No fact was deleted.
4. **Plain words.**
   - "row medians: pay in the US (329 paid elsewhere left out)" became "Each row's median is pay in the US
     only: 329 paid elsewhere are on the chart, not in the medians".
   - "pay in approx. USD" became "Pay in approx. US dollars at Jul 2026 exchange rates".
   - "Box: …, Whiskers: …, Tick: …" stays in full under Details, and the line reads "Middle half of pay, and the
     median".
5. **The Ranges legend** wrapped to 8 or 9 lines on a phone. It is now **one row that scrolls sideways**, with a
   fade at its edge, rather than a Details list: a colour key belongs next to the colours. When it overflows it
   takes keyboard focus (`tabindex=0`), so a keyboard can scroll it too.
6. **"Pay by level / Pay by place"** in the drawer was one paragraph that wrapped to 2 to 4 lines. It is now one
   short row per level or place ("Level 2 $184K–287.5K"), each a single line, which reads like a small table.
   That is data, not a caveat, so it stays visible. The level-names note ("These are NVIDIA's own level names")
   moved under Details.
7. **Phones get a 44px tap target** for Details without the line growing: the button is 44px tall with
   negative margins (viz.css `@media (max-width: 860px)`). M-25 measures the button's box, so a pseudo-element
   hit area wasn't enough.
8. **The open state survives re-renders.** A filter change redraws the chart's notes, so a list the person
   opened stays open (`key`). Keyboard focus also stays on the button when the line is rebuilt.
9. **fix5-data's display patch** (`docs/process/patches/fix5-data-display.diff`) went in as written: the card
   reads "from €X", the real span shows for "· N places", and the "Minimum" and "Incl. top shift pay" chips are
   in the pay block (still at most 2 labels). Its long captions ("Posted minimum base pay; the offer can be
   higher. …" and "Posted pay, including the highest shift differential. Base pay starts at $18.35/hour. …") are
   under Details. The caption line reads "Posted minimum base pay" or "Posted pay, including shift pay".
10. **What didn't change**, because it already met the rule: the results header ("5,000 roles · of 22,352
    posted"), the badge's short label ("Oct 11"), the chart's median caption ("Median base pay $183K", desktop
    only), the drawer's "USD · per year", the pay labels (at most 2 chips), and the Pay estimate basis line.

## 4. Replayable steps

The scratch folder is `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad/fd`
(`$F`). The worktree is `/home/user/melon-seek/.claude/worktrees/agent-a62c9206a358fb258`.

1. `git checkout --detach 31ad25b`. Symlink `node_modules`, `data/snapshots` and `data/beta/snapshots`. Later:
   rebase onto e48fd32, then onto 2474fc4, and re-link `data/` to the lead's fresh crawl (`wt-data2`).
2. Build: `node scripts/build-static.js --out $F/dist` (about 3 to 4 minutes; 350 MB). Serve it:
   `PORT=5391 node scripts/cycle/serve.mjs --dist $F/dist --pid $F/serve.pid`.
3. **Before:** `$F/before-serve.mjs` serves the same build on port 5392, with this lane's files taken from the
   base commit (`git archive 31ad25b public/...`; these files are the same at 2474fc4).
4. **Inventory:** `node $F/inventory.mjs <origin> <out.json> [shotsDir] [phase]` visits each of the 8 boards at
   390x844, 360x740 and 1440x900. It covers Clusters, Ranges, Map, Insights, the drawer of the top-paid role, the
   drawer of a role with no pay, Amazon's minimum and shift-pay drawers, and the empty search. For every listed
   selector it records the visible text, the words and the line boxes (it groups the `Range.getClientRects()`
   of the element's contents by their vertical middle). `$F/juice.mjs` does the same for the Juice legend.
   `$F/table.py` turns the before and after JSON into the table in section 5.
5. **Screenshots:** `node $F/look.mjs <origin> docs/screenshots/fix-density <before|after> <light|dark>` (phone
   390x844 and desktop 1440x900; the `*-open` shots click Details first). Then
   `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-density`.
6. **Tests:**
   - `BETA_QA_DIST=$F/dist NODE_PATH=<pw> node scripts/e2e.js --grep=fix-density`
   - To run it against the old code: add `FIX_DENSITY_ORIGIN=http://127.0.0.1:5392`.
   - `npm test`, with `MELON_BETA_SNAPSHOT_DIR=<empty dir>` and the data links removed.
   - The full suite: `BETA_QA_DIST=$F/dist node scripts/e2e.js`.

## 5. Verification

### Inventory, before and after (today's crawl, 8 boards)

Cells give the maximum over the 8 boards: **visible words / wrapped lines**. "Phone" covers both 390x844 and
360x740. In the after column, " [Details]" marks the disclosure button, which isn't counted as a word. Each
board's full text and counts are in `$F/inv2-before.json` and `$F/inv2-after.json`.

| Line | Phone before | Phone after | Desktop before | Desktop after | Worst text before (phone) | Worst text after (phone) |
|---|---|---|---|---|---|---|
| Chart notes line (Clusters) | 40 / 5 | 5 / 1 | 46 / 3 | 5 / 1 | amazon: “13,979 postings with salary · row medians: pay in the US (802 paid elsewhere left out) · 8,200 with no salary posted · 14 postings past the edge of the chart (›) · yearly…” | amazon: “13,979 with pay · 8,200 without [Details]” |
| Chart notes line (Ranges) | 48 / 6 | 5 / 1 | 46 / 3 | 5 / 1 | amazon: “13,979 postings with salary · 2,184 striped: one posting’s range over several levels or places · 83 part-time hourly, shown as a year if full-time · 8,200 with no salary …” | amazon: “13,979 with pay · 8,200 without [Details]” |
| Ranges legend | 45 / 10 | 45 / 1 | 45 / 4 | 45 / 1 | amazon: “Colour: department Operations, IT, & Support Engineering 2,422 Software Development 1,924 Fulfillment & Operations Management 1,305 Project/Program/Product Management--Te…” | anduril: “Colour: department Hardware Operations : Supply Chain : Product Sourcing Engineering 80 Hardware Platform : Hardware Engineering Services 64 Manufacturing : Manufacturing…” |
| Chart median caption | — | — | 4 / 1 | 4 / 1 | amazon: “Median base pay $141K” | amazon: “Median base pay $141K” |
| Stats line | 9 / 1 | 4 / 1 | 16 / 2 | 7 / 1 | amazon: “$141K base pay median · half between $93K and $175K” | amazon: “$141K base pay median [Details]” |
| Tagline (top note) | 16 / 3 | 7 / 1 | 15 / 2 | 13 / 1 | amazon: “melon·seek · Beta: adds Google, Microsoft, Meta, Apple, Netflix, Amazon and NVIDIA from their own careers sites” | amazon: “melon·seek · Beta: adds 7 big-tech careers sites” |
| Results header | 2 / 1 | 2 / 1 | 2 / 1 | 2 / 1 | amazon: “22,179 roles” | amazon: “22,179 roles” |
| Badge short label | 2 / 1 | 2 / 1 | 3 / 1 | 3 / 1 | amazon: “Oct 16” | amazon: “Oct 16” |
| Map Pay legend note | 16 / 1 | 2 / 1 | 16 / 2 | 5 / 1 | amazon: “Median posted base pay a year, approx US dollars (Jul 2026 exchange rates) · small number: postings” | amazon: “Median pay [Details]” |
| Map Juice legend note (the as-of line before) | 15 / 1 | 4 / 1 | 15 / 2 | 4 / 1 | anduril: “As of: rent May–Sep 2026 · living costs Jun–Sep 2026 · exchange rates Jul 2026 · tax 2025–2026 [cut off]” | anduril: “Gray: no Juice data [Details]” |
| Market insights header | 38 / 5 | 6 / 1 | 38 / 2 | 6 / 1 | nvidia: “All 2,711 roles on this board · pay in approx. USD at Jul 2026 exchange rates · postings as of 16 Oct 2026 · 41 roles posting on-target earnings (base plus commission) le…” | apple: “All 4,851 roles on this board [Details]” |
| Insights card captions (each) | 24 / 3 | 7 / 1 | 24 / 2 | 7 / 1 | amazon: “Where the openings are. Multi-location roles count in each city; a median uses only pay posted for that place, from 5 or more roles.” | amazon: “Posted pay in the US, by company [Details]” |
| Insights card footnotes (each) | 61 / 8 | — | 61 / 4 | — | amazon: “Posted base pay ranges of full-time roles in the US, midpoints in approx. US dollars; companies need 3+ salaried postings there. Internships, fixed-term programmes and on…” | — |
| Pay estimate caption | 13 / 2 | 5 / 1 | 13 / 1 | 5 / 1 | amazon: “Estimated pay from similar roles. Follows your filters until you change a field.” | amazon: “Estimated pay from similar roles [Details]” |
| Pay estimate basis line | 7 / 1 | 7 / 1 | 7 / 1 | 7 / 1 | amazon: “Based on 500 similar roles at Amazon” | amazon: “Based on 500 similar roles at Amazon” |
| Drawer: "USD · per year" | 3 / 1 | 3 / 1 | 3 / 1 | 3 / 1 | amazon: “USD · per year” | amazon: “USD · per year” |
| Drawer: pay by level / place (block) | 7 / 2 | 7 / 4 | 7 / 1 | 7 / 4 | amazon: “Pay by place: Cupertino $287K–350K · Seattle $250K–338K” | amazon: “Pay by place Cupertino $287K–350K Seattle $250K–338K” |
| Drawer: pay by level / place (each row) | — | 2 / 1 | — | 2 / 1 | — | amazon: “Cupertino $287K–350K” |
| Drawer: pay caption (before) | 8 / 1 | — | 8 / 1 | — | amazon: “Posted base pay. Equity and bonus aren’t included.” | — |
| Drawer: pay caption line (after) | — | 3 / 1 | — | 3 / 1 | — | amazon: “Posted base pay [Details]” |
| Drawer: "How pay is read" line | 4 / 1 | — | 4 / 1 | — | amazon: “How pay is read” | — |
| Drawer: percentile line | 12 / 2 | 9 / 1 | 12 / 1 | 9 / 1 | amazon: “The highest pay of Amazon’s roles in the US that show pay” | amazon: “The highest pay of Amazon’s roles in the US” |
| Drawer: strip caption | 16 / 2 | 7 / 1 | 16 / 2 | 7 / 1 | amazon: “Pay of 13,076 roles at Amazon (the middle of each posted range); this one is marked” | amazon: “This one among 13,076 roles at Amazon” |
| Drawer: pay labels | 7 / 1 | 7 / 1 | 7 / 1 | 7 / 1 | google: “One number, not a range + equity mentioned” | google: “One number, not a range + equity mentioned” |
| Drawer, Amazon minimum: caption (before) | 8 / 1 | — | 8 / 1 | — | amazon: “Posted base pay. Equity and bonus aren’t included.” | — |
| Drawer, Amazon minimum: caption line (after) | — | 4 / 1 | — | 4 / 1 | — | amazon: “Posted minimum base pay [Details]” |
| Drawer, Amazon shift pay: caption (before) | 12 / 2 | — | 12 / 1 | — | amazon: “Posted hourly pay for a part-time role. Equity and bonus aren’t included.” | — |
| Drawer, Amazon shift pay: caption line (after) | — | 5 / 1 | — | 5 / 1 | — | amazon: “Posted pay, including shift pay [Details]” |
| Drawer, no pay: whole block | 85 / 13 | 17 / 4 | 85 / 9 | 17 / 4 | anduril: “No pay listed: this posting has no pay range. PAY ESTIMATE about $89K ($66K–114K, medium confidence) Based on 133 similar roles at Anduril, Costa Mesa and elsewhere in th…” | anduril: “No pay listed PAY ESTIMATE about $89K ($66K–114K, medium confidence) Not from the posting: an estimate Details” |
| Drawer, no pay: estimate sub-lines (each) | 29 / 4 | 6 / 1 | 29 / 2 | 6 / 1 | anduril: “Typically within ±12% (tested on 498 listed salaries, Oct 2026): in half of the tests the estimate was at least this close to the posted pay. How estimates work” | anduril: “Not from the posting: an estimate [Details]” |
| Empty state (by the chart) | 17 / 6 | 14 / 4 | 17 / 4 | 14 / 4 | amazon: “No roles match “zzqxnomatch” Check the spelling, or try a shorter or different word. Clear the search” | amazon: “No roles match “zzqxnomatch” Check the spelling, or try another word. Clear the search” |
| Empty state (list) | 17 / 5 | 14 / 4 | 9 / 1 | 9 / 1 | amazon: “No roles match “zzqxnomatch” Check the spelling, or try a shorter or different word. Clear the search” | amazon: “No roles match “zzqxnomatch” Check the spelling, or try another word. Clear the search” |

Reading the table:
- "1 line" before does not mean the line fit. Before, the phone's map Pay note and the Juice as-of line were
  each held to one line by an ellipsis, so most of their 15 or 16 words were cut off. After, nothing is cut off:
  the test checks `scrollWidth`.
- The desktop tagline after has 13 words, on the main site ("Pay, and what's left after tax and rent, for 8
  companies' open roles"), on one line. The 12-word budget is the phone's; the phone's line has 7 words.
- The drawer's "Pay by level / place" block is a title plus one row per place, each one line (decision 6).
- The empty states count the whole card (title, body, button). The body line itself is one line (the test
  measures `.state-card p`).

Per board, the chart notes line and the stats line at 390x844 (words / lines):

| Board | Notes before | Notes after | Stats before | Stats after |
|---|---|---|---|---|
| amazon | 40 / 4: “13,979 postings with salary · row medians: pay in the US (802 paid elsewhere left out) · 8,200 with no salary posted · 14 postings past the edge of the chart (›) · yearly pay · 802 converted from another currency at Jul 2026 exchange rates” | 5 / 1: “13,979 with pay · 8,200 without [Details]” | 9 / 1: “$141K base pay median · half between $93K and $175K” | 4 / 1: “$141K base pay median [Details]” |
| apple | 19 / 2: “2,781 postings with salary · 2,070 with no salary posted · 17 postings past the edge of the chart (›) · yearly pay” | 5 / 1: “2,781 with pay · 2,070 without [Details]” | 9 / 1: “$214K base pay median · half between $188K and $252K” | 4 / 1: “$214K base pay median [Details]” |
| google | 40 / 4: “2,512 postings with salary · row medians: pay in the US (452 paid elsewhere left out) · 1,309 with no salary posted · 30 postings past the edge of the chart (›) · yearly pay · 452 converted from another currency at Jul 2026 exchange rates” | 5 / 1: “2,512 with pay · 1,309 without [Details]” | 9 / 1: “$183K base pay median · half between $141K and $231K” | 4 / 1: “$183K base pay median [Details]” |
| nvidia | 39 / 4: “1,462 postings with salary · row medians: pay in the US (39 paid elsewhere left out) · 41 on-target earnings, not in the medians · 1,249 with no salary posted · yearly pay · 39 converted from another currency at Jul 2026 exchange rates” | 5 / 1: “1,462 with pay · 1,249 without [Details]” | 9 / 1: “$239K base pay median · half between $200K and $270K” | 4 / 1: “$239K base pay median [Details]” |
| microsoft | 40 / 4: “1,566 postings with salary · row medians: pay in the US (314 paid elsewhere left out) · 869 with no salary posted · 6 postings past the edge of the chart (›) · yearly pay · 314 converted from another currency at Jul 2026 exchange rates” | 5 / 1: “1,566 with pay · 869 without [Details]” | 9 / 1: “$168K base pay median · half between $143K and $197K” | 4 / 1: “$168K base pay median [Details]” |
| meta | 40 / 4: “948 postings with salary · row medians: pay in the US (9 paid elsewhere left out) · 260 with no salary posted · 5 postings past the edge of the chart (›) · yearly pay · 9 converted from another currency at Jul 2026 exchange rates” | 5 / 1: “948 with pay · 260 without [Details]” | 9 / 1: “$193K base pay median · half between $161K and $220K” | 4 / 1: “$193K base pay median [Details]” |
| netflix | 40 / 4: “259 postings with salary · row medians: pay in the US (3 paid elsewhere left out) · 155 with no salary posted · 1 posting past the edge of the chart (›) · yearly pay · 24 converted from another currency at Jul 2026 exchange rates” | 5 / 1: “259 with pay · 155 without [Details]” | 9 / 1: “$427K base pay median · half between $264K and $582K” | 4 / 1: “$427K base pay median [Details]” |
| anduril | 40 / 4: “2,388 postings with salary · row medians: pay in the US (4 paid elsewhere left out) · 149 with no salary posted · 1 posting past the edge of the chart (›) · yearly pay · 4 converted from another currency at Jul 2026 exchange rates” | 5 / 1: “2,388 with pay · 149 without [Details]” | 9 / 1: “$170K base pay median · half between $146K and $193K” | 4 / 1: “$170K base pay median [Details]” |

### Tests

- **`test/e2e/fix-density.e2e.js`** (new, registered in `scripts/e2e.js`) has 51 tests:
  - Two per board and viewport (8 boards × 390x844, 360x740 and 1440x900). Every listed line is one line box,
    has at most 12 words and isn't cut off. Its Details is closed at first (`aria-expanded="false"`) and its
    `aria-controls` names the list. A click opens the list, which holds the moved facts ("Pay is yearly", "show
    pay", "exchange rates", "How pay is read"), and closes it again. The Ranges legend is one row, 26px or less,
    and can take focus when it scrolls.
  - Two for Amazon's minimum and shift-pay drawers (fix5-data).
  - One keyboard test: Enter and Space toggle Details. The list keeps the no-salary count, the row basis and
    the rates' date. The list stays open when the chart re-renders.
- **Before:** run against the old code (`FIX_DENSITY_ORIGIN` = the before server), **0/49 passed, 49 failed**.
  The two fix5-data tests were added later.
- **After:** **51/51 passed** on today's crawl.
- **`npm test`** (`MELON_BETA_SNAPSHOT_DIR` empty, no data links): 1051 tests, 1004 passed, 0 failed in this
  lane's code, 39 to-dos. The one failure, `S-6 /methodology/ is not re-rendered`, is a server timing check
  (median 146 ms against a 25 ms budget). It ran while this lane's browser measurements were going. See the
  re-run below.
- **Existing tests updated, intent kept** (the fact still exists, under Details):
  - `beta-methodology.test.js`: the MR-2 insights line is now "Pay in approx. US dollars …" with the rates'
    date on the same line.
  - `fix3-viz.e2e.js`: the "N with pay" count.
  - `fix-beta-app.e2e.js` D-21: the per-level rows.
  - `fix3-compare.e2e.js`: the caption line names the country; the "that show pay" ranking text is now in the
    Details; the phone test opens Details before measuring the level line.
  - `ui.e2e.js` `readDrawerComp`: reads the estimate's text nodes, Details included.
  - `fix-estimates.e2e.js` P-10: the Compare footnote, from the card's text.
- **Full e2e** on the 2026-10-11 data, before the rebase onto 2474fc4: 305/353, 8 failed, 40 skipped.
  - Six of the failures were tests that read old text or measured the Details button's box. They're fixed
    above, and their re-run passed: 63/63, together with fix-density.
  - `Fix beta app [D-19, M-22]` expects the beta build not to list Meta and Amazon. It depends on the data, not
    on this lane, and the lead updated it in 2474fc4.
- Full e2e on the fresh build: see the change log.

### Screenshots

`docs/screenshots/fix-density/`, shrunk with `scripts/cycle/shrink-screenshots.sh`:
- `before-<board>-<viewport>-light-*.png`: the inventory's shots of the worst lines before the change (the top
  of the page, the notes, the Ranges notes, the map, Insights, the drawer, the empty state).
- `before-<shot>-<viewport>-<theme>.png` and `after-<shot>-<viewport>-<theme>.png`: pairs at 390x844 and
  1440x900, in light and dark, of the top of the page, the notes, the stats line, Ranges, the map (Pay and
  Juice), Insights, the drawer (paid, no pay, NVIDIA, Amazon minimum and shift pay) and the empty state. The
  `after-*-open` shots show Details opened.

## 6. Known gaps and follow-ups

- **Card subtitles inside Insights** follow the rule. The tile notes ("of 4,616 salaried roles") were already
  one line and weren't changed.
- **The Ranges legend scrolls sideways.** A person who misses the edge fade won't see the later departments in
  the legend. The bars still carry their colour, and each bar's tooltip names its department.
- **The "Juice is the money left …" scale above the list** (UX-35, shown until a role is opened) is three lines
  on a desktop. It isn't on the brief's list, and fix-app pins its text. A follow-up could give it the same
  Details pattern.
- **Error states** still show the raw error text in their body (`data.error`). That is deliberate (it's the
  reason), so it isn't capped.
- The fix-density test measures the line of each `.ms-note` without its button. A line that grows past 12 words
  later (a long company or place name) will fail the test, which is the point.

## 7. Change log

- 2026-10-11: first inventory (2026-10-11 snapshots); rule and `note.js`; all surfaces; the new e2e test
  (0/49 before, 49/49 after); updated tests; first screenshots.
- 2026-10-11: rebased onto e48fd32 (no posting cap, DQ-38). Phones get 44px Details targets (M-25). Fixed the
  tests that read the old text. Folded in fix5-data's display patch.
- 2026-10-16: rebased onto 2474fc4. Re-linked `data/` to the fresh crawl (Amazon uncapped, 22,179 postings).
  Rebuilt, re-measured every line before and after, and retook every screenshot. Added the fix5-data drawer
  tests, and made the Insights wait for Amazon's size.
