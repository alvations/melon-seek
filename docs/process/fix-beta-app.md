# Process log: fix-beta-app

The app shell lane of the beta fix wave (2026-10-10). It fixes the beta QA findings whose cause is in the
app's own files, for target `beta`, without changing the main site's look.

## 1. Brief
- **Prompt:** [prompts/fix-beta-app.md](prompts/fix-beta-app.md), saved verbatim.
- **Goal:** fix D-18, D-19 / M-22, D-21 (display), D-23 (app side), D-25 / M-21, D-26, D-27, D-28, M-19, M-20,
  M-23 (app side), M-24, M-25, M-26, M-27, shared decisions 1 to 3 and the DQ-11 label, from docs/QA.md "Full QA
  pass (desktop, beta) 2026-10-10" and "Full QA pass (mobile, beta) 2026-10-10" and docs/process/data-check-beta.md.
- **Files owned:** `public/app.js`, `public/index.html`, `public/styles.css`, `public/features/**` (here
  `roles.js`, `compstimate.js`, `features.css`), and this lane's new tests.
- **Worktree:** `/home/user/melon-seek/.claude/worktrees/agent-a8679f7a12c6c6c9a`, from `8c598c2`.

## 2. Inputs and sources
- `docs/CONTRACT.md` (v3: the beta channel; "The stable site does not link to the beta site"; v4: levels).
- `docs/strategy/ROADMAP.md` §8, the UI simplicity budget: no new main-view control, cards get no new rows.
- `docs/process/PLAYBOOK.md` (stage 2 rules, worktree lanes, known traps) and `docs/process/TEMPLATE.md`.
- `docs/QA.md`, both beta sections, and their red tests: `test/e2e/beta-desktop-qa.e2e.js`, `test/e2e/beta-mobile-qa.e2e.js`.
- `docs/process/data-check-beta.md` DQ-11 (talent pools). No DQ test belongs to this lane: every red DQ test is
  server-side (pay, sources).
- Code read before changing it: `public/app.js` (all of it), `public/features/roles.js`, `compstimate.js`,
  `comps.js`, `public/api.js` (unknown-company errors, the packed list format), `public/viz/chart.js`
  (seniority keys), `public/viz/viz.css` (M-8 hit areas), `scripts/build-static.js` (beta markup),
  `scripts/refresh/jobs.js` (the ladder check that reads `SENIORITY_ORDER` in app.js).

## 3. Decisions and rationale
1. **Shared decision 1, `displayLevel(job)`** (`public/features/roles.js:340`). It returns `NOT_STATED`
   (`'Not stated'`) for a stored `'Mid'` whose `seniorityBasis` is `'default'` or missing, and the stored level
   otherwise. `levelLabel('Not stated')` is "Level not stated" and `levelLabel('Mid')` is "Mid", as the lead set.
   `DISPLAY_LEVEL_ORDER` is the ladder with "Mid" in place, then "Not stated" last. `SENIORITY_DISPLAY_ORDER`,
   `LEVEL_NOT_STATED` and every other export keep their values. `levelStated()` stays false for `'Mid'`: market
   comps cells are by stored level, where "Mid" is mostly the default, so it is not a comparable level.
   - Used by the cards, the drawer, the Seniority filter and its quick chip, saved-search names, "Kept … /
     Dropped …" after a company switch, and the Pay estimate's Level select and filters (`compstimate.js:590`,
     `:620`, `:776`, `:884`). The estimate itself still weighs stored levels: "Level not stated" is asked as the
     stored `'Mid'`, as before.
   - **The link keeps `s=Mid` for "Level not stated".** `levelKey()` and `levelFromKey()` in roles.js (new
     exports) do this, used by `parseHash` and `serialize`. Earlier links, saved searches and the remembered
     last view all used `s=Mid` for that option, and `test/e2e/fix-app.e2e.js` checks it.
     - A stated mid level is `s=Mid-level`; `s=Unspecified` reads as "Level not stated".
     - Inside the app the values are `displayLevel()` values.
     - The Pay estimate's Level select uses the same values, so a stored level ('Mid') still selects "Level
       not stated" there. `Compstimate: T15` picks the select by the stored level.
   - `SENIORITY_ORDER` in app.js is unchanged, because `scripts/refresh/jobs.js` checks it against the ladder.
   - **The chart (platform lane)** must group by `displayLevel(job)` too. I wrote that as a patch, see §6.
