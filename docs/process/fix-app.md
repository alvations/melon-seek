# Process log: fix-app (app shell, persona review of the main site)

## 1. Brief
- **Prompt:** [`docs/process/prompts/fix-app.md`](prompts/fix-app.md), verbatim.
- **Goal:** fix the app-shell findings of the five persona reviews of the stable site
  (`docs/process/persona-stable-*.md`, consolidated in `docs/process/lead.md`, "Persona review of the main
  site"): P-1 (labels), P-2 (drawer copy), P-3 (cards and filters), P-4, P-5, P-6 (stats line), P-7, P-8 (cards
  and Juice), P-12, P-15, P-16 (app.js), P-18, and improvements I-1 to I-7. Target `stable`; `beta` must not break.
- **Files owned:** `public/app.js`, `public/index.html`, `public/styles.css`, the new
  `test/e2e/fix-app.e2e.js` (registered in `scripts/e2e.js`, as the wave instructions say), this log and
  `docs/screenshots/fix-app/`.
- **Not touched:** `public/features/**`, `public/viz/**`, `server/**`, other `scripts/**`, `docs/QA.md`.

## 2. Inputs and sources
- `docs/CONTRACT.md` (Job shape, v2 `salary.kind`, v3 beta channel) and the lead's shared decisions in the prompt:
  `levelLabel` (roles.js), `payLocations` (shared.js), `salary.kind === 'ote'`, `salary.termWeeks`.
- `docs/strategy/ROADMAP.md` §8 (UI simplicity budget): no new main-view control, no new mode, no new colour,
  no new card row, at most 3 new sort options (only "Best match" is added, and only while searching).
- The five persona logs (each "Broken, fix now" and "Improve" item, with the screenshots) and the other lanes'
  prompts in the scratchpad, read only to agree on interfaces (the estimates lane returns the drawer's basis
  line; the viz lane fixes chart.js's empty state, `(update due)` and the chart's seniority order).
- Existing tests that pin app copy: `test/e2e/ui.e2e.js` (the "Posted base pay" caption, the `🍉 N · Grade`
  badge format, `/yr` and `/mo` waterfall values, the "Saved searches" group, `Board slug`, `/add board/i`),
  `test/e2e/desktop-qa.e2e.js` ("· N in title", Highest pay order, D-10, D-12), `test/freshness-policy.test.js`
  (`HOUSEHOLDS` and `JUICE_GRADES` literals) and `scripts/refresh/jobs.js` (`SENIORITY_ORDER` equal to the ladder).
- No skills or external documentation were used.

## 3. Decisions and rationale, per finding
Line numbers are `public/app.js` unless named.

1. **P-1 On-target earnings** (`isOte`, `OTE_LABEL` :140).
   - *Root cause:* the pay caption was a constant ("Posted base pay…"), and the stats median, percentile and
     distribution pooled every posting.
   - *Fix:* the drawer caption reads "On-target earnings (base plus commission at target). Equity isn't
     included." (:3088). The card's first keyword slot shows a monochrome "On-target earnings" tag and the pay
     pill carries the full label as its tooltip and in the card's spoken name (`payPill` :2554); a tag is a
     slot the card already has, so no new row. "+ bonus mentioned" is not shown on OTE pay (its tooltip would
     be false). The Juice block says "The pay is on-target earnings, so this assumes commission at target", and
     the Gross row says the same. OTE is never pooled with base pay: the stats median leaves it out (and says
     so in the tooltip), or is labelled "median on-target earnings" when nothing else is left (`stats` :761);
     the percentile and the distribution compare OTE only with OTE (`payPool` :2675).
2. **P-2 Drawer estimate** (`compstimateBlock` :3002).
   - *Root cause:* the block built its own "Senior · London" parts from the job, and printed the accuracy line
     even at low confidence (with a bold "Low confidence." in front of "Typically within ±8%").
   - *Fix:* the basis line is `est.basis` (or `est.basisLine`) when the estimates lane returns one, else
     "Based on N similar roles at <Company>" with no level or place of its own. No accuracy line unless the
     shown confidence is Medium or High. The label reads "Pay estimate" (I-3). The "≈ $X ($L–H, … confidence)"
     and "Based on N" shapes stay, so the existing Compstimate e2e parser still reads it.
