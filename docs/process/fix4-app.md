# Process log: fix4-app

## 1. Brief
Prompt: [prompts/fix4-app.md](prompts/fix4-app.md), plus three messages from the lead during the run
(rebase onto the data lane, 4ba65ba, then onto the chart and map lane, c5f783b; take UX-22's card side and
MR-1's wording; a new finding M-32, the iPhone SE keyboard). Goal: fix the app side of the beta review wave
of 2026-10-11 (security and accessibility A-1…A-7, V8, S-6; desktop QA D-33, D-35, D-37; UX review
UX-15…UX-35; methodology review MR-1…MR-18; viz review V-30, V-32) without new controls.
Owned: `public/app.js`, `public/index.html`, `public/styles.css`, `public/features/*` (not `payLocations`),
`scripts/methodology.js`, the methodology and share-page parts of `scripts/build-static.js`, the
`/methodology/` handler in `server/index.js`, and the named test files.

## 2. Inputs and sources
- docs/REVIEW.md "beta review 2026-10-11"; docs/QA.md "Full QA pass (desktop, beta) 2026-10-11";
  docs/process/ux-review-beta.md; docs/process/methodology-review-beta.md; docs/process/viz-review-beta.md.
- docs/CONTRACT.md "Fix wave 4 additions" (the data lane's `salary.ranges[].locations`, `salary.places`,
  `payLocations`, per-place Juice).
- docs/process/PLAYBOOK.md, docs/process/prompts/cycle/fix-lane.md, docs/strategy/ROADMAP.md §8.
- Tests: test/e2e/beta-a11y.e2e.js, beta-desktop-qa-2.e2e.js, beta-ux-review.e2e.js, beta-viz-review.e2e.js
  (V-30, V-32), test/beta-security-review.test.js (S-6), test/beta-methodology.test.js,
  test/e2e/webkit/ios-sim-menu.mjs (read only, for M-32), test/beta-build.test.js (the stable site's rules).

## 3. Decisions and rationale
1. **No new visible control.** Everything is text, a link inside existing text, or layout. The links added
   are "How pay is read", "How estimates work", "How we collect this", "Jul 2026 exchange rates" (all to
   the methodology guide), the Source link in the badge popover, and "Go to the main site" in the beta
   badge popover. D-35's link is a state card's button (the card already had one).
2. **UX-22 card.** With no Location filter a posting with several place ranges reads
   `$166K–325K · 3 places`, with "Pay by place: …" in its tooltip; under a Location filter it shows the
   range of the place picked (`pickedRange`, read from `salary.ranges[].locations`, defensive when a
   range has no places). The drawer gets one "Pay by place:" line under the headline and the "Multiple
   pay zones" chip is dropped for such postings. The chart, sort and stats still use the span (`_usd`).
3. **UX-31 / MR-17 chips:** "Multiple pay zones" → "Several pay ranges" (only when no level or place
   breakdown is shown); "Wide range (2.0×)" → "Top is 2× the bottom", "(across levels)" / "(across
   places)" when the span covers several ranges; "Single figure" → "One number, not a range"; "The top
   pay of" → "The highest pay of"; "Salary not listed" → "No pay listed"; "Only show jobs with salary"
   → "Only show roles with pay"; "Apple careers site" → "Apple’s careers site"; card "No salary" →
   "No pay listed"; "Offline" → "Couldn’t load". Levels say whose names they are ("IC: individual
   contributor; Microsoft’s own level names").
4. **UX-28, not done for levels and filter counts:** "Pay by level" keeps "$287.5K" because
   test/e2e/fix-beta-app.e2e.js [D-21] pins that exact text, and filter counts keep no separators because ten
   e2e tests in other lanes' files read them with `Number(text)`. The Juice note gets separators. The lead
   should decide whether D-21's text or UX-28's rounding wins. MR-17's level explanation is a separate line
   under "Pay by level", for the same reason.
5. **D-33:** a posting updated on the day it was listed shows "Updated N days ago" on the Listing block's
   clock (`ageDays`), so the two ages agree; anything else keeps `ago()`.
6. **D-35:** the main site's files must never name a beta company (test/beta-build.test.js), so the main
   site reads the beta copy's `api/companies.json` only when a link names a company it doesn't list, and
   shows "Apple is on the beta site" with a link only after that copy answered. **Flag for the lead:**
   test/beta-build.test.js "no link to the beta site" passes, but this is a runtime link from the main
   site to /beta/, which that test's rule forbids in files; D-35 asks for exactly this, for a visitor who
   already has a beta link. The path is built from `BETA_DIR = 'beta'`.
7. **MR-10:** the source link is the board's own page (ATS boards) or the careers site taken from the
   board's posting links (big tech), because the main site's app.js may not name a beta host. Times are
   "Oct 11, 2026, 07:59 UTC". The cadence row says "about every 6 hours (GitHub often starts it hours
   late)" for crawler boards.
8. **MR-11:** a popover note for Apple only ("Apple’s site lists a role once for each place …"); the
   listing count (6,094) is not in the snapshot, so no number is given.
9. **MR-14:** `cappedNote` shows the whole board's share when `jobsCapped.salaried` exists; the stats
   line says "show pay of the 5,000 kept (63% of all 22,415)". The field itself is a patch
   (`fix4-app-snapshot-salaried.diff`, scripts/snapshot.js is not mine).
10. **MR-9:** the dollars come from palette.js `juiceNetForScore`, the viz lane's file: patch
    `fix4-app-palette-grade-floor.diff` makes it the rounded-score threshold (Juicy $95K, Ripe $47K). The
    app needs no change once it lands; the map legend uses the live juice.js scale (viz lane).
11. **MR-12 / UX-30:** "left for one person in Cupertino (using San Jose’s rent and living costs, the
    nearest city with cost data)" whenever the scored city differs from the job's place.