2. **Shared decision 2, pay by level** (`app.js:3228–3248`). With two or more `salary.levels`, the pay block
   says "Pay by level: Level 2: $184K–287.5K · Level 3: $224K–356.5K" under the range, and "Multiple pay zones" is
   not shown for that posting. A level's ends keep a half thousand the posting states ("287,500 USD" is
   $287.5K, as in the lead's example); whole thousands read "$184K". Labels are shown as the pay lane gives
   them. Fixed-term pay shows no level line. This adds no section and no label to the pay block.
3. **Shared decision 3, the Beta tag** (`index.html:52`, `styles.css:1269–1277`, `app.js:4019`). The tag is now a
   real link, `<a class="beta-tag">Beta</a>`, placed by the logo where the CSS pill was. It is in
   `index.html` with `hidden` and no `href`, so the main site has no link to the beta site (CONTRACT v3) and
   nothing visible changes there. On the beta copy, CSS shows it from the first paint and `markChannel()`
   gives it the main site's address. Its name is "Beta site. Go to the main melon·seek site", and its tooltip
   says what the beta adds. The tab title reads "melon·seek beta — job boards, plotted by salary" and the logo's
   name "melon·seek beta home". No other control was added.
   - The old pill was CSS content, `.brand::after`. `[M-27]` looked for that content, so its lookup now also
     accepts the `.beta-tag` link (visible, text "Beta"). Every other check in that test is unchanged.
4. **D-18: what a saved search has seen** (`app.js:1327–1368`). A search with fewer than 2,000 matches keeps
   their ids in `seen`, as before. Two existing tests edit that list, and it is exact. A bigger one keeps
   `seenHash`: the 32-bit FNV-1a hash of each id, sorted, as base64. That is about 5.5 characters a role, so
   Apple's 6,105 take 33 KB. A collision (about 1 in 700,000 a role at 6,000 matches) hides one new role. An old
   list of exactly 2,000 ids was cut, so it counts nothing new until the search is opened again. Alternatives:
   - a first-seen time per role needs the history ledger, which the beta has none of (`history 0 open`);
   - a Bloom filter is smaller, but its 1% error is worse.
5. **D-19: one origin, two sites.**
   - `CHANNEL` comes from `<html data-channel>` (`app.js:27`). A new saved search records its site. An older
     one is listed only where its company is listed (`savedHere`, `app.js:1314`).
   - The last view key is per site (`app.js:4063`).
   - An "Unknown company" 404 is a new state, `'unknown'`, not `'error'` (`app.js:820`). There is no badge, no
     Refresh and no Retry. The chart area says "This board isn’t on this site. melon·seek doesn’t list Meta’s
     jobs here. Choose a company from the menu.", and its button opens the company menu.
   - The company button shows "Meta", not "meta", and the menu no longer lists the unlisted company.
   - **No link to "the right site":** on the main site the right site would be /beta/, which CONTRACT v3
     forbids. The main site also cannot know which slugs are beta ones, by design. On the beta site every main
     site company is present, so there is never a site to link to.
   - The paused companies' reason ("their terms bar automated collection") would need data from the build;
     see §6.
6. **D-23** (`app.js:1804–1807`): the no-country group ('ZZ', which Intl names "Unknown Region") reads "Other
   places" and goes last. The raw names in it ("Republic of", Hebrew abbreviations, "BG") are the sources lane's.
7. **D-25 / M-21** (`app.js:1215–1254`): on the beta site the company menu lists "Big tech" first (the
   `live: false` careers-site boards), then "More companies". The main site keeps its single "Companies" list.
   When the menu opens it scrolls the current company (✓) into view inside the list, never the page.
8. **D-26** (`app.js:1048`): the top-bar Refresh is hidden on a snapshot-only board, as the badge popover's
   Refresh already was. It is also hidden for an unlisted company. Hiding was chosen over disabling because a
   disabled button's tooltip is not reliable.
9. **M-19** (`app.js:2556`, `renderResults`): a new result set (a sort, filter, area or board) starts at the
   top. The list compares a signature of the result ids. The same set re-rendered (a view switch, a household
   change, the live board replacing the snapshot) keeps its place and its loaded pages. Setting `scrollTop`
   while a touch fling is still running let the fling carry on from the top (626 px in one run), so `toTop()`
   sets `overflow-y: hidden` for one frame, which ends the fling on iOS and Chrome.