3. **P-3 Level not stated** (`senLabel` :74, `SENIORITY_SHOWN` :73).
   - Cards, the drawer badge, the Seniority filter and popover, the quick chip, saved-search names and the
     "Same role elsewhere" note use `levelLabel`. The Seniority list puts "Level not stated" last. The ladder
     literal `SENIORITY_ORDER` stays equal to roles.js and chart.js (scripts/refresh/jobs.js checks that), and
     the display order is derived from it. The Seniority list carries one note: "Staff+ means staff, principal
     and above. Director+ means director, head of, vice president and above." (I-3, "explain once").
   - The stored value stays `Mid` (the hash still says `s=Mid`).
   - A "Same role elsewhere" match on Mid reads "roles whose title names no level", never "Mid level".
4. **P-4 Search and sorting** (`queryMatchers` :511, `sortJobs` :718, `effectiveSort` :289).
   - *Root cause:* `titleMatch` and the query filter used `includes`, and title matches were always moved first,
     whatever the sort.
   - *Fix:* a search word matches a whole word with common endings (s, es, ed, er, ers, ing, ings, ship, ships,
     ment, ments), so "intern" finds Intern, Interns and Internship but not International or Internal. A word the
     board never uses on its own (a half-typed "softw") still matches word starts, and a word with symbols
     ("co-op", "c++") matches where it starts. A few level words (intern, senior, staff…) are always whole words.
     The same matcher drives the query filter, "· N in title" and Best match.
   - The default sort is now `best` ("Best match"): with a search it is today's order (title and team matches
     first, each group by pay); without one it is Highest pay, and the option is only in the select while
     searching (no new control). Every sort the person picks is strict, and an explicit "Highest pay" is kept
     in the hash (`sort=salary-desc`). Old links without `sort=` behave exactly as before.
   - Checked against the desktop-qa test's queries: "engineer", "safety" and "sales manager" give the same
     "in title" counts as before at Anthropic, OpenAI and Anduril; "intern" drops 9 wrong Anthropic titles,
     7 at OpenAI and 11 at Anduril.
5. **P-5 Salary box** (`parsePay` :1489, `makeSalary` :1523).
   - Reads "£80,000", "£250,000", "80k", "A$350k", "AUD 350000", "350000 AUD", "80.000 €", "$1.2M", "60000",
     and a bare number under 1,000 as thousands ("400" → $400K). Currency symbols and codes go through the app's
     FX table (`toUSD`, palette.js), rounded to $1K, and the line under the boxes says what it understood:
     "Min: £80,000 ≈ $108K a year", "Min: “400” read as $400K a year", "…, below the lowest pay listed here
     ($100K)". Text it can't read is answered ("“lots” isn't a pay figure…") and the bound is kept.
   - Values below the slider's floor (or above its ceiling) are kept, not dropped to "Any". Dragging the other
     thumb keeps them too.
   - The boxes are labelled "Min $/yr" and "Max $/yr" (the spoken names start with the same words).
   - "N roles that list no pay are hidden while a pay filter is on" (`fc.noPayHidden`, counted in `derive`).
6. **P-6 Stats line** (`stats` :761, `renderKpis` :2040).
   - With a Location filter, a posting's pay counts for "show pay", the median and the middle half only when
     `payLocations(job)` includes a picked place (an Anduril US contractor range listing Sydney no longer makes
     "Sydney $61K"), and the label names the place ("22% show pay for London": OpenAI's London roles mostly
     post US pay for their US offices). "mostly X" only above half of the roles (:2068); it read "mostly Sales"
     at 19%.