12. **D-37:** the beta methodology pages and share pages say "melon·seek beta" in the title.
    test/beta-build.test.js requires the channel tag on the app page only, so they carry no
    `data-channel` (the D-37 test accepts either). The methodology page has no "Main site" link: each
    site's links must stay inside it (links-policy, the build refused it).
13. **A-3:** the reviewer's patch (micro label, no logo, company bar 240px) left "Microsoft" at 67/74 px
    with the 44px Beta tag; the company bar no longer shrinks in that query (the search box gives way)
    and the view switch has 6px padding, labels kept (QA UX-13).
14. **UX-23:** the beta tagline says what the beta adds; the badge popover says it in words with a link
    to the main site. The phone's "Saved Oct 11" label was tried and reverted: at 390px it cut "Apple" to
    "A…" (M-27); the shortest label stays the date, the spoken name says "saved snapshot".
15. **UX-35:** the Juice explainer goes away for the visit once a role is opened (no "What’s Juice?" link,
    to add no control).
16. **UX-34:** the list says "No roles match. See the message by the chart." on desktop (the chart has the
    one message and button); phones keep the full card because the chart is under the sheet. Save is
    hidden at 0 results unless the search is already saved.
17. **M-32:** Mobile Safari on the SE shrinks `innerHeight` with the keyboard, so "visual viewport under
    78% of innerHeight" never held and `kb-open` never applied (the sheet stayed at 82dvh = 449px). The
    keyboard is now judged against the tallest height seen with no field focused (also
    `documentElement.clientHeight`), with a 120px margin, and measured again 120, 350 and 700 ms after the
    last viewport event (one animation frame each). The existing `body.kb-open .popover` rule then puts
    the sheet at `--vvt` and caps it at `--vvh`.
18. **UX-19** test split by owner (top bar here; map controls are viz.css), and it now counts a mark's
    `::before` hit area, as the reviewer's own fix allowed ("a `::before` hit box") and as M-27's test does.
    A 44px box was tried first: it broke M-27's check that a tap 7px above the Beta tag and the logo still
    lands on them (test/e2e/fix-beta-app.e2e.js). The logo's hit area is now 44px wide too (was 34).
19. **Wording moved out of pinned lines:** the "How pay is read" link and MR-18's level caveat sit in their
    own lines, because test/e2e/ui.e2e.js and fix3-compare.e2e.js compare the pay caption and the comps
    note exactly; D-35 keeps D-19's title "This board isn’t on this site" and its "Choose a company" button.
20. **Tests changed outside my files** (wording only, intent kept): test/e2e/fix3-app.e2e.js accepts
    "No pay listed" beside "No salary"; test/e2e/fix3-compare.e2e.js accepts "The highest pay of". New:
    test/e2e/fix4-app.e2e.js (M-32), registered in scripts/e2e.js.
21. **Not changed because other lanes' tests pin the exact words:** `formatAsOf` day style ("11 Oct
    2026", test/refresh-derived.test.js), `accuracyLine` and `compstimateAsOfText` ("accuracy tested",
    test/features.test.js), "Pay from/for other countries isn't used" and its straight apostrophe
    (test/fix-estimates.test.js, test/fix3-compare.test.js). The accuracy line is explained next to it in
    the drawer instead.