10. **M-20, the windowed list** (`app.js:2562–2713`).
    - **Window.** Up to 150 loaded cards are all kept in the page, as before, so find in page and the usual
      desktop list are unchanged. Beyond that the page keeps the cards within a screen (at least 600 px) of the
      view, and at least 120 of them, between two spacer `li`s that stand for the cards above and below.
    - **Spacer heights.** Cards are measured as they are added, as fractional heights; rounded ones would shift
      the content under a scroll. An unmeasured card counts as the average. A resize clears the heights and
      measures the shown cards again.
    - **Paging.** `resultsLimit` is still the loaded count: "Show N more of M" (now with thousands separators)
      and the phones' lazy loading (4 cards a frame) add to it.
    - **Keyboard.** The arrow keys move by result (`focusResult`) and bring a card back into the page if the
      window left it out. A focused card that leaves the page hands focus to the list; ArrowDown/Up from there
      go on from the first card in view.
    - **Drawer.** Closing it returns focus to its card, bringing the card back if needed.
    - **Screen readers.** Cards carry `aria-posinset` and `aria-setsize` (the whole result count). The note,
      spacers and "Show more" `li`s are `role="none"`.
    - **Why 120.** A guard test (`Beta mobile QA: … the list lazy-loads past the first page`) counts cards in
      the page, so the window never holds fewer than the first page. 120 cards is about 3,500 page nodes, against
      30,585 before.
11. **M-23** (`app.js:2934`, `:989`): "1 of 6,105" and the company count "6,105". The same goes for Market insights
    ("3,848 of 6,105", skill and department counts) and every `plural()` in features/ (`shared.js:199`
    `fmtCount`). The filter checklist counts stay bare numbers, because tests read them as numbers. The map
    pins' "999+" is the platform lane's.
12. **M-24** (`app.js:3761`): on phones a field in the filter sheet or a popover moves to the top of its own
    scrolling panel, 8 px down, instead of `scrollIntoView({ block: 'center' })`. The page never scrolls, and
    the matches show above the keyboard.
13. **M-25** (`styles.css` phone block, `features.css:464`): the filter sheet's Remote segment, the Juice "How
    it’s calculated" link, and the Market insights rows and chips are 44 px tall on phones only. M-8's Pay|Juice
    switch and Remote badge already take 44 px taps through `::after` areas in `viz.css`; QA measured their
    visible boxes. No change was needed.
14. **M-26** (`app.js:3785`): the Filters button opens the sheet at its top, where focus goes (Salary). A
    chip still opens it at its own section, with focus there (M-11).
15. **M-27** (`styles.css`, the beta fix wave block). The beta phone top bar is logo · Beta tag · company ·
    badge · theme, as I-2 (batch 1) wants, and `Fix app: static build` checks the logo at 390 px.
    - The tag keeps its pill size and takes taps over 44 × 44 px (`.beta-tag::before`).
    - On the beta site only:
      - the data badge keeps its short "● Oct 10" up to 440 px, so "Netflix" is whole at 430 px;
      - at 379 px and below the tag leads the row instead of the logo, so "Microsoft" is whole at 360 px.
    - At 390 px "Microsoft" fits beside the logo.
    - On the main site the logo keeps its look and takes taps over 34 × 44 px (`.brand::before`), with no layout
      change.
    - `test/e2e/fix-app.e2e.js` (static build) counted CSS-content pills. It now also counts the visible
      `.beta-tag`. Its other checks are unchanged.
16. **DQ-11** (`app.js:2825`, `:2859`, `:3426`): `job.pool === true` (from the sources lane) shows "General
    application (no specific opening)":
    - on the card, in the keyword slots, with no "Level not stated" badge;
    - in the card's accessible name;
    - in the drawer, as a line under the title: "… The company collects applications here for roles that may
      open later; it is not one specific job."

    A pool card with a stated level, Juice and an age can wrap its foot to a second line. Only about 61 postings
    are pools.