7. **P-7 Juice for the place picked** (`shownJuice` :430).
   - With a Location filter, the card badge, the "Most juice" sort, the Juice grade filter and its counts, and the
     drawer use the best Juice among the picked places; a posting with none there shows no badge and sorts last.
     The drawer then falls back to the posting's best place and says "No Juice figure for <places>".
   - "Compare locations" still lists every place (the picked one marked "shown above").
   - Badge tooltips and the drawer headline say the household and place: "$157,100/yr left for a couple in
     Washington, DC". With a Location filter the card's location line puts a matching place first (`locSummary`
     :2489), so a DC list no longer leads with "Huntsville, AL +1".
8. **P-8 Fixed-term pay** (`postedTerm` :126).
   - With `salary.termWeeks`, the card pill shows the posted amount and interval ("$3,850/week"), and the drawer
     "$3,850 a week" with "USD · for about 17 weeks" and "Fixed-term pay, not a yearly salary (as posted: …)".
     No percentile and no company distribution (a weekly stipend annualized is not a yearly salary).
   - Juice says "This pay lasts about 17 weeks, so Juice covers only that term. Tax is worked out as if the pay
     lasted a year, so it may be lower.", and its period switch is Monthly / Whole term instead of Monthly /
     Yearly. The badge tooltip says "(while the fixed-term pay lasts)".
9. **P-12 Saved search "N new"** (`savedViewIds` :1256, `openSaved` :1348).
   - *Root cause:* the menu counts against the search's last opening, the cards against the last visit to the
     company. A visit in between moved the cards' baseline, so "4 new" opened onto no New tag.
   - *Fix:* opening a saved search remembers the ids its count was made of (before the opening resets it), and
     those cards are marked New. While the sort is the default they are listed first, and a toast says "2 new
     roles since you last opened this search — listed first, marked New". The marks stay with that company.
10. **P-15 Couple** (`taxHowText` :2811).
    - The Juice tax row says "Couple here means one earner, married and filing jointly. Joint tax rates are why
      a couple can keep more than one person." (and the matching sentence for single-filer, separate and
      partial bases, and for Family). The household buttons' tooltips say one earner too. The `HOUSEHOLDS`
      literal keeps its keys, labels and bedrooms (freshness-policy test).