## 4. Replayable steps
```
git checkout --detach b4d4c0f   # later rebased onto 4ba65ba, then c5f783b
ln -s /home/user/melon-seek/node_modules node_modules; ln -s /home/user/melon-seek/data/snapshots data/snapshots
mkdir -p data/beta && ln -s /home/user/melon-seek/data/beta/snapshots data/beta/snapshots
S=<scratchpad>/fix4-app
git worktree add --detach $S/base c5f783b-or-4ba65ba   # baseline build
node $S/base/scripts/build-static.js --out $S/dist-before
node scripts/build-static.js --out $S/dist-after; ln -s $S/dist-after dist
NODE_PATH=<scratchpad>/pw/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  BETA_QA_DIST=$S/dist-after E2E_DIST=$S/dist-after node scripts/e2e.js
rm data/snapshots data/beta/snapshots dist; MELON_BETA_SNAPSHOT_DIR=$S/empty-beta npm test
node $S/bin/shots.mjs <dist> docs/screenshots/fix4-app before|after   # 1440x900 and 390x844
bash scripts/cycle/shrink-screenshots.sh docs/screenshots/fix4-app
```

## 5. Verification
- **`npm test`**, no data links, `MELON_BETA_SNAPSHOT_DIR` an empty folder: before (c5f783b) 1,016 tests,
  960 pass, 0 fail, 7 skipped, 49 to-dos; after 1,016 tests, **966 pass, 0 fail**, 7 skipped, 43 to-dos (six
  to-dos now plain passing tests: MR-1 wording, MR-2 drawer, MR-2 Insights, MR-3 app links, MR-3 guide, S-6).
  With the MR-9 patch applied the whole suite also had 0 failures and MR-9 passes; with the MR-14 patch
  applied MR-14 passes. Their to-dos stay until the patches land.
- **Full e2e** (`scripts/e2e.js`, static build of this lane at `dist/` and `BETA_QA_DIST`): before (4ba65ba
  build) 261/301 passed, 36 failed, 4 skipped; the lead's run on c5f783b left only this lane's findings
  failing. After (this lane on c5f783b): **300/304 passed, 0 failed, 4 skipped** (304 = 301 + the two M-32
  tests + the UX-19 split). Every named test passes: A-1…A-7, V8, D-33, D-35, D-37, V-30, V-32, UX-15,
  UX-16, UX-18, UX-19 (both halves), UX-20, UX-21, M-32 (beta and main).
- M-32: red on the 4ba65ba build ("sheet 120-667 in a visual viewport 28-349, kb-open false"), green after.
  The iOS Simulator job (webkit-phone.yml) is the real gate and needs a push.
- Screenshots: docs/screenshots/fix4-app/ (`before-*` from the 4ba65ba build, `after-*` from this lane's
  build; Apple list, Apple "ESD Engineer" drawer, NVIDIA list, Microsoft Juice drawer, badge popover,
  Insights, the main site opened on Apple; each at 1440x900 and 390x844), shrunk 4,296 KB → 1,136 KB.

## 6. Known gaps and follow-ups
- MR-9 and MR-14 need the two patches (their to-dos stay `todo` until the lead applies them).
- MR-2 chart, UX-17, UX-19 map, UX-24 and the map Pay legend are the viz lane's.
- UX-27 partly: the badge, Listing and Updated use "Oct 11, 2026"; Insights and the Juice notes keep
  `formatAsOf` ("11 Oct 2026") because its tests pin it.
- UX-32: inverted NVIDIA job families ("Engineer, ASIC") are the department keys the chart and filters
  use; a display-only rename needs the data lane (or one label map shared with chart.js).
- MR-17: "blocked by CORS" is in public/api.js (not mine): patch `fix4-app-api-cors-words.diff`.
- M-32 can only be proved on the iOS Simulator job; the Chromium test fakes the SE's numbers.

## 7. Change log
- 2026-10-11 15:20 started on b4d4c0f; baseline build and e2e.
- 15:40 rebased onto 4ba65ba (data lane); UX-22 card side added.
- 16:30 rebased onto c5f783b (chart and map lane); MR-2 wording follows the chart's ("Jul 2026 exchange rates", linked).
- 16:40 M-32 fix and test.
- 17:00–19:30 full e2e: pinned texts kept (D-21, pay caption, comps note, D-19), UX-19 by hit area, badge label kept short; final run 300/304, 0 failed.