## 4. Replayable steps
```bash
WT=/home/user/melon-seek/.claude/worktrees/agent-a8679f7a12c6c6c9a; SP=<scratchpad>/fix-beta-app
cd "$WT" && ln -s /home/user/melon-seek/node_modules node_modules
mkdir -p data/beta && ln -s /home/user/melon-seek/data/snapshots data/snapshots && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots
node scripts/build-static.js --out "$SP/dist-before"            # before the changes (2.5 min)
PORT=5401 node scripts/cycle/serve.mjs --dist "$SP/dist-before" --pid "$SP/serve-before.pid" &
node "$SP/shots.mjs" http://127.0.0.1:5401 before docs/screenshots/fix-beta-app
# ... edits ...
node scripts/build-static.js                                     # the worktree's own dist/ (the e2e suites read it)
PORT=5402 node scripts/cycle/serve.mjs --dist "$WT/dist" --pid "$SP/serve.pid" &
node "$SP/shots.mjs" http://127.0.0.1:5402 after docs/screenshots/fix-beta-app
node "$SP/sync.mjs" "$WT"     # after an app-only edit: copy public/ files the build copies verbatim into dist/ and dist/beta/
NODE_PATH=<scratchpad>/pw/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/e2e.js --grep='^(Fix beta app|Beta (desktop|mobile) QA)'
NODE_PATH=... node scripts/e2e.js                                # the full suite
mv data/snapshots data/beta/snapshots aside; npm test; move them back   # CI-like unit run (see §5)
git apply docs/process/patches/fix-beta-app-chart-displaylevel.diff     # to check the integrated state, then git apply -R
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix-beta-app
```
`shots.mjs` injects the other lanes' fields (`salary.levels`, `job.pool`, `job.seniorityBasis`) into the NVIDIA
list with a Playwright route, using `public/api.js` `unpackJobs`, so "before" and "after" show the same postings.

## 5. Verification
- **npm test**, with the snapshot symlinks moved aside (as CI runs it): **682 pass, 1 fail, 22 todo, 7 skipped** (712).
  - The one failure is `test/fix-viz.test.js` "[P-3] chart: the default level reads "Level not stated" and sorts
    last". `public/viz/chart.js` still labels the stored level, and `levelLabel('Mid')` is now "Mid" (shared
    decision 1).
  - With `docs/process/patches/fix-beta-app-chart-displaylevel.diff` applied, it and every other chart test pass
    (`fix-viz`, `refresh-jobs`, `features`: 95/95).
  - With the real snapshots linked and the machine at load 8, the tests that run a whole build inside a
    120 s timeout (links-policy, perf-mobile, static-build, freshness-policy) time out. With
    `MELON_BETA_SNAPSHOT_DIR` set to an empty folder they all pass. The cause is the environment, not this change.
- **This lane's tests:**
  - `test/fix-beta-app.test.js`: 6/6.
  - `test/e2e/fix-beta-app.e2e.js`: 11/11 (registered in `scripts/e2e.js`).
- **The QA agents' red tests** (`--grep='^Beta (desktop|mobile) QA'`, worktree build):
  - **Now pass:** [D-18], [D-19], [D-25], [D-26], [D-27], [D-28], [M-19], [M-20], [M-21], [M-22], [M-24],
    [M-25], [M-26] and [M-27].
  - **Still fail, other lanes:**
    - [D-20] server (sources/platform);
    - [D-21] needs `salary.levels` in the data (the pay lane). `Fix beta app: [D-21]` shows the rendering with
      injected levels;
    - [D-22] pay (currency);
    - [D-23] raw names from the data ("Republic of", Hebrew abbreviations, "BG"; the sources lane). The
      "Unknown Region" part is fixed;
    - [D-24] Google departments (sources);
    - [D-29] chart tooltip (platform);
    - [D-30] pay zones (pay);
    - [M-23] the map pins' "999+" (platform). Its "1 of 6,105" part passes.
  - D-17 passes already on this data.