11. **P-16 Text bugs.**
    - "≈ $44K–44K": `moneyRange` (:150), `compactRange` and `salaryRange` show one figure when both ends round
      to the same.
    - "0% percentile": the big green number is gone; one sentence remains, plain and not green ("Pays more than
      37% of Anthropic's roles that show pay", "The lowest pay of…", "The top pay of…"), against the same kind of pay
      (`payPool`): internships with internships, OTE with OTE, none for fixed-term pay or stipends.
    - "Revenue · Revenue", "Internships · Internships · Intern [Intern]": `metaParts` (:3033) drops repeats and an
      employment type equal to the level. "Canada · Canada": the country suffix is left off when the place name
      already has it.
    - Chart empty state: one opaque message that names the cause (`emptyState` :2352): the only filter set
      ("No roles match “zzqqxx”", "Clear the search"), or the filter whose removal would show most roles
      ("Without the pay filter there would be 12 roles"). The results list uses the same message. chart.js's own
      note is the viz lane's; it stays covered.
    - Phone drawer: Back reads "‹ Back" (`back-label`, phone CSS), so it no longer looks like the "Previous role"
      arrow beside it. Its spoken name is "Close details, back to the list (Esc)".
12. **P-18 Juice numbers** (`juiceBlock` :2827, `stepMoney` :162).
    - Monthly amounts to the nearest $10 and yearly to the nearest $100; the "Juice left" row is the shown gross
      minus the shown costs, so the rows add up exactly. The tax parts round the same way.
    - The headline follows the period ("$5,430/mo left …").
    - The "Juice left" bar uses the app's money green (`--ms-accent`) instead of the melon red; a negative result
      is red text. No new colour.
13. **I-1 Switching company** (`switchCompany` :1126, `settleKeep` :1133).
    - The search, the pay bounds and every filter value that exists at the new company are kept; the rest are
      dropped, and a toast says "Kept “engineer”, $200K+, London · dropped Sales (not at OpenAI)". Applies to
      the company menu and the recent-company pills. "Add a board" still starts fresh, and the logo still resets.
14. **I-2 What the site is** (`renderTagline` :2074, `#tagline` in index.html).
    - "Pay, and what's left after tax and rent, for 8 companies' open roles": on desktop in the chart toolbar's
      second row, right of Clusters | Ranges and Group (no extra row; two lines at most), hidden in Map and
      Insights. On phones it is the first line above the chart, with "melon·seek" in bold, until a filter is set;
      the melon mark shows in the top bar. Text only, no control. On the beta site the "Beta" pill now sits
      beside that mark on phones too (the second pill by the company menu is gone).
15. **I-3 Plain words.**
    - Stats: "87% show pay", "$352K median", "half between $287K and $411K" (tooltips explain each).
    - Clusters / Ranges: explained in their tooltips (the labels stay; ui.e2e.js finds them by name).
    - Juice: no "≈" before a score (the tooltip says "some costs estimated"); the grade scale in dollars
      ("Juicy: $96K or more a year · Ripe: $48K–96K · Dry: under $48K · Rind: nothing left", from palette.js
      `juiceNetForScore`) above the cards the first time they show Juice in this browser (`juiceScaleNote`
      :2456), and in every badge's and the drawer score's tooltip. Tax parts: "income tax · state or local tax ·
      social security".
    - Ages: "Listed 12 days ago", "Listed 16 months ago", "Always-open posting" from two years (`ageText` :2531);
      the drawer says "Always-open posting: listed 13 years ago (Jan 31, 2013)".
    - Employment types: "International (employer of record)", "Not stated" (`empLabel` :86).
    - Company menu (`makeCompanyMenu` :1180): "Saved searches", then "Companies" by name and "Your boards"; no
      GREENHOUSE / ASHBY / LEVER headings and no slugs. Title "Choose a company or a saved search".
    - Add a board (`makeBoardForm` :1981): one intro line, sources shown with their web addresses, the slug
      field explained ("The company's name in its job-board address: boards.greenhouse.io/name"), and a pasted
      link picks its own source. The "Board slug" and "Source" labels stay (ui.e2e.js finds them).
    - Apply: "Apply on Anthropic's careers site", host underneath as before.
    - Not mine: "(update due)" and "FX" come from freshness.js (viz lane).
16. **I-4 Saved searches** (`rememberView` :3725, boot :3699).
    - Save keeps its word on phones. The toast says "Saved in this browser. Find it in the company menu, with its
      new roles", and the button's tooltip says the same.
    - A visit with no link reopens the last company, filters, sort and view (not the open role), with a toast
      when that is not the plain first company.
17. **I-5 Phone quickbar** (styles.css phone block).
    - Active chips come first and scroll back into view when they change; an active chip drops its caret; the
      Filters chip shows its icon and count while filters are on (spoken "Filters, 2 on"); "Clear all" is the
      filter sheet's Reset on phones; the row fades at its right edge instead of cutting a chip.
18. **I-6 Location list** (`makeChecklist` :1699, `placeCover` :542, `coveredBy` :554, `coverLoc` :564).
    - The collapsed list shows the places with the most roles, still grouped by country (London 47 is no longer
      behind "Show all 27" while Austin 3 shows).
    - A city pick also finds postings that list only its country or region ("United Kingdom", "Ontario,
      Canada"), and remote-only postings in its country ("Remote (Canada)" with no city). A posting that names a
      city and also "Remote (US)" is not spread over every US city: that read as "Austin 55" for 3 Austin roles.
      The city's count includes what a pick finds, so a pick gives its count; the extra postings are added only
      to cities other roles list, so the list gains no new places. One note under the list says so ("A city also
      finds roles that list only its country or region, and remote-only roles in its country."). A country-level
      pick is unchanged. Anthropic: San Francisco 477 → 492, Austin 3 → 18, Cohere Toronto 51 → 68.
19. **I-7 125% zoom** (styles.css).
    - The Chart / Map / Insights words stay down to 861px (the icons go first). "Add board" is never a bare "+":
      below 1361px the button hides and "Add another company's board…" in the company menu remains.
    - Every 10–11.5px size in styles.css is 12px (counts, badges, tags, ages, axis, captions), except the "/"
      key hint.

### Card density
The level and age are now words, so the card foot keeps one line by showing fewer keyword tags when they would
wrap (`footTags` :2516). `measureCardFit` (:2511) reads the results column's width once per list render (about
6.3px per character at 12px). In the 861–1299px column the age moves under the pay pill, beside the title's
second line ("4 months ago", the full "Listed …" in its tooltip). The ROADMAP allows "up to 2" keyword tags, and
the card has no new row. Measured on the first 30 cards of Anthropic and Anduril: no foot wraps at 1440, 1366,
1280, 1152, 1024 or 390px (before the change: 4 to 7 of 30 wrapped at 1280 and below).

## 4. Replayable steps
1. Worktree setup (wave instructions): `ln -s /home/user/melon-seek/node_modules node_modules`,
   `mkdir -p data && ln -s /home/user/melon-seek/data/snapshots data/snapshots`.
2. Baseline: `npm test` (600/601; the one failure is `local beta data is gitignored`, caused by the required
   `data/snapshots` symlink: git refuses `check-ignore` beyond a symlink), `npm run build`, then
   `NODE_PATH=<scratch>/pw/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/e2e.js`
   (101/104, 1 failed, 2 skipped; the failure is `API: /api/jobs?company=anduril returns valid Job[]`, an
   implausible Anduril salary in today's snapshot, the pay-data lane's).
3. Tests first: `test/e2e/fix-app.e2e.js` (22 tests). To see them red, a scratch copy of the repo with the base
   `public/app.js`, `index.html` and `styles.css` (`git show HEAD:<file>`) ran
   `node scripts/e2e.js --grep="Fix app"`: 0 passed, 21 failed, 1 skipped (the static test, no dist).
4. Fixes as in §3, then `npm run build` and `node scripts/e2e.js --grep="Fix app"`.
5. Screenshots: two servers (`PORT=5391 node server/index.js` in the worktree, `PORT=5392` in the scratch copy
   with the base shell; pids in `<scratch>/fix-app/*.pid`), then `node <scratch>/fix-app/shots.mjs <url>
   before|after`, which injects the same fixtures, and `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-app`.
6. Full checks: `npm test`, `npm run build`, the full e2e suite; the static `/melon-seek/` and `/melon-seek/beta/`
   with `node scripts/cycle/serve.mjs --dist dist --pid <scratch>/fix-app/serve.pid`.

## 5. Verification
- **Red first:** the 22 new tests against the base shell (a scratch copy with `git show HEAD:` app.js,
  index.html and styles.css): 0 passed, 21 failed, 1 skipped (no dist in the copy).
- **`npm test`:** 599/601. The two failures:
  - `local beta data is gitignored` fails before and after: git refuses `check-ignore` beyond the
    `data/snapshots` symlink the wave asks for. Not this lane's.
  - `first company loads do not block the event loop (PERF-1)` is a timing test (server side); it passes alone
    (`node --test --test-name-pattern=PERF-1 test/perf.test.js`).
  - Earlier full runs also flaked `households: …` (a 50 ms `vm` timeout in `extractConst`) and V15 under load;
    both pass alone.
- **Full e2e** (`node scripts/e2e.js` after `npm run build`): 123/126 passed, 1 failed, 2 skipped. Baseline:
  101/104, 1 failed, 2 skipped. The one failure is the same before and after: `API: /api/jobs?company=anduril
  returns valid Job[]` (one implausible Anduril salary in today's snapshot, pay-data data). The skips are the
  same (D-11 "Newest" with listing dates present; methodology screenshots without `E2E_SHOTS`). All 22
  `Fix app:` tests pass, and every existing UI, desktop QA, mobile QA, badge, Compstimate and methodology test
  still passes (the "Saved searches" group, the "Posted base pay" caption, `/yr` and `/mo` values, the badge
  format, "· N in title", D-10, D-12).
- **Static, both targets:** the `Fix app: static build` test serves `dist/` and checks `/melon-seek/` and
  `/melon-seek/beta/` on desktop and phone (search, tagline, level label, the logo and one "Beta" pill on the
  beta phone, no console errors). Also served with `node scripts/cycle/serve.mjs --dist dist`, no console
  errors on either.
- **Screenshots** (`docs/screenshots/fix-app/`, `<name>-before.png` from the base shell with the same
  fixtures, `<name>-after.png` from this one; 1440×900 desktop, 390×844 phone at 2×):
  - desktop-cold, phone-cold, zoom-125 (1152 px), stats-sydney: tagline, plain stats line, logo on the phone,
    labels at 125% zoom, US pay no longer a Sydney figure.
  - search-intern, search-newest: whole-word search, strict Newest while searching.
  - salary-typed-gbp, salary-typed-400: the salary box reading £ and "400", the no-pay note.
  - seniority-popover, location-popover: "Level not stated" last with the one-line explanation; London in the
    collapsed list.
  - company-menu, add-board: plain company menu and board form.
  - cards-ote, drawer-ote: on-target earnings on the card, pay block and Juice (fixture).
  - cards-fixed-term, drawer-fixed-term: "$3,850/week", "for about 17 weeks", Monthly / Whole term (fixture).
  - drawer-juice-couple-monthly: $10 rounding that adds up, the joint-filing note, green bar, household and place
    in the headline.
  - drawer-estimate: "Pay estimate" with no accuracy claim at low confidence.
  - juice-location-cards, juice-location-drawer: Anduril, Washington, DC + Reston, Most juice.
  - empty-search, phone-drawer, phone-quickbar-filters, switch-company: one empty message, "‹ Back", active
    chips first, the kept/dropped toast.
  - static-melon-seek-{desktop,phone}, static-melon-seek-beta-{desktop,phone}: the static builds.
  - Shrunk with `bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-app`.
- **No regressions at 1440×900 and 390×844:** compared the before and after shots; cards keep three rows,
  no horizontal scroll (the I-7 test checks 1152 px, the existing 1280 dark test still passes).

## 6. Known gaps and follow-ups
- **The pay-data fields are fixtures here.** `salary.kind === 'ote'` and `salary.termWeeks` come from the
  pay-data lane; the P-1 and P-8 tests inject them into `/api/jobs`. After integration, check the real Anthropic
  sales and Fellows postings, and that the static bundle (packed format) carries both fields.
- **Other lanes' parts of the same findings:** "Same role elsewhere" still compares on-target earnings with
  base pay and falls back across levels (estimates lane, P-1 and P-11; its app.js patch can replace the
  "Too few postings at this level elsewhere" sentence with the reason `compsForJob` returns). The drawer prints
  `est.basis` when the estimates lane returns it. The chart's own empty note, the chart's level order,
  "(update due)" and "FX" are the viz lane's.
- **The Juice score of fixed-term pay** is still worked out from a yearly figure (server/juice.js); the app says
  so and shows Monthly and Whole term, but a term-based score would need juice.js to read `termWeeks`.
- **Ladder literal:** `SENIORITY_ORDER` in app.js stays equal to roles.js `SENIORITY_LADDER` and chart.js
  (scripts/refresh/jobs.js checks all three). If another lane moves "Mid" last in its ladder, change the app.js
  literal in the same batch; the filter's display order is derived and needs nothing.
- **Clusters and Ranges** keep their names, explained in tooltips; renaming them would need ui.e2e.js's
  `viewBtn` changed in the same batch.
- **Location coverage** includes remote-only postings in the city's country. If the lead prefers stricter city
  counts, drop the `l.remote` branch of `coverLoc`.
- **Card tags** use a character estimate of width (no layout measurement per card).
- No patches were needed for files other lanes own; the only change outside the three owned files is the one
  registration line in `scripts/e2e.js`, as the wave instructions say.

## 7. Change log
- 2026-10-10: all findings in the brief fixed in the app shell; 22 e2e tests; before/after screenshots.
