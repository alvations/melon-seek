# Process log: qa-mobile-beta-4 (fourth mobile QA pass on beta)

## State
- **Done (2026-10-17 14:35 UTC):** the whole brief. The lead copies "Section for docs/QA.md" into docs/QA.md.
- **What was done:**
  - phone smoke at all 19 sizes x 7 boards, light (133/133) and dark (133/133);
  - round 3 re-checked: M-33 to M-39 and M-41 to M-47 fixed; M-40's integration cut and UX-39 still open (known);
  - the feature walk at every size;
  - 5 new bugs, M-48 to M-52, each with a red test in test/e2e/beta-mobile-qa-4.e2e.js (registered);
  - findings sent to the lead in two messages;
  - the e2e re-run (346/367, only the known set fails), this pass's group (2/7, exactly M-48 to M-52), `npm test`;
  - the big-board timings again at load 6–9;
  - screenshots pruned to 153 and shrunk to 8 MB.
- **Housekeeping:**
  - The server on port 5471 is stopped by its pid file.
  - `data/snapshots`, `data/beta/snapshots` and `node_modules` are the brief's links, untracked.
- **If resumed:**
  - The probes are in `<scratch>/qa-mobile-beta-4/probes/` (`<scratch>` =
    `/tmp/claude-0/-home-user-melon-seek/b6b764de-866b-5af7-92f3-f582ebca24d9/scratchpad`).
  - The server is `PORT=5471 node scripts/cycle/serve.mjs --dist <scratch>/qa-mobile-beta-4/dist --pid
    <scratch>/qa-mobile-beta-4/serve.pid`.
  - Run one e2e suite at a time (the lead, 13:40).

## 1. Brief
Prompt: [prompts/qa-mobile-beta-4.md](prompts/qa-mobile-beta-4.md) (verbatim).

This is a functional QA pass of the phone beta site (`/melon-seek/beta/`) on 1ef0646, the deployed head. That build
carries fix wave 5: fix-touch-tips, fix-phone-controls, fix-phone-text, fix-phone-sizes, fix-pay-at-place, fix-data-3,
fix-sec-3 and the September FX rates. It answers the user's "The mobile page on the beta site is totally broken" and
"Make sure we check for all phone sizes from iPhone mini to razr to duo or something". No product code is edited.

Files owned:
- this log;
- the prompt;
- test/e2e/beta-mobile-qa-4.e2e.js, and its two lines in scripts/e2e.js;
- docs/screenshots/qa-mobile-beta-4/;
- the "Section for docs/QA.md" at the end of this log. The lead copies it in.