- **Full e2e suite** on the committed state (`node scripts/e2e.js`, the worktree's fresh build): **182/195 passed,
  10 failed, 3 skipped.**
  - 8 are the other lanes' red tests above.
  - 2 need the chart patch (§6): `Desktop QA: [D-9]` and `Fix viz: [P-3]`. Both pass with it applied, as do
    `Fix beta app: [shared decision 1]` and `Beta desktop QA: Apple (6,105 roles)`.
  - The run before it (180/195, load 6 to 12 from the other lanes) also had two more failures:
    - `Compstimate: T21`, a timing test, which passed alone 3/3;
    - `Beta mobile QA: Apple results sheet … lazy-loads …`, which passed alone 3/3.
  - That second failure showed a real timing trap:
    - with the window, a fling now runs its natural ~2 s, because cards no longer pile up;
    - before, it hit the end of the loaded list within 0.1–0.7 s (`probe-fling.mjs`);
    - so the test's Map tap, 0.5 s after the last swipe, fell during the fling, and Chromium suppresses that
      tap, as phones do;
    - the test now waits for the list to stop scrolling before it taps.
  - The same change measures card heights with `getBoundingClientRect` (fractional) instead of `offsetHeight`.
  - After both changes the three beta groups ran 36/44; the 8 failures are the other lanes' red tests.
  - Skipped: `Desktop QA: [D-11]` (this data has listing dates), the methodology screenshots (need `E2E_SHOTS=1`)
    and `Fix app: [P-2]` (no estimate for the sampled role).
  - The first full run, before the last fixes, was 179/195. It also had `Compstimate: T15`, fixed by the select
    values (§3.1), and `Fix app: static build`, fixed by the M-27 layout (§3.15).
  - Every run rewrote the UI suites' own screenshots (`docs/screenshots/*.png`, `qa-mobile/`, `qa-mobile-beta/`).
    They were restored, so this lane commits only `docs/screenshots/fix-beta-app/`.
- **Screenshots** (`docs/screenshots/fix-beta-app/`, each as `<name>-before.png` and `<name>-after.png`):
  - D-18-saved-search-menu, D-19-main-site-company-menu, D-19-main-site-apple-link, D-19-beta-paused-meta,
    M-22-paused-amazon-390;
  - D-21-nvidia-two-levels, DQ-11-pool-drawer, DQ-11-pool-card, level-mid-stated-card, level-seniority-filter;
  - D-23-location-other-places;
  - D-25-company-menu, M-21-company-menu-390, M-21-company-menu-360;
  - D-26-D-28-beta-topbar, main-site-topbar;
  - M-19-sort-while-scrolled-390, M-23-job-page-counter-390, M-24-keyboard-location-search-390,
    M-25-remote-segment-390, M-25-insights-rows-390, M-26-filters-after-chip-focus-390;
  - M-27-topbar-360-microsoft, M-27-topbar-430-netflix, M-27-topbar-390-apple, main-site-topbar-390;
  - regressions: regress-{main,beta}-{1440,390}-{light,dark}.
- **Manual checks:**
  - beta top bar at 1024 and 1280 (dark), at 800 and in 844x390 landscape: no horizontal scroll, the name whole;
  - the desktop windowed list: Show more ×3, then a scroll to 5,000, 15,000 and 30,000 px and to the end puts
    results 44, 133, 266 and 414 at the top, as the average card height predicts;
  - 200 ArrowDowns and back; a sort resets the list to the top; a view switch keeps the place.

## 6. Known gaps and follow-ups
- **Patch for the platform lane:** `docs/process/patches/fix-beta-app-chart-displaylevel.diff`.
  - `public/viz/chart.js`: `keyOf(job, 'seniority')` returns `displayLevel(job)`, `SENIORITY_ORDER =
    DISPLAY_LEVEL_ORDER`, and the Ranges tooltip uses `levelLabel(displayLevel(j))`.
  - `test/fix-viz.test.js`: the P-3 test is updated to the shared decision.
  - Until it lands, Group by Seniority labels the default 'Mid' row "Mid", and that one filter dot's colour
    differs from the chart's.
- **The packed list format** (`scripts/build-static.js` `packJobs`, platform lane) already carries `salary.levels`,
  `job.pool` and `job.seniorityBasis` (read, not run, on this data).
  - It keeps every job field it doesn't fold.
  - It stores a salary as an object when its keys differ from `shared.salaryKeys`.
  - Worth one look at the integrated build: one NVIDIA posting with levels in `dist/beta/api/jobs/nvidia.json`.
- **The paused companies' reason:** the build could list `paused` built-ins (for example in the beta
  `api/companies.json` with `paused: 'terms'`, filtered out of the menu). Then the message could say why Amazon
  and Meta aren't collected. The app shows the plain message today.
- **Old shared links with `s=Mid`** still mean "Level not stated", by design (see §3.1).

## 7. Change log
- 2026-10-10 14:40 UTC: worktree set up at `8c598c2`; before build and screenshots.
- 2026-10-10 15:00: displayLevel and the level surfaces; D-18, D-19, D-21, D-23, D-25, D-26, D-27/28, DQ-11.
- 2026-10-10 15:10: M-19, M-20 (windowed list), M-23, M-24, M-25, M-26, M-27; lane tests.
- 2026-10-10 15:20: the window keeps at least 120 cards (the lazy-load guard); M-19 ends a running fling.
- 2026-10-10 15:55: first full e2e run (179/195). The Level select keeps `levelKey` values (T15). Market
  insights counts get thousands separators. The beta phone row keeps the logo at 390 px and up (`Fix app:
  static build`), with the short badge up to 440 px.
- 2026-10-10 16:30: final build and full run (180/195). Card heights are measured fractionally. The lazy-load
  guard waits for a fling to end. Screenshots retaken and shrunk (7.7 MB to 2.1 MB), committed.
- 2026-10-10 17:00: full run on the committed state, 182/195 (§5).