## 2. Inputs and sources
- **Docs read:**
  - README.md, docs/CONTRACT.md, docs/process/{PLAYBOOK,TEMPLATE,mobile}.md;
  - docs/process/lead.md from "The user: The mobile page on the beta site is totally broken" to the end (fix-touch-tips
    and fix-phone-controls integrated; fix wave 5 integrated), and its fix wave 5 data-lane notes;
  - docs/process/qa-mobile-beta-3.md (the whole log and section; its probes are the start of mine);
  - docs/process/ux-review-beta-2.md (the findings table), docs/process/viz-review-beta-2.md (V-33 to V-48),
    docs/REVIEW.md A-8 to A-11 (security-a11y-review-beta-2);
  - the lane logs: fix-phone-sizes (the decisions on landscape, short screens, the name and dual screens),
    fix-phone-text (the under-360 rule: two lines allowed, the lead's decision of 2026-10-16), fix-touch-tips;
  - docs/QA.md "Full QA pass (mobile, beta) 2026-10-16" (the format of my section) and the desktop round-3 section.
- **Highest ID so far:** M-47 (qa-mobile-beta-3). New IDs start at **M-48**.
- **Known and not re-filed** (the lead's list): the viz lane's V-33, V-34, V-38, V-41 to V-48, UX-36, UX-40 to UX-43,
  UX-45, UX-59, D-43, D-44, A-8; fix-phone-sizes' UX-39 and the Amazon department-row cut at 280 to 360 px.
- **Code read for the findings:**
  - public/styles.css:1383 (`.sal-sub`), 1276 (the `(hover: none)` block, the only touch rule above 860 px), 1593
    (dual screens), the `(max-width: 860px)` blocks (the 16 px fields and 44 px controls);
  - public/app.js:3835 (`card`, `.sal-sub`), 4636 and 4784 (`.d-meta` with `.sep` spans), 4773 (the Apply label);
  - test/e2e/phone-sizes.mjs (the 19 sizes), test/e2e/webkit/phone-smoke.mjs, test/e2e/phone-matrix.e2e.js (the
    Duo's hinge emulation).
- **Build:** my own, `node scripts/build-static.js --out <scratch>/qa-mobile-beta-4/dist` from 1ef0646 with the
  2026-10-16 crawl linked in (build 3 min 28 s; 7/7 beta companies; the one warning is Amazon's 6.76 MB list over
  its 1.5 MB budget, known). Served by `scripts/cycle/serve.mjs` on port 5471 with a pid file.

## 3. Decisions and rationale
1. **All 19 sizes for the smoke and the flows, a subset for each bug.** The smoke and `p32-sizes.mjs` cover every
   entry of phone-sizes.mjs. Each red test uses the sizes where its bug shows, so the group stays under 2 minutes a test.
2. **The lane's under-360 rule stands.** Under 360 px a caption may take two lines (fix-phone-text, approved by the
   lead). The filter notes take two lines at 280 px; that is within the rule and is not filed. M-49's test allows two
   lines under 360 px too.
3. **M-52 is Medium.** It is not in phone-sizes.mjs, but an iPhone 15 Pro Max (or Plus) in landscape is 932 (926) CSS
   px wide, so it gets the desktop layout. iOS Safari zooms the page into any focused field under 16 px, and there the
   search, the company search, the sort and every Insights field are 13 to 14 px. The Razr inner landscape and the
   Duo spanned, which are in the matrix, get the same mouse-sized controls (26 to 38 px).
4. **M-50 excludes the sandbox's basemap note.** Every other host is aborted here, so the map shows "Basemap
   unavailable · pins still work" over its middle; real phones show tiles instead. The test and the counts look through
   that note (`elementsFromPoint`), so only the map's own legend and Remote button count. M-50 is Low, because a pan
   uncovers the pin.
5. **One ID per cause.** M-49 covers every board's Apply label (one string, app.js:4773). M-50 covers both the legend
   and the Remote button (one fit rule).
6. **Timings above load 8 are not filed.** The lead asked (13:40) that anything timed above a load of about 8 be
   re-checked on a quieter machine. No bug in this pass rests on a timing. The timings in the section carry their load.
7. **Not filed:**
   - The landscape Map tab is 42x44, and the landscape tagline row takes 40 px. Both were noted in round 3.
   - The sheet handle is 20 to 28 px tall. The header around it takes the same taps and drags.
   - A tap on a map pin that sits under the "Basemap unavailable" note: that note is the sandbox's (decision 4).
   - The Razr cover's Insights area is 134 px, between the two-row top bar and the peek row. The Pay estimate field
     starts half under the peek row; a swipe brings it up, and a tap then lifts it above the keyboard.
   - On Apple at 280x653, one pan from the map's centre (140, 419) did not move it. A pan from other points did, and
     it does on Google. Not reproduced elsewhere.
   - p9's untimed flicks "failing": they are round 3's decision 6 (CDP latency). The timed-flick guard passes.
8. **Screenshots:** the probes write to docs/screenshots/qa-mobile-beta-4/. The test file writes there only with
   `BETA_QA4_SHOTS=1`.

## 4. Replayable steps
All probes are in `<scratch>/qa-mobile-beta-4/probes/`. Round 3's `lib.mjs`, `lib2.mjs` and `p1`–`p18` were copied and
re-pointed at my build. The new ones are `p30`–`p47` and `phone-smoke-dark.mjs`.

1. `git fetch origin claude/stoic-ride-54ddxp && git checkout --detach 1ef0646`, the two data links and the
   `node_modules` link from the brief.
2. `node scripts/build-static.js --out <scratch>/qa-mobile-beta-4/dist` (3 min 28 s at load 1-3).
3. `PORT=5471 node scripts/cycle/serve.mjs --dist <scratch>/qa-mobile-beta-4/dist --pid <scratch>/qa-mobile-beta-4/serve.pid`.
4. `NODE_PATH=<scratch>/pw/node_modules node test/e2e/webkit/phone-smoke.mjs --dist <scratch>/qa-mobile-beta-4/dist
   --sizes all --engines chromium --boards apple,amazon,google,meta,microsoft,nvidia,netflix --out <scratch>/qa-mobile-beta-4/smoke`
   (133 pages, 5 min 43 s, load 3 → 10). The same with `probes/phone-smoke-dark.mjs` (a copy that sets
   `colorScheme: 'dark'` and lists light panels) for dark.
5. The round-3 findings: `node p30-recheck.mjs M-33 … M-47` (one screenshot each), `node p2-preview.mjs slow tap`
   (M-43), `node p4-tips.mjs google|apple` (M-44).
6. The feature walk:
   - `bash run-p6a.sh` and `bash run-p6b.sh`: `p6-smoke.mjs` on 24 board, size and theme runs.
   - `node p32-sizes.mjs`, every size: company menu, badge, More, filter sheet (✕, Back, keyboard), sheet, job page,
     map, Insights with the keyboard, small text and tap targets.
   - `bash run-batch2.sh`: sheet, flicks, filters, chart, Google, memory, keyboard, safe area, landscape.
   - `node p15-saved.mjs`: saved searches and the CSV.
7. Findings:
   - `node p35-pincover.mjs` and `node p34-pins.mjs <slug> <WxH>`: M-50.
   - `node p36-apply.mjs`: M-49.
   - `node p38-sep.mjs 390,360 8`: M-51.
   - `node p40-wide.mjs apple`: M-52.
   - `node p37-remote.mjs <WxH>`: the Remote control.
   - `node p43-duo.mjs microsoft`: the Duo with its hinge.
   - `node p44-menu-kb.mjs <WxH>`: company search with the keyboard up; map pan and pinch.
   - `node p47-chips.mjs`: each chip and the filter sections.
8. Tests: `BETA_QA4_DIST=<scratch>/qa-mobile-beta-4/dist NODE_PATH=<scratch>/pw/node_modules
   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/e2e.js --grep='^Beta mobile QA 4'`. Add `BETA_QA4_SHOTS=1`
   for the evidence screenshots.

## 5. Verification
- **New group `^Beta mobile QA 4`: 2/7 pass**, run alone at load 11–13 (log `<scratch>/qa-mobile-beta-4/e2e-qa4.log`).
  The 2 guards pass; the 5 failures are exactly `[M-48]` to `[M-52]`, each failing for its bug.
- **Round 3 and the lanes' groups: 346/367 pass, 20 fail, 1 skipped** (`<scratch>/qa-mobile-beta-4/e2e-recheck.log`).
  The 20 are the lead's known set (the viz lane's, UX-39, the Amazon department-row cut). All 42 earlier beta mobile
  QA tests pass: round 3's 15 red tests are now green.
- **Phone smoke:** 133/133 light, 133/133 dark.
- **`npm test`:** 1,244 tests: 1,196 pass, 3 fail (load-sensitive timing; pass alone), 45 todo.
- **Screenshots:** docs/screenshots/qa-mobile-beta-4/, 153 files, shrunk 35 MB → 8 MB. The 525 pruned ones are kept
  in `<scratch>/qa-mobile-beta-4/shots-all/`.
- **Rewritten PNGs restored:** the earlier groups' tests rewrote 16 committed screenshots in
  docs/screenshots/{qa-mobile-beta,qa-mobile-beta-2,fix-pay-at-place}/. They were restored with `git checkout`.

## 6. Known gaps and follow-ups
- **No WebKit or real Safari here.** webkit-phone.yml runs on GitHub; the lead sends those results, and they go in
  the section.
- **iPhone Pro Max landscape is not in phone-sizes.mjs.** It is the most common phone screen over 860 px (M-52). Add
  `ios('iPhone 15 Pro Max (landscape)', 932, 430, 3)` to POSTURES.
- **Not testable here:** map tiles, live boards, a real keyboard, and the history ledger's "N new". The seen-list path
  works: "Google · YouTube 3 new".
- **Timings were taken on a busy machine** (load 4 to 27), as decision 6 says.

## 7. Change log
- 2026-10-17 14:35: suites run (this group alone, then `npm test`); screenshots pruned and shrunk; section finished.
- 2026-10-17 14:00: log written; M-52 test added.
- 2026-10-17 13:40: test file with 2 guards and M-48 to M-51; registered in scripts/e2e.js.
- 2026-10-17 13:25: round 3 re-checked; findings sent to the lead.
- 2026-10-17 12:51: started; brief saved; build and smoke.

## Section for docs/QA.md

## Full QA pass (mobile, beta) 2026-10-17

The fourth functional pass of the phone beta site (`/melon-seek/beta/`), by the fourth beta mobile QA agent. It ran on
1ef0646, the deployed head, which carries fix wave 5: fix-touch-tips, fix-phone-controls, fix-phone-text,
fix-phone-sizes, fix-pay-at-place, fix-data-3, fix-sec-3 and the September FX rates. It answers the user (2026-10-16):
"The mobile page on the beta site is totally broken" and "Make sure we check for all phone sizes from iPhone mini to
razr to duo or something". The process log, with every replayable command, is
[`docs/process/qa-mobile-beta-4.md`](process/qa-mobile-beta-4.md). No product code was changed.

**Setup**
- **Build:** my own local build of `1ef0646` (what Pages deployed; the live site is not reachable from the sandbox),
  with the 2026-10-16 crawl and every board whole:
  - Amazon 22,179 postings, Apple 4,851, Google 3,821, NVIDIA 2,711, Microsoft 2,435, Meta 1,208, Netflix 414;
  - Anduril 2,537 on the main site.
  - Served under `/melon-seek/` by `scripts/cycle/serve.mjs` with a pid file.
- **Browser:** Playwright with Chromium 141 (`/opt/pw-browsers/chromium-1194`).
  - Each size's own context from `test/e2e/phone-sizes.mjs`: `isMobile`, `hasTouch`, its DPR, and its iPhone or
    Android user agent. The other probes use DPR 3 with an iPhone UA (Android at 360 px and below).
  - Every request to another host was aborted, so the map has no basemap.
- **Sizes:** all 19 in phone-sizes.mjs, from the folded Fold (280x653) to the Surface Duo spanned (1114x720). That
  includes the Razr cover 352x355 and landscape 667x375, 812x375 and 1005x412, in light and dark. Also the iPhone 15
  Pro Max in landscape (932x430), which the matrix lacks.
- **Gestures:** `touchscreen.tap`, and CDP `Input.dispatchTouchEvent` for drags, swipes and pinch. The Duo's hinge
  was emulated with CDP `displayFeature` at 540–574 px.
- **Load:** other agents ran at the same time (load average 3 to 27 on 4 CPUs). Timings carry their load; none of
  the bugs below rests on a timing.

**WebKit and real Safari** (the lead's run, not this sandbox): webkit-phone.yml run 39034080230 (run 10) on 1ef0646 is
green in every job.
- "Playwright WebKit, iPhone profile":
  - the phone smoke on WebKit and Chromium at every phone size and every big-tech board (page errors and layout);
  - the phone tests, company sheet geometry (fix-company-scroll), floating tips on touch (fix-touch-tips), phone
    controls (fix-phone-controls) and phone text (fix-phone-text), on WebKit and on Chromium for comparison.
- "Safari in the iOS Simulator (real swipes)": the company list swiped on the iPhone 13 mini, 16 and SE, with per-board
  checks.
- [Run 39034080230](https://github.com/alvations/melon-seek/actions/runs/39034080230). Its artifact can't be downloaded
  from the sandbox, so these are the step results.

**New e2e tests:** [`test/e2e/beta-mobile-qa-4.e2e.js`](../test/e2e/beta-mobile-qa-4.e2e.js), registered in
`scripts/e2e.js`.
- Run them with `node scripts/e2e.js --grep='^Beta mobile QA 4'`. `BETA_QA4_DIST=<dir>` points them at another build,
  and `BETA_QA4_SHOTS=1` saves each failing case's screenshot.
- **On my build of 1ef0646: 2/7 pass.** The 2 guards pass: the Razr cover flows, and map Remote at 390, 352x355 and
  280x653. The 5 failures are exactly `[M-48]` to `[M-52]`.

### Is the phone site broken?
No, not on this build, at any of the 19 sizes, in Chromium or (per the lead's run) WebKit and Simulator Safari.
- **Smoke, light:** `phone-smoke.mjs --sizes all --engines chromium` over the 7 big-tech boards gives 133/133 pages ok
  (load 3 → 10).
  - Every page has cards, with no page error, no horizontal scroll and no main control off screen or covered.
  - First cards came in 206 to 1,965 ms (median 519 ms).
  - The only "text cut" lines are chart row names with an ellipsis, such as "Technical Project, Program and Product M…".
    A tap gives the whole name in its chip.
- **Smoke, dark:** the same 133 pages in dark are ok too (load 18 → 24). Every body is `rgb(15, 18, 23)`, and no
  light panel shows.
- **Real flows at every size** (`p32-sizes.mjs`, one board per size; screenshots `size-<WxH>-*`):
  - the company menu switches boards;
  - the badge and the More popover sit on screen;
  - the filter sheet's ✕ and "Show N roles" are on screen, and ✕ and hardware Back both close it with focus on Filters;
  - a filter field typed into stays above a simulated keyboard (42% of the height; 55% in landscape);
  - the sheet goes to full and a card opens its job page;
  - Back, next and Apply are on screen, next goes to "2 of N", and two hardware Backs close the job page;
  - map pins and a pin tap give the area chip;
  - the Pay estimate field rises above the keyboard;
  - no text under 12 px, except M-48.
  - The 1005 and 1114 px screens get the desktop layout, with mouse-sized controls: **M-52**.

### Round-3 findings re-checked (M-33 to M-47)
Screenshots: `docs/screenshots/qa-mobile-beta-4/recheck-M-*.png`.

| ID | Status | Evidence on this build |
|---|---|---|
| M-33 Same role elsewhere captions | **Fixed** | Two lines at 390 and 360 (Amazon, Apple, NVIDIA top roles): "Director+ level in the US" and "Bar: middle half of base pay · Tick: median", each 1 line, 5 and 8 words |
| M-34 Pay estimate card | **Fixed** | "Estimated pay from similar roles", "Most common role · type any title", "Based on 500 similar roles", "Typically within ±10%": all 1 line (Amazon, Google; 390, 360) |
| M-35 Juice explainer | **Fixed** | "🍉 Juice: what's left after tax and rent", 1 line, 7 words, with Details |
| M-36 Filter notes | **Fixed** | "Matches roles whose range overlaps yours", "Also finds roles listed for its country", "What the levels mean", "Grouped by job title": 1 line each at 390 and 360. 2 lines at 280, which the lead's under-360 rule allows |
| M-37 Juice and Listing lines | **Fixed** | "$198,500/yr left for one person in Cupertino", "🍉 No Juice: no cost data here yet", "Open 180+ days", "General application (no specific opening)": 1 line each |
| M-38 Percentile line | **Fixed** | "Pays more than 25% of Amazon's roles" at 360, "Pays more than 20% of Google's internships" at 360 and 390; not cut |
| M-39 Badge popover and More | **Fixed** | Every badge line 1 line (Apple, Amazon, and Anduril with a failed live fetch); More: "2,703 of 4,851 have a Juice Score" |
| M-40 Amazon departments | **Partly** (known) | Told apart at 390 (2 lines each, whole name in the title). At 360, 320 and 280, "Program and Product Management" is cut by 0.42 px or more, and at 280 so are "Fulfillment & Operations" and "& Account Management". This is the lead's known integration cut, assigned to fix-phone-sizes |
| M-41 Insights row names | **Fixed** | No name of 16 characters or fewer is cut (Amazon, Google; 390, 360; 53 rows each) |
| M-42 Card vs job page pay | **Fixed** | Amazon "$60K–129K" with "5 places" under it on the card, "$60K–129K" on the job page; Microsoft "$102K–261K" both |
| M-43 Preview tap feedback | **Fixed** | Slow 4G, 4x CPU: the job page opens 300 ms after the tap, under "Loading 22,179 roles…", and stays when the list lands; tested at every size (fix-phone-controls' tests pass) |
| M-44 Map pin tooltip | **Fixed** | A pin tap selects its area and opens no tooltip (Google, Apple); other tips (comps, Compare, histogram) close on a tap elsewhere and on a swipe; "Tap again to see…" where a tap would switch boards |
| M-45 "Micros…" at 380–392 px | **Fixed** | "Microsoft" whole at 375, 380, 390 and 393 (74.4 px in a 74.4 px box) |
| M-46 Lone "Details" | **Fixed** | `#c=google&l=Buenos+Aires`: "No pay listed" |
| M-47 Landscape keyboard | **Fixed** | The Pay estimate field rises above the keyboard at 844x390, 812x375, 667x375 and 1005x412 |

- **UX-39** (the preview's cards under a collapsed sheet) is still open, known and assigned to fix-phone-sizes. On Fast
  4G at 4x CPU the first screen shows the skeleton chart and "Loading 22,179 roles…" until the list lands at 5.8 s
  (load 5). Screenshot: `preview-amazon-fast-peek.png`.
- **UX review 2 and a11y 2 on this build:**
  - 13 of the 16 `Beta UX review 2` tests pass: UX-35, UX-37, UX-38, UX-44, UX-46 to UX-49, UX-53 to UX-56, UX-58,
    UX-60 and UX-62. The 3 left are UX-39, UX-42 and UX-45, all known.
  - `[A-9]`, `[A-10]` and `[A-11]` pass; A-8 is known.
  - fix-phone-controls' UX-56 and UX-57 tests pass at every size.
- **The viz lane's items** (V-33, V-34, V-38, V-41 to V-44, V-46, V-48, UX-42, UX-45, A-8): their red tests still fail on
  this build, as the lead expects. Not re-filed.

### What works on phones (beta, today's crawl)
- **Top bar, all sizes:**
  - The company menu is a full-width popover (0 to the screen's width) at every phone width, with 15 boards and the
    BIG TECH group.
  - Its search with the keyboard up keeps the match on screen and a tap opens it ("netf" → Netflix at 352x355, 280x653,
    667x375 and 812x375).
  - The data badge reads "● Oct 16" below 400 px and "Snapshot · Oct 16" above. Its popover says "A saved snapshot, not
    a live read", with Download a spreadsheet (CSV), 44 px.
  - The CSV is text/csv: Meta 1,209 rows (1,208 and the header).
  - The theme cycles Light → Dark → System, and the body follows.
  - Chart, Map and Insights switch.
- **Beta label:** at 360 px and below the Beta pill hides, by design. The tagline says "Beta: adds 7 big-tech careers
  sites", or "melon·seek · Beta: …" from 320 px.
- **Quick chips:** a sideways scroller (693 px of chips in 144–257 px), all 44 px. Salary, Department, Location,
  Seniority and Remote open the filter sheet at their section; More opens its popover.
- **Filter sheet** (Amazon 280x653, Apple 352x355, Microsoft 667x375, Google 390x844):
  - a salary thumb drag ("$190K – Any", "Show 5,035 roles"); typing "250k" in Max;
  - "Only with pay", Remote, and the 44 px keyword chips (Responsibilities, Fit, Skills);
  - "Show N roles" equals the result every time (33, 5, 301, 45 roles);
  - Reset clears the hash; ✕ and hardware Back close it, with focus on Filters;
  - a tap on the typed-salary fields focuses them (16 px; 150x23 in a 172x55 label).
- **Results sheet:**
  - drags and handle taps go peek → half → full at every size;
  - flicks with timed events snap one further (round 3's guard passes);
  - the list lazy-loads (24 → 80–96 cards over 12 swipes) while the page never scrolls;
  - Map collapses it to peek;
  - on the Razr cover the half sheet shows 56 px of the first card, and a tap there opens it.
- **Chart:** a row-label tap gives a chip ("Machine Learning and AI (359)"). A circle tap gives "Technical Program
  Management · $197K–$246K (33)" at 280 px. A stacked Ranges row ("2 roles") gives both postings. Ranges draws 16–31
  rows.
- **Map:**
  - one-finger pan and pinch move the map and never the page (scroll 0,0, scale 1) at 352x355, 280x653, 667x375 and
    812x375;
  - a pin tap selects its area;
  - Juice recolours the pins (`mc=juice`);
  - **Remote** gives "Remote (N)" and N roles on all 7 boards at 390x844, and at 352x355, 280x653 and 667x375 (Amazon
    354, Apple 14, Google 68, Meta 91, Microsoft 357, NVIDIA 526, Netflix 99);
  - but some pins sit under the map's own controls: **M-50**.
- **Insights:** fields are 16 px and 44 px with no zoom on focus in the phone layout. Compare companies shows its tip
  and "Tap again"; the second tap switches boards. A skill row tap filters at once (`ks=Agents`).
- **Job page, every board:**
  - Back (76x44) and hardware Back close it, with focus back on the card; next and previous work ("2 of 22,179" and
    back);
  - Apply links to the board's own site;
  - Juice with "Family" recomputes ($160,100 → $141,000 in Seattle);
  - "Same role elsewhere" and the methodology link (`/melon-seek/beta/methodology/`) work;
  - but the Apply label wraps (**M-49**) and the meta line can leave a "·" (**M-51**).
- **Google:** 27 job families ("20 more departments ▾"). YouTube in the Company list gives "Show 162 roles" = 162 and
  `b=YouTube`; Group by Company draws 5 rows; all at 280 px.
- **Saved searches:** Save (44 px) shows its toast. "Google · YouTube 3 new" shows in the company menu. An Amazon saved
  search of 2,000 or more seen ids shows no count, by design (`SEEN_IDS_MAX`, as in round 3).
- **Surface Duo spanned with the hinge** (540–574 px):
  - the chart and the filter sheet are on the left screen, and the list and the job page on the right (574–1114);
  - no control or text sits on the hinge; the quick chips end at the left screen's edge with the fade;
  - a card tap opens its job page on the right.
- **Landscape** (667x375, 812x375, 844x390):
  - a one-row top bar, 120–134 px of chart, the half sheet with one card, and a 69 px job-page footer;
  - the keyboard checks pass;
  - safe-area insets (47/47/21) keep every control clear, except the sheet handle's full-width strip (noted in round 3).
- **Big boards, timed at load 6–9 (1x CPU, 390x844):**
  - Apple: sort 91 ms, a filter tap 126 ms, "Show N roles" → result 220 ms, card → job page 244 ms; list frames p50
    17 ms, p95 17 ms.
  - Microsoft: 109 / 143 / 233 / 158 ms; p95 17 ms.
  - Amazon: 198 / 164 / 244 / 275 ms; p95 17 ms, max 33 ms.
  - At 4x CPU and load 21–24: sorts 310–650 ms and filter taps 226–525 ms, all under a second.
- **Memory:** 3 rounds over Amazon, Google, Microsoft, NVIDIA, Meta and Apple through the company menu. The heap after
  GC goes 54.6 → 75 → 75.8 MB on Amazon and stays at 69–71 MB on Apple. DOM nodes stay at about 1,800 and listeners
  at 122.
- **Errors:** no page error and no console error on any run, other than the blocked other-host requests (map tiles;
  Anduril's live fetch on the main site).

### Bugs (ordered by severity)

Screenshots are in `docs/screenshots/qa-mobile-beta-4/`.

| ID | Sev | Device / orientation | Summary |
|---|---|---|---|
| M-52 | Medium | Touch phones wider than 860 px: iPhone Pro Max / Plus landscape (932x430, 926x428), Razr inner landscape 1005x412, Surface Duo spanned 1114x720 | They get the desktop layout: controls 26–38 px tall and fields at 13–14 px, so iOS Safari zooms into the search, the company search and every Insights field |
| M-50 | Low | 320x568, 280x653, Razr cover 352x355; Anduril also 812x375 | On the map's first view a price pin sits under the map's own legend or Remote button, and no tap reaches it (Apple's 358 Europe jobs, Meta's 197, Netflix's 38; Amazon's, Google's and Microsoft's South America on the Razr cover) |
| M-49 | Low | 280–393 px | The job page's "Apply on <Company>'s careers site" wraps: 2 lines up to 393 px (Microsoft) or 375 px (Amazon), 3 lines plus the host at 280 px. The footer grows from 69 to 83–101 px; on the Razr cover it takes 83 of 355 px |
| M-48 | Low | All phones | The card's "5 places" / "2 levels" line (UX-52's fix) is 11.5 px, under the 12 px floor, on every such card |
| M-51 | Low | All phones (390 and 360 tested) | A wrapping job-page meta line leaves its "·" at a line's end or start ("Product Marketing Management · Sales & Marketing ·" / "Full-time"); 3 of 56 top job pages |

#### M-52 (Medium): touch phones wider than 860 px get mouse-sized controls and fields that make iOS zoom
- **Device:** the iPhone 15 Pro Max in landscape (932x430, iOS UA; also every iPhone Plus or Pro Max in landscape at
  926–956 px), the Motorola razr inner screen in landscape (1005x412) and the Surface Duo spanned (1114x720). All three
  match `(pointer: coarse)` and `(hover: none)`. The iPhone 13 in landscape (844x390) gets the phone layout and is fine.
- **Repro:**
  1. Open `#c=apple` on a 932x430 touch screen with an iPhone UA.
  2. Measure the top bar, the chips and the fields, or tap the search box.
- **Expected:** the phone's sizes on a touch screen: controls at least 44 px, and fields at 16 px so iOS doesn't zoom
  on focus.
- **Actual** (the same on all three devices):
  - the Chart/Map/Insights buttons are 56x32, the badge 147x30, the theme 36x36, the company menu 158x36 and the search
    38 px tall at 14 px;
  - Filters and the quick chips are 34 px, the sort select 32 px at 13 px, the Group select 26 px at 12.5 px, and
    Clusters/Ranges 28 px;
  - in the company menu, the rows are 34 px and the search is 13 px;
  - in Insights, the Pay estimate field and its selects are 34 px at 13 px.
  - On an iPhone each of these fields zooms the page when focused.
- **Screenshots:** `wide-932x430-apple-menu.png`, `wide-932x430-apple-insights.png`, `wide-1005x412-apple-*.png`,
  `wide-1114x720-apple-*.png`, and `wide-844x390-apple-menu.png` (the phone layout, for comparison).
- **Cause:** `public/styles.css`. The 16 px fields and 44 px controls sit only in the `(max-width: 860px)` blocks.
  Above 860 px the only touch rule is the `(hover: none)` block at 1276, which removes hover looks. The dual-screen
  block at 1593 changes the layout, not the sizes. phone-sizes.mjs has no iPhone in landscape over 860 px, so the
  matrix never sees this.
- **Fix direction:** a `(pointer: coarse) and (min-width: 861px)` block with 44 px controls and 16 px fields, or the
  phone landscape layout for `(pointer: coarse) and (max-height: 500px)`. Also add the Pro Max landscape to POSTURES.
- **Test:** `Beta mobile QA 4: [M-52] …`.

#### M-50 (Low): map pins under the map's own legend or Remote button on small phones
- **Device:** 320x568 (iPhone SE 1st gen) and 280x653 (Fold folded): under the Pay|Juice legend. 352x355 (Razr cover):
  under the Remote button. Anduril (main site) at 280x653 and 812x375 too. 344 px and wider portrait phones are clear.
- **Repro:** open `#c=apple&m=map` at 320x568 and look for Europe's pin. Then tap where it is.
- **Expected:** the first view keeps every price pin clear of the map's own controls, so each one can be tapped.
- **Actual:** 11 pins on the first view can't be tapped:
  - Apple "358 jobs London, Munich and 35 more", Meta "197 jobs London, Singapore and 18 more" and Netflix "38 jobs
    Warsaw, London and 5 more", at 320x568 and 280x653, under the legend card. A tap there lands on the legend's
    Details button.
  - Amazon "371 jobs Sao Paulo, Belo Horizonte…", Google "18 jobs Buenos Aires and 2 more" and Microsoft "22 jobs Sao
    Paulo, Brasília…", under "🌐 Remote" on the Razr cover. A tap on them selects Remote.
  - Anduril at 280x653: Tokyo and "$204K 39 London, Dublin…"; at 812x375: Tokyo.
  - A pan uncovers them.
  - The sandbox's "Basemap unavailable" note is left out of these counts; real phones show tiles there.
- **Screenshots:** `pins-apple-320x568.png`, `pincover-280x653-meta.png`, `pincover-352x355-google.png`,
  `pins-anduril-280x653.png`, `pins-anduril-812x375.png`, `e2e-M-50-map-pins-*.png`.
- **Cause:** public/viz/map.js. The first view's fit doesn't pad for the overlays: the legend box at the top left
  (118 px of a 265 px map at 320x568) and, on short screens, the Remote button at the bottom left. fix-phone-sizes
  removed the zoom buttons on the Razr cover and noted that one of three pins stays hidden; this is the same rule at
  more sizes.
- **Test:** `Beta mobile QA 4: [M-50] …`.

#### M-49 (Low): the job page's Apply label wraps on most phones
- **Device:** every phone 393 px wide or narrower, depending on the company name.
- **Repro:** open the top-paid job on `#c=microsoft` at 390x844, or on `#c=amazon` at 375x812 or 280x653.
- **Expected:** fix-phone-text's rule: one line from 360 px up, two below. The host ("amazon.jobs") goes on its own
  line under the label.
- **Actual:**
  - "Apply on Microsoft's careers site" takes 2 lines at 393 and 390 px, and every board's label takes 2 lines at 360,
    344 and 320 px;
  - "Apply on Amazon's careers site" takes 2 lines at 375 px and 3 at 280 px ("Apply on / Amazon's / careers site /
    amazon.jobs", 80 px tall);
  - the footer grows from 69 to 83 px, or 101 px at 280; on the Razr cover it is 83 of 355 px (23%);
  - Apple and Netflix fit from 375 px up.
- **Screenshots:** `apply-390x844-microsoft.png`, `apply-375x812-amazon.png`, `apply-360x740-microsoft.png`,
  `apply-280x653-amazon.png`, `apply-352x355-amazon.png`.
- **Cause:** `public/app.js` drawerContent's footer (app.js:4773): "Apply on ${coName}'s careers site" with the host
  under it. A shorter label, such as "Apply" or "Apply on its site" with the host line, fits.
- **Test:** `Beta mobile QA 4: [M-49] …`.

#### M-48 (Low): "5 places" / "2 levels" under the pay pill is 11.5 px
- **Device:** all phones and widths (the rule has no phone override).
- **Repro:** open `#c=amazon&q=Senior%20Financial%20Analyst%2C%20Engineering%20Capex%20Analytics%20%26%20Planning` and
  look at the card's pay; or any NVIDIA or Microsoft "2 levels" card.
- **Expected:** text of at least 12 px (the phone floor; the badge label is the only other text under it, and it is a
  `font-size: 0` shell).
- **Actual:** `.sal-sub` is 11.5 px, in muted grey. It shows on the cards of postings with two or more posted ranges
  or levels: in this build Amazon 2,260, NVIDIA 887, Microsoft 413, Apple 391 and Google 8.
- **Screenshots:** `e2e-M-48-sal-sub-amazon-390.png`, `e2e-M-48-sal-sub-nvidia-280.png`.
- **Cause:** `public/styles.css:1383` (`.sal-sub { font-size: 11.5px }`), from fix-pay-at-place's UX-52 change.
- **Test:** `Beta mobile QA 4: [M-48] …`.

#### M-51 (Low): a "·" left at the end or start of a job-page meta line
- **Device:** all phones; 390x844 and 360x740 tested.
- **Repro:** open `#c=meta&job=meta%3A862605673369805` at 390x844, or Amazon's top-paid job at 360x740.
- **Expected:** a separator stays with the item after it, so no line starts or ends with "·".
- **Actual:**
  - "Hardware Development · Cloud Hardware Development ·" then "Full-time Director+" (Amazon at 360);
  - "Product Marketing Management · Sales & Marketing ·" then "Full-time" (Meta at 390);
  - "Non-Technical Project, Program and Product Management · ASIC" with the "·" starting the next line (Amazon).
  - 3 of 56 top job pages (8 per board) at each width.
- **Screenshots:** `sep-360-amazon-amazon-10573828.png`, `sep-390-meta-meta-862605673369805.png`,
  `e2e-M-51-meta-sep-*.png`.
- **Cause:** `public/app.js` `.d-meta` (4636 and 4784): each `.sep` is its own flex item, so a wrap can fall on either
  side of it. Wrapping each separator with the item after it (or `white-space: nowrap` on the pair) keeps it.
- **Test:** `Beta mobile QA 4: [M-51] …`.

### Coverage notes
- **Not testable here:** real WebKit or iOS Safari (the lead's webkit-phone.yml run covers them, above), a real
  keyboard (simulated as in the earlier passes), map tiles, live boards, and the history ledger's "N new".
- **Noted, not filed:**
  - In landscape, the Map tab is 42x44 and the tagline row takes 40 px (both noted in round 3).
  - The sheet handle is 20–28 px tall; the header around it takes the same taps.
  - On the Razr cover, Insights has 134 px between the two-row top bar and the peek row. The Pay estimate field starts
    half under the peek row; a swipe brings it up, and a tap then lifts it above the keyboard.
  - On Apple at 280x653, one map pan from the map's centre didn't move it, though pans from three other points did.
    Not reproduced elsewhere.
  - Chart row names and card department lines end in an ellipsis; a tap gives the whole name.
- **Timings** were taken at load 3–27, with other agents running. The big-board timings above were taken again at load
  6–9, after the lead asked. They are not a record.

### Suite results
| Suite | Tree | Result |
|---|---|---|
| `BETA_QA4_DIST=<my build> node scripts/e2e.js --grep='^Beta mobile QA 4'` (run alone, load 11–13) | `1ef0646` + this pass's files | **2/7 pass**: the 2 guards; the 5 failures are exactly `[M-48]` to `[M-52]` |
| The round-3 and lane groups: `--grep='^(Beta mobile QA\|Beta UX review 2\|\[A-[0-9]+\] beta a11y 2\|Beta viz review 2\|Fix touch tips\|Fix phone controls\|Phone matrix\|Fix phone text\|fix-pay-at-place)'`, every `*_DIST` set to my build (load 3–27) | `1ef0646` | **346/367 pass, 20 fail, 1 skipped.** The 20 are the lead's known set. 12 belong to fix-viz-5: A-8, V-33, V-34, V-38, V-41 to V-44, V-46, V-48, UX-42 and UX-45. UX-39 belongs to fix-phone-sizes. The other 7 are the known Amazon department-row cut (the phone-text guard at 360 light and dark, and at 280, 320, 344, 352x355 and 360x880). V-35 skipped: "no one-place row found", because fix-pay-at-place made one-place rows plain; its own `[V-35]` test passes. All 42 earlier beta mobile QA tests (rounds 1–3) pass |
| `phone-smoke.mjs --sizes all --engines chromium`, 7 boards | `1ef0646` | **133/133 ok**, exit 0 (load 3 → 10); dark copy 133/133 (load 18 → 24) |
| `npm test` | `1ef0646` + this pass's files, data links present | **1,244 tests: 1,196 pass, 3 fail, 45 todo** (the to-dos are open review findings). The 3 failures are timing tests at load 10–12: politeRequest's per-host spacing ("gaps 27,42"), PERF-1 (event loop 264 ms) and V15 (267 ms). Run alone at load 9–10, test/bigtech-polite.test.js and test/perf.test.js pass 13/13. This pass touched none of them (one new e2e file, two lines in scripts/e2e.js) |
| webkit-phone.yml run 39034080230 (the lead's) | `1ef0646` | **Green in every job**: Playwright WebKit iPhone profile, and Simulator Safari on the iPhone 13 mini, 16 and SE |

All browser runs used `NODE_PATH=<scratchpad>/pw/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.
